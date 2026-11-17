<template>
  <TabletLayout>
    <view class="t-pomodoro">
      <view class="main-content">
        <view class="left-column zen-panel">
          <TimerCore @center-click="openTaskPicker" />
        </view>

        <view class="right-column">
          <view class="panel-card zen-panel">
            <text class="card-title">当前专注</text>
            <view
              class="task-box"
              :class="{ 'is-locked': focusStore.isTaskLocked }"
              @click="openTaskPicker"
            >
              <LineIcon
                :name="focusStore.isTaskLocked ? 'lock' : 'calendar'"
                size="16px"
                color="var(--color-sage-ink)"
              />
              <text class="task-name">
                {{ focusStore.selectedTaskTitle || '自由专注' }}
              </text>
              <LineIcon name="chevron-down" size="15px" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="focusStore.lastCompletedTask" class="panel-card zen-panel prompt-card">
            <text class="prompt-title">完成「{{ focusStore.lastCompletedTask.title }}」？</text>
            <view class="prompt-actions">
              <view class="ui-btn ui-btn-secondary prompt-btn" @click="focusStore.dismissCompletedTaskPrompt()">暂不</view>
              <view class="ui-btn ui-btn-primary prompt-btn" @click="completeBoundTask">标记完成</view>
            </view>
          </view>

          <view class="panel-card zen-panel">
            <text class="card-title">今日专注看板</text>
            <view class="stats-container">
              <view class="stat-col">
                <text class="stat-val num-tabular">{{ focusStore.todayRounds }}</text>
                <text class="stat-label">今日番茄</text>
              </view>
              <view class="stat-divider"></view>
              <view class="stat-col">
                <view class="val-wrapper">
                  <text class="stat-val num-tabular">{{ focusStore.todayFocusMinutes }}</text>
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
    uni.showToast({ title: '重置后可切换任务', icon: 'none' })
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
    uni.showToast({ title: '已标记完成', icon: 'none' })
  }
  focusStore.dismissCompletedTaskPrompt()
}
</script>

<style scoped>
.t-pomodoro {
  display: flex;
  width: 100%;
  height: 100%;
  background-color: var(--color-bg-secondary);
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.main-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  gap: 14px;
  box-sizing: border-box;
}

.left-column {
  flex: 6.2;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  padding: 20px;
  box-sizing: border-box;
}

.right-column {
  flex: 3.8;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}

.panel-card {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-title {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.task-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
}

.task-box.is-locked {
  opacity: 0.7;
}

.task-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-card {
  border-color: var(--border-accent);
}

.prompt-title {
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.prompt-actions {
  display: flex;
  gap: 10px;
}

.prompt-btn {
  flex: 1;
  height: 36px;
}

.stats-container {
  display: flex;
  align-items: center;
  padding-top: 4px;
}

.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.val-wrapper {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.stat-val {
  font-size: 32px;
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-base);
  color: var(--text-primary);
  line-height: 1;
}

.stat-unit {
  font-size: 14px;
  color: var(--text-muted);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.stat-divider {
  width: 1px;
  height: 36px;
  background-color: var(--border-subtle);
}

@media (max-width: 900px) {
  .main-content {
    flex-direction: column;
    overflow-y: auto;
    height: auto;
  }

  .left-column,
  .right-column {
    flex: none;
    width: 100%;
    height: auto;
  }
}
</style>
