import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getDownloadUrl, uploadAsset, type AssetView } from '@/api/useAssetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { getLocalRepository } from '@/services/localDb'
import { mapAssetView, type AssetModel } from '@/services/domainMappers'

export interface PendingAssetUpload {
  clientUploadId: string
  fileName: string
  sizeBytes: number
  mimeType: string
  progress: number
  status: 'pending' | 'failed'
  error?: string
}

export const useAssetStore = defineStore('asset', () => {
  const assets = ref<AssetModel[]>([])
  const pendingUploads = ref<PendingAssetUpload[]>([])
  const lastError = ref<string | null>(null)

  async function cache(asset: AssetView): Promise<AssetModel> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.deviceId || !asset.id) throw new Error('Asset cache requires an authenticated user and asset id')
    const repo = await getLocalRepository(authStore.user.id, authStore.deviceId)
    await repo.upsert('ASSET', String(asset.id), asset, {
      version: 0,
      deletedAt: null,
      syncStatus: 'synced',
    })
    const model = mapAssetView(asset)
    assets.value = [model, ...assets.value.filter((item) => item.id !== model.id)]
    return model
  }

  async function upload(file: File, onProgress?: (percent: number, stage: string) => void): Promise<AssetModel> {
    const clientUploadId = globalThis.crypto?.randomUUID?.() || `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const pending: PendingAssetUpload = {
      clientUploadId,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      progress: 0,
      status: 'pending',
    }
    pendingUploads.value = [...pendingUploads.value, pending]
    lastError.value = null
    try {
      const result = await uploadAsset(file, {
        onProgress: (percent, stage) => {
          const current = pendingUploads.value.find((item) => item.clientUploadId === clientUploadId)
          if (current) current.progress = percent
          onProgress?.(percent, stage)
        },
      })
      const model = await cache(result.asset)
      pendingUploads.value = pendingUploads.value.filter((item) => item.clientUploadId !== clientUploadId)
      return model
    } catch (error) {
      const message = error instanceof Error ? error.message : '资产上传失败'
      const current = pendingUploads.value.find((item) => item.clientUploadId === clientUploadId)
      if (current) {
        current.status = 'failed'
        current.error = message
      }
      lastError.value = message
      throw error
    }
  }

  async function downloadUrl(assetId: string): Promise<string> {
    const response = await getDownloadUrl(assetId)
    if (!response.url) throw new Error('Asset download response missing URL')
    return response.url
  }

  return {
    assets,
    pendingUploads,
    lastError,
    upload,
    downloadUrl,
  }
})
