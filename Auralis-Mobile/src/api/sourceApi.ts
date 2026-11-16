import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'

export type SourceView = components['schemas']['SourceResponse']
export type SourceListResponse = components['schemas']['SourceListResponse']
export type SourceCreateRequest = components['schemas']['SourceCreateRequest']

export function createSourceApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    list: (subjectId?: string, cursor?: string, limit = 50) => client.request(
      '/api/sources', 'get', { query: { subjectId, cursor, limit } },
    ) as Promise<SourceListResponse>,
    async listAllBySubject(subjectId: string): Promise<SourceView[]> {
      const items: SourceView[] = []
      let cursor: string | undefined
      do {
        const page = await client.request(
          '/api/sources', 'get', { query: { subjectId, cursor, limit: 50 } },
        ) as SourceListResponse
        if (page.items) items.push(...page.items)
        if (page.hasMore && !page.nextCursor) break
        cursor = page.hasMore ? page.nextCursor : undefined
      } while (cursor)
      return items.filter(item => !item.deletedAt)
    },
    get: (id: string) => client.request(
      '/api/sources/{id}', 'get', { pathParams: { id } },
    ) as Promise<SourceView>,
    create: (body: SourceCreateRequest) => client.request(
      '/api/sources', 'post', { body },
    ) as Promise<SourceView>,
    delete: (id: string, baseVersion: number) => client.request(
      '/api/sources/{id}', 'delete', { pathParams: { id }, body: { baseVersion } },
    ) as Promise<void>,
  }
}

export const sourceApi = createSourceApi()
