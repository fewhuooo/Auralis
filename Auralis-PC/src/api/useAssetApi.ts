import request from './request.ts'
import type { SyncRequestScopeTicket, SyncScopedAxiosRequestConfig } from './request.ts'
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
export function createUploadIntent(
  data: UploadIntentRequest,
  scope?: SyncRequestScopeTicket,
): Promise<UploadIntentResponse> {
  const config = scope ? { __auralisSyncScope: scope } as SyncScopedAxiosRequestConfig : undefined
  return request.post('/api/assets/upload-intents', data, config) as unknown as Promise<UploadIntentResponse>
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
export function completeUpload(assetId: string, scope?: SyncRequestScopeTicket): Promise<AssetView> {
  const config = scope ? { __auralisSyncScope: scope } as SyncScopedAxiosRequestConfig : undefined
  return request.post(`/api/assets/${encodeURIComponent(assetId)}/complete`, undefined, config) as unknown as Promise<AssetView>
}

/**
 * Step 4: Get temporary download URL for a READY asset.
 */
export function getDownloadUrl(assetId: string): Promise<DownloadUrlResponse> {
  return request.post(`/api/assets/${encodeURIComponent(assetId)}/download-url`) as unknown as Promise<DownloadUrlResponse>
}

export const useAssetApi = {
  validateFileSize,
  validateUploadFile,
  createUploadIntent,
  uploadToObjectStorage,
  completeUpload,
  getDownloadUrl,
}
