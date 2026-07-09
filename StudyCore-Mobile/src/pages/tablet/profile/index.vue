<template>
  <TabletLayout>
    <view class="t-profile">
      <view class="header">
        <text class="page-title">个人中心</text>
      </view>

      <view class="content-area">
        <!-- Left Panel: User Card & Stats -->
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
            <view class="level-badge"><text>Lv.{{ userLevel }}</text></view>
            <text class="streak-text">连续学习 {{ streakDays }} 天</text>
          </view>

          <!-- Stats Grid -->
          <view class="stats-grid">
            <view class="stat-card">
              <text class="stat-value">{{ recentBlocks.length }}</text>
              <text class="stat-label">知识块</text>
            </view>
            <view class="stat-card">
              <text class="stat-value">{{ totalTasks }}</text>
              <text class="stat-label">任务总数</text>
            </view>
            <view class="stat-card">
              <text class="stat-value">{{ taskStore.totalFocusHours }}</text>
              <text class="stat-label">专注时长</text>
            </view>
            <view class="stat-card">
              <text class="stat-value">{{ weeklyNew }}</text>
              <text class="stat-label">本周新增</text>
            </view>
          </view>

          <!-- Weekly Bar Chart -->
          <view class="chart-card">
            <text class="chart-title">本周学习量</text>
            <view class="bar-chart">
              <view v-for="(day, i) in weeklyData" :key="i" class="bar-col">
                <view class="bar-wrapper">
                  <view class="bar-fill" :style="{ height: day.percent + '%' }"></view>
                </view>
                <text class="bar-label">{{ day.label }}</text>
              </view>
            </view>
          </view>

          <!-- Subject Distribution -->
          <view class="dist-card">
            <text class="dist-title">学科分布</text>
            <view class="dist-list">
              <view v-for="subj in subjectDistribution" :key="subj.name" class="dist-item">
                <view class="dist-header">
                  <text class="dist-icon">{{ subj.icon }}</text>
                  <text class="dist-name">{{ subj.name }}</text>
                  <text class="dist-count">{{ subj.count }}</text>
                </view>
                <view class="dist-bar">
                  <view class="dist-fill" :style="{ width: subj.percent + '%', background: subj.color }"></view>
                </view>
              </view>
            </view>
          </view>

          <!-- AI Insight -->
          <view class="insight-card">
            <text class="insight-icon">◇</text>
            <text class="insight-text">{{ aiInsight }}</text>
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

          <!-- AI Engine -->
          <view class="settings-group">
            <text class="group-title">AI 引擎</text>
            <view class="setting-row">
              <view class="setting-info">
                <text class="setting-icon">◈</text>
                <view><text class="setting-name">RAG 增强</text><text class="setting-desc">使用知识库增强 AI 回答</text></view>
              </view>
              <view class="toggle" :class="{ on: ragEnabled }" @click="ragEnabled = !ragEnabled">
                <view class="toggle-knob"></view>
              </view>
            </view>
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
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSyncStore } from '@/store/useSyncStore'
import { getAiConfig, setAiConfig } from '@/api/aiClient'

const authStore = useAuthStore()
const blockStore = useBlockStore()
const subjectStore = useSubjectStore()
const taskStore = useTaskStore()
const settingsStore = useSettingsStore()
const syncStore = useSyncStore()
const { recentBlocks } = storeToRefs(blockStore)
const { subjects } = storeToRefs(subjectStore)

const isSyncing = ref(false)
const showApiKeyModal = ref(false)
const apiKeyInput = ref('')
const compactLayout = ref(false)
const autoSync = ref(true)
const wifiOnly = ref(false)
const ragEnabled = ref(true)
const autoTag = ref(true)
const taskReminder = ref(true)
const weeklyReport = ref(false)

const avatarLetter = computed(() => (authStore.username || 'U').charAt(0).toUpperCase())
const userLevel = computed(() => {
  const total = recentBlocks.value.length + taskStore.completedCount
  if (total < 10) return 1; if (total < 50) return 2; if (total < 100) return 3; if (total < 200) return 4; return 5
})
const totalTasks = computed(() => taskStore.pendingTasks.length + taskStore.timeSlots.filter(s => s.task).length)
const streakDays = computed(() => {
  // Simple streak: count consecutive days with blocks
  const dates = new Set(recentBlocks.value.map(b => new Date(b.time).toDateString()))
  let streak = 0
  const d = new Date()
  while (dates.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }
  return streak
})
const weeklyNew = computed(() => {
  const weekAgo = Date.now() - 7 * 86400000
  return recentBlocks.value.filter(b => new Date(b.time).getTime() > weekAgo).length
})
const fontSizeLabel = computed(() => ({ small: '小', medium: '中', large: '大' })[settingsStore.fontSize] || '中')
const fontSizeOptions: Array<{ value: 'small' | 'medium' | 'large'; label: string }> = [{ value: 'small', label: '小' }, { value: 'medium', label: '中' }, { value: 'large', label: '大' }]
const hasApiKey = computed(() => !!getAiConfig().apiKey)

const aiInsight = computed(() => {
  const blocks = recentBlocks.value.length
  const tasks = totalTasks.value
  if (blocks === 0 && tasks === 0) return '开始创建知识块和任务，AI 会为你生成学习洞察。'
  if (blocks > 10 && taskStore.completedCount > 5) return '你的学习节奏很好！建议适当增加复习频率以巩固记忆。'
  if (tasks > 10 && taskStore.pendingCount > 8) return '待办任务较多，建议优先处理高负荷任务，适当延后低优先级任务。'
  return `已积累 ${blocks} 个知识块，完成 ${taskStore.completedCount} 个任务。继续保持！`
})

const weeklyData = computed(() => {
  const days = ['一', '二', '三', '四', '五', '六', '日']
  const today = new Date().getDay()
  const todayIdx = today === 0 ? 6 : today - 1
  const maxCount = Math.max(...days.map((_, i) => {
    if (i > todayIdx) return 0
    const d = new Date(); d.setDate(d.getDate() - (todayIdx - i))
    return recentBlocks.value.filter(b => new Date(b.time).toDateString() === d.toDateString()).length
  }), 1)
  return days.map((label, i) => {
    if (i > todayIdx) return { label, percent: 0 }
    const d = new Date(); d.setDate(d.getDate() - (todayIdx - i))
    const count = recentBlocks.value.filter(b => new Date(b.time).toDateString() === d.toDateString()).length
    return { label, percent: Math.round((count / maxCount) * 100) }
  })
})

const subjectDistribution = computed(() => {
  const total = recentBlocks.value.length || 1
  return subjects.value.map(s => ({
    name: s.name, icon: s.icon, color: s.color,
    count: recentBlocks.value.filter(b => b.subjectId === s.id).length,
    percent: Math.round((recentBlocks.value.filter(b => b.subjectId === s.id).length / total) * 100)
  })).sort((a, b) => b.count - a.count)
})

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

const saveApiKey = () => {
  setAiConfig({ apiKey: apiKeyInput.value })
  showApiKeyModal.value = false
  uni.showToast({ title: 'API Key 已保存', icon: 'success' })
}

const handleClearCache = () => {
  uni.showModal({ title: '确认清除', content: '将清除本地缓存', success: (res) => { if (res.confirm) uni.showToast({ title: '缓存已清除', icon: 'success' }) } })
}

const handleLogout = () => {
  uni.showModal({ title: '确认退出', content: '退出后需要重新登录', success: (res) => { if (res.confirm) { authStore.logout(); uni.reLaunch({ url: '/pages/tablet/login/index' }) } } })
}

onMounted(async () => {
  await blockStore.fetchBlocks()
  await subjectStore.loadSubjects()
  await taskStore.fetchTasks()
  const config = getAiConfig()
  apiKeyInput.value = config.apiKey
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
.level-badge { padding: 4rpx 16rpx; border-radius: 999rpx; background: rgba(125, 147, 114, 0.12); font-size: 22rpx; font-weight: 700; color: #7D9372; border: 1px solid rgba(125, 147, 114, 0.3); }
.streak-text { font-size: 22rpx; color: var(--color-zen-stone, #A8A8A5); font-weight: 600; }

.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; }
.stat-card { background: var(--color-zen-white, #FFFFFF); border: 1px solid var(--color-zen-hairline, #E6E6E4); border-radius: 28rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 4rpx; box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02); }
.stat-value { font-size: 36rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.stat-label { font-size: 20rpx; color: var(--color-zen-stone, #A8A8A5); font-weight: 600; }

.chart-card { background: var(--color-zen-white, #FFFFFF); border: 1px solid var(--color-zen-hairline, #E6E6E4); border-radius: 32rpx; padding: 24rpx; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02); }
.chart-title { font-size: 26rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); display: block; margin-bottom: 16rpx; font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.bar-chart { display: flex; gap: 8rpx; align-items: flex-end; height: 120rpx; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.bar-wrapper { width: 100%; height: 100rpx; background: var(--color-zen-ivory, #F9F9F7); border-radius: 6rpx; display: flex; align-items: flex-end; overflow: hidden; }
.bar-fill { width: 100%; background: #7D9372; border-radius: 6rpx 6rpx 0 0; min-height: 4rpx; transition: height 0.3s; }
.bar-label { font-size: 18rpx; color: var(--color-zen-stone, #A8A8A5); font-weight: 600; }

.dist-card { background: var(--color-zen-white, #FFFFFF); border: 1px solid var(--color-zen-hairline, #E6E6E4); border-radius: 32rpx; padding: 24rpx; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02); }
.dist-title { font-size: 26rpx; font-weight: 800; color: var(--color-zen-graphite, #1C1C1A); display: block; margin-bottom: 12rpx; font-family: "Outfit", "Plus Jakarta Sans", sans-serif; }
.dist-list { display: flex; flex-direction: column; gap: 12rpx; }
/* .dist-item */
.dist-header { display: flex; align-items: center; gap: 8rpx; margin-bottom: 4rpx; }
.dist-icon { font-size: 22rpx; }
.dist-name { flex: 1; font-size: 24rpx; font-weight: 600; color: var(--color-zen-graphite, #1C1C1A); }
.dist-count { font-size: 20rpx; color: var(--color-zen-stone, #A8A8A5); font-weight: 600; }
.dist-bar { height: 8rpx; background: var(--color-zen-ivory, #F9F9F7); border-radius: 4rpx; overflow: hidden; }
.dist-fill { height: 100%; border-radius: 4rpx; transition: width 0.3s; }

.insight-card { background: var(--color-zen-white, #FFFFFF); border: 1px solid var(--color-zen-hairline, #E6E6E4); border-radius: 32rpx; padding: 24rpx; display: flex; gap: 12rpx; align-items: flex-start; box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02); }
.insight-icon { font-size: 24rpx; color: #7D9372; font-weight: 800; }
.insight-text { font-size: 22rpx; color: var(--color-zen-stone, #A8A8A5); line-height: 1.5; font-weight: 600; }

.insight-icon { font-size: 24rpx; color: #7D9372; font-weight: 800; }
.insight-text { font-size: 22rpx; color: var(--color-zen-stone, #A8A8A5); line-height: 1.5; font-weight: 600; }

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
