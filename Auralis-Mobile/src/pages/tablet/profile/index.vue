<template>
  <TabletLayout>
    <view class="t-profile">
      <view class="header">
        <text class="page-title">个人中心</text>
      </view>

      <view class="content-area">
        <!-- Left Panel: User Card -->
        <view class="left-panel">
          <!-- User Card -->
          <view class="user-card">
            <view class="avatar-area">
              <view class="avatar-ring">
                <view class="avatar"><text class="avatar-text">{{ avatarLetter }}</text></view>
              </view>
              <view class="online-dot"></view>
            </view>
            <text class="username">{{ authStore.username || '未登录' }}</text>
          </view>
        </view>

        <!-- Right Panel: Settings -->
        <view class="right-panel">
          <!-- Appearance -->
          <view class="settings-group">
            <text class="group-title">外观与显示</text>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">☽</text>
                <view><text class="setting-name">深色模式</text><text class="setting-desc">切换深色/浅色主题</text></view>
              </view>
              <view class="toggle" :class="{ on: settingsStore.darkMode }" @click="settingsStore.toggleDarkMode()">
                <view class="toggle-knob"></view>
              </view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">∠</text>
                <view><text class="setting-name">紧凑布局</text><text class="setting-desc">减少间距，显示更多内容</text></view>
              </view>
              <view class="toggle" :class="{ on: compactLayout }" @click="compactLayout = !compactLayout">
                <view class="toggle-knob"></view>
              </view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">Aa</text>
                <view><text class="setting-name">字体大小</text><text class="setting-desc">当前: {{ fontSizeLabel }}</text></view>
              </view>
              <view class="font-size-options">
                <view v-for="opt in fontSizeOptions" :key="opt.value" class="font-opt" :class="{ active: settingsStore.fontSize === opt.value }" @click="settingsStore.fontSize = opt.value"><text>{{ opt.label }}</text></view>
              </view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">◉</text>
                <view><text class="setting-name">语言</text><text class="setting-desc">{{ settingsStore.language === 'zh-CN' ? '简体中文' : 'English' }}</text></view>
              </view>
              <view class="btn small-btn" @click="toggleLanguage"><text>切换</text></view>
            </view>
          </view>

          <!-- Sync & Backup -->
          <view class="settings-group">
            <text class="group-title">同步与备份</text>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">↻</text>
                <view><text class="setting-name">自动同步</text><text class="setting-desc">数据变更后自动同步到云端</text></view>
              </view>
              <view class="toggle" :class="{ on: autoSync }" @click="autoSync = !autoSync">
                <view class="toggle-knob"></view>
              </view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">≈</text>
                <view><text class="setting-name">仅 Wi-Fi 同步</text><text class="setting-desc">节省移动数据流量</text></view>
              </view>
              <view class="toggle" :class="{ on: wifiOnly }" @click="wifiOnly = !wifiOnly">
                <view class="toggle-knob"></view>
              </view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">↑</text>
                <view><text class="setting-name">手动同步</text><text class="setting-desc">立即同步本地数据到云端</text></view>
              </view>
              <view class="btn small-btn" :class="{ syncing: isSyncing }" @click="handleSync"><text>{{ isSyncing ? '同步中...' : '立即同步' }}</text></view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">↗</text>
                <view><text class="setting-name">导出数据</text><text class="setting-desc">导出所有知识块和任务为 JSON</text></view>
              </view>
              <view class="btn small-btn" @click="handleExport"><text>导出</text></view>
            </view>
          </view>

          <!-- AI Usage Guard B -->
          <view class="settings-group">
            <text class="group-title">AI 使用额度</text>
            <view class="setting-row" style="display: block; padding: 16px;">
              <view v-if="loadingAiUsage" style="color: var(--text-secondary); font-size: 13px;">加载中...</view>
              <view v-else-if="aiUsageError" style="color: #ff3b30; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                <text>{{ aiUsageError }}</text>
                <view @click="fetchAiUsage" style="color: var(--primary); padding: 4px 8px;">重试</view>
              </view>
              <view v-else-if="aiUsage" style="display: flex; flex-direction: column; gap: 16px;">
                <view style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
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
                <view style="background: var(--bg-hover); padding: 12px; border-radius: 8px;">
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
          <!-- AI Engine -->
          <view class="settings-group">
            <text class="group-title">AI 引擎</text>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">∥</text>
                <view><text class="setting-name">自动标签</text><text class="setting-desc">AI 自动为知识块生成标签</text></view>
              </view>
              <view class="toggle" :class="{ on: autoTag }" @click="autoTag = !autoTag">
                <view class="toggle-knob"></view>
              </view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">⊕</text>
                <view><text class="setting-name">API Key</text><text class="setting-desc">{{ hasApiKey ? '已配置' : '未配置' }}</text></view>
              </view>
              <view class="btn small-btn" @click="showApiKeyModal = true"><text>配置</text></view>
            </view>
          </view>

          <!-- Notifications -->
          <view class="settings-group">
            <text class="group-title">通知提醒</text>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">◷</text>
                <view><text class="setting-name">任务提醒</text><text class="setting-desc">任务开始前 10 分钟提醒</text></view>
              </view>
              <view class="toggle" :class="{ on: taskReminder }" @click="taskReminder = !taskReminder">
                <view class="toggle-knob"></view>
              </view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">⊞</text>
                <view><text class="setting-name">周报</text><text class="setting-desc">每周日发送学习周报</text></view>
              </view>
              <view class="toggle" :class="{ on: weeklyReport }" @click="weeklyReport = !weeklyReport">
                <view class="toggle-knob"></view>
              </view>
            </view>
          </view>

          <!-- Danger Zone -->
          <view class="settings-group danger-zone">
            <text class="group-title">危险操作</text>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">∅</text>
                <view><text class="setting-name">清除缓存</text><text class="setting-desc">清除本地缓存数据</text></view>
              </view>
              <view class="btn small-btn danger" @click="handleClearCache"><text>清除</text></view>
            </view>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">→</text>
                <view><text class="setting-name">退出登录</text><text class="setting-desc">清除登录状态</text></view>
              </view>
              <view class="btn small-btn danger" @click="handleLogout"><text>退出</text></view>
            </view>
          </view>
        </view>
      </view>

      <!-- API Key Modal -->
      <view v-if="showApiKeyModal" class="modal-overlay" @click="showApiKeyModal = false" @touchmove.stop.prevent>
        <view class="modal-card" @click.stop>
          <view class="modal-header">
            <text class="modal-title">配置 API Key</text>
            <view class="modal-close" @click="showApiKeyModal = false"><text>×</text></view>
          </view>
          <view class="modal-body">
            <text class="form-label">OpenAI 兼容 API Key</text>
            <input class="form-input" v-model="apiKeyInput" placeholder="sk-..." type="text" cursor-spacing="20" />
            <text class="form-hint">支持 OpenAI、DeepSeek 等兼容接口</text>
          </view>
          <view class="modal-footer">
            <view class="btn secondary-btn" @click="showApiKeyModal = false"><text>取消</text></view>
            <view class="btn primary-btn" @click="saveApiKey"><text>保存</text></view>
          </view>
        </view>
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useAiUsage } from '@/utils/useAiUsage'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSyncStore } from '@/store/useSyncStore'
import { refreshAiConfig, setAiConfig } from '@/api/aiClient'

const authStore = useAuthStore()

const { aiUsage, loadingAiUsage, aiUsageError, fetchAiUsage } = useAiUsage()

const blockStore = useBlockStore()
const settingsStore = useSettingsStore()
const syncStore = useSyncStore()
const { recentBlocks } = storeToRefs(blockStore)

const isSyncing = ref(false)
const showApiKeyModal = ref(false)
const apiKeyInput = ref('')
const compactLayout = ref(false)
const autoSync = ref(true)
const wifiOnly = ref(false)
const autoTag = ref(true)
const taskReminder = ref(true)
const weeklyReport = ref(false)
const hasApiKey = ref(false)

const avatarLetter = computed(() => (authStore.username || 'U').charAt(0).toUpperCase())
const fontSizeLabel = computed(() => ({ small: '小', medium: '中', large: '大' })[settingsStore.fontSize] || '中')
const fontSizeOptions: Array<{ value: 'small' | 'medium' | 'large'; label: string }> = [{ value: 'small', label: '小' }, { value: 'medium', label: '中' }, { value: 'large', label: '大' }]
const handleSync = async () => {
  if (isSyncing.value) return
  isSyncing.value = true
  try { await syncStore.triggerSync(); uni.showToast({ title: '同步完成', icon: 'success' }) }
  catch { uni.showToast({ title: '同步失败', icon: 'none' }) }
  finally { isSyncing.value = false }
}

const handleExport = () => {
  const data = { blocks: recentBlocks.value, exportTime: new Date().toISOString() }
  uni.setClipboardData({ data: JSON.stringify(data, null, 2), success: () => uni.showToast({ title: '数据已复制到剪贴板', icon: 'success' }) })
}

const toggleLanguage = () => {
  settingsStore.language = settingsStore.language === 'zh-CN' ? 'en-US' : 'zh-CN'
  uni.showToast({ title: settingsStore.language === 'zh-CN' ? '已切换中文' : 'Switched to English', icon: 'none' })
}

const saveApiKey = async () => {
  try {
    await setAiConfig({ apiKey: apiKeyInput.value })
    hasApiKey.value = true
    apiKeyInput.value = ''
    showApiKeyModal.value = false
    uni.showToast({ title: 'API Key 已安全保存', icon: 'success' })
  } catch {
    uni.showToast({ title: 'API Key 保存失败', icon: 'none' })
  }
}

const handleClearCache = () => {
  uni.showModal({ title: '确认清除', content: '将清除本地缓存', success: (res) => { if (res.confirm) uni.showToast({ title: '缓存已清除', icon: 'success' }) } })
}

const handleLogout = () => {
  uni.showModal({ title: '确认退出', content: '退出后需要重新登录', success: (res) => { if (res.confirm) { authStore.logout(); uni.reLaunch({ url: '/pages/tablet/login/index' }) } } })
}

onMounted(async () => {
  await blockStore.fetchBlocks()
  try {
    hasApiKey.value = (await refreshAiConfig()).hasApiKey
  } catch {
    hasApiKey.value = false
  }
})
</script>

<style scoped>
.t-profile { display: flex; flex-direction: column; width: 100%; height: 100%; padding: 40rpx; box-sizing: border-box; background: var(--color-zen-ivory, #F9F9F7); }
.header { margin-bottom: 30rpx; }
.page-title { font-size: 44rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.content-area { flex: 1; display: flex; gap: 48rpx; height: 0; }

.left-panel { flex: 3; min-width: 320px; display: flex; flex-direction: column; gap: 20rpx; overflow-y: auto; }
.user-card { background: var(--color-zen-white, #FFFFFF); border: 1px solid var(--color-zen-hairline, #E6E6E4); border-radius: 36rpx; padding: 40rpx 28rpx; display: flex; flex-direction: column; align-items: center; gap: 12rpx; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02); }
.avatar-area { position: relative; margin-bottom: 4rpx; }
.avatar-ring { width: 100rpx; height: 100rpx; border-radius: 50%; border: 5rpx solid #7D9372; display: flex; align-items: center; justify-content: center; animation: ring-pulse 3s ease-in-out infinite; }
@keyframes ring-pulse { 0%,100%{border-color:#7D9372}50%{border-color:var(--color-zen-hairline, #E6E6E4)} }
.avatar { width: 84rpx; height: 84rpx; border-radius: 50%; background: #7D9372; display: flex; align-items: center; justify-content: center; }
.avatar-text { font-size: 40rpx; font-weight: 800; color: var(--color-zen-white, #FFFFFF); }
.online-dot { position: absolute; bottom: 2rpx; right: 2rpx; width: 20rpx; height: 20rpx; border-radius: 50%; background: #4b8054; border: 3rpx solid var(--color-zen-white, #FFFFFF); }
.username { font-size: 32rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.right-panel { flex: 7; display: flex; flex-direction: column; gap: 20rpx; overflow-y: auto; }

.settings-group { background: var(--color-zen-white, #FFFFFF); border: 1px solid var(--color-zen-hairline, #E6E6E4); border-radius: 36rpx; padding: 28rpx; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02); }
.settings-group.danger-zone { border-color: rgba(176, 85, 85, 0.3); }
.group-title { font-size: 26rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); display: block; margin-bottom: 12rpx; padding-bottom: 12rpx; border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4); font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 0; }
.setting-info { display: flex; align-items: center; gap: 16rpx; }
.setting-icon { font-size: 28rpx; color: #7D9372; }
.setting-name { font-size: 26rpx; font-weight: 700; color: var(--color-zen-graphite, #1C1C1A); display: block; }
.setting-desc { font-size: 22rpx; color: var(--color-zen-stone, #A8A8A5); display: block; font-weight: 500; }

.toggle { width: 80rpx; height: 44rpx; border-radius: 999rpx; background: var(--color-zen-ivory, #F9F9F7); border: 1px solid var(--color-zen-hairline, #E6E6E4); position: relative; transition: background 0.2s; cursor: pointer; }
.toggle.on { background: #7D9372; }
.toggle-knob { width: 34rpx; height: 34rpx; border-radius: 50%; background: var(--color-zen-white, #FFFFFF); position: absolute; top: 4rpx; left: 4rpx; transition: left 0.2s; box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1); }
.toggle.on .toggle-knob { left: 40rpx; }

.font-size-options { display: flex; gap: 8rpx; }
.font-opt { padding: 8rpx 16rpx; border-radius: 999rpx; background: var(--color-zen-ivory, #F9F9F7); border: 1px solid var(--color-zen-hairline, #E6E6E4); font-size: 22rpx; font-weight: 600; color: var(--color-zen-stone, #A8A8A5); cursor: pointer; transition: all 0.2s; }
.font-opt.active { background: #7D9372; color: var(--color-zen-white, #FFFFFF); border-color: #7D9372; }

.btn { padding: 12rpx 24rpx; border-radius: 999rpx; font-weight: 600; font-size: 24rpx; cursor: pointer; transition: all 0.2s; }
.small-btn { padding: 10rpx 20rpx; font-size: 22rpx; background: var(--color-zen-ivory, #F9F9F7); border: 1px solid var(--color-zen-hairline, #E6E6E4); color: var(--color-zen-graphite, #1C1C1A); }
.small-btn.danger { color: #b05555; border-color: rgba(176, 85, 85, 0.4); }
.small-btn.syncing { opacity: 0.6; }
.primary-btn { background: #7D9372; color: var(--color-zen-white, #FFFFFF); }
.secondary-btn { background: var(--color-zen-ivory, #F9F9F7); color: var(--color-zen-graphite, #1C1C1A); border: 1px solid var(--color-zen-hairline, #E6E6E4); }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { width: 500rpx; background: var(--color-zen-white, #FFFFFF); border-radius: 40rpx; border: 1px solid var(--color-zen-hairline, #E6E6E4); box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 28rpx 32rpx; border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4); }
.modal-title { font-size: 32rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.modal-close { width: 48rpx; height: 48rpx; border-radius: 50%; background: var(--color-zen-ivory, #F9F9F7); display: flex; align-items: center; justify-content: center; font-size: 24rpx; color: var(--color-zen-stone, #A8A8A5); cursor: pointer; }
.modal-body { padding: 28rpx 32rpx; }
.form-label { font-size: 24rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); display: block; margin-bottom: 12rpx; font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.form-input { width: 100%; padding: 24rpx 28rpx; background: var(--color-zen-ivory, #F9F9F7); border: 1px solid var(--color-zen-hairline, #E6E6E4); border-radius: 20rpx; font-size: 26rpx; color: var(--color-zen-graphite, #1C1C1A); box-sizing: border-box; min-height: 40rpx; line-height: 1.5; }
.form-hint { font-size: 20rpx; color: var(--color-zen-stone, #A8A8A5); display: block; margin-top: 8rpx; font-weight: 600; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12rpx; padding: 20rpx 32rpx; border-top: 1px solid var(--color-zen-hairline, #E6E6E4); }
</style>


