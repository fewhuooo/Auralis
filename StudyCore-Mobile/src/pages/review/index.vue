<template>
  <AppPageLayout>
    <view class="review-page">
      <!-- Header -->
      <view class="custom-header">
        <view class="header-content">
          <view class="icon-btn menu-btn" @click.stop="openDrawer">
            <LineIcon name="menu" size="44rpx" />
          </view>
          <text class="header-title">知识复习</text>
          <view class="header-right"></view>
        </view>
      </view>

      <!-- Pill Capsules Info Bar -->
      <view class="info-capsules">
        <view class="capsule">
          <LineIcon name="book" size="32rpx" color="var(--text-primary)" />
          <text class="capsule-val">{{ remainingCount }}</text>
          <text class="capsule-label">待复习</text>
        </view>
        <view class="capsule">
          <LineIcon name="check" size="32rpx" color="var(--text-primary)" />
          <text class="capsule-val">{{ completedCount }}</text>
          <text class="capsule-label">已完成</text>
        </view>
        <view class="capsule">
          <LineIcon name="chart" size="32rpx" color="var(--text-primary)" />
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
              <view class="stamp stamp-mastered" :style="{ opacity: stampOpacity.up }">
                掌握
              </view>
              <!-- Retry Stamp (Swipe Down) -->
              <view class="stamp stamp-retry" :style="{ opacity: stampOpacity.down }">
                不熟
              </view>
              <!-- Skip Stamp (Swipe Left) -->
              <view class="stamp stamp-skip" :style="{ opacity: stampOpacity.left }">
                下一张
              </view>
              <!-- Prev Stamp (Swipe Right) -->
              <view class="stamp stamp-prev" :style="{ opacity: stampOpacity.right }">
                上一张
              </view>
            </view>
          </view>

        </view>

        <!-- Empty State / Completed -->
        <view v-else class="finished-state">
          <LineIcon name="star" size="100rpx" color="var(--text-primary)" class="finish-icon" />
          <text class="finish-title">完成全部复习</text>
          <text class="finish-desc">今日的待复习队列已经全部清空，棒极了！</text>
          <button class="reset-btn" @click="resetReview">
            <LineIcon name="sync" size="30rpx" color="var(--color-bg-primary)" style="margin-right: 10rpx;" /> 重新复习
          </button>
        </view>
      </view>

      <!-- Bottom Gesture Instruction Legend -->
      <view class="gesture-legend" v-if="activeCard">
        <view class="legend-row">
          <text class="legend-item">← 左滑 下一张</text>
          <text class="legend-dot">·</text>
          <text class="legend-item">右滑 上一张 →</text>
        </view>
        <view class="legend-row">
          <text class="legend-item">↑ 上滑 掌握</text>
          <text class="legend-dot">·</text>
          <text class="legend-item">下滑 不熟 ↓</text>
        </view>
      </view>

      <view class="bottom-spacer"></view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBlockStore } from '@/store/useBlockStore'
import { useLayoutStore } from '@/store/useLayoutStore'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import FlashCard from '@/components/FlashCard.vue'

const layoutStore = useLayoutStore()
const blockStore = useBlockStore()

const openDrawer = () => layoutStore.openDrawer()

// Session State
const sessionQueue = ref<any[]>([])
const currentIndex = ref(0)
const isFlipped = ref(false)
const completedCount = ref(0)

// History stack to support Swipe Right (Undo / Prev card)
interface HistoryAction {
  blockId: string
  prevMastery: number
  actionType: 'mastered' | 'retry' | 'skip'
  requeued: boolean
}
const historyStack = ref<HistoryAction[]>([])

// Gesture Tracking State
const startX = ref(0)
const startY = ref(0)
const deltaX = ref(0)
const deltaY = ref(0)
const isDragging = ref(false)
const flyDirection = ref<'left' | 'right' | 'up' | 'down' | null>(null)
const animateReset = ref(false)
const animateFly = ref(false)

onMounted(async () => {
  await blockStore.fetchBlocks()
  
  // Seed demo data if none exists
  if (blockStore.recentBlocks.length === 0) {
    const mockBlocks = [
      {
        subject: '计算机网络',
        title: 'TCP 三次握手的过程',
        preview: '1. 客户端发送 SYN 报文，进入 SYN_SENT 状态。\n2. 服务端收到后发送 SYN + ACK 报文，进入 SYN_RCVD 状态。\n3. 客户端收到后发送 ACK 报文，双方进入 ESTABLISHED 状态。',
        color: '#3b82f6',
        mastery: 60
      },
      {
        subject: '操作系统',
        title: '进程和线程的区别',
        preview: '1. 进程是系统资源分配的最小单位，拥有独立地址空间。\n2. 线程是CPU调度的最小单位，是进程内一条执行路径，共享进程资源。\n3. 线程切换开销小于进程。',
        color: '#10b981',
        mastery: 80
      },
      {
        subject: '算法与数据结构',
        title: '快速排序的时间复杂度',
        preview: '平均时间复杂度: O(n log n)\n最好情况: O(n log n) [每次基准划分都均匀]\n最坏情况: O(n²) [数组已排序且每次选第一个/最后一个作为基准]',
        color: '#f59e0b',
        mastery: 40
      },
      {
        subject: '计算机网络',
        title: 'HTTP/2 的核心特性',
        preview: '1. 二进制分帧：应用层与传输层之间增加二进制分帧层。\n2. 多路复用：共享同一连接发送多个并发请求和响应。\n3. 首部压缩：HPACK 算法，维护客户端与服务端的静态/动态表。\n4. 服务器推送：服务端主动向客户端推送资源。',
        color: '#3b82f6',
        mastery: 75
      }
    ]
    for (const b of mockBlocks) {
      await blockStore.addBlock({
        ...b,
        source: '自动添加',
        time: new Date().toISOString()
      })
    }
  }

  resetReview()
})

const resetReview = () => {
  // Initialize queue with copy of store blocks
  sessionQueue.value = [...blockStore.recentBlocks]
  currentIndex.value = 0
  completedCount.value = 0
  isFlipped.value = false
  historyStack.value = []
  resetDrag()
}

// Stats computations
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

// Active top card dynamic style based on drag state
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

// Stamp opacity calculations based on swipe translation
const stampOpacity = computed(() => {
  const threshold = 40 // distance when stamps start to fade in
  const maxDist = 120 // distance when stamps are fully visible
  
  const getOpacity = (val: number) => {
    if (val <= threshold) return 0
    return Math.min((val - threshold) / (maxDist - threshold), 1)
  }

  const absX = Math.abs(deltaX.value)
  const absY = Math.abs(deltaY.value)
  
  const stampValues = { up: 0, down: 0, left: 0, right: 0 }
  
  if (!isDragging.value) return stampValues

  if (absX > absY) {
    // Horizontal dominant
    if (deltaX.value < 0) stampValues.left = getOpacity(absX)
    else stampValues.right = getOpacity(absX)
  } else {
    // Vertical dominant
    if (deltaY.value < 0) stampValues.up = getOpacity(absY)
    else stampValues.down = getOpacity(absY)
  }

  return stampValues
})

// Touch Handlers
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

  const threshold = 60 // px threshold to trigger swipe action
  const absX = Math.abs(deltaX.value)
  const absY = Math.abs(deltaY.value)

  if (absX < threshold && absY < threshold) {
    // Bounce back
    triggerResetAnimation()
    return
  }

  // Determine direction
  if (absX > absY) {
    // Horizontal
    if (deltaX.value < 0) {
      triggerFlyAnimation('left')
    } else {
      // Swipe Right -> undo previous action if exists
      if (historyStack.value.length > 0) {
        triggerFlyAnimation('right')
      } else {
        // No history to undo, bounce back
        triggerResetAnimation()
      }
    }
  } else {
    // Vertical
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
    // Apply state change after card flies away
    handleSwipeAction(dir)
    resetDrag()
  }, 350)
}

const handleSwipeAction = async (dir: 'left' | 'right' | 'up' | 'down') => {
  const card = activeCard.value
  if (!card) return

  if (dir === 'right') {
    // Undo previous action
    const lastAction = historyStack.value.pop()
    if (lastAction) {
      // Restore index
      currentIndex.value = Math.max(0, currentIndex.value - 1)
      
      // If requeued, pop the re-queued item from tail of queue
      if (lastAction.requeued) {
        sessionQueue.value.pop()
      }

      // If it was mastered, decrease completedCount
      if (lastAction.actionType === 'mastered') {
        completedCount.value = Math.max(0, completedCount.value - 1)
      }

      // Restore block mastery
      await blockStore.updateBlock({
        ...sessionQueue.value[currentIndex.value],
        mastery: lastAction.prevMastery
      })
    }
    isFlipped.value = false
    return
  }

  // For other directions, we advance the deck
  let actionType: 'mastered' | 'retry' | 'skip' = 'skip'
  let requeued = false
  const prevMastery = card.mastery || 50

  if (dir === 'up') {
    // Mastered 🟢
    actionType = 'mastered'
    completedCount.value++
    const newMastery = Math.min(prevMastery + 15, 100)
    await blockStore.updateBlock({
      ...card,
      mastery: newMastery,
      difficulty: 'easy'
    })
  } else if (dir === 'down') {
    // Not mastered 🔴 -> Add to end of queue
    actionType = 'retry'
    requeued = true
    const newMastery = Math.max(prevMastery - 15, 10)
    await blockStore.updateBlock({
      ...card,
      mastery: newMastery,
      difficulty: 'hard'
    })
    
    // Append to end of queue
    sessionQueue.value.push({
      ...card,
      mastery: newMastery
    })
  } else if (dir === 'left') {
    // Skip / Next card
    actionType = 'skip'
  }

  // Push to history stack
  historyStack.value.push({
    blockId: card.id,
    prevMastery,
    actionType,
    requeued
  })

  // Advance index
  currentIndex.value++
  isFlipped.value = false
}
</script>

<style scoped>
.review-page {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  overflow: hidden;
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

/* Capsules info bar */
.info-capsules {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 40rpx;
  gap: 20rpx;
  background: var(--color-bg-primary);
}

.capsule {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 14rpx 20rpx;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 50rpx;
}

/* Removed .capsule-icon */

.capsule-val {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.capsule-label {
  font-size: 20rpx;
  color: var(--text-muted);
  font-weight: 500;
}

/* Card Stack Container */
.card-stack-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 30rpx 40rpx 40rpx;
  box-sizing: border-box;
}

.card-stack {
  width: 100%;
  height: 75vh;
  max-height: 950rpx;
  position: relative;
}

.stack-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 32rpx;
}

/* Layering styles */
.card-layer-1 {
  z-index: 10;
  transform-origin: center bottom;
}

.card-layer-2 {
  z-index: 5;
  transform: scale(0.96) translateY(-20rpx);
  opacity: 0.8;
  pointer-events: none;
  transition: transform 0.3s cubic-bezier(0.165, 0.84, 0.44, 1), opacity 0.3s;
}

.card-layer-3 {
  z-index: 2;
  transform: scale(0.92) translateY(-40rpx);
  opacity: 0.5;
  pointer-events: none;
  transition: transform 0.3s cubic-bezier(0.165, 0.84, 0.44, 1), opacity 0.3s;
}

/* Dummy back card visual */
.dummy-card-face {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-radius: 32rpx;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.02);
  padding: 48rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.dummy-subject {
  font-size: 24rpx;
  font-weight: 600;
  padding: 8rpx 20rpx;
  border-radius: 30rpx;
  background: rgba(0, 0, 0, 0.03);
  color: var(--text-muted);
  align-self: flex-start;
}

.dummy-body {
  flex: 1;
}

/* Stamp labels overlays on top active card */
.stamp-container {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  border-radius: 32rpx;
  overflow: hidden;
}

.stamp {
  position: absolute;
  font-size: 40rpx;
  font-weight: 800;
  padding: 12rpx 36rpx;
  border-radius: 12rpx;
  text-transform: uppercase;
  letter-spacing: 2rpx;
  box-sizing: border-box;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06);
}

.stamp-mastered {
  color: #10b981;
  border: 6rpx solid #10b981;
  background: rgba(255, 255, 255, 0.95);
  top: 60rpx;
  left: 60rpx;
  transform: rotate(-15deg);
}

.stamp-retry {
  color: #ef4444;
  border: 6rpx solid #ef4444;
  background: rgba(255, 255, 255, 0.95);
  top: 60rpx;
  right: 60rpx;
  transform: rotate(15deg);
}

.stamp-skip {
  color: #6b7280;
  border: 6rpx solid #6b7280;
  background: rgba(255, 255, 255, 0.95);
  bottom: 80rpx;
  right: 60rpx;
  transform: rotate(-10deg);
}

.stamp-prev {
  color: #3b82f6;
  border: 6rpx solid #3b82f6;
  background: rgba(255, 255, 255, 0.95);
  bottom: 80rpx;
  left: 60rpx;
  transform: rotate(10deg);
}

/* Finished screen */
.finished-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 40rpx;
  text-align: center;
  background: #ffffff;
  border-radius: 32rpx;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.finish-icon {
  margin-bottom: 30rpx;
  animation: float 3s ease-in-out infinite;
}

.finish-title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 16rpx;
}

.finish-desc {
  font-size: 28rpx;
  color: var(--text-muted);
  margin-bottom: 60rpx;
  max-width: 80%;
  line-height: 1.6;
}

.reset-btn {
  width: 320rpx;
  height: 88rpx;
  border-radius: 50rpx;
  font-size: 28rpx;
  font-weight: 700;
  background: var(--text-primary);
  color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: 0 10rpx 30rpx rgba(0,0,0,0.1);
  transition: transform 0.2s;
}

.reset-btn:active {
  transform: scale(0.96);
}

/* Legend guidelines at bottom */
.gesture-legend {
  padding: 10rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.legend-item {
  font-size: 22rpx;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.5rpx;
}

.legend-dot {
  color: rgba(0,0,0,0.15);
  font-weight: 800;
}

.bottom-spacer {
  height: calc(140rpx + var(--window-bottom, 0));
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-15rpx); }
}
</style>
