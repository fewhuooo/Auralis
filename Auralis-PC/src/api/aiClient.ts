import request from './request.ts'
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
export type SuggestionCommand = components['schemas']['SuggestionCommand']
export type SuggestionView = components['schemas']['SuggestionView']
export type CitationView = components['schemas']['CitationView']

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

export function updateAiSettings(data: AiSettingsCommand): Promise<AiSettingsView> {
  return request.put('/api/ai/settings', data) as unknown as Promise<AiSettingsView>
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

export function getSuggestions(data: SuggestionCommand): Promise<SuggestionView> {
  return request.post('/api/ai/suggestions', data) as unknown as Promise<SuggestionView>
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const sseIterable = fetchSseStream<unknown>(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    },
    { signal }
  )

  for await (const event of sseIterable) {
    if (event.event) {
      yield { event: event.event, data: event.data } as AiStreamEvent
    }
  }
}

export const useAiApi = {
  checkHealth,
  getAiSettings,
  updateAiSettings,
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  getSuggestions,
  streamAiMessage,
}

export { parseSseStream, type AiStreamEvent, type SseEvent }
