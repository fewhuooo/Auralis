import { assetApi } from '@/api/assetApi'
// #ifdef APP-PLUS
import {
  decodeBase64ToArrayBuffer,
  releaseNativeBridgeFile,
  requestNativeFilePut,
} from '@/services/nativeUploadBridge'
// #endif
import { uuidv7 } from '@/utils/uuid'

export interface LocalUploadFile {
  path: string
  name: string
  size: number
  mimeType: string
  bridgeFileId?: string
  // #ifdef H5
  file?: File
  // #endif
}

export type UploadProgressCallback = (percent: number, stage: string) => void

// #ifdef APP-PLUS
interface PlusIoEntryLike {
  file(
    success: (fileObj: unknown) => void,
    error?: (err: unknown) => void,
  ): void
}

interface PlusIoReaderLike {
  onloadend: (() => void) | null
  onerror: ((err: unknown) => void) | null
  result: string | ArrayBuffer | null
  readAsDataURL(file: unknown): void
}

interface PlusIoNamespace {
  resolveLocalFileSystemURL?: (
    path: string,
    success: (entry: PlusIoEntryLike) => void,
    error?: (err: unknown) => void,
  ) => void
  FileReader?: new () => PlusIoReaderLike
}

interface PlusNetXhrLike {
  timeout: number
  status: number
  onload: (() => void) | null
  ontimeout: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
  open(method: string, url: string): void
  setRequestHeader(name: string, value: string): void
  send(data?: unknown): void
}

interface PlusNamespace {
  io?: PlusIoNamespace
  net?: {
    XMLHttpRequest?: new () => PlusNetXhrLike
  }
}

declare const plus: PlusNamespace | undefined

function readViaPlusIo(path: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const io = typeof plus !== 'undefined' ? plus?.io : undefined
    if (!io?.resolveLocalFileSystemURL || !io.FileReader) {
      reject(new Error('原生文件系统不可用'))
      return
    }
    const FileReaderCtor = io.FileReader
    io.resolveLocalFileSystemURL(
      path,
      (entry) => {
        entry.file(
          (fileObj) => {
            const reader = new FileReaderCtor()
            reader.onloadend = () => {
              if (reader.result instanceof ArrayBuffer) {
                resolve(reader.result)
                return
              }
              if (typeof reader.result === 'string') {
                resolve(decodeBase64ToArrayBuffer(reader.result))
                return
              }
              reject(new Error('无法读取本地文件内容'))
            }
            reader.onerror = () => reject(new Error('读取本地文件失败'))
            reader.readAsDataURL(fileObj)
          },
          () => reject(new Error('无法打开本地文件')),
        )
      },
      () => reject(new Error('无法定位本地文件')),
    )
  })
}
// #endif

async function readUploadFile(item: LocalUploadFile): Promise<ArrayBuffer> {
  // #ifdef H5
  if (item.file) {
    return item.file.arrayBuffer()
  }
  // #endif

  // #ifdef APP-PLUS
  if (item.path) {
    return readViaPlusIo(item.path)
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

  // #ifdef APP-PLUS
  const PlusXhr = typeof plus !== 'undefined' ? plus?.net?.XMLHttpRequest : undefined
  if (PlusXhr) {
    return new Promise((resolve, reject) => {
      const xhr = new PlusXhr()
      xhr.open('PUT', url)
      xhr.timeout = 300_000
      for (const [key, value] of Object.entries(safeHeaders)) {
        xhr.setRequestHeader(key, value)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(75, '正在上传文件...')
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

  const headers = intent.headers || { 'Content-Type': file.mimeType }
  // #ifdef APP-PLUS
  if (file.bridgeFileId) {
    onProgress?.(30, '正在上传文件...')
    await requestNativeFilePut({
      bridgeFileId: file.bridgeFileId,
      url: intent.uploadUrl,
      headers: sanitizeUploadHeaders(headers),
      onProgress,
    })
    onProgress?.(80, '正在确认文件入库...')
    await assetApi.complete(intent.assetId)
    releaseNativeBridgeFile(file.bridgeFileId)
    return intent.assetId
  }
  // #endif

  onProgress?.(25, '正在读取文件...')
  const data = await readUploadFile(file)

  onProgress?.(30, '正在上传文件...')
  await putFile(intent.uploadUrl, data, headers, onProgress)

  onProgress?.(80, '正在确认文件入库...')
  await assetApi.complete(intent.assetId)
  return intent.assetId
}
