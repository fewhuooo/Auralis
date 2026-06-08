<template>
  <view class="pie-chart">
    <svg class="chart-svg" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="80" fill="none" stroke="var(--color-bg-secondary)" stroke-width="20" />
      
      <circle 
        v-for="(seg, index) in renderSegments" 
        :key="index"
        cx="100" cy="100" r="80"
        fill="none"
        :stroke="seg.color"
        stroke-width="20"
        :stroke-dasharray="`${seg.dash} ${circumference}`"
        :stroke-dashoffset="seg.offset"
        class="pie-segment"
      />
      
      <text x="100" y="95" text-anchor="middle" class="center-value">{{ total }}</text>
      <text x="100" y="115" text-anchor="middle" class="center-label">总知识块</text>
    </svg>
    
    <view class="legend">
      <view class="legend-item" v-for="(seg, index) in segments" :key="index">
        <view class="dot" :style="{ background: seg.color }"></view>
        <text class="l-name">{{ seg.subject }}</text>
        <text class="l-val">{{ seg.percentage }}%</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  segments: { subject: string, percentage: number, color: string }[]
  total: number
}>()

const circumference = 2 * Math.PI * 80

const renderSegments = computed(() => {
  let accumulatedPercent = 0
  return props.segments.map(seg => {
    const dash = (seg.percentage / 100) * circumference
    const offset = - (accumulatedPercent / 100) * circumference
    accumulatedPercent += seg.percentage
    return { ...seg, dash, offset }
  })
})
</script>

<style scoped>
.pie-chart {
  display: flex;
  align-items: center;
  gap: 40rpx;
}
.chart-svg {
  width: 240rpx;
  height: 240rpx;
  transform: rotate(-90deg);
}
.pie-segment {
  transition: stroke-dasharray 1s ease-out;
}
.center-value {
  font-size: 32px;
  font-weight: 800;
  fill: var(--text-primary);
  transform: rotate(90deg) translate(95px, -100px); /* Adjust rotation compensation */
}
.center-label {
  font-size: 12px;
  fill: var(--text-muted);
  transform: rotate(90deg) translate(115px, -100px);
}

.legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.dot {
  width: 16rpx; height: 16rpx;
  border-radius: 50%;
}
.l-name {
  font-size: 26rpx;
  color: var(--text-secondary);
  flex: 1;
}
.l-val {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
