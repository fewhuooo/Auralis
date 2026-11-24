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

interface ChosenFileItem {
  path?: string
  name?: string
  size?: number
  type?: string
}

declare const wx: {
  chooseMessageFile?: (options: {
    count: number
    type: 'file' | 'all' | 'image' | 'video'
    success: (res: { tempFiles?: ChosenFileItem[] }) => void
    fail: (err: unknown) => void
  }) => void
} | undefined

function normalizeChosenFile(item: ChosenFileItem | undefined): LocalUploadFile | null {
  if (!item?.path) return null
  const name = item.name || item.path.split(/[\\/]/).pop() || `file-${Date.now()}`
  return {
    path: item.path,
    name,
    size: Number(item.size || 0),
    mimeType: inferUploadMimeType(name, item.type),
  }
}

// #ifdef H5
export function normalizeBrowserFile(file: File): LocalUploadFile {
  return {
    path: '',
    name: file.name,
    size: Number(file.size || 0),
    mimeType: inferUploadMimeType(file.name, file.type),
    file,
  }
}
// #endif

export function pickLocalDocument(): Promise<LocalUploadFile | null> {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    if (!wx?.chooseMessageFile) {
      reject(new Error('当前微信版本不支持选择聊天文件'))
      return
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => resolve(normalizeChosenFile(res.tempFiles?.[0])),
      fail: (err) => {
        const msg = typeof err === 'object' && err && 'errMsg' in err ? String((err as { errMsg: unknown }).errMsg) : ''
        if (msg.includes('cancel')) {
          resolve(null)
          return
        }
        reject(new Error(msg || '选择文件失败'))
      },
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  return new Promise((resolve, reject) => {
    const chooseFile = (uni as unknown as {
      chooseFile?: (options: {
        count: number
        success: (res: { tempFiles?: ChosenFileItem[]; tempFilePaths?: string[] }) => void
        fail: (err: unknown) => void
      }) => void
    }).chooseFile

    if (chooseFile) {
      chooseFile({
        count: 1,
        success: (res) => {
          const item = res.tempFiles?.[0] || (res.tempFilePaths?.[0] ? { path: res.tempFilePaths[0] } : undefined)
          resolve(normalizeChosenFile(item))
        },
        fail: (err) => {
          const msg = typeof err === 'object' && err && 'errMsg' in err ? String((err as { errMsg: unknown }).errMsg) : ''
          if (msg.includes('cancel')) {
            resolve(null)
            return
          }
          reject(new Error(msg || '选择文件失败'))
        },
      })
      return
    }

    reject(new Error('当前环境暂不支持文件选择'))
  })
  // #endif
}

export async function uploadSubjectFile(options: {
  subjectId: string
  file: LocalUploadFile
  title?: string
  onProgress?: UploadProgressCallback
}): Promise<SourceView> {
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
