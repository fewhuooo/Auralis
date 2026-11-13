import assert from 'node:assert/strict'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
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
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

function createTestLockManager() {
  const tails = new Map()
  let enabled = true
  return {
    request(name, _options, operation) {
      if (!enabled) return operation()
      const previous = tails.get(name) ?? Promise.resolve()
      let release
      const held = new Promise(resolve => { release = resolve })
      const tail = previous.then(() => held, () => held)
      tails.set(name, tail)
      return previous.then(operation).finally(() => { release(); if (tails.get(name) === tail) tails.delete(name) })
    },
    setEnabled(value) { enabled = value },
  }
}

const sharedTestLocks = createTestLockManager()
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: sharedTestLocks } })

const { createMemoryStorage } = await import('../src/services/localRepository.ts')
const { OverviewRepository, computeSubjectInputFingerprint } = await import('../src/services/overviewRepository.ts')
const { OverviewRepository: OverviewRepositoryOtherTab } = await import(`../src/services/overviewRepository.ts?tab=2`)
const { createVersionedLocalSchema, LOCAL_SCHEMA_VERSION } = await import('../src/services/localSchema.ts')

class TemporarySqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:')
    this.transactionCount = 0
  }
  async execute(sql, bindValues = []) { this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues) }
  async select(sql, bindValues = []) { return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues) }
  async transaction(operation) {
    this.transactionCount += 1
    this.database.exec('BEGIN IMMEDIATE')
    try { const result = await operation(this); this.database.exec('COMMIT'); return result }
    catch (error) { this.database.exec('ROLLBACK'); throw error }
  }
  close() { this.database.close() }
}

const outlineMarkdown = '## Limits\n- Sequence limits'
const summaryMarkdown = 'Calculus overview'

test('browser overview cache isolates user and device scopes', async () => {
  const storage = createMemoryStorage()
  const owner = new OverviewRepository('user-a', 'device-a', { storage, now: () => '2026-09-10T00:00:00.000Z' })
  const otherUser = new OverviewRepository('user-b', 'device-a', { storage })
  const otherDevice = new OverviewRepository('user-a', 'device-b', { storage })

  await owner.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 2, title: 'File', outlineMarkdown, summaryMarkdown } })

  assert.equal((await owner.getFileOverview('source-1', 'rev-1'))?.title, 'File')
  assert.equal(await otherUser.getFileOverview('source-1', 'rev-1'), null)
  assert.equal(await otherDevice.getFileOverview('source-1', 'rev-1'), null)
})

test('independent browser tabs serialize overview generation against saved edits', async () => {
  const runInterleavedWrite = async (scopeKey) => {
    const backing = createMemoryStorage()
    let onRead
    const storage = {
      getItem(key) {
        const value = backing.getItem(key)
        const callback = onRead
        onRead = undefined
        callback?.()
        return value
      },
      setItem: (key, value) => backing.setItem(key, value),
    }
    const userId = `cross-tab-${scopeKey}-user`
    const deviceId = `cross-tab-${scopeKey}-device`
    const savedTab = new OverviewRepository(userId, deviceId, { storage })
    const aiTab = new OverviewRepositoryOtherTab(userId, deviceId, { storage })
    await savedTab.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 2, title: 'Initial', outlineMarkdown, summaryMarkdown } })
    const baseline = await aiTab.captureGenerationBaseline('FILE', 'source-1', 'rev-1', 'OUTLINE')

    let aiWrite
    onRead = () => {
      aiWrite = aiTab.saveFileOverviewPart({
        sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE', generationBaseline: baseline,
        response: { schemaVersion: 2, title: 'AI result', outlineMarkdown: '## AI outline', summaryMarkdown: null },
      })
    }
    await savedTab.saveFileOverviewPart({
      sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE',
      response: { schemaVersion: 2, title: 'Local edit', outlineMarkdown: '## Saved local edit', summaryMarkdown: null },
    })
    assert.ok(aiWrite)
    const aiSave = await aiWrite
    return { aiSave, current: await savedTab.getFileOverview('source-1', 'rev-1'), outbox: await savedTab.listOverviewOutbox() }
  }
  try {
    sharedTestLocks.setEnabled(false)
    const withoutLock = await runInterleavedWrite('without-lock')
    assert.equal(withoutLock.current?.outlineMarkdown, '## AI outline', 'independent module queues without a shared lock reproduce the lost edit')

    sharedTestLocks.setEnabled(true)
    const withLock = await runInterleavedWrite('with-lock')
    assert.equal(withLock.aiSave.generationConflicts?.length, 1)
    assert.equal(withLock.current?.outlineMarkdown, '## Saved local edit')
    assert.equal(withLock.aiSave.generationConflicts?.[0]?.result.outlineMarkdown, '## AI outline')
    assert.ok(withLock.outbox.some(item => item.result.outlineMarkdown === '## Saved local edit'))
    assert.ok(withLock.outbox.some(item => item.state === 'CONFLICT' && item.errorCode === 'OVERVIEW_GENERATION_EDIT_CONFLICT'))
  } finally {
    sharedTestLocks.setEnabled(true)
  }
})

test('browser overview writes fail closed without Web Locks and leave storage unchanged', async () => {
  const originalNavigator = globalThis.navigator
  const storage = createMemoryStorage()
  const repository = new OverviewRepository('no-lock-user', 'no-lock-device', { storage })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
  try {
    await assert.rejects(
      () => repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 2, title: 'Must not save', outlineMarkdown, summaryMarkdown } }),
      error => error?.code === 'OVERVIEW_BROWSER_LOCK_UNAVAILABLE',
    )
    assert.equal(storage.length, 0)
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator })
  }
})

test('SQLite overview cache isolates revisions and replaces only the requested part', async () => {
  const sql = new TemporarySqlite()
  try {
    const repository = new OverviewRepository('user-a', 'device-a', { sql, now: () => '2026-09-10T00:00:00.000Z' })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 2, title: 'File', outlineMarkdown, summaryMarkdown } })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: { schemaVersion: 2, title: 'File', outlineMarkdown: null, summaryMarkdown: 'New summary' } })

    const stored = await repository.getFileOverview('source-1', 'rev-1')
    assert.equal(stored?.outlineMarkdown, outlineMarkdown)
    assert.equal(stored?.summaryMarkdown, 'New summary')
    assert.equal(await repository.getFileOverview('source-1', 'rev-2'), null)
    assert.equal(sql.transactionCount, 2)
  } finally { sql.close() }
})

test('SQLite v12 overview rows and frozen intents migrate to v14 with metadata columns and idempotent round trips', async () => {
  const sql = new TemporarySqlite()
  try {
    const legacyOutline = '## Limits\n- Sequence limits'
    const legacySummary = 'Calculus overview'
    const legacyRequestBody = {
      baseVersion: 4,
      clientWriteId: 'legacy-write-12',
      mode: 'ALL',
      ingestionRevision: 'rev-12',
      outlineGeneratedAt: '2026-10-18T10:00:00.000Z',
      summaryGeneratedAt: '2026-10-18T10:01:00.000Z',
      result: { schemaVersion: 1, title: 'Legacy overview', outline: [], summary: {} },
    }
    const legacyIntent = {
      clientWriteId: 'legacy-write-12', scopeType: 'FILE', scopeId: 'source-1', revisionKey: 'rev-12',
      mode: 'ALL', origin: 'LOCAL_WRITE', result: legacyRequestBody.result, inputFingerprint: null,
      outlineGeneratedAt: legacyRequestBody.outlineGeneratedAt, summaryGeneratedAt: legacyRequestBody.summaryGeneratedAt,
      state: 'PENDING', requestBody: legacyRequestBody, errorCode: null,
      createdAt: '2026-10-18T10:02:00.000Z', updatedAt: '2026-10-18T10:02:00.000Z',
    }
    await sql.execute('CREATE TABLE local_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    await sql.execute('INSERT INTO local_schema_migrations (version,applied_at) VALUES ($1,$2)', [12, '2026-10-18T00:00:00.000Z'])
    await sql.execute(`CREATE TABLE ai_overview_cache (
      user_id TEXT NOT NULL, device_id TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('FILE', 'SUBJECT')),
      scope_id TEXT NOT NULL, revision_key TEXT NOT NULL CHECK (length(trim(revision_key)) > 0),
      schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1), title TEXT NOT NULL,
      outline_json TEXT, summary_json TEXT, outline_generated_at TEXT, summary_generated_at TEXT,
      input_fingerprint TEXT, status TEXT NOT NULL CHECK (status IN ('READY', 'FAILED')),
      error_code TEXT, error_detail TEXT, updated_at TEXT NOT NULL,
      CHECK ((scope_type = 'SUBJECT' AND revision_key = 'subject-v1') OR (scope_type = 'FILE' AND revision_key <> 'subject-v1')),
      PRIMARY KEY (user_id,device_id,scope_type,scope_id,revision_key)
    )`)
    await sql.execute(`INSERT INTO ai_overview_cache
      (user_id,device_id,scope_type,scope_id,revision_key,schema_version,title,outline_json,summary_json,
       outline_generated_at,summary_generated_at,input_fingerprint,status,error_code,error_detail,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    ['user-a','device-a','FILE','source-1','rev-12',1,'Legacy overview',legacyOutline,legacySummary,
      legacyRequestBody.outlineGeneratedAt,legacyRequestBody.summaryGeneratedAt,null,'READY',null,null,'2026-10-18T10:02:00.000Z'])
    await sql.execute(`CREATE TABLE overview_sync_outbox (
      user_id TEXT NOT NULL, device_id TEXT NOT NULL, client_write_id TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('FILE', 'SUBJECT')), scope_id TEXT NOT NULL, revision_key TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('PREPARED', 'PENDING', 'INFLIGHT', 'CONFLICT', 'ERROR', 'STALE')),
      intent_json TEXT NOT NULL, request_json TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id,device_id,client_write_id)
    )`)
    await sql.execute(`INSERT INTO overview_sync_outbox
      (user_id,device_id,client_write_id,scope_type,scope_id,revision_key,state,intent_json,request_json,error_code,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    ['user-a','device-a','legacy-write-12','FILE','source-1','rev-12','PENDING',JSON.stringify(legacyIntent),
      JSON.stringify(legacyRequestBody),null,legacyIntent.createdAt,legacyIntent.updatedAt])

    const repository = new OverviewRepository('user-a', 'device-a', { sql })
    const legacy = await repository.getFileOverview('source-1', 'rev-12')
    assert.equal(LOCAL_SCHEMA_VERSION, 14)
    // Legacy schema_version = 1 rows are ignored by fromRow (return null)
    assert.equal(legacy, null)
    const migratedColumns = sql.database.prepare('PRAGMA table_info(ai_overview_cache)').all()
    assert.ok(migratedColumns.some(c => c.name === 'outline_markdown'))
    assert.ok(migratedColumns.some(c => c.name === 'summary_markdown'))
    const queued = await repository.listOverviewOutbox()
    assert.equal(queued.length, 1)
    assert.equal(queued[0].clientWriteId, 'legacy-write-12')
    assert.equal(queued[0].state, 'PENDING')
    assert.deepEqual(queued[0].requestBody, legacyRequestBody)

    await createVersionedLocalSchema(sql)
    assert.equal(await repository.getFileOverview('source-1', 'rev-12'), null)
    assert.equal((await repository.listOverviewOutbox()).length, 1)
    assert.deepEqual(sql.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map(row => row.version), [12, 14])

    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-14', mode: 'ALL',
      response: { schemaVersion: 2, title: 'Markdown round trip', outlineMarkdown, summaryMarkdown } })
    const roundTrip = await repository.getFileOverview('source-1', 'rev-14')
    assert.equal(roundTrip.schemaVersion, 2)
    assert.equal(roundTrip.outlineMarkdown, outlineMarkdown)
    assert.equal(roundTrip.summaryMarkdown, summaryMarkdown)
  } finally { sql.close() }
})

test('failed regeneration preserves successful content and records safe diagnostics', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage() })
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', inputFingerprint: 'fingerprint-1', response: { schemaVersion: 2, title: 'Subject', outlineMarkdown, summaryMarkdown } })
  await repository.markSubjectOverviewFailed('subject-1', 'SUMMARY', 'MODEL_UNAVAILABLE', 'Try again later')

  const stored = await repository.getSubjectOverview('subject-1')
  assert.equal(stored?.outlineMarkdown, outlineMarkdown)
  assert.equal(stored?.summaryMarkdown, summaryMarkdown)
  assert.equal(stored?.status, 'FAILED')
  assert.equal(stored?.errorCode, 'MODEL_UNAVAILABLE')
})

test('subject fingerprint is stable across file order and changes with content', async () => {
  const first = { sourceId: 'b', ingestionRevision: '2', outlineMarkdown, summaryMarkdown }
  const second = { sourceId: 'a', ingestionRevision: '1', outlineMarkdown, summaryMarkdown }
  const forward = await computeSubjectInputFingerprint([first, second])
  const reverse = await computeSubjectInputFingerprint([second, first])
  const changed = await computeSubjectInputFingerprint([second, { ...first, ingestionRevision: '3' }])
  assert.equal(forward, reverse)
  assert.notEqual(forward, changed)
})

test('scoped deletion removes only the requested overview', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 2, title: 'File 1', outlineMarkdown, summaryMarkdown } })
  await repository.saveFileOverviewPart({ sourceId: 'source-2', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 2, title: 'File 2', outlineMarkdown, summaryMarkdown } })
  await repository.removeFileOverviews('source-1')
  assert.equal(await repository.getFileOverview('source-1', 'rev-1'), null)
  assert.equal((await repository.getFileOverview('source-2', 'rev-1'))?.title, 'File 2')
})

test('concurrent outline and summary saves preserve both successful parts', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage() })
  const outlineResponse = { schemaVersion: 2, title: 'File', outlineMarkdown, summaryMarkdown: null }
  const summaryResponse = { schemaVersion: 2, title: 'File', outlineMarkdown: null, summaryMarkdown }

  await Promise.all([
    repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE', response: outlineResponse }),
    repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: summaryResponse }),
  ])

  const stored = await repository.getFileOverview('source-1', 'rev-1')
  assert.equal(stored?.outlineMarkdown, outlineMarkdown)
  assert.equal(stored?.summaryMarkdown, summaryMarkdown)
})

test('two repository instances serialize writes to the same browser scope', async () => {
  const storage = createMemoryStorage()
  const first = new OverviewRepository('user-a', 'device-a', { storage })
  const second = new OverviewRepository('user-a', 'device-a', { storage })
  await Promise.all([
    first.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE', response: { schemaVersion: 2, title: 'File', outlineMarkdown, summaryMarkdown: null } }),
    second.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: { schemaVersion: 2, title: 'File', outlineMarkdown: null, summaryMarkdown } }),
  ])
  const stored = await first.getFileOverview('source-1', 'rev-1')
  assert.equal(stored?.outlineMarkdown, outlineMarkdown)
  assert.equal(stored?.summaryMarkdown, summaryMarkdown)
})

test('a queued delete after a save cannot be undone by that older save', async () => {
  const storage = createMemoryStorage()
  const repository = new OverviewRepository('user-a', 'device-a', { storage })
  const saving = repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 2, title: 'File', outlineMarkdown, summaryMarkdown } })
  const removing = repository.removeFileOverviews('source-1')
  await Promise.all([saving, removing])
  assert.equal(await repository.getFileOverview('source-1', 'rev-1'), null)
})

test('browser cache rejects structurally invalid records with a stable corruption error', async () => {
  for (const payload of [
    '{bad json',
    JSON.stringify({ records: 'not-an-array' }),
    JSON.stringify({ records: [], states: 'not-an-array' }),
  ]) {
    const storage = createMemoryStorage()
    storage.setItem('auralis:v1:overviews:user-a:device-a', payload)
    const repository = new OverviewRepository('user-a', 'device-a', { storage })
    await assert.rejects(() => repository.getFileOverview('source-1', 'rev-1'), /OVERVIEW_CACHE_CORRUPT/)
  }
})

test('delete rejects a blank scope id', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage() })
  await assert.rejects(() => repository.removeFileOverviews(' '), /OVERVIEW_SCOPE_INVALID/)
  await assert.rejects(() => repository.removeSubjectOverview(' '), /OVERVIEW_SCOPE_INVALID/)
})

test('invalid scope ids and revisions are rejected consistently before persistence', async () => {
  for (const options of [{ storage: createMemoryStorage() }, { sql: new TemporarySqlite() }]) {
    const repository = new OverviewRepository('user-a', 'device-a', options)
    await assert.rejects(() => repository.getFileOverview(' ', 'rev-1'), /OVERVIEW_SCOPE_INVALID/)
    await assert.rejects(() => repository.getFileOverview('source-1', ' '), /OVERVIEW_REVISION_INVALID/)
    await assert.rejects(() => repository.getFileOverview('source-1', 'subject-v1'), /OVERVIEW_REVISION_INVALID/)
    if (options.sql) options.sql.close()
  }
})

test('first file generation failure persists bounded diagnostics without successful content', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage(), now: () => '2026-09-10T01:00:00.000Z' })
  await repository.markFileOverviewFailed('source-1', 'rev-1', 'SUMMARY', 'MODEL_UNAVAILABLE', 'retry later')
  const stored = await repository.getFileOverview('source-1', 'rev-1')
  assert.equal(stored?.status, 'FAILED')
  assert.equal(stored?.outlineMarkdown, null)
  assert.equal(stored?.errorCode, 'MODEL_UNAVAILABLE')
  assert.equal(stored?.errorDetail, 'retry later')
})
