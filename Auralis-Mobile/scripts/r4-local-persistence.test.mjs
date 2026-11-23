import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

import { createSyncController } from '../src/services/syncController.ts'
import { selectEvictableCacheKeys } from '../src/services/localDocumentCache.ts'

function setupLocalDbTestEnv(context, options = {}) {
  const storage = new Map()
  globalThis.uni = {
    getStorageSync: (key) => storage.get(key) ?? '',
    setStorageSync: (key, val) => {
      if (options.onSet && options.onSet(key, val) === false) {
        return
      }
      storage.set(key, val)
    },
    removeStorageSync: (key) => {
      storage.delete(key)
    },
  }

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      if (specifier.startsWith('./') && !specifier.endsWith('.ts') && ctx.parentURL?.includes('Auralis-Mobile')) {
        return nextResolve(new URL(`${specifier}.ts`, ctx.parentURL).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })

  context.after(() => {
    loader.deregister()
    delete globalThis.uni
  })

  return storage
}

test('localDb persists sources with payload_json, prunes removed sources, and cascades deletion', async (context) => {
  setupLocalDbTestEnv(context)
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-persist-sources')
  const { localDb } = await import('../src/services/localDb.ts?local-persist-sources')

  localDataScope.activate('user-src-1', 'dev-1')
  await localDb.init()

  await localDb.saveSubject({
    id: 'sub-1',
    name: '编译原理',
    description: 'LL(1) & LR(1)',
    icon: 'book',
    version: 1,
  })

  const src1 = {
    id: 'src-1',
    subjectId: 'sub-1',
    type: 'FILE',
    title: "Lexer & Parser's Guide (V1)",
    assetId: 'asset-1',
    ingestionStatus: 'READY',
    ingestionRevision: 'rev-1',
    assetSizeBytes: 2457600,
    version: 3,
    createdAt: '2026-11-20T08:00:00.000Z',
  }
  const src2 = {
    id: 'src-2',
    subjectId: 'sub-1',
    type: 'FILE',
    title: 'DFA Notes.pdf',
    assetId: 'asset-2',
    ingestionStatus: 'PARSING',
    assetSizeBytes: 102400,
    version: 1,
    createdAt: '2026-11-21T08:00:00.000Z',
  }

  await localDb.replaceSubjectSources('sub-1', [src1, src2])
  let views = await localDb.getSourceViews('sub-1')
  assert.equal(views.length, 2)
  assert.equal(views[0].id, 'src-2')
  assert.equal(views[1].id, 'src-1')
  assert.equal(views[1].ingestionRevision, 'rev-1')
  assert.equal(views[1].assetSizeBytes, 2457600)

  await localDb.saveSourceOverviewCache('src-1', 'sub-1', 'rev-1', {
    scopeType: 'SOURCE',
    sourceId: 'src-1',
    ingestionRevision: 'rev-1',
    title: '词法分析总结',
    summaryMarkdown: 'Summary for src-1',
    outlineMarkdown: '# Outline',
    updatedAt: '2026-11-20T09:00:00.000Z',
  })
  assert.equal((await localDb.getSourceOverviewCache('src-1', 'rev-1'))?.title, '词法分析总结')

  // Removing src-1 in replaceSubjectSources must prune src-1 and cascade-delete its overview cache.
  await localDb.replaceSubjectSources('sub-1', [src2])
  views = await localDb.getSourceViews('sub-1')
  assert.deepEqual(views.map(item => item.id), ['src-2'])
  assert.equal(await localDb.getSourceOverviewCache('src-1', 'rev-1'), null)

  // Deleting subject cascades remaining sources, overviews, review states, and stats caches.
  await localDb.saveSubjectOverviewCache('sub-1', {
    scopeType: 'SUBJECT',
    subjectId: 'sub-1',
    title: '编译原理总览',
    summaryMarkdown: 'Subject summary',
    outlineMarkdown: '# Subject outline',
  })
  await localDb.replaceSubjectReviewStates('sub-1', [
    { knowledgeBlockId: 'kb-1', version: 2, needsLearning: false, mastered: true, stableSuccessCount: 3 },
  ])
  await localDb.saveSubjectStatsCache('sub-1', 7, 'Asia/Shanghai', {
    subjectId: 'sub-1',
    generatedAt: '2026-11-20T10:00:00.000Z',
    timeZone: 'Asia/Shanghai',
  })

  await localDb.deleteSubject('sub-1')
  assert.deepEqual(await localDb.getSourceViews('sub-1'), [])
  assert.equal(await localDb.getSubjectOverviewCache('sub-1'), null)
  assert.deepEqual(await localDb.getReviewStatesBySubject('sub-1'), [])
  assert.equal(await localDb.hasLoadedReviewStates('sub-1'), false)
  assert.equal(await localDb.getSubjectStatsCache('sub-1', 7, 'Asia/Shanghai'), null)
})

test('localDb persists ai_overview_cache with tricky SQL characters, revision fence, and 404 delete', async (context) => {
  setupLocalDbTestEnv(context)
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-persist-overview')
  const { localDb } = await import('../src/services/localDb.ts?local-persist-overview')

  localDataScope.activate('user-ov-1', 'dev-1')
  await localDb.init()

  const trickyOutline = [
    '# LL(1) WHERE AND Grammar',
    '- Rule "A\' -> alpha, (beta)" = $x^2 + y^2$',
    "- WHERE clause IS NOT NULL AND id != 'quoted'",
  ].join('\n')
  const trickySummary = "Summary with 'single quotes', \"double quotes\", commas, (parens), WHERE/AND keywords."

  await localDb.saveSubjectOverviewCache('sub-ov', {
    scopeType: 'SUBJECT',
    subjectId: 'sub-ov',
    title: "Compilers' Overview",
    outlineMarkdown: trickyOutline,
    summaryMarkdown: trickySummary,
    updatedAt: '2026-11-22T12:00:00.000Z',
  })
  const loadedSubject = await localDb.getSubjectOverviewCache('sub-ov')
  assert.equal(loadedSubject?.outlineMarkdown, trickyOutline)
  assert.equal(loadedSubject?.summaryMarkdown, trickySummary)

  // File overview must respect ingestionRevision fence and prune stale revisions.
  await localDb.saveSourceOverviewCache('src-ov', 'sub-ov', 'rev-old', {
    scopeType: 'SOURCE',
    sourceId: 'src-ov',
    ingestionRevision: 'rev-old',
    title: 'Old Rev',
    outlineMarkdown: '# Old',
    summaryMarkdown: 'Old summary',
    updatedAt: '2026-11-21T00:00:00.000Z',
  })
  assert.equal((await localDb.getSourceOverviewCache('src-ov', 'rev-old'))?.title, 'Old Rev')
  assert.equal(await localDb.getSourceOverviewCache('src-ov', 'rev-new'), null)

  await localDb.saveSourceOverviewCache('src-ov', 'sub-ov', 'rev-new', {
    scopeType: 'SOURCE',
    sourceId: 'src-ov',
    ingestionRevision: 'rev-new',
    title: 'New Rev',
    outlineMarkdown: trickyOutline,
    summaryMarkdown: trickySummary,
    updatedAt: '2026-11-22T00:00:00.000Z',
  })
  assert.equal(await localDb.getSourceOverviewCache('src-ov', 'rev-old'), null)
  assert.equal((await localDb.getSourceOverviewCache('src-ov', 'rev-new'))?.outlineMarkdown, trickyOutline)
  assert.equal((await localDb.getSourceOverviewCache('src-ov'))?.title, 'New Rev')

  await localDb.deleteSubjectOverviewCache('sub-ov')
  await localDb.deleteSourceOverviewCache('src-ov')
  assert.equal(await localDb.getSubjectOverviewCache('sub-ov'), null)
  assert.equal(await localDb.getSourceOverviewCache('src-ov'), null)
})

test('localDb persists review states, subject stats per days/timeZone, and isolates accounts/resets', async (context) => {
  setupLocalDbTestEnv(context)
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-persist-scope')
  const { localDb } = await import('../src/services/localDb.ts?local-persist-scope')

  localDataScope.activate('user-a', 'dev-a')
  await localDb.init()

  assert.equal(await localDb.hasLoadedReviewStates('sub-empty'), false)
  await localDb.replaceSubjectReviewStates('sub-empty', [])
  assert.equal(await localDb.hasLoadedReviewStates('sub-empty'), true)

  await localDb.replaceSubjectReviewStates('sub-r', [
    {
      knowledgeBlockId: 'kb-1',
      version: 1,
      needsLearning: false,
      mastered: false,
      stableSuccessCount: 1,
      dueAt: '2026-11-20T00:00:00.000Z',
    },
  ])
  await localDb.upsertReviewState('sub-r', {
    knowledgeBlockId: 'kb-1',
    version: 2,
    needsLearning: false,
    mastered: true,
    stableSuccessCount: 3,
  })
  const states = await localDb.getReviewStatesBySubject('sub-r')
  assert.equal(states.length, 1)
  assert.equal(states[0].mastered, true)
  assert.equal(states[0].version, 2)

  // Stats cache must isolate by subjectId + days + timeZone.
  await localDb.saveSubjectStatsCache('sub-r', 7, 'Asia/Shanghai', {
    subjectId: 'sub-r',
    generatedAt: '2026-11-22T01:00:00.000Z',
    timeZone: 'Asia/Shanghai',
    daily: [{ date: '2026-11-22', nonSkipReviewEventCount: 5 }],
  })
  await localDb.saveSubjectStatsCache('sub-r', 30, 'Asia/Shanghai', {
    subjectId: 'sub-r',
    generatedAt: '2026-11-22T01:00:00.000Z',
    timeZone: 'Asia/Shanghai',
    daily: [{ date: '2026-10-25', nonSkipReviewEventCount: 12 }],
  })
  assert.equal((await localDb.getSubjectStatsCache('sub-r', 7, 'Asia/Shanghai'))?.daily?.[0]?.nonSkipReviewEventCount, 5)
  assert.equal((await localDb.getSubjectStatsCache('sub-r', 30, 'Asia/Shanghai'))?.daily?.[0]?.nonSkipReviewEventCount, 12)
  assert.equal(await localDb.getSubjectStatsCache('sub-r', 7, 'UTC'), null)

  // Account switch isolates all new cache tables.
  localDataScope.activate('user-b', 'dev-b')
  await localDb.init()
  assert.equal(await localDb.hasLoadedReviewStates('sub-empty'), false)
  assert.deepEqual(await localDb.getReviewStatesBySubject('sub-r'), [])
  assert.equal(await localDb.getSubjectStatsCache('sub-r', 7, 'Asia/Shanghai'), null)

  // Switching back sees user-a data until resetOfflineData/localDataScope.reset clears scope visibility.
  localDataScope.activate('user-a', 'dev-a')
  assert.equal((await localDb.getReviewStatesBySubject('sub-r')).length, 1)
  assert.ok(await localDb.getSubjectStatsCache('sub-r', 7, 'Asia/Shanghai'))

  localDataScope.reset('user-a', 'dev-a')
  await localDb.init()
  assert.equal(await localDb.hasLoadedReviewStates('sub-empty'), false)
  assert.deepEqual(await localDb.getReviewStatesBySubject('sub-r'), [])
  assert.equal(await localDb.getSubjectStatsCache('sub-r', 7, 'Asia/Shanghai'), null)
})

test('localDb swallows derived-cache QuotaExceededError cleanly without crashing UI callers', async (context) => {
  setupLocalDbTestEnv(context, {
    onSet: (key) => {
      if (key.includes(':ai_overview_cache')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
      return true
    },
  })
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-persist-quota')
  const { localDb } = await import('../src/services/localDb.ts?local-persist-quota')

  localDataScope.activate('user-q', 'dev-q')
  await localDb.init()

  await localDb.saveSubjectOverviewCache('sub-q', {
    scopeType: 'SUBJECT',
    subjectId: 'sub-q',
    title: 'Large Overview',
    outlineMarkdown: '# Huge',
    summaryMarkdown: 'Content',
  })
  assert.equal(await localDb.getSubjectOverviewCache('sub-q'), null)
})

test('syncController preserves SourceView payload_json on snapshot/pull and forwards previousScope on reset', async () => {
  const savedSources = []
  const deletedSourceIds = []
  const resetHookScopes = []
  const metadata = new Map()
  let scopeCounter = 0
  let currentScope = 'scope-initial'

  const controller = createSyncController({
    getAuth: () => ({
      isAuthenticated: true,
      userId: 'u-1',
      serverDeviceId: 'dev-1',
      loginGeneration: Symbol.for('gen-1'),
    }),
    checkOnline: async () => true,
    syncApi: {
      async push() { return { results: [], serverCursor: 'c-1' } },
      async pull(cursor) {
        return {
          changes: cursor === 'c-snap'
            ? [{
                resourceType: 'SOURCE',
                resourceId: 'src-pull-1',
                mutationType: 'UPDATE',
                version: 4,
                payload: {
                  subjectId: 'sub-1',
                  type: 'FILE',
                  title: 'Pulled.pdf',
                  assetId: 'asset-p1',
                  ingestionStatus: 'READY',
                  ingestionRevision: 'rev-p1',
                  assetSizeBytes: 512000,
                },
              }]
            : [],
          nextCursor: 'c-next',
          hasMore: false,
          resetRequired: false,
        }
      },
      async snapshot() {
        return {
          snapshotCursor: 'c-snap',
          subjects: [],
          sources: [{
            id: 'src-snap-1',
            subjectId: 'sub-1',
            type: 'FILE',
            title: 'Snapshot.docx',
            assetId: 'asset-s1',
            ingestionStatus: 'READY',
            ingestionRevision: 'rev-s1',
            assetSizeBytes: 204800,
            version: 2,
          }],
          knowledgeBlocks: [],
          tasks: [],
          relations: [],
        }
      },
    },
    localDb: {
      async init() {},
      async getMetadata(key) { return metadata.get(key) ?? null },
      async setMetadata(key, val) { metadata.set(key, val) },
      async getUnsyncedMutations() { return [] },
      async markMutationSynced() {},
      async saveSubject() {},
      async deleteSubject() {},
      async saveSourceFile(file) { savedSources.push(file) },
      async deleteSourceFile(id) { deletedSourceIds.push(id) },
      async applyRemoteMutation() {},
    },
    localDataScope: {
      current: () => currentScope,
      reset: () => {
        scopeCounter += 1
        currentScope = `scope-reset-${scopeCounter}`
        return currentScope
      },
    },
    prefStorage: { get: () => 'true', set: () => {} },
    onDataChanged: async () => {},
    onLocalScopeReset: (previousScope) => {
      resetHookScopes.push(previousScope)
    },
  })

  await controller.syncNow()
  assert.equal(savedSources.length, 2)
  assert.equal(savedSources[0].file_size, 204800)
  assert.equal(JSON.parse(savedSources[0].payload_json).ingestionRevision, 'rev-s1')
  assert.equal(savedSources[1].file_size, 512000)
  assert.equal(JSON.parse(savedSources[1].payload_json).assetId, 'asset-p1')
  assert.deepEqual(deletedSourceIds, [])

  await controller.resetOfflineData()
  assert.deepEqual(resetHookScopes, ['scope-initial'])
  assert.equal(currentScope, 'scope-reset-1')
})

test('localDocumentCache selectEvictableCacheKeys evicts oldest LRU entries when exceeding bytes or count limits', () => {
  const entries = [
    { cacheKey: 'scope::a1', sizeBytes: 40, lastAccessedAt: 100 },
    { cacheKey: 'scope::a2', sizeBytes: 40, lastAccessedAt: 300 },
    { cacheKey: 'scope::a3', sizeBytes: 40, lastAccessedAt: 200 },
  ]

  // Incoming 50 bytes -> 120 + 50 = 170 > 120 limit: evicts oldest a1 (100) then a3 (200) -> remaining 40 + 50 = 90.
  assert.deepEqual(
    selectEvictableCacheKeys(entries, 50, 'scope::a4', 120, 10),
    ['scope::a1', 'scope::a3'],
  )

  // Updating existing entry a1 skips a1 as eviction candidate.
  assert.deepEqual(
    selectEvictableCacheKeys(entries, 50, 'scope::a1', 140, 10),
    [],
  )

  // Count limit = 3 with incoming new key evicts oldest 1 item.
  assert.deepEqual(
    selectEvictableCacheKeys(entries, 10, 'scope::a4', 10_000, 3),
    ['scope::a1'],
  )
})
