import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SourceJobScheduler } from '../src/services/documentProcessing/sourceJobScheduler.ts'

const receipt = {
  cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 1, encryptedBytes: 64,
  plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 32,
}

function source(overrides = {}) {
  return {
    id: 'source-1', type: 'FILE', title: '讲义.pdf', assetId: 'asset-1',
    ingestionStatus: 'AWAITING_CLIENT', ingestionRevision: 'revision-1',
    ...overrides,
  }
}

function createRepository(initial = []) {
  const jobs = new Map(initial.map((item) => [item.jobId, structuredClone(item)]))
  return {
    jobs,
    async create(input) {
      const job = {
        jobId: input.jobId, userId: 'user-1', deviceId: 'device-1', sourceId: input.sourceId,
        ingestionRevision: input.ingestionRevision, phase: 'QUEUED', attempt: 0,
        checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
        errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
      }
      jobs.set(job.jobId, job)
      return structuredClone(job)
    },
    async get(jobId) {
      const job = jobs.get(jobId)
      return job ? structuredClone(job) : null
    },
    async list() { return [...jobs.values()].map((job) => structuredClone(job)) },
    async transition(jobId, phase, options = {}) {
      const job = jobs.get(jobId)
      if (!job) throw new Error('DOCUMENT_JOB_NOT_FOUND')
      job.phase = phase
      if (options.payloadCacheId !== undefined) job.payloadCacheId = options.payloadCacheId
      if (options.payloadReceipt !== undefined) job.payloadReceipt = options.payloadReceipt
      if (options.errorCode !== undefined) job.errorCode = options.errorCode
      if (options.errorDetail !== undefined) job.errorDetail = options.errorDetail
      return structuredClone(job)
    },
  }
}

function input(name = '讲义.pdf', cleanup = async () => {}) {
  return { file: { name, type: 'application/pdf', size: 12 }, cleanup }
}

function schedulerHarness({ currentSource = source(), repository = createRepository(), local = input(), expectedSha256, actualSha256 = 'f'.repeat(64), runPhase = 'PACKAGING', onUpload, onPrepare } = {}) {
  const calls = { run: 0, download: 0, hash: 0, cleanup: 0, prepare: 0 }
  const scheduler = new SourceJobScheduler({
    repository,
    sourceApi: { async get() { return currentSource } },
    resolveLocalInput: async () => local,
    downloadAsset: async () => { calls.download += 1; return input('mobile.pdf', async () => { calls.cleanup += 1 }) },
    expectedAssetSha256: async () => expectedSha256 ?? null,
    hashFile: async () => { calls.hash += 1; return actualSha256 },
    prepareInput: async (_job, _source, file) => { calls.prepare += 1; onPrepare?.(file) },
    runJob: async (jobId) => {
      calls.run += 1
      await repository.transition(jobId, runPhase, runPhase === 'PACKAGING' ? { payloadCacheId: receipt.cacheId, payloadReceipt: receipt } : {})
    },
    upload: { async upload(jobId, receivedReceipt, metadata) {
      onUpload?.(jobId, receivedReceipt, metadata)
      await repository.transition(jobId, 'READY', { payloadCacheId: receivedReceipt.cacheId, payloadReceipt: receivedReceipt })
      return { parsedDocumentId: 'parsed-1', status: 'ACCEPTED' }
    } },
    deleteCache: async () => { calls.cacheDeleted = (calls.cacheDeleted ?? 0) + 1 },
  })
  return { scheduler, repository, calls }
}

test('FILE source creates a job immediately, runs local input, and uploads with the verified asset SHA', async () => {
  let uploadMetadata
  const { scheduler, repository, calls } = schedulerHarness({
    expectedSha256: 'f'.repeat(64),
    onUpload: (_jobId, _receipt, metadata) => { uploadMetadata = metadata },
  })
  const result = await scheduler.schedule('source-1')
  const jobs = await repository.list()
  assert.equal(result.status, 'READY')
  assert.equal(jobs.length, 1)
  assert.equal(calls.run, 1)
  assert.equal(calls.download, 0)
  assert.equal(uploadMetadata.sourceAssetSha256, 'f'.repeat(64))
})

test('mobile-created FILE source downloads through an owner-scoped adapter and cleans its temporary input', async () => {
  const { scheduler, calls } = schedulerHarness({ local: null })
  const result = await scheduler.schedule('source-1')
  assert.equal(result.status, 'READY')
  assert.equal(calls.download, 1)
  assert.equal(calls.cleanup, 1)
})

test('asset SHA mismatch fails before parser execution or upload', async () => {
  const { scheduler, repository, calls } = schedulerHarness({ expectedSha256: 'e'.repeat(64) })
  const result = await scheduler.schedule('source-1')
  const job = (await repository.list())[0]
  assert.equal(result.status, 'FAILED_LOCAL')
  assert.equal(calls.run, 0)
  assert.equal(job.errorCode, 'SOURCE_ASSET_SHA_MISMATCH')
})

test('new ingestion revision supersedes stale local jobs before creating the current job', async () => {
  const repository = createRepository([{
    jobId: 'old-job', userId: 'user-1', deviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
    phase: 'QUEUED', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const { scheduler } = schedulerHarness({ repository })
  await scheduler.schedule('source-1')
  const old = await repository.get('old-job')
  assert.equal(old.phase, 'FAILED_LOCAL')
  assert.equal(old.errorCode, 'INGESTION_REVISION_STALE')
  assert.equal((await repository.list()).some((job) => job.ingestionRevision === 'revision-1' && job.phase === 'READY'), true)
})

test('compatible READY source does not invoke OCR or create a local job', async () => {
  const { scheduler, repository, calls } = schedulerHarness({ currentSource: source({ ingestionStatus: 'READY' }) })
  const result = await scheduler.schedule('source-1')
  assert.equal(result.status, 'SKIPPED')
  assert.equal(calls.run, 0)
  assert.equal((await repository.list()).length, 0)
})

test('TEXT and URL sources stay on the server ingestion path', async () => {
  for (const type of ['TEXT', 'URL']) {
    const { scheduler, repository, calls } = schedulerHarness({ currentSource: source({ type, assetId: undefined, ingestionRevision: 'revision-1', ingestionStatus: 'PENDING' }) })
    const result = await scheduler.schedule('source-1')
    assert.equal(result.status, 'SKIPPED')
    assert.equal(calls.run, 0)
    assert.equal((await repository.list()).length, 0)
  }
})

test('PACKAGING job resumes from durable receipt without OCR and cleans cache after READY', async () => {
  const repository = createRepository([{
    jobId: 'packaging-job', userId: 'user-1', deviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'PACKAGING', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: receipt.cacheId, payloadReceipt: receipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const { scheduler, calls } = schedulerHarness({ repository, local: null })
  const result = await scheduler.schedule('source-1')
  assert.equal(result.status, 'READY')
  assert.equal(calls.run, 0)
  assert.equal(calls.cacheDeleted, 1)
})

test('paused extraction requeues before parsing and paused upload resumes from its durable receipt', async () => {
  const extractionRepository = createRepository([{
    jobId: 'paused-extraction', userId: 'user-1', deviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'PAUSED_NETWORK', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
    errorCode: 'NETWORK_OFFLINE', errorDetail: 'offline', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const extraction = schedulerHarness({ repository: extractionRepository })
  const extractionResult = await extraction.scheduler.schedule('source-1')
  assert.equal(extractionResult.status, 'READY')
  assert.equal(extraction.calls.run, 1)

  let uploadPhase
  const uploadRepository = createRepository([{
    jobId: 'paused-upload', userId: 'user-1', deviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'PAUSED_NETWORK', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: receipt.cacheId, payloadReceipt: receipt,
    errorCode: 'NETWORK_OFFLINE', errorDetail: 'offline', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const upload = schedulerHarness({
    repository: uploadRepository,
    onUpload: () => { uploadPhase = uploadRepository.jobs.get('paused-upload').phase },
  })
  const uploadResult = await upload.scheduler.schedule('source-1')
  assert.equal(uploadResult.status, 'READY')
  assert.equal(upload.calls.run, 0)
  assert.equal(uploadPhase, 'UPLOADING')
})

test('scheduler does not persist signed URLs', async () => {
  const sourceCode = await (await import('node:fs/promises')).readFile(new URL('../src/services/documentProcessing/sourceJobScheduler.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(sourceCode, /localStorage|uploadUrl|downloadUrl\s*:/)
})
