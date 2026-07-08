<template>
  <TabletLayout>
    <view class="t-pomodoro">
      <view class="main-content">
        
        <!-- Left Column: Timer Core (60%) -->
        <view class="left-column">
          <TimerCore @center-click="showTaskSelect = true" />
        </view>

        <!-- Right Column: Stats & Details (40%) -->
        <view class="right-column">
          
          <!-- Card 1: Current Focus -->
          <view class="panel-card top-card" style="position: relative; z-index: 100;">
            <view class="card-header">
              <text class="card-title">当前专注</text>
            </view>
            <view class="task-selector-wrap" style="position: relative;">
              <view class="task-selector" @click="showTaskSelect = !showTaskSelect">
                <view class="task-box">
                  <text class="t-name" v-if="currentTask">{{ currentTask.name }}</text>
                  <text class="t-name placeholder" v-else>点击选择任务</text>
                  <view class="selector-arrow" :style="{ transform: showTaskSelect ? 'rotate(90deg)' : 'rotate(0deg)' }">
                    <LineIcon name="chevron-right" size="26rpx" color="var(--color-zen-stone, #A8A8A5)" />
                  </view>
                </view>
              </view>

              <!-- Anchored Popover Menu -->
              <TaskSelectSheet v-model:visible="showTaskSelect" @select="onTaskSelect" />
            </view>
          </view>

          <!-- Card 2: Today's Data -->
          <view class="panel-card middle-card">
            <view class="card-header">
              <text class="card-title">今日数据看板</text>
            </view>
            <view class="stats-container">
              <view class="stat-col">
                <text class="stat-val">{{ completedToday }}</text>
                <view class="stat-label-row">
                  <LineIcon name="check" size="26rpx" color="var(--color-zen-stone, #A8A8A5)" />
                  <text class="stat-label">今日番茄</text>
                </view>
              </view>
              
              <view class="stat-divider"></view>

              <view class="stat-col">
                <view class="val-wrapper">
                  <text class="stat-val">{{ completedToday * FOCUS_MINS }}</text>
                  <text class="stat-unit">m</text>
                </view>
                <text class="stat-label">专注时长</text>
              </view>
            </view>
          </view>
          
        </view>

      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import TimerCore from './TimerCore.vue'
import { useTaskStore, type Task } from '@/store/useTaskStore'

const taskStore = useTaskStore()

const currentTask = ref<Task | null>(null)
const showTaskSelect = ref(false)

const onTaskSelect = (task: Task) => {
  currentTask.value = task
}

const FOCUS_MINS = 25

const completedToday = computed(() => {
  return taskStore.todayPomodoros || 0
})

onMounted(() => {
  taskStore.fetchTasks()
})
</script>

<style scoped>
.t-pomodoro {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-zen-ivory, #F9F9F7);
  position: relative;
  overflow: hidden;
}

.main-content {
  width: 100%;
  max-width: 1600rpx;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: row;
  padding: 80rpx 60rpx;
  gap: 160rpx; 
  box-sizing: border-box;
}

.left-column {
  flex: 5.5;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
}

.right-column {
  flex: 4.5;
  display: flex;
  flex-direction: column;
  gap: 40rpx;
  height: 100%;
  justify-content: center;
}

/* Card UI */
.panel-card {
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 40rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  padding: 40rpx;
  box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
}

.card-header {
  margin-bottom: 30rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

/* Task Selector */
.task-selector {
  width: 100%;
  cursor: pointer;
}

.task-box {
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  padding: 24rpx 36rpx;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.task-box:active {
  background: rgba(0, 0, 0, 0.04);
}

.t-name {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
}

.t-name.placeholder {
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 400;
}
.selector-arrow {
  margin-left: auto;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
}

/* Stats Container */
.stats-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
}

.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-divider {
  width: 1px;
  height: 80rpx;
  background-color: var(--color-zen-hairline, #E6E6E4);
}

.val-wrapper {
  display: flex;
  align-items: baseline;
}

.stat-val {
  font-size: 64rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
  line-height: 1;
}

.stat-unit {
  font-size: 28rpx;
  color: var(--color-zen-stone, #A8A8A5);
  margin-left: 8rpx;
  font-weight: 600;
}

.stat-label-row {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
  gap: 8rpx;
}

.stat-label {
  font-size: 26rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}
.stat-col > .stat-label {
  margin-top: 16rpx;
}
</style>
