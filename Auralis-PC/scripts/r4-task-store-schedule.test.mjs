import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')

test('store derives scheduling queue from deadline-bearing unscheduled tasks', () => {
  assert.match(source, /pendingTasks\.value = tasks\.filter\(isSchedulableTask\)/)
  assert.match(source, /const scheduled = getTasksForTimeline\(tasks\)/)
})

test('status changes preserve schedule and unschedule is explicit', () => {
  assert.match(source, /const model = toTaskModel\(\{ \.\.\.current, status: newStatus, scheduledAt: current\.scheduledAt \}\)/)
  assert.match(source, /scheduledAt: undefined, startTime: undefined/)
  assert.doesNotMatch(source, /status: newStatus, scheduledAt: newStatus === 'scheduled' \? current\.scheduledAt : undefined/)
  assert.match(source, /if \(slot\.task\) await unscheduleTask\(slotTime\)/)
})

test('completed tasks remain schedulable in the timeline model', () => {
  assert.match(source, /statusToPresentation\(value: TaskStatus, scheduledAt\?: string\): TaskPresentationStatus/)
  assert.match(source, /if \(value === 'CANCELLED'\) return 'cancelled'/)
})
