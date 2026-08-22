import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dashboard = await readFile(new URL('../src/views/Dashboard/index.vue', import.meta.url), 'utf8')
const timeline = await readFile(new URL('../src/views/Timeline/index.vue', import.meta.url), 'utf8')

test('dashboard uses a bounded grid and shared timeline window', () => {
  assert.match(dashboard, /display:\s*grid/)
  assert.match(dashboard, /getTasksForTimeline\(allTasks\.value\)/)
  assert.doesNotMatch(dashboard, /getTasksForTimeline\(allTasks\.value,\s*selectedDay\.value\)/)
  assert.match(dashboard, /router\.push\(['"`]\/asset\?focus=unassigned-tasks['"`]\)/)
})

test('timeline keeps deadline-only pending queue and imports unassigned tasks', () => {
  assert.match(timeline, /getTasksForTimeline\(allTasks\.value\)/)
  assert.match(timeline, /return filteredPendingTasks\.value\s*\n\}/)
  assert.match(timeline, /router\.push\(['"`]\/asset\?focus=unassigned-tasks['"`]\)/)
})
