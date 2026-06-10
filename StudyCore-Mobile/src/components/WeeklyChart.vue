<template>
  <view class="weekly-chart">
    <svg class="chart-svg" viewBox="0 0 360 160" preserveAspectRatio="none">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--text-accent)" stop-opacity="1" />
          <stop offset="100%" stop-color="var(--text-accent)" stop-opacity="0.3" />
        </linearGradient>
      </defs>
      
      <!-- Grid Lines -->
      <line x1="15" y1="20" x2="345" y2="20" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="2 2" />
      <line x1="15" y1="70" x2="345" y2="70" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="2 2" />
      <line x1="15" y1="120" x2="345" y2="120" stroke="var(--border-default)" stroke-width="1" />
      
      <!-- Average Line -->
      <line 
        x1="15" 
        :y1="120 - avgHeight" 
        x2="345" 
        :y2="120 - avgHeight" 
        stroke="var(--color-warning)" 
        stroke-width="1.5" 
        stroke-dasharray="4 4" 
      />
      <text x="345" :y="120 - avgHeight - 4" text-anchor="end" class="chart-label warning">均: {{ avgMinutes }}m</text>

      <!-- Bars -->
      <g v-for="(item, index) in chartData" :key="index" :transform="`translate(${index * 46 + 22}, 0)`">
        <!-- Background track -->
        <rect x="0" y="20" width="16" height="100" rx="8" fill="var(--color-bg-tertiary)" />
        
        <!-- Actual bar -->
        <rect 
          x="0" 
          :y="120 - item.height" 
          width="16" 
          :height="item.height" 
          rx="8" 
          :fill="item.isToday ? 'url(#barGrad)' : 'var(--text-accent)'" 
          :fill-opacity="item.isToday ? 1 : 0.6"
          class="chart-bar"
        />
        
        <!-- Value Label for Peak -->
        <text 
          v-if="item.minutes === peakMinutes && item.minutes > 0" 
          x="8" 
          :y="114 - item.height" 
          text-anchor="middle" 
          class="chart-label peak"
        >
          👑 {{ item.minutes }}m
        </text>

        <!-- Day label -->
        <text x="8" y="145" text-anchor="middle" class="day-label" :class="{ 'is-today': item.isToday }">
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

const maxMins = computed(() => {
  return Math.max(...props.data.map(d => d.minutes), 60) // at least 60 mins scale
})

const peakMinutes = computed(() => {
  return Math.max(...props.data.map(d => d.minutes), 0)
})

const avgMinutes = computed(() => {
  const total = props.data.reduce((acc, d) => acc + d.minutes, 0)
  return Math.round(total / props.data.length)
})

const avgHeight = computed(() => {
  return (avgMinutes.value / maxMins.value) * 100
})

const chartData = computed(() => {
  return props.data.map(d => ({
    ...d,
    height: Math.max((d.minutes / maxMins.value) * 100, 4) // Min height of 4
  }))
})
</script>

<style scoped>
.weekly-chart {
  width: 100%;
  height: 320rpx;
}
.chart-svg {
  width: 100%;
  height: 100%;
}
.chart-bar {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.day-label {
  font-size: 10px;
  fill: var(--text-muted);
}
.day-label.is-today {
  fill: var(--text-primary);
  font-weight: bold;
}
.chart-label {
  font-size: 9px;
  fill: var(--text-muted);
}
.chart-label.warning {
  fill: var(--color-warning);
  font-weight: bold;
}
.chart-label.peak {
  fill: var(--text-accent);
  font-weight: bold;
}
</style>
