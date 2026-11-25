import { formatAiQuotaMessage, formatRetrySuffix, isAiQuotaError, parseRetryAfter } from '../utils/aiUsageGuardHelper.ts'

export interface ApiFieldError {
  field: string
  message: string
  rejectedValue?: unknown
}

export interface ProblemDetails {
  type?: string
  title: string
  status: number
  detail: string
  instance?: string
  code?: string
  traceId?: string
  fieldErrors: ApiFieldError[]
  current?: unknown
  retryAfterSeconds?: number
  resetAt?: string
}

export class ApiProblemError extends Error {
  readonly problem: ProblemDetails
  readonly status: number
  readonly code?: string
  readonly fieldErrors: ApiFieldError[]
  readonly retryAfterSeconds?: number
  readonly resetAt?: string

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title)
    this.name = 'ApiProblemError'
    this.problem = problem
    this.status = problem.status
    this.code = problem.code
    this.fieldErrors = problem.fieldErrors
    this.retryAfterSeconds = problem.retryAfterSeconds
    this.resetAt = problem.resetAt
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

const EXACT_PROBLEM_DETAIL_ZH: Record<string, string> = {
  'Invalid credentials': '账号或密码错误，请重新输入',
  'The email verification code is invalid or expired': '邮箱验证码无效或已过期，请重新获取',
  'Username must not contain @': '用户名不能包含 @ 符号',
  'Username is already registered': '该用户名已被注册',
  'Username or email is already registered': '用户名或邮箱已被注册',
  'Display name must contain 1 to 120 characters': '昵称长度需在 1 至 120 个字符之间',
  'New password must differ from the current password': '新密码不能与当前密码相同',
  'User profile changed since it was read': '账户信息已在其他端更新，请刷新后重试',
  'Password must not exceed 72 UTF-8 bytes': '密码长度不能超过 72 字节',
  'Account email delivery is unavailable': '邮件发送服务暂不可用，请稍后重试',
  'Username is required': '请输入用户名',
  'Avatar must be an image no larger than 5 MiB': '头像须为不超过 5 MiB 的图片',
  'Avatar could not be read': '头像图片读取失败，请更换图片',
  'Avatar was not found': '未找到用户头像',
  'Only access tokens are accepted': '登录凭据类型无效，请重新登录',
  'Account is unavailable': '当前账号不可用或已被停用',
  'Task schedule overlaps another active task': '该时段与已有日程存在时间冲突，请调整时间',
  'Review state version does not match': '复习进度已在其他端更新，请刷新最新状态',
  'Review state presence does not match': '复习状态已发生变化，请刷新后重试',
  'occurredAt precedes the latest practice': '提交时间早于最近一次练习记录，请刷新同步',
  'occurredAt is too far in the future': '设备时间异常，请校准系统时间后重试',
  'Lifecycle command fields are required': '复习提交参数不完整，请重试',
  'Cursor is invalid': '分页游标无效，请刷新页面',
}

function localizeProblemMessage(code: string | undefined, rawDetail: string, rawTitle: string): string {
  const exact = EXACT_PROBLEM_DETAIL_ZH[rawDetail]
  if (exact) return exact
  if (code === 'AI_STREAM_ERROR' || rawDetail === 'AI stream failed') {
    return 'AI 回复生成失败，请检查模型配置或稍后重试'
  }
  return rawDetail || rawTitle
}

export function parseProblemDetails(value: unknown, fallbackStatus = 500): ProblemDetails {
  const body = asRecord(value)
  const status = typeof body.status === 'number' ? body.status : fallbackStatus
  const code = typeof body.code === 'string' ? body.code : undefined
  const retryAfterSeconds = parseRetryAfter(body.retryAfterSeconds)
  const resetAt = typeof body.resetAt === 'string' && !Number.isNaN(Date.parse(body.resetAt))
    ? body.resetAt
    : undefined
  const rawTitle = typeof body.title === 'string' && body.title ? body.title : '请求失败'
  const rawDetail = typeof body.detail === 'string' && body.detail ? body.detail : rawTitle
  const title = code && isAiQuotaError(code)
    ? `${formatAiQuotaMessage(code)}${formatRetrySuffix(retryAfterSeconds, resetAt)}`
    : localizeProblemMessage(code, rawDetail, rawTitle)
  const detail = title
  const rawFieldErrors = Array.isArray(body.fieldErrors) ? body.fieldErrors : []
  const fieldErrors = rawFieldErrors.flatMap((entry) => {
    const item = asRecord(entry)
    if (typeof item.field !== 'string' || typeof item.message !== 'string') return []
    return [{ field: item.field, message: item.message, rejectedValue: item.rejectedValue }]
  })
  return {
    type: typeof body.type === 'string' ? body.type : undefined,
    title,
    status,
    detail,
    instance: typeof body.instance === 'string' ? body.instance : undefined,
    code,
    traceId: typeof body.traceId === 'string' ? body.traceId : undefined,
    fieldErrors,
    current: body.current,
    retryAfterSeconds,
    resetAt,
  }
}

export function assertDirectDto<T>(value: T): T {
  const record = asRecord(value)
  if ('code' in record && 'data' in record) {
    throw new ApiProblemError({
      title: 'Legacy response wrapper rejected',
      detail: 'The server returned an unsupported legacy Result response.',
      status: 500,
      code: 'UNSUPPORTED_RESPONSE_CONTRACT',
      fieldErrors: [],
    })
  }
  return value
}

export function createRefreshCoordinator<T>(refreshOperation: () => Promise<T>) {
  let inFlight: Promise<T> | null = null
  return {
    refresh(): Promise<T> {
      if (inFlight) return inFlight
      const current = Promise.resolve().then(refreshOperation)
      inFlight = current.finally(() => {
        if (inFlight === current || inFlight === wrapped) inFlight = null
      })
      const wrapped = inFlight
      return wrapped
    },
  }
}

export function normalizeCursor(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const cursor = String(value).trim()
  return cursor || null
}

export function dedupeEventKey(event: {
  type?: unknown
  resourceType?: unknown
  resourceId?: unknown
  cursor?: unknown
}): string {
  return [event.type, event.resourceType, event.resourceId, normalizeCursor(event.cursor)]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(':')
}


