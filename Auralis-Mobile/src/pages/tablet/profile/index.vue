<template>
  <TabletLayout>
    <view class="t-profile">
      <view class="profile-header">
        <text class="page-title">个人中心</text>
        <view class="logout-pill" @click="handleLogout">
          <LineIcon name="logout" size="26rpx" color="var(--color-danger)" />
          <text>退出登录</text>
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="profile-scroll">
        <view class="columns-grid">
          <view class="column-stack">
            <view class="panel-card zen-card">
              <view class="card-head">
                <LineIcon name="avatar" size="30rpx" color="var(--color-zen-sage)" />
                <text class="card-title">个人资料与同步</text>
              </view>

              <view class="user-banner">
                <view class="avatar-circle">
                  <text class="avatar-letter">{{ avatarLetter }}</text>
                </view>
                <view class="user-meta">
                  <text class="user-display">{{ displayName }}</text>
                  <text class="user-handle">@{{ authStore.username || 'auralis' }}</text>
                </view>
              </view>

              <view class="inline-field">
                <input
                  class="zen-input"
                  v-model="nameDraft"
                  maxlength="64"
                  placeholder="显示名称"
                  :disabled="savingName"
                />
                <view class="pill-action" :class="{ disabled: savingName }" @click="saveDisplayName">
                  <text>{{ savingName ? '保存中' : '更新名称' }}</text>
                </view>
              </view>

              <view class="sync-row">
                <view>
                  <text class="sub-heading">云端数据同步</text>
                  <text class="sub-hint">{{ syncStore.lastError || syncTimeLabel }}</text>
                </view>
                <view class="pill-action" @click="triggerManualSync">
                  <LineIcon name="sync" size="24rpx" color="var(--color-zen-sage)" />
                  <text>{{ syncStore.isSyncing ? '同步中' : '立即同步' }}</text>
                </view>
              </view>
            </view>

            <view class="panel-card zen-card">
              <view class="card-head">
                <LineIcon name="lock" size="30rpx" color="var(--color-zen-sage)" />
                <text class="card-title">修改登录密码</text>
              </view>

              <view class="form-stack">
                <input class="zen-input" v-model="pwdForm.currentPassword" password placeholder="当前密码" :disabled="savingPwd" />
                <input class="zen-input" v-model="pwdForm.newPassword" password placeholder="新密码（至少 8 位含大小写和符号）" :disabled="savingPwd" />
                <input class="zen-input" v-model="pwdForm.confirmPassword" password placeholder="确认新密码" :disabled="savingPwd" />
                <text v-if="pwdError" class="error-text">{{ pwdError }}</text>
                <view class="primary-btn" :class="{ disabled: savingPwd }" @click="submitPasswordChange">
                  <text>{{ savingPwd ? '提交中…' : '更新密码' }}</text>
                </view>
              </view>
            </view>

            <view class="panel-card zen-card">
              <view class="card-head-between">
                <view class="card-head">
                  <LineIcon name="device" size="30rpx" color="var(--color-zen-sage)" />
                  <text class="card-title">已登录设备</text>
                </view>
                <text class="link-action" @click="loadSessions">刷新</text>
              </view>

              <view v-if="loadingSessions" class="empty-hint">正在加载设备列表…</view>
              <view v-else-if="sessionsList.length === 0" class="empty-hint">暂无设备记录</view>
              <view v-else class="sessions-list">
                <view v-for="s in sessionsList" :key="s.id" class="session-row">
                  <view class="session-info">
                    <text class="session-name">{{ s.deviceName || '未知设备' }} · {{ s.platform || 'UNKNOWN' }}</text>
                    <text class="session-sub">
                      {{ s.current ? '当前正在使用' : `最近活跃：${formatTime(s.lastUsedAt || s.createdAt)}` }}
                    </text>
                  </view>
                  <view v-if="!s.current && s.id" class="revoke-pill" @click="revokeDevice(s.id)">下线</view>
                </view>
                <view
                  v-if="sessionsList.some(item => !item.current)"
                  class="revoke-all-btn"
                  @click="revokeOtherDevices"
                >
                  <text>下线全部其他设备</text>
                </view>
              </view>
            </view>
          </view>

          <view class="column-stack">
            <view class="panel-card zen-card">
              <view class="card-head-between">
                <view class="card-head">
                  <LineIcon name="chart" size="30rpx" color="var(--color-zen-sage)" />
                  <text class="card-title">AI 使用额度</text>
                </view>
                <text class="link-action" @click="fetchAiUsage">刷新</text>
              </view>

              <view v-if="loadingAiUsage && !aiUsage" class="empty-hint">正在加载额度信息…</view>
              <view v-else-if="aiUsageError" class="error-row">
                <text class="error-text">{{ aiUsageError }}</text>
                <text class="link-action" @click="fetchAiUsage">重试</text>
              </view>
              <view v-else-if="aiUsage" class="quota-stack">
                <view class="quota-block">
                  <view class="quota-top">
                    <text class="quota-title">每小时额度</text>
                    <text class="quota-nums">剩余 {{ aiUsage.hourly.remainingTokens }} / {{ aiUsage.hourly.limitTokens }}</text>
                  </view>
                  <view class="quota-track">
                    <view class="quota-fill" :style="{ width: usagePercent(aiUsage.hourly.chargedTokens, aiUsage.hourly.limitTokens) }"></view>
                  </view>
                  <text class="quota-reset">重置时间：{{ formatTime(aiUsage.hourly.resetAt) }}</text>
                </view>

                <view class="quota-block">
                  <view class="quota-top">
                    <text class="quota-title">每日额度</text>
                    <text class="quota-nums">剩余 {{ aiUsage.daily.remainingTokens }} / {{ aiUsage.daily.limitTokens }}</text>
                  </view>
                  <view class="quota-track">
                    <view class="quota-fill" :style="{ width: usagePercent(aiUsage.daily.chargedTokens, aiUsage.daily.limitTokens) }"></view>
                  </view>
                  <text class="quota-reset">重置时间：{{ formatTime(aiUsage.daily.resetAt) }}</text>
                </view>
              </view>
            </view>

            <view class="panel-card zen-card">
              <view class="card-head">
                <LineIcon name="key" size="30rpx" color="var(--color-zen-sage)" />
                <text class="card-title">模型服务与 BYOK</text>
              </view>

              <view class="chips-row">
                <view
                  v-for="p in providers"
                  :key="p.id"
                  class="chip-item"
                  :class="{ active: aiForm.provider === p.id }"
                  @click="selectProvider(p.id)"
                >
                  <text>{{ p.label }}</text>
                </view>
              </view>

              <view class="form-stack">
                <input
                  class="zen-input"
                  v-model="aiForm.baseUrl"
                  placeholder="API Base URL（可选，默认使用供应商官方地址）"
                  :disabled="savingAi"
                />
                <input
                  class="zen-input"
                  v-model="aiForm.apiKey"
                  password
                  :placeholder="aiForm.hasApiKey ? '已配置密钥（留空则保留现有密钥）' : '输入 API Key'"
                  :disabled="savingAi"
                />
                <input
                  class="zen-input"
                  v-model="aiForm.model"
                  placeholder="对话模型名称（如 deepseek-chat / gpt-4o-mini）"
                  :disabled="savingAi"
                />

                <view v-if="availableModels.length > 0" class="chips-row">
                  <view
                    v-for="model in availableModels.slice(0, 10)"
                    :key="model"
                    class="chip-item"
                    :class="{ active: aiForm.model === model }"
                    @click="aiForm.model = model"
                  >
                    <text>{{ model }}</text>
                  </view>
                </view>

                <view class="btn-row">
                  <view class="secondary-btn" @click="fetchModels">拉取模型列表</view>
                  <view class="secondary-btn" @click="testConnection">测试连接</view>
                </view>

                <view class="primary-btn" :class="{ disabled: savingAi }" @click="saveAiSettings">
                  <text>{{ savingAi ? '保存中…' : '保存模型配置' }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { aiApi, type AiProviderType, type AiSettingsView } from '@/api/aiApi'
import { refreshAiConfig, setAiConfig } from '@/api/aiClient'
import type { components } from '@/api/generated/schema'
import { useAuthApi } from '@/api/useAuthApi'
import LineIcon from '@/components/LineIcon.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { validatePasswordStrength } from '@/utils/passwordValidation'
import { useAiUsage } from '@/utils/useAiUsage'

type SessionResponse = components['schemas']['SessionResponse']

const authStore = useAuthStore()
const syncStore = useSyncStore()
const { aiUsage, loadingAiUsage, aiUsageError, fetchAiUsage } = useAiUsage()

const displayName = computed(() => authStore.user?.displayName || authStore.username || '同学')
const avatarLetter = computed(() => displayName.value.trim().slice(0, 1).toUpperCase() || 'A')

const nameDraft = ref(authStore.user?.displayName || authStore.username || '')
const savingName = ref(false)

const syncTimeLabel = computed(() => {
  if (!syncStore.lastSyncedAt) return '同步日程、待办、知识块与学科结构'
  return `上次同步：${formatTime(syncStore.lastSyncedAt)}`
})

function formatTime(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function usagePercent(charged: number, limit: number): string {
  if (!limit || limit <= 0) return '0%'
  return `${Math.min(100, Math.max(0, Math.round((charged / limit) * 100)))}%`
}

async function saveDisplayName() {
  if (savingName.value) return
  const trimmed = nameDraft.value.trim()
  if (!trimmed) {
    uni.showToast({ title: '请输入显示名称', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  savingName.value = true
  try {
    await useAuthApi.updateProfile({
      baseVersion: Number(authStore.user?.version ?? 0),
      displayName: trimmed,
    })
    await authStore.restoreSession()
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: '显示名称已更新', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '名称更新失败', icon: 'none' })
  } finally {
    savingName.value = false
  }
}

async function triggerManualSync() {
  if (syncStore.isSyncing) return
  await syncStore.triggerSync()
  uni.showToast({ title: syncStore.lastError ? '同步未完成，请重试' : '数据同步完成', icon: 'none' })
}

// Password Change
const savingPwd = ref(false)
const pwdError = ref('')
const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

async function submitPasswordChange() {
  if (savingPwd.value) return
  pwdError.value = ''
  if (!pwdForm.currentPassword) {
    pwdError.value = '请输入当前密码。'
    return
  }
  const strengthErr = validatePasswordStrength(pwdForm.newPassword)
  if (strengthErr) {
    pwdError.value = strengthErr
    return
  }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    pwdError.value = '两次输入的新密码不一致。'
    return
  }
  const generation = authStore.getLoginGeneration()
  savingPwd.value = true
  try {
    await useAuthApi.changePassword({
      baseVersion: Number(authStore.user?.version ?? 0),
      currentPassword: pwdForm.currentPassword,
      newPassword: pwdForm.newPassword,
    })
    await authStore.restoreSession()
    if (generation !== authStore.getLoginGeneration()) return
    pwdForm.currentPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
    uni.showToast({ title: '密码已更新', icon: 'none' })
  } catch (err) {
    pwdError.value = err instanceof Error ? err.message : '密码修改失败，请检查当前密码'
  } finally {
    savingPwd.value = false
  }
}

// Device Sessions
const loadingSessions = ref(false)
const sessionsList = ref<SessionResponse[]>([])

async function loadSessions() {
  const generation = authStore.getLoginGeneration()
  loadingSessions.value = true
  try {
    const res = await useAuthApi.sessions()
    if (generation !== authStore.getLoginGeneration()) return
    sessionsList.value = (res.items || []).filter(item => !item.revokedAt)
  } catch {
    // Keep silent if offline
  } finally {
    loadingSessions.value = false
  }
}

async function revokeDevice(sessionId: string) {
  try {
    await useAuthApi.revokeSession(sessionId)
    sessionsList.value = sessionsList.value.filter(item => item.id !== sessionId)
    uni.showToast({ title: '设备已下线', icon: 'none' })
  } catch {
    uni.showToast({ title: '下线失败，请重试', icon: 'none' })
  }
}

async function revokeOtherDevices() {
  try {
    await useAuthApi.revokeOtherSessions()
    sessionsList.value = sessionsList.value.filter(item => item.current)
    uni.showToast({ title: '已下线其他全部设备', icon: 'none' })
  } catch {
    uni.showToast({ title: '操作失败，请重试', icon: 'none' })
  }
}

// AI BYOK Settings
const providers: Array<{ id: AiProviderType; label: string }> = [
  { id: 'OPENAI_COMPATIBLE', label: 'OpenAI 兼容' },
  { id: 'DEEPSEEK', label: 'DeepSeek' },
  { id: 'SILICONFLOW', label: '硅基流动' },
]

const allAiSettings = ref<AiSettingsView[]>([])
const availableModels = ref<string[]>([])
const savingAi = ref(false)
const aiForm = reactive({
  provider: 'OPENAI_COMPATIBLE' as AiProviderType,
  baseUrl: '',
  apiKey: '',
  model: '',
  hasApiKey: false,
})

function applyProviderDraft(provider: AiProviderType) {
  const match = allAiSettings.value.find(item => item.provider === provider)
  aiForm.provider = provider
  aiForm.baseUrl = match?.baseUrl || ''
  aiForm.model = match?.chatModel || ''
  aiForm.hasApiKey = Boolean(match?.hasApiKey)
  aiForm.apiKey = ''
  availableModels.value = []
}

async function loadAiSettings() {
  const generation = authStore.getLoginGeneration()
  try {
    const list = await aiApi.getSettings()
    if (generation !== authStore.getLoginGeneration()) return
    allAiSettings.value = list
    const preferred = list.find(item => item.hasApiKey)?.provider || list[0]?.provider || 'OPENAI_COMPATIBLE'
    applyProviderDraft(preferred)
  } catch {
    // Keep silent offline
  }
}

function selectProvider(provider: AiProviderType) {
  if (savingAi.value) return
  applyProviderDraft(provider)
}

async function fetchModels() {
  try {
    const res = await aiApi.listModels(aiForm.provider)
    availableModels.value = res.models || []
    if (availableModels.value.length === 0) {
      uni.showToast({ title: '未拉取到可用模型，请先保存有效密钥', icon: 'none' })
    }
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '模型列表拉取失败', icon: 'none' })
  }
}

async function testConnection() {
  try {
    const res = await aiApi.testConnection(aiForm.provider)
    uni.showToast({
      title: res.reachable ? `连接正常 (${res.chatModel || aiForm.provider})` : '连接不可达，请检查配置',
      icon: 'none',
    })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '连接测试失败', icon: 'none' })
  }
}

async function saveAiSettings() {
  if (savingAi.value) return
  const generation = authStore.getLoginGeneration()
  savingAi.value = true
  try {
    await setAiConfig({
      provider: aiForm.provider,
      baseUrl: aiForm.baseUrl.trim(),
      model: aiForm.model.trim(),
      apiKey: aiForm.apiKey.trim(),
    })
    await refreshAiConfig()
    await loadAiSettings()
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: '模型服务配置已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    savingAi.value = false
  }
}

function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号并返回登录页吗？',
    success: async (res) => {
      if (res.confirm) {
        await authStore.logout()
        uni.reLaunch({ url: '/pages/tablet/login/index' })
      }
    },
  })
}

onMounted(() => {
  void loadSessions()
  void loadAiSettings()
})
</script>

<style scoped>
.t-profile {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 40rpx 44rpx;
  box-sizing: border-box;
  background-color: var(--color-bg-primary);
}

.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28rpx;
  flex-shrink: 0;
}

.page-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.logout-pill {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.profile-scroll {
  flex: 1;
  min-height: 0;
}

.columns-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28rpx;
  padding-bottom: 32rpx;
}

.column-stack {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.panel-card {
  padding: 30rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.card-head-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.link-action {
  font-size: var(--font-size-xs);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.user-banner {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.avatar-circle {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-letter {
  font-size: 36rpx;
  font-weight: var(--font-weight-bold);
  color: #FFFFFF;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.user-display {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.user-handle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.inline-field .zen-input {
  flex: 1;
}

.zen-input {
  height: 78rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 18rpx;
  padding: 0 22rpx;
  font-size: var(--font-size-xs);
  color: var(--text-primary);
  box-sizing: border-box;
}

.pill-action {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 24rpx;
  border-radius: 18rpx;
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
  cursor: pointer;
}

.pill-action.disabled {
  opacity: 0.55;
}

.sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding-top: 14rpx;
  border-top: 1px solid var(--border-subtle);
}

.sub-heading {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.sub-hint,
.empty-hint {
  display: block;
  font-size: 22rpx;
  color: var(--text-muted);
  margin-top: 4rpx;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.error-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.error-text {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.primary-btn {
  text-align: center;
  padding: 18rpx 24rpx;
  border-radius: 20rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.primary-btn.disabled {
  opacity: 0.55;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  padding: 16rpx 20rpx;
  background-color: var(--color-bg-primary);
  border-radius: 18rpx;
}

.session-name {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.session-sub {
  display: block;
  font-size: 20rpx;
  color: var(--text-muted);
  margin-top: 4rpx;
}

.revoke-pill {
  padding: 8rpx 18rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  flex-shrink: 0;
}

.revoke-all-btn {
  text-align: center;
  padding: 16rpx;
  border-radius: 18rpx;
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.quota-stack {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.quota-block {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 18rpx 20rpx;
  background-color: var(--color-bg-primary);
  border-radius: 20rpx;
}

.quota-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quota-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.quota-nums {
  font-size: 22rpx;
  font-family: var(--font-family-mono);
  color: var(--text-muted);
}

.quota-track {
  height: 10rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  background: var(--accent-gradient);
}

.quota-reset {
  font-size: 20rpx;
  color: var(--text-muted);
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.chip-item {
  padding: 10rpx 20rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: 22rpx;
  color: var(--text-secondary);
  cursor: pointer;
}

.chip-item.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-bold);
}

.btn-row {
  display: flex;
  gap: 14rpx;
}

.secondary-btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}
</style>
