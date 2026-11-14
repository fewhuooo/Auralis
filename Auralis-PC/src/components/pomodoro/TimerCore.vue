<template>
  <div class="timer-core">
    <!-- Time Row -->
    <div class="time-row">
      <span class="datetime-text">
        <span class="datetime-dot"></span>
        {{ currentDateFormatted }} {{ currentTimeFormatted }}
      </span>
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
        <span class="phase-pill" :class="{ 'is-break': isBreakPhase, 'is-active': isRunning }">
          <span class="phase-beacon"></span>
          {{ isBreakPhase ? t({ 'zh-CN': '茶歇时刻', en: 'Break time', ja: '休憩中' }) : t({ 'zh-CN': '沉浸专注中', en: 'Focus time', ja: '集中時間' }) }}
        </span>
      </div>

      <!-- Progress Dots -->
      <div class="progress-dots" :title="t({ 'zh-CN': '今日第 {count} 个番茄周期', en: 'Today\'s Pomodoro #{count}', ja: '今日のポモドーロ {count} 回目' }, { count: currentPomodoro })">
        <div 
          v-for="i in 4" 
          :key="i"
          class="dot"
          :class="{ 'is-filled': currentPomodoro >= i, 'is-break-filled': currentPomodoro >= i && isBreakPhase }"
        ></div>
      </div>

      <!-- Controls -->
      <div class="controls">
        <button class="ctrl-btn secondary" type="button" @click="resetTimer">{{ t({ 'zh-CN': '重置', en: 'Reset', ja: 'リセット' }) }}</button>
        <button 
          class="main-btn" 
          type="button" 
          :class="{ 'is-running': isRunning, 'is-break': isBreakPhase }" 
          @click="toggleTimer"
          :title="isRunning ? t({ 'zh-CN': '暂停专注', en: 'Pause focus', ja: '集中を一時停止' }) : t({ 'zh-CN': '开始专注', en: 'Start focus', ja: '集中を開始' })"
        >
          <div class="pause-icon" v-if="isRunning"></div>
          <div class="play-icon" v-else></div>
        </button>
        <button class="ctrl-btn secondary" type="button" @click="skipPhase">{{ t({ 'zh-CN': '跳过', en: 'Skip', ja: 'スキップ' }) }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { locale, t } from '@/i18n'
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

const currentDateFormatted = computed(() =>
  new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric', weekday: 'short' }).format(now.value),
)

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
    ElNotification({ title: t({ 'zh-CN': '专注状态保存失败', en: 'Could not save focus session', ja: '集中セッションを保存できませんでした' }), message: t({ 'zh-CN': '请稍后重试', en: 'Try again later', ja: 'しばらくしてから再試行してください' }), type: 'error', position: 'top-right' })
  }
}

const toggleTimer = () => runTimerAction(() => isRunning.value
  ? pomodoroStore.pause()
  : pomodoroStore.start(props.taskId ?? null))
const resetTimer = () => runTimerAction(() => pomodoroStore.reset())
const skipPhase = () => runTimerAction(() => pomodoroStore.skip())

watch(currentPomodoro, (current, previous) => {
  if (suppressPhaseNotifications || current <= previous) return
  ElNotification({ title: t({ 'zh-CN': '专注完成！休息一下', en: 'Focus session complete. Take a break.', ja: '集中セッションが完了しました。休憩しましょう。' }), type: 'success', position: 'top-right' })
}, { flush: 'sync' })

watch(isBreakPhase, (isBreak, wasBreak) => {
  if (suppressPhaseNotifications || !wasBreak || isBreak) return
  ElNotification({ title: t({ 'zh-CN': '休息结束，开始专注', en: 'Break over. Time to focus.', ja: '休憩が終わりました。集中を始めましょう。' }), type: 'success', position: 'top-right' })
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
  user-select: none;
}

.time-row {
  position: absolute;
  top: 14px;
  left: 20px;
}
.datetime-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted, #7A7A75);
  font-weight: 600;
  font-family: var(--font-family-base);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle, #E6E6E4);
  padding: 6px 16px;
  border-radius: 9999px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  transition: all 0.2s ease;
}
.datetime-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8B9A6E;
  opacity: 0.8;
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
  gap: 8px;
  padding: 5px 18px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.6px;
  background: rgba(139, 154, 110, 0.12);
  color: #556B3D;
  border: 0.5px solid rgba(139, 154, 110, 0.28);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.08);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.phase-beacon {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8B9A6E;
  transition: all 0.3s ease;
}
.phase-pill.is-active .phase-beacon {
  animation: beacon-pulse 2s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.8);
}
@keyframes beacon-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.4);
    opacity: 1;
  }
}
.phase-pill.is-break {
  background: rgba(200, 155, 109, 0.15);
  color: #9C7240;
  border-color: rgba(200, 155, 109, 0.32);
  box-shadow: 0 2px 8px rgba(200, 155, 109, 0.1);
}
.phase-pill.is-break .phase-beacon {
  background: #C89B6D;
}
.phase-pill.is-break.is-active .phase-beacon {
  box-shadow: 0 0 6px rgba(200, 155, 109, 0.8);
}

.progress-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 4px 8px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(139, 154, 110, 0.18);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.dot.is-filled {
  background: #8B9A6E;
  box-shadow: 0 0 10px rgba(139, 154, 110, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
  transform: scale(1.18);
}
.dot.is-break-filled {
  background: #C89B6D;
  box-shadow: 0 0 10px rgba(200, 155, 109, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
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
  padding: 9px 20px;
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default, #E6E6E4);
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  letter-spacing: 0.3px;
}
.ctrl-btn:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: #8B9A6E;
  color: #8B9A6E;
  transform: translateY(-1.5px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.18);
}
.ctrl-btn:active {
  transform: translateY(0.5px) scale(0.96);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
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
  box-shadow: 0 8px 24px -2px rgba(139, 154, 110, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  position: relative;
  outline: none;
}
.main-btn:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 10px 30px rgba(139, 154, 110, 0.52), 0 3px 8px rgba(0, 0, 0, 0.06);
}
.main-btn:active {
  transform: translateY(1px) scale(0.96);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.36);
}
.main-btn.is-break {
  background: linear-gradient(135deg, #D6AF83 0%, #C89B6D 100%);
  box-shadow: 0 8px 24px -2px rgba(200, 155, 109, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
}
.main-btn.is-break:hover {
  box-shadow: 0 10px 30px rgba(200, 155, 109, 0.52), 0 3px 8px rgba(0, 0, 0, 0.06);
}

.play-icon {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 12px 0 12px 19px;
  border-color: transparent transparent transparent #FFFFFF;
  margin-left: 4px;
}
.pause-icon {
  width: 16px;
  height: 20px;
  border-left: 5px solid #FFFFFF;
  border-right: 5px solid #FFFFFF;
  border-radius: 1px;
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
  box-shadow: 0 8px 24px -2px rgba(154, 176, 143, 0.35);
}
html.dark .main-btn.is-break {
  background: #C89B6D;
  box-shadow: 0 8px 24px -2px rgba(200, 155, 109, 0.35);
}
html.dark .dot {
  background: rgba(163, 177, 155, 0.2);
}
html.dark .dot.is-filled {
  background: #9AB08F;
  box-shadow: 0 0 10px rgba(154, 176, 143, 0.6);
}
html.dark .phase-pill {
  background: rgba(154, 176, 143, 0.16);
  color: #b8ccaf;
  border-color: rgba(154, 176, 143, 0.32);
}
html.dark .phase-pill.is-break {
  background: rgba(200, 155, 109, 0.18);
  color: #dfba92;
  border-color: rgba(200, 155, 109, 0.35);
}
</style>
