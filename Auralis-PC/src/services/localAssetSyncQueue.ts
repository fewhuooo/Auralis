import {
  createUploadIntent,
  uploadToObjectStorage,
  completeUpload,
  type UploadIntentRequest,
  type UploadIntentResponse,
  type AssetView,
} from '@/api/useAssetApi'
import type { LocalAssetRepository } from '@/services/localAssetRepository'
import type { LocalAssetService } from '@/services/localAssetService'
import type { LocalSourceDraftService } from '@/services/localSourceDraftService'

export interface AssetSyncApi {
  createUploadIntent(data: UploadIntentRequest): Promise<UploadIntentResponse>
  uploadToObjectStorage(
    uploadUrl: string,
    file: Blob | File,
    headers?: Record<string, string>,
    onProgress?: (percent: number) => void,
  ): Promise<void>
  completeUpload(assetId: string): Promise<AssetView>
}

export interface LocalAssetSyncQueueOptions {
  assetRepository: LocalAssetRepository
  assetService: LocalAssetService
  draftService: LocalSourceDraftService
  api?: AssetSyncApi
  onWakeup?: () => void
  now?: () => string
}

function computeNextRetryAt(attempt: number, nowMs: number): string {
  const exponent = Math.min(attempt, 8)
  const delaySeconds = Math.min(900, Math.max(1, Math.pow(2, exponent)))
  return new Date(nowMs + delaySeconds * 1000).toISOString()
}

function sanitizeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as Record<string, unknown>).code === 'string') {
    const code = ((error as Record<string, unknown>).code as string).trim().toUpperCase()
    if (/^[A-Z0-9_]{1,64}$/.test(code)) return code
  }
  const message = error instanceof Error ? error.message : String(error)
  const allowlist = [
    'LOCAL_ASSET_UPLOAD_RETRYABLE',
    'LOCAL_ASSET_UPLOAD_INTENT_EXPIRED',
    'LOCAL_ASSET_UPLOAD_PAYLOAD_MISMATCH',
    'LOCAL_ASSET_UPLOAD_HEADER_INVALID',
    'LOCAL_ASSET_UPLOAD_HEADER_FORBIDDEN',
    'LOCAL_ASSET_UPLOAD_URL_INVALID',
    'LOCAL_ASSET_FILE_MISSING',
    'LOCAL_ASSET_FILE_AMBIGUOUS',
    'LOCAL_ASSET_BUSY',
    'NATIVE_UPLOAD_RECEIPT_MISMATCH'
  ]
  for (const code of allowlist) {
    if (message.includes(code)) return code
  }

  if (message.includes('ECONNREFUSED') || message.includes('Failed to fetch') || message.includes('network')) {
    return 'NETWORK_ERROR'
  }
  if (message.includes('TIMEOUT') || message.includes('timeout')) {
    return 'NETWORK_TIMEOUT'
  }
  if (message.includes('ORPHANED')) {
    return 'ASSET_ORPHANED'
  }
  return 'SYNC_FAILED'
}

function sanitizeErrorDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/https?:\/\/[^\s?#]+(\?[^\s]*)?/gi, '<url>')
    .replace(/[a-fA-F0-9]{64}/g, '<hash>')
    .replace(/(authorization|x-amz-[a-z0-9-]+):\s*[^\s]+/gi, '$1: <redacted>')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 500) || 'Unknown sync failure'
}

export class LocalAssetSyncQueue {
  private readonly assetRepository: LocalAssetRepository
  private readonly assetService: LocalAssetService
  private readonly draftService: LocalSourceDraftService
  private readonly api: AssetSyncApi
  private readonly onWakeup?: () => void
  private readonly now: () => string
  private isProcessing = false
  private rerunRequested = false
  private disposed = false
  private readonly onlineHandler?: () => void

  constructor(options: LocalAssetSyncQueueOptions) {
    this.assetRepository = options.assetRepository
    this.assetService = options.assetService
    this.draftService = options.draftService
    this.api = options.api ?? {
      createUploadIntent,
      uploadToObjectStorage,
      completeUpload,
    }
    this.onWakeup = options.onWakeup
    this.now = options.now ?? (() => new Date().toISOString())

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.onlineHandler = () => {
        void this.wakeUp()
      }
      window.addEventListener('online', this.onlineHandler)
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.onlineHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', this.onlineHandler)
    }
  }

  async recoverInflightJobs(): Promise<number> {
    return this.assetRepository.recoverInflightJobs()
  }

  wakeUp(): Promise<void> {
    return this.processQueue()
  }

  async retryNow(jobId?: string): Promise<void> {
    const currentTime = this.now()
    if (jobId) {
      const job = await this.assetRepository.getSyncJob(jobId)
      if (job && job.phase === 'PENDING') {
        await this.assetRepository.scheduleRetry(jobId, job.safeErrorCode ?? 'SYNC_FAILED', job.safeErrorDetail ?? '', currentTime)
      }
    }
    await this.processQueue()
  }

  async processQueue(): Promise<void> {
    if (this.disposed) return
    if (this.isProcessing) {
      this.rerunRequested = true
      return
    }

    this.isProcessing = true
    this.rerunRequested = false

    try {
      while (!this.disposed) {
        const currentTime = this.now()
        const job = await this.assetRepository.claimNextSyncJob(currentTime)
        if (!job) break

        await this.processSingleJob(job.jobId, job.localAssetId, job.attempt, job.serverAssetId)
      }
    } finally {
      this.isProcessing = false
      if (this.rerunRequested && !this.disposed) {
        this.rerunRequested = false
        void this.processQueue()
      }
    }
  }

  private async processSingleJob(
    jobId: string,
    localAssetId: string,
    attempt: number,
    initialServerAssetId: string | null,
  ): Promise<void> {
    try {
      const assetFile = await this.assetRepository.getAssetFile(localAssetId)
      if (!assetFile) {
        // Asset metadata missing; complete job
        await this.assetRepository.completeSyncJob(jobId)
        return
      }

      let serverAssetId = initialServerAssetId ?? assetFile.serverAssetId
      let uploadUrl: string | null = null
      let headers: Record<string, string> | undefined = undefined
      let isAlreadyReady = false

      // 1. Create or replay remote upload intent
      const intent = await this.api.createUploadIntent({
        baseVersion: 0,
        clientImportId: localAssetId,
        originalName: assetFile.originalName,
        mimeType: assetFile.mimeType,
        sizeBytes: assetFile.sizeBytes,
        sha256: assetFile.sha256,
      })

      serverAssetId = intent.assetId ?? serverAssetId
      if (!serverAssetId) {
        throw new Error('UPLOAD_INTENT_FAILED: Remote server did not return assetId')
      }

      await this.assetRepository.mapServerAssetId(localAssetId, serverAssetId)

      if (intent.uploadStatus === 'READY') {
        isAlreadyReady = true
        await this.assetRepository.updateSyncJobPhase(jobId, 'BINDING_SOURCE', { serverAssetId })
      } else if (intent.uploadStatus === 'ORPHANED') {
        throw new Error('ASSET_ORPHANED: Remote asset is in ORPHANED state')
      } else {
        uploadUrl = intent.uploadUrl ?? null
        headers = intent.headers
        await this.assetRepository.updateSyncJobPhase(jobId, 'UPLOADING', { serverAssetId })
      }

      // 2. Binary upload & complete if not already ready
      if (!isAlreadyReady) {
        if (!uploadUrl) {
          throw new Error('UPLOAD_INTENT_FAILED: Missing uploadUrl for UPLOADING phase')
        }

        const current = await this.assetRepository.getAssetFile(localAssetId)
        if (current && (current.state === 'READY_LOCAL' || current.state === 'SYNC_FAILED')) {
          await this.assetRepository.transitionAssetState(localAssetId, 'SYNCING')
        }

        await this.assetService.uploadAssetToRemote(localAssetId, uploadUrl, headers)


        await this.assetRepository.updateSyncJobPhase(jobId, 'COMPLETING_REMOTE_ASSET', { serverAssetId })

        await this.api.completeUpload(serverAssetId)
        await this.assetRepository.updateSyncJobPhase(jobId, 'BINDING_SOURCE', { serverAssetId })
      }

      // 3. Mark asset SYNCED in repository
      const currentAsset = await this.assetRepository.getAssetFile(localAssetId)
      if (currentAsset && currentAsset.state !== 'SYNCED') {
        await this.assetRepository.transitionAssetState(localAssetId, 'SYNCED')
      }

      // 4. Release all drafts for this asset
      const released = await this.draftService.releaseDraftsForAsset(localAssetId, serverAssetId)

      // 5. Complete job
      await this.assetRepository.completeSyncJob(jobId)

      if (released.length > 0 && this.onWakeup) {
        this.onWakeup()
      }
    } catch (error) {
      console.error('[LocalAssetSyncQueue] processSingleJob failed:', error)
      const safeCode = sanitizeErrorCode(error)
      const safeDetail = sanitizeErrorDetail(error)
      const nextRetryAt = computeNextRetryAt(attempt, Date.now())

      // Transition asset to SYNC_FAILED so local state remains observable without corrupting file
      try {
        const file = await this.assetRepository.getAssetFile(localAssetId)
        if (file && file.state === 'SYNCING') {
          await this.assetRepository.transitionAssetState(localAssetId, 'SYNC_FAILED')
        }
      } catch {
        // preserve local file state
      }

      await this.assetRepository.scheduleRetry(jobId, safeCode, safeDetail, nextRetryAt)
    }
  }
}

const queueCache = new Map<string, LocalAssetSyncQueue>()
const queueInitPromises = new Map<string, Promise<LocalAssetSyncQueue>>()
const queueInitTokens = new Map<string, object>()

export async function getOrCreateLocalAssetSyncQueue(options: LocalAssetSyncQueueOptions): Promise<LocalAssetSyncQueue> {
  const key = `${options.assetRepository.userId}:${options.assetRepository.serverDeviceId}`

  const existing = queueCache.get(key)
  if (existing) return existing

  const inFlight = queueInitPromises.get(key)
  if (inFlight) return inFlight

  const token = {}
  queueInitTokens.set(key, token)

  const initPromise = (async () => {
    const instance = new LocalAssetSyncQueue(options)
    try {
      await instance.recoverInflightJobs()
      if (queueInitTokens.get(key) !== token) {
        instance.dispose()
        const err = new Error('QUEUE_RELEASED_DURING_INIT')
        ;(err as Error & { code?: string }).code = 'QUEUE_RELEASED_DURING_INIT'
        throw err
      }
      queueCache.set(key, instance)
      return instance
    } catch (error) {
      instance.dispose()
      throw error
    } finally {
      if (queueInitTokens.get(key) === token) {
        queueInitTokens.delete(key)
        queueInitPromises.delete(key)
      }
    }
  })()

  queueInitPromises.set(key, initPromise)
  return initPromise
}

export function releaseLocalAssetSyncQueue(userId: string, serverDeviceId: string): void {
  const key = `${userId}:${serverDeviceId}`
  const instance = queueCache.get(key)
  if (instance) {
    instance.dispose()
    queueCache.delete(key)
  }
  queueInitPromises.delete(key)
  queueInitTokens.delete(key)
}
