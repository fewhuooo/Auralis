<template>
  <TabletLayout>
    <view class="t-pomodoro">
      <view class="main-content">
        <view class="left-column">
          <TimerCore @center-click="openTaskPicker" />
        </view>

        <view class="right-column">
          <view class="panel-card zen-card">
            <view class="card-header">
              <text class="card-title">当前专注任务</text>
            </view>
            <view
              class="task-box"
              :class="{ 'is-locked': focusStore.isTaskLocked }"
              @click="openTaskPicker"
            >
              <LineIcon
                :name="focusStore.isTaskLocked ? 'lock' : 'calendar'"
                size="32rpx"
                color="var(--color-zen-sage)"
              />
              <text class="task-name" :class="{ placeholder: !focusStore.selectedTaskTitle }">
                {{ focusStore.selectedTaskTitle || '自由学习（点击选择关联任务）' }}
              </text>
              <LineIcon name="chevron-down" size="30rpx" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="focusStore.lastCompletedTask" class="panel-card zen-card prompt-card">
            <text class="card-title">本轮专注已完成</text>
            <text class="prompt-desc">是否将「{{ focusStore.lastCompletedTask.title }}」标记为已完成？</text>
            <view class="prompt-actions">
              <view class="prompt-btn ghost" @click="focusStore.dismissCompletedTaskPrompt()">暂不</view>
              <view class="prompt-btn primary" @click="completeBoundTask">标记完成</view>
            </view>
          </view>

          <view class="panel-card zen-card">
            <view class="card-header">
              <text class="card-title">今日专注统计</text>
            </view>
            <view class="stats-container">
              <view class="stat-col">
                <text class="stat-val">{{ focusStore.todayRounds }}</text>
                <text class="stat-label">完成轮次</text>
              </view>
              <view class="stat-divider"></view>
              <view class="stat-col">
                <view class="val-wrapper">
                  <text class="stat-val">{{ focusStore.todayFocusMinutes }}</text>
                  <text class="stat-unit">m</text>
                </view>
                <text class="stat-label">专注时长</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <template #modal>
      <TaskSelectSheet
        v-model:visible="showTaskSelect"
        :selected-task-id="focusStore.selectedTaskId"
        @select="onTaskSelect"
      />
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import LineIcon from '@/components/LineIcon.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useFocusStore } from '@/store/useFocusStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import TimerCore from './TimerCore.vue'

const focusStore = useFocusStore()
const taskStore = useTaskStore()
const showTaskSelect = ref(false)

function syncFocusState() {
  focusStore.reconcileNow(false)
  void focusStore.flushPendingSessions()
  void taskStore.fetchTasks()
}

onMounted(syncFocusState)
onShow(syncFocusState)

function openTaskPicker() {
  if (focusStore.isTaskLocked) {
    uni.showToast({ title: '计时进行中或已暂停，重置后可切换任务', icon: 'none' })
    return
  }
  showTaskSelect.value = true
}

function onTaskSelect(task: Task | null) {
  focusStore.selectTask(task)
}

async function completeBoundTask() {
  const target = focusStore.lastCompletedTask
  if (!target?.id) return
  const existing = taskStore.allTasks.find(item => item.id === target.id)
  if (existing && existing.status !== 'completed') {
    await taskStore.toggleTaskComplete(target.id)
    uni.showToast({ title: '任务已标记完成', icon: 'none' })
  }
  focusStore.dismissCompletedTaskPrompt()
}
</script>

<style scoped>
.t-pomodoro {
  display: flex;
  width: 100%;
  height: 100%;
  background-color: var(--color-bg-primary);
  overflow: hidden;
}

.main-content {
  width: 100%;
  max-width: 1600rpx;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: row;
  padding: 56rpx 60rpx;
  gap: 72rpx;
  box-sizing: border-box;
}

.left-column {
  flex: 5.5;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.right-column {
  flex: 4.5;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  height: 100%;
  justify-content: center;
}

.panel-card {
  padding: 36rpx;
}

.card-header {
  margin-bottom: 24rpx;
}

.card-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.task-box {
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 24rpx;
  padding: 22rpx 26rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  cursor: pointer;
}

.task-box.is-locked {
  opacity: 0.78;
}

.task-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-name.placeholder {
  color: var(--text-muted);
  font-weight: var(--font-weight-regular);
}

.prompt-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.prompt-desc {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 14rpx;
  margin-top: 6rpx;
}

.prompt-btn {
  padding: 12rpx 24rpx;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.prompt-btn.ghost {
  background-color: var(--color-bg-primary);
  color: var(--text-muted);
}

.prompt-btn.primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.stats-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
}

.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}

.stat-divider {
  width: 1px;
  height: 72rpx;
  background-color: var(--border-subtle);
}

.val-wrapper {
  display: flex;
  align-items: baseline;
}

.stat-val {
  font-size: 56rpx;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stat-unit {
  font-size: 26rpx;
  color: var(--text-muted);
  margin-left: 6rpx;
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
</style>
