const PRESSING_CLASS = 'zen-touch-pressed'
const RELEASING_CLASS = 'zen-touch-releasing'
const PRESS_SCALE_VAR = '--zen-press-scale'
const MIN_HOLD_MS = 110
const RELEASE_DURATION_MS = 190
const MOVE_CANCEL_PX = 10

const EXCLUDED_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-no-press], .flash-card-container, .flash-card'
const EXPLICIT_CONTROL_SELECTOR = 'button, a[href], [role="button"], [role="tab"], [role="checkbox"], [role="option"], [role="switch"], [role="menuitem"], .ui-btn, .ui-icon-btn, .ui-seg-item'
const MASK_SELECTOR = '[class*="-mask"]'

interface ActivePress {
  el: HTMLElement
  pointerId: number
  startX: number
  startY: number
  downAt: number
}

interface ElementTimers {
  holdTimer?: ReturnType<typeof setTimeout>
  releaseTimer?: ReturnType<typeof setTimeout>
}

function isDisabledControl(el: Element): boolean {
  if (el.hasAttribute('disabled')) return true
  if (el.getAttribute('aria-disabled') === 'true') return true
  return (
    el.classList.contains('is-disabled')
    || el.classList.contains('disabled')
    || el.classList.contains('locked')
    || el.classList.contains('is-locked')
  )
}

function isBoundaryNode(el: Element): boolean {
  return (
    el === document.body
    || el === document.documentElement
    || el.id === 'app'
    || el.matches(EXCLUDED_SELECTOR)
    || el.matches(MASK_SELECTOR)
  )
}

function isPointerCursor(el: Element): boolean {
  return window.getComputedStyle(el).cursor === 'pointer'
}

export function resolvePressableTarget(target: EventTarget | null): HTMLElement | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  const startNode = target as Node | null
  if (!startNode) return null
  const startEl = startNode instanceof Element ? startNode : startNode.parentElement
  if (!startEl) return null
  if (startEl.closest(EXCLUDED_SELECTOR)) return null

  let cursor: Element | null = startEl
  while (cursor && cursor !== document.body && cursor !== document.documentElement && cursor.id !== 'app') {
    if (cursor.matches(MASK_SELECTOR)) return null
    if (isDisabledControl(cursor)) return null
    if (cursor.matches(EXPLICIT_CONTROL_SELECTOR)) {
      return cursor instanceof HTMLElement ? cursor : null
    }
    cursor = cursor.parentElement
  }

  let pointerCandidate: HTMLElement | null = null
  cursor = startEl
  while (cursor && !isBoundaryNode(cursor)) {
    if (isDisabledControl(cursor)) return null
    if (cursor instanceof HTMLElement && isPointerCursor(cursor)) {
      pointerCandidate = cursor
      break
    }
    cursor = cursor.parentElement
  }
  if (!pointerCandidate) return null

  let outerPointer = pointerCandidate
  let parent = outerPointer.parentElement
  while (
    parent
    && parent instanceof HTMLElement
    && !isBoundaryNode(parent)
    && !parent.matches(EXPLICIT_CONTROL_SELECTOR)
    && isPointerCursor(parent)
  ) {
    if (isDisabledControl(parent)) return null
    outerPointer = parent
    parent = outerPointer.parentElement
  }
  return outerPointer
}

function computePressScale(el: HTMLElement): string {
  const rect = el.getBoundingClientRect()
  if (rect.width > 200 && rect.height > 60) return '0.982'
  if (rect.width > 180 || rect.height > 52) return '0.97'
  return '0.945'
}

export function installTouchFeedback(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  let activePress: ActivePress | null = null
  const timersByEl = new Map<HTMLElement, ElementTimers>()

  function clearElementTimers(el: HTMLElement) {
    const entry = timersByEl.get(el)
    if (!entry) return
    if (entry.holdTimer !== undefined) clearTimeout(entry.holdTimer)
    if (entry.releaseTimer !== undefined) clearTimeout(entry.releaseTimer)
    timersByEl.delete(el)
  }

  function resetElementVisual(el: HTMLElement) {
    clearElementTimers(el)
    el.classList.remove(PRESSING_CLASS, RELEASING_CLASS)
    el.style.removeProperty(PRESS_SCALE_VAR)
  }

  function finishPress(el: HTMLElement, animateRelease: boolean) {
    clearElementTimers(el)
    el.classList.remove(PRESSING_CLASS)
    if (!animateRelease) {
      el.classList.remove(RELEASING_CLASS)
      el.style.removeProperty(PRESS_SCALE_VAR)
      return
    }
    el.classList.add(RELEASING_CLASS)
    const releaseTimer = setTimeout(() => {
      el.classList.remove(RELEASING_CLASS)
      el.style.removeProperty(PRESS_SCALE_VAR)
      timersByEl.delete(el)
    }, RELEASE_DURATION_MS)
    timersByEl.set(el, { releaseTimer })
  }

  function cancelActivePress() {
    if (!activePress) return
    const targetEl = activePress.el
    activePress = null
    resetElementVisual(targetEl)
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const el = resolvePressableTarget(event.target)
    if (!el) return

    if (activePress && activePress.el !== el) {
      resetElementVisual(activePress.el)
    }

    resetElementVisual(el)
    el.style.setProperty(PRESS_SCALE_VAR, computePressScale(el))
    el.classList.add(PRESSING_CLASS)

    activePress = {
      el,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      downAt: Date.now(),
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!activePress || event.pointerId !== activePress.pointerId) return
    const dist = Math.hypot(event.clientX - activePress.startX, event.clientY - activePress.startY)
    if (dist > MOVE_CANCEL_PX) {
      cancelActivePress()
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!activePress || event.pointerId !== activePress.pointerId) return
    const { el, downAt } = activePress
    activePress = null

    const elapsed = Date.now() - downAt
    const holdRemaining = MIN_HOLD_MS - elapsed
    if (holdRemaining > 0) {
      clearElementTimers(el)
      const holdTimer = setTimeout(() => {
        finishPress(el, true)
      }, holdRemaining)
      timersByEl.set(el, { holdTimer })
      return
    }
    finishPress(el, true)
  }

  function onPointerCancel(event: PointerEvent) {
    if (!activePress || event.pointerId !== activePress.pointerId) return
    cancelActivePress()
  }

  function onVisibilityChange() {
    if (document.hidden) {
      cancelActivePress()
    }
  }

  document.addEventListener('pointerdown', onPointerDown, { passive: true })
  document.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('pointerup', onPointerUp, { passive: true })
  document.addEventListener('pointercancel', onPointerCancel, { passive: true })
  window.addEventListener('blur', cancelActivePress, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true })

  return () => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('blur', cancelActivePress)
    document.removeEventListener('visibilitychange', onVisibilityChange)

    if (activePress) {
      resetElementVisual(activePress.el)
      activePress = null
    }
    for (const el of Array.from(timersByEl.keys())) {
      resetElementVisual(el)
    }
  }
}
