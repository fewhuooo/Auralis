import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'
import { sourceDetailLabel, sourcePhaseLabel } from '../src/utils/documentProcessingStatus.ts'
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
  assert.match(center, /store\.retry/)
  assert.match(center, /store\.cancel/)
  assert.doesNotMatch(center, /blockOrdinal > 0|已处理 .*内容块/)
  assert.match(center, /准备中|正在处理/)
  const processingStore = await source('src/store/useDocumentProcessingStore.ts')
  assert.match(processingStore, /attachScheduler\(/)
  assert.match(processingStore, /scheduler\.retry\(jobId\)/)
  assert.doesNotMatch(processingStore, /return this\.runner\.retry\(jobId\)/)
  const sourceStore = await source('src/store/useSourceStore.ts')
  assert.match(sourceStore, /async function resumeDocumentProcessing\(sourceId: string\)/)
  assert.match(sourceStore, /DOCUMENT_JOB_RUNNER_UNAVAILABLE/)
  const resumeIndex = sourceStore.indexOf('async function resumeDocumentProcessing(sourceId: string)')
  const syncIndex = sourceStore.indexOf('await useSyncStore().flushNow()', resumeIndex)
  const sourceScheduleIndex = sourceStore.indexOf('await documentScheduler.schedule(sourceId)', resumeIndex)
  assert.ok(resumeIndex >= 0, 'Source Store must expose the manual resume action')
  assert.ok(syncIndex > resumeIndex && syncIndex < sourceScheduleIndex,
    'manual processing must finish Source synchronization before scheduler reads the server Source')
  assert.match(sourceStore, /const localSource = await \(await repository\(\)\)\.read<SourceView>\('SOURCE', sourceId\)/)
  assert.match(sourceStore, /localSource\.syncStatus !== 'synced'/)
  assert.match(sourceStore, /资料尚未同步到服务端/)
  assert.match(sourceStore, /acceptHMRUpdate/)
  assert.match(sourceStore, /import\.meta\.hot\.accept\(acceptHMRUpdate\(useSourceStore, import\.meta\.hot\)\)/)
  const profile = await source('src/views/Profile/index.vue')
  assert.match(profile, /DocumentProcessingCenter/)
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /DocumentProcessingDot/)
  assert.match(workspace, /DocumentNotReadyDialog/)
  assert.match(workspace, /showProcessingRequired/)
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
