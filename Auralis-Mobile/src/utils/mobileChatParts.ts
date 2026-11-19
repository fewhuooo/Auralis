import type { ChatStreamEnvelope } from '../api/aiClient.ts'

export type MobileChatContentState = 'GENERATING' | 'READY' | 'SUBMITTED' | 'INVALID'
export type MobileChatVisualComponent = 'steps' | 'compare' | 'roadmap' | 'chart'
export type MobileChatActivityComponent = 'quiz' | 'question'
export type MobileChatComponent = MobileChatVisualComponent | MobileChatActivityComponent

export type MobileChatActivityDraft = string | readonly string[] | null
export type MobileChatActivityAnswer = string | readonly string[]

export interface MobileChatTextPart {
  id: string
  kind: 'text'
  text: string
}

export interface MobileChatCompareEntry {
  readonly label: string
  readonly text: string
}

export interface MobileChatBlockPart {
  id: string
  componentId: string
  kind: 'block'
  component: MobileChatComponent
  state: MobileChatContentState
  meta: Readonly<Record<string, unknown>>
  items: readonly Readonly<Record<string, unknown>>[]
  questionId?: string
  submittedAnswer?: MobileChatActivityAnswer
}

export type MobileChatContentPart = MobileChatTextPart | MobileChatBlockPart

export interface MobileChatActivitySubmission {
  questionId: string
  answer: MobileChatActivityAnswer
}

const COMPONENTS = new Set<MobileChatComponent>(['steps', 'compare', 'roadmap', 'chart', 'quiz', 'question'])
const STATES = new Set<MobileChatContentState>(['GENERATING', 'READY', 'SUBMITTED', 'INVALID'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function projectOptionalStrings(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (typeof source[key] === 'string') result[key] = source[key]
  }
  return result
}

function projectCompareEntries(value: unknown): MobileChatCompareEntry[] {
  if (!Array.isArray(value)) return []
  const entries: MobileChatCompareEntry[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) continue
    if (!nonEmptyString(candidate.label) || !nonEmptyString(candidate.text)) continue
    entries.push({ label: candidate.label, text: candidate.text })
  }
  return entries
}

function projectMeta(component: MobileChatComponent, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  switch (component) {
    case 'steps':
    case 'compare':
      return projectOptionalStrings(value, ['title', 'description'])
    case 'roadmap': {
      const meta = projectOptionalStrings(value, ['title', 'description'])
      if (typeof value.tag === 'string') meta.tag = value.tag
      if (typeof value.current === 'boolean') meta.current = value.current
      return meta
    }
    case 'chart': {
      const meta = projectOptionalStrings(value, ['title', 'description', 'unit'])
      if (value.chartType === 'bar' || value.chartType === 'proportion') meta.chartType = value.chartType
      return meta
    }
    case 'quiz': {
      const meta = projectOptionalStrings(value, ['question'])
      if (value.questionType === 'single' || value.questionType === 'multiple') {
        meta.questionType = value.questionType
      }
      return meta
    }
    case 'question':
      return projectOptionalStrings(value, ['question', 'placeholder'])
  }
}

function projectItems(component: MobileChatComponent, value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  const result: Record<string, unknown>[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) continue
    switch (component) {
      case 'steps': {
        if (!nonEmptyString(candidate.title)) continue
        result.push({
          title: candidate.title,
          ...projectOptionalStrings(candidate, ['description']),
        })
        break
      }
      case 'compare': {
        if (!nonEmptyString(candidate.title)) continue
        result.push({
          title: candidate.title,
          entries: projectCompareEntries(candidate.entries),
        })
        break
      }
      case 'roadmap': {
        if (!nonEmptyString(candidate.title)) continue
        const item: Record<string, unknown> = {
          title: candidate.title,
          ...projectOptionalStrings(candidate, ['description', 'tag']),
        }
        if (typeof candidate.current === 'boolean') item.current = candidate.current
        result.push(item)
        break
      }
      case 'chart': {
        if (
          !nonEmptyString(candidate.label)
          || typeof candidate.value !== 'number'
          || !Number.isFinite(candidate.value)
          || candidate.value < 0
        ) {
          continue
        }
        result.push({ label: candidate.label, value: candidate.value })
        break
      }
      case 'quiz': {
        if (nonEmptyString(candidate.key) && nonEmptyString(candidate.text)) {
          result.push({ key: candidate.key, text: candidate.text })
        }
        break
      }
      case 'question':
        break
    }
  }
  return result
}

/** Validates whether a quiz or open question block has enough public structure to be actionable. */
export function isMobileActivityStructurallyValid(block: MobileChatBlockPart): boolean {
  if (block.component === 'quiz') {
    if (
      !nonEmptyString(block.meta.question)
      || (block.meta.questionType !== 'single' && block.meta.questionType !== 'multiple')
    ) {
      return false
    }
    if (block.items.length < 2) return false
    const keys = block.items.map(item => item.key)
    return keys.every(nonEmptyString)
      && new Set(keys).size === keys.length
      && block.items.every(item => nonEmptyString(item.text))
  }
  if (block.component === 'question') return nonEmptyString(block.meta.question)
  return false
}

/** Projects a protocol-1 public part strictly within allowlisted fields, dropping private data. */
export function projectMobileChatPart(value: unknown): MobileChatContentPart | null {
  if (!isRecord(value) || !nonEmptyString(value.id)) return null
  if (value.kind === 'text') {
    return typeof value.text === 'string'
      ? { id: value.id, kind: 'text', text: value.text }
      : null
  }
  if (
    value.kind !== 'block'
    || !COMPONENTS.has(value.component as MobileChatComponent)
    || !STATES.has(value.state as MobileChatContentState)
    || !nonEmptyString(value.componentId)
  ) {
    return null
  }

  const component = value.component as MobileChatComponent
  const block: MobileChatBlockPart = {
    id: value.id,
    componentId: value.componentId,
    kind: 'block',
    component,
    state: value.state as MobileChatContentState,
    meta: projectMeta(component, value.meta),
    items: projectItems(component, value.items),
  }

  if (component === 'quiz' || component === 'question') {
    if (nonEmptyString(value.questionId)) block.questionId = value.questionId
    if (
      (block.state === 'READY' || block.state === 'SUBMITTED')
      && (
        !block.questionId
        || !Array.isArray(value.items)
        || block.items.length !== value.items.length
        || !isMobileActivityStructurallyValid(block)
      )
    ) {
      block.state = 'INVALID'
    }
    if (typeof value.submittedAnswer === 'string') {
      block.submittedAnswer = value.submittedAnswer
    } else if (
      Array.isArray(value.submittedAnswer)
      && value.submittedAnswer.every(answer => typeof answer === 'string')
    ) {
      block.submittedAnswer = [...value.submittedAnswer]
    }
  }
  return block
}

/** Projects an array of persisted or streamed public parts into sanitized Mobile content parts. */
export function projectMobileChatParts(value: unknown): MobileChatContentPart[] {
  if (!Array.isArray(value)) return []
  const parts: MobileChatContentPart[] = []
  for (const candidate of value) {
    const projected = projectMobileChatPart(candidate)
    if (projected) parts.push(projected)
  }
  return parts
}

function setPart(
  parts: readonly MobileChatContentPart[],
  rawPart: unknown,
  allowReplaceInvalid: boolean,
): MobileChatContentPart[] {
  const projected = projectMobileChatPart(rawPart)
  if (!projected) return [...parts]

  let index = parts.findIndex((item) => {
    if (item.id === projected.id) return true
    if (item.kind === 'block' && projected.kind === 'block' && item.componentId === projected.componentId) {
      return true
    }
    return false
  })

  if (index < 0 && projected.kind === 'block' && allowReplaceInvalid) {
    let sameComponentInvalidIndex = -1
    let emptyInvalidIndex = -1
    for (let i = parts.length - 1; i >= 0; i -= 1) {
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

  const next = [...parts]
  if (index < 0) {
    next.push(projected)
  } else {
    next[index] = projected
  }
  return next
}

function isItemSubstantive(component: string, row: Record<string, unknown>): boolean {
  if (component === 'quiz') {
    return typeof row.key === 'string' && row.key.trim().length > 0
      && typeof row.text === 'string' && row.text.trim().length > 0
  }
  if (component === 'chart') {
    return typeof row.label === 'string' && row.label.trim().length > 0
      && typeof row.value === 'number' && Number.isFinite(row.value)
  }
  if (typeof row.title === 'string') {
    return row.title.trim().length > 0
  }
  return true
}

function reduceStreamingBlock(
  parts: readonly MobileChatContentPart[],
  envelope: ChatStreamEnvelope,
): MobileChatContentPart[] {
  const { componentId, component, row: rawRow } = envelope.payload
  if (typeof componentId !== 'string' || !componentId.trim() || typeof component !== 'string') {
    return [...parts]
  }

  const previous = parts.find(
    (part): part is MobileChatBlockPart => part.kind === 'block' && part.componentId === componentId,
  )
  const isActivity = component === 'quiz' || component === 'question'
  if (envelope.event === 'block.started') {
    if (previous) return [...parts]
    return setPart(parts, {
      id: componentId,
      componentId,
      kind: 'block',
      component,
      state: 'GENERATING',
      meta: {},
      items: [],
    }, true)
  }

  if (
    !previous
    || previous.state !== 'GENERATING'
    || previous.component !== component
    || !isRecord(rawRow)
  ) {
    return [...parts]
  }

  if (rawRow.type === (isActivity ? 'stem' : 'meta')) {
    return setPart(parts, { ...previous, meta: { ...previous.meta, ...rawRow } }, true)
  }
  if (
    component === 'question'
    || rawRow.type !== (component === 'quiz' ? 'option' : 'item')
    || !isItemSubstantive(component, rawRow)
  ) {
    return [...parts]
  }

  const items = [...previous.items]
  const matchIdx = items.findIndex(item => (
    component === 'quiz'
      ? item.key === rawRow.key
      : typeof item.title === 'string' && item.title === rawRow.title
  ))
  if (matchIdx < 0) {
    items.push(rawRow)
  } else {
    items[matchIdx] = { ...items[matchIdx], ...rawRow }
  }
  return setPart(parts, { ...previous, items }, true)
}

/** Transitions any still-GENERATING block parts into INVALID after failure or cancellation. */
export function markPendingMobileBlocksInvalid(
  parts: readonly MobileChatContentPart[],
): MobileChatContentPart[] {
  let changed = false
  const next = parts.map((part) => {
    if (part.kind === 'block' && part.state === 'GENERATING') {
      changed = true
      return { ...part, state: 'INVALID' as const }
    }
    return part
  })
  return changed ? next : [...parts]
}

/** Applies a protocol-1 SSE envelope to an ordered array of mobile chat content parts. */
export function reduceMobileChatPartEvent(
  parts: readonly MobileChatContentPart[],
  envelope: ChatStreamEnvelope,
  replyIdHint = 'msg',
): MobileChatContentPart[] {
  switch (envelope.event) {
    case 'text.delta': {
      const publicDelta = typeof envelope.payload.publicTextDelta === 'string'
        ? envelope.payload.publicTextDelta
        : ''
      const text = typeof envelope.payload.text === 'string' ? envelope.payload.text : publicDelta
      if (!text) return [...parts]
      const next = [...parts]
      const lastPart = next[next.length - 1]
      if (lastPart && lastPart.kind === 'text') {
        next[next.length - 1] = { ...lastPart, text: lastPart.text + text }
        return next
      }
      const textSegmentIndex = next.filter(item => item.kind === 'text').length
      const replyIdPrefix = envelope.replyMessageId || replyIdHint || 'msg'
      const id = textSegmentIndex === 0 ? `${replyIdPrefix}:text` : `${replyIdPrefix}:text:${textSegmentIndex}`
      next.push({ id, kind: 'text', text })
      return next
    }

    case 'block.started':
    case 'block.item':
      return reduceStreamingBlock(parts, envelope)

    case 'block.completed':
      return setPart(parts, envelope.payload.part, true)

    case 'block.error': {
      const componentId = typeof envelope.payload.componentId === 'string'
        ? envelope.payload.componentId
        : ''
      if (!componentId) return [...parts]
      return parts.map(part => (
        part.kind === 'block' && part.componentId === componentId
          ? { ...part, state: 'INVALID' as const }
          : part
      ))
    }

    case 'activity.ready': {
      const componentId = typeof envelope.payload.componentId === 'string'
        ? envelope.payload.componentId
        : ''
      const questionId = typeof envelope.payload.questionId === 'string'
        ? envelope.payload.questionId
        : (typeof envelope.payload.activityId === 'string' ? envelope.payload.activityId : '')
      if (!componentId || !questionId) return [...parts]
      return parts.map((part) => {
        if (part.kind !== 'block' || part.componentId !== componentId || part.state === 'INVALID') {
          return part
        }
        return {
          ...part,
          questionId,
          state: part.state === 'SUBMITTED' ? 'SUBMITTED' : 'READY',
        }
      })
    }

    case 'activity.submitted': {
      const projected = projectMobileChatPart(envelope.payload.part)
      if (!projected) return [...parts]
      return setPart(parts, projected, false)
    }

    case 'run.failed':
    case 'run.cancelled':
      return markPendingMobileBlocksInvalid(parts)

    default:
      return [...parts]
  }
}

/** Validates an interactive activity draft and builds a submission payload when ready. */
export function createMobileActivitySubmission(
  block: MobileChatBlockPart,
  draft: MobileChatActivityDraft,
  busy: boolean,
): MobileChatActivitySubmission | null {
  if (
    busy
    || block.state !== 'READY'
    || !nonEmptyString(block.questionId)
    || !isMobileActivityStructurallyValid(block)
  ) {
    return null
  }

  let answer: MobileChatActivityAnswer
  if (block.component === 'question') {
    if (typeof draft !== 'string' || !draft.trim()) return null
    answer = draft
  } else if (block.component === 'quiz' && block.meta.questionType === 'single') {
    const validKeys = new Set(block.items.map(item => item.key))
    if (typeof draft !== 'string' || !validKeys.has(draft)) return null
    answer = draft
  } else if (block.component === 'quiz' && block.meta.questionType === 'multiple') {
    const validKeys = new Set(block.items.map(item => item.key))
    if (
      !Array.isArray(draft)
      || draft.length === 0
      || draft.some(key => typeof key !== 'string' || !validKeys.has(key))
      || new Set(draft).size !== draft.length
    ) {
      return null
    }
    answer = [...draft]
  } else {
    return null
  }

  return { questionId: block.questionId, answer }
}

/** Safely normalizes finite non-negative chart values into [0, 1] ratios without NaN/Infinity. */
export function getMobileChartRatios(block: MobileChatBlockPart): number[] {
  const values = block.items.map(item => item.value)
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    return []
  }
  const numbers = values as number[]
  const maximum = Math.max(0, ...numbers)
  if (maximum === 0) return numbers.map(() => 0)
  const scaled = numbers.map(value => value / maximum)
  const total = scaled.reduce((sum, value) => sum + value, 0)
  if (total === 0) return numbers.map(() => 0)
  return scaled.map(value => value / total)
}

/** Extracts user-visible Markdown/plain text across ordered chat parts for copy or block saving. */
export function extractPartsPlainText(
  parts: readonly MobileChatContentPart[],
  fallbackText = '',
): string {
  if (parts.length === 0) return fallbackText

  const segments: string[] = []
  for (const part of parts) {
    if (part.kind === 'text') {
      if (part.text.trim()) segments.push(part.text)
      continue
    }

    const lines: string[] = []
    const title = typeof part.meta.title === 'string'
      ? part.meta.title.trim()
      : (typeof part.meta.question === 'string' ? part.meta.question.trim() : '')
    if (title) lines.push(title)
    if (typeof part.meta.description === 'string' && part.meta.description.trim()) {
      lines.push(part.meta.description.trim())
    }

    for (let i = 0; i < part.items.length; i += 1) {
      const item = part.items[i]
      if (part.component === 'steps' || part.component === 'roadmap') {
        const itemTitle = typeof item.title === 'string' ? item.title.trim() : ''
        const desc = typeof item.description === 'string' ? item.description.trim() : ''
        if (itemTitle) lines.push(`${i + 1}. ${itemTitle}${desc ? `：${desc}` : ''}`)
      } else if (part.component === 'compare') {
        const dimTitle = typeof item.title === 'string' ? item.title.trim() : ''
        const entries = projectCompareEntries(item.entries)
          .map(entry => `${entry.label}: ${entry.text}`)
          .join('；')
        if (dimTitle || entries) lines.push([dimTitle, entries].filter(Boolean).join(' — '))
      } else if (part.component === 'chart') {
        const label = typeof item.label === 'string' ? item.label.trim() : ''
        const unit = typeof part.meta.unit === 'string' ? part.meta.unit : ''
        if (label && typeof item.value === 'number') {
          lines.push(`- ${label}: ${item.value}${unit}`)
        }
      } else if (part.component === 'quiz') {
        const key = typeof item.key === 'string' ? item.key.trim() : ''
        const optText = typeof item.text === 'string' ? item.text.trim() : ''
        if (key && optText) lines.push(`${key}. ${optText}`)
      }
    }

    if (lines.length > 0) segments.push(lines.join('\n'))
  }

  return segments.length > 0 ? segments.join('\n\n') : fallbackText
}
