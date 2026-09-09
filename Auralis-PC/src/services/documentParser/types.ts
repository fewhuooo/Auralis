export const DOCUMENT_PARSER_NAME = 'auralis-document-parser' as const
export const DOCUMENT_PARSER_VERSION = '1.0.0' as const
export const NORMALIZATION_VERSION = 'nfkc-lf-trim' as const

export type ParsedBlockKind = 'paragraph' | 'page' | 'slide' | 'ocr-page'

export interface ParsedBlock {
  ordinal: number
  kind: ParsedBlockKind
  text: string
  pageNumber?: number
  anchorIndex?: number
  startLine?: number
}

export interface ParserSummary {
  parser: typeof DOCUMENT_PARSER_NAME
  version: typeof DOCUMENT_PARSER_VERSION
  normalization: typeof NORMALIZATION_VERSION
  ocrModel: string | null
  blockCount: number
}

export interface ParserFile {
  name: string
  type?: string
  size?: number
}

export interface PdfPageSource {
  getText(): Promise<string>
  renderBitmap(): Promise<Uint8Array>
}

export interface PdfDocumentSource {
  pageCount: number
  getPage(pageNumber: number): Promise<PdfPageSource>
  /** Releases PDF.js worker resources after the parser has consumed the file. */
  destroy?(): Promise<void>
}

export interface OcrPageRequest {
  taskId: string
  pageNumber: number
  imageBytes: Uint8Array
}

export interface OcrPageResult {
  lines: Array<string | { text?: string }>
  timingMs?: { det: number; rec: number; total: number }
  model?: string
}

export interface OcrTimingMs {
  det: number
  rec: number
  total: number
}

export interface DocumentParserCumulativeStats {
  ocrProcessedPages: number
  ocrTextPages: number
  ocrEmptyPages: number
  totalRawLineCount: number
  totalNormalizedLineCount: number
}

export type DocumentParserProgress =
  | { type: 'before-recognize'; pageNumber: number; totalPages: number; imageBytes: number }
  | { type: 'after-recognize'; pageNumber: number; totalPages: number; imageBytes: number; rawLineCount: number; timingMs: OcrTimingMs }
  | ({ type: 'after-normalize'; pageNumber: number; totalPages: number; imageBytes: number; rawLineCount: number; normalizedLineCount: number; timingMs: OcrTimingMs } & DocumentParserCumulativeStats)
  | ({ type: 'page-result'; pageNumber: number; totalPages: number; imageBytes: number; rawLineCount: number; normalizedLineCount: number; timingMs: OcrTimingMs } & DocumentParserCumulativeStats)
  | ({ type: 'empty-page'; pageNumber: number; totalPages: number; imageBytes: number; rawLineCount: number; normalizedLineCount: number; timingMs: OcrTimingMs } & DocumentParserCumulativeStats)

export class OcrDocumentEmptyError extends Error {
  readonly code = 'OCR_DOCUMENT_EMPTY'
  readonly diagnostic: { pageNumber: number; totalPages: number; imageBytes: number; rawLineCount: number; normalizedLineCount: number; timingMs: OcrTimingMs } & DocumentParserCumulativeStats
  constructor(diagnostic: { pageNumber: number; totalPages: number; imageBytes: number; rawLineCount: number; normalizedLineCount: number; timingMs: OcrTimingMs } & DocumentParserCumulativeStats) {
    super('OCR_DOCUMENT_EMPTY')
    this.name = 'OcrDocumentEmptyError'
    this.diagnostic = diagnostic
  }
}

export interface OcrAdapter {
  recognizePage(request: OcrPageRequest): Promise<OcrPageResult>
  readonly model?: string
}

export interface OfficeChunkSource {
  id: string
  text: string
  anchor?: { index: number }
  startLine?: number
}

export interface OfficeExtractionSource {
  outcome: 'extract' | 'bitmap-fallback'
  chunks: OfficeChunkSource[]
  anchors: Array<{ id?: string; index: number; line: number; text: string }>
}

export interface OfficeParserBridgeSource {
  prepare(file: ParserFile): Promise<void>
  extractOrFallback(): Promise<OfficeExtractionSource>
  renderPageBitmap(pageNumber: number): Promise<Uint8Array | Blob>
  dispose(): void
}

export interface OfficeDocumentSource {
  pageCount: number
  bridge: OfficeParserBridgeSource
}

export interface PptxSlideSource {
  getText(): Promise<string>
}

export interface PptxDocumentSource {
  slideCount: number
  getSlide(slideNumber: number): Promise<PptxSlideSource>
  destroy?(): Promise<void>
}

export interface DocumentParserInput {
  file: ParserFile
  pdf?: PdfDocumentSource
  office?: OfficeDocumentSource
  pptx?: PptxDocumentSource
  ocr?: OcrAdapter
  taskId?: string
}

export interface DocumentParserOptions {
  textLayerMinChars?: number
  maxBlockChars?: number
  onProgress?: (event: DocumentParserProgress) => void | Promise<void>
}
