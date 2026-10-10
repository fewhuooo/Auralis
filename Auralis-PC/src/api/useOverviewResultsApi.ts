import request from './request.ts'
import { ApiProblemError } from './httpError.ts'
import type { OverviewResultCommand, OverviewResultView } from '@/types/overview'

function asOverviewResult(value: unknown): OverviewResultView {
  if (!value || typeof value !== 'object') throw new Error('OVERVIEW_RESULT_INVALID')
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !['SOURCE', 'SUBJECT'].includes(String(item.scopeType))
    || !Number.isInteger(item.version) || Number(item.version) < 1
    || !Number.isInteger(item.schemaVersion) || item.schemaVersion !== 1
    || typeof item.title !== 'string' || !Array.isArray(item.outline) || !item.summary
    || typeof item.updatedAt !== 'string') throw new Error('OVERVIEW_RESULT_INVALID')
  return item as unknown as OverviewResultView
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
}
