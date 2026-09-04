import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

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
const request = (await import('../src/api/request.ts')).default;

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

test('Pinia sync store delegates transport and projection reconciliation to the shared cycle', () => {
  const source = fs.readFileSync(new URL('../src/store/useSyncStore.ts', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*runSyncCycle\s*\}\s*from\s*'@\/services\/syncCycle'/);
  assert.match(source, /await\s+runSyncCycle\(/);
  assert.doesNotMatch(source, /async function applyPushResult/);
  assert.doesNotMatch(source, /async function pullLoop/);
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
    async settleMutation(input) { settlements.push(input); },
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
      return { results: [{ clientMutationId: 'm-1', decision: 'APPLIED', resourceType: 'TASK', resourceId: 'task-1', current: { id: 'task-1', title: 'first', version: 2 } }], serverCursor: 'c-2' };
    },
    async pullChanges() { return { changes: [], nextCursor: 'c-2', hasMore: false, resetRequired: false }; },
    async getSnapshot() { assert.fail('pull did not require a snapshot'); },
  };

  await runSyncCycle({ repository, api, serverDeviceId: 'device-1' });
  assert.deepEqual(settlements.map((item) => item.clientMutationId), ['m-1']);
  assert.equal(repository.resource.syncStatus, 'pending');
});
