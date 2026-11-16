<template>
  <view
    class="pomodoro-ring"
    :style="{
      width: size || undefined,
      height: size || undefined,
      background: ringBackground,
    }"
  >
    <view
      class="ring-inner"
      :class="{ 'is-running': isRunning }"
      @click="$emit('center-click')"
    >
      <text class="phase-badge" :style="{ color }">{{ phaseLabel || 'FOCUS' }}</text>
      <text class="time-text">{{ formattedTime }}</text>
      <view class="ring-pill">
        <view class="pill-dot" :style="{ backgroundColor: color }"></view>
        <text class="pill-state">{{ isRunning ? '进行中' : '就绪' }}</text>
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
  width: clamp(380rpx, 60vw, 500rpx);
  height: clamp(380rpx, 60vw, 500rpx);
  max-width: 40vh;
  max-height: 40vh;
  border-radius: 50%;
  padding: 16rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: background 0.3s linear;
}

.ring-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  transition: transform 0.25s ease;
}

.ring-inner.is-running {
  transform: scale(0.99);
}

.phase-badge {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 2rpx;
}

.time-text {
  font-size: 96rpx;
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -2rpx;
}

.ring-pill {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 8rpx 20rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
}

.pill-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
}

.pill-state {
  font-size: 22rpx;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}
</style>
