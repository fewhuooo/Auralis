<template>
  <view>
    <!-- Overlay -->
    <transition name="fade">
      <view v-if="visible" class="overlay" @click="close" @touchmove.stop.prevent></view>
    </transition>

    <!-- Sheet Panel -->
    <transition name="sheet-anim">
      <view v-if="visible" class="sheet">
        <view class="sheet-header">
        <text class="title">选择专注任务</text>
        <text class="close-btn" @click="close">✕</text>
      </view>
      
      <view class="sheet-content">
        <view v-if="pendingTasks.length === 0" class="empty-state">
          <text class="empty-icon">☕</text>
          <text class="empty-text">当前没有待办任务</text>
        </view>
        
        <view 
          v-else
          v-for="task in pendingTasks" 
          :key="task.id"
          class="task-item"
          @click="selectTask(task)"
        >
          <view class="t-color-bar" :style="{ background: task.color || 'var(--text-primary)' }"></view>
          <view class="t-info">
            <text class="t-name">{{ task.name }}</text>
            <text class="t-subject">{{ task.subject }} · {{ task.duration }} 分钟</text>
          </view>
        </view>
      </view>
      </view>
    </transition>

  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTaskStore, type Task } from '@/store/useTaskStore'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible', 'select'])

const taskStore = useTaskStore()
const pendingTasks = computed(() => taskStore.pendingTasks)

const close = () => {
  emit('update:visible', false)
}

const selectTask = (task: Task) => {
  emit('select', task)
  close()
}
</script>

<style scoped>
.overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: 1000;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.sheet {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 85%;
  max-width: 600rpx;
  background: var(--color-bg-elevated);
  z-index: 1001;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  border-radius: 40rpx;
  box-shadow: 0 20rpx 60rpx rgba(0,0,0,0.15);
}
.sheet-anim-enter-active {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.2);
}
.sheet-anim-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.sheet-anim-enter-from {
  transform: translate(-50%, -50%) scale(0.3);
  opacity: 0;
}
.sheet-anim-leave-to {
  transform: translate(-50%, 80vh);
  opacity: 0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx;
  border-bottom: 2rpx solid var(--border-subtle);
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
}
.close-btn {
  font-size: 36rpx;
  color: var(--text-muted);
  padding: 10rpx;
}

.sheet-content {
  max-height: 55vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 20rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300rpx;
  opacity: 0.6;
}
.empty-icon { font-size: 60rpx; margin-bottom: 20rpx; }
.empty-text { font-size: 26rpx; color: var(--text-muted); }

.task-item {
  display: flex;
  align-items: center;
  padding: 30rpx 40rpx;
  border-bottom: 2rpx solid var(--border-subtle);
  transition: background 0.2s;
}
.task-item:active {
  background: var(--color-bg-secondary);
}
.t-color-bar {
  width: 8rpx;
  height: 60rpx;
  border-radius: 4rpx;
  margin-right: 24rpx;
}
.t-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.t-name {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.t-subject {
  font-size: 24rpx;
  color: var(--text-muted);
}
</style>
