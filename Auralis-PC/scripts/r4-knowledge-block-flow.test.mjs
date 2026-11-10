import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('WorkspaceKnowledgeBlockDialog resets mode to view on close or hide', async () => {
  const root = new URL('../src/', import.meta.url)
  const dialogSrc = await readFile(new URL('components/knowledge/WorkspaceKnowledgeBlockDialog.vue', root), 'utf8')

  // Check handleClose emits update:mode view and resets currentMode
  assert.match(dialogSrc, /currentMode\.value\s*=\s*'view'/)
  assert.match(dialogSrc, /emit\('update:mode',\s*'view'\)/)
  // Check watch hides resets currentMode to view
  assert.match(dialogSrc, /currentMode\.value\s*=\s*'view'/)
})

test('SubjectWorkspace properly resets creation mode, tracks selection, and updates list', async () => {
  const root = new URL('../src/', import.meta.url)
  const workspaceSrc = await readFile(new URL('views/SubjectWorkspace/index.vue', root), 'utf8')

  // Selection class on block card
  assert.match(workspaceSrc, /:class="\{\s*'is-selected':\s*selectedBlock\?\.id\s*===\s*block\.id\s*\}"/)

  // handleBlockClick resets isCreateMode and isEditMode
  assert.match(workspaceSrc, /const handleBlockClick = \(b: any\) => \{[\s\S]*?selectedBlock\.value = b[\s\S]*?isCreateMode\.value = false[\s\S]*?isEditMode\.value = false[\s\S]*?blockDialogVisible\.value = true/)

  // closeBlockDialog resets isCreateMode and isEditMode
  assert.match(workspaceSrc, /const closeBlockDialog = \(\) => \{[\s\S]*?blockDialogVisible\.value = false[\s\S]*?isCreateMode\.value = false[\s\S]*?isEditMode\.value = false/)

  // handleSaveBlockFromDialog updates selectedBlock with the newly created block
  assert.match(workspaceSrc, /const newId = await blockStore\.addBlock\([\s\S]*?const createdBlock = recentBlocks\.value\.find\(\(b\) => b\.id === newId\)[\s\S]*?selectedBlock\.value = createdBlock/)

  // CSS for selected card exists
  assert.match(workspaceSrc, /\.block-card\.is-selected\s*\{/)
})

test('useKnowledgeStore sorts local blocks descending by createdAt/time', async () => {
  const root = new URL('../src/', import.meta.url)
  const storeSrc = await readFile(new URL('store/useKnowledgeStore.ts', root), 'utf8')

  assert.match(storeSrc, /\.sort\(\(a, b\) => \{[\s\S]*?timeB\.localeCompare\(timeA\)/)
})

test('Tablet workspace activates created block immediately upon creation', async () => {
  const mobileRoot = new URL('../../Auralis-Mobile/src/', import.meta.url)
  const tabletSrc = await readFile(new URL('pages/tablet/workspace/index.vue', mobileRoot), 'utf8')

  assert.match(tabletSrc, /activeBlockId\.value = created\.id/)
  assert.match(tabletSrc, /activePanel\.value = 'blocks'/)
})

