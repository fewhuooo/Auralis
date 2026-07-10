<template>
  <view class="heatmap-chart">
    <!-- 头部：当月展示与总数统计 (Current Month Summary & Legend) -->
    <view class="month-header">
      <view class="month-title">
        <text class="m-name">专注持续热力</text>
        <text class="total-badge">近16周共 {{ currentMonthObj.totalCount }} 次打卡</text>
      </view>

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

    <!-- 活跃度色块网格：自上而下按周横向排列 (GitHub Style 16 Weeks x 7 Days) -->
    <view class="calendar-grid">
      <view class="days-container">
        <!-- 纯色日期块 -->
        <view 
          v-for="day in currentMonthObj.days" 
          :key="day.date"
          class="day-cell"
          :class="[`level-${day.level}`, { 'is-selected': selectedDay?.date === day.date, 'is-today': day.isToday }]"
          @click="selectDay(day)"
        ></view>
      </view>
    </view>
    
    <!-- 选中色块或默认提示 (常驻容器避免初次加载时高度未决或跳动) -->
    <view class="heatmap-tooltip">
      <text class="tooltip-text" v-if="selectedDay">
        {{ selectedDay.date }} : 记录了 {{ selectedDay.count }} 次学习行为
      </text>
      <text class="tooltip-text default-tip" v-else>
        💡 点击上方热力方块，可查看对应日期的学习专注记录
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface DayData {
  date: string
  count: number
  level: number
  isToday: boolean
}

interface MonthData {
  year: number
  month: number
  totalCount: number
  startOffset: number
  days: DayData[]
}

const props = defineProps<{
  dataset: { date: string; count: number }[]
}>()

const selectedDay = ref<DayData | null>(null)

const selectDay = (day: DayData) => {
  selectedDay.value = day
}

// 活跃度层级算法 (0-4 级)
const getLevel = (count: number) => {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

// 计算近期 16 周 (112天) 数据 - GitHub 风格横向热力图
const currentMonthObj = computed<MonthData>(() => {
  const dataMap: Record<string, number> = {}
  if (props.dataset && props.dataset.length > 0) {
    props.dataset.forEach(item => {
      dataMap[item.date] = item.count
    })
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const year = today.getFullYear()
  const month = today.getMonth() + 1

  // 生成从今日倒推 112 天（16周）的数据矩阵
  const totalDays = 112
  let totalCount = 0
  const days: DayData[] = []

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const count = dataMap[dateStr] || 0
    totalCount += count
    days.push({
      date: dateStr,
      count,
      level: getLevel(count),
      isToday: dateStr === todayStr
    })
  }

  return {
    year,
    month,
    totalCount,
    startOffset: 0,
    days
  }
})
</script>

<style scoped>
.heatmap-chart {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* 当月展示与总数看板 */
.month-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
  flex-wrap: wrap;
  gap: 12rpx;
  flex-shrink: 0;
}

.month-title {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.m-name {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--text-primary);
}
.total-badge {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--text-accent, #A3B19B);
  background: rgba(163, 177, 155, 0.16);
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.leg-text {
  font-size: 20rpx;
  color: var(--text-muted);
  font-weight: 600;
}
.leg-box {
  width: 18rpx;
  height: 18rpx;
  border-radius: 4rpx;
}

/* GitHub 风格横向 紧凑矩阵 - 自适应铺满大部分空间 */
.calendar-grid {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.days-container {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-rows: repeat(7, 1fr);
  grid-template-columns: repeat(16, 1fr);
  grid-auto-flow: column;
  gap: 10rpx;
}

.day-cell {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  box-sizing: border-box;
  border: 2rpx solid rgba(255, 255, 255, 0.5);
}
.day-cell:active {
  transform: scale(0.92);
}

/* 选中与今日高亮边框 */
.day-cell.is-today {
  border: 3rpx solid var(--text-primary);
}
.day-cell.is-selected {
  box-shadow: 0 0 0 4rpx var(--text-accent, #A3B19B);
  transform: scale(1.08);
  z-index: 2;
}

/* 颜色分级 (品牌禅意配色映射：没学习也保持清晰的暖石灰底色) */
.level-0 {
  background: var(--color-zen-stone-light, #e2e2de);
  border: 2rpx solid rgba(0, 0, 0, 0.08);
}
.level-1 {
  background: rgba(163, 177, 155, 0.28);
}
.level-2 {
  background: rgba(163, 177, 155, 0.52);
}
.level-3 {
  background: rgba(163, 177, 155, 0.76);
}
.level-4 {
  background: var(--text-accent, #A3B19B);
}

/* 提示悬浮卡 */
.heatmap-tooltip {
  margin-top: 10rpx;
  background: var(--color-bg-elevated, #ffffff);
  border: 1px solid var(--color-zen-hairline, rgba(0, 0, 0, 0.08));
  border-radius: 16rpx;
  padding: 10rpx 20rpx;
  text-align: center;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.05);
}
.tooltip-text {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
