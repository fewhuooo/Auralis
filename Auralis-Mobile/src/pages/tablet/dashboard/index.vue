<template>
  <TabletLayout>
    <view class="t-dashboard">
      <view class="left-column">
        <view class="greeting-header">
          <view class="greeting-meta">
            <text class="greeting-title">{{ greeting }}，{{ displayName }}</text>
            <view class="date-row">
              <text class="date-subtitle">{{ selectedDateHeading }}</text>
              <text v-if="selectedDateKey !== todayKey" class="back-today" @click="jumpToToday">回到今天</text>
            </view>
          </view>
          <view class="primary-create-btn" @click="openCreateModal">
            <LineIcon name="plus" size="28rpx" color="#FFFFFF" />
            <text>新建任务</text>
          </view>
        </view>

        <view class="week-card zen-card">
          <view class="week-nav">
            <view class="week-arrow" @click="shiftWeek(-7)">
              <LineIcon name="chevron-left" size="26rpx" color="var(--text-muted)" />
            </view>
            <text class="week-range">{{ weekRangeLabel }}</text>
            <view class="week-arrow" @click="shiftWeek(7)">
              <LineIcon name="chevron-right" size="26rpx" color="var(--text-muted)" />
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
              <text class="w-num">{{ day.dayNumber }}</text>
              <view class="w-dot" :class="{ visible: hasScheduledOnDate(day.dateKey) }"></view>
            </view>
          </view>
        </view>

        <scroll-view scroll-y :show-scrollbar="false" class="tasks-scroll">
          <view class="task-section">
            <view class="section-header">
              <text class="section-title">当日日程</text>
              <text class="section-count">{{ scheduledForDay.length }} 项</text>
            </view>

            <view v-if="scheduledForDay.length === 0" class="empty-box zen-card">
              <text class="empty-text">{{ selectedDateHeading }} 暂无已排期任务</text>
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
                  <LineIcon v-if="item.status === 'completed'" name="check" size="20rpx" color="#FFFFFF" />
                </view>

                <view class="row-info" @click="item.id && taskStore.toggleTaskComplete(item.id)">
                  <view class="row-badges">
                    <text class="time-badge">{{ formatLocalTimeHHmm(item.scheduledAt) || '全天' }}</text>
                    <text v-if="item.subject" class="subject-tag">{{ item.subject }}</text>
                    <text v-if="item.dueAt" class="ddl-tag">截止 {{ formatShortDate(item.dueAt) }}</text>
                  </view>
                  <text class="row-title" :class="{ strike: item.status === 'completed' }">{{ item.name }}</text>
                </view>

                <text class="dur-text">{{ item.duration || 30 }} 分钟</text>

                <view
                  v-if="item.id && item.status !== 'completed'"
                  class="row-icon-btn"
                  title="移回待办清单"
                  @click.stop="unscheduleTaskItem(item.id)"
                >
                  <LineIcon name="close" size="24rpx" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </view>

          <view class="task-section">
            <view class="section-header">
              <text class="section-title">待办清单</text>
              <text class="section-count">{{ taskStore.pendingTasks.length }} 项</text>
            </view>

            <view v-if="taskStore.pendingTasks.length === 0" class="empty-box zen-card">
              <text class="empty-text">暂无待办任务</text>
            </view>

            <view v-else class="card-stack">
              <view v-for="todo in taskStore.pendingTasks" :key="todo.id" class="task-row zen-card">
                <view
                  class="check-circle"
                  :class="{ locked: todo.id ? taskStore.updatingTaskIds.includes(todo.id) : false }"
                  @click="todo.id && taskStore.toggleTaskComplete(todo.id)"
                ></view>

                <view class="row-info">
                  <view class="row-badges">
                    <text v-if="todo.subject" class="subject-tag">{{ todo.subject }}</text>
                    <text v-if="todo.dueAt" class="ddl-tag">截止 {{ formatShortDate(todo.dueAt) }}</text>
                  </view>
                  <text class="row-title">{{ todo.name }}</text>
                </view>

                <picker
                  v-if="todo.id"
                  mode="time"
                  value="09:00"
                  @change="onSchedulePending(todo.id, $event)"
                >
                  <view class="schedule-chip">
                    <text>排入该日</text>
                  </view>
                </picker>

                <view
                  v-if="todo.id"
                  class="row-icon-btn"
                  @click="confirmDeleteTodo(todo.id, todo.name)"
                >
                  <LineIcon name="trash" size="24rpx" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="right-column">
        <view class="review-card zen-card">
          <view class="panel-header">
            <text class="panel-title">学科待复习</text>
            <view class="refresh-pill" @click="loadDueCounts">
              <LineIcon name="refresh" size="24rpx" color="var(--color-zen-sage)" />
              <text>{{ loadingDueCounts ? '加载中' : '刷新' }}</text>
            </view>
          </view>

          <view v-if="subjectStore.subjects.length === 0" class="review-empty">
            <text class="empty-text">请先在「学科大厅」创建学科空间</text>
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
                      size="30rpx"
                      color="var(--color-zen-sage)"
                    />
                  </view>
                  <text class="sub-name">{{ sub.name }}</text>
                </view>
                <view class="due-sub-right">
                  <text class="due-badge" :class="{ active: (dueCounts[sub.id] ?? 0) > 0 }">
                    {{ dueCountText(sub.id) }}
                  </text>
                  <LineIcon name="chevron-right" size="24rpx" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="metrics-wrap">
          <text class="panel-caption">全局学习指标</text>
          <StudyMetrics />
        </view>
      </view>
    </view>

    <template #modal>
      <view v-if="showCreateModal" class="zen-modal-mask" @click="closeCreateModal">
        <view class="zen-modal-body create-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">新建学习任务</text>
            <view class="modal-close" @click="closeCreateModal">
              <LineIcon name="close" size="28rpx" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-form">
            <view class="field-group">
              <text class="field-label">任务名称</text>
              <input
                class="zen-input"
                v-model="taskForm.name"
                placeholder="输入具体学习内容…"
                :disabled="savingTask"
              />
            </view>

            <view class="field-group">
              <text class="field-label">所属学科</text>
              <view v-if="subjectStore.subjects.length === 0" class="empty-text">暂无可选学科，请先创建学科</view>
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
              <view>
                <text class="field-label">排入 {{ selectedDateHeading }}</text>
                <text class="switch-sub">{{ taskForm.scheduled ? '创建后直接展示在当日日程' : '创建为未排期待办' }}</text>
              </view>
              <switch :checked="taskForm.scheduled" color="#8B9A6E" @change="onScheduledSwitch" />
            </view>

            <view class="dual-row">
              <view v-if="taskForm.scheduled" class="picker-col">
                <text class="field-label">开始时间</text>
                <picker mode="time" :value="taskForm.timeHHmm" @change="onModalTimeChange">
                  <view class="picker-box">{{ taskForm.timeHHmm }}</view>
                </picker>
              </view>
              <view class="picker-col">
                <text class="field-label">截止日期（可选）</text>
                <picker mode="date" :value="taskForm.dueDateKey || selectedDateKey" @change="onModalDueDateChange">
                  <view class="picker-box">{{ taskForm.dueDateKey || '不设置 DDL' }}</view>
                </picker>
              </view>
            </view>
          </view>

          <view class="modal-footer">
            <view class="btn ghost-btn" @click="closeCreateModal">取消</view>
            <view class="btn save-btn" :class="{ disabled: savingTask }" @click="submitCreateTask">
              {{ savingTask ? '保存中…' : '保存任务' }}
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
  if (hour < 18) return '午后'
  return '晚安'
})

const todayKey = ref(toLocalDateKey(new Date()))
const selectedDateKey = ref(todayKey.value)
const weekDays = computed(() => getWeekDays(selectedDateKey.value, todayKey.value))
const selectedDateHeading = computed(() => formatDateHeading(selectedDateKey.value))
const weekRangeLabel = computed(() => {
  const days = weekDays.value
  return `${formatShortDate(days[0].dateKey)} - ${formatShortDate(days[6].dateKey)}`
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
  uni.showToast({ title: '已移回待办清单', icon: 'none' })
}

async function onSchedulePending(taskId: string, event: { detail?: { value?: string } }) {
  const hhmm = event?.detail?.value
  if (!hhmm) return
  await taskStore.scheduleTask(taskId, combineLocalDateAndTime(selectedDateKey.value, hhmm))
  uni.showToast({ title: `已排入 ${selectedDateHeading.value} ${hhmm}`, icon: 'none' })
}

function confirmDeleteTodo(id: string, title: string) {
  uni.showModal({
    title: '删除待办',
    content: `确定要删除「${title}」吗？`,
    success: (res) => {
      if (res.confirm) void taskStore.removeTask(id)
    },
  })
}

// Create Task Modal
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
    uni.showToast({ title: '请输入任务名称', icon: 'none' })
    return
  }
  if (!subject) {
    uni.showToast({ title: '请选择所属学科', icon: 'none' })
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
    uni.showToast({ title: scheduledAt ? '已加入当日日程' : '已加入待办清单', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '任务保存失败', icon: 'none' })
  } finally {
    savingTask.value = false
  }
}

// Per-subject Due Review Shortcuts
const dueCounts = ref<Record<string, number>>({})
const dueHasMore = ref<Record<string, boolean>>({})
const loadingDueCounts = ref(false)
let dueCountRequestId = 0

function dueCountText(subjectId: string): string {
  const count = dueCounts.value[subjectId]
  if (count === undefined) return '点击复习'
  if (count === 0) return '暂无到期'
  return dueHasMore.value[subjectId] ? `${count}+ 张待复习` : `${count} 张待复习`
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
  padding: 40rpx 44rpx;
  gap: 32rpx;
  background-color: var(--color-bg-primary);
  box-sizing: border-box;
  overflow: hidden;
}

.left-column {
  flex: 6;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  height: 100%;
}

.right-column {
  flex: 4;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  height: 100%;
}

.greeting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  flex-shrink: 0;
}

.greeting-meta {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.greeting-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.date-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.date-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.back-today {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.primary-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 28rpx;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  box-shadow: 0 8rpx 20rpx rgba(139, 154, 110, 0.24);
  cursor: pointer;
  flex-shrink: 0;
}

.week-card {
  padding: 18rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex-shrink: 0;
}

.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.week-arrow {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.week-range {
  font-size: 22rpx;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.week-strip {
  display: flex;
  justify-content: space-between;
  gap: 8rpx;
}

.week-day {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 12rpx 0;
  border-radius: 20rpx;
  cursor: pointer;
}

.week-day.active {
  background: var(--accent-gradient);
}

.w-label {
  font-size: 20rpx;
  color: var(--text-muted);
}

.w-num {
  font-size: 26rpx;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.week-day.is-today:not(.active) .w-num {
  color: var(--color-zen-sage);
}

.week-day.active .w-label,
.week-day.active .w-num {
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
  gap: 12rpx;
  margin-bottom: 24rpx;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.section-count {
  font-size: 22rpx;
  color: var(--text-muted);
}

.empty-box {
  padding: 28rpx;
  text-align: center;
}

.empty-text {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.card-stack {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.task-row {
  padding: 20rpx 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.task-row.is-completed {
  opacity: 0.62;
}

.check-circle {
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
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
  opacity: 0.45;
}

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.row-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8rpx;
}

.time-badge {
  font-size: 22rpx;
  font-family: var(--font-family-mono);
  font-weight: var(--font-weight-semibold);
  color: var(--color-zen-sage);
}

.subject-tag {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  color: var(--text-muted);
}

.ddl-tag {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: var(--radius-full);
  background-color: rgba(200, 155, 109, 0.16);
  color: #8C6235;
}

.row-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.row-title.strike {
  text-decoration: line-through;
  color: var(--text-muted);
}

.dur-text {
  font-size: 22rpx;
  color: var(--text-muted);
  font-family: var(--font-family-mono);
  flex-shrink: 0;
}

.schedule-chip {
  padding: 8rpx 16rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.row-icon-btn {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.row-icon-btn:hover {
  background-color: var(--color-bg-primary);
}

.review-card {
  flex: 1;
  min-height: 0;
  padding: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.refresh-pill {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 16rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
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
  gap: 12rpx;
}

.due-subject-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 20rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 22rpx;
  cursor: pointer;
}

.due-sub-left {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-width: 0;
}

.sub-icon-badge {
  width: 52rpx;
  height: 52rpx;
  border-radius: 16rpx;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sub-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.due-sub-right {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
}

.due-badge {
  font-size: 22rpx;
  padding: 6rpx 14rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  color: var(--text-muted);
}

.due-badge.active {
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-bold);
}

.metrics-wrap {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  flex-shrink: 0;
}

.panel-caption {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  padding-left: 8rpx;
}

.create-modal {
  max-width: 780rpx;
  padding: 36rpx;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.modal-close {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.modal-form {
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

.zen-input {
  height: 82rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 20rpx;
  padding: 0 22rpx;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  box-sizing: border-box;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.chip-item {
  padding: 10rpx 20rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: 24rpx;
  color: var(--text-secondary);
  cursor: pointer;
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
  padding: 14rpx 20rpx;
  background-color: var(--color-bg-primary);
  border-radius: 20rpx;
}

.switch-sub {
  display: block;
  font-size: 20rpx;
  color: var(--text-muted);
  margin-top: 4rpx;
}

.dual-row {
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
  height: 76rpx;
  line-height: 76rpx;
  padding: 0 22rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 18rpx;
  font-size: var(--font-size-xs);
  color: var(--text-primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 28rpx;
}

.btn {
  padding: 16rpx 32rpx;
  border-radius: 20rpx;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.ghost-btn {
  background-color: var(--color-bg-primary);
  color: var(--text-secondary);
}

.save-btn {
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.save-btn.disabled {
  opacity: 0.55;
}
</style>
