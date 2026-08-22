export const MAX_FILE_SIZE_MB = 50
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.txt', '.md', '.json', '.xml', '.csv',
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

const CAPABILITIES: Record<string, FileCapability> = {
  pdf: { allowedForUpload: true, kind: 'pdf', renderer: 'file-viewer', extension: 'pdf' },
  doc: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'doc' },
  docx: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'docx' },
  ppt: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'ppt' },
  pptx: { allowedForUpload: true, kind: 'office', renderer: 'file-viewer', extension: 'pptx' },
  png: { allowedForUpload: true, kind: 'image', renderer: 'file-viewer', extension: 'png' },
  jpg: { allowedForUpload: true, kind: 'image', renderer: 'file-viewer', extension: 'jpg' },
  jpeg: { allowedForUpload: true, kind: 'image', renderer: 'file-viewer', extension: 'jpeg' },
  webp: { allowedForUpload: true, kind: 'image', renderer: 'file-viewer', extension: 'webp' },
  gif: { allowedForUpload: true, kind: 'image', renderer: 'file-viewer', extension: 'gif' },
  txt: { allowedForUpload: true, kind: 'text', renderer: 'file-viewer', extension: 'txt' },
  md: { allowedForUpload: true, kind: 'text', renderer: 'file-viewer', extension: 'md' },
  json: { allowedForUpload: true, kind: 'text', renderer: 'file-viewer', extension: 'json' },
  xml: { allowedForUpload: true, kind: 'text', renderer: 'file-viewer', extension: 'xml' },
  csv: { allowedForUpload: true, kind: 'csv', renderer: 'file-viewer', extension: 'csv' },
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

export function resolveFileCapability(file: Pick<FileLike, 'name' | 'type'>): FileCapability {
  const extension = getFileExtension(file.name)
  return cloneCapability(CAPABILITIES[extension] || {
    allowedForUpload: false,
    kind: 'unsupported',
    renderer: 'unsupported',
    extension,
  })
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
    throw new Error('暂不支持此文件类型')
  }
  return capability
}
