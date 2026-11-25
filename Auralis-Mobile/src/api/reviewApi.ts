import { apiClient } from './generated/client'
import type { components } from './generated/schema'

export type ReviewState = components['schemas']['ReviewStateView']
export type ReviewAttemptRequest = components['schemas']['ReviewAttemptRequest']
export type ReviewResolutionRequest = components['schemas']['ReviewResolutionRequest']
export type LearningCompletionRequest = components['schemas']['LearningCompletionRequest']
export type LearningReopenRequest = components['schemas']['LearningReopenRequest']
export type ReviewCommandResponse = components['schemas']['CommandResponse']
export type ReviewLifecycleHistory = components['schemas']['LifecycleHistory']
export type ReviewEffectiveView = components['schemas']['EffectiveReview']
export type LifecycleRating = ReviewAttemptRequest['rating']

export const reviewApi = {
  states: (subjectId: string, cursor?: string) => apiClient.request('/api/reviews/states', 'get', {
    query: { subjectId, cursor },
  }),
  queue: (at: string, cursor?: string, subjectId?: string) => apiClient.request('/api/reviews/queue', 'get', {
    query: { at, cursor, subjectId },
  }),
  block: (id: string) => apiClient.request('/api/knowledge-blocks/{id}', 'get', { pathParams: { id } }),
  attempt: (body: ReviewAttemptRequest) => apiClient.request('/api/reviews/lifecycle/attempts', 'post', { body }),
  confirm: (reviewId: string, body: ReviewResolutionRequest) => apiClient.request(
    '/api/reviews/lifecycle/attempts/{reviewId}/confirmations', 'post', { pathParams: { reviewId }, body },
  ),
  correct: (reviewId: string, body: ReviewResolutionRequest) => apiClient.request(
    '/api/reviews/lifecycle/attempts/{reviewId}/corrections', 'post', { pathParams: { reviewId }, body },
  ),
  completeLearning: (body: LearningCompletionRequest) => apiClient.request(
    '/api/reviews/lifecycle/learning-completions', 'post', { body },
  ),
  reopenLearning: (body: LearningReopenRequest) => apiClient.request(
    '/api/reviews/lifecycle/learning-reopens', 'post', { body },
  ),
  history: (knowledgeBlockId: string) => apiClient.request('/api/reviews/lifecycle/history', 'get', {
    query: { knowledgeBlockId },
  }),
}
