<template>
  <view class="page">
    <!-- Profile Header -->
    <view class="profile-header">
      <view class="avatar-ring">
        <view class="avatar"><text class="avatar-text">SC</text></view>
      </view>
      <text class="user-name">StudyCore 同学</text>
      <text class="user-desc">持续学习第 42 天 ✦</text>
    </view>

    <!-- Stats -->
    <view class="stat-grid">
      <view class="stat-box">
        <text class="sb-value">156</text>
        <text class="sb-label">知识块</text>
      </view>
      <view class="stat-box">
        <text class="sb-value">38</text>
        <text class="sb-label">完成任务</text>
      </view>
      <view class="stat-box">
        <text class="sb-value">67h</text>
        <text class="sb-label">总专注</text>
      </view>
    </view>

    <!-- Menu -->
    <view class="menu-section">
      <view class="menu-item" v-for="item in menuItems" :key="item.label" @click="handleMenu(item)">
        <text class="menu-icon">{{ item.icon }}</text>
        <text class="menu-label">{{ item.label }}</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <!-- Settings -->
    <view class="menu-section">
      <view class="menu-item" v-for="item in settingsItems" :key="item.label" @click="handleMenu(item)">
        <text class="menu-icon">{{ item.icon }}</text>
        <text class="menu-label">{{ item.label }}</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="version-info">
      <text class="ver-text">StudyCore Mobile v1.0.0 · 个人空间</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBlockStore } from '@/store/useBlockStore'
import { useTaskStore } from '@/store/useTaskStore'
import { vibrate } from '@/api/device'
import { getAiConfig, setAiConfig } from '@/api/aiClient'

const blockStore = useBlockStore()
const taskStore = useTaskStore()

const isSyncing = ref(false)

const blockCount = computed(() => blockStore.recentBlocks.length)
const completedCount = computed(() => taskStore.completedCount)
const focusHours = computed(() => taskStore.totalFocusHours)

const menuItems = [
  { icon: '🕮', label: '我的知识库', action: 'blocks' },
  { icon: '◱', label: '学习数据报告', action: 'report' },
  { icon: '↺', label: '跨端同步状态', action: 'sync' },
  { icon: '☍', label: '标签管理', action: 'tags' },
]
const settingsItems = [
  { icon: '☾', label: '深色模式', action: 'dark' },
  { icon: '✦', label: 'AI 引擎设置', action: 'ai_settings' },
  { icon: '⚲', label: '通知设置', action: 'notify' },
  { icon: '⛁', label: '数据备份', action: 'backup' },
  { icon: '⍰', label: '帮助与反馈', action: 'help' },
]

const handleMenu = async (item: any) => {
  vibrate('light')
  if (item.action === 'sync') {
    isSyncing.value = true
    uni.showLoading({ title: '正在同步...' })
    try {
      const { useSyncStore } = await import('@/store/useSyncStore')
      await useSyncStore().triggerSync()
      uni.hideLoading()
      uni.showToast({ title: '同步成功', icon: 'success' })
    } catch (e) {
      uni.hideLoading()
      uni.showToast({ title: '同步失败', icon: 'none' })
    } finally {
      isSyncing.value = false
    }
  } else if (item.action === 'dark') {
    if (typeof document !== 'undefined') {
      const html = document.documentElement
      html.classList.toggle('dark')
      const isDark = html.classList.contains('dark')
      
      try {
        if (isDark) {
          uni.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#171614', animation: { duration: 200, timingFunc: 'easeIn' } })
          if (typeof document !== 'undefined') {
            document.documentElement.classList.add('dark')
          }
        } else {
          uni.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#faf9f8', animation: { duration: 200, timingFunc: 'easeIn' } })
          if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('dark')
          }
        }
      } catch (e) {
        console.log('Native shell style update failed or unsupported in this env')
      }
      
      uni.showToast({ title: isDark ? '已开启深色模式' : '已关闭深色模式', icon: 'none' })
    } else {
      uni.showToast({ title: '当前环境不支持手动切换', icon: 'none' })
    }
  } else if (item.action === 'ai_settings') {
    const config = getAiConfig()
    uni.showModal({
      title: '配置 AI 引擎',
      content: config.apiKey,
      editable: true,
      placeholderText: '请输入 API Key (sk-...)',
      success: function (res) {
        if (res.confirm && res.content) {
          setAiConfig({ apiKey: res.content })
          uni.showToast({ title: 'API Key 已保存', icon: 'success' })
        }
      }
    })
  } else {
    uni.showToast({ title: `${item.label} 开发中`, icon: 'none' })
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg-primary); padding-bottom: calc(env(safe-area-inset-bottom) + 80rpx); }
.profile-header { display: flex; flex-direction: column; align-items: center; padding: calc(var(--status-bar-height, 44px) + 40rpx) 40rpx 40rpx; background: linear-gradient(180deg, rgba(181,172,159,0.15), transparent); }
.avatar-ring { width: 160rpx; height: 160rpx; border-radius: 50%; padding: 6rpx; background: var(--border-accent); margin-bottom: 20rpx; }
.avatar { width: 100%; height: 100%; border-radius: 50%; background: var(--color-bg-secondary); display: flex; align-items: center; justify-content: center; }
.avatar-text { font-size: 48rpx; font-weight: 800; color: var(--text-accent); }
.user-name { font-size: 38rpx; font-weight: 700; color: var(--text-primary); margin-bottom: 8rpx; }
.user-desc { font-size: 26rpx; color: var(--text-muted); }
.stat-grid { display: flex; justify-content: space-around; padding: 32rpx 0; margin: 0 40rpx 40rpx; background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); }
.stat-box { display: flex; flex-direction: column; align-items: center; }
.sb-value { font-size: 44rpx; font-weight: 800; color: var(--text-primary); }
.sb-label { font-size: 22rpx; color: var(--text-muted); margin-top: 6rpx; }
.menu-section { margin: 0 40rpx 40rpx; background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); border-radius: var(--radius-xl); overflow: hidden; box-shadow: var(--shadow-sm); }
.menu-item { display: flex; align-items: center; padding: 32rpx 28rpx; border-bottom: 2rpx solid var(--border-subtle); }
.menu-item:last-child { border-bottom: none; }
.menu-item:active { background: var(--color-bg-tertiary); }
.menu-icon { font-size: 36rpx; margin-right: 20rpx; color: var(--text-secondary); }
.menu-label { flex: 1; font-size: 30rpx; font-weight: 500; color: var(--text-primary); }
.menu-arrow { font-size: 36rpx; color: var(--text-muted); }
.version-info { display: flex; justify-content: center; padding: 40rpx; }
.ver-text { font-size: 22rpx; color: var(--text-muted); }
</style>
