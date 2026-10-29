import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  cancelChatRun,
  createConversation,
  deleteConversation,
  getChatRunStatus,
  getConversation,
  listConversations,
  retryChatRun,
  type ChatConversationDetail,
  type Protocol1MessageCommand,
} from '@/api/aiClient'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'
import { AiStreamController } from '@/services/aiStreamController'
import { createChatStreamState, reduceChatStreamEvent, setPart, type ChatStreamState } from '@/services/aiStreamReducer'
import { projectChatContentParts } from '@/services/chatContentProjection'
import type { ChatActivityAnswer, ChatBlockPart, ChatContentPart } from '@/types/chatContent'

export interface ChatRequestOptions {
  subjectId?: string
  sourceId?: string
  sourceIds?: string[]
  retrievalMode?: 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT'
  topK?: number
  selectionText?: string
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
  const lastError = ref<string | null>(null)
  const lastErrorCode = ref<string | null>(null)
  const activeRun = ref<{ conversationId: string; runId: string; requestId: string; executionActive: boolean } | null>(null)

  const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) || null)
  // Both PENDING and FAILED user turns expose retry entry points
  const pendingMessage = computed(() =>
    [...messages.value]
      .reverse()
      .find((message) => message.role === 'USER' && (message.status === 'PENDING' || message.status === 'FAILED')) || null
  )

  function mapSession(
    view: {
      id: string
      title?: string
      version?: number
      chatProtocolVersion?: number | null
      chatSupported?: boolean
      createdAt?: string
      updatedAt?: string
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
    }
  }

  function mapMessage(view: ChatConversationDetail['messages'][number], conversationId: string): ChatMessage {
    const rawParts = Array.isArray(view.parts) ? view.parts : []
    const parts = projectChatContentParts(rawParts)
    return {
      id: view.id,
      serverMessageId: view.id,
      conversationId,
      role: view.role,
      status: view.status,
      content: view.content || '',
      parts,
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
        }
        isStreaming.value = true
        // Continually poll status until settled instead of one-shot query
        void pollRunStatusUntilSettled(session.remoteId, run.runId, session.id)
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
      content: eventState.publicText,
      parts: [...eventState.parts],
      runId: eventState.runId,
      attemptId: eventState.attemptId,
      executionActive: eventState.executionActive,
      tools: [...eventState.tools],
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
    lastError.value = null
    lastErrorCode.value = null
    const targetSessionId = activeSessionId.value || message.conversationId

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
          }

          upsertAssistant(state, event.replyMessageId, 'PENDING', targetSessionId)
          streamingContent.value = state.publicText

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
          if (!runStatus.executionActive) {
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

      const assistantId = final.replyMessageId
      if (assistantId && activeSessionId.value === targetSessionId) {
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
      if (assistantId && fallbackState && activeSessionId.value === targetSessionId) {
        upsertAssistant(fallbackState, assistantId, 'INTERRUPTED', targetSessionId)
      }

      const user = messages.value.find((item) => item.id === message.id)
      if (user) {
        user.status = 'FAILED'
      }

      lastError.value = error instanceof Error ? error.message : '网络连接中断，请重试'
      lastErrorCode.value = 'AI_STREAM_DISCONNECTED'
      throw error
    } finally {
      if (!activeRun.value?.executionActive) {
        isStreaming.value = false
      }
      streamingContent.value = ''
    }
  }

  async function sendMessage(content: string, options: ChatRequestOptions = {}): Promise<void> {
    const text = content.trim()
    if (!text || isStreaming.value || activeRun.value?.executionActive) return
    const message = appendUser(text, options)
    const session = activeSession.value!
    const requestId = message.clientRequestId!
    const referenceMode =
      options.retrievalMode || (options.sourceId ? 'AUTO' : options.subjectId ? 'SUBJECT' : undefined)
    const readingContext =
      options.subjectId && referenceMode
        ? {
            subjectId: options.subjectId,
            currentSourceId: options.sourceId,
            sourceIds: options.sourceIds,
            retrievalMode: referenceMode,
            selectionText: options.selectionText?.slice(0, 4000),
          }
        : undefined

    await runCommand(message, {
      protocolVersion: 1,
      action: 'turn',
      conversationId: session.remoteId,
      requestId,
      content: text,
      readingContext,
      selectionText: options.selectionText?.slice(0, 4000),
    })
  }

  async function retryPendingMessage(messageId: string): Promise<void> {
    const message = messages.value.find((item) => item.id === messageId && item.role === 'USER')
    const session = activeSession.value
    if (!message || !session || isStreaming.value || activeRun.value?.executionActive) return

    // Clear previous error on retry
    lastError.value = null
    lastErrorCode.value = null
    message.status = 'PENDING'

    if (!message.runId) {
      const options = message.requestOptions || {}
      const requestId = message.clientRequestId || uuidv7()
      message.clientRequestId = requestId
      const referenceMode =
        options.retrievalMode || (options.sourceId ? 'AUTO' : options.subjectId ? 'SUBJECT' : undefined)
      const readingContext =
        options.subjectId && referenceMode
          ? {
              subjectId: options.subjectId,
              currentSourceId: options.sourceId,
              sourceIds: options.sourceIds,
              retrievalMode: referenceMode,
              selectionText: options.selectionText?.slice(0, 4000),
            }
          : undefined

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
    let state = createChatStreamState()
    const requestId = uuidv7()
    const targetSessionId = session.id
    try {
      for await (const event of retryChatRun(session.remoteId, message.runId, requestId)) {
        if (activeSessionId.value !== targetSessionId) break
        const next = reduceChatStreamEvent(state, event)
        if (next === state) continue
        state = next
        upsertAssistant(state, event.replyMessageId, 'PENDING', targetSessionId)
        streamingContent.value = state.publicText
        activeRun.value = {
          conversationId: session.remoteId,
          runId: event.runId,
          requestId,
          executionActive: state.executionActive,
        }
      }
      if (state.runId && state.executionActive) {
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
            : 'COMPLETED',
          targetSessionId
        )
      }
      if (state.terminal === 'FAILED') {
        const errorCode = state.safeErrorCode || 'CHAT_RUN_FAILED'
        lastErrorCode.value = errorCode
        lastError.value = mapSafeErrorMessage(errorCode)
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '重试请求失败'
      lastErrorCode.value = 'CHAT_RETRY_FAILED'
      activeRun.value = null
    } finally {
      if (!activeRun.value?.executionActive) {
        isStreaming.value = false
      }
      streamingContent.value = ''
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
  }

  function appendAssistantChunk(_chunk: string): void {}
  async function finalizeAssistantMessage(): Promise<void> {
    isStreaming.value = false
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    pendingMessage,
    messages,
    isStreaming,
    streamingContent,
    lastError,
    lastErrorCode,
    activeRun,
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
