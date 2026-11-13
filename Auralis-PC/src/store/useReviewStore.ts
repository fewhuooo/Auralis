import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  useReviewApi,
  type ReviewStateView,
  type LifecycleHistoryResponse,
  type EffectiveReviewView,
  type LifecycleCommandBase,
  type LifecycleCommandResponse,
  type LifecycleRating,
  type LifecycleStateView,
  type LearningCompletionRequest,
  type LearningReopenRequest,
  type ReviewAttemptRequest,
} from '@/api/useReviewApi'
import type { ReviewSchedulingBaseline } from '@/services/reviewLifecycleEngine'
import { ApiProblemError } from '@/api/httpError'
import { SyncScopeChangedError, type SyncRequestScopeTicket } from '@/api/request'
import { useAuthStore } from '@/store/useAuthStore'
import { mapReviewStateView, type ReviewStateModel } from '@/services/domainMappers'

interface SessionIdentity {
  userId: string
  deviceId: string
  sessionId: string
}

interface ReviewScopeTicket extends SyncRequestScopeTicket, SessionIdentity {
  generation: number
}

export type LifecycleReviewPhase = 'REVIEW_RECALL' | 'REVIEW_CHECK' | 'LEARNING_READ' | 'LEARNING_RECALL' | 'LEARNING_CHECK' | 'FUZZY_RECALL' | 'FUZZY_CHECK' | 'GROUP_COMPLETE'

export type LifecycleReviewStateModel = ReviewStateModel & Pick<LifecycleStateView,
  'knowledgeBlockVersion' | 'needsLearning' | 'mastered' | 'stableSuccessCount' | 'nextReviewStage'
  | 'lastPracticeAt' | 'lastReviewId' | 'pendingReviewId' | 'contentHash'
> & {
  pendingReviewRating?: LifecycleRating | null
  pendingReviewSelectedAt?: string | null
  pendingReviewBaseline?: ReviewSchedulingBaseline | null
  historyImported?: boolean
  persistedStatePresent?: boolean
  statePresenceKnown?: boolean
}

interface LifecyclePendingCommand {
  action: LifecycleCommandResponse['action']
  reviewId: string | null
  request: LifecycleCommandBase | ReviewAttemptRequest | LearningCompletionRequest | LearningReopenRequest
  initialRating?: LifecycleRating
  returnPhase?: LifecycleReviewPhase
  staleResponseDetected?: boolean
}

export interface LifecycleBlockProgress {
  rating: LifecycleRating
  selectedRating: LifecycleRating
  reviewId: string
  dueAt: string
  state: LifecycleReviewStateModel
  confirmed: boolean
  corrected: boolean
  learned: boolean
}

export interface LifecycleSubjectReviewRound {
  roundId: string
  subjectId: string
  scopeTicket: ReviewScopeTicket
  groupSize: 5 | 10
  knowledgeBlockVersions: Record<string, number>
  queue: string[]
  remainingIds: string[]
  firstGroupCount: number
  currentKnowledgeBlockId: string | null
  currentStartedAt: string
  phase: LifecycleReviewPhase
  currentReviewId: string | null
  currentRating: LifecycleRating | null
  currentMode: 'NORMAL' | 'FUZZY'
  pendingCommand: LifecyclePendingCommand | null
  pendingError: string | null
  conflictNeedsConfirmation: boolean
  progressByBlock: Record<string, LifecycleBlockProgress>
  fuzzyPendingIds: string[]
  fuzzyQueueIds: string[]
  fuzzyCompletedIds: string[]
  completedIds: string[]
}

function currentIdentity(authStore: ReturnType<typeof useAuthStore>): SessionIdentity | null {
  const userId = authStore.user?.id
  const deviceId = authStore.serverDeviceId
  const sessionId = authStore.sessionId
  if (!authStore.isAuthenticated || !userId || !deviceId || !sessionId) return null
  return { userId, deviceId, sessionId }
}

function sameIdentity(left: SessionIdentity | null, right: SessionIdentity | null): boolean {
  return left?.userId === right?.userId
    && left?.deviceId === right?.deviceId
    && left?.sessionId === right?.sessionId
}

function makeUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function assertStateView(view: ReviewStateView): asserts view is LifecycleStateView {
  if (typeof view.knowledgeBlockId !== 'string' || !view.knowledgeBlockId.trim()) {
    throw new Error('复习状态缺少知识块标识，未能加载完整列表。')
  }
  if (typeof view.dueAt !== 'string' || !Number.isFinite(Date.parse(view.dueAt))) {
    throw new Error('复习状态日期无效，未能加载完整列表。')
  }
  if (!Number.isInteger(view.version) || (view.version ?? -1) < 0) {
    throw new Error('复习状态版本无效，未能加载完整列表。')
  }
  const lifecycle = view as LifecycleStateView
  if (!Number.isInteger(lifecycle.knowledgeBlockVersion) || lifecycle.knowledgeBlockVersion < 0
    || typeof lifecycle.needsLearning !== 'boolean' || typeof lifecycle.mastered !== 'boolean'
    || !Number.isInteger(lifecycle.stableSuccessCount) || lifecycle.stableSuccessCount < 0 || lifecycle.stableSuccessCount > 3
    || !(lifecycle.nextReviewStage === null || lifecycle.nextReviewStage === 'EARLY_RECALL'
      || lifecycle.nextReviewStage === 'CROSS_DAY' || lifecycle.nextReviewStage === 'FINAL_VERIFICATION')
    || !(lifecycle.lastPracticeAt === null || (typeof lifecycle.lastPracticeAt === 'string' && Number.isFinite(Date.parse(lifecycle.lastPracticeAt))))
    || !(lifecycle.lastReviewId === null || typeof lifecycle.lastReviewId === 'string')
    || !(lifecycle.pendingReviewId === null || typeof lifecycle.pendingReviewId === 'string')
    || (lifecycle.contentHash !== null && !/^[0-9a-f]{64}$/.test(lifecycle.contentHash))) {
    throw new Error('复习生命周期状态不完整，未能加载完整列表。')
  }
}

function mapLifecycleStateView(view: LifecycleStateView): LifecycleReviewStateModel {
  const metadata = view as LifecycleStateView & {
    pendingReviewRating?: LifecycleRating | null
    pendingReviewSelectedAt?: string | null
    pendingReviewBaseline?: ReviewSchedulingBaseline | null
    historyImported?: boolean
    persistedStatePresent?: boolean
    statePresenceKnown?: boolean
  }
  return {
    ...mapReviewStateView(view),
    knowledgeBlockVersion: view.knowledgeBlockVersion,
    needsLearning: view.needsLearning,
    mastered: view.mastered,
    stableSuccessCount: view.stableSuccessCount,
    nextReviewStage: view.nextReviewStage,
    lastPracticeAt: view.lastPracticeAt,
    lastReviewId: view.lastReviewId,
    pendingReviewId: view.pendingReviewId,
    contentHash: view.contentHash,
    pendingReviewRating: metadata.pendingReviewRating ?? null,
    pendingReviewSelectedAt: metadata.pendingReviewSelectedAt ?? null,
    pendingReviewBaseline: metadata.pendingReviewBaseline ?? null,
    historyImported: metadata.historyImported === true,
    persistedStatePresent: metadata.persistedStatePresent,
    statePresenceKnown: metadata.statePresenceKnown,
  }
}

function isLifecycleRating(value: unknown): value is LifecycleRating {
  return value === 'AGAIN' || value === 'HARD' || value === 'GOOD'
}

function instantMicros(value: string): number | null {
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return null
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d\d:\d\d$)/)?.[1] ?? ''
  return milliseconds * 1000 + Number(fraction.slice(3, 6).padEnd(3, '0'))
}

function hasValidSchedulingBaseline(value: EffectiveReviewView | null | undefined): boolean {
  const baseline = value?.schedulingBaseline as ReviewSchedulingBaseline | undefined
  return !!baseline
    && (baseline.dueAt === null || (typeof baseline.dueAt === 'string' && Number.isFinite(Date.parse(baseline.dueAt))))
    && typeof baseline.mastered === 'boolean'
    && Number.isInteger(baseline.stableSuccessCount) && baseline.stableSuccessCount >= 0 && baseline.stableSuccessCount <= 3
    && (baseline.nextReviewStage === null || baseline.nextReviewStage === 'EARLY_RECALL'
      || baseline.nextReviewStage === 'CROSS_DAY' || baseline.nextReviewStage === 'FINAL_VERIFICATION')
    && (baseline.lastPracticeAt === null || (typeof baseline.lastPracticeAt === 'string' && Number.isFinite(Date.parse(baseline.lastPracticeAt))))
    && Number.isFinite(baseline.stability)
}

function assertEffectiveReviewView(value: unknown): asserts value is EffectiveReviewView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('复习历史缺少有效结果。')
  const review = value as Record<string, unknown>
  const validDate = (item: unknown) => typeof item === 'string' && Number.isFinite(Date.parse(item))
  const validResolution = review.resolution === null || review.resolution === 'AGAIN_SELECTED'
    || review.resolution === 'CONFIRMED' || review.resolution === 'CORRECTED_AGAIN' || review.resolution === 'SUPERSEDED'
  if (typeof review.reviewId !== 'string' || !review.reviewId
    || !isLifecycleRating(review.selectedRating)
    || (review.effectiveRating !== null && !isLifecycleRating(review.effectiveRating))
    || !validDate(review.selectedAt)
    || (review.resolvedAt !== null && !validDate(review.resolvedAt))
    || !validResolution
    || Object.prototype.hasOwnProperty.call(review, 'rating')) {
    throw new Error('复习历史结果不完整。')
  }
}

export const useReviewStore = defineStore('review', () => {
  const authStore = useAuthStore()

  const subjectStatesBySubjectId = ref<Record<string, LifecycleReviewStateModel[]>>({})
  const subjectStatesLoadedBySubjectId = ref<Record<string, boolean>>({})
  const subjectStatesLoadingBySubjectId = ref<Record<string, boolean>>({})
  const subjectStatesErrorBySubjectId = ref<Record<string, string | null>>({})
  const reviewConflictsBySubjectId = ref<Record<string, string[]>>({})
  const groupSizeBySubjectId = ref<Record<string, 5 | 10>>({})
  const lifecycleRoundsBySubjectId = ref<Record<string, LifecycleSubjectReviewRound>>({})
  const lifecycleHistoryBySubjectBlock = ref<Record<string, LifecycleHistoryResponse>>({})
  const historyLoadingBySubjectBlock = ref<Record<string, boolean>>({})
  const historyErrorBySubjectBlock = ref<Record<string, string | null>>({})

  let scopeGeneration = 0
  const stateRequestVersions = new Map<string, number>()
  const historyRequestVersions = new Map<string, number>()
  const issuedScopeTickets = new WeakSet<object>()
  const activeBlockIdsBySubject = new Map<string, Set<string>>()
  const pendingLifecycleRequestBySubject = new Map<string, { roundId: string; clientCommandId: string; promise: Promise<LifecycleCommandResponse> }>()

  function clearSessionBoundState(): void {
    subjectStatesBySubjectId.value = {}
    subjectStatesLoadedBySubjectId.value = {}
    subjectStatesLoadingBySubjectId.value = {}
    subjectStatesErrorBySubjectId.value = {}
    reviewConflictsBySubjectId.value = {}
    groupSizeBySubjectId.value = {}
    lifecycleRoundsBySubjectId.value = {}
    lifecycleHistoryBySubjectBlock.value = {}
    historyLoadingBySubjectBlock.value = {}
    historyErrorBySubjectBlock.value = {}
    stateRequestVersions.clear()
    historyRequestVersions.clear()
    activeBlockIdsBySubject.clear()
    pendingLifecycleRequestBySubject.clear()
  }

  let observedIdentity = currentIdentity(authStore)
  watch(
    () => currentIdentity(authStore),
    (identity) => {
      if (!sameIdentity(identity, observedIdentity)) {
        observedIdentity = identity
        scopeGeneration += 1
        clearSessionBoundState()
      }
    },
    { flush: 'sync' },
  )

  function createScopeTicket(): ReviewScopeTicket {
    const identity = currentIdentity(authStore)
    if (!identity) throw new SyncScopeChangedError()
    const generation = scopeGeneration
    const key = Symbol('subject-review-scope')
    const ticket: ReviewScopeTicket = {
      ...identity,
      generation,
      key,
      isCurrent: () => {
        const current = currentIdentity(authStore)
        return scopeGeneration === generation && sameIdentity(current, identity)
      },
    }
    issuedScopeTickets.add(ticket)
    return ticket
  }

  function assertCurrent(ticket: SyncRequestScopeTicket): void {
    if (!ticket.isCurrent()) throw new SyncScopeChangedError()
  }

  function isSubjectStatesLoaded(subjectId: string): boolean {
    return subjectStatesLoadedBySubjectId.value[subjectId] === true
  }

  function captureScopeTicket(): SyncRequestScopeTicket {
    return createScopeTicket()
  }

  function clearDeletedSubject(subjectId: string, ticket: SyncRequestScopeTicket): boolean {
    if (!subjectId || !issuedScopeTickets.has(ticket) || !ticket.isCurrent()) return false
    const scope = ticket as ReviewScopeTicket
    if (scope.generation !== scopeGeneration || !sameIdentity(currentIdentity(authStore), scope)) return false

    nextStateRequestVersion(subjectId)
    delete subjectStatesBySubjectId.value[subjectId]
    delete subjectStatesLoadedBySubjectId.value[subjectId]
    delete subjectStatesLoadingBySubjectId.value[subjectId]
    delete subjectStatesErrorBySubjectId.value[subjectId]
    delete groupSizeBySubjectId.value[subjectId]
    delete lifecycleRoundsBySubjectId.value[subjectId]
    activeBlockIdsBySubject.delete(subjectId)
    pendingLifecycleRequestBySubject.delete(subjectId)

    const prefix = `${subjectId}\u0000`
    for (const key of historyRequestVersions.keys()) {
      if (key.startsWith(prefix)) historyRequestVersions.set(key, (historyRequestVersions.get(key) ?? 0) + 1)
    }
    for (const key of Object.keys(lifecycleHistoryBySubjectBlock.value)) {
      if (!key.startsWith(prefix)) continue
      delete lifecycleHistoryBySubjectBlock.value[key]
      delete historyLoadingBySubjectBlock.value[key]
      delete historyErrorBySubjectBlock.value[key]
    }
    return true
  }

  function stateRequestVersion(subjectId: string): number {
    return stateRequestVersions.get(subjectId) ?? 0
  }

  function nextStateRequestVersion(subjectId: string): number {
    const version = stateRequestVersion(subjectId) + 1
    stateRequestVersions.set(subjectId, version)
    return version
  }

  async function loadSubjectStates(subjectId: string): Promise<LifecycleReviewStateModel[]> {
    const ticket = createScopeTicket()
    const requestVersion = nextStateRequestVersion(subjectId)
    subjectStatesLoadedBySubjectId.value[subjectId] = false
    subjectStatesLoadingBySubjectId.value[subjectId] = true
    subjectStatesErrorBySubjectId.value[subjectId] = null
    const isLatest = () => stateRequestVersion(subjectId) === requestVersion
    try {
      const { localDb, getLocalSqlDatabase, getLocalRepository } = await import('@/services/localDb')
      const { LocalReviewService } = await import('@/services/localReviewService')
      await localDb.init()
      const localRepository = await getLocalRepository(ticket.userId, ticket.deviceId)
      const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)

      assertCurrent(ticket)
      const response = await localService.getSubjectStates(ticket.userId, ticket.deviceId, subjectId)
      assertCurrent(ticket)

      const accumulated = response.items || []
      const knownIds = new Set<string>()
      for (const view of accumulated) {
        assertStateView(view)
        knownIds.add(view.knowledgeBlockId)
      }
      assertCurrent(ticket)
      if (!isLatest()) throw new SyncScopeChangedError()
      const activeIds = activeBlockIdsBySubject.get(subjectId)
      const mapped = (accumulated as unknown as LifecycleStateView[])
        .filter((view) => !activeIds || activeIds.has(view.knowledgeBlockId))
        .map(mapLifecycleStateView)
        .filter((item) => item.knowledgeBlockId)
      subjectStatesBySubjectId.value[subjectId] = mapped
      subjectStatesLoadedBySubjectId.value[subjectId] = true
      return mapped
    } catch (error) {
      if (ticket.isCurrent() && isLatest()) {
        subjectStatesErrorBySubjectId.value[subjectId] = error instanceof Error ? error.message : '复习状态加载失败。'
      }
      throw error
    } finally {
      if (ticket.isCurrent() && isLatest()) subjectStatesLoadingBySubjectId.value[subjectId] = false
    }
  }

  function subjectBlockKey(subjectId: string, knowledgeBlockId: string): string {
    return `${subjectId}\u0000${knowledgeBlockId}`
  }

  function getGroupSize(subjectId: string): 5 | 10 {
    return groupSizeBySubjectId.value[subjectId] ?? 5
  }

  function setGroupSize(subjectId: string, groupSize: 5 | 10): void {
    if (groupSize !== 5 && groupSize !== 10) throw new Error('每组知识块数量只能是 5 或 10。')
    groupSizeBySubjectId.value[subjectId] = groupSize
    const lifecycleRound = lifecycleRoundsBySubjectId.value[subjectId]
    if (lifecycleRound?.scopeTicket.isCurrent()) lifecycleRound.groupSize = groupSize
  }

  function reconcileSubjectBlocks(subjectId: string, knowledgeBlockIds: string[]): void {
    const activeIds = new Set(knowledgeBlockIds.filter(Boolean))
    activeBlockIdsBySubject.set(subjectId, activeIds)
    const historyPrefix = `${subjectId}\u0000`
    for (const key of [...historyRequestVersions.keys()]) {
      if (!key.startsWith(historyPrefix) || activeIds.has(key.slice(historyPrefix.length))) continue
      historyRequestVersions.set(key, (historyRequestVersions.get(key) ?? 0) + 1)
      delete lifecycleHistoryBySubjectBlock.value[key]
      delete historyLoadingBySubjectBlock.value[key]
      delete historyErrorBySubjectBlock.value[key]
    }
    if (subjectStatesLoadedBySubjectId.value[subjectId]) {
      subjectStatesBySubjectId.value[subjectId] = (subjectStatesBySubjectId.value[subjectId] ?? [])
        .filter((state) => activeIds.has(state.knowledgeBlockId))
    }

    const lifecycleRound = lifecycleRoundsBySubjectId.value[subjectId]
    if (lifecycleRound) {
      const previousId = lifecycleRound.currentKnowledgeBlockId
      lifecycleRound.queue = lifecycleRound.queue.filter((id) => activeIds.has(id))
      lifecycleRound.remainingIds = lifecycleRound.remainingIds.filter((id) => activeIds.has(id))
      lifecycleRound.fuzzyPendingIds = lifecycleRound.fuzzyPendingIds.filter((id) => activeIds.has(id))
      lifecycleRound.fuzzyQueueIds = lifecycleRound.fuzzyQueueIds.filter((id) => activeIds.has(id))
      lifecycleRound.fuzzyCompletedIds = lifecycleRound.fuzzyCompletedIds.filter((id) => activeIds.has(id))
      lifecycleRound.completedIds = lifecycleRound.completedIds.filter((id) => activeIds.has(id))
      for (const id of Object.keys(lifecycleRound.progressByBlock)) {
        if (!activeIds.has(id)) delete lifecycleRound.progressByBlock[id]
      }
      for (const id of Object.keys(lifecycleRound.knowledgeBlockVersions)) {
        if (!activeIds.has(id)) delete lifecycleRound.knowledgeBlockVersions[id]
      }
      if (lifecycleRound.pendingCommand && !activeIds.has(lifecycleRound.pendingCommand.request.knowledgeBlockId)) {
        lifecycleRound.pendingCommand = null
        lifecycleRound.pendingError = null
        lifecycleRound.conflictNeedsConfirmation = false
      }
      if ((lifecycleRound.queue[0] ?? null) !== previousId) updateLifecycleCurrent(lifecycleRound)
      if (activeIds.size === 0) delete lifecycleRoundsBySubjectId.value[subjectId]
    }

  }

  function lifecycleStateFor(subjectId: string, knowledgeBlockId: string): LifecycleReviewStateModel | undefined {
    return subjectStatesBySubjectId.value[subjectId]?.find((state) => state.knowledgeBlockId === knowledgeBlockId)
  }

  function lifecyclePhaseFor(round: LifecycleSubjectReviewRound, knowledgeBlockId: string): LifecycleReviewPhase {
    if (round.currentMode === 'FUZZY') return 'FUZZY_RECALL'
    const state = lifecycleStateFor(round.subjectId, knowledgeBlockId)
    return !state || state.needsLearning ? 'LEARNING_READ' : 'REVIEW_RECALL'
  }

  function updateLifecycleCurrent(round: LifecycleSubjectReviewRound): void {
    const currentId = round.queue[0] ?? null
    round.currentKnowledgeBlockId = currentId
    round.currentStartedAt = new Date().toISOString()
    const currentState = currentId ? lifecycleStateFor(round.subjectId, currentId) : undefined
    const savedSelection = currentState?.pendingReviewId && currentState.pendingReviewRating && currentState.pendingReviewBaseline
      ? {
          rating: currentState.pendingReviewRating,
          selectedRating: currentState.pendingReviewRating,
          reviewId: currentState.pendingReviewId,
          dueAt: currentState.dueAt ?? '',
          state: currentState,
          confirmed: false,
          corrected: false,
          learned: false,
        }
      : null
    if (currentId && savedSelection && !round.progressByBlock[currentId]) round.progressByBlock[currentId] = savedSelection
    round.currentReviewId = currentId
      ? round.progressByBlock[currentId]?.reviewId ?? currentState?.pendingReviewId ?? null
      : null
    round.currentRating = currentId
      ? round.progressByBlock[currentId]?.rating ?? currentState?.pendingReviewRating ?? null
      : null
    round.phase = currentId
      ? savedSelection || (currentState?.pendingReviewId && round.progressByBlock[currentId])
        ? 'REVIEW_CHECK'
        : lifecyclePhaseFor(round, currentId)
      : 'GROUP_COMPLETE'
  }

  function startLifecycleRound(input: {
    subjectId: string
    knowledgeBlocks: Array<{ id: string; version: number }>
    groupSize: 5 | 10
    now?: Date
    manualMode?: 'MASTERED_REVIEW' | 'EARLY_PRACTICE' | 'VOLUNTARY'
    manualBlockIds?: string[]
  }): LifecycleSubjectReviewRound {
    const ticket = createScopeTicket()
    if (!isSubjectStatesLoaded(input.subjectId)) throw new Error('请先完整加载复习状态，再开始本轮。')
    const existing = lifecycleRoundsBySubjectId.value[input.subjectId]
    if (existing?.scopeTicket.isCurrent()) {
      const isCompleted = !existing.queue.length && !existing.remainingIds.length && !existing.fuzzyPendingIds.length
      if (input.manualMode === 'VOLUNTARY' || isCompleted) {
        delete lifecycleRoundsBySubjectId.value[input.subjectId]
      } else {
        return existing
      }
    }
    if (input.groupSize !== 5 && input.groupSize !== 10) throw new Error('每组知识块数量只能是 5 或 10。')

    const knownActiveIds = activeBlockIdsBySubject.get(input.subjectId)
    const uniqueBlocks = new Map<string, { id: string; version: number }>()
    for (const block of input.knowledgeBlocks) {
      if (!block.id) continue
      const version = Number.isInteger(block.version) && block.version >= 0 ? block.version : 1
      if (input.manualMode !== 'VOLUNTARY' && knownActiveIds && !knownActiveIds.has(block.id)) continue
      if (!uniqueBlocks.has(block.id)) uniqueBlocks.set(block.id, { id: block.id, version })
    }
    const manualIds = new Set(input.manualBlockIds ?? [])
    const now = (input.now ?? new Date()).getTime()
    const eligible = [...uniqueBlocks.values()].filter((block) => {
      if (input.manualMode === 'VOLUNTARY') {
        const state = lifecycleStateFor(input.subjectId, block.id)
        if (!state || state.needsLearning) return false
        return manualIds.size === 0 || manualIds.has(block.id)
      }
      const state = lifecycleStateFor(input.subjectId, block.id)
      if (state && state.knowledgeBlockVersion !== block.version) return false
      if (state?.pendingReviewId && state.pendingReviewRating && state.pendingReviewBaseline) return true
      if (input.manualMode === 'MASTERED_REVIEW') return manualIds.has(block.id) && state?.mastered === true
      if (input.manualMode === 'EARLY_PRACTICE') {
        if (!manualIds.has(block.id) || !state || state.needsLearning || state.mastered) return false
        const dueAt = Date.parse(state.dueAt ?? '')
        return Number.isFinite(dueAt) && dueAt > now
      }
      if (manualIds.size) return manualIds.has(block.id) && state?.mastered === true
      if (!state || state.needsLearning) return true
      if (state.mastered) return false
      const dueAt = Date.parse(state.dueAt ?? '')
      return Number.isFinite(dueAt) && dueAt <= now
    })
    const selectedBlocks = input.manualMode || manualIds.size
      ? eligible
      : [
          ...eligible.filter((block) => {
            const state = lifecycleStateFor(input.subjectId, block.id)
            return !!state?.pendingReviewId && !!state.pendingReviewRating && !!state.pendingReviewBaseline
          }),
          ...eligible.filter((block) => {
            const state = lifecycleStateFor(input.subjectId, block.id)
            return !state || (state.needsLearning && !state.pendingReviewId)
          }),
          ...eligible.filter((block) => {
            const state = lifecycleStateFor(input.subjectId, block.id)
            return !!state && !state.needsLearning && !state.mastered
              && !(state.pendingReviewId && state.pendingReviewRating && state.pendingReviewBaseline)
          }).sort((left, right) => {
            const leftDueAt = Date.parse(lifecycleStateFor(input.subjectId, left.id)?.dueAt ?? '')
            const rightDueAt = Date.parse(lifecycleStateFor(input.subjectId, right.id)?.dueAt ?? '')
            return leftDueAt - rightDueAt
          }),
        ]
    const selected = selectedBlocks.map((block) => block.id)
    const queue = selected.slice(0, input.groupSize)
    if (!queue.length) throw new Error('没有可复习知识块，无法开始本轮。')
    groupSizeBySubjectId.value[input.subjectId] = input.groupSize
    const round: LifecycleSubjectReviewRound = {
      roundId: makeUuid(),
      subjectId: input.subjectId,
      scopeTicket: ticket,
      groupSize: input.groupSize,
      knowledgeBlockVersions: Object.fromEntries(eligible.map((block) => [block.id, block.version])),
      queue,
      remainingIds: selected.slice(input.groupSize),
      firstGroupCount: queue.length,
      currentKnowledgeBlockId: queue[0] ?? null,
      currentStartedAt: (input.now ?? new Date()).toISOString(),
      phase: 'GROUP_COMPLETE',
      currentReviewId: null,
      currentRating: null,
      currentMode: 'NORMAL',
      pendingCommand: null,
      pendingError: null,
      conflictNeedsConfirmation: false,
      progressByBlock: {},
      fuzzyPendingIds: [],
      fuzzyQueueIds: [],
      fuzzyCompletedIds: [],
      completedIds: [],
    }
    lifecycleRoundsBySubjectId.value[input.subjectId] = round
    updateLifecycleCurrent(round)
    return round
  }

  function getLifecycleRound(subjectId: string): LifecycleSubjectReviewRound | null {
    const round = lifecycleRoundsBySubjectId.value[subjectId]
    return round?.scopeTicket.isCurrent() ? round : null
  }

  function nextLifecycleGroup(subjectId: string): void {
    const round = getLifecycleRound(subjectId)
    if (!round || round.pendingCommand || round.queue.length) return
    if (round.fuzzyPendingIds.length) {
      round.queue = [...round.fuzzyPendingIds]
      round.fuzzyQueueIds = [...round.fuzzyPendingIds]
      round.fuzzyPendingIds = []
      round.currentMode = 'FUZZY'
    } else if (round.remainingIds.length) {
      round.queue = round.remainingIds.slice(0, round.groupSize)
      round.remainingIds = round.remainingIds.slice(round.groupSize)
      round.firstGroupCount = round.queue.length
      round.currentMode = 'NORMAL'
    } else {
      return
    }
    updateLifecycleCurrent(round)
  }

  function updateCachedState(subjectId: string, state: ReviewStateModel): void {
    const wasComplete = isSubjectStatesLoaded(subjectId)
    nextStateRequestVersion(subjectId)
    subjectStatesLoadingBySubjectId.value[subjectId] = false
    const current = subjectStatesBySubjectId.value[subjectId] ?? []
    const previous = current.find((item) => item.knowledgeBlockId === state.knowledgeBlockId)
    const raw = state as ReviewStateModel & Partial<LifecycleReviewStateModel>
    const mapped: LifecycleReviewStateModel = {
      ...state,
      knowledgeBlockVersion: raw.knowledgeBlockVersion ?? previous?.knowledgeBlockVersion ?? 0,
      needsLearning: raw.needsLearning ?? previous?.needsLearning ?? false,
      mastered: raw.mastered ?? previous?.mastered ?? false,
      stableSuccessCount: raw.stableSuccessCount ?? previous?.stableSuccessCount ?? 0,
      nextReviewStage: raw.nextReviewStage !== undefined ? raw.nextReviewStage : previous?.nextReviewStage ?? null,
      lastPracticeAt: raw.lastPracticeAt !== undefined ? raw.lastPracticeAt : previous?.lastPracticeAt ?? null,
      lastReviewId: raw.lastReviewId !== undefined ? raw.lastReviewId : previous?.lastReviewId ?? null,
      pendingReviewId: raw.pendingReviewId !== undefined ? raw.pendingReviewId : previous?.pendingReviewId ?? null,
      contentHash: raw.contentHash !== undefined ? raw.contentHash : previous?.contentHash ?? null,
      historyImported: raw.historyImported ?? previous?.historyImported ?? false,
    }
    const found = current.some((item) => item.knowledgeBlockId === state.knowledgeBlockId)
    subjectStatesBySubjectId.value[subjectId] = found
      ? current.map((item) => item.knowledgeBlockId === state.knowledgeBlockId ? mapped : item)
      : [...current, mapped]
    subjectStatesLoadedBySubjectId.value[subjectId] = wasComplete
    if (!wasComplete) {
      subjectStatesErrorBySubjectId.value[subjectId] = '复习状态尚未完整加载，请刷新后再开始本轮。'
    }
  }

  function lifecycleCommandBase(round: LifecycleSubjectReviewRound, blockId: string, contentHash: string): LifecycleCommandBase {
    if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error('知识块正文校验值无效，无法提交复习。')
    const knowledgeBlockVersion = round.knowledgeBlockVersions[blockId]
    if (!Number.isInteger(knowledgeBlockVersion) || knowledgeBlockVersion < 0) throw new Error('知识块版本尚未确认，无法提交复习。')
    const state = lifecycleStateFor(round.subjectId, blockId)
    if (state && state.knowledgeBlockVersion !== knowledgeBlockVersion) throw new Error('知识块内容已变化，请同步并刷新后重新开始。')
    if (!state || typeof state.persistedStatePresent !== 'boolean') {
      throw new Error('本地复习状态尚未加载，无法确认本地初始状态。')
    }
    return {
      clientCommandId: makeUuid(),
      knowledgeBlockId: blockId,
      knowledgeBlockVersion,
      baseVersion: state?.version ?? 0,
      contentHash,
      expectedStateAbsent: !state.persistedStatePresent,
    }
  }

  function assertLifecycleResponse(
    response: LifecycleCommandResponse,
    pending: LifecyclePendingCommand,
  ): asserts response is LifecycleCommandResponse & { state: LifecycleStateView } {
    const request = pending.request
    if (!response || typeof response !== 'object'
      || typeof response.commandId !== 'string' || !response.commandId
      || response.clientCommandId !== request.clientCommandId
      || response.action !== pending.action
      || typeof response.occurredAt !== 'string' || !Number.isFinite(Date.parse(response.occurredAt))
      || instantMicros(response.occurredAt) !== instantMicros((request as any).occurredAt)
      || response.knowledgeBlockVersion !== request.knowledgeBlockVersion
      || !Object.prototype.hasOwnProperty.call(response, 'effectiveReview')
      || !response.state || response.state.knowledgeBlockId !== request.knowledgeBlockId) {
      throw new Error('复习操作回执无效；请原样重试以确认结果。')
    }
    assertStateView(response.state)
    const expectedStateVersion = request.baseVersion + (request.expectedStateAbsent ? 0 : 1)
    if (response.state.version !== expectedStateVersion) {
      throw new Error('复习操作回执版本与冻结请求不匹配；请原样重试以确认结果。')
    }
    if (response.effectiveReview !== null) assertEffectiveReviewView(response.effectiveReview)
    if (response.state.knowledgeBlockVersion !== request.knowledgeBlockVersion) {
      throw new Error('复习操作返回了不同版本的正文；请刷新后重新开始。')
    }
    if (pending.action === 'REVIEW_SELECTED') {
      if (pending.initialRating === 'AGAIN') {
        if (!response.state.needsLearning || response.effectiveReview?.reviewId !== pending.reviewId
          || response.effectiveReview.selectedRating !== 'AGAIN' || response.effectiveReview.effectiveRating !== 'AGAIN'
          || response.effectiveReview.resolution !== 'AGAIN_SELECTED' || !hasValidSchedulingBaseline(response.effectiveReview)) {
          throw new Error('忘记反馈尚未得到完整确认；请原样重试。')
        }
      } else if (response.state.pendingReviewId !== pending.reviewId
        || response.effectiveReview?.reviewId !== pending.reviewId
        || response.effectiveReview.selectedRating !== pending.initialRating
        || response.effectiveReview.effectiveRating !== null || response.effectiveReview.resolution !== null
        || !hasValidSchedulingBaseline(response.effectiveReview)) {
        throw new Error('复习初选回执缺少待确认记录；请原样重试。')
      }
    } else if (pending.action === 'REVIEW_CONFIRMED') {
      if (response.effectiveReview?.reviewId !== pending.reviewId
        || response.effectiveReview.effectiveRating !== response.effectiveReview.selectedRating
        || response.effectiveReview.resolution !== 'CONFIRMED' || !hasValidSchedulingBaseline(response.effectiveReview)) {
        throw new Error('复习核对尚未得到完整确认；请原样重试。')
      }
    } else if (pending.action === 'REVIEW_CORRECTED') {
      if (!response.state.needsLearning || response.effectiveReview?.reviewId !== pending.reviewId
        || response.effectiveReview.effectiveRating !== 'AGAIN'
        || response.effectiveReview.resolution !== 'CORRECTED_AGAIN' || !hasValidSchedulingBaseline(response.effectiveReview)) {
        throw new Error('复习纠正尚未得到完整确认；请原样重试。')
      }
    } else if (pending.action === 'LEARNING_COMPLETED' && response.state.needsLearning) {
      throw new Error('学习完成回执仍标记为待学习；请原样重试。')
    } else if (pending.action === 'LEARNING_REOPENED' && !response.state.needsLearning) {
      throw new Error('重新学习回执未标记为待学习；请原样重试。')
    }
  }

  function finishLifecycleCard(round: LifecycleSubjectReviewRound): void {
    const currentId = round.currentKnowledgeBlockId
    if (!currentId) return
    round.queue = round.queue.filter((id, index) => index !== 0 || id !== currentId)
    if (round.currentMode === 'FUZZY' && !round.fuzzyCompletedIds.includes(currentId)) {
      round.fuzzyCompletedIds.push(currentId)
    } else if (round.currentMode === 'NORMAL' && !round.completedIds.includes(currentId)) {
      round.completedIds.push(currentId)
    }
    updateLifecycleCurrent(round)
  }

  function applyLifecycleResponse(round: LifecycleSubjectReviewRound, pending: LifecyclePendingCommand, response: LifecycleCommandResponse): void {
    const currentRound = lifecycleRoundsBySubjectId.value[round.subjectId]
    if (currentRound?.roundId !== round.roundId || currentRound.pendingCommand?.request.clientCommandId !== pending.request.clientCommandId) return
    const blockId = pending.request.knowledgeBlockId
    const activeIds = activeBlockIdsBySubject.get(round.subjectId)
    if (activeIds && !activeIds.has(blockId)) return
    const cachedState = lifecycleStateFor(round.subjectId, blockId)
    if (cachedState && (cachedState.version > response.state.version
      || cachedState.knowledgeBlockVersion !== response.state.knowledgeBlockVersion)) {
      pending.staleResponseDetected = true
      currentRound.pendingError = '复习状态已在其他设备更新，请重新加载后确认本卡。'
      currentRound.conflictNeedsConfirmation = true
      return
    }
    const state = mapLifecycleStateView(response.state)
    updateCachedState(round.subjectId, state)
    currentRound.pendingCommand = null
    currentRound.pendingError = null
    currentRound.conflictNeedsConfirmation = false

    if (pending.action === 'REVIEW_SELECTED') {
      const rating = pending.initialRating as LifecycleRating
      const reviewId = pending.reviewId as string
      currentRound.currentReviewId = reviewId
      currentRound.currentRating = rating
      currentRound.progressByBlock[blockId] = {
        rating,
        selectedRating: rating,
        reviewId,
        dueAt: state.dueAt ?? '',
        state,
        confirmed: rating === 'AGAIN',
        corrected: false,
        learned: false,
      }
      if (rating === 'HARD' && !currentRound.fuzzyPendingIds.includes(blockId)) currentRound.fuzzyPendingIds.push(blockId)
      currentRound.phase = rating === 'AGAIN' ? 'LEARNING_READ' : 'REVIEW_CHECK'
      return
    }

    if (pending.action === 'REVIEW_CONFIRMED') {
      const previous = currentRound.progressByBlock[blockId]
      if (previous) currentRound.progressByBlock[blockId] = { ...previous, state, dueAt: state.dueAt ?? previous.dueAt, confirmed: true }
      if (currentRound.currentMode === 'FUZZY') {
        finishLifecycleCard(currentRound)
      } else {
        finishLifecycleCard(currentRound)
      }
      return
    }

    if (pending.action === 'REVIEW_CORRECTED') {
      const previous = currentRound.progressByBlock[blockId]
      if (previous) currentRound.progressByBlock[blockId] = { ...previous, rating: 'AGAIN', state, dueAt: state.dueAt ?? previous.dueAt, corrected: true }
      currentRound.currentRating = 'AGAIN'
      currentRound.phase = 'LEARNING_READ'
      return
    }

    if (pending.action === 'LEARNING_COMPLETED') {
      const previous = currentRound.progressByBlock[blockId]
      if (previous) currentRound.progressByBlock[blockId] = { ...previous, state, dueAt: state.dueAt ?? previous.dueAt, learned: true }
      finishLifecycleCard(currentRound)
      return
    }

    currentRound.currentRating = 'AGAIN'
    currentRound.phase = 'LEARNING_READ'
  }

  async function lifecycleApiCall(pending: LifecyclePendingCommand, ticket: ReviewScopeTicket, expectedSubjectId: string): Promise<LifecycleCommandResponse> {
    const request = { ...pending.request }
    if (pending.reviewId) (request as Record<string, unknown>).reviewId = pending.reviewId
    const { localDb, getLocalSqlDatabase, getLocalRepository } = await import('@/services/localDb')
    const { LocalReviewService } = await import('@/services/localReviewService')
    await localDb.init()
    const localRepository = await getLocalRepository(ticket.userId, ticket.deviceId)
    const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
    const action = pending.action
    const kbId = (request as any).knowledgeBlockId
    const clientCommandId = (request as any).clientCommandId
    const rating = (request as any).rating || null
    const occurredAt = (request as any).occurredAt as string
    const baseVersion = (request as any).baseVersion as number
    const contentHash = (request as any).contentHash || ''
    assertCurrent(ticket)
    return localService.executeCommand(ticket.userId, ticket.deviceId, kbId, clientCommandId, action, rating, occurredAt, baseVersion, contentHash, request, expectedSubjectId)
  }

  function sendLifecyclePending(round: LifecycleSubjectReviewRound): Promise<LifecycleCommandResponse> {
    const pending = round.pendingCommand
    if (!pending) return Promise.reject(new Error('当前没有待确认的复习操作。'))
    const clientCommandId = pending.request.clientCommandId
    const inFlight = pendingLifecycleRequestBySubject.get(round.subjectId)
    if (inFlight?.roundId === round.roundId && inFlight.clientCommandId === clientCommandId) return inFlight.promise
    const ticket = round.scopeTicket
    round.pendingError = null
    round.conflictNeedsConfirmation = false
    const promise = (async (): Promise<LifecycleCommandResponse> => {
      try {
        assertCurrent(ticket)
        const response = await lifecycleApiCall(pending, ticket, round.subjectId)
        assertCurrent(ticket)
        assertLifecycleResponse(response, pending)
        applyLifecycleResponse(round, pending, response)
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('auralis-review-local-updated', {
            detail: { userId: ticket.userId, deviceId: ticket.deviceId, sessionId: ticket.sessionId, subjectId: round.subjectId, knowledgeBlockId: pending.request.knowledgeBlockId },
          }))
          window.dispatchEvent(new CustomEvent('auralis-realtime-event', {
            detail: { type: 'REVIEW_UPDATED', userId: ticket.userId, deviceId: ticket.deviceId, sessionId: ticket.sessionId, knowledgeBlockId: pending.request.knowledgeBlockId },
          }))
        }
        return response
      } catch (error) {
        const currentRound = lifecycleRoundsBySubjectId.value[round.subjectId]
        if (ticket.isCurrent() && currentRound?.roundId === round.roundId
          && currentRound.pendingCommand?.request.clientCommandId === clientCommandId) {
          currentRound.pendingError = error instanceof Error ? error.message : '复习操作结果尚未确认。'
          currentRound.conflictNeedsConfirmation = error instanceof ApiProblemError
            && error.problem.code === 'RESOURCE_VERSION_CONFLICT'
        }
        throw error
      } finally {
        const latest = pendingLifecycleRequestBySubject.get(round.subjectId)
        if (latest?.roundId === round.roundId && latest.clientCommandId === clientCommandId) {
          pendingLifecycleRequestBySubject.delete(round.subjectId)
        }
      }
    })()
    pendingLifecycleRequestBySubject.set(round.subjectId, { roundId: round.roundId, clientCommandId, promise })
    return promise
  }

  function enqueueLifecycleCommand(
    round: LifecycleSubjectReviewRound,
    action: LifecycleCommandResponse['action'],
    reviewId: string | null,
    request: LifecyclePendingCommand['request'],
    initialRating?: LifecycleRating,
  ): Promise<LifecycleCommandResponse> {
    if (round.pendingCommand) throw new Error('当前操作尚未确认，请先原样重试或重新确认。')
    const frozenRequest = Object.freeze({
      ...request,
      occurredAt: (request as any).occurredAt ?? new Date().toISOString(),
      expectedStateAbsent: request.expectedStateAbsent,
    }) as LifecyclePendingCommand['request']
    round.pendingCommand = { action, reviewId, request: frozenRequest, initialRating }
    round.pendingError = null
    round.conflictNeedsConfirmation = false
    return sendLifecyclePending(round)
  }

  function selectLifecycleRating(subjectId: string, rating: LifecycleRating, contentHash: string, durationSeconds = 0): Promise<LifecycleCommandResponse> {
    const round = getLifecycleRound(subjectId)
    const blockId = round?.currentKnowledgeBlockId
    if (!round || !blockId || round.phase !== 'REVIEW_RECALL' || round.currentMode !== 'NORMAL') {
      throw new Error('当前知识块还不能选择复习结果。')
    }
    if (round.pendingCommand) throw new Error('当前复习初选尚未确认，请先原样重试。')
    const base = lifecycleCommandBase(round, blockId, contentHash)
    const reviewId = makeUuid()
    const request: ReviewAttemptRequest = {
      ...base,
      reviewId,
      rating,
      durationSeconds: Math.max(0, Math.floor(durationSeconds)),
    }
    return enqueueLifecycleCommand(round, 'REVIEW_SELECTED', reviewId, request, rating)
  }

  function beginLifecycleRecall(subjectId: string): void {
    const round = getLifecycleRound(subjectId)
    if (!round || round.phase !== 'LEARNING_READ') return
    round.phase = 'LEARNING_RECALL'
  }

  function revealLifecycleAnswer(subjectId: string): void {
    const round = getLifecycleRound(subjectId)
    if (!round) return
    if (round.phase === 'LEARNING_RECALL') round.phase = 'LEARNING_CHECK'
    else if (round.phase === 'FUZZY_RECALL') round.phase = 'FUZZY_CHECK'
  }

  function confirmLifecycleReview(subjectId: string, contentHash: string): Promise<LifecycleCommandResponse> | void {
    const round = getLifecycleRound(subjectId)
    const blockId = round?.currentKnowledgeBlockId
    if (!round || !blockId || !round.currentReviewId) throw new Error('当前没有可核对的复习记录。')
    if (round.phase === 'FUZZY_CHECK') {
      finishLifecycleCard(round)
      return
    }
    if (round.phase !== 'REVIEW_CHECK') throw new Error('请先展开正文核对复习内容。')
    const base = lifecycleCommandBase(round, blockId, contentHash)
    return enqueueLifecycleCommand(round, 'REVIEW_CONFIRMED', round.currentReviewId, base)
  }

  function correctLifecycleReview(subjectId: string, contentHash: string): Promise<LifecycleCommandResponse> {
    const round = getLifecycleRound(subjectId)
    const blockId = round?.currentKnowledgeBlockId
    if (!round || !blockId || !round.currentReviewId || !['REVIEW_CHECK', 'FUZZY_RECALL', 'FUZZY_CHECK'].includes(round.phase)) {
      throw new Error('当前没有可纠正的复习结果。')
    }
    const previous = round.progressByBlock[blockId]
    const action = round.currentMode === 'FUZZY' && previous?.corrected ? 'LEARNING_REOPENED' : 'REVIEW_CORRECTED'
    const base = lifecycleCommandBase(round, blockId, contentHash)
    return enqueueLifecycleCommand(
      round,
      action,
      round.currentReviewId,
      action === 'LEARNING_REOPENED' ? { ...base, reviewId: round.currentReviewId } : base,
    )
  }

  function failLifecycleLearning(subjectId: string): void {
    const round = getLifecycleRound(subjectId)
    if (!round || round.phase !== 'LEARNING_CHECK') return
    round.phase = 'LEARNING_READ'
  }

  function completeLifecycleLearning(subjectId: string, contentHash: string): Promise<LifecycleCommandResponse> {
    const round = getLifecycleRound(subjectId)
    const blockId = round?.currentKnowledgeBlockId
    if (!round || !blockId || round.phase !== 'LEARNING_CHECK') throw new Error('请先完成遮挡回忆并核对正文。')
    const base = lifecycleCommandBase(round, blockId, contentHash)
    const reviewId = round.currentReviewId ?? undefined
    const request: LearningCompletionRequest = { ...base, ...(reviewId ? { reviewId } : {}) }
    return enqueueLifecycleCommand(round, 'LEARNING_COMPLETED', reviewId ?? null, request)
  }

  function reopenCurrentLearning(subjectId: string, contentHash: string): Promise<LifecycleCommandResponse> {
    const round = getLifecycleRound(subjectId)
    const blockId = round?.currentKnowledgeBlockId
    if (!round || !blockId) throw new Error('当前没有可重新学习的知识块。')
    const state = lifecycleStateFor(subjectId, blockId)
    if (!state?.mastered) throw new Error('只有已掌握知识块可以从此处手动重开。')
    const base = lifecycleCommandBase(round, blockId, contentHash)
    return enqueueLifecycleCommand(round, 'LEARNING_REOPENED', null, base)
  }

  function retryLifecyclePending(subjectId: string): Promise<LifecycleCommandResponse> {
    const round = getLifecycleRound(subjectId)
    if (!round?.pendingCommand) throw new Error('当前没有待确认的复习操作。')
    if (round.conflictNeedsConfirmation) throw new Error('复习状态已变化，请先重新确认本次操作。')
    return sendLifecyclePending(round)
  }

  async function reconfirmLifecyclePending(subjectId: string): Promise<LifecycleCommandResponse | void> {
    const round = getLifecycleRound(subjectId)
    const pending = round?.pendingCommand
    if (!round || !pending || !round.conflictNeedsConfirmation) throw new Error('当前复习操作不需要重新确认。')
    const roundId = round.roundId
    const clientCommandId = pending.request.clientCommandId
    const blockId = pending.request.knowledgeBlockId
    const latestStates = await loadSubjectStates(subjectId)
    const latestRound = lifecycleRoundsBySubjectId.value[subjectId]
    if (!round.scopeTicket.isCurrent() || latestRound?.roundId !== roundId
      || latestRound.pendingCommand?.request.clientCommandId !== clientCommandId) throw new SyncScopeChangedError()
    let latest = latestStates.find((state) => state.knowledgeBlockId === blockId)
    const expectedKbVersion = round.knowledgeBlockVersions[blockId]
    const clearObsoleteRoundCard = (message: string): void => {
      latestRound.pendingCommand = null
      latestRound.pendingError = message
      latestRound.conflictNeedsConfirmation = false
      latestRound.currentReviewId = null
      latestRound.currentRating = null
      delete latestRound.progressByBlock[blockId]
      latestRound.fuzzyPendingIds = latestRound.fuzzyPendingIds.filter((id) => id !== blockId)
      latestRound.fuzzyQueueIds = latestRound.fuzzyQueueIds.filter((id) => id !== blockId)
      latestRound.phase = 'GROUP_COMPLETE'
    }
    if (latest && (latest.knowledgeBlockVersion !== expectedKbVersion
      || latest.contentHash !== pending.request.contentHash)) {
      clearObsoleteRoundCard('知识块正文已变化；旧正文操作已清除，请结束本轮并同步材料后重新开始。')
      return
    }
    if (pending.action === 'REVIEW_SELECTED' && latest?.pendingReviewId === pending.reviewId) {
      const responseState = latest
      latestRound.pendingCommand = null
      latestRound.pendingError = null
      latestRound.conflictNeedsConfirmation = false
      const rating = pending.initialRating as LifecycleRating
      latestRound.currentReviewId = pending.reviewId
      latestRound.currentRating = rating
      latestRound.progressByBlock[blockId] = {
        rating,
        selectedRating: rating,
        reviewId: pending.reviewId as string,
        dueAt: responseState.dueAt ?? '',
        state: responseState,
        confirmed: false,
        corrected: false,
        learned: false,
      }
      if (rating === 'HARD' && !latestRound.fuzzyPendingIds.includes(blockId)) latestRound.fuzzyPendingIds.push(blockId)
      latestRound.phase = 'REVIEW_CHECK'
      return
    }
    if (pending.action === 'REVIEW_SELECTED' && pending.initialRating === 'AGAIN'
      && latest?.lastReviewId === pending.reviewId && latest.needsLearning) {
      const rating = pending.initialRating
      latestRound.pendingCommand = null
      latestRound.pendingError = null
      latestRound.conflictNeedsConfirmation = false
      latestRound.currentReviewId = pending.reviewId
      latestRound.currentRating = rating
      latestRound.progressByBlock[blockId] = {
        rating,
        selectedRating: rating,
        reviewId: pending.reviewId as string,
        dueAt: latest.dueAt ?? '',
        state: latest,
        confirmed: true,
        corrected: false,
        learned: false,
      }
      latestRound.phase = 'LEARNING_READ'
      return
    }
    if (!latest) {
      clearObsoleteRoundCard('知识块已移出当前学科；旧操作已结束，请结束本轮后重新开始。')
      return
    }
    if (latest.knowledgeBlockVersion !== expectedKbVersion) {
      clearObsoleteRoundCard('知识块版本已变化；旧操作已结束，请同步材料后重新开始。')
      return
    }
    if (pending.staleResponseDetected) {
      const reviewId = pending.reviewId
      latestRound.pendingCommand = null
      latestRound.pendingError = null
      latestRound.conflictNeedsConfirmation = false

      if (pending.action === 'REVIEW_SELECTED' && reviewId && latest.pendingReviewId === reviewId) {
        latestRound.currentReviewId = reviewId
        latestRound.currentRating = pending.initialRating as LifecycleRating
        latestRound.progressByBlock[blockId] = {
          rating: pending.initialRating as LifecycleRating,
          selectedRating: pending.initialRating as LifecycleRating,
          reviewId,
          dueAt: latest.dueAt ?? '',
          state: latest,
          confirmed: false,
          corrected: false,
          learned: false,
        }
        latestRound.phase = 'REVIEW_CHECK'
        return
      }

      if (pending.action === 'REVIEW_SELECTED' && reviewId && latest.lastReviewId === reviewId && latest.needsLearning) {
        latestRound.currentReviewId = reviewId
        latestRound.currentRating = 'AGAIN'
        latestRound.progressByBlock[blockId] = {
          rating: 'AGAIN',
          selectedRating: pending.initialRating as LifecycleRating,
          reviewId,
          dueAt: latest.dueAt ?? '',
          state: latest,
          confirmed: true,
          corrected: false,
          learned: false,
        }
        latestRound.phase = 'LEARNING_READ'
        return
      }

      if ((pending.action === 'REVIEW_CORRECTED' || pending.action === 'LEARNING_REOPENED'
        || pending.action === 'LEARNING_COMPLETED') && latest.needsLearning) {
        latestRound.currentReviewId = reviewId
        latestRound.currentRating = 'AGAIN'
        latestRound.phase = 'LEARNING_READ'
        return
      }

      if (reviewId && latest.lastReviewId === reviewId && !latest.needsLearning) {
        const rating = pending.initialRating
          ?? latestRound.progressByBlock[blockId]?.rating
          ?? (latest.mastered ? 'GOOD' : 'AGAIN')
        latestRound.progressByBlock[blockId] = {
          rating,
          selectedRating: latestRound.progressByBlock[blockId]?.selectedRating ?? rating,
          reviewId: reviewId ?? '',
          dueAt: latest.dueAt ?? '',
          state: latest,
          confirmed: true,
          corrected: pending.action === 'REVIEW_CORRECTED',
          learned: pending.action === 'LEARNING_COMPLETED',
        }
      }
      finishLifecycleCard(latestRound)
      return
    }
    const latestReviewId = latest.pendingReviewId ?? latest.lastReviewId
    if (pending.reviewId && latestReviewId && latestReviewId !== pending.reviewId) {
      clearObsoleteRoundCard('此卡已在另一设备更新；旧操作已清除，请结束本轮后按最新状态重新开始。')
      return
    }
    let preserveOriginalCommandId = false
    if (pending.reviewId && !latest.pendingReviewId && !latest.lastReviewId
      && latest.version > pending.request.baseVersion) {
      const { localDb, getLocalSqlDatabase, getLocalRepository } = await import('@/services/localDb')
      const { ReviewRepository } = await import('@/services/reviewRepository')
      await localDb.init()
      const localRepository = await getLocalRepository(round.scopeTicket.userId, round.scopeTicket.deviceId)
      const reviewRepository = new ReviewRepository(getLocalSqlDatabase(), localRepository)
      const localRecord = await reviewRepository.getReviewRecord(round.scopeTicket.userId, round.scopeTicket.deviceId, blockId)
      assertCurrent(round.scopeTicket)
      const afterHistoryRound = lifecycleRoundsBySubjectId.value[subjectId]
      if (afterHistoryRound?.roundId !== roundId
        || afterHistoryRound.pendingCommand?.request.clientCommandId !== clientCommandId) throw new SyncScopeChangedError()
      if (!localRecord || !localRecord.historyImported || !localRecord.canonicalAnchor
        || !Array.isArray(localRecord.history) || !Array.isArray(localRecord.effectiveReviews)
        || localRecord.subjectId !== subjectId || localRecord.contentHash !== pending.request.contentHash
        || localRecord.canonicalAnchor.subjectId !== subjectId
        || localRecord.canonicalAnchor.contentHash !== pending.request.contentHash
        || !localRecord.state || localRecord.state.knowledgeBlockId !== blockId
        || localRecord.state.version !== latest.version
        || localRecord.state.knowledgeBlockVersion !== latest.knowledgeBlockVersion
        || localRecord.state.contentHash !== latest.contentHash) {
        clearObsoleteRoundCard('本机复习历史尚未完整导入；旧操作已结束，正式本地记录仍被保留。')
        return
      }
      const lifecycleHistory = {
        knowledgeBlockId: localRecord.knowledgeBlockId,
        knowledgeBlockVersion: localRecord.serverKnowledgeBlockVersion,
        state: localRecord.state,
        commands: localRecord.history,
        effectiveReviews: localRecord.effectiveReviews,
      }
      assertStateView(lifecycleHistory.state)
      if (latest.knowledgeBlockVersion !== expectedKbVersion
        || latest.contentHash !== pending.request.contentHash) {
        clearObsoleteRoundCard('知识块正文已变化；旧正文操作已清除，请结束本轮并同步材料后重新开始。')
        return
      }
      const refreshedReviewId = latest.pendingReviewId ?? latest.lastReviewId
      if (pending.reviewId && refreshedReviewId && refreshedReviewId !== pending.reviewId) {
        clearObsoleteRoundCard('此卡已在另一设备更新；旧操作已清除，请结束本轮后按最新状态重新开始。')
        return
      }
      for (const command of lifecycleHistory.commands) {
        if (!command || typeof command.commandId !== 'string' || !command.commandId
          || typeof command.clientCommandId !== 'string' || !command.clientCommandId
          || typeof command.action !== 'string'
          || (command.reviewId !== null && typeof command.reviewId !== 'string')) {
          throw new Error('复习历史命令不完整；请重新加载后再确认。')
        }
      }
      for (const review of lifecycleHistory.effectiveReviews) assertEffectiveReviewView(review)
      const reviewWasUsed = lifecycleHistory.effectiveReviews.some((review) => review.reviewId === pending.reviewId)
        || lifecycleHistory.commands.some((command) => command.clientCommandId === clientCommandId
          || command.reviewId === pending.reviewId)
      if (reviewWasUsed || pending.action !== 'REVIEW_SELECTED') {
        clearObsoleteRoundCard('此卡已在另一设备更新；旧操作已清除，请结束本轮后按最新状态重新开始。')
        return
      }
      preserveOriginalCommandId = true
    }
    if (pending.reviewId && latest.lastReviewId === pending.reviewId
      && latest.pendingReviewId !== pending.reviewId
      && pending.action === 'REVIEW_CONFIRMED') {
      latestRound.pendingCommand = null
      latestRound.pendingError = null
      latestRound.conflictNeedsConfirmation = false
      const previous = latestRound.progressByBlock[blockId]
      if (previous) {
        latestRound.progressByBlock[blockId] = {
          ...previous,
          rating: latest.needsLearning ? 'AGAIN' : previous.rating,
          state: latest,
          dueAt: latest.dueAt ?? previous.dueAt,
          confirmed: true,
          corrected: latest.needsLearning || previous.corrected,
        }
      }
      if (latest.needsLearning) {
        latestRound.currentReviewId = pending.reviewId
        latestRound.currentRating = 'AGAIN'
        latestRound.phase = 'LEARNING_READ'
      } else {
        finishLifecycleCard(latestRound)
      }
      return
    }
    if (pending.action === 'REVIEW_SELECTED' && pending.reviewId
      && latest.lastReviewId === pending.reviewId && latest.pendingReviewId !== pending.reviewId) {
      const rating = pending.initialRating as LifecycleRating
      latestRound.pendingCommand = null
      latestRound.pendingError = null
      latestRound.conflictNeedsConfirmation = false
      latestRound.currentReviewId = pending.reviewId
      latestRound.currentRating = latest.needsLearning ? 'AGAIN' : rating
      latestRound.progressByBlock[blockId] = {
        rating: latest.needsLearning ? 'AGAIN' : rating,
        selectedRating: rating,
        reviewId: pending.reviewId,
        dueAt: latest.dueAt ?? '',
        state: latest,
        confirmed: latest.needsLearning || rating === 'AGAIN',
        corrected: latest.needsLearning && rating !== 'AGAIN',
        learned: !latest.needsLearning && rating === 'AGAIN',
      }
      if (latest.needsLearning) latestRound.phase = 'LEARNING_READ'
      else finishLifecycleCard(latestRound)
      return
    }
    const freshBase: LifecycleCommandBase = {
      ...pending.request,
      clientCommandId: preserveOriginalCommandId ? pending.request.clientCommandId : makeUuid(),
      knowledgeBlockId: blockId,
      knowledgeBlockVersion: expectedKbVersion,
      baseVersion: latest.version,
      expectedStateAbsent: !latest.persistedStatePresent,
    }
    latestRound.pendingCommand = {
      ...pending,
      request: { ...freshBase, ...('reviewId' in pending.request ? { reviewId: pending.request.reviewId } : {}), ...('rating' in pending.request ? { rating: pending.request.rating, durationSeconds: pending.request.durationSeconds } : {}) } as LifecyclePendingCommand['request'],
    }
    latestRound.pendingError = null
    latestRound.conflictNeedsConfirmation = false
    return sendLifecyclePending(latestRound)
  }

  function endLifecycleRound(subjectId: string, force = false): void {
    const round = lifecycleRoundsBySubjectId.value[subjectId]
    if (!round) return
    if (round.pendingCommand && !force) throw new Error('请先确认当前复习操作，再结束本轮。')
    delete lifecycleRoundsBySubjectId.value[subjectId]
  }

  async function loadSubjectHistory(subjectId: string, knowledgeBlockId: string): Promise<LifecycleHistoryResponse> {
    const ticket = createScopeTicket()
    const key = subjectBlockKey(subjectId, knowledgeBlockId)
    const requestVersion = (historyRequestVersions.get(key) ?? 0) + 1
    historyRequestVersions.set(key, requestVersion)
    historyLoadingBySubjectBlock.value[key] = true
    historyErrorBySubjectBlock.value[key] = null
    try {
      const { localDb, getLocalSqlDatabase, getLocalRepository } = await import('@/services/localDb')
      const { LocalReviewService } = await import('@/services/localReviewService')
      await localDb.init()
      const localRepository = await getLocalRepository(ticket.userId, ticket.deviceId)
      const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
      const lifecycleHistory = await localService.getLifecycleHistory(ticket.userId, ticket.deviceId, knowledgeBlockId)
      assertCurrent(ticket)
      if (!lifecycleHistory || lifecycleHistory.knowledgeBlockId !== knowledgeBlockId
        || !Number.isInteger(lifecycleHistory.knowledgeBlockVersion) || lifecycleHistory.knowledgeBlockVersion < 0
        || !Array.isArray(lifecycleHistory.commands) || !Array.isArray(lifecycleHistory.effectiveReviews)
        || (lifecycleHistory.state !== null && (!lifecycleHistory.state || lifecycleHistory.state.knowledgeBlockId !== knowledgeBlockId))) {
        throw new Error('复习历史响应无效。')
      }
      if (lifecycleHistory.state) assertStateView(lifecycleHistory.state)
      for (const command of lifecycleHistory.commands) {
        if (!command || typeof command.commandId !== 'string' || !command.commandId
          || typeof command.clientCommandId !== 'string' || !command.clientCommandId
          || !['LEARNING_COMPLETED', 'REVIEW_SELECTED', 'REVIEW_CONFIRMED', 'REVIEW_CORRECTED', 'LEARNING_REOPENED'].includes(command.action)
          || typeof command.occurredAt !== 'string' || !Number.isFinite(Date.parse(command.occurredAt))
          || (command.reviewId !== null && typeof command.reviewId !== 'string')
          || (command.rating !== null && !isLifecycleRating(command.rating))
          || (command.durationSeconds !== null && (!Number.isSafeInteger(command.durationSeconds) || command.durationSeconds < 0))
          || !Number.isSafeInteger(command.baseVersion) || command.baseVersion < 0
          || !Number.isSafeInteger(command.knowledgeBlockVersion) || command.knowledgeBlockVersion < 0) {
          throw new Error('复习历史命令不完整。')
        }
      }
      for (const review of lifecycleHistory.effectiveReviews) assertEffectiveReviewView(review)
      if (historyRequestVersions.get(key) !== requestVersion) throw new SyncScopeChangedError()
      lifecycleHistoryBySubjectBlock.value[key] = lifecycleHistory
      return lifecycleHistory
    } catch (error) {
      if (ticket.isCurrent() && historyRequestVersions.get(key) === requestVersion) {
        historyErrorBySubjectBlock.value[key] = error instanceof Error ? error.message : '复习历史加载失败。'
      }
      throw error
    } finally {
      if (ticket.isCurrent() && historyRequestVersions.get(key) === requestVersion) historyLoadingBySubjectBlock.value[key] = false
    }
  }

  async function loadSubjectReviewConflicts(subjectId: string): Promise<string[]> {
    const ticket = createScopeTicket()
    const { localDb, getLocalSqlDatabase, getLocalRepository } = await import('@/services/localDb')
    const { LocalReviewService } = await import('@/services/localReviewService')
    await localDb.init()
    const localRepository = await getLocalRepository(ticket.userId, ticket.deviceId)
    const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
    const conflicts = await localService.getSubjectConflicts(ticket.userId, ticket.deviceId, subjectId)
    assertCurrent(ticket)
    reviewConflictsBySubjectId.value[subjectId] = conflicts
    return conflicts
  }

  async function adoptCloudReviewProgress(subjectId: string, knowledgeBlockId: string): Promise<void> {
    const ticket = createScopeTicket()
    const { localDb, getLocalSqlDatabase, getLocalRepository } = await import('@/services/localDb')
    const { LocalReviewService } = await import('@/services/localReviewService')
    await localDb.init()
    const localRepository = await getLocalRepository(ticket.userId, ticket.deviceId)
    const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
    const history = await useReviewApi.getLifecycleHistory({ knowledgeBlockId }, ticket)
    assertCurrent(ticket)
    if (history.protocolVersion !== 2) throw new Error('服务器复习同步协议尚未更新；本机进度仍被保留。')
    const adopted = await localService.adoptCloudHistory(ticket.userId, ticket.deviceId, knowledgeBlockId, history)
    assertCurrent(ticket)
    if (!adopted) throw new Error('云端复习进度与当前本地正文不匹配；本机记录仍被保留。')
    await loadSubjectStates(subjectId)
    await loadSubjectReviewConflicts(subjectId)
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('auralis-review-local-updated', {
        detail: { userId: ticket.userId, deviceId: ticket.deviceId, sessionId: ticket.sessionId, subjectId, knowledgeBlockId },
      }))
    }
  }

  return {
    subjectStatesBySubjectId,
    subjectStatesLoadedBySubjectId,
    subjectStatesLoadingBySubjectId,
    subjectStatesErrorBySubjectId,
    reviewConflictsBySubjectId,
    groupSizeBySubjectId,
    lifecycleRoundsBySubjectId,
    lifecycleHistoryBySubjectBlock,
    historyLoadingBySubjectBlock,
    historyErrorBySubjectBlock,
    captureScopeTicket,
    clearDeletedSubject,
    loadSubjectStates,
    isSubjectStatesLoaded,
    reconcileSubjectBlocks,
    startLifecycleRound,
    getLifecycleRound,
    nextLifecycleGroup,
    selectLifecycleRating,
    beginLifecycleRecall,
    revealLifecycleAnswer,
    confirmLifecycleReview,
    correctLifecycleReview,
    failLifecycleLearning,
    completeLifecycleLearning,
    reopenCurrentLearning,
    retryLifecyclePending,
    reconfirmLifecyclePending,
    endLifecycleRound,
    subjectBlockKey,
    getGroupSize,
    setGroupSize,
    loadSubjectHistory,
    loadSubjectReviewConflicts,
    adoptCloudReviewProgress,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    if (typeof window !== 'undefined') window.location.reload()
  })
}
