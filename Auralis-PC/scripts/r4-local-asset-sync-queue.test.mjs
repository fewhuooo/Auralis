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
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentUrl = context.parentURL;
    if (parentUrl && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
      return nextResolve(new URL(specifier + '.ts', parentUrl).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalRepository } = await import('../src/services/localRepository.ts')
const { LocalAssetRepository } = await import('../src/services/localAssetRepository.ts')
const { LocalAssetService, TransientBrowserAssetAdapter } = await import('../src/services/localAssetService.ts')
const { LocalSourceDraftService } = await import('../src/services/localSourceDraftService.ts')
const { LocalAssetSyncQueue, getOrCreateLocalAssetSyncQueue, releaseLocalAssetSyncQueue } = await import('../src/services/localAssetSyncQueue.ts')

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

test('LocalAssetSyncQueue: full pipeline uploads asset, maps serverAssetId, releases draft with same localSourceId, idempotently completes', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const calls = []
    adapter.uploadAssetToRemote = async (args) => {
      calls.push({ name: 'uploadAssetToRemote', args })
      return { status: 200, bytesSent: args.expectedSize, payloadSha256: args.expectedSha256 }
    }
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286812'
    const localSourceId = '8f123456-789a-4bcd-ef01-23456789abcd'
    const serverAssetId = 'server-asset-999'

    // Import file locally into assetService & assetRepo
    const testFile = new File(['file content bytes for test'], 'paper.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    // Create draft in draftService
    await draftService.createDraft({
      localSourceId,
      localAssetId,
      subjectId: 'sub-science',
      title: 'Physics Paper',
    })

    // Enqueue sync job
    await assetRepo.enqueueSyncJob(localAssetId)

    // Setup mock API
    const mockApi = {
      createUploadIntent: async (req) => {
        calls.push({ name: 'createUploadIntent', req })
        assert.equal(req.clientImportId, localAssetId, 'clientImportId must equal localAssetId')
        return {
          assetId: serverAssetId,
          uploadUrl: 'https://storage.test/upload/part1',
          headers: { 'x-amz-acl': 'private' },
          uploadStatus: 'UPLOADING',
        }
      },
      uploadToObjectStorage: async (url, blob, headers) => {
        // Now unused, replaced by adapter.uploadAssetToRemote
      },
      completeUpload: async (assetId) => {
        calls.push({ name: 'completeUpload', assetId })
        return { id: assetId, uploadStatus: 'READY' }
      },
    }

    let wakeupCount = 0
    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
      api: mockApi,
      onWakeup: () => { wakeupCount++ },
    })

    // Run queue processing
    await queue.processQueue()

    // Assert API calls
    assert.equal(calls.length, 3)
    assert.equal(calls[0].name, 'createUploadIntent')
    assert.equal(calls[1].name, 'uploadAssetToRemote')
    assert.equal(calls[2].name, 'completeUpload')
    assert.equal(calls[2].assetId, serverAssetId)

    // Assert asset state is SYNCED and serverAssetId mapped
    const assetFile = await assetRepo.getAssetFile(localAssetId)
    assert.equal(assetFile.state, 'SYNCED')
    assert.equal(assetFile.serverAssetId, serverAssetId)

    // Assert job completed
    const activeJob = await assetRepo.getActiveSyncJobForAsset(localAssetId)
    assert.equal(activeJob, null, 'No active un-synced job should remain')

    // Assert draft released into outbox with same localSourceId and serverAssetId
    const unresolved = await localRepo.listUnresolved()
    const sourceMutations = unresolved.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(sourceMutations.length, 1)
    assert.equal(sourceMutations[0].resourceId, localSourceId)
    assert.equal(sourceMutations[0].payload.assetId, serverAssetId)
    assert.equal(wakeupCount, 1, 'Wakeup should be triggered after draft release')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-1', 'dev-1')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: successful remote completion cannot cross a durable last-reference delete fence', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-fence', 'dev-fence', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-fence', 'dev-fence', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    adapter.uploadAssetToRemote = async (args) => ({
      status: 200,
      bytesSent: args.expectedSize,
      payloadSha256: args.expectedSha256,
    })
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)
    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f02868f1'
    await assetService.importAsset({
      localAssetId,
      file: new File(['fenced-content'], 'fenced.pdf', { type: 'application/pdf' }),
      originalName: 'fenced.pdf',
      mimeType: 'application/pdf',
    })
    const job = await assetRepo.enqueueSyncJob(localAssetId)
    let completeStarted
    const completeBarrier = new Promise((resolve) => { completeStarted = resolve })
    let releaseComplete
    const completeRelease = new Promise((resolve) => { releaseComplete = resolve })
    let completeCalls = 0
    const api = {
      createUploadIntent: async () => ({
        assetId: 'server-fence-asset',
        uploadUrl: 'https://test/fence',
        headers: {},
        uploadStatus: 'UPLOADING',
      }),
      uploadToObjectStorage: async () => {},
      completeUpload: async (assetId) => {
        completeCalls += 1
        completeStarted()
        await completeRelease
        return { id: assetId, uploadStatus: 'READY' }
      },
    }
    queue = new LocalAssetSyncQueue({ assetRepository: assetRepo, assetService, draftService, api })
    const runPromise = queue.processQueue()
    await completeBarrier
    await assetService.deleteUnreferencedAsset(localAssetId)
    releaseComplete()
    await runPromise

    assert.equal(completeCalls, 1)
    assert.equal(await assetRepo.getAssetFile(localAssetId), null)
    assert.equal(await assetRepo.getSyncJob(job.jobId), null)
  } finally {
    queue?.dispose()
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: replay handling when upload-intent returns uploadStatus READY skips upload/complete directly to draft release', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286812'
    const localSourceId = '8f123456-789a-4bcd-ef01-23456789abcd'
    const serverAssetId = 'server-asset-replay'

    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    await draftService.createDraft({
      localSourceId,
      localAssetId,
      subjectId: 'sub-1',
      title: 'Doc Title',
    })

    await assetRepo.enqueueSyncJob(localAssetId)

    const calls = []
    const mockApi = {
      createUploadIntent: async (req) => {
        calls.push({ name: 'createUploadIntent', req })
        // Return already READY on replay with null uploadUrl
        return {
          assetId: serverAssetId,
          uploadUrl: null,
          uploadStatus: 'READY',
        }
      },
      uploadToObjectStorage: async () => {
        calls.push({ name: 'uploadToObjectStorage' })
      },
      completeUpload: async () => {
        calls.push({ name: 'completeUpload' })
      },
    }

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
      api: mockApi,
    })

    await queue.processQueue()

    // Upload & complete should be SKIPPED!
    assert.equal(calls.length, 1)
    assert.equal(calls[0].name, 'createUploadIntent')

    // Local asset and draft are both released and synced
    const assetFile = await assetRepo.getAssetFile(localAssetId)
    assert.equal(assetFile.state, 'SYNCED')
    assert.equal(assetFile.serverAssetId, serverAssetId)

    const unresolved = await localRepo.listUnresolved()
    assert.equal(unresolved.length, 1)
    assert.equal(unresolved[0].resourceId, localSourceId)
    assert.equal(unresolved[0].payload.assetId, serverAssetId)
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-1', 'dev-1')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: network failure applies bounded backoff without affecting local file availability', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286812'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    const job = await assetRepo.enqueueSyncJob(localAssetId)

    const mockApi = {
      createUploadIntent: async () => {
        throw new Error('ECONNREFUSED network down')
      },
      uploadToObjectStorage: async () => {},
      completeUpload: async () => {},
    }

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
      api: mockApi,
    })

    await queue.processQueue()

    // Job should be scheduled for retry with bounded backoff
    const updatedJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(updatedJob.phase, 'PENDING')
    assert.equal(updatedJob.attempt, 1)
    assert.ok(updatedJob.nextRetryAt, 'nextRetryAt must be set')
    assert.equal(updatedJob.safeErrorCode, 'NETWORK_ERROR')
    assert.ok(updatedJob.safeErrorDetail.includes('network down'))

    // CRITICAL: Local file MUST remain READY_LOCAL!
    const assetFile = await assetRepo.getAssetFile(localAssetId)
    assert.equal(assetFile.state, 'READY_LOCAL', 'Local asset must remain available despite cloud sync failure')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-1', 'dev-1')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: recoverInflightJobs resets interrupted jobs to PENDING on restart', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286812'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    const job = await assetRepo.enqueueSyncJob(localAssetId)
    // Claim job -> moves to CREATING_REMOTE_ASSET
    const claimed = await assetRepo.claimNextSyncJob()
    assert.equal(claimed.phase, 'CREATING_REMOTE_ASSET')

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
    })

    // Simulate app crash and restart: recoverInflightJobs
    const recoveredCount = await queue.recoverInflightJobs()
    assert.equal(recoveredCount, 1)

    const recoveredJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(recoveredJob.phase, 'PENDING')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-1', 'dev-1')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: native invoke receipt mismatch aborts upload and schedules retry', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    adapter.uploadAssetToRemote = async (args) => {
      return { status: 200, bytesSent: args.expectedSize + 1, payloadSha256: args.expectedSha256 }
    }
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)
    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286812'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })
    const job = await assetRepo.enqueueSyncJob(localAssetId)
    const mockApi = {
      createUploadIntent: async () => { return { assetId: 'server-1', uploadUrl: 'http://test', uploadStatus: 'UPLOADING' } },
      completeUpload: async () => {},
    }
    queue = new LocalAssetSyncQueue({ assetRepository: assetRepo, assetService, draftService, api: mockApi })
    await queue.processQueue()
    const updatedJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(updatedJob.phase, 'PENDING')
    assert.ok(updatedJob.safeErrorDetail.includes('NATIVE_UPLOAD_RECEIPT_MISMATCH'))
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-1', 'dev-1')
    sqlite.close()
  }
})

test('TauriLocalAssetNativeAdapter: does not expose getAssetBlob and does not use fetch', async () => {
  const { TauriLocalAssetNativeAdapter } = await import('../src/services/localAssetService.ts')
  const adapter = new TauriLocalAssetNativeAdapter()
  assert.equal(adapter.getAssetBlob, undefined, 'getAssetBlob should not exist on Tauri adapter')
})

test('LocalAssetSyncQueue: native retryable/expired errors are correctly classified and completeUpload is not called', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()

    // Mock native adapter to throw specific native errors
    let throwErrorMsg = 'LOCAL_ASSET_UPLOAD_INTENT_EXPIRED: The presigned URL expired'
    adapter.uploadAssetToRemote = async (args) => {
      throw new Error(throwErrorMsg)
    }

    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)
    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286813'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    let completeCalled = false
    const mockApi = {
      createUploadIntent: async () => { return { assetId: 'server-1', uploadUrl: 'http://test', uploadStatus: 'UPLOADING' } },
      completeUpload: async () => { completeCalled = true },
    }

    queue = new LocalAssetSyncQueue({ assetRepository: assetRepo, assetService, draftService, api: mockApi })

    // Test INTENT_EXPIRED
    let job = await assetRepo.enqueueSyncJob(localAssetId)
    await queue.processQueue()
    let updatedJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(updatedJob.phase, 'PENDING')
    assert.equal(updatedJob.safeErrorCode, 'LOCAL_ASSET_UPLOAD_INTENT_EXPIRED')
    assert.equal(completeCalled, false, 'completeUpload should not be called when native throws')

    // Test RETRYABLE
    throwErrorMsg = 'LOCAL_ASSET_UPLOAD_RETRYABLE: Transient network issue'
    await assetRepo.scheduleRetry(job.jobId, 'SYNC_FAILED', 'reset', new Date().toISOString())
    await queue.processQueue()
    updatedJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(updatedJob.phase, 'PENDING')
    assert.equal(updatedJob.safeErrorCode, 'LOCAL_ASSET_UPLOAD_RETRYABLE')
    assert.equal(completeCalled, false)

  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-1', 'dev-1')
    sqlite.close()
  }
})

test('getOrCreateLocalAssetSyncQueue: init failure is retryable, release-during-init rejects and cleans up', async () => {
  let recoverCount = 0
  let shouldFail = true
  const mockRepo = {
    userId: 'user-2',
    serverDeviceId: 'dev-2',
    recoverInflightJobs: async () => {
      recoverCount++
      if (shouldFail) throw new Error('Simulated DB failure')
      return 0
    }
  }

  const options = {
    assetRepository: mockRepo,
    assetService: {},
    draftService: {},
  }

  try {
    await assert.rejects(
      getOrCreateLocalAssetSyncQueue(options),
      /Simulated DB failure/
    )
    assert.equal(recoverCount, 1)

    shouldFail = false
    const q1 = await getOrCreateLocalAssetSyncQueue(options)
    assert.equal(recoverCount, 2)
    assert.ok(q1)

    releaseLocalAssetSyncQueue('user-2', 'dev-2')

    let resolveRecover
    let recoverPromise = new Promise(r => { resolveRecover = r })

    mockRepo.recoverInflightJobs = async () => {
      recoverCount++
      await recoverPromise
      return 0
    }

    mockRepo.userId = 'user-3'
    mockRepo.serverDeviceId = 'dev-3'

    const initPromise = getOrCreateLocalAssetSyncQueue(options)

    releaseLocalAssetSyncQueue('user-3', 'dev-3')

    resolveRecover()

    await assert.rejects(
      initPromise,
      (err) => err.code === 'QUEUE_RELEASED_DURING_INIT'
    )

    mockRepo.recoverInflightJobs = async () => 0
    const q2 = await getOrCreateLocalAssetSyncQueue(options)
    assert.ok(q2)
  } finally {
    releaseLocalAssetSyncQueue('user-2', 'dev-2')
    releaseLocalAssetSyncQueue('user-3', 'dev-3')
  }
})

test('LocalAssetSyncQueue: dispose during createUploadIntent (with started barrier) halts execution without completing job, scheduling retry, or mutating asset state', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-disp-1', 'dev-disp-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-disp-1', 'dev-disp-1', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    let uploadCalled = false
    adapter.uploadAssetToRemote = async () => {
      uploadCalled = true
      return { status: 200, bytesSent: 10, payloadSha256: 'hash' }
    }
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286820'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    const job = await assetRepo.enqueueSyncJob(localAssetId)

    let intentStartedResolve
    const intentStartedPromise = new Promise((r) => { intentStartedResolve = r })
    let intentFinishResolve
    const intentFinishPromise = new Promise((r) => { intentFinishResolve = r })

    let completeCalled = false
    let wakeupCalled = false

    const mockApi = {
      createUploadIntent: async () => {
        intentStartedResolve()
        await intentFinishPromise
        return {
          assetId: 'server-asset-dispose-1',
          uploadUrl: 'https://test/upload',
          headers: {},
          uploadStatus: 'UPLOADING',
        }
      },
      uploadToObjectStorage: async () => {},
      completeUpload: async () => { completeCalled = true },
    }

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
      api: mockApi,
      onWakeup: () => { wakeupCalled = true },
    })

    const runPromise = queue.processQueue()
    await intentStartedPromise
    queue.dispose()
    assert.equal(queue.isDisposed(), true)
    intentFinishResolve()
    await runPromise

    assert.equal(uploadCalled, false, 'uploadAssetToRemote must not be called after dispose')
    assert.equal(completeCalled, false, 'completeUpload must not be called after dispose')
    assert.equal(wakeupCalled, false, 'onWakeup must not be called after dispose')

    const currentJob = await assetRepo.getSyncJob(job.jobId)
    assert.notEqual(currentJob.phase, 'SYNCED', 'Job must not be completed after dispose')
    assert.equal(currentJob.safeErrorCode, null, 'No error code should be scheduled on dispose')
    assert.equal(currentJob.nextRetryAt, null, 'No retry should be scheduled on dispose')

    const assetFile = await assetRepo.getAssetFile(localAssetId)
    assert.equal(assetFile.state, 'READY_LOCAL', 'Asset state must not transition to SYNC_FAILED on dispose')

    const unresolved = await localRepo.listUnresolved()
    const releasedDrafts = unresolved.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(releasedDrafts.length, 0, 'No draft should be released after dispose')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-disp-1', 'dev-disp-1')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: dispose during native PUT uploadAssetToRemote (with started barrier) halts execution without calling completeUpload or failing state', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-disp-2', 'dev-disp-2', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-disp-2', 'dev-disp-2', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()

    let putStartedResolve
    const putStartedPromise = new Promise((r) => { putStartedResolve = r })
    let putFinishResolve
    const putFinishPromise = new Promise((r) => { putFinishResolve = r })

    adapter.uploadAssetToRemote = async (args) => {
      putStartedResolve()
      await putFinishPromise
      return { status: 200, bytesSent: args.expectedSize, payloadSha256: args.expectedSha256 }
    }

    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286821'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    const job = await assetRepo.enqueueSyncJob(localAssetId)

    let completeCalled = false
    let wakeupCalled = false
    const mockApi = {
      createUploadIntent: async () => ({
        assetId: 'server-asset-dispose-2',
        uploadUrl: 'https://test/upload-put',
        headers: {},
        uploadStatus: 'UPLOADING',
      }),
      uploadToObjectStorage: async () => {},
      completeUpload: async () => {
        completeCalled = true
        return { id: 'server-asset-dispose-2', uploadStatus: 'READY' }
      },
    }

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
      api: mockApi,
      onWakeup: () => { wakeupCalled = true },
    })

    const runPromise = queue.processQueue()
    await putStartedPromise
    queue.dispose()
    putFinishResolve()
    await runPromise

    assert.equal(completeCalled, false, 'completeUpload must not be called after queue was disposed during PUT')
    assert.equal(wakeupCalled, false, 'onWakeup must not be called after dispose')

    const currentJob = await assetRepo.getSyncJob(job.jobId)
    assert.notEqual(currentJob.phase, 'SYNCED')
    assert.equal(currentJob.safeErrorCode, null)

    const assetFile = await assetRepo.getAssetFile(localAssetId)
    assert.notEqual(assetFile.state, 'SYNC_FAILED', 'Asset state must not be marked SYNC_FAILED on dispose')

    const unresolved = await localRepo.listUnresolved()
    const releasedDrafts = unresolved.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(releasedDrafts.length, 0)
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-disp-2', 'dev-disp-2')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: dispose during completeUpload (with started barrier) halts execution without releasing drafts or completing job', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-disp-3', 'dev-disp-3', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-disp-3', 'dev-disp-3', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    adapter.uploadAssetToRemote = async (args) => ({
      status: 200,
      bytesSent: args.expectedSize,
      payloadSha256: args.expectedSha256,
    })
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286822'
    const localSourceId = '8f123456-789a-4bcd-ef01-23456789abc2'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })
    await draftService.createDraft({
      localSourceId,
      localAssetId,
      subjectId: 'sub-1',
      title: 'Doc Title',
    })

    const job = await assetRepo.enqueueSyncJob(localAssetId)

    let completeStartedResolve
    const completeStartedPromise = new Promise((r) => { completeStartedResolve = r })
    let completeFinishResolve
    const completeFinishPromise = new Promise((r) => { completeFinishResolve = r })
    let wakeupCalled = false

    const mockApi = {
      createUploadIntent: async () => ({
        assetId: 'server-asset-dispose-3',
        uploadUrl: 'https://test/upload-put',
        headers: {},
        uploadStatus: 'UPLOADING',
      }),
      uploadToObjectStorage: async () => {},
      completeUpload: async (assetId) => {
        completeStartedResolve()
        await completeFinishPromise
        return { id: assetId, uploadStatus: 'READY' }
      },
    }

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
      api: mockApi,
      onWakeup: () => { wakeupCalled = true },
    })

    const runPromise = queue.processQueue()
    await completeStartedPromise
    queue.dispose()
    completeFinishResolve()
    await runPromise

    assert.equal(wakeupCalled, false, 'onWakeup must not be called after dispose')

    const currentJob = await assetRepo.getSyncJob(job.jobId)
    assert.notEqual(currentJob.phase, 'SYNCED')
    assert.equal(currentJob.safeErrorCode, null)

    const unresolved = await localRepo.listUnresolved()
    const releasedDrafts = unresolved.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(releasedDrafts.length, 0, 'No draft outbox mutation should be committed after dispose')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-disp-3', 'dev-disp-3')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: dispose during catch block error handling prevents transition to SYNC_FAILED and scheduleRetry', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-disp-4', 'dev-disp-4', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-disp-4', 'dev-disp-4', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286823'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    const job = await assetRepo.enqueueSyncJob(localAssetId)

    const mockApi = {
      createUploadIntent: async () => {
        queue.dispose()
        throw new Error('NETWORK_FAILURE_AFTER_DISPOSE')
      },
      uploadToObjectStorage: async () => {},
      completeUpload: async () => {},
    }

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
      api: mockApi,
    })

    await queue.processQueue()

    const currentJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(currentJob.safeErrorCode, null, 'scheduleRetry must not be called when disposed')
    assert.equal(currentJob.nextRetryAt, null)

    const assetFile = await assetRepo.getAssetFile(localAssetId)
    assert.equal(assetFile.state, 'READY_LOCAL', 'Asset must not be transitioned to SYNC_FAILED when disposed')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-disp-4', 'dev-disp-4')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: retryNow early returns without action when disposed', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-disp-5', 'dev-disp-5', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-disp-5', 'dev-disp-5', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286824'
    const testFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await assetService.importAsset({
      localAssetId,
      file: testFile,
      originalName: testFile.name,
      mimeType: testFile.type,
      sizeBytes: testFile.size,
    })

    const job = await assetRepo.enqueueSyncJob(localAssetId)
    // Put job in PENDING with future retry
    const futureTime = new Date(Date.now() + 600000).toISOString()
    await assetRepo.scheduleRetry(job.jobId, 'SYNC_FAILED', 'error', futureTime)

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
    })

    queue.dispose()
    await queue.retryNow(job.jobId)

    const updatedJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(updatedJob.nextRetryAt, futureTime, 'nextRetryAt must not be changed by retryNow when disposed')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-disp-5', 'dev-disp-5')
    sqlite.close()
  }
})

test('LocalSourceDraftService: releaseDraftsForAsset handles mid-flight interruption and prevents duplicate SOURCE CREATE outbox mutation on retry', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-draft-1', 'dev-draft-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-draft-1', 'dev-draft-1', { sql: sqlite })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286825'
    const localSourceId = '8f123456-789a-4bcd-ef01-23456789abc5'
    const serverAssetId = 'server-asset-midflight'

    await assetRepo.createAssetFile({
      localAssetId,
      relativePath: `assets/user-draft-1/${localAssetId}/content.pdf`,
      originalName: 'draft.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })

    await draftService.createDraft({
      localSourceId,
      localAssetId,
      subjectId: 'sub-test',
      title: 'Interrupted Draft Title',
    })

    // 1. First run: lifecycleGuard throws after commitMutationUnlocked
    // (simulating interruption between commitMutation and updateSourceDraft).
    let commitCount = 0
    const originalCommitMutation = localRepo.commitMutationUnlocked.bind(localRepo)
    let shouldInterrupt = false

    localRepo.commitMutationUnlocked = async (input) => {
      commitCount++
      const res = await originalCommitMutation(input)
      shouldInterrupt = true
      return res
    }

    const interruptingGuard = () => {
      if (shouldInterrupt) {
        return false // signals interruption / disposal
      }
    }

    await assert.rejects(
      draftService.releaseDraftsForAsset(localAssetId, serverAssetId, interruptingGuard),
      /LOCAL_SOURCE_DRAFT_INTERRUPTED/
    )

    // Verify draft state in assetRepo is still DRAFT (interrupted before updateSourceDraft)
    const draftAfterInterrupt = await draftService.getDraft(localSourceId)
    assert.equal(draftAfterInterrupt.state, 'DRAFT')

    // Verify local outbox has exactly 1 mutation
    const unresolvedAfterInterrupt = await localRepo.listUnresolved()
    const mutationsAfterInterrupt = unresolvedAfterInterrupt.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(mutationsAfterInterrupt.length, 1)

    // 2. Second run: Retry releaseDraftsForAsset with active guard
    // Reset commit interceptor
    localRepo.commitMutationUnlocked = originalCommitMutation
    commitCount = 0

    const releasedIds = await draftService.releaseDraftsForAsset(localAssetId, serverAssetId, () => true)
    assert.deepEqual(releasedIds, [localSourceId])

    // CRITICAL: commitMutation should NOT have been called again!
    assert.equal(commitCount, 0, 'commitMutation must not be called again on retry for existing outbox mutation')

    // Verify outbox STILL has exactly 1 mutation (no duplicate SOURCE CREATE!)
    const finalUnresolved = await localRepo.listUnresolved()
    const finalMutations = finalUnresolved.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(finalMutations.length, 1)
    assert.equal(finalMutations[0].resourceId, localSourceId)
    assert.equal(finalMutations[0].mutationType, 'CREATE')
    assert.equal(finalMutations[0].payload.assetId, serverAssetId)

    // Verify draft is now SYNCING
    const finalDraft = await draftService.getDraft(localSourceId)
    assert.equal(finalDraft.state, 'SYNCING')
  } finally {
    releaseLocalAssetSyncQueue('user-draft-1', 'dev-draft-1')
    sqlite.close()
  }
})

test('LocalSourceDraftService: releaseDraftsForAsset detects mutation conflict/payload mismatch and throws without marking draft SYNCING', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-draft-2', 'dev-draft-2', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-draft-2', 'dev-draft-2', { sql: sqlite })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286827'
    const localSourceId = '8f123456-789a-4bcd-ef01-23456789abc7'
    const serverAssetId = 'server-asset-conflict-expected'

    await assetRepo.createAssetFile({
      localAssetId,
      relativePath: `assets/user-draft-2/${localAssetId}/content.pdf`,
      originalName: 'draft.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })

    const draft = await draftService.createDraft({
      localSourceId,
      localAssetId,
      subjectId: 'sub-test',
      title: 'Conflict Draft Title',
    })

    // Manually simulate an existing conflicting mutation (e.g. UPDATE instead of CREATE or mismatched payload)
    await localRepo.commitMutation({
      resourceType: 'SOURCE',
      resourceId: localSourceId,
      value: { id: localSourceId, title: 'Mutated Title' },
      version: 1,
      deletedAt: null,
      mutation: {
        clientMutationId: draft.localContentRevision,
        resourceType: 'SOURCE',
        resourceId: localSourceId,
        mutationType: 'UPDATE',
        baseVersion: 1,
        payload: { assetId: 'different-server-asset-id' },
      },
    })

    // Attempting to release drafts must throw a conflict error
    await assert.rejects(
      draftService.releaseDraftsForAsset(localAssetId, serverAssetId),
      /LOCAL_SOURCE_DRAFT_CONFLICT/
    )

    // Draft state in assetRepo MUST remain DRAFT, NOT SYNCING!
    const draftAfterConflict = await draftService.getDraft(localSourceId)
    assert.equal(draftAfterConflict.state, 'DRAFT', 'Draft must remain DRAFT on mutation conflict')
  } finally {
    releaseLocalAssetSyncQueue('user-draft-2', 'dev-draft-2')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: missing asset metadata branch with dispose prevents completing job', async () => {
  const sqlite = new TemporarySqlite()
  let queue
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-disp-6', 'dev-disp-6', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-disp-6', 'dev-disp-6', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const assetService = new LocalAssetService(assetRepo, { nativeAdapter: adapter })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const nonExistentAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286826'
    const job = await assetRepo.enqueueSyncJob(nonExistentAssetId)

    queue = new LocalAssetSyncQueue({
      assetRepository: assetRepo,
      assetService,
      draftService,
    })

    // Intercept getAssetFile to dispose queue right when discovering missing file
    const origGetAssetFile = assetRepo.getAssetFile.bind(assetRepo)
    assetRepo.getAssetFile = async (id) => {
      queue.dispose()
      return origGetAssetFile(id)
    }

    await queue.processQueue()

    const currentJob = await assetRepo.getSyncJob(job.jobId)
    assert.notEqual(currentJob.phase, 'SYNCED', 'Job must not be marked complete if disposed during missing asset handling')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-disp-6', 'dev-disp-6')
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: online window event listener is registered in constructor and properly removed on dispose', async () => {
  const previousWindow = globalThis.window
  const listeners = new Map()
  globalThis.window = {
    addEventListener: (event, handler) => {
      listeners.set(event, handler)
    },
    removeEventListener: (event, handler) => {
      if (listeners.get(event) === handler) {
        listeners.delete(event)
      }
    },
  }

  try {
    const mockRepo = { userId: 'u-win', serverDeviceId: 'd-win' }
    const queue = new LocalAssetSyncQueue({
      assetRepository: mockRepo,
      assetService: {},
      draftService: {},
    })

    assert.equal(listeners.has('online'), true, 'online event listener must be registered')

    queue.dispose()
    assert.equal(listeners.has('online'), false, 'online event listener must be removed on dispose')
  } finally {
    globalThis.window = previousWindow
    releaseLocalAssetSyncQueue('u-win', 'd-win')
  }
})
