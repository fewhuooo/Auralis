export interface AiQuotaInfo {
  limitTokens: number
  chargedTokens: number
  reservedTokens: number
  remainingTokens: number
  resetAt: string
}

export interface AiUsageView {
  hourly: AiQuotaInfo
  daily: AiQuotaInfo
}

export const AI_QUOTA_ERROR_CODES = new Set([
  'AI_REQUEST_BUDGET_EXCEEDED',
  'AI_TASK_BUDGET_EXCEEDED',
  'AI_CONCURRENCY_LIMIT',
  'AI_HOURLY_QUOTA_EXCEEDED',
  'AI_DAILY_QUOTA_EXCEEDED',
  'AI_GLOBAL_QUOTA_EXCEEDED'
])

export function isAiQuotaError(code: string | undefined | null): boolean {
  if (!code) return false
  return AI_QUOTA_ERROR_CODES.has(code)
}

export function formatAiQuotaMessage(code: string | undefined): string {
  switch (code) {
    case 'AI_REQUEST_BUDGET_EXCEEDED': return '请求超出单次计算预算，请缩短请求内容后重试'
    case 'AI_TASK_BUDGET_EXCEEDED': return '任务超出执行预算，请缩小任务范围后重试'
    case 'AI_CONCURRENCY_LIMIT': return '当前并行请求已达上限，请等待正在进行的请求完成后重试'
    case 'AI_HOURLY_QUOTA_EXCEEDED': return '已超出每小时 AI 使用额度，请等待额度重置后重试'
    case 'AI_DAILY_QUOTA_EXCEEDED': return '已超出每日 AI 使用额度，请等待额度重置后重试'
    case 'AI_GLOBAL_QUOTA_EXCEEDED': return '系统 AI 资源当前繁忙，请稍后重试'
    default: return 'AI 请求失败'
  }
}

export function parseRetryAfter(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const num = parseInt(value, 10)
    if (Number.isSafeInteger(num) && num >= 0 && String(num) === value.trim()) {
      return num
    }
    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      const seconds = Math.floor((date.getTime() - Date.now()) / 1000)
      return seconds > 0 ? seconds : 0
    }
  }
  return undefined
}

export function formatRetrySuffix(retryAfterSeconds?: number, resetAt?: string): string {
  if (retryAfterSeconds !== undefined && retryAfterSeconds >= 0) {
    return ` (请在 ${retryAfterSeconds} 秒后重试)`
  }
  if (resetAt) {
    const d = new Date(resetAt)
    if (!isNaN(d.getTime())) {
      return ` (请在 ${d.toLocaleString('zh-CN')} 后重试)`
    }
  }
  return ''
}

export function validateQuotaInfo(data: any): AiQuotaInfo {
  if (!data || typeof data !== 'object') throw new Error('Invalid quota info')
  const keys = ['limitTokens', 'chargedTokens', 'reservedTokens', 'remainingTokens']
  for (const k of keys) {
    if (typeof data[k] !== 'number' || !Number.isSafeInteger(data[k]) || data[k] < 0) {
      throw new Error(`Invalid ${k}`)
    }
  }
  if (typeof data.resetAt !== 'string' || isNaN(new Date(data.resetAt).getTime())) {
    throw new Error('Invalid resetAt')
  }
  return {
    limitTokens: data.limitTokens,
    chargedTokens: data.chargedTokens,
    reservedTokens: data.reservedTokens,
    remainingTokens: data.remainingTokens,
    resetAt: data.resetAt,
  }
}

export function validateAiUsage(data: any): AiUsageView {
  if (!data || typeof data !== 'object') throw new Error('Invalid usage data')
  return {
    hourly: validateQuotaInfo(data.hourly),
    daily: validateQuotaInfo(data.daily),
  }
}

export function isCurrentUsageRequest(
  requestGeneration: number,
  currentGeneration: number,
  requestIdentity: string,
  currentIdentity: string,
): boolean {
  return requestGeneration === currentGeneration && requestIdentity.length > 0 && requestIdentity === currentIdentity
}

let _generation = 0
export function nextRequestGeneration(): number {
  return ++_generation
}
