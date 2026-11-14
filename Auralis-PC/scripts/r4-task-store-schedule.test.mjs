import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as taskViewRulesModule from '../src/services/taskViewRules.ts'
import { mapTaskView } from '../src/services/domainMappers.ts'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
    && context.parentURL && !/\.(?:ts|js|mjs)$/.test(specifier)) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createPinia, setActivePinia } = await import('pinia')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { isOnline, useSyncStore } = await import('../src/store/useSyncStore.ts')
const { useTaskStore } = await import('../src/store/useTaskStore.ts')
const { getLocalRepository } = await import('../src/services/localDb.ts')

const { findScheduleConflict } = taskViewRulesModule

const source = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
const taskViewRules = await readFile(new URL('../src/services/taskViewRules.ts', import.meta.url), 'utf8')
const timeline = await readFile(new URL('../src/views/Timeline/index.vue', import.meta.url), 'utf8')
const taskApi = await readFile(new URL('../src/api/useTaskApi.ts', import.meta.url), 'utf8')
const taskApiSchema = await readFile(new URL('../src/api/generated/schema.ts', import.meta.url), 'utf8')

let deadlineFixtureNumber = 0

function deadlineTask(id, overrides = {}) {
  return {
    id,
    subjectId: 'deadline-subject',
    title: `Task ${id}`,
    description: `Description ${id}`,
    status: 'TODO',
    scheduledAt: undefined,
    dueAt: new Date(Date.now() - 60_000).toISOString(),
    durationMinutes: 75,
    sortKey: `sort-${id}`,
    version: 7,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function localDateKey(date) {
  if (!date || Number.isNaN(date.getTime())) return undefined
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function createTaskStoreFixture(records) {
  const suffix = ++deadlineFixtureNumber
  const userId = `task-deadline-user-${suffix}`
  const serverDeviceId = `task-deadline-device-${suffix}`
  setActivePinia(createPinia())

  const authStore = useAuthStore()
  authStore.user = { id: userId, email: `${userId}@example.test` }
  authStore.tokens = { accessToken: 'deadline-access-token', refreshToken: 'deadline-refresh-token' }
  authStore.authStatus = 'authenticated'
  authStore.serverDeviceId = serverDeviceId

  const syncStore = useSyncStore()
  const requestedSyncs = []
  syncStore.requestBackgroundSync = (reason) => requestedSyncs.push(reason)

  const repository = await getLocalRepository(userId, serverDeviceId)
  for (const record of records) {
    await repository.upsert('TASK', record.id, record, {
      version: record.version,
      deletedAt: record.deletedAt,
      syncStatus: 'synced',
    })
  }

  const onlineFlush = async () => {
    const pending = await repository.listPending('TASK')
    for (const mutation of pending) {
      if (mutation.mutationType !== 'SCHEDULE_INSERTION' && mutation.mutationType !== 'SCHEDULE_SWAP') continue
      const taskIds = mutation.payload._localAffectedTaskIds
      const items = []
      for (const taskId of Array.isArray(taskIds) ? taskIds : []) {
        const row = await repository.read('TASK', taskId)
        if (row) items.push({
          resourceType: 'TASK', resourceId: taskId, version: row.version + 1, deletedAt: row.deletedAt,
          value: { ...row.value, version: row.version + 1 },
        })
      }
      await repository.resolveScheduleMutation({ clientMutationId: mutation.clientMutationId, status: 'applied', items })
    }
    await useTaskStore().loadLocalTasks()
  }
  const realFlushNow = syncStore.flushNow
  syncStore.flushNow = onlineFlush

  return {
    repository,
    requestedSyncs,
    syncStore,
    onlineFlush,
    realFlushNow,
    taskStore: useTaskStore(),
  }
}

function taskProjection(tasks) {
  return tasks.map((task) => ({
    id: task.id,
    subjectId: task.subjectId,
    title: task.title,
    description: task.description,
    status: task.status,
    scheduledAt: task.scheduledAt,
    dueAt: task.dueAt,
    durationMinutes: task.durationMinutes,
    sortKey: task.sortKey,
    version: task.version,
    deletedAt: task.deletedAt,
    sync_status: task.sync_status,
  }))
}

test('Timeline immediately displays every queued schedule sync error after navigation', () => {
  setActivePinia(createPinia())
  const syncStore = useSyncStore()
  syncStore.scheduleSyncErrors = [
    { clientMutationId: 'schedule-error-1', code: 'VALIDATION_FAILED' },
    { clientMutationId: 'schedule-error-2', code: 'RESOURCE_VERSION_CONFLICT' },
  ]

  assert.equal(syncStore.acknowledgeScheduleSyncError('different-mutation'), false)
  assert.deepEqual(syncStore.scheduleSyncErrors, [
    { clientMutationId: 'schedule-error-1', code: 'VALIDATION_FAILED' },
    { clientMutationId: 'schedule-error-2', code: 'RESOURCE_VERSION_CONFLICT' },
  ])
  assert.equal(syncStore.acknowledgeScheduleSyncError('schedule-error-1'), true)
  assert.deepEqual(syncStore.scheduleSyncErrors, [
    { clientMutationId: 'schedule-error-2', code: 'RESOURCE_VERSION_CONFLICT' },
  ])
  assert.match(timeline, /watch\(\(\) => syncStore\.scheduleSyncErrors, \(errors\) => \{[\s\S]*?for \(const error of errors\)[\s\S]*?\}, \{ immediate: true \}\)/)
  assert.match(timeline, /syncStore\.acknowledgeScheduleSyncError\(error\.clientMutationId\)/)
})

async function taskStoreSnapshot(fixture) {
  return {
    records: await fixture.repository.list('TASK'),
    pendingMutations: await fixture.repository.listPending('TASK'),
    allTasks: taskProjection(fixture.taskStore.allTasks),
    pendingTasks: taskProjection(fixture.taskStore.pendingTasks),
    timeline: fixture.taskStore.timeSlots.map(({ time, task }) => ({
      time,
      taskId: task?.id ?? null,
      scheduledAt: task?.scheduledAt,
    })),
  }
}

async function assertDeadlineFailurePreservesStore(fixture, operation, message) {
  const before = await taskStoreSnapshot(fixture)
  const error = await operation().then(() => null, (reason) => reason)
  assert.deepEqual(await taskStoreSnapshot(fixture), before, `${message}: records, outbox, and projections must be unchanged`)
  assert.match(error?.message ?? '', /任务排期结束时间不能晚于截止期限/)
}

test('store derives scheduling queue from unscheduled active tasks', () => {
  assert.match(source, /pendingTasks\.value = tasks\.filter\(\(task\) => isSchedulableTask\(task\)\)/)
  assert.match(source, /const scheduled = getTasksForTimeline\(tasks\)/)
})

test('status changes preserve schedule and unschedule is explicit', () => {
  assert.match(source, /const model = toTaskModel\(\{ \.\.\.current, status: newStatus, scheduledAt: current\.scheduledAt, startTime: undefined \}\)/)
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

test('deprecated presentation-status records are rejected before the timeline projection', () => {
  const dtoFromLocalSource = source.slice(source.indexOf('function dtoFromLocal('), source.indexOf('function timeStringFromMinutes('))

  assert.match(dtoFromLocalSource, /isCanonicalTaskStatus\(candidate\.status\)/, 'Only canonical DTO statuses may enter mapTaskView directly')
  assert.match(dtoFromLocalSource, /if \(!isCanonicalTaskStatus\(candidate\.status\)\) return null/, 'Deprecated presentation records must be ignored instead of converted')
  assert.doesNotMatch(dtoFromLocalSource, /return toTaskModel\(candidate\)/, 'The deprecated local presentation conversion must not remain')
})

test('scheduledAt is normalized to a UTC ISO instant at the API boundary', () => {
  assert.match(source, /function normalizeScheduledAtForApi\(/)
  assert.match(source, /new Date\(timestamp\)\.toISOString\(\)/)
  assert.doesNotMatch(source, /if \(trimmed\.includes\('T'\)\) return trimmed/)
})

test('elapsed scheduled tasks and overdue unscheduled tasks both complete automatically while preserving deadlines', () => {
  assert.match(taskViewRules, /export function isOverdueTask\(/)
  assert.match(taskViewRules, /export function isScheduledTaskPast\(/)
  assert.match(taskViewRules, /export function isUnscheduledTaskPastDue\(/)
  assert.match(source, /isOverdueTask/)
  assert.match(source, /const model: TaskModel = \{ \.\.\.localModel, status: 'DONE', version: localRow\.version \}/)
  assert.doesNotMatch(source, /dueAt: undefined, scheduledAt: undefined/, 'Unscheduled overdue tasks must not have their deadline cleared')
  assert.match(source, /dueAt:\s*model\.dueAt \?\? null/)
  assert.doesNotMatch(source, /overdueNotice/)
  assert.doesNotMatch(source, /sessionStorage/)
  assert.doesNotMatch(source, /逾期任务移出排期失败/)
  assert.match(source, /await updateTaskModel\(model, \{[\s\S]*?expectedLocalVersion: localRow\.version,[\s\S]*?rejectIfNonPendingMutation: true/)
})

test('task updates explicitly clear either schedule or deadline when the model omits it', () => {
  assert.match(source, /scheduledAt:\s*model\.scheduledAt \?\? null/)
  assert.match(source, /dueAt:\s*model\.dueAt \?\? null/)
})

test('ordinary task updates retain the local outbox path while drag insertions use the dedicated API', () => {
  const updateTaskModelSource = source.slice(source.indexOf('async function updateTaskModel('), source.indexOf('function findTask('))
  const persistOfflineSource = source.slice(source.indexOf('async function persistOffline('), source.indexOf('async function addTask('))

  assert.match(updateTaskModelSource, /await persistOffline\(model, 'UPDATE', payload as unknown as Record<string, unknown>, options\)/)
  assert.doesNotMatch(updateTaskModelSource, /useTaskApi\.update/, 'A drag must not wait on a direct remote update')
  assert.match(persistOfflineSource, /await repo\.commitMutation\([\s\S]*?replaceInMemory\(task\)[\s\S]*?scheduleSync\(\)/)
})

test('schedule writes release the local mutation queue without awaiting remote sync', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const task = deadlineTask('background-schedule-sync', {
    status: 'TODO', scheduledAt: undefined, dueAt: d('20:00'), durationMinutes: 30,
  })
  const fixture = await createTaskStoreFixture([task])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')

  let flushCalled = false
  fixture.syncStore.flushNow = () => {
    flushCalled = true
    return new Promise(() => {})
  }

  let timeoutId
  try {
    const result = await Promise.race([
      fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: task.id, dateKey: '2099-10-06', slotTime: '09:00' }),
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('schedule waited for remote sync')), 500) }),
    ])
    assert.equal(result, isOnline() ? 'saved' : 'queued')
  } finally {
    clearTimeout(timeoutId)
  }

  assert.equal(flushCalled, false, 'the scheduling operation must not call flushNow')
  assert.ok(fixture.requestedSyncs.includes('write'), 'the durable mutation must still request background sync')
  const [mutation] = await fixture.repository.listPending('TASK')
  assert.equal(mutation.mutationType, 'SCHEDULE_INSERTION')
  assert.equal((await fixture.repository.read('TASK', task.id)).value.scheduledAt, d('09:00'))

  await fixture.onlineFlush()
  assert.deepEqual(await fixture.repository.listPending('TASK'), [], 'the background Sync cycle can later settle the outbox command')
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
  assert.match(recoverySource, /withScheduleMutation\(async\s*\(\)\s*=>\s*\{[\s\S]*?repo\.read<TaskView>\('TASK', taskId\)[\s\S]*?const current = findTask\(taskId\)[\s\S]*?localRow\.version !== current\.version[\s\S]*?localModel\.scheduledAt !== current\.scheduledAt[\s\S]*?localModel\.dueAt !== current\.dueAt[\s\S]*?isOverdueTask\(latestTask\)[\s\S]*?updateTaskModel\(model, \{[\s\S]*?rejectIfNonPendingMutation: true/, 'each queued write must match the latest repository version and schedule before conversion')
  assert.match(recoverySource, /repo\.listUnresolved\('TASK'\)[\s\S]*?const existingMutation = unresolved\.find\(\(mutation\) => mutation\.resourceId === taskId\)[\s\S]*?status !== 'pending'[\s\S]*?return/, 'automatic completion must not add a stale mutation behind inflight, failed, or conflicted task writes')
  assert.match(recoverySource, /catch\s*\(error\)\s*\{[\s\S]*?error instanceof LocalConflictError[\s\S]*?await loadLocalTasks\(\)/, 'a version-fenced write must reload when sync advanced the repository between read and commit')
  assert.match(deleteTaskSource, /return withScheduleMutation\(async\s*\(\)\s*=>\s*\{/, 'task deletion must share the queue so recovery cannot race a delete')
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

test('task insertion API uses the confirmed endpoint and instant-window DTO', () => {
  assert.match(taskApi, /export type TaskScheduleInsertionRequest = components\['schemas'\]\['ScheduleInsertionRequest'\]/)
  assert.match(taskApi, /export type TaskScheduleInsertionResponse = components\['schemas'\]\['ScheduleInsertionResponse'\]/)
  assert.match(taskApiSchema, /ScheduleInsertionRequest: \{[\s\S]*?taskId: string[\s\S]*?baseVersion: number[\s\S]*?scheduledAt: string[\s\S]*?windowStartAt: string[\s\S]*?windowLastStartAt: string/)
  assert.match(taskApiSchema, /ScheduleInsertionResponse: \{\s*tasks: components\["schemas"\]\["Response"\]\[\]/)
  assert.match(taskApi, /scheduleInsertions\(data: TaskScheduleInsertionRequest\)[\s\S]*?request\.post\('\/api\/tasks\/schedule-insertions', data\)/)
})

test('fetching tasks persists overdue unscheduled TODO and IN_PROGRESS as canonical DONE with their deadline and fields', async () => {
  for (const status of ['TODO', 'IN_PROGRESS']) {
    const task = deadlineTask(`auto-done-${status}`, {
      status,
      title: `Preserved ${status} title`,
      description: `Preserved ${status} description`,
      durationMinutes: 105,
      sortKey: `preserved-${status}`,
    })
    const fixture = await createTaskStoreFixture([task])

    await fixture.taskStore.fetchTasks()

    const stored = await fixture.repository.read('TASK', task.id)
    const mutations = await fixture.repository.listPending('TASK')
    assert.equal(stored.value.status, 'DONE', 'the durable resource must use the canonical completed status')
    assert.equal(stored.value.dueAt, task.dueAt, 'automatic completion must retain the original deadline')
    assert.equal(stored.value.scheduledAt, undefined)
    assert.equal(stored.value.title, task.title)
    assert.equal(stored.value.description, task.description)
    assert.equal(stored.value.durationMinutes, task.durationMinutes)
    assert.equal(stored.value.sortKey, task.sortKey)
    assert.equal(stored.value.subjectId, task.subjectId)
    assert.equal(stored.version, task.version)
    assert.equal(mutations.length, 1)
    assert.equal(mutations[0].resourceId, task.id)
    assert.equal(mutations[0].mutationType, 'UPDATE')
    assert.equal(mutations[0].baseVersion, task.version)
    assert.equal(mutations[0].payload.status, 'DONE')
    assert.equal(mutations[0].payload.dueAt, task.dueAt)
    assert.equal(mutations[0].payload.title, task.title)
    assert.equal(fixture.taskStore.allTasks.find((candidate) => candidate.id === task.id).status, 'completed')
    assert.ok(fixture.requestedSyncs.includes('write'), 'a durable DONE mutation must request background sync')
  }
})

test('fetching tasks leaves ineligible deadlines and still-running scheduled tasks unchanged', async () => {
  const now = Date.now()
  const records = [
    deadlineTask('future-deadline', { dueAt: new Date(now + 60 * 60_000).toISOString() }),
    deadlineTask('empty-deadline', { dueAt: undefined }),
    deadlineTask('invalid-deadline', { dueAt: 'not-an-instant' }),
    deadlineTask('already-done', { status: 'DONE' }),
    deadlineTask('cancelled', { status: 'CANCELLED' }),
    deadlineTask('scheduled-still-running', {
      scheduledAt: new Date(now - 15 * 60_000).toISOString(),
      dueAt: new Date(now - 60 * 60_000).toISOString(),
      durationMinutes: 60,
    }),
  ]
  const fixture = await createTaskStoreFixture(records)

  await fixture.taskStore.fetchTasks()

  assert.deepEqual(await fixture.repository.listPending('TASK'), [])
  for (const record of records) {
    const stored = await fixture.repository.read('TASK', record.id)
    assert.equal(stored.value.status, record.status, `${record.id} must keep its existing status`)
    assert.equal(stored.value.dueAt, record.dueAt, `${record.id} must keep its deadline value`)
    assert.equal(stored.value.scheduledAt, record.scheduledAt, `${record.id} must keep its schedule value`)
  }
})

test('re-reading an overdue candidate respects a newer deadline, schedule, cancellation, or deletion', async () => {
  const now = Date.now()
  const records = [
    deadlineTask('deadline-extended'),
    deadlineTask('new-schedule'),
    deadlineTask('newly-cancelled'),
    deadlineTask('newly-deleted'),
  ]
  const changes = new Map([
    [records[0].id, { ...records[0], dueAt: new Date(now + 60 * 60_000).toISOString() }],
    [records[1].id, { ...records[1], scheduledAt: new Date(now + 2 * 24 * 60 * 60_000).toISOString(), version: records[1].version + 1 }],
    [records[2].id, { ...records[2], status: 'CANCELLED', version: records[2].version + 1 }],
    [records[3].id, { ...records[3], deletedAt: new Date(now).toISOString(), version: records[3].version + 1 }],
  ])
  const fixture = await createTaskStoreFixture(records)
  const originalRead = fixture.repository.read.bind(fixture.repository)
  const originalUpsertFromSync = fixture.repository.upsertFromSync.bind(fixture.repository)
  const rereadIds = []

  fixture.repository.read = async (resourceType, resourceId) => {
    const changed = resourceType === 'TASK' ? changes.get(resourceId) : undefined
    if (changed) {
      changes.delete(resourceId)
      rereadIds.push(resourceId)
      const applied = await originalUpsertFromSync('TASK', resourceId, changed, {
        version: changed.version,
        deletedAt: changed.deletedAt,
        syncStatus: 'synced',
      })
      assert.equal(applied, true, 'the simulated remote projection must be applied before the recovery read')
    }
    return originalRead(resourceType, resourceId)
  }

  await fixture.taskStore.fetchTasks()
  await fixture.taskStore.loadLocalTasks()

  assert.deepEqual(rereadIds.sort(), records.map((record) => record.id).sort(), 'each overdue snapshot candidate must be re-read')
  assert.deepEqual(await fixture.repository.listPending('TASK'), [], 'stale candidates must not create local DONE mutations')
  assert.equal((await fixture.repository.read('TASK', records[0].id)).value.dueAt, changes.get(records[0].id)?.dueAt ?? new Date(now + 60 * 60_000).toISOString())
  assert.equal((await fixture.repository.read('TASK', records[0].id)).value.status, 'TODO')
  assert.equal((await fixture.repository.read('TASK', records[1].id)).value.scheduledAt, records[1] && new Date(now + 2 * 24 * 60 * 60_000).toISOString())
  assert.equal((await fixture.repository.read('TASK', records[1].id)).value.status, 'TODO')
  assert.equal((await fixture.repository.read('TASK', records[2].id)).value.status, 'CANCELLED')
  assert.ok((await fixture.repository.read('TASK', records[3].id)).deletedAt)
  assert.equal(fixture.taskStore.allTasks.some((task) => task.id === records[3].id), false, 'deleted projections must stay hidden')
})

test('real subject cascade tombstones fence automatic completion at read and commit boundaries', async (t) => {
  for (const scheduled of [false, true]) {
    for (const racePoint of ['during-read', 'before-commit']) {
      await t.test(`${racePoint}; ${scheduled ? 'scheduled' : 'unscheduled'} task`, async () => {
        const task = deadlineTask(`cascade-${racePoint}-${scheduled}`, {
          scheduledAt: scheduled
            ? new Date(Date.now() - (75 + 60) * 60_000).toISOString()
            : undefined,
        })
        const fixture = await createTaskStoreFixture([task])
        const originalRead = fixture.repository.read.bind(fixture.repository)
        const originalCommitMutation = fixture.repository.commitMutation.bind(fixture.repository)
        const cascadeAt = new Date().toISOString()
        let cascadeApplied = false

        const applyCascade = async () => {
          const impacted = await fixture.repository.tombstoneSubjectChildren(task.subjectId, cascadeAt)
          assert.ok(impacted.some((resource) => resource.resourceType === 'TASK' && resource.id === task.id))
          cascadeApplied = true
        }

        if (racePoint === 'during-read') {
          fixture.repository.read = async (resourceType, resourceId) => {
            if (!cascadeApplied && resourceType === 'TASK' && resourceId === task.id) await applyCascade()
            return originalRead(resourceType, resourceId)
          }
        } else {
          fixture.repository.commitMutation = async (input) => {
            if (!cascadeApplied && input.resourceType === 'TASK' && input.resourceId === task.id) await applyCascade()
            return originalCommitMutation(input)
          }
        }

        await fixture.taskStore.fetchTasks()

        const stored = await originalRead('TASK', task.id)
        assert.ok(cascadeApplied, 'the real subject cascade must run in the selected race window')
        const pending = (await fixture.repository.listPending('TASK')).map(({ resourceId, payload }) => ({ resourceId, payload }))
        await fixture.taskStore.loadLocalTasks()
        assert.deepEqual({
          deletedAt: stored.deletedAt,
          version: stored.version,
          status: stored.value.status,
          pending,
          visibleAfterRehydrate: fixture.taskStore.allTasks.some((candidate) => candidate.id === task.id),
        }, {
          deletedAt: cascadeAt,
          version: task.version,
          status: task.status,
          pending: [],
          visibleAfterRehydrate: false,
        }, 'automatic completion must preserve the real cascade tombstone without adding DONE to the outbox or showing the task again')
      })
    }
  }
})

test('a failed task commit does not starve later tasks and a later fetch retries once without duplicating DONE', async () => {
  const first = deadlineTask('commit-retry-first')
  const second = deadlineTask('commit-retry-second', { status: 'IN_PROGRESS' })
  const fixture = await createTaskStoreFixture([first, second])
  const originalCommitMutation = fixture.repository.commitMutation.bind(fixture.repository)
  const attempts = new Map()

  fixture.repository.commitMutation = async (input) => {
    const count = (attempts.get(input.resourceId) ?? 0) + 1
    attempts.set(input.resourceId, count)
    if (input.resourceId === first.id && count === 1) throw new Error('TASK_LOCAL_COMMIT_FAILED')
    return originalCommitMutation(input)
  }

  await fixture.taskStore.fetchTasks()

  assert.equal((await fixture.repository.read('TASK', first.id)).value.status, 'TODO')
  assert.equal((await fixture.repository.read('TASK', second.id)).value.status, 'DONE', 'a first-row failure must not stop later task commits')
  assert.deepEqual((await fixture.repository.listPending('TASK')).map((mutation) => mutation.resourceId), [second.id])

  await fixture.taskStore.fetchTasks()
  await fixture.taskStore.fetchTasks()

  assert.equal((await fixture.repository.read('TASK', first.id)).value.status, 'DONE', 'a later task check must retry the failed commit')
  assert.equal(attempts.get(first.id), 2)
  assert.equal(attempts.get(second.id), 1, 'already-DONE tasks must not be committed again')
  assert.equal((await fixture.repository.listPending('TASK')).length, 2, 'each task must have exactly one pending DONE mutation')
})

test('deadline guard: addTask allows exact end and no deadline but rejects a one-minute overrun without writes', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const fixture = await createTaskStoreFixture([])
  await fixture.taskStore.fetchTasks()

  const exact = deadlineTask('dg-exact-create', {
    status: 'TODO', scheduledAt: d('08:00'), dueAt: d('08:30'), durationMinutes: 30,
  })
  await fixture.taskStore.addTask(exact)
  const exactRow = await fixture.repository.read('TASK', exact.id)
  assert.equal(exactRow.value.scheduledAt, d('08:00'), 'an interval ending exactly at dueAt is allowed')
  assert.equal(exactRow.value.dueAt, d('08:30'))

  const noDeadline = deadlineTask('dg-no-deadline-create', {
    status: 'TODO', scheduledAt: d('14:00'), dueAt: undefined, durationMinutes: 90,
  })
  await fixture.taskStore.addTask(noDeadline)
  assert.equal((await fixture.repository.read('TASK', noDeadline.id)).value.scheduledAt, d('14:00'))

  const overrun = deadlineTask('dg-create-overrun', {
    status: 'TODO', scheduledAt: d('12:00'), dueAt: d('12:29'), durationMinutes: 30,
  })
  const beforeRejectedCreate = await taskStoreSnapshot(fixture)
  const createError = await fixture.taskStore.addTask(overrun).then(() => null, (reason) => reason)
  assert.deepEqual(await taskStoreSnapshot(fixture), beforeRejectedCreate, 'a rejected create must not change records, outbox, or projections')
  assert.equal(await fixture.repository.read('TASK', overrun.id), null)
  assert.match(createError?.message ?? '', /任务排期结束时间不能晚于截止期限/)
})

test('deadline guard: scheduling by day skips a blocked slot and rejects when no fitting slot exists', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const occupied = deadlineTask('day-slot-occupied', {
    status: 'TODO', scheduledAt: d('08:00'), dueAt: undefined, durationMinutes: 30,
  })
  const exactFit = deadlineTask('day-slot-exact-fit', {
    status: 'TODO', scheduledAt: undefined, dueAt: d('09:30'), durationMinutes: 60,
  })
  const noFit = deadlineTask('day-slot-no-fit', {
    status: 'TODO', scheduledAt: undefined, dueAt: d('08:15'), durationMinutes: 30,
  })
  const fixture = await createTaskStoreFixture([occupied, exactFit, noFit])
  await fixture.taskStore.fetchTasks()

  await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: exactFit.id, dateKey: '2099-10-06' })
  const exactRow = await fixture.repository.read('TASK', exactFit.id)
  assert.equal(exactRow.value.scheduledAt, d('08:30'), 'the search should skip the occupied 08:00 slot and fit 60 minutes through 09:30')
  assert.equal(Date.parse(exactRow.value.scheduledAt) + 60 * 60_000, Date.parse(exactRow.value.dueAt))

  const beforeRejectedDaySchedule = await taskStoreSnapshot(fixture)
  const noFitError = await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: noFit.id, dateKey: '2099-10-06' }).then(() => null, (reason) => reason)
  assert.deepEqual(await taskStoreSnapshot(fixture), beforeRejectedDaySchedule, 'when no slot fits, the task, outbox, and visible timeline must remain unchanged')
  assert.match(noFitError?.message ?? '', /当天没有符合任务时长和截止期限的可用排期时段/)
})

test('scheduleTaskToDay rejects DONE and CANCELLED tasks without changing persisted or projected state', async (t) => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString()
  const targetDate = '2099-10-07'
  const cases = [
    { name: 'DONE unscheduled', status: 'DONE', scheduledAt: undefined, message: /已完成/ },
    { name: 'DONE scheduled', status: 'DONE', scheduledAt: d('2099-10-06', '10:00'), message: /已完成/ },
    { name: 'CANCELLED unscheduled', status: 'CANCELLED', scheduledAt: undefined, message: /源任务已变化/ },
    { name: 'CANCELLED scheduled', status: 'CANCELLED', scheduledAt: d('2099-10-06', '10:00'), message: /源任务已变化/ },
  ]

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const task = deadlineTask(`day-drop-${scenario.name.replaceAll(' ', '-')}`, {
        status: scenario.status,
        scheduledAt: scenario.scheduledAt,
        dueAt: undefined,
      })
      const fixture = await createTaskStoreFixture([task])
      fixture.taskStore.setSelectedDay('Wed', targetDate)
      await fixture.taskStore.loadLocalTasks()
      const before = await taskStoreSnapshot(fixture)

      const error = await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: task.id, dateKey: targetDate }).then(() => null, (reason) => reason)

      assert.deepEqual(await taskStoreSnapshot(fixture), before,
        `${scenario.name} must preserve row/version, outbox, Store tasks, and timeline projection`)
      assert.match(error?.message ?? '', scenario.message, `${scenario.name} must reject day scheduling`)
    })
  }
})

test('deadline guard: creating a scheduled DONE task still checks its full interval', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const fixture = await createTaskStoreFixture([])
  await fixture.taskStore.fetchTasks()
  const done = deadlineTask('dg-done-create', {
    status: 'DONE', scheduledAt: d('09:00'), dueAt: d('09:29'), durationMinutes: 30,
  })
  const before = await taskStoreSnapshot(fixture)
  const error = await fixture.taskStore.addTask(done).then(() => null, (reason) => reason)
  assert.deepEqual(await taskStoreSnapshot(fixture), before, 'a rejected terminal create must not change records, outbox, or projections')
  assert.equal(await fixture.repository.read('TASK', done.id), null)
  assert.match(error?.message ?? '', /任务排期结束时间不能晚于截止期限/)
})

test('deadline guard: creating a scheduled CANCELLED task still checks its full interval', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const fixture = await createTaskStoreFixture([])
  await fixture.taskStore.fetchTasks()
  const cancelled = deadlineTask('dg-cancelled-create', {
    status: 'CANCELLED', scheduledAt: d('09:00'), dueAt: d('09:29'), durationMinutes: 30,
  })
  const before = await taskStoreSnapshot(fixture)
  const error = await fixture.taskStore.addTask(cancelled).then(() => null, (reason) => reason)
  assert.deepEqual(await taskStoreSnapshot(fixture), before, 'a rejected cancelled create must not change records, outbox, or projections')
  assert.equal(await fixture.repository.read('TASK', cancelled.id), null)
  assert.match(error?.message ?? '', /任务排期结束时间不能晚于截止期限/)
})

test('deadline guard: duration expansion of an active scheduled task rejects without writes', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const active = deadlineTask('dg-update', { status: 'TODO', dueAt: d('10:00'), durationMinutes: 60, scheduledAt: d('09:00') })
  const fixture = await createTaskStoreFixture([active])
  await fixture.taskStore.fetchTasks()
  await assertDeadlineFailurePreservesStore(
    fixture,
    () => fixture.taskStore.updateTaskDetails(active.id, { durationMinutes: 90 }),
    'duration expansion of an active task must be rejected',
  )
})

test('deadline guard: moving an active task deadline before its scheduled end rejects without writes', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const active = deadlineTask('dg-due-edit', { status: 'TODO', dueAt: d('10:00'), durationMinutes: 60, scheduledAt: d('09:00') })
  const fixture = await createTaskStoreFixture([active])
  await fixture.taskStore.fetchTasks()
  await assertDeadlineFailurePreservesStore(
    fixture,
    () => fixture.taskStore.updateTaskDetails(active.id, { dueAt: d('09:59') }),
    'moving the deadline one minute before the scheduled end must be rejected',
  )
})

test('deadline guard: changing the deadline of a DONE scheduled task rejects without writes', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const done = deadlineTask('dg-done', { status: 'DONE', dueAt: d('12:00'), durationMinutes: 60, scheduledAt: d('11:00') })
  const fixture = await createTaskStoreFixture([done])
  await fixture.taskStore.fetchTasks()
  await assertDeadlineFailurePreservesStore(
    fixture,
    () => fixture.taskStore.updateTaskDetails(done.id, { dueAt: d('11:30') }),
    'a terminal task time edit must still obey the deadline',
  )
})

test('deadline guard: cancelled-task re-entry rejects without writes', async () => {
  const scheduledAt = new Date(Math.ceil((Date.now() + 2 * 60 * 60_000) / 60_000) * 60_000).toISOString()
  const dueAt = new Date(Date.parse(scheduledAt) + 30 * 60_000).toISOString()
  const cancelled = deadlineTask('dg-cancelled', { status: 'CANCELLED', dueAt, durationMinutes: 60, scheduledAt })
  const fixture = await createTaskStoreFixture([cancelled])
  await fixture.taskStore.fetchTasks()
  await assertDeadlineFailurePreservesStore(
    fixture,
    () => fixture.taskStore.updateTaskStatus(cancelled.id, 'pending'),
    're-entering the active schedule must recheck the full interval',
  )
})

test('deadline guard: changing the deadline of a CANCELLED scheduled task rejects without writes', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const cancelled = deadlineTask('dg-cancelled-edit', { status: 'CANCELLED', dueAt: d('14:00'), durationMinutes: 60, scheduledAt: d('13:00') })
  const fixture = await createTaskStoreFixture([cancelled])
  await fixture.taskStore.fetchTasks()
  await assertDeadlineFailurePreservesStore(
    fixture,
    () => fixture.taskStore.updateTaskDetails(cancelled.id, { dueAt: d('13:59') }),
    'a cancelled task time edit must still obey the deadline',
  )
})

test('deadline guard: legacy invalid schedules allow non-temporal edits, equivalent instants, and automatic DONE', async () => {
  const now = Date.now()
  const legacyTitle = deadlineTask('dg-legacy-title', {
    status: 'TODO', scheduledAt: '2099-10-06T09:00:00.000Z', dueAt: '2099-10-06T09:15:00.000Z', durationMinutes: 30,
  })
  const legacyOffset = deadlineTask('dg-legacy-offset', {
    status: 'TODO', scheduledAt: '2099-10-06T10:00:00.000Z', dueAt: '2099-10-06T10:15:00.000Z', durationMinutes: 30,
  })
  const legacyNullDuration = deadlineTask('dg-legacy-null-duration', {
    status: 'TODO', scheduledAt: '2099-10-06T11:00:00.000Z', dueAt: '2099-10-06T11:15:00.000Z', durationMinutes: null,
  })
  const previousWeek = new Date(now)
  previousWeek.setDate(previousWeek.getDate() - 7)
  previousWeek.setHours(10, 12, 34, 567)
  const endedSchedule = previousWeek.toISOString()
  const legacyAutoDone = deadlineTask('dg-legacy-auto-done', {
    status: 'TODO',
    scheduledAt: endedSchedule,
    dueAt: new Date(Date.parse(endedSchedule) + 30 * 60_000).toISOString(),
    durationMinutes: 60,
  })
  const fixture = await createTaskStoreFixture([legacyTitle, legacyOffset, legacyNullDuration, legacyAutoDone])
  await fixture.taskStore.loadLocalTasks()

  await fixture.taskStore.updateTaskDetails(legacyTitle.id, { title: 'Renamed legacy task' })
  const renamed = await fixture.repository.read('TASK', legacyTitle.id)
  assert.equal(renamed.value.title, 'Renamed legacy task')
  assert.equal(renamed.value.scheduledAt, legacyTitle.scheduledAt)
  assert.equal(renamed.value.dueAt, legacyTitle.dueAt)

  await fixture.taskStore.updateTaskDetails(legacyOffset.id, { dueAt: '2099-10-06T12:15:00+02:00' })
  const offsetEdited = await fixture.repository.read('TASK', legacyOffset.id)
  assert.equal(Date.parse(offsetEdited.value.dueAt), Date.parse(legacyOffset.dueAt), 'offset-equivalent instants are not a deadline change')
  assert.equal(offsetEdited.value.scheduledAt, legacyOffset.scheduledAt)

  await fixture.taskStore.updateTaskDetails(legacyNullDuration.id, { durationMinutes: 30 })
  const normalizedDuration = await fixture.repository.read('TASK', legacyNullDuration.id)
  assert.equal(normalizedDuration.value.durationMinutes, 30, 'null duration and its effective 30-minute value are equivalent')
  assert.equal(normalizedDuration.value.scheduledAt, legacyNullDuration.scheduledAt)

  await fixture.taskStore.fetchTasks()
  const autoDone = await fixture.repository.read('TASK', legacyAutoDone.id)
  assert.equal(autoDone.value.status, 'DONE', 'automatic completion must preserve legacy tasks with unchanged time fields')
  assert.equal(autoDone.value.scheduledAt, endedSchedule)
  assert.equal(autoDone.value.dueAt, legacyAutoDone.dueAt)
  assert.equal(autoDone.value.durationMinutes, 60)
  const queued = (await fixture.repository.listPending('TASK')).find((mutation) => mutation.resourceId === legacyAutoDone.id)
  assert.equal(queued.payload.scheduledAt, endedSchedule, 'automatic DONE must preserve the historical instant on the wire')
  assert.equal(queued.payload.dueAt, legacyAutoDone.dueAt)
})

test('deadline guard: a valid adjacent swap commits both local candidates in one Sync command', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const t1 = deadlineTask('swap-1', { status: 'TODO', scheduledAt: d('09:00'), durationMinutes: 30, dueAt: d('10:30') })
  const t2 = deadlineTask('swap-2', { status: 'TODO', scheduledAt: d('09:30'), durationMinutes: 60, dueAt: d('10:30') })
  const fixture = await createTaskStoreFixture([t1, t2])
  await fixture.taskStore.fetchTasks()

  await fixture.taskStore.applyTimelineDrop({ type: 'swap', taskId: t1.id, dateKey: '2099-10-06', targetTaskId: t2.id })
  assert.equal((await fixture.repository.read('TASK', t1.id)).value.scheduledAt, d('10:00'))
  assert.equal((await fixture.repository.read('TASK', t2.id)).value.scheduledAt, d('09:00'))
  await fixture.onlineFlush()
  assert.deepEqual(await fixture.repository.listPending('TASK'), [], 'the test Sync server confirms the single swap command')
})

test('deadline guard: source candidate overrun blocks swap with no local writes', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const source = deadlineTask('swap-source-overrun', {
    status: 'TODO', scheduledAt: d('11:00'), durationMinutes: 30, dueAt: d('12:00'),
  })
  const target = deadlineTask('swap-source-target-valid', {
    status: 'TODO', scheduledAt: d('11:30'), durationMinutes: 60, dueAt: d('12:30'),
  })
  const fixture = await createTaskStoreFixture([source, target])
  await fixture.taskStore.fetchTasks()
  const before = await taskStoreSnapshot(fixture)
  const { useTaskApi } = await import('../src/api/useTaskApi.ts')
  const originalSwap = useTaskApi.swapSchedules
  let apiCalled = false
  useTaskApi.swapSchedules = async () => {
    apiCalled = true
    return { source: { ...source, scheduledAt: d('12:00') }, target: { ...target, scheduledAt: d('11:00') } }
  }

  try {
    const error = await fixture.taskStore.applyTimelineDrop({ type: 'swap', taskId: source.id, dateKey: '2099-10-06', targetTaskId: target.id }).then(() => null, (reason) => reason)
    const after = await taskStoreSnapshot(fixture)
    assert.deepEqual(after, before, 'an invalid swap must preserve rows, outbox, and timeline projection')
    assert.equal(apiCalled, false, 'the source candidate must be checked before the API call')
    assert.match(error?.message ?? '', /任务排期结束时间不能晚于截止期限/)
  } finally {
    useTaskApi.swapSchedules = originalSwap
  }
})

test('deadline guard: target candidate overrun blocks swap with no local writes', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const source = deadlineTask('swap-target-source-valid', {
    status: 'TODO', scheduledAt: d('11:30'), durationMinutes: 60, dueAt: d('12:30'),
  })
  const target = deadlineTask('swap-target-overrun', {
    status: 'TODO', scheduledAt: d('11:00'), durationMinutes: 30, dueAt: d('11:45'),
  })
  const fixture = await createTaskStoreFixture([source, target])
  await fixture.taskStore.fetchTasks()
  const before = await taskStoreSnapshot(fixture)
  const { useTaskApi } = await import('../src/api/useTaskApi.ts')
  const originalSwap = useTaskApi.swapSchedules
  let apiCalled = false
  useTaskApi.swapSchedules = async () => {
    apiCalled = true
    return { source: { ...source, scheduledAt: d('11:00') }, target: { ...target, scheduledAt: d('12:00') } }
  }

  try {
    const error = await fixture.taskStore.applyTimelineDrop({ type: 'swap', taskId: source.id, dateKey: '2099-10-06', targetTaskId: target.id }).then(() => null, (reason) => reason)
    const after = await taskStoreSnapshot(fixture)
    assert.deepEqual(after, before, 'an invalid swap must preserve rows, outbox, and timeline projection')
    assert.equal(apiCalled, false, 'the target candidate must be checked before the API call')
    assert.match(error?.message ?? '', /任务排期结束时间不能晚于截止期限/)
  } finally {
    useTaskApi.swapSchedules = originalSwap
  }
})

test('deadline guard: insertTaskAtSlot preflights dragged and shifted tasks before local transaction', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const t1 = deadlineTask('ins-source', { status: 'TODO', scheduledAt: undefined, durationMinutes: 30, dueAt: d('18:00') })
  const t2 = deadlineTask('ins-shifted', { status: 'TODO', scheduledAt: d('15:00'), durationMinutes: 30, dueAt: d('15:45') })
  const t3 = deadlineTask('ins-overlap', { status: 'TODO', scheduledAt: d('14:15'), durationMinutes: 45, dueAt: d('18:00') })

  const fixture = await createTaskStoreFixture([t1, t2, t3])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('2099-10-06')

  const { useTaskApi } = await import('../src/api/useTaskApi.ts')
  const originalInsert = useTaskApi.scheduleInsertions
  let apiCalled = false
  useTaskApi.scheduleInsertions = async () => {
    apiCalled = true
    return { tasks: [] }
  }

  try {
    const before = await taskStoreSnapshot(fixture)
    const insertionError = await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: t1.id, dateKey: '2099-10-06', slotTime: '14:00' }).then(() => null, (reason) => reason)
    assert.deepEqual(await taskStoreSnapshot(fixture), before, 'a rejected cascade must preserve all rows, outbox entries, and timeline tasks')
    assert.equal(apiCalled, false, 'a shifted task that misses its own deadline must be rejected before the API call')
    assert.match(insertionError?.message ?? '', /任务排期结束时间不能晚于截止期限/)

    // A fitting insertion stores the complete changed group in one Sync command.
    const t4 = deadlineTask('ins-valid', { status: 'TODO', scheduledAt: d('16:00'), durationMinutes: 30, dueAt: d('18:00') })
    await fixture.repository.upsert('TASK', t4.id, t4, { version: t4.version, syncStatus: 'synced' })
    await fixture.taskStore.loadLocalTasks()

    await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: t1.id, dateKey: '2099-10-06', slotTime: '15:30' })
    assert.equal(apiCalled, false, 'the Timeline store persists the insertion locally and Sync owns transport')
    await fixture.onlineFlush()
    assert.deepEqual(await fixture.repository.listPending('TASK'), [], 'the test Sync server confirms the command')
    assert.equal((await fixture.repository.read('TASK', t1.id)).value.scheduledAt, d('15:30'))
  } finally {
    useTaskApi.scheduleInsertions = originalInsert
  }
})

test('deadline guard: a body drop checks the dragged source deadline before the insertion API', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const target = deadlineTask('body-target', { status: 'TODO', scheduledAt: d('09:00'), durationMinutes: 60, dueAt: d('10:30') })
  const source = deadlineTask('body-source', { status: 'TODO', scheduledAt: undefined, durationMinutes: 30, dueAt: d('10:29') })
  const fixture = await createTaskStoreFixture([target, source])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('2099-10-06')

  const before = await taskStoreSnapshot(fixture)
  const { useTaskApi } = await import('../src/api/useTaskApi.ts')
  const originalInsert = useTaskApi.scheduleInsertions
  let apiCalled = false
  useTaskApi.scheduleInsertions = async () => {
    apiCalled = true
    return { tasks: [] }
  }

  try {
    const insertionError = await fixture.taskStore.applyTimelineDrop({ type: 'body', taskId: source.id, dateKey: '2099-10-06', targetTaskId: target.id })
      .then(() => null, (reason) => reason)
    assert.deepEqual(await taskStoreSnapshot(fixture), before, 'a rejected body drop must not change the task records, outbox, or timeline')
    assert.equal(apiCalled, false, 'a body drop whose source would end after its deadline must not call the API')
    assert.match(insertionError?.message ?? '', /任务排期结束时间不能晚于截止期限/)
  } finally {
    useTaskApi.scheduleInsertions = originalInsert
  }
})

test('date-fix 1: queued scheduling keeps the date captured before the queue wait', async () => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString()
  const sourceTask = deadlineTask('queued-date-source', {
    status: 'TODO', scheduledAt: undefined, dueAt: d('2099-10-08', '18:00'), durationMinutes: 30,
  })
  const fixture = await createTaskStoreFixture([sourceTask])
  await fixture.taskStore.fetchTasks()

  const originalCommitSchedule = fixture.repository.commitScheduleMutation.bind(fixture.repository)
  const originalCommitMutation = fixture.repository.commitMutation.bind(fixture.repository)
  const commands = []
  fixture.repository.commitScheduleMutation = async (input) => {
    commands.push(input)
    return originalCommitSchedule(input)
  }

  let releaseGate
  let signalGateEntered
  const gate = new Promise((resolve) => { releaseGate = resolve })
  const gateEntered = new Promise((resolve) => { signalGateEntered = resolve })
  fixture.repository.commitMutation = async (input) => {
    if (input.resourceId === 'queue-blocker') {
      signalGateEntered()
      await gate
    }
    return originalCommitMutation(input)
  }

  try {
    fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
    const blocker = fixture.taskStore.addTask({ id: 'queue-blocker', subjectId: 's1', title: 'Queue blocker' })
    await gateEntered

    const queuedSchedule = fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: sourceTask.id, dateKey: '2099-10-06', slotTime: '09:00' })
    fixture.taskStore.setSelectedDay('Wed', '2099-10-07')
    releaseGate()
    await Promise.all([blocker, queuedSchedule])

    assert.equal(commands.length, 1, 'the queued schedule should persist one command')
    assert.equal(localDateKey(new Date(commands[0].mutation.payload.scheduledAt)), '2099-10-06')
    assert.equal(localDateKey(new Date(commands[0].mutation.payload.windowStartAt)), '2099-10-06')
    assert.equal(localDateKey(new Date(commands[0].mutation.payload.windowLastStartAt)), '2099-10-06')

    const row = await fixture.repository.read('TASK', sourceTask.id)
    assert.equal(localDateKey(new Date(row.value.scheduledAt)), '2099-10-06', 'local row must keep the invocation date')
    assert.equal(localDateKey(new Date(fixture.taskStore.allTasks.find((task) => task.id === sourceTask.id).scheduledAt)), '2099-10-06')
    assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '09:00')?.task?.id, undefined,
      'the changed-day projection must not show a task scheduled on the previous date')
    assert.equal((await fixture.repository.listPending('TASK')).some((mutation) => mutation.mutationType.startsWith('SCHEDULE_')), true,
      'the local schedule command remains pending until background sync settles it')
    await fixture.onlineFlush()

    fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
    assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '09:00')?.task?.id, sourceTask.id,
      'the original-day timeline projection must contain the scheduled task')
  } finally {
    releaseGate()
    fixture.repository.commitScheduleMutation = originalCommitSchedule
    fixture.repository.commitMutation = originalCommitMutation
  }
})

test('date-fix 2: an already scheduled task can move to another slot on the same full dateKey', async () => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString()
  const task = deadlineTask('same-date-reschedule', {
    status: 'TODO', scheduledAt: d('2099-10-06', '10:00'), durationMinutes: 30, dueAt: d('2099-10-06', '18:00'),
  })
  const fixture = await createTaskStoreFixture([task])
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
  await fixture.taskStore.loadLocalTasks()

  const originalCommitSchedule = fixture.repository.commitScheduleMutation.bind(fixture.repository)
  const commands = []
  fixture.repository.commitScheduleMutation = async (input) => {
    commands.push(input)
    return originalCommitSchedule(input)
  }

  try {
    await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: task.id, dateKey: '2099-10-06', slotTime: '11:00' })
    assert.equal(commands.length, 1, 'same-date move should persist one schedule command')
    assert.equal(localDateKey(new Date(commands[0].mutation.payload.scheduledAt)), '2099-10-06')
    assert.equal(localDateKey(new Date(commands[0].mutation.payload.windowStartAt)), '2099-10-06')
    const row = await fixture.repository.read('TASK', task.id)
    assert.equal(row.value.scheduledAt, d('2099-10-06', '11:00'))
    assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '11:00')?.task?.id, task.id)
  } finally {
    fixture.repository.commitScheduleMutation = originalCommitSchedule
  }
})

test('date-fix 3: moving an existing scheduled task to a week-view day writes that exact date', async () => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString()
  const task = deadlineTask('week-day-existing-task', {
    status: 'TODO', scheduledAt: d('2099-10-06', '10:00'), dueAt: undefined, durationMinutes: 30,
  })
  const fixture = await createTaskStoreFixture([task])
  await fixture.taskStore.loadLocalTasks()

  await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: task.id, dateKey: '2099-10-07' })

  const row = await fixture.repository.read('TASK', task.id)
  assert.equal(row.value.scheduledAt, d('2099-10-07', '08:00'), 'day-column drop should find the first open slot on its date')
  assert.equal(localDateKey(new Date(fixture.taskStore.allTasks.find((item) => item.id === task.id).scheduledAt)), '2099-10-07')
  const pending = await fixture.repository.listPending('TASK')
  assert.deepEqual(pending.map((mutation) => [mutation.resourceId, mutation.mutationType, mutation.payload.placementMode]),
    [[task.id, 'SCHEDULE_INSERTION', 'STRICT']])

  fixture.taskStore.setSelectedDay('Wed', '2099-10-07')
  assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '08:00')?.task?.id, task.id,
    'the target-day Store projection should contain the moved task')
  assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '10:00')?.task?.id, undefined,
    'the old slot must not retain the moved task')
})

test('week-column drop queues the first free slot after a pending unschedule', async () => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString()
  const task = deadlineTask('cancel-then-week-drop', { scheduledAt: d('2099-10-06', '10:00'), dueAt: undefined, durationMinutes: 30 })
  const occupied = deadlineTask('week-drop-occupied', { scheduledAt: d('2099-10-07', '08:00'), dueAt: undefined, durationMinutes: 30 })
  const fixture = await createTaskStoreFixture([task, occupied])
  await fixture.taskStore.loadLocalTasks()

  await fixture.taskStore.unscheduleTask(task.id)
  await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: task.id, dateKey: '2099-10-07' })

  const pending = await fixture.repository.listUnresolved('TASK')
  assert.deepEqual(pending.map((item) => [item.mutationType, item.resourceId]), [
    ['SCHEDULE_UNSCHEDULE', task.id],
    ['SCHEDULE_INSERTION', task.id],
  ])
  const expected = d('2099-10-07', '08:30')
  assert.equal(pending[1].payload.scheduledAt, expected)
  assert.equal(pending[1].payload.placementMode, 'STRICT')
  assert.equal((await fixture.repository.read('TASK', task.id)).value.scheduledAt, expected)
  assert.equal((await fixture.repository.read('TASK', occupied.id)).value.scheduledAt, occupied.scheduledAt)
})

test('an unacknowledged slot move, week move, and drag back to pending share the schedule queue', async () => {
  const firstDay = '2099-10-06'
  const secondDay = '2099-10-07'
  const firstStart = new Date(firstDay + 'T09:00:00').toISOString()
  const blockerStart = new Date(secondDay + 'T07:45:00').toISOString()
  const source = deadlineTask('consecutive-day-move', { scheduledAt: firstStart, dueAt: undefined, durationMinutes: 30 })
  const blocker = deadlineTask('week-off-grid-blocker', { scheduledAt: blockerStart, dueAt: undefined, durationMinutes: 30 })
  const fixture = await createTaskStoreFixture([source, blocker])
  await fixture.taskStore.loadLocalTasks()

  const slotIntent = { type: 'slot', taskId: source.id, dateKey: firstDay, slotTime: '10:00', sourceScheduledAt: firstStart }
  await fixture.taskStore.applyTimelineDrop(slotIntent)
  const slotStart = (await fixture.repository.read('TASK', source.id)).value.scheduledAt
  const weekIntent = { type: 'week', taskId: source.id, dateKey: secondDay, sourceScheduledAt: slotStart }
  await fixture.taskStore.applyTimelineDrop(weekIntent)
  const weekStart = (await fixture.repository.read('TASK', source.id)).value.scheduledAt
  assert.equal(weekStart, new Date(secondDay + 'T08:30:00').toISOString())
  assert.equal((await fixture.repository.read('TASK', blocker.id)).value.scheduledAt, blockerStart)

  const beforeNoOp = await taskStoreSnapshot(fixture)
  await fixture.taskStore.applyTimelineDrop({ ...weekIntent, sourceScheduledAt: weekStart })
  assert.deepEqual(await taskStoreSnapshot(fixture), beforeNoOp, 'dropping back onto the current day preserves the exact slot')
  await assert.rejects(fixture.taskStore.applyTimelineDrop(weekIntent), /源排期已变化/,
    'a stale drag cannot be applied merely because the card is already on the destination date')

  await fixture.taskStore.applyTimelineDrop({ type: 'unschedule', taskId: source.id, dateKey: secondDay, sourceScheduledAt: weekStart })
  assert.deepEqual((await fixture.repository.listPending('TASK')).map((mutation) => [
    mutation.mutationType, mutation.payload.placementMode, mutation.payload._localAffectedTaskIds,
  ]), [
    ['SCHEDULE_INSERTION', undefined, [source.id]],
    ['SCHEDULE_INSERTION', 'STRICT', [source.id]],
    ['SCHEDULE_UNSCHEDULE', undefined, [source.id]],
  ])
  assert.equal((await fixture.repository.read('TASK', source.id)).value.scheduledAt, undefined)
  assert.ok(fixture.taskStore.pendingTasks.some((task) => task.id === source.id))
})

test('week placement retains an unsent ordinary CREATE while slot placement keeps its first-sync fence', async () => {
  const fixture = await createTaskStoreFixture([])
  const taskId = await fixture.taskStore.addTask({ title: 'Task just created', subjectId: 'subject', durationMinutes: 30 })
  const dateKey = '2099-10-06'
  const [created] = await fixture.repository.listPending('TASK')

  await assert.rejects(fixture.taskStore.applyTimelineDrop({
    type: 'slot', taskId, dateKey, slotTime: '09:00', sourceScheduledAt: null,
  }), /尚未同步/)
  await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId, dateKey, sourceScheduledAt: null })

  const mutations = await fixture.repository.listPending('TASK')
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].mutationType, 'CREATE')
  assert.equal(mutations[0].clientMutationId, created.clientMutationId)
  assert.equal(mutations[0].baseVersion, 0)
  const expected = new Date(dateKey + 'T08:00:00').toISOString()
  assert.equal(mutations[0].payload.scheduledAt, expected)
  assert.equal((await fixture.repository.read('TASK', taskId)).value.scheduledAt, expected)
})

test('week placement cannot fold an offline CREATE into a slot freed by a later schedule command', async () => {
  const sourceDate = '2099-10-06'
  const destinationDate = '2099-10-07'
  const originalStart = new Date(sourceDate + 'T08:00:00').toISOString()
  const existing = deadlineTask('week-move-before-create-placement', {
    scheduledAt: originalStart, dueAt: undefined, durationMinutes: 30,
  })
  const fixture = await createTaskStoreFixture([existing])
  await fixture.taskStore.loadLocalTasks()

  const taskId = await fixture.taskStore.addTask({ title: 'Created offline', subjectId: existing.subjectId, durationMinutes: 30 })
  await fixture.taskStore.applyTimelineDrop({
    type: 'week', taskId: existing.id, dateKey: destinationDate, sourceScheduledAt: originalStart,
  })
  const before = await taskStoreSnapshot(fixture)
  const placement = { type: 'week', taskId, dateKey: sourceDate, sourceScheduledAt: null }
  assert.equal(fixture.taskStore.previewTimelineDrop(placement).scheduledAt, originalStart)
  await assert.rejects(fixture.taskStore.applyTimelineDrop(placement), /同步/)
  assert.deepEqual(await taskStoreSnapshot(fixture), before)

  await fixture.onlineFlush()
  await fixture.taskStore.applyTimelineDrop(placement)
  const [queued] = await fixture.repository.listPending('TASK')
  assert.equal(queued.mutationType, 'CREATE')
  assert.equal(queued.payload.scheduledAt, originalStart)
})

test('body preview and submission use the actual end of an off-grid task', async () => {
  const dateKey = '2099-10-06'
  const at = (time) => new Date(dateKey + 'T' + time + ':00').toISOString()
  const source = deadlineTask('body-preview-source', { dueAt: undefined, durationMinutes: 30 })
  const target = deadlineTask('body-preview-target', { scheduledAt: at('10:15'), dueAt: undefined, durationMinutes: 30 })
  const following = deadlineTask('body-preview-following', { scheduledAt: at('11:30'), dueAt: undefined, durationMinutes: 30 })
  const fixture = await createTaskStoreFixture([source, target, following])
  await fixture.taskStore.loadLocalTasks()
  const intent = { type: 'body', taskId: source.id, dateKey, targetTaskId: target.id, sourceScheduledAt: null }

  assert.deepEqual(fixture.taskStore.previewTimelineDrop(intent), { scheduledAt: at('11:00') })
  assert.deepEqual(await fixture.repository.listPending('TASK'), [], 'preview never commits')
  await fixture.taskStore.applyTimelineDrop(intent)

  const [mutation] = await fixture.repository.listPending('TASK')
  assert.equal(mutation.payload.scheduledAt, at('11:00'))
  assert.equal(mutation.payload.targetTaskId, target.id)
  assert.deepEqual(mutation.payload._localAffectedTaskIds, [source.id])
  assert.equal((await fixture.repository.read('TASK', following.id)).value.scheduledAt, following.scheduledAt)
})

test('slot insertion ignores empty intervals and unrelated late starts but still checks conflicts with fixed late intervals', async (t) => {
  const dateKey = '2099-10-06'
  const at = (time) => new Date(dateKey + 'T' + time + ':00').toISOString()
  const late = deadlineTask('late-fixed', { scheduledAt: at('22:45'), dueAt: undefined, durationMinutes: 15 })
  const occupied = deadlineTask('occupied-positive', { scheduledAt: at('09:00'), dueAt: undefined, durationMinutes: 60 })
  const zero = deadlineTask('zero-interval', { scheduledAt: at('08:15'), dueAt: undefined, durationMinutes: 0 })
  const source = deadlineTask('interval-source', { dueAt: undefined, durationMinutes: 30 })

  await t.test('an early slot leaves off-grid late and zero-duration rows untouched', async () => {
    const fixture = await createTaskStoreFixture([late, zero, source])
    await fixture.taskStore.loadLocalTasks()
    await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: source.id, dateKey, slotTime: '08:00' })
    const [mutation] = await fixture.repository.listPending('TASK')
    assert.deepEqual(mutation.payload._localAffectedTaskIds, [source.id])
    assert.equal((await fixture.repository.read('TASK', zero.id)).value.scheduledAt, zero.scheduledAt)
    assert.equal((await fixture.repository.read('TASK', late.id)).value.scheduledAt, late.scheduledAt)
  })
  await t.test('an overlapping late slot is rejected atomically', async () => {
    const fixture = await createTaskStoreFixture([late, source])
    await fixture.taskStore.loadLocalTasks()
    const before = await taskStoreSnapshot(fixture)
    await assert.rejects(fixture.taskStore.applyTimelineDrop({
      type: 'slot', taskId: source.id, dateKey, slotTime: '22:30',
    }), /目标时段与其他任务冲突/)
    assert.deepEqual(await taskStoreSnapshot(fixture), before)
  })
  await t.test('a zero-duration source does not push an occupied interval', async () => {
    const fixture = await createTaskStoreFixture([occupied, zero])
    await fixture.taskStore.loadLocalTasks()
    await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: zero.id, dateKey, slotTime: '09:30' })
    const [mutation] = await fixture.repository.listPending('TASK')
    assert.deepEqual(mutation.payload._localAffectedTaskIds, [zero.id])
    assert.equal((await fixture.repository.read('TASK', occupied.id)).value.scheduledAt, occupied.scheduledAt)
  })
})

test('swap rejects overlapping proposed members before any local write', async () => {
  const dateKey = '2099-10-06'
  const at = (time) => new Date(dateKey + 'T' + time + ':00').toISOString()
  const source = deadlineTask('swap-overlap-source', { scheduledAt: at('09:00'), dueAt: undefined, durationMinutes: 30 })
  const target = deadlineTask('swap-overlap-target', { scheduledAt: at('10:00'), dueAt: undefined, durationMinutes: 180 })
  const fixture = await createTaskStoreFixture([source, target])
  await fixture.taskStore.loadLocalTasks()
  const before = await taskStoreSnapshot(fixture)

  await assert.rejects(fixture.taskStore.applyTimelineDrop({
    type: 'swap', taskId: source.id, dateKey, targetTaskId: target.id,
  }), /目标时段与其他任务冲突/)
  assert.deepEqual(await taskStoreSnapshot(fixture), before)
})

test('Store projects the exact date of a selected future week', async () => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString()
  const targetDate = '2026-10-14'
  const task = deadlineTask('remount-date-task', {
    status: 'TODO', scheduledAt: d(targetDate, '09:00'), durationMinutes: 30, dueAt: d(targetDate, '18:00'),
  })
  const fixture = await createTaskStoreFixture([task])
  fixture.taskStore.currentNow = new Date('2026-10-07T12:00:00')
  fixture.taskStore.setSelectedDay('Wed', targetDate)
  await fixture.taskStore.loadLocalTasks()

  const projectedSlot = fixture.taskStore.timeSlots.find((slot) => slot.time === '09:00')
  assert.equal(projectedSlot?.task?.id, task.id, 'Store slots must project the selected next-week task')
  assert.equal(localDateKey(new Date(projectedSlot.task.scheduledAt)), targetDate)

})

async function runPulledTaskChanges(fixture, changes, expectedCursor) {
  const { runSyncCycle } = await import('../src/services/syncCycle.ts')
  await fixture.repository.saveCursor('cursor-before-schedule-response')
  const result = await runSyncCycle({
    repository: fixture.repository,
    serverDeviceId: 'schedule-race-device',
    api: {
      async pushChanges() { return { results: [], serverCursor: 'cursor-before-schedule-response' } },
      async pullChanges(input) {
        assert.equal(input.cursor, 'cursor-before-schedule-response')
        return { changes, nextCursor: expectedCursor, hasMore: false, resetRequired: false }
      },
      async getSnapshot() { assert.fail('an existing cursor must use incremental read') },
    },
  })
  assert.equal(result.cursor, expectedCursor)
  assert.equal((await fixture.repository.getSyncState()).cursor, expectedCursor)
}

function deferredApiResponse() {
  let resolveResponse
  let enterApi
  const response = new Promise((resolve) => { resolveResponse = resolve })
  const entered = new Promise((resolve) => { enterApi = resolve })
  return {
    entered,
    resolve: resolveResponse,
    waitForResponse: async () => { enterApi(); return response },
  }
}

test('schedule insertion persists one mutation and the full optimistic cascade before remote sync', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const sourceTask = deadlineTask('offline-insert-source', {
    status: 'TODO', scheduledAt: undefined, dueAt: d('20:00'), durationMinutes: 60, version: 2,
  })
  const shiftedTask = deadlineTask('offline-insert-shifted', {
    status: 'TODO', scheduledAt: d('10:30'), dueAt: d('20:00'), durationMinutes: 30, version: 4,
  })
  const fixture = await createTaskStoreFixture([sourceTask, shiftedTask])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
  fixture.syncStore.flushNow = async () => { throw new TypeError('Failed to fetch') }

  const result = await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: sourceTask.id, dateKey: '2099-10-06', slotTime: '10:00' })
  const pending = await fixture.repository.listPending('TASK')
  assert.equal(result, isOnline() ? 'saved' : 'queued')
  assert.equal(pending.length, 1)
  assert.equal(pending[0].mutationType, 'SCHEDULE_INSERTION')
  assert.deepEqual(pending[0].payload._localAffectedTaskIds.sort(), [sourceTask.id, shiftedTask.id].sort())
  assert.equal((await fixture.repository.read('TASK', sourceTask.id)).value.scheduledAt, d('10:00'))
  assert.equal((await fixture.repository.read('TASK', shiftedTask.id)).value.scheduledAt, d('11:00'))
  assert.equal((await fixture.repository.read('TASK', sourceTask.id)).syncStatus, 'pending')
  assert.equal((await fixture.repository.read('TASK', shiftedTask.id)).syncStatus, 'pending')
})

test('schedule swap persists one command and reuses its id when connection returns', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const sourceTask = deadlineTask('offline-swap-source', {
    status: 'TODO', scheduledAt: d('09:00'), dueAt: d('20:00'), durationMinutes: 30, version: 2,
  })
  const targetTask = deadlineTask('offline-swap-target', {
    status: 'TODO', scheduledAt: d('10:00'), dueAt: d('20:00'), durationMinutes: 30, version: 4,
  })
  const fixture = await createTaskStoreFixture([sourceTask, targetTask])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
  fixture.syncStore.flushNow = async () => { throw new TypeError('Network unavailable') }

  assert.equal(await fixture.taskStore.applyTimelineDrop({ type: 'swap', taskId: sourceTask.id, dateKey: '2099-10-06', targetTaskId: targetTask.id }), isOnline() ? 'saved' : 'queued')
  const [mutation] = await fixture.repository.listPending('TASK')
  assert.equal(mutation.mutationType, 'SCHEDULE_SWAP')
  assert.deepEqual(mutation.payload._localAffectedTaskIds.sort(), [sourceTask.id, targetTask.id].sort())
  assert.equal((await fixture.repository.read('TASK', sourceTask.id)).value.scheduledAt, d('10:00'))
  assert.equal((await fixture.repository.read('TASK', targetTask.id)).value.scheduledAt, d('09:00'))

  const resolvedIds = []
  const originalResolve = fixture.repository.resolveScheduleMutation.bind(fixture.repository)
  fixture.repository.resolveScheduleMutation = async (input) => {
    resolvedIds.push(input.clientMutationId)
    return originalResolve(input)
  }
  fixture.syncStore.flushNow = fixture.onlineFlush
  await fixture.syncStore.flushNow()
  assert.deepEqual(resolvedIds, [mutation.clientMutationId])
  assert.deepEqual(await fixture.repository.listUnresolved('TASK'), [])
})

test('schedule operation does not wait for non-transport sync failures', async () => {
  const task = deadlineTask('offline-nontransport', {
    status: 'TODO', scheduledAt: undefined, dueAt: '2099-10-06T20:00:00.000Z', durationMinutes: 30, version: 5,
  })
  const fixture = await createTaskStoreFixture([task])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
  let flushCalled = false
  fixture.syncStore.flushNow = async () => {
    flushCalled = true
    const error = new Error('server rejected the request')
    error.status = 422
    throw error
  }

  assert.equal(await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: task.id, dateKey: '2099-10-06', slotTime: '10:00' }), isOnline() ? 'saved' : 'queued')
  assert.equal(flushCalled, false, 'a server response must not hold the local scheduling operation')
  assert.equal((await fixture.repository.listPending('TASK')).filter((mutation) => mutation.mutationType === 'SCHEDULE_INSERTION').length, 1)
})

test('pending offline schedule projection survives a pull until the command resolves', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const task = deadlineTask('offline-pull-fence', { status: 'TODO', scheduledAt: undefined, dueAt: d('20:00'), durationMinutes: 30, version: 8 })
  const fixture = await createTaskStoreFixture([task])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
  fixture.syncStore.flushNow = async () => { throw new TypeError('Network unavailable') }

  assert.equal(await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: task.id, dateKey: '2099-10-06', slotTime: '10:00' }), isOnline() ? 'saved' : 'queued')
  const optimistic = await fixture.repository.read('TASK', task.id)
  const [mutation] = await fixture.repository.listPending('TASK')
  await fixture.repository.saveCursor('cursor-before-offline-pull')
  const { runSyncCycle } = await import('../src/services/syncCycle.ts')
  await runSyncCycle({
    repository: fixture.repository,
    serverDeviceId: 'offline-pull-device',
    api: {
      async pushChanges() { return { results: [{ clientMutationId: mutation.clientMutationId, decision: 'PROCESSING' }], serverCursor: null } },
      async pullChanges() {
        return { changes: [{ cursor: 'remote-old-schedule', resourceType: 'TASK', resourceId: task.id, mutationType: 'UPDATE', version: 9,
          deletedAt: null, payload: { ...task, scheduledAt: d('11:00'), version: 9 }, createdAt: null }],
          nextCursor: 'remote-old-schedule', hasMore: false, resetRequired: false }
      },
      async getSnapshot() { assert.fail('the persisted cursor is current') },
    },
  })

  const afterPull = await fixture.repository.read('TASK', task.id)
  assert.equal(afterPull.value.scheduledAt, optimistic.value.scheduledAt)
  assert.equal(afterPull.syncStatus, 'pending')
  assert.equal((await fixture.repository.listUnresolved('TASK')).length, 1)
})
test('scheduleTaskToDay scans 22:30 and preserves state when that candidate conflicts or misses its deadline', async (t) => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const makeFixture = async ({ block22, dueAt }) => {
    const fixture = await createTaskStoreFixture([])
    fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
    for (let minutes = 8 * 60; minutes <= (block22 ? 21 * 60 + 30 : 22 * 60); minutes += 30) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      const task = deadlineTask(`last-slot-filler-${block22 ? 'blocked' : 'free'}-${minutes}`, {
        status: 'TODO', scheduledAt: d(time), durationMinutes: 30, dueAt: undefined,
      })
      await fixture.repository.upsert('TASK', task.id, { ...task, version: 1 }, { version: 1, syncStatus: 'synced' })
    }
    if (block22) {
      const blocker = deadlineTask('last-slot-overlap-blocker', {
        status: 'TODO', scheduledAt: d('22:00'), durationMinutes: 60, dueAt: undefined,
      })
      await fixture.repository.upsert('TASK', blocker.id, { ...blocker, version: 1 }, { version: 1, syncStatus: 'synced' })
    }
    const newTask = deadlineTask(`last-slot-candidate-${block22 ? 'blocked' : dueAt ? 'deadline' : 'free'}`, {
      status: 'TODO', scheduledAt: undefined, durationMinutes: 30, dueAt,
    })
    await fixture.repository.upsert('TASK', newTask.id, { ...newTask, version: 1 }, { version: 1, syncStatus: 'synced' })
    await fixture.taskStore.loadLocalTasks()
    return { fixture, newTask }
  }

  await t.test('22:30 is accepted when it is the sole free slot and the end equals dueAt', async () => {
    const { fixture, newTask } = await makeFixture({ block22: false, dueAt: d('23:00') })
    await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: newTask.id, dateKey: '2099-10-06' })
    const row = await fixture.repository.read('TASK', newTask.id)
    assert.equal(row.value.scheduledAt, d('22:30'))
    assert.equal(row.version, 1)
    assert.equal((await fixture.repository.listPending('TASK')).filter((mutation) => mutation.resourceId === newTask.id).length, 1)
    assert.equal(fixture.taskStore.allTasks.find((task) => task.id === newTask.id)?.scheduledAt, d('22:30'))
    assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '22:30')?.task?.id, newTask.id)
  })

  await t.test('22:30 candidate that ends one minute after dueAt is rejected without writes', async () => {
    const { fixture, newTask } = await makeFixture({ block22: false, dueAt: d('22:59') })
    const before = await taskStoreSnapshot(fixture)
    const error = await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: newTask.id, dateKey: '2099-10-06' }).then(() => null, (reason) => reason)
    assert.match(error?.message ?? '', /当天没有符合任务时长和截止期限的可用排期时段/)
    assert.deepEqual(await taskStoreSnapshot(fixture), before)
  })

  await t.test('occupied 22:00–23:00 interval conflicts with a 22:30 start and is rejected without writes', async () => {
    const { fixture, newTask } = await makeFixture({ block22: true, dueAt: undefined })
    const before = await taskStoreSnapshot(fixture)
    const error = await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: newTask.id, dateKey: '2099-10-06' }).then(() => null, (reason) => reason)
    assert.match(error?.message ?? '', /当天没有符合任务时长和截止期限的可用排期时段/)
    assert.deepEqual(await taskStoreSnapshot(fixture), before)
  })
})

test('swap rejects compacted starts outside the visible window in either direction and preserves the local batch', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const { useTaskApi } = await import('../src/api/useTaskApi.ts')
  const originalSwap = useTaskApi.swapSchedules
  let apiCalls = 0
  let apiResponse
  useTaskApi.swapSchedules = async () => { apiCalls += 1; return apiResponse }

  const assertRejected = async (sourceAt, sourceDuration, targetAt, targetDuration, suffix) => {
    const sourceTask = deadlineTask(`swap-window-source-${suffix}`, { status: 'TODO', scheduledAt: d(sourceAt), durationMinutes: sourceDuration, dueAt: undefined })
    const targetTask = deadlineTask(`swap-window-target-${suffix}`, { status: 'TODO', scheduledAt: d(targetAt), durationMinutes: targetDuration, dueAt: undefined })
    apiResponse = { source: { ...sourceTask, version: 8 }, target: { ...targetTask, version: 8 } }
    apiCalls = 0
    const fixture = await createTaskStoreFixture([sourceTask, targetTask])
    await fixture.taskStore.fetchTasks()
    fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
    const before = await taskStoreSnapshot(fixture)
    const error = await fixture.taskStore.applyTimelineDrop({ type: 'swap', taskId: sourceTask.id, dateKey: '2099-10-06', targetTaskId: targetTask.id }).then(() => null, (reason) => reason)
    assert.match(error?.message ?? '', /超出排期窗口/)
    assert.equal(apiCalls, 0, 'a rejected compact must stop before the swap API call')
    assert.deepEqual(await taskStoreSnapshot(fixture), before, 'rejected compact must preserve both rows, outbox, and projection')
  }

  try {
    await assertRejected('21:30', 30, '22:00', 90, 'forward')
    await assertRejected('22:00', 90, '21:30', 30, 'reverse')
    await assertRejected('22:45', 15, '22:00', 30, 'quarter-hour')
    await assertRejected('08:00', 30, '08:30', 2250, 'overnight-compact')
  } finally {
    useTaskApi.swapSchedules = originalSwap
  }
})

test('swap accepts a non-adjacent pair at the inclusive 22:30 boundary when its interval ends later', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const sourceTask = deadlineTask('swap-visible-source', { status: 'TODO', scheduledAt: d('20:00'), durationMinutes: 30, dueAt: undefined })
  const targetTask = deadlineTask('swap-visible-target', { status: 'TODO', scheduledAt: d('22:30'), durationMinutes: 30, dueAt: undefined })
  const fixture = await createTaskStoreFixture([sourceTask, targetTask])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')

  await fixture.taskStore.applyTimelineDrop({ type: 'swap', taskId: sourceTask.id, dateKey: '2099-10-06', targetTaskId: targetTask.id })
  assert.equal((await fixture.repository.read('TASK', sourceTask.id)).value.scheduledAt, d('22:30'))
  assert.equal((await fixture.repository.read('TASK', targetTask.id)).value.scheduledAt, d('20:00'))
  assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '22:30')?.task?.id, sourceTask.id)
  assert.equal(fixture.taskStore.timeSlots.find((slot) => slot.time === '20:00')?.task?.id, targetTask.id)
})

test('a swap cannot target a stale card on the same weekday in another week', async () => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString()
  const sourceTask = deadlineTask('swap-cross-week-source', {
    status: 'TODO', scheduledAt: d('2099-10-06', '10:00'), durationMinutes: 30, dueAt: undefined,
  })
  const targetTask = deadlineTask('swap-cross-week-target', {
    status: 'TODO', scheduledAt: d('2099-10-13', '11:00'), durationMinutes: 30, dueAt: undefined,
  })
  const fixture = await createTaskStoreFixture([sourceTask, targetTask])
  await fixture.taskStore.fetchTasks()

  const before = await taskStoreSnapshot(fixture)
  await assert.rejects(fixture.taskStore.applyTimelineDrop({
    type: 'swap', taskId: sourceTask.id, dateKey: '2099-10-06', targetTaskId: targetTask.id,
  }), /只能交换同一天/)
  assert.deepEqual(await taskStoreSnapshot(fixture), before)
})

test('a failed local schedule transaction leaves the Task projection unchanged', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString()
  const task = deadlineTask('schedule-local-write-failure', { status: 'TODO', scheduledAt: undefined, dueAt: d('20:00'), durationMinutes: 30, version: 8 })
  const fixture = await createTaskStoreFixture([task])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
  const before = await taskStoreSnapshot(fixture)
  fixture.repository.commitScheduleMutation = async () => { throw new Error('injected local transaction failure') }

  const error = await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: task.id, dateKey: '2099-10-06', slotTime: '10:00' }).then(() => null, (reason) => reason)

  assert.equal(error?.message, 'injected local transaction failure')
  assert.deepEqual(await taskStoreSnapshot(fixture), before)
})
test('deadline guard: a stored date-only deadline is rejected without schedule writes', async () => {
  const fixture = await createTaskStoreFixture([])
  await fixture.taskStore.fetchTasks()
  fixture.taskStore.setSelectedDay('2099-10-06')

  // Existing persisted values must not get the user-input date-to-end-of-day conversion.
  const sameDayTask = deadlineTask('same-day-task-1', {
    status: 'TODO',
    scheduledAt: undefined,
    durationMinutes: 30,
    dueAt: '2099-10-06',
  })
  await fixture.repository.upsert('TASK', sameDayTask.id, sameDayTask, { version: sameDayTask.version, syncStatus: 'synced' })
  await fixture.taskStore.loadLocalTasks()

  const { useTaskApi } = await import('../src/api/useTaskApi.ts')
  const originalInsert = useTaskApi.scheduleInsertions
  let apiCalledWith = null
  useTaskApi.scheduleInsertions = async (params) => {
    apiCalledWith = params
    return { tasks: [{ ...sameDayTask, scheduledAt: params.scheduledAt, version: 8 }] }
  }

  try {
    await assertDeadlineFailurePreservesStore(
      fixture,
      () => fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: sameDayTask.id, dateKey: '2099-10-06', slotTime: '14:00' }),
      'a stored date-only deadline must not be expanded to local end of day',
    )
    assert.equal(apiCalledWith, null, 'invalid stored deadlines must be rejected before the insertion API')

    const task2 = deadlineTask('same-day-task-2', {
      status: 'TODO',
      scheduledAt: undefined,
      durationMinutes: 30,
      dueAt: '2099-10-06',
    })
    await fixture.repository.upsert('TASK', task2.id, task2, { version: task2.version, syncStatus: 'synced' })
    await fixture.taskStore.loadLocalTasks()

    const before = await taskStoreSnapshot(fixture)
    const error = await fixture.taskStore.applyTimelineDrop({ type: 'week', taskId: task2.id, dateKey: '2099-10-06' }).then(() => null, (reason) => reason)
    assert.match(error?.message ?? '', /截止期限/)
    assert.deepEqual(await taskStoreSnapshot(fixture), before, 'day placement must preserve records, outbox, and projections')

    await fixture.taskStore.updateTaskDetails(sameDayTask.id, {
      title: 'Edited without changing the injected deadline',
      dueAt: sameDayTask.dueAt,
    })
    const unchangedLegacyDeadline = await fixture.repository.read('TASK', sameDayTask.id)
    assert.equal(unchangedLegacyDeadline?.value.dueAt, '2099-10-06', 'non-deadline edits must preserve the original stored value')
  } finally {
    useTaskApi.scheduleInsertions = originalInsert
  }
})

test('date-only task deadlines become local end of day in Repository records and outbox payloads', async () => {
  const fixture = await createTaskStoreFixture([])
  await fixture.taskStore.fetchTasks()
  const dateOnly = '2099-10-06'
  const expectedLocalEnd = new Date(2099, 9, 6, 23, 59, 59, 999).toISOString()

  const createdId = await fixture.taskStore.addTask({
    subjectId: 'deadline-subject',
    title: 'Created with a date-only deadline',
    dueAt: dateOnly,
    durationMinutes: 30,
  })
  const created = await fixture.repository.read('TASK', createdId)
  assert.equal(created?.value.dueAt, expectedLocalEnd)
  const createMutation = (await fixture.repository.listPending('TASK')).find((item) => item.resourceId === createdId)
  assert.equal(createMutation?.payload.dueAt, expectedLocalEnd)

  await fixture.taskStore.updateTaskDetails(createdId, { title: 'Edited without changing the deadline' })
  const unchangedEdit = await fixture.repository.read('TASK', createdId)
  assert.equal(unchangedEdit?.value.dueAt, expectedLocalEnd)

  await fixture.taskStore.updateTaskDetails(createdId, { dueAt: dateOnly })
  const edited = await fixture.repository.read('TASK', createdId)
  assert.equal(edited?.value.dueAt, expectedLocalEnd)
  const editMutation = (await fixture.repository.listPending('TASK')).find((item) => item.resourceId === createdId)
  assert.equal(editMutation?.payload.dueAt, expectedLocalEnd)

  const explicitOffset = '2099-10-06T23:59:59.999-05:00'
  const explicitId = await fixture.taskStore.addTask({
    subjectId: 'deadline-subject',
    title: 'Created with an explicit instant',
    dueAt: explicitOffset,
    durationMinutes: 30,
  })
  const explicit = await fixture.repository.read('TASK', explicitId)
  assert.equal(explicit?.value.dueAt, new Date(explicitOffset).toISOString())
})

test('Store rejects exact timestamp-midnight deadlines before API calls or local writes', async () => {
  const { useTaskApi } = await import('../src/api/useTaskApi.ts')
  const originalInsert = useTaskApi.scheduleInsertions
  let apiCalls = 0
  let activeRepository
  useTaskApi.scheduleInsertions = async (params) => {
    apiCalls += 1
    const stored = await activeRepository.read('TASK', params.taskId)
    const endAt = Date.parse(params.scheduledAt) + stored.value.durationMinutes * 60_000
    if (endAt > Date.parse(stored.value.dueAt)) throw new Error('任务排期结束时间不能晚于截止期限')
    return { tasks: [] }
  }

  try {
    for (const dueAt of ['2099-10-06T00:00:00.000Z', '2099-10-06T00:00:00+08:00']) {
      const id = `exact-midnight-${dueAt.endsWith('Z') ? 'utc' : 'offset'}`
      const fixture = await createTaskStoreFixture([deadlineTask(id, { dueAt, durationMinutes: 30 })])
      activeRepository = fixture.repository
      await fixture.taskStore.fetchTasks()
      fixture.taskStore.setSelectedDay('2099-10-06')

      await assertDeadlineFailurePreservesStore(
        fixture,
        () => fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: id, dateKey: '2099-10-06', slotTime: '09:00' }),
        `${dueAt} must be compared as its stored instant`,
      )
    }
    assert.equal(apiCalls, 0, 'an interval after explicit midnight must not reach schedule-insertions')
  } finally {
    useTaskApi.scheduleInsertions = originalInsert
  }
})



test('consecutive Timeline moves commit locally while the first push remains deferred', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString();
  const a = deadlineTask('continuous-a', { scheduledAt: d('09:00'), dueAt: d('20:00'), durationMinutes: 30, version: 2 });
  const b = deadlineTask('continuous-b', { scheduledAt: d('12:00'), dueAt: d('20:00'), durationMinutes: 30, version: 4 });
  const fixture = await createTaskStoreFixture([a, b]);
  await fixture.taskStore.fetchTasks();
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06');
  await fixture.repository.saveCursor('continuous-before');
  await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: a.id, dateKey: '2099-10-06', slotTime: '10:00' });
  let releasePush;
  let notifyPushing;
  const pushing = new Promise((resolve) => { notifyPushing = resolve; });
  const pushGate = new Promise((resolve) => { releasePush = resolve; });
  const versions = new Map([[a.id, 2], [b.id, 4]]);
  const sent = [];
  const { runSyncCycle } = await import('../src/services/syncCycle.ts');
  const api = {
    async pushChanges({ mutations }) {
      sent.push(mutations);
      if (sent.length === 1) { notifyPushing(); await pushGate; }
      return { results: mutations.map((mutation) => ({
        clientMutationId: mutation.clientMutationId, decision: 'APPLIED', resourceType: 'TASK',
        resourceId: mutation.resourceId, mutationType: mutation.mutationType,
        current: mutation.payload._localExpectedTasks.map(({ id, value }) => {
          const version = versions.get(id) + 1;
          versions.set(id, version);
          return { ...value, version,
            scheduledAt: value.scheduledAt.replace('.000Z', 'Z'), dueAt: value.dueAt.replace('.000Z', 'Z') };
        }),
      })) };
    },
    async pullChanges() { return { changes: [], nextCursor: 'continuous-before', hasMore: false, resetRequired: false }; },
    async getSnapshot() { assert.fail('equivalent Instant formatting does not invalidate queued moves'); },
  };
  const firstCycle = runSyncCycle({ repository: fixture.repository, api, serverDeviceId: 'continuous-device' });
  await pushing;
  await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: a.id, dateKey: '2099-10-06', slotTime: '11:00' });
  await fixture.taskStore.applyTimelineDrop({ type: 'swap', taskId: a.id, dateKey: '2099-10-06', targetTaskId: b.id });
  assert.equal((await fixture.repository.listUnresolved('TASK')).length, 3);
  assert.equal((await fixture.repository.read('TASK', a.id)).value.scheduledAt, d('12:00'));
  assert.equal((await fixture.repository.read('TASK', b.id)).value.scheduledAt, d('11:00'));
  releasePush();
  await firstCycle;
  assert.equal((await fixture.repository.read('TASK', a.id)).value.scheduledAt, d('12:00'), 'first receipt preserves the latest local position');
  await runSyncCycle({ repository: fixture.repository, api, serverDeviceId: 'continuous-device' });
  await runSyncCycle({ repository: fixture.repository, api, serverDeviceId: 'continuous-device' });
  assert.equal(sent.length, 3);
  assert.equal(sent[1][0].baseVersion, 3);
  assert.equal(sent[2][0].baseVersion, 4);
  assert.equal(sent[2][0].payload.targetBaseVersion, 4);
  assert.deepEqual(await fixture.repository.listUnresolved('TASK'), []);
});


test('one real sync-store flush drains saved schedule intentions and stops on PROCESSING', async () => {
  const { useSyncApi } = await import('../src/api/useSyncApi.ts');
  const originalPush = useSyncApi.pushChanges;
  const originalPull = useSyncApi.pullChanges;
  const originalSnapshot = useSyncApi.getSnapshot;
  try {
    for (const processing of [false, true]) {
      const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString();
      const task = deadlineTask(`drain-${processing}`, { scheduledAt: d('09:00'), dueAt: d('20:00'), durationMinutes: 30, version: 2 });
      const fixture = await createTaskStoreFixture([task]);
      useAuthStore().sessionId = `drain-session-${processing}`;
      await fixture.taskStore.fetchTasks();
      fixture.taskStore.setSelectedDay('Tue', '2099-10-06');
      await fixture.repository.saveCursor('drain-cursor');
      for (const time of ['10:00', '11:00', '12:00']) await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: task.id, dateKey: '2099-10-06', slotTime: time });
      let pushes = 0;
      useSyncApi.pushChanges = async ({ mutations }) => {
        pushes += 1;
        assert.equal(mutations.length, 1);
        const mutation = mutations[0];
        if (processing) return { results: [{ clientMutationId: mutation.clientMutationId, decision: 'PROCESSING' }] };
        return { results: [{ clientMutationId: mutation.clientMutationId, decision: 'APPLIED',
          resourceType: 'TASK', resourceId: mutation.resourceId, mutationType: mutation.mutationType,
          current: mutation.payload._localExpectedTasks.map(({ value }) => ({ ...value, version: mutation.baseVersion + 1 })),
        }] };
      };
      useSyncApi.pullChanges = async () => ({ changes: [], nextCursor: 'drain-cursor', hasMore: false, resetRequired: false });
      useSyncApi.getSnapshot = async () => assert.fail('draining the same device schedule does not require a snapshot');
      await fixture.realFlushNow();
      assert.equal(pushes, processing ? 1 : 3);
      assert.equal((await fixture.repository.listUnresolved('TASK')).length, processing ? 3 : 0);
      assert.equal((await fixture.repository.read('TASK', task.id)).value.scheduledAt, d('12:00'));
      useAuthStore().sessionId = null;
    }
  } finally {
    useSyncApi.pushChanges = originalPush;
    useSyncApi.pullChanges = originalPull;
    useSyncApi.getSnapshot = originalSnapshot;
  }
});


test('a stale Timeline Store reloads another window optimistic schedule instead of committing overlapping same-version tasks', async () => {
  const d = (time) => new Date(`2099-10-06T${time}:00`).toISOString();
  const a = deadlineTask('window-a', { scheduledAt: d('09:00'), dueAt: d('20:00'), durationMinutes: 30, version: 2 });
  const b = deadlineTask('window-b', { scheduledAt: d('10:00'), dueAt: d('20:00'), durationMinutes: 30, version: 4 });
  const fixture = await createTaskStoreFixture([a, b]);
  await fixture.taskStore.fetchTasks();
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06');
  await fixture.repository.commitScheduleMutation({
    items: [{ resourceType: 'TASK', resourceId: a.id, value: { ...a, scheduledAt: d('11:00') },
      version: 2, expectedLocalVersion: 2, deletedAt: null }],
    mutation: { clientMutationId: 'another-window', resourceType: 'TASK', resourceId: a.id, mutationType: 'SCHEDULE_INSERTION', baseVersion: 2,
      payload: { taskId: a.id, baseVersion: 2, _localAffectedTaskIds: [a.id] } },
  });
  await assert.rejects(fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: b.id, dateKey: '2099-10-06', slotTime: '11:00' }), /排期已在其他窗口更新/);
  assert.equal(fixture.taskStore.allTasks.find((task) => task.id === a.id).scheduledAt, d('11:00'));
  assert.equal(fixture.taskStore.allTasks.find((task) => task.id === b.id).scheduledAt, d('10:00'));
  assert.equal((await fixture.repository.listUnresolved('TASK')).length, 1);
});


test('an unrelated cancelled task on another day permits initial scheduling and consecutive local moves', async () => {
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString();
  const moving = deadlineTask('cancelled-baseline-moving', {
    scheduledAt: undefined, dueAt: d('2099-10-06', '20:00'), durationMinutes: 30, version: 2,
  });
  const cancelled = deadlineTask('cancelled-baseline-other-day', {
    status: 'CANCELLED', scheduledAt: d('2099-10-07', '10:00'),
    dueAt: d('2099-10-07', '20:00'), durationMinutes: null, version: 4,
  });
  const fixture = await createTaskStoreFixture([moving, cancelled]);
  await fixture.taskStore.fetchTasks();
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06');
  assert.equal(fixture.taskStore.allTasks.find((task) => task.id === cancelled.id).status, 'cancelled');
  const cancelledBefore = await fixture.repository.read('TASK', cancelled.id);
  await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: moving.id, dateKey: '2099-10-06', slotTime: '10:00' });
  await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: moving.id, dateKey: '2099-10-06', slotTime: '11:00' });
  await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: moving.id, dateKey: '2099-10-06', slotTime: '12:00' });
  assert.equal((await fixture.repository.read('TASK', moving.id)).value.scheduledAt, d('2099-10-06', '12:00'));
  assert.deepEqual(await fixture.repository.read('TASK', cancelled.id), cancelledBefore,
    'baseline construction must not alter or enqueue the cancelled task');
  assert.equal((await fixture.repository.listUnresolved('TASK')).length, 3);
});

test('canonical Task states retain the same schedule baseline through Store presentation mapping', async (t) => {
  const { taskScheduleState } = await import('../src/services/localRepository.ts');
  const d = (date, time) => new Date(`${date}T${time}:00`).toISOString();
  for (const status of ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']) {
    for (const scheduled of [false, true]) {
      await t.test(`${status}; ${scheduled ? 'scheduled' : 'unscheduled'}; null duration`, async () => {
        const moving = deadlineTask(`canonical-moving-${status}-${scheduled}`, {
          scheduledAt: undefined, dueAt: d('2099-10-06', '20:00'), durationMinutes: 30, version: 2,
        });
        const other = deadlineTask(`canonical-other-${status}-${scheduled}`, {
          status, scheduledAt: scheduled ? d('2099-10-07', '10:00') : null,
          dueAt: null, durationMinutes: null, version: 4,
        });
        const fixture = await createTaskStoreFixture([moving, other]);
        await fixture.taskStore.fetchTasks();
        fixture.taskStore.setSelectedDay('Tue', '2099-10-06');
        const expected = taskScheduleState(await fixture.repository.list('TASK'));
        const originalCommit = fixture.repository.commitScheduleMutation.bind(fixture.repository);
        let checked = false;
        fixture.repository.commitScheduleMutation = async (input) => {
          checked = true;
          assert.equal(input.expectedScheduleState, expected,
            'a normal DTO collection must equal the Store roundtrip before any concurrent write');
          return originalCommit(input);
        };
        await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: moving.id, dateKey: '2099-10-06', slotTime: '10:00' });
        assert.equal(checked, true);
        assert.equal((await fixture.repository.read('TASK', other.id)).value.status, status);
        assert.equal((await fixture.repository.read('TASK', other.id)).value.durationMinutes, null);
      });
    }
  }
});


test('status changes retain the exact scheduled date across natural weeks instead of reparsing the display time', async (t) => {
  const scheduledAt = new Date('2099-11-01T10:00:00').toISOString();
  const dueAt = new Date('2099-11-01T13:00:00').toISOString();
  for (const [before, target, canonical] of [['TODO', 'learning', 'IN_PROGRESS'], ['CANCELLED', 'pending', 'TODO']]) {
    await t.test(`${before} to ${target}`, async () => {
      const task = deadlineTask(`status-fixed-week-${before}`, { status: before, scheduledAt, dueAt, durationMinutes: 30 });
      const fixture = await createTaskStoreFixture([task]);
      await fixture.taskStore.fetchTasks();
      await fixture.taskStore.updateTaskStatus(task.id, target);
      const saved = await fixture.repository.read('TASK', task.id);
      assert.equal(saved.value.scheduledAt, scheduledAt, 'a status-only edit must preserve the original full instant');
      assert.equal(saved.value.status, canonical);
      assert.equal(saved.value.dueAt, dueAt);
      const [mutation] = await fixture.repository.listPending('TASK');
      assert.equal(mutation.mutationType, 'UPDATE');
      assert.equal(mutation.payload.scheduledAt, scheduledAt);
    });
  }
});


test('unscheduleTask commits atomically through schedule queue without fence errors', async () => {
  const task = deadlineTask('unschedule-queue-task', {
    status: 'TODO',
    scheduledAt: '2099-10-06T10:00:00.000Z',
    dueAt: '2099-10-06T18:00:00.000Z',
    durationMinutes: 30,
    version: 2,
  });
  const fixture = await createTaskStoreFixture([task]);
  await fixture.taskStore.fetchTasks();

  // Test 1: Completed task unschedule must throw and be rejected
  const completedTask = deadlineTask('completed-scheduled', {
    status: 'DONE',
    scheduledAt: '2099-10-06T09:00:00.000Z',
    dueAt: '2099-10-06T18:00:00.000Z',
    durationMinutes: 30,
    version: 1,
  });
  await fixture.repository.upsert('TASK', completedTask.id, completedTask, { version: 1, syncStatus: 'synced' });
  await fixture.taskStore.fetchTasks();
  await assert.rejects(
    () => fixture.taskStore.unscheduleTask(completedTask.id),
    /已完成的排期任务已固定/,
    'completed scheduled task must reject unscheduling'
  );

  // Test 2: Unschedule active task immediately moves it to pending/unassigned
  await fixture.taskStore.unscheduleTask(task.id);
  const localRow = await fixture.repository.read('TASK', task.id);
  assert.equal(localRow.value.scheduledAt, undefined, 'local entity projection must clear scheduledAt');
  const [mutation] = await fixture.repository.listPending('TASK');
  assert.equal(mutation.mutationType, 'SCHEDULE_UNSCHEDULE');
  assert.equal(mutation.resourceId, task.id);
  assert.equal(mutation.baseVersion, 2);
  assert.equal(mutation.payload.scheduledAt, null);
  assert.deepEqual(mutation.payload._localAffectedTaskIds, [task.id]);

  // UI state: task is now in pendingTasks
  assert.ok(fixture.taskStore.pendingTasks.some((t) => t.id === task.id));
  assert.ok(!fixture.taskStore.timeSlots.some((slot) => slot.task?.id === task.id));

  // Test 3: Sequence: unschedule -> reschedule -> move
  // User schedules the task again
  fixture.taskStore.setSelectedDay('Tue', '2099-10-06');
  await fixture.taskStore.applyTimelineDrop({ type: 'slot', taskId: task.id, dateKey: '2099-10-06', slotTime: '14:00' });
  const rescheduledRow = await fixture.repository.read('TASK', task.id);
  const projectedTask = fixture.taskStore.allTasks.find((t) => t.id === task.id);
  assert.ok(projectedTask?.startTime?.includes("14:00"), "must reflect latest reschedule in UI projection");
  assert.ok(rescheduledRow?.value?.scheduledAt, "must have scheduledAt in local repository");

  const pendingMutations = await fixture.repository.listPending('TASK');
  assert.equal(pendingMutations.length, 2);
  assert.equal(pendingMutations[0].mutationType, 'SCHEDULE_UNSCHEDULE');
  assert.equal(pendingMutations[1].mutationType, 'SCHEDULE_INSERTION');
});
