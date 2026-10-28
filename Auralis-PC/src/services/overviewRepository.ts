import { createVersionedLocalSchema, type LocalSqlDatabase } from '@/services/localSchema'
import { OVERVIEW_INTENT_CREATED_EVENT, notifyOverviewCacheUpdated } from '@/services/overviewSyncWakeup'
import type {
  FileFingerprintInput, FileOverviewRecord, OverviewCacheRecord, OverviewMode, OverviewOutboxRecord,
  OutlineIdentityInput, OutlineProvenanceInput, OverviewResponse, OverviewResultCommand, OverviewSyncState, SubjectOverviewRecord,
} from '@/types/overview'
import { createOutlineIdentityInput, createOutlineProvenanceInput } from './outlineIdentity.ts'

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface Options { sql?: LocalSqlDatabase; storage?: StorageLike; schemaReady?: Promise<void>; now?: () => string }
interface Row {
  scope_type: 'FILE' | 'SUBJECT'; scope_id: string; revision_key: string; title: string
  outline_json: string | null; summary_json: string | null; outline_generated_at: string | null
  outline_identity_json: string | null; outline_identity_input_json: string | null
  outline_provenance_json: string | null; outline_provenance_input_json: string | null; identity_ready: number | null
  summary_generated_at: string | null; input_fingerprint: string | null; status: 'READY' | 'FAILED'
  error_code: string | null; error_detail: string | null; updated_at: string
}
interface OutboxRow {
  client_write_id: string; scope_type: 'FILE' | 'SUBJECT'; scope_id: string; revision_key: string
  state: OverviewOutboxRecord['state']; intent_json: string; request_json: string | null
  error_code: string | null; created_at: string; updated_at: string
}
interface StateRow { state_json: string }
interface BrowserState {
  records: OverviewCacheRecord[]
  states: OverviewSyncState[]
  outbox: OverviewOutboxRecord[]
}
export interface SaveFileOverviewPartInput { sourceId: string; ingestionRevision: string; mode: OverviewMode; response: OverviewResponse; outlineIdentityInput?: OutlineIdentityInput; outlineProvenanceInput?: OutlineProvenanceInput; generationBaseline?: string; isStillCurrent?: () => boolean }
export interface SaveSubjectOverviewPartInput { subjectId: string; mode: OverviewMode; response: OverviewResponse; inputFingerprint: string; outlineIdentityInput?: OutlineIdentityInput; outlineProvenanceInput?: OutlineProvenanceInput; generationBaseline?: string; isStillCurrent?: () => boolean }
export type OverviewScopeType = 'FILE' | 'SUBJECT'
export interface OverviewScopeFenceToken {
  userId: string
  serverDeviceId: string
  scopeType: OverviewScopeType
  scopeId: string
  generation: number
}
export interface OverviewScopeDeletionTicket extends OverviewScopeFenceToken {}
export type GenerationEditConflictResolution = { status: 'KEPT' | 'APPLIED' | 'CHANGED'; generationConflicts?: OverviewCacheRecord['generationConflicts'] }

const SUBJECT_REVISION_KEY = 'subject-v1'
const browserWriteQueues = new Map<string, Promise<void>>()
const sqlWriteQueues = new WeakMap<object, Promise<void>>()
const scopeLifecycle = new Map<string, { generation: number; state: 'DELETING' | 'DELETED' | 'ACTIVE' }>()
const SCOPE_FENCE_REJECTED = Symbol('OVERVIEW_SCOPE_FENCE_REJECTED')
const SAVE_NOT_CURRENT = Symbol('OVERVIEW_SAVE_NOT_CURRENT')
const GENERATION_EDIT_CONFLICT = 'OVERVIEW_GENERATION_EDIT_CONFLICT'
const isGenerationEditConflict = (item: OverviewOutboxRecord): boolean => item.errorCode === GENERATION_EDIT_CONFLICT
export const isOverviewGenerationEditConflict = isGenerationEditConflict
export function isOverviewSaveNotCurrent(error: unknown): boolean { return error === SAVE_NOT_CURRENT }
function assertSaveCurrent(isStillCurrent?: () => boolean): void {
  if (isStillCurrent && !isStillCurrent()) throw SAVE_NOT_CURRENT
}
const scopeLifecycleKey = (userId: string, serverDeviceId: string, scopeType: OverviewScopeType, scopeId: string): string =>
  JSON.stringify([userId,serverDeviceId,scopeType,scopeId])
function currentScopeLifecycle(userId: string, serverDeviceId: string, scopeType: OverviewScopeType, scopeId: string) {
  return scopeLifecycle.get(scopeLifecycleKey(userId,serverDeviceId,scopeType,scopeId)) ?? { generation: 0, state: 'ACTIVE' as const }
}
function tokenAllowsScopeWrite(token: OverviewScopeFenceToken): boolean {
  const current = currentScopeLifecycle(token.userId,token.serverDeviceId,token.scopeType,token.scopeId)
  return current.state === 'ACTIVE' && current.generation === token.generation
}
export function beginOverviewScopeDeletion(userId: string, serverDeviceId: string, scopeType: OverviewScopeType, scopeId: string): OverviewScopeDeletionTicket {
  const id = requireValue(scopeId,'OVERVIEW_SCOPE_INVALID')
  const key = scopeLifecycleKey(userId,serverDeviceId,scopeType,id)
  const generation = currentScopeLifecycle(userId,serverDeviceId,scopeType,id).generation + 1
  scopeLifecycle.set(key,{ generation, state: 'DELETING' })
  return { userId, serverDeviceId, scopeType, scopeId: id, generation }
}
export function completeOverviewScopeDeletion(ticket: OverviewScopeDeletionTicket): void {
  const key = scopeLifecycleKey(ticket.userId,ticket.serverDeviceId,ticket.scopeType,ticket.scopeId)
  const current = scopeLifecycle.get(key)
  if (current?.generation === ticket.generation && current.state === 'DELETING') scopeLifecycle.set(key,{ ...current, state: 'DELETED' })
}
export function cancelOverviewScopeDeletion(ticket: OverviewScopeDeletionTicket): boolean {
  const key = scopeLifecycleKey(ticket.userId,ticket.serverDeviceId,ticket.scopeType,ticket.scopeId)
  const current = scopeLifecycle.get(key)
  if (current?.generation === ticket.generation && current.state === 'DELETING') {
    scopeLifecycle.set(key,{ generation: current.generation + 1, state: 'ACTIVE' })
    return true
  }
  return false
}
export function reactivateRestoredOverviewScope(userId: string, serverDeviceId: string, scopeType: OverviewScopeType, scopeId: string): boolean {
  const id = requireValue(scopeId,'OVERVIEW_SCOPE_INVALID')
  const key = scopeLifecycleKey(userId,serverDeviceId,scopeType,id)
  const current = scopeLifecycle.get(key)
  if (!current || current.state !== 'DELETED') return false
  scopeLifecycle.set(key,{ generation: current.generation + 1, state: 'ACTIVE' })
  return true
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const parse = <T>(value: string | null): T | null => {
  if (value === null) return null
  try { return JSON.parse(value) as T } catch { throw new Error('OVERVIEW_CACHE_CORRUPT') }
}
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const validLocator = (value: unknown): boolean => value === null || Boolean(value && typeof value === 'object'
  && ((value as Record<string, unknown>).page === null || (Number.isInteger((value as Record<string, unknown>).page) && Number((value as Record<string, unknown>).page) > 0))
  && nullableString((value as Record<string, unknown>).blockId))
const validOutline = (value: unknown): value is OverviewCacheRecord['outline'] => value === null || (Array.isArray(value) && value.every(chapter => Boolean(chapter && typeof chapter === 'object'
  && typeof chapter.title === 'string' && Array.isArray(chapter.sections) && chapter.sections.every((section: unknown) => Boolean(section && typeof section === 'object'
    && typeof (section as Record<string, unknown>).title === 'string'
    && nullableString((section as Record<string, unknown>).summary)
    && stringList((section as Record<string, unknown>).sourceIds)
    && validLocator((section as Record<string, unknown>).locator))))))
const validSummary = (value: unknown): value is OverviewCacheRecord['summary'] => value === null || Boolean(value && typeof value === 'object'
  && typeof (value as Record<string, unknown>).overview === 'string'
  && stringList((value as Record<string, unknown>).keyPoints)
  && stringList((value as Record<string, unknown>).learningPath))
const validCacheRecord = (value: unknown): value is OverviewCacheRecord => Boolean(value && typeof value === 'object'
  && ['FILE', 'SUBJECT'].includes(String((value as Record<string, unknown>).scopeType))
  && typeof (value as Record<string, unknown>).scopeId === 'string' && String((value as Record<string, unknown>).scopeId).trim()
  && typeof (value as Record<string, unknown>).revisionKey === 'string' && String((value as Record<string, unknown>).revisionKey).trim()
  && (value as Record<string, unknown>).schemaVersion === 1
  && typeof (value as Record<string, unknown>).title === 'string'
  && validOutline((value as Record<string, unknown>).outline)
  && validSummary((value as Record<string, unknown>).summary)
  && nullableString((value as Record<string, unknown>).outlineGeneratedAt)
  && nullableString((value as Record<string, unknown>).summaryGeneratedAt)
  && nullableString((value as Record<string, unknown>).inputFingerprint)
  && ['READY', 'FAILED'].includes(String((value as Record<string, unknown>).status))
  && nullableString((value as Record<string, unknown>).errorCode)
  && nullableString((value as Record<string, unknown>).errorDetail)
  && typeof (value as Record<string, unknown>).updatedAt === 'string')
function normalizeCacheRecord(record: OverviewCacheRecord): OverviewCacheRecord {
  return {
    ...record,
    identityReady: record.identityReady === true && Boolean(record.outlineIdentity),
    outlineIdentity: record.outlineIdentity ?? null,
    outlineIdentityInput: record.outlineIdentityInput ?? null,
    outlineProvenance: record.outlineProvenance ?? null,
    outlineProvenanceInput: record.outlineProvenanceInput ?? null,
  }
}
const requireValue = (value: string, code: string): string => {
  const normalized = value.trim()
  if (!normalized) throw new Error(code)
  return normalized
}
const requireFileRevision = (value: string): string => {
  const revision = requireValue(value, 'OVERVIEW_REVISION_INVALID')
  if (revision === SUBJECT_REVISION_KEY) throw new Error('OVERVIEW_REVISION_INVALID')
  return revision
}
const safeErrorCode = (value: string): string => /^[A-Z0-9_]{1,64}$/.test(value) ? value : 'OVERVIEW_GENERATION_FAILED'
const safeErrorDetail = (value: string): string => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500)
const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function newWriteId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) throw new Error('OVERVIEW_CRYPTO_UNAVAILABLE')
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isComplete(record: OverviewCacheRecord): boolean {
  return record.status === 'READY' && Array.isArray(record.outline) && record.outline.length > 0
    && Boolean(record.summary && record.summary.overview.trim())
}

function editablePartBaseline(record: OverviewCacheRecord | null, mode: OverviewMode): string {
  if (!record) return 'null'
  return canonicalize({
    ...(mode !== 'SUMMARY' ? {
      outline: record.outline,
      outlineIdentityInput: record.outlineIdentityInput ?? null,
      outlineProvenanceInput: record.outlineProvenanceInput ?? null,
    } : {}),
    ...(mode !== 'OUTLINE' ? { summary: record.summary } : {}),
  })
}

function notifyOverviewIntentCreated(userId: string, serverDeviceId: string, record: OverviewCacheRecord): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(OVERVIEW_INTENT_CREATED_EVENT, {
    detail: { userId, serverDeviceId, scopeType: record.scopeType, scopeId: record.scopeId },
  }))
}

function outboxFromRow(row: OutboxRow): OverviewOutboxRecord {
  const intent = parse<OverviewOutboxRecord>(row.intent_json)
  if (!intent || intent.clientWriteId !== row.client_write_id || intent.scopeType !== row.scope_type
    || intent.scopeId !== row.scope_id || intent.revisionKey !== row.revision_key
    || intent.state !== row.state || intent.errorCode !== row.error_code) throw new Error('OVERVIEW_OUTBOX_CORRUPT')
  intent.requestBody = parse<OverviewResultCommand>(row.request_json)
  return intent
}

function validSyncState(value: unknown): value is OverviewSyncState {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['FILE', 'SUBJECT'].includes(String(item.scopeType)) && typeof item.scopeId === 'string'
    && typeof item.revisionKey === 'string' && Number.isInteger(item.version) && Number(item.version) > 0
    && (item.outlineVersion === null || Number.isInteger(item.outlineVersion) && Number(item.outlineVersion) > 0)
    && (item.summaryVersion === null || Number.isInteger(item.summaryVersion) && Number(item.summaryVersion) > 0)
    && (item.outlineSourceManifest === null || Array.isArray(item.outlineSourceManifest))
    && (item.summarySourceManifest === null || Array.isArray(item.summarySourceManifest))
    && nullableString(item.outlineInputFingerprint) && nullableString(item.summaryInputFingerprint)
    && typeof item.updatedAt === 'string'
}

function validOutbox(value: unknown): value is OverviewOutboxRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.clientWriteId === 'string' && ['FILE', 'SUBJECT'].includes(String(item.scopeType))
    && typeof item.scopeId === 'string' && typeof item.revisionKey === 'string'
    && ['ALL', 'OUTLINE', 'SUMMARY'].includes(String(item.mode))
    && ['LOCAL_WRITE', 'LEGACY_SEED'].includes(String(item.origin))
    && Boolean(item.result && typeof item.result === 'object')
    && nullableString(item.inputFingerprint)
    && ['PREPARED', 'PENDING', 'INFLIGHT', 'CONFLICT', 'ERROR', 'STALE'].includes(String(item.state))
    && (item.requestBody === null || Boolean(item.requestBody && typeof item.requestBody === 'object'))
    && nullableString(item.outlineGeneratedAt) && nullableString(item.summaryGeneratedAt)
    && (item.generationBaseline === undefined || nullableString(item.generationBaseline))
    && nullableString(item.errorCode) && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

export async function computeSubjectInputFingerprint(files: FileFingerprintInput[]): Promise<string> {
  const normalized = [...files].sort((a, b) => a.sourceId.localeCompare(b.sourceId))
    .map(({ sourceId, ingestionRevision, outline, summary }) => ({ sourceId, ingestionRevision, outline, summary }))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(normalized)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function fromRow(row: Row): OverviewCacheRecord {
  const outline = parse<unknown>(row.outline_json)
  const summary = parse<unknown>(row.summary_json)
  const outlineIdentity = parse<OverviewCacheRecord['outlineIdentity']>(row.outline_identity_json)
  const outlineIdentityInput = parse<OverviewCacheRecord['outlineIdentityInput']>(row.outline_identity_input_json)
  const outlineProvenance = parse<OverviewCacheRecord['outlineProvenance']>(row.outline_provenance_json)
  const outlineProvenanceInput = parse<OverviewCacheRecord['outlineProvenanceInput']>(row.outline_provenance_input_json)
  if (!validOutline(outline) || !validSummary(summary)) throw new Error('OVERVIEW_CACHE_CORRUPT')
  return { scopeType: row.scope_type, scopeId: row.scope_id, revisionKey: row.revision_key, schemaVersion: 1,
    title: row.title, outline, summary,
    identityReady: Number(row.identity_ready ?? 0) === 1 && Boolean(outlineIdentity), outlineIdentity,
    outlineIdentityInput, outlineProvenance, outlineProvenanceInput,
    outlineGeneratedAt: row.outline_generated_at, summaryGeneratedAt: row.summary_generated_at,
    inputFingerprint: row.input_fingerprint, status: row.status, errorCode: row.error_code,
    errorDetail: row.error_detail, updatedAt: row.updated_at }
}

export class OverviewRepository {
  readonly userId: string
  readonly serverDeviceId: string
  private readonly sql?: LocalSqlDatabase
  private readonly storage: StorageLike
  private readonly schemaReady?: Promise<void>
  private readonly now: () => string
  private readonly namespace: string
  private sqlReady: Promise<void> | null = null

  constructor(userId: string, serverDeviceId: string, options: Options = {}) {
    if (!userId.trim() || !serverDeviceId.trim()) throw new Error('OVERVIEW_SCOPE_INVALID')
    if (options.sql && options.storage) throw new Error('OverviewRepository accepts either sql or storage, not both')
    this.userId = userId; this.serverDeviceId = serverDeviceId
    this.sql = options.sql; this.schemaReady = options.schemaReady
    this.storage = options.storage ?? (typeof window === 'undefined' ? { getItem: () => null, setItem: () => undefined } : window.localStorage)
    this.now = options.now ?? (() => new Date().toISOString())
    this.namespace = `auralis:v1:overviews:${encodeURIComponent(userId)}:${encodeURIComponent(serverDeviceId)}`
  }

  captureScopeFenceToken(scopeType: OverviewScopeType, scopeId: string): OverviewScopeFenceToken {
    const id = requireValue(scopeId,'OVERVIEW_SCOPE_INVALID')
    const current = currentScopeLifecycle(this.userId,this.serverDeviceId,scopeType,id)
    return { userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType, scopeId: id, generation: current.generation }
  }

  beginScopeDeletion(scopeType: OverviewScopeType, scopeId: string): OverviewScopeDeletionTicket {
    return beginOverviewScopeDeletion(this.userId,this.serverDeviceId,scopeType,scopeId)
  }

  completeScopeDeletion(ticket: OverviewScopeDeletionTicket): void {
    completeOverviewScopeDeletion(ticket)
  }

  cancelScopeDeletion(ticket: OverviewScopeDeletionTicket): boolean {
    return cancelOverviewScopeDeletion(ticket)
  }

  reactivateRestoredScope(scopeType: OverviewScopeType, scopeId: string): boolean {
    return reactivateRestoredOverviewScope(this.userId,this.serverDeviceId,scopeType,scopeId)
  }

  isScopeFenceTokenCurrent(token: OverviewScopeFenceToken): boolean {
    return token.userId === this.userId && token.serverDeviceId === this.serverDeviceId && tokenAllowsScopeWrite(token)
  }

  private captureAndValidateToken(scopeType: OverviewScopeType, scopeId: string, token?: OverviewScopeFenceToken): OverviewScopeFenceToken {
    const captured = token ?? this.captureScopeFenceToken(scopeType,scopeId)
    if (captured.scopeType !== scopeType || captured.scopeId !== scopeId
      || captured.userId !== this.userId || captured.serverDeviceId !== this.serverDeviceId) throw new Error('OVERVIEW_SCOPE_CHANGED')
    return captured
  }

  private async ensureSql(): Promise<void> {
    if (!this.sql) return
    if (!this.sqlReady) this.sqlReady = this.schemaReady ?? createVersionedLocalSchema(this.sql)
    await this.sqlReady
  }
  private readBrowserState(): BrowserState {
    const raw = this.storage.getItem(this.namespace)
    if (raw === null) return { records: [], states: [], outbox: [] }
    try {
      const parsed = JSON.parse(raw)
      // Before local schema v11 the browser fallback stored only the cache array.
      if (Array.isArray(parsed)) {
        if (!parsed.every(validCacheRecord)) throw new Error('OVERVIEW_CACHE_CORRUPT')
        return { records: parsed.map(normalizeCacheRecord), states: [], outbox: [] }
      }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records) || !parsed.records.every(validCacheRecord)
        || !Array.isArray(parsed.states) || !parsed.states.every(validSyncState)
        || !Array.isArray(parsed.outbox) || !parsed.outbox.every(validOutbox)) throw new Error('OVERVIEW_CACHE_CORRUPT')
      const state = parsed as BrowserState
      state.records = state.records.map(normalizeCacheRecord)
      return state
    } catch { throw new Error('OVERVIEW_CACHE_CORRUPT') }
  }
  private writeBrowserState(state: BrowserState): void { this.storage.setItem(this.namespace, JSON.stringify(state)) }
  private async get(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, database?: LocalSqlDatabase): Promise<OverviewCacheRecord | null> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      const rows = await (database ?? this.sql).select<Row>(`SELECT scope_type,scope_id,revision_key,title,outline_json,summary_json,
        outline_generated_at,summary_generated_at,outline_identity_json,outline_identity_input_json,
        outline_provenance_json,outline_provenance_input_json,identity_ready,input_fingerprint,status,error_code,error_detail,updated_at
        FROM ai_overview_cache WHERE user_id=$1 AND device_id=$2 AND scope_type=$3 AND scope_id=$4 AND revision_key=$5`,
      [this.userId, this.serverDeviceId, scopeType, scopeId, revisionKey])
      return rows[0] ? fromRow(rows[0]) : null
    }
    const found = this.readBrowserState().records.find(item => item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey)
    return found ? clone(found) : null
  }
  private async getLatest(scopeType: 'FILE' | 'SUBJECT', scopeId: string, database?: LocalSqlDatabase): Promise<OverviewCacheRecord | null> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      const rows = await (database ?? this.sql).select<Row>(`SELECT scope_type,scope_id,revision_key,title,outline_json,summary_json,
        outline_generated_at,summary_generated_at,outline_identity_json,outline_identity_input_json,
        outline_provenance_json,outline_provenance_input_json,identity_ready,input_fingerprint,status,error_code,error_detail,updated_at
        FROM ai_overview_cache WHERE user_id=$1 AND device_id=$2 AND scope_type=$3 AND scope_id=$4
        ORDER BY updated_at DESC LIMIT 1`,
      [this.userId, this.serverDeviceId, scopeType, scopeId])
      return rows[0] ? fromRow(rows[0]) : null
    }
    const found = this.readBrowserState().records
      .filter(item => item.scopeType === scopeType && item.scopeId === scopeId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    return found ? clone(found) : null
  }
  private serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.sql ? (sqlWriteQueues.get(this.sql) ?? Promise.resolve()) : (browserWriteQueues.get(this.namespace) ?? Promise.resolve())
    const run = this.sql ? operation : () => this.withBrowserWriteLock(operation)
    const result = previous.then(run, run)
    const settled = result.then(() => undefined, () => undefined)
    if (this.sql) sqlWriteQueues.set(this.sql, settled)
    else browserWriteQueues.set(this.namespace, settled)
    return result
  }
  private withBrowserWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
    if (!locks || typeof locks.request !== 'function') {
      return Promise.reject(Object.assign(
        new Error('Browser overview writes require the Web Locks API'),
        { code: 'OVERVIEW_BROWSER_LOCK_UNAVAILABLE' },
      ))
    }
    return locks.request(`${this.namespace}:overview-state`, { mode: 'exclusive' }, operation)
  }
  private async transaction<T>(operation: (database?: LocalSqlDatabase) => Promise<T>): Promise<T> {
    if (!this.sql) return operation()
    await this.ensureSql()
    if (this.sql.transaction) return this.sql.transaction(database => operation(database))
    await this.sql.execute('BEGIN IMMEDIATE')
    try {
      const result = await operation(this.sql)
      await this.sql.execute('COMMIT')
      return result
    } catch (error) {
      await this.sql.execute('ROLLBACK')
      throw error
    }
  }
  private merge(current: OverviewCacheRecord | null, scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string,
    mode: OverviewMode, response: OverviewResponse, inputFingerprint: string | null,
    identityInput?: OutlineIdentityInput, provenanceInput?: OutlineProvenanceInput): OverviewCacheRecord {
    const now = this.now(), replaceOutline = mode !== 'SUMMARY', replaceSummary = mode !== 'OUTLINE'
    if (replaceOutline && response.outline == null) throw new Error('OVERVIEW_OUTLINE_MISSING')
    if (replaceSummary && response.summary == null) throw new Error('OVERVIEW_SUMMARY_MISSING')
    return { scopeType, scopeId, revisionKey, schemaVersion: 1, title: response.title,
      outline: replaceOutline ? response.outline : current?.outline ?? null,
      summary: replaceSummary ? response.summary : current?.summary ?? null,
      identityReady: replaceOutline ? false : current?.identityReady ?? false,
      outlineIdentity: replaceOutline ? null : current?.outlineIdentity ?? null,
      outlineIdentityInput: replaceOutline ? identityInput ?? createOutlineIdentityInput(response.outline ?? []) : current?.outlineIdentityInput ?? null,
      outlineProvenance: replaceOutline ? response.outlineProvenance ?? null : current?.outlineProvenance ?? null,
      outlineProvenanceInput: replaceOutline
        ? provenanceInput ?? createOutlineProvenanceInput(response.outlineProvenance) ?? null
        : current?.outlineProvenanceInput ?? null,
      outlineGeneratedAt: replaceOutline ? now : current?.outlineGeneratedAt ?? null,
      summaryGeneratedAt: replaceSummary ? now : current?.summaryGeneratedAt ?? null,
      inputFingerprint: inputFingerprint ?? current?.inputFingerprint ?? null,
      status: 'READY', errorCode: null, errorDetail: null, updatedAt: now }
  }
  private async persist(record: OverviewCacheRecord, database?: LocalSqlDatabase): Promise<void> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      await (database ?? this.sql).execute(`INSERT INTO ai_overview_cache
        (user_id,device_id,scope_type,scope_id,revision_key,schema_version,title,outline_json,summary_json,
         outline_generated_at,summary_generated_at,outline_identity_json,outline_identity_input_json,
         outline_provenance_json,outline_provenance_input_json,identity_ready,
         input_fingerprint,status,error_code,error_detail,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT(user_id,device_id,scope_type,scope_id,revision_key) DO UPDATE SET
        schema_version=excluded.schema_version,title=excluded.title,outline_json=excluded.outline_json,
        summary_json=excluded.summary_json,outline_generated_at=excluded.outline_generated_at,
        summary_generated_at=excluded.summary_generated_at,input_fingerprint=excluded.input_fingerprint,
        outline_identity_json=excluded.outline_identity_json,outline_identity_input_json=excluded.outline_identity_input_json,
        outline_provenance_json=excluded.outline_provenance_json,outline_provenance_input_json=excluded.outline_provenance_input_json,
        identity_ready=excluded.identity_ready,
        status=excluded.status,error_code=excluded.error_code,error_detail=excluded.error_detail,updated_at=excluded.updated_at`,
      [this.userId,this.serverDeviceId,record.scopeType,record.scopeId,record.revisionKey,1,record.title,
        record.outline ? JSON.stringify(record.outline) : null,record.summary ? JSON.stringify(record.summary) : null,
        record.outlineGeneratedAt,record.summaryGeneratedAt,record.outlineIdentity ? JSON.stringify(record.outlineIdentity) : null,
        record.outlineIdentityInput ? JSON.stringify(record.outlineIdentityInput) : null,
        record.outlineProvenance ? JSON.stringify(record.outlineProvenance) : null,
        record.outlineProvenanceInput ? JSON.stringify(record.outlineProvenanceInput) : null,record.identityReady ? 1 : 0,
        record.inputFingerprint,record.status,record.errorCode,record.errorDetail,record.updatedAt])
      return
    }
    const state = this.readBrowserState(), index = state.records.findIndex(item => item.scopeType === record.scopeType && item.scopeId === record.scopeId && item.revisionKey === record.revisionKey)
    if (index < 0) state.records.push(record); else state.records[index] = record
    this.writeBrowserState(state)
  }
  private makeIntent(record: OverviewCacheRecord, mode: OverviewMode, origin: OverviewOutboxRecord['origin']): OverviewOutboxRecord {
    const now = this.now()
    return {
      clientWriteId: newWriteId(), scopeType: record.scopeType, scopeId: record.scopeId,
      revisionKey: record.revisionKey, mode, origin,
      result: { schemaVersion: 1, title: record.title, outline: record.outline, summary: record.summary },
      outlineIdentityInput: mode === 'SUMMARY' ? null : record.outlineIdentityInput
        ?? (record.identityReady && record.outlineIdentity
          ? { schemaVersion: 1, nodes: record.outlineIdentity.nodes.map(node => ({ path: [...node.path], nodeId: node.nodeId })) }
          : origin === 'LEGACY_SEED' ? null : createOutlineIdentityInput(record.outline ?? [])),
      outlineProvenanceInput: mode === 'SUMMARY' ? null : record.outlineProvenanceInput
        ?? createOutlineProvenanceInput(record.outlineProvenance) ?? null,
      inputFingerprint: record.inputFingerprint,
      outlineGeneratedAt: record.outlineGeneratedAt, summaryGeneratedAt: record.summaryGeneratedAt,
      state: 'PREPARED', requestBody: null, errorCode: null, createdAt: now, updatedAt: now,
    }
  }
  private makeGenerationConflictIntent(record: OverviewCacheRecord, mode: OverviewMode, response: OverviewResponse,
    generationBaseline: string, inputFingerprint: string | null): OverviewOutboxRecord {
    const intent = this.makeIntent(record,mode,'LOCAL_WRITE')
    intent.result = { schemaVersion: 1, title: response.title,
      outline: mode === 'SUMMARY' ? null : response.outline,
      summary: mode === 'OUTLINE' ? null : response.summary,
      ...(mode === 'SUMMARY' ? {} : { outlineProvenance: response.outlineProvenance ?? null }) }
    intent.outlineIdentityInput = mode === 'SUMMARY' ? null : record.outlineIdentityInput ?? null
    intent.outlineProvenanceInput = mode === 'SUMMARY' ? null : record.outlineProvenanceInput ?? null
    intent.inputFingerprint = inputFingerprint
    intent.generationBaseline = generationBaseline
    intent.state = 'CONFLICT'
    intent.errorCode = GENERATION_EDIT_CONFLICT
    return intent
  }
  private async insertOutbox(intent: OverviewOutboxRecord, database?: LocalSqlDatabase): Promise<void> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      await (database ?? this.sql).execute(`INSERT INTO overview_sync_outbox
        (user_id,device_id,client_write_id,scope_type,scope_id,revision_key,state,intent_json,request_json,error_code,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [this.userId,this.serverDeviceId,intent.clientWriteId,intent.scopeType,intent.scopeId,intent.revisionKey,intent.state,
        JSON.stringify(intent),null,intent.errorCode,intent.createdAt,intent.updatedAt])
      return
    }
    const state = this.readBrowserState()
    state.outbox.push(clone(intent))
    this.writeBrowserState(state)
  }
  private async persistSuccessful(record: OverviewCacheRecord, mode: OverviewMode, database?: LocalSqlDatabase, isStillCurrent?: () => boolean): Promise<boolean> {
    const complete = isComplete(record)
    if (this.sql) {
      assertSaveCurrent(isStillCurrent)
      await this.persist(record, database)
      assertSaveCurrent(isStillCurrent)
      if (!complete) return false
      const existing = await this.getOutboxForScope(record.scopeType,record.scopeId,record.revisionKey,database)
      assertSaveCurrent(isStillCurrent)
      const requiresConflictResolution = existing.some(item => item.state === 'CONFLICT' && !isGenerationEditConflict(item))
      await this.staleSupersededIntents(record.scopeType,record.scopeId,record.revisionKey,database)
      assertSaveCurrent(isStillCurrent)
      const next = this.makeIntent(record, mode, 'LOCAL_WRITE')
      if (requiresConflictResolution) {
        next.state = 'CONFLICT'
        next.errorCode = 'OVERVIEW_CONFLICT_REQUIRES_RESOLUTION'
      }
      await this.insertOutbox(next, database)
      assertSaveCurrent(isStillCurrent)
      return true
    }
    const state = this.readBrowserState()
    const index = state.records.findIndex(item => item.scopeType === record.scopeType && item.scopeId === record.scopeId && item.revisionKey === record.revisionKey)
    if (index < 0) state.records.push(record); else state.records[index] = record
    // localStorage has one atomic key, so successful cache content and its intent commit together.
    if (complete) {
      const requiresConflictResolution = state.outbox.some(item => item.scopeType === record.scopeType && item.scopeId === record.scopeId
        && item.revisionKey === record.revisionKey && item.state === 'CONFLICT' && !isGenerationEditConflict(item))
      state.outbox = state.outbox.map(item => item.scopeType === record.scopeType && item.scopeId === record.scopeId
        && item.revisionKey === record.revisionKey && !isGenerationEditConflict(item) && (item.state === 'CONFLICT' || item.state === 'ERROR')
        ? { ...item, state: 'STALE', errorCode: item.state === 'CONFLICT' ? 'OVERVIEW_CONFLICT_SUPERSEDED' : 'OVERVIEW_ERROR_SUPERSEDED', updatedAt: this.now() } : item)
      const next = this.makeIntent(record, mode, 'LOCAL_WRITE')
      if (requiresConflictResolution) {
        next.state = 'CONFLICT'
        next.errorCode = 'OVERVIEW_CONFLICT_REQUIRES_RESOLUTION'
      }
      state.outbox.push(next)
    }
    assertSaveCurrent(isStillCurrent)
    this.writeBrowserState(state)
    return complete
  }
  private async staleSupersededIntents(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, database?: LocalSqlDatabase): Promise<void> {
    const intents = await this.getOutboxForScope(scopeType,scopeId,revisionKey,database)
    for (const item of intents) if (!isGenerationEditConflict(item) && (item.state === 'CONFLICT' || item.state === 'ERROR')) {
      const next = { ...item, state: 'STALE' as const,
        errorCode: item.state === 'CONFLICT' ? 'OVERVIEW_CONFLICT_SUPERSEDED' : 'OVERVIEW_ERROR_SUPERSEDED', updatedAt: this.now() }
      if (this.sql) await (database ?? this.sql!).execute(`UPDATE overview_sync_outbox SET state=$1,intent_json=$2,error_code=$3,updated_at=$4
        WHERE user_id=$5 AND device_id=$6 AND client_write_id=$7`,
      [next.state,JSON.stringify(next),next.errorCode,next.updatedAt,this.userId,this.serverDeviceId,item.clientWriteId])
      else {
        const state = this.readBrowserState()
        state.outbox = state.outbox.map(row => row.clientWriteId === item.clientWriteId ? next : row)
        this.writeBrowserState(state)
      }
    }
  }
  private async getOutboxForScope(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, database?: LocalSqlDatabase): Promise<OverviewOutboxRecord[]> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      const rows = await (database ?? this.sql).select<OutboxRow>(`SELECT client_write_id,scope_type,scope_id,revision_key,state,intent_json,request_json,error_code,created_at,updated_at
        FROM overview_sync_outbox WHERE user_id=$1 AND device_id=$2 AND scope_type=$3 AND scope_id=$4 AND revision_key=$5
        ORDER BY created_at,client_write_id`, [this.userId,this.serverDeviceId,scopeType,scopeId,revisionKey])
      return rows.map(outboxFromRow)
    }
    return this.readBrowserState().outbox.filter(item => item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey)
      .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.clientWriteId.localeCompare(b.clientWriteId)).map(clone)
  }
  private async saveSyncState(state: OverviewSyncState, database?: LocalSqlDatabase): Promise<void> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      await (database ?? this.sql).execute(`INSERT INTO overview_sync_states
        (user_id,device_id,scope_type,scope_id,revision_key,state_json,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(user_id,device_id,scope_type,scope_id,revision_key) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`,
      [this.userId,this.serverDeviceId,state.scopeType,state.scopeId,state.revisionKey,JSON.stringify(state),state.updatedAt])
      return
    }
    const browser = this.readBrowserState(), index = browser.states.findIndex(item => item.scopeType === state.scopeType && item.scopeId === state.scopeId && item.revisionKey === state.revisionKey)
    if (index < 0) browser.states.push(state); else browser.states[index] = state
    this.writeBrowserState(browser)
  }
  private async hydrateSyncStatus(record: OverviewCacheRecord): Promise<OverviewCacheRecord> {
    const outbox = await this.getOutboxForScope(record.scopeType, record.scopeId, record.revisionKey)
    const generationConflicts = [...outbox].filter(item => item.state === 'CONFLICT' && isGenerationEditConflict(item))
      .map(item => ({ clientWriteId: item.clientWriteId, mode: item.mode, result: item.result }))
    const active = [...outbox].reverse().find(item => item.state !== 'STALE' && !isGenerationEditConflict(item))
    if (active?.state === 'CONFLICT') return { ...record, syncStatus: 'CONFLICT', syncError: active.errorCode, generationConflicts }
    if (active?.state === 'ERROR') return { ...record, syncStatus: 'ERROR', syncError: active.errorCode, generationConflicts }
    if (active) return { ...record, syncStatus: 'PENDING', syncError: null, generationConflicts }
    const state = await this.getOverviewSyncState(record.scopeType, record.scopeId, record.revisionKey)
    return { ...record, syncStatus: state ? 'SYNCED' : 'LOCAL', syncError: null, generationConflicts }
  }
  async listCachedOverviews(scopeType?: 'FILE' | 'SUBJECT'): Promise<OverviewCacheRecord[]> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<Row>(`SELECT scope_type,scope_id,revision_key,title,outline_json,summary_json,
        outline_generated_at,summary_generated_at,outline_identity_json,outline_identity_input_json,
        outline_provenance_json,outline_provenance_input_json,identity_ready,input_fingerprint,status,error_code,error_detail,updated_at
        FROM ai_overview_cache WHERE user_id=$1 AND device_id=$2 ${scopeType ? 'AND scope_type=$3' : ''}`,
      scopeType ? [this.userId,this.serverDeviceId,scopeType] : [this.userId,this.serverDeviceId])
      return rows.map(fromRow)
    }
    return this.readBrowserState().records.filter(record => !scopeType || record.scopeType === scopeType).map(clone)
  }
  async listOverviewOutbox(): Promise<OverviewOutboxRecord[]> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<OutboxRow>(`SELECT client_write_id,scope_type,scope_id,revision_key,state,intent_json,request_json,error_code,created_at,updated_at
        FROM overview_sync_outbox WHERE user_id=$1 AND device_id=$2 ORDER BY CASE scope_type WHEN 'FILE' THEN 0 ELSE 1 END,created_at,client_write_id`,
      [this.userId,this.serverDeviceId])
      return rows.map(outboxFromRow)
    }
    return this.readBrowserState().outbox.slice().sort((a,b) => (a.scopeType === b.scopeType ? 0 : a.scopeType === 'FILE' ? -1 : 1)
      || a.createdAt.localeCompare(b.createdAt) || a.clientWriteId.localeCompare(b.clientWriteId)).map(clone)
  }
  async getOverviewSyncState(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, database?: LocalSqlDatabase): Promise<OverviewSyncState | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await (database ?? this.sql).select<StateRow>(`SELECT state_json FROM overview_sync_states
        WHERE user_id=$1 AND device_id=$2 AND scope_type=$3 AND scope_id=$4 AND revision_key=$5`,
      [this.userId,this.serverDeviceId,scopeType,scopeId,revisionKey])
      const parsed = rows[0] ? parse<unknown>(rows[0].state_json) : null
      if (parsed !== null && !validSyncState(parsed)) throw new Error('OVERVIEW_SYNC_STATE_CORRUPT')
      return parsed
    }
    const found = this.readBrowserState().states.find(item => item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey)
    return found ? clone(found) : null
  }
  async clearOverviewSyncState(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string,
    expectedToken?: OverviewScopeFenceToken): Promise<boolean> {
    const token = this.captureAndValidateToken(scopeType,scopeId,expectedToken)
    return this.serializeWrite(async () => {
      if (!this.isScopeFenceTokenCurrent(token)) return false
      try { return await this.transaction(async database => {
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      if (this.sql) {
        await this.ensureSql()
        await (database ?? this.sql).execute(`DELETE FROM overview_sync_states WHERE user_id=$1 AND device_id=$2 AND scope_type=$3 AND scope_id=$4 AND revision_key=$5`,
          [this.userId,this.serverDeviceId,scopeType,scopeId,revisionKey])
      } else {
        const state = this.readBrowserState()
        state.states = state.states.filter(item => !(item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey))
        if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
        this.writeBrowserState(state)
      }
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      return true
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) return false; throw error }
    })
  }
  async enqueueLegacySeed(record: OverviewCacheRecord): Promise<OverviewOutboxRecord | null> {
    if (!isComplete(record)) return null
    const token = this.captureScopeFenceToken(record.scopeType,record.scopeId)
    return this.serializeWrite(async () => {
      if (!this.isScopeFenceTokenCurrent(token)) return null
      try { return await this.transaction(async database => {
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      const queued = await this.getOutboxForScope(record.scopeType,record.scopeId,record.revisionKey,database)
      const syncable = queued.filter(item => item.state !== 'STALE' && !isGenerationEditConflict(item))
      if (syncable.length) return syncable[0]
      const intent = this.makeIntent(record,'ALL','LEGACY_SEED')
      await this.insertOutbox(intent,database)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      return intent
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) return null; throw error }
    })
  }
  async materializeOverviewIntent(clientWriteId: string, requestBody: OverviewResultCommand): Promise<OverviewOutboxRecord | null> {
    return this.serializeWrite(() => this.transaction(async database => {
      const rows = this.sql
        ? await (database ?? this.sql!).select<OutboxRow>(`SELECT client_write_id,scope_type,scope_id,revision_key,state,intent_json,request_json,error_code,created_at,updated_at
          FROM overview_sync_outbox WHERE user_id=$1 AND device_id=$2 AND client_write_id=$3`,[this.userId,this.serverDeviceId,clientWriteId])
        : []
      const state = this.sql ? null : this.readBrowserState()
      const current = this.sql ? (rows[0] ? outboxFromRow(rows[0]) : null) : state!.outbox.find(item => item.clientWriteId === clientWriteId) ?? null
      if (!current || current.state !== 'PREPARED' || current.requestBody !== null) return current ? clone(current) : null
      const token = this.captureScopeFenceToken(current.scopeType,current.scopeId)
      if (!this.isScopeFenceTokenCurrent(token)) return null
      const next: OverviewOutboxRecord = { ...current, state: 'PENDING', requestBody: clone(requestBody), errorCode: null, updatedAt: this.now() }
      if (this.sql) {
        await (database ?? this.sql).execute(`UPDATE overview_sync_outbox SET state=$1,intent_json=$2,request_json=$3,error_code=NULL,updated_at=$4
          WHERE user_id=$5 AND device_id=$6 AND client_write_id=$7 AND state='PREPARED' AND request_json IS NULL`,
        [next.state,JSON.stringify(next),JSON.stringify(requestBody),next.updatedAt,this.userId,this.serverDeviceId,clientWriteId])
      } else {
        state!.outbox = state!.outbox.map(item => item.clientWriteId === clientWriteId ? next : item)
        if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
        this.writeBrowserState(state!)
      }
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      return next
    }).catch(error => { if (error === SCOPE_FENCE_REJECTED) return null; throw error }))
  }
  async setOverviewIntentState(clientWriteId: string, nextState: OverviewOutboxRecord['state'], errorCode: string | null = null): Promise<void> {
    await this.serializeWrite(async () => {
      try { await this.transaction(async database => {
      let current: OverviewOutboxRecord | null = null
      if (this.sql) {
        const rows = await (database ?? this.sql!).select<OutboxRow>(`SELECT client_write_id,scope_type,scope_id,revision_key,state,intent_json,request_json,error_code,created_at,updated_at
          FROM overview_sync_outbox WHERE user_id=$1 AND device_id=$2 AND client_write_id=$3`,[this.userId,this.serverDeviceId,clientWriteId])
        current = rows[0] ? outboxFromRow(rows[0]) : null
      } else current = this.readBrowserState().outbox.find(item => item.clientWriteId === clientWriteId) ?? null
      if (!current) return
      const token = this.captureScopeFenceToken(current.scopeType,current.scopeId)
      if (!this.isScopeFenceTokenCurrent(token)) return
      const next = { ...current, state: nextState, errorCode, updatedAt: this.now() }
      if (this.sql) await (database ?? this.sql!).execute(`UPDATE overview_sync_outbox SET state=$1,intent_json=$2,error_code=$3,updated_at=$4
        WHERE user_id=$5 AND device_id=$6 AND client_write_id=$7`,
      [next.state,JSON.stringify(next),errorCode,next.updatedAt,this.userId,this.serverDeviceId,clientWriteId])
      else {
        const state = this.readBrowserState()
        state.outbox = state.outbox.map(item => item.clientWriteId === clientWriteId ? next : item)
        if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
        this.writeBrowserState(state)
      }
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      }) } catch (error) { if (error !== SCOPE_FENCE_REJECTED) throw error }
    })
  }
  async installRemoteOverview(record: OverviewCacheRecord, remoteState: OverviewSyncState, discardLegacySeed = false,
    expectedToken?: OverviewScopeFenceToken): Promise<boolean> {
    const token = this.captureAndValidateToken(record.scopeType,record.scopeId,expectedToken)
    return this.serializeWrite(async () => {
      if (!this.isScopeFenceTokenCurrent(token)) return false
      try { return await this.transaction(async database => {
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      if (!this.sql) {
        const browser = this.readBrowserState()
        const intents = browser.outbox.filter(item => item.scopeType === remoteState.scopeType && item.scopeId === remoteState.scopeId
          && item.revisionKey === remoteState.revisionKey)
        const keepCandidate = intents.some(item => item.origin === 'LOCAL_WRITE' && item.state !== 'STALE')
        if (discardLegacySeed) browser.outbox = browser.outbox.filter(item => !(item.scopeType === remoteState.scopeType
          && item.scopeId === remoteState.scopeId && item.revisionKey === remoteState.revisionKey && item.origin === 'LEGACY_SEED'))
        browser.states = browser.states.filter(item => !(item.scopeType === remoteState.scopeType && item.scopeId === remoteState.scopeId && item.revisionKey === remoteState.revisionKey))
        browser.states.push(remoteState)
        if (!keepCandidate) {
          browser.records = browser.records.filter(item => !(item.scopeType === record.scopeType && item.scopeId === record.scopeId && item.revisionKey === record.revisionKey))
          browser.records.push(record)
        }
        if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
        this.writeBrowserState(browser)
        return true
      }
      const intents = await this.getOutboxForScope(remoteState.scopeType,remoteState.scopeId,remoteState.revisionKey,database)
      const keepCandidate = intents.some(item => item.origin === 'LOCAL_WRITE' && item.state !== 'STALE')
      if (discardLegacySeed) {
        const seeds = intents.filter(item => item.origin === 'LEGACY_SEED')
        for (const seed of seeds) await this.removeIntent(seed.clientWriteId,database)
      }
      await this.saveSyncState(remoteState,database)
      if (!keepCandidate) await this.persist(record,database)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      notifyOverviewCacheUpdated(typeof window !== 'undefined' ? window : undefined, {
        userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType: record.scopeType, scopeId: record.scopeId, revisionKey: record.revisionKey,
      })
      return true
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) return false; throw error }
    })
  }
  private async removeIntent(clientWriteId: string, database?: LocalSqlDatabase): Promise<void> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      await (database ?? this.sql).execute('DELETE FROM overview_sync_outbox WHERE user_id=$1 AND device_id=$2 AND client_write_id=$3',
        [this.userId,this.serverDeviceId,clientWriteId])
      return
    }
    const state = this.readBrowserState()
    state.outbox = state.outbox.filter(item => item.clientWriteId !== clientWriteId)
    this.writeBrowserState(state)
  }
  async completeOverviewIntent(clientWriteId: string, record: OverviewCacheRecord, remoteState: OverviewSyncState,
    expectedToken?: OverviewScopeFenceToken): Promise<boolean> {
    const token = this.captureAndValidateToken(record.scopeType,record.scopeId,expectedToken)
    return this.serializeWrite(async () => {
      if (!this.isScopeFenceTokenCurrent(token)) return false
      try { return await this.transaction(async database => {
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      if (!this.sql) {
        const browser = this.readBrowserState()
        const completed = browser.outbox.find(item => item.clientWriteId === clientWriteId)
        if (!completed || completed.state === 'STALE' || completed.scopeType !== record.scopeType
          || completed.scopeId !== record.scopeId || completed.revisionKey !== record.revisionKey) return false
        browser.outbox = browser.outbox.filter(item => item.clientWriteId !== clientWriteId)
        browser.states = browser.states.filter(item => !(item.scopeType === remoteState.scopeType && item.scopeId === remoteState.scopeId && item.revisionKey === remoteState.revisionKey))
        browser.states.push(remoteState)
        const remains = browser.outbox.some(item => item.scopeType === record.scopeType && item.scopeId === record.scopeId
          && item.revisionKey === record.revisionKey && item.state !== 'STALE')
        if (!remains) {
          browser.records = browser.records.filter(item => !(item.scopeType === record.scopeType && item.scopeId === record.scopeId && item.revisionKey === record.revisionKey))
          browser.records.push(record)
        }
        if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
        this.writeBrowserState(browser)
        return true
      }
      const intents = await this.getOutboxForScope(remoteState.scopeType,remoteState.scopeId,remoteState.revisionKey,database)
      const completed = intents.find(item => item.clientWriteId === clientWriteId)
      if (!completed || completed.state === 'STALE' || completed.scopeType !== record.scopeType
        || completed.scopeId !== record.scopeId || completed.revisionKey !== record.revisionKey) return false
      await this.removeIntent(clientWriteId,database)
      await this.saveSyncState(remoteState,database)
      const remainder = await this.getOutboxForScope(record.scopeType,record.scopeId,record.revisionKey,database)
      if (!remainder.some(item => item.state !== 'STALE')) await this.persist(record,database)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      return true
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) return false; throw error }
    })
  }
  async retryOverviewConflictLocally(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string): Promise<OverviewOutboxRecord | null> {
    const token = this.captureScopeFenceToken(scopeType,scopeId)
    return this.serializeWrite(async () => {
      if (!this.isScopeFenceTokenCurrent(token)) return null
      try { return await this.transaction(async database => {
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      if (!this.sql) {
        const browser = this.readBrowserState()
        const record = browser.records.find(item => item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey)
        if (!record || !isComplete(record) || !browser.outbox.some(item => item.scopeType === scopeType && item.scopeId === scopeId
          && item.revisionKey === revisionKey && item.state === 'CONFLICT' && !isGenerationEditConflict(item))) return null
        browser.outbox = browser.outbox.map(item => item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey
          && item.state === 'CONFLICT' && !isGenerationEditConflict(item)
          ? { ...item, state: 'STALE', errorCode: 'OVERVIEW_CONFLICT_SUPERSEDED', updatedAt: this.now() } : item)
        const next = this.makeIntent(record,'ALL','LOCAL_WRITE')
        browser.outbox.push(next)
        if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
        this.writeBrowserState(browser)
        return next
      }
      const record = await this.get(scopeType,scopeId,revisionKey,database)
      if (!record || !isComplete(record)) return null
      const intents = await this.getOutboxForScope(scopeType,scopeId,revisionKey,database)
      if (!intents.some(item => item.state === 'CONFLICT' && !isGenerationEditConflict(item))) return null
      await this.staleSupersededIntents(scopeType,scopeId,revisionKey,database)
      const next = this.makeIntent(record,'ALL','LOCAL_WRITE')
      await this.insertOutbox(next,database)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      return next
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) return null; throw error }
    })
  }
  async resolveGenerationEditConflict(clientWriteId: string, choice: 'KEEP_LOCAL' | 'USE_AI', isStillCurrent?: () => boolean,
    validateInputs?: () => Promise<boolean>): Promise<GenerationEditConflictResolution> {
    const all = await this.listOverviewOutbox()
    const candidate = all.find(item => item.clientWriteId === clientWriteId && item.state === 'CONFLICT' && isGenerationEditConflict(item))
    if (!candidate) throw new Error('OVERVIEW_GENERATION_CONFLICT_MISSING')
    if (validateInputs && !await validateInputs()) throw new Error('OVERVIEW_INPUT_CHANGED')
    const token = this.captureScopeFenceToken(candidate.scopeType,candidate.scopeId)
    let result: GenerationEditConflictResolution = { status: 'KEPT' }
    let intentRecord: OverviewCacheRecord | null = null
    await this.serializeWrite(() => this.transaction(async database => {
      assertSaveCurrent(isStillCurrent)
      if (!this.isScopeFenceTokenCurrent(token)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      const currentIntents = await this.getOutboxForScope(candidate.scopeType,candidate.scopeId,candidate.revisionKey,database)
      const exact = currentIntents.find(item => item.clientWriteId === clientWriteId && item.state === 'CONFLICT' && isGenerationEditConflict(item))
      if (!exact) throw new Error('OVERVIEW_GENERATION_CONFLICT_MISSING')
      const current = await this.get(candidate.scopeType,candidate.scopeId,candidate.revisionKey,database)
      if (!current) throw new Error('OVERVIEW_SCOPE_CHANGED')
      const updateExact = async (next: OverviewOutboxRecord) => {
        if (this.sql) await (database ?? this.sql!).execute(`UPDATE overview_sync_outbox SET state=$1,intent_json=$2,error_code=$3,updated_at=$4
          WHERE user_id=$5 AND device_id=$6 AND client_write_id=$7`,
        [next.state,JSON.stringify(next),next.errorCode,next.updatedAt,this.userId,this.serverDeviceId,clientWriteId])
        else {
          const state = this.readBrowserState()
          state.outbox = state.outbox.map(item => item.clientWriteId === clientWriteId ? next : item)
          this.writeBrowserState(state)
        }
      }
      if (choice === 'KEEP_LOCAL') {
        await updateExact({ ...exact, state: 'STALE', errorCode: 'OVERVIEW_GENERATION_EDIT_CONFLICT_DISMISSED', updatedAt: this.now() })
        result = { status: 'KEPT' }
      } else {
        const currentBaseline = editablePartBaseline(current,exact.mode)
        if (currentBaseline !== exact.generationBaseline) {
          const refreshed = { ...exact, generationBaseline: currentBaseline, updatedAt: this.now() }
          await updateExact(refreshed)
          result = { status: 'CHANGED', generationConflicts: [{ clientWriteId, mode: refreshed.mode, result: refreshed.result }] }
        } else {
          assertSaveCurrent(isStillCurrent)
          if (validateInputs && !await validateInputs()) throw new Error('OVERVIEW_INPUT_CHANGED')
          const next = this.merge(current,candidate.scopeType,candidate.scopeId,candidate.revisionKey,exact.mode,exact.result,
            exact.inputFingerprint,exact.outlineIdentityInput ?? undefined,exact.outlineProvenanceInput ?? undefined)
          const created = await this.persistSuccessful(next,exact.mode,database,isStillCurrent)
          if (this.sql) assertSaveCurrent(isStillCurrent)
          await updateExact({ ...exact, state: 'STALE', errorCode: 'OVERVIEW_GENERATION_EDIT_CONFLICT_APPLIED', updatedAt: this.now() })
          if (created) intentRecord = next
          result = { status: 'APPLIED' }
        }
      }
      if (!this.isScopeFenceTokenCurrent(token)) throw new Error('OVERVIEW_SCOPE_CHANGED')
    }))
    if (result.status !== 'CHANGED') notifyOverviewCacheUpdated(typeof window !== 'undefined' ? window : undefined, {
      userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType: candidate.scopeType, scopeId: candidate.scopeId, revisionKey: candidate.revisionKey,
    })
    if (intentRecord) notifyOverviewIntentCreated(this.userId,this.serverDeviceId,intentRecord)
    return result
  }
  async useRemoteOverview(record: OverviewCacheRecord, remoteState: OverviewSyncState,
    expectedToken?: OverviewScopeFenceToken): Promise<boolean> {
    const token = this.captureAndValidateToken(record.scopeType,record.scopeId,expectedToken)
    return this.serializeWrite(async () => {
      if (!this.isScopeFenceTokenCurrent(token)) return false
      try { return await this.transaction(async database => {
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      if (!this.sql) {
        const browser = this.readBrowserState()
        browser.outbox = browser.outbox.map(item => item.scopeType === remoteState.scopeType && item.scopeId === remoteState.scopeId
          && item.revisionKey === remoteState.revisionKey && item.state !== 'STALE' && !isGenerationEditConflict(item)
          ? { ...item, state: 'STALE', errorCode: 'OVERVIEW_LOCAL_DISCARDED', updatedAt: this.now() } : item)
        browser.states = browser.states.filter(item => !(item.scopeType === remoteState.scopeType && item.scopeId === remoteState.scopeId && item.revisionKey === remoteState.revisionKey))
        browser.states.push(remoteState)
        browser.records = browser.records.filter(item => !(item.scopeType === record.scopeType && item.scopeId === record.scopeId && item.revisionKey === record.revisionKey))
        browser.records.push(record)
        if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
        this.writeBrowserState(browser)
        return true
      }
      const intents = await this.getOutboxForScope(remoteState.scopeType,remoteState.scopeId,remoteState.revisionKey,database)
      for (const item of intents) if (item.state !== 'STALE' && !isGenerationEditConflict(item)) {
        const next = { ...item, state: 'STALE' as const, errorCode: 'OVERVIEW_LOCAL_DISCARDED', updatedAt: this.now() }
        if (this.sql) await (database ?? this.sql!).execute(`UPDATE overview_sync_outbox SET state=$1,intent_json=$2,error_code=$3,updated_at=$4
          WHERE user_id=$5 AND device_id=$6 AND client_write_id=$7`,
        [next.state,JSON.stringify(next),next.errorCode,next.updatedAt,this.userId,this.serverDeviceId,item.clientWriteId])
      }
      await this.saveSyncState(remoteState,database)
      await this.persist(record,database)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      notifyOverviewCacheUpdated(typeof window !== 'undefined' ? window : undefined, {
        userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType: record.scopeType, scopeId: record.scopeId, revisionKey: record.revisionKey,
      })
      return true
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) return false; throw error }
    })
  }
  async markFileRevisionStale(sourceId: string, currentRevision: string): Promise<void> {
    const records = await this.listOverviewOutbox()
    for (const item of records) if (item.scopeType === 'FILE' && item.scopeId === sourceId && item.revisionKey !== currentRevision && item.state !== 'STALE') {
      await this.setOverviewIntentState(item.clientWriteId,'STALE','OVERVIEW_REVISION_STALE')
    }
  }
  async getFileOverview(sourceId: string, ingestionRevision: string): Promise<FileOverviewRecord | null> {
    requireValue(sourceId, 'OVERVIEW_SCOPE_INVALID')
    requireFileRevision(ingestionRevision)
    const record = await this.get('FILE', sourceId, ingestionRevision)
    return record ? { ...await this.hydrateSyncStatus(record), scopeType: 'FILE', sourceId, ingestionRevision } : null
  }
  async captureGenerationBaseline(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, mode: OverviewMode): Promise<string> {
    const record = await this.get(scopeType,scopeId,revisionKey)
    return editablePartBaseline(record,mode)
  }
  async getLatestFileOverview(sourceId: string): Promise<FileOverviewRecord | null> {
    requireValue(sourceId, 'OVERVIEW_SCOPE_INVALID')
    const record = await this.getLatest('FILE', sourceId)
    return record ? { ...await this.hydrateSyncStatus(record), scopeType: 'FILE', sourceId, ingestionRevision: record.revisionKey } : null
  }
  async saveFileOverviewPart(input: SaveFileOverviewPartInput): Promise<FileOverviewRecord> {
    requireValue(input.sourceId, 'OVERVIEW_SCOPE_INVALID')
    requireFileRevision(input.ingestionRevision)
    const token = this.captureScopeFenceToken('FILE',input.sourceId)
    const saved = await this.serializeWrite(async () => {
      assertSaveCurrent(input.isStillCurrent)
      if (!this.isScopeFenceTokenCurrent(token)) throw new Error('OVERVIEW_SCOPE_DELETED')
      try { return await this.transaction(async database => {
      assertSaveCurrent(input.isStillCurrent)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      const current = await this.get('FILE', input.sourceId, input.ingestionRevision, database)
      const next = this.merge(current, 'FILE', input.sourceId,
        input.ingestionRevision, input.mode, input.response, null, input.outlineIdentityInput, input.outlineProvenanceInput)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      assertSaveCurrent(input.isStillCurrent)
      if (input.generationBaseline !== undefined && editablePartBaseline(current,input.mode) !== input.generationBaseline) {
        const conflict = this.makeGenerationConflictIntent(next,input.mode,input.response,editablePartBaseline(current,input.mode),null)
        await this.insertOutbox(conflict,database)
        return { record: { ...(current ?? next), generationConflicts: [{ clientWriteId: conflict.clientWriteId, mode: conflict.mode, result: conflict.result }],
          scopeType: 'FILE' as const, sourceId: input.sourceId, ingestionRevision: input.ingestionRevision }, intentCreated: false }
      }
      const intentCreated = await this.persistSuccessful(next, input.mode, database, input.isStillCurrent)
      if (this.sql) assertSaveCurrent(input.isStillCurrent)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      return {
        record: { ...next, syncStatus: intentCreated ? 'PENDING' as const : undefined, scopeType: 'FILE' as const, sourceId: input.sourceId, ingestionRevision: input.ingestionRevision },
        intentCreated,
      }
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) throw new Error('OVERVIEW_SCOPE_DELETED'); throw error }
    })
    if (saved.intentCreated) notifyOverviewIntentCreated(this.userId,this.serverDeviceId,saved.record)
    notifyOverviewCacheUpdated(typeof window !== 'undefined' ? window : undefined, {
      userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType: 'FILE', scopeId: input.sourceId, revisionKey: input.ingestionRevision,
    })
    return saved.record
  }
  async getSubjectOverview(subjectId: string): Promise<SubjectOverviewRecord | null> {
    requireValue(subjectId, 'OVERVIEW_SCOPE_INVALID')
    const record = await this.get('SUBJECT', subjectId, SUBJECT_REVISION_KEY)
    return record ? { ...await this.hydrateSyncStatus(record), scopeType: 'SUBJECT', subjectId } : null
  }
  async saveSubjectOverviewPart(input: SaveSubjectOverviewPartInput): Promise<SubjectOverviewRecord> {
    requireValue(input.subjectId, 'OVERVIEW_SCOPE_INVALID')
    const token = this.captureScopeFenceToken('SUBJECT',input.subjectId)
    const saved = await this.serializeWrite(async () => {
      assertSaveCurrent(input.isStillCurrent)
      if (!this.isScopeFenceTokenCurrent(token)) throw new Error('OVERVIEW_SCOPE_DELETED')
      try { return await this.transaction(async database => {
      assertSaveCurrent(input.isStillCurrent)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      const current = await this.get('SUBJECT', input.subjectId, SUBJECT_REVISION_KEY, database)
      const next = this.merge(current, 'SUBJECT', input.subjectId,
        SUBJECT_REVISION_KEY, input.mode, input.response, input.inputFingerprint, input.outlineIdentityInput, input.outlineProvenanceInput)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      assertSaveCurrent(input.isStillCurrent)
      if (input.generationBaseline !== undefined && editablePartBaseline(current,input.mode) !== input.generationBaseline) {
        const conflict = this.makeGenerationConflictIntent(next,input.mode,input.response,editablePartBaseline(current,input.mode),input.inputFingerprint)
        await this.insertOutbox(conflict,database)
        return { record: { ...(current ?? next), generationConflicts: [{ clientWriteId: conflict.clientWriteId, mode: conflict.mode, result: conflict.result }],
          scopeType: 'SUBJECT' as const, subjectId: input.subjectId }, intentCreated: false }
      }
      const intentCreated = await this.persistSuccessful(next, input.mode, database, input.isStillCurrent)
      if (this.sql) assertSaveCurrent(input.isStillCurrent)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      return {
        record: { ...next, syncStatus: intentCreated ? 'PENDING' as const : undefined, scopeType: 'SUBJECT' as const, subjectId: input.subjectId },
        intentCreated,
      }
      }) } catch (error) { if (error === SCOPE_FENCE_REJECTED) throw new Error('OVERVIEW_SCOPE_DELETED'); throw error }
    })
    if (saved.intentCreated) notifyOverviewIntentCreated(this.userId,this.serverDeviceId,saved.record)
    notifyOverviewCacheUpdated(typeof window !== 'undefined' ? window : undefined, {
      userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType: 'SUBJECT', scopeId: input.subjectId, revisionKey: SUBJECT_REVISION_KEY,
    })
    return saved.record
  }
  async markSubjectOverviewFailed(subjectId: string, _mode: OverviewMode, errorCode: string, errorDetail: string): Promise<void> {
    requireValue(subjectId, 'OVERVIEW_SCOPE_INVALID')
    await this.markFailed('SUBJECT', subjectId, SUBJECT_REVISION_KEY, errorCode, errorDetail)
  }
  async markFileOverviewFailed(sourceId: string, ingestionRevision: string, _mode: OverviewMode, errorCode: string, errorDetail: string): Promise<void> {
    requireValue(sourceId, 'OVERVIEW_SCOPE_INVALID')
    requireFileRevision(ingestionRevision)
    await this.markFailed('FILE', sourceId, ingestionRevision, errorCode, errorDetail)
  }
  private async markFailed(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, errorCode: string, errorDetail: string): Promise<void> {
    const token = this.captureScopeFenceToken(scopeType,scopeId)
    await this.serializeWrite(async () => {
      if (!this.isScopeFenceTokenCurrent(token)) return
      try { await this.transaction(async database => {
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      const current = await this.get(scopeType, scopeId, revisionKey, database)
      const now = this.now()
      await this.persist(current
        ? { ...current, status: 'FAILED', errorCode: safeErrorCode(errorCode), errorDetail: safeErrorDetail(errorDetail), updatedAt: now }
        : { scopeType, scopeId, revisionKey, schemaVersion: 1, title: '', outline: null, summary: null,
            identityReady: false, outlineIdentity: null, outlineIdentityInput: null,
            outlineProvenance: null, outlineProvenanceInput: null,
            outlineGeneratedAt: null, summaryGeneratedAt: null, inputFingerprint: null, status: 'FAILED',
            errorCode: safeErrorCode(errorCode), errorDetail: safeErrorDetail(errorDetail), updatedAt: now }, database)
      if (!this.isScopeFenceTokenCurrent(token)) throw SCOPE_FENCE_REJECTED
      notifyOverviewCacheUpdated(typeof window !== 'undefined' ? window : undefined, {
        userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType, scopeId, revisionKey,
      })
      }) } catch (error) { if (error !== SCOPE_FENCE_REJECTED) throw error }
    })
  }
  async removeFileOverviews(sourceId: string): Promise<void> {
    requireValue(sourceId, 'OVERVIEW_SCOPE_INVALID')
    await this.serializeWrite(() => this.transaction(database => this.removeScope('FILE', sourceId, database)))
  }
  async removeSubjectOverview(subjectId: string): Promise<void> {
    requireValue(subjectId, 'OVERVIEW_SCOPE_INVALID')
    await this.serializeWrite(() => this.transaction(database => this.removeScope('SUBJECT', subjectId, database)))
  }
  private async removeScope(scopeType: 'FILE' | 'SUBJECT', scopeId: string, database?: LocalSqlDatabase): Promise<void> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      await (database ?? this.sql).execute('DELETE FROM ai_overview_cache WHERE user_id=$1 AND device_id=$2 AND scope_type=$3 AND scope_id=$4', [this.userId,this.serverDeviceId,scopeType,scopeId])
      await (database ?? this.sql).execute(`UPDATE overview_sync_outbox SET state='STALE',error_code='OVERVIEW_SCOPE_DELETED',updated_at=$1
        WHERE user_id=$2 AND device_id=$3 AND scope_type=$4 AND scope_id=$5 AND state <> 'STALE'`,
      [this.now(),this.userId,this.serverDeviceId,scopeType,scopeId])
      return
    }
    const state = this.readBrowserState()
    state.records = state.records.filter(item => item.scopeType !== scopeType || item.scopeId !== scopeId)
    state.outbox = state.outbox.map(item => item.scopeType === scopeType && item.scopeId === scopeId && item.state !== 'STALE'
      ? { ...item, state: 'STALE', errorCode: 'OVERVIEW_SCOPE_DELETED', updatedAt: this.now() } : item)
    this.writeBrowserState(state)
  }
}
