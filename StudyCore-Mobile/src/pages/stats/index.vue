<template>
  <AppPageLayout>
    <view class="stats-page">
      <!-- Header -->
      <view class="custom-header">
        <view class="header-content">
          <view class="icon-btn menu-btn" @click.stop="openDrawer">
            <LineIcon name="menu" size="44rpx" />
          </view>
          <text class="header-title">数据洞察</text>
          <view class="header-right"></view>
        </view>
      </view>

      <scroll-view scroll-y class="content-area">
        
        <!-- Section 1: Weekly Focus Chart -->
        <view class="stats-section">
          <text class="section-title">本周专注</text>
          <view class="chart-wrapper">
            <WeeklyChart :data="weeklyData" />
          </view>
          <view class="section-footnote">
            <text class="footnote-highlight">{{ weeklyAverage }} 分钟</text>
            <text class="footnote-text"> · 日平均专注时长</text>
          </view>
        </view>

        <!-- Section 2: Big Numbers -->
        <view class="stats-section">
          <view class="big-stats-row">
            <view class="big-stat">
              <view class="big-stat-val">{{ overview.totalFocusHours }}<text class="stat-unit">h</text></view>
              <view class="big-stat-label">累计专注</view>
            </view>
            <view class="big-stat">
              <view class="big-stat-val">{{ overview.totalBlocks }}</view>
              <view class="big-stat-label">知识块</view>
            </view>
          </view>
        </view>

        <!-- Section 3: Streak and Sub-metrics -->
        <view class="stats-section">
          <view class="streak-row">
            <LineIcon name="fire" size="44rpx" color="var(--text-primary)" />
            <text class="streak-num">{{ overview.streakDays }}</text>
            <text class="streak-unit">天连续学习</text>
          </view>
          <view class="sub-metrics-row">
            <view class="metric-item">
              <text class="metric-val">{{ overview.completedTasks }}</text>
              <text class="metric-label">完成任务</text>
            </view>
            <view class="metric-divider"></view>
            <view class="metric-item">
              <text class="metric-val">88%</text>
              <text class="metric-label">任务完成率</text>
            </view>
          </view>
        </view>

        <!-- Section 4: Subject Distribution -->
        <view class="stats-section">
          <text class="section-title">学科分布</text>
          <view class="chart-wrapper">
            <SubjectPieChart :segments="subjectSegments" :total="overview.totalBlocks" />
          </view>
        </view>

        <!-- Section 5: Heatmap -->
        <view class="stats-section last-section">
          <text class="section-title">学习活跃度</text>
          <view class="chart-wrapper">
            <HeatmapChart :dataset="heatmapData" />
          </view>
        </view>

        <view class="bottom-spacer"></view>
      </scroll-view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLayoutStore } from '@/store/useLayoutStore'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import WeeklyChart from '@/components/WeeklyChart.vue'
import SubjectPieChart from '@/components/SubjectPieChart.vue'
import HeatmapChart from '@/components/HeatmapChart.vue'

const layoutStore = useLayoutStore()
const openDrawer = () => layoutStore.openDrawer()

// Overview stats
const overview = ref({
  streakDays: 12,
  totalBlocks: 145,
  completedTasks: 38,
  totalFocusHours: 24.5
})

// Weekly focus data
const weeklyData = ref([
  { day: '一', minutes: 120 },
  { day: '二', minutes: 90 },
  { day: '三', minutes: 150 },
  { day: '四', minutes: 60 },
  { day: '五', minutes: 200 },
  { day: '六', minutes: 45, isToday: true },
  { day: '日', minutes: 0 }
])

const weeklyAverage = computed(() => {
  const sum = weeklyData.value.reduce((acc, curr) => acc + curr.minutes, 0)
  return Math.round(sum / weeklyData.value.length)
})

// Subject distribution
const subjectSegments = ref([
  { subject: '计算机网络', percentage: 45, color: '#3b82f6' },
  { subject: '操作系统', percentage: 30, color: '#10b981' },
  { subject: '算法与数据结构', percentage: 25, color: '#f59e0b' }
])

// Heatmap contribution data
const heatmapData = ref<{ date: string; count: number }[]>([])

const generateHeatmapData = () => {
  const data = []
  const today = new Date()
  
  // Create last 35 days of counts
  for (let i = 34; i >= 0; i--) {
    const day = new Date()
    day.setDate(today.getDate() - i)
    const dateStr = day.toISOString().split('T')[0]
    
    // Generate some interesting activity patterns
    let count = 0
    const dayOfWeek = day.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Less active on weekends
      count = Math.floor(Math.random() * 4)
    } else {
      // More active on weekdays
      count = Math.floor(Math.random() * 11)
    }
    
    // Add occasional zero days
    if (Math.random() < 0.15) {
      count = 0
    }
    
    data.push({ date: dateStr, count })
  }
  
  heatmapData.value = data
}

onMounted(() => {
  generateHeatmapData()
})
</script>

<style scoped>
.stats-page {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.custom-header {
  padding-top: var(--status-bar-height, 44px);
  background: var(--color-bg-primary);
  z-index: 100;
  position: sticky;
  top: 0;
}

.header-content {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30rpx;
}

.menu-btn {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-primary);
  transition: background 0.2s;
}

.menu-btn:active {
  background: var(--color-bg-elevated);
}

.header-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5rpx;
}

.header-right {
  width: 80rpx;
}

.content-area {
  flex: 1;
  box-sizing: border-box;
}

/* Base style for Magazine Sections */
.stats-section {
  padding: 48rpx 44rpx;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-bg-primary);
}

.stats-section.last-section {
  border-bottom: none;
}

.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 30rpx;
  display: block;
}

.chart-wrapper {
  width: 100%;
}

.section-footnote {
  display: flex;
  align-items: baseline;
  margin-top: 24rpx;
}

.footnote-highlight {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.footnote-text {
  font-size: 24rpx;
  color: var(--text-muted);
}

/* Big Numbers Double Column */
.big-stats-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40rpx;
}

.big-stat {
  flex: 1;
}

.big-stat-val {
  font-size: 68rpx;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: -1rpx;
}

.stat-unit {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 4rpx;
}

.big-stat-label {
  font-size: 24rpx;
  color: var(--text-muted);
  font-weight: 500;
  margin-top: 10rpx;
}

/* Streak and Sub-metrics */
.streak-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 36rpx;
}

.streak-icon {
  /* LineIcon styling is handled via component props */
}

.streak-num {
  font-size: 52rpx;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.streak-unit {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-secondary);
}

.sub-metrics-row {
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary);
  padding: 24rpx 32rpx;
  border-radius: 24rpx;
}

.metric-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.metric-val {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.metric-label {
  font-size: 22rpx;
  color: var(--text-muted);
  font-weight: 500;
}

.metric-divider {
  width: 1px;
  height: 48rpx;
  background: var(--border-subtle);
  margin: 0 32rpx;
}

.bottom-spacer {
  height: calc(120rpx + var(--window-bottom, 0));
}
</style>
