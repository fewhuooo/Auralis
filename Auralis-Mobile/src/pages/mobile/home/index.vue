<template>
  <AppPageLayout>
    <view class="home-page">
      <AppHeader title="今日" :subtitle="selectedDateHeading" />

      <scroll-view scroll-y :show-scrollbar="false" class="home-scroll">
        <view class="home-content">
          <view class="greeting-row">
            <view class="greeting-left">
              <text class="greeting-title">{{ greetingText }}，{{ displayName }}</text>
              <text v-if="syncStore.isSyncing" class="sync-pill">同步中…</text>
              <text v-else-if="selectedDateKey !== todayKey" class="back-today-pill" @click="jumpToToday">回到今天</text>
            </view>
            <view class="add-fab-btn" @click="openCaptureSheet('task')">
              <LineIcon name="plus" size="38rpx" color="#FFFFFF" />
            </view>
          </view>

          <view class="week-card zen-card">
            <view class="week-nav-row">
              <view class="week-arrow" @click="shiftWeek(-7)">
                <LineIcon name="chevron-left" size="28rpx" color="var(--text-muted)" />
              </view>
              <text class="week-range-label">{{ weekRangeLabel }}</text>
              <view class="week-arrow" @click="shiftWeek(7)">
                <LineIcon name="chevron-right" size="28rpx" color="var(--text-muted)" />
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
                <text class="w-num">{{ day.dayNumber }}</text>
                <view
                  class="w-dot"
                  :class="{ visible: hasScheduledOnDate(day.dateKey) }"
                ></view>
              </view>
            </view>
          </view>

          <view class="section-block">
            <view class="section-header">
              <text class="section-title">当日日程</text>
              <text class="section-count">{{ scheduledForSelectedDay.length }} 项</text>
            </view>

            <view v-if="scheduledForSelectedDay.length === 0" class="empty-card zen-card">
              <LineIcon name="calendar" size="48rpx" color="var(--text-muted)" />
              <text class="empty-title">{{ selectedDateHeading }} 暂无已排期日程</text>
              <text class="empty-sub">点击右上角 + 创建任务，或从下方待办排入今日</text>
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
                  <LineIcon v-if="item.status === 'completed'" name="check" size="22rpx" color="#FFFFFF" />
                </view>

                <view class="task-main" @click="item.id && toggleComplete(item.id)">
                  <view class="task-top-row">
                    <text class="task-time">{{ formatLocalTimeHHmm(item.scheduledAt) || '全天' }}</text>
                    <text v-if="item.subject" class="task-subject">{{ item.subject }}</text>
                    <text v-if="item.dueAt" class="task-ddl">截止 {{ formatShortDate(item.dueAt) }}</text>
                  </view>
                  <text class="task-title" :class="{ strike: item.status === 'completed' }">{{ item.name }}</text>
                </view>

                <view class="task-actions">
                  <text class="dur-badge">{{ item.duration || 30 }}m</text>
                  <view
                    v-if="item.id && item.status !== 'completed'"
                    class="unschedule-btn"
                    @click.stop="unschedule(item.id)"
                  >
                    <text>移回待办</text>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view class="section-block">
            <view class="section-header">
              <text class="section-title">待办清单</text>
              <text class="section-count">{{ taskStore.pendingTasks.length }} 项</text>
            </view>

            <view v-if="taskStore.pendingTasks.length === 0" class="empty-card zen-card">
              <LineIcon name="inbox" size="48rpx" color="var(--text-muted)" />
              <text class="empty-title">待办清单已清空</text>
              <text class="empty-sub">随时通过 + 记录新的学习待办</text>
            </view>

            <view v-else class="card-list">
              <view v-for="todo in taskStore.pendingTasks" :key="todo.id" class="task-card zen-card">
                <view
                  class="check-circle"
                  :class="{ locked: todo.id ? taskStore.updatingTaskIds.includes(todo.id) : false }"
                  @click="todo.id && toggleComplete(todo.id)"
                ></view>

                <view class="task-main">
                  <view class="task-top-row">
                    <text v-if="todo.subject" class="task-subject">{{ todo.subject }}</text>
                    <text v-if="todo.dueAt" class="task-ddl">截止 {{ formatShortDate(todo.dueAt) }}</text>
                  </view>
                  <text class="task-title">{{ todo.name }}</text>
                </view>

                <view class="task-actions">
                  <picker
                    v-if="todo.id"
                    mode="time"
                    value="09:00"
                    @change="onSchedulePending(todo.id, $event)"
                  >
                    <view class="schedule-pill">
                      <text>排入该日</text>
                    </view>
                  </picker>
                  <view v-if="todo.id" class="delete-icon-btn" @click="confirmDeleteTask(todo.id, todo.name)">
                    <LineIcon name="trash" size="26rpx" color="var(--text-muted)" />
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
            <view class="mode-tabs">
              <view
                v-for="tab in captureTabs"
                :key="tab.id"
                class="mode-tab"
                :class="{ active: captureMode === tab.id }"
                @click="switchCaptureMode(tab.id)"
              >
                <text>{{ tab.label }}</text>
              </view>
            </view>
            <view class="sheet-close" @click="closeCaptureSheet">
              <LineIcon name="close" size="30rpx" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="subjectStore.subjects.length === 0" class="no-subject-tip">
            <text>当前暂无学科，请先在平板或 PC 端创建学科后再添加任务、知识块或文件。</text>
          </view>

          <view v-if="captureMode === 'task'" class="form-stack">
            <view class="field-group">
              <text class="field-label">任务内容</text>
              <input
                class="zen-input"
                v-model="taskForm.name"
                placeholder="例如：整理高数第三章错题"
                :disabled="submittingCapture"
              />
            </view>

            <view class="field-group">
              <text class="field-label">所属学科</text>
              <scroll-view scroll-x :show-scrollbar="false" class="subject-chips-scroll">
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
            </view>

            <view class="field-group">
              <text class="field-label">预计时长</text>
              <view class="chips-row">
                <view
                  v-for="mins in [30, 60, 90, 120]"
                  :key="mins"
                  class="chip-item"
                  :class="{ active: taskForm.duration === mins }"
                  @click="taskForm.duration = mins"
                >
                  <text>{{ mins }} 分钟</text>
                </view>
              </view>
            </view>

            <view class="switch-row">
              <view class="switch-left">
                <text class="field-label">排入 {{ selectedDateHeading }}</text>
                <text class="field-hint">{{ taskForm.scheduled ? '将出现在当日日程时间轴' : '保存为未排期待办任务' }}</text>
              </view>
              <switch :checked="taskForm.scheduled" color="#8B9A6E" @change="onTaskScheduledToggle" />
            </view>

            <view class="dual-pickers">
              <view v-if="taskForm.scheduled" class="picker-col">
                <text class="field-label">开始时间</text>
                <picker mode="time" :value="taskForm.timeHHmm" @change="onTaskTimeChange">
                  <view class="picker-box">{{ taskForm.timeHHmm }}</view>
                </picker>
              </view>
              <view class="picker-col">
                <text class="field-label">截止日期（可选）</text>
                <picker mode="date" :value="taskForm.dueDateKey || selectedDateKey" @change="onTaskDueDateChange">
                  <view class="picker-box">{{ taskForm.dueDateKey || '不设置 DDL' }}</view>
                </picker>
              </view>
            </view>

            <button class="sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitTask">
              保存任务
            </button>
          </view>

          <view v-else-if="captureMode === 'block'" class="form-stack">
            <view class="field-group">
              <text class="field-label">所属学科</text>
              <scroll-view scroll-x :show-scrollbar="false" class="subject-chips-scroll">
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
            </view>

            <view class="field-group">
              <text class="field-label">知识块标题 / 提问正面</text>
              <input
                class="zen-input"
                v-model="blockForm.title"
                placeholder="输入核心概念或记忆提问…"
                :disabled="submittingCapture"
              />
            </view>

            <view class="field-group">
              <text class="field-label">内容 / 答案解析（支持 Markdown）</text>
              <textarea
                class="zen-textarea"
                v-model="blockForm.content"
                placeholder="记下关键结论、公式或理解要点…"
                :disabled="submittingCapture"
              />
            </view>

            <button class="sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitQuickBlock">
              保存知识块
            </button>
          </view>

          <view v-else class="form-stack">
            <view class="field-group">
              <text class="field-label">归入学科</text>
              <scroll-view scroll-x :show-scrollbar="false" class="subject-chips-scroll">
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
            </view>

            <view class="file-drop-box" @click="chooseFileToUpload">
              <LineIcon name="upload" size="42rpx" color="var(--color-zen-sage)" />
              <text class="file-drop-name">
                {{ uploadForm.file ? uploadForm.file.name : '点击选择本地文件 / 聊天文件' }}
              </text>
              <text class="file-drop-hint">
                {{ uploadForm.file ? formatFileSize(uploadForm.file.size) : '支持 PDF、Word、PPT、TXT、Markdown 等学习资料' }}
              </text>
            </view>

            <view class="field-group">
              <text class="field-label">资料名称</text>
              <input
                class="zen-input"
                v-model="uploadForm.title"
                placeholder="自动带出文件名，可自定义"
                :disabled="submittingCapture"
              />
            </view>

            <button class="sheet-submit-btn" :loading="submittingCapture" :disabled="submittingCapture" @click="submitFileUpload">
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
import AppHeader from '@/components/AppHeader.vue'
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
  return `${formatShortDate(days[0].dateKey)} - ${formatShortDate(days[6].dateKey)}`
})

const displayName = computed(() => authStore.user?.displayName || authStore.username || '同学')
const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早安'
  if (hour < 18) return '午后'
  return '晚安'
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
  uni.showToast({ title: `已排入 ${selectedDateHeading.value} ${hhmm}`, icon: 'none' })
}

function confirmDeleteTask(id: string, title: string) {
  uni.showModal({
    title: '删除待办',
    content: `确定要删除「${title}」吗？`,
    success: (res) => {
      if (res.confirm) void taskStore.removeTask(id)
    },
  })
}

type CaptureMode = 'task' | 'block' | 'upload'
const captureTabs: Array<{ id: CaptureMode; label: string }> = [
  { id: 'task', label: '新建任务' },
  { id: 'block', label: '记知识块' },
  { id: 'upload', label: '上传文件' },
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
    uni.showToast({ title: '请输入任务内容', icon: 'none' })
    return
  }
  const subject = subjectStore.subjects.find(item => item.id === taskForm.subjectId)
  if (!subject) {
    uni.showToast({ title: '请选择所属学科', icon: 'none' })
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
    uni.showToast({ title: scheduledAt ? '已加入当日日程' : '已加入待办清单', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '任务保存失败', icon: 'none' })
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
    uni.showToast({ title: '请选择所属学科', icon: 'none' })
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
    uni.showToast({ title: '知识块已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '知识块保存失败', icon: 'none' })
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
    uni.showToast({ title: err instanceof Error ? err.message : '选择文件失败', icon: 'none' })
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function submitFileUpload() {
  if (submittingCapture.value) return
  const subject = subjectStore.subjects.find(item => item.id === uploadForm.subjectId)
  if (!subject) {
    uni.showToast({ title: '请选择要归入的学科', icon: 'none' })
    return
  }
  if (!uploadForm.file) {
    uni.showToast({ title: '请先选择要上传的文件', icon: 'none' })
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
    uni.showToast({ title: `已归入「${subject.name}」，等待 PC 解析`, icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '文件上传失败', icon: 'none' })
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

.home-scroll {
  flex: 1;
  min-height: 0;
}

.home-content {
  padding: 20rpx 32rpx 40rpx;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  box-sizing: border-box;
}

.greeting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.greeting-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14rpx;
  min-width: 0;
  flex: 1;
}

.greeting-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.sync-pill,
.back-today-pill {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-semibold);
}

.add-fab-btn {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 20rpx rgba(139, 154, 110, 0.28);
  flex-shrink: 0;
}

.week-card {
  padding: 20rpx 18rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.week-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8rpx;
}

.week-arrow {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.week-range-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
}

.week-strip {
  display: flex;
  justify-content: space-between;
  gap: 8rpx;
}

.w-day {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 0;
  border-radius: 22rpx;
  background-color: transparent;
}

.w-day.active {
  background: var(--accent-gradient);
}

.w-week {
  font-size: 22rpx;
  color: var(--text-muted);
}

.w-num {
  font-size: 28rpx;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.w-day.is-today:not(.active) .w-num {
  color: var(--color-zen-sage);
}

.w-day.active .w-week,
.w-day.active .w-num {
  color: #FFFFFF;
}

.w-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background-color: transparent;
}

.w-dot.visible {
  background-color: var(--color-zen-sage);
}

.w-day.active .w-dot.visible {
  background-color: #FFFFFF;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4rpx;
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.section-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.empty-card {
  padding: 40rpx 28rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  text-align: center;
}

.empty-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.empty-sub {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.task-card {
  padding: 24rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.task-card.is-completed {
  opacity: 0.65;
}

.check-circle {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.check-circle.checked {
  background-color: var(--color-zen-sage);
  border-color: var(--color-zen-sage);
}

.check-circle.locked {
  opacity: 0.45;
}

.task-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.task-top-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
}

.task-time {
  font-size: 22rpx;
  font-family: var(--font-family-mono);
  font-weight: var(--font-weight-semibold);
  color: var(--color-zen-sage);
}

.task-subject {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  color: var(--text-muted);
}

.task-ddl {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: var(--radius-full);
  background-color: rgba(200, 155, 109, 0.16);
  color: #8C6235;
}

.task-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  word-break: break-word;
}

.task-title.strike {
  text-decoration: line-through;
  color: var(--text-muted);
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.dur-badge {
  font-size: 22rpx;
  font-family: var(--font-family-mono);
  color: var(--text-muted);
}

.unschedule-btn,
.schedule-pill {
  padding: 8rpx 16rpx;
  border-radius: var(--radius-full);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
}

.unschedule-btn {
  background-color: var(--color-bg-primary);
  color: var(--text-muted);
}

.schedule-pill {
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
}

.delete-icon-btn {
  padding: 8rpx;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.mode-tabs {
  display: flex;
  gap: 8rpx;
  background-color: var(--color-bg-primary);
  padding: 6rpx;
  border-radius: 20rpx;
  flex: 1;
}

.mode-tab {
  flex: 1;
  text-align: center;
  padding: 12rpx 8rpx;
  border-radius: 16rpx;
  font-size: 24rpx;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.mode-tab.active {
  background-color: var(--color-bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.sheet-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-subject-tip {
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background-color: rgba(200, 155, 109, 0.14);
  color: #8C6235;
  font-size: var(--font-size-xs);
  margin-bottom: 18rpx;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.field-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.field-hint {
  font-size: 22rpx;
  color: var(--text-muted);
  margin-top: 4rpx;
}

.zen-input {
  height: 84rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 20rpx;
  padding: 0 24rpx;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  box-sizing: border-box;
}

.zen-textarea {
  width: 100%;
  min-height: 200rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  box-sizing: border-box;
}

.subject-chips-scroll {
  width: 100%;
  white-space: nowrap;
}

.chips-row {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.subject-chips-scroll .chips-row {
  flex-wrap: nowrap;
}

.chip-item {
  display: inline-flex;
  align-items: center;
  padding: 12rpx 22rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: 24rpx;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.chip-item.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-bold);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 20rpx;
  background-color: var(--color-bg-primary);
  border-radius: 20rpx;
}

.switch-left {
  display: flex;
  flex-direction: column;
}

.dual-pickers {
  display: flex;
  gap: 16rpx;
}

.picker-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.picker-box {
  height: 78rpx;
  line-height: 78rpx;
  padding: 0 22rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 18rpx;
  font-size: var(--font-size-xs);
  color: var(--text-primary);
}

.file-drop-box {
  padding: 36rpx 24rpx;
  border-radius: 24rpx;
  background-color: var(--color-bg-primary);
  border: 1px dashed var(--border-accent);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  text-align: center;
}

.file-drop-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  word-break: break-all;
}

.file-drop-hint {
  font-size: 22rpx;
  color: var(--text-muted);
}

.sheet-submit-btn {
  margin-top: 8rpx;
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
  border-radius: 24rpx;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  border: none;
}

.sheet-submit-btn::after {
  border: none;
}
</style>
