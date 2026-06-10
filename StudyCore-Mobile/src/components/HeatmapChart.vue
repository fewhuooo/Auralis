<template>
  <view class="heatmap-chart">
    <view class="heatmap-header">
      <text class="heatmap-title">📊 学习热力图 (最近 35 天)</text>
      <view class="legend">
        <text class="leg-text">少</text>
        <view class="leg-box level-0"></view>
        <view class="leg-box level-1"></view>
        <view class="leg-box level-2"></view>
        <view class="leg-box level-3"></view>
        <view class="leg-box level-4"></view>
        <text class="leg-text">多</text>
      </view>
    </view>
    
    <view class="chart-wrapper">
      <svg class="heatmap-svg" viewBox="0 0 320 100" preserveAspectRatio="xMidYMid meet">
        <!-- Weekday Labels -->
        <text x="12" y="22" class="y-label">一</text>
        <text x="12" y="46" class="y-label">三</text>
        <text x="12" y="70" class="y-label">五</text>
        <text x="12" y="94" class="y-label">日</text>
        
        <!-- Heatmap Grid -->
        <g v-for="(week, wIndex) in gridData" :key="wIndex" :transform="`translate(${wIndex * 14 + 30}, 0)`">
          <!-- Month label (only show at start of columns if month changed, or just week number/label) -->
          <text v-if="week.label" x="0" y="10" class="x-label">{{ week.label }}</text>
          
          <rect 
            v-for="(day, dIndex) in week.days" 
            :key="dIndex"
            x="0" 
            :y="dIndex * 12 + 16" 
            width="10" 
            height="10" 
            rx="2" 
            :class="`day-cell level-${day.level}`"
            @click="selectDay(day)"
          >
            <title>{{ day.date }}: {{ day.count }} 个动作</title>
          </rect>
        </g>
      </svg>
    </view>
    
    <view class="heatmap-tooltip" v-if="selectedDay">
      <text class="tooltip-text">{{ selectedDay.date }} : 记录了 {{ selectedDay.count }} 次学习行为</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface DayData {
  date: string
  count: number
  level: number
}

interface WeekData {
  label: string
  days: DayData[]
}

const props = defineProps<{
  dataset: { date: string; count: number }[]
}>()

const selectedDay = ref<DayData | null>(null)

const selectDay = (day: DayData) => {
  selectedDay.value = day
}

const gridData = computed(() => {
  // We want to construct a 5-week (35 days) grid.
  // We partition the dataset of 35 items into 5 weeks of 7 days.
  const weeks: WeekData[] = []
  const dataCopy = [...props.dataset].slice(-35) // Get latest 35 days
  
  // Fill up if less than 35 days
  while (dataCopy.length < 35) {
    const prevDate = new Date()
    prevDate.setDate(prevDate.getDate() - dataCopy.length - 1)
    const dateStr = prevDate.toISOString().split('T')[0]
    dataCopy.unshift({ date: dateStr, count: 0 })
  }

  // Helper to determine color level
  const getLevel = (count: number) => {
    if (count <= 0) return 0
    if (count <= 2) return 1
    if (count <= 5) return 2
    if (count <= 9) return 3
    return 4
  }

  for (let i = 0; i < 5; i++) {
    const days: DayData[] = []
    const weekStartItem = dataCopy[i * 7]
    let label = ''
    
    if (weekStartItem) {
      // Get month name or just w1, w2...
      const date = new Date(weekStartItem.date)
      if (i === 0 || date.getDate() <= 7) {
        label = `${date.getMonth() + 1}月`
      }
    }

    for (let j = 0; j < 7; j++) {
      const item = dataCopy[i * 7 + j] || { date: '', count: 0 }
      days.push({
        date: item.date,
        count: item.count,
        level: getLevel(item.count)
      })
    }
    
    weeks.push({ label, days })
  }
  
  return weeks
})
</script>

<style scoped>
.heatmap-chart {
  width: 100%;
  padding: 10rpx 0;
}

.heatmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.heatmap-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-secondary);
}

.legend {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.leg-text {
  font-size: 20rpx;
  color: var(--text-muted);
}

.leg-box {
  width: 16rpx;
  height: 16rpx;
  border-radius: 2rpx;
}

.chart-wrapper {
  width: 100%;
}

.heatmap-svg {
  width: 100%;
  height: auto;
}

.y-label {
  font-size: 8px;
  fill: var(--text-muted);
  dominant-baseline: middle;
  text-anchor: middle;
}

.x-label {
  font-size: 8px;
  fill: var(--text-muted);
  text-anchor: start;
}

/* Cell Colors for Levels */
.day-cell {
  transition: transform 0.2s, stroke 0.2s;
  cursor: pointer;
}

.day-cell:active {
  transform: scale(0.9);
}

.level-0 {
  fill: var(--color-bg-tertiary);
}
.level-1 {
  fill: rgba(109, 99, 91, 0.2);
}
.level-2 {
  fill: rgba(109, 99, 91, 0.45);
}
.level-3 {
  fill: rgba(109, 99, 91, 0.75);
}
.level-4 {
  fill: var(--text-accent);
}

.heatmap-tooltip {
  margin-top: 16rpx;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10rpx 20rpx;
  text-align: center;
}

.tooltip-text {
  font-size: 22rpx;
  color: var(--text-secondary);
}
</style>
