<template>
  <AppPageLayout>
    <view class="home-page">
      <view class="status-bar-spacer"></view>

      <view class="top-bar">
        <view class="top-left">
          <text class="date-heading">{{ selectedDateHeading }}</text>
          <view v-if="selectedDateKey !== todayKey" class="today-pill" @click="jumpToToday">
            <text>今天</text>
          </view>
          <view v-if="syncStore.isSyncing" class="sync-dot"></view>
        </view>
        <view class="add-fab" @click="openCaptureSheet('task')">
          <LineIcon name="plus" size="18px" color="#FFFFFF" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="home-scroll">
        <view class="home-content">
          <view class="week-card zen-card">
            <view class="week-nav-row">
              <view class="week-arrow" @click="shiftWeek(-7)">
                <LineIcon name="chevron-left" size="15px" color="var(--text-muted)" />
              </view>
              <text class="week-range-label num-tabular">{{ weekRangeLabel }}</text>
              <view class="week-arrow" @click="shiftWeek(7)">
                <LineIcon name="chevron-right" size="15px" color="var(--text-muted)" />
              </view>
            </view>

            <view class="week-strip">
              <view
                v-for="day in weekDays"
                :key="day.dateKey"
                class="w-day"
                :class="{
                  active: selectedDateKey === day.dateKey,
                  'is-today': day.isToday,
                }"
                @click="selectedDateKey = day.dateKey"
              >
                <text class="w-week">{{ day.weekdayLabel }}</text>
                <text class="w-num num-tabular">{{ day.dayNumber }}</text>
                <view class="w-dot" :class="{ visible: hasScheduledOnDate(day.dateKey) }"></view>
              </view>
            </view>
          </view>

          <view class="section-block">
            <view class="section-header">
              <text class="section-title">日程</text>
              <text class="section-count num-tabular">{{ scheduledForSelectedDay.length }}</text>
            </view>

            <view v-if="scheduledForSelectedDay.length === 0" class="empty-slot">
              <text class="empty-label">暂无日程</text>
            </view>

            <view v-else class="card-list">
              <view
                v-for="item in scheduledForSelectedDay"
                :key="item.id"
                class="task-card zen-card"
                :class="{ 'is-completed': item.status === 'completed' }"
              >
                <view
                  class="check-circle"
                  :class="{
                    checked: item.status === 'completed',
                    locked: item.id ? taskStore.updatingTaskIds.includes(item.id) : false,
                  }"
                  @click="item.id && toggleComplete(item.id)"
                >
                  <LineIcon v-if="item.status === 'completed'" name="check" size="12px" color="#FFFFFF" />
                </view>

                <view class="task-main" @click="item.id && toggleComplete(item.id)">
                  <text class="task-title" :class="{ strike: item.status === 'completed' }">{{ item.name }}</text>
                  <view class="task-meta-row">
                    <text class="task-time num-tabular">{{ formatLocalTimeHHmm(item.scheduledAt) || '全天' }}</text>
                    <text v-if="item.subject" class="ui-tag">{{ item.subject }}</text>
                    <text v-if="item.dueAt" class="task-ddl num-tabular">截止 {{ formatShortDate(item.dueAt) }}</text>
                  </view>
                </view>

                <view class="task-actions">
                  <text class="dur-badge num-tabular">{{ item.duration || 30 }}m</text>
                  <view
                    v-if="item.id && item.status !== 'completed'"
                    class="row-icon-action"
                    @click.stop="unschedule(item.id)"
                  >
                    <LineIcon name="close" size="14px" color="var(--text-muted)" />
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view class="section-block">
            <view class="section-header">
              <text class="section-title">待办</text>
              <text class="section-count num-tabular">{{ taskStore.pendingTasks.length }}</text>
            </view>

            <view v-if="taskStore.pendingTasks.length === 0" class="empty-slot">
              <text class="empty-label">暂无待办</text>
            </view>

            <view v-else class="card-list">
              <view v-for="todo in taskStore.pendingTasks" :key="todo.id" class="task-card zen-card">
                <view
                  class="check-circle"
                  :class="{ locked: todo.id ? taskStore.updatingTaskIds.includes(todo.id) : false }"
                  @click="todo.id && toggleComplete(todo.id)"
                ></view>

                <view class="task-main" @click="todo.id && toggleComplete(todo.id)">
                  <text class="task-title">{{ todo.name }}</text>
                  <view v-if="todo.subject || todo.dueAt" class="task-meta-row">
                    <text v-if="todo.subject" class="ui-tag">{{ todo.subject }}</text>
                    <text v-if="todo.dueAt" class="task-ddl num-tabular">截止 {{ formatShortDate(todo.dueAt) }}</text>
                  </view>
                </view>

                <view class="task-actions">
                  <picker
                    v-if="todo.id"
                    mode="time"
                    value="09:00"
                    @change="onSchedulePending(todo.id, $event)"
                  >
                    <view class="schedule-pill">
                      <text>排入</text>
                    </view>
                  </picker>
                  <view v-if="todo.id" class="row-icon-action" @click="confirmDeleteTask(todo.id, todo.name)">
                    <LineIcon name="trash" size="14px" color="var(--text-muted)" />
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <view v-if="showCaptureSheet" class="zen-sheet-mask" @click="closeCaptureSheet">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <view class="ui-segmented mode-tabs">
              <view
                v-for="tab in captureTabs"
                :key="tab.id"
                class="ui-seg-item"
                :class="{ active: captureMode === tab.id }"
                @click="switchCaptureMode(tab.id)"
              >
                <text>{{ tab.label }}</text>
              </view>
            </view>
            <view class="ui-icon-btn" @click="closeCaptureSheet">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="subjectStore.subjects.length === 0" class="no-subject-tip">
            <text>请先创建学科后再添加</text>
          </view>

          <view v-if="captureMode === 'task'" class="form-stack">
            <input
              class="ui-input"
              v-model="taskForm.name"
              placeholder="任务名称"
              :disabled="submittingCapture"
            />

            <scroll-view scroll-x :show-scrollbar="false" class="chips-scroll">
              <view class="chips-row">
                <view
                  v-for="sub in subjectStore.subjects"
                  :key="sub.id"
                  class="chip-item"
                  :class="{ active: taskForm.subjectId === sub.id }"
                  @click="taskForm.subjectId = sub.id"
                >
                  <text>{{ sub.name }}</text>
                </view>
              </view>
            </scroll-view>

            <view class="chips-row">
              <view
                v-for="mins in [30, 60, 90, 120]"
                :key="mins"
                class="chip-item num-tabular"
                :class="{ active: taskForm.duration === mins }"
                @click="taskForm.duration = mins"
              >
                <text>{{ mins }}m</text>
              </view>
            </view>

            <view class="switch-row">
              <text class="field-label">排入 {{ selectedDateHeading }}</text>
              <switch :checked="taskForm.scheduled" color="#8B9A6E" @change="onTaskScheduledToggle" />
            </view>

            <view class="dual-pickers">
              <view v-if="taskForm.scheduled" class="picker-col">
                <picker mode="time" :value="taskForm.timeHHmm" @change="onTaskTimeChange">
                  <view class="picker-box num-tabular">{{ taskForm.timeHHmm }}</view>
                </picker>
              </view>
              <view class="picker-col">
                <picker mode="date" :value="taskForm.dueDateKey || selectedDateKey" @change="onTaskDueDateChange">
                  <view class="picker-box num-tabular">{{ taskForm.dueDateKey || '截止日期' }}</view>
                </picker>
              </view>
            </view>

            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitTask">
              保存任务
            </button>
          </view>

          <view v-else-if="captureMode === 'block'" class="form-stack">
            <scroll-view scroll-x :show-scrollbar="false" class="chips-scroll">
              <view class="chips-row">
                <view
                  v-for="sub in subjectStore.subjects"
                  :key="sub.id"
                  class="chip-item"
                  :class="{ active: blockForm.subjectId === sub.id }"
                  @click="blockForm.subjectId = sub.id"
                >
                  <text>{{ sub.name }}</text>
                </view>
              </view>
            </scroll-view>

            <input
              class="ui-input"
              v-model="blockForm.title"
              placeholder="标题"
              :disabled="submittingCapture"
            />

            <textarea
              class="ui-textarea"
              v-model="blockForm.content"
              placeholder="内容（Markdown）"
              :disabled="submittingCapture"
            />

            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitQuickBlock">
              保存知识块
            </button>
          </view>

          <view v-else class="form-stack">
            <scroll-view scroll-x :show-scrollbar="false" class="chips-scroll">
              <view class="chips-row">
                <view
                  v-for="sub in subjectStore.subjects"
                  :key="sub.id"
                  class="chip-item"
                  :class="{ active: uploadForm.subjectId === sub.id }"
                  @click="uploadForm.subjectId = sub.id"
                >
                  <text>{{ sub.name }}</text>
                </view>
              </view>
            </scroll-view>

            <view class="file-drop-box" @click="chooseFileToUpload">
              <LineIcon name="upload" size="22px" color="var(--color-sage-dark)" />
              <text class="file-drop-name">
                {{ uploadForm.file ? uploadForm.file.name : '选择本地文件' }}
              </text>
              <text v-if="uploadForm.file" class="file-drop-size num-tabular">
                {{ formatBytes(uploadForm.file.size) }}
              </text>
            </view>

            <input
              class="ui-input"
              v-model="uploadForm.title"
              placeholder="资料名称"
              :disabled="submittingCapture"
            />

            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitFileUpload">
              上传归档
            </button>
          </view>
        </view>
      </view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import type { LocalUploadFile } from '@/services/assetUpload'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import { useTaskStore } from '@/store/useTaskStore'
import {
  combineLocalDateAndTime,
  endOfLocalDateIso,
  formatDateHeading,
  formatLocalTimeHHmm,
  formatShortDate,
  getWeekDays,
  shiftDateKey,
  toLocalDateKey,
} from '@/utils/dateKey'
import { pickLocalDocument, uploadSubjectFile } from '@/utils/filePicker'
import { formatBytes } from '@/utils/sourceFormat'

const authStore = useAuthStore()
const taskStore = useTaskStore()
const subjectStore = useSubjectStore()
const blockStore = useBlockStore()
const syncStore = useSyncStore()

const todayKey = ref(toLocalDateKey(new Date()))
const selectedDateKey = ref(todayKey.value)
const weekDays = computed(() => getWeekDays(selectedDateKey.value, todayKey.value))
const selectedDateHeading = computed(() => formatDateHeading(selectedDateKey.value))
const weekRangeLabel = computed(() => {
  const days = weekDays.value
  return `${formatShortDate(days[0].dateKey)} – ${formatShortDate(days[6].dateKey)}`
})

const scheduledForSelectedDay = computed(() => taskStore.getScheduledTasksForDate(selectedDateKey.value))

function hasScheduledOnDate(dateKey: string): boolean {
  return taskStore.allTasks.some(task => !task.is_deleted && task.scheduledAt && toLocalDateKey(task.scheduledAt) === dateKey)
}

function shiftWeek(deltaDays: number) {
  selectedDateKey.value = shiftDateKey(selectedDateKey.value, deltaDays)
}

function jumpToToday() {
  todayKey.value = toLocalDateKey(new Date())
  selectedDateKey.value = todayKey.value
}

async function toggleComplete(id: string) {
  await taskStore.toggleTaskComplete(id)
}

async function unschedule(id: string) {
  await taskStore.unscheduleTask(id)
  uni.showToast({ title: '已移回待办', icon: 'none' })
}

async function onSchedulePending(taskId: string, event: { detail?: { value?: string } }) {
  const hhmm = event?.detail?.value
  if (!hhmm) return
  await taskStore.scheduleTask(taskId, combineLocalDateAndTime(selectedDateKey.value, hhmm))
  uni.showToast({ title: `已排入 ${hhmm}`, icon: 'none' })
}

function confirmDeleteTask(id: string, title: string) {
  uni.showModal({
    title: '删除待办',
    content: `确定要删除「${title}」吗？`,
    confirmColor: '#C93B3B',
    success: (res) => {
      if (res.confirm) void taskStore.removeTask(id)
    },
  })
}

type CaptureMode = 'task' | 'block' | 'upload'
const captureTabs: Array<{ id: CaptureMode; label: string }> = [
  { id: 'task', label: '任务' },
  { id: 'block', label: '知识块' },
  { id: 'upload', label: '文件' },
]

const showCaptureSheet = ref(false)
const captureMode = ref<CaptureMode>('task')
const submittingCapture = ref(false)

const taskForm = reactive({
  name: '',
  subjectId: '',
  duration: 60,
  scheduled: true,
  timeHHmm: '09:00',
  dueDateKey: '',
})

const blockForm = reactive({
  subjectId: '',
  title: '',
  content: '',
})

const uploadForm = reactive<{
  subjectId: string
  file: LocalUploadFile | null
  title: string
}>({
  subjectId: '',
  file: null,
  title: '',
})

function defaultSubjectId(): string {
  return subjectStore.subjects[0]?.id || ''
}

function openCaptureSheet(mode: CaptureMode) {
  captureMode.value = mode
  const fallbackSubId = defaultSubjectId()
  if (!taskForm.subjectId) taskForm.subjectId = fallbackSubId
  if (!blockForm.subjectId) blockForm.subjectId = fallbackSubId
  if (!uploadForm.subjectId) uploadForm.subjectId = fallbackSubId
  showCaptureSheet.value = true
}

function switchCaptureMode(mode: CaptureMode) {
  if (submittingCapture.value) return
  captureMode.value = mode
}

function closeCaptureSheet() {
  if (submittingCapture.value) return
  showCaptureSheet.value = false
}

function onTaskScheduledToggle(event: Event) {
  const detail = (event as Event & { detail?: { value?: boolean } }).detail
  taskForm.scheduled = Boolean(detail?.value)
}

function onTaskTimeChange(event: { detail?: { value?: string } }) {
  if (event?.detail?.value) taskForm.timeHHmm = event.detail.value
}

function onTaskDueDateChange(event: { detail?: { value?: string } }) {
  if (event?.detail?.value) taskForm.dueDateKey = event.detail.value
}

async function submitTask() {
  if (submittingCapture.value) return
  const title = taskForm.name.trim()
  if (!title) {
    uni.showToast({ title: '请输入任务名称', icon: 'none' })
    return
  }
  const subject = subjectStore.subjects.find(item => item.id === taskForm.subjectId)
  if (!subject) {
    uni.showToast({ title: '请选择学科', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  submittingCapture.value = true
  try {
    const scheduledAt = taskForm.scheduled
      ? combineLocalDateAndTime(selectedDateKey.value, taskForm.timeHHmm)
      : undefined
    const dueAt = taskForm.dueDateKey ? endOfLocalDateIso(taskForm.dueDateKey) : undefined
    await taskStore.addTask({
      name: title,
      subject: subject.name,
      subjectId: subject.id,
      duration: taskForm.duration,
      status: scheduledAt ? 'scheduled' : 'pending',
      scheduledAt,
      dueAt,
    })
    if (generation !== authStore.getLoginGeneration()) return
    taskForm.name = ''
    taskForm.dueDateKey = ''
    showCaptureSheet.value = false
    uni.showToast({ title: scheduledAt ? '已加入日程' : '已加入待办', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    submittingCapture.value = false
  }
}

async function submitQuickBlock() {
  if (submittingCapture.value) return
  const title = blockForm.title.trim()
  const content = blockForm.content.trim()
  const subject = subjectStore.subjects.find(item => item.id === blockForm.subjectId)
  if (!subject) {
    uni.showToast({ title: '请选择学科', icon: 'none' })
    return
  }
  if (!title || !content) {
    uni.showToast({ title: '请填写标题和内容', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  submittingCapture.value = true
  try {
    await blockStore.addBlock({
      subjectId: subject.id,
      subject: subject.name,
      title,
      preview: content,
      source: '手机速记',
      color: '#8B9A6E',
    })
    if (generation !== authStore.getLoginGeneration()) return
    blockForm.title = ''
    blockForm.content = ''
    showCaptureSheet.value = false
    uni.showToast({ title: '已保存知识块', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    submittingCapture.value = false
  }
}

async function chooseFileToUpload() {
  if (submittingCapture.value) return
  try {
    const file = await pickLocalDocument()
    if (!file) return
    uploadForm.file = file
    if (!uploadForm.title.trim()) uploadForm.title = file.name
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '选择失败', icon: 'none' })
  }
}

async function submitFileUpload() {
  if (submittingCapture.value) return
  const subject = subjectStore.subjects.find(item => item.id === uploadForm.subjectId)
  if (!subject) {
    uni.showToast({ title: '请选择学科', icon: 'none' })
    return
  }
  if (!uploadForm.file) {
    uni.showToast({ title: '请选择文件', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  submittingCapture.value = true
  try {
    await uploadSubjectFile({
      subjectId: subject.id,
      file: uploadForm.file,
      title: uploadForm.title,
    })
    if (generation !== authStore.getLoginGeneration()) return
    uploadForm.file = null
    uploadForm.title = ''
    showCaptureSheet.value = false
    uni.showToast({ title: `已归入「${subject.name}」`, icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '上传失败', icon: 'none' })
  } finally {
    submittingCapture.value = false
  }
}

onMounted(async () => {
  await subjectStore.loadSubjects()
  await taskStore.fetchTasks()
})
</script>

<style scoped>
.home-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
}

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  flex-shrink: 0;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 8px;
  gap: 12px;
  flex-shrink: 0;
}

.top-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.date-heading {
  font-size: 21px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.today-pill {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-zen-sage);
  animation: syncPulse 1.2s ease-in-out infinite;
}

@keyframes syncPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}

.add-fab {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--accent-glow);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.16s var(--ease-out);
}

.add-fab:active {
  transform: scale(0.92);
}

.home-scroll {
  flex: 1;
  min-height: 0;
}

.home-content {
  padding: 6px 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.week-card {
  padding: 12px 12px 14px;
}

.week-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 2px;
}

.week-arrow {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.week-range-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.w-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 0;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.14s ease;
}

.w-day:active {
  transform: scale(0.94);
}

.w-day.active {
  background: var(--accent-gradient);
  box-shadow: var(--accent-glow);
}

.w-week {
  font-size: 11px;
  color: var(--text-muted);
}

.w-num {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.w-day.is-today:not(.active) .w-num {
  color: var(--color-sage-dark);
}

.w-day.active .w-week,
.w-day.active .w-num {
  color: #FFFFFF;
}

.w-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--color-zen-sage);
  opacity: 0;
}

.w-dot.visible {
  opacity: 1;
}

.w-day.active .w-dot.visible {
  background-color: #FFFFFF;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px;
}

.section-title {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.section-count {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  color: var(--text-muted);
}

.empty-slot {
  height: 46px;
  border-radius: 14px;
  border: 1px dashed var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-card {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 16px;
}

.task-card.is-completed {
  opacity: 0.56;
}

.check-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.check-circle.checked {
  background-color: var(--color-zen-sage);
  border-color: var(--color-zen-sage);
}

.check-circle.locked {
  opacity: 0.4;
}

.task-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.task-title {
  font-size: 14.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  line-height: 1.35;
}

.task-title.strike {
  text-decoration: line-through;
  color: var(--text-muted);
}

.task-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.task-time {
  font-size: 11.5px;
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-mono);
  color: var(--color-sage-dark);
}

.task-ddl {
  font-size: 11px;
  color: var(--color-warning);
  font-weight: var(--font-weight-semibold);
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.dur-badge {
  font-size: 11px;
  font-family: var(--font-family-mono);
  color: var(--text-muted);
  background-color: var(--color-bg-primary);
  padding: 3px 8px;
  border-radius: 8px;
}

.schedule-pill {
  padding: 5px 11px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.row-icon-action {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* Capture Bottom Sheet */
.sheet-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.mode-tabs {
  flex: 1;
}

.no-subject-tip {
  padding: 10px 12px;
  border-radius: 10px;
  background-color: var(--color-warning-bg);
  color: #8A5D31;
  font-size: var(--font-size-xs);
  margin-bottom: 12px;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chips-scroll {
  width: 100%;
  white-space: nowrap;
}

.chips-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chips-scroll .chips-row {
  flex-wrap: nowrap;
}

.chip-item {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: 12.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  cursor: pointer;
}

.chip-item.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
}

.field-label {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.dual-pickers {
  display: flex;
  gap: 10px;
}

.picker-col {
  flex: 1;
}

.picker-box {
  height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.file-drop-box {
  padding: 20px 14px;
  border-radius: 14px;
  border: 1.5px dashed var(--border-accent);
  background-color: var(--color-sage-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  cursor: pointer;
}

.file-drop-name {
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  word-break: break-all;
}

.file-drop-size {
  font-size: 11.5px;
  color: var(--text-muted);
}

.sheet-submit-btn {
  margin-top: 4px;
  width: 100%;
  height: 44px;
}
</style>
