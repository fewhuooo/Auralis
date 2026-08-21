import type { components } from './generated/schema'
import { aiApi } from './aiApi'
import { createSseDecoder } from './sse'
import { ApiProblemError, parseProblemDetails } from './protocol'
import { getRuntimeConfig } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'

type AiMessageCommand = components['schemas']['AiMessageCommand']
type Provider = NonNullable<AiMessageCommand['provider']>

export interface AiConfig {
  provider: Provider
  baseUrl: string
  model: string
  apiKey: string
  hasApiKey: boolean
}

let cachedConfig: AiConfig = {
  provider: 'OPENAI_COMPATIBLE',
  baseUrl: '',
  model: '',
  apiKey: '',
  hasApiKey: false,
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
  const updated = await aiApi.updateSettings({
    provider,
    baseUrl: config.baseUrl || cachedConfig.baseUrl || undefined,
    chatModel: config.model || cachedConfig.model || undefined,
    apiKey: config.apiKey || undefined,
  })
  cachedConfig = {
    provider: updated.provider || provider,
    baseUrl: updated.baseUrl || config.baseUrl || cachedConfig.baseUrl,
    model: updated.chatModel || config.model || cachedConfig.model,
    apiKey: '',
    hasApiKey: Boolean(updated.hasApiKey),
  }
}

function decodeChunk(value: unknown, decoder: TextDecoder): string {
  if (typeof value === 'string') return value
  if (value instanceof ArrayBuffer) return decoder.decode(new Uint8Array(value), { stream: true })
  return ''
}

async function streamMessage(
  body: AiMessageCommand,
  onMessage: (content: string) => void,
  retried = false,
): Promise<string> {
  const auth = useAuthStore()
  const runtime = getRuntimeConfig()
  return new Promise((resolve, reject) => {
    let content = ''
    let receivedChunk = false
    let settled = false
    const textDecoder = new TextDecoder('utf-8')
    const sse = createSseDecoder((event) => {
      if (event.event === 'message.delta' && typeof event.data === 'string') {
        content += event.data
        onMessage(event.data)
      }
      if (event.event === 'message.completed' && !content && event.data && typeof event.data === 'object') {
        const completed = event.data as { content?: unknown }
        if (typeof completed.content === 'string') {
          content = completed.content
          onMessage(completed.content)
        }
      }
      if (event.event === 'message.error' && !settled) {
        const value = event.data as { message?: string; detail?: string }
        settled = true
        reject(new Error(value?.message || value?.detail || 'AI stream failed'))
      }
    })
    const task = uni.request({
      url: `${runtime.apiBaseUrl}/api/ai/messages/stream`,
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
        if (response.statusCode === 401 && !retried && await auth.refreshAccessToken()) {
          settled = true
          try {
            resolve(await streamMessage(body, onMessage, true))
          } catch (error) {
            reject(error)
          }
          return
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          settled = true
          reject(new ApiProblemError(parseProblemDetails(response.data, response.statusCode)))
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

const conversationIds = new Map<string, string>()

async function conversationForCurrentUser(title: string): Promise<string> {
  const userId = useAuthStore().user?.id || 'anonymous'
  const existing = conversationIds.get(userId)
  if (existing) return existing
  const created = await aiApi.createConversation({ title, baseVersion: 0, clientRequestId: uuidv7() })
  if (!created.id) throw new Error('Conversation response is incomplete')
  conversationIds.set(userId, created.id)
  return created.id
}

export async function completeAiText(text: string): Promise<string> {
  return streamMessage({ content: text, retrievalEnabled: true, clientRequestId: uuidv7() }, () => undefined)
}

export async function transcribeAndExtractTasks(text: string) {
  const result = await completeAiText(`从以下备忘录提取待办任务，只返回 JSON：\n${text}`)
  return JSON.parse(result.replace(/^```json\s*|\s*```$/g, '').trim())
}

export function convertHandwritingToMarkdown(rawOcrText: string): Promise<string> {
  return completeAiText(`将以下文本整理为结构化 Markdown，只返回正文：\n${rawOcrText}`)
}

export async function chatWithAI(
  text: string,
  _history: unknown[],
  onMessage: (content: string) => void,
  conversationId?: string,
): Promise<void> {
  const activeConversationId = conversationId || await conversationForCurrentUser(text.slice(0, 60))
  await streamMessage({
    conversationId: activeConversationId,
    content: text,
    retrievalEnabled: true,
    topK: 8,
    clientRequestId: uuidv7(),
  }, onMessage)
}
