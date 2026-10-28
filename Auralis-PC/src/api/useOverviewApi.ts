import { postOverviewSse } from './overviewSse.ts'
import type {
  OverviewApi,
  OverviewRequestContext,
  GeneratedOverviewResponse,
  SourceOverviewRequest,
  SubjectOverviewRequest,
} from '@/types/overview'

/** Authenticated, stateless structured-generation endpoints. */
function overviewRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `overview-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useOverviewApi: OverviewApi = {
  generateSourceOverview(request: SourceOverviewRequest, context?: OverviewRequestContext): Promise<GeneratedOverviewResponse> {
    return postOverviewSse('/api/ai/source-overviews', request, {
      requestId: context?.requestId ?? overviewRequestId(),
      signal: context?.signal,
      scope: context?.scope,
      consumerId: context?.consumerId,
      onRequestDispatched: context?.onRequestDispatched,
    })
  },
  generateSubjectOverview(request: SubjectOverviewRequest, context?: OverviewRequestContext): Promise<GeneratedOverviewResponse> {
    return postOverviewSse('/api/ai/subject-overviews', request, {
      requestId: context?.requestId ?? overviewRequestId(),
      signal: context?.signal,
      scope: context?.scope,
      consumerId: context?.consumerId,
      onRequestDispatched: context?.onRequestDispatched,
    })
  },
}

export const generateSourceOverview = useOverviewApi.generateSourceOverview
export const generateSubjectOverview = useOverviewApi.generateSubjectOverview
