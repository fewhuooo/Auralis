import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

import {
  getStorageItem,
  getStorageJson,
  removeStorageItem,
  setStorageItem,
  setStorageJson,
} from '../src/platform/storage.ts'
import {
  closeImagePreview,
  closeLoading,
  confirmState,
  dismissToast,
  loadingState,
  openConfirm,
  openImagePreview,
  openLoading,
  previewImageState,
  pushToast,
  resolveConfirm,
  toastState,
} from '../src/platform/feedbackState.ts'
import { copyText } from '../src/platform/clipboard.ts'
import { sendHttpRequest } from '../src/platform/http.ts'
import { openExternalUrl } from '../src/platform/opener.ts'
import { getDeviceSystemInfo, getViewportMetrics } from '../src/platform/system.ts'
import { openWebSocket } from '../src/platform/websocket.ts'
import { handleEnterKey, resetTextareaHeight, syncTextareaAutoHeight } from '../src/utils/domHelpers.ts'
import {
  buildCalendarCells,
  formatDateKey,
  formatTimeHHmm,
  parseDateKeyParts,
  parseTimeHHmm,
  shiftMonth,
} from '../src/utils/pickerHelpers.ts'

function resolveTsCandidate(baseUrl, relPath) {
  if (/\.[a-z0-9]+$/i.test(relPath)) return null
  const tsUrl = new URL(`${relPath}.ts`, baseUrl)
  if (existsSync(fileURLToPath(tsUrl))) return tsUrl.href
  const indexTsUrl = new URL(`${relPath}/index.ts`, baseUrl)
  if (existsSync(fileURLToPath(indexTsUrl))) return indexTsUrl.href
  return null
}

const aliasLoader = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const target = resolveTsCandidate(new URL('../src/', import.meta.url), `./${specifier.slice(2)}`)
      return nextResolve(target ?? new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context)
    }
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const target = resolveTsCandidate(context.parentURL || import.meta.url, specifier)
      if (target) return nextResolve(target, context)
    }
    return nextResolve(specifier, context)
  },
})
const { pickLocalDocument } = await import('../src/utils/filePicker.ts')
aliasLoader.deregister()

function stubGlobalProperty(context, key, value) {
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalThis, key)
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  })
  context.after(() => {
    if (prevDescriptor) {
      Object.defineProperty(globalThis, key, prevDescriptor)
    } else {
      delete globalThis[key]
    }
  })
}

function installMemoryLocalStorage(context, onSet) {
  const map = new Map()
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prev = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, val) => {
        if (onSet) onSet(key, String(val))
        map.set(key, String(val))
      },
      removeItem: (key) => {
        map.delete(key)
      },
    },
  })
  context.after(() => {
    if (hadOwn) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prev })
    } else {
      delete globalThis.localStorage
    }
  })
  return map
}

test('platform/storage reads, writes JSON/strings, tolerates missing localStorage, and propagates QuotaExceededError', (context) => {
  assert.equal(getStorageItem('missing'), null)
  assert.equal(getStorageJson('missing'), null)
  setStorageItem('noop', 'v')
  removeStorageItem('noop')

  const map = installMemoryLocalStorage(context, (key) => {
    if (key === 'quota-key') {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })

  setStorageItem('token', 'abc')
  assert.equal(getStorageItem('token'), 'abc')
  setStorageJson('obj', { a: 1, nested: ['x'] })
  assert.deepEqual(getStorageJson('obj'), { a: 1, nested: ['x'] })

  map.set('broken', '{not-json')
  assert.equal(getStorageJson('broken'), null)

  assert.throws(() => setStorageItem('quota-key', '1'), { name: 'QuotaExceededError' })
  removeStorageItem('token')
  assert.equal(getStorageItem('token'), null)
})

test('platform/feedbackState manages toast timeout, confirm resolution/preemption, loading, and image preview', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })

  pushToast({ title: '已保存', duration: 1500 })
  assert.equal(toastState.visible, true)
  assert.equal(toastState.message, '已保存')
  context.mock.timers.tick(1500)
  assert.equal(toastState.visible, false)

  pushToast({ title: '错误提示', icon: 'error', duration: 500 })
  assert.equal(toastState.tone, 'error')
  dismissToast()
  assert.equal(toastState.visible, false)

  const firstConfirm = openConfirm({
    title: '删除待办',
    content: '确认删除？',
    confirmTone: 'danger',
  })
  assert.equal(confirmState.visible, true)
  assert.equal(confirmState.confirmTone, 'danger')

  // Opening a second confirm pre-empts the previous promise with false
  const secondConfirm = openConfirm({ title: '退出登录', content: '确认退出？' })
  assert.equal(await firstConfirm, false)
  resolveConfirm(true)
  assert.equal(await secondConfirm, true)
  assert.equal(confirmState.visible, false)

  openLoading('导出中...')
  assert.equal(loadingState.visible, true)
  assert.equal(loadingState.title, '导出中...')
  closeLoading()
  assert.equal(loadingState.visible, false)

  openImagePreview('https://example.test/a.png')
  assert.equal(previewImageState.visible, true)
  assert.equal(previewImageState.url, 'https://example.test/a.png')
  closeImagePreview()
  assert.equal(previewImageState.visible, false)
})

test('platform/http handles JSON payload, 204 No Content, and AbortController timeout', async (context) => {
  const prevFetch = globalThis.fetch
  context.after(() => {
    globalThis.fetch = prevFetch
  })

  const captured = []
  globalThis.fetch = async (url, init) => {
    captured.push({ url, init })
    if (String(url).endsWith('/no-content')) {
      return new Response(null, { status: 204 })
    }
    if (String(url).endsWith('/hang')) {
      return await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const okRes = await new Promise((resolve, reject) => {
    sendHttpRequest({
      url: 'https://api.auralis.test/items',
      method: 'POST',
      data: { name: 'Study' },
      header: { 'Content-Type': 'application/json' },
      timeout: 5000,
      success: resolve,
      fail: reject,
    })
  })
  assert.deepEqual(okRes, { statusCode: 200, data: { ok: true } })
  assert.equal(captured[0].init.body, '{"name":"Study"}')

  const emptyRes = await new Promise((resolve, reject) => {
    sendHttpRequest({
      url: 'https://api.auralis.test/no-content',
      method: 'DELETE',
      header: {},
      timeout: 5000,
      success: resolve,
      fail: reject,
    })
  })
  assert.deepEqual(emptyRes, { statusCode: 204, data: undefined })

  const timeoutErr = await new Promise((resolve) => {
    sendHttpRequest({
      url: 'https://api.auralis.test/hang',
      method: 'GET',
      header: {},
      timeout: 20,
      success: () => resolve(null),
      fail: resolve,
    })
  })
  assert.equal(timeoutErr.errMsg, 'request:fail timeout')
})

test('platform/websocket forwards open, message, close, and error events', (context) => {
  const prevWs = globalThis.WebSocket
  const sockets = []
  class FakeWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    constructor(url) {
      this.url = url
      this.readyState = FakeWebSocket.OPEN
      this.closed = false
      sockets.push(this)
    }
    close() {
      this.readyState = FakeWebSocket.CLOSED
      this.closed = true
    }
  }
  globalThis.WebSocket = FakeWebSocket
  context.after(() => {
    globalThis.WebSocket = prevWs
  })

  const events = []
  const socket = openWebSocket('wss://ws.auralis.test/ws/events?ticket=t1')
  socket.onOpen(() => events.push('open'))
  socket.onMessage((msg) => events.push(`msg:${msg.data}`))
  socket.onError(() => events.push('error'))
  socket.onClose(() => events.push('close'))

  const raw = sockets[0]
  assert.equal(raw.url, 'wss://ws.auralis.test/ws/events?ticket=t1')
  raw.onopen()
  raw.onmessage({ data: '{"type":"SYNC_CHANGED"}' })
  raw.onerror(new Error('boom'))
  raw.onclose()
  socket.close()

  assert.deepEqual(events, ['open', 'msg:{"type":"SYNC_CHANGED"}', 'error', 'close'])
  assert.equal(raw.closed, true)
})

function createMockEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, fn, opts) {
      const list = listeners.get(type) ?? []
      list.push({ fn, once: Boolean(opts?.once) })
      listeners.set(type, list)
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? []
      listeners.set(type, list.filter(entry => entry.fn !== fn))
    },
    dispatch(type, event = {}) {
      const list = [...(listeners.get(type) ?? [])]
      for (const entry of list) {
        if (entry.once) {
          this.removeEventListener(type, entry.fn)
        }
        entry.fn(event)
      }
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length
    },
  }
}

function installMockDom(context, options = {}) {
  const winTarget = createMockEventTarget()
  const children = new Set()
  const createdElements = []
  let removedByParentCount = 0

  const body = options.noBody ? null : {
    appendChild(el) {
      el.parentNode = body
      children.add(el)
    },
    removeChild(el) {
      if (children.delete(el)) {
        el.parentNode = null
        removedByParentCount += 1
      }
    },
  }

  const doc = {
    body,
    execCommandResults: [...(options.execCommandResults ?? [true])],
    execCommandCalls: 0,
    execCommand(cmd) {
      assert.equal(cmd, 'copy')
      doc.execCommandCalls += 1
      if (options.execCommandThrows) {
        throw new Error('copy blocked')
      }
      return doc.execCommandResults.shift() ?? true
    },
    createElement(tag) {
      const et = createMockEventTarget()
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        attrs: {},
        parentNode: null,
        selected: false,
        files: null,
        value: '',
        setAttribute(k, v) {
          el.attrs[k] = v
        },
        select() {
          el.selected = true
        },
        remove() {
          if (children.delete(el)) {
            el.parentNode = null
          }
        },
        click() {
          options.onClick?.(el)
        },
        ...et,
      }
      createdElements.push(el)
      return el
    },
  }

  const win = {
    isSecureContext: options.isSecureContext ?? false,
    ...winTarget,
  }
  stubGlobalProperty(context, 'document', doc)
  stubGlobalProperty(context, 'window', win)
  return {
    win,
    doc,
    children,
    createdElements,
    getRemovedByParentCount: () => removedByParentCount,
  }
}

test('platform/opener opens without noopener feature string, severs opener, and detects popup blocks', (context) => {
  stubGlobalProperty(context, 'window', undefined)
  assert.equal(openExternalUrl('https://auralis.test/doc.pdf'), false)

  const openCalls = []
  const openedTab = { opener: { self: 'parent' } }
  stubGlobalProperty(context, 'window', {
    open(url, target, features) {
      openCalls.push({ url, target, features })
      return openedTab
    },
  })
  assert.equal(openExternalUrl('blob:https://auralis.test/123'), true)
  assert.deepEqual(openCalls, [{ url: 'blob:https://auralis.test/123', target: '_blank', features: undefined }])
  assert.equal(openedTab.opener, null)

  stubGlobalProperty(context, 'window', {
    open() {
      return null
    },
  })
  assert.equal(openExternalUrl('https://auralis.test/blocked'), false)
})

test('platform/clipboard uses Clipboard API in secure context and cleans up textarea fallback', async (context) => {
  const dom = installMockDom(context, { isSecureContext: true })
  const clipboardWrites = []
  stubGlobalProperty(context, 'navigator', {
    clipboard: {
      async writeText(text) {
        clipboardWrites.push(text)
      },
    },
  })

  assert.equal(await copyText('hello-secure'), true)
  assert.deepEqual(clipboardWrites, ['hello-secure'])
  assert.equal(dom.doc.execCommandCalls, 0)

  // Clipboard API failure falls back to hidden textarea + execCommand
  stubGlobalProperty(context, 'navigator', {
    clipboard: {
      async writeText() {
        throw new Error('denied')
      },
    },
  })
  assert.equal(await copyText('fallback-after-reject'), true)
  assert.equal(dom.doc.execCommandCalls, 1)
  assert.equal(dom.children.size, 0)
  assert.equal(dom.getRemovedByParentCount(), 1)
  assert.equal(dom.createdElements[0].value, 'fallback-after-reject')
  assert.equal(dom.createdElements[0].selected, true)

  // Non-secure LAN HTTP context bypasses Clipboard API directly
  const lanDom = installMockDom(context, { isSecureContext: false, execCommandThrows: true })
  assert.equal(await copyText('lan-text'), false)
  assert.equal(lanDom.doc.execCommandCalls, 1)
  assert.equal(lanDom.children.size, 0)
  assert.equal(lanDom.getRemovedByParentCount(), 1)
})

test('platform/system resolves viewport fallbacks and parses Android device info', (context) => {
  stubGlobalProperty(context, 'window', undefined)
  stubGlobalProperty(context, 'navigator', undefined)
  assert.deepEqual(getViewportMetrics(), { width: 390, height: 844 })
  assert.deepEqual(getDeviceSystemInfo(), { platform: 'web', system: 'web' })

  stubGlobalProperty(context, 'window', { innerWidth: 0, innerHeight: 0 })
  stubGlobalProperty(context, 'screen', { width: 1280, height: 800 })
  assert.deepEqual(getViewportMetrics(), { width: 1280, height: 800 })

  stubGlobalProperty(context, 'window', { innerWidth: 412, innerHeight: 915 })
  stubGlobalProperty(context, 'navigator', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005) AppleWebKit/537.36',
    platform: 'Linux armv8l',
  })
  assert.deepEqual(getViewportMetrics(), { width: 412, height: 915 })
  assert.deepEqual(getDeviceSystemInfo(), {
    platform: 'android',
    model: 'Pixel 8',
    system: 'android',
  })
})

test('platform/http handles empty 200 body, plain text, GET body omission, and network failure', async (context) => {
  const prevFetch = globalThis.fetch
  context.after(() => {
    globalThis.fetch = prevFetch
  })

  const captured = []
  globalThis.fetch = async (url, init) => {
    captured.push({ url, init })
    if (String(url).endsWith('/empty-200')) return new Response('', { status: 200 })
    if (String(url).endsWith('/plain')) return new Response('pong', { status: 200 })
    throw new Error('ECONNREFUSED')
  }

  const empty200 = await new Promise((resolve, reject) => {
    sendHttpRequest({
      url: 'https://api.auralis.test/empty-200',
      method: 'GET',
      data: { ignored: true },
      header: {},
      timeout: 5000,
      success: resolve,
      fail: reject,
    })
  })
  assert.deepEqual(empty200, { statusCode: 200, data: undefined })
  assert.equal('body' in captured[0].init, false)

  const plainRes = await new Promise((resolve, reject) => {
    sendHttpRequest({
      url: 'https://api.auralis.test/plain',
      method: 'GET',
      header: {},
      timeout: 5000,
      success: resolve,
      fail: reject,
    })
  })
  assert.deepEqual(plainRes, { statusCode: 200, data: 'pong' })

  const netErr = await new Promise((resolve) => {
    sendHttpRequest({
      url: 'https://api.auralis.test/down',
      method: 'POST',
      data: 'raw-payload',
      header: {},
      timeout: 5000,
      success: () => resolve(null),
      fail: resolve,
    })
  })
  assert.equal(captured[2].init.body, 'raw-payload')
  assert.equal(netErr.errMsg, 'ECONNREFUSED')
})

test('utils/filePicker handles missing body, click failure cleanup, file selection, cancel, and focus fallback', async (context) => {
  installMockDom(context, { noBody: true })
  await assert.rejects(() => pickLocalDocument(), /当前环境暂不支持文件选择/)

  // Synchronous click() failure must clean up DOM input and window focus listener
  const failDom = installMockDom(context, {
    onClick() {
      throw new Error('click gesture blocked')
    },
  })
  await assert.rejects(() => pickLocalDocument(), /click gesture blocked/)
  assert.equal(failDom.children.size, 0)
  assert.equal(failDom.win.listenerCount('focus'), 0)

  // File change resolves normalized LocalUploadFile and cleans up
  let activeInput = null
  const pickDom = installMockDom(context, {
    onClick(el) {
      activeInput = el
    },
  })
  const sampleFile = { name: 'notes.pdf', size: 2048, type: 'application/pdf' }
  const pickPromise = pickLocalDocument()
  activeInput.files = [sampleFile]
  activeInput.dispatch('change')
  const picked = await pickPromise
  assert.deepEqual(picked, {
    path: '',
    name: 'notes.pdf',
    size: 2048,
    mimeType: 'application/pdf',
    file: sampleFile,
  })
  assert.equal(pickDom.children.size, 0)
  assert.equal(pickDom.win.listenerCount('focus'), 0)

  // Native cancel event resolves null and cleans up
  let cancelInput = null
  const cancelDom = installMockDom(context, {
    onClick(el) {
      cancelInput = el
    },
  })
  const cancelPromise = pickLocalDocument()
  cancelInput.dispatch('cancel')
  assert.equal(await cancelPromise, null)
  assert.equal(cancelDom.children.size, 0)
  assert.equal(cancelDom.win.listenerCount('focus'), 0)

  // Focus fallback cancels cleanly after 350ms without selected file
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const focusDom = installMockDom(context)
  const focusCancelPromise = pickLocalDocument()
  focusDom.win.dispatch('focus')
  context.mock.timers.tick(350)
  assert.equal(await focusCancelPromise, null)
  assert.equal(focusDom.children.size, 0)
  assert.equal(focusDom.win.listenerCount('focus'), 0)
})

test('utils/domHelpers guards IME composition, Shift+Enter, preventDefault, and resizes native/uni textareas', () => {
  let calls = 0
  let prevented = 0
  const fire = () => {
    calls += 1
  }

  handleEnterKey({ key: 'Enter', isComposing: true }, fire)
  handleEnterKey({ key: 'Enter', keyCode: 229 }, fire)
  handleEnterKey({ key: 'Enter', shiftKey: true }, fire, { allowShiftNewline: true, preventDefault: true })
  handleEnterKey({ key: 'Escape' }, fire)
  assert.equal(calls, 0)

  handleEnterKey({ key: 'Enter', shiftKey: false, preventDefault: () => { prevented += 1 } }, fire, {
    allowShiftNewline: true,
    preventDefault: true,
  })
  assert.equal(calls, 1)
  assert.equal(prevented, 1)

  const nativeTextarea = { tagName: 'TEXTAREA', style: { height: '' }, scrollHeight: 185 }
  syncTextareaAutoHeight({ currentTarget: nativeTextarea }, 140)
  assert.equal(nativeTextarea.style.height, '140px')
  resetTextareaHeight(nativeTextarea)
  assert.equal(nativeTextarea.style.height, '')

  const innerTextarea = { tagName: 'TEXTAREA', style: { height: '' }, scrollHeight: 72 }
  const uniTextareaHost = { tagName: 'UNI-TEXTAREA', querySelector: (sel) => (sel === 'textarea' ? innerTextarea : null) }
  syncTextareaAutoHeight({ target: uniTextareaHost, currentTarget: uniTextareaHost }, 140)
  assert.equal(innerTextarea.style.height, '72px')
  resetTextareaHeight(uniTextareaHost)
  assert.equal(innerTextarea.style.height, '')
})

test('utils/pickerHelpers validates calendar dates, month rollovers, 42-cell grids, and HH:mm clamping', () => {
  assert.deepEqual(parseDateKeyParts('2026-02-28'), { year: 2026, month: 2, day: 28 })
  assert.equal(parseDateKeyParts('2026-02-30'), null)
  assert.equal(parseDateKeyParts('invalid'), null)
  assert.equal(formatDateKey(2026, 3, 5), '2026-03-05')

  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 })
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 })

  const cells = buildCalendarCells(2026, 11)
  assert.equal(cells.length, 42)
  assert.equal(cells.filter(c => c.inMonth).length, 30)
  assert.equal(cells.some(c => c.key === '2026-11-26' && c.inMonth), true)

  assert.deepEqual(parseTimeHHmm('09:30'), { hour: 9, minute: 30 })
  assert.deepEqual(parseTimeHHmm('29:99'), { hour: 23, minute: 59 })
  assert.deepEqual(parseTimeHHmm('bad'), { hour: 9, minute: 0 })
  assert.equal(formatTimeHHmm(7, 5), '07:05')
  assert.equal(formatTimeHHmm(-3, 75), '00:59')
})
