import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

test('chat sessions persist across file switches and restore full history from conversation detail', async () => {
  const store = await source('src/store/useChatStore.ts')
  const workspace = await source('src/views/SubjectWorkspace/index.vue')

  // Chat sessions are not tied to file-level READING_SESSION lifecycle
  assert.doesNotMatch(store, /purpose:\s*'READING_SESSION'/)
  assert.doesNotMatch(store, /startReadingSession/)
  assert.doesNotMatch(workspace, /startReadingSession/)
  assert.doesNotMatch(workspace, /endActiveSession/)

  // History is restored via loadMessages and getConversation detail
  assert.match(store, /async function loadMessages\(sessionId:\s*string\)/)
  assert.match(store, /getConversation\(session\.remoteId\)/)

  // Switching files updates readingContext but preserves active session
  assert.match(workspace, /selectedAiSourceIds\.value\s*=\s*\[id\]/)
  assert.match(workspace, /aiReferenceScope\.value\s*=\s*'AUTO'/)

  // Unsupported legacy protocol handling
  assert.match(store, /CHAT_PROTOCOL_UNSUPPORTED/)
  assert.match(store, /chatProtocolVersion\s*!==\s*1/)
})
