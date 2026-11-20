import { validateAiUsage, formatAiQuotaMessage, parseRetryAfter, formatRetrySuffix } from '../utils/aiUsageGuardHelper.ts'
import type { components } from './generated/schema'
import { aiApi, type AiSettingsView } from './aiApi'
import { createSseDecoder, decodeStreamChunk } from './sse'
import { ApiProblemError, parseProblemDetails } from './protocol'
import mobileRequest from './request'
import { getRuntimeConfig } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'

type Provider = NonNullable<components['schemas']['AiSettingsCommand']['provider']>

export type ChatActivityAnswer = string | readonly string[]

export interface Protocol1MessageCommand {
  protocolVersion: 1
  action: 'turn' | 'activity_submission'
  conversationId: string
  requestId: string
  content?: string
  readingContext?: components['schemas']['ReadingContext']
  selectionText?: string
  activityId?: string
  questionVersion?: number
  submissionId?: string
  answer?: ChatActivityAnswer
}

export interface ChatStreamEnvelope {
  protocolVersion: 1
  conversationId: string
  requestId: string
  runId: string
  attemptId: string
  userMessageId: string
  replyMessageId: string
  sequence: number
  event: string
  payload: Record<string, unknown>
}

export interface AiConfig {
  provider: Provider
  baseUrl: string
  model: string
  apiKey: string
  hasApiKey: boolean
}

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

let cachedConfig: AiConfig = {
  provider: 'OPENAI_COMPATIBLE',
  baseUrl: '',
  model: '',
  apiKey: '',
  hasApiKey: false,
}

export async function getAiUsage(): Promise<AiUsageView> {
  const response = await mobileRequest.get<unknown>('/api/ai/usage')
  return validateAiUsage(response)
}

export const getAiConfig = () => ({ ...cachedConfig })

export async function refreshAiConfig(): Promise<AiConfig> {
  const settings = await aiApi.getSettings()
  const current = settings.find(item => item.provider === cachedConfig.provider) || settings[0]
  if (current) {
    cachedConfig = {
      provider: current.provider || 'OPENAI_COMPATIBLE',
      baseUrl: current.baseUrl || '',
      model: current.chatModel || '',
      apiKey: '',
      hasApiKey: Boolean(current.hasApiKey),
    }
  }
  return getAiConfig()
}

export async function setAiConfig(config: Partial<AiConfig>): Promise<AiSettingsView> {
  const provider = config.provider || cachedConfig.provider
  const baseUrl = config.baseUrl !== undefined ? (config.baseUrl || undefined) : (cachedConfig.baseUrl || undefined)
  const chatModel = config.model !== undefined ? (config.model || undefined) : (cachedConfig.model || undefined)
  const updated = await aiApi.updateSettings({
    provider,
    baseUrl,
    chatModel,
    apiKey: config.apiKey || undefined,
  })
  cachedConfig = {
    provider: updated.provider || provider,
    baseUrl: updated.baseUrl ?? config.baseUrl ?? '',
    model: updated.chatModel ?? config.model ?? '',
    apiKey: '',
    hasApiKey: Boolean(updated.hasApiKey),
  }
  return updated
}

function isEmptyResponsePayload(data: unknown): boolean {
  if (data == null || data === '') return true
  if (data instanceof ArrayBuffer) return data.byteLength === 0
  if (ArrayBuffer.isView(data)) return data.byteLength === 0
  return false
}

function resolveErrorPayload(responseData: unknown, chunkedText: string): unknown {
  if (isEmptyResponsePayload(responseData) && chunkedText.trim()) {
    try {
      return JSON.parse(chunkedText)
    } catch {
      return chunkedText
    }
  }
  if (typeof responseData === 'string' && responseData.trim()) {
    try {
      return JSON.parse(responseData)
    } catch {
      return responseData
    }
  }
  if (responseData instanceof ArrayBuffer || ArrayBuffer.isView(responseData)) {
    const errDecoder = new TextDecoder('utf-8')
    const decoded = decodeStreamChunk(responseData, errDecoder) + errDecoder.decode()
    if (!decoded.trim()) return responseData
    try {
      return JSON.parse(decoded)
    } catch {
      return decoded
    }
  }
  return responseData
}

export type ReadingContext = components['schemas']['ReadingContext']

export interface ChatToolEvent {
  phase: 'started' | 'completed' | 'error'
  toolCallId?: string
  name: string
  label?: string
  safeErrorCode?: string
}

export type ChatRunTerminalStatus = 'COMPLETED' | 'CANCELLED' | 'UNKNOWN' | 'FAILED'

export interface ChatWithAiOptions {
  readingContext?: ReadingContext
  selectionText?: string
  onEnvelope?: (envelope: ChatStreamEnvelope) => void
  onToolEvent?: (event: ChatToolEvent) => void
  onReasoningDelta?: (delta: string) => void
  onRunStarted?: (info: { runId: string; attemptId: string }) => void
  onTerminal?: (info: { status: ChatRunTerminalStatus; safeErrorCode?: string }) => void
  onAbortReady?: (abortLocal: () => void) => void
}

function buildAiStreamError(
  payload: unknown,
  statusCode: number,
  retryAfterHeader?: string,
): ApiProblemError {
  const problem = parseProblemDetails(payload, statusCode)
  const quotaTitle = formatAiQuotaMessage(problem.code)
  let title = quotaTitle === 'AI 请求失败' ? (problem.title || 'AI stream failed') : quotaTitle

  let parsedRetryAfter = parseRetryAfter(problem.retryAfterSeconds)
  if (parsedRetryAfter === undefined && retryAfterHeader) {
    parsedRetryAfter = parseRetryAfter(retryAfterHeader)
  }
  if (quotaTitle !== 'AI 请求失败') {
    title += formatRetrySuffix(parsedRetryAfter, problem.resetAt)
    problem.title = title
    problem.detail = title
  }
  problem.retryAfterSeconds = parsedRetryAfter

  if ([
    'AI_REQUEST_BUDGET_EXCEEDED',
    'AI_TASK_BUDGET_EXCEEDED',
    'AI_CONCURRENCY_LIMIT',
    'AI_HOURLY_QUOTA_EXCEEDED',
    'AI_DAILY_QUOTA_EXCEEDED',
    'AI_GLOBAL_QUOTA_EXCEEDED',
  ].includes(problem.code || '')) {
    problem.detail = problem.title
  }
  return new ApiProblemError(problem)
}

function createChatStreamSession(
  conversationId: string,
  isCurrent: () => boolean,
  isManuallyAborted: () => boolean,
  onMessage: (content: string) => void,
  options: ChatWithAiOptions | undefined,
  onFailed: (error: ApiProblemError) => void,
) {
  let content = ''
  let activeAttempt = ''
  let notifiedRunId = ''
  const seen = new Set<string>()
  const sse = createSseDecoder((event) => {
    if (!isCurrent() || isManuallyAborted()) return
    if (event.data && typeof event.data === 'object') {
      const envelope = event.data as ChatStreamEnvelope
      if (envelope.protocolVersion !== 1 || envelope.event !== event.event || envelope.conversationId !== conversationId) return
      if (activeAttempt && envelope.attemptId !== activeAttempt) return
      activeAttempt = envelope.attemptId
      const key = `${envelope.runId}:${envelope.attemptId}:${envelope.sequence}`
      if (seen.has(key)) return
      seen.add(key)

      if (envelope.runId && envelope.runId !== notifiedRunId) {
        notifiedRunId = envelope.runId
        options?.onRunStarted?.({ runId: envelope.runId, attemptId: envelope.attemptId || '' })
      }

      options?.onEnvelope?.(envelope)

      if (event.event === 'reasoning.delta') {
        const reasoningText = envelope.payload.text
        if (typeof reasoningText === 'string' && reasoningText) {
          options?.onReasoningDelta?.(reasoningText)
        }
      }

      const delta = typeof envelope.payload.publicTextDelta === 'string'
        ? envelope.payload.publicTextDelta
        : (event.event === 'text.delta' && typeof envelope.payload.text === 'string' ? envelope.payload.text : '')
      if (delta) {
        content += delta
        onMessage(delta)
      }

      if (event.event === 'tool.started' || event.event === 'tool.completed' || event.event === 'tool.error') {
        const toolCallId = typeof envelope.payload.toolCallId === 'string' ? envelope.payload.toolCallId : undefined
        const toolName = typeof envelope.payload.name === 'string' ? envelope.payload.name : ''
        const toolLabel = typeof envelope.payload.label === 'string' && envelope.payload.label.trim()
          ? envelope.payload.label.trim()
          : undefined
        const safeErrorCode = typeof envelope.payload.safeErrorCode === 'string' ? envelope.payload.safeErrorCode : undefined
        options?.onToolEvent?.({
          phase: event.event === 'tool.started' ? 'started' : event.event === 'tool.completed' ? 'completed' : 'error',
          toolCallId,
          name: toolName,
          ...(toolLabel ? { label: toolLabel } : {}),
          safeErrorCode,
        })
      }

      if (event.event === 'run.completed') {
        options?.onTerminal?.({ status: 'COMPLETED' })
      } else if (event.event === 'run.cancelled') {
        options?.onTerminal?.({ status: 'CANCELLED' })
      } else if (event.event === 'run.unknown') {
        const safeErrorCode = typeof envelope.payload.safeErrorCode === 'string' ? envelope.payload.safeErrorCode : undefined
        options?.onTerminal?.({ status: 'UNKNOWN', safeErrorCode })
      }
    }
    if (event.event === 'run.failed') {
      const value = event.data as ChatStreamEnvelope
      const payload = value.payload as { safeErrorCode?: string; message?: string }
      options?.onTerminal?.({ status: 'FAILED', safeErrorCode: payload?.safeErrorCode })
      onFailed(new ApiProblemError(parseProblemDetails({
        status: 500,
        title: payload?.message || 'AI stream failed',
        detail: payload?.message || '',
        code: payload?.safeErrorCode || 'AI_REQUEST_FAILED',
      }, 500)))
    }
  })

  return {
    sse,
    getContent: () => content,
  }
}

/* #ifdef H5 */
async function streamMessageViaFetch(
  endpointPath: string,
  conversationId: string,
  body: Protocol1MessageCommand | { requestId: string },
  onMessage: (content: string) => void,
  retried: boolean,
  expectedGeneration: symbol | undefined,
  options: ChatWithAiOptions | undefined,
): Promise<string> {
  const auth = useAuthStore()
  const generation = expectedGeneration ?? auth.getLoginGeneration()
  const isCurrent = () => auth.getLoginGeneration() === generation
  if (!isCurrent()) throw new Error('登录状态已变化，请重试。')

  const runtime = getRuntimeConfig()
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let manuallyAborted = false
  let streamFailure: ApiProblemError | null = null

  const { sse, getContent } = createChatStreamSession(
    conversationId,
    isCurrent,
    () => manuallyAborted,
    onMessage,
    options,
    (err) => {
      if (!streamFailure) {
        streamFailure = err
        controller?.abort()
      }
    },
  )

  options?.onAbortReady?.(() => {
    manuallyAborted = true
    controller?.abort()
  })

  try {
    const response = await fetch(`${runtime.apiBaseUrl.replace(/\/+$/, '')}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Accept-Encoding': 'identity',
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    })

    if (manuallyAborted) return getContent()
    if (!isCurrent()) throw new Error('登录状态已变化，请重试。')

    if (response.status === 401 && !retried) {
      const refreshed = await auth.refreshAccessToken()
      if (manuallyAborted) return getContent()
      if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
      if (refreshed) {
        await response.body?.cancel?.().catch(() => {})
        return streamMessageViaFetch(endpointPath, conversationId, body, onMessage, true, generation, options)
      }
      auth.expireSession(generation)
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      if (manuallyAborted) return getContent()
      if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
      const retryAfterHeader = response.headers?.get?.('retry-after') ?? undefined
      throw buildAiStreamError(resolveErrorPayload(errText, errText), response.status, retryAfterHeader)
    }

    const textDecoder = new TextDecoder('utf-8')
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
        if (manuallyAborted || streamFailure) break
        const chunkText = decodeStreamChunk(value, textDecoder)
        if (chunkText) {
          sse.push(chunkText)
        }
      }
      if (streamFailure) throw streamFailure
      if (manuallyAborted) return getContent()
      if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
      const tail = textDecoder.decode()
      if (tail) sse.push(tail)
      sse.finish()
      if (streamFailure) throw streamFailure
      return getContent()
    }

    const fullText = await response.text()
    if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
    if (manuallyAborted) return getContent()
    const tail = textDecoder.decode()
    if (fullText || tail) {
      sse.push(fullText + tail)
    }
    sse.finish()
    if (streamFailure) throw streamFailure
    return getContent()
  } catch (error) {
    if (streamFailure) throw streamFailure
    if (manuallyAborted) return getContent()
    throw error
  }
}
/* #endif */

async function streamMessage(
  endpointPath: string,
  conversationId: string,
  body: Protocol1MessageCommand | { requestId: string },
  onMessage: (content: string) => void,
  retried = false,
  expectedGeneration?: symbol,
  options?: ChatWithAiOptions,
): Promise<string> {
  /* #ifdef H5 */
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof fetch === 'function') {
    return streamMessageViaFetch(endpointPath, conversationId, body, onMessage, retried, expectedGeneration, options)
  }
  /* #endif */

  const auth = useAuthStore()
  const generation = expectedGeneration ?? auth.getLoginGeneration()
  const isCurrent = () => auth.getLoginGeneration() === generation
  if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
  const runtime = getRuntimeConfig()
  return new Promise((resolve, reject) => {
    let receivedChunk = false
    let rawChunkText = ''
    let settled = false
    let manuallyAborted = false
    const textDecoder = new TextDecoder('utf-8')
    const appendRawChunk = (chunkText: string) => {
      if (!chunkText || rawChunkText.length >= 65_536) return
      rawChunkText += chunkText.slice(0, 65_536 - rawChunkText.length)
    }
    const { sse, getContent } = createChatStreamSession(
      conversationId,
      isCurrent,
      () => manuallyAborted,
      onMessage,
      options,
      (error) => {
        if (settled) return
        settled = true
        reject(error)
      },
    )
    const task = uni.request({
      url: `${runtime.apiBaseUrl.replace(/\/+$/, '')}${endpointPath}`,
      method: 'POST',
      timeout: 330_000,
      enableChunked: true,
      header: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      data: body,
      async success(response: any) {
        if (settled || manuallyAborted) return
        if (!isCurrent()) {
          settled = true
          reject(new Error('登录状态已变化，请重试。'))
          return
        }
        if (response.statusCode === 401 && !retried) {
          try {
            const refreshed = await auth.refreshAccessToken()
            if (manuallyAborted || settled) return
            if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
            if (refreshed) {
              settled = true
              streamMessage(endpointPath, conversationId, body, onMessage, true, generation, options).then(resolve, reject)
              return
            }
            auth.expireSession(generation)
          } catch (error) {
            if (manuallyAborted || settled) return
            settled = true
            reject(error)
            return
          }
        }
        const tail = textDecoder.decode()
        appendRawChunk(tail)
        if (response.statusCode < 200 || response.statusCode >= 300) {
          settled = true
          const headers = (response.header || {}) as Record<string, string>
          const retryAfterKey = Object.keys(headers).find(k => k.toLowerCase() === 'retry-after')
          reject(buildAiStreamError(
            resolveErrorPayload(response.data, rawChunkText),
            response.statusCode,
            retryAfterKey ? headers[retryAfterKey] : undefined,
          ))
          return
        }
        if (receivedChunk) {
          if (tail) sse.push(tail)
        } else {
          const full = decodeStreamChunk(response.data, textDecoder) + tail
          if (full) sse.push(full)
        }
        sse.finish()
        if (!settled) {
          settled = true
          resolve(getContent())
        }
      },
      fail(error) {
        if (settled) return
        if (manuallyAborted) {
          settled = true
          resolve(getContent())
          return
        }
        settled = true
        reject(new Error(error.errMsg || 'Network Error'))
      },
    })
    options?.onAbortReady?.(() => {
      if (settled) return
      manuallyAborted = true
      settled = true
      const abortable = task as typeof task & { abort?: () => void }
      abortable.abort?.()
      resolve(getContent())
    })
    const chunkedTask = task as typeof task & {
      onChunkReceived?(handler: (response: { data: unknown }) => void): void
    }
    chunkedTask.onChunkReceived?.((response) => {
      if (manuallyAborted) return
      receivedChunk = true
      const chunkText = decodeStreamChunk(response.data, textDecoder)
      if (!chunkText) return
      appendRawChunk(chunkText)
      sse.push(chunkText)
    })
  })
}

export async function chatWithAI(
  text: string,
  _history: unknown[],
  onMessage: (content: string) => void,
  conversationId: string,
  options?: ChatWithAiOptions,
): Promise<void> {
  if (!conversationId) throw new Error('A conversationId is required for chat')
  await streamMessage('/api/ai/messages/stream', conversationId, {
    protocolVersion: 1,
    action: 'turn',
    conversationId,
    requestId: uuidv7(),
    content: text,
    ...(options?.readingContext ? { readingContext: options.readingContext } : {}),
    ...(options?.selectionText ? { selectionText: options.selectionText } : {}),
  }, onMessage, false, undefined, options)
}

export interface ChatActivitySubmissionPayload {
  activityId: string
  questionVersion: number
  submissionId: string
  answer: ChatActivityAnswer
}

export async function submitChatActivity(
  conversationId: string,
  payload: ChatActivitySubmissionPayload,
  onMessage: (content: string) => void,
  options?: ChatWithAiOptions,
): Promise<void> {
  if (!conversationId) throw new Error('A conversationId is required for activity submission')
  await streamMessage('/api/ai/messages/stream', conversationId, {
    protocolVersion: 1,
    action: 'activity_submission',
    conversationId,
    requestId: uuidv7(),
    activityId: payload.activityId,
    questionVersion: payload.questionVersion,
    submissionId: payload.submissionId,
    answer: payload.answer,
  }, onMessage, false, undefined, options)
}

export async function retryChatRun(
  conversationId: string,
  runId: string,
  onMessage: (content: string) => void,
  options?: ChatWithAiOptions,
): Promise<void> {
  if (!conversationId || !runId) throw new Error('ConversationId and runId are required for retry')
  await streamMessage(
    `/api/ai/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/attempts`,
    conversationId,
    { requestId: uuidv7() },
    onMessage,
    false,
    undefined,
    options,
  )
}




