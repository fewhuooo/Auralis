export type TabletPreviewKind = 'pdf' | 'word' | 'presentation' | 'image' | 'unsupported'

const WORD_EXTENSIONS = new Set(['doc', 'docx', 'rtf', 'odt'])
const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function extractExtension(name: string): string {
  const clean = name.trim().toLowerCase().split(/[?#]/)[0]
  const match = clean.match(/\.([a-z0-9]{2,6})$/)
  return match ? match[1] : ''
}

function normalizeMime(mimeType: string): string {
  return mimeType.trim().toLowerCase().split(';')[0].trim()
}

function resolveKindFromExtension(ext: string): TabletPreviewKind {
  if (ext === 'pdf') return 'pdf'
  if (WORD_EXTENSIONS.has(ext)) return 'word'
  if (PRESENTATION_EXTENSIONS.has(ext)) return 'presentation'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return 'unsupported'
}

function resolveKindFromMime(mime: string): TabletPreviewKind {
  if (!mime) return 'unsupported'
  if (mime === 'application/pdf') return 'pdf'
  if (
    mime.includes('wordprocessingml')
    || mime.includes('msword')
    || mime.includes('opendocument.text')
    || mime === 'application/rtf'
    || mime === 'text/rtf'
  ) {
    return 'word'
  }
  if (mime.includes('presentationml') || mime.includes('ms-powerpoint')) {
    return 'presentation'
  }
  if (mime.startsWith('image/')) return 'image'
  return 'unsupported'
}

function resolveFallbackExtension(mime: string): string {
  if (!mime) return ''
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime.includes('msword')) return 'doc'
  if (mime.includes('opendocument.text')) return 'odt'
  if (mime === 'application/rtf' || mime === 'text/rtf') return 'rtf'
  if (mime.includes('presentationml')) return 'pptx'
  if (mime.includes('ms-powerpoint')) return 'ppt'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif') {
    return mime.slice('image/'.length)
  }
  return ''
}

export function resolveTabletPreviewKind(name: string, mimeType = ''): TabletPreviewKind {
  const byExt = resolveKindFromExtension(extractExtension(name))
  if (byExt !== 'unsupported') return byExt
  return resolveKindFromMime(normalizeMime(mimeType))
}

export function isCoreFileViewerKind(
  kind: TabletPreviewKind,
): kind is 'pdf' | 'word' | 'presentation' {
  return kind === 'pdf' || kind === 'word' || kind === 'presentation'
}

export function buildPreviewFileName(
  originalName: string,
  title: string,
  mimeType = '',
): string {
  const orig = originalName.trim()
  if (orig && resolveKindFromExtension(extractExtension(orig)) !== 'unsupported') {
    return orig
  }
  const cleanTitle = title.trim()
  if (cleanTitle && resolveKindFromExtension(extractExtension(cleanTitle)) !== 'unsupported') {
    return cleanTitle
  }
  const baseName = orig || cleanTitle || 'document'
  const fallbackExt = resolveFallbackExtension(normalizeMime(mimeType))
  return fallbackExt ? `${baseName}.${fallbackExt}` : baseName
}
