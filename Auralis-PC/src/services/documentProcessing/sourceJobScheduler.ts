import type { DocumentCacheReceipt } from '@/api/tauri'
import type { SourceView } from '@/api/useSourceApi'
import type { DocumentProcessingJob, CreateDocumentProcessingJobInput } from '@/types/documentProcessing'

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
  transition(jobId: string, phase: DocumentProcessingJob['phase'], options?: {
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
  runJob: (jobId: string) => Promise<void>
  deleteCache?: (cacheId: string) => Promise<void>
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

function staleFailurePhase(phase: DocumentProcessingJob['phase']): 'FAILED_LOCAL' | 'FAILED_SERVER' {
  return isUploadPhase(phase) ? 'FAILED_SERVER' : 'FAILED_LOCAL'
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
  private readonly deleteCache?: SourceJobSchedulerOptions['deleteCache']
  private readonly idFactory: () => string
  private readonly active = new Map<string, Promise<SourceScheduleResult>>()

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
    this.deleteCache = options.deleteCache
    this.idFactory = options.idFactory ?? randomJobId
  }

  async schedule(sourceId: string): Promise<SourceScheduleResult> {
    const running = this.active.get(sourceId)
    if (running) return running
    const task = this.process(sourceId)
    this.active.set(sourceId, task)
    try {
      return await task
    } finally {
      if (this.active.get(sourceId) === task) this.active.delete(sourceId)
    }
  }

  async resume(sourceIds: string[]): Promise<SourceScheduleResult[]> {
    const results: SourceScheduleResult[] = []
    for (const sourceId of sourceIds) results.push(await this.schedule(sourceId))
    return results
  }

  private async process(sourceId: string): Promise<SourceScheduleResult> {
    const source = await this.sourceApi.get(sourceId)
    if (source.type !== 'FILE') return { status: 'SKIPPED', reason: 'NON_FILE_SOURCE' }
    if (!source.assetId || !source.ingestionRevision) return { status: 'SKIPPED', reason: 'FILE_SOURCE_NOT_READY_FOR_CLIENT' }

    const jobs = await this.repository.list()
    await this.supersedeStaleJobs(jobs, sourceId, source.ingestionRevision)
    let job = jobs.find((candidate) => candidate.sourceId === sourceId && candidate.ingestionRevision === source.ingestionRevision)

    if (!job) {
      if (source.ingestionStatus !== 'AWAITING_CLIENT') return { status: 'SKIPPED', reason: 'SOURCE_NOT_AWAITING_CLIENT' }
      job = await this.repository.create({ jobId: this.idFactory(), sourceId, ingestionRevision: source.ingestionRevision })
    }
    if (job.phase === 'READY') return { status: 'SKIPPED', jobId: job.jobId, reason: 'ALREADY_READY' }
    if (job.phase === 'FAILED_LOCAL' || job.phase === 'FAILED_SERVER') return { status: job.phase, jobId: job.jobId }

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
      input = await this.resolveInput(source.assetId, source)
      const assetSha256 = await this.hashFile(input.file)
      if (!/^[a-f0-9]{64}$/i.test(assetSha256)) {
        await this.failJob(job, 'SOURCE_ASSET_SHA_INVALID', 'The local Asset SHA-256 is invalid')
        return { status: 'FAILED_LOCAL', jobId: job.jobId, reason: 'SOURCE_ASSET_SHA_INVALID' }
      }
      const expectedSha256 = await this.expectedAssetSha256?.(source.assetId)
      if (expectedSha256 && !sameSha(assetSha256, expectedSha256)) {
        await this.failJob(job, 'SOURCE_ASSET_SHA_MISMATCH', 'The local Asset bytes do not match the expected Asset SHA-256')
        return { status: 'FAILED_LOCAL', jobId: job.jobId, reason: 'SOURCE_ASSET_SHA_MISMATCH' }
      }

      job = await this.repository.get(job.jobId) ?? job
      if (isUploadPhase(job.phase)) {
        if (!job.payloadReceipt) {
          await this.failJob(job, 'DOCUMENT_CACHE_RECEIPT_UNAVAILABLE', 'Encrypted payload receipt is unavailable for resumable upload')
          return { status: 'FAILED_LOCAL', jobId: job.jobId, reason: 'DOCUMENT_CACHE_RECEIPT_UNAVAILABLE' }
        }
        await this.upload.upload(job.jobId, job.payloadReceipt, { sourceAssetSha256: assetSha256 })
      } else {
        await this.prepareInput(job, source, input.file)
        await this.runJob(job.jobId)
        const packaged = await this.repository.get(job.jobId)
        if (!packaged) throw new Error('DOCUMENT_JOB_NOT_FOUND')
        if (packaged.phase === 'PAUSED_NETWORK') return { status: 'PAUSED_NETWORK', jobId: job.jobId }
        if (packaged.phase === 'FAILED_LOCAL') return { status: 'FAILED_LOCAL', jobId: job.jobId }
        if (packaged.phase !== 'PACKAGING' || !packaged.payloadReceipt) {
          throw new Error('DOCUMENT_PACKAGING_INCOMPLETE')
        }
        await this.upload.upload(job.jobId, packaged.payloadReceipt, { sourceAssetSha256: assetSha256 })
      }

      const completed = await this.repository.get(job.jobId)
      if (completed?.phase === 'READY') {
        if (completed.payloadCacheId) await this.deleteCache?.(completed.payloadCacheId)
        return { status: 'READY', jobId: job.jobId }
      }
      if (completed?.phase === 'PAUSED_NETWORK') return { status: 'PAUSED_NETWORK', jobId: job.jobId }
      return { status: completed?.phase === 'FAILED_SERVER' ? 'FAILED_SERVER' : 'FAILED_LOCAL', jobId: job.jobId }
    } catch (error) {
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
      if (job.payloadCacheId) await this.deleteCache?.(job.payloadCacheId)
      if (TERMINAL_PHASES.has(job.phase)) continue
      await this.repository.transition(job.jobId, staleFailurePhase(job.phase), {
        payloadCacheId: null,
        payloadReceipt: null,
        errorCode: 'INGESTION_REVISION_STALE',
        errorDetail: 'A newer Source ingestion revision superseded this local job',
      })
    }
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
}
