import request from './request.ts'
import type { components } from './generated/schema.ts'
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  validateUploadFile,
} from '@/utils/filePreview'

export type UploadIntentRequest = components['schemas']['AssetUploadIntentRequest']
export type UploadIntentResponse = components['schemas']['AssetUploadIntentResponse']
export type DownloadUrlResponse = components['schemas']['AssetDownloadUrlResponse']

export interface AssetView {
  id?: string
  originalName?: string
  sizeBytes?: number
  mimeType?: string
  sha256?: string
  uploadStatus?: 'UPLOADING' | 'READY' | 'FAILED' | 'ORPHANED'
  completedAt?: string
  createdAt?: string
  updatedAt?: string
}

export type AssetStatusCompat = DownloadUrlResponse & {
  subject?: string
  fileName?: string
  objectName?: string
  contentType?: string
  fileSize?: number
}

/**
 * Validate file size on client side before upload intent.
 */
export function validateFileSize(file: { size: number }): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`文件大小 ${sizeMb} MB 超过上限 ${MAX_FILE_SIZE_MB} MB，请压缩后重试`)
  }
}

/**
 * Step 1: Create upload intent.
 */
export function createUploadIntent(data: UploadIntentRequest): Promise<UploadIntentResponse> {
  return request.post('/api/assets/upload-intents', data) as unknown as Promise<UploadIntentResponse>
}

/**
 * Step 2: Upload binary data directly to object storage via presigned PUT URL.
 */
export function uploadToObjectStorage(
  uploadUrl: string,
  file: Blob | File,
  headers?: Record<string, string>,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)

    const uploadHeaders = { ...headers }
    if (!Object.keys(uploadHeaders).some((key) => key.toLowerCase() === 'content-type')) {
      uploadHeaders['Content-Type'] = file.type || 'application/octet-stream'
    }
    for (const [key, value] of Object.entries(uploadHeaders)) {
      // Browsers manage Content-Length; setting it from JavaScript is forbidden.
      if (key.toLowerCase() !== 'content-length') xhr.setRequestHeader(key, value)
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded * 100) / event.total)
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Object storage upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => {
      reject(new Error('Object storage upload network error'))
    }

    xhr.ontimeout = () => {
      reject(new Error('Object storage upload timeout'))
    }

    xhr.timeout = 300000 // 5 min timeout
    xhr.send(file)
  })
}

/**
 * Step 3: Complete upload and transition asset to READY.
 */
export function completeUpload(assetId: string): Promise<AssetView> {
  return request.post(`/api/assets/${encodeURIComponent(assetId)}/complete`) as unknown as Promise<AssetView>
}

/**
 * Step 4: Get temporary download URL for a READY asset.
 */
export function getDownloadUrl(assetId: string): Promise<DownloadUrlResponse> {
  return request.post(`/api/assets/${encodeURIComponent(assetId)}/download-url`) as unknown as Promise<DownloadUrlResponse>
}

export interface UploadAssetOptions {
  baseVersion?: number
  clientImportId?: string
  sha256?: string
  onProgress?: (percent: number, stage: string) => void
}

/**
 * Full Asset Upload Pipeline: validate -> upload-intent -> object storage PUT -> complete
 */
export async function uploadAsset(
  file: File,
  optionsOrSubject?: UploadAssetOptions | string,
  legacyOnProgress?: (percent: number, stage: string) => void
): Promise<{ assetId: string; asset: AssetView }> {
  validateUploadFile(file)

  const options: UploadAssetOptions =
    typeof optionsOrSubject === 'object' && optionsOrSubject !== null
      ? optionsOrSubject
      : { onProgress: legacyOnProgress }

  options.onProgress?.(5, '校验文件...')
  options.onProgress?.(10, '申请上传凭证...')

  const clientImportId = options.clientImportId ?? (globalThis.crypto?.randomUUID?.() || `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`)

  const intent = await createUploadIntent({
    baseVersion: options.baseVersion ?? 0,
    clientImportId,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    sha256: options.sha256,
  })

  if (!intent.assetId || !intent.uploadUrl) {
    throw new Error('Upload intent response missing assetId or uploadUrl')
  }

  options.onProgress?.(20, '上传至对象存储...')
  await uploadToObjectStorage(intent.uploadUrl, file, intent.headers, (percent) => {
    const mapped = 20 + Math.round(percent * 0.65)
    options.onProgress?.(mapped, '上传中...')
  })

  options.onProgress?.(88, '确认上传完成...')
  const asset = await completeUpload(intent.assetId)
  options.onProgress?.(100, '上传处理完成')

  return { assetId: intent.assetId, asset }
}

// Temporary compatibility adapters for unmigrated view components (migrating in Task 8)
export async function getPresignedUrl(fileName: string, contentType: string = 'application/octet-stream') {
  const intent = await createUploadIntent({
    baseVersion: 0,
    clientImportId: globalThis.crypto?.randomUUID?.() || '00000000-0000-4000-8000-000000000000',
    originalName: fileName,
    mimeType: contentType,
  })
  return {
    presignedUrl: intent.uploadUrl ?? '',
    objectName: intent.assetId ?? '',
    bucket: '',
    maxFileSizeMb: 50,
    expiresInMinutes: 15,
  }
}

export function uploadToMinIO(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return uploadToObjectStorage(uploadUrl, file, undefined, onProgress)
}

export async function bindAsset(
  objectName: string,
  _fileName: string,
  _fileSize: number,
  _contentType: string,
  _subject?: string
) {
  return completeUpload(objectName)
}

export async function getAssetStatus(assetId: string): Promise<AssetStatusCompat> {
  return getDownloadUrl(assetId)
}

export const useAssetApi = {
  validateFileSize,
  validateUploadFile,
  createUploadIntent,
  uploadToObjectStorage,
  completeUpload,
  getDownloadUrl,
  uploadAsset,
}
