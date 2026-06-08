<template>
  <TabletLayout>
    <view class="t-workspace">
      <!-- Left Panel: Blocks/Outline -->
      <view class="left-panel">
        <view class="panel-header">
          <text class="title">知识库</text>
        </view>
        <scroll-view scroll-y class="panel-content">
          <view class="block-list">
            <view class="block-item" v-for="i in 10" :key="i">
              <text class="b-title">知识点 {{ i }}</text>
              <text class="b-time">今天 10:00</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- Main Canvas Area -->
      <view class="main-canvas">
        <view class="canvas-toolbar">
          <view class="tool-group">
            <view class="tool-btn active">✏️</view>
            <view class="tool-btn">🖍️</view>
            <view class="tool-btn">🧽</view>
            <view class="tool-btn">⭕</view>
          </view>
          <view class="tool-group">
            <view class="tool-btn" @click="toggleAiWindow">✦ AI助手</view>
            <view class="tool-btn">⋯</view>
          </view>
        </view>
        
        <!-- Placeholder for handwriting engine -->
        <view class="canvas-placeholder" @click="mockDraw">
          <text>手写笔记区域 (Phase 4 实现)</text>
          <text class="sub-text">支持 Apple Pencil 压感、无限画布</text>
        </view>

        <!-- AI Floating Window (Draggable) -->
        <view 
          v-if="showAiWindow"
          class="ai-floating-window"
          :style="{ left: aiPos.x + 'px', top: aiPos.y + 'px' }"
          @touchstart="onAiDragStart"
          @touchmove.prevent="onAiDragMove"
          @touchend="onAiDragEnd"
        >
          <view class="ai-header">
            <text class="ai-title">✦ 智能助手</text>
            <view class="ai-actions">
              <text class="ai-btn">📌</text>
              <text class="ai-btn" @click.stop="toggleAiWindow">✕</text>
            </view>
          </view>
          <view class="ai-body" @touchstart.stop>
            <view class="chat-bubble ai">
              你好！我在你的笔记区待命，框选笔记可以让我帮你整理哦。
            </view>
          </view>
          <view class="ai-footer" @touchstart.stop>
            <input class="ai-input" placeholder="输入问题..." />
          </view>
        </view>
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'

// AI Window Dragging Logic
const showAiWindow = ref(false)
const aiPos = ref({ x: 600, y: 100 })
let dragOffset = { x: 0, y: 0 }
let isDragging = false

const toggleAiWindow = () => {
  showAiWindow.value = !showAiWindow.value
}

const onAiDragStart = (e: any) => {
  isDragging = true
  const touch = e.touches[0]
  dragOffset.x = touch.clientX - aiPos.value.x
  dragOffset.y = touch.clientY - aiPos.value.y
}

const onAiDragMove = (e: any) => {
  if (!isDragging) return
  const touch = e.touches[0]
  aiPos.value.x = touch.clientX - dragOffset.x
  aiPos.value.y = Math.max(0, touch.clientY - dragOffset.y) // Prevent dragging above top
}

const onAiDragEnd = () => {
  isDragging = false
}

const mockDraw = () => {
  uni.showToast({ title: '画布组件尚未挂载', icon: 'none' })
}
</script>

<style scoped>
.t-workspace {
  display: flex;
  width: 100%;
  height: 100%;
}

.left-panel {
  width: 320px;
  background: var(--color-bg-secondary);
  border-right: 2rpx solid var(--border-subtle);
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 32rpx;
  border-bottom: 2rpx solid var(--border-subtle);
}
.title {
  font-size: 30rpx;
  font-weight: 700;
}
.panel-content {
  flex: 1;
  height: 0;
}
.block-list {
  padding: 16rpx;
}
.block-item {
  padding: 24rpx;
  border-bottom: 2rpx solid var(--border-subtle);
}
.b-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.b-time {
  font-size: 24rpx;
  color: var(--text-muted);
}

.main-canvas {
  flex: 1;
  position: relative;
  background: var(--hw-canvas-bg);
  background-image: radial-gradient(var(--border-default) 2rpx, transparent 0);
  background-size: 40rpx 40rpx; /* Dotted grid */
}

.canvas-toolbar {
  position: absolute;
  top: 40rpx;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 32rpx;
  background: var(--hw-tool-bg);
  backdrop-filter: blur(10px);
  padding: 16rpx 32rpx;
  border-radius: 40rpx;
  border: 2rpx solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  z-index: 10;
}
.tool-group {
  display: flex;
  gap: 16rpx;
  align-items: center;
}
.tool-btn {
  padding: 12rpx 20rpx;
  border-radius: 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.tool-btn.active {
  background: var(--color-bg-primary);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
}

.canvas-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.sub-text {
  font-size: 24rpx;
  margin-top: 16rpx;
}

/* AI Floating Window */
.ai-floating-window {
  position: absolute;
  width: 360px;
  height: 500px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
}
html.dark .ai-floating-window {
  background: rgba(30, 30, 30, 0.85);
}

.ai-header {
  padding: 24rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2rpx solid var(--border-subtle);
  cursor: move;
  background: rgba(0,0,0,0.02);
}
.ai-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-accent);
}
.ai-actions {
  display: flex;
  gap: 16rpx;
}
.ai-btn {
  font-size: 28rpx;
  color: var(--text-muted);
  cursor: pointer;
}

.ai-body {
  flex: 1;
  padding: 24rpx;
  overflow-y: auto;
}
.chat-bubble {
  padding: 20rpx 24rpx;
  border-radius: 24rpx;
  font-size: 28rpx;
  line-height: 1.5;
  max-width: 85%;
}
.chat-bubble.ai {
  background: var(--color-bg-primary);
  border: 2rpx solid var(--border-subtle);
  color: var(--text-primary);
}

.ai-footer {
  padding: 24rpx;
  border-top: 2rpx solid var(--border-subtle);
}
.ai-input {
  width: 100%;
  background: var(--color-bg-primary);
  border: 2rpx solid var(--border-default);
  border-radius: 40rpx;
  padding: 16rpx 32rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}
</style>
