import { ReviewRepository, parseLocalReviewIntentRow, type LocalReviewCanonicalAnchor, type LocalReviewRecord, type LocalReviewIntent } from './reviewRepository'
import { ReviewLifecycleEngine, type ReviewSchedulingBaseline } from './reviewLifecycleEngine'
import { ApiProblemError } from '../api/httpError'
import type { LocalReviewIntentRow, LocalSqlDatabase } from './localSchema'
import type { LocalRepository } from './localRepository'
import type {
  LifecycleAction,
  LifecycleRating,
  LifecycleStateView,
  LifecycleCommandResponse,
  CursorPageReviewStateView,
  LifecycleHistoryCommandView,
  LifecycleHistoryResponse,
} from '@/api/useReviewApi'

function localReviewConflict(): ApiProblemError {
  return new ApiProblemError({
    title: 'Review state changed',
    status: 409,
    detail: '409 RESOURCE_VERSION_CONFLICT',
    code: 'RESOURCE_VERSION_CONFLICT',
  })
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

function subjectIdOf(payload: Record<string, unknown>): string | null {
  const value = payload.subject_id ?? payload.subjectId
  return typeof value === 'string' && value ? value : null
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

async function currentContentHash(payload: Record<string, unknown>): Promise<string | null> {
  if (typeof payload.content === 'string') return sha256(payload.content)
  const value = payload.content_hash ?? payload.contentHash
  if (typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase()
  return null
}

function canonicalVersion(state: LifecycleStateView | null): number {
  if (!state) return 0
  const value = (state as LifecycleStateView & { canonicalVersion?: unknown }).canonicalVersion
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : state.version
}

function canonicalState(state: LifecycleStateView | null): LifecycleStateView | null {
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
  } = state as LifecycleStateView & Record<string, unknown>
  return JSON.parse(JSON.stringify(serverState)) as LifecycleStateView
}

function anchorFromHistory(
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function makeUnlearnedState(kbId: string, kbVersion: number, contentHash: string, now: string): LifecycleStateView {
  return {
    knowledgeBlockId: kbId,
    dueAt: now,
    version: 0,
    knowledgeBlockVersion: kbVersion,
    needsLearning: true,
    mastered: false,
    stableSuccessCount: 0,
    nextReviewStage: null,
    lastPracticeAt: null,
    lastReviewId: null,
    pendingReviewId: null,
    contentHash,
  }
}

function stateForChangedContent(state: LifecycleStateView, kbVersion: number, hash: string): LifecycleStateView {
  return {
    ...state,
    // The server owns @Version. Local content invalidation is only a schedule
    // projection; sync later binds an unprepared command to the actual version.
    version: canonicalVersion(state),
    knowledgeBlockVersion: kbVersion,
    needsLearning: true,
    mastered: false,
    stableSuccessCount: 0,
    nextReviewStage: 'EARLY_RECALL',
    lastReviewId: null,
    pendingReviewId: null,
    contentHash: hash,
  }
}

export class LocalReviewService {
  private readonly db: LocalSqlDatabase | 'localstorage'
  private readonly repo: ReviewRepository
  private readonly localRepository?: LocalRepository

  constructor(db: LocalSqlDatabase | 'localstorage', localRepository?: LocalRepository) {
    this.db = db
    this.localRepository = localRepository
    this.repo = new ReviewRepository(db, localRepository)
  }

  async listSyncBlocks(userId: string): Promise<Array<{ id: string; subjectId: string }>> {
    if (!this.localRepository) return []
    const [blocks, subjects] = await Promise.all([
      this.localRepository.list<Record<string, unknown>>('KNOWLEDGE_BLOCK', { includeDeleted: false }),
      this.localRepository.list<Record<string, unknown>>('SUBJECT', { includeDeleted: false }),
    ])
    const activeSubjects = new Set(subjects.filter(row => row.userId === userId && !row.deletedAt).map(row => row.id))
    return blocks.flatMap(row => {
      const subjectId = subjectIdOf(row.value)
      return row.userId === userId && !row.deletedAt && subjectId && activeSubjects.has(subjectId)
        ? [{ id: row.id, subjectId }]
        : []
    })
  }

  private async listSubjectBlocks(userId: string, subjectId: string): Promise<Array<{ id: string; version: number; deleted_at: string | null; payload: string; syncStatus?: string }>> {
    if (this.db === 'localstorage' && this.localRepository) {
      const subject = await this.localRepository.read('SUBJECT', subjectId)
      if (!subject || subject.userId !== userId || subject.deletedAt) return []
      const rows = await this.localRepository.list<Record<string, unknown>>('KNOWLEDGE_BLOCK', { includeDeleted: true })
      return rows.flatMap(row => {
        const payload = row.value
        if (row.userId !== userId || !payload || subjectIdOf(payload) !== subjectId) return []
        return [{ id: row.id, version: row.version, deleted_at: row.deletedAt, payload: JSON.stringify(payload), syncStatus: row.syncStatus }]
      })
    }
    if (this.db === 'localstorage') {
      return []
    }
    const subjectRows = await this.db.select<any>(
      `SELECT deleted_at FROM local_resource_records WHERE user_id = ? AND resource_type = 'SUBJECT' AND resource_id = ?`,
      [userId, subjectId],
    )
    if (!subjectRows.length || subjectRows[0].deleted_at) return []
    const rows = await this.db.select<any>(
      `SELECT resource_id AS id, version, deleted_at, payload, sync_status AS syncStatus FROM local_resource_records
       WHERE user_id = ? AND resource_type = 'KNOWLEDGE_BLOCK'`,
      [userId],
    )
    return rows.filter(row => subjectIdOf(safeJson<Record<string, unknown>>(row.payload, {})) === subjectId)
  }

  private async readKnowledgeBlock(userId: string, kbId: string): Promise<{
    id: string; version: number; deleted_at: string | null; payload: string; subjectId: string; syncStatus: string;
  } | null> {
    if (!this.localRepository) return null
    const block = await this.localRepository.read<Record<string, unknown>>('KNOWLEDGE_BLOCK', kbId)
    if (!block || block.userId !== userId || block.deletedAt) return null
    const subjectId = subjectIdOf(block.value)
    if (!subjectId) return null
    const subject = await this.localRepository.read<Record<string, unknown>>('SUBJECT', subjectId)
    if (!subject || subject.userId !== userId || subject.deletedAt) return null
    return {
      id: kbId,
      version: block.version,
      deleted_at: block.deletedAt,
      payload: JSON.stringify(block.value),
      subjectId,
      syncStatus: block.syncStatus,
    }
  }

  private async invalidateChangedContent(
    userId: string,
    deviceId: string,
    kbId: string,
    expectedHash: string,
  ): Promise<void> {
    await this.repo.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
      if (!currentRecord || !kbResource || kbResource.deleted_at || (subjectResource && subjectResource.deleted_at)) return
      const payload = safeJson<Record<string, unknown>>(kbResource.payload, {})
      const observedHash = await currentContentHash(payload)
      const latestSubjectId = subjectIdOf(payload)
      if (!latestSubjectId) return
      const subjectChanged = !!latestSubjectId && currentRecord.subjectId !== latestSubjectId
      if (!observedHash || (observedHash === currentRecord.contentHash && !subjectChanged)) return
      const [reread, rereadSubject] = await Promise.all([
        this.repo.getKbResource(tx, userId, kbId),
        latestSubjectId ? this.repo.getSubjectResource(tx, userId, latestSubjectId) : Promise.resolve(null),
      ])
      if (!reread || reread.deleted_at || reread.version !== kbResource.version
        || reread.payload !== kbResource.payload || !rereadSubject || rereadSubject.deleted_at) {
        throw localReviewConflict()
      }
      if (observedHash !== expectedHash) return
      if (subjectChanged && latestSubjectId && observedHash === currentRecord.contentHash) {
        // A pure parent move changes scope and KB revision, but unchanged body
        // content keeps its schedule and mastery. Old-scope commands remain
        // visible as explicit conflicts instead of becoming orphaned.
        const state = currentRecord.state
          ? { ...currentRecord.state, knowledgeBlockVersion: reread.version, contentHash: observedHash }
          : null
        const movedRecord: LocalReviewRecord = {
          ...currentRecord,
          subjectId: latestSubjectId,
          localRevision: currentRecord.localRevision + 1,
          serverKnowledgeBlockVersion: reread.version,
          contentHash: observedHash,
          state,
          updatedAt: new Date().toISOString(),
        }
        await this.repo.saveSubjectMoveCommit(tx, userId, deviceId, kbId, movedRecord)
        return
      }
      const state = currentRecord.canonicalAnchor?.state
        ? stateForChangedContent(currentRecord.canonicalAnchor.state, reread.version, observedHash)
        : null
      const record: LocalReviewRecord = {
        ...currentRecord,
        subjectId: latestSubjectId,
        localRevision: currentRecord.localRevision + 1,
        serverKnowledgeBlockVersion: reread.version,
        contentHash: observedHash,
        state,
        effectiveReviews: currentRecord.effectiveReviews.map(review => review.resolution === null
          ? { ...review, resolution: 'SUPERSEDED' }
          : review),
        updatedAt: new Date().toISOString(),
      }
      await this.repo.saveInvalidationCommit(tx, userId, deviceId, kbId, record)
    })
  }

  private async projectStateForBlock(
    userId: string,
    deviceId: string,
    row: { id: string; version: number; deleted_at: string | null; payload: string; syncStatus?: string },
    knownLocalCreate = false,
  ): Promise<LifecycleStateView | null> {
    if (row.deleted_at) return null
    const payload = safeJson<Record<string, unknown>>(row.payload, {})
    const hash = await currentContentHash(payload)
    if (hash) await this.invalidateChangedContent(userId, deviceId, row.id, hash)
    const record = await this.repo.getReviewRecord(userId, deviceId, row.id)
    const state = record?.state
      ? { ...record.state }
      : makeUnlearnedState(row.id, row.version, hash ?? '', new Date().toISOString())
    if (!hash) {
      state.needsLearning = true
      state.mastered = false
      state.stableSuccessCount = 0
      state.nextReviewStage = null
      state.pendingReviewId = null
      state.lastReviewId = null
      state.contentHash = null
      state.knowledgeBlockVersion = row.version
    }
    if (state.contentHash !== hash) {
      state.needsLearning = true
      state.mastered = false
      state.stableSuccessCount = 0
      state.nextReviewStage = null
      state.pendingReviewId = null
      state.lastReviewId = null
      state.knowledgeBlockVersion = row.version
      state.contentHash = hash
    }
    const pending = state.pendingReviewId
      ? record?.effectiveReviews.find(item => item.reviewId === state.pendingReviewId)
      : null
    Object.assign(state, {
      pendingReviewRating: pending?.selectedRating ?? null,
      pendingReviewSelectedAt: pending?.selectedAt ?? null,
      pendingReviewBaseline: pending?.schedulingBaseline ?? null,
      historyImported: record?.historyImported === true,
      persistedStatePresent: record?.state !== null && record?.state !== undefined,
      statePresenceKnown: (record?.state !== null && record?.state !== undefined)
        || record?.historyImported === true || knownLocalCreate,
    })
    return state
  }

  async getKnowledgeBlockState(userId: string, deviceId: string, kbId: string, expectedSubjectId?: string): Promise<LifecycleStateView | null> {
    const row = await this.readKnowledgeBlock(userId, kbId)
    if (row && expectedSubjectId && row.subjectId !== expectedSubjectId) return null
    if (!row) return null
    const localCreates = this.localRepository
      ? await this.localRepository.listUnresolved('KNOWLEDGE_BLOCK')
      : []
    const knownLocalCreate = localCreates.some(mutation => mutation.resourceId === kbId && mutation.mutationType === 'CREATE')
    return this.projectStateForBlock(userId, deviceId, row, knownLocalCreate)
  }

  async getSubjectStates(userId: string, deviceId: string, subjectId: string): Promise<CursorPageReviewStateView> {
    const activeBlocks = await this.listSubjectBlocks(userId, subjectId)
    const unresolvedCore = this.localRepository
      ? await this.localRepository.listUnresolved('KNOWLEDGE_BLOCK')
      : []
    const localCreates = new Set(unresolvedCore.filter(mutation => mutation.mutationType === 'CREATE').map(mutation => mutation.resourceId))
    const items: LifecycleStateView[] = []
    for (const row of activeBlocks) {
      const state = await this.projectStateForBlock(userId, deviceId, row, localCreates.has(row.id))
      if (state) items.push(state)
    }
    return { items, nextCursor: undefined, hasMore: false }
  }

  async getLifecycleHistory(userId: string, deviceId: string, kbId: string): Promise<LifecycleHistoryResponse> {
    const record = await this.repo.getReviewRecord(userId, deviceId, kbId)
    const kbResource = await this.repo.getKbResource(this.db, userId, kbId)
    return {
      knowledgeBlockId: kbId,
      knowledgeBlockVersion: kbResource?.version ?? 0,
      protocolVersion: 2,
      state: record?.state ?? null,
      commands: record?.history ?? [],
      effectiveReviews: record?.effectiveReviews ?? [],
    }
  }

  async importLifecycleHistory(
    userId: string,
    deviceId: string,
    kbId: string,
    history: LifecycleHistoryResponse,
  ): Promise<boolean> {
    if (history.protocolVersion !== 2 || history.knowledgeBlockId !== kbId) return false
    return this.repo.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
      if (!kbResource || kbResource.deleted_at || (subjectResource && subjectResource.deleted_at)) return false
      const pendingRows = await this.pendingRows(tx, userId, deviceId, kbId)
      if (pendingRows.length) return false
      if (currentRecord?.state && currentRecord.state.version > (history.state?.version ?? 0)) return false
      const payload = safeJson<Record<string, unknown>>(kbResource.payload, {})
      const hash = await currentContentHash(payload)
      if (!hash) return false
      const subjectId = subjectIdOf(payload)
      const [reread, rereadSubject] = await Promise.all([
        this.repo.getKbResource(tx, userId, kbId),
        subjectId ? this.repo.getSubjectResource(tx, userId, subjectId) : Promise.resolve(null),
      ])
      if (!reread || reread.deleted_at || reread.version !== kbResource.version || reread.payload !== kbResource.payload
        || !rereadSubject || rereadSubject.deleted_at || history.knowledgeBlockVersion !== reread.version) return false
      const state = history.state
        ? { ...history.state, canonicalVersion: history.state.version }
        : null
      if (state && state.contentHash !== hash) return false
      const record: LocalReviewRecord = {
        knowledgeBlockId: kbId,
        subjectId: subjectId ?? '',
        localRevision: (currentRecord?.localRevision ?? 0) + 1,
        serverKnowledgeBlockVersion: kbResource.version,
        contentHash: hash,
        state,
        history: history.commands,
        effectiveReviews: history.effectiveReviews,
        historyImported: true,
        canonicalAnchor: anchorFromHistory(history, subjectId ?? '', hash),
        isPresenceMarker: false,
        updatedAt: new Date().toISOString(),
      }
      await this.repo.saveReviewRecord(tx, userId, deviceId, record)
      return true
    })
  }

  async adoptCloudHistory(
    userId: string,
    deviceId: string,
    kbId: string,
    history: LifecycleHistoryResponse,
  ): Promise<boolean> {
    if (history.protocolVersion !== 2 || history.knowledgeBlockId !== kbId) return false
    return this.repo.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
      if (!kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) return false
      const payload = safeJson<Record<string, unknown>>(kbResource.payload, {})
      const hash = await currentContentHash(payload)
      const subjectId = subjectIdOf(payload)
      const [reread, rereadSubject] = await Promise.all([
        this.repo.getKbResource(tx, userId, kbId),
        subjectId ? this.repo.getSubjectResource(tx, userId, subjectId) : Promise.resolve(null),
      ])
      if (!hash || !reread || reread.deleted_at || reread.version !== kbResource.version || reread.payload !== kbResource.payload
        || !rereadSubject || rereadSubject.deleted_at || history.knowledgeBlockVersion !== reread.version
        || (history.state && history.state.contentHash !== hash)) return false
      const state = history.state ? { ...history.state, canonicalVersion: history.state.version } : null
      const record: LocalReviewRecord = {
        knowledgeBlockId: kbId,
        subjectId: subjectId ?? currentRecord?.subjectId ?? '',
        localRevision: (currentRecord?.localRevision ?? 0) + 1,
        serverKnowledgeBlockVersion: kbResource.version,
        contentHash: hash,
        state,
        history: history.commands,
        effectiveReviews: history.effectiveReviews,
        historyImported: true,
        canonicalAnchor: anchorFromHistory(history, subjectId ?? currentRecord?.subjectId ?? '', hash),
        isPresenceMarker: false,
        updatedAt: new Date().toISOString(),
      }
      const acceptedCommandIds = new Set(history.commands.map(command => command.clientCommandId))
      await this.repo.saveCloudAdoption(tx, userId, deviceId, kbId, record, acceptedCommandIds)
      return true
    })
  }

  async getSubjectConflicts(userId: string, deviceId: string, subjectId: string): Promise<string[]> {
    const blocks = (await this.listSyncBlocks(userId)).filter(block => block.subjectId === subjectId)
    const unresolved = await this.repo.getUnresolvedIntents(userId, deviceId, blocks.map(block => block.id))
    return [...new Set(unresolved.filter(intent => intent.status === 'conflict').map(intent => intent.knowledgeBlockId))]
  }

  private async pendingRows(tx: LocalSqlDatabase | 'localstorage', userId: string, deviceId: string, kbId: string): Promise<LocalReviewIntent[]> {
    if (tx === 'localstorage') return this.repo.getPendingIntents(userId, deviceId, kbId)
    const rows = await tx.select<LocalReviewIntentRow>(
      `SELECT * FROM local_review_intents WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ?
       AND status IN ('pending', 'inflight', 'error') ORDER BY created_at ASC, client_command_id ASC`,
      [userId, deviceId, kbId],
    )
    return rows.map(parseLocalReviewIntentRow)
  }

  async executeCommand(
    userId: string,
    deviceId: string,
    kbId: string,
    clientCommandId: string,
    action: LifecycleAction,
    rating: LifecycleRating | null,
    occurredAt: string,
    baseVersion: number,
    contentHash: string,
    requestPayload: Record<string, unknown>,
    expectedSubjectId?: string,
  ): Promise<LifecycleCommandResponse> {
    if (requestPayload.clientCommandId !== clientCommandId || requestPayload.occurredAt !== occurredAt
      || typeof requestPayload.expectedStateAbsent !== 'boolean') {
      throw new Error('复习操作缺少不可变的时间或初始状态凭据。')
    }
    return this.repo.executeAtomicReviewCommit(userId, deviceId, kbId, async (tx, currentRecord, kbResource, subjectResource) => {
      if (!kbResource || kbResource.deleted_at || !subjectResource || subjectResource.deleted_at) throw new Error('404 RESOURCE_NOT_FOUND')
      const payload = safeJson<Record<string, unknown>>(kbResource.payload, {})
      const subjectId = subjectIdOf(payload)
      if (!subjectId) throw new Error('404 RESOURCE_NOT_FOUND')
      if (expectedSubjectId && subjectId !== expectedSubjectId) throw localReviewConflict()
      const hash = await currentContentHash(payload)
      if (!hash) throw localReviewConflict()
      const [reread, rereadSubject] = await Promise.all([
        this.repo.getKbResource(tx, userId, kbId),
        this.repo.getSubjectResource(tx, userId, subjectId),
      ])
      if (!reread || reread.deleted_at || reread.version !== kbResource.version || reread.payload !== kbResource.payload
        || !rereadSubject || rereadSubject.deleted_at
        || hash !== contentHash) throw localReviewConflict()

      const currentState = currentRecord?.state ?? null
      if ((currentState?.version ?? 0) !== baseVersion
        || requestPayload.expectedStateAbsent !== !currentState) throw localReviewConflict()
      const existingReview = requestPayload.reviewId
        ? currentRecord?.effectiveReviews.find(item => item.reviewId === requestPayload.reviewId) ?? null
        : null
      const before = existingReview?.schedulingBaseline ?? null
      const selectedRating = existingReview?.selectedRating ?? (action === 'REVIEW_SELECTED' ? rating : null)
      if ((action === 'REVIEW_CONFIRMED' || action === 'REVIEW_CORRECTED') && !existingReview) {
        throw localReviewConflict()
      }
      const response = ReviewLifecycleEngine.processCommand(
        currentState,
        kbId,
        action,
        rating,
        occurredAt,
        clientCommandId,
        baseVersion,
        reread.version,
        hash,
        {
          reviewId: typeof requestPayload.reviewId === 'string' ? requestPayload.reviewId : undefined,
          selectedRating,
          selectedAt: existingReview?.selectedAt,
          schedulingBaseline: before as ReviewSchedulingBaseline | null,
          previousEffectiveReview: existingReview,
        },
      )

      const nextCommands = [...(currentRecord?.history ?? []), {
        commandId: response.commandId,
        clientCommandId,
        action,
        occurredAt,
        reviewId: response.effectiveReview?.reviewId ?? (typeof requestPayload.reviewId === 'string' ? requestPayload.reviewId : null),
        rating: response.effectiveReview?.selectedRating ?? rating,
        durationSeconds: typeof requestPayload.durationSeconds === 'number' ? requestPayload.durationSeconds : null,
        baseVersion,
        knowledgeBlockVersion: response.knowledgeBlockVersion,
      } as LifecycleHistoryCommandView]
      const nextEffective = [...(currentRecord?.effectiveReviews ?? [])]
      if (response.effectiveReview) {
        const index = nextEffective.findIndex(item => item.reviewId === response.effectiveReview!.reviewId)
        if (index >= 0) nextEffective[index] = response.effectiveReview
        else nextEffective.push(response.effectiveReview)
      }
      const stateWithCanonical = {
        ...response.state,
        canonicalVersion: canonicalVersion(currentState),
        persistedStatePresent: true,
        statePresenceKnown: true,
      } as LifecycleStateView
      const localResponse = { ...response, state: stateWithCanonical }
      const previousReviewIntents = await this.pendingRows(tx, userId, deviceId, kbId)
      const previousTimes = [currentRecord?.updatedAt, ...previousReviewIntents.map(item => item.createdAt)]
        .map(value => value ? Date.parse(value) : Number.NaN)
        .filter(Number.isFinite)
      const lastLocalTime = previousTimes.length ? Math.max(...previousTimes) : 0
      // Persist a monotonic per-KB creation order. Multiple actions can share
      // occurredAt and the same server baseVersion, so neither is a queue key.
      const committedAt = new Date(Math.max(Date.now(), lastLocalTime + 1)).toISOString()
      const unresolvedCoreMutationType = await this.repo.getUnresolvedCoreMutationType(tx, userId, kbId)
      const anchor = currentRecord?.canonicalAnchor ?? null
      const allowContentInvalidation = action === 'LEARNING_COMPLETED'
        && typeof requestPayload.reviewId !== 'string'
        && previousReviewIntents.length === 0
        && !!anchor
        && anchor.subjectId === subjectId
        && anchor.contentHash !== hash
      const record: LocalReviewRecord = {
        knowledgeBlockId: kbId,
        subjectId,
        localRevision: (currentRecord?.localRevision ?? 0) + 1,
        serverKnowledgeBlockVersion: reread.version,
        contentHash: hash,
        state: stateWithCanonical,
        history: nextCommands,
        effectiveReviews: nextEffective,
        historyImported: currentRecord?.historyImported ?? false,
        canonicalAnchor: anchor,
        isPresenceMarker: false,
        updatedAt: committedAt,
      }
      const intent: LocalReviewIntent = {
        clientCommandId,
        userId,
        deviceId,
        knowledgeBlockId: kbId,
        action,
        occurredAt,
        payload: { ...requestPayload },
        status: 'pending',
        createdAt: committedAt,
        prepared: false,
        preparation: {
          anchorFingerprint: anchor ? stableJson(anchor) : null,
          anchorSubjectId: anchor?.subjectId ?? null,
          anchorContentHash: anchor?.contentHash ?? null,
          anchorCommandIds: anchor?.commands.map(command => command.clientCommandId) ?? [],
          predecessorClientCommandIds: previousReviewIntents.map(item => item.clientCommandId),
          knownLocalCreate: unresolvedCoreMutationType === 'CREATE',
          allowContentInvalidation,
          sequence: record.localRevision,
        },
      }
      await this.repo.saveReviewCommit(tx, userId, deviceId, record, intent)
      return localResponse
    })
  }
}
