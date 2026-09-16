import assert from 'node:assert/strict'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createVersionedLocalSchema, LOCAL_SCHEMA_VERSION } = await import('../src/services/localSchema.ts')

class TemporarySqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:')
  }

  async execute(sql, bindValues = []) {
    this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues)
  }

  async select(sql, bindValues = []) {
    return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues)
  }

  close() {
    this.database.close()
  }
}

test('clean database initializes to schema v8 with the three new local asset tables', async () => {
  const sqlite = new TemporarySqlite()
  try {
    assert.equal(LOCAL_SCHEMA_VERSION, 8, 'LOCAL_SCHEMA_VERSION must be 8')
    await createVersionedLocalSchema(sqlite)

    const tableNames = sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    assert.ok(tableNames.includes('local_asset_files'), 'local_asset_files table must exist')
    assert.ok(tableNames.includes('local_asset_sync_jobs'), 'local_asset_sync_jobs table must exist')
    assert.ok(tableNames.includes('local_source_drafts'), 'local_source_drafts table must exist')

    const versions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((r) => r.version)
    assert.deepEqual(versions, [8])
  } finally {
    sqlite.close()
  }
})

test('v7 database upgrades cleanly to v8 while preserving all existing tables and data', async () => {
  const sqlite = new TemporarySqlite()
  try {
    // Setup existing v7 schema
    await sqlite.execute("CREATE TABLE local_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
    await sqlite.execute("INSERT INTO local_schema_migrations (version, applied_at) VALUES (2, '2026-08-20T00:00:00.000Z')")
    await sqlite.execute("INSERT INTO local_schema_migrations (version, applied_at) VALUES (7, '2026-09-10T00:00:00.000Z')")

    // Create existing v7 tables with sample data
    await sqlite.execute(`CREATE TABLE sync_metadata (
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      cursor TEXT,
      reset_required INTEGER NOT NULL DEFAULT 0,
      schema_version INTEGER NOT NULL DEFAULT 7,
      PRIMARY KEY (user_id, device_id)
    )`)
    await sqlite.execute("INSERT INTO sync_metadata (user_id, device_id, cursor, schema_version) VALUES ('user-1', 'device-1', 'cursor-10', 7)")

    await sqlite.execute(`CREATE TABLE local_resource_records (
      user_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      payload TEXT NOT NULL,
      PRIMARY KEY (user_id, resource_type, resource_id)
    )`)
    await sqlite.execute('INSERT INTO local_resource_records (user_id, resource_type, resource_id, payload) VALUES ($1, $2, $3, $4)', ['user-1', 'SOURCE', 'source-1', '{"id":"source-1"}'])

    await sqlite.execute(`CREATE TABLE document_processing_jobs (
      job_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      ingestion_revision TEXT NOT NULL,
      phase TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      checkpoint_page INTEGER NOT NULL DEFAULT 0,
      checkpoint_ordinal INTEGER NOT NULL DEFAULT 0,
      checkpoint_json TEXT,
      payload_cache_id TEXT,
      payload_receipt_json TEXT,
      error_code TEXT,
      error_detail TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, device_id, source_id, ingestion_revision)
    )`)
    await sqlite.execute(`INSERT INTO document_processing_jobs
      (job_id, user_id, device_id, source_id, ingestion_revision, phase, created_at, updated_at)
      VALUES ('job-1', 'user-1', 'device-1', 'source-1', 'rev-1', 'READY', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')`)

    // Upgrade to v8
    await createVersionedLocalSchema(sqlite)

    // Verify v7 data preserved
    const meta = sqlite.database.prepare("SELECT * FROM sync_metadata WHERE user_id = 'user-1'").get()
    assert.ok(meta)
    assert.equal(meta.cursor, 'cursor-10')

    const docJob = sqlite.database.prepare("SELECT * FROM document_processing_jobs WHERE job_id = 'job-1'").get()
    assert.ok(docJob)
    assert.equal(docJob.phase, 'READY')

    // Verify v8 tables created
    const assetFilesTable = sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_asset_files'").get()
    assert.ok(assetFilesTable)

    const versions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((r) => r.version)
    assert.deepEqual(versions, [2, 7, 8])
  } finally {
    sqlite.close()
  }
})

test('schema initialization is repeatable and idempotent', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    // Run second time
    await createVersionedLocalSchema(sqlite)
    // Run third time
    await createVersionedLocalSchema(sqlite)

    const versions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((r) => r.version)
    assert.deepEqual(versions, [8])
  } finally {
    sqlite.close()
  }
})

test('schema enforces owner and device scope and state checks on local_asset_files', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)

    // Insert valid asset file
    await sqlite.execute(`INSERT INTO local_asset_files
      (user_id, device_id, local_asset_id, server_asset_id, relative_path, original_name, mime_type, size_bytes, sha256, state, created_at, verified_at, last_accessed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        'user-1', 'device-1', 'asset-1', null,
        'assets/user-1/asset-1/content.pdf', 'doc.pdf', 'application/pdf', 1024,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'READY_LOCAL', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      ]
    )

    // Duplicate local_asset_id in same user/device fails PRIMARY KEY
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_asset_files
        (user_id, device_id, local_asset_id, relative_path, original_name, mime_type, size_bytes, sha256, state, created_at, verified_at, last_accessed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          'user-1', 'device-1', 'asset-1',
          'assets/user-1/asset-1/content.pdf', 'doc.pdf', 'application/pdf', 1024,
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          'READY_LOCAL', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
        ]
      ),
      /constraint failed/i
    )

    // Same local_asset_id for DIFFERENT user succeeds (scoped)
    await sqlite.execute(`INSERT INTO local_asset_files
      (user_id, device_id, local_asset_id, relative_path, original_name, mime_type, size_bytes, sha256, state, created_at, verified_at, last_accessed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        'user-2', 'device-1', 'asset-1',
        'assets/user-2/asset-1/content.pdf', 'doc.pdf', 'application/pdf', 1024,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'READY_LOCAL', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      ]
    )

    // Invalid state rejected by CHECK constraint
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_asset_files
        (user_id, device_id, local_asset_id, relative_path, original_name, mime_type, size_bytes, sha256, state, created_at, verified_at, last_accessed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          'user-1', 'device-1', 'asset-invalid-state',
          'assets/user-1/asset-invalid/content.pdf', 'doc.pdf', 'application/pdf', 1024,
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          'INVALID_STATE', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
        ]
      ),
      /constraint failed/i
    )
  } finally {
    sqlite.close()
  }
})

test('schema enforces single active sync job per asset per user and device', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)

    await sqlite.execute(`INSERT INTO local_asset_sync_jobs
      (job_id, user_id, device_id, local_asset_id, phase, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['job-1', 'user-1', 'device-1', 'asset-1', 'PENDING', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z']
    )

    // Second active sync job for same asset in same scope must be rejected
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_asset_sync_jobs
        (job_id, user_id, device_id, local_asset_id, phase, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['job-2', 'user-1', 'device-1', 'asset-1', 'UPLOADING', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z']
      ),
      /constraint failed/i
    )

    // Once first job is marked SYNCED, another job for asset-1 can exist
    await sqlite.execute("UPDATE local_asset_sync_jobs SET phase = 'SYNCED' WHERE job_id = 'job-1'")
    await sqlite.execute(`INSERT INTO local_asset_sync_jobs
      (job_id, user_id, device_id, local_asset_id, phase, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['job-3', 'user-1', 'device-1', 'asset-1', 'PENDING', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z']
    )
  } finally {
    sqlite.close()
  }
})
