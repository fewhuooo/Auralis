import type { DocumentCacheReceipt, LocalCacheReceipt } from '@/api/tauri'

export const LOCAL_PARSED_DOCUMENT_PHASES = [
  'QUEUED',
  'EXTRACTING',
  'OCR_RUNNING',
  'LOCAL_PARSED_READY',
  'WAITING_SERVER_REVISION',
  'REPACKAGING',
  'UPLOADING',
  'SERVER_VALIDATING',
  'SERVER_INDEXING',
  'READY',
  'FAILED_LOCAL',
  'PAUSED_NETWORK',
  'SUPERSEDED',
  'CORRUPT',
] as const

export type LocalParsedDocumentPhase = typeof LOCAL_PARSED_DOCUMENT_PHASES[number]

export interface LocalParsedDocumentRecord {
  userId: string
  serverDeviceId: string
  localSourceId: string
  localContentRevision: string
  localAssetId: string
  sourceAssetSha256: string
  parserId: string
  parserVersion: string
  normalizationVersion: string
  ocrModelVersion: string | null
  localCacheId: string | null
  localReceipt: LocalCacheReceipt | null
  phase: LocalParsedDocumentPhase
  serverSourceId: string | null
  serverIngestionRevision: string | null
  serverCacheId: string | null
  serverReceipt: DocumentCacheReceipt | null
  safeErrorCode: string | null
  safeErrorDetail: string | null
  attempt: number
  checkpointPage: number
  checkpointOrdinal: number
  checkpointJson: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateLocalParsedDocumentInput {
  localSourceId: string
  localContentRevision: string
  localAssetId: string
  sourceAssetSha256: string
  parserId: string
  parserVersion: string
  normalizationVersion: string
  ocrModelVersion?: string | null
  phase?: LocalParsedDocumentPhase
  localCacheId?: string | null
  localReceipt?: LocalCacheReceipt | null
  serverSourceId?: string | null
  serverIngestionRevision?: string | null
  serverCacheId?: string | null
  serverReceipt?: DocumentCacheReceipt | null
  safeErrorCode?: string | null
  safeErrorDetail?: string | null
}

export interface LocalParsedDocumentTransitionOptions {
  checkpointPage?: number
  checkpointOrdinal?: number
  checkpointJson?: string | null
  localCacheId?: string | null
  localReceipt?: LocalCacheReceipt | null
  serverSourceId?: string | null
  serverIngestionRevision?: string | null
  serverCacheId?: string | null
  serverReceipt?: DocumentCacheReceipt | null
  safeErrorCode?: string | null
  safeErrorDetail?: string | null
  attempt?: number
}

export interface BindServerRevisionInput {
  localSourceId: string
  localContentRevision: string
  serverSourceId: string
  serverIngestionRevision: string
  sourceAssetSha256: string
  serverCacheId?: string | null
  serverReceipt?: DocumentCacheReceipt | null
}
