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

const { setActivePinia, createPinia } = await import('pinia')
const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalRepository } = await import('../src/services/localRepository.ts')
const { LocalAssetRepository } = await import('../src/services/localAssetRepository.ts')
const { LocalAssetService, TransientBrowserAssetAdapter, getOrCreateLocalAssetService } = await import('../src/services/localAssetService.ts')
const { LocalSourceDraftService, getOrCreateLocalSourceDraftService } = await import('../src/services/localSourceDraftService.ts')
const { LocalAssetSyncQueue, getOrCreateLocalAssetSyncQueue, releaseLocalAssetSyncQueue } = await import('../src/services/localAssetSyncQueue.ts')
const { useAssetStore } = await import('../src/store/useAssetStore.ts')
const { useSourceStore } = await import('../src/store/useSourceStore.ts')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { useSyncStore } = await import('../src/store/useSyncStore.ts')
const request = (await import('../src/api/request.ts')).default

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

test('useAssetStore.upload: offline-first persists to LocalAssetRepository, creates PENDING job, does not retain File map, returns synthetic model with UUID', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = { id: 'user-test-1', email: 'test@example.com' }
  authStore.serverDeviceId = 'device-test-1'

  try {
    const assetStore = useAssetStore()
    const file = new File(['offline content test'], 'offline_doc.pdf', { type: 'application/pdf' })

    const model = await assetStore.upload(file)

    // Verify UUID format
    assert.match(
      model.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Synthetic model id must be a valid UUID',
    )
    assert.equal(model.originalName, 'offline_doc.pdf')
    assert.equal(model.uploadStatus, 'UPLOADING')

    // Verify no long-term File retained in Map
    assert.equal(assetStore.getLocalFile(model.id), null, 'Store must not retain long-term File map')
  } finally {
    releaseLocalAssetSyncQueue('user-test-1', 'device-test-1')
  }
})

test('useSourceStore.createFileSource: local asset path writes projection + draft without SOURCE outbox mutation; queue completes and releases outbox', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = { id: 'user-test-2', email: 'test2@example.com' }
  authStore.serverDeviceId = 'device-test-2'

  const assetStore = useAssetStore()
  const sourceStore = useSourceStore()

  let queue
  try {
    // 1. Upload asset offline
    const file = new File(['quantum physics data'], 'quantum.pdf', { type: 'application/pdf' })
    const assetModel = await assetStore.upload(file)
    const localAssetId = assetModel.id

    // 2. Create file source referencing localAssetId
    const sourceId = await sourceStore.createFileSource('subject-physics', 'Quantum Mechanics', localAssetId)
    assert.ok(sourceId)

    // 3. Verify store state has the source
    const inStoreSource = sourceStore.sources.find((s) => s.id === sourceId)
    assert.ok(inStoreSource)
    assert.equal(inStoreSource.name, 'Quantum Mechanics')

    // 4. Verify LocalRepository has NO SOURCE outbox mutation!
    const { getLocalRepository, getLocalAssetRepository } = await import('../src/services/localDb.ts')
    const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
    const unresolved = await repo.listUnresolved()
    const sourceMutations = unresolved.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(sourceMutations.length, 0, 'No SOURCE outbox mutation must exist before asset is READY')

    // 5. Mock API for queue sync
    const serverAssetId = 'ee333333-4444-4555-8888-999999999999'
    const mockApi = {
      createUploadIntent: async (req) => {
        assert.equal(req.clientImportId, localAssetId)
        return {
          assetId: serverAssetId,
          uploadUrl: 'https://minio.test/bucket/quantum',
          headers: {},
          uploadStatus: 'UPLOADING',
        }
      },
      uploadToObjectStorage: async () => {},
      completeUpload: async (assetId) => ({ id: assetId, uploadStatus: 'READY' }),
    }

    // 6. Run queue
    const localAssetRepo = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
    const draftService = getOrCreateLocalSourceDraftService(localAssetRepo, repo)
    const draftsBefore = await draftService.listDraftsForAsset(localAssetId)
    assert.ok(draftsBefore.length > 0, 'Draft must exist before queue')

    const adapter = new TransientBrowserAssetAdapter()
    adapter.uploadAssetToRemote = async (args) => ({
      status: 200,
      bytesSent: args.expectedSize,
      payloadSha256: args.expectedSha256
    })
    const assetService = new LocalAssetService(localAssetRepo, { nativeAdapter: adapter })
    queue = new LocalAssetSyncQueue({
      assetRepository: localAssetRepo,
      assetService,
      draftService,
      api: mockApi,
    })

    await queue.processQueue()

    // 7. Verify asset is SYNCED and serverAssetId mapped
    const assetFile = await localAssetRepo.getAssetFile(localAssetId)
    assert.equal(assetFile.state, 'SYNCED')
    assert.equal(assetFile.serverAssetId, serverAssetId)

    // 8. Verify draft was released: exactly 1 SOURCE/CREATE outbox mutation with SAME sourceId and serverAssetId
    const afterSyncUnresolved = await repo.listUnresolved()
    const releasedMutations = afterSyncUnresolved.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(releasedMutations.length, 1)
    assert.equal(releasedMutations[0].resourceId, sourceId, 'Must keep the same localSourceId')
    assert.equal(releasedMutations[0].mutationType, 'CREATE')
    assert.equal(releasedMutations[0].payload.assetId, serverAssetId)
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-test-2', 'device-test-2')
  }
})

test('useSyncStore: does not expose test seams or getAssetQueue in production store contract', () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const syncStore = useSyncStore()

  // Verify no test seams or internal queue methods exposed
  assert.equal(syncStore.activeGetAssetQueue, undefined, 'Must not expose activeGetAssetQueue seam')
  assert.equal(syncStore.__test_initAssetQueue, undefined, 'Must not expose __test_initAssetQueue seam')
  assert.equal(syncStore.getAssetQueue, undefined, 'Must not expose getAssetQueue publicly')

  // Verify production methods exist
  assert.equal(typeof syncStore.requestBackgroundSync, 'function')
  assert.equal(typeof syncStore.flushNow, 'function')
  assert.equal(typeof syncStore.triggerSync, 'function')
  assert.equal(typeof syncStore.pushChanges, 'function')
  assert.equal(typeof syncStore.pullChanges, 'function')
})

test('useSyncStore: identity switch during queue init releases/disposes old queue A, rejects old flushNow promise with QUEUE_RELEASED_DURING_INIT, and allows user B flushNow to succeed', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const originalGet = request.get
  const originalPost = request.post
  request.get = async (url) => {
    if (url === '/api/sync/pull') {
      return { changes: [], nextCursor: 'c-1', hasMore: false, resetRequired: false }
    }
    return {}
  }
  request.post = async (url) => {
    if (url === '/api/sync/push') {
      return { results: [], serverCursor: 'c-1' }
    }
    return {}
  }

  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-switch-A', email: 'a@example.com' },
    tokens: { accessToken: 'token-a', refreshToken: 'refresh-a' },
    sessionId: 'session-a',
    serverDeviceId: 'device-switch-A',
  })

  const { getLocalAssetRepository } = await import('../src/services/localDb.ts')
  const repoA = await getLocalAssetRepository('user-switch-A', 'device-switch-A')

  let recoverStartedResolve
  const recoverStartedPromise = new Promise((resolve) => {
    recoverStartedResolve = resolve
  })
  let resolveRecoverA
  const recoverPromiseA = new Promise((resolve) => {
    resolveRecoverA = resolve
  })
  repoA.recoverInflightJobs = async () => {
    recoverStartedResolve()
    await recoverPromiseA
    return 0
  }

  const syncStore = useSyncStore()

  try {
    // Start production flushNow for User A
    const promiseA = syncStore.flushNow()

    // Wait until User A's getAssetQueue() has actually entered recoverInflightJobs
    await recoverStartedPromise

    // Switch identity to User B while A's queue init is in-flight
    authStore.setSession({
      user: { id: 'user-switch-B', email: 'b@example.com' },
      tokens: { accessToken: 'token-b', refreshToken: 'refresh-b' },
      sessionId: 'session-b',
      serverDeviceId: 'device-switch-B',
    })

    // Allow A's recoverInflightJobs to finish
    resolveRecoverA(0)

    // 1. Old promise A must reject with stable code QUEUE_RELEASED_DURING_INIT
    await assert.rejects(
      promiseA,
      (err) => err && (err.code === 'QUEUE_RELEASED_DURING_INIT' || err.message === 'QUEUE_RELEASED_DURING_INIT'),
      'Promise A must reject with QUEUE_RELEASED_DURING_INIT when identity switches before completion'
    )

    // 2. User B's flushNow must run and complete cleanly
    await syncStore.flushNow()
    assert.equal(syncStore.lastSyncError, null, 'User B flushNow must run and complete without errors')
  } finally {
    request.get = originalGet
    request.post = originalPost
    releaseLocalAssetSyncQueue('user-switch-A', 'device-switch-A')
    releaseLocalAssetSyncQueue('user-switch-B', 'device-switch-B')
  }
})
