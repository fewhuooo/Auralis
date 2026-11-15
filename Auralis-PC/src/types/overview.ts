export type OverviewMode = 'ALL' | 'OUTLINE' | 'SUMMARY'
export type OverviewCacheStatus = 'READY' | 'FAILED'
export type FileOverviewTrigger = 'SOURCE_READY' | 'RESUME_BOOTSTRAP' | 'RESUME_ONLINE' | 'RESUME_SYNC' | 'JOB_CHANGED' | 'MANUAL_RETRY'
export type OverviewSkipCode =
  | 'AUTO_OVERVIEW_DISABLED'
  | 'SOURCE_NOT_ELIGIBLE'
  | 'SOURCE_NOT_READY'
  | 'SOURCE_UNAVAILABLE'
  | 'NO_USABLE_INPUT'
  | 'CACHE_COMPLETE'
  | 'SKIPPED_FAILED_REQUIRES_MANUAL_RETRY'
  | 'PARTIAL_REQUIRES_MANUAL_RETRY'
  | 'ABORTED'
export type OverviewFailureCode =
  | 'MODEL_PROVIDER_ERROR'
  | 'MODEL_TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'OVERVIEW_STATUS_UNKNOWN'
  | 'OVERVIEW_GENERATION_FAILED'
  | 'SUBJECT_OVERVIEW_FILES_UNAVAILABLE'
  | (string & {})
export type OverviewRegenerationResult =
  | { status: 'STARTED'; requestId?: string }
  | { status: 'LOCAL_EDIT_CONFLICT'; requestId: string; clientWriteId: string }
  | { status: 'SKIPPED'; code: OverviewSkipCode }
  | { status: 'FAILED'; code: OverviewFailureCode; detail?: string; httpStatus?: number; retryAfterSeconds?: number; resetAt?: string }

import type { components } from '@/api/generated/schema'
import type { SyncRequestScopeTicket } from '@/api/request'

export type OverviewInputDescriptor = components['schemas']['OverviewInputDescriptor']

/** v2 OverviewResponse: Dual Markdown fields */
export interface OverviewResponse {
  schemaVersion: 2
  title: string
  outlineMarkdown: string | null
  summaryMarkdown: string | null
}

/** Raw response returned by the generation endpoints before server canonicalization. */
export type GeneratedOverviewResponse = OverviewResponse

export interface SourceOverviewRequest { sourceId: string; mode: OverviewMode; instruction?: string; retryOfRequestId?: string }
export interface SubjectOverviewSourceInput {
  sourceId: string
  title?: string
  outlineMarkdown?: string | null
  summaryMarkdown?: string | null
}
export interface SubjectOverviewRequest {
  subjectId: string
  mode: OverviewMode
  instruction?: string
  retryOfRequestId?: string
  sources: SubjectOverviewSourceInput[]
}

export interface OverviewRequestContext {
  requestId: string
  signal?: AbortSignal
  scope?: SyncRequestScopeTicket
  consumerId?: string
  onRequestDispatched?: () => void
}

export interface OverviewOperationHandle<T = OverviewRegenerationResult> extends Promise<T> {
  readonly consumerId: string
  stop(): void
}

export interface OverviewApi {
  generateSourceOverview(request: SourceOverviewRequest, context?: OverviewRequestContext): Promise<GeneratedOverviewResponse>
  generateSubjectOverview(request: SubjectOverviewRequest, context?: OverviewRequestContext): Promise<GeneratedOverviewResponse>
}

export interface OverviewCacheRecord {
  scopeType: 'FILE' | 'SUBJECT'
  scopeId: string
  revisionKey: string
  schemaVersion: 2
  title: string
  outlineMarkdown: string | null
  summaryMarkdown: string | null
  outlineGeneratedAt: string | null
  summaryGeneratedAt: string | null
  inputFingerprint: string | null
  status: OverviewCacheStatus
  errorCode: string | null
  errorDetail: string | null
  updatedAt: string
  syncStatus?: 'LOCAL' | 'PENDING' | 'SYNCED' | 'CONFLICT' | 'ERROR' | 'STALE'
  syncError?: string | null
  generationConflicts?: Array<{
    clientWriteId: string
    mode: OverviewMode
    result: OverviewResponse
  }>
}

export interface FileOverviewRecord extends OverviewCacheRecord { scopeType: 'FILE'; sourceId: string; ingestionRevision: string }
export interface SubjectOverviewRecord extends OverviewCacheRecord { scopeType: 'SUBJECT'; subjectId: string }
export interface FileFingerprintInput {
  sourceId: string
  ingestionRevision: string
  outlineMarkdown: string | null
  summaryMarkdown: string | null
}

export interface OverviewSourceManifestEntry {
  sourceId: string
  ingestionRevision: string
  outlineVersion: number | null
  summaryVersion: number | null
}

export interface OverviewResultCommand {
  baseVersion: number
  clientWriteId: string
  mode: OverviewMode
  ingestionRevision?: string
  sourceManifest?: OverviewSourceManifestEntry[]
  inputFingerprint?: string
  outlineGeneratedAt: string | null
  summaryGeneratedAt: string | null
  result: OverviewResponse
  inputDescriptor?: OverviewInputDescriptor
}

/** Current canonical result returned by the independent server Overview API. */
export interface OverviewResultView {
  id: string
  scopeType: 'SOURCE' | 'SUBJECT'
  sourceId: string | null
  subjectId: string | null
  ingestionRevision: string | null
  version: number
  outlineVersion: number
  summaryVersion: number
  schemaVersion: 2
  title: string
  outlineMarkdown: string
  summaryMarkdown: string
  outlineSourceManifest: OverviewSourceManifestEntry[] | null
  summarySourceManifest: OverviewSourceManifestEntry[] | null
  outlineInputFingerprint: string | null
  summaryInputFingerprint: string | null
  outlineGeneratedAt: string | null
  summaryGeneratedAt: string | null
  updatedAt: string
  outlineInputDescriptor?: OverviewInputDescriptor
  summaryInputDescriptor?: OverviewInputDescriptor
}

export interface OverviewConflictMetadata {
  version: number
  schemaVersion: number
}

export type OverviewOutboxState = 'PREPARED' | 'PENDING' | 'INFLIGHT' | 'CONFLICT' | 'ERROR' | 'STALE'
export type OverviewIntentOrigin = 'LOCAL_WRITE' | 'LEGACY_SEED'

/** A prepared intent may be materialized only after its server baseline is known. */
export interface OverviewOutboxRecord {
  clientWriteId: string
  scopeType: 'FILE' | 'SUBJECT'
  scopeId: string
  revisionKey: string
  mode: OverviewMode
  origin: OverviewIntentOrigin
  result: OverviewResponse
  inputFingerprint: string | null
  outlineGeneratedAt: string | null
  summaryGeneratedAt: string | null
  state: OverviewOutboxState
  requestBody: OverviewResultCommand | null
  errorCode: string | null
  generationBaseline?: string | null
  createdAt: string
  updatedAt: string
}

export interface OverviewSyncState {
  scopeType: 'FILE' | 'SUBJECT'
  scopeId: string
  revisionKey: string
  version: number
  outlineVersion: number | null
  summaryVersion: number | null
  outlineSourceManifest: OverviewSourceManifestEntry[] | null
  summarySourceManifest: OverviewSourceManifestEntry[] | null
  outlineInputFingerprint: string | null
  summaryInputFingerprint: string | null
  updatedAt: string
}

export interface OverviewScopeSnapshot {
  scopeType: 'FILE' | 'SUBJECT'
  scopeId: string
  revisionKey: string
  record: OverviewCacheRecord
}

export type OverviewSubjectStatusKind = 'AVAILABLE' | 'MISSING' | 'UNAVAILABLE'

export interface OverviewSubjectStatusItem {
  subjectId: string
  status: OverviewSubjectStatusKind
  version: number | null
  outlineVersion: number | null
  summaryVersion: number | null
  updatedAt: string | null
}

export interface OverviewSubjectStatusesResponse {
  items: OverviewSubjectStatusItem[]
}
