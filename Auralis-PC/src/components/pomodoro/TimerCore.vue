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
        <span class="phase-pill" :class="{ 'is-break': isBreakPhase }">
          {{ isBreakPhase ? '茶歇时刻' : '沉浸专注中' }}
        </span>
      </div>

      <!-- Progress Dots -->
      <div class="progress-dots">
        <div 
          v-for="i in 4" 
          :key="i"
          class="dot"
          :class="{ 'is-filled': currentPomodoro >= i, 'is-break-filled': currentPomodoro >= i && isBreakPhase }"
        ></div>
      </div>

      <!-- Controls -->
      <div class="controls">
        <button class="ctrl-btn secondary" type="button" @click="resetTimer">重置</button>
        <button class="main-btn" type="button" :class="{ 'is-running': isRunning, 'is-break': isBreakPhase }" @click="toggleTimer">
          <div class="pause-icon" v-if="isRunning"></div>
          <div class="play-icon" v-else></div>
        </button>
        <button class="ctrl-btn secondary" type="button" @click="skipPhase">跳过</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import PomodoroRing from './PomodoroRing.vue'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { ElNotification } from 'element-plus'

const emit = defineEmits(['center-click'])
const props = defineProps<{ taskId?: string | null }>()

const pomodoroStore = usePomodoroStore()

const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null
let suppressPhaseNotifications = true

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

const isRunning = computed(() => pomodoroStore.isRunning)
const isBreakPhase = computed(() => pomodoroStore.isBreakPhase)
const currentPomodoro = computed(() => pomodoroStore.currentPomodoro)
const totalSeconds = computed(() => pomodoroStore.phaseDurationSeconds)
const remainingSeconds = computed(() => pomodoroStore.remainingSeconds)

// Zen Minimalist Palette: Focus = Zen Sage (#8B9A6E), Break = Warm Amber Tea (#C89B6D)
const ringColor = computed(() => {
  return isBreakPhase.value ? '#C89B6D' : '#8B9A6E'
})

async function runTimerAction(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    console.error('Failed to persist Pomodoro action:', error)
    ElNotification({ title: '专注状态保存失败', message: '请稍后重试', type: 'error', position: 'top-right' })
  }
}

const toggleTimer = () => runTimerAction(() => isRunning.value
  ? pomodoroStore.pause()
  : pomodoroStore.start(props.taskId ?? null))
const resetTimer = () => runTimerAction(() => pomodoroStore.reset())
const skipPhase = () => runTimerAction(() => pomodoroStore.skip())

watch(currentPomodoro, (current, previous) => {
  if (suppressPhaseNotifications || current <= previous) return
  ElNotification({ title: '专注完成！休息一下', type: 'success', position: 'top-right' })
}, { flush: 'sync' })

watch(isBreakPhase, (isBreak, wasBreak) => {
  if (suppressPhaseNotifications || !wasBreak || isBreak) return
  ElNotification({ title: '休息结束，开始专注', type: 'success', position: 'top-right' })
}, { flush: 'sync' })

onMounted(async () => {
  try {
    await pomodoroStore.initialize()
  } catch (error) {
    console.error('Failed to restore Pomodoro timer:', error)
  } finally {
    suppressPhaseNotifications = false
  }
  clockTimer = setInterval(() => { now.value = new Date() }, 1000)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})
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
  top: 10px;
  left: 20px;
}
.datetime-text {
  font-size: 13px;
  color: var(--text-muted, #7A7A75);
  font-weight: 600;
  font-family: var(--font-family-base);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle, #E6E6E4);
  padding: 5px 14px;
  border-radius: 9999px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
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
  margin-top: 18px;
}
.phase-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 16px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: rgba(139, 154, 110, 0.12);
  color: #637748;
  border: 1px solid rgba(139, 154, 110, 0.25);
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.08);
  transition: all 0.3s ease;
}
.phase-pill.is-break {
  background: rgba(200, 155, 109, 0.15);
  color: #9C7240;
  border-color: rgba(200, 155, 109, 0.3);
  box-shadow: 0 2px 6px rgba(200, 155, 109, 0.1);
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(139, 154, 110, 0.22);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.dot.is-filled {
  background: #8B9A6E;
  box-shadow: 0 0 8px rgba(139, 154, 110, 0.6);
  transform: scale(1.15);
}
.dot.is-break-filled {
  background: #C89B6D;
  box-shadow: 0 0 8px rgba(200, 155, 109, 0.6);
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 28px;
  margin-top: 26px;
}
.ctrl-btn {
  font-size: 13px;
  color: var(--text-secondary, #344139);
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default, #E6E6E4);
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.ctrl-btn:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: #8B9A6E;
  color: #8B9A6E;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.16);
}
.ctrl-btn:active {
  transform: scale(0.96);
}

.main-btn {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(139, 154, 110, 0.38);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
}
.main-btn:hover {
  transform: scale(1.06) translateY(-2px);
  box-shadow: 0 8px 26px rgba(139, 154, 110, 0.5);
}
.main-btn:active {
  transform: scale(0.96);
}
.main-btn.is-break {
  background: linear-gradient(135deg, #D6AF83 0%, #C89B6D 100%);
  box-shadow: 0 6px 20px rgba(200, 155, 109, 0.38);
}
.main-btn.is-break:hover {
  box-shadow: 0 8px 26px rgba(200, 155, 109, 0.5);
}

.play-icon {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 13px 0 13px 20px;
  border-color: transparent transparent transparent #FFFFFF;
  margin-left: 5px;
}
.pause-icon {
  width: 16px;
  height: 20px;
  border-left: 5px solid #FFFFFF;
  border-right: 5px solid #FFFFFF;
  box-sizing: border-box;
}

/* Dark Mode Overrides */
html.dark .datetime-text {
  background: #212621;
  border-color: rgba(163, 177, 155, 0.25);
  color: #d9d0c7;
}
html.dark .ctrl-btn {
  background: #212621;
  border-color: rgba(163, 177, 155, 0.25);
  color: #FAF7F2;
}
html.dark .ctrl-btn:hover {
  background: #293029;
  border-color: #9AB08F;
  color: #9AB08F;
}
html.dark .main-btn {
  background: #9AB08F;
  box-shadow: 0 6px 20px rgba(154, 176, 143, 0.3);
}
html.dark .main-btn.is-break {
  background: #C89B6D;
  box-shadow: 0 6px 20px rgba(200, 155, 109, 0.3);
}
</style>
