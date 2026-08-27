import { normalizeText } from './normalization.ts'
import type { OfficeDocumentSource, OfficeExtractionSource, OfficeChunkSource, ParserFile } from './types.ts'

export class OfficeTextAdapter {
  private readonly source: OfficeDocumentSource

  constructor(source: OfficeDocumentSource) {
    this.source = source
  }

  get pageCount(): number {
    return this.source.pageCount
  }

  async prepare(file: ParserFile): Promise<void> {
    await this.source.bridge.prepare(file)
  }

  async extractOrFallback(): Promise<OfficeExtractionSource> {
    const extraction = await this.source.bridge.extractOrFallback()
    if (extraction.outcome !== 'extract') return { outcome: 'bitmap-fallback', chunks: [], anchors: [] }
    const chunks = extraction.chunks
      .map((chunk) => this.normalizeChunk(chunk))
      .filter((chunk): chunk is OfficeChunkSource => chunk !== null)
      .sort((left, right) => {
        const leftIndex = left.anchor?.index ?? Number.MAX_SAFE_INTEGER
        const rightIndex = right.anchor?.index ?? Number.MAX_SAFE_INTEGER
        return (leftIndex - rightIndex) || ((left.startLine ?? Number.MAX_SAFE_INTEGER) - (right.startLine ?? Number.MAX_SAFE_INTEGER)) || left.id.localeCompare(right.id)
      })
    return chunks.length > 0
      ? { outcome: 'extract', chunks, anchors: extraction.anchors }
      : { outcome: 'bitmap-fallback', chunks: [], anchors: [] }
  }

  renderPageBitmap(pageNumber: number): Promise<Uint8Array> {
    return this.source.bridge.renderPageBitmap(pageNumber).then(async (bitmap) => {
      if (bitmap instanceof Uint8Array) return bitmap
      return new Uint8Array(await bitmap.arrayBuffer())
    })
  }

  dispose(): void {
    this.source.bridge.dispose()
  }

  private normalizeChunk(chunk: OfficeChunkSource): OfficeChunkSource | null {
    const text = normalizeText(chunk.text)
    return text ? { ...chunk, text } : null
  }
}
