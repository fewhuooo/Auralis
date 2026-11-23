import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { access, readFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'

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
import { createOverviewApi } from '../src/api/overviewApi.ts'
import { createSourceApi } from '../src/api/sourceApi.ts'
import { createStatsApi } from '../src/api/statsApi.ts'
import {
  buildWorkspaceReadingContext,
  doesConversationMatchWorkspaceScope,
} from '../src/utils/workspaceChatScope.ts'
import { createRequestExecutor } from '../src/api/requestCore.ts'
import { createLocalDataScope } from '../src/services/localDataScope.ts'
import { createSseDecoder } from '../src/api/sse.ts'
import { createRoutePreloader } from '../src/utils/pagePreload.ts'
import { useLayoutStore } from '../src/store/useLayoutStore.ts'
import {
  buildPreviewFileName,
  isCoreFileViewerKind,
  resolveTabletPreviewKind,
} from '../src/utils/tabletFilePreview.ts'

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
    fieldErrors: [{ field: 'password', message: 'password does not meet the new-password policy' }],
  })
  assert.equal(problem.status, 400)
  assert.equal(problem.code, 'VALIDATION_FAILED')
  assert.equal(problem.fieldErrors[0].field, 'password')
})

test('mobile and tablet registration/reset apply the shared new-password requirements', async () => {
  const source = await readFile(new URL('../src/composables/useAuthForm.ts', import.meta.url), 'utf8')
  const loginValidation = source.slice(source.indexOf("if (mode.value === 'login' &&"), source.indexOf("if (mode.value === 'register'"))
  assert.match(source, /password\.length\s*<\s*8/)
  assert.match(source, /\\p\{Lu\}/)
  assert.match(source, /\\p\{Ll\}/)
  assert.match(source, /\\p\{P\}\\p\{S\}/)
  assert.match(source, /utf8Length\(password\)\s*>\s*72/)
  assert.doesNotMatch(loginValidation, /\\p\{(?:Lu|Ll|P|S)\}/, 'Login does not apply the new-password composition rules')
  assert.match(source, /mode\.value === 'login'\)\s*await auth\.login/)
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

test('creates and reuses a stable client device key', () => {
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
  assert.equal(isUuid(first.clientDeviceKey), true)
  assert.equal(second.clientDeviceKey, first.clientDeviceKey)
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
        serverDeviceId: 'device-1',
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
    clientDeviceKey: 'device-key-1',
    deviceName: 'iPad',
    platform: 'IOS',
  })
  const email = 'alice@example.test'
  const emailCode = '123456'
  await auth.sendRegistrationEmailCode({ email })
  await auth.register({
    username: 'alice', email, emailCode, password: 'very-long-password',
    clientDeviceKey: 'device-key-1', deviceName: 'iPad', platform: 'IOS',
  })
  await auth.sendPasswordResetEmailCode({ email })
  await auth.resetPassword({ email, emailCode, newPassword: 'a-new-long-password' })
  assert.deepEqual(calls[1].options.body, { email })
  assert.equal(calls[2].options.body.emailCode, emailCode)
  assert.deepEqual(calls[4].options.body, { email, emailCode, newPassword: 'a-new-long-password' })
  await auth.deleteAccount({ password: 'a-new-long-password' })
  assert.deepEqual(calls[5].options.body, { password: 'a-new-long-password' })
  await auth.logout()
  await realtime.issueTicket()

  assert.deepEqual(calls.map(({ path, method }) => `${method} ${path}`), [
    'post /api/auth/login',
    'post /api/auth/register/email-code',
    'post /api/auth/register',
    'post /api/auth/password/reset/email-code',
    'post /api/auth/password/reset',
    'delete /api/auth/me',
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
  await ai.getRunStatus('conversation-1', 'run-1')
  await ai.recoverRunAttempt('conversation-1', 'run-1', 'attempt-1')
  await ai.cancelRun('conversation-1', 'run-1')
  assert.deepEqual(calls, [
    { path: '/api/ai/conversations', method: 'post', options: { body: { title: 'New chat', baseVersion: 0, clientRequestId: 'client-request-1' } } },
    { path: '/api/ai/conversations', method: 'get', options: undefined },
    { path: '/api/ai/conversations/{conversationId}', method: 'get', options: { pathParams: { conversationId: 'conversation-1' } } },
    { path: '/api/ai/conversations/{conversationId}', method: 'delete', options: { pathParams: { conversationId: 'conversation-1' }, query: { baseVersion: 2 } } },
    { path: '/api/ai/conversations/{conversationId}/runs/{runId}', method: 'get', options: { pathParams: { conversationId: 'conversation-1', runId: 'run-1' } } },
    { path: '/api/ai/conversations/{conversationId}/runs/{runId}/attempts/{attemptId}/recover', method: 'post', options: { pathParams: { conversationId: 'conversation-1', runId: 'run-1', attemptId: 'attempt-1' } } },
    { path: '/api/ai/conversations/{conversationId}/runs/{runId}/cancel', method: 'post', options: { pathParams: { conversationId: 'conversation-1', runId: 'run-1' } } },
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
  await sync.push({ serverDeviceId: 'device-1', mutations: [] })
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

test('focus store scopes persisted state and outbox by active local data scope', async () => {
  const source = await readFile(new URL('../src/store/useFocusStore.ts', import.meta.url), 'utf8')
  const controllerSource = await readFile(new URL('../src/services/focusController.ts', import.meta.url), 'utf8')
  const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.match(source, /localDataScope/)
  assert.match(controllerSource, /auralis:local:\$\{scope\}:focus_state/)
  assert.match(controllerSource, /auralis:local:\$\{scope\}:focus_daily/)
  assert.match(controllerSource, /auralis:local:\$\{scope\}:focus_outbox/)
  assert.match(appSource, /reconcileNow/)
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

test('retired orphan mobile and tablet routes are removed', async () => {
  const retired = [
    '../src/pages/mobile/handwriting/index.vue',
    '../src/pages/mobile/settings/index.vue',
    '../src/pages/mobile/timeline/index.vue',
    '../src/pages/mobile/asset/index.vue',
    '../src/pages/mobile/stats/index.vue',
    '../src/pages/tablet/review/index.vue',
  ]
  for (const relPath of retired) {
    await assert.rejects(access(new URL(relPath, import.meta.url)), { code: 'ENOENT' })
  }
})

test('tablet workspace uses formal overview API and AI stream without fixed demo text', async () => {
  const workspaceSource = await readFile(new URL('../src/pages/tablet/workspace/index.vue', import.meta.url), 'utf8')
  const readerSource = await readFile(new URL('../src/components/tablet/workspace/WorkspaceCenterReader.vue', import.meta.url), 'utf8')
  const aiPanelSource = await readFile(new URL('../src/components/tablet/workspace/WorkspaceAiPanel.vue', import.meta.url), 'utf8')
  assert.match(workspaceSource, /overviewApi/)
  assert.match(readerSource, /outlineMarkdown/)
  assert.match(aiPanelSource, /chatWithAI/)
  assert.doesNotMatch(
    `${workspaceSource}\n${readerSource}\n${aiPanelSource}`,
    /new Promise\(r\s*=>\s*setTimeout\(r|全科知识架构概览与核心体系要点|重点导读与精炼要点总结/,
  )
})

test('overview API returns null on 404 and preserves source revision query', async () => {
  const calls = []
  const api = createOverviewApi({
    async request(path, method, options) {
      calls.push({ path, method, options })
      if (options?.pathParams?.subjectId === 'missing') {
        throw new ApiProblemError({ title: 'Not Found', status: 404, detail: 'Missing', fieldErrors: [] })
      }
      if (options?.pathParams?.subjectId === 'err') {
        throw new ApiProblemError({ title: 'Server Error', status: 500, detail: 'Boom', fieldErrors: [] })
      }
      return { outlineMarkdown: '# Outline', summaryMarkdown: 'Summary' }
    },
  })
  assert.equal(await api.getSubject('missing'), null)
  await assert.rejects(() => api.getSubject('err'), /Boom/)
  const srcOverview = await api.getSource('src-1', 'rev-9')
  assert.equal(srcOverview?.outlineMarkdown, '# Outline')
  assert.deepEqual(calls.at(-1), {
    path: '/api/overview-results/sources/{sourceId}',
    method: 'get',
    options: { pathParams: { sourceId: 'src-1' }, query: { ingestionRevision: 'rev-9' } },
  })
})

test('source API paginates all subject sources, filters deletedAt, and passes delete baseVersion', async () => {
  const calls = []
  const api = createSourceApi({
    async request(path, method, options) {
      calls.push({ path, method, options })
      if (method === 'get') {
        const cursor = options?.query?.cursor
        if (!cursor) {
          return {
            items: [{ id: 'src-1', subjectId: 'sub-1', title: 'Ch1' }],
            hasMore: true,
            nextCursor: 'cursor-2',
          }
        }
        return {
          items: [
            { id: 'src-2', subjectId: 'sub-1', title: 'Ch2' },
            { id: 'src-deleted', subjectId: 'sub-1', title: 'Old', deletedAt: '2026-11-16T00:00:00Z' },
          ],
          hasMore: false,
        }
      }
      return undefined
    },
  })

  const active = await api.listAllBySubject('sub-1')
  assert.deepEqual(active.map(item => item.id), ['src-1', 'src-2'])
  assert.equal(calls[1].options.query.cursor, 'cursor-2')

  await api.delete('src-2', 4)
  assert.deepEqual(calls.at(-1), {
    path: '/api/sources/{id}',
    method: 'delete',
    options: { pathParams: { id: 'src-2' }, body: { baseVersion: 4 } },
  })
})

test('workspace AI scope omits currentSourceId/sourceIds in SUBJECT mode and matches full 4-field chatScope', () => {
  const subjectCtx = buildWorkspaceReadingContext('sub-1', null)
  assert.deepEqual(subjectCtx, { subjectId: 'sub-1', retrievalMode: 'SUBJECT' })
  assert.equal('currentSourceId' in subjectCtx, false)
  assert.equal('sourceIds' in subjectCtx, false)

  const pendingSourceCtx = buildWorkspaceReadingContext('sub-1', {
    id: 'src-pending',
    subjectId: 'sub-1',
    type: 'FILE',
    title: 'Pending.pdf',
    ingestionStatus: 'PARSING',
  })
  assert.deepEqual(pendingSourceCtx, { subjectId: 'sub-1', retrievalMode: 'SUBJECT' })

  const readyCtx = buildWorkspaceReadingContext('sub-1', {
    id: 'src-ready',
    subjectId: 'sub-1',
    type: 'FILE',
    title: 'Ready.pdf',
    ingestionStatus: 'READY',
  })
  assert.deepEqual(readyCtx, { subjectId: 'sub-1', retrievalMode: 'AUTO', currentSourceId: 'src-ready' })

  assert.equal(doesConversationMatchWorkspaceScope({
    id: 'c-1',
    chatScopeState: 'BOUND',
    chatScope: { subjectId: 'sub-1', currentSourceId: null, retrievalMode: 'SUBJECT', sourceIds: [] },
  }, subjectCtx), true)

  assert.equal(doesConversationMatchWorkspaceScope({
    id: 'c-2',
    chatScopeState: 'BOUND',
    chatScope: { subjectId: 'sub-1', currentSourceId: null, retrievalMode: 'SELECTED_SOURCES', sourceIds: ['src-ready'] },
  }, subjectCtx), false)

  assert.equal(doesConversationMatchWorkspaceScope({
    id: 'c-3',
    chatScopeState: 'BOUND',
    chatScope: { subjectId: 'sub-1', currentSourceId: null, retrievalMode: 'AUTO', sourceIds: [] },
  }, subjectCtx), false)

  assert.equal(doesConversationMatchWorkspaceScope({
    id: 'c-4',
    chatScopeState: 'BOUND',
    chatScope: { subjectId: 'sub-1', currentSourceId: 'src-ready', retrievalMode: 'AUTO', sourceIds: [] },
  }, readyCtx), true)
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

test('HTTP returns login errors without re-launching the page or refreshing a saved session', async () => {
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      assert.equal(options.header.Authorization, undefined)
      options.success({ statusCode: 401, data: { status: 401, detail: 'Invalid credentials' } })
    },
    getAccessToken: () => 'saved-token',
    refreshAccessToken: async () => assert.fail('public authentication must not refresh'),
    onUnauthenticated: () => assert.fail('the original login form should receive the error'),
  })
  await assert.rejects(execute({ url: '/api/auth/login', method: 'POST' }),
    (error) => error instanceof ApiProblemError && error.status === 401)
})

test('a temporary refresh failure on a protected route keeps the current local session', async () => {
  const temporary = new Error('connection timed out')
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) { options.success({ statusCode: 401 }) },
    getAccessToken: () => 'saved-token',
    refreshAccessToken: async () => { throw temporary },
    onUnauthenticated: () => assert.fail('a network failure must not clear the local session'),
  })
  await assert.rejects(execute({ url: '/api/subjects' }), (error) => error === temporary)
})

test('a response from an earlier login cannot refresh or re-launch the current session', async () => {
  let generation = Symbol('first login')
  let reply
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      assert.equal(options.header.Authorization, 'Bearer first-account')
      reply = options.success
    },
    getAccessToken: () => 'first-account',
    getLoginGeneration: () => generation,
    refreshAccessToken: async () => assert.fail('an old request must not refresh a new login'),
    onUnauthenticated: () => assert.fail('an old response must not clear a new login'),
  })
  const request = execute({ url: '/api/subjects', method: 'POST', data: { name: 'First account draft' } })
  generation = Symbol('another login')
  reply({ statusCode: 401 })
  await assert.rejects(request, /登录状态已变化/)
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

test('Task color removal assertions (Mobile)', async () => {
  const root = new URL('../src/', import.meta.url)
  const taskStore = await readFile(new URL('store/useTaskStore.ts', root), 'utf8')
  const syncStore = await readFile(new URL('store/useSyncStore.ts', root), 'utf8')
  const syncStoreTaskBranch = syncStore.slice(syncStore.indexOf("case 'TASK':"), syncStore.indexOf("case 'RELATION':"))

  assert.doesNotMatch(taskStore, /\bcolorOverride\b/)
  assert.doesNotMatch(taskStore, /\bcolor\??:\s*string/)
  assert.doesNotMatch(syncStoreTaskBranch, /colorOverride\s*:/)

  const mobileHome = await readFile(new URL('pages/mobile/home/index.vue', root), 'utf8')
  const tabletDashboard = await readFile(new URL('pages/tablet/dashboard/index.vue', root), 'utf8')
  const taskSelectSheet = await readFile(new URL('components/TaskSelectSheet.vue', root), 'utf8')

  for (const page of [mobileHome, tabletDashboard, taskSelectSheet]) {
    assert.doesNotMatch(page, /task\.color\b/)
  }
})

test('task payload cleanup exposes three states and preserves invalid raw payloads', async () => {
  const root = new URL('../src/', import.meta.url)
  const source = await readFile(new URL('services/localDb.ts', root), 'utf8')
  assert.match(source, /export type TaskMutationPayloadCleanupResult\s*=\s*[\s\S]*status: 'changed'/)
  assert.match(source, /status: 'unchanged'/)
  assert.match(source, /status: 'invalid'/)
  assert.match(source, /const rawPayload = typeof payload === 'string' \? payload : \(JSON\.stringify\(payload\) \?\? ''\)/)
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(parsed, 'color'\)/)
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(parsed, 'colorOverride'\)/)
  assert.match(source, /return \{ status: 'invalid', payload: rawPayload \}/)
})

test('task color migration quotes native string ids and bounds invalid warnings per platform', async () => {
  const root = new URL('../src/', import.meta.url)
  const source = await readFile(new URL('services/localDb.ts', root), 'utf8')
  assert.match(source, /UPDATE local_mutations SET payload = '\$\{sanitized\}' WHERE id = '\$\{esc\(String\(mutation\.id\)\)\}'/)
  assert.match(source, /let nativeInvalidTaskPayloadWarningEmitted = false/)
  assert.match(source, /let h5InvalidTaskPayloadWarningEmitted = false/)
  assert.match(source, /if \(nativeInvalidTaskPayloadWarningEmitted\) return/)
  assert.match(source, /if \(h5InvalidTaskPayloadWarningEmitted\) return/)
  assert.match(source, /if \(result\.status === 'changed'\)/)
})

test('connectRealtimeSync passes complete callback for SocketTask and handles disconnect during in-flight ticket without deadlock', async (context) => {
  const loginGen = Symbol('gen')
  let triggerSyncCalls = 0
  let socketOptions = []
  let ticketResolvers = []

  globalThis.__syncTestAuth = {
    isAuthenticated: true,
    user: { id: 'user-1' },
    serverDeviceId: 'dev-1',
    getLoginGeneration: () => loginGen,
  }
  globalThis.__syncTestSyncStore = {
    triggerSync: async () => { triggerSyncCalls += 1 },
  }
  globalThis.__syncTestRealtimeApi = {
    issueTicket: () => new Promise((resolve) => {
      ticketResolvers.push(resolve)
    }),
  }
  globalThis.uni = {
    connectSocket(opts) {
      socketOptions.push(opts)
      let openCb = null
      return {
        onOpen(cb) { openCb = cb },
        onMessage() {},
        onClose() {},
        onError() {},
        close() {},
        _emitOpen() { openCb?.() },
      }
    },
  }

  const mocks = new Map([
    ['./realtimeApi', 'export const realtimeApi = globalThis.__syncTestRealtimeApi;'],
    ['@/config/runtime', 'export const getRuntimeConfig = () => ({ apiBaseUrl: "https://api.auralis.test", websocketBaseUrl: "wss://ws.auralis.test", platform: "h5" }); export const resolveWebsocketUrl = (p, c) => c.websocketBaseUrl + p;'],
    ['@/store/useAuthStore', 'export const useAuthStore = () => globalThis.__syncTestAuth;'],
    ['@/store/useSyncStore', 'export const useSyncStore = () => globalThis.__syncTestSyncStore;'],
  ])

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (mocks.has(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
      }
      if (ctx.parentURL?.includes('/Auralis-Mobile/src/') && (specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z0-9]+$/i.test(specifier)) {
        return nextResolve(new URL(`${specifier}.ts`, ctx.parentURL).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })

  context.after(() => {
    loader.deregister()
    delete globalThis.__syncTestAuth
    delete globalThis.__syncTestSyncStore
    delete globalThis.__syncTestRealtimeApi
    delete globalThis.uni
  })

  const { connectRealtimeSync, disconnectRealtimeSync } = await import('../src/api/sync.ts?realtime-race-test')

  // Disconnect while first issueTicket is still pending, then immediately reconnect
  const firstAttempt = connectRealtimeSync()
  assert.equal(ticketResolvers.length, 1)
  disconnectRealtimeSync()
  const secondAttempt = connectRealtimeSync()
  assert.equal(ticketResolvers.length, 2)

  // Stale first ticket resolves after disconnect — must NOT open a socket
  ticketResolvers[0]({ ticket: 'stale-ticket', websocketUrl: '/ws/events?ticket=stale' })
  await firstAttempt
  assert.equal(socketOptions.length, 0)

  // Fresh second ticket resolves — must open socket with complete callback & trigger sync on open
  const origConnectSocket = globalThis.uni.connectSocket
  let createdTask = null
  globalThis.uni.connectSocket = (opts) => {
    createdTask = origConnectSocket(opts)
    return createdTask
  }
  ticketResolvers[1]({ ticket: 'fresh-ticket', websocketUrl: '/ws/events?ticket=fresh' })
  await secondAttempt
  assert.equal(socketOptions.length, 1)
  assert.equal(typeof socketOptions[0].complete, 'function')
  assert.equal(socketOptions[0].url, 'wss://ws.auralis.test/ws/events?ticket=fresh')

  createdTask._emitOpen()
  assert.equal(triggerSyncCalls, 1)
  disconnectRealtimeSync()
})

test('createRoutePreloader deduplicates routes, retries after failure, tolerates missing bridge, and cancels sibling preload', async () => {
  const noBridge = createRoutePreloader(() => undefined)
  await noBridge.preloadRoute('/pages/mobile/review/index')
  assert.equal(noBridge.isPreloaded('/pages/mobile/review/index'), true)

  const calls = []
  let failFirstReview = true
  const preloader = createRoutePreloader(() => ({
    preloadPage(options) {
      calls.push(options.url)
      if (options.url === '/pages/mobile/review/index' && failFirstReview) {
        failFirstReview = false
        options.fail?.()
        options.complete?.()
        return
      }
      if (options.url === '/pages/mobile/hung/index') {
        return
      }
      setTimeout(() => options.complete?.(), 5)
    },
  }))

  // First failure allows subsequent retry, whereas concurrent calls share inFlight
  await preloader.preloadRoute('/pages/mobile/review/index?tab=1')
  assert.equal(preloader.isPreloaded('/pages/mobile/review/index'), false)
  await Promise.all([
    preloader.preloadRoute('/pages/mobile/review/index'),
    preloader.preloadRoute('pages/mobile/review/index?tab=2'),
  ])
  assert.equal(preloader.isPreloaded('/pages/mobile/review/index'), true)
  assert.deepEqual(calls, ['/pages/mobile/review/index', '/pages/mobile/review/index'])

  // Already preloaded route does not invoke bridge again
  await preloader.preloadRoute('/pages/mobile/review/index')
  assert.equal(calls.length, 2)

  // Hung preload settles cleanly within maxWaitMs
  await preloader.preloadRoute('/pages/mobile/hung/index', 20)
  assert.equal(preloader.isPreloaded('/pages/mobile/hung/index'), false)

  // scheduleSiblingPreload skips currentUrl and respects cancellation
  const stopCancelled = preloader.scheduleSiblingPreload(
    ['/pages/mobile/home/index', '/pages/mobile/pomodoro/index'],
    '/pages/mobile/home/index',
    30,
  )
  stopCancelled()
  await new Promise(resolve => setTimeout(resolve, 45))
  assert.equal(preloader.isPreloaded('/pages/mobile/pomodoro/index'), false)

  const stopActive = preloader.scheduleSiblingPreload(
    ['/pages/mobile/home/index', '/pages/mobile/pomodoro/index', '/pages/mobile/profile/index'],
    '/pages/mobile/home/index',
    10,
  )
  await new Promise(resolve => setTimeout(resolve, 60))
  stopActive()
  assert.equal(preloader.isPreloaded('/pages/mobile/pomodoro/index'), true)
  assert.equal(preloader.isPreloaded('/pages/mobile/profile/index'), true)
})

test('useLayoutStore holds exit lock across preload window, cancels stale timers on clearExit, and renews returnTimer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  setActivePinia(createPinia())
  const store = useLayoutStore()

  store.startExit('right', 140, '/pages/mobile/home/index')
  assert.equal(store.isExiting, true)
  assert.equal(store.exitDirection, 'right')
  assert.equal(store.exitingRoute, '/pages/mobile/home/index')

  // Must not snap back at the old 190ms threshold while route chunk preloads
  t.mock.timers.tick(500)
  assert.equal(store.isExiting, true)

  // Renewing startExit cancels the earlier fallback timer
  store.startExit('left', 200, '/pages/mobile/review/index')
  t.mock.timers.tick(500)
  assert.equal(store.isExiting, true)
  assert.equal(store.exitingRoute, '/pages/mobile/review/index')

  // clearExit immediately releases lock and cancels pending fallback timer
  store.clearExit()
  assert.equal(store.isExiting, false)
  assert.equal(store.exitingRoute, '')

  store.startExit('right', 140, '/pages/mobile/pomodoro/index')
  t.mock.timers.tick(939)
  assert.equal(store.isExiting, true)
  t.mock.timers.tick(1)
  assert.equal(store.isExiting, false)
  assert.equal(store.exitingRoute, '')

  // triggerReturn renews timer on repeated invocations
  store.triggerReturn(550)
  t.mock.timers.tick(400)
  assert.equal(store.isReturning, true)
  store.triggerReturn(550)
  t.mock.timers.tick(400)
  assert.equal(store.isReturning, true)
  t.mock.timers.tick(150)
  assert.equal(store.isReturning, false)
})

test('statsApi.subject requests /api/stats/subjects/{subjectId} with subjectId, days, and timeZone', async () => {
  const calls = []
  const api = createStatsApi({
    async request(path, method, options) {
      calls.push({ path, method, options })
      return {
        subjectId: 'sub-1',
        timeZone: 'Asia/Shanghai',
        from: '2026-11-14',
        to: '2026-11-20',
        daily: [],
      }
    },
  })
  const res = await api.subject('sub-1', 'Asia/Shanghai', 7)
  assert.equal(res.subjectId, 'sub-1')
  assert.deepEqual(calls, [{
    path: '/api/stats/subjects/{subjectId}',
    method: 'get',
    options: {
      pathParams: { subjectId: 'sub-1' },
      query: { days: 7, timeZone: 'Asia/Shanghai' },
    },
  }])
})

test('tabletFilePreview resolves pdf, word, presentation, image, MIME fallback, and safe file names', () => {
  assert.equal(resolveTabletPreviewKind('学生操作手册2026.pdf'), 'pdf')
  assert.equal(resolveTabletPreviewKind('计划书_V24.5.docx'), 'word')
  assert.equal(resolveTabletPreviewKind('lecture.DOC'), 'word')
  assert.equal(resolveTabletPreviewKind('notes.rtf'), 'word')
  assert.equal(resolveTabletPreviewKind('intro.odt'), 'word')
  assert.equal(resolveTabletPreviewKind('slides.pptx'), 'presentation')
  assert.equal(resolveTabletPreviewKind('slides.ppt'), 'presentation')
  assert.equal(resolveTabletPreviewKind('diagram.PNG'), 'image')
  assert.equal(resolveTabletPreviewKind('raw-blob', 'application/pdf'), 'pdf')
  assert.equal(
    resolveTabletPreviewKind('raw-blob', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    'word',
  )
  assert.equal(
    resolveTabletPreviewKind('raw-blob', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    'presentation',
  )
  assert.equal(resolveTabletPreviewKind('archive.zip', 'application/zip'), 'unsupported')

  assert.equal(isCoreFileViewerKind('pdf'), true)
  assert.equal(isCoreFileViewerKind('word'), true)
  assert.equal(isCoreFileViewerKind('presentation'), true)
  assert.equal(isCoreFileViewerKind('image'), false)
  assert.equal(isCoreFileViewerKind('unsupported'), false)

  assert.equal(
    buildPreviewFileName('e8ab6e14-7013-43aa', '学生操作手册2026.pdf', 'application/pdf'),
    '学生操作手册2026.pdf',
  )
  assert.equal(
    buildPreviewFileName('download-file', '未命名资料', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    'download-file.docx',
  )
  assert.equal(
    buildPreviewFileName('课件_V1.pptx', '课件', ''),
    '课件_V1.pptx',
  )
})
