import request from './request'
import axios from 'axios'

const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

/**
 * 15.7 Asset API — MinIO Presigned URL Direct Upload Pipeline
 *
 * Flow: validateSize → getPresignedUrl → uploadToMinIO → bindAsset
 */

export interface PresignedUrlResponse {
  presignedUrl: string
  objectName: string
  bucket: string
  maxFileSizeMb: number
  expiresInMinutes: number
}

export interface AssetResponse {
  id: string
  userId: string
  fileName: string
  objectName: string
  fileSize: number
  contentType: string
  status: string
  subject: string
  createdAt: number
}

/**
 * Validate file size on the client side before uploading.
 */
export function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`文件大小 ${sizeMb} MB 超过上限 ${MAX_FILE_SIZE_MB} MB，请压缩后重试`)
  }
}

/**
 * Step 1: Get a presigned PUT URL from the backend.
 */
export async function getPresignedUrl(fileName: string, contentType: string = 'application/octet-stream'): Promise<PresignedUrlResponse> {
  const res: any = await request.get('/api/fs/presigned-url', {
    params: { fileName, contentType }
  })
  return res
}

/**
 * Step 2: Upload file directly to MinIO via presigned PUT URL.
 * This bypasses Spring Boot entirely — binary data goes straight to object storage.
 */
export async function uploadToMinIO(
  presignedUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  await axios.put(presignedUrl, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    // Capture native upload progress from XMLHttpRequest
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percent)
      }
    },
    // No auth header — presigned URL is self-authenticating
    timeout: 300000, // 5 min timeout for large files
  })
}

/**
 * Step 3: Bind the uploaded file — notify backend to record metadata and dispatch processing.
 */
export async function bindAsset(
  objectName: string,
  fileName: string,
  fileSize: number,
  contentType: string,
  subject?: string
): Promise<AssetResponse> {
  const res: any = await request.post('/api/assets/bind', {
    objectName,
    fileName,
    fileSize,
    contentType,
    subject: subject || '文档导入',
  })
  return res
}

/**
 * Query asset processing status.
 */
export async function getAssetStatus(assetId: string): Promise<AssetResponse> {
  const res: any = await request.get(`/api/assets/${assetId}`)
  return res
}

/**
 * Convenience: Full upload pipeline (validate → presign → upload → bind).
 */
export async function uploadAsset(
  file: File,
  subject?: string,
  onProgress?: (percent: number, stage: string) => void
): Promise<AssetResponse> {
  // Stage 1: Validate
  validateFileSize(file)
  onProgress?.(5, '校验文件...')

  // Stage 2: Get presigned URL
  onProgress?.(10, '获取上传凭证...')
  const { presignedUrl, objectName } = await getPresignedUrl(file.name, file.type)

  // Stage 3: Direct upload to MinIO
  onProgress?.(15, '上传至对象存储...')
  await uploadToMinIO(presignedUrl, file, (percent) => {
    // Map MinIO upload progress to 15%-85% range
    const mappedPercent = 15 + Math.round(percent * 0.7)
    onProgress?.(mappedPercent, '上传中...')
  })

  // Stage 4: Bind asset
  onProgress?.(88, '绑定资产元数据...')
  const asset = await bindAsset(objectName, file.name, file.size, file.type, subject)

  onProgress?.(95, '已提交后台处理...')
  return asset
}
