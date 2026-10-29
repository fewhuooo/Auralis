import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { SourceJobScheduler } = await import('../src/services/documentProcessing/sourceJobScheduler.ts')
const { ApiProblemError } = await import('../src/api/httpError.ts')
const { DocumentProcessingJobRepository, createMemoryStorage } = await import('../src/services/localRepository.ts')

const receipt = {
  cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 1, encryptedBytes: 64,
  plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 32,
  payloadFormat: 'parsed-document-v1', sourceAssetSha256: 'f'.repeat(64),
  parserId: 'auralis-local-parser', parserVersion: 'auralis-document-parser/1.0.0',
  normalizationVersion: 'auralis-normalization/1.0.0', ocrModelVersion: null,
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
    async remove(jobId) {
      const job = jobs.get(jobId)
      if (!job) return null
      jobs.delete(jobId)
      return structuredClone(job)
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

function schedulerHarness({ currentSource = source(), sourceError, sourceApiGet, repository = createRepository(), local = input(), downloadAsset, expectedSha256, actualSha256 = 'f'.repeat(64), runPhase = 'PACKAGING', runJobOverride, uploadOverride, onUpload, onPrepare, onJobChanged, deleteCacheOverride } = {}) {
  const calls = { run: 0, download: 0, hash: 0, cleanup: 0, prepare: 0, sourceGet: 0, cancelled: [], deletedCaches: [] }
  const scheduler = new SourceJobScheduler({
    repository,
    sourceApi: {
      async get() {
        calls.sourceGet += 1
        if (sourceApiGet) return sourceApiGet()
        const error = typeof sourceError === 'function' ? sourceError() : sourceError
        if (error) throw error
        return currentSource
      },
    },
    resolveLocalInput: async () => local,
    downloadAsset: downloadAsset ?? (async () => { calls.download += 1; return input('mobile.pdf', async () => { calls.cleanup += 1 }) }),
    expectedAssetSha256: async () => expectedSha256 ?? null,
    hashFile: async () => { calls.hash += 1; return actualSha256 },
    prepareInput: async (_job, _source, file) => { calls.prepare += 1; onPrepare?.(file) },
    runJob: runJobOverride ?? (async (jobId) => {
      calls.run += 1
      await repository.transition(jobId, runPhase, runPhase === 'PACKAGING' ? { payloadCacheId: receipt.cacheId, payloadReceipt: receipt } : {})
    }),
    upload: uploadOverride ?? { async upload(jobId, receivedReceipt, metadata) {
      onUpload?.(jobId, receivedReceipt, metadata)
      await repository.transition(jobId, 'READY', { payloadCacheId: receivedReceipt.cacheId, payloadReceipt: receivedReceipt })
      return { parsedDocumentId: 'parsed-1', status: 'ACCEPTED' }
    } },
    cancelJob: async (jobId) => { calls.cancelled.push(jobId) },
    deleteCache: deleteCacheOverride ?? (async (cacheId) => {
      calls.cacheDeleted = (calls.cacheDeleted ?? 0) + 1
      calls.deletedCaches.push(cacheId)
    }),
    onJobChanged,
  })
  return { scheduler, repository, calls }
}

function realRepositoryUpload(repository, onUpload) {
  return { async upload(jobId, receivedReceipt, metadata) {
    onUpload?.(jobId, receivedReceipt, metadata)
    await repository.transition(jobId, 'UPLOADING', { payloadCacheId: receivedReceipt.cacheId, payloadReceipt: receivedReceipt })
    await repository.transition(jobId, 'SERVER_VALIDATING')
    await repository.transition(jobId, 'SERVER_INDEXING')
    await repository.transition(jobId, 'READY', { payloadCacheId: receivedReceipt.cacheId, payloadReceipt: receivedReceipt })
    return { parsedDocumentId: 'parsed-1', status: 'ACCEPTED' }
  } }
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

test('manual revalidation retries a cached 404 after the server Source becomes visible', async () => {
  let missing = true
  const { scheduler, repository, calls } = schedulerHarness({
    sourceError: () => missing ? new ApiProblemError({
      title: 'Source was not found', status: 404, detail: 'The Source does not exist', code: 'RESOURCE_NOT_FOUND',
    }) : null,
  })

  assert.deepEqual(await scheduler.schedule('source-1'), { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' })
  missing = false
  const result = await scheduler.schedule('source-1', { revalidateNotFound: true })

  assert.equal(result.status, 'READY')
  assert.equal(calls.sourceGet, 2)
  assert.equal((await repository.list()).length, 1)
})

test('manual revalidation preserves the explicit delete fence after a prior 404', async () => {
  const sourceError = new ApiProblemError({
    title: 'Source was not found', status: 404, detail: 'The Source does not exist', code: 'RESOURCE_NOT_FOUND',
  })
  const { scheduler, calls } = schedulerHarness({ sourceError })

  await scheduler.schedule('source-1')
  await scheduler.discard('source-1')

  assert.deepEqual(await scheduler.schedule('source-1', { revalidateNotFound: true }), {
    status: 'SKIPPED', reason: 'SOURCE_DELETED',
  })
  assert.equal(calls.sourceGet, 1)
})

test('a concurrent explicit delete wins over an in-flight 404 and cannot be revalidated', async () => {
  let releaseSourceGet
  const sourceGetGate = new Promise((resolve) => { releaseSourceGet = resolve })
  const sourceError = new ApiProblemError({
    title: 'Source was not found', status: 404, detail: 'The Source does not exist', code: 'RESOURCE_NOT_FOUND',
  })
  const { scheduler, calls } = schedulerHarness({ sourceApiGet: async () => {
    await sourceGetGate
    throw sourceError
  } })
  const inFlight = scheduler.schedule('source-1')
  while (!calls.sourceGet) await new Promise((resolve) => setImmediate(resolve))
  await scheduler.discard('source-1')
  releaseSourceGet()

  assert.deepEqual(await inFlight, { status: 'SKIPPED', reason: 'SOURCE_DELETED' })
  assert.deepEqual(await scheduler.schedule('source-1', { revalidateNotFound: true }), {
    status: 'SKIPPED', reason: 'SOURCE_DELETED',
  })
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
      phase: 'OCR_RUNNING', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 0 }, payloadCacheId: 'cache-current', payloadReceipt: { ...receipt, cacheId: 'cache-current' },
      errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
    },
    {
      jobId: 'deleted-stale', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
      phase: 'FAILED_LOCAL', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: 'cache-stale', payloadReceipt: { ...receipt, cacheId: 'cache-stale' },
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
  const current = await repository.get('packaging-job')
  assert.equal(current.payloadCacheId, null)
  assert.equal(current.payloadReceipt, null)
})

test('immediate READY cleanup failure preserves cache evidence and stable error', async () => {
  const repository = createRepository([{
    jobId: 'ready-cleanup-failure', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'PACKAGING', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: receipt.cacheId, payloadReceipt: receipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const harness = schedulerHarness({ repository, deleteCacheOverride: async () => { throw new Error('CACHE_DELETE_FAILED') } })

  const result = await harness.scheduler.schedule('source-1')

  assert.deepEqual(result, { status: 'READY', jobId: 'ready-cleanup-failure' })
  const current = await repository.get('ready-cleanup-failure')
  assert.equal(current.phase, 'READY')
  assert.equal(current.payloadCacheId, receipt.cacheId)
  assert.equal(current.payloadReceipt.cacheId, receipt.cacheId)
  assert.equal(current.errorCode, 'DOCUMENT_CACHE_CLEANUP_FAILED')
  assert.equal(current.errorDetail, 'Derived document cache cleanup failed; receipt preserved')
})

test('later READY scheduling retries cleanup and clears cache metadata', async () => {
  const repository = createRepository([{
    jobId: 'ready-retry-cleanup', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'READY', attempt: 0, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: receipt.cacheId, payloadReceipt: receipt,
    errorCode: 'DOCUMENT_CACHE_CLEANUP_FAILED', errorDetail: 'Derived document cache cleanup failed; receipt preserved', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const deleted = []
  const harness = schedulerHarness({ repository, deleteCacheOverride: async (id) => deleted.push(id) })

  const result = await harness.scheduler.schedule('source-1')

  assert.deepEqual(result, { status: 'SKIPPED', jobId: 'ready-retry-cleanup', reason: 'ALREADY_READY' })
  const current = await repository.get('ready-retry-cleanup')
  assert.equal(current.payloadCacheId, null)
  assert.equal(current.payloadReceipt, null)
  assert.equal(current.errorCode, null)
  assert.deepEqual(deleted, [receipt.cacheId])
  assert.equal(harness.calls.run, 0)
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

test('retrying a paused upload with a durable receipt uses the real repository transition and uploads without parsing', async () => {
  const repository = new DocumentProcessingJobRepository('user-1', 'device-1', { storage: createMemoryStorage() })
  const created = await repository.create({ jobId: 'paused-upload-real', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  await repository.transition(created.jobId, 'PAUSED_NETWORK', {
    checkpoint: { pageNumber: 1, blockOrdinal: 1 },
    payloadCacheId: receipt.cacheId,
    payloadReceipt: receipt,
    errorCode: 'NETWORK_OFFLINE',
    errorDetail: 'offline',
  })
  const upload = schedulerHarness({
    repository,
    local: null,
    downloadAsset: async () => { throw new Error('UPLOAD_RESUME_SHOULD_NOT_DOWNLOAD') },
    uploadOverride: realRepositoryUpload(repository),
  })

  const result = await upload.scheduler.retry(created.jobId)

  assert.equal(result.status, 'READY')
  assert.equal(upload.calls.run, 0)
  assert.equal(upload.calls.hash, 0)
  assert.equal(upload.calls.prepare, 0)
  assert.equal(upload.calls.download, 0)
  assert.equal((await repository.get(created.jobId)).phase, 'READY')
})

test('legacy receipt is deleted and cleared before exactly one rebuild', async () => {
  const legacy = { ...receipt, payloadFormat: undefined, sourceAssetSha256: undefined }
  const repository = createRepository([{
    jobId: 'legacy-upload', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'UPLOADING', attempt: 1, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: legacy.cacheId, payloadReceipt: legacy,
    errorCode: 'NETWORK_OFFLINE', errorDetail: 'offline', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const order = []
  const scheduler = new SourceJobScheduler({
    repository,
    sourceApi: { async get() { return source() } },
    resolveLocalInput: async () => input(), downloadAsset: async () => input(),
    hashFile: async () => { order.push('hash'); return 'f'.repeat(64) }, expectedAssetSha256: async () => null,
    prepareInput: async () => { order.push('prepare') }, runJob: async (jobId) => {
      order.push('run'); await repository.transition(jobId, 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
    }, upload: { async upload(jobId, receivedReceipt, metadata) {
      order.push('upload'); assert.equal(metadata.sourceAssetSha256, receipt.sourceAssetSha256)
      await repository.transition(jobId, 'READY', { payloadCacheId: receivedReceipt.cacheId, payloadReceipt: receivedReceipt }); return { status: 'ACCEPTED' }
    } }, deleteCache: async () => { order.push('delete') },
  })
  const result = await scheduler.schedule('source-1')
  assert.equal(result.status, 'READY')
  assert.deepEqual(order, ['delete', 'hash', 'prepare', 'run', 'upload', 'delete'])
  const current = await repository.get('legacy-upload')
  assert.equal(current.payloadReceipt, null)
  assert.equal(current.payloadCacheId, null)
})

test('legacy receipt-only cache is deleted before rebuild when the column is null', async () => {
  const legacy = { ...receipt, payloadFormat: undefined, sourceAssetSha256: undefined, cacheId: 'receipt-only-cache' }
  const repository = createRepository([{
    jobId: 'receipt-only', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'UPLOADING', attempt: 1, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: null, payloadReceipt: legacy,
    errorCode: 'NETWORK_OFFLINE', errorDetail: 'offline', createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const deleted = []
  const harness = schedulerHarness({ repository, currentSource: source({ ingestionStatus: 'READY' }), deleteCacheOverride: async (id) => deleted.push(id) })
  const result = await harness.scheduler.schedule('source-1')
  assert.equal(result.status, 'READY')
  assert.deepEqual(deleted, ['receipt-only-cache', receipt.cacheId])
})

test('mismatched receipt and column cache ids fail locally and preserve evidence', async () => {
  const legacy = { ...receipt, payloadFormat: undefined, sourceAssetSha256: undefined, cacheId: 'receipt-cache' }
  const repository = createRepository([{
    jobId: 'mismatched-cache', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'UPLOADING', attempt: 1, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: 'column-cache', payloadReceipt: legacy,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const harness = schedulerHarness({ repository })
  const result = await harness.scheduler.schedule('source-1')
  const current = await repository.get('mismatched-cache')
  assert.equal(result.reason, 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH')
  assert.equal(current.phase, 'FAILED_LOCAL')
  assert.equal(current.payloadCacheId, 'column-cache')
  assert.equal(current.payloadReceipt.cacheId, 'receipt-cache')
  assert.deepEqual(harness.calls.deletedCaches, [])
})

test('valid schema-v1 cache ID mismatch fails before scheduler upload network', async () => {
  const mismatched = { ...receipt, cacheId: 'receipt-cache-v1' }
  const repository = createRepository([{
    jobId: 'mismatched-v1-cache', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'UPLOADING', attempt: 1, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: 'column-cache-v1', payloadReceipt: mismatched,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  let uploads = 0
  const harness = schedulerHarness({ repository, uploadOverride: { async upload() { uploads += 1 } } })

  const result = await harness.scheduler.schedule('source-1')

  assert.deepEqual(result, { status: 'FAILED_LOCAL', jobId: 'mismatched-v1-cache', reason: 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH' })
  assert.equal(uploads, 0)
  const current = await repository.get('mismatched-v1-cache')
  assert.equal(current.phase, 'FAILED_LOCAL')
  assert.equal(current.payloadCacheId, 'column-cache-v1')
  assert.equal(current.payloadReceipt.cacheId, 'receipt-cache-v1')
})

test('valid schema-v1 mismatch preserves every server and terminal phase with the real repository', async () => {
  const phases = ['READY', 'SERVER_VALIDATING', 'SERVER_INDEXING', 'FAILED_SERVER']
  for (const phase of phases) {
    const mismatched = { ...receipt, cacheId: `receipt-${phase}` }
    const repository = new DocumentProcessingJobRepository('user-1', 'device-1', { storage: createMemoryStorage() })
    await repository.create({ jobId: `mismatch-${phase}`, sourceId: 'source-1', ingestionRevision: 'revision-1' })
    await repository.transition(`mismatch-${phase}`, 'EXTRACTING')
    await repository.transition(`mismatch-${phase}`, 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
    await repository.transition(`mismatch-${phase}`, 'UPLOADING')
    if (phase !== 'SERVER_VALIDATING') await repository.transition(`mismatch-${phase}`, 'SERVER_VALIDATING')
    if (phase === 'SERVER_INDEXING' || phase === 'READY') await repository.transition(`mismatch-${phase}`, 'SERVER_INDEXING')
    if (phase === 'READY') await repository.transition(`mismatch-${phase}`, 'READY')
    if (phase === 'FAILED_SERVER') await repository.transition(`mismatch-${phase}`, 'FAILED_SERVER')
    await repository.transition(`mismatch-${phase}`, phase, { payloadCacheId: 'column-mismatch', payloadReceipt: mismatched })
    const calls = { upload: 0, deleted: 0 }
    const harness = schedulerHarness({
      repository,
      uploadOverride: { async upload() { calls.upload += 1 } },
      deleteCacheOverride: async () => { calls.deleted += 1 },
    })

    const result = await harness.scheduler.schedule('source-1')

    assert.equal(result.reason, 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH')
    assert.equal(calls.upload, 0)
    assert.equal(calls.deleted, 0)
    const current = await repository.get(`mismatch-${phase}`)
    assert.equal(current.phase, ['SERVER_VALIDATING', 'SERVER_INDEXING'].includes(phase) ? 'FAILED_LOCAL' : phase)
    assert.equal(current.payloadCacheId, 'column-mismatch')
    assert.equal(current.payloadReceipt.cacheId, `receipt-${phase}`)
    assert.equal(current.errorCode, 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH')
    if (phase === 'SERVER_VALIDATING' || phase === 'SERVER_INDEXING') {
      const retry = await harness.scheduler.retry(`mismatch-${phase}`)
      assert.equal(retry.reason, 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH')
      assert.equal((await repository.get(`mismatch-${phase}`)).phase, 'FAILED_LOCAL')
    }
  }
})

test('preflights current cache mismatch after exactly one Source read and before processing work', async () => {
  const repository = new DocumentProcessingJobRepository('user-1', 'device-1', { storage: createMemoryStorage() })
  await repository.create({ jobId: 'preflight-mismatch', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  await repository.transition('preflight-mismatch', 'EXTRACTING')
  await repository.transition('preflight-mismatch', 'PACKAGING', { payloadCacheId: 'column-cache', payloadReceipt: { ...receipt, cacheId: 'receipt-cache' } })
  const counters = { sourceGet: 0, hash: 0, prepare: 0, run: 0, upload: 0, complete: 0, deleted: 0 }
  const scheduler = new SourceJobScheduler({
    repository,
    sourceApi: { async get() { counters.sourceGet += 1; return source() } },
    resolveLocalInput: async () => ({ file: { name: 'x.pdf' } }),
    downloadAsset: async () => ({ file: { name: 'x.pdf' } }),
    hashFile: async () => { counters.hash += 1; return 'f'.repeat(64) },
    prepareInput: async () => { counters.prepare += 1 },
    runJob: async () => { counters.run += 1 },
    upload: { async upload() { counters.upload += 1 } },
    deleteCache: async () => { counters.deleted += 1 },
  })

  const result = await scheduler.schedule('source-1')

  assert.deepEqual(result, { status: 'FAILED_LOCAL', jobId: 'preflight-mismatch', reason: 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH' })
  assert.deepEqual(counters, { sourceGet: 1, hash: 0, prepare: 0, run: 0, upload: 0, complete: 0, deleted: 0 })
  const current = await repository.get('preflight-mismatch')
  assert.equal(current.phase, 'FAILED_LOCAL')
  assert.equal(current.payloadCacheId, 'column-cache')
  assert.equal(current.payloadReceipt.cacheId, 'receipt-cache')
})

test('stale corrupt job does not block a valid current revision with the real repository', async () => {
  const repository = new DocumentProcessingJobRepository('user-1', 'device-1', { storage: createMemoryStorage() })
  await repository.create({ jobId: 'stale-corrupt', sourceId: 'source-1', ingestionRevision: 'revision-stale' })
  await repository.transition('stale-corrupt', 'EXTRACTING')
  await repository.transition('stale-corrupt', 'PACKAGING', {
    payloadCacheId: 'stale-column', payloadReceipt: { ...receipt, cacheId: 'stale-receipt' },
  })
  await repository.create({ jobId: 'current-valid', sourceId: 'source-1', ingestionRevision: 'revision-current' })
  await repository.transition('current-valid', 'EXTRACTING')
  await repository.transition('current-valid', 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
  const deleted = []
  const harness = schedulerHarness({
    repository,
    currentSource: source({ ingestionRevision: 'revision-current' }),
    local: { file: { name: 'current.pdf', type: 'application/pdf', size: 12 } },
    uploadOverride: realRepositoryUpload(repository),
    deleteCacheOverride: async (id) => deleted.push(id),
  })

  const result = await harness.scheduler.schedule('source-1')

  assert.equal(result.status, 'READY')
  const stale = await repository.get('stale-corrupt')
  assert.equal(stale.phase, 'FAILED_LOCAL')
  assert.equal(stale.payloadCacheId, 'stale-column')
  assert.equal(stale.payloadReceipt.cacheId, 'stale-receipt')
  assert.equal((await repository.get('current-valid')).phase, 'READY')
  assert.deepEqual(deleted, [receipt.cacheId])
  assert.equal(deleted.includes('stale-column'), false)
  assert.equal(deleted.includes('stale-receipt'), false)
})

test('legacy cache deletion failure preserves receipt and stable local failure', async () => {
  const legacy = { ...receipt, payloadFormat: undefined, sourceAssetSha256: undefined }
  const repository = createRepository([{
    jobId: 'delete-failure', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-1',
    phase: 'UPLOADING', attempt: 1, checkpoint: { pageNumber: 1, blockOrdinal: 1 }, payloadCacheId: legacy.cacheId, payloadReceipt: legacy,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const harness = schedulerHarness({ repository, deleteCacheOverride: async () => { throw new Error('CACHE_DELETE_FAILED') } })
  const result = await harness.scheduler.schedule('source-1')
  const current = await repository.get('delete-failure')
  assert.equal(result.reason, 'DOCUMENT_LEGACY_CACHE_REBUILD_FAILED')
  assert.equal(current.phase, 'FAILED_LOCAL')
  assert.equal(current.payloadReceipt.cacheId, legacy.cacheId)
})

test('retry scheduling with the real repository parses a queued job that has no receipt', async () => {
  const repository = new DocumentProcessingJobRepository('user-1', 'device-1', { storage: createMemoryStorage() })
  const created = await repository.create({ jobId: 'queued-without-receipt-real', sourceId: 'source-1', ingestionRevision: 'revision-1' })
  let extraction
  extraction = schedulerHarness({
    repository,
    uploadOverride: realRepositoryUpload(repository),
    runJobOverride: async (jobId) => {
      extraction.calls.run += 1
      await repository.transition(jobId, 'EXTRACTING')
      await repository.transition(jobId, 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
    },
  })

  const result = await extraction.scheduler.schedule('source-1')

  assert.equal(result.status, 'READY')
  assert.equal(extraction.calls.run, 1)
  assert.equal(extraction.calls.prepare, 1)
  assert.equal(extraction.calls.hash, 1)
  assert.equal((await repository.get(created.jobId)).phase, 'READY')
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

test('stale cleanup deletes receipt-only cache before clearing the stale job', async () => {
  const staleReceipt = { ...receipt, cacheId: 'stale-receipt-only' }
  const repository = createRepository([{
    jobId: 'stale-receipt-only', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
    phase: 'QUEUED', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: staleReceipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const deleted = []
  const harness = schedulerHarness({ repository, currentSource: source({ ingestionStatus: 'READY' }), deleteCacheOverride: async (id) => deleted.push(id) })
  await harness.scheduler.schedule('source-1')
  assert.deepEqual(deleted, ['stale-receipt-only'])
  assert.equal((await repository.get('stale-receipt-only')).payloadReceipt, null)
})

test('stale cleanup failure preserves mismatched cache evidence', async () => {
  const staleReceipt = { ...receipt, cacheId: 'stale-receipt' }
  const repository = createRepository([{
    jobId: 'stale-cleanup-failure', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
    phase: 'QUEUED', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: 'stale-column', payloadReceipt: staleReceipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const harness = schedulerHarness({ repository, currentSource: source({ ingestionStatus: 'READY' }), deleteCacheOverride: async () => { throw new Error('CACHE_DELETE_FAILED') } })
  await harness.scheduler.schedule('source-1')
  const current = await repository.get('stale-cleanup-failure')
  assert.equal(current.phase, 'FAILED_LOCAL')
  assert.equal(current.errorCode, 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH')
  assert.equal(current.payloadReceipt.cacheId, 'stale-receipt')
  assert.equal(current.payloadCacheId, 'stale-column')
})

test('terminal stale jobs clean derived caches and remain terminal without receipts', async () => {
  for (const phase of ['FAILED_LOCAL', 'FAILED_SERVER', 'READY']) {
    const staleReceipt = { ...receipt, cacheId: `terminal-${phase.toLowerCase()}` }
    const repository = createRepository([{
      jobId: `terminal-${phase}`, userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
      phase, attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: staleReceipt,
      errorCode: phase === 'READY' ? null : 'OLD_FAILURE', errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
    }])
    const deleted = []
    const harness = schedulerHarness({ repository, currentSource: source({ ingestionStatus: 'READY' }), deleteCacheOverride: async (id) => deleted.push(id) })
    await harness.scheduler.schedule('source-1')
    const current = await repository.get(`terminal-${phase}`)
    assert.equal(current.phase, phase)
    assert.equal(current.payloadReceipt, null)
    assert.equal(current.payloadCacheId, null)
    assert.deepEqual(deleted, [staleReceipt.cacheId])
  }
})

test('terminal stale cache cleanup failure preserves receipt and terminal evidence', async () => {
  const staleReceipt = { ...receipt, cacheId: 'terminal-mismatch-receipt' }
  const repository = createRepository([{
    jobId: 'terminal-mismatch', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1', ingestionRevision: 'revision-old',
    phase: 'READY', attempt: 0, checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: 'terminal-mismatch-column', payloadReceipt: staleReceipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24', updatedAt: '2026-08-24',
  }])
  const harness = schedulerHarness({ repository, currentSource: source({ ingestionStatus: 'READY' }), deleteCacheOverride: async () => { throw new Error('CACHE_DELETE_FAILED') } })
  await harness.scheduler.schedule('source-1')
  const current = await repository.get('terminal-mismatch')
  assert.equal(current.phase, 'READY')
  assert.equal(current.errorCode, 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH')
  assert.equal(current.payloadCacheId, 'terminal-mismatch-column')
  assert.equal(current.payloadReceipt.cacheId, 'terminal-mismatch-receipt')
})
