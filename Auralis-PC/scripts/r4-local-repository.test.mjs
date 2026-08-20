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
const {
  backupLegacyUnassignedData,
  getLegacyUnassignedBackup,
  recordLegacyMigrationChoice,
} = await import('../src/services/legacyLocalData.ts');

class TemporarySqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async execute(sql, bindValues = []) {
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
