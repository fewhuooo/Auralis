import { isDocumentCacheReceiptV1, type DocumentCacheReceipt } from '@/api/tauri'
import { ApiProblemError } from '../../api/httpError.ts'
import type { SourceView } from '@/api/useSourceApi'
import type { DocumentProcessingJob, CreateDocumentProcessingJobInput } from '@/types/documentProcessing'
import { validatedDocumentCacheId } from './cacheSafety.ts'

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
  /** Keeps UI state in sync without letting observation failures interrupt processing. */
  onJobChanged?: () => Promise<void> | void
  idFactory?: () => string
}

export type SourceScheduleStatus = 'READY' | 'PAUSED_NETWORK' | 'FAILED_LOCAL' | 'FAILED_SERVER' | 'SKIPPED'

export interface SourceScheduleResult {
  status: SourceScheduleStatus
  jobId?: string
  reason?: string
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

function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /NETWORK|OFFLINE|TIMEOUT|Failed to fetch|fetch failed/i.test(message)
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
  private readonly resolveLocalInput: NonNullable<SourceJobSchedulerOptions['resolveLocalInput']>
  private readonly downloadAsset: SourceJobSchedulerOptions['downloadAsset']
  private readonly hashFile: SourceJobSchedulerOptions['hashFile']
  private readonly expectedAssetSha256?: SourceJobSchedulerOptions['expectedAssetSha256']
  private readonly prepareInput: SourceJobSchedulerOptions['prepareInput']
  private readonly runJob: SourceJobSchedulerOptions['runJob']
  private readonly cancelJob?: SourceJobSchedulerOptions['cancelJob']
  private readonly discardPreparedInput?: SourceJobSchedulerOptions['discardPreparedInput']
  private readonly deleteCache?: SourceJobSchedulerOptions['deleteCache']
  private readonly onJobChanged?: SourceJobSchedulerOptions['onJobChanged']
  private readonly idFactory: () => string
  private readonly active = new Map<string, Promise<SourceScheduleResult>>()
  private readonly discardedSources = new Set<string>()
  private readonly sourceNotFoundSources = new Set<string>()

  constructor(options: SourceJobSchedulerOptions) {
    this.repository = options.repository
    this.sourceApi = options.sourceApi
    this.upload = options.upload
    this.resolveLocalInput = options.resolveLocalInput ?? (() => null)
    this.downloadAsset = options.downloadAsset
    this.hashFile = options.hashFile
    this.expectedAssetSha256 = options.expectedAssetSha256
    this.prepareInput = options.prepareInput
    this.runJob = options.runJob
    this.cancelJob = options.cancelJob
    this.discardPreparedInput = options.discardPreparedInput
    this.deleteCache = options.deleteCache
    this.onJobChanged = options.onJobChanged
    this.idFactory = options.idFactory ?? randomJobId
  }

  async schedule(sourceId: string): Promise<SourceScheduleResult> {
    if (this.sourceNotFoundSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }
    if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
    const running = this.active.get(sourceId)
    if (running) return running
    const task = this.process(sourceId)
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
    await this.repository.transition(jobId, 'QUEUED', {
      attempt: 0,
      errorCode: null,
      errorDetail: null,
    })
    return this.schedule(job.sourceId)
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
  async discard(sourceId: string): Promise<void> {
    if (!sourceId.trim()) return
    this.discardedSources.add(sourceId)
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
    await this.notifyJobChanged()
  }

  private async process(sourceId: string): Promise<SourceScheduleResult> {
    if (this.sourceNotFoundSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }
    if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
    let source: SourceView
    try {
      source = await this.sourceApi.get(sourceId)
    } catch (error) {
      if (!isSourceNotFound(error)) throw error
      this.sourceNotFoundSources.add(sourceId)
      await this.discard(sourceId)
      return { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }
    }
    if (this.discardedSources.has(sourceId)) return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
    if (source.type !== 'FILE') return { status: 'SKIPPED', reason: 'NON_FILE_SOURCE' }
    if (!source.assetId || !source.ingestionRevision) return { status: 'SKIPPED', reason: 'FILE_SOURCE_NOT_READY_FOR_CLIENT' }

    const jobs = await this.repository.list()
    await this.supersedeStaleJobs(jobs, sourceId, source.ingestionRevision)
    let job = jobs.find((candidate) => candidate.sourceId === sourceId && candidate.ingestionRevision === source.ingestionRevision)

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

    // A paused extraction job needs a fresh input and a queued transition. A
    // paused upload keeps its encrypted receipt, so resume directly at the
    // upload boundary instead of re-running the parser.
    if (job.phase === 'PAUSED_NETWORK') {
      job = await this.repository.transition(job.jobId, job.payloadReceipt ? 'UPLOADING' : 'QUEUED', {
        errorCode: null,
        errorDetail: null,
      })
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
        await this.prepareInput(job, source, input.file)
        if (this.discardedSources.has(sourceId)) {
          await this.discardPreparedInput?.(job.jobId)
          return { status: 'SKIPPED', reason: 'SOURCE_DELETED' }
        }
        await this.runJob(job.jobId, { sourceAssetSha256: assetSha256 })
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
      if (current && isNetworkFailure(error) && current.phase === 'QUEUED') {
        await this.repository.transition(job.jobId, 'PAUSED_NETWORK', {
          errorCode: 'NETWORK_OFFLINE',
          errorDetail: 'Source download paused until network connectivity returns',
        })
        return { status: 'PAUSED_NETWORK', jobId: job.jobId }
      }
      if (current && !TERMINAL_PHASES.has(current.phase)) await this.failJob(current, 'DOCUMENT_SOURCE_PROCESSING_FAILED', error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      const current = await this.repository.get(job.jobId)
      if (current?.phase !== 'PAUSED_NETWORK') await input?.cleanup?.()
    }
  }

  private async resolveInput(assetId: string, source: SourceView): Promise<SourceInput> {
    const local = await this.resolveLocalInput(assetId, source)
    return local ?? this.downloadAsset(assetId, source)
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
