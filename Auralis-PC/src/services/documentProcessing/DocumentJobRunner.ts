import {
  errorCode,
  isAppClosed,
  isAutomaticallyRetryable,
  isNetworkFailure,
  MAX_AUTOMATIC_RETRIES,
} from './checkpointPolicy.ts'
import type {
  DocumentJobPhase,
  DocumentJobTransitionOptions,
  DocumentProcessingJob,
} from '@/types/documentProcessing'
import type { ParsedBlock, DocumentParserProgress } from '@/services/documentParser/types'
import { OcrDocumentEmptyError } from '../documentParser/types.ts'
import type { OcrCheckpointDiagnostic } from '@/types/documentProcessing'
import type { DocumentCacheReceipt } from '@/api/tauri'

export interface DocumentPackageMetadata {
  sourceAssetSha256: string
  parserId?: string
  parserVersion?: string
  normalizationVersion?: string
  ocrModelVersion?: string | null
}

interface JobRepository {
  get(jobId: string): Promise<DocumentProcessingJob | null>
  list(): Promise<DocumentProcessingJob[]>
  transition(jobId: string, phase: DocumentJobPhase, options?: DocumentJobTransitionOptions): Promise<DocumentProcessingJob>
}

interface PackageAdapter {
  begin(header: {
    schemaVersion: 1
    payloadFormat: 'parsed-document-v1'
    userId: string
    serverDeviceId: string
    sourceId: string
    jobId: string
    ingestionRevision: string
    sourceAssetSha256: string
    parserId: string
    parserVersion: string
    normalizationVersion: string
    ocrModelVersion: string | null
  }): Promise<string>
  append(packageId: string, block: {
    ordinal: number
    kind: 'paragraph' | 'page' | 'slide' | 'ocr-page'
    text: string
    pageNumber?: number | null
    anchorIndex?: number | null
    startLine?: number | null
  }): Promise<void>
  finish(packageId: string): Promise<DocumentCacheReceipt>
  abort?(packageId: string): Promise<void>
}

type ParserBlock = ParsedBlock
type Parser = (sink: (block: ParserBlock) => Promise<void>, onProgress: (event: DocumentParserProgress) => Promise<void>) => Promise<void>

function diagnosticFromProgress(event: DocumentParserProgress): OcrCheckpointDiagnostic {
  const base = {
    pageNumber: event.pageNumber,
    totalPages: event.totalPages,
    imageBytes: event.imageBytes,
  }
  if (event.type === 'before-recognize') return { ...base, outcome: 'running' }
  return {
    ...base,
    ...(Number.isFinite(event.rawLineCount) ? { rawLineCount: event.rawLineCount } : {}),
    ...('normalizedLineCount' in event && Number.isFinite(event.normalizedLineCount) ? { normalizedLineCount: event.normalizedLineCount } : {}),
    ...(Number.isFinite(event.timingMs.total) ? { totalMs: event.timingMs.total } : {}),
    ...('ocrProcessedPages' in event && Number.isFinite(event.ocrProcessedPages) ? { ocrProcessedPages: event.ocrProcessedPages } : {}),
    ...('ocrTextPages' in event && Number.isFinite(event.ocrTextPages) ? { ocrTextPages: event.ocrTextPages } : {}),
    ...('ocrEmptyPages' in event && Number.isFinite(event.ocrEmptyPages) ? { ocrEmptyPages: event.ocrEmptyPages } : {}),
    ...('totalRawLineCount' in event && Number.isFinite(event.totalRawLineCount) ? { totalRawLineCount: event.totalRawLineCount } : {}),
    ...('totalNormalizedLineCount' in event && Number.isFinite(event.totalNormalizedLineCount) ? { totalNormalizedLineCount: event.totalNormalizedLineCount } : {}),
    outcome: event.type === 'empty-page' ? 'empty' : event.type === 'page-result' ? 'text' : 'running',
  }
}

const cumulativeDiagnosticKeys = ['ocrProcessedPages', 'ocrTextPages', 'ocrEmptyPages', 'totalRawLineCount', 'totalNormalizedLineCount'] as const

function cumulativeDiagnosticFields(diagnostic: OcrCheckpointDiagnostic | undefined): Partial<OcrCheckpointDiagnostic> {
  if (!diagnostic) return {}
  return Object.fromEntries(cumulativeDiagnosticKeys.flatMap((key) => diagnostic[key] === undefined ? [] : [[key, diagnostic[key]]])) as Partial<OcrCheckpointDiagnostic>
}

function safeOcrDetail(error: OcrDocumentEmptyError, attempt: number): string {
  const diagnostic = error.diagnostic
  const detail = `OCR_DOCUMENT_EMPTY page=${diagnostic.pageNumber}/${diagnostic.totalPages} imageBytes=${diagnostic.imageBytes} rawLines=${diagnostic.rawLineCount} normalizedLines=${diagnostic.normalizedLineCount} totalMs=${diagnostic.timingMs.total} attempt=${attempt} processed=${diagnostic.ocrProcessedPages} empty=${diagnostic.ocrEmptyPages}`
  return detail.slice(0, 240)
}

export interface DocumentJobRunnerOptions {
  repository: JobRepository
  packager: PackageAdapter
  parserFactory: (job: DocumentProcessingJob) => Promise<Parser> | Parser
  maxAutomaticRetries?: number
}

export class DocumentJobRunner {
  private readonly repository: JobRepository
  private readonly packager: PackageAdapter
  private readonly parserFactory: DocumentJobRunnerOptions['parserFactory']
  private readonly maxAutomaticRetries: number
  private readonly active = new Map<string, Promise<void>>()
  private readonly cancelled = new Set<string>()

  constructor(options: DocumentJobRunnerOptions) {
    this.repository = options.repository
    this.packager = options.packager
    this.parserFactory = options.parserFactory
    this.maxAutomaticRetries = options.maxAutomaticRetries ?? MAX_AUTOMATIC_RETRIES
  }

  async start(jobId: string, metadata?: DocumentPackageMetadata): Promise<void> {
    const running = this.active.get(jobId)
    if (running) return running
    const task = this.process(jobId, metadata)
    this.active.set(jobId, task)
    try {
      await task
    } finally {
      if (this.active.get(jobId) === task) this.active.delete(jobId)
      this.cancelled.delete(jobId)
    }
  }

  async resumePending(): Promise<void> {
    const jobs = await this.repository.list()
    for (const job of jobs) {
      if (['QUEUED', 'EXTRACTING', 'OCR_RUNNING'].includes(job.phase)) {
        await this.start(job.jobId)
      }
    }
  }

  async list(): Promise<DocumentProcessingJob[]> {
    return this.repository.list()
  }

  async pauseForNetwork(jobId: string): Promise<void> {
    const job = await this.repository.get(jobId)
    if (!job || job.phase === 'PAUSED_NETWORK' || job.phase === 'READY') return
    await this.repository.transition(jobId, 'PAUSED_NETWORK', {
      errorCode: 'NETWORK_OFFLINE',
      errorDetail: 'Processing paused. Select Continue when the network is available.',
    })
  }

  async retry(jobId: string): Promise<void> {
    const job = await this.repository.get(jobId)
    if (!job || !['FAILED_LOCAL', 'FAILED_SERVER', 'PAUSED_NETWORK'].includes(job.phase)) return
    this.cancelled.delete(jobId)
    await this.repository.transition(jobId, 'QUEUED', {
      attempt: 0,
      errorCode: null,
      errorDetail: null,
    })
    await this.start(jobId)
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.repository.get(jobId)
    if (!job || ['READY', 'FAILED_LOCAL', 'FAILED_SERVER'].includes(job.phase)) return
    this.cancelled.add(jobId)
    await this.repository.transition(jobId, 'FAILED_LOCAL', {
      errorCode: 'DOCUMENT_CANCELLED',
      errorDetail: 'Cancelled by the user',
    })
  }

  private async process(jobId: string, metadata?: DocumentPackageMetadata): Promise<void> {
    let job = await this.repository.get(jobId)
    if (!job || job.phase === 'READY' || job.phase === 'FAILED_SERVER'
      || ['PACKAGING', 'UPLOADING', 'SERVER_VALIDATING', 'SERVER_INDEXING'].includes(job.phase)) return
    let retries = job.attempt

    while (true) {
      let packageId: string | null = null
      try {
        this.assertNotCancelled(jobId)
        if (!metadata) throw new Error('DOCUMENT_PACKAGE_METADATA_REQUIRED')
        job = await this.repository.get(jobId)
        if (!job || job.phase === 'READY') return
        if (job.phase === 'PAUSED_NETWORK') return
        if (job.phase === 'QUEUED') {
          job = await this.repository.transition(jobId, 'EXTRACTING', { attempt: retries, errorCode: null, errorDetail: null })
        }
        this.assertNotCancelled(jobId)
        packageId = await this.packager.begin({
          schemaVersion: 1,
          payloadFormat: 'parsed-document-v1',
          userId: job.userId,
          serverDeviceId: job.serverDeviceId,
          sourceId: job.sourceId,
          jobId: job.jobId,
          ingestionRevision: job.ingestionRevision,
          sourceAssetSha256: metadata.sourceAssetSha256,
          parserId: metadata.parserId ?? 'auralis-document-parser',
          parserVersion: metadata.parserVersion ?? '1.0.0',
          normalizationVersion: metadata.normalizationVersion ?? 'nfkc-lf-trim',
          ocrModelVersion: metadata.ocrModelVersion ?? null,
        })
        const parser = await this.parserFactory(job)
        this.assertNotCancelled(jobId)
        await parser(async (block) => {
          this.assertNotCancelled(jobId)
          const phase: DocumentJobPhase = block.kind === 'ocr-page' || job?.phase === 'OCR_RUNNING'
            ? 'OCR_RUNNING' : 'EXTRACTING'
          await this.packager.append(packageId!, block)
          this.assertNotCancelled(jobId)
          job = await this.repository.transition(jobId, phase, {
            attempt: retries,
            checkpoint: {
              ...job?.checkpoint,
              pageNumber: block.pageNumber ?? job?.checkpoint.pageNumber ?? 0,
              blockOrdinal: block.ordinal,
            },
            errorCode: null,
            errorDetail: null,
          })
        }, async (event) => {
          this.assertNotCancelled(jobId)
          const current = await this.repository.get(jobId)
          if (!current) throw new Error('DOCUMENT_JOB_NOT_FOUND')
          const diagnostic = {
            ...diagnosticFromProgress(event),
            ...(['before-recognize', 'after-recognize'].includes(event.type)
              ? cumulativeDiagnosticFields(current.checkpoint.diagnostic)
              : {}),
          }
          const phase: DocumentJobPhase = event.type === 'before-recognize' || current.phase === 'OCR_RUNNING'
            ? 'OCR_RUNNING' : current.phase
          job = await this.repository.transition(jobId, phase, {
            attempt: retries,
            checkpoint: { ...current.checkpoint, pageNumber: event.pageNumber, diagnostic },
            errorCode: null,
            errorDetail: null,
          })
        })
        this.assertNotCancelled(jobId)
        const receipt = await this.packager.finish(packageId)
        this.assertNotCancelled(jobId)
        await this.repository.transition(jobId, 'PACKAGING', {
          attempt: retries,
          payloadCacheId: receipt.cacheId,
          payloadReceipt: receipt,
          errorCode: null,
          errorDetail: null,
        })
        return
      } catch (error) {
        if (packageId && this.packager.abort) await this.packager.abort(packageId).catch(() => undefined)
        if (this.isCancelled(jobId, error)) return
        if (isAppClosed(error)) return
        if (isNetworkFailure(error)) {
          await this.repository.transition(jobId, 'PAUSED_NETWORK', {
            attempt: retries,
            errorCode: 'NETWORK_OFFLINE',
            errorDetail: errorCode(error),
          })
          return
        }
        if (isAutomaticallyRetryable(error) && retries + 1 < this.maxAutomaticRetries) {
          retries += 1
          await this.repository.transition(jobId, 'QUEUED', {
            attempt: retries,
            errorCode: errorCode(error),
            errorDetail: 'Automatic retry scheduled',
          })
          continue
        }
        const empty = error instanceof OcrDocumentEmptyError
        const current = await this.repository.get(jobId)
        const failureCheckpoint = empty && current ? {
          ...current.checkpoint,
          diagnostic: {
            ...diagnosticFromProgress({
              type: 'after-normalize',
              pageNumber: error.diagnostic.pageNumber,
              totalPages: error.diagnostic.totalPages,
              imageBytes: error.diagnostic.imageBytes,
              rawLineCount: error.diagnostic.rawLineCount,
              normalizedLineCount: error.diagnostic.normalizedLineCount,
              timingMs: error.diagnostic.timingMs,
              ocrProcessedPages: error.diagnostic.ocrProcessedPages,
              ocrTextPages: error.diagnostic.ocrTextPages,
              ocrEmptyPages: error.diagnostic.ocrEmptyPages,
              totalRawLineCount: error.diagnostic.totalRawLineCount,
              totalNormalizedLineCount: error.diagnostic.totalNormalizedLineCount,
            }),
            outcome: 'failed' as const,
          },
        } : current?.checkpoint
        await this.repository.transition(jobId, 'FAILED_LOCAL', {
          attempt: retries,
          checkpoint: failureCheckpoint,
          errorCode: empty ? 'OCR_DOCUMENT_EMPTY' : isAutomaticallyRetryable(error) ? 'OCR_RETRY_EXHAUSTED' : errorCode(error),
          errorDetail: empty ? safeOcrDetail(error, retries) : error instanceof Error ? error.message : String(error),
        })
        return
      }
    }
  }

  private assertNotCancelled(jobId: string): void {
    if (this.cancelled.has(jobId)) throw new Error('DOCUMENT_CANCELLED')
  }

  private isCancelled(jobId: string, error: unknown): boolean {
    return this.cancelled.has(jobId) || error instanceof Error && error.message === 'DOCUMENT_CANCELLED'
  }
}
