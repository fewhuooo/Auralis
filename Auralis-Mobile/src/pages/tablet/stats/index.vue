<template>
  <TabletLayout>
    <view class="t-stats">
      <view class="page-header">
        <text class="page-title">数据洞察</text>
      </view>

      <scroll-view scroll-y class="content-area">
        <view class="stats-grid">
          
          <!-- Left Column -->
          <view class="grid-column">
            
            <!-- Section: Big Numbers -->
            <view class="stats-card">
              <view class="big-stats-row">
                <view class="big-stat">
                  <view class="big-stat-val">{{ totalFocusHours }}</view>
                  <view class="big-stat-label">本周专注(h)</view>
                </view>
                <view class="big-stat">
                  <view class="big-stat-val">{{ totalBlocks }}</view>
                  <view class="big-stat-label">知识块</view>
                </view>
              </view>
            </view>

            <!-- Section: Streak and Sub-metrics -->
            <view class="stats-card">
              <view class="streak-row">
                <LineIcon name="fire" size="50rpx" color="var(--color-danger)" />
                <text class="streak-num">{{ streakDays }}</text>
                <text class="streak-unit">天连续学习</text>
              </view>
              <view class="sub-metrics-row">
                <view class="metric-item">
                  <text class="metric-val">{{ completedTasks }}</text>
                  <text class="metric-label">完成任务</text>
                </view>
                <view class="metric-divider"></view>
                <view class="metric-item">
                  <text class="metric-val">{{ taskCompletionRate }}%</text>
                  <text class="metric-label">任务完成率</text>
                </view>
              </view>
            </view>

            <!-- Section: Weekly Focus Chart -->
            <view class="stats-card">
              <text class="section-title">本周专注</text>
              <view class="chart-wrapper">
                <WeeklyChart :data="weeklyData" />
              </view>
              <view class="section-footnote">
                <text class="footnote-highlight">{{ weeklyAverage }} 分钟</text>
                <text class="footnote-text"> · 日平均专注时长</text>
              </view>
            </view>

          </view>

          <!-- Right Column -->
          <view class="grid-column">
            
            <!-- Section: Subject Distribution -->
            <view class="stats-card">
              <text class="section-title">学科分布</text>
              <view class="chart-wrapper">
                <SubjectPieChart :segments="subjectSegments" :total="totalBlocks" />
              </view>
            </view>

            <!-- Section: Heatmap -->
            <view class="stats-card">
              <text class="section-title">学习活跃度</text>
              <view class="chart-wrapper">
                <HeatmapChart :dataset="heatmapData" />
              </view>
            </view>

          </view>

        </view>
        <view class="bottom-spacer"></view>
      </scroll-view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBlockStore } from '@/store/useBlockStore'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import WeeklyChart from '@/components/WeeklyChart.vue'
import SubjectPieChart from '@/components/SubjectPieChart.vue'
import HeatmapChart from '@/components/HeatmapChart.vue'
import { statsApi } from '@/api/statsApi'

const blockStore = useBlockStore()
const SUBJECT_CHART_PALETTE = ['#7D9372', '#A3B19B', '#C8A97E', '#8DA9B8', '#B58A9B']

const totalFocusHours = ref(0)
const totalBlocks = ref(0)
const completedTasks = ref(0)
const activeTasks = ref(0)
const streakDays = ref(0)

const taskCompletionRate = computed(() => {
  const total = activeTasks.value + completedTasks.value
  if (total === 0) return 0
  return Math.round((completedTasks.value / total) * 100)
})

const weeklyData = ref<{ day: string; minutes: number; isToday?: boolean }[]>([])

const weeklyAverage = computed(() => {
  if (weeklyData.value.length === 0) return 0
  const sum = weeklyData.value.reduce((acc, curr) => acc + curr.minutes, 0)
  return Math.round(sum / weeklyData.value.length)
})

// Subject distribution based on actual blocks
const subjectSegments = computed(() => {
  const blocks = blockStore.recentBlocks
  if (blocks.length === 0) return []
  
  const counts: Record<string, number> = {}
  blocks.forEach(b => {
    const sName = b.subject || '未分类'
    counts[sName] = (counts[sName] || 0) + 1
  })
  
  const segments = Object.keys(counts).map((subjectName, index) => {
    return {
      subject: subjectName,
      percentage: Math.round((counts[subjectName] / blocks.length) * 100),
      color: SUBJECT_CHART_PALETTE[index % SUBJECT_CHART_PALETTE.length]
    }
  })
  
  return segments.sort((a, b) => b.percentage - a.percentage)
})

// Heatmap contribution data
const heatmapData = ref<{ date: string; count: number }[]>([])

const loadServerStats = async () => {
  const today = new Date()
  const fromDate = new Date(today)
  fromDate.setUTCDate(today.getUTCDate() - 6)
  const from = fromDate.toISOString().slice(0, 10)
  const to = today.toISOString().slice(0, 10)
  const [summary, weekly] = await Promise.all([statsApi.overview(), statsApi.weekly(from, to)])
  const days = weekly.days || []
  const reversed = [...days].reverse()
  const firstInactiveDay = reversed.findIndex(day => !((day.reviewedCount || 0) + (day.studySeconds || 0)))
  streakDays.value = firstInactiveDay < 0 ? days.length : firstInactiveDay
  totalBlocks.value = Number(summary.activeKnowledgeBlocks || 0)
  activeTasks.value = Number(summary.activeTasks || 0)
  completedTasks.value = days.reduce((sum, day) => sum + Number(day.completedTaskCount || 0), 0)
  totalFocusHours.value = Number((days.reduce((sum, day) => sum + Number(day.studySeconds || 0), 0) / 3600).toFixed(1))
  weeklyData.value = days.map(day => ({
    day: new Date(`${day.date}T00:00:00Z`).toLocaleDateString('zh-CN', { weekday: 'short' }).slice(-1),
    minutes: Math.round(Number(day.studySeconds || 0) / 60),
    isToday: day.date === to,
  }))
  heatmapData.value = days.map(day => ({
    date: day.date || '',
    count: Number(day.reviewedCount || 0) + Number(day.completedTaskCount || 0) + Number(day.createdKnowledgeCount || 0),
  }))
}

onMounted(async () => {
  try {
    await Promise.all([
      blockStore.fetchBlocks(),
      loadServerStats(),
    ])
  } catch (error) {
    console.error('[TabletStats] Failed to load server statistics:', error)
    uni.showToast({ title: '统计数据加载失败', icon: 'none' })
  }
})
</script>

<style scoped>
.t-stats {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--color-zen-ivory, #F9F9F7);
}

.page-header {
  padding: 40rpx 48rpx 24rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  z-index: 10;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
}

.page-title {
  font-size: 44rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  letter-spacing: 1rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.content-area {
  flex: 1;
  padding: 48rpx;
  box-sizing: border-box;
  background: var(--color-zen-ivory, #F9F9F7);
}

.stats-grid {
  display: flex;
  gap: 48rpx;
  width: 100%;
  max-width: 1500rpx;
  margin: 0 auto;
}

.grid-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 48rpx;
}

/* Base style for Cards */
.stats-card {
  padding: 48rpx;
  border-radius: 40rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.02);
}

.section-title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  margin-bottom: 36rpx;
  display: block;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.chart-wrapper {
  width: 100%;
}

:deep(.heatmap-title) {
  font-size: 28rpx !important;
  color: var(--color-zen-graphite, #1C1C1A) !important;
  font-weight: 800 !important;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif !important;
}

.section-footnote {
  display: flex;
  align-items: baseline;
  margin-top: 30rpx;
  padding-top: 20rpx;
  border-top: 1px dashed var(--color-zen-hairline, #E6E6E4);
}

.footnote-highlight {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.footnote-text {
  font-size: 26rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

/* Big Numbers Double Column */
.big-stats-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 40rpx;
}

.big-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.big-stat-val {
  font-size: 80rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  line-height: 1.1;
  letter-spacing: -1rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.big-stat-label {
  font-size: 26rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
  margin-top: 12rpx;
}

/* Streak and Sub-metrics */
.streak-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  margin-bottom: 40rpx;
}

.streak-num {
  font-size: 64rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  line-height: 1;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.streak-unit {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--color-zen-stone, #A8A8A5);
}

.sub-metrics-row {
  display: flex;
  align-items: center;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 30rpx 40rpx;
  border-radius: 24rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
}

.metric-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.metric-val {
  font-size: 36rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
}

.metric-label {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

.metric-divider {
  width: 1px;
  height: 60rpx;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 0 40rpx;
}

.bottom-spacer {
  height: 80rpx;
}
</style>
