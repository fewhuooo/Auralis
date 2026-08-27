import { normalizeText } from './normalization.ts'

export type PdfPageClassification = 'text' | 'ocr'

export const DEFAULT_TEXT_LAYER_MIN_CHARS = 3

export class PdfPageClassifier {
  readonly minTextChars: number

  constructor(minTextChars = DEFAULT_TEXT_LAYER_MIN_CHARS) {
    if (!Number.isInteger(minTextChars) || minTextChars < 1) {
      throw new Error('PDF_TEXT_THRESHOLD_INVALID')
    }
    this.minTextChars = minTextChars
  }

  classify(text: string): PdfPageClassification {
    return normalizeText(text).length >= this.minTextChars ? 'text' : 'ocr'
  }
}
