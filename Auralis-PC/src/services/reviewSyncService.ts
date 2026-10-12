import type { SyncRequestScopeTicket } from '@/api/request'
import { useReviewApi, type EffectiveReviewView, type LifecycleCommandResponse, type LifecycleHistoryCommandView, type LifecycleHistoryResponse } from '@/api/useReviewApi'
import type { LocalSqlDatabase } from './localSchema'
import { LocalReviewService } from './localReviewService'
import { ReviewRepository, type LocalReviewCanonicalAnchor, type LocalReviewIntent, type LocalReviewRecord } from './reviewRepository'
import type { LocalRepository } from './localRepository'

export interface ReviewSyncResult {
  protocolBlocked: boolean
  conflictCount: number
  syncedCommandCount: number
}

function instantMicros(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return null
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d\d:\d\d$)/)?.[1] ?? ''
  return milliseconds * 1000 + Number(fraction.slice(3, 6).padEnd(3, '0'))
}

function sameFrozenInstant(actual: unknown, expected: unknown): boolean {
  const actualMicros = instantMicros(actual)
  const expectedMicros = instantMicros(expected)
  return actualMicros !== null && actualMicros === expectedMicros
}

function isScopeCurrent(scope?: SyncRequestScopeTicket): boolean {
  return !scope || scope.isCurrent()
}

function classifyStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as Record<string, any>
  return typeof value.status === 'number' ? value.status
    : typeof value.problem?.status === 'number' ? value.problem.status
      : typeof value.response?.status === 'number' ? value.response.status : null
}

async function hashContent(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function currentContentHash(payload: Record<string, unknown>): Promise<string | null> {
  if (typeof payload.content === 'string') return hashContent(payload.content)
  const value = payload.content_hash ?? payload.contentHash
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : stableJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function sameRowsByIdentity(
  left: readonly Record<string, unknown>[],
  right: readonly Record<string, unknown>[],
  identityField: string,
): boolean {
  if (left.length !== right.length) return false
  const signatures = new Map<string, string>()
  for (const row of left) {
    const identity = row[identityField]
    if (typeof identity !== 'string' || identity.length === 0 || signatures.has(identity)) return false
    signatures.set(identity, stableJson(row))
  }
  if (signatures.size !== right.length) return false
  const seen = new Set<string>()
  for (const row of right) {
    const identity = row[identityField]
    if (typeof identity !== 'string' || identity.length === 0 || seen.has(identity)
      || signatures.get(identity) !== stableJson(row)) return false
    seen.add(identity)
  }
  return seen.size === signatures.size
}

function sameCommands(left: LifecycleHistoryCommandView[], right: LifecycleHistoryCommandView[]): boolean {
  return sameRowsByIdentity(left, right, 'clientCommandId')
}

function sameEffectiveReviews(left: EffectiveReviewView[], right: EffectiveReviewView[]): boolean {
  return sameRowsByIdentity(left, right, 'reviewId')
}

function canonicalState(state: LifecycleHistoryResponse['state']): LifecycleHistoryResponse['state'] {
  if (!state) return null
  const {
    canonicalVersion: _canonicalVersion,
    persistedStatePresent: _persistedStatePresent,
    statePresenceKnown: _statePresenceKnown,
    historyImported: _historyImported,
    pendingReviewRating: _pendingReviewRating,
    pendingReviewSelectedAt: _pendingReviewSelectedAt,
    pendingReviewBaseline: _pendingReviewBaseline,
    ...serverState
  } = state as LifecycleHistoryResponse['state'] & Record<string, unknown>
  return JSON.parse(JSON.stringify(serverState)) as LifecycleHistoryResponse['state']
}

function anchorFromFetched(
  history: LifecycleHistoryResponse,
  subjectId: string,
  contentHash: string,
): LocalReviewCanonicalAnchor | null {
  return {
    knowledgeBlockVersion: history.knowledgeBlockVersion,
    subjectId,
    contentHash,
    state: canonicalState(history.state),
    commands: JSON.parse(JSON.stringify(history.commands)),
    effectiveReviews: JSON.parse(JSON.stringify(history.effectiveReviews)),
  }
}

function matchesContentInvalidation(
  anchor: LocalReviewCanonicalAnchor,
  history: LifecycleHistoryResponse,
  subjectId: string,
  currentHash: string,
): boolean {
  if (anchor.subjectId !== subjectId || !sameCommands(anchor.commands, history.commands)) return false
  const effectiveReviews = anchor.effectiveReviews.map(review => review.resolution === null
    ? { ...review, resolution: 'SUPERSEDED' as const }
    : review)
  if (!sameEffectiveReviews(effectiveReviews, history.effectiveReviews)) return false
  if (anchor.state === null) return history.state === null
  const remote = history.state
  if (!remote || !Number.isSafeInteger(remote.version) || remote.version <= anchor.state.version
    || remote.knowledgeBlockVersion !== history.knowledgeBlockVersion || remote.contentHash !== currentHash
    || remote.needsLearning !== true || remote.mastered !== false || remote.stableSuccessCount !== 0
    || remote.nextReviewStage !== 'EARLY_RECALL' || remote.lastReviewId !== null || remote.pendingReviewId !== null) return false
  const allowedChanged = new Set([
    'version', 'knowledgeBlockVersion', 'contentHash', 'needsLearning', 'mastered',
    'stableSuccessCount', 'nextReviewStage', 'lastReviewId', 'pendingReviewId', 'updatedAt',
  ])
  for (const key of new Set([...Object.keys(anchor.state), ...Object.keys(remote)])) {
    if (allowedChanged.has(key)) continue
    if (stableJson((anchor.state as any)[key]) !== stableJson((remote as any)[key])) return false
  }
  if (remote.updatedAt !== undefined && (typeof remote.updatedAt !== 'string' || !Number.isFinite(Date.parse(remote.updatedAt)))) return false
  return true
}

function sameRemoteAnchor(
  anchor: LocalReviewCanonicalAnchor,
  history: LifecycleHistoryResponse,
  subjectId: string,
  contentHash: string,
): boolean {
  const fetched = anchorFromFetched(history, subjectId, contentHash)
  return !!fetched
    && anchor.knowledgeBlockVersion === fetched.knowledgeBlockVersion
    && anchor.subjectId === fetched.subjectId
    && anchor.contentHash === fetched.contentHash
    && stableJson(anchor.state) === stableJson(fetched.state)
    && sameCommands(anchor.commands, fetched.commands)
    && sameEffectiveReviews(anchor.effectiveReviews, fetched.effectiveReviews)
}

function matchesMetadataOnlyUpdate(
  anchor: LocalReviewCanonicalAnchor,
  history: LifecycleHistoryResponse,
  currentHash: string,
): boolean {
  // Subject moves and other metadata-only KB revisions do not change review
  // state. The current local KB/parent were already re-read inside the atomic
  // preparation boundary; compare the full server review history and body
  // hash here while allowing its scope/version metadata to advance.
  if (anchor.contentHash !== currentHash
    || history.knowledgeBlockVersion < anchor.knowledgeBlockVersion
    || stableJson(anchor.state) !== stableJson(canonicalState(history.state))
    || !sameCommands(anchor.commands, history.commands)
    || !sameEffectiveReviews(anchor.effectiveReviews, history.effectiveReviews)) return false
  return true
}

function assertReceipt(response: LifecycleCommandResponse, intent: LocalReviewIntent): void {
  const request = intent.payload
  const baseVersion = Number(request.baseVersion)
  const receiptVersion = response.state?.version
  if (response.clientCommandId !== intent.clientCommandId || response.action !== intent.action
    || !sameFrozenInstant(response.occurredAt, intent.occurredAt)
    || response.state?.knowledgeBlockId !== intent.knowledgeBlockId
    // Do not infer JPA's @Version behavior from the request. The first insert
    // is version 0 in the current service; retries and later responses must be
    // accepted at the actual non-negative version returned by the server.
    || !Number.isSafeInteger(receiptVersion) || Number(receiptVersion) < baseVersion
    || response.state.knowledgeBlockVersion !== Number(request.knowledgeBlockVersion)
    || response.state.contentHash !== request.contentHash) {
    throw new Error('REVIEW_RECEIPT_MISMATCH')
  }
  if (intent.action === 'REVIEW_SELECTED' || intent.action === 'REVIEW_CONFIRMED' || intent.action === 'REVIEW_CORRECTED') {
    const baseline = response.effectiveReview?.schedulingBaseline
    if (!response.effectiveReview || !baseline
      || (baseline.dueAt !== null && (typeof baseline.dueAt !== 'string' || !Number.isFinite(Date.parse(baseline.dueAt))))
      || typeof baseline.mastered !== 'boolean'
      || !Number.isSafeInteger(baseline.stableSuccessCount)
      || (baseline.nextReviewStage !== null && !['EARLY_RECALL', 'CROSS_DAY', 'FINAL_VERIFICATION'].includes(String(baseline.nextReviewStage)))
      || (baseline.lastPracticeAt !== null && (typeof baseline.lastPracticeAt !== 'string' || !Number.isFinite(Date.parse(baseline.lastPracticeAt))))
      || !Number.isFinite(baseline.stability)) {
      throw new Error('REVIEW_RECEIPT_BASELINE_MISSING')
    }
  }
}

function mergeEffectiveReview(current: LocalReviewRecord['effectiveReviews'], incoming: LifecycleCommandResponse['effectiveReview']): LocalReviewRecord['effectiveReviews'] {
  if (!incoming) return current
  const index = current.findIndex(item => item.reviewId === incoming.reviewId)
  if (index < 0) return [...current, incoming]
  const existing = current[index]
  // A frozen selection receipt may arrive after a later confirmation. Keep the
  // resolved row while still accepting its command acknowledgement.
  const keepExisting = !!existing.resolvedAt && !incoming.resolvedAt
  const next = current.slice()
  next[index] = keepExisting ? existing : incoming
  return next
}

function mergeCommandHistory(current: LocalReviewRecord['history'], response: LifecycleCommandResponse, intent: LocalReviewIntent): NonNullable<LocalReviewRecord['history']> {
  const history = current ?? []
  const command = {
    commandId: response.commandId,
    clientCommandId: response.clientCommandId,
    action: response.action,
    occurredAt: response.occurredAt,
    reviewId: response.effectiveReview?.reviewId ?? (typeof intent.payload.reviewId === 'string' ? intent.payload.reviewId : null),
    rating: typeof intent.payload.rating === 'string' ? intent.payload.rating as any : null,
    durationSeconds: typeof intent.payload.durationSeconds === 'number' ? intent.payload.durationSeconds : null,
    baseVersion: Number(intent.payload.baseVersion),
    knowledgeBlockVersion: response.knowledgeBlockVersion,
  }
  const index = history.findIndex(item => item.clientCommandId === intent.clientCommandId)
  if (index < 0) return [...history, command]
  const updated = history.slice()
  updated[index] = command
  return updated
}

function canonicalCommand(response: LifecycleCommandResponse, intent: LocalReviewIntent): LifecycleHistoryResponse['commands'][number] {
  return {
    commandId: response.commandId,
    clientCommandId: response.clientCommandId,
    action: response.action,
    occurredAt: response.occurredAt,
    reviewId: typeof intent.payload.reviewId === 'string' ? intent.payload.reviewId : response.effectiveReview?.reviewId ?? null,
    rating: typeof intent.payload.rating === 'string' ? intent.payload.rating as any : null,
    durationSeconds: typeof intent.payload.durationSeconds === 'number' ? intent.payload.durationSeconds : null,
    baseVersion: Number(intent.payload.baseVersion),
    knowledgeBlockVersion: response.knowledgeBlockVersion,
  }
}

function mergeCanonicalCommand(
  current: LifecycleHistoryResponse['commands'],
  response: LifecycleCommandResponse,
  intent: LocalReviewIntent,
): LifecycleHistoryResponse['commands'] {
  const command = canonicalCommand(response, intent)
  const index = current.findIndex(item => item.clientCommandId === intent.clientCommandId)
  if (index < 0) return [...current, command]
  const next = current.slice()
  next[index] = command
  return next
}

function validateHistory(history: LifecycleHistoryResponse, kbId: string): boolean {
  return history?.protocolVersion === 2
    && history.knowledgeBlockId === kbId
    && Number.isSafeInteger(history.knowledgeBlockVersion) && history.knowledgeBlockVersion >= 0
    && Array.isArray(history.commands) && Array.isArray(history.effectiveReviews)
    && (history.state === null || (Number.isSafeInteger(history.state.version) && history.state.version >= 0
      && Number.isSafeInteger(history.state.knowledgeBlockVersion) && history.state.knowledgeBlockVersion >= 0))
}

export class ReviewSyncService {
  private readonly repository: ReviewRepository
  private readonly localReview: LocalReviewService
  private readonly localRepository: LocalRepository

  constructor(
    db: LocalSqlDatabase | 'localstorage',
    localRepository: LocalRepository,
  ) {
    this.repository = new ReviewRepository(db, localRepository)
    this.localReview = new LocalReviewService(db, localRepository)
    this.localRepository = localRepository
  }

  private async prepareIntent(
    userId: string,
    deviceId: string,
    kbId: string,
    subjectId: string,
    intent: LocalReviewIntent,
    history: LifecycleHistoryResponse,
  ): Promise<'prepared' | 'deferred' | 'conflict'> {
    if (!validateHistory(history, kbId)) return 'deferred'
    let outcome: 'prepared' | 'deferred' | 'conflict' = 'deferred'
    await this.repository.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
      const latest = await this.repository.getIntent(tx, userId, deviceId, intent.clientCommandId)
      if (!latest || latest.prepared || latest.status !== 'pending'
        || stableJson(latest.payload) !== stableJson(intent.payload)
        || !kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) return
      if (await this.repository.hasUnresolvedCoreMutation(tx, userId, kbId)) return
      const payload = JSON.parse(kbResource.payload) as Record<string, unknown>
      const actualSubjectId = payload.subject_id ?? payload.subjectId
      const actualHash = await currentContentHash(payload)
      if (actualSubjectId !== subjectId || !actualHash
        || Number(kbResource.version) !== history.knowledgeBlockVersion
        || intent.payload.contentHash !== actualHash
        || !currentRecord || currentRecord.subjectId !== subjectId
        || currentRecord.contentHash !== actualHash) {
        outcome = 'conflict'
        await this.repository.updateIntentStatus(tx, userId, deviceId, intent.clientCommandId, 'conflict')
        return
      }

      const preparation = latest.preparation
      const anchor = currentRecord.canonicalAnchor
      let baselineMatches = false
      let metadataOnlyMatches = false
      let contentInvalidationMatches = false
      let localCreateMatches = false
      let unknownEmptyRemoteMatches = false
      let unknownAcknowledgedPrefixMatches = false
      if (anchor && preparation.anchorFingerprint) {
        const currentFingerprint = stableJson(anchor)
        const initialAnchorStillCurrent = currentFingerprint === preparation.anchorFingerprint
        let acknowledgedPredecessorExtension = false
        if (!initialAnchorStillCurrent && preparation.predecessorClientCommandIds.length > 0
          && anchor.subjectId === preparation.anchorSubjectId
          && anchor.contentHash === preparation.anchorContentHash) {
          const currentIds = new Set(anchor.commands.map(command => command.clientCommandId))
          const originalIds = new Set(preparation.anchorCommandIds)
          const addedIds = [...currentIds].filter(id => !originalIds.has(id))
          const predecessorIds = new Set(preparation.predecessorClientCommandIds)
          acknowledgedPredecessorExtension = preparation.anchorCommandIds.every(id => currentIds.has(id))
            && preparation.predecessorClientCommandIds.every(id => currentIds.has(id))
            && addedIds.every(id => predecessorIds.has(id))
        }
        const allowedLineage = initialAnchorStillCurrent || acknowledgedPredecessorExtension
        if (allowedLineage && anchor.contentHash === actualHash
          && (preparation.predecessorClientCommandIds.length === 0
            || preparation.predecessorClientCommandIds.every(id => anchor.commands.some(command => command.clientCommandId === id)))) {
          baselineMatches = sameRemoteAnchor(anchor, history, subjectId, actualHash)
          metadataOnlyMatches = matchesMetadataOnlyUpdate(anchor, history, actualHash)
        }
        if (preparation.allowContentInvalidation && preparation.predecessorClientCommandIds.length === 0
          && preparation.anchorFingerprint === currentFingerprint
          && anchor.subjectId === subjectId
          && matchesContentInvalidation(anchor, history, subjectId, actualHash)) {
          contentInvalidationMatches = true
        }
      } else if (!anchor && preparation.anchorFingerprint === null && preparation.knownLocalCreate
        && history.state === null && history.commands.length === 0 && history.effectiveReviews.length === 0
        && intent.payload.expectedStateAbsent === true) {
        localCreateMatches = true
      } else if (!anchor && preparation.anchorFingerprint === null && !preparation.knownLocalCreate
        && preparation.predecessorClientCommandIds.length === 0
        && intent.action === 'LEARNING_COMPLETED' && typeof intent.payload.reviewId !== 'string'
        && intent.payload.expectedStateAbsent === true
        && history.state === null && history.commands.length === 0 && history.effectiveReviews.length === 0) {
        // The remote state was unknown when local learning was saved. The v2
        // lifecycle response must prove an empty history before binding the
        // first unprepared learning command to absence.
        unknownEmptyRemoteMatches = true
      } else if (anchor && preparation.anchorFingerprint === null && preparation.knownLocalCreate
        && preparation.predecessorClientCommandIds.length > 0
        && anchor.subjectId === subjectId && anchor.contentHash === actualHash
        && preparation.predecessorClientCommandIds.every(id => anchor.commands.some(command => command.clientCommandId === id))) {
        const predecessorIds = new Set(preparation.predecessorClientCommandIds)
        localCreateMatches = anchor.commands.every(command => predecessorIds.has(command.clientCommandId))
          && sameRemoteAnchor(anchor, history, subjectId, actualHash)
      } else if (anchor && preparation.anchorFingerprint === null && !preparation.knownLocalCreate
        && preparation.predecessorClientCommandIds.length > 0
        && anchor.subjectId === subjectId && anchor.contentHash === actualHash
        && preparation.predecessorClientCommandIds.every(id => anchor.commands.some(command => command.clientCommandId === id))) {
        const predecessorIds = new Set(preparation.predecessorClientCommandIds)
        const startsWithAcknowledgedFirstLearning = anchor.commands.some(command =>
          command.action === 'LEARNING_COMPLETED' && command.baseVersion === 0 && predecessorIds.has(command.clientCommandId))
        // An unknown cloud state can continue only after the first absent-state
        // learning was accepted from a proven-empty history. Every canonical
        // row must be that same local ACK prefix; any other device event or
        // history change fails the full anchor comparison below.
        unknownAcknowledgedPrefixMatches = startsWithAcknowledgedFirstLearning
          && anchor.commands.every(command => predecessorIds.has(command.clientCommandId))
          && sameRemoteAnchor(anchor, history, subjectId, actualHash)
      }

      const hasKnownAnchor = baselineMatches || metadataOnlyMatches || contentInvalidationMatches
        || localCreateMatches || unknownEmptyRemoteMatches || unknownAcknowledgedPrefixMatches
      const remoteStateAbsent = history.state === null
      if (!hasKnownAnchor || intent.payload.expectedStateAbsent !== remoteStateAbsent) {
        outcome = 'conflict'
        await this.repository.updateIntentStatus(tx, userId, deviceId, intent.clientCommandId, 'conflict')
        return
      }

      const preparedPayload = {
        ...intent.payload,
        baseVersion: history.state?.version ?? 0,
        // Presence is a separate protocol value; preserve the command's
        // captured expectation and never infer it from version zero.
        expectedStateAbsent: intent.payload.expectedStateAbsent,
        knowledgeBlockVersion: history.knowledgeBlockVersion,
        contentHash: actualHash,
      }
      const frozen = await this.repository.freezePreparedIntent(
        tx, userId, deviceId, intent.clientCommandId, intent.payload, preparedPayload,
      )
      if (frozen) outcome = 'prepared'
    })
    return outcome
  }

  async syncAllPending(userId: string, deviceId: string, scope?: SyncRequestScopeTicket): Promise<ReviewSyncResult> {
    const result: ReviewSyncResult = { protocolBlocked: false, conflictCount: 0, syncedCommandCount: 0 }
    const blocks = await this.localReview.listSyncBlocks(userId)
    // Take one outer snapshot to avoid re-scanning all local mutations for
    // each KB. The atomic claim below checks the same KB again before POST.
    const unresolvedCoreIds = new Set((await this.localRepository.listUnresolved('KNOWLEDGE_BLOCK'))
      .map(mutation => mutation.resourceId))
    const qualifiedSubjects = new Set<string>()
    for (const block of blocks) {
      if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
      try {
        // A subject read checks and persists body-hash invalidation for every
        // block in that subject. Do that once per sync pass, not once per KB.
        if (!qualifiedSubjects.has(block.subjectId)) {
          await this.localReview.getSubjectStates(userId, deviceId, block.subjectId)
          if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
          qualifiedSubjects.add(block.subjectId)
        }
        if (unresolvedCoreIds.has(block.id)) continue
        const unresolved = await this.repository.getUnresolvedIntents(userId, deviceId, [block.id])
        if (unresolved.some(intent => intent.status === 'conflict')) {
          result.conflictCount += 1
          continue
        }
        const pending = await this.repository.getPendingIntents(userId, deviceId, block.id)
        if (!pending.length) {
          const history = await useReviewApi.getLifecycleHistory({ knowledgeBlockId: block.id }, scope)
          if (!validateHistory(history, block.id)) {
            result.protocolBlocked = true
            continue
          }
          await this.localReview.importLifecycleHistory(userId, deviceId, block.id, history)
          continue
        }

        const synced = await this.syncKbQueue(userId, deviceId, block.id, block.subjectId, pending, scope)
        result.syncedCommandCount += synced.synced
        result.conflictCount += synced.conflict ? 1 : 0
        result.protocolBlocked ||= synced.protocolBlocked
      } catch (error) {
        if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
        // The normal auth interceptor remains responsible for real 401s.
        if (classifyStatus(error) === 401) throw error
        if (error instanceof Error && error.message === 'SYNC_SCOPE_CHANGED') throw error
        console.warn('[ReviewSyncService] review reconciliation deferred', error)
      }
    }
    return result
  }

  private async syncKbQueue(
    userId: string,
    deviceId: string,
    kbId: string,
    subjectId: string,
    initialQueue: LocalReviewIntent[],
    scope?: SyncRequestScopeTicket,
  ): Promise<{ synced: number; conflict: boolean; protocolBlocked: boolean }> {
    let synced = 0
    for (const queuedIntent of initialQueue) {
      if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
      const currentQueue = await this.repository.getPendingIntents(userId, deviceId, kbId)
      let intent = currentQueue.find(item => item.clientCommandId === queuedIntent.clientCommandId)
      if (!intent) continue
      const currentState = await this.localReview.getKnowledgeBlockState(userId, deviceId, kbId, subjectId)
      if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
      if (!currentState || currentState.knowledgeBlockVersion !== Number(intent.payload.knowledgeBlockVersion)
        || currentState.contentHash !== intent.payload.contentHash) {
        // The local service archives intents when it detects a body revision.
        return { synced, conflict: false, protocolBlocked: false }
      }

      // Every attempted dispatch, including recovery of an already prepared
      // request, is gated by the server's v2 history contract.
      const history = await useReviewApi.getLifecycleHistory({ knowledgeBlockId: kbId }, scope)
      if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
      if (!validateHistory(history, kbId)) {
        return { synced, conflict: false, protocolBlocked: true }
      }
      if (!intent.prepared) {
        const preparation = await this.prepareIntent(userId, deviceId, kbId, subjectId, intent, history)
        if (preparation === 'deferred') return { synced, conflict: false, protocolBlocked: false }
        if (preparation === 'conflict') return { synced, conflict: true, protocolBlocked: false }
        const refreshed = await this.repository.getPendingIntents(userId, deviceId, kbId)
        intent = refreshed.find(item => item.clientCommandId === queuedIntent.clientCommandId)
        if (!intent || !intent.prepared) return { synced, conflict: false, protocolBlocked: false }
      }

      let claimed = false
      await this.repository.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, _currentRecord, kbResource, subjectResource) => {
        const latest = await this.repository.getIntent(tx, userId, deviceId, intent.clientCommandId)
        if (!latest || !latest.prepared || stableJson(latest.payload) !== stableJson(intent.payload)
          || (latest.status !== 'pending' && latest.status !== 'inflight')
          || !kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) return false
        if (await this.repository.hasUnresolvedCoreMutation(tx, userId, kbId)) return false
        const corePayload = JSON.parse(kbResource.payload) as Record<string, unknown>
        const actualSubjectId = corePayload.subject_id ?? corePayload.subjectId
        const actualHash = await currentContentHash(corePayload)
        if (actualSubjectId !== subjectId
          || Number(kbResource.version) !== Number(intent.payload.knowledgeBlockVersion)
          || !actualHash || actualHash !== intent.payload.contentHash) return false
        await this.repository.updateIntentStatus(tx, userId, deviceId, intent.clientCommandId, 'inflight')
        claimed = true
        return true
      })
      if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
      if (!claimed) return { synced, conflict: false, protocolBlocked: false }

      try {
        const response = await this.dispatch(intent, scope)
        if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
        assertReceipt(response, intent)
        let committed = false
        await this.repository.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
          if (!isScopeCurrent(scope)) return
          const latest = await this.repository.getIntent(tx, userId, deviceId, intent.clientCommandId)
          if (!latest || !latest.prepared || latest.status !== 'inflight' || stableJson(latest.payload) !== stableJson(intent.payload)
            || !kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) return
          const corePayload = JSON.parse(kbResource.payload) as Record<string, unknown>
          const actualSubjectId = corePayload.subject_id ?? corePayload.subjectId
          const actualHash = await currentContentHash(corePayload)
          if (!actualHash || actualSubjectId !== subjectId
            || Number(kbResource.version) !== Number(intent.payload.knowledgeBlockVersion)
            || actualHash !== intent.payload.contentHash
            || (currentRecord && (currentRecord.subjectId !== subjectId || currentRecord.contentHash !== actualHash))) return

          // Hashing awaits crypto. Re-read the core resource, parent and frozen
          // intent after that await so an intervening edit/tombstone/archive
          // cannot be overwritten by this older receipt.
          const [latestKb, latestSubject, latestIntent] = await Promise.all([
            this.repository.getKbResource(tx, userId, kbId),
            this.repository.getSubjectResource(tx, userId, subjectId),
            this.repository.getIntent(tx, userId, deviceId, intent.clientCommandId),
          ])
          if (!isScopeCurrent(scope) || !latestKb || latestKb.deleted_at || !latestSubject || latestSubject.deleted_at
            || latestKb.version !== kbResource.version || latestKb.payload !== kbResource.payload
            || !latestIntent || latestIntent.status !== 'inflight'
            || stableJson(latestIntent.payload) !== stableJson(intent.payload)) return
          const currentVersion = currentRecord?.state?.version ?? 0
          const currentCanonical = Number((currentRecord?.state as any)?.canonicalVersion ?? 0)
          const receiptVersion = response.state.version
          const state = currentRecord?.state && currentVersion > receiptVersion
            ? { ...currentRecord.state, canonicalVersion: Math.max(currentCanonical, receiptVersion) } as any
            : { ...response.state, canonicalVersion: Math.max(currentCanonical, receiptVersion) } as any
          const previousAnchor = currentRecord?.canonicalAnchor ?? null
          const canonicalAnchor: LocalReviewCanonicalAnchor = {
            knowledgeBlockVersion: response.knowledgeBlockVersion,
            subjectId,
            contentHash: String(intent.payload.contentHash),
            state: canonicalState(response.state),
            commands: mergeCanonicalCommand(previousAnchor?.commands ?? [], response, intent),
            effectiveReviews: mergeEffectiveReview(previousAnchor?.effectiveReviews ?? [], response.effectiveReview),
          }
          const record: LocalReviewRecord = {
            knowledgeBlockId: kbId,
            subjectId,
            localRevision: (currentRecord?.localRevision ?? 0) + 1,
            serverKnowledgeBlockVersion: response.knowledgeBlockVersion,
            contentHash: String(intent.payload.contentHash),
            state,
            history: mergeCommandHistory(currentRecord?.history ?? [], response, intent),
            effectiveReviews: mergeEffectiveReview(currentRecord?.effectiveReviews ?? [], response.effectiveReview),
            historyImported: currentRecord?.historyImported ?? false,
            canonicalAnchor,
            isPresenceMarker: currentRecord?.isPresenceMarker ?? false,
            updatedAt: new Date().toISOString(),
          }
          await this.repository.saveReceiptAndAcknowledge(tx, userId, deviceId, record, intent.clientCommandId)
          committed = true
        })
        if (committed) synced += 1
        else return { synced, conflict: false, protocolBlocked: false }
      } catch (error) {
        if (!isScopeCurrent(scope) || (error instanceof Error && error.message === 'SYNC_SCOPE_CHANGED')) throw new Error('SYNC_SCOPE_CHANGED')
        if (classifyStatus(error) === 401) throw error
        if (classifyStatus(error) === 409 || (error instanceof Error && /409|RESOURCE_VERSION_CONFLICT/.test(error.message))) {
          let conflict = false
          await this.repository.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx) => {
            const latest = await this.repository.getIntent(tx, userId, deviceId, intent.clientCommandId)
            if (!isScopeCurrent(scope) || !latest || latest.status !== 'inflight' || !latest.prepared
              || stableJson(latest.payload) !== stableJson(intent.payload)) return
            const [kbResource, subjectResource] = await Promise.all([
              this.repository.getKbResource(tx, userId, kbId),
              this.repository.getSubjectResource(tx, userId, subjectId),
            ])
            if (!kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) return
            const corePayload = JSON.parse(kbResource.payload) as Record<string, unknown>
            const actualSubjectId = corePayload.subject_id ?? corePayload.subjectId
            const actualHash = await currentContentHash(corePayload)
            if (actualSubjectId !== subjectId || !actualHash
              || Number(kbResource.version) !== Number(intent.payload.knowledgeBlockVersion)
              || actualHash !== intent.payload.contentHash) return
            const [latestKb, latestSubject, latestIntent] = await Promise.all([
              this.repository.getKbResource(tx, userId, kbId),
              this.repository.getSubjectResource(tx, userId, subjectId),
              this.repository.getIntent(tx, userId, deviceId, intent.clientCommandId),
            ])
            if (!isScopeCurrent(scope) || !latestKb || latestKb.deleted_at || !latestSubject || latestSubject.deleted_at
              || latestKb.version !== kbResource.version || latestKb.payload !== kbResource.payload
              || !latestIntent || latestIntent.status !== 'inflight'
              || stableJson(latestIntent.payload) !== stableJson(intent.payload)) return
            await this.repository.updateIntentStatus(tx, userId, deviceId, intent.clientCommandId, 'conflict')
            conflict = true
          })
          return { synced, conflict, protocolBlocked: false }
        }
        // Network/5xx/unknown outcomes remain INFLIGHT with the same immutable
        // request, so a retry can recover an acknowledgement lost in transit.
        return { synced, conflict: false, protocolBlocked: false }
      }
    }
    return { synced, conflict: false, protocolBlocked: false }
  }

  private async dispatch(intent: LocalReviewIntent, scope?: SyncRequestScopeTicket): Promise<LifecycleCommandResponse> {
    const { reviewId: payloadReviewId, ...body } = intent.payload
    const requestWithOptionalReviewId = payloadReviewId
      ? { ...body, reviewId: String(payloadReviewId) }
      : body
    if (intent.action === 'LEARNING_COMPLETED') return useReviewApi.completeLearning(requestWithOptionalReviewId as any, scope)
    if (intent.action === 'LEARNING_REOPENED') return useReviewApi.reopenLearning(requestWithOptionalReviewId as any, scope)
    if (intent.action === 'REVIEW_SELECTED') {
      if (!payloadReviewId) throw new Error('REVIEW_ID_MISSING')
      return useReviewApi.selectReview({ ...body, reviewId: String(payloadReviewId) } as any, scope)
    }
    const reviewId = String(payloadReviewId ?? '')
    if (!reviewId) throw new Error('REVIEW_ID_MISSING')
    if (intent.action === 'REVIEW_CONFIRMED') return useReviewApi.confirmReview(reviewId, body as any, scope)
    if (intent.action === 'REVIEW_CORRECTED') return useReviewApi.correctReview(reviewId, body as any, scope)
    throw new Error('REVIEW_ACTION_UNSUPPORTED')
  }
}
