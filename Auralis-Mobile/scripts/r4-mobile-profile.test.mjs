import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiProblemError } from '../src/api/protocol.ts'
import { createRequestExecutor, isPasswordConfirmationFailure } from '../src/api/requestCore.ts'
import { createFocusController } from '../src/services/focusController.ts'
import { createSyncController } from '../src/services/syncController.ts'
import { readAutoSyncPreference, writeAutoSyncPreference } from '../src/services/syncPreferences.ts'
import {
  buildSubjectDistribution,
  canProbeSavedAiSettings,
  normalizeAiProvider,
  resolveEffectiveAiBaseUrl,
  resolveProfileSyncStatus,
  validateAiSettingsDraft,
} from '../src/utils/profileHelpers.ts'

test('autoSync preference defaults to true, persists false/true, and handles storage failures safely', () => {
  const map = new Map()
  const storage = {
    get: key => map.get(key),
    set: (key, val) => { map.set(key, val) },
  }

  assert.equal(readAutoSyncPreference(storage), true)
  assert.equal(writeAutoSyncPreference(storage, false), false)
  assert.equal(map.get('auralis.settings.autoSync'), 'false')
  assert.equal(readAutoSyncPreference(storage), false)
  assert.equal(writeAutoSyncPreference(storage, true), true)
  assert.equal(readAutoSyncPreference(storage), true)

  assert.equal(readAutoSyncPreference({
    get: () => { throw new Error('storage unavailable') },
  }), true)
})

test('buildSubjectDistribution sorts descending, keeps top 5, and clamps positive bar percentages', () => {
  assert.deepEqual(buildSubjectDistribution([]), [])

  const items = buildSubjectDistribution([
    { id: 's1', name: 'A', blockCount: 1 },
    { id: 's2', name: 'B', blockCount: 100 },
    { id: 's3', name: 'C', blockCount: 0 },
    { id: 's4', name: 'D', blockCount: 40 },
    { id: 's5', name: 'E', blockCount: 20 },
    { id: 's6', name: 'F', blockCount: 15 },
  ])

  assert.deepEqual(items.map(item => item.name), ['B', 'D', 'E', 'F', 'A'])
  assert.equal(items[0].pct, 100)
  assert.equal(items[4].pct, 10)
  assert.equal(items[0].color, '#8B9A6E')
  assert.equal(items[1].color, '#C89B6D')

  const zeroOnly = buildSubjectDistribution([{ id: 's0', name: 'Empty', blockCount: 0 }])
  assert.equal(zeroOnly[0].pct, 0)
})

test('AI settings validation and saved-probe guard enforce PC rules across providers', () => {
  assert.equal(normalizeAiProvider('DEEPSEEK'), 'DEEPSEEK')
  assert.equal(normalizeAiProvider('DeepSeek V3'), 'DEEPSEEK')
  assert.equal(normalizeAiProvider('硅基流动'), 'SILICONFLOW')
  assert.equal(normalizeAiProvider('SiliconFlow'), 'SILICONFLOW')
  assert.equal(normalizeAiProvider('OpenAI'), 'OPENAI_COMPATIBLE')
  assert.equal(normalizeAiProvider(''), 'OPENAI_COMPATIBLE')

  assert.equal(resolveEffectiveAiBaseUrl('DEEPSEEK', ''), 'https://api.deepseek.com')
  assert.equal(resolveEffectiveAiBaseUrl('SILICONFLOW', '  '), 'https://api.siliconflow.cn/v1')
  assert.equal(resolveEffectiveAiBaseUrl('OPENAI_COMPATIBLE', ' https://proxy.example/v1 '), 'https://proxy.example/v1')

  assert.match(validateAiSettingsDraft({ rawProvider: '   ', provider: 'OPENAI_COMPATIBLE', baseUrl: '', model: '' }), /AI 服务商/)
  assert.match(validateAiSettingsDraft({ rawProvider: 'OPENAI', provider: 'OPENAI_COMPATIBLE', baseUrl: '', model: 'gpt-4o-mini' }), /Base URL/)
  assert.match(validateAiSettingsDraft({ rawProvider: 'SILICONFLOW', provider: 'SILICONFLOW', baseUrl: '', model: '' }), /聊天模型/)
  assert.equal(validateAiSettingsDraft({ rawProvider: 'DEEPSEEK', provider: 'DEEPSEEK', baseUrl: '', model: '' }), '')

  const savedDeepSeek = {
    provider: 'DEEPSEEK',
    baseUrl: 'https://api.deepseek.com',
    chatModel: 'deepseek-chat',
    hasApiKey: true,
  }
  assert.equal(canProbeSavedAiSettings({
    saved: savedDeepSeek,
    provider: 'DEEPSEEK',
    baseUrl: '',
    apiKey: '',
    chatModel: 'deepseek-chat',
  }), true)
  assert.equal(canProbeSavedAiSettings({
    saved: savedDeepSeek,
    provider: 'DEEPSEEK',
    baseUrl: '',
    apiKey: 'sk-unsaved',
    chatModel: 'deepseek-chat',
  }), false)
  assert.equal(canProbeSavedAiSettings({
    saved: savedDeepSeek,
    provider: 'DEEPSEEK',
    baseUrl: 'https://custom.endpoint',
    apiKey: '',
    chatModel: 'deepseek-chat',
  }), false)
  assert.equal(canProbeSavedAiSettings({
    saved: savedDeepSeek,
    provider: 'DEEPSEEK',
    baseUrl: '',
    apiKey: '',
    chatModel: 'deepseek-reasoner',
  }), false)
})

test('resolveProfileSyncStatus orders resetting, syncing, error, conflict, paused, pending, and synced', () => {
  assert.equal(resolveProfileSyncStatus({
    isSyncing: false, resettingOffline: true, lastError: null, conflictCount: 0, autoSyncEnabled: false, pendingFocusCount: 0, pendingMutationCount: 0,
  }).tone, 'warning')

  assert.equal(resolveProfileSyncStatus({
    isSyncing: true, lastError: 'err', conflictCount: 1, autoSyncEnabled: false, pendingFocusCount: 1, pendingMutationCount: 1,
  }).label, '正在与云端同步...')

  assert.equal(resolveProfileSyncStatus({
    isSyncing: false, lastError: 'Network Error', conflictCount: 0, autoSyncEnabled: true, pendingFocusCount: 0, pendingMutationCount: 0,
  }).label, '同步异常')

  assert.equal(resolveProfileSyncStatus({
    isSyncing: false, lastError: null, conflictCount: 2, autoSyncEnabled: true, pendingFocusCount: 0, pendingMutationCount: 0,
  }).label, '存在 2 条同步冲突')

  assert.equal(resolveProfileSyncStatus({
    isSyncing: false, lastError: null, conflictCount: 0, autoSyncEnabled: false, pendingFocusCount: 0, pendingMutationCount: 0,
  }).label, '自动同步已暂停')

  assert.equal(resolveProfileSyncStatus({
    isSyncing: false, lastError: null, conflictCount: 0, autoSyncEnabled: true, pendingFocusCount: 1, pendingMutationCount: 0,
  }).label, '有本地记录待上传')

  assert.deepEqual(resolveProfileSyncStatus({
    isSyncing: false, lastError: null, conflictCount: 0, autoSyncEnabled: true, pendingFocusCount: 0, pendingMutationCount: 0,
  }), { label: '已同步 · 状态正常', tone: 'ok' })
})

test('requestCore does not refresh tokens on wrong-password 401 or logout 401, while still refreshing expired-token 401', async () => {
  assert.equal(isPasswordConfirmationFailure('/api/auth/password', 'PUT', {
    code: 'UNAUTHENTICATED',
    detail: 'Invalid credentials',
  }), true)
  assert.equal(isPasswordConfirmationFailure('/api/auth/me', 'DELETE', {
    code: 'UNAUTHENTICATED',
    detail: 'Invalid credentials',
  }), true)
  assert.equal(isPasswordConfirmationFailure('/api/auth/password', 'PUT', {
    code: 'UNAUTHENTICATED',
    detail: 'Authentication is required',
  }), false)

  let refreshCalls = 0
  let unauthCalls = 0
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      if (options.url.endsWith('/api/auth/password') && options.header.Authorization === 'Bearer valid-token') {
        options.success({
          statusCode: 401,
          data: { status: 401, code: 'UNAUTHENTICATED', detail: 'Invalid credentials' },
        })
        return
      }
      if (options.url.endsWith('/api/auth/me') && options.method === 'DELETE') {
        options.success({
          statusCode: 401,
          data: { status: 401, code: 'UNAUTHENTICATED', detail: 'Invalid credentials' },
        })
        return
      }
      if (options.url.endsWith('/api/auth/logout')) {
        options.success({
          statusCode: 401,
          data: { status: 401, code: 'UNAUTHENTICATED', detail: 'Invalid token' },
        })
        return
      }
      options.success({
        statusCode: options.header.Authorization === 'Bearer refreshed-token' ? 204 : 401,
        data: options.header.Authorization === 'Bearer refreshed-token'
          ? undefined
          : { status: 401, code: 'UNAUTHENTICATED', detail: 'Authentication is required' },
      })
    },
    getAccessToken: () => refreshCalls === 0 ? 'valid-token' : 'refreshed-token',
    refreshAccessToken: async () => {
      refreshCalls += 1
      return true
    },
    onUnauthenticated: () => {
      unauthCalls += 1
    },
  })

  await assert.rejects(
    execute({ url: '/api/auth/password', method: 'PUT', data: { currentPassword: 'wrong' } }),
    error => error instanceof ApiProblemError && error.status === 401 && error.problem.detail === 'Invalid credentials',
  )
  await assert.rejects(
    execute({ url: '/api/auth/me', method: 'DELETE', data: { password: 'wrong' } }),
    error => error instanceof ApiProblemError && error.status === 401 && error.problem.detail === 'Invalid credentials',
  )
  await assert.rejects(
    execute({ url: '/api/auth/logout', method: 'POST' }),
    error => error instanceof ApiProblemError && error.status === 401,
  )
  assert.equal(refreshCalls, 0)
  assert.equal(unauthCalls, 0)

  await execute({ url: '/api/auth/sessions', method: 'GET' })
  assert.equal(refreshCalls, 1)
})

function createSyncHarness() {
  const metadata = new Map()
  const storage = new Map()
  let scopeResetCount = 0
  let dataReloadCount = 0
  let snapshotCalls = 0
  let pullCalls = 0
  let onlineGate = null
  let snapshotGate = null

  let auth = {
    isAuthenticated: true,
    userId: 'user-1',
    serverDeviceId: 'dev-1',
    loginGeneration: Symbol('login-1'),
  }

  const controller = createSyncController({
    getAuth: () => auth,
    checkOnline: () => {
      if (!onlineGate) return Promise.resolve(true)
      return new Promise((resolve) => { onlineGate = resolve })
    },
    syncApi: {
      push: async () => ({ results: [], serverCursor: 'c-1' }),
      pull: async () => {
        pullCalls += 1
        return { changes: [], nextCursor: 'c-2', hasMore: false, resetRequired: false }
      },
      snapshot: async () => {
        snapshotCalls += 1
        if (snapshotGate) {
          await new Promise((resolve) => { snapshotGate = resolve })
        }
        return { snapshotCursor: 'c-1', subjects: [], sources: [], knowledgeBlocks: [], tasks: [] }
      },
    },
    localDb: {
      init: async () => { metadata.clear() },
      getMetadata: async key => metadata.get(key) ?? null,
      setMetadata: async (key, value) => { metadata.set(key, value) },
      getUnsyncedMutations: async () => [],
      markMutationSynced: async () => {},
      saveSubject: async () => {},
      deleteSubject: async () => {},
      saveSourceFile: async () => {},
      deleteSourceFile: async () => {},
      applyRemoteMutation: async () => {},
    },
    localDataScope: {
      reset: (userId, serverDeviceId) => `${userId}:${serverDeviceId}:reset-${++scopeResetCount}`,
    },
    prefStorage: {
      get: key => storage.get(key),
      set: (key, value) => { storage.set(key, value) },
    },
    onDataChanged: async () => { dataReloadCount += 1 },
    onLocalScopeReset: () => { scopeResetCount += 0 },
    nowIso: () => '2026-11-18T01:00:00.000Z',
  })

  return {
    controller,
    storage,
    setAuth: (next) => { auth = next },
    setOnlineGate: (pending) => { onlineGate = pending ? (() => {}) : null },
    resolveOnline: (val) => {
      const fn = onlineGate
      onlineGate = null
      fn?.(val)
    },
    setSnapshotGate: (pending) => { snapshotGate = pending ? (() => {}) : null },
    resolveSnapshot: () => {
      const fn = snapshotGate
      snapshotGate = null
      fn?.()
    },
    counts: () => ({ snapshotCalls, pullCalls, scopeResetCount, dataReloadCount }),
  }
}

test('syncController gates background triggerSync by autoSyncEnabled, allows manual syncNow, and serializes concurrent runs', async () => {
  const h = createSyncHarness()
  h.controller.setAutoSyncEnabled(false)
  await h.controller.triggerSync(false)
  assert.equal(h.counts().snapshotCalls, 0)

  h.setOnlineGate(true)
  const first = h.controller.syncNow()
  assert.equal(h.controller.getState().isSyncing, true)
  const second = h.controller.syncNow()
  h.resolveOnline(true)
  await Promise.all([first, second])

  assert.equal(h.counts().snapshotCalls, 1)
  assert.equal(h.controller.getState().isSyncing, false)
  assert.equal(h.controller.getState().lastSyncedAt, '2026-11-18T01:00:00.000Z')
})

test('syncController releases locks and resets stale state when auth scope changes mid-sync', async () => {
  const h = createSyncHarness()
  h.setSnapshotGate(true)
  const inFlight = h.controller.syncNow()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(h.controller.getState().isSyncing, true)

  h.setAuth({
    isAuthenticated: false,
    userId: null,
    serverDeviceId: '',
    loginGeneration: Symbol('logged-out'),
  })
  h.controller.resetSessionState()
  assert.equal(h.controller.getState().isSyncing, false)
  assert.equal(h.controller.getState().lastError, null)

  h.setAuth({
    isAuthenticated: true,
    userId: 'user-2',
    serverDeviceId: 'dev-2',
    loginGeneration: Symbol('login-2'),
  })
  h.resolveSnapshot()
  await inFlight

  assert.equal(h.controller.getState().isSyncing, false)
  await h.controller.syncNow()
  assert.equal(h.counts().snapshotCalls, 2)
})

test('syncController resetOfflineData resets scope and reloads stores even when follow-up sync is offline', async () => {
  const h = createSyncHarness()
  await h.controller.syncNow()
  const beforeReset = h.counts().dataReloadCount

  h.setOnlineGate(true)
  const resetPromise = h.controller.resetOfflineData()
  await new Promise(resolve => setTimeout(resolve, 0))
  h.resolveOnline(false)
  await resetPromise

  assert.equal(h.counts().scopeResetCount, 1)
  assert.ok(h.counts().dataReloadCount > beforeReset)
  assert.equal(h.controller.getState().isResettingOffline, false)
  assert.match(h.controller.getState().lastError || '', /离线/)
})

test('focusController outbox count tracks completion enqueue and drops terminal 4xx records', async () => {
  const store = new Map()
  let nowMs = 1_700_000_000_000
  let idCounter = 0
  const generation = Symbol('gen')
  const controller = createFocusController({
    storage: {
      get: k => store.get(k),
      set: (k, v) => { store.set(k, v) },
    },
    getScope: () => 'user-1',
    now: () => nowMs,
    createId: () => `id-${++idCounter}`,
    recordSession: async () => {
      throw new ApiProblemError({ title: 'Bad Request', status: 400, detail: 'invalid', fieldErrors: [] })
    },
    canSyncSession: () => true,
    getLoginGeneration: () => generation,
  })

  controller.start()
  nowMs += 25 * 60 * 1000 + 1000
  const result = controller.reconcileNow()
  assert.equal(result.completedFocusRound, true)
  assert.equal(controller.readOutbox().length, 1)

  await controller.flushOutbox()
  assert.equal(controller.readOutbox().length, 0)
})

test('syncController settles CONFLICT/REJECTED mutations, adopts authoritative server current, and preserves pull cursor', async () => {
  const loginGeneration = Symbol('gen-1')
  const metadata = new Map([['cursor:user-1:dev-1', 'c-before']])
  let mutations = [
    {
      id: 1,
      client_id: 'c-del-conflict',
      entity_type: 'task',
      entity_id: 't-1',
      action: 'delete',
      payload: JSON.stringify({ id: 't-1', sync_version: 2 }),
    },
    {
      id: 2,
      client_id: 'c-missing',
      entity_type: 'task',
      entity_id: 't-gone',
      action: 'update',
      payload: JSON.stringify({ id: 't-gone', name: 'Old', status: 'completed', sync_version: 1 }),
    },
  ]
  const appliedRemote = []
  const pullCursors = []
  const pushBatches = []
  let dataReloadCount = 0

  const controller = createSyncController({
    getAuth: () => ({
      isAuthenticated: true,
      userId: 'user-1',
      serverDeviceId: 'dev-1',
      loginGeneration,
    }),
    checkOnline: async () => true,
    syncApi: {
      snapshot: async () => ({ snapshotCursor: 'c-0', subjects: [], sources: [], knowledgeBlocks: [], tasks: [] }),
      push: async (req) => {
        pushBatches.push(req.mutations.map(m => m.clientMutationId))
        return {
          serverCursor: 'c-after-push-should-not-skip-pull',
          results: [
            {
              clientMutationId: 'c-del-conflict',
              decision: 'CONFLICT',
              resourceType: 'TASK',
              resourceId: 't-1',
              mutationType: 'DELETE',
              code: 'RESOURCE_VERSION_CONFLICT',
              current: {
                id: 't-1',
                subjectId: 'sub-1',
                title: 'Server Won Task',
                status: 'DONE',
                version: 4,
                deletedAt: null,
              },
            },
            {
              clientMutationId: 'c-missing',
              decision: 'REJECTED',
              resourceType: 'TASK',
              resourceId: 't-gone',
              mutationType: 'UPDATE',
              code: 'RESOURCE_NOT_FOUND',
              current: null,
            },
          ],
        }
      },
      pull: async (cursor) => {
        pullCursors.push(cursor)
        return { changes: [], nextCursor: 'c-pulled', hasMore: false, resetRequired: false }
      },
    },
    localDb: {
      init: async () => {},
      getMetadata: async key => metadata.get(key) ?? null,
      setMetadata: async (key, value) => { metadata.set(key, value) },
      getUnsyncedMutations: async () => [...mutations],
      markMutationSynced: async (id, clientId) => {
        mutations = mutations.filter(row => !(row.id === id && (!clientId || row.client_id === clientId)))
      },
      saveSubject: async () => {},
      deleteSubject: async () => {},
      saveSourceFile: async () => {},
      deleteSourceFile: async () => {},
      applyRemoteMutation: async (mutation) => {
        appliedRemote.push(mutation)
      },
    },
    localDataScope: { reset: () => 'user-1:dev-1' },
    prefStorage: { get: () => 'true', set: () => {} },
    onDataChanged: async () => { dataReloadCount += 1 },
  })

  await controller.syncNow()

  assert.equal(mutations.length, 0)
  assert.equal(controller.getState().pendingMutationCount, 0)
  assert.deepEqual(controller.getState().conflicts, ['c-del-conflict', 'c-missing'])
  assert.equal(dataReloadCount, 1)
  assert.deepEqual(pullCursors, ['c-before'])
  assert.equal(metadata.get('cursor:user-1:dev-1'), 'c-pulled')

  assert.equal(appliedRemote.length, 2)
  assert.equal(appliedRemote[0].entityId, 't-1')
  assert.equal(appliedRemote[0].action, 'update')
  assert.equal(appliedRemote[0].payload.status, 'completed')
  assert.equal(appliedRemote[1].entityId, 't-gone')
  assert.equal(appliedRemote[1].action, 'delete')

  // Next clean sync cycle clears conflicts and never re-pushes settled mutations
  await controller.syncNow()
  assert.deepEqual(pushBatches, [['c-del-conflict', 'c-missing']])
  assert.deepEqual(controller.getState().conflicts, [])
})

test('syncController preserves mid-flight coalesced mutation when older client_id settles', async () => {
  const loginGeneration = Symbol('gen-1')
  let mutations = [
    {
      id: 7,
      client_id: 'c-old',
      entity_type: 'task',
      entity_id: 't-race',
      action: 'update',
      payload: JSON.stringify({ id: 't-race', status: 'completed', sync_version: 1 }),
    },
  ]
  const appliedRemote = []
  const metadata = new Map([['cursor:user-1:dev-1', 'c-1']])

  const controller = createSyncController({
    getAuth: () => ({
      isAuthenticated: true,
      userId: 'user-1',
      serverDeviceId: 'dev-1',
      loginGeneration,
    }),
    checkOnline: async () => true,
    syncApi: {
      snapshot: async () => ({ snapshotCursor: 'c-1', subjects: [], sources: [], knowledgeBlocks: [], tasks: [] }),
      push: async () => {
        // User toggles task again offline before push resolves -> client_id rotates in place
        mutations = [{
          id: 7,
          client_id: 'c-new',
          entity_type: 'task',
          entity_id: 't-race',
          action: 'update',
          payload: JSON.stringify({ id: 't-race', status: 'pending', sync_version: 1 }),
        }]
        return {
          results: [{
            clientMutationId: 'c-old',
            decision: 'APPLIED',
            resourceType: 'TASK',
            resourceId: 't-race',
            mutationType: 'UPDATE',
            current: { id: 't-race', title: 'Race', status: 'DONE', version: 2 },
          }],
        }
      },
      pull: async () => ({ changes: [], nextCursor: 'c-1', hasMore: false, resetRequired: false }),
    },
    localDb: {
      init: async () => {},
      getMetadata: async key => metadata.get(key) ?? null,
      setMetadata: async (key, value) => { metadata.set(key, value) },
      getUnsyncedMutations: async () => [...mutations],
      markMutationSynced: async (id, clientId) => {
        mutations = mutations.filter(row => !(row.id === id && (!clientId || row.client_id === clientId)))
      },
      saveSubject: async () => {},
      deleteSubject: async () => {},
      saveSourceFile: async () => {},
      deleteSourceFile: async () => {},
      applyRemoteMutation: async m => { appliedRemote.push(m) },
    },
    localDataScope: { reset: () => 'user-1:dev-1' },
    prefStorage: { get: () => 'true', set: () => {} },
    onDataChanged: async () => {},
  })

  await controller.syncNow()

  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].client_id, 'c-new')
  assert.equal(controller.getState().pendingMutationCount, 1)
  assert.equal(appliedRemote.length, 0)
})

test('syncController protects pending/PROCESSING mutations from pull overwrite and rebases mid-flight edits', async () => {
  const loginGeneration = Symbol('gen-flow')
  const metadata = new Map([['cursor:user-1:dev-1', 'c-0']])
  let inFlightIds = new Set()
  let mutations = [
    {
      id: 1,
      client_id: 'c-create',
      entity_type: 'task',
      entity_id: 't-flow',
      action: 'create',
      payload: JSON.stringify({ id: 't-flow', name: 'Draft v1', status: 'pending', sync_version: 0 }),
    },
    {
      id: 2,
      client_id: 'c-proc',
      entity_type: 'task',
      entity_id: 't-proc',
      action: 'update',
      payload: JSON.stringify({ id: 't-proc', name: 'Processing Edit', status: 'completed', sync_version: 3 }),
    },
  ]
  const appliedRemote = []
  const pushedBatches = []

  const controller = createSyncController({
    getAuth: () => ({
      isAuthenticated: true,
      userId: 'user-1',
      serverDeviceId: 'dev-1',
      loginGeneration,
    }),
    checkOnline: async () => true,
    syncApi: {
      snapshot: async () => ({ snapshotCursor: 'c-0', subjects: [], sources: [], knowledgeBlocks: [], tasks: [] }),
      push: async (req) => {
        pushedBatches.push(req.mutations.map(m => ({ id: m.clientMutationId, type: m.mutationType, ver: m.baseVersion })))
        if (pushedBatches.length === 1) {
          assert.equal(inFlightIds.has('1'), true)
          // Mid-flight edit queued on separate row because id 1 is fenced in-flight
          mutations.push({
            id: 3,
            client_id: 'c-edit',
            entity_type: 'task',
            entity_id: 't-flow',
            action: 'update',
            payload: JSON.stringify({ id: 't-flow', name: 'Edited Mid-Flight', status: 'completed', sync_version: 0 }),
          })
          return {
            results: [
              {
                clientMutationId: 'c-create',
                decision: 'APPLIED',
                resourceType: 'TASK',
                resourceId: 't-flow',
                mutationType: 'CREATE',
                current: { id: 't-flow', title: 'Draft v1', status: 'TODO', version: 0 },
              },
              {
                clientMutationId: 'c-proc',
                decision: 'PROCESSING',
                resourceType: 'TASK',
                resourceId: 't-proc',
                mutationType: 'UPDATE',
              },
            ],
          }
        }
        return {
          results: [
            {
              clientMutationId: 'c-edit',
              decision: 'APPLIED',
              resourceType: 'TASK',
              resourceId: 't-flow',
              mutationType: 'UPDATE',
              current: { id: 't-flow', title: 'Edited Mid-Flight', status: 'DONE', version: 1 },
            },
            {
              clientMutationId: 'c-proc',
              decision: 'APPLIED',
              resourceType: 'TASK',
              resourceId: 't-proc',
              mutationType: 'UPDATE',
              current: { id: 't-proc', title: 'Processing Edit', status: 'DONE', version: 4 },
            },
          ],
        }
      },
      pull: async () => ({
        changes: pushedBatches.length === 1
          ? [
              {
                cursor: 'c-1',
                resourceType: 'TASK',
                resourceId: 't-flow',
                mutationType: 'CREATE',
                version: 0,
                payload: { id: 't-flow', title: 'Draft v1', status: 'TODO', version: 0 },
              },
              {
                cursor: 'c-1b',
                resourceType: 'TASK',
                resourceId: 't-proc',
                mutationType: 'UPDATE',
                version: 3,
                payload: { id: 't-proc', title: 'Server Prior', status: 'TODO', version: 3 },
              },
            ]
          : [],
        nextCursor: pushedBatches.length === 1 ? 'c-1' : 'c-2',
        hasMore: false,
        resetRequired: false,
      }),
    },
    localDb: {
      init: async () => {},
      getMetadata: async key => metadata.get(key) ?? null,
      setMetadata: async (key, value) => { metadata.set(key, value) },
      getUnsyncedMutations: async () => [...mutations],
      markMutationSynced: async (id, clientId) => {
        mutations = mutations.filter(row => !(row.id === id && (!clientId || row.client_id === clientId)))
      },
      setInFlightMutationIds: (ids) => {
        inFlightIds = new Set(ids.map(String))
      },
      rebasePendingMutations: async (entityType, entityId, options) => {
        mutations = mutations.map((row) => {
          if (row.entity_type !== entityType || row.entity_id !== entityId) return row
          const parsed = JSON.parse(row.payload)
          if (options.serverVersion !== null) {
            parsed.version = options.serverVersion
            parsed.sync_version = options.serverVersion
          }
          return {
            ...row,
            action: row.action === 'create' ? 'update' : row.action,
            payload: JSON.stringify(parsed),
          }
        })
      },
      saveSubject: async () => {},
      deleteSubject: async () => {},
      saveSourceFile: async () => {},
      deleteSourceFile: async () => {},
      applyRemoteMutation: async m => { appliedRemote.push(m) },
    },
    localDataScope: { reset: () => 'user-1:dev-1' },
    prefStorage: { get: () => 'true', set: () => {} },
    onDataChanged: async () => {},
  })

  await controller.syncNow()
  assert.equal(inFlightIds.size, 0)
  // Both pending entities (c-edit and PROCESSING c-proc) must NOT be overwritten by pull
  assert.equal(appliedRemote.length, 0)
  assert.deepEqual(mutations.map(m => m.client_id), ['c-proc', 'c-edit'])
  assert.equal(JSON.parse(mutations[1].payload).sync_version, 0)

  await controller.syncNow()
  assert.deepEqual(pushedBatches[1], [
    { id: 'c-proc', type: 'UPDATE', ver: 3 },
    { id: 'c-edit', type: 'UPDATE', ver: 0 },
  ])
  assert.equal(mutations.length, 0)
  assert.equal(appliedRemote.length, 2)
})

test('syncController handles RESOURCE_DELETED and REJECTED mutations without losing convergence or leaving phantoms', async () => {
  const loginGeneration = Symbol('gen-reject')
  const metadata = new Map([['cursor:user-1:dev-1', 'c-1']])
  let mutations = [
    {
      id: 1,
      client_id: 'c-sub-deleted',
      entity_type: 'subject',
      entity_id: 'sub-deleted',
      action: 'update',
      payload: JSON.stringify({ id: 'sub-deleted', name: 'Renamed', version: 1 }),
    },
    {
      id: 2,
      client_id: 'c-sub-create-dup',
      entity_type: 'subject',
      entity_id: 'sub-phantom',
      action: 'create',
      payload: JSON.stringify({ id: 'sub-phantom', name: 'Existing Subject', version: 0 }),
    },
    {
      id: 3,
      client_id: 'c-sub-upd-dup',
      entity_type: 'subject',
      entity_id: 'sub-real',
      action: 'update',
      payload: JSON.stringify({ id: 'sub-real', name: 'Duplicate Rename', version: 2 }),
    },
    {
      id: 4,
      client_id: 'c-other-task',
      entity_type: 'task',
      entity_id: 'task-keep',
      action: 'create',
      payload: JSON.stringify({ id: 'task-keep', name: 'Keep Offline Task', sync_version: 0 }),
    },
  ]
  const deletedSubjects = []
  const savedSubjects = []
  const savedTasks = []
  let dataReloadCount = 0
  let failSnapshotOnce = true

  const controller = createSyncController({
    getAuth: () => ({
      isAuthenticated: true,
      userId: 'user-1',
      serverDeviceId: 'dev-1',
      loginGeneration,
    }),
    checkOnline: async () => true,
    syncApi: {
      push: async req => ({
        results: req.mutations.map((m) => {
          if (m.clientMutationId === 'c-sub-deleted') {
            return {
              clientMutationId: m.clientMutationId,
              decision: 'REJECTED',
              resourceType: 'SUBJECT',
              resourceId: 'sub-deleted',
              mutationType: 'UPDATE',
              code: 'RESOURCE_DELETED',
              current: null,
            }
          }
          if (m.clientMutationId === 'c-sub-create-dup') {
            return {
              clientMutationId: m.clientMutationId,
              decision: 'REJECTED',
              resourceType: 'SUBJECT',
              resourceId: 'sub-phantom',
              mutationType: 'CREATE',
              code: 'MUTATION_REJECTED',
              current: null,
            }
          }
          if (m.clientMutationId === 'c-sub-upd-dup') {
            return {
              clientMutationId: m.clientMutationId,
              decision: 'REJECTED',
              resourceType: 'SUBJECT',
              resourceId: 'sub-real',
              mutationType: 'UPDATE',
              code: 'MUTATION_REJECTED',
              current: null,
            }
          }
          return {
            clientMutationId: m.clientMutationId,
            decision: 'PROCESSING',
            resourceType: m.resourceType,
            resourceId: m.resourceId,
            mutationType: m.mutationType,
          }
        }),
      }),
      snapshot: async () => {
        if (failSnapshotOnce) {
          failSnapshotOnce = false
          throw new Error('snapshot timeout')
        }
        return {
          snapshotCursor: 'c-snap',
          subjects: [{ id: 'sub-real', name: 'Authoritative Name', version: 2 }],
          sources: [],
          knowledgeBlocks: [],
          tasks: [{ id: 'task-keep', title: 'Server Older Task', status: 'TODO', version: 0 }],
        }
      },
      pull: async () => ({ changes: [], nextCursor: 'c-snap', hasMore: false, resetRequired: false }),
    },
    localDb: {
      init: async () => {},
      getMetadata: async key => metadata.get(key) ?? null,
      setMetadata: async (key, value) => { metadata.set(key, value) },
      getUnsyncedMutations: async () => [...mutations],
      markMutationSynced: async (id, clientId) => {
        mutations = mutations.filter(row => !(row.id === id && (!clientId || row.client_id === clientId)))
      },
      saveSubject: async s => { savedSubjects.push(s) },
      deleteSubject: async id => { deletedSubjects.push(id) },
      saveSourceFile: async () => {},
      deleteSourceFile: async () => {},
      applyRemoteMutation: async (m) => { if (m.entityType === 'task') savedTasks.push(m) },
    },
    localDataScope: { reset: () => 'user-1:dev-1' },
    prefStorage: { get: () => 'true', set: () => {} },
    onDataChanged: async () => { dataReloadCount += 1 },
  })

  // First sync: c-sub-deleted & c-sub-create-dup deleted locally, but snapshot() fails so c-sub-upd-dup stays pending
  await controller.syncNow()
  assert.deepEqual(deletedSubjects, ['sub-deleted', 'sub-phantom'])
  assert.equal(controller.getState().lastError, 'snapshot timeout')
  assert.equal(dataReloadCount, 1)
  assert.equal(controller.getState().pendingMutationCount, 2)
  assert.deepEqual(mutations.map(m => m.client_id), ['c-sub-upd-dup', 'c-other-task'])

  // Retry succeeds: snapshot adopts authoritative Subject while preserving pending task-keep, then settles c-sub-upd-dup
  await controller.syncNow()
  assert.equal(controller.getState().lastError, null)
  assert.equal(dataReloadCount, 2)
  assert.equal(controller.getState().pendingMutationCount, 1)
  assert.deepEqual(mutations.map(m => m.client_id), ['c-other-task'])
  assert.equal(savedSubjects.some(s => s.id === 'sub-real' && s.name === 'Authoritative Name'), true)
  assert.equal(savedTasks.length, 0)
  assert.equal(metadata.get('cursor:user-1:dev-1'), 'c-snap')
})

test('syncController suppresses onSyncCompleted on reset, offline exit, and conflicts, and reports rejected task ids cleanly', async () => {
  let online = false
  let failOncePush = false
  let auth = {
    isAuthenticated: true,
    userId: 'user-a',
    serverDeviceId: 'dev-1',
    loginGeneration: Symbol('gen-a'),
  }
  const metadata = new Map([['cursor:user-a:dev-1', 'c-1']])
  let mutations = []
  let completedCallbacks = 0
  const rejectedTaskEvents = []
  let pushGate = null

  const controller = createSyncController({
    getAuth: () => auth,
    checkOnline: async () => online,
    syncApi: {
      snapshot: async () => ({ snapshotCursor: 'c-1', subjects: [], sources: [], knowledgeBlocks: [], tasks: [] }),
      push: async (req) => {
        if (pushGate) await new Promise((resolve) => { pushGate = resolve })
        if (failOncePush) {
          failOncePush = false
          throw new Error('transient push fail')
        }
        return {
          results: req.mutations.map(m => ({
            clientMutationId: m.clientMutationId,
            decision: 'REJECTED',
            resourceType: 'TASK',
            resourceId: m.resourceId,
            mutationType: m.mutationType,
            code: 'VALIDATION_FAILED',
            current: null,
          })),
        }
      },
      pull: async () => ({ changes: [], nextCursor: 'c-1', hasMore: false, resetRequired: false }),
    },
    localDb: {
      init: async () => {},
      getMetadata: async key => metadata.get(key) ?? null,
      setMetadata: async (key, value) => { metadata.set(key, value) },
      getUnsyncedMutations: async () => [...mutations],
      markMutationSynced: async (id, clientId) => {
        mutations = mutations.filter(row => !(row.id === id && (!clientId || row.client_id === clientId)))
      },
      saveSubject: async () => {},
      deleteSubject: async () => {},
      saveSourceFile: async () => {},
      deleteSourceFile: async () => {},
      applyRemoteMutation: async () => {},
    },
    localDataScope: { reset: () => 'user-a:dev-1' },
    prefStorage: { get: () => 'true', set: () => {} },
    onDataChanged: async () => {},
    onSyncCompleted: () => { completedCallbacks += 1 },
    onTaskMutationRejected: (ids) => { rejectedTaskEvents.push(ids) },
  })

  // 1. Offline early exit does not trigger onSyncCompleted
  await controller.triggerSync(false)
  assert.equal(completedCallbacks, 0)

  // 2. Online clean pull with no conflicts triggers onSyncCompleted once
  online = true
  await controller.syncNow()
  assert.equal(completedCallbacks, 1)

  // 3. REJECTED TASK mutation fires onTaskMutationRejected and suppresses onSyncCompleted because conflicts > 0
  mutations = [{
    id: 10,
    client_id: 'c-bad-task',
    entity_type: 'task',
    entity_id: 't-overdue-bad',
    action: 'update',
    payload: JSON.stringify({ id: 't-overdue-bad', status: 'completed', sync_version: 1 }),
  }]
  await controller.syncNow()
  assert.deepEqual(rejectedTaskEvents, [['t-overdue-bad']])
  assert.equal(completedCallbacks, 1)

  // 4. Mid-flight resetSessionState (account switch) suppresses both callbacks
  mutations = [{
    id: 11,
    client_id: 'c-switch-task',
    entity_type: 'task',
    entity_id: 't-switch',
    action: 'update',
    payload: JSON.stringify({ id: 't-switch', status: 'completed', sync_version: 1 }),
  }]
  pushGate = () => {}
  const inflight = controller.syncNow()
  await new Promise(resolve => setTimeout(resolve, 0))
  auth = {
    isAuthenticated: true,
    userId: 'user-b',
    serverDeviceId: 'dev-1',
    loginGeneration: Symbol('gen-b'),
  }
  controller.resetSessionState()
  const release = pushGate
  pushGate = null
  release?.()
  await inflight
  assert.equal(completedCallbacks, 1)
  assert.deepEqual(rejectedTaskEvents, [['t-overdue-bad']])
})
