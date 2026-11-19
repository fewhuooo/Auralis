import type { components } from '../api/generated/schema.ts'
import type { ChatToolEvent } from '../api/aiClient.ts'
import {
  extractPartsPlainText,
  markPendingMobileBlocksInvalid,
  projectMobileChatParts,
  type MobileChatContentPart,
} from './mobileChatParts.ts'

type ReadingContext = components['schemas']['ReadingContext']
type ConversationView = components['schemas']['ConversationView']
type MessageView = components['schemas']['MessageView']
type ChatRunStatusView = components['schemas']['ChatRunStatusView']

export interface SubjectScopeEntry {
  id: string
  name: string
}

export interface MobileChatToolStep {
  id: string
  name: string
  label: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  errorCode?: string
}

export type MobileChatProcessItem =
  | { id: string; kind: 'reasoning'; text: string }
  | { id: string; kind: 'tool'; tool: MobileChatToolStep }

export interface MobileChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: MobileChatContentPart[]
  runId?: string
  reasoningText: string
  tools: MobileChatToolStep[]
  processTimeline: MobileChatProcessItem[]
  processExpanded: boolean
  processManuallyToggled: boolean
  status: 'streaming' | 'completed' | 'cancelled' | 'failed'
  originatingKind?: 'turn' | 'activity_submission'
  errorMessage?: string
}

export interface ResolvedConversationScope {
  locked: boolean
  subjectId: string | null
  label: string
}

const TOOL_LABELS: Record<string, string> = {
  search: '检索资料',
  list_sources: '查看资料目录',
  read_source_excerpt: '阅读资料摘录',
  read_source_overview: '查看资料总览',
  render_steps: '生成流程卡片',
  render_compare: '生成对比卡片',
  render_roadmap: '生成路线图',
  render_chart: '生成数据图表',
  render_quiz: '生成自测选择题',
  render_question: '生成开放问答',
}

/** Maps a backend tool name or explicit label into a concise user-facing Chinese label. */
export function formatAiToolLabel(toolName: string, explicitLabel?: string): string {
  const custom = explicitLabel?.trim()
  if (custom) return custom
  const normalized = toolName.trim()
  if (normalized in TOOL_LABELS) return TOOL_LABELS[normalized]
  if (normalized.startsWith('render_')) return '生成展示卡片'
  return normalized || '检索资料'
}

function sanitizeReasoningSegment(segment: string): string {
  return segment
    .replace(/(?:^|\n)[ \t]*(?:规则|系统规则|提示词规则|注意)[：:]\s*(?:总览是\s*AI\s*生成内容|本轮显式授权范围|列完目录只代表枚举了资料)[^\n]*/gi, '')
    .replace(/总览是\s*AI\s*生成内容[，,]?\s*不是原文逐字事实[，,]?\s*需要细节或引用时继续搜索或阅读原文摘录[。.]?/gi, '')
    .replace(/`?\blist_sources(?:\([^)]*\))?`?/g, '查看资料目录')
    .replace(/`?\bread_source_overview(?:\([^)]*\))?`?/g, '查看资料总览')
    .replace(/`?\bread_source_excerpt(?:\([^)]*\))?`?/g, '阅读资料摘录')
    .replace(/`?\bsearch\.sourceIds\b`?/g, '目标资料范围')
    .replace(/`?\brender_steps(?:\([^)]*\))?`?/g, '流程卡片')
    .replace(/`?\brender_compare(?:\([^)]*\))?`?/g, '对比卡片')
    .replace(/`?\brender_roadmap(?:\([^)]*\))?`?/g, '学习路线图')
    .replace(/`?\brender_chart(?:\([^)]*\))?`?/g, '数据图表')
    .replace(/`?\brender_quiz(?:\([^)]*\))?`?/g, '自测选择题')
    .replace(/`?\brender_question(?:\([^)]*\))?`?/g, '开放问答题')
    .replace(/`?\b(?:sourceIds|sourceId)\b`?/g, '资料标识')
    .replace(/`?\bchunkId\b`?/g, '片段标识')
    .replace(/`?\bchunks?\b`?/gi, '知识片段')
    .replace(/`?\bhasOverview\b`?/g, '总览可用状态')
    .replace(/`?\b(?:hasMore|nextOffset)\b`?/g, '分页状态')
    .replace(/(?:调用|使用|通过|先用|再用|继续|执行)\s*`?\bsearch\b`?/g, '检索资料')
    .replace(/`search`/g, '检索资料')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+(?=\n|$)/gm, '')
}

/** Strips leaked internal tool identifiers and prompt rules from reasoning while preserving fenced code. */
export function sanitizeMobileReasoningText(raw: string): string {
  if (!raw) return ''
  const fenceRegex = /```[\s\S]*?(?:```|$)/g
  let out = ''
  let lastIndex = 0
  let match = fenceRegex.exec(raw)
  while (match) {
    if (match.index > lastIndex) {
      out += sanitizeReasoningSegment(raw.slice(lastIndex, match.index))
    }
    out += match[0]
    lastIndex = match.index + match[0].length
    match = fenceRegex.exec(raw)
  }
  if (lastIndex < raw.length) {
    out += sanitizeReasoningSegment(raw.slice(lastIndex))
  }
  return out
}

export function normalizeMobileToolTraceStatus(raw: unknown): MobileChatToolStep['status'] {
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (normalized === 'failed' || normalized === 'error') return 'FAILED'
  if (normalized === 'running' || normalized === 'started') return 'RUNNING'
  return 'COMPLETED'
}

export function buildFallbackProcessTimeline(
  reasoningText: string,
  tools: readonly MobileChatToolStep[],
): MobileChatProcessItem[] {
  const timeline: MobileChatProcessItem[] = []
  if (reasoningText) {
    timeline.push({ id: 'reasoning:0', kind: 'reasoning', text: reasoningText })
  }
  for (const tool of tools) {
    timeline.push({ id: `tool:${tool.id || timeline.length}`, kind: 'tool', tool })
  }
  return timeline
}

export function mergeProcessTimelineTools(
  existingTimeline: readonly MobileChatProcessItem[],
  reasoningText: string,
  tools: readonly MobileChatToolStep[],
): MobileChatProcessItem[] {
  if (tools.length === 0) {
    return existingTimeline.length > 0
      ? [...existingTimeline]
      : buildFallbackProcessTimeline(reasoningText, tools)
  }
  if (existingTimeline.length === 0) {
    return buildFallbackProcessTimeline(reasoningText, tools)
  }
  const byId = new Map<string, MobileChatToolStep>()
  for (const tool of tools) {
    byId.set(tool.id, tool)
  }
  const seenIds = new Set<string>()
  const nextTimeline: MobileChatProcessItem[] = []
  for (const item of existingTimeline) {
    if (item.kind === 'reasoning') {
      nextTimeline.push(item)
      continue
    }
    const updated = byId.get(item.tool.id)
    if (updated) {
      seenIds.add(updated.id)
      nextTimeline.push({ id: `tool:${updated.id}`, kind: 'tool', tool: updated })
    } else {
      seenIds.add(item.tool.id)
      nextTimeline.push(item)
    }
  }
  for (const tool of tools) {
    if (!seenIds.has(tool.id)) {
      nextTimeline.push({ id: `tool:${tool.id}`, kind: 'tool', tool })
    }
  }
  return nextTimeline
}

export function projectToolTraceSteps(rawTrace: unknown): MobileChatToolStep[] {
  if (!Array.isArray(rawTrace)) return []
  const steps: MobileChatToolStep[] = []
  for (let i = 0; i < rawTrace.length; i += 1) {
    const entry = rawTrace[i]
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : '工具'
    const rawLabel = typeof item.label === 'string' ? item.label.trim() : ''
    const status = normalizeMobileToolTraceStatus(item.status)
    const id = typeof item.id === 'string' && item.id
      ? item.id
      : (typeof item.toolCallId === 'string' && item.toolCallId ? item.toolCallId : `trace-${i}`)
    steps.push({
      id,
      name,
      label: formatAiToolLabel(name, rawLabel),
      status,
    })
  }
  return steps
}

/** Formats tool step status for display inside the collapsible process block. */
export function formatAiToolStatus(status: MobileChatToolStep['status']): string {
  if (status === 'RUNNING') return '进行中'
  if (status === 'FAILED') return '未完成'
  return '已完成'
}

/** Builds a ReadingContext payload for the first turn of an UNBOUND chat, omitting it once BOUND. */
export function buildMobileReadingContext(
  subjectId: string | null | undefined,
  scopeState: 'UNBOUND' | 'BOUND' = 'UNBOUND',
): ReadingContext | undefined {
  if (scopeState === 'BOUND') return undefined
  const normalized = subjectId?.trim()
  if (!normalized) return undefined
  return {
    subjectId: normalized,
    retrievalMode: 'SUBJECT',
  }
}

/** Safely decodes a route query parameter without throwing URIError on literal percent signs. */
export function safeDecodeQueryParam(value: unknown): string {
  if (value === undefined || value === null) return ''
  const raw = String(value)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** Resolves bound/unbound scope metadata from a conversation DTO and local subject names. */
export function resolveConversationScope(
  conversation: Pick<ConversationView, 'chatScopeState' | 'chatScope'>,
  subjects: readonly SubjectScopeEntry[],
): ResolvedConversationScope {
  if (conversation.chatScopeState !== 'BOUND') {
    return { locked: false, subjectId: null, label: '全部资料' }
  }

  const scope = conversation.chatScope
  if (!scope) {
    return { locked: true, subjectId: null, label: '全部资料' }
  }

  const subjectName = scope.subjectId
    ? subjects.find(item => item.id === scope.subjectId)?.name?.trim()
    : undefined
  const baseLabel = subjectName || '指定学科'
  const hasSpecificSources = Boolean(scope.currentSourceId)
    || (Array.isArray(scope.sourceIds) && scope.sourceIds.length > 0)
  return {
    locked: true,
    subjectId: scope.subjectId || null,
    label: hasSpecificSources ? `${baseLabel} · 指定资料` : baseLabel,
  }
}

/** Returns whether the user is currently allowed to open and change the retrieval scope. */
export function canSelectMobileScope(state: {
  isTyping: boolean
  isStopping?: boolean
  scopeLocked: boolean
}): boolean {
  return !state.isTyping && !state.isStopping && !state.scopeLocked
}

/** Produces dynamic empty-state starter prompts tied to the currently selected scope. */
export function buildMobileStarterPrompts(subjectName: string | null | undefined): string[] {
  const trimmed = subjectName?.trim()
  if (!trimmed) {
    return [
      '梳理本周待复习重点',
      '对比易混淆概念',
      '生成 3 道自测练习题',
    ]
  }
  return [
    `梳理《${trimmed}》重点脉络`,
    `对比《${trimmed}》易混概念`,
    `基于《${trimmed}》出 3 道自测题`,
  ]
}

/** Formats concrete knowledge/subject anchor copy for the welcome hero subtitle. */
export function formatMobileAiScopeAnchor(input: {
  selectedSubject: { blockCount?: number; fileCount?: number } | null
  subjects: readonly { blockCount?: number; fileCount?: number }[]
  totalBlockCount?: number
}): string {
  if (input.selectedSubject) {
    const blocks = Math.max(0, input.selectedSubject.blockCount ?? 0)
    const files = Math.max(0, input.selectedSubject.fileCount ?? 0)
    if (files > 0) {
      return `已限定本学科 · ${files} 份资料 · ${blocks} 个知识块`
    }
    return `已限定本学科 · ${blocks} 个知识块`
  }

  const subjectCount = input.subjects.length
  const derivedBlocks = input.subjects.reduce((sum, item) => sum + Math.max(0, item.blockCount ?? 0), 0)
  const blocks = typeof input.totalBlockCount === 'number' && input.totalBlockCount >= 0
    ? input.totalBlockCount
    : derivedBlocks

  if (subjectCount > 0) {
    return `已关联 ${subjectCount} 门学科 · ${blocks} 个知识块`
  }
  if (blocks > 0) {
    return `已关联 ${blocks} 个知识块`
  }
  return '可自由提问，或先同步学科与知识块'
}

/** Returns whether a conversation can accept new protocol-1 turns. */
export function isConversationProtocolSupported(
  conversation: Pick<ConversationView, 'chatSupported' | 'chatProtocolVersion'>,
): boolean {
  return conversation.chatSupported !== false
    && (conversation.chatProtocolVersion === undefined || conversation.chatProtocolVersion === 1)
}

/** Extracts visible Markdown text from a persisted MessageView. */
export function extractHistoryMessageContent(message: Pick<MessageView, 'content' | 'parts'>): string {
  if (typeof message.content === 'string' && message.content.length > 0) {
    return message.content
  }
  if (!Array.isArray(message.parts)) return ''
  return message.parts
    .filter((part): part is { kind: string; text: string } => (
      typeof part === 'object'
      && part !== null
      && part.kind === 'text'
      && typeof part.text === 'string'
    ))
    .map(part => part.text)
    .join('\n')
}

/** Creates an initial assistant placeholder message before streaming begins. */
export function createAssistantPlaceholder(
  id: string,
  originatingKind: 'turn' | 'activity_submission' = 'turn',
): MobileChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    parts: [],
    reasoningText: '',
    tools: [],
    processTimeline: [],
    processExpanded: false,
    processManuallyToggled: false,
    status: 'streaming',
    originatingKind,
  }
}

/** Appends a reasoning delta and keeps the process drawer open before answer text starts. */
export function applyReasoningDelta(message: MobileChatMessage, delta: string): MobileChatMessage {
  if (!delta) return message
  const shouldExpand = !message.content && !message.processManuallyToggled
    ? true
    : message.processExpanded
  const nextTimeline = [...message.processTimeline]
  const lastItem = nextTimeline[nextTimeline.length - 1]
  if (lastItem && lastItem.kind === 'reasoning') {
    nextTimeline[nextTimeline.length - 1] = { ...lastItem, text: lastItem.text + delta }
  } else {
    nextTimeline.push({ id: `reasoning:${nextTimeline.length}`, kind: 'reasoning', text: delta })
  }
  return {
    ...message,
    reasoningText: message.reasoningText + delta,
    processTimeline: nextTimeline,
    processExpanded: shouldExpand,
  }
}

/** Applies a tool lifecycle event to the assistant message's ordered step list and chronological timeline. */
export function applyToolEvent(message: MobileChatMessage, event: ChatToolEvent): MobileChatMessage {
  const status: MobileChatToolStep['status'] = event.phase === 'started'
    ? 'RUNNING'
    : event.phase === 'completed'
      ? 'COMPLETED'
      : 'FAILED'
  const label = formatAiToolLabel(event.name, event.label)
  const nextTools = [...message.tools]

  let matchIndex = -1
  if (event.toolCallId) {
    matchIndex = nextTools.findIndex(item => item.id === event.toolCallId)
  } else if (event.phase !== 'started') {
    for (let i = nextTools.length - 1; i >= 0; i -= 1) {
      if (nextTools[i].name === event.name && nextTools[i].status === 'RUNNING') {
        matchIndex = i
        break
      }
    }
  }

  let updatedTool: MobileChatToolStep
  if (matchIndex >= 0) {
    updatedTool = {
      ...nextTools[matchIndex],
      name: event.name || nextTools[matchIndex].name,
      label: event.label?.trim() ? label : nextTools[matchIndex].label || label,
      status,
      errorCode: event.safeErrorCode,
    }
    nextTools[matchIndex] = updatedTool
  } else {
    const id = event.toolCallId || `${event.name || 'tool'}-${nextTools.length + 1}`
    updatedTool = {
      id,
      name: event.name,
      label,
      status,
      errorCode: event.safeErrorCode,
    }
    nextTools.push(updatedTool)
  }

  const nextTimeline = [...message.processTimeline]
  const timelineIndex = nextTimeline.findIndex(
    item => item.kind === 'tool' && item.tool.id === updatedTool.id,
  )
  if (timelineIndex >= 0) {
    nextTimeline[timelineIndex] = { id: `tool:${updatedTool.id}`, kind: 'tool', tool: updatedTool }
  } else {
    nextTimeline.push({ id: `tool:${updatedTool.id}`, kind: 'tool', tool: updatedTool })
  }

  const shouldExpand = !message.content && !message.processManuallyToggled
    ? true
    : message.processExpanded

  return {
    ...message,
    tools: nextTools,
    processTimeline: nextTimeline,
    processExpanded: shouldExpand,
  }
}

/** Appends streamed public answer text and auto-collapses the process drawer unless pinned open. */
export function applyContentDelta(message: MobileChatMessage, delta: string): MobileChatMessage {
  if (!delta) return message
  return {
    ...message,
    content: message.content + delta,
    processExpanded: message.processManuallyToggled ? message.processExpanded : false,
  }
}

/** Finalizes an assistant message after stream completion, cancellation, or failure. */
export function applyTerminalState(
  message: MobileChatMessage,
  status: 'completed' | 'cancelled' | 'failed',
  errorMessage?: string,
): MobileChatMessage {
  const settledStatus: MobileChatToolStep['status'] = status === 'completed' ? 'COMPLETED' : 'FAILED'
  const settleTool = (step: MobileChatToolStep): MobileChatToolStep => (
    step.status === 'RUNNING' ? { ...step, status: settledStatus } : step
  )
  const settledTools = message.tools.map(settleTool)
  const settledTimeline = message.processTimeline.map(item => (
    item.kind === 'tool' ? { ...item, tool: settleTool(item.tool) } : item
  ))
  return {
    ...message,
    parts: status === 'completed' ? message.parts : markPendingMobileBlocksInvalid(message.parts),
    tools: settledTools,
    processTimeline: settledTimeline,
    status,
    errorMessage,
    processExpanded: message.processManuallyToggled ? message.processExpanded : false,
  }
}

/** Produces single-line waiting status text before the first answer token arrives. */
export function resolveWaitingStatusText(
  tools: readonly MobileChatToolStep[],
  hasReasoning: boolean,
): string {
  const runningTool = tools.find(step => step.status === 'RUNNING')
  if (runningTool) {
    if (runningTool.label && runningTool.label !== '检索资料') {
      return `正在${runningTool.label}…`
    }
    return runningTool.name === 'search' ? '正在检索相关知识块…' : `${runningTool.label}中…`
  }
  if (hasReasoning) return '深度思考中…'
  return '正在检索相关知识块…'
}

/** Produces the single-line summary title shown in the process accordion header. */
export function resolveProcessSummary(
  message: {
    reasoningText: string
    tools: readonly MobileChatToolStep[]
    status: MobileChatMessage['status']
    content: string
  },
): string {
  const hasReasoning = Boolean(message.reasoningText.trim())
  const toolCount = message.tools.length
  const runningTool = message.tools.find(step => step.status === 'RUNNING')

  if (message.status === 'streaming' && !message.content) {
    if (runningTool) return `正在${runningTool.label}…`
    if (hasReasoning) return '深度思考中…'
    return '正在检索相关资料…'
  }

  if (hasReasoning && toolCount > 0) return `已思考 · ${toolCount} 步检索`
  if (hasReasoning) return '已深度思考'
  if (toolCount > 0) {
    const hasFailed = message.tools.some(step => step.status === 'FAILED')
    return hasFailed && !message.content ? '检索未完成' : `已检索 ${toolCount} 步`
  }
  return '过程详情'
}

/** Restores persisted messages and reconciles any active or recovering run from ConversationView. */
export function restoreConversationMessages(detail: ConversationView): MobileChatMessage[] {
  const activeRun = detail.activeRun
  const activeReplyId = activeRun?.currentReplyMessageId
  const restored: MobileChatMessage[] = []
  const rawMessages = detail.messages || []

  for (let index = 0; index < rawMessages.length; index += 1) {
    const rawMsg = rawMessages[index]
    if (rawMsg.role !== 'USER' && rawMsg.role !== 'ASSISTANT') continue
    const id = rawMsg.id || `hist-${index}`
    const isAssistant = rawMsg.role === 'ASSISTANT'
    const record = rawMsg as unknown as Record<string, unknown>
    const parts = isAssistant ? projectMobileChatParts(rawMsg.parts) : []
    const tools = isAssistant ? projectToolTraceSteps(record.tools) : []
    const reasoningText = isAssistant && typeof record.reasoningText === 'string' ? record.reasoningText : ''
    const originatingKind = record.originatingKind === 'activity_submission' ? 'activity_submission' : 'turn'
    const status: MobileChatMessage['status'] = rawMsg.status === 'FAILED'
      ? 'failed'
      : rawMsg.status === 'INTERRUPTED'
        ? 'cancelled'
        : 'completed'

    const base: MobileChatMessage = {
      id,
      role: isAssistant ? 'assistant' : 'user',
      content: extractHistoryMessageContent(rawMsg),
      parts,
      runId: typeof record.runId === 'string' ? record.runId : undefined,
      reasoningText,
      tools,
      processTimeline: buildFallbackProcessTimeline(reasoningText, tools),
      processExpanded: false,
      processManuallyToggled: false,
      status,
      originatingKind,
      errorMessage: rawMsg.status === 'FAILED' ? '该条回答未能完成' : undefined,
    }

    if (activeRun && activeReplyId && id === activeReplyId) {
      const snapshotParts = Array.isArray(activeRun.publicSnapshot) && activeRun.publicSnapshot.length > 0
        ? projectMobileChatParts(activeRun.publicSnapshot)
        : base.parts
      const snapshotTools = Array.isArray(activeRun.toolTrace) && activeRun.toolTrace.length > 0
        ? projectToolTraceSteps(activeRun.toolTrace)
        : base.tools
      const snapshotContent = snapshotParts.length > 0 ? extractPartsPlainText(snapshotParts) : base.content
      const isRunning = Boolean(activeRun.executionActive && activeRun.status !== 'UNKNOWN')
      restored.push({
        ...base,
        parts: snapshotParts,
        tools: snapshotTools,
        content: snapshotContent,
        runId: activeRun.runId || base.runId,
        processTimeline: buildFallbackProcessTimeline(base.reasoningText, snapshotTools),
        status: isRunning ? 'streaming' : activeRun.status === 'COMPLETED' ? 'completed' : 'failed',
        processExpanded: isRunning && !snapshotContent,
      })
      continue
    }

    restored.push(base)
  }

  if (activeRun && activeReplyId && !restored.some(item => item.id === activeReplyId)) {
    const snapshotParts = projectMobileChatParts(activeRun.publicSnapshot)
    const snapshotTools = projectToolTraceSteps(activeRun.toolTrace)
    const snapshotContent = extractPartsPlainText(snapshotParts)
    const isRunning = Boolean(activeRun.executionActive && activeRun.status !== 'UNKNOWN')
    restored.push({
      id: activeReplyId,
      role: 'assistant',
      content: snapshotContent,
      parts: snapshotParts,
      runId: activeRun.runId,
      reasoningText: '',
      tools: snapshotTools,
      processTimeline: buildFallbackProcessTimeline('', snapshotTools),
      processExpanded: isRunning && !snapshotContent,
      processManuallyToggled: false,
      status: isRunning ? 'streaming' : activeRun.status === 'COMPLETED' ? 'completed' : 'failed',
      originatingKind: 'turn',
      errorMessage: !isRunning && activeRun.status !== 'COMPLETED' ? '该条回答未能完成' : undefined,
    })
  }

  return restored
}

/** Merges polled ChatRunStatusView progress into restored chat messages. */
export function applyRunStatusSnapshot(
  messages: readonly MobileChatMessage[],
  statusView: ChatRunStatusView,
): MobileChatMessage[] {
  const replyId = statusView.currentReplyMessageId
  if (!replyId) return [...messages]

  const snapshotParts = projectMobileChatParts(statusView.publicSnapshot)
  const snapshotTools = projectToolTraceSteps(statusView.toolTrace)
  const snapshotContent = extractPartsPlainText(snapshotParts)
  const isRunning = Boolean(statusView.executionActive && statusView.status !== 'UNKNOWN')
  const nextStatus: MobileChatMessage['status'] = isRunning
    ? 'streaming'
    : statusView.status === 'COMPLETED'
      ? 'completed'
      : statusView.status === 'CANCELLED'
        ? 'cancelled'
        : 'failed'

  const existingIndex = messages.findIndex(item => (
    item.id === replyId
    || (Boolean(statusView.runId) && item.role === 'assistant' && item.runId === statusView.runId)
  ))
  if (existingIndex < 0) {
    return [
      ...messages,
      {
        id: replyId,
        role: 'assistant',
        content: snapshotContent,
        parts: snapshotParts,
        runId: statusView.runId,
        reasoningText: '',
        tools: snapshotTools,
        processTimeline: buildFallbackProcessTimeline('', snapshotTools),
        processExpanded: isRunning && !snapshotContent,
        processManuallyToggled: false,
        status: nextStatus,
        originatingKind: 'turn',
        errorMessage: nextStatus === 'failed' ? '该条回答未能完成' : undefined,
      },
    ]
  }

  const next = [...messages]
  const existing = next[existingIndex]
  const finalParts = snapshotParts.length > 0 ? snapshotParts : existing.parts
  const finalTools = snapshotTools.length > 0 ? snapshotTools : existing.tools
  next[existingIndex] = {
    ...existing,
    runId: statusView.runId || existing.runId,
    parts: finalParts,
    tools: finalTools,
    content: snapshotContent || existing.content,
    processTimeline: mergeProcessTimelineTools(existing.processTimeline, existing.reasoningText, finalTools),
    status: nextStatus,
    processExpanded: isRunning && !snapshotContent && !existing.processManuallyToggled
      ? true
      : (!isRunning && !existing.processManuallyToggled ? false : existing.processExpanded),
    errorMessage: nextStatus === 'failed'
      ? (statusView.status === 'UNKNOWN' ? '连接状态未知，请点击重试或重新打开对话' : '该条回答未能完成')
      : undefined,
  }
  return next
}

export const SMART_SCROLL_THRESHOLD_PX = 50

export interface SmartScrollSample {
  scrollTop: number
  scrollHeight: number
  viewportHeight: number
  prevScrollTop: number
  touchPullUpDetected?: boolean
}

export interface SmartScrollDecision {
  nearBottom: boolean
  locked: boolean
  nextPrevScrollTop: number
}

/** Evaluates auto-scroll attachment against the 50px bottom threshold and upward scroll intent. */
export function evaluateSmartScroll(
  sample: SmartScrollSample,
  currentlyLocked: boolean,
  isProgrammatic = false,
): SmartScrollDecision {
  const safeViewport = Math.max(0, sample.viewportHeight)
  const distanceFromBottom = sample.scrollHeight - (sample.scrollTop + safeViewport)
  const nearBottom = distanceFromBottom < SMART_SCROLL_THRESHOLD_PX
  const scrolledUpByDelta = sample.scrollTop < sample.prevScrollTop - 4

  if (isProgrammatic && !sample.touchPullUpDetected) {
    return {
      nearBottom,
      locked: currentlyLocked && !nearBottom,
      nextPrevScrollTop: sample.scrollTop,
    }
  }

  if (nearBottom && !sample.touchPullUpDetected) {
    return {
      nearBottom: true,
      locked: false,
      nextPrevScrollTop: sample.scrollTop,
    }
  }

  if (sample.touchPullUpDetected || scrolledUpByDelta) {
    return {
      nearBottom: false,
      locked: true,
      nextPrevScrollTop: sample.scrollTop,
    }
  }

  return {
    nearBottom,
    locked: currentlyLocked ? true : !nearBottom,
    nextPrevScrollTop: sample.scrollTop,
  }
}

/** Derives a concise knowledge block title from an assistant answer or preceding user question. */
export function deriveKnowledgeBlockTitle(userPrompt: string, assistantContent: string): string {
  const stripSyntax = (line: string) => line
    .replace(/^[#>*\-\d.\s]+/, '')
    .replace(/[*_`~$]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()

  const firstHeadingOrLine = assistantContent
    .split(/\r?\n/)
    .map(stripSyntax)
    .find(line => line.length >= 2)
  const candidate = firstHeadingOrLine || stripSyntax(userPrompt) || 'AI 学习笔记'
  return candidate.length > 28 ? `${candidate.slice(0, 28)}…` : candidate
}
