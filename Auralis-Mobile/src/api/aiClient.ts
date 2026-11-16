import { validateAiUsage, formatAiQuotaMessage, parseRetryAfter, formatRetrySuffix } from '../utils/aiUsageGuardHelper.ts'
import type { components } from './generated/schema'
import { aiApi } from './aiApi'
import { createSseDecoder } from './sse'
import { ApiProblemError, parseProblemDetails } from './protocol'
import mobileRequest from './request'
import { getRuntimeConfig } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'

type Provider = NonNullable<components['schemas']['AiSettingsCommand']['provider']>

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
  answer?: { optionKeys?: string[]; text?: string }
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

export async function setAiConfig(config: Partial<AiConfig>): Promise<void> {
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
}

function decodeChunk(value: unknown, decoder: TextDecoder): string {
  if (typeof value === 'string') return value
  if (value instanceof ArrayBuffer) return decoder.decode(new Uint8Array(value), { stream: true })
  return ''
}

export type ReadingContext = components['schemas']['ReadingContext']

export interface ChatToolEvent {
  phase: 'started' | 'completed' | 'error'
  name: string
  safeErrorCode?: string
}

export interface ChatWithAiOptions {
  readingContext?: ReadingContext
  selectionText?: string
  onToolEvent?: (event: ChatToolEvent) => void
}

async function streamMessage(
  body: Protocol1MessageCommand,
  onMessage: (content: string) => void,
  retried = false,
  expectedGeneration?: symbol,
  onToolEvent?: (event: ChatToolEvent) => void,
): Promise<string> {
  const auth = useAuthStore()
  const generation = expectedGeneration ?? auth.getLoginGeneration()
  const isCurrent = () => auth.getLoginGeneration() === generation
  if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
  const runtime = getRuntimeConfig()
  return new Promise((resolve, reject) => {
    let content = ''
    let activeAttempt = ''
    const seen = new Set<string>()
    let receivedChunk = false
    let settled = false
    const textDecoder = new TextDecoder('utf-8')
    const sse = createSseDecoder((event) => {
      if (!isCurrent()) return
      if (event.data && typeof event.data === 'object') {
        const envelope = event.data as ChatStreamEnvelope
        if (envelope.protocolVersion !== 1 || envelope.event !== event.event || envelope.conversationId !== body.conversationId) return
        if (activeAttempt && envelope.attemptId !== activeAttempt) return
        activeAttempt = envelope.attemptId
        const key = `${envelope.runId}:${envelope.attemptId}:${envelope.sequence}`
        if (seen.has(key)) return
        seen.add(key)
        const delta = envelope.payload.publicTextDelta
        if (typeof delta === 'string' && delta) {
          content += delta
          onMessage(delta)
        }
        if (event.event === 'tool.started' || event.event === 'tool.completed' || event.event === 'tool.error') {
          const toolName = typeof envelope.payload.name === 'string' ? envelope.payload.name : ''
          const safeErrorCode = typeof envelope.payload.safeErrorCode === 'string' ? envelope.payload.safeErrorCode : undefined
          onToolEvent?.({
            phase: event.event === 'tool.started' ? 'started' : event.event === 'tool.completed' ? 'completed' : 'error',
            name: toolName,
            safeErrorCode,
          })
        }
      }
      if (event.event === 'run.failed' && !settled) {
        const value = event.data as ChatStreamEnvelope
        settled = true
        const payload = value.payload as { safeErrorCode?: string; message?: string }
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
      enableChunked: true,
      header: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      data: body,
      async success(response: any) {
        if (settled) return
        if (!isCurrent()) {
          settled = true
          reject(new Error('登录状态已变化，请重试。'))
          return
        }
        if (response.statusCode === 401 && !retried) {
          try {
            const refreshed = await auth.refreshAccessToken()
            if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
            if (refreshed) {
              settled = true
              resolve(await streamMessage(body, onMessage, true, generation, onToolEvent))
              return
            }
            auth.expireSession(generation)
          } catch (error) {
            settled = true
            reject(error)
            return
          }
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          settled = true
          const problem = parseProblemDetails(response.data, response.statusCode)
          
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
        if (!receivedChunk) sse.push(decodeChunk(response.data, textDecoder))
        sse.finish()
        settled = true
        resolve(content)
      },
      fail(error) {
        if (!settled) reject(new Error(error.errMsg || 'Network Error'))
      },
    })
    const chunkedTask = task as typeof task & {
      onChunkReceived?(handler: (response: { data: unknown }) => void): void
    }
    chunkedTask.onChunkReceived?.((response) => {
      receivedChunk = true
      sse.push(decodeChunk(response.data, textDecoder))
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
  }, onMessage, false, undefined, options?.onToolEvent)
}




