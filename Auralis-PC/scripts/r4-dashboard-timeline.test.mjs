import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { computed, defineComponent, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

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
  assert.match(dashboard, /selectedTimelineDay\.monthLabel/)
  assert.match(dashboard, /db-day-week/)
  assert.match(dashboard, /day\.weekdayShort/)
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
  assert.match(taskStore, /durationMinutes:\s*input\.durationMinutes\s*\?\?\s*input\.duration\s*\?\?\s*30/, 'useTaskStore default must be 30')
  assert.match(timeline, /duration:\s*taskData\.duration\s*\|\|\s*60/, 'Timeline creation fallback must be 60')
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
  assert.match(dashboard, /title:\s*['"]移出日程失败['"]/)
})

test('dashboard binds task checkboxes and toggles completion safely', () => {
  assert.match(dashboard, /:checked="isCompletedScheduledTask\(task\)"/)
  assert.match(dashboard, /:disabled="isScheduledCompletionLocked\(task, taskStore\.currentNow\)"/)
  assert.match(dashboard, /任务时段已结束，完成状态不可取消/)
  assert.match(dashboard, /\.scheduled-task-content\.is-completion-locked\s*\{\s*cursor:\s*not-allowed/)
  assert.doesNotMatch(dashboard, /class="todo-item"[\s\S]*?<input[^>]*type="checkbox"/)
  assert.match(dashboard, /const toggleTaskCompletion = async \(task: Task\) =>/)
  assert.match(dashboard, /await taskStore\.updateTaskStatus\(task\.id, newStatus\)/)
  assert.match(dashboard, /title:\s*['"]更新任务状态失败['"]/)
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
  assert.equal(writes[1].payload.name, 'Review notes')
  writes[1].resolve()
  await submissions[1]
  assert.equal(page.taskDialogVisible.value, false)
})

test('Timeline delete captures the confirmed task and reports only actual save failures', async (t) => {
  const confirmations = []
  const deletes = []
  let onDeleteStarted
  const deleteStarted = new Promise((resolve) => { onDeleteStarted = resolve })
  const { page, notifications } = await setupTimeline(t, {
    deleteTask: (id) => new Promise((resolve, reject) => {
      deletes.push({ id, reject })
      onDeleteStarted()
    }),
  }, () => new Promise((resolve, reject) => confirmations.push({ resolve, reject })))

  const task = { id: 'original', name: 'Review notes' }
  const cancelled = page.handleDeleteTask(task)
  confirmations[0].reject('close')
  await cancelled
  assert.equal(deletes.length, 0)
  assert.equal(notifications.length, 0)

  const failed = page.handleDeleteTask(task)
  await page.handleDeleteTask({ id: 'other', name: 'Other task' })
  assert.equal(confirmations.length, 2)
  task.id = 'changed'
  task.name = 'Changed name'
  confirmations[1].resolve()
  await deleteStarted
  assert.equal(deletes[0].id, 'original')
  assert.equal(notifications.length, 0)
  deletes[0].reject(new Error('local delete failed'))
  await failed
  assert.equal(notifications.at(-1).message, 'local delete failed')
  assert.equal(page.deletingTaskId.value, null)
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

async function setupTimeline(t, storeOverrides, confirm = assert.fail) {
  const scope = effectScope()
  t.after(() => scope.stop())
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
