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
const { LocalAssetSyncQueue, getOrCreateLocalAssetSyncQueue } = await import('../src/services/localAssetSyncQueue.ts')
const { useAssetStore } = await import('../src/store/useAssetStore.ts')
const { useSourceStore } = await import('../src/store/useSourceStore.ts')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')

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
})

test('useSourceStore.createFileSource: local asset path writes projection + draft without SOURCE outbox mutation; queue completes and releases outbox', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = { id: 'user-test-2', email: 'test2@example.com' }
  authStore.serverDeviceId = 'device-test-2'

  const assetStore = useAssetStore()
  const sourceStore = useSourceStore()

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
  const queue = new LocalAssetSyncQueue({
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
})
