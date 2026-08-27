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
