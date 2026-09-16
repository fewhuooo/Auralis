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

const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalRepository } = await import('../src/services/localRepository.ts')
const { LocalAssetRepository } = await import('../src/services/localAssetRepository.ts')
const { LocalSourceDraftService } = await import('../src/services/localSourceDraftService.ts')

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

test('LocalSourceDraftService: createDraft writes projection and draft, never writes SOURCE outbox mutation', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286812'
    const localSourceId = '8f123456-789a-4bcd-ef01-23456789abcd'

    // First register local asset in assetRepo
    await assetRepo.createAssetFile({
      localAssetId,
      originalName: 'lecture.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
      state: 'READY_LOCAL',
    })

    // Create draft
    const draft = await draftService.createDraft({
      localSourceId,
      localAssetId,
      subjectId: 'subject-math',
      title: 'Math Lecture 1',
    })

    assert.equal(draft.localSourceId, localSourceId)
    assert.equal(draft.state, 'DRAFT')

    // Verify local Source projection exists
    const projection = await localRepo.read('SOURCE', localSourceId)
    assert.ok(projection, 'Projection must exist in local_resource_records')
    assert.equal(projection.value.title, 'Math Lecture 1')
    assert.equal(projection.value.assetId, localAssetId)
    assert.equal(projection.syncStatus, 'pending')

    // CRITICAL: Outbox local_mutations MUST BE EMPTY!
    const unresolvedMutations = await localRepo.listUnresolved()
    const sourceMutations = unresolvedMutations.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(sourceMutations.length, 0, 'No SOURCE outbox mutation must be created while asset is not ready')
  } finally {
    sqlite.close()
  }
})

test('LocalSourceDraftService: releaseDraftsForAsset maps serverAssetId and releases SOURCE/CREATE with same localSourceId', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-1', 'dev-1', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-1', 'dev-1', { sql: sqlite })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)

    const localAssetId = 'd3b07384-d113-4f4b-a2c3-4d64f0286812'
    const serverAssetId = 'ee777777-8888-4999-aaaa-bbbbbbbbbbbb'
    const localSourceId = '8f123456-789a-4bcd-ef01-23456789abcd'

    await assetRepo.createAssetFile({
      localAssetId,
      originalName: 'lecture.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
      state: 'READY_LOCAL',
    })

    await draftService.createDraft({
      localSourceId,
      localAssetId,
      subjectId: 'subject-math',
      title: 'Math Lecture 1',
    })

    // Now asset is complete and mapped to serverAssetId
    await assetRepo.mapServerAssetId(localAssetId, serverAssetId)
    await assetRepo.transitionAssetState(localAssetId, 'SYNCED')

    // Release drafts
    const released = await draftService.releaseDraftsForAsset(localAssetId, serverAssetId)
    assert.deepEqual(released, [localSourceId])

    // Verify projection updated with serverAssetId
    const projection = await localRepo.read('SOURCE', localSourceId)
    assert.ok(projection)
    assert.equal(projection.value.assetId, serverAssetId, 'Projection assetId must be mapped to serverAssetId')

    // Verify SOURCE/CREATE mutation in outbox
    const unresolvedMutations = await localRepo.listUnresolved()
    const sourceMutations = unresolvedMutations.filter((m) => m.resourceType === 'SOURCE')
    assert.equal(sourceMutations.length, 1, 'Exactly one SOURCE CREATE mutation must be queued')
    assert.equal(sourceMutations[0].resourceId, localSourceId, 'Must preserve the exact same localSourceId')
    assert.equal(sourceMutations[0].mutationType, 'CREATE')
    assert.equal(sourceMutations[0].payload.assetId, serverAssetId)

    // Releasing again is idempotent
    const releasedAgain = await draftService.releaseDraftsForAsset(localAssetId, serverAssetId)
    assert.equal(releasedAgain.length, 0, 'No drafts should be re-released')
  } finally {
    sqlite.close()
  }
})
