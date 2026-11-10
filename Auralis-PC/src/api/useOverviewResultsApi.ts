import request from './request.ts'
import { ApiProblemError } from './httpError.ts'
import { validateCanonicalOverviewProvenance } from './overviewResponseValidator.ts'
import type {
  OverviewResultCommand,
  OverviewResultView,
  OverviewSubjectStatusItem,
  OverviewSubjectStatusKind,
  OverviewSubjectStatusesResponse,
} from '@/types/overview'

function asOverviewResult(value: unknown): OverviewResultView {
  if (!value || typeof value !== 'object') throw new Error('OVERVIEW_RESULT_INVALID')
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !['SOURCE', 'SUBJECT'].includes(String(item.scopeType))
    || !Number.isInteger(item.version) || Number(item.version) < 0
    || !Number.isInteger(item.schemaVersion) || item.schemaVersion !== 1
    || typeof item.title !== 'string' || !Array.isArray(item.outline) || !item.summary
    || typeof item.updatedAt !== 'string') throw new Error('OVERVIEW_RESULT_INVALID')
  const outlineIdentity = item.outlineIdentity && typeof item.outlineIdentity === 'object'
    && (item.outlineIdentity as Record<string, unknown>).schemaVersion === 1
    && Array.isArray((item.outlineIdentity as Record<string, unknown>).nodes)
    ? item.outlineIdentity : null
  const outlineProvenance = item.outlineProvenance == null ? null
    : validateCanonicalOverviewProvenance(item.outlineProvenance, item.outline as OverviewResultView['outline'])
  return { ...item, identityReady: item.identityReady === true && outlineIdentity !== null,
    outlineIdentity, outlineProvenance } as unknown as OverviewResultView
}

function asOverviewSubjectStatusesResponse(value: unknown): OverviewSubjectStatusesResponse {
  if (!value || typeof value !== 'object') throw new Error('OVERVIEW_STATUSES_INVALID')
  const body = value as Record<string, unknown>
  if (!Array.isArray(body.items)) throw new Error('OVERVIEW_STATUSES_INVALID')
  const validStatuses: OverviewSubjectStatusKind[] = ['AVAILABLE', 'MISSING', 'UNAVAILABLE']
  const items: OverviewSubjectStatusItem[] = body.items.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('OVERVIEW_STATUS_ITEM_INVALID')
    const item = raw as Record<string, unknown>
    if (typeof item.subjectId !== 'string' || !validStatuses.includes(item.status as OverviewSubjectStatusKind)) {
      throw new Error('OVERVIEW_STATUS_ITEM_INVALID')
    }
    const status = item.status as OverviewSubjectStatusKind
    if (status === 'AVAILABLE') {
      if (!Number.isInteger(item.version) || Number(item.version) < 0
        || !Number.isInteger(item.outlineVersion) || Number(item.outlineVersion) < 0
        || !Number.isInteger(item.summaryVersion) || Number(item.summaryVersion) < 0
        || typeof item.updatedAt !== 'string' || !item.updatedAt.trim()) {
        throw new Error('OVERVIEW_STATUS_ITEM_INVALID')
      }
      return {
        subjectId: item.subjectId,
        status,
        version: item.version as number,
        outlineVersion: item.outlineVersion as number,
        summaryVersion: item.summaryVersion as number,
        updatedAt: item.updatedAt as string,
      }
    }
    return {
      subjectId: item.subjectId,
      status,
      version: null,
      outlineVersion: null,
      summaryVersion: null,
      updatedAt: null,
    }
  })
  return { items }
}

function notFound(error: unknown): boolean { return error instanceof ApiProblemError && error.status === 404 }

export const useOverviewResultsApi = {
  async getFile(sourceId: string, ingestionRevision: string): Promise<OverviewResultView | null> {
    try {
      const result = await request.get(`/api/overview-results/sources/${encodeURIComponent(sourceId)}`, {
        params: { ingestionRevision },
      })
      return asOverviewResult(result)
    } catch (error) { if (notFound(error)) return null; throw error }
  },
  async putFile(sourceId: string, command: OverviewResultCommand): Promise<OverviewResultView> {
    const result = await request.put(`/api/overview-results/sources/${encodeURIComponent(sourceId)}`, command)
    return asOverviewResult(result)
  },
  async getSubject(subjectId: string): Promise<OverviewResultView | null> {
    try {
      const result = await request.get(`/api/overview-results/subjects/${encodeURIComponent(subjectId)}`)
      return asOverviewResult(result)
    } catch (error) { if (notFound(error)) return null; throw error }
  },
  async putSubject(subjectId: string, command: OverviewResultCommand): Promise<OverviewResultView> {
    const result = await request.put(`/api/overview-results/subjects/${encodeURIComponent(subjectId)}`, command)
    return asOverviewResult(result)
  },
  async getSubjectStatuses(subjectIds: string[]): Promise<OverviewSubjectStatusesResponse> {
    if (!Array.isArray(subjectIds) || subjectIds.length < 1 || subjectIds.length > 100
      || subjectIds.some(id => typeof id !== 'string' || !id.trim())) {
      throw new Error('OVERVIEW_SUBJECT_IDS_INVALID')
    }
    const result = await request.post('/api/overview-results/subjects/statuses', { subjectIds })
    return asOverviewSubjectStatusesResponse(result)
  },
}
