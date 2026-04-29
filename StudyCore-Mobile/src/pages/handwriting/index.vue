<template>
  <view class="page">
    <!-- Header -->
    <view class="hw-header">
      <view class="hw-left" @click="goBack">
        <text class="icon">⟵</text>
        <text class="title">草稿本 - 未命名</text>
      </view>
      <view class="hw-right">
        <text class="status-text">已保存</text>
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
      
      <!-- Mock handwriting overlay -->
      <view class="mock-hw-layer" v-if="hasDrawn">
        <svg viewBox="0 0 800 600" width="100%" height="100%">
          <path d="M 100 150 Q 150 120 200 150 T 300 150 T 400 150" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="svg-stroke-primary"/>
          <text x="200" y="130" font-family="cursive" font-size="28" fill="currentColor" class="svg-fill-primary">System = ?</text>
          
          <path d="M 140 250 Q 180 270 220 220" fill="none" stroke="currentColor" stroke-width="2.5" class="svg-stroke-accent"/>
          <text x="230" y="230" font-family="cursive" font-size="24" fill="currentColor" class="svg-fill-accent">Process Management</text>

          <!-- Mock AI Lasso selection -->
          <path v-if="showLasso" d="M 80 100 C 250 80, 450 100, 420 280 C 400 350, 100 300, 80 250 Z" fill="rgba(181,172,159,0.1)" stroke="currentColor" stroke-width="2" stroke-dasharray="6,6" class="svg-stroke-accent" />
        </svg>

        <view v-if="showLasso" class="lasso-menu" style="left: 450px; top: 120px;">
          <view class="l-btn" @click="convertToBlock"><text>✦ 提取为知识</text></view>
          <view class="l-btn"><text>▤ 转换为文本</text></view>
        </view>
      </view>
      
      <!-- Converting Overlay -->
      <view class="converting-overlay" v-if="isConverting">
        <view class="ai-orb">
          <view class="orb-core"></view>
          <view class="orb-ring r1"></view>
          <view class="orb-ring r2"></view>
        </view>
        <text class="converting-title">OpenClaw Vision</text>
        <text class="converting-text">正在解析笔迹与拓扑结构...</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { vibrate } from '@/api/device'

const goBack = () => uni.navigateBack()

const hasDrawn = ref(false)
const showLasso = ref(false)
const isConverting = ref(false)

onMounted(() => {
  // Setup actual canvas context here
})

const touchStart = () => { }
const touchMove = () => { 
  hasDrawn.value = true 
}
const touchEnd = () => {
  // Mock: After drawing for a bit, user uses lasso
  setTimeout(() => {
    if (!showLasso.value && hasDrawn.value) {
      showLasso.value = true
      vibrate('light')
    }
  }, 1500)
}

const convertToBlock = () => {
  if (!hasDrawn.value) {
    uni.showToast({ title: '请先书写内容', icon: 'none' })
    return
  }
  
  vibrate('medium')
  isConverting.value = true
  showLasso.value = false
  
  setTimeout(() => {
    isConverting.value = false
    vibrate('light')
    uni.showModal({
      title: '✦ 提取成功',
      content: '识别内容：\nSystem = Process Management\n\n已为您建立结构化关系，是否存入知识库？',
      confirmText: '存入知识库',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          uni.showToast({ title: '已存入', icon: 'success' })
        }
      }
    })
  }, 2500)
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
.mock-hw-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }

.svg-stroke-primary { stroke: var(--text-primary); }
.svg-fill-primary { fill: var(--text-primary); }
.svg-stroke-accent { stroke: var(--text-accent); }
.svg-fill-accent { fill: var(--text-accent); }

.lasso-menu {
  position: absolute;
  background: var(--color-bg-elevated);
  border-radius: 16rpx;
  padding: 8rpx;
  box-shadow: var(--shadow-lg);
  border: 2rpx solid var(--border-subtle);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes popIn { 0% { opacity: 0; transform: scale(0.9) translateY(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }

.l-btn { padding: 16rpx 24rpx; font-size: 26rpx; font-weight: 500; color: var(--text-primary); border-radius: 8rpx; cursor: pointer; white-space: nowrap; }
.l-btn:active { background: var(--color-bg-secondary); }

/* Converting Overlay */
.converting-overlay {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.ai-orb { position: relative; width: 120rpx; height: 120rpx; display: flex; align-items: center; justify-content: center; margin-bottom: 40rpx; }
.orb-core { width: 40rpx; height: 40rpx; background: var(--accent-gradient); border-radius: 50%; box-shadow: var(--accent-glow); z-index: 2; animation: pulse 2s infinite; }
.orb-ring { position: absolute; border-radius: 50%; border: 4rpx solid transparent; border-top-color: var(--color-indigo-500); border-bottom-color: var(--color-purple-500); animation: spin linear infinite; }
.r1 { width: 80rpx; height: 80rpx; animation-duration: 2s; }
.r2 { width: 120rpx; height: 120rpx; border-left-color: var(--color-gray-400); animation-duration: 3s; animation-direction: reverse; opacity: 0.6; }

.converting-title { font-size: 32rpx; font-weight: 700; color: var(--text-primary); margin-bottom: 8rpx; background: var(--accent-gradient); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.converting-text { font-size: 26rpx; color: var(--text-muted); }

@keyframes spin { 100% { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.8; } }
</style>
