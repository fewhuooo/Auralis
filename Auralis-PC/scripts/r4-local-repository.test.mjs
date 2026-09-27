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
} = await import('../src/services/localRepository.ts');
const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts');
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
    assert.equal(row.schema_version, 9);
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

test('SQL snapshot reset delegates to the native transactional replacement boundary', async () => {
  const sqlite = new TemporarySqlite();
  try {
    await createVersionedLocalSchema(sqlite);
    let received = null;
    const repository = new LocalRepository('user-a', 'device-1', {
      sql: sqlite,
      schemaReady: Promise.resolve(),
      replaceSnapshot: async (items) => { received = items; },
    });
    const snapshot = [
      { resourceType: 'SUBJECT', resourceId: 'subject-1', version: 1, deletedAt: null, value: { name: 'Physics' } },
    ];

    await repository.replaceSnapshotPreservingPending(snapshot);

    assert.deepEqual(received, snapshot);
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
    clientMutationId: 'update-1', mutationType: 'DELETE', baseVersion: 4, payload: { id: 'task-1' },
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
    clientMutationId: 'create-1', mutationType: 'CREATE', baseVersion: 0, payload: { title: 'Latest title' },
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
    await repository.settleMutation({
      clientMutationId: 'unrelated-conflict', status: 'conflict', error: 'RESOURCE_VERSION_CONFLICT', remoteVersion: 3,
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

test('a new local edit remains pending when an older claimed mutation is acknowledged', async () => {
  const { first } = createRepositories();
  await first.commitMutation({
    resourceType: 'TASK', resourceId: 'task-1', value: { title: 'first' }, version: 1, deletedAt: null,
    mutation: { clientMutationId: 'm-1', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 1, payload: { title: 'first' } },
  });
  assert.deepEqual((await first.claimPending(200)).map((item) => item.clientMutationId), ['m-1']);
  await first.commitMutation({
    resourceType: 'TASK', resourceId: 'task-1', value: { title: 'second' }, version: 1, deletedAt: null,
    mutation: { clientMutationId: 'm-2', resourceType: 'TASK', resourceId: 'task-1', mutationType: 'UPDATE', baseVersion: 1, payload: { title: 'second' } },
  });
  await first.settleMutation({ clientMutationId: 'm-1', status: 'applied', remoteVersion: 2 });

  assert.equal((await first.read('TASK', 'task-1'))?.syncStatus, 'pending');
  assert.deepEqual((await first.listPending()).map((item) => item.clientMutationId), ['m-2']);
});

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
