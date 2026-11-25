import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import axios from 'axios';

let activeRequestAdapter = async (config) => ({
  data: {},
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});
axios.defaults.adapter = (config) => activeRequestAdapter(config);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function axiosResponse(config, data = {}) {
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

function axiosUnauthorized(config, data = {}) {
  return new axios.AxiosError('adapter returned 401', axios.AxiosError.ERR_BAD_REQUEST, config, undefined, {
    status: 401, data, headers: {}, config,
  });
}

function requestAuthorization(config) {
  return typeof config.headers?.get === 'function'
    ? config.headers.get('Authorization')
    : config.headers?.Authorization;
}

function requestPayload(config) {
  return typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
}

async function waitForSignal(promise, label, timeoutMs = 300) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const signaled = promise.then(() => true);
  const result = await Promise.race([signaled, timedOut]);
  clearTimeout(timer);
  assert.equal(result, true, `Timed out waiting for ${label}`);
}

const srcRootUrl = new URL('../src/', import.meta.url).href;
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentUrl = context.parentURL;
    if (parentUrl && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
      return nextResolve(new URL(specifier + '.ts', parentUrl).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url);

const { useSyncApi } = await import('../src/api/useSyncApi.ts');
const { default: request } = await import('../src/api/request.ts');

test('pullChanges uses an empty cursor for first pull and normalizes reset response', async () => {
  const originalGet = request.get;
  const calls = [];
  try {
    request.get = async (url, config) => {
      calls.push({ url, config });
      return {
        changes: [{
          cursor: 'c-1',
          resourceType: 'TASK',
          resourceId: 'task-1',
          mutationType: 'DELETE',
          version: 3,
          deletedAt: '2026-08-20T00:00:00Z',
          payload: null,
          createdAt: '2026-08-20T00:00:00Z',
        }],
        nextCursor: 'c-1',
        hasMore: false,
        resetRequired: true,
      };
    };

    const response = await useSyncApi.pullChanges({ limit: 100 });
    assert.deepEqual(calls[0], { url: '/api/sync/pull', config: { params: { limit: 100 } } });
    assert.equal(response.resetRequired, true);
    assert.equal(response.changes[0].deletedAt, '2026-08-20T00:00:00Z');
  } finally {
    request.get = originalGet;
  }
});

test('pushChanges sends only the server mutation DTO and preserves partial decisions', async () => {
  const originalPost = request.post;
  const calls = [];
  try {
    request.post = async (url, data) => {
      calls.push({ url, data });
      return {
        results: [
          { clientMutationId: 'm-applied', decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-1' },
          { clientMutationId: 'm-conflict', decision: 'CONFLICT', resourceType: 'TASK', resourceId: 'task-2', code: 'RESOURCE_VERSION_CONFLICT' },
        ],
        serverCursor: 'c-2',
      };
    };

    const response = await useSyncApi.pushChanges({
    serverDeviceId: 'device-1',
      mutations: [
        {
          clientMutationId: 'm-applied', userId: 'user-a', resourceType: 'TASK', resourceId: 'task-1',
          mutationType: 'UPDATE', baseVersion: 2, payload: { title: 'Done' }, createdAt: 'now', status: 'pending',
        },
        {
          clientMutationId: 'm-conflict', userId: 'user-a', resourceType: 'TASK', resourceId: 'task-2',
          mutationType: 'UPDATE', baseVersion: 1, payload: { title: 'Conflict' }, createdAt: 'now', status: 'pending',
        },
      ],
    });

    assert.equal(calls[0].url, '/api/sync/push');
    assert.deepEqual(calls[0].data, {
      serverDeviceId: 'device-1',
      mutations: [
        { clientMutationId: 'm-applied', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 2, payload: { title: 'Done' } },
        { clientMutationId: 'm-conflict', resourceType: 'TASK', resourceId: 'task-2', mutationType: 'UPDATE', baseVersion: 1, payload: { title: 'Conflict' } },
      ],
    });
    assert.equal(response.results[0].decision, 'APPLIED');
    assert.equal(response.results[1].decision, 'CONFLICT');
    assert.equal(response.serverCursor, 'c-2');
  } finally {
    request.post = originalPost;
  }
});

test('snapshot normalizes missing arrays and keeps tombstone-capable resource lists', async () => {
  const originalGet = request.get;
  try {
    request.get = async (url) => {
      assert.equal(url, '/api/sync/snapshot');
      return { snapshotCursor: 'snapshot-1', subjects: [{ id: 'subject-1', deletedAt: '2026-08-20T00:00:00Z' }] };
    };
    const snapshot = await useSyncApi.getSnapshot();
    assert.equal(snapshot.snapshotCursor, 'snapshot-1');
    assert.equal(snapshot.subjects[0].deletedAt, '2026-08-20T00:00:00Z');
    assert.deepEqual(snapshot.tasks, []);
    assert.deepEqual(snapshot.relations, []);
  } finally {
    request.get = originalGet;
  }
});

test('core sync refresh for B does not join A refresh, and stale A success cannot replace B tokens', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  const setSession = (id, accessToken, refreshToken) => {
    authStore.user = { id, email: `${id}@example.com` };
    authStore.tokens = { accessToken, refreshToken };
    authStore.sessionId = `session-${id}`;
    authStore.serverDeviceId = `device-${id}`;
    authStore.authStatus = 'authenticated';
  };
  const scopeFor = (sessionId) => ({
    key: Symbol(sessionId),
    isCurrent: () => authStore.sessionId === sessionId,
  });
  const startedRefreshA = createDeferred();
  const startedRefreshB = createDeferred();
  const releaseRefreshA = createDeferred();
  const releaseRefreshB = createDeferred();
  const calls = [];
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    const url = config.url ?? '';
    const authorization = requestAuthorization(config);
    calls.push({ url, authorization, payload: requestPayload(config) });
    if (url === '/api/auth/refresh') {
      const refreshToken = requestPayload(config)?.refreshToken;
      if (refreshToken === 'refresh-a') {
        startedRefreshA.resolve();
        return releaseRefreshA.promise;
      }
      if (refreshToken === 'refresh-b') {
        startedRefreshB.resolve();
        return releaseRefreshB.promise;
      }
      assert.fail(`Unexpected refresh token: ${refreshToken}`);
    }
    if (url === '/api/sync/push') {
      if (authorization === 'Bearer token-b2') return axiosResponse(config, { results: [], serverCursor: 'b-cursor' });
      return Promise.reject(axiosUnauthorized(config));
    }
    return axiosResponse(config);
  };

  try {
    setSession('user-a', 'token-a', 'refresh-a');
    const scopeA = scopeFor('session-user-a');
    const requestA = useSyncApi.pushChanges({ serverDeviceId: 'device-user-a', mutations: [] }, scopeA);
    await waitForSignal(startedRefreshA.promise, 'A refresh dispatch');

    setSession('user-b', 'token-b', 'refresh-b');
    const scopeB = scopeFor('session-user-b');
    const requestB = useSyncApi.pushChanges({ serverDeviceId: 'device-user-b', mutations: [] }, scopeB);
    await waitForSignal(startedRefreshB.promise, 'B refresh dispatch while A refresh is pending');

    releaseRefreshB.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-b2', refreshToken: 'refresh-b2' },
      sessionId: 'session-b2',
    }));
    await requestB;
    assert.equal(authStore.token, 'token-b2');

    releaseRefreshA.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-a2', refreshToken: 'refresh-a2' },
      sessionId: 'session-a2',
    }));
    await assert.rejects(requestA, /SYNC_SCOPE_CHANGED/);
    assert.equal(authStore.sessionId, 'session-user-b');
    assert.equal(authStore.token, 'token-b2');
    assert.equal(authStore.refreshToken, 'refresh-b2');
    assert.deepEqual(calls.filter((call) => call.url === '/api/sync/push').map((call) => call.authorization), [
      'Bearer token-a',
      'Bearer token-b',
      'Bearer token-b2',
    ]);
  } finally {
    releaseRefreshA.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-a2', refreshToken: 'refresh-a2' },
      sessionId: 'session-a2',
    }));
    releaseRefreshB.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-b2', refreshToken: 'refresh-b2' },
      sessionId: 'session-b2',
    }));
    activeRequestAdapter = originalAdapter;
  }
});

test('core sync requests in the same session share refresh and retry with the rotated access token', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  authStore.user = { id: 'user-same-scope-refresh', email: 'same-scope@example.com' };
  authStore.tokens = { accessToken: 'token-same-scope', refreshToken: 'refresh-same-scope' };
  authStore.sessionId = 'session-same-scope-refresh';
  authStore.serverDeviceId = 'device-same-scope-refresh';
  authStore.authStatus = 'authenticated';
  const scope = { key: Symbol('same-scope-refresh'), isCurrent: () => authStore.sessionId === 'session-same-scope-refresh' };
  const refreshStarted = createDeferred();
  const releaseRefresh = createDeferred();
  const twoInitialPushes = createDeferred();
  let refreshCalls = 0;
  let initialPushCalls = 0;
  const retriedAuthorization = [];
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    if (config.url === '/api/auth/refresh') {
      refreshCalls += 1;
      refreshStarted.resolve();
      return releaseRefresh.promise;
    }
    if (config.url === '/api/sync/push') {
      const authorization = requestAuthorization(config);
      if (authorization === 'Bearer token-same-scope-v2') {
        retriedAuthorization.push(authorization);
        return axiosResponse(config, { results: [], serverCursor: 'same-scope-cursor' });
      }
      initialPushCalls += 1;
      if (initialPushCalls === 2) twoInitialPushes.resolve();
      return Promise.reject(axiosUnauthorized(config));
    }
    return axiosResponse(config);
  };

  try {
    const first = useSyncApi.pushChanges({ serverDeviceId: 'device-same-scope-refresh', mutations: [] }, scope);
    await waitForSignal(refreshStarted.promise, 'same-session refresh dispatch');
    const second = useSyncApi.pushChanges({ serverDeviceId: 'device-same-scope-refresh', mutations: [] }, scope);
    await waitForSignal(twoInitialPushes.promise, 'both same-session requests to receive 401');
    await new Promise((resolve) => setImmediate(resolve));
    releaseRefresh.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-same-scope-v2', refreshToken: 'refresh-same-scope-v2' },
      sessionId: 'session-same-scope-v2',
    }));
    await Promise.all([first, second]);

    assert.equal(refreshCalls, 1, 'same scope requests must share one refresh promise');
    assert.deepEqual(retriedAuthorization, ['Bearer token-same-scope-v2', 'Bearer token-same-scope-v2']);
    assert.equal(authStore.token, 'token-same-scope-v2');
    assert.equal(authStore.refreshToken, 'refresh-same-scope-v2');
  } finally {
    releaseRefresh.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-same-scope-v2', refreshToken: 'refresh-same-scope-v2' },
      sessionId: 'session-same-scope-v2',
    }));
    activeRequestAdapter = originalAdapter;
  }
});

test('stale core sync refresh failure cannot clear the newly authenticated account', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  const setSession = (id, accessToken, refreshToken) => {
    authStore.user = { id, email: `${id}@example.com` };
    authStore.tokens = { accessToken, refreshToken };
    authStore.sessionId = `session-${id}`;
    authStore.serverDeviceId = `device-${id}`;
    authStore.authStatus = 'authenticated';
  };
  const startedRefresh = createDeferred();
  const releaseRefresh = createDeferred();
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    if (config.url === '/api/auth/refresh') {
      startedRefresh.resolve();
      return releaseRefresh.promise;
    }
    if (config.url === '/api/sync/push') return Promise.reject(axiosUnauthorized(config));
    return axiosResponse(config);
  };

  try {
    setSession('user-a-failure', 'token-a', 'refresh-a');
    const scopeA = { key: Symbol('stale-refresh-failure'), isCurrent: () => authStore.sessionId === 'session-user-a-failure' };
    const pending = useSyncApi.pushChanges({ serverDeviceId: 'device-user-a-failure', mutations: [] }, scopeA);
    await waitForSignal(startedRefresh.promise, 'A failing refresh dispatch');

    setSession('user-b-after-failure', 'token-b', 'refresh-b');
    releaseRefresh.reject(new Error('REFRESH_A_FAILED'));
    await assert.rejects(pending, /SYNC_SCOPE_CHANGED/);
    assert.equal(authStore.sessionId, 'session-user-b-after-failure');
    assert.equal(authStore.token, 'token-b');
    assert.equal(authStore.refreshToken, 'refresh-b');
    assert.equal(authStore.requiresReauthentication, false);
  } finally {
    releaseRefresh.reject(new Error('REFRESH_A_FAILED'));
    activeRequestAdapter = originalAdapter;
  }
});

test('stale core sync scope is rejected by the request interceptor before authorization or dispatch', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  authStore.user = { id: 'user-current', email: 'current@example.com' };
  authStore.tokens = { accessToken: 'token-current', refreshToken: 'refresh-current' };
  authStore.sessionId = 'session-current';
  authStore.serverDeviceId = 'device-current';
  authStore.authStatus = 'authenticated';
  let dispatches = 0;
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    dispatches += 1;
    return axiosResponse(config, { changes: [], nextCursor: null, hasMore: false, resetRequired: false });
  };

  try {
    const staleScope = { key: Symbol('already-stale'), isCurrent: () => false };
    await assert.rejects(useSyncApi.pullChanges({ limit: 1 }, staleScope), /SYNC_SCOPE_CHANGED/);
    assert.equal(dispatches, 0);
  } finally {
    activeRequestAdapter = originalAdapter;
  }
});

test('sync API rejects a resource outside the current server contract', async () => {
  const originalPost = request.post;
  try {
    request.post = async () => ({ results: [], serverCursor: null });
    await assert.rejects(
      useSyncApi.pushChanges({
        serverDeviceId: 'device-1',
        mutations: [{
          clientMutationId: 'bad', userId: 'user-a', resourceType: 'ASSET', resourceId: 'asset-1',
          mutationType: 'CREATE', baseVersion: 0, payload: {}, createdAt: 'now', status: 'pending',
        }],
      }),
      /Unsupported sync resourceType/,
    );
  } finally {
    request.post = originalPost;
  }
});

test('realtime sync signals request background synchronization', () => {
  const source = fs.readFileSync(new URL('../src/services/realtimeController.ts', import.meta.url), 'utf8');
  assert.match(source, /syncStore\.requestBackgroundSync\('realtime'\)/);
  assert.doesNotMatch(source, /await syncStore\.triggerSync\(\)/);
  assert.doesNotMatch(source, /pullChanges\(\{ reason: 'realtime' \}\)/);
});

test('sync cycle reruns when a mutation is queued during an active cycle', () => {
  const source = fs.readFileSync(new URL('../src/store/useSyncStore.ts', import.meta.url), 'utf8');
  assert.match(source, /syncRequested\s*=\s*true/);
  assert.match(source, /while\s*\(syncRequested\s*&&\s*isOnline\(\)\)/);
});

test('automatic sync pauses queued work, manual sync can drain it, and re-enabling resumes pending writes', async (t) => {
  const { createPinia, disposePinia, setActivePinia } = await import('pinia');
  const { nextTick } = await import('vue');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { useSyncStore, SyncOfflineError } = await import('../src/store/useSyncStore.ts');
  const { setAutoSyncEnabled } = await import('../src/services/desktopPreferences.ts');
  const { getLocalRepository } = await import('../src/services/localDb.ts');
  const pinia = createPinia();
  setActivePinia(pinia);
  const userId = 'sync-preference-user';
  const deviceId = 'sync-preference-device';
  const authStore = useAuthStore();
  authStore.setSession({
    user: { id: userId, email: 'sync-preference@example.test' },
    tokens: { accessToken: 'test-token', refreshToken: 'test-refresh' },
    sessionId: 'sync-preference-session', serverDeviceId: deviceId,
  });
  const repository = await getLocalRepository(userId, deviceId);
  const syncStore = useSyncStore();
  const pendingIds = async () => (await repository.listUnresolved()).map(mutation => mutation.clientMutationId);
  const write = async (id) => {
    const task = { id, title: id, version: 1 };
    await repository.upsert('TASK', id, task, { version: task.version });
    await repository.enqueueMutation({ clientMutationId: id, resourceType: 'TASK', resourceId: id,
      mutationType: 'UPDATE', baseVersion: task.version, payload: task });
  };
  await repository.saveCursor('preference-cursor');
  const uploaded = [];
  let pulls = 0;
  t.mock.method(useSyncApi, 'pushChanges', async ({ mutations }) => {
    uploaded.push(...mutations.map(mutation => mutation.clientMutationId));
    return { results: mutations.map(mutation => ({ clientMutationId: mutation.clientMutationId,
      resourceType: 'TASK', resourceId: mutation.resourceId, mutationType: mutation.mutationType, decision: 'APPLIED',
      current: { ...mutation.payload, version: 2 } })) };
  });
  t.mock.method(useSyncApi, 'pullChanges', async () => {
    pulls += 1;
    return { changes: [], nextCursor: 'preference-cursor', hasMore: false, resetRequired: false };
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await write('manual');
    syncStore.requestBackgroundSync('startup');
    setAutoSyncEnabled(false);
    syncStore.requestBackgroundSync('write');
    syncStore.requestBackgroundSync('online');
    syncStore.requestBackgroundSync('realtime');
    t.mock.timers.tick(500);
    await syncStore.flushBackground();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(uploaded, []);
    assert.equal(pulls, 0);
    assert.equal((await repository.read('TASK', 'manual')).value.title, 'manual');
    assert.deepEqual(await pendingIds(), ['manual']);

    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    try {
      await assert.rejects(syncStore.flushNow(), SyncOfflineError);
      assert.deepEqual(await pendingIds(), ['manual']);
    } finally {
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
      else delete globalThis.navigator;
    }
    await syncStore.flushNow();
    assert.deepEqual(uploaded, ['manual']);
    assert.deepEqual(await pendingIds(), []);

    await write('automatic');
    setAutoSyncEnabled(true);
    await nextTick();
    t.mock.timers.tick(500);
    for (let attempt = 0; attempt < 50 && (pulls < 2 || syncStore.isSyncing); attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.deepEqual(uploaded, ['manual', 'automatic']);
    assert.deepEqual(await pendingIds(), []);
    assert.equal(pulls, 2);
  } finally {
    setAutoSyncEnabled(true);
    disposePinia(pinia);
  }
});

test('Pinia sync store delegates transport and projection reconciliation to the shared cycle', () => {
  const source = fs.readFileSync(new URL('../src/store/useSyncStore.ts', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*runSyncCycle\s*\}\s*from\s*'@\/services\/syncCycle'/);
  assert.match(source, /await\s+runCoreSyncWithAssetQueueWakeup\(assetQueue,\s*scope\.isCurrent,\s*\(\)\s*=>\s*runSyncCycle\(/);
  assert.doesNotMatch(source, /await\s+assetQueue\.wakeUp\(\)/);
  assert.doesNotMatch(source, /async function applyPushResult/);
  assert.doesNotMatch(source, /async function pullLoop/);
});

test('sync cycle atomically reconciles an applied schedule command and records one applied result', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-schedule', 'device-schedule', { storage: createMemoryStorage() });
  await repository.saveCursor('schedule-cursor-before');
  await repository.upsert('TASK', 'task-a', { id: 'task-a', scheduledAt: null }, { version: 2 });
  await repository.upsert('TASK', 'task-b', { id: 'task-b', scheduledAt: null }, { version: 4 });
  await repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', value: { id: 'task-a', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      { resourceType: 'TASK', resourceId: 'task-b', value: { id: 'task-b', scheduledAt: 'optimistic-b' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-applied',
      mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
      payload: { taskId: 'task-a', scheduledAt: 'optimistic-a', _localAffectedTaskIds: ['task-a', 'task-b'] },
    },
  });
  const current = [
    { id: 'task-a', scheduledAt: 'server-a', version: 3, deletedAt: null },
    { id: 'task-b', scheduledAt: 'server-b', version: 5, deletedAt: null },
  ];
  const pushed = [];
  const result = await runSyncCycle({
    repository,
    serverDeviceId: 'device-schedule',
    api: {
      async pushChanges({ mutations }) {
        pushed.push(...mutations);
        return { results: [{ clientMutationId: 'schedule-applied', decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-a', mutationType: 'SCHEDULE_INSERTION', current }], serverCursor: 'schedule-cursor-after' };
      },
      async pullChanges() { return { changes: [], nextCursor: 'schedule-cursor-before', hasMore: false, resetRequired: false }; },
      async getSnapshot() { assert.fail('a valid schedule response does not require a snapshot'); },
    },
  });

  assert.deepEqual(pushed.map((mutation) => mutation.clientMutationId), ['schedule-applied']);
  assert.equal(pushed[0].payload._localAffectedTaskIds[0], 'task-a', 'the outbox keeps its local fence metadata for reconciliation');
  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'server-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'server-b');
  assert.deepEqual(await repository.listPending('TASK'), []);
  assert.equal(result.scheduleApplied, 1);
  assert.deepEqual(result.scheduleErrors, [{ clientMutationId: 'schedule-applied', code: 'SCHEDULE_REFRESH_REQUIRED' }],
    'a changed server prediction notifies even if the outer queue appeared empty');
});

test('sync cycle restores the server Task cohort and terminates a rejected schedule command', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-schedule-conflict', 'device-schedule-conflict', { storage: createMemoryStorage() });
  await repository.saveCursor('schedule-conflict-cursor');
  await repository.upsert('TASK', 'task-a', { id: 'task-a', scheduledAt: 'old-a' }, { version: 2 });
  await repository.upsert('TASK', 'task-b', { id: 'task-b', scheduledAt: 'old-b' }, { version: 4 });
  await repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', value: { id: 'task-a', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      { resourceType: 'TASK', resourceId: 'task-b', value: { id: 'task-b', scheduledAt: 'optimistic-b' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-conflict',
      mutationType: 'SCHEDULE_SWAP', baseVersion: 2,
      payload: { sourceTaskId: 'task-a', targetTaskId: 'task-b', _localAffectedTaskIds: ['task-a', 'task-b'] },
    },
  });
  const current = [
    { id: 'task-a', scheduledAt: 'server-a', version: 3, deletedAt: null },
    { id: 'task-b', scheduledAt: 'server-b', version: 6, deletedAt: null },
  ];
  const result = await runSyncCycle({
    repository,
    serverDeviceId: 'device-schedule-conflict',
    api: {
      async pushChanges() {
        return { results: [{ clientMutationId: 'schedule-conflict', decision: 'CONFLICT', resourceType: 'TASK', resourceId: 'task-a', mutationType: 'SCHEDULE_SWAP', current, code: 'RESOURCE_VERSION_CONFLICT' }], serverCursor: 'schedule-conflict-server-cursor' };
      },
      async pullChanges() { return { changes: [], nextCursor: 'schedule-conflict-cursor', hasMore: false, resetRequired: false }; },
      async getSnapshot() { assert.fail('the current Task cohort is sufficient to resolve this conflict'); },
    },
  });

  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'server-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'server-b');
  assert.deepEqual(await repository.listPending('TASK'), []);
  assert.deepEqual(await repository.listUnresolved('TASK'), []);
  assert.equal(result.scheduleApplied, 0);
  assert.deepEqual(result.scheduleErrors, [{ clientMutationId: 'schedule-conflict', code: 'RESOURCE_VERSION_CONFLICT' }]);
});

test('a rejected strict schedule refreshes the Task projection even when the following pull fails', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { useTaskStore } = await import('../src/store/useTaskStore.ts');
  const { useSyncStore } = await import('../src/store/useSyncStore.ts');
  const { getLocalRepository } = await import('../src/services/localDb.ts');
  setActivePinia(createPinia());
  const userId = 'schedule-rejected-before-pull';
  const deviceId = 'schedule-rejected-before-pull-device';
  const authStore = useAuthStore();
  authStore.setSession({
    user: { id: userId, email: 'schedule-rejected-before-pull@example.test' },
    tokens: { accessToken: 'test-token', refreshToken: 'test-refresh' },
    sessionId: 'schedule-rejected-before-pull-session', serverDeviceId: deviceId,
  });
  const repository = await getLocalRepository(userId, deviceId);
  const taskStore = useTaskStore();
  const syncStore = useSyncStore();
  const current = { id: 'strict-source', subjectId: 'math', title: 'Strict placement',
    status: 'TODO', scheduledAt: '2099-10-06T09:00:00Z', durationMinutes: 30, version: 2 };
  const optimistic = { ...current, scheduledAt: '2099-10-07T10:00:00Z' };
  await repository.saveCursor('before-push');
  await repository.upsert('TASK', current.id, current, { version: current.version });
  await repository.commitScheduleMutation({
    items: [{ resourceType: 'TASK', resourceId: current.id, value: optimistic,
      version: current.version, expectedLocalVersion: current.version, deletedAt: null }],
    mutation: { clientMutationId: 'strict-rejected', resourceType: 'TASK', resourceId: current.id,
      mutationType: 'SCHEDULE_INSERTION', baseVersion: current.version,
      payload: { taskId: current.id, scheduledAt: optimistic.scheduledAt, placementMode: 'STRICT',
        _localAffectedTaskIds: [current.id] } },
  });
  await taskStore.loadLocalTasks();
  assert.equal(taskStore.allTasks[0].scheduledAt, optimistic.scheduledAt);

  const originalApi = { ...useSyncApi };
  let pushes = 0;
  let pulls = 0;
  try {
    useSyncApi.pushChanges = async () => {
      pushes += 1;
      return { results: [{ clientMutationId: 'strict-rejected', resourceType: 'TASK', resourceId: current.id,
        mutationType: 'SCHEDULE_INSERTION', decision: 'REJECTED', code: 'VALIDATION_FAILED', current: [current] }] };
    };
    useSyncApi.pullChanges = async () => {
      pulls += 1;
      if (pulls === 1) throw new Error('pull failed after schedule rejection');
      return { changes: [], nextCursor: 'before-push', hasMore: false, resetRequired: false };
    };

    await assert.rejects(syncStore.flushNow(), /pull failed after schedule rejection/);
    assert.equal((await repository.read('TASK', current.id)).value.scheduledAt, current.scheduledAt);
    assert.deepEqual(syncStore.scheduleSyncErrors, [{ clientMutationId: 'strict-rejected', code: 'VALIDATION_FAILED' }]);
    for (let attempt = 0; attempt < 50 && taskStore.allTasks[0].scheduledAt !== current.scheduledAt; attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(taskStore.allTasks[0].scheduledAt, current.scheduledAt);

    syncStore.acknowledgeScheduleSyncError('strict-rejected');
    await syncStore.flushNow();
    assert.equal(pushes, 1);
    assert.equal(pulls, 2);
    assert.deepEqual(syncStore.scheduleSyncErrors, []);
  } finally {
    Object.assign(useSyncApi, originalApi);
    authStore.sessionId = null;
  }
});

test('schedule rejection with a missing swap target stays retryable until snapshot reconciliation succeeds', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-schedule-missing-target', 'device-schedule-missing-target', { storage: createMemoryStorage() });
  await repository.saveCursor('schedule-missing-target-cursor');
  await repository.upsert('TASK', 'task-a', { id: 'task-a', scheduledAt: 'old-a' }, { version: 2 });
  await repository.upsert('TASK', 'task-b', { id: 'task-b', scheduledAt: 'old-b' }, { version: 4 });
  await repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', value: { id: 'task-a', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      { resourceType: 'TASK', resourceId: 'task-b', value: { id: 'task-b', scheduledAt: 'optimistic-b' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-missing-target',
      mutationType: 'SCHEDULE_SWAP', baseVersion: 2,
      payload: { sourceTaskId: 'task-a', _localAffectedTaskIds: ['task-a', 'task-b'] },
    },
  });

  const rejected = {
    clientMutationId: 'schedule-missing-target', decision: 'REJECTED', resourceType: 'TASK',
    resourceId: 'task-a', mutationType: 'SCHEDULE_SWAP',
    current: [{ id: 'task-a', scheduledAt: 'server-a', version: 2, deletedAt: null }],
    code: 'VALIDATION_FAILED',
  };
  const baseApi = {
    async pushChanges() { return { results: [rejected], serverCursor: 'schedule-missing-target-server-cursor' }; },
    async pullChanges() { return { changes: [], nextCursor: 'schedule-missing-target-cursor', hasMore: false, resetRequired: false }; },
  };

  await assert.rejects(runSyncCycle({
    repository,
    serverDeviceId: 'device-schedule-missing-target',
    api: { ...baseApi, async getSnapshot() { throw new Error('snapshot temporarily unavailable'); } },
  }), /snapshot temporarily unavailable/);

  assert.deepEqual((await repository.listPending('TASK')).map((item) => item.clientMutationId), ['schedule-missing-target']);
  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'optimistic-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'optimistic-b');

  const snapshotTasks = [
    { id: 'task-a', scheduledAt: 'server-a', version: 2, deletedAt: null },
    { id: 'task-b', scheduledAt: 'server-b', version: 4, deletedAt: null },
  ];
  await runSyncCycle({
    repository,
    serverDeviceId: 'device-schedule-missing-target',
    api: {
      ...baseApi,
      async getSnapshot() {
        return {
          snapshotCursor: 'schedule-missing-target-snapshot-cursor',
          subjects: [], sources: [], knowledgeBlocks: [], tasks: snapshotTasks, relations: [],
        };
      },
    },
  });

  assert.deepEqual(await repository.listPending('TASK'), []);
  assert.deepEqual(await repository.listUnresolved('TASK'), []);
  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'server-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'server-b');
});

test('pull and snapshot cannot overwrite tasks fenced by a pending schedule command', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-schedule-pending', 'device-schedule-pending', { storage: createMemoryStorage() });
  await repository.saveCursor('schedule-pending-cursor');
  await repository.upsert('TASK', 'task-a', { id: 'task-a', scheduledAt: null }, { version: 2 });
  await repository.upsert('TASK', 'task-b', { id: 'task-b', scheduledAt: null }, { version: 4 });
  await repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', value: { id: 'task-a', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      { resourceType: 'TASK', resourceId: 'task-b', value: { id: 'task-b', scheduledAt: 'optimistic-b' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-pending',
      mutationType: 'SCHEDULE_SWAP', baseVersion: 2,
      payload: { sourceTaskId: 'task-a', targetTaskId: 'task-b', _localAffectedTaskIds: ['task-a', 'task-b'] },
    },
  });
  await runSyncCycle({
    repository,
    serverDeviceId: 'device-schedule-pending',
    api: {
      async pushChanges() { return { results: [{ clientMutationId: 'schedule-pending', decision: 'PROCESSING' }], serverCursor: 'schedule-pending-cursor' }; },
      async pullChanges() {
        return { changes: [
          { cursor: 'schedule-cursor-a', resourceType: 'TASK', resourceId: 'task-a', mutationType: 'UPDATE', version: 3, deletedAt: null, payload: { id: 'task-a', scheduledAt: 'old-server-a' } },
          { cursor: 'schedule-cursor-b', resourceType: 'TASK', resourceId: 'task-b', mutationType: 'UPDATE', version: 5, deletedAt: null, payload: { id: 'task-b', scheduledAt: 'old-server-b' } },
        ], nextCursor: 'schedule-pending-cursor', hasMore: false, resetRequired: false };
      },
      async getSnapshot() { assert.fail('pending schedule members must be fenced from snapshot pull'); },
    },
  });

  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'optimistic-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'optimistic-b');
  assert.deepEqual((await repository.listUnresolved('TASK')).map((item) => item.clientMutationId), ['schedule-pending']);
});

test('background scheduler coalesces several requests into one delayed cycle', async () => {
  const { createSyncScheduler } = await import('../src/services/syncScheduler.ts');
  let calls = 0;
  const scheduler = createSyncScheduler({ delayMs: 1, run: async () => { calls += 1; } });
  scheduler.request();
  scheduler.request();
  scheduler.request();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 1);
  scheduler.dispose();
});

test('sync cycle settles only its claimed mutation and preserves later pending work', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const settlements = [];
  const repository = {
    resource: { syncStatus: 'pending' },
    async claimPending() {
      return [{ clientMutationId: 'm-1', userId: 'user-a', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 1, payload: { title: 'first' }, createdAt: '2026-09-04T00:00:00.000Z', status: 'inflight' }];
    },
    async settleMutation(input) { settlements.push(input); return true; },
    async releaseInflight() { assert.fail('successful push must not release the claimed mutation'); },
    async getSyncState() { return { cursor: 'c-1', resetRequired: false, schemaVersion: 6 }; },
    async saveCursor() {},
    async listUnresolved() { return [{ clientMutationId: 'm-2', resourceType: 'TASK', resourceId: 'task-1', status: 'pending' }]; },
    async read() { return { id: 'task-1', resourceType: 'TASK', userId: 'user-a', version: 1, deletedAt: null, syncStatus: 'pending', value: { title: 'second' } }; },
    async upsert() { assert.fail('the older server response must not overwrite the later local projection'); },
    async replaceSnapshotPreservingPending() { assert.fail('pull did not request a snapshot'); },
  };
  const api = {
    async pushChanges({ mutations }) {
      assert.deepEqual(mutations.map((mutation) => mutation.clientMutationId), ['m-1']);
      return { results: [
        { clientMutationId: 'unclaimed', decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE' },
        { clientMutationId: 'm-1', decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-2', mutationType: 'UPDATE' },
        { clientMutationId: 'm-1', decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'DELETE' },
        { clientMutationId: 'm-1', decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', current: { id: 'task-1', title: 'first', version: 2 } },
      ], serverCursor: 'c-2' };
    },
    async pullChanges() { return { changes: [], nextCursor: 'c-2', hasMore: false, resetRequired: false }; },
    async getSnapshot() { assert.fail('pull did not require a snapshot'); },
  };

  await runSyncCycle({ repository, api, serverDeviceId: 'device-1' });
  assert.deepEqual(settlements.map((item) => item.clientMutationId), ['m-1']);
  assert.equal(repository.resource.syncStatus, 'pending');
});

test('a new local sync scope bootstraps from a snapshot without losing unresolved writes', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const storage = createMemoryStorage();
  const repository = new LocalRepository('user-a', 'new-device', { storage });
  const otherScope = new LocalRepository('user-b', 'existing-device', { storage });

  await repository.commitMutation({
    resourceType: 'TASK',
    resourceId: 'task-local',
    value: { id: 'task-local', title: 'Offline edit', status: 'TODO' },
    version: 0,
    deletedAt: null,
    mutation: {
      clientMutationId: 'mutation-local',
      resourceType: 'TASK',
      resourceId: 'task-local',
      mutationType: 'CREATE',
      baseVersion: 0,
      payload: { id: 'task-local', title: 'Offline edit', status: 'TODO' },
    },
  });
  await otherScope.saveCursor('other-scope-cursor', false);
  await otherScope.upsert('TASK', 'other-task', { id: 'other-task', title: 'Other user' }, {
    version: 1,
    deletedAt: null,
    syncStatus: 'synced',
  });

  let pullCalls = 0;
  let snapshotCalls = 0;
  const result = await runSyncCycle({
    repository,
    serverDeviceId: 'new-device',
    api: {
      async pushChanges({ mutations }) {
        assert.deepEqual(mutations.map((item) => item.clientMutationId), ['mutation-local']);
        return { results: [{ clientMutationId: 'mutation-local', decision: 'PROCESSING' }], serverCursor: null };
      },
      async pullChanges() {
        pullCalls += 1;
        return {
          changes: [{ cursor: 'c-80', resourceType: 'TASK', resourceId: 'recent-task', mutationType: 'CREATE', version: 1, payload: { id: 'recent-task', title: 'Recent' } }],
          nextCursor: 'c-80',
          hasMore: false,
          resetRequired: false,
        };
      },
      async getSnapshot() {
        snapshotCalls += 1;
        return {
          snapshotCursor: 'snapshot-c-80',
          subjects: [],
          sources: [],
          knowledgeBlocks: [],
          tasks: [
            { id: 'old-task', title: 'Changed before changelog retention', version: 3, deletedAt: null },
            { id: 'recent-task', title: 'Recent', version: 1, deletedAt: null },
            { id: 'task-local', title: 'Server copy', status: 'TODO', version: 1, deletedAt: null },
          ],
          relations: [],
        };
      },
    },
  });

  assert.equal(snapshotCalls, 1);
  assert.equal(pullCalls, 0);
  assert.deepEqual([...result.changedResourceTypes].sort(), [
    'KNOWLEDGE_BLOCK',
    'RELATION',
    'SOURCE',
    'SUBJECT',
    'TASK',
  ]);
  const state = await repository.getSyncState();
  assert.deepEqual({ cursor: state.cursor, resetRequired: state.resetRequired }, {
    cursor: 'snapshot-c-80',
    resetRequired: false,
  });
  assert.equal((await repository.read('TASK', 'old-task'))?.value.title, 'Changed before changelog retention');
  assert.equal((await repository.read('TASK', 'recent-task'))?.value.title, 'Recent');
  assert.equal((await repository.read('TASK', 'task-local'))?.value.title, 'Offline edit');
  assert.deepEqual((await repository.listUnresolved()).map((item) => item.clientMutationId), ['mutation-local']);
  assert.deepEqual(await otherScope.getSyncState().then(({ cursor, resetRequired }) => ({ cursor, resetRequired })), {
    cursor: 'other-scope-cursor',
    resetRequired: false,
  });
  assert.equal((await otherScope.read('TASK', 'other-task'))?.value.title, 'Other user');
});

test('pull writes only the last cursor record for a resource', async () => {
  const { applyPullPage } = await import('../src/services/syncCycle.ts');
  const writes = [];
  const records = new Map();
  const repository = {
    async listUnresolved() { return []; },
    async read(resourceType, resourceId) { return records.get(`${resourceType}:${resourceId}`) ?? null; },
    async upsert(resourceType, resourceId, value, options) {
      writes.push({ resourceType, resourceId, value, options });
      records.set(`${resourceType}:${resourceId}`, { value, ...options });
    },
    async upsertFromSync(resourceType, resourceId, value, options) {
      writes.push({ resourceType, resourceId, value, options });
      records.set(`${resourceType}:${resourceId}`, { value, ...options });
      return true;
    },
  };

  await applyPullPage(repository, [
    { cursor: 'c-10', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', version: 2, payload: { id: 'task-1', title: 'old', version: 2 } },
    { cursor: 'c-11', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', version: 3, payload: { id: 'task-1', title: 'latest', version: 3 } },
  ]);

  assert.equal(writes.length, 1);
  assert.equal(records.get('TASK:task-1').value.title, 'latest');
  assert.equal(records.get('TASK:task-1').version, 3);
});

test('pull cannot overwrite a local mutation created after its unresolved snapshot', async () => {
  const { applyPullPage } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const backing = new LocalRepository('user-a', 'device-pull-race', { storage: createMemoryStorage() });
  await backing.upsert('TASK', 'task-1', { id: 'task-1', status: 'TODO', title: 'Remote v4' }, { version: 4, syncStatus: 'synced' });
  let injectedLocalMutation = false;
  const repository = {
    async listUnresolved(resourceType) {
      const initial = await backing.listUnresolved(resourceType);
      if (!injectedLocalMutation) {
        injectedLocalMutation = true;
        await backing.commitMutation({
          resourceType: 'TASK', resourceId: 'task-1', value: { id: 'task-1', status: 'DONE', title: 'Auto complete' },
          version: 4, deletedAt: null,
          mutation: { clientMutationId: 'automatic-completion', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 4, payload: { status: 'DONE' } },
        });
      }
      return initial;
    },
    read: backing.read.bind(backing),
    upsertFromSync: backing.upsertFromSync.bind(backing),
  };

  const changed = await applyPullPage(repository, [
    { cursor: 'c-5', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', version: 5, payload: { id: 'task-1', status: 'TODO', title: 'Remote v5' } },
  ]);

  assert.equal(changed.has('TASK'), false);
  assert.equal((await backing.read('TASK', 'task-1'))?.value.status, 'DONE');
  assert.equal((await backing.read('TASK', 'task-1'))?.value.title, 'Auto complete');
});

test('remote tombstone removes a settled projection but not a locally unresolved one', async () => {
  const { applyPullPage } = await import('../src/services/syncCycle.ts');
  const record = { value: { id: 'task-1', title: 'local' }, version: 1, deletedAt: null, syncStatus: 'synced' };
  const repository = {
    unresolved: [],
    async listUnresolved() { return this.unresolved; },
    async read() { return record; },
    async upsert(_resourceType, _resourceId, value, options) { Object.assign(record, { value, ...options }); },
    async upsertFromSync(_resourceType, _resourceId, value, options) {
      if (this.unresolved.some((mutation) => mutation.resourceType === _resourceType && mutation.resourceId === _resourceId)) return false;
      Object.assign(record, { value, ...options });
      return true;
    },
  };
  const tombstone = [{ cursor: 'c-4', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'DELETE', version: 4, deletedAt: '2026-09-04T10:00:00Z', payload: null }];

  await applyPullPage(repository, tombstone);
  assert.equal(record.deletedAt, '2026-09-04T10:00:00Z');
  repository.unresolved = [{ resourceType: 'TASK', resourceId: 'task-1', status: 'pending' }];
  record.deletedAt = null;
  await applyPullPage(repository, tombstone);
  assert.equal(record.deletedAt, null);
});

test('sync cycle releases a claimed mutation when its push response completes after scope invalidation', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const mutation = {
    clientMutationId: 'mutation-scope-push',
    userId: 'user-scope-push',
    resourceType: 'SUBJECT',
    resourceId: 'subject-scope-push',
    mutationType: 'CREATE',
    baseVersion: 0,
    payload: { id: 'subject-scope-push' },
    createdAt: '2026-10-07T00:00:00.000Z',
    status: 'inflight',
  };
  const pushStarted = createDeferred();
  const pushResponse = createDeferred();
  let current = true;
  const settled = [];
  const released = [];
  const repository = {
    async claimPending() { return [mutation]; },
    async settleMutation(value) { settled.push(value); },
    async releaseInflight(values) { released.push(...values); },
    async listUnresolved() { return []; },
    async read() { return null; },
    async upsert() {},
    async upsertFromSync() { return false; },
    async replaceSnapshotPreservingPending() {},
    async getSyncState() { return { cursor: null, resetRequired: false, schemaVersion: 6 }; },
    async saveCursor() {},
  };
  const api = {
    async pushChanges() {
      pushStarted.resolve();
      return pushResponse.promise;
    },
    async pullChanges() { return { changes: [], nextCursor: null, hasMore: false, resetRequired: false }; },
    async getSnapshot() { return { snapshotCursor: 'stale-snapshot', subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [] }; },
  };

  const pending = runSyncCycle({ repository, api, serverDeviceId: 'device-scope-push', isCurrent: () => current });
  await pushStarted.promise;
  current = false;
  pushResponse.resolve({ results: [{
    clientMutationId: mutation.clientMutationId,
    decision: 'APPLIED',
    resourceType: 'SUBJECT',
    resourceId: mutation.resourceId,
    current: { id: mutation.resourceId, version: 1 },
  }], serverCursor: 'stale-push-cursor' });

  await assert.rejects(pending, /SYNC_SCOPE_CHANGED/);
  assert.deepEqual(settled, []);
  assert.deepEqual(released, [], 'the unconfirmed ordinary request remains frozen for its original scope');
});

test('sync cycle does not apply or save a snapshot that returns after scope invalidation', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const snapshotStarted = createDeferred();
  const snapshotResponse = createDeferred();
  let current = true;
  const writes = [];
  const repository = {
    async claimPending() { return []; },
    async releaseInflight() {},
    async getSyncState() { return { cursor: null, resetRequired: false, schemaVersion: 6 }; },
    async replaceSnapshotPreservingPending(values) { writes.push({ type: 'snapshot', values }); },
    async saveCursor(cursor, resetRequired) { writes.push({ type: 'cursor', cursor, resetRequired }); },
  };
  const api = {
    async pushChanges() { assert.fail('there are no pending mutations'); },
    async pullChanges() { assert.fail('a fresh scope must request a snapshot'); },
    async getSnapshot() {
      snapshotStarted.resolve();
      return snapshotResponse.promise;
    },
  };

  const pending = runSyncCycle({ repository, api, serverDeviceId: 'device-scope-snapshot', isCurrent: () => current });
  await snapshotStarted.promise;
  current = false;
  snapshotResponse.resolve({ snapshotCursor: 'stale-snapshot-cursor', subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [] });

  await assert.rejects(pending, /SYNC_SCOPE_CHANGED/);
  assert.deepEqual(writes, []);
});

test('sync cycle does not apply a pull page or persist its cursor after scope invalidation', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const pullStarted = createDeferred();
  const pullResponse = createDeferred();
  let current = true;
  const writes = [];
  const repository = {
    async claimPending() { return []; },
    async getSyncState() { return { cursor: 'cursor-before', resetRequired: false, schemaVersion: 6 }; },
    async listUnresolved() { return []; },
    async read() { return null; },
    async upsertFromSync(...args) { writes.push({ type: 'resource', args }); return true; },
    async saveCursor(cursor, resetRequired) { writes.push({ type: 'cursor', cursor, resetRequired }); },
  };
  const api = {
    async pushChanges() { assert.fail('there are no pending mutations'); },
    async pullChanges() {
      pullStarted.resolve();
      return pullResponse.promise;
    },
    async getSnapshot() { assert.fail('the response does not require a snapshot'); },
  };

  const pending = runSyncCycle({ repository, api, serverDeviceId: 'device-scope-pull', isCurrent: () => current });
  await pullStarted.promise;
  current = false;
  pullResponse.resolve({
    changes: [{ cursor: 'cursor-after', resourceType: 'TASK', resourceId: 'task-scope-pull', mutationType: 'CREATE', version: 1, payload: { id: 'task-scope-pull' } }],
    nextCursor: 'cursor-after',
    hasMore: false,
    resetRequired: false,
  });

  await assert.rejects(pending, /SYNC_SCOPE_CHANGED/);
  assert.deepEqual(writes, []);
});

test('ordinary and core sync 401s in the same session share one rotating refresh token', async () => {
  const { createPinia } = await import('pinia');
  const { createApp, watch, nextTick } = await import('vue');
  const { createPersistedState } = await import('pinia-plugin-persistedstate');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const initial = {
    user: { id: 'user-shared-refresh', hasAvatar: false },
    tokens: { accessToken: 'token-shared-refresh', refreshToken: 'refresh-shared-refresh' },
    sessionId: 'session-shared-refresh',
    serverDeviceId: 'device-shared-refresh',
  };
  const storage = new Map([['auralis_auth_session', JSON.stringify(initial)]]);
  const openAuthStore = () => {
    const pinia = createPinia().use(createPersistedState({
      storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    }));
    createApp({}).use(pinia);
    return useAuthStore(pinia);
  };
  const authStore = openAuthStore();
  const generation = authStore.loginGeneration;
  const seenCredentials = [];
  const stop = watch(() => [authStore.token, authStore.serverSessionId], (credentials) => {
    seenCredentials.push(credentials);
  }, { flush: 'sync' });
  const scope = {
    key: Symbol('shared-refresh-scope'),
    isCurrent: () => authStore.sessionId === 'session-shared-refresh',
  };
  const bothInitialRequests = createDeferred();
  const firstRefreshStarted = createDeferred();
  let initialRequestCount = 0;
  let refreshCalls = 0;
  const refreshTokens = [];
  const retriedRequests = [];
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    const url = config.url ?? '';
    const authorization = requestAuthorization(config);
    if (url === '/api/ordinary') {
      if (authorization === 'Bearer token-shared-refresh-v2') {
        retriedRequests.push({ url, authorization });
        return axiosResponse(config, { ok: true });
      }
      initialRequestCount += 1;
      if (initialRequestCount === 2) bothInitialRequests.resolve();
      await bothInitialRequests.promise;
      return Promise.reject(axiosUnauthorized(config));
    }
    if (url === '/api/sync/push') {
      if (authorization === 'Bearer token-shared-refresh-v2') {
        retriedRequests.push({ url, authorization });
        return axiosResponse(config, { results: [], serverCursor: null });
      }
      initialRequestCount += 1;
      if (initialRequestCount === 2) bothInitialRequests.resolve();
      await bothInitialRequests.promise;
      return Promise.reject(axiosUnauthorized(config));
    }
    if (url === '/api/auth/refresh') {
      refreshCalls += 1;
      refreshTokens.push(requestPayload(config)?.refreshToken);
      if (refreshCalls > 1) {
        return Promise.reject(axiosUnauthorized(config));
      }
      firstRefreshStarted.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      return axiosResponse(config, {
        user: authStore.user,
        tokens: { accessToken: 'token-shared-refresh-v2', refreshToken: 'refresh-shared-refresh-v2' },
        sessionId: 'session-shared-refresh-next',
        serverDeviceId: 'device-shared-refresh',
      });
    }
    return axiosResponse(config);
  };

  try {
    const ordinary = request.get('/api/ordinary');
    const coreSync = useSyncApi.pushChanges({ serverDeviceId: 'device-shared-refresh', mutations: [] }, scope);
    await waitForSignal(firstRefreshStarted.promise, 'the shared session refresh request');
    const outcomes = await Promise.allSettled([ordinary, coreSync]);

    assert.equal(refreshCalls, 1, 'ordinary Axios and core sync must share one refresh for this session');
    assert.deepEqual(refreshTokens, ['refresh-shared-refresh']);
    assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'fulfilled']);
    assert.deepEqual(retriedRequests.map((item) => item.authorization), [
      'Bearer token-shared-refresh-v2',
      'Bearer token-shared-refresh-v2',
    ]);
    assert.equal(authStore.token, 'token-shared-refresh-v2');
    assert.equal(authStore.refreshToken, 'refresh-shared-refresh-v2');
    assert.equal(authStore.loginGeneration, generation);
    assert.equal(authStore.sessionId, initial.sessionId);
    assert.deepEqual(seenCredentials, [['token-shared-refresh-v2', 'session-shared-refresh-next']]);
    await nextTick();
    assert.deepEqual(JSON.parse(storage.get('auralis_auth_session')), {
      ...initial,
      tokens: authStore.tokens,
      sessionId: 'session-shared-refresh-next',
    });
    const hydrated = openAuthStore();
    assert.equal(hydrated.token, authStore.token);
    assert.equal(hydrated.serverSessionId, authStore.serverSessionId);
    assert.equal(hydrated.sessionId, authStore.serverSessionId);
    assert.equal(hydrated.authStatus, 'authenticated');
  } finally {
    stop();
    activeRequestAdapter = originalAdapter;
  }
});

test('ordinary requests retain their login generation across account switches and same-account re-login', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { useAuthApi } = await import('../src/api/useAuthApi.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  const loginA = {
    user: { id: 'ordinary-a', hasAvatar: false },
    tokens: { accessToken: 'token-a', refreshToken: 'refresh-a' },
    sessionId: 'session-a',
    serverDeviceId: 'device-a',
  };
  const loginB = {
    user: { id: 'ordinary-b', hasAvatar: false },
    tokens: { accessToken: 'token-b', refreshToken: 'refresh-b' },
    sessionId: 'session-b',
    serverDeviceId: 'device-b',
  };
  const lateWrite = createDeferred();
  const lateRead = createDeferred();
  const bothStarted = createDeferred();
  const received = new Map();
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = (config) => {
    received.set(config.url, config);
    if (received.size === 2) bothStarted.resolve();
    if (config.url === '/api/auth/me') return lateWrite.promise;
    if (config.url === '/api/ai/settings') return lateRead.promise;
    assert.fail(`Unexpected dispatch: ${config.url}`);
  };

  try {
    authStore.setSession(loginA);
    const writeRejected = assert.rejects(useAuthApi.updateProfile({ baseVersion: 1, displayName: 'A only' }), { code: 'SYNC_SCOPE_CHANGED' });
    const readRejected = assert.rejects(request.get('/api/ai/settings'), { code: 'SYNC_SCOPE_CHANGED' });
    await waitForSignal(bothStarted.promise, 'ordinary A read and write dispatches');
    const beforeDispatchRejected = assert.rejects(request.put('/api/auth/me?queued=true', { baseVersion: 1, displayName: 'A only' }), { code: 'SYNC_SCOPE_CHANGED' });
    queueMicrotask(() => {
      authStore.clearSession();
      authStore.setSession(loginB);
    });
    const beforeInterceptorRejected = assert.rejects(request.get('/api/tasks'), { code: 'SYNC_SCOPE_CHANGED' });
    await Promise.all([beforeDispatchRejected, beforeInterceptorRejected]);

    const writeConfig = received.get('/api/auth/me');
    const readConfig = received.get('/api/ai/settings');
    assert.equal(requestAuthorization(writeConfig), 'Bearer token-a');
    assert.equal(requestAuthorization(readConfig), 'Bearer token-a');
    lateWrite.reject(axiosUnauthorized(writeConfig));
    await writeRejected;
    assert.equal(authStore.token, 'token-b');
    assert.equal(authStore.refreshToken, 'refresh-b');

    authStore.clearSession();
    authStore.setSession({ ...loginA, tokens: { accessToken: 'token-a-new-login', refreshToken: 'refresh-a-new-login' } });
    lateRead.resolve(axiosResponse(readConfig, { owner: 'ordinary-a', data: 'old login' }));
    await readRejected;
    assert.deepEqual([...received.keys()], ['/api/auth/me', '/api/ai/settings']);
    assert.equal(authStore.token, 'token-a-new-login');
  } finally {
    lateWrite.resolve(axiosResponse(received.get('/api/auth/me')));
    lateRead.resolve(axiosResponse(received.get('/api/ai/settings')));
    activeRequestAdapter = originalAdapter;
  }
});

test('an ordinary A refresh cannot join or overwrite a core sync B refresh', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  const setSession = (id, accessToken, refreshToken) => {
    authStore.user = { id, email: `${id}@example.com` };
    authStore.tokens = { accessToken, refreshToken };
    authStore.sessionId = `session-${id}`;
    authStore.serverDeviceId = `device-${id}`;
    authStore.authStatus = 'authenticated';
  };
  const scopeFor = (sessionId) => ({
    key: Symbol(sessionId),
    isCurrent: () => authStore.sessionId === sessionId,
  });
  setSession('user-ordinary-a', 'token-a', 'refresh-a');
  const startedRefreshA = createDeferred();
  const startedRefreshB = createDeferred();
  const releaseRefreshA = createDeferred();
  const releaseRefreshB = createDeferred();
  const refreshTokens = [];
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    const url = config.url ?? '';
    const authorization = requestAuthorization(config);
    if (url === '/api/ordinary-a') return Promise.reject(axiosUnauthorized(config));
    if (url === '/api/sync/push') {
      if (authorization === 'Bearer token-b2') return axiosResponse(config, { results: [], serverCursor: 'b-cursor' });
      return Promise.reject(axiosUnauthorized(config));
    }
    if (url === '/api/auth/refresh') {
      const refreshToken = requestPayload(config)?.refreshToken;
      refreshTokens.push(refreshToken);
      if (refreshToken === 'refresh-a') {
        startedRefreshA.resolve();
        return releaseRefreshA.promise;
      }
      if (refreshToken === 'refresh-b') {
        startedRefreshB.resolve();
        return releaseRefreshB.promise;
      }
      assert.fail(`Unexpected refresh token: ${refreshToken}`);
    }
    return axiosResponse(config);
  };

  try {
    const requestA = request.get('/api/ordinary-a');
    await waitForSignal(startedRefreshA.promise, 'ordinary A refresh dispatch');
    setSession('user-core-b', 'token-b', 'refresh-b');
    const requestB = useSyncApi.pushChanges(
      { serverDeviceId: 'device-user-core-b', mutations: [] },
      scopeFor('session-user-core-b'),
    );
    await waitForSignal(startedRefreshB.promise, 'core sync B refresh while ordinary A refresh is pending');

    releaseRefreshB.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-b2', refreshToken: 'refresh-b2' },
      sessionId: 'session-b2',
    }));
    await requestB;
    releaseRefreshA.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-a2', refreshToken: 'refresh-a2' },
      sessionId: 'session-a2',
    }));
    await assert.rejects(requestA, /SYNC_SCOPE_CHANGED/);

    assert.deepEqual(refreshTokens.sort(), ['refresh-a', 'refresh-b']);
    assert.equal(authStore.sessionId, 'session-user-core-b');
    assert.equal(authStore.token, 'token-b2');
    assert.equal(authStore.refreshToken, 'refresh-b2');
  } finally {
    releaseRefreshA.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-a2', refreshToken: 'refresh-a2' },
      sessionId: 'session-a2',
    }));
    releaseRefreshB.resolve(axiosResponse({ url: '/api/auth/refresh' }, {
      tokens: { accessToken: 'token-b2', refreshToken: 'refresh-b2' },
      sessionId: 'session-b2',
    }));
    activeRequestAdapter = originalAdapter;
  }
});

function installLoginNavigationRecorder(navigations, location = { pathname: '/' }) {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { ...location, assign: (path) => navigations.push(path) } },
  });
  return () => {
    if (previousWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  };
}

function makeAuthScope(authStore, userId, deviceId, sessionId) {
  return {
    key: Symbol(`scope-${sessionId}`),
    isCurrent: () => authStore.authStatus === 'authenticated'
      && authStore.user?.id === userId
      && authStore.serverDeviceId === deviceId
      && authStore.sessionId === sessionId,
  };
}

test('changing a password preserves login for a wrong current password and refreshes an expired bearer', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { useAuthApi } = await import('../src/api/useAuthApi.ts');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.setSession({
    user: { id: 'password-owner', hasAvatar: false },
    tokens: { accessToken: 'password-access', refreshToken: 'password-refresh' },
    sessionId: 'password-sid', serverDeviceId: 'password-device',
  });
  const generation = auth.loginGeneration;
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const dispatches = [];
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    dispatches.push(config.url);
    if (config.url === '/api/auth/refresh') {
      return axiosResponse(config, {
        tokens: { accessToken: 'password-access-rotated', refreshToken: 'password-refresh-rotated' },
        sessionId: 'password-sid-rotated',
      });
    }
    assert.equal(config.url, '/api/auth/password');
    if (requestPayload(config).currentPassword === 'wrong') {
      throw axiosUnauthorized(config, { title: 'Unauthorized', status: 401, code: 'UNAUTHENTICATED', detail: 'Invalid credentials' });
    }
    if (requestAuthorization(config) === 'Bearer password-access') {
      throw axiosUnauthorized(config, { title: 'Unauthorized', status: 401, code: 'UNAUTHENTICATED', detail: 'Authentication is required' });
    }
    assert.equal(requestAuthorization(config), 'Bearer password-access-rotated');
    return axiosResponse(config);
  };
  const input = { baseVersion: 0, currentPassword: 'wrong', newPassword: 'new password' };
  try {
    await assert.rejects(useAuthApi.changePassword(input), (error) => error.problem?.detail === 'Invalid credentials');
    assert.deepEqual(dispatches, ['/api/auth/password']);
    assert.equal(auth.authStatus, 'authenticated');
    assert.equal(auth.loginGeneration, generation);
    await useAuthApi.changePassword({ ...input, currentPassword: 'correct' });
    assert.deepEqual(dispatches, ['/api/auth/password', '/api/auth/password', '/api/auth/refresh', '/api/auth/password']);
    assert.deepEqual(navigations, []);
  } finally {
    activeRequestAdapter = originalAdapter;
    restoreWindow();
  }
});

test('native Chat rejects late 401s, late events and unopened streams from the previous login', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { retryChatRun, streamAiMessage } = await import('../src/api/aiClient.ts');
  const { AiStreamController } = await import('../src/services/aiStreamController.ts');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  const login = (id) => auth.setSession({
    user: { id, hasAvatar: false },
    tokens: { accessToken: `access-${id}`, refreshToken: `refresh-${id}` },
    sessionId: `session-${id}`, serverDeviceId: `device-${id}`,
  });
  login('a');
  const originalFetch = globalThis.fetch;
  const originalAdapter = activeRequestAdapter;
  const unauthorized = createDeferred();
  const event = createDeferred();
  const bothStarted = createDeferred();
  const dispatches = [];
  activeRequestAdapter = async (config) => {
    assert.fail(`Old Chat must not dispatch ${config.url}`);
  };
  globalThis.fetch = async (url, init) => {
    dispatches.push([url, init.headers.Authorization]);
    if (dispatches.length === 2) bothStarted.resolve();
    if (url.endsWith('/stream')) return unauthorized.promise;
    return event.promise;
  };
  const command = { protocolVersion: 1, action: 'turn', conversationId: 'a-conv', requestId: 'a-request', content: 'question' };
  try {
    const unopened = streamAiMessage(command);
    const turn = streamAiMessage(command)[Symbol.asyncIterator]().next();
    const retry = retryChatRun('a-conv', 'a-run', 'a-retry')[Symbol.asyncIterator]().next();
    const finished = Promise.all([assert.rejects(turn, /SYNC_SCOPE_CHANGED/), assert.rejects(retry, /SYNC_SCOPE_CHANGED/)]);
    await waitForSignal(bothStarted.promise, 'both original Chat fetches');
    const pendingDefaultStream = assert.rejects(new AiStreamController().run(command), /SYNC_SCOPE_CHANGED/);
    auth.clearSession();
    login('b');
    unauthorized.resolve(Response.json({ code: 'UNAUTHENTICATED', status: 401 }, { status: 401 }));
    event.resolve(new Response('event: run.started\ndata: {"event":"run.started","protocolVersion":1}\n\n'));
    await finished;
    await pendingDefaultStream;
    await assert.rejects(unopened[Symbol.asyncIterator]().next(), /SYNC_SCOPE_CHANGED/);
    assert.deepEqual(dispatches.map(([, authorization]) => authorization), ['Bearer access-a', 'Bearer access-a']);
    assert.equal(auth.token, 'access-b');
  } finally {
    activeRequestAdapter = originalAdapter;
    globalThis.fetch = originalFetch;
  }
});

test('a failed native Chat refresh clears only its current login and navigates once', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { streamAiMessage } = await import('../src/api/aiClient.ts');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.setSession({
    user: { id: 'chat-user', hasAvatar: false },
    tokens: { accessToken: 'chat-access', refreshToken: 'chat-refresh' },
    sessionId: 'chat-sid', serverDeviceId: 'chat-device',
  });
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const originalFetch = globalThis.fetch;
  const originalAdapter = activeRequestAdapter;
  const refreshStarted = createDeferred();
  const releaseRefresh = createDeferred();
  let refreshCalls = 0;
  globalThis.fetch = async () => Response.json({ code: 'UNAUTHENTICATED', status: 401 }, { status: 401 });
  activeRequestAdapter = async (config) => {
    assert.equal(config.url, '/api/auth/refresh');
    refreshCalls++;
    refreshStarted.resolve();
    await releaseRefresh.promise;
    throw axiosUnauthorized(config);
  };
  const command = { protocolVersion: 1, action: 'turn', conversationId: 'conv', requestId: 'request', content: 'question' };
  try {
    const first = streamAiMessage(command)[Symbol.asyncIterator]().next();
    const second = streamAiMessage({ ...command, requestId: 'request-2' })[Symbol.asyncIterator]().next();
    const finished = Promise.all([assert.rejects(first, { code: 'AUTHENTICATION_REQUIRED' }), assert.rejects(second, { code: 'AUTHENTICATION_REQUIRED' })]);
    await waitForSignal(refreshStarted.promise, 'Chat refresh dispatch');
    await new Promise((resolve) => setImmediate(resolve));
    releaseRefresh.resolve();
    await finished;
    assert.equal(refreshCalls, 1);
    assert.equal(auth.authStatus, 'reauthentication-required');
    assert.equal(auth.serverSessionId, null);
    assert.deepEqual(navigations, ['/login']);
  } finally {
    releaseRefresh.resolve();
    activeRequestAdapter = originalAdapter;
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});

test('transient refresh errors preserve login across Axios, Chat and Overview requests', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { streamAiMessage } = await import('../src/api/aiClient.ts');
  const { postOverviewSse } = await import('../src/api/overviewSse.ts');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.setSession({
    user: { id: 'transient-refresh-owner', hasAvatar: false },
    tokens: { accessToken: 'existing-access', refreshToken: 'existing-refresh' },
    sessionId: 'existing-session', serverDeviceId: 'existing-device',
  });
  const startingGeneration = auth.loginGeneration;
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const originalFetch = globalThis.fetch;
  const originalAdapter = activeRequestAdapter;
  const unauthorized = async () => Response.json({ code: 'UNAUTHENTICATED', status: 401 }, { status: 401 });
  globalThis.fetch = unauthorized;
  const command = { protocolVersion: 1, action: 'turn', conversationId: 'conv', requestId: 'request', content: 'question' };
  const cases = [
    { run: () => request.get('/api/auth/me'), code: axios.AxiosError.ERR_NETWORK },
    { run: () => streamAiMessage(command)[Symbol.asyncIterator]().next(), code: axios.AxiosError.ECONNABORTED },
    { run: () => postOverviewSse('/api/ai/overview', { mode: 'ALL' }, undefined, { fetch: unauthorized }), status: 503 },
  ];
  try {
    for (const { run, code, status } of cases) {
      activeRequestAdapter = async (config) => {
        if (config.url !== '/api/auth/refresh') throw axiosUnauthorized(config);
        assert.equal(requestPayload(config).refreshToken, 'existing-refresh');
        throw new axios.AxiosError('unavailable', code, config, {}, status === undefined
          ? undefined : { status, data: {}, headers: {}, config });
      };
      await assert.rejects(run(), {
        name: 'ApiProblemError',
        status: status ?? 0,
        message: '暂时无法续期登录，请检查网络或稍后重试。',
      });
      assert.equal(auth.isAuthenticated, true);
      assert.equal(auth.loginGeneration, startingGeneration);
      assert.equal(auth.token, 'existing-access');
      assert.equal(auth.refreshToken, 'existing-refresh');
      assert.equal(auth.serverSessionId, 'existing-session');
    }
    assert.deepEqual(navigations, []);
  } finally {
    activeRequestAdapter = originalAdapter;
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});

test('Overview refresh rejection returns to login with the original protected route', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const { postOverviewSse } = await import('../src/api/overviewSse.ts');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.setSession({
    user: { id: 'overview-owner', hasAvatar: false },
    tokens: { accessToken: 'overview-access', refreshToken: 'overview-refresh' },
    sessionId: 'overview-session', serverDeviceId: 'overview-device',
  });
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations, {
    pathname: '/subject/overview', search: '?tab=overview', hash: '#outline',
  });
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    assert.equal(config.url, '/api/auth/refresh');
    throw axiosUnauthorized(config);
  };
  try {
    await assert.rejects(postOverviewSse('/api/ai/overview', { mode: 'ALL' }, undefined, {
      fetch: async () => Response.json({ code: 'UNAUTHENTICATED', status: 401 }, { status: 401 }),
    }), { code: 'AUTHENTICATION_REQUIRED' });
    assert.equal(auth.requiresReauthentication, true);
    assert.equal(auth.serverSessionId, null);
    assert.deepEqual(navigations, ['/login?redirect=%2Fsubject%2Foverview%3Ftab%3Doverview%23outline']);
  } finally {
    activeRequestAdapter = originalAdapter;
    restoreWindow();
  }
});

test('a late ordinary refresh failure cannot clear or navigate away from the new login', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  const setSession = (id) => authStore.setSession({
    user: { id, hasAvatar: false },
    tokens: { accessToken: `token-${id}`, refreshToken: `refresh-${id}` },
    sessionId: `session-${id}`,
    serverDeviceId: `device-${id}`,
  });
  const refreshStarted = createDeferred();
  const lateRefresh = createDeferred();
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const originalAdapter = activeRequestAdapter;
  const dispatches = [];
  activeRequestAdapter = (config) => {
    dispatches.push(config.url);
    if (config.url === '/api/auth/refresh') {
      refreshStarted.resolve(config);
      return lateRefresh.promise;
    }
    return Promise.reject(axiosUnauthorized(config));
  };

  try {
    setSession('a');
    const rejected = assert.rejects(request.get('/api/auth/me'), { code: 'SYNC_SCOPE_CHANGED' });
    await waitForSignal(refreshStarted.promise, 'ordinary A refresh dispatch');
    const refreshConfig = await refreshStarted.promise;
    assert.equal(requestPayload(refreshConfig).refreshToken, 'refresh-a');
    setSession('b');
    lateRefresh.reject(axiosUnauthorized(refreshConfig));
    await rejected;
    assert.deepEqual(dispatches, ['/api/auth/me', '/api/auth/refresh']);
    assert.equal(authStore.user.id, 'b');
    assert.equal(authStore.token, 'token-b');
    assert.equal(authStore.refreshToken, 'refresh-b');
    assert.equal(authStore.requiresReauthentication, false);
    assert.deepEqual(navigations, []);
  } finally {
    lateRefresh.resolve(axiosResponse(undefined));
    activeRequestAdapter = originalAdapter;
    restoreWindow();
  }
});

test('email verification and recovery requests keep their own 401 results without sending the active bearer', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.setSession({
    user: { id: 'active-owner', hasAvatar: false },
    tokens: { accessToken: 'active-access', refreshToken: 'active-refresh' },
    sessionId: 'active-session', serverDeviceId: 'active-device',
  });
  const paths = [
    '/api/auth/register/email-code',
    '/api/auth/password/reset/email-code',
    '/api/auth/password/reset',
  ];
  const dispatches = [];
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = async (config) => {
    dispatches.push([config.url, requestAuthorization(config)]);
    throw axiosUnauthorized(config, { title: 'Unauthorized', status: 401, detail: 'Invalid verification code' });
  };
  try {
    for (const path of paths) {
      await assert.rejects(request.post(path, {}), { status: 401, message: 'Invalid verification code' });
    }
    assert.deepEqual(dispatches, paths.map((path) => [path, undefined]));
    assert.equal(auth.isAuthenticated, true);
    assert.equal(auth.token, 'active-access');
  } finally {
    activeRequestAdapter = originalAdapter;
  }
});

test('explicit logout refreshes an expired bearer once and always clears only the originating login', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const originalAdapter = activeRequestAdapter;
  const login = {
    user: { id: 'logout-owner', hasAvatar: false },
    tokens: { accessToken: 'expired-access', refreshToken: 'existing-refresh' },
    sessionId: 'logout-session', serverDeviceId: 'logout-device',
  };
  const logoutPath = '/api/auth/logout';
  const refreshPath = '/api/auth/refresh';
  const cases = [
    { label: 'expired bearer', firstStatus: 401, expectedPaths: [logoutPath, refreshPath, logoutPath] },
    { label: 'invalid refresh', firstStatus: 401, refreshStatus: 401, expectedPaths: [logoutPath, refreshPath] },
    { label: 'unavailable refresh', firstStatus: 401, refreshStatus: 503, errorStatus: 503, expectedPaths: [logoutPath, refreshPath] },
    { label: 'unavailable logout', firstStatus: 503, errorStatus: 503, expectedPaths: [logoutPath] },
    { label: 'rejected rotated bearer', firstStatus: 401, retryStatus: 401, errorStatus: 401, expectedPaths: [logoutPath, refreshPath, logoutPath] },
  ];
  try {
    for (const { label, firstStatus, refreshStatus, retryStatus, errorStatus, expectedPaths } of cases) {
      setActivePinia(createPinia());
      const auth = useAuthStore();
      auth.setSession(login);
      const dispatches = [];
      activeRequestAdapter = async (config) => {
        dispatches.push(config.url);
        if (config.url === refreshPath) {
          assert.equal(requestPayload(config).refreshToken, 'existing-refresh');
          if (!refreshStatus) return axiosResponse(config, {
            tokens: { accessToken: 'rotated-access', refreshToken: 'rotated-refresh' },
            sessionId: 'rotated-session',
          });
        }
        const isFirst = dispatches.length === 1;
        if (config.url === logoutPath) {
          assert.equal(requestAuthorization(config), isFirst ? 'Bearer expired-access' : 'Bearer rotated-access');
        }
        const status = config.url === refreshPath ? refreshStatus : (isFirst ? firstStatus : retryStatus);
        if (status) throw new axios.AxiosError('request rejected', undefined, config, {}, { status, data: {}, headers: {}, config });
        return axiosResponse(config);
      };
      if (errorStatus) {
        await assert.rejects(auth.logout(), { status: errorStatus });
      } else {
        await auth.logout();
      }
      assert.deepEqual(dispatches, expectedPaths, label);
      assert.equal(auth.authStatus, 'anonymous', label);
      assert.equal(auth.token, null, label);
    }
    assert.deepEqual(navigations, [], 'the explicit logout UI owns navigation');
  } finally {
    restoreWindow();
    activeRequestAdapter = originalAdapter;
  }
});

test('logout refresh from an older login cannot retry using the new login', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  const ownerA = {
    user: { id: 'logout-owner-a', hasAvatar: false },
    tokens: { accessToken: 'logout-a', refreshToken: 'refresh-a' },
    sessionId: 'session-a', serverDeviceId: 'device-a',
  };
  const ownerB = {
    user: { id: 'logout-owner-b', hasAvatar: false },
    tokens: { accessToken: 'logout-b', refreshToken: 'refresh-b' },
    sessionId: 'session-b', serverDeviceId: 'device-b',
  };
  const refreshStarted = createDeferred();
  const releaseRefresh = createDeferred();
  const originalAdapter = activeRequestAdapter;
  const dispatches = [];
  activeRequestAdapter = (config) => {
    dispatches.push([config.url, requestAuthorization(config)]);
    if (config.url === '/api/auth/logout') return Promise.reject(axiosUnauthorized(config));
    assert.equal(config.url, '/api/auth/refresh');
    refreshStarted.resolve(config);
    return releaseRefresh.promise;
  };
  try {
    auth.setSession(ownerA);
    const oldLogout = assert.rejects(auth.logout(), { code: 'SYNC_SCOPE_CHANGED' });
    await waitForSignal(refreshStarted.promise, 'logout refresh dispatch');
    const config = await refreshStarted.promise;
    auth.setSession(ownerB);
    releaseRefresh.resolve(axiosResponse(config, {
      tokens: { accessToken: 'rotated-logout-a', refreshToken: 'rotated-refresh-a' },
      sessionId: 'rotated-session-a',
    }));
    await oldLogout;
    assert.deepEqual(dispatches, [['/api/auth/logout', 'Bearer logout-a'], ['/api/auth/refresh', undefined]]);
    assert.equal(auth.isAuthenticated, true);
    assert.equal(auth.token, 'logout-b');
  } finally {
    releaseRefresh.resolve(axiosResponse(undefined));
    activeRequestAdapter = originalAdapter;
  }
});

test('a public login can recover while an older logout is in flight', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  const loginA = {
    user: { id: 'logout-a', hasAvatar: false },
    tokens: { accessToken: 'token-logout-a', refreshToken: 'refresh-logout-a' },
    sessionId: 'session-logout-a',
    serverDeviceId: 'device-logout-a',
  };
  const loginB = {
    user: { id: 'login-b', hasAvatar: false },
    tokens: { accessToken: 'token-login-b', refreshToken: 'refresh-login-b' },
    sessionId: 'session-login-b',
    serverDeviceId: 'device-login-b',
  };
  const logoutStarted = createDeferred();
  const lateLogout = createDeferred();
  const originalAdapter = activeRequestAdapter;
  activeRequestAdapter = (config) => {
    if (config.url === '/api/auth/logout') {
      logoutStarted.resolve(config);
      return lateLogout.promise;
    }
    if (config.url === '/api/auth/login') return Promise.resolve(axiosResponse(config, loginB));
    assert.fail(`Unexpected dispatch: ${config.url}`);
  };

  try {
    authStore.setSession(loginA);
    const rejected = assert.rejects(authStore.logout(), { code: 'SYNC_SCOPE_CHANGED' });
    await waitForSignal(logoutStarted.promise, 'A logout dispatch');
    const logoutConfig = await logoutStarted.promise;
    assert.equal(requestAuthorization(logoutConfig), 'Bearer token-logout-a');
    authStore.requireReauthentication();
    await authStore.login({ username: 'login-b', password: 'synthetic-password' });
    lateLogout.resolve(axiosResponse(logoutConfig));
    await rejected;
    assert.equal(authStore.user.id, 'login-b');
    assert.equal(authStore.token, 'token-login-b');
    assert.equal(authStore.authStatus, 'authenticated');
  } finally {
    lateLogout.resolve(axiosResponse(undefined));
    activeRequestAdapter = originalAdapter;
  }
});

test('a scoped refresh HTTP failure preserves the failed session route after reauthentication clears scope', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  authStore.setSession({
    user: { id: 'user-refresh-failed-a', email: 'refresh-failed-a@example.com' },
    tokens: { accessToken: 'token-refresh-failed-a', refreshToken: 'refresh-refresh-failed-a' },
    sessionId: 'session-refresh-failed-a',
    serverDeviceId: 'device-refresh-failed-a',
  });
  const scope = makeAuthScope(authStore, 'user-refresh-failed-a', 'device-refresh-failed-a', 'session-refresh-failed-a');
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const originalAdapter = activeRequestAdapter;
  const dispatched = [];
  activeRequestAdapter = async (config) => {
    const url = config.url ?? '';
    dispatched.push(url);
    if (url === '/api/scoped-refresh-failure') return Promise.reject(axiosUnauthorized(config));
    if (url === '/api/auth/refresh') return Promise.reject(axiosUnauthorized(config));
    return axiosResponse(config);
  };

  try {
    await assert.rejects(
      request.get('/api/scoped-refresh-failure', { __auralisSyncScope: scope }),
    );

    assert.deepEqual(dispatched.filter((url) => url !== '/api/auth/me/avatar'), ['/api/scoped-refresh-failure', '/api/auth/refresh']);
    assert.equal(authStore.authStatus, 'reauthentication-required');
    assert.deepEqual(navigations, ['/login'], 'the failed A session must retain its login navigation');
  } finally {
    activeRequestAdapter = originalAdapter;
    restoreWindow();
  }
});

test('core push and pull finish while the asset upload queue is still pending', async () => {
  const { runCoreSyncWithAssetQueueWakeup } = await import('../src/store/useSyncStore.ts');
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-queue-barrier', 'device-queue-barrier', { storage: createMemoryStorage() });
  await repository.saveCursor('queue-barrier-before');
  await repository.upsert('SUBJECT', 'subject-queue-barrier', { id: 'subject-queue-barrier', name: 'Subject' }, { version: 1 });
  await repository.enqueueMutation({
    resourceType: 'SUBJECT', resourceId: 'subject-queue-barrier', clientMutationId: 'subject-queue-barrier-create',
    mutationType: 'UPDATE', baseVersion: 1, payload: { id: 'subject-queue-barrier', name: 'Subject' },
  });
  const queueWake = createDeferred();
  const coreRequests = [];
  const coreRun = runCoreSyncWithAssetQueueWakeup(
    { wakeUp: () => queueWake.promise },
    () => true,
    () => runSyncCycle({
      repository,
      serverDeviceId: 'device-queue-barrier',
      api: {
        async pushChanges({ mutations }) {
          coreRequests.push({ type: 'push', mutations });
          return { results: [{ clientMutationId: 'subject-queue-barrier-create', decision: 'APPLIED', resourceType: 'SUBJECT', resourceId: 'subject-queue-barrier', mutationType: 'UPDATE' }], serverCursor: 'queue-barrier-pushed' };
        },
        async pullChanges() {
          coreRequests.push({ type: 'pull' });
          return { changes: [], nextCursor: 'queue-barrier-after', hasMore: false, resetRequired: false };
        },
        async getSnapshot() { assert.fail('the repository already has a cursor'); },
      },
    }),
  );

  try {
    const outcome = await Promise.race([
      coreRun.then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('blocked-by-asset-queue'), 300)),
    ]);
    assert.equal(outcome, 'completed', 'core sync must not await the network-bound upload queue');
    assert.deepEqual(coreRequests.map((request) => request.type), ['push', 'pull']);
  } finally {
    queueWake.resolve();
    await coreRun;
  }
});

test('a Source released after upload is sent by the next core cycle', async () => {
  const { runCoreSyncWithAssetQueueWakeup } = await import('../src/store/useSyncStore.ts');
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-queue-source', 'device-queue-source', { storage: createMemoryStorage() });
  await repository.saveCursor('queue-source-before');
  const queueSource = fs.readFileSync(new URL('../src/services/localAssetSyncQueue.ts', import.meta.url), 'utf8');
  const draftSource = fs.readFileSync(new URL('../src/services/localSourceDraftService.ts', import.meta.url), 'utf8');
  const createDraftBody = draftSource.slice(draftSource.indexOf('async createDraft'), draftSource.indexOf('async releaseDraftsForAsset'));
  assert.doesNotMatch(createDraftBody, /enqueueMutation/, 'creating a local draft must not make a Source syncable before Asset completion');
  assert.match(queueSource, /if\s*\(released\.length\s*>\s*0\s*&&\s*this\.onWakeup\s*&&\s*!this\.disposed\)\s*\{\s*this\.assertNotDisposed\(\)\s*this\.onWakeup\(\)/,
    'the existing queue requests a later sync only after it releases at least one draft');
  const queueWake = createDeferred();
  const sourceReleased = createDeferred();
  const calls = [];
  let released = false;
  let followupCycle;
  const sourceCreate = async () => {
    await repository.upsert('SOURCE', 'source-after-upload', { id: 'source-after-upload', name: 'Uploaded PDF' }, { version: 0 });
    await repository.enqueueMutation({
      resourceType: 'SOURCE', resourceId: 'source-after-upload', clientMutationId: 'source-after-upload-create',
      mutationType: 'CREATE', baseVersion: 0, payload: { id: 'source-after-upload', name: 'Uploaded PDF' },
    });
    sourceReleased.resolve();
  };
  const queue = {
    async wakeUp() {
      if (released) return;
      await queueWake.promise;
      released = true;
      await sourceCreate();
      followupCycle = sync();
    },
  };
  const sync = () => runCoreSyncWithAssetQueueWakeup(queue, () => true, () => runSyncCycle({
    repository,
    serverDeviceId: 'device-queue-source',
    api: {
      async pushChanges({ mutations }) {
        calls.push(...mutations);
        return {
          results: mutations.map((mutation) => ({
            clientMutationId: mutation.clientMutationId, decision: 'APPLIED',
            resourceType: mutation.resourceType, resourceId: mutation.resourceId, mutationType: mutation.mutationType,
          })),
          serverCursor: 'queue-source-pushed',
        };
      },
      async pullChanges() { return { changes: [], nextCursor: 'queue-source-after', hasMore: false, resetRequired: false }; },
      async getSnapshot() { assert.fail('the repository already has a cursor'); },
    },
  }));

  await sync();
  assert.deepEqual(calls, [], 'a local draft must not create a Source mutation before Asset completion');
  queueWake.resolve();
  await waitForSignal(sourceReleased.promise, 'the Asset completion Source release');
  await followupCycle;
  assert.deepEqual(calls.map((mutation) => mutation.clientMutationId), ['source-after-upload-create']);
});

test('a current-scope asset queue rejection is consumed without failing core sync', async () => {
  const { runCoreSyncWithAssetQueueWakeup } = await import('../src/store/useSyncStore.ts');
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-queue-error', 'device-queue-error', { storage: createMemoryStorage() });
  await repository.saveCursor('queue-error-before');
  const queueWake = createDeferred();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await runCoreSyncWithAssetQueueWakeup(
      { wakeUp: () => queueWake.promise },
      () => true,
      () => runSyncCycle({
        repository,
        serverDeviceId: 'device-queue-error',
        api: {
          async pushChanges() { return { results: [], serverCursor: 'queue-error-pushed' }; },
          async pullChanges() { return { changes: [], nextCursor: 'queue-error-after', hasMore: false, resetRequired: false }; },
          async getSnapshot() { assert.fail('the repository already has a cursor'); },
        },
      }),
    );
    queueWake.reject(new Error('retryable upload failure'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0], ['[useSyncStore] Asset queue wakeup deferred', { code: 'SYNC_FAILED', detail: 'retryable upload failure' }]);
    assert.equal((await repository.getSyncState()).cursor, 'queue-error-after', 'the core cycle remains successful');
  } finally {
    queueWake.resolve();
    console.warn = originalWarn;
  }
});

test('late asset queue rejection from an old scope is consumed without a sync error', async () => {
  const { runCoreSyncWithAssetQueueWakeup } = await import('../src/store/useSyncStore.ts');
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('user-queue-stale', 'device-queue-stale', { storage: createMemoryStorage() });
  await repository.saveCursor('queue-stale-before');
  const queueWake = createDeferred();
  let scopeIsCurrent = true;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await runCoreSyncWithAssetQueueWakeup(
      { wakeUp: () => queueWake.promise },
      () => scopeIsCurrent,
      () => runSyncCycle({
        repository,
        serverDeviceId: 'device-queue-stale',
        api: {
          async pushChanges() { return { results: [], serverCursor: 'queue-stale-pushed' }; },
          async pullChanges() { return { changes: [], nextCursor: 'queue-stale-after', hasMore: false, resetRequired: false }; },
          async getSnapshot() { assert.fail('the repository already has a cursor'); },
        },
      }),
    );
    scopeIsCurrent = false;
    queueWake.reject(new Error('old account upload failed'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(warnings, [], 'a stale queue rejection must not be reported into the current session');
    assert.equal((await repository.getSyncState()).cursor, 'queue-stale-after', 'the successful core cycle remains committed');
  } finally {
    queueWake.resolve();
    console.warn = originalWarn;
  }
});

test('a scoped protected request with no refresh token requires login without dispatching refresh', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  authStore.user = { id: 'user-no-refresh-a', email: 'no-refresh-a@example.com' };
  authStore.tokens = { accessToken: 'token-no-refresh-a' };
  authStore.sessionId = 'session-no-refresh-a';
  authStore.serverDeviceId = 'device-no-refresh-a';
  authStore.authStatus = 'authenticated';
  const scope = makeAuthScope(authStore, 'user-no-refresh-a', 'device-no-refresh-a', 'session-no-refresh-a');
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const originalAdapter = activeRequestAdapter;
  const dispatched = [];
  activeRequestAdapter = async (config) => {
    const url = config.url ?? '';
    dispatched.push(url);
    if (url === '/api/no-refresh-token') return Promise.reject(axiosUnauthorized(config));
    return axiosResponse(config);
  };

  try {
    await assert.rejects(request.get('/api/no-refresh-token', { __auralisSyncScope: scope }));

    assert.deepEqual(dispatched, ['/api/no-refresh-token'], 'a missing refresh token must not make a refresh request');
    assert.equal(authStore.authStatus, 'reauthentication-required');
    assert.deepEqual(navigations, ['/login']);
  } finally {
    activeRequestAdapter = originalAdapter;
    restoreWindow();
  }
});

test('an A refresh failure followed by B setSession before the outer catch cannot navigate or clear B', async () => {
  const { setActivePinia, createPinia } = await import('pinia');
  const { useAuthStore } = await import('../src/store/useAuthStore.ts');
  setActivePinia(createPinia());
  const authStore = useAuthStore();
  authStore.setSession({
    user: { id: 'user-delayed-failure-a', email: 'delayed-failure-a@example.com' },
    tokens: { accessToken: 'token-delayed-failure-a', refreshToken: 'refresh-delayed-failure-a' },
    sessionId: 'session-delayed-failure-a',
    serverDeviceId: 'device-delayed-failure-a',
  });
  const scope = makeAuthScope(authStore, 'user-delayed-failure-a', 'device-delayed-failure-a', 'session-delayed-failure-a');
  const navigations = [];
  const restoreWindow = installLoginNavigationRecorder(navigations);
  const originalAdapter = activeRequestAdapter;
  const originalRequireReauthentication = authStore.requireReauthentication.bind(authStore);
  activeRequestAdapter = async (config) => {
    const url = config.url ?? '';
    if (url === '/api/delayed-refresh-failure') return Promise.reject(axiosUnauthorized(config));
    if (url === '/api/auth/refresh') return Promise.reject(axiosUnauthorized(config));
    if (url === '/api/auth/me/avatar') return axiosResponse(config, new Blob([]));
    return axiosResponse(config);
  };
  authStore.requireReauthentication = (reason) => {
    originalRequireReauthentication(reason);
    queueMicrotask(() => {
      authStore.setSession({
        user: { id: 'user-delayed-failure-b', email: 'delayed-failure-b@example.com' },
        tokens: { accessToken: 'token-delayed-failure-b', refreshToken: 'refresh-delayed-failure-b' },
        sessionId: 'session-delayed-failure-b',
        serverDeviceId: 'device-delayed-failure-b',
      });
    });
  };

  try {
    await assert.rejects(request.get('/api/delayed-refresh-failure', { __auralisSyncScope: scope }));

    assert.equal(authStore.user?.id, 'user-delayed-failure-b');
    assert.equal(authStore.sessionId, 'session-delayed-failure-b');
    assert.equal(authStore.token, 'token-delayed-failure-b');
    assert.equal(authStore.authStatus, 'authenticated');
    assert.deepEqual(navigations, [], 'an old A failure must not navigate after B has authenticated');
  } finally {
    authStore.requireReauthentication = originalRequireReauthentication;
    activeRequestAdapter = originalAdapter;
    restoreWindow();
  }
});


test('schedule wire payloads contain only current server fields and never local queue metadata', async () => {
  const originalPost = request.post;
  const sent = [];
  try {
    request.post = async (_url, data) => { sent.push(data); return { results: [] }; };
    const insertion = { taskId: 'a', baseVersion: 2, scheduledAt: '2099-10-06T10:00:00Z',
      windowStartAt: '2099-10-06T08:00:00Z', windowLastStartAt: '2099-10-06T22:30:00Z' };
    for (const [mutationType, fields] of [
      ['SCHEDULE_INSERTION', { ...insertion, targetTaskId: 'b' }],
      ['SCHEDULE_INSERTION', { ...insertion, placementMode: 'STRICT' }],
      ['SCHEDULE_SWAP', { sourceTaskId: 'a', sourceBaseVersion: 2, targetTaskId: 'b', targetBaseVersion: 4 }],
    ]) {
      await useSyncApi.pushChanges({ serverDeviceId: 'device', mutations: [{
        clientMutationId: `wire-${mutationType}`, resourceType: 'TASK', resourceId: 'a', mutationType, baseVersion: 2,
        status: 'pending', createdAt: 'now', userId: 'user', payload: { ...fields,
          _localAffectedTaskIds: ['a', 'b'], _localExpectedTasks: [{ id: 'a', value: { title: 'private-local-only' } }],
          _localScheduleSent: true, futureLocalMetadata: 'must not leak' },
      }] });
      assert.deepEqual(sent.at(-1).mutations[0].payload, fields);
    }
    await useSyncApi.pushChanges({ serverDeviceId: 'device', mutations: [{
      clientMutationId: 'missing-target', resourceType: 'TASK', resourceId: 'a', mutationType: 'SCHEDULE_SWAP',
      baseVersion: 2, status: 'pending', createdAt: 'now', userId: 'user', payload: { sourceTaskId: 'a', _localScheduleSent: true },
    }] });
    assert.deepEqual(sent.at(-1).mutations[0].payload, { sourceTaskId: 'a' }, 'missing required values remain missing for server validation');
  } finally { request.post = originalPost; }
});


test('SCHEDULE_UNSCHEDULE sends wire mutation UPDATE with scheduledAt: null, whitelisted fields, and strips _local* metadata', async () => {
  const originalPost = request.post;
  const sent = [];
  try {
    request.post = async (_url, data) => { sent.push(data); return { results: [] }; };
    await useSyncApi.pushChanges({
      serverDeviceId: 'device',
      mutations: [{
        clientMutationId: 'wire-unschedule',
        resourceType: 'TASK',
        resourceId: 'task-u',
        mutationType: 'SCHEDULE_UNSCHEDULE',
        baseVersion: 3,
        status: 'pending',
        createdAt: '2026-11-03T10:00:00Z',
        userId: 'user-1',
        payload: {
          id: 'task-u',
          title: 'My Task',
          description: 'Task details',
          status: 'TODO',
          scheduledAt: '2099-10-06T10:00:00Z',
          dueAt: '2099-10-06T18:00:00Z',
          durationMinutes: 30,
          sortKey: 'sort-key-1',
          subjectId: 'sub-1',
          baseVersion: 3,
          _localAffectedTaskIds: ['task-u'],
          _localExpectedTasks: [{ id: 'task-u', value: {} }],
          _localScheduleSent: true,
          unwantedField: 'must be stripped',
        },
      }],
    });
    assert.equal(sent.length, 1);
    const wireMutation = sent[0].mutations[0];
    assert.equal(wireMutation.mutationType, 'UPDATE');
    assert.equal(wireMutation.resourceType, 'TASK');
    assert.equal(wireMutation.resourceId, 'task-u');
    assert.equal(wireMutation.baseVersion, 3);
    assert.deepEqual(wireMutation.payload, {
      title: 'My Task',
      description: 'Task details',
      status: 'TODO',
      scheduledAt: null,
      dueAt: '2099-10-06T18:00:00Z',
      durationMinutes: 30,
      sortKey: 'sort-key-1',
      subjectId: 'sub-1',
      baseVersion: 3,
    });
    assert.equal(wireMutation.payload._localAffectedTaskIds, undefined);
    assert.equal(wireMutation.payload.unwantedField, undefined);
  } finally {
    request.post = originalPost;
  }
});

test('push settlement handles single Task DTO response for SCHEDULE_UNSCHEDULE through schedule pathway', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('unschedule-sync-user', 'device', { storage: createMemoryStorage() });
  await repository.saveCursor('cursor-before-unschedule');
  await repository.upsert('TASK', 'task-u', { id: 'task-u', status: 'TODO', scheduledAt: '2099-10-06T10:00:00Z' }, { version: 2 });
  await repository.commitScheduleMutation({
    items: [{ resourceType: 'TASK', resourceId: 'task-u', value: { id: 'task-u', status: 'TODO' }, version: 2, expectedLocalVersion: 2, deletedAt: null }],
    mutation: {
      clientMutationId: 'unschedule-push-1',
      resourceType: 'TASK',
      resourceId: 'task-u',
      mutationType: 'SCHEDULE_UNSCHEDULE',
      baseVersion: 2,
      payload: { id: 'task-u', scheduledAt: null, baseVersion: 2, _localAffectedTaskIds: ['task-u'] },
    },
  });

  const api = {
    async pushChanges({ mutations }) {
      const m = mutations[0];
      return {
        results: [{
          clientMutationId: m.clientMutationId,
          decision: 'APPLIED',
          resourceType: 'TASK',
          mutationType: 'UPDATE',
          current: {
            id: 'task-u',
            status: 'TODO',
            scheduledAt: null,
            version: 3,
          },
        }],
        serverCursor: 'cursor-after-unschedule',
      };
    },
    async pullChanges() { return { changes: [], nextCursor: 'cursor-after-unschedule', hasMore: false, resetRequired: false }; },
    async getSnapshot() { assert.fail('unexpected snapshot'); },
  };

  const result = await runSyncCycle({ repository, api, serverDeviceId: 'device' });
  assert.equal(result.scheduleApplied, 1);
  const taskRow = await repository.read('TASK', 'task-u');
  assert.equal(taskRow.version, 3);
  assert.equal(taskRow.syncStatus, 'synced');
  assert.equal(taskRow.value.scheduledAt, null);
  const unresolved = await repository.listUnresolved('TASK');
  assert.equal(unresolved.length, 0);
});

test('rejected SCHEDULE_UNSCHEDULE recovers a remote tombstone before advancing pull', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('unschedule-deleted-task-user', 'device', { storage: createMemoryStorage() });
  const removed = { id: 'removed', status: 'TODO', scheduledAt: '2099-10-06T10:00:00Z', version: 2 };
  const later = { id: 'later', status: 'TODO', scheduledAt: null, version: 1 };
  const tombstone = { ...removed, version: 3, deletedAt: '2099-10-06T09:00:00Z' };
  await repository.saveCursor('before-delete');
  for (const task of [removed, later]) await repository.upsert('TASK', task.id, task, { version: task.version });
  await repository.commitScheduleMutation({
    items: [{ resourceType: 'TASK', resourceId: removed.id, value: { ...removed, scheduledAt: null },
      version: removed.version, expectedLocalVersion: removed.version, deletedAt: null }],
    mutation: { clientMutationId: 'unschedule-deleted-task', resourceType: 'TASK', resourceId: removed.id,
      mutationType: 'SCHEDULE_UNSCHEDULE', baseVersion: removed.version,
      payload: { scheduledAt: null, _localAffectedTaskIds: [removed.id] } },
  });
  await repository.commitScheduleMutation({
    items: [{ resourceType: 'TASK', resourceId: later.id, value: { ...later, scheduledAt: removed.scheduledAt },
      version: later.version, expectedLocalVersion: later.version, deletedAt: null }],
    mutation: { clientMutationId: 'later-insertion', resourceType: 'TASK', resourceId: later.id,
      mutationType: 'SCHEDULE_INSERTION', baseVersion: later.version,
      payload: { taskId: later.id, scheduledAt: removed.scheduledAt, _localAffectedTaskIds: [later.id] } },
  });

  const attempts = [];
  let snapshots = 0;
  let pulls = 0;
  const api = {
    async pushChanges({ mutations }) {
      assert.equal(mutations.length, 1);
      const [mutation] = mutations;
      attempts.push(mutation.clientMutationId);
      return { results: [{ clientMutationId: mutation.clientMutationId, resourceType: 'TASK', resourceId: removed.id,
        mutationType: 'UPDATE', decision: 'REJECTED', code: 'RESOURCE_NOT_FOUND', current: null }], serverCursor: 'after-delete' };
    },
    async getSnapshot() {
      snapshots += 1;
      if (snapshots === 1) throw new Error('temporary snapshot error');
      return { snapshotCursor: 'after-delete', tasks: [tombstone, later], subjects: [], sources: [], knowledgeBlocks: [], relations: [] };
    },
    async pullChanges({ cursor }) {
      pulls += 1;
      assert.equal(cursor, 'after-delete');
      return { changes: [], nextCursor: 'after-delete', hasMore: false, resetRequired: false };
    },
  };

  const cycle = () => runSyncCycle({ repository, api, serverDeviceId: 'device' });
  await assert.rejects(cycle, /temporary snapshot error/);
  assert.equal((await repository.getSyncState()).cursor, 'before-delete');
  assert.equal((await repository.listUnresolved('TASK')).length, 2);
  assert.equal(pulls, 0);

  const result = await cycle();
  assert.deepEqual(attempts, ['unschedule-deleted-task', 'unschedule-deleted-task']);
  assert.deepEqual(result.scheduleErrors, [{ clientMutationId: 'unschedule-deleted-task', code: 'RESOURCE_NOT_FOUND' }]);
  assert.equal(result.cursor, 'after-delete');
  assert.equal(pulls, 1);
  assert.deepEqual(await repository.listUnresolved('TASK'), []);
  assert.equal((await repository.read('TASK', removed.id)).deletedAt, tombstone.deletedAt);
  assert.equal((await repository.read('TASK', later.id)).value.scheduledAt, null);
});

test('ordinary TASK UPDATE conflict and null-snapshot rejection auto-converge in runSyncCycle without blocking later pulls', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('task-race-converge', 'device', { storage: createMemoryStorage() });
  await repository.saveCursor('cursor-0');
  await repository.upsert('TASK', 't-race', { id: 't-race', title: 'Scheduled Task', status: 'IN_PROGRESS', version: 1 }, { version: 1 });
  await repository.commitMutation({
    resourceType: 'TASK',
    resourceId: 't-race',
    value: { id: 't-race', title: 'Scheduled Task', status: 'DONE', version: 1 },
    version: 1,
    deletedAt: null,
    mutation: {
      clientMutationId: 'pc-overdue-complete',
      resourceType: 'TASK',
      resourceId: 't-race',
      mutationType: 'UPDATE',
      baseVersion: 1,
      payload: { status: 'DONE', baseVersion: 1 },
    },
  });

  let pullPass = 0;
  const firstCycle = await runSyncCycle({
    repository,
    serverDeviceId: 'device',
    api: {
      async pushChanges({ mutations }) {
        return {
          results: [{
            clientMutationId: mutations[0].clientMutationId,
            decision: 'CONFLICT',
            resourceType: 'TASK',
            resourceId: 't-race',
            mutationType: 'UPDATE',
            code: 'RESOURCE_VERSION_CONFLICT',
            current: { id: 't-race', title: 'Mobile Won', status: 'DONE', version: 2, deletedAt: null },
          }],
          serverCursor: 'cursor-1',
        };
      },
      async pullChanges() {
        pullPass += 1;
        return {
          changes: [{
            cursor: 'cursor-2',
            resourceType: 'TASK',
            resourceId: 't-race',
            mutationType: 'UPDATE',
            version: 3,
            deletedAt: null,
            payload: { id: 't-race', title: 'Later Cloud Edit', status: 'DONE', version: 3 },
            createdAt: null,
          }],
          nextCursor: 'cursor-2',
          hasMore: false,
          resetRequired: false,
        };
      },
      async getSnapshot() {
        assert.fail('valid CONFLICT current must converge without snapshot fallback');
      },
    },
  });

  assert.equal(pullPass, 1);
  assert.equal(firstCycle.changedResourceTypes.has('TASK'), true);
  assert.deepEqual(await repository.listUnresolved('TASK'), []);
  const pulledRow = await repository.read('TASK', 't-race');
  assert.equal(pulledRow.version, 3);
  assert.equal(pulledRow.syncStatus, 'synced');
  assert.equal(pulledRow.value.title, 'Later Cloud Edit');

  // Ordinary non-CREATE TASK rejection with null current falls back to snapshot while preserving unrelated pending writes
  await repository.upsert('TASK', 't-keep', { id: 't-keep', title: 'Pending Local', status: 'TODO', version: 1 }, { version: 1 });
  await repository.commitMutation({
    resourceType: 'TASK',
    resourceId: 't-keep',
    value: { id: 't-keep', title: 'Pending Local Edit', status: 'DONE', version: 1 },
    version: 1,
    deletedAt: null,
    mutation: {
      clientMutationId: 'pc-keep-proc',
      resourceType: 'TASK',
      resourceId: 't-keep',
      mutationType: 'UPDATE',
      baseVersion: 1,
      payload: { title: 'Pending Local Edit', baseVersion: 1 },
    },
  });
  await repository.commitMutation({
    resourceType: 'TASK',
    resourceId: 't-race',
    value: { id: 't-race', title: 'Invalid Edit', status: 'DONE', version: 3 },
    version: 3,
    deletedAt: null,
    mutation: {
      clientMutationId: 'pc-val-fail',
      resourceType: 'TASK',
      resourceId: 't-race',
      mutationType: 'UPDATE',
      baseVersion: 3,
      payload: { title: 'Invalid Edit', baseVersion: 3 },
    },
  });

  let snapshotCalls = 0;
  await runSyncCycle({
    repository,
    serverDeviceId: 'device',
    api: {
      async pushChanges({ mutations }) {
        return {
          results: mutations.map((m) => (m.clientMutationId === 'pc-val-fail'
            ? {
                clientMutationId: m.clientMutationId,
                decision: 'REJECTED',
                resourceType: 'TASK',
                resourceId: 't-race',
                mutationType: 'UPDATE',
                code: 'VALIDATION_FAILED',
                current: null,
              }
            : {
                clientMutationId: m.clientMutationId,
                decision: 'PROCESSING',
                resourceType: m.resourceType,
                resourceId: m.resourceId,
                mutationType: m.mutationType,
              })),
          serverCursor: 'cursor-3',
        };
      },
      async getSnapshot() {
        snapshotCalls += 1;
        return {
          snapshotCursor: 'cursor-snap',
          subjects: [],
          sources: [],
          knowledgeBlocks: [],
          relations: [],
          tasks: [
            { id: 't-race', title: 'Authoritative Task', status: 'DONE', version: 4 },
            { id: 't-keep', title: 'Server Older Task', status: 'TODO', version: 1 },
          ],
        };
      },
      async pullChanges({ cursor }) {
        assert.equal(cursor, 'cursor-snap');
        return { changes: [], nextCursor: 'cursor-snap', hasMore: false, resetRequired: false };
      },
    },
  });

  assert.equal(snapshotCalls, 1);
  assert.equal((await repository.read('TASK', 't-race')).value.title, 'Authoritative Task');
  assert.equal((await repository.read('TASK', 't-race')).syncStatus, 'synced');
  assert.equal((await repository.read('TASK', 't-keep')).value.title, 'Pending Local Edit');
  assert.equal((await repository.listUnresolved('TASK')).length, 1);
});

test('runSyncCycle defers settlement until snapshot succeeds, preserves mid-snapshot successors, and recovers stale-version CONFLICT', async () => {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts');
  const repository = new LocalRepository('task-deferred-snapshot', 'device', { storage: createMemoryStorage() });
  await repository.saveCursor('c-0');
  await repository.upsert('TASK', 't-err', { id: 't-err', title: 'Initial', status: 'TODO', version: 2 }, { version: 2 });
  await repository.commitMutation({
    resourceType: 'TASK',
    resourceId: 't-err',
    value: { id: 't-err', title: 'Rejected Update', status: 'DONE', version: 2 },
    version: 2,
    deletedAt: null,
    mutation: {
      clientMutationId: 'm-err-1',
      resourceType: 'TASK',
      resourceId: 't-err',
      mutationType: 'UPDATE',
      baseVersion: 2,
      payload: { title: 'Rejected Update', baseVersion: 2 },
    },
  });

  // 1. Transient getSnapshot() failure must keep m-err-1 inflight so the retry reclaims and reconciles it
  let snapshotAttempts = 0;
  let midSnapshotEnqueue = false;
  await assert.rejects(
    runSyncCycle({
      repository,
      serverDeviceId: 'device',
      api: {
        async pushChanges({ mutations }) {
          return {
            results: [{
              clientMutationId: mutations[0].clientMutationId,
              decision: 'REJECTED',
              resourceType: 'TASK',
              resourceId: 't-err',
              mutationType: 'UPDATE',
              code: 'VALIDATION_FAILED',
              current: null,
            }],
          };
        },
        async getSnapshot() {
          snapshotAttempts += 1;
          throw new Error('snapshot unreachable');
        },
        async pullChanges() {
          assert.fail('pull must not run when snapshot reconcile failed');
        },
      },
    }),
    /snapshot unreachable/,
  );
  assert.equal(snapshotAttempts, 1);
  assert.deepEqual((await repository.listUnresolved('TASK')).map(m => [m.clientMutationId, m.status]), [['m-err-1', 'inflight']]);

  // 2. Retry succeeds while a successor m-succ-2 arrives mid-snapshot -> m-err-1 archives without clobbering m-succ-2
  const retryResult = await runSyncCycle({
    repository,
    serverDeviceId: 'device',
    api: {
      async pushChanges({ mutations }) {
        assert.equal(mutations[0].clientMutationId, 'm-err-1');
        return {
          results: [{
            clientMutationId: 'm-err-1',
            decision: 'REJECTED',
            resourceType: 'TASK',
            resourceId: 't-err',
            mutationType: 'UPDATE',
            code: 'VALIDATION_FAILED',
            current: null,
          }],
        };
      },
      async getSnapshot() {
        if (!midSnapshotEnqueue) {
          midSnapshotEnqueue = true;
          await repository.commitMutation({
            resourceType: 'TASK',
            resourceId: 't-err',
            value: { id: 't-err', title: 'Newer Successor Edit', status: 'IN_PROGRESS', version: 2 },
            version: 2,
            deletedAt: null,
            mutation: {
              clientMutationId: 'm-succ-2',
              resourceType: 'TASK',
              resourceId: 't-err',
              mutationType: 'UPDATE',
              baseVersion: 2,
              payload: { title: 'Newer Successor Edit', baseVersion: 2 },
            },
          });
        }
        return {
          snapshotCursor: 'c-snap-1',
          subjects: [],
          sources: [],
          knowledgeBlocks: [],
          relations: [],
          tasks: [{ id: 't-err', title: 'Server V3', status: 'TODO', version: 3 }],
        };
      },
      async pullChanges({ cursor }) {
        return { changes: [], nextCursor: cursor, hasMore: false, resetRequired: false };
      },
    },
  });

  assert.deepEqual(retryResult.rejectedTaskIds, ['t-err']);
  assert.equal((await repository.read('TASK', 't-err')).value.title, 'Newer Successor Edit');
  assert.equal((await repository.read('TASK', 't-err')).syncStatus, 'pending');
  assert.deepEqual((await repository.listUnresolved('TASK')).map(m => [m.clientMutationId, m.status]), [['m-succ-2', 'pending']]);

  // Settle m-succ-2 cleanly first, then test stale-version inline CONFLICT fallback to getSnapshot
  await runSyncCycle({
    repository,
    serverDeviceId: 'device',
    api: {
      async pushChanges({ mutations }) {
        assert.equal(mutations[0].clientMutationId, 'm-succ-2');
        return {
          results: [{
            clientMutationId: 'm-succ-2',
            decision: 'APPLIED',
            resourceType: 'TASK',
            resourceId: 't-err',
            mutationType: 'UPDATE',
            current: { id: 't-err', title: 'Newer Successor Edit', status: 'IN_PROGRESS', version: 4 },
          }],
        };
      },
      async pullChanges({ cursor }) {
        return { changes: [], nextCursor: cursor, hasMore: false, resetRequired: false };
      },
      async getSnapshot() { assert.fail('unexpected snapshot'); },
    },
  });

  await repository.commitMutation({
    resourceType: 'TASK',
    resourceId: 't-err',
    value: { id: 't-err', title: 'Concurrent Local', status: 'DONE', version: 4 },
    version: 4,
    deletedAt: null,
    mutation: {
      clientMutationId: 'm-stale-conf',
      resourceType: 'TASK',
      resourceId: 't-err',
      mutationType: 'UPDATE',
      baseVersion: 4,
      payload: { title: 'Concurrent Local', baseVersion: 4 },
    },
  });

  let staleFallbackCalls = 0;
  await runSyncCycle({
    repository,
    serverDeviceId: 'device',
    api: {
      async pushChanges({ mutations }) {
        return {
          results: [{
            clientMutationId: mutations[0].clientMutationId,
            decision: 'CONFLICT',
            resourceType: 'TASK',
            resourceId: 't-err',
            mutationType: 'UPDATE',
            code: 'RESOURCE_VERSION_CONFLICT',
            current: { id: 't-err', title: 'Stale Inline Payload', status: 'TODO', version: 2 },
          }],
        };
      },
      async getSnapshot() {
        staleFallbackCalls += 1;
        return {
          snapshotCursor: 'c-snap-2',
          subjects: [],
          sources: [],
          knowledgeBlocks: [],
          relations: [],
          tasks: [{ id: 't-err', title: 'Snapshot V5 Winner', status: 'DONE', version: 5 }],
        };
      },
      async pullChanges({ cursor }) {
        return { changes: [], nextCursor: cursor, hasMore: false, resetRequired: false };
      },
    },
  });

  assert.equal(staleFallbackCalls, 1);
  const finalRow = await repository.read('TASK', 't-err');
  assert.equal(finalRow.version, 5);
  assert.equal(finalRow.syncStatus, 'synced');
  assert.equal(finalRow.value.title, 'Snapshot V5 Winner');
  assert.deepEqual(await repository.listUnresolved('TASK'), []);
});
