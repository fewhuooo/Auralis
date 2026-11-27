import { assetApi } from '@/api/assetApi'
import { uuidv7 } from '@/utils/uuid'

export interface LocalUploadFile {
  path: string
  name: string
  size: number
  mimeType: string
  file?: File
}

export type UploadProgressCallback = (percent: number, stage: string) => void

async function readUploadFile(item: LocalUploadFile): Promise<ArrayBuffer> {
  if (item.file) {
    return item.file.arrayBuffer()
  }
  const response = await fetch(item.path)
  if (!response.ok) throw new Error('无法读取所选文件')
  return response.arrayBuffer()
}

function sanitizeUploadHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-length') continue
    sanitized[key] = value
  }
  return sanitized
}

async function putFile(
  url: string,
  data: ArrayBuffer,
  headers: Record<string, string>,
  onProgress?: UploadProgressCallback,
): Promise<void> {
  const safeHeaders = sanitizeUploadHeaders(headers)
  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url, true)
      xhr.timeout = 300_000
      for (const [key, value] of Object.entries(safeHeaders)) {
        xhr.setRequestHeader(key, value)
      }
      xhr.upload.onprogress = (event) => {
        if (!onProgress || !event.lengthComputable || event.total <= 0) return
        const ratio = Math.min(1, Math.max(0, event.loaded / event.total))
        onProgress(30 + Math.round(ratio * 45), '正在上传文件...')
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
          return
        }
        reject(new Error(`文件上传失败 (${xhr.status})`))
      }
      xhr.ontimeout = () => reject(new Error('文件上传超时，请检查网络后重试'))
      xhr.onerror = () => reject(new Error('文件上传网络异常'))
      xhr.onabort = () => reject(new Error('文件上传已取消'))
      xhr.send(data)
    })
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: safeHeaders,
    body: data,
  })
  if (!response.ok) {
    throw new Error(`文件上传失败 (${response.status})`)
  }
  onProgress?.(75, '正在上传文件...')
}

export async function uploadAsset(
  file: LocalUploadFile,
  clientImportId = uuidv7(),
  onProgress?: UploadProgressCallback,
): Promise<string> {
  onProgress?.(10, '正在申请上传凭证...')
  const intent = await assetApi.createUploadIntent({
    baseVersion: 0,
    clientImportId,
    originalName: file.name,
    sizeBytes: file.size,
    mimeType: file.mimeType,
  })
  if (!intent.assetId || !intent.uploadUrl) throw new Error('上传凭证返回不完整')

  onProgress?.(25, '正在读取文件...')
  const data = await readUploadFile(file)

  onProgress?.(30, '正在上传文件...')
  await putFile(intent.uploadUrl, data, intent.headers || { 'Content-Type': file.mimeType }, onProgress)

  onProgress?.(80, '正在确认文件入库...')
  await assetApi.complete(intent.assetId)
  return intent.assetId
}
