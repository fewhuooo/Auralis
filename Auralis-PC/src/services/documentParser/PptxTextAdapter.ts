// The package's Node entry imports readable-stream. Use the self-contained
// browser bundle so Vite does not externalize Node's `stream` module in Tauri.
import JSZip from 'jszip/dist/jszip.min.js'
import { normalizeText } from './normalization.ts'
import type { PptxDocumentSource, PptxSlideSource } from './types.ts'

const MAX_PPTX_BYTES = 50 * 1024 * 1024
const MAX_SLIDES = 2_000
const MAX_XML_CHARS = 10 * 1024 * 1024

function xmlAttribute(attributes: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attributes.match(new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)')`))
  return match?.[1] ?? match?.[2] ?? null
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractSlideText(xml: string): string {
  const paragraphs: string[] = []
  for (const paragraph of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    let text = ''
    for (const token of paragraph[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:(?:br|tab)\b[^>]*\/?\s*>/g)) {
      text += token[1] === undefined ? '\n' : decodeXml(token[1])
    }
    const normalized = normalizeText(text)
    if (normalized) paragraphs.push(normalized)
  }
  return normalizeText(paragraphs.join('\n'))
}

function resolveSlideTarget(target: string): string | null {
  const normalized = target.replace(/\\/g, '/').replace(/^\/+/, '')
  const candidate = normalized.startsWith('ppt/') ? normalized : `ppt/${normalized.replace(/^\.\//, '')}`
  if (candidate.split('/').includes('..')) return null
  return candidate
}

async function readBoundedXml(entry: JSZip.JSZipObject | null): Promise<string> {
  if (!entry) throw new Error('PPTX_PACKAGE_INCOMPLETE')
  const xml = await entry.async('string')
  if (xml.length > MAX_XML_CHARS) throw new Error('PPTX_XML_TOO_LARGE')
  return xml
}

export async function openPptxDocument(raw: Uint8Array | ArrayBuffer): Promise<PptxDocumentSource> {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  if (bytes.byteLength < 4 || bytes.byteLength > MAX_PPTX_BYTES) throw new Error('PPTX_INVALID_PACKAGE')
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error('PPTX_LEGACY_UNSUPPORTED')
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('PPTX_INVALID_PACKAGE')
  }

  const presentation = await readBoundedXml(zip.file('ppt/presentation.xml'))
  const relationships = await readBoundedXml(zip.file('ppt/_rels/presentation.xml.rels'))
  const targets = new Map<string, string>()
  for (const relationship of relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const id = xmlAttribute(relationship[1], 'Id')
    const type = xmlAttribute(relationship[1], 'Type')
    const target = xmlAttribute(relationship[1], 'Target')
    const resolved = target ? resolveSlideTarget(target) : null
    if (id && type?.endsWith('/slide') && resolved) targets.set(id, resolved)
  }

  const slidePaths: string[] = []
  for (const slide of presentation.matchAll(/<p:sldId\b([^>]*)\/?\s*>/g)) {
    const relationshipId = xmlAttribute(slide[1], 'r:id')
    const path = relationshipId ? targets.get(relationshipId) : null
    if (path && zip.file(path)) slidePaths.push(path)
  }
  if (slidePaths.length < 1 || slidePaths.length > MAX_SLIDES) throw new Error('PPTX_NO_SLIDES')

  let destroyed = false
  return {
    slideCount: slidePaths.length,
    async getSlide(slideNumber: number): Promise<PptxSlideSource> {
      if (destroyed || !Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > slidePaths.length) {
        throw new Error('PPTX_SLIDE_INVALID')
      }
      const xml = await readBoundedXml(zip.file(slidePaths[slideNumber - 1]))
      return { getText: async () => extractSlideText(xml) }
    },
    async destroy(): Promise<void> {
      destroyed = true
      slidePaths.length = 0
    },
  }
}
