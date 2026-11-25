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

test('legacy schema upgrades to the current local asset, document and overview sync schema', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await sqlite.execute('CREATE TABLE local_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    await sqlite.execute('INSERT INTO local_schema_migrations (version, applied_at) VALUES ($1, $2)', [2, '2026-08-20T00:00:00.000Z'])

    await createVersionedLocalSchema(sqlite)

    const table = sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'document_processing_jobs'").get()
    assert.ok(table)
    const versions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((row) => row.version)
    assert.deepEqual(versions, [2, LOCAL_SCHEMA_VERSION])
    const columns = sqlite.database.prepare('PRAGMA table_info(document_processing_jobs)').all().map((row) => row.name)
    assert.ok(columns.includes('payload_receipt_json'))
    assert.ok(sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_overview_cache'").get())
    assert.ok(sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'overview_sync_outbox'").get())
    assert.ok(sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'overview_sync_states'").get())
  } finally {
    sqlite.close()
  }
})

test('overview cache enforces subject revision-key semantics', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO ai_overview_cache
        (user_id,device_id,scope_type,scope_id,revision_key,schema_version,title,status,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      ['user-a','device-a','SUBJECT','subject-1','rev-1',1,'Subject','FAILED','2026-09-10T00:00:00.000Z']),
      /CHECK constraint failed/,
    )
  } finally { sqlite.close() }
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

test('cache receipt metadata survives a SQL repository round trip', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    await repository.create({ jobId: 'job-receipt', sourceId: 'source-1', ingestionRevision: 'revision-1' })
    const receipt = {
      cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 2, encryptedBytes: 128,
      plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 96,
      payloadFormat: 'parsed-document-v1', sourceAssetSha256: 'C'.repeat(64),
      parserId: 'auralis-document-parser', parserVersion: '1.0.0', normalizationVersion: 'nfkc-lf-trim', ocrModelVersion: null,
    }
    await repository.transition('job-receipt', 'EXTRACTING')
    await repository.transition('job-receipt', 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
    const persisted = await repository.get('job-receipt')
    assert.deepEqual(persisted.payloadReceipt, { ...receipt, sourceAssetSha256: receipt.sourceAssetSha256.toLowerCase() })
  } finally {
    sqlite.close()
  }
})

test('incomplete receipts remain legacy on browser round trip', async () => {
  const storage = createMemoryStorage()
  const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { storage })
  await repository.create({ jobId: 'job-legacy-receipt', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  await repository.transition('job-legacy-receipt', 'EXTRACTING')
  await repository.transition('job-legacy-receipt', 'PACKAGING', {
    payloadCacheId: 'cache-legacy',
    payloadReceipt: {
      cacheId: 'cache-legacy', envelopeVersion: 1, chunkCount: 1, encryptedBytes: 64,
      plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 32,
      payloadFormat: 'parsed-document-v1', sourceAssetSha256: 'not-a-hash', parserId: 'parser',
    },
  })
  const persisted = await repository.get('job-legacy-receipt')
  assert.equal(persisted.payloadReceipt.payloadFormat, undefined)
  assert.equal(persisted.payloadReceipt.sourceAssetSha256, undefined)
})

test('OCR checkpoint diagnostics survive SQL and browser round trips without new columns', async () => {
  const diagnostic = { pageNumber: 2, totalPages: 4, imageBytes: 1234, rawLineCount: 3, normalizedLineCount: 2, totalMs: 19, outcome: 'running' }
  const checkpoint = { pageNumber: 2, blockOrdinal: 1, diagnostic }
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    await repository.create({ jobId: 'job-diagnostic-sql', sourceId: 'source-1', ingestionRevision: 'revision-1' })
    await repository.transition('job-diagnostic-sql', 'EXTRACTING')
    await repository.transition('job-diagnostic-sql', 'OCR_RUNNING', { checkpoint })
    assert.deepEqual((await repository.get('job-diagnostic-sql')).checkpoint, checkpoint)
    const columns = sqlite.database.prepare('PRAGMA table_info(document_processing_jobs)').all().map((row) => row.name)
    assert.equal(columns.includes('ocr_diagnostic'), false)
  } finally {
    sqlite.close()
  }

  const storage = createMemoryStorage()
  const browser = new DocumentProcessingJobRepository('user-a', 'device-1', { storage })
  await browser.create({ jobId: 'job-diagnostic-browser', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  await browser.transition('job-diagnostic-browser', 'EXTRACTING')
  await browser.transition('job-diagnostic-browser', 'OCR_RUNNING', { checkpoint })
  assert.deepEqual((await browser.get('job-diagnostic-browser')).checkpoint, checkpoint)
})

test('malformed checkpoint JSON still fails safely', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    await repository.create({ jobId: 'job-malformed-diagnostic', sourceId: 'source-1', ingestionRevision: 'revision-1' })
    await sqlite.execute('UPDATE document_processing_jobs SET checkpoint_json = $1 WHERE job_id = $2', ['{bad', 'job-malformed-diagnostic'])
    await assert.rejects(() => repository.get('job-malformed-diagnostic'), /Invalid document job checkpoint/)
  } finally {
    sqlite.close()
  }
})

test('removing a deleted Source job clears only its owner-scoped job rows and returns their cache metadata', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const first = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    const second = new DocumentProcessingJobRepository('user-b', 'device-1', { sql: sqlite })
    const receipt = {
      cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 1, encryptedBytes: 64,
      plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 48,
    }
    await first.create({ jobId: 'delete-me', sourceId: 'source-1', ingestionRevision: 'revision-1' })
    await first.transition('delete-me', 'EXTRACTING')
    await first.transition('delete-me', 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
    await first.create({ jobId: 'keep-me', sourceId: 'source-2', ingestionRevision: 'revision-1' })
    await second.create({ jobId: 'other-user', sourceId: 'source-1', ingestionRevision: 'revision-1' })

    const removed = await first.removeBySource('source-1')

    assert.deepEqual(removed.map((job) => job.jobId), ['delete-me'])
    assert.equal(removed[0].payloadReceipt.cacheId, 'cache-1')
    assert.deepEqual((await first.list()).map((job) => job.jobId), ['keep-me'])
    assert.deepEqual((await second.list()).map((job) => job.jobId), ['other-user'])
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

    const samePhase = await repository.transition('job-1', 'EXTRACTING', {
      checkpoint: { pageNumber: 2, blockOrdinal: 4, parserState: 'pdf-page-2' },
    })
    assert.deepEqual(samePhase.checkpoint, { pageNumber: 2, blockOrdinal: 4, parserState: 'pdf-page-2' })

    const row = sqlite.database.prepare('SELECT phase, checkpoint_page, checkpoint_ordinal, checkpoint_json FROM document_processing_jobs WHERE job_id = ?').get('job-1')
    assert.equal(row.phase, 'EXTRACTING')
    assert.equal(row.checkpoint_page, 2)
    assert.equal(row.checkpoint_ordinal, 4)
    assert.equal(row.checkpoint_json, JSON.stringify({ pageNumber: 2, blockOrdinal: 4, parserState: 'pdf-page-2' }))
  } finally {
    sqlite.close()
  }
})

test('server validation and indexing phases can retry local cache corruption', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    for (const phase of ['SERVER_VALIDATING', 'SERVER_INDEXING']) {
      const jobId = `job-${phase}`
      await repository.create({ jobId, sourceId: `source-${phase}`, ingestionRevision: `revision-${phase}` })
      await repository.transition(jobId, 'EXTRACTING')
      await repository.transition(jobId, 'PACKAGING')
      await repository.transition(jobId, 'UPLOADING')
      await repository.transition(jobId, 'SERVER_VALIDATING')
      if (phase === 'SERVER_INDEXING') await repository.transition(jobId, 'SERVER_INDEXING')
      const failed = await repository.transition(jobId, 'FAILED_LOCAL', {
        payloadCacheId: 'column-cache',
        payloadReceipt: { cacheId: 'receipt-cache' },
        errorCode: 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH',
        errorDetail: 'Derived document cache ownership mismatch; receipt preserved',
      })
      assert.equal(failed.phase, 'FAILED_LOCAL')
      assert.equal(failed.payloadCacheId, 'column-cache')
      assert.equal(failed.payloadReceipt.cacheId, 'receipt-cache')
    }
  } finally {
    sqlite.close()
  }
})

test('retryable OCR phases can be requeued by the production transition policy', async () => {
  const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: null })
  await repository.create({ jobId: 'job-retry-extracting', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  await repository.transition('job-retry-extracting', 'EXTRACTING')
  await repository.transition('job-retry-extracting', 'QUEUED', { attempt: 1 })
  await repository.transition('job-retry-extracting', 'EXTRACTING')
  await repository.transition('job-retry-extracting', 'OCR_RUNNING')
  const requeued = await repository.transition('job-retry-extracting', 'QUEUED', { attempt: 2 })
  assert.equal(requeued.phase, 'QUEUED')
  assert.equal(requeued.attempt, 2)
})

test('malformed OCR diagnostic values are omitted at the persistence boundary', async () => {
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    await repository.create({ jobId: 'job-invalid-diagnostic', sourceId: 'source-1', ingestionRevision: 'revision-1' })
    await sqlite.execute('UPDATE document_processing_jobs SET checkpoint_json = $1 WHERE job_id = $2', [JSON.stringify({ pageNumber: 1, blockOrdinal: 0, diagnostic: { pageNumber: -1, totalPages: 999999999, imageBytes: 999999999999, rawLineCount: 'secret', outcome: 'unexpected' } }), 'job-invalid-diagnostic'])
    const persisted = await repository.get('job-invalid-diagnostic')
    assert.deepEqual(persisted.checkpoint, { pageNumber: 1, blockOrdinal: 0 })
  } finally {
    sqlite.close()
  }
})

test('browser hydration strips invalid OCR diagnostics while retaining valid bounded fields', async () => {
  const storage = createMemoryStorage()
  storage.setItem('auralis:v5:document-jobs:user-a:device-1', JSON.stringify([{
    jobId: 'job-browser-diagnostic', userId: 'user-a', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'OCR_RUNNING', attempt: 0,
    checkpoint: {
      pageNumber: 3, blockOrdinal: 2,
      diagnostic: {
        pageNumber: 3, totalPages: 4, imageBytes: 4096, rawLineCount: 2, normalizedLineCount: 1, totalMs: 8, outcome: 'text',
        secret: 'must-not-survive', invalid: Number.POSITIVE_INFINITY,
      },
    },
    payloadCacheId: null, payloadReceipt: null, errorCode: null, errorDetail: null,
    createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }, {
    jobId: 'job-browser-invalid', userId: 'user-a', serverDeviceId: 'device-1', sourceId: 'source-2', ingestionRevision: 'revision-1',
    phase: 'OCR_RUNNING', attempt: 0,
    checkpoint: { pageNumber: 1, blockOrdinal: 0, diagnostic: { pageNumber: -1, totalPages: 999999999, imageBytes: 999999999999, outcome: 'unexpected', rawLineCount: 'secret' } },
    payloadCacheId: null, payloadReceipt: null, errorCode: null, errorDetail: null,
    createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }]))
  const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { storage })
  const jobs = await repository.list()
  assert.deepEqual(jobs[0].checkpoint.diagnostic, { pageNumber: 3, totalPages: 4, imageBytes: 4096, rawLineCount: 2, normalizedLineCount: 1, totalMs: 8, outcome: 'text' })
  assert.deepEqual(jobs[1].checkpoint, { pageNumber: 1, blockOrdinal: 0 })
})

test('inconsistent cumulative OCR page counts are removed as one group in SQL and browser checkpoints', async () => {
  const invalid = { pageNumber: 3, totalPages: 4, imageBytes: 4096, outcome: 'running', ocrProcessedPages: 2, ocrTextPages: 2, ocrEmptyPages: 1, totalRawLineCount: 4, totalNormalizedLineCount: 3 }
  const valid = { ...invalid, ocrProcessedPages: 3, ocrTextPages: 2, ocrEmptyPages: 1 }
  const sqlite = new TemporarySqlite()
  try {
    const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: sqlite })
    await repository.create({ jobId: 'job-invalid-group', sourceId: 'source-1', ingestionRevision: 'revision-1' })
    await sqlite.execute('UPDATE document_processing_jobs SET checkpoint_json = $1 WHERE job_id = $2', [JSON.stringify({ pageNumber: 3, blockOrdinal: 0, diagnostic: invalid }), 'job-invalid-group'])
    assert.deepEqual((await repository.get('job-invalid-group')).checkpoint.diagnostic, { pageNumber: 3, totalPages: 4, imageBytes: 4096, outcome: 'running', totalRawLineCount: 4, totalNormalizedLineCount: 3 })
  } finally {
    sqlite.close()
  }

  const storage = createMemoryStorage()
  storage.setItem('auralis:v5:document-jobs:user-a:device-1', JSON.stringify([{
    jobId: 'job-valid-group', userId: 'user-a', serverDeviceId: 'device-1', sourceId: 'source-2', ingestionRevision: 'revision-1', phase: 'OCR_RUNNING', attempt: 0,
    checkpoint: { pageNumber: 3, blockOrdinal: 0, diagnostic: valid }, payloadCacheId: null, payloadReceipt: null, errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }]))
  const browser = new DocumentProcessingJobRepository('user-a', 'device-1', { storage })
  assert.deepEqual((await browser.get('job-valid-group')).checkpoint.diagnostic, valid)
})

test('UPLOADING can persist a local terminal failure without masking its cause', async () => {
  const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: null })
  await repository.create({ jobId: 'job-upload-local', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  await repository.transition('job-upload-local', 'EXTRACTING')
  await repository.transition('job-upload-local', 'PACKAGING')
  await repository.transition('job-upload-local', 'UPLOADING')
  const failed = await repository.transition('job-upload-local', 'FAILED_LOCAL', {
    errorCode: 'DOCUMENT_CACHE_READ_FAILED',
    errorDetail: 'cache unavailable',
  })
  assert.equal(failed.phase, 'FAILED_LOCAL')
  assert.equal(failed.errorCode, 'DOCUMENT_CACHE_READ_FAILED')
})

test('network failures during server validation remain resumable through PAUSED_NETWORK', async () => {
  const repository = new DocumentProcessingJobRepository('user-a', 'device-1', { sql: null })
  await repository.create({ jobId: 'job-server-network', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  await repository.transition('job-server-network', 'EXTRACTING')
  await repository.transition('job-server-network', 'PACKAGING')
  await repository.transition('job-server-network', 'UPLOADING')
  await repository.transition('job-server-network', 'SERVER_VALIDATING')
  const paused = await repository.transition('job-server-network', 'PAUSED_NETWORK', {
    errorCode: 'NETWORK_OFFLINE',
    errorDetail: 'NETWORK_OFFLINE:connect',
  })
  assert.equal(paused.phase, 'PAUSED_NETWORK')
  const resumed = await repository.transition('job-server-network', 'UPLOADING', {
    errorCode: null,
    errorDetail: null,
  })
  assert.equal(resumed.phase, 'UPLOADING')
})
