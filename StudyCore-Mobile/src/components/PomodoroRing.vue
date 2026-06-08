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
        stroke-width="4"
        opacity="0.05"
      />
      <!-- Progress indicator -->
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        :stroke="color"
        stroke-width="4"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="progress-circle"
        :class="{ 'is-running': isRunning }"
        :style="{ filter: `drop-shadow(0 0 16rpx ${color}50)` }"
      />
    </svg>
    <view class="time-display" :class="{ 'is-running': isRunning }" @click="$emit('center-click')">
      <view class="task-info">
        <text class="t-name" v-if="taskName">{{ taskName }}</text>
        <text class="t-name placeholder" v-else>点击选择任务</text>
      </view>
      
      <view class="time-container">
        <text class="time-text">{{ formattedTime }}</text>
      </view>
      
      <view class="subject-info">
        <view class="s-dot" :style="{ backgroundColor: color }"></view>
        <text class="s-name">{{ subjectName }}</text>
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
  taskName?: string
  subjectName?: string
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
  width: 540rpx;
  height: 540rpx;
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
  cursor: pointer;
}
.time-display.is-running {
  transform: scale(1.02);
}
.task-info {
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
  background: var(--color-bg-secondary);
  padding: 0 36rpx;
  border-radius: 40rpx;
  box-shadow: inset 0 2rpx 8rpx rgba(0,0,0,0.02);
}
.t-name {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 1rpx;
}
.t-name.placeholder {
  color: var(--text-muted);
  font-weight: 500;
}
.time-container {
  display: flex;
  justify-content: center;
  align-items: center;
}
.time-text {
  font-size: 110rpx;
  font-weight: 700;
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--text-primary);
  letter-spacing: 2rpx;
  line-height: 1.1;
  text-shadow: 0 4rpx 16rpx rgba(0,0,0,0.06);
}
.subject-info {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 20rpx;
  background: rgba(0,0,0,0.03);
  padding: 8rpx 24rpx;
  border-radius: 30rpx;
}
html.dark .subject-info {
  background: rgba(255,255,255,0.05);
}
.s-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
}
.s-name {
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
}
</style>
