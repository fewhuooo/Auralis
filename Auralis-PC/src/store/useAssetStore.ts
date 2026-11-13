import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { getDownloadUrl, type AssetView } from '@/api/useAssetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { getLocalRepository, getLocalAssetRepository } from '@/services/localDb'
import { mapAssetView, type AssetModel } from '@/services/domainMappers'
import { validateUploadFile } from '@/utils/filePreview'
import { uuidv7 } from '@/utils/uuid'
import { getOrCreateLocalAssetService } from '@/services/localAssetService'
import type { LocalAssetFileReadResult } from '@/services/localAssetService'
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

export type AssetInput = Pick<LocalAssetFileReadResult, 'file' | 'cleanup'>

interface AssetOwnerSnapshot {
  userId: string
  serverDeviceId: string
  sessionId: string | null
  generation: number
}

export const useAssetStore = defineStore('asset', () => {
  const assets = ref<AssetModel[]>([])
  const pendingUploads = ref<PendingAssetUpload[]>([])
  const lastError = ref<string | null>(null)
  const authStore = useAuthStore()
  let ownerGeneration = 0

  watch(
    () => ({ userId: authStore.user?.id, serverDeviceId: authStore.serverDeviceId, sessionId: authStore.sessionId }),
    (newOwner, oldOwner) => {
      if (!oldOwner || (newOwner.userId === oldOwner.userId && newOwner.serverDeviceId === oldOwner.serverDeviceId && newOwner.sessionId === oldOwner.sessionId)) return
      ownerGeneration += 1
      if (newOwner.userId !== oldOwner.userId || newOwner.serverDeviceId !== oldOwner.serverDeviceId) {
        assets.value = []
        pendingUploads.value = []
        lastError.value = null
      }
    },
    { flush: 'sync', deep: true },
  )

  function requireOwner(): AssetOwnerSnapshot {
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId) throw new Error('Asset access requires an authenticated user and device')
    return { userId, serverDeviceId, sessionId: authStore.sessionId, generation: ownerGeneration }
  }

  function assertOwner(owner: AssetOwnerSnapshot): void {
    if (ownerGeneration !== owner.generation
      || authStore.user?.id !== owner.userId
      || authStore.serverDeviceId !== owner.serverDeviceId
      || authStore.sessionId !== owner.sessionId) {
      throw new Error('ASSET_IDENTITY_CHANGED')
    }
  }



  async function upload(file: File, onProgress?: (percent: number, stage: string) => void): Promise<AssetModel> {
    const owner = requireOwner()
    const reportProgress = (percent: number, stage: string): void => {
      if (ownerGeneration === owner.generation && authStore.user?.id === owner.userId
        && authStore.serverDeviceId === owner.serverDeviceId && authStore.sessionId === owner.sessionId) {
        onProgress?.(percent, stage)
      }
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
    if (ownerGeneration === owner.generation) {
      pendingUploads.value = [...pendingUploads.value, pending]
      lastError.value = null
    }

    try {
      reportProgress(10, '校验并持久化本地资产...')
      const localAssetRepo = await getLocalAssetRepository(owner.userId, owner.serverDeviceId)
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

      reportProgress(50, '登记本地资料库...')

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
      const repo = await getLocalRepository(owner.userId, owner.serverDeviceId)
      await repo.upsert('ASSET', localAssetId, syntheticView, {
        version: 0,
        deletedAt: null,
        syncStatus: 'pending',
      })

      assertOwner(owner)
      const model = Object.assign(mapAssetView(syntheticView), {
        originalName: file.name,
        uploadStatus: syntheticView.uploadStatus,
      })
      assets.value = [model, ...assets.value.filter((item) => item.id !== model.id)]
      pendingUploads.value = pendingUploads.value.filter((item) => item.clientUploadId !== clientUploadId)
      reportProgress(100, '本地导入完成')

      // Request background sync
      useSyncStore().requestBackgroundSync('write')

      return model
    } catch (error) {
      const message = error instanceof Error ? error.message : '资产上传失败'
      if (ownerGeneration === owner.generation && authStore.user?.id === owner.userId
        && authStore.serverDeviceId === owner.serverDeviceId && authStore.sessionId === owner.sessionId) {
        const current = pendingUploads.value.find((item) => item.clientUploadId === clientUploadId)
        if (current) {
          current.status = 'failed'
          current.error = message
        }
        lastError.value = message
      }
      throw error
    }
  }

  async function downloadAssetInfo(assetId: string, owner = requireOwner()) {
    const localAssetRepo = await getLocalAssetRepository(owner.userId, owner.serverDeviceId)
    const localRecord = await localAssetRepo.getAssetFile(assetId)
      ?? await localAssetRepo.getAssetFileByServerId(assetId)
    assertOwner(owner)

    const response = await getDownloadUrl(localRecord?.serverAssetId || assetId)
    if (!response.url) throw new Error('Asset download response missing URL')
    if (!response.originalName || !response.mimeType) throw new Error('Asset download response missing file metadata')
    assertOwner(owner)
    return { url: response.url, originalName: response.originalName, mimeType: response.mimeType }
  }

  async function resolveLocalFile(assetId: string): Promise<AssetInput | null> {
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId || !assetId.trim()) return null

    const localAssetRepo = await getLocalAssetRepository(userId, serverDeviceId)
    const assetService = getOrCreateLocalAssetService(localAssetRepo)
    const local = await assetService.readAssetFile({ localAssetId: assetId })
      ?? await assetService.readAssetFile({ serverAssetId: assetId })
    if (authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) {
      local?.cleanup()
      throw new Error('ASSET_IDENTITY_CHANGED')
    }
    return local
  }

  async function resolveSourceInput(assetId: string): Promise<AssetInput> {
    const owner = requireOwner()
    const local = await resolveLocalFile(assetId)
    assertOwner(owner)
    if (local) return local

    const { url, originalName, mimeType } = await downloadAssetInfo(assetId, owner)
    assertOwner(owner)
    const response = await fetch(url).catch(() => { throw new Error('NETWORK_OFFLINE') })
    assertOwner(owner)
    if (!response.ok) throw new Error(`ASSET_DOWNLOAD_FAILED_${response.status}`)
    const blob = await response.blob().catch(() => { throw new Error('NETWORK_OFFLINE') })
    assertOwner(owner)
    return {
      file: new File([blob], originalName, { type: mimeType }),
      cleanup: () => undefined,
    }
  }

  async function getAssetSha256(assetId: string): Promise<string | null> {
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId || !assetId.trim()) return null
    const localAssetRepo = await getLocalAssetRepository(userId, serverDeviceId)
    const record = await localAssetRepo.getAssetFile(assetId)
      ?? await localAssetRepo.getAssetFileByServerId(assetId)
    if (authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) {
      throw new Error('ASSET_IDENTITY_CHANGED')
    }
    return record?.sha256 ?? null
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
    downloadAssetInfo,
    resolveLocalFile,
    resolveSourceInput,
    getAssetSha256,
    getLocalFile,
    forgetLocalFile,
    getCachedAsset,
  }
})
