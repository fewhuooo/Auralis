import { ApiProblemError } from '../api/httpError.ts'
import { isOfflineTransportFailure } from './offlineWritePolicy.ts'

export type ClientErrorDomain = 'SYNC' | 'CHAT' | 'AI_STREAM'

export interface SafeClientErrorInfo {
  code: string
  message: string
  detail: string
  offline: boolean
  retryable: boolean
  retryAfterSeconds?: number
  resetAt?: string
}

const SAFE_CODES = new Set([
  'NETWORK_OFFLINE',
  'AUTH_REQUIRED',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'SYNC_FAILED',
  'AI_REQUEST_FAILED',
  'AI_PROVIDER_ERROR',
  'AI_REQUEST_BUDGET_EXCEEDED',
  'AI_TASK_BUDGET_EXCEEDED',
  'AI_CONCURRENCY_LIMIT',
  'AI_HOURLY_QUOTA_EXCEEDED',
  'AI_DAILY_QUOTA_EXCEEDED',
  'AI_GLOBAL_QUOTA_EXCEEDED',
])

function boundedDetail(error: unknown): string {
  const code = candidateCode(error)
  if (isAiQuotaError(code)) return formatAiQuotaMessage(code)
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const problem = candidate.problem && typeof candidate.problem === 'object'
    ? candidate.problem as Record<string, unknown>
    : undefined
  const values = [candidate.message, candidate.detail, problem?.detail, problem?.title, error]
  const raw = values.find((value): value is string => typeof value === 'string' && Boolean(value.trim())) ?? 'unknown error'
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240)
}

function candidateStatus(error: unknown): number | null {
  if (error instanceof ApiProblemError) return error.status
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const problem = candidate.problem && typeof candidate.problem === 'object'
    ? candidate.problem as Record<string, unknown>
    : undefined
  const response = candidate.response && typeof candidate.response === 'object'
    ? candidate.response as Record<string, unknown>
    : undefined
  const status = problem?.status ?? candidate.status ?? response?.status
  return typeof status === 'number' && Number.isInteger(status) ? status : null
}

function candidateCode(error: unknown): string {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const problem = candidate.problem && typeof candidate.problem === 'object'
    ? candidate.problem as Record<string, unknown>
    : undefined
  const response = candidate.response && typeof candidate.response === 'object'
    ? candidate.response as Record<string, unknown>
    : undefined
  const responseData = response?.data && typeof response.data === 'object'
    ? response.data as Record<string, unknown>
    : undefined
  return typeof candidate.code === 'string'
    ? candidate.code
    : typeof problem?.code === 'string'
      ? problem.code
      : typeof responseData?.code === 'string' ? responseData.code : ''
}

function messageFor(domain: ClientErrorDomain, code: string): string {
  if (code === 'NETWORK_OFFLINE') {
    return domain === 'SYNC' ? '网络中断，同步将在恢复后重试' : '网络中断，消息会使用相同请求 ID 重试'
  }
  if (code === 'AUTH_REQUIRED') return '登录状态已失效，请重新登录'
  if (code === 'RATE_LIMITED') return '请求过于频繁，请稍后重试'
  if (code === 'SERVICE_UNAVAILABLE') return '服务暂时不可用，请稍后重试'
  if (code === 'AI_REQUEST_BUDGET_EXCEEDED') return '请求超出计算预算限制'
  if (code === 'AI_TASK_BUDGET_EXCEEDED') return '任务执行超出计算预算限制'
  if (code === 'AI_CONCURRENCY_LIMIT') return '当前并行请求过多，请稍后重试'
  if (code === 'AI_HOURLY_QUOTA_EXCEEDED') return '已超出每小时 AI 使用额度'
  if (code === 'AI_DAILY_QUOTA_EXCEEDED') return '已超出每日 AI 使用额度'
  if (code === 'AI_GLOBAL_QUOTA_EXCEEDED') return '系统当前 AI 资源紧张，请稍后重试'
  if (domain === 'SYNC') return '同步失败，请重试'
  return 'AI 请求失败，请重试'
}

import { isAiQuotaError, parseRetryAfter, formatRetrySuffix, formatAiQuotaMessage } from './aiUsageGuardHelper.ts'

export function classifyClientError(error: unknown, domain: ClientErrorDomain): SafeClientErrorInfo {
  if (error instanceof SafeClientError) {
    return {
      code: error.code,
      message: error.message,
      detail: error.detail,
      offline: error.offline,
      retryable: error.retryable,
      ...((error as any).retryAfterSeconds !== undefined ? { retryAfterSeconds: (error as any).retryAfterSeconds } : {}),
      ...((error as any).resetAt !== undefined ? { resetAt: (error as any).resetAt } : {}),
    }
  }
  const offline = isOfflineTransportFailure(error) || candidateCode(error) === 'NETWORK_OFFLINE'
  const status = candidateStatus(error)
  let code = 'AI_REQUEST_FAILED'
  const cCode = candidateCode(error)
  if (offline) code = 'NETWORK_OFFLINE'
  else if (status === 401 || status === 403) code = 'AUTH_REQUIRED'
  else if (['MODEL_PROVIDER_ERROR', 'AI_PROVIDER_ERROR', 'PROVIDER_UNAVAILABLE'].includes(cCode)) code = 'AI_PROVIDER_ERROR'
  else if (SAFE_CODES.has(cCode)) code = cCode
  else if (status === 429) code = 'RATE_LIMITED'
  else if (status !== null && status >= 500) code = 'SERVICE_UNAVAILABLE'
  else if (domain === 'SYNC') code = 'SYNC_FAILED'
  if (!SAFE_CODES.has(code)) code = domain === 'SYNC' ? 'SYNC_FAILED' : 'AI_REQUEST_FAILED'
  
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const problem = candidate.problem && typeof candidate.problem === 'object' ? candidate.problem as Record<string, unknown> : undefined
  const response = candidate.response && typeof candidate.response === 'object' ? candidate.response as Record<string, unknown> : undefined
  const responseData = response?.data && typeof response.data === 'object' ? response.data as Record<string, unknown> : undefined
  
  const retryAfterHeaderRaw = response?.headers ? (response.headers as Record<string, string>)[Object.keys(response.headers as Record<string, string>).find(k => k.toLowerCase() === 'retry-after') || ''] : undefined;
  let retryAfterSeconds = parseRetryAfter(candidate.retryAfterSeconds ?? problem?.retryAfterSeconds ?? responseData?.retryAfterSeconds ?? retryAfterHeaderRaw)
  let resetAt = typeof candidate.resetAt === 'string' ? candidate.resetAt : typeof problem?.resetAt === 'string' ? problem.resetAt : typeof responseData?.resetAt === 'string' ? responseData.resetAt : undefined
  
  let finalMessage = formatAiQuotaMessage(code)
  if (finalMessage === 'AI 请求失败') finalMessage = messageFor(domain, code)
  
  finalMessage += formatRetrySuffix(retryAfterSeconds, resetAt)
  return {
    code,
    message: finalMessage,
    detail: boundedDetail(error),
    offline,
    retryable: code !== 'AUTH_REQUIRED',
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(resetAt !== undefined ? { resetAt } : {}),
  }
}

export class SafeClientError extends Error {
  readonly code: string
  readonly detail: string
  readonly offline: boolean
  readonly retryable: boolean
  readonly status: number
  readonly retryAfterSeconds?: number
  readonly resetAt?: string

  constructor(info: SafeClientErrorInfo) {
    super(info.message)
    this.name = 'SafeClientError'
    this.code = info.code
    this.detail = info.detail
    this.offline = info.offline
    this.retryable = info.retryable
    this.status = info.offline ? 0 : 500
    this.retryAfterSeconds = info.retryAfterSeconds
    this.resetAt = info.resetAt
  }
}

export function toSafeClientError(error: unknown, domain: ClientErrorDomain): SafeClientError {
  if (error instanceof SafeClientError) return error
  return new SafeClientError(classifyClientError(error, domain))
}

export function logClientError(prefix: string, _error: unknown, info: SafeClientErrorInfo): void {
  console.warn(prefix, { code: info.code, detail: info.detail })
}




