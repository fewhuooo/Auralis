<template>
  <view class="pie-chart">
    <view class="chart-container">
      <svg class="chart-svg" viewBox="0 0 200 200">
        <!-- Background track -->
        <circle cx="100" cy="100" r="80" fill="none" stroke="var(--color-bg-tertiary)" stroke-width="18" />
        
        <!-- Animated Segments group (rotated -90deg so it starts at the top) -->
        <g transform="rotate(-90 100 100)">
          <circle 
            v-for="(seg, index) in renderSegments" 
            :key="index"
            cx="100" cy="100" r="80"
            fill="none"
            :stroke="seg.color"
            stroke-width="18"
            :stroke-dasharray="`${seg.dash} ${circumference}`"
            :stroke-dashoffset="seg.offset"
            stroke-linecap="round"
            class="pie-segment"
          />
        </g>
        
        <!-- Text labels (non-rotated) -->
        <text x="100" y="105" text-anchor="middle" class="center-value">{{ total }}</text>
        <text x="100" y="130" text-anchor="middle" class="center-label">总知识块</text>
      </svg>
    </view>
    
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
  segments: { subject: string; percentage: number; color: string }[]
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
  justify-content: center;
  gap: 40rpx;
  width: 100%;
  height: 100%;
}
.chart-container {
  flex: none;
  width: 200rpx;
  height: 200rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chart-svg {
  width: 100%;
  height: 100%;
}
.pie-segment {
  transition: stroke-dasharray 0.5s ease-out, stroke-dashoffset 0.5s ease-out;
}
.center-value {
  font-size: 32px;
  font-weight: 900;
  fill: var(--text-primary);
}
.center-label {
  font-size: 11px;
  font-weight: 600;
  fill: var(--text-muted);
}

.legend {
  flex: none;
  width: 380rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  justify-content: center;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.dot {
  width: 18rpx; height: 18rpx;
  border-radius: 50%;
  flex-shrink: 0;
}
.l-name {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.l-val {
  font-size: 26rpx;
  font-weight: 900;
  color: var(--text-accent, #7D9372);
  flex-shrink: 0;
}
</style>
