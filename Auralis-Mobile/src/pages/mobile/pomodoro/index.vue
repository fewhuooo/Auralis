<template>
  <AppPageLayout>
    <view class="pomodoro-page">
      <!-- 通用极简禅意顶栏 -->
      <AppHeader title="专注" />

      <!-- Main Content -->
      <view class="main-content">
        <!-- Time Row -->
        <view class="time-row">
          <text class="real-date">{{ currentDateFormatted }}</text>
          <text class="real-time">{{ currentTimeFormatted }}</text>
        </view>

        <!-- Responsive Workspace Grid -->
        <view class="workspace-grid">
          <!-- Left/Center Area: Timer & Status -->
          <view class="timer-section">
            <!-- Task Selector Wrap (Relative Anchor for Popover Menu) -->
            <view class="task-selector-wrap" style="position: relative; z-index: 100;">
              <view class="task-selector" @click="showTaskSelect = !showTaskSelect">
                <text class="t-name" v-if="currentTask">{{ currentTask.name }}</text>
                <text class="t-name placeholder" v-else>点击选择任务</text>
                <text class="selector-arrow" :style="{ transform: showTaskSelect ? 'rotate(180deg)' : 'rotate(0deg)' }">▾</text>
              </view>

              <!-- Anchored Popover Menu -->
              <TaskSelectSheet v-model:visible="showTaskSelect" @select="onTaskSelect" />
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

            <!-- Phase Status & Progress Dots -->
            <view class="phase-info">
              <text class="phase-text" :style="{ color: ringColor }">{{ isBreakPhase ? '休息时间' : '专注中' }}</text>
              <view class="progress-dots">
                <view 
                  v-for="i in 4" 
                  :key="i"
                  class="dot"
                  :style="currentPomodoro >= i ? { backgroundColor: ringColor } : { backgroundColor: ringColor + '30' }"
                ></view>
              </view>
            </view>
          </view>

          <!-- Right/Bottom Area: Controls & Stats -->
          <view class="action-section">
            <!-- Controls -->
            <view class="controls">
              <view class="ctrl-btn secondary" @click="resetTimer">重置</view>
              <view class="main-btn" @click="toggleTimer">
                <view class="pause-icon" v-if="isRunning"></view>
                <view class="play-icon" v-else></view>
              </view>
              <view class="ctrl-btn secondary" @click="skipPhase">跳过</view>
            </view>

            <!-- Bottom Stats Card -->
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
                <text class="stat-label" style="margin-top: 8rpx;">专注时长</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import { useTaskStore, type Task } from '@/store/useTaskStore'

const taskStore = useTaskStore()
const { pendingTasks } = storeToRefs(taskStore)

onMounted(() => {
  taskStore.fetchTasks()
})

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
  width: 100vw;
  height: 100vh;
  position: relative;
  background: var(--color-bg-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  position: relative;
  z-index: 10;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20rpx 48rpx calc(env(safe-area-inset-bottom) + 160rpx);
  box-sizing: border-box;
  justify-content: space-between;
  overflow: hidden;
}

.time-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-shrink: 0;
}
.real-date {
  font-size: 28rpx;
  color: var(--color-zen-stone);
  font-weight: 500;
}
.real-time {
  font-size: clamp(64rpx, 10vw, 90rpx);
  font-weight: 600;
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--color-zen-graphite);
  line-height: 1;
  letter-spacing: -2rpx;
}

/* 响应式工作区布局 (Responsive Workspace Grid) */
.workspace-grid {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  gap: clamp(16rpx, 2.5vh, 40rpx);
  margin-top: clamp(12rpx, 2vh, 32rpx);
}

.timer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16rpx, 2.5vh, 36rpx);
  width: 100%;
}

.task-selector {
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12rpx 28rpx;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 999rpx;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
}
.task-selector:active {
  transform: scale(0.96);
  background: rgba(255, 255, 255, 0.7);
}
.t-name {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
}
.t-name.placeholder {
  color: var(--color-zen-stone);
}
.selector-arrow {
  font-size: 24rpx;
  color: var(--color-zen-stone);
  margin-left: 10rpx;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-block;
}

.timer-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.phase-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.phase-text {
  font-size: clamp(28rpx, 4vw, 32rpx);
  font-weight: 600;
  letter-spacing: 2rpx;
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 20rpx;
}
.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  transition: background-color 0.3s;
}

.action-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: clamp(24rpx, 3.5vh, 60rpx);
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: clamp(48rpx, 10vw, 80rpx);
  width: 100%;
}
.ctrl-btn {
  font-size: clamp(28rpx, 4vw, 32rpx);
  color: var(--color-zen-stone);
  font-weight: 600;
  padding: 20rpx;
}
.ctrl-btn:active {
  opacity: 0.7;
}

.main-btn {
  width: clamp(136rpx, 18vw, 160rpx);
  height: clamp(136rpx, 18vw, 160rpx);
  border-radius: 50%;
  background: var(--color-zen-graphite);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16rpx 40rpx rgba(28, 28, 26, 0.15);
  border: 1px solid var(--color-zen-hairline);
  transition: transform 0.2s, box-shadow 0.2s;
}
.main-btn:active {
  transform: scale(0.95);
  box-shadow: 0 8rpx 20rpx rgba(28, 28, 26, 0.1);
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
  justify-content: space-around;
  width: 100%;
  max-width: 600rpx;
  padding: 24rpx 40rpx;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 32rpx;
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.stat-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-val {
  font-size: clamp(48rpx, 8vw, 64rpx);
  font-weight: 600;
  color: var(--color-zen-graphite);
  font-family: 'Inter', system-ui, sans-serif;
  line-height: 1;
}
.stat-unit {
  font-size: 28rpx;
  color: var(--color-zen-graphite);
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
  color: var(--color-zen-stone);
  font-weight: 600;
}
.stat-emoji {
  font-size: 22rpx;
}

/* ==========================================================================
   响应式断点 - 宽屏/平板/折叠屏/PC模式 (min-width: 768px)
   ========================================================================== */
@media (min-width: 768px) {
  .main-content {
    padding: 36rpx 80rpx calc(env(safe-area-inset-bottom) + 140rpx);
  }
  
  .workspace-grid {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 64rpx;
    align-items: center;
    height: 100%;
    margin-top: 24rpx;
  }

  .timer-section {
    height: 100%;
    justify-content: center;
    gap: 36rpx;
  }

  .action-section {
    background: rgba(255, 255, 255, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.85);
    border-radius: 48rpx;
    padding: 64rpx 48rpx;
    box-shadow: 0 24rpx 64rpx rgba(0, 0, 0, 0.04);
    backdrop-filter: blur(20px);
    justify-content: center;
    gap: 64rpx;
  }

  .bottom-stats {
    background: transparent;
    border: none;
    padding: 0;
    max-width: none;
  }
}
</style>
