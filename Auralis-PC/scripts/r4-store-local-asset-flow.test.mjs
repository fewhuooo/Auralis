import assert from 'node:assert/strict'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import axios from 'axios'

let activeAssetFlowAdapter = async (config) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
axios.defaults.adapter = (config) => activeAssetFlowAdapter(config)

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForSignal(promise, label, timeoutMs = 300) {
  let timer
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  const signaled = promise.then(() => true)
  const result = await Promise.race([signaled, timedOut])
  clearTimeout(timer)
  assert.equal(result, true, `Timed out waiting for ${label}`)
}

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
const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts')
const { LocalAssetRepository } = await import('../src/services/localAssetRepository.ts')
const { LocalAssetService, TransientBrowserAssetAdapter, getOrCreateLocalAssetService } = await import('../src/services/localAssetService.ts')
const { LocalSourceDraftService, getOrCreateLocalSourceDraftService } = await import('../src/services/localSourceDraftService.ts')
const { LocalAssetSyncQueue, getOrCreateLocalAssetSyncQueue, releaseLocalAssetSyncQueue } = await import('../src/services/localAssetSyncQueue.ts')
const { OverviewRepository } = await import('../src/services/overviewRepository.ts')
const { useAssetStore } = await import('../src/store/useAssetStore.ts')
const { useSourceStore } = await import('../src/store/useSourceStore.ts')
const { useSubjectStore } = await import('../src/store/useSubjectStore.ts')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { useSyncStore } = await import('../src/store/useSyncStore.ts')
const { useDocumentProcessingStore } = await import('../src/store/useDocumentProcessingStore.ts')
const { publishProjectionChange } = await import('../src/services/localProjectionEvents.ts')
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

test('useAssetStore resolves localAssetId and serverAssetId locally before any download request', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = { id: 'user-local-first', email: 'local@example.com' }
  authStore.serverDeviceId = 'device-local-first'
  const assetStore = useAssetStore()
  const originalFetch = globalThis.fetch

  try {
    const model = await assetStore.upload(new File(['offline preview bytes'], 'preview.pdf', { type: 'application/pdf' }))
    const localRepo = await (await import('../src/services/localDb.ts')).getLocalAssetRepository(
      authStore.user.id,
      authStore.serverDeviceId,
    )
    await localRepo.mapServerAssetId(model.id, 'server-local-first')
    globalThis.fetch = async () => { throw new Error('NETWORK_MUST_NOT_BE_USED_FOR_LOCAL_ASSET') }

    const local = await assetStore.resolveLocalFile('server-local-first', 'preview.pdf', 'application/pdf')
    assert.ok(local)
    assert.equal(await local.file.text(), 'offline preview bytes')
    const input = await assetStore.resolveSourceInput('server-local-first', 'preview.pdf', 'application/pdf')
    assert.equal(await input.file.text(), 'offline preview bytes')

    authStore.user = { id: 'user-local-first-other', email: 'other@example.com' }
    authStore.serverDeviceId = 'device-local-first-other'
    assert.equal(await assetStore.resolveLocalFile(model.id, 'preview.pdf', 'application/pdf'), null)
  } finally {
    globalThis.fetch = originalFetch
    releaseLocalAssetSyncQueue('user-local-first', 'device-local-first')
  }
})

test('useAssetStore falls back only for a missing local asset and fences an owner switch during response.blob', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.user = { id: 'user-download-fence-a', email: 'a@example.com' }
  authStore.serverDeviceId = 'device-download-fence-a'
  const assetStore = useAssetStore()
  const originalPost = request.post
  const originalFetch = globalThis.fetch
  let blobStartedResolve
  const blobStarted = new Promise((resolve) => { blobStartedResolve = resolve })
  let releaseBlob
  const blobRelease = new Promise((resolve) => { releaseBlob = resolve })

  request.post = async (url) => {
    assert.match(url, /\/api\/assets\/server-only-asset\/download-url/)
    return { url: 'https://object.test/server-only-asset' }
  }
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://object.test/server-only-asset')
    return {
      ok: true,
      status: 200,
      blob: async () => {
        blobStartedResolve()
        await blobRelease
        return new Blob(['server bytes'], { type: 'application/pdf' })
      },
    }
  }

  try {
    const pending = assetStore.resolveSourceInput('server-only-asset', 'server.pdf', 'application/pdf')
    await blobStarted
    authStore.user = { id: 'user-download-fence-b', email: 'b@example.com' }
    authStore.serverDeviceId = 'device-download-fence-b'
    releaseBlob()
    await assert.rejects(pending, /ASSET_IDENTITY_CHANGED/)

    authStore.user = { id: 'user-download-fence-a', email: 'a@example.com' }
    authStore.serverDeviceId = 'device-download-fence-a'
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['fallback bytes'], { type: 'application/pdf' }),
    })
    const fallback = await assetStore.resolveSourceInput('server-only-asset', 'server.pdf', 'application/pdf')
    assert.equal(await fallback.file.text(), 'fallback bytes')
  } finally {
    request.post = originalPost
    globalThis.fetch = originalFetch
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
    assert.equal(releasedMutations[0].payload.subjectId, 'subject-physics')
  } finally {
    queue?.dispose()
    releaseLocalAssetSyncQueue('user-test-2', 'device-test-2')
  }
})

test('useSourceStore keeps imported and hydrated projections scoped to the requested subject, including an empty subject', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = { id: 'user-subject-scope', email: 'scope@example.com' }
  authStore.serverDeviceId = 'device-subject-scope'

  const assetStore = useAssetStore()
  const sourceStore = useSourceStore()
  const subjectStore = useSubjectStore()

  try {
    const subjectAAsset = await assetStore.upload(new File(['subject A'], 'subject-a.pdf', { type: 'application/pdf' }))
    await sourceStore.createFileSource('subject-a', 'Subject A file', subjectAAsset.id)
    subjectStore.setActiveSubject('subject-a')
    await sourceStore.loadLocalSourceFiles('subject-a')
    assert.equal(subjectStore.activeSubjectId, 'subject-a')
    assert.deepEqual(sourceStore.activeSourceFiles.map((source) => source.subjectId), ['subject-a'])

    const subjectBAsset = await assetStore.upload(new File(['subject B'], 'subject-b.pdf', { type: 'application/pdf' }))
    const subjectBSourceId = await sourceStore.createFileSource('subject-b', 'Subject B file', subjectBAsset.id)
    const { getLocalRepository, getLocalAssetRepository } = await import('../src/services/localDb.ts')
    const sourceRepository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
    const assetRepository = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
    assert.equal((await sourceRepository.read('SOURCE', subjectBSourceId)).value.subjectId, 'subject-b')
    assert.equal((await assetRepository.getSourceDraft(subjectBSourceId)).subjectId, 'subject-b')

    assert.deepEqual(sourceStore.activeSourceFiles.map((source) => source.subjectId), ['subject-a'])
    assert.equal(sourceStore.sources.some((source) => source.id === subjectBSourceId && source.subjectId === 'subject-b'), true)

    await sourceStore.loadLocalSourceFiles('subject-empty')
    assert.deepEqual(sourceStore.activeSourceFiles, [])
    await sourceStore.loadSources()
    assert.deepEqual(sourceStore.activeSourceFiles, [])
  } finally {
    releaseLocalAssetSyncQueue('user-subject-scope', 'device-subject-scope')
  }
})

test('useSourceStore ignores a stale subject load that resolves after the current subject', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = { id: 'user-subject-load-race', email: 'race@example.com' }
  authStore.serverDeviceId = 'device-subject-load-race'

  const assetStore = useAssetStore()
  const sourceStore = useSourceStore()
  const subjectStore = useSubjectStore()

  try {
    const subjectAAsset = await assetStore.upload(new File(['race A'], 'race-a.pdf', { type: 'application/pdf' }))
    await sourceStore.createFileSource('subject-a', 'Race A file', subjectAAsset.id)
    const subjectBAsset = await assetStore.upload(new File(['race B'], 'race-b.pdf', { type: 'application/pdf' }))
    await sourceStore.createFileSource('subject-b', 'Race B file', subjectBAsset.id)
    await sourceStore.loadLocalSourceFiles('subject-a')

    const { getLocalRepository } = await import('../src/services/localDb.ts')
    const repository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
    const originalList = repository.list.bind(repository)
    let listCalls = 0
    let releaseSubjectA
    const subjectARelease = new Promise((resolve) => { releaseSubjectA = resolve })
    let subjectAStartedResolve
    const subjectAStarted = new Promise((resolve) => { subjectAStartedResolve = resolve })
    let subjectAFinishedResolve
    const subjectAFinished = new Promise((resolve) => { subjectAFinishedResolve = resolve })
    let subjectBResolvedResolve
    const subjectBResolved = new Promise((resolve) => { subjectBResolvedResolve = resolve })
    repository.list = async (...args) => {
      const rows = await originalList(...args)
      const callNumber = listCalls++
      if (callNumber === 0) {
        subjectAStartedResolve()
        await subjectARelease
        subjectAFinishedResolve()
      } else if (callNumber === 1) {
        subjectBResolvedResolve()
      }
      return rows
    }

    const staleSubjectALoad = sourceStore.loadLocalSourceFiles('subject-a')
    await subjectAStarted
    subjectStore.setActiveSubject('subject-empty')
    assert.deepEqual(sourceStore.activeSourceFiles, [])
    await subjectBResolved
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(subjectStore.activeSubjectId, 'subject-empty')
    assert.deepEqual(sourceStore.activeSourceFiles, [])

    releaseSubjectA()
    await subjectAFinished
    const staleSubjectAResult = await staleSubjectALoad
    assert.deepEqual(staleSubjectAResult, [])
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual(sourceStore.activeSourceFiles, [])
    repository.list = originalList
  } finally {
    releaseLocalAssetSyncQueue('user-subject-load-race', 'device-subject-load-race')
  }
})

test('useSourceStore.deleteSourceFile: local-only tombstone releases draft and immediately removes last local asset', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = { id: 'user-local-delete', email: 'delete@example.com' }
  authStore.serverDeviceId = 'device-local-delete'
  const assetStore = useAssetStore()
  const sourceStore = useSourceStore()

  try {
    const assetModel = await assetStore.upload(new File(['delete me'], 'delete.pdf', { type: 'application/pdf' }))
    const localAssetId = assetModel.id
    const sourceId = await sourceStore.createFileSource('subject-delete', 'Delete me', localAssetId)
    const { getLocalRepository, getLocalAssetRepository } = await import('../src/services/localDb.ts')
    const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
    const assetRepo = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
    await sourceStore.deleteSourceFile(sourceId)

    const source = await repo.read('SOURCE', sourceId)
    const draft = await assetRepo.getSourceDraft(sourceId)
    const asset = await assetRepo.getAssetFile(localAssetId)
    assert.equal(source?.deletedAt !== null, true, 'local-only Source must persist a durable tombstone')
    assert.equal(draft?.state, 'DELETED', 'local-only draft must be released after the tombstone')
    assert.equal(asset, null, 'last local-only Source deletion must remove the managed Asset immediately')
    assert.equal((await repo.listUnresolved()).filter((mutation) => mutation.resourceType === 'SOURCE').length, 0)
  } finally {
    releaseLocalAssetSyncQueue('user-local-delete', 'device-local-delete')
  }
})

test('useSourceStore.deleteSourceFile: a pre-commit failure keeps the Source visible and preserves its Overview cache and request', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-source-delete-failure', email: 'delete-failure@example.com' },
    tokens: { accessToken: 'token-delete-failure', refreshToken: 'refresh-delete-failure' },
    sessionId: 'session-delete-failure',
    serverDeviceId: 'device-source-delete-failure',
  })
  const sourceStore = useSourceStore()
  const syncStore = useSyncStore()
  const originalRequestBackgroundSync = syncStore.requestBackgroundSync
  const sourceId = 'source-delete-commit-failure'
  const subjectId = 'subject-delete-commit-failure'
  const revision = 'revision-delete-commit-failure'
  const { getLocalRepository } = await import('../src/services/localDb.ts')
  const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  const overview = new OverviewRepository(authStore.user.id, authStore.serverDeviceId, { storage: createMemoryStorage() })
  const overviewResponse = {
    schemaVersion: 1,
    title: 'Keep this result',
    outline: [{ title: 'Chapter', sections: [{ title: 'Section', summary: 'Text', sourceIds: [sourceId], locator: null }] }],
    summary: { overview: 'Keep this summary', keyPoints: ['Point'], learningPath: ['Chapter'] },
  }
  const originalCommitMutation = repo.commitMutation.bind(repo)
  const originalTombstone = repo.tombstone.bind(repo)
  let overviewDiscardCalls = 0
  let documentDiscardCalls = 0
  syncStore.requestBackgroundSync = () => undefined

  try {
    await repo.upsert('SOURCE', sourceId, {
      id: sourceId, subjectId, type: 'FILE', title: 'Delete candidate', ingestionStatus: 'READY', ingestionRevision: revision,
    }, { version: 3 })
    await sourceStore.loadLocalSourceFiles(subjectId)
    await overview.saveFileOverviewPart({ sourceId, ingestionRevision: revision, mode: 'ALL', response: overviewResponse })
    const prepared = (await overview.listOverviewOutbox())[0]
    const immutableRequest = {
      baseVersion: 0,
      clientWriteId: prepared.clientWriteId,
      mode: 'ALL',
      ingestionRevision: revision,
      outlineGeneratedAt: '2026-10-01T00:00:00.000Z',
      summaryGeneratedAt: '2026-10-01T00:00:00.000Z',
      result: prepared.result,
    }
    await overview.materializeOverviewIntent(prepared.clientWriteId, immutableRequest)
    const cachedBefore = await overview.getFileOverview(sourceId, revision)
    const outboxBefore = await overview.listOverviewOutbox()
    sourceStore.attachDocumentScheduler({ schedule: async () => undefined, discard: async () => { documentDiscardCalls += 1 } })
    sourceStore.attachFileOverviewGenerator({
      generateReadyFileOverview: async () => ({ status: 'SKIPPED' }),
      discardFileOverview: async (id) => { overviewDiscardCalls += 1; await overview.removeFileOverviews(id) },
      restoreFileOverview: async () => true,
    })
    repo.commitMutation = async () => { throw new Error('SOURCE_COMMIT_FAILED') }
    repo.tombstone = async () => { throw new Error('SOURCE_COMMIT_FAILED') }

    await assert.rejects(sourceStore.deleteSourceFile(sourceId), /SOURCE_COMMIT_FAILED/)

    assert.equal(sourceStore.sources.some((item) => item.id === sourceId), true)
    assert.equal(sourceStore.activeSourceFiles.some((item) => item.id === sourceId), true)
    assert.deepEqual(await overview.getFileOverview(sourceId, revision), cachedBefore)
    assert.deepEqual(await overview.listOverviewOutbox(), outboxBefore)
    assert.equal(JSON.stringify((await overview.listOverviewOutbox())[0].requestBody), JSON.stringify(immutableRequest))
    assert.equal(overviewDiscardCalls, 0)
    assert.equal(documentDiscardCalls, 0)
  } finally {
    repo.commitMutation = originalCommitMutation
    repo.tombstone = originalTombstone
    sourceStore.attachFileOverviewGenerator(null)
    sourceStore.attachDocumentScheduler(null)
    syncStore.requestBackgroundSync = originalRequestBackgroundSync
    releaseLocalAssetSyncQueue(authStore.user.id, authStore.serverDeviceId)
  }
})

test('useSourceStore retries post-commit Overview cleanup from deleted Source reconciliation without releasing the fence', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-source-delete-cleanup', email: 'delete-cleanup@example.com' },
    tokens: { accessToken: 'token-delete-cleanup', refreshToken: 'refresh-delete-cleanup' },
    sessionId: 'session-delete-cleanup',
    serverDeviceId: 'device-source-delete-cleanup',
  })
  const sourceStore = useSourceStore()
  const syncStore = useSyncStore()
  const originalRequestBackgroundSync = syncStore.requestBackgroundSync
  const sourceId = 'source-delete-cleanup-retry'
  const subjectId = 'subject-delete-cleanup-retry'
  const revision = 'revision-delete-cleanup-retry'
  const { getLocalRepository } = await import('../src/services/localDb.ts')
  const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  const overview = new OverviewRepository(authStore.user.id, authStore.serverDeviceId, { storage: createMemoryStorage() })
  const overviewResponse = {
    schemaVersion: 1,
    title: 'Cleanup after commit',
    outline: [{ title: 'Chapter', sections: [{ title: 'Section', summary: 'Text', sourceIds: [sourceId], locator: null }] }],
    summary: { overview: 'Cleanup summary', keyPoints: ['Point'], learningPath: ['Chapter'] },
  }
  let discardCalls = 0
  let secondDiscardResolve
  const secondDiscard = new Promise((resolve) => { secondDiscardResolve = resolve })
  let schedulerDiscardCalls = 0
  let secondSchedulerDiscardResolve
  const secondSchedulerDiscard = new Promise((resolve) => { secondSchedulerDiscardResolve = resolve })
  syncStore.requestBackgroundSync = () => undefined

  try {
    await repo.upsert('SOURCE', sourceId, {
      id: sourceId, subjectId, type: 'FILE', title: 'Delete me', ingestionStatus: 'READY', ingestionRevision: revision,
    }, { version: 4 })
    await sourceStore.loadLocalSourceFiles(subjectId)
    await overview.saveFileOverviewPart({ sourceId, ingestionRevision: revision, mode: 'ALL', response: overviewResponse })
    sourceStore.attachDocumentScheduler({ schedule: async () => undefined, discard: async () => {
      schedulerDiscardCalls += 1
      if (schedulerDiscardCalls === 2) secondSchedulerDiscardResolve()
    } })
    sourceStore.attachFileOverviewGenerator({
      generateReadyFileOverview: async () => ({ status: 'SKIPPED' }),
      discardFileOverview: async (id) => {
        discardCalls += 1
        if (discardCalls === 1) throw new Error('TEMPORARY_OVERVIEW_CLEANUP_FAILURE')
        await overview.removeFileOverviews(id)
        secondDiscardResolve()
      },
      restoreFileOverview: async () => true,
    })

    await sourceStore.deleteSourceFile(sourceId)
    assert.equal((await repo.read('SOURCE', sourceId))?.deletedAt !== null, true)
    assert.equal(sourceStore.sources.some((item) => item.id === sourceId), false)
    assert.equal(sourceStore.activeSourceFiles.some((item) => item.id === sourceId), false)
    assert.equal(discardCalls, 1)
    assert.equal(overview.isScopeFenceTokenCurrent(overview.captureScopeFenceToken('FILE', sourceId)), false)
    await assert.rejects(overview.saveFileOverviewPart({ sourceId, ingestionRevision: revision, mode: 'ALL', response: overviewResponse }), /OVERVIEW_SCOPE_DELETED/)

    await sourceStore.loadSources()
    await Promise.all([secondDiscard, secondSchedulerDiscard])
    assert.equal(discardCalls, 2, 'deleted Source reconciliation retries deferred Overview cleanup')
    assert.equal(schedulerDiscardCalls, 2)
    assert.equal(await overview.getFileOverview(sourceId, revision), null)
    assert.equal(overview.isScopeFenceTokenCurrent(overview.captureScopeFenceToken('FILE', sourceId)), false,
      'successful cleanup does not reopen the deleted Source scope')
  } finally {
    sourceStore.attachFileOverviewGenerator(null)
    sourceStore.attachDocumentScheduler(null)
    syncStore.requestBackgroundSync = originalRequestBackgroundSync
    releaseLocalAssetSyncQueue(authStore.user.id, authStore.serverDeviceId)
  }
})

test('useSubjectStore.deleteSubject applies the local cascade fence before sync scheduling', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-subject-delete-store', email: 'delete@example.com' },
    tokens: { accessToken: 'token-delete', refreshToken: 'refresh-delete' },
    sessionId: 'session-delete',
    serverDeviceId: 'device-subject-delete-store',
  })
  const syncStore = useSyncStore()
  const originalRequestBackgroundSync = syncStore.requestBackgroundSync
  syncStore.requestBackgroundSync = () => undefined
  try {
    const { getLocalRepository } = await import('../src/services/localDb.ts')
    const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
    await repo.upsert('SUBJECT', 'subject-delete-store', { id: 'subject-delete-store', name: 'Delete me' }, { version: 1 })
    await repo.upsert('SOURCE', 'source-delete-store', { id: 'source-delete-store', subjectId: 'subject-delete-store' }, { version: 1 })
    const subjectStore = useSubjectStore()
    subjectStore.subjects.push({ id: 'subject-delete-store', name: 'Delete me', description: '', icon: '', iconKey: '', version: 1, deletedAt: null })
    await subjectStore.deleteSubject('subject-delete-store')
    assert.equal((await repo.read('SUBJECT', 'subject-delete-store'))?.deletedAt !== null, true)
    assert.equal((await repo.list('SOURCE', { includeDeleted: false })).length, 0)
    assert.deepEqual((await repo.listUnresolved()).map((item) => item.resourceType), ['SUBJECT'])
  } finally {
    syncStore.requestBackgroundSync = originalRequestBackgroundSync
    releaseLocalAssetSyncQueue('user-subject-delete-store', 'device-subject-delete-store')
  }
})

test('Source Store consumes a local cascade projection notification immediately', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-projection-refresh', email: 'projection@example.com' },
    tokens: { accessToken: 'token-projection', refreshToken: 'refresh-projection' },
    sessionId: 'session-projection',
    serverDeviceId: 'device-projection-refresh',
  })
  const { getLocalRepository } = await import('../src/services/localDb.ts')
  const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  await repo.upsert('SOURCE', 'source-projection-refresh', { id: 'source-projection-refresh', subjectId: 'subject-projection-refresh', title: 'Refresh me', type: 'FILE' }, { version: 1 })
  const sourceStore = useSourceStore()
  await sourceStore.loadLocalSourceFiles('subject-projection-refresh')
  assert.equal(sourceStore.activeSourceFiles.some((source) => source.id === 'source-projection-refresh'), true)
  await repo.tombstone('SOURCE', 'source-projection-refresh', { version: 1, deletedAt: '2026-09-18T01:00:00.000Z', syncStatus: 'synced' })
  publishProjectionChange({ resourceTypes: new Set(['SOURCE']) })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(sourceStore.activeSourceFiles.some((source) => source.id === 'source-projection-refresh'), false)
})

test('useSubjectStore hydration restores a local-only draft after rejected Subject sync', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-subject-reject-hydration', email: 'reject-hydration@example.com' },
    tokens: { accessToken: 'token-reject-hydration', refreshToken: 'refresh-reject-hydration' },
    sessionId: 'session-reject-hydration',
    serverDeviceId: 'device-subject-reject-hydration',
  })
  const syncStore = useSyncStore()
  const originalRequestBackgroundSync = syncStore.requestBackgroundSync
  syncStore.requestBackgroundSync = () => undefined
  try {
    const { getLocalRepository, getLocalAssetRepository } = await import('../src/services/localDb.ts')
    const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
    const assetRepo = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
    await repo.upsert('SUBJECT', 'subject-reject-hydration', { id: 'subject-reject-hydration', name: 'Local' }, { version: 1 })
    await repo.upsert('SOURCE', 'source-reject-hydration', { id: 'source-reject-hydration', subjectId: 'subject-reject-hydration', assetId: 'asset-reject-hydration' }, { version: 0 })
    await assetRepo.createAssetFile({ localAssetId: 'asset-reject-hydration', originalName: 'local.pdf', mimeType: 'application/pdf', sizeBytes: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
    await assetRepo.createSourceDraft({ localSourceId: 'source-reject-hydration', localAssetId: 'asset-reject-hydration', subjectId: 'subject-reject-hydration', title: 'Local', localContentRevision: 'e3b0c442-98fc-1c49-27ae-f4c8996fb924' })
    const subjectStore = useSubjectStore()
    subjectStore.subjects.push({ id: 'subject-reject-hydration', name: 'Local', description: '', icon: '', iconKey: '', version: 1, deletedAt: null })
    await subjectStore.deleteSubject('subject-reject-hydration')
    assert.equal((await assetRepo.getSourceDraft('source-reject-hydration'))?.state, 'DRAFT')
    const parentMutation = (await repo.listUnresolved('SUBJECT'))[0]
    assert.ok(parentMutation)
    const { runSyncCycle } = await import('../src/services/syncCycle.ts')
    await runSyncCycle({
      repository: repo,
      serverDeviceId: authStore.serverDeviceId,
      api: {
        async pushChanges() { return { results: [{ clientMutationId: parentMutation.clientMutationId, decision: 'REJECTED', resourceType: 'SUBJECT', resourceId: 'subject-reject-hydration', current: { id: 'subject-reject-hydration', name: 'Remote', version: 2, deletedAt: null } }] } },
        async pullChanges() { return { changes: [], nextCursor: 'reject-hydration', hasMore: false, resetRequired: false } },
        async getSnapshot() { return { snapshotCursor: 'reject-hydration', subjects: [{ id: 'subject-reject-hydration', name: 'Remote', version: 2 }], sources: [], knowledgeBlocks: [], tasks: [], relations: [] } },
      },
    })
    await subjectStore.loadSubjects()
    assert.equal(subjectStore.subjects.some((subject) => subject.id === 'subject-reject-hydration'), true)
    assert.equal((await repo.read('SOURCE', 'source-reject-hydration'))?.deletedAt, null)
    assert.equal((await assetRepo.getSourceDraft('source-reject-hydration'))?.state, 'DRAFT')
  } finally {
    syncStore.requestBackgroundSync = originalRequestBackgroundSync
    releaseLocalAssetSyncQueue('user-subject-reject-hydration', 'device-subject-reject-hydration')
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

test('useSyncStore: switch during A queue wakeup lets B sync independently, preserves A outbox, and keeps B state while A unwinds', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  const setSession = (userId, deviceId, sessionId, token) => authStore.setSession({
    user: { id: userId, email: `${userId}@example.com` },
    tokens: { accessToken: token, refreshToken: `refresh-${token}` },
    sessionId,
    serverDeviceId: deviceId,
  })
  const userA = 'user-core-switch-a'
  const deviceA = 'device-core-switch-a'
  const userB = 'user-core-switch-b'
  const deviceB = 'device-core-switch-b'

  const originalGet = request.get
  const originalPost = request.post
  const originalWakeUp = LocalAssetSyncQueue.prototype.wakeUp
  const syncStore = useSyncStore()
  const subjectStore = useSubjectStore()
  const originalBackgroundSync = syncStore.requestBackgroundSync
  const aWakeStarted = createDeferred()
  const releaseA = createDeferred()
  const bWakeStarted = createDeferred()
  const releaseB = createDeferred()
  const transportCalls = []
  let promiseA
  let promiseB

  request.get = async (url) => {
    transportCalls.push({ method: 'GET', url })
    if (url === '/api/auth/me/avatar') return new Blob([])
    if (url === '/api/sync/snapshot') return {
      snapshotCursor: 'cursor-core-switch-b',
      subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [],
    }
    if (url === '/api/sync/pull') return { changes: [], nextCursor: 'cursor-core-switch-b', hasMore: false, resetRequired: false }
    return {}
  }
  request.post = async (url, data) => {
    transportCalls.push({ method: 'POST', url, data })
    return { results: [], serverCursor: 'cursor-core-switch-b' }
  }
  setSession(userA, deviceA, 'session-core-switch-a', 'token-core-switch-a')
  syncStore.requestBackgroundSync = () => {}
  LocalAssetSyncQueue.prototype.wakeUp = function () {
    if (this.assetRepository.userId === userA) {
      aWakeStarted.resolve()
      return releaseA.promise
    }
    if (this.assetRepository.userId === userB) {
      bWakeStarted.resolve()
      return releaseB.promise
    }
    return originalWakeUp.call(this)
  }

  try {
    const addSubjectPromise = subjectStore.addSubject('A pending subject', '', 'book')
    await waitForSignal(addSubjectPromise, 'A Subject local write')
    const subjectId = await addSubjectPromise
    const { getLocalRepository } = await import('../src/services/localDb.ts')
    const repoA = await getLocalRepository(userA, deviceA)
    const pendingBeforeSwitch = await repoA.listUnresolved()
    assert.equal(pendingBeforeSwitch.length, 1)
    assert.equal(pendingBeforeSwitch[0].resourceId, subjectId)

    promiseA = syncStore.flushNow()
    await waitForSignal(aWakeStarted.promise, 'A asset queue wakeup')

    setSession(userB, deviceB, 'session-core-switch-b', 'token-core-switch-b')
    promiseB = syncStore.flushNow()
    await waitForSignal(bWakeStarted.promise, 'B asset queue wakeup')
    assert.equal(syncStore.isSyncing, true, 'B cycle must remain visibly active while its queue wakeup is pending')

    releaseA.resolve()
    await assert.rejects(promiseA, /SYNC_SCOPE_CHANGED/)
    assert.equal(syncStore.isSyncing, true, 'A finally must not clear B cycle state')
    assert.equal(syncStore.lastSyncError, null, 'A stale completion must not write an error into B state')
    assert.deepEqual(await repoA.listUnresolved(), pendingBeforeSwitch, 'A outbox mutation must remain recoverable')
    assert.deepEqual(transportCalls.filter((call) => call.url === '/api/sync/push'), [], 'A subject must not dispatch through B device scope')

    releaseB.resolve()
    await promiseB
    const { getLocalRepository: getRepository } = await import('../src/services/localDb.ts')
    const repoB = await getRepository(userB, deviceB)
    assert.equal(syncStore.cursor, 'cursor-core-switch-b')
    assert.equal((await repoB.getSyncState()).cursor, 'cursor-core-switch-b')
    assert.deepEqual(await repoB.listUnresolved(), [])
    assert.equal(syncStore.lastSyncError, null)
  } finally {
    releaseA.resolve()
    releaseB.resolve()
    await Promise.allSettled([promiseA, promiseB].filter(Boolean))
    request.get = originalGet
    request.post = originalPost
    syncStore.requestBackgroundSync = originalBackgroundSync
    LocalAssetSyncQueue.prototype.wakeUp = originalWakeUp
    releaseLocalAssetSyncQueue(userA, deviceA)
    releaseLocalAssetSyncQueue(userB, deviceB)
  }
})

test('useSyncStore: same-account logout and login creates a new cycle while the old session is pending', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  const userId = 'user-session-relogin'
  const deviceId = 'device-session-relogin'
  const setSession = (sessionId, token) => authStore.setSession({
    user: { id: userId, email: 'relogin@example.com' },
    tokens: { accessToken: token, refreshToken: `refresh-${token}` },
    sessionId,
    serverDeviceId: deviceId,
  })
  const originalGet = request.get
  const originalPost = request.post
  const originalWakeUp = LocalAssetSyncQueue.prototype.wakeUp
  const syncStore = useSyncStore()
  const originalBackgroundSync = syncStore.requestBackgroundSync
  const firstWake = createDeferred()
  const releaseFirstWake = createDeferred()
  let wakeCount = 0
  let promiseBeforeLogout
  let promiseAfterLogin
  request.get = async (url) => {
    if (url === '/api/auth/me/avatar') return new Blob([])
    if (url === '/api/sync/snapshot') return {
      snapshotCursor: 'cursor-after-relogin',
      subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [],
    }
    if (url === '/api/sync/pull') return { changes: [], nextCursor: 'cursor-after-relogin', hasMore: false, resetRequired: false }
    return {}
  }
  request.post = async () => ({ results: [], serverCursor: 'cursor-after-relogin' })
  setSession('session-before-relogin', 'token-before-relogin')
  syncStore.requestBackgroundSync = () => {}
  LocalAssetSyncQueue.prototype.wakeUp = function () {
    wakeCount += 1
    if (wakeCount === 1) {
      firstWake.resolve()
      return releaseFirstWake.promise
    }
    return Promise.resolve()
  }

  try {
    promiseBeforeLogout = syncStore.flushNow()
    await waitForSignal(firstWake.promise, 'old session asset queue wakeup')
    await authStore.logout()
    setSession('session-after-relogin', 'token-after-relogin')
    promiseAfterLogin = syncStore.flushNow()
    await waitForSignal(promiseAfterLogin, 'same-account sync after logout/login')
    assert.equal(wakeCount, 2, 'new session must start its own queue wakeup')
    assert.equal(syncStore.cursor, 'cursor-after-relogin')

    releaseFirstWake.resolve()
    await assert.rejects(promiseBeforeLogout, /SYNC_SCOPE_CHANGED/)
    assert.equal(syncStore.cursor, 'cursor-after-relogin', 'old session must not overwrite the new session cursor')
  } finally {
    releaseFirstWake.resolve()
    await Promise.allSettled([promiseBeforeLogout, promiseAfterLogin].filter(Boolean))
    request.get = originalGet
    request.post = originalPost
    syncStore.requestBackgroundSync = originalBackgroundSync
    LocalAssetSyncQueue.prototype.wakeUp = originalWakeUp
    releaseLocalAssetSyncQueue(userId, deviceId)
  }
})

test('useSyncStore: owner A to B to the same A tuple does not revive the old A cycle ticket', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  const userA = 'user-sync-aba-a'
  const deviceA = 'device-sync-aba-a'
  const sessionA = 'session-sync-aba-a'
  const setSession = (userId, deviceId, sessionId) => authStore.setSession({
    user: { id: userId, email: `${userId}@example.com` },
    tokens: { accessToken: `token-${sessionId}`, refreshToken: `refresh-${sessionId}` },
    sessionId,
    serverDeviceId: deviceId,
  })
  const originalGet = request.get
  const originalPost = request.post
  const originalWakeUp = LocalAssetSyncQueue.prototype.wakeUp
  const syncStore = useSyncStore()
  const originalBackgroundSync = syncStore.requestBackgroundSync
  const oldWakeStarted = createDeferred()
  const releaseOldWake = createDeferred()
  let userAWakeCount = 0
  let oldCycle
  let newCycle
  request.get = async (url) => {
    if (url === '/api/auth/me/avatar') return new Blob([])
    if (url === '/api/sync/snapshot') return {
      snapshotCursor: 'cursor-sync-aba-a',
      subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [],
    }
    return { changes: [], nextCursor: 'cursor-sync-aba-a', hasMore: false, resetRequired: false }
  }
  request.post = async () => ({ results: [], serverCursor: 'cursor-sync-aba-a' })
  setSession(userA, deviceA, sessionA)
  syncStore.requestBackgroundSync = () => {}
  LocalAssetSyncQueue.prototype.wakeUp = function () {
    if (this.assetRepository.userId === userA && userAWakeCount++ === 0) {
      oldWakeStarted.resolve()
      return releaseOldWake.promise
    }
    return Promise.resolve()
  }

  try {
    oldCycle = syncStore.flushNow()
    await waitForSignal(oldWakeStarted.promise, 'old A asset queue wakeup')
    setSession('user-sync-aba-b', 'device-sync-aba-b', 'session-sync-aba-b')
    setSession(userA, deviceA, sessionA)
    newCycle = syncStore.flushNow()
    await waitForSignal(newCycle, 'new A cycle after A to B to A identity ABA')
    assert.equal(userAWakeCount, 2)
    assert.equal(syncStore.cursor, 'cursor-sync-aba-a')

    releaseOldWake.resolve()
    await assert.rejects(oldCycle, /SYNC_SCOPE_CHANGED/)
    assert.equal(syncStore.cursor, 'cursor-sync-aba-a')
  } finally {
    releaseOldWake.resolve()
    await Promise.allSettled([oldCycle, newCycle].filter(Boolean))
    request.get = originalGet
    request.post = originalPost
    syncStore.requestBackgroundSync = originalBackgroundSync
    LocalAssetSyncQueue.prototype.wakeUp = originalWakeUp
    releaseLocalAssetSyncQueue(userA, deviceA)
    releaseLocalAssetSyncQueue('user-sync-aba-b', 'device-sync-aba-b')
  }
})

test('useAssetStore.upload: A import finishing after account switch stays in A local scope and cannot change B projections', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  const setSession = (userId, deviceId, sessionId) => authStore.setSession({
    user: { id: userId, email: `${userId}@example.com` },
    tokens: { accessToken: `token-${sessionId}`, refreshToken: `refresh-${sessionId}` },
    sessionId,
    serverDeviceId: deviceId,
  })
  const userA = 'user-asset-import-a'
  const deviceA = 'device-asset-import-a'
  const userB = 'user-asset-import-b'
  const deviceB = 'device-asset-import-b'
  const originalGet = request.get
  request.get = async () => new Blob([])
  setSession(userA, deviceA, 'session-asset-import-a')
  const assetStore = useAssetStore()
  const syncStore = useSyncStore()
  const originalBackgroundSync = syncStore.requestBackgroundSync
  syncStore.requestBackgroundSync = () => {}
  const originalImport = LocalAssetService.prototype.importAsset
  const importStarted = createDeferred()
  const releaseImport = createDeferred()
  const aProgress = []
  LocalAssetService.prototype.importAsset = async function (input) {
    if (this.repository.userId === userA) {
      importStarted.resolve()
      await releaseImport.promise
    }
    return originalImport.call(this, input)
  }

  try {
    const uploadA = assetStore.upload(
      new File(['A-owned bytes'], 'a-owned.pdf', { type: 'application/pdf' }),
      (percent, stage) => aProgress.push({ percent, stage }),
    )
    await waitForSignal(importStarted.promise, 'A local import barrier')
    setSession(userB, deviceB, 'session-asset-import-b')
    const modelB = await assetStore.upload(new File(['B-owned bytes'], 'b-owned.pdf', { type: 'application/pdf' }))
    const assetsBeforeACompletes = assetStore.assets.map((asset) => asset.id)
    const pendingBeforeACompletes = assetStore.pendingUploads.map((upload) => ({ ...upload }))
    const lastErrorBeforeACompletes = assetStore.lastError
    const { getLocalAssetRepository, getLocalRepository } = await import('../src/services/localDb.ts')
    const repoA = await getLocalRepository(userA, deviceA)
    const assetRepoA = await getLocalAssetRepository(userA, deviceA)

    releaseImport.resolve()
    await assert.rejects(uploadA, /ASSET_IDENTITY_CHANGED/)

    const importedA = await assetRepoA.listAssetFiles()
    const aRecord = importedA.find((asset) => asset.originalName === 'a-owned.pdf')
    assert.ok(aRecord, 'A local file metadata must survive an owner switch')
    const aJob = await assetRepoA.getActiveSyncJobForAsset(aRecord.localAssetId)
    assert.equal(aJob?.phase, 'PENDING', 'A upload job must remain retryable')
    assert.ok(await repoA.read('ASSET', aRecord.localAssetId), 'A asset projection must stay in A repository')

    const repoB = await getLocalRepository(userB, deviceB)
    assert.equal(await repoB.read('ASSET', aRecord.localAssetId), null, 'A projection must never enter B repository')
    assert.deepEqual(assetStore.assets.map((asset) => asset.id), assetsBeforeACompletes)
    assert.ok(assetStore.assets.some((asset) => asset.id === modelB.id))
    assert.deepEqual(assetStore.pendingUploads.map((upload) => ({ ...upload })), pendingBeforeACompletes)
    assert.equal(assetStore.lastError, lastErrorBeforeACompletes, 'stale A completion must not project an error into B')
    assert.deepEqual(aProgress.map((item) => item.percent), [10], 'stale import must not report later shared progress')
  } finally {
    releaseImport.resolve()
    LocalAssetService.prototype.importAsset = originalImport
    request.get = originalGet
    syncStore.requestBackgroundSync = originalBackgroundSync
    releaseLocalAssetSyncQueue(userA, deviceA)
    releaseLocalAssetSyncQueue(userB, deviceB)
  }
})

test('useDocumentProcessingStore.refresh projects valid local OCR checkpoints and isolates reader failures', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const store = useDocumentProcessingStore()
  let jobListCalls = 0
  let readerCalls = 0
  const runner = {
    list: async () => {
      jobListCalls += 1
      return [{ jobId: 'job-1', sourceId: 'source-1', phase: 'OCR_RUNNING' }]
    },
  }
  const records = [
    {
      localSourceId: 'local-source-1',
      checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 2, totalPages: 4, imageBytes: 10 }),
    },
    { localSourceId: 'local-source-malformed', checkpointJson: '{not-json' },
    {
      localSourceId: 'local-source-zero',
      checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 0, totalPages: 4 }),
    },
    {
      localSourceId: 'local-source-fractional',
      checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 2.5, totalPages: 4 }),
    },
    {
      localSourceId: 'local-source-out-of-bounds',
      checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 5, totalPages: 4 }),
    },
    {
      localSourceId: 'local-source-other-event',
      checkpointJson: JSON.stringify({ type: 'after-recognize', pageNumber: 3, totalPages: 4 }),
    },
    { localSourceId: 'local-source-null', checkpointJson: null },
  ]

  store.attachRunner(runner)
  store.attachLocalOcrProgressReader({
    list: async () => {
      readerCalls += 1
      return records
    },
  })

  await store.refresh()

  assert.equal(jobListCalls, 1)
  assert.equal(readerCalls, 1)
  assert.deepEqual(store.jobs, [{ jobId: 'job-1', sourceId: 'source-1', phase: 'OCR_RUNNING' }])
  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-1': { currentPage: 2, totalPages: 4 },
  })

  store.attachLocalOcrProgressReader({
    list: async () => {
      throw new Error('LOCAL_READER_FAILED')
    },
  })
  await store.refresh()

  assert.equal(jobListCalls, 2, 'reader failure must not prevent Job refresh')
  assert.deepEqual(store.jobs, [{ jobId: 'job-1', sourceId: 'source-1', phase: 'OCR_RUNNING' }])
  assert.deepEqual(store.localOcrProgressBySource, {})

  store.attachLocalOcrProgressReader({ list: async () => records })
  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource['local-source-1'], { currentPage: 2, totalPages: 4 })

  store.attachLocalOcrProgressReader(null)
  assert.deepEqual(store.localOcrProgressBySource, {}, 'detaching the reader must clear the projection')
  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource, {})
})

test('useDocumentProcessingStore.refresh ignores a reader that resolves after detach', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let readerStartedResolve
  const readerStarted = new Promise((resolve) => { readerStartedResolve = resolve })
  let readerResolve
  const reader = new Promise((resolve) => { readerResolve = resolve })
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-detach', sourceId: 'source-detach', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({
    list: async () => {
      readerStartedResolve()
      return reader
    },
  })

  const refresh = store.refresh()
  await readerStarted
  store.attachLocalOcrProgressReader(null)
  readerResolve([{
    localSourceId: 'local-source-stale',
    checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 1, totalPages: 2 }),
  }])
  await refresh

  assert.deepEqual(store.localOcrProgressBySource, {}, 'detached reader must not repopulate the projection')
})

test('useDocumentProcessingStore.refresh ignores an older overlapping reader completion', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let oldReaderStartedResolve
  const oldReaderStarted = new Promise((resolve) => { oldReaderStartedResolve = resolve })
  let oldReaderResolve
  const oldReader = new Promise((resolve) => { oldReaderResolve = resolve })
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-overlap', sourceId: 'source-overlap', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({
    list: async () => {
      oldReaderStartedResolve()
      return oldReader
    },
  })

  const oldRefresh = store.refresh()
  await oldReaderStarted

  store.attachLocalOcrProgressReader({
    list: async () => [{
      localSourceId: 'local-source-new',
      checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 3, totalPages: 5 }),
    }],
  })
  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-new': { currentPage: 3, totalPages: 5 },
  })

  oldReaderResolve([{
    localSourceId: 'local-source-old',
    checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 1, totalPages: 2 }),
  }])
  await oldRefresh

  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-new': { currentPage: 3, totalPages: 5 },
  }, 'older refresh must not overwrite the newer projection')
})

test('useDocumentProcessingStore.refresh preserves OCR progress across a same-run page result', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let checkpointType = 'before-recognize'
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-progress', sourceId: 'local-source-progress', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({
    list: async () => [{
      localSourceId: 'local-source-progress',
      attempt: 1,
      localContentRevision: 'revision-progress',
      checkpointJson: JSON.stringify({ type: checkpointType, pageNumber: 2, totalPages: 4 }),
    }],
  })

  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-progress': { currentPage: 2, totalPages: 4 },
  })

  checkpointType = 'page-result'
  await store.refresh()

  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-progress': { currentPage: 2, totalPages: 4 },
  }, 'same OCR_RUNNING Source must retain its last valid page during page-result')
})

test('useDocumentProcessingStore.refresh keeps OCR progress while a second reader is pending', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let readerCalls = 0
  let readerStartedResolve
  const readerStarted = new Promise((resolve) => { readerStartedResolve = resolve })
  let deferredResolve
  const deferredReader = new Promise((resolve) => { deferredResolve = resolve })
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-pending', sourceId: 'local-source-pending', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({
    list: async () => {
      readerCalls += 1
      if (readerCalls === 1) {
        return [{
          localSourceId: 'local-source-pending',
          attempt: 1,
          localContentRevision: 'revision-pending',
          checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 1, totalPages: 3 }),
        }]
      }
      readerStartedResolve()
      return deferredReader
    },
  })

  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-pending': { currentPage: 1, totalPages: 3 },
  })

  const secondRefresh = store.refresh()
  await readerStarted
  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-pending': { currentPage: 1, totalPages: 3 },
  }, 'a pending reader must not clear the last valid OCR page')

  deferredResolve([{
    localSourceId: 'local-source-pending',
    attempt: 1,
    localContentRevision: 'revision-pending',
    checkpointJson: JSON.stringify({ type: 'page-result', pageNumber: 1, totalPages: 3 }),
  }])
  await secondRefresh
})

test('useDocumentProcessingStore.refresh does not inherit OCR progress across attempt or revision', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let record = {
    localSourceId: 'local-source-token',
    attempt: 1,
    localContentRevision: 'revision-1',
    checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 2, totalPages: 4 }),
  }
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-token', sourceId: 'local-source-token', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({ list: async () => [record] })

  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource['local-source-token'], { currentPage: 2, totalPages: 4 })

  record = {
    ...record,
    attempt: 2,
    checkpointJson: JSON.stringify({ type: 'page-result', pageNumber: 2, totalPages: 4 }),
  }
  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource, {}, 'a new attempt must wait for its own before-recognize checkpoint')

  record = {
    ...record,
    attempt: 3,
    localContentRevision: 'revision-2',
    checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 1, totalPages: 4 }),
  }
  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource['local-source-token'], { currentPage: 1, totalPages: 4 }, 'a new run may reset to page one')

  record = {
    ...record,
    localContentRevision: 'revision-3',
    checkpointJson: JSON.stringify({ type: 'page-result', pageNumber: 1, totalPages: 4 }),
  }
  await store.refresh()
  assert.deepEqual(store.localOcrProgressBySource, {}, 'a new revision must not inherit a prior revision projection')
})

test('useDocumentProcessingStore.refresh rejects a same-run event with different total pages', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let checkpointJson = JSON.stringify({ type: 'before-recognize', pageNumber: 2, totalPages: 4 })
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-total-pages', sourceId: 'local-source-total-pages', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({
    list: async () => [{
      localSourceId: 'local-source-total-pages',
      attempt: 1,
      localContentRevision: 'revision-total-pages',
      checkpointJson,
    }],
  })

  await store.refresh()
  checkpointJson = JSON.stringify({ type: 'page-result', pageNumber: 2, totalPages: 5 })
  await store.refresh()

  assert.deepEqual(store.localOcrProgressBySource, {}, 'a checkpoint with different total pages must not inherit progress')
})

test('useDocumentProcessingStore.refresh does not move a same-run OCR page backward', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let checkpointJson = JSON.stringify({ type: 'before-recognize', pageNumber: 3, totalPages: 5 })
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-backward', sourceId: 'local-source-backward', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({
    list: async () => [{
      localSourceId: 'local-source-backward',
      attempt: 1,
      localContentRevision: 'revision-backward',
      checkpointJson,
    }],
  })

  await store.refresh()
  checkpointJson = JSON.stringify({ type: 'before-recognize', pageNumber: 2, totalPages: 5 })
  await store.refresh()

  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-backward': { currentPage: 3, totalPages: 5 },
  }, 'an older before-recognize checkpoint must not move the visible page backward')
})

test('useDocumentProcessingStore.refresh does not move a same-run OCR page backward when total pages changes', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let checkpointJson = JSON.stringify({ type: 'before-recognize', pageNumber: 3, totalPages: 5 })
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-backward-total', sourceId: 'local-source-backward-total', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({
    list: async () => [{
      localSourceId: 'local-source-backward-total',
      attempt: 1,
      localContentRevision: 'revision-backward-total',
      checkpointJson,
    }],
  })

  await store.refresh()
  checkpointJson = JSON.stringify({ type: 'before-recognize', pageNumber: 2, totalPages: 4 })
  await store.refresh()

  assert.deepEqual(store.localOcrProgressBySource, {
    'local-source-backward-total': { currentPage: 3, totalPages: 5 },
  }, 'a same-run page and total regression must retain the last valid projection')
})

test('useDocumentProcessingStore.refresh clears progress when the OCR reader omits a Source', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  let records = [{
    localSourceId: 'local-source-missing',
    attempt: 1,
    localContentRevision: 'revision-missing',
    checkpointJson: JSON.stringify({ type: 'before-recognize', pageNumber: 1, totalPages: 2 }),
  }]
  const store = useDocumentProcessingStore()
  store.attachRunner({
    list: async () => [{ jobId: 'job-missing', sourceId: 'local-source-missing', phase: 'OCR_RUNNING' }],
  })
  store.attachLocalOcrProgressReader({ list: async () => records })

  await store.refresh()
  records = []
  await store.refresh()

  assert.deepEqual(store.localOcrProgressBySource, {}, 'a Source missing from a successful reader result must be cleared')
})

test('useSyncStore scopes queued asset API calls, preserves A refresh retry, and lets B import normally', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  const setSession = (userId, deviceId, sessionId, accessToken, refreshToken) => authStore.setSession({
    user: { id: userId, email: `${userId}@example.com` },
    tokens: { accessToken, refreshToken },
    sessionId,
    serverDeviceId: deviceId,
  })
  const userA = 'user-asset-queue-scope-a'
  const deviceA = 'device-asset-queue-scope-a'
  const userB = 'user-asset-queue-scope-b'
  const deviceB = 'device-asset-queue-scope-b'
  const syncStore = useSyncStore()
  const assetStore = useAssetStore()
  const originalBackgroundSync = syncStore.requestBackgroundSync
  const originalPost = request.post
  const originalAdapter = activeAssetFlowAdapter
  const originalUploadAssetToRemote = LocalAssetService.prototype.uploadAssetToRemote
  const requestLog = []
  const intentAttempts = new Map()
  let staleCycle
  syncStore.requestBackgroundSync = () => undefined
  LocalAssetService.prototype.uploadAssetToRemote = async function (args) {
    return { status: 200, bytesSent: args.expectedSize, payloadSha256: args.expectedSha256 }
  }
  activeAssetFlowAdapter = async (config) => {
    const url = config.url ?? ''
    const authorization = typeof config.headers?.get === 'function'
      ? config.headers.get('Authorization')
      : config.headers?.Authorization
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    requestLog.push({ url, authorization, payload })
    if (url === '/api/auth/me/avatar') return { data: new Blob([]), status: 200, statusText: 'OK', headers: {}, config }
    if (url === '/api/auth/refresh') {
      assert.equal(payload?.refreshToken, 'refresh-asset-queue-a')
      return { data: { tokens: { accessToken: 'token-asset-queue-a2', refreshToken: 'refresh-asset-queue-a2' } }, status: 200, statusText: 'OK', headers: {}, config }
    }
    if (url === '/api/assets/upload-intents') {
      const name = payload?.originalName
      const attempts = (intentAttempts.get(name) ?? 0) + 1
      intentAttempts.set(name, attempts)
      if (name === 'a-refresh-retry.pdf' && attempts === 1) {
        const error = new Error('adapter returned 401')
        error.config = config
        error.response = { status: 401, data: {}, headers: {}, config }
        throw error
      }
      if (name === 'a-pre-dispatch-private.pdf') return {
        data: { assetId: 'asset-a-pre-dispatch', uploadUrl: 'https://storage.invalid/a', uploadStatus: 'UPLOADING' },
        status: 200, statusText: 'OK', headers: {}, config,
      }
      const assetId = name === 'a-refresh-retry.pdf' ? 'asset-a-refresh-retry' : 'asset-b-normal'
      return {
        data: { assetId, uploadUrl: `https://storage.invalid/${assetId}`, uploadStatus: 'UPLOADING' },
        status: 200, statusText: 'OK', headers: {}, config,
      }
    }
    if (url.includes('/complete')) return { data: { id: url.split('/')[3] }, status: 200, statusText: 'OK', headers: {}, config }
    if (url === '/api/sync/snapshot') return {
      data: { snapshotCursor: 'asset-queue-cursor', subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [] },
      status: 200, statusText: 'OK', headers: {}, config,
    }
    if (url === '/api/sync/pull') return {
      data: { changes: [], nextCursor: 'asset-queue-cursor', hasMore: false, resetRequired: false },
      status: 200, statusText: 'OK', headers: {}, config,
    }
    if (url === '/api/sync/push') return { data: { results: [], serverCursor: 'asset-queue-cursor' }, status: 200, statusText: 'OK', headers: {}, config }
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }
  setSession(userA, deviceA, 'session-asset-queue-a', 'token-asset-queue-a', 'refresh-asset-queue-a')

  try {
    const firstA = await assetStore.upload(new File(['first A file'], 'a-refresh-retry.pdf', { type: 'application/pdf' }))
    await syncStore.flushNow()

    assert.equal(authStore.token, 'token-asset-queue-a2', 'the current A upload intent must refresh and retry under A')
    assert.equal(requestLog.filter((call) => call.url === '/api/assets/upload-intents' && call.payload?.originalName === 'a-refresh-retry.pdf').length, 2)
    assert.ok(requestLog.some((call) => call.url.includes('/complete') && call.authorization === 'Bearer token-asset-queue-a2'))

    const staleA = await assetStore.upload(new File(['private A file'], 'a-pre-dispatch-private.pdf', { type: 'application/pdf' }))
    const originalPostBound = originalPost.bind(request)
    request.post = function (...args) {
      if (args[0] === '/api/assets/upload-intents' && args[1]?.originalName === 'a-pre-dispatch-private.pdf') {
        queueMicrotask(() => setSession(userB, deviceB, 'session-asset-queue-b', 'token-asset-queue-b', 'refresh-asset-queue-b'))
      }
      return originalPostBound(...args)
    }
    staleCycle = syncStore.flushNow()
    await assert.rejects(staleCycle, /SYNC_SCOPE_CHANGED/)
    request.post = originalPost

    const staleIntentDispatch = requestLog.filter((call) => call.url === '/api/assets/upload-intents'
      && call.payload?.originalName === 'a-pre-dispatch-private.pdf')
    assert.deepEqual(staleIntentDispatch, [], 'the queued A payload must not reach the adapter after B login')

    const modelB = await assetStore.upload(new File(['B file'], 'b-normal.pdf', { type: 'application/pdf' }))
    await syncStore.flushNow()
    assert.ok(requestLog.some((call) => call.url === '/api/assets/upload-intents'
      && call.payload?.originalName === 'b-normal.pdf'
      && call.authorization === 'Bearer token-asset-queue-b'))
    assert.ok(requestLog.some((call) => call.url.includes('/complete')
      && call.authorization === 'Bearer token-asset-queue-b'))

    const { getLocalAssetRepository, getLocalRepository } = await import('../src/services/localDb.ts')
    const repoA = await getLocalRepository(userA, deviceA)
    const assetRepoA = await getLocalAssetRepository(userA, deviceA)
    const assetRepoB = await getLocalAssetRepository(userB, deviceB)
    assert.ok(await repoA.read('ASSET', staleA.id), 'the A asset projection remains in A storage')
    assert.ok(await assetRepoA.getActiveSyncJobForAsset(staleA.id), 'the A upload job remains recoverable')
    assert.equal(await assetRepoB.getAssetFile(staleA.id), null, 'the A local file metadata must not enter B storage')
    assert.ok(await assetRepoB.getAssetFile(modelB.id), 'B upload must persist in B local asset storage')
    assert.equal(await assetRepoB.getActiveSyncJobForAsset(modelB.id), null, 'B upload must complete normally')
    assert.ok(await assetRepoA.getActiveSyncJobForAsset(firstA.id) === null, 'the retried A job should complete normally')
  } finally {
    await Promise.allSettled([staleCycle].filter(Boolean))
    request.post = originalPost
    activeAssetFlowAdapter = originalAdapter
    LocalAssetService.prototype.uploadAssetToRemote = originalUploadAssetToRemote
    syncStore.requestBackgroundSync = originalBackgroundSync
    releaseLocalAssetSyncQueue(userA, deviceA)
    releaseLocalAssetSyncQueue(userB, deviceB)
  }
});

test('a queued A upload that returns 401 after B login cannot refresh or retry with B credentials', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  const setSession = (userId, deviceId, sessionId, accessToken, refreshToken) => authStore.setSession({
    user: { id: userId, email: `${userId}@example.com` },
    tokens: { accessToken, refreshToken },
    sessionId,
    serverDeviceId: deviceId,
  })
  const userA = 'user-asset-delayed-401-a'
  const deviceA = 'device-asset-delayed-401-a'
  const userB = 'user-asset-delayed-401-b'
  const deviceB = 'device-asset-delayed-401-b'
  const syncStore = useSyncStore()
  const assetStore = useAssetStore()
  const originalBackgroundSync = syncStore.requestBackgroundSync
  const originalAdapter = activeAssetFlowAdapter
  const originalUploadAssetToRemote = LocalAssetService.prototype.uploadAssetToRemote
  const requestStarted = createDeferred()
  const releaseAResponse = createDeferred()
  const requestLog = []
  let aIntentAttempts = 0
  let cycleA
  syncStore.requestBackgroundSync = () => undefined
  LocalAssetService.prototype.uploadAssetToRemote = async function (args) {
    return { status: 200, bytesSent: args.expectedSize, payloadSha256: args.expectedSha256 }
  }
  activeAssetFlowAdapter = async (config) => {
    const url = config.url ?? ''
    const authorization = typeof config.headers?.get === 'function'
      ? config.headers.get('Authorization')
      : config.headers?.Authorization
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    requestLog.push({ url, authorization, payload })
    if (url === '/api/auth/me/avatar') return { data: new Blob([]), status: 200, statusText: 'OK', headers: {}, config }
    if (url === '/api/assets/upload-intents' && payload?.originalName === 'a-delayed-private.pdf') {
      aIntentAttempts += 1
      if (aIntentAttempts === 1) {
        requestStarted.resolve()
        await releaseAResponse.promise
        const error = new Error('adapter returned 401')
        error.config = config
        error.response = { status: 401, data: {}, headers: {}, config }
        throw error
      }
      return { data: { assetId: 'asset-a-delayed', uploadStatus: 'READY' }, status: 200, statusText: 'OK', headers: {}, config }
    }
    if (url === '/api/auth/refresh') return {
      data: { tokens: { accessToken: 'token-asset-delayed-b2', refreshToken: 'refresh-asset-delayed-b2' } },
      status: 200, statusText: 'OK', headers: {}, config,
    }
    if (url === '/api/assets/upload-intents') return {
      data: { assetId: 'asset-b-delayed-test', uploadUrl: 'https://storage.invalid/b', uploadStatus: 'UPLOADING' },
      status: 200, statusText: 'OK', headers: {}, config,
    }
    if (url.includes('/complete')) return { data: { id: url.split('/')[3] }, status: 200, statusText: 'OK', headers: {}, config }
    if (url === '/api/sync/snapshot') return {
      data: { snapshotCursor: 'delayed-401-cursor', subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [] },
      status: 200, statusText: 'OK', headers: {}, config,
    }
    if (url === '/api/sync/pull') return {
      data: { changes: [], nextCursor: 'delayed-401-cursor', hasMore: false, resetRequired: false },
      status: 200, statusText: 'OK', headers: {}, config,
    }
    if (url === '/api/sync/push') return { data: { results: [], serverCursor: 'delayed-401-cursor' }, status: 200, statusText: 'OK', headers: {}, config }
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }
  setSession(userA, deviceA, 'session-asset-delayed-a', 'token-asset-delayed-a', 'refresh-asset-delayed-a')

  try {
    await assetStore.upload(new File(['A delayed private file'], 'a-delayed-private.pdf', { type: 'application/pdf' }))
    cycleA = syncStore.flushNow()
    await waitForSignal(requestStarted.promise, 'A upload intent adapter dispatch')
    const initialARequest = requestLog.find((call) => call.url === '/api/assets/upload-intents'
      && call.payload?.originalName === 'a-delayed-private.pdf')
    assert.equal(initialARequest?.authorization, 'Bearer token-asset-delayed-a')

    setSession(userB, deviceB, 'session-asset-delayed-b', 'token-asset-delayed-b', 'refresh-asset-delayed-b')
    await assetStore.upload(new File(['B normal file'], 'b-delayed-normal.pdf', { type: 'application/pdf' }))
    await syncStore.flushNow()
    assert.ok(requestLog.some((call) => call.url === '/api/assets/upload-intents'
      && call.payload?.originalName === 'b-delayed-normal.pdf'
      && call.authorization === 'Bearer token-asset-delayed-b'))

    releaseAResponse.resolve()
    await assert.rejects(cycleA, /SYNC_SCOPE_CHANGED/)

    assert.equal(requestLog.filter((call) => call.url === '/api/auth/refresh').length, 0,
      'the stale A 401 must not begin a refresh using B refresh token')
    assert.equal(requestLog.filter((call) => call.url === '/api/assets/upload-intents'
      && call.payload?.originalName === 'a-delayed-private.pdf').length, 1,
    'the stale A intent must not be retried under B')
    assert.equal(authStore.user?.id, userB)
    assert.equal(authStore.token, 'token-asset-delayed-b')
  } finally {
    releaseAResponse.resolve()
    await Promise.allSettled([cycleA].filter(Boolean))
    activeAssetFlowAdapter = originalAdapter
    LocalAssetService.prototype.uploadAssetToRemote = originalUploadAssetToRemote
    syncStore.requestBackgroundSync = originalBackgroundSync
    releaseLocalAssetSyncQueue(userA, deviceA)
    releaseLocalAssetSyncQueue(userB, deviceB)
  }
});
