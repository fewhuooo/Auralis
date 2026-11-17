<template>
  <view
    class="pomodoro-ring"
    :style="{
      width: size || '256px',
      height: size || '256px',
      background: ringBackground,
    }"
  >
    <view
      class="ring-inner"
      :class="{ 'is-running': isRunning }"
      @click="$emit('center-click')"
    >
      <text v-if="phaseLabel" class="phase-tag" :style="{ color }">{{ phaseLabel }}</text>
      <text class="time-text num-tabular">{{ formattedTime }}</text>
      <view v-if="isRunning" class="live-dot" :style="{ backgroundColor: color }"></view>
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
  return `conic-gradient(${props.color} ${deg}deg, rgba(28, 28, 26, 0.08) ${deg}deg)`
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
  padding: 6px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: transform 0.2s var(--ease-out), background 0.3s linear;
}

.pomodoro-ring:active {
  transform: scale(0.985);
}

.ring-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--specular-top);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
}

.phase-tag {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
}

.time-text {
  font-size: clamp(46px, 5.5vw, 64px);
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-mono);
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.03em;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pulseDot 1.8s ease-in-out infinite;
}

@keyframes pulseDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.75); }
}
</style>
