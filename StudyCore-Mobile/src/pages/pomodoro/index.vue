<template>
  <AppPageLayout>
    <view class="pomodoro-page">
    
    <!-- Custom Header -->
    <view class="custom-header">
      <view class="header-content">
        <view class="icon-btn menu-btn" @click.stop="openDrawer">
          <LineIcon name="menu" size="44rpx" />
        </view>
        <text class="header-title">专注</text>
        <view class="header-right"></view>
      </view>
    </view>

    <!-- Main Content -->
    <view class="main-content">
      <!-- Time Row -->
      <view class="time-row">
        <text class="real-date">{{ currentDateFormatted }}</text>
        <text class="real-time">{{ currentTimeFormatted }}</text>
      </view>

      <!-- Task Selector -->
      <view class="task-selector" @click="showTaskSelect = true">
        <text class="t-name" v-if="currentTask">{{ currentTask.name }}</text>
        <text class="t-name placeholder" v-else>点击选择任务</text>
      </view>

      <!-- Timer Ring -->
      <view class="timer-container">
        <PomodoroRing
          :total-seconds="totalSeconds"
          :remaining-seconds="remainingSeconds"
          :is-running="isRunning"
          :color="ringColor"
          @center-click="showTaskSelect = true"
        />
      </view>

      <!-- Phase Status -->
      <view class="phase-status">
        <text :style="{ color: ringColor }">{{ isBreakPhase ? '休息时间' : '专注中' }}</text>
      </view>

      <!-- Progress Dots -->
      <view class="progress-dots">
        <view 
          v-for="i in 4" 
          :key="i"
          class="dot"
          :style="currentPomodoro >= i ? { backgroundColor: ringColor } : { backgroundColor: ringColor + '30' }"
        ></view>
      </view>

      <!-- Controls -->
      <view class="controls">
        <view class="ctrl-btn secondary" @click="resetTimer">重置</view>
        <view class="main-btn" @click="toggleTimer">
          <view class="pause-icon" v-if="isRunning"></view>
          <view class="play-icon" v-else></view>
        </view>
        <view class="ctrl-btn secondary" @click="skipPhase">跳过</view>
      </view>

      <!-- Bottom Stats Card (Now just flex row) -->
      <view class="bottom-stats">
        <view class="stat-col">
          <text class="stat-val">{{ completedToday }}</text>
          <view class="stat-label-row">
            <text class="stat-label">今日番茄</text>
            <text class="stat-emoji">🍅</text>
          </view>
        </view>
        <view class="stat-col">
          <text class="stat-val">{{ completedToday * FOCUS_MINS }}<text class="stat-unit">m</text></text>
          <text class="stat-label" style="margin-top: 12rpx;">专注时长</text>
        </view>
      </view>
    </view>

    <TaskSelectSheet v-model:visible="showTaskSelect" @select="onTaskSelect" />
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSubjectStore } from '@/store/useSubjectStore'
import { uuidv7 } from '@/utils/uuid'
import LineIcon from '@/components/LineIcon.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import { useLayoutStore } from '@/store/useLayoutStore'
import PomodoroRing from '@/components/PomodoroRing.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import { useTaskStore, type Task } from '@/store/useTaskStore'

const layoutStore = useLayoutStore()
const openDrawer = () => layoutStore.openDrawer()
const taskStore = useTaskStore()
const { pendingTasks } = storeToRefs(taskStore)

const currentTask = ref<Task | null>(null)
const showTaskSelect = ref(false)

const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null

const currentTimeFormatted = computed(() => {
  const h = String(now.value.getHours()).padStart(2, '0')
  const m = String(now.value.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
})

const currentDateFormatted = computed(() => {
  const d = now.value
  const month = d.getMonth() + 1
  const date = d.getDate()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekday = weekdays[d.getDay()]
  return `${month}月${date}日 ${weekday}`
})

const onTaskSelect = (task: Task) => {
  currentTask.value = task
}

const FOCUS_MINS = 25
const BREAK_MINS = 5
const LONG_BREAK_MINS = 15

const isRunning = ref(false)
const isBreakPhase = ref(false)
const currentPomodoro = ref(0) // 1 to 4

const totalSeconds = computed(() => {
  if (isBreakPhase.value) {
    return (currentPomodoro.value === 4 ? LONG_BREAK_MINS : BREAK_MINS) * 60
  }
  return FOCUS_MINS * 60
})

const remainingSeconds = ref(totalSeconds.value)
let timer: ReturnType<typeof setInterval> | null = null

const ringColor = computed(() => {
  return isBreakPhase.value ? 'var(--color-pomodoro-break)' : 'var(--color-pomodoro)'
})

const completedToday = ref(3) // Mock

const toggleTimer = () => {
  if (isRunning.value) {
    pauseTimer()
  } else {
    startTimer()
  }
}

const startTimer = () => {
  if (remainingSeconds.value <= 0) resetTimer()
  isRunning.value = true
  timer = setInterval(() => {
    remainingSeconds.value--
    if (remainingSeconds.value <= 0) {
      handlePhaseComplete()
    }
  }, 1000)
}

const pauseTimer = () => {
  isRunning.value = false
  if (timer) clearInterval(timer)
}

const resetTimer = () => {
  pauseTimer()
  remainingSeconds.value = totalSeconds.value
}

const skipPhase = () => {
  handlePhaseComplete()
}

const handlePhaseComplete = () => {
  pauseTimer()
  uni.vibrateLong()
  
  if (!isBreakPhase.value) {
    // Focus -> Break
    currentPomodoro.value++
    isBreakPhase.value = true
    completedToday.value++
  } else {
    // Break -> Focus
    if (currentPomodoro.value >= 4) {
      currentPomodoro.value = 0 // Reset after long break
    }
    isBreakPhase.value = false
  }
  
  remainingSeconds.value = totalSeconds.value
  
  uni.showToast({
    title: isBreakPhase.value ? '专注完成！休息一下' : '休息结束，开始专注',
    icon: 'none'
  })
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (clockTimer) clearInterval(clockTimer)
})

// Setup clock
clockTimer = setInterval(() => {
  now.value = new Date()
}, 1000)
</script>

<style scoped>
.pomodoro-page {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  align-items: center;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

.custom-header {
  width: 100%;
  padding-top: var(--status-bar-height, 44px);
  z-index: 100;
  position: relative;
}
.header-content {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30rpx;
}
.menu-btn {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #333;
}
.header-title { 
  font-size: 36rpx; 
  font-weight: 600; 
  color: #111; 
  letter-spacing: 4rpx; 
}
.header-right { width: 80rpx; }

.main-content {
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 40rpx 60rpx 140rpx;
  box-sizing: border-box;
}

.time-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.real-date {
  font-size: 28rpx;
  color: #888;
  font-weight: 500;
}
.real-time {
  font-size: 90rpx;
  font-weight: 600;
  font-family: 'Inter', system-ui, sans-serif;
  color: #111;
  line-height: 1;
  letter-spacing: -2rpx;
}

.task-selector {
  margin-top: 80rpx;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
}
.t-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #6a5e5e;
}
.t-name.placeholder {
  color: #9c8e8e;
}

.timer-container {
  display: flex;
  justify-content: center;
  margin-top: 40rpx;
}

.phase-status {
  text-align: center;
  margin-top: 60rpx;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 2rpx;
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 20rpx;
  margin-top: 24rpx;
}
.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 80rpx;
  margin-top: 80rpx;
}
.ctrl-btn {
  font-size: 32rpx;
  color: #8a7a7a;
  font-weight: 600;
  padding: 20rpx;
}
.ctrl-btn:active {
  opacity: 0.7;
}
.main-btn {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: #2c2c2c;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(0,0,0,0.1);
  transition: transform 0.2s;
}
.main-btn:active {
  transform: scale(0.95);
}
.play-icon {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 24rpx 0 24rpx 36rpx;
  border-color: transparent transparent transparent #fff;
  margin-left: 12rpx;
}
.pause-icon {
  width: 24rpx;
  height: 36rpx;
  border-left: 8rpx solid #fff;
  border-right: 8rpx solid #fff;
  box-sizing: border-box;
}

.bottom-stats {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  padding: 0 40rpx;
}
.stat-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-val {
  font-size: 64rpx;
  font-weight: 600;
  color: #111;
  font-family: 'Inter', system-ui, sans-serif;
  line-height: 1;
}
.stat-unit {
  font-size: 28rpx;
  color: #111;
  margin-left: 4rpx;
  font-weight: 500;
}
.stat-label-row {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
  gap: 8rpx;
}
.stat-label {
  font-size: 22rpx;
  color: #8a7a7a;
  font-weight: 600;
}
.stat-emoji {
  font-size: 22rpx;
}
</style>
