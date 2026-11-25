import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatFocusClockDateTime,
  formatFocusScheduledTime,
  resolveDefaultFocusTask,
  resolveDisplayedFocusTask,
} from '../src/services/focusController.ts'

test('resolveDefaultFocusTask picks ongoing scheduled task before imminent or free study', () => {
  const nowMs = new Date(2026, 10, 18, 10, 15, 0, 0).getTime()
  const ongoingStart = new Date(2026, 10, 18, 10, 0, 0, 0).toISOString()
  const imminentStart = new Date(2026, 10, 18, 10, 20, 0, 0).toISOString()

  const picked = resolveDefaultFocusTask([
    {
      id: 'task-imminent',
      name: 'Imminent Task',
      status: 'scheduled',
      scheduledAt: imminentStart,
      duration: 25,
    },
    {
      id: 'task-ongoing',
      name: 'Ongoing Task',
      status: 'scheduled',
      scheduledAt: ongoingStart,
      duration: 30,
    },
  ], nowMs)

  assert.equal(picked?.id, 'task-ongoing')
})

test('resolveDefaultFocusTask picks imminent task within 10 minutes and skips completed, deleted, cancelled, and distant tasks', () => {
  const nowMs = new Date(2026, 10, 18, 10, 0, 0, 0).getTime()
  const pastEnded = new Date(2026, 10, 18, 9, 0, 0, 0).toISOString()
  const deletedImminent = new Date(2026, 10, 18, 10, 3, 0, 0).toISOString()
  const completedImminent = new Date(2026, 10, 18, 10, 4, 0, 0).toISOString()
  const cancelledImminent = new Date(2026, 10, 18, 10, 5, 0, 0).toISOString()
  const validImminent = new Date(2026, 10, 18, 10, 10, 0, 0).toISOString()
  const distantFuture = new Date(2026, 10, 18, 10, 11, 0, 0).toISOString()

  const picked = resolveDefaultFocusTask([
    { id: 'past', name: 'Past', status: 'scheduled', scheduledAt: pastEnded, duration: 30 },
    { id: 'deleted', name: 'Deleted', status: 'scheduled', scheduledAt: deletedImminent, duration: 30, is_deleted: true },
    { id: 'done', name: 'Done', status: 'completed', scheduledAt: completedImminent, duration: 30 },
    { id: 'cancelled', name: 'Cancelled', status: 'cancelled', scheduledAt: cancelledImminent, duration: 30 },
    { id: 'distant', name: 'Distant', status: 'scheduled', scheduledAt: distantFuture, duration: 30 },
    { id: 'imminent', name: 'Imminent', status: 'scheduled', scheduledAt: validImminent, duration: 25 },
  ], nowMs)

  assert.equal(picked?.id, 'imminent')

  const noneAvailable = resolveDefaultFocusTask([
    { id: 'distant', name: 'Distant', status: 'scheduled', scheduledAt: distantFuture, duration: 30 },
    { id: 'pending', name: 'Pending', status: 'pending', duration: 25 },
  ], nowMs)
  assert.equal(noneAvailable, null)
})

test('resolveDisplayedFocusTask and focus clock formatters project free study, scheduled, linked, and missing tasks', () => {
  const refDate = new Date(2026, 10, 18, 9, 5, 0, 0)
  const clock = formatFocusClockDateTime(refDate)
  assert.equal(clock.dateText, '11月18日 周三')
  assert.equal(clock.timeText, '09:05')

  const freeView = resolveDisplayedFocusTask({
    selectedTaskId: '',
    selectedTaskTitle: '',
    selectedTaskSubject: '',
    tasks: [],
    nowMs: refDate.getTime(),
  })
  assert.deepEqual(freeView, {
    id: '',
    name: '自由学习',
    timeStr: '随时开启专注',
    statusTag: '自由模式',
    bannerDesc: '自主掌握心流节奏 · 自由专注',
    isFreeStudy: true,
  })

  const scheduledIso = new Date(2026, 10, 18, 14, 30, 0, 0).toISOString()
  assert.equal(formatFocusScheduledTime(scheduledIso, refDate), '11月18日 14:30')

  const nextYearIso = new Date(2027, 0, 5, 8, 5, 0, 0).toISOString()
  assert.equal(formatFocusScheduledTime(nextYearIso, refDate), '2027年1月5日 08:05')

  const scheduledView = resolveDisplayedFocusTask({
    selectedTaskId: 't-sched',
    selectedTaskTitle: 'Probability Drills',
    selectedTaskSubject: 'Math',
    tasks: [{
      id: 't-sched',
      name: 'Probability Drills',
      subject: 'Math',
      duration: 45,
      status: 'scheduled',
      scheduledAt: scheduledIso,
    }],
    nowMs: refDate.getTime(),
  })
  assert.deepEqual(scheduledView, {
    id: 't-sched',
    name: 'Probability Drills',
    timeStr: '11月18日 14:30',
    statusTag: '已排期',
    bannerDesc: '排期时间：11月18日 14:30',
    isFreeStudy: false,
  })

  const linkedView = resolveDisplayedFocusTask({
    selectedTaskId: 't-todo',
    selectedTaskTitle: 'Read Paper',
    selectedTaskSubject: 'NLP',
    tasks: [{
      id: 't-todo',
      name: 'Read Paper',
      subject: 'NLP',
      duration: 25,
      status: 'pending',
    }],
    nowMs: refDate.getTime(),
  })
  assert.deepEqual(linkedView, {
    id: 't-todo',
    name: 'Read Paper',
    timeStr: '25m',
    statusTag: '关联任务',
    bannerDesc: 'NLP · 预计 25m',
    isFreeStudy: false,
  })

  const missingView = resolveDisplayedFocusTask({
    selectedTaskId: 't-deleted',
    selectedTaskTitle: '',
    selectedTaskSubject: '',
    tasks: [],
    nowMs: refDate.getTime(),
  })
  assert.equal(missingView.name, '关联任务暂不可见')
  assert.equal(missingView.statusTag, '关联任务')
  assert.equal(missingView.isFreeStudy, false)
})
