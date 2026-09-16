import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getDownloadUrl, type AssetView } from '@/api/useAssetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { getLocalRepository, getLocalAssetRepository } from '@/services/localDb'
import { mapAssetView, type AssetModel } from '@/services/domainMappers'
import { validateUploadFile } from '@/utils/filePreview'
import { uuidv7 } from '@/utils/uuid'
import { getOrCreateLocalAssetService } from '@/services/localAssetService'
import { useSyncStore } from '@/store/useSyncStore'

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
    if (!authStore.user?.id || !authStore.serverDeviceId || !asset.id) throw new Error('Asset cache requires an authenticated user and asset id')
    const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
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
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) {
      throw new Error('Asset upload requires an authenticated user and device')
    }

    validateUploadFile(file)

    const localAssetId = uuidv7()
    const clientUploadId = localAssetId
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
      onProgress?.(10, '校验并持久化本地资产...')
      const localAssetRepo = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
      const assetService = getOrCreateLocalAssetService(localAssetRepo)

      const handle = await assetService.importAsset({
        file,
        localAssetId,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      })

      // Enqueue sync job in localAssetRepo with phase PENDING
      await localAssetRepo.enqueueSyncJob(localAssetId)

      onProgress?.(50, '登记本地资料库...')

      const now = new Date().toISOString()
      const syntheticView: AssetView = {
        id: localAssetId,
        originalName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256: handle.descriptor.sha256,
        uploadStatus: 'UPLOADING',
        createdAt: now,
        updatedAt: now,
      }

      // Upsert to localRepository as ASSET so local reads see it
      const repo = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
      await repo.upsert('ASSET', localAssetId, syntheticView, {
        version: 0,
        deletedAt: null,
        syncStatus: 'pending',
      })

      const model = Object.assign(mapAssetView(syntheticView), {
        originalName: file.name,
        uploadStatus: syntheticView.uploadStatus,
      })
      assets.value = [model, ...assets.value.filter((item) => item.id !== model.id)]
      pendingUploads.value = pendingUploads.value.filter((item) => item.clientUploadId !== clientUploadId)
      onProgress?.(100, '本地导入完成')

      // Request background sync
      useSyncStore().requestBackgroundSync('write')

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
    const authStore = useAuthStore()
    if (authStore.user?.id && authStore.serverDeviceId) {
      const localAssetRepo = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
      const file = await localAssetRepo.getAssetFile(assetId)
      if (file?.serverAssetId) {
        const response = await getDownloadUrl(file.serverAssetId)
        if (response.url) return response.url
      }
    }
    const response = await getDownloadUrl(assetId)
    if (!response.url) throw new Error('Asset download response missing URL')
    return response.url
  }

  async function downloadSourceInput(assetId: string, fileName: string, mimeType = 'application/octet-stream'): Promise<{
    file: File
    cleanup: () => void
  }> {
    const url = await downloadUrl(assetId)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`ASSET_DOWNLOAD_FAILED_${response.status}`)
    const blob = await response.blob()
    return {
      file: new File([blob], fileName, { type: mimeType }),
      cleanup: () => undefined,
    }
  }

  function getLocalFile(_assetId: string): File | null {
    return null
  }

  function forgetLocalFile(_assetId: string): void {
    // No-op: Map<string, File> is removed to prevent long-term memory leaks
  }

  function getCachedAsset(assetId: string): AssetModel | null {
    return assets.value.find((asset) => asset.id === assetId) ?? null
  }

  return {
    assets,
    pendingUploads,
    lastError,
    upload,
    downloadUrl,
    downloadSourceInput,
    getLocalFile,
    forgetLocalFile,
    getCachedAsset,
  }
})
