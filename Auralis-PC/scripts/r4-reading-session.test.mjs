import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

test('reading sessions are source scoped and end without restoring history', async () => {
  const store = await source('src/store/useChatStore.ts')
  assert.match(store, /purpose: 'READING_SESSION'/)
  assert.match(store, /startReadingSession\(sourceId: string, subjectId: string/)
  assert.match(store, /purpose: session\.purpose/)
  assert.match(store, /readingContext:/)
  assert.match(store, /async function endActiveSession\(\)/)
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /startReadingSession\(/)
  assert.match(workspace, /endActiveSession\(/)
  assert.doesNotMatch(workspace, /loadMessages\(/)
})
