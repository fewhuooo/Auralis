<template>
  <view class="tablet-layout">
    <!-- Sidebar -->
    <view class="sidebar">
      <view class="logo-area">
        <text class="logo-text">SC</text>
      </view>
      
      <view class="nav-menu">
        <view 
          v-for="item in navItems" 
          :key="item.path"
          class="nav-item"
          :class="{ active: currentPath === item.path }"
          @click="navigate(item.path)"
        >
          <text class="nav-icon">{{ item.icon }}</text>
          <text class="nav-label">{{ item.label }}</text>
        </view>
      </view>
      
      <view class="nav-bottom">
        <view class="nav-item" :class="{ active: currentPath === '/pages/tablet/profile/index' }" @click="navigate('/pages/tablet/profile/index')">
          <text class="nav-icon">👤</text>
          <text class="nav-label">我的</text>
        </view>
      </view>
    </view>

    <!-- Main Content -->
    <view class="main-content">
      <slot></slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const currentPath = ref('')

const navItems = [
  { path: '/pages/tablet/dashboard/index', icon: '📊', label: '仪表盘' },
  { path: '/pages/tablet/subject-hall/index', icon: '📚', label: '学科' },
  { path: '/pages/tablet/timeline/index', icon: '📅', label: '排期' },
  { path: '/pages/tablet/asset/index', icon: '🗂️', label: '资产' },
  { path: '/pages/tablet/handwriting/index', icon: '✎', label: '笔记' },
]

onMounted(() => {
  // Try to get current route in uni-app
  const pages = getCurrentPages()
  if (pages.length > 0) {
    currentPath.value = '/' + pages[pages.length - 1].route
  }
})

const navigate = (path: string) => {
  if (currentPath.value === path) return
  uni.redirectTo({ url: path })
}
</script>

<style scoped>
.tablet-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  background: var(--color-bg-primary);
  overflow: hidden;
}

.sidebar {
  width: var(--tablet-sidebar-width, 120rpx);
  background: var(--color-bg-secondary);
  border-right: 2rpx solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0;
  z-index: 100;
  transition: width 0.2s;
}

.logo-area {
  width: 80rpx;
  height: 80rpx;
  background: var(--text-primary);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 80rpx;
}
.logo-text {
  color: var(--color-bg-primary);
  font-weight: 800;
  font-size: 32rpx;
}

.nav-menu {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 40rpx;
  width: 100%;
  align-items: center;
}

.nav-bottom {
  display: flex;
  flex-direction: column;
  gap: 40rpx;
  width: 100%;
  align-items: center;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
  width: 100%;
  padding: 10rpx 0;
}
.nav-item:hover {
  opacity: 0.8;
}
.nav-item.active {
  opacity: 1;
  position: relative;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10%;
  height: 80%;
  width: 8rpx;
  background: var(--text-primary);
  border-radius: 0 8rpx 8rpx 0;
}

.nav-icon {
  font-size: 40rpx;
}
.nav-label {
  font-size: 20rpx;
  font-weight: 600;
  color: var(--text-primary);
}

.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  height: 100%;
  background: var(--color-bg-primary);
  position: relative;
}
</style>
