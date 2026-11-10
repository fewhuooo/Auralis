import type { ChatContentPart } from './chatContent'

export interface ChatStreamEnvelope {
  protocolVersion: 1
  conversationId: string
  requestId: string
  runId: string
  attemptId: string
  userMessageId: string
  replyMessageId: string
  iterationId?: string | null
  blockId?: string | null
  sequence: number
  event: 'run.started' | 'reasoning.delta' | 'text.delta' | 'tool.started' | 'tool.completed' | 'tool.error'
    | 'block.started' | 'block.item' | 'block.completed' | 'block.error' | 'activity.ready'
    | 'activity.submitted' | 'run.completed' | 'run.failed' | 'run.cancelled'
  payload: Record<string, unknown>
}

export interface ChatRunStatusAttempt {
  attemptId: string
  attemptNo: number
  requestId: string
  status: string
  replyMessageId?: string
  createdAt?: string
  startedAt?: string
  endedAt?: string
  safeErrorCode?: string
}

export interface ChatRunStatus {
  protocolVersion: number
  conversationId: string
  runId: string
  requestId: string
  userMessageId?: string
  currentAttemptId?: string
  currentReplyMessageId?: string
  status: string
  fenceVersion?: number
  executionActive: boolean
  accountingSummary?: Record<string, number>
  publicSnapshot?: Array<Record<string, unknown>>
  toolTrace?: Array<Record<string, unknown>>
  createdAt?: string
  updatedAt?: string
  attempts?: ChatRunStatusAttempt[]
}

export interface ActiveChatRun {
  runId: string
  userMessageId: string
  currentAttemptId: string
  currentReplyMessageId: string
  status: string
  executionActive: boolean
  publicSnapshot?: Array<Record<string, unknown>>
  toolTrace?: Array<Record<string, unknown>>
  updatedAt?: string
}

export interface ChatMessageDetail {
  id: string
  messageSequence?: number
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  status: 'COMPLETED' | 'INTERRUPTED' | 'FAILED' | 'PENDING'
  content: string
  model?: string
  errorCode?: string
  createdAt?: string
  parts: ChatContentPart[]
  chatProtocolVersion?: number | null
  reasoningText?: string
  tools?: import('../services/aiStreamReducer').ChatToolActivity[]
}

export type ChatScopeState = 'LEGACY' | 'UNBOUND' | 'BOUND'

export interface ChatConversationScope {
  retrievalMode: 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT'
  subjectId: string | null
  currentSourceId: string | null
  sourceIds: string[]
}

export interface ChatConversationDetail {
  id: string
  title: string
  version: number
  chatProtocolVersion: number | null
  chatSupported: boolean
  messages: ChatMessageDetail[]
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  purpose?: string
  sourceId?: string
  activeRun?: ActiveChatRun | null
  chatScopeState?: ChatScopeState
  chatScope?: ChatConversationScope | null
}

export interface ChatConversationListItem {
  id: string
  title: string
  version: number
  chatProtocolVersion: number | null
  chatSupported: boolean
  createdAt?: string
  updatedAt?: string
  chatScopeState?: ChatScopeState
  chatScope?: ChatConversationScope | null
}

/**
 * Canonical answer network values:
 * - Quiz (single): ["B"] (single-element string array)
 * - Quiz (multiple): ["B", "D"] (string array)
 * - Question (open): "Answer text" (string)
 */
export type ChatActivityAnswer = string | readonly string[]
