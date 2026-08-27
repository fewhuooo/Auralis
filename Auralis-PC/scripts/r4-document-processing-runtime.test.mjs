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
  assert.match(runtime, /processingStore\.attachRunner\(runner\)/)
  assert.match(runtime, /parserInputs\.clear\(\)/)
  assert.doesNotMatch(runtime, /localStorage\.setItem|uploadUrl\s*:/)
})

test('Tauri document runtime flushes pending sync mutations before bootstrapping sources', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  assert.match(runtime, /import\s+\{\s*useSyncStore\s*\}\s+from\s+'@\/store\/useSyncStore'/)
  const syncIndex = runtime.indexOf('await useSyncStore().triggerSync()')
  const sourceBootstrapIndex = runtime.indexOf('await sourceStore.loadSources()')
  assert.ok(syncIndex >= 0, 'runtime must attempt an initial sync cycle')
  assert.ok(sourceBootstrapIndex > syncIndex, 'source bootstrap must run after the initial sync attempt')
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
  assert.match(authStore, /isAuthenticated = computed\(\(\) => Boolean\(tokens\.value\?\.accessToken && tokens\.value\?\.refreshToken && user\.value\?\.id\)\)/)
})
