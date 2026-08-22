import assert from 'node:assert/strict'
import test from 'node:test'

const {
  getTasksForAssetGroups,
  getTasksForTimeline,
  isSchedulableTask,
} = await import('../src/services/taskViewRules.ts')

const task = (overrides = {}) => ({
  id: 'task-default',
  subjectId: 'subject-1',
  name: 'Task',
  title: 'Task',
  status: 'pending',
  dueAt: undefined,
  scheduledAt: undefined,
  createdAt: '2026-08-20T00:00:00Z',
  updatedAt: '2026-08-20T00:00:00Z',
  ...overrides,
})

test('groups unassigned tasks before completion groups', () => {
  const groups = getTasksForAssetGroups([
    task({ id: 'unassigned', status: 'pending' }),
    task({ id: 'completed', status: 'completed', dueAt: '2026-08-23T00:00:00Z' }),
    task({ id: 'pending', status: 'pending', dueAt: '2026-08-22T00:00:00Z' }),
  ])

  assert.deepEqual(groups.unassigned.map((item) => item.id), ['unassigned'])
  assert.deepEqual(groups.pending.map((item) => item.id), ['pending'])
  assert.deepEqual(groups.completed.map((item) => item.id), ['completed'])
})

test('sorts deadline-bearing groups by dueAt and keeps missing deadlines last', () => {
  const groups = getTasksForAssetGroups([
    task({ id: 'late', dueAt: '2026-08-25T00:00:00Z' }),
    task({ id: 'early', dueAt: '2026-08-22T00:00:00Z' }),
    task({ id: 'unassigned' }),
  ])

  assert.deepEqual(groups.pending.map((item) => item.id), ['early', 'late'])
  assert.deepEqual(groups.unassigned.map((item) => item.id), ['unassigned'])
})

test('only deadline-bearing unscheduled tasks enter the scheduling queue', () => {
  assert.equal(isSchedulableTask(task({ dueAt: '2026-08-23T00:00:00Z' })), true)
  assert.equal(isSchedulableTask(task()), false)
  assert.equal(isSchedulableTask(task({ dueAt: '2026-08-23T00:00:00Z', scheduledAt: '2026-08-22T12:00:00Z' })), false)
  assert.equal(isSchedulableTask(task({ status: 'completed', dueAt: '2026-08-23T00:00:00Z' })), false)
})

test('keeps completed scheduled tasks within the seven-day timeline window', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')
  const tasks = [
    task({ id: 'today-done', status: 'completed', scheduledAt: '2026-08-22T12:00:00+08:00' }),
    task({ id: 'tomorrow', scheduledAt: '2026-08-23T12:00:00+08:00' }),
    task({ id: 'outside', scheduledAt: '2026-08-29T12:00:00+08:00' }),
    task({ id: 'cancelled', status: 'cancelled', scheduledAt: '2026-08-23T13:00:00+08:00' }),
  ]

  assert.deepEqual(getTasksForTimeline(tasks, now).map((item) => item.id), ['today-done', 'tomorrow'])
})
