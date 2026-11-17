<template>
  <AppPageLayout anim-origin="slide-right">
    <view class="profile-page">
      <AppHeader title="我的">
        <template #right>
          <view class="sync-pill-btn" @click="triggerManualSync">
            <LineIcon name="sync" size="14px" color="var(--color-sage-dark)" />
            <text>{{ syncStore.isSyncing ? '同步中' : '同步' }}</text>
          </view>
        </template>
      </AppHeader>

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
            <view class="ui-icon-btn" @click="openNameEditor">
              <LineIcon name="edit" size="16px" color="var(--color-sage-dark)" />
            </view>
          </view>

          <StudyMetrics />

          <view class="quota-card zen-card">
            <view class="quota-card-head">
              <text class="card-heading">AI 额度</text>
              <view class="ui-icon-btn refresh-mini" @click="fetchAiUsage">
                <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
              </view>
            </view>

            <view v-if="loadingAiUsage && !aiUsage" class="quota-skeleton">
              <view class="ui-shimmer shimmer-line"></view>
              <view class="ui-shimmer shimmer-line"></view>
            </view>

            <view v-else-if="aiUsageError" class="quota-error">
              <text class="error-msg">{{ aiUsageError }}</text>
              <view class="ui-btn ui-btn-secondary retry-small" @click="fetchAiUsage">重试</view>
            </view>

            <view v-else-if="aiUsage" class="quota-list">
              <view class="quota-item">
                <view class="quota-top">
                  <text class="quota-name">每小时</text>
                  <text class="quota-nums num-tabular">{{ aiUsage.hourly.remainingTokens }} / {{ aiUsage.hourly.limitTokens }}</text>
                </view>
                <view class="quota-track">
                  <view class="quota-fill" :style="{ width: usagePercent(aiUsage.hourly.chargedTokens, aiUsage.hourly.limitTokens) }"></view>
                </view>
              </view>

              <view class="quota-item">
                <view class="quota-top">
                  <text class="quota-name">每日</text>
                  <text class="quota-nums num-tabular">{{ aiUsage.daily.remainingTokens }} / {{ aiUsage.daily.limitTokens }}</text>
                </view>
                <view class="quota-track">
                  <view class="quota-fill" :style="{ width: usagePercent(aiUsage.daily.chargedTokens, aiUsage.daily.limitTokens) }"></view>
                </view>
              </view>
            </view>
          </view>

          <view class="menu-card zen-card">
            <view class="menu-row" @click="openAiConfigSheet">
              <LineIcon name="key" size="17px" color="var(--text-secondary)" />
              <text class="row-title">模型服务</text>
              <text class="row-val">{{ aiSummaryLabel }}</text>
              <LineIcon name="chevron-right" size="15px" color="var(--text-muted)" />
            </view>

            <view class="menu-divider"></view>

            <view class="menu-row" @click="openPasswordSheet">
              <LineIcon name="lock" size="17px" color="var(--text-secondary)" />
              <text class="row-title">修改密码</text>
              <LineIcon name="chevron-right" size="15px" color="var(--text-muted)" />
            </view>

            <view class="menu-divider"></view>

            <view class="menu-row" @click="openSessionsSheet">
              <LineIcon name="device" size="17px" color="var(--text-secondary)" />
              <text class="row-title">登录设备</text>
              <LineIcon name="chevron-right" size="15px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="ui-btn ui-btn-danger logout-btn" @click="handleLogout">
            <LineIcon name="logout" size="16px" color="var(--color-danger)" />
            <text>退出登录</text>
          </view>
        </view>
      </scroll-view>

      <view v-if="showNameSheet" class="zen-sheet-mask" @click="showNameSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">修改名称</text>
            <view class="ui-icon-btn" @click="showNameSheet = false">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>
          <view class="sheet-form">
            <input class="ui-input" v-model="nameDraft" maxlength="64" placeholder="显示名称" />
            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="savingName" :disabled="savingName" @click="submitDisplayName">
              保存
            </button>
          </view>
        </view>
      </view>

      <view v-if="showAiConfigSheet" class="zen-sheet-mask" @click="showAiConfigSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">模型服务</text>
            <view class="ui-icon-btn" @click="showAiConfigSheet = false">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="sheet-form">
            <view class="ui-segmented">
              <view
                v-for="p in providers"
                :key="p.id"
                class="ui-seg-item"
                :class="{ active: aiForm.provider === p.id }"
                @click="selectProvider(p.id)"
              >
                <text>{{ p.label }}</text>
              </view>
            </view>

            <input
              class="ui-input"
              v-model="aiForm.baseUrl"
              placeholder="Base URL（可选）"
              :disabled="savingAi"
            />
            <input
              class="ui-input"
              v-model="aiForm.apiKey"
              password
              :placeholder="aiForm.hasApiKey ? '已配置密钥（留空保留）' : 'API Key'"
              :disabled="savingAi"
            />
            <input
              class="ui-input"
              v-model="aiForm.model"
              placeholder="模型名称"
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
              <view class="ui-btn ui-btn-secondary dual-btn" @click="fetchModelsForProvider">拉取模型</view>
              <view class="ui-btn ui-btn-secondary dual-btn" @click="testProviderConnection">测试连接</view>
            </view>

            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="savingAi" :disabled="savingAi" @click="saveAiSettings">
              保存配置
            </button>
          </view>
        </view>
      </view>

      <view v-if="showPasswordSheet" class="zen-sheet-mask" @click="showPasswordSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">修改密码</text>
            <view class="ui-icon-btn" @click="showPasswordSheet = false">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>
          <view class="sheet-form">
            <input class="ui-input" v-model="pwdForm.currentPassword" password placeholder="当前密码" :disabled="savingPwd" />
            <input class="ui-input" v-model="pwdForm.newPassword" password placeholder="新密码（8+位含大小写及符号）" :disabled="savingPwd" />
            <input class="ui-input" v-model="pwdForm.confirmPassword" password placeholder="确认新密码" :disabled="savingPwd" />
            <text v-if="pwdError" class="pwd-error">{{ pwdError }}</text>
            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="savingPwd" :disabled="savingPwd" @click="submitPasswordChange">
              确认修改
            </button>
          </view>
        </view>
      </view>

      <view v-if="showSessionsSheet" class="zen-sheet-mask" @click="showSessionsSheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">登录设备</text>
            <view class="ui-icon-btn" @click="showSessionsSheet = false">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="loadingSessions" class="quota-skeleton">
            <view class="ui-shimmer shimmer-line"></view>
          </view>
          <view v-else class="sessions-list">
            <view v-for="s in sessionsList" :key="s.id" class="session-row">
              <view class="session-meta">
                <text class="row-title">
                  {{ s.deviceName || '未知设备' }} · {{ s.platform || 'UNKNOWN' }}
                </text>
                <text class="row-sub num-tabular">
                  {{ s.current ? '当前设备' : formatResetTime(s.lastUsedAt || s.createdAt || '') }}
                </text>
              </view>
              <view
                v-if="!s.current && s.id"
                class="ui-btn ui-btn-danger revoke-btn"
                @click="revokeDevice(s.id)"
              >
                <text>下线</text>
              </view>
            </view>
            <view
              v-if="sessionsList.some(item => !item.current)"
              class="ui-btn ui-btn-danger revoke-all-btn"
              @click="revokeAllOthers"
            >
              <text>下线全部其他设备</text>
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

const displayName = computed(() => authStore.user?.displayName || authStore.username || 'Auralis')
const avatarInitial = computed(() => displayName.value.trim().slice(0, 1).toUpperCase() || 'A')

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
    title: syncStore.lastError ? '同步未完成' : '同步完成',
    icon: 'none',
  })
}

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
    uni.showToast({ title: '请输入名称', icon: 'none' })
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
    uni.showToast({ title: '已更新', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '更新失败', icon: 'none' })
  } finally {
    savingName.value = false
  }
}

const providers: Array<{ id: AiProviderType; label: string }> = [
  { id: 'OPENAI_COMPATIBLE', label: 'OpenAI' },
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
  if (!configured) return '未配置'
  return configured.chatModel || configured.provider || '已配置'
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
    // Keep silent if offline
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
      uni.showToast({ title: '未拉取到可用模型', icon: 'none' })
    }
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '拉取失败', icon: 'none' })
  }
}

async function testProviderConnection() {
  try {
    const res = await aiApi.testConnection(aiForm.provider)
    uni.showToast({
      title: res.reachable ? `连接正常 (${res.chatModel || aiForm.provider})` : '连接不可达',
      icon: 'none',
    })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '测试失败', icon: 'none' })
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
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    savingAi.value = false
  }
}

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
    pwdError.value = '请输入当前密码'
    return
  }
  const strengthErr = validatePasswordStrength(pwdForm.newPassword)
  if (strengthErr) {
    pwdError.value = strengthErr
    return
  }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    pwdError.value = '两次输入的新密码不一致'
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
    pwdError.value = err instanceof Error ? err.message : '修改密码失败'
  } finally {
    savingPwd.value = false
  }
}

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
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

async function revokeAllOthers() {
  try {
    await useAuthApi.revokeOtherSessions()
    sessionsList.value = sessionsList.value.filter(item => item.current)
    uni.showToast({ title: '已下线其他设备', icon: 'none' })
  } catch {
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    confirmColor: '#C93B3B',
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

.sync-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.content-scroll {
  flex: 1;
  min-height: 0;
}

.profile-body {
  padding: 8px 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

.user-card {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar-badge {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-initial {
  font-size: 20px;
  font-weight: var(--font-weight-bold);
  color: #FFFFFF;
}

.user-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-display {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.user-handle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.quota-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quota-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-heading {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.refresh-mini {
  width: 30px;
  height: 30px;
}

.quota-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shimmer-line {
  width: 100%;
  height: 16px;
}

.quota-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.error-msg {
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.retry-small {
  height: 30px;
  padding: 0 12px;
  font-size: var(--font-size-xs);
}

.quota-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quota-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quota-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.quota-name {
  font-size: 13px;
  color: var(--text-secondary);
}

.quota-nums {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  color: var(--text-muted);
}

.quota-track {
  height: 6px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-secondary);
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
}

.menu-card {
  padding: 4px 16px;
}

.menu-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  cursor: pointer;
}

.row-title {
  flex: 1;
  font-size: 14.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.row-val {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

.logout-btn {
  width: 100%;
  height: 46px;
  border-radius: 14px;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.sheet-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip-item {
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  cursor: pointer;
}

.chip-item.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.dual-actions {
  display: flex;
  gap: 10px;
}

.dual-btn {
  flex: 1;
  height: 38px;
}

.sheet-submit-btn {
  width: 100%;
  height: 44px;
}

.pwd-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background-color: var(--color-bg-primary);
}

.session-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-sub {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.revoke-btn {
  height: 30px;
  padding: 0 12px;
  font-size: var(--font-size-xs);
  flex-shrink: 0;
}

.revoke-all-btn {
  width: 100%;
  height: 40px;
  margin-top: 4px;
}
</style>
