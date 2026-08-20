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
import { isOfflineTransportFailure } from '@/services/offlineWritePolicy'

export interface ChatRequestOptions {
  subjectId?: string
  context?: string
  topK?: number
}

export interface ChatSession {
  /** Local identity stays stable before the server conversation is created. */
  id: string
  remoteId?: string
  creationRequestId: string
  title: string
  createdAt?: string
  updatedAt?: string
  version: number
  localOnly: boolean
}

export interface ChatMessage {
  id: string
  conversationId: string
  serverMessageId?: string
  /** Reused for every retry of this prompt. */
  clientRequestId?: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  status: 'COMPLETED' | 'INTERRUPTED' | 'FAILED' | 'PENDING'
  content: string
  messageSequence?: number
  createdAt?: string
  citations: AiStreamCitation[]
  requestOptions?: ChatRequestOptions
}

type CachedConversation = ConversationView & {
  remoteId?: string
  creationRequestId?: string
}

function mapSession(view: CachedConversation, localOnly = false, localId = view.id): ChatSession | null {
  if (!localId) return null
  const remoteId = view.remoteId || (!localOnly ? view.id : undefined)
  return {
    id: localId,
    remoteId,
    creationRequestId: view.creationRequestId || uuidv7(),
    title: view.title || '新会话',
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    version: view.version ?? 0,
    localOnly: !remoteId,
  }
}

function sessionValue(session: ChatSession): CachedConversation {
  return {
    id: session.id,
    remoteId: session.remoteId,
    creationRequestId: session.creationRequestId,
    title: session.title,
    version: session.version,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    deletedAt: undefined,
    messages: [],
  }
}

function mapMessage(view: MessageView, conversationId: string): ChatMessage | null {
  if (!view.id) return null
  return {
    id: view.id,
    serverMessageId: view.id,
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

  async function cacheSession(session: ChatSession, syncStatus: 'synced' | 'pending' = session.localOnly ? 'pending' : 'synced'): Promise<void> {
    const repo = await currentRepository()
    await repo.upsert('CONVERSATION', session.id, sessionValue(session), {
      version: session.version,
      deletedAt: null,
      syncStatus,
    })
  }

  async function cacheMessage(message: ChatMessage, syncStatus: 'synced' | 'pending' = message.status === 'PENDING' ? 'pending' : 'synced'): Promise<void> {
    const repo = await currentRepository()
    await repo.upsert('CHAT_MESSAGE', message.id, message, {
      version: message.messageSequence ?? 0,
      deletedAt: null,
      syncStatus,
    })
  }

  async function localSessions(): Promise<ChatSession[]> {
    const repo = await currentRepository()
    const rows = await repo.list<CachedConversation>('CONVERSATION', { includeDeleted: false })
    return rows
      .map((row) => mapSession(row.value, row.syncStatus !== 'synced', row.id))
      .filter((session): session is ChatSession => session !== null)
  }

  async function localMessages(sessionId: string): Promise<ChatMessage[]> {
    const repo = await currentRepository()
    const rows = await repo.list<ChatMessage>('CHAT_MESSAGE', { includeDeleted: false })
    return rows
      .map((row) => row.value)
      .filter((message): message is ChatMessage => Boolean(message) && message.conversationId === sessionId)
      .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
  }

  function replaceSession(session: ChatSession): void {
    sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)]
  }

  async function ensureRemoteSession(localId: string): Promise<ChatSession> {
    const session = sessions.value.find((item) => item.id === localId)
    if (!session) throw new Error('Conversation is not available')
    if (session.remoteId) return session

    const view = await createConversation({
      title: session.title,
      baseVersion: 0,
      clientRequestId: session.creationRequestId,
    } satisfies ConversationCommand)
    if (!view.id) throw new Error('Conversation response missing id')
    const remote: ChatSession = {
      ...session,
      remoteId: view.id,
      localOnly: false,
      title: view.title || session.title,
      version: view.version ?? session.version,
      createdAt: view.createdAt || session.createdAt,
      updatedAt: view.updatedAt || session.updatedAt,
    }
    await cacheSession(remote)
    replaceSession(remote)
    return remote
  }

  async function loadSessions(): Promise<ChatSession[]> {
    const local = await localSessions()
    try {
      const views = await listConversations()
      const remote: ChatSession[] = []
      for (const view of views ?? []) {
        if (!view.id) continue
        const existing = local.find((session) => session.remoteId === view.id || (!session.localOnly && session.id === view.id))
        const session = mapSession({ ...view, remoteId: view.id, creationRequestId: existing?.creationRequestId }, false, existing?.id || view.id)
        if (!session) continue
        await cacheSession(session)
        remote.push(session)
      }
      const pending = local.filter((session) => !session.remoteId)
      sessions.value = [...remote, ...pending.filter((session) => !remote.some((item) => item.id === session.id))]
      return sessions.value
    } catch (error) {
      if (!isOfflineTransportFailure(error)) throw error
      sessions.value = local
      lastError.value = error instanceof Error ? error.message : '会话加载失败，当前使用本地缓存'
      return local
    }
  }

  async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
    activeSessionId.value = sessionId
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session?.remoteId) {
      messages.value = await localMessages(sessionId)
      return messages.value
    }
    try {
      const view = await getConversation(session.remoteId)
      const remoteMessages = (view.messages ?? [])
        .map((message) => mapMessage(message, sessionId))
        .filter((message): message is ChatMessage => message !== null)
      for (const message of remoteMessages) await cacheMessage(message)
      const local = await localMessages(sessionId)
      const retainedPending = local.filter((message) => message.status === 'PENDING' && !message.serverMessageId)
      messages.value = [...remoteMessages, ...retainedPending]
        .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
      return messages.value
    } catch (error) {
      if (!isOfflineTransportFailure(error)) throw error
      messages.value = await localMessages(sessionId)
      lastError.value = error instanceof Error ? error.message : '消息加载失败'
      return messages.value
    }
  }

  async function startNewSession(userInput = ''): Promise<string> {
    const now = new Date().toISOString()
    const session: ChatSession = {
      id: uuidv7(),
      creationRequestId: uuidv7(),
      title: userInput.trim().slice(0, 30) || '新会话',
      createdAt: now,
      updatedAt: now,
      version: 0,
      localOnly: true,
    }
    await cacheSession(session)
    replaceSession(session)
    activeSessionId.value = session.id
    messages.value = []
    return session.id
  }

  async function appendUserMessage(content: string, options: ChatRequestOptions = {}): Promise<ChatMessage> {
    if (!activeSessionId.value) await startNewSession(content)
    const message: ChatMessage = {
      id: uuidv7(),
      conversationId: activeSessionId.value as string,
      clientRequestId: uuidv7(),
      role: 'USER',
      status: 'PENDING',
      content,
      createdAt: new Date().toISOString(),
      citations: [],
      requestOptions: { ...options },
    }
    await cacheMessage(message)
    messages.value.push(message)
    return message
  }

  async function updateCachedMessage(message: ChatMessage): Promise<void> {
    const index = messages.value.findIndex((item) => item.id === message.id)
    if (index >= 0) messages.value[index] = message
    await cacheMessage(message, message.status === 'PENDING' ? 'pending' : 'synced')
  }

  async function dispatchPendingMessage(message: ChatMessage): Promise<void> {
    let session: ChatSession
    try {
      session = await ensureRemoteSession(message.conversationId)
    } catch (error) {
      if (!isOfflineTransportFailure(error)) throw error
      lastError.value = '当前离线，消息会在恢复网络后继续发送'
      return
    }

    if (!session.remoteId) return
    isStreaming.value = true
    streamingContent.value = ''
    citations.value = []
    lastError.value = null
    const options = message.requestOptions || {}
    try {
      const result = await controller.run({
        conversationId: session.remoteId,
        content: options.context ? `${options.context}\n\n${message.content}` : message.content,
        retrievalEnabled: Boolean(options.subjectId || options.context),
        topK: options.topK ?? 8,
        clientRequestId: message.clientRequestId,
      }, {
        onStarted: (data) => {
          const started = data as { messageId?: string } | undefined
          const completedUser = { ...message, serverMessageId: started?.messageId, status: 'COMPLETED' as const }
          void updateCachedMessage(completedUser)
        },
        onDelta: (delta) => { streamingContent.value += delta },
        onCitation: (citation) => { citations.value = [...citations.value, citation] },
      })
      if (result.content) {
        const assistant: ChatMessage = {
          id: uuidv7(),
          conversationId: message.conversationId,
          role: 'ASSISTANT',
          status: 'COMPLETED',
          content: result.content,
          createdAt: new Date().toISOString(),
          citations: result.citations,
        }
        messages.value.push(assistant)
        await cacheMessage(assistant)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError.value = '生成已取消'
        const assistant: ChatMessage = {
          id: uuidv7(), conversationId: message.conversationId, role: 'ASSISTANT', status: 'INTERRUPTED',
          content: streamingContent.value, createdAt: new Date().toISOString(), citations: citations.value,
        }
        messages.value.push(assistant)
        await cacheMessage(assistant)
      } else if (isOfflineTransportFailure(error)) {
        lastError.value = '网络中断，消息会使用相同请求 ID 重试'
      } else {
        lastError.value = error instanceof Error ? error.message : 'AI 请求失败'
        const assistant: ChatMessage = {
          id: uuidv7(), conversationId: message.conversationId, role: 'ASSISTANT', status: 'FAILED',
          content: '', createdAt: new Date().toISOString(), citations: citations.value,
        }
        messages.value.push(assistant)
        await cacheMessage(assistant)
        throw error
      }
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
    }
  }

  async function sendMessage(content: string, options: ChatRequestOptions = {}): Promise<void> {
    const text = content.trim()
    if (!text || isStreaming.value) return
    const message = await appendUserMessage(text, options)
    await dispatchPendingMessage(message)
  }

  async function recoverOfflineSessions(): Promise<void> {
    const local = sessions.value.length ? sessions.value : await localSessions()
    if (!sessions.value.length) sessions.value = local
    for (const session of local) {
      try {
        await ensureRemoteSession(session.id)
        const pending = (await localMessages(session.id)).filter((message) => message.role === 'USER' && message.status === 'PENDING')
        for (const message of pending) await dispatchPendingMessage(message)
      } catch (error) {
        if (!isOfflineTransportFailure(error)) lastError.value = error instanceof Error ? error.message : '离线会话恢复失败'
      }
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
    if (session.remoteId) await deleteConversation(session.remoteId, session.version)
    const repo = await currentRepository()
    await repo.tombstone('CONVERSATION', sessionId, { version: session.version + 1, syncStatus: 'synced' })
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

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { void recoverOfflineSessions() })
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
    recoverOfflineSessions,
    abortStream,
    clearActiveConversation,
    appendAssistantChunk,
    finalizeAssistantMessage,
    deleteSession,
  }
})
