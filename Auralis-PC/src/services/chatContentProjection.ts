import type {
  ChatActivityAnswer,
  ChatActivityDraft,
  ChatActivitySubmission,
  ChatBlockPart,
  ChatComponent,
  ChatContentPart,
  ChatContentProjectionState,
  ChatContentState,
} from '@/types/chatContent'

const components = new Set<ChatComponent>(['steps', 'compare', 'roadmap', 'chart', 'quiz', 'question'])
const states = new Set<ChatContentState>(['GENERATING', 'READY', 'SUBMITTED', 'INVALID'])

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

function projectEntries(value: unknown): { label: string; text: string }[] {
  if (!Array.isArray(value)) return []
  const entries: { label: string; text: string }[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) continue
    if (!nonEmptyString(candidate.label) || !nonEmptyString(candidate.text)) continue
    entries.push({
      label: candidate.label,
      text: candidate.text,
    })
  }
  return entries
}

function projectMeta(component: ChatComponent, value: unknown): Record<string, unknown> {
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
      if (typeof value.stem === 'string' && !meta.question) {
        meta.question = value.stem
      } else if (typeof value.title === 'string' && !meta.question) {
        meta.question = value.title
      }
      if (value.questionType === 'single' || value.questionType === 'multiple') {
        meta.questionType = value.questionType
      }
      return meta
    }
    case 'question': {
      const meta = projectOptionalStrings(value, ['question', 'placeholder'])
      if (typeof value.stem === 'string' && !meta.question) {
        meta.question = value.stem
      } else if (typeof value.title === 'string' && !meta.question) {
        meta.question = value.title
      }
      return meta
    }
  }
}

function projectItems(component: ChatComponent, value: unknown): Record<string, unknown>[] {
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
          entries: projectEntries(candidate.entries),
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
        if (!nonEmptyString(candidate.label) || typeof candidate.value !== 'number'
          || !Number.isFinite(candidate.value) || candidate.value < 0) continue
        result.push({ label: candidate.label, value: candidate.value })
        break
      }
      case 'quiz': {
        const key = candidate.key ?? candidate.label
        const text = candidate.text ?? candidate.content ?? candidate.title
        if (nonEmptyString(key) && nonEmptyString(text)) {
          result.push({ key, text })
        }
        break
      }
      case 'question':
        break
    }
  }
  return result
}

/** Projects normalized public parts into the small rendering allowlist. Private or unknown fields are dropped. */
export function projectChatContentPart(value: unknown): ChatContentPart | null {
  if (!isRecord(value) || !nonEmptyString(value.id)) return null
  if (value.kind === 'text') {
    return typeof value.text === 'string'
      ? { id: value.id, kind: 'text', text: value.text }
      : null
  }
  if (value.kind !== 'block' || !components.has(value.component as ChatComponent)
    || !states.has(value.state as ChatContentState) || !nonEmptyString(value.componentId)) return null

  const component = value.component as ChatComponent
  const block: ChatBlockPart = {
    id: value.id,
    componentId: value.componentId,
    kind: 'block',
    component,
    state: value.state as ChatContentState,
    meta: projectMeta(component, value.meta),
    items: projectItems(component, value.items),
  }
  if (component === 'quiz' || component === 'question') {
    if (nonEmptyString(value.questionId)) block.questionId = value.questionId
    if (typeof value.submittedAnswer === 'string') {
      block.submittedAnswer = value.submittedAnswer
    } else if (Array.isArray(value.submittedAnswer)
      && value.submittedAnswer.every((answer) => typeof answer === 'string')) {
      block.submittedAnswer = [...value.submittedAnswer]
    }
  }
  return block
}

export function projectChatContentParts(value: unknown): ChatContentPart[] {
  if (!Array.isArray(value)) return []
  const parts: ChatContentPart[] = []
  for (const candidate of value) {
    const projected = projectChatContentPart(candidate)
    if (projected) parts.push(projected)
  }
  return parts
}

export function createChatContentProjectionState(): ChatContentProjectionState {
  return { parts: [], drafts: {} }
}

/** Replaces a stable part in place, or appends a new one, without touching component drafts. */
export function applyChatContentUpdate(
  state: ChatContentProjectionState,
  incoming: unknown,
): ChatContentProjectionState {
  const part = projectChatContentPart(incoming)
  if (!part) return state
  const index = state.parts.findIndex((current) => current.id === part.id)
  if (index < 0) return { ...state, parts: [...state.parts, part] }
  const parts = [...state.parts]
  parts[index] = part
  return { ...state, parts }
}

export function updateChatActivityDraft(
  state: ChatContentProjectionState,
  componentId: string,
  draft: ChatActivityDraft,
): ChatContentProjectionState {
  const safeDraft = Array.isArray(draft) ? [...draft] : draft
  return { ...state, drafts: { ...state.drafts, [componentId]: safeDraft } }
}

export function getChatActivityDraft(
  state: ChatContentProjectionState,
  block: ChatBlockPart,
): ChatActivityDraft {
  if (Object.hasOwn(state.drafts, block.componentId)) return state.drafts[block.componentId]
  return block.component === 'quiz' && block.meta.questionType === 'multiple' ? [] : null
}

export function isChatActivityStructurallyValid(block: ChatBlockPart): boolean {
  if (block.component === 'quiz') {
    if (!nonEmptyString(block.meta.question) || !['single', 'multiple'].includes(String(block.meta.questionType))) {
      return false
    }
    if (block.items.length < 2) return false
    const keys = block.items.map((item) => item.key)
    return keys.every(nonEmptyString) && new Set(keys).size === keys.length
      && block.items.every((item) => nonEmptyString(item.text))
  }
  if (block.component === 'question') return nonEmptyString(block.meta.question)
  return false
}

export function createChatActivitySubmission(
  block: ChatBlockPart,
  draft: ChatActivityDraft,
  busy: boolean,
): ChatActivitySubmission | null {
  if (busy || block.state !== 'READY' || !nonEmptyString(block.questionId)
    || !isChatActivityStructurallyValid(block)) return null

  let answer: ChatActivityAnswer
  if (block.component === 'question') {
    if (typeof draft !== 'string' || !draft.trim()) return null
    answer = draft
  } else if (block.component === 'quiz' && block.meta.questionType === 'single') {
    const validKeys = new Set(block.items.map((item) => item.key))
    if (typeof draft !== 'string' || !validKeys.has(draft)) return null
    answer = draft
  } else if (block.component === 'quiz' && block.meta.questionType === 'multiple') {
    const validKeys = new Set(block.items.map((item) => item.key))
    if (!Array.isArray(draft) || draft.length === 0
      || draft.some((key) => typeof key !== 'string' || !validKeys.has(key))
      || new Set(draft).size !== draft.length) return null
    answer = [...draft]
  } else {
    return null
  }

  return { questionId: block.questionId, answer }
}

export function getChatChartRatios(block: ChatBlockPart): number[] {
  const values = block.items.map((item) => item.value)
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return []
  const numbers = values as number[]
  const maximum = Math.max(0, ...numbers)
  if (maximum === 0) return numbers.map(() => 0)
  const scaled = numbers.map((value) => value / maximum)
  const total = scaled.reduce((sum, value) => sum + value, 0)
  return scaled.map((value) => value / total)
}
