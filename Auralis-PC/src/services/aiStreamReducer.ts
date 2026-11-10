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
  reasoningText?: string
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
    reasoningText: '',
    parts: [],
    tools: [],
    executionActive: true,
    ...initial,
  }
}

function markPendingBlocksInvalid(parts: readonly ChatContentPart[]): ChatContentPart[] {
  let changed = false
  const updated = parts.map((part) => {
    if (part.kind === 'block' && part.state === 'GENERATING') {
      changed = true
      return { ...part, state: 'INVALID' as const }
    }
    return part
  })
  return changed ? updated : (parts as ChatContentPart[])
}

export function setPart(state: ChatStreamState, part: unknown): ChatStreamState {
  const projected = projectChatContentPart(part)
  if (!projected) return state
  let index = state.parts.findIndex((item) => {
    if (item.id === projected.id) return true
    if (item.kind === 'block' && projected.kind === 'block' && item.componentId === projected.componentId) {
      return true
    }
    return false
  })
  const parts = [...state.parts]

  // 可视化重试防御：若当前流式仍在进行，且推入的是新块级组件（index < 0），
  // 检查是否已有处于 INVALID 状态的前序失败块（后端 Display Tool 校验失败后在下一轮 iteration 重试）。
  // 优先匹配同组件类型的失败块，或无任何有效条目的失败空块，进行原位无缝替换，杜绝“先渲染一张失败卡片再新开一张”。
  if (index < 0 && projected.kind === 'block' && state.executionActive) {
    let sameComponentInvalidIndex = -1
    let emptyInvalidIndex = -1
    for (let i = parts.length - 1; i >= 0; i--) {
      const item = parts[i]
      if (item && item.kind === 'block' && item.state === 'INVALID') {
        if (sameComponentInvalidIndex < 0 && item.component === projected.component) {
          sameComponentInvalidIndex = i
        }
        if (emptyInvalidIndex < 0 && item.items.length === 0) {
          emptyInvalidIndex = i
        }
      }
    }
    if (sameComponentInvalidIndex >= 0) {
      index = sameComponentInvalidIndex
    } else if (emptyInvalidIndex >= 0) {
      index = emptyInvalidIndex
    }
  }

  if (index < 0) {
    parts.push(projected)
  } else {
    parts[index] = projected
  }
  return { ...state, parts }
}

function isItemSubstantive(
  component: string,
  row: Record<string, unknown>,
  optionKey: string,
  optionText: string
): boolean {
  if (component === 'quiz') {
    return optionKey.trim().length > 0 && optionText.trim().length > 0
  }
  if (component === 'chart') {
    return typeof row.label === 'string' && row.label.trim().length > 0 && typeof row.value === 'number' && Number.isFinite(row.value)
  }
  if (typeof row.title === 'string') {
    return row.title.trim().length > 0
  }
  return true
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
      const stemMeta: Record<string, unknown> = { ...row }
      if (typeof row.question === 'string') {
        stemMeta.question = row.question
      } else if (typeof row.stem === 'string') {
        stemMeta.question = row.stem
      } else if (typeof row.title === 'string') {
        stemMeta.question = row.title
      }
      if (typeof row.questionType === 'string') {
        stemMeta.questionType = row.questionType
      }
      meta = { ...meta, ...stemMeta }
    } else if (row.type === 'item' || row.type === 'option') {
      const optionKey = String(row.key ?? (row.label ?? ['A', 'B', 'C', 'D', 'E', 'F'][items.length] ?? ''))
      const optionText = String(row.text ?? (row.content ?? (row.title ?? '')))
      const existingIndex = items.findIndex((item) => {
        if (component === 'quiz' && optionKey) {
          return String(item.key) === optionKey
        }
        if (typeof item.title === 'string' && typeof row.title === 'string' && item.title) {
          return item.title === row.title
        }
        return false
      })
      if (existingIndex >= 0) {
        items[existingIndex] = { ...items[existingIndex], ...row, ...(component === 'quiz' ? { key: optionKey, text: optionText } : {}) }
      } else if (isItemSubstantive(component, row, optionKey, optionText)) {
        // 字段完整性守卫 (Field Completeness Guard)：只允许达到封口要求的结构节点推入队列，杜绝半截节点造成画布重排抽搐
        items.push({ ...row, ...(component === 'quiz' ? { key: optionKey, text: optionText } : {}) })
      }
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
  const replyMessageId =
    (typeof event.replyMessageId === 'string' && event.replyMessageId.trim() ? event.replyMessageId : undefined) ||
    (typeof event.payload?.replyMessageId === 'string' && event.payload.replyMessageId.trim() ? event.payload.replyMessageId : undefined) ||
    state.replyMessageId

  let next: ChatStreamState = {
    ...state,
    conversationId: event.conversationId || state.conversationId,
    requestId: event.requestId || state.requestId,
    runId: event.runId || state.runId,
    attemptId: event.attemptId || state.attemptId,
    replyMessageId,
    lastSequence: event.sequence,
    seen,
  }

  const delta = typeof event.payload.publicTextDelta === 'string' ? event.payload.publicTextDelta : ''
  if (delta) next.publicText += delta

  switch (event.event) {
    case 'reasoning.delta': {
      const text = typeof event.payload.text === 'string' ? event.payload.text : ''
      if (text) {
        next = {
          ...next,
          reasoningText: (next.reasoningText || '') + text,
        }
      }
      break
    }

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
          const replyIdPrefix = next.replyMessageId || event.replyMessageId || 'msg'
          const id =
            textSegmentIndex === 0
              ? `${replyIdPrefix}:text`
              : `${replyIdPrefix}:text:${textSegmentIndex}`
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
          const rawQId = event.payload.questionId || event.payload.activityId || block.questionId
          const questionId = rawQId ? String(rawQId) : undefined
          const updatedBlock: ChatBlockPart = {
            ...block,
            state: 'READY',
            ...(questionId ? { questionId } : {}),
          }
          next = setPart(next, updatedBlock)
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
      const componentId = String(event.payload.componentId || event.blockId || '')
      if (componentId) {
        const block = next.parts.find(
          (p): p is ChatBlockPart => p.kind === 'block' && (p.componentId === componentId || p.id === componentId)
        )
        if (block) {
          next = setPart(next, { ...block, state: 'INVALID' })
        }
      }
      const fallback = typeof event.payload.publicTextDelta === 'string' ? event.payload.publicTextDelta : ''
      if (fallback && fallback.trim()) {
        const replyIdPrefix = next.replyMessageId || event.replyMessageId || 'msg'
        const id = `${replyIdPrefix}:block-error:${event.blockId || event.sequence}`
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
        parts: markPendingBlocksInvalid(next.parts),
        executionActive: event.payload.executionActive === true,
        terminal: 'COMPLETED',
      }
      break

    case 'run.failed': {
      const safeErrorCode =
        typeof event.payload.safeErrorCode === 'string' ? event.payload.safeErrorCode : undefined
      next = {
        ...next,
        parts: markPendingBlocksInvalid(next.parts),
        executionActive: false,
        terminal: 'FAILED',
        safeErrorCode,
      }
      break
    }

    case 'run.cancelled':
      next = {
        ...next,
        parts: markPendingBlocksInvalid(next.parts),
        executionActive: false,
        terminal: 'CANCELLED',
      }
      break
  }

  return next
}
