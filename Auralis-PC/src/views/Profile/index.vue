<template>
  <div class="profile-studio">
    <!-- ===== LEFT PANEL: 数据透视 ===== -->
      <aside class="studio-left">
        <!-- 1. 用户基本资料 (User Profile Card) -->
        <div class="user-profile-card">
          <div class="avatar-wrap" @click="triggerAvatarUpload" :title="t(profileMessages.changeAvatarTitle)">
            <img v-if="userAvatarUrl" :src="userAvatarUrl" class="user-avatar-img" :alt="t(profileMessages.avatar)" />
            <div v-else class="user-avatar">{{ userInitial }}</div>
            <div class="avatar-hover-overlay">
              <IconCamera :size="14" />
            </div>
          </div>
          <div class="user-profile-meta">
            <h2 class="user-name">{{ accountName }}</h2>
            <div class="user-badges">
              <span class="user-streak-pill">
                <IconFlame :size="13" :stroke-width="2.2" class="streak-icon" />
                {{ t(profileMessages.focusDays, { count: continuousStudyDays }) }}
              </span>
              <span class="device-pill">{{ deviceName }}</span>
            </div>
          </div>
        </div>

        <!-- 2. 核心学习指标 (Study Overview) -->
        <div class="study-stats-card">
          <div class="study-stats-header">
            <span class="study-stats-title">{{ t(profileMessages.learningMetrics) }}</span>
          </div>

          <div class="stats-grid">
            <div class="stat-cell" v-for="s in coreStats" :key="s.icon.name">
              <div class="stat-top">
                <div class="stat-icon-wrap">
                  <component :is="s.icon" :size="14" :stroke-width="2" class="stat-icon" />
                </div>
                <span class="stat-label">{{ t(s.label) }}</span>
              </div>
              <span class="stat-value" :class="{ accent: s.accent }">{{ s.value }}</span>
            </div>
          </div>
        </div>

        <!-- 3. 学科知识分布 -->
        <div class="subject-dist-card">
          <div class="subject-dist-header">
            <span class="subject-dist-title">{{ t(profileMessages.subjectDistribution) }}</span>
          </div>
          <div v-if="subjects.length === 0" class="no-data-hint">
            {{ t(profileMessages.noSubjectData) }}
          </div>
          <div v-else class="subject-list">
            <div v-for="sub in subjects" :key="sub.name" class="subject-row">
              <span class="subject-dot" :style="{ backgroundColor: sub.color || '#8B9A6E' }"></span>
              <span class="subject-name" :title="sub.name">{{ sub.name }}</span>
              <div class="subject-bar-bg">
                <div class="subject-bar-fill" :style="{ width: sub.pct + '%', backgroundColor: sub.color || '#8B9A6E' }"></div>
              </div>
              <span class="subject-count-badge">{{ t(profileMessages.blockCount, { count: sub.count }) }}</span>
            </div>
          </div>
        </div>

        <!-- 4. 文件解析进度中心 (放左边) -->
        <DocumentProcessingCenter />

        <!-- 5. 账号与安全凭证管理 (Account & Security) -->
        <section class="account-card" aria-labelledby="profile-account-title">
          <h2 id="profile-account-title" class="account-card-title">{{ t(profileMessages.accountSecurity) }}</h2>

          <div class="account-section" role="group" aria-labelledby="profile-account-details-title">
            <div class="account-section-header">
              <h3 id="profile-account-details-title" class="account-section-title setting-label-with-icon">
                <IconId class="setting-icon" aria-hidden="true" />
                {{ t(profileMessages.accountProfile) }}
              </h3>
            </div>
            <div class="account-details account-section-body">
              <div class="account-detail">
                <span class="cell-label">{{ t(profileMessages.account) }}</span>
                <span class="cell-val">{{ accountName }}</span>
              </div>

              <div class="account-detail">
                <span class="cell-label">{{ t(profileMessages.userAvatar) }}</span>
                <div class="mini-avatar">
                  <img v-if="userAvatarUrl" :src="userAvatarUrl" class="mini-avatar-img" :alt="t(profileMessages.avatar)" />
                  <span v-else>{{ userInitial }}</span>
                </div>
                <div class="cell-actions">
                  <button v-if="userAvatarUrl" class="cell-btn" :aria-label="t(profileMessages.resetAvatar)" @click="resetAvatar">
                    {{ t(profileMessages.reset) }}
                  </button>
                  <button class="cell-btn" :aria-label="t(profileMessages.changeAvatar)" @click="triggerAvatarUpload">
                    {{ t(profileMessages.change) }}
                  </button>
                </div>
              </div>

              <div class="account-detail">
                <span class="cell-label">{{ t(profileMessages.password) }}</span>
                <span class="cell-sub">••••••••</span>
                <button class="cell-btn" :aria-label="t(profileMessages.editPassword)" @click="openPasswordModal">
                  {{ t(profileMessages.edit) }}
                </button>
              </div>
            </div>
          </div>

          <section class="account-sessions" aria-labelledby="profile-sessions-title">
            <div class="account-section-header">
              <h3 id="profile-sessions-title" class="account-section-title setting-label-with-icon">
                <IconDevices class="setting-icon" aria-hidden="true" />
                {{ t(profileMessages.devices) }}
              </h3>
              <button class="cell-btn" type="button" @click="handleLogout">{{ t(profileMessages.signOut) }}</button>
            </div>
            <div class="account-section-body">
              <p v-if="sessionsLoading && sessions.length === 0" class="session-empty">{{ t(profileMessages.loadingDevices) }}</p>
              <p v-else-if="sessionsError" class="session-empty session-error">{{ sessionsError }}</p>
              <p v-else-if="sessions.length === 0" class="session-empty">{{ t(profileMessages.noOtherDevices) }}</p>
              <div v-if="sessions.length > 0">
                <div v-for="session in sessions" :key="session.id || session.serverDeviceId" class="account-operation">
                  <div class="row-info">
                    <div class="session-title-line">
                      <span class="row-label">{{ session.deviceName || session.platform || t(profileMessages.unknownDevice) }}</span>
                      <span v-if="isCurrentSession(session)" class="session-current-pill">{{ t(profileMessages.currentDevice) }}</span>
                    </div>
                    <span class="row-desc">
                      {{ t(profileMessages.lastActive, { platform: session.platform || t(profileMessages.unknownDate), date: formatSessionDate(session.lastUsedAt) }) }}
                    </span>
                  </div>
                  <button
                    v-if="session.id && !isCurrentSession(session)"
                    class="cell-btn danger"
                    type="button"
                    :disabled="revokingSessionId === session.id"
                    @click="handleRevokeSession(session)"
                  >
                    {{ t(revokingSessionId === session.id ? profileMessages.revoking : profileMessages.revoke) }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="danger-zone" aria-labelledby="profile-reset-title">
            <div class="account-section-header">
              <h3 id="profile-reset-title" class="account-section-title setting-label-with-icon">
                <IconShieldLock class="setting-icon" aria-hidden="true" />
                {{ t(profileMessages.accountReset) }}
              </h3>
            </div>
            <div class="account-section-body">
              <div class="account-operation">
                <div class="row-info">
                  <span class="row-label">{{ t(profileMessages.resetOfflineData) }}</span>
                  <span class="row-desc">{{ t(profileMessages.resetOfflineDescription) }}</span>
                </div>
                <button class="cell-btn danger" type="button" :aria-label="t(profileMessages.resetOfflineData)" @click="handleResetOfflineData">
                  {{ t(profileMessages.reset) }}
                </button>
              </div>
              <div class="account-operation">
                <div class="row-info">
                  <span class="row-label">{{ t(profileMessages.closeAccount) }}</span>
                  <span class="row-desc">{{ t(profileMessages.closeAccountDescription) }}</span>
                </div>
                <button class="cell-btn danger" type="button" :aria-label="t(profileMessages.closeAccount)" @click="handleDeleteAccount">
                  {{ t(profileMessages.close) }}
                </button>
              </div>
            </div>
          </section>
        </section>
      </aside>

      <!-- ===== RIGHT PANEL: 分项设置 ===== -->
      <main class="studio-right">
        <h1 class="settings-title">{{ t(profileMessages.personalSettings) }}</h1>

        <!-- Settings Groups -->
        <div
          v-for="group in settingGroups"
          :key="group.id"
          class="settings-group"
        >
          <div class="group-header">
            <h3 class="group-title setting-label-with-icon">
              <component :is="group.icon" class="setting-icon" aria-hidden="true" />
              {{ t(group.title) }}
            </h3>
          </div>
          <div class="group-items">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="settings-row"
            >
              <div class="row-info">
                <span class="row-label setting-label-with-icon">
                  <component :is="item.icon" class="setting-icon" aria-hidden="true" />
                  {{ t(item.label) }}
                </span>
              </div>
              <div class="row-control" :class="{ 'sync-status-controls': item.id === 'sync_status' }">
                <button
                  v-if="item.type === 'toggle'"
                  class="toggle-btn"
                  type="button"
                  role="switch"
                  :aria-checked="item.value"
                  :aria-label="t(item.label)"
                  :class="{ 'is-on': item.value }"
                  @click="handleToggle(item)"
                >
                  <span class="toggle-knob"></span>
                </button>
                <select
                  v-else-if="item.id === 'lang'"
                  class="settings-select"
                  :value="locale"
                  :aria-label="t(item.label)"
                  @change="setLocale(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in localeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <select
                  v-else-if="item.id === 'font_size'"
                  class="settings-select"
                  :value="settingsStore.fontSize"
                  :aria-label="t(item.label)"
                  @change="settingsStore.setFontSize(($event.target as HTMLSelectElement).value)"
                >
                  <option>12px</option>
                  <option>14px</option>
                  <option>16px</option>
                </select>
                <template v-else>
                  <div class="status-pill-badge" :class="{ 'is-warning': item.id === 'sync_status' && (syncStore.lastSyncError || syncStore.resetRequired || !autoSyncEnabled || hasPendingFocusSessions) }">
                    <span class="status-dot-indicator"></span>
                    <span>{{ syncStatusText }}</span>
                  </div>
                  <button class="action-btn primary" type="button" :disabled="syncButtonMessage === profileMessages.syncingButton" @click="handleSyncNow">
                    {{ t(syncButtonMessage) }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <section class="settings-group" aria-labelledby="profile-ai-title">
          <div class="group-header">
            <h3 id="profile-ai-title" class="group-title setting-label-with-icon">
              <IconSparkles class="setting-icon" aria-hidden="true" />
              {{ t(profileMessages.aiSettings) }}
            </h3>
          </div>

          <div class="settings-row ai-overview-row">
            <div class="row-info">
              <span class="row-label setting-label-with-icon">
                <IconFileDescription class="setting-icon" aria-hidden="true" />
                {{ t(autoOverviewSetting.label) }}
              </span>
              <span id="profile-auto-overview-desc" class="row-desc">{{ t(profileMessages.autoOverviewDescription) }}</span>
            </div>
            <div class="row-control">
              <button
                class="toggle-btn"
                type="button"
                role="switch"
                :aria-checked="autoOverviewSetting.value"
                :aria-label="t(autoOverviewSetting.label)"
                aria-describedby="profile-auto-overview-desc"
                :class="{ 'is-on': autoOverviewSetting.value }"
                @click="handleToggle(autoOverviewSetting)"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
          </div>

          <div class="ai-settings-section" role="group" aria-labelledby="profile-ai-model-title">
            <div class="ai-subheader">
              <h4 id="profile-ai-model-title" class="group-title ai-subtitle setting-label-with-icon">
                <IconCpu class="setting-icon" aria-hidden="true" />
                {{ t(profileMessages.modelsAndServices) }}
              </h4>
            </div>

            <div class="ai-section-content">
              <div class="settings-row byok-field-row">
                <div class="row-info">
                  <label class="row-label setting-label-with-icon" for="profile-ai-provider">
                    <IconServer class="setting-icon" aria-hidden="true" />
                    {{ t(profileMessages.aiProvider) }}
                  </label>
                </div>
                <div class="row-control byok-control-wrap">
                  <input
                    id="profile-ai-provider"
                    v-model="customProvider"
                    type="text"
                    class="settings-input byok-input"
                    :disabled="aiSettingsInitializing"
                  />
                </div>
              </div>

              <div class="settings-row byok-field-row">
                <div class="row-info">
                  <label class="row-label setting-label-with-icon" for="profile-ai-base-url">
                    <IconLink class="setting-icon" aria-hidden="true" />
                    Base URL
                  </label>
                  <span id="profile-ai-base-url-hint" class="row-desc">
                    {{ t(canonicalAiProvider === 'OPENAI_COMPATIBLE' ? profileMessages.compatibleUrlRequired : profileMessages.defaultUrl) }}
                  </span>
                </div>
                <div class="row-control byok-control-wrap">
                  <input
                    id="profile-ai-base-url"
                    v-model="customBaseUrl"
                    type="text"
                    class="settings-input byok-input"
                    aria-describedby="profile-ai-base-url-hint"
                  />
                </div>
              </div>

              <div class="settings-row byok-field-row">
                <div class="row-info">
                  <label class="row-label setting-label-with-icon" for="profile-ai-key">
                    <IconKey class="setting-icon" aria-hidden="true" />
                    API Key
                  </label>
                  <span v-if="!aiSettingsInitializing" id="profile-ai-key-status" class="row-desc">
                    {{ t(currentProviderHasKey ? profileMessages.keyConfigured : profileMessages.keyNotConfigured) }}
                  </span>
                </div>
                <div class="row-control byok-control-wrap">
                  <div class="api-key-input-wrapper">
                    <input
                      id="profile-ai-key"
                      v-model="customApiKey"
                      :type="showApiKey ? 'text' : 'password'"
                      class="settings-input byok-input byok-key-input"
                      :aria-describedby="aiSettingsInitializing ? undefined : 'profile-ai-key-status'"
                      autocomplete="new-password"
                    />
                    <button
                      type="button"
                      class="eye-toggle-btn"
                      :title="t(showApiKey ? profileMessages.hideKey : profileMessages.showKey)"
                      @click="showApiKey = !showApiKey"
                    >
                      <IconEyeOff v-if="showApiKey" :size="15" />
                      <IconEye v-else :size="15" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="settings-row byok-field-row">
                <div class="row-info">
                  <label class="row-label setting-label-with-icon" for="profile-ai-model">
                    <IconMessages class="setting-icon" aria-hidden="true" />
                    {{ t(profileMessages.chatModel) }}
                  </label>
                </div>
                <div class="row-control byok-control-wrap">
                  <div class="byok-model-detect-group">
                    <input
                      id="profile-ai-model"
                      v-model="customChatModel"
                      type="text"
                      class="settings-input byok-input byok-model-input"
                      :placeholder="t(profileMessages.modelPlaceholder)"
                    />
                    <button
                      class="action-btn byok-detect-btn"
                      :disabled="detectingModels || aiSettingsBusy"
                      @click="handleDetectModels"
                    >
                      {{ t(detectingModels ? profileMessages.detectingModels : profileMessages.detectModels) }}
                    </button>
                  </div>
                  <!-- 自动检测模型快速选取托盘 -->
                  <div v-if="detectedModels.length > 0" class="detected-models-tray">
                    <span class="tray-label">{{ t(profileMessages.modelCandidates, { count: detectedModels.length }) }}</span>
                    <div class="tray-chips">
                      <button
                        v-for="m in detectedModels"
                        :key="m"
                        type="button"
                        class="model-chip"
                        :class="{ 'is-selected': customChatModel === m }"
                        @click="selectDetectedModel(m)"
                      >
                        {{ m }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="byok-action-footer ai-section-content">
              <span class="byok-tip">{{ t(aiSettingsInitializing ? profileMessages.loadingAiSettings : profileMessages.saveBeforeTest) }}</span>
              <div class="byok-btn-group">
                <button
                  class="action-btn"
                  :disabled="testingConnection || aiSettingsBusy"
                  @click="handleTestConnection"
                >
                  {{ t(testingConnection ? profileMessages.testingConnection : profileMessages.testConnection) }}
                </button>
                <button
                  class="action-btn primary"
                  :disabled="aiSettingsBusy"
                  @click="handleSaveAiSettings"
                >
                  {{ t(aiSettingsLoading ? profileMessages.saving : profileMessages.saveAiSettings) }}
                </button>
              </div>
            </div>
          </div>

          <div class="ai-settings-section" role="group" aria-labelledby="profile-ai-usage-title">
            <div class="ai-subheader">
              <h4 id="profile-ai-usage-title" class="group-title ai-subtitle setting-label-with-icon">
                <IconGauge class="setting-icon" aria-hidden="true" />
                {{ t(profileMessages.aiUsage) }}
              </h4>
              <button v-if="aiUsage && !loadingAiUsage && !aiUsageError" class="action-btn secondary" type="button" @click="fetchAiUsage">
                {{ t(profileMessages.refresh) }}
              </button>
            </div>

            <div class="ai-section-content">
              <div v-if="loadingAiUsage" class="usage-loading">{{ t(profileMessages.loading) }}</div>
              <div v-else-if="aiUsageError" class="usage-error">
                <span>{{ aiUsageError }}</span>
                <button class="action-btn secondary" @click="fetchAiUsage">{{ t(profileMessages.retry) }}</button>
              </div>
              <div v-else-if="aiUsage" class="usage-content">
                <!-- Hourly -->
                <div class="usage-card">
                  <div class="usage-card-header">
                    <div class="usage-header-left">
                      <span class="usage-plan-name">{{ t(profileMessages.hourlyLimit) }}</span>
                      <span class="usage-percent-badge" :class="{ 'is-low': hourlyUsagePercent < 20 }">{{ t(profileMessages.remainingPercent, { percent: hourlyUsagePercent }) }}</span>
                    </div>
                    <span class="usage-reset-tag">{{ t(profileMessages.resetTime, { time: new Date(aiUsage.hourly.resetAt).toLocaleTimeString(locale) }) }}</span>
                  </div>
                  <!-- 进度条 -->
                  <div class="usage-progress-bar-wrap">
                    <div class="usage-progress-bar-fill" :style="{ width: hourlyUsagePercent + '%' }" :class="{ 'is-low': hourlyUsagePercent < 20 }"></div>
                  </div>
                  <div class="usage-grid">
                    <div class="usage-stat-box">
                      <span class="usage-stat-label">{{ t(profileMessages.totalLimit) }}</span>
                      <span class="usage-stat-val">{{ aiUsage.hourly.limitTokens }} token</span>
                    </div>
                    <div class="usage-stat-box">
                      <span class="usage-stat-label">{{ t(profileMessages.remainingLimit) }}</span>
                      <span class="usage-stat-val accent">{{ aiUsage.hourly.remainingTokens }} token</span>
                    </div>
                    <div class="usage-stat-box" >
                      <span class="usage-stat-label">{{ t(profileMessages.usedLimit) }}</span>
                      <span class="usage-stat-val">{{ aiUsage.hourly.chargedTokens }} token</span>
                    </div>
                    <div class="usage-stat-box" >
                      <span class="usage-stat-label">{{ t(profileMessages.reservedLimit) }}</span>
                      <span class="usage-stat-val">{{ aiUsage.hourly.reservedTokens }} token</span>
                    </div>
                  </div>
                </div>

                <!-- Daily -->
                <div class="usage-card">
                  <div class="usage-card-header">
                    <div class="usage-header-left">
                      <span class="usage-plan-name">{{ t(profileMessages.dailyLimit) }}</span>
                      <span class="usage-percent-badge" :class="{ 'is-low': dailyUsagePercent < 20 }">{{ t(profileMessages.remainingPercent, { percent: dailyUsagePercent }) }}</span>
                    </div>
                    <span class="usage-reset-tag">{{ t(profileMessages.resetTime, { time: new Date(aiUsage.daily.resetAt).toLocaleString(locale) }) }}</span>
                  </div>
                  <!-- 进度条 -->
                  <div class="usage-progress-bar-wrap">
                    <div class="usage-progress-bar-fill" :style="{ width: dailyUsagePercent + '%' }" :class="{ 'is-low': dailyUsagePercent < 20 }"></div>
                  </div>
                  <div class="usage-grid">
                    <div class="usage-stat-box">
                      <span class="usage-stat-label">{{ t(profileMessages.totalLimit) }}</span>
                      <span class="usage-stat-val">{{ aiUsage.daily.limitTokens }} token</span>
                    </div>
                    <div class="usage-stat-box">
                      <span class="usage-stat-label">{{ t(profileMessages.remainingLimit) }}</span>
                      <span class="usage-stat-val accent">{{ aiUsage.daily.remainingTokens }} token</span>
                    </div>
                    <div class="usage-stat-box" :title="t(profileMessages.usageEstimation)">
                      <span class="usage-stat-label">{{ t(profileMessages.settledEstimate) }}</span>
                      <span class="usage-stat-val">{{ aiUsage.daily.chargedTokens }} token</span>
                    </div>
                    <div class="usage-stat-box" :title="t(profileMessages.reservedEstimation)">
                      <span class="usage-stat-label">{{ t(profileMessages.reservedEstimate) }}</span>
                      <span class="usage-stat-val">{{ aiUsage.daily.reservedTokens }} token</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

    <!-- Password Change Modal (修改密码弹窗) -->
    <ChangePasswordDialog
      v-model="showPasswordModal"
      :submitting="pwdSubmitting"
      :error-message="pwdError"
      @submit="submitPasswordChange"
    />

    <!-- 隐藏的头像文件上传 input -->
    <input
      ref="avatarFileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleAvatarFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconActivity,
  IconCamera,
  IconChecklist,
  IconClock,
  IconCloud,
  IconCpu,
  IconDeviceDesktop,
  IconDevices,
  IconEye,
  IconEyeOff,
  IconFileDescription,
  IconFlame,
  IconGauge,
  IconId,
  IconKey,
  IconLanguage,
  IconLayoutRows,
  IconLink,
  IconMessages,
  IconMoon,
  IconNotes,
  IconRefresh,
  IconServer,
  IconShieldLock,
  IconSparkles,
  IconTextSize,
  IconTrendingUp,
  type Icon,
} from '@tabler/icons-vue'
import { isCurrentUsageRequest, nextRequestGeneration } from '@/services/aiUsageGuardHelper.ts'
import { useAuthApi, type SessionResponse } from '@/api/useAuthApi'
import {
  getAiSettings,
  getAiUsage,
  updateAiSettings,
  listAiModels,
  testAiConnection,
  normalizeProvider,
  type AiSettingsView,
  type AiUsageView,
  type CanonicalAiProvider,
} from '@/api/aiClient'
import { SyncOfflineError, useSyncStore } from '@/store/useSyncStore'
import { autoOverviewEnabled, autoSyncEnabled, setAutoOverviewEnabled, setAutoSyncEnabled } from '@/services/desktopPreferences'
import { useSettingsStore } from '@/store/useSettingsStore'
import { locale, localeOptions, setLocale, t, type Message } from '@/i18n'
import { profileMessages } from './profileMessages'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useStatsStore } from '@/store/useStatsStore'
import { useAuthStore } from '@/store/useAuthStore'
import { SyncScopeChangedError } from '@/api/request'
import { useSubjectStore } from '@/store/useSubjectStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { ElNotification, ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message-box.css'
import DocumentProcessingCenter from '@/components/documentProcessing/DocumentProcessingCenter.vue'
import ChangePasswordDialog from '@/components/profile/ChangePasswordDialog.vue'

const settingsStore = useSettingsStore()

const hourlyUsagePercent = computed(() => {
  if (!aiUsage.value?.hourly?.limitTokens) return 100
  const remaining = aiUsage.value.hourly.remainingTokens ?? 0
  const limit = aiUsage.value.hourly.limitTokens
  return Math.min(100, Math.max(0, Math.round((remaining / limit) * 100)))
})

const dailyUsagePercent = computed(() => {
  if (!aiUsage.value?.daily?.limitTokens) return 100
  const remaining = aiUsage.value.daily.remainingTokens ?? 0
  const limit = aiUsage.value.daily.limitTokens
  return Math.min(100, Math.max(0, Math.round((remaining / limit) * 100)))
})
const knowledgeStore = useKnowledgeStore()
const statsStore = useStatsStore()
const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const pomodoroStore = usePomodoroStore()
const router = useRouter()

const sessions = ref<SessionResponse[]>([])
const sessionsLoading = ref(false)
const sessionsError = ref<string | null>(null)
const revokingSessionId = ref<string | null>(null)

const accountName = computed(() => authStore.username || t(profileMessages.notSignedIn))
const deviceName = computed(() => authStore.serverDeviceId ? t(profileMessages.deviceId, { id: authStore.serverDeviceId.slice(0, 8) }) : t(profileMessages.noDevice))

const userInitial = computed(() => authStore.username?.charAt(0).toUpperCase() || 'A')

const continuousStudyDays = ref(1)

// === Avatar State & Methods ===
const userAvatarUrl = computed(() => authStore.avatarUrl)
const avatarFileInputRef = ref<HTMLInputElement | null>(null)

const loadAvatar = async () => {
  // authStore.loadAvatar() encapsulates IndexedDB avatar cache fallback and useAuthApi.getAvatarBlob() sync
  await authStore.loadAvatar()
}

const triggerAvatarUpload = () => {
  avatarFileInputRef.value?.click()
}

const handleAvatarFileSelected = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const mime = file.type?.toLowerCase() || ''
  if (!mime.includes('png') && !mime.includes('jpeg') && !mime.includes('jpg')) {
    ElNotification({
      title: t(profileMessages.unsupportedImage),
      message: t(profileMessages.imageFormats),
      type: 'warning',
      duration: 3000,
    })
    target.value = ''
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    ElNotification({
      title: t(profileMessages.imageTooLarge),
      message: t(profileMessages.avatarSizeLimit),
      type: 'warning',
      duration: 3000,
    })
    target.value = ''
    return
  }

  const requestedUserId = authStore.user?.id
  try {
    await useAuthApi.uploadAvatar(file)
    if (requestedUserId && authStore.user?.id === requestedUserId) {
      if (authStore.user) {
        authStore.user.hasAvatar = true
      }
      await authStore.setAvatarFromBlob(file, requestedUserId)
      void authStore.loadAvatar()
    }
    ElNotification({
      title: t(profileMessages.avatarUpdated),
      message: t(profileMessages.avatarSynced),
      type: 'success',
      duration: 2500,
    })
  } catch (err: any) {
    ElNotification({
      title: t(profileMessages.avatarUploadFailed),
      message: err?.problem?.detail || err?.message || t(profileMessages.avatarUploadRetry),
      type: 'error',
      duration: 3500,
    })
  } finally {
    target.value = ''
  }
}

const resetAvatar = async () => {
  const requestedUserId = authStore.user?.id
  try {
    await useAuthApi.resetAvatar()
    if (authStore.user) {
      authStore.user.hasAvatar = false
    }
    if (requestedUserId) await authStore.clearAvatar(requestedUserId)
    ElNotification({
      title: t(profileMessages.avatarReset),
      message: t(profileMessages.avatarResetDescription),
      type: 'info',
      duration: 2500,
    })
  } catch (err: any) {
    ElNotification({
      title: t(profileMessages.avatarResetFailed),
      message: err?.problem?.detail || err?.message || t(profileMessages.networkRetry),
      type: 'error',
      duration: 3000,
    })
  }
}

// === Password Modal State & Methods ===
const showPasswordModal = ref(false)
const pwdSubmitting = ref(false)
const pwdError = ref('')

const openPasswordModal = () => {
  pwdError.value = ''
  showPasswordModal.value = true
}

const submitPasswordChange = async ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
  pwdError.value = ''
  pwdSubmitting.value = true
  try {
    const baseVersion = authStore.user?.version ?? 0
    await useAuthApi.changePassword({
      baseVersion,
      currentPassword: oldPassword,
      newPassword: newPassword,
    })
    sessions.value = sessions.value.filter(isCurrentSession)
    showPasswordModal.value = false
    ElNotification({
      title: t(profileMessages.passwordChanged),
      message: t(profileMessages.passwordSessionsRevoked),
      type: 'success',
      duration: 4000,
    })
    await Promise.all([loadSessions(), authStore.fetchMe().catch(() => {})])
  } catch (err: any) {
    pwdError.value = err?.problem?.detail || err?.message || t(profileMessages.passwordUpdateFailed)
  } finally {
    pwdSubmitting.value = false
  }
}

// === Stats ===
const coreStats = ref([
  { label: profileMessages.knowledgeBlocks, value: '0', accent: false, icon: IconNotes },
  { label: profileMessages.completedTasks, value: '0', accent: false, icon: IconChecklist },
  { label: profileMessages.totalFocus, value: '0h', accent: true, icon: IconClock },
  { label: profileMessages.completedPomodoros, value: '0', accent: false, icon: IconFlame },
  { label: profileMessages.newThisWeek, value: '0', accent: false, icon: IconTrendingUp },
])

// === Week bars ===
const weekBars = ref<any[]>([])

// === Subjects ===
const subjects = ref<any[]>([])

const formatSessionDate = (value?: string) => {
  if (!value) return t(profileMessages.unknownDate)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? t(profileMessages.unknownDate) : parsed.toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' })
}

const isCurrentSession = (session: SessionResponse) => Boolean(session.current || session.serverDeviceId === authStore.serverDeviceId)

let sessionsLoadGeneration = 0
const loadSessions = async () => {
  const generation = ++sessionsLoadGeneration
  sessionsLoading.value = true
  sessionsError.value = null
  try {
    const response = await useAuthApi.listSessions()
    if (generation !== sessionsLoadGeneration) return
    sessions.value = response?.items ?? []
  } catch (error) {
    if (generation !== sessionsLoadGeneration) return
    sessionsError.value = error instanceof Error ? error.message : t(profileMessages.sessionsLoadFailed)
  } finally {
    if (generation === sessionsLoadGeneration) sessionsLoading.value = false
  }
}

const handleRevokeSession = async (session: SessionResponse) => {
  if (!session.id || isCurrentSession(session)) return
  revokingSessionId.value = session.id
  try {
    await useAuthApi.revokeSession(session.id)
    sessions.value = sessions.value.filter((item) => item.serverDeviceId !== session.serverDeviceId)
    ElNotification({ title: t(profileMessages.sessionRevoked), message: t(profileMessages.sessionRevokedDescription), type: 'success', duration: 3000 })
  } catch (error) {
    ElNotification({ title: t(profileMessages.sessionRevokeFailed), message: error instanceof Error ? error.message : t(profileMessages.retryLater), type: 'error', duration: 3000 })
  } finally {
    revokingSessionId.value = null
  }
}

const dayMapping: Record<string, string> = {
  'Mon': '一', 'Tue': '二', 'Wed': '三', 'Thu': '四', 'Fri': '五', 'Sat': '六', 'Sun': '日'
}

// === BYOK AI Settings ===
const defaultAiBaseUrls: Record<CanonicalAiProvider, string> = {
  DEEPSEEK: 'https://api.deepseek.com',
  SILICONFLOW: 'https://api.siliconflow.cn/v1',
  OPENAI_COMPATIBLE: '',
}

const defaultDeepSeekModel = 'deepseek-chat'
const customProvider = ref('DEEPSEEK')
const customChatModel = ref<string>(defaultDeepSeekModel)
const customBaseUrl = ref('')
const customApiKey = ref('')
const showApiKey = ref(false)
const aiSettingsList = ref<AiSettingsView[]>([])
const aiSettingsInitializing = ref(true)
const aiSettingsLoading = ref(false)
const detectingModels = ref(false)
const detectedModels = ref<string[]>([])
const testingConnection = ref(false)

const aiSettingsBusy = computed(() => aiSettingsInitializing.value || aiSettingsLoading.value)
const canonicalAiProvider = computed(() => normalizeProvider(customProvider.value))
const currentProviderSetting = computed(() =>
  aiSettingsList.value.find((item) => item.provider === canonicalAiProvider.value),
)
const currentProviderHasKey = computed(() => Boolean(currentProviderSetting.value?.hasApiKey))
const effectiveAiBaseUrl = computed(() => customBaseUrl.value.trim() || defaultAiBaseUrls[canonicalAiProvider.value])

const loadAiProviderForm = (provider: CanonicalAiProvider) => {
  const saved = currentProviderSetting.value
  customApiKey.value = ''
  showApiKey.value = false
  customBaseUrl.value = saved?.baseUrl ?? ''
  customChatModel.value = saved?.chatModel ?? (provider === 'DEEPSEEK' ? defaultDeepSeekModel : '')
}

watch(canonicalAiProvider, (provider) => loadAiProviderForm(provider), { flush: 'sync' })

let aiConnectionGeneration = 0
watch(
  [canonicalAiProvider, effectiveAiBaseUrl, customApiKey, currentProviderSetting],
  () => {
    aiConnectionGeneration++
    detectedModels.value = []
    detectingModels.value = false
  },
  { flush: 'sync' },
)

const getAiSettingsValidationError = (provider: CanonicalAiProvider): string | null => {
  if (provider !== 'DEEPSEEK' && !customChatModel.value.trim()) {
    return t(profileMessages.providerNeedsModel)
  }
  if (provider === 'OPENAI_COMPATIBLE' && !customBaseUrl.value.trim()) {
    return t(profileMessages.providerNeedsBaseUrl)
  }
  return null
}

const notifyAiSettingsValidationError = (message: string) => {
  ElNotification({ title: t(profileMessages.incompleteAiSettings), message, type: 'warning', duration: 3500 })
}

const requireSavedAiSettingsForProbe = (chatModel?: string): boolean => {
  const saved = currentProviderSetting.value
  if (saved?.hasApiKey && !customApiKey.value.trim() && saved.baseUrl === effectiveAiBaseUrl.value
    && (chatModel === undefined || saved.chatModel === chatModel)) {
    return true
  }
  ElNotification({
    title: t(profileMessages.saveAiBeforeProbe),
    message: t(profileMessages.saveAiBeforeProbeDescription),
    type: 'warning',
    duration: 3500,
  })
  return false
}

const handleDetectModels = async () => {
  if (detectingModels.value || aiSettingsBusy.value || !requireSavedAiSettingsForProbe()) return
  const canonical = canonicalAiProvider.value
  const generation = aiConnectionGeneration

  detectingModels.value = true
  try {
    const res = await listAiModels(canonical)
    if (generation !== aiConnectionGeneration || res.provider !== canonical) return
    const models = res.models || []
    detectedModels.value = models
    if (!customChatModel.value && models.length > 0) {
      customChatModel.value = models[0]
    }
    ElNotification({
      title: t(profileMessages.detectionComplete),
      message: t(profileMessages.detectionResult, { count: models.length }),
      type: 'success',
      duration: 3000,
    })
  } catch (error) {
    if (generation !== aiConnectionGeneration) return
    ElNotification({
      title: t(profileMessages.detectionFailed),
      message: error instanceof Error ? error.message : t(profileMessages.detectionFailedDescription),
      type: 'error',
      duration: 4000,
    })
  } finally {
    if (generation === aiConnectionGeneration) detectingModels.value = false
  }
}

const handleTestConnection = async () => {
  if (testingConnection.value || aiSettingsBusy.value) return
  const canonical = canonicalAiProvider.value
  const chatModel = customChatModel.value.trim() || (canonical === 'DEEPSEEK' ? defaultDeepSeekModel : '')
  if (!requireSavedAiSettingsForProbe(chatModel)) return
  const generation = aiConnectionGeneration

  testingConnection.value = true
  try {
    const res = await testAiConnection(canonical)
    if (generation !== aiConnectionGeneration || res.provider !== canonical) return
    if (res.reachable) {
      ElNotification({
        title: t(profileMessages.connectionSucceeded),
        message: t(profileMessages.verifiedModel, { provider: canonical, model: res.chatModel ?? '' }),
        type: 'success',
        duration: 3500,
      })
    } else {
      ElNotification({
        title: t(profileMessages.connectionFailed),
        message: t(profileMessages.connectionFailedDescription),
        type: 'warning',
        duration: 4000,
      })
    }
  } catch (error) {
    if (generation !== aiConnectionGeneration) return
    ElNotification({
      title: t(profileMessages.connectionTestFailed),
      message: error instanceof Error ? error.message : t(profileMessages.connectionTestFailedDescription),
      type: 'error',
      duration: 4500,
    })
  } finally {
    testingConnection.value = false
  }
}

const selectDetectedModel = (model: string) => {
  customChatModel.value = model
}

const loadAiSettings = async () => {
  try {
    const list = await getAiSettings()
    aiSettingsList.value = list || []
    if (customChatModel.value !== defaultDeepSeekModel || customBaseUrl.value || customApiKey.value) return

    const saved = currentProviderSetting.value ?? aiSettingsList.value[0]
    if (saved?.provider) customProvider.value = saved.provider
    loadAiProviderForm(canonicalAiProvider.value)
  } catch (error) {
    console.error('Failed to load AI settings:', error)
  } finally {
    aiSettingsInitializing.value = false
  }
}

const handleSaveAiSettings = async () => {
  if (aiSettingsBusy.value) return
  const canonical = canonicalAiProvider.value
  const validationError = getAiSettingsValidationError(canonical)
  if (validationError) {
    notifyAiSettingsValidationError(validationError)
    return
  }
  const key = customApiKey.value.trim()
  aiSettingsLoading.value = true
  try {
    const updated = await updateAiSettings({
      provider: canonical,
      baseUrl: effectiveAiBaseUrl.value,
      chatModel: customChatModel.value.trim() || defaultDeepSeekModel,
      apiKey: key || undefined,
    })
    if (canonical === canonicalAiProvider.value && key === customApiKey.value.trim()) customApiKey.value = ''
    const idx = aiSettingsList.value.findIndex((item) => item.provider === canonical)
    if (idx >= 0) {
      aiSettingsList.value[idx] = updated
    }
    if (idx < 0) aiSettingsList.value.push(updated)
    ElNotification({ title: t(profileMessages.aiSettingsSaved), message: t(profileMessages.providerSaved, { provider: canonical }), type: 'success', duration: 3000 })
  } catch (error) {
    ElNotification({ title: t(profileMessages.saveFailed), message: error instanceof Error ? error.message : t(profileMessages.retryLater), type: 'error', duration: 3000 })
  } finally {
    aiSettingsLoading.value = false
  }
}

const syncStore = useSyncStore()
const hasPendingFocusSessions = computed(() => pomodoroStore.pendingSessions.length > 0)

const syncStatusText = computed(() => {
  if (syncStore.isSyncing) return t(profileMessages.syncing)
  if (syncStore.lastSyncError) return t(profileMessages.syncError, { error: syncStore.lastSyncError })
  if (syncStore.resetRequired) return t(profileMessages.resetRequired)
  if (!autoSyncEnabled.value) return t(profileMessages.syncPaused)
  if (hasPendingFocusSessions.value) return t(profileMessages.pendingFocus)
  return t(profileMessages.synced)
})

const loadStats = async () => {
  try {
    await statsStore.loadDashboard()
    const overview = statsStore.overview
    const weekly = statsStore.weekly

    const activeDays = weekly.days.filter((day) => day.focusSeconds > 0)
    continuousStudyDays.value = activeDays.length || 0
    
    coreStats.value[0].value = String(overview.activeKnowledgeBlocks)
    coreStats.value[1].value = String(overview.activeTasks)
    coreStats.value[2].value = (overview.focusSeconds / 3600).toFixed(1) + 'h'
    coreStats.value[3].value = String(overview.focusCompletedCount)
    coreStats.value[4].value = String(weekly.days.reduce((sum, day) => sum + day.createdKnowledgeCount, 0))

    // Map week bars
    const maxSeconds = Math.max(...weekly.days.map((day) => day.focusSeconds), 3600)
    const todayStr = new Date().toISOString().slice(0, 10)
    weekBars.value = weekly.days.map((day) => ({
      day: dayMapping[new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' })] || day.date.slice(5),
      pct: Math.round((day.focusSeconds * 100) / maxSeconds),
      today: day.date === todayStr
    }))

    // Load knowledge blocks to accurately count knowledge blocks per subject
    try {
      await knowledgeStore.loadLocalBlocks()
    } catch {
      // ignore
    }
    if (subjectStore.subjects.length === 0) {
      try {
        await subjectStore.loadSubjects()
      } catch {
        // ignore
      }
    }
    const blocks = knowledgeStore.recentBlocks || []

    const blockCountBySubject = new Map<string, number>()
    for (const b of blocks) {
      if (b.deletedAt) continue
      const idKey = b.subjectId
      const nameKey = b.subject
      if (idKey) {
        blockCountBySubject.set(idKey, (blockCountBySubject.get(idKey) || 0) + 1)
      } else if (nameKey) {
        blockCountBySubject.set(nameKey, (blockCountBySubject.get(nameKey) || 0) + 1)
      }
    }

    // Map subjects from store
    if (subjectStore.subjects.length > 0) {
      const colors = ['#8B9A6E', '#C89B6D', '#6B8E9B', '#9D85A8', '#8FA87D']
      const subjectList = subjectStore.subjects.map((subj) => {
        const count = blockCountBySubject.get(subj.id) ?? blockCountBySubject.get(subj.name) ?? 0
        return {
          id: subj.id,
          name: subj.name,
          count,
        }
      })
      subjectList.sort((a, b) => b.count - a.count)
      const top5 = subjectList.slice(0, 5)
      const maxCount = Math.max(...top5.map((s) => s.count), 1)

      subjects.value = top5.map((subj, idx) => ({
        name: subj.name,
        color: colors[idx % colors.length],
        count: subj.count,
        pct: subj.count > 0 ? Math.max(10, Math.round((subj.count * 100) / maxCount)) : 0,
      }))
    } else {
      subjects.value = []
    }
  } catch (e) {
    console.error('Failed to load stats:', e)
  }
}

// === Settings ===
type ToggleSetting = { id: 'dark' | 'compact' | 'auto_sync' | 'auto_overview'; label: Message; type: 'toggle'; value: boolean }
type SettingItem = (ToggleSetting | { id: 'lang' | 'font_size' | 'sync_status'; label: Message; type: 'select' | 'status' }) & { icon: Icon }

const settingGroups = reactive<{ id: string; title: Message; icon: Icon; items: SettingItem[] }[]>([
  {
    id: 'display',
    title: profileMessages.display,
    icon: IconDeviceDesktop,
    items: [
      { id: 'dark', label: profileMessages.darkMode, icon: IconMoon, type: 'toggle', get value() { return settingsStore.isDark } },
      { id: 'compact', label: profileMessages.compactLayout, icon: IconLayoutRows, type: 'toggle', get value() { return settingsStore.compactLayout } },
      { id: 'lang', label: profileMessages.interfaceLanguage, icon: IconLanguage, type: 'select' },
      { id: 'font_size', label: profileMessages.baseFontSize, icon: IconTextSize, type: 'select' },
    ],
  },
  {
    id: 'sync',
    title: profileMessages.syncAndData,
    icon: IconCloud,
    items: [
      { id: 'sync_status', label: profileMessages.syncStatus, icon: IconActivity, type: 'status' },
      { id: 'auto_sync', label: profileMessages.autoSync, icon: IconRefresh, type: 'toggle', get value() { return autoSyncEnabled.value } },
    ],
  },
])

const syncButtonMessage = shallowRef(profileMessages.syncNow)
let syncFeedbackTimer: ReturnType<typeof setTimeout> | undefined

const autoOverviewSetting = reactive({
  id: 'auto_overview',
  label: profileMessages.autoOverview,
  type: 'toggle',
  get value() { return autoOverviewEnabled.value },
} satisfies ToggleSetting)

const handleToggle = (item: ToggleSetting) => {
  if (item.id === 'dark') {
    settingsStore.toggleDark()
    return
  }
  if (item.id === 'compact') {
    settingsStore.compactLayout = !settingsStore.compactLayout
    return
  }
  const enabled = !item.value
  if (item.id === 'auto_sync') setAutoSyncEnabled(enabled)
  if (item.id === 'auto_overview') setAutoOverviewEnabled(enabled)
  ElNotification({
    title: t(profileMessages.settingsUpdated),
    message: t(enabled ? profileMessages.preferenceEnabled : profileMessages.preferenceDisabled, { label: t(item.label) }),
    type: 'success',
    duration: 2000,
  })
}

const handleSyncNow = async () => {
  const generation = authStore.loginGeneration
  clearTimeout(syncFeedbackTimer)
  syncButtonMessage.value = profileMessages.syncingButton
  try {
    await syncStore.flushNow()
    if (authStore.loginGeneration !== generation) return
    await loadStats()
    if (authStore.loginGeneration !== generation) return
    if (hasPendingFocusSessions.value) {
      syncButtonMessage.value = profileMessages.pendingRecordsButton
      ElNotification({ title: t(profileMessages.pendingFocusUpload), message: t(profileMessages.pendingFocusDescription), type: 'warning', duration: 3000 })
      return
    }
    syncButtonMessage.value = profileMessages.syncSucceededButton
    ElNotification({ title: t(profileMessages.syncCompleted), message: t(profileMessages.syncCompletedDescription), type: 'success', duration: 3000 })
  } catch (e) {
    if (authStore.loginGeneration !== generation || e instanceof SyncScopeChangedError) return
    syncButtonMessage.value = profileMessages.syncFailedButton
    const message = e instanceof SyncOfflineError ? profileMessages.syncOfflineDescription : profileMessages.syncFailedDescription
    ElNotification({ title: t(profileMessages.syncFailed), message: t(message), type: 'error', duration: 3000 })
  } finally {
    syncFeedbackTimer = setTimeout(() => { syncButtonMessage.value = profileMessages.syncNow }, 2500)
  }
}

onMounted(async () => {
  void loadAiSettings()
  void pomodoroStore.initialize().then(() => {
    if (hasPendingFocusSessions.value) syncStore.requestBackgroundSync('read')
  }).catch((error) => console.error('Failed to initialize focus sessions:', error))
  await loadAvatar()
  await loadStats()
  await loadSessions()
})

watch(() => pomodoroStore.syncRevision, (revision, previous) => {
  if (revision > previous) void loadStats()
})



const handleLogout = async () => {
  const generation = authStore.loginGeneration
  try {
    const action = await ElMessageBox.confirm(t(profileMessages.confirmSignOut), t(profileMessages.signOut), {
      confirmButtonText: t(profileMessages.confirmExit),
      cancelButtonText: t(profileMessages.cancel),
      type: 'warning',
    })
    if (action !== 'confirm') return
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.warn('[Profile] ElMessageBox confirm exception, proceeding with logout:', error)
  }
  if (authStore.loginGeneration !== generation) return

  try {
    await authStore.logout()
    if (authStore.isAuthenticated) return
    ElNotification({ title: t(profileMessages.signedOut), message: t(profileMessages.seeYouAgain), type: 'success', duration: 2000 })
  } catch (error) {
    if (error instanceof SyncScopeChangedError || authStore.isAuthenticated) return
    console.warn('[Profile] authStore.logout error, local session cleared:', error)
    ElNotification({ title: t(profileMessages.signOutError), message: t(profileMessages.signOutErrorDescription), type: 'warning', duration: 3000 })
  }
  await router.push('/login').catch(() => {
    if (!authStore.isAuthenticated && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  })
}

const handleResetOfflineData = async () => {
  try {
    await ElMessageBox.confirm(
      t(profileMessages.confirmLocalReset),
      t(profileMessages.clearOfflineData),
      {
        confirmButtonText: t(profileMessages.resetOfflineAction),
        cancelButtonText: t(profileMessages.cancel),
        type: 'warning',
      }
    )
    ElNotification({
      title: t(profileMessages.offlineDataReset),
      message: t(profileMessages.offlineDataResync),
      type: 'warning',
      duration: 4000,
    })
    await syncStore.resetOfflineData()
    await loadStats()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    console.error('重置离线数据失败:', error)
    ElNotification({
      title: t(profileMessages.resetFailed),
      message: error instanceof Error ? error.message : t(profileMessages.offlineResetRetry),
      type: 'error',
      duration: 4000,
    })
  }
}

const handleDeleteAccount = async () => {
  try {
    const { value: inputPwd } = await ElMessageBox.prompt(
      t(profileMessages.confirmAccountClose),
      t(profileMessages.accountCloseTitle),
      {
        confirmButtonText: t(profileMessages.confirmClose),
        cancelButtonText: t(profileMessages.cancel),
        inputType: 'password',
        inputPlaceholder: t(profileMessages.accountPasswordPlaceholder),
      }
    )
    if (!inputPwd) return

    try {
      const res = await useAuthApi.deleteAccount({ password: inputPwd })
      authStore.clearSession()
      ElNotification({
        title: t(profileMessages.accountCloseAccepted),
        message: t(profileMessages.accountCloseRequest, { id: res.id ? String(res.id).slice(0, 8) : t(profileMessages.referenceGenerated) }),
        type: 'warning',
        duration: 6000,
      })
      await router.push('/login')
    } catch (apiErr: any) {
      ElNotification({
        title: t(profileMessages.accountCloseFailed),
        message: apiErr?.problem?.detail || apiErr?.message || t(profileMessages.accountCloseFailedDescription),
        type: 'error',
        duration: 4000,
      })
    }
  } catch {
    // User cancelled
  }
}

// === AI Usage Guard B Logic ===
const aiUsage = ref<AiUsageView | null>(null)
const loadingAiUsage = ref(false)
const aiUsageError = ref<string>('')
let currentUsageRequestGeneration = 0
const currentUsageAccountIdentity = () => `${authStore.user?.id || ''}:${authStore.token || ''}`

const fetchAiUsage = async () => {
  if (!authStore.token) {
    aiUsage.value = null
    aiUsageError.value = ''
    loadingAiUsage.value = false
    return
  }
  const gen = nextRequestGeneration()
  const requestIdentity = currentUsageAccountIdentity()
  currentUsageRequestGeneration = gen
  loadingAiUsage.value = true
  aiUsageError.value = ''
  try {
    const res = await getAiUsage()
    if (!isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentUsageAccountIdentity())) return
    aiUsage.value = res
  } catch (err: any) {
    if (!isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentUsageAccountIdentity())) return
    aiUsage.value = null
    aiUsageError.value = err.message || t(profileMessages.aiUsageLoadFailed)
  } finally {
    if (isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentUsageAccountIdentity())) {
      loadingAiUsage.value = false
    }
  }
}

watch([() => authStore.token, () => authStore.user?.id], () => {
  currentUsageRequestGeneration = nextRequestGeneration()
  aiUsage.value = null
  aiUsageError.value = ''
  loadingAiUsage.value = false
  if (authStore.token) {
    fetchAiUsage()
  }
}, { flush: 'sync' })

onMounted(() => {
  if (authStore.token) {
    fetchAiUsage()
  }
})
// =============================
</script>

<style scoped>
/* ==========================================================================
   Auralis Profile Studio — Awwwards 获奖级视觉设计系统与微交互体系
   ========================================================================== */

/* ===== 1. Main Studio Layout ===== */
.profile-studio {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  background: var(--color-bg-secondary, #EEEEEE);
  padding: calc(14px - var(--card-padding-reduction)) calc(18px - var(--card-padding-reduction)) calc(18px - var(--card-padding-reduction));
  gap: calc(16px - var(--layout-gap-reduction));
  overflow: hidden;
  box-sizing: border-box;
}

/* ===== 2. LEFT PANEL: 数据透视与身份面板 (38%) ===== */
.studio-left {
  flex: 3.8;
  min-width: 380px;
  max-width: 480px;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  box-shadow: 
    0 10px 30px -4px rgba(35, 45, 30, 0.08), 
    0 2px 8px -1px rgba(0, 0, 0, 0.04);
  padding: calc(22px - var(--card-padding-reduction)) calc(20px - var(--card-padding-reduction));
  display: flex;
  flex-direction: column;
  gap: calc(16px - var(--layout-gap-reduction));
  box-sizing: border-box;
  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
.studio-left::-webkit-scrollbar {
  display: none;
}
.studio-left > * {
  flex-shrink: 0;
  max-width: 100%;
  box-sizing: border-box;
}

/* 2.1 用户基本资料卡 (User Profile Card) */
.user-profile-card {
  display: flex;
  align-items: center;
  gap: calc(16px - var(--layout-gap-reduction));
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  padding: calc(18px - var(--card-padding-reduction)) calc(20px - var(--card-padding-reduction));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
}
.user-profile-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(35, 45, 30, 0.06);
}

.avatar-wrap {
  position: relative;
  width: 58px;
  height: 58px;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 50%;
  box-shadow: 
    0 0 0 2px rgba(139, 154, 110, 0.25),
    0 4px 14px rgba(0, 0, 0, 0.08);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
}
.avatar-wrap:hover {
  transform: scale(1.04);
  box-shadow: 
    0 0 0 3px #8B9A6E,
    0 6px 20px rgba(139, 154, 110, 0.35);
}

.user-avatar-img {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.user-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8B9A6E 0%, #6E8052 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  color: #FAF7F2;
  letter-spacing: -0.5px;
}

.avatar-hover-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.avatar-wrap:hover .avatar-hover-overlay {
  opacity: 1;
}

.user-profile-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-edit-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-name {
  font-size: calc(17px + var(--ui-font-size-adjustment));
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.25;
}

.user-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.user-streak-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(200, 155, 109, 0.12);
  border: 0.5px solid rgba(200, 155, 109, 0.3);
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11.5px;
  color: #9E6D38;
  font-weight: 500;
  transition: all 0.2s ease;
}
.user-streak-pill:hover {
  background: rgba(200, 155, 109, 0.18);
  border-color: rgba(200, 155, 109, 0.4);
}
.streak-icon {
  color: #C89B6D;
}
.user-streak-pill strong {
  color: #875727;
  font-weight: 750;
  margin-left: 2px;
}

.device-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11.5px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-secondary, #4A4A45);
  border: 0.5px solid rgba(0, 0, 0, 0.08);
}

/* 2.2 核心学习指标 (Study Overview) */
.study-stats-card {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
}

.study-stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.study-stats-title {
  font-size: calc(13.5px + var(--ui-font-size-adjustment));
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.stat-cell {
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.stat-cell:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}
.stat-cell:hover {
  transform: translateY(-2px);
  border-color: rgba(139, 154, 110, 0.35);
  box-shadow: 0 4px 14px rgba(35, 45, 30, 0.06);
}

.stat-top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.stat-icon-wrap {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: rgba(139, 154, 110, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #637748;
  flex-shrink: 0;
}
.stat-icon {
  color: #637748;
}

.stat-label {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 550;
  color: var(--text-muted, #7A7A75);
}

.stat-value {
  font-size: calc(20px + var(--ui-font-size-adjustment));
  font-weight: 800;
  color: var(--text-primary, #1C1C1A);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.stat-value.accent {
  color: #637748;
}

/* 2.3 学科知识分布 (Subject Distribution) */
.subject-dist-card {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
}

.subject-dist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.subject-dist-title {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

.no-data-hint {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  text-align: center;
  padding: 14px 0;
}

.subject-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.subject-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.subject-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.subject-name {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 600;
  color: var(--text-secondary, #344139);
  width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.subject-bar-bg {
  flex: 1;
  height: 6px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 9999px;
  overflow: hidden;
}

.subject-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-count-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  min-width: 42px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* 2.4 Document Processing Center Integration */
.studio-left :deep(.processing-center) {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  padding: 16px 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
  box-sizing: border-box;
  max-width: 100%;
}
.studio-left :deep(.processing-center h3) {
  font-size: 13.5px;
  font-weight: 750;
}
.studio-left :deep(.processing-center p) {
  font-size: 12px;
}

/* 2.5 账号与安全凭证管理 (Account & Security) */
.account-card {
  --account-danger-text: #AB3734;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  padding: calc(16px - var(--card-padding-reduction)) calc(18px - var(--card-padding-reduction));
  display: flex;
  flex-direction: column;
  gap: calc(14px - var(--layout-gap-reduction));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
}

.account-card-title {
  margin: 0;
  padding-block-end: 12px;
  border-block-end: 1px solid var(--border-subtle);
  font-size: var(--font-size-body);
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

.account-detail {
  display: grid;
  grid-template-columns: 5em minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding-block: 4px;
  box-sizing: border-box;
  font-size: var(--font-size-body-sm);
}

.account-detail + .account-detail {
  border-top: 0.5px solid var(--border-subtle);
}

.cell-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.cell-val {
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.cell-sub {
  color: var(--text-muted);
}

.mini-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8B9A6E 0%, #6E8052 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-weight: 750;
  color: #FAF7F2;
  font-size: 13px;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.mini-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cell-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cell-btn {
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: var(--font-size-caption);
  font-weight: 650;
  border: 0.5px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  white-space: nowrap;
}
.cell-btn:hover {
  border-color: var(--border-strong);
  background: var(--color-bg-primary);
}
.cell-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* ===== 3. RIGHT PANEL: 分项设置控制台 (62%) ===== */
.studio-right {
  flex: 6.2;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  box-shadow: 
    0 10px 30px -4px rgba(35, 45, 30, 0.08), 
    0 2px 8px -1px rgba(0, 0, 0, 0.04);
  padding: calc(28px - var(--panel-padding-reduction)) calc(36px - var(--panel-padding-reduction));
  display: block;
  box-sizing: border-box;
  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
.studio-right::-webkit-scrollbar {
  display: none;
}

@media (max-width: 1150px) {
  .studio-left {
    min-width: 320px;
    flex: 3.5;
    padding: calc(16px - var(--card-padding-reduction)) calc(14px - var(--card-padding-reduction));
  }
  .studio-right {
    padding: calc(20px - var(--panel-padding-reduction)) calc(24px - var(--panel-padding-reduction));
  }
}
.studio-right > * {
  flex-shrink: 0;
  max-width: 980px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}

/* 3.1 标头区 (Swiss Editorial Typography) */
.settings-title {
  font-size: calc(24px + var(--ui-font-size-adjustment));
  font-weight: 850;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.03em;
  margin: 0 0 26px;
  line-height: 1.2;
}

/* 3.2 设置分组 (Settings Groups) */
.settings-group {
  flex-shrink: 0;
  margin-bottom: calc(22px - var(--layout-gap-reduction));
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.settings-group:hover {
  border-color: rgba(139, 154, 110, 0.28);
  box-shadow: 0 6px 20px rgba(35, 45, 30, 0.05);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(16px - var(--card-padding-reduction)) calc(22px - var(--card-padding-reduction));
  border-bottom: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  background: rgba(0, 0, 0, 0.012);
  min-height: 50px;
  box-sizing: border-box;
}

.group-title {
  font-size: calc(14.5px + var(--ui-font-size-adjustment));
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
  margin: 0;
}

.group-items {
  padding: 4px 0;
}

/* 3.3 设置项单行 (Settings Row) */
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(15px - var(--card-padding-reduction)) calc(22px - var(--card-padding-reduction));
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.05);
  gap: 20px;
  min-height: 54px;
  box-sizing: border-box;
  transition: background 0.2s ease;
}
.settings-row:last-child {
  border-bottom: none;
}
.settings-row:hover {
  background: rgba(139, 154, 110, 0.035);
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.row-label {
  font-size: calc(13.5px + var(--ui-font-size-adjustment));
  font-weight: 650;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.15px;
}

.row-desc {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  color: var(--text-muted, #7A7A75);
  line-height: 1.45;
}

.setting-label-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-muted);
  stroke-width: 1.8;
}

.group-header .setting-icon {
  color: var(--text-accent);
}

.setting-label-with-icon + .row-desc {
  margin-inline-start: 24px;
}

.row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
}

.sync-status-controls {
  gap: 8px;
  min-width: 0;
  flex-shrink: 1;
}

.sync-status-controls .status-pill-badge {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* 3.4 交互控件 (Controls: Toggle, Select, Input, Action Button) */
.toggle-btn {
  width: 46px;
  height: 26px;
  border-radius: 9999px;
  background: #D8D8D4;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s ease;
  flex-shrink: 0;
  padding: 0;
  outline: none;
}
.toggle-btn.is-on {
  background: #8B9A6E;
  box-shadow: 0 2px 10px rgba(139, 154, 110, 0.35);
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #FFFFFF;
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
.toggle-btn.is-on .toggle-knob {
  transform: translateX(20px);
}

.settings-select {
  appearance: none;
  -webkit-appearance: none;
  background-color: #FFFFFF;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237A7A75' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat !important;
  background-position: right 10px center !important;
  background-size: 14px 14px !important;
  border: 0.5px solid var(--border-default, #E6E6E4);
  border-radius: 12px;
  color: var(--text-primary, #1C1C1A);
  font-family: inherit;
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 550;
  padding: 7px 32px 7px 12px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.settings-select:focus {
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
}

.settings-input {
  background: #FFFFFF;
  border: 0.5px solid var(--border-default, #E6E6E4);
  border-radius: 12px;
  color: var(--text-primary, #1C1C1A);
  font-family: inherit;
  font-size: calc(12px + var(--ui-font-size-adjustment));
  padding: 7px 12px;
  width: 230px;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.settings-input:focus {
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
}

.action-btn {
  padding: 7px 18px;
  border-radius: 9999px;
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 650;
  cursor: pointer;
  border: 0.5px solid var(--border-default, #E6E6E4);
  background: #FFFFFF;
  color: var(--text-secondary, #344139);
  font-family: inherit;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.action-btn:hover {
  border-color: #8B9A6E;
  color: #637748;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(35, 45, 30, 0.06);
}
.action-btn:active {
  transform: scale(0.97);
}

.action-btn.primary {
  background: linear-gradient(135deg, #8B9A6E 0%, #6E8052 100%);
  border-color: transparent;
  color: #FAF7F2;
  box-shadow: 0 3px 12px rgba(139, 154, 110, 0.3);
}
.action-btn.primary:hover {
  box-shadow: 0 5px 16px rgba(139, 154, 110, 0.42);
  transform: translateY(-1.5px);
}

.status-pill-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  font-size: 12px;
  color: var(--text-secondary, #344139);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.status-pill-badge.is-warning {
  border-color: rgba(212, 168, 126, 0.4);
  background: rgba(212, 168, 126, 0.08);
}
.status-pill-badge.is-warning .status-dot-indicator {
  background: #C49A6C;
  box-shadow: 0 0 6px rgba(196, 154, 108, 0.6);
}

.status-dot-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8B9A6E;
  display: inline-block;
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.6);
}


/* ===== 4. AI 设置与使用额度 (AI Settings) ===== */
.ai-overview-row {
  border-bottom: 0;
}

.ai-settings-section {
  padding: 20px 22px;
  border-top: 0.5px solid var(--border-subtle);
}

.ai-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.ai-subtitle {
  font-size: var(--font-size-body-sm);
}

.ai-section-content {
  border-inline-start: 1px solid var(--border-subtle);
  margin-inline-start: 7px;
  padding-inline-start: 12px;
}

.ai-settings-section .byok-field-row {
  padding: 10px 0;
}

.usage-loading {
  color: var(--text-muted, #7A7A75);
  font-size: 13px;
  padding: 12px 0;
}

.usage-error {
  color: #C2413E;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}

.usage-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.usage-card {
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.usage-card:hover {
  border-color: rgba(139, 154, 110, 0.3);
  box-shadow: 0 4px 12px rgba(35, 45, 30, 0.04);
}

.usage-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.usage-plan-name {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

.usage-reset-tag {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  background: rgba(0, 0, 0, 0.035);
  padding: 2px 8px;
  border-radius: 9999px;
  font-variant-numeric: tabular-nums;
}

.usage-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.usage-stat-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(255, 255, 255, 0.6);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  padding: 8px 10px;
}

.usage-stat-label {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  font-weight: 550;
}

.usage-stat-val {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  font-variant-numeric: tabular-nums;
}
.usage-stat-val.accent {
  color: #637748;
}

/* ===== 5. AI BYOK 配置区 (BYOK Settings) ===== */
.byok-control-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: 1;
  max-width: 380px;
}

.byok-input {
  width: 100% !important;
  max-width: 380px;
}

.byok-model-detect-group {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.byok-model-input {
  flex: 1;
}

.byok-detect-btn {
  padding: 7px 14px;
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}

.detected-models-tray {
  margin-top: 10px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.tray-label {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  font-weight: 550;
}
.tray-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.model-chip {
  border: 0.5px solid var(--border-default, #E6E6E4);
  background: #FFFFFF;
  color: var(--text-secondary, #344139);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}
.model-chip:hover {
  border-color: #8B9A6E;
  color: #637748;
  background: rgba(139, 154, 110, 0.08);
  transform: translateY(-1px);
}
.model-chip.is-selected {
  border-color: #8B9A6E;
  background: #8B9A6E;
  color: #FAF7F2;
  font-weight: 650;
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.3);
}

.byok-action-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  row-gap: 8px;
  column-gap: 16px;
  padding-top: 14px;
}
.byok-tip {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
}
.byok-btn-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-inline-start: auto;
}


/* ===== 6. 登录设备和数据重置 (Account Security) ===== */
.account-section-title {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-label);
  font-weight: 750;
}

.account-sessions,
.danger-zone {
  border-block-start: 1px solid var(--border-subtle);
  padding-block-start: 14px;
}

.account-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-end: 6px;
}

.account-section-title .setting-icon {
  color: var(--text-accent);
}

.account-section-body {
  margin-inline-start: 24px;
}

.session-empty {
  margin: 4px 0 2px;
  font-size: var(--font-size-caption);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}
.session-error {
  color: var(--account-danger-text);
}

.account-operation {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-block: 7px;
}

.account-operation + .account-operation {
  border-top: 0.5px solid var(--border-subtle);
}

.account-operation .row-label,
.account-operation .row-desc {
  overflow-wrap: anywhere;
}

.account-operation .row-label {
  font-size: var(--font-size-body-sm);
}

.session-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  min-width: 0;
}
.session-title-line .row-label {
  min-width: 0;
}
.session-current-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.16);
  border: 0.5px solid rgba(139, 154, 110, 0.28);
  color: #637748;
}

.cell-btn.danger {
  border-color: color-mix(in srgb, var(--account-danger-text) 28%, transparent);
  color: var(--account-danger-text);
}

.cell-btn.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--account-danger-text) 8%, transparent);
  border-color: var(--account-danger-text);
}

.cell-btn:focus-visible,
[aria-labelledby="profile-ai-title"] .toggle-btn:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}


/* ===== 8. 深色模式全面适配 (Dark Mode System) ===== */
html.dark .profile-studio {
  background: var(--color-bg-secondary, #1B201B);
}

html.dark .studio-left,
html.dark .studio-right {
  background: #1F241F;
  border-color: rgba(163, 177, 155, 0.16);
  box-shadow: 
    0 14px 36px rgba(0, 0, 0, 0.48), 
    0 2px 10px rgba(0, 0, 0, 0.35);
}

html.dark .user-profile-card,
html.dark .study-stats-card,
html.dark .subject-dist-card,
html.dark .account-card,
html.dark .settings-group,
html.dark .studio-left :deep(.processing-center) {
  background: #242A24;
  border-color: rgba(163, 177, 155, 0.16);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

html.dark .settings-group:hover {
  border-color: rgba(163, 177, 155, 0.3);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

html.dark .account-card {
  --account-danger-text: var(--color-danger);
}

html.dark .stat-cell,
html.dark .usage-card {
  background: #1F241F;
  border-color: rgba(163, 177, 155, 0.14);
}
html.dark .stat-cell:hover,
html.dark .usage-card:hover {
  border-color: rgba(163, 177, 155, 0.35);
}

html.dark .usage-stat-box {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(163, 177, 155, 0.12);
}

html.dark .settings-title,
html.dark .user-name,
html.dark .group-title,
html.dark .row-label,
html.dark .stat-value,
html.dark .subject-dist-title,
html.dark .subject-count-badge,
html.dark .account-card-title,
html.dark .cell-val,
html.dark .usage-plan-name,
html.dark .usage-stat-val {
  color: #FAF7F2;
}

html.dark .stat-label,
html.dark .row-desc,
html.dark .cell-sub,
html.dark .byok-tip,
html.dark .tray-label,
html.dark .usage-stat-label,
html.dark .usage-reset-tag {
  color: #9AA096;
}

html.dark .subject-name {
  color: #D6D2CA;
}

html.dark .subject-bar-bg {
  background: rgba(255, 255, 255, 0.08);
}

html.dark .settings-select,
html.dark .settings-input {
  background-color: #181D18;
  border-color: rgba(163, 177, 155, 0.22);
  color: #FAF7F2;
}
html.dark .settings-select:focus,
html.dark .settings-input:focus {
  border-color: #9AB08F;
  box-shadow: 0 0 0 3px rgba(154, 176, 143, 0.22);
}

html.dark .action-btn,
html.dark .model-chip {
  background: #1D231D;
  border-color: rgba(163, 177, 155, 0.22);
  color: #FAF7F2;
}
html.dark .action-btn:hover,
html.dark .model-chip:hover {
  border-color: #9AB08F;
  color: #9AB08F;
  background: #242A24;
}

html.dark .status-pill-badge {
  background: #181D18;
  border-color: rgba(163, 177, 155, 0.22);
  color: #FAF7F2;
}

html.dark .group-header {
  background: rgba(0, 0, 0, 0.12);
  border-color: rgba(163, 177, 155, 0.14);
}

html.dark .settings-row {
  border-bottom-color: rgba(255, 255, 255, 0.04);
}
html.dark .settings-row:hover {
  background: rgba(255, 255, 255, 0.025);
}

html.dark .device-pill {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(163, 177, 155, 0.16);
  color: #C0C5BD;
}

html.dark .session-current-pill {
  color: #9AB08F;
}

/* ===== 9. 精雕细琢微交互增强体系 (Refinements V2) ===== */

/* 9.2 分组标头分类图标徽章 (Group Icon Badges) */
.group-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.group-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(139, 154, 110, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #637748;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.settings-group:hover .group-icon-wrap {
  transform: scale(1.06);
  background: rgba(139, 154, 110, 0.18);
}
.group-title-texts {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 9.3 AI 使用额度进度条与高定胶囊 (AI Usage Progress) */
.usage-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.usage-percent-badge {
  font-size: 11px;
  font-weight: 700;
  color: #637748;
  background: rgba(139, 154, 110, 0.14);
  border: 0.5px solid rgba(139, 154, 110, 0.25);
  padding: 1px 8px;
  border-radius: 9999px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}
.usage-percent-badge.is-low {
  color: #C89B6D;
  background: rgba(200, 155, 109, 0.14);
  border-color: rgba(200, 155, 109, 0.3);
}

.usage-progress-bar-wrap {
  width: 100%;
  height: 6px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 12px;
}
.usage-progress-bar-fill {
  height: 100%;
  border-radius: 9999px;
  background: linear-gradient(90deg, #8B9A6E 0%, #6E8052 100%);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.5);
}
.usage-progress-bar-fill.is-low {
  background: linear-gradient(90deg, #D4A87E 0%, #C49A6C 100%);
  box-shadow: 0 0 6px rgba(212, 168, 126, 0.5);
}

/* 9.5 API Key 密码框与显隐小眼睛 (Eye Toggle) */
.api-key-input-wrapper {
  position: relative;
  width: 100%;
  max-width: 380px;
  display: flex;
  align-items: center;
}
.byok-key-input {
  padding-right: 36px !important;
}
.eye-toggle-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--text-muted, #7A7A75);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.eye-toggle-btn:hover {
  color: var(--text-primary, #1C1C1A);
  background: rgba(0, 0, 0, 0.05);
}

/* 9.6 高定 Select 自定义下拉箭头 */
.settings-select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 32px !important;
  background-color: #FFFFFF;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237A7A75' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat !important;
  background-position: right 12px center !important;
  background-size: 14px 14px !important;
}

/* 9.7 深色模式对应补充 */
html.dark .group-icon-wrap {
  background: rgba(139, 154, 110, 0.18);
  color: #9AB08F;
}
html.dark .settings-group:hover .group-icon-wrap {
  background: rgba(139, 154, 110, 0.28);
  color: #B8CCAF;
}

html.dark .usage-progress-bar-wrap {
  background: rgba(255, 255, 255, 0.08);
}
html.dark .usage-progress-bar-fill {
  background: linear-gradient(90deg, #9AB08F 0%, #768759 100%);
}
html.dark .usage-percent-badge {
  background: rgba(139, 154, 110, 0.2);
  border-color: rgba(139, 154, 110, 0.35);
  color: #9AB08F;
}

html.dark .eye-toggle-btn {
  color: #9AA096;
}
html.dark .eye-toggle-btn:hover {
  color: #FAF7F2;
  background: rgba(255, 255, 255, 0.08);
}

html.dark .settings-select {
  background-color: #181D18 !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239AA096' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: right 12px center !important;
  background-size: 14px 14px !important;
}

</style>
