import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { locale, t } from '../src/i18n.ts'

test('Asset view removes demo tasks and uses real tasks', async () => {
  const assetSource = await readFile(new URL('../src/views/Asset/index.vue', import.meta.url), 'utf8')
  const assetTreeRebuilder = assetSource.slice(assetSource.indexOf('function rebuildAssetTree()'), assetSource.indexOf('const loadAssetsFromBackend'))

  assert.doesNotMatch(assetSource, /id:\s*['"`]t-1['"`]/, 'Must not contain hardcoded task t-1')
  assert.doesNotMatch(assetSource, /id:\s*['"`]t-2['"`]/, 'Must not contain hardcoded task t-2')
  assert.match(assetSource, /taskStore\.fetchTasks\(\)/, 'Must call taskStore.fetchTasks() to get latest tasks')
  assert.match(assetSource, /getTasksForAssetGroups/, 'Must partition tasks into unassigned, pending, and completed groups')
  assert.match(assetSource, /done: isCompletedTask\(task\)/, 'Asset task checkmarks must use the shared canonical/presentation completion rule')
  assert.match(assetSource, /:disabled="isScheduledCompletionLocked\(selected\.originalData, taskStore\.currentNow\)"/)
  assert.match(assetSource, /:title="isScheduledCompletionLocked\(selected\.originalData, taskStore\.currentNow\) \? t\(\{\s*'zh-CN': '任务时段已结束，完成状态不可取消'/)
  assert.match(assetSource, /const previousDone = task\.done[\s\S]*?catch \(err\)[\s\S]*?task\.done = previousDone/, 'A failed status write must restore the tree checkmark')
  assert.match(assetTreeRebuilder, /rootNodes\.value = newRoots[\s\S]*?findTreeNode\(newRoots, selection\.id\)[\s\S]*?Object\.assign\(selection, refreshed/, 'Selected tasks must refresh after local and sync projections rebuild the tree')
  assert.match(assetSource, /未排期/, 'Must expose an unassigned task group')
  assert.match(assetSource, /未完成/, 'Must expose an incomplete task group')
  assert.match(assetSource, /已完成/, 'Must expose a completed task group')
  assert.match(assetSource, /useRoute\(\)/, 'Must inspect the focus query when opened from timeline import')
  assert.match(assetSource, /unassigned-tasks/, 'Must focus the unassigned task group')
  assert.match(assetSource, /@click="toggleTreeNode\(folder\)"/, 'Task category headers must toggle their source tree node')
  assert.match(assetSource, /item\.type === 'folder'/, 'Task categories must render as nested folders')
  assert.match(assetSource, /@click="toggleTreeNode\(item\)"/, 'Nested task category headers must toggle their source node')
  assert.match(assetSource, /function toggleTreeNode\(node: TreeNode\)/, 'Tree toggling must update the source node, not a filtered clone')
  assert.match(assetSource, /taskStore\.updateTaskStatus/, 'Must use taskStore.updateTaskStatus to toggle status')
  assert.doesNotMatch(assetSource, /低负荷|中负荷|高负荷/, 'Task editor must not expose cognitive-load buttons')
  assert.match(assetSource, /预计用时/, 'Task editor must expose estimated duration')
  assert.match(assetSource, /durationOptions/, 'Task duration options must be explicit')
  assert.match(assetSource, /selected\.durationMinutes/, 'Task editor must bind the domain durationMinutes field')
  assert.match(assetSource, /30/, 'Task duration options must use half-hour increments')
  assert.match(assetSource, /toDueAtValue/, 'Task editor must serialize date-only deadlines for the Task API')
  assert.match(assetSource, /taskStore\.updateTaskDetails/, 'Task editor must persist title, due date, notes, and duration')
})

test('Asset loads local projections without blocking on background refresh', async () => {
  const assetSource = await readFile(new URL('../src/views/Asset/index.vue', import.meta.url), 'utf8')
  const assetLoader = assetSource.slice(assetSource.indexOf('const loadAssetsFromBackend'), assetSource.indexOf('// ---- Search Filter'))

  assert.match(assetSource, /import \{ ref, computed, onMounted, onUnmounted, watch \} from 'vue'/)
  assert.match(assetSource, /function rebuildAssetTree\(\): void/)
  assert.match(assetLoader, /Promise\.allSettled\(/)
  assert.match(assetLoader, /blockStore\.fetchBlocks\(\)/)
  assert.doesNotMatch(assetLoader, /blockStore\.loadLocalBlocks\(\)/)
  assert.match(assetLoader, /isLoadingAssets\.value = false/)
  assert.doesNotMatch(assetLoader, /await subjectStore\.loadSubjects\(\)[\s\S]*await sourceStore\.loadSources\(\)/)
  assert.match(assetSource, /watch\(\s*\[\s*\(\) => subjectStore\.subjects/)
  assert.match(assetSource, /if \(!isLoadingAssets\.value\) rebuildAssetTree\(\)/)
})

test('Asset refresh preserves the selected file branch and updates its preview metadata', async (t) => {
  const { view, sourceStore, file, otherFile } = await createAssetFixture(t)

  for (const [groupId, name] of [[file.subjectId, 'Revised algebra notes'], ['all', 'Final algebra notes']]) {
    view.selectFile(file.id, groupId)
    assert.equal(view.selectedGroupForGraph.value.id, groupId)

    sourceStore.sources = [{ ...file, name }, otherFile]
    await nextTick()

    assert.equal(view.selectedGroupForGraph.value.id, groupId)
    assert.deepEqual(view.selectedGraphAsset.value, { type: 'file', id: file.id })
    assert.deepEqual(view.selectedPreviewFile.value, {
      id: file.id,
      name,
      assetId: file.assetId,
      fileType: file.fileType,
    })
  }
})

test('Asset clears a removed file preview and can open another node from the remaining graph', async (t) => {
  const { view, sourceStore, file, otherFile, block } = await createAssetFixture(t)
  view.selectFile(file.id, file.subjectId)
  assert.equal(view.selectedPreviewFile.value.id, file.id)

  sourceStore.sources = [otherFile]
  await nextTick()

  assert.equal(view.selected.value, null)
  assert.equal(view.selectedPreviewFile.value, null)
  assert.equal(view.selectedGraphAsset.value, null)
  assert.equal(view.selectedGroupForGraph.value, null)

  view.selectFile(otherFile.id, otherFile.subjectId)
  assert.deepEqual(view.graphSources.value.map(source => source.id), [otherFile.id])
  assert.deepEqual(view.graphBlocks.value.map(block => block.id), [block.id])
  view.selectGraphNode({ type: 'block', id: block.id, subjectId: block.subjectId })
  assert.deepEqual(view.selectedGraphAsset.value, { type: 'block', id: block.id })
  assert.equal(view.selected.value.content, block.content)
})

async function createAssetFixture(testContext) {
  const assetSource = await readFile(new URL('../src/views/Asset/index.vue', import.meta.url), 'utf8')
  const setup = assetSource.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const script = ts.createSourceFile('Asset.ts', setup, ts.ScriptTarget.Latest, true)
  const names = new Set([
    'showRegisterModal', 'isLoadingAssets', 'rootNodes', 'focusUnassigned', 'selected',
    'rebuildAssetTree', 'findTreeNode', 'selectItem', 'selectedPreviewFile', 'selectedGroupForGraph',
    'selectedGraphAsset', 'graphSources', 'graphBlocks', 'selectGraphNode',
  ])
  const statements = script.statements.filter(statement => {
    if (ts.isFunctionDeclaration(statement)) return names.has(statement.name?.text)
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(script)))
    }
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false
    return statement.expression.expression.getText(script) === 'watch'
      && statement.expression.arguments[0]?.getText(script).includes('sourceStore.sources')
      && statement.expression.arguments[1]?.getText(script).includes('rebuildAssetTree')
  }).map(statement => statement.getText(script)).join('\n')
  const { outputText } = ts.transpileModule(`
    const route = { query: {} }
    const IconFiles = 'files', IconNotes = 'notes', IconChecklist = 'checklist'
    const IconArchive = 'archive', IconNote = 'note'
    const taskGroupFolders = () => []
    const getSubjectIconComponent = () => 'subject'
    const getIconForSource = () => 'file'
    const getFileStatus = () => ({ status: 'success', statusText: 'Ready' })
    ${statements}
    rebuildAssetTree()
    return {
      selected, selectedPreviewFile, selectedGroupForGraph, selectedGraphAsset,
      graphSources, graphBlocks, selectGraphNode,
      selectFile(id, groupId) {
        const group = rootNodes.value.find(root => root.id === groupId)
        selectItem(findTreeNode([group], 'f-' + id))
      },
    }
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  const subject = { id: 'math', name: 'Math' }
  const file = {
    id: 'algebra', name: 'Algebra notes', subjectId: subject.id, assetId: 'asset-algebra',
    fileType: 'pdf', fileSize: 2048,
  }
  const otherFile = { ...file, id: 'geometry', name: 'Geometry notes', assetId: 'asset-geometry' }
  const block = { id: 'excerpt', subjectId: subject.id, sourceFileId: file.id, title: 'Excerpt', content: 'Example' }
  const sourceStore = reactive({ sources: [file, otherFile] })
  const bindings = {
    computed, ref, watch, locale, t, sourceStore, subjectStore: { subjects: [subject] },
    blockStore: { recentBlocks: [block] }, taskStore: { allTasks: [] }, docProcessingStore: { jobs: [] },
  }
  const scope = effectScope()
  testContext.after(() => scope.stop())
  const view = scope.run(() => new Function(...Object.keys(bindings), outputText)(...Object.values(bindings)))
  return { view, sourceStore, file, otherFile, block }
}
