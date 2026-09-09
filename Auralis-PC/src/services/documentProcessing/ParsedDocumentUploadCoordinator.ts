import type {
  DocumentCacheReceipt,
  DocumentUploadPutRequest,
  DocumentUploadPutReceipt,
} from '@/api/tauri'
import { documentUploadPut, isDocumentCacheReceiptV1 } from '@/api/tauri'
import type {
  ParsedDocumentCompleteResponse,
  ParsedDocumentUploadIntentRequest,
  ParsedDocumentUploadIntentResponse,
} from '@/api/useSourceApi'
import { errorCode, isNetworkFailure, parsedDocumentUploadFailureDetail } from './checkpointPolicy.ts'
import { validatedDocumentCacheId } from './cacheSafety.ts'
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
  onCompleteAccepted?: () => Promise<void> | void
}

const stableFailureDetails: Record<string, string> = {
  DOCUMENT_UPLOAD_INTENT_INVALID: 'Parsed document upload intent invalid',
  DOCUMENT_UPLOAD_INTENT_EXPIRED: 'Parsed document upload intent expired',
  INGESTION_REVISION_STALE: 'Parsed document ingestion revision stale',
  PARSED_DOCUMENT_CONFLICT: 'Parsed document conflicts with an existing payload',
  DOCUMENT_UPLOAD_PAYLOAD_MISMATCH: 'DOCUMENT_UPLOAD_PAYLOAD_MISMATCH',
}

type UploadTraceEvent = 'PUT_STARTED' | 'PUT_SUCCEEDED' | 'COMPLETE_ACCEPTED' | 'FAILED'
type UploadTraceStage = 'put' | 'complete'

function traceUpload(input: {
  event: UploadTraceEvent
  jobId: string
  stage?: UploadTraceStage
  errorCode?: string
  durationMs?: number
}): void {
  const entry = {
    event: input.event,
    jobId: input.jobId,
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(Number.isFinite(input.durationMs) ? { durationMs: Math.max(0, Math.round(input.durationMs!)) } : {}),
  }
  const method = input.event === 'FAILED' ? console.warn : console.info
  method('[Document Upload Trace]', entry)
}

function traceFailureCode(error: unknown, stage: 'upload' | 'complete'): string {
  const code = errorCode(error)
  const stable = ['DOCUMENT_UPLOAD_INTENT_EXPIRED', 'INGESTION_REVISION_STALE', 'PARSED_DOCUMENT_CONFLICT',
    'DOCUMENT_UPLOAD_PAYLOAD_MISMATCH', 'NETWORK_OFFLINE', 'NETWORK_ERROR', 'FETCH_FAILED', 'DOCUMENT_UPLOAD_RETRYABLE']
  if (stable.includes(code)) return code
  return stableNonNetworkFailure(error, stage).code
}

function stableNonNetworkFailure(error: unknown, stage: 'upload' | 'complete'): { code: string; detail: string } {
  const code = errorCode(error)
  const detail = stableFailureDetails[code]
  if (detail) return { code, detail }
  return stage === 'upload'
    ? { code: 'PARSED_DOCUMENT_UPLOAD_FAILED', detail: 'Parsed document upload failed' }
    : { code: 'PARSED_DOCUMENT_COMPLETE_FAILED', detail: 'Parsed document completion failed' }
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
  if (!receipt.cacheId.trim() || receipt.payloadBytes <= 0 || !isHexSha256(receipt.payloadSha256)
    || !isDocumentCacheReceiptV1(receipt)) {
    throw new Error('DOCUMENT_UPLOAD_RECEIPT_INVALID')
  }
}

function sameReceipt(left: DocumentCacheReceipt | null | undefined, right: DocumentCacheReceipt): boolean {
  return Boolean(left
    && left.cacheId === right.cacheId
    && left.payloadBytes === right.payloadBytes
    && left.payloadSha256.toLowerCase() === right.payloadSha256.toLowerCase())
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
  private readonly onCompleteAccepted?: () => Promise<void> | void
  private readonly active = new Map<string, Promise<ParsedDocumentServerReceipt>>()
  private readonly completed = new Map<string, ParsedDocumentServerReceipt>()

  constructor(options: ParsedDocumentUploadCoordinatorOptions) {
    this.repository = options.repository
    this.api = options.api ?? { createParsedDocumentUploadIntent: defaultCreateIntent, completeParsedDocument: defaultComplete }
    this.put = typeof options.put === 'function' ? { put: options.put } : (options.put ?? { put: documentUploadPut })
    this.onCompleteAccepted = options.onCompleteAccepted
  }

  async upload(
    jobId: string,
    receipt: DocumentCacheReceipt,
    _metadata?: unknown,
  ): Promise<ParsedDocumentServerReceipt> {
    const completed = this.completed.get(jobId)
    if (completed) return completed
    const running = this.active.get(jobId)
    if (running) return running
    const task = this.process(jobId, receipt)
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
  ): Promise<ParsedDocumentServerReceipt> {
    validateReceipt(receipt)
    const job = await this.repository.get(jobId)
    if (!job) throw new Error('DOCUMENT_JOB_NOT_FOUND')
    if (job.phase === 'READY') throw new Error('DOCUMENT_UPLOAD_RECEIPT_UNAVAILABLE')
    const uploadReceipt = receipt
    validatedDocumentCacheId(job.payloadCacheId, job.payloadReceipt?.cacheId, uploadReceipt.cacheId)

    const intentBody: ParsedDocumentUploadIntentRequest = {
      ingestionRevision: job.ingestionRevision,
      schemaVersion: 1,
      parserId: uploadReceipt.parserId!,
      parserVersion: uploadReceipt.parserVersion!,
      normalizationVersion: uploadReceipt.normalizationVersion!,
      ocrModelVersion: uploadReceipt.ocrModelVersion ?? undefined,
      sourceAssetSha256: uploadReceipt.sourceAssetSha256,
      payloadSha256: uploadReceipt.payloadSha256,
      sizeBytes: uploadReceipt.payloadBytes,
    }

    // A scheduler may resume an interrupted upload in UPLOADING already. Only
    // persist when the phase or durable receipt actually needs updating.
    if (job.phase !== 'UPLOADING' || !sameReceipt(job.payloadReceipt, uploadReceipt)) {
      await this.repository.transition(jobId, 'UPLOADING', {
        payloadCacheId: uploadReceipt.cacheId,
        payloadReceipt: uploadReceipt,
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
    try {
      await this.putCache(job, uploadReceipt, intent)
    } catch (error) {
      if (errorCode(error) === 'DOCUMENT_UPLOAD_INTENT_EXPIRED') {
        try {
          intent = validateIntent(await this.api.createParsedDocumentUploadIntent(job.sourceId, intentBody), job.ingestionRevision)
          await this.putCache(job, uploadReceipt, intent)
        } catch (retryError) {
          await this.pauseOrFail(jobId, retryError, 'upload')
          throw retryError
        }
      } else {
        await this.pauseOrFail(jobId, error, 'upload')
        throw error
      }
    }
    await this.repository.transition(jobId, 'SERVER_VALIDATING', { payloadCacheId: receipt.cacheId })
    let completed: ParsedDocumentCompleteResponse
    try {
      completed = await this.api.completeParsedDocument(job.sourceId, intent.parsedDocumentId)
    } catch (error) {
      traceUpload({ event: 'FAILED', jobId, stage: 'complete', errorCode: traceFailureCode(error, 'complete') })
      await this.pauseOrFail(jobId, error, 'complete')
      throw error
    }
    const serverReceipt: ParsedDocumentServerReceipt = {
      parsedDocumentId: completed.parsedDocumentId ?? intent.parsedDocumentId,
      status: completed.status ?? '',
      generation: completed.generation,
      ingestionJobId: completed.ingestionJobId,
    }
    if (serverReceipt.status !== 'ACCEPTED') {
      const error = new Error('PARSED_DOCUMENT_SERVER_REJECTED')
      traceUpload({ event: 'FAILED', jobId, stage: 'complete', errorCode: error.message })
      await this.repository.transition(jobId, 'FAILED_SERVER', {
        errorCode: error.message,
        errorDetail: 'Parsed document server rejected',
      })
      throw error
    }
    traceUpload({ event: 'COMPLETE_ACCEPTED', jobId, stage: 'complete' })
    if (this.onCompleteAccepted) {
      try {
        await this.onCompleteAccepted()
      } catch {
        console.warn('[DocumentProcessing] accepted complete read sync request deferred')
      }
    }
    await this.repository.transition(jobId, 'SERVER_INDEXING', { payloadCacheId: uploadReceipt.cacheId, errorCode: null, errorDetail: null })
    await this.repository.transition(jobId, 'READY', { payloadCacheId: uploadReceipt.cacheId, errorCode: null, errorDetail: null })
    return serverReceipt
  }


  private async putCache(
    job: DocumentProcessingJob,
    receipt: DocumentCacheReceipt,
    intent: { parsedDocumentId: string; uploadUrl: string; headers: Record<string, string> },
  ): Promise<DocumentUploadPutReceipt> {
    const startedAt = Date.now()
    traceUpload({ event: 'PUT_STARTED', jobId: job.jobId, stage: 'put' })
    try {
      const result = await this.put.put({
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
      if (result.bytesSent !== receipt.payloadBytes || result.payloadSha256.toLowerCase() !== receipt.payloadSha256.toLowerCase()) {
        throw new Error('DOCUMENT_UPLOAD_PAYLOAD_MISMATCH')
      }
      traceUpload({ event: 'PUT_SUCCEEDED', jobId: job.jobId, stage: 'put', durationMs: Date.now() - startedAt })
      return result
    } catch (error) {
      traceUpload({ event: 'FAILED', jobId: job.jobId, stage: 'put', errorCode: traceFailureCode(error, 'upload'), durationMs: Date.now() - startedAt })
      throw error
    }
  }

  private async pauseOrFail(jobId: string, error: unknown, stage: 'upload' | 'complete'): Promise<void> {
    const code = errorCode(error)
    if (isNetworkFailure(error) || code === 'DOCUMENT_UPLOAD_RETRYABLE') {
      await this.repository.transition(jobId, 'PAUSED_NETWORK', {
        errorCode: 'NETWORK_OFFLINE',
        errorDetail: parsedDocumentUploadFailureDetail(error, stage),
      })
      return
    }
    const stableFailure = stableNonNetworkFailure(error, stage)
    await this.repository.transition(jobId, stage === 'complete' ? 'FAILED_SERVER' : 'FAILED_LOCAL', {
      errorCode: stableFailure.code,
      errorDetail: stableFailure.detail,
    })
  }
}
