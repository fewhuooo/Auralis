import request from './request.ts'
import type { components } from './generated/schema.ts'
import type { SyncRequestScopeTicket, SyncScopedAxiosRequestConfig } from './request.ts'

type GeneratedReviewStateView = components['schemas']['ReviewStateView']
export type ReviewStateView = Omit<GeneratedReviewStateView,
  'nextReviewStage' | 'lastPracticeAt' | 'lastReviewId' | 'pendingReviewId' | 'contentHash'
> & {
  nextReviewStage?: string | null
  lastPracticeAt?: string | null
  lastReviewId?: string | null
  pendingReviewId?: string | null
  contentHash?: string | null
}
export type CursorPageReviewStateView = Omit<components['schemas']['CursorPageReviewStateView'], 'items'> & {
  items?: ReviewStateView[]
}

type GeneratedLifecycleStateView = GeneratedReviewStateView
type GeneratedLifecycleCommandResponse = components['schemas']['CommandResponse']
type GeneratedEffectiveReview = components['schemas']['EffectiveReview']
type GeneratedLifecycleCommandBase = components['schemas']['ReviewResolutionRequest']
type GeneratedLifecycleHistory = components['schemas']['LifecycleHistory']

export type LifecycleRating = components['schemas']['ReviewAttemptRequest']['rating']
export type NextReviewStage = 'EARLY_RECALL' | 'CROSS_DAY' | 'FINAL_VERIFICATION' | null
export type LifecycleAction = NonNullable<GeneratedLifecycleCommandResponse['action']>

export type LifecycleStateView = Omit<GeneratedLifecycleStateView,
  'knowledgeBlockId' | 'dueAt' | 'version' | 'knowledgeBlockVersion' | 'needsLearning' | 'mastered'
  | 'stableSuccessCount' | 'nextReviewStage' | 'lastPracticeAt' | 'lastReviewId' | 'pendingReviewId' | 'contentHash'
> & {
  knowledgeBlockId: string
  dueAt: string
  version: number
  knowledgeBlockVersion: number
  needsLearning: boolean
  mastered: boolean
  stableSuccessCount: number
  nextReviewStage: NextReviewStage
  lastPracticeAt: string | null
  lastReviewId: string | null
  pendingReviewId: string | null
  contentHash: string | null
}

export type EffectiveReviewView = GeneratedEffectiveReview & {
  reviewId: string
  selectedRating: LifecycleRating
  effectiveRating: LifecycleRating | null
  selectedAt: string
  resolvedAt: string | null
  resolution: NonNullable<GeneratedEffectiveReview['resolution']> | null
}

export type LifecycleCommandResponse = Omit<GeneratedLifecycleCommandResponse, 'state' | 'effectiveReview'> & {
  commandId: string
  clientCommandId: string
  action: LifecycleAction
  occurredAt: string
  knowledgeBlockVersion: number
  state: LifecycleStateView
  effectiveReview: EffectiveReviewView | null
}

export type LifecycleCommandBase = Omit<GeneratedLifecycleCommandBase, 'reviewId'> & {
  clientCommandId: string
  knowledgeBlockId: string
  knowledgeBlockVersion: number
  baseVersion: number
  contentHash: string
  expectedStateAbsent: boolean
}

export type LearningCompletionRequest = components['schemas']['LearningCompletionRequest'] & LifecycleCommandBase & {
  reviewId?: string
}

export type ReviewAttemptRequest = components['schemas']['ReviewAttemptRequest'] & LifecycleCommandBase & {
  reviewId: string
  rating: LifecycleRating
  durationSeconds?: number
}

export type LearningReopenRequest = components['schemas']['LearningReopenRequest'] & LifecycleCommandBase & {
  reviewId?: string
}

export interface LifecycleHistoryQuery {
  knowledgeBlockId: string
}

export type LifecycleHistoryCommandView = Omit<components['schemas']['CommandHistory'], 'commandId' | 'clientCommandId' | 'action' | 'occurredAt' | 'reviewId' | 'rating' | 'durationSeconds' | 'baseVersion' | 'knowledgeBlockVersion'> & {
  commandId: string
  clientCommandId: string
  action: LifecycleAction
  occurredAt: string
  reviewId: string | null
  rating: LifecycleRating | null
  durationSeconds: number | null
  baseVersion: number
  knowledgeBlockVersion: number
}

export type LifecycleEffectiveReviewHistoryView = GeneratedEffectiveReview & {
  reviewId: string
  selectedRating: LifecycleRating
  effectiveRating: LifecycleRating | null
  selectedAt: string
  resolvedAt: string | null
  resolution: EffectiveReviewView['resolution'] | null
}

export type LifecycleHistoryResponse = Omit<GeneratedLifecycleHistory, 'state' | 'commands' | 'effectiveReviews'> & {
  knowledgeBlockId: string
  knowledgeBlockVersion: number
  state: LifecycleStateView | null
  commands: LifecycleHistoryCommandView[]
  effectiveReviews: LifecycleEffectiveReviewHistoryView[]
}

export interface SubjectReviewStatesQuery {
  subjectId: string
  cursor?: string
  limit?: number
}

function scopedConfig(scope?: SyncRequestScopeTicket): SyncScopedAxiosRequestConfig | undefined {
  return scope ? { __auralisSyncScope: scope } : undefined
}

export const useReviewApi = {
  getSubjectStates(params: SubjectReviewStatesQuery, scope?: SyncRequestScopeTicket): Promise<CursorPageReviewStateView> {
    const query = { ...params, cursor: params.cursor || undefined }
    return request.get('/api/reviews/states', { params: query, ...scopedConfig(scope) }) as unknown as Promise<CursorPageReviewStateView>
  },
  selectReview(data: ReviewAttemptRequest, scope?: SyncRequestScopeTicket): Promise<LifecycleCommandResponse> {
    return request.post('/api/reviews/lifecycle/attempts', data, scopedConfig(scope)) as unknown as Promise<LifecycleCommandResponse>
  },
  confirmReview(reviewId: string, data: LifecycleCommandBase, scope?: SyncRequestScopeTicket): Promise<LifecycleCommandResponse> {
    return request.post(`/api/reviews/lifecycle/attempts/${encodeURIComponent(reviewId)}/confirmations`, data, scopedConfig(scope)) as unknown as Promise<LifecycleCommandResponse>
  },
  correctReview(reviewId: string, data: LifecycleCommandBase, scope?: SyncRequestScopeTicket): Promise<LifecycleCommandResponse> {
    return request.post(`/api/reviews/lifecycle/attempts/${encodeURIComponent(reviewId)}/corrections`, data, scopedConfig(scope)) as unknown as Promise<LifecycleCommandResponse>
  },
  completeLearning(data: LearningCompletionRequest, scope?: SyncRequestScopeTicket): Promise<LifecycleCommandResponse> {
    return request.post('/api/reviews/lifecycle/learning-completions', data, scopedConfig(scope)) as unknown as Promise<LifecycleCommandResponse>
  },
  reopenLearning(data: LearningReopenRequest, scope?: SyncRequestScopeTicket): Promise<LifecycleCommandResponse> {
    return request.post('/api/reviews/lifecycle/learning-reopens', data, scopedConfig(scope)) as unknown as Promise<LifecycleCommandResponse>
  },
  getLifecycleHistory(params: LifecycleHistoryQuery, scope?: SyncRequestScopeTicket): Promise<LifecycleHistoryResponse> {
    return request.get('/api/reviews/lifecycle/history', { params, ...scopedConfig(scope) }) as unknown as Promise<LifecycleHistoryResponse>
  },
}
