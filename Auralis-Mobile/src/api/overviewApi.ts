import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'
import { ApiProblemError } from './protocol.ts'

export type OverviewResultView = components['schemas']['OverviewResultView']
export type OverviewSubjectStatusesResponse = components['schemas']['OverviewSubjectStatusesResponse']
export type OverviewSubjectStatusItem = components['schemas']['Item']

function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiProblemError && error.status === 404
}

function hasOverviewMarkdown(view: OverviewResultView | null | undefined): boolean {
  return Boolean(view?.outlineMarkdown?.trim() || view?.summaryMarkdown?.trim())
}

function isCachedSubjectOverviewCurrent(
  cached: OverviewResultView | null | undefined,
  statusItem: OverviewSubjectStatusItem,
): cached is OverviewResultView {
  if (!hasOverviewMarkdown(cached)) return false
  return Boolean(
    cached
    && cached.version === statusItem.version
    && cached.outlineVersion === statusItem.outlineVersion
    && cached.summaryVersion === statusItem.summaryVersion
    && cached.updatedAt === statusItem.updatedAt,
  )
}

export function createOverviewApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    async getSubjectStatuses(subjectIds: string[]): Promise<OverviewSubjectStatusesResponse> {
      const uniqueIds = Array.from(new Set(subjectIds.map(id => id.trim()).filter(Boolean)))
      if (uniqueIds.length === 0) {
        return { items: [] }
      }
      return await client.request(
        '/api/overview-results/subjects/statuses',
        'post',
        { body: { subjectIds: uniqueIds } },
      ) as OverviewSubjectStatusesResponse
    },
    async getSubject(subjectId: string): Promise<OverviewResultView | null> {
      try {
        return await client.request(
          '/api/overview-results/subjects/{subjectId}',
          'get',
          { pathParams: { subjectId } },
        ) as OverviewResultView
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
    },
    async fetchSubjectOverviewIfAvailable(
      subjectId: string,
      options?: { cached?: OverviewResultView | null; forceRefresh?: boolean },
    ): Promise<OverviewResultView | null> {
      const statuses = await this.getSubjectStatuses([subjectId])
      const item = statuses.items?.find(entry => entry.subjectId === subjectId)
      if (!item || item.status !== 'AVAILABLE') {
        return null
      }
      if (!options?.forceRefresh && isCachedSubjectOverviewCurrent(options?.cached, item)) {
        return options.cached
      }
      return await this.getSubject(subjectId)
    },
    async getSource(sourceId: string, ingestionRevision?: string): Promise<OverviewResultView | null> {
      try {
        return await client.request(
          '/api/overview-results/sources/{sourceId}',
          'get',
          {
            pathParams: { sourceId },
            ...(ingestionRevision ? { query: { ingestionRevision } } : {}),
          },
        ) as OverviewResultView
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
    },
  }
}

export const overviewApi = createOverviewApi()
