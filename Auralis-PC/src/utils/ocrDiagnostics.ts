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

const outcomeLabel: Record<string, string> = {
  running: '识别中',
  text: '已识别文字',
  empty: '未识别到文字',
  failed: '失败',
}

const safeText = (value: string, max = 240): string => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)

const uploadFailureLabels: Record<string, string> = {
  connect: '连接失败',
  timeout: '请求超时',
  body: '响应体传输失败',
  request: '请求失败',
  client: '客户端传输失败',
  'retryable-response': '服务暂时不可用',
}

const genericUploadFailure = '上传暂时无法继续，请稍后重试'

function localizeUploadFailure(errorDetail: string): string | null {
  const match = /^PARSED_DOCUMENT_UPLOAD_PAUSED:(?:upload|complete):(connect|timeout|body|request|client|retryable-response)$/.exec(errorDetail)
  return match ? uploadFailureLabels[match[1]] : null
}

export function formatOcrDiagnostics(input: OcrDiagnosticInput): OcrDiagnosticsView {
  const diagnostic = input.checkpoint?.diagnostic
  const rows: OcrDiagnosticRow[] = []
  const pageNumber = diagnostic?.pageNumber ?? input.checkpoint?.pageNumber ?? 0
  const totalPages = diagnostic?.totalPages ?? 0
  const pageLabel = pageNumber > 0 && totalPages > 0 ? `${pageNumber}/${totalPages}` : null

  if (pageLabel) rows.push({ group: '本页诊断', label: '文档页码', value: pageLabel })
  if (diagnostic) {
    rows.push({ group: '本页诊断', label: '本页结果', value: outcomeLabel[diagnostic.outcome] || '状态未知' })
    rows.push({ group: '本页诊断', label: '本页图片大小', value: `${diagnostic.imageBytes} bytes` })
    if (diagnostic.rawLineCount !== undefined) rows.push({ group: '本页诊断', label: '本页原始行数', value: String(diagnostic.rawLineCount) })
    if (diagnostic.normalizedLineCount !== undefined) rows.push({ group: '本页诊断', label: '本页规范化行数', value: String(diagnostic.normalizedLineCount) })
    if (diagnostic.totalMs !== undefined) rows.push({ group: '本页诊断', label: '本页耗时', value: `${diagnostic.totalMs} ms` })

    if (diagnostic.ocrProcessedPages !== undefined) rows.push({ group: '本地 OCR 摘要', label: '累计处理页数', value: String(diagnostic.ocrProcessedPages) })
    if (diagnostic.ocrTextPages !== undefined) rows.push({ group: '本地 OCR 摘要', label: '有效文本页', value: String(diagnostic.ocrTextPages) })
    if (diagnostic.ocrEmptyPages !== undefined) rows.push({ group: '本地 OCR 摘要', label: '空白页', value: String(diagnostic.ocrEmptyPages) })
    if (diagnostic.totalRawLineCount !== undefined) rows.push({ group: '本地 OCR 摘要', label: '累计原始行数', value: String(diagnostic.totalRawLineCount) })
    if (diagnostic.totalNormalizedLineCount !== undefined) rows.push({ group: '本地 OCR 摘要', label: '累计规范化行数', value: String(diagnostic.totalNormalizedLineCount) })
  }
  const errorCode = typeof input.errorCode === 'string' ? safeText(input.errorCode, 80) : ''
  const errorDetail = typeof input.errorDetail === 'string' ? safeText(input.errorDetail) : ''
  const isOffline = input.phase === 'PAUSED_NETWORK' || errorCode === 'NETWORK_OFFLINE'
  const localizedErrorDetail = isOffline
    ? (localizeUploadFailure(errorDetail) || genericUploadFailure)
    : errorDetail
  if (errorCode) rows.push({ group: '当前处理状态', label: '错误代码', value: errorCode })
  if (localizedErrorDetail) rows.push({ group: '当前处理状态', label: '错误说明', value: localizedErrorDetail })

  let progressLabel = input.phase === 'OCR_RUNNING' && pageLabel ? `正在识别第 ${pageLabel} 页` : null
  if (isOffline) progressLabel = '本地解析已完成，等待网络继续上传'

  const warning = diagnostic?.outcome === 'empty' && pageLabel ? `第 ${pageLabel} 页未识别到文字` : null

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
  current: Record<string, string>,
  jobId: string,
  status: 'copied' | 'failed',
): Record<string, string> {
  return { ...current, [jobId]: status === 'copied' ? '已复制' : '复制失败' }
}
