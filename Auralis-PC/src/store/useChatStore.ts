import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  cancelChatRun,
  createConversation,
  deleteConversation,
  getChatRunStatus,
  getConversation,
  listConversations,
  recoverChatRunAttempt,
  retryChatRun,
  type ChatConversationDetail,
  type Protocol1MessageCommand,
  type ReadingContextDto,
} from '@/api/aiClient'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'
import { AiStreamController } from '@/services/aiStreamController'
import { createChatStreamState, reduceChatStreamEvent, setPart, type ChatStreamState } from '@/services/aiStreamReducer'
import { projectChatContentParts } from '@/services/chatContentProjection'
import type { ChatActivityAnswer, ChatActivityDraft, ChatBlockPart, ChatContentPart } from '@/types/chatContent'
import type { ChatScopeState, ChatConversationScope } from '@/types/chatProtocol'

export interface ChatRequestOptions {
  subjectId?: string
  sourceId?: string
  sourceIds?: string[]
  retrievalMode?: 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT'
  topK?: number
  selectionText?: string
}

export interface ActiveRunState {
  conversationId: string
  runId: string
  requestId: string
  executionActive: boolean
  status?: string
  currentAttemptId?: string
}

export function buildReadingContext(options: ChatRequestOptions): ReadingContextDto | undefined {
  if (!options.subjectId) return undefined

  const retrievalMode =
    options.retrievalMode || (options.sourceId ? 'AUTO' : options.subjectId ? 'SUBJECT' : undefined)
  if (!retrievalMode) return undefined

  if (retrievalMode === 'SUBJECT') {
    return {
      subjectId: options.subjectId,
      retrievalMode: 'SUBJECT',
      currentSourceId: null,
      sourceIds: [],
      selectionText: options.selectionText?.slice(0, 4000),
    }
  }

  if (retrievalMode === 'AUTO') {
    return {
      subjectId: options.subjectId,
      retrievalMode: 'AUTO',
      currentSourceId: options.sourceId || null,
      sourceIds: [],
      selectionText: options.selectionText?.slice(0, 4000),
    }
  }

  if (retrievalMode === 'SELECTED_SOURCES') {
    return {
      subjectId: options.subjectId,
      retrievalMode: 'SELECTED_SOURCES',
      currentSourceId: null,
      sourceIds: Array.isArray(options.sourceIds) ? [...options.sourceIds] : [],
      selectionText: options.selectionText?.slice(0, 4000),
    }
  }

  return undefined
}

export function isScopeMatching(scope: ChatConversationScope | null | undefined, options: ChatRequestOptions): boolean {
  if (!scope) return false
  const reqContext = buildReadingContext(options)
  if (!reqContext) return false
  if (scope.retrievalMode !== reqContext.retrievalMode) return false
  if ((scope.subjectId || null) !== (reqContext.subjectId || null)) return false
  if ((scope.currentSourceId || null) !== (reqContext.currentSourceId || null)) return false
  const scopeIds = [...(scope.sourceIds || [])].sort()
  const reqIds = [...(reqContext.sourceIds || [])].sort()
  if (scopeIds.length !== reqIds.length) return false
  return scopeIds.every((id, idx) => id === reqIds[idx])
}

export interface ChatSession {
  id: string
  remoteId: string
  title: string
  createdAt?: string
  updatedAt?: string
  version: number
  chatProtocolVersion: number | null
  chatSupported: boolean
  subjectId?: string
  chatScopeState?: ChatScopeState
  chatScope?: ChatConversationScope | null
}

export interface ChatMessage {
  id: string
  conversationId: string
  serverMessageId?: string
  clientRequestId?: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  status: 'COMPLETED' | 'INTERRUPTED' | 'FAILED' | 'PENDING'
  content: string
  parts: ChatContentPart[]
  reasoningText?: string
  runId?: string
  attemptId?: string
  executionActive?: boolean
  tools?: ChatStreamState['tools']
  messageSequence?: number
  createdAt?: string
  requestOptions?: ChatRequestOptions
  submissionId?: string
  activityId?: string
  questionVersion?: number
  answerPayload?: ChatActivityAnswer
}

const controller = new AiStreamController()

function mapSafeErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case 'CHAT_ATTEMPT_NOT_DISPATCHED':
      return '生成未派发，请重试。'
    case 'CHAT_RUN_FAILED':
    case 'AI_REQUEST_FAILED':
      return 'AI 请求生成失败，请重试。'
    case 'STREAM_TRUNCATED':
      return '连接异常中断，未收到结束确认。'
    case 'RATE_LIMIT_EXCEEDED':
      return '用量限额已达上限，请稍后再试。'
    case 'CONTEXT_WINDOW_EXCEEDED':
      return '上下文长度超出限制。'
    case 'CHAT_UNKNOWN_ABANDONED':
      return '原会话状态异常已恢复结束，可点击重试。'
    case 'CHAT_RECOVERY_NOT_ALLOWED':
      return '当前尝试状态不可恢复或已变更。'
    case 'CHAT_SCOPE_CONFLICT':
      return '当前会话已固定资料范围，无法切换范围提问。请开启新会话。'
    case 'CHAT_SCOPE_LEGACY':
      return '此历史会话未绑定资料范围，不可继续提问。请开启新会话。'
    default:
      return '生成遇到问题，请重试。'
  }
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const activeSessionId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const streamingReasoning = ref('')
  const streamingParts = ref<readonly ChatContentPart[]>([])
  const streamingTools = ref<ChatStreamState['tools']>([])
  const lastError = ref<string | null>(null)
  const lastErrorCode = ref<string | null>(null)
  const activeRun = ref<ActiveRunState | null>(null)
  const isRecovering = ref(false)
  const activityDrafts = ref<Record<string, ChatActivityDraft>>({})
  let activeRetryAbortController: AbortController | null = null

  const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) || null)
  // Both PENDING/FAILED user turns and FAILED/INTERRUPTED assistant replies expose retry entry points
  const isLegacySession = computed(() => activeSession.value?.chatScopeState === 'LEGACY')
  const isBoundSession = computed(() => activeSession.value?.chatScopeState === 'BOUND')

  const pendingMessage = computed(() => {
    if (activeSession.value?.chatScopeState === 'LEGACY') return null
    return (
      [...messages.value]
        .reverse()
        .find((message) => {
          if (message.role === 'USER' && (message.status === 'PENDING' || message.status === 'FAILED')) {
            return true
          }
          if (message.role === 'ASSISTANT' && (message.status === 'FAILED' || message.status === 'INTERRUPTED')) {
            return true
          }
          return false
        }) || null
    )
  })

  function mapSession(
    view: {
      id: string
      title?: string
      version?: number
      chatProtocolVersion?: number | null
      chatSupported?: boolean
      createdAt?: string
      updatedAt?: string
      chatScopeState?: ChatScopeState
      chatScope?: ChatConversationScope | null
    },
    subjectId?: string
  ): ChatSession {
    return {
      id: view.id,
      remoteId: view.id,
      title: view.title || '新会话',
      version: view.version || 0,
      chatProtocolVersion: view.chatProtocolVersion ?? null,
      chatSupported: Boolean(view.chatSupported),
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
      subjectId,
      chatScopeState: view.chatScopeState || 'UNBOUND',
      chatScope: view.chatScope ?? null,
    }
  }

  function mapMessage(view: ChatConversationDetail['messages'][number], conversationId: string): ChatMessage {
    const rawParts = Array.isArray(view.parts) ? view.parts : []
    const parts = projectChatContentParts(rawParts).map((part) => {
      if (part.kind === 'block' && part.state === 'GENERATING' && view.status !== 'PENDING') {
        return { ...part, state: 'INVALID' as const }
      }
      return part
    })
    // Ensure historical messages with plain text or legacy content always project a visible text part
    if (parts.length === 0 && view.content) {
      parts.push({
        id: `${view.id}:text`,
        kind: 'text',
        text: view.content,
      })
    }
    return {
      id: view.id,
      serverMessageId: view.id,
      conversationId,
      role: view.role,
      status: view.status,
      content: view.content || '',
      parts,
      reasoningText: view.reasoningText || '',
      tools: view.tools || [],
      messageSequence: view.messageSequence,
      createdAt: view.createdAt,
    }
  }

  async function loadSessions(): Promise<ChatSession[]> {
    const views = await listConversations()
    sessions.value = (views || []).map((view) => mapSession(view))
    return sessions.value
  }

  async function pollRunStatusUntilSettled(conversationId: string, runId: string, targetSessionId: string): Promise<void> {
    const maxAttempts = 60
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      // Stop polling if user switched away to a different session
      if (activeSessionId.value !== targetSessionId) return
      try {
        const status = await getChatRunStatus(conversationId, runId)
        if (status.status === 'UNKNOWN') {
          // UNKNOWN requires explicit user recovery action; stop polling immediately
          if (activeRun.value && activeRun.value.runId === runId) {
            activeRun.value.status = 'UNKNOWN'
            activeRun.value.currentAttemptId = status.currentAttemptId || activeRun.value.currentAttemptId
          }
          isStreaming.value = false
          return
        }
        if (!status.executionActive) {
          activeRun.value = null
          isStreaming.value = false
          // Refresh canonical detail now that execution settled
          const freshDetail = await getConversation(conversationId).catch(() => null)
          if (freshDetail && activeSessionId.value === targetSessionId) {
            messages.value = (freshDetail.messages || []).map((message) => mapMessage(message, targetSessionId))
          }
          return
        }
      } catch {
        // Continue trying until settled or maxAttempts
      }
    }
  }

  async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
    abortStream()
    lastError.value = null
    lastErrorCode.value = null
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) throw new Error('Conversation is not available')
    activeSessionId.value = sessionId

    if (!session.chatSupported || session.chatProtocolVersion !== 1) {
      messages.value = []
      lastError.value = '此历史会话不可继续。请开始新会话。'
      lastErrorCode.value = 'CHAT_PROTOCOL_UNSUPPORTED'
      return messages.value
    }

    const detail = await getConversation(session.remoteId)
    if (detail.chatScopeState) {
      session.chatScopeState = detail.chatScopeState
      session.chatScope = detail.chatScope ?? null
    }
    if (session.chatScopeState === 'LEGACY') {
      lastError.value = '此历史会话未绑定资料范围，不可继续提问。请开始新会话。'
      lastErrorCode.value = 'CHAT_SCOPE_LEGACY'
    }
    messages.value = (detail.messages || []).map((message) => mapMessage(message, session.id))

    // Restore top-level activeRun from ConversationView including public snapshot
    if (detail.activeRun) {
      const run = detail.activeRun
      const replyId = run.currentReplyMessageId
      const exists = messages.value.some((m) => m.id === replyId || m.serverMessageId === replyId)

      if (!exists && replyId) {
        const snapshotParts = projectChatContentParts(run.publicSnapshot || [])
        const snapshotTools = Array.isArray(run.toolTrace)
          ? run.toolTrace.map((t: Record<string, unknown>) => ({
              id: String(t.id || t.toolCallId || ''),
              name: String(t.name || '工具'),
              status: (t.status === 'FAILED' ? 'FAILED' : t.status === 'RUNNING' ? 'RUNNING' : 'COMPLETED') as
                | 'RUNNING'
                | 'COMPLETED'
                | 'FAILED',
            }))
          : []
        const publicText = snapshotParts
          .filter((p) => p.kind === 'text')
          .map((p) => (p as { text: string }).text)
          .join('')

        messages.value.push({
          id: replyId,
          serverMessageId: replyId,
          conversationId: session.id,
          role: 'ASSISTANT',
          status: run.executionActive ? 'PENDING' : 'COMPLETED',
          content: publicText,
          parts: snapshotParts,
          runId: run.runId,
          attemptId: run.currentAttemptId,
          executionActive: run.executionActive,
          tools: snapshotTools,
          createdAt: run.updatedAt || new Date().toISOString(),
        })
      }

      if (run.executionActive) {
        activeRun.value = {
          conversationId: session.remoteId,
          runId: run.runId,
          requestId: '',
          executionActive: true,
          status: run.status,
          currentAttemptId: run.currentAttemptId,
        }
        if (run.status === 'UNKNOWN') {
          // Do NOT automatically poll UNKNOWN attempt
          isStreaming.value = false
        } else {
          isStreaming.value = true
          // Continually poll status until settled instead of one-shot query
          void pollRunStatusUntilSettled(session.remoteId, run.runId, session.id)
        }
      } else {
        activeRun.value = null
        isStreaming.value = false
      }
    } else {
      activeRun.value = null
      isStreaming.value = false
    }

    return messages.value
  }

  async function createSession(title: string, subjectId?: string): Promise<string> {
    abortStream()
    const view = await createConversation({
      title: title.slice(0, 240) || '新会话',
      baseVersion: 0,
      clientRequestId: uuidv7(),
    })
    if (!view.id) throw new Error('Conversation response missing id')
    const session = mapSession(
      { ...view, id: view.id, title: view.title || title || '新会话', version: view.version ?? 0, chatProtocolVersion: 1, chatSupported: true },
      subjectId
    )
    sessions.value.unshift(session)
    activeSessionId.value = session.id
    messages.value = []
    lastError.value = null
    lastErrorCode.value = null
    return session.id
  }

  async function startNewSession(title = '新会话', subjectId?: string): Promise<string> {
    return createSession(title, subjectId)
  }

  async function startSubjectConversation(subjectId: string, title = '学科对话'): Promise<string> {
    const auth = useAuthStore()
    const ownerId = auth.user?.id
    if (!ownerId || !subjectId) return startNewSession(title, subjectId)

    const key = `auralis.chat.protocol1.${ownerId}.${subjectId}`
    const mappedId = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    if (mappedId) {
      if (!sessions.value.some((session) => session.id === mappedId)) {
        await loadSessions().catch(() => undefined)
      }
      const existing = sessions.value.find(
        (session) => session.id === mappedId && session.chatSupported && session.chatProtocolVersion === 1
      )
      if (existing) {
        return loadMessages(existing.id).then(() => existing.id)
      }
    }

    const id = await createSession(title, subjectId)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, id)
    }
    return id
  }

  async function startNewSubjectConversation(subjectId: string, title = '学科对话'): Promise<string> {
    abortStream()
    const id = await createSession(title, subjectId)
    const ownerId = useAuthStore().user?.id
    if (ownerId && typeof localStorage !== 'undefined') {
      localStorage.setItem(`auralis.chat.protocol1.${ownerId}.${subjectId}`, id)
    }
    return id
  }

  function clearActiveConversation(): void {
    abortStream()
    messages.value = []
    streamingContent.value = ''
    streamingReasoning.value = ''
    streamingParts.value = []
    streamingTools.value = []
    lastError.value = null
    lastErrorCode.value = null
    activeRun.value = null
    isStreaming.value = false
  }

  function appendUser(
    content: string,
    options: ChatRequestOptions = {},
    id = uuidv7(),
    requestId = uuidv7()
  ): ChatMessage {
    const session = activeSession.value
    if (!session || !session.chatSupported || session.chatProtocolVersion !== 1) {
      throw new Error('Select a protocol-1 conversation first')
    }
    const message: ChatMessage = {
      id,
      clientRequestId: requestId,
      conversationId: session.id,
      role: 'USER',
      status: 'PENDING',
      content,
      parts: [{ id: `${id}:text`, kind: 'text', text: content }],
      createdAt: new Date().toISOString(),
      requestOptions: options,
    }
    messages.value.push(message)
    return message
  }

  function upsertAssistant(
    eventState: ChatStreamState,
    messageId: string,
    status: ChatMessage['status'] = 'PENDING',
    targetSessionId = activeSessionId.value || ''
  ): void {
    // Drop late callbacks from old sessions to prevent cross-session pollution
    if (targetSessionId !== activeSessionId.value) return

    const index = messages.value.findIndex((item) => item.id === messageId)
    const existing = index >= 0 ? messages.value[index] : undefined
    const message: ChatMessage = {
      id: messageId,
      serverMessageId: messageId,
      conversationId: targetSessionId,
      role: 'ASSISTANT',
      status,
      content: eventState.publicText || existing?.content || '',
      parts: eventState.parts && eventState.parts.length > 0 ? [...eventState.parts] : existing?.parts ? [...existing.parts] : [],
      reasoningText: eventState.reasoningText || existing?.reasoningText || '',
      runId: eventState.runId || existing?.runId,
      attemptId: eventState.attemptId || existing?.attemptId,
      executionActive: eventState.executionActive,
      tools: eventState.tools && eventState.tools.length > 0 ? [...eventState.tools] : existing?.tools ? [...existing.tools] : [],
      createdAt: existing?.createdAt || new Date().toISOString(),
    }
    if (index >= 0) {
      messages.value[index] = message
    } else {
      messages.value.push(message)
    }
  }

  function updateHistoricalBlockPart(partPayload: unknown): void {
    if (!partPayload || typeof partPayload !== 'object') return
    const raw = partPayload as Record<string, unknown>
    const partId = String(raw.id || '')
    const componentId = String(raw.componentId || '')
    if (!partId && !componentId) return

    for (let msgIndex = 0; msgIndex < messages.value.length; msgIndex++) {
      const msg = messages.value[msgIndex]
      const partIndex = msg.parts.findIndex((p) => {
        if (p.id === partId) return true
        if (p.kind === 'block' && componentId && p.componentId === componentId) return true
        return false
      })
      if (partIndex >= 0) {
        const dummyState: ChatStreamState = {
          lastSequence: 0,
          seen: new Set(),
          publicText: '',
          parts: msg.parts,
          tools: [],
          executionActive: false,
        }
        const updatedState = setPart(dummyState, partPayload)
        messages.value[msgIndex] = {
          ...msg,
          parts: [...updatedState.parts],
        }
        break
      }
    }
  }

  async function runCommand(message: ChatMessage, command: Protocol1MessageCommand): Promise<void> {
    if (isStreaming.value) return
    isStreaming.value = true
    streamingContent.value = ''
    streamingReasoning.value = ''
    streamingParts.value = []
    streamingTools.value = []
    lastError.value = null
    lastErrorCode.value = null
    const targetSessionId = activeSessionId.value || message.conversationId

    for (const msg of messages.value) {
      if (msg.role === 'ASSISTANT' && msg.status === 'PENDING') {
        msg.status = 'INTERRUPTED'
      }
    }

    let final: ChatStreamState | null = null
    let latestState: ChatStreamState | null = null

    try {
      final = await controller.run(command, {
        onEvent(event, state) {
          latestState = state
          // Reject stale stream events if active conversation changed
          if (activeSessionId.value !== targetSessionId) return

          if (event.event === 'run.started') {
            activeRun.value = {
              conversationId: event.conversationId,
              runId: event.runId,
              requestId: event.requestId,
              executionActive: true,
            }
            const original = messages.value.find((item) => item.id === message.id)
            if (original) {
              original.runId = event.runId
              original.attemptId = event.attemptId
            }
          }

          if (event.event === 'activity.submitted') {
            if (event.userMessageId) {
              const original = messages.value.find((item) => item.id === message.id)
              if (original) original.serverMessageId = event.userMessageId
            }
            if (event.payload.part) {
              updateHistoricalBlockPart(event.payload.part)
            }
            const compId = String(event.payload.componentId || event.blockId || '')
            if (compId) {
              clearActivityDraft(compId)
            }
          }

          const targetReplyId =
            (typeof event.replyMessageId === 'string' && event.replyMessageId.trim() ? event.replyMessageId : undefined) ||
            state.replyMessageId ||
            (typeof event.payload?.replyMessageId === 'string' && event.payload.replyMessageId.trim() ? event.payload.replyMessageId : undefined)
          if (targetReplyId) {
            upsertAssistant(state, targetReplyId, 'PENDING', targetSessionId)
          }
          streamingContent.value = state.publicText
          streamingReasoning.value = state.reasoningText || ''
          streamingParts.value = state.parts
          streamingTools.value = state.tools

          if (
            event.event === 'run.completed' ||
            event.event === 'run.failed' ||
            event.event === 'run.cancelled'
          ) {
            activeRun.value = state.executionActive ? activeRun.value : null
            if (!state.executionActive) isStreaming.value = false
          }
        },
      })

      // Handle stream finishing without a terminal event (premature EOF)
      if (!final.terminal && final.runId) {
        const runStatus = await getChatRunStatus(command.conversationId, final.runId).catch(() => null)
        if (runStatus) {
          if (runStatus.status === 'UNKNOWN') {
            activeRun.value = {
              conversationId: command.conversationId,
              runId: final.runId,
              requestId: runStatus.requestId,
              executionActive: true,
              status: 'UNKNOWN',
              currentAttemptId: runStatus.currentAttemptId,
            }
            isStreaming.value = false
          } else if (!runStatus.executionActive) {
            const mappedTerminal =
              runStatus.status === 'FAILED'
                ? 'FAILED'
                : runStatus.status === 'CANCELLED'
                ? 'CANCELLED'
                : 'COMPLETED'
            final = {
              ...final,
              executionActive: false,
              terminal: mappedTerminal,
            }
            activeRun.value = null
          } else {
            // Still active on server, poll until settled
            activeRun.value = {
              conversationId: command.conversationId,
              runId: final.runId,
              requestId: runStatus.requestId,
              executionActive: true,
            }
            void pollRunStatusUntilSettled(command.conversationId, final.runId, targetSessionId)
          }
        } else {
          // Status check failed on EOF without terminal
          final = {
            ...final,
            executionActive: false,
            terminal: 'FAILED',
            safeErrorCode: 'STREAM_TRUNCATED',
          }
          activeRun.value = null
        }
      }

      const assistantId =
        final?.replyMessageId ||
        (latestState as ChatStreamState | null)?.replyMessageId ||
        messages.value.find((m) => m.role === 'ASSISTANT' && m.status === 'PENDING')?.id
      if (assistantId && activeSessionId.value === targetSessionId && final) {
        const assistantStatus: ChatMessage['status'] =
          final.terminal === 'FAILED'
            ? 'FAILED'
            : final.terminal === 'CANCELLED'
            ? 'INTERRUPTED'
            : final.terminal === 'COMPLETED'
            ? 'COMPLETED'
            : 'PENDING'
        upsertAssistant(final, assistantId, assistantStatus, targetSessionId)
      }

      const user = messages.value.find((item) => item.id === message.id)
      if (user) {
        user.status = final.terminal === 'FAILED' ? 'FAILED' : 'COMPLETED'
      }

      if (final.terminal === 'FAILED') {
        const errorCode = final.safeErrorCode || 'CHAT_RUN_FAILED'
        lastErrorCode.value = errorCode
        lastError.value = mapSafeErrorMessage(errorCode)
      }
    } catch (error) {
      // Network disconnection or runtime stream failure
      const isAborted = (error instanceof Error && error.name === 'AbortError') || (error instanceof DOMException && error.name === 'AbortError')
      const isStaleSession = activeSessionId.value !== targetSessionId

      const fallbackRunId = (latestState as ChatStreamState | null)?.runId
      const activeRunId = activeRun.value?.runId || fallbackRunId
      if (activeRunId) {
        const status = await getChatRunStatus(command.conversationId, activeRunId).catch(() => null)
        if (status && !status.executionActive) {
          activeRun.value = null
        } else if (!status) {
          activeRun.value = null
        }
      } else {
        activeRun.value = null
      }

      const fallbackState: ChatStreamState | null = (latestState as ChatStreamState | null) || (final as ChatStreamState | null)
      const assistantId = fallbackState?.replyMessageId
      if (assistantId && fallbackState && !isStaleSession) {
        upsertAssistant(fallbackState, assistantId, 'INTERRUPTED', targetSessionId)
      }

      const user = messages.value.find((item) => item.id === message.id)
      if (user && !isAborted) {
        user.status = 'FAILED'
      }

      if (!isAborted && !isStaleSession) {
        lastError.value = error instanceof Error ? error.message : '网络连接中断，请重试'
        lastErrorCode.value = 'AI_STREAM_DISCONNECTED'
      }
      throw error
    } finally {
      if (!activeRun.value?.executionActive) {
        isStreaming.value = false
      }
      streamingContent.value = ''
      streamingReasoning.value = ''
      streamingParts.value = []
      streamingTools.value = []
    }
  }

  async function sendMessage(content: string, options: ChatRequestOptions = {}): Promise<void> {
    const text = content.trim()
    const session = activeSession.value
    if (!text || !session || isStreaming.value || activeRun.value?.executionActive) return

    if (session.chatScopeState === 'LEGACY') {
      lastError.value = '此历史会话未绑定资料范围，不可继续提问。请开始新会话。'
      lastErrorCode.value = 'CHAT_SCOPE_LEGACY'
      return
    }

    const message = appendUser(text, options)
    const requestId = message.clientRequestId!

    let readingContext: ReadingContextDto | undefined
    if (session.chatScopeState === 'BOUND') {
      if (isScopeMatching(session.chatScope, options)) {
        readingContext = undefined // Omit to inherit bound scope on ordinary later turns
      } else {
        readingContext = buildReadingContext(options) // Explicit differing scope -> triggers 409 CHAT_SCOPE_CONFLICT
      }
    } else {
      readingContext = buildReadingContext(options)
    }

    try {
      await runCommand(message, {
        protocolVersion: 1,
        action: 'turn',
        conversationId: session.remoteId,
        requestId,
        content: text,
        readingContext,
        selectionText: options.selectionText?.slice(0, 4000),
      })

      // Once admitted, transition unbound session to bound
      if (session.chatScopeState === 'UNBOUND') {
        const boundContext = buildReadingContext(options)
        if (boundContext) {
          session.chatScopeState = 'BOUND'
          session.chatScope = {
            retrievalMode: boundContext.retrievalMode,
            subjectId: boundContext.subjectId || null,
            currentSourceId: boundContext.currentSourceId || null,
            sourceIds: boundContext.sourceIds || [],
          }
        }
      }
    } catch (error: any) {
      const status = error?.status || error?.response?.status || error?.problem?.status
      const code = error?.code || error?.response?.data?.code || error?.problem?.code
      if (status === 409 && (code === 'CHAT_SCOPE_CONFLICT' || String(error?.message || '').includes('CHAT_SCOPE_CONFLICT'))) {
        lastErrorCode.value = 'CHAT_SCOPE_CONFLICT'
        lastError.value = '当前会话已固定资料范围，无法切换范围提问。请开启新会话。'
        messages.value = messages.value.filter((m) => m.id !== message.id)
        return
      }
      throw error
    }
  }

  async function retryPendingMessage(messageId: string): Promise<void> {
    const targetMsg = messages.value.find((item) => item.id === messageId)
    if (!targetMsg || isStreaming.value || activeRun.value?.executionActive) return

    let message: ChatMessage | undefined
    const staleAssistantIds: string[] = []

    if (targetMsg.role === 'USER') {
      message = targetMsg
      const userIndex = messages.value.findIndex((m) => m.id === messageId)
      for (let i = userIndex + 1; i < messages.value.length; i++) {
        if (messages.value[i].role === 'USER') break
        if (messages.value[i].role === 'ASSISTANT' && messages.value[i].status !== 'COMPLETED') {
          staleAssistantIds.push(messages.value[i].id)
        }
      }
    } else {
      staleAssistantIds.push(targetMsg.id)
      const targetIndex = messages.value.findIndex((m) => m.id === messageId)
      for (let i = targetIndex - 1; i >= 0; i--) {
        if (messages.value[i].role === 'USER') {
          message = messages.value[i]
          break
        }
      }
      if (message) {
        const userMsg = message
        const userIndex = messages.value.findIndex((m) => m.id === userMsg.id)
        for (let i = userIndex + 1; i < messages.value.length; i++) {
          if (messages.value[i].role === 'USER') break
          if (messages.value[i].role === 'ASSISTANT' && messages.value[i].status !== 'COMPLETED') {
            if (!staleAssistantIds.includes(messages.value[i].id)) {
              staleAssistantIds.push(messages.value[i].id)
            }
          }
        }
      }
    }

    const session = activeSession.value
    if (!message || !session) return

    // 重试清理：移除当前提问轮次中前序未完成或失败的旧助手消息，避免重试后同一个提问下残留并存多个气泡
    if (staleAssistantIds.length > 0) {
      messages.value = messages.value.filter((m) => !staleAssistantIds.includes(m.id))
    }

    // Clear previous error on retry
    lastError.value = null
    lastErrorCode.value = null
    message.status = 'PENDING'

    if (!message.runId) {
      const options = message.requestOptions || {}
      const requestId = message.clientRequestId || uuidv7()
      message.clientRequestId = requestId
      const readingContext = buildReadingContext(options)

      const command: Protocol1MessageCommand =
        message.activityId && message.submissionId && message.answerPayload
          ? {
              protocolVersion: 1,
              action: 'activity_submission',
              conversationId: session.remoteId,
              requestId,
              activityId: message.activityId,
              questionVersion: message.questionVersion,
              submissionId: message.submissionId,
              answer: message.answerPayload,
            }
          : {
              protocolVersion: 1,
              action: 'turn',
              conversationId: session.remoteId,
              requestId,
              content: message.content,
              readingContext,
              selectionText: options.selectionText?.slice(0, 4000),
            }
      await runCommand(message, command)
      return
    }

    isStreaming.value = true
    streamingContent.value = ''
    streamingReasoning.value = ''
    streamingParts.value = []
    streamingTools.value = []
    let state = createChatStreamState()
    const requestId = uuidv7()
    const targetSessionId = session.id
    const retryAbortController = new AbortController()
    activeRetryAbortController = retryAbortController
    try {
      for await (const event of retryChatRun(session.remoteId, message.runId, requestId, retryAbortController.signal)) {
        if (activeSessionId.value !== targetSessionId) break
        const next = reduceChatStreamEvent(state, event)
        if (next === state) continue
        state = next
        const targetReplyId =
          (typeof event.replyMessageId === 'string' && event.replyMessageId.trim() ? event.replyMessageId : undefined) ||
          state.replyMessageId ||
          (typeof event.payload?.replyMessageId === 'string' && event.payload.replyMessageId.trim() ? event.payload.replyMessageId : undefined)
        if (targetReplyId) {
          upsertAssistant(state, targetReplyId, 'PENDING', targetSessionId)
        }
        streamingContent.value = state.publicText
        streamingReasoning.value = state.reasoningText || ''
        streamingParts.value = state.parts
        streamingTools.value = state.tools
        activeRun.value = {
          conversationId: session.remoteId,
          runId: event.runId,
          requestId,
          executionActive: state.executionActive,
        }
      }

      // Handle stream finishing without a terminal event (premature EOF)
      if (!state.terminal && state.runId) {
        const runStatus = await getChatRunStatus(session.remoteId, state.runId).catch(() => null)
        if (runStatus) {
          if (runStatus.status === 'UNKNOWN') {
            activeRun.value = {
              conversationId: session.remoteId,
              runId: state.runId,
              requestId: runStatus.requestId,
              executionActive: true,
              status: 'UNKNOWN',
              currentAttemptId: runStatus.currentAttemptId,
            }
            isStreaming.value = false
          } else if (!runStatus.executionActive) {
            const mappedTerminal =
              runStatus.status === 'FAILED'
                ? 'FAILED'
                : runStatus.status === 'CANCELLED'
                ? 'CANCELLED'
                : 'COMPLETED'
            state = {
              ...state,
              executionActive: false,
              terminal: mappedTerminal,
            }
            activeRun.value = null
          } else {
            activeRun.value = {
              conversationId: session.remoteId,
              runId: state.runId,
              requestId: runStatus.requestId,
              executionActive: true,
            }
            void pollRunStatusUntilSettled(session.remoteId, state.runId, targetSessionId)
          }
        } else {
          state = {
            ...state,
            executionActive: false,
            terminal: 'FAILED',
            safeErrorCode: 'STREAM_TRUNCATED',
          }
          activeRun.value = null
        }
      } else if (state.runId && state.executionActive) {
        await confirmRunStatus(session.remoteId, state.runId)
      }

      if (state.replyMessageId && activeSessionId.value === targetSessionId) {
        upsertAssistant(
          state,
          state.replyMessageId,
          state.terminal === 'FAILED'
            ? 'FAILED'
            : state.terminal === 'CANCELLED'
            ? 'INTERRUPTED'
            : state.terminal === 'COMPLETED'
            ? 'COMPLETED'
            : 'PENDING',
          targetSessionId
        )
      }

      const user = messages.value.find((item) => item.id === message.id)
      if (user) {
        user.status = state.terminal === 'FAILED' ? 'FAILED' : 'COMPLETED'
      }

      if (state.terminal === 'FAILED') {
        const errorCode = state.safeErrorCode || 'CHAT_RUN_FAILED'
        lastErrorCode.value = errorCode
        lastError.value = mapSafeErrorMessage(errorCode)
      }
    } catch (error) {
      const isAborted = (error instanceof Error && error.name === 'AbortError') || retryAbortController.signal.aborted
      const isStaleSession = activeSessionId.value !== targetSessionId

      const assistantId = state.replyMessageId
      if (assistantId && !isStaleSession) {
        upsertAssistant(state, assistantId, 'INTERRUPTED', targetSessionId)
      }

      const user = messages.value.find((item) => item.id === message.id)
      if (user && !isAborted) {
        user.status = 'FAILED'
      }

      if (!isAborted && !isStaleSession) {
        lastError.value = error instanceof Error ? error.message : '重试请求失败'
        lastErrorCode.value = 'CHAT_RETRY_FAILED'
      }
      activeRun.value = null
    } finally {
      if (activeRetryAbortController === retryAbortController) {
        activeRetryAbortController = null
      }
      if (!activeRun.value?.executionActive) {
        isStreaming.value = false
      }
      streamingContent.value = ''
      streamingReasoning.value = ''
      streamingParts.value = []
      streamingTools.value = []
    }
  }

  async function submitActivity(
    questionId: string,
    answer: ChatActivityAnswer,
    block: ChatBlockPart
  ): Promise<void> {
    if (isStreaming.value || activeRun.value?.executionActive || block.state !== 'READY') return
    const session = activeSession.value
    if (!session) return

    // Canonical answer normalization
    let canonicalAnswer: string | string[]
    if (block.component === 'quiz') {
      canonicalAnswer = Array.isArray(answer) ? [...answer] : [String(answer)]
    } else {
      canonicalAnswer = typeof answer === 'string' ? answer : answer.join(' ')
    }

    const content = `回答：${Array.isArray(canonicalAnswer) ? canonicalAnswer.join('、') : canonicalAnswer}`
    const message = appendUser(content, {}, uuidv7(), uuidv7())
    message.activityId = questionId
    message.questionVersion = 1
    message.submissionId = uuidv7()
    message.answerPayload = canonicalAnswer

    await runCommand(message, {
      protocolVersion: 1,
      action: 'activity_submission',
      conversationId: session.remoteId,
      requestId: message.clientRequestId!,
      activityId: questionId,
      questionVersion: 1,
      submissionId: message.submissionId,
      answer: canonicalAnswer,
    })
  }

  async function confirmRunStatus(conversationId: string, runId: string): Promise<void> {
    try {
      const status = await getChatRunStatus(conversationId, runId)
      if (!status.executionActive) {
        activeRun.value = null
        isStreaming.value = false
      } else {
        activeRun.value = { conversationId, runId, requestId: status.requestId, executionActive: true }
        isStreaming.value = true
      }
    } catch {
      // Keep UI busy until the next detail/status check confirms worker exit
    }
  }

  async function requestCancel(): Promise<void> {
    const running = activeRun.value
    if (!running) return
    try {
      await cancelChatRun(running.conversationId, running.runId)
      await confirmRunStatus(running.conversationId, running.runId)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '取消请求失败'
    }
  }

  const recoverableTarget = computed(() => {
    const session = activeSession.value
    if (!session) return null
    if (activeRun.value?.executionActive && activeRun.value.status === 'UNKNOWN' && activeRun.value.currentAttemptId) {
      return {
        conversationId: activeRun.value.conversationId,
        runId: activeRun.value.runId,
        attemptId: activeRun.value.currentAttemptId,
      }
    }
    if (activeRun.value?.executionActive && activeRun.value.status === 'UNKNOWN') {
      const lastAssMsg = [...messages.value].reverse().find((m) => m.role === 'ASSISTANT' && m.runId === activeRun.value?.runId)
      if (lastAssMsg?.attemptId) {
        return {
          conversationId: activeRun.value.conversationId,
          runId: activeRun.value.runId,
          attemptId: lastAssMsg.attemptId,
        }
      }
    }
    return null
  })

  async function recoverUnknownAttempt(): Promise<boolean> {
    const target = recoverableTarget.value
    const session = activeSession.value
    const authStore = useAuthStore()
    const targetUserId = authStore.user?.id
    const targetSessionId = activeSessionId.value

    if (!target || !session || !targetUserId || !targetSessionId || isRecovering.value) return false

    isRecovering.value = true
    try {
      const result = await recoverChatRunAttempt(target.conversationId, target.runId, target.attemptId)

      // Guard: apply returned status only if account/session/conversation/run/attempt still match
      if (
        authStore.user?.id !== targetUserId ||
        activeSessionId.value !== targetSessionId ||
        activeRun.value?.runId !== target.runId ||
        (activeRun.value?.currentAttemptId && activeRun.value.currentAttemptId !== target.attemptId)
      ) {
        return false
      }

      if (!result.executionActive) {
        activeRun.value = null
        isStreaming.value = false
      } else {
        activeRun.value = {
          conversationId: target.conversationId,
          runId: result.runId,
          requestId: result.requestId,
          executionActive: result.executionActive,
          status: result.status,
          currentAttemptId: result.currentAttemptId,
        }
      }

      // Refresh conversation detail to get latest canonical messages
      const freshDetail = await getConversation(target.conversationId).catch(() => null)
      if (freshDetail && activeSessionId.value === targetSessionId) {
        messages.value = (freshDetail.messages || []).map((m) => mapMessage(m, targetSessionId))
      }
      lastError.value = null
      lastErrorCode.value = null
      return true
    } catch (error: any) {
      // On HTTP 409 (CHAT_RECOVERY_NOT_ALLOWED), refresh run status; do NOT automatically repeat recover or retry!
      const status = error?.status || error?.response?.status || error?.problem?.status
      const errorCode = error?.code || error?.response?.data?.code || error?.problem?.code
      if (status === 409 || errorCode === 'CHAT_RECOVERY_NOT_ALLOWED') {
        const fresh = await getChatRunStatus(target.conversationId, target.runId).catch(() => null)
        if (fresh && activeSessionId.value === targetSessionId && activeRun.value?.runId === target.runId) {
          if (!fresh.executionActive) {
            activeRun.value = null
            isStreaming.value = false
            const freshDetail = await getConversation(target.conversationId).catch(() => null)
            if (freshDetail && activeSessionId.value === targetSessionId) {
              messages.value = (freshDetail.messages || []).map((m) => mapMessage(m, targetSessionId))
            }
          } else {
            activeRun.value = {
              conversationId: target.conversationId,
              runId: fresh.runId,
              requestId: fresh.requestId,
              executionActive: fresh.executionActive,
              status: fresh.status,
              currentAttemptId: fresh.currentAttemptId,
            }
          }
        }
        lastErrorCode.value = 'CHAT_RECOVERY_NOT_ALLOWED'
        lastError.value = '当前尝试不可恢复或状态已变更，已刷新最新会话状态。'
      } else {
        lastErrorCode.value = 'CHAT_RECOVERY_FAILED'
        lastError.value = error instanceof Error ? error.message : '恢复会话状态失败，请重试'
      }
      return false
    } finally {
      isRecovering.value = false
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) return
    await deleteConversation(session.remoteId, session.version)
    sessions.value = sessions.value.filter((item) => item.id !== sessionId)
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = null
      messages.value = []
    }
  }

  function abortStream(): void {
    controller.abort()
    if (activeRetryAbortController) {
      activeRetryAbortController.abort()
      activeRetryAbortController = null
    }
  }

  function appendAssistantChunk(_chunk: string): void {}
  async function finalizeAssistantMessage(): Promise<void> {
    isStreaming.value = false
  }

  function setActivityDraft(componentId: string, draft: ChatActivityDraft): void {
    if (!componentId) return
    activityDrafts.value = {
      ...activityDrafts.value,
      [componentId]: Array.isArray(draft) ? [...draft] : draft,
    }
  }

  function clearActivityDraft(componentId: string): void {
    if (!componentId || !activityDrafts.value[componentId]) return
    const next = { ...activityDrafts.value }
    delete next[componentId]
    activityDrafts.value = next
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    pendingMessage,
    isLegacySession,
    isBoundSession,
    messages,
    activityDrafts,
    setActivityDraft,
    clearActivityDraft,
    isStreaming,
    streamingContent,
    streamingReasoning,
    streamingParts,
    streamingTools,
    lastError,
    lastErrorCode,
    activeRun,
    recoverableTarget,
    isRecovering,
    recoverUnknownAttempt,
    loadSessions,
    loadMessages,
    startNewSession,
    startSubjectConversation,
    startNewSubjectConversation,
    sendMessage,
    submitActivity,
    retryPendingMessage,
    requestCancel,
    abortStream,
    clearActiveConversation,
    deleteSession,
    appendAssistantChunk,
    finalizeAssistantMessage,
  }
})
