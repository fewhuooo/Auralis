import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Asset view removes demo tasks and uses real tasks', async () => {
  const assetSource = await readFile(new URL('../src/views/Asset/index.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(assetSource, /id:\s*['"`]t-1['"`]/, 'Must not contain hardcoded task t-1')
  assert.doesNotMatch(assetSource, /id:\s*['"`]t-2['"`]/, 'Must not contain hardcoded task t-2')
  assert.match(assetSource, /taskStore\.fetchTasks\(\)/, 'Must call taskStore.fetchTasks() to get latest tasks')
  assert.match(assetSource, /taskStore\.allTasks\.forEach/, 'Must iterate taskStore.allTasks to populate task folders')
  assert.match(assetSource, /taskStore\.updateTaskStatus/, 'Must use taskStore.updateTaskStatus to toggle status')
})
