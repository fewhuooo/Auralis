import { assetApi } from '@/api/assetApi'
import { uuidv7 } from '@/utils/uuid'

export interface LocalUploadFile {
  path: string
  name: string
  size: number
  mimeType: string
  // #ifdef H5
  file?: File
  // #endif
}

export type UploadProgressCallback = (percent: number, stage: string) => void

async function readUploadFile(item: LocalUploadFile): Promise<ArrayBuffer> {
  // #ifdef H5
  if (item.file) {
    return item.file.arrayBuffer()
  }
  // #endif

  const fileSystemManager = (uni as unknown as {
    getFileSystemManager?: () => {
      readFile(options: {
        filePath: string
        success(result: { data: ArrayBuffer }): void
        fail(error: unknown): void
      }): void
    }
  }).getFileSystemManager?.()
  if (fileSystemManager) {
    return new Promise((resolve, reject) => fileSystemManager.readFile({
      filePath: item.path,
      success: result => resolve(result.data),
      fail: reject,
    }))
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

function putFile(
  url: string,
  data: ArrayBuffer,
  headers: Record<string, string>,
  onProgress?: UploadProgressCallback,
): Promise<void> {
  const safeHeaders = sanitizeUploadHeaders(headers)
  // #ifdef H5
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
  // #endif

  return new Promise((resolve, reject) => uni.request({
    url,
    method: 'PUT',
    data,
    header: safeHeaders,
    timeout: 300_000,
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        onProgress?.(75, '正在上传文件...')
        resolve()
        return
      }
      reject(new Error(`文件上传失败 (${response.statusCode})`))
    },
    fail: reject,
  }))
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
