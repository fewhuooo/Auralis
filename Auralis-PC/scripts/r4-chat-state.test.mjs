import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}'
    const subPath = specifier.slice(2)
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts'
    return nextResolve(new URL(withExt, root).href, context)
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL
      && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createPinia, setActivePinia } = await import('pinia')
const { useChatStore } = await import('../src/store/useChatStore.ts')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { default: request } = await import('../src/api/request.ts')

const { setImmediate: nextTurn } = await import('node:timers/promises')

function session(id) {
  return { id, remoteId: id, title: id, version: 1, chatProtocolVersion: 1, chatSupported: true, chatScopeState: 'BOUND', chatScope: null }
}
function detail(id, text = id) {
  return { id, chatScopeState: 'BOUND', chatScope: null, activeRun: null,
    messages: [{ id: `${id}-reply`, role: 'ASSISTANT', status: 'COMPLETED', content: text, parts: [] }] }
}
function setup() {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = { id: 'owner', username: 'owner', displayName: 'Owner', version: 1, hasAvatar: false }
  const store = useChatStore()
  store.sessions = [session('A'), session('B')]
  store.activeSessionId = 'A'
  return { store, auth }
}
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function disconnectedResponse(requestId) {
  let emitted = false
  return new Response(new ReadableStream({
    pull(controller) {
      if (emitted) { controller.error(new TypeError('stream disconnected')); return }
      emitted = true
      controller.enqueue(new TextEncoder().encode(`event: run.started\ndata: ${JSON.stringify({
        protocolVersion: 1, conversationId: 'A', runId: 'run-A', attemptId: 'attempt-A', requestId,
        userMessageId: 'user-A', replyMessageId: 'reply-A', sequence: 1, event: 'run.started', payload: {},
      })}\n\n`))
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}
function status(state = 'RUNNING') {
  return { protocolVersion: 1, conversationId: 'A', runId: 'run-A', requestId: 'request-A',
    status: state, executionActive: ['RUNNING', 'UNKNOWN'].includes(state), currentAttemptId: 'attempt-A', attempts: [] }
}

test('latest conversation load wins, including two loads of the same conversation', async (t) => {
  const { store } = setup()
  const first = deferred()
  t.mock.method(request, 'get', async () => first.promise)
  const old = store.loadMessages('A')
  const rejected = assert.rejects(old, { name: 'SyncScopeChangedError' })
  request.get = async () => detail('B')
  await store.loadMessages('B')
  first.resolve(detail('A'))
  await rejected
  assert.equal(store.activeSessionId, 'B')
  assert.equal(store.messages[0].conversationId, 'B')

  const stale = deferred()
  request.get = async () => stale.promise
  const previous = assert.rejects(store.loadMessages('B'), { name: 'SyncScopeChangedError' })
  request.get = async () => detail('B', 'new snapshot')
  await store.loadMessages('B')
  stale.resolve(detail('B', 'old snapshot'))
  await previous
  assert.equal(store.messages[0].content, 'new snapshot')
})

test('late conversation creation cannot replace a newer create or load', async (t) => {
  const { store } = setup()
  const first = deferred()
  t.mock.method(request, 'post', async () => first.promise)
  const older = assert.rejects(store.startNewSession('old'), { name: 'SyncScopeChangedError' })
  request.post = async () => session('new')
  await store.startNewSession('new')
  first.resolve(session('old'))
  await older
  assert.equal(store.activeSessionId, 'new')
  assert.equal(store.sessions.some(item => item.id === 'old'), false)

  const pending = deferred()
  request.post = async () => pending.promise
  const stale = assert.rejects(store.startNewSession('later'), { name: 'SyncScopeChangedError' })
  t.mock.method(request, 'get', async () => detail('B'))
  await store.loadMessages('B')
  pending.resolve(session('later'))
  await stale
  assert.equal(store.activeSessionId, 'B')
  assert.equal(store.messages[0].content, 'B')
})

for (const state of ['RUNNING', 'UNKNOWN', 'IDLE']) {
  test(`failed conversation creation preserves the old ${state} conversation and resumes only active polling`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { store } = setup()
    let statusCalls = 0
    t.mock.method(request, 'get', async url => {
      if (String(url).includes('/runs/')) {
        statusCalls += 1
        return status('COMPLETED')
      }
      return { ...detail('A', 'original reply'), activeRun: state === 'IDLE' ? null : {
        runId: 'run-A', currentAttemptId: 'attempt-A', status: state, executionActive: true,
      } }
    })
    await store.loadMessages('A')
    t.mock.method(request, 'post', async () => { throw new Error('creation unavailable') })
    await assert.rejects(store.startNewSession('new'), /creation unavailable/)
    assert.equal(store.activeSessionId, 'A')
    assert.equal(store.messages[0].content, 'original reply')
    assert.equal(store.isStreaming, state === 'RUNNING')
    if (state === 'UNKNOWN') assert.equal(store.recoverableTarget.attemptId, 'attempt-A')
    t.mock.timers.tick(1500)
    await nextTurn()
    assert.equal(statusCalls, state === 'RUNNING' ? 1 : 0)
    assert.equal(store.isStreaming, false)
    if (state !== 'UNKNOWN') assert.equal(store.activeRun, null)
  })
}

test('late creation failure cannot restart polling or clear a newer conversation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { store } = setup()
  const pending = Promise.withResolvers()
  t.mock.method(request, 'post', async () => pending.promise)
  const rejected = assert.rejects(store.startNewSession('new'), /creation unavailable/)
  t.mock.method(request, 'get', async () => detail('B'))
  await store.loadMessages('B')
  store.activeRun = { conversationId: 'B', runId: 'run-B', executionActive: true }
  store.isStreaming = true
  pending.reject(new Error('creation unavailable'))
  await rejected
  request.get = async () => assert.fail('obsolete creation must not start a status request')
  t.mock.timers.tick(1500)
  await nextTurn()
  assert.equal(store.activeSessionId, 'B')
  assert.equal(store.activeRun.runId, 'run-B')
  assert.equal(store.isStreaming, true)
})

for (const operation of ['load', 'create']) {
  test(`late ${operation} cannot commit after the same account logs in again`, async (t) => {
    const { store, auth } = setup()
    const pending = deferred()
    t.mock.method(request, operation === 'load' ? 'get' : 'post', async () => pending.promise)
    const response = operation === 'load' ? store.loadMessages('A') : store.startNewSession('new')
    const rejected = assert.rejects(response, { name: 'SyncScopeChangedError' })
    auth.loginGeneration = Symbol('new login')
    store.messages = [{ id: 'current', conversationId: 'A', role: 'USER', content: 'current login', status: 'COMPLETED', parts: [] }]
    pending.resolve(operation === 'load' ? detail('A') : session('new'))
    await rejected
    assert.equal(store.messages[0].content, 'current login')
    assert.equal(store.activeSessionId, 'A')
  })
}

test('a stale subject-list lookup cannot create or activate a conversation after another selection', async (t) => {
  const { store } = setup()
  const storage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => 'not-loaded', setItem() { assert.fail('stale mapping write') } }
  t.after(() => { globalThis.localStorage = storage })
  const pending = deferred()
  t.mock.method(request, 'get', async () => pending.promise)
  t.mock.method(request, 'post', async () => { assert.fail('stale create') })
  const rejected = assert.rejects(store.startSubjectConversation('subject-A'), { name: 'SyncScopeChangedError' })
  request.get = async () => detail('B')
  await store.loadMessages('B')
  pending.resolve([session('not-loaded')])
  await rejected
  assert.equal(store.activeSessionId, 'B')
  assert.equal(store.messages[0].content, 'B')
})

test('disconnect keeps polling beyond 90 seconds and restores canonical completion without resending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { store } = setup()
  let sends = 0
  let statusCalls = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => { sends += 1; return disconnectedResponse(JSON.parse(init.body).requestId) })
  t.mock.method(request, 'get', async (url) => String(url).includes('/runs/')
    ? status(++statusCalls > 61 ? 'COMPLETED' : 'RUNNING') : detail('A', 'canonical final reply'))
  await assert.rejects(store.sendMessage('question'), /stream disconnected/)
  for (let index = 0; index < 60; index += 1) { t.mock.timers.tick(1500); await nextTurn() }
  assert.equal(statusCalls, 61)
  assert.equal(store.isStreaming, true)
  t.mock.timers.tick(1500)
  await nextTurn()
  assert.equal(store.isStreaming, false)
  assert.equal(store.activeRun, null)
  assert.equal(store.messages[0].content, 'canonical final reply')
  assert.equal(store.lastError, null)
  assert.equal(sends, 1)
})

test('disconnect with UNKNOWN stops polling and exposes the persisted recovery target', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { store } = setup()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => disconnectedResponse(JSON.parse(init.body).requestId))
  t.mock.method(request, 'get', async () => { calls += 1; return status('UNKNOWN') })
  await assert.rejects(store.sendMessage('question'), /stream disconnected/)
  assert.equal(store.isStreaming, false)
  assert.equal(store.activeRun.executionActive, true)
  assert.equal(store.recoverableTarget.attemptId, 'attempt-A')
  t.mock.timers.tick(330000)
  await nextTurn()
  assert.equal(calls, 1)
})

test('late disconnect status cannot clear a newly selected conversation or its active stream', async (t) => {
  const { store } = setup()
  const pending = deferred()
  let queried = false
  t.mock.method(globalThis, 'fetch', async (_url, init) => disconnectedResponse(JSON.parse(init.body).requestId))
  t.mock.method(request, 'get', async url => {
    if (String(url).includes('/runs/')) { queried = true; return pending.promise }
    return detail('B')
  })
  const rejected = assert.rejects(store.sendMessage('question'), /stream disconnected/)
  while (!queried) await nextTurn()
  await store.loadMessages('B')
  store.activeRun = { conversationId: 'B', runId: 'run-B', requestId: 'request-B', executionActive: true }
  store.isStreaming = true
  store.streamingContent = 'new conversation response'
  pending.resolve(status('COMPLETED'))
  await rejected
  assert.equal(store.activeSessionId, 'B')
  assert.equal(store.activeRun.runId, 'run-B')
  assert.equal(store.isStreaming, true)
  assert.equal(store.streamingContent, 'new conversation response')
  assert.equal(store.messages[0].content, 'B')
})

test('a status query still in flight after account replacement cannot commit to that account', async (t) => {
  const { store, auth } = setup()
  const pending = deferred()
  let queried = false
  t.mock.method(globalThis, 'fetch', async (_url, init) => disconnectedResponse(JSON.parse(init.body).requestId))
  t.mock.method(request, 'get', async () => { queried = true; return pending.promise })
  const rejected = assert.rejects(store.sendMessage('question'), /stream disconnected/)
  while (!queried) await nextTurn()
  auth.user = { ...auth.user, id: 'other-owner' }
  store.activeRun = { conversationId: 'A', runId: 'new-owner-run', requestId: 'new-owner-request', executionActive: true }
  store.streamingContent = 'other owner'
  pending.resolve(status('UNKNOWN'))
  await rejected
  assert.equal(store.activeRun.runId, 'new-owner-run')
  assert.equal(store.streamingContent, 'other owner')
})

test('bounded polling reports an unconfirmed run while retaining its stop capability', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { store } = setup()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => disconnectedResponse(JSON.parse(init.body).requestId))
  t.mock.method(request, 'get', async () => { calls += 1; return status() })
  await assert.rejects(store.sendMessage('question'), /stream disconnected/)
  for (let index = 0; index < 220; index += 1) { t.mock.timers.tick(1500); await nextTurn() }
  assert.equal(calls, 221)
  assert.equal(store.lastErrorCode, 'CHAT_STATUS_POLL_TIMEOUT')
  assert.equal(store.activeRun.executionActive, true)
  assert.equal(store.isStreaming, true)
  t.mock.timers.tick(1500)
  await nextTurn()
  assert.equal(calls, 221)
})

test('late canonical history after a settled poll cannot replace a new conversation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { store } = setup()
  const pending = deferred()
  let calls = 0
  let loadingHistory = false
  t.mock.method(globalThis, 'fetch', async (_url, init) => disconnectedResponse(JSON.parse(init.body).requestId))
  t.mock.method(request, 'get', async url => {
    if (String(url).includes('/runs/')) return status(++calls === 1 ? 'RUNNING' : 'COMPLETED')
    if (String(url).endsWith('/B')) return detail('B')
    loadingHistory = true
    return pending.promise
  })
  await assert.rejects(store.sendMessage('question'), /stream disconnected/)
  t.mock.timers.tick(1500)
  await nextTurn()
  assert.equal(loadingHistory, true)
  await store.loadMessages('B')
  store.lastError = 'new conversation state'
  pending.resolve(detail('A', 'late final reply'))
  await nextTurn()
  assert.equal(store.messages[0].content, 'B')
  assert.equal(store.lastError, 'new conversation state')
})

test('a disconnected run retry follows status to completion without another model retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { store } = setup()
  store.messages = [{ id: 'user-A', conversationId: 'A', role: 'USER', status: 'FAILED', content: 'question', parts: [], runId: 'run-A' }]
  let sends = 0
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sends += 1
    assert.ok(String(url).endsWith('/api/ai/conversations/A/runs/run-A/attempts'))
    return disconnectedResponse(JSON.parse(init.body).requestId)
  })
  t.mock.method(request, 'get', async url => String(url).includes('/runs/')
    ? status(++calls === 1 ? 'RUNNING' : 'COMPLETED') : detail('A', 'retry completed'))
  await store.retryPendingMessage('user-A')
  assert.equal(store.isStreaming, true)
  t.mock.timers.tick(1500)
  await nextTurn()
  assert.equal(store.isStreaming, false)
  assert.equal(store.messages[0].content, 'retry completed')
  assert.equal(sends, 1)
})

test('canonical FAILED history keeps server run identity so the interrupted turn can retry', async (t) => {
  const { store } = setup()
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body)
    requests.push(String(url))
    if (requests.length === 1) return disconnectedResponse(body.requestId)
    const event = { protocolVersion: 1, conversationId: 'A', runId: 'run-A', attemptId: 'retry-attempt',
      requestId: body.requestId, userMessageId: 'user-A', replyMessageId: 'retry-reply', sequence: 1,
      event: 'run.completed', payload: { executionActive: false } }
    return new Response(`event: run.completed\ndata: ${JSON.stringify(event)}\n\n`, {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    })
  })
  t.mock.method(request, 'get', async url => String(url).includes('/runs/')
    ? { ...status('FAILED'), userMessageId: 'user-A', currentReplyMessageId: 'reply-A' }
    : { ...detail('A'), messages: [
      { id: 'user-A', role: 'USER', status: 'COMPLETED', content: 'question', parts: [] },
      { id: 'reply-A', role: 'ASSISTANT', status: 'FAILED', content: 'partial reply', parts: [] },
    ] })
  await assert.rejects(store.sendMessage('question'), /stream disconnected/)
  assert.equal(store.messages.find(message => message.id === 'user-A').runId, 'run-A')
  assert.equal(store.messages.find(message => message.id === 'reply-A').runId, 'run-A')
  await store.retryPendingMessage('reply-A')
  assert.equal(requests.length, 2)
  assert.ok(requests[1].endsWith('/api/ai/conversations/A/runs/run-A/attempts'))
})
