import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

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
  assert.match(sourceStore, /const \{ assetSizeBytes: _assetSizeBytes, \.\.\.mutationView \} = localView/)
  assert.match(sourceStore, /payload: mutationView as unknown as Record<string, unknown>/)
  assert.match(sourceStore, /function scheduleSync\(\): void/)
  const createFileSource = sourceStore.slice(sourceStore.indexOf('async function createFileSource'), sourceStore.indexOf('async function addSourceFile'))
  assert.doesNotMatch(createFileSource, /await scheduleSync\(\)/)
  assert.doesNotMatch(createFileSource, /await loadSourceFiles\(subjectId\)/)
  assert.match(createFileSource, /scheduleSync\(\)/)
  assert.match(sourceStore, /attachDocumentScheduler/)
  assert.match(sourceStore, /documentScheduler\.schedule\(model\.id\)/)
  assert.match(sourceStore, /ingestionStatus === 'AWAITING_CLIENT'/)
  assert.match(source, /ElNotification\(\{ title: '录入失败'/)
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
    assert.match(writes, /enqueueMutation/)
  }
  assert.match(taskWrites, /persistOffline\(model, '(?:UPDATE|DELETE)'/)
  const persistOffline = taskStore.slice(taskStore.indexOf('async function persistOffline'), taskStore.indexOf('async function addTask'))
  assert.match(persistOffline, /enqueueMutation/)
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
  const taskLoad = taskStore.slice(taskStore.indexOf('async function fetchTasks'), taskStore.indexOf('function replaceInMemory'))

  assert.match(subjectStore, /async function refreshSubjects/)
  assert.match(subjectLoad, /subjects\.value = await localSubjects\(\)/)
  assert.match(subjectLoad, /void refreshSubjects\(\)/)
  assert.doesNotMatch(subjectLoad, /await useSubjectApi\.list/)

  assert.match(sourceStore, /async function refreshSources/)
  assert.match(sourceLoad, /const local = await readLocal\(\)/)
  assert.match(sourceLoad, /void refreshSources\(\)/)
  assert.doesNotMatch(sourceLoad, /await useSourceApi\.list/)

  assert.match(knowledgeStore, /async function refreshBlocks/)
  assert.match(knowledgeLoad, /const local = await localBlocks\(subjectId\)/)
  assert.match(knowledgeLoad, /void refreshBlocks\(subjectId\)/)
  assert.doesNotMatch(knowledgeLoad, /await useKnowledgeApi\.list/)

  assert.match(taskStore, /async function refreshTasks/)
  assert.match(taskLoad, /await loadLocalTasks\(\)/)
  assert.match(taskLoad, /void refreshTasks\(\)/)
  assert.doesNotMatch(taskLoad, /await loadFromApi\(\)/)
})
