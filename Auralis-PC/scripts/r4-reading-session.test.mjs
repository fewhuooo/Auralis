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
  assert.match(store, /purpose: 'READING_SESSION',[\s\S]*?sourceId,[\s\S]*?subjectId,/)
  assert.match(store, /purpose: session\.purpose/)
  assert.match(store, /const referenceMode = options\.retrievalMode \?\? \(options\.sourceId && options\.subjectId \? 'AUTO' : undefined\)/)
  assert.match(store, /currentSourceId: options\.sourceId/)
  assert.match(store, /sourceIds: referenceMode === 'SELECTED_SOURCES' \? options\.sourceIds : undefined/)
  assert.match(store, /controller\.run\(\{[\s\S]*?readingContext,/)
  assert.match(store, /async function endActiveSession\(\)/)
  assert.match(store, /if\s*\(activeSessionId\.value\s*===\s*targetSessionId\)\s*\{[\s\S]*?activeSessionId\.value\s*=\s*null/)
  assert.match(store, /async function endSessionById\(sessionId:\s*string\)/)
  assert.match(store, /if\s*\(activeSessionId\.value\s*===\s*sessionId\)\s*\{[\s\S]*?activeSessionId\.value\s*=\s*null/)
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /startReadingSession\(/)
  assert.match(workspace, /endActiveSession\(/)
  assert.match(workspace, /endSessionById\(/)
  const endSession = store.slice(store.indexOf('async function endActiveSession'), store.indexOf('function appendAssistantChunk'))
  assert.match(endSession, /clearActiveConversation\(\)/)
  assert.doesNotMatch(endSession, /loadMessages\(/)
  assert.doesNotMatch(workspace, /loadMessages\(/)
})
