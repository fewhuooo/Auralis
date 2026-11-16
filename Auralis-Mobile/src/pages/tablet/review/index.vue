<template>
  <TabletLayout>
    <view class="t-review">
      <view class="review-content">
        <view class="review-column">
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
          </view>

          <!-- Card Stack Main Container -->
          <view v-if="activeCard || (!saving && !saveError)" class="card-stack-container">
            <view v-if="activeCard" class="card-stack">
              
              <!-- Card Stack Background Layer 2 (Next + 1) -->
              <view v-if="sessionQueue[currentIndex + 2]" class="stack-card card-layer-3">
                <view class="dummy-card-face">
                  <view class="dummy-body"></view>
                </view>
              </view>

              <!-- Card Stack Background Layer 1 (Next) -->
              <view v-if="sessionQueue[currentIndex + 1]" class="stack-card card-layer-2">
                <view class="dummy-card-face">
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
                  v-model:flipped="isFlipped"
                />

                <!-- Gesture Indicators (Stamps) -->
                <view class="stamp-container">
                  <!-- Mastered Stamp (Swipe Up) -->
                  <view class="stamp stamp-mastered" :style="{ opacity: stampOpacity.up }">认识</view>
                  <!-- Retry Stamp (Swipe Down) -->
                  <view class="stamp stamp-retry" :style="{ opacity: stampOpacity.down }">不熟</view>
                  <!-- Skip Stamp (Swipe Left) -->
                  <view class="stamp stamp-skip" :style="{ opacity: stampOpacity.left }">下一张</view>
                  <!-- Prev Stamp (Swipe Right) -->
                  <view class="stamp stamp-prev" :style="{ opacity: stampOpacity.right }">取消手势</view>
                </view>
              </view>

            </view>

            <!-- Empty State / Completed -->
            <view v-else class="finished-state">
              <LineIcon name="star" size="120rpx" color="var(--text-primary)" class="finish-icon" />
              <text class="finish-title">{{ loading ? '正在加载复习' : loadError || '本轮复习结束' }}</text>
              <text v-if="!loadError && !loading" class="finish-desc">已处理本轮卡片</text>
              <button v-if="!loading" class="reset-btn" @click="loadReview">
                <LineIcon name="sync" size="34rpx" color="var(--color-bg-primary)" style="margin-right: 12rpx;" /> 刷新复习队列
              </button>
            </view>
          </view>

          <view v-if="saving || saveError" class="gesture-legend">
            <text>{{ saving ? '正在保存复习结果' : saveError }}</text>
            <button v-if="saveError" size="mini" @click="refreshRequired ? loadReview() : retrySave()">
              {{ refreshRequired ? '刷新队列' : '重试' }}
            </button>
          </view>
          <!-- Bottom Gesture Instruction Legend -->
          <view class="gesture-legend" v-if="activeCard && !saving && !saveError">
            <view class="legend-row">
              <text class="legend-item">← 左滑 下一张</text>
              <text class="legend-dot">·</text>
              <text class="legend-item">右滑 取消手势 →</text>
            </view>
            <view class="legend-row">
              <text class="legend-item">↑ 上滑 认识</text>
              <text class="legend-dot">·</text>
              <text class="legend-item">下滑 不熟 ↓</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import FlashCard from '@/components/FlashCard.vue'
import { reviewApi } from '@/api/reviewApi'
import { useDueReview } from '@/composables/useDueReview'

const {
  sessionQueue, currentIndex, completedCount, remainingCount, activeCard, isFlipped,
  loading, saving, loadError, saveError, refreshRequired, loadReview, retrySave, skipCard, rateCard,
} = useDueReview(reviewApi)

const startX = ref(0)
const startY = ref(0)
const deltaX = ref(0)
const deltaY = ref(0)
const isDragging = ref(false)
const flyDirection = ref<'left' | 'right' | 'up' | 'down' | null>(null)
const animateReset = ref(false)
const animateFly = ref(false)

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
  if (animateReset.value || animateFly.value || saving.value) return
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

const triggerFlyAnimation = (dir: 'left' | 'up' | 'down') => {
  const card = activeCard.value
  if (dir !== 'left' && !isFlipped.value) {
    triggerResetAnimation()
    uni.showToast({ title: '请先翻面核对答案', icon: 'none' })
    return
  }
  flyDirection.value = dir
  animateFly.value = true

  setTimeout(() => {
    resetDrag()
    if (!card || activeCard.value !== card) return
    if (dir === 'left') {
      void skipCard()
      return
    }
    void rateCard(dir === 'up' ? 'GOOD' : 'AGAIN')
  }, 350)
}

onMounted(loadReview)
</script>

<style scoped>
/* Layout */
.t-review {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  background: var(--color-zen-ivory, #F9F9F7);
  overflow: hidden;
}

.review-content {
  width: 100%;
  max-width: 1200rpx;
  height: 100%;
  padding: 48rpx 56rpx;
  box-sizing: border-box;
}

.review-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

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
</style>
