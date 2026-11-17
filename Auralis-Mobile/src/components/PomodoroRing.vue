<template>
  <view
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
        r="48.5"
        fill="none"
        stroke="rgba(28, 28, 26, 0.10)"
        stroke-width="0.75"
      />
      <circle
        cx="50"
        cy="50"
        r="44.5"
        fill="none"
        stroke="rgba(139, 154, 110, 0.2)"
        stroke-width="2.4"
      />
      <circle
        cx="50"
        cy="50"
        r="44.5"
        fill="none"
        :stroke="color"
        stroke-width="3.2"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="progress-circle"
        :class="{ 'is-running': isRunning, 'is-break': isBreak }"
      />
    </svg>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <view class="ring-conic-track" :style="{ background: ringBackground }"></view>
    <!-- #endif -->

    <view class="ring-inner">
      <text v-if="isBreak" class="break-kicker">休息</text>
      <text class="time-text num-tabular">{{ formattedTime }}</text>
      <view v-if="cycleCount !== undefined" class="dial-cycles" aria-hidden="true">
        <view
          v-for="idx in 4"
          :key="idx"
          class="dial-dot"
          :class="{
            'is-filled': (cycleCount % 4) >= idx || (cycleCount > 0 && cycleCount % 4 === 0),
            'is-break': isBreak,
          }"
        ></view>
      </view>
    </view>
  </view>
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
  ariaLabel?: string
}>()

defineEmits(['center-click'])

const circumference = 2 * Math.PI * 44.5

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

.progress-circle {
  transition: stroke-dashoffset 1s linear, stroke 0.3s ease, filter 0.3s ease;
}

.progress-circle.is-running {
  filter: drop-shadow(0 0 6px rgba(139, 154, 110, 0.38));
}

.progress-circle.is-running.is-break {
  filter: drop-shadow(0 0 6px rgba(200, 155, 109, 0.4));
}
/* #endif */

.ring-conic-track {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  padding: 5px;
  box-sizing: border-box;
}

.ring-inner {
  position: relative;
  z-index: 1;
  width: calc(100% - 16px);
  height: calc(100% - 16px);
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.break-kicker {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.12em;
  color: var(--color-warning-ink);
}

.time-text {
  font-size: clamp(50px, 6vw, 72px);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.04em;
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
