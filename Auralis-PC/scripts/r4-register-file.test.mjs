import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceSchedulingPolicy = import('../src/utils/sourceSchedulingPolicy.ts')

test('subject file registration validates prerequisites and exposes upload state', async () => {
  const source = await readFile(new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url), 'utf8')
  const sourceStore = await readFile(new URL('../src/store/useSourceStore.ts', import.meta.url), 'utf8')

  assert.match(source, /!registerForm\.subjectId\s*\|\|\s*!droppedFile\s*\|\|\s*isUploading/)
  assert.match(source, /const isUploading = ref\(false\)/)
  assert.match(source, /isUploading\.value = true/)
  assert.match(source, /finally\s*\{[\s\S]*?isUploading\.value = false/)
  assert.match(source, /const asset = await assetStore\.upload\(currentFile, \(percent, stage\) =>/)
  assert.match(source, /uploadProgress\.value = percent/)
  assert.match(source, /await sourceStore\.createFileSource\(\s*targetSubjectId,\s*registerForm\.value\.name\.trim\(\),\s*asset\.id,\s*'\[\]',\s*asset\.sizeBytes,\s*\)/)
  assert.match(sourceStore, /async function createFileSource\([\s\S]*assetSizeBytes\?: number,?\s*\)/)
  assert.match(sourceStore, /assetSizeBytes: normalizedAssetSizeBytes/)
  assert.match(sourceStore, /function scheduleSync\(\): void/)
  const createFileSource = sourceStore.slice(sourceStore.indexOf('async function createFileSource'), sourceStore.indexOf('async function addSourceFile'))
  assert.doesNotMatch(createFileSource, /await scheduleSync\(\)/)
  assert.doesNotMatch(createFileSource, /await loadSourceFiles\(subjectId\)/)
  assert.match(createFileSource, /scheduleSync\(\)/)
  assert.match(sourceStore, /attachDocumentScheduler/)
  assert.match(sourceStore, /documentScheduler\.schedule\(model\.id\)/)
  assert.match(sourceStore, /shouldScheduleAwaitingClientDocument\(model\)/)
  assert.match(source, /ElNotification\(\{ title: '录入失败'/)
})

test('automatic document scheduling waits for the server ingestion revision', async () => {
  const { shouldScheduleAwaitingClientDocument } = await sourceSchedulingPolicy
  const sourceStore = await readFile(new URL('../src/store/useSourceStore.ts', import.meta.url), 'utf8')
  const base = { ingestionStatus: 'AWAITING_CLIENT', assetId: 'asset-1' }

  assert.equal(shouldScheduleAwaitingClientDocument(base), false)
  assert.equal(shouldScheduleAwaitingClientDocument({ ...base, ingestionRevision: 'revision-1' }), true)
  assert.match(sourceStore, /shouldScheduleAwaitingClientDocument\(model\)/)
})

test('PC domain writes use the durable outbox before background sync', async () => {
  const files = await Promise.all([
    'useSubjectStore.ts',
    'useSourceStore.ts',
    'useKnowledgeStore.ts',
    'useTaskStore.ts',
  ].map((file) => readFile(new URL(`../src/store/${file}`, import.meta.url), 'utf8')))

  const [subjectStore, sourceStore, knowledgeStore, taskStore] = files
  const subjectWrites = subjectStore.slice(subjectStore.indexOf('async function updateSubject'), subjectStore.indexOf('const loadSourceFiles'))
  const sourceWrites = sourceStore.slice(sourceStore.indexOf('async function deleteSourceFile'), sourceStore.indexOf('function attachDocumentScheduler'))
  const knowledgeWrites = knowledgeStore.slice(knowledgeStore.indexOf('async function updateBlock'), knowledgeStore.indexOf('return {'))
  const taskWrites = taskStore.slice(taskStore.indexOf('async function updateTaskModel'), taskStore.indexOf('function analyzeSchedule'))

  assert.doesNotMatch(subjectWrites, /await useSubjectApi\.(update|delete)/)
  assert.doesNotMatch(sourceWrites, /await useSourceApi\.(update|delete)/)
  assert.doesNotMatch(knowledgeWrites, /await useKnowledgeApi\.(update|delete)/)
  assert.doesNotMatch(taskWrites, /await useTaskApi\.(update|delete)/)
  for (const writes of [subjectWrites, sourceWrites, knowledgeWrites]) {
    assert.match(writes, /scheduleSync\(\)/)
    assert.match(writes, /commitMutation/)
  }
  assert.match(taskWrites, /persistOffline\(model, '(?:UPDATE|DELETE)'/)
  const persistOffline = taskStore.slice(taskStore.indexOf('async function persistOffline'), taskStore.indexOf('async function addTask'))
  assert.match(persistOffline, /commitMutation/)
  assert.match(persistOffline, /scheduleSync\(\)/)
})

test('PC list loaders return local data before refreshing from the network', async () => {
  const files = await Promise.all([
    'useSubjectStore.ts',
    'useSourceStore.ts',
    'useKnowledgeStore.ts',
    'useTaskStore.ts',
  ].map((file) => readFile(new URL(`../src/store/${file}`, import.meta.url), 'utf8')))

  const [subjectStore, sourceStore, knowledgeStore, taskStore] = files
  const subjectLoad = subjectStore.slice(subjectStore.indexOf('async function loadSubjects'), subjectStore.indexOf('function setActiveSubject'))
  const sourceLoad = sourceStore.slice(sourceStore.indexOf('async function loadSources'), sourceStore.indexOf('async function loadSourceFiles'))
  const knowledgeLoad = knowledgeStore.slice(knowledgeStore.indexOf('async function fetchBlocks'), knowledgeStore.indexOf('async function loadLocalBlocks'))
  const knowledgeHydration = knowledgeStore.slice(knowledgeStore.indexOf('async function loadLocalBlocks'), knowledgeStore.indexOf('subscribeProjectionChange((change)'))
  const knowledgeRead = knowledgeStore.slice(knowledgeStore.indexOf('async function readLocalBlocks'), knowledgeStore.indexOf('async function fetchBlocks'))
  const taskLoad = taskStore.slice(taskStore.indexOf('async function fetchTasks'), taskStore.indexOf('function replaceInMemory'))

  assert.doesNotMatch(subjectStore, /async function refreshSubjects/)
  assert.match(subjectLoad, /await hydrateSubjects\(\)/)
  assert.match(subjectLoad, /requestBackgroundSync\('read'\)/)
  assert.doesNotMatch(subjectLoad, /await useSubjectApi\.list/)

  assert.doesNotMatch(sourceStore, /async function refreshSources/)
  assert.match(sourceLoad, /const local = await hydrateSources\(\)/)
  assert.match(sourceLoad, /requestBackgroundSync\('read'\)/)
  assert.doesNotMatch(sourceLoad, /await useSourceApi\.list/)

  assert.doesNotMatch(knowledgeStore, /async function refreshBlocks/)
  assert.match(knowledgeLoad, /const local = await loadLocalBlocks\(_subject, subjectId\)[\s\S]*requestBackgroundSync\('read'\)[\s\S]*return local/)
  assert.match(knowledgeHydration, /const local = await readLocalBlocks\(subjectId\)[\s\S]*recentBlocks\.value = local[\s\S]*return local/)
  assert.match(knowledgeRead, /const repo = await repository\(\)[\s\S]*repo\.list<KnowledgeBlockView>\('KNOWLEDGE_BLOCK'/)
  assert.doesNotMatch(knowledgeLoad, /await useKnowledgeApi\.list/)

  assert.doesNotMatch(taskStore, /async function refreshTasks/)
  assert.match(taskLoad, /await loadLocalTasks\(\)/)
  assert.match(taskLoad, /requestBackgroundSync\('read'\)/)
  assert.doesNotMatch(taskLoad, /await loadFromApi\(\)/)
})

test('ordinary PC resource stores hydrate projections instead of resource list APIs', async () => {
  for (const file of ['useSubjectStore.ts', 'useSourceStore.ts', 'useKnowledgeStore.ts', 'useTaskStore.ts']) {
    const source = await readFile(new URL(`../src/store/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /await use(?:Subject|Source|Knowledge|Task)Api\.list\(/)
    assert.match(source, /requestBackgroundSync\('read'\)/)
  }
})

test('file register dialog and callers guard against fake 100% completion and reset progress on failure', async () => {
  const dialog = await readFile(new URL('../src/components/asset/FileRegisterDialog.vue', import.meta.url), 'utf8')
  const workspace = await readFile(new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url), 'utf8')
  const asset = await readFile(new URL('../src/views/Asset/index.vue', import.meta.url), 'utf8')

  assert.match(dialog, /const isCompleted = computed\(/)
  assert.match(dialog, /isCompleted \? t\(\{\s*'zh-CN': '导入完成'[^\n]+\) :/)
  assert.doesNotMatch(dialog, /ceiling = Math\.max\(rawTarget, 86\)/)
  assert.match(workspace, /catch \(e: any\) \{[\s\S]*?uploadProgress\.value = 0/)
  assert.match(asset, /catch \(err: any\) \{[\s\S]*?uploadProgress\.value = 0/)
})

