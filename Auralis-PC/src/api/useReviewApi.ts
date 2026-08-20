import request from './request.ts'
import type { components } from './generated/schema.ts'

export type ReviewStateView = components['schemas']['ReviewStateView']
export type ReviewEventView = components['schemas']['ReviewEventView']
export type EventRequest = components['schemas']['EventRequest']
export type EventResponse = components['schemas']['EventResponse']

export interface ReviewQuery {
  at?: string
  limit?: number
}

export interface ReviewHistoryQuery {
  knowledgeBlockId: string
}

export const useReviewApi = {
  getDueReviews(params?: ReviewQuery): Promise<ReviewStateView[]> {
    return request.get('/api/reviews/due', { params }) as unknown as Promise<ReviewStateView[]>
  },
  getReviewQueue(params?: ReviewQuery): Promise<ReviewStateView[]> {
    return request.get('/api/reviews/due', { params }) as unknown as Promise<ReviewStateView[]>
  },
  recordEvent(data: EventRequest): Promise<EventResponse> {
    return request.post('/api/reviews/events', data) as unknown as Promise<EventResponse>
  },
  recordReviewEvent(data: EventRequest): Promise<EventResponse> {
    return request.post('/api/reviews/events', data) as unknown as Promise<EventResponse>
  },
  getHistory(params: ReviewHistoryQuery): Promise<ReviewEventView[]> {
    return request.get('/api/reviews/history', { params }) as unknown as Promise<ReviewEventView[]>
  },
  getReviewHistory(params: ReviewHistoryQuery): Promise<ReviewEventView[]> {
    return request.get('/api/reviews/history', { params }) as unknown as Promise<ReviewEventView[]>
  },
}

export const getDueReviews = useReviewApi.getDueReviews
export const getReviewQueue = useReviewApi.getReviewQueue
export const recordEvent = useReviewApi.recordEvent
export const recordReviewEvent = useReviewApi.recordReviewEvent
export const getHistory = useReviewApi.getHistory
export const getReviewHistory = useReviewApi.getReviewHistory
