import request, { captureAuthSession, refreshInSession, SyncScopeChangedError } from './request.ts'
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

export function deleteConversation(conversationId: string, baseVersion: number): Promise<void> {
  return request.delete(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
    params: { baseVersion },
  }) as unknown as Promise<void>
}

/**
 * Streams AI message events via Server-Sent Events (SSE).
 * Yields only valid protocolVersion 1 envelopes.
 */
function streamChatRequest(
  path: string,
  data: Protocol1MessageCommand | { requestId: string },
  signal?: AbortSignal
): AsyncIterable<ChatStreamEnvelope> {
  const runtime = getClientRuntimeConfig()
  const authStore = useAuthStore()
  const session = captureAuthSession(authStore)
  const token = authStore.token
  const assertSessionCurrent = () => {
    if (!session.isCurrent()) throw new SyncScopeChangedError()
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

  return (async function* () {
    const stream = streamWithAccessTokenRefresh(token, open, () => refreshInSession(session), signal, assertSessionCurrent)
    for await (const event of stream) {
      assertSessionCurrent()
      if (event.event && event.data && typeof event.data === 'object') {
        const envelope = event.data as ChatStreamEnvelope
        if (envelope.protocolVersion === 1 && envelope.event === event.event) {
          yield envelope
        }
      }
    }
  })()
}

export function streamAiMessage(data: Protocol1MessageCommand, signal?: AbortSignal): AsyncIterable<ChatStreamEnvelope> {
  return streamChatRequest('/api/ai/messages/stream', data, signal)
}

export const useAiApi = {
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
}

export { parseSseStream, type SseEvent }
