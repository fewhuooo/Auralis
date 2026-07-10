<template>
  <view class="weekly-chart">
    <svg class="chart-svg" viewBox="0 0 360 150">
      <defs>
        <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#7D9372" />
          <stop offset="100%" stop-color="#9bb390" />
        </linearGradient>
      </defs>

      <!-- Average Guideline -->
      <line 
        v-if="avgMinutes > 0" 
        x1="15" :y1="120 - avgHeight" 
        x2="345" :y2="120 - avgHeight" 
        stroke="var(--color-warning)" 
        stroke-width="1.5" 
        stroke-dasharray="4 4"
      />
      <text v-if="avgMinutes > 0" x="345" :y="120 - avgHeight - 4" text-anchor="end" class="chart-label warning">均: {{ avgMinutes }}m</text>

      <!-- Bars -->
      <g v-for="(item, index) in chartData" :key="index" :transform="`translate(${index * 48 + 10}, 0)`">
        <!-- Background track -->
        <rect x="0" y="20" width="28" height="100" rx="14" fill="var(--color-bg-tertiary)" />
        
        <!-- Actual bar -->
        <rect 
          x="0" 
          :y="120 - item.height" 
          width="28" 
          :height="item.height" 
          rx="14" 
          :fill="item.isToday ? 'url(#barGrad)' : 'var(--text-accent)'" 
          :fill-opacity="item.isToday ? 1 : 0.65"
          class="chart-bar"
        />
        
        <!-- Value Label for Peak -->
        <text 
          v-if="item.minutes === peakMinutes && item.minutes > 0" 
          x="14" 
          :y="114 - item.height" 
          text-anchor="middle" 
          class="chart-label peak"
        >
          👑 {{ item.minutes }}m
        </text>

        <!-- Day label -->
        <text x="14" y="142" text-anchor="middle" class="day-label" :class="{ 'is-today': item.isToday }">
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
  height: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chart-svg {
  width: 100%;
  height: 100%;
}
.chart-bar {
  transition: y 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), fill 0.3s ease;
}
.day-label {
  font-size: 14px;
  font-weight: 700;
  fill: var(--text-secondary);
}
.day-label.is-today {
  fill: var(--text-accent, #7D9372);
  font-weight: 900;
  font-size: 16px;
}
.chart-label {
  font-size: 12px;
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
