import { computed, nextTick, onUnmounted, ref, toRaw, watch } from 'vue'
import type {
  LearningCompletionRequest,
  LearningReopenRequest,
  LifecycleRating,
  ReviewAttemptRequest,
  ReviewCommandResponse,
  ReviewLifecycleHistory,
  ReviewResolutionRequest,
  ReviewState,
  reviewApi,
} from '@/api/reviewApi'
import { ApiProblemError } from '@/api/protocol'
import { getStorageJson, removeStorageItem, setStorageJson } from '@/platform/storage'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSyncStore } from '@/store/useSyncStore'
import {
  selectStudyCandidateIds,
  type MobileGroupSize,
  type MobileStudyMode,
} from '@/utils/mobileLearning'
import { sha256Utf8Hex } from '@/utils/sha256'
import { uuidv7 } from '@/utils/uuid'

export type MobileLifecyclePhase =
  | 'IDLE'
  | 'LEARNING_READ'
  | 'LEARNING_RECALL'
  | 'LEARNING_CHECK'
  | 'REVIEW_RECALL'
  | 'REVIEW_CHECK'
  | 'FUZZY_RECALL'
  | 'FUZZY_CHECK'
  | 'GROUP_COMPLETE'
  | 'ROUND_COMPLETE'

export type MobileLifecycleAction =
  | 'LEARNING_COMPLETED'
  | 'REVIEW_SELECTED'
  | 'REVIEW_CONFIRMED'
  | 'REVIEW_CORRECTED'
  | 'LEARNING_REOPENED'

export interface ActiveLifecycleBlock {
  id: string
  title: string
  content: string
  version: number
  subjectId: string
  contentHash: string
}

export interface PersistedLifecyclePending {
  subjectId: string
  roundId: string
  action: MobileLifecycleAction
  reviewId: string | null
  initialRating?: LifecycleRating
  body: {
    clientCommandId: string
    knowledgeBlockId: string
    knowledgeBlockVersion: number
    baseVersion: number
    contentHash: string
    occurredAt: string
    expectedStateAbsent: boolean
    reviewId?: string
    rating?: LifecycleRating
    durationSeconds?: number
  }
}

export interface MobileLifecycleReviewOptions {
  subjectId?: () => string | undefined
  enabled?: () => boolean
  initialMode?: () => MobileStudyMode
  initialGroupSize?: () => MobileGroupSize
}

export type MobileReviewApi = Pick<
  typeof reviewApi,
  | 'states'
  | 'block'
  | 'attempt'
  | 'confirm'
  | 'correct'
  | 'completeLearning'
  | 'reopenLearning'
  | 'history'
>

interface RoundProgressEntry {
  rating: LifecycleRating
  selectedRating: LifecycleRating
  corrected: boolean
  reviewId: string | null
}

interface ScopeSnapshot {
  generation: symbol
  userId: string
  serverDeviceId: string
  revision: number
  subjectId: string
  roundId: string
}

export function lifecyclePendingStorageKey(userId: string, serverDeviceId: string): string {
  return `auralis:review:lifecycle:pending:${userId}:${serverDeviceId}`
}

function readStoredPending(key: string): PersistedLifecyclePending | null {
  const raw = getStorageJson<PersistedLifecyclePending>(key)
  if (!raw || typeof raw !== 'object' || !raw.body?.clientCommandId) return null
  return raw
}

function removeStoredPendingIfMatch(key: string, clientCommandId: string): void {
  try {
    const stored = readStoredPending(key)
    if (stored && stored.body.clientCommandId === clientCommandId) {
      removeStorageItem(key)
    }
  } catch {
    // Ignore storage error when clearing settled pending command
  }
}

function isTerminalProblem(error: unknown): boolean {
  return error instanceof ApiProblemError && [400, 404, 409, 422].includes(error.status)
}

function resolveFriendlyError(error: unknown, fallback: string): string {
  if (error instanceof ApiProblemError) {
    if (error.code === 'RESOURCE_VERSION_CONFLICT') {
      return '知识块或复习状态已在其他端更新，请刷新最新状态'
    }
    if (error.status === 404) {
      return '目标知识块或复习记录不存在，请刷新状态'
    }
    if (error.code === 'MUTATION_REJECTED' || error.status === 400 || error.status === 422) {
      return error.problem.detail || fallback
    }
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export function useMobileLifecycleReview(
  api: MobileReviewApi,
  options?: MobileLifecycleReviewOptions,
) {
  const auth = useAuthStore()
  const blockStore = useBlockStore()
  const syncStore = useSyncStore()

  const roundMode = ref<MobileStudyMode>('review')
  const groupSize = ref<MobileGroupSize>(5)
  const phase = ref<MobileLifecyclePhase>('IDLE')
  const currentMode = ref<'NORMAL' | 'FUZZY'>('NORMAL')
  const activeSubjectId = ref('')
  const roundId = ref('')

  const loading = ref(false)
  const submitting = ref(false)
  const loadError = ref('')
  const actionError = ref('')
  const roundNeedsRestart = ref(false)
  const unsyncedBlockCount = ref(0)

  const activeBlock = ref<ActiveLifecycleBlock | null>(null)
  const currentState = ref<ReviewState | null>(null)
  const currentRating = ref<LifecycleRating | null>(null)
  const currentReviewId = ref<string | null>(null)

  const subjectStates = ref<ReviewState[]>([])
  const queue = ref<string[]>([])
  const remainingIds = ref<string[]>([])
  const firstGroupCount = ref(0)
  const fuzzyPendingIds = ref<string[]>([])
  const fuzzyQueueIds = ref<string[]>([])
  const completedIds = ref<string[]>([])
  const fuzzyCompletedIds = ref<string[]>([])
  const firstFeedbackByBlock = ref<Record<string, LifecycleRating>>({})

  const pendingCommand = ref<PersistedLifecyclePending | null>(null)
  const pendingIsConflict = ref(false)

  const progressByBlock = new Map<string, RoundProgressEntry>()
  let scopeRevision = 0
  let cardStartedAt = Date.now()
  let lastCommandOccurredAtMs = 0

  const optionSubjectId = computed(() => options?.subjectId?.() || '')
  const optionEnabled = computed(() => {
    if (!options) return Boolean(activeSubjectId.value)
    const flag = options.enabled ? options.enabled() : true
    return Boolean(flag && optionSubjectId.value)
  })

  const selfTestCount = computed(() => (
    subjectStates.value.filter(item => Boolean(item.knowledgeBlockId) && !item.needsLearning).length
  ))

  const hasPendingCommand = computed(() => Boolean(pendingCommand.value))

  const isRecallHidden = computed(() => (
    phase.value === 'LEARNING_RECALL'
    || phase.value === 'REVIEW_RECALL'
    || phase.value === 'FUZZY_RECALL'
  ))

  const isContentVisible = computed(() => (
    phase.value === 'LEARNING_READ'
    || phase.value === 'LEARNING_CHECK'
    || phase.value === 'REVIEW_CHECK'
    || phase.value === 'FUZZY_CHECK'
  ))

  const isMasteredCard = computed(() => Boolean(currentState.value?.mastered))

  const progressTotal = computed(() => {
    if (currentMode.value === 'FUZZY' && fuzzyQueueIds.value.length > 0) {
      return fuzzyQueueIds.value.length
    }
    return firstGroupCount.value
  })

  const progressCurrent = computed(() => {
    const total = progressTotal.value
    if (total <= 0) return 0
    const done = Math.max(0, total - queue.value.length)
    return Math.min(done + 1, total)
  })

  const completedCount = computed(() => (
    new Set([...completedIds.value, ...fuzzyCompletedIds.value]).size
  ))

  const firstFeedbackCounts = computed(() => {
    const counts: Record<LifecycleRating, number> = { GOOD: 0, HARD: 0, AGAIN: 0 }
    for (const value of Object.values(firstFeedbackByBlock.value)) {
      counts[value] += 1
    }
    return counts
  })

  function captureScope(expectedSubjectId = activeSubjectId.value, expectedRoundId = roundId.value): ScopeSnapshot | null {
    const userId = auth.user?.id
    const serverDeviceId = auth.serverDeviceId
    if (!auth.isAuthenticated || !userId || !serverDeviceId) return null
    return {
      generation: auth.getLoginGeneration(),
      userId,
      serverDeviceId,
      revision: scopeRevision,
      subjectId: expectedSubjectId,
      roundId: expectedRoundId,
    }
  }

  function isScopeCurrent(snap: ScopeSnapshot | null): boolean {
    if (!snap) return false
    return (
      auth.isAuthenticated
      && auth.getLoginGeneration() === snap.generation
      && auth.user?.id === snap.userId
      && auth.serverDeviceId === snap.serverDeviceId
      && scopeRevision === snap.revision
      && activeSubjectId.value === snap.subjectId
      && roundId.value === snap.roundId
    )
  }

  function canCleanAuthStorage(snap: ScopeSnapshot): boolean {
    return (
      auth.getLoginGeneration() === snap.generation
      && auth.user?.id === snap.userId
      && auth.serverDeviceId === snap.serverDeviceId
    )
  }

  function clearRoundVisuals(): void {
    scopeRevision++
    roundId.value = ''
    phase.value = 'IDLE'
    currentMode.value = 'NORMAL'
    loading.value = false
    submitting.value = false
    loadError.value = ''
    actionError.value = ''
    roundNeedsRestart.value = false
    unsyncedBlockCount.value = 0
    activeBlock.value = null
    currentState.value = null
    currentRating.value = null
    currentReviewId.value = null
    subjectStates.value = []
    queue.value = []
    remainingIds.value = []
    firstGroupCount.value = 0
    fuzzyPendingIds.value = []
    fuzzyQueueIds.value = []
    completedIds.value = []
    fuzzyCompletedIds.value = []
    firstFeedbackByBlock.value = {}
    pendingCommand.value = null
    pendingIsConflict.value = false
    progressByBlock.clear()
  }

  function upsertState(nextState: ReviewState | undefined | null): void {
    if (!nextState?.knowledgeBlockId) return
    const exists = subjectStates.value.some(item => item.knowledgeBlockId === nextState.knowledgeBlockId)
    subjectStates.value = exists
      ? subjectStates.value.map(item => (
          item.knowledgeBlockId === nextState.knowledgeBlockId ? nextState : item
        ))
      : [...subjectStates.value, nextState]
    if (activeBlock.value?.id === nextState.knowledgeBlockId) {
      currentState.value = nextState
    }
  }

  function findState(blockId: string): ReviewState | null {
    return subjectStates.value.find(item => item.knowledgeBlockId === blockId) ?? null
  }

  function computeOccurredAt(state: ReviewState | null): string {
    const nowMs = Date.now()
    const candidates = [lastCommandOccurredAtMs]
    if (state?.lastPracticeAt) {
      const parsed = Date.parse(state.lastPracticeAt)
      if (Number.isFinite(parsed)) candidates.push(parsed)
    }
    if (state?.lastReviewedAt) {
      const parsed = Date.parse(state.lastReviewedAt)
      if (Number.isFinite(parsed)) candidates.push(parsed)
    }
    const maxPrevious = Math.max(...candidates)
    const safeMs = nowMs > maxPrevious ? nowMs : Math.min(maxPrevious + 1, nowMs + 240_000)
    return new Date(safeMs).toISOString()
  }

  async function fetchAllStates(subjectId: string, checkScope: () => boolean): Promise<ReviewState[] | null> {
    const collected: ReviewState[] = []
    let cursor: string | undefined
    do {
      const page = await api.states(subjectId, cursor)
      if (!checkScope()) return null
      for (const item of page.items ?? []) {
        if (item.knowledgeBlockId) collected.push(item)
      }
      if (page.hasMore && !page.nextCursor) {
        throw new Error('复习状态分页游标缺失')
      }
      cursor = page.hasMore ? page.nextCursor : undefined
    } while (cursor)
    if (checkScope() && typeof localDb?.replaceSubjectReviewStates === 'function') {
      void localDb.replaceSubjectReviewStates(subjectId, collected).catch(() => {})
    }
    return collected
  }

  function recordFirstFeedback(blockId: string, rating: LifecycleRating): void {
    if (blockId in firstFeedbackByBlock.value) return
    firstFeedbackByBlock.value = { ...firstFeedbackByBlock.value, [blockId]: rating }
  }

  function resolveNormalInitialPhase(state: ReviewState | null): MobileLifecyclePhase {
    if (roundMode.value === 'learn' || !state || state.needsLearning) {
      return 'LEARNING_READ'
    }
    return 'REVIEW_RECALL'
  }

  async function loadCardAt(blockId: string, snap: ScopeSnapshot): Promise<boolean> {
    loading.value = true
    loadError.value = ''
    try {
      const block = await api.block(blockId)
      if (!isScopeCurrent(snap)) return false
      if (
        block.id !== blockId
        || typeof block.title !== 'string'
        || !('content' in block)
        || typeof block.content !== 'string'
        || typeof block.version !== 'number'
        || !Number.isInteger(block.version)
        || block.version < 0
      ) {
        roundNeedsRestart.value = true
        actionError.value = '知识块数据格式异常，请返回规划后重新开始'
        return false
      }
      if (block.subjectId !== snap.subjectId) {
        roundNeedsRestart.value = true
        actionError.value = '知识块已移出当前学科，请返回规划后重新开始'
        return false
      }

      const contentHash = sha256Utf8Hex(block.content)
      let state = findState(blockId)
      if (state && (state.knowledgeBlockVersion !== block.version || (state.contentHash && state.contentHash !== contentHash))) {
        const refreshed = await fetchAllStates(snap.subjectId, () => isScopeCurrent(snap))
        if (!refreshed || !isScopeCurrent(snap)) return false
        subjectStates.value = refreshed
        state = findState(blockId)
        if (state && (state.knowledgeBlockVersion !== block.version || (state.contentHash && state.contentHash !== contentHash))) {
          roundNeedsRestart.value = true
          actionError.value = '知识块版本已变化，请返回规划后重新开始'
          return false
        }
      }

      activeBlock.value = {
        id: blockId,
        title: block.title,
        content: block.content,
        version: block.version,
        subjectId: block.subjectId,
        contentHash,
      }
      currentState.value = state
      cardStartedAt = Date.now()

      if (state?.pendingReviewId) {
        const history: ReviewLifecycleHistory = await api.history(blockId)
        if (!isScopeCurrent(snap)) return false
        if (history.state) {
          upsertState(history.state)
          state = history.state
        }
        const pendingItem = (history.effectiveReviews ?? []).find(
          item => item.reviewId === state?.pendingReviewId && !item.resolvedAt && !item.effectiveRating,
        )
        if (state?.pendingReviewId && pendingItem) {
          const selected = pendingItem.selectedRating ?? 'GOOD'
          currentReviewId.value = state.pendingReviewId
          currentRating.value = selected
          recordFirstFeedback(blockId, selected)
          if (!progressByBlock.has(blockId)) {
            progressByBlock.set(blockId, {
              rating: selected,
              selectedRating: selected,
              corrected: false,
              reviewId: state.pendingReviewId,
            })
          }
          if (selected === 'HARD' && !fuzzyPendingIds.value.includes(blockId)) {
            fuzzyPendingIds.value = [...fuzzyPendingIds.value, blockId]
          }
          phase.value = 'REVIEW_CHECK'
          return true
        }
      }

      if (currentMode.value === 'FUZZY') {
        const entry = progressByBlock.get(blockId)
        currentReviewId.value = entry?.reviewId ?? state?.lastReviewId ?? null
        currentRating.value = entry?.rating ?? 'HARD'
        phase.value = 'FUZZY_RECALL'
        return true
      }

      const initialPhase = resolveNormalInitialPhase(state)
      if (initialPhase === 'LEARNING_READ') {
        currentReviewId.value = state?.needsLearning ? (state.lastReviewId ?? null) : null
        currentRating.value = state?.needsLearning && state.lastReviewId ? 'AGAIN' : null
        phase.value = 'LEARNING_READ'
        return true
      }

      currentReviewId.value = null
      currentRating.value = null
      phase.value = 'REVIEW_RECALL'
      return true
    } catch (error) {
      if (!isScopeCurrent(snap)) return false
      if (isTerminalProblem(error)) {
        roundNeedsRestart.value = true
        actionError.value = resolveFriendlyError(error, '知识块已在其他端变化，请重新开始本轮')
        return false
      }
      loadError.value = resolveFriendlyError(error, '知识块加载失败，请重试')
      return false
    } finally {
      if (isScopeCurrent(snap)) {
        loading.value = false
      }
    }
  }

  async function finishCurrentCard(snap: ScopeSnapshot): Promise<void> {
    const finishedId = activeBlock.value?.id
    if (!finishedId || !isScopeCurrent(snap)) return
    queue.value = queue.value.slice(1)
    if (currentMode.value === 'FUZZY') {
      if (!fuzzyCompletedIds.value.includes(finishedId)) {
        fuzzyCompletedIds.value = [...fuzzyCompletedIds.value, finishedId]
      }
    } else if (!completedIds.value.includes(finishedId)) {
      completedIds.value = [...completedIds.value, finishedId]
    }

    activeBlock.value = null
    currentState.value = null
    currentReviewId.value = null
    currentRating.value = null
    phase.value = 'IDLE'

    if (queue.value.length > 0) {
      await loadCardAt(queue.value[0], snap)
      return
    }

    if (fuzzyPendingIds.value.length > 0) {
      const nextFuzzy = [...fuzzyPendingIds.value]
      fuzzyPendingIds.value = []
      fuzzyQueueIds.value = nextFuzzy
      queue.value = nextFuzzy
      currentMode.value = 'FUZZY'
      await loadCardAt(nextFuzzy[0], snap)
      return
    }

    if (remainingIds.value.length > 0) {
      phase.value = 'GROUP_COMPLETE'
      return
    }

    phase.value = 'ROUND_COMPLETE'
  }

  async function loadRoundCandidates(
    mode: MobileStudyMode,
    nextGroupSize: MobileGroupSize,
    targetSubjectId: string,
    snap: ScopeSnapshot,
    resumeBlockId?: string,
  ): Promise<void> {
    loading.value = true
    try {
      await blockStore.loadLocalBlocks()
      if (!isScopeCurrent(snap)) return

      const hasPendingLocalBlocks = blockStore.recentBlocks.some(
        item => !item.is_deleted && item.subjectId === targetSubjectId && item.sync_status !== 'synced',
      )
      if (hasPendingLocalBlocks) {
        try {
          await syncStore.triggerSync()
        } catch {
          // Offline or transient sync failure: continue with server query
        }
        if (!isScopeCurrent(snap)) return
        await blockStore.loadLocalBlocks()
        if (!isScopeCurrent(snap)) return
      }

      const states = await fetchAllStates(targetSubjectId, () => isScopeCurrent(snap))
      if (!states || !isScopeCurrent(snap)) return
      subjectStates.value = states

      const subjectBlocks = blockStore.recentBlocks.filter(
        item => !item.is_deleted && item.subjectId === targetSubjectId,
      )
      const selection = selectStudyCandidateIds({
        mode,
        blocks: subjectBlocks,
        states,
        groupSize: nextGroupSize,
      })
      unsyncedBlockCount.value = selection.unsyncedCount

      const orderedIds = resumeBlockId && !selection.ids.includes(resumeBlockId)
        ? [resumeBlockId, ...selection.ids]
        : selection.ids

      if (orderedIds.length === 0) {
        queue.value = []
        remainingIds.value = []
        firstGroupCount.value = 0
        phase.value = 'IDLE'
        loading.value = false
        return
      }

      const initialQueue = orderedIds.slice(0, nextGroupSize)
      const rest = mode === 'self-test' ? [] : orderedIds.slice(nextGroupSize)
      queue.value = initialQueue
      remainingIds.value = rest
      firstGroupCount.value = initialQueue.length
      currentMode.value = 'NORMAL'

      await loadCardAt(initialQueue[0], snap)
    } catch (error) {
      if (!isScopeCurrent(snap)) return
      loadError.value = resolveFriendlyError(error, '学习状态加载失败，请重试')
      loading.value = false
    }
  }

  async function startRound(
    mode: MobileStudyMode = roundMode.value,
    nextGroupSize: MobileGroupSize = groupSize.value,
    targetSubjectId = optionSubjectId.value || activeSubjectId.value,
  ): Promise<void> {
    if (!targetSubjectId || !auth.isAuthenticated || !auth.user?.id || !auth.serverDeviceId) return
    clearRoundVisuals()
    activeSubjectId.value = targetSubjectId
    roundMode.value = mode
    groupSize.value = nextGroupSize
    const nextRoundId = uuidv7()
    roundId.value = nextRoundId
    const snap = captureScope(targetSubjectId, nextRoundId)
    if (!snap) return

    try {
      const stored = readStoredPending(lifecyclePendingStorageKey(snap.userId, snap.serverDeviceId))
      if (stored) {
        pendingCommand.value = stored
        pendingIsConflict.value = false
        actionError.value = stored.subjectId === targetSubjectId
          ? '上次学习操作尚未确认，请先「原样重试」或刷新状态'
          : '有来自其他学科的待确认学习记录，请先「原样重试」或刷新状态'
        return
      }
    } catch {
      loadError.value = '读取本地待保存复习记录失败，请重试'
      return
    }

    await loadRoundCandidates(mode, nextGroupSize, targetSubjectId, snap)
  }

  async function continueNextGroup(): Promise<void> {
    if (loading.value || submitting.value || pendingCommand.value || roundNeedsRestart.value) return
    if (remainingIds.value.length === 0) return
    const snap = captureScope()
    if (!snap) return
    const nextBatch = remainingIds.value.slice(0, groupSize.value)
    remainingIds.value = remainingIds.value.slice(groupSize.value)
    activeBlock.value = null
    currentState.value = null
    currentReviewId.value = null
    currentRating.value = null
    phase.value = 'IDLE'
    queue.value = nextBatch
    firstGroupCount.value = nextBatch.length
    fuzzyQueueIds.value = []
    currentMode.value = 'NORMAL'
    await loadCardAt(nextBatch[0], snap)
  }

  async function startSelfTestRound(nextGroupSize: MobileGroupSize = groupSize.value): Promise<void> {
    await startRound('self-test', nextGroupSize, activeSubjectId.value || optionSubjectId.value)
  }

  async function switchToDueReview(): Promise<void> {
    await startRound('review', groupSize.value, activeSubjectId.value || optionSubjectId.value)
  }

  function reloadCurrentRound(): void {
    void startRound(roundMode.value, groupSize.value, activeSubjectId.value || optionSubjectId.value)
  }

  function buildPendingPayload(
    action: MobileLifecycleAction,
    reviewId: string | null,
    initialRating?: LifecycleRating,
    extra?: { rating?: LifecycleRating; durationSeconds?: number; includeReviewId?: boolean },
  ): PersistedLifecyclePending | null {
    const block = activeBlock.value
    if (!block) return null
    const state = currentState.value
    const body: PersistedLifecyclePending['body'] = {
      clientCommandId: uuidv7(),
      knowledgeBlockId: block.id,
      knowledgeBlockVersion: block.version,
      baseVersion: state ? state.version ?? 0 : 0,
      contentHash: block.contentHash,
      occurredAt: computeOccurredAt(state),
      expectedStateAbsent: !state,
    }
    if (extra?.includeReviewId && reviewId) {
      body.reviewId = reviewId
    }
    if (extra?.rating) {
      body.rating = extra.rating
    }
    if (typeof extra?.durationSeconds === 'number') {
      body.durationSeconds = Math.max(0, Math.floor(extra.durationSeconds))
    }
    return {
      subjectId: activeSubjectId.value,
      roundId: roundId.value,
      action,
      reviewId,
      initialRating,
      body,
    }
  }

  async function dispatchCommand(pending: PersistedLifecyclePending): Promise<ReviewCommandResponse> {
    if (pending.action === 'LEARNING_COMPLETED') {
      const payload: LearningCompletionRequest = {
        clientCommandId: pending.body.clientCommandId,
        knowledgeBlockId: pending.body.knowledgeBlockId,
        knowledgeBlockVersion: pending.body.knowledgeBlockVersion,
        baseVersion: pending.body.baseVersion,
        contentHash: pending.body.contentHash,
        occurredAt: pending.body.occurredAt,
        expectedStateAbsent: pending.body.expectedStateAbsent,
        ...(pending.body.reviewId ? { reviewId: pending.body.reviewId } : {}),
      }
      return api.completeLearning(payload)
    }
    if (pending.action === 'REVIEW_SELECTED') {
      const payload: ReviewAttemptRequest = {
        clientCommandId: pending.body.clientCommandId,
        knowledgeBlockId: pending.body.knowledgeBlockId,
        knowledgeBlockVersion: pending.body.knowledgeBlockVersion,
        baseVersion: pending.body.baseVersion,
        contentHash: pending.body.contentHash,
        reviewId: pending.body.reviewId as string,
        rating: pending.body.rating as LifecycleRating,
        durationSeconds: pending.body.durationSeconds ?? 0,
        occurredAt: pending.body.occurredAt,
        expectedStateAbsent: pending.body.expectedStateAbsent,
      }
      return api.attempt(payload)
    }
    if (pending.action === 'REVIEW_CONFIRMED') {
      const payload: ReviewResolutionRequest = {
        clientCommandId: pending.body.clientCommandId,
        knowledgeBlockId: pending.body.knowledgeBlockId,
        knowledgeBlockVersion: pending.body.knowledgeBlockVersion,
        baseVersion: pending.body.baseVersion,
        contentHash: pending.body.contentHash,
        occurredAt: pending.body.occurredAt,
        expectedStateAbsent: pending.body.expectedStateAbsent,
      }
      return api.confirm(pending.reviewId as string, payload)
    }
    if (pending.action === 'REVIEW_CORRECTED') {
      const payload: ReviewResolutionRequest = {
        clientCommandId: pending.body.clientCommandId,
        knowledgeBlockId: pending.body.knowledgeBlockId,
        knowledgeBlockVersion: pending.body.knowledgeBlockVersion,
        baseVersion: pending.body.baseVersion,
        contentHash: pending.body.contentHash,
        occurredAt: pending.body.occurredAt,
        expectedStateAbsent: pending.body.expectedStateAbsent,
      }
      return api.correct(pending.reviewId as string, payload)
    }
    const payload: LearningReopenRequest = {
      clientCommandId: pending.body.clientCommandId,
      knowledgeBlockId: pending.body.knowledgeBlockId,
      knowledgeBlockVersion: pending.body.knowledgeBlockVersion,
      baseVersion: pending.body.baseVersion,
      contentHash: pending.body.contentHash,
      occurredAt: pending.body.occurredAt,
      expectedStateAbsent: pending.body.expectedStateAbsent,
      ...(pending.body.reviewId ? { reviewId: pending.body.reviewId } : {}),
    }
    return api.reopenLearning(payload)
  }

  async function applyResolvedResponse(
    pending: PersistedLifecyclePending,
    response: ReviewCommandResponse,
    snap: ScopeSnapshot,
  ): Promise<void> {
    if (response.occurredAt) {
      const responseMs = Date.parse(response.occurredAt)
      if (Number.isFinite(responseMs) && responseMs > lastCommandOccurredAtMs) {
        lastCommandOccurredAtMs = responseMs
      }
    }
    if (response.state) {
      upsertState(response.state)
    }

    const blockId = pending.body.knowledgeBlockId
    if (pending.action === 'REVIEW_SELECTED') {
      const rating = (pending.initialRating ?? pending.body.rating ?? 'GOOD') as LifecycleRating
      const assignedReviewId = pending.reviewId as string
      recordFirstFeedback(blockId, rating)
      currentReviewId.value = assignedReviewId
      currentRating.value = rating
      progressByBlock.set(blockId, {
        rating,
        selectedRating: rating,
        corrected: false,
        reviewId: assignedReviewId,
      })
      if (rating === 'AGAIN') {
        phase.value = 'LEARNING_READ'
        return
      }
      if (rating === 'HARD' && !fuzzyPendingIds.value.includes(blockId)) {
        fuzzyPendingIds.value = [...fuzzyPendingIds.value, blockId]
      }
      phase.value = 'REVIEW_CHECK'
      return
    }

    if (pending.action === 'REVIEW_CONFIRMED') {
      await finishCurrentCard(snap)
      return
    }

    if (pending.action === 'REVIEW_CORRECTED') {
      const prev = progressByBlock.get(blockId)
      if (prev) {
        progressByBlock.set(blockId, { ...prev, rating: 'AGAIN', corrected: true })
      } else {
        progressByBlock.set(blockId, {
          rating: 'AGAIN',
          selectedRating: 'AGAIN',
          corrected: true,
          reviewId: pending.reviewId,
        })
      }
      currentRating.value = 'AGAIN'
      phase.value = 'LEARNING_READ'
      return
    }

    if (pending.action === 'LEARNING_COMPLETED') {
      await finishCurrentCard(snap)
      return
    }

    // LEARNING_REOPENED
    if (pending.reviewId) {
      const prev = progressByBlock.get(blockId)
      if (prev) {
        progressByBlock.set(blockId, { ...prev, rating: 'AGAIN', corrected: true })
      }
      currentReviewId.value = pending.reviewId
      currentRating.value = 'AGAIN'
      phase.value = 'LEARNING_READ'
      return
    }
    currentReviewId.value = null
    currentRating.value = null
    phase.value = 'LEARNING_READ'
  }

  async function executePending(pending: PersistedLifecyclePending): Promise<void> {
    if (submitting.value || loading.value) return
    const snap = captureScope(activeSubjectId.value, roundId.value)
    if (!snap) return
    const storageKey = lifecyclePendingStorageKey(snap.userId, snap.serverDeviceId)
    const rawPending: PersistedLifecyclePending = {
      ...toRaw(pending),
      body: { ...toRaw(pending.body) },
    }

    pendingCommand.value = rawPending
    pendingIsConflict.value = false
    actionError.value = ''
    submitting.value = true
    try {
      setStorageJson(storageKey, rawPending)
      const response = await dispatchCommand(rawPending)
      if (response.clientCommandId && response.clientCommandId !== rawPending.body.clientCommandId) {
        throw new Error('复习回执标识不匹配，请原样重试')
      }
      if (canCleanAuthStorage(snap)) {
        removeStoredPendingIfMatch(storageKey, rawPending.body.clientCommandId)
      }
      if (!isScopeCurrent(snap)) return
      if (response.state && typeof localDb?.upsertReviewState === 'function') {
        void localDb.upsertReviewState(rawPending.subjectId, response.state).catch(() => {})
      }
      pendingCommand.value = null
      pendingIsConflict.value = false

      const isActiveCard = rawPending.roundId === snap.roundId && activeBlock.value?.id === rawPending.body.knowledgeBlockId
      if (!isActiveCard) {
        submitting.value = false
        const shouldResumeRelearn = rawPending.subjectId === snap.subjectId && Boolean(response.state?.needsLearning)
        const resumeId = shouldResumeRelearn ? rawPending.body.knowledgeBlockId : undefined
        const freshSnap = captureScope(activeSubjectId.value, roundId.value)
        if (!freshSnap) return
        await loadRoundCandidates(roundMode.value, groupSize.value, activeSubjectId.value, freshSnap, resumeId)
        return
      }

      await applyResolvedResponse(rawPending, response, snap)
    } catch (error) {
      if (!isScopeCurrent(snap)) return
      pendingIsConflict.value = isTerminalProblem(error)
      if (error instanceof ApiProblemError && error.code === 'RESOURCE_VERSION_CONFLICT') {
        roundNeedsRestart.value = rawPending.roundId === snap.roundId && Boolean(activeBlock.value)
      }
      actionError.value = resolveFriendlyError(error, '复习操作尚未确认，请原样重试')
    } finally {
      if (isScopeCurrent(snap)) {
        submitting.value = false
      }
    }
  }

  function beginLearningRecall(): void {
    if (submitting.value || loading.value || pendingCommand.value || phase.value !== 'LEARNING_READ') return
    actionError.value = ''
    phase.value = 'LEARNING_RECALL'
  }

  function revealAnswer(): void {
    if (submitting.value || loading.value || pendingCommand.value) return
    actionError.value = ''
    if (phase.value === 'LEARNING_RECALL') {
      phase.value = 'LEARNING_CHECK'
      return
    }
    if (phase.value === 'FUZZY_RECALL') {
      phase.value = 'FUZZY_CHECK'
    }
  }

  function failLearning(): void {
    if (submitting.value || loading.value || pendingCommand.value || phase.value !== 'LEARNING_CHECK') return
    actionError.value = ''
    phase.value = 'LEARNING_READ'
  }

  async function completeLearning(): Promise<void> {
    if (submitting.value || loading.value || pendingCommand.value || roundNeedsRestart.value) return
    if (phase.value !== 'LEARNING_CHECK' || !activeBlock.value) return
    const reviewIdForCompletion = currentState.value ? currentReviewId.value : null
    const pending = buildPendingPayload('LEARNING_COMPLETED', reviewIdForCompletion, undefined, {
      includeReviewId: Boolean(reviewIdForCompletion),
    })
    if (!pending) return
    await executePending(pending)
  }

  async function selectRating(rating: LifecycleRating): Promise<void> {
    if (submitting.value || loading.value || pendingCommand.value || roundNeedsRestart.value) return
    if (phase.value !== 'REVIEW_RECALL' || !activeBlock.value) return
    if (!currentState.value || currentState.value.needsLearning) {
      actionError.value = '该知识块需先完成学习，请刷新状态'
      return
    }
    const reviewId = uuidv7()
    const durationSeconds = Math.max(0, Math.floor((Date.now() - cardStartedAt) / 1000))
    const pending = buildPendingPayload('REVIEW_SELECTED', reviewId, rating, {
      includeReviewId: true,
      rating,
      durationSeconds,
    })
    if (!pending) return
    await executePending(pending)
  }

  async function confirmReview(): Promise<void> {
    if (submitting.value || loading.value || pendingCommand.value || roundNeedsRestart.value) return
    if (!activeBlock.value) return
    if (phase.value === 'FUZZY_CHECK') {
      const snap = captureScope()
      if (!snap) return
      actionError.value = ''
      await finishCurrentCard(snap)
      return
    }
    if (phase.value !== 'REVIEW_CHECK' || !currentReviewId.value) return
    const pending = buildPendingPayload('REVIEW_CONFIRMED', currentReviewId.value, currentRating.value ?? undefined)
    if (!pending) return
    await executePending(pending)
  }

  async function correctReview(): Promise<void> {
    if (submitting.value || loading.value || pendingCommand.value || roundNeedsRestart.value) return
    if (!activeBlock.value || !currentReviewId.value) return
    if (!['REVIEW_CHECK', 'FUZZY_RECALL', 'FUZZY_CHECK'].includes(phase.value)) return
    const prev = progressByBlock.get(activeBlock.value.id)
    const shouldReopenWithChain = currentMode.value === 'FUZZY' && prev?.corrected === true
    if (shouldReopenWithChain) {
      const pending = buildPendingPayload('LEARNING_REOPENED', currentReviewId.value, 'AGAIN', {
        includeReviewId: true,
      })
      if (!pending) return
      await executePending(pending)
      return
    }
    const pending = buildPendingPayload('REVIEW_CORRECTED', currentReviewId.value, 'AGAIN')
    if (!pending) return
    await executePending(pending)
  }

  async function reopenMasteredBlock(): Promise<void> {
    if (submitting.value || loading.value || pendingCommand.value || roundNeedsRestart.value) return
    if (phase.value !== 'REVIEW_RECALL' || !activeBlock.value || !currentState.value?.mastered) return
    const pending = buildPendingPayload('LEARNING_REOPENED', null)
    if (!pending) return
    await executePending(pending)
  }

  async function retryPending(): Promise<void> {
    if (!pendingCommand.value || submitting.value || loading.value) return
    await executePending(pendingCommand.value)
  }

  async function discardPendingAndReload(): Promise<void> {
    if (submitting.value || loading.value) return
    const userId = auth.user?.id
    const serverDeviceId = auth.serverDeviceId
    const clientCmdId = pendingCommand.value?.body.clientCommandId
    if (userId && serverDeviceId && clientCmdId) {
      removeStoredPendingIfMatch(lifecyclePendingStorageKey(userId, serverDeviceId), clientCmdId)
    }
    await startRound(roundMode.value, groupSize.value, activeSubjectId.value || optionSubjectId.value)
  }

  watch(
    [() => auth.isAuthenticated, () => auth.user?.id, () => auth.serverDeviceId, () => auth.sessionId],
    () => {
      clearRoundVisuals()
    },
    { flush: 'sync' },
  )

  if (options?.subjectId) {
    watch(
      [() => auth.sessionId, () => auth.serverDeviceId, () => auth.user?.id, optionEnabled, optionSubjectId],
      () => {
        clearRoundVisuals()
        if (!optionEnabled.value || !optionSubjectId.value) return
        const targetId = optionSubjectId.value
        const capturedRev = scopeRevision
        void nextTick(() => {
          if (scopeRevision !== capturedRev || !optionEnabled.value || optionSubjectId.value !== targetId) return
          const mode = options.initialMode ? options.initialMode() : 'review'
          const size = options.initialGroupSize ? options.initialGroupSize() : 5
          void startRound(mode, size, targetId)
        })
      },
      { flush: 'sync', immediate: true },
    )
  }

  onUnmounted(clearRoundVisuals)

  return {
    roundMode,
    groupSize,
    phase,
    currentMode,
    activeSubjectId,
    roundId,
    loading,
    submitting,
    loadError,
    actionError,
    roundNeedsRestart,
    unsyncedBlockCount,
    activeBlock,
    currentState,
    currentRating,
    currentReviewId,
    subjectStates,
    queue,
    remainingIds,
    firstGroupCount,
    fuzzyPendingIds,
    fuzzyQueueIds,
    completedIds,
    fuzzyCompletedIds,
    firstFeedbackByBlock,
    pendingCommand,
    pendingIsConflict,
    selfTestCount,
    hasPendingCommand,
    isRecallHidden,
    isContentVisible,
    isMasteredCard,
    progressCurrent,
    progressTotal,
    completedCount,
    firstFeedbackCounts,
    startRound,
    continueNextGroup,
    startSelfTestRound,
    switchToDueReview,
    reloadCurrentRound,
    beginLearningRecall,
    revealAnswer,
    failLearning,
    completeLearning,
    selectRating,
    confirmReview,
    correctReview,
    reopenMasteredBlock,
    retryPending,
    discardPendingAndReload,
  }
}
