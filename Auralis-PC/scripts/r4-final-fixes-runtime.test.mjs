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

const { classifyClientError, SafeClientError } = await import('../src/services/clientErrorPolicy.ts')
const { createPinia, setActivePinia } = await import('pinia')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { useChatStore } = await import('../src/store/useChatStore.ts')
const { useSyncStore } = await import('../src/store/useSyncStore.ts')
const { useSyncApi } = await import('../src/api/useSyncApi.ts')
const { getLocalRepository } = await import('../src/services/localDb.ts')

class MemoryStorage {
  #values = new Map()
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null }
  setItem(key, value) { this.#values.set(key, String(value)) }
  removeItem(key) { this.#values.delete(key) }
  clear() { this.#values.clear() }
}

test('safe client errors map raw provider details to bounded actionable copy', () => {
  const mapped = classifyClientError({ code: 'MODEL_PROVIDER_ERROR', message: 'secret provider detail' }, 'AI_STREAM')
  assert.equal(mapped.code, 'AI_PROVIDER_ERROR')
  assert.equal(mapped.message, 'AI 请求失败，请重试')
  assert.doesNotMatch(mapped.message, /secret provider detail/)
  assert.ok(mapped.detail.length <= 240)
})

test('safe client errors remain stable when classifyClientError is called a second time', () => {
  const cases = [
    { code: 'AUTH_REQUIRED', message: '登录状态已失效，请重新登录', detail: 'auth detail', offline: false, retryable: false },
    { code: 'AI_PROVIDER_ERROR', message: 'AI 请求失败，请重试', detail: 'provider detail', offline: false, retryable: true },
    { code: 'NETWORK_OFFLINE', message: '网络中断，消息会使用相同请求 ID 重试', detail: 'offline detail', offline: true, retryable: true },
  ]
  for (const expected of cases) {
    const safe = new SafeClientError(expected)
    const remapped = classifyClientError(safe, 'CHAT')
    assert.deepEqual(remapped, expected)
  }
})

function activeChatFixture(t) {
  globalThis.localStorage = new MemoryStorage()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setSession({
    user: { id: 'chat-retry-user', username: 'chat-retry' },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
    sessionId: 'chat-retry-session',
    serverDeviceId: 'chat-retry-device',
  })
  const chat = useChatStore()
  t.after(() => chat.abortStream())
  const sessionId = 'chat-retry-conversation'
  chat.sessions.push({
    id: sessionId,
    remoteId: 'remote-chat-retry',
    title: '重试会话',
    version: 1,
    chatProtocolVersion: 1,
    chatSupported: true,
    chatScopeState: 'UNBOUND',
  })
  chat.activeSessionId = sessionId
  return chat
}

function chatResponse(command, events) {
  const stream = events.map(({ event, payload }, index) => {
    const envelope = {
      protocolVersion: 1,
      conversationId: command.conversationId,
      requestId: command.requestId,
      runId: 'run-1',
      attemptId: 'attempt-1',
      userMessageId: 'user-message',
      replyMessageId: 'assistant-message',
      sequence: index + 1,
      event,
      payload,
    }
    return 'event: ' + event + '\ndata: ' + JSON.stringify(envelope) + '\n\n'
  })
  return new Response(stream.join(''), { headers: { 'content-type': 'text/event-stream' } })
}

test('a protocol-1 run failure projects safe error text to the chat UI', async (t) => {
  const chat = activeChatFixture(t)
  t.mock.method(globalThis, 'fetch', async (_url, init) =>
    chatResponse(JSON.parse(init.body), [
      { event: 'run.started', payload: {} },
      { event: 'run.failed', payload: { safeErrorCode: 'CHAT_RUN_FAILED', message: 'provider secret' } },
    ]),
  )

  await chat.sendMessage('hello')
  assert.equal(chat.lastErrorCode, 'CHAT_RUN_FAILED')
  assert.equal(chat.lastError, 'AI 请求生成失败，请重试。')
  assert.equal(chat.pendingMessage?.status, 'FAILED')
})

test('retry before run admission resends the same turn without appending another user message', async (t) => {
  const chat = activeChatFixture(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(String(url), /\/api\/ai\/messages\/stream$/)
    const command = JSON.parse(init.body)
    requests.push(command)
    if (requests.length === 1) throw new TypeError('Failed to fetch')
    return chatResponse(command, [
      { event: 'run.started', payload: {} },
      { event: 'text.delta', payload: { text: 'ok', publicTextDelta: 'ok' } },
      { event: 'run.completed', payload: {} },
    ])
  })

  await assert.rejects(chat.sendMessage('retry me', {
    subjectId: 'subject-1', retrievalMode: 'SUBJECT', selectionText: 'selected excerpt',
  }))
  const pending = chat.pendingMessage
  assert.ok(pending)
  assert.equal(pending.runId, undefined)
  await chat.retryPendingMessage(pending.id)

  assert.equal(requests.length, 2)
  assert.equal(requests[0].protocolVersion, 1)
  assert.ok(requests[0].requestId)
  assert.equal(requests[0].selectionText, 'selected excerpt')
  assert.deepEqual(requests[1], requests[0])
  assert.equal(chat.messages.filter((message) => message.role === 'USER').length, 1)
  assert.equal(chat.messages.find((message) => message.id === pending.id)?.status, 'COMPLETED')
  assert.equal(chat.messages.find((message) => message.role === 'ASSISTANT')?.content, 'ok')
})

test('sync error remains projected until a complete subsequent cycle succeeds', async () => {
  globalThis.localStorage = new MemoryStorage()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setSession({
    user: { id: 'final-fix-user', username: 'final-fix' },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
    sessionId: 'final-fix-session',
    serverDeviceId: 'final-fix-device',
  })
  const originalPush = useSyncApi.pushChanges
  const originalPull = useSyncApi.pullChanges
  let failed = true
  let pullFailsOnce = true
  let pushCalls = 0
  let pullCalls = 0
  try {
    useSyncApi.pushChanges = async () => {
      pushCalls += 1
      if (failed) throw { response: { status: 503, data: { title: 'Unavailable', status: 503, detail: 'provider secret' } } }
      return {
        results: [{ clientMutationId: 'final-fix-mutation', decision: 'PROCESSING' }],
        serverCursor: null,
      }
    }
    useSyncApi.pullChanges = async () => {
      pullCalls += 1
      if (pullFailsOnce) {
        pullFailsOnce = false
        throw { response: { status: 503, data: { title: 'Unavailable', status: 503, detail: 'pull provider secret' } } }
      }
      return { changes: [], nextCursor: 'final-fix-cursor', hasMore: false, resetRequired: false }
    }
    const sync = useSyncStore()
    const repository = await getLocalRepository('final-fix-user', 'final-fix-device')
    await repository.saveCursor('final-fix-cursor', false)
    await repository.commitMutation({
      resourceType: 'TASK', resourceId: 'final-fix-task', value: { id: 'final-fix-task', title: 'pending' },
      version: 1, deletedAt: null,
      mutation: { clientMutationId: 'final-fix-mutation', resourceType: 'TASK', resourceId: 'final-fix-task', mutationType: 'CREATE', payload: { id: 'final-fix-task', title: 'pending' } },
    })
    await assert.rejects(sync.flushNow())
    assert.equal(pushCalls, 1)
    assert.equal(sync.lastSyncErrorCode, 'SERVICE_UNAVAILABLE')
    assert.equal(sync.lastSyncError, '服务暂时不可用，请稍后重试')
    failed = false
    await assert.rejects(sync.flushNow())
    assert.equal(pushCalls, 2)
    assert.equal(pullCalls, 1)
    assert.equal(sync.lastSyncErrorCode, 'SERVICE_UNAVAILABLE')
    assert.equal(sync.lastSyncError, '服务暂时不可用，请稍后重试')
    await sync.flushNow()
    assert.equal(pullCalls, 2)
    assert.equal(sync.lastSyncError, null)
    assert.equal(sync.lastSyncErrorCode, null)
  } finally {
    useSyncApi.pushChanges = originalPush
    useSyncApi.pullChanges = originalPull
  }
})
