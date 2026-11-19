import type { components } from '../api/generated/schema.ts'
import type { ChatToolEvent } from '../api/aiClient.ts'
import { markPendingMobileBlocksInvalid, type MobileChatContentPart } from './mobileChatParts.ts'

type ReadingContext = components['schemas']['ReadingContext']
type ConversationView = components['schemas']['ConversationView']
type MessageView = components['schemas']['MessageView']

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

export interface MobileChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  parts: MobileChatContentPart[]
  runId?: string
  reasoningText: string
  tools: MobileChatToolStep[]
  processExpanded: boolean
  processManuallyToggled: boolean
  status: 'streaming' | 'completed' | 'cancelled' | 'failed'
  errorMessage?: string
}

export interface ResolvedConversationScope {
  locked: boolean
  subjectId: string | null
  label: string
}

const TOOL_LABELS: Record<string, string> = {
  search: '检索资料',
  list_sources: '浏览资料目录',
  read_source_excerpt: '阅读资料片段',
  read_source_overview: '读取资料总览',
}

/** Maps a backend tool name into a concise user-facing label. */
export function formatAiToolLabel(toolName: string): string {
  const normalized = toolName.trim()
  if (normalized in TOOL_LABELS) return TOOL_LABELS[normalized]
  if (normalized.startsWith('render_')) return '整理展示内容'
  return '检索与分析'
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
export function createAssistantPlaceholder(id: string): MobileChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    parts: [],
    reasoningText: '',
    tools: [],
    processExpanded: false,
    processManuallyToggled: false,
    status: 'streaming',
  }
}

/** Appends a reasoning delta and keeps the process drawer open before answer text starts. */
export function applyReasoningDelta(message: MobileChatMessage, delta: string): MobileChatMessage {
  if (!delta) return message
  const shouldExpand = !message.content && !message.processManuallyToggled
    ? true
    : message.processExpanded
  return {
    ...message,
    reasoningText: message.reasoningText + delta,
    processExpanded: shouldExpand,
  }
}

/** Applies a tool lifecycle event to the assistant message's ordered step list. */
export function applyToolEvent(message: MobileChatMessage, event: ChatToolEvent): MobileChatMessage {
  const status: MobileChatToolStep['status'] = event.phase === 'started'
    ? 'RUNNING'
    : event.phase === 'completed'
      ? 'COMPLETED'
      : 'FAILED'
  const label = formatAiToolLabel(event.name)
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

  if (matchIndex >= 0) {
    nextTools[matchIndex] = {
      ...nextTools[matchIndex],
      status,
      errorCode: event.safeErrorCode,
    }
  } else {
    const id = event.toolCallId || `${event.name || 'tool'}-${nextTools.length + 1}`
    nextTools.push({
      id,
      name: event.name,
      label,
      status,
      errorCode: event.safeErrorCode,
    })
  }

  const shouldExpand = !message.content && !message.processManuallyToggled
    ? true
    : message.processExpanded

  return {
    ...message,
    tools: nextTools,
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
  const settledTools = message.tools.map(step => (
    step.status === 'RUNNING'
      ? { ...step, status: (status === 'completed' ? 'COMPLETED' : 'FAILED') as MobileChatToolStep['status'] }
      : step
  ))
  return {
    ...message,
    parts: status === 'completed' ? message.parts : markPendingMobileBlocksInvalid(message.parts),
    tools: settledTools,
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
    return runningTool.name === 'search' ? '正在检索相关知识块…' : `${runningTool.label}中…`
  }
  if (hasReasoning) return '深度思考中…'
  return '正在检索相关知识块…'
}

/** Produces the single-line summary title shown in the process accordion header. */
export function resolveProcessSummary(
  message: Pick<MobileChatMessage, 'reasoningText' | 'tools' | 'status' | 'content'>,
): string {
  const hasReasoning = Boolean(message.reasoningText.trim())
  const toolCount = message.tools.length
  const runningTool = message.tools.find(step => step.status === 'RUNNING')

  if (message.status === 'streaming' && !message.content) {
    if (runningTool) return `${runningTool.label}中…`
    if (hasReasoning) return '深度思考中…'
    return '思考中…'
  }

  if (hasReasoning && toolCount > 0) return `已思考 · ${toolCount} 步检索`
  if (hasReasoning) return '已深度思考'
  if (toolCount > 0) {
    const hasFailed = message.tools.some(step => step.status === 'FAILED')
    return hasFailed && !message.content ? '检索未完成' : `已检索 ${toolCount} 步`
  }
  return '过程详情'
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
): SmartScrollDecision {
  const safeViewport = Math.max(0, sample.viewportHeight)
  const distanceFromBottom = sample.scrollHeight - (sample.scrollTop + safeViewport)
  const nearBottom = distanceFromBottom < SMART_SCROLL_THRESHOLD_PX
  const scrolledUpByDelta = sample.scrollTop < sample.prevScrollTop - 4

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
