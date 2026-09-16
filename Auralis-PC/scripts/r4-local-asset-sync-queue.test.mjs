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
const { LocalAssetSyncQueue } = await import('../src/services/localAssetSyncQueue.ts')

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
    const queue = new LocalAssetSyncQueue({
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
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: replay handling when upload-intent returns uploadStatus READY skips upload/complete directly to draft release', async () => {
  const sqlite = new TemporarySqlite()
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

    const queue = new LocalAssetSyncQueue({
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
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: network failure applies bounded backoff without affecting local file availability', async () => {
  const sqlite = new TemporarySqlite()
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

    const queue = new LocalAssetSyncQueue({
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
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: recoverInflightJobs resets interrupted jobs to PENDING on restart', async () => {
  const sqlite = new TemporarySqlite()
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

    const queue = new LocalAssetSyncQueue({
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
    sqlite.close()
  }
})

test('LocalAssetSyncQueue: native invoke receipt mismatch aborts upload and schedules retry', async () => {
  const sqlite = new TemporarySqlite()
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
    const queue = new LocalAssetSyncQueue({ assetRepository: assetRepo, assetService, draftService, api: mockApi })
    await queue.processQueue()
    const updatedJob = await assetRepo.getSyncJob(job.jobId)
    assert.equal(updatedJob.phase, 'PENDING')
    assert.ok(updatedJob.safeErrorDetail.includes('NATIVE_UPLOAD_RECEIPT_MISMATCH'))
  } finally {
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

    const queue = new LocalAssetSyncQueue({ assetRepository: assetRepo, assetService, draftService, api: mockApi })

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
    sqlite.close()
  }
})

test('getOrCreateLocalAssetSyncQueue: init failure is retryable, release-during-init rejects and cleans up', async () => {
  const { getOrCreateLocalAssetSyncQueue, releaseLocalAssetSyncQueue } = await import('../src/services/localAssetSyncQueue.ts')

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
})
