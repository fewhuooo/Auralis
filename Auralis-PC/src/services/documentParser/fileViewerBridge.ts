import type {
  FileViewerDocumentAnchor,
  FileViewerDocumentChunk,
  FileViewerExpose,
} from '@file-viewer/vue3'

export const OFFICE_TEXT_UNAVAILABLE = 'OFFICE_TEXT_UNAVAILABLE' as const
export const OFFICE_BITMAP_FALLBACK = 'bitmap-fallback' as const
export const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx'])

export type OfficeParserOutcome = 'extract' | typeof OFFICE_BITMAP_FALLBACK

export interface BackgroundParserHostHandle {
  prepare(file: File): Promise<void>
  extractChunks(): FileViewerDocumentChunk[]
  extractAnchors(): Promise<FileViewerDocumentAnchor[]>
  renderPageBitmap(pageNumber: number): Promise<Blob>
  getPageCount?(): number
  dispose(): void
}

export interface FileViewerParserBridgeHost {
  value: BackgroundParserHostHandle | null
}

export class OfficeParserError extends Error {
  readonly code: typeof OFFICE_TEXT_UNAVAILABLE

  constructor(message = 'File Viewer did not expose ordered Office text') {
    super(message)
    this.name = 'OfficeParserError'
    this.code = OFFICE_TEXT_UNAVAILABLE
  }
}

function extensionOf(file: Pick<File, 'name'>): string {
  const dot = file.name.lastIndexOf('.')
  return dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase()
}

export function isOfficeFile(file: Pick<File, 'name'>): boolean {
  return OFFICE_EXTENSIONS.has(extensionOf(file))
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
}

function orderedChunks(chunks: FileViewerDocumentChunk[]): FileViewerDocumentChunk[] {
  return chunks
    .filter((chunk) => normalizeText(chunk.text).length > 0)
    .map((chunk) => ({ ...chunk, text: normalizeText(chunk.text) }))
    .sort((left, right) => {
      const leftLine = Number.isFinite(left.startLine) ? left.startLine : Number.MAX_SAFE_INTEGER
      const rightLine = Number.isFinite(right.startLine) ? right.startLine : Number.MAX_SAFE_INTEGER
      return (left.anchor.index - right.anchor.index) || (leftLine - rightLine) || left.id.localeCompare(right.id)
    })
}

function orderedAnchors(anchors: FileViewerDocumentAnchor[]): FileViewerDocumentAnchor[] {
  return anchors
    .filter((anchor) => normalizeText(anchor.text).length > 0)
    .map((anchor) => ({ ...anchor, text: normalizeText(anchor.text) }))
    .sort((left, right) => (left.index - right.index) || (left.line - right.line) || left.id.localeCompare(right.id))
}

export class FileViewerParserBridge {
  private readonly host: FileViewerParserBridgeHost | (() => BackgroundParserHostHandle | null)
  private preparedFile: File | null = null

  constructor(host: FileViewerParserBridgeHost | (() => BackgroundParserHostHandle | null)) {
    this.host = host
  }

  private currentHost(): BackgroundParserHostHandle {
    const host = typeof this.host === 'function' ? this.host() : this.host.value
    if (!host) throw new OfficeParserError('BackgroundParserHost is not mounted')
    return host
  }

  async prepare(file: File): Promise<void> {
    if (!isOfficeFile(file)) throw new OfficeParserError(`Unsupported Office extension: ${file.name}`)
    await this.currentHost().prepare(file)
    this.preparedFile = file
  }

  extractChunks(): FileViewerDocumentChunk[] {
    if (!this.preparedFile) throw new OfficeParserError('prepare(file) must run before extractChunks()')
    const chunks = orderedChunks(this.currentHost().extractChunks())
    if (chunks.length === 0) throw new OfficeParserError()
    return chunks
  }

  async extractAnchors(): Promise<FileViewerDocumentAnchor[]> {
    if (!this.preparedFile) throw new OfficeParserError('prepare(file) must run before extractAnchors()')
    const anchors = orderedAnchors(await this.currentHost().extractAnchors())
    if (anchors.length === 0) throw new OfficeParserError()
    return anchors
  }

  async renderPageBitmap(pageNumber: number): Promise<Blob> {
    if (!this.preparedFile) throw new OfficeParserError('prepare(file) must run before renderPageBitmap()')
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new OfficeParserError('pageNumber must be positive')
    return this.currentHost().renderPageBitmap(pageNumber)
  }

  async extractOrFallback(): Promise<{
    outcome: OfficeParserOutcome
    chunks: FileViewerDocumentChunk[]
    anchors: FileViewerDocumentAnchor[]
  }> {
    try {
      const anchors = await this.extractAnchors()
      const chunks = this.extractChunks()
      return { outcome: 'extract', chunks, anchors }
    } catch (error) {
      if (!(error instanceof OfficeParserError) || error.code !== OFFICE_TEXT_UNAVAILABLE) throw error
      return { outcome: OFFICE_BITMAP_FALLBACK, chunks: [], anchors: [] }
    }
  }

  dispose(): void {
    try {
      this.currentHost().dispose()
    } finally {
      this.preparedFile = null
    }
  }
}

export type FileViewerParserController = Pick<FileViewerExpose, 'getDocumentTextChunks' | 'collectDocumentAnchors' | 'applyViewState'>
