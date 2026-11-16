import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { createPinia, setActivePinia } from 'pinia'
import ts from 'typescript'
import { computed, nextTick, reactive, ref, watch } from 'vue'

test('WorkspaceKnowledgeBlockDialog resets mode to view on close or hide', async () => {
  const root = new URL('../src/', import.meta.url)
  const dialogSrc = await readFile(new URL('components/knowledge/WorkspaceKnowledgeBlockDialog.vue', root), 'utf8')

  // Check handleClose emits update:mode view and resets currentMode
  assert.match(dialogSrc, /currentMode\.value\s*=\s*'view'/)
  assert.match(dialogSrc, /emit\('update:mode',\s*'view'\)/)
  // Check watch hides resets currentMode to view
  assert.match(dialogSrc, /currentMode\.value\s*=\s*'view'/)
})

test('SubjectWorkspace follows the latest detail and preserves a stale editing draft', async () => {
  const root = new URL('../src/', import.meta.url)
  const workspaceSrc = await readFile(new URL('views/SubjectWorkspace/index.vue', root), 'utf8')
  const dialogSrc = await readFile(new URL('components/knowledge/WorkspaceKnowledgeBlockDialog.vue', root), 'utf8')
  const workspace = workspaceSrc.slice(workspaceSrc.indexOf('const blockDialogVisible'), workspaceSrc.indexOf('const handleResolveBlockConflict'))
  const dialog = dialogSrc.slice(dialogSrc.indexOf('const currentMode'), dialogSrc.indexOf('const isRenderView'))
  const block = { id: 'block', subjectId: 'math', title: 'Original', content: 'Original body', version: 4 }
  const createWorkspace = new Function('ref', 'computed', 'watch', 'reactive', 'block', ts.transpile(`
    const subjectBlocks = ref([block]), subjectId = ref('math')
    const authStore = reactive({ loginGeneration: Symbol() })
    const isComponentMounted = true, currentSubjectSwitchGen = 1
    const writes = [], notices = []
    const blockStore = { knowledgeBlockConflicts: {}, updateBlock: async block => writes.push(block) }
    const ElNotification = notice => notices.push(notice)
    ${workspace}
    return { subjectBlocks, subjectId, authStore, selectedBlock, blockDialogVisible, blockDialogMode, blockEditBaseline,
      blockEditWarning, handleBlockClick, reviewLatestBlock, handleSaveBlockFromDialog, writes, notices }
  `, { target: ts.ScriptTarget.ES2022 }))
  const createDialog = new Function('ref', 'computed', 'watch', 'props', ts.transpile(`
    ${dialog}
    return { formData, currentMode }
  `, { target: ts.ScriptTarget.ES2022 }))
  const view = createWorkspace(ref, computed, watch, reactive, block)
  const props = reactive({
    get block() { return view.selectedBlock.value },
    get modelValue() { return view.blockDialogVisible.value },
    get mode() { return view.blockDialogMode.value },
    get editBaseline() { return view.blockEditBaseline.value },
    themeColors: [],
  })
  const editor = createDialog(ref, computed, watch, props)

  view.handleBlockClick(block)
  view.subjectBlocks.value = [{ ...block, version: 5, content: 'Synced body' }]
  assert.equal(view.selectedBlock.value.content, 'Synced body')
  view.blockDialogMode.value = 'edit'
  await nextTick()
  assert.equal(editor.formData.value.content, 'Synced body')
  editor.formData.value.title = 'Draft title'

  const latest = { ...block, version: 6, content: 'Newer remote body' }
  view.subjectBlocks.value = [latest]
  view.handleBlockClick(latest)
  await nextTick()
  assert.equal(editor.formData.value.title, 'Draft title')
  assert.equal(editor.formData.value.content, 'Synced body')
  assert.match(view.blockEditWarning.value, /已更新/)
  await view.handleSaveBlockFromDialog(editor.formData.value)
  assert.deepEqual(view.writes, [])

  view.reviewLatestBlock()
  await nextTick()
  assert.equal(editor.formData.value.title, 'Draft title')
  assert.equal(editor.formData.value.content, 'Newer remote body')
  await view.handleSaveBlockFromDialog(editor.formData.value)
  assert.equal(view.writes[0].version, 6)
  assert.equal(view.writes[0].title, 'Draft title')
  assert.equal(view.writes[0].content, 'Newer remote body')
  assert.match(view.notices[0].title, /本机.*等待同步/)

  view.handleBlockClick(latest)
  view.blockDialogMode.value = 'edit'
  await nextTick()
  editor.formData.value.content = 'Retained on removal'
  view.subjectBlocks.value = []
  await nextTick()
  assert.equal(view.blockDialogVisible.value, true)
  assert.equal(editor.formData.value.content, 'Retained on removal')
  assert.match(view.blockEditWarning.value, /移除/)
  view.blockDialogMode.value = 'view'
  await nextTick()
  assert.equal(view.blockDialogVisible.value, false)
})

test('useKnowledgeStore sorts local blocks descending by createdAt/time', async () => {
  const root = new URL('../src/', import.meta.url)
  const storeSrc = await readFile(new URL('store/useKnowledgeStore.ts', root), 'utf8')

  assert.match(storeSrc, /\.sort\(\(a, b\) => \{[\s\S]*?timeB\.localeCompare\(timeA\)/)
})

test('addBlock does not publish or schedule an old-session commit after account switch', async (t) => {
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
    const { useSyncStore } = await import('../src/store/useSyncStore.ts')
    const { getLocalRepository } = await import('../src/services/localDb.ts')
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { id: 'knowledge-add-old-user' }
    auth.serverDeviceId = 'knowledge-add-old-device'
    const store = useKnowledgeStore()
    const sync = useSyncStore()
    const scheduled = []
    const scheduleSpy = t.mock.method(sync, 'requestBackgroundSync', reason => scheduled.push(reason))
    const repo = await getLocalRepository(auth.user.id, auth.serverDeviceId)
    const commit = repo.commitMutation.bind(repo)
    let announceCommit
    let releaseCommit
    const commitStarted = new Promise(resolve => { announceCommit = resolve })
    const commitGate = new Promise(resolve => { releaseCommit = resolve })
    const commitSpy = t.mock.method(repo, 'commitMutation', async input => {
      announceCommit()
      await commitGate
      return commit(input)
    })

    const adding = store.addBlock({ subjectId: 'math', title: 'Old account block', content: 'Private body' })
    await commitStarted
    auth.user = { id: 'knowledge-add-new-user' }
    auth.serverDeviceId = 'knowledge-add-new-device'
    auth.loginGeneration = Symbol('new-session')
    releaseCommit()
    const id = await adding

    assert.ok(await repo.read('KNOWLEDGE_BLOCK', id), 'the completed local write remains in its original scoped repository')
    assert.deepEqual(store.recentBlocks, [], 'an old-session completion does not enter the current store projection')
    assert.deepEqual(scheduled, [], 'an old-session completion does not schedule sync in the new session')
    commitSpy.mock.restore()
    scheduleSpy.mock.restore()
  } finally {
    loader.deregister()
  }
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
    const createEditor = new Function('ref', 'blockStore', 'LocalConflictError', 't', ts.transpile(`
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
    const editor = createEditor(ref, store, LocalConflictError, value => value['zh-CN'] ?? value.en ?? value.ja)
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

test('workspace saves one knowledge block per in-flight creation and keeps a failed draft open', async (t) => {
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
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { id: 'workspace-create-owner' }
    auth.serverDeviceId = 'workspace-create-device'
    const store = useKnowledgeStore()
    const repo = await getLocalRepository(auth.user.id, auth.serverDeviceId)

    const workspace = await readFile(new URL('views/SubjectWorkspace/index.vue', root), 'utf8')
    const script = workspace.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    const ast = ts.createSourceFile('SubjectWorkspace.ts', script, ts.ScriptTarget.Latest, true)
    const names = new Set(['handleSaveBlockFromDialog', 'saveKnowledgeBlock', 'isCreatingKnowledgeBlock', 'createKnowledgeBlock'])
    const statements = ast.statements
      .filter(statement => statement.declarationList?.declarations.some(declaration => names.has(declaration.name.text)))
      .map(statement => statement.getText(ast))
      .join('\n')
    const createWorkspace = new Function('ref', 'blockStore', ts.transpile(`
      const subjectId = ref('math'), activeSubject = ref({ id: 'math', name: 'Math' })
      const authStore = { loginGeneration: 1 }
      const currentSubjectSwitchGen = 1, isComponentMounted = true
      const activeSourceFiles = ref([{ id: 'math-source', subjectId: 'math' }])
      const selectedSourceId = ref(undefined), selectedFileId = ref('math-source')
      const selectedFile = ref({ name: 'Source' }), selectedBlockId = ref(null)
      const selectionScope = ref('preview')
      const isCreateMode = ref(true), showKnowledgeEditor = ref(true)
      const notifications = []
      const ElNotification = notification => notifications.push(notification)
      const closeBlockDialog = () => { isCreateMode.value = false }
      const clearSelection = () => {}
      ${statements}
      return { handleSaveBlockFromDialog, saveKnowledgeBlock, isCreateMode, showKnowledgeEditor, notifications }
    `, { target: ts.ScriptTarget.ES2022 }))
    const editor = createWorkspace(ref, store)
    const manual = { subject: 'Math', title: 'Manual', content: 'Manual body', source: 'Manual' }
    const selected = { title: 'Excerpt', content: 'Selected body' }

    const failingCommit = t.mock.method(repo, 'commitMutation', async () => { throw new Error('Local write failed') })
    await editor.handleSaveBlockFromDialog(manual)
    failingCommit.mock.restore()
    assert.equal(editor.isCreateMode.value, true)
    assert.equal(editor.notifications.at(-1).type, 'error')
    assert.deepEqual(await repo.listPending('KNOWLEDGE_BLOCK'), [])

    await Promise.all([editor.handleSaveBlockFromDialog(manual), editor.handleSaveBlockFromDialog(manual)])
    await Promise.all([editor.saveKnowledgeBlock(selected), editor.saveKnowledgeBlock(selected)])
    assert.equal(editor.isCreateMode.value, false)
    assert.equal(editor.showKnowledgeEditor.value, false)
    assert.deepEqual(editor.notifications.map(notification => notification.title), ['保存失败', '已录入', '已保存为知识块'])
    const pending = await repo.listPending('KNOWLEDGE_BLOCK')
    assert.deepEqual(pending.map(record => record.mutationType), ['CREATE', 'CREATE'])
    const rows = await repo.list('KNOWLEDGE_BLOCK', { includeDeleted: false })
    assert.equal(rows.length, 2)
    assert.equal(rows.find(row => row.value.title === manual.title)?.value.content, manual.content)
    assert.equal(rows.find(row => row.value.title === selected.title)?.value.sourceId, 'math-source')
  } finally {
    loader.deregister()
  }
})

