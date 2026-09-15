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

const { createMemoryStorage } = await import('../src/services/localRepository.ts')
const { OverviewRepository, computeSubjectInputFingerprint } = await import('../src/services/overviewRepository.ts')

class TemporarySqlite {
  constructor() { this.database = new DatabaseSync(':memory:'); this.transactionCount = 0 }
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

const outline = [{ title: 'Limits', sections: [{ title: 'Sequence limits', summary: 'Definition', sourceIds: ['source-1'], locator: null }] }]
const summary = { overview: 'Calculus overview', keyPoints: ['Limits'], learningPath: ['Limits', 'Derivatives'] }

test('browser overview cache isolates user and device scopes', async () => {
  const storage = createMemoryStorage()
  const owner = new OverviewRepository('user-a', 'device-a', { storage, now: () => '2026-09-10T00:00:00.000Z' })
  const otherUser = new OverviewRepository('user-b', 'device-a', { storage })
  const otherDevice = new OverviewRepository('user-a', 'device-b', { storage })

  await owner.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File', outline, summary } })

  assert.equal((await owner.getFileOverview('source-1', 'rev-1'))?.title, 'File')
  assert.equal(await otherUser.getFileOverview('source-1', 'rev-1'), null)
  assert.equal(await otherDevice.getFileOverview('source-1', 'rev-1'), null)
})

test('SQLite overview cache isolates revisions and replaces only the requested part', async () => {
  const sql = new TemporarySqlite()
  try {
    const repository = new OverviewRepository('user-a', 'device-a', { sql, now: () => '2026-09-10T00:00:00.000Z' })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File', outline, summary } })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: { schemaVersion: 1, title: 'File', outline: null, summary: { ...summary, overview: 'New summary' } } })

    const stored = await repository.getFileOverview('source-1', 'rev-1')
    assert.deepEqual(stored?.outline, outline)
    assert.equal(stored?.summary?.overview, 'New summary')
    assert.equal(await repository.getFileOverview('source-1', 'rev-2'), null)
    assert.equal(sql.transactionCount, 2)
  } finally { sql.close() }
})

test('failed regeneration preserves successful content and records safe diagnostics', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage() })
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', inputFingerprint: 'fingerprint-1', response: { schemaVersion: 1, title: 'Subject', outline, summary } })
  await repository.markSubjectOverviewFailed('subject-1', 'SUMMARY', 'MODEL_UNAVAILABLE', 'Try again later')

  const stored = await repository.getSubjectOverview('subject-1')
  assert.deepEqual(stored?.outline, outline)
  assert.deepEqual(stored?.summary, summary)
  assert.equal(stored?.status, 'FAILED')
  assert.equal(stored?.errorCode, 'MODEL_UNAVAILABLE')
})

test('subject fingerprint is stable across file order and changes with content', async () => {
  const first = { sourceId: 'b', ingestionRevision: '2', outline, summary }
  const second = { sourceId: 'a', ingestionRevision: '1', outline, summary }
  const forward = await computeSubjectInputFingerprint([first, second])
  const reverse = await computeSubjectInputFingerprint([second, first])
  const changed = await computeSubjectInputFingerprint([second, { ...first, ingestionRevision: '3' }])
  assert.equal(forward, reverse)
  assert.notEqual(forward, changed)
})

test('scoped deletion removes only the requested overview', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File 1', outline, summary } })
  await repository.saveFileOverviewPart({ sourceId: 'source-2', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File 2', outline, summary } })
  await repository.removeFileOverviews('source-1')
  assert.equal(await repository.getFileOverview('source-1', 'rev-1'), null)
  assert.equal((await repository.getFileOverview('source-2', 'rev-1'))?.title, 'File 2')
})

test('concurrent outline and summary saves preserve both successful parts', async () => {
  const repository = new OverviewRepository('user-a', 'device-a', { storage: createMemoryStorage() })
  const outlineResponse = { schemaVersion: 1, title: 'File', outline, summary: null }
  const summaryResponse = { schemaVersion: 1, title: 'File', outline: null, summary }

  await Promise.all([
    repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE', response: outlineResponse }),
    repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: summaryResponse }),
  ])

  const stored = await repository.getFileOverview('source-1', 'rev-1')
  assert.deepEqual(stored?.outline, outline)
  assert.deepEqual(stored?.summary, summary)
})

test('two repository instances serialize writes to the same browser scope', async () => {
  const storage = createMemoryStorage()
  const first = new OverviewRepository('user-a', 'device-a', { storage })
  const second = new OverviewRepository('user-a', 'device-a', { storage })
  await Promise.all([
    first.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE', response: { schemaVersion: 1, title: 'File', outline, summary: null } }),
    second.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: { schemaVersion: 1, title: 'File', outline: null, summary } }),
  ])
  const stored = await first.getFileOverview('source-1', 'rev-1')
  assert.deepEqual(stored?.outline, outline)
  assert.deepEqual(stored?.summary, summary)
})

test('a queued delete after a save cannot be undone by that older save', async () => {
  const storage = createMemoryStorage()
  const repository = new OverviewRepository('user-a', 'device-a', { storage })
  const saving = repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File', outline, summary } })
  const removing = repository.removeFileOverviews('source-1')
  await Promise.all([saving, removing])
  assert.equal(await repository.getFileOverview('source-1', 'rev-1'), null)
})

test('corrupt cached JSON is reported and is not overwritten by a partial save', async () => {
  const sql = new TemporarySqlite()
  try {
    const repository = new OverviewRepository('user-a', 'device-a', { sql })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File', outline, summary } })
    await sql.execute("UPDATE ai_overview_cache SET outline_json = '{bad' WHERE scope_id = 'source-1'")
    await assert.rejects(() => repository.getFileOverview('source-1', 'rev-1'), /OVERVIEW_CACHE_CORRUPT/)
    await assert.rejects(() => repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: { schemaVersion: 1, title: 'File', outline: null, summary } }), /OVERVIEW_CACHE_CORRUPT/)
  } finally { sql.close() }
})

test('empty-string JSON columns are treated as corrupt rather than absent', async () => {
  const sql = new TemporarySqlite()
  try {
    const repository = new OverviewRepository('user-a', 'device-a', { sql })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File', outline, summary } })
    await sql.execute("UPDATE ai_overview_cache SET summary_json = '' WHERE scope_id = 'source-1'")
    await assert.rejects(() => repository.getFileOverview('source-1', 'rev-1'), /OVERVIEW_CACHE_CORRUPT/)
  } finally { sql.close() }
})

test('browser cache rejects structurally invalid records with a stable corruption error', async () => {
  for (const payload of [
    '[null]',
    JSON.stringify([{ scopeType: 'FILE', scopeId: 'source-1', revisionKey: 'rev-1', schemaVersion: 1,
      title: 'File', outline: 'bad', summary: null, outlineGeneratedAt: null, summaryGeneratedAt: null,
      inputFingerprint: null, status: 'READY', errorCode: null, errorDetail: null, updatedAt: '2026-09-10T00:00:00.000Z' }]),
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
  assert.equal(stored?.outline, null)
  assert.equal(stored?.errorCode, 'MODEL_UNAVAILABLE')
  assert.equal(stored?.errorDetail, 'retry later')
})
