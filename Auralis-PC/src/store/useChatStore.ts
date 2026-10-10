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
import { classifyClientError, logClientError, toSafeClientError } from '@/services/clientErrorPolicy.ts'

export interface ChatRequestOptions {
  subjectId?: string
  sourceId?: string
  sourceIds?: string[]
  retrievalMode?: 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT' | 'NONE'
  context?: string
  topK?: number
  selectionText?: string
  /** Existing pending request to dispatch again; never creates a duplicate message. */
  pendingRequestId?: string
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
  purpose: 'GENERAL' | 'READING_SESSION'
  sourceId?: string
  subjectId?: string
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
    purpose: view.purpose || 'GENERAL',
    sourceId: view.sourceId,
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
    purpose: session.purpose,
    sourceId: session.sourceId,
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
  if (!auth.user?.id || !auth.serverDeviceId) throw new Error('Chat requires an authenticated user and device')
  return getLocalRepository(auth.user.id, auth.serverDeviceId)
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const activeSessionId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const citations = ref<AiStreamCitation[]>([])
  const lastError = ref<string | null>(null)
  const lastErrorCode = ref<string | null>(null)
  const controller = new AiStreamController()

  const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) || null)
  const pendingMessage = computed(() => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index]
      if (message.conversationId === activeSessionId.value && message.role === 'USER' && message.status === 'PENDING' && message.clientRequestId) {
        return message
      }
    }
    return null
  })

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
      purpose: session.purpose,
      sourceId: session.sourceId,
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
      purpose: view.purpose || session.purpose,
      sourceId: view.sourceId || session.sourceId,
      subjectId: session.subjectId,
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
      const safe = classifyClientError(error, 'CHAT')
      logClientError('[Chat] session load failed', error, safe)
      if (!safe.offline) throw toSafeClientError(error, 'CHAT')
      sessions.value = local
      lastError.value = safe.message
      lastErrorCode.value = safe.code
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
      const safe = classifyClientError(error, 'CHAT')
      logClientError('[Chat] message load failed', error, safe)
      if (!safe.offline) throw toSafeClientError(error, 'CHAT')
      messages.value = await localMessages(sessionId)
      lastError.value = safe.message
      lastErrorCode.value = safe.code
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
      purpose: 'GENERAL',
    }
    await cacheSession(session)
    replaceSession(session)
    activeSessionId.value = session.id
    messages.value = []
    lastError.value = null
    lastErrorCode.value = null
    return session.id
  }

  async function startReadingSession(sourceId: string, subjectId: string, title = '文件伴读'): Promise<string> {
    const now = new Date().toISOString()
    const session: ChatSession = {
      id: uuidv7(),
      creationRequestId: uuidv7(),
      title: title.trim().slice(0, 60) || '文件伴读',
      createdAt: now,
      updatedAt: now,
      version: 0,
      localOnly: true,
      purpose: 'READING_SESSION',
      sourceId,
      subjectId,
    }
    await cacheSession(session)
    replaceSession(session)
    activeSessionId.value = session.id
    messages.value = []
    lastError.value = null
    lastErrorCode.value = null
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
      const safe = classifyClientError(error, 'CHAT')
      logClientError('[Chat] session creation failed', error, safe)
      if (safe.offline) {
        lastError.value = safe.message
        lastErrorCode.value = safe.code
        return
      }
      lastError.value = safe.message
      lastErrorCode.value = safe.code
      throw toSafeClientError(error, 'CHAT')
    }

    if (!session.remoteId) return
    isStreaming.value = true
    streamingContent.value = ''
    citations.value = []
    const options = message.requestOptions || {}
    const referenceMode = options.retrievalMode ?? (options.sourceId && options.subjectId ? 'AUTO' : undefined)
    const readingContext = options.subjectId && referenceMode && referenceMode !== 'NONE'
      ? {
          currentSourceId: options.sourceId,
          subjectId: options.subjectId,
          retrievalMode: referenceMode,
          sourceIds: referenceMode === 'SELECTED_SOURCES' ? options.sourceIds : undefined,
          selectionText: options.selectionText?.slice(0, 4000),
        }
      : undefined
    try {
      const result = await controller.run({
        conversationId: session.remoteId,
        content: message.content,
        retrievalEnabled: referenceMode === 'NONE'
          ? false
          : referenceMode
            ? Boolean(readingContext)
            : Boolean(options.sourceId || options.selectionText || options.context),
        topK: options.topK ?? 8,
        clientRequestId: message.clientRequestId,
        readingContext,
        selectionText: options.selectionText ? options.selectionText.slice(0, 4000) : undefined,
      }, {
        onStarted: (data) => {
          const started = data as { messageId?: string } | undefined
          const startedUser = { ...message, serverMessageId: started?.messageId }
          void updateCachedMessage(startedUser)
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
      const completedUser = messages.value.find((item) => item.id === message.id)
      if (completedUser) await updateCachedMessage({ ...completedUser, status: 'COMPLETED' })
      lastError.value = null
      lastErrorCode.value = null
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError.value = '生成已取消'
        lastErrorCode.value = 'AI_REQUEST_FAILED'
        const assistant: ChatMessage = {
          id: uuidv7(), conversationId: message.conversationId, role: 'ASSISTANT', status: 'INTERRUPTED',
          content: streamingContent.value, createdAt: new Date().toISOString(), citations: citations.value,
        }
        messages.value.push(assistant)
        await cacheMessage(assistant)
      } else if (isOfflineTransportFailure(error)) {
        const safe = classifyClientError(error, 'CHAT')
        logClientError('[Chat] stream interrupted', error, safe)
        lastError.value = safe.message
        lastErrorCode.value = safe.code
      } else {
        const safe = classifyClientError(error, 'CHAT')
        logClientError('[Chat] request failed', error, safe)
        lastError.value = safe.message
        lastErrorCode.value = safe.code
        const assistant: ChatMessage = {
          id: uuidv7(), conversationId: message.conversationId, role: 'ASSISTANT', status: 'FAILED',
          content: '', createdAt: new Date().toISOString(), citations: citations.value,
        }
        messages.value.push(assistant)
        await cacheMessage(assistant)
        throw toSafeClientError(error, 'CHAT')
      }
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
    }
  }

  async function sendMessage(content: string, options: ChatRequestOptions = {}): Promise<void> {
    const text = content.trim()
    if (!text || isStreaming.value) return
    let message: ChatMessage | undefined
    if (options.pendingRequestId) {
      message = messages.value.find((item) =>
        item.conversationId === activeSessionId.value &&
        item.role === 'USER' &&
        item.status === 'PENDING' &&
        item.clientRequestId === options.pendingRequestId &&
        item.content === text,
      )
      if (!message) return
    } else {
      const { pendingRequestId: _pendingRequestId, ...messageOptions } = options
      message = await appendUserMessage(text, messageOptions)
    }
    if (!message) return
    await dispatchPendingMessage(message)
  }

  async function recoverOfflineSessions(): Promise<void> {
    const auth = useAuthStore()
    if (!auth.user?.id || !auth.serverDeviceId) return
    const local = sessions.value.length ? sessions.value : await localSessions()
    if (!sessions.value.length) sessions.value = local
    for (const session of local) {
      try {
        await ensureRemoteSession(session.id)
        const pending = (await localMessages(session.id)).filter((message) => message.role === 'USER' && message.status === 'PENDING')
        for (const message of pending) await dispatchPendingMessage(message)
      } catch (error) {
        const safe = classifyClientError(error, 'CHAT')
        logClientError('[Chat] offline recovery failed', error, safe)
        lastError.value = safe.message
        lastErrorCode.value = safe.code
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
    lastError.value = null
    lastErrorCode.value = null
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

  async function endActiveSession(): Promise<void> {
    const session = activeSession.value
    abortStream()
    if (!session) {
      clearActiveConversation()
      return
    }
    const targetSessionId = session.id
    try {
      await deleteSession(targetSessionId)
    } finally {
      if (activeSessionId.value === targetSessionId) {
        activeSessionId.value = null
        clearActiveConversation()
      }
    }
  }

  async function endSessionById(sessionId: string): Promise<void> {
    if (activeSessionId.value === sessionId) {
      abortStream()
    }
    try {
      await deleteSession(sessionId)
    } finally {
      if (activeSessionId.value === sessionId) {
        activeSessionId.value = null
        clearActiveConversation()
      }
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
    window.addEventListener('online', () => {
      void recoverOfflineSessions().catch(() => {
        console.warn('[Chat] online recovery failed')
      })
    })
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    pendingMessage,
    messages,
    isStreaming,
    streamingContent,
    citations,
    lastError,
    lastErrorCode,
    loadSessions,
    loadMessages,
    startNewSession,
    startReadingSession,
    appendUserMessage,
    sendMessage,
    recoverOfflineSessions,
    abortStream,
    clearActiveConversation,
    appendAssistantChunk,
    finalizeAssistantMessage,
    deleteSession,
    endActiveSession,
    endSessionById,
  }
})
