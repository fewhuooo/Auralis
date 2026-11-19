import type { ChatStreamEnvelope } from '../types/chatProtocol.ts'
import type { ChatBlockPart, ChatContentPart } from '../types/chatContent.ts'
import { projectChatContentPart } from './chatContentProjection.ts'

export interface ChatToolActivity {
  id: string
  name: string
  label?: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
}

export function normalizeToolTraceStatus(raw: unknown): ChatToolActivity['status'] {
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (normalized === 'failed' || normalized === 'error') return 'FAILED'
  if (normalized === 'running' || normalized === 'started') return 'RUNNING'
  return 'COMPLETED'
}

export function projectToolTrace(rawTools: unknown): ChatToolActivity[] {
  if (!Array.isArray(rawTools)) return []
  const tools: ChatToolActivity[] = []
  for (let i = 0; i < rawTools.length; i += 1) {
    const entry = rawTools[i]
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const rawId = typeof item.id === 'string' && item.id
      ? item.id
      : (typeof item.toolCallId === 'string' && item.toolCallId ? item.toolCallId : '')
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : '工具'
    if (!rawId && typeof item.name !== 'string') continue
    const id = rawId || `trace-${i}`
    const rawLabel = typeof item.label === 'string' ? item.label.trim() : ''
    const status = normalizeToolTraceStatus(item.status)
    tools.push(rawLabel ? { id, name, label: rawLabel, status } : { id, name, status })
  }
  return tools
}

export function buildFallbackProcessTimeline(
  reasoningText?: string,
  tools?: readonly ChatToolActivity[],
): ChatProcessTimelineItem[] {
  const items: ChatProcessTimelineItem[] = []
  if (reasoningText) {
    items.push({ id: 'reasoning:0', kind: 'reasoning', text: reasoningText })
  }
  if (tools && tools.length > 0) {
    for (const tool of tools) {
      items.push({ id: `tool:${tool.id || items.length}`, kind: 'tool', tool })
    }
  }
  return items
}

export type ChatProcessTimelineItem =
  | {
      id: string
      kind: 'reasoning'
      text: string
    }
  | {
      id: string
      kind: 'tool'
      tool: ChatToolActivity
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
  processTimeline: readonly ChatProcessTimelineItem[]
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
    processTimeline: [],
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
): boolean {
  if (component === 'quiz') {
    return typeof row.key === 'string' && row.key.trim().length > 0
      && typeof row.text === 'string' && row.text.trim().length > 0
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
): ChatStreamState {
  const { componentId, component, row: rawRow } = event.payload
  if (typeof componentId !== 'string' || !componentId.trim() || typeof component !== 'string') return state

  const previous = state.parts.find(
    (part): part is ChatBlockPart => part.kind === 'block' && part.componentId === componentId
  )
  const isActivity = component === 'quiz' || component === 'question'
  if (event.event === 'block.started') {
    if (previous) return state
    return setPart(state, {
      id: componentId,
      componentId,
      kind: 'block',
      component,
      state: 'GENERATING',
      meta: {},
      items: [],
    })
  }
  if (!previous || previous.state !== 'GENERATING' || previous.component !== component
    || rawRow === null || typeof rawRow !== 'object' || Array.isArray(rawRow)) return state

  const row = rawRow as Record<string, unknown>
  if (row.type === (isActivity ? 'stem' : 'meta')) {
    return setPart(state, { ...previous, meta: { ...previous.meta, ...row } })
  }
  if (component === 'question' || row.type !== (component === 'quiz' ? 'option' : 'item')
    || !isItemSubstantive(component, row)) return state

  const items = [...previous.items]
  const index = items.findIndex((item) => component === 'quiz'
    ? item.key === row.key
    : typeof item.title === 'string' && item.title === row.title)
  if (index < 0) {
    items.push(row)
  } else {
    items[index] = { ...items[index], ...row }
  }
  return setPart(state, { ...previous, items })
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
        const timeline = [...next.processTimeline]
        const lastEntry = timeline[timeline.length - 1]
        if (lastEntry && lastEntry.kind === 'reasoning') {
          timeline[timeline.length - 1] = { ...lastEntry, text: lastEntry.text + text }
        } else {
          timeline.push({ id: `reasoning:${timeline.length}`, kind: 'reasoning', text })
        }
        next = {
          ...next,
          reasoningText: (next.reasoningText || '') + text,
          processTimeline: timeline,
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
    case 'block.item':
      next = streamingBlock(next, event)
      break

    case 'block.completed':
      next = setPart(next, event.payload.part)
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
        const name = String(event.payload.name || '工具')
        const rawLabel = typeof event.payload.label === 'string' ? event.payload.label.trim() : ''
        const tool: ChatToolActivity = rawLabel
          ? { id, name, label: rawLabel, status: 'RUNNING' }
          : { id, name, status: 'RUNNING' }
        const existingIndex = next.tools.findIndex((item) => item.id === id)
        const tools =
          existingIndex >= 0
            ? next.tools.map((item, idx) => (idx === existingIndex ? tool : item))
            : [...next.tools, tool]
        const timelineId = `tool:${id}`
        const timelineIndex = next.processTimeline.findIndex((item) => item.id === timelineId)
        const processTimeline =
          timelineIndex >= 0
            ? next.processTimeline.map((item, idx) =>
                idx === timelineIndex ? { id: timelineId, kind: 'tool' as const, tool } : item
              )
            : [...next.processTimeline, { id: timelineId, kind: 'tool' as const, tool }]
        next = {
          ...next,
          tools,
          processTimeline,
        }
      }
      break
    }

    case 'tool.completed':
    case 'tool.error': {
      const id = String(event.payload.toolCallId || '')
      const status = event.event === 'tool.error' ? 'FAILED' : 'COMPLETED'
      const rawName = typeof event.payload.name === 'string' ? event.payload.name.trim() : ''
      const rawLabel = typeof event.payload.label === 'string' ? event.payload.label.trim() : ''
      const updateTool = (tool: ChatToolActivity): ChatToolActivity => ({
        ...tool,
        ...(rawName ? { name: rawName } : {}),
        ...(rawLabel ? { label: rawLabel } : {}),
        status,
      })
      next = {
        ...next,
        tools: next.tools.map((tool) => (tool.id === id ? updateTool(tool) : tool)),
        processTimeline: next.processTimeline.map((item) =>
          item.kind === 'tool' && item.tool.id === id ? { ...item, tool: updateTool(item.tool) } : item
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
