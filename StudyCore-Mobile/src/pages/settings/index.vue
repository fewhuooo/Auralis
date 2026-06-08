<template>
  <AppPageLayout>
    <view class="settings-page">
      <view class="custom-header">
        <view class="header-content">
          <view class="icon-btn menu-btn" @click.stop="openDrawer">
            <LineIcon name="menu" size="44rpx" />
          </view>
          <text class="header-title">设置与管理</text>
          <view class="header-right"></view>
        </view>
      </view>

    <scroll-view scroll-y class="content-area">
      <!-- User Profile Card -->
      <view class="profile-card">
        <view class="avatar">
          <text class="avatar-icon">👤</text>
        </view>
        <view class="user-info">
          <text class="username">{{ username }}</text>
          <text class="user-meta">已加入 {{ joinedDays }} 天</text>
        </view>
      </view>

      <!-- Settings Groups -->
      <view class="settings-group">
        <text class="group-title">通用</text>
        <view class="menu-list">
          <view class="menu-item">
            <text class="menu-label">深色模式</text>
            <switch :checked="darkMode" color="var(--text-accent)" @change="toggleDarkMode" />
          </view>
          <view class="menu-item" @click="changeLanguage">
            <text class="menu-label">语言 / Language</text>
            <view class="menu-value">
              <text>{{ language === 'zh-CN' ? '简体中文' : 'English' }}</text>
              <text class="arrow">›</text>
            </view>
          </view>
          <view class="menu-item">
            <text class="menu-label">学习提醒</text>
            <switch checked color="var(--text-accent)" />
          </view>
        </view>
      </view>

      <view class="settings-group">
        <text class="group-title">数据管理</text>
        <view class="menu-list">
          <view class="menu-item" @click="syncData">
            <text class="menu-label">手动同步</text>
            <view class="menu-value">
              <text class="sync-status">最后同步: 刚刚</text>
              <text class="arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @click="clearCache">
            <text class="menu-label">清除本地缓存</text>
            <view class="menu-value">
              <text>12.4 MB</text>
              <text class="arrow">›</text>
            </view>
          </view>
        </view>
      </view>

      <view class="settings-group">
        <text class="group-title">关于</text>
        <view class="menu-list">
          <view class="menu-item">
            <text class="menu-label">版本号</text>
            <text class="menu-value-text">v2.1.0</text>
          </view>
          <view class="menu-item">
            <text class="menu-label">隐私政策</text>
            <text class="arrow">›</text>
          </view>
        </view>
      </view>

      <!-- Logout -->
      <view class="logout-btn" @click="handleLogout">
        退出登录
      </view>

      <view class="bottom-spacer"></view>
    </scroll-view>
  </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSyncStore } from '@/store/useSyncStore'
import LineIcon from '@/components/LineIcon.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const layoutStore = useLayoutStore()
const openDrawer = () => layoutStore.openDrawer()
import { useSyncStore } from '@/store/useSyncStore'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const syncStore = useSyncStore()

const { darkMode, language } = storeToRefs(settingsStore)

const username = computed(() => authStore.username || '未登录')
const joinedDays = ref(12) // Mock

const toggleDarkMode = () => {
  settingsStore.toggleDarkMode()
}

const changeLanguage = () => {
  uni.showActionSheet({
    itemList: ['简体中文', 'English'],
    success: (res) => {
      settingsStore.language = res.tapIndex === 0 ? 'zh-CN' : 'en-US'
    }
  })
}

const syncData = async () => {
  uni.showLoading({ title: '同步中...' })
  try {
    await syncStore.triggerSync()
    uni.hideLoading()
    uni.showToast({ title: '同步完成', icon: 'success' })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: '同步失败', icon: 'none' })
  }
}

const clearCache = () => {
  uni.showModal({
    title: '清除缓存',
    content: '此操作不会删除您的学习数据，仅清除图片等缓存资源。',
    success: (res) => {
      if (res.confirm) {
        uni.showToast({ title: '已清除', icon: 'success' })
      }
    }
  })
}

const handleLogout = () => {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    success: (res) => {
      if (res.confirm) {
        authStore.clearToken()
        uni.reLaunch({ url: '/pages/login/index' })
      }
    }
  })
}
</script>

<style scoped>
.settings-page {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
}

.custom-header {
  padding: calc(var(--window-top, 0px) + env(safe-area-inset-top) + 20rpx) 0 20rpx;
  background: var(--color-bg-primary);
}
.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30rpx;
}
.menu-btn {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-primary);
  transition: background 0.2s;
}
.menu-btn:active {
  background: var(--color-bg-elevated);
}
.header-title { 
  font-size: 32rpx; 
  font-weight: 600; 
  color: var(--text-primary); 
}
.header-right { width: 80rpx; }

.content-area {
  flex: 1;
  padding: 20rpx 40rpx;
  box-sizing: border-box;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 32rpx;
  padding: 40rpx;
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-lg);
  margin-bottom: 60rpx;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-icon {
  font-size: 60rpx;
}
.user-info {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.username {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-primary);
}
.user-meta {
  font-size: 26rpx;
  color: var(--text-muted);
}

.settings-group {
  margin-bottom: 60rpx;
}
.group-title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 20rpx;
  display: block;
}
.menu-list {
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 2rpx solid var(--border-subtle);
}
.menu-item:last-child {
  border-bottom: none;
}
.menu-item:active {
  background: var(--border-subtle);
}
.menu-label {
  font-size: 30rpx;
  font-weight: 500;
  color: var(--text-primary);
}
.menu-value {
  display: flex;
  align-items: center;
  gap: 16rpx;
  font-size: 28rpx;
  color: var(--text-secondary);
}
.menu-value-text {
  font-size: 28rpx;
  color: var(--text-secondary);
}
.sync-status {
  color: var(--text-muted);
  font-size: 24rpx;
}
.arrow {
  font-size: 32rpx;
  color: var(--border-default);
}

.logout-btn {
  width: 100%;
  padding: 32rpx 0;
  text-align: center;
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-lg);
  color: #ef4444; /* red */
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 40rpx;
}
.logout-btn:active {
  background: var(--border-subtle);
}

.bottom-spacer {
  height: 120rpx;
}
</style>
