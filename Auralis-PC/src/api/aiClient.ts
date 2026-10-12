import request, { refreshAccessToken } from './request.ts'
import { streamWithAccessTokenRefresh } from './authenticatedSse.ts'
import { getClientRuntimeConfig } from '../config/runtime.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import { fetchSseStream, parseSseStream, type AiStreamEvent, type SseEvent } from './sse.ts'
import type { components } from './generated/schema.ts'

export type AiSettingsView = components['schemas']['AiSettingsView']
export type AiSettingsCommand = components['schemas']['AiSettingsCommand']
export type ConversationView = components['schemas']['ConversationView']
export type ConversationCommand = components['schemas']['ConversationCommand']
export type MessageView = components['schemas']['MessageView']
export type AiMessageCommand = components['schemas']['AiMessageCommand']
export type CitationView = components['schemas']['CitationView']

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

export type CanonicalAiProvider = 'DEEPSEEK' | 'OPENAI_COMPATIBLE' | 'SILICONFLOW'

export interface AiModelListView {
  provider: CanonicalAiProvider
  models: string[]
}

export type AiConnectionTestView = components['schemas']['AiConnectionTestView']

export function normalizeProvider(provider: string): CanonicalAiProvider {
  const p = (provider || '').trim().toLowerCase()
  if (p.includes('deepseek')) return 'DEEPSEEK'
  if (p.includes('silicon') || p.includes('硅基')) return 'SILICONFLOW'
  return 'OPENAI_COMPATIBLE'
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await request.get('/actuator/health')
    return !!res
  } catch (e) {
    console.error('Backend health check failed:', e)
    return false
  }
}

export function getAiSettings(): Promise<AiSettingsView[]> {
  return request.get('/api/ai/settings') as unknown as Promise<AiSettingsView[]>
}

import { validateAiUsage } from '../services/aiUsageGuardHelper.ts'

export async function getAiUsage(): Promise<AiUsageView> {
  const res = await request.get('/api/ai/usage')
  return validateAiUsage(res)
}

export function updateAiSettings(data: AiSettingsCommand): Promise<AiSettingsView> {
  return request.put('/api/ai/settings', data) as unknown as Promise<AiSettingsView>
}

export function listAiModels(provider: CanonicalAiProvider): Promise<AiModelListView> {
  return request.get(`/api/ai/settings/${encodeURIComponent(provider)}/models`) as unknown as Promise<AiModelListView>
}

export function testAiConnection(provider: CanonicalAiProvider): Promise<AiConnectionTestView> {
  return request.post(`/api/ai/settings/${encodeURIComponent(provider)}/test-connection`) as unknown as Promise<AiConnectionTestView>
}

export function listConversations(): Promise<ConversationView[]> {
  return request.get('/api/ai/conversations') as unknown as Promise<ConversationView[]>
}

export function createConversation(data: ConversationCommand): Promise<ConversationView> {
  return request.post('/api/ai/conversations', data) as unknown as Promise<ConversationView>
}

export function getConversation(conversationId: string): Promise<ConversationView> {
  return request.get(`/api/ai/conversations/${encodeURIComponent(conversationId)}`) as unknown as Promise<ConversationView>
}

export function deleteConversation(conversationId: string, baseVersion: number): Promise<void> {
  return request.delete(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
    params: { baseVersion },
  }) as unknown as Promise<void>
}

/**
 * Streams AI message events via Server-Sent Events (SSE).
 * Returns an AsyncIterable of AiStreamEvent.
 */
export async function* streamAiMessage(
  data: AiMessageCommand,
  signal?: AbortSignal
): AsyncIterable<AiStreamEvent> {
  const runtime = getClientRuntimeConfig()
  let token: string | null = null
  try {
    const authStore = useAuthStore()
    token = authStore?.token ?? null
  } catch {
    // pinia may not be active in non-vue contexts
  }

  const url = `${runtime.apiBaseUrl.replace(/\/+$/, '')}/api/ai/messages/stream`

  const open = (accessToken: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    return fetchSseStream<unknown>(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
        },
        { signal }
      )
  }

  for await (const event of streamWithAccessTokenRefresh(token, open, refreshAccessToken, signal)) {
    if (event.event) yield { event: event.event, data: event.data } as AiStreamEvent
  }
}

export const useAiApi = {
  checkHealth,
  getAiSettings,
  getAiUsage,
  updateAiSettings,
  listAiModels,
  testAiConnection,
  normalizeProvider,
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  streamAiMessage,
}

export { parseSseStream, type AiStreamEvent, type SseEvent }
