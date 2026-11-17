<template>
  <view
    class="pomodoro-ring"
    :style="{
      width: size || '264px',
      height: size || '264px',
      background: ringBackground,
    }"
  >
    <view class="ring-inner" @click="$emit('center-click')">
      <text class="time-text num-tabular">{{ formattedTime }}</text>
      <view class="ring-pill" :class="{ 'is-pulsing': isRunning }">
        <view class="pill-dot" :style="{ backgroundColor: color }"></view>
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
  phaseLabel?: string
  size?: string
}>()

defineEmits(['center-click'])

const ringBackground = computed(() => {
  const ratio = props.totalSeconds > 0
    ? Math.max(0, Math.min(1, props.remainingSeconds / props.totalSeconds))
    : 0
  const deg = Math.round(ratio * 3600) / 10
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
  padding: 5px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.25s var(--ease-out), background 0.3s linear;
}

.pomodoro-ring:hover {
  transform: scale(1.012);
}

.pomodoro-ring:active {
  transform: scale(0.985);
}

.ring-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.time-text {
  font-size: clamp(54px, 6vw, 72px);
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-base);
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -2px;
  margin-top: -12px;
}

.ring-pill {
  position: absolute;
  bottom: 34px;
  width: 38px;
  height: 18px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background-color: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
}

.pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.ring-pill.is-pulsing .pill-dot {
  animation: dotBreathe 2.4s ease-in-out infinite;
}

@keyframes dotBreathe {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.35); opacity: 1; }
}
</style>
