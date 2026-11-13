import type { LocalEntity, LocalMutation, LocalMutationStatus, LocalSyncStatus } from '@/types/api'
import { DOCUMENT_JOB_PHASES, type DocumentJobPhase, type DocumentProcessingJob, type OcrCheckpointDiagnostic } from '@/types/documentProcessing'
import type { DocumentCacheReceipt, LocalCacheReceipt } from '@/api/tauri'
import { DOCUMENT_PAYLOAD_FORMAT, isDocumentCacheReceiptV1, isLocalCacheReceiptV1, MAX_PACKAGE_METADATA_CHARS } from '@/api/tauri'
import {
  LOCAL_ASSET_STATES,
  LOCAL_ASSET_SYNC_PHASES,
  LOCAL_SOURCE_DRAFT_STATES,
  type LocalAssetFile,
  type LocalAssetState,
  type LocalAssetSyncJob,
  type LocalAssetSyncPhase,
  type LocalSourceDraft,
  type LocalSourceDraftState,
} from '@/types/localAsset'
import {
  LOCAL_PARSED_DOCUMENT_PHASES,
  type LocalParsedDocumentPhase,
  type LocalParsedDocumentRecord,
} from '@/types/localParsedDocument'

export const LOCAL_SCHEMA_VERSION = 14

export interface LocalSqlDatabase {
  execute(sql: string, bindValues?: unknown[]): Promise<unknown>
  select<T>(sql: string, bindValues?: unknown[]): Promise<T[]>
  transaction?<T>(operation: (transaction: LocalSqlDatabase) => Promise<T>): Promise<T>
}

export interface LocalResourceRow {
  user_id: string
  resource_type: string
  resource_id: string
  version: number
  deleted_at: string | null
  sync_status: LocalSyncStatus
  payload: string
}

export interface LocalMutationRow {
  client_mutation_id: string
  user_id: string
  resource_type: string
  resource_id: string
  mutation_type: LocalMutation['mutationType']
  base_version: number
  payload: string
  status: LocalMutationStatus
  created_at: string
  error: string | null
  in_flight_at?: string | null
  remote_payload?: string | null
  remote_version?: number | null
}

export interface DocumentProcessingJobRow {
  job_id: string
  user_id: string
  device_id: string
  source_id: string
  ingestion_revision: string
  phase: DocumentJobPhase
  attempt: number
  checkpoint_page: number
  checkpoint_ordinal: number
  checkpoint_json: string | null
  payload_cache_id: string | null
  payload_receipt_json: string | null
  error_code: string | null
  error_detail: string | null
  created_at: string
  updated_at: string
}

export interface LocalAssetFileRow {
  user_id: string
  device_id: string
  local_asset_id: string
  server_asset_id: string | null
  relative_path: string
  original_name: string
  mime_type: string
  size_bytes: number
  sha256: string
  state: LocalAssetState
  created_at: string
  verified_at: string
  last_accessed_at: string
  deleted_at: string | null
}

export interface LocalAssetSyncJobRow {
  job_id: string
  user_id: string
  device_id: string
  local_asset_id: string
  phase: LocalAssetSyncPhase
  attempt: number
  next_retry_at: string | null
  server_asset_id: string | null
  safe_error_code: string | null
  safe_error_detail: string | null
  created_at: string
  updated_at: string
}

export interface LocalSourceDraftRow {
  user_id: string
  device_id: string
  local_source_id: string
  server_source_id: string | null
  local_asset_id: string
  subject_id: string
  title: string
  local_content_revision: string
  server_ingestion_revision: string | null
  state: LocalSourceDraftState
  created_at: string
  updated_at: string
}

export interface LocalParsedDocumentRow {
  user_id: string
  device_id: string
  local_source_id: string
  local_content_revision: string
  local_asset_id: string
  source_asset_sha256: string
  parser_id: string
  parser_version: string
  normalization_version: string
  ocr_model_version: string | null
  local_cache_id: string | null
  local_receipt_json: string | null
  phase: LocalParsedDocumentPhase
  server_source_id: string | null
  server_ingestion_revision: string | null
  server_cache_id: string | null
  server_receipt_json: string | null
  safe_error_code: string | null
  safe_error_detail: string | null
  attempt: number
  checkpoint_page: number
  checkpoint_ordinal: number
  checkpoint_json: string | null
  created_at: string
  updated_at: string
}

export interface LocalReviewRecordRow {
  user_id: string
  device_id: string
  knowledge_block_id: string
  subject_id: string
  local_revision: number
  server_knowledge_block_version: number
  content_hash: string
  state_json: string
  history_json: string | null
  is_presence_marker: number
  updated_at: string
}

export interface LocalReviewIntentRow {
  client_command_id: string
  user_id: string
  device_id: string
  knowledge_block_id: string
  action: string
  occurred_at: string
  payload_json: string
  status: string
  created_at: string
  prepared: number
  preparation_json: string
}

/**
 * These statements are deliberately resource-generic. The repository keeps
 * DTO shape in JSON while enforcing the fields needed for isolation and sync
 * conflict handling in SQLite columns.
 */
export const VERSIONED_LOCAL_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS local_schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_metadata (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    cursor TEXT,
    reset_required INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT ${LOCAL_SCHEMA_VERSION},
    PRIMARY KEY (user_id, device_id)
  )`,
  `CREATE TABLE IF NOT EXISTS local_resource_records (
    user_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    payload TEXT NOT NULL,
    PRIMARY KEY (user_id, resource_type, resource_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_resource_records_user_type
    ON local_resource_records (user_id, resource_type, deleted_at)`,
  `CREATE TABLE IF NOT EXISTS local_mutations (
    client_mutation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    mutation_type TEXT NOT NULL,
    base_version INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    error TEXT,
    in_flight_at TEXT,
    remote_payload TEXT,
    remote_version INTEGER,
    PRIMARY KEY (user_id, client_mutation_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_mutations_user_status
    ON local_mutations (user_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS document_processing_jobs (
    job_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    ingestion_revision TEXT NOT NULL CHECK (length(trim(ingestion_revision)) > 0),
    phase TEXT NOT NULL CHECK (phase IN (${DOCUMENT_JOB_PHASES.map((phase) => `'${phase}'`).join(', ')})),
    attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    checkpoint_page INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_page >= 0),
    checkpoint_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_ordinal >= 0),
    checkpoint_json TEXT,
    payload_cache_id TEXT,
    payload_receipt_json TEXT,
    error_code TEXT,
    error_detail TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, device_id, source_id, ingestion_revision)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_document_jobs_user_device_phase
    ON document_processing_jobs (user_id, device_id, phase, updated_at)`,
  `CREATE TABLE IF NOT EXISTS ai_overview_cache (
    user_id TEXT NOT NULL, device_id TEXT NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('FILE', 'SUBJECT')),
    scope_id TEXT NOT NULL, revision_key TEXT NOT NULL CHECK (length(trim(revision_key)) > 0),
    schema_version INTEGER NOT NULL DEFAULT 2 CHECK (schema_version IN (1, 2)), title TEXT NOT NULL,
    outline_json TEXT, summary_json TEXT,
    outline_markdown TEXT, summary_markdown TEXT, outline_generated_at TEXT, summary_generated_at TEXT,
    outline_identity_json TEXT, outline_identity_input_json TEXT,
    outline_provenance_json TEXT, outline_provenance_input_json TEXT,
    identity_ready INTEGER NOT NULL DEFAULT 0 CHECK (identity_ready IN (0, 1)),
    input_fingerprint TEXT, status TEXT NOT NULL CHECK (status IN ('READY', 'FAILED')),
    error_code TEXT, error_detail TEXT, updated_at TEXT NOT NULL,
    CHECK ((scope_type = 'SUBJECT' AND revision_key = 'subject-v1') OR (scope_type = 'FILE' AND revision_key <> 'subject-v1')),
    PRIMARY KEY (user_id, device_id, scope_type, scope_id, revision_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_overview_cache_scope
    ON ai_overview_cache (user_id, device_id, scope_type, scope_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS pomodoro_timer_state (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, device_id)
  )`,
  `CREATE TABLE IF NOT EXISTS pomodoro_focus_sessions (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    client_session_id TEXT NOT NULL,
    task_id TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced')),
    created_at TEXT NOT NULL,
    synced_at TEXT,
    PRIMARY KEY (user_id, device_id, client_session_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pomodoro_focus_sessions_pending
    ON pomodoro_focus_sessions (user_id, device_id, sync_status, created_at, client_session_id)`,
  `CREATE TABLE IF NOT EXISTS overview_sync_states (
    user_id TEXT NOT NULL, device_id TEXT NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('FILE', 'SUBJECT')),
    scope_id TEXT NOT NULL, revision_key TEXT NOT NULL,
    state_json TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, device_id, scope_type, scope_id, revision_key)
  )`,
  `CREATE TABLE IF NOT EXISTS overview_sync_outbox (
    user_id TEXT NOT NULL, device_id TEXT NOT NULL,
    client_write_id TEXT NOT NULL, scope_type TEXT NOT NULL CHECK (scope_type IN ('FILE', 'SUBJECT')),
    scope_id TEXT NOT NULL, revision_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('PREPARED', 'PENDING', 'INFLIGHT', 'CONFLICT', 'ERROR', 'STALE')),
    intent_json TEXT NOT NULL, request_json TEXT,
    error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, device_id, client_write_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_overview_sync_outbox_scope
    ON overview_sync_outbox (user_id, device_id, state, scope_type, scope_id, created_at, client_write_id)`,
  `CREATE TABLE IF NOT EXISTS local_review_records (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    knowledge_block_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    local_revision INTEGER NOT NULL DEFAULT 0,
    server_knowledge_block_version INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL,
    state_json TEXT NOT NULL,
    history_json TEXT,
    is_presence_marker INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, device_id, knowledge_block_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_review_records_subject
    ON local_review_records (user_id, device_id, subject_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS local_review_intents (
    client_command_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    knowledge_block_id TEXT NOT NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    prepared INTEGER NOT NULL DEFAULT 1 CHECK (prepared IN (0, 1)),
    preparation_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (user_id, device_id, client_command_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_review_intents_kb
    ON local_review_intents (user_id, device_id, knowledge_block_id, created_at, status)`,
  `CREATE TABLE IF NOT EXISTS local_asset_files (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    local_asset_id TEXT NOT NULL,
    server_asset_id TEXT,
    relative_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    state TEXT NOT NULL CHECK (state IN (${LOCAL_ASSET_STATES.map((s) => `'${s}'`).join(', ')})),
    created_at TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (user_id, device_id, local_asset_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_local_asset_files_server_asset
    ON local_asset_files (user_id, device_id, server_asset_id)
    WHERE server_asset_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_local_asset_files_user_device_state
    ON local_asset_files (user_id, device_id, state, last_accessed_at)`,
  `CREATE TABLE IF NOT EXISTS local_asset_sync_jobs (
    job_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    local_asset_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN (${LOCAL_ASSET_SYNC_PHASES.map((p) => `'${p}'`).join(', ')})),
    attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    next_retry_at TEXT,
    server_asset_id TEXT,
    safe_error_code TEXT,
    safe_error_detail TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_local_asset_sync_jobs_active
    ON local_asset_sync_jobs (user_id, device_id, local_asset_id)
    WHERE phase <> 'SYNCED'`,
  `CREATE INDEX IF NOT EXISTS idx_local_asset_sync_jobs_claim
    ON local_asset_sync_jobs (user_id, device_id, phase, next_retry_at, created_at)`,
  `CREATE TABLE IF NOT EXISTS local_source_drafts (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    local_source_id TEXT NOT NULL,
    server_source_id TEXT,
    local_asset_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    local_content_revision TEXT NOT NULL,
    server_ingestion_revision TEXT,
    state TEXT NOT NULL CHECK (state IN (${LOCAL_SOURCE_DRAFT_STATES.map((s) => `'${s}'`).join(', ')})),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, device_id, local_source_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_source_drafts_asset
    ON local_source_drafts (user_id, device_id, local_asset_id)`,
  `CREATE TABLE IF NOT EXISTS legacy_unassigned_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_id TEXT,
    payload TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    UNIQUE (source_table, source_id)
  )`,
  `CREATE TABLE IF NOT EXISTS local_parsed_documents (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    local_source_id TEXT NOT NULL CHECK (length(trim(local_source_id)) > 0),
    local_content_revision TEXT NOT NULL CHECK (length(trim(local_content_revision)) > 0),
    local_asset_id TEXT NOT NULL CHECK (length(trim(local_asset_id)) > 0),
    source_asset_sha256 TEXT NOT NULL CHECK (length(source_asset_sha256) = 64 AND source_asset_sha256 NOT GLOB '*[^a-f0-9]*'),
    parser_id TEXT NOT NULL CHECK (length(trim(parser_id)) > 0),
    parser_version TEXT NOT NULL CHECK (length(trim(parser_version)) > 0),
    normalization_version TEXT NOT NULL CHECK (length(trim(normalization_version)) > 0),
    ocr_model_version TEXT,
    local_cache_id TEXT CHECK (local_cache_id IS NULL OR length(trim(local_cache_id)) > 0),
    local_receipt_json TEXT,
    phase TEXT NOT NULL CHECK (phase IN (${LOCAL_PARSED_DOCUMENT_PHASES.map((p) => `'${p}'`).join(', ')})),
    server_source_id TEXT CHECK (server_source_id IS NULL OR length(trim(server_source_id)) > 0),
    server_ingestion_revision TEXT CHECK (server_ingestion_revision IS NULL OR length(trim(server_ingestion_revision)) > 0),
    server_cache_id TEXT CHECK (server_cache_id IS NULL OR length(trim(server_cache_id)) > 0),
    server_receipt_json TEXT,
    safe_error_code TEXT,
    safe_error_detail TEXT,
    attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    checkpoint_page INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_page >= 0),
    checkpoint_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_ordinal >= 0),
    checkpoint_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, device_id, local_source_id, local_content_revision)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_parsed_docs_scope_phase
    ON local_parsed_documents (user_id, device_id, phase, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_local_parsed_docs_asset
    ON local_parsed_documents (user_id, device_id, local_asset_id)`,
  `CREATE INDEX IF NOT EXISTS idx_local_parsed_docs_server
    ON local_parsed_documents (user_id, device_id, server_source_id, server_ingestion_revision)
    WHERE server_source_id IS NOT NULL AND server_ingestion_revision IS NOT NULL`,
]

type TableInfoRow = Record<string, unknown> & { name?: unknown }

async function tableColumns(db: LocalSqlDatabase, tableName: string): Promise<Set<string>> {
  const rows = await db.select<TableInfoRow>(`PRAGMA table_info(${tableName})`)
  return new Set(rows.map((row) => String(row.name ?? '')))
}

async function tableExists(db: LocalSqlDatabase, tableName: string): Promise<boolean> {
  const rows = await db.select<Record<string, unknown>>(
    'SELECT name FROM sqlite_master WHERE type = $1 AND name = $2',
    ['table', tableName],
  )
  return rows.length > 0
}

async function migrateDocumentJobRevisionColumn(db: LocalSqlDatabase): Promise<void> {
  if (!(await tableExists(db, 'document_processing_jobs'))) return
  const rows = await db.select<TableInfoRow>('PRAGMA table_info(document_processing_jobs)')
  const revision = rows.find((row) => String(row.name ?? '') === 'ingestion_revision')
  if (!revision || String(revision.type ?? '').toUpperCase() === 'TEXT') return
  let legacyTable = 'legacy_document_processing_jobs_v3'
  let suffix = 2
  while (await tableExists(db, legacyTable)) {
    legacyTable = `legacy_document_processing_jobs_v3_${suffix}`
    suffix += 1
  }
  await db.execute(`ALTER TABLE document_processing_jobs RENAME TO ${legacyTable}`)
  await db.execute(VERSIONED_LOCAL_SCHEMA_SQL.find((statement) => statement.includes('CREATE TABLE IF NOT EXISTS document_processing_jobs'))!)
  await db.execute(`
    INSERT OR IGNORE INTO document_processing_jobs
      (job_id, user_id, device_id, source_id, ingestion_revision, phase, attempt,
       checkpoint_page, checkpoint_ordinal, checkpoint_json, payload_cache_id,
       error_code, error_detail, created_at, updated_at)
    SELECT job_id, user_id, device_id, source_id, CAST(ingestion_revision AS TEXT), phase, attempt,
       checkpoint_page, checkpoint_ordinal, checkpoint_json, payload_cache_id,
       error_code, error_detail, created_at, updated_at
    FROM ${legacyTable}`)
}

async function migrateDocumentJobReceiptColumn(db: LocalSqlDatabase): Promise<void> {
  if (!(await tableExists(db, 'document_processing_jobs'))) return
  const columns = await tableColumns(db, 'document_processing_jobs')
  if (!columns.has('payload_receipt_json')) {
    await db.execute('ALTER TABLE document_processing_jobs ADD COLUMN payload_receipt_json TEXT')
  }
}

async function migrateLocalMutationColumns(db: LocalSqlDatabase): Promise<void> {
  if (!(await tableExists(db, 'local_mutations'))) return
  const columns = await tableColumns(db, 'local_mutations')
  if (!columns.has('in_flight_at')) await db.execute('ALTER TABLE local_mutations ADD COLUMN in_flight_at TEXT')
  if (!columns.has('remote_payload')) await db.execute('ALTER TABLE local_mutations ADD COLUMN remote_payload TEXT')
  if (!columns.has('remote_version')) await db.execute('ALTER TABLE local_mutations ADD COLUMN remote_version INTEGER')
}

async function migrateOverviewIdentityColumns(db: LocalSqlDatabase): Promise<void> {
  if (!(await tableExists(db, 'ai_overview_cache'))) return
  const columns = await tableColumns(db, 'ai_overview_cache')
  if (!columns.has('outline_identity_json')) await db.execute('ALTER TABLE ai_overview_cache ADD COLUMN outline_identity_json TEXT')
  if (!columns.has('outline_identity_input_json')) await db.execute('ALTER TABLE ai_overview_cache ADD COLUMN outline_identity_input_json TEXT')
  if (!columns.has('outline_provenance_json')) await db.execute('ALTER TABLE ai_overview_cache ADD COLUMN outline_provenance_json TEXT')
  if (!columns.has('outline_provenance_input_json')) await db.execute('ALTER TABLE ai_overview_cache ADD COLUMN outline_provenance_input_json TEXT')
  if (!columns.has('identity_ready')) await db.execute('ALTER TABLE ai_overview_cache ADD COLUMN identity_ready INTEGER NOT NULL DEFAULT 0')
}

async function migrateOverviewMarkdownColumns(db: LocalSqlDatabase): Promise<void> {
  if (!(await tableExists(db, 'ai_overview_cache'))) return
  const columns = await tableColumns(db, 'ai_overview_cache')
  if (!columns.has('outline_markdown')) await db.execute('ALTER TABLE ai_overview_cache ADD COLUMN outline_markdown TEXT')
  if (!columns.has('summary_markdown')) await db.execute('ALTER TABLE ai_overview_cache ADD COLUMN summary_markdown TEXT')
  const masterRows = await db.select<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_overview_cache'")
  const tableSql = masterRows[0]?.sql || ''
  if (tableSql.includes('schema_version = 1')) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ai_overview_cache_v2 (
      user_id TEXT NOT NULL, device_id TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('FILE', 'SUBJECT')),
      scope_id TEXT NOT NULL, revision_key TEXT NOT NULL CHECK (length(trim(revision_key)) > 0),
      schema_version INTEGER NOT NULL DEFAULT 2 CHECK (schema_version IN (1, 2)), title TEXT NOT NULL,
      outline_json TEXT, summary_json TEXT,
      outline_markdown TEXT, summary_markdown TEXT,
      outline_generated_at TEXT, summary_generated_at TEXT,
      outline_identity_json TEXT, outline_identity_input_json TEXT,
      outline_provenance_json TEXT, outline_provenance_input_json TEXT,
      identity_ready INTEGER NOT NULL DEFAULT 0 CHECK (identity_ready IN (0, 1)),
      input_fingerprint TEXT, status TEXT NOT NULL CHECK (status IN ('READY', 'FAILED')),
      error_code TEXT, error_detail TEXT, updated_at TEXT NOT NULL,
      CHECK ((scope_type = 'SUBJECT' AND revision_key = 'subject-v1') OR (scope_type = 'FILE' AND revision_key <> 'subject-v1')),
      PRIMARY KEY (user_id, device_id, scope_type, scope_id, revision_key)
    )`)
    await db.execute(`INSERT OR IGNORE INTO ai_overview_cache_v2
      (user_id, device_id, scope_type, scope_id, revision_key, schema_version, title,
       outline_json, summary_json, outline_markdown, summary_markdown,
       outline_generated_at, summary_generated_at,
       outline_identity_json, outline_identity_input_json, outline_provenance_json, outline_provenance_input_json,
       identity_ready, input_fingerprint, status, error_code, error_detail, updated_at)
      SELECT user_id, device_id, scope_type, scope_id, revision_key, schema_version, title,
       outline_json, summary_json, outline_markdown, summary_markdown,
       outline_generated_at, summary_generated_at,
       outline_identity_json, outline_identity_input_json, outline_provenance_json, outline_provenance_input_json,
       identity_ready, input_fingerprint, status, error_code, error_detail, updated_at
      FROM ai_overview_cache`)
    await db.execute('DROP TABLE ai_overview_cache')
    await db.execute('ALTER TABLE ai_overview_cache_v2 RENAME TO ai_overview_cache')
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_ai_overview_cache_scope
      ON ai_overview_cache (user_id, device_id, scope_type, scope_id, updated_at)`)
  }
}

async function moveLegacyTable(
  db: LocalSqlDatabase,
  tableName: string,
  legacyTableName: string,
  requiredColumn: string,
): Promise<void> {
  if (!(await tableExists(db, tableName))) return
  const columns = await tableColumns(db, tableName)
  if (columns.has(requiredColumn)) return
  if (await tableExists(db, legacyTableName)) {
    throw new Error(`Cannot migrate ${tableName}: ${legacyTableName} already exists`)
  }
  await db.execute(`ALTER TABLE ${tableName} RENAME TO ${legacyTableName}`)
}

const LEGACY_SQL_RESOURCE_TABLES = [
  'subjects',
  'knowledge_blocks',
  'task_blocks',
  'source_files',
  'chat_sessions',
  'chat_messages',
] as const

async function backupLegacySqlResources(db: LocalSqlDatabase): Promise<void> {
  const capturedAt = new Date().toISOString()
  for (const tableName of LEGACY_SQL_RESOURCE_TABLES) {
    if (!(await tableExists(db, tableName))) continue
    const columns = await tableColumns(db, tableName)
    if (columns.has('user_id')) continue
    const rows = await db.select<Record<string, unknown>>(`SELECT * FROM ${tableName}`)
    for (const row of rows) {
      const sourceId = row.id == null ? null : String(row.id)
      await db.execute(
        `INSERT OR IGNORE INTO legacy_unassigned_records
          (source_table, source_id, payload, captured_at)
         VALUES ($1, $2, $3, $4)`,
        [tableName, sourceId, JSON.stringify(row), capturedAt],
      )
    }
  }
}

/**
 * Creates the current versioned schema and moves the pre-R4 key/value mutation tables out of
 * the way. The old tables are retained under legacy_* names for recoverable
 * compatibility; no business row is deleted by this migration.
 */

const LEGACY_TASK_LOAD_KEYS = ['cognitiveLoad', 'load', 'loadText'] as const

function sanitizeTaskPayload(payload: string | null | undefined): { payload: string | null | undefined, changed: boolean } {
  if (!payload || !LEGACY_TASK_LOAD_KEYS.some(key => payload.includes(key))) {
    return { payload, changed: false }
  }

  try {
    const parsed = JSON.parse(payload)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { payload, changed: false }
    }

    let changed = false
    for (const key of LEGACY_TASK_LOAD_KEYS) {
      if (key in parsed) {
        delete parsed[key]
        changed = true
      }
    }
    return { payload: changed ? JSON.stringify(parsed) : payload, changed }
  } catch {
    return { payload, changed: false }
  }
}

async function sanitizeTaskCognitiveLoad(db: LocalSqlDatabase): Promise<void> {
  if (await tableExists(db, 'local_resource_records')) {
    const records = await db.select<LocalResourceRow>('SELECT * FROM local_resource_records WHERE resource_type = $1', ['TASK']);
    for (const record of records) {
      const sanitized = sanitizeTaskPayload(record.payload)
      if (sanitized.changed) {
        await db.execute(
          'UPDATE local_resource_records SET payload = $1 WHERE user_id = $2 AND resource_type = $3 AND resource_id = $4',
          [sanitized.payload, record.user_id, record.resource_type, record.resource_id]
        )
      }
    }
  }

  if (await tableExists(db, 'local_mutations')) {
    const mutations = await db.select<LocalMutationRow>('SELECT * FROM local_mutations WHERE resource_type = $1', ['TASK']);
    for (const mut of mutations) {
      const payload = sanitizeTaskPayload(mut.payload)
      const remotePayload = sanitizeTaskPayload(mut.remote_payload)
      if (payload.changed || remotePayload.changed) {
        await db.execute(
          'UPDATE local_mutations SET payload = $1, remote_payload = $2 WHERE client_mutation_id = $3',
          [payload.payload, remotePayload.payload ?? null, mut.client_mutation_id]
        )
      }
    }
  }
}

let taskColorInvalidWarningEmitted = false

export type TaskColorPayloadCleanupResult = {
  payload: string | null | undefined
  changed: boolean
  invalid: boolean
}

export function sanitizeTaskColorPayload(payload: string | null | undefined): TaskColorPayloadCleanupResult {
  if (payload == null || payload === '') return { payload, changed: false, invalid: false }
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { payload, changed: false, invalid: true }
    }
    const changed = Object.prototype.hasOwnProperty.call(parsed, 'color')
      || Object.prototype.hasOwnProperty.call(parsed, 'colorOverride')
    if (!changed) return { payload, changed: false, invalid: false }
    delete parsed.color
    delete parsed.colorOverride
    return { payload: JSON.stringify(parsed), changed: true, invalid: false }
  } catch {
    return { payload, changed: false, invalid: true }
  }
}

function warnInvalidTaskColorPayload(): void {
  if (taskColorInvalidWarningEmitted) return
  taskColorInvalidWarningEmitted = true
  console.warn('[SQLite PC] Preserving invalid TASK color payload during migration')
}

async function sanitizeTaskColors(db: LocalSqlDatabase): Promise<void> {
  if (await tableExists(db, 'local_resource_records')) {
    const records = await db.select<LocalResourceRow>(
      "SELECT * FROM local_resource_records WHERE resource_type = 'TASK'",
    )
    for (const record of records) {
      const result = sanitizeTaskColorPayload(record.payload)
      if (result.invalid) warnInvalidTaskColorPayload()
      if (result.changed) {
        await db.execute(
          'UPDATE local_resource_records SET payload = $1 WHERE user_id = $2 AND resource_type = $3 AND resource_id = $4',
          [result.payload, record.user_id, record.resource_type, record.resource_id],
        )
      }
    }
  }

  if (await tableExists(db, 'local_mutations')) {
    const mutations = await db.select<LocalMutationRow>(
      "SELECT * FROM local_mutations WHERE resource_type = 'TASK'",
    )
    for (const mutation of mutations) {
      const payload = sanitizeTaskColorPayload(mutation.payload)
      const remotePayload = sanitizeTaskColorPayload(mutation.remote_payload)
      if (payload.invalid || remotePayload.invalid) warnInvalidTaskColorPayload()
      if (payload.changed || remotePayload.changed) {
        await db.execute(
          'UPDATE local_mutations SET payload = $1, remote_payload = $2 WHERE user_id = $3 AND client_mutation_id = $4',
          [payload.payload, remotePayload.payload ?? null, mutation.user_id, mutation.client_mutation_id],
        )
      }
    }
  }
}

export async function createVersionedLocalSchema(db: LocalSqlDatabase): Promise<void> {
  await moveLegacyTable(db, 'sync_metadata', 'legacy_sync_metadata', 'user_id')
  await moveLegacyTable(db, 'local_mutations', 'legacy_local_mutations', 'client_mutation_id')
  await migrateDocumentJobRevisionColumn(db)
  await migrateDocumentJobReceiptColumn(db)
  for (const statement of VERSIONED_LOCAL_SCHEMA_SQL) {
    await db.execute(statement)
  }
  await migrateLocalMutationColumns(db)
  await migrateOverviewIdentityColumns(db)
  await migrateOverviewMarkdownColumns(db)
  await sanitizeTaskCognitiveLoad(db)
  await sanitizeTaskColors(db)
  await backupLegacySqlResources(db)
  await db.execute(
    `INSERT OR IGNORE INTO local_schema_migrations (version, applied_at) VALUES ($1, $2)`,
    [LOCAL_SCHEMA_VERSION, new Date().toISOString()],
  )
}

function parsePayload<T>(payload: string): T {
  try {
    return JSON.parse(payload) as T
  } catch (error) {
    throw new Error(`Invalid local payload: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Keep legacy receipts readable, but never promote partial metadata to v1. */
export function sanitizeDocumentCacheReceipt(value: unknown): DocumentCacheReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const base: DocumentCacheReceipt = {
    cacheId: typeof candidate.cacheId === 'string' ? candidate.cacheId : '',
    envelopeVersion: 1,
    chunkCount: Number(candidate.chunkCount ?? 0),
    encryptedBytes: Number(candidate.encryptedBytes ?? 0),
    plainTextSha256: typeof candidate.plainTextSha256 === 'string' ? candidate.plainTextSha256 : '',
    payloadSha256: typeof candidate.payloadSha256 === 'string' ? candidate.payloadSha256 : '',
    payloadBytes: Number(candidate.payloadBytes ?? 0),
  }
  const metadata = {
    payloadFormat: candidate.payloadFormat,
    sourceAssetSha256: candidate.sourceAssetSha256,
    parserId: candidate.parserId,
    parserVersion: candidate.parserVersion,
    normalizationVersion: candidate.normalizationVersion,
    ocrModelVersion: candidate.ocrModelVersion,
  }
  const bounded = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= MAX_PACKAGE_METADATA_CHARS
  const validGroup = metadata.payloadFormat === DOCUMENT_PAYLOAD_FORMAT
    && typeof metadata.sourceAssetSha256 === 'string' && /^[a-f0-9]{64}$/i.test(metadata.sourceAssetSha256)
    && bounded(metadata.parserId) && bounded(metadata.parserVersion) && bounded(metadata.normalizationVersion)
    && (metadata.ocrModelVersion === null || bounded(metadata.ocrModelVersion))
  if (!validGroup) return base
  const normalized: DocumentCacheReceipt = {
    ...base,
    payloadFormat: DOCUMENT_PAYLOAD_FORMAT,
    sourceAssetSha256: (metadata.sourceAssetSha256 as string).toLowerCase(),
    parserId: metadata.parserId as string,
    parserVersion: metadata.parserVersion as string,
    normalizationVersion: metadata.normalizationVersion as string,
    ocrModelVersion: metadata.ocrModelVersion as string | null,
  }
  return isDocumentCacheReceiptV1(normalized) ? normalized : base
}

export function sanitizeParsedDocumentServerReceipt(value: unknown): DocumentCacheReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const normalized: DocumentCacheReceipt = {
    cacheId: typeof candidate.cacheId === 'string' ? candidate.cacheId.trim() : '',
    envelopeVersion: 1,
    chunkCount: typeof candidate.chunkCount === 'number' && Number.isInteger(candidate.chunkCount) ? candidate.chunkCount : Number(candidate.chunkCount ?? 0),
    encryptedBytes: typeof candidate.encryptedBytes === 'number' && Number.isInteger(candidate.encryptedBytes) ? candidate.encryptedBytes : Number(candidate.encryptedBytes ?? 0),
    plainTextSha256: typeof candidate.plainTextSha256 === 'string' ? candidate.plainTextSha256.trim().toLowerCase() : '',
    payloadSha256: typeof candidate.payloadSha256 === 'string' ? candidate.payloadSha256.trim().toLowerCase() : '',
    payloadBytes: typeof candidate.payloadBytes === 'number' && Number.isInteger(candidate.payloadBytes) ? candidate.payloadBytes : Number(candidate.payloadBytes ?? 0),
    payloadFormat: typeof candidate.payloadFormat === 'string' ? (candidate.payloadFormat.trim() as 'parsed-document-v1') : DOCUMENT_PAYLOAD_FORMAT,
    sourceAssetSha256: typeof candidate.sourceAssetSha256 === 'string' ? candidate.sourceAssetSha256.trim().toLowerCase() : '',
    parserId: typeof candidate.parserId === 'string' ? candidate.parserId.trim() : '',
    parserVersion: typeof candidate.parserVersion === 'string' ? candidate.parserVersion.trim() : '',
    normalizationVersion: typeof candidate.normalizationVersion === 'string' ? candidate.normalizationVersion.trim() : '',
    ocrModelVersion: candidate.ocrModelVersion === null || candidate.ocrModelVersion === undefined
      ? null
      : (typeof candidate.ocrModelVersion === 'string' && candidate.ocrModelVersion.trim() ? candidate.ocrModelVersion.trim() : null),
  }
  return isDocumentCacheReceiptV1(normalized) ? normalized : null
}

export function sanitizeLocalCacheReceipt(value: unknown): LocalCacheReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const normalized: LocalCacheReceipt = {
    cacheId: typeof candidate.cacheId === 'string' ? candidate.cacheId.trim() : '',
    envelopeVersion: 1,
    chunkCount: typeof candidate.chunkCount === 'number' && Number.isInteger(candidate.chunkCount) ? candidate.chunkCount : Number(candidate.chunkCount ?? 0),
    encryptedBytes: typeof candidate.encryptedBytes === 'number' && Number.isInteger(candidate.encryptedBytes) ? candidate.encryptedBytes : Number(candidate.encryptedBytes ?? 0),
    plainTextSha256: typeof candidate.plainTextSha256 === 'string' ? candidate.plainTextSha256.trim().toLowerCase() : '',
    payloadSha256: typeof candidate.payloadSha256 === 'string' ? candidate.payloadSha256.trim().toLowerCase() : '',
    payloadBytes: typeof candidate.payloadBytes === 'number' && Number.isInteger(candidate.payloadBytes) ? candidate.payloadBytes : Number(candidate.payloadBytes ?? 0),
    localSourceId: typeof candidate.localSourceId === 'string' ? candidate.localSourceId.trim() : '',
    localContentRevision: typeof candidate.localContentRevision === 'string' ? candidate.localContentRevision.trim() : '',
    sourceAssetSha256: typeof candidate.sourceAssetSha256 === 'string' ? candidate.sourceAssetSha256.trim().toLowerCase() : '',
    payloadFormat: typeof candidate.payloadFormat === 'string' ? candidate.payloadFormat.trim() : 'parsed-document-local-v1',
    parserId: typeof candidate.parserId === 'string' ? candidate.parserId.trim() : '',
    parserVersion: typeof candidate.parserVersion === 'string' ? candidate.parserVersion.trim() : '',
    normalizationVersion: typeof candidate.normalizationVersion === 'string' ? candidate.normalizationVersion.trim() : '',
    ocrModelVersion: candidate.ocrModelVersion === null || candidate.ocrModelVersion === undefined
      ? null
      : (typeof candidate.ocrModelVersion === 'string' && candidate.ocrModelVersion.trim() ? candidate.ocrModelVersion.trim() : null),
  }
  return isLocalCacheReceiptV1(normalized) ? normalized : null
}

function sanitizeOcrDiagnostic(value: unknown): OcrCheckpointDiagnostic | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  const integerInRange = (item: unknown, max: number): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= max
  if (!integerInRange(candidate.pageNumber, 1_000_000)
    || !integerInRange(candidate.totalPages, 1_000_000)
    || !integerInRange(candidate.imageBytes, 100_000_000)
    || !['running', 'text', 'empty', 'failed'].includes(String(candidate.outcome))) return undefined
  const diagnostic: OcrCheckpointDiagnostic = {
    pageNumber: candidate.pageNumber,
    totalPages: candidate.totalPages,
    imageBytes: candidate.imageBytes,
    outcome: candidate.outcome as OcrCheckpointDiagnostic['outcome'],
  }
  if (integerInRange(candidate.rawLineCount, 1_000_000)) diagnostic.rawLineCount = candidate.rawLineCount
  if (integerInRange(candidate.normalizedLineCount, 1_000_000)) diagnostic.normalizedLineCount = candidate.normalizedLineCount
  if (integerInRange(candidate.totalMs, 86_400_000)) diagnostic.totalMs = candidate.totalMs
  const hasValidPageCounts = integerInRange(candidate.ocrProcessedPages, 1_000_000)
    && integerInRange(candidate.ocrTextPages, 1_000_000)
    && integerInRange(candidate.ocrEmptyPages, 1_000_000)
    && candidate.ocrProcessedPages === candidate.ocrTextPages + candidate.ocrEmptyPages
  if (hasValidPageCounts) {
    diagnostic.ocrProcessedPages = candidate.ocrProcessedPages as number
    diagnostic.ocrTextPages = candidate.ocrTextPages as number
    diagnostic.ocrEmptyPages = candidate.ocrEmptyPages as number
  }
  if (integerInRange(candidate.totalRawLineCount, 10_000_000)) diagnostic.totalRawLineCount = candidate.totalRawLineCount
  if (integerInRange(candidate.totalNormalizedLineCount, 10_000_000)) diagnostic.totalNormalizedLineCount = candidate.totalNormalizedLineCount
  return diagnostic
}

export function normalizeDocumentJobCheckpoint(value: unknown, fallback: DocumentProcessingJob['checkpoint'] = { pageNumber: 0, blockOrdinal: 0 }): DocumentProcessingJob['checkpoint'] {
  if (!value || typeof value !== 'object') return fallback
  const candidate = value as Record<string, unknown>
  const pageNumber = typeof candidate.pageNumber === 'number' && Number.isInteger(candidate.pageNumber) && candidate.pageNumber >= 0 ? candidate.pageNumber : fallback.pageNumber
  const blockOrdinal = typeof candidate.blockOrdinal === 'number' && Number.isInteger(candidate.blockOrdinal) && candidate.blockOrdinal >= 0 ? candidate.blockOrdinal : fallback.blockOrdinal
  const diagnostic = sanitizeOcrDiagnostic(candidate.diagnostic)
  return {
    pageNumber,
    blockOrdinal,
    ...(typeof candidate.parserState === 'string' ? { parserState: candidate.parserState.slice(0, 200) } : {}),
    ...(diagnostic ? { diagnostic } : {}),
  }
}

export function resourceFromRow<T>(row: LocalResourceRow): LocalEntity<T> {
  return {
    id: row.resource_id,
    resourceType: row.resource_type,
    userId: row.user_id,
    version: Number(row.version ?? 0),
    deletedAt: row.deleted_at ?? null,
    syncStatus: row.sync_status,
    value: parsePayload<T>(row.payload),
  }
}

export function mutationFromRow(row: LocalMutationRow): LocalMutation {
  return {
    clientMutationId: row.client_mutation_id,
    userId: row.user_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    mutationType: row.mutation_type,
    baseVersion: Number(row.base_version ?? 0),
    payload: parsePayload<Record<string, unknown>>(row.payload),
    status: row.status,
    createdAt: row.created_at,
    ...(row.error ? { error: row.error } : {}),
    ...(row.remote_payload ? { remoteValue: parsePayload<unknown>(row.remote_payload) } : {}),
    ...(row.remote_version == null ? {} : { remoteVersion: Number(row.remote_version) }),
  }
}

export function documentProcessingJobFromRow(row: DocumentProcessingJobRow): DocumentProcessingJob {
  let checkpoint: DocumentProcessingJob['checkpoint'] = {
    pageNumber: Number(row.checkpoint_page ?? 0),
    blockOrdinal: Number(row.checkpoint_ordinal ?? 0),
  }
  if (row.checkpoint_json) {
    try {
      const parsed = JSON.parse(row.checkpoint_json) as Partial<DocumentProcessingJob['checkpoint']>
      checkpoint = normalizeDocumentJobCheckpoint(parsed, checkpoint)
    } catch {
      throw new Error('Invalid document job checkpoint')
    }
  }
  return {
    jobId: row.job_id,
    userId: row.user_id,
    serverDeviceId: row.device_id,
    sourceId: row.source_id,
    ingestionRevision: String(row.ingestion_revision),
    phase: row.phase,
    attempt: Number(row.attempt ?? 0),
    checkpoint,
    payloadCacheId: row.payload_cache_id ?? null,
    payloadReceipt: row.payload_receipt_json ? sanitizeDocumentCacheReceipt(parsePayload<unknown>(row.payload_receipt_json)) : null,
    errorCode: row.error_code ?? null,
    errorDetail: row.error_detail ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function localAssetFileFromRow(row: LocalAssetFileRow): LocalAssetFile {
  return {
    userId: row.user_id,
    serverDeviceId: row.device_id,
    localAssetId: row.local_asset_id,
    serverAssetId: row.server_asset_id ?? null,
    relativePath: row.relative_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    state: row.state,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    lastAccessedAt: row.last_accessed_at,
    deletedAt: row.deleted_at ?? null,
  }
}

export function localAssetSyncJobFromRow(row: LocalAssetSyncJobRow): LocalAssetSyncJob {
  return {
    jobId: row.job_id,
    userId: row.user_id,
    serverDeviceId: row.device_id,
    localAssetId: row.local_asset_id,
    phase: row.phase,
    attempt: Number(row.attempt),
    nextRetryAt: row.next_retry_at ?? null,
    serverAssetId: row.server_asset_id ?? null,
    safeErrorCode: row.safe_error_code ?? null,
    safeErrorDetail: row.safe_error_detail ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function localSourceDraftFromRow(row: LocalSourceDraftRow): LocalSourceDraft {
  return {
    userId: row.user_id,
    serverDeviceId: row.device_id,
    localSourceId: row.local_source_id,
    serverSourceId: row.server_source_id ?? null,
    localAssetId: row.local_asset_id,
    subjectId: row.subject_id,
    title: row.title,
    localContentRevision: row.local_content_revision,
    serverIngestionRevision: row.server_ingestion_revision ?? null,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function localParsedDocumentFromRow(row: LocalParsedDocumentRow): LocalParsedDocumentRecord {
  let localReceipt: LocalCacheReceipt | null = null
  if (row.local_receipt_json) {
    try {
      const parsed = JSON.parse(row.local_receipt_json)
      localReceipt = sanitizeLocalCacheReceipt(parsed)
    } catch {
      localReceipt = null
    }
  }

  let serverReceipt: DocumentCacheReceipt | null = null
  if (row.server_receipt_json) {
    try {
      const parsed = JSON.parse(row.server_receipt_json)
      serverReceipt = sanitizeParsedDocumentServerReceipt(parsed)
    } catch {
      serverReceipt = null
    }
  }

  return {
    userId: row.user_id,
    serverDeviceId: row.device_id,
    localSourceId: row.local_source_id,
    localContentRevision: row.local_content_revision,
    localAssetId: row.local_asset_id,
    sourceAssetSha256: row.source_asset_sha256,
    parserId: row.parser_id,
    parserVersion: row.parser_version,
    normalizationVersion: row.normalization_version,
    ocrModelVersion: row.ocr_model_version ?? null,
    localCacheId: row.local_cache_id ?? null,
    localReceipt,
    phase: row.phase,
    serverSourceId: row.server_source_id ?? null,
    serverIngestionRevision: row.server_ingestion_revision ?? null,
    serverCacheId: row.server_cache_id ?? null,
    serverReceipt,
    safeErrorCode: row.safe_error_code ?? null,
    safeErrorDetail: row.safe_error_detail ?? null,
    attempt: Number(row.attempt ?? 0),
    checkpointPage: Number(row.checkpoint_page ?? 0),
    checkpointOrdinal: Number(row.checkpoint_ordinal ?? 0),
    checkpointJson: row.checkpoint_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
