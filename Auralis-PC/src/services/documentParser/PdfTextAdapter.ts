import { normalizeText } from './normalization.ts'
import { PdfPageClassifier } from './PdfPageClassifier.ts'
import type { PdfDocumentSource } from './types.ts'

export async function openPdfDocument(bytes: Uint8Array): Promise<PdfDocumentSource> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // The Tauri bundle is intentionally offline-capable and does not depend on
  // a CDN-hosted pdf.worker.js. PDF.js runs this bounded ingestion path in its
  // main thread; the visible File Viewer remains free to use its own renderer.
  const loadingTask = pdfjs.getDocument(
    { data: bytes, disableWorker: true } as unknown as Parameters<typeof pdfjs.getDocument>[0],
  )
  const documentProxy = await loadingTask.promise

  return {
    pageCount: documentProxy.numPages,
    async getPage(pageNumber) {
      const page = await documentProxy.getPage(pageNumber)
      return {
        async getText() {
          const content = await page.getTextContent()
          return content.items
            .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
            .filter(Boolean)
            .join('\n')
        },
        async renderBitmap() {
          const viewport = page.getViewport({ scale: 2 })
          const canvas = Object.assign(document.createElement('canvas'), {
            width: viewport.width,
            height: viewport.height,
          })
          const context = canvas.getContext('2d') as CanvasRenderingContext2D | null
          if (!context) throw new Error('PDF_CANVAS_UNAVAILABLE')
          await page.render({ canvas, canvasContext: context, viewport }).promise
          return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('PDF_BITMAP_RENDER_FAILED'))
                return
              }
              blob.arrayBuffer().then(resolve, reject)
            }, 'image/png')
          }))
        },
      }
    },
  }
}

export interface PdfPageReadResult {
  pageNumber: number
  classification: 'text' | 'ocr'
  text: string
  bitmap?: Uint8Array
}

export class PdfTextAdapter {
  private readonly source: PdfDocumentSource
  private readonly classifier: PdfPageClassifier

  constructor(
    source: PdfDocumentSource,
    classifier = new PdfPageClassifier(),
  ) {
    this.source = source
    this.classifier = classifier
  }

  get pageCount(): number {
    return this.source.pageCount
  }

  async readPage(pageNumber: number): Promise<PdfPageReadResult> {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) {
      throw new Error('PDF_PAGE_INVALID')
    }
    const page = await this.source.getPage(pageNumber)
    const text = normalizeText(await page.getText())
    const classification = this.classifier.classify(text)
    if (classification === 'text') return { pageNumber, classification, text }
    return { pageNumber, classification, text: '', bitmap: await page.renderBitmap() }
  }
}
