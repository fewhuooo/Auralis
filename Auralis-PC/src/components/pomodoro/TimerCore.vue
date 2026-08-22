<template>
  <div class="timer-core">
    <!-- Time Row -->
    <div class="time-row">
      <span class="datetime-text">{{ currentDateFormatted }} {{ currentTimeFormatted }}</span>
    </div>

    <div class="center-block">
      <!-- Timer Ring -->
      <div class="timer-wrapper">
        <PomodoroRing
          :total-seconds="totalSeconds"
          :remaining-seconds="remainingSeconds"
          :is-running="isRunning"
          :color="ringColor"
          @center-click="$emit('center-click')"
        />
      </div>

      <!-- Phase Status -->
      <div class="phase-status">
        <span :style="{ color: ringColor }">{{ isBreakPhase ? '休息时间' : '专注中' }}</span>
      </div>

      <!-- Progress Dots -->
      <div class="progress-dots">
        <div 
          v-for="i in 4" 
          :key="i"
          class="dot"
          :style="currentPomodoro >= i ? { backgroundColor: ringColor } : { backgroundColor: ringColor + '30' }"
        ></div>
      </div>

      <!-- Controls -->
      <div class="controls">
        <div class="ctrl-btn secondary" @click="resetTimer">重置</div>
        <div class="main-btn" @click="toggleTimer">
          <div class="pause-icon" v-if="isRunning"></div>
          <div class="play-icon" v-else></div>
        </div>
        <div class="ctrl-btn secondary" @click="skipPhase">跳过</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import PomodoroRing from './PomodoroRing.vue'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { ElNotification } from 'element-plus'

const emit = defineEmits(['center-click'])

const pomodoroStore = usePomodoroStore()

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
  return isBreakPhase.value ? '#10B981' : '#E85D04' // Tailwind colors for break and pomodoro
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
  
  if (!isBreakPhase.value) {
    currentPomodoro.value++
    isBreakPhase.value = true
    pomodoroStore.increment()
  } else {
    if (currentPomodoro.value >= 4) {
      currentPomodoro.value = 0
    }
    isBreakPhase.value = false
  }
  
  remainingSeconds.value = totalSeconds.value
  
  ElNotification({
    title: isBreakPhase.value ? '专注完成！休息一下' : '休息结束，开始专注',
    type: 'success',
    position: 'top-right'
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
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 600;
  font-family: var(--font-family-base);
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
}

.phase-status {
  text-align: center;
  margin-top: 20px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 1px;
  font-family: var(--font-family-base);
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 30px;
  margin-top: 24px;
}
.ctrl-btn {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
  padding: 9px 18px;
  border-radius: 999px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-default);
  cursor: pointer;
  transition: all 0.2s;
}
.ctrl-btn:active {
  transform: scale(0.96);
  background: rgba(0, 0, 0, 0.04);
}
.main-btn {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
  cursor: pointer;
}
.main-btn:hover {
  transform: scale(1.05);
}
.main-btn:active {
  transform: scale(0.95);
}
.play-icon {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 14px 0 14px 21px;
  border-color: transparent transparent transparent var(--color-bg-primary);
  margin-left: 7px;
}
.pause-icon {
  width: 14px;
  height: 21px;
  border-left: 5px solid var(--color-bg-primary);
  border-right: 5px solid var(--color-bg-primary);
  box-sizing: border-box;
}
</style>
