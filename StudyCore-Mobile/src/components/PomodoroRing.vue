<template>
  <view class="pomodoro-ring">
    <svg class="ring-svg" viewBox="0 0 100 100">
      <!-- Background track -->
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="var(--text-primary)"
        stroke-width="3"
        opacity="0.05"
      />
      <!-- Progress indicator -->
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        :stroke="color"
        stroke-width="3"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="progress-circle"
        :class="{ 'is-running': isRunning }"
      />
    </svg>
    <view class="time-display" :class="{ 'is-running': isRunning }" @click="$emit('center-click')">
      <view class="time-container">
        <text class="time-text">{{ formattedTime }}</text>
      </view>
      <view class="ring-pill">
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
}>()

const emit = defineEmits(['center-click'])

const circumference = 2 * Math.PI * 44

const dashOffset = computed(() => {
  const progress = props.remainingSeconds / props.totalSeconds
  return circumference * (1 - progress)
})

const formattedTime = computed(() => {
  const m = Math.floor(props.remainingSeconds / 60)
  const s = props.remainingSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
</script>

<style scoped>
.pomodoro-ring {
  position: relative;
  width: clamp(400rpx, 64vw, 560rpx);
  height: clamp(400rpx, 64vw, 560rpx);
  max-width: 44vh;
  max-height: 44vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.progress-circle {
  transition: stroke-dashoffset 1s linear;
}
.time-display {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s;
}
.time-display.is-running {
  transform: scale(1.02);
}
.time-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: -20rpx;
}
.time-text {
  font-size: 140rpx;
  font-weight: 600;
  font-family: 'Inter', system-ui, sans-serif;
  color: #111;
  letter-spacing: -2rpx;
  line-height: 1;
}

/* The small pill switch at the bottom of the ring */
.ring-pill {
  position: absolute;
  bottom: 60rpx;
  width: 60rpx;
  height: 30rpx;
  border-radius: 20rpx;
  border: 2rpx solid #eee;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.05);
}
.pill-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
}
</style>
