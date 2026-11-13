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
  type ChatRunStatus,
  type Protocol1MessageCommand,
  type ReadingContextDto,
} from '@/api/aiClient'
import { useAuthStore } from '@/store/useAuthStore'
import { SyncScopeChangedError } from '@/api/request'
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
    }
  }

  if (retrievalMode === 'AUTO') {
    return {
      subjectId: options.subjectId,
      retrievalMode: 'AUTO',
      currentSourceId: options.sourceId || null,
      sourceIds: [],
    }
  }

  if (retrievalMode === 'SELECTED_SOURCES') {
    return {
      subjectId: options.subjectId,
      retrievalMode: 'SELECTED_SOURCES',
      currentSourceId: null,
      sourceIds: Array.isArray(options.sourceIds) ? [...options.sourceIds] : [],
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
  requestCommand?: Protocol1MessageCommand
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
  let conversationGeneration = 0

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
    const isCurrent = conversationGuard()
    const views = await listConversations()
    if (!isCurrent()) throw new SyncScopeChangedError()
    sessions.value = (views || []).map((view) => mapSession(view))
    return sessions.value
  }

  async function pollRunStatusUntilSettled(conversationId: string, runId: string, targetSessionId: string): Promise<void> {
    const isCurrent = conversationGuard()
    // Cover the server's 300-second attempt deadline and its recovery observation window.
    const maxAttempts = 220
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (!isCurrent()) return
      try {
        const status = await getChatRunStatus(conversationId, runId)
        if (!isCurrent()) return
        if (!await applyRunStatus(status, conversationId, targetSessionId, isCurrent)) return
      } catch {
        // Continue trying until settled or maxAttempts
      }
    }
    if (!isCurrent()) return
    lastErrorCode.value = 'CHAT_STATUS_POLL_TIMEOUT'
    lastError.value = '尚未确认服务端执行结束。可以停止生成，或重新打开此会话查看最新状态。'
  }

  async function applyRunStatus(
    status: ChatRunStatus,
    conversationId: string,
    targetSessionId: string,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    if (!isCurrent()) return false
    if (status.executionActive) {
      activeRun.value = {
        conversationId,
        runId: status.runId,
        requestId: status.requestId,
        executionActive: true,
        status: status.status,
        currentAttemptId: status.currentAttemptId,
      }
      isStreaming.value = status.status !== 'UNKNOWN'
      return status.status !== 'UNKNOWN'
    }
    const detail = await getConversation(conversationId).catch(() => null)
    if (!isCurrent()) return false
    if (detail) {
      messages.value = (detail.messages || []).map((message) => {
        const mapped = mapMessage(message, targetSessionId)
        if (message.id === status.userMessageId || message.id === status.currentReplyMessageId) {
          mapped.runId = status.runId
          mapped.attemptId = status.currentAttemptId
          mapped.executionActive = false
        }
        return mapped
      })
    }
    if (!detail) {
      for (const message of messages.value.filter((item) => item.runId === status.runId)) {
        message.status = status.status === 'FAILED' ? 'FAILED'
          : status.status === 'CANCELLED' && message.role === 'ASSISTANT' ? 'INTERRUPTED' : 'COMPLETED'
        message.executionActive = false
      }
    }
    activeRun.value = null
    isStreaming.value = false
    const safeErrorCode = status.attempts?.find((attempt) => attempt.attemptId === status.currentAttemptId)?.safeErrorCode
    lastErrorCode.value = status.status === 'FAILED' ? safeErrorCode || 'CHAT_RUN_FAILED' : null
    lastError.value = lastErrorCode.value ? mapSafeErrorMessage(lastErrorCode.value) : null
    return false
  }

  async function reconcileDisconnectedRun(
    conversationId: string,
    runId: string,
    requestId: string,
    targetSessionId: string,
    isCurrent: () => boolean,
  ): Promise<void> {
    const status = await getChatRunStatus(conversationId, runId).catch(() => null)
    if (!isCurrent()) return
    if (status) {
      if (await applyRunStatus(status, conversationId, targetSessionId, isCurrent) && isCurrent()) {
        void pollRunStatusUntilSettled(conversationId, runId, targetSessionId)
      }
      return
    }
    activeRun.value = { conversationId, runId, requestId, executionActive: true }
    void pollRunStatusUntilSettled(conversationId, runId, targetSessionId)
  }

  async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
    abortStream()
    lastError.value = null
    lastErrorCode.value = null
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) throw new Error('Conversation is not available')
    activeSessionId.value = sessionId
    const isCurrent = conversationGuard()

    if (!session.chatSupported || session.chatProtocolVersion !== 1) {
      messages.value = []
      lastError.value = '此历史会话不可继续。请开始新会话。'
      lastErrorCode.value = 'CHAT_PROTOCOL_UNSUPPORTED'
      return messages.value
    }

    const detail = await getConversation(session.remoteId)
    if (!isCurrent()) throw new SyncScopeChangedError()
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
    const isCurrent = conversationGuard()
    const view = await createConversation({
      title: title.slice(0, 240) || '新会话',
      baseVersion: 0,
      clientRequestId: uuidv7(),
    }).catch((error) => {
      if (isCurrent()) {
        const running = activeRun.value
        isStreaming.value = Boolean(running?.executionActive && running.status !== 'UNKNOWN')
        if (running?.executionActive && running.status !== 'UNKNOWN') {
          void pollRunStatusUntilSettled(running.conversationId, running.runId, activeSessionId.value!)
        }
      }
      throw error
    })
    if (!isCurrent()) throw new SyncScopeChangedError()
    if (!view.id) throw new Error('Conversation response missing id')
    const session = mapSession(
      { ...view, id: view.id, title: view.title || title || '新会话', version: view.version ?? 0, chatProtocolVersion: 1, chatSupported: true },
      subjectId
    )
    sessions.value.unshift(session)
    activeSessionId.value = session.id
    messages.value = []
    activeRun.value = null
    isStreaming.value = false
    lastError.value = null
    lastErrorCode.value = null
    return session.id
  }

  async function startNewSession(title = '新会话', subjectId?: string): Promise<string> {
    return createSession(title, subjectId)
  }

  async function startSubjectConversation(subjectId: string, title = '学科对话'): Promise<string> {
    abortStream()
    const isCurrent = conversationGuard()
    const auth = useAuthStore()
    const loginGeneration = auth.loginGeneration
    const ownerId = auth.user?.id
    if (!ownerId || !subjectId) return startNewSession(title, subjectId)

    const key = `auralis.chat.protocol1.${ownerId}.${subjectId}`
    const mappedId = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    if (mappedId) {
      if (!sessions.value.some((session) => session.id === mappedId)) {
        await loadSessions().catch(() => undefined)
        if (!isCurrent()) throw new SyncScopeChangedError()
      }
      const existing = sessions.value.find(
        (session) => session.id === mappedId && session.chatSupported && session.chatProtocolVersion === 1
      )
      if (existing) {
        return loadMessages(existing.id).then(() => existing.id)
      }
    }

    const id = await createSession(title, subjectId)
    if (auth.loginGeneration !== loginGeneration || activeSessionId.value !== id) throw new SyncScopeChangedError()
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, id)
    }
    return id
  }

  async function startNewSubjectConversation(subjectId: string, title = '学科对话'): Promise<string> {
    const ownerId = useAuthStore().user?.id
    const loginGeneration = useAuthStore().loginGeneration
    const id = await createSession(title, subjectId)
    if (useAuthStore().loginGeneration !== loginGeneration || activeSessionId.value !== id) throw new SyncScopeChangedError()
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
    conversationGeneration += 1
    const isCurrent = conversationGuard()
    // Replays must retain the admitted payload, including an omitted readingContext.
    message.requestCommand ??= structuredClone(command)
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
          if (!isCurrent()) return

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
      if (!isCurrent()) return

      // Handle stream finishing without a terminal event (premature EOF)
      if (!final.terminal && final.runId) {
        const runStatus = await getChatRunStatus(command.conversationId, final.runId).catch(() => null)
        if (!isCurrent()) return
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
      if (!isCurrent()) throw error
      // Network disconnection or runtime stream failure
      const isAborted = (error instanceof Error && error.name === 'AbortError') || (error instanceof DOMException && error.name === 'AbortError')
      const fallbackState: ChatStreamState | null = (latestState as ChatStreamState | null) || (final as ChatStreamState | null)
      const assistantId = fallbackState?.replyMessageId
      if (assistantId && fallbackState) {
        upsertAssistant(fallbackState, assistantId, 'INTERRUPTED', targetSessionId)
      }

      const user = messages.value.find((item) => item.id === message.id)
      if (user && !isAborted) {
        user.status = 'FAILED'
      }

      if (!isAborted) {
        lastError.value = error instanceof Error ? error.message : '网络连接中断，请重试'
        lastErrorCode.value = 'AI_STREAM_DISCONNECTED'
      }
      const runId = fallbackState?.runId || message.runId
      if (runId) {
        await reconcileDisconnectedRun(command.conversationId, runId, command.requestId, targetSessionId, isCurrent)
      }
      if (!runId) activeRun.value = null
      throw error
    } finally {
      if (isCurrent()) {
        if (!activeRun.value?.executionActive) isStreaming.value = false
        streamingContent.value = ''
        streamingReasoning.value = ''
        streamingParts.value = []
        streamingTools.value = []
      }
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

    const sending = runCommand(message, {
      protocolVersion: 1,
      action: 'turn',
      conversationId: session.remoteId,
      requestId,
      content: text,
      readingContext,
      selectionText: options.selectionText?.slice(0, 4000),
    })
    const isCurrent = conversationGuard()
    try {
      await sending
      if (!isCurrent()) return
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
      if (!isCurrent()) throw error
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
    if (!message.runId && !message.requestCommand) {
      lastError.value = '原始请求已不可用，无法安全重试。请重新提问。'
      return
    }

    // 重试清理：移除当前提问轮次中前序未完成或失败的旧助手消息，避免重试后同一个提问下残留并存多个气泡
    if (staleAssistantIds.length > 0) {
      messages.value = messages.value.filter((m) => !staleAssistantIds.includes(m.id))
    }

    // Clear previous error on retry
    lastError.value = null
    lastErrorCode.value = null
    message.status = 'PENDING'

    if (!message.runId) {
      await runCommand(message, message.requestCommand!)
      return
    }

    conversationGeneration += 1
    const isCurrent = conversationGuard()
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
        if (!isCurrent()) return
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
      if (!isCurrent()) return

      // Handle stream finishing without a terminal event (premature EOF)
      if (!state.terminal && state.runId) {
        const runStatus = await getChatRunStatus(session.remoteId, state.runId).catch(() => null)
        if (!isCurrent()) return
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
      if (!isCurrent()) return

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
      if (!isCurrent()) return
      const isAborted = (error instanceof Error && error.name === 'AbortError') || retryAbortController.signal.aborted

      const assistantId = state.replyMessageId
      if (assistantId) {
        upsertAssistant(state, assistantId, 'INTERRUPTED', targetSessionId)
      }

      const user = messages.value.find((item) => item.id === message.id)
      if (user && !isAborted) {
        user.status = 'FAILED'
      }

      if (!isAborted) {
        lastError.value = error instanceof Error ? error.message : '重试请求失败'
        lastErrorCode.value = 'CHAT_RETRY_FAILED'
      }
      await reconcileDisconnectedRun(session.remoteId, message.runId, requestId, targetSessionId, isCurrent)
    } finally {
      if (activeRetryAbortController === retryAbortController) {
        activeRetryAbortController = null
      }
      if (isCurrent()) {
        if (!activeRun.value?.executionActive) isStreaming.value = false
        streamingContent.value = ''
        streamingReasoning.value = ''
        streamingParts.value = []
        streamingTools.value = []
      }
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
    const isCurrent = conversationGuard()
    try {
      const status = await getChatRunStatus(conversationId, runId)
      if (!isCurrent()) return
      if (!status.executionActive) {
        activeRun.value = null
        isStreaming.value = false
      } else {
        activeRun.value = { conversationId, runId, requestId: status.requestId, executionActive: true,
          status: status.status, currentAttemptId: status.currentAttemptId }
        isStreaming.value = status.status !== 'UNKNOWN'
      }
    } catch {
      // Keep UI busy until the next detail/status check confirms worker exit
    }
  }

  async function requestCancel(): Promise<void> {
    const running = activeRun.value
    if (!running) return
    const isCurrent = conversationGuard()
    try {
      await cancelChatRun(running.conversationId, running.runId)
      if (!isCurrent()) return
      await confirmRunStatus(running.conversationId, running.runId)
    } catch (error) {
      if (!isCurrent()) return
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
    conversationGeneration += 1
    controller.abort()
    if (activeRetryAbortController) {
      activeRetryAbortController.abort()
      activeRetryAbortController = null
    }
  }

  function conversationGuard(): () => boolean {
    const generation = conversationGeneration
    const auth = useAuthStore()
    const loginGeneration = auth.loginGeneration
    const ownerId = auth.user?.id
    const sessionId = activeSessionId.value
    return () => generation === conversationGeneration && auth.loginGeneration === loginGeneration
      && auth.user?.id === ownerId && activeSessionId.value === sessionId
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
  }
})
