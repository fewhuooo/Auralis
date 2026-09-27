import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

test('selection actions support explain, ask and saving a bounded knowledge block', async () => {
  const preview = await source('src/components/FilePreview.vue')
  assert.match(preview, /text-selected/)
  assert.match(preview, /slice\(0, 4000\)/)
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /explainSelection/)
  assert.match(workspace, /askSelection/)
  assert.match(workspace, /saveSelection/)
  assert.match(workspace, /selectionText: selectedText\.value/)
  const editor = await source('src/components/knowledge/KnowledgeBlockEditor.vue')
  assert.match(editor, /emit\('save'/)
})

test('workspace retrieval sends the chosen source scope instead of only the preview source', async () => {
  const workspaceSource = await source('src/views/SubjectWorkspace/index.vue')
  const workspace = workspaceSource.slice(workspaceSource.indexOf('// ===== AI Chat (Right Panel) ====='))
  const chatStoreSource = await source('src/store/useChatStore.ts')
  const chatStore = chatStoreSource.slice(chatStoreSource.indexOf('async function dispatchPendingMessage'))

  assert.ok(workspace.includes("retrievalMode: sourceIds.length ? 'SELECTED_SOURCES' as const : 'NONE' as const"),
    'explicit selections must be forwarded as a bounded selected-source mode')
  assert.ok(workspace.includes("if (current?.ingestionStatus === 'READY' && !addAiReferenceSourceWithinLimit(selected, current.id)) return"),
    'selecting other files while viewing a file must include the current ready source')
  assert.ok(workspace.includes("retrievalMode: 'AUTO' as const"),
    'the current-file selection must preserve the existing AUTO retrieval mode')
  assert.ok(workspace.includes("retrievalMode: 'SUBJECT' as const"),
    'whole-subject retrieval must be an explicit mode')
  assert.ok(workspace.includes("retrievalMode: 'NONE' as const"),
    'no-reference mode must be explicit in the local send options')
  assert.ok(chatStore.includes("sourceIds: referenceMode === 'SELECTED_SOURCES' ? options.sourceIds : undefined"),
    'the chat store must include selected source IDs in the API request')
  assert.ok(chatStore.includes("options.sourceId && options.subjectId ? 'AUTO' : undefined"),
    'existing current-file messages must remain compatible with AUTO retrieval')
  assert.ok(chatStore.includes("retrievalEnabled: referenceMode === 'NONE'"),
    'no-reference mode must disable retrieval in the stream request')
})

test('explicit source selection is capped at the API limit including the current source', async () => {
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /const MAX_AI_REFERENCE_SOURCES = 100/)
  assert.match(workspace, /最多引用 100 份资料（包含当前文件）/)
  assert.match(workspace, /selected\.size >= MAX_AI_REFERENCE_SOURCES/,
    'new sources must be rejected when the selected set already includes 100 sources')
  assert.match(workspace, /if \(addAiReferenceSourceWithinLimit\(selected, newId\)\)/,
    'opening a current source in explicit mode must not append a 101st source')
  assert.match(workspace, /addAiReferenceSourceWithinLimit\(selected, current\.id\)/,
    'the current source automatically added by a file toggle must count toward the limit')
})
