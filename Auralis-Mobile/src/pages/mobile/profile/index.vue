<template>
  <AppPageLayout anim-origin="slide-right">
    <view class="profile-page">
      <AppHeader title="我的" />

      <scroll-view scroll-y :show-scrollbar="false" class="content-scroll">
        <view class="profile-body">
          <view class="user-card zen-card">
            <view class="avatar-badge">
              <text class="avatar-initial">{{ avatarInitial }}</text>
            </view>
            <view class="user-meta">
              <text class="user-display">{{ displayName }}</text>
              <text class="user-handle">@{{ authStore.username || 'auralis' }}</text>
            </view>
            <view class="edit-name-btn" @click="openNameEditor">
              <LineIcon name="edit" size="30rpx" color="var(--color-zen-sage)" />
            </view>
          </view>

          <view class="section-block">
            <text class="section-label">学习总览</text>
            <StudyMetrics />
          </view>

          <view class="section-block">
            <text class="section-label">跨端同步</text>
            <view class="menu-card zen-card">
              <view class="menu-row" @click="triggerManualSync">
                <view class="row-left">
                  <LineIcon name="sync" size="34rpx" color="var(--color-zen-sage)" />
                  <view class="row-texts">
                    <text class="row-title">立即同步学习数据</text>
                    <text class="row-sub">
                      {{ syncStore.lastError ? `上次异常：${syncStore.lastError}` : syncTimeLabel }}
                    </text>
                  </view>
                </view>
                <view class="row-pill">
                  <text>{{ syncStore.isSyncing ? '同步中' : '同步' }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="section-block">
            <view class="section-head-row">
              <text class="section-label">AI 使用额度</text>
              <text class="section-action" @click="fetchAiUsage">刷新</text>
            </view>
            <view class="quota-card zen-card">
              <view v-if="loadingAiUsage && !aiUsage" class="quota-status">正在加载 AI 额度…</view>
              <view v-else-if="aiUsageError" class="quota-error">
                <text>{{ aiUsageError }}</text>
                <text class="section-action" @click="fetchAiUsage">重试</text>
              </view>
              <view v-else-if="aiUsage" class="quota-list">
                <view class="quota-item">
                  <view class="quota-top">
                    <text class="quota-name">每小时额度</text>
                    <text class="quota-nums">剩余 {{ aiUsage.hourly.remainingTokens }} / {{ aiUsage.hourly.limitTokens }}</text>
                  </view>
                  <view class="quota-track">
                    <view class="quota-fill" :style="{ width: usagePercent(aiUsage.hourly.chargedTokens, aiUsage.hourly.limitTokens) }"></view>
                  </view>
                  <text class="quota-reset">重置于 {{ formatResetTime(aiUsage.hourly.resetAt) }}</text>
                </view>

                <view class="quota-item">
                  <view class="quota-top">
                    <text class="quota-name">每日额度</text>
                    <text class="quota-nums">剩余 {{ aiUsage.daily.remainingTokens }} / {{ aiUsage.daily.limitTokens }}</text>
                  </view>
                  <view class="quota-track">
                    <view class="quota-fill" :style="{ width: usagePercent(aiUsage.daily.chargedTokens, aiUsage.daily.limitTokens) }"></view>
                  </view>
                  <text class="quota-reset">重置于 {{ formatResetTime(aiUsage.daily.resetAt) }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="section-block">
            <text class="section-label">账户与安全</text>
            <view class="menu-card zen-card">
              <view class="menu-row" @click="openAiConfigSheet">
                <view class="row-left">
                  <LineIcon name="key" size="34rpx" color="var(--text-secondary)" />
                  <view class="row-texts">
                    <text class="row-title">模型服务与 BYOK</text>
                    <text class="row-sub">{{ aiSummaryLabel }}</text>
                  </view>
                </view>
                <LineIcon name="chevron-right" size="28rpx" color="var(--text-muted)" />
              </view>

              <view class="menu-divider"></view>

              <view class="menu-row" @click="openPasswordSheet">
                <view class="row-left">
                  <LineIcon name="lock" size="34rpx" color="var(--text-secondary)" />
                  <view class="row-texts">
                    <text class="row-title">修改登录密码</text>
                    <text class="row-sub">更新密码并保持当前设备登录</text>
                  </view>
                </view>
                <LineIcon name="chevron-right" size="28rpx" color="var(--text-muted)" />
              </view>

              <view class="menu-divider"></view>

              <view class="menu-row" @click="openSessionsSheet">
                <view class="row-left">
                  <LineIcon name="device" size="34rpx" color="var(--text-secondary)" />
                  <view class="row-texts">
                    <text class="row-title">登录设备管理</text>
                    <text class="row-sub">查看或下线其他已登录设备</text>
                  </view>
                </view>
                <LineIcon name="chevron-right" size="28rpx" color="var(--text-muted)" />
              </view>
            </view>
          </view>

          <view class="logout-btn zen-card" @click="handleLogout">
            <LineIcon name="logout" size="32rpx" color="var(--color-danger)" />
            <text class="logout-text">退出当前账号</text>
          </view>
        </view>
      </scroll-view>

      <view v-if="showNameSheet" class="zen-sheet-mask" @click="showNameSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">修改显示名称</text>
            <view class="sheet-close" @click="showNameSheet = false">
              <LineIcon name="close" size="30rpx" color="var(--text-muted)" />
            </view>
          </view>
          <view class="sheet-form">
            <input class="zen-input" v-model="nameDraft" maxlength="64" placeholder="输入新显示名称" />
            <button class="sheet-submit-btn" :loading="savingName" :disabled="savingName" @click="submitDisplayName">
              保存名称
            </button>
          </view>
        </view>
      </view>

      <view v-if="showAiConfigSheet" class="zen-sheet-mask" @click="showAiConfigSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">模型服务配置</text>
            <view class="sheet-close" @click="showAiConfigSheet = false">
              <LineIcon name="close" size="30rpx" color="var(--text-muted)" />
            </view>
          </view>

          <view class="sheet-form">
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

            <input
              class="zen-input"
              v-model="aiForm.baseUrl"
              placeholder="API Base URL（可选）"
              :disabled="savingAi"
            />
            <input
              class="zen-input"
              v-model="aiForm.apiKey"
              password
              :placeholder="aiForm.hasApiKey ? '已配置密钥（留空则保留原密钥）' : '输入 API Key'"
              :disabled="savingAi"
            />
            <input
              class="zen-input"
              v-model="aiForm.model"
              placeholder="对话模型名称"
              :disabled="savingAi"
            />

            <view v-if="availableModels.length > 0" class="chips-row">
              <view
                v-for="m in availableModels.slice(0, 8)"
                :key="m"
                class="chip-item"
                :class="{ active: aiForm.model === m }"
                @click="aiForm.model = m"
              >
                <text>{{ m }}</text>
              </view>
            </view>

            <view class="dual-actions">
              <view class="secondary-pill-btn" @click="fetchModelsForProvider">拉取模型</view>
              <view class="secondary-pill-btn" @click="testProviderConnection">测试连接</view>
            </view>

            <button class="sheet-submit-btn" :loading="savingAi" :disabled="savingAi" @click="saveAiSettings">
              保存模型配置
            </button>
          </view>
        </view>
      </view>

      <view v-if="showPasswordSheet" class="zen-sheet-mask" @click="showPasswordSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">修改登录密码</text>
            <view class="sheet-close" @click="showPasswordSheet = false">
              <LineIcon name="close" size="30rpx" color="var(--text-muted)" />
            </view>
          </view>
          <view class="sheet-form">
            <input class="zen-input" v-model="pwdForm.currentPassword" password placeholder="当前密码" :disabled="savingPwd" />
            <input class="zen-input" v-model="pwdForm.newPassword" password placeholder="新密码（至少 8 位含大小写和符号）" :disabled="savingPwd" />
            <input class="zen-input" v-model="pwdForm.confirmPassword" password placeholder="确认新密码" :disabled="savingPwd" />
            <text v-if="pwdError" class="pwd-error">{{ pwdError }}</text>
            <button class="sheet-submit-btn" :loading="savingPwd" :disabled="savingPwd" @click="submitPasswordChange">
              确认修改密码
            </button>
          </view>
        </view>
      </view>

      <view v-if="showSessionsSheet" class="zen-sheet-mask" @click="showSessionsSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">登录设备管理</text>
            <view class="sheet-close" @click="showSessionsSheet = false">
              <LineIcon name="close" size="30rpx" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="loadingSessions" class="quota-status">正在加载设备列表…</view>
          <view v-else class="sessions-list">
            <view v-for="s in sessionsList" :key="s.id" class="session-row">
              <view class="row-texts">
                <text class="row-title">
                  {{ s.deviceName || '未知设备' }} ({{ s.platform || 'UNKNOWN' }})
                </text>
                <text class="row-sub">
                  {{ s.current ? '当前设备' : `最近活跃：${formatResetTime(s.lastUsedAt || s.createdAt || '')}` }}
                </text>
              </view>
              <view
                v-if="!s.current && s.id"
                class="revoke-btn"
                @click="revokeDevice(s.id)"
              >
                <text>下线</text>
              </view>
            </view>
            <view
              v-if="sessionsList.some(item => !item.current)"
              class="revoke-all-btn"
              @click="revokeAllOthers"
            >
              <text>下线所有其他设备</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { aiApi, type AiProviderType, type AiSettingsView } from '@/api/aiApi'
import { refreshAiConfig, setAiConfig } from '@/api/aiClient'
import type { components } from '@/api/generated/schema'
import { useAuthApi } from '@/api/useAuthApi'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { useAiUsage } from '@/utils/useAiUsage'
import { validatePasswordStrength } from '@/utils/passwordValidation'

type SessionResponse = components['schemas']['SessionResponse']

const authStore = useAuthStore()
const syncStore = useSyncStore()
const { aiUsage, loadingAiUsage, aiUsageError, fetchAiUsage } = useAiUsage()

const displayName = computed(() => authStore.user?.displayName || authStore.username || 'Auralis 同学')
const avatarInitial = computed(() => displayName.value.trim().slice(0, 1).toUpperCase() || 'A')

const syncTimeLabel = computed(() => {
  if (!syncStore.lastSyncedAt) return '将本地记录与云端双向合并'
  return `上次同步：${formatResetTime(syncStore.lastSyncedAt)}`
})

function formatResetTime(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function usagePercent(charged: number, limit: number): string {
  if (!limit || limit <= 0) return '0%'
  const pct = Math.min(100, Math.max(0, Math.round((charged / limit) * 100)))
  return `${pct}%`
}

async function triggerManualSync() {
  if (syncStore.isSyncing) return
  await syncStore.triggerSync()
  uni.showToast({
    title: syncStore.lastError ? '同步未完成，请稍后重试' : '数据同步完成',
    icon: 'none',
  })
}

// Display Name Editing
const showNameSheet = ref(false)
const nameDraft = ref('')
const savingName = ref(false)

function openNameEditor() {
  nameDraft.value = authStore.user?.displayName || authStore.username || ''
  showNameSheet.value = true
}

async function submitDisplayName() {
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
    showNameSheet.value = false
    uni.showToast({ title: '名称已更新', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '名称更新失败', icon: 'none' })
  } finally {
    savingName.value = false
  }
}

// BYOK AI Configuration
const providers: Array<{ id: AiProviderType; label: string }> = [
  { id: 'OPENAI_COMPATIBLE', label: 'OpenAI 兼容' },
  { id: 'DEEPSEEK', label: 'DeepSeek' },
  { id: 'SILICONFLOW', label: '硅基流动' },
]

const showAiConfigSheet = ref(false)
const savingAi = ref(false)
const allAiSettings = ref<AiSettingsView[]>([])
const availableModels = ref<string[]>([])
const aiForm = reactive({
  provider: 'OPENAI_COMPATIBLE' as AiProviderType,
  baseUrl: '',
  apiKey: '',
  model: '',
  hasApiKey: false,
})

const aiSummaryLabel = computed(() => {
  const configured = allAiSettings.value.find(item => item.hasApiKey)
  if (!configured) return '配置自有密钥与默认对话模型'
  return `${configured.provider || 'AI'} · ${configured.chatModel || '已配置密钥'}`
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
    // Keep silent if AI settings endpoint unavailable offline
  }
}

function selectProvider(provider: AiProviderType) {
  if (savingAi.value) return
  applyProviderDraft(provider)
}

async function openAiConfigSheet() {
  await loadAiSettings()
  showAiConfigSheet.value = true
}

async function fetchModelsForProvider() {
  try {
    const res = await aiApi.listModels(aiForm.provider)
    availableModels.value = res.models || []
    if (availableModels.value.length === 0) {
      uni.showToast({ title: '未拉取到可用模型，请先保存密钥和 Base URL', icon: 'none' })
    }
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '拉取模型失败', icon: 'none' })
  }
}

async function testProviderConnection() {
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
    showAiConfigSheet.value = false
    uni.showToast({ title: '模型配置已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    savingAi.value = false
  }
}

// Change Password
const showPasswordSheet = ref(false)
const savingPwd = ref(false)
const pwdError = ref('')
const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

function openPasswordSheet() {
  pwdForm.currentPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdError.value = ''
  showPasswordSheet.value = true
}

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
    showPasswordSheet.value = false
    uni.showToast({ title: '密码已修改', icon: 'none' })
  } catch (err) {
    pwdError.value = err instanceof Error ? err.message : '修改密码失败，请检查当前密码'
  } finally {
    savingPwd.value = false
  }
}

// Device Sessions
const showSessionsSheet = ref(false)
const loadingSessions = ref(false)
const sessionsList = ref<SessionResponse[]>([])

async function openSessionsSheet() {
  showSessionsSheet.value = true
  loadingSessions.value = true
  const generation = authStore.getLoginGeneration()
  try {
    const res = await useAuthApi.sessions()
    if (generation !== authStore.getLoginGeneration()) return
    sessionsList.value = (res.items || []).filter(item => !item.revokedAt)
  } catch {
    uni.showToast({ title: '加载设备列表失败', icon: 'none' })
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
    uni.showToast({ title: '操作失败，请重试', icon: 'none' })
  }
}

async function revokeAllOthers() {
  try {
    await useAuthApi.revokeOtherSessions()
    sessionsList.value = sessionsList.value.filter(item => item.current)
    uni.showToast({ title: '已下线其他全部设备', icon: 'none' })
  } catch {
    uni.showToast({ title: '操作失败，请重试', icon: 'none' })
  }
}

function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    success: async (res) => {
      if (res.confirm) {
        await authStore.logout()
        uni.reLaunch({ url: '/pages/mobile/login/index' })
      }
    },
  })
}

onMounted(() => {
  void loadAiSettings()
})
</script>

<style scoped>
.profile-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
}

.content-scroll {
  flex: 1;
  min-height: 0;
}

.profile-body {
  padding: 20rpx 32rpx 48rpx;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  box-sizing: border-box;
}

.user-card {
  padding: 32rpx 28rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.avatar-badge {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-initial {
  font-size: 40rpx;
  font-weight: var(--font-weight-bold);
  color: #FFFFFF;
}

.user-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
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

.edit-name-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.section-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  padding-left: 8rpx;
}

.section-action {
  font-size: var(--font-size-xs);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-semibold);
  padding: 4rpx 8rpx;
}

.menu-card {
  padding: 8rpx 24rpx;
}

.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 24rpx 0;
}

.row-left {
  display: flex;
  align-items: center;
  gap: 18rpx;
  flex: 1;
  min-width: 0;
}

.row-texts {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.row-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.row-sub {
  font-size: 22rpx;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-pill {
  padding: 8rpx 20rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
}

.menu-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

.quota-card {
  padding: 24rpx 28rpx;
}

.quota-status {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 12rpx 0;
}

.quota-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.quota-list {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.quota-item {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.quota-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.quota-name {
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
  height: 12rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
}

.quota-reset {
  font-size: 20rpx;
  color: var(--text-muted);
}

.logout-btn {
  padding: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.logout-text {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-danger);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.sheet-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet-form {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.zen-input {
  height: 84rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 20rpx;
  padding: 0 24rpx;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  box-sizing: border-box;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.chip-item {
  padding: 10rpx 20rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: 24rpx;
  color: var(--text-secondary);
}

.chip-item.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-bold);
}

.dual-actions {
  display: flex;
  gap: 16rpx;
}

.secondary-pill-btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 20rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.sheet-submit-btn {
  width: 100%;
  height: 86rpx;
  line-height: 86rpx;
  border-radius: 22rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  border: none;
}

.sheet-submit-btn::after {
  border: none;
}

.pwd-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 22rpx;
  background-color: var(--color-bg-primary);
  border-radius: 20rpx;
}

.revoke-btn {
  padding: 8rpx 20rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
}

.revoke-all-btn {
  margin-top: 8rpx;
  text-align: center;
  padding: 20rpx;
  border-radius: 20rpx;
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}
</style>
