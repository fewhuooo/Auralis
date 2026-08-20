import { isProblemDetails, type ApiProblemDetails } from './protocol.ts';

export class ApiProblemError extends Error {
  readonly problem: ApiProblemDetails;
  readonly status: number;

  constructor(problem: ApiProblemDetails) {
    super(problem.detail || problem.title);
    this.name = 'ApiProblemError';
    this.problem = problem;
    this.status = problem.status;
  }
}

function isLegacyResponseEnvelope(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.code === 200 && Object.prototype.hasOwnProperty.call(candidate, 'data');
}

export function assertDirectDto<T>(value: T): T {
  if (isLegacyResponseEnvelope(value)) {
    throw new ApiProblemError({
      title: 'Legacy response envelope is not supported',
      status: 500,
      detail: 'The API must return a direct DTO.',
    });
  }
  return value;
}

interface FailedResponse {
  response?: {
    status?: unknown;
    data?: unknown;
  };
  /** Axios sets request when the transport was attempted but no response arrived. */
  request?: unknown;
  message?: unknown;
}

export function toApiProblem(error: unknown): ApiProblemDetails {
  const failed = (error && typeof error === 'object' ? error : {}) as FailedResponse;
  const status = typeof failed.response?.status === 'number' && Number.isInteger(failed.response.status)
    ? failed.response.status
    : failed.request
      ? 0
      : 500;

  if (isProblemDetails(failed.response?.data)) return failed.response.data;

  return {
    title: 'Request failed',
    status,
    detail: typeof failed.message === 'string' ? failed.message : undefined,
  };
}

export function createApiProblemError(error: unknown): ApiProblemError {
  return new ApiProblemError(toApiProblem(error));
}
