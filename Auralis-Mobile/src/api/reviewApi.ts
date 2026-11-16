import { apiClient } from './generated/client'
import type { components } from './generated/schema'

export type ReviewState = components['schemas']['ReviewStateView']
export type ReviewAttemptRequest = components['schemas']['ReviewAttemptRequest']
export type ReviewResolutionRequest = components['schemas']['ReviewResolutionRequest']

export const reviewApi = {
  queue: (at: string, cursor?: string, subjectId?: string) => apiClient.request('/api/reviews/queue', 'get', {
    query: { at, cursor, subjectId },
  }),
  block: (id: string) => apiClient.request('/api/knowledge-blocks/{id}', 'get', { pathParams: { id } }),
  attempt: (body: ReviewAttemptRequest) => apiClient.request('/api/reviews/lifecycle/attempts', 'post', { body }),
  confirm: (reviewId: string, body: ReviewResolutionRequest) => apiClient.request(
    '/api/reviews/lifecycle/attempts/{reviewId}/confirmations', 'post', { pathParams: { reviewId }, body },
  ),
}
