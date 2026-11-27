import Database from '@tauri-apps/plugin-sql'
import type { OverviewResultView } from '@/api/overviewApi'
import type { ReviewState } from '@/api/reviewApi'
import type { SourceView } from '@/api/sourceApi'
import type { SubjectStats } from '@/api/statsApi'
import { removeStorageItem } from '@/platform/storage'
import type { KnowledgeBlock } from '@/store/useBlockStore'
import type { Task } from '@/store/useTaskStore'
import { buildSyncedBlockRecord } from '@/utils/blockSyncMapper'
import { formatLocalTimeHHmm } from '@/utils/dateKey'
import { normalizeTaskPosition } from '@/utils/taskSyncMapper'
import { localDataScope } from './localDataScope.ts'
import { deleteCachedDocument } from './localDocumentCache.ts'

export type TaskMutationPayloadCleanupResult =
  | { status: 'changed'; payload: string }
  | { status: 'unchanged'; payload: string }
  | { status: 'invalid'; payload: string }

interface SyncMetadataRow {
  key: string
  value: string | null
}

interface LocalMutationRow {
  id: number
  client_id: string
  entity_type: string
  entity_id: string
  action: string
  payload: string | null
  created_at: number
  sync_status: string
}

interface MutationCleanupRow {
  id: number
  payload: string | null
}

interface KnowledgeBlockRow {
  id: string
  subject: string | null
  title: string | null
  preview: string | null
  time: string | null
  source: string | null
  color: string | null
  sync_status: string | null
  is_deleted: number | null
  sync_version: number | null
  subject_id: string | null
  source_file_id: string | null
  tags: string | null
  mastery: number | null
  review_at: string | null
  related_block_ids: string | null
}

interface TaskBlockRow {
  id: string
  name: string | null
  subject: string | null
  desc: string | null
  duration: number | null
  status: string | null
  startTime?: string | null
  starttime?: string | null
  scheduled_at: string | null
  due_at: string | null
  sync_status: string | null
  is_deleted: number | null
  sync_version: number | null
  position: string | number | null
  subject_id: string | null
}

interface SyncStatusVersionRow {
  sync_status: string | null
  sync_version: number | null
}

export interface SubjectRecord {
  id: string
  name: string
  description: string
  icon: string
  sort_key: string
  sortKey?: string
  created_at: number
  version: number
}

export interface SourceFileRecord {
  id: string
  subject_id: string
  name: string
  file_path: string
  file_type: string
  file_size: number
  catalog_json: string
  block_count: number
  created_at: number
  version: number
  payload_json: string
}

export interface SubjectInput {
  id: string
  name: string
  description?: string
  icon?: string
  sortKey?: string
  sort_key?: string
  created_at?: number
  version?: number
}

export interface SourceFileInput {
  id: string
  subject_id?: string
  name?: string
  file_path?: string
  file_type?: string
  file_size?: number
  assetSizeBytes?: number
  catalog_json?: string
  block_count?: number
  created_at?: number
  version?: number
  payload_json?: string
}

interface SourceFileIdPayloadRow {
  id?: string | null
  payload_json?: string | null
}

interface SourceFileExistingRow {
  id: string
  subject_id: string | null
  catalog_json: string | null
  block_count: number | null
  payload_json: string | null
}

interface PayloadJsonRow {
  payload_json: string | null
}

const SCOPE_TABLES = [
  'sync_metadata',
  'local_mutations',
  'knowledge_blocks',
  'task_blocks',
  'subjects',
  'source_files',
  'ai_overview_cache',
  'review_states_cache',
  'subject_stats_cache',
  'tablet_notes',
] as const

const FOCUS_STORAGE_KEYS = ['focus_state', 'focus_daily', 'focus_outbox'] as const
const DEFAULT_SCOPE = 'legacy-unassigned'

let invalidTaskPayloadWarningEmitted = false

const openDatabases = new Map<string, Database>()
const initializedScopes = new Set<string>()
const initializingScopes = new Map<string, Promise<void>>()
const scopeOpQueues = new Map<string, Promise<void>>()
const inFlightMutationIds = new Set<string>()
const cacheWriteQueues = new Map<string, Promise<void>>()

/** Strips deprecated color fields from offline task mutation payloads during schema migration. */
export function cleanTaskMutationPayload(payload: unknown): TaskMutationPayloadCleanupResult {
  const rawPayload = typeof payload === 'string' ? payload : (JSON.stringify(payload) ?? '')
  try {
    const parsed = JSON.parse(rawPayload)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { status: 'invalid', payload: rawPayload }
    }
    const record = parsed as Record<string, unknown>
    const hasColor = Object.prototype.hasOwnProperty.call(record, 'color')
    const hasColorOverride = Object.prototype.hasOwnProperty.call(record, 'colorOverride')
    if (!hasColor && !hasColorOverride) return { status: 'unchanged', payload: rawPayload }
    if (hasColor) delete record.color
    if (hasColorOverride) delete record.colorOverride
    return { status: 'changed', payload: JSON.stringify(record) }
  } catch {
    return { status: 'invalid', payload: rawPayload }
  }
}

function warnInvalidTaskPayload(): void {
  if (invalidTaskPayloadWarningEmitted) return
  invalidTaskPayloadWarningEmitted = true
  console.warn('[SQLite Mobile] Preserving invalid TASK color payload during migration')
}

function parseNumericVersion(record: Record<string, unknown>): number | null {
  const raw = record.version ?? record.sync_version
  if (raw === undefined || raw === null || raw === '') return null
  const num = Number(raw)
  return Number.isFinite(num) && num >= 0 ? num : null
}

/** Preserves the highest known base sync version when coalescing local mutations. */
export function preserveMutationBaseVersion(incoming: unknown, priorRaw: unknown): unknown {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming
  let prior: Record<string, unknown> | null = null
  if (typeof priorRaw === 'string') {
    try {
      const parsed = JSON.parse(priorRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        prior = parsed as Record<string, unknown>
      }
    } catch {
      prior = null
    }
  } else if (priorRaw && typeof priorRaw === 'object' && !Array.isArray(priorRaw)) {
    prior = priorRaw as Record<string, unknown>
  }
  if (!prior) return incoming
  const next = { ...(incoming as Record<string, unknown>) }
  const priorVer = parseNumericVersion(prior)
  if (next.sync_version === undefined && prior.sync_version !== undefined) {
    next.sync_version = prior.sync_version
  } else if (priorVer !== null && next.sync_version !== undefined && priorVer > Number(next.sync_version)) {
    next.sync_version = priorVer
  }
  if (next.version === undefined && prior.version !== undefined) {
    next.version = prior.version
  } else if (priorVer !== null && next.version !== undefined && priorVer > Number(next.version)) {
    next.version = priorVer
  }
  return next
}

function safeCurrentScope(): string | null {
  try {
    return localDataScope.current()
  } catch {
    return null
  }
}

function currentScope(): string {
  return safeCurrentScope() || DEFAULT_SCOPE
}

function databasePathForScope(scope: string): string {
  return `sqlite:auralis_${scope}.db`
}

function parseJsonSafely<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function safeFiniteInt(raw: unknown, fallback = 0): number {
  const num = Number(raw)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

function normalizeBindValues(params: unknown[] = []): unknown[] {
  return params.map((value) => {
    if (value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
  })
}

function convertQuestionPlaceholders(sql: string): string {
  let out = ''
  let index = 0
  let paramIndex = 0
  while (index < sql.length) {
    const ch = sql[index]
    if (ch === "'" || ch === '"') {
      const quote = ch
      out += ch
      index += 1
      while (index < sql.length) {
        out += sql[index]
        if (sql[index] === quote) {
          if (index + 1 < sql.length && sql[index + 1] === quote) {
            out += sql[index + 1]
            index += 2
            continue
          }
          index += 1
          break
        }
        index += 1
      }
      continue
    }
    if (ch === '-' && sql[index + 1] === '-') {
      const newlineIndex = sql.indexOf('\n', index + 2)
      if (newlineIndex === -1) {
        out += sql.slice(index)
        break
      }
      out += sql.slice(index, newlineIndex + 1)
      index = newlineIndex + 1
      continue
    }
    if (ch === '/' && sql[index + 1] === '*') {
      const closeIndex = sql.indexOf('*/', index + 2)
      if (closeIndex === -1) {
        out += sql.slice(index)
        break
      }
      out += sql.slice(index, closeIndex + 2)
      index = closeIndex + 2
      continue
    }
    if (ch === '?') {
      paramIndex += 1
      out += `$${paramIndex}`
      index += 1
      continue
    }
    out += ch
    index += 1
  }
  return out
}

function stripLeadingSqlComments(sql: string): string {
  let rest = sql.trimStart()
  while (rest.length > 0) {
    if (rest.startsWith('--')) {
      const newlineIndex = rest.indexOf('\n')
      rest = newlineIndex === -1 ? '' : rest.slice(newlineIndex + 1).trimStart()
      continue
    }
    if (rest.startsWith('/*')) {
      const closeIndex = rest.indexOf('*/')
      rest = closeIndex === -1 ? '' : rest.slice(closeIndex + 2).trimStart()
      continue
    }
    break
  }
  return rest
}

function toBlockSyncStatus(raw: unknown): KnowledgeBlock['sync_status'] {
  if (raw === 'pending_create' || raw === 'pending_update' || raw === 'pending_delete') return raw
  return 'synced'
}

function toTaskSyncStatus(raw: unknown): Task['sync_status'] {
  if (raw === 'pending_create' || raw === 'pending_update' || raw === 'pending_delete') return raw
  return 'synced'
}

function toTaskStatus(raw: unknown): Task['status'] {
  if (raw === 'scheduled' || raw === 'completed' || raw === 'cancelled') return raw
  return 'pending'
}

function toMutationId(id: number | string): number | string {
  if (typeof id === 'number') return id
  return /^\d+$/.test(String(id)) ? Number(id) : String(id)
}

function asRecord(input: SubjectInput | SourceFileInput | Record<string, unknown>): Record<string, unknown> {
  return input as Record<string, unknown>
}

function reviewStatesLoadedMetaKey(subjectId: string): string {
  return `review_states_loaded:${subjectId}`
}

function subjectOverviewCacheKey(subjectId: string): string {
  return `SUBJECT:${subjectId}:subject-v1`
}

function sourceOverviewCacheKey(sourceId: string, revisionKey: string): string {
  return `FILE:${sourceId}:${revisionKey}`
}

function subjectStatsCacheKey(subjectId: string, days: 7 | 30, timeZone: string): string {
  return `${subjectId}:${days}:${timeZone}`
}

// Leaf-only per-scope mutex: callers inside enqueueScopeOp must never invoke ensureInitialized or nested localDb helpers.
function enqueueScopeOp<T>(scope: string, task: () => Promise<T>): Promise<T> {
  const previous = scopeOpQueues.get(scope) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.then(() => undefined, () => undefined)
  scopeOpQueues.set(scope, tail)
  void tail.finally(() => {
    if (scopeOpQueues.get(scope) === tail) {
      scopeOpQueues.delete(scope)
    }
  })
  return run
}

async function openDatabaseForScope(scope: string): Promise<Database> {
  const existing = openDatabases.get(scope)
  if (existing) return existing
  const db = await Database.load(databasePathForScope(scope))
  await db.execute('PRAGMA journal_mode = WAL')
  await db.execute('PRAGMA synchronous = NORMAL')
  await db.execute('PRAGMA temp_store = MEMORY')
  await db.execute('PRAGMA busy_timeout = 5000')
  openDatabases.set(scope, db)
  return db
}

function executeRawForScope(scope: string, sql: string, params: unknown[] = []): Promise<void> {
  return enqueueScopeOp(scope, async () => {
    const db = await openDatabaseForScope(scope)
    await db.execute(sql, normalizeBindValues(params))
  })
}

function selectRawForScope<T>(scope: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return enqueueScopeOp(scope, async () => {
    const db = await openDatabaseForScope(scope)
    const rows = await db.select<T[]>(sql, normalizeBindValues(params))
    return rows || []
  })
}

async function createTablesForScope(scope: string): Promise<void> {
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS local_mutations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      action TEXT,
      payload TEXT,
      created_at INTEGER,
      sync_status TEXT DEFAULT 'pending'
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS knowledge_blocks (
      id TEXT PRIMARY KEY,
      subject TEXT,
      title TEXT,
      preview TEXT,
      time TEXT,
      source TEXT,
      color TEXT,
      sync_status TEXT DEFAULT 'synced',
      is_deleted INTEGER DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      subject_id TEXT,
      source_file_id TEXT,
      tags TEXT,
      difficulty TEXT,
      mastery INTEGER DEFAULT 0,
      review_at TEXT,
      related_block_ids TEXT
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS task_blocks (
      id TEXT PRIMARY KEY,
      name TEXT,
      subject TEXT,
      desc TEXT,
      duration INTEGER,
      status TEXT,
      startTime TEXT,
      scheduled_at TEXT,
      due_at TEXT,
      sync_status TEXT DEFAULT 'synced',
      is_deleted INTEGER DEFAULT 0,
      sync_version INTEGER DEFAULT 0,
      position TEXT DEFAULT '0',
      subject_id TEXT
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_key TEXT,
      created_at INTEGER,
      version INTEGER DEFAULT 0
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS source_files (
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      name TEXT NOT NULL,
      file_path TEXT,
      file_type TEXT,
      file_size INTEGER,
      catalog_json TEXT,
      block_count INTEGER DEFAULT 0,
      created_at INTEGER,
      version INTEGER DEFAULT 0,
      payload_json TEXT
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS ai_overview_cache (
      cache_key TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      subject_id TEXT,
      revision_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS review_states_cache (
      knowledge_block_id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS subject_stats_cache (
      cache_key TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      days INTEGER NOT NULL,
      time_zone TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
  await executeRawForScope(
    scope,
    `CREATE TABLE IF NOT EXISTS tablet_notes (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      subject_id TEXT,
      asset_id TEXT,
      title TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
}

async function runMigrationsForScope(scope: string): Promise<void> {
  const alterStatements = [
    'ALTER TABLE knowledge_blocks ADD COLUMN sync_version INTEGER DEFAULT 0',
    'ALTER TABLE task_blocks ADD COLUMN sync_version INTEGER DEFAULT 0',
    "ALTER TABLE task_blocks ADD COLUMN position TEXT DEFAULT '0'",
    'ALTER TABLE knowledge_blocks ADD COLUMN subject_id TEXT',
    'ALTER TABLE knowledge_blocks ADD COLUMN source_file_id TEXT',
    'ALTER TABLE knowledge_blocks ADD COLUMN tags TEXT',
    'ALTER TABLE knowledge_blocks ADD COLUMN difficulty TEXT',
    'ALTER TABLE knowledge_blocks ADD COLUMN mastery INTEGER DEFAULT 0',
    'ALTER TABLE knowledge_blocks ADD COLUMN review_at TEXT',
    'ALTER TABLE knowledge_blocks ADD COLUMN related_block_ids TEXT',
    'ALTER TABLE task_blocks ADD COLUMN subject_id TEXT',
    'ALTER TABLE task_blocks ADD COLUMN scheduled_at TEXT',
    'ALTER TABLE task_blocks ADD COLUMN due_at TEXT',
    'ALTER TABLE subjects ADD COLUMN version INTEGER DEFAULT 0',
    'ALTER TABLE subjects ADD COLUMN sort_key TEXT',
    'ALTER TABLE source_files ADD COLUMN version INTEGER DEFAULT 0',
    'ALTER TABLE source_files ADD COLUMN payload_json TEXT',
    'ALTER TABLE subjects DROP COLUMN color',
    'ALTER TABLE task_blocks DROP COLUMN load',
    'ALTER TABLE task_blocks DROP COLUMN loadText',
    'ALTER TABLE task_blocks DROP COLUMN color',
  ]
  for (const statement of alterStatements) {
    try {
      await executeRawForScope(scope, statement)
    } catch {
      // Safe to ignore when column already matches current schema
    }
  }

  const taskMutations = await selectRawForScope<MutationCleanupRow>(
    scope,
    'SELECT id, payload FROM local_mutations WHERE entity_type = $1',
    ['task'],
  )
  for (const mutation of taskMutations) {
    if (!mutation.payload) continue
    const result = cleanTaskMutationPayload(mutation.payload)
    if (result.status === 'invalid') {
      warnInvalidTaskPayload()
      continue
    }
    if (result.status === 'changed') {
      await executeRawForScope(
        scope,
        'UPDATE local_mutations SET payload = $1 WHERE id = $2',
        [result.payload, mutation.id],
      )
    }
  }
}

async function ensureInitialized(scope: string): Promise<void> {
  if (initializedScopes.has(scope)) return
  const pending = initializingScopes.get(scope)
  if (pending) return pending
  const run = (async () => {
    await createTablesForScope(scope)
    await runMigrationsForScope(scope)
    initializedScopes.add(scope)
  })()
  initializingScopes.set(scope, run)
  try {
    await run
  } finally {
    if (initializingScopes.get(scope) === run) {
      initializingScopes.delete(scope)
    }
  }
}

async function executeForScope(scope: string, sql: string, params: unknown[] = []): Promise<void> {
  await ensureInitialized(scope)
  await executeRawForScope(scope, sql, params)
}

async function selectForScope<T>(scope: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureInitialized(scope)
  return selectRawForScope<T>(scope, sql, params)
}

async function executeScoped(sql: string, params: unknown[] = []): Promise<void> {
  await executeForScope(currentScope(), sql, params)
}

async function selectScoped<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return selectForScope<T>(currentScope(), sql, params)
}

/**
 * Serializes derived-cache writes per scope/table and verifies scope invariance
 * right before committing so account switches or disk constraints cannot corrupt state.
 */
function serializeCacheWrite(bucket: string, operation: (scope: string) => Promise<void>): Promise<void> {
  const expectedScope = safeCurrentScope()
  if (!expectedScope) return Promise.resolve()
  const queueKey = `${expectedScope}:${bucket}`
  const previous = cacheWriteQueues.get(queueKey) ?? Promise.resolve()
  const run = previous.then(async () => {
    const activeScope = safeCurrentScope()
    if (!activeScope || activeScope !== expectedScope) return
    try {
      await operation(expectedScope)
    } catch (error) {
      console.warn(`[SQLite Mobile] Cache persistence skipped (${bucket}):`, error)
    }
  })
  const tail = run.then(() => undefined, () => undefined)
  cacheWriteQueues.set(queueKey, tail)
  void tail.finally(() => {
    if (cacheWriteQueues.get(queueKey) === tail) {
      cacheWriteQueues.delete(queueKey)
    }
  })
  return run
}

async function setMetadataForScope(scope: string, key: string, value: string): Promise<void> {
  await executeForScope(
    scope,
    `INSERT INTO sync_metadata (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}

async function saveBlockForScope(
  scope: string,
  block: KnowledgeBlock,
  syncStatus = 'synced',
  syncVersion = 0,
): Promise<void> {
  const isDeletedVal = block.is_deleted ? 1 : 0
  const versionVal = block.sync_version || syncVersion || 0
  const subjectIdVal = block.subjectId || ''
  const sourceFileIdVal = block.sourceFileId || ''
  const tagsVal = block.tags ? JSON.stringify(block.tags) : '[]'
  const masteryVal = block.mastery || 0
  const reviewAtVal = block.reviewAt || ''
  const relatedBlockIdsVal = block.relatedBlockIds ? JSON.stringify(block.relatedBlockIds) : '[]'

  await executeForScope(
    scope,
    `INSERT INTO knowledge_blocks (
       id, subject, title, preview, time, source, color, sync_status,
       is_deleted, sync_version, subject_id, source_file_id, tags, mastery, review_at, related_block_ids
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT(id) DO UPDATE SET
       subject = excluded.subject,
       title = excluded.title,
       preview = excluded.preview,
       time = excluded.time,
       source = excluded.source,
       color = excluded.color,
       sync_status = excluded.sync_status,
       is_deleted = excluded.is_deleted,
       sync_version = excluded.sync_version,
       subject_id = excluded.subject_id,
       source_file_id = excluded.source_file_id,
       tags = excluded.tags,
       mastery = excluded.mastery,
       review_at = excluded.review_at,
       related_block_ids = excluded.related_block_ids`,
    [
      block.id,
      block.subject || '',
      block.title || '',
      block.preview || '',
      block.time || '',
      block.source || '',
      block.color || '',
      syncStatus,
      isDeletedVal,
      versionVal,
      subjectIdVal,
      sourceFileIdVal,
      tagsVal,
      masteryVal,
      reviewAtVal,
      relatedBlockIdsVal,
    ],
  )
}

async function hardDeleteBlockForScope(scope: string, id: string): Promise<void> {
  await executeForScope(scope, 'DELETE FROM knowledge_blocks WHERE id = $1', [id])
}

async function saveTaskForScope(
  scope: string,
  task: Task,
  syncStatus = 'synced',
  syncVersion = 0,
): Promise<void> {
  if (!task.id) {
    throw new Error('Cannot save a task without an id')
  }
  const taskId = task.id
  const isDeletedVal = task.is_deleted ? 1 : 0
  const versionVal = task.sync_version || syncVersion || 0
  const positionVal = task.position || '0'
  const subjectIdVal = task.subjectId || ''
  const scheduledAtVal = task.scheduledAt || null
  const dueAtVal = task.dueAt || null
  const durationVal = Math.max(0, safeFiniteInt(task.duration, 0))
  const startTimeVal = task.scheduledAt ? formatLocalTimeHHmm(task.scheduledAt) : (task.startTime || null)

  await executeForScope(
    scope,
    `INSERT INTO task_blocks (
       id, name, subject, desc, duration, status, startTime, scheduled_at,
       due_at, sync_status, is_deleted, sync_version, position, subject_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       subject = excluded.subject,
       desc = excluded.desc,
       duration = excluded.duration,
       status = excluded.status,
       startTime = excluded.startTime,
       scheduled_at = excluded.scheduled_at,
       due_at = excluded.due_at,
       sync_status = excluded.sync_status,
       is_deleted = excluded.is_deleted,
       sync_version = excluded.sync_version,
       position = excluded.position,
       subject_id = excluded.subject_id`,
    [
      taskId,
      task.name || '',
      task.subject || '',
      task.desc || '',
      durationVal,
      task.status,
      startTimeVal,
      scheduledAtVal,
      dueAtVal,
      syncStatus,
      isDeletedVal,
      versionVal,
      positionVal,
      subjectIdVal,
    ],
  )
}

async function hardDeleteTaskForScope(scope: string, id: string): Promise<void> {
  await executeForScope(scope, 'DELETE FROM task_blocks WHERE id = $1', [id])
}

async function saveSourceFileForScope(
  scope: string,
  file: SourceFileInput | Record<string, unknown>,
): Promise<void> {
  const record = asRecord(file)
  const fileId = String(record.id || '')
  const exists = await selectForScope<SourceFileExistingRow>(
    scope,
    'SELECT id, subject_id, catalog_json, block_count, payload_json FROM source_files WHERE id = $1',
    [fileId],
  )
  const existingRow = exists[0] ?? null
  const subjectIdVal = typeof record.subject_id === 'string' && record.subject_id
    ? record.subject_id
    : (typeof existingRow?.subject_id === 'string' ? existingRow.subject_id : '')
  const catalogJsonVal = typeof record.catalog_json === 'string'
    ? record.catalog_json
    : (typeof existingRow?.catalog_json === 'string' ? existingRow.catalog_json : '')
  const blockCountVal = record.block_count !== undefined && record.block_count !== null
    ? safeFiniteInt(record.block_count, 0)
    : safeFiniteInt(existingRow?.block_count, 0)
  const fileSizeVal = Math.max(0, safeFiniteInt(record.file_size ?? record.assetSizeBytes, 0))
  const createdAtVal = safeFiniteInt(record.created_at, Date.now())
  const versionVal = safeFiniteInt(record.version, 0)
  const existingPayload = typeof existingRow?.payload_json === 'string' ? existingRow.payload_json : ''
  const payloadJsonVal = typeof record.payload_json === 'string' && record.payload_json.trim()
    ? record.payload_json
    : existingPayload

  if (existingRow) {
    await executeForScope(
      scope,
      `UPDATE source_files SET
         subject_id = $1,
         name = $2,
         file_path = $3,
         file_type = $4,
         file_size = $5,
         catalog_json = $6,
         block_count = $7,
         version = $8,
         payload_json = $9
       WHERE id = $10`,
      [
        subjectIdVal,
        String(record.name || ''),
        String(record.file_path || ''),
        String(record.file_type || ''),
        fileSizeVal,
        catalogJsonVal,
        blockCountVal,
        versionVal,
        payloadJsonVal,
        fileId,
      ],
    )
    return
  }

  await executeForScope(
    scope,
    `INSERT INTO source_files (
       id, subject_id, name, file_path, file_type, file_size,
       catalog_json, block_count, created_at, version, payload_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      fileId,
      subjectIdVal,
      String(record.name || ''),
      String(record.file_path || ''),
      String(record.file_type || ''),
      fileSizeVal,
      catalogJsonVal,
      blockCountVal,
      createdAtVal,
      versionVal,
      payloadJsonVal,
    ],
  )
}

function shouldSkipServerMerge(
  localRows: SyncStatusVersionRow[],
  serverRecord: Record<string, unknown>,
): boolean {
  if (localRows.length === 0 || localRows[0].sync_status === 'synced') return false
  const serverVer = Number(serverRecord.syncVersion ?? serverRecord.sync_version ?? 0)
  const localVer = Number(localRows[0].sync_version ?? 0)
  return serverVer < localVer
}

function preserveFromRows(base: unknown, rows: Array<{ payload: string | null }>): unknown {
  let next = base
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    next = preserveMutationBaseVersion(next, rows[i].payload)
  }
  return next
}

export const localDb = {
  async executeSql(sql: string, params?: unknown[]): Promise<unknown> {
    const normalizedSql = params && params.length > 0 ? convertQuestionPlaceholders(sql) : sql
    const normalizedParams = params ? normalizeBindValues(params) : []
    const isQuery = /^(?:SELECT|PRAGMA|WITH)\b/i.test(stripLeadingSqlComments(normalizedSql))
    if (isQuery) {
      return selectScoped<Record<string, unknown>>(normalizedSql, normalizedParams)
    }
    return executeScoped(normalizedSql, normalizedParams)
  },

  async init(): Promise<void> {
    try {
      const scope = currentScope()
      const inFlight = initializingScopes.get(scope)
      if (inFlight) {
        await inFlight
      }
      initializedScopes.delete(scope)
      await ensureInitialized(scope)
      console.log('[SQLite Mobile] Native database and tables initialized.')
    } catch (error) {
      console.error('[SQLite Mobile] Database initialization failed:', error)
      throw error
    }
  },

  async createTables(): Promise<void> {
    await createTablesForScope(currentScope())
  },

  async runMigrations(): Promise<void> {
    await runMigrationsForScope(currentScope())
  },

  // Sync Metadata Key-Value helpers
  async getMetadata(key: string): Promise<string | null> {
    const rows = await selectScoped<SyncMetadataRow>(
      'SELECT value FROM sync_metadata WHERE key = $1',
      [key],
    )
    return rows.length > 0 ? rows[0].value : null
  },

  async setMetadata(key: string, value: string): Promise<void> {
    await setMetadataForScope(currentScope(), key, value)
  },

  // Knowledge Blocks
  async getBlocks(subject?: string, subjectId?: string): Promise<KnowledgeBlock[]> {
    const queryParts = ['SELECT * FROM knowledge_blocks WHERE is_deleted = 0']
    const params: unknown[] = []
    if (subjectId) {
      queryParts.push('AND subject_id = $1')
      params.push(subjectId)
    } else if (subject) {
      queryParts.push('AND subject = $1')
      params.push(subject)
    }
    queryParts.push('ORDER BY time DESC')
    const records = await selectScoped<KnowledgeBlockRow>(queryParts.join(' '), params)
    return records.map((row) => ({
      id: row.id,
      subject: row.subject || '',
      title: row.title || '',
      preview: row.preview || '',
      time: row.time || '',
      source: row.source || '',
      color: row.color || '',
      sync_status: toBlockSyncStatus(row.sync_status),
      sync_version: row.sync_version || 0,
      is_deleted: row.is_deleted === 1,
      subjectId: row.subject_id || undefined,
      sourceFileId: row.source_file_id || undefined,
      tags: parseJsonSafely<string[]>(row.tags) ?? [],
      mastery: row.mastery || 0,
      reviewAt: row.review_at || undefined,
      relatedBlockIds: parseJsonSafely<string[]>(row.related_block_ids) ?? [],
    }))
  },

  async saveBlock(block: KnowledgeBlock, syncStatus = 'synced', syncVersion = 0): Promise<void> {
    await saveBlockForScope(currentScope(), block, syncStatus, syncVersion)
  },

  async deleteBlock(id: string): Promise<void> {
    const scope = currentScope()
    const record = await selectForScope<{ sync_status: string | null }>(
      scope,
      'SELECT sync_status FROM knowledge_blocks WHERE id = $1',
      [id],
    )
    if (record[0]?.sync_status === 'pending_create') {
      await executeForScope(scope, 'DELETE FROM knowledge_blocks WHERE id = $1', [id])
      return
    }
    await executeForScope(
      scope,
      'UPDATE knowledge_blocks SET is_deleted = 1, sync_status = $1 WHERE id = $2',
      ['pending_delete', id],
    )
  },

  async hardDeleteBlock(id: string): Promise<void> {
    await hardDeleteBlockForScope(currentScope(), id)
  },

  async getUnsyncedBlocks(): Promise<KnowledgeBlockRow[]> {
    return selectScoped<KnowledgeBlockRow>('SELECT * FROM knowledge_blocks WHERE sync_status != $1', ['synced'])
  },

  async markBlockSynced(id: string): Promise<void> {
    await executeScoped('UPDATE knowledge_blocks SET sync_status = $1 WHERE id = $2', ['synced', id])
  },

  async mergeBlocksFromServer(serverBlocks: KnowledgeBlock[]): Promise<void> {
    await this.batchMergeBlocks(serverBlocks.map((item) => ({ ...item })))
  },

  async batchMergeBlocks(serverBlocks: Array<Record<string, unknown>>): Promise<void> {
    const scope = currentScope()
    for (const block of serverBlocks) {
      const id = typeof block.id === 'string' ? block.id : ''
      if (!id) continue
      const local = await selectForScope<SyncStatusVersionRow>(
        scope,
        'SELECT sync_status, sync_version FROM knowledge_blocks WHERE id = $1',
        [id],
      )
      if (block.isDeleted || block.is_deleted) {
        if (local.length > 0 && !shouldSkipServerMerge(local, block)) {
          await hardDeleteBlockForScope(scope, id)
        }
        continue
      }
      if (shouldSkipServerMerge(local, block)) continue

      const version = Number(block.syncVersion ?? block.sync_version ?? 0)
      const tags = block.tags
        ? (typeof block.tags === 'string' ? (parseJsonSafely<string[]>(block.tags) ?? []) : (block.tags as string[]))
        : []
      const relatedBlockIds = block.relatedBlockIds
        ? (typeof block.relatedBlockIds === 'string'
          ? (parseJsonSafely<string[]>(block.relatedBlockIds) ?? [])
          : (block.relatedBlockIds as string[]))
        : []
      const mappedBlock: KnowledgeBlock = {
        id,
        subject: String(block.subject || ''),
        title: String(block.title || ''),
        preview: String(block.preview || ''),
        time: String(block.time || ''),
        source: String(block.source || ''),
        color: String(block.color || ''),
        sync_version: version,
        is_deleted: false,
        subjectId: (block.subjectId || block.subject_id || undefined) as string | undefined,
        sourceFileId: (block.sourceFileId || block.source_file_id || undefined) as string | undefined,
        tags,
        mastery: Number(block.mastery || 0),
        reviewAt: (block.reviewAt || block.review_at || undefined) as string | undefined,
        relatedBlockIds,
      }
      await saveBlockForScope(scope, mappedBlock, 'synced', version)
    }
  },

  // Task Blocks
  async getTasks(): Promise<Task[]> {
    const records = await selectScoped<TaskBlockRow>(
      'SELECT * FROM task_blocks WHERE is_deleted = 0 ORDER BY position ASC',
    )
    return records.map((row) => {
      const scheduledAt = row.scheduled_at || undefined
      return {
        id: row.id,
        name: row.name != null ? String(row.name) : '',
        subject: row.subject != null ? String(row.subject) : '',
        desc: row.desc != null ? String(row.desc) : '',
        duration: safeFiniteInt(row.duration, 0),
        status: toTaskStatus(row.status),
        scheduledAt,
        dueAt: row.due_at || undefined,
        startTime: scheduledAt ? formatLocalTimeHHmm(scheduledAt) : (row.startTime || row.starttime || undefined),
        sync_status: toTaskSyncStatus(row.sync_status),
        sync_version: row.sync_version || 0,
        is_deleted: row.is_deleted === 1,
        position: normalizeTaskPosition(row.position),
        subjectId: row.subject_id || undefined,
      }
    })
  },

  async saveTask(task: Task, syncStatus = 'synced', syncVersion = 0): Promise<void> {
    await saveTaskForScope(currentScope(), task, syncStatus, syncVersion)
  },

  async deleteTask(id: string): Promise<void> {
    const scope = currentScope()
    const record = await selectForScope<{ sync_status: string | null }>(
      scope,
      'SELECT sync_status FROM task_blocks WHERE id = $1',
      [id],
    )
    if (record[0]?.sync_status === 'pending_create') {
      await executeForScope(scope, 'DELETE FROM task_blocks WHERE id = $1', [id])
      return
    }
    await executeForScope(
      scope,
      'UPDATE task_blocks SET is_deleted = 1, sync_status = $1 WHERE id = $2',
      ['pending_delete', id],
    )
  },

  async hardDeleteTask(id: string): Promise<void> {
    await hardDeleteTaskForScope(currentScope(), id)
  },

  async getUnsyncedTasks(): Promise<TaskBlockRow[]> {
    return selectScoped<TaskBlockRow>('SELECT * FROM task_blocks WHERE sync_status != $1', ['synced'])
  },

  async markTaskSynced(id: string): Promise<void> {
    await executeScoped('UPDATE task_blocks SET sync_status = $1 WHERE id = $2', ['synced', id])
  },

  async mergeTasksFromServer(serverTasks: Task[]): Promise<void> {
    await this.batchMergeTasks(serverTasks.map((item) => ({ ...item })))
  },

  async batchMergeTasks(serverTasks: Array<Record<string, unknown>>): Promise<void> {
    const scope = currentScope()
    for (const task of serverTasks) {
      const id = typeof task.id === 'string' ? task.id : ''
      if (!id) continue
      const local = await selectForScope<SyncStatusVersionRow>(
        scope,
        'SELECT sync_status, sync_version FROM task_blocks WHERE id = $1',
        [id],
      )
      if (task.isDeleted || task.is_deleted) {
        if (local.length > 0 && !shouldSkipServerMerge(local, task)) {
          await hardDeleteTaskForScope(scope, id)
        }
        continue
      }
      if (shouldSkipServerMerge(local, task)) continue

      const version = Number(task.syncVersion ?? task.sync_version ?? 0)
      const scheduledAt = typeof task.scheduledAt === 'string' && task.scheduledAt ? task.scheduledAt : undefined
      const mappedTask: Task = {
        id,
        name: String(task.name || ''),
        subject: String(task.subject || ''),
        desc: String(task.desc || ''),
        duration: safeFiniteInt(task.duration, 0),
        status: toTaskStatus(task.status),
        scheduledAt,
        dueAt: typeof task.dueAt === 'string' && task.dueAt ? task.dueAt : undefined,
        startTime: scheduledAt
          ? formatLocalTimeHHmm(scheduledAt)
          : (typeof task.startTime === 'string' && task.startTime ? task.startTime : undefined),
        sync_version: version,
        is_deleted: false,
        position: typeof task.position === 'string' && task.position ? task.position : '0',
        subjectId: (task.subjectId || task.subject_id || undefined) as string | undefined,
      }
      await saveTaskForScope(scope, mappedTask, 'synced', version)
    }
  },

  setInFlightMutationIds(ids: Array<number | string>): void {
    inFlightMutationIds.clear()
    for (const id of ids) {
      if (id != null) inFlightMutationIds.add(String(id))
    }
  },

  async rebasePendingMutations(
    entityType: string,
    entityId: string,
    options: { appliedMutationType: string; serverVersion: number | null; deleted: boolean },
  ): Promise<void> {
    const scope = currentScope()
    const rows = await selectForScope<Pick<LocalMutationRow, 'id' | 'action' | 'payload'>>(
      scope,
      'SELECT id, action, payload FROM local_mutations WHERE entity_type = $1 AND entity_id = $2 AND sync_status = $3 ORDER BY id ASC',
      [entityType, entityId, 'pending'],
    )
    for (const row of rows) {
      if (row.id == null) continue
      const currentAction = String(row.action || '').toLowerCase()
      if (options.deleted) {
        if (currentAction !== 'create') {
          await executeForScope(scope, 'DELETE FROM local_mutations WHERE id = $1', [row.id])
        }
        continue
      }
      const nextAction = currentAction === 'create' ? 'update' : currentAction
      let nextPayloadRaw = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload ?? {})
      if (options.serverVersion !== null) {
        try {
          const parsed = JSON.parse(nextPayloadRaw)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const record = parsed as Record<string, unknown>
            record.version = options.serverVersion
            record.sync_version = options.serverVersion
            nextPayloadRaw = JSON.stringify(record)
          }
        } catch {
          // Keep raw payload when not valid JSON
        }
      }
      await executeForScope(
        scope,
        'UPDATE local_mutations SET action = $1, payload = $2 WHERE id = $3',
        [nextAction, nextPayloadRaw, row.id],
      )
    }
  },

  async addLocalMutation(
    clientId: string,
    entityType: string,
    entityId: string,
    action: string,
    payload: unknown,
  ): Promise<void> {
    const scope = currentScope()
    const normalizedAction = String(action || '').toLowerCase()
    const createdAt = Date.now()
    const existing = await selectForScope<Pick<LocalMutationRow, 'id' | 'action' | 'payload'>>(
      scope,
      'SELECT id, action, payload FROM local_mutations WHERE entity_type = $1 AND entity_id = $2 AND sync_status = $3 ORDER BY id ASC',
      [entityType, entityId, 'pending'],
    )

    const mutableExisting = existing.filter((item) => !inFlightMutationIds.has(String(item.id)))
    const inFlightExisting = existing.filter((item) => inFlightMutationIds.has(String(item.id)))

    if (mutableExisting.length > 0 && normalizedAction !== 'create') {
      const latest = mutableExisting[mutableExisting.length - 1]
      const hasPendingCreate = mutableExisting.some((item) => String(item.action).toLowerCase() === 'create')
      const nextPayload = preserveFromRows(preserveFromRows(payload, mutableExisting), inFlightExisting)
      const nextPayloadStr = JSON.stringify(nextPayload)

      if (hasPendingCreate && normalizedAction === 'delete') {
        for (const row of mutableExisting) {
          if (row.id != null) {
            await executeForScope(scope, 'DELETE FROM local_mutations WHERE id = $1', [row.id])
          }
        }
        if (inFlightExisting.length === 0) return
        await executeForScope(
          scope,
          `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [clientId, entityType, entityId, 'delete', nextPayloadStr, createdAt, 'pending'],
        )
        return
      }

      if (hasPendingCreate || normalizedAction === 'update') {
        const coalescedAction = hasPendingCreate ? 'create' : 'update'
        await executeForScope(
          scope,
          'UPDATE local_mutations SET client_id = $1, action = $2, payload = $3, created_at = $4 WHERE id = $5',
          [clientId, coalescedAction, nextPayloadStr, createdAt, latest.id],
        )
        for (const extra of mutableExisting.slice(0, -1)) {
          if (extra.id != null) {
            await executeForScope(scope, 'DELETE FROM local_mutations WHERE id = $1', [extra.id])
          }
        }
        return
      }

      if (normalizedAction === 'delete') {
        for (const row of mutableExisting) {
          if (row.id != null) {
            await executeForScope(scope, 'DELETE FROM local_mutations WHERE id = $1', [row.id])
          }
        }
        await executeForScope(
          scope,
          `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [clientId, entityType, entityId, 'delete', nextPayloadStr, createdAt, 'pending'],
        )
        return
      }
    }

    if (inFlightExisting.length > 0 && normalizedAction !== 'create') {
      const nextPayloadStr = JSON.stringify(preserveFromRows(payload, inFlightExisting))
      await executeForScope(
        scope,
        `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [clientId, entityType, entityId, normalizedAction, nextPayloadStr, createdAt, 'pending'],
      )
      return
    }

    await executeForScope(
      scope,
      `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clientId, entityType, entityId, normalizedAction, JSON.stringify(payload), createdAt, 'pending'],
    )
  },

  async getUnsyncedMutations(): Promise<LocalMutationRow[]> {
    return selectScoped<LocalMutationRow>(
      'SELECT * FROM local_mutations WHERE sync_status = $1 ORDER BY id ASC',
      ['pending'],
    )
  },

  async markMutationSynced(id: number | string, clientId?: string): Promise<void> {
    const normalizedId = toMutationId(id)
    if (clientId) {
      await executeScoped(
        'DELETE FROM local_mutations WHERE id = $1 AND client_id = $2',
        [normalizedId, clientId],
      )
      return
    }
    await executeScoped('DELETE FROM local_mutations WHERE id = $1', [normalizedId])
  },

  async discardLocalMutations(entityType: string, entityId: string): Promise<void> {
    await executeScoped(
      'DELETE FROM local_mutations WHERE entity_type = $1 AND entity_id = $2',
      [entityType, entityId],
    )
  },

  async applyRemoteMutation(mutation: {
    entityType: string
    entityId: string
    action: string
    payload: unknown
    createdAt?: number
  }): Promise<void> {
    const rawPayload = typeof mutation.payload === 'string'
      ? (parseJsonSafely<Record<string, unknown>>(mutation.payload) ?? {})
      : ((mutation.payload as Record<string, unknown> | null) ?? {})

    if (mutation.entityType === 'block') {
      if (mutation.action === 'create' || mutation.action === 'update') {
        const block = buildSyncedBlockRecord(mutation.entityId, rawPayload, mutation.createdAt || 0)
        await this.saveBlock(block, 'synced', block.sync_version || 0)
      } else if (mutation.action === 'delete') {
        await this.hardDeleteBlock(mutation.entityId)
      }
      return
    }

    if (mutation.entityType === 'task') {
      if (mutation.action === 'create' || mutation.action === 'update') {
        const scheduledAt = typeof rawPayload.scheduledAt === 'string' && rawPayload.scheduledAt
          ? rawPayload.scheduledAt
          : undefined
        const task: Task = {
          id: mutation.entityId,
          name: String(rawPayload.name || ''),
          subject: String(rawPayload.subject || ''),
          desc: String(rawPayload.desc || ''),
          duration: safeFiniteInt(rawPayload.duration, 0),
          status: toTaskStatus(rawPayload.status),
          scheduledAt,
          dueAt: typeof rawPayload.dueAt === 'string' && rawPayload.dueAt ? rawPayload.dueAt : undefined,
          startTime: scheduledAt
            ? formatLocalTimeHHmm(scheduledAt)
            : (typeof rawPayload.startTime === 'string' && rawPayload.startTime ? rawPayload.startTime : undefined),
          sync_status: 'synced',
          position: typeof rawPayload.position === 'string' && rawPayload.position ? rawPayload.position : '0',
          subjectId: (rawPayload.subjectId || rawPayload.subject_id || undefined) as string | undefined,
        }
        await this.saveTask(task, 'synced', Number(rawPayload.sync_version || mutation.createdAt || 0))
      } else if (mutation.action === 'delete') {
        await this.hardDeleteTask(mutation.entityId)
      }
    }
  },

  // Subject CRUD
  async getSubjects(): Promise<SubjectRecord[]> {
    const rows = await selectScoped<{
      id: string
      name: string | null
      description: string | null
      icon: string | null
      sort_key: string | null
      created_at: number | null
      version: number | null
    }>('SELECT id, name, description, icon, sort_key, created_at, version FROM subjects ORDER BY created_at DESC')

    return rows.map((row) => {
      const sortKey = row.sort_key || ''
      return {
        id: row.id,
        name: row.name || '',
        description: row.description || '',
        icon: row.icon || '',
        sort_key: sortKey,
        ...(sortKey ? { sortKey } : {}),
        created_at: safeFiniteInt(row.created_at, 0),
        version: safeFiniteInt(row.version, 0),
      }
    })
  },

  async saveSubject(subject: SubjectInput | Record<string, unknown>): Promise<void> {
    const scope = currentScope()
    const record = asRecord(subject)
    const id = String(record.id || '')
    const name = String(record.name || '')
    const description = String(record.description || '')
    const icon = String(record.icon || '')
    const version = Number(record.version || 0)
    const existing = await selectForScope<{ id: string; sort_key: string | null }>(
      scope,
      'SELECT id, sort_key FROM subjects WHERE id = $1',
      [id],
    )
    const existingSortKey = typeof existing[0]?.sort_key === 'string' ? existing[0].sort_key : ''
    const rawSortKey = record.sortKey ?? record.sort_key
    const sortKeyVal = typeof rawSortKey === 'string' ? rawSortKey : existingSortKey

    if (existing.length > 0) {
      await executeForScope(
        scope,
        `UPDATE subjects SET
           name = $1,
           description = $2,
           icon = $3,
           sort_key = $4,
           version = $5
         WHERE id = $6`,
        [name, description, icon, sortKeyVal, version, id],
      )
      return
    }

    await executeForScope(
      scope,
      `INSERT INTO subjects (id, name, description, icon, sort_key, created_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, description, icon, sortKeyVal, safeFiniteInt(record.created_at, Date.now()), version],
    )
  },

  async deleteSubject(id: string): Promise<void> {
    const scope = currentScope()
    const activeScope = safeCurrentScope()
    const subjectSources = await selectForScope<SourceFileIdPayloadRow>(
      scope,
      'SELECT id, payload_json FROM source_files WHERE subject_id = $1',
      [id],
    )
    for (const row of subjectSources) {
      if (row.id) {
        await executeForScope(
          scope,
          'DELETE FROM ai_overview_cache WHERE scope_type = $1 AND scope_id = $2',
          ['FILE', String(row.id)],
        )
      }
      const parsed = parseJsonSafely<SourceView>(row.payload_json)
      if (activeScope && parsed?.assetId) {
        void deleteCachedDocument(activeScope, parsed.assetId)
      }
    }
    await executeForScope(scope, 'DELETE FROM source_files WHERE subject_id = $1', [id])
    await executeForScope(scope, 'DELETE FROM ai_overview_cache WHERE subject_id = $1', [id])
    await executeForScope(scope, 'DELETE FROM review_states_cache WHERE subject_id = $1', [id])
    await executeForScope(scope, 'DELETE FROM subject_stats_cache WHERE subject_id = $1', [id])
    await executeForScope(scope, 'DELETE FROM sync_metadata WHERE key = $1', [reviewStatesLoadedMetaKey(id)])
    await executeForScope(scope, 'UPDATE knowledge_blocks SET subject_id = NULL WHERE subject_id = $1', [id])
    await executeForScope(scope, 'UPDATE task_blocks SET subject_id = NULL WHERE subject_id = $1', [id])
    await executeForScope(scope, 'DELETE FROM subjects WHERE id = $1', [id])
  },

  // Source Files CRUD & SourceView Projection
  async getSourceFiles(subjectId: string): Promise<SourceFileRecord[]> {
    const rows = await selectScoped<{
      id: string
      subject_id: string | null
      name: string | null
      file_path: string | null
      file_type: string | null
      file_size: number | null
      catalog_json: string | null
      block_count: number | null
      created_at: number | null
      version: number | null
      payload_json: string | null
    }>('SELECT * FROM source_files WHERE subject_id = $1 ORDER BY created_at DESC', [subjectId])

    return rows.map((row) => ({
      id: row.id,
      subject_id: row.subject_id || '',
      name: row.name || '',
      file_path: row.file_path || '',
      file_type: row.file_type || '',
      file_size: safeFiniteInt(row.file_size, 0),
      catalog_json: row.catalog_json || '',
      block_count: safeFiniteInt(row.block_count, 0),
      created_at: safeFiniteInt(row.created_at, 0),
      version: safeFiniteInt(row.version, 0),
      payload_json: row.payload_json || '',
    }))
  },

  async saveSourceFile(file: SourceFileInput | Record<string, unknown>): Promise<void> {
    await saveSourceFileForScope(currentScope(), file)
  },

  async deleteSourceFile(id: string): Promise<void> {
    const scope = currentScope()
    const activeScope = safeCurrentScope()
    const rows = await selectForScope<PayloadJsonRow>(
      scope,
      'SELECT payload_json FROM source_files WHERE id = $1',
      [id],
    )
    const parsed = rows.length > 0 ? parseJsonSafely<SourceView>(rows[0]?.payload_json) : null
    await executeForScope(
      scope,
      'DELETE FROM ai_overview_cache WHERE scope_type = $1 AND scope_id = $2',
      ['FILE', id],
    )
    await executeForScope(scope, 'DELETE FROM source_files WHERE id = $1', [id])
    if (activeScope && parsed?.assetId) {
      void deleteCachedDocument(activeScope, parsed.assetId)
    }
  },

  async upsertSourceView(subjectId: string, item: SourceView): Promise<void> {
    if (!subjectId || !item.id || item.deletedAt) return
    await serializeCacheWrite(`source_files:${subjectId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      const createdAtMs = item.createdAt ? Date.parse(item.createdAt) : NaN
      await saveSourceFileForScope(scope, {
        id: item.id,
        subject_id: item.subjectId || subjectId,
        name: item.title || '未命名资料',
        file_path: item.originUrl || item.assetId || '',
        file_type: item.type || 'FILE',
        file_size: item.assetSizeBytes ?? 0,
        created_at: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
        version: item.version ?? 0,
        payload_json: JSON.stringify(item),
      })
    })
  },

  async getSourceViews(subjectId: string): Promise<SourceView[]> {
    if (!subjectId) return []
    const rows = await selectScoped<{
      id: string
      subject_id: string | null
      name: string | null
      file_type: string | null
      file_size: number | null
      created_at: number | null
      version: number | null
      payload_json: string | null
    }>('SELECT * FROM source_files WHERE subject_id = $1 ORDER BY created_at DESC', [subjectId])

    const result: SourceView[] = []
    for (const row of rows) {
      const parsed = parseJsonSafely<SourceView>(row.payload_json)
      if (parsed && parsed.id) {
        if (!parsed.deletedAt) result.push(parsed)
        continue
      }
      if (!row.id) continue
      const rawType = String(row.file_type || '').toUpperCase()
      const sourceType: SourceView['type'] = rawType === 'TEXT' || rawType === 'URL' ? rawType : 'FILE'
      result.push({
        id: String(row.id),
        subjectId: String(row.subject_id || subjectId),
        type: sourceType,
        title: String(row.name || '未命名资料'),
        assetSizeBytes: typeof row.file_size === 'number' && Number.isFinite(row.file_size) ? row.file_size : undefined,
        version: safeFiniteInt(row.version, 0),
        createdAt: typeof row.created_at === 'number' && Number.isFinite(row.created_at)
          ? new Date(row.created_at).toISOString()
          : undefined,
      })
    }
    return result
  },

  async replaceSubjectSources(subjectId: string, items: SourceView[]): Promise<void> {
    if (!subjectId) return
    await serializeCacheWrite(`source_files:${subjectId}`, async (scope) => {
      const activeItems = items.filter((item): item is SourceView & { id: string } => Boolean(item.id && !item.deletedAt))
      const nextIds = new Set(activeItems.map((item) => item.id))
      const existingRows = await selectForScope<SourceFileIdPayloadRow>(
        scope,
        'SELECT id, payload_json FROM source_files WHERE subject_id = $1',
        [subjectId],
      )

      for (const row of existingRows) {
        if (safeCurrentScope() !== scope) return
        const existingId = row.id ? String(row.id) : ''
        if (existingId && !nextIds.has(existingId)) {
          const parsed = parseJsonSafely<SourceView>(row.payload_json)
          await executeForScope(
            scope,
            'DELETE FROM ai_overview_cache WHERE scope_type = $1 AND scope_id = $2',
            ['FILE', existingId],
          )
          await executeForScope(scope, 'DELETE FROM source_files WHERE id = $1', [existingId])
          if (parsed?.assetId) {
            void deleteCachedDocument(scope, parsed.assetId)
          }
        }
      }

      for (const item of activeItems) {
        if (safeCurrentScope() !== scope) return
        const createdAtMs = item.createdAt ? Date.parse(item.createdAt) : NaN
        await saveSourceFileForScope(scope, {
          id: item.id,
          subject_id: item.subjectId || subjectId,
          name: item.title || '未命名资料',
          file_path: item.originUrl || item.assetId || '',
          file_type: item.type || 'FILE',
          file_size: item.assetSizeBytes ?? 0,
          created_at: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
          version: item.version ?? 0,
          payload_json: JSON.stringify(item),
        })
      }
    })
  },

  // Derived AI Overview Cache (subject-v1 & ingestionRevision-scoped files)
  async getSubjectOverviewCache(subjectId: string): Promise<OverviewResultView | null> {
    if (!subjectId) return null
    const rows = await selectScoped<PayloadJsonRow>(
      'SELECT payload_json FROM ai_overview_cache WHERE cache_key = $1',
      [subjectOverviewCacheKey(subjectId)],
    )
    return rows.length > 0 ? parseJsonSafely<OverviewResultView>(rows[0].payload_json) : null
  },

  async saveSubjectOverviewCache(subjectId: string, view: OverviewResultView): Promise<void> {
    if (!subjectId) return
    await serializeCacheWrite(`overview:SUBJECT:${subjectId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      const key = subjectOverviewCacheKey(subjectId)
      const updatedAt = view.updatedAt || new Date().toISOString()
      const payload = JSON.stringify(view)
      await executeForScope(
        scope,
        `INSERT INTO ai_overview_cache (
           cache_key, scope_type, scope_id, subject_id, revision_key, payload_json, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(cache_key) DO UPDATE SET
           scope_type = excluded.scope_type,
           scope_id = excluded.scope_id,
           subject_id = excluded.subject_id,
           revision_key = excluded.revision_key,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [key, 'SUBJECT', subjectId, subjectId, 'subject-v1', payload, updatedAt],
      )
    })
  },

  async deleteSubjectOverviewCache(subjectId: string): Promise<void> {
    if (!subjectId) return
    const key = subjectOverviewCacheKey(subjectId)
    await serializeCacheWrite(`overview:SUBJECT:${subjectId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      await executeForScope(scope, 'DELETE FROM ai_overview_cache WHERE cache_key = $1', [key])
    })
  },

  async getSourceOverviewCache(sourceId: string, ingestionRevision?: string): Promise<OverviewResultView | null> {
    if (!sourceId) return null
    const revision = ingestionRevision?.trim()
    if (revision) {
      const rows = await selectScoped<PayloadJsonRow>(
        'SELECT payload_json FROM ai_overview_cache WHERE cache_key = $1',
        [sourceOverviewCacheKey(sourceId, revision)],
      )
      return rows.length > 0 ? parseJsonSafely<OverviewResultView>(rows[0].payload_json) : null
    }
    const rows = await selectScoped<PayloadJsonRow>(
      'SELECT payload_json FROM ai_overview_cache WHERE scope_type = $1 AND scope_id = $2 ORDER BY updated_at DESC',
      ['FILE', sourceId],
    )
    return rows.length > 0 ? parseJsonSafely<OverviewResultView>(rows[0].payload_json) : null
  },

  async saveSourceOverviewCache(
    sourceId: string,
    subjectId: string,
    ingestionRevision: string | undefined,
    view: OverviewResultView,
  ): Promise<void> {
    if (!sourceId) return
    await serializeCacheWrite(`overview:FILE:${sourceId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      const revisionKey = (ingestionRevision || view.ingestionRevision || 'latest').trim() || 'latest'
      const key = sourceOverviewCacheKey(sourceId, revisionKey)
      const updatedAt = view.updatedAt || new Date().toISOString()
      const payload = JSON.stringify(view)
      await executeForScope(
        scope,
        'DELETE FROM ai_overview_cache WHERE scope_type = $1 AND scope_id = $2 AND revision_key != $3',
        ['FILE', sourceId, revisionKey],
      )
      if (safeCurrentScope() !== scope) return
      await executeForScope(
        scope,
        `INSERT INTO ai_overview_cache (
           cache_key, scope_type, scope_id, subject_id, revision_key, payload_json, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(cache_key) DO UPDATE SET
           scope_type = excluded.scope_type,
           scope_id = excluded.scope_id,
           subject_id = excluded.subject_id,
           revision_key = excluded.revision_key,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [key, 'FILE', sourceId, subjectId, revisionKey, payload, updatedAt],
      )
    })
  },

  async deleteSourceOverviewCache(sourceId: string): Promise<void> {
    if (!sourceId) return
    await serializeCacheWrite(`overview:FILE:${sourceId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      await executeForScope(
        scope,
        'DELETE FROM ai_overview_cache WHERE scope_type = $1 AND scope_id = $2',
        ['FILE', sourceId],
      )
    })
  },

  // Review States Read Projection Cache
  async getReviewStatesBySubject(subjectId: string): Promise<ReviewState[]> {
    if (!subjectId) return []
    const rows = await selectScoped<PayloadJsonRow>(
      'SELECT payload_json FROM review_states_cache WHERE subject_id = $1',
      [subjectId],
    )
    const states: ReviewState[] = []
    for (const row of rows) {
      const parsed = parseJsonSafely<ReviewState>(row.payload_json)
      if (parsed && parsed.knowledgeBlockId) {
        states.push(parsed)
      }
    }
    return states
  },

  async hasLoadedReviewStates(subjectId: string): Promise<boolean> {
    if (!subjectId) return false
    return (await this.getMetadata(reviewStatesLoadedMetaKey(subjectId))) === '1'
  },

  async replaceSubjectReviewStates(subjectId: string, states: ReviewState[]): Promise<void> {
    if (!subjectId) return
    await serializeCacheWrite(`review_states:${subjectId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      await executeForScope(scope, 'DELETE FROM review_states_cache WHERE subject_id = $1', [subjectId])
      const now = new Date().toISOString()
      for (const state of states) {
        if (safeCurrentScope() !== scope) return
        if (!state.knowledgeBlockId) continue
        await executeForScope(
          scope,
          `INSERT INTO review_states_cache (knowledge_block_id, subject_id, payload_json, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(knowledge_block_id) DO UPDATE SET
             subject_id = excluded.subject_id,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
          [state.knowledgeBlockId, subjectId, JSON.stringify(state), state.updatedAt || now],
        )
      }
      if (safeCurrentScope() !== scope) return
      await setMetadataForScope(scope, reviewStatesLoadedMetaKey(subjectId), '1')
    })
  },

  async upsertReviewState(subjectId: string, state: ReviewState): Promise<void> {
    if (!subjectId || !state.knowledgeBlockId) return
    await serializeCacheWrite(`review_states:${subjectId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      await executeForScope(
        scope,
        `INSERT INTO review_states_cache (knowledge_block_id, subject_id, payload_json, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(knowledge_block_id) DO UPDATE SET
           subject_id = excluded.subject_id,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [
          state.knowledgeBlockId,
          subjectId,
          JSON.stringify(state),
          state.updatedAt || new Date().toISOString(),
        ],
      )
    })
  },

  // Subject Stats Snapshot Cache
  async getSubjectStatsCache(subjectId: string, days: 7 | 30, timeZone: string): Promise<SubjectStats | null> {
    if (!subjectId || !timeZone) return null
    const rows = await selectScoped<PayloadJsonRow>(
      'SELECT payload_json FROM subject_stats_cache WHERE cache_key = $1',
      [subjectStatsCacheKey(subjectId, days, timeZone)],
    )
    if (rows.length === 0) return null
    const parsed = parseJsonSafely<SubjectStats>(rows[0].payload_json)
    return parsed && (!parsed.subjectId || parsed.subjectId === subjectId) ? parsed : null
  },

  async saveSubjectStatsCache(
    subjectId: string,
    days: 7 | 30,
    timeZone: string,
    stats: SubjectStats,
  ): Promise<void> {
    if (!subjectId || !timeZone) return
    await serializeCacheWrite(`stats:${subjectId}`, async (scope) => {
      if (safeCurrentScope() !== scope) return
      const key = subjectStatsCacheKey(subjectId, days, timeZone)
      const payload = JSON.stringify(stats)
      const updatedAt = stats.generatedAt || new Date().toISOString()
      await executeForScope(
        scope,
        `INSERT INTO subject_stats_cache (cache_key, subject_id, days, time_zone, payload_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(cache_key) DO UPDATE SET
           subject_id = excluded.subject_id,
           days = excluded.days,
           time_zone = excluded.time_zone,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [key, subjectId, days, timeZone, payload, updatedAt],
      )
    })
  },

  async closeScope(scope: string): Promise<void> {
    if (!scope) return
    const inFlightInit = initializingScopes.get(scope)
    if (inFlightInit) {
      await inFlightInit.catch(() => undefined)
    }

    await enqueueScopeOp(scope, async () => {
      const db = openDatabases.get(scope)
      if (!db) return
      try {
        await db.close(databasePathForScope(scope))
      } catch {
        // Ignore database close errors on idle scope teardown
      } finally {
        openDatabases.delete(scope)
        initializedScopes.delete(scope)
      }
    })
  },

  async closeInactiveScopes(activeScope = currentScope()): Promise<void> {
    const candidates = Array.from(new Set([...openDatabases.keys(), ...initializedScopes]))
      .filter((scope) => scope !== activeScope)
    await Promise.all(candidates.map((scope) => this.closeScope(scope)))
  },

  async clearScopeStorage(scope: string): Promise<void> {
    if (!scope) return
    initializedScopes.delete(scope)
    for (const key of FOCUS_STORAGE_KEYS) {
      try {
        removeStorageItem(`auralis:local:${scope}:${key}`)
      } catch {
        // Ignore storage removal errors
      }
    }

    const inFlightInit = initializingScopes.get(scope)
    if (inFlightInit) {
      await inFlightInit.catch(() => undefined)
    }

    await enqueueScopeOp(scope, async () => {
      const path = databasePathForScope(scope)
      try {
        const db = openDatabases.get(scope) ?? await Database.load(path)
        for (const table of SCOPE_TABLES) {
          await db.execute(`DROP TABLE IF EXISTS ${table}`)
        }
        await db.close(path)
      } catch {
        // Ignore database teardown errors during scope reset
      } finally {
        openDatabases.delete(scope)
        initializedScopes.delete(scope)
      }
    })
  },
}
