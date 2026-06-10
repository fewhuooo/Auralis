<template>
  <AppPageLayout>
    <view class="settings-page" :class="{ 'dark': darkMode }">
      <!-- Header Bar (iOS Style Blur & Fade-in title) -->
      <view class="custom-header" :class="{ 'has-shadow': scrollTop > 20 }">
        <view class="header-content">
          <view class="icon-btn menu-btn" @click.stop="openDrawer">
            <LineIcon name="menu" size="40rpx" />
          </view>
          <text class="header-title" :style="{ opacity: headerTitleOpacity }">设置与管理</text>
          <view class="header-right"></view>
        </view>
      </view>

      <!-- Main Scroll Area -->
      <scroll-view 
        scroll-y 
        class="content-area"
        @scroll="onScroll"
        scroll-with-animation
      >
        <!-- iOS Large Title -->
        <view class="large-title-row" :style="{ opacity: largeTitleOpacity }">
          <text class="large-title">设置与管理</text>
        </view>

        <!-- Search Bar at the top of content flow -->
        <view class="search-container">
          <view class="search-bar">
            <view class="search-icon-box">
              <LineIcon name="search" size="32rpx" color="var(--text-sub)" />
            </view>
            <input 
              class="search-input" 
              v-model="searchQuery" 
              placeholder="搜索" 
              placeholder-class="search-placeholder"
            />
            <view v-if="searchQuery" class="clear-btn" @click="searchQuery = ''">
              <LineIcon name="close" size="20rpx" color="var(--text-sub)" />
            </view>
            <view v-else class="mic-icon-box">
              <LineIcon name="mic" size="32rpx" color="var(--text-sub)" />
            </view>
          </view>
        </view>

        <!-- Group 1: User Profile Card + Warning Cell -->
        <view v-if="!searchQuery" class="settings-group account-group">
          <view class="menu-list">
            <!-- Account Info Row -->
            <view class="menu-item account-item" @click="navigateToProfile">
              <view class="item-left">
                <view class="avatar">
                  <LineIcon name="avatar" size="56rpx" color="var(--text-sub)" />
                </view>
                <view class="user-info">
                  <text class="username">{{ username }}</text>
                  <text class="user-meta">已加入 {{ joinedDays }} 天 · 跨端同步与账户</text>
                </view>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Settings Groups (Dynamic Filtering) -->
        <view 
          v-for="group in filteredGroups" 
          :key="group.title" 
          class="settings-group"
        >
          <text class="group-title">{{ group.title }}</text>
          <view class="menu-list">
            <view 
              v-for="item in group.items" 
              :key="item.id" 
              class="menu-item"
              @click="item.type !== 'switch' && item.action ? item.action() : null"
            >
              <view class="item-left">
                <LineIcon :name="item.icon" size="36rpx" color="var(--text-sub)" class="menu-item-icon" />
                <text class="menu-label">{{ item.label }}</text>
              </view>
              
              <view class="item-right text-arrow-gap">
                <template v-if="item.type === 'switch'">
                  <switch 
                    :checked="item.value" 
                    color="#34c759" 
                    @change="item.action" 
                    class="ios-switch" 
                  />
                </template>
                <template v-else-if="item.type === 'select'">
                  <text class="menu-value-text">{{ item.valueText }}</text>
                  <text class="arrow">›</text>
                </template>
                <template v-else-if="item.type === 'link'">
                  <text class="arrow">›</text>
                </template>
                <template v-else-if="item.type === 'text'">
                  <text class="menu-value-text">{{ item.valueText }}</text>
                </template>
              </view>
            </view>
          </view>
          <text v-if="group.footer" class="group-footer">{{ group.footer }}</text>
        </view>

        <!-- Logout Group Cell (Only show when not searching) -->
        <view v-if="!searchQuery" class="settings-group logout-group">
          <view class="menu-list">
            <view class="menu-item logout-cell" @click="handleLogout">
              <text class="logout-text">退出登录</text>
            </view>
          </view>
        </view>

        <!-- Spacing at bottom -->
        <view class="bottom-spacer"></view>
      </scroll-view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSyncStore } from '@/store/useSyncStore'
import LineIcon from '@/components/LineIcon.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const layoutStore = useLayoutStore()
const openDrawer = () => layoutStore.openDrawer()

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const syncStore = useSyncStore()

const { darkMode, language } = storeToRefs(settingsStore)

const username = computed(() => authStore.username || '未登录')
const joinedDays = ref(12) // Mock
const searchQuery = ref('')
const remindersEnabled = ref(true)
const scrollTop = ref(0)

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

const navigateToProfile = () => {
  uni.redirectTo({ url: '/pages/profile/index' })
}

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

const changeFontSize = () => {
  uni.showActionSheet({
    itemList: ['小', '标准', '大', '超大'],
    success: (res) => {
      uni.showToast({ title: '设置成功', icon: 'success' })
    }
  })
}

const configureAiEngine = () => {
  uni.showActionSheet({
    itemList: ['StudyCore AI (推荐)', 'OpenAI GPT-4o', 'Claude 3.5 Sonnet'],
    success: (res) => {
      uni.showToast({ title: '已切换引擎', icon: 'success' })
    }
  })
}

const configureApiKey = () => {
  uni.showModal({
    title: '配置 API Key',
    placeholderText: '请输入您的 API Key',
    success: (res) => {
      if (res.confirm) {
        uni.showToast({ title: '保存成功', icon: 'success' })
      }
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

const exportData = () => {
  uni.showToast({ title: '数据导出成功，已发送至您的邮箱', icon: 'none' })
}

const openPrivacyPolicy = () => {
  uni.showModal({
    title: '隐私政策',
    content: 'StudyCore 致力于保护您的隐私，您的数据在本地进行加密存储。',
    showCancel: false
  })
}

const openOpenSourceLicenses = () => {
  uni.showModal({
    title: '开源许可',
    content: '本项目基于 MIT 开源协议构建。包含 Vue, Uni-app, Pinia, SQLite.',
    showCancel: false
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

// Settings menu structure definition with LineIcon names
const groups = computed(() => [
  {
    title: '通用',
    items: [
      {
        id: 'dark_mode',
        label: '深色模式',
        icon: 'theme',
        bgColor: '#5856d6',
        type: 'switch',
        value: darkMode.value,
        action: toggleDarkMode
      },
      {
        id: 'language',
        label: '语言 / Language',
        icon: 'language',
        bgColor: '#007aff',
        type: 'select',
        valueText: language.value === 'zh-CN' ? '简体中文' : 'English',
        action: changeLanguage
      },
      {
        id: 'reminders',
        label: '学习提醒',
        icon: 'bell',
        bgColor: '#ff3b30',
        type: 'switch',
        value: remindersEnabled.value,
        action: () => { remindersEnabled.value = !remindersEnabled.value }
      },
      {
        id: 'font_size',
        label: '字体大小',
        icon: 'aa',
        bgColor: '#8e8e93',
        type: 'select',
        valueText: '标准',
        action: changeFontSize
      }
    ]
  },
  {
    title: 'AI 设置',
    items: [
      {
        id: 'ai_engine',
        label: 'AI 引擎',
        icon: 'ai',
        bgColor: '#af52de',
        type: 'select',
        valueText: 'StudyCore AI',
        action: configureAiEngine
      },
      {
        id: 'api_key',
        label: 'API Key',
        icon: 'key',
        bgColor: '#ff9500',
        type: 'select',
        valueText: '已配置',
        action: configureApiKey
      }
    ]
  },
  {
    title: '数据管理',
    items: [
      {
        id: 'sync',
        label: '手动同步',
        icon: 'sync',
        bgColor: '#34c759',
        type: 'select',
        valueText: '最后同步: 刚刚',
        action: syncData
      },
      {
        id: 'clear_cache',
        label: '清除本地缓存',
        icon: 'trash',
        bgColor: '#5ac8fa',
        type: 'select',
        valueText: '12.4 MB',
        action: clearCache
      },
      {
        id: 'export_data',
        label: '导出学习数据',
        icon: 'export',
        bgColor: '#ff9500',
        type: 'link',
        action: exportData
      }
    ]
  },
  {
    title: '关于',
    items: [
      {
        id: 'version',
        label: '版本号',
        icon: 'info',
        bgColor: '#007aff',
        type: 'text',
        valueText: 'v2.1.0'
      },
      {
        id: 'privacy',
        label: '隐私政策',
        icon: 'shield',
        bgColor: '#34c759',
        type: 'link',
        action: openPrivacyPolicy
      },
      {
        id: 'licenses',
        label: '开源许可',
        icon: 'license',
        bgColor: '#8e8e93',
        type: 'link',
        action: openOpenSourceLicenses
      }
    ]
  }
])

// Filter settings items in real-time based on search input
const filteredGroups = computed(() => {
  if (!searchQuery.value) return groups.value
  const query = searchQuery.value.trim().toLowerCase()
  return groups.value.map(group => {
    const items = group.items.filter(item => 
      item.label.toLowerCase().includes(query)
    )
    return { ...group, items }
  }).filter(group => group.items.length > 0)
})
</script>

<style scoped>
/* Settings Page Root with CSS Variables for Theme Adaptation */
.settings-page {
  --page-bg: #f2f2f7;
  --card-bg: #ffffff;
  --text-main: #000000;
  --text-sub: rgba(60, 60, 67, 0.45);
  --text-muted-val: rgba(60, 60, 67, 0.35);
  --arrow-color: rgba(60, 60, 67, 0.25);
  --divider-color: rgba(60, 60, 67, 0.08);
  --avatar-bg: #e5e0da;
  --logout-color: #ff3b30;
  --item-active-bg: #e5e5ea;
  --search-bg: #ffffff;
  --search-placeholder: rgba(60, 60, 67, 0.4);
  --search-clear-bg: rgba(120, 120, 128, 0.1);
  --badge-bg: #ff3b30;
  --header-bg: rgba(242, 242, 247, 0.85);
  --header-text: #000000;

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
.settings-page.dark {
  --page-bg: #000000;
  --card-bg: #1c1c1e;
  --text-main: #ffffff;
  --text-sub: rgba(235, 235, 245, 0.45);
  --text-muted-val: rgba(235, 235, 245, 0.35);
  --arrow-color: rgba(235, 235, 245, 0.25);
  --divider-color: rgba(235, 235, 245, 0.08);
  --avatar-bg: #3a3a3c;
  --logout-color: #ff453a;
  --item-active-bg: #2c2c2e;
  --search-bg: #1c1c1e;
  --search-placeholder: rgba(235, 235, 245, 0.45);
  --search-clear-bg: rgba(235, 235, 245, 0.15);
  --badge-bg: #ff453a;
  --header-bg: rgba(0, 0, 0, 0.85);
  --header-text: #ffffff;
}

.status-bar-spacer {
  height: var(--status-bar-height, 44px);
  width: 100%;
}

/* Search Bar at the top */
.search-container {
  margin: 0 36rpx 48rpx;
}

.search-bar {
  height: 80rpx;
  background-color: var(--card-bg);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  padding: 0 24rpx;
  box-shadow: 0 4rpx 32rpx rgba(0, 0, 0, 0.015);
  border: 1px solid var(--divider-color);
  transition: background-color 0.3s, border-color 0.3s;
}

.search-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12rpx;
}

.search-input {
  flex: 1;
  height: 100%;
  font-size: 26rpx;
  color: var(--text-main);
  background: transparent;
}

.search-placeholder {
  color: var(--search-placeholder);
}

.clear-btn {
  width: 36rpx;
  height: 36rpx;
  border-radius: 18rpx;
  background-color: var(--search-clear-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mic-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* Content Area */
.content-area {
  flex: 1;
  height: 0;
  box-sizing: border-box;
  padding-top: calc(88rpx + var(--status-bar-height, 44px) + 10rpx);
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
}

/* iOS Large Title Row */
.large-title-row {
  padding: 20rpx 36rpx 36rpx;
}

.large-title {
  font-size: 68rpx;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: -1.5rpx;
}

/* Group sections & lists (Apple Account style list) */
.settings-group {
  margin: 0 36rpx 56rpx;
}

.group-title {
  font-size: 22rpx;
  color: var(--text-muted-val);
  padding: 0 16rpx 10rpx;
  margin-top: 12rpx;
  text-transform: uppercase;
  letter-spacing: 0.5rpx;
  display: block;
  transition: color 0.3s;
}

.group-footer {
  font-size: 20rpx;
  color: var(--text-muted-val);
  padding: 12rpx 16rpx 0;
  display: block;
  transition: color 0.3s;
}

.menu-list {
  background: var(--card-bg);
  border-radius: 28rpx;
  overflow: hidden;
  transition: background-color 0.3s;
  box-shadow: 0 4rpx 32rpx rgba(0, 0, 0, 0.015);
}

.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 26rpx 32rpx;
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
  flex: 1;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.text-arrow-gap {
  gap: 10rpx !important;
}

.menu-item-icon {
  flex-shrink: 0;
}

/* User Profile Account Item details */
.account-item {
  padding: 24rpx 32rpx;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background: var(--avatar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.3s;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.username {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-main);
}

.user-meta {
  font-size: 22rpx;
  font-weight: 300;
  color: var(--text-muted-val);
}

/* Warnings / Notifications Style */
.warning-item .warning-label {
  font-size: 28rpx;
  color: var(--text-main);
  font-weight: 400;
}

.badge-text-warning {
  font-size: 26rpx;
  color: #ff3b30;
  font-weight: 500;
}
.settings-page.dark .badge-text-warning {
  color: #ff453a;
}

.badge-text-info {
  font-size: 26rpx;
  color: var(--text-sub);
  font-weight: 400;
}

/* Separator Lines (Inset by 88rpx: 32rpx padding + 36rpx icon + 20rpx gap) */
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

/* Profile account line divider starts at text offset */
.account-group .menu-item + .menu-item::after {
  left: 32rpx;
}

.menu-label {
  font-size: 28rpx;
  color: var(--text-main);
  font-weight: 400;
  transition: color 0.3s;
}

.menu-label-normal {
  font-size: 28rpx;
  color: var(--text-main);
  font-weight: 400;
}

.menu-value-text {
  font-size: 26rpx;
  color: var(--text-sub);
  transition: color 0.3s;
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
  margin-right: -4rpx;
}

/* Add shadow overlay on the switch handle thumb inside H5/App */
.ios-switch .uni-switch-input::after {
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.12) !important;
}

/* Logout Group Cell styles */
.logout-group {
  margin-top: 20rpx;
  margin-bottom: 60rpx;
}

.logout-cell {
  justify-content: center;
}

.logout-text {
  font-size: 28rpx;
  color: var(--logout-color);
  font-weight: 500;
  transition: color 0.3s;
}

.bottom-spacer {
  height: 120rpx;
}
</style>
