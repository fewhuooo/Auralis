import type { t, Message } from '../i18n.ts'
import type { DocumentJobCheckpoint, DocumentJobPhase } from '@/types/documentProcessing'

export interface OcrDiagnosticInput {
  phase: DocumentJobPhase | string
  checkpoint?: DocumentJobCheckpoint | null
  errorCode?: string | null
  errorDetail?: string | null
}

export interface OcrDiagnosticRow {
  group?: string
  label: string
  value: string
}

export interface OcrDiagnosticsView {
  progressLabel: string | null
  warning: string | null
  errorDetail: string | null
  rows: OcrDiagnosticRow[]
  clipboardText: string
}

export type ClipboardWriter = (text: string) => Promise<void>

const safeText = (value: string, max = 240): string => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)

const outcomes: Record<string, Message> = {
  running: { 'zh-CN': '识别中', en: 'Recognizing text', ja: 'テキスト認識中' },
  text: { 'zh-CN': '已识别文字', en: 'Text recognized', ja: 'テキストを認識しました' },
  empty: { 'zh-CN': '未识别到文字', en: 'No text recognized', ja: 'テキストを認識できませんでした' },
  failed: { 'zh-CN': '失败', en: 'Failed', ja: '失敗' },
}

const uploadFailures: Record<string, Message> = {
  connect: { 'zh-CN': '连接失败', en: 'Connection failed', ja: '接続に失敗しました' },
  timeout: { 'zh-CN': '请求超时', en: 'Request timed out', ja: 'リクエストがタイムアウトしました' },
  body: { 'zh-CN': '响应体传输失败', en: 'Response transfer failed', ja: '応答の転送に失敗しました' },
  request: { 'zh-CN': '请求失败', en: 'Request failed', ja: 'リクエストに失敗しました' },
  client: { 'zh-CN': '客户端传输失败', en: 'Client transfer failed', ja: 'クライアントの転送に失敗しました' },
  'retryable-response': { 'zh-CN': '服务暂时不可用', en: 'Service temporarily unavailable', ja: 'サービスは一時的に利用できません' },
}

const messages = {
  uploadPaused: { 'zh-CN': '上传暂时无法继续，请稍后重试', en: 'Upload paused. Try again later.', ja: 'アップロードが一時停止しました。しばらくしてから再試行してください。' },
  page: { 'zh-CN': '本页诊断', en: 'Page diagnostics', ja: 'ページの診断' },
  pageNumber: { 'zh-CN': '文档页码', en: 'Page number', ja: 'ページ番号' },
  outcome: { 'zh-CN': '本页结果', en: 'Page result', ja: 'ページの結果' },
  unknown: { 'zh-CN': '状态未知', en: 'Unknown status', ja: '不明な状態' },
  imageBytes: { 'zh-CN': '本页图片大小', en: 'Page image size', ja: 'ページ画像のサイズ' },
  rawLines: { 'zh-CN': '本页原始行数', en: 'Raw lines on this page', ja: 'ページの元の行数' },
  normalizedLines: { 'zh-CN': '本页规范化行数', en: 'Normalized lines on this page', ja: 'ページの正規化済み行数' },
  duration: { 'zh-CN': '本页耗时', en: 'Page processing time', ja: 'ページの処理時間' },
  ocrSummary: { 'zh-CN': '本地 OCR 摘要', en: 'Local OCR summary', ja: 'ローカル OCR の概要' },
  processedPages: { 'zh-CN': '累计处理页数', en: 'Processed pages', ja: '処理済みページ数' },
  textPages: { 'zh-CN': '有效文本页', en: 'Pages with text', ja: 'テキストがあるページ数' },
  emptyPages: { 'zh-CN': '空白页', en: 'Blank pages', ja: '空白ページ数' },
  totalRawLines: { 'zh-CN': '累计原始行数', en: 'Total raw lines', ja: '元の行数の合計' },
  totalNormalizedLines: { 'zh-CN': '累计规范化行数', en: 'Total normalized lines', ja: '正規化済み行数の合計' },
  processingStatus: { 'zh-CN': '当前处理状态', en: 'Current processing status', ja: '現在の処理状況' },
  errorCode: { 'zh-CN': '错误代码', en: 'Error code', ja: 'エラーコード' },
  errorDetail: { 'zh-CN': '错误说明', en: 'Error description', ja: 'エラーの説明' },
  progress: { 'zh-CN': '正在识别第 {page} 页', en: 'Recognizing page {page}', ja: 'ページ {page} を認識中' },
  waitingNetwork: { 'zh-CN': '本地解析已完成，等待网络继续上传', en: 'Local parsing complete. Waiting for network to upload.', ja: 'ローカルでの解析が完了しました。アップロードには接続が必要です。' },
  blankWarning: { 'zh-CN': '第 {page} 页未识别到文字', en: 'No text recognized on page {page}', ja: 'ページ {page} のテキストを認識できませんでした' },
}

export function formatOcrDiagnostics(
  input: OcrDiagnosticInput,
  translate: typeof t = (message, params) => message['zh-CN'].replace('{page}', String(params?.page ?? '')),
): OcrDiagnosticsView {
  const diagnostic = input.checkpoint?.diagnostic
  const rows: OcrDiagnosticRow[] = []
  const pageNumber = diagnostic?.pageNumber ?? input.checkpoint?.pageNumber ?? 0
  const totalPages = diagnostic?.totalPages ?? 0
  const pageLabel = pageNumber > 0 && totalPages > 0 ? `${pageNumber}/${totalPages}` : null

  if (pageLabel) rows.push({ group: translate(messages.page), label: translate(messages.pageNumber), value: pageLabel })
  if (diagnostic) {
    rows.push({ group: translate(messages.page), label: translate(messages.outcome), value: translate(outcomes[diagnostic.outcome] ?? messages.unknown) })
    rows.push({ group: translate(messages.page), label: translate(messages.imageBytes), value: `${diagnostic.imageBytes} bytes` })
    if (diagnostic.rawLineCount !== undefined) rows.push({ group: translate(messages.page), label: translate(messages.rawLines), value: String(diagnostic.rawLineCount) })
    if (diagnostic.normalizedLineCount !== undefined) rows.push({ group: translate(messages.page), label: translate(messages.normalizedLines), value: String(diagnostic.normalizedLineCount) })
    if (diagnostic.totalMs !== undefined) rows.push({ group: translate(messages.page), label: translate(messages.duration), value: `${diagnostic.totalMs} ms` })

    if (diagnostic.ocrProcessedPages !== undefined) rows.push({ group: translate(messages.ocrSummary), label: translate(messages.processedPages), value: String(diagnostic.ocrProcessedPages) })
    if (diagnostic.ocrTextPages !== undefined) rows.push({ group: translate(messages.ocrSummary), label: translate(messages.textPages), value: String(diagnostic.ocrTextPages) })
    if (diagnostic.ocrEmptyPages !== undefined) rows.push({ group: translate(messages.ocrSummary), label: translate(messages.emptyPages), value: String(diagnostic.ocrEmptyPages) })
    if (diagnostic.totalRawLineCount !== undefined) rows.push({ group: translate(messages.ocrSummary), label: translate(messages.totalRawLines), value: String(diagnostic.totalRawLineCount) })
    if (diagnostic.totalNormalizedLineCount !== undefined) rows.push({ group: translate(messages.ocrSummary), label: translate(messages.totalNormalizedLines), value: String(diagnostic.totalNormalizedLineCount) })
  }
  const errorCode = typeof input.errorCode === 'string' ? safeText(input.errorCode, 80) : ''
  const errorDetail = typeof input.errorDetail === 'string' ? safeText(input.errorDetail) : ''
  const isOffline = input.phase === 'PAUSED_NETWORK' || errorCode === 'NETWORK_OFFLINE'
  const uploadFailure = /^PARSED_DOCUMENT_UPLOAD_PAUSED:(?:upload|complete):(connect|timeout|body|request|client|retryable-response)$/.exec(errorDetail)
  const localizedErrorDetail = isOffline
    ? translate((uploadFailure && uploadFailures[uploadFailure[1]]) || messages.uploadPaused)
    : errorDetail
  if (errorCode) rows.push({ group: translate(messages.processingStatus), label: translate(messages.errorCode), value: errorCode })
  if (localizedErrorDetail) rows.push({ group: translate(messages.processingStatus), label: translate(messages.errorDetail), value: localizedErrorDetail })

  let progressLabel = input.phase === 'OCR_RUNNING' && pageLabel ? translate(messages.progress, { page: pageLabel }) : null
  if (isOffline) progressLabel = translate(messages.waitingNetwork)

  const warning = diagnostic?.outcome === 'empty' && pageLabel ? translate(messages.blankWarning, { page: pageLabel }) : null

  const groupMap = new Map<string, string[]>()
  for (const row of rows) {
    const group = row.group || '其他'
    if (!groupMap.has(group)) groupMap.set(group, [])
    groupMap.get(group)!.push(`${row.label}：${row.value}`)
  }
  const clipboardTextParts: string[] = []
  for (const [group, lines] of groupMap.entries()) {
    clipboardTextParts.push(`[${group}]\n${lines.join('\n')}`)
  }
  const clipboardText = clipboardTextParts.join('\n\n')

  return { progressLabel, warning, errorDetail: localizedErrorDetail || null, rows, clipboardText }
}

export async function copyOcrDiagnostics(text: string, writer?: ClipboardWriter): Promise<'copied' | 'failed'> {
  const clipboardWriter = writer || (globalThis.navigator?.clipboard?.writeText
    ? globalThis.navigator.clipboard.writeText.bind(globalThis.navigator.clipboard)
    : undefined)
  if (!clipboardWriter) return 'failed'
  try {
    await clipboardWriter(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function updateCopyFeedback(
  current: Partial<Record<string, 'copied' | 'failed'>>,
  jobId: string,
  status: 'copied' | 'failed',
): Partial<Record<string, 'copied' | 'failed'>> {
  return { ...current, [jobId]: status }
}
