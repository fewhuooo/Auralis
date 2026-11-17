<template>
  <TabletLayout>
    <view class="t-dashboard">
      <view class="left-column">
        <view class="greeting-header">
          <view class="greeting-meta">
            <text class="greeting-title">{{ greeting }}，{{ displayName }}</text>
            <view class="date-row">
              <text class="date-subtitle num-tabular">{{ selectedDateHeading }}</text>
              <text v-if="selectedDateKey !== todayKey" class="back-today" @click="jumpToToday">今天</text>
            </view>
          </view>
          <view class="ui-btn ui-btn-primary create-task-btn" @click="openCreateModal">
            <LineIcon name="plus" size="15px" color="#FFFFFF" />
            <text>新建任务</text>
          </view>
        </view>

        <view class="week-card zen-card">
          <view class="week-nav">
            <view class="week-arrow" @click="shiftWeek(-7)">
              <LineIcon name="chevron-left" size="15px" color="var(--text-muted)" />
            </view>
            <text class="week-range num-tabular">{{ weekRangeLabel }}</text>
            <view class="week-arrow" @click="shiftWeek(7)">
              <LineIcon name="chevron-right" size="15px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="week-strip">
            <view
              v-for="day in weekDays"
              :key="day.dateKey"
              class="week-day"
              :class="{ active: selectedDateKey === day.dateKey, 'is-today': day.isToday }"
              @click="selectedDateKey = day.dateKey"
            >
              <text class="w-label">{{ day.weekdayLabel }}</text>
              <text class="w-num num-tabular">{{ day.dayNumber }}</text>
              <view class="w-dot" :class="{ visible: hasScheduledOnDate(day.dateKey) }"></view>
            </view>
          </view>
        </view>

        <scroll-view scroll-y :show-scrollbar="false" class="tasks-scroll">
          <view class="task-section">
            <view class="section-header">
              <text class="section-title">日程</text>
              <text class="section-count num-tabular">{{ scheduledForDay.length }}</text>
            </view>

            <view v-if="scheduledForDay.length === 0" class="empty-slot">
              <text class="empty-text">暂无日程</text>
            </view>

            <view v-else class="card-stack">
              <view
                v-for="item in scheduledForDay"
                :key="item.id"
                class="task-row zen-card"
                :class="{ 'is-completed': item.status === 'completed' }"
              >
                <view
                  class="check-circle"
                  :class="{
                    checked: item.status === 'completed',
                    locked: item.id ? taskStore.updatingTaskIds.includes(item.id) : false,
                  }"
                  @click="item.id && taskStore.toggleTaskComplete(item.id)"
                >
                  <LineIcon v-if="item.status === 'completed'" name="check" size="12px" color="#FFFFFF" />
                </view>

                <view class="row-info" @click="item.id && taskStore.toggleTaskComplete(item.id)">
                  <text class="row-title" :class="{ strike: item.status === 'completed' }">{{ item.name }}</text>
                  <view class="row-badges">
                    <text class="time-badge num-tabular">{{ formatLocalTimeHHmm(item.scheduledAt) || '全天' }}</text>
                    <text v-if="item.subject" class="ui-tag">{{ item.subject }}</text>
                    <text v-if="item.dueAt" class="ddl-tag num-tabular">截止 {{ formatShortDate(item.dueAt) }}</text>
                  </view>
                </view>

                <text class="dur-text num-tabular">{{ item.duration || 30 }}m</text>

                <view
                  v-if="item.id && item.status !== 'completed'"
                  class="row-icon-btn"
                  title="移回待办"
                  @click.stop="unscheduleTaskItem(item.id)"
                >
                  <LineIcon name="close" size="14px" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </view>

          <view class="task-section">
            <view class="section-header">
              <text class="section-title">待办</text>
              <text class="section-count num-tabular">{{ taskStore.pendingTasks.length }}</text>
            </view>

            <view v-if="taskStore.pendingTasks.length === 0" class="empty-slot">
              <text class="empty-text">暂无待办</text>
            </view>

            <view v-else class="card-stack">
              <view v-for="todo in taskStore.pendingTasks" :key="todo.id" class="task-row zen-card">
                <view
                  class="check-circle"
                  :class="{ locked: todo.id ? taskStore.updatingTaskIds.includes(todo.id) : false }"
                  @click="todo.id && taskStore.toggleTaskComplete(todo.id)"
                ></view>

                <view class="row-info" @click="todo.id && taskStore.toggleTaskComplete(todo.id)">
                  <text class="row-title">{{ todo.name }}</text>
                  <view v-if="todo.subject || todo.dueAt" class="row-badges">
                    <text v-if="todo.subject" class="ui-tag">{{ todo.subject }}</text>
                    <text v-if="todo.dueAt" class="ddl-tag num-tabular">截止 {{ formatShortDate(todo.dueAt) }}</text>
                  </view>
                </view>

                <picker
                  v-if="todo.id"
                  mode="time"
                  value="09:00"
                  @change="onSchedulePending(todo.id, $event)"
                >
                  <view class="schedule-chip">
                    <text>排入</text>
                  </view>
                </picker>

                <view
                  v-if="todo.id"
                  class="row-icon-btn"
                  @click="confirmDeleteTodo(todo.id, todo.name)"
                >
                  <LineIcon name="trash" size="14px" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="right-column">
        <view class="review-card zen-card">
          <view class="panel-header">
            <text class="panel-title">待复习</text>
            <view class="ui-icon-btn refresh-btn" @click="loadDueCounts">
              <LineIcon name="refresh" size="14px" color="var(--color-sage-dark)" />
            </view>
          </view>

          <view v-if="subjectStore.subjects.length === 0" class="review-empty">
            <text class="empty-text">暂无学科</text>
          </view>

          <scroll-view v-else scroll-y :show-scrollbar="false" class="due-subjects-scroll">
            <view class="due-subject-list">
              <view
                v-for="sub in subjectStore.subjects"
                :key="sub.id"
                class="due-subject-row"
                @click="openSubjectReview(sub.id)"
              >
                <view class="due-sub-left">
                  <view class="sub-icon-badge">
                    <LineIcon
                      :name="`subj-${isSubjectIconKey(sub.icon) ? sub.icon : 'book'}`"
                      size="16px"
                      color="var(--color-sage-dark)"
                    />
                  </view>
                  <text class="sub-name">{{ sub.name }}</text>
                </view>
                <view class="due-sub-right">
                  <text class="due-badge num-tabular" :class="{ active: (dueCounts[sub.id] ?? 0) > 0 }">
                    {{ dueCountText(sub.id) }}
                  </text>
                  <LineIcon name="chevron-right" size="14px" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </scroll-view>
        </view>

        <StudyMetrics />
      </view>
    </view>

    <template #modal>
      <view v-if="showCreateModal" class="zen-modal-mask" @click="closeCreateModal">
        <view class="zen-modal-body create-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">新建任务</text>
            <view class="ui-icon-btn" @click="closeCreateModal">
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
                  <view class="picker-box num-tabular">{{ taskForm.timeHHmm }}</view>
                </picker>
              </view>
              <view class="picker-col">
                <picker mode="date" :value="taskForm.dueDateKey || selectedDateKey" @change="onModalDueDateChange">
                  <view class="picker-box num-tabular">{{ taskForm.dueDateKey || '截止日期' }}</view>
                </picker>
              </view>
            </view>
          </view>

          <view class="modal-footer">
            <view class="ui-btn ui-btn-ghost" @click="closeCreateModal">取消</view>
            <view class="ui-btn ui-btn-primary" :class="{ 'is-disabled': savingTask }" @click="submitCreateTask">
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
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
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
const weekRangeLabel = computed(() => {
  const days = weekDays.value
  return `${formatShortDate(days[0].dateKey)} – ${formatShortDate(days[6].dateKey)}`
})

const scheduledForDay = computed(() => taskStore.getScheduledTasksForDate(selectedDateKey.value))

function hasScheduledOnDate(dateKey: string): boolean {
  return taskStore.allTasks.some(item => !item.is_deleted && item.scheduledAt && toLocalDateKey(item.scheduledAt) === dateKey)
}

function shiftWeek(deltaDays: number) {
  selectedDateKey.value = shiftDateKey(selectedDateKey.value, deltaDays)
}

function jumpToToday() {
  todayKey.value = toLocalDateKey(new Date())
  selectedDateKey.value = todayKey.value
}

async function unscheduleTaskItem(id: string) {
  await taskStore.unscheduleTask(id)
  uni.showToast({ title: '已移回待办', icon: 'none' })
}

async function onSchedulePending(taskId: string, event: { detail?: { value?: string } }) {
  const hhmm = event?.detail?.value
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
const loadingDueCounts = ref(false)
let dueCountRequestId = 0

function dueCountText(subjectId: string): string {
  const count = dueCounts.value[subjectId]
  if (count === undefined) return '复习'
  if (count === 0) return '0'
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
  const isCurrent = () => id === dueCountRequestId
    && generation === authStore.getLoginGeneration()
    && userId === authStore.user?.id
    && deviceId === authStore.serverDeviceId

  loadingDueCounts.value = true
  const at = new Date().toISOString()
  try {
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
    if (!isCurrent()) return
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
  } finally {
    if (isCurrent()) loadingDueCounts.value = false
  }
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
  padding: 24px 26px;
  gap: 20px;
  background-color: var(--color-bg-primary);
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
}

.right-column {
  flex: 4;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.greeting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-shrink: 0;
}

.greeting-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.greeting-title {
  font-size: var(--text-display);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.date-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.date-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.back-today {
  font-size: var(--text-2xs);
  padding: 3px 9px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.create-task-btn {
  height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.week-card {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.week-range {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 0;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.week-day:hover:not(.active) {
  background-color: var(--color-bg-primary);
}

.week-day.active {
  background: var(--accent-gradient);
  box-shadow: var(--accent-glow);
}

.w-label {
  font-size: 11px;
  color: var(--text-muted);
}

.w-num {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.week-day.is-today:not(.active) .w-num {
  color: var(--color-sage-dark);
}

.week-day.active .w-label,
.week-day.active .w-num {
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

.week-day.active .w-dot.visible {
  background-color: #FFFFFF;
}

.tasks-scroll {
  flex: 1;
  min-height: 0;
}

.task-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}

.section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
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
  height: 44px;
  border-radius: 14px;
  border: 1px dashed var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
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

.task-row {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 14px;
  transition: transform 0.16s var(--ease-out);
}

.task-row.is-completed {
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
}

.check-circle.checked {
  background-color: var(--color-zen-sage);
  border-color: var(--color-zen-sage);
}

.check-circle.locked {
  opacity: 0.4;
}

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.row-title {
  font-size: 14.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.row-title.strike {
  text-decoration: line-through;
  color: var(--text-muted);
}

.row-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.time-badge {
  font-size: 11.5px;
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-mono);
  color: var(--color-sage-dark);
}

.ddl-tag {
  font-size: 11px;
  color: var(--color-warning);
  font-weight: var(--font-weight-semibold);
}

.dur-text {
  font-size: 11.5px;
  font-family: var(--font-family-mono);
  color: var(--text-muted);
  flex-shrink: 0;
}

.schedule-chip {
  padding: 5px 11px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.row-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.review-card {
  flex: 1;
  min-height: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
}

.refresh-btn {
  width: 30px;
  height: 30px;
}

.review-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.due-subjects-scroll {
  flex: 1;
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
  padding: 10px 12px;
  border-radius: 12px;
  background-color: var(--color-bg-primary);
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.14s ease;
}

.due-subject-row:hover {
  background-color: var(--color-bg-secondary);
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
  gap: 6px;
  flex-shrink: 0;
}

.due-badge {
  font-size: 12px;
  font-family: var(--font-family-mono);
  padding: 2px 9px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  color: var(--text-muted);
}

.due-badge.active {
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
  background-color: var(--color-bg-primary);
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
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
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
  }

  .left-column,
  .right-column {
    flex: none;
    height: auto;
  }
}
</style>
