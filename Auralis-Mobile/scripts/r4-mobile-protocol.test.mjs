import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { resolveRuntimeConfig, resolveWebsocketUrl } from '../src/config/runtime.ts'
import {
  ApiProblemError,
  assertDirectDto,
  createRefreshCoordinator,
  dedupeEventKey,
  normalizeCursor,
  parseProblemDetails,
} from '../src/api/protocol.ts'
import { getOrCreateDeviceIdentity, isUuid } from '../src/api/deviceIdentity.ts'
import { createAuthApi } from '../src/api/useAuthApi.ts'
import { createRealtimeApi } from '../src/api/realtimeApi.ts'
import { createAiApi } from '../src/api/aiApi.ts'
import { createSyncApi } from '../src/api/useSyncApi.ts'
import { createRequestExecutor } from '../src/api/requestCore.ts'
import { createLocalDataScope } from '../src/services/localDataScope.ts'
import { createSseDecoder } from '../src/api/sse.ts'

test('resolves H5 and mini-program service addresses only from environment values', () => {
  const h5 = resolveRuntimeConfig({
    VITE_API_BASE_URL: 'https://api.auralis.test',
    VITE_WS_BASE_URL: 'wss://events.auralis.test',
  }, 'h5')
  assert.equal(h5.apiBaseUrl, 'https://api.auralis.test')
  assert.equal(h5.websocketBaseUrl, 'wss://events.auralis.test')

  const weixin = resolveRuntimeConfig({
    VITE_API_BASE_URL: 'https://api.auralis.test/',
    VITE_WS_BASE_URL: 'wss://events.auralis.test/',
  }, 'mp-weixin')
  assert.equal(weixin.apiBaseUrl, 'https://api.auralis.test')
  assert.equal(weixin.websocketBaseUrl, 'wss://events.auralis.test')
})

test('rejects missing or insecure production service addresses', () => {
  assert.throws(() => resolveRuntimeConfig({}, 'h5'), /VITE_API_BASE_URL/)
  assert.throws(() => resolveRuntimeConfig({
    VITE_API_BASE_URL: 'http://api.auralis.test',
    VITE_WS_BASE_URL: 'ws://events.auralis.test',
  }, 'mp-weixin'), /HTTPS/)
})

test('resolves the ticket websocket path without adding an access token', () => {
  const config = resolveRuntimeConfig({
    VITE_API_BASE_URL: 'https://api.auralis.test',
    VITE_WS_BASE_URL: 'wss://events.auralis.test',
  }, 'h5')
  const url = resolveWebsocketUrl('/ws/events?ticket=one-time-ticket', config)
  assert.equal(url, 'wss://events.auralis.test/ws/events?ticket=one-time-ticket')
  assert.equal(/[?&]token=/.test(url), false)
})

test('parses RFC Problem Details and preserves field errors', () => {
  const problem = parseProblemDetails({
    title: 'Validation failed',
    status: 400,
    detail: 'Request validation failed',
    code: 'VALIDATION_FAILED',
    traceId: 'trace-1',
    fieldErrors: [{ field: 'password', message: 'size must be between 12 and 200' }],
  })
  assert.equal(problem.status, 400)
  assert.equal(problem.code, 'VALIDATION_FAILED')
  assert.equal(problem.fieldErrors[0].field, 'password')
})

test('accepts direct DTOs and rejects the legacy Result wrapper', () => {
  const dto = { id: 'subject-1', name: 'Math' }
  assert.deepEqual(assertDirectDto(dto), dto)
  assert.equal(assertDirectDto(undefined), undefined)
  assert.throws(
    () => assertDirectDto({ code: 200, data: dto }),
    (error) => error instanceof ApiProblemError && error.status === 500,
  )
})

test('shares one refresh operation across concurrent 401 retries', async () => {
  let calls = 0
  const coordinator = createRefreshCoordinator(async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 5))
    return 'access-token-2'
  })
  const first = coordinator.refresh()
  const second = coordinator.refresh()
  assert.equal(first, second)
  assert.deepEqual(await Promise.all([first, second]), ['access-token-2', 'access-token-2'])
  assert.equal(calls, 1)
})

test('normalizes opaque cursors and deduplicates realtime signals', () => {
  assert.equal(normalizeCursor(null), null)
  assert.equal(normalizeCursor(17), '17')
  assert.equal(normalizeCursor(' opaque-cursor '), 'opaque-cursor')
  assert.equal(dedupeEventKey({ type: 'SYNC_CHANGED', cursor: 'c-1' }), 'SYNC_CHANGED:c-1')
})

test('creates and reuses a stable server-compatible device identity', () => {
  const values = new Map()
  const storage = {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
  }
  const first = getOrCreateDeviceIdentity(storage, {
    platform: 'ios',
    model: 'iPad Pro',
  })
  const second = getOrCreateDeviceIdentity(storage, {
    platform: 'ios',
    model: 'Different display name',
  })
  assert.equal(isUuid(first.deviceId), true)
  assert.equal(second.deviceId, first.deviceId)
  assert.equal(first.platform, 'IOS')
  assert.equal(first.deviceName, 'iPad Pro')
})

test('auth and realtime wrappers call only the frozen OpenAPI routes', async () => {
  const calls = []
  const client = {
    async request(path, method, options) {
      calls.push({ path, method, options })
      if (path === '/api/auth/login') return {
        user: { id: 'user-1', username: 'alice', displayName: 'Alice' },
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
        sessionId: 'session-1',
        deviceId: 'device-1',
      }
      if (path === '/api/realtime/ticket') return {
        ticket: 'ticket-1',
        websocketUrl: '/ws/events?ticket=ticket-1',
      }
      return undefined
    },
  }
  const auth = createAuthApi(client)
  const realtime = createRealtimeApi(client)

  await auth.login({
    username: 'alice',
    password: 'very-long-password',
    deviceId: 'device-1',
    deviceName: 'iPad',
    platform: 'IOS',
  })
  await auth.logout()
  await realtime.issueTicket('device-1')

  assert.deepEqual(calls.map(({ path, method }) => `${method} ${path}`), [
    'post /api/auth/login',
    'post /api/auth/logout',
    'post /api/realtime/ticket',
  ])
})

test('AI conversation wrapper uses list/detail/delete routes with versioned deletion', async () => {
  const calls = []
  const client = {
    async request(path, method, options) {
      calls.push({ path, method, options })
      return method === 'get' && path === '/api/ai/conversations'
        ? [{ id: 'conversation-1', version: 2 }]
        : { id: 'conversation-1', version: 2 }
    },
  }
  const ai = createAiApi(client)
  await ai.createConversation({ title: 'New chat', baseVersion: 0, clientRequestId: 'client-request-1' })
  await ai.listConversations()
  await ai.getConversation('conversation-1')
  await ai.deleteConversation('conversation-1', 2)
  assert.deepEqual(calls, [
    { path: '/api/ai/conversations', method: 'post', options: { body: { title: 'New chat', baseVersion: 0, clientRequestId: 'client-request-1' } } },
    { path: '/api/ai/conversations', method: 'get', options: undefined },
    { path: '/api/ai/conversations/{conversationId}', method: 'get', options: { pathParams: { conversationId: 'conversation-1' } } },
    { path: '/api/ai/conversations/{conversationId}', method: 'delete', options: { pathParams: { conversationId: 'conversation-1' }, query: { baseVersion: 2 } } },
  ])
})

test('sync wrapper uses device batches, opaque cursors, and snapshot recovery routes', async () => {
  const calls = []
  const sync = createSyncApi({
    async request(path, method, options) {
      calls.push({ path, method, options })
      if (path === '/api/sync/push') return { results: [], serverCursor: 'c-2' }
      if (path === '/api/sync/pull') return { changes: [], nextCursor: 'c-3', hasMore: false, resetRequired: false }
      return { snapshotCursor: 'c-4', subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [] }
    },
  })
  await sync.push({ deviceId: 'device-1', mutations: [] })
  await sync.pull('opaque-cursor', 100)
  await sync.snapshot()
  assert.deepEqual(calls.map(({ path, method }) => `${method} ${path}`), [
    'post /api/sync/push',
    'get /api/sync/pull',
    'get /api/sync/snapshot',
  ])
  assert.deepEqual(calls[1].options.query, { cursor: 'opaque-cursor', limit: 100 })
})

test('local data scope isolates users without deleting the legacy namespace', () => {
  const values = new Map()
  const scope = createLocalDataScope({
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
  })
  assert.equal(scope.current(), 'legacy-unassigned')
  const alice = scope.activate('user-a', 'device-a')
  const bob = scope.activate('user-b', 'device-a')
  assert.notEqual(alice, bob)
  assert.equal(scope.current(), bob)
  const resetBob = scope.reset('user-b', 'device-a')
  assert.notEqual(resetBob, bob)
  assert.equal(scope.activate('user-b', 'device-a'), resetBob)
  assert.equal(values.has('h5_db_subjects'), false)
})

test('pomodoro counts use the active local data scope', async () => {
  const source = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
  const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.match(source, /localDataScope/)
  assert.doesNotMatch(source, /getStorageSync\(['"]pomodoro_counts['"]\)/)
  assert.doesNotMatch(source, /setStorageSync\(['"]pomodoro_counts['"]\)/)
  assert.match(source, /auralis:local:\$\{localDataScope\.current\(\)\}:pomodoro_counts/)
  assert.match(appSource, /loadPomodoroCount/)
})

test('mobile home and profile do not inject demo task or profile metrics', async () => {
  const homeSource = await readFile(new URL('../src/pages/mobile/home/index.vue', import.meta.url), 'utf8')
  const profileSource = await readFile(new URL('../src/pages/mobile/profile/index.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(homeSource, /staticDemoTasks|demo-\d+/)
  assert.doesNotMatch(homeSource, /注入演示|静态测试数据/)
  assert.doesNotMatch(profileSource, /completedCount\s*\|\|\s*38/)
  assert.doesNotMatch(profileSource, /focusHours\s*\|\|\s*24\.5/)
  assert.doesNotMatch(profileSource, /joinedDays\s*=\s*ref\(42\)/)
})

test('mobile handwriting does not fabricate OCR or knowledge extraction', async () => {
  const source = await readFile(new URL('../src/pages/mobile/handwriting/index.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Mock handwriting|Mock AI|识别内容：|已为您建立结构化关系/)
  assert.match(source, /识别服务尚未接通/)
})

test('tablet workspace summary uses the AI stream instead of fixed demo text', async () => {
  const source = await readFile(new URL('../src/pages/tablet/workspace/index.vue', import.meta.url), 'utf8')
  assert.match(source, /chatWithAI/)
  assert.doesNotMatch(source, /new Promise\(r\s*=>\s*setTimeout\(r|全科知识架构概览与核心体系要点|重点导读与精炼要点总结/)
})

test('SSE decoder preserves event boundaries across transport chunks', () => {
  const events = []
  const decoder = createSseDecoder((event) => events.push(event))
  decoder.push('event: message.del')
  decoder.push('ta\ndata: "hel')
  decoder.push('lo"\n\nevent: message.completed\ndata: {"content":"hello"}\n\n')
  decoder.finish()
  assert.deepEqual(events, [
    { event: 'message.delta', data: 'hello' },
    { event: 'message.completed', data: { content: 'hello' } },
  ])
})

test('HTTP transport retries one 401 with refreshed auth and returns a direct DTO', async () => {
  const calls = []
  let refreshCalls = 0
  const responses = [
    { statusCode: 401, data: { title: 'Unauthorized', status: 401 } },
    { statusCode: 200, data: { id: 'subject-1', name: 'Math' } },
  ]
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      calls.push(options)
      options.success(responses.shift())
    },
    getAccessToken: () => calls.length === 0 ? 'access-1' : 'access-2',
    refreshAccessToken: async () => {
      refreshCalls += 1
      return true
    },
  })

  const result = await execute({ url: '/api/subjects', method: 'GET' })
  assert.deepEqual(result, { id: 'subject-1', name: 'Math' })
  assert.equal(refreshCalls, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].header.Authorization, 'Bearer access-1')
  assert.equal(calls[1].header.Authorization, 'Bearer access-2')
})

test('HTTP transport rejects a failed response as ApiProblemError', async () => {
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      options.success({
        statusCode: 409,
        data: { title: 'Conflict', detail: 'Version mismatch', status: 409, code: 'RESOURCE_VERSION_CONFLICT' },
      })
    },
    getAccessToken: () => null,
    refreshAccessToken: async () => false,
  })
  await assert.rejects(
    execute({ url: '/api/tasks/task-1', method: 'PUT', data: { baseVersion: 1 } }),
    (error) => error instanceof ApiProblemError && error.code === 'RESOURCE_VERSION_CONFLICT',
  )
})

test('HTTP transport never refreshes recursively while refreshing the session', async () => {
  let refreshCalls = 0
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      options.success({ statusCode: 401, data: { title: 'Unauthorized', status: 401 } })
    },
    getAccessToken: () => 'expired',
    refreshAccessToken: async () => {
      refreshCalls += 1
      return false
    },
  })
  await assert.rejects(execute({
    url: '/api/auth/refresh',
    method: 'POST',
    data: { refreshToken: 'refresh' },
  }), (error) => error instanceof ApiProblemError && error.status === 401)
  assert.equal(refreshCalls, 0)
})
