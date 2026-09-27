/**
 * Modal Manager for Auralis PC
 * Manages shared scroll lock, LIFO modal stack (for Escape handling), and focus management.
 */

interface ModalEntry {
  id: string
  container?: HTMLElement | null
  onEscape?: () => void
}

const modalStack: ModalEntry[] = []
let activeModalCount = 0
let originalBodyOverflow: string | null = null

/**
 * Lock document.body scroll when at least one modal is active
 */
export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (activeModalCount === 0) {
    originalBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  activeModalCount++
}

/**
 * Unlock document.body scroll when all modals are closed
 */
export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  activeModalCount = Math.max(0, activeModalCount - 1)
  if (activeModalCount === 0 && originalBodyOverflow !== null) {
    document.body.style.overflow = originalBodyOverflow
    originalBodyOverflow = null
  }
}

/**
 * Register a modal onto the LIFO stack
 */
export function registerModal(id: string, onEscape?: () => void, container?: HTMLElement | null): void {
  // Ensure not duplicate
  const idx = modalStack.findIndex(m => m.id === id)
  if (idx >= 0) {
    modalStack.splice(idx, 1)
  }
  modalStack.push({ id, onEscape, container })
  ensureGlobalEscapeListener()
}

/**
 * Update the container element for an active modal entry
 */
export function updateModalContainer(id: string, container: HTMLElement | null): void {
  const entry = modalStack.find(m => m.id === id)
  if (entry) {
    entry.container = container
  }
}

/**
 * Unregister a modal from the stack
 */
export function unregisterModal(id: string): void {
  const idx = modalStack.findIndex(m => m.id === id)
  if (idx >= 0) {
    modalStack.splice(idx, 1)
  }
  if (modalStack.length === 0) {
    removeGlobalEscapeListener()
  }
}

/**
 * Check if the modal with given id is at the top of the stack
 */
export function isTopModal(id: string): boolean {
  if (modalStack.length === 0) return false
  return modalStack[modalStack.length - 1].id === id
}

let isEscapeListenerAttached = false

function handleGlobalKeyDown(e: KeyboardEvent): void {
  if (modalStack.length === 0) return
  const top = modalStack[modalStack.length - 1]
  if (e.key === 'Escape') {
    if (top.onEscape) {
      e.stopImmediatePropagation()
      e.preventDefault()
      top.onEscape()
    }
  } else if (e.key === 'Tab' && top.container) {
    trapTabKey(top.container, e)
  }
}

function ensureGlobalEscapeListener(): void {
  if (typeof window === 'undefined' || isEscapeListenerAttached) return
  window.addEventListener('keydown', handleGlobalKeyDown, true)
  isEscapeListenerAttached = true
}

function removeGlobalEscapeListener(): void {
  if (typeof window === 'undefined' || !isEscapeListenerAttached) return
  window.removeEventListener('keydown', handleGlobalKeyDown, true)
  isEscapeListenerAttached = false
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/**
 * Find all focusable elements inside container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return elements.filter(el => {
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  })
}

/**
 * Trap Tab and Shift+Tab key navigation inside container
 */
export function trapTabKey(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return
  const focusables = getFocusableElements(container)
  if (focusables.length === 0) {
    e.preventDefault()
    return
  }

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const current = document.activeElement as HTMLElement | null

  if (e.shiftKey) {
    if (current === first || !container.contains(current)) {
      e.preventDefault()
      last.focus()
    }
  } else {
    if (current === last || !container.contains(current)) {
      e.preventDefault()
      first.focus()
    }
  }
}
