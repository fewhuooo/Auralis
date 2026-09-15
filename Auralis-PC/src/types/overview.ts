export type OverviewMode = 'ALL' | 'OUTLINE' | 'SUMMARY'
export type OverviewCacheStatus = 'READY' | 'FAILED'
export type FileOverviewTrigger = 'SOURCE_READY' | 'RESUME_BOOTSTRAP' | 'RESUME_ONLINE' | 'RESUME_SYNC' | 'JOB_CHANGED' | 'MANUAL_RETRY'

export interface OverviewLocator { page: number | null; blockId: string | null }
export interface OverviewSection { title: string; summary: string | null; sourceIds: string[]; locator: OverviewLocator | null }
export interface OverviewChapter { title: string; sections: OverviewSection[] }
export interface OverviewSummary { overview: string; keyPoints: string[]; learningPath: string[] }
export interface OverviewResponse {
  schemaVersion: 1
  title: string
  outline: OverviewChapter[] | null
  summary: OverviewSummary | null
}
export interface SourceOverviewRequest { sourceId: string; mode: OverviewMode; instruction?: string }
export interface SubjectOverviewSourceInput {
  sourceId: string
  title?: string
  outline: OverviewChapter[] | null
  summary: OverviewSummary | null
}
export interface SubjectOverviewRequest {
  subjectId: string
  mode: OverviewMode
  instruction?: string
  sources: SubjectOverviewSourceInput[]
}
export interface OverviewRequestContext { requestId: string; signal?: AbortSignal }
export interface OverviewApi {
  generateSourceOverview(request: SourceOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse>
  generateSubjectOverview(request: SubjectOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse>
}
export interface OverviewCacheRecord {
  scopeType: 'FILE' | 'SUBJECT'; scopeId: string; revisionKey: string; schemaVersion: 1; title: string
  outline: OverviewChapter[] | null; summary: OverviewSummary | null
  outlineGeneratedAt: string | null; summaryGeneratedAt: string | null; inputFingerprint: string | null
  status: OverviewCacheStatus; errorCode: string | null; errorDetail: string | null; updatedAt: string
}
export interface FileOverviewRecord extends OverviewCacheRecord { scopeType: 'FILE'; sourceId: string; ingestionRevision: string }
export interface SubjectOverviewRecord extends OverviewCacheRecord { scopeType: 'SUBJECT'; subjectId: string }
export interface FileFingerprintInput {
  sourceId: string; ingestionRevision: string; outline: OverviewChapter[] | null; summary: OverviewSummary | null
}
