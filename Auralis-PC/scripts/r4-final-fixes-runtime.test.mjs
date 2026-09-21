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
  let pushCalls = 0
  try {
    useSyncApi.pushChanges = async () => {
      pushCalls += 1
      if (failed) throw { response: { status: 503, data: { title: 'Unavailable', status: 503, detail: 'provider secret' } } }
      return { results: [], serverCursor: null }
    }
    useSyncApi.pullChanges = async () => ({ changes: [], nextCursor: null, hasMore: false, resetRequired: false })
    const sync = useSyncStore()
    const repository = await getLocalRepository('final-fix-user', 'final-fix-device')
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
    await sync.flushNow()
    assert.equal(sync.lastSyncError, null)
    assert.equal(sync.lastSyncErrorCode, null)
  } finally {
    useSyncApi.pushChanges = originalPush
    useSyncApi.pullChanges = originalPull
  }
})
