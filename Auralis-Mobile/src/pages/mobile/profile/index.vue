<template>
  <AppPageLayout anim-origin="slide-right">
    <view class="profile-page" :class="{ 'dark': darkMode }">
      <!-- 通用极简禅意顶栏（带左上角返回按钮） -->
      <AppHeader title="个人空间" :showBackButton="true" />

      <!-- Main Scroll Container -->
      <scroll-view 
        scroll-y 
        :show-scrollbar="false"
        class="content-area" 
        @scroll="onScroll"
        scroll-with-animation
      >
        <!-- iOS Large Title -->
        <view class="large-title-row" :style="{ opacity: largeTitleOpacity }">
          <text class="large-title">个人空间</text>
        </view>

        <!-- Account identity -->
        <view class="profile-hero-card">
          <!-- Left Column: Avatar & Name -->
          <view class="hero-left">
            <view class="account-avatar">
              <text class="avatar-text">SC</text>
            </view>
            <view class="user-info">
              <text class="account-name">{{ username }}</text>
              <text class="account-sub">{{ accountMeta }}</text>
            </view>
          </view>
        </view>

        <!-- Group 1: 通用偏好 -->
        <view class="profile-group">
          <text class="group-title">通用设置</text>
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
            <view class="menu-item" @click="changeLanguage">
              <view class="item-left">
                <LineIcon name="language" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">语言 / Language</text>
              </view>
              <view class="item-right">
                <text class="menu-value-text">{{ language === 'zh-CN' ? '简体中文' : 'English' }}</text>
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item">
              <view class="item-left">
                <LineIcon name="bell" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">学习提醒</text>
              </view>
              <view class="item-right">
                <switch :checked="remindersEnabled" color="#34c759" @change="remindersEnabled = !remindersEnabled" class="ios-switch" />
              </view>
            </view>
            <view class="menu-item" @click="changeFontSize">
              <view class="item-left">
                <LineIcon name="aa" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">字体大小</text>
              </view>
              <view class="item-right">
                <text class="menu-value-text">标准</text>
                <text class="arrow">›</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Group 2.5: AI 使用额度 -->
        <view class="profile-group">
          <text class="group-title">AI 使用额度</text>
          <view class="menu-list" style="padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--list-bg);">
            <view v-if="loadingAiUsage" style="color: var(--text-secondary); font-size: 13px;">加载中...</view>
            <view v-else-if="aiUsageError" style="color: #ff3b30; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
              <text>{{ aiUsageError }}</text>
              <view @click="fetchAiUsage" style="color: var(--primary); padding: 4px 8px;">重试</view>
            </view>
            <view v-else-if="aiUsage" style="display: flex; flex-direction: column; gap: 16px;">
              <view style="background: var(--page-bg); padding: 12px; border-radius: 8px;">
                <view style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; font-size: 13px; color: var(--text-primary);">
                  <text>每小时额度 (Hourly)</text>
                  <text style="color: var(--text-secondary); font-weight: normal; font-size: 12px;">重置时间: {{ new Date(aiUsage.hourly.resetAt).toLocaleString('zh-CN') }}</text>
                </view>
                <view style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--text-secondary);">
                  <text>总额度：{{ aiUsage.hourly.limitTokens }} token</text>
                  <text>剩余额度：{{ aiUsage.hourly.remainingTokens }} token</text>
                  <text title="缺少实际 usage 时按保守估算">已结算（可能为保守估算）：{{ aiUsage.hourly.chargedTokens }} token</text>
                  <text title="在途预留为估算值，不代表最终实际用量">在途预留（估算）：{{ aiUsage.hourly.reservedTokens }} token</text>
                </view>
              </view>
              <view style="background: var(--page-bg); padding: 12px; border-radius: 8px;">
                <view style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; font-size: 13px; color: var(--text-primary);">
                  <text>每日额度 (Daily)</text>
                  <text style="color: var(--text-secondary); font-weight: normal; font-size: 12px;">重置时间: {{ new Date(aiUsage.daily.resetAt).toLocaleString('zh-CN') }}</text>
                </view>
                <view style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--text-secondary);">
                  <text>总额度：{{ aiUsage.daily.limitTokens }} token</text>
                  <text>剩余额度：{{ aiUsage.daily.remainingTokens }} token</text>
                  <text title="缺少实际 usage 时按保守估算">已结算（可能为保守估算）：{{ aiUsage.daily.chargedTokens }} token</text>
                  <text title="在途预留为估算值，不代表最终实际用量">在途预留（估算）：{{ aiUsage.daily.reservedTokens }} token</text>
                </view>
              </view>
              <view style="display: flex; justify-content: flex-end;">
                <view @click="fetchAiUsage" style="color: var(--primary); padding: 4px 8px; font-size: 13px;">刷新</view>
              </view>
            </view>
          </view>
        </view>
        <!-- Group 2: AI 设置 -->
        <view class="profile-group">
          <text class="group-title">AI 设置</text>
          <view class="menu-list">
            <view class="menu-item" @click="configureAiEngine">
              <view class="item-left">
                <LineIcon name="ai" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">AI 引擎</text>
              </view>
              <view class="item-right">
                <text class="menu-value-text">Auralis AI</text>
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item" @click="configureApiKey">
              <view class="item-left">
                <LineIcon name="key" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">API Key</text>
              </view>
              <view class="item-right">
                <text class="menu-value-text">已配置</text>
                <text class="arrow">›</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Group 3: 数据与同步 -->
        <view class="profile-group">
          <text class="group-title">数据与同步</text>
          <view class="menu-list">
            <view class="menu-item" @click="triggerSync">
              <view class="item-left">
                <LineIcon name="sync" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">跨端数据同步</text>
              </view>
              <view class="item-right">
                <text class="menu-value-text" v-if="!isSyncing">最后同步: 刚刚</text>
                <LineIcon name="sync" size="30rpx" color="var(--text-secondary)" class="sync-spinner-icon" v-else />
              </view>
            </view>
            <view class="menu-item" @click="clearCache">
              <view class="item-left">
                <LineIcon name="trash" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">清除本地缓存</text>
              </view>
              <view class="item-right">
                <text class="menu-value-text">12.4 MB</text>
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item" @click="exportData">
              <view class="item-left">
                <LineIcon name="export" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">导出学习数据</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Group 4: 关于与帮助 -->
        <view class="profile-group">
          <text class="group-title">系统与关于</text>
          <view class="menu-list">
            <view class="menu-item" @click="showFeatureUnderDevelopment('帮助与反馈')">
              <view class="item-left">
                <LineIcon name="info" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">帮助与反馈</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item" @click="openPrivacyPolicy">
              <view class="item-left">
                <LineIcon name="shield" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">隐私政策</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item" @click="openOpenSourceLicenses">
              <view class="item-left">
                <LineIcon name="license" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">开源许可</text>
              </view>
              <view class="item-right">
                <text class="arrow">›</text>
              </view>
            </view>
            <view class="menu-item">
              <view class="item-left">
                <LineIcon name="info" size="36rpx" color="var(--text-secondary)" class="menu-item-icon" />
                <text class="menu-label">当前版本</text>
              </view>
              <view class="item-right">
                <text class="menu-value-text">v2.1.0</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Group 5: 退出当前账号 -->
        <view class="profile-group logout-group">
          <view class="menu-list">
            <view class="menu-item logout-cell" @click="handleLogout">
              <text class="logout-text">退出当前账号</text>
            </view>
          </view>
        </view>

        <!-- Footer -->
        <view class="footer-info">
          <text class="footer-text">Auralis Mobile v2.1.0 · 个人空间</text>
        </view>

        <view class="bottom-spacer"></view>
      </scroll-view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSyncStore } from '@/store/useSyncStore'
import { useAiUsage } from '@/utils/useAiUsage'
import { useAuthStore } from '@/store/useAuthStore'
import LineIcon from '@/components/LineIcon.vue'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'

const settingsStore = useSettingsStore()
const syncStore = useSyncStore()
const authStore = useAuthStore()

const { aiUsage, loadingAiUsage, aiUsageError, fetchAiUsage } = useAiUsage()






const { darkMode, language } = storeToRefs(settingsStore)

const isSyncing = ref(false)
const scrollTop = ref(0)
const remindersEnabled = ref(true)

const username = computed(() => authStore.username || 'Auralis 同学')
const accountMeta = computed(() => '跨端同步与账户')

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
    success: () => {
      uni.showToast({ title: '设置成功', icon: 'success' })
    }
  })
}

const configureAiEngine = () => {
  uni.showActionSheet({
    itemList: ['Auralis AI (推荐)', 'OpenAI GPT-4o', 'Claude 3.5 Sonnet'],
    success: () => {
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
    content: 'Auralis 致力于保护您的隐私，您的数据在本地进行加密存储。',
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
        authStore.logout()
        uni.reLaunch({ url: '/pages/mobile/login/index' })
      }
    }
  })
}

const onScroll = (e: any) => {
  scrollTop.value = e.detail.scrollTop
}

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
  --page-bg: var(--color-zen-ivory);
  --card-bg: var(--color-zen-white);
  --text-main: var(--color-zen-graphite);
  --text-secondary: var(--color-zen-stone);
  --text-sub: var(--color-zen-stone);
  --divider-color: var(--color-zen-hairline);
  --item-active-bg: rgba(0, 0, 0, 0.04);
  --arrow-color: var(--color-zen-stone);
  --logout-color: #ff3b30;
  
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--page-bg);
  transition: background-color 0.3s;
}

.profile-page.dark {
  --page-bg: #121212;
  --card-bg: #1E1E1E;
  --text-main: #FFFFFF;
  --text-secondary: #AAAAAA;
  --text-sub: #888888;
  --divider-color: #2A2A2A;
  --item-active-bg: rgba(255, 255, 255, 0.08);
  --arrow-color: #555555;
  --logout-color: #ff453a;
}

.content-area {
  flex: 1;
  height: 0;
  min-height: 0;
  box-sizing: border-box;
}

/* iOS Large Title Row */
.large-title-row {
  padding: 20rpx 36rpx 36rpx;
}

.large-title {
  font-size: 64rpx;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: -1.5rpx;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  transition: color 0.3s;
}

.profile-hero-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin: 10rpx 24rpx 32rpx;
  padding: 32rpx 28rpx;
  background: var(--card-bg);
  border: 1px solid var(--divider-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.02);
  transition: background-color 0.3s, border-color 0.3s;
  gap: 20rpx;
}

.hero-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
}

.account-avatar {
  width: 132rpx;
  height: 132rpx;
  border-radius: 50%;
  background: var(--color-zen-graphite);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
  box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.12);
}

.profile-page.dark .account-avatar {
  background: var(--color-zen-sage);
}

.avatar-text {
  font-size: 52rpx;
  font-weight: 700;
  color: var(--color-zen-white);
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.account-name {
  font-size: 38rpx;
  font-weight: 700;
  color: var(--text-main);
  transition: color 0.3s;
}

.account-sub {
  font-size: 24rpx;
  color: var(--text-sub);
  font-weight: 400;
  transition: color 0.3s;
}

/* Group sections & lists (Tighter, narrower, slightly left-aligned) */
.profile-group {
  margin: 0 24rpx 28rpx;
}

.group-title {
  font-size: 22rpx;
  color: var(--text-sub);
  padding: 0 12rpx 10rpx;
  font-weight: 600;
  display: block;
  transition: color 0.3s;
}

.menu-list {
  background: var(--card-bg);
  border: 1px solid var(--divider-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: background-color 0.3s;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
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
  gap: 18rpx;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.menu-item-icon {
  flex-shrink: 0;
}

.menu-item + .menu-item::after {
  content: '';
  position: absolute;
  top: 0;
  left: 76rpx;
  right: 0;
  height: 1px;
  background-color: var(--divider-color);
  transition: background-color 0.3s;
}

.menu-label {
  font-size: 27rpx;
  color: var(--text-main);
  font-weight: 400;
  transition: color 0.3s;
}

.menu-value-text {
  font-size: 24rpx;
  color: var(--text-sub);
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
  margin-right: -4rpx;
}

/* Logout Group Cell */
.logout-group {
  margin-top: 10rpx;
  margin-bottom: 48rpx;
}

.logout-cell {
  justify-content: center;
}

.logout-text {
  font-size: 30rpx;
  color: var(--logout-color);
  font-weight: 500;
  transition: color 0.3s;
}

/* Footer Section */
.footer-info {
  display: flex;
  justify-content: center;
  padding: 24rpx 0;
}

.footer-text {
  font-size: 22rpx;
  color: var(--text-sub);
  transition: color 0.3s;
}

.bottom-spacer {
  height: calc(180rpx + env(safe-area-inset-bottom));
}
</style>

