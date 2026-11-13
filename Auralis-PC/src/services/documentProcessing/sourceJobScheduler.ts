import {
  isDocumentCacheReceiptV1,
  isLocalCacheReceiptV1,
  documentLocalCacheBind,
  type DocumentCacheReceipt,
  type LocalCacheBindRequest,
} from '@/api/tauri'
import { ApiProblemError } from '../../api/httpError.ts'
import type { SourceView } from '@/api/useSourceApi'
import type { DocumentProcessingJob, CreateDocumentProcessingJobInput } from '@/types/documentProcessing'
import { validatedDocumentCacheId } from './cacheSafety.ts'
import { isNetworkFailure } from './checkpointPolicy.ts'
import type { LocalSourceDraftService } from '@/services/localSourceDraftService'
import type { LocalParsedDocumentRepository } from '@/services/localParsedDocumentRepository'
import type { LocalAssetRepository } from '@/services/localAssetRepository'
import type { LocalParsedDocumentCoordinator } from './LocalParsedDocumentCoordinator'

export interface SourceInput {
  /** The parser-facing file. It is never written to a job row or sent over HTTP. */
  file: { name: string; type?: string; size?: number }
  /** Removes a downloaded/private temporary input. Local user files normally use a no-op. */
  cleanup?: () => Promise<void> | void
}

interface JobRepository {
  create(input: CreateDocumentProcessingJobInput): Promise<DocumentProcessingJob>
  get(jobId: string): Promise<DocumentProcessingJob | null>
  list(): Promise<DocumentProcessingJob[]>
  removeBySource(sourceId: string): Promise<DocumentProcessingJob[]>
  remove(jobId: string): Promise<DocumentProcessingJob | null>
  transition(jobId: string, phase: DocumentProcessingJob['phase'], options?: {
    attempt?: number
    payloadCacheId?: string | null
    payloadReceipt?: DocumentCacheReceipt | null
    errorCode?: string | null
    errorDetail?: string | null
  }): Promise<DocumentProcessingJob>
}

interface SourceApi {
  get(sourceId: string): Promise<SourceView>
}

interface UploadCoordinator {
  upload(jobId: string, receipt: DocumentCacheReceipt, metadata: { sourceAssetSha256?: string }): Promise<{ status: string }>
}

export interface SourceJobSchedulerOptions {
  repository: JobRepository
  sourceApi: SourceApi
  upload: UploadCoordinator
  localDraftService?: LocalSourceDraftService
  localParsedRepo?: LocalParsedDocumentRepository
  localAssetRepo?: LocalAssetRepository
  localParsedCoordinator?: LocalParsedDocumentCoordinator
  bindLocalCache?: (request: LocalCacheBindRequest) => Promise<DocumentCacheReceipt>
  /** Returns the File still held by the current upload session, if any. */
  resolveLocalInput?: (assetId: string, source: SourceView) => Promise<SourceInput | null> | SourceInput | null
  /** Resolves an owner-scoped download URL internally and returns only a private input handle. */
  downloadAsset: (assetId: string, source: SourceView) => Promise<SourceInput>
  /** Must be backed by the native/Tauri streaming hash path in production. */
  hashFile: (file: SourceInput['file']) => Promise<string>
  expectedAssetSha256?: (assetId: string) => Promise<string | null | undefined>
  /** Binds the input to the parser/runner without persisting the original path. */
  prepareInput: (job: DocumentProcessingJob, source: SourceView, input: SourceInput['file']) => Promise<void>
  /** Usually DocumentJobRunner.start. The runner persists the full cache receipt. */
  runJob: (jobId: string, metadata?: { sourceAssetSha256: string }) => Promise<void>
  /** Stops a running parser before its durable job row is discarded. */
  cancelJob?: (jobId: string) => Promise<void>
  /** Releases a runtime-only parser input which must not outlive its job. */
  discardPreparedInput?: (jobId: string) => Promise<void> | void
  deleteCache?: (cacheId: string) => Promise<void>
  deleteLocalCache?: (cacheId: string) => Promise<void>
  /** Keeps UI state in sync without letting observation failures interrupt processing. */
  onJobChanged?: () => Promise<void> | void
  idFactory?: () => string
}

export type SourceScheduleStatus =
  | 'READY'
  | 'LOCAL_READY'
  | 'WAITING_SERVER_REVISION'
  | 'PAUSED_NETWORK'
  | 'FAILED_LOCAL'
  | 'FAILED_SERVER'
  | 'SKIPPED'

export interface SourceScheduleResult {
  status: SourceScheduleStatus
  jobId?: string
  reason?: string
}

interface SourceScheduleOptions {
  revalidateNotFound?: boolean
  retryJobId?: string
  resumePausedDraft?: boolean
}

const TERMINAL_PHASES = new Set<DocumentProcessingJob['phase']>(['READY', 'FAILED_LOCAL', 'FAILED_SERVER'])
const UPLOAD_PHASES = new Set<DocumentProcessingJob['phase']>(['PACKAGING', 'UPLOADING', 'SERVER_VALIDATING', 'SERVER_INDEXING'])
const DOCUMENT_JOB_TRANSITIONS_LOCAL_FAILURES = new Set<DocumentProcessingJob['phase']>([
  'QUEUED', 'DOWNLOADING_SOURCE', 'EXTRACTING', 'OCR_RUNNING', 'PACKAGING', 'UPLOADING', 'SERVER_VALIDATING', 'SERVER_INDEXING', 'PAUSED_NETWORK',
])

function randomJobId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `document-job-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function sameSha(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && /^[a-f0-9]{64}$/i.test(left) && /^[a-f0-9]{64}$/i.test(right)
    && left.toLowerCase() === right.toLowerCase())
}

function isUploadPhase(phase: DocumentProcessingJob['phase']): boolean {
  return UPLOAD_PHASES.has(phase)
}

function isSourceNotFound(error: unknown): boolean {
  return error instanceof ApiProblemError
    && (error.status === 404 || error.problem.code === 'RESOURCE_NOT_FOUND')
}

function staleFailurePhase(phase: DocumentProcessingJob['phase']): 'FAILED_LOCAL' | 'FAILED_SERVER' {
  if (phase === 'PACKAGING') return 'FAILED_LOCAL'
  return isUploadPhase(phase) ? 'FAILED_SERVER' : 'FAILED_LOCAL'
}

function legacyCacheId(job: DocumentProcessingJob): string | null {
  return validatedDocumentCacheId(job.payloadCacheId, job.payloadReceipt?.cacheId)
}

export class SourceJobScheduler {
  private readonly repository: JobRepository
  private readonly sourceApi: SourceApi
  private readonly upload: UploadCoordinator
  private readonly localDraftService?: LocalSourceDraftService
  private readonly localParsedRepo?: LocalParsedDocumentRepository
  private readonly localAssetRepo?: LocalAssetRepository
  private readonly localParsedCoordinator?: LocalParsedDocumentCoordinator
  private readonly bindLocalCache?: (request: LocalCacheBindRequest) => Promise<DocumentCacheReceipt>
  private readonly resolveLocalInput: NonNullable<SourceJobSchedulerOptions['resolveLocalInput']>
  private readonly downloadAsset: SourceJobSchedulerOptions['downloadAsset']
  private readonly hashFile: SourceJobSchedulerOptions['hashFile']
  private readonly expectedAssetSha256?: SourceJobSchedulerOptions['expectedAssetSha256']
  private readonly prepareInput: SourceJobSchedulerOptions['prepareInput']
  private readonly runJob: SourceJobSchedulerOptions['runJob']
  private readonly cancelJob?: SourceJobSchedulerOptions['cancelJob']
  private readonly discardPreparedInput?: SourceJobSchedulerOptions['discardPreparedInput']
  private readonly deleteCache?: SourceJobSchedulerOptions['deleteCache']
  private readonly deleteLocalCache?: SourceJobSchedulerOptions['deleteLocalCache']
  private readonly onJobChanged?: SourceJobSchedulerOptions['onJobChanged']
  private readonly idFactory: () => string
  private readonly active = new Map<string, Promise<SourceScheduleResult>>()
  private readonly discardedSources = new Set<string>()
  private readonly sourceNotFoundSources = new Set<string>()

  constructor(options: SourceJobSchedulerOptions) {
    this.repository = options.repository
    this.sourceApi = options.sourceApi
    this.upload = options.upload
    this.localDraftService = options.localDraftService
    this.localParsedRepo = options.localParsedRepo
    this.localAssetRepo = options.localAssetRepo
    this.localParsedCoordinator = options.localParsedCoordinator
    this.bindLocalCache = options.bindLocalCache
    this.resolveLocalInput = options.resolveLocalInput ?? (() => null)
    this.downloadAsset = options.downloadAsset
    this.hashFile = options.hashFile
    this.expectedAssetSha256 = options.expectedAssetSha256
    this.prepareInput = options.prepareInput
    this.runJob = options.runJob
    this.cancelJob = options.cancelJob
    this.discardPreparedInput = options.discardPreparedInput
    this.deleteCache = options.deleteCache
    this.deleteLocalCache = options.deleteLocalCache
    this.onJobChanged = options.onJobChanged
    this.idFactory = options.idFactory ?? randomJobId
  }

  async schedule(sourceId: string, options: SourceScheduleOptions = {}): Promise<SourceScheduleResult> {
    if (options.revalidateNotFound || options.retryJobId || options.resumePausedDraft) {
      let running = this.active.get(sourceId)
      while (running) {
        await running.catch(() => undefined)
        if (this.active.get(sourceId) === running) await Promise.resolve()
        running = this.active.get(sourceId)
      }
    }
    if (options.revalidateNotFound) {
      if (this.discardedSources.has(sourceId) && !this.sourceNotFoundSources.has(sourceId)) {
        return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
      }
      if (this.sourceNotFoundSources.has(sourceId)) {
        this.sourceNotFoundSources.delete(sourceId)
        this.discardedSources.delete(sourceId)
      }
    }
    if (this.sourceNotFoundSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }
    if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
    const running = this.active.get(sourceId)
    if (running) return running
    const task = this.process(sourceId, options)
    this.active.set(sourceId, task)
    try {
      return await task
    } finally {
      if (this.active.get(sourceId) === task) this.active.delete(sourceId)
      await this.notifyJobChanged()
    }
  }

  /**
   * Retries through the source boundary so a fresh runtime can reacquire the
   * Asset. A completed encrypted package keeps its receipt and is resumed by
   * the upload branch after the queued marker is observed.
   */
  async retry(jobId: string): Promise<SourceScheduleResult> {
    const job = await this.repository.get(jobId)
    if (!job || !['FAILED_LOCAL', 'FAILED_SERVER', 'PAUSED_NETWORK'].includes(job.phase)) {
      return { status: job?.phase === 'READY' ? 'READY' : 'SKIPPED', jobId, reason: 'JOB_NOT_RETRYABLE' }
    }
    return this.schedule(job.sourceId, { retryJobId: jobId })
  }

  async resumePausedDraft(sourceId: string): Promise<SourceScheduleResult> {
    return this.schedule(sourceId, { resumePausedDraft: true })
  }

  async resume(sourceIds: string[]): Promise<SourceScheduleResult[]> {
    const results: SourceScheduleResult[] = []
    for (const sourceId of sourceIds) {
      try {
        results.push(await this.schedule(sourceId))
      } catch (error) {
        // A stale or unreadable Source must not prevent later AWAITING_CLIENT
        // Sources from reaching the native runner. process() records a local
        // job failure when a job already exists; this result preserves the
        // failure for callers when the error happened before job creation.
        results.push({
          status: 'FAILED_LOCAL',
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return results
  }

  /**
   * Removes all local processing state when its Source is deleted. Cancelling
   * first prevents an already running OCR parser from recreating a package
   * after the persistent job rows are gone.
   */
  async discard(sourceId: string, reason: 'DELETED' | 'NOT_FOUND' = 'DELETED'): Promise<void> {
    if (!sourceId.trim()) return
    if (reason === 'NOT_FOUND') this.sourceNotFoundSources.add(sourceId)
    else this.sourceNotFoundSources.delete(sourceId)
    this.discardedSources.add(sourceId)
    await this.localParsedCoordinator?.cancel(sourceId)
    const jobs = (await this.repository.list()).filter((job) => job.sourceId === sourceId)
    for (const job of jobs) {
      await this.cancelJob?.(job.jobId)
      await this.discardPreparedInput?.(job.jobId)
    }
    const remainingJobs = (await this.repository.list()).filter((job) => job.sourceId === sourceId)
    for (const job of remainingJobs) {
      try {
        const cacheId = legacyCacheId(job)
        if (cacheId) await this.deleteCache?.(cacheId)
        await this.repository.remove(job.jobId)
      } catch (error) {
        const current = await this.repository.get(job.jobId)
        if (current) await this.markCleanupFailure(current, error)
        console.warn('[SourceJobScheduler] deleted Source cache cleanup failed', error)
      }
    }
    try {
      const localRecords = await this.localParsedRepo?.listBySource(sourceId) ?? []
      for (const record of localRecords) {
        if (record.localCacheId) await this.deleteLocalCache?.(record.localCacheId)
      }
      await this.localParsedRepo?.deleteBySource(sourceId)
    } catch (error) {
      console.warn('[SourceJobScheduler] deleted Source local parsed cache cleanup failed', error)
    }
    await this.notifyJobChanged()
  }

  private async process(sourceId: string, options: SourceScheduleOptions): Promise<SourceScheduleResult> {
    if (this.sourceNotFoundSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }
    if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }

    const localDraft = this.localDraftService ? await this.localDraftService.getDraft(sourceId) : null
    if (localDraft?.state === 'DELETED') return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
    const draftRecord = localDraft
      ? await this.localParsedRepo?.get(localDraft.localSourceId, localDraft.localContentRevision)
      : null
    const isUnregisteredDraft = localDraft?.state === 'DRAFT' && !localDraft.serverIngestionRevision
    const isPausedDraftParse = draftRecord?.phase === 'PAUSED_NETWORK' && !draftRecord.localReceipt
    if (isPausedDraftParse && !options.resumePausedDraft) {
      return { status: 'PAUSED_NETWORK', jobId: draftRecord.localCacheId ?? undefined }
    }
    if (options.resumePausedDraft && !isPausedDraftParse) return { status: 'SKIPPED', reason: 'JOB_NOT_RETRYABLE' }
    if (localDraft && this.localParsedCoordinator && (isUnregisteredDraft || isPausedDraftParse)) {
      const assetFile = await this.localAssetRepo?.getAssetFile(localDraft.localAssetId)
      const localRecord = await this.localParsedCoordinator.coordinate({
        localSourceId: localDraft.localSourceId,
        localContentRevision: localDraft.localContentRevision,
        localAssetId: localDraft.localAssetId,
        sourceAssetSha256: assetFile?.sha256 ?? '',
        originalName: assetFile?.originalName,
        mimeType: assetFile?.mimeType,
        sizeBytes: assetFile?.sizeBytes,
      }, options.resumePausedDraft)

      if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }

      if (isUnregisteredDraft && (localRecord.phase === 'WAITING_SERVER_REVISION' || localRecord.phase === 'LOCAL_PARSED_READY')) {
        return { status: 'WAITING_SERVER_REVISION', jobId: localRecord.localCacheId ?? undefined }
      }
      if (localRecord.phase === 'PAUSED_NETWORK') {
        return { status: 'PAUSED_NETWORK', jobId: localRecord.localCacheId ?? undefined }
      }
      if (localRecord.phase === 'FAILED_LOCAL') {
        return {
          status: 'FAILED_LOCAL',
          jobId: localRecord.localCacheId ?? undefined,
          reason: localRecord.safeErrorCode ?? undefined,
        }
      }
    }

    let source: SourceView
    try {
      source = await this.sourceApi.get(sourceId)
    } catch (error) {
      if (!isSourceNotFound(error)) {
        if (isNetworkFailure(error)) {
          const jobs = (await this.repository.list()).filter((job) =>
            job.sourceId === sourceId && !TERMINAL_PHASES.has(job.phase))
          if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
          for (const job of jobs) {
            await this.pauseJobForNetwork(job, 'Source lookup interrupted by a network failure')
          }
          if (jobs.length) return { status: 'PAUSED_NETWORK', jobId: jobs[0]?.jobId }
          const localRecord = localDraft
            ? await this.localParsedRepo?.get(localDraft.localSourceId, localDraft.localContentRevision)
            : null
          if (localRecord?.phase === 'WAITING_SERVER_REVISION' || localRecord?.phase === 'LOCAL_PARSED_READY') {
            return { status: 'WAITING_SERVER_REVISION', jobId: localRecord.localCacheId ?? undefined }
          }
        }
        throw error
      }
      if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
      await this.discard(sourceId, 'NOT_FOUND')
      return { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }
    }
    if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
    if (source.type !== 'FILE') return { status: 'SKIPPED', reason: 'NON_FILE_SOURCE' }
    if (!source.assetId || !source.ingestionRevision) return { status: 'SKIPPED', reason: 'FILE_SOURCE_NOT_READY_FOR_CLIENT' }

    const jobs = await this.repository.list()
    await this.supersedeStaleJobs(jobs, sourceId, source.ingestionRevision)
    let job = jobs.find((candidate) => candidate.sourceId === sourceId && candidate.ingestionRevision === source.ingestionRevision)
    if (options.retryJobId && job?.jobId !== options.retryJobId) {
      return { status: 'SKIPPED', jobId: options.retryJobId, reason: 'JOB_NOT_RETRYABLE' }
    }
    const authoritativeSourceId = source.id ?? sourceId
    const authoritativeIngestionRevision = source.ingestionRevision
    let localRecord = this.localParsedRepo
      ? ((localDraft ? await this.localParsedRepo.get(sourceId, localDraft.localContentRevision) : null)
        ?? (await this.localParsedRepo.getByServerRevision(authoritativeSourceId, authoritativeIngestionRevision)))
      : null
    if (!options.retryJobId && (job?.phase === 'PAUSED_NETWORK' || localRecord?.phase === 'PAUSED_NETWORK')) {
      return { status: 'PAUSED_NETWORK', jobId: job?.jobId ?? localRecord?.localCacheId ?? undefined }
    }

    if (!job) {
      if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
      if (source.ingestionStatus !== 'AWAITING_CLIENT') return { status: 'SKIPPED', reason: 'SOURCE_NOT_AWAITING_CLIENT' }
      job = await this.repository.create({ jobId: this.idFactory(), sourceId, ingestionRevision: source.ingestionRevision })
      await this.notifyJobChanged()
    }
    try {
      legacyCacheId(job)
    } catch (error) {
      const reason = error instanceof Error && error.message === 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
        ? 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
        : 'DOCUMENT_CACHE_CLEANUP_FAILED'
      await this.markCleanupFailure(job, error)
      const status = job.phase === 'READY'
        ? 'READY'
        : job.phase === 'FAILED_SERVER' ? 'FAILED_SERVER' : 'FAILED_LOCAL'
      return { status, jobId: job.jobId, reason }
    }
    if (job.phase === 'READY') {
      try {
        await this.cleanupDerivedCache(job)
      } catch (error) {
        const current = await this.repository.get(job.jobId)
        if (current) await this.markCleanupFailure(current, error)
      }
      return { status: 'SKIPPED', jobId: job.jobId, reason: 'ALREADY_READY' }
    }
    if (options.retryJobId && ['FAILED_LOCAL', 'FAILED_SERVER', 'PAUSED_NETWORK'].includes(job.phase)) {
      job = await this.repository.transition(job.jobId, 'QUEUED', {
        attempt: 0,
        errorCode: null,
        errorDetail: null,
      })
    }
    if (job.phase === 'FAILED_LOCAL' || job.phase === 'FAILED_SERVER') return { status: job.phase, jobId: job.jobId }

    // Receipts produced before schema v1 are not uploadable. Rebuild exactly
    // once, after deleting only the derived encrypted cache and before any
    // server intent is created.
    if (job.payloadReceipt && !isDocumentCacheReceiptV1(job.payloadReceipt)) {
      try {
        const cacheId = legacyCacheId(job)
        if (cacheId) await this.deleteCache?.(cacheId)
        job = await this.repository.transition(job.jobId, 'QUEUED', {
          attempt: 0,
          payloadCacheId: null,
          payloadReceipt: null,
          errorCode: null,
          errorDetail: null,
        })
      } catch (error) {
        const current = await this.repository.get(job.jobId)
        if (current && !TERMINAL_PHASES.has(current.phase)) {
          await this.repository.transition(job.jobId, 'FAILED_LOCAL', {
            payloadCacheId: current.payloadCacheId,
            payloadReceipt: current.payloadReceipt,
            errorCode: error instanceof Error && error.message === 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
              ? 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
              : 'DOCUMENT_LEGACY_CACHE_REBUILD_FAILED',
            errorDetail: 'Legacy document cache could not be safely rebuilt',
          })
        }
        const reason = error instanceof Error && error.message === 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
          ? 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
          : 'DOCUMENT_LEGACY_CACHE_REBUILD_FAILED'
        return { status: 'FAILED_LOCAL', jobId: job.jobId, reason }
      }
    }

    if (
      localRecord
      && localRecord.localReceipt
      && isLocalCacheReceiptV1(localRecord.localReceipt)
      && !job.payloadReceipt
    ) {
      const expectedSha = (await this.expectedAssetSha256?.(source.assetId)) ?? localRecord.sourceAssetSha256
      if (expectedSha && !sameSha(localRecord.sourceAssetSha256, expectedSha)) {
        await this.failJob(job, 'SOURCE_ASSET_SHA_MISMATCH', 'The local Asset bytes do not match the expected Asset SHA-256')
        return { status: 'FAILED_LOCAL', jobId: job.jobId, reason: 'SOURCE_ASSET_SHA_MISMATCH' }
      }

      if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }

      if (this.localDraftService) {
        await this.localDraftService.bindServerIngestionRevision(localRecord.localSourceId, authoritativeIngestionRevision)
      }

      localRecord = await this.localParsedRepo!.bindServerRevision({
        localSourceId: localRecord.localSourceId,
        localContentRevision: localRecord.localContentRevision,
        serverSourceId: authoritativeSourceId,
        serverIngestionRevision: authoritativeIngestionRevision,
        sourceAssetSha256: localRecord.sourceAssetSha256,
      })

      if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }

      localRecord = await this.localParsedRepo!.updatePhase(
        localRecord.localSourceId,
        localRecord.localContentRevision,
        'REPACKAGING',
      )

      const serverCacheId = this.idFactory()
      const bindReq = await this.localParsedRepo!.prepareBindRequest(
        localRecord.localSourceId,
        localRecord.localContentRevision,
        {
          serverCacheId,
          jobId: job.jobId,
        },
      )

      const bindFn = this.bindLocalCache ?? documentLocalCacheBind
      const serverReceipt = await bindFn(bindReq)

      if (this.discardedSources.has(sourceId)) {
        await this.cleanupDiscardedBoundCache(serverReceipt.cacheId)
        return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
      }

      job = await this.repository.transition(job.jobId, 'UPLOADING', {
        payloadCacheId: serverReceipt.cacheId,
        payloadReceipt: serverReceipt,
        errorCode: null,
        errorDetail: null,
      })

      if (this.discardedSources.has(sourceId)) {
        await this.cleanupDiscardedBoundCache(serverReceipt.cacheId)
        return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
      }

      localRecord = await this.localParsedRepo!.updatePhase(
        localRecord.localSourceId,
        localRecord.localContentRevision,
        'UPLOADING',
        {
          serverCacheId: serverReceipt.cacheId,
          serverReceipt,
        },
      )

      if (this.discardedSources.has(sourceId)) {
        await this.cleanupDiscardedBoundCache(serverReceipt.cacheId)
        return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
      }

      try {
        await this.upload.upload(job.jobId, serverReceipt, { sourceAssetSha256: serverReceipt.sourceAssetSha256 })
      } catch (uploadError) {
        if (isNetworkFailure(uploadError)) {
          await this.localParsedRepo!.updatePhase(
            localRecord.localSourceId,
            localRecord.localContentRevision,
            'PAUSED_NETWORK',
            { safeErrorCode: 'NETWORK_OFFLINE', safeErrorDetail: 'Upload interrupted by a network failure' },
          ).catch(() => undefined)
        }
        throw uploadError
      }

      const completed = await this.repository.get(job.jobId)
      if (completed?.phase === 'READY') {
        if (localRecord) {
          await this.markLocalParsedReady(localRecord, authoritativeSourceId, authoritativeIngestionRevision)
        }
        try {
          await this.cleanupDerivedCache(completed)
        } catch (error) {
          const current = await this.repository.get(job.jobId)
          if (current) await this.markCleanupFailure(current, error)
        }
        return { status: 'READY', jobId: job.jobId }
      }
      if (completed?.phase === 'PAUSED_NETWORK') return { status: 'PAUSED_NETWORK', jobId: job.jobId }
      return { status: completed?.phase === 'FAILED_SERVER' ? 'FAILED_SERVER' : 'FAILED_LOCAL', jobId: job.jobId }
    }

    let input: SourceInput | null = null
    try {
      job = await this.repository.get(job.jobId) ?? job
      if (job.phase === 'QUEUED' && job.payloadReceipt) {
        job = await this.repository.transition(job.jobId, 'UPLOADING', {
          attempt: 0,
          errorCode: null,
          errorDetail: null,
        })
      }
      if (isUploadPhase(job.phase)) {
        if (!job.payloadReceipt) {
          await this.failJob(job, 'DOCUMENT_CACHE_RECEIPT_UNAVAILABLE', 'Encrypted payload receipt is unavailable for resumable upload')
          return { status: 'FAILED_LOCAL', jobId: job.jobId, reason: 'DOCUMENT_CACHE_RECEIPT_UNAVAILABLE' }
        }
        // A paused upload is already backed by the encrypted payload receipt.
        // Do not redownload or rehash the original Asset just to resume the
        // storage PUT boundary.
        await this.upload.upload(job.jobId, job.payloadReceipt, {
          sourceAssetSha256: job.payloadReceipt.sourceAssetSha256,
        })
      } else {
        input = await this.resolveInput(source.assetId, source)
        if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
        const assetSha256 = await this.hashFile(input.file)
        if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
        if (!/^[a-f0-9]{64}$/i.test(assetSha256)) {
          await this.failJob(job, 'SOURCE_ASSET_SHA_INVALID', 'The local Asset SHA-256 is invalid')
          return { status: 'FAILED_LOCAL', jobId: job.jobId, reason: 'SOURCE_ASSET_SHA_INVALID' }
        }
        const expectedSha256 = await this.expectedAssetSha256?.(source.assetId)
        if (expectedSha256 && !sameSha(assetSha256, expectedSha256)) {
          await this.failJob(job, 'SOURCE_ASSET_SHA_MISMATCH', 'The local Asset bytes do not match the expected Asset SHA-256')
          return { status: 'FAILED_LOCAL', jobId: job.jobId, reason: 'SOURCE_ASSET_SHA_MISMATCH' }
        }
        if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
        try {
          await this.prepareInput(job, source, input.file)
          if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
          await this.runJob(job.jobId, { sourceAssetSha256: assetSha256 })
        } finally {
          await this.discardPreparedInput?.(job.jobId)
        }
        const packaged = await this.repository.get(job.jobId)
        if (!packaged) {
          if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
          throw new Error('DOCUMENT_JOB_NOT_FOUND')
        }
        if (packaged.phase === 'PAUSED_NETWORK') return { status: 'PAUSED_NETWORK', jobId: job.jobId }
        if (packaged.phase === 'FAILED_LOCAL') return { status: 'FAILED_LOCAL', jobId: job.jobId }
        if (packaged.phase !== 'PACKAGING' || !packaged.payloadReceipt) {
          throw new Error('DOCUMENT_PACKAGING_INCOMPLETE')
        }
        await this.upload.upload(job.jobId, packaged.payloadReceipt, { sourceAssetSha256: assetSha256 })
      }

      const completed = await this.repository.get(job.jobId)
      if (completed?.phase === 'READY') {
        if (localRecord) {
          await this.markLocalParsedReady(localRecord, authoritativeSourceId, authoritativeIngestionRevision)
        }
        try {
          await this.cleanupDerivedCache(completed)
        } catch (error) {
          const current = await this.repository.get(job.jobId)
          if (current) await this.markCleanupFailure(current, error)
        }
        return { status: 'READY', jobId: job.jobId }
      }
      if (completed?.phase === 'PAUSED_NETWORK') return { status: 'PAUSED_NETWORK', jobId: job.jobId }
      return { status: completed?.phase === 'FAILED_SERVER' ? 'FAILED_SERVER' : 'FAILED_LOCAL', jobId: job.jobId }
    } catch (error) {
      if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
      const current = await this.repository.get(job.jobId)
      if (current?.phase === 'PAUSED_NETWORK') return { status: 'PAUSED_NETWORK', jobId: job.jobId }
      if (current && isNetworkFailure(error) && !TERMINAL_PHASES.has(current.phase)) {
        await this.pauseJobForNetwork(current, 'Source processing interrupted by a network failure')
        return { status: 'PAUSED_NETWORK', jobId: job.jobId }
      }
      if (current && !TERMINAL_PHASES.has(current.phase)) await this.failJob(current, 'DOCUMENT_SOURCE_PROCESSING_FAILED', error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      const current = await this.repository.get(job.jobId)
      if (current?.phase !== 'PAUSED_NETWORK') await input?.cleanup?.()
    }
  }

  private async pauseJobForNetwork(job: DocumentProcessingJob, errorDetail: string): Promise<void> {
    if (job.phase === 'PAUSED_NETWORK') return
    await this.repository.transition(job.jobId, 'PAUSED_NETWORK', { errorCode: 'NETWORK_OFFLINE', errorDetail })
  }

  private async resolveInput(assetId: string, source: SourceView): Promise<SourceInput> {
    const local = await this.resolveLocalInput(assetId, source)
    return local ?? this.downloadAsset(assetId, source)
  }

  private async markLocalParsedReady(
    candidate: NonNullable<Awaited<ReturnType<LocalParsedDocumentRepository['get']>>>,
    serverSourceId: string,
    serverIngestionRevision: string,
  ): Promise<void> {
    if (!this.localParsedRepo) return
    let record = await this.localParsedRepo.get(candidate.localSourceId, candidate.localContentRevision)
    if (!record || record.phase === 'READY') return
    if (record.serverSourceId !== serverSourceId || record.serverIngestionRevision !== serverIngestionRevision) return

    if (record.phase === 'REPACKAGING' || record.phase === 'PAUSED_NETWORK') {
      record = await this.localParsedRepo.updatePhase(record.localSourceId, record.localContentRevision, 'UPLOADING')
    }
    if (record.phase === 'UPLOADING') {
      record = await this.localParsedRepo.updatePhase(record.localSourceId, record.localContentRevision, 'SERVER_VALIDATING')
    }
    if (record.phase === 'SERVER_VALIDATING') {
      record = await this.localParsedRepo.updatePhase(record.localSourceId, record.localContentRevision, 'SERVER_INDEXING')
    }
    if (record.phase === 'SERVER_INDEXING') {
      await this.localParsedRepo.updatePhase(record.localSourceId, record.localContentRevision, 'READY')
    }
  }

  private async cleanupDiscardedBoundCache(cacheId: string): Promise<void> {
    if (!this.deleteCache) return
    try {
      await this.deleteCache(cacheId)
    } catch (error) {
      console.warn('[SourceJobScheduler] discarded Source rebound cache cleanup failed', error)
    }
  }

  private async supersedeStaleJobs(jobs: DocumentProcessingJob[], sourceId: string, revision: string): Promise<void> {
    for (const job of jobs.filter((candidate) => candidate.sourceId === sourceId && candidate.ingestionRevision !== revision)) {
      try {
        const cacheId = legacyCacheId(job)
        if (cacheId) await this.deleteCache?.(cacheId)
        if (TERMINAL_PHASES.has(job.phase)) {
          await this.repository.transition(job.jobId, job.phase, {
            payloadCacheId: null,
            payloadReceipt: null,
          })
        } else {
          await this.repository.transition(job.jobId, staleFailurePhase(job.phase), {
            payloadCacheId: null,
            payloadReceipt: null,
            errorCode: 'INGESTION_REVISION_STALE',
            errorDetail: 'A newer Source ingestion revision superseded this local job',
          })
        }
      } catch (error) {
        const current = await this.repository.get(job.jobId)
        if (current) await this.markCleanupFailure(current, error)
      }
    }
  }

  private async markCleanupFailure(job: DocumentProcessingJob, error: unknown): Promise<void> {
    const code = error instanceof Error && error.message === 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
      ? 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH'
      : 'DOCUMENT_CACHE_CLEANUP_FAILED'
    const phase = DOCUMENT_JOB_TRANSITIONS_LOCAL_FAILURES.has(job.phase) ? 'FAILED_LOCAL' : job.phase
    await this.repository.transition(job.jobId, phase, {
      payloadCacheId: job.payloadCacheId,
      payloadReceipt: job.payloadReceipt,
      errorCode: code,
      errorDetail: 'Derived document cache cleanup failed; receipt preserved',
    })
  }

  private async cleanupDerivedCache(job: DocumentProcessingJob): Promise<void> {
    const cacheId = legacyCacheId(job)
    if (!cacheId || !this.deleteCache) return
    await this.deleteCache(cacheId)
    await this.repository.transition(job.jobId, job.phase, {
      payloadCacheId: null,
      payloadReceipt: null,
      errorCode: null,
      errorDetail: null,
    })
  }

  private async failJob(job: DocumentProcessingJob, code: string, detail: string): Promise<void> {
    if (TERMINAL_PHASES.has(job.phase)) return
    await this.repository.transition(job.jobId, staleFailurePhase(job.phase), {
      payloadCacheId: job.payloadCacheId,
      payloadReceipt: job.payloadReceipt,
      errorCode: code,
      errorDetail: detail,
    })
  }

  private async notifyJobChanged(): Promise<void> {
    try {
      await this.onJobChanged?.()
    } catch (error) {
      console.warn('[SourceJobScheduler] document job state notification failed', error)
    }
  }
}
