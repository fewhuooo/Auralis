import type { LocalEntity, LocalMutation, LocalMutationStatus, LocalSyncStatus } from '@/types/api'

export const LOCAL_SCHEMA_VERSION = 2

export interface LocalSqlDatabase {
  execute(sql: string, bindValues?: unknown[]): Promise<unknown>
  select<T>(sql: string, bindValues?: unknown[]): Promise<T[]>
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
    PRIMARY KEY (user_id, client_mutation_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_mutations_user_status
    ON local_mutations (user_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS legacy_unassigned_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_id TEXT,
    payload TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    UNIQUE (source_table, source_id)
  )`,
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
 * Creates the v2 schema and moves the pre-R4 key/value mutation tables out of
 * the way. The old tables are retained under legacy_* names for recoverable
 * compatibility; no business row is deleted by this migration.
 */
export async function createVersionedLocalSchema(db: LocalSqlDatabase): Promise<void> {
  await moveLegacyTable(db, 'sync_metadata', 'legacy_sync_metadata', 'user_id')
  await moveLegacyTable(db, 'local_mutations', 'legacy_local_mutations', 'client_mutation_id')
  for (const statement of VERSIONED_LOCAL_SCHEMA_SQL) {
    await db.execute(statement)
  }
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
  }
}
