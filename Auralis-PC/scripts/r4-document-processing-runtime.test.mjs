import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'
import { register } from 'node:module'

const root = path.resolve(import.meta.dirname, '..')

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}'
    const subPath = specifier.slice(2)
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts'
    return nextResolve(new URL(withExt, root).href, context)
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentUrl = context.parentURL
    if (parentUrl && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
      return nextResolve(new URL(specifier + '.ts', parentUrl).href, context)
    }
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createPinia, setActivePinia } = await import('pinia')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { useSourceStore } = await import('../src/store/useSourceStore.ts')
const { useSyncStore } = await import('../src/store/useSyncStore.ts')
const { getLocalRepository } = await import('../src/services/localDb.ts')
const { DocumentProcessingRuntime } = await import('../src/services/documentProcessing/runtime.ts')

function sourceModel(id, ingestionStatus) {
  return {
    id,
    subjectId: 'subject-1',
    type: 'FILE',
    name: id,
    filePath: '',
    fileType: 'pdf',
    fileSize: 1,
    catalogJson: '[]',
    blockCount: 0,
    ingestionStatus,
    ingestionRevision: 'revision-1',
    version: 1,
    deletedAt: null,
  }
}

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('runtime discovers processing Sources once, shares one bounded sync cycle, and stops each terminal state', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-1', username: 'runtime' },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
    sessionId: 'session-1',
    serverDeviceId: 'device-1',
  })
  const sourceStore = useSourceStore()
  const syncStore = useSyncStore()
  let models = [sourceModel('source-ready', 'INDEXING'), sourceModel('source-failed', 'PARSING'), sourceModel('source-deleted', 'PENDING')]
  sourceStore.sources = models
  let syncCalls = 0
  let hydrateCalls = 0
  let loadSourcesCalls = 0
  syncStore.triggerSync = async () => {
    syncCalls += 1
    models = syncCalls === 1
      ? [sourceModel('source-ready', 'READY'), sourceModel('source-failed', 'FAILED'), sourceModel('source-added-mid-cycle', 'INDEXING')]
      : [sourceModel('source-ready', 'READY'), sourceModel('source-failed', 'FAILED'), sourceModel('source-added-mid-cycle', 'READY')]
    sourceStore.sources = models
  }
  sourceStore.refreshLocalProjection = async () => {
    hydrateCalls += 1
    sourceStore.sources = models
    return models
  }
  sourceStore.loadSources = async () => {
    loadSourcesCalls += 1
    throw new Error('reconciliation must not schedule a second SourceStore sync')
  }

  const runtime = new DocumentProcessingRuntime({ sourceReconciliationMaxAttempts: 3, sourceReconciliationWaitMs: 0 })
  const resumeIds = []
  runtime.snapshot = {
    userId: 'user-1',
    serverDeviceId: 'device-1',
    runner: null,
    repository: { list: async () => [] },
    scheduler: { resume: async (ids) => { resumeIds.push(ids) } },
    overviewGeneration: { resumePending: async () => {} },
  }

  await Promise.all([runtime.resumePending(), runtime.resumePending()])
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.deepEqual(resumeIds[0].sort(), ['source-deleted', 'source-failed', 'source-ready'])
  assert.equal(syncCalls, 2, 'one sync per shared cycle, including a Source added mid-cycle')
  assert.equal(hydrateCalls, 2, 'each shared cycle hydrates the local projection once')
  assert.equal(loadSourcesCalls, 0)
  assert.deepEqual(sourceStore.sources.map((source) => source.ingestionStatus), ['READY', 'FAILED', 'READY'])
  runtime.stop()
  authStore.clearSession()
})

test('runtime stop cancels a pending reconciliation timer and prevents later sync or hydration', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-1', username: 'runtime' },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
    sessionId: 'session-1',
    serverDeviceId: 'device-1',
  })
  const sourceStore = useSourceStore()
  const syncStore = useSyncStore()
  const models = [sourceModel('source-stuck', 'INDEXING')]
  sourceStore.sources = models
  let syncCalls = 0
  let hydrateCalls = 0
  syncStore.triggerSync = async () => { syncCalls += 1 }
  sourceStore.refreshLocalProjection = async () => { hydrateCalls += 1; return models }

  const runtime = new DocumentProcessingRuntime({ sourceReconciliationMaxAttempts: 3, sourceReconciliationWaitMs: 10 })
  runtime.snapshot = {
    userId: 'user-1',
    serverDeviceId: 'device-1',
    runner: null,
    repository: { list: async () => [] },
    scheduler: { resume: async () => {} },
    overviewGeneration: { resumePending: async () => {} },
  }
  await runtime.resumePending()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(syncCalls, 1)

  runtime.stop()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(syncCalls, 1)
  assert.equal(hydrateCalls, 1)
  authStore.clearSession()
})

test('runtime scope change prevents an old reconciliation cycle from syncing again', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-old', username: 'old' },
    tokens: { accessToken: 'access-old', refreshToken: 'refresh-old' },
    sessionId: 'session-old',
    serverDeviceId: 'device-old',
  })
  const sourceStore = useSourceStore()
  const syncStore = useSyncStore()
  const models = [sourceModel('source-old-scope', 'INDEXING')]
  sourceStore.sources = models
  let syncCalls = 0
  let hydrateCalls = 0
  syncStore.triggerSync = async () => { syncCalls += 1 }
  sourceStore.refreshLocalProjection = async () => { hydrateCalls += 1; return models }

  const runtime = new DocumentProcessingRuntime({ sourceReconciliationMaxAttempts: 3, sourceReconciliationWaitMs: 10 })
  runtime.snapshot = {
    userId: 'user-old',
    serverDeviceId: 'device-old',
    runner: null,
    repository: { list: async () => [] },
    scheduler: { resume: async () => {} },
    overviewGeneration: { resumePending: async () => {} },
  }

  await runtime.resumePending()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(syncCalls, 1)
  assert.equal(hydrateCalls, 1)
  authStore.setSession({
    user: { id: 'user-new', username: 'new' },
    tokens: { accessToken: 'access-new', refreshToken: 'refresh-new' },
    sessionId: 'session-new',
    serverDeviceId: 'device-new',
  })
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.equal(syncCalls, 1)
  assert.equal(hydrateCalls, 1)
  runtime.stop()
  authStore.clearSession()
})

test('resumePending does not start reconciliation after stop during an in-flight repository read', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-resume', username: 'resume' },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
    sessionId: 'session-resume',
    serverDeviceId: 'device-resume',
  })
  let resolveList
  let schedulerCalls = 0
  const runtime = new DocumentProcessingRuntime({ sourceReconciliationWaitMs: 0 })
  runtime.snapshot = {
    userId: 'user-resume',
    serverDeviceId: 'device-resume',
    runner: null,
    repository: { list: async () => new Promise((resolve) => { resolveList = resolve }) },
    scheduler: { resume: async () => { schedulerCalls += 1 } },
    overviewGeneration: { resumePending: async () => {} },
  }

  const pending = runtime.resumePending()
  await new Promise((resolve) => setTimeout(resolve, 0))
  runtime.stop()
  resolveList([])
  await pending

  assert.equal(schedulerCalls, 0)
})

test('refreshLocalProjection keeps the newer auth scope during a real repository hydration race', async () => {
  const values = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
      clear: () => values.clear(),
    },
  })
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: 'user-scope-a', username: 'scope-a' },
    tokens: { accessToken: 'access-a', refreshToken: 'refresh-a' },
    sessionId: 'session-a',
    serverDeviceId: 'device-a',
  })
  const repository = await getLocalRepository('user-scope-a', 'device-a')
  await repository.upsert('SOURCE', 'source-a', {
    id: 'source-a', subjectId: 'subject-a', type: 'FILE', title: 'A', assetId: 'asset-a',
    outline: '[]', version: 1, createdAt: '2026-09-18', updatedAt: '2026-09-18', ingestionStatus: 'INDEXING',
  }, { version: 1, syncStatus: 'synced' })

  const sourceStore = useSourceStore()
  sourceStore.sources = [sourceModel('visible-a', 'INDEXING')]
  const originalList = repository.list.bind(repository)
  let releaseRead
  repository.list = async (...args) => {
    await new Promise((resolve) => { releaseRead = resolve })
    return originalList(...args)
  }
  const refresh = sourceStore.refreshLocalProjection({ userId: 'user-scope-a', serverDeviceId: 'device-a' })
  for (let attempt = 0; attempt < 10 && !releaseRead; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  authStore.setSession({
    user: { id: 'user-scope-b', username: 'scope-b' },
    tokens: { accessToken: 'access-b', refreshToken: 'refresh-b' },
    sessionId: 'session-b',
    serverDeviceId: 'device-b',
  })
  sourceStore.sources = [sourceModel('visible-b', 'READY')]
  releaseRead()
  await refresh

  assert.deepEqual(sourceStore.sources.map((source) => source.id), ['visible-b'])
  authStore.clearSession()
})

test('Tauri document runtime composes the durable repository, parser, package, upload and scheduler', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  for (const dependency of [
    'getDocumentProcessingJobRepository',
    'DocumentJobRunner',
    'SourceJobScheduler',
    'ParsedDocumentUploadCoordinator',
    'documentPackageBegin',
    'documentPackageAppend',
    'documentPackageFinish',
    'documentCacheDelete',
    'parseDocument',
    'TauriOcrAdapter',
    'openPdfDocument',
    'FileViewerParserBridge',
  ]) {
    assert.match(runtime, new RegExp(dependency))
  }
  assert.match(runtime, /sourceStore\.attachDocumentScheduler\(scheduler\)/)
  assert.match(runtime, /processingStore\.attachScheduler\(scheduler\)/)
  assert.match(runtime, /processingStore\.attachRunner\(runner\)/)
  const jobChanged = runtime.match(/onJobChanged:\s*async \(\) => \{([\s\S]*?)\n\s*\},/)
  assert.ok(jobChanged)
  assert.match(jobChanged[1], /processingStore\.refresh\(\)/)
  assert.doesNotMatch(jobChanged[1], /sourceStore\.loadSources\(\)/)
  assert.match(runtime, /parserInputs\.clear\(\)/)
  assert.match(runtime, /await ocrWarmup\(\)/)
  assert.match(runtime, /OCR warmup deferred/)
  assert.doesNotMatch(runtime, /localStorage\.setItem|uploadUrl\s*:/)
})

test('runtime wires accepted document completion to one background read sync request', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  const upload = runtime.match(/const upload = new ParsedDocumentUploadCoordinator\(\{([\s\S]*?)\n\s*\}\)/)
  assert.ok(upload)
  assert.match(upload[1], /onCompleteAccepted\s*:/)
  assert.match(upload[1], /useSyncStore\(\)\.requestBackgroundSync\(['"]read['"]\)/)
  assert.doesNotMatch(upload[1], /triggerSync|loadSources|sourceApi|repository\.transition/)
})

test('runtime passes parser progress into the durable document runner', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  assert.match(runtime, /parseDocument\(input, sink, \{\s*onProgress\s*\}\)/)
})

test('runtime forwards the scheduler-owned Asset SHA without hashing the parser input again', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  const runJob = runtime.match(/runJob:\s*async \(jobId, metadata\) => \{([\s\S]*?)\r?\n\s*\},\r?\n\s*cancelJob/)
  assert.ok(runJob)
  assert.match(runJob[1], /sourceAssetSha256:\s*metadata\.sourceAssetSha256/)
  assert.doesNotMatch(runJob[1], /sha256File\(/)
})

test('runtime uses the owner-scoped local-first Asset input resolver for parser and online fallback paths', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  assert.match(runtime, /resolveLocalInput:[\s\S]*assetStore\.resolveLocalFile\(/)
  assert.match(runtime, /downloadAsset:[\s\S]*assetStore\.resolveSourceInput\(/)
  assert.match(runtime, /expectedAssetSha256:[\s\S]*assetStore\.getAssetSha256\(/)
  assert.doesNotMatch(runtime, /assetStore\.getLocalFile\(/)
})

test('Tauri document runtime flushes pending sync mutations before bootstrapping sources', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  assert.match(runtime, /import\s+\{\s*useSyncStore\s*\}\s+from\s+'@\/store\/useSyncStore'/)
  const syncIndex = runtime.indexOf('await useSyncStore().triggerSync()')
  const sourceBootstrapIndex = runtime.indexOf('await sourceStore.loadSources().catch', syncIndex)
  assert.ok(syncIndex >= 0, 'runtime must attempt an initial sync cycle')
  assert.ok(sourceBootstrapIndex > syncIndex, 'source bootstrap must run after the initial sync attempt')
})

test('Tauri document runtime initializes encryption before creating document packages', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  assert.match(runtime, /import\s+\{\s*e2ee\s*\}\s+from\s+'@\/api\/e2ee'/)
  assert.match(runtime, /private async ensureEncryptionReady\(repository: DocumentProcessingJobRepository\)/)
  assert.match(runtime, /jobs\.some\(\(job\) => job\.payloadCacheId !== null \|\| job\.payloadReceipt !== null\)/)
  assert.match(runtime, /DOCUMENT_ENCRYPTION_KEY_RECOVERY_REQUIRED/)
  assert.match(runtime, /const initialized = await e2ee\.initialize\(\)/)
  assert.match(runtime, /DOCUMENT_ENCRYPTION_INITIALIZATION_FAILED/)

  const encryptionIndex = runtime.indexOf('await this.ensureEncryptionReady(repository)')
  const packagerIndex = runtime.indexOf('const packager = {', encryptionIndex)
  assert.ok(encryptionIndex >= 0, 'runtime must initialize encryption before composing the runner')
  assert.ok(packagerIndex > encryptionIndex, 'package commands must be composed after encryption initialization')
})

test('native package creation guarantees a master key at the Rust security boundary', async () => {
  const crypto = await source('src-tauri/src/crypto.rs')
  const packager = await source('src-tauri/src/document_packager.rs')
  assert.match(crypto, /pub\(crate\) fn ensure_master_key_bytes\(\) -> Result<Vec<u8>, String>/)
  assert.match(crypto, /Err\(keyring::Error::NoEntry\)/)
  assert.match(packager, /fn store_for_new_package\(&self\) -> Result<DocumentCacheStore, String> \{[\s\S]*crypto::ensure_master_key_bytes\(\)/)
  assert.match(packager, /document_package_begin[\s\S]*PackageBuilder::begin\(state\.store_for_new_package\(\)\?/)
})

test('Cargo enables the Windows-native keyring backend without changing the master-key identity', async () => {
  const cargo = await source('src-tauri/Cargo.toml')
  assert.match(cargo, /keyring\s*=\s*\{\s*version\s*=\s*"3"\s*,\s*features\s*=\s*\[\s*"windows-native"\s*\]\s*\}/)
  const crypto = await source('src-tauri/src/crypto.rs')
  assert.match(crypto, /const KEYRING_SERVICE:\s*&str\s*=\s*"auralis"/)
  assert.match(crypto, /const KEYRING_USER:\s*&str\s*=\s*"master_key"/)
})

test('Rust runtime test verifies native keyring persistence across fresh entries', async () => {
  const crypto = await source('src-tauri/src/crypto.rs')
  assert.match(crypto, /#\[cfg\(windows\)\][\s\S]*#\[test\][\s\S]*keyring_persists_across_fresh_entries/)
  assert.match(crypto, /Entry::new\(&service,\s*&user\)/)
  assert.match(crypto, /first[\s\S]*set_password\(&secret\)/)
  assert.match(crypto, /second[\s\S]*get_password\(\)/)
  assert.match(crypto, /delete_credential\(\)/)
})

test('Tauri SQL capability permits durable document job writes', async () => {
  const capability = JSON.parse(await source('src-tauri/capabilities/default.json'))
  assert.ok(capability.permissions.includes('sql:allow-execute'))
})

test('App mounts one hidden parser host and starts/stops document runtime with auth', async () => {
  const app = await source('src/App.vue')
  const host = await source('src/services/documentParser/backgroundParserHost.ts')
  assert.match(app, /BackgroundParserHost ref="backgroundParserHost"/)
  assert.match(app, /setBackgroundParserHost\(backgroundParserHost\.value\)/)
  assert.match(app, /documentProcessingRuntime\.start\(\)/)
  assert.match(app, /documentProcessingRuntime\.stop\(\)/)
  assert.match(host, /getBackgroundParserHost/)
  assert.match(host, /setBackgroundParserHost/)
})

test('public auth routes do not mount the authenticated shell or trigger sidebar requests', async () => {
  const app = await source('src/App.vue')
  const sidebar = await source('src/components/layout/AppSidebar.vue')
  const router = await source('src/router/index.ts')
  const login = await source('src/views/Login/index.vue')
  const authStore = await source('src/store/useAuthStore.ts')

  assert.match(app, /const route = useRoute\(\)/)
  assert.match(app, /isAuthenticatedRoute/)
  assert.match(app, /v-if="isAuthenticatedRoute"[\s\S]*AppSidebar/)
  assert.match(sidebar, /const authStore = useAuthStore\(\)/)
  assert.match(sidebar, /if \(!authStore\.isAuthenticated\) return/)
  assert.match(sidebar, /try \{[\s\S]*subjectStore\.loadSubjects\(\)[\s\S]*catch \(/)
  assert.match(router, /const hasSession = authStore\.isAuthenticated/)
  assert.match(login, /if \(authStore\.isAuthenticated\)/)
  assert.match(authStore, /isAuthenticated = computed\(\(\) => Boolean\([\s\S]*serverDeviceId\.value[\s\S]*\)\)/)
})

test('Office bitmap fallback reports unsupported input when the renderer has no page count', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  assert.doesNotMatch(runtime, /OFFICE_PAGE_COUNT_UNAVAILABLE/)
  assert.match(runtime, /throw new Error\('DOCUMENT_FILE_TYPE_UNSUPPORTED'\)/)
})
