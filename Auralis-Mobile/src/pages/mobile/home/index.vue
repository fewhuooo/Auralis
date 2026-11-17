<template>
  <AppPageLayout>
    <view class="home-page">
      <view class="status-bar-spacer"></view>

      <view class="top-bar">
        <view class="top-left">
          <text class="date-heading num-tabular">{{ dateTitle }}</text>
          <text class="weekday-heading">{{ weekdayTitle }}</text>
          <view v-if="syncStore.isSyncing" class="sync-dot" aria-label="同步中"></view>
        </view>
        <view class="add-fab" role="button" aria-label="新建" @click="openCaptureSheet('task')">
          <LineIcon name="plus" size="18px" color="#FFFFFF" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="home-scroll">
        <view class="home-content">
          <ZenWeekStrip
            v-model="selectedDateKey"
            :today-key="todayKey"
            :days="weekDays"
            :scheduled-dates="scheduledDateSet"
            @shift-week="shiftWeek"
            @jump-today="jumpToToday"
          />

          <view
            v-if="scheduledForSelectedDay.length === 0 && taskStore.pendingTasks.length === 0"
            class="clear-day-canvas zen-card"
          >
            <view class="clear-day-halo" aria-hidden="true">
              <LineIcon name="calendar" size="22px" color="var(--color-sage-ink)" />
            </view>
            <text class="clear-day-title">今日无安排</text>
            <view class="ui-btn ui-btn-secondary sm clear-day-cta" role="button" @click="openCaptureSheet('task')">
              <LineIcon name="plus" size="14px" color="var(--color-sage-ink)" />
              <text>新建任务</text>
            </view>
          </view>

          <template v-else>
            <view class="section-block">
              <view class="section-header">
                <text class="section-title">日程</text>
                <text v-if="scheduledForSelectedDay.length > 0" class="section-count num-tabular">
                  {{ scheduledForSelectedDay.length }}
                </text>
              </view>

              <view v-if="scheduledForSelectedDay.length === 0" class="empty-slot zen-empty-surface">
                <text class="empty-label">暂无日程</text>
              </view>

              <view v-else class="card-list">
                <ZenTaskRow
                  v-for="item in scheduledForSelectedDay"
                  :key="item.id"
                  :task="item"
                  mode="scheduled"
                  :locked="item.id ? taskStore.updatingTaskIds.includes(item.id) : false"
                  @toggle="toggleComplete"
                  @unschedule="unschedule"
                />
              </view>
            </view>

            <view class="section-block">
              <view class="section-header">
                <text class="section-title">待办</text>
                <text v-if="taskStore.pendingTasks.length > 0" class="section-count num-tabular">
                  {{ taskStore.pendingTasks.length }}
                </text>
              </view>

              <view v-if="taskStore.pendingTasks.length === 0" class="empty-slot zen-empty-surface">
                <text class="empty-label">暂无待办</text>
              </view>

              <view v-else class="card-list">
                <ZenTaskRow
                  v-for="todo in taskStore.pendingTasks"
                  :key="todo.id"
                  :task="todo"
                  mode="pending"
                  :locked="todo.id ? taskStore.updatingTaskIds.includes(todo.id) : false"
                  @toggle="toggleComplete"
                  @schedule-time="onSchedulePending"
                  @delete="confirmDeleteTask"
                />
              </view>
            </view>
          </template>
        </view>
      </scroll-view>
    </view>

    <template #overlay>
      <view v-if="showCaptureSheet" class="zen-sheet-mask" @click="closeCaptureSheet">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <view class="ui-segmented mode-tabs" role="tablist">
              <view
                v-for="tab in captureTabs"
                :key="tab.id"
                class="ui-seg-item"
                :class="{ active: captureMode === tab.id }"
                role="tab"
                :aria-selected="captureMode === tab.id"
                @click="switchCaptureMode(tab.id)"
              >
                <text>{{ tab.label }}</text>
              </view>
            </view>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeCaptureSheet">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="showInlineSubjectCreator || subjectStore.subjects.length === 0" class="inline-subject-box">
            <input
              class="ui-input inline-subject-input"
              v-model="newSubjectName"
              maxlength="64"
              placeholder="新建学科名称"
              :disabled="creatingSubject"
            />
            <button
              class="ui-btn ui-btn-primary sm inline-subject-btn"
              :loading="creatingSubject"
              :disabled="creatingSubject"
              @click="submitInlineSubject"
            >
              创建
            </button>
            <view
              v-if="subjectStore.subjects.length > 0"
              class="ui-icon-btn sm"
              role="button"
              aria-label="取消新建学科"
              @click="showInlineSubjectCreator = false"
            >
              <LineIcon name="close" size="14px" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="captureMode === 'task'" class="form-stack">
            <input
              class="ui-input"
              v-model="taskForm.name"
              placeholder="任务名称"
              :disabled="submittingCapture"
            />

            <scroll-view v-if="subjectStore.subjects.length > 0" scroll-x :show-scrollbar="false" class="chips-scroll">
              <view class="chips-row">
                <view
                  v-for="sub in subjectStore.subjects"
                  :key="sub.id"
                  class="chip-item"
                  :class="{ active: taskForm.subjectId === sub.id }"
                  role="button"
                  @click="taskForm.subjectId = sub.id"
                >
                  <text>{{ sub.name }}</text>
                </view>
                <view class="chip-item chip-add" role="button" @click="showInlineSubjectCreator = true">
                  <text>+ 学科</text>
                </view>
              </view>
            </scroll-view>

            <view class="chips-row">
              <view
                v-for="mins in [30, 60, 90, 120]"
                :key="mins"
                class="chip-item num-tabular"
                :class="{ active: taskForm.duration === mins }"
                role="button"
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
                  <view class="picker-box num-tabular">
                    <LineIcon name="clock" size="13px" color="var(--color-sage-ink)" />
                    <text>{{ taskForm.timeHHmm }}</text>
                  </view>
                </picker>
              </view>
              <view class="picker-col">
                <picker mode="date" :value="taskForm.dueDateKey || selectedDateKey" @change="onTaskDueDateChange">
                  <view class="picker-box num-tabular">
                    <LineIcon name="calendar" size="13px" color="var(--text-muted)" />
                    <text>{{ taskForm.dueDateKey || '截止日期' }}</text>
                  </view>
                </picker>
              </view>
            </view>

            <view class="quick-date-row">
              <view
                v-for="preset in dueDatePresets"
                :key="preset.label"
                class="chip-item sm"
                :class="{ active: taskForm.dueDateKey === preset.key }"
                role="button"
                @click="toggleDuePreset(preset.key)"
              >
                <text>{{ preset.label }}</text>
              </view>
            </view>

            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitTask">
              保存任务
            </button>
          </view>

          <view v-else-if="captureMode === 'block'" class="form-stack">
            <scroll-view v-if="subjectStore.subjects.length > 0" scroll-x :show-scrollbar="false" class="chips-scroll">
              <view class="chips-row">
                <view
                  v-for="sub in subjectStore.subjects"
                  :key="sub.id"
                  class="chip-item"
                  :class="{ active: blockForm.subjectId === sub.id }"
                  role="button"
                  @click="blockForm.subjectId = sub.id"
                >
                  <text>{{ sub.name }}</text>
                </view>
                <view class="chip-item chip-add" role="button" @click="showInlineSubjectCreator = true">
                  <text>+ 学科</text>
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
              placeholder="Markdown 正文"
              :disabled="submittingCapture"
            />

            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitQuickBlock">
              保存知识块
            </button>
          </view>

          <view v-else class="form-stack">
            <scroll-view v-if="subjectStore.subjects.length > 0" scroll-x :show-scrollbar="false" class="chips-scroll">
              <view class="chips-row">
                <view
                  v-for="sub in subjectStore.subjects"
                  :key="sub.id"
                  class="chip-item"
                  :class="{ active: uploadForm.subjectId === sub.id }"
                  role="button"
                  @click="uploadForm.subjectId = sub.id"
                >
                  <text>{{ sub.name }}</text>
                </view>
                <view class="chip-item chip-add" role="button" @click="showInlineSubjectCreator = true">
                  <text>+ 学科</text>
                </view>
              </view>
            </scroll-view>

            <view class="file-drop-box" role="button" @click="chooseFileToUpload">
              <LineIcon name="upload" size="22px" color="var(--color-sage-ink)" />
              <text class="file-drop-name">
                {{ uploadForm.file ? uploadForm.file.name : '选择文件' }}
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
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import ZenTaskRow from '@/components/ZenTaskRow.vue'
import ZenWeekStrip from '@/components/ZenWeekStrip.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
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
const dateTitle = computed(() => selectedDateHeading.value.split(' ')[0] || selectedDateHeading.value)
const weekdayTitle = computed(() => selectedDateHeading.value.split(' ')[1] || '')
const scheduledForSelectedDay = computed(() => taskStore.getScheduledTasksForDate(selectedDateKey.value))
const scheduledDateSet = computed(() => {
  const dates = new Set<string>()
  for (const task of taskStore.allTasks) {
    if (!task.is_deleted && task.scheduledAt) {
      const key = toLocalDateKey(task.scheduledAt)
      if (key) dates.add(key)
    }
  }
  return dates
})

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

async function onSchedulePending(taskId: string, hhmm: string) {
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
const showInlineSubjectCreator = ref(false)
const newSubjectName = ref('')
const creatingSubject = ref(false)

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
  showInlineSubjectCreator.value = subjectStore.subjects.length === 0
  showCaptureSheet.value = true
}

function switchCaptureMode(mode: CaptureMode) {
  if (submittingCapture.value) return
  captureMode.value = mode
}

function closeCaptureSheet() {
  if (submittingCapture.value || creatingSubject.value) return
  showCaptureSheet.value = false
}

useEscapeKey(() => showCaptureSheet.value, closeCaptureSheet)

const dueDatePresets = computed(() => [
  { label: '今天', key: todayKey.value },
  { label: '明天', key: shiftDateKey(todayKey.value, 1) },
  { label: '3天后', key: shiftDateKey(todayKey.value, 3) },
])

function toggleDuePreset(key: string) {
  taskForm.dueDateKey = taskForm.dueDateKey === key ? '' : key
}

async function submitInlineSubject() {
  if (creatingSubject.value) return
  const trimmed = newSubjectName.value.trim()
  if (!trimmed) {
    uni.showToast({ title: '请输入学科名称', icon: 'none' })
    return
  }
  const duplicate = subjectStore.subjects.some(item => item.name.trim().toLowerCase() === trimmed.toLowerCase())
  if (duplicate) {
    uni.showToast({ title: '已存在同名学科', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  creatingSubject.value = true
  try {
    const id = await subjectStore.addSubject(trimmed, '', 'book')
    if (generation !== authStore.getLoginGeneration()) return
    taskForm.subjectId = id
    blockForm.subjectId = id
    uploadForm.subjectId = id
    newSubjectName.value = ''
    showInlineSubjectCreator.value = false
    uni.showToast({ title: `已创建「${trimmed}」`, icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '创建失败', icon: 'none' })
  } finally {
    creatingSubject.value = false
  }
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
  padding: 16px 18px 10px;
  gap: 12px;
  flex-shrink: 0;
}

.top-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.date-heading {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.weekday-heading {
  font-size: 13.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-zen-sage);
  align-self: center;
  animation: syncPulse 1.2s ease-in-out infinite;
}

@keyframes syncPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}

.add-fab {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(118, 135, 88, 0.28);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.16s var(--ease-out);
}

.add-fab:active {
  transform: scale(0.92);
}

.home-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.home-content {
  padding: 6px 18px var(--tabbar-clearance);
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.clear-day-canvas {
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 20px;
}

.clear-day-halo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-day-title {
  font-size: 15px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.clear-day-cta {
  border-radius: var(--radius-full);
  padding: 0 16px;
  color: var(--color-sage-ink);
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
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  letter-spacing: -0.01em;
}

.section-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.empty-slot {
  height: 38px;
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

.inline-subject-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.inline-subject-input {
  flex: 1;
  min-width: 0;
  height: 36px;
}

.inline-subject-btn {
  height: 36px;
  flex-shrink: 0;
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
  background-color: var(--color-bg-tertiary);
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

.chip-item.chip-add {
  color: var(--color-sage-ink);
  border-style: dashed;
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
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  cursor: pointer;
}

.quick-date-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chip-item.sm {
  height: 28px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 11.5px;
}

.file-drop-box {
  padding: 20px 14px;
  border-radius: 14px;
  border: 1px dashed var(--border-accent);
  background-color: var(--color-bg-tertiary);
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

@media (max-width: 390px) {
  .top-bar {
    padding-left: 14px;
    padding-right: 14px;
  }

  .home-content {
    padding-left: 14px;
    padding-right: 14px;
  }
}
</style>
