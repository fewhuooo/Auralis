import { sourceApi, type SourceView } from '@/api/sourceApi'
import { uploadAsset, type LocalUploadFile } from '@/services/assetUpload'
import { uuidv7 } from '@/utils/uuid'

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

function inferMimeType(name: string, fallback?: string): string {
  if (fallback && fallback.includes('/')) return fallback
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
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
  return map[ext] || 'application/octet-stream'
}

function normalizeChosenFile(item: ChosenFileItem | undefined): LocalUploadFile | null {
  if (!item?.path) return null
  const name = item.name || item.path.split(/[\\/]/).pop() || `file-${Date.now()}`
  return {
    path: item.path,
    name,
    size: Number(item.size || 0),
    mimeType: inferMimeType(name, item.type),
  }
}

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
}): Promise<SourceView> {
  const assetId = await uploadAsset(options.file, uuidv7())
  return sourceApi.create({
    baseVersion: 0,
    subjectId: options.subjectId,
    type: 'FILE',
    title: options.title?.trim() || options.file.name,
    assetId,
  })
}
