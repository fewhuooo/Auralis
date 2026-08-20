import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient'

export type ReviewEventRequest = components['schemas']['EventRequest']
export type ReviewEventResponse = components['schemas']['EventResponse']
export type ReviewState = components['schemas']['ReviewStateView']

export function createReviewApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    due: (at = new Date().toISOString(), limit = 200) => client.request(
      '/api/reviews/due', 'get', { query: { at, limit } },
    ) as Promise<ReviewState[]>,
    record: (body: ReviewEventRequest) => client.request(
      '/api/reviews/events', 'post', { body },
    ) as Promise<ReviewEventResponse>,
    history: (knowledgeBlockId: string) => client.request(
      '/api/reviews/history', 'get', { query: { knowledgeBlockId } },
    ),
  }
}

export const reviewApi = createReviewApi()
