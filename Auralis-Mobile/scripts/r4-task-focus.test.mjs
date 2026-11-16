import assert from 'node:assert/strict'
import test from 'node:test'

import { createFocusApi } from '../src/api/focusApi.ts'
import { createFocusController } from '../src/services/focusController.ts'
import { combineLocalDateAndTime, formatLocalTimeHHmm, toLocalDateKey } from '../src/utils/dateKey.ts'
import {
  fromServerTaskPayload,
  getPendingTodos,
  getScheduledTasksForLocalDate,
  toServerTaskCommand,
} from '../src/utils/taskSyncMapper.ts'

test('task sync preserves non-whole-hour future scheduledAt, dueAt, and unschedule null semantics', () => {
  const scheduledIso = combineLocalDateAndTime('2026-11-20', '09:30')
  const secondIso = combineLocalDateAndTime('2026-11-20', '09:15')
  const dueIso = combineLocalDateAndTime('2026-11-25', '23:59')

  const command = toServerTaskCommand({
    subjectId: 'sub-1',
    name: 'Linear Algebra Review',
    desc: 'Eigenvalues',
    duration: 1.5,
    status: 'scheduled',
    scheduledAt: scheduledIso,
    dueAt: dueIso,
    position: 'b',
  }, 'CREATE')

  assert.equal(command.status, 'IN_PROGRESS')
  assert.equal(command.scheduledAt, scheduledIso)
  assert.equal(command.dueAt, dueIso)
  assert.equal(command.durationMinutes, 1.5)

  const hydratedFirst = fromServerTaskPayload({
    id: 'task-1',
    subjectId: 'sub-1',
    title: command.title,
    description: command.description,
    status: 'IN_PROGRESS',
    scheduledAt: scheduledIso,
    dueAt: dueIso,
    durationMinutes: 1.5,
    sortKey: 'b',
    version: 3,
  })
  const hydratedSecond = fromServerTaskPayload({
    id: 'task-2',
    subjectId: 'sub-1',
    title: 'Morning Warmup',
    status: 'DONE',
    scheduledAt: secondIso,
    durationMinutes: 0.5,
    sortKey: 'a',
    version: 2,
  })

  assert.equal(hydratedFirst.startTime, formatLocalTimeHHmm(scheduledIso))
  assert.equal(hydratedFirst.dueAt, dueIso)
  assert.equal(toLocalDateKey(hydratedFirst.scheduledAt), '2026-11-20')
  assert.equal(hydratedSecond.status, 'completed')

  const dayList = getScheduledTasksForLocalDate([hydratedFirst, hydratedSecond], '2026-11-20')
  assert.deepEqual(dayList.map(item => item.id), ['task-2', 'task-1'])

  const unscheduleCmd = toServerTaskCommand({
    subjectId: 'sub-1',
    name: 'Linear Algebra Review',
    duration: 1.5,
    status: 'pending',
    scheduledAt: undefined,
    dueAt: undefined,
  }, 'UPDATE')
  assert.equal(unscheduleCmd.status, 'TODO')
  assert.equal(unscheduleCmd.scheduledAt, null)
  assert.equal(unscheduleCmd.dueAt, null)

  const revertedPending = fromServerTaskPayload({
    id: 'task-1',
    title: 'Linear Algebra Review',
    status: 'TODO',
    scheduledAt: null,
  })
  assert.equal(revertedPending.status, 'pending')
  assert.equal(getPendingTodos([revertedPending, hydratedSecond]).map(item => item.id).join(','), 'task-1')
})

test('focus controller persists wall-clock progress across scopes, records natural completion once, and ignores skip', async () => {
  const storageMap = new Map()
  let scope = 'user-a:device-1'
  let nowMs = Date.parse('2026-11-17T08:00:00.000Z')
  let nextSeq = 0
  let generation = Symbol('gen-a')
  const recorded = []

  const controller = createFocusController({
    storage: {
      get: key => storageMap.get(key),
      set: (key, value) => storageMap.set(key, value),
    },
    getScope: () => scope,
    now: () => nowMs,
    createId: () => `session-${++nextSeq}`,
    recordSession: async (command) => { recorded.push(command) },
    canSyncSession: () => true,
    getLoginGeneration: () => generation,
  })

  controller.setFocusMinutes(45)
  controller.selectTask({ id: 'task-99', name: 'Read Chapter 4', subject: 'Algorithms' })
  controller.start()

  // Locked while running
  const lockedSelect = controller.selectTask({ id: 'task-other', name: 'Other' })
  assert.equal(lockedSelect.selectedTaskId, 'task-99')

  // Skip while running never credits completion or records FocusSession
  const skipped = controller.skip()
  assert.equal(skipped.phase, 'shortBreak')
  assert.equal(controller.readOutbox().length, 0)
  assert.equal(controller.readDaily(toLocalDateKey(nowMs)).completedRounds, 0)

  // Return to focus, run 25m, reconcile after screen lock / tab return
  controller.skip()
  controller.setFocusMinutes(25)
  const started = controller.start()
  assert.equal(started.remainingSeconds, 1500)

  nowMs += 10 * 60 * 1000
  const mid = controller.reconcileNow()
  assert.equal(mid.completedFocusRound, false)
  assert.equal(mid.state.remainingSeconds, 900)

  nowMs += 15 * 60 * 1000 + 2000
  const finished = controller.reconcileNow()
  assert.equal(finished.completedFocusRound, true)
  assert.equal(finished.completedTaskInfo?.id, 'task-99')
  assert.equal(finished.state.phase, 'shortBreak')

  const daily = controller.readDaily(toLocalDateKey(nowMs))
  assert.equal(daily.completedRounds, 1)
  assert.equal(daily.focusSeconds, 1500)

  const flushed = await controller.flushOutbox()
  assert.equal(flushed, 1)
  assert.equal(recorded.length, 1)
  assert.equal(recorded[0].taskId, 'task-99')
  assert.equal(recorded[0].completed, true)
  assert.equal(recorded[0].durationSeconds, 1500)
  assert.equal(controller.readOutbox().length, 0)

  // Switching account isolates focus state and daily metrics
  scope = 'user-b:device-1'
  generation = Symbol('gen-b')
  assert.equal(controller.readState().selectedTaskId, '')
  assert.equal(controller.readDaily(toLocalDateKey(nowMs)).completedRounds, 0)
})

test('focus API wrapper posts to /api/focus-sessions', async () => {
  const calls = []
  const api = createFocusApi({
    async request(path, method, options) {
      calls.push({ path, method, options })
      return { id: 'focus-1', completed: true }
    },
  })
  const payload = {
    clientSessionId: 'client-1',
    taskId: 'task-1',
    startedAt: '2026-11-17T08:00:00.000Z',
    endedAt: '2026-11-17T08:25:00.000Z',
    durationSeconds: 1500,
    completed: true,
  }
  await api.recordSession(payload)
  assert.deepEqual(calls, [{ path: '/api/focus-sessions', method: 'post', options: { body: payload } }])
})
