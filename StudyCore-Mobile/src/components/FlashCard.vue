<template>
  <view class="flash-card-container" @click="handleFlip">
    <view class="flash-card" :class="{ 'is-flipped': flipped }">
      <!-- Front side -->
      <view class="card-face card-front">
        <view class="card-header">
          <text class="subject-badge" :style="{ backgroundColor: badgeBg, color: badgeColor }">
            {{ subject || '未分类' }}
          </text>
          <text class="state-indicator">❓ 问题</text>
        </view>
        <view class="card-body">
          <text class="card-text front-text">{{ front }}</text>
        </view>
        <view class="card-footer">
          <text class="hint-text">点击翻看答案</text>
        </view>
      </view>

      <!-- Back side -->
      <view class="card-face card-back">
        <view class="card-header">
          <text class="subject-badge" :style="{ backgroundColor: badgeBg, color: badgeColor }">
            {{ subject || '未分类' }}
          </text>
          <text class="state-indicator success">💡 答案</text>
        </view>
        <scroll-view scroll-y class="card-body scrollable" @click.stop>
          <text class="card-text back-text">{{ back }}</text>
        </scroll-view>
        <view class="card-footer gestures-footer">
          <text class="gesture-hint"><text class="icon">↑</text> 上滑掌握</text>
          <text class="gesture-divider">|</text>
          <text class="gesture-hint"><text class="icon">↓</text> 下滑重温</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  front: string
  back: string
  subject?: string
  color?: string
  flipped: boolean
}>()

const emit = defineEmits<{
  (e: 'update:flipped', val: boolean): void
}>()

const handleFlip = () => {
  emit('update:flipped', !props.flipped)
}

// Generate a soft background color for the subject badge
const badgeBg = computed(() => {
  if (!props.color) return 'rgba(0, 0, 0, 0.05)'
  // If it's a hex color, we can add some transparency or use it
  return props.color + '15' // Approx 8% opacity in hex
})

const badgeColor = computed(() => {
  return props.color || 'var(--text-secondary)'
})
</script>

<style scoped>
.flash-card-container {
  width: 100%;
  height: 100%;
  perspective: 1500px;
  cursor: pointer;
}

.flash-card {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.flash-card.is-flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  backface-visibility: hidden;
  border-radius: 32rpx;
  padding: 48rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  /* Thin borders and high quality smooth shadows for premium feel */
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 10rpx 40rpx rgba(0, 0, 0, 0.04), 0 2rpx 10rpx rgba(0, 0, 0, 0.02);
}

.card-front {
  z-index: 2;
}

.card-back {
  transform: rotateY(180deg);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30rpx;
}

.subject-badge {
  font-size: 24rpx;
  font-weight: 600;
  padding: 8rpx 20rpx;
  border-radius: 30rpx;
}

.state-indicator {
  font-size: 24rpx;
  color: var(--text-muted);
  font-weight: 500;
}

.state-indicator.success {
  color: #10b981;
  font-weight: 600;
}

.card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin: 20rpx 0;
}

.card-body.scrollable {
  display: block;
  text-align: left;
}

.card-text {
  color: var(--text-primary);
  line-height: 1.6;
  word-break: break-all;
}

.front-text {
  font-size: 38rpx;
  font-weight: 700;
  text-align: center;
}

.back-text {
  font-size: 30rpx;
  font-weight: 400;
  white-space: pre-wrap;
}

.card-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-top: 24rpx;
  border-top: 1px solid rgba(0, 0, 0, 0.03);
}

.hint-text {
  font-size: 24rpx;
  color: var(--text-muted);
  letter-spacing: 1rpx;
}

.gestures-footer {
  gap: 20rpx;
}

.gesture-hint {
  font-size: 22rpx;
  color: var(--text-muted);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.gesture-hint .icon {
  font-weight: bold;
  color: var(--text-secondary);
}

.gesture-divider {
  font-size: 20rpx;
  color: rgba(0, 0, 0, 0.1);
}
</style>
