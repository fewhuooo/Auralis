import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dashboard = await readFile(new URL('../src/views/Dashboard/index.vue', import.meta.url), 'utf8')
const timeline = await readFile(new URL('../src/views/Timeline/index.vue', import.meta.url), 'utf8')
const taskStore = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')

test('dashboard uses a bounded grid and shared timeline window', () => {
  assert.match(dashboard, /display:\s*grid/)
  assert.match(dashboard, /getTasksForTimeline\(allTasks\.value\)/)
  assert.doesNotMatch(dashboard, /getTasksForTimeline\(allTasks\.value,\s*selectedDay\.value\)/)
  assert.doesNotMatch(dashboard, /timeline-import-btn|focus=unassigned-tasks/)
})

test('timeline keeps deadline-only pending queue and imports unassigned tasks', () => {
  assert.match(timeline, /getTasksForTimeline\(allTasks\.value\)/)
  assert.match(timeline, /return filteredPendingTasks\.value\s*\n\}/)
  assert.match(timeline, /router\.push\(['"`]\/asset\?focus=unassigned-tasks['"`]\)/)
})

test('timeline renders half-hour scheduled tasks and marks past tasks without removing them', () => {
  assert.match(taskStore, /TIMELINE_SLOT_MINUTES\s*=\s*30/, 'Task time slots must include half-hour boundaries')
  assert.match(taskStore, /timelineSlotTimeForScheduledAt/, 'Day timeline must normalize scheduledAt to a visible time slot')
  assert.match(taskStore, /timeForScheduledAt\(value\)/, 'Day timeline must derive the task start time from scheduledAt')
  assert.match(timeline, /isPastTask/, 'Timeline must identify tasks whose scheduledAt is in the past')
  assert.match(timeline, /is-past/, 'Timeline must keep past tasks rendered with a dedicated style')
  assert.match(timeline, /text-decoration:\s*line-through/, 'Past task text must be crossed out')
})
