import { getClientRuntimeConfig } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { ApiProblemError, toApiProblem } from './httpError.ts'
import { refreshAccessToken, SyncScopeChangedError, type SyncRequestScopeTicket } from './request.ts'
import { validateGeneratedOverviewResponse } from './overviewResponseValidator.ts'
import type { GeneratedOverviewResponse, OverviewMode, OverviewRequestContext } from '@/types/overview'

export interface OverviewSseTransportOptions {
  fetch?: typeof fetch
  refreshAccessToken?: (scope?: SyncRequestScopeTicket) => Promise<string>
  deadlineMs?: number
}

export interface SseErrorEventData {
  code?: string
  detail?: string
  status?: number
  retryAfterSeconds?: number
  resetAt?: string
}

export class OverviewSseTerminalError extends Error {
  readonly code: string
  readonly detail: string
  readonly status?: number
  readonly retryAfterSeconds?: number
  readonly resetAt?: string

  constructor(data: SseErrorEventData) {
    const rawCode = typeof data.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(data.code)
      ? data.code
      : 'OVERVIEW_GENERATION_FAILED'
    super(data.detail || `Overview generation failed: ${rawCode}`)
    this.name = 'OverviewSseTerminalError'
    this.code = rawCode
    this.detail = data.detail || this.message
    this.status = Number.isInteger(data.status) && Number(data.status) >= 400 && Number(data.status) <= 599
      ? Number(data.status)
      : undefined
    this.retryAfterSeconds = Number.isFinite(data.retryAfterSeconds) && Number(data.retryAfterSeconds) >= 0 && Number(data.retryAfterSeconds) <= 86_400
      ? Number(data.retryAfterSeconds)
      : undefined
    this.resetAt = typeof data.resetAt === 'string' && Number.isFinite(Date.parse(data.resetAt))
      ? data.resetAt
      : undefined
  }
}

export class OverviewSseProtocolError extends Error {
  readonly code = 'OVERVIEW_STATUS_UNKNOWN'

  constructor(message = 'SSE stream closed before terminal event') {
    super(message)
    this.name = 'OverviewSseProtocolError'
  }
}

function assertScopeCurrent(scope?: SyncRequestScopeTicket): void {
  if (scope && !scope.isCurrent()) {
    throw new SyncScopeChangedError()
  }
}

function parseDataValue(rawValue: string): unknown {
  const trimmed = rawValue.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return rawValue
  }
}

function defaultRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `overview-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getAuthToken(): string | null {
  try {
    return useAuthStore().token ?? null
  } catch {
    return null
  }
}

function createDeadlineError(deadlineMs: number): Error {
  const timeoutError = new Error(`Overview generation timed out after ${deadlineMs}ms`);
  (timeoutError as unknown as { code: string }).code = 'MODEL_TIMEOUT';
  return timeoutError;
}

function captureOverviewScope(): SyncRequestScopeTicket | undefined {
  try {
    const auth = useAuthStore()
    const captured = {
      userId: auth.user?.id ?? null,
      serverDeviceId: auth.serverDeviceId ?? null,
      sessionId: auth.sessionId ?? null,
      status: auth.authStatus,
    }
    return {
      key: Symbol('overview-request-scope'),
      isCurrent: () => {
        try {
          const current = useAuthStore()
          return current.user?.id === captured.userId
            && current.serverDeviceId === captured.serverDeviceId
            && current.sessionId === captured.sessionId
            && current.authStatus === captured.status
        } catch {
          return false
        }
      },
    }
  } catch {
    return undefined
  }
}

function awaitRefreshOrAbort(
  refresh: () => Promise<string>,
  signal: AbortSignal,
  callerSignal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const finish = (action: () => void) => {
      signal.removeEventListener('abort', onAbort)
      action()
    }
    const onAbort = () => finish(() => reject(
      callerSignal?.reason || signal.reason || new DOMException('Operation aborted', 'AbortError'),
    ))
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve().then(refresh).then(
      (token) => finish(() => resolve(token)),
      (error) => finish(() => reject(error)),
    )
  })
}

/**
 * Opts in to SSE structured overview generation via POST with Accept: text/event-stream.
 * Enforces:
 * - Configured positive absolute deadline across headers, refresh, and reading; 0 disables the timer
 * - SyncRequestScopeTicket assertion before transmission and after 401 refresh
 * - Terminal result validation through validateOverviewResponse
 * - Terminal error mapped safely
 * - Premature EOF as protocol failure
 * - Prompt AbortSignal cancellation of active fetch and reader
 */
export async function postOverviewSse<TRequest extends { mode: OverviewMode }>(
  path: string,
  request: TRequest,
  context?: OverviewRequestContext,
  options?: OverviewSseTransportOptions,
): Promise<GeneratedOverviewResponse> {
  const scope = context?.scope ?? captureOverviewScope()
  assertScopeCurrent(scope)

  const runtime = getClientRuntimeConfig()
  const deadlineMs = options?.deadlineMs ?? runtime.overviewSseDeadlineMs
  const internalController = new AbortController()
  let deadlineFired = false

  const deadlineTimer = deadlineMs > 0 ? setTimeout(() => {
    deadlineFired = true
    internalController.abort(createDeadlineError(deadlineMs))
  }, deadlineMs) : undefined

  const onCallerAbort = () => {
    internalController.abort(context?.signal?.reason)
  }
  if (context?.signal) {
    if (context.signal.aborted) {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer)
      throw context.signal.reason || new DOMException('Operation aborted', 'AbortError')
    }
    context.signal.addEventListener('abort', onCallerAbort, { once: true })
  }

  const fetchFn = options?.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!fetchFn) {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer)
    throw new Error('fetch is not available')
  }

  const doRefresh = options?.refreshAccessToken ?? refreshAccessToken
  const baseUrl = runtime.apiBaseUrl ? runtime.apiBaseUrl.replace(/\/+$/, '') : ''
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const requestId = context?.requestId ?? defaultRequestId()
  let hasRefreshed = false

  try {
    while (true) {
      assertScopeCurrent(scope)
      if (internalController.signal.aborted) {
        throw context?.signal?.reason || internalController.signal.reason || new DOMException('Operation aborted', 'AbortError')
      }
      const token = getAuthToken()

      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Overview-Request-Id': requestId,
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      let response: Response
      try {
        context?.onRequestDispatched?.()
        response = await fetchFn(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
          signal: internalController.signal,
        })
      } catch (networkError) {
        if (deadlineFired) {
          throw createDeadlineError(deadlineMs)
        }
        if (internalController.signal.aborted) {
          throw context?.signal?.reason || new DOMException('Operation aborted', 'AbortError')
        }
        throw networkError
      }

      if (response.status === 401 && !hasRefreshed && !internalController.signal.aborted) {
        hasRefreshed = true
        await awaitRefreshOrAbort(() => doRefresh(scope), internalController.signal, context?.signal)
        if (deadlineFired) {
          throw createDeadlineError(deadlineMs)
        }
        if (internalController.signal.aborted) {
          throw context?.signal?.reason || internalController.signal.reason || new DOMException('Operation aborted', 'AbortError')
        }
        assertScopeCurrent(scope)
        continue
      }

      if (!response.ok) {
        let errorBody: unknown
        try {
          errorBody = await response.json()
        } catch {
          try {
            errorBody = await response.text()
          } catch {
            errorBody = null
          }
        }
        const problem = toApiProblem({
          response: {
            status: response.status,
            data: errorBody,
            headers: Object.fromEntries(response.headers?.entries?.() ?? []),
          },
        })
        throw new ApiProblemError(problem)
      }

      if (!response.body) {
        throw new OverviewSseProtocolError('SSE response body is missing')
      }

      const reader = response.body.getReader()
      const onAbortCancelReader = () => {
        reader.cancel().catch(() => undefined)
      }
      internalController.signal.addEventListener('abort', onAbortCancelReader, { once: true })

      try {
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        let currentEvent: string | undefined
        let currentDataLines: string[] = []
        let terminalResult: GeneratedOverviewResponse | undefined
        let terminalError: SseErrorEventData | undefined

        const processLine = (line: string): void => {
          if (line === '') {
            if (currentDataLines.length === 0 && currentEvent === undefined) return
            const rawData = currentDataLines.join('\n')
            const parsed = parseDataValue(rawData)
            if (currentEvent === 'result') {
              terminalResult = validateGeneratedOverviewResponse(parsed, request.mode)
            } else if (currentEvent === 'error') {
              terminalError = (parsed && typeof parsed === 'object') ? parsed as SseErrorEventData : { detail: String(parsed) }
            }
            currentEvent = undefined
            currentDataLines = []
            return
          }

          if (line.startsWith(':')) {
            // Heartbeat comment line - ignored
            return
          }

          const colonIndex = line.indexOf(':')
          const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
          let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
          if (value.startsWith(' ')) value = value.slice(1)

          if (field === 'event') {
            currentEvent = value
          } else if (field === 'data') {
            currentDataLines.push(value)
          }
        }

        while (true) {
          if (internalController.signal.aborted) {
            break
          }
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          if (buffer.endsWith('\r') && value && value[0] === 0x0a) {
            buffer = buffer.slice(0, -1)
          }
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split(/\r\n|\n|\r(?!$)/)
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            processLine(line)
            if (terminalResult !== undefined || terminalError !== undefined) {
              break
            }
          }
          if (terminalResult !== undefined || terminalError !== undefined) {
            break
          }
        }

        if (terminalResult === undefined && terminalError === undefined && buffer.length > 0) {
          processLine(buffer)
          processLine('')
        }

        if (terminalError !== undefined) {
          throw new OverviewSseTerminalError(terminalError)
        }

        if (terminalResult !== undefined) {
          return terminalResult
        }

        if (deadlineFired) {
          throw createDeadlineError(deadlineMs)
        }

        if (internalController.signal.aborted) {
          throw context?.signal?.reason || new DOMException('Operation aborted', 'AbortError')
        }

        throw new OverviewSseProtocolError('SSE stream closed without terminal result or error')
      } finally {
        internalController.signal.removeEventListener('abort', onAbortCancelReader)
        await reader.cancel().catch(() => undefined)
        reader.releaseLock?.()
      }
    }
  } catch (error) {
    if (deadlineFired) {
      throw createDeadlineError(deadlineMs)
    }
    if (context?.signal?.aborted) {
      throw context.signal.reason || new DOMException('Operation aborted', 'AbortError')
    }
    throw error
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer)
    if (context?.signal) {
      context.signal.removeEventListener('abort', onCallerAbort)
    }
  }
}
