<template>
  <AppPageLayout>
    <view class="profile-page" :class="{ 'dark': darkMode }">
      <!-- Header Bar (iOS Style Blur & Fade-in title) -->
      <view class="custom-header" :class="{ 'has-shadow': scrollTop > 20 }">
        <view class="header-content">
          <view class="icon-btn menu-btn" @click.stop="openDrawer">
            <LineIcon name="menu" size="40rpx" />
          </view>
          <text class="header-title" :style="{ opacity: headerTitleOpacity }">个人空间</text>
          <view class="header-right" @click="goToSettings">
            <LineIcon name="settings" size="40rpx" />
          </view>
        </view>
      </view>

      <!-- Main Scroll Container -->
      <scroll-view 
        scroll-y 
        class="content-area" 
        @scroll="onScroll"
        scroll-with-animation
      >
        <!-- iOS Large Title -->
        <view class="large-title-row" :style="{ opacity: largeTitleOpacity }">
          <text class="large-title">个人空间</text>
        </view>

        <!-- iOS Centered Apple Account Header -->
        <view class="centered-profile-header">
          <view class="account-avatar">
            <text class="avatar-text">SC</text>
          </view>
          <text class="account-name">StudyCore 同学</text>
          <text class="account-sub">持续学习第 {{ joinedDays }} 天 ✦</text>
        </view>

        <!-- Stats Card (Three columns) -->
        <view class="stats-card">
          <view class="stat-col" @click="goToTimeline">
            <text class="stat-val">{{ blockCount }}</text>
            <text class="stat-label">知识块</text>
          </view>
          <view class="stat-col">
            <text class="stat-val">{{ completedCount }}</text>
            <text class="stat-label">完成任务</text>
          </view>
          <view class="stat-col" @click="goToStats">
            <text class="stat-val">{{ focusHours }}h</text>
            <text class="stat-label">总专注</text>
          </view>
        </view>

        <!-- Menu Section: Features -->
        <view class="profile-group">
          <text class="group-title">功能</text>
          <view class="menu-list">
            <view class="menu-item" @click="goToTimeline">
              <view class="item-left">
                <LineIcon name="book" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">我的知识库</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item" @click="goToStats">
              <view class="item-left">
                <LineIcon name="chart" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">学习数据报告</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item" @click="triggerSync">
              <view class="item-left">
                <LineIcon name="sync" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">跨端同步状态</text>
              </view>
              <view class="item-right">
                <text class="arrow" v-if="!isSyncing">›</text>
                <LineIcon name="sync" size="30rpx" color="var(--text-secondary)" class="sync-spinner-icon" v-else />
              </view>
            </view>
            <view class="menu-item" @click="showFeatureUnderDevelopment('标签管理')">
              <view class="item-left">
                <LineIcon name="edit" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">标签管理</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Menu Section: System -->
        <view class="profile-group">
          <text class="group-title">系统</text>
          <view class="menu-list">
            <view class="menu-item">
              <view class="item-left">
                <LineIcon name="theme" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">深色模式</text>
              </view>
              <view class="item-right">
                <switch :checked="darkMode" color="#34c759" @change="toggleDarkMode" class="ios-switch" />
              </view>
            </view>
            <view class="menu-item" @click="goToSettings">
              <view class="item-left">
                <LineIcon name="settings" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">系统设置</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item" @click="showFeatureUnderDevelopment('帮助与反馈')">
              <view class="item-left">
                <LineIcon name="info" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">帮助与反馈</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Footer -->
        <view class="footer-info">
          <text class="footer-text">StudyCore Mobile v2.1.0 · 个人空间</text>
        </view>

        <view class="bottom-spacer"></view>
      </scroll-view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useBlockStore } from '@/store/useBlockStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useLayoutStore } from '@/store/useLayoutStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSyncStore } from '@/store/useSyncStore'
import LineIcon from '@/components/LineIcon.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'

const layoutStore = useLayoutStore()
const blockStore = useBlockStore()
const taskStore = useTaskStore()
const settingsStore = useSettingsStore()
const syncStore = useSyncStore()

const openDrawer = () => layoutStore.openDrawer()
const { darkMode } = storeToRefs(settingsStore)

const isSyncing = ref(false)
const scrollTop = ref(0)

const blockCount = computed(() => blockStore.recentBlocks.length)
const completedCount = computed(() => taskStore.completedCount || 38)
const focusHours = computed(() => taskStore.totalFocusHours || 24.5)

// Mock joined days
const joinedDays = ref(42)

const goToSettings = () => {
  uni.redirectTo({ url: '/pages/settings/index' })
}

const goToStats = () => {
  uni.redirectTo({ url: '/pages/stats/index' })
}

const goToTimeline = () => {
  uni.redirectTo({ url: '/pages/timeline/index' })
}

const toggleDarkMode = () => {
  settingsStore.toggleDarkMode()
}

const onScroll = (e: any) => {
  scrollTop.value = e.detail.scrollTop
}

const headerTitleOpacity = computed(() => {
  const thresholdStart = 30
  const thresholdEnd = 70
  if (scrollTop.value <= thresholdStart) return 0
  if (scrollTop.value >= thresholdEnd) return 1
  return (scrollTop.value - thresholdStart) / (thresholdEnd - thresholdStart)
})

const largeTitleOpacity = computed(() => {
  const thresholdEnd = 40
  if (scrollTop.value >= thresholdEnd) return 0
  return 1 - scrollTop.value / thresholdEnd
})

const triggerSync = async () => {
  if (isSyncing.value) return
  isSyncing.value = true
  uni.showLoading({ title: '正在同步...' })
  try {
    await syncStore.triggerSync()
    uni.hideLoading()
    uni.showToast({ title: '同步成功', icon: 'success' })
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: '同步失败', icon: 'none' })
  } finally {
    isSyncing.value = false
  }
}

const showFeatureUnderDevelopment = (name: string) => {
  uni.showToast({ title: `${name} 功能开发中`, icon: 'none' })
}
</script>

<style scoped>
/* Profile Page Root with CSS Variables for Theme Adaptation */
.profile-page {
  --page-bg: #f2f2f7;
  --card-bg: #ffffff;
  --text-main: #000000;
  --text-sub: rgba(60, 60, 67, 0.55);
  --text-muted-val: rgba(60, 60, 67, 0.4);
  --arrow-color: rgba(60, 60, 67, 0.25);
  --divider-color: rgba(60, 60, 67, 0.08);
  --header-bg: rgba(242, 242, 247, 0.85);
  --header-text: #000000;
  --avatar-bg: #e5e0da;
  --item-active-bg: #e5e5ea;
  --col-divider: rgba(60, 60, 67, 0.08);

  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--page-bg);
  color: var(--text-main);
  transition: background-color 0.3s, color 0.3s;
  overflow: hidden;
}

/* Scoped Dark Mode Overrides (iOS Dark settings: pure black background, #1c1c1e cells) */
.profile-page.dark {
  --page-bg: #000000;
  --card-bg: #1c1c1e;
  --text-main: #ffffff;
  --text-sub: rgba(235, 235, 245, 0.6);
  --text-muted-val: rgba(235, 235, 245, 0.45);
  --arrow-color: rgba(235, 235, 245, 0.25);
  --divider-color: rgba(235, 235, 245, 0.08);
  --header-bg: rgba(0, 0, 0, 0.85);
  --header-text: #ffffff;
  --avatar-bg: #3a3a3c;
  --item-active-bg: #2c2c2e;
  --col-divider: rgba(235, 235, 245, 0.08);
}

/* Fixed Top Header - Transparent/Blur styled */
.custom-header {
  position: absolute;
  top: 0; left: 0; right: 0;
  padding-top: var(--status-bar-height, 44px);
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 100;
  transition: background-color 0.3s, border-color 0.3s;
  border-bottom: 1px solid transparent;
}

.custom-header.has-shadow {
  border-bottom-color: var(--divider-color);
}

.header-content {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
}

.menu-btn {
  width: 76rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-main);
  transition: background-color 0.2s;
}

.menu-btn:active {
  background-color: var(--item-active-bg);
}

.header-title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--header-text);
  transition: opacity 0.2s, color 0.3s;
}

.header-right {
  width: 76rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-main);
  border-radius: 50%;
  transition: background-color 0.2s;
}

.header-right:active {
  background-color: var(--item-active-bg);
}

/* Content Area - scrolls under header */
.content-area {
  flex: 1;
  height: 0;
  box-sizing: border-box;
  padding-top: calc(88rpx + var(--status-bar-height, 44px) + 10rpx);
}

/* iOS Large Title Row */
.large-title-row {
  padding: 20rpx 36rpx 36rpx;
  transition: opacity 0.15s ease-out;
}

.large-title {
  font-size: 68rpx;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: -1.5rpx;
}

/* Centered Apple Account Header (iOS 16 style) */
.centered-profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0 40rpx;
}

.account-avatar {
  width: 140rpx;
  height: 140rpx;
  border-radius: 70rpx;
  background: var(--avatar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.03);
  margin-bottom: 20rpx;
  transition: background-color 0.3s;
}

.avatar-text {
  font-size: 52rpx;
  font-weight: 800;
  color: var(--text-main);
  transition: color 0.3s;
}

.account-name {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text-main);
  transition: color 0.3s;
}

.account-sub {
  font-size: 22rpx;
  color: var(--text-sub);
  margin-top: 4rpx;
  transition: color 0.3s;
}

/* Stats Card - Rounded Group Style */
.stats-card {
  margin: 0 32rpx 40rpx;
  background: var(--card-bg);
  border-radius: 20rpx;
  padding: 24rpx 0;
  display: flex;
  align-items: center;
  transition: background-color 0.3s;
}

.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--col-divider);
  transition: opacity 0.2s, border-right-color 0.3s;
}

.stat-col:active {
  opacity: 0.6;
}

.stat-col:last-child {
  border-right: none;
}

.stat-val {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-main);
  transition: color 0.3s;
}

.stat-label {
  font-size: 20rpx;
  color: var(--text-sub);
  margin-top: 6rpx;
  font-weight: 500;
  transition: color 0.3s;
}

/* Group sections & lists (Apple Account style list) */
.profile-group {
  margin: 0 32rpx 40rpx;
}

.group-title {
  font-size: 22rpx;
  color: var(--text-sub);
  padding: 0 16rpx 12rpx;
  text-transform: uppercase;
  letter-spacing: 0.5rpx;
  display: block;
  transition: color 0.3s;
}

.menu-list {
  background: var(--card-bg);
  border-radius: 20rpx;
  overflow: hidden;
  transition: background-color 0.3s;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 32rpx;
  background: var(--card-bg);
  transition: background-color 0.2s;
  position: relative;
}

.menu-item:active {
  background-color: var(--item-active-bg);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.menu-item-icon {
  flex-shrink: 0;
}

/* iOS-style inset separators starting from 88rpx left position (32rpx padding + 36rpx icon + 20rpx gap) */
.menu-item + .menu-item::after {
  content: '';
  position: absolute;
  top: 0;
  left: 88rpx;
  right: 0;
  height: 1px;
  background-color: var(--divider-color);
  transition: background-color 0.3s;
}

.menu-label {
  font-size: 28rpx;
  color: var(--text-main);
  font-weight: 400;
  transition: color 0.3s;
}

.sync-spinner-icon {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.arrow {
  font-size: 30rpx;
  color: var(--arrow-color);
  line-height: 1;
  transition: color 0.3s;
}

.ios-switch {
  transform: scale(0.8);
  transform-origin: right center;
}

/* Footer Section */
.footer-info {
  display: flex;
  justify-content: center;
  padding: 40rpx 0;
}

.footer-text {
  font-size: 20rpx;
  color: var(--text-sub);
  transition: color 0.3s;
}

.bottom-spacer {
  height: calc(120rpx + var(--window-bottom, 0));
}
</style>
