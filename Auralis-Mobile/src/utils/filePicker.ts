import { sourceApi, type SourceView } from '@/api/sourceApi'
import { uploadAsset, type LocalUploadFile, type UploadProgressCallback } from '@/services/assetUpload'
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
  SUPPORTED_UPLOAD_EXTENSIONS,
  inferUploadMimeType,
  validateUploadFile,
} from '@/utils/uploadValidation'
import { uuidv7 } from '@/utils/uuid'

export {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
  SUPPORTED_UPLOAD_EXTENSIONS,
  validateUploadFile,
}

export function normalizeBrowserFile(file: File): LocalUploadFile {
  return {
    path: '',
    name: file.name,
    size: Number(file.size || 0),
    mimeType: inferUploadMimeType(file.name, file.type),
    file,
  }
}

export function pickLocalDocument(): Promise<LocalUploadFile | null> {
  if (typeof document === 'undefined' || !document.body) {
    return Promise.reject(new Error('当前环境暂不支持文件选择'))
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = SUPPORTED_UPLOAD_EXTENSIONS.join(',')
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.top = '-9999px'

    let settled = false
    let cancelTimer: ReturnType<typeof setTimeout> | null = null
    const win = typeof window !== 'undefined' ? window : null

    const cleanup = () => {
      if (cancelTimer) {
        clearTimeout(cancelTimer)
        cancelTimer = null
      }
      input.removeEventListener('change', handleChange)
      input.removeEventListener('cancel', handleCancel)
      win?.removeEventListener('focus', handleWindowFocus)
      input.remove()
    }

    const settle = (result: LocalUploadFile | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const handleChange = () => {
      const selected = input.files?.[0]
      settle(selected ? normalizeBrowserFile(selected) : null)
    }

    const handleCancel = () => {
      settle(null)
    }

    const handleWindowFocus = () => {
      cancelTimer = setTimeout(() => {
        if (!settled) settle(null)
      }, 350)
    }

    input.addEventListener('change', handleChange)
    input.addEventListener('cancel', handleCancel)
    win?.addEventListener('focus', handleWindowFocus, { once: true })

    try {
      document.body.appendChild(input)
      input.click()
    } catch (error) {
      if (!settled) {
        settled = true
        cleanup()
        reject(error)
      }
    }
  })
}

export async function uploadSubjectFile(options: {
  subjectId: string
  file: LocalUploadFile
  title?: string
  onProgress?: UploadProgressCallback
}): Promise<SourceView> {
  validateUploadFile(options.file)
  const assetId = await uploadAsset(options.file, uuidv7(), options.onProgress)
  options.onProgress?.(85, '正在关联学科资料...')
  const created = await sourceApi.create({
    baseVersion: 0,
    subjectId: options.subjectId,
    type: 'FILE',
    title: options.title?.trim() || options.file.name,
    assetId,
  })
  options.onProgress?.(95, '正在更新本地缓存...')
  return created
}
