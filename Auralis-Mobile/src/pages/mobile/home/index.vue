<template>
  <AppPageLayout>
    <view class="home-page">
      <view class="status-bar-spacer"></view>

      <view class="top-bar">
        <view class="masthead-left" role="button" aria-label="回到今天" @click="jumpToToday">
          <view class="masthead-main-row">
            <view class="date-heading" aria-label="今天日期">
              <text class="date-num num-tabular">{{ todayMonthNumber }}</text>
              <text class="date-unit">月</text>
              <text class="date-num num-tabular">{{ todayDayNumber }}</text>
              <text class="date-unit">日</text>
            </view>
            <view v-if="syncStore.isSyncing" class="sync-dot" aria-label="同步中"></view>
          </view>
          <text class="masthead-subtitle">
            {{ todayFullWeekday }} · 第 <text class="num-tabular">{{ todayIsoWeek }}</text> 周
          </text>
        </view>
        <view class="add-fab" role="button" aria-label="新建" @click="openCaptureSheet('task')">
          <LineIcon name="plus" size="18px" color="#FFFFFF" />
        </view>
      </view>

      <view class="home-content">
        <ZenWeekStrip
          v-model="selectedDateKey"
          :days="weekDays"
          :scheduled-dates="scheduledDateSet"
        />

        <view class="planner-cards">
          <view class="zone-card schedule-card">
            <view class="section-header">
              <view class="section-title-group">
                <text class="section-title">{{ selectedScheduleTitle }}</text>
                <text v-if="scheduledForSelectedDay.length > 0" class="section-meta-pill num-tabular">
                  {{ scheduledSummaryLabel }}
                </text>
              </view>
              <view
                v-if="selectedDateKey !== todayKey"
                class="back-today-pill"
                role="button"
                aria-label="回到今天"
                @click="jumpToToday"
              >
                <text>回到今天</text>
              </view>
            </view>

            <view v-if="hydrated && scheduledForSelectedDay.length === 0" class="empty-stage">
              <text class="empty-whisper">当日暂无日程</text>
            </view>

            <scroll-view v-else-if="scheduledForSelectedDay.length > 0" scroll-y :show-scrollbar="false" class="zone-scroll">
              <view class="card-list">
                <ZenTaskRow
                  v-for="item in scheduledForSelectedDay"
                  :key="item.id"
                  :task="item"
                  mode="scheduled"
                  :hide-schedule-actions="true"
                  :locked="isTaskLocked(item)"
                  @toggle="toggleComplete"
                />
              </view>
            </scroll-view>
          </view>

          <view class="zone-card backlog-card">
            <view class="section-header">
              <view class="section-title-group">
                <text class="section-title">待办清单</text>
                <text v-if="taskStore.pendingTasks.length > 0" class="section-count-badge num-tabular">
                  {{ taskStore.pendingTasks.length }}
                </text>
              </view>
            </view>

            <scroll-view v-if="taskStore.homePendingTasks.length > 0" scroll-y :show-scrollbar="false" class="zone-scroll">
              <view class="card-list">
                <ZenTaskRow
                  v-for="todo in taskStore.homePendingTasks"
                  :key="todo.id"
                  :task="todo"
                  mode="pending"
                  :hide-schedule-actions="true"
                  :locked="todo.id ? taskStore.updatingTaskIds.includes(todo.id) : false"
                  @toggle="toggleComplete"
                  @delete="confirmDeleteTask"
                />
              </view>
            </scroll-view>

            <view v-else-if="hydrated" class="ghost-todo-stage">
              <button
                class="ghost-todo-btn"
                aria-label="点击添加第一条待办"
                @click="openCaptureSheet('task')"
              >
                <view class="ghost-check-circle" aria-hidden="true"></view>
                <text class="ghost-btn-label">点击添加第一条待办...</text>
              </button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <template #overlay>
      <view v-if="showCaptureSheet" class="zen-modal-mask capture-modal-mask" @click="closeCaptureSheet">
        <view
          class="zen-modal-body capture-modal-card"
          role="dialog"
          aria-modal="true"
          :aria-label="captureTabs[captureModeIndex]?.label || '新建'"
          @click.stop
        >
          <view class="capture-modal-header">
            <view
              class="mode-capsule"
              role="tablist"
              @touchstart="onModeTouchStart"
              @touchend="onModeTouchEnd"
            >
              <view class="mode-capsule-thumb" :style="modeThumbStyle" aria-hidden="true"></view>
              <view
                v-for="tab in captureTabs"
                :key="tab.id"
                class="mode-capsule-item"
                :class="{ active: captureMode === tab.id }"
                role="tab"
                :aria-selected="captureMode === tab.id"
                @click="switchCaptureMode(tab.id)"
              >
                <text>{{ tab.label }}</text>
              </view>
            </view>
            <view class="modal-close-btn" role="button" aria-label="关闭" @click="closeCaptureSheet">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="capture-modal-body">
            <view class="form-stack">
              <view v-if="captureMode === 'task'" class="modal-field-group">
                <view class="modal-field-header">
                  <text class="modal-field-label">任务名称</text>
                </view>
                <input
                  class="ui-input"
                  v-model="taskForm.name"
                  placeholder="请输入任务名称..."
                  :disabled="submittingCapture"
                  @confirm="submitActiveCapture"
                />
              </view>

              <view class="modal-field-group">
                <view class="modal-field-header">
                  <text class="modal-field-label">所属学科</text>
                </view>

                <view v-if="subjectStore.subjects.length === 0" class="inline-subject-box">
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
                </view>

                <view v-if="subjectStore.subjects.length > 0" class="subject-chips-grid">
                  <view
                    v-for="sub in subjectStore.subjects"
                    :key="sub.id"
                    class="chip-item subject-chip"
                    :class="{ active: activeSubjectId === sub.id }"
                    role="button"
                    @click="activeSubjectId = sub.id"
                  >
                    <text>{{ sub.name }}</text>
                  </view>
                </view>
              </view>

              <template v-if="captureMode === 'task'">
                <view class="modal-field-group">
                  <view class="modal-field-header">
                    <text class="modal-field-label">专注时长</text>
                  </view>

                  <view class="duration-segmented-track">
                    <view class="active-thumb-pill" :style="durationThumbStyle">
                      <text class="active-thumb-text num-tabular">{{ currentDurationLabel }}</text>
                    </view>
                    <view class="track-segments-row">
                      <view
                        v-for="opt in durationOptions"
                        :key="opt.minutes"
                        class="track-segment-item"
                        :class="{ active: taskForm.duration === opt.minutes }"
                        role="button"
                        @click="taskForm.duration = opt.minutes"
                      >
                        <text class="segment-label num-tabular">{{ opt.label }}</text>
                      </view>
                    </view>
                  </view>
                </view>

                <view class="modal-field-group">
                  <view class="modal-field-header">
                    <view class="modal-field-label">
                      <text>截止时间</text>
                      <text class="optional-tag">可选</text>
                    </view>
                    <text
                      v-if="taskForm.dueDateKey"
                      class="field-action-link"
                      role="button"
                      @click="taskForm.dueDateKey = ''"
                    >
                      清除
                    </text>
                  </view>

                  <ZenDatePicker
                    v-model="taskForm.dueDateKey"
                    :fallback-date="selectedDateKey"
                    :disabled="submittingCapture"
                    title="选择截止日期"
                  >
                    <view class="due-picker-pill num-tabular" :class="{ filled: Boolean(taskForm.dueDateKey) }">
                      <LineIcon
                        name="calendar"
                        size="14px"
                        :color="taskForm.dueDateKey ? 'var(--color-sage-ink)' : 'var(--text-muted)'"
                      />
                      <text class="due-picker-text">
                        {{ taskForm.dueDateKey || '请选择截止日期' }}
                      </text>
                    </view>
                  </ZenDatePicker>
                </view>
              </template>

              <template v-else-if="captureMode === 'block'">
                <view class="modal-field-group">
                  <view class="modal-field-header">
                    <text class="modal-field-label">标题</text>
                  </view>
                  <input
                    class="ui-input"
                    v-model="blockForm.title"
                    placeholder="知识块标题"
                    :disabled="submittingCapture"
                  />
                </view>

                <view class="modal-field-group">
                  <view class="modal-field-header">
                    <text class="modal-field-label">正文内容</text>
                  </view>
                  <textarea
                    class="ui-textarea"
                    v-model="blockForm.content"
                    placeholder="Markdown 正文"
                    :disabled="submittingCapture"
                  />
                </view>
              </template>

              <template v-else>
                <view class="modal-field-group">
                  <view class="modal-field-header">
                    <text class="modal-field-label">选择文件</text>
                  </view>
                  <view class="file-drop-box" role="button" @click="chooseFileToUpload">
                    <LineIcon name="upload" size="22px" color="var(--color-sage-ink)" />
                    <text class="file-drop-name">
                      {{ uploadForm.file ? uploadForm.file.name : '点击选择本地文件' }}
                    </text>
                    <text v-if="uploadForm.file" class="file-drop-size num-tabular">
                      {{ formatBytes(uploadForm.file.size) }}
                    </text>
                  </view>
                </view>

                <view class="modal-field-group">
                  <view class="modal-field-header">
                    <view class="modal-field-label">
                      <text>资料名称</text>
                      <text class="optional-tag">可选</text>
                    </view>
                  </view>
                  <input
                    class="ui-input"
                    v-model="uploadForm.title"
                    placeholder="默认使用文件名"
                    :disabled="submittingCapture"
                  />
                </view>
              </template>
            </view>
          </view>

          <view class="capture-modal-footer">
            <button
              class="ui-btn ui-btn-secondary modal-capsule-btn"
              :disabled="submittingCapture"
              @click="closeCaptureSheet"
            >
              取消
            </button>
            <button
              class="ui-btn ui-btn-primary modal-capsule-btn"
              :loading="submittingCapture"
              :disabled="submittingCapture || !canSubmitCapture"
              @click="submitActiveCapture"
            >
              {{ captureSubmitLabel }}
            </button>
          </view>
        </view>
      </view>
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import ZenTaskRow from '@/components/ZenTaskRow.vue'
import ZenWeekStrip from '@/components/ZenWeekStrip.vue'
import ZenDatePicker from '@/components/ZenDatePicker.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { confirmDialog, showToast } from '@/platform/feedback'
import { onPageShow } from '@/platform/lifecycle'
import type { LocalUploadFile } from '@/services/assetUpload'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import { isScheduledCompletionLocked } from '@/utils/taskSyncMapper'
import {
  endOfLocalDateIso,
  formatDateHeading,
  formatFullWeekday,
  formatShortDate,
  getIsoWeekNumber,
  getWeekDays,
  toLocalDateKey,
} from '@/utils/dateKey'
import { pickLocalDocument, uploadSubjectFile, validateUploadFile } from '@/utils/filePicker'
import { formatBytes } from '@/utils/sourceFormat'

const authStore = useAuthStore()
const taskStore = useTaskStore()
const subjectStore = useSubjectStore()
const blockStore = useBlockStore()
const syncStore = useSyncStore()

const nowClock = ref(new Date())
const todayKey = computed(() => toLocalDateKey(nowClock.value))
const selectedDateKey = ref(todayKey.value)
const weekDays = computed(() => getWeekDays(todayKey.value, todayKey.value))

const todayMonthNumber = computed(() => nowClock.value.getMonth() + 1)
const todayDayNumber = computed(() => nowClock.value.getDate())
const todayIsoWeek = computed(() => getIsoWeekNumber(nowClock.value))
const todayFullWeekday = computed(() => formatFullWeekday(nowClock.value))

const selectedDateHeading = computed(() => formatDateHeading(selectedDateKey.value))
const selectedScheduleTitle = computed(() => {
  if (selectedDateKey.value === todayKey.value) return '今日日程'
  const weekday = selectedDateHeading.value.split(' ')[1] || ''
  return `${weekday}日程 · ${formatShortDate(selectedDateKey.value)}`
})

const scheduledForSelectedDay = computed(() => taskStore.getScheduledTasksForDate(selectedDateKey.value))
const scheduledSummaryLabel = computed(() => {
  const list = scheduledForSelectedDay.value
  const totalMinutes = list.reduce((sum, task) => sum + (task.duration || 30), 0)
  return `${list.length} 项 · ${totalMinutes}m`
})
const scheduledDateSet = computed(() => {
  const dates = new Set<string>()
  for (const task of taskStore.allTasks) {
    if (!task.is_deleted && task.status !== 'cancelled' && task.scheduledAt) {
      const key = toLocalDateKey(task.scheduledAt)
      if (key) dates.add(key)
    }
  }
  return dates
})

function syncClockToWeek() {
  nowClock.value = new Date()
  const activeKey = todayKey.value
  if (!weekDays.value.some(day => day.dateKey === selectedDateKey.value)) {
    selectedDateKey.value = activeKey
  }
  void taskStore.recoverOverdueTasks()
}

function jumpToToday() {
  nowClock.value = new Date()
  selectedDateKey.value = todayKey.value
}

function isTaskLocked(task: Task): boolean {
  return Boolean((task.id && taskStore.updatingTaskIds.includes(task.id)) || isScheduledCompletionLocked(task, nowClock.value))
}

async function toggleComplete(id: string) {
  if (taskStore.updatingTaskIds.includes(id)) return
  const task = taskStore.allTasks.find(item => item.id === id)
  if (isScheduledCompletionLocked(task, nowClock.value)) {
    showToast('任务时段已结束，完成状态不可取消')
    return
  }
  const generation = authStore.getLoginGeneration()
  try {
    await taskStore.toggleTaskComplete(id)
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '操作失败，请重试')
  }
}

async function confirmDeleteTask(id: string, title: string) {
  const generation = authStore.getLoginGeneration()
  const confirmed = await confirmDialog({
    title: '删除待办',
    content: `确定要删除「${title}」吗？`,
    confirmText: '删除',
    confirmTone: 'danger',
  })
  if (!confirmed || generation !== authStore.getLoginGeneration()) return
  try {
    await taskStore.removeTask(id)
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '删除失败，请重试')
  }
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
const newSubjectName = ref('')
const creatingSubject = ref(false)

const taskForm = reactive({
  name: '',
  subjectId: '',
  duration: 60,
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

function hasSubject(id: string): boolean {
  return Boolean(id && subjectStore.subjects.some(item => item.id === id))
}

function defaultSubjectId(): string {
  return subjectStore.subjects[0]?.id || ''
}

const activeSubjectId = computed({
  get(): string {
    if (captureMode.value === 'task') return taskForm.subjectId
    if (captureMode.value === 'block') return blockForm.subjectId
    return uploadForm.subjectId
  },
  set(subjectId: string) {
    if (captureMode.value === 'task') {
      taskForm.subjectId = subjectId
      return
    }
    if (captureMode.value === 'block') {
      blockForm.subjectId = subjectId
      return
    }
    uploadForm.subjectId = subjectId
  },
})

const durationOptions = [
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 90, label: '1.5h' },
  { minutes: 120, label: '2h' },
  { minutes: 150, label: '2.5h' },
  { minutes: 180, label: '3h' },
  { minutes: 240, label: '4h' },
]

const currentDurationIndex = computed(() => {
  const idx = durationOptions.findIndex(opt => opt.minutes === taskForm.duration)
  return idx !== -1 ? idx : 1
})

const currentDurationLabel = computed(() => durationOptions[currentDurationIndex.value]?.label || '1h')

const durationThumbStyle = computed(() => {
  const count = durationOptions.length
  const idx = currentDurationIndex.value
  return {
    width: `calc((100% - 6px) / ${count})`,
    left: `calc(3px + (100% - 6px) * ${idx} / ${count})`,
  }
})

const captureModeIndex = computed(() => {
  const idx = captureTabs.findIndex(tab => tab.id === captureMode.value)
  return idx !== -1 ? idx : 0
})

const modeThumbStyle = computed(() => {
  const count = captureTabs.length
  return {
    width: `calc((100% - 6px) / ${count})`,
    left: `calc(3px + (100% - 6px) * ${captureModeIndex.value} / ${count})`,
  }
})

let modeTouchStartX = 0

function onModeTouchStart(event: { touches?: ArrayLike<{ clientX?: number }> }) {
  modeTouchStartX = event?.touches?.[0]?.clientX ?? 0
}

function onModeTouchEnd(event: { changedTouches?: ArrayLike<{ clientX?: number }> }) {
  const endX = event?.changedTouches?.[0]?.clientX
  if (typeof endX !== 'number' || !modeTouchStartX) return
  const deltaX = endX - modeTouchStartX
  modeTouchStartX = 0
  if (Math.abs(deltaX) < 28) return
  const nextIdx = deltaX < 0
    ? Math.min(captureTabs.length - 1, captureModeIndex.value + 1)
    : Math.max(0, captureModeIndex.value - 1)
  const nextTab = captureTabs[nextIdx]
  if (nextTab) switchCaptureMode(nextTab.id)
}

function openCaptureSheet(mode: CaptureMode) {
  captureMode.value = mode
  const fallbackSubId = defaultSubjectId()
  if (!hasSubject(taskForm.subjectId)) taskForm.subjectId = fallbackSubId
  if (!hasSubject(blockForm.subjectId)) blockForm.subjectId = fallbackSubId
  if (!hasSubject(uploadForm.subjectId)) uploadForm.subjectId = fallbackSubId
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

async function submitInlineSubject() {
  if (creatingSubject.value) return
  const trimmed = newSubjectName.value.trim()
  if (!trimmed) {
    showToast('请输入学科名称')
    return
  }
  const duplicate = subjectStore.subjects.some(item => item.name.trim().toLowerCase() === trimmed.toLowerCase())
  if (duplicate) {
    showToast('已存在同名学科')
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
    showToast(`已创建「${trimmed}」`)
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '创建失败')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      creatingSubject.value = false
    }
  }
}

async function submitTask() {
  if (submittingCapture.value) return
  const title = taskForm.name.trim()
  if (!title) {
    showToast('请输入任务名称')
    return
  }
  const subject = subjectStore.subjects.find(item => item.id === taskForm.subjectId)
  if (!subject) {
    showToast('请选择学科')
    return
  }
  const generation = authStore.getLoginGeneration()
  submittingCapture.value = true
  try {
    const dueAt = taskForm.dueDateKey ? endOfLocalDateIso(taskForm.dueDateKey) : undefined
    await taskStore.addTask({
      name: title,
      subject: subject.name,
      subjectId: subject.id,
      duration: taskForm.duration,
      status: 'pending',
      dueAt,
    })
    if (generation !== authStore.getLoginGeneration()) return
    taskForm.name = ''
    taskForm.dueDateKey = ''
    showCaptureSheet.value = false
    showToast('已加入待办')
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '保存失败')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      submittingCapture.value = false
    }
  }
}

async function submitQuickBlock() {
  if (submittingCapture.value) return
  const title = blockForm.title.trim()
  const content = blockForm.content.trim()
  const subject = subjectStore.subjects.find(item => item.id === blockForm.subjectId)
  if (!subject) {
    showToast('请选择学科')
    return
  }
  if (!title || !content) {
    showToast('请填写标题和内容')
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
    showToast('已保存知识块')
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '保存失败')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      submittingCapture.value = false
    }
  }
}

async function chooseFileToUpload() {
  if (submittingCapture.value) return
  const generation = authStore.getLoginGeneration()
  try {
    const file = await pickLocalDocument()
    if (!file || generation !== authStore.getLoginGeneration()) return
    validateUploadFile(file)
    uploadForm.file = file
    if (!uploadForm.title.trim()) uploadForm.title = file.name
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '选择失败')
  }
}

async function submitFileUpload() {
  if (submittingCapture.value) return
  const subject = subjectStore.subjects.find(item => item.id === uploadForm.subjectId)
  if (!subject) {
    showToast('请选择学科')
    return
  }
  if (!uploadForm.file) {
    showToast('请选择文件')
    return
  }
  try {
    validateUploadFile(uploadForm.file)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '不支持的文件格式')
    return
  }
  const generation = authStore.getLoginGeneration()
  submittingCapture.value = true
  try {
    const created = await uploadSubjectFile({
      subjectId: subject.id,
      file: uploadForm.file,
      title: uploadForm.title,
    })
    if (generation !== authStore.getLoginGeneration()) return
    await localDb.upsertSourceView(subject.id, created).catch(() => {})
    if (generation !== authStore.getLoginGeneration()) return
    if (syncStore.autoSyncEnabled) {
      void syncStore.triggerSync().catch(() => {})
    }
    await subjectStore.loadSubjects().catch(() => {})
    if (generation !== authStore.getLoginGeneration()) return
    uploadForm.file = null
    uploadForm.title = ''
    showCaptureSheet.value = false
    showToast(`已归入「${subject.name}」`)
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '上传失败')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      submittingCapture.value = false
    }
  }
}

const canSubmitCapture = computed(() => {
  if (captureMode.value === 'task') {
    return taskForm.name.trim().length > 0 && Boolean(taskForm.subjectId)
  }
  if (captureMode.value === 'block') {
    return (
      blockForm.title.trim().length > 0
      && blockForm.content.trim().length > 0
      && Boolean(blockForm.subjectId)
    )
  }
  return Boolean(uploadForm.file) && Boolean(uploadForm.subjectId)
})

const captureSubmitLabels: Record<CaptureMode, string> = {
  task: '添加到待办',
  block: '保存知识块',
  upload: '上传归档',
}

const captureSubmitLabel = computed(() => (
  submittingCapture.value ? '提交中…' : captureSubmitLabels[captureMode.value]
))

const captureSubmitHandlers: Record<CaptureMode, () => Promise<void>> = {
  task: submitTask,
  block: submitQuickBlock,
  upload: submitFileUpload,
}

async function submitActiveCapture() {
  await captureSubmitHandlers[captureMode.value]()
}

let clockTimer: ReturnType<typeof setInterval> | null = null
let lastHomeAuthScope = `${authStore.isAuthenticated ? '1' : '0'}:${authStore.user?.id || 'anon'}:${authStore.serverDeviceId || 'dev'}`

function resetHomeCaptureState() {
  showCaptureSheet.value = false
  submittingCapture.value = false
  creatingSubject.value = false
  newSubjectName.value = ''
  taskForm.name = ''
  taskForm.subjectId = ''
  taskForm.duration = 60
  taskForm.dueDateKey = ''
  blockForm.subjectId = ''
  blockForm.title = ''
  blockForm.content = ''
  uploadForm.subjectId = ''
  uploadForm.file = null
  uploadForm.title = ''
}

watch(
  () => subjectStore.subjects,
  () => {
    const fallbackSubId = defaultSubjectId()
    if (!hasSubject(taskForm.subjectId)) taskForm.subjectId = fallbackSubId
    if (!hasSubject(blockForm.subjectId)) blockForm.subjectId = fallbackSubId
    if (!hasSubject(uploadForm.subjectId)) uploadForm.subjectId = fallbackSubId
  },
)

const hydrated = ref(false)

async function hydrateHomeData() {
  const gen = authStore.getLoginGeneration()
  try {
    await Promise.all([subjectStore.loadSubjects(), taskStore.fetchTasks()])
  } finally {
    if (gen === authStore.getLoginGeneration()) {
      hydrated.value = true
    }
  }
}

watch(
  () => `${authStore.isAuthenticated ? '1' : '0'}:${authStore.user?.id || 'anon'}:${authStore.serverDeviceId || 'dev'}`,
  (nextScope) => {
    if (nextScope === lastHomeAuthScope) return
    lastHomeAuthScope = nextScope
    hydrated.value = false
    resetHomeCaptureState()
    selectedDateKey.value = todayKey.value
    if (authStore.isAuthenticated) {
      void hydrateHomeData()
    }
  },
)

onPageShow(syncClockToWeek)

onMounted(async () => {
  clockTimer = setInterval(syncClockToWeek, 30000)
  await hydrateHomeData()
})

onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<style scoped>
.home-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(88% 42% at 88% 8%, rgba(139, 154, 110, 0.13) 0%, transparent 66%),
    radial-gradient(76% 40% at 10% 72%, rgba(200, 155, 109, 0.10) 0%, transparent 64%),
    linear-gradient(180deg, #F6F2EA 0%, #EFEBE2 100%);
}

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  height: max(var(--status-bar-height, 0px), env(safe-area-inset-top));
  flex-shrink: 0;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 6px;
  gap: 12px;
  flex-shrink: 0;
}

.masthead-left {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  cursor: pointer;
}

.masthead-subtitle {
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  letter-spacing: 0.015em;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.masthead-main-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.date-heading {
  display: inline-flex;
  align-items: baseline;
}

.date-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.date-unit {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.05;
  margin: 0 2px 0 1px;
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
  box-shadow: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.16s var(--ease-out);
}

.add-fab:active {
  transform: scale(0.92);
}

.home-content {
  flex: 1;
  min-height: 0;
  padding: 6px 24px var(--tabbar-clearance);
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

.planner-cards {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.zone-card {
  min-height: 0;
  background-color: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 18px;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.schedule-card {
  flex: 7;
  min-height: 0;
}

.backlog-card {
  flex: 3;
  min-height: 152px;
}

.zone-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.empty-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
}

.empty-whisper {
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  opacity: 0.7;
  letter-spacing: 0.06em;
  line-height: 1.5;
  text-align: center;
}

.ghost-todo-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  padding-bottom: 2px;
}

.ghost-todo-btn {
  width: 100%;
  height: auto;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 11px 13px;
  border-radius: 13px;
  border: 1px dashed rgba(139, 154, 110, 0.17);
  background-color: rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  font-size: 13.5px;
  text-align: left;
  line-height: 1.4;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease, transform 0.14s var(--ease-out);
}

.ghost-todo-btn::after {
  border: none;
}

.ghost-todo-btn:hover {
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.72);
  background-color: rgba(252, 251, 249, 0.56);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.20), 0 4px 12px rgba(45, 55, 40, 0.035), inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.ghost-todo-btn:active {
  transform: scale(0.99);
  border-style: solid;
  border-color: rgba(139, 154, 110, 0.30);
  background-color: rgba(139, 154, 110, 0.06);
}

.ghost-check-circle {
  width: 19px;
  height: 19px;
  border-radius: 50%;
  border: 1.25px solid rgba(139, 154, 110, 0.18);
  background-color: rgba(255, 255, 255, 0.22);
  flex-shrink: 0;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.ghost-todo-btn:hover .ghost-check-circle {
  border-color: rgba(139, 154, 110, 0.36);
  background-color: rgba(139, 154, 110, 0.05);
}

.ghost-btn-label {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: var(--font-weight-regular);
  color: var(--text-muted);
  opacity: 0.48;
  line-height: 22px;
  transition: opacity 0.18s ease, color 0.18s ease;
}

.ghost-todo-btn:hover .ghost-btn-label {
  opacity: 0.80;
  color: var(--text-secondary);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  flex-shrink: 0;
}

.section-title-group {
  display: flex;
  align-items: center;
  gap: 7px;
}

.section-title {
  font-size: 13px;
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.section-meta-pill {
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background-color: rgba(139, 154, 110, 0.12);
  color: var(--color-sage-ink);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
}

.section-count-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background-color: rgba(45, 55, 40, 0.06);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.back-today-pill {
  height: 25px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  background-color: rgba(139, 154, 110, 0.14);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.75);
  color: var(--color-sage-ink);
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: background-color 0.18s ease, transform 0.14s ease;
}

.back-today-pill:active {
  transform: scale(0.94);
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 2px;
}

.backlog-card .card-list {
  gap: 6px;
}

/* Capture Centered Modal (aligned with PC ModalShell & TaskCreateDialog) */
.capture-modal-mask {
  background-color: rgba(28, 28, 26, 0.42);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
}

.capture-modal-card {
  max-width: 440px;
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
  background-color: rgba(247, 242, 235, 0.92);
  backdrop-filter: blur(22px) saturate(175%);
  -webkit-backdrop-filter: blur(22px) saturate(175%);
  border: 1px solid rgba(255, 255, 255, 0.68);
  display: flex;
  flex-direction: column;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.07),
    0 24px 64px -12px rgba(0, 0, 0, 0.13),
    0 8px 24px -6px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.capture-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 10px;
  flex-shrink: 0;
}

.mode-capsule {
  position: relative;
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 3px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 1.5px 4px rgba(0, 0, 0, 0.04);
  user-select: none;
  box-sizing: border-box;
}

.mode-capsule-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #8E9F70 0%, #738455 100%);
  box-shadow: 0 3px 10px rgba(118, 135, 88, 0.34), 0 1px 2px rgba(0, 0, 0, 0.06);
  z-index: 1;
  pointer-events: none;
  box-sizing: border-box;
  transition: left 0.24s var(--ease-out);
}

.mode-capsule-item {
  position: relative;
  z-index: 2;
  height: 30px;
  padding: 0 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.18s ease;
}

.mode-capsule-item.active {
  color: #FFFFFF;
  font-weight: var(--font-weight-bold);
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background-color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.2s var(--ease-out), transform 0.2s var(--ease-out);
}

.modal-close-btn:hover {
  background-color: rgba(0, 0, 0, 0.055);
}

.modal-close-btn:active {
  transform: scale(0.92);
  background-color: rgba(0, 0, 0, 0.085);
}

.capture-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 6px 22px 12px;
  overflow-y: auto;
  overflow-x: hidden;
}

.capture-modal-card .ui-input,
.capture-modal-card .ui-textarea {
  background-color: var(--color-bg-tertiary);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04), 0 0.5px 1.5px rgba(0, 0, 0, 0.02);
  color: var(--text-primary);
}

.capture-modal-card .ui-input:focus,
.capture-modal-card .ui-input:focus-within,
.capture-modal-card .ui-textarea:focus,
.capture-modal-card .ui-textarea:focus-within {
  border-color: var(--color-zen-sage);
  background-color: #FDFBF8;
  box-shadow: 0 0 0 3.5px rgba(139, 154, 110, 0.14), 0 2px 8px rgba(139, 154, 110, 0.12);
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.modal-field-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.modal-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.modal-field-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.optional-tag {
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  margin-left: 2px;
}

.field-action-link {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-zen-sage);
  cursor: pointer;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  transition: background-color 0.18s ease, color 0.18s ease;
}

.field-action-link:hover,
.field-action-link:active {
  background-color: rgba(139, 154, 110, 0.12);
  color: #768758;
}

.inline-subject-box {
  display: flex;
  align-items: center;
  gap: 8px;
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

.subject-chips-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 112px;
  overflow-y: auto;
  padding: 3px 2px;
}

.chip-item {
  flex-shrink: 0;
  padding: 6.5px 15px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-size: 12.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
  transition: border-color 0.22s var(--ease-out), background-color 0.22s var(--ease-out), color 0.22s var(--ease-out), box-shadow 0.22s var(--ease-out);
}

.chip-item:hover,
.subject-chip:hover {
  border-color: var(--color-zen-sage);
  color: var(--color-sage-dark);
}

.chip-item.active,
.subject-chip.active {
  background-color: rgba(139, 154, 110, 0.14);
  border-color: var(--color-zen-sage);
  color: var(--color-sage-dark);
  font-weight: var(--font-weight-semibold);
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.16), 0 3px 10px rgba(139, 154, 110, 0.18);
}

.duration-segmented-track {
  position: relative;
  height: 42px;
  padding: 3px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 1.5px 4px rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
  user-select: none;
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.duration-segmented-track:hover {
  border-color: rgba(139, 154, 110, 0.35);
}

.active-thumb-pill {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #8E9F70 0%, #738455 100%);
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.40), 0 1px 2px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  pointer-events: none;
  transition: left 0.24s var(--ease-out);
}

.active-thumb-text {
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  color: #FFFFFF;
  letter-spacing: -0.01em;
}

.track-segments-row {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  z-index: 1;
}

.track-segment-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  cursor: pointer;
}

.track-segment-item.active {
  opacity: 0;
}

.segment-label {
  font-size: 11.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.due-picker-pill {
  height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-zen-hairline);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.due-picker-pill:hover {
  border-color: rgba(139, 154, 110, 0.4);
}

.due-picker-pill.filled {
  border-color: var(--color-zen-sage);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.14);
}

.due-picker-text {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.due-picker-pill.filled .due-picker-text {
  color: var(--text-primary);
}

.file-drop-box {
  padding: 20px 14px;
  border-radius: 14px;
  border: 1px dashed rgba(139, 154, 110, 0.45);
  background-color: var(--color-bg-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.03);
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

.capture-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 22px 22px;
  flex-shrink: 0;
}

.modal-capsule-btn {
  height: 36px;
  padding: 0 20px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
}

.modal-capsule-btn.ui-btn-secondary {
  background-color: rgba(0, 0, 0, 0.035);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid rgba(0, 0, 0, 0.09);
  color: var(--text-primary);
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
}

.modal-capsule-btn.ui-btn-secondary:hover {
  background-color: rgba(0, 0, 0, 0.065);
  border-color: rgba(0, 0, 0, 0.16);
}

.modal-capsule-btn.ui-btn-primary {
  background: linear-gradient(135deg, #8E9F70 0%, #768758 100%);
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.32), 0 1px 2px rgba(0, 0, 0, 0.06);
}

.modal-capsule-btn.ui-btn-primary[disabled],
.modal-capsule-btn.ui-btn-primary.is-disabled {
  opacity: 0.4;
  box-shadow: none;
}

.modal-capsule-btn::after {
  border: none;
}

@media (max-width: 390px) {
  .top-bar {
    padding-left: 20px;
    padding-right: 20px;
  }

  .home-content {
    padding-left: 20px;
    padding-right: 20px;
  }
}

@media (max-height: 700px) {
  .backlog-card {
    min-height: 132px;
    padding-top: 10px;
    padding-bottom: 10px;
  }
}
</style>
