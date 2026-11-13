import type { SyncRequestScopeTicket } from '@/api/request'
import { useReviewApi, type EffectiveReviewView, type LifecycleCommandResponse, type LifecycleHistoryCommandView, type LifecycleHistoryResponse } from '@/api/useReviewApi'
import type { LocalSqlDatabase } from './localSchema'
import { LocalReviewService } from './localReviewService'
import { ReviewRepository, type LocalReviewCanonicalAnchor, type LocalReviewIntent, type LocalReviewRecord } from './reviewRepository'
import type { LocalRepository } from './localRepository'

const REVIEW_SYNC_BLOCK_CONCURRENCY = 3

export interface ReviewSyncResult {
  protocolBlocked: boolean
  conflictCount: number
  syncedCommandCount: number
}

function parseAuditTimestampMicros(value: unknown): bigint | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i)
  if (!match) return null
  const [, baseTime, fractionStr = '', tz] = match
  const baseIso = `${baseTime}${tz}`
  const baseMs = Date.parse(baseIso)
  if (!Number.isFinite(baseMs)) return null
  const baseSeconds = BigInt(Math.floor(baseMs / 1000))
  const padded = fractionStr.padEnd(7, '0')
  const microsPart = BigInt(padded.slice(0, 6))
  const seventhDigit = Number(padded[6])
  const roundedMicros = seventhDigit >= 5 ? microsPart + 1n : microsPart
  return baseSeconds * 1_000_000n + roundedMicros
}

function sameAuditInstant(actual: unknown, expected: unknown): boolean {
  const actualMicros = parseAuditTimestampMicros(actual)
  const expectedMicros = parseAuditTimestampMicros(expected)
  return actualMicros !== null && expectedMicros !== null && actualMicros === expectedMicros
}

function sameFrozenInstant(actual: unknown, expected: unknown): boolean {
  return sameAuditInstant(actual, expected)
}

function sameAuditField(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left === 'string' && typeof right === 'string') {
    return sameAuditInstant(left, right)
  }
  return false
}

function sameCanonicalReviewState(
  left: LifecycleHistoryResponse['state'],
  right: LifecycleHistoryResponse['state'],
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  if (typeof left !== 'object' || typeof right !== 'object') return false
  if (!sameAuditField(left.createdAt, right.createdAt)) return false
  if (!sameAuditField(left.updatedAt, right.updatedAt)) return false
  const { createdAt: _lc, updatedAt: _lu, ...leftRest } = left as Record<string, unknown>
  const { createdAt: _rc, updatedAt: _ru, ...rightRest } = right as Record<string, unknown>
  return stableJson(leftRest) === stableJson(rightRest)
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
    if (key === 'createdAt') {
      if (!sameAuditField(anchor.state.createdAt, remote.createdAt)) return false
      continue
    }
    if (stableJson((anchor.state as any)[key]) !== stableJson((remote as any)[key])) return false
  }
  if (remote.updatedAt !== undefined && (typeof remote.updatedAt !== 'string' || parseAuditTimestampMicros(remote.updatedAt) === null)) return false
  return true
}

function sameRemoteAnchor(
  anchor: LocalReviewCanonicalAnchor,
  history: LifecycleHistoryResponse,
  subjectId: string,
  contentHash: string,
): boolean {
  if (anchor.subjectId !== subjectId || anchor.contentHash !== contentHash
    || history.knowledgeBlockVersion < anchor.knowledgeBlockVersion
    || !sameCommands(anchor.commands, history.commands)
    || !sameEffectiveReviews(anchor.effectiveReviews, history.effectiveReviews)) return false
  const remoteState = canonicalState(history.state)
  if (anchor.knowledgeBlockVersion === history.knowledgeBlockVersion) {
    return sameCanonicalReviewState(anchor.state, remoteState)
  }
  if (!anchor.state || !remoteState) return anchor.state === remoteState
  // History projects the latest core KB revision onto the same review state.
  return anchor.state.contentHash === contentHash && remoteState.contentHash === contentHash
    && anchor.state.knowledgeBlockVersion === anchor.knowledgeBlockVersion
    && remoteState.knowledgeBlockVersion === history.knowledgeBlockVersion
    && sameCanonicalReviewState({ ...anchor.state, knowledgeBlockVersion: history.knowledgeBlockVersion }, remoteState)
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
    || response.knowledgeBlockVersion !== Number(request.knowledgeBlockVersion)
    || response.state.knowledgeBlockVersion !== Number(request.knowledgeBlockVersion)
    || response.state.contentHash !== request.contentHash) {
    throw new Error('REVIEW_RECEIPT_MISMATCH')
  }
  if (intent.action === 'REVIEW_SELECTED' || intent.action === 'REVIEW_CONFIRMED' || intent.action === 'REVIEW_CORRECTED') {
    const baseline = response.effectiveReview?.schedulingBaseline
    if (!response.effectiveReview || response.effectiveReview.reviewId !== request.reviewId || !baseline
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

function acknowledgedCommand(response: LifecycleCommandResponse, intent: LocalReviewIntent): LifecycleHistoryCommandView {
  return {
    commandId: response.commandId,
    clientCommandId: response.clientCommandId,
    action: response.action,
    occurredAt: response.occurredAt,
    reviewId: typeof intent.payload.reviewId === 'string' ? intent.payload.reviewId : response.effectiveReview?.reviewId ?? null,
    rating: response.action === 'REVIEW_CORRECTED' ? 'AGAIN'
      : response.action === 'REVIEW_SELECTED' || response.action === 'REVIEW_CONFIRMED'
        ? response.effectiveReview?.selectedRating ?? null
        : null,
    durationSeconds: typeof intent.payload.durationSeconds === 'number' ? intent.payload.durationSeconds : null,
    baseVersion: Number(intent.payload.baseVersion),
    knowledgeBlockVersion: response.knowledgeBlockVersion,
  }
}

function mergeCommandHistory(
  current: LifecycleHistoryCommandView[],
  command: LifecycleHistoryCommandView,
): LifecycleHistoryCommandView[] {
  const index = current.findIndex(item => item.clientCommandId === command.clientCommandId)
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

  private async tryRecoverFalseConflict(
    userId: string,
    deviceId: string,
    kbId: string,
    subjectId: string,
    head: LocalReviewIntent,
    scope?: SyncRequestScopeTicket,
  ): Promise<boolean> {
    if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
    if (head.status !== 'conflict' || head.prepared) return false

    const history = await useReviewApi.getLifecycleHistory({ knowledgeBlockId: kbId }, scope)
    if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
    if (!validateHistory(history, kbId)) return false

    let recovered = false
    await this.repository.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
      if (!isScopeCurrent(scope)) return
      const latest = await this.repository.getIntent(tx, userId, deviceId, head.clientCommandId)
      if (!latest || latest.prepared || latest.status !== 'conflict'
        || stableJson(latest.payload) !== stableJson(head.payload)
        || stableJson(latest.preparation) !== stableJson(head.preparation)
        || !kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) return
      if (await this.repository.hasUnresolvedCoreMutation(tx, userId, kbId)) return

      const payload = JSON.parse(kbResource.payload) as Record<string, unknown>
      const actualSubjectId = payload.subject_id ?? payload.subjectId
      const actualHash = await currentContentHash(payload)
      if (actualSubjectId !== subjectId || !actualHash
        || Number(kbResource.version) !== history.knowledgeBlockVersion
        || head.payload.contentHash !== actualHash
        || !currentRecord || currentRecord.subjectId !== subjectId
        || currentRecord.contentHash !== actualHash) return

      const anchor = currentRecord.canonicalAnchor
      const preparation = latest.preparation
      if (!anchor || !preparation.anchorFingerprint) return

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
      if (!allowedLineage || anchor.contentHash !== actualHash) return
      if (preparation.predecessorClientCommandIds.length > 0
        && !preparation.predecessorClientCommandIds.every(id => anchor.commands.some(command => command.clientCommandId === id))) return

      if (anchor.subjectId !== subjectId
        || !sameCommands(anchor.commands, history.commands)
        || !sameEffectiveReviews(anchor.effectiveReviews, history.effectiveReviews)
        || head.payload.expectedStateAbsent !== (history.state === null)) return

      // Prove that strict JSON comparison failed, but canonical equivalence passes:
      const fetchedCanonical = canonicalState(history.state)
      const strictAnchorMatches = anchor.knowledgeBlockVersion === history.knowledgeBlockVersion
        && stableJson(anchor.state) === stableJson(fetchedCanonical)
      const canonicalAnchorMatches = (anchor.knowledgeBlockVersion === history.knowledgeBlockVersion
        || history.knowledgeBlockVersion >= anchor.knowledgeBlockVersion)
        && sameCanonicalReviewState(anchor.state, fetchedCanonical)

      if (strictAnchorMatches || !canonicalAnchorMatches) return

      const updated = await this.repository.recoverConflictIntentToPending(
        tx, userId, deviceId, head.clientCommandId, latest.payload, latest.preparation,
      )
      if (updated) recovered = true
    })

    return recovered
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
          // A new first learning after a move can prove absence in the new subject.
          baselineMatches = sameRemoteAnchor(anchor, history, subjectId, actualHash)
            || (initialAnchorStillCurrent && anchor.subjectId !== subjectId
            && intent.action === 'LEARNING_COMPLETED' && typeof intent.payload.reviewId !== 'string'
            && intent.payload.knowledgeBlockVersion === history.knowledgeBlockVersion
            && preparation.predecessorClientCommandIds.length === 0
            && anchor.state === null && anchor.commands.length === 0 && anchor.effectiveReviews.length === 0
            && history.state === null && history.commands.length === 0 && history.effectiveReviews.length === 0)
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

      const hasKnownAnchor = baselineMatches || contentInvalidationMatches
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
    const uniqueBlocks = [...new Map(blocks.map(block => [block.id, block])).values()]
    const subjectProjectionPromises = new Map<string, Promise<void>>()
    let nextBlockIndex = 0
    let fatalError: unknown = null

    const ensureSubjectProjection = (subjectId: string): Promise<void> => {
      const existing = subjectProjectionPromises.get(subjectId)
      if (existing) return existing
      const projection = this.localReview.getSubjectStates(userId, deviceId, subjectId).then(() => {
        if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
      })
      subjectProjectionPromises.set(subjectId, projection)
      // A transient failure may be retried by a later block in this subject;
      // concurrent blocks still share the same in-flight projection attempt.
      void projection.catch(() => {
        if (subjectProjectionPromises.get(subjectId) === projection) subjectProjectionPromises.delete(subjectId)
      })
      return projection
    }

    const processBlock = async (block: { id: string; subjectId: string }): Promise<void> => {
      if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
      try {
        // A subject read checks and persists body-hash invalidation for every
        // block in that subject. Concurrent workers share the same Promise.
        await ensureSubjectProjection(block.subjectId)
        if (unresolvedCoreIds.has(block.id)) return
        const unresolved = await this.repository.getUnresolvedIntents(userId, deviceId, [block.id])
        if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
        if (unresolved.some(intent => intent.status === 'conflict')) {
          const head = unresolved[0]
          if (head.status === 'conflict' && !head.prepared) {
            const recovered = await this.tryRecoverFalseConflict(userId, deviceId, block.id, block.subjectId, head, scope)
            if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
            if (!recovered) {
              result.conflictCount += 1
              return
            }
          } else {
            result.conflictCount += 1
            return
          }
        }
        const pending = await this.repository.getPendingIntents(userId, deviceId, block.id); 
        if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
        if (!pending.length) {
          const history = await useReviewApi.getLifecycleHistory({ knowledgeBlockId: block.id }, scope)
          if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
          if (!validateHistory(history, block.id)) {
            result.protocolBlocked = true
            return
          }
          await this.localReview.importLifecycleHistory(userId, deviceId, block.id, history)
          if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
          return
        }

        const synced = await this.syncKbQueue(userId, deviceId, block.id, block.subjectId, pending, scope)
        if (!isScopeCurrent(scope)) throw new Error('SYNC_SCOPE_CHANGED')
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

    const worker = async (): Promise<void> => {
      while (fatalError === null && isScopeCurrent(scope)) {
        const blockIndex = nextBlockIndex++
        if (blockIndex >= uniqueBlocks.length) return
        try {
          await processBlock(uniqueBlocks[blockIndex])
        } catch (error) {
          if ((error instanceof Error && error.message === 'SYNC_SCOPE_CHANGED')
            || classifyStatus(error) === 401) fatalError ??= error
          throw error
        }
      }
      if (fatalError === null) fatalError = new Error('SYNC_SCOPE_CHANGED')
    }
    const workerCount = Math.min(REVIEW_SYNC_BLOCK_CONCURRENCY, uniqueBlocks.length)
    // Observe every worker before returning or propagating a fatal error so the
    // surrounding sync cycle cannot release its lifecycle while work continues.
    await Promise.allSettled(Array.from({ length: workerCount }, () => worker()))
    if (fatalError !== null) {
      if ((fatalError instanceof Error && fatalError.message === 'SYNC_SCOPE_CHANGED') || !isScopeCurrent(scope)) {
        throw new Error('SYNC_SCOPE_CHANGED')
      }
      throw fatalError
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
      if (!currentState || currentState.contentHash !== intent.payload.contentHash) {
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
        if (actualSubjectId !== subjectId || kbResource.version !== history.knowledgeBlockVersion
          || kbResource.version < Number(intent.payload.knowledgeBlockVersion)
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
        let conflict = false
        await this.repository.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
          if (!isScopeCurrent(scope)) return
          const latest = await this.repository.getIntent(tx, userId, deviceId, intent.clientCommandId)
          if (!latest || !latest.prepared || latest.status !== 'inflight' || stableJson(latest.payload) !== stableJson(intent.payload)
            || !kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) return
          const corePayload = JSON.parse(kbResource.payload) as Record<string, unknown>
          const actualSubjectId = corePayload.subject_id ?? corePayload.subjectId
          const actualHash = await currentContentHash(corePayload)
          if (!actualHash || actualSubjectId !== subjectId
            || kbResource.version !== history.knowledgeBlockVersion
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
          const previousAnchor = currentRecord?.canonicalAnchor ?? null
          const command = acknowledgedCommand(response, intent)
          const canonicalAnchor: LocalReviewCanonicalAnchor = {
            knowledgeBlockVersion: response.knowledgeBlockVersion,
            subjectId,
            contentHash: String(intent.payload.contentHash),
            state: canonicalState(response.state),
            commands: mergeCommandHistory(previousAnchor?.commands ?? [], command),
            effectiveReviews: mergeEffectiveReview(previousAnchor?.effectiveReviews ?? [], response.effectiveReview),
          }
          if (response.knowledgeBlockVersion !== history.knowledgeBlockVersion
            && !sameRemoteAnchor(canonicalAnchor, history, subjectId, actualHash)) {
            await this.repository.updateIntentStatus(tx, userId, deviceId, intent.clientCommandId, 'conflict')
            conflict = true
            return
          }
          const state = {
            ...(currentRecord?.state && currentVersion > receiptVersion ? currentRecord.state : response.state),
            knowledgeBlockVersion: kbResource.version,
            canonicalVersion: Math.max(currentCanonical, receiptVersion),
          }
          const record: LocalReviewRecord = {
            knowledgeBlockId: kbId,
            subjectId,
            localRevision: (currentRecord?.localRevision ?? 0) + 1,
            serverKnowledgeBlockVersion: kbResource.version,
            contentHash: String(intent.payload.contentHash),
            state,
            history: mergeCommandHistory(currentRecord?.history ?? [], command),
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
        else return { synced, conflict, protocolBlocked: false }
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
              || kbResource.version !== history.knowledgeBlockVersion
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
