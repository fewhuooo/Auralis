import { assetApi } from '@/api/assetApi'
import { uuidv7 } from '@/utils/uuid'

export interface LocalUploadFile {
  path: string
  name: string
  size: number
  mimeType: string
}

async function readFile(path: string): Promise<ArrayBuffer> {
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
      filePath: path,
      success: result => resolve(result.data),
      fail: reject,
    }))
  }
  const response = await fetch(path)
  if (!response.ok) throw new Error('Cannot read selected file')
  return response.arrayBuffer()
}

function putFile(url: string, data: ArrayBuffer, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => uni.request({
    url,
    method: 'PUT',
    data,
    header: headers,
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve()
      else reject(new Error(`Object upload failed (${response.statusCode})`))
    },
    fail: reject,
  }))
}

export async function uploadAsset(file: LocalUploadFile, clientImportId = uuidv7()): Promise<string> {
  const intent = await assetApi.createUploadIntent({
    baseVersion: 0,
    clientImportId,
    originalName: file.name,
    sizeBytes: file.size,
    mimeType: file.mimeType,
  })
  if (!intent.assetId || !intent.uploadUrl) throw new Error('Upload intent response is incomplete')
  const data = await readFile(file.path)
  await putFile(intent.uploadUrl, data, intent.headers || { 'Content-Type': file.mimeType })
  await assetApi.complete(intent.assetId)
  return intent.assetId
}
