<template>
  <AppPageLayout>
    <view class="stats-page">
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
      <!-- Overview Cards -->
      <view class="overview-grid">
        <view class="o-card">
          <text class="o-icon">🔥</text>
          <text class="o-val">{{ overview.streakDays }}</text>
          <text class="o-label">连续天数</text>
        </view>
        <view class="o-card">
          <text class="o-icon">🧠</text>
          <text class="o-val">{{ overview.totalBlocks }}</text>
          <text class="o-label">知识块</text>
        </view>
        <view class="o-card">
          <text class="o-icon">✅</text>
          <text class="o-val">{{ overview.completedTasks }}</text>
          <text class="o-label">已完成</text>
        </view>
      </view>

      <view class="o-card total-time-card">
        <text class="o-val highlight">{{ overview.totalFocusHours }}h</text>
        <text class="o-label">累计专注时长</text>
      </view>

      <!-- Weekly Focus Chart -->
      <view class="section">
        <text class="section-title">本周专注</text>
        <view class="card">
          <WeeklyChart :data="weeklyData" />
        </view>
      </view>

      <!-- Subject Distribution -->
      <view class="section">
        <text class="section-title">学科分布</text>
        <view class="card">
          <SubjectPieChart :segments="subjectSegments" :total="overview.totalBlocks" />
        </view>
      </view>

      <view class="bottom-spacer"></view>
    </scroll-view>
  </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/store/useTaskStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import LineIcon from '@/components/LineIcon.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const layoutStore = useLayoutStore()
const openDrawer = () => layoutStore.openDrawer()

import WeeklyChart from '@/components/WeeklyChart.vue'
import SubjectPieChart from '@/components/SubjectPieChart.vue'

const goBack = () => {
  uni.navigateBack()
}

// Mock initial data, will be updated by API
const overview = ref({
  streakDays: 0,
  totalBlocks: 0,
  completedTasks: 0,
  totalFocusHours: 0
})

const weeklyData = ref([
  { day: '一', minutes: 0 },
  { day: '二', minutes: 0 },
  { day: '三', minutes: 0 },
  { day: '四', minutes: 0 },
  { day: '五', minutes: 0 },
  { day: '六', minutes: 0 },
  { day: '日', minutes: 0 }
])

const subjectSegments = ref<any[]>([])

const loadData = async () => {
  try {
    // Note: Since backend API might not be fully reachable in mock environment,
    // we provide graceful fallback data here
    
    // const overviewRes = await request('/api/stats/overview')
    // const weeklyRes = await request('/api/stats/weekly')
    
    // Mocked response for demo
    overview.value = {
      streakDays: 12,
      totalBlocks: 145,
      completedTasks: 38,
      totalFocusHours: 24.5
    }
    
    weeklyData.value = [
      { day: '一', minutes: 120 },
      { day: '二', minutes: 90 },
      { day: '三', minutes: 150 },
      { day: '四', minutes: 60 },
      { day: '五', minutes: 200 },
      { day: '六', minutes: 45, isToday: true },
      { day: '日', minutes: 0 }
    ]
    
    subjectSegments.value = [
      { subject: '计算机网络', percentage: 45, color: '#0ea5e9' },
      { subject: '操作系统', percentage: 30, color: '#10b981' },
      { subject: '算法', percentage: 25, color: '#f59e0b' }
    ]
  } catch (e) {
    console.error('Failed to load stats', e)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.stats-page {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
}

.custom-header {
  padding-top: var(--status-bar-height, 44px);
  background: var(--color-bg-primary);
  z-index: 100;
  position: sticky;
  top: 0;
  border-bottom: 2rpx solid var(--border-subtle);
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
.header-title { font-size: 32rpx; font-weight: 600; color: var(--text-primary); }
.header-right { width: 60rpx; }

.content-area {
  flex: 1;
  padding: 20rpx 40rpx;
  box-sizing: border-box;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20rpx;
  margin-bottom: 20rpx;
}
.o-card {
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 30rpx 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.o-icon {
  font-size: 40rpx;
}
.o-val {
  font-size: 36rpx;
  font-weight: 800;
  color: var(--text-primary);
}
.o-val.highlight {
  font-size: 48rpx;
  color: var(--text-accent);
}
.o-label {
  font-size: 22rpx;
  color: var(--text-muted);
}
.total-time-card {
  margin-bottom: 40rpx;
  padding: 40rpx;
}

.section {
  margin-bottom: 40rpx;
}
.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 20rpx;
  display: block;
}
.card {
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 32rpx;
}

.bottom-spacer {
  height: 120rpx; /* Space for tabbar */
}
</style>
