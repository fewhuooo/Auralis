import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
const taskViewRules = await readFile(new URL('../src/services/taskViewRules.ts', import.meta.url), 'utf8')

test('store derives scheduling queue from deadline-bearing unscheduled tasks', () => {
  assert.match(source, /pendingTasks\.value = tasks\.filter\(\(task\) => isSchedulableTask\(task\)\)/)
  assert.match(source, /const scheduled = getTasksForTimeline\(tasks\)/)
})

test('status changes preserve schedule and unschedule is explicit', () => {
  assert.match(source, /const model = toTaskModel\(\{ \.\.\.current, status: newStatus, scheduledAt: current\.scheduledAt \}\)/)
  assert.match(source, /scheduledAt: undefined, startTime: undefined/)
  assert.doesNotMatch(source, /status: newStatus, scheduledAt: newStatus === 'scheduled' \? current\.scheduledAt : undefined/)
})

test('completed tasks remain schedulable in the timeline model', () => {
  assert.match(source, /statusToPresentation\(value: TaskStatus, scheduledAt\?: string\): TaskPresentationStatus/)
  assert.match(source, /if \(value === 'CANCELLED'\) return 'cancelled'/)
})

test('completed scheduled tasks are fixed before any schedule mutation', () => {
  assert.match(taskViewRules, /export function isCompletedScheduledTask\(task: TaskStatusFields\): boolean/)
  assert.match(taskViewRules, /return task\.status === 'completed' && Boolean\(task\.scheduledAt\)/)

  const scheduleTaskSource = source.slice(source.indexOf('async function scheduleTask('), source.indexOf('async function scheduleTaskToDay('))
  assert.match(scheduleTaskSource, /if \(slot\.task && isCompletedScheduledTask\(slot\.task\)\)[\s\S]*?throw new Error\('已完成的排期任务已固定'\)/)

  const scheduleTaskToDaySource = source.slice(source.indexOf('async function scheduleTaskToDay('), source.indexOf('async function rescheduleTask('))
  assert.match(scheduleTaskToDaySource, /if \(isCompletedScheduledTask\(task\)\)[\s\S]*?throw new Error\('已完成的排期任务已固定'\)/)

  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function unscheduleTask('))
  assert.match(rescheduleTaskSource, /if \(isCompletedScheduledTask\(from\) \|\| \(to && isCompletedScheduledTask\(to\)\)\)[\s\S]*?throw new Error\('已完成的排期任务已固定'\)/)

  const unscheduleTaskSource = source.slice(source.indexOf('async function unscheduleTask('), source.indexOf('async function deleteTask('))
  assert.match(unscheduleTaskSource, /if \(isCompletedScheduledTask\(task\)\)[\s\S]*?throw new Error\('已完成的排期任务已固定'\)/)
})

test('deprecated presentation-status records are rejected before the timeline projection', () => {
  const dtoFromLocalSource = source.slice(source.indexOf('function dtoFromLocal('), source.indexOf('const TIMELINE_START_MINUTES'))

  assert.match(dtoFromLocalSource, /isCanonicalTaskStatus\(candidate\.status\)/, 'Only canonical DTO statuses may enter mapTaskView directly')
  assert.match(dtoFromLocalSource, /if \(!isCanonicalTaskStatus\(candidate\.status\)\) return null/, 'Deprecated presentation records must be ignored instead of converted')
  assert.doesNotMatch(dtoFromLocalSource, /return toTaskModel\(candidate\)/, 'The deprecated local presentation conversion must not remain')
})

test('rescheduling an existing task lets the target slot override its old scheduledAt', () => {
  assert.match(
    source,
    /const scheduledAt = input\.startTime !== undefined\s*\? scheduledAtFromLegacy\(input\.startTime, fallbackDay\)\s*:\s*input\.scheduledAt/,
    'A drag to a new slot must derive scheduledAt from the new legacy startTime before preserving the old timestamp',
  )
})

test('scheduledAt is normalized to a UTC ISO instant at the API boundary', () => {
  assert.match(source, /function normalizeScheduledAtForApi\(/)
  assert.match(source, /new Date\(timestamp\)\.toISOString\(\)/)
  assert.doesNotMatch(source, /if \(trimmed\.includes\('T'\)\) return trimmed/)
})

test('elapsed tasks complete on the timeline while overdue unscheduled tasks clear their deadline', () => {
  assert.match(taskViewRules, /export function isOverdueTask\(/)
  assert.match(taskViewRules, /export function isScheduledTaskPast\(/)
  assert.match(taskViewRules, /export function isUnscheduledTaskPastDue\(/)
  assert.match(source, /isScheduledTaskPast/)
  assert.match(source, /isUnscheduledTaskPastDue/)
  assert.match(source, /status: 'completed', scheduledAt: task\.scheduledAt/)
  assert.match(source, /dueAt: undefined, scheduledAt: undefined/)
  assert.match(source, /dueAt:\s*model\.dueAt \?\? null/)
  assert.doesNotMatch(source, /overdueNotice/)
  assert.doesNotMatch(source, /sessionStorage/)
  assert.doesNotMatch(source, /逾期任务移出排期失败/)
  assert.match(source, /scheduledAt: undefined, startTime: undefined/)
  assert.match(source, /await updateTaskModel\(model\)/)
})

test('task updates explicitly clear either schedule or deadline when the model omits it', () => {
  assert.match(source, /scheduledAt:\s*normalizeScheduledAtForApi\(model\.scheduledAt\) \?\? null/)
  assert.match(source, /dueAt:\s*model\.dueAt \?\? null/)
})

test('drag scheduling persists locally before background sync instead of awaiting a task API update', () => {
  const updateTaskModelSource = source.slice(source.indexOf('async function updateTaskModel('), source.indexOf('function findTask('))
  const persistOfflineSource = source.slice(source.indexOf('async function persistOffline('), source.indexOf('async function addTask('))
  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function unscheduleTask('))

  assert.match(updateTaskModelSource, /await persistOffline\(model, 'UPDATE', payload as unknown as Record<string, unknown>\)/)
  assert.doesNotMatch(updateTaskModelSource, /useTaskApi\.update/, 'A drag must not wait on a direct remote update')
  assert.match(persistOfflineSource, /await repo\.upsert\([\s\S]*?await repo\.enqueueMutation\([\s\S]*?scheduleSync\(\)[\s\S]*?replaceInMemory\(task\)/)
  assert.doesNotMatch(rescheduleTaskSource, /await loadLocalTasks\(\)/, 'A drag must not re-read the local repository after the local projection is updated')
})

test('an open app periodically applies the elapsed-task transitions without any notification state', () => {
  assert.match(source, /function recoverOverdueTasks\(\)/)
  assert.match(source, /recoverOverdueTasks\(\)/)
  assert.match(source, /!isLoading\.value && useAuthStore\(\)\.isAuthenticated/)
  assert.doesNotMatch(source, /dismissOverdueNotice/)
})

test('all scheduling entry points reject a past target before persistence or schedule swap', () => {
  assert.match(taskViewRules, /export function isScheduledAtInPast\(/)
  assert.match(source, /function assertScheduledAtIsNotPast\(scheduledAt: string \| undefined\): void/)
  assert.match(source, /throw new Error\('不能排期到过去的时间'\)/)

  const scheduleTaskSource = source.slice(source.indexOf('async function scheduleTask('), source.indexOf('async function scheduleTaskToDay('))
  assert.match(scheduleTaskSource, /assertScheduledAtIsNotPast\(model\.scheduledAt\)[\s\S]*?await updateTaskModel\(model\)/)

  const scheduleTaskToDaySource = source.slice(source.indexOf('async function scheduleTaskToDay('), source.indexOf('async function rescheduleTask('))
  assert.match(scheduleTaskToDaySource, /assertScheduledAtIsNotPast\(model\.scheduledAt\)[\s\S]*?await updateTaskModel\(model\)/)

  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function unscheduleTask('))
  assert.match(rescheduleTaskSource, /assertScheduledAtIsNotPast\(fromModel\.scheduledAt\)[\s\S]*?useTaskApi\.swapSchedules/)
  assert.match(rescheduleTaskSource, /const toModel = toTaskModel[\s\S]*?assertScheduledAtIsNotPast\(toModel\.scheduledAt\)[\s\S]*?useTaskApi\.swapSchedules/)
})
