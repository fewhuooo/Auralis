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
}

export class ApiProblemError extends Error {
  readonly problem: ProblemDetails
  readonly status: number
  readonly code?: string
  readonly fieldErrors: ApiFieldError[]

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title)
    this.name = 'ApiProblemError'
    this.problem = problem
    this.status = problem.status
    this.code = problem.code
    this.fieldErrors = problem.fieldErrors
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function parseProblemDetails(value: unknown, fallbackStatus = 500): ProblemDetails {
  const body = asRecord(value)
  const status = typeof body.status === 'number' ? body.status : fallbackStatus
  const title = typeof body.title === 'string' && body.title ? body.title : 'Request failed'
  const detail = typeof body.detail === 'string' && body.detail ? body.detail : title
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
    code: typeof body.code === 'string' ? body.code : undefined,
    traceId: typeof body.traceId === 'string' ? body.traceId : undefined,
    fieldErrors,
    current: body.current,
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
