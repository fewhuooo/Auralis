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
  type OcrAdapter,
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

  const emit = async (block: Omit<ParsedBlock, 'ordinal'>): Promise<void> => {
    const text = assertBoundedText(normalizeText(block.text), maxBlockChars)
    if (!text) return
    await sink({ ...block, text, ordinal })
    ordinal += 1
    blockCount += 1
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
        const result = await requireOcr(ocr).recognizePage({ taskId, pageNumber, imageBytes: page.bitmap! })
        const text = normalizeOcrLines(result.lines)
        if (!text) throw new Error('OCR_TEXT_EMPTY')
        await emit({ kind: 'ocr-page', pageNumber, text })
      }
    } finally {
      await input.pdf.destroy?.()
    }
    return {
      parser: DOCUMENT_PARSER_NAME,
      version: DOCUMENT_PARSER_VERSION,
      normalization: normalizationVersion(),
      ocrModel: ocr?.model || null,
      blockCount,
    }
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
        const result = await ocr.recognizePage({ taskId, pageNumber, imageBytes: bitmap })
        const text = normalizeOcrLines(result.lines)
        if (!text) throw new Error('OCR_TEXT_EMPTY')
        await emit({ kind: 'ocr-page', pageNumber, text })
      }
    }
  } finally {
    office.dispose()
  }

  return {
    parser: DOCUMENT_PARSER_NAME,
    version: DOCUMENT_PARSER_VERSION,
    normalization: normalizationVersion(),
    ocrModel: input.ocr?.model || null,
    blockCount,
  }
}
