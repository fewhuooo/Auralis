<template>
  <div
    class="pomodoro-ring"
    :class="{ 'is-running': isRunning }"
    :style="{
      width: size || '264px',
      height: size || '264px',
    }"
    role="button"
    :aria-label="ariaLabel || '专注计时盘'"
    @click="$emit('center-click')"
  >
    <!-- #ifdef H5 -->
    <svg class="ring-svg" viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="rgba(139, 154, 110, 0.14)"
        stroke-width="3.5"
        class="track-circle"
      />
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        :stroke="color"
        stroke-width="3.8"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="progress-circle"
        :class="{ 'is-running': isRunning, 'is-break': isBreak }"
      />
    </svg>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <div class="ring-conic-track" :style="{ background: ringBackground }"></div>
    <!-- #endif -->

    <div class="ring-inner" :class="{ 'is-running': isRunning, 'has-bottom-pill': showBottomPill, 'is-large': large }">
      <span v-if="isBreak && !showBottomPill" class="break-kicker">休息</span>
      <div class="time-container">
        <span class="time-text num-tabular">{{ formattedTime }}</span>
      </div>
      <div v-if="showBottomPill" class="ring-pill" :class="{ 'is-pulsing': isRunning }" aria-hidden="true">
        <div class="pill-dot" :style="{ backgroundColor: color }"></div>
      </div>
      <div v-else-if="cycleCount !== undefined" class="dial-cycles" aria-hidden="true">
        <div
          v-for="idx in 4"
          :key="idx"
          class="dial-dot"
          :class="{
            'is-filled': (cycleCount % 4) >= idx || (cycleCount > 0 && cycleCount % 4 === 0),
            'is-break': isBreak,
          }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  totalSeconds: number
  remainingSeconds: number
  isRunning: boolean
  color: string
  size?: string
  cycleCount?: number
  isBreak?: boolean
  showBottomPill?: boolean
  large?: boolean
  ariaLabel?: string
}>()

defineEmits(['center-click'])

const circumference = 2 * Math.PI * 44

const progressRatio = computed(() => (
  props.totalSeconds > 0
    ? Math.max(0, Math.min(1, props.remainingSeconds / props.totalSeconds))
    : 0
))

const dashOffset = computed(() => circumference * (1 - progressRatio.value))

const ringBackground = computed(() => {
  const deg = Math.round(progressRatio.value * 3600) / 10
  return `conic-gradient(${props.color} ${deg}deg, rgba(139, 154, 110, 0.14) ${deg}deg)`
})

const formattedTime = computed(() => {
  const clamped = Math.max(0, Math.floor(props.remainingSeconds))
  const mins = Math.floor(clamped / 60)
  const secs = clamped % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})
</script>

<style scoped>
.pomodoro-ring {
  position: relative;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  transition: transform 0.28s var(--ease-out);
}

.pomodoro-ring:hover {
  transform: scale(1.014);
}

.pomodoro-ring:active {
  transform: scale(0.985);
}

/* #ifdef H5 */
.ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  overflow: visible;
  pointer-events: none;
}

.track-circle {
  transition: stroke 0.3s ease;
}

.progress-circle {
  transition: stroke-dashoffset 1s linear, stroke 0.3s ease, filter 0.3s ease;
}

.progress-circle.is-running {
  filter: drop-shadow(0 0 6px rgba(139, 154, 110, 0.45));
}

.progress-circle.is-running.is-break {
  filter: drop-shadow(0 0 6px rgba(200, 155, 109, 0.45));
}
/* #endif */

.ring-conic-track {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-sizing: border-box;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 9px), #000 calc(100% - 8px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 9px), #000 calc(100% - 8px));
}

.ring-inner {
  position: relative;
  z-index: 1;
  width: calc(100% - 16px);
  height: calc(100% - 16px);
  border-radius: 50%;
  background-color: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: transform 0.35s var(--ease-out);
}

.ring-inner.is-running {
  animation: ring-pulse 4s ease-in-out infinite;
}

@keyframes ring-pulse {
  0%, 100% {
    transform: scale(1.008);
  }
  50% {
    transform: scale(1.022);
  }
}

.time-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.ring-inner.has-bottom-pill .time-container {
  margin-top: -12px;
}

.break-kicker {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.12em;
  color: var(--color-warning-ink);
}

.ring-inner.has-bottom-pill.is-large .time-container {
  margin-top: -16px;
}

.time-text {
  font-size: clamp(50px, 6vw, 72px);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.04em;
}

.ring-inner.has-bottom-pill .time-text {
  font-size: clamp(48px, 15.5vw, 66px);
  letter-spacing: -2px;
}

.ring-inner.has-bottom-pill.is-large .time-text {
  font-size: clamp(68px, 6.6vw, 88px);
  letter-spacing: -2.5px;
}

.ring-pill {
  position: absolute;
  bottom: 14%;
  width: 40px;
  height: 20px;
  border-radius: 9999px;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.82));
  background-color: var(--glass-bg, rgba(252, 251, 249, 0.70));
  backdrop-filter: var(--glass-blur-soft, blur(18px));
  -webkit-backdrop-filter: var(--glass-blur-soft, blur(18px));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: all 0.3s var(--ease-out);
}

.pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transition: background-color 0.3s ease, transform 0.3s ease;
}

.ring-pill.is-pulsing .pill-dot {
  animation: dot-breathe 2.4s ease-in-out infinite;
}

@keyframes dot-breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
  }
}

.dial-cycles {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dial-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: rgba(139, 154, 110, 0.2);
  transition: transform 0.25s var(--ease-out), background-color 0.25s ease;
}

.dial-dot.is-filled {
  background-color: var(--color-zen-sage);
  transform: scale(1.18);
}

.dial-dot.is-filled.is-break {
  background-color: var(--color-pomodoro-break);
}
</style>
