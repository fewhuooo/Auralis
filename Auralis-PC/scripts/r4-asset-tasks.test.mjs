import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Asset view removes demo tasks and uses real tasks', async () => {
  const assetSource = await readFile(new URL('../src/views/Asset/index.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(assetSource, /id:\s*['"`]t-1['"`]/, 'Must not contain hardcoded task t-1')
  assert.doesNotMatch(assetSource, /id:\s*['"`]t-2['"`]/, 'Must not contain hardcoded task t-2')
  assert.match(assetSource, /taskStore\.fetchTasks\(\)/, 'Must call taskStore.fetchTasks() to get latest tasks')
  assert.match(assetSource, /getTasksForAssetGroups/, 'Must partition tasks into unassigned, pending, and completed groups')
  assert.match(assetSource, /未分布/, 'Must expose an unassigned task group')
  assert.match(assetSource, /未完成/, 'Must expose an incomplete task group')
  assert.match(assetSource, /已完成/, 'Must expose a completed task group')
  assert.match(assetSource, /useRoute\(\)/, 'Must inspect the focus query when opened from timeline import')
  assert.match(assetSource, /unassigned-tasks/, 'Must focus the unassigned task group')
  assert.match(assetSource, /@click="toggleTreeNode\(folder\)"/, 'Task category headers must toggle their source tree node')
  assert.match(assetSource, /item\.type === 'folder'/, 'Task categories must render as nested folders')
  assert.match(assetSource, /@click="toggleTreeNode\(item\)"/, 'Nested task category headers must toggle their source node')
  assert.match(assetSource, /function toggleTreeNode\(node: TreeNode\)/, 'Tree toggling must update the source node, not a filtered clone')
  assert.match(assetSource, /taskStore\.updateTaskStatus/, 'Must use taskStore.updateTaskStatus to toggle status')
})
