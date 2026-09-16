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
const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalAssetRepository, computeLocalAssetRelativePath } = await import('../src/services/localAssetRepository.ts')

class TemporarySqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:')
  }

  async execute(sql, bindValues = []) {
    this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues)
  }

  async select(sql, bindValues = []) {
    return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues)
  }

  close() {
    this.database.close()
  }
}

const sampleSha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

test('local asset repository isolates user and device scopes in SQLite', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)

    const repoA1 = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })
    const repoB1 = new LocalAssetRepository('user-b', 'device-1', { sql: sqlite })
    const repoA2 = new LocalAssetRepository('user-a', 'device-2', { sql: sqlite })

    await repoA1.createAssetFile({
      localAssetId: 'asset-1',
      relativePath: 'assets/user-a/asset-1/content.pdf',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: sampleSha,
      state: 'READY_LOCAL',
    })

    const foundA1 = await repoA1.getAssetFile('asset-1')
    assert.ok(foundA1)
    assert.equal(foundA1.localAssetId, 'asset-1')
    assert.equal(foundA1.userId, 'user-a')
    assert.equal(foundA1.serverDeviceId, 'device-1')

    assert.equal(await repoB1.getAssetFile('asset-1'), null)
    assert.equal(await repoA2.getAssetFile('asset-1'), null)

    const listA1 = await repoA1.listAssetFiles()
    assert.equal(listA1.length, 1)
    assert.equal((await repoB1.listAssetFiles()).length, 0)
    assert.equal((await repoA2.listAssetFiles()).length, 0)
  } finally {
    sqlite.close()
  }
})

test('local asset file legal state transitions succeed and illegal transitions reject', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repo = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    await repo.createAssetFile({
      localAssetId: 'asset-1',
      relativePath: 'assets/user-a/asset-1/content.pdf',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: sampleSha,
      state: 'STAGING',
    })

    // STAGING -> READY_LOCAL is legal
    const ready = await repo.transitionAssetState('asset-1', 'READY_LOCAL')
    assert.equal(ready.state, 'READY_LOCAL')

    // READY_LOCAL -> SYNCING is legal
    const syncing = await repo.transitionAssetState('asset-1', 'SYNCING')
    assert.equal(syncing.state, 'SYNCING')

    // SYNCING -> SYNC_FAILED is legal
    const failed = await repo.transitionAssetState('asset-1', 'SYNC_FAILED')
    assert.equal(failed.state, 'SYNC_FAILED')

    // SYNC_FAILED -> SYNCING is legal
    const syncingAgain = await repo.transitionAssetState('asset-1', 'SYNCING')
    assert.equal(syncingAgain.state, 'SYNCING')

    // SYNCING -> SYNCED is legal
    const synced = await repo.transitionAssetState('asset-1', 'SYNCED')
    assert.equal(synced.state, 'SYNCED')

    // SYNCED -> STAGING is illegal
    await assert.rejects(
      () => repo.transitionAssetState('asset-1', 'STAGING'),
      /LOCAL_ASSET_ILLEGAL_TRANSITION/
    )

    // SYNCED -> CORRUPT is legal
    const corrupt = await repo.transitionAssetState('asset-1', 'CORRUPT')
    assert.equal(corrupt.state, 'CORRUPT')

    // CORRUPT -> DELETING is legal
    const deleting = await repo.transitionAssetState('asset-1', 'DELETING')
    assert.equal(deleting.state, 'DELETING')

    // DELETING -> READY_LOCAL is illegal (terminal)
    await assert.rejects(
      () => repo.transitionAssetState('asset-1', 'READY_LOCAL'),
      /LOCAL_ASSET_ILLEGAL_TRANSITION/
    )
  } finally {
    sqlite.close()
  }
})

test('server asset ID mapping maps and queries accurately', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repo = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    await repo.createAssetFile({
      localAssetId: 'asset-local-1',
      relativePath: 'assets/user-a/asset-1/content.pdf',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: sampleSha,
      state: 'READY_LOCAL',
    })

    assert.equal(await repo.getAssetFileByServerId('server-asset-999'), null)

    await repo.mapServerAssetId('asset-local-1', 'server-asset-999')
    const found = await repo.getAssetFileByServerId('server-asset-999')
    assert.ok(found)
    assert.equal(found.localAssetId, 'asset-local-1')
    assert.equal(found.serverAssetId, 'server-asset-999')

    // Creating second asset and trying to map duplicate server ID fails
    await repo.createAssetFile({
      localAssetId: 'asset-local-2',
      relativePath: 'assets/user-a/asset-2/content.pdf',
      originalName: 'report2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: sampleSha,
      state: 'READY_LOCAL',
    })
    await assert.rejects(
      () => repo.mapServerAssetId('asset-local-2', 'server-asset-999'),
      /LOCAL_ASSET_SERVER_ID_DUPLICATE|constraint failed/i
    )
  } finally {
    sqlite.close()
  }
})

test('source drafts CRUD and server binding work with scope isolation', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repo = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })
    const repoB = new LocalAssetRepository('user-b', 'device-1', { sql: sqlite })

    const draft = await repo.createSourceDraft({
      localSourceId: 'draft-source-1',
      localAssetId: 'asset-1',
      subjectId: 'subject-1',
      title: 'Math Notes',
      localContentRevision: 'local-rev-1',
    })
    assert.equal(draft.state, 'DRAFT')
    assert.equal(draft.serverSourceId, null)

    assert.ok(await repo.getSourceDraft('draft-source-1'))
    assert.equal(await repoB.getSourceDraft('draft-source-1'), null)

    const draftsForAsset = await repo.listSourceDrafts({ localAssetId: 'asset-1' })
    assert.equal(draftsForAsset.length, 1)

    // Bind server source
    const bound = await repo.bindServerSource('draft-source-1', 'server-source-100', 'ingestion-rev-5')
    assert.equal(bound.serverSourceId, 'server-source-100')
    assert.equal(bound.serverIngestionRevision, 'ingestion-rev-5')
    assert.equal(bound.state, 'SYNCED')
  } finally {
    sqlite.close()
  }
})

test('source reference counting detects drafts, local resource records, and mutations', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repo = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    await repo.createAssetFile({
      localAssetId: 'asset-1',
      relativePath: 'assets/user-a/asset-1/content.pdf',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: sampleSha,
      state: 'READY_LOCAL',
    })

    // Initially 0 references
    assert.equal(await repo.countActiveSourceReferences('asset-1'), 0)
    assert.equal(await repo.hasActiveSourceReferences('asset-1'), false)

    // 1. Add active draft referencing asset-1
    await repo.createSourceDraft({
      localSourceId: 'draft-1',
      localAssetId: 'asset-1',
      subjectId: 'subj-1',
      title: 'Physics',
      localContentRevision: 'rev-1',
    })
    assert.equal(await repo.countActiveSourceReferences('asset-1'), 1)
    assert.equal(await repo.hasActiveSourceReferences('asset-1'), true)

    // Mark draft DELETED -> references drop back to 0
    await repo.deleteSourceDraft('draft-1')
    assert.equal(await repo.countActiveSourceReferences('asset-1'), 0)
    assert.equal(await repo.hasActiveSourceReferences('asset-1'), false)

    // 2. Map server asset ID
    await repo.mapServerAssetId('asset-1', 'server-asset-1')

    // Add active SOURCE in local_resource_records with assetId = 'server-asset-1'
    await sqlite.execute(
      'INSERT INTO local_resource_records (user_id, resource_type, resource_id, version, deleted_at, payload) VALUES ($1, $2, $3, $4, $5, $6)',
      ['user-a', 'SOURCE', 'source-rec-1', 1, null, JSON.stringify({ id: 'source-rec-1', assetId: 'server-asset-1' })]
    )
    assert.equal(await repo.countActiveSourceReferences('asset-1'), 1)
    assert.equal(await repo.hasActiveSourceReferences('asset-1'), true)

    // Soft delete that record -> reference count drops to 0
    await sqlite.execute(
      "UPDATE local_resource_records SET deleted_at = '2026-09-16T00:00:00.000Z' WHERE resource_id = 'source-rec-1'"
    )
    assert.equal(await repo.countActiveSourceReferences('asset-1'), 0)
    assert.equal(await repo.hasActiveSourceReferences('asset-1'), false)

    // 3. Add pending mutation in local_mutations
    await sqlite.execute(
      `INSERT INTO local_mutations (client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version, payload, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['mut-1', 'user-a', 'SOURCE', 'source-rec-2', 'CREATE', 0, JSON.stringify({ assetId: 'server-asset-1' }), 'pending', '2026-09-16T00:00:00.000Z']
    )
    assert.equal(await repo.countActiveSourceReferences('asset-1'), 1)
    assert.equal(await repo.hasActiveSourceReferences('asset-1'), true)

    // Settle mutation to applied -> 0 references
    await sqlite.execute("UPDATE local_mutations SET status = 'applied' WHERE client_mutation_id = 'mut-1'")
    assert.equal(await repo.countActiveSourceReferences('asset-1'), 0)
  } finally {
    sqlite.close()
  }
})

test('sync job claim, retry scheduling, and completion work with time boundaries', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repo = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    const job1 = await repo.enqueueSyncJob('asset-1')
    assert.equal(job1.phase, 'PENDING')
    assert.equal(job1.attempt, 0)
    assert.equal(job1.nextRetryAt, null)

    // Enqueueing again returns the existing active job
    const job1Again = await repo.enqueueSyncJob('asset-1')
    assert.equal(job1Again.jobId, job1.jobId)

    // Claim next sync job
    const claimed = await repo.claimNextSyncJob('2026-09-16T12:00:00.000Z')
    assert.ok(claimed)
    assert.equal(claimed.jobId, job1.jobId)
    assert.equal(claimed.phase, 'CREATING_REMOTE_ASSET')
    assert.equal(claimed.attempt, 1)

    // Second claim finds nothing since job1 is now in CREATING_REMOTE_ASSET
    assert.equal(await repo.claimNextSyncJob('2026-09-16T12:00:00.000Z'), null)

    // Schedule retry with backoff time in future
    await repo.scheduleRetry(job1.jobId, 'NETWORK_OFFLINE', 'No route to host', '2026-09-16T12:05:00.000Z')
    const retriedJob = await repo.getSyncJob(job1.jobId)
    assert.equal(retriedJob.phase, 'PENDING')
    assert.equal(retriedJob.safeErrorCode, 'NETWORK_OFFLINE')
    assert.equal(retriedJob.nextRetryAt, '2026-09-16T12:05:00.000Z')

    // Claim at 12:02:00 (before retry time) returns null
    assert.equal(await repo.claimNextSyncJob('2026-09-16T12:02:00.000Z'), null)

    // Claim at 12:05:01 (after retry time) claims it
    const claimed2 = await repo.claimNextSyncJob('2026-09-16T12:05:01.000Z')
    assert.ok(claimed2)
    assert.equal(claimed2.jobId, job1.jobId)
    assert.equal(claimed2.attempt, 2)

    // Complete sync job
    await repo.completeSyncJob(job1.jobId)
    const completedJob = await repo.getSyncJob(job1.jobId)
    assert.equal(completedJob.phase, 'SYNCED')
  } finally {
    sqlite.close()
  }
})

test('browser storage fallback supports asset files, drafts, jobs, and reference counting', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalAssetRepository('user-a', 'device-1', { storage })
  const repoB = new LocalAssetRepository('user-b', 'device-1', { storage })

  await repo.createAssetFile({
    localAssetId: 'asset-1',
    relativePath: 'assets/user-a/asset-1/content.pdf',
    originalName: 'test.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 500,
    sha256: sampleSha,
    state: 'READY_LOCAL',
  })

  assert.ok(await repo.getAssetFile('asset-1'))
  assert.equal(await repoB.getAssetFile('asset-1'), null)

  // Transition
  await repo.transitionAssetState('asset-1', 'SYNCING')
  assert.equal((await repo.getAssetFile('asset-1'))?.state, 'SYNCING')

  // Illegal transition
  await assert.rejects(
    () => repo.transitionAssetState('asset-1', 'STAGING'),
    /LOCAL_ASSET_ILLEGAL_TRANSITION/
  )

  // Draft & reference counting
  assert.equal(await repo.hasActiveSourceReferences('asset-1'), false)
  await repo.createSourceDraft({
    localSourceId: 'draft-1',
    localAssetId: 'asset-1',
    subjectId: 'subj-1',
    title: 'Test Draft',
    localContentRevision: 'rev-1',
  })
  assert.equal(await repo.hasActiveSourceReferences('asset-1'), true)
  await repo.deleteSourceDraft('draft-1')
  assert.equal(await repo.hasActiveSourceReferences('asset-1'), false)

  // Sync job
  const job = await repo.enqueueSyncJob('asset-1')
  assert.equal(job.phase, 'PENDING')
  const claimed = await repo.claimNextSyncJob('2026-09-16T12:00:00.000Z')
  assert.ok(claimed)
  assert.equal(claimed.phase, 'CREATING_REMOTE_ASSET')
})

test('SQLite relative_path is computed from logical identity and rejects absolute paths', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repo = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    // 1. computeLocalAssetRelativePath helper
    const path = computeLocalAssetRelativePath('user-a', 'asset-x', 'pdf')
    assert.equal(path, 'assets/user-a/asset-x/content.pdf')

    // 2. Default computation on createAssetFile
    const file = await repo.createAssetFile({
      localAssetId: 'asset-auto',
      originalName: 'lecture_notes.PDF',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: sampleSha,
      safeExtension: 'pdf',
    })
    assert.equal(file.relativePath, 'assets/user-a/asset-auto/content.pdf')

    // 3. Raw SQLite table verification: never persists absolute paths
    const raw = sqlite.database
      .prepare('SELECT * FROM local_asset_files WHERE local_asset_id = ?')
      .get('asset-auto')
    assert.equal(raw.relative_path, 'assets/user-a/asset-auto/content.pdf')
    assert.equal(raw.absolute_path, undefined)

    // 4. Reject persisting absolute paths
    await assert.rejects(
      () => repo.createAssetFile({
        localAssetId: 'asset-abs',
        relativePath: 'C:/Users/User/AppData/content.pdf',
        originalName: 'bad.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: sampleSha,
      }),
      /LOCAL_ASSET_RELATIVE_PATH_INVALID/
    )
  } finally {
    sqlite.close()
  }
})
