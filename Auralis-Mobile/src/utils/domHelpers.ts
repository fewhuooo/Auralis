interface EnterKeyLike {
  key?: unknown
  shiftKey?: unknown
  isComposing?: unknown
  keyCode?: unknown
  preventDefault?: () => void
}

interface TextareaLike {
  tagName?: unknown
  style?: { height?: string }
  scrollHeight?: unknown
  querySelector?: (selector: string) => unknown
  $el?: unknown
}

export interface EnterKeyOptions {
  allowShiftNewline?: boolean
  preventDefault?: boolean
}

function asTextareaLike(candidate: unknown): TextareaLike | null {
  if (!candidate || typeof candidate !== 'object') return null
  const node = candidate as TextareaLike
  if (typeof node.tagName === 'string' && node.tagName.toUpperCase() === 'TEXTAREA') {
    return node
  }
  if (typeof node.querySelector === 'function') {
    const inner = node.querySelector('textarea')
    if (inner && typeof inner === 'object') return inner as TextareaLike
  }
  if (node.$el && node.$el !== candidate) {
    return asTextareaLike(node.$el)
  }
  return null
}

function resolveTextareaElement(eventOrEl: unknown): TextareaLike | null {
  if (!eventOrEl || typeof eventOrEl !== 'object') return null
  const maybeEvent = eventOrEl as { target?: unknown; currentTarget?: unknown }
  if ('target' in maybeEvent || 'currentTarget' in maybeEvent) {
    return asTextareaLike(maybeEvent.target) ?? asTextareaLike(maybeEvent.currentTarget)
  }
  return asTextareaLike(eventOrEl)
}

/** Handles Enter key submission across inputs and textareas while respecting IME composition and Shift+Enter. */
export function handleEnterKey(
  event: unknown,
  onEnter: () => unknown,
  options?: EnterKeyOptions,
): void {
  if (!event || typeof event !== 'object') return
  const keyEvent = event as EnterKeyLike
  if (keyEvent.isComposing || keyEvent.keyCode === 229) return
  if (keyEvent.key !== 'Enter') return
  if (options?.allowShiftNewline && keyEvent.shiftKey) return
  if (options?.preventDefault && typeof keyEvent.preventDefault === 'function') {
    keyEvent.preventDefault()
  }
  onEnter()
}

/** Expands a textarea to fit its content up to maxHeightPx, supporting both native and uni-textarea hosts. */
export function syncTextareaAutoHeight(eventOrEl: unknown, maxHeightPx = 140): void {
  const textarea = resolveTextareaElement(eventOrEl)
  if (!textarea?.style) return
  textarea.style.height = 'auto'
  const scrollHeight = typeof textarea.scrollHeight === 'number' && Number.isFinite(textarea.scrollHeight)
    ? textarea.scrollHeight
    : 0
  if (scrollHeight > 0) {
    textarea.style.height = `${Math.min(scrollHeight, maxHeightPx)}px`
  }
}

/** Resets inline height on a textarea after clearing or collapsing its content. */
export function resetTextareaHeight(elOrContainer: unknown): void {
  const textarea = resolveTextareaElement(elOrContainer)
  if (!textarea?.style) return
  textarea.style.height = ''
}
