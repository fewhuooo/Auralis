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
}

export interface OcrPageRequest {
  taskId: string
  pageNumber: number
  imageBytes: Uint8Array
}

export interface OcrPageResult {
  lines: Array<string | { text?: string }>
  model?: string
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

export interface DocumentParserInput {
  file: ParserFile
  pdf?: PdfDocumentSource
  office?: OfficeDocumentSource
  ocr?: OcrAdapter
  taskId?: string
}

export interface DocumentParserOptions {
  textLayerMinChars?: number
  maxBlockChars?: number
}
