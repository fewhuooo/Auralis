<template>
  <TabletLayout>
    <view class="t-review-stats">
      <view class="main-content-split">
        
        <!-- Left Column: Review (55%) -->
        <view class="left-column">
          <!-- Pill Capsules Info Bar -->
          <view class="info-capsules">
            <view class="capsule">
              <LineIcon name="book" size="36rpx" color="var(--text-primary)" />
              <text class="capsule-val">{{ remainingCount }}</text>
              <text class="capsule-label">待复习</text>
            </view>
            <view class="capsule">
              <LineIcon name="check" size="36rpx" color="var(--text-primary)" />
              <text class="capsule-val">{{ completedCount }}</text>
              <text class="capsule-label">已完成</text>
            </view>
            <view class="capsule">
              <LineIcon name="chart" size="36rpx" color="var(--text-primary)" />
              <text class="capsule-val">{{ masteryRate }}%</text>
              <text class="capsule-label">掌握度</text>
            </view>
          </view>

          <!-- Card Stack Main Container -->
          <view class="card-stack-container">
            <view v-if="activeCard" class="card-stack">
              
              <!-- Card Stack Background Layer 2 (Next + 1) -->
              <view v-if="sessionQueue[currentIndex + 2]" class="stack-card card-layer-3">
                <view class="dummy-card-face">
                  <text class="dummy-subject">{{ sessionQueue[currentIndex + 2].subject }}</text>
                  <view class="dummy-body"></view>
                </view>
              </view>

              <!-- Card Stack Background Layer 1 (Next) -->
              <view v-if="sessionQueue[currentIndex + 1]" class="stack-card card-layer-2">
                <view class="dummy-card-face">
                  <text class="dummy-subject">{{ sessionQueue[currentIndex + 1].subject }}</text>
                  <view class="dummy-body"></view>
                </view>
              </view>

              <!-- Top Active Card (Receives gestures) -->
              <view 
                class="stack-card card-layer-1" 
                :style="activeCardStyle"
                @touchstart="onTouchStart"
                @touchmove="onTouchMove"
                @touchend="onTouchEnd"
              >
                <FlashCard
                  :front="activeCard.title"
                  :back="activeCard.preview"
                  :subject="activeCard.subject"
                  :color="activeCard.color"
                  v-model:flipped="isFlipped"
                />

                <!-- Gesture Indicators (Stamps) -->
                <view class="stamp-container">
                  <!-- Mastered Stamp (Swipe Up) -->
                  <view class="stamp stamp-mastered" :style="{ opacity: stampOpacity.up }">掌握</view>
                  <!-- Retry Stamp (Swipe Down) -->
                  <view class="stamp stamp-retry" :style="{ opacity: stampOpacity.down }">不熟</view>
                  <!-- Skip Stamp (Swipe Left) -->
                  <view class="stamp stamp-skip" :style="{ opacity: stampOpacity.left }">下一张</view>
                  <!-- Prev Stamp (Swipe Right) -->
                  <view class="stamp stamp-prev" :style="{ opacity: stampOpacity.right }">上一张</view>
                </view>
              </view>

            </view>

            <!-- Empty State / Completed -->
            <view v-else class="finished-state">
              <LineIcon name="star" size="120rpx" color="var(--text-primary)" class="finish-icon" />
              <text class="finish-title">完成全部复习</text>
              <text class="finish-desc">今日的待复习队列已经全部清空，棒极了！</text>
              <button class="reset-btn" @click="resetReview">
                <LineIcon name="sync" size="34rpx" color="var(--color-bg-primary)" style="margin-right: 12rpx;" /> 重新复习
              </button>
            </view>
          </view>

          <!-- Bottom Gesture Instruction Legend -->
          <view class="gesture-legend" v-if="activeCard">
            <view class="legend-row">
              <text class="legend-item">← 左滑 下一张</text>
              <text class="legend-dot">·</text>
              <text class="legend-item">右滑 取消手势 →</text>
            </view>
            <view class="legend-row">
              <text class="legend-item">↑ 上滑 掌握</text>
              <text class="legend-dot">·</text>
              <text class="legend-item">下滑 不熟 ↓</text>
            </view>
          </view>
        </view>

        <!-- Right Column: Stats (45%) -->
        <view class="right-column">
          <view class="stats-cards-grid">
            
            <!-- Row 1: Big Numbers & Streak -->
            <view class="stats-card card-bignums">
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

            <view class="stats-card card-streak">
              <view class="streak-row">
                <view class="icon-align">
                  <LineIcon name="fire" size="40rpx" color="var(--color-danger)" />
                </view>
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

            <!-- Row 2: Weekly Focus Chart -->
            <view class="stats-card card-weekly">
              <view class="card-header-compact">
                <text class="section-title compact">本周专注</text>
                <text class="footnote-compact">日均 {{ weeklyAverage }} 分钟</text>
              </view>
              <view class="chart-wrapper flex-chart">
                <WeeklyChart :data="weeklyData" />
              </view>
            </view>

            <!-- Row 3: Subject Distribution & Heatmap -->
            <view class="stats-card card-subject">
              <text class="section-title compact">学科分布</text>
              <view class="chart-wrapper flex-chart">
                <SubjectPieChart :segments="subjectSegments" :total="totalBlocks" />
              </view>
            </view>

            <view class="stats-card card-heatmap">
              <!-- HeatmapChart has its own internal title, we can just render it directly -->
              <view class="chart-wrapper flex-chart">
                <HeatmapChart :dataset="heatmapData" />
              </view>
            </view>

          </view>
        </view>

      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBlockStore } from '@/store/useBlockStore'
import { useTaskStore } from '@/store/useTaskStore'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import FlashCard from '@/components/FlashCard.vue'
import WeeklyChart from '@/components/WeeklyChart.vue'
import SubjectPieChart from '@/components/SubjectPieChart.vue'
import HeatmapChart from '@/components/HeatmapChart.vue'
import { reviewApi } from '@/api/reviewApi'
import { statsApi } from '@/api/statsApi'
import { uuidv7 } from '@/utils/uuid'

const blockStore = useBlockStore()
const taskStore = useTaskStore()
const SUBJECT_CHART_PALETTE = ['#7D9372', '#A3B19B', '#C8A97E', '#8DA9B8', '#B58A9B']

// --- REVIEW LOGIC ---
const sessionQueue = ref<any[]>([])
const currentIndex = ref(0)
const isFlipped = ref(false)
const completedCount = ref(0)
const dueQueue = ref<any[]>([])
const reviewVersions = new Map<string, number>()
let cardStartedAt = Date.now()

const startX = ref(0)
const startY = ref(0)
const deltaX = ref(0)
const deltaY = ref(0)
const isDragging = ref(false)
const flyDirection = ref<'left' | 'right' | 'up' | 'down' | null>(null)
const animateReset = ref(false)
const animateFly = ref(false)

const resetReview = () => {
  sessionQueue.value = [...dueQueue.value]
  currentIndex.value = 0
  completedCount.value = 0
  isFlipped.value = false
  cardStartedAt = Date.now()
  resetDrag()
}

const remainingCount = computed(() => {
  if (currentIndex.value >= sessionQueue.value.length) return 0
  return sessionQueue.value.length - currentIndex.value
})

const masteryRate = computed(() => {
  const blocks = blockStore.recentBlocks
  if (blocks.length === 0) return 0
  const total = blocks.reduce((acc, curr) => acc + (curr.mastery || 0), 0)
  return Math.round(total / blocks.length)
})

const activeCard = computed(() => {
  if (currentIndex.value < 0 || currentIndex.value >= sessionQueue.value.length) {
    return null
  }
  return sessionQueue.value[currentIndex.value]
})

const activeCardStyle = computed(() => {
  if (animateReset.value) {
    return {
      transform: 'translate3d(0, 0, 0) rotate(0deg)',
      transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.2) opacity 0.4s'
    }
  }
  
  if (animateFly.value) {
    let dest = 'translate3d(0, 0, 0)'
    if (flyDirection.value === 'left') dest = 'translate3d(-150vw, 0, 0) rotate(-45deg)'
    else if (flyDirection.value === 'right') dest = 'translate3d(150vw, 0, 0) rotate(45deg)'
    else if (flyDirection.value === 'up') dest = 'translate3d(0, -150vh, 0)'
    else if (flyDirection.value === 'down') dest = 'translate3d(0, 150vh, 0)'
    
    return {
      transform: dest,
      opacity: '0',
      transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s'
    }
  }

  if (isDragging.value) {
    const rot = deltaX.value * 0.05
    return {
      transform: `translate3d(${deltaX.value}px, ${deltaY.value}px, 0) rotate(${rot}deg)`,
      transition: 'none'
    }
  }

  return {
    transform: 'translate3d(0, 0, 0) rotate(0deg)',
    transition: 'none'
  }
})

const stampOpacity = computed(() => {
  const threshold = 60
  const maxDist = 180
  
  const getOpacity = (val: number) => {
    if (val <= threshold) return 0
    return Math.min((val - threshold) / (maxDist - threshold), 1)
  }

  const absX = Math.abs(deltaX.value)
  const absY = Math.abs(deltaY.value)
  
  const stampValues = { up: 0, down: 0, left: 0, right: 0 }
  
  if (!isDragging.value) return stampValues

  if (absX > absY) {
    if (deltaX.value < 0) stampValues.left = getOpacity(absX)
    else stampValues.right = getOpacity(absX)
  } else {
    if (deltaY.value < 0) stampValues.up = getOpacity(absY)
    else stampValues.down = getOpacity(absY)
  }

  return stampValues
})

const onTouchStart = (e: TouchEvent) => {
  if (animateReset.value || animateFly.value) return
  const touch = e.touches[0]
  startX.value = touch.clientX
  startY.value = touch.clientY
  deltaX.value = 0
  deltaY.value = 0
  isDragging.value = true
}

const onTouchMove = (e: TouchEvent) => {
  if (!isDragging.value) return
  const touch = e.touches[0]
  deltaX.value = touch.clientX - startX.value
  deltaY.value = touch.clientY - startY.value
}

const onTouchEnd = () => {
  if (!isDragging.value) return
  isDragging.value = false

  const threshold = 100
  const absX = Math.abs(deltaX.value)
  const absY = Math.abs(deltaY.value)

  if (absX < threshold && absY < threshold) {
    triggerResetAnimation()
    return
  }

  if (absX > absY) {
    if (deltaX.value < 0) {
      triggerFlyAnimation('left')
    } else {
      triggerResetAnimation()
    }
  } else {
    if (deltaY.value < 0) {
      triggerFlyAnimation('up')
    } else {
      triggerFlyAnimation('down')
    }
  }
}

const resetDrag = () => {
  deltaX.value = 0
  deltaY.value = 0
  isDragging.value = false
  animateReset.value = false
  animateFly.value = false
  flyDirection.value = null
}

const triggerResetAnimation = () => {
  animateReset.value = true
  setTimeout(() => {
    resetDrag()
  }, 400)
}

const triggerFlyAnimation = (dir: 'left' | 'right' | 'up' | 'down') => {
  flyDirection.value = dir
  animateFly.value = true
  
  setTimeout(() => {
    handleSwipeAction(dir)
    resetDrag()
  }, 350)
}

const handleSwipeAction = async (dir: 'left' | 'right' | 'up' | 'down') => {
  const card = activeCard.value
  if (!card) return

  if (dir === 'right') return

  const rating = dir === 'up' ? 'GOOD' : dir === 'down' ? 'AGAIN' : 'SKIP'
  try {
    const result = await reviewApi.record({
      clientEventId: uuidv7(),
      knowledgeBlockId: card.id,
      rating,
      reviewedAt: new Date().toISOString(),
      durationSeconds: Math.max(0, Math.round((Date.now() - cardStartedAt) / 1000)),
      baseVersion: reviewVersions.get(card.id),
    })
    if (result.state?.version !== undefined) reviewVersions.set(card.id, result.state.version)
  } catch (error) {
    console.error('[TabletReview] Failed to persist event:', error)
    uni.showToast({ title: '复习结果保存失败', icon: 'none' })
    return
  }

  if (dir === 'up') {
    completedCount.value++
  } else if (dir === 'down') {
    sessionQueue.value.push(card)
  }

  currentIndex.value++
  cardStartedAt = Date.now()
  isFlipped.value = false
}

// --- STATS LOGIC ---
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

const loadReviewQueue = async () => {
  const states = await reviewApi.due()
  const blocks = new Map(blockStore.recentBlocks.map(block => [block.id, block]))
  dueQueue.value = states.flatMap((state) => {
    if (!state.knowledgeBlockId) return []
    reviewVersions.set(state.knowledgeBlockId, Number(state.version || 0))
    const block = blocks.get(state.knowledgeBlockId)
    return block ? [{ ...block, mastery: Math.round(Math.min(100, Number(state.stability || 0) * 10)) }] : []
  })
}

const loadPage = async () => {
  try {
    await Promise.all([
      blockStore.fetchBlocks(),
      taskStore.fetchTasks(),
    ])
    await Promise.all([loadReviewQueue(), loadServerStats()])
    resetReview()
  } catch (error) {
    console.error('[TabletReview] Failed to load server data:', error)
    uni.showToast({ title: '复习数据加载失败', icon: 'none' })
  }
}

// --- INITIALIZATION ---
onMounted(loadPage)
</script>

<style scoped>
/* Layout */
.t-review-stats {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  background: var(--color-zen-ivory, #F9F9F7);
  overflow: hidden;
}

.main-content-split {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  padding: 48rpx 56rpx;
  gap: 56rpx;
  box-sizing: border-box;
}

.left-column {
  flex: 5.5;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.right-column {
  flex: 4.5;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 40rpx;
  overflow: hidden;
  box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.02);
}

/* ================== LEFT COLUMN (REVIEW) ================== */

/* Capsules info bar */
.info-capsules {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  padding: 10rpx 0 24rpx 0;
  gap: 24rpx;
}

.capsule {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 24rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
}

.capsule-val {
  font-size: 34rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.capsule-label {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

/* Card Stack Container */
.card-stack-container {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 20rpx 0;
  box-sizing: border-box;
}

.card-stack {
  width: 100%;
  height: 100%;
  max-height: 1000rpx;
  position: relative;
}

.stack-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 36rpx;
}

/* Layering styles */
.card-layer-1 {
  z-index: 10;
  transform-origin: center bottom;
}

.card-layer-2 {
  z-index: 5;
  transform: scale(0.96) translateY(-24rpx);
  opacity: 0.8;
  pointer-events: none;
  transition: transform 0.3s cubic-bezier(0.165, 0.84, 0.44, 1), opacity 0.3s;
}

.card-layer-3 {
  z-index: 2;
  transform: scale(0.92) translateY(-48rpx);
  opacity: 0.5;
  pointer-events: none;
  transition: transform 0.3s cubic-bezier(0.165, 0.84, 0.44, 1), opacity 0.3s;
}

/* Dummy back card visual */
.dummy-card-face {
  width: 100%;
  height: 100%;
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  padding: 48rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.dummy-subject {
  font-size: 26rpx;
  font-weight: 600;
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  color: var(--color-zen-stone, #A8A8A5);
  align-self: flex-start;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
}

.dummy-body {
  flex: 1;
}

/* Stamp labels overlays */
.stamp-container {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  border-radius: 36rpx;
  overflow: hidden;
}

.stamp {
  position: absolute;
  font-size: 48rpx;
  font-weight: 800;
  padding: 16rpx 40rpx;
  border-radius: 20rpx;
  text-transform: uppercase;
  letter-spacing: 2rpx;
  box-sizing: border-box;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.06);
}

.stamp-mastered {
  color: #4b8054;
  border: 6rpx solid #4b8054;
  background: var(--color-zen-white, #FFFFFF);
  top: 80rpx;
  left: 80rpx;
  transform: rotate(-15deg);
}

.stamp-retry {
  color: #b05555;
  border: 6rpx solid #b05555;
  background: var(--color-zen-white, #FFFFFF);
  top: 80rpx;
  right: 80rpx;
  transform: rotate(15deg);
}

.stamp-skip {
  color: var(--color-zen-stone, #A8A8A5);
  border: 6rpx solid var(--color-zen-stone, #A8A8A5);
  background: var(--color-zen-white, #FFFFFF);
  bottom: 100rpx;
  right: 80rpx;
  transform: rotate(-10deg);
}

.stamp-prev {
  color: #5580b0;
  border: 6rpx solid #5580b0;
  background: var(--color-zen-white, #FFFFFF);
  bottom: 100rpx;
  left: 80rpx;
  transform: rotate(10deg);
}

/* Finished screen */
.finished-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100rpx 60rpx;
  text-align: center;
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 40rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.02);
}

.finish-icon {
  margin-bottom: 40rpx;
  animation: float 3s ease-in-out infinite;
}

.finish-title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  margin-bottom: 20rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.finish-desc {
  font-size: 32rpx;
  color: var(--color-zen-stone, #A8A8A5);
  margin-bottom: 80rpx;
  line-height: 1.6;
}

.reset-btn {
  width: 400rpx;
  height: 100rpx;
  border-radius: 999rpx;
  font-size: 32rpx;
  font-weight: 700;
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
  cursor: pointer;
}

.reset-btn:active {
  transform: scale(0.96);
}

/* Legend guidelines */
.gesture-legend {
  flex-shrink: 0;
  padding: 16rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.legend-item {
  font-size: 26rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

.legend-dot {
  color: var(--color-zen-hairline, #E6E6E4);
  font-weight: 800;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20rpx); }
}


/* ================== RIGHT COLUMN (STATS) ================== */

.stats-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr 1fr;
  gap: 20rpx;
  width: 100%;
  height: 100%;
  padding: 36rpx;
  box-sizing: border-box;
}

/* Cards */
.stats-card {
  padding: 28rpx;
  border-radius: 32rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.card-bignums { grid-column: 1 / 2; justify-content: center; }
.card-streak { grid-column: 2 / 3; justify-content: center; }
.card-weekly { grid-column: 1 / 3; }
.card-subject { grid-column: 1 / 2; }
.card-heatmap { grid-column: 2 / 3; }

.section-title.compact {
  font-size: 26rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  margin-bottom: 12rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.card-header-compact {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12rpx;
}

.footnote-compact {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

.chart-wrapper.flex-chart {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Deep overrides to make charts fill available flex space */
:deep(.heatmap-chart) { height: 100% !important; padding: 0 !important; display: flex; flex-direction: column; min-height: 0; }
:deep(.heatmap-header) { margin-bottom: 12rpx !important; }
:deep(.heatmap-title) { font-size: 24rpx !important; color: var(--color-zen-graphite, #1C1C1A) !important; font-weight: 800 !important; }

/* Icon fine-tuning */
.icon-align {
  display: flex;
  transform: translateY(-2rpx);
}

/* Big Numbers Double Column */
.big-stats-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 16rpx;
}

.big-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.big-stat-val {
  font-size: 56rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  line-height: 1.1;
  letter-spacing: -1rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.big-stat-label {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
  margin-top: 8rpx;
}

/* Streak and Sub-metrics */
.streak-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 24rpx;
}

.streak-num {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  line-height: 1;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.streak-unit {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-stone, #A8A8A5);
}

.sub-metrics-row {
  display: flex;
  align-items: center;
  background: var(--color-zen-white, #FFFFFF);
  padding: 16rpx 24rpx;
  border-radius: 20rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
}

.metric-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}

.metric-val {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
}

.metric-label {
  font-size: 20rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

.metric-divider {
  width: 1px;
  height: 40rpx;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 0 24rpx;
}
</style>
