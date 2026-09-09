import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

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
  const runJob = runtime.match(/runJob:\s*async \(jobId, metadata\) => \{([\s\S]*?)\n\s*\},\n\s*cancelJob/)
  assert.ok(runJob)
  assert.match(runJob[1], /sourceAssetSha256:\s*metadata\.sourceAssetSha256/)
  assert.doesNotMatch(runJob[1], /sha256File\(/)
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
