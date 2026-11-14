import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const srcRootUrl = new URL('../src/', import.meta.url).href;
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url);

const {
  LocalConflictError,
  LocalRepository,
  createMemoryStorage,
  taskScheduleState,
} = await import('../src/services/localRepository.ts');
const { createVersionedLocalSchema, LOCAL_SCHEMA_VERSION } = await import('../src/services/localSchema.ts');
const { serializeLocalSqlDatabase } = await import('../src/services/localSqlQueue.ts');
const { LocalDatabaseRuntime } = await import('../src/services/localDatabaseRuntime.ts');
const { runSyncCycle } = await import('../src/services/syncCycle.ts');
const {
  backupLegacyUnassignedData,
  getLegacyUnassignedBackup,
  recordLegacyMigrationChoice,
} = await import('../src/services/legacyLocalData.ts');

class TemporarySqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.schemaMigrationWrites = 0;
  }

  async execute(sql, bindValues = []) {
    if (sql.includes('INSERT OR IGNORE INTO local_schema_migrations')) this.schemaMigrationWrites += 1;
    this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues);
  }

  async select(sql, bindValues = []) {
    return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues);
  }

  close() {
    this.database.close();
  }
}

function createRepositories() {
  const storage = createMemoryStorage();
  return {
    storage,
    first: new LocalRepository('user-a', 'device-1', { storage, now: () => '2026-08-20T00:00:00.000Z' }),
    second: new LocalRepository('user-b', 'device-1', { storage, now: () => '2026-08-20T00:00:00.000Z' }),
  };
}

test('knowledge conflict retains the local draft and requires explicit resolution against the latest cloud version', async (t) => {
  for (const storageType of ['browser', 'sqlite']) {
    await t.test(storageType, async () => {
      const sqlite = storageType === 'sqlite' ? new TemporarySqlite() : null;
      try {
        const repository = new LocalRepository('knowledge-conflict-owner', 'device',
          sqlite ? { sql: sqlite } : { storage: createMemoryStorage() });
        const block = { id: 'block', subjectId: 'subject', title: 'Original', content: 'Original body', version: 2 };
        const local = { ...block, title: 'Draft title', content: 'Draft body' };
        const conflict = { ...block, title: 'Cloud edit', version: 3 };
        const newer = { ...conflict, subjectId: 'moved-subject', sourceId: 'new-source', version: 4 };
        const receipt = { clientMutationId: 'original-update', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
          mutationType: 'UPDATE' };
        const originalPayload = { subjectId: block.subjectId, title: local.title, content: local.content };
        await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: block.version });
        await repository.commitMutation({ resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
          value: local, version: block.version, deletedAt: null, expectedLocalVersion: block.version,
          requireActiveResource: true, mutation: { ...receipt, baseVersion: block.version, payload: originalPayload } });
        await repository.claimPending(1);
        await repository.settleMutation({ ...receipt, status: 'conflict', error: 'RESOURCE_VERSION_CONFLICT',
          remoteValue: conflict, remoteVersion: conflict.version });
        await repository.upsertFromSync('KNOWLEDGE_BLOCK', block.id, newer,
          { version: newer.version, deletedAt: null, syncStatus: 'synced' });
        assert.deepEqual((await repository.read('KNOWLEDGE_BLOCK', block.id)).value, local);
        assert.equal((await repository.listUnresolved('KNOWLEDGE_BLOCK'))[0].remoteVersion, 4);
        const resolution = { blockId: block.id, clientMutationId: receipt.clientMutationId, local };
        await assert.rejects(repository.resolveKnowledgeBlockConflict({ ...resolution, remote: conflict }), LocalConflictError);
        assert.deepEqual((await repository.listUnresolved('KNOWLEDGE_BLOCK'))[0].payload, originalPayload);
        await repository.resolveKnowledgeBlockConflict({ ...resolution, remote: newer, retryId: 'fresh-update' });
        const pending = await repository.listUnresolved('KNOWLEDGE_BLOCK');
        assert.equal(pending.length, 1);
        assert.equal(pending[0].clientMutationId, 'fresh-update');
        assert.equal(pending[0].baseVersion, 4);
        assert.equal(pending[0].payload.subjectId, newer.subjectId);
        assert.equal(pending[0].payload.sourceId, newer.sourceId);
        assert.equal(pending[0].payload.content, local.content);
        const updated = await repository.read('KNOWLEDGE_BLOCK', block.id);
        assert.equal(updated.value.title, local.title);
        assert.equal(updated.version, 4);
        await repository.claimPending(1);
        const cloud = { ...newer, title: 'Another cloud edit', version: 5 };
        await repository.settleMutation({ ...receipt, clientMutationId: 'fresh-update', status: 'conflict',
          error: 'RESOURCE_VERSION_CONFLICT', remoteValue: cloud, remoteVersion: cloud.version });
        await repository.resolveKnowledgeBlockConflict({ blockId: block.id, clientMutationId: 'fresh-update',
          local: updated.value, remote: cloud });
        assert.deepEqual(await repository.listUnresolved('KNOWLEDGE_BLOCK'), []);
        assert.deepEqual((await repository.read('KNOWLEDGE_BLOCK', block.id)).value, cloud);
        assert.equal(await repository.upsertFromSync('KNOWLEDGE_BLOCK', block.id, newer,
          { version: newer.version, deletedAt: null, syncStatus: 'synced' }), false);
        const lastDraft = { ...cloud, content: 'Draft after cloud edit' };
        await repository.commitMutation({ resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
          value: lastDraft, version: cloud.version, deletedAt: null, expectedLocalVersion: cloud.version,
          requireActiveResource: true, mutation: { ...receipt, clientMutationId: 'deleted-update',
            baseVersion: cloud.version, payload: { ...originalPayload, content: lastDraft.content } } });
        await repository.claimPending(1);
        await repository.settleMutation({ ...receipt, clientMutationId: 'deleted-update', status: 'error', error: 'RESOURCE_NOT_FOUND' });
        const deletedAt = '2026-11-13T00:00:00Z';
        const tombstone = { ...cloud, version: 6, deletedAt };
        await repository.upsertFromSync('KNOWLEDGE_BLOCK', block.id, tombstone,
          { version: tombstone.version, deletedAt, syncStatus: 'synced' });
        assert.deepEqual((await repository.read('KNOWLEDGE_BLOCK', block.id)).value, lastDraft);
        const deletionResolution = { blockId: block.id, clientMutationId: 'deleted-update', local: lastDraft, remote: tombstone };
        await assert.rejects(repository.resolveKnowledgeBlockConflict({ ...deletionResolution, retryId: 'bad-update' }), LocalConflictError);
        await repository.resolveKnowledgeBlockConflict(deletionResolution);
        assert.equal((await repository.read('KNOWLEDGE_BLOCK', block.id)).deletedAt, deletedAt);
        assert.deepEqual(await repository.listUnresolved('KNOWLEDGE_BLOCK'), []);
        if (sqlite) {
          const archived = sqlite.database.prepare('SELECT status, base_version, payload FROM local_mutations WHERE client_mutation_id = ?')
            .get(receipt.clientMutationId);
          assert.equal(archived.status, 'rejected');
          assert.equal(archived.base_version, block.version);
          assert.deepEqual(JSON.parse(archived.payload), originalPayload);
        }
      } finally {
        sqlite?.close();
      }
    });
  }
});

test('knowledge delete rejects a stale local view and restores the active cloud version after remote rejection', async (t) => {
  for (const storageType of ['browser', 'sqlite']) {
    await t.test(storageType, async () => {
      const sqlite = storageType === 'sqlite' ? new TemporarySqlite() : null;
      try {
        const repository = new LocalRepository('knowledge-delete-owner', 'device',
          sqlite ? { sql: sqlite } : { storage: createMemoryStorage() });
        const block = { id: 'block', subjectId: 'subject', title: 'Original', content: 'Original body', version: 2 };
        const deletedAt = '2026-11-13T00:00:00Z';
        const receipt = { clientMutationId: 'stale-delete', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
          mutationType: 'DELETE' };
        const commitDelete = (version) => repository.commitMutation({ resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
          value: { ...block, deletedAt }, version, deletedAt, expectedLocalVersion: version, requireActiveResource: true,
          mutation: { ...receipt, baseVersion: version, payload: { id: block.id } } });
        await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: block.version });
        await assert.rejects(commitDelete(1), LocalConflictError);
        assert.equal((await repository.read('KNOWLEDGE_BLOCK', block.id)).deletedAt, null);
        assert.deepEqual(await repository.listUnresolved('KNOWLEDGE_BLOCK'), []);
        await commitDelete(block.version);
        await repository.claimPending(1);
        const current = { ...block, title: 'Current cloud title', version: 3 };
        await repository.settleMutation({ ...receipt, status: 'conflict', error: 'RESOURCE_VERSION_CONFLICT',
          remoteValue: current, remoteVersion: current.version });
        const restored = await repository.read('KNOWLEDGE_BLOCK', block.id);
        assert.equal(restored.deletedAt, null);
        assert.equal(restored.syncStatus, 'synced');
        assert.deepEqual(restored.value, current);
        assert.deepEqual(await repository.listUnresolved('KNOWLEDGE_BLOCK'), []);
        await repository.commitMutation({ resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
          value: { ...current, deletedAt }, version: current.version, deletedAt, expectedLocalVersion: current.version,
          requireActiveResource: true, mutation: { ...receipt, clientMutationId: 'new-delete', baseVersion: current.version,
            payload: { id: block.id } } });
        await repository.claimPending(1);
        await repository.settleMutation({ ...receipt, clientMutationId: 'new-delete', status: 'error', error: 'RESOURCE_NOT_FOUND' });
        assert.equal((await repository.read('KNOWLEDGE_BLOCK', block.id)).deletedAt, deletedAt);
        assert.deepEqual(await repository.listUnresolved('KNOWLEDGE_BLOCK'), []);
      } finally {
        sqlite?.close();
      }
    });
  }
});

function createSharedBrowserLockManager() {
  let tail = Promise.resolve();
  return {
    request(_name, _options, callback) {
      const previous = tail;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      tail = previous.then(() => gate);
      return previous.then(async () => {
        try {
          return await callback({ mode: 'exclusive' });
        } finally {
          release();
        }
      });
    },
  };
}

function createReadInterleavingStorage() {
  const backing = createMemoryStorage();
  let onNextRead = null;
  return {
    storage: {
      getItem(key) {
        const value = backing.getItem(key);
        const callback = onNextRead;
        onNextRead = null;
        callback?.();
        return value;
      },
      setItem: backing.setItem.bind(backing),
      removeItem: backing.removeItem.bind(backing),
      key: backing.key.bind(backing),
      get length() { return backing.length; },
    },
    beforeNextRead(callback) { onNextRead = callback; },
  };
}

test('browser fallback isolates two users on the same device namespace', async () => {
  const { storage, first, second } = createRepositories();

  await first.upsert('SUBJECT', 'subject-1', { name: 'Calculus' }, { version: 3 });

  assert.equal((await first.read('SUBJECT', 'subject-1'))?.value.name, 'Calculus');
  assert.equal(await second.read('SUBJECT', 'subject-1'), null);
  assert.equal(storage.length, 1);
  assert.match(storage.key(0), /^auralis:v2:user-a:device-1:state$/);
});

test('SQLite schema and repository keep user predicates and user rows isolated', async () => {
  const sqlite = new TemporarySqlite();
  try {
    const first = new LocalRepository('user-a', 'device-1', { sql: sqlite });
    const second = new LocalRepository('user-b', 'device-1', { sql: sqlite });

    await first.upsert('TASK', 'task-1', { title: 'Read' }, { version: 2 });
    await second.upsert('TASK', 'task-1', { title: 'Write' }, { version: 4 });
    await first.enqueueMutation({ clientMutationId: 'same-id', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 2, payload: { title: 'Read more' } });
    await second.enqueueMutation({ clientMutationId: 'same-id', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 4, payload: { title: 'Write more' } });

    assert.equal((await first.read('TASK', 'task-1'))?.value.title, 'Read');
    assert.equal((await second.read('TASK', 'task-1'))?.value.title, 'Write');
    assert.equal((await first.listPending())[0]?.userId, 'user-a');
    assert.equal((await second.listPending())[0]?.userId, 'user-b');

    const tables = sqlite.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    assert.ok(tables.includes('sync_metadata'));
    assert.ok(tables.includes('local_resource_records'));
    assert.ok(tables.includes('local_mutations'));

    const metadataColumns = sqlite.database
      .prepare('PRAGMA table_info(sync_metadata)')
      .all()
      .map((row) => row.name);
    assert.deepEqual(metadataColumns.slice(0, 2), ['user_id', 'device_id']);
  } finally {
    sqlite.close();
  }
});

test('preinitialized SQLite schema is reused by repositories without repeating DDL', async () => {
  const sqlite = new TemporarySqlite();
  try {
    await createVersionedLocalSchema(sqlite);
    const schemaReady = Promise.resolve();
    const first = new LocalRepository('user-a', 'device-1', { sql: sqlite, schemaReady });
    const second = new LocalRepository('user-b', 'device-1', { sql: sqlite, schemaReady });

    await Promise.all([
      first.upsert('TASK', 'task-1', { title: 'One' }),
      second.upsert('TASK', 'task-2', { title: 'Two' }),
    ]);

    assert.equal(sqlite.schemaMigrationWrites, 1);
  } finally {
    sqlite.close();
  }
});

test('serialized local SQL adapter never executes concurrent commands', async () => {
  let active = 0;
  let maxActive = 0;
  const events = [];
  const raw = {
    async execute(sql) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push(`start:${sql}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end:${sql}`);
      active -= 1;
    },
    async select() {
      return [];
    },
  };

  const sql = serializeLocalSqlDatabase(raw);
  await Promise.all([sql.execute('first'), sql.execute('second')]);

  assert.equal(maxActive, 1);
  assert.deepEqual(events, ['start:first', 'end:first', 'start:second', 'end:second']);
});

test('local database runtime loads once and returns one repository per scope', async () => {
  const runtime = new LocalDatabaseRuntime();
  let loads = 0;
  const load = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { name: 'auralis.db' };
  };

  const [firstDatabase, secondDatabase] = await Promise.all([runtime.initialize(load), runtime.initialize(load)]);
  const firstRepository = runtime.getOrCreate('user-a:device-1', () => ({ id: 'first' }));
  const secondRepository = runtime.getOrCreate('user-a:device-1', () => ({ id: 'second' }));

  assert.equal(loads, 1);
  assert.equal(firstDatabase, secondDatabase);
  assert.equal(firstRepository, secondRepository);
});

test('saveCursor persists the current local schema version', async () => {
  const sqlite = new TemporarySqlite();
  try {
    const repository = new LocalRepository('user-a', 'device-1', { sql: sqlite });
    await repository.saveCursor('cursor-1');

    const row = sqlite.database
      .prepare('SELECT schema_version FROM sync_metadata WHERE user_id = ? AND device_id = ?')
      .get('user-a', 'device-1');
    assert.equal(row.schema_version, LOCAL_SCHEMA_VERSION);
  } finally {
    sqlite.close();
  }
});

test('SQLite legacy account-less rows are copied to unassigned backup without deletion', async () => {
  const sqlite = new TemporarySqlite();
  try {
    await sqlite.execute('CREATE TABLE subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    await sqlite.execute('INSERT INTO subjects (id, name) VALUES ($1, $2)', ['old-1', 'Unassigned']);

    const repository = new LocalRepository('user-a', 'device-1', { sql: sqlite });
    await repository.getSyncState();

    const backup = sqlite.database
      .prepare('SELECT source_table, source_id, payload FROM legacy_unassigned_records')
      .all();
    assert.deepEqual(backup.map((row) => ({ ...row })), [{ source_table: 'subjects', source_id: 'old-1', payload: JSON.stringify({ id: 'old-1', name: 'Unassigned' }) }]);
    assert.equal(sqlite.database.prepare('SELECT COUNT(*) AS count FROM subjects').get().count, 1);
  } finally {
    sqlite.close();
  }
});

test('PC SQLite startup retries failed schema initialization without creating or altering retired business tables', async (t) => {
  const sqlite = new TemporarySqlite();
  const previousWindow = globalThis.window;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    sqlite.close();
  });

  await sqlite.execute('CREATE TABLE subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT)');
  await sqlite.execute('INSERT INTO subjects VALUES ($1, $2, $3)', ['old-1', 'Unassigned', '#123456']);

  const sqliteBusy = new Error('database is locked');
  let loads = 0;
  globalThis.window = {
    __TAURI_INTERNALS__: {
      async invoke(command, args) {
        switch (command) {
          case 'plugin:sql|load':
            loads += 1;
            return args.db;
          case 'initialize_local_database_pool':
            return;
          case 'plugin:sql|execute':
            if (loads === 1 && args.query.includes('INSERT OR IGNORE INTO local_schema_migrations')) throw sqliteBusy;
            await sqlite.execute(args.query, args.values);
            return [0, null];
          case 'plugin:sql|select':
            return sqlite.select(args.query, args.values);
          default:
            throw new Error(`Unexpected Tauri command: ${command}`);
        }
      },
    },
  };

  const { getLocalAssetRepository, getLocalRepository, getLocalSqlDatabase } = await import('../src/services/localDb.ts');
  await assert.rejects(getLocalAssetRepository('user-a', 'device-1'), sqliteBusy);
  assert.throws(getLocalSqlDatabase, /LOCAL_DATABASE_NOT_INITIALIZED/);
  const repository = await getLocalRepository('user-a', 'device-1');
  assert.equal(loads, 2);
  await repository.upsert('SUBJECT', 'current-1', { name: 'Active' }, { version: 1 });

  assert.equal((await repository.read('SUBJECT', 'current-1'))?.value.name, 'Active');
  assert.equal(await repository.read('SUBJECT', 'old-1'), null);
  assert.equal((await sqlite.select('SELECT version FROM local_schema_migrations'))[0]?.version, LOCAL_SCHEMA_VERSION);
  assert.deepEqual(
    (await sqlite.select('SELECT id, name, color FROM subjects')).map((row) => ({ ...row })),
    [{ id: 'old-1', name: 'Unassigned', color: '#123456' }],
  );
  const tables = (await sqlite.select("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => row.name);
  const retiredTables = ['legacy_sync_metadata', 'legacy_local_mutations', 'knowledge_blocks', 'task_blocks', 'chat_sessions', 'chat_messages', 'source_files'];
  assert.deepEqual(tables.filter((name) => retiredTables.includes(name)), []);
});

test('tombstone remains readable and stale baseVersion returns a conflict', async () => {
  const { first } = createRepositories();
  await first.upsert('KNOWLEDGE_BLOCK', 'block-1', { title: 'Limits' }, { version: 7 });

  const tombstone = await first.tombstone('KNOWLEDGE_BLOCK', 'block-1', {
    baseVersion: 7,
    deletedAt: '2026-08-20T01:00:00.000Z',
  });
  assert.equal(tombstone.deletedAt, '2026-08-20T01:00:00.000Z');
  assert.equal(tombstone.syncStatus, 'pending');
  assert.equal((await first.list('KNOWLEDGE_BLOCK')).length, 1);
  assert.equal((await first.list('KNOWLEDGE_BLOCK', { includeDeleted: false })).length, 0);

  await assert.rejects(
    first.upsert('KNOWLEDGE_BLOCK', 'block-1', { title: 'Stale update' }, { baseVersion: 6 }),
    (error) => error instanceof LocalConflictError && error.code === 'LOCAL_VERSION_CONFLICT',
  );
});

test('snapshot reset replaces remote rows while preserving pending payload and mutation', async () => {
  const { first } = createRepositories();
  await first.upsert('TASK', 'task-1', { title: 'Local edit' }, { version: 5, syncStatus: 'pending' });
  await first.enqueueMutation({
    clientMutationId: 'mutation-1',
    resourceType: 'TASK',
    resourceId: 'task-1',
    mutationType: 'UPDATE',
    baseVersion: 5,
    payload: { title: 'Local edit' },
  });

  await first.replaceSnapshotPreservingPending([
    { resourceType: 'TASK', resourceId: 'task-1', version: 6, deletedAt: null, value: { title: 'Remote edit' } },
    { resourceType: 'SUBJECT', resourceId: 'subject-1', version: 2, deletedAt: null, value: { name: 'Physics' } },
  ]);

  assert.equal((await first.read('TASK', 'task-1'))?.value.title, 'Local edit');
  assert.equal((await first.read('SUBJECT', 'subject-1'))?.value.name, 'Physics');
  assert.deepEqual((await first.listPending()).map((item) => item.clientMutationId), ['mutation-1']);
});

test('snapshot replacement cannot hide a schedule command committed during snapshot fencing', async () => {
  const { first: repository } = createRepositories();
  await repository.upsert('TASK', 'task-race', { id: 'task-race', scheduledAt: null }, { version: 2 });

  const snapshot = repository.replaceSnapshotPreservingPending([
    { resourceType: 'TASK', resourceId: 'task-race', version: 3, deletedAt: null, value: { id: 'task-race', scheduledAt: 'remote' } },
  ]);
  const schedule = repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-race', value: { id: 'task-race', scheduledAt: 'optimistic' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-race', clientMutationId: 'schedule-race',
      mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
      payload: { _localAffectedTaskIds: ['task-race'] },
    },
  });

  const [snapshotResult, scheduleResult] = await Promise.allSettled([snapshot, schedule]);
  assert.equal(snapshotResult.status, 'fulfilled');
  const row = await repository.read('TASK', 'task-race');
  const pending = await repository.listPending('TASK');
  if (scheduleResult.status === 'fulfilled') {
    assert.equal(row.value.scheduledAt, 'optimistic');
    assert.deepEqual(pending.map((item) => item.clientMutationId), ['schedule-race']);
  } else {
    assert.ok(scheduleResult.reason instanceof LocalConflictError);
    assert.equal(row.value.scheduledAt, 'remote');
    assert.deepEqual(pending, []);
  }
});

test('browser snapshot and schedule commit serialize across repository instances sharing localStorage', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks: createSharedBrowserLockManager() },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  try {
    const interleavingStorage = createReadInterleavingStorage();
    const first = new LocalRepository('user-a', 'device-shared', { storage: interleavingStorage.storage });
    const second = new LocalRepository('user-a', 'device-shared', { storage: interleavingStorage.storage });
    await first.upsert('TASK', 'task-cross-tab', { id: 'task-cross-tab', scheduledAt: null }, { version: 2 });

    let schedulePromise;
    interleavingStorage.beforeNextRead(() => {
      schedulePromise = second.commitScheduleMutation({
        items: [
          { resourceType: 'TASK', resourceId: 'task-cross-tab', value: { id: 'task-cross-tab', scheduledAt: 'optimistic' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
        ],
        mutation: {
          resourceType: 'TASK', resourceId: 'task-cross-tab', clientMutationId: 'schedule-cross-tab',
          mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
          payload: { _localAffectedTaskIds: ['task-cross-tab'] },
        },
      });
    });

    await first.replaceSnapshotPreservingPending([
      { resourceType: 'TASK', resourceId: 'task-cross-tab', version: 3, deletedAt: null, value: { id: 'task-cross-tab', scheduledAt: 'remote' } },
    ]);
    const scheduleResult = await Promise.allSettled([schedulePromise]);
    const row = await first.read('TASK', 'task-cross-tab');

    assert.equal(scheduleResult[0].status, 'rejected');
    assert.ok(scheduleResult[0].reason instanceof LocalConflictError);
    assert.equal(row.value.scheduledAt, 'remote');
    assert.deepEqual(await first.listPending('TASK'), []);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});

test('browser localStorage writes fail closed when Web Locks is unavailable', async () => {
  const { storage, first } = createRepositories();
  await first.upsert('TASK', 'task-no-lock', { id: 'task-no-lock', title: 'Original' }, { version: 2 });

  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  try {
    const browserRepository = new LocalRepository('user-a', 'device-1', { storage });
    await assert.rejects(
      browserRepository.upsert('TASK', 'task-no-lock', { id: 'task-no-lock', title: 'Must stay unchanged' }, { version: 2 }),
      (error) => error?.code === 'LOCAL_STORAGE_LOCK_UNAVAILABLE',
    );
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }

  assert.equal((await first.read('TASK', 'task-no-lock')).value.title, 'Original');
});

test('browser schedule commit does not overwrite a concurrent local repository state update', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks: createSharedBrowserLockManager() },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  try {
    const interleavingStorage = createReadInterleavingStorage();
    const first = new LocalRepository('user-a', 'device-sync', { storage: interleavingStorage.storage });
    const second = new LocalRepository('user-a', 'device-sync', { storage: interleavingStorage.storage });
    await first.upsert('TASK', 'task-sync', { id: 'task-sync', scheduledAt: null }, { version: 2 });

    let cursorPromise;
    interleavingStorage.beforeNextRead(() => {
      cursorPromise = second.saveCursor('cursor-from-other-tab');
    });
    await first.commitScheduleMutation({
      items: [
        { resourceType: 'TASK', resourceId: 'task-sync', value: { id: 'task-sync', scheduledAt: 'optimistic' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      ],
      mutation: {
        resourceType: 'TASK', resourceId: 'task-sync', clientMutationId: 'schedule-sync-race',
        mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
        payload: { _localAffectedTaskIds: ['task-sync'] },
      },
    });
    await cursorPromise;

    assert.equal((await first.read('TASK', 'task-sync')).value.scheduledAt, 'optimistic');
    assert.equal((await first.getSyncState()).cursor, 'cursor-from-other-tab');
    assert.deepEqual((await first.listPending('TASK')).map((item) => item.clientMutationId), ['schedule-sync-race']);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});

test('SQL snapshot reset replaces remote rows through the repository transaction', async () => {
  const sqlite = new TemporarySqlite();
  try {
    await createVersionedLocalSchema(sqlite);
    const repository = new LocalRepository('user-a', 'device-1', {
      sql: serializeLocalSqlDatabase(sqlite),
      schemaReady: Promise.resolve(),
    });
    const snapshot = [
      { resourceType: 'SUBJECT', resourceId: 'subject-1', version: 1, deletedAt: null, value: { name: 'Physics' } },
    ];

    await repository.replaceSnapshotPreservingPending(snapshot);

    assert.equal((await repository.read('SUBJECT', 'subject-1'))?.value.name, 'Physics');
  } finally {
    sqlite.close();
  }
});

test('SQLite snapshot replacement cannot hide a concurrent schedule command', async () => {
  const sqlite = new TemporarySqlite();
  try {
    await createVersionedLocalSchema(sqlite);
    const repository = new LocalRepository('user-a', 'device-1', {
      sql: serializeLocalSqlDatabase(sqlite),
      schemaReady: Promise.resolve(),
    });
    await repository.upsert('TASK', 'task-race', { id: 'task-race', scheduledAt: null }, { version: 2 });

    const snapshot = repository.replaceSnapshotPreservingPending([
      { resourceType: 'TASK', resourceId: 'task-race', version: 3, deletedAt: null, value: { id: 'task-race', scheduledAt: 'remote' } },
    ]);
    const schedule = repository.commitScheduleMutation({
      items: [
        { resourceType: 'TASK', resourceId: 'task-race', value: { id: 'task-race', scheduledAt: 'optimistic' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      ],
      mutation: {
        resourceType: 'TASK', resourceId: 'task-race', clientMutationId: 'schedule-race',
        mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
        payload: { _localAffectedTaskIds: ['task-race'] },
      },
    });

    const [snapshotResult, scheduleResult] = await Promise.allSettled([snapshot, schedule]);
    assert.equal(snapshotResult.status, 'fulfilled');
    const row = await repository.read('TASK', 'task-race');
    const pending = await repository.listPending('TASK');
    if (scheduleResult.status === 'fulfilled') {
      assert.equal(row.value.scheduledAt, 'optimistic');
      assert.deepEqual(pending.map((item) => item.clientMutationId), ['schedule-race']);
    } else {
      assert.ok(scheduleResult.reason instanceof LocalConflictError);
      assert.equal(row.value.scheduledAt, 'remote');
      assert.deepEqual(pending, []);
    }
  } finally {
    sqlite.close();
  }
});

test('coalesces pending local writes per resource without changing their server base version', async () => {
  const { first } = createRepositories();

  await first.enqueueMutation({
    clientMutationId: 'update-1', resourceType: 'TASK', resourceId: 'task-1',
    mutationType: 'UPDATE', baseVersion: 4, payload: { title: 'First local edit' },
  });
  await first.enqueueMutation({
    clientMutationId: 'update-2', resourceType: 'TASK', resourceId: 'task-1',
    mutationType: 'UPDATE', baseVersion: 4, payload: { title: 'Latest local edit' },
  });
  await first.enqueueMutation({
    clientMutationId: 'delete-1', resourceType: 'TASK', resourceId: 'task-1',
    mutationType: 'DELETE', baseVersion: 4, payload: { id: 'task-1' },
  });

  const taskMutations = await first.listPending('TASK');
  assert.deepEqual(taskMutations.map((mutation) => ({
    clientMutationId: mutation.clientMutationId,
    mutationType: mutation.mutationType,
    baseVersion: mutation.baseVersion,
    payload: mutation.payload,
  })), [{
    clientMutationId: 'update-1', mutationType: 'DELETE', baseVersion: 4, payload: { id: 'task-1', _localCrudPredecessor: null },
  }]);

  await first.enqueueMutation({
    clientMutationId: 'create-1', resourceType: 'SOURCE', resourceId: 'source-1',
    mutationType: 'CREATE', baseVersion: 0, payload: { title: 'Original title' },
  });
  await first.enqueueMutation({
    clientMutationId: 'update-3', resourceType: 'SOURCE', resourceId: 'source-1',
    mutationType: 'UPDATE', baseVersion: 0, payload: { title: 'Latest title' },
  });

  const sourceMutations = await first.listPending('SOURCE');
  assert.deepEqual(sourceMutations.map((mutation) => ({
    clientMutationId: mutation.clientMutationId,
    mutationType: mutation.mutationType,
    baseVersion: mutation.baseVersion,
    payload: mutation.payload,
  })), [{
    clientMutationId: 'create-1', mutationType: 'CREATE', baseVersion: 0, payload: { title: 'Latest title', _localCrudPredecessor: null },
  }]);
});

test('server swap batch rolls back the first task when the second write fails, then cursor pull repairs both', async () => {
  const sqlite = new TemporarySqlite();
  try {
    const repository = new LocalRepository('user-a', 'device-1', { sql: sqlite });
    const originalSource = { id: 'source-task', title: 'Source', status: 'TODO', scheduledAt: '2026-09-27T09:00:00.000Z' };
    const originalTarget = { id: 'target-task', title: 'Target', status: 'TODO', scheduledAt: '2026-09-27T10:00:00.000Z' };
    const swappedSource = { ...originalSource, scheduledAt: originalTarget.scheduledAt, version: 4 };
    const swappedTarget = { ...originalTarget, scheduledAt: originalSource.scheduledAt, version: 5 };
    await repository.upsert('TASK', originalSource.id, originalSource, { version: 3 });
    await repository.upsert('TASK', originalTarget.id, originalTarget, { version: 4 });
    await repository.upsert('TASK', 'unrelated-task', { id: 'unrelated-task', title: 'Keep local conflict' }, { version: 2 });
    await repository.saveCursor('cursor-before-swap');
    await repository.enqueueMutation({
      clientMutationId: 'unrelated-conflict', resourceType: 'TASK', resourceId: 'unrelated-task',
      mutationType: 'UPDATE', baseVersion: 2, payload: { title: 'Local conflict' },
    });
    const [claimed] = await repository.claimPending(1);
    await repository.settleMutation({
      ...claimed, status: 'conflict', error: 'RESOURCE_VERSION_CONFLICT', remoteVersion: 3,
    });
    const unresolvedBefore = await repository.listUnresolved();

    sqlite.database.exec(`
      CREATE TRIGGER fail_second_task_upsert
      BEFORE INSERT ON local_resource_records
      WHEN NEW.resource_type = 'TASK' AND NEW.resource_id = 'target-task'
      BEGIN SELECT RAISE(ABORT, 'injected second task write failure'); END;
    `);
    await assert.rejects(repository.upsertSyncedBatch([
      { resourceType: 'TASK', resourceId: originalSource.id, version: 4, deletedAt: null, value: swappedSource },
      { resourceType: 'TASK', resourceId: originalTarget.id, version: 5, deletedAt: null, value: swappedTarget },
    ]), /injected second task write failure/);

    assert.equal((await repository.read('TASK', originalSource.id)).value.scheduledAt, originalSource.scheduledAt);
    assert.equal((await repository.read('TASK', originalTarget.id)).value.scheduledAt, originalTarget.scheduledAt);
    assert.equal((await repository.getSyncState()).cursor, 'cursor-before-swap');
    assert.deepEqual(await repository.listUnresolved(), unresolvedBefore, 'failed local persistence must leave the outbox untouched');

    sqlite.database.exec('DROP TRIGGER fail_second_task_upsert');
    const changes = [
      { cursor: 'cursor-swap-1', resourceType: 'TASK', resourceId: originalSource.id, mutationType: 'UPDATE', version: 4, deletedAt: null, payload: swappedSource, createdAt: null },
      { cursor: 'cursor-swap-2', resourceType: 'TASK', resourceId: originalTarget.id, mutationType: 'UPDATE', version: 5, deletedAt: null, payload: swappedTarget, createdAt: null },
    ];
    await runSyncCycle({
      repository,
      serverDeviceId: 'device-1',
      api: {
        async pushChanges() { return { results: [], serverCursor: 'cursor-swap-2' }; },
        async pullChanges(input) {
          assert.equal(input.cursor, 'cursor-before-swap');
          return { changes, nextCursor: 'cursor-after-swap', hasMore: false, resetRequired: false };
        },
        async getSnapshot() { assert.fail('existing cursor should recover through incremental pull'); },
      },
    });

    assert.equal((await repository.read('TASK', originalSource.id)).value.scheduledAt, swappedSource.scheduledAt);
    assert.equal((await repository.read('TASK', originalTarget.id)).value.scheduledAt, swappedTarget.scheduledAt);
    assert.equal((await repository.getSyncState()).cursor, 'cursor-after-swap');
    assert.deepEqual((await repository.listUnresolved()).map(({ clientMutationId, status }) => ({ clientMutationId, status })), [
      { clientMutationId: 'unrelated-conflict', status: 'conflict' },
    ]);
  } finally {
    sqlite.close();
  }
});

test('server batch refuses to overwrite either task when either has an unresolved outbox mutation', async () => {
  const sqlite = new TemporarySqlite();
  try {
    const repository = new LocalRepository('user-a', 'device-1', { sql: sqlite });
    const source = { id: 'source-task', scheduledAt: '2026-09-27T09:00:00.000Z' };
    const target = { id: 'target-task', scheduledAt: '2026-09-27T10:00:00.000Z' };
    await repository.upsert('TASK', source.id, source, { version: 3 });
    await repository.upsert('TASK', target.id, target, { version: 4 });
    await repository.saveCursor('cursor-before-swap');
    await repository.enqueueMutation({
      clientMutationId: 'target-edit', resourceType: 'TASK', resourceId: target.id,
      mutationType: 'UPDATE', baseVersion: 4, payload: { title: 'Offline edit' },
    });

    const persisted = await repository.upsertSyncedBatch([
      { resourceType: 'TASK', resourceId: source.id, version: 4, deletedAt: null, value: { ...source, scheduledAt: target.scheduledAt } },
      { resourceType: 'TASK', resourceId: target.id, version: 5, deletedAt: null, value: { ...target, scheduledAt: source.scheduledAt } },
    ]);

    assert.equal(persisted, false);
    assert.equal((await repository.read('TASK', source.id)).value.scheduledAt, source.scheduledAt);
    assert.equal((await repository.read('TASK', target.id)).value.scheduledAt, target.scheduledAt);
    assert.equal((await repository.getSyncState()).cursor, 'cursor-before-swap');
    assert.deepEqual((await repository.listUnresolved()).map(({ clientMutationId, status }) => ({ clientMutationId, status })), [
      { clientMutationId: 'target-edit', status: 'pending' },
    ]);
  } finally {
    sqlite.close();
  }
});

test('browser storage applies a server batch through one state write', async () => {
  const storage = createMemoryStorage();
  const repository = new LocalRepository('user-a', 'device-1', { storage });
  const source = { id: 'source-task', scheduledAt: '2026-09-27T09:00:00.000Z' };
  const target = { id: 'target-task', scheduledAt: '2026-09-27T10:00:00.000Z' };
  await repository.upsert('TASK', source.id, source, { version: 3 });
  await repository.upsert('TASK', target.id, target, { version: 4 });
  const stateKey = storage.key(0);
  const originalState = storage.getItem(stateKey);
  const originalSetItem = storage.setItem.bind(storage);
  let writeCount = 0;
  storage.setItem = (key, value) => {
    if (key === stateKey) writeCount += 1;
    if (writeCount === 1) throw new Error('injected state commit failure');
    originalSetItem(key, value);
  };

  await assert.rejects(repository.upsertSyncedBatch([
    { resourceType: 'TASK', resourceId: source.id, version: 4, deletedAt: null, value: { ...source, scheduledAt: target.scheduledAt } },
    { resourceType: 'TASK', resourceId: target.id, version: 5, deletedAt: null, value: { ...target, scheduledAt: source.scheduledAt } },
  ]), /injected state commit failure/);

  storage.setItem = originalSetItem;
  assert.equal(storage.getItem(stateKey), originalState);
  assert.equal((await repository.read('TASK', source.id)).value.scheduledAt, source.scheduledAt);
  assert.equal((await repository.read('TASK', target.id)).value.scheduledAt, target.scheduledAt);
});

test('commitMutation writes the resource projection and outbox row together', async () => {
  const { first } = createRepositories();

  await first.commitMutation({
    resourceType: 'TASK',
    resourceId: 'task-1',
    value: { id: 'task-1', title: 'Local' },
    version: 0,
    deletedAt: null,
    mutation: {
      clientMutationId: 'task-create-1',
      resourceType: 'TASK',
      resourceId: 'task-1',
      mutationType: 'CREATE',
      baseVersion: 0,
      payload: { id: 'task-1', title: 'Local' },
    },
  });

  assert.equal((await first.read('TASK', 'task-1'))?.syncStatus, 'pending');
  assert.deepEqual((await first.listPending()).map((item) => item.clientMutationId), ['task-create-1']);
});

test('commitMutation can fence an automatic completion against a newer local projection', async () => {
  const sqlite = new TemporarySqlite();
  const repositories = [
    new LocalRepository('user-a', 'device-memory', { storage: createMemoryStorage() }),
    new LocalRepository('user-a', 'device-sqlite', { sql: sqlite }),
  ];

  try {
    for (const repository of repositories) {
      await repository.upsert('TASK', 'task-1', { id: 'task-1', status: 'TODO', scheduledAt: '2026-09-25T09:00:00.000Z' }, {
        version: 5,
        syncStatus: 'synced',
      });

      await assert.rejects(repository.commitMutation({
        resourceType: 'TASK',
        resourceId: 'task-1',
        value: { id: 'task-1', status: 'DONE', scheduledAt: '2026-09-25T09:00:00.000Z' },
        version: 4,
        deletedAt: null,
        expectedLocalVersion: 4,
        mutation: {
          clientMutationId: 'stale-auto-completion',
          resourceType: 'TASK',
          resourceId: 'task-1',
          mutationType: 'UPDATE',
          baseVersion: 4,
          payload: { status: 'DONE' },
        },
      }), LocalConflictError);

      assert.equal((await repository.read('TASK', 'task-1'))?.version, 5);
      assert.equal((await repository.listPending('TASK')).length, 0);
    }
  } finally {
    sqlite.close();
  }
});

test('commitMutation with requireActiveResource atomically rejects if the resource projection is deleted, keeping existing tombstone and outbox untouched', async () => {
  const sqlite = new TemporarySqlite();
  const repositories = [
    new LocalRepository('user-a', 'device-memory-active', { storage: createMemoryStorage() }),
    new LocalRepository('user-a', 'device-sqlite-active', { sql: sqlite }),
  ];

  try {
    for (const repository of repositories) {
      await repository.upsert('TASK', 'task-active-1', { id: 'task-active-1', status: 'TODO' }, { version: 5 });
      await repository.tombstone('TASK', 'task-active-1', { deletedAt: '2026-10-06T15:00:00.000Z', version: 5 });

      await assert.rejects(repository.commitMutation({
        resourceType: 'TASK', resourceId: 'task-active-1', value: { id: 'task-active-1', status: 'DONE' },
        version: 5, deletedAt: null, expectedLocalVersion: 5, requireActiveResource: true,
        mutation: { clientMutationId: 'stale-auto', resourceType: 'TASK', resourceId: 'task-active-1', mutationType: 'UPDATE', baseVersion: 5, payload: { status: 'DONE' } },
      }), LocalConflictError);

      assert.ok((await repository.read('TASK', 'task-active-1'))?.deletedAt);
      assert.deepEqual(await repository.listUnresolved('TASK'), []);

      await repository.upsert('TASK', 'task-active-2', { id: 'task-active-2', status: 'TODO' }, { version: 5 });
      await repository.commitMutation({
        resourceType: 'TASK', resourceId: 'task-active-2', value: { id: 'task-active-2', status: 'DONE' },
        version: 5, deletedAt: null, expectedLocalVersion: 5, requireActiveResource: true,
        mutation: { clientMutationId: 'valid-auto', resourceType: 'TASK', resourceId: 'task-active-2', mutationType: 'UPDATE', baseVersion: 5, payload: { status: 'DONE' } },
      });
      assert.equal((await repository.read('TASK', 'task-active-2'))?.value.status, 'DONE');

      await repository.upsert('TASK', 'task-active-3', { id: 'task-active-3', status: 'TODO' }, { version: 5 });
      await repository.tombstone('TASK', 'task-active-3', { deletedAt: '2026-10-06T15:00:00.000Z', version: 5 });
      await repository.commitMutation({
        resourceType: 'TASK', resourceId: 'task-active-3', value: { id: 'task-active-3', status: 'DONE' },
        version: 5, deletedAt: null, expectedLocalVersion: 5,
        mutation: { clientMutationId: 'no-option', resourceType: 'TASK', resourceId: 'task-active-3', mutationType: 'UPDATE', baseVersion: 5, payload: { status: 'DONE' } },
      });
      assert.equal((await repository.read('TASK', 'task-active-3'))?.deletedAt, null);
    }
  } finally {
    sqlite.close();
  }
});

test('commitMutation atomically rejects auto completion after its pending mutation becomes inflight', async () => {
  const sqlite = new TemporarySqlite();
  const repositories = [
    new LocalRepository('user-a', 'device-memory-claim', { storage: createMemoryStorage() }),
    new LocalRepository('user-a', 'device-sqlite-claim', { sql: sqlite }),
  ];

  try {
    for (const repository of repositories) {
      await repository.upsert('TASK', 'task-1', { id: 'task-1', status: 'TODO', title: 'Local edit' }, { version: 4 });
      await repository.commitMutation({
        resourceType: 'TASK', resourceId: 'task-1', value: { id: 'task-1', status: 'TODO', title: 'Local edit' },
        version: 4, deletedAt: null,
        mutation: { clientMutationId: 'user-edit', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 4, payload: { title: 'Local edit' } },
      });
      assert.deepEqual((await repository.claimPending(1)).map((item) => item.status), ['inflight']);

      await assert.rejects(repository.commitMutation({
        resourceType: 'TASK', resourceId: 'task-1', value: { id: 'task-1', status: 'DONE', title: 'Local edit' },
        version: 4, deletedAt: null,
        expectedLocalVersion: 4,
        rejectIfNonPendingMutation: true,
        mutation: { clientMutationId: 'automatic-completion', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 4, payload: { status: 'DONE' } },
      }), LocalConflictError);

      assert.equal((await repository.read('TASK', 'task-1'))?.value.status, 'TODO');
      assert.deepEqual((await repository.listUnresolved('TASK')).map((item) => item.clientMutationId), ['user-edit']);
    }
  } finally {
    sqlite.close();
  }
});

test('upsertFromSync preserves a local mutation that appears after pull preflight', async () => {
  const sqlite = new TemporarySqlite();
  const repositories = [
    new LocalRepository('user-a', 'device-memory-pull', { storage: createMemoryStorage() }),
    new LocalRepository('user-a', 'device-sqlite-pull', { sql: sqlite }),
  ];

  try {
    for (const repository of repositories) {
      await repository.upsert('TASK', 'task-1', { id: 'task-1', status: 'TODO', title: 'Remote v4' }, { version: 4, syncStatus: 'synced' });
      const applied = await repository.upsertFromSync('TASK', 'task-1', { id: 'task-1', status: 'TODO', title: 'Remote v5' }, {
        version: 5, deletedAt: null, syncStatus: 'synced',
      });
      assert.equal(applied, true);

      await repository.commitMutation({
        resourceType: 'TASK', resourceId: 'task-1', value: { id: 'task-1', status: 'DONE', title: 'Local v5' },
        version: 5, deletedAt: null,
        mutation: { clientMutationId: 'local-auto', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 5, payload: { status: 'DONE' } },
      });
      const pulledAgain = await repository.upsertFromSync('TASK', 'task-1', { id: 'task-1', status: 'TODO', title: 'Stale remote' }, {
        version: 6, deletedAt: null, syncStatus: 'synced',
      });

      assert.equal(pulledAgain, false);
      assert.equal((await repository.read('TASK', 'task-1'))?.value.status, 'DONE');
      assert.equal((await repository.read('TASK', 'task-1'))?.value.title, 'Local v5');
    }
  } finally {
    sqlite.close();
  }
});

for (const backend of ['browser', 'sqlite']) {
  test(`${backend}: ordinary sync replays an unknown request and only the first matching receipt advances its successor`, async () => {
    const sqlite = backend === 'sqlite' ? new TemporarySqlite() : null;
    const storage = createMemoryStorage();
    const options = { ...(sqlite ? { sql: serializeLocalSqlDatabase(sqlite) } : { storage }),
      now: () => '2026-11-11T04:00:00Z' };
    const open = () => new LocalRepository('ordinary-replay', 'device', options);
    const key = { resourceType: 'SUBJECT', resourceId: 'subject' };
    const edit = (repository, clientMutationId, name, version) => repository.commitMutation({
      ...key, value: { id: key.resourceId, name, version }, version, deletedAt: null,
      mutation: { ...key, clientMutationId, mutationType: 'UPDATE', baseVersion: version, payload: { name, baseVersion: version } },
    });
    const run = (repository, pushChanges) => runSyncCycle({ repository, serverDeviceId: 'device', api: {
      pushChanges,
      async pullChanges({ cursor }) { return { changes: [], nextCursor: cursor, hasMore: false, resetRequired: false }; },
      async getSnapshot() { assert.fail('unexpected snapshot'); },
    } });
    const receipt = (mutation, version, decision = 'APPLIED') => ({ results: [{ ...key,
      clientMutationId: mutation.clientMutationId, mutationType: 'UPDATE', decision,
      current: { id: key.resourceId, name: mutation.payload.name, version },
      ...(decision === 'CONFLICT' ? { code: 'RESOURCE_VERSION_CONFLICT' } : {}),
    }] });

    try {
      const initial = open();
      await initial.saveCursor('before');
      await edit(initial, 'z-first', 'first edit', 4);
      let dispatched;
      await assert.rejects(run(initial, async ({ mutations }) => {
        [dispatched] = mutations;
        throw new Error('response lost');
      }), /response lost/);
      assert.deepEqual(dispatched.payload, { name: 'first edit', baseVersion: 4 });
      assert.equal((await initial.listUnresolved())[0].status, 'inflight');

      const reopened = open();
      const pushStarted = Promise.withResolvers();
      const lateResponse = Promise.withResolvers();
      const olderCycle = run(reopened, async ({ mutations }) => {
        pushStarted.resolve(mutations);
        return lateResponse.promise;
      });
      assert.deepEqual(await pushStarted.promise, [dispatched]);
      await edit(reopened, 'a-successor', 'second edit', 4);

      const firstSettlement = await run(open(), async ({ mutations }) => {
        assert.deepEqual(mutations, [dispatched], 'the same-millisecond successor cannot overtake its frozen predecessor');
        return receipt(dispatched, 5);
      });
      assert.equal(firstSettlement.ordinarySettled, 1);
      const pending = await reopened.read(key.resourceType, key.resourceId);
      assert.deepEqual([pending.syncStatus, pending.version, pending.value.version, pending.value.name], ['pending', 5, 5, 'second edit']);

      await run(open(), async ({ mutations }) => {
        assert.deepEqual(mutations.map(({ clientMutationId, baseVersion, payload }) => ({ clientMutationId, baseVersion, payload })),
          [{ clientMutationId: 'a-successor', baseVersion: 5, payload: { name: 'second edit', baseVersion: 5 } }]);
        return receipt(mutations[0], 6);
      });
      lateResponse.resolve(receipt(dispatched, 5));
      assert.equal((await olderCycle).ordinarySettled, 0);
      const synced = await reopened.read(key.resourceType, key.resourceId);
      assert.deepEqual([synced.syncStatus, synced.version, synced.value.name], ['synced', 6, 'second edit']);

      await edit(reopened, 'queued-after-ack', 'edit captured before the preceding ACK', pending.version);
      assert.equal((await reopened.read(key.resourceType, key.resourceId)).version, 6,
        'the exact prior local receipt prevents a version rollback if ACK enters the write boundary first');
      await run(reopened, async ({ mutations }) => {
        assert.equal(mutations[0].baseVersion, 6);
        assert.equal(mutations[0].payload.baseVersion, 6);
        return receipt(mutations[0], 7);
      });

      await reopened.upsertFromSync(key.resourceType, key.resourceId, { id: key.resourceId, name: 'other device', version: 8 },
        { version: 8, deletedAt: null, syncStatus: 'synced' });
      await edit(reopened, 'remote-conflict', 'another local edit', 6);
      await run(reopened, async ({ mutations }) => receipt(mutations[0], 8, 'CONFLICT'));
      const [conflict] = await reopened.listUnresolved();
      assert.deepEqual([conflict.status, conflict.baseVersion, conflict.remoteVersion, conflict.error],
        ['conflict', 6, 8, 'RESOURCE_VERSION_CONFLICT']);
      assert.equal((await reopened.read(key.resourceType, key.resourceId)).value.name, 'another local edit');

      await edit(reopened, 'fresh-form', 'form based on remote v8', 8);
      await edit(reopened, 'stale-form', 'form still holding v6', 6);
      await run(reopened, async ({ mutations }) => {
        assert.deepEqual(mutations.map(({ clientMutationId, baseVersion }) => [clientMutationId, baseVersion]), [['fresh-form', 8]]);
        return receipt(mutations[0], 9);
      });
      assert.deepEqual((await reopened.listPending()).map(({ clientMutationId, baseVersion }) => [clientMutationId, baseVersion]),
        [['stale-form', 6]], 'an older form never inherits the newer, unrelated pending baseline');
    } finally { sqlite?.close(); }
  });
}

test('legacy data is backed up without assignment or deletion and requires an explicit choice', () => {
  const storage = createMemoryStorage();
  storage.setItem('auralis_subjects', JSON.stringify([{ id: 'old-1', name: 'Unassigned' }]));

  const backup = backupLegacyUnassignedData(storage, () => '2026-08-20T02:00:00.000Z');
  assert.equal(backup?.capturedAt, '2026-08-20T02:00:00.000Z');
  assert.equal(storage.getItem('auralis_subjects'), JSON.stringify([{ id: 'old-1', name: 'Unassigned' }]));
  assert.equal(getLegacyUnassignedBackup(storage)?.migrationChoice, undefined);

  const chosen = recordLegacyMigrationChoice(storage, 'import_current_account', 'user-a');
  assert.equal(chosen?.migrationChoice, 'import_current_account');
  assert.equal(chosen?.importedIntoUserId, 'user-a');
});

test('localSchema sanitizer processes TASK color removal correctly and preserves KnowledgeBlock and metadata', async () => {
  const sqlite = new TemporarySqlite();
  const db = { execute: async (s, b) => sqlite.execute(s, b), select: async (s, b) => sqlite.select(s, b) };
  await createVersionedLocalSchema(db);

  sqlite.database.prepare("INSERT INTO local_resource_records (user_id, resource_type, resource_id, payload, version, sync_status) VALUES ('u1', 'TASK', 't1', '{\"id\":\"t1\",\"color\":\"#123\",\"colorOverride\":\"#456\",\"title\":\"T\"}', 1, 'synced')").run();
  sqlite.database.prepare("INSERT INTO local_resource_records (user_id, resource_type, resource_id, payload, version, sync_status) VALUES ('u1', 'KNOWLEDGE_BLOCK', 'b1', '{\"id\":\"b1\",\"colorOverride\":\"#789\",\"title\":\"B\"}', 1, 'synced')").run();
  sqlite.database.prepare("INSERT INTO local_mutations (user_id, client_mutation_id, resource_type, resource_id, mutation_type, base_version, payload, remote_payload, created_at, status) VALUES ('u1', 'm1', 'TASK', 't1', 'UPDATE', 1, '{\"color\":\"#123\"}', '{\"colorOverride\":\"#456\"}', '2026-09-08', 'pending')").run();

  await createVersionedLocalSchema(db);

  const tasks = sqlite.database.prepare("SELECT payload FROM local_resource_records WHERE resource_id = 't1'").all();
  assert.equal(tasks[0].payload, '{"id":"t1","title":"T"}');

  const blocks = sqlite.database.prepare("SELECT payload FROM local_resource_records WHERE resource_id = 'b1'").all();
  assert.equal(blocks[0].payload, '{"id":"b1","colorOverride":"#789","title":"B"}');

  const muts = sqlite.database.prepare("SELECT payload, remote_payload FROM local_mutations WHERE client_mutation_id = 'm1'").all();
  assert.equal(muts[0].payload, '{}');
  assert.equal(muts[0].remote_payload, '{}');
  sqlite.close();
});
test('upsertSyncedBatch merges browser members atomically without regressing versions or clearing tombstones', async () => {
  const { storage, first: repository } = createRepositories();
  const row = (id, marker) => ({ id, marker });
  const tombstoneAt = '2026-10-06T10:00:00.000Z';
  await repository.upsert('TASK', 'active-high', row('active-high', 'v5'), { version: 5, syncStatus: 'synced' });
  await repository.upsert('TASK', 'active-same', row('active-same', 'before'), { version: 3, syncStatus: 'synced' });
  await repository.upsert('TASK', 'active-to-delete', row('active-to-delete', 'before'), { version: 7, syncStatus: 'synced' });
  await repository.upsert('TASK', 'active-delete-stale', row('active-delete-stale', 'active-v5'), { version: 5, syncStatus: 'synced' });
  await repository.upsert('TASK', 'tombstone-high', row('tombstone-high', 'tomb-v5'), { version: 5, syncStatus: 'synced' });
  await repository.upsertFromSync('TASK', 'tombstone-high', row('tombstone-high', 'tomb-v5'), { version: 5, deletedAt: tombstoneAt, syncStatus: 'synced' });
  await repository.upsert('TASK', 'tombstone-stale', row('tombstone-stale', 'tomb-v5'), { version: 5, syncStatus: 'synced' });
  await repository.upsertFromSync('TASK', 'tombstone-stale', row('tombstone-stale', 'tomb-v5'), { version: 5, deletedAt: tombstoneAt, syncStatus: 'synced' });
  await repository.saveCursor('cursor-before-batch');

  const stateKey = storage.key(0);
  const originalWrite = repository.writeBrowserState.bind(repository);
  let writeCount = 0;
  repository.writeBrowserState = (state) => { writeCount += 1; return originalWrite(state); };
  const result = await repository.upsertSyncedBatch([
    { resourceType: 'TASK', resourceId: 'active-high', version: 4, deletedAt: null, value: row('active-high', 'stale-v4') },
    { resourceType: 'TASK', resourceId: 'active-same', version: 3, deletedAt: null, value: row('active-same', 'same-v3-update') },
    { resourceType: 'TASK', resourceId: 'active-to-delete', version: 7, deletedAt: tombstoneAt, value: row('active-to-delete', 'same-v7-delete') },
    { resourceType: 'TASK', resourceId: 'active-delete-stale', version: 4, deletedAt: tombstoneAt, value: row('active-delete-stale', 'stale-delete-v4') },
    { resourceType: 'TASK', resourceId: 'tombstone-high', version: 6, deletedAt: null, value: row('tombstone-high', 'active-v6') },
    { resourceType: 'TASK', resourceId: 'tombstone-stale', version: 4, deletedAt: tombstoneAt, value: row('tombstone-stale', 'tomb-v4') },
    { resourceType: 'TASK', resourceId: 'fresh', version: 1, deletedAt: null, value: row('fresh', 'new') },
  ]);

  assert.equal(result, true);
  assert.equal(writeCount, 1, 'eligible members and skipped stale members commit with one browser state write');
  const activeHigh = await repository.read('TASK', 'active-high');
  assert.equal(activeHigh.version, 5);
  assert.equal(activeHigh.value.marker, 'v5');
  assert.equal((await repository.read('TASK', 'active-same')).value.marker, 'same-v3-update', 'same-version active response is accepted');
  const activeToDelete = await repository.read('TASK', 'active-to-delete');
  assert.equal(activeToDelete.version, 7);
  assert.equal(activeToDelete.deletedAt, tombstoneAt, 'same-version tombstone is accepted');
  const activeDeleteStale = await repository.read('TASK', 'active-delete-stale');
  assert.equal(activeDeleteStale.version, 5);
  assert.equal(activeDeleteStale.deletedAt, null, 'lower-version tombstone is rejected');
  assert.equal(activeDeleteStale.value.marker, 'active-v5');
  const tombstoneHigh = await repository.read('TASK', 'tombstone-high');
  assert.equal(tombstoneHigh.version, 5);
  assert.equal(tombstoneHigh.deletedAt, tombstoneAt, 'higher active response cannot clear a tombstone');
  assert.equal(tombstoneHigh.value.marker, 'tomb-v5');
  const tombstoneStale = await repository.read('TASK', 'tombstone-stale');
  assert.equal(tombstoneStale.version, 5, 'lower tombstone cannot reduce the stored version');
  assert.equal(tombstoneStale.deletedAt, tombstoneAt);
  assert.equal(tombstoneStale.value.marker, 'tomb-v5');
  assert.equal((await repository.read('TASK', 'fresh')).value.marker, 'new', 'a fresh eligible row applies beside stale rows');
  assert.equal((await repository.getSyncState()).cursor, 'cursor-before-batch');
  assert.deepEqual(await repository.listPending('TASK'), []);
  assert.ok(storage.getItem(stateKey));
});

test('upsertSyncedBatch merges SQL members atomically without regressing versions or clearing tombstones', async () => {
  const sqlite = new TemporarySqlite();
  const repository = new LocalRepository('user-a', 'device-1', { sql: sqlite });
  try {
    const row = (id, marker) => ({ id, marker });
    const tombstoneAt = '2026-10-06T10:00:00.000Z';
    await repository.upsert('TASK', 'active-high', row('active-high', 'v5'), { version: 5, syncStatus: 'synced' });
    await repository.upsert('TASK', 'active-same', row('active-same', 'before'), { version: 3, syncStatus: 'synced' });
    await repository.upsert('TASK', 'active-to-delete', row('active-to-delete', 'before'), { version: 7, syncStatus: 'synced' });
    await repository.upsert('TASK', 'active-delete-stale', row('active-delete-stale', 'active-v5'), { version: 5, syncStatus: 'synced' });
    await repository.upsert('TASK', 'tombstone-high', row('tombstone-high', 'tomb-v5'), { version: 5, syncStatus: 'synced' });
    await repository.upsertFromSync('TASK', 'tombstone-high', row('tombstone-high', 'tomb-v5'), { version: 5, deletedAt: tombstoneAt, syncStatus: 'synced' });
    await repository.upsert('TASK', 'tombstone-stale', row('tombstone-stale', 'tomb-v5'), { version: 5, syncStatus: 'synced' });
    await repository.upsertFromSync('TASK', 'tombstone-stale', row('tombstone-stale', 'tomb-v5'), { version: 5, deletedAt: tombstoneAt, syncStatus: 'synced' });
    await repository.saveCursor('cursor-before-batch');

    const result = await repository.upsertSyncedBatch([
      { resourceType: 'TASK', resourceId: 'active-high', version: 4, deletedAt: null, value: row('active-high', 'stale-v4') },
      { resourceType: 'TASK', resourceId: 'active-same', version: 3, deletedAt: null, value: row('active-same', 'same-v3-update') },
      { resourceType: 'TASK', resourceId: 'active-to-delete', version: 7, deletedAt: tombstoneAt, value: row('active-to-delete', 'same-v7-delete') },
      { resourceType: 'TASK', resourceId: 'active-delete-stale', version: 4, deletedAt: tombstoneAt, value: row('active-delete-stale', 'stale-delete-v4') },
      { resourceType: 'TASK', resourceId: 'tombstone-high', version: 6, deletedAt: null, value: row('tombstone-high', 'active-v6') },
      { resourceType: 'TASK', resourceId: 'tombstone-stale', version: 4, deletedAt: tombstoneAt, value: row('tombstone-stale', 'tomb-v4') },
      { resourceType: 'TASK', resourceId: 'fresh', version: 1, deletedAt: null, value: row('fresh', 'new') },
    ]);

    assert.equal(result, true);
    const activeHigh = await repository.read('TASK', 'active-high');
    assert.equal(activeHigh.version, 5);
    assert.equal(activeHigh.value.marker, 'v5');
    assert.equal((await repository.read('TASK', 'active-same')).value.marker, 'same-v3-update');
    const activeToDelete = await repository.read('TASK', 'active-to-delete');
    assert.equal(activeToDelete.version, 7);
    assert.equal(activeToDelete.deletedAt, tombstoneAt);
    const activeDeleteStale = await repository.read('TASK', 'active-delete-stale');
    assert.equal(activeDeleteStale.version, 5);
    assert.equal(activeDeleteStale.deletedAt, null);
    assert.equal(activeDeleteStale.value.marker, 'active-v5');
    const tombstoneHigh = await repository.read('TASK', 'tombstone-high');
    assert.equal(tombstoneHigh.version, 5);
    assert.equal(tombstoneHigh.deletedAt, tombstoneAt);
    assert.equal(tombstoneHigh.value.marker, 'tomb-v5');
    const tombstoneStale = await repository.read('TASK', 'tombstone-stale');
    assert.equal(tombstoneStale.version, 5);
    assert.equal(tombstoneStale.deletedAt, tombstoneAt);
    assert.equal(tombstoneStale.value.marker, 'tomb-v5');
    assert.equal((await repository.read('TASK', 'fresh')).value.marker, 'new');
    assert.equal((await repository.getSyncState()).cursor, 'cursor-before-batch');
    assert.deepEqual(await repository.listPending('TASK'), []);
  } finally {
    sqlite.close();
  }
});

test('commitScheduleMutation persists a multi-task projection with exactly one outbox command in browser and SQLite', async () => {
  const sqlite = new TemporarySqlite();
  const browser = new LocalRepository('user-a', 'browser-device', { storage: createMemoryStorage() });
  const sql = new LocalRepository('user-a', 'sqlite-device', { sql: sqlite });
  try {
    for (const repository of [browser, sql]) {
      await repository.upsert('TASK', 'task-a', { title: 'A', scheduledAt: null }, { version: 2 });
      await repository.upsert('TASK', 'task-b', { title: 'B', scheduledAt: null }, { version: 4 });
      const originalWrite = repository === browser ? repository.writeBrowserState?.bind(repository) : undefined;
      let browserWrites = 0;
      if (originalWrite) repository.writeBrowserState = (state) => { browserWrites += 1; return originalWrite(state); };

      const committed = await repository.commitScheduleMutation({
        items: [
          { resourceType: 'TASK', resourceId: 'task-a', value: { title: 'A', scheduledAt: '2026-10-11T09:00:00.000Z' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
          { resourceType: 'TASK', resourceId: 'task-b', value: { title: 'B', scheduledAt: '2026-10-11T09:30:00.000Z' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
        ],
        mutation: {
          resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-command-1',
          mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
          payload: { scheduledAt: '2026-10-11T09:00:00.000Z', _localAffectedTaskIds: ['task-a', 'task-b'] },
        },
      });

      assert.deepEqual(committed.map((item) => item.id), ['task-a', 'task-b']);
      assert.equal((await repository.read('TASK', 'task-a')).syncStatus, 'pending');
      assert.equal((await repository.read('TASK', 'task-b')).syncStatus, 'pending');
      assert.deepEqual((await repository.listPending('TASK')).map((item) => [item.clientMutationId, item.mutationType]), [
        ['schedule-command-1', 'SCHEDULE_INSERTION'],
      ]);
      assert.deepEqual((await repository.listUnresolved('TASK')).map((item) => item.clientMutationId), ['schedule-command-1']);
      if (originalWrite) assert.equal(browserWrites, 1, 'browser fallback must commit the batch in one state write');
    }
  } finally {
    sqlite.close();
  }
});

test('resolveScheduleMutation applies server Task arrays atomically and makes rejected commands terminal', async () => {
  const { first: repository } = createRepositories();
  await repository.upsert('TASK', 'task-a', { title: 'A', scheduledAt: null }, { version: 2 });
  await repository.upsert('TASK', 'task-b', { title: 'B', scheduledAt: null }, { version: 4 });
  await repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', value: { title: 'A', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      { resourceType: 'TASK', resourceId: 'task-b', value: { title: 'B', scheduledAt: 'optimistic-b' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-command-2',
      mutationType: 'SCHEDULE_SWAP', baseVersion: 2,
      payload: { _localAffectedTaskIds: ['task-a', 'task-b'] },
    },
  });

  const resolved = await repository.resolveScheduleMutation({
    clientMutationId: 'schedule-command-2',
    status: 'rejected',
    error: 'RESOURCE_VERSION_CONFLICT',
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', version: 3, deletedAt: null, value: { title: 'A', scheduledAt: 'server-a' } },
      { resourceType: 'TASK', resourceId: 'task-b', version: 5, deletedAt: null, value: { title: 'B', scheduledAt: 'server-b' } },
    ],
  });

  assert.equal(resolved, true);
  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'server-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'server-b');
  assert.equal((await repository.read('TASK', 'task-a')).syncStatus, 'synced');
  assert.equal((await repository.read('TASK', 'task-b')).syncStatus, 'synced');
  assert.deepEqual(await repository.listPending('TASK'), []);
  assert.deepEqual(await repository.listUnresolved('TASK'), []);

  const state = JSON.parse(repository.storage.getItem('auralis:v2:user-a:device-1:state'));
  const command = state.mutations.find((item) => item.clientMutationId === 'schedule-command-2');
  assert.equal(command.status, 'rejected');
  assert.equal(command.error, 'RESOURCE_VERSION_CONFLICT');
});

test('resolveScheduleMutation accepts server-shifted Tasks outside the local prediction fence', async () => {
  const sqlite = new TemporarySqlite();
  const repositories = [
    new LocalRepository('user-a', 'browser-server-cohort', { storage: createMemoryStorage() }),
    new LocalRepository('user-a', 'sqlite-server-cohort', { sql: sqlite }),
  ];
  try {
    for (const repository of repositories) {
      await repository.upsert('TASK', 'task-a', { title: 'A', scheduledAt: null }, { version: 2 });
      await repository.upsert('TASK', 'task-server-neighbor', { title: 'Neighbor', scheduledAt: 'before' }, { version: 7 });
      await repository.commitScheduleMutation({
        items: [
          { resourceType: 'TASK', resourceId: 'task-a', value: { title: 'A', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
        ],
        mutation: {
          resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-server-cohort',
          mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
          payload: { _localAffectedTaskIds: ['task-a'] },
        },
      });

      const resolved = await repository.resolveScheduleMutation({
        clientMutationId: 'schedule-server-cohort',
        status: 'applied',
        items: [
          { resourceType: 'TASK', resourceId: 'task-a', version: 3, deletedAt: null, value: { title: 'A', scheduledAt: 'server-a' } },
          { resourceType: 'TASK', resourceId: 'task-server-neighbor', version: 8, deletedAt: null, value: { title: 'Neighbor', scheduledAt: 'server-shifted' } },
        ],
      });

      assert.equal(resolved, true);
      assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'server-a');
      assert.equal((await repository.read('TASK', 'task-server-neighbor')).value.scheduledAt, 'server-shifted');
      assert.equal((await repository.read('TASK', 'task-server-neighbor')).syncStatus, 'synced');
      assert.deepEqual(await repository.listUnresolved('TASK'), []);
    }
  } finally {
    sqlite.close();
  }
});

test('resolveScheduleMutation preserves the complete newer local batch when a server response is stale', async () => {
  const { first: repository } = createRepositories();
  await repository.upsert('TASK', 'task-a', { title: 'A', scheduledAt: 'before-a' }, { version: 2 });
  await repository.upsert('TASK', 'task-b', { title: 'B', scheduledAt: 'before-b' }, { version: 4 });
  await repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', value: { title: 'A', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      { resourceType: 'TASK', resourceId: 'task-b', value: { title: 'B', scheduledAt: 'optimistic-b' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-command-stale',
      mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
      payload: { _localAffectedTaskIds: ['task-a', 'task-b'] },
    },
  });
  await repository.upsert('TASK', 'task-a', { title: 'A', scheduledAt: 'newer-a' }, { version: 9, syncStatus: 'synced' });

  const resolved = await repository.resolveScheduleMutation({
    clientMutationId: 'schedule-command-stale',
    status: 'applied',
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', version: 8, deletedAt: null, value: { title: 'A', scheduledAt: 'stale-a' } },
      { resourceType: 'TASK', resourceId: 'task-b', version: 5, deletedAt: null, value: { title: 'B', scheduledAt: 'stale-b' } },
    ],
  });

  assert.equal(resolved, false);
  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'newer-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'optimistic-b', 'no member of a stale server batch is partially applied');
  assert.deepEqual(await repository.listPending('TASK'), []);
  assert.deepEqual(await repository.listUnresolved('TASK'), []);
});

test('commitScheduleMutation rolls back all SQLite and browser changes if the outbox write fails', async () => {
  const sqlite = new TemporarySqlite();
  const browser = new LocalRepository('user-a', 'browser-failure', { storage: createMemoryStorage() });
  const sql = new LocalRepository('user-a', 'sqlite-failure', { sql: sqlite });
  try {
    for (const repository of [browser, sql]) {
      await repository.upsert('TASK', 'task-a', { scheduledAt: null }, { version: 1 });
      await repository.upsert('TASK', 'task-b', { scheduledAt: null }, { version: 1 });
    }
    const originalExecute = sqlite.execute.bind(sqlite);
    sqlite.execute = async (statement, params) => {
      if (statement.includes('INSERT INTO local_mutations')) throw new Error('outbox write failed');
      return originalExecute(statement, params);
    };
    const originalBrowserWrite = browser.writeBrowserState.bind(browser);
    browser.writeBrowserState = () => { throw new Error('browser state write failed'); };
    const inputFor = (id) => ({
      items: [
        { resourceType: 'TASK', resourceId: 'task-a', value: { scheduledAt: 'optimistic-a' }, version: 1, deletedAt: null, expectedLocalVersion: 1 },
        { resourceType: 'TASK', resourceId: 'task-b', value: { scheduledAt: 'optimistic-b' }, version: 1, deletedAt: null, expectedLocalVersion: 1 },
      ],
      mutation: {
        resourceType: 'TASK', resourceId: 'task-a', clientMutationId: `schedule-rollback-${id}`,
        mutationType: 'SCHEDULE_INSERTION', baseVersion: 1,
        payload: { _localAffectedTaskIds: ['task-a', 'task-b'] },
      },
    });

    await assert.rejects(browser.commitScheduleMutation(inputFor('browser')), /browser state write failed/);
    browser.writeBrowserState = originalBrowserWrite;
    await assert.rejects(sql.commitScheduleMutation(inputFor('sqlite')), /outbox write failed/);
    for (const repository of [browser, sql]) {
      assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, null);
      assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, null);
      assert.deepEqual(await repository.listPending('TASK'), []);
    }
  } finally {
    sqlite.close();
  }
});

test('unresolved schedule commands fence member Task edits, pull updates and snapshot reset', async () => {
  const { first: repository } = createRepositories();
  await repository.upsert('TASK', 'task-a', { title: 'A', scheduledAt: null }, { version: 2 });
  await repository.upsert('TASK', 'task-b', { title: 'B', scheduledAt: null }, { version: 4 });
  await repository.commitScheduleMutation({
    items: [
      { resourceType: 'TASK', resourceId: 'task-a', value: { title: 'A', scheduledAt: 'optimistic-a' }, version: 2, deletedAt: null, expectedLocalVersion: 2 },
      { resourceType: 'TASK', resourceId: 'task-b', value: { title: 'B', scheduledAt: 'optimistic-b' }, version: 4, deletedAt: null, expectedLocalVersion: 4 },
    ],
    mutation: {
      resourceType: 'TASK', resourceId: 'task-a', clientMutationId: 'schedule-fence',
      mutationType: 'SCHEDULE_SWAP', baseVersion: 2,
      payload: { _localAffectedTaskIds: ['task-a', 'task-b'] },
    },
  });

  await assert.rejects(repository.commitMutation({
    resourceType: 'TASK', resourceId: 'task-b', value: { title: 'B edited', scheduledAt: 'optimistic-b' },
    version: 4, deletedAt: null, expectedLocalVersion: 4,
    mutation: { resourceType: 'TASK', resourceId: 'task-b', clientMutationId: 'task-b-edit', mutationType: 'UPDATE', baseVersion: 4, payload: { title: 'B edited' } },
  }), (error) => error instanceof LocalConflictError);

  assert.equal(await repository.upsertFromSync('TASK', 'task-b', { title: 'B remote', scheduledAt: null }, {
    version: 5, deletedAt: null, syncStatus: 'synced',
  }), false);
  await repository.replaceSnapshotPreservingPending([
    { resourceType: 'TASK', resourceId: 'task-a', version: 3, deletedAt: null, value: { title: 'A remote', scheduledAt: null } },
    { resourceType: 'TASK', resourceId: 'task-b', version: 5, deletedAt: null, value: { title: 'B remote', scheduledAt: null } },
  ]);

  assert.equal((await repository.read('TASK', 'task-a')).value.scheduledAt, 'optimistic-a');
  assert.equal((await repository.read('TASK', 'task-b')).value.scheduledAt, 'optimistic-b');
  assert.deepEqual((await repository.listPending('TASK')).map((item) => item.clientMutationId), ['schedule-fence']);
});


for (const backend of ['browser', 'sqlite']) {
  test(`${backend}: consecutive schedule intentions survive restart, serialize delivery and retain the newest projection`, async () => {
    const storage = createMemoryStorage();
    const sqlite = backend === 'sqlite' ? new TemporarySqlite() : null;
    const options = { ...(sqlite ? { sql: sqlite } : { storage }), now: () => '2026-10-31T00:00:00.000Z' };
    let repository = new LocalRepository('schedule-chain-user', 'device', options);
    const at = (hour) => `2099-10-06T${hour}:00:00.000Z`;
    const initial = (id, hour) => ({ id, status: 'TODO', scheduledAt: at(hour), durationMinutes: 60 });
    const commit = async (id, type, values, payload) => repository.commitScheduleMutation({
      items: await Promise.all(values.map(async (value) => {
        const row = await repository.read('TASK', value.id);
        return { resourceType: 'TASK', resourceId: value.id, value, version: row.version,
          expectedLocalVersion: row.version, deletedAt: null };
      })),
      mutation: { clientMutationId: id, resourceType: 'TASK', resourceId: payload.taskId ?? payload.sourceTaskId,
        mutationType: type, baseVersion: 2, payload: { ...payload, _localAffectedTaskIds: values.map((value) => value.id) } },
    });
    try {
      await repository.upsert('TASK', 'a', initial('a', '08'), { version: 2 });
      await repository.upsert('TASK', 'b', initial('b', '09'), { version: 4 });
      await commit('z-first', 'SCHEDULE_INSERTION', [initial('a', '10'), initial('b', '11')], { taskId: 'a', baseVersion: 2 });
      const [firstSent] = await repository.claimPending(200);
      await commit('y-second', 'SCHEDULE_SWAP', [initial('a', '13'), initial('b', '12')],
        { sourceTaskId: 'b', sourceBaseVersion: 4, targetTaskId: 'a', targetBaseVersion: 2 });
      await commit('x-third', 'SCHEDULE_INSERTION', [initial('a', '14')], { taskId: 'a', baseVersion: 2 });
      assert.deepEqual((await repository.claimPending(200)).map((item) => item.clientMutationId), ['z-first'], 'inflight delivery only retries the same head, never a following intention');
      repository = new LocalRepository('schedule-chain-user', 'device', options);
      assert.equal((await repository.read('TASK', 'a')).value.scheduledAt, at('14'));
      const [retry] = await repository.claimPending(200);
      assert.equal(retry.clientMutationId, firstSent.clientMutationId);
      assert.deepEqual(retry.payload, firstSent.payload, 'unknown delivery retries the identical stable command');
      const firstResult = {
        clientMutationId: retry.clientMutationId, status: 'applied', items: [
          { resourceType: 'TASK', resourceId: 'a', value: initial('a', '10'), version: 3, deletedAt: null },
          { resourceType: 'TASK', resourceId: 'b', value: initial('b', '11'), version: 5, deletedAt: null },
        ],
      };
      assert.equal(await repository.resolveScheduleMutation(firstResult), true);
      assert.equal((await repository.read('TASK', 'a')).value.scheduledAt, at('14'));
      assert.equal((await repository.read('TASK', 'b')).value.scheduledAt, at('12'));
      const [second] = await repository.claimPending(200);
      assert.equal(second.clientMutationId, 'y-second', 'same-millisecond appends keep commit order rather than lexical ID order');
      assert.equal(second.baseVersion, 5);
      assert.equal(second.payload.sourceBaseVersion, 5);
      assert.equal(second.payload.targetBaseVersion, 3);
      await repository.resolveScheduleMutation({ clientMutationId: second.clientMutationId, status: 'applied', items: [
        { resourceType: 'TASK', resourceId: 'a', value: initial('a', '13'), version: 4, deletedAt: null },
        { resourceType: 'TASK', resourceId: 'b', value: initial('b', '12'), version: 6, deletedAt: null },
      ] });
      await repository.resolveScheduleMutation(firstResult);
      assert.equal((await repository.read('TASK', 'a')).value.scheduledAt, at('14'), 'late duplicate receipt cannot rewind the visible schedule');
      const [third] = await repository.claimPending(200);
      assert.equal(third.clientMutationId, 'x-third');
      assert.equal(third.baseVersion, 4);
      assert.equal(third.payload.baseVersion, 4);
      await repository.resolveScheduleMutation({ clientMutationId: third.clientMutationId, status: 'applied', items: [
        { resourceType: 'TASK', resourceId: 'a', value: initial('a', '14'), version: 5, deletedAt: null },
      ] });
      assert.deepEqual(await repository.listUnresolved('TASK'), []);
      assert.equal((await repository.read('TASK', 'a')).syncStatus, 'synced');
      assert.equal((await repository.read('TASK', 'b')).syncStatus, 'synced');
    } finally { sqlite?.close(); }
  });

  for (const decision of ['REJECTED', 'APPLIED']) {
    test(`${backend}: ${decision} divergent predecessor restores the entire queued cohort only after a complete snapshot`, async () => {
      const sqlite = backend === 'sqlite' ? new TemporarySqlite() : null;
      const repository = new LocalRepository('schedule-failure-user', 'device', sqlite ? { sql: sqlite } : { storage: createMemoryStorage() });
      const firstValue = { id: 'a', scheduledAt: '2099-10-06T10:00:00.000Z' };
      const serverA = { id: 'a', scheduledAt: '2099-10-06T09:00:00Z', version: 3 };
      const serverB = { id: 'b', scheduledAt: '2099-10-06T08:00:00Z', version: 4 };
      const commits = [
        { id: 'first', value: firstValue, version: 2 },
        { id: 'second', value: { id: 'b', scheduledAt: '2099-10-06T15:00:00.000Z' }, version: 4 },
      ];
      const pushed = [];
      let failSnapshot = true;
      try {
        await repository.saveCursor('before');
        await repository.upsert('TASK', 'a', { ...serverA, version: 2 }, { version: 2 });
        await repository.upsert('TASK', 'b', serverB, { version: 4 });
        for (const item of commits) await repository.commitScheduleMutation({
          items: [{ resourceType: 'TASK', resourceId: item.value.id, value: item.value,
            version: item.version, expectedLocalVersion: item.version, deletedAt: null }],
          mutation: { clientMutationId: item.id, resourceType: 'TASK', resourceId: item.value.id,
            mutationType: 'SCHEDULE_INSERTION', baseVersion: item.version,
            payload: { taskId: item.value.id, baseVersion: item.version, _localAffectedTaskIds: [item.value.id] } },
        });
        const api = {
          async pushChanges({ mutations }) {
            pushed.push(mutations);
            return { results: [{ clientMutationId: 'first', decision, resourceType: 'TASK', mutationType: 'SCHEDULE_INSERTION',
              code: decision === 'REJECTED' ? 'VALIDATION_FAILED' : undefined, current: [serverA] }] };
          },
          async pullChanges() { return { changes: [], nextCursor: 'after', hasMore: false, resetRequired: false }; },
          async getSnapshot() {
            if (failSnapshot) throw new TypeError('snapshot temporarily unavailable');
            return { snapshotCursor: 'after', subjects: [], sources: [], knowledgeBlocks: [], relations: [], tasks: [serverA, serverB] };
          },
        };
        await assert.rejects(runSyncCycle({ repository, api, serverDeviceId: 'device' }), /snapshot temporarily unavailable/);
        assert.equal((await repository.read('TASK', 'b')).value.scheduledAt, commits[1].value.scheduledAt);
        assert.equal((await repository.listUnresolved('TASK')).length, 2, 'failed recovery keeps both intentions durable');
        failSnapshot = false;
        const result = await runSyncCycle({ repository, api, serverDeviceId: 'device' });
        assert.deepEqual(pushed[1][0].payload, pushed[0][0].payload, 'recovery retries keep the first delivery payload');
        assert.equal((await repository.read('TASK', 'a')).value.scheduledAt, serverA.scheduledAt);
        assert.equal((await repository.read('TASK', 'b')).value.scheduledAt, serverB.scheduledAt);
        assert.deepEqual(await repository.listUnresolved('TASK'), []);
        assert.equal(result.scheduleErrors.length, 1);
      } finally { sqlite?.close(); }
    });
  }
}


for (const backend of ['browser', 'sqlite']) {
  test(`${backend}: a same-version schedule edit from another repository rejects a stale calculation atomically`, async () => {
    const sqlite = backend === 'sqlite' ? new TemporarySqlite() : null;
    const options = sqlite ? { sql: sqlite } : { storage: createMemoryStorage() };
    const first = new LocalRepository('schedule-baseline-user', 'device', options);
    const second = new LocalRepository('schedule-baseline-user', 'device', options);
    const a = { id: 'a', status: 'TODO', scheduledAt: '2099-10-06T09:00:00Z', durationMinutes: 30 };
    const b = { id: 'b', status: 'TODO', scheduledAt: '2099-10-06T10:00:00Z', durationMinutes: 30 };
    try {
      await first.upsert('TASK', 'a', a, { version: 2 });
      await first.upsert('TASK', 'b', b, { version: 4 });
      const baseline = taskScheduleState(await first.list('TASK'));
      await second.commitScheduleMutation({
        items: [{ resourceType: 'TASK', resourceId: 'a', value: { ...a, scheduledAt: '2099-10-06T11:00:00Z' },
          version: 2, expectedLocalVersion: 2, deletedAt: null }],
        mutation: { clientMutationId: 'other-window', resourceType: 'TASK', resourceId: 'a', mutationType: 'SCHEDULE_INSERTION',
          baseVersion: 2, payload: { taskId: 'a', baseVersion: 2, _localAffectedTaskIds: ['a'] } },
      });
      await assert.rejects(first.commitScheduleMutation({
        expectedScheduleState: baseline,
        items: [{ resourceType: 'TASK', resourceId: 'b', value: { ...b, scheduledAt: '2099-10-06T11:00:00Z' },
          version: 4, expectedLocalVersion: 4, deletedAt: null }],
        mutation: { clientMutationId: 'stale-window', resourceType: 'TASK', resourceId: 'b', mutationType: 'SCHEDULE_INSERTION',
          baseVersion: 4, payload: { taskId: 'b', baseVersion: 4, _localAffectedTaskIds: ['b'] } },
      }), /排期已在其他窗口更新/);
      assert.equal((await first.read('TASK', 'a')).value.scheduledAt, '2099-10-06T11:00:00Z');
      assert.equal((await first.read('TASK', 'b')).value.scheduledAt, b.scheduledAt);
      assert.equal((await first.listUnresolved('TASK')).length, 1);
    } finally { sqlite?.close(); }
  });

  test(`${backend}: a newer cascade tombstone terminates queued schedules without starving the Subject DELETE receipt`, async () => {
    const sqlite = backend === 'sqlite' ? new TemporarySqlite() : null;
    const repository = new LocalRepository('schedule-cascade-user', 'device', sqlite ? { sql: sqlite } : { storage: createMemoryStorage() });
    const deletedAt = '2099-10-06T07:00:00Z';
    const task = (id, subjectId, hour) => ({ id, subjectId, status: 'TODO', scheduledAt: `2099-10-06T${hour}:00:00Z`, durationMinutes: 30 });
    const a = task('a', 'keep', '10');
    const b = task('b', 'remove', '11');
    const d = task('d', 'keep', '09');
    try {
      await repository.saveCursor('cascade-before');
      await repository.upsert('SUBJECT', 'remove', { id: 'remove' }, { version: 1 });
      for (const value of [a, b, d]) await repository.upsert('TASK', value.id, value, { version: 2 });
      for (const [id, source, values] of [['head', 'a', [a, b]], ['tail', 'd', [{ ...d, scheduledAt: '2099-10-06T12:00:00Z' }]]]) {
        await repository.commitScheduleMutation({
          items: values.map((value) => ({ resourceType: 'TASK', resourceId: value.id, value,
            version: 2, expectedLocalVersion: 2, deletedAt: null })),
          mutation: { clientMutationId: id, resourceType: 'TASK', resourceId: source, mutationType: 'SCHEDULE_INSERTION',
            baseVersion: 2, payload: { taskId: source, baseVersion: 2, _localAffectedTaskIds: values.map((value) => value.id) } },
        });
      }
      await repository.commitMutation({ resourceType: 'SUBJECT', resourceId: 'remove', value: { id: 'remove' }, version: 1, deletedAt,
        mutation: { clientMutationId: 'delete-subject', resourceType: 'SUBJECT', resourceId: 'remove', mutationType: 'DELETE', baseVersion: 1, payload: {} },
      });
      await repository.tombstoneSubjectChildren('remove', deletedAt);
      let snapshots = 0;
      const result = await runSyncCycle({ repository, serverDeviceId: 'device', api: {
        async pushChanges({ mutations }) {
          assert.deepEqual(mutations.map((mutation) => mutation.clientMutationId), ['head', 'delete-subject']);
          return { results: [
            { clientMutationId: 'head', decision: 'APPLIED', resourceType: 'TASK', mutationType: 'SCHEDULE_INSERTION',
              current: [{ ...a, version: 3 }, { ...b, version: 3 }] },
            { clientMutationId: 'delete-subject', decision: 'APPLIED', resourceType: 'SUBJECT', resourceId: 'remove', mutationType: 'DELETE',
              current: { id: 'remove', version: 2, deletedAt } },
          ] };
        },
        async getSnapshot() {
          snapshots += 1;
          return { snapshotCursor: 'cascade-after', subjects: [{ id: 'remove', version: 2, deletedAt }], sources: [], knowledgeBlocks: [], relations: [],
            tasks: [{ ...a, version: 3 }, { ...b, version: 3 }, { ...d, version: 2 }] };
        },
        async pullChanges() {
          assert.equal((await repository.read('TASK', 'b')).deletedAt, deletedAt, 'a stale active snapshot cannot resurrect the newer local cascade tombstone');
          assert.equal((await repository.listUnresolved('SUBJECT')).length, 0, 'the later DELETE receipt was processed');
          return { changes: [], nextCursor: 'cascade-after', hasMore: false, resetRequired: false };
        },
      } });
      assert.equal(snapshots, 1);
      assert.equal(result.scheduleErrors.length, 1);
      assert.equal((await repository.read('TASK', 'd')).value.scheduledAt, d.scheduledAt);
      assert.equal((await repository.read('TASK', 'b')).deletedAt, deletedAt);
      assert.deepEqual(await repository.listUnresolved(), []);
    } finally { sqlite?.close(); }
  });
}


for (const backend of ['browser', 'sqlite']) {
  test(`${backend}: startup and PROCESSING retry the immutable head without manually releasing inflight state`, async () => {
    const sqlite = backend === 'sqlite' ? new TemporarySqlite() : null;
    const options = sqlite ? { sql: sqlite } : { storage: createMemoryStorage() };
    const open = () => new LocalRepository('schedule-restart-user', 'device', options);
    let repository = open();
    const value = (hour) => ({ id: 'a', status: 'TODO', scheduledAt: `2099-10-06T${hour}:00:00Z`, durationMinutes: 30 });
    try {
      await repository.saveCursor('restart-cursor');
      await repository.upsert('TASK', 'a', value('09'), { version: 2 });
      for (const [id, hour] of [['first', '10'], ['second', '11']]) await repository.commitScheduleMutation({
        items: [{ resourceType: 'TASK', resourceId: 'a', value: value(hour), version: 2, expectedLocalVersion: 2, deletedAt: null }],
        mutation: { clientMutationId: id, resourceType: 'TASK', resourceId: 'a', mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
          payload: { taskId: 'a', baseVersion: 2, _localAffectedTaskIds: ['a'] } },
      });
      const [crashedClaim] = await repository.claimPending(200);
      repository = open();
      const sent = [];
      let processing = true;
      const api = {
        async pushChanges({ mutations }) {
          sent.push(mutations);
          const mutation = mutations[0];
          if (processing) return { results: [{ clientMutationId: mutation.clientMutationId, decision: 'PROCESSING' }] };
          return { results: [{ clientMutationId: mutation.clientMutationId, decision: 'APPLIED', resourceType: 'TASK', mutationType: 'SCHEDULE_INSERTION',
            current: mutation.payload._localExpectedTasks.map(({ value }) => ({ ...value, version: mutation.baseVersion + 1 })) }] };
        },
        async pullChanges() { return { changes: [], nextCursor: 'restart-cursor', hasMore: false, resetRequired: false }; },
        async getSnapshot() { assert.fail('startup retry uses the persisted stable command, not a snapshot rewrite'); },
      };
      await runSyncCycle({ repository, api, serverDeviceId: 'device' });
      assert.equal(sent.length, 1, 'PROCESSING does not busy-loop within a cycle');
      assert.equal(sent[0][0].clientMutationId, crashedClaim.clientMutationId);
      assert.deepEqual(sent[0][0].payload, crashedClaim.payload);
      repository = open();
      processing = false;
      await runSyncCycle({ repository, api, serverDeviceId: 'device' });
      assert.equal(sent[1][0].clientMutationId, crashedClaim.clientMutationId);
      assert.deepEqual(sent[1][0].payload, crashedClaim.payload);
      assert.equal((await repository.read('TASK', 'a')).value.scheduledAt, value('11').scheduledAt);
      await runSyncCycle({ repository, api, serverDeviceId: 'device' });
      assert.equal(sent[2][0].clientMutationId, 'second');
      assert.equal(sent[2][0].baseVersion, 3);
      assert.deepEqual(await repository.listUnresolved('TASK'), []);
    } finally { sqlite?.close(); }
  });
}


for (const backend of ['browser', 'sqlite']) {
  test(`${backend}: unschedule mutation participates in schedule FIFO queue, receipt fencing, and restart recovery`, async () => {
    const sqlite = backend === 'sqlite' ? new TemporarySqlite() : null;
    const options = sqlite ? { sql: sqlite } : { storage: createMemoryStorage() };
    const open = () => new LocalRepository('unschedule-repo-user', 'device', options);
    let repository = open();
    const scheduled = (hour) => ({ id: 'task-u', status: 'TODO', scheduledAt: `2099-10-06T${hour}:00:00Z`, durationMinutes: 30 });
    const unscheduled = () => ({ id: 'task-u', status: 'TODO', durationMinutes: 30 });
    try {
      await repository.upsert('TASK', 'task-u', scheduled('09'), { version: 2 });

      // Step 1: Insert un-ACKed -> immediate unschedule
      await repository.commitScheduleMutation({
        items: [{ resourceType: 'TASK', resourceId: 'task-u', value: scheduled('10'), version: 2, expectedLocalVersion: 2, deletedAt: null }],
        mutation: {
          clientMutationId: 'insert-10', resourceType: 'TASK', resourceId: 'task-u',
          mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
          payload: { taskId: 'task-u', baseVersion: 2, _localAffectedTaskIds: ['task-u'] },
        },
      });

      // Immediate unschedule while insert-10 is pending
      await repository.commitScheduleMutation({
        items: [{ resourceType: 'TASK', resourceId: 'task-u', value: unscheduled(), version: 2, expectedLocalVersion: 2, deletedAt: null }],
        mutation: {
          clientMutationId: 'unsched-1', resourceType: 'TASK', resourceId: 'task-u',
          mutationType: 'SCHEDULE_UNSCHEDULE', baseVersion: 2,
          payload: { id: 'task-u', title: 'Original title', scheduledAt: null, baseVersion: 2, _localAffectedTaskIds: ['task-u'] },
        },
      });

      // Local projection must immediately have scheduledAt cleared
      const localProjection = await repository.read('TASK', 'task-u');
      assert.equal(localProjection.value.scheduledAt, undefined, 'local row must project unscheduled immediately');

      // Step 2: Queue contains both mutations in FIFO order
      const pending = await repository.listPending('TASK');
      assert.equal(pending.length, 2);
      assert.equal(pending[0].clientMutationId, 'insert-10');
      assert.equal(pending[0].mutationType, 'SCHEDULE_INSERTION');
      assert.equal(pending[1].clientMutationId, 'unsched-1');
      assert.equal(pending[1].mutationType, 'SCHEDULE_UNSCHEDULE');

      // Step 3: Preceding insertion ACK arrives (applied with server version 3 and scheduledAt: 10:00:00Z)
      // Because unsched-1 is still queued, resolving insert-10 must NOT overwrite the newer unschedule projection!
      const insertResult = {
        clientMutationId: 'insert-10', status: 'applied', items: [
          { resourceType: 'TASK', resourceId: 'task-u', value: { ...scheduled('10'), title: 'Title edited on another device' }, version: 3, deletedAt: null },
        ],
      };
      const insertAccepted = await repository.resolveScheduleMutation(insertResult);
      assert.equal(insertAccepted, true);
      const afterInsertAck = await repository.read('TASK', 'task-u');
      assert.equal(afterInsertAck.value.scheduledAt, undefined, 'preceding insertion ACK must not overwrite newer unschedule projection');
      assert.equal(afterInsertAck.value.title, 'Title edited on another device');

      // Also verify unsched-1 baseVersion was updated from 2 to 3!
      const [unschedClaim] = await repository.claimPending(200);
      assert.equal(unschedClaim.clientMutationId, 'unsched-1');
      assert.equal(unschedClaim.baseVersion, 3, 'unschedule mutation baseVersion must be updated by predecessor ACK');
      assert.equal(unschedClaim.payload.scheduledAt, null);
      assert.equal(unschedClaim.payload.title, 'Title edited on another device', 'the full UPDATE must preserve the title from the authoritative receipt');

      // Step 4: User reschedules task-u to 14:00 while unsched-1 is in-flight / un-ACKed
      await repository.commitScheduleMutation({
        items: [{ resourceType: 'TASK', resourceId: 'task-u', value: scheduled('14'), version: 3, expectedLocalVersion: 3, deletedAt: null }],
        mutation: {
          clientMutationId: 'resched-14', resourceType: 'TASK', resourceId: 'task-u',
          mutationType: 'SCHEDULE_INSERTION', baseVersion: 3,
          payload: { taskId: 'task-u', baseVersion: 3, _localAffectedTaskIds: ['task-u'] },
        },
      });
      assert.equal((await repository.read('TASK', 'task-u')).value.scheduledAt, scheduled('14').scheduledAt);

      // Step 5: Unschedule ACK arrives with version 4
      const unschedResult = {
        clientMutationId: 'unsched-1', status: 'applied', items: [
          { resourceType: 'TASK', resourceId: 'task-u', value: unscheduled(), version: 4, deletedAt: null },
        ],
      };
      await repository.resolveScheduleMutation(unschedResult);
      // It must NOT overwrite the subsequent reschedule projection (14:00)!
      const afterUnschedAck = await repository.read('TASK', 'task-u');
      assert.equal(afterUnschedAck.value.scheduledAt, scheduled('14').scheduledAt, 'unschedule ACK must not overwrite subsequent reschedule');

      // Step 6: Restart recovery - new repository instance reads state and uncompleted queue
      repository = open();
      const recoveredTask = await repository.read('TASK', 'task-u');
      assert.equal(recoveredTask.value.scheduledAt, scheduled('14').scheduledAt, 'restarted repo retains optimistic projection');
      const recoveredPending = await repository.listPending('TASK');
      assert.equal(recoveredPending.length, 1);
      assert.equal(recoveredPending[0].clientMutationId, 'resched-14');
      assert.equal(recoveredPending[0].baseVersion, 4, 'recovered reschedule mutation reflects predecessor version 4');
    } finally {
      sqlite?.close();
    }
  });
}
