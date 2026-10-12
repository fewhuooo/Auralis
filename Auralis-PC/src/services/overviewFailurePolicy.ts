import { isAiQuotaError, formatAiQuotaMessage } from './aiUsageGuardHelper.ts'
const UNCERTAIN_CODES = new Set(['OVERVIEW_STATUS_UNKNOWN', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE'])
const PROVIDER_OUTPUT_FAILURE_CODES = new Set(['MODEL_PROVIDER_ERROR'])

export function classifyOverviewFailure(error: unknown): { code: string; detail: string; status?: number; retryAfterSeconds?: number; resetAt?: string } {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const problem = candidate.problem && typeof candidate.problem === 'object'
    ? candidate.problem as Record<string, unknown>
    : undefined
  const rawCode = typeof candidate.code === 'string'
    ? candidate.code
    : typeof problem?.code === 'string'
      ? problem.code
      : Number(problem?.status) === 0
        ? 'OVERVIEW_STATUS_UNKNOWN'
        : ''
  const code = /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode)
    ? rawCode
    : 'OVERVIEW_GENERATION_FAILED'
  const statusValue = Number(candidate.status ?? problem?.status)
  const retryValue = Number(candidate.retryAfterSeconds ?? problem?.retryAfterSeconds)
  const resetAtValue = candidate.resetAt ?? problem?.resetAt
  return {
    code,
    detail: `Overview generation failed: ${code}`.slice(0, 500),
    ...(Number.isInteger(statusValue) && statusValue >= 400 && statusValue <= 599 ? { status: statusValue } : {}),
    ...(Number.isFinite(retryValue) && retryValue >= 0 && retryValue <= 86_400 ? { retryAfterSeconds: retryValue } : {}),
    ...(typeof resetAtValue === 'string' && Number.isFinite(Date.parse(resetAtValue)) ? { resetAt: resetAtValue } : {}),
  }
}

export function overviewFailureMessage(errorCode: string | null | undefined): string {
  if (isAiQuotaError(errorCode)) return formatAiQuotaMessage(errorCode || undefined)
  return PROVIDER_OUTPUT_FAILURE_CODES.has(errorCode ?? '')
    ? '遇到意外情况，请重试'
    : UNCERTAIN_CODES.has(errorCode ?? '')
    ? '无法确认生成状态，服务器可能仍在处理，请稍后再重新生成'
    : '生成失败，请重新生成'
}
