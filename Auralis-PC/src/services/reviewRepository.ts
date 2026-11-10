import type { LocalSqlDatabase, LocalReviewRecordRow, LocalReviewIntentRow } from '@/services/localSchema'
import type { LifecycleStateView, LifecycleAction, LifecycleHistoryCommandView, EffectiveReviewView } from '@/api/useReviewApi'
import type { LocalRepository } from '@/services/localRepository'

function storagePart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_')
}

function browserReviewStorageKey(userId: string, deviceId: string): string {
  return `auralis:v2:${storagePart(userId)}:${storagePart(deviceId)}:review-store`
}

interface BrowserReviewStore {
  records: LocalReviewRecord[]
  intents: LocalReviewIntent[]
}

export interface LocalReviewCanonicalAnchor {
  knowledgeBlockVersion: number
  subjectId: string
  contentHash: string
  state: LifecycleStateView | null
  commands: LifecycleHistoryCommandView[]
  effectiveReviews: EffectiveReviewView[]
}

export interface LocalReviewPreparation {
  anchorFingerprint: string | null
  anchorSubjectId: string | null
  anchorContentHash: string | null
  anchorCommandIds: string[]
  predecessorClientCommandIds: string[]
  knownLocalCreate: boolean
  allowContentInvalidation: boolean
  sequence: number
}

function invalidLocalReviewData(detail: string): never {
  throw new Error(`LOCAL_REVIEW_STORE_CORRUPT: ${detail}`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isSafeVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

function validateState(value: unknown, knowledgeBlockId: string): void {
  if (value === null) return
  if (!isObject(value)
    || value.knowledgeBlockId !== knowledgeBlockId
    || !isSafeVersion(value.version)
    || !isSafeVersion(value.knowledgeBlockVersion)
    || !isInstant(value.dueAt)
    || typeof value.needsLearning !== 'boolean'
    || typeof value.mastered !== 'boolean'
    || !isSafeVersion(value.stableSuccessCount)
    || !(value.nextReviewStage === null || ['EARLY_RECALL', 'CROSS_DAY', 'FINAL_VERIFICATION'].includes(String(value.nextReviewStage)))
    || !(value.lastPracticeAt === null || isInstant(value.lastPracticeAt))
    || !(value.lastReviewId === null || (typeof value.lastReviewId === 'string' && value.lastReviewId.length > 0))
    || !(value.pendingReviewId === null || (typeof value.pendingReviewId === 'string' && value.pendingReviewId.length > 0))
    || !(value.contentHash === null || (typeof value.contentHash === 'string' && /^[a-f0-9]{64}$/i.test(value.contentHash)))) {
    invalidLocalReviewData(`invalid state for ${knowledgeBlockId}`)
  }
  if (value.canonicalVersion !== undefined && !isSafeVersion(value.canonicalVersion)) {
    invalidLocalReviewData(`invalid canonical version for ${knowledgeBlockId}`)
  }
}

function parseState(raw: string | null, knowledgeBlockId: string): LifecycleStateView | null {
  if (raw === null) invalidLocalReviewData(`missing state payload for ${knowledgeBlockId}`)
  const state = JSON.parse(raw)
  validateState(state, knowledgeBlockId)
  return state as LifecycleStateView | null
}

export function parseLocalReviewIntentRow(row: LocalReviewIntentRow): LocalReviewIntent {
  let preparation: unknown
  let payload: unknown
  try {
    preparation = JSON.parse(row.preparation_json)
    payload = JSON.parse(row.payload_json)
  } catch {
    invalidLocalReviewData('invalid SQL review intent JSON')
  }
  const intent: LocalReviewIntent = {
    clientCommandId: row.client_command_id,
    userId: row.user_id,
    deviceId: row.device_id,
    knowledgeBlockId: row.knowledge_block_id,
    action: row.action as LifecycleAction,
    occurredAt: row.occurred_at,
    payload: payload as Record<string, unknown>,
    status: row.status as LocalReviewIntent['status'],
    createdAt: row.created_at,
    prepared: row.prepared === 1,
    preparation: preparation as LocalReviewPreparation,
  }
  validateIntent(intent, row.user_id, row.device_id)
  return intent
}

function validateIntent(value: unknown, userId: string, deviceId: string): asserts value is LocalReviewIntent {
  const row = value as Record<string, unknown>
  const payload = row && typeof row === 'object' ? row.payload : null
  const actions = ['LEARNING_COMPLETED', 'REVIEW_SELECTED', 'REVIEW_CONFIRMED', 'REVIEW_CORRECTED', 'LEARNING_REOPENED']
  const statuses = ['pending', 'inflight', 'applied', 'conflict', 'error', 'archived']
  if (!isObject(row) || !isObject(payload)
    || typeof row.clientCommandId !== 'string' || !row.clientCommandId
    || row.userId !== userId || row.deviceId !== deviceId
    || typeof row.knowledgeBlockId !== 'string' || !row.knowledgeBlockId
    || !actions.includes(String(row.action))
    || !isInstant(row.occurredAt) || row.occurredAt !== payload.occurredAt
    || !isInstant(row.createdAt) || !statuses.includes(String(row.status))
    || typeof row.prepared !== 'boolean'
    || !isObject(row.preparation)
    || !(row.preparation.anchorFingerprint === null || typeof row.preparation.anchorFingerprint === 'string')
    || !(row.preparation.anchorSubjectId === null || typeof row.preparation.anchorSubjectId === 'string')
    || !(row.preparation.anchorContentHash === null || typeof row.preparation.anchorContentHash === 'string')
    || !Array.isArray(row.preparation.anchorCommandIds)
    || !row.preparation.anchorCommandIds.every((item: unknown) => typeof item === 'string' && item.length > 0)
    || !Array.isArray(row.preparation.predecessorClientCommandIds)
    || !row.preparation.predecessorClientCommandIds.every((item: unknown) => typeof item === 'string' && item.length > 0)
    || typeof row.preparation.knownLocalCreate !== 'boolean'
    || typeof row.preparation.allowContentInvalidation !== 'boolean'
    || !isSafeVersion(row.preparation.sequence)
    || payload.clientCommandId !== row.clientCommandId
    || payload.knowledgeBlockId !== row.knowledgeBlockId
    || !isSafeVersion(payload.baseVersion) || !isSafeVersion(payload.knowledgeBlockVersion)
    || typeof payload.expectedStateAbsent !== 'boolean'
    || typeof payload.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(payload.contentHash)) {
    invalidLocalReviewData('invalid immutable review intent')
  }
  if ((row.action === 'REVIEW_CONFIRMED' || row.action === 'REVIEW_CORRECTED')
    && (typeof payload.reviewId !== 'string' || !payload.reviewId)) {
    invalidLocalReviewData(`missing review id for ${String(row.action)}`)
  }
}

function validateRecord(value: unknown): asserts value is LocalReviewRecord {
  const row = value as Record<string, unknown>
  if (!isObject(row)
    || typeof row.knowledgeBlockId !== 'string' || !row.knowledgeBlockId
    || typeof row.subjectId !== 'string'
    || !isSafeVersion(row.localRevision) || !isSafeVersion(row.serverKnowledgeBlockVersion)
    || typeof row.contentHash !== 'string' || !(row.contentHash === '' || /^[a-f0-9]{64}$/i.test(row.contentHash))
    || !Array.isArray(row.history) || !Array.isArray(row.effectiveReviews)
    || typeof row.historyImported !== 'boolean'
    || typeof row.isPresenceMarker !== 'boolean' || !isInstant(row.updatedAt)) {
    invalidLocalReviewData('invalid review record')
  }
  validateState(row.state, row.knowledgeBlockId)
  validateCanonicalAnchor(row.canonicalAnchor, row.knowledgeBlockId)
  for (const command of row.history) {
    if (!isObject(command) || typeof command.commandId !== 'string' || !command.commandId
      || typeof command.clientCommandId !== 'string' || !command.clientCommandId
      || !['LEARNING_COMPLETED', 'REVIEW_SELECTED', 'REVIEW_CONFIRMED', 'REVIEW_CORRECTED', 'LEARNING_REOPENED'].includes(String(command.action))
      || !isInstant(command.occurredAt) || !isSafeVersion(command.baseVersion)
      || !isSafeVersion(command.knowledgeBlockVersion)) invalidLocalReviewData('invalid review command history')
  }
  for (const review of row.effectiveReviews) {
    if (!isObject(review) || typeof review.reviewId !== 'string' || !review.reviewId
      || !isInstant(review.selectedAt)
      || !(review.resolvedAt === null || isInstant(review.resolvedAt))) invalidLocalReviewData('invalid effective review history')
  }
}

function validateCanonicalAnchor(value: unknown, knowledgeBlockId: string): void {
  if (value === null) return
  if (!isObject(value)
    || !isSafeVersion(value.knowledgeBlockVersion)
    || typeof value.subjectId !== 'string' || !value.subjectId
    || typeof value.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(value.contentHash)
    || !Array.isArray(value.commands) || !Array.isArray(value.effectiveReviews)) {
    invalidLocalReviewData(`invalid canonical anchor for ${knowledgeBlockId}`)
  }
  const state = value.state as LifecycleStateView | null
  validateState(state, knowledgeBlockId)
  if (!value.commands.every(isObject) || !value.effectiveReviews.every(isObject)) {
    invalidLocalReviewData(`invalid canonical history for ${knowledgeBlockId}`)
  }
}

function validateBrowserStore(value: unknown, userId: string, deviceId: string): asserts value is BrowserReviewStore {
  if (!isObject(value) || !Array.isArray(value.records) || !Array.isArray(value.intents)) {
    invalidLocalReviewData('records and intents must both be arrays')
  }
  for (const record of value.records) validateRecord(record)
  for (const intent of value.intents) validateIntent(intent, userId, deviceId)
}

function readBrowserStore(userId: string, deviceId: string): BrowserReviewStore {
  const stored = localStorage.getItem(browserReviewStorageKey(userId, deviceId))
  if (stored) {
    const parsed = JSON.parse(stored)
    validateBrowserStore(parsed, userId, deviceId)
    return parsed
  }
  return { records: [], intents: [] }
}

function writeBrowserStore(userId: string, deviceId: string, value: BrowserReviewStore): void {
  validateBrowserStore(value, userId, deviceId)
  // One localStorage write is the browser fallback's commit boundary.
  localStorage.setItem(browserReviewStorageKey(userId, deviceId), JSON.stringify(value))
}

const browserCommitTails = new Map<string, Promise<void>>()

function compareIntentOrder(left: LocalReviewIntent, right: LocalReviewIntent): number {
  // baseVersion is a server concurrency token, not a local queue sequence:
  // absent-state insert and its next command can both legitimately use 0.
  return left.preparation.sequence - right.preparation.sequence
    || left.createdAt.localeCompare(right.createdAt)
    || left.clientCommandId.localeCompare(right.clientCommandId)
}

function withBrowserReviewLock<T>(userId: string, deviceId: string, operation: () => Promise<T>): Promise<T> {
  const key = `${userId}\u0000${deviceId}`
  const previous = browserCommitTails.get(key) ?? Promise.resolve()
  const run = previous.then(async () => {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
    if (locks) return locks.request(`auralis-review:${storagePart(userId)}:${storagePart(deviceId)}`, { mode: 'exclusive' }, operation)
    return operation()
  })
  const tail = run.then(() => undefined, () => undefined)
  browserCommitTails.set(key, tail)
  void tail.finally(() => { if (browserCommitTails.get(key) === tail) browserCommitTails.delete(key) })
  return run
}

function parseHistory(raw: string | null, knowledgeBlockId: string): { commands: LifecycleHistoryCommandView[]; effectiveReviews: EffectiveReviewView[]; historyImported: boolean; canonicalAnchor: LocalReviewCanonicalAnchor | null } {
  if (!raw) invalidLocalReviewData('missing review history payload')
  const value = JSON.parse(raw)
  if (!isObject(value) || !Array.isArray(value.commands) || !Array.isArray(value.effectiveReviews)
    || typeof value.historyImported !== 'boolean'
    || !Object.prototype.hasOwnProperty.call(value, 'canonicalAnchor')) invalidLocalReviewData('invalid review history payload')
  validateCanonicalAnchor(value.canonicalAnchor, knowledgeBlockId)
  for (const command of value.commands) {
    if (!isObject(command) || typeof command.clientCommandId !== 'string' || !command.clientCommandId
      || !isInstant(command.occurredAt)) invalidLocalReviewData('invalid SQL command history')
  }
  for (const review of value.effectiveReviews) {
    if (!isObject(review) || typeof review.reviewId !== 'string' || !review.reviewId
      || !isInstant(review.selectedAt)) invalidLocalReviewData('invalid SQL effective review history')
  }
  return {
    commands: value.commands as LifecycleHistoryCommandView[],
    effectiveReviews: value.effectiveReviews as EffectiveReviewView[],
    historyImported: value.historyImported,
    canonicalAnchor: value.canonicalAnchor as LocalReviewCanonicalAnchor | null,
  }
}

export interface LocalReviewIntent {
  clientCommandId: string
  userId: string
  deviceId: string
  knowledgeBlockId: string
  action: LifecycleAction
  occurredAt: string
  payload: Record<string, unknown>
  status: 'pending' | 'inflight' | 'applied' | 'conflict' | 'error' | 'archived'
  createdAt: string
  prepared: boolean
  preparation: LocalReviewPreparation
}

export interface LocalReviewRecord {
  knowledgeBlockId: string
  subjectId: string
  localRevision: number
  serverKnowledgeBlockVersion: number
  contentHash: string
  state: LifecycleStateView | null
  history: LifecycleHistoryCommandView[] | null
  effectiveReviews: EffectiveReviewView[]
  historyImported: boolean
  canonicalAnchor: LocalReviewCanonicalAnchor | null
  isPresenceMarker: boolean
  updatedAt: string
}

export class ReviewRepository {
  private db: LocalSqlDatabase | 'localstorage'
  private localRepository?: LocalRepository
  constructor(db: LocalSqlDatabase | 'localstorage', localRepository?: LocalRepository) {
    this.db = db;
    this.localRepository = localRepository
  }

  async getReviewRecord(userId: string, deviceId: string, knowledgeBlockId: string): Promise<LocalReviewRecord | null> {
    if (this.db === 'localstorage') {
      const records = readBrowserStore(userId, deviceId).records
      return records.find(r => r.knowledgeBlockId === knowledgeBlockId) || null;
    }
    const rows = await this.db.select<LocalReviewRecordRow>(
      `SELECT * FROM local_review_records WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ?`,
      [userId, deviceId, knowledgeBlockId]
    )
    if (rows.length === 0) return null
    const row = rows[0]
    const parsedHistory = parseHistory(row.history_json, row.knowledge_block_id)
    return {
      knowledgeBlockId: row.knowledge_block_id,
      subjectId: row.subject_id,
      localRevision: row.local_revision,
      serverKnowledgeBlockVersion: row.server_knowledge_block_version,
      contentHash: row.content_hash,
      state: parseState(row.state_json, row.knowledge_block_id),
      history: parsedHistory.commands,
      effectiveReviews: parsedHistory.effectiveReviews,
      historyImported: parsedHistory.historyImported,
      canonicalAnchor: parsedHistory.canonicalAnchor,
      isPresenceMarker: row.is_presence_marker === 1,
      updatedAt: row.updated_at,
    }
  }

  async getSubjectRecords(userId: string, deviceId: string, subjectId: string): Promise<LocalReviewRecord[]> {
    if (this.db === 'localstorage') {
      const records = readBrowserStore(userId, deviceId).records
      return records.filter(r => r.subjectId === subjectId);
    }
    const rows = await this.db.select<LocalReviewRecordRow>(
      `SELECT * FROM local_review_records WHERE user_id = ? AND device_id = ? AND subject_id = ?`,
      [userId, deviceId, subjectId]
    )
    return rows.map((row: any) => {
      const parsedHistory = parseHistory(row.history_json, row.knowledge_block_id)
      return ({
      knowledgeBlockId: row.knowledge_block_id,
      subjectId: row.subject_id,
      localRevision: row.local_revision,
      serverKnowledgeBlockVersion: row.server_knowledge_block_version,
      contentHash: row.content_hash,
      state: parseState(row.state_json, row.knowledge_block_id),
      history: parsedHistory.commands,
      effectiveReviews: parsedHistory.effectiveReviews,
      historyImported: parsedHistory.historyImported,
      canonicalAnchor: parsedHistory.canonicalAnchor,
      isPresenceMarker: row.is_presence_marker === 1,
      updatedAt: row.updated_at,
      })
    })
  }

  async getPendingIntents(userId: string, deviceId: string, knowledgeBlockId: string): Promise<LocalReviewIntent[]> {
    if (this.db === 'localstorage') {
      const intents = readBrowserStore(userId, deviceId).intents
      return intents.filter(i => i.deviceId === deviceId && i.knowledgeBlockId === knowledgeBlockId && ['pending', 'inflight', 'error'].includes(i.status)).sort(compareIntentOrder)
    }
    const rows = await this.db.select<LocalReviewIntentRow>(
      `SELECT * FROM local_review_intents WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ? AND status IN ('pending', 'inflight', 'error') ORDER BY created_at ASC, client_command_id ASC`,
      [userId, deviceId, knowledgeBlockId]
    )
    return rows.map(parseLocalReviewIntentRow).sort(compareIntentOrder)
  }

  async getIntent(tx: LocalSqlDatabase | 'localstorage', userId: string, deviceId: string, clientCommandId: string): Promise<LocalReviewIntent | null> {
    if (tx === 'localstorage') {
      return readBrowserStore(userId, deviceId).intents.find(item => item.clientCommandId === clientCommandId) ?? null
    }
    const rows = await tx.select<LocalReviewIntentRow>(
      `SELECT * FROM local_review_intents WHERE user_id = ? AND device_id = ? AND client_command_id = ?`,
      [userId, deviceId, clientCommandId],
    )
    const row = rows[0]
    return row ? parseLocalReviewIntentRow(row) : null
  }

  async getAllPendingIntents(userId: string, deviceId: string): Promise<LocalReviewIntent[]> {
    if (this.db === 'localstorage') {
      const intents = readBrowserStore(userId, deviceId).intents
      return intents.filter(i => i.deviceId === deviceId && ['pending', 'inflight', 'error'].includes(i.status)).sort(compareIntentOrder)
    }
    const rows = await this.db.select<LocalReviewIntentRow>(
      `SELECT * FROM local_review_intents WHERE user_id = ? AND device_id = ? AND status IN ('pending', 'inflight', 'error') ORDER BY created_at ASC, client_command_id ASC`,
      [userId, deviceId]
    )
    return rows.map(parseLocalReviewIntentRow).sort(compareIntentOrder)
  }

  async getUnresolvedIntents(userId: string, deviceId: string, knowledgeBlockIds?: string[]): Promise<LocalReviewIntent[]> {
    if (knowledgeBlockIds && knowledgeBlockIds.length === 0) return []
    if (this.db === 'localstorage') {
      const allowed = knowledgeBlockIds ? new Set(knowledgeBlockIds) : null
      return readBrowserStore(userId, deviceId).intents
        .filter(item => item.deviceId === deviceId && ['pending', 'inflight', 'error', 'conflict'].includes(item.status)
          && (!allowed || allowed.has(item.knowledgeBlockId)))
        .sort(compareIntentOrder)
    }
    const idsClause = knowledgeBlockIds ? ` AND knowledge_block_id IN (${knowledgeBlockIds.map(() => '?').join(', ')})` : ''
    const rows = await this.db.select<LocalReviewIntentRow>(
      `SELECT * FROM local_review_intents WHERE user_id = ? AND device_id = ?
       AND status IN ('pending', 'inflight', 'error', 'conflict')${idsClause}`,
      [userId, deviceId, ...(knowledgeBlockIds ?? [])],
    )
    return rows.map(parseLocalReviewIntentRow).sort(compareIntentOrder)
  }

  async getKbResource(tx: LocalSqlDatabase | 'localstorage', userId: string, kbId: string) {
    if (tx === 'localstorage') {
      const resource = await this.localRepository?.read<Record<string, unknown>>('KNOWLEDGE_BLOCK', kbId)
      return resource?.userId === userId
        ? { version: resource.version, deleted_at: resource.deletedAt, payload: JSON.stringify(resource.value) }
        : null
    }
    const rows = await tx.select<any>(
      `SELECT version, deleted_at, payload FROM local_resource_records WHERE user_id = ? AND resource_type = 'KNOWLEDGE_BLOCK' AND resource_id = ?`,
      [userId, kbId]
    )
    return rows[0] || null
  }

  async getSubjectResource(tx: LocalSqlDatabase | 'localstorage', userId: string, subjectId: string) {
    if (tx === 'localstorage') {
      const resource = await this.localRepository?.read<Record<string, unknown>>('SUBJECT', subjectId)
      return resource?.userId === userId
        ? { version: resource.version, deleted_at: resource.deletedAt }
        : null
    }
    const rows = await tx.select<any>(
      `SELECT version, deleted_at FROM local_resource_records WHERE user_id = ? AND resource_type = 'SUBJECT' AND resource_id = ?`,
      [userId, subjectId]
    )
    return rows[0] || null
  }

  async hasUnresolvedCoreMutation(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    knowledgeBlockId: string,
  ): Promise<boolean> {
    if (tx === 'localstorage') {
      const mutations = await this.localRepository?.listUnresolved('KNOWLEDGE_BLOCK') ?? []
      return mutations.some(mutation => mutation.userId === userId && mutation.resourceId === knowledgeBlockId)
    }
    // Use the transaction handle directly. Calling LocalRepository here would
    // enqueue a second operation behind the active SQLite transaction.
    const rows = await tx.select<{ client_mutation_id: string }>(
      `SELECT client_mutation_id FROM local_mutations
       WHERE user_id = ? AND resource_type = 'KNOWLEDGE_BLOCK' AND resource_id = ?
         AND status IN ('pending', 'inflight', 'conflict', 'error')
       LIMIT 1`,
      [userId, knowledgeBlockId],
    )
    return rows.length > 0
  }

  async getUnresolvedCoreMutationType(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    knowledgeBlockId: string,
  ): Promise<string | null> {
    if (tx === 'localstorage') {
      const mutations = await this.localRepository?.listUnresolved('KNOWLEDGE_BLOCK') ?? []
      return mutations.find(mutation => mutation.userId === userId && mutation.resourceId === knowledgeBlockId)?.mutationType ?? null
    }
    const rows = await tx.select<{ mutation_type: string }>(
      `SELECT mutation_type FROM local_mutations
       WHERE user_id = ? AND resource_type = 'KNOWLEDGE_BLOCK' AND resource_id = ?
         AND status IN ('pending', 'inflight', 'conflict', 'error')
       ORDER BY created_at ASC LIMIT 1`,
      [userId, knowledgeBlockId],
    )
    return rows[0]?.mutation_type ?? null
  }

  async executeAtomicReviewCommit<T>(
    userId: string,
    deviceId: string,
    kbId: string,
    operation: (tx: LocalSqlDatabase | 'localstorage', currentRecord: LocalReviewRecord | null, kbResource: any, subjectResource: any) => Promise<T>
  ): Promise<T> {
    if (this.db === 'localstorage') {
      // Browser fallback runs each review read/validate/write sequence inside
      // one owner/device lock; Web Locks also coordinates tabs where supported.
      return withBrowserReviewLock(userId, deviceId, async () => {
        const lockedRecord = await this.getReviewRecord(userId, deviceId, kbId)
        const lockedKb = await this.getKbResource(this.db, userId, kbId)
        let lockedSubject = null
        if (lockedKb) {
          const subjectId = JSON.parse(lockedKb.payload).subject_id || JSON.parse(lockedKb.payload).subjectId
          if (subjectId) lockedSubject = await this.getSubjectResource(this.db, userId, subjectId)
        }
        return operation(this.db, lockedRecord, lockedKb, lockedSubject)
      })
    }

    if (!(this.db as LocalSqlDatabase).transaction) {
      const sql = this.db as LocalSqlDatabase
      await sql.execute('BEGIN IMMEDIATE')
      try {
        const result = await this.executeSqlReviewCommit(sql, userId, deviceId, kbId, operation)
        await sql.execute('COMMIT')
        return result
      } catch (error) {
        await sql.execute('ROLLBACK')
        throw error
      }
    }

    return (this.db as LocalSqlDatabase).transaction!(async (tx: LocalSqlDatabase) =>
      this.executeSqlReviewCommit(tx, userId, deviceId, kbId, operation))
  }

  private async executeSqlReviewCommit<T>(
    tx: LocalSqlDatabase,
    userId: string,
    deviceId: string,
    kbId: string,
    operation: (tx: LocalSqlDatabase | 'localstorage', currentRecord: LocalReviewRecord | null, kbResource: any, subjectResource: any) => Promise<T>,
  ): Promise<T> {
      // Note: for transaction isolation, we must re-read inside the transaction.
      const rows = await tx.select<LocalReviewRecordRow>(
        `SELECT * FROM local_review_records WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ?`,
        [userId, deviceId, kbId]
      )
      let currentRecord: LocalReviewRecord | null = null
      if (rows.length > 0) {
        const row = rows[0]
        const parsedHistory = parseHistory(row.history_json, row.knowledge_block_id)
        currentRecord = {
          knowledgeBlockId: row.knowledge_block_id,
          subjectId: row.subject_id,
          localRevision: row.local_revision,
          serverKnowledgeBlockVersion: row.server_knowledge_block_version,
          contentHash: row.content_hash,
          state: parseState(row.state_json, row.knowledge_block_id),
          history: parsedHistory.commands,
          effectiveReviews: parsedHistory.effectiveReviews,
          historyImported: parsedHistory.historyImported,
          canonicalAnchor: parsedHistory.canonicalAnchor,
          isPresenceMarker: row.is_presence_marker === 1,
          updatedAt: row.updated_at,
        }
      }

      const kbResource = await this.getKbResource(tx, userId, kbId)
      let subjectResource = null
      if (kbResource) {
        const payload = JSON.parse(kbResource.payload)
        const subjectId = payload.subject_id || payload.subjectId
        if (subjectId) {
          subjectResource = await this.getSubjectResource(tx, userId, subjectId)
        }
      }

      return operation(tx, currentRecord, kbResource, subjectResource)
  }

  async saveReviewRecord(tx: LocalSqlDatabase | 'localstorage', userId: string, deviceId: string, record: LocalReviewRecord) {
    validateRecord(record)
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const records = store.records
      const index = records.findIndex(r => r.knowledgeBlockId === record.knowledgeBlockId)
      if (index !== -1) records[index] = record
      else records.push(record)
      store.records = records
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await (tx as LocalSqlDatabase).execute(
      `INSERT INTO local_review_records (
        user_id, device_id, knowledge_block_id, subject_id,
        local_revision, server_knowledge_block_version, content_hash,
        state_json, history_json, is_presence_marker, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, device_id, knowledge_block_id) DO UPDATE SET
        subject_id = excluded.subject_id,
        local_revision = excluded.local_revision,
        server_knowledge_block_version = excluded.server_knowledge_block_version,
        content_hash = excluded.content_hash,
        state_json = excluded.state_json,
        history_json = excluded.history_json,
        is_presence_marker = excluded.is_presence_marker,
        updated_at = excluded.updated_at`,
      [
        userId, deviceId, record.knowledgeBlockId, record.subjectId,
        record.localRevision, record.serverKnowledgeBlockVersion, record.contentHash,
        JSON.stringify(record.state), JSON.stringify({ knowledgeBlockId: record.knowledgeBlockId, commands: record.history ?? [], effectiveReviews: record.effectiveReviews ?? [], historyImported: record.historyImported === true, canonicalAnchor: record.canonicalAnchor }),
        record.isPresenceMarker ? 1 : 0, record.updatedAt
      ]
    )
  }

  async saveReviewCommit(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    record: LocalReviewRecord,
    intent: LocalReviewIntent,
  ): Promise<void> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const records = store.records
      const recordIndex = records.findIndex(item => item.knowledgeBlockId === record.knowledgeBlockId)
      if (recordIndex >= 0) records[recordIndex] = record
      else records.push(record)
      const intents = store.intents
      const intentIndex = intents.findIndex(item => item.clientCommandId === intent.clientCommandId)
      if (intentIndex >= 0 && JSON.stringify(intents[intentIndex].payload) !== JSON.stringify(intent.payload)) {
        throw new Error('IMMUTABLE_REVIEW_INTENT')
      }
      if (intentIndex < 0) intents.push(intent)
      store.records = records
      store.intents = intents
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await this.saveIntent(tx, userId, deviceId, intent)
    await this.saveReviewRecord(tx, userId, deviceId, record)
  }

  async saveReceiptAndAcknowledge(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    record: LocalReviewRecord,
    clientCommandId: string,
  ): Promise<void> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const recordIndex = store.records.findIndex(item => item.knowledgeBlockId === record.knowledgeBlockId)
      if (recordIndex >= 0) store.records[recordIndex] = record
      else store.records.push(record)
      store.intents = store.intents.filter(item => item.clientCommandId !== clientCommandId)
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await this.saveReviewRecord(tx, userId, deviceId, record)
    await this.deleteIntent(tx, userId, deviceId, clientCommandId)
  }

  async saveInvalidationCommit(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    kbId: string,
    record: LocalReviewRecord,
  ): Promise<void> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const recordIndex = store.records.findIndex(item => item.knowledgeBlockId === kbId)
      if (recordIndex >= 0) store.records[recordIndex] = record
      else store.records.push(record)
      for (const intent of store.intents) {
        if (intent.knowledgeBlockId === kbId && ['pending', 'inflight', 'error', 'conflict'].includes(intent.status)) intent.status = 'archived'
      }
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await this.archivePendingIntents(tx, userId, deviceId, kbId)
    await this.saveReviewRecord(tx, userId, deviceId, record)
  }

  async saveSubjectMoveCommit(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    kbId: string,
    record: LocalReviewRecord,
  ): Promise<void> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const index = store.records.findIndex(item => item.knowledgeBlockId === kbId)
      if (index >= 0) store.records[index] = record
      else store.records.push(record)
      // A command frozen under the old parent/version needs explicit
      // resolution. Keep the selection and audit instead of orphaning it.
      for (const intent of store.intents) {
        if (intent.knowledgeBlockId === kbId && ['pending', 'inflight', 'error'].includes(intent.status)) {
          intent.status = 'conflict'
        }
      }
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await (tx as LocalSqlDatabase).execute(
      `UPDATE local_review_intents SET status = 'conflict'
       WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ?
         AND status IN ('pending', 'inflight', 'error')`,
      [userId, deviceId, kbId],
    )
    await this.saveReviewRecord(tx, userId, deviceId, record)
  }

  async saveCloudAdoption(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    kbId: string,
    record: LocalReviewRecord,
    acceptedCommandIds: Set<string>,
  ): Promise<void> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const recordIndex = store.records.findIndex(item => item.knowledgeBlockId === kbId)
      if (recordIndex >= 0) store.records[recordIndex] = record
      else store.records.push(record)
      for (const intent of store.intents) {
        if (intent.knowledgeBlockId !== kbId) continue
        if (acceptedCommandIds.has(intent.clientCommandId)) intent.status = 'applied'
        else if (['pending', 'inflight', 'error', 'conflict'].includes(intent.status)) intent.status = 'archived'
      }
      writeBrowserStore(userId, deviceId, store)
      return
    }
    for (const clientCommandId of acceptedCommandIds) {
      await tx.execute(
        `UPDATE local_review_intents SET status = 'applied' WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ? AND client_command_id = ?`,
        [userId, deviceId, kbId, clientCommandId],
      )
    }
    await this.archivePendingIntents(tx, userId, deviceId, kbId)
    await this.saveReviewRecord(tx, userId, deviceId, record)
  }

  async updateIntentStatus(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    clientCommandId: string,
    status: LocalReviewIntent['status'],
  ): Promise<void> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const intents = store.intents
      const intent = intents.find(item => item.clientCommandId === clientCommandId)
      if (intent) intent.status = status
      store.intents = intents
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await tx.execute(
      `UPDATE local_review_intents SET status = ? WHERE user_id = ? AND device_id = ? AND client_command_id = ?`,
      [status, userId, deviceId, clientCommandId],
    )
  }

  async archivePendingIntents(tx: LocalSqlDatabase | 'localstorage', userId: string, deviceId: string, kbId: string): Promise<void> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const intents = store.intents
      for (const intent of intents) {
        if (intent.knowledgeBlockId === kbId && ['pending', 'inflight', 'error'].includes(intent.status)) intent.status = 'archived'
      }
      store.intents = intents
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await tx.execute(
      `UPDATE local_review_intents SET status = 'archived' WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ? AND status IN ('pending', 'inflight', 'error', 'conflict')`,
      [userId, deviceId, kbId],
    )
  }

  async saveIntent(tx: LocalSqlDatabase | 'localstorage', userId: string, deviceId: string, intent: LocalReviewIntent) {
    validateIntent(intent, userId, deviceId)
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const intents = store.intents
      const index = intents.findIndex(i => i.deviceId === deviceId && i.clientCommandId === intent.clientCommandId)
      if (index !== -1) {
        if (JSON.stringify(intents[index].payload) !== JSON.stringify(intent.payload)) throw new Error('IMMUTABLE_REVIEW_INTENT')
      } else {
        intents.push(intent)
      }
      store.intents = intents
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await (tx as LocalSqlDatabase).execute(
      `INSERT INTO local_review_intents (
        client_command_id, user_id, device_id, knowledge_block_id,
        action, occurred_at, payload_json, status, created_at, prepared, preparation_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, device_id, client_command_id) DO NOTHING`,
      [
        intent.clientCommandId, userId, deviceId, intent.knowledgeBlockId,
        intent.action, intent.occurredAt, JSON.stringify(intent.payload),
        intent.status, intent.createdAt, intent.prepared ? 1 : 0,
        JSON.stringify(intent.preparation)
      ]
    )
  }

  async freezePreparedIntent(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    clientCommandId: string,
    originalPayload: Record<string, unknown>,
    preparedPayload: Record<string, unknown>,
  ): Promise<boolean> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const intent = store.intents.find(item => item.deviceId === deviceId && item.clientCommandId === clientCommandId)
      if (!intent || intent.prepared || intent.status !== 'pending'
        || JSON.stringify(intent.payload) !== JSON.stringify(originalPayload)) return false
      intent.payload = preparedPayload
      intent.prepared = true
      store.intents = store.intents
      writeBrowserStore(userId, deviceId, store)
      return true
    }
    const rows = await tx.select<LocalReviewIntentRow>(
      `SELECT payload_json, prepared, status FROM local_review_intents
       WHERE user_id = ? AND device_id = ? AND client_command_id = ?`,
      [userId, deviceId, clientCommandId],
    )
    const row = rows[0]
    if (!row || row.prepared !== 0 || row.status !== 'pending'
      || row.payload_json !== JSON.stringify(originalPayload)) return false
    const result = await tx.execute(
      `UPDATE local_review_intents SET payload_json = ?, prepared = 1
       WHERE user_id = ? AND device_id = ? AND client_command_id = ?
         AND prepared = 0 AND status = 'pending' AND payload_json = ?`,
      [JSON.stringify(preparedPayload), userId, deviceId, clientCommandId, JSON.stringify(originalPayload)],
    )
    // Some SQLite facades don't return affected row counts. The transaction is
    // serialized; a matching pre-read and successful update is the commit proof.
    return result !== false
  }

  async recoverConflictIntentToPending(
    tx: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    clientCommandId: string,
    expectedPayload: Record<string, unknown>,
    expectedPreparation: Record<string, unknown> | LocalReviewPreparation,
  ): Promise<boolean> {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      const intent = store.intents.find(item => item.deviceId === deviceId && item.clientCommandId === clientCommandId)
      if (!intent || intent.prepared || intent.status !== 'conflict'
        || JSON.stringify(intent.payload) !== JSON.stringify(expectedPayload)
        || JSON.stringify(intent.preparation) !== JSON.stringify(expectedPreparation)) {
        return false
      }
      intent.status = 'pending'
      writeBrowserStore(userId, deviceId, store)
      return true
    }
    const rows = await tx.select<LocalReviewIntentRow>(
      `SELECT payload_json, preparation_json, prepared, status FROM local_review_intents
       WHERE user_id = ? AND device_id = ? AND client_command_id = ?`,
      [userId, deviceId, clientCommandId],
    )
    const row = rows[0]
    if (!row || row.prepared !== 0 || row.status !== 'conflict'
      || row.payload_json !== JSON.stringify(expectedPayload)
      || row.preparation_json !== JSON.stringify(expectedPreparation)) {
      return false
    }
    const result = await tx.execute(
      `UPDATE local_review_intents SET status = 'pending'
       WHERE user_id = ? AND device_id = ? AND client_command_id = ?
         AND prepared = 0 AND status = 'conflict'
         AND payload_json = ? AND preparation_json = ?`,
      [userId, deviceId, clientCommandId, JSON.stringify(expectedPayload), JSON.stringify(expectedPreparation)],
    )
    return result !== false
  }
  
  async deleteIntent(tx: LocalSqlDatabase | 'localstorage', userId: string, deviceId: string, clientCommandId: string) {
    if (tx === 'localstorage') {
      const store = readBrowserStore(userId, deviceId)
      store.intents = store.intents.filter(i => !(i.deviceId === deviceId && i.clientCommandId === clientCommandId))
      writeBrowserStore(userId, deviceId, store)
      return
    }
    await (tx as LocalSqlDatabase).execute(
      `DELETE FROM local_review_intents WHERE user_id = ? AND device_id = ? AND client_command_id = ?`,
      [userId, deviceId, clientCommandId]
    )
  }
}
