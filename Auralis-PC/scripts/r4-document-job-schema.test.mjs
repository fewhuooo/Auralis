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

const { DocumentProcessingJobRepository, createMemoryStorage } = await import('../src/services/localRepository.ts')
const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')

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

test('v4 schema upgrades to v5 with durable cache receipt metadata', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await sqlite.execute('CREATE TABLE local_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    await sqlite.execute('INSERT INTO local_schema_migrations (version, applied_at) VALUES ($1, $2)', [2, '2026-08-20T00:00:00.000Z'])

    await createVersionedLocalSchema(sqlite)

    const table = sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'document_processing_jobs'").get()
    assert.ok(table)
    const versions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((row) => row.version)
    assert.deepEqual(versions, [2, 5])
    const columns = sqlite.database.prepare('PRAGMA table_info(document_processing_jobs)').all().map((row) => row.name)
    assert.ok(columns.includes('payload_receipt_json'))
  } finally {
    sqlite.close()
  }
})

test('document jobs isolate user/device and enforce source revision uniqueness', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const first = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite, now: () => '2026-08-24T00:00:00.000Z' })
    const second = new DocumentProcessingJobRepository('user-b', 'device-1', { sql: sqlite, now: () => '2026-08-24T00:00:00.000Z' })
    const firstJob = await first.create({ jobId: 'job-a', sourceId: 'source-1', ingestionRevision: 'revision-4' })
    const secondJob = await second.create({ jobId: 'job-b', sourceId: 'source-1', ingestionRevision: 'revision-4' })

    assert.equal(firstJob.userId, 'user-a')
    assert.equal(secondJob.userId, 'user-b')
    assert.equal(await first.get('job-b'), null)
    await assert.rejects(() => first.create({ jobId: 'job-a-duplicate', sourceId: 'source-1', ingestionRevision: 'revision-4' }), /DOCUMENT_JOB_DUPLICATE_REVISION/)
  } finally {
    sqlite.close()
  }
})

test('v3 numeric revisions are preserved as text in the v5 migration', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await sqlite.execute(`CREATE TABLE document_processing_jobs (
      job_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, source_id TEXT NOT NULL,
      ingestion_revision INTEGER NOT NULL CHECK (ingestion_revision > 0), phase TEXT NOT NULL, attempt INTEGER NOT NULL,
      checkpoint_page INTEGER NOT NULL, checkpoint_ordinal INTEGER NOT NULL, checkpoint_json TEXT,
      payload_cache_id TEXT, error_code TEXT, error_detail TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    await sqlite.execute(`INSERT INTO document_processing_jobs
      (job_id,user_id,device_id,source_id,ingestion_revision,phase,attempt,checkpoint_page,checkpoint_ordinal,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    ['legacy-job', 'user-a', 'device-1', 'source-1', 4, 'PACKAGING', 0, 0, 0, '2026-08-24', '2026-08-24'])
    await createVersionedLocalSchema(sqlite)
    const column = sqlite.database.prepare('PRAGMA table_info(document_processing_jobs)').all().find((row) => row.name === 'ingestion_revision')
    assert.equal(column.type, 'TEXT')
    const row = sqlite.database.prepare('SELECT ingestion_revision FROM document_processing_jobs WHERE job_id = ?').get('legacy-job')
    assert.equal(row.ingestion_revision, '4')
    assert.ok(sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_document_processing_jobs_v3'").get())
  } finally {
    sqlite.close()
  }
})

test('browser v3 jobs are copied into the v5 namespace with text revisions', async () => {
  const storage = createMemoryStorage()
  storage.setItem('auralis:v3:document-jobs:user-a:device-1', JSON.stringify([{
    jobId: 'legacy-job', userId: 'user-a', deviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 4,
    phase: 'PACKAGING', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: 'cache-1',
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }]))
  const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { storage })
  const jobs = await repository.list()
  assert.equal(jobs[0].ingestionRevision, '4')
  assert.ok(storage.getItem('auralis:v5:document-jobs:user-a:device-1'))
})

test('cache receipt metadata survives a SQL repository round trip', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    await repository.create({ jobId: 'job-receipt', sourceId: 'source-1', ingestionRevision: 'revision-1' })
    const receipt = {
      cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 2, encryptedBytes: 128,
      plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 96,
    }
    await repository.transition('job-receipt', 'EXTRACTING')
    await repository.transition('job-receipt', 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
    const persisted = await repository.get('job-receipt')
    assert.deepEqual(persisted.payloadReceipt, receipt)
  } finally {
    sqlite.close()
  }
})

test('document job transitions reject illegal phases and checkpoint atomically', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite, now: () => '2026-08-24T00:00:00.000Z' })
    await repository.create({ jobId: 'job-1', sourceId: 'source-1', ingestionRevision: 'revision-1' })

    await assert.rejects(() => repository.transition('job-1', 'READY'), /DOCUMENT_JOB_ILLEGAL_TRANSITION/)
    const updated = await repository.transition('job-1', 'EXTRACTING', {
      checkpoint: {
        pageNumber: 2,
        blockOrdinal: 3,
        parserState: 'pdf-page-2',
      },
    })
    assert.equal(updated.phase, 'EXTRACTING')
    assert.deepEqual(updated.checkpoint, { pageNumber: 2, blockOrdinal: 3, parserState: 'pdf-page-2' })

    const row = sqlite.database.prepare('SELECT phase, checkpoint_page, checkpoint_ordinal, checkpoint_json FROM document_processing_jobs WHERE job_id = ?').get('job-1')
    assert.equal(row.phase, 'EXTRACTING')
    assert.equal(row.checkpoint_page, 2)
    assert.equal(row.checkpoint_ordinal, 3)
    assert.equal(row.checkpoint_json, JSON.stringify({ pageNumber: 2, blockOrdinal: 3, parserState: 'pdf-page-2' }))
  } finally {
    sqlite.close()
  }
})
