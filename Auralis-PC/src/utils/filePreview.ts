export const MAX_FILE_SIZE_MB = 50
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx',
] as const

export type PreviewKind = 'pdf' | 'office' | 'image' | 'text' | 'csv' | 'unsupported'
export type PreviewRenderer = 'file-viewer' | 'unsupported'

export interface FileCapability {
  allowedForUpload: boolean
  kind: PreviewKind
  renderer: PreviewRenderer
  extension: string
}

type FileLike = {
  name: string
  type?: string
  size?: number
}

export interface FilePreviewSource {
  id: string
  assetId?: string | null
}

const CAPABILITIES: Record<string, FileCapability> = {
  pdf: { allowedForUpload: true, kind: 'pdf', renderer: 'file-viewer', extension: 'pdf' },
  doc: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'doc' },
  docx: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'docx' },
  ppt: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'ppt' },
  pptx: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'pptx' },
  png: { allowedForUpload: false, kind: 'image', renderer: 'file-viewer', extension: 'png' },
  jpg: { allowedForUpload: false, kind: 'image', renderer: 'file-viewer', extension: 'jpg' },
  jpeg: { allowedForUpload: false, kind: 'image', renderer: 'file-viewer', extension: 'jpeg' },
  webp: { allowedForUpload: false, kind: 'image', renderer: 'file-viewer', extension: 'webp' },
  gif: { allowedForUpload: false, kind: 'image', renderer: 'file-viewer', extension: 'gif' },
  txt: { allowedForUpload: false, kind: 'text', renderer: 'file-viewer', extension: 'txt' },
  md: { allowedForUpload: false, kind: 'text', renderer: 'file-viewer', extension: 'md' },
  json: { allowedForUpload: false, kind: 'text', renderer: 'file-viewer', extension: 'json' },
  xml: { allowedForUpload: false, kind: 'text', renderer: 'file-viewer', extension: 'xml' },
  csv: { allowedForUpload: false, kind: 'csv', renderer: 'file-viewer', extension: 'csv' },
}

function cloneCapability(capability: FileCapability): FileCapability {
  return { ...capability }
}

export function getFileExtension(name: string): string {
  const normalized = name.trim().toLowerCase()
  const dot = normalized.lastIndexOf('.')
  if (dot < 0 || dot === normalized.length - 1) return ''
  return normalized.slice(dot + 1)
}

export function getPreviewSourceIdentity(file: FilePreviewSource): string {
  return JSON.stringify([file.id, file.assetId])
}

export function resolveFileCapability(file: Pick<FileLike, 'name' | 'type'>): FileCapability {
  const extension = getFileExtension(file.name)
  return cloneCapability(CAPABILITIES[extension] || {
    allowedForUpload: false,
    kind: 'unsupported',
    renderer: 'unsupported',
    extension,
  })
}

export function canPreviewFile(file: Pick<FileLike, 'name' | 'type'>): boolean {
  return resolveFileCapability(file).renderer === 'file-viewer'
}

export function validateUploadFile(file: FileLike): FileCapability {
  if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`文件大小 ${sizeMb} MB 超过上限 ${MAX_FILE_SIZE_MB} MB，请压缩后重试`)
  }

  const capability = resolveFileCapability(file)
  if (capability.extension === 'xls' || capability.extension === 'xlsx') {
    throw new Error('暂不支持 Excel 文件')
  }
  if (!capability.allowedForUpload) {
    throw new Error('仅支持上传 PDF、DOC、DOCX、PPT、PPTX 文件；图片和文本仅可预览')
  }
  return capability
}
