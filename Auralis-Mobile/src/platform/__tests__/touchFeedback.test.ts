import test from 'node:test'
import assert from 'node:assert/strict'

type Listener = (event: unknown) => void

class FakeClassList {
  private set = new Set<string>()

  constructor(initial: string[] = []) {
    for (const cls of initial) this.set.add(cls)
  }

  add(...tokens: string[]): void {
    for (const token of tokens) this.set.add(token)
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.set.delete(token)
  }

  contains(token: string): boolean {
    return this.set.has(token)
  }

  values(): IterableIterator<string> {
    return this.set.values()
  }
}

class FakeStyle {
  private props = new Map<string, string>()

  setProperty(key: string, value: string): void {
    this.props.set(key, value)
  }

  removeProperty(key: string): void {
    this.props.delete(key)
  }

  getPropertyValue(key: string): string {
    return this.props.get(key) ?? ''
  }
}

class FakeElement {
  id = ''
  tagName: string
  parentElement: FakeElement | null = null
  classList: FakeClassList
  style = new FakeStyle()
  cursor = 'auto'
  rect = { width: 120, height: 38 }
  private attrs = new Map<string, string>()
  private roles = new Set<string>()

  constructor(
    tagName = 'div',
    options?: {
      id?: string
      classes?: string[]
      attrs?: Record<string, string>
      cursor?: string
      width?: number
      height?: number
    },
  ) {
    this.tagName = tagName.toLowerCase()
    if (options?.id) this.id = options.id
    this.classList = new FakeClassList(options?.classes)
    if (options?.attrs) {
      for (const [key, value] of Object.entries(options.attrs)) {
        this.attrs.set(key, value)
        if (key === 'role') this.roles.add(value)
      }
    }
    if (options?.cursor) this.cursor = options.cursor
    if (options?.width !== undefined) this.rect.width = options.width
    if (options?.height !== undefined) this.rect.height = options.height
  }

  append(child: FakeElement): FakeElement {
    child.parentElement = this
    return child
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  getBoundingClientRect(): { width: number; height: number } {
    return this.rect
  }

  matches(selector: string): boolean {
    return selector
      .split(',')
      .map(s => s.trim())
      .some((part) => this.matchesSingle(part))
  }

  private matchesSingle(part: string): boolean {
    if (part === 'button') return this.tagName === 'button'
    if (part === 'input') return this.tagName === 'input'
    if (part === 'textarea') return this.tagName === 'textarea'
    if (part === 'select') return this.tagName === 'select'
    if (part === 'a[href]') return this.tagName === 'a' && this.hasAttribute('href')
    if (part === '[contenteditable="true"]') return this.getAttribute('contenteditable') === 'true'
    if (part === '[data-no-press]') return this.hasAttribute('data-no-press')
    if (part === '[class*="-mask"]') return Array.from(this.attrs.entries()).length >= 0 && this.hasClassEndingWith('-mask')
    if (part.startsWith('.')) return this.classList.contains(part.slice(1))
    const roleMatch = part.match(/^\[role="([^"]+)"\]$/)
    if (roleMatch) return this.roles.has(roleMatch[1])
    return false
  }

  private hasClassEndingWith(suffix: string): boolean {
    for (const token of this.classList.values()) {
      if (token.endsWith(suffix)) return true
    }
    return false
  }

  closest(selector: string): FakeElement | null {
    let cur: FakeElement | null = this
    while (cur) {
      if (cur.matches(selector)) return cur
      cur = cur.parentElement
    }
    return null
  }
}

class FakeTextNode {
  parentElement: FakeElement | null

  constructor(parent: FakeElement) {
    this.parentElement = parent
  }
}

function setupDomHarness(context: test.TestContext) {
  const docListeners = new Map<string, Set<Listener>>()
  const winListeners = new Map<string, Set<Listener>>()

  const documentElement = new FakeElement('html')
  const body = new FakeElement('body')
  documentElement.append(body)
  const appRoot = new FakeElement('div', { id: 'app' })
  body.append(appRoot)

  const fakeDocument = {
    documentElement,
    body,
    hidden: false,
    addEventListener(type: string, fn: Listener) {
      if (!docListeners.has(type)) docListeners.set(type, new Set())
      docListeners.get(type)!.add(fn)
    },
    removeEventListener(type: string, fn: Listener) {
      docListeners.get(type)?.delete(fn)
    },
    dispatch(type: string, event: Record<string, unknown>) {
      for (const fn of Array.from(docListeners.get(type) ?? [])) {
        fn(event)
      }
    },
  }

  const fakeWindow = {
    addEventListener(type: string, fn: Listener) {
      if (!winListeners.has(type)) winListeners.set(type, new Set())
      winListeners.get(type)!.add(fn)
    },
    removeEventListener(type: string, fn: Listener) {
      winListeners.get(type)?.delete(fn)
    },
    dispatch(type: string, event: Record<string, unknown>) {
      for (const fn of Array.from(winListeners.get(type) ?? [])) {
        fn(event)
      }
    },
    getComputedStyle(el: FakeElement) {
      return { cursor: el.cursor }
    },
  }

  const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const prevDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const prevElement = Object.getOwnPropertyDescriptor(globalThis, 'Element')
  const prevHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')

  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: fakeWindow })
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument })
  Object.defineProperty(globalThis, 'Element', { configurable: true, writable: true, value: FakeElement })
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, writable: true, value: FakeElement })

  context.after(() => {
    for (const [key, prev] of [
      ['window', prevWindow],
      ['document', prevDocument],
      ['Element', prevElement],
      ['HTMLElement', prevHTMLElement],
    ] as const) {
      if (prev) {
        Object.defineProperty(globalThis, key, prev)
      } else {
        delete (globalThis as Record<string, unknown>)[key]
      }
    }
  })

  return { appRoot, fakeDocument, fakeWindow, docListeners, winListeners }
}

const { installTouchFeedback, resolvePressableTarget } = await import('../touchFeedback.ts')

test('quick tap holds zen-touch-pressed through minimum hold duration then animates release and cleans up', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { appRoot, fakeDocument } = setupDomHarness(context)

  const button = appRoot.append(new FakeElement('button', { classes: ['ui-btn'], width: 120, height: 38 }))
  const label = button.append(new FakeElement('span'))
  const textNode = new FakeTextNode(label)

  const dispose = installTouchFeedback()
  try {
    fakeDocument.dispatch('pointerdown', { pointerType: 'touch', button: 0, pointerId: 1, clientX: 50, clientY: 50, target: textNode })
    assert.equal(button.classList.contains('zen-touch-pressed'), true)
    assert.equal(button.style.getPropertyValue('--zen-press-scale'), '0.945')

    context.mock.timers.tick(30)
    fakeDocument.dispatch('pointerup', { pointerType: 'touch', button: 0, pointerId: 1, clientX: 51, clientY: 51, target: textNode })

    // Quick 30ms tap stays visibly pressed for the remaining 80ms of the 110ms hold
    assert.equal(button.classList.contains('zen-touch-pressed'), true)
    assert.equal(button.classList.contains('zen-touch-releasing'), false)

    context.mock.timers.tick(79)
    assert.equal(button.classList.contains('zen-touch-pressed'), true)

    context.mock.timers.tick(1)
    assert.equal(button.classList.contains('zen-touch-pressed'), false)
    assert.equal(button.classList.contains('zen-touch-releasing'), true)

    context.mock.timers.tick(190)
    assert.equal(button.classList.contains('zen-touch-releasing'), false)
    assert.equal(button.style.getPropertyValue('--zen-press-scale'), '')
  } finally {
    dispose()
  }
})

test('scroll drag cancels zen-touch-pressed immediately and does not animate release', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { appRoot, fakeDocument } = setupDomHarness(context)

  const card = appRoot.append(new FakeElement('div', { cursor: 'pointer', width: 280, height: 140 }))
  const dispose = installTouchFeedback()
  try {
    fakeDocument.dispatch('pointerdown', { pointerType: 'touch', button: 0, pointerId: 7, clientX: 100, clientY: 100, target: card })
    assert.equal(card.classList.contains('zen-touch-pressed'), true)
    assert.equal(card.style.getPropertyValue('--zen-press-scale'), '0.982')

    fakeDocument.dispatch('pointermove', { pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 118 })
    assert.equal(card.classList.contains('zen-touch-pressed'), false)
    assert.equal(card.classList.contains('zen-touch-releasing'), false)
    assert.equal(card.style.getPropertyValue('--zen-press-scale'), '')

    fakeDocument.dispatch('pointerup', { pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 118 })
    assert.equal(card.classList.contains('zen-touch-releasing'), false)
  } finally {
    dispose()
  }
})

test('resolvePressableTarget isolates nested action buttons and skips disabled, input, flashcard, and mask nodes', (context) => {
  const { appRoot } = setupDomHarness(context)

  const card = appRoot.append(new FakeElement('div', { classes: ['subject-card'], cursor: 'pointer', width: 260, height: 140 }))
  const cardTitle = card.append(new FakeElement('span'))
  const innerDelete = card.append(new FakeElement('div', { classes: ['icon-action-btn'], attrs: { role: 'button' }, cursor: 'pointer' }))
  const innerIcon = innerDelete.append(new FakeElement('svg'))

  assert.equal(resolvePressableTarget(cardTitle), card)
  assert.equal(resolvePressableTarget(innerIcon), innerDelete)

  const disabledBtn = appRoot.append(new FakeElement('button', { attrs: { disabled: '' } }))
  assert.equal(resolvePressableTarget(disabledBtn), null)

  const input = appRoot.append(new FakeElement('input'))
  assert.equal(resolvePressableTarget(input), null)

  const flashCard = appRoot.append(new FakeElement('div', { classes: ['flash-card-container'], attrs: { role: 'button' }, cursor: 'pointer' }))
  const flashBody = flashCard.append(new FakeElement('div'))
  assert.equal(resolvePressableTarget(flashBody), null)

  const modalMask = appRoot.append(new FakeElement('div', { classes: ['zen-modal-mask'], cursor: 'pointer' }))
  assert.equal(resolvePressableTarget(modalMask), null)
})

test('dispose clears pressed state, pending timers, and event listeners cleanly', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { appRoot, fakeDocument, docListeners, winListeners } = setupDomHarness(context)

  const pill = appRoot.append(new FakeElement('div', { classes: ['ui-seg-item'], attrs: { role: 'tab' } }))
  const dispose = installTouchFeedback()

  fakeDocument.dispatch('pointerdown', { pointerType: 'touch', button: 0, pointerId: 3, clientX: 10, clientY: 10, target: pill })
  assert.equal(pill.classList.contains('zen-touch-pressed'), true)

  dispose()
  assert.equal(pill.classList.contains('zen-touch-pressed'), false)
  assert.equal(pill.classList.contains('zen-touch-releasing'), false)
  assert.equal(pill.style.getPropertyValue('--zen-press-scale'), '')
  assert.equal(docListeners.get('pointerdown')?.size ?? 0, 0)
  assert.equal(winListeners.get('blur')?.size ?? 0, 0)
})

test('pointercancel clears active pressed state immediately without triggering release animation', (context) => {
  const { appRoot, fakeDocument } = setupDomHarness(context)

  const button = appRoot.append(new FakeElement('button', { classes: ['ui-btn'] }))
  const dispose = installTouchFeedback()
  try {
    fakeDocument.dispatch('pointerdown', { pointerType: 'touch', button: 0, pointerId: 11, clientX: 20, clientY: 20, target: button })
    assert.equal(button.classList.contains('zen-touch-pressed'), true)

    fakeDocument.dispatch('pointercancel', { pointerType: 'touch', pointerId: 11 })
    assert.equal(button.classList.contains('zen-touch-pressed'), false)
    assert.equal(button.classList.contains('zen-touch-releasing'), false)
    assert.equal(button.style.getPropertyValue('--zen-press-scale'), '')
  } finally {
    dispose()
  }
})

test('blur and visibilitychange cancel pending quick-tap hold timers cleanly', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { appRoot, fakeDocument, fakeWindow } = setupDomHarness(context)

  const picker = appRoot.append(new FakeElement('div', { cursor: 'pointer', width: 240, height: 80 }))
  const dispose = installTouchFeedback()
  try {
    fakeDocument.dispatch('pointerdown', { pointerType: 'touch', button: 0, pointerId: 12, clientX: 30, clientY: 30, target: picker })
    context.mock.timers.tick(25)
    fakeDocument.dispatch('pointerup', { pointerType: 'touch', pointerId: 12, clientX: 30, clientY: 30 })
    assert.equal(picker.classList.contains('zen-touch-pressed'), true)

    fakeWindow.dispatch('blur', {})
    assert.equal(picker.classList.contains('zen-touch-pressed'), false)
    assert.equal(picker.classList.contains('zen-touch-releasing'), false)
    assert.equal(picker.style.getPropertyValue('--zen-press-scale'), '')

    // Ensure backgrounded visibilitychange also cancels held quick-tap timers
    fakeDocument.dispatch('pointerdown', { pointerType: 'touch', button: 0, pointerId: 13, clientX: 30, clientY: 30, target: picker })
    context.mock.timers.tick(25)
    fakeDocument.dispatch('pointerup', { pointerType: 'touch', pointerId: 13, clientX: 30, clientY: 30 })
    assert.equal(picker.classList.contains('zen-touch-pressed'), true)

    fakeDocument.hidden = true
    fakeDocument.dispatch('visibilitychange', {})
    assert.equal(picker.classList.contains('zen-touch-pressed'), false)
    assert.equal(picker.style.getPropertyValue('--zen-press-scale'), '')
  } finally {
    dispose()
  }
})
