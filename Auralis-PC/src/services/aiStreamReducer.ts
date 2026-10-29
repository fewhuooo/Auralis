import type { ChatStreamEnvelope } from '../types/chatProtocol.ts'
import type { ChatBlockPart, ChatContentPart } from '../types/chatContent.ts'
import { projectChatContentPart } from './chatContentProjection.ts'

export interface ChatToolActivity {
  id: string
  name: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
}

export interface ChatStreamState {
  conversationId?: string
  requestId?: string
  runId?: string
  attemptId?: string
  replyMessageId?: string
  lastSequence: number
  seen: ReadonlySet<string>
  publicText: string
  parts: readonly ChatContentPart[]
  tools: readonly ChatToolActivity[]
  executionActive: boolean
  terminal?: 'COMPLETED' | 'FAILED' | 'CANCELLED'
  safeErrorCode?: string
}

export function createChatStreamState(initial?: Partial<ChatStreamState>): ChatStreamState {
  return {
    lastSequence: -1,
    seen: new Set(),
    publicText: '',
    parts: [],
    tools: [],
    executionActive: true,
    ...initial,
  }
}

export function setPart(state: ChatStreamState, part: unknown): ChatStreamState {
  const projected = projectChatContentPart(part)
  if (!projected) return state
  const index = state.parts.findIndex((item) => {
    if (item.id === projected.id) return true
    if (item.kind === 'block' && projected.kind === 'block' && item.componentId === projected.componentId) {
      return true
    }
    return false
  })
  const parts = [...state.parts]
  if (index < 0) {
    parts.push(projected)
  } else {
    parts[index] = projected
  }
  return { ...state, parts }
}

function streamingBlock(
  state: ChatStreamState,
  event: ChatStreamEnvelope,
  row?: Record<string, unknown>
): ChatStreamState {
  const componentId = String(event.payload.componentId || event.blockId || '')
  const component = event.payload.component
  if (!componentId || typeof component !== 'string') return state

  const id = String(
    event.payload.partId ||
      (event.payload.part && typeof event.payload.part === 'object'
        ? (event.payload.part as Record<string, unknown>).id || componentId
        : componentId)
  )

  const previous = state.parts.find(
    (part): part is ChatBlockPart => part.kind === 'block' && part.componentId === componentId
  )

  let meta = { ...(previous?.meta || {}) }
  let items = [...(previous?.items || [])]

  if (row) {
    if (row.type === 'meta' || row.type === 'stem') {
      meta = { ...meta, ...row }
    } else if (row.type === 'item' || row.type === 'option') {
      items.push(row)
    }
  }

  const candidate = {
    id,
    componentId,
    kind: 'block',
    component,
    state: previous?.state === 'READY' ? 'READY' : 'GENERATING',
    meta,
    items,
    ...(event.payload.questionId ? { questionId: event.payload.questionId } : {}),
  }

  return setPart(state, candidate)
}

/**
 * Applies protocol-1 envelopes in sequence order.
 * Stale attempt, cross-conversation, or duplicate events are dropped.
 */
export function reduceChatStreamEvent(state: ChatStreamState, event: ChatStreamEnvelope): ChatStreamState {
  if (event.protocolVersion !== 1 || !Number.isSafeInteger(event.sequence) || event.sequence < 0) {
    return state
  }

  if (state.conversationId && state.conversationId !== event.conversationId) return state
  if (state.runId && state.runId !== event.runId) return state

  const isNewAttempt = Boolean(state.attemptId && state.attemptId !== event.attemptId)
  if (isNewAttempt && state.terminal) {
    // If previous attempt already reached terminal, drop late events from different attempt
    return state
  }

  const key = `${event.runId}:${event.attemptId}:${event.sequence}`
  if (state.seen.has(key)) return state

  // Sequence must be strictly increasing per attempt
  if (state.attemptId === event.attemptId && event.sequence <= state.lastSequence) {
    return state
  }

  const seen = new Set(state.seen).add(key)
  let next: ChatStreamState = {
    ...state,
    conversationId: event.conversationId,
    requestId: event.requestId,
    runId: event.runId,
    attemptId: event.attemptId,
    replyMessageId: event.replyMessageId,
    lastSequence: event.sequence,
    seen,
  }

  const delta = typeof event.payload.publicTextDelta === 'string' ? event.payload.publicTextDelta : ''
  if (delta) next.publicText += delta

  switch (event.event) {
    case 'text.delta': {
      const text = typeof event.payload.text === 'string' ? event.payload.text : delta
      if (text) {
        const parts = [...next.parts]
        const lastPart = parts.length > 0 ? parts[parts.length - 1] : undefined
        if (lastPart && lastPart.kind === 'text') {
          // If the last part is already a text part, append text to it
          parts[parts.length - 1] = { ...lastPart, text: lastPart.text + text }
        } else {
          // If a block intervened or this is the first part, start a new ordered text segment
          const textSegmentIndex = parts.filter((p) => p.kind === 'text').length
          const id =
            textSegmentIndex === 0
              ? `${event.replyMessageId}:text`
              : `${event.replyMessageId}:text:${textSegmentIndex}`
          parts.push({ id, kind: 'text', text })
        }
        next = { ...next, parts }
      }
      break
    }

    case 'block.started':
      next = streamingBlock(next, event)
      break

    case 'block.item':
      next = streamingBlock(next, event, event.payload.row as Record<string, unknown> | undefined)
      break

    case 'block.completed':
      next = setPart(next, event.payload.part)
      break

    case 'activity.ready':
      if (event.payload.part) {
        next = setPart(next, event.payload.part)
      } else if (event.payload.componentId) {
        const compId = String(event.payload.componentId)
        const block = next.parts.find((p): p is ChatBlockPart => p.kind === 'block' && p.componentId === compId)
        if (block) {
          next = setPart(next, { ...block, state: 'READY' })
        }
      }
      break

    case 'activity.submitted': {
      const projected = projectChatContentPart(event.payload.part)
      if (projected) {
        const index = next.parts.findIndex((item) => {
          if (item.id === projected.id) return true
          if (item.kind === 'block' && projected.kind === 'block' && item.componentId === projected.componentId) {
            return true
          }
          return false
        })
        if (index >= 0) {
          const parts = [...next.parts]
          parts[index] = projected
          next = { ...next, parts }
        }
      }
      break
    }

    case 'block.error': {
      const fallback = typeof event.payload.publicTextDelta === 'string' ? event.payload.publicTextDelta : ''
      if (fallback) {
        const id = `${event.replyMessageId}:block-error:${event.blockId || event.sequence}`
        next = { ...next, parts: [...next.parts, { id, kind: 'text', text: fallback }] }
      }
      break
    }

    case 'tool.started': {
      const id = String(event.payload.toolCallId || '')
      if (id) {
        next = {
          ...next,
          tools: [...next.tools, { id, name: String(event.payload.name || '工具'), status: 'RUNNING' }],
        }
      }
      break
    }

    case 'tool.completed':
    case 'tool.error': {
      const id = String(event.payload.toolCallId || '')
      next = {
        ...next,
        tools: next.tools.map((tool) =>
          tool.id === id ? { ...tool, status: event.event === 'tool.error' ? 'FAILED' : 'COMPLETED' } : tool
        ),
      }
      break
    }

    case 'run.completed':
      next = {
        ...next,
        executionActive: event.payload.executionActive === true,
        terminal: 'COMPLETED',
      }
      break

    case 'run.failed': {
      const safeErrorCode =
        typeof event.payload.safeErrorCode === 'string' ? event.payload.safeErrorCode : undefined
      next = {
        ...next,
        executionActive: false,
        terminal: 'FAILED',
        safeErrorCode,
      }
      break
    }

    case 'run.cancelled':
      next = {
        ...next,
        executionActive: false,
        terminal: 'CANCELLED',
      }
      break
  }

  return next
}
