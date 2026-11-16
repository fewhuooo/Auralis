import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'
import { ApiProblemError } from './protocol.ts'

export type OverviewResultView = components['schemas']['OverviewResultView']

function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiProblemError && error.status === 404
}

export function createOverviewApi(client: ApiCallClient = defaultApiCallClient) {
  return {
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
