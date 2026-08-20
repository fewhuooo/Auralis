import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationCommand,
  type ConversationView,
  type MessageView,
} from '@/api/aiClient'
import { useAuthStore } from '@/store/useAuthStore'
import { getLocalRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { AiStreamController } from '@/services/aiStreamController'
import type { AiStreamCitation } from '@/api/sse'
import { uuidv7 } from '@/utils/uuid'

export interface ChatSession {
  id: string
  title: string
  createdAt?: string
  updatedAt?: string
  version: number
  localOnly: boolean
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  status: 'COMPLETED' | 'INTERRUPTED' | 'FAILED' | 'PENDING'
  content: string
  messageSequence?: number
  createdAt?: string
  citations: AiStreamCitation[]
}

function isOfflineLike(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    return !Number.isFinite(status) || status >= 500
  }
  return true
}

function mapSession(view: ConversationView, localOnly = false): ChatSession | null {
  if (!view.id) return null
  return {
    id: view.id,
    title: view.title || '新会话',
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    version: view.version ?? 0,
    localOnly,
  }
}

function mapMessage(view: MessageView, conversationId: string): ChatMessage | null {
  if (!view.id) return null
  return {
    id: view.id,
    conversationId,
    role: view.role || 'ASSISTANT',
    status: view.status || 'COMPLETED',
    content: view.content || '',
    messageSequence: view.messageSequence,
    createdAt: view.createdAt,
    citations: [],
  }
}

async function currentRepository(): Promise<LocalRepository> {
  const auth = useAuthStore()
  if (!auth.user?.id || !auth.deviceId) throw new Error('Chat requires an authenticated user and device')
  return getLocalRepository(auth.user.id, auth.deviceId)
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const activeSessionId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const citations = ref<AiStreamCitation[]>([])
  const lastError = ref<string | null>(null)
  const controller = new AiStreamController()

  const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) || null)

  async function cacheSession(view: ConversationView, localOnly = false): Promise<ChatSession | null> {
    const session = mapSession(view, localOnly)
    if (!session) return null
    const repo = await currentRepository()
    await repo.upsert('CONVERSATION', session.id, view, {
      version: session.version,
      deletedAt: view.deletedAt ?? null,
      syncStatus: localOnly ? 'pending' : 'synced',
    })
    return session
  }

  async function localSessions(): Promise<ChatSession[]> {
    const repo = await currentRepository()
    const rows = await repo.list<ConversationView>('CONVERSATION', { includeDeleted: false })
    return rows
      .map((row) => mapSession(row.value, row.syncStatus !== 'synced'))
      .filter((session): session is ChatSession => session !== null)
  }

  async function loadSessions(): Promise<ChatSession[]> {
    try {
      const views = await listConversations()
      const loaded: ChatSession[] = []
      for (const view of views ?? []) {
        const session = await cacheSession(view)
        if (session) loaded.push(session)
      }
      sessions.value = loaded
      return loaded
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      sessions.value = await localSessions()
      lastError.value = error instanceof Error ? error.message : '会话加载失败，当前使用本地缓存'
      return sessions.value
    }
  }

  async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
    activeSessionId.value = sessionId
    try {
      const view = await getConversation(sessionId)
      const loaded = (view.messages ?? []).map((message) => mapMessage(message, sessionId)).filter((message): message is ChatMessage => message !== null)
      messages.value = loaded
      await cacheSession(view)
      return loaded
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      const session = sessions.value.find((item) => item.id === sessionId)
      messages.value = session ? [] : []
      lastError.value = error instanceof Error ? error.message : '消息加载失败'
      return messages.value
    }
  }

  async function startNewSession(userInput = ''): Promise<string> {
    const title = userInput.trim().slice(0, 30) || '新会话'
    const payload: ConversationCommand = { title, baseVersion: 0 }
    try {
      const view = await createConversation(payload)
      const session = await cacheSession(view)
      if (!session) throw new Error('Conversation response missing id')
      sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)]
      activeSessionId.value = session.id
      messages.value = []
      return session.id
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      const id = uuidv7()
      const now = new Date().toISOString()
      const session = await cacheSession({ id, title, version: 0, createdAt: now, updatedAt: now, messages: [] }, true)
      if (!session) throw new Error('Unable to create local conversation')
      sessions.value = [session, ...sessions.value]
      activeSessionId.value = id
      messages.value = []
      lastError.value = '当前离线，会话将在恢复网络后创建'
      return id
    }
  }

  async function appendUserMessage(content: string): Promise<string> {
    if (!activeSessionId.value) await startNewSession(content)
    const message: ChatMessage = {
      id: uuidv7(),
      conversationId: activeSessionId.value as string,
      role: 'USER',
      status: 'PENDING',
      content,
      createdAt: new Date().toISOString(),
      citations: [],
    }
    messages.value.push(message)
    return message.id
  }

  async function sendMessage(content: string, options: { subjectId?: string; context?: string; topK?: number } = {}): Promise<void> {
    const text = content.trim()
    if (!text || isStreaming.value) return
    await appendUserMessage(text)
    const conversationId = activeSessionId.value
    if (!conversationId) throw new Error('Conversation is not available')
    isStreaming.value = true
    streamingContent.value = ''
    citations.value = []
    lastError.value = null
    const userMessage = messages.value[messages.value.length - 1]
    if (userMessage?.role === 'USER') userMessage.status = 'COMPLETED'
    try {
      const result = await controller.run({
        conversationId,
        content: options.context ? `${options.context}\n\n${text}` : text,
        retrievalEnabled: Boolean(options.subjectId || options.context),
        topK: options.topK ?? 8,
        clientRequestId: uuidv7(),
      }, {
        onDelta: (delta) => { streamingContent.value += delta },
        onCitation: (citation) => {
          citations.value = [...citations.value, citation]
        },
      })
      if (result.content) {
        messages.value.push({
          id: uuidv7(),
          conversationId,
          role: 'ASSISTANT',
          status: 'COMPLETED',
          content: result.content,
          createdAt: new Date().toISOString(),
          citations: result.citations,
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError.value = '生成已取消'
        messages.value.push({ id: uuidv7(), conversationId, role: 'ASSISTANT', status: 'INTERRUPTED', content: streamingContent.value, createdAt: new Date().toISOString(), citations: citations.value })
      } else {
        lastError.value = error instanceof Error ? error.message : 'AI 请求失败'
        messages.value.push({ id: uuidv7(), conversationId, role: 'ASSISTANT', status: 'FAILED', content: '', createdAt: new Date().toISOString(), citations: citations.value })
        throw error
      }
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
    }
  }

  function abortStream(): void {
    controller.abort()
  }

  function clearActiveConversation(): void {
    messages.value = []
    streamingContent.value = ''
    citations.value = []
  }

  async function deleteSession(sessionId: string): Promise<void> {
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) return
    if (!session.localOnly) await deleteConversation(sessionId, session.version)
    const repo = await currentRepository()
    const cached = await repo.read<ConversationView>('CONVERSATION', sessionId)
    if (cached) await repo.tombstone('CONVERSATION', sessionId, { version: session.version + 1, syncStatus: 'synced' })
    sessions.value = sessions.value.filter((item) => item.id !== sessionId)
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = null
      messages.value = []
    }
  }

  function appendAssistantChunk(chunk: string): void {
    streamingContent.value += chunk
    isStreaming.value = true
  }

  async function finalizeAssistantMessage(): Promise<void> {
    isStreaming.value = false
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    messages,
    isStreaming,
    streamingContent,
    citations,
    lastError,
    loadSessions,
    loadMessages,
    startNewSession,
    appendUserMessage,
    sendMessage,
    abortStream,
    clearActiveConversation,
    appendAssistantChunk,
    finalizeAssistantMessage,
    deleteSession,
  }
})
