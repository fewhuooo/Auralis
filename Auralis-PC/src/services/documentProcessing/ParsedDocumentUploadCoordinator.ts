import type {
  DocumentCacheReceipt,
  DocumentUploadPutRequest,
  DocumentUploadPutReceipt,
} from '@/api/tauri'
import { documentUploadPut } from '@/api/tauri'
import type {
  ParsedDocumentCompleteResponse,
  ParsedDocumentUploadIntentRequest,
  ParsedDocumentUploadIntentResponse,
} from '@/api/useSourceApi'
import { errorCode, isNetworkFailure } from './checkpointPolicy.ts'
import type {
  DocumentJobPhase,
  DocumentJobTransitionOptions,
  DocumentProcessingJob,
} from '@/types/documentProcessing'

interface JobRepository {
  get(jobId: string): Promise<DocumentProcessingJob | null>
  transition(jobId: string, phase: DocumentJobPhase, options?: DocumentJobTransitionOptions): Promise<DocumentProcessingJob>
}

interface UploadApi {
  createParsedDocumentUploadIntent(sourceId: string, body: ParsedDocumentUploadIntentRequest): Promise<ParsedDocumentUploadIntentResponse>
  completeParsedDocument(sourceId: string, parsedDocumentId: string): Promise<ParsedDocumentCompleteResponse>
}

interface UploadPutClient {
  put(request: DocumentUploadPutRequest): Promise<DocumentUploadPutReceipt>
}

export interface ParsedDocumentUploadMetadata {
  parserId?: string
  parserVersion?: string
  normalizationVersion?: string
  ocrModelVersion?: string
  sourceAssetSha256?: string
}

export interface ParsedDocumentServerReceipt {
  parsedDocumentId: string
  status: string
  generation?: string
  ingestionJobId?: string
}

export interface ParsedDocumentUploadCoordinatorOptions {
  repository: JobRepository
  api?: UploadApi
  put?: UploadPutClient | ((request: DocumentUploadPutRequest) => Promise<DocumentUploadPutReceipt>)
}

const DEFAULT_METADATA: Required<Pick<ParsedDocumentUploadMetadata, 'parserId' | 'parserVersion' | 'normalizationVersion'>> = {
  parserId: 'auralis-local-parser',
  parserVersion: 'auralis-document-parser/1.0.0',
  normalizationVersion: 'auralis-normalization/1.0.0',
}

async function defaultCreateIntent(sourceId: string, body: ParsedDocumentUploadIntentRequest): Promise<ParsedDocumentUploadIntentResponse> {
  const { createParsedDocumentUploadIntent } = await import('@/api/useSourceApi')
  return createParsedDocumentUploadIntent(sourceId, body)
}

async function defaultComplete(sourceId: string, parsedDocumentId: string): Promise<ParsedDocumentCompleteResponse> {
  const { completeParsedDocument } = await import('@/api/useSourceApi')
  return completeParsedDocument(sourceId, parsedDocumentId)
}

function isHexSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value)
}

function validateReceipt(receipt: DocumentCacheReceipt): void {
  if (!receipt.cacheId.trim() || receipt.payloadBytes <= 0 || !isHexSha256(receipt.payloadSha256)) {
    throw new Error('DOCUMENT_UPLOAD_RECEIPT_INVALID')
  }
}

function validateIntent(intent: ParsedDocumentUploadIntentResponse, expectedRevision: string): { parsedDocumentId: string; uploadUrl: string; headers: Record<string, string> } {
  if (!intent.parsedDocumentId?.trim() || !intent.uploadUrl?.trim()) throw new Error('DOCUMENT_UPLOAD_INTENT_INVALID')
  if (intent.ingestionRevision && intent.ingestionRevision !== expectedRevision) throw new Error('INGESTION_REVISION_STALE')
  return {
    parsedDocumentId: intent.parsedDocumentId,
    uploadUrl: intent.uploadUrl,
    headers: intent.headers ?? {},
  }
}

export class ParsedDocumentUploadCoordinator {
  private readonly repository: JobRepository
  private readonly api: UploadApi
  private readonly put: UploadPutClient
  private readonly active = new Map<string, Promise<ParsedDocumentServerReceipt>>()
  private readonly completed = new Map<string, ParsedDocumentServerReceipt>()

  constructor(options: ParsedDocumentUploadCoordinatorOptions) {
    this.repository = options.repository
    this.api = options.api ?? { createParsedDocumentUploadIntent: defaultCreateIntent, completeParsedDocument: defaultComplete }
    this.put = typeof options.put === 'function' ? { put: options.put } : (options.put ?? { put: documentUploadPut })
  }

  async upload(
    jobId: string,
    receipt: DocumentCacheReceipt,
    metadata: ParsedDocumentUploadMetadata = {},
  ): Promise<ParsedDocumentServerReceipt> {
    const completed = this.completed.get(jobId)
    if (completed) return completed
    const running = this.active.get(jobId)
    if (running) return running
    const task = this.process(jobId, receipt, metadata)
    this.active.set(jobId, task)
    try {
      const result = await task
      this.completed.set(jobId, result)
      return result
    } finally {
      if (this.active.get(jobId) === task) this.active.delete(jobId)
    }
  }

  private async process(
    jobId: string,
    receipt: DocumentCacheReceipt,
    metadata: ParsedDocumentUploadMetadata,
  ): Promise<ParsedDocumentServerReceipt> {
    validateReceipt(receipt)
    const job = await this.repository.get(jobId)
    if (!job) throw new Error('DOCUMENT_JOB_NOT_FOUND')
    if (job.phase === 'READY') throw new Error('DOCUMENT_UPLOAD_RECEIPT_UNAVAILABLE')

    const intentBody: ParsedDocumentUploadIntentRequest = {
      ingestionRevision: job.ingestionRevision,
      schemaVersion: 1,
      parserId: metadata.parserId ?? DEFAULT_METADATA.parserId,
      parserVersion: metadata.parserVersion ?? DEFAULT_METADATA.parserVersion,
      normalizationVersion: metadata.normalizationVersion ?? DEFAULT_METADATA.normalizationVersion,
      ocrModelVersion: metadata.ocrModelVersion,
      sourceAssetSha256: metadata.sourceAssetSha256,
      payloadSha256: receipt.payloadSha256,
      sizeBytes: receipt.payloadBytes,
    }

    // A scheduler may resume an interrupted upload in UPLOADING already. The
    // repository intentionally rejects same-phase transitions, so only move
    // into UPLOADING when the durable job is in another upload phase.
    if (job.phase !== 'UPLOADING') {
      await this.repository.transition(jobId, 'UPLOADING', {
        payloadCacheId: receipt.cacheId,
        errorCode: null,
        errorDetail: null,
      })
    }

    let intent: { parsedDocumentId: string; uploadUrl: string; headers: Record<string, string> }
    try {
      intent = validateIntent(await this.api.createParsedDocumentUploadIntent(job.sourceId, intentBody), job.ingestionRevision)
    } catch (error) {
      await this.pauseOrFail(jobId, error, 'upload')
      throw error
    }
    let putReceipt: DocumentUploadPutReceipt
    try {
      putReceipt = await this.putCache(job, receipt, intent)
    } catch (error) {
      if (errorCode(error) === 'DOCUMENT_UPLOAD_INTENT_EXPIRED') {
        try {
          intent = validateIntent(await this.api.createParsedDocumentUploadIntent(job.sourceId, intentBody), job.ingestionRevision)
          putReceipt = await this.putCache(job, receipt, intent)
        } catch (retryError) {
          await this.pauseOrFail(jobId, retryError, 'upload')
          throw retryError
        }
      } else {
        await this.pauseOrFail(jobId, error, 'upload')
        throw error
      }
    }
    if (putReceipt.bytesSent !== receipt.payloadBytes || putReceipt.payloadSha256.toLowerCase() !== receipt.payloadSha256.toLowerCase()) {
      const error = new Error('DOCUMENT_UPLOAD_PAYLOAD_MISMATCH')
      await this.repository.transition(jobId, 'FAILED_LOCAL', { errorCode: error.message, errorDetail: error.message })
      throw error
    }

    await this.repository.transition(jobId, 'SERVER_VALIDATING', { payloadCacheId: receipt.cacheId })
    let completed: ParsedDocumentCompleteResponse
    try {
      completed = await this.api.completeParsedDocument(job.sourceId, intent.parsedDocumentId)
    } catch (error) {
      await this.pauseOrFail(jobId, error, 'complete')
      throw error
    }
    const serverReceipt: ParsedDocumentServerReceipt = {
      parsedDocumentId: completed.parsedDocumentId ?? intent.parsedDocumentId,
      status: completed.status ?? 'ACCEPTED',
      generation: completed.generation,
      ingestionJobId: completed.ingestionJobId,
    }
    if (serverReceipt.status !== 'ACCEPTED') {
      const error = new Error(`PARSED_DOCUMENT_${serverReceipt.status}`)
      await this.repository.transition(jobId, 'FAILED_SERVER', { errorCode: errorCode(error), errorDetail: error.message })
      throw error
    }
    await this.repository.transition(jobId, 'READY', { payloadCacheId: receipt.cacheId, errorCode: null, errorDetail: null })
    return serverReceipt
  }

  private async putCache(
    job: DocumentProcessingJob,
    receipt: DocumentCacheReceipt,
    intent: { parsedDocumentId: string; uploadUrl: string; headers: Record<string, string> },
  ): Promise<DocumentUploadPutReceipt> {
    return this.put.put({
      uploadUrl: intent.uploadUrl,
      cacheId: receipt.cacheId,
      userId: job.userId,
      serverDeviceId: job.serverDeviceId,
      sourceId: job.sourceId,
      jobId: job.jobId,
      ingestionRevision: job.ingestionRevision,
      headers: intent.headers,
      expectedSize: receipt.payloadBytes,
      expectedPayloadSha256: receipt.payloadSha256,
    })
  }

  private async pauseOrFail(jobId: string, error: unknown, stage: 'upload' | 'complete'): Promise<void> {
    const code = errorCode(error)
    if (isNetworkFailure(error) || code === 'DOCUMENT_UPLOAD_RETRYABLE') {
      await this.repository.transition(jobId, 'PAUSED_NETWORK', {
        errorCode: code === 'DOCUMENT_UPLOAD_RETRYABLE' ? 'NETWORK_OFFLINE' : code,
        errorDetail: `Parsed document ${stage} paused until network connectivity returns`,
      })
      return
    }
    await this.repository.transition(jobId, stage === 'complete' ? 'FAILED_SERVER' : 'FAILED_LOCAL', {
      errorCode: code,
      errorDetail: error instanceof Error ? error.message : String(error),
    })
  }
}
