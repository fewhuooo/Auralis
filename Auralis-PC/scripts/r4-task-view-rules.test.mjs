import assert from 'node:assert/strict'
import test from 'node:test'

const {
  getTasksForAssetGroups,
  getTimelineDays,
  getTimelineRange,
  getTasksForTimeline,
  isSchedulableTask,
  isOverdueTask,
  isScheduledAtInPast,
  isScheduledTaskPast,
  isUnscheduledTaskPastDue,
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

test('only deadline-bearing unscheduled tasks enter the scheduling queue, including overdue unscheduled tasks', () => {
  assert.equal(isSchedulableTask(task({ dueAt: '2026-09-23T00:00:00Z' })), true)
  assert.equal(isSchedulableTask(task({ dueAt: '2026-08-01T00:00:00Z' })), true)
  assert.equal(isSchedulableTask(task()), false)
  assert.equal(isSchedulableTask(task({ dueAt: '2026-09-23T00:00:00Z', scheduledAt: '2026-09-22T12:00:00Z' })), false)
  assert.equal(isSchedulableTask(task({ dueAt: '2026-08-01T00:00:00Z', scheduledAt: '2026-08-01T09:00:00Z' })), false)
  assert.equal(isSchedulableTask(task({ status: 'completed', dueAt: '2026-09-23T00:00:00Z' })), false)
  assert.equal(isSchedulableTask(task({ status: 'completed', dueAt: '2026-08-01T00:00:00Z' })), false)
  assert.equal(isSchedulableTask(task({ status: 'cancelled', dueAt: '2026-08-01T00:00:00Z' })), false)
})

test('separates elapsed timeline tasks from overdue unscheduled tasks', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')
  const elapsedTimelineTask = task({ id: 'elapsed-timeline', dueAt: '2026-08-23T00:00:00Z', scheduledAt: '2026-08-22T09:00:00+08:00' })
  const futureTimelineTaskWithPastDeadline = task({ id: 'future-timeline', dueAt: '2026-08-21T00:00:00Z', scheduledAt: '2026-08-22T12:00:00+08:00' })
  const overdueUnscheduledTask = task({ id: 'overdue-unassigned', dueAt: '2026-08-21T00:00:00Z' })

  assert.equal(typeof isScheduledTaskPast, 'function')
  assert.equal(typeof isUnscheduledTaskPastDue, 'function')
  assert.equal(isScheduledTaskPast(elapsedTimelineTask, now), true)
  assert.equal(isScheduledTaskPast(futureTimelineTaskWithPastDeadline, now), false)
  assert.equal(isUnscheduledTaskPastDue(overdueUnscheduledTask, now), true)
  assert.equal(isUnscheduledTaskPastDue(elapsedTimelineTask, now), false)
})

test('marks an unfinished scheduled task overdue after its scheduled time passes', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')

  assert.equal(isOverdueTask(task({
    id: 'past-start-future-deadline',
    scheduledAt: '2026-08-22T09:00:00+08:00',
    dueAt: '2026-08-23T00:00:00Z',
  }), now), true)
  assert.equal(isOverdueTask(task({
    id: 'past-start-no-deadline',
    scheduledAt: '2026-08-22T09:00:00+08:00',
  }), now), true)
  assert.equal(isOverdueTask(task({
    id: 'unassigned-past-deadline',
    dueAt: '2026-08-21T00:00:00Z',
  }), now), true)
  assert.equal(isOverdueTask(task({
    id: 'future-start-past-deadline',
    scheduledAt: '2026-08-22T12:00:00+08:00',
    dueAt: '2026-08-21T00:00:00Z',
  }), now), false)
  assert.equal(isOverdueTask(task({
    id: 'completed-past-start',
    status: 'completed',
    scheduledAt: '2026-08-22T09:00:00+08:00',
  }), now), false)
  assert.equal(isOverdueTask(task({
    id: 'cancelled-past-start',
    status: 'cancelled',
    scheduledAt: '2026-08-22T09:00:00+08:00',
  }), now), false)
})

test('identifies only valid scheduled instants strictly before the supplied clock as past', () => {
  const now = new Date('2026-08-31T10:15:00.000Z')

  assert.equal(isScheduledAtInPast('2026-08-31T10:14:59.999Z', now), true)
  assert.equal(isScheduledAtInPast('2026-08-31T10:15:00.000Z', now), false)
  assert.equal(isScheduledAtInPast('2026-08-31T10:30:00.000Z', now), false)
  assert.equal(isScheduledAtInPast(undefined, now), false)
  assert.equal(isScheduledAtInPast('not-a-date', now), false)
})

test('creates a seven-day timeline window matching the full calendar week', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')
  const range = getTimelineRange(now)
  assert.equal(range.start.toISOString(), '2026-08-15T16:00:00.000Z')
  assert.equal(range.end.toISOString(), '2026-08-22T16:00:00.000Z')

  const days = getTimelineDays(now)
  assert.deepEqual(days.map((day) => day.dateKey), [
    '2026-08-16',
    '2026-08-17',
    '2026-08-18',
    '2026-08-19',
    '2026-08-20',
    '2026-08-21',
    '2026-08-22',
  ])
  assert.equal(days[6].isToday, true)
  assert.equal(days.filter((day) => day.isToday).length, 1)
})

test('keeps completed scheduled tasks within the seven-day timeline window', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')
  const tasks = [
    task({ id: 'three-days-before', scheduledAt: '2026-08-19T12:00:00+08:00' }),
    task({ id: 'outside-before', scheduledAt: '2026-08-15T23:59:00+08:00' }),
    task({ id: 'today-done', status: 'completed', scheduledAt: '2026-08-22T12:00:00+08:00' }),
    task({ id: 'tomorrow', scheduledAt: '2026-08-23T12:00:00+08:00' }),
    task({ id: 'in-window-late', scheduledAt: '2026-08-21T23:59:00+08:00' }),
    task({ id: 'outside-after', scheduledAt: '2026-08-24T00:01:00+08:00' }),
    task({ id: 'cancelled', status: 'cancelled', scheduledAt: '2026-08-20T13:00:00+08:00' }),
  ]

  assert.deepEqual(getTasksForTimeline(tasks, now).map((item) => item.id), ['three-days-before', 'in-window-late', 'today-done'])
})

test('uses the full calendar week containing the selected day', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')
  const range = getTimelineRange(now)
  assert.equal(range.start.toISOString(), '2026-08-15T16:00:00.000Z')
  assert.equal(range.end.toISOString(), '2026-08-22T16:00:00.000Z')

  const days = getTimelineDays(now)
  assert.deepEqual(days.map((day) => day.dateKey), [
    '2026-08-16',
    '2026-08-17',
    '2026-08-18',
    '2026-08-19',
    '2026-08-20',
    '2026-08-21',
    '2026-08-22',
  ])
  assert.deepEqual(days.map((day) => day.weekdayShort), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  assert.equal(days[6].isToday, true)
})
