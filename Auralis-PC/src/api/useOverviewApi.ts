import { postOverviewSse } from './overviewSse.ts'
import type {
  OverviewApi,
  OverviewRequestContext,
  OverviewResponse,
  SourceOverviewRequest,
  SubjectOverviewRequest,
} from '@/types/overview'

/** Authenticated, stateless structured-generation endpoints. */
function overviewRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `overview-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useOverviewApi: OverviewApi = {
  generateSourceOverview(request: SourceOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse> {
    return postOverviewSse('/api/ai/source-overviews', request, {
      requestId: context?.requestId ?? overviewRequestId(),
      signal: context?.signal,
      scope: context?.scope,
      consumerId: context?.consumerId,
    })
  },
  generateSubjectOverview(request: SubjectOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse> {
    return postOverviewSse('/api/ai/subject-overviews', request, {
      requestId: context?.requestId ?? overviewRequestId(),
      signal: context?.signal,
      scope: context?.scope,
      consumerId: context?.consumerId,
    })
  },
}

export const generateSourceOverview = useOverviewApi.generateSourceOverview
export const generateSubjectOverview = useOverviewApi.generateSubjectOverview
