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
          @shift-week="shiftWeek"
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
                  :locked="item.id ? taskStore.updatingTaskIds.includes(item.id) : false"
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
                  @schedule-time="onSchedulePending"
                  @delete="confirmDeleteTodo"
                />
              </view>
            </view>
          </template>
        </scroll-view>
      </view>

      <view class="right-column">
        <view class="review-card zen-panel">
          <view class="panel-header">
            <text class="panel-title">待复习</text>
            <view class="ui-icon-btn sm" role="button" aria-label="刷新待复习" @click="loadDueCounts">
              <LineIcon name="refresh" size="14px" color="var(--color-sage-ink)" />
            </view>
          </view>

          <view v-if="subjectStore.subjects.length === 0" class="review-empty">
            <text class="empty-text">暂无学科</text>
          </view>

          <scroll-view v-else scroll-y :show-scrollbar="false" class="due-subjects-scroll">
            <view class="due-subject-list">
              <view
                v-for="sub in sortedReviewSubjects"
                :key="sub.id"
                class="due-subject-row"
                :class="{ 'is-quiet': (dueCounts[sub.id] ?? 0) === 0 }"
                role="button"
                @click="openSubjectReview(sub.id)"
              >
                <view class="due-sub-left">
                  <view class="sub-icon-badge">
                    <LineIcon
                      :name="`subj-${isSubjectIconKey(sub.icon) ? sub.icon : 'book'}`"
                      size="16px"
                      color="var(--color-sage-ink)"
                    />
                  </view>
                  <text class="sub-name">{{ sub.name }}</text>
                </view>
                <view class="due-sub-right">
                  <text v-if="(dueCounts[sub.id] ?? 0) > 0" class="due-badge active num-tabular">
                    {{ dueCountText(sub.id) }}
                  </text>
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { reviewApi } from '@/api/reviewApi'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import ZenTaskRow from '@/components/ZenTaskRow.vue'
import ZenWeekStrip from '@/components/ZenWeekStrip.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'
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

const todayKey = ref(toLocalDateKey(new Date()))
const selectedDateKey = ref(todayKey.value)
const weekDays = computed(() => getWeekDays(selectedDateKey.value, todayKey.value))
const selectedDateHeading = computed(() => formatDateHeading(selectedDateKey.value))

const scheduledForDay = computed(() => taskStore.getScheduledTasksForDate(selectedDateKey.value))
const scheduledDateSet = computed(() => {
  const dates = new Set<string>()
  for (const item of taskStore.allTasks) {
    if (!item.is_deleted && item.scheduledAt) {
      const key = toLocalDateKey(item.scheduledAt)
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

async function toggleTaskItem(id: string) {
  await taskStore.toggleTaskComplete(id)
}

async function unscheduleTaskItem(id: string) {
  await taskStore.unscheduleTask(id)
  uni.showToast({ title: '已移回待办', icon: 'none' })
}

async function onSchedulePending(taskId: string, hhmm: string) {
  if (!hhmm) return
  await taskStore.scheduleTask(taskId, combineLocalDateAndTime(selectedDateKey.value, hhmm))
  uni.showToast({ title: `已排入 ${hhmm}`, icon: 'none' })
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

const dueCounts = ref<Record<string, number>>({})
const dueHasMore = ref<Record<string, boolean>>({})
let dueCountRequestId = 0

const sortedReviewSubjects = computed(() => (
  [...subjectStore.subjects].sort((a, b) => (dueCounts.value[b.id] ?? 0) - (dueCounts.value[a.id] ?? 0))
))

function dueCountText(subjectId: string): string {
  const count = dueCounts.value[subjectId] ?? 0
  return dueHasMore.value[subjectId] ? `${count}+` : `${count}`
}

async function loadDueCounts() {
  if (!authStore.isAuthenticated || subjectStore.subjects.length === 0) {
    dueCounts.value = {}
    dueHasMore.value = {}
    return
  }
  const id = ++dueCountRequestId
  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const deviceId = authStore.serverDeviceId
  const at = new Date().toISOString()
  const entries = await Promise.all(
    subjectStore.subjects.map(async (sub) => {
      try {
        const page = await reviewApi.queue(at, undefined, sub.id)
        return {
          id: sub.id,
          count: page.items?.length ?? 0,
          hasMore: Boolean(page.hasMore),
        }
      } catch {
        return null
      }
    }),
  )
  if (
    id !== dueCountRequestId
    || generation !== authStore.getLoginGeneration()
    || userId !== authStore.user?.id
    || deviceId !== authStore.serverDeviceId
  ) return
  const nextCounts: Record<string, number> = {}
  const nextMore: Record<string, boolean> = {}
  for (const item of entries) {
    if (item) {
      nextCounts[item.id] = item.count
      nextMore[item.id] = item.hasMore
    }
  }
  dueCounts.value = nextCounts
  dueHasMore.value = nextMore
}

function openSubjectReview(subjectId: string) {
  uni.navigateTo({ url: `/pages/tablet/workspace/index?id=${subjectId}&panel=review` })
}

watch(() => subjectStore.subjects.map(item => item.id).join(','), () => {
  void loadDueCounts()
})

onMounted(async () => {
  await subjectStore.loadSubjects()
  await taskStore.fetchTasks()
  await loadDueCounts()
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
  background-color: var(--color-bg-secondary);
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

.review-card {
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

.review-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.due-subjects-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.due-subject-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.due-subject-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 13px;
  border-radius: 13px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease, opacity 0.16s ease;
}

.due-subject-row.is-quiet {
  opacity: 0.78;
}

.due-subject-row:hover {
  opacity: 1;
  border-color: var(--border-accent);
  transform: translateX(2px);
}

.due-subject-row:active {
  transform: scale(0.985);
}

.due-sub-left {
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

.due-sub-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.due-badge {
  font-size: var(--font-size-xs);
  padding: 2px 9px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
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
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  font-size: 12.5px;
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
  .due-subjects-scroll {
    flex: none;
    height: auto;
    max-height: 420px;
  }
}
</style>
