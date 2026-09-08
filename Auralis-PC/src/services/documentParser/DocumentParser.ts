import { isOfficeFile } from './fileViewerBridge.ts'
import { normalizeOcrLines } from './normalization.ts'
import { DEFAULT_MAX_BLOCK_CHARS, assertBoundedText, normalizationVersion, normalizeText } from './normalization.ts'
import { OfficeTextAdapter } from './OfficeTextAdapter.ts'
import { PdfTextAdapter } from './PdfTextAdapter.ts'
import type { PptxDocumentSource } from './types.ts'
import {
  DOCUMENT_PARSER_NAME,
  DOCUMENT_PARSER_VERSION,
  type DocumentParserInput,
  type DocumentParserOptions,
  type DocumentParserProgress,
  type OcrAdapter,
  type OcrTimingMs,
  OcrDocumentEmptyError,
  type ParsedBlock,
  type ParserSummary,
} from './types.ts'

type BlockSink = (block: ParsedBlock) => Promise<void>

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function requireOcr(ocr: OcrAdapter | undefined): OcrAdapter {
  if (!ocr) throw new Error('OCR_ADAPTER_REQUIRED')
  return ocr
}

function byteCount(bitmap: Uint8Array | Blob): number {
  return bitmap instanceof Uint8Array ? bitmap.byteLength : bitmap.size
}

function safeTiming(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function timingOf(value: OcrTimingMs | undefined): OcrTimingMs {
  return { det: safeTiming(value?.det), rec: safeTiming(value?.rec), total: safeTiming(value?.total) }
}

export async function parseDocument(
  input: DocumentParserInput,
  sink: BlockSink,
  options: DocumentParserOptions = {},
): Promise<ParserSummary> {
  if (!input?.file?.name || typeof sink !== 'function') throw new Error('DOCUMENT_INPUT_INVALID')
  const maxBlockChars = options.maxBlockChars ?? DEFAULT_MAX_BLOCK_CHARS
  const taskId = input.taskId || 'document-parser'
  let ordinal = 0
  let blockCount = 0
  let attemptedOcr = false
  let lastEmptyDiagnostic: ConstructorParameters<typeof OcrDocumentEmptyError>[0] | undefined
  const progress = async (event: DocumentParserProgress): Promise<void> => { await options.onProgress?.(event) }

  const emit = async (block: Omit<ParsedBlock, 'ordinal'>): Promise<void> => {
    const text = assertBoundedText(normalizeText(block.text), maxBlockChars)
    if (!text) return
    await sink({ ...block, text, ordinal })
    ordinal += 1
    blockCount += 1
  }

  const emitOcrPage = async (bitmap: Uint8Array | Blob, pageNumber: number, totalPages: number, ocr: OcrAdapter): Promise<void> => {
    const imageBytes = byteCount(bitmap)
    attemptedOcr = true
    await progress({ type: 'before-recognize', pageNumber, totalPages, imageBytes })
    const result = await ocr.recognizePage({ taskId, pageNumber, imageBytes: bitmap instanceof Uint8Array ? bitmap : new Uint8Array(await bitmap.arrayBuffer()) })
    const rawLineCount = result.lines.length
    const timingMs = timingOf(result.timingMs)
    await progress({ type: 'after-recognize', pageNumber, totalPages, imageBytes, rawLineCount, timingMs })
    const text = normalizeOcrLines(result.lines)
    const normalizedLineCount = text ? text.split('\n').length : 0
    await progress({ type: 'after-normalize', pageNumber, totalPages, imageBytes, rawLineCount, normalizedLineCount, timingMs })
    const diagnostic = { pageNumber, totalPages, imageBytes, rawLineCount, normalizedLineCount, timingMs }
    if (!text) {
      lastEmptyDiagnostic = diagnostic
      await progress({ type: 'empty-page', ...diagnostic })
      return
    }
    await emit({ kind: 'ocr-page', pageNumber, text })
    await progress({ type: 'page-result', ...diagnostic })
  }

  const finish = (ocrModel: string | null): ParserSummary => {
    if (attemptedOcr && blockCount === 0 && lastEmptyDiagnostic) throw new OcrDocumentEmptyError(lastEmptyDiagnostic)
    return { parser: DOCUMENT_PARSER_NAME, version: DOCUMENT_PARSER_VERSION, normalization: normalizationVersion(), ocrModel, blockCount }
  }

  const extension = extensionOf(input.file.name)
  if (extension === 'pdf') {
    if (!input.pdf) throw new Error('PDF_SOURCE_REQUIRED')
    const pdf = new PdfTextAdapter(input.pdf)
    const ocr = input.ocr
    try {
      for (let pageNumber = 1; pageNumber <= pdf.pageCount; pageNumber += 1) {
        const page = await pdf.readPage(pageNumber)
        if (page.classification === 'text') {
          await emit({ kind: 'page', pageNumber, text: page.text })
          continue
        }
        await emitOcrPage(page.bitmap!, pageNumber, pdf.pageCount, requireOcr(ocr))
      }
    } finally {
      await input.pdf.destroy?.()
    }
    return finish(ocr?.model || null)
  }

  if (extension === 'pptx' && input.pptx) {
    const pptx: PptxDocumentSource = input.pptx
    try {
      for (let slideNumber = 1; slideNumber <= pptx.slideCount; slideNumber += 1) {
        const slide = await pptx.getSlide(slideNumber)
        await emit({ kind: 'slide', pageNumber: slideNumber, text: await slide.getText() })
      }
    } finally {
      await pptx.destroy?.()
    }
    return {
      parser: DOCUMENT_PARSER_NAME,
      version: DOCUMENT_PARSER_VERSION,
      normalization: normalizationVersion(),
      ocrModel: null,
      blockCount,
    }
  }

  if (!isOfficeFile(input.file) || !input.office) throw new Error('OFFICE_SOURCE_REQUIRED')
  const office = new OfficeTextAdapter(input.office)
  await office.prepare(input.file)
  try {
    const extraction = await office.extractOrFallback()
    if (extraction.outcome === 'extract') {
      for (const chunk of extraction.chunks) {
        await emit({
          kind: 'slide',
          text: chunk.text,
          anchorIndex: chunk.anchor?.index,
          startLine: chunk.startLine,
        })
      }
    } else {
      const ocr = requireOcr(input.ocr)
      for (let pageNumber = 1; pageNumber <= office.pageCount; pageNumber += 1) {
        const bitmap = await office.renderPageBitmap(pageNumber)
        await emitOcrPage(bitmap, pageNumber, office.pageCount, ocr)
      }
    }
  } finally {
    office.dispose()
  }

  return finish(input.ocr?.model || null)
}
