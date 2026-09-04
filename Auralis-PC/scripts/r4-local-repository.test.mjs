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
