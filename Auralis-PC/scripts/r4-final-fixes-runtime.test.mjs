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
const { AiStreamController } = await import('../src/services/aiStreamController.ts')
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

test('SSE message.error never becomes a raw UI Error.message', async () => {
  const controller = new AiStreamController(async function* () {
    yield { event: 'message.error', data: { code: 'MODEL_PROVIDER_ERROR', message: 'provider secret' } }
  })
  await assert.rejects(
    controller.run({ content: 'hello' }),
    (error) => error instanceof SafeClientError
      && error.code === 'AI_PROVIDER_ERROR'
      && error.message === 'AI 请求失败，请重试'
      && !error.message.includes('provider secret'),
  )
})

test('chat retry reuses the same clientRequestId for the same logical request', async () => {
  const seen = []
  const controller = new AiStreamController(async function* (input) {
    seen.push(input.clientRequestId)
    yield { event: 'message.completed', data: { content: 'ok' } }
  })
  const input = { conversationId: 'conversation-1', content: 'retry me', clientRequestId: 'request-1' }
  await controller.run(input)
  await controller.run(input)
  assert.deepEqual(seen, ['request-1', 'request-1'])
})

test('chat Store retry dispatches the existing pending message without appending another user message', async () => {
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
  const sessionId = 'chat-retry-conversation'
  chat.sessions.push({
    id: sessionId,
    remoteId: 'remote-chat-retry',
    creationRequestId: 'creation-request',
    title: '重试会话',
    version: 1,
    localOnly: false,
    purpose: 'GENERAL',
  })
  chat.activeSessionId = sessionId
  chat.messages.push({
    id: 'pending-user',
    conversationId: sessionId,
    clientRequestId: 'client-retry-1',
    role: 'USER',
    status: 'PENDING',
    content: 'retry me',
    createdAt: new Date().toISOString(),
    citations: [],
  })
  const requests = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body))
    return new Response('event: message.completed\ndata: {"content":"ok"}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  try {
    await chat.sendMessage('retry me', { pendingRequestId: 'client-retry-1' })
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(requests.length, 1)
  assert.equal(requests[0].clientRequestId, 'client-retry-1')
  assert.equal(chat.messages.filter((message) => message.role === 'USER').length, 1)
  assert.equal(chat.messages.find((message) => message.id === 'pending-user').status, 'COMPLETED')
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
