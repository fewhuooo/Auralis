import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { computed, defineComponent, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { locale, t } from '../src/i18n.ts'

const dashboard = await readFile(new URL('../src/views/Dashboard/index.vue', import.meta.url), 'utf8')
const timeline = await readFile(new URL('../src/views/Timeline/index.vue', import.meta.url), 'utf8')
const taskDialog = await readFile(new URL('../src/components/task/TaskCreateDialog.vue', import.meta.url), 'utf8')
const taskSchedulePlanner = await readFile(new URL('../src/services/taskSchedulePlanner.ts', import.meta.url), 'utf8')
const taskStore = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
const globalStyles = await readFile(new URL('../src/styles/index.css', import.meta.url), 'utf8')
const pomodoroRing = await readFile(new URL('../src/components/pomodoro/PomodoroRing.vue', import.meta.url), 'utf8')
const timerCore = await readFile(new URL('../src/components/pomodoro/TimerCore.vue', import.meta.url), 'utf8')
const knowledgeGraph = await readFile(new URL('../src/components/subject/KnowledgeGraph.vue', import.meta.url), 'utf8')

test('dashboard uses a bounded grid and shared timeline window', () => {
  assert.match(dashboard, /display:\s*grid/)
  assert.match(dashboard, /getTasksForTimeline\(allTasks\.value\)/)
  assert.match(dashboard, /getTimelineDays/)
  assert.match(dashboard, /day\.dateKey/)
  assert.doesNotMatch(dashboard, /getTasksForTimeline\(allTasks\.value,\s*selectedDay\.value\)/)
  assert.doesNotMatch(dashboard, /timeline-import-btn|focus=unassigned-tasks/)
})

test('timeline keeps the pending task queue and imports unassigned tasks', () => {
  assert.match(timeline, /\[\.\.\.pendingTasks\.value\]\.sort\(comparePendingTasks\)/)
  assert.match(timeline, /getTimelineDays/)
  assert.match(timeline, /day\.dateKey/)
  assert.match(timeline, /router\.push\(['"`]\/asset\?focus=unassigned-tasks['"`]\)/)
})

test('timeline renders half-hour scheduled tasks and marks past tasks without removing them', () => {
  assert.match(taskSchedulePlanner, /TIMELINE_SLOT_MINUTES\s*=\s*30/, 'Task time slots must include half-hour boundaries')
  assert.match(taskStore, /timelineSlotTimeForScheduledAt/, 'Day timeline must normalize scheduledAt to a visible time slot')
  assert.match(taskStore, /timeForScheduledAt\(value\)/, 'Day timeline must derive the task start time from scheduledAt')
  assert.match(timeline, /isPastTask/, 'Timeline must identify tasks whose scheduledAt is in the past')
  assert.match(timeline, /is-past/, 'Timeline must keep past tasks rendered with a dedicated style')
  assert.match(timeline, /text-decoration:\s*line-through/, 'Past task text must be crossed out')
})

test('timeline uses half-hour geometry', () => {
  assert.match(timeline, /const\s+TIMELINE_SLOT_HEIGHT\s*=\s*80/)
  assert.match(timeline, /slots\s*\*\s*TIMELINE_SLOT_HEIGHT\s*\+\s*\(slots\s*-\s*1\)\s*\*\s*TIMELINE_SLOT_GAP/)
  assert.match(timeline, /min-height:\s*80px/)
  // Dashboard is simplified to linear task list without slot heights or drag-to-reschedule
  assert.doesNotMatch(dashboard, /const\s+TIMELINE_SLOT_HEIGHT/)
  assert.doesNotMatch(dashboard, /handleDragStart/)
  assert.match(dashboard, /dayScheduledTasks/)
})

test('completed scheduled cards are never draggable in either Timeline view', () => {
  assert.match(timeline, /:draggable="!isCompletedScheduledTask\(slot\.task\)"/)
  assert.match(timeline, /:draggable="!isCompletedScheduledTask\(task\)"/)
  // Dashboard uses non-draggable linear list
  assert.doesNotMatch(dashboard, /:draggable/)
})

test('the desktop shell does not surface an overdue-task notice', async () => {
  const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /overdue-modal/)
  assert.doesNotMatch(app, /overdueNotice/)
  assert.doesNotMatch(app, /已逾期/)
})

test('dashboard keeps grid cells date-only and moves full day information to the header', () => {
  assert.match(dashboard, /db-day-date/)
  assert.match(dashboard, /formatTimelineDate\(selectedTimelineDay, \{ month: 'long' \}\)/)
  assert.match(dashboard, /db-day-week/)
  assert.match(dashboard, /formatTimelineDate\(day, \{ weekday: 'short' \}\)/)
  assert.doesNotMatch(dashboard, /day\.isToday \? '今天'/)
})

test('dashboard keeps task names visible when the subject label is long', () => {
  assert.match(dashboard, /\.todo-name[\s\S]*?min-width:\s*0/)
  assert.match(dashboard, /\.todo-subject[\s\S]*?flex:\s*0\s+1\s+auto/)
  assert.match(dashboard, /\.todo-subject[\s\S]*?max-width:/)
  assert.match(dashboard, /\.todo-subject[\s\S]*?text-overflow:\s*ellipsis/)
})

test('pc typography uses the shared font stack and semantic size tokens', () => {
  assert.match(globalStyles, /html\s*\{\s*font-size:\s*16px/)
  assert.match(globalStyles, /--font-family-base:/)
  assert.match(globalStyles, /--font-size-caption:/)
  assert.match(globalStyles, /--font-size-body-sm:/)
  assert.match(globalStyles, /--font-size-body:/)
  assert.match(globalStyles, /--font-size-title:/)
  assert.doesNotMatch(pomodoroRing, /font-family:\s*['"]Inter['"]/) 
  assert.doesNotMatch(timerCore, /font-family:\s*['"](?:Outfit|Plus Jakarta Sans)['"]/) 
  assert.doesNotMatch(knowledgeGraph, /font-family:\s*['"]JetBrains Mono['"]/) 
})

test('production default durations are multiples of 30 minutes', () => {
  assert.match(taskStore, /durationMinutes:\s*input\.durationMinutes\s*\?\?\s*30/, 'useTaskStore default must be 30')
  assert.match(timeline, /durationMinutes:\s*taskData\.duration\s*\|\|\s*60/, 'Timeline creation fallback must be 60')
  // assert.match(timeline, /duration:\\s*30,/)
})

test('schedule pages do not expose visible load badges or indicators', () => {
  assert.doesNotMatch(timeline, /<span[^>]*class="[^"]*load-indicator[^"]*"[^>]*>/, 'Timeline must not render load indicator badges')
  assert.doesNotMatch(dashboard, /<span[^>]*class="[^"]*load-indicator[^"]*"[^>]*>/, 'Dashboard must not render load indicator badges')
})

test('timeline keeps the local task projection when changing days and refreshing remotely', () => {
  const fetchTasksSource = taskStore.slice(taskStore.indexOf('async function fetchTasks()'), taskStore.indexOf('function replaceInMemory('))
  const loadLocalTasksSource = taskStore.slice(taskStore.indexOf('async function loadLocalTasks()'), taskStore.indexOf('async function cache('))
  const dashboardSelectDaySource = dashboard.slice(dashboard.indexOf('const selectDay'), dashboard.indexOf('const getScheduledTasksForDay'))

  assert.match(taskStore, /authStore\.serverDeviceId/, 'Task repository scope must use the canonical authenticated device id')
  assert.match(fetchTasksSource, /await loadLocalTasks\(\)/, 'Task loading must hydrate the local projection first')
  assert.match(fetchTasksSource, /requestBackgroundSync\('read'\)/, 'Cloud refresh must continue in the background')
  assert.doesNotMatch(fetchTasksSource, /return await loadFromApi\(\)/, 'Cloud refresh must not block the local task projection')
  assert.doesNotMatch(loadLocalTasksSource, /allTasks\.value\s*=\s*\[\]/, 'A local-read failure must preserve an already visible task projection')
  assert.match(dashboardSelectDaySource, /taskStore\.setSelectedDay\(day\)/, 'Dashboard must use the same day-selection path')
  assert.doesNotMatch(dashboardSelectDaySource, /loadLocalTasks/, 'Dashboard day selection must not clear in-memory tasks after a local read failure')
})

test('dashboard removes tasks from schedule by exact task ID and notifies on failure', () => {
  assert.match(dashboard, /await taskStore\.unscheduleTask\(task\.id\)/)
  assert.doesNotMatch(dashboard, /await taskStore\.unscheduleTask\(slotTime\)/)
  assert.match(dashboard, /title:\s*t\(\{\s*'zh-CN': '移出日程失败'/)
})

test('dashboard restores the scheduled checkbox from the task projection after a failed write', async (t) => {
  assert.match(dashboard, /:checked="isCompletedScheduledTask\(task\)"/)
  assert.match(dashboard, /@change="toggleTaskCompletion\(task, \$event\)"/)
  assert.match(dashboard, /任务时段已结束，完成状态不可取消/)
  assert.match(dashboard, /\.scheduled-task-content\.is-completion-locked\s*\{\s*cursor:\s*not-allowed/)
  assert.doesNotMatch(dashboard, /class="todo-item"[\s\S]*?<input[^>]*type="checkbox"/)

  const task = { id: 'scheduled', status: 'scheduled', scheduledAt: '2026-11-13T11:00:00Z', durationMinutes: 30 }
  const writes = []
  const { page, store, notifications } = await setupDashboard(t, {
    allTasks: ref([task]),
    updateTaskStatus: (id, status) => new Promise((resolve, reject) => writes.push({ id, status, resolve, reject })),
  })
  const checkbox = { checked: true }
  const change = { currentTarget: checkbox }
  const write = page.toggleTaskCompletion(task, change)
  change.currentTarget = null
  await page.toggleTaskCompletion(task)
  assert.deepEqual(writes.map(({ id, status }) => [id, status]), [[task.id, 'completed']])
  writes[0].reject(new Error('local write failed'))
  await write
  assert.equal(checkbox.checked, false)
  assert.equal(notifications.at(-1).message, 'local write failed')

  checkbox.checked = true
  const retry = page.toggleTaskCompletion(task, { currentTarget: checkbox })
  assert.equal(writes.length, 2)
  store.allTasks = [{ ...task, status: 'completed' }]
  writes[1].reject(new Error('projection changed during the write'))
  await retry
  assert.equal(checkbox.checked, true)

  store.currentNow = new Date('2026-11-13T12:00:00Z')
  checkbox.checked = false
  await page.toggleTaskCompletion(task, { currentTarget: checkbox })
  assert.equal(checkbox.checked, true)
  assert.equal(writes.length, 2)
})

test('dashboard quick creation saves once per attempt and keeps a failed draft open for retry', async (t) => {
  const writes = []
  const { page, notifications, setup } = await setupDashboard(t, {
    addTask: (payload) => new Promise((resolve, reject) => writes.push({ payload, resolve, reject })),
  })
  const dialogSource = await readFile(new URL('../src/components/task/TaskCreateDialog.vue', import.meta.url), 'utf8')
  assert.match(dashboard, /:saving="isCreatingTask"\s+@submit="handleAddTask"/)
  assert.match(dialogSource, /@keyup\.enter="handleSubmit"/)
  assert.match(dialogSource, /:disabled="!isSubmitEnabled"\s+@click="handleSubmit"/)

  page.openCreateTaskDialog()
  const submissions = []
  const dialog = setup(dialogSource, {
    get modelValue() { return page.showTaskModal.value },
    get saving() { return page.isCreatingTask.value },
    defaultDuration: 60,
    fixedSubjectId: 'study',
    fixedSubjectName: 'Study',
  }, (event, data) => {
    assert.equal(event, 'submit')
    submissions.push(page.handleAddTask(data))
  })
  dialog.form.name = 'Review the notes'
  dialog.handleSubmit()
  void page.handleAddTask({ name: 'Duplicate' })
  dialog.handleSubmit()
  assert.equal(submissions.length, 1)
  assert.equal(writes.length, 1)
  assert.equal(dialog.isSubmitEnabled.value, false)

  writes[0].reject(new Error('local create failed'))
  await submissions[0]
  assert.equal(page.showTaskModal.value, true)
  assert.equal(dialog.form.name, 'Review the notes')
  assert.equal(dialog.isSubmitEnabled.value, true)
  assert.equal(notifications.at(-1).type, 'error')
  assert.equal(notifications.at(-1).message, 'local create failed')

  dialog.handleSubmit()
  assert.equal(writes.length, 2)
  assert.equal(writes[1].payload.title, 'Review the notes')
  writes[1].resolve('created')
  await submissions[1]
  assert.equal(page.showTaskModal.value, false)
  assert.equal(notifications.at(-1).type, 'success')
})

test('isCompletedTask and isCompletedScheduledTask recognize both presentation and canonical completed statuses', async () => {
  const { isCompletedTask, isCompletedScheduledTask, isSchedulableTask, isScheduledTaskPast } = await import('../src/services/taskViewRules.ts')
  assert.equal(isCompletedTask({ status: 'completed' }), true)
  assert.equal(isCompletedTask({ status: 'DONE' }), true)
  assert.equal(isCompletedTask({ status: 'pending' }), false)
  assert.equal(isCompletedTask({ status: 'TODO' }), false)

  assert.equal(isCompletedScheduledTask({ status: 'completed', scheduledAt: '2026-09-24T00:00:00Z' }), true)
  assert.equal(isCompletedScheduledTask({ status: 'DONE', scheduledAt: '2026-09-24T00:00:00Z' }), true)
  assert.equal(isCompletedScheduledTask({ status: 'completed', scheduledAt: undefined }), false)
  assert.equal(isCompletedScheduledTask({ status: 'DONE', scheduledAt: undefined }), false)
  assert.equal(isCompletedScheduledTask({ status: 'scheduled', scheduledAt: '2026-09-24T00:00:00Z' }), false)

  // DONE status must not be treated as schedulable or actionable overdue task
  assert.equal(isSchedulableTask({ status: 'DONE' }), false)
  assert.equal(isSchedulableTask({ status: 'completed' }), false)
  assert.equal(isSchedulableTask({ status: 'pending' }), true)
  assert.equal(isScheduledTaskPast({ status: 'DONE', scheduledAt: '2026-09-20T00:00:00Z', durationMinutes: 30 }), false)
  assert.equal(isScheduledTaskPast({ status: 'completed', scheduledAt: '2026-09-20T00:00:00Z', durationMinutes: 30 }), false)
})

test('task store metrics and offline persistence protect completed tasks from past-schedule assertion', () => {
  assert.match(taskStore, /const completedCount = computed\(\(\) => allTasks\.value\.filter\(\(task\) => isCompletedTask\(task\)\)\.length\)/)
  assert.match(taskStore, /allTasks\.value\.filter\(\(task\) => isCompletedTask\(task\)\)\.reduce/)
  assert.match(taskStore, /model\.status !== 'CANCELLED' && model\.status !== 'DONE'/)
  assert.match(dashboard, /\.todo-item\.is-completed/)
})

test('Timeline clears a cancelled or completed native drag and ignores external drops', async (t) => {
  const calls = []
  const { page } = await setupTimeline(t, {
    applyTimelineDrop: async (intent) => { calls.push(intent) },
  })
  const { content: template } = parse(timeline).descriptor.template
  assert.equal((template.match(/@dragstart\.stop=/g) ?? []).length, 4)
  assert.equal((template.match(/@dragend\.stop="clearDragState"/g) ?? []).length, 4)
  assert.match(template, /@drop="handleDrop\(\$event, \{ type: 'week', dateKey: day\.dateKey \}\)"/)

  const task = { id: 'task', status: 'pending' }
  const target = { type: 'week', dateKey: '2026-11-14' }
  const nativeDrag = dragEvent()
  page.handleDragStart(nativeDrag, task)
  page.handleDragOver(nativeDrag, target)
  assert.deepEqual(page.dragOverTarget.value, target)
  page.clearDragState()
  assert.equal(page.dragSession.value, null)
  assert.equal(page.dragOverTarget.value, null)
  await page.handleDrop(dragEvent(), target)
  assert.equal(calls.length, 0)

  page.handleDragStart(nativeDrag, task)
  await page.handleDrop(dragEvent(), target)
  assert.equal(calls.length, 0)
  assert.equal(page.dragSession.value, null)

  const sourceStart = new Date(2026, 10, 13, 10, 15).toISOString()
  page.handleDragStart(nativeDrag, { ...task, scheduledAt: sourceStart })
  await page.handleDrop(nativeDrag, { ...target, dateKey: '2026-11-13' })
  assert.equal(calls.length, 0)
  page.handleDragStart(nativeDrag, { ...task, scheduledAt: sourceStart })
  await page.handleDrop(nativeDrag, target)
  assert.deepEqual({ ...calls[0] }, { ...target, taskId: task.id, sourceScheduledAt: sourceStart })
  assert.equal(page.dragSession.value, null)

  page.handleDragStart(nativeDrag, { ...task, scheduledAt: sourceStart })
  await page.handleDrop(nativeDrag, { type: 'unschedule', dateKey: '2026-11-14' })
  assert.deepEqual({ ...calls[1] }, {
    type: 'unschedule',
    dateKey: '2026-11-13',
    taskId: task.id,
    sourceScheduledAt: sourceStart,
  })
})

test('Timeline explains why dropping onto the preceding card body keeps the current slot', async (t) => {
  const { page } = await setupTimeline(t, {
    previewTimelineDrop: () => ({}),
  })
  const task = { id: 'task', status: 'scheduled', scheduledAt: new Date(2026, 10, 14, 10, 30).toISOString() }
  const nativeDrag = dragEvent()
  page.handleDragStart(nativeDrag, task, '10:30')
  page.handleDragOver(nativeDrag, { type: 'body', targetTaskId: 'preceding', dateKey: '2026-11-14' })
  assert.equal(page.bodyDropHint.value, '已在目标时段')
})

test('Timeline new task accepts one write and retains a failed draft for retry', async (t) => {
  const writes = []
  const { page, notifications, setup } = await setupTimeline(t, {
    addTask: (payload) => new Promise((resolve, reject) => writes.push({ payload, resolve, reject })),
  })
  assert.match(timeline, /:saving="isCreatingTask"\s+@submit="handleCreateTask"/)
  const submissions = []
  const dialog = setup(taskDialog, {
    get modelValue() { return page.taskDialogVisible.value },
    get saving() { return page.isCreatingTask.value },
    defaultDuration: 60,
    fixedSubjectId: 'subject',
    fixedSubjectName: 'Study',
  }, (event, payload) => {
    assert.equal(event, 'submit')
    submissions.push(page.handleCreateTask(payload))
  })
  page.triggerCreate()
  await nextTick()
  dialog.form.name = 'Review notes'
  dialog.handleSubmit()
  dialog.handleSubmit()
  void page.handleCreateTask({ name: 'Duplicate' })
  assert.equal(writes.length, 1)
  assert.equal(dialog.isSubmitEnabled.value, false)
  dialog.handleClose()
  assert.equal(page.taskDialogVisible.value, true)

  writes[0].reject(new Error('local write failed'))
  await submissions[0]
  assert.equal(notifications.at(-1).message, 'local write failed')
  assert.equal(dialog.form.name, 'Review notes')
  assert.equal(page.taskDialogVisible.value, true)
  assert.equal(dialog.isSubmitEnabled.value, true)

  dialog.handleSubmit()
  assert.equal(writes[1].payload.title, 'Review notes')
  writes[1].resolve()
  await submissions[1]
  assert.equal(page.taskDialogVisible.value, false)
})

test('Timeline move-to-pending uses unscheduling, blocks duplicate clicks and keeps failures visible', async (t) => {
  const writes = []
  const { page, notifications } = await setupTimeline(t, {
    unscheduleTask: (id) => new Promise((resolve, reject) => writes.push({ id, resolve, reject })),
    deleteTask: () => assert.fail('Moving to pending must preserve the task'),
  })
  const { content: template } = parse(timeline).descriptor.template
  assert.equal((template.match(/@click\.stop="handleUnscheduleTask\(/g) ?? []).length, 2)
  const task = { id: 'original', status: 'scheduled', scheduledAt: '2026-11-14T09:00:00Z' }
  await page.handleUnscheduleTask({ ...task, status: 'completed' })
  assert.equal(writes.length, 0)
  const failed = page.handleUnscheduleTask(task)
  await page.handleUnscheduleTask(task)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].id, 'original')
  writes[0].reject(new Error('local schedule failed'))
  await failed
  assert.equal(notifications.at(-1).message, 'local schedule failed')
  assert.equal(page.unschedulingTaskId.value, null)
  const retried = page.handleUnscheduleTask(task)
  writes[1].resolve()
  await retried
  assert.equal(page.unschedulingTaskId.value, null)
})

function dragEvent() {
  const data = new Map()
  return {
    preventDefault() {},
    dataTransfer: {
      get types() { return [...data.keys()] },
      setData: (type, value) => data.set(type, value),
      getData: (type) => data.get(type) ?? '',
    },
  }
}

async function setupTimeline(testContext, storeOverrides, confirm = assert.fail) {
  const scope = effectScope()
  testContext.after(() => scope.stop())
  const notifications = []
  const store = reactive({
    allTasks: ref([]),
    completedCount: ref(0),
    currentNow: new Date(2026, 10, 13),
    pendingCount: ref(0),
    pendingTasks: ref([]),
    selectedDay: ref('Fri'),
    timeSlots: ref([]),
    totalFocusHours: ref('0.0h'),
    ...storeOverrides,
  })
  const modules = {
    vue: { computed, defineComponent, nextTick, reactive, ref, watch, onMounted() {}, onUnmounted() {} },
    'vue-router': { useRouter: () => ({}) },
    pinia: { storeToRefs },
    '@/i18n': { locale, t },
    'element-plus': { ElNotification: (notification) => notifications.push(notification), ElMessageBox: { confirm } },
    '@/store/useKnowledgeStore': { useKnowledgeStore: () => reactive({ recentBlocks: ref([]) }) },
    '@/store/useSubjectStore': { useSubjectStore: () => ({ subjects: [] }) },
    '@/store/useSyncStore': { useSyncStore: () => ({ scheduleSyncErrors: [] }) },
    '@/store/useTaskStore': { useTaskStore: () => store },
    '@/services/taskViewRules': await import('../src/services/taskViewRules.ts'),
  }
  const load = (content) => {
    const { outputText } = ts.transpileModule(content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    const exports = {}
    runInNewContext(outputText, { exports, Error, require: (name) => modules[name] ?? {} })
    return exports
  }
  modules['@/services/taskSchedulePlanner'] = load(taskSchedulePlanner)
  const setup = (source, props = {}, emit = assert.fail) => scope.run(() => {
    const { content } = compileScript(parse(source).descriptor, { id: 'timeline-task-test' })
    return load(content).default.setup(props, { expose() {}, emit })
  })
  return { page: setup(timeline), notifications, setup }
}

async function setupDashboard(testContext, storeOverrides) {
  const taskViewRules = await import('../src/services/taskViewRules.ts')
  const scope = effectScope()
  testContext.after(() => scope.stop())
  const notifications = []
  const store = reactive({
    allTasks: ref([]),
    currentNow: new Date('2026-11-13T10:00:00Z'),
    pendingTasks: ref([]),
    selectedDay: ref('Fri'),
    ...storeOverrides,
  })
  const modules = {
    vue: { computed, defineComponent, nextTick, reactive, ref, watch, onActivated() {}, onMounted() {}, onUnmounted() {} },
    'vue-router': { useRouter: () => ({}), useRoute: () => ({ path: '/', query: {} }) },
    pinia: { storeToRefs },
    '@/i18n': { locale, t },
    'element-plus': { ElNotification: (notification) => notifications.push(notification) },
    '@/store/useKnowledgeStore': { useKnowledgeStore: () => reactive({ recentBlocks: ref([]) }) },
    '@/store/useAuthStore': { useAuthStore: () => ({ username: 'Student' }) },
    '@/store/useSubjectStore': { useSubjectStore: () => ({ subjects: [] }) },
    '@/store/useTaskStore': { useTaskStore: () => store },
    '@/services/taskViewRules': taskViewRules,
  }
  const setup = (source, props = {}, emit = assert.fail) => scope.run(() => {
    const { content } = compileScript(parse(source).descriptor, { id: 'dashboard-task-test' })
    const { outputText } = ts.transpileModule(content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    const exports = {}
    runInNewContext(outputText, { exports, Error, console: { error() {} }, require: (name) => modules[name] ?? {} })
    return exports.default.setup(props, { expose() {}, emit })
  })
  return { page: setup(dashboard), store, notifications, setup }
}
