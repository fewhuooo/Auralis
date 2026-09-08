import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SourceJobScheduler } from '../src/services/documentProcessing/sourceJobScheduler.ts'
import { ApiProblemError } from '../src/api/httpError.ts'

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
        jobId: input.jobId, userId: 'user-1', serverDeviceId: 'device-1', sourceId: input.sourceId,
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
    async removeBySource(sourceId) {
      const removed = [...jobs.values()]
        .filter((job) => job.sourceId === sourceId)
        .map((job) => structuredClone(job))
      for (const job of removed) jobs.delete(job.jobId)
      return removed
    },
    async transition(jobId, phase, options = {}) {
      const job = jobs.get(jobId)
      if (!job) throw new Error('DOCUMENT_JOB_NOT_FOUND')
      job.phase = phase
      if (options.attempt !== undefined) job.attempt = options.attempt
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

function schedulerHarness({ currentSource = source(), sourceError, repository = createRepository(), local = input(), downloadAsset, expectedSha256, actualSha256 = 'f'.repeat(64), runPhase = 'PACKAGING', onUpload, onPrepare, onJobChanged } = {}) {
  const calls = { run: 0, download: 0, hash: 0, cleanup: 0, prepare: 0, sourceGet: 0, cancelled: [], deletedCaches: [] }
  const scheduler = new SourceJobScheduler({
    repository,
    sourceApi: {
      async get() {
        calls.sourceGet += 1
        if (sourceError) throw sourceError
        return currentSource
      },
    },
    resolveLocalInput: async () => local,
    downloadAsset: downloadAsset ?? (async () => { calls.download += 1; return input('mobile.pdf', async () => { calls.cleanup += 1 }) }),
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
    cancelJob: async (jobId) => { calls.cancelled.push(jobId) },
    deleteCache: async (cacheId) => {
      calls.cacheDeleted = (calls.cacheDeleted ?? 0) + 1
      calls.deletedCaches.push(cacheId)
    },
    onJobChanged,
  })
  return { scheduler, repository, calls }
}

test('404 Source lookup discards its owner-scoped jobs and stays skipped as SOURCE_NOT_FOUND', async () => {
  const repository = createRepository([{
    jobId: 'orphan-job', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'PACKAGING', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: 'cache-1', payloadReceipt: receipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const sourceError = new ApiProblemError({
    title: 'Source was not found', status: 404, detail: 'The Source does not exist', code: 'RESOURCE_NOT_FOUND',
  })
  const { scheduler, calls } = schedulerHarness({ repository, sourceError })

  const result = await scheduler.schedule('source-1')

  assert.deepEqual(result, { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' })
  assert.equal((await repository.list()).length, 0)
  assert.deepEqual(calls.cancelled, ['orphan-job'])
  assert.deepEqual(calls.deletedCaches, ['cache-1'])
  assert.equal(calls.sourceGet, 1)
  assert.deepEqual(await scheduler.schedule('source-1'), { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' })
  assert.equal(calls.sourceGet, 1)
})

test('non-404 Source lookup errors preserve the job and reject', async () => {
  const repository = createRepository([{
    jobId: 'server-error-job', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'QUEUED', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const sourceError = new ApiProblemError({
    title: 'Internal error', status: 503, detail: 'Service unavailable', code: 'INTERNAL_ERROR',
  })
  const { scheduler, calls } = schedulerHarness({ repository, sourceError })

  await assert.rejects(() => scheduler.schedule('source-1'), sourceError)

  assert.equal((await repository.list()).length, 1)
  assert.equal(calls.sourceGet, 1)
})

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

test('scheduler publishes job creation and settled state to the processing UI', async () => {
  const snapshots = []
  let repository
  const harness = schedulerHarness({
    onJobChanged: async () => {
      snapshots.push((await repository.list()).map((job) => job.phase))
    },
  })
  repository = harness.repository

  await harness.scheduler.schedule('source-1')

  assert.deepEqual(snapshots[0], ['QUEUED'])
  assert.deepEqual(snapshots.at(-1), ['READY'])
})

test('discard removes all local jobs and encrypted caches for a deleted Source before refreshing the UI', async () => {
  const repository = createRepository([
    {
      jobId: 'deleted-current', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
      phase: 'OCR_RUNNING', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 0 }, payloadCacheId: 'cache-current', payloadReceipt: receipt,
      errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
    },
    {
      jobId: 'deleted-stale', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
      phase: 'FAILED_LOCAL', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: 'cache-stale', payloadReceipt: receipt,
      errorCode: 'OCR_MODEL_FAILED', errorDetail: 'old failure', createdAt: '2026-08-23', updatedAt: '2026-08-23',
    },
    {
      jobId: 'kept-job', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-2', ingestionRevision: 'revision-2',
      phase: 'QUEUED', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
      errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
    },
  ])
  const snapshots = []
  const { scheduler, calls } = schedulerHarness({
    repository,
    onJobChanged: async () => { snapshots.push((await repository.list()).map((job) => job.jobId)) },
  })

  await scheduler.discard('source-1')

  assert.deepEqual(calls.cancelled, ['deleted-current', 'deleted-stale'])
  assert.deepEqual(calls.deletedCaches.sort(), ['cache-current', 'cache-stale'])
  assert.deepEqual((await repository.list()).map((job) => job.jobId), ['kept-job'])
  assert.deepEqual(snapshots.at(-1), ['kept-job'])
  assert.deepEqual(await scheduler.schedule('source-1'), { status: 'SKIPPED', reason: 'SOURCE_DELETED' })
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
    jobId: 'old-job', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
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
    jobId: 'packaging-job', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
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
    jobId: 'paused-extraction', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'PAUSED_NETWORK', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
    errorCode: 'NETWORK_OFFLINE', errorDetail: 'offline', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const extraction = schedulerHarness({ repository: extractionRepository })
  const extractionResult = await extraction.scheduler.schedule('source-1')
  assert.equal(extractionResult.status, 'READY')
  assert.equal(extraction.calls.run, 1)

  let uploadPhase
  const uploadRepository = createRepository([{
    jobId: 'paused-upload', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'PAUSED_NETWORK', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: receipt.cacheId, payloadReceipt: receipt,
    errorCode: 'NETWORK_OFFLINE', errorDetail: 'offline', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const upload = schedulerHarness({
    repository: uploadRepository,
    local: null,
    downloadAsset: async () => { throw new Error('UPLOAD_RESUME_SHOULD_NOT_DOWNLOAD') },
    onUpload: () => { uploadPhase = uploadRepository.jobs.get('paused-upload').phase },
  })
  const uploadResult = await upload.scheduler.schedule('source-1')
  assert.equal(uploadResult.status, 'READY')
  assert.equal(upload.calls.run, 0)
  assert.equal(upload.calls.hash, 0)
  assert.equal(uploadPhase, 'UPLOADING')
})

test('retrying a failed extraction re-enters the scheduler and reacquires the parser input', async () => {
  const repository = createRepository([{
    jobId: 'failed-extraction', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'FAILED_LOCAL', attempt: 3, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
    errorCode: 'DOCUMENT_INPUT_UNAVAILABLE', errorDetail: 'input was only held in a previous renderer process', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const { scheduler, calls } = schedulerHarness({ repository })

  const result = await scheduler.retry('failed-extraction')

  assert.equal(result.status, 'READY')
  assert.equal(calls.sourceGet, 1)
  assert.equal(calls.hash, 1)
  assert.equal(calls.prepare, 1)
  assert.equal(calls.run, 1)
  assert.equal((await repository.get('failed-extraction')).attempt, 0)
})

test('retrying a failed upload resumes from its durable receipt without reacquiring parser input', async () => {
  const repository = createRepository([{
    jobId: 'failed-upload', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'FAILED_LOCAL', attempt: 1, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: receipt.cacheId, payloadReceipt: receipt,
    errorCode: 'NETWORK_OFFLINE', errorDetail: 'upload interrupted', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const { scheduler, calls } = schedulerHarness({
    repository,
    local: null,
    downloadAsset: async () => { throw new Error('UPLOAD_RESUME_SHOULD_NOT_DOWNLOAD') },
  })

  const result = await scheduler.retry('failed-upload')

  assert.equal(result.status, 'READY')
  assert.equal(calls.hash, 0)
  assert.equal(calls.prepare, 0)
  assert.equal(calls.run, 0)
  assert.equal(calls.download, 0)
})

test('resume continues scheduling later awaiting Sources when an earlier Source fails locally', async () => {
  const repository = createRepository()
  const sourceById = {
    'source-1': source({ id: 'source-1', assetId: 'asset-1', ingestionRevision: 'revision-1' }),
    'source-2': source({ id: 'source-2', assetId: 'asset-2', ingestionRevision: 'revision-2' }),
  }
  const scheduler = new SourceJobScheduler({
    repository,
    sourceApi: { async get(sourceId) { return sourceById[sourceId] } },
    resolveLocalInput: async (assetId) => {
      if (assetId === 'asset-1') throw new Error('SOURCE_INPUT_UNAVAILABLE')
      return input('second.pdf')
    },
    downloadAsset: async () => { throw new Error('DOWNLOAD_SHOULD_NOT_RUN') },
    hashFile: async () => 'f'.repeat(64),
    prepareInput: async () => {},
    runJob: async (jobId) => {
      await repository.transition(jobId, 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
    },
    upload: {
      async upload(jobId, receivedReceipt) {
        await repository.transition(jobId, 'READY', {
          payloadCacheId: receivedReceipt.cacheId,
          payloadReceipt: receivedReceipt,
        })
        return { status: 'ACCEPTED' }
      },
    },
  })

  const results = await scheduler.resume(['source-1', 'source-2'])
  const jobs = await repository.list()

  assert.deepEqual(results.map((result) => result.status), ['FAILED_LOCAL', 'READY'])
  assert.equal(jobs.find((job) => job.sourceId === 'source-1')?.phase, 'FAILED_LOCAL')
  assert.equal(jobs.find((job) => job.sourceId === 'source-2')?.phase, 'READY')
})

test('scheduler does not persist signed URLs', async () => {
  const sourceCode = await (await import('node:fs/promises')).readFile(new URL('../src/services/documentProcessing/sourceJobScheduler.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(sourceCode, /localStorage|uploadUrl|downloadUrl\s*:/)
})

test('stale PACKAGING work is recorded as a local failure', async () => {
  const repository = createRepository([{
    jobId: 'stale-packaging', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'old-revision',
    phase: 'PACKAGING', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: receipt.cacheId, payloadReceipt: receipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const { scheduler } = schedulerHarness({ repository })
  await scheduler.schedule('source-1')
  const stale = await repository.get('stale-packaging')
  assert.equal(stale.phase, 'FAILED_LOCAL')
  assert.equal(stale.errorCode, 'INGESTION_REVISION_STALE')
})
