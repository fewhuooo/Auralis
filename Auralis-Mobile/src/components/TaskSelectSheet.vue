<template>
  <view v-if="visible" class="popover-wrapper">
    <!-- Transparent backdrop overlay covering the whole viewport to close on outside click -->
    <view class="popover-backdrop" @click.stop="close" @touchmove.stop.prevent></view>

    <!-- Dropdown Popover Card -->
    <transition name="popover-anim" appear>
      <view class="popover-menu" @click.stop>
        <!-- Triangle Arrow pointing up to the button -->
        <view class="popover-arrow"></view>

        <view class="popover-header">
          <text class="pop-title">选择专注任务 ✦</text>
        </view>
        
        <!-- Scrollable Task List -->
        <scroll-view scroll-y :show-scrollbar="false" class="popover-scroll">
          <view v-if="displayTasks.length === 0" class="empty-state">
            <text class="empty-icon">☕</text>
            <text class="empty-text">当前无待办任务</text>
          </view>
          
          <view 
            v-else
            v-for="task in displayTasks" 
            :key="task.id"
            class="task-item"
            @click="selectTask(task)"
          >
            <view class="t-color-bar" :style="{ background: task.color || 'var(--text-primary)' }"></view>
            <view class="t-info">
              <text class="t-name">{{ task.name }}</text>
              <text class="t-subject">{{ task.subject }} · {{ task.duration }} 分钟</text>
            </view>
            <view class="check-icon">✦</view>
          </view>
        </scroll-view>
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

const displayTasks = computed(() => {
  return taskStore.pendingTasks || []
})

const close = () => {
  emit('update:visible', false)
}

const selectTask = (task: Task) => {
  emit('select', task)
  close()
}
</script>

<style scoped>
.popover-wrapper {
  position: absolute;
  top: calc(100% + 18rpx);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  width: 560rpx;
  max-width: 90vw;
}

/* 透明背景层，点击任何外部区域自动收起菜单 */
.popover-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  z-index: 999;
}

/* 下落气泡菜单面板 */
.popover-menu {
  position: relative;
  z-index: 1000;
  width: 100%;
  background: var(--color-bg-elevated, rgba(255, 255, 255, 0.96));
  backdrop-filter: blur(24px);
  border: 1px solid var(--color-zen-hairline, rgba(0, 0, 0, 0.08));
  border-radius: 36rpx;
  box-shadow: 0 24rpx 64rpx rgba(0, 0, 0, 0.14), 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
  padding: 16rpx 0 20rpx;
  overflow: visible;
}

/* 指向上方“点击选择任务”按钮的尖角指示器 */
.popover-arrow {
  position: absolute;
  top: -16rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 16rpx solid transparent;
  border-right: 16rpx solid transparent;
  border-bottom: 16rpx solid var(--color-bg-elevated, #ffffff);
  filter: drop-shadow(0 -4rpx 6rpx rgba(0, 0, 0, 0.05));
}

.popover-anim-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.popover-anim-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.popover-anim-enter-from, .popover-anim-leave-to {
  opacity: 0;
  transform: translateY(-24rpx) scale(0.96);
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 36rpx 16rpx;
}
.pop-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 2rpx;
  opacity: 0.85;
}

.popover-scroll {
  max-height: 480rpx;
  padding: 8rpx 0 12rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 220rpx;
  opacity: 0.6;
}
.empty-icon { font-size: 56rpx; margin-bottom: 16rpx; }
.empty-text { font-size: 26rpx; color: var(--text-muted); }

.task-item {
  display: flex;
  align-items: center;
  padding: 24rpx 36rpx;
  margin: 4rpx 12rpx;
  border-radius: 24rpx;
  transition: background 0.2s;
}
.task-item:active {
  background: rgba(0, 0, 0, 0.06);
}
.t-color-bar {
  width: 8rpx;
  height: 52rpx;
  border-radius: 4rpx;
  margin-right: 20rpx;
}
.t-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.t-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.t-subject {
  font-size: 22rpx;
  color: var(--text-muted);
}
.check-icon {
  font-size: 26rpx;
  color: var(--color-zen-stone, #a8a8a5);
  opacity: 0.6;
}
</style>
