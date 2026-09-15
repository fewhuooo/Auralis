import { aiRequest } from './request.ts'
import type {
  OverviewApi,
  OverviewRequestContext,
  OverviewResponse,
  SourceOverviewRequest,
  SubjectOverviewRequest,
} from '@/types/overview'
import { validateOverviewResponse } from './overviewResponseValidator.ts'

/** Authenticated, stateless structured-generation endpoints. */
function overviewRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `overview-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useOverviewApi: OverviewApi = {
  generateSourceOverview(request: SourceOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse> {
    return aiRequest.post('/api/ai/source-overviews', request, {
      headers: { 'X-Overview-Request-Id': context?.requestId ?? overviewRequestId() },
      signal: context?.signal,
    })
      .then(response => validateOverviewResponse(response, request.mode))
  },
  generateSubjectOverview(request: SubjectOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse> {
    return aiRequest.post('/api/ai/subject-overviews', request, {
      headers: { 'X-Overview-Request-Id': context?.requestId ?? overviewRequestId() },
      signal: context?.signal,
    })
      .then(response => validateOverviewResponse(response, request.mode))
  },
}

export const generateSourceOverview = useOverviewApi.generateSourceOverview
export const generateSubjectOverview = useOverviewApi.generateSubjectOverview
