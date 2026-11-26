<template>
  <TabletLayout>
    <view class="t-dashboard">
      <view class="left-column zen-panel">
        <view class="greeting-header">
          <text class="greeting-title">{{ greeting }}，{{ displayName }}</text>
          <view
            class="todo-fab-add-btn"
            role="button"
            title="新建任务"
            aria-label="新建任务"
            @click="openCreateModal"
          >
            <LineIcon name="plus" size="16px" color="#FFFFFF" />
          </view>
        </view>

        <ZenWeekStrip
          v-model="selectedDateKey"
          :days="weekDays"
          :scheduled-dates="scheduledDateSet"
          :show-header="true"
          :frameless="true"
        />

        <scroll-view scroll-y :show-scrollbar="false" class="tasks-scroll">
          <view
            v-if="hydrated && scheduledForDay.length === 0 && taskStore.homePendingTasks.length === 0"
            class="clear-day-canvas zen-card"
          >
            <view class="clear-day-halo" aria-hidden="true">
              <LineIcon name="calendar" size="22px" color="var(--color-sage-ink)" />
            </view>
            <text class="clear-day-title">今日无安排</text>
            <view class="ui-btn ui-btn-secondary sm clear-day-cta" role="button" @click="openCreateModal">
              <LineIcon name="plus" size="14px" color="var(--color-sage-ink)" />
              <text>新建任务</text>
            </view>
          </view>

          <template v-else-if="hydrated || scheduledForDay.length > 0 || taskStore.homePendingTasks.length > 0">
            <view class="task-section">
              <view class="section-header">
                <text class="section-title">日程</text>
                <text v-if="scheduledForDay.length > 0" class="section-count num-tabular">
                  {{ scheduledForDay.length }}
                </text>
              </view>

              <view v-if="scheduledForDay.length === 0" class="empty-slot zen-empty-surface">
                <text class="empty-text">暂无日程</text>
              </view>

              <view v-else class="card-stack">
                <ZenTaskRow
                  v-for="item in scheduledForDay"
                  :key="item.id"
                  :task="item"
                  mode="scheduled"
                  :locked="isScheduledTaskLocked(item)"
                  @toggle="toggleTaskItem"
                  @unschedule="unscheduleTaskItem"
                />
              </view>
            </view>

            <view class="task-section">
              <view class="section-header">
                <text class="section-title">待办</text>
                <text v-if="taskStore.homePendingTasks.length > 0" class="section-count num-tabular">
                  {{ taskStore.homePendingTasks.length }}
                </text>
              </view>

              <view v-if="taskStore.homePendingTasks.length === 0" class="empty-slot zen-empty-surface">
                <text class="empty-text">暂无待办</text>
              </view>

              <view v-else class="card-stack">
                <ZenTaskRow
                  v-for="todo in taskStore.homePendingTasks"
                  :key="todo.id"
                  :task="todo"
                  mode="pending"
                  :locked="todo.id ? taskStore.updatingTaskIds.includes(todo.id) : false"
                  @toggle="toggleTaskItem"
                  @delete="confirmDeleteTodo"
                />
              </view>
            </view>
          </template>
        </scroll-view>
      </view>

      <view class="right-column">
        <view class="subjects-card zen-panel">
          <view class="panel-header">
            <text class="panel-title">学科空间</text>
            <text v-if="subjectStore.subjects.length > 0" class="section-count num-tabular">
              {{ subjectStore.subjects.length }}
            </text>
          </view>

          <view v-if="hydrated && subjectStore.subjects.length === 0" class="subjects-empty">
            <text class="empty-text">暂无学科</text>
          </view>

          <scroll-view v-else-if="subjectStore.subjects.length > 0" scroll-y :show-scrollbar="false" class="subjects-scroll">
            <view class="subject-list">
              <view
                v-for="sub in subjectStore.subjects"
                :key="sub.id"
                class="subject-row"
                role="button"
                :aria-label="`进入学科 ${sub.name}`"
                @click="openSubjectWorkspace(sub.id)"
              >
                <view class="subject-row-left">
                  <view class="sub-icon-badge">
                    <LineIcon
                      :name="`subj-${isSubjectIconKey(sub.icon) ? sub.icon : 'book'}`"
                      size="16px"
                      color="var(--color-sage-ink)"
                    />
                  </view>
                  <text class="sub-name">{{ sub.name }}</text>
                </view>
                <view class="subject-row-right">
                  <view class="subject-meta num-tabular">
                    <LineIcon name="layers" size="12px" color="var(--text-muted)" />
                    <text>{{ sub.blockCount || 0 }}</text>
                  </view>
                  <LineIcon name="chevron-right" size="14px" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="metrics-panel zen-panel">
          <StudyMetrics />
        </view>
      </view>
    </view>

    <template #modal>
      <view v-if="showCreateModal" class="zen-modal-mask task-modal-mask" @click="closeCreateModal">
        <view
          class="task-modal"
          role="dialog"
          aria-modal="true"
          aria-label="新建学习任务"
          @click.stop
        >
          <view class="modal-header">
            <text class="modal-title">新建学习任务</text>
            <view
              class="modal-close-btn"
              :class="{ 'is-disabled': savingTask }"
              role="button"
              aria-label="关闭"
              @click="closeCreateModal"
            >
              <LineIcon name="close" size="15px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-body">
            <!-- 任务名称 -->
            <view class="modal-form-group">
              <view class="modal-form-label">
                <text>任务名称</text>
                <text class="required">*</text>
              </view>
              <input
                v-model="taskForm.name"
                class="modal-form-input"
                maxlength="80"
                placeholder="请输入学习或专注任务名称..."
                :disabled="savingTask"
                @confirm="submitCreateTask"
              />
            </view>

            <!-- 所属学科 -->
            <view class="modal-form-group">
              <view class="subject-header">
                <view class="modal-form-label">
                  <text>所属学科</text>
                  <text class="required">*</text>
                </view>
                <text v-if="subjectStore.subjects.length > 0" class="subject-count-hint num-tabular">
                  共 {{ subjectStore.subjects.length }} 门
                </text>
              </view>
              <view v-if="subjectStore.subjects.length === 0" class="empty-hint">
                暂无学科，请先创建学科空间
              </view>
              <view v-else class="subject-grid">
                <view
                  v-for="sub in subjectStore.subjects"
                  :key="sub.id"
                  class="subject-chip"
                  :class="{ active: taskForm.subjectId === sub.id }"
                  role="button"
                  @click="!savingTask && (taskForm.subjectId = sub.id)"
                >
                  <LineIcon
                    :name="`subj-${isSubjectIconKey(sub.icon) ? sub.icon : 'book'}`"
                    size="13px"
                    :color="taskForm.subjectId === sub.id ? '#76855B' : 'var(--text-secondary)'"
                  />
                  <text class="chip-name">{{ sub.name }}</text>
                </view>
              </view>
            </view>

            <!-- 专注时长（PC 同源 7 档整半小时分段滑轨） -->
            <view class="modal-form-group">
              <view class="duration-header">
                <text class="modal-form-label">专注时长</text>
                <view class="duration-value-pill num-tabular">
                  <LineIcon name="clock" size="13px" color="#76855B" />
                  <text>{{ taskForm.duration }} 分钟（{{ (taskForm.duration / 60).toFixed(1) }} 小时）</text>
                </view>
              </view>

              <view class="duration-segmented-track">
                <view class="track-segments-row">
                  <view class="active-thumb-pill" :style="durationThumbStyle">
                    <text class="active-thumb-text num-tabular">{{ activeDurationLabel }}</text>
                  </view>
                  <view
                    v-for="opt in DURATION_OPTIONS"
                    :key="opt.minutes"
                    class="track-segment-item"
                    :class="{ active: taskForm.duration === opt.minutes }"
                    role="button"
                    @click="!savingTask && (taskForm.duration = opt.minutes)"
                  >
                    <text class="segment-label num-tabular">{{ opt.label }}</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- 日程安排（平板专属直接排程） -->
            <view class="modal-form-group">
              <view class="modal-form-label">
                <text>日程安排</text>
                <text class="optional-tag">可选</text>
              </view>
              <view class="schedule-row-card">
                <text class="schedule-date-label">排入 {{ selectedDateHeading }}</text>
                <view class="schedule-controls">
                  <picker
                    v-if="taskForm.scheduled"
                    mode="time"
                    :value="taskForm.timeHHmm"
                    :disabled="savingTask"
                    @change="onModalTimeChange"
                  >
                    <view class="time-pill num-tabular">
                      <LineIcon name="clock" size="13px" color="#76855B" />
                      <text>{{ taskForm.timeHHmm }}</text>
                    </view>
                  </picker>
                  <switch
                    :checked="taskForm.scheduled"
                    :disabled="savingTask"
                    color="#8B9A6E"
                    style="transform: scale(0.84); transform-origin: right center;"
                    @change="onScheduledSwitch"
                  />
                </view>
              </view>
            </view>

            <!-- 截止时间 -->
            <view class="modal-form-group">
              <view class="due-header">
                <view class="modal-form-label">
                  <text>截止时间</text>
                  <text class="optional-tag">可选</text>
                </view>
                <text
                  v-if="taskForm.dueDateKey && !savingTask"
                  class="due-clear-btn"
                  role="button"
                  @click="taskForm.dueDateKey = ''"
                >清除</text>
              </view>

              <picker
                mode="date"
                :value="taskForm.dueDateKey || selectedDateKey"
                :disabled="savingTask"
                @change="onModalDueDateChange"
              >
                <view class="due-picker-box num-tabular" :class="{ 'has-value': Boolean(taskForm.dueDateKey) }">
                  <LineIcon name="calendar" size="14px" :color="taskForm.dueDateKey ? '#76855B' : '#8B9A6E'" />
                  <text class="due-picker-text">{{ taskForm.dueDateKey || '请选择截止日期（可选）' }}</text>
                </view>
              </picker>

              <view class="quick-date-row">
                <view
                  v-for="preset in dueDatePresets"
                  :key="preset.label"
                  class="due-preset-chip"
                  :class="{ active: taskForm.dueDateKey === preset.key }"
                  role="button"
                  @click="!savingTask && toggleDuePreset(preset.key)"
                >
                  <text>{{ preset.label }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="modal-footer">
            <button
              type="button"
              class="modal-btn modal-btn-secondary"
              :disabled="savingTask"
              @click="closeCreateModal"
            >取消</button>
            <button
              type="button"
              class="modal-btn modal-btn-primary"
              :disabled="!canSubmitTask"
              @click="submitCreateTask"
            >{{ savingTask ? '保存中…' : taskForm.scheduled ? '加入日程' : '添加到待办' }}</button>
          </view>
        </view>
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import ZenTaskRow from '@/components/ZenTaskRow.vue'
import ZenWeekStrip from '@/components/ZenWeekStrip.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { confirmDialog, showToast } from '@/platform/feedback'
import { onPageShow } from '@/platform/lifecycle'
import { navigateTo } from '@/platform/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import { findOverlappingScheduledTask, isScheduledCompletionLocked } from '@/utils/taskSyncMapper'
import {
  combineLocalDateAndTime,
  endOfLocalDateIso,
  formatDateHeading,
  getWeekDays,
  shiftDateKey,
  toLocalDateKey,
} from '@/utils/dateKey'
import { isSubjectIconKey } from '@/utils/subjectIcon'

const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const taskStore = useTaskStore()

const displayName = computed(() => authStore.user?.displayName || authStore.username || '同学')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早安'
  if (hour < 18) return '午安'
  return '晚安'
})

const nowClock = ref(new Date())
const todayKey = ref(toLocalDateKey(nowClock.value))
const selectedDateKey = ref(todayKey.value)
const weekDays = computed(() => getWeekDays(todayKey.value, todayKey.value))
const selectedDateHeading = computed(() => formatDateHeading(selectedDateKey.value))

function syncClock() {
  nowClock.value = new Date()
  todayKey.value = toLocalDateKey(nowClock.value)
  if (!weekDays.value.some(day => day.dateKey === selectedDateKey.value)) {
    selectedDateKey.value = todayKey.value
  }
  void taskStore.recoverOverdueTasks()
}

const scheduledForDay = computed(() => taskStore.getScheduledTasksForDate(selectedDateKey.value))
const scheduledDateSet = computed(() => {
  const dates = new Set<string>()
  for (const item of taskStore.allTasks) {
    if (!item.is_deleted && item.status !== 'cancelled' && item.scheduledAt) {
      const key = toLocalDateKey(item.scheduledAt)
      if (key) dates.add(key)
    }
  }
  return dates
})

function isScheduledTaskLocked(task: Task): boolean {
  return Boolean((task.id && taskStore.updatingTaskIds.includes(task.id)) || isScheduledCompletionLocked(task, nowClock.value))
}

async function toggleTaskItem(id: string) {
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

async function unscheduleTaskItem(id: string) {
  const generation = authStore.getLoginGeneration()
  try {
    await taskStore.unscheduleTask(id)
    if (generation !== authStore.getLoginGeneration()) return
    showToast('已移回待办')
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '移回失败，请重试')
  }
}

async function confirmDeleteTodo(id: string, title: string) {
  const generation = authStore.getLoginGeneration()
  const confirmed = await confirmDialog({
    title: '删除待办',
    content: `确定删除「${title}」？`,
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

const DURATION_OPTIONS = [
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 90, label: '1.5h' },
  { minutes: 120, label: '2h' },
  { minutes: 150, label: '2.5h' },
  { minutes: 180, label: '3h' },
  { minutes: 240, label: '4h' },
] as const

const showCreateModal = ref(false)
const savingTask = ref(false)
const taskForm = reactive({
  name: '',
  subjectId: '',
  duration: 60,
  scheduled: true,
  timeHHmm: '09:00',
  dueDateKey: '',
})

const activeDurationIndex = computed(() => {
  const idx = DURATION_OPTIONS.findIndex(opt => opt.minutes === taskForm.duration)
  return idx !== -1 ? idx : 1
})

const activeDurationLabel = computed(() => (
  DURATION_OPTIONS[activeDurationIndex.value]?.label || '1h'
))

const durationThumbStyle = computed(() => {
  const stepPercent = 100 / DURATION_OPTIONS.length
  return {
    left: `${activeDurationIndex.value * stepPercent}%`,
    width: `${stepPercent}%`,
  }
})

const canSubmitTask = computed(() => (
  !savingTask.value
  && taskForm.name.trim().length > 0
  && Boolean(taskForm.subjectId)
))

function findAvailableStartTime(dateKey: string, durationMinutes: number, preferredHHmm: string): string {
  const preferredIso = combineLocalDateAndTime(dateKey, preferredHHmm)
  if (!findOverlappingScheduledTask(taskStore.allTasks, { scheduledAtIso: preferredIso, durationMinutes })) {
    return preferredHHmm
  }
  for (let mins = 8 * 60; mins <= 22 * 60; mins += 30) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    const candidate = `${hh}:${mm}`
    const candidateIso = combineLocalDateAndTime(dateKey, candidate)
    if (!findOverlappingScheduledTask(taskStore.allTasks, { scheduledAtIso: candidateIso, durationMinutes })) {
      return candidate
    }
  }
  return preferredHHmm
}

function openCreateModal() {
  if (!taskForm.subjectId || !subjectStore.subjects.some(item => item.id === taskForm.subjectId)) {
    taskForm.subjectId = subjectStore.subjects[0]?.id || ''
  }
  if (taskForm.scheduled) {
    taskForm.timeHHmm = findAvailableStartTime(selectedDateKey.value, taskForm.duration, taskForm.timeHHmm)
  }
  showCreateModal.value = true
}

function closeCreateModal() {
  if (savingTask.value) return
  showCreateModal.value = false
}

useEscapeKey(() => showCreateModal.value, closeCreateModal)

const dueDatePresets = computed(() => [
  { label: '今天', key: todayKey.value },
  { label: '明天', key: shiftDateKey(todayKey.value, 1) },
  { label: '3天后', key: shiftDateKey(todayKey.value, 3) },
])

function toggleDuePreset(key: string) {
  taskForm.dueDateKey = taskForm.dueDateKey === key ? '' : key
}

function onScheduledSwitch(event: Event) {
  const detail = (event as Event & { detail?: { value?: boolean } }).detail
  taskForm.scheduled = Boolean(detail?.value)
}

function onModalTimeChange(event: { detail?: { value?: string } }) {
  if (event?.detail?.value) taskForm.timeHHmm = event.detail.value
}

function onModalDueDateChange(event: { detail?: { value?: string } }) {
  if (event?.detail?.value) taskForm.dueDateKey = event.detail.value
}

async function submitCreateTask() {
  if (savingTask.value) return
  const title = taskForm.name.trim()
  const subject = subjectStore.subjects.find(item => item.id === taskForm.subjectId)
  if (!title) {
    showToast('请输入名称')
    return
  }
  if (!subject) {
    showToast('请选择学科')
    return
  }

  const scheduledAt = taskForm.scheduled
    ? combineLocalDateAndTime(selectedDateKey.value, taskForm.timeHHmm)
    : undefined
  if (scheduledAt) {
    const overlap = findOverlappingScheduledTask(taskStore.allTasks, {
      scheduledAtIso: scheduledAt,
      durationMinutes: taskForm.duration,
    })
    if (overlap) {
      showToast(`与日程「${overlap.name}」时段冲突，请调整时间或关闭按时段排期`)
      return
    }
  }

  const generation = authStore.getLoginGeneration()
  savingTask.value = true
  try {
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
    showCreateModal.value = false
    showToast(scheduledAt ? '已加入日程' : '已加入待办')
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '保存失败')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      savingTask.value = false
    }
  }
}

function openSubjectWorkspace(subjectId: string) {
  navigateTo(`/pages/tablet/workspace/index?id=${subjectId}`)
}

let clockTimer: ReturnType<typeof setInterval> | null = null

onPageShow(() => {
  syncClock()
  void subjectStore.loadSubjects()
})

const hydrated = ref(false)

async function hydrateDashboardData() {
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
  () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId],
  () => {
    hydrated.value = false
    showCreateModal.value = false
    savingTask.value = false
    taskForm.name = ''
    taskForm.dueDateKey = ''
    if (!authStore.isAuthenticated) return
    void hydrateDashboardData()
  },
)

onMounted(async () => {
  clockTimer = setInterval(syncClock, 30000)
  if (!authStore.isAuthenticated) return
  await hydrateDashboardData()
})

onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<style scoped>
.t-dashboard {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  padding: 16px;
  gap: 14px;
  background-color: transparent;
  box-sizing: border-box;
  overflow: hidden;
}

.left-column {
  flex: 6;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 22px 24px;
  box-sizing: border-box;
}

.right-column {
  flex: 4;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

.greeting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-shrink: 0;
}

.greeting-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.todo-fab-add-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-gradient);
  box-shadow: 0 3px 10px rgba(118, 135, 88, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s ease;
}

.todo-fab-add-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 5px 14px rgba(118, 135, 88, 0.36);
}

.todo-fab-add-btn:active {
  transform: scale(0.92);
}

.tasks-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.clear-day-canvas {
  padding: 44px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 18px;
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

.task-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
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
}

.section-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.empty-slot {
  height: 38px;
}

.empty-text {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.card-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subjects-card {
  flex: 1;
  min-height: 0;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metrics-panel {
  padding: 16px;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.panel-title {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.015em;
}

.subjects-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.subjects-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.subject-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subject-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 13px;
  border-radius: 13px;
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease, box-shadow 0.16s ease;
}

.subject-row:hover {
  border-color: var(--border-accent);
  transform: translateX(2px);
}

.subject-row:active {
  transform: scale(0.985);
}

.subject-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sub-icon-badge {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sub-name {
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subject-row-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.subject-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.task-modal-mask {
  background-color: rgba(28, 28, 26, 0.42);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  padding: 24px;
}

.task-modal {
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 48px);
  background: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow:
    0 24px 64px -12px rgba(0, 0, 0, 0.13),
    0 8px 24px -6px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  animation: uiModalIn 0.22s var(--ease-out) both;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 28px 12px;
  flex-shrink: 0;
}

.modal-title {
  font-size: 16.5px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.18s ease, transform 0.2s var(--ease-out);
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.05);
}

.modal-close-btn.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.modal-body {
  padding: 8px 28px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-sizing: border-box;
}

.modal-form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-form-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.modal-form-label .required {
  color: #D14343;
  font-weight: 700;
}

.optional-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  margin-left: 2px;
}

.modal-form-input {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  font-size: 13.5px;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04), 0 0.5px 1.5px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), background-color 0.2s ease;
}

/* #ifdef H5 */
.modal-form-input:focus {
  outline: none;
  border-color: var(--color-zen-sage);
  background: #FDFBF8;
  box-shadow: 0 0 0 3.5px rgba(139, 154, 110, 0.14), 0 2px 8px rgba(139, 154, 110, 0.12);
}
/* #endif */

.subject-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subject-count-hint {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 0;
}

.subject-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 3px 3px 6px;
}

.subject-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6.5px 14px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
  transition: all 0.2s var(--ease-out);
  max-width: 100%;
}

.subject-chip:hover {
  border-color: var(--color-zen-sage);
  color: var(--color-sage-dark);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}

.subject-chip.active {
  background: rgba(139, 154, 110, 0.14);
  border-color: var(--color-zen-sage);
  color: var(--color-sage-dark);
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.16), 0 3px 10px rgba(139, 154, 110, 0.18);
}

.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duration-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.duration-value-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-sage-dark);
  background: rgba(139, 154, 110, 0.12);
  border: 1px solid rgba(139, 154, 110, 0.2);
  padding: 3px 12px;
  border-radius: var(--radius-full);
}

.duration-segmented-track {
  position: relative;
  height: 44px;
  padding: 3px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 1.5px 4px rgba(0, 0, 0, 0.04);
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
  transition: border-color 0.2s ease;
}

.duration-segmented-track:hover {
  border-color: rgba(139, 154, 110, 0.35);
}

.track-segments-row {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
}

.active-thumb-pill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.36), 0 1px 2px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  pointer-events: none;
  box-sizing: border-box;
  transition: left 0.22s var(--ease-out);
}

.active-thumb-text {
  font-size: 12.5px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: -0.01em;
}

.track-segment-item {
  flex: 1;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border-radius: var(--radius-full);
  cursor: pointer;
}

.track-segment-item.active {
  opacity: 0;
}

.segment-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  transition: color 0.16s ease;
}

.track-segment-item:hover .segment-label {
  color: var(--text-primary);
}

.schedule-row-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  border: 1px solid rgba(0, 0, 0, 0.07);
  box-sizing: border-box;
}

.schedule-date-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.schedule-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-pill {
  height: 30px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  background: rgba(139, 154, 110, 0.14);
  border: 1px solid rgba(139, 154, 110, 0.28);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-sage-dark);
  cursor: pointer;
}

.due-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.due-clear-btn {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-sage-dark);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  transition: background-color 0.16s ease;
}

.due-clear-btn:hover {
  background: rgba(139, 154, 110, 0.12);
}

.due-picker-box {
  width: 100%;
  height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.due-picker-box:hover {
  border-color: rgba(139, 154, 110, 0.4);
}

.due-picker-box.has-value {
  color: var(--text-primary);
  font-weight: 500;
  border-color: rgba(139, 154, 110, 0.45);
}

.due-picker-text {
  flex: 1;
  min-width: 0;
}

.quick-date-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.due-preset-chip {
  height: 26px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1px solid rgba(0, 0, 0, 0.08);
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.16s ease;
}

.due-preset-chip:hover {
  border-color: var(--color-zen-sage);
  color: var(--color-sage-dark);
}

.due-preset-chip.active {
  background: rgba(139, 154, 110, 0.14);
  border-color: var(--color-zen-sage);
  color: var(--color-sage-dark);
  font-weight: 600;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 28px 24px;
  flex-shrink: 0;
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 20px;
  margin: 0;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border: none;
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.2s var(--ease-out);
}

.modal-btn::after {
  border: none;
}

.modal-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.modal-btn-secondary {
  background: rgba(0, 0, 0, 0.035);
  border: 1px solid rgba(0, 0, 0, 0.09);
  color: var(--text-primary);
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
}

.modal-btn-secondary:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.065);
  border-color: rgba(0, 0, 0, 0.16);
}

.modal-btn-primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.32), 0 1px 2px rgba(0, 0, 0, 0.06);
}

.modal-btn-primary:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(118, 135, 88, 0.42), 0 2px 4px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

@media (max-width: 900px) {
  .t-dashboard {
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
  }

  .left-column,
  .right-column {
    flex: none;
    height: auto;
  }

  .tasks-scroll,
  .subjects-scroll {
    flex: none;
    height: auto;
    max-height: 420px;
  }
}
</style>
