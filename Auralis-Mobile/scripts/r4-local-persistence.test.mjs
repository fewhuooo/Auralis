import assert from 'node:assert/strict'
import test from 'node:test'

import { createSyncController } from '../src/services/syncController.ts'
import { selectEvictableCacheKeys } from '../src/services/localDocumentCache.ts'
import { createTabletNoteRepository } from '../src/services/tabletNoteRepositoryCore.ts'
import { createNoteDocument } from '../src/services/tabletNoteModel.ts'
import { installLocalDbTestEnv } from './test-helpers/nodeSqliteTauriMock.mjs'
import {
  BLOCK_THEME_COLORS,
  DEFAULT_BLOCK_THEME_COLOR,
  normalizeBlockThemeColor,
  resolveBlockSourceLabel,
  resolveWorkspaceCreatedBlockSource,
} from '../src/utils/blockSyncMapper.ts'
import { MAX_UPLOAD_FILE_SIZE_BYTES, validateUploadFile } from '../src/utils/uploadValidation.ts'

function setupLocalDbTestEnv(context, options = {}) {
  return installLocalDbTestEnv(context, options)
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

test('localDb swallows derived-cache SQLite write failures cleanly without crashing UI callers', async (context) => {
  setupLocalDbTestEnv(context, {
    onExecute: (_path, sql) => {
      if (/^\s*(?:INSERT|UPDATE)\b/i.test(sql) && sql.includes('ai_overview_cache')) {
        throw new Error('SQLITE_FULL: database or disk is full')
      }
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

test('localDb auto-initializes on first read/write in a new scope and localDataScope.deactivate clears active scope', async (context) => {
  const { storage } = setupLocalDbTestEnv(context)
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-auto-init')
  const { localDb } = await import('../src/services/localDb.ts?local-auto-init')

  const scope = localDataScope.activate('user-auto', 'dev-auto')
  assert.notEqual(scope, 'legacy-unassigned')

  // Write and read immediately without calling localDb.init() first.
  await localDb.saveSubject({
    id: 'sub-auto',
    name: '自动初始化测试',
    description: '冷启动门禁',
    icon: 'book',
    version: 1,
  })
  const subjects = await localDb.getSubjects()
  assert.equal(subjects.length, 1)
  assert.equal(subjects[0].id, 'sub-auto')

  localDataScope.deactivate()
  assert.equal(localDataScope.current(), 'legacy-unassigned')
  assert.equal(storage.get('auralis:local-data-scope:v2'), undefined)
  assert.deepEqual(await localDb.getSubjects(), [])
})

test('localDb preserves subjects.sortKey, updates source_files.subject_id, sanitizes task.duration, and clears prior scope storage', async (context) => {
  const env = setupLocalDbTestEnv(context)
  const { storage } = env
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-batch2')
  const { localDb } = await import('../src/services/localDb.ts?local-batch2')

  const scope = localDataScope.activate('user-b2', 'dev-b2')
  await localDb.init()

  await localDb.saveSubject({
    id: 'sub-sort',
    name: '数据结构',
    description: 'Tree & Graph',
    icon: 'subj-code',
    sortKey: '0|hzzzzz:',
    version: 2,
  })
  const loadedSubjects = await localDb.getSubjects()
  assert.equal(loadedSubjects[0].sortKey, '0|hzzzzz:')
  assert.equal(loadedSubjects[0].sort_key, '0|hzzzzz:')

  // Updating subject without passing sortKey must preserve existing sort_key.
  await localDb.saveSubject({
    id: 'sub-sort',
    name: '数据结构与算法',
    description: 'Tree & Graph',
    icon: 'subj-code',
    version: 3,
  })
  assert.equal((await localDb.getSubjects())[0].sortKey, '0|hzzzzz:')

  // Moving a source between subjects updates subject_id on existing row.
  await localDb.saveSourceFile({
    id: 'src-move',
    subject_id: 'sub-old',
    name: 'Algo.pdf',
    file_path: 'asset-move',
    file_type: 'FILE',
    file_size: 1024,
    catalog_json: '["ch1"]',
    block_count: 5,
    version: 1,
    payload_json: JSON.stringify({ id: 'src-move', subjectId: 'sub-old', title: 'Algo.pdf' }),
  })
  await localDb.saveSourceFile({
    id: 'src-move',
    subject_id: 'sub-new',
    name: 'Algo.pdf',
    file_path: 'asset-move',
    file_type: 'FILE',
    file_size: 1024,
    version: 2,
    payload_json: JSON.stringify({ id: 'src-move', subjectId: 'sub-new', title: 'Algo.pdf' }),
  })
  assert.deepEqual(await localDb.getSourceViews('sub-old'), [])
  const movedViews = await localDb.getSourceViews('sub-new')
  assert.equal(movedViews.length, 1)
  assert.equal((await localDb.getSourceFiles('sub-new'))[0].block_count, 5)

  // Non-finite duration must be sanitized rather than breaking SQL interpolation.
  await localDb.saveTask({
    id: 'task-nan',
    name: 'Sanitized Duration',
    subject: '数据结构',
    subjectId: 'sub-sort',
    desc: '',
    duration: Number.NaN,
    status: 'pending',
    position: 'a',
  })
  const savedTasks = await localDb.getTasks()
  assert.equal(savedTasks[0].duration, 0)

  // Seed focus key and another active scope, then verify clearScopeStorage drops only target scope data & handle.
  storage.set(`auralis:local:${scope}:focus_state`, JSON.stringify({ status: 'paused' }))
  assert.equal(env.openPaths.has(`sqlite:auralis_${scope}.db`), true)
  assert.ok(storage.has(`auralis:local:${scope}:focus_state`))

  const otherScope = localDataScope.activate('user-other', 'dev-other')
  await localDb.saveSubject({
    id: 'sub-other',
    name: '离散数学',
    description: 'Logic & Graph',
    icon: 'book',
    version: 1,
  })
  assert.equal(env.openPaths.has(`sqlite:auralis_${otherScope}.db`), true)

  await localDb.clearScopeStorage(scope)
  assert.equal(storage.has(`auralis:local:${scope}:focus_state`), false)
  assert.equal(env.openPaths.has(`sqlite:auralis_${scope}.db`), false)
  assert.equal(env.closedPaths.includes(`sqlite:auralis_${scope}.db`), true)
  assert.equal(env.openPaths.has(`sqlite:auralis_${otherScope}.db`), true)
  assert.equal((await localDb.getSubjects()).length, 1)

  localDataScope.activate('user-b2', 'dev-b2')
  assert.deepEqual(await localDb.getSubjects(), [])
  assert.deepEqual(await localDb.getTasks(), [])
})

test('localDb pins multi-step writes to initial scope across async switch and closes idle handles without dropping data', async (context) => {
  let switchMidWrite = false
  let scopeA = ''
  let switchedTo = ''
  const env = setupLocalDbTestEnv(context, {
    onSelect: (path, sql) => {
      if (switchMidWrite && scopeA && path.includes(scopeA) && sql.includes('SELECT id, sort_key FROM subjects')) {
        switchMidWrite = false
        switchedTo = globalThis.__pinScopeSwitch()
      }
    },
  })
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-pin-close')
  const { localDb } = await import('../src/services/localDb.ts?local-pin-close')

  scopeA = localDataScope.activate('user-a-pin', 'dev-1')
  const scopeB = localDataScope.activate('user-b-pin', 'dev-1')
  await localDb.init()
  localDataScope.activate('user-a-pin', 'dev-1')
  await localDb.init()

  globalThis.__pinScopeSwitch = () => localDataScope.activate('user-b-pin', 'dev-1')
  switchMidWrite = true
  try {
    await localDb.saveSubject({
      id: 'sub-pinned-a',
      name: 'Pinned To Scope A',
      description: 'Must stay in A',
      icon: 'book',
      version: 1,
    })
  } finally {
    delete globalThis.__pinScopeSwitch
  }
  assert.equal(switchedTo, scopeB)
  // Scope B must not receive Scope A's in-flight saveSubject write
  assert.deepEqual(await localDb.getSubjects(), [])

  // Close Scope A idle pool explicitly while Scope B stays active, then verify Scope A data persists on reopen
  await localDb.closeScope(scopeA)
  assert.equal(env.openPaths.has(`sqlite:auralis_${scopeA}.db`), false)
  assert.equal(env.openPaths.has(`sqlite:auralis_${scopeB}.db`), true)

  localDataScope.activate('user-a-pin', 'dev-1')
  const aSubjects = await localDb.getSubjects()
  assert.equal(aSubjects.length, 1)
  assert.equal(aSubjects[0].id, 'sub-pinned-a')

  await localDb.closeInactiveScopes(scopeA)
  assert.equal(env.openPaths.has(`sqlite:auralis_${scopeA}.db`), true)
  assert.equal(env.openPaths.has(`sqlite:auralis_${scopeB}.db`), false)
})

test('tabletNoteRepository persists and queries notes via localDb.executeSql over real SQLite', async (context) => {
  setupLocalDbTestEnv(context)
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-tablet-notes')
  const { localDb } = await import('../src/services/localDb.ts?local-tablet-notes')

  localDataScope.activate('user-notes', 'dev-tablet')
  const repository = createTabletNoteRepository(localDb)
  await repository.initSchema()

  const doc = createNoteDocument({
    id: 'note-1',
    mode: 'subject-handwriting-note',
    subjectId: 'sub-phys',
    title: "Why Newton's Law?",
    now: '2026-11-25T10:00:00.000Z',
  })
  await repository.save(doc)
  const loaded = await repository.load('note-1')
  assert.equal(loaded?.title, "Why Newton's Law?")

  await repository.save({
    ...doc,
    title: "Newton's Second Law?",
    updatedAt: '2026-11-25T11:00:00.000Z',
  })
  const subjectNotes = await repository.listBySubject('sub-phys', 'subject-handwriting-note')
  assert.equal(subjectNotes.length, 1)
  assert.equal(subjectNotes[0].title, "Newton's Second Law?")
})

test('resolveBlockSourceLabel, normalizeBlockThemeColor, and resolveWorkspaceCreatedBlockSource align with PC workspace', () => {
  const sources = [
    { id: 'src-1', title: '第三章_特征工程.pdf' },
    { id: 'src-2', title: '期末复习提纲.docx' },
  ]

  // Synced block resolves source title from sourceFileId, falling back gracefully
  assert.equal(resolveBlockSourceLabel({ source: '', sourceFileId: 'src-1' }, sources), '第三章_特征工程.pdf')
  assert.equal(resolveBlockSourceLabel({ source: '手动创建', sourceFileId: 'src-missing' }, sources), '手动创建')
  assert.equal(resolveBlockSourceLabel({ source: '', sourceFileId: 'src-1' }, []), '自主整理')

  // Theme color normalization maps empty and legacy #8B9A6E to PC default green preset and keeps chosen presets
  assert.equal(BLOCK_THEME_COLORS.length, 5)
  assert.equal(normalizeBlockThemeColor(''), DEFAULT_BLOCK_THEME_COLOR)
  assert.equal(normalizeBlockThemeColor(null), DEFAULT_BLOCK_THEME_COLOR)
  assert.equal(normalizeBlockThemeColor('#8B9A6E'), DEFAULT_BLOCK_THEME_COLOR)
  assert.equal(normalizeBlockThemeColor('rgba(179,192,207,0.4)'), 'rgba(179,192,207,0.4)')

  // Workspace creation binds active selected source when present, otherwise '手动创建'
  assert.deepEqual(
    resolveWorkspaceCreatedBlockSource({ id: 'src-2', title: '期末复习提纲.docx' }),
    { source: '期末复习提纲.docx', sourceFileId: 'src-2' },
  )
  assert.deepEqual(
    resolveWorkspaceCreatedBlockSource(null),
    { source: '手动创建', sourceFileId: undefined },
  )
})

test('localDb.upsertSourceView persists uploaded source view without overwriting siblings, and validateUploadFile enforces format and size bounds', async (context) => {
  setupLocalDbTestEnv(context)
  const { localDataScope } = await import('../src/services/localDataScope.ts?local-upsert-source')
  const { localDb } = await import('../src/services/localDb.ts?local-upsert-source')

  localDataScope.activate('user-src-upsert', 'dev-1')
  await localDb.init()

  await localDb.replaceSubjectSources('sub-u1', [
    {
      id: 'src-existing',
      subjectId: 'sub-u1',
      type: 'FILE',
      title: 'Existing.pdf',
      assetId: 'asset-existing',
      version: 1,
      createdAt: '2026-11-23T08:00:00.000Z',
    },
  ])

  await localDb.upsertSourceView('sub-u1', {
    id: 'src-mobile-home',
    subjectId: 'sub-u1',
    type: 'FILE',
    title: 'MobileCapture.docx',
    assetId: 'asset-mobile-home',
    ingestionStatus: 'PENDING',
    assetSizeBytes: 2048,
    version: 0,
    createdAt: '2026-11-24T09:00:00.000Z',
  })

  const views = await localDb.getSourceViews('sub-u1')
  assert.equal(views.length, 2)
  assert.equal(views[0].id, 'src-mobile-home')
  assert.equal(views[0].title, 'MobileCapture.docx')
  assert.equal(views[1].id, 'src-existing')

  assert.throws(
    () => validateUploadFile({ path: '/tmp/bad.exe', name: 'bad.exe', size: 1024, mimeType: 'application/octet-stream' }),
    /仅支持/,
  )
  assert.throws(
    () => validateUploadFile({ path: '/tmp/huge.pdf', name: 'huge.pdf', size: MAX_UPLOAD_FILE_SIZE_BYTES + 1, mimeType: 'application/pdf' }),
    /50 MB/,
  )
})
