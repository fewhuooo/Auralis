<template>
  <AppPageLayout>
    <view class="stats-page">
      <!-- 通用极简禅意顶栏 -->
      <AppHeader title="数据洞察" />

      <scroll-view scroll-y :show-scrollbar="false" class="content-area">
        
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
import AppPageLayout from '@/components/AppPageLayout.vue'
import AppHeader from '@/components/AppHeader.vue'
import LineIcon from '@/components/LineIcon.vue'
import WeeklyChart from '@/components/WeeklyChart.vue'
import SubjectPieChart from '@/components/SubjectPieChart.vue'
import HeatmapChart from '@/components/HeatmapChart.vue'
import { statsApi } from '@/api/statsApi'

// Overview stats
const overview = ref({
  streakDays: 0,
  totalBlocks: 0,
  completedTasks: 0,
  totalFocusHours: 0
})

// Weekly focus data
const weeklyData = ref<{ day: string; minutes: number; isToday?: boolean }[]>([])

const weeklyAverage = computed(() => {
  const sum = weeklyData.value.reduce((acc, curr) => acc + curr.minutes, 0)
  return Math.round(sum / weeklyData.value.length)
})

// Subject distribution
const subjectSegments = ref<{ subject: string; percentage: number; color: string }[]>([])

// Heatmap contribution data
const heatmapData = ref<{ date: string; count: number }[]>([])

onMounted(async () => {
  const today = new Date()
  const fromDate = new Date(today)
  fromDate.setUTCDate(today.getUTCDate() - 6)
  const from = fromDate.toISOString().slice(0, 10)
  const to = today.toISOString().slice(0, 10)
  try {
    const [summary, weekly] = await Promise.all([statsApi.overview(), statsApi.weekly(from, to)])
    const days = weekly.days || []
    overview.value = {
      streakDays: [...days].reverse().findIndex(day => !((day.reviewedCount || 0) + (day.studySeconds || 0))) < 0
        ? days.length
        : [...days].reverse().findIndex(day => !((day.reviewedCount || 0) + (day.studySeconds || 0))),
      totalBlocks: Number(summary.activeKnowledgeBlocks || 0),
      completedTasks: days.reduce((sum, day) => sum + Number(day.completedTaskCount || 0), 0),
      totalFocusHours: Number((days.reduce((sum, day) => sum + Number(day.studySeconds || 0), 0) / 3600).toFixed(1)),
    }
    weeklyData.value = days.map((day) => ({
      day: new Date(`${day.date}T00:00:00Z`).toLocaleDateString('zh-CN', { weekday: 'short' }).slice(-1),
      minutes: Math.round(Number(day.studySeconds || 0) / 60),
      isToday: day.date === to,
    }))
    heatmapData.value = days.map(day => ({
      date: day.date || '',
      count: Number(day.reviewedCount || 0) + Number(day.completedTaskCount || 0) + Number(day.createdKnowledgeCount || 0),
    }))
  } catch (error) {
    console.error('[Stats] Failed to load server statistics:', error)
    uni.showToast({ title: '统计数据加载失败', icon: 'none' })
  }
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
  height: 0;
  min-height: 0;
  box-sizing: border-box;
}

/* Base style for Zen Cards */
.stats-section {
  padding: 40rpx 44rpx;
  background: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
  border-radius: var(--radius-lg);
  margin-bottom: 24rpx;
}

.stats-section.last-section {
  margin-bottom: 0;
}

.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-zen-graphite);
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
  color: var(--color-zen-graphite);
}

.footnote-text {
  font-size: 24rpx;
  color: var(--color-zen-stone);
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
  color: var(--color-zen-graphite);
  line-height: 1.1;
  letter-spacing: -1rpx;
}

.stat-unit {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
  margin-left: 4rpx;
}

.big-stat-label {
  font-size: 24rpx;
  color: var(--color-zen-stone);
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

.streak-num {
  font-size: 52rpx;
  font-weight: 800;
  color: var(--color-zen-graphite);
  line-height: 1;
}

.streak-unit {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
}

.sub-metrics-row {
  display: flex;
  align-items: center;
  background: var(--color-zen-ivory);
  padding: 24rpx 32rpx;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-zen-hairline);
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
  color: var(--color-zen-graphite);
}

.metric-label {
  font-size: 22rpx;
  color: var(--color-zen-stone);
  font-weight: 500;
}

.metric-divider {
  width: 1px;
  height: 48rpx;
  background: var(--color-zen-hairline);
  margin: 0 32rpx;
}

.content-area {
  flex: 1;
  padding: 24rpx;
  box-sizing: border-box;
}

.bottom-spacer {
  height: calc(180rpx + env(safe-area-inset-bottom));
}
</style>
