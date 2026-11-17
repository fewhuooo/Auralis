<template>
  <TabletLayout>
    <view class="t-profile">
      <view class="profile-header">
        <text class="page-title">个人中心</text>
        <view class="ui-btn ui-btn-danger logout-pill" role="button" @click="handleLogout">
          <LineIcon name="logout" size="15px" color="var(--color-danger)" />
          <text>退出登录</text>
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="profile-scroll">
        <view class="columns-grid">
          <view class="column-stack">
            <view class="panel-card zen-panel">
              <view class="user-banner">
                <view class="avatar-circle">
                  <text class="avatar-letter">{{ avatarLetter }}</text>
                </view>
                <view class="user-meta">
                  <view class="name-line">
                    <text class="user-display">{{ displayName }}</text>
                    <view
                      class="edit-name-btn"
                      role="button"
                      aria-label="修改显示名称"
                      @click="toggleNameEdit"
                    >
                      <LineIcon name="edit" size="14px" color="var(--text-muted)" />
                    </view>
                  </view>
                  <text class="user-handle">@{{ authStore.username || 'auralis' }}</text>
                </view>
                <view class="ui-btn ui-btn-secondary sync-btn" role="button" @click="triggerManualSync">
                  <LineIcon name="sync" size="14px" color="var(--color-sage-ink)" />
                  <text>{{ syncStore.isSyncing ? '同步中' : '同步' }}</text>
                </view>
              </view>

              <view v-if="editingName" class="inline-field">
                <input
                  class="ui-input"
                  v-model="nameDraft"
                  maxlength="64"
                  placeholder="输入显示名称"
                  :disabled="savingName"
                />
                <view class="ui-btn ui-btn-primary save-inline-btn" :class="{ 'is-disabled': savingName }" role="button" @click="saveDisplayName">
                  <text>{{ savingName ? '保存中' : '保存' }}</text>
                </view>
              </view>

              <view class="card-divider"></view>

              <view class="action-row" role="button" @click="openPasswordModal">
                <LineIcon name="lock" size="16px" color="var(--text-secondary)" />
                <text class="action-row-label">修改密码</text>
                <LineIcon name="chevron-right" size="15px" color="var(--text-muted)" />
              </view>
            </view>

            <view class="panel-card zen-panel">
              <text class="card-title">学习统计</text>
              <StudyMetrics />
            </view>

            <view class="panel-card zen-panel">
              <view class="card-head-between">
                <text class="card-title">登录设备</text>
                <view class="ui-icon-btn sm" role="button" aria-label="刷新设备列表" @click="loadSessions">
                  <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
                </view>
              </view>

              <view v-if="loadingSessions" class="empty-hint">加载中…</view>
              <view v-else-if="sessionsList.length === 0" class="empty-hint">暂无设备</view>
              <view v-else class="sessions-list">
                <view v-for="s in sessionsList" :key="s.id" class="session-row">
                  <view class="session-info">
                    <text class="session-name">{{ s.deviceName || '未知设备' }} · {{ s.platform || 'UNKNOWN' }}</text>
                    <text class="session-sub num-tabular">
                      {{ s.current ? '当前设备' : formatTime(s.lastUsedAt || s.createdAt) }}
                    </text>
                  </view>
                  <view v-if="!s.current && s.id" class="ui-btn ui-btn-danger revoke-pill" role="button" @click="revokeDevice(s.id)">下线</view>
                </view>
                <view
                  v-if="sessionsList.some(item => !item.current)"
                  class="ui-btn ui-btn-danger full-btn"
                  role="button"
                  @click="revokeOtherDevices"
                >
                  <text>下线全部其他设备</text>
                </view>
              </view>
            </view>
          </view>

          <view class="column-stack">
            <view class="panel-card zen-panel">
              <view class="card-head-between">
                <text class="card-title">AI 额度</text>
                <view class="ui-icon-btn sm" role="button" aria-label="刷新额度" @click="fetchAiUsage">
                  <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
                </view>
              </view>

              <view v-if="loadingAiUsage && !aiUsage" class="quota-stack">
                <view class="ui-shimmer shimmer-line"></view>
                <view class="ui-shimmer shimmer-line"></view>
              </view>
              <view v-else-if="aiUsageError" class="error-row">
                <text class="error-text">{{ aiUsageError }}</text>
                <view class="ui-btn ui-btn-secondary retry-small" role="button" @click="fetchAiUsage">重试</view>
              </view>
              <view v-else-if="aiUsage" class="quota-stack">
                <view class="quota-block">
                  <view class="quota-top">
                    <text class="quota-title">每小时剩余</text>
                    <text class="quota-nums num-tabular">{{ formatQuotaNums(aiUsage.hourly.remainingTokens, aiUsage.hourly.limitTokens) }}</text>
                  </view>
                  <view class="quota-track">
                    <view class="quota-fill" :style="{ width: remainingPercent(aiUsage.hourly.remainingTokens, aiUsage.hourly.limitTokens) }"></view>
                  </view>
                  <text v-if="aiUsage.hourly.chargedTokens > 0 && aiUsage.hourly.resetAt" class="quota-reset num-tabular">
                    {{ formatResetClock(aiUsage.hourly.resetAt) }} 重置
                  </text>
                </view>

                <view class="quota-block">
                  <view class="quota-top">
                    <text class="quota-title">每日剩余</text>
                    <text class="quota-nums num-tabular">{{ formatQuotaNums(aiUsage.daily.remainingTokens, aiUsage.daily.limitTokens) }}</text>
                  </view>
                  <view class="quota-track">
                    <view class="quota-fill" :style="{ width: remainingPercent(aiUsage.daily.remainingTokens, aiUsage.daily.limitTokens) }"></view>
                  </view>
                  <text v-if="aiUsage.daily.chargedTokens > 0 && aiUsage.daily.resetAt" class="quota-reset num-tabular">
                    {{ formatResetClock(aiUsage.daily.resetAt) }} 重置
                  </text>
                </view>
              </view>
            </view>

            <view class="panel-card zen-panel">
              <text class="card-title">模型服务</text>

              <view class="ui-segmented" role="tablist">
                <view
                  v-for="p in providers"
                  :key="p.id"
                  class="ui-seg-item"
                  :class="{ active: aiForm.provider === p.id }"
                  role="tab"
                  :aria-selected="aiForm.provider === p.id"
                  @click="selectProvider(p.id)"
                >
                  <text>{{ p.label }}</text>
                </view>
              </view>

              <view class="form-stack">
                <view>
                  <text class="zen-field-label">Base URL</text>
                  <input
                    class="ui-input"
                    v-model="aiForm.baseUrl"
                    placeholder="https://..."
                    :disabled="savingAi"
                  />
                </view>
                <view>
                  <text class="zen-field-label">API Key</text>
                  <input
                    class="ui-input"
                    v-model="aiForm.apiKey"
                    password
                    :placeholder="aiForm.hasApiKey ? '已配置（留空保留）' : 'sk-...'"
                    :disabled="savingAi"
                  />
                </view>
                <view>
                  <text class="zen-field-label">模型</text>
                  <input
                    class="ui-input"
                    v-model="aiForm.model"
                    placeholder="例如 gpt-4o-mini"
                    :disabled="savingAi"
                  />
                </view>

                <view v-if="availableModels.length > 0" class="chips-row">
                  <view
                    v-for="model in availableModels.slice(0, 10)"
                    :key="model"
                    class="chip-item"
                    :class="{ active: aiForm.model === model }"
                    role="button"
                    @click="aiForm.model = model"
                  >
                    <text>{{ model }}</text>
                  </view>
                </view>

                <view class="btn-row">
                  <view class="ui-btn ui-btn-secondary half-btn" role="button" @click="fetchModels">拉取模型</view>
                  <view class="ui-btn ui-btn-secondary half-btn" role="button" @click="testConnection">测试连接</view>
                </view>

                <view class="ui-btn ui-btn-primary full-btn" :class="{ 'is-disabled': savingAi }" role="button" @click="saveAiSettings">
                  <text>{{ savingAi ? '保存中…' : '保存配置' }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <template #modal>
      <view v-if="showPasswordModal" class="zen-modal-mask" @click="closePasswordModal">
        <view class="zen-modal-body pwd-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">修改密码</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closePasswordModal">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="form-stack">
            <input class="ui-input" v-model="pwdForm.currentPassword" password placeholder="当前密码" :disabled="savingPwd" />
            <input class="ui-input" v-model="pwdForm.newPassword" password placeholder="新密码" :disabled="savingPwd" />
            <input class="ui-input" v-model="pwdForm.confirmPassword" password placeholder="确认新密码" :disabled="savingPwd" />
            <text v-if="pwdError" class="error-text">{{ pwdError }}</text>
          </view>

          <view class="modal-footer">
            <view class="ui-btn ui-btn-ghost" role="button" @click="closePasswordModal">取消</view>
            <view class="ui-btn ui-btn-primary" :class="{ 'is-disabled': savingPwd }" role="button" @click="submitPasswordChange">
              {{ savingPwd ? '提交中…' : '确认修改' }}
            </view>
          </view>
        </view>
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { aiApi, type AiProviderType, type AiSettingsView } from '@/api/aiApi'
import { refreshAiConfig, setAiConfig } from '@/api/aiClient'
import type { components } from '@/api/generated/schema'
import { useAuthApi } from '@/api/useAuthApi'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
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

const editingName = ref(false)
const nameDraft = ref(authStore.user?.displayName || authStore.username || '')
const savingName = ref(false)

function toggleNameEdit() {
  if (!editingName.value) {
    nameDraft.value = authStore.user?.displayName || authStore.username || ''
  }
  editingName.value = !editingName.value
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatResetClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatQuotaNums(remaining: number, limit: number): string {
  return `${Number(remaining || 0).toLocaleString()} / ${Number(limit || 0).toLocaleString()}`
}

function remainingPercent(remaining: number, limit: number): string {
  if (!limit || limit <= 0) return '0%'
  return `${Math.min(100, Math.max(0, Math.round((remaining / limit) * 100)))}%`
}

async function saveDisplayName() {
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
    editingName.value = false
    uni.showToast({ title: '已更新', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '更新失败', icon: 'none' })
  } finally {
    savingName.value = false
  }
}

async function triggerManualSync() {
  if (syncStore.isSyncing) return
  await syncStore.triggerSync()
  uni.showToast({ title: syncStore.lastError ? '同步未完成' : '同步完成', icon: 'none' })
}

const showPasswordModal = ref(false)
useEscapeKey(() => showPasswordModal.value && !savingPwd.value, () => {
  showPasswordModal.value = false
})
const savingPwd = ref(false)
const pwdError = ref('')
const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

function openPasswordModal() {
  pwdForm.currentPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdError.value = ''
  showPasswordModal.value = true
}

function closePasswordModal() {
  if (savingPwd.value) return
  showPasswordModal.value = false
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
    pwdForm.currentPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
    showPasswordModal.value = false
    uni.showToast({ title: '密码已更新', icon: 'none' })
  } catch (err) {
    pwdError.value = err instanceof Error ? err.message : '修改失败'
  } finally {
    savingPwd.value = false
  }
}

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
    // Keep silent offline
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
    uni.showToast({ title: '下线失败', icon: 'none' })
  }
}

async function revokeOtherDevices() {
  try {
    await useAuthApi.revokeOtherSessions()
    sessionsList.value = sessionsList.value.filter(item => item.current)
    uni.showToast({ title: '已下线其他设备', icon: 'none' })
  } catch {
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

const providers: Array<{ id: AiProviderType; label: string }> = [
  { id: 'OPENAI_COMPATIBLE', label: 'OpenAI' },
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
      uni.showToast({ title: '未拉取到可用模型', icon: 'none' })
    }
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '拉取失败', icon: 'none' })
  }
}

async function testConnection() {
  try {
    const res = await aiApi.testConnection(aiForm.provider)
    uni.showToast({
      title: res.reachable ? `连接正常 (${res.chatModel || aiForm.provider})` : '连接不可达',
      icon: 'none',
    })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '连接失败', icon: 'none' })
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
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    savingAi.value = false
  }
}

function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号吗？',
    confirmColor: '#C93B3B',
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
  padding: 20px 24px;
  box-sizing: border-box;
  background-color: var(--color-bg-secondary);
}

.profile-header {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.page-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
}

.logout-pill {
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-full);
}

.profile-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.columns-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  max-width: 1040px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.column-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-card {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-title {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.card-head-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-banner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-circle {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.avatar-letter {
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

.name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-display {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.edit-name-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.edit-name-btn:hover {
  background-color: rgba(28, 28, 26, 0.05);
}

.user-handle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.sync-btn {
  height: 34px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.save-inline-btn {
  height: 42px;
  padding: 0 16px;
  flex-shrink: 0;
}

.card-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

.action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px;
  cursor: pointer;
}

.action-row-label {
  flex: 1;
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.full-btn {
  width: 100%;
  height: 42px;
}

.btn-row {
  display: flex;
  gap: 10px;
}

.half-btn {
  flex: 1;
  height: 38px;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-item {
  padding: 5px 11px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
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

.quota-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shimmer-line {
  width: 100%;
  height: 16px;
}

.quota-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quota-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quota-title {
  font-size: 13px;
  color: var(--text-secondary);
}

.quota-nums {
  font-size: var(--font-size-xs);
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
  transition: width 0.32s var(--ease-out);
}

.quota-reset {
  font-size: 11px;
  color: var(--text-muted);
  align-self: flex-end;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 13px;
  border-radius: 12px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
}

.session-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-name {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.session-sub {
  font-size: 11.5px;
  color: var(--text-muted);
}

.revoke-pill {
  height: 28px;
  padding: 0 11px;
  font-size: var(--text-2xs);
  flex-shrink: 0;
}

.empty-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.error-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.retry-small {
  height: 30px;
  padding: 0 12px;
  font-size: var(--font-size-xs);
}

.error-text {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.pwd-modal {
  max-width: 400px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 18px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 900px) {
  .columns-grid {
    grid-template-columns: 1fr;
  }
}
</style>
