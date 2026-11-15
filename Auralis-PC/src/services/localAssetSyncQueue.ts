import {
  createUploadIntent,
  uploadToObjectStorage,
  completeUpload,
  type UploadIntentRequest,
  type UploadIntentResponse,
  type AssetView,
} from '@/api/useAssetApi'
import { ApiProblemError } from '@/api/httpError'
import type { LocalAssetRepository } from '@/services/localAssetRepository'
import type { LocalAssetService } from '@/services/localAssetService'
import type { LocalSourceDraftService } from '@/services/localSourceDraftService'
import type { LocalAssetSyncPhase } from '@/types/localAsset'

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
  onRetryDue?: () => void
  wakeOnOnline?: boolean
  now?: () => string
}

function computeNextRetryAt(attempt: number, nowMs: number): string {
  const exponent = Math.min(attempt, 8)
  const delaySeconds = Math.min(900, Math.max(1, Math.pow(2, exponent)))
  return new Date(nowMs + delaySeconds * 1000).toISOString()
}

function sanitizeErrorCode(error: unknown): string {
  if (error instanceof ApiProblemError && error.problem.code) return error.problem.code
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
    'LOCAL_ASSET_UPLOAD_REQUEST_INVALID',
    'LOCAL_ASSET_UPLOAD_REDIRECT_REJECTED',
    'LOCAL_ASSET_SIZE_MISMATCH',
    'LOCAL_ASSET_HASH_MISMATCH',
    'LOCAL_ASSET_FILE_MISSING',
    'LOCAL_ASSET_TRANSIENT_FILE_MISSING',
    'LOCAL_ASSET_FILE_AMBIGUOUS',
    'LOCAL_ASSET_BUSY',
    'NATIVE_UPLOAD_RECEIPT_MISMATCH',
    'QUEUE_DISPOSED',
    'QUEUE_RELEASED_DURING_INIT',
    'LOCAL_ASSET_QUEUE_DISPOSED',
    'LOCAL_SOURCE_DRAFT_INTERRUPTED',
    'LOCAL_ASSET_DELETE_FENCED'
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

function isTerminalUploadError(code: string, phase: LocalAssetSyncPhase): boolean {
  if (phase === 'CREATING_REMOTE_ASSET'
    && ['VALIDATION_FAILED', 'UPLOAD_VALIDATION_FAILED', 'MUTATION_REJECTED'].includes(code)) return true
  return [
    'ASSET_ORPHANED',
    'LOCAL_ASSET_UPLOAD_PAYLOAD_MISMATCH',
    'LOCAL_ASSET_SIZE_MISMATCH',
    'LOCAL_ASSET_HASH_MISMATCH',
    'LOCAL_ASSET_TRANSIENT_FILE_MISSING',
    'LOCAL_ASSET_FILE_AMBIGUOUS',
  ].includes(code)
}

export class QueueDisposedError extends Error {
  readonly code = 'QUEUE_DISPOSED'
  constructor(message = 'QUEUE_DISPOSED') {
    super(message)
    this.name = 'QueueDisposedError'
  }
}

export class QueueReleasedError extends Error {
  readonly code = 'QUEUE_RELEASED_DURING_INIT'
  constructor(message = 'QUEUE_RELEASED_DURING_INIT') {
    super(message)
    this.name = 'QueueReleasedError'
  }
}

class AssetDeleteFencedError extends Error {
  readonly code = 'LOCAL_ASSET_DELETE_FENCED'
  constructor() {
    super('LOCAL_ASSET_DELETE_FENCED')
    this.name = 'AssetDeleteFencedError'
  }
}

function isDisposedError(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code)
    if (
      code === 'QUEUE_DISPOSED' ||
      code === 'QUEUE_RELEASED_DURING_INIT' ||
      code === 'LOCAL_ASSET_QUEUE_DISPOSED' ||
      code === 'LOCAL_ASSET_DELETE_FENCED'
    ) {
      return true
    }
  }
  if (error instanceof Error) {
    if (
      error.message === 'QUEUE_DISPOSED' ||
      error.message === 'QUEUE_RELEASED_DURING_INIT' ||
      error.message === 'LOCAL_ASSET_QUEUE_DISPOSED' ||
      error.message === 'LOCAL_SOURCE_DRAFT_INTERRUPTED' ||
      error.message === 'LOCAL_ASSET_DELETE_FENCED'
    ) {
      return true
    }
  }
  return false
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
  private readonly onRetryDue?: () => void
  private retryTimer?: ReturnType<typeof setTimeout>
  private readonly now: () => string
  private processing: Promise<void> | null = null
  private rerun: (() => boolean) | null = null
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
    this.onRetryDue = options.onRetryDue
    this.now = options.now ?? (() => new Date().toISOString())

    if (options.wakeOnOnline !== false && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.onlineHandler = () => {
        void this.wakeUp()
      }
      window.addEventListener('online', this.onlineHandler)
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new QueueDisposedError()
    }
  }

  private async assertJobLive(jobId: string, localAssetId: string): Promise<void> {
    this.assertNotDisposed()
    const job = await this.assetRepository.getSyncJob(jobId)
    const asset = await this.assetRepository.getAssetFile(localAssetId)
    if (!job || job.phase === 'SYNCED' || !asset || asset.state === 'DELETING') {
      throw new AssetDeleteFencedError()
    }
  }

  isDisposed(): boolean {
    return this.disposed
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.retryTimer)
    if (this.onlineHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', this.onlineHandler)
    }
  }

  async recoverInflightJobs(): Promise<number> {
    return this.assetRepository.recoverInflightJobs()
  }

  wakeUp(canProcess?: () => boolean): Promise<void> {
    return this.processQueue(canProcess)
  }

  async retryNow(jobId?: string): Promise<void> {
    if (this.disposed) return
    const currentTime = this.now()
    if (jobId) {
      if (this.disposed) return
      const job = await this.assetRepository.getSyncJob(jobId)
      if (this.disposed) return
      if (job && job.phase === 'PENDING') {
        if (this.disposed) return
        await this.assetRepository.recordSyncFailure(jobId, job.safeErrorCode ?? 'SYNC_FAILED', job.safeErrorDetail ?? '', currentTime)
        if (this.disposed) return
      }
    }
    if (this.disposed) return
    await this.processQueue()
    if (this.disposed) return
  }

  processQueue(canProcess: () => boolean = () => true): Promise<void> {
    if (this.disposed || !canProcess()) return Promise.resolve()
    if (this.processing) {
      this.rerun = canProcess
      return this.processing
    }

    clearTimeout(this.retryTimer)
    this.processing = (async () => {
      let enabled = canProcess
      do {
        this.rerun = null
        while (!this.disposed && enabled()) {
          const currentTime = this.now()
          const job = await this.assetRepository.claimNextSyncJob(currentTime)
          if (this.disposed || !job) break
          await this.processSingleJob(job.jobId, job.localAssetId, job.attempt, job.serverAssetId)
        }
        if (!this.rerun && !this.disposed && enabled() && this.onRetryDue) {
          const nextRetryAt = await this.assetRepository.getNextRetryAt()
          if (!this.rerun && !this.disposed && nextRetryAt) {
            const remainingMs = Date.parse(nextRetryAt) - Date.parse(this.now())
            this.retryTimer = setTimeout(this.onRetryDue, Math.max(0, remainingMs))
          }
        }
        if (!this.rerun) return
        enabled = this.rerun
      } while (!this.disposed)
    })().finally(() => { this.processing = null })
    return this.processing
  }

  private async processSingleJob(
    jobId: string,
    localAssetId: string,
    attempt: number,
    initialServerAssetId: string | null,
  ): Promise<void> {
    try {
      this.assertNotDisposed()
      await this.assertJobLive(jobId, localAssetId)

      const assetFile = await this.assetRepository.getAssetFile(localAssetId)
      this.assertNotDisposed()
      if (!assetFile) {
        // Asset metadata missing; complete job
        this.assertNotDisposed()
        await this.assetRepository.completeSyncJob(jobId)
        this.assertNotDisposed()
        return
      }

      let serverAssetId = initialServerAssetId ?? assetFile.serverAssetId
      let uploadUrl: string | null = null
      let headers: Record<string, string> | undefined = undefined
      let isAlreadyReady = false

      // 1. Create or replay remote upload intent
      this.assertNotDisposed()
      const intent = await this.api.createUploadIntent({
        baseVersion: 0,
        clientImportId: localAssetId,
        originalName: assetFile.originalName,
        mimeType: assetFile.mimeType,
        sizeBytes: assetFile.sizeBytes,
        sha256: assetFile.sha256,
      })
      this.assertNotDisposed()
      await this.assertJobLive(jobId, localAssetId)

      serverAssetId = intent.assetId ?? serverAssetId
      if (!serverAssetId) {
        throw new Error('UPLOAD_INTENT_FAILED: Remote server did not return assetId')
      }

      this.assertNotDisposed()
      await this.assetRepository.mapServerAssetId(localAssetId, serverAssetId)
      this.assertNotDisposed()
      await this.assertJobLive(jobId, localAssetId)

      if (intent.uploadStatus === 'READY') {
        isAlreadyReady = true
        this.assertNotDisposed()
        await this.assetRepository.updateSyncJobPhase(jobId, 'BINDING_SOURCE', { serverAssetId })
        this.assertNotDisposed()
      } else if (intent.uploadStatus === 'ORPHANED') {
        throw new Error('ASSET_ORPHANED: Remote asset is in ORPHANED state')
      } else {
        uploadUrl = intent.uploadUrl ?? null
        headers = intent.headers
        this.assertNotDisposed()
        await this.assetRepository.updateSyncJobPhase(jobId, 'UPLOADING', { serverAssetId })
        this.assertNotDisposed()
        await this.assertJobLive(jobId, localAssetId)
      }

      // 2. Binary upload & complete if not already ready
      if (!isAlreadyReady) {
        if (!uploadUrl) {
          throw new Error('UPLOAD_INTENT_FAILED: Missing uploadUrl for UPLOADING phase')
        }

        this.assertNotDisposed()
        const current = await this.assetRepository.getAssetFile(localAssetId)
        this.assertNotDisposed()
        if (current && (current.state === 'READY_LOCAL' || current.state === 'SYNC_FAILED')) {
          this.assertNotDisposed()
          await this.assetRepository.transitionAssetState(localAssetId, 'SYNCING')
          this.assertNotDisposed()
        }

        this.assertNotDisposed()
        await this.assetService.uploadAssetToRemote(localAssetId, uploadUrl, headers)
        this.assertNotDisposed()
        await this.assertJobLive(jobId, localAssetId)

        this.assertNotDisposed()
        await this.assetRepository.updateSyncJobPhase(jobId, 'COMPLETING_REMOTE_ASSET', { serverAssetId })
        this.assertNotDisposed()

        this.assertNotDisposed()
        await this.api.completeUpload(serverAssetId)
        this.assertNotDisposed()
        await this.assertJobLive(jobId, localAssetId)

        this.assertNotDisposed()
        await this.assetRepository.updateSyncJobPhase(jobId, 'BINDING_SOURCE', { serverAssetId })
        this.assertNotDisposed()
      }

      // 3. Mark asset SYNCED in repository
      this.assertNotDisposed()
      const currentAsset = await this.assetRepository.getAssetFile(localAssetId)
      this.assertNotDisposed()
      if (currentAsset && currentAsset.state !== 'SYNCED') {
        this.assertNotDisposed()
        await this.assetRepository.transitionAssetState(localAssetId, 'SYNCED')
        this.assertNotDisposed()
        await this.assertJobLive(jobId, localAssetId)
      }

      // 4. Release all drafts for this asset
      this.assertNotDisposed()
      const released = await this.draftService.releaseDraftsForAsset(
        localAssetId,
        serverAssetId,
        () => this.assertNotDisposed(),
      )
      this.assertNotDisposed()
      await this.assertJobLive(jobId, localAssetId)

      // 5. Complete job
      this.assertNotDisposed()
      await this.assetRepository.completeSyncJob(jobId)
      this.assertNotDisposed()

      if (released.length > 0 && this.onWakeup && !this.disposed) {
        this.assertNotDisposed()
        this.onWakeup()
      }
    } catch (error) {
      if (this.disposed || isDisposedError(error)) {
        return
      }
      console.error('[LocalAssetSyncQueue] processSingleJob failed:', error)
      const safeCode = sanitizeErrorCode(error)
      const safeDetail = sanitizeErrorDetail(error)

      // Transition asset to SYNC_FAILED so local state remains observable without corrupting file
      try {
        if (this.disposed) return
        const file = await this.assetRepository.getAssetFile(localAssetId)
        if (this.disposed) return
        if (file && file.state === 'SYNCING') {
          if (this.disposed) return
          await this.assetRepository.transitionAssetState(localAssetId, 'SYNC_FAILED')
          if (this.disposed) return
        }
      } catch {
        // preserve local file state
      }

      if (this.disposed) return
      // Source deletion may have fenced and removed this job while an
      // already-claimed network request was in flight.  The durable delete
      // fence wins; never recreate the upload row from error recovery.
      const remainingJob = await this.assetRepository.getSyncJob(jobId)
      if (!remainingJob || this.disposed) return
      const nextRetryAt = isTerminalUploadError(safeCode, remainingJob.phase)
        ? null
        : computeNextRetryAt(attempt, Date.parse(this.now()))
      await this.assetRepository.recordSyncFailure(jobId, safeCode, safeDetail, nextRetryAt)
      if (this.disposed) return
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
        throw new QueueReleasedError()
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
