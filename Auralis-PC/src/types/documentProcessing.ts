import type { DocumentCacheReceipt } from '@/api/tauri'

export const DOCUMENT_JOB_PHASES = [
  'QUEUED',
  'DOWNLOADING_SOURCE',
  'EXTRACTING',
  'OCR_RUNNING',
  'PACKAGING',
  'UPLOADING',
  'SERVER_VALIDATING',
  'SERVER_INDEXING',
  'READY',
  'FAILED_LOCAL',
  'FAILED_SERVER',
  'PAUSED_NETWORK',
] as const

export type DocumentJobPhase = typeof DOCUMENT_JOB_PHASES[number]

export interface OcrCheckpointDiagnostic {
  pageNumber: number
  totalPages: number
  imageBytes: number
  rawLineCount?: number
  normalizedLineCount?: number
  totalMs?: number
  outcome: 'running' | 'text' | 'empty' | 'failed'
}

export interface DocumentJobCheckpoint {
  pageNumber: number
  blockOrdinal: number
  parserState?: string
  diagnostic?: OcrCheckpointDiagnostic
}

export interface DocumentProcessingJob {
  jobId: string
  userId: string
  serverDeviceId: string
  sourceId: string
  ingestionRevision: string
  phase: DocumentJobPhase
  attempt: number
  checkpoint: DocumentJobCheckpoint
  payloadCacheId: string | null
  payloadReceipt: DocumentCacheReceipt | null
  errorCode: string | null
  errorDetail: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateDocumentProcessingJobInput {
  jobId: string
  sourceId: string
  ingestionRevision: string
}

export interface DocumentJobTransitionOptions {
  checkpoint?: DocumentJobCheckpoint
  payloadCacheId?: string | null
  payloadReceipt?: DocumentCacheReceipt | null
  errorCode?: string | null
  errorDetail?: string | null
  attempt?: number
}
