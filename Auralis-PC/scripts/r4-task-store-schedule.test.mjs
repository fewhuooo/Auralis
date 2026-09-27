import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as taskViewRulesModule from '../src/services/taskViewRules.ts'
import { mapTaskView } from '../src/services/domainMappers.ts'

const { findScheduleConflict } = taskViewRulesModule

const source = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
const taskViewRules = await readFile(new URL('../src/services/taskViewRules.ts', import.meta.url), 'utf8')
const timeline = await readFile(new URL('../src/views/Timeline/index.vue', import.meta.url), 'utf8')
const taskApi = await readFile(new URL('../src/api/useTaskApi.ts', import.meta.url), 'utf8')
const taskApiSchema = await readFile(new URL('../src/api/generated/schema.ts', import.meta.url), 'utf8')

test('store derives scheduling queue from unscheduled active tasks', () => {
  assert.match(source, /pendingTasks\.value = tasks\.filter\(\(task\) => isSchedulableTask\(task\)\)/)
  assert.match(source, /const scheduled = getTasksForTimeline\(tasks\)/)
})

test('status changes preserve schedule and unschedule is explicit', () => {
  assert.match(source, /const model = toTaskModel\(\{ \.\.\.current, status: newStatus, scheduledAt: current\.scheduledAt \}\)/)
  assert.match(source, /scheduledAt: undefined, startTime: undefined/)
  assert.doesNotMatch(source, /status: newStatus, scheduledAt: newStatus === 'scheduled' \? current\.scheduledAt : undefined/)
})

test('store rejects uncompleting an ended scheduled task even when called outside the Dashboard', () => {
  const statusSource = source.slice(source.indexOf('async function updateTaskStatus('), source.indexOf('async function updateTaskDetails('))
  assert.match(statusSource, /newStatus !== 'completed'[\s\S]*?isScheduledCompletionLocked\(current\)[\s\S]*?throw new Error\('已结束的排期任务不能取消完成状态'\)/)
})

test('completed tasks remain schedulable in the timeline model', () => {
  assert.match(source, /status: taskStatusToPresentation\(model\.status, model\.scheduledAt\)/)
  assert.match(taskViewRules, /export function taskStatusToPresentation\(status: 'TODO' \| 'IN_PROGRESS' \| 'DONE' \| 'CANCELLED', scheduledAt\?: string\)/)
  assert.match(taskViewRules, /if \(status === 'CANCELLED'\) return 'cancelled'/)
})

test('completed scheduled tasks are fixed before any schedule mutation', () => {
  assert.match(taskViewRules, /export function isCompletedScheduledTask\(task: TaskStatusFields\): boolean/)
  assert.match(taskViewRules, /return task\.status === 'completed' && Boolean\(task\.scheduledAt\)/)

  const scheduleTaskSource = source.slice(source.indexOf('async function scheduleTask('), source.indexOf('async function scheduleTaskToDay('))
  assert.match(scheduleTaskSource, /if \(slot\.task && isCompletedScheduledTask\(slot\.task\)\)[\s\S]*?throw new Error\('已完成的排期任务已固定'\)/)

  const scheduleTaskToDaySource = source.slice(source.indexOf('async function scheduleTaskToDay('), source.indexOf('async function rescheduleTask('))
  assert.match(scheduleTaskToDaySource, /if \(isCompletedScheduledTask\(task\)\)[\s\S]*?throw new Error\('已完成的排期任务已固定'\)/)

  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function unscheduleTask('))
  assert.match(source, /async function insertTaskAtSlot\([\s\S]*?if \(isCompletedScheduledTask\(task\)\) throw new Error\('已完成的排期任务已固定'\)/)
  assert.match(rescheduleTaskSource, /await insertTaskAtSlot\(taskId, toSlotTime, selectedDay\.value, targetTaskId\)/)
  const swapTaskSource = source.slice(source.indexOf('async function swapScheduledTasks('), source.indexOf('async function unscheduleTask('))
  assert.match(swapTaskSource, /if \(isCompletedScheduledTask\(from\) \|\| isCompletedScheduledTask\(to\)\) throw new Error\('已完成的排期任务已固定'\)/)

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

test('elapsed tasks complete on the timeline while overdue unscheduled tasks preserve their deadline as reminder', () => {
  assert.match(taskViewRules, /export function isOverdueTask\(/)
  assert.match(taskViewRules, /export function isScheduledTaskPast\(/)
  assert.match(taskViewRules, /export function isUnscheduledTaskPastDue\(/)
  assert.match(source, /isScheduledTaskPast/)
  assert.match(source, /status: 'completed', scheduledAt: latestTask\.scheduledAt/)
  assert.doesNotMatch(source, /dueAt: undefined, scheduledAt: undefined/, 'Unscheduled overdue tasks must not have their deadline cleared')
  assert.match(source, /dueAt:\s*model\.dueAt \?\? null/)
  assert.doesNotMatch(source, /overdueNotice/)
  assert.doesNotMatch(source, /sessionStorage/)
  assert.doesNotMatch(source, /逾期任务移出排期失败/)
  assert.match(source, /scheduledAt: undefined, startTime: undefined/)
  assert.match(source, /await updateTaskModel\(model, \{[\s\S]*?expectedLocalVersion: localRow\.version,[\s\S]*?rejectIfNonPendingMutation: true/)
})

test('task updates explicitly clear either schedule or deadline when the model omits it', () => {
  assert.match(source, /scheduledAt:\s*normalizeScheduledAtForApi\(model\.scheduledAt\) \?\? null/)
  assert.match(source, /dueAt:\s*model\.dueAt \?\? null/)
})

test('ordinary task updates retain the local outbox path while drag insertions use the dedicated API', () => {
  const updateTaskModelSource = source.slice(source.indexOf('async function updateTaskModel('), source.indexOf('function findTask('))
  const persistOfflineSource = source.slice(source.indexOf('async function persistOffline('), source.indexOf('async function addTask('))
  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function unscheduleTask('))

  assert.match(updateTaskModelSource, /await persistOffline\(model, 'UPDATE', payload as unknown as Record<string, unknown>, options\)/)
  assert.doesNotMatch(updateTaskModelSource, /useTaskApi\.update/, 'A drag must not wait on a direct remote update')
  assert.match(persistOfflineSource, /await repo\.commitMutation\([\s\S]*?replaceInMemory\(task\)[\s\S]*?scheduleSync\(\)/)
  assert.doesNotMatch(rescheduleTaskSource, /await loadLocalTasks\(\)/, 'A drag must not re-read the local repository after the local projection is updated')
})

test('ordinary slot drops insert and cascade through the server while swap is a separate action', () => {
  const scheduleTaskSource = source.slice(source.indexOf('async function scheduleTask('), source.indexOf('async function scheduleTaskToDay('))
  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function swapScheduledTasks('))
  const swapTaskSource = source.slice(source.indexOf('async function swapScheduledTasks('), source.indexOf('async function unscheduleTask('))

  assert.match(scheduleTaskSource, /await insertTaskAtSlot\(taskId, slotTime, selectedDay\.value, targetTaskId\)/)
  assert.match(rescheduleTaskSource, /async function rescheduleTask\(taskId: string, toSlotTime: string, targetTaskId\?: string\)/)
  assert.match(rescheduleTaskSource, /await insertTaskAtSlot\(taskId, toSlotTime, selectedDay\.value, targetTaskId\)/)
  assert.doesNotMatch(rescheduleTaskSource, /timeSlots\.value\.find\(\(slot\) => slot\.time === fromSlotTime\)/)
  assert.doesNotMatch(rescheduleTaskSource, /useTaskApi\.swapSchedules/)
  assert.match(swapTaskSource, /useTaskApi\.swapSchedules/)
  assert.match(swapTaskSource, /useTaskApi\.swapSchedules[\s\S]*?return await persistRemoteScheduleModels\(changedModels\)/)
  assert.doesNotMatch(swapTaskSource, /assertScheduleDoesNotOverlap\(fromModel|findScheduleConflict\(\[movedFrom\]/, 'adjacent tasks with different durations must reach the server for compact swap validation')
  assert.match(swapTaskSource, /mapTaskView\(response\.source\)[\s\S]*?mapTaskView\(response\.target\)/, 'the server decides final start times for both swapped tasks')
})

test('task body drop places the dragged task after its target without shifting successors', () => {
  assert.equal(typeof taskViewRulesModule.getTimelineDropSlotTime, 'function')
  const getTimelineDropSlotTime = taskViewRulesModule.getTimelineDropSlotTime
  assert.equal(getTimelineDropSlotTime('09:00', 60, 0, 84), '09:00')
  assert.equal(getTimelineDropSlotTime('09:00', 60, 83, 84), '09:00')
  assert.equal(getTimelineDropSlotTime('09:00', 60, 84, 84), '09:30')
  assert.equal(getTimelineDropSlotTime('09:00', 120, 252, 84), '10:30')
  assert.equal(getTimelineDropSlotTime('22:00', 120, 252, 84), '22:30', 'the drop stays within the last visible start slot')

  assert.match(timeline, /class="slot-task"[\s\S]*?@drop\.stop\.prevent="handleDropOnTaskBody\(/)
  assert.match(timeline, /handleDropOnTaskBody[\s\S]*?handleDropAtSlot\(taskEndSlotTime\(task, startSlotTime\), task\.id\)/)
  assert.match(timeline, /const taskEndSlotTime = [\s\S]*?Math\.ceil\([\s\S]*?timeSlots\.value\.some/)
  assert.match(source, /targetTaskId,\s*\}\)/, 'body target id must reach the atomic server request')
  const dropAtSlotSource = timeline.slice(timeline.indexOf('const handleDropAtSlot ='), timeline.indexOf('const handleDropOnTaskBody ='))
  assert.match(dropAtSlotSource, /taskStore\.scheduleTask\(draggedItem\.value\.taskId, slotTime, targetTaskId\)/)
  assert.match(dropAtSlotSource, /taskStore\.rescheduleTask\(draggedItem\.value\.taskId, slotTime, targetTaskId\)/)
  assert.match(timeline, /class="task-header"[\s\S]*?@drop\.stop\.prevent="handleDropOnHeader\(/)
  assert.match(timeline, /\.time-slot\s*\{[^}]*flex-shrink:\s*0/s, 'long task rows must keep their duration height inside the scrolling flex column')
})

test('missing or stale schedule sources and invalid target slots fail with visible errors', () => {
  const insertionSource = source.slice(source.indexOf('async function insertTaskAtSlot('), source.indexOf('async function updateTaskStatus('))
  const scheduleTaskSource = source.slice(source.indexOf('async function scheduleTask('), source.indexOf('async function scheduleTaskToDay('))
  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function swapScheduledTasks('))

  assert.match(insertionSource, /if \(!task\) throw new Error\('源任务已变化，请刷新后重试'\)/)
  assert.match(scheduleTaskSource, /if \(!task \|\| !isSchedulableTask\(task\)\) throw new Error\('源任务已变化，请刷新后重试'\)/)
  assert.match(scheduleTaskSource, /if \(!slot\) throw new Error\('目标时间槽不存在，请拖到可见时段'\)/)
  assert.match(rescheduleTaskSource, /if \(!task\?\.scheduledAt \|\| task\.status === 'cancelled'\) throw new Error\('源排期已变化，请刷新后重试'\)/)
  assert.match(rescheduleTaskSource, /if \(!targetSlot\) throw new Error\('目标时间槽不存在，请拖到可见时段'\)/)
})

test('an open app periodically applies the elapsed-task transitions without any notification state', () => {
  assert.match(source, /function recoverOverdueTasks\(\)/)
  assert.match(source, /recoverOverdueTasks\(\)/)
  assert.match(source, /!isLoading\.value && useAuthStore\(\)\.isAuthenticated/)
  assert.doesNotMatch(source, /dismissOverdueNotice/)
})

test('task loading immediately recovers ended schedules and isolates per-task write failures', () => {
  const fetchTasksSource = source.slice(source.indexOf('async function fetchTasks()'), source.indexOf('subscribeProjectionChange('))
  const projectionListener = source.slice(source.indexOf('subscribeProjectionChange('), source.indexOf('function replaceInMemory('))
  const recoverySource = source.slice(source.indexOf('async function recoverOverdueTasks()'), source.indexOf('function updateCurrentSlot()'))
  const deleteTaskSource = source.slice(source.indexOf('async function deleteTask('), source.indexOf('const completedCount'))

  assert.match(fetchTasksSource, /await recoverOverdueTasks\(\)/, 'loading the task projection must check ended schedules immediately')
  assert.match(projectionListener, /void loadLocalTasks\(\)\.then\(\(\) => recoverOverdueTasks\(\)\)/, 'sync projection refresh must retry ended tasks immediately instead of waiting for the next minute tick')
  assert.match(recoverySource, /try\s*\{[\s\S]*?await updateTaskModel\(model, \{[\s\S]*?rejectIfNonPendingMutation: true[\s\S]*?\}\)[\s\S]*?\}\s*catch(?:\s*\(error\))?\s*\{/, 'a failed task write must not abort the remaining recovery scan')
  assert.match(recoverySource, /withScheduleMutation\(async\s*\(\)\s*=>\s*\{[\s\S]*?repo\.read<TaskView>\('TASK', taskId\)[\s\S]*?const current = findTask\(taskId\)[\s\S]*?localRow\.version !== current\.version[\s\S]*?localModel\.scheduledAt !== current\.scheduledAt[\s\S]*?isScheduledTaskPast\(latestTask\)[\s\S]*?updateTaskModel\(model, \{[\s\S]*?rejectIfNonPendingMutation: true/, 'each queued write must match the latest repository version and schedule before conversion')
  assert.match(recoverySource, /repo\.listUnresolved\('TASK'\)[\s\S]*?const existingMutation = unresolved\.find\(\(mutation\) => mutation\.resourceId === taskId\)[\s\S]*?status !== 'pending'[\s\S]*?return/, 'automatic completion must not add a stale mutation behind inflight, failed, or conflicted task writes')
  assert.match(recoverySource, /catch\s*\(error\)\s*\{[\s\S]*?error instanceof LocalConflictError[\s\S]*?await loadLocalTasks\(\)/, 'a version-fenced write must reload when sync advanced the repository between read and commit')
  assert.match(deleteTaskSource, /return withScheduleMutation\(async\s*\(\)\s*=>\s*\{/, 'task deletion must share the queue so recovery cannot race a delete')
})

test('all scheduling entry points reject a past target before persistence or schedule swap', () => {
  assert.match(taskViewRules, /export function isScheduledAtInPast\(/)
  assert.match(source, /function assertScheduledAtIsNotPast\(scheduledAt: string \| undefined\): void/)
  assert.match(source, /throw new Error\('不能排期到过去的时间'\)/)

  const scheduleTaskSource = source.slice(source.indexOf('async function scheduleTask('), source.indexOf('async function scheduleTaskToDay('))
  assert.match(scheduleTaskSource, /await insertTaskAtSlot\(taskId, slotTime, selectedDay\.value, targetTaskId\)/)
  assert.match(source, /async function insertTaskAtSlot\([\s\S]*?assertScheduledAtIsNotPast\(scheduledAt\)/)

  const scheduleTaskToDaySource = source.slice(source.indexOf('async function scheduleTaskToDay('), source.indexOf('async function rescheduleTask('))
  assert.match(scheduleTaskToDaySource, /assertScheduledAtIsNotPast\(model\.scheduledAt\)[\s\S]*?await updateTaskModel\(model\)/)

  const rescheduleTaskSource = source.slice(source.indexOf('async function rescheduleTask('), source.indexOf('async function unscheduleTask('))
  assert.match(rescheduleTaskSource, /await insertTaskAtSlot\(taskId, toSlotTime, selectedDay\.value, targetTaskId\)/)
  const swapTaskSource = source.slice(source.indexOf('async function swapScheduledTasks('), source.indexOf('async function unscheduleTask('))
  assert.match(swapTaskSource, /assertScheduledAtIsNotPast\(to\.scheduledAt\)[\s\S]*?assertScheduledAtIsNotPast\(from\.scheduledAt\)[\s\S]*?useTaskApi\.swapSchedules/)
})

test('unscheduleTask prioritizes lookup by task ID before slot time and preserves dueAt without fabricating one', () => {
  const unscheduleTaskSource = source.slice(source.indexOf('async function unscheduleTask('), source.indexOf('async function deleteTask('))
  assert.match(unscheduleTaskSource, /const task = findTask\(idOrSlotTime\) \?\? timeSlots\.value\.find/)
  assert.doesNotMatch(unscheduleTaskSource, /fallbackDueAt|Date\.now\(\)/, 'unscheduleTask must not fabricate a deadline when none exists')
})

test('schedule interval conflicts use half-open duration ranges and ignore cancelled tasks', () => {
  const scheduled = [
    { id: 'one', status: 'pending', scheduledAt: '2026-09-24T09:00:00.000Z', durationMinutes: 60 },
    { id: 'cancelled', status: 'cancelled', scheduledAt: '2026-09-24T10:00:00.000Z', durationMinutes: 60 },
    { id: 'completed', status: 'completed', scheduledAt: '2026-09-24T11:00:00.000Z', durationMinutes: 60 },
  ]

  assert.equal(findScheduleConflict(scheduled, {
    id: 'adjacent', status: 'pending', scheduledAt: '2026-09-24T10:00:00.000Z', durationMinutes: 30,
  }), undefined, 'a task may start exactly when the previous task ends')
  assert.equal(findScheduleConflict(scheduled, {
    id: 'overlapping', status: 'pending', scheduledAt: '2026-09-24T09:59:00.000Z', durationMinutes: 30,
  })?.id, 'one', 'any positive interval intersection must be rejected')
  assert.equal(findScheduleConflict(scheduled, {
    id: 'overlapping-completed', status: 'pending', scheduledAt: '2026-09-24T11:30:00.000Z', durationMinutes: 30,
  })?.id, 'completed', 'completed tasks keep occupying their fixed schedule interval')
})

test('remote null duration defaults to 30 minutes before interval conflict checks', () => {
  const mappedTask = mapTaskView({
    id: 'remote-task',
    subjectId: 'subject-1',
    title: 'Remote task',
    status: 'TODO',
    scheduledAt: '2026-09-24T09:30:00.000Z',
    durationMinutes: null,
  })

  assert.equal(mappedTask.durationMinutes, 30)
  assert.equal(findScheduleConflict([
    { id: 'existing-task', title: 'Existing task', status: 'pending', scheduledAt: '2026-09-24T09:55:00.000Z', durationMinutes: 30 },
  ], { ...mappedTask, status: 'pending' })?.id, 'existing-task')

  for (const invalidDuration of [undefined, Number.NaN, -1, 30.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(mapTaskView({ ...mappedTask, durationMinutes: invalidDuration }).durationMinutes, 30)
  }
  assert.equal(mapTaskView({ ...mappedTask, durationMinutes: 0 }).durationMinutes, 0, 'zero remains valid per the Task API contract')
})

test('schedule conflict checks can exclude both members of a proposed schedule swap', () => {
  const tasks = [
    { id: 'source', status: 'pending', scheduledAt: '2026-09-24T09:00:00.000Z', durationMinutes: 60 },
    { id: 'target', status: 'pending', scheduledAt: '2026-09-24T10:00:00.000Z', durationMinutes: 30 },
  ]

  assert.equal(findScheduleConflict(tasks, {
    id: 'source', status: 'pending', scheduledAt: '2026-09-24T10:00:00.000Z', durationMinutes: 60,
  }, new Set(['source', 'target'])), undefined)
})

test('schedule insertions reject unsynced affected-day projections and apply server responses atomically', () => {
  const persistOfflineSource = source.slice(source.indexOf('async function persistOffline('), source.indexOf('async function addTask('))
  const insertionSource = source.slice(source.indexOf('async function assertScheduleDaySynced('), source.indexOf('async function scheduleTaskToDay('))

  assert.match(persistOfflineSource, /current\.durationMinutes !== model\.durationMinutes/)
  assert.match(persistOfflineSource, /assertScheduleDoesNotOverlap\(model\)/)
  assert.match(insertionSource, /listUnresolved\(\)/)
  assert.match(insertionSource, /syncStatus !== 'synced'/)
  assert.match(insertionSource, /await useTaskApi\.scheduleInsertions\(/)
  assert.match(insertionSource, /response\.tasks\.map/)
  assert.match(insertionSource, /await persistRemoteScheduleModels\(changedModels\)/)
  assert.doesNotMatch(insertionSource, /completedToShift|scheduledAt!\).*requestedStart/, 'the server decides whether a completed task is actually in the shift chain')
  const cacheSource = source.slice(source.indexOf('async function persistRemoteScheduleModels('), source.indexOf('async function insertTaskAtSlot('))
  assert.match(cacheSource, /repo\.upsertSyncedBatch\(/)
  assert.doesNotMatch(cacheSource, /repo\.upsert\('TASK'/, 'the server response must not persist its tasks one by one')
  assert.match(cacheSource, /finally|catch/)
  assert.match(cacheSource, /requestBackgroundSync\('read'\)/)
  assert.match(cacheSource, /flushNow\(\)\.catch/, 'a failed local cache transaction must promptly attempt cursor-based recovery')
  assert.match(cacheSource, /await loadLocalTasks\(\)/, 'a fenced outbox batch must restore the local projection before retrying sync')
  assert.match(cacheSource, /排期已保存到服务端，本地刷新中/)
  assert.match(source, /function replaceInMemoryMany\(tasks: Task\[\]\)[\s\S]*?allTasks\.value = next[\s\S]*?rebuildSchedule\(\)/, 'both server results must replace the visible projection together')

  for (const [start, end] of [
    ['async function addTask(', 'async function updateTaskModel('],
    ['async function updateTaskStatus(', 'async function updateTaskDetails('],
    ['async function updateTaskDetails(', 'async function scheduleTask('],
    ['async function scheduleTask(', 'async function scheduleTaskToDay('],
    ['async function scheduleTaskToDay(', 'async function rescheduleTask('],
    ['async function rescheduleTask(', 'async function unscheduleTask('],
    ['async function swapScheduledTasks(', 'async function unscheduleTask('],
    ['async function unscheduleTask(', 'async function deleteTask('],
  ]) {
    assert.match(source.slice(source.indexOf(start), source.indexOf(end)), /withScheduleMutation\(/, `${start} must use the serialized scheduling queue`)
  }
})

test('dropping an unscheduled task on an occupied slot uses the atomic insertion API', () => {
  const scheduleTaskSource = source.slice(source.indexOf('async function scheduleTask('), source.indexOf('async function scheduleTaskToDay('))
  assert.match(scheduleTaskSource, /await insertTaskAtSlot\(taskId, slotTime, selectedDay\.value, targetTaskId\)/)
  assert.doesNotMatch(scheduleTaskSource, /unscheduleTask\(/, 'occupied-slot rejection must not partially unschedule the existing task')
})

test('only the task header accepts swaps; header drops stop bubbling and pending tasks get a clear rejection', async () => {
  assert.match(timeline, /class="task-header"[\s\S]*?@dragover\.stop\.prevent="handleHeaderDragOver\([\s\S]*?\)"[\s\S]*?@drop\.stop\.prevent="handleDropOnHeader\([\s\S]*?\)"/)
  assert.match(timeline, /handleDropOnHeader[\s\S]*?type === 'pending'[\s\S]*?throw new Error\('待排期任务请拖到任务主体或空槽进行插入'\)/)
  assert.match(timeline, /if \(targetTask && isCompletedScheduledTask\(targetTask\)\) throw new Error\('已完成的排期任务已固定'\)/)
  assert.match(timeline, /await taskStore\.swapScheduledTasks\(/)
  assert.match(timeline, /@drop\.prevent="handleDrop\(slot\.time\)"/)
})

test('task insertion API uses the confirmed endpoint and instant-window DTO', () => {
  assert.match(taskApi, /export type TaskScheduleInsertionRequest = components\['schemas'\]\['ScheduleInsertionRequest'\]/)
  assert.match(taskApi, /export type TaskScheduleInsertionResponse = components\['schemas'\]\['ScheduleInsertionResponse'\]/)
  assert.match(taskApiSchema, /ScheduleInsertionRequest: \{[\s\S]*?taskId: string[\s\S]*?baseVersion: number[\s\S]*?scheduledAt: string[\s\S]*?windowStartAt: string[\s\S]*?windowLastStartAt: string/)
  assert.match(taskApiSchema, /ScheduleInsertionResponse: \{\s*tasks: components\["schemas"\]\["Response"\]\[\]/)
  assert.match(taskApi, /scheduleInsertions\(data: TaskScheduleInsertionRequest\)[\s\S]*?request\.post\('\/api\/tasks\/schedule-insertions', data\)/)
})
