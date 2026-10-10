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
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.match(/\\.(ts|js|mjs)$/)) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context)
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { DocumentProcessingJobRepository, LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts')
const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalAssetRepository } = await import('../src/services/localAssetRepository.ts')
const { LocalAssetService, TransientBrowserAssetAdapter } = await import('../src/services/localAssetService.ts')
const { LocalSourceDraftService } = await import('../src/services/localSourceDraftService.ts')
const { LocalAssetSyncQueue } = await import('../src/services/localAssetSyncQueue.ts')
const { OverviewRepository } = await import('../src/services/overviewRepository.ts')
const { SubjectDeletionCoordinator } = await import('../src/services/subjectDeletionCoordinator.ts')
const { runSyncCycle } = await import('../src/services/syncCycle.ts')
const { subscribeProjectionChange } = await import('../src/services/localProjectionEvents.ts')

const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const now = '2026-09-18T01:00:00.000Z'

function mutation(resourceType, resourceId, mutationType = 'CREATE') {
  return { clientMutationId: `${resourceType}-${resourceId}-${mutationType}`, resourceType, resourceId, mutationType, baseVersion: 0, payload: { id: resourceId }, createdAt: now }
}

class TemporarySqlite {
  constructor() { this.database = new DatabaseSync(':memory:') }
  async execute(sql, bindValues = []) { this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues) }
  async select(sql, bindValues = []) { return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues) }
  close() { this.database.close() }
}

test('subject deletion coordinator local-tombstones descendants without child outbox mutations', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalRepository('user-a', 'device-a', { storage, now: () => now })
  await repo.upsert('SUBJECT', 'subject-a', { id: 'subject-a', name: 'A' }, { version: 4 })
  await repo.upsert('SUBJECT', 'subject-b', { id: 'subject-b', name: 'B' }, { version: 2 })
  await repo.upsert('SOURCE', 'source-a', { id: 'source-a', subjectId: 'subject-a', assetId: 'asset-a' }, { version: 1 })
  await repo.upsert('KNOWLEDGE_BLOCK', 'block-a', { id: 'block-a', subjectId: 'subject-a' }, { version: 1 })
  await repo.upsert('TASK', 'task-a', { id: 'task-a', subjectId: 'subject-a' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-b', { id: 'source-b', subjectId: 'subject-b', assetId: 'asset-b' }, { version: 1 })
  await repo.enqueueMutation(mutation('SOURCE', 'source-a'))
  await repo.enqueueMutation(mutation('KNOWLEDGE_BLOCK', 'block-a'))

  const assetRepo = new LocalAssetRepository('user-a', 'device-a', { storage, now: () => now })
  const assetService = new LocalAssetService(assetRepo, { nativeAdapter: new TransientBrowserAssetAdapter() })
  await assetService.importAsset({ localAssetId: 'asset-a', file: new File([''], 'a.pdf', { type: 'application/pdf' }), originalName: 'a.pdf', mimeType: 'application/pdf', expectedSize: 0, expectedSha256: sha })
  await assetRepo.createSourceDraft({ localSourceId: 'source-a', localAssetId: 'asset-a', subjectId: 'subject-a', title: 'A', localContentRevision: 'r1' })
  await assetRepo.enqueueSyncJob('asset-a')
  assert.ok(await assetRepo.claimNextSyncJob(now), 'test must model an already-claimed asset queue job')

  const overview = new OverviewRepository('user-a', 'device-a', { storage, now: () => now })
  await overview.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: 'f', response: { title: 'A', outline: [], summary: { overview: 'x', keyPoints: [], learningPath: [] } } })
  await overview.saveFileOverviewPart({ sourceId: 'source-a', ingestionRevision: 'rev-a', mode: 'ALL', response: { title: 'A', outline: [], summary: { overview: 'x', keyPoints: [], learningPath: [] } } })
  const jobs = new DocumentProcessingJobRepository('user-a', 'device-a', { storage, now: () => now })
  await jobs.create({ jobId: 'job-a', sourceId: 'source-a', ingestionRevision: 'rev-a' })
  const coordinator = new SubjectDeletionCoordinator({ repo, assetRepo, assetService, overview, jobs })

  await repo.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-a', value: { id: 'subject-a', name: 'A' }, version: 4, deletedAt: now, mutation: mutation('SUBJECT', 'subject-a', 'DELETE') })
  await coordinator.reconcileDeletedSubject('subject-a')

  assert.equal((await repo.list('SOURCE', { includeDeleted: false })).some(row => row.id === 'source-a'), false)
  assert.equal((await repo.list('KNOWLEDGE_BLOCK', { includeDeleted: false })).some(row => row.id === 'block-a'), false)
  assert.equal((await repo.list('TASK', { includeDeleted: false })).some(row => row.id === 'task-a'), false)
  assert.equal((await repo.list('SOURCE', { includeDeleted: false })).some(row => row.id === 'source-b'), true)
  assert.deepEqual((await repo.listUnresolved()).map(item => `${item.resourceType}:${item.resourceId}`), ['SUBJECT:subject-a'])
  assert.equal(await overview.getSubjectOverview('subject-a'), null)
  assert.equal(await overview.getFileOverview('source-a', 'rev-a'), null)
  assert.equal((await jobs.list()).length, 0)
  assert.equal((await assetRepo.getSourceDraft('source-a'))?.state, 'DRAFT', 'pending parent delete must retain recoverable draft metadata')
  const draftService = new LocalSourceDraftService(assetRepo, repo, () => now)
  assert.deepEqual(await draftService.releaseDraftsForAsset('asset-a', 'server-asset-a'), [], 'a resumed claimed queue must not recreate SOURCE/CREATE')
  assert.equal((await repo.listUnresolved()).some((item) => item.resourceType === 'SOURCE'), false)
  assert.ok(await assetRepo.getAssetFile('asset-a'), 'pending parent delete must preserve bytes')
  await repo.markApplied('SUBJECT-subject-a-DELETE')
  await coordinator.reconcileDeletedSubject('subject-a')
  assert.equal(await assetRepo.getAssetFile('asset-a'), null, 'APPLIED parent delete may release last-reference bytes')
})

test('subject deletion reconciliation is idempotent and preserves an asset referenced by another active source', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalRepository('user-a', 'device-a', { storage, now: () => now })
  await repo.upsert('SUBJECT', 'subject-a', { id: 'subject-a' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-a', { id: 'source-a', subjectId: 'subject-a', assetId: 'asset-shared' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-b', { id: 'source-b', subjectId: 'subject-b', assetId: 'asset-shared' }, { version: 1 })
  const assetRepo = new LocalAssetRepository('user-a', 'device-a', { storage, now: () => now })
  const assetService = new LocalAssetService(assetRepo, { nativeAdapter: new TransientBrowserAssetAdapter() })
  await assetRepo.createAssetFile({ localAssetId: 'asset-shared', serverAssetId: 'server-asset-shared', originalName: 'shared.pdf', mimeType: 'application/pdf', sizeBytes: 0, sha256: sha })
  await assetRepo.createSourceDraft({ localSourceId: 'source-a', localAssetId: 'asset-shared', subjectId: 'subject-a', title: 'A', localContentRevision: 'r1' })
  const coordinator = new SubjectDeletionCoordinator({ repo, assetRepo, assetService })
  await repo.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-a', value: { id: 'subject-a' }, version: 1, deletedAt: now, mutation: mutation('SUBJECT', 'subject-a', 'DELETE') })
  await coordinator.reconcileDeletedSubject('subject-a')
  await coordinator.reconcileDeletedSubject('subject-a')
  assert.ok(await assetRepo.getAssetFile('asset-shared'))
  await repo.markApplied('SUBJECT-subject-a-DELETE')
  await coordinator.reconcileDeletedSubject('subject-a')
  assert.ok(await assetRepo.getAssetFile('asset-shared'), 'an APPLIED parent still preserves a server-backed asset shared by another Source')
})

test('claimed queue release cannot create SOURCE after the parent delete marker wins before the child fence', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalRepository('user-lock-race', 'device-lock-race', { storage, now: () => now })
  const assetRepo = new LocalAssetRepository('user-lock-race', 'device-lock-race', { storage, now: () => now })
  const assetService = new LocalAssetService(assetRepo, { nativeAdapter: new TransientBrowserAssetAdapter() })
  await repo.upsert('SUBJECT', 'subject-lock-race', { id: 'subject-lock-race', name: 'Race' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-lock-race', { id: 'source-lock-race', subjectId: 'subject-lock-race', assetId: 'asset-lock-race' }, { version: 0 })
  await assetService.importAsset({
    localAssetId: 'asset-lock-race',
    file: new File([''], 'race.pdf', { type: 'application/pdf' }),
    originalName: 'race.pdf',
    mimeType: 'application/pdf',
    expectedSize: 0,
    expectedSha256: sha,
  })
  await assetRepo.createSourceDraft({
    localSourceId: 'source-lock-race',
    localAssetId: 'asset-lock-race',
    subjectId: 'subject-lock-race',
    title: 'Race',
    localContentRevision: 'e3b0c442-98fc-1c49-87ae-f4c8996fb924',
  })
  await assetRepo.enqueueSyncJob('asset-lock-race')
  const coordinator = new SubjectDeletionCoordinator({ repo, assetRepo, assetService })

  // The parent marker is durable, but the coordinator has not acquired the
  // lifecycle lock to tombstone children yet.
  await repo.commitMutation({
    resourceType: 'SUBJECT',
    resourceId: 'subject-lock-race',
    value: { id: 'subject-lock-race', name: 'Race' },
    version: 1,
    deletedAt: now,
    mutation: mutation('SUBJECT', 'subject-lock-race', 'DELETE'),
  })

  let sourceReadStarted
  const sourceReadStartedPromise = new Promise((resolve) => { sourceReadStarted = resolve })
  let releaseSourceRead
  const releaseSourceReadPromise = new Promise((resolve) => { releaseSourceRead = resolve })
  const originalRead = repo.read.bind(repo)
  let paused = true
  repo.read = async (resourceType, resourceId) => {
    if (paused && resourceType === 'SOURCE' && resourceId === 'source-lock-race') {
      paused = false
      sourceReadStarted()
      await releaseSourceReadPromise
    }
    return originalRead(resourceType, resourceId)
  }

  let wakeupCount = 0
  const queue = new LocalAssetSyncQueue({
    assetRepository: assetRepo,
    assetService,
    draftService: new LocalSourceDraftService(assetRepo, repo, () => now),
    api: {
      async createUploadIntent() {
        return { assetId: 'server-asset-lock-race', uploadStatus: 'READY' }
      },
    },
    onWakeup: () => { wakeupCount++ },
  })

  // This is the already-claimed queue path. Its SOURCE read is a barrier
  // proving it owns the lifecycle lock before the coordinator can enter.
  const releasePromise = queue.processQueue()
  await sourceReadStartedPromise
  const fencePromise = coordinator.markDeletedSubject('subject-lock-race')
  releaseSourceRead()

  await releasePromise
  await fencePromise
  assert.equal(wakeupCount, 0, 'suppressed draft release must not wake SOURCE sync')
  assert.equal((await repo.listUnresolved()).some((item) => item.resourceType === 'SOURCE'), false)
  assert.equal((await assetRepo.getSourceDraft('source-lock-race'))?.state, 'DRAFT')
  assert.ok(await assetService.readAssetFile({ localAssetId: 'asset-lock-race' }), 'claimed queue race must preserve local bytes')
  queue.dispose()
})

test('subject deletion invokes the active runtime hooks before dropping derived work', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalRepository('user-runtime-hooks', 'device-runtime-hooks', { storage, now: () => now })
  await repo.upsert('SUBJECT', 'subject-runtime-hooks', { id: 'subject-runtime-hooks' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-runtime-hooks', { id: 'source-runtime-hooks', subjectId: 'subject-runtime-hooks' }, { version: 1 })
  const calls = []
  const coordinator = new SubjectDeletionCoordinator({
    repo,
    hooks: {
      discardSource: async (sourceId) => calls.push(`source:${sourceId}`),
      discardFileOverview: async (sourceId) => calls.push(`overview:${sourceId}`),
    },
  })
  await repo.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-runtime-hooks', value: { id: 'subject-runtime-hooks' }, version: 1, deletedAt: now, mutation: mutation('SUBJECT', 'subject-runtime-hooks', 'DELETE') })
  await coordinator.reconcileDeletedSubject('subject-runtime-hooks')
  assert.deepEqual(calls, ['source:source-runtime-hooks', 'overview:source-runtime-hooks'])
})

test('SQL cascade is user-scoped, cleans relations, and publishes every affected projection type', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const first = new LocalRepository('user-a', 'device-a', { sql: sqlite, now: () => now })
    const other = new LocalRepository('user-b', 'device-a', { sql: sqlite, now: () => now })
    await first.upsert('SUBJECT', 'subject-a', { id: 'subject-a' }, { version: 1 })
    await first.upsert('SOURCE', 'source-a', { id: 'source-a', subjectId: 'subject-a' }, { version: 1 })
    await first.upsert('RELATION', 'relation-a', { id: 'relation-a', sourceType: 'SUBJECT', sourceId: 'subject-a', targetType: 'SOURCE', targetId: 'source-a' }, { version: 1 })
    await other.upsert('SOURCE', 'source-a', { id: 'source-a', subjectId: 'subject-a' }, { version: 1 })
    const changes = []
    const unsubscribe = subscribeProjectionChange((change) => changes.push([...change.resourceTypes].sort()))
    const coordinator = new SubjectDeletionCoordinator({ repo: first })
    await first.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-a', value: { id: 'subject-a' }, version: 1, deletedAt: now, mutation: mutation('SUBJECT', 'subject-a', 'DELETE') })
    await coordinator.reconcileDeletedSubject('subject-a')
    unsubscribe()
    assert.equal((await first.list('SOURCE', { includeDeleted: false })).length, 0)
    assert.equal((await first.list('RELATION', { includeDeleted: false })).length, 0)
    assert.equal((await other.list('SOURCE', { includeDeleted: false })).length, 1)
    assert.deepEqual(changes.at(-1), ['KNOWLEDGE_BLOCK', 'RELATION', 'SOURCE', 'SUBJECT', 'TASK'])
    const replayChanges = []
    const unsubscribeReplay = subscribeProjectionChange((change) => replayChanges.push([...change.resourceTypes].sort()))
    await coordinator.reconcileDeletedSubject('subject-a')
    unsubscribeReplay()
    assert.deepEqual(replayChanges.at(-1), ['KNOWLEDGE_BLOCK', 'RELATION', 'SOURCE', 'SUBJECT', 'TASK'], 'reconciliation replay must refresh stores even when child tombstones already exist')
  } finally { sqlite.close() }
})

test('rejected Subject DELETE restores remote Subject, clears the unresolved fence, and snapshots children once', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalRepository('user-a', 'device-a', { storage, now: () => now })
  await repo.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-a', value: { id: 'subject-a', name: 'A', version: 2 }, version: 2, deletedAt: now, mutation: mutation('SUBJECT', 'subject-a', 'DELETE') })
  const api = {
    async pushChanges() { return { results: [{ clientMutationId: 'SUBJECT-subject-a-DELETE', decision: 'CONFLICT', resourceType: 'SUBJECT', resourceId: 'subject-a', current: { id: 'subject-a', name: 'Remote A', version: 3, deletedAt: null } }] } },
    async pullChanges() { return { changes: [], nextCursor: 'snap', hasMore: false } },
    async getSnapshot() { return { snapshotCursor: 'snap', subjects: [{ id: 'subject-a', name: 'Remote A', version: 3 }], sources: [{ id: 'source-a', subjectId: 'subject-a', version: 1 }], knowledgeBlocks: [], tasks: [], relations: [] } },
  }
  const result = await runSyncCycle({ repository: repo, api, serverDeviceId: 'device-a' })
  assert.equal(result.cursor, 'snap')
  assert.equal((await repo.read('SUBJECT', 'subject-a'))?.deletedAt, null)
  assert.equal((await repo.read('SUBJECT', 'subject-a'))?.value.name, 'Remote A')
  assert.equal((await repo.listUnresolved()).length, 0)
  assert.equal((await repo.read('SOURCE', 'source-a'))?.deletedAt, null)
})

test('rejected Subject DELETE atomically sets reset_required and retries a failed snapshot in browser and SQL state', async () => {
  for (const mode of ['browser', 'sql']) {
    const sqlite = mode === 'sql' ? new TemporarySqlite() : null
    try {
      if (sqlite) await createVersionedLocalSchema(sqlite)
      const repo = new LocalRepository('user-reset', 'device-reset', sqlite ? { sql: sqlite, now: () => now } : { storage: createMemoryStorage(), now: () => now })
      await repo.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-reset', value: { id: 'subject-reset', name: 'Local', version: 2 }, version: 2, deletedAt: now, mutation: mutation('SUBJECT', 'subject-reset', 'DELETE') })
      let snapshotAttempts = 0
      const api = {
        async pushChanges() { return { results: [{ clientMutationId: 'SUBJECT-subject-reset-DELETE', decision: 'REJECTED', resourceType: 'SUBJECT', resourceId: 'subject-reset', current: { id: 'subject-reset', name: 'Remote', version: 3, deletedAt: null } }] } },
        async pullChanges() { throw new Error('PULL_MUST_NOT_RUN_WHILE_RESET_REQUIRED') },
        async getSnapshot() {
          snapshotAttempts += 1
          if (snapshotAttempts === 1) throw new Error('SNAPSHOT_TEMPORARILY_UNAVAILABLE')
          return { snapshotCursor: 'reset-ok', subjects: [{ id: 'subject-reset', name: 'Remote', version: 3 }], sources: [{ id: 'source-reset', subjectId: 'subject-reset', version: 1 }], knowledgeBlocks: [], tasks: [], relations: [] }
        },
      }
      await assert.rejects(runSyncCycle({ repository: repo, api, serverDeviceId: 'device-reset' }), /SNAPSHOT_TEMPORARILY_UNAVAILABLE/)
      assert.equal((await repo.read('SUBJECT', 'subject-reset'))?.deletedAt, null)
      assert.equal((await repo.listUnresolved()).length, 0)
      assert.equal((await repo.getSyncState()).resetRequired, true)
      const retry = await runSyncCycle({ repository: repo, api, serverDeviceId: 'device-reset' })
      assert.equal(retry.cursor, 'reset-ok')
      assert.equal((await repo.getSyncState()).resetRequired, false)
      assert.equal((await repo.read('SOURCE', 'source-reset'))?.deletedAt, null)
    } finally {
      sqlite?.close()
    }
  }
})

test('rejected Subject DELETE reprojects a local-only draft and preserves its asset bytes', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalRepository('user-local-reject', 'device-local-reject', { storage, now: () => now })
  const assetRepo = new LocalAssetRepository('user-local-reject', 'device-local-reject', { storage, now: () => now })
  await repo.upsert('SUBJECT', 'subject-local-reject', { id: 'subject-local-reject', name: 'Local' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-local-reject', { id: 'source-local-reject', subjectId: 'subject-local-reject', assetId: 'asset-local-reject' }, { version: 0 })
  await assetRepo.createAssetFile({ localAssetId: 'asset-local-reject', originalName: 'local.pdf', mimeType: 'application/pdf', sizeBytes: 0, sha256: sha })
  await assetRepo.createSourceDraft({ localSourceId: 'source-local-reject', localAssetId: 'asset-local-reject', subjectId: 'subject-local-reject', title: 'Local', localContentRevision: 'e3b0c442-98fc-1c49-27ae-f4c8996fb924' })
  await assetRepo.enqueueSyncJob('asset-local-reject')
  const coordinator = new SubjectDeletionCoordinator({ repo, assetRepo })
  await repo.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-local-reject', value: { id: 'subject-local-reject', name: 'Local' }, version: 1, deletedAt: now, mutation: mutation('SUBJECT', 'subject-local-reject', 'DELETE') })
  await coordinator.reconcileDeletedSubject('subject-local-reject')
  const api = {
    async pushChanges() { return { results: [{ clientMutationId: 'SUBJECT-subject-local-reject-DELETE', decision: 'REJECTED', resourceType: 'SUBJECT', resourceId: 'subject-local-reject', current: { id: 'subject-local-reject', name: 'Remote', version: 2, deletedAt: null } }] } },
    async pullChanges() { return { changes: [], nextCursor: 'local-reject', hasMore: false, resetRequired: false } },
    async getSnapshot() { return { snapshotCursor: 'local-reject', subjects: [{ id: 'subject-local-reject', name: 'Remote', version: 2 }], sources: [], knowledgeBlocks: [], tasks: [], relations: [] } },
  }
  await runSyncCycle({ repository: repo, api, serverDeviceId: 'device-local-reject' })
  await coordinator.reconcileDeletedSubjects()
  assert.equal((await assetRepo.getSourceDraft('source-local-reject'))?.state, 'DRAFT')
  assert.ok(await assetRepo.getAssetFile('asset-local-reject'))
  assert.equal((await assetRepo.getActiveSyncJobForAsset('asset-local-reject')) !== null, true)
  assert.equal((await repo.read('SOURCE', 'source-local-reject'))?.deletedAt, null)
  assert.equal((await repo.listUnresolved()).some((item) => item.resourceType === 'SOURCE'), false)
})

async function assertDeletedSubjectFenceSurvivesCleanupFailure(failurePoint) {
  const storage = createMemoryStorage()
  const subjectId = `subject-delete-${failurePoint}-failure`
  const repo = new LocalRepository('user-delete-cleanup-failure', `device-${failurePoint}-failure`, { storage, now: () => now })
  await repo.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Local subject' }, { version: 2 })
  const overview = new OverviewRepository('user-delete-cleanup-failure', `device-${failurePoint}-failure`, { storage, now: () => now })
  const originalResponse = {
    title: 'Existing result',
    outline: [{ title: 'Chapter', sections: [{ title: 'Section', summary: 'Text', sourceIds: ['source-a'], locator: null }] }],
    summary: { overview: 'Original summary', keyPoints: ['Point'], learningPath: ['Chapter'] },
  }
  await overview.saveSubjectOverviewPart({ subjectId, mode: 'ALL', inputFingerprint: 'fingerprint', response: originalResponse })
  await repo.commitMutation({
    resourceType: 'SUBJECT', resourceId: subjectId, value: { id: subjectId, name: 'Local subject' }, version: 2,
    deletedAt: now, mutation: mutation('SUBJECT', subjectId, 'DELETE'),
  })

  let cancelCalls = 0
  let failCascadeOnce = failurePoint === 'cascade'
  let failOverviewCleanupOnce = failurePoint === 'overview-cleanup'
  const scopedOverview = {
    beginScopeDeletion: overview.beginScopeDeletion.bind(overview),
    completeScopeDeletion: overview.completeScopeDeletion.bind(overview),
    cancelScopeDeletion(ticket) { cancelCalls += 1; return overview.cancelScopeDeletion(ticket) },
    reactivateRestoredScope: overview.reactivateRestoredScope.bind(overview),
    removeFileOverviews: overview.removeFileOverviews.bind(overview),
    async removeSubjectOverview(id) {
      if (failOverviewCleanupOnce) { failOverviewCleanupOnce = false; throw new Error('OVERVIEW_CLEANUP_FAILED') }
      return overview.removeSubjectOverview(id)
    },
  }
  const originalCascade = repo.tombstoneSubjectChildren.bind(repo)
  repo.tombstoneSubjectChildren = async (...args) => {
    if (failCascadeOnce) { failCascadeOnce = false; throw new Error('SUBJECT_CASCADE_FAILED') }
    return originalCascade(...args)
  }
  const coordinator = new SubjectDeletionCoordinator({ repo, overview: scopedOverview })

  await assert.rejects(coordinator.reconcileDeletedSubject(subjectId), new RegExp(failurePoint === 'cascade'
    ? 'SUBJECT_CASCADE_FAILED' : 'OVERVIEW_CLEANUP_FAILED'))

  assert.equal(cancelCalls, 0, 'a durable parent tombstone must keep its Overview lifecycle fence after child cleanup fails')
  assert.equal(overview.isScopeFenceTokenCurrent(overview.captureScopeFenceToken('SUBJECT', subjectId)), false)
  await assert.rejects(overview.saveSubjectOverviewPart({
    subjectId, mode: 'ALL', inputFingerprint: 'late-fingerprint',
    response: { ...originalResponse, title: 'Late stale save' },
  }), /OVERVIEW_SCOPE_DELETED/)
  assert.equal((await overview.getSubjectOverview(subjectId))?.title, 'Existing result')

  await coordinator.reconcileDeletedSubject(subjectId)
  assert.equal(cancelCalls, 0)
  assert.equal(overview.isScopeFenceTokenCurrent(overview.captureScopeFenceToken('SUBJECT', subjectId)), false)
  assert.equal(await overview.getSubjectOverview(subjectId), null, 'the existing reconciliation path retries deferred cleanup')
  await assert.rejects(overview.saveSubjectOverviewPart({
    subjectId, mode: 'ALL', inputFingerprint: 'retry-late-fingerprint',
    response: { ...originalResponse, title: 'Late stale save after retry' },
  }), /OVERVIEW_SCOPE_DELETED/)
}

test('a failed Subject cascade keeps the durable deletion fence and rejects a late Overview save', async () => {
  await assertDeletedSubjectFenceSurvivesCleanupFailure('cascade')
})

test('a failed Subject Overview cleanup keeps the durable deletion fence and rejects a late Overview save', async () => {
  await assertDeletedSubjectFenceSurvivesCleanupFailure('overview-cleanup')
})
