<template>
  <view class="weekly-chart">
    <svg class="chart-svg" viewBox="0 0 350 150" preserveAspectRatio="none">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--text-accent)" stop-opacity="1" />
          <stop offset="100%" stop-color="var(--text-accent)" stop-opacity="0.3" />
        </linearGradient>
      </defs>
      
      <!-- Bars -->
      <g v-for="(item, index) in chartData" :key="index" :transform="`translate(${index * 50 + 15}, 0)`">
        <!-- Background track -->
        <rect x="0" y="20" width="20" height="100" rx="10" fill="var(--color-bg-secondary)" />
        <!-- Actual bar -->
        <rect 
          x="0" 
          :y="120 - item.height" 
          width="20" 
          :height="item.height" 
          rx="10" 
          :fill="item.isToday ? 'url(#barGrad)' : 'var(--border-default)'" 
          class="chart-bar"
        />
        <!-- Day label -->
        <text x="10" y="145" text-anchor="middle" class="day-label" :class="{ 'is-today': item.isToday }">
          {{ item.day }}
        </text>
      </g>
    </svg>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: { day: string, minutes: number, isToday?: boolean }[]
}>()

const chartData = computed(() => {
  const maxMins = Math.max(...props.data.map(d => d.minutes), 60) // at least 60 mins scale
  return props.data.map(d => ({
    ...d,
    height: Math.max((d.minutes / maxMins) * 100, 4) // Min height of 4
  }))
})
</script>

<style scoped>
.weekly-chart {
  width: 100%;
  height: 300rpx;
}
.chart-svg {
  width: 100%;
  height: 100%;
}
.chart-bar {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.day-label {
  font-size: 12px;
  fill: var(--text-muted);
}
.day-label.is-today {
  fill: var(--text-primary);
  font-weight: bold;
}
</style>
