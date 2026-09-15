import { createVersionedLocalSchema, type LocalSqlDatabase } from '@/services/localSchema'
import type { FileFingerprintInput, FileOverviewRecord, OverviewCacheRecord, OverviewMode, OverviewResponse, SubjectOverviewRecord } from '@/types/overview'

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface Options { sql?: LocalSqlDatabase; storage?: StorageLike; schemaReady?: Promise<void>; now?: () => string }
interface Row {
  scope_type: 'FILE' | 'SUBJECT'; scope_id: string; revision_key: string; title: string
  outline_json: string | null; summary_json: string | null; outline_generated_at: string | null
  summary_generated_at: string | null; input_fingerprint: string | null; status: 'READY' | 'FAILED'
  error_code: string | null; error_detail: string | null; updated_at: string
}
export interface SaveFileOverviewPartInput { sourceId: string; ingestionRevision: string; mode: OverviewMode; response: OverviewResponse }
export interface SaveSubjectOverviewPartInput { subjectId: string; mode: OverviewMode; response: OverviewResponse; inputFingerprint: string }

const SUBJECT_REVISION_KEY = 'subject-v1'
const browserWriteQueues = new Map<string, Promise<void>>()
const sqlWriteQueues = new WeakMap<object, Promise<void>>()
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

export async function computeSubjectInputFingerprint(files: FileFingerprintInput[]): Promise<string> {
  const normalized = [...files].sort((a, b) => a.sourceId.localeCompare(b.sourceId))
    .map(({ sourceId, ingestionRevision, outline, summary }) => ({ sourceId, ingestionRevision, outline, summary }))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(normalized)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function fromRow(row: Row): OverviewCacheRecord {
  const outline = parse<unknown>(row.outline_json)
  const summary = parse<unknown>(row.summary_json)
  if (!validOutline(outline) || !validSummary(summary)) throw new Error('OVERVIEW_CACHE_CORRUPT')
  return { scopeType: row.scope_type, scopeId: row.scope_id, revisionKey: row.revision_key, schemaVersion: 1,
    title: row.title, outline, summary,
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

  private async ensureSql(): Promise<void> {
    if (!this.sql) return
    if (!this.sqlReady) this.sqlReady = this.schemaReady ?? createVersionedLocalSchema(this.sql)
    await this.sqlReady
  }
  private readBrowser(): OverviewCacheRecord[] {
    const raw = this.storage.getItem(this.namespace)
    if (raw === null) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every(validCacheRecord)) throw new Error('OVERVIEW_CACHE_CORRUPT')
      return parsed
    } catch { throw new Error('OVERVIEW_CACHE_CORRUPT') }
  }
  private writeBrowser(records: OverviewCacheRecord[]): void { this.storage.setItem(this.namespace, JSON.stringify(records)) }
  private async get(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, database?: LocalSqlDatabase): Promise<OverviewCacheRecord | null> {
    if (this.sql) {
      if (!database) await this.ensureSql()
      const rows = await (database ?? this.sql).select<Row>(`SELECT scope_type,scope_id,revision_key,title,outline_json,summary_json,
        outline_generated_at,summary_generated_at,input_fingerprint,status,error_code,error_detail,updated_at
        FROM ai_overview_cache WHERE user_id=$1 AND device_id=$2 AND scope_type=$3 AND scope_id=$4 AND revision_key=$5`,
      [this.userId, this.serverDeviceId, scopeType, scopeId, revisionKey])
      return rows[0] ? fromRow(rows[0]) : null
    }
    const found = this.readBrowser().find(item => item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey)
    return found ? clone(found) : null
  }
  private serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.sql ? (sqlWriteQueues.get(this.sql) ?? Promise.resolve()) : (browserWriteQueues.get(this.namespace) ?? Promise.resolve())
    const result = previous.then(operation, operation)
    const settled = result.then(() => undefined, () => undefined)
    if (this.sql) sqlWriteQueues.set(this.sql, settled)
    else browserWriteQueues.set(this.namespace, settled)
    return result
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
    mode: OverviewMode, response: OverviewResponse, inputFingerprint: string | null): OverviewCacheRecord {
    const now = this.now(), replaceOutline = mode !== 'SUMMARY', replaceSummary = mode !== 'OUTLINE'
    if (replaceOutline && response.outline == null) throw new Error('OVERVIEW_OUTLINE_MISSING')
    if (replaceSummary && response.summary == null) throw new Error('OVERVIEW_SUMMARY_MISSING')
    return { scopeType, scopeId, revisionKey, schemaVersion: 1, title: response.title,
      outline: replaceOutline ? response.outline : current?.outline ?? null,
      summary: replaceSummary ? response.summary : current?.summary ?? null,
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
         outline_generated_at,summary_generated_at,input_fingerprint,status,error_code,error_detail,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT(user_id,device_id,scope_type,scope_id,revision_key) DO UPDATE SET
        schema_version=excluded.schema_version,title=excluded.title,outline_json=excluded.outline_json,
        summary_json=excluded.summary_json,outline_generated_at=excluded.outline_generated_at,
        summary_generated_at=excluded.summary_generated_at,input_fingerprint=excluded.input_fingerprint,
        status=excluded.status,error_code=excluded.error_code,error_detail=excluded.error_detail,updated_at=excluded.updated_at`,
      [this.userId,this.serverDeviceId,record.scopeType,record.scopeId,record.revisionKey,1,record.title,
        record.outline ? JSON.stringify(record.outline) : null,record.summary ? JSON.stringify(record.summary) : null,
        record.outlineGeneratedAt,record.summaryGeneratedAt,record.inputFingerprint,record.status,record.errorCode,record.errorDetail,record.updatedAt])
      return
    }
    const records = this.readBrowser(), index = records.findIndex(item => item.scopeType === record.scopeType && item.scopeId === record.scopeId && item.revisionKey === record.revisionKey)
    if (index < 0) records.push(record); else records[index] = record
    this.writeBrowser(records)
  }
  async getFileOverview(sourceId: string, ingestionRevision: string): Promise<FileOverviewRecord | null> {
    requireValue(sourceId, 'OVERVIEW_SCOPE_INVALID')
    requireFileRevision(ingestionRevision)
    const record = await this.get('FILE', sourceId, ingestionRevision)
    return record ? { ...record, scopeType: 'FILE', sourceId, ingestionRevision } : null
  }
  async saveFileOverviewPart(input: SaveFileOverviewPartInput): Promise<FileOverviewRecord> {
    requireValue(input.sourceId, 'OVERVIEW_SCOPE_INVALID')
    requireFileRevision(input.ingestionRevision)
    return this.serializeWrite(() => this.transaction(async database => {
      const next = this.merge(await this.get('FILE', input.sourceId, input.ingestionRevision, database), 'FILE', input.sourceId,
        input.ingestionRevision, input.mode, input.response, null)
      await this.persist(next, database)
      return { ...next, scopeType: 'FILE', sourceId: input.sourceId, ingestionRevision: input.ingestionRevision }
    }))
  }
  async getSubjectOverview(subjectId: string): Promise<SubjectOverviewRecord | null> {
    requireValue(subjectId, 'OVERVIEW_SCOPE_INVALID')
    const record = await this.get('SUBJECT', subjectId, SUBJECT_REVISION_KEY)
    return record ? { ...record, scopeType: 'SUBJECT', subjectId } : null
  }
  async saveSubjectOverviewPart(input: SaveSubjectOverviewPartInput): Promise<SubjectOverviewRecord> {
    requireValue(input.subjectId, 'OVERVIEW_SCOPE_INVALID')
    return this.serializeWrite(() => this.transaction(async database => {
      const next = this.merge(await this.get('SUBJECT', input.subjectId, SUBJECT_REVISION_KEY, database), 'SUBJECT', input.subjectId,
        SUBJECT_REVISION_KEY, input.mode, input.response, input.inputFingerprint)
      await this.persist(next, database)
      return { ...next, scopeType: 'SUBJECT', subjectId: input.subjectId }
    }))
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
    await this.serializeWrite(() => this.transaction(async database => {
      const current = await this.get(scopeType, scopeId, revisionKey, database)
      const now = this.now()
      await this.persist(current
        ? { ...current, status: 'FAILED', errorCode: safeErrorCode(errorCode), errorDetail: safeErrorDetail(errorDetail), updatedAt: now }
        : { scopeType, scopeId, revisionKey, schemaVersion: 1, title: '', outline: null, summary: null,
            outlineGeneratedAt: null, summaryGeneratedAt: null, inputFingerprint: null, status: 'FAILED',
            errorCode: safeErrorCode(errorCode), errorDetail: safeErrorDetail(errorDetail), updatedAt: now }, database)
    }))
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
      return
    }
    this.writeBrowser(this.readBrowser().filter(item => item.scopeType !== scopeType || item.scopeId !== scopeId))
  }
}
