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

export interface Protocol1MessageCommand {
  protocolVersion: 1
  action: 'turn'
  conversationId: string
  requestId: string
  content: string
  readingContext?: components['schemas']['ReadingContext']
  selectionText?: string
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
  safeErrorCode?: string
}

export type ChatRunTerminalStatus = 'COMPLETED' | 'CANCELLED' | 'UNKNOWN' | 'FAILED'

export interface ChatWithAiOptions {
  readingContext?: ReadingContext
  selectionText?: string
  onToolEvent?: (event: ChatToolEvent) => void
  onReasoningDelta?: (delta: string) => void
  onRunStarted?: (info: { runId: string; attemptId: string }) => void
  onTerminal?: (info: { status: ChatRunTerminalStatus; safeErrorCode?: string }) => void
  onAbortReady?: (abortLocal: () => void) => void
}

async function streamMessage(
  body: Protocol1MessageCommand,
  onMessage: (content: string) => void,
  retried = false,
  expectedGeneration?: symbol,
  options?: ChatWithAiOptions,
): Promise<string> {
  const auth = useAuthStore()
  const generation = expectedGeneration ?? auth.getLoginGeneration()
  const isCurrent = () => auth.getLoginGeneration() === generation
  if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
  const runtime = getRuntimeConfig()
  return new Promise((resolve, reject) => {
    let content = ''
    let activeAttempt = ''
    let notifiedRunId = ''
    const seen = new Set<string>()
    let receivedChunk = false
    let rawChunkText = ''
    let settled = false
    let manuallyAborted = false
    const textDecoder = new TextDecoder('utf-8')
    const appendRawChunk = (chunkText: string) => {
      if (!chunkText || rawChunkText.length >= 65_536) return
      rawChunkText += chunkText.slice(0, 65_536 - rawChunkText.length)
    }
    const sse = createSseDecoder((event) => {
      if (!isCurrent() || manuallyAborted) return
      if (event.data && typeof event.data === 'object') {
        const envelope = event.data as ChatStreamEnvelope
        if (envelope.protocolVersion !== 1 || envelope.event !== event.event || envelope.conversationId !== body.conversationId) return
        if (activeAttempt && envelope.attemptId !== activeAttempt) return
        activeAttempt = envelope.attemptId
        const key = `${envelope.runId}:${envelope.attemptId}:${envelope.sequence}`
        if (seen.has(key)) return
        seen.add(key)

        if (envelope.runId && envelope.runId !== notifiedRunId) {
          notifiedRunId = envelope.runId
          options?.onRunStarted?.({ runId: envelope.runId, attemptId: envelope.attemptId || '' })
        }

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
          const safeErrorCode = typeof envelope.payload.safeErrorCode === 'string' ? envelope.payload.safeErrorCode : undefined
          options?.onToolEvent?.({
            phase: event.event === 'tool.started' ? 'started' : event.event === 'tool.completed' ? 'completed' : 'error',
            toolCallId,
            name: toolName,
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
      if (event.event === 'run.failed' && !settled) {
        const value = event.data as ChatStreamEnvelope
        settled = true
        const payload = value.payload as { safeErrorCode?: string; message?: string }
        options?.onTerminal?.({ status: 'FAILED', safeErrorCode: payload?.safeErrorCode })
        reject(new ApiProblemError(parseProblemDetails({
          status: 500,
          title: payload?.message || 'AI stream failed',
          detail: payload?.message || '',
          code: payload?.safeErrorCode || 'AI_REQUEST_FAILED',
        }, 500)))
      }
    })
    const task = uni.request({
      url: `${runtime.apiBaseUrl.replace(/\/+$/, '')}/api/ai/messages/stream`,
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
              streamMessage(body, onMessage, true, generation, options).then(resolve, reject)
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
          const problem = parseProblemDetails(resolveErrorPayload(response.data, rawChunkText), response.statusCode)
          
          const quotaTitle = formatAiQuotaMessage(problem.code)
          let title = quotaTitle === 'AI 请求失败' ? (problem.title || 'AI stream failed') : quotaTitle
          
          let parsedRetryAfter = parseRetryAfter(problem.retryAfterSeconds);
          if (parsedRetryAfter === undefined && response.header) {
              const headers = response.header as Record<string, string>
              const retryAfterHeader = Object.keys(headers).find(k => k.toLowerCase() === 'retry-after')
              if (retryAfterHeader) {
                  parsedRetryAfter = parseRetryAfter(headers[retryAfterHeader])
              }
          }
          if (quotaTitle !== 'AI 请求失败') {
            title += formatRetrySuffix(parsedRetryAfter, problem.resetAt)
            problem.title = title
            problem.detail = title
          }
          problem.retryAfterSeconds = parsedRetryAfter
          
          if (['AI_REQUEST_BUDGET_EXCEEDED', 'AI_TASK_BUDGET_EXCEEDED', 'AI_CONCURRENCY_LIMIT', 'AI_HOURLY_QUOTA_EXCEEDED', 'AI_DAILY_QUOTA_EXCEEDED', 'AI_GLOBAL_QUOTA_EXCEEDED'].includes(problem.code || '')) {
            problem.detail = problem.title
          }
          reject(new ApiProblemError(problem))
          return
        }
        if (receivedChunk) {
          if (tail) sse.push(tail)
        } else {
          const full = decodeStreamChunk(response.data, textDecoder) + tail
          if (full) sse.push(full)
        }
        sse.finish()
        settled = true
        resolve(content)
      },
      fail(error) {
        if (settled) return
        if (manuallyAborted) {
          settled = true
          resolve(content)
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
      resolve(content)
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
  await streamMessage({
    protocolVersion: 1,
    action: 'turn',
    conversationId,
    requestId: uuidv7(),
    content: text,
    ...(options?.readingContext ? { readingContext: options.readingContext } : {}),
    ...(options?.selectionText ? { selectionText: options.selectionText } : {}),
  }, onMessage, false, undefined, options)
}




