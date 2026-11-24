export const MAX_UPLOAD_FILE_SIZE_MB = 50
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
] as const

const MIME_TYPE_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export function getUploadFileExtension(name: string): string {
  const normalized = name.trim().toLowerCase()
  const dot = normalized.lastIndexOf('.')
  if (dot < 0 || dot === normalized.length - 1) return ''
  return normalized.slice(dot + 1)
}

export function inferUploadMimeType(name: string, fallback?: string): string {
  if (fallback && fallback.includes('/')) return fallback
  const ext = getUploadFileExtension(name)
  return MIME_TYPE_MAP[ext] || 'application/octet-stream'
}

export function validateUploadFile(file: { name: string; size?: number }): void {
  if (typeof file.size === 'number' && file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`文件大小 ${sizeMb} MB 超过上限 ${MAX_UPLOAD_FILE_SIZE_MB} MB，请压缩后重试`)
  }

  const ext = getUploadFileExtension(file.name)
  if (ext === 'xls' || ext === 'xlsx') {
    throw new Error('暂不支持 Excel 文件')
  }
  if (!ext || !SUPPORTED_UPLOAD_EXTENSIONS.some(item => item === `.${ext}`)) {
    throw new Error('仅支持上传 PDF、DOC、DOCX、PPT、PPTX 文件')
  }
}
