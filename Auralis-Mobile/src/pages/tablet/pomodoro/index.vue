<template>
  <TabletLayout>
    <view class="t-pomodoro">
      <view class="main-content">
        <view class="left-column zen-panel">
          <TimerCore @center-click="openTaskPicker" />
        </view>

        <view class="right-column">
          <view class="panel-card task-panel zen-panel">
            <view class="card-head-row">
              <text class="card-title">专注任务</text>
              <view
                v-if="!focusStore.isTaskLocked"
                class="more-link"
                role="button"
                @click="openTaskPicker"
              >
                <text>全部</text>
                <LineIcon name="chevron-right" size="13px" color="var(--text-muted)" />
              </view>
            </view>

            <view
              class="task-box"
              :class="{ 'is-locked': focusStore.isTaskLocked }"
              role="button"
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

            <scroll-view v-if="quickPickTasks.length > 0 && !focusStore.isTaskLocked" scroll-y :show-scrollbar="false" class="quick-task-scroll">
              <view class="quick-task-list">
                <view
                  v-for="task in quickPickTasks"
                  :key="task.id"
                  class="quick-task-row"
                  :class="{ active: focusStore.selectedTaskId === task.id }"
                  role="button"
                  @click="onTaskSelect(task)"
                >
                  <text class="quick-task-name">{{ task.name }}</text>
                  <text class="quick-task-meta num-tabular">{{ task.duration || 30 }}m</text>
                </view>
              </view>
            </scroll-view>
          </view>

          <view v-if="focusStore.lastCompletedTask" class="panel-card zen-panel prompt-card">
            <text class="prompt-title">完成「{{ focusStore.lastCompletedTask.title }}」？</text>
            <view class="prompt-actions">
              <view class="ui-btn ui-btn-secondary prompt-btn" role="button" @click="focusStore.dismissCompletedTaskPrompt()">暂不</view>
              <view class="ui-btn ui-btn-primary prompt-btn" role="button" @click="completeBoundTask">标记完成</view>
            </view>
          </view>

          <view class="panel-card zen-panel">
            <text class="card-title">今日记录</text>
            <view class="stats-container">
              <view class="stat-col">
                <text class="stat-val num-tabular">{{ focusStore.todayRounds }}</text>
                <text class="stat-label">番茄</text>
              </view>
              <view class="stat-divider"></view>
              <view class="stat-col">
                <view class="val-wrapper">
                  <text class="stat-val num-tabular">{{ focusStore.todayFocusMinutes }}</text>
                  <text class="stat-unit">m</text>
                </view>
                <text class="stat-label">时长</text>
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
import { computed, onMounted, ref } from 'vue'
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

const quickPickTasks = computed(() => (
  taskStore.allTasks
    .filter(task => !task.is_deleted && task.status !== 'completed')
    .slice(0, 6)
))

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
  gap: 14px;
  height: 100%;
}

.panel-card {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

.task-panel {
  flex: 0 1 auto;
  min-height: 0;
}

.card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.015em;
}

.more-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  cursor: pointer;
}

.task-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  flex-shrink: 0;
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

.quick-task-scroll {
  max-height: 280px;
}

.quick-task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quick-task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  background-color: rgba(250, 247, 242, 0.65);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.14s ease, border-color 0.14s ease;
}

.quick-task-row:hover {
  background-color: var(--color-bg-tertiary);
  border-color: var(--border-subtle);
}

.quick-task-row.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.quick-task-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-task-meta {
  font-size: var(--text-2xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.prompt-card {
  border-color: var(--border-accent);
  flex-shrink: 0;
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
  gap: 4px;
}

.stat-val {
  font-size: 34px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat-unit {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.stat-divider {
  width: 1px;
  height: 38px;
  background-color: var(--border-subtle);
}

@media (max-width: 900px) {
  .t-pomodoro {
    overflow-y: auto;
  }

  .main-content {
    flex-direction: column;
    height: auto;
  }

  .left-column,
  .right-column {
    flex: none;
    width: 100%;
    height: auto;
  }

  .quick-task-scroll {
    flex: none;
    height: auto;
    max-height: 220px;
  }
}
</style>
