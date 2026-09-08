import type { DocumentJobCheckpoint, DocumentJobPhase } from '@/types/documentProcessing'

export interface OcrDiagnosticInput {
  phase: DocumentJobPhase | string
  checkpoint?: DocumentJobCheckpoint | null
  errorCode?: string | null
  errorDetail?: string | null
}

export interface OcrDiagnosticRow {
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

export function formatOcrDiagnostics(input: OcrDiagnosticInput): OcrDiagnosticsView {
  const diagnostic = input.checkpoint?.diagnostic
  const rows: OcrDiagnosticRow[] = []
  const pageNumber = diagnostic?.pageNumber ?? input.checkpoint?.pageNumber ?? 0
  const totalPages = diagnostic?.totalPages ?? 0
  const pageLabel = pageNumber > 0 && totalPages > 0 ? `${pageNumber}/${totalPages}` : null

  if (pageLabel) rows.push({ label: '页码', value: pageLabel })
  if (diagnostic) {
    rows.push({ label: '结果', value: outcomeLabel[diagnostic.outcome] || '状态未知' })
    rows.push({ label: '图片大小', value: `${diagnostic.imageBytes} bytes` })
    if (diagnostic.rawLineCount !== undefined) rows.push({ label: '原始行数', value: String(diagnostic.rawLineCount) })
    if (diagnostic.normalizedLineCount !== undefined) rows.push({ label: '规范化行数', value: String(diagnostic.normalizedLineCount) })
    if (diagnostic.totalMs !== undefined) rows.push({ label: '耗时', value: `${diagnostic.totalMs} ms` })
  }
  const errorCode = typeof input.errorCode === 'string' ? safeText(input.errorCode, 80) : ''
  const errorDetail = typeof input.errorDetail === 'string' ? safeText(input.errorDetail) : ''
  if (errorCode) rows.push({ label: '错误代码', value: errorCode })
  if (errorDetail) rows.push({ label: '错误说明', value: errorDetail })

  const progressLabel = input.phase === 'OCR_RUNNING' && pageLabel ? `正在识别第 ${pageLabel} 页` : null
  const warning = diagnostic?.outcome === 'empty' && pageLabel ? `第 ${pageLabel} 页未识别到文字` : null
  const clipboardText = rows.map((row) => `${row.label}：${row.value}`).join('\n')
  return { progressLabel, warning, errorDetail: errorDetail || null, rows, clipboardText }
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
