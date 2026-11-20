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
          :today-key="todayKey"
          :days="weekDays"
          :scheduled-dates="scheduledDateSet"
          :show-header="true"
          :frameless="true"
          @jump-today="jumpToToday"
        />

        <scroll-view scroll-y :show-scrollbar="false" class="tasks-scroll">
          <view
            v-if="scheduledForDay.length === 0 && taskStore.pendingTasks.length === 0"
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

          <template v-else>
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
                <text v-if="taskStore.pendingTasks.length > 0" class="section-count num-tabular">
                  {{ taskStore.pendingTasks.length }}
                </text>
              </view>

              <view v-if="taskStore.pendingTasks.length === 0" class="empty-slot zen-empty-surface">
                <text class="empty-text">暂无待办</text>
              </view>

              <view v-else class="card-stack">
                <ZenTaskRow
                  v-for="todo in taskStore.pendingTasks"
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

          <view v-if="subjectStore.subjects.length === 0" class="subjects-empty">
            <text class="empty-text">暂无学科</text>
          </view>

          <scroll-view v-else scroll-y :show-scrollbar="false" class="subjects-scroll">
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
      <view v-if="showCreateModal" class="zen-modal-mask" @click="closeCreateModal">
        <view class="zen-modal-body create-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">新建任务</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeCreateModal">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-form">
            <input
              class="ui-input"
              v-model="taskForm.name"
              placeholder="任务名称"
              :disabled="savingTask"
            />

            <view v-if="subjectStore.subjects.length === 0" class="empty-text">暂无学科</view>
            <view v-else class="chips-row">
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
            </view>

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
              <switch :checked="taskForm.scheduled" color="#8B9A6E" @change="onScheduledSwitch" />
            </view>

            <view class="dual-row">
              <view v-if="taskForm.scheduled" class="picker-col">
                <picker mode="time" :value="taskForm.timeHHmm" @change="onModalTimeChange">
                  <view class="picker-box num-tabular">
                    <LineIcon name="clock" size="13px" color="var(--color-sage-ink)" />
                    <text>{{ taskForm.timeHHmm }}</text>
                  </view>
                </picker>
              </view>
              <view class="picker-col">
                <picker mode="date" :value="taskForm.dueDateKey || selectedDateKey" @change="onModalDueDateChange">
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
          </view>

          <view class="modal-footer">
            <view class="ui-btn ui-btn-ghost" role="button" @click="closeCreateModal">取消</view>
            <view class="ui-btn ui-btn-primary" :class="{ 'is-disabled': savingTask }" role="button" @click="submitCreateTask">
              {{ savingTask ? '保存中…' : '保存' }}
            </view>
          </view>
        </view>
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import ZenTaskRow from '@/components/ZenTaskRow.vue'
import ZenWeekStrip from '@/components/ZenWeekStrip.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import { isScheduledCompletionLocked } from '@/utils/taskSyncMapper'
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

function jumpToToday() {
  nowClock.value = new Date()
  todayKey.value = toLocalDateKey(nowClock.value)
  selectedDateKey.value = todayKey.value
}

function isScheduledTaskLocked(task: Task): boolean {
  return Boolean((task.id && taskStore.updatingTaskIds.includes(task.id)) || isScheduledCompletionLocked(task, nowClock.value))
}

async function toggleTaskItem(id: string) {
  if (taskStore.updatingTaskIds.includes(id)) return
  const task = taskStore.allTasks.find(item => item.id === id)
  if (isScheduledCompletionLocked(task, nowClock.value)) {
    uni.showToast({ title: '任务时段已结束，完成状态不可取消', icon: 'none' })
    return
  }
  await taskStore.toggleTaskComplete(id)
}

async function unscheduleTaskItem(id: string) {
  await taskStore.unscheduleTask(id)
  uni.showToast({ title: '已移回待办', icon: 'none' })
}

function confirmDeleteTodo(id: string, title: string) {
  uni.showModal({
    title: '删除待办',
    content: `确定删除「${title}」？`,
    confirmColor: '#C93B3B',
    success: (res) => {
      if (res.confirm) void taskStore.removeTask(id)
    },
  })
}

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

function openCreateModal() {
  if (!taskForm.subjectId) {
    taskForm.subjectId = subjectStore.subjects[0]?.id || ''
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
    uni.showToast({ title: '请输入名称', icon: 'none' })
    return
  }
  if (!subject) {
    uni.showToast({ title: '请选择学科', icon: 'none' })
    return
  }

  const generation = authStore.getLoginGeneration()
  savingTask.value = true
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
    showCreateModal.value = false
    uni.showToast({ title: scheduledAt ? '已加入日程' : '已加入待办', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    savingTask.value = false
  }
}

function openSubjectWorkspace(subjectId: string) {
  uni.navigateTo({ url: `/pages/tablet/workspace/index?id=${subjectId}` })
}

let clockTimer: ReturnType<typeof setInterval> | null = null

onShow(() => {
  syncClock()
  void subjectStore.loadSubjects()
})

onMounted(async () => {
  clockTimer = setInterval(syncClock, 30000)
  await subjectStore.loadSubjects()
  await taskStore.fetchTasks()
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

.create-modal {
  max-width: 460px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 18px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip-item {
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
}

.chip-item.active {
  background-color: rgba(139, 154, 110, 0.16);
  border-color: rgba(255, 255, 255, 0.78);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.74);
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}

.field-label {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.dual-row {
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
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
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
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
