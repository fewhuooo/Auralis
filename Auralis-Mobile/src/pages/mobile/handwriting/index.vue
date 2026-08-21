<template>
  <view class="page">
    <!-- Header -->
    <view class="hw-header">
      <view class="hw-left" @click="goBack">
        <text class="icon">⟵</text>
        <text class="title">草稿本 - 未命名</text>
      </view>
      <view class="hw-right">
        <text class="status-text">本地草稿</text>
        <view class="action-btn" @click="convertToBlock">
          <text class="action-icon">✦</text>
          <text class="action-text">AI 整理</text>
        </view>
      </view>
    </view>

    <view class="canvas-container">
      <!-- Floating Toolbar -->
      <view class="floating-toolbar">
        <view class="tool-group">
          <view class="tool-btn active"><text>✎</text></view>
          <view class="tool-btn"><text>✐</text></view>
          <view class="tool-btn"><text>⌫</text></view>
          <view class="tool-btn ai-lasso"><text>✁</text></view>
        </view>
        <view class="divider"></view>
        <view class="tool-group colors">
          <view class="color-dot active" style="background: var(--text-primary);"></view>
          <view class="color-dot" style="background: var(--color-purple-500);"></view>
          <view class="color-dot" style="background: var(--color-indigo-600);"></view>
          <view class="color-dot" style="background: var(--color-gray-400);"></view>
        </view>
        <view class="divider"></view>
        <view class="tool-group">
          <view class="tool-btn"><text>↺</text></view>
          <view class="tool-btn"><text>↻</text></view>
        </view>
      </view>

      <canvas canvas-id="handwritingCanvas" class="hw-canvas" @touchstart="touchStart" @touchmove="touchMove" @touchend="touchEnd"></canvas>
      
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { vibrate } from '@/api/device'

const goBack = () => uni.navigateBack()

const hasDrawn = ref(false)

onMounted(() => {
  // Setup actual canvas context here
})

const touchStart = () => { }
const touchMove = () => { 
  hasDrawn.value = true 
}
const touchEnd = () => { }

const convertToBlock = () => {
  if (!hasDrawn.value) {
    uni.showToast({ title: '请先书写内容', icon: 'none' })
    return
  }
  
  vibrate('medium')
  uni.showModal({
    title: '手写识别服务尚未接通',
    content: '当前仅保留本地画布内容，不会伪造 OCR 或知识提取结果。',
    showCancel: false,
  })
}
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  overflow: hidden;
}

/* Header */
.hw-header {
  height: 88rpx;
  background: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
  border-bottom: 2rpx solid var(--border-subtle);
  z-index: 20;
}
.hw-left { display: flex; align-items: center; gap: 16rpx; cursor: pointer; }
.hw-left .icon { font-size: 36rpx; font-weight: bold; color: var(--text-primary); }
.hw-left .title { font-size: 28rpx; font-weight: 600; color: var(--text-primary); }
.hw-right { display: flex; align-items: center; gap: 24rpx; }
.status-text { font-size: 24rpx; color: var(--text-muted); }
.action-btn { display: flex; align-items: center; gap: 8rpx; background: var(--color-indigo-50); padding: 12rpx 24rpx; border-radius: var(--radius-full); cursor: pointer; border: 2rpx solid var(--border-accent); }
.action-btn .action-icon { font-size: 28rpx; color: var(--text-accent); }
.action-btn .action-text { color: var(--text-accent); font-size: 26rpx; font-weight: 600; }

.canvas-container {
  flex: 1;
  position: relative;
  /* Premium paper texture */
  background-color: var(--color-bg-secondary);
  background-image: 
    linear-gradient(var(--border-subtle) 2rpx, transparent 2rpx),
    linear-gradient(90deg, var(--border-subtle) 2rpx, transparent 2rpx);
  background-size: 40rpx 40rpx;
}

/* Floating Toolbar */
.floating-toolbar {
  position: absolute;
  top: 40rpx;
  left: 50%;
  transform: translateX(-50%);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 2rpx solid var(--glass-border);
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  padding: 12rpx 24rpx;
  box-shadow: var(--shadow-md);
  z-index: 10;
}

.divider { width: 2rpx; height: 40rpx; background: var(--border-strong); margin: 0 16rpx; }
.tool-group { display: flex; gap: 8rpx; align-items: center; }
.tool-btn { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; border-radius: 16rpx; font-size: 32rpx; transition: all 0.2s; color: var(--text-secondary); }
.tool-btn.active { background: var(--color-bg-tertiary); color: var(--text-primary); box-shadow: inset 0 2rpx 4rpx rgba(0,0,0,0.05); }
.ai-lasso { background: var(--color-indigo-50); border: 2rpx dashed var(--color-indigo-400); color: var(--text-accent); }

.colors { gap: 16rpx; padding: 0 8rpx; }
.color-dot { width: 36rpx; height: 36rpx; border-radius: 50%; border: 4rpx solid transparent; transition: transform 0.2s; }
.color-dot.active { transform: scale(1.2); border-color: var(--border-accent); box-shadow: var(--shadow-sm); }

.hw-canvas { width: 100%; height: 100%; }
</style>
