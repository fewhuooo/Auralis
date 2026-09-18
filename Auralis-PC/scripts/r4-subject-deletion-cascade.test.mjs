import assert from 'node:assert/strict'
import { register } from 'node:module'
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
const { LocalAssetRepository } = await import('../src/services/localAssetRepository.ts')
const { LocalAssetService, TransientBrowserAssetAdapter } = await import('../src/services/localAssetService.ts')
const { OverviewRepository } = await import('../src/services/overviewRepository.ts')
const { SubjectDeletionCoordinator } = await import('../src/services/subjectDeletionCoordinator.ts')

const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const now = '2026-09-18T01:00:00.000Z'

function mutation(resourceType, resourceId, mutationType = 'CREATE') {
  return { clientMutationId: `${resourceType}-${resourceId}-${mutationType}`, resourceType, resourceId, mutationType, baseVersion: 0, payload: { id: resourceId }, createdAt: now }
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
  assert.equal(await assetRepo.getAssetFile('asset-a'), null)
})

test('subject deletion reconciliation is idempotent and preserves an asset referenced by another active source', async () => {
  const storage = createMemoryStorage()
  const repo = new LocalRepository('user-a', 'device-a', { storage, now: () => now })
  await repo.upsert('SUBJECT', 'subject-a', { id: 'subject-a' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-a', { id: 'source-a', subjectId: 'subject-a', assetId: 'asset-shared' }, { version: 1 })
  await repo.upsert('SOURCE', 'source-b', { id: 'source-b', subjectId: 'subject-b', assetId: 'asset-shared' }, { version: 1 })
  const assetRepo = new LocalAssetRepository('user-a', 'device-a', { storage, now: () => now })
  const assetService = new LocalAssetService(assetRepo, { nativeAdapter: new TransientBrowserAssetAdapter() })
  await assetRepo.createAssetFile({ localAssetId: 'asset-shared', originalName: 'shared.pdf', mimeType: 'application/pdf', sizeBytes: 0, sha256: sha })
  await assetRepo.createSourceDraft({ localSourceId: 'source-a', localAssetId: 'asset-shared', subjectId: 'subject-a', title: 'A', localContentRevision: 'r1' })
  const coordinator = new SubjectDeletionCoordinator({ repo, assetRepo, assetService })
  await repo.commitMutation({ resourceType: 'SUBJECT', resourceId: 'subject-a', value: { id: 'subject-a' }, version: 1, deletedAt: now, mutation: mutation('SUBJECT', 'subject-a', 'DELETE') })
  await coordinator.reconcileDeletedSubject('subject-a')
  await coordinator.reconcileDeletedSubject('subject-a')
  assert.ok(await assetRepo.getAssetFile('asset-shared'))
})
