import request, { refreshAccessToken } from './request.ts'
import { streamWithAccessTokenRefresh } from './authenticatedSse.ts'
import { getClientRuntimeConfig } from '../config/runtime.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import { fetchSseStream, parseSseStream, type SseEvent } from './sse.ts'
import type { components } from './generated/schema.ts'
import type {
  ChatStreamEnvelope,
  ChatConversationDetail,
  ChatConversationListItem,
  ChatRunStatus,
  ChatActivityAnswer,
  ActiveChatRun,
} from '@/types/chatProtocol'

export type {
  ChatStreamEnvelope,
  ChatConversationDetail,
  ChatConversationListItem,
  ChatRunStatus,
  ChatActivityAnswer,
  ActiveChatRun,
}

export type AiSettingsView = components['schemas']['AiSettingsView']
export type AiSettingsCommand = components['schemas']['AiSettingsCommand']
export type ConversationView = components['schemas']['ConversationView']
export type ConversationCommand = components['schemas']['ConversationCommand']
export type MessageView = components['schemas']['MessageView']
export type AiMessageCommand = components['schemas']['AiMessageCommand']
export type CitationView = components['schemas']['CitationView']

export interface ReadingContextDto {
  subjectId: string
  currentSourceId?: string | null
  retrievalMode: 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT'
  sourceIds?: string[]
  selectionText?: string
}

export interface Protocol1MessageCommand {
  protocolVersion: 1
  action: 'turn' | 'activity_submission'
  conversationId: string
  requestId: string
  content?: string
  readingContext?: ReadingContextDto
  selectionText?: string
  activityId?: string
  questionVersion?: number
  submissionId?: string
  answer?: ChatActivityAnswer
}

export interface TextGenerationCommand {
  operation: 'summary' | 'extract' | 'format' | 'transcript'
  input: string
  requestId?: string
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

export function listConversations(): Promise<ChatConversationListItem[]> {
  return request.get('/api/ai/conversations') as unknown as Promise<ChatConversationListItem[]>
}

export function createConversation(data: ConversationCommand): Promise<ConversationView> {
  return request.post('/api/ai/conversations', data) as unknown as Promise<ConversationView>
}

export function getConversation(conversationId: string): Promise<ChatConversationDetail> {
  return request.get(`/api/ai/conversations/${encodeURIComponent(conversationId)}`) as unknown as Promise<ChatConversationDetail>
}

export function getChatRunStatus(conversationId: string, runId: string): Promise<ChatRunStatus> {
  return request.get(`/api/ai/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}`) as unknown as Promise<ChatRunStatus>
}

export function cancelChatRun(conversationId: string, runId: string): Promise<ChatRunStatus> {
  return request.post(`/api/ai/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/cancel`) as unknown as Promise<ChatRunStatus>
}

export function recoverChatRunAttempt(
  conversationId: string,
  runId: string,
  attemptId: string
): Promise<ChatRunStatus> {
  return request.post(
    `/api/ai/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/attempts/${encodeURIComponent(attemptId)}/recover`
  ) as unknown as Promise<ChatRunStatus>
}

export function retryChatRun(conversationId: string, runId: string, requestId: string, signal?: AbortSignal): AsyncIterable<ChatStreamEnvelope> {
  return streamChatRequest(`/api/ai/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/attempts`, { requestId }, signal)
}

export async function generateAiText(command: TextGenerationCommand): Promise<string> {
  const result = (await request.post('/api/ai/text-generations', command)) as { text?: string }
  if (typeof result?.text !== 'string') throw new Error('Text generation response is incomplete')
  return result.text
}

export function deleteConversation(conversationId: string, baseVersion: number): Promise<void> {
  return request.delete(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
    params: { baseVersion },
  }) as unknown as Promise<void>
}

/**
 * Streams AI message events via Server-Sent Events (SSE).
 * Yields only valid protocolVersion 1 envelopes.
 */
async function* streamChatRequest(
  path: string,
  data: Protocol1MessageCommand | { requestId: string },
  signal?: AbortSignal
): AsyncIterable<ChatStreamEnvelope> {
  const runtime = getClientRuntimeConfig()
  let token: string | null = null
  try {
    const authStore = useAuthStore()
    token = authStore?.token ?? null
  } catch {
    // pinia may not be active in non-vue contexts
  }

  const url = `${runtime.apiBaseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`

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
    if (event.event && event.data && typeof event.data === 'object') {
      const envelope = event.data as ChatStreamEnvelope
      if (envelope.protocolVersion === 1 && envelope.event === event.event) {
        yield envelope
      }
    }
  }
}

export function streamAiMessage(data: Protocol1MessageCommand, signal?: AbortSignal): AsyncIterable<ChatStreamEnvelope> {
  return streamChatRequest('/api/ai/messages/stream', data, signal)
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
  getChatRunStatus,
  cancelChatRun,
  recoverChatRunAttempt,
  retryChatRun,
  generateAiText,
}

export { parseSseStream, type SseEvent }
