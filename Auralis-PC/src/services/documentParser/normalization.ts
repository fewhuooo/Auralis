import { NORMALIZATION_VERSION } from './types.ts'

export const DEFAULT_MAX_BLOCK_CHARS = 100_000

export function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export function assertBoundedText(text: string, maxChars = DEFAULT_MAX_BLOCK_CHARS): string {
  if (text.length > maxChars) throw new Error('PARSED_BLOCK_TOO_LARGE')
  return text
}

export function normalizeOcrLines(lines: Array<string | { text?: string }>): string {
  return lines
    .map((line) => (typeof line === 'string' ? line : line.text || ''))
    .map(normalizeText)
    .filter(Boolean)
    .join('\n')
}

export function normalizationVersion(): typeof NORMALIZATION_VERSION {
  return NORMALIZATION_VERSION
}
