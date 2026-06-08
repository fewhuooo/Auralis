<template>
  <AppPageLayout custom-bg>
    <view class="pomodoro-page">
    <!-- Ambient Glow -->
    <view class="bg-glow bg-glow--1"></view>
    <view class="bg-glow bg-glow--2"></view>

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
      <!-- Time Header Card -->
      <view class="time-card glass-panel">
        <text class="real-date">{{ currentDateFormatted }}</text>
        <text class="real-time">{{ currentTimeFormatted }}</text>
      </view>

      <!-- Glass Card for Timer -->
      <view class="timer-card glass-panel">
        <!-- Timer Ring -->
        <view class="ring-container">
          <PomodoroRing
            :total-seconds="totalSeconds"
            :remaining-seconds="remainingSeconds"
            :is-running="isRunning"
            :color="ringColor"
            :task-name="currentTask?.name"
            :subject-name="currentTask?.subject"
            @center-click="showTaskSelect = true"
          />
          <view class="phase-badge" :style="{ backgroundColor: ringColor + '15', color: ringColor, borderColor: ringColor + '30' }">
            {{ isBreakPhase ? '休息时间' : '专注中' }}
          </view>
        </view>

        <!-- Progress Dots -->
        <view class="progress-dots">
          <view 
            v-for="i in 4" 
            :key="i"
            class="dot"
            :class="{ active: currentPomodoro >= i }"
          ></view>
        </view>

        <!-- Controls -->
        <view class="controls">
          <view class="ctrl-btn secondary" @click="resetTimer">重置</view>
          <view class="main-btn" :class="{ 'is-active': isRunning }" @click="toggleTimer">
            <text class="btn-icon">{{ isRunning ? '⏸' : '▶' }}</text>
          </view>
          <view class="ctrl-btn secondary" @click="skipPhase">跳过</view>
        </view>
      </view>

      <!-- Bottom Stats Card -->
      <view class="stats-card glass-panel">
        <view class="stat-item">
          <text class="stat-val">{{ completedToday }}</text>
          <text class="stat-label">今日番茄 (🍅)</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat-item">
          <text class="stat-val">{{ completedToday * FOCUS_MINS }}<text class="stat-unit">m</text></text>
          <text class="stat-label">专注时长</text>
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
  background: var(--color-bg-primary);
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
  color: var(--text-primary);
  transition: background 0.2s;
}
.menu-btn:active {
  background: var(--color-bg-elevated);
}
.header-title { font-size: 32rpx; font-weight: 600; color: var(--text-primary); }
.header-right { width: 60rpx; }

.time-card {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 30rpx 40rpx;
  margin-top: calc(var(--phone-header-height) - 60rpx);
  margin-bottom: 30rpx;
  border-radius: 40rpx;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}
.real-time {
  font-size: 60rpx;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
  line-height: 1;
}
.real-date {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-muted);
}

.main-content {
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20rpx 40rpx 140rpx; /* Reserve space for tabbar */
  box-sizing: border-box;
  overflow: hidden; /* Prevent scrolling */
}

.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 2rpx solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  border-radius: 48rpx;
  display: flex;
  align-items: center;
}

.timer-card {
  flex: 1; /* Takes up all remaining space */
  width: 100%;
  padding: 40rpx 30rpx;
  margin-bottom: 30rpx;
  flex-direction: column;
  justify-content: space-evenly;
  box-sizing: border-box;
}

.ring-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
}
.phase-badge {
  margin-top: 40rpx;
  padding: 14rpx 40rpx;
  border-radius: 40rpx;
  font-size: 26rpx;
  font-weight: 600;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 2rpx solid transparent;
  box-shadow: var(--shadow-sm);
  z-index: 2;
}

.progress-dots {
  display: flex;
  gap: 20rpx;
}
.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: var(--border-default);
}
.dot.active {
  background: var(--color-pomodoro);
}

.controls {
  display: flex;
  align-items: center;
  gap: 60rpx;
}
.ctrl-btn {
  font-size: 30rpx;
  font-weight: 500;
  color: var(--text-muted);
  padding: 20rpx 40rpx;
  transition: color 0.2s;
}
.ctrl-btn:active {
  color: var(--text-primary);
}
.main-btn {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16rpx 40rpx rgba(0,0,0,0.12);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s;
  border: 2rpx solid var(--border-subtle);
}
.main-btn:active {
  transform: scale(0.92);
}
.main-btn.is-active {
  background: var(--color-bg-secondary);
  border: 4rpx solid var(--border-default);
  box-shadow: inset 0 8rpx 16rpx rgba(0,0,0,0.05);
}
.main-btn.is-active .btn-icon {
  color: var(--text-primary);
}
.btn-icon {
  color: var(--color-bg-primary);
  font-size: 54rpx;
  margin-left: 8rpx;
}
.is-active .btn-icon {
  margin-left: 0;
}

.stats-card {
  flex-direction: row;
  padding: 30rpx 40rpx;
  justify-content: space-evenly;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.stat-val {
  font-size: 44rpx;
  font-weight: 800;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  line-height: 1;
}
.stat-unit {
  font-size: 24rpx;
  color: var(--text-muted);
  margin-left: 6rpx;
}
.stat-label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-muted);
}
.stat-divider {
  width: 2rpx;
  height: 60rpx;
  background: var(--border-subtle);
}
</style>
