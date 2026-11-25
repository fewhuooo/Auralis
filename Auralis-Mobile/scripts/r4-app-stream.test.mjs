import assert from 'node:assert/strict'
import test from 'node:test'

import { runIncrementalXhrSse } from '../src/api/plusStreamTransport.ts'
import { createSseDecoder } from '../src/api/sse.ts'

function createMockPlusXhr() {
  const sent = {
    method: '',
    url: '',
    headers: {},
    body: '',
    aborted: false,
  }
  const xhr = {
    readyState: 0,
    status: 0,
    responseText: '',
    timeout: 0,
    onreadystatechange: null,
    onerror: null,
    ontimeout: null,
    onabort: null,
    responseHeaders: {},
    open(method, url) {
      sent.method = method
      sent.url = url
    },
    setRequestHeader(name, value) {
      sent.headers[name] = value
    },
    send(body) {
      sent.body = body || ''
    },
    abort() {
      sent.aborted = true
    },
    getResponseHeader(name) {
      const lower = name.toLowerCase()
      for (const [key, value] of Object.entries(xhr.responseHeaders)) {
        if (key.toLowerCase() === lower) return value
      }
      return null
    },
    emitLoading(nextFullText, status = 200) {
      xhr.status = status
      xhr.readyState = 3
      xhr.responseText = nextFullText
      xhr.onreadystatechange?.()
    },
    emitDone(nextFullText, status = 200) {
      xhr.status = status
      xhr.readyState = 4
      xhr.responseText = nextFullText
      xhr.onreadystatechange?.()
    },
  }
  return { xhr, sent }
}

test('runIncrementalXhrSse delivers incremental readyState 3 slices without duplication', async () => {
  const { xhr, sent } = createMockPlusXhr()
  const events = []
  const sse = createSseDecoder(evt => events.push(evt))

  const promise = runIncrementalXhrSse({
    createXhr: () => xhr,
    url: 'https://api.example.com/api/ai/messages/stream',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: '{"content":"hi"}',
    isCurrent: () => true,
    isManuallyAborted: () => false,
    onChunk: chunk => sse.push(chunk),
  })

  assert.equal(sent.method, 'POST')
  assert.equal(sent.url, 'https://api.example.com/api/ai/messages/stream')
  assert.equal(sent.headers.Authorization, 'Bearer tok')

  const frame1 = 'event: text.delta\ndata: {"publicTextDelta":"你"}\n\n'
  const frame2 = 'event: text.delta\ndata: {"publicTextDelta":"好"}\n\n'
  const frame3 = 'event: run.completed\ndata: {}\n\n'

  xhr.emitLoading(frame1)
  assert.equal(events.length, 1)
  assert.deepEqual(events[0], { event: 'text.delta', data: { publicTextDelta: '你' } })

  xhr.emitLoading(frame1 + frame2)
  assert.equal(events.length, 2)
  assert.deepEqual(events[1], { event: 'text.delta', data: { publicTextDelta: '好' } })

  xhr.emitDone(frame1 + frame2 + frame3, 200)
  const result = await promise
  assert.equal(result.aborted, false)
  assert.equal(result.statusCode, 200)
  assert.equal(result.remainingText, frame3)
  sse.push(result.remainingText)
  sse.finish()
  assert.equal(events.length, 3)
  assert.equal(events[2].event, 'run.completed')
})

test('runIncrementalXhrSse delivers full response when readyState 4 arrives directly', async () => {
  const { xhr } = createMockPlusXhr()
  const chunks = []
  const promise = runIncrementalXhrSse({
    createXhr: () => xhr,
    url: 'https://api.example.com/api/ai/messages/stream',
    headers: {},
    body: '{}',
    isCurrent: () => true,
    isManuallyAborted: () => false,
    onChunk: chunk => chunks.push(chunk),
  })

  const full = 'event: run.completed\ndata: {}\n\n'
  xhr.emitDone(full, 200)
  const result = await promise
  assert.deepEqual(chunks, [])
  assert.equal(result.remainingText, full)
  assert.equal(result.fullText, full)
})

test('runIncrementalXhrSse surfaces 401 and non-2xx error payloads with Retry-After', async () => {
  const unauthorized = createMockPlusXhr()
  const p401 = runIncrementalXhrSse({
    createXhr: () => unauthorized.xhr,
    url: 'https://api.example.com/stream',
    headers: {},
    body: '{}',
    isCurrent: () => true,
    isManuallyAborted: () => false,
    onChunk: () => {},
  })
  unauthorized.xhr.emitDone('{"status":401}', 401)
  const r401 = await p401
  assert.equal(r401.statusCode, 401)

  const rateLimited = createMockPlusXhr()
  rateLimited.xhr.responseHeaders = { 'Retry-After': '15' }
  const p429 = runIncrementalXhrSse({
    createXhr: () => rateLimited.xhr,
    url: 'https://api.example.com/stream',
    headers: {},
    body: '{}',
    isCurrent: () => true,
    isManuallyAborted: () => false,
    onChunk: () => {},
  })
  rateLimited.xhr.emitLoading('{"code":"AI_HOURLY_QUOTA_EXCEEDED"}', 429)
  rateLimited.xhr.emitDone('{"code":"AI_HOURLY_QUOTA_EXCEEDED"}', 429)
  const r429 = await p429
  assert.equal(r429.statusCode, 429)
  assert.equal(r429.retryAfterHeader, '15')
  assert.equal(r429.fullText, '{"code":"AI_HOURLY_QUOTA_EXCEEDED"}')
})

test('runIncrementalXhrSse aborts XHR and suppresses further chunks on manual abort', async () => {
  const { xhr, sent } = createMockPlusXhr()
  const chunks = []
  let abortFn = null
  const promise = runIncrementalXhrSse({
    createXhr: () => xhr,
    url: 'https://api.example.com/stream',
    headers: {},
    body: '{}',
    isCurrent: () => true,
    isManuallyAborted: () => false,
    onChunk: chunk => chunks.push(chunk),
    onAbortReady: (fn) => { abortFn = fn },
  })

  xhr.emitLoading('event: text.delta\n\n')
  abortFn()
  xhr.emitLoading('event: text.delta\n\nevent: ignored\n\n')
  const result = await promise
  assert.equal(sent.aborted, true)
  assert.equal(result.aborted, true)
  assert.equal(chunks.length, 1)
})
