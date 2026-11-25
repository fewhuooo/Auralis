import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}'
    const subPath = specifier.slice(2)
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts'
    return nextResolve(new URL(withExt, root).href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const {
  getTasksForAssetGroups,
  isScheduleWithinDeadline,
  parseDueTimestamp,
  localDateEndOfDay,
  getTimelineDays,
  getTimelineRange,
  getTasksForTimeline,
  isSchedulableTask,
  isOverdueTask,
  isScheduledAtInPast,
  isScheduledTaskPast,
  isUnscheduledTaskPastDue,
  comparePendingTasks,
  isCompletedTask,
  isCompletedScheduledTask,
  taskStatusToPresentation,
  isScheduledCompletionLocked,
} = await import('../src/services/taskViewRules.ts')

const task = (overrides = {}) => ({
  id: 'task-default',
  subjectId: 'subject-1',
  title: 'Task',
  status: 'pending',
  dueAt: undefined,
  scheduledAt: undefined,
  durationMinutes: 30,
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

test('completed tasks without a deadline or schedule belong in the completed Asset folder', () => {
  const groups = getTasksForAssetGroups([
    task({ id: 'pending-unassigned', status: 'pending' }),
    task({ id: 'completed-unassigned', status: 'completed' }),
    task({ id: 'canonical-done-unassigned', status: 'DONE' }),
  ])

  assert.deepEqual(groups.unassigned.map((item) => item.id), ['pending-unassigned'])
  assert.deepEqual(groups.completed.map((item) => item.id), ['completed-unassigned', 'canonical-done-unassigned'])
})

test('local and pulled DONE projections become checked presentation tasks and completed Asset entries', async () => {
  const { LocalRepository, createMemoryStorage } = await import('../src/services/localRepository.ts')
  const { mapTaskView } = await import('../src/services/domainMappers.ts')
  const { applyPullPage } = await import('../src/services/syncCycle.ts')
  const scheduledAt = '2026-09-24T09:00:00.000Z'
  const localRepository = new LocalRepository('user-flow', 'device-local-flow', { storage: createMemoryStorage() })
  await localRepository.upsert('TASK', 'local-done', {
    id: 'local-done', subjectId: 'subject-1', title: 'Local completion', status: 'TODO',
    scheduledAt, durationMinutes: 30, version: 7,
  }, { version: 7, syncStatus: 'synced' })
  await localRepository.commitMutation({
    resourceType: 'TASK', resourceId: 'local-done',
    value: { id: 'local-done', subjectId: 'subject-1', title: 'Local completion', status: 'DONE', scheduledAt, durationMinutes: 30, version: 7 },
    version: 7, deletedAt: null,
    mutation: { clientMutationId: 'local-completion', resourceType: 'TASK', resourceId: 'local-done', mutationType: 'UPDATE', baseVersion: 7, payload: { status: 'DONE' } },
  })

  const localRow = await localRepository.read('TASK', 'local-done')
  const localModel = mapTaskView(localRow.value)
  const localTask = { ...localModel, status: taskStatusToPresentation(localModel.status, localModel.scheduledAt) }
  assert.equal(localTask.status, 'completed')
  assert.equal(isCompletedScheduledTask(localTask), true, 'Dashboard day schedule checkbox reads checked presentation state')
  assert.deepEqual(getTasksForAssetGroups([localTask]).completed.map((item) => item.id), ['local-done'])

  const syncRepository = new LocalRepository('user-flow', 'device-sync-flow', { storage: createMemoryStorage() })
  const changed = await applyPullPage(syncRepository, [{
    cursor: 'c-8', resourceType: 'TASK', resourceId: 'remote-done', mutationType: 'UPDATE', version: 8,
    payload: { id: 'remote-done', subjectId: 'subject-1', title: 'Pulled completion', status: 'DONE', scheduledAt, durationMinutes: 30, version: 8 },
  }])
  assert.equal(changed.has('TASK'), true)
  const remoteRow = await syncRepository.read('TASK', 'remote-done')
  const remoteModel = mapTaskView(remoteRow.value)
  const remoteTask = { ...remoteModel, status: taskStatusToPresentation(remoteModel.status, remoteModel.scheduledAt) }
  assert.equal(remoteTask.status, 'completed')
  assert.equal(isCompletedScheduledTask(remoteTask), true, 'Dashboard must remain checked after the local projection reloads a pull result')
  assert.deepEqual(getTasksForAssetGroups([remoteTask]).completed.map((item) => item.id), ['remote-done'])
})

test('ended scheduled completions cannot be toggled back to active but unfinished tasks can still be completed', () => {
  const now = new Date('2026-09-25T10:00:00.000Z')
  const endedCompleted = task({ status: 'completed', scheduledAt: '2026-09-25T09:00:00.000Z', durationMinutes: 30 })
  assert.equal(isScheduledTaskPast(endedCompleted, now), false, 'auto-completion eligibility is false after the task is complete')
  assert.equal(isScheduledCompletionLocked(endedCompleted, now), true, 'the end-time lock must still cover an already completed task')
  assert.equal(isScheduledCompletionLocked(task({ status: 'DONE', scheduledAt: '2026-09-25T09:00:00.000Z', durationMinutes: 30 }), now), true)
  assert.equal(isScheduledCompletionLocked(task({ status: 'scheduled', scheduledAt: '2026-09-25T09:00:00.000Z', durationMinutes: 30 }), now), false)
  assert.equal(isScheduledCompletionLocked(task({ status: 'completed', scheduledAt: '2026-09-25T09:45:00.000Z', durationMinutes: 30 }), now), false)
  assert.equal(isScheduledCompletionLocked(task({ status: 'completed' }), now), false)
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

test('all unscheduled active tasks enter the scheduling queue regardless of deadline, including overdue unscheduled tasks', () => {
  assert.equal(isSchedulableTask(task({ dueAt: '2026-09-23T00:00:00Z' })), true)
  assert.equal(isSchedulableTask(task({ dueAt: '2026-08-01T00:00:00Z' })), true)
  assert.equal(isSchedulableTask(task()), true)
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
  const exactlyDueUnscheduledTask = task({ id: 'exactly-due', dueAt: '2026-08-22T02:00:00Z' })

  assert.equal(typeof isScheduledTaskPast, 'function')
  assert.equal(typeof isUnscheduledTaskPastDue, 'function')
  assert.equal(isScheduledTaskPast(elapsedTimelineTask, now), true)
  assert.equal(isScheduledTaskPast(futureTimelineTaskWithPastDeadline, now), false)
  assert.equal(isUnscheduledTaskPastDue(overdueUnscheduledTask, now), true)
  assert.equal(isUnscheduledTaskPastDue(exactlyDueUnscheduledTask, now), true, 'boundary condition: dueAt <= now should be true')
  assert.equal(isUnscheduledTaskPastDue(elapsedTimelineTask, now), false)
})

test('scheduled task auto-completion waits until its scheduled duration ends', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')

  assert.equal(isScheduledTaskPast(task({
    scheduledAt: '2026-08-22T09:45:00+08:00',
    durationMinutes: 30,
  }), now), false, 'a task still in its scheduled interval must remain active')
  assert.equal(isScheduledTaskPast(task({
    scheduledAt: '2026-08-22T09:30:00+08:00',
    durationMinutes: 30,
  }), now), true, 'a task ending at the current time should be eligible for completion')
})

test('marks an unfinished scheduled task overdue after its full scheduled interval passes', () => {
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

test('comparePendingTasks prioritizes tasks with deadline, earlier deadline, and shorter duration', () => {
  const taskA = task({ id: 'has-due-near-short', title: 'A', dueAt: '2026-08-22T10:00:00Z', durationMinutes: 30 })
  const taskB = task({ id: 'has-due-near-long', title: 'B', dueAt: '2026-08-22T10:00:00Z', durationMinutes: 90 })
  const taskC = task({ id: 'has-due-far-short', title: 'C', dueAt: '2026-08-25T10:00:00Z', durationMinutes: 30 })
  const taskD = task({ id: 'no-due-short', title: 'D', dueAt: null, durationMinutes: 30 })
  const taskE = task({ id: 'no-due-long', title: 'E', dueAt: null, durationMinutes: 120 })

  const list = [taskE, taskD, taskC, taskB, taskA]
  const sorted = [...list].sort(comparePendingTasks)

  assert.deepEqual(sorted.map((item) => item.id), [
    'has-due-near-short',
    'has-due-near-long',
    'has-due-far-short',
    'no-due-short',
    'no-due-long',
  ])
})

test('deadline guard: isScheduleWithinDeadline identifies valid and invalid schedules', () => {
  assert.equal(isScheduleWithinDeadline('2026-10-06T09:00:00.000Z', 30, '2026-10-06T10:00:00.000Z'), true)
  assert.equal(isScheduleWithinDeadline('2026-10-06T09:30:00.000Z', 30, '2026-10-06T10:00:00.000Z'), true)
  assert.equal(isScheduleWithinDeadline('2026-10-06T09:31:00.000Z', 30, '2026-10-06T10:00:00.000Z'), false)
  assert.equal(isScheduleWithinDeadline('2026-10-06T11:30:00+02:00', 30, '2026-10-06T10:00:00.000Z'), true, 'offset timestamps are compared as instants')

  assert.equal(isScheduleWithinDeadline('2026-10-06T09:00:00.000Z', 60, '2026-10-06T10:00:00.000Z'), true)

  assert.equal(isScheduleWithinDeadline('2026-10-06T09:00:00.000Z', 60, null), true)
  assert.equal(isScheduleWithinDeadline('2026-10-06T09:00:00.000Z', 60, undefined), true)

  assert.equal(isScheduleWithinDeadline('2026-10-06T09:30:00.000Z', null, '2026-10-06T10:00:00.000Z'), true)
  assert.equal(isScheduleWithinDeadline('2026-10-06T09:31:00.000Z', null, '2026-10-06T10:00:00.000Z'), false, 'null duration defaults to 30 minutes at the deadline boundary')
  assert.equal(isScheduleWithinDeadline('2026-10-06T09:31:00.000Z', undefined, '2026-10-06T10:00:00.000Z'), false)
})

test('stored deadlines require a timezone-qualified instant while date input conversion remains local end of day', () => {
  const dateOnly = '2099-10-06'
  const expectedLocalEnd = new Date(2099, 9, 6, 23, 59, 59, 999).getTime()
  assert.equal(Number.isNaN(parseDueTimestamp(dateOnly)), true)
  assert.equal(localDateEndOfDay(dateOnly)?.toISOString(), new Date(expectedLocalEnd).toISOString())
  assert.equal(localDateEndOfDay('2099-02-30'), undefined)
  assert.equal(Number.isNaN(parseDueTimestamp('2099-10-06T12:00:00')), true)

  const midnight = '2099-10-06T00:00:00.000Z'
  const offsetMidnight = '2099-10-06T00:00:00+08:00'
  const utcEndOfDay = '2099-10-06T23:59:59.999Z'
  const offsetEndOfDay = '2099-10-06T23:59:59.999-05:00'
  for (const value of [midnight, offsetMidnight, utcEndOfDay, offsetEndOfDay]) {
    assert.equal(parseDueTimestamp(value), Date.parse(value), `${value} must remain its exact instant`)
  }
})

test('timestamp deadlines allow an interval ending exactly at the instant and reject any overrun', () => {
  const dueAt = '2099-10-06T00:30:00.000Z'
  assert.equal(isScheduleWithinDeadline('2099-10-06T00:00:00.000Z', 30, dueAt), true)
  assert.equal(isScheduleWithinDeadline('2099-10-06T00:00:00.001Z', 30, dueAt), false)
  assert.equal(isScheduleWithinDeadline('2099-10-05T16:00:00.000-08:00', 30, dueAt), true)
  assert.equal(isScheduleWithinDeadline('2099-10-06T00:00:00.001Z', 30, '2099-10-06T00:00:00.000Z'), false)
})

test('stored date-only deadlines are not treated as an unlimited deadline or as a due date', () => {
  const dateOnly = '2099-10-06'
  assert.equal(isScheduleWithinDeadline('2099-10-06T12:00:00.000Z', 30, dateOnly), false)
  assert.equal(isScheduleWithinDeadline('2099-10-06T12:00:00.000Z', 30, '2099-10-06T12:00:00'), false)
  assert.equal(isScheduleWithinDeadline('2099-10-06T12:00:00.000Z', 30, null), true)

  const noonToday = new Date(2099, 9, 6, 12, 0, 0, 0)
  const noonTomorrow = new Date(2099, 9, 7, 12, 0, 0, 0)
  assert.equal(isUnscheduledTaskPastDue({ dueAt: dateOnly, scheduledAt: undefined }, noonToday), false)
  assert.equal(isUnscheduledTaskPastDue({ dueAt: dateOnly, scheduledAt: undefined }, noonTomorrow), false)
})
