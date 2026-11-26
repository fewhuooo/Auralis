import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

import { createFocusApi } from '../src/api/focusApi.ts'
import { ApiProblemError } from '../src/api/protocol.ts'
import { createFocusController, outboxKeyForScope } from '../src/services/focusController.ts'
import {
  buildSyncedBlockRecord,
  fromServerBlockPayload,
  toServerBlockBaseVersion,
} from '../src/utils/blockSyncMapper.ts'
import {
  combineLocalDateAndTime,
  formatFullWeekday,
  formatLocalTimeHHmm,
  getDayPeriodLabel,
  getIsoWeekNumber,
  toLocalDateKey,
} from '../src/utils/dateKey.ts'
import {
  compareTaskPosition,
  findOverlappingScheduledTask,
  fromServerTaskPayload,
  getPendingTodos,
  getScheduledTasksForLocalDate,
  getVisiblePendingTodos,
  isOverdueTask,
  isScheduledCompletionLocked,
  isScheduledIntervalEnded,
  parseDueTimestamp,
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

test('focus outbox drops terminal 4xx records without blocking later items and retries 5xx failures', async () => {
  const store = new Map()
  let nowMs = new Date(2026, 10, 16, 10, 0, 0).getTime()
  const attempts = []
  let failSecondAsServer = true

  const controller = createFocusController({
    storage: {
      get: (key) => store.get(key),
      set: (key, value) => store.set(key, value),
    },
    getScope: () => 'user-a:dev-1',
    getLoginGeneration: () => Symbol.for('gen-a'),
    canSyncSession: () => true,
    now: () => nowMs,
    nextId: (() => {
      let seq = 0
      return () => `session-${++seq}`
    })(),
    recordSession: async (cmd) => {
      attempts.push(cmd.clientSessionId)
      if (cmd.clientSessionId === 's-missing-task') {
        throw new ApiProblemError({ title: 'Not Found', status: 404, detail: 'Task missing', fieldErrors: [] })
      }
      if (cmd.clientSessionId === 's-retry' && failSecondAsServer) {
        throw new ApiProblemError({ title: 'Unavailable', status: 503, detail: 'Retry later', fieldErrors: [] })
      }
    },
  })

  // Seed outbox directly via storage scope key
  store.set('auralis:local:user-a:dev-1:focus_outbox', [
    { clientSessionId: 's-missing-task', startedAt: new Date(nowMs).toISOString(), endedAt: new Date(nowMs + 900000).toISOString(), durationSeconds: 900, completed: true },
    { clientSessionId: 's-retry', startedAt: new Date(nowMs).toISOString(), endedAt: new Date(nowMs + 900000).toISOString(), durationSeconds: 900, completed: true },
    { clientSessionId: 's-later', startedAt: new Date(nowMs).toISOString(), endedAt: new Date(nowMs + 900000).toISOString(), durationSeconds: 900, completed: true },
  ])

  const firstPass = await controller.flushOutbox()
  assert.equal(firstPass, 0)
  assert.deepEqual(attempts, ['s-missing-task', 's-retry'])
  assert.deepEqual(controller.readOutbox().map(item => item.clientSessionId), ['s-retry', 's-later'])

  failSecondAsServer = false
  const secondPass = await controller.flushOutbox()
  assert.equal(secondPass, 2)
  assert.equal(controller.readOutbox().length, 0)
})

test('knowledge block sync preserves server version after APPLIED push and passes baseVersion on edits', () => {
  const mappedPayload = fromServerBlockPayload({
    id: 'blk-1',
    subjectId: 'sub-1',
    title: 'Bayes Theorem',
    content: 'P(A|B) formula',
    updatedAt: '2026-11-16T08:00:00Z',
    version: 3,
  }, 0)
  const localRecord = buildSyncedBlockRecord('blk-1', mappedPayload, 0)
  assert.equal(localRecord.sync_version, 3)
  assert.equal(localRecord.time, '2026-11-16T08:00:00Z')
  assert.equal(toServerBlockBaseVersion(localRecord), 3)
})

test('dateKey provides ISO week numbers, period labels, and full weekday names for home masthead', () => {
  assert.equal(getIsoWeekNumber(new Date(2026, 10, 17)), 47)
  assert.equal(formatFullWeekday(new Date(2026, 10, 17)), '星期二')
  assert.equal(getDayPeriodLabel(6), '清晨')
  assert.equal(getDayPeriodLabel(10), '上午')
  assert.equal(getDayPeriodLabel(13), '午间')
  assert.equal(getDayPeriodLabel(15), '下午')
  assert.equal(getDayPeriodLabel(18), '傍晚')
  assert.equal(getDayPeriodLabel(22), '夜间')
})

test('getVisiblePendingTodos retains toggled completed todos in-place while excluding old or deleted completed todos', () => {
  const todo1 = { id: 'todo-1', status: 'pending', position: '01' }
  const todo2CompletedNow = { id: 'todo-2', status: 'completed', position: '02' }
  const todo3OldCompleted = { id: 'todo-3', status: 'completed', position: '03' }
  const todo4Deleted = { id: 'todo-4', status: 'completed', position: '04', is_deleted: true }
  const scheduledDone = { id: 'sched-1', status: 'completed', position: '00', scheduledAt: '2026-11-18T09:00:00Z' }
  const tasks = [todo3OldCompleted, todo4Deleted, scheduledDone, todo2CompletedNow, todo1]

  assert.deepEqual(getPendingTodos(tasks).map(item => item.id), ['todo-1'])
  assert.deepEqual(
    getVisiblePendingTodos(tasks, new Set(['todo-2', 'todo-4', 'sched-1'])).map(item => item.id),
    ['todo-1', 'todo-2'],
  )
  assert.deepEqual(getVisiblePendingTodos(tasks, new Set()).map(item => item.id), ['todo-1'])
})

test('useTaskStore retains checked-off home todos until unchecked, deleted, scheduled, or scope switches', async (context) => {
  let generation = Symbol('gen-1')
  const mockUser = ref({ id: 'user-1' })
  const mockDeviceId = ref('dev-1')
  const savedTasks = new Map([
    ['t1', { id: 't1', name: 'Read notes', subject: 'Math', duration: 30, status: 'pending', position: '01' }],
    ['t2', { id: 't2', name: 'Solve problems', subject: 'Math', duration: 45, status: 'pending', position: '02' }],
  ])

  const mocks = new Map([
    ['@/services/localDb', `
      export const localDb = globalThis.__taskTestDb;
    `],
    ['./useAuthStore', `
      export const useAuthStore = () => globalThis.__taskTestAuth;
    `],
    ['./useSyncStore', `
      export const getClientId = () => 'dev-1';
      export const useSyncStore = () => ({ async triggerSync() {} });
    `],
  ])
  globalThis.__taskTestDb = {
    async getTasks() { return [...savedTasks.values()].map(item => ({ ...item })) },
    async saveTask(task) { savedTasks.set(task.id, { ...task }) },
    async addLocalMutation() {},
    async deleteTask(id) { savedTasks.delete(id) },
    async discardLocalMutations() {},
  }
  globalThis.__taskTestAuth = {
    get user() { return mockUser.value },
    get serverDeviceId() { return mockDeviceId.value },
    getLoginGeneration: () => generation,
  }
  context.after(() => {
    delete globalThis.__taskTestDb
    delete globalThis.__taskTestAuth
  })

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (mocks.has(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })
  context.after(() => loader.deregister())
  const { useTaskStore } = await import('../src/store/useTaskStore.ts')
  setActivePinia(createPinia())
  const store = useTaskStore()
  await store.loadLocalTasks()

  // Checking off t1 retains it in homePendingTasks while removing it from uncompleted pendingTasks
  await store.toggleTaskComplete('t1')
  assert.deepEqual(store.pendingTasks.map(t => t.id), ['t2'])
  assert.deepEqual(store.homePendingTasks.map(t => [t.id, t.status]), [['t1', 'completed'], ['t2', 'pending']])

  // Reloading from local storage in the same session keeps t1 visible as completed
  await store.loadLocalTasks()
  assert.deepEqual(store.homePendingTasks.map(t => [t.id, t.status]), [['t1', 'completed'], ['t2', 'pending']])

  // Clicking again unchecks t1 back to pending
  await store.toggleTaskComplete('t1')
  assert.deepEqual(store.pendingTasks.map(t => t.id), ['t1', 't2'])
  assert.deepEqual(store.homePendingTasks.map(t => [t.id, t.status]), [['t1', 'pending'], ['t2', 'pending']])

  // Deleting or scheduling clears retained state cleanly
  await store.toggleTaskComplete('t1')
  assert.equal(store.homePendingTasks.length, 2)
  await store.removeTask('t1')
  assert.deepEqual(store.homePendingTasks.map(t => t.id), ['t2'])

  await store.toggleTaskComplete('t2')
  assert.deepEqual(store.homePendingTasks.map(t => [t.id, t.status]), [['t2', 'completed']])
  await store.scheduleTask('t2', '2026-11-18T10:00:00Z')
  assert.equal(store.homePendingTasks.length, 0)
  await store.unscheduleTask('t2')
  assert.equal(store.homePendingTasks.length, 0)
  await store.toggleTaskComplete('t2')
  assert.deepEqual(store.homePendingTasks.map(t => [t.id, t.status]), [['t2', 'pending']])

  // Account/session switch drops previously retained completed todos
  await store.toggleTaskComplete('t2')
  assert.equal(store.homePendingTasks.length, 1)
  generation = Symbol('gen-2')
  mockUser.value = { id: 'user-2' }
  assert.equal(store.homePendingTasks.length, 0)
  await store.loadLocalTasks()
  assert.equal(store.homePendingTasks.length, 0)
})

test('useFocusStore.flushPendingSessions respects autoSync setting unless triggered manually', async (context) => {
  const storage = new Map()
  const scope = 'user-1:dev-1'
  storage.set('auralis.settings.autoSync', 'false')
  storage.set(outboxKeyForScope(scope), JSON.stringify([{
    clientSessionId: 'sess-1',
    startedAt: '2026-11-18T08:00:00Z',
    endedAt: '2026-11-18T08:25:00Z',
    durationSeconds: 1500,
    dateKey: '2026-11-18',
  }]))

  let recorded = 0
  const gen = Symbol('gen')
  globalThis.__focusStoreAuth = {
    isAuthenticated: true,
    user: { id: 'user-1' },
    sessionId: 'auth-sess-1',
    serverDeviceId: 'dev-1',
    getLoginGeneration: () => gen,
  }
  globalThis.__focusStoreApi = {
    async recordSession() {
      recorded += 1
      return {}
    },
  }
  const hadOwnStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prevStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, val) => { storage.set(key, String(val)) },
      removeItem: (key) => { storage.delete(key) },
    },
  })

  const mocks = new Map([
    ['@/api/focusApi', 'export const focusApi = globalThis.__focusStoreApi;'],
    ['@/services/localDataScope', 'export const localDataScope = { current: () => "user-1:dev-1" };'],
    ['./useAuthStore', 'export const useAuthStore = () => globalThis.__focusStoreAuth;'],
  ])

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (mocks.has(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })

  context.after(() => {
    loader.deregister()
    delete globalThis.__focusStoreAuth
    delete globalThis.__focusStoreApi
    if (hadOwnStorage) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage })
    } else {
      delete globalThis.localStorage
    }
  })

  const { useFocusStore } = await import('../src/store/useFocusStore.ts?focus-autosync-test')
  setActivePinia(createPinia())
  const store = useFocusStore()
  await new Promise((resolve) => setTimeout(resolve, 10))

  // Auto-sync paused: automatic flush skips upload and preserves outbox
  await store.flushPendingSessions(false)
  assert.equal(recorded, 0)
  assert.equal(store.pendingOutboxCount, 1)

  // Manual sync still flushes pending focus outbox
  await store.flushPendingSessions(true)
  assert.equal(recorded, 1)
  assert.equal(store.pendingOutboxCount, 0)
})

test('localDb H5 preserves numeric-string task positions, heals numeric cache rows, and excludes CANCELLED tasks', async (context) => {
  const storage = new Map()
  const hadOwnStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prevStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, val) => { storage.set(key, String(val)) },
      removeItem: (key) => { storage.delete(key) },
    },
  })

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      if (specifier.startsWith('./') && !specifier.endsWith('.ts') && ctx.parentURL?.includes('Auralis-Mobile')) {
        return nextResolve(new URL(`${specifier}.ts`, ctx.parentURL).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })

  context.after(() => {
    loader.deregister()
    if (hadOwnStorage) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage })
    } else {
      delete globalThis.localStorage
    }
  })

  const { localDataScope } = await import('../src/services/localDataScope.ts?localdb-pos-test')
  const { localDb } = await import('../src/services/localDb.ts?localdb-pos-test')

  const scope = localDataScope.activate('user-seed', 'dev-1')
  storage.set(`auralis:local:${scope}:task_blocks`, JSON.stringify([
    {
      id: 't-legacy',
      name: 'Legacy Numeric Pos Todo',
      subject: 'Math',
      desc: '',
      duration: 30,
      status: 'pending',
      scheduled_at: null,
      due_at: null,
      sync_status: 'synced',
      is_deleted: 0,
      sync_version: 1,
      position: 3,
      subject_id: 's-1',
    },
  ]))

  await localDb.init()

  const scheduledIso = combineLocalDateAndTime('2026-11-20', '09:00')
  const payloads = [
    { id: 't-2', title: 'Todo Two', status: 'TODO', scheduledAt: null, durationMinutes: 30, sortKey: '2', version: 1 },
    { id: 't-0010', title: 'Todo 0010', status: 'TODO', scheduledAt: null, durationMinutes: 30, sortKey: '0010', version: 1 },
    { id: 't-1', title: 'Todo One', status: 'TODO', scheduledAt: null, durationMinutes: 30, sortKey: '1', version: 1 },
    { id: 't-cancelled', title: 'Cancelled Todo', status: 'CANCELLED', scheduledAt: null, durationMinutes: 30, sortKey: '0', version: 1 },
    { id: 's-2', title: 'Scheduled Second', status: 'IN_PROGRESS', scheduledAt: scheduledIso, durationMinutes: 60, sortKey: '2', version: 1 },
    { id: 's-1', title: 'Scheduled First', status: 'IN_PROGRESS', scheduledAt: scheduledIso, durationMinutes: 60, sortKey: '1', version: 1 },
  ]

  for (const raw of payloads) {
    const hydrated = fromServerTaskPayload(raw, raw.version)
    await localDb.saveTask(hydrated, 'synced', hydrated.sync_version)
  }

  const loaded = await localDb.getTasks()
  assert.equal(loaded.every(item => typeof item.position === 'string'), true)
  assert.equal(loaded.find(item => item.id === 't-0010')?.position, '0010')
  assert.equal(loaded.find(item => item.id === 't-legacy')?.position, '3')
  assert.equal(loaded.find(item => item.id === 't-1')?.desc, '')

  const pending = getPendingTodos(loaded)
  assert.deepEqual(pending.map(item => item.id), ['t-0010', 't-1', 't-2', 't-legacy'])

  const scheduled = getScheduledTasksForLocalDate(loaded, '2026-11-20')
  assert.deepEqual(scheduled.map(item => item.id), ['s-1', 's-2'])

  // Code-point comparison matches Lexorank order ('0' < 'U' < 'g') unlike localeCompare
  const { Lexorank } = await import('../src/utils/lexorank.ts')
  const firstGenerated = Lexorank.getMedian('0', '')
  const secondGenerated = Lexorank.getMedian(firstGenerated, '')
  assert.equal(compareTaskPosition('0', firstGenerated) < 0, true)
  assert.equal(compareTaskPosition(firstGenerated, secondGenerated) < 0, true)
  assert.deepEqual(
    getPendingTodos([
      { id: 'seq-2', scheduledAt: undefined, status: 'pending', position: secondGenerated, is_deleted: false },
      { id: 'seq-0', scheduledAt: undefined, status: 'pending', position: '0', is_deleted: false },
      { id: 'seq-1', scheduledAt: undefined, status: 'pending', position: firstGenerated, is_deleted: false },
    ]).map(item => item.id),
    ['seq-0', 'seq-1', 'seq-2'],
  )
})

test('localDb coalesces pending offline mutations per entity, backfills legacy H5 ids, and guards markMutationSynced by client_id', async (context) => {
  const storage = new Map()
  const hadOwnStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prevStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
  })
  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      if (specifier.startsWith('./') && !specifier.endsWith('.ts') && ctx.parentURL?.includes('Auralis-Mobile')) {
        return nextResolve(new URL(`${specifier}.ts`, ctx.parentURL).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })
  context.after(() => {
    loader.deregister()
    if (hadOwnStorage) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage })
    } else {
      delete globalThis.localStorage
    }
  })

  const { localDataScope } = await import('../src/services/localDataScope.ts?localdb-coalesce-test')
  const { localDb } = await import('../src/services/localDb.ts?localdb-coalesce-test')

  const scope = localDataScope.activate('user-coalesce', 'dev-1')
  // Legacy H5 row missing numeric id
  storage.set(`auralis:local:${scope}:local_mutations`, JSON.stringify([
    {
      client_id: 'legacy-1',
      entity_type: 'task',
      entity_id: 'legacy-task',
      action: 'update',
      payload: JSON.stringify({ id: 'legacy-task', status: 'pending', sync_version: 2 }),
      created_at: 1000,
      sync_status: 'pending',
    },
  ]))

  await localDb.init()

  // Repeated offline updates on synced task coalesce into 1 pending update preserving sync_version & updating client_id
  await localDb.addLocalMutation('c-1', 'task', 'task-sync', 'update', { id: 'task-sync', status: 'completed', sync_version: 5 })
  await localDb.addLocalMutation('c-2', 'task', 'task-sync', 'update', { id: 'task-sync', status: 'pending' })

  // Offline create + update coalesces to 1 create; create + delete discards completely
  await localDb.addLocalMutation('c-new-1', 'task', 'task-draft', 'create', { id: 'task-draft', name: 'Draft v1', status: 'pending', sync_version: 0 })
  await localDb.addLocalMutation('c-new-2', 'task', 'task-draft', 'update', { id: 'task-draft', name: 'Draft v2', status: 'completed' })

  await localDb.addLocalMutation('c-ephemeral-1', 'task', 'task-ephemeral', 'create', { id: 'task-ephemeral', name: 'Ephemeral' })
  await localDb.addLocalMutation('c-ephemeral-2', 'task', 'task-ephemeral', 'delete', { id: 'task-ephemeral' })

  // Update followed by delete becomes 1 delete preserving base version
  await localDb.addLocalMutation('c-del-1', 'task', 'task-del', 'update', { id: 'task-del', name: 'Before delete', sync_version: 9 })
  await localDb.addLocalMutation('c-del-2', 'task', 'task-del', 'delete', { id: 'task-del' })

  const pending = await localDb.getUnsyncedMutations()
  assert.equal(pending.length, 4)
  assert.equal(new Set(pending.map(row => row.id)).size, 4)
  assert.ok(pending.every(row => Number.isInteger(row.id) && row.id > 0))

  const taskSyncRow = pending.find(row => row.entity_id === 'task-sync')
  assert.equal(taskSyncRow.client_id, 'c-2')
  assert.equal(taskSyncRow.action, 'update')
  assert.deepEqual(JSON.parse(taskSyncRow.payload), { id: 'task-sync', status: 'pending', sync_version: 5 })

  const taskDraftRow = pending.find(row => row.entity_id === 'task-draft')
  assert.equal(taskDraftRow.client_id, 'c-new-2')
  assert.equal(taskDraftRow.action, 'create')
  assert.equal(JSON.parse(taskDraftRow.payload).name, 'Draft v2')

  const taskDelRow = pending.find(row => row.entity_id === 'task-del')
  assert.equal(taskDelRow.client_id, 'c-del-2')
  assert.equal(taskDelRow.action, 'delete')
  assert.equal(JSON.parse(taskDelRow.payload).sync_version, 9)
  assert.equal(pending.some(row => row.entity_id === 'task-ephemeral'), false)

  // Stale client_id does NOT remove a rotated pending mutation row, while matching client_id removes only that row
  await localDb.markMutationSynced(taskSyncRow.id, 'c-1')
  assert.equal((await localDb.getUnsyncedMutations()).some(row => row.entity_id === 'task-sync'), true)

  await localDb.markMutationSynced(taskSyncRow.id, 'c-2')
  const afterSynced = await localDb.getUnsyncedMutations()
  assert.equal(afterSynced.length, 3)
  assert.equal(afterSynced.some(row => row.entity_id === 'task-sync'), false)
  assert.equal(afterSynced.some(row => row.entity_id === 'legacy-task'), true)
})

test('localDb H5 query parser handles quotes containing WHERE, ORDER BY, AND, and =, and fences in-flight mutations during rebase', async (context) => {
  const storage = new Map()
  const hadOwnStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prevStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
  })
  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      if (specifier.startsWith('./') && !specifier.endsWith('.ts') && ctx.parentURL?.includes('Auralis-Mobile')) {
        return nextResolve(new URL(`${specifier}.ts`, ctx.parentURL).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })
  context.after(() => {
    loader.deregister()
    if (hadOwnStorage) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage })
    } else {
      delete globalThis.localStorage
    }
  })

  const { localDataScope } = await import('../src/services/localDataScope.ts?localdb-sql-fencing-test')
  const { localDb } = await import('../src/services/localDb.ts?localdb-sql-fencing-test')

  localDataScope.activate('user-sql-fence', 'dev-1')
  await localDb.init()

  const trickySubject = "Data Structures AND Algorithms = 1's"
  const trickyText = "Explain where x = 0 AND y = 'test' ORDER BY id"

  await localDb.saveBlock({
    id: 'blk-quote',
    subject: trickySubject,
    title: 'First Title',
    preview: trickyText,
    time: '100',
    source: 'note',
    color: '#8B9A6E',
    sync_status: 'pending_update',
    sync_version: 2,
    is_deleted: false,
  })
  await localDb.saveBlock({
    id: 'blk-quote',
    subject: trickySubject,
    title: trickyText,
    preview: `${trickyText} updated`,
    time: '200',
    source: 'note',
    color: '#8B9A6E',
    sync_status: 'pending_update',
    sync_version: 2,
    is_deleted: false,
  })

  const loadedBlocks = await localDb.getBlocks(trickySubject)
  assert.equal(loadedBlocks.length, 1)
  assert.equal(loadedBlocks[0].title, trickyText)
  assert.equal(loadedBlocks[0].preview, `${trickyText} updated`)

  await localDb.setMetadata('k=1 AND b=2', 'val = 100 WHERE true')
  assert.equal(await localDb.getMetadata('k=1 AND b=2'), 'val = 100 WHERE true')

  // UPDATE coalescing with ' where ' inside serialized JSON payload must target the real WHERE id
  await localDb.addLocalMutation('c-text-1', 'block', 'blk-quote', 'update', {
    id: 'blk-quote',
    title: 'Initial',
    preview: 'Start',
    sync_version: 4,
  })
  await localDb.addLocalMutation('c-text-2', 'block', 'blk-quote', 'update', {
    id: 'blk-quote',
    title: trickyText,
    preview: 'where a = 1 AND b = 2',
  })
  let pending = await localDb.getUnsyncedMutations()
  const blockMutation = pending.find(row => row.entity_id === 'blk-quote')
  assert.equal(blockMutation.client_id, 'c-text-2')
  assert.equal(JSON.parse(blockMutation.payload).title, trickyText)
  assert.equal(JSON.parse(blockMutation.payload).sync_version, 4)

  // In-flight CREATE fenced against mid-flight UPDATE and mid-flight DELETE on separate rows
  await localDb.addLocalMutation('c-flight-create', 'task', 'task-create-flight', 'create', {
    id: 'task-create-flight',
    name: 'Offline Create',
    sync_version: 0,
  })
  await localDb.addLocalMutation('c-flight-del-create', 'task', 'task-del-flight', 'create', {
    id: 'task-del-flight',
    name: 'Delete While Pushing',
    sync_version: 0,
  })
  await localDb.addLocalMutation('c-flight-upd', 'task', 'task-upd-flight', 'update', {
    id: 'task-upd-flight',
    name: 'Update v5',
    sync_version: 5,
  })
  pending = await localDb.getUnsyncedMutations()
  const inFlightCreate = pending.find(r => r.client_id === 'c-flight-create')
  const inFlightDelCreate = pending.find(r => r.client_id === 'c-flight-del-create')
  const inFlightUpd = pending.find(r => r.client_id === 'c-flight-upd')
  localDb.setInFlightMutationIds([inFlightCreate.id, inFlightDelCreate.id, inFlightUpd.id])

  await localDb.addLocalMutation('c-child-update', 'task', 'task-create-flight', 'update', {
    id: 'task-create-flight',
    name: 'Edited Mid-Flight',
  })
  await localDb.addLocalMutation('c-child-delete', 'task', 'task-del-flight', 'delete', {
    id: 'task-del-flight',
  })
  await localDb.addLocalMutation('c-child-upd-2', 'task', 'task-upd-flight', 'update', {
    id: 'task-upd-flight',
    name: 'Edited Again',
  })

  pending = await localDb.getUnsyncedMutations()
  assert.equal(pending.some(r => r.client_id === 'c-flight-create' && r.action === 'create'), true)
  assert.equal(pending.some(r => r.client_id === 'c-child-update' && r.action === 'update'), true)
  assert.equal(pending.some(r => r.client_id === 'c-flight-del-create' && r.action === 'create'), true)
  assert.equal(pending.some(r => r.client_id === 'c-child-delete' && r.action === 'delete'), true)
  assert.equal(pending.some(r => r.client_id === 'c-child-upd-2' && JSON.parse(r.payload).sync_version === 5), true)

  // Settle in-flight mutations and rebase children
  localDb.setInFlightMutationIds([])
  await localDb.markMutationSynced(inFlightCreate.id, 'c-flight-create')
  await localDb.rebasePendingMutations('task', 'task-create-flight', {
    appliedMutationType: 'CREATE',
    serverVersion: 0,
    deleted: false,
  })
  await localDb.markMutationSynced(inFlightDelCreate.id, 'c-flight-del-create')
  await localDb.rebasePendingMutations('task', 'task-del-flight', {
    appliedMutationType: 'CREATE',
    serverVersion: 0,
    deleted: false,
  })
  await localDb.markMutationSynced(inFlightUpd.id, 'c-flight-upd')
  await localDb.rebasePendingMutations('task', 'task-upd-flight', {
    appliedMutationType: 'UPDATE',
    serverVersion: 6,
    deleted: false,
  })

  const afterRebase = await localDb.getUnsyncedMutations()
  const childUpdate = afterRebase.find(r => r.client_id === 'c-child-update')
  assert.equal(childUpdate.action, 'update')
  assert.equal(JSON.parse(childUpdate.payload).sync_version, 0)
  const childDelete = afterRebase.find(r => r.client_id === 'c-child-delete')
  assert.equal(childDelete.action, 'delete')
  assert.equal(JSON.parse(childDelete.payload).sync_version, 0)
  const childUpd2 = afterRebase.find(r => r.client_id === 'c-child-upd-2')
  assert.equal(JSON.parse(childUpd2.payload).sync_version, 6)

  // Post-rebase offline edit before next sync carrying stale entity version must preserve higher rebased version
  await localDb.addLocalMutation('c-child-upd-3', 'task', 'task-upd-flight', 'update', {
    id: 'task-upd-flight',
    name: 'Edited Post-Rebase',
    sync_version: 5,
  })
  await localDb.addLocalMutation('c-sub-flight-upd', 'subject', 'sub-flight', 'update', {
    id: 'sub-flight',
    name: 'Sub v5',
    version: 5,
  })
  const subFlightRow = (await localDb.getUnsyncedMutations()).find(r => r.client_id === 'c-sub-flight-upd')
  localDb.setInFlightMutationIds([subFlightRow.id])
  await localDb.addLocalMutation('c-sub-child-1', 'subject', 'sub-flight', 'update', {
    id: 'sub-flight',
    name: 'Sub Mid-Flight',
    version: 5,
  })
  localDb.setInFlightMutationIds([])
  await localDb.markMutationSynced(subFlightRow.id, 'c-sub-flight-upd')
  await localDb.rebasePendingMutations('subject', 'sub-flight', {
    appliedMutationType: 'UPDATE',
    serverVersion: 6,
    deleted: false,
  })
  await localDb.addLocalMutation('c-sub-child-2', 'subject', 'sub-flight', 'update', {
    id: 'sub-flight',
    name: 'Sub Post-Rebase Stale Store',
    version: 5,
  })

  const finalMutations = await localDb.getUnsyncedMutations()
  const finalTaskUpd = finalMutations.find(r => r.client_id === 'c-child-upd-3')
  assert.equal(JSON.parse(finalTaskUpd.payload).sync_version, 6)
  assert.equal(JSON.parse(finalTaskUpd.payload).version, 6)
  const finalSubUpd = finalMutations.find(r => r.client_id === 'c-sub-child-2')
  assert.equal(JSON.parse(finalSubUpd.payload).version, 6)
  assert.equal(JSON.parse(finalSubUpd.payload).sync_version, 6)
})

test('taskSyncMapper aligns scheduled completion lock and overdue task detection with PC rules', () => {
  const now = new Date('2026-11-19T12:00:00.000Z')

  assert.equal(Number.isFinite(parseDueTimestamp('2026-11-19T12:00:00Z')), true)
  assert.equal(Number.isNaN(parseDueTimestamp('2026-11-19')), true)

  const endedCompleted = {
    status: 'completed',
    scheduledAt: '2026-11-19T10:30:00.000Z',
    duration: 90,
  }
  const activeCompleted = {
    status: 'completed',
    scheduledAt: '2026-11-19T11:30:00.000Z',
    duration: 60,
  }
  const endedScheduledTodo = {
    status: 'scheduled',
    scheduledAt: '2026-11-19T10:00:00.000Z',
    duration: 60,
  }
  const pastDueTodo = {
    status: 'pending',
    dueAt: '2026-11-19T11:59:59.000Z',
    duration: 30,
  }
  const futureDueTodo = {
    status: 'pending',
    dueAt: '2026-11-19T12:05:00.000Z',
    duration: 30,
  }
  const cancelledPast = {
    status: 'cancelled',
    scheduledAt: '2026-11-19T08:00:00.000Z',
    dueAt: '2026-11-19T09:00:00.000Z',
    duration: 30,
  }

  assert.equal(isScheduledIntervalEnded(endedCompleted, now), true)
  assert.equal(isScheduledCompletionLocked(endedCompleted, now), true)
  assert.equal(isScheduledCompletionLocked(activeCompleted, now), false)
  assert.equal(isScheduledCompletionLocked({ status: 'completed', duration: 30 }, now), false)
  assert.equal(isOverdueTask(endedScheduledTodo, now), true)
  assert.equal(isOverdueTask(endedCompleted, now), false)
  assert.equal(isOverdueTask(pastDueTodo, now), true)
  assert.equal(isOverdueTask(futureDueTodo, now), false)
  assert.equal(isOverdueTask(cancelledPast, now), false)
})

test('useTaskStore enforces scheduled completion lock and recovers overdue tasks while respecting sync and auth fences', async (context) => {
  let generation = Symbol('gen-overdue')
  let isSyncingFlag = false
  let triggerSyncCalls = 0
  const mockAuth = {
    isAuthenticated: true,
    user: { id: 'user-overdue' },
    serverDeviceId: 'dev-1',
    getLoginGeneration: () => generation,
  }
  const mutations = []
  const savedTasks = new Map([
    [
      'ended-locked',
      {
        id: 'ended-locked',
        name: 'Ended Completed Schedule',
        subject: 'Math',
        duration: 30,
        status: 'completed',
        scheduledAt: '2020-01-01T08:00:00.000Z',
        sync_version: 2,
      },
    ],
    [
      'ended-overdue',
      {
        id: 'ended-overdue',
        name: 'Ended Overdue Schedule',
        subject: 'Math',
        duration: 30,
        status: 'scheduled',
        scheduledAt: '2020-01-01T09:00:00.000Z',
        sync_version: 4,
      },
    ],
    [
      'past-due-todo',
      {
        id: 'past-due-todo',
        name: 'Past Due Todo',
        subject: 'Physics',
        duration: 45,
        status: 'pending',
        dueAt: '2020-01-01T10:00:00.000Z',
        sync_version: 1,
      },
    ],
    [
      'future-schedule',
      {
        id: 'future-schedule',
        name: 'Future Schedule',
        subject: 'Physics',
        duration: 60,
        status: 'scheduled',
        scheduledAt: '2099-01-01T10:00:00.000Z',
        sync_version: 1,
      },
    ],
    [
      'future-completed',
      {
        id: 'future-completed',
        name: 'Future Completed Schedule',
        subject: 'Physics',
        duration: 60,
        status: 'completed',
        scheduledAt: '2099-01-01T12:00:00.000Z',
        sync_version: 1,
      },
    ],
  ])

  const mocks = new Map([
    ['@/services/localDb', 'export const localDb = globalThis.__taskOverdueDb;'],
    ['./useAuthStore', 'export const useAuthStore = () => globalThis.__taskOverdueAuth;'],
    ['./useSyncStore', 'export const getClientId = () => "cid-overdue"; export const useSyncStore = () => globalThis.__taskOverdueSync;'],
  ])
  globalThis.__taskOverdueDb = {
    async getTasks() { return [...savedTasks.values()].map(item => ({ ...item })) },
    async saveTask(task, syncStatus) { savedTasks.set(task.id, { ...task, sync_status: syncStatus }) },
    async addLocalMutation(clientId, entityType, entityId, action, payload) {
      mutations.push({ clientId, entityType, entityId, action, payload })
    },
    async deleteTask(id) { savedTasks.delete(id) },
    async discardLocalMutations() {},
  }
  globalThis.__taskOverdueAuth = mockAuth
  globalThis.__taskOverdueSync = {
    get isSyncing() { return isSyncingFlag },
    async triggerSync() { triggerSyncCalls += 1 },
  }
  context.after(() => {
    delete globalThis.__taskOverdueDb
    delete globalThis.__taskOverdueAuth
    delete globalThis.__taskOverdueSync
  })

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (mocks.has(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })
  context.after(() => loader.deregister())

  const { useTaskStore } = await import('../src/store/useTaskStore.ts?overdue-lock-test')
  setActivePinia(createPinia())
  const store = useTaskStore()
  await store.loadLocalTasks()

  // Locked ended completed scheduled task cannot be uncompleted
  const unlockedResult = await store.toggleTaskComplete('ended-locked')
  assert.equal(unlockedResult, false)
  assert.equal(savedTasks.get('ended-locked').status, 'completed')
  assert.equal(mutations.length, 0)

  // Future completed scheduled task can still toggle back cleanly
  assert.equal(await store.toggleTaskComplete('future-completed'), true)
  assert.equal(savedTasks.get('future-completed').status, 'scheduled')
  await new Promise(resolve => setTimeout(resolve, 0))

  // Overdue recovery skips while sync is active or unauthenticated
  isSyncingFlag = true
  assert.equal(await store.recoverOverdueTasks(), 0)
  isSyncingFlag = false

  mockAuth.isAuthenticated = false
  assert.equal(await store.recoverOverdueTasks(), 0)
  mockAuth.isAuthenticated = true

  // Authenticated idle recovery marks ended scheduled & past-due unscheduled tasks completed once and syncs once
  const syncCallsBeforeRecovery = triggerSyncCalls
  const recovered = await store.recoverOverdueTasks()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(recovered, 2)
  assert.equal(savedTasks.get('ended-overdue').status, 'completed')
  assert.equal(savedTasks.get('past-due-todo').status, 'completed')
  assert.equal(savedTasks.get('future-schedule').status, 'scheduled')
  assert.equal(triggerSyncCalls, syncCallsBeforeRecovery + 1)
  assert.deepEqual(
    mutations.slice(-2).map(m => [m.entityId, m.payload.status]),
    [['ended-overdue', 'completed'], ['past-due-todo', 'completed']],
  )
})

test('useTaskStore clears stale tasks synchronously on account switch, fences localDb writes before execution, aborts mid-loop during sync, and suppresses rejected loop', async (context) => {
  let generation = Symbol('gen-fence')
  const mockUser = ref({ id: 'user-a' })
  const mockDevice = ref('dev-1')
  const mockAuthState = {
    isAuthenticated: true,
    get user() { return mockUser.value },
    get serverDeviceId() { return mockDevice.value },
    getLoginGeneration: () => generation,
  }
  let syncActive = false
  let resetActive = false
  let flipSyncMidLoop = false
  let delayResolveClient = false
  let releaseClientResolve = null
  const dbWrites = []
  const dbRowsByUser = new Map([
    ['user-a', new Map([
      ['t-1', { id: 't-1', name: 'Overdue A1', subject: 'Math', duration: 30, status: 'scheduled', scheduledAt: '2020-01-01T08:00:00.000Z', sync_version: 2 }],
      ['t-2', { id: 't-2', name: 'Overdue A2', subject: 'Math', duration: 30, status: 'scheduled', scheduledAt: '2020-01-01T09:00:00.000Z', sync_version: 2 }],
    ])],
    ['user-b', new Map()],
  ])

  const mocks = new Map([
    ['@/services/localDb', 'export const localDb = globalThis.__taskFenceDb;'],
    ['./useAuthStore', 'export const useAuthStore = () => globalThis.__taskFenceAuth;'],
    ['./useSyncStore', 'export const getClientId = () => globalThis.__taskFenceGetClientId(); export const useSyncStore = () => globalThis.__taskFenceSync;'],
  ])
  globalThis.__taskFenceGetClientId = () => 'cid-fence'
  globalThis.__taskFenceDb = {
    async getTasks() {
      const map = dbRowsByUser.get(mockUser.value?.id || '') || new Map()
      return [...map.values()].map(item => ({ ...item }))
    },
    async saveTask(task, syncStatus) {
      dbWrites.push({ user: mockUser.value?.id, op: 'save', id: task.id, syncStatus })
      const map = dbRowsByUser.get(mockUser.value?.id || '')
      if (map) map.set(task.id, { ...task, sync_status: syncStatus })
      if (flipSyncMidLoop && task.id === 't-1') {
        syncActive = true
      }
    },
    async addLocalMutation(clientId, entityType, entityId, action) {
      dbWrites.push({ user: mockUser.value?.id, op: 'mutate', id: entityId, action, clientId })
    },
    async deleteTask(id) {
      dbWrites.push({ user: mockUser.value?.id, op: 'delete', id })
    },
  }
  globalThis.__taskFenceAuth = mockAuthState
  globalThis.__taskFenceSync = {
    get isSyncing() { return syncActive },
    get isResettingOffline() { return resetActive },
    async triggerSync() {},
  }
  context.after(() => {
    delete globalThis.__taskFenceDb
    delete globalThis.__taskFenceAuth
    delete globalThis.__taskFenceSync
    delete globalThis.__taskFenceGetClientId
  })

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (mocks.has(specifier)) {
        if (specifier === './useSyncStore' && delayResolveClient) {
          return new Promise((resolve) => {
            releaseClientResolve = () => resolve({
              url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`,
              shortCircuit: true,
            })
          })
        }
        return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })
  context.after(() => loader.deregister())

  const { useTaskStore } = await import('../src/store/useTaskStore.ts?fence-regression-test')
  setActivePinia(createPinia())
  const store = useTaskStore()
  await store.loadLocalTasks()
  assert.equal(store.allTasks.length, 2)

  // 1. Rejected overdue task is suppressed while fingerprint is unchanged, and re-enabled when version bumps
  store.suppressOverdueRecovery(['t-1'])
  flipSyncMidLoop = true
  // t-1 suppressed -> only t-2 runs; flipSyncMidLoop stays false for t-2, let's test suppression directly first:
  flipSyncMidLoop = false
  const recoveredNonSuppressed = await store.recoverOverdueTasks()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(recoveredNonSuppressed, 1)
  assert.equal(dbWrites.some(w => w.id === 't-1'), false)
  assert.equal(dbWrites.some(w => w.id === 't-2' && w.op === 'save'), true)

  // Calling again without changing t-1 keeps t-1 suppressed
  assert.equal(await store.recoverOverdueTasks(), 0)

  // Version bump clears suppression for t-1, and mid-loop sync activation stops remaining tasks cleanly
  dbRowsByUser.get('user-a').set('t-2', { id: 't-2', name: 'Overdue A2 Reloaded', subject: 'Math', duration: 30, status: 'scheduled', scheduledAt: '2020-01-01T09:00:00.000Z', sync_version: 3 })
  dbRowsByUser.get('user-a').set('t-1', { id: 't-1', name: 'Overdue A1 Updated', subject: 'Math', duration: 30, status: 'scheduled', scheduledAt: '2020-01-01T08:00:00.000Z', sync_version: 3 })
  await store.loadLocalTasks()
  flipSyncMidLoop = true
  const interruptedCount = await store.recoverOverdueTasks()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(interruptedCount, 1)
  assert.equal(dbWrites.some(w => w.id === 't-1' && w.op === 'save'), true)
  assert.equal(dbRowsByUser.get('user-a').get('t-2').status, 'scheduled')
  syncActive = false
  flipSyncMidLoop = false

  // 2. Pre-write scope fencing aborts addTask before touching User B's localDb when account switches mid-await
  dbWrites.length = 0
  // Note: ./useSyncStore is already cached from earlier resolve; swap mockUser mid-save via slow localDb.saveTask OR slow addTask pre-write check:
  // Re-test pre-mutation fence by mutating scope during saveTask
  const origSave = globalThis.__taskFenceDb.saveTask
  globalThis.__taskFenceDb.saveTask = async (task, syncStatus) => {
    dbWrites.push({ user: mockUser.value?.id, op: 'save', id: task.id, syncStatus })
    generation = Symbol('gen-user-b')
    mockUser.value = { id: 'user-b' }
  }
  await store.addTask({ name: 'Race Task', subject: 'Math', duration: 30, status: 'pending' })
  globalThis.__taskFenceDb.saveTask = origSave

  // Watch { flush: 'sync' } synchronously clears allTasks immediately on user change
  assert.equal(store.allTasks.length, 0)
  // addLocalMutation must NOT be called after scope flipped to user-b
  assert.equal(dbWrites.some(w => w.id !== undefined && w.op === 'mutate' && w.user === 'user-b'), false)

  // isResettingOffline gates recoverOverdueTasks completely
  mockUser.value = { id: 'user-a' }
  generation = Symbol('gen-user-a-2')
  resetActive = true
  assert.equal(await store.recoverOverdueTasks(), 0)
})

test('findOverlappingScheduledTask matches backend interval overlap rules and skips cancelled/deleted tasks', () => {
  const existing = [
    {
      id: 't-active',
      name: 'Morning Math',
      scheduledAt: combineLocalDateAndTime('2026-11-25', '09:00'),
      duration: 30,
      status: 'scheduled',
      is_deleted: false,
    },
    {
      id: 't-cancelled',
      name: 'Cancelled Slot',
      scheduledAt: combineLocalDateAndTime('2026-11-25', '10:00'),
      duration: 60,
      status: 'cancelled',
      is_deleted: false,
    },
    {
      id: 't-deleted',
      name: 'Deleted Slot',
      scheduledAt: combineLocalDateAndTime('2026-11-25', '11:00'),
      duration: 60,
      status: 'scheduled',
      is_deleted: true,
    },
  ]

  // Overlapping 09:15 (during 09:00-09:30) conflicts with active task
  const hit = findOverlappingScheduledTask(existing, {
    scheduledAtIso: combineLocalDateAndTime('2026-11-25', '09:15'),
    durationMinutes: 30,
  })
  assert.equal(hit?.id, 't-active')

  // Adjacent 09:30 (right after 09:00-09:30) does not overlap
  assert.equal(findOverlappingScheduledTask(existing, {
    scheduledAtIso: combineLocalDateAndTime('2026-11-25', '09:30'),
    durationMinutes: 30,
  }), null)

  // Cancelled & deleted slots do not block scheduling
  assert.equal(findOverlappingScheduledTask(existing, {
    scheduledAtIso: combineLocalDateAndTime('2026-11-25', '10:15'),
    durationMinutes: 30,
  }), null)
  assert.equal(findOverlappingScheduledTask(existing, {
    scheduledAtIso: combineLocalDateAndTime('2026-11-25', '11:15'),
    durationMinutes: 30,
  }), null)
})

test('focus outbox defers session linked to unsynced task until task sync completes without dropping on 404', async () => {
  const store = new Map()
  const nowMs = new Date(2026, 10, 25, 9, 0, 0).getTime()
  const pendingTasks = new Set(['task-offline'])
  const attempts = []

  const controller = createFocusController({
    storage: {
      get: key => store.get(key),
      set: (key, value) => store.set(key, value),
    },
    getScope: () => 'user-a:dev-1',
    getLoginGeneration: () => Symbol.for('gen-a'),
    canSyncSession: () => true,
    now: () => nowMs,
    createId: () => 'session-gen',
    hasPendingTaskSync: taskId => pendingTasks.has(taskId),
    recordSession: async (cmd) => {
      attempts.push(cmd.clientSessionId)
      if (cmd.taskId && pendingTasks.has(cmd.taskId)) {
        throw new ApiProblemError({ title: 'Not Found', status: 404, detail: 'Task missing', fieldErrors: [] })
      }
    },
  })

  store.set('auralis:local:user-a:dev-1:focus_outbox', [
    {
      clientSessionId: 's-offline-task',
      taskId: 'task-offline',
      startedAt: new Date(nowMs).toISOString(),
      endedAt: new Date(nowMs + 1_500_000).toISOString(),
      durationSeconds: 1500,
      completed: true,
    },
    {
      clientSessionId: 's-independent',
      startedAt: new Date(nowMs).toISOString(),
      endedAt: new Date(nowMs + 900_000).toISOString(),
      durationSeconds: 900,
      completed: true,
    },
  ])

  const firstPass = await controller.flushOutbox()
  assert.equal(firstPass, 1)
  assert.deepEqual(attempts, ['s-independent'])
  assert.deepEqual(controller.readOutbox().map(item => item.clientSessionId), ['s-offline-task'])

  pendingTasks.delete('task-offline')
  const secondPass = await controller.flushOutbox()
  assert.equal(secondPass, 1)
  assert.equal(controller.readOutbox().length, 0)
})
