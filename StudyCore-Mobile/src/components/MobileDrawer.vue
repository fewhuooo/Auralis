<template>
  <view>
    <!-- Drawer Panel (Background Layer) -->
    <view class="drawer" :class="{ 'is-open': visible }">
      <!-- Header: Project Name & User Profile -->
      <view class="drawer-header">
        <text class="project-name">StudyCore</text>
        <view class="user-profile" @click="navigate('/pages/profile/index')">
          <view class="avatar-circle">
            <LineIcon name="avatar" size="32rpx" color="#8E8E93" />
          </view>
          <text class="user-name">{{ username }}</text>
        </view>
      </view>

      <!-- Navigation Links -->
      <scroll-view scroll-y class="drawer-content">
        <view class="nav-group">
          <text class="group-title">核心功能</text>
          <view class="nav-item" :class="{ active: currentPath === '/pages/home/index' }" @click="navigate('/pages/home/index')">
            <LineIcon name="home" size="36rpx" class="nav-icon" />
            <text class="nav-label">首页</text>
          </view>
          <view class="nav-item" :class="{ active: currentPath === '/pages/ai-search/index' }" @click="navigate('/pages/ai-search/index')">
            <LineIcon name="ai" size="36rpx" class="nav-icon" />
            <text class="nav-label">AI 助手</text>
          </view>
          <view class="nav-item" :class="{ active: currentPath === '/pages/review/index' }" @click="navigate('/pages/review/index')">
            <LineIcon name="book" size="36rpx" class="nav-icon" />
            <text class="nav-label">知识复习</text>
          </view>
          <view class="nav-item" :class="{ active: currentPath === '/pages/pomodoro/index' }" @click="navigate('/pages/pomodoro/index')">
            <LineIcon name="clock" size="36rpx" class="nav-icon" />
            <text class="nav-label">专注计时</text>
          </view>
          <view class="nav-item" :class="{ active: currentPath === '/pages/stats/index' }" @click="navigate('/pages/stats/index')">
            <LineIcon name="chart" size="36rpx" class="nav-icon" />
            <text class="nav-label">数据统计</text>
          </view>
        </view>

        <view class="nav-group">
          <text class="group-title">系统</text>
          <view class="nav-item" :class="{ active: currentPath === '/pages/settings/index' }" @click="navigate('/pages/settings/index')">
            <LineIcon name="settings" size="36rpx" class="nav-icon" />
            <text class="nav-label">系统设置</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/store/useAuthStore'
import LineIcon from '@/components/LineIcon.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible'])

const authStore = useAuthStore()
const username = computed(() => authStore.username || '同学')

const currentPath = ref('')

watch(() => props.visible, (val) => {
  if (val) {
    const pages = getCurrentPages()
    if (pages.length > 0) {
      currentPath.value = '/' + pages[pages.length - 1].route
    }
  }
})

const navigate = (url: string) => {
  // Do NOT emit update:visible to false immediately. 
  // We want the old page to remain shifted while the new page slides in!
  
  // Use uni.redirectTo for flat navigation to prevent page stack overflow without re-launching the app
  uni.redirectTo({ url })
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
.user-profile {
  display: flex;
  align-items: center;
  gap: 12rpx;
  cursor: pointer;
  transition: transform 0.2s;
}
.user-profile:active {
  transform: scale(0.95);
}
.avatar-circle {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: #F2F2F7;
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #8E8E93;
}

.drawer-content {
  flex: 1;
  padding: 20rpx 0 60rpx;
}

.nav-group {
  margin-bottom: 60rpx;
  padding: 0 24rpx;
}
.group-title {
  padding: 0 24rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #8E8E93;
  margin-bottom: 16rpx;
  display: block;
}

.nav-item {
  height: 96rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 0 24rpx;
  border-radius: 24rpx;
  cursor: pointer;
  background: transparent;
  transition: background 0.2s;
  margin-bottom: 4rpx;
}
.nav-item:active {
  background: rgba(0, 0, 0, 0.03);
}
.nav-item.active {
  background: #F2F2F7;
}
.nav-icon {
  color: #4A4A4A;
  transition: color 0.2s;
}
.nav-label {
  font-size: 30rpx;
  font-weight: 500;
  color: #4A4A4A;
  transition: color 0.2s, font-weight 0.2s;
}

.nav-item.active .nav-icon {
  color: var(--text-primary);
}
.nav-item.active .nav-label {
  color: var(--text-primary);
  font-weight: 700;
}
</style>
