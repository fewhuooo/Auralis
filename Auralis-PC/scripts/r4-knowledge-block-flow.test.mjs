import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'
import ts from 'typescript'
import { nextTick, ref, watch } from 'vue'

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

test('Asset knowledge draft survives refresh and cannot overwrite a newer or deleted block', async () => {
  const root = new URL('../src/', import.meta.url)
  const loader = registerHooks({
    resolve(specifier, context, nextResolve) {
      const withExtension = /\.[cm]?[jt]s$/.test(specifier) ? specifier : specifier + '.ts'
      if (specifier.startsWith('@/')) return nextResolve(new URL(withExtension.slice(2), root).href, context)
      if (specifier.startsWith('.') && context.parentURL?.startsWith(root.href)) {
        return nextResolve(new URL(withExtension, context.parentURL).href, context)
      }
      return nextResolve(specifier, context)
    },
  })
  try {
    const { useAuthStore } = await import('../src/store/useAuthStore.ts')
    const { useKnowledgeStore } = await import('../src/store/useKnowledgeStore.ts')
    const { getLocalRepository } = await import('../src/services/localDb.ts')
    const { LocalConflictError } = await import('../src/services/localRepository.ts')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { id: 'knowledge-edit-user' }
    auth.serverDeviceId = 'knowledge-edit-device'
    const store = useKnowledgeStore()
    const repo = await getLocalRepository(auth.user.id, auth.serverDeviceId)
    const block = { id: 'block', subjectId: 'math', title: 'Original title', content: 'Original body', version: 4 }
    await repo.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: block.version })
    await store.loadLocalBlocks()

    const source = await readFile(new URL('views/Asset/index.vue', root), 'utf8')
    const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    const ast = ts.createSourceFile('Asset.ts', script, ts.ScriptTarget.Latest, true)
    const names = ['rebuildAssetTree', 'findTreeNode', 'selectItem', 'saveBlockEdit']
    const functions = ast.statements.filter(statement => names.includes(statement.name?.text)
      || statement.declarationList?.declarations.some(declaration => names.includes(declaration.name.text)))
      .map(statement => statement.getText(ast)).join('\n')
    const createEditor = new Function('ref', 'blockStore', 'LocalConflictError', ts.transpile(`
      const selected = ref(null), rootNodes = ref([]), focusUnassigned = ref(false), showRegisterModal = ref(false)
      const route = { query: {} }
      const subjectStore = { subjects: [] }, sourceStore = { sources: [] }, taskStore = { allTasks: [] }
      const IconFiles = 'file', IconNotes = 'notes', IconChecklist = 'checklist', IconArchive = 'archive', IconNote = 'note'
      const taskGroupFolders = () => []
      const notifications = []
      const ElNotification = notification => notifications.push(notification)
      ${functions}
      return { selected, rootNodes, rebuildAssetTree, findTreeNode, selectItem, saveBlockEdit, notifications }
    `, { target: ts.ScriptTarget.ES2022 }))
    const editor = createEditor(ref, store, LocalConflictError)
    const stop = watch(() => store.recentBlocks, editor.rebuildAssetTree, { deep: true, immediate: true })
    try {
      const treeBlock = () => editor.findTreeNode(editor.rootNodes.value, 'b-block')
      editor.selectItem(treeBlock())
      editor.selected.value.name = 'Draft title'
      editor.selected.value.content = ''
      editor.rebuildAssetTree()
      assert.equal(treeBlock().name, block.title)
      assert.equal(editor.selected.value.name, 'Draft title')
      assert.equal(editor.selected.value.content, '')
      editor.selectItem(treeBlock())
      assert.equal(editor.selected.value.name, 'Draft title')
      assert.equal(editor.selected.value.content, '')

      const remote = { ...block, title: 'Remote title', version: 5 }
      await repo.upsert('KNOWLEDGE_BLOCK', block.id, remote, { version: remote.version })
      await store.loadLocalBlocks()
      await nextTick()
      assert.equal(editor.selected.value.name, 'Draft title')
      const staleModel = editor.selected.value.originalData
      await editor.saveBlockEdit(editor.selected.value)
      assert.equal(editor.notifications.at(-1).type, 'warning')
      assert.equal((await repo.read('KNOWLEDGE_BLOCK', block.id)).value.title, remote.title)
      editor.selectItem(treeBlock())
      assert.equal(editor.selected.value.name, remote.title)
      assert.equal(editor.selected.value.content, remote.content)

      const deletedAt = '2026-11-11T09:00:00Z'
      await repo.tombstone('KNOWLEDGE_BLOCK', block.id, { version: 6, deletedAt, syncStatus: 'synced' })
      await store.loadLocalBlocks()
      await nextTick()
      assert.equal(editor.selected.value, null)
      await assert.rejects(store.updateBlock(staleModel), LocalConflictError)
      await assert.rejects(store.updateBlock({ ...staleModel, version: 6 }), LocalConflictError)
      assert.equal((await repo.read('KNOWLEDGE_BLOCK', block.id)).deletedAt, deletedAt)
      assert.deepEqual(await repo.listPending('KNOWLEDGE_BLOCK'), [])

      const active = { ...block, id: 'active' }
      await repo.upsert('KNOWLEDGE_BLOCK', active.id, active, { version: active.version })
      await store.loadLocalBlocks()
      await nextTick()
      editor.selectItem(editor.findTreeNode(editor.rootNodes.value, 'b-active'))
      editor.selected.value.content = 'Saved body'
      await editor.saveBlockEdit(editor.selected.value)
      assert.equal(editor.notifications.at(-1).type, 'success')
      assert.equal((await repo.read('KNOWLEDGE_BLOCK', active.id)).value.content, 'Saved body')
      assert.equal((await repo.listPending('KNOWLEDGE_BLOCK'))[0].mutationType, 'UPDATE')
    } finally {
      stop()
    }
  } finally {
    loader.deregister()
  }
})

