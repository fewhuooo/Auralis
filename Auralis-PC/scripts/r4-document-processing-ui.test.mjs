import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { useDocumentProcessingStore } from '../src/store/useDocumentProcessingStore.ts'
import { sourceDetailLabel, sourcePhaseLabel } from '../src/utils/documentProcessingStatus.ts'
import { resumeActionErrorLabel, runManualSourceResume } from '../src/services/documentProcessing/manualSourceResume.ts'
import { copyOcrDiagnostics, formatOcrDiagnostics, updateCopyFeedback } from '../src/utils/ocrDiagnostics.ts'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

test('document processing exposes a compact status dot and profile progress center', async () => {
  assert.equal(sourcePhaseLabel('AWAITING_CLIENT'), '等待桌面端处理')
  assert.equal(sourcePhaseLabel('VALIDATING'), '服务端校验')
  assert.equal(sourcePhaseLabel('PENDING'), '服务端排队')
  assert.equal(sourcePhaseLabel('PARSING'), '服务端解析')
  assert.equal(sourcePhaseLabel('INDEXING'), '服务端建立索引')
  assert.equal(sourcePhaseLabel('FAILED'), '服务端失败')
  assert.equal(sourceDetailLabel('AWAITING_CLIENT'), '等待桌面端开始处理')
  assert.equal(sourceDetailLabel('VALIDATING'), '服务端正在校验解析结果')
  assert.equal(sourceDetailLabel('PENDING'), '等待服务端开始处理')
  assert.equal(sourceDetailLabel('PARSING'), '服务端正在解析文件')
  assert.equal(sourceDetailLabel('INDEXING'), '服务端正在建立索引')
  assert.equal(sourceDetailLabel('FAILED'), '服务端处理失败')
  assert.equal(sourcePhaseLabel(undefined), '等待状态同步')
  assert.equal(sourcePhaseLabel('UNKNOWN'), '等待状态同步')
  assert.equal(sourceDetailLabel(undefined), '处理状态尚未同步，请稍后刷新')
  assert.equal(sourceDetailLabel('UNKNOWN'), '处理状态尚未同步，请稍后刷新')
  assert.equal(sourcePhaseLabel('READY'), '处理完成')
  assert.equal(sourceDetailLabel('READY'), '处理完成')
  const dot = await source('src/components/documentProcessing/DocumentProcessingDot.vue')
  assert.match(dot, /v-if="visible"/)
  assert.match(dot, /phase !== 'READY'/)
  assert.match(dot, /FAILED_SERVER/)
  assert.match(dot, /useSourceStore/)
  assert.match(dot, /source\.value\?\.ingestionStatus/)
  assert.match(dot, /import \{ sourceDetailLabel \} from ['"]@\/utils\/documentProcessingStatus['"]/)
  assert.match(dot, /sourceDetailLabel\(sourcePhase\.value\)/)
  assert.doesNotMatch(dot, /等待桌面端处理|服务端正在校验解析结果|服务端正在处理文件|服务端正在建立索引/)
  const center = await source('src/components/documentProcessing/DocumentProcessingCenter.vue')
  assert.match(center, /v-if="!store\.isRuntimeAvailable"/)
  assert.match(center, /仅可在 Auralis 桌面端运行/)
  assert.match(center, /serverProcessingSources/)
  assert.match(center, /sourceDetailLabel\(source\.ingestionStatus\)/)
  assert.match(center, /documentProcessingStatus/)
  assert.match(center, /sourceStore\.loadSources\(\)/)
  assert.match(center, /开始本机处理/)
  assert.match(center, /sourceStore\.resumeDocumentProcessing/)
  assert.match(center, /:disabled="resumingSourceIds\.has\(source\.id\)"/)
  assert.match(center, /正在同步资料/)
  assert.match(center, /正在启动本机处理/)
  assert.match(center, /if \(resumingSourceIds\.value\.has\(sourceId\)\) return/)
  assert.match(center, /sourceActionResults\[source\.id\]/)
  assert.match(center, /SOURCE_NOT_FOUND/)
  assert.match(center, /ALREADY_READY/)
  assert.match(center, /resumeActionErrorLabel\(error, stage\)/)
  assert.match(center, /resumeScopeGeneration/)
  assert.match(center, /if \(!isCurrentAction\(\)\) return/)
  const resumeAction = center.slice(center.indexOf('const resumeSource ='), center.indexOf('const retrySource ='))
  assert.doesNotMatch(resumeAction, /error\.message|String\(error\)/,
    'manual resume must not render raw exception details')
  assert.match(center, /store\.retry/)
  assert.match(center, /store\.cancel/)
  assert.match(center, /v-else-if="source\.ingestionStatus === 'FAILED'"/)
  assert.match(center, /retrySource\(source\.id\)/)
  assert.doesNotMatch(center, /blockOrdinal > 0|已处理 .*内容块/)
  assert.match(center, /!store\.jobs\.some\(\(job\) => job\.sourceId === source\.id\)/,
    'serverProcessingSources must exclude sources with any existing job to prevent completion flash')
  assert.match(center, /min-width: 0/)
  assert.match(center, /html\.dark/)
  assert.match(center, /准备中|正在处理/)
  const processingStore = await source('src/store/useDocumentProcessingStore.ts')
  assert.match(processingStore, /attachScheduler\(/)
  assert.match(processingStore, /scheduler\.retry\(jobId\)/)
  assert.doesNotMatch(processingStore, /return this\.runner\.retry\(jobId\)/)
  const sourceStore = await source('src/store/useSourceStore.ts')
  assert.match(sourceStore, /async function resumeDocumentProcessing\([\s\S]*?onProgress\?\:/)
  assert.match(sourceStore, /async function retrySourceProcessing\(sourceId: string\)/)
  assert.match(sourceStore, /useSourceApi\.reingest\(sourceId, \{ baseVersion \}\)/)
  assert.match(sourceStore, /retrySourceProcessing,/)
  assert.match(sourceStore, /DOCUMENT_JOB_RUNNER_UNAVAILABLE/)
  const resumeIndex = sourceStore.indexOf('async function resumeDocumentProcessing(')
  assert.ok(resumeIndex >= 0, 'Source Store must expose the manual resume action')
  assert.match(sourceStore, /schedule\(sourceId, \{ revalidateNotFound: true \}\)/)
  assert.match(sourceStore, /const userId = authStore\.user\?\.id/)
  assert.match(sourceStore, /const serverDeviceId = authStore\.serverDeviceId/)
  assert.match(sourceStore, /const scheduler = documentScheduler/)
  assert.match(sourceStore, /sessionId === sessionId[\s\S]*documentScheduler === scheduler/)
  assert.match(sourceStore, /runManualSourceResume\(/)
  const resumeHelper = await source('src/services/documentProcessing/manualSourceResume.ts')
  assert.match(resumeHelper, /onProgress\?\.\('sync'\)/)
  assert.match(resumeHelper, /onProgress\?\.\('schedule'\)/)
  assert.match(resumeHelper, /await options\.flushSync\(\)[\s\S]*assertCurrentScope\(\)[\s\S]*await options\.readLocalSource\(\)[\s\S]*assertCurrentScope\(\)[\s\S]*options\.assertSourceSynced\(source\)[\s\S]*options\.schedule\(\)/)
  assert.match(sourceStore, /acceptHMRUpdate/)
  assert.match(sourceStore, /import\.meta\.hot\.accept\(acceptHMRUpdate\(useSourceStore, import\.meta\.hot\)\)/)
  const profile = await source('src/views/Profile/index.vue')
  assert.match(profile, /DocumentProcessingCenter/)
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /DocumentProcessingDot/)
  assert.match(workspace, /DocumentNotReadyDialog/)
  assert.match(workspace, /showProcessingRequired/)
  assert.match(workspace, /selectedFile\.ingestionStatus === 'FAILED'/)
  assert.match(workspace, /handleRetryFileProcessing\(selectedFile\.id\)/)
})

test('manual resume does not read or schedule after logout, account/device switch, or scheduler replacement during sync', async () => {
  const variants = [
    ['logout', (scope) => { scope.authenticated = false }],
    ['account switch', (scope) => { scope.userId = 'user-2' }],
    ['device switch', (scope) => { scope.deviceId = 'device-2' }],
    ['scheduler replacement', (scope) => { scope.scheduler = {} }],
  ]

  for (const [name, changeScope] of variants) {
    const current = { authenticated: true, userId: 'user-1', deviceId: 'device-1', sessionId: 'session-1', scheduler: {} }
    const expected = { ...current }
    let releaseSync
    let startSync
    const syncGate = new Promise((resolve) => { releaseSync = resolve })
    const syncStarted = new Promise((resolve) => { startSync = resolve })
    let reads = 0
    let schedules = 0
    let notFoundFence = true
    const attempt = runManualSourceResume({
      isScopeCurrent: () => current.authenticated
        && current.userId === expected.userId
        && current.deviceId === expected.deviceId
        && current.sessionId === expected.sessionId
        && current.scheduler === expected.scheduler,
      flushSync: async () => { startSync(); await syncGate },
      readLocalSource: async () => { reads += 1; return { syncStatus: 'synced' } },
      assertSourceSynced: (source) => { assert.equal(source?.syncStatus, 'synced') },
      schedule: async () => { schedules += 1; notFoundFence = false; return { status: 'READY' } },
    })
    await syncStarted
    changeScope(current)
    releaseSync()

    await assert.rejects(attempt, /DOCUMENT_PROCESSING_SCOPE_CHANGED/, name)
    assert.equal(reads, 0, `${name}: must not read a different scope`)
    assert.equal(schedules, 0, `${name}: must not invoke the replacement scheduler`)
    assert.equal(notFoundFence, true, `${name}: must not clear the scheduler's cached not-found fence`)
  }
})

test('manual resume exception labels allow known errors and never echo unknown details', () => {
  assert.equal(resumeActionErrorLabel(new Error('SOURCE_SYNC_CONFLICT'), 'sync'), '资料同步发生版本冲突，请刷新后重试。')
  assert.equal(resumeActionErrorLabel({ status: 503, detail: 'server-secret /private/path' }, 'schedule'), '服务暂时不可用，请稍后重试。')
  const unknown = resumeActionErrorLabel(new Error('parser-token /private/path/source.pdf'), 'schedule')
  assert.equal(unknown, '本机处理暂未启动，请刷新后重试。')
  assert.doesNotMatch(unknown, /parser-token|private\/path|source\.pdf/)
})

test('DocumentProcessingStore.start schedules by Source instead of starting the Runner directly', async () => {
  setActivePinia(createPinia())
  const store = useDocumentProcessingStore()
  const calls = []
  store.attachRunner({
    list: async () => [{ jobId: 'job-1', sourceId: 'source-1', phase: 'QUEUED' }],
    start: async () => { calls.push('runner.start') },
  })
  store.attachScheduler({
    schedule: async (sourceId) => { calls.push(`scheduler.schedule:${sourceId}`) },
  })

  await store.start('job-1')

  assert.deepEqual(calls, ['scheduler.schedule:source-1'])
})

test('DocumentProcessingStore.resumePending routes recoverable jobs through the Source scheduler', async () => {
  setActivePinia(createPinia())
  const store = useDocumentProcessingStore()
  const calls = []
  store.attachRunner({
    list: async () => [
      { jobId: 'job-1', sourceId: 'source-1', phase: 'QUEUED' },
      { jobId: 'job-2', sourceId: 'source-2', phase: 'FAILED_LOCAL' },
    ],
    resumePending: async () => { calls.push('runner.resumePending') },
  })
  store.attachScheduler({
    resume: async (sourceIds) => { calls.push(`scheduler.resume:${sourceIds.join(',')}`) },
  })

  await store.resumePending()

  assert.deepEqual(calls, ['scheduler.resume:source-1'])
})

test('Source row prefers local OCR page progress and falls back to its existing detail label', async () => {
  const center = await source('src/components/documentProcessing/DocumentProcessingCenter.vue')
  assert.match(center, /import type \{ SourceFileModel \} from ['"]@\/services\/domainMappers['"]/
  )
  assert.match(center, /const sourceDetail = \(source: SourceFileModel\): string => \{[\s\S]*const progress = store\.localOcrProgressBySource\[source\.id\][\s\S]*return progress[\s\S]*`正在识别第 \$\{progress\.currentPage\}\/\$\{progress\.totalPages\} 页`[\s\S]*sourceDetailLabel\(source\.ingestionStatus\)/
  )
  assert.match(center, /<span v-else>\{\{ sourceDetail\(source\) \}\}<\/span>/
  )
  assert.doesNotMatch(center, /<DocumentProcessingProgress\b|class="[^"]*processing-progress[^"]*"/)
})

test('OCR diagnostics formatter exposes safe progress and empty-page warning', () => {
  const formatted = formatOcrDiagnostics({
    phase: 'OCR_RUNNING',
    checkpoint: {
      pageNumber: 2,
      blockOrdinal: 1,
      diagnostic: {
        pageNumber: 2,
        totalPages: 5,
        imageBytes: 2048,
        rawLineCount: 0,
        normalizedLineCount: 0,
        totalMs: 120,
        outcome: 'empty',
      },
    },
    errorCode: null,
    errorDetail: null,
  })
  assert.equal(formatted.progressLabel, '正在识别第 2/5 页')
  assert.equal(formatted.warning, '第 2/5 页未识别到文字')
  assert.match(formatted.clipboardText, /本页结果：未识别到文字/)
  assert.match(formatted.clipboardText, /图片大小：2048 bytes/)
})

test('OCR diagnostics formatter exposes running page details', () => {
  const formatted = formatOcrDiagnostics({
    phase: 'OCR_RUNNING',
    checkpoint: { pageNumber: 3, blockOrdinal: 0, diagnostic: { pageNumber: 3, totalPages: 8, imageBytes: 99, outcome: 'running' } },
  })
  assert.equal(formatted.progressLabel, '正在识别第 3/8 页')
  assert.equal(formatted.warning, null)
  assert.equal(formatted.rows.find((row) => row.label === '本页结果')?.value, '识别中')
})

test('OCR diagnostics formatter exposes allowlisted failure detail', () => {
  const formatted = formatOcrDiagnostics({
    phase: 'FAILED_LOCAL', checkpoint: { pageNumber: 1, blockOrdinal: 0 },
    errorCode: 'OCR_TIMEOUT', errorDetail: 'sidecar timeout',
  })
  assert.equal(formatted.errorDetail, 'sidecar timeout')
  assert.match(formatted.clipboardText, /错误代码：OCR_TIMEOUT/)
  assert.match(formatted.clipboardText, /错误说明：sidecar timeout/)
})

test('OCR diagnostics localizes exact parsed-document upload failure tokens', () => {
  const labels = {
    connect: '连接失败',
    timeout: '请求超时',
    body: '响应体传输失败',
    request: '请求失败',
    client: '客户端传输失败',
    'retryable-response': '服务暂时不可用',
  }
  for (const [reason, label] of Object.entries(labels)) {
    const formatted = formatOcrDiagnostics({
      phase: 'PAUSED_NETWORK', checkpoint: null,
      errorCode: 'NETWORK_OFFLINE',
      errorDetail: `PARSED_DOCUMENT_UPLOAD_PAUSED:upload:${reason}`,
    })
    assert.equal(formatted.errorDetail, label)
    assert.match(formatted.clipboardText, new RegExp(`错误说明：${label}`))
    assert.doesNotMatch(formatted.clipboardText, /PARSED_DOCUMENT_UPLOAD_PAUSED/)
  }
})

test('OCR diagnostics rejects malformed upload details without echoing them', () => {
  const formatted = formatOcrDiagnostics({
    phase: 'PAUSED_NETWORK', checkpoint: null,
    errorCode: 'NETWORK_OFFLINE',
    errorDetail: 'PARSED_DOCUMENT_UPLOAD_PAUSED:upload:connect https://storage.example/upload?sig=secret Authorization:Bearer token',
  })
  assert.equal(formatted.errorDetail, '上传暂时无法继续，请稍后重试')
  assert.doesNotMatch(formatted.clipboardText, /storage\.example|sig=secret|Authorization|Bearer|PARSED_DOCUMENT_UPLOAD_PAUSED/)
})

test('clipboard boundary handles resolve, reject, and unsupported writers', async () => {
  let copied = ''
  assert.equal(await copyOcrDiagnostics('safe', async (text) => { copied = text }), 'copied')
  assert.equal(copied, 'safe')
  assert.equal(await copyOcrDiagnostics('safe', async () => { throw new Error('denied') }), 'failed')
  assert.equal(await copyOcrDiagnostics('safe', undefined), 'failed')
})

test('copy feedback stays isolated by job id', () => {
  const first = updateCopyFeedback({}, 'job-a', 'copied')
  const second = updateCopyFeedback(first, 'job-b', 'failed')
  assert.deepEqual(second, { 'job-a': '已复制', 'job-b': '复制失败' })
})

test('OCR diagnostics formatter ignores unknown raw keys', () => {
  const formatted = formatOcrDiagnostics({
    phase: 'FAILED_LOCAL',
    checkpoint: {
      pageNumber: 1,
      blockOrdinal: 0,
      diagnostic: {
        pageNumber: 1,
        totalPages: 1,
        imageBytes: 12,
        outcome: 'failed',
        secret: 'do-not-render',
        rawJson: '{"token":"do-not-render"}',
      },
    },
    errorCode: 'OCR_SIDECAR_UNAVAILABLE',
    errorDetail: '模型启动失败',
    raw: { token: 'do-not-render' },
  })
  assert.doesNotMatch(formatted.clipboardText, /do-not-render|rawJson|secret|token/)
  assert.match(formatted.clipboardText, /错误代码：OCR_SIDECAR_UNAVAILABLE/)
})

test('processing center has accessible disclosure and guarded copy action', async () => {
  const center = await source('src/components/documentProcessing/DocumentProcessingCenter.vue')
  assert.match(center, /<details/)
  assert.match(center, /复制诊断/)
  assert.match(center, /copyOcrDiagnostics/)
  assert.match(center, /catch/)
  assert.match(center, /aria-expanded|summary/)
})
