import test from 'node:test'
import assert from 'node:assert/strict'

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
import { sendHttpRequest } from '../src/platform/http.ts'
import { openWebSocket } from '../src/platform/websocket.ts'

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
