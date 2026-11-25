import type { ChatProcessTimelineItem, ChatToolActivity } from '../services/aiStreamReducer.ts'

const ASCII_TOOL_LABELS: Record<string, string> = {
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

export interface ToolDisplayInput {
  name: string
  label?: string
}

/** Formats a backend tool entry into a concise user-facing Chinese capsule label. */
export function formatToolCapsuleLabel(tool: ToolDisplayInput): string {
  const explicit = tool.label?.trim()
  if (explicit) return explicit
  const normalized = tool.name.trim()
  if (normalized in ASCII_TOOL_LABELS) return ASCII_TOOL_LABELS[normalized]
  if (normalized.startsWith('render_')) return '生成展示卡片'
  return normalized || '检索资料'
}

function sanitizeReasoningSegment(segment: string): string {
  return segment
    // Remove verbatim leaked system-prompt rules if echoed in reasoning
    .replace(/(?:^|\n)[ \t]*(?:规则|系统规则|提示词规则|注意)[：:]\s*(?:总览是\s*AI\s*生成内容|本轮显式授权范围|列完目录只代表枚举了资料)[^\n]*/gi, '')
    .replace(/总览是\s*AI\s*生成内容[，,]?\s*不是原文逐字事实[，,]?\s*需要细节或引用时继续搜索或阅读原文摘录[。.]?/gi, '')
    // Replace internal tool names & protocol field identifiers with natural Chinese descriptions
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

/** Strips leaked internal tool identifiers and prompt rules from reasoning text while keeping fenced code intact. */
export function sanitizeReasoningText(raw: string): string {
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

export type VisibleProcessTimelineGroup =
  | { id: string; kind: 'reasoning'; text: string }
  | { id: string; kind: 'tools'; tools: readonly ChatToolActivity[] }

/** Splits interleaved reasoning and tool steps into renderable groups gated by smoothed char progress. */
export function buildVisibleProcessTimelineGroups(
  timeline: readonly ChatProcessTimelineItem[],
  revealedLimit: number,
): VisibleProcessTimelineGroup[] {
  const groups: VisibleProcessTimelineGroup[] = []
  let consumedReasoningChars = 0

  for (const item of timeline) {
    if (item.kind === 'tool') {
      const prev = groups[groups.length - 1]
      if (prev && prev.kind === 'tools') {
        groups[groups.length - 1] = { id: prev.id, kind: 'tools', tools: [...prev.tools, item.tool] }
      } else {
        groups.push({ id: item.id, kind: 'tools', tools: [item.tool] })
      }
      continue
    }

    const remaining = revealedLimit - consumedReasoningChars
    if (remaining <= 0) {
      break
    }

    const available = Math.min(item.text.length, remaining)
    consumedReasoningChars += item.text.length

    const sanitized = sanitizeReasoningText(item.text.slice(0, available))
    if (sanitized.trim()) {
      groups.push({
        id: item.id,
        kind: 'reasoning',
        text: sanitized,
      })
    }

    if (available < item.text.length) {
      break
    }
  }

  return groups
}

export type StreamTextDrainAction =
  | 'stream_push'
  | 'finish_drain'
  | 'sync_immediate'
  | 'flush_and_clear'
  | 'reset_and_clear'

export interface StreamTextDrainState {
  streaming: boolean
  settling?: boolean
  partId: string | null
  partKind: 'text' | 'non_text' | 'none'
  partText: string
  activeTextId: string | null
  isActive: boolean
  lastCompletedTextId: string | null
}

/** 统一裁决正文平滑缓冲动作，防止 settling 期内已完成片段反复从头重排或单包直出。 */
export function resolveStreamTextDrainAction(state: StreamTextDrainState): StreamTextDrainAction {
  if (state.partKind !== 'text' || !state.partId) {
    return state.isActive ? 'flush_and_clear' : 'reset_and_clear'
  }
  if (state.streaming) {
    return 'stream_push'
  }
  if (state.isActive && state.activeTextId === state.partId) {
    return 'finish_drain'
  }
  if (state.settling && Boolean(state.partText) && state.lastCompletedTextId !== state.partId) {
    return 'finish_drain'
  }
  return 'sync_immediate'
}

export interface StreamSettlingState {
  streaming: boolean
  settleTimerDone: boolean
  processDraining: boolean
  rendererDraining: boolean
}

export function canFinishStreamSettling(state: StreamSettlingState): boolean {
  return !state.streaming && state.settleTimerDone && !state.processDraining && !state.rendererDraining
}
