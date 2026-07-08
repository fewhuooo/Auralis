<template>
  <view class="timer-core">
    <!-- Time Row -->
    <view class="time-row">
      <text class="datetime-text">{{ currentDateFormatted }} {{ currentTimeFormatted }}</text>
    </view>

    <view class="center-block">
      <!-- Timer Ring -->
    <view class="timer-wrapper">
      <PomodoroRing
        :total-seconds="totalSeconds"
        :remaining-seconds="remainingSeconds"
        :is-running="isRunning"
        :color="ringColor"
        :size="600"
        @center-click="$emit('center-click')"
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
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import { useTaskStore } from '@/store/useTaskStore'

const emit = defineEmits(['center-click'])

const taskStore = useTaskStore()

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

const FOCUS_MINS = 25
const BREAK_MINS = 5
const LONG_BREAK_MINS = 15

const isRunning = ref(false)
const isBreakPhase = ref(false)
const currentPomodoro = ref(0)

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
    currentPomodoro.value++
    isBreakPhase.value = true
    taskStore.incrementPomodoro()
  } else {
    if (currentPomodoro.value >= 4) {
      currentPomodoro.value = 0
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

clockTimer = setInterval(() => {
  now.value = new Date()
}, 1000)
</script>

<style scoped>
.timer-core {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  position: relative;
}

.time-row {
  position: absolute;
  top: 0;
  left: 0;
}
.datetime-text {
  font-size: 28rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.center-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.timer-wrapper {
  display: flex;
  justify-content: center;
  transform: scale(1.25);
}

.phase-status {
  text-align: center;
  margin-top: 40rpx;
  font-size: 36rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 16rpx;
  margin-top: 20rpx;
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
  gap: 60rpx;
  margin-top: 48rpx;
}
.ctrl-btn {
  font-size: 28rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 600;
  padding: 18rpx 36rpx;
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  cursor: pointer;
  transition: all 0.2s;
}
.ctrl-btn:active {
  transform: scale(0.96);
  background: rgba(0, 0, 0, 0.04);
}
.main-btn {
  width: 180rpx;
  height: 180rpx;
  border-radius: 50%;
  background: var(--color-zen-graphite, #1C1C1A);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
  cursor: pointer;
}
.main-btn:active {
  transform: scale(0.95);
}
.play-icon {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 28rpx 0 28rpx 42rpx;
  border-color: transparent transparent transparent var(--color-zen-white, #FFFFFF);
  margin-left: 14rpx;
}
.pause-icon {
  width: 28rpx;
  height: 42rpx;
  border-left: 10rpx solid var(--color-zen-white, #FFFFFF);
  border-right: 10rpx solid var(--color-zen-white, #FFFFFF);
  box-sizing: border-box;
}
</style>
