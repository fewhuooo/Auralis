<template>
  <view>
    <!-- Drawer Panel (Background Layer) -->
    <view class="drawer" :class="{ 'is-open': visible }">
      <!-- Header: Project Name & User Capsule -->
      <view class="drawer-header">
        <text class="project-name">StudyCore</text>
        <view class="user-capsule" @click="navigate('/pages/profile/index')">
          <view class="capsule-avatar">
            <LineIcon name="avatar" size="28rpx" color="var(--color-bg-primary)" />
          </view>
          <text class="capsule-name">{{ username }}</text>
        </view>
      </view>

      <!-- Navigation Links -->
      <scroll-view scroll-y class="drawer-content">
        <view class="nav-group">
          <text class="group-title">核心功能</text>
          <view class="nav-item" @click="navigate('/pages/home/index')">
            <LineIcon name="home" size="36rpx" class="nav-icon" />
            <text class="nav-label">返回首页</text>
          </view>
          <view class="nav-item" @click="navigate('/pages/ai-search/index')">
            <LineIcon name="ai" size="36rpx" class="nav-icon" />
            <text class="nav-label">AI 助手</text>
          </view>
          <view class="nav-item" @click="navigate('/pages/timeline/index')">
            <LineIcon name="book" size="36rpx" class="nav-icon" />
            <text class="nav-label">知识复习</text>
          </view>
          <view class="nav-item" @click="navigate('/pages/pomodoro/index')">
            <LineIcon name="clock" size="36rpx" class="nav-icon" />
            <text class="nav-label">专注计时</text>
          </view>
          <view class="nav-item" @click="navigate('/pages/stats/index')">
            <LineIcon name="chart" size="36rpx" class="nav-icon" />
            <text class="nav-label">数据统计</text>
          </view>
        </view>

        <view class="nav-group">
          <text class="group-title">系统</text>
          <view class="nav-item" @click="navigate('/pages/settings/index')">
            <LineIcon name="settings" size="36rpx" class="nav-icon" />
            <text class="nav-label">系统设置</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/store/useAuthStore'
import LineIcon from '@/components/LineIcon.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible'])

const authStore = useAuthStore()
const username = computed(() => authStore.username || '同学')

const navigate = (url: string) => {
  // Do NOT emit update:visible to false immediately. 
  // We want the old page to remain shifted while the new page slides in!
  
  // Use uni.reLaunch for flat navigation to prevent page stack overflow
  uni.reLaunch({ url })
}
</script>

<style scoped>
.drawer {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%;
  max-width: none;
  background: var(--color-bg-primary);
  z-index: 10;
  display: flex;
  flex-direction: column;
  transform: scale(0.95) translateX(-10%);
  opacity: 0;
  pointer-events: none;
  transition: all 0.4s cubic-bezier(0.3, 1.15, 0.6, 1);
}
.drawer.is-open {
  transform: scale(1) translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.drawer-header {
  padding: 100rpx 40rpx 40rpx;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.project-name {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -1rpx;
}
.user-capsule {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: var(--text-primary);
  padding: 8rpx 24rpx 8rpx 8rpx;
  border-radius: 40rpx;
  cursor: pointer;
  transition: transform 0.2s;
}
.user-capsule:active {
  transform: scale(0.95);
}
.capsule-avatar {
  width: 48rpx; height: 48rpx;
  border-radius: 50%;
  background: var(--color-bg-primary);
  display: flex; align-items: center; justify-content: center;
}
.capsule-name {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--color-bg-primary);
}

.drawer-content {
  flex: 1;
  padding: 40rpx 0;
}

.nav-group {
  margin-bottom: 40rpx;
}
.group-title {
  padding: 0 40rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 12rpx;
  display: block;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 40rpx;
  cursor: pointer;
  transition: background 0.2s;
}
.nav-item:active {
  background: var(--color-bg-secondary);
}
.nav-icon {
  font-size: 36rpx;
}
.nav-label {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
