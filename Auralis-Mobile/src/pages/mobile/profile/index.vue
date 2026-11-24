<template>
  <AppPageLayout anim-origin="slide-right">
    <view class="profile-page">
      <AppHeader title="我的" />

      <scroll-view scroll-y :show-scrollbar="false" class="content-scroll">
        <view class="profile-body">
          <!-- 1. 用户基本资料卡 -->
          <view class="user-profile-card zen-card">
            <view class="user-avatar">
              <text class="avatar-initial">{{ avatarInitial }}</text>
            </view>
            <view class="user-profile-meta">
              <view class="name-line">
                <text class="user-name">{{ displayName }}</text>
                <text v-if="authStore.username" class="user-handle">@{{ authStore.username }}</text>
              </view>
            </view>
          </view>

          <!-- 2. 核心学习指标 -->
          <view class="study-stats-card zen-card">
            <view class="card-head-between">
              <text class="card-heading">核心学习指标</text>
            </view>
            <StudyMetrics ref="metricsRef" variant="pc" />
          </view>

          <!-- 3. 学科知识分布 -->
          <view class="subject-dist-card zen-card">
            <view class="card-head-between">
              <text class="card-heading">学科知识分布</text>
            </view>
            <view v-if="subjectDistItems.length === 0" class="no-data-hint">
              <text>暂无学科分布统计</text>
            </view>
            <view v-else class="subject-list">
              <view v-for="sub in subjectDistItems" :key="sub.id" class="subject-row">
                <view class="subject-dot" :style="{ backgroundColor: sub.color }"></view>
                <text class="subject-name">{{ sub.name }}</text>
                <view class="subject-bar-bg">
                  <view
                    class="subject-bar-fill"
                    :style="{ width: `${sub.pct}%`, backgroundColor: sub.color }"
                  ></view>
                </view>
                <text class="subject-count-badge num-tabular">{{ sub.count }} 块</text>
              </view>
            </view>
          </view>

          <!-- 4. 个人偏好与设置 -->
          <text class="settings-section-title">个人偏好与设置</text>

          <!-- 4.1 同步与数据 -->
          <view class="settings-group zen-card">
            <view class="group-header">
              <view class="group-title-line">
                <LineIcon name="cloud" size="16px" color="var(--color-sage-ink)" />
                <text class="group-title">同步与数据</text>
              </view>
            </view>

            <view class="group-items">
              <view class="settings-row sync-status-row">
                <view class="row-info">
                  <view class="setting-label-with-icon">
                    <LineIcon name="activity" size="15px" color="var(--text-muted)" />
                    <text class="row-label">同步状态</text>
                  </view>
                </view>
                <view class="sync-status-controls">
                  <view class="status-pill-badge" :class="{ 'is-warning': syncStatusView.tone === 'warning' }">
                    <view class="status-dot-indicator"></view>
                    <text>{{ syncStatusView.label }}</text>
                  </view>
                  <view
                    class="action-btn primary"
                    :class="{ 'is-disabled': syncStore.isSyncing || syncStore.isResettingOffline }"
                    role="button"
                    @click="handleSyncNow"
                  >
                    <text>{{ syncButtonText }}</text>
                  </view>
                </view>
              </view>

              <view class="settings-row">
                <view class="row-info">
                  <view class="setting-label-with-icon">
                    <LineIcon name="refresh" size="15px" color="var(--text-muted)" />
                    <text class="row-label">自动同步</text>
                  </view>
                </view>
                <view class="row-control">
                  <view
                    class="toggle-btn"
                    :class="{ 'is-on': syncStore.autoSyncEnabled }"
                    role="switch"
                    :aria-checked="syncStore.autoSyncEnabled"
                    aria-label="自动同步"
                    @click="handleToggleAutoSync"
                  >
                    <view class="toggle-knob"></view>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <!-- 4.2 AI 设置（模型与服务 + 使用额度） -->
          <view class="settings-group zen-card">
            <view class="group-header">
              <view class="group-title-line">
                <LineIcon name="sparkles" size="16px" color="var(--color-sage-ink)" />
                <text class="group-title">AI 设置</text>
              </view>
            </view>

            <!-- AI 模型与服务 -->
            <view class="ai-settings-section first-ai-section">
              <view class="ai-subheader">
                <view class="setting-label-with-icon">
                  <LineIcon name="cpu" size="15px" color="var(--text-muted)" />
                  <text class="ai-subtitle">AI 模型与服务</text>
                </view>
              </view>

              <view class="ai-section-content">
                <view class="byok-field-row">
                  <view class="byok-row-head">
                    <view class="setting-label-with-icon">
                      <LineIcon name="server" size="14px" color="var(--text-muted)" />
                      <text class="byok-label">AI 服务商</text>
                    </view>
                  </view>
                  <input
                    class="pc-settings-input"
                    v-model="customProvider"
                    placeholder="例如 DEEPSEEK"
                    placeholder-style="color: #9A9A95;"
                    :disabled="aiBusy"
                  />
                </view>

                <view class="byok-field-row">
                  <view class="byok-row-head">
                    <view class="setting-label-with-icon">
                      <LineIcon name="link" size="14px" color="var(--text-muted)" />
                      <text class="byok-label">Base URL</text>
                    </view>
                    <text class="byok-hint">
                      {{ customProvider.trim() && canonicalAiProvider === 'OPENAI_COMPATIBLE' ? '兼容服务必填' : '留空使用默认地址' }}
                    </text>
                  </view>
                  <input
                    class="pc-settings-input"
                    v-model="customBaseUrl"
                    placeholder="例如 https://api.deepseek.com"
                    placeholder-style="color: #9A9A95;"
                    :disabled="aiBusy"
                  />
                </view>

                <view class="byok-field-row">
                  <view class="byok-row-head">
                    <view class="setting-label-with-icon">
                      <LineIcon name="key" size="14px" color="var(--text-muted)" />
                      <text class="byok-label">API Key</text>
                    </view>
                    <text v-if="!aiInitializing" class="byok-hint">
                      {{ currentProviderHasKey ? '已配置，留空保留' : '未配置' }}
                    </text>
                  </view>
                  <view class="api-key-wrapper">
                    <input
                      class="pc-settings-input api-key-input"
                      v-model="customApiKey"
                      placeholder="sk-..."
                      placeholder-style="color: #9A9A95;"
                      :password="!showApiKey"
                      :disabled="aiBusy"
                    />
                    <view
                      class="eye-toggle-btn"
                      role="button"
                      :aria-label="showApiKey ? '隐藏密钥' : '显示密钥'"
                      @click="showApiKey = !showApiKey"
                    >
                      <LineIcon :name="showApiKey ? 'eye-off' : 'eye'" size="15px" color="var(--text-muted)" />
                    </view>
                  </view>
                </view>

                <view class="byok-field-row">
                  <view class="byok-row-head">
                    <view class="setting-label-with-icon">
                      <LineIcon name="ai" size="14px" color="var(--text-muted)" />
                      <text class="byok-label">对话模型</text>
                    </view>
                  </view>
                  <view class="byok-model-detect-group">
                    <input
                      class="pc-settings-input byok-model-input"
                      v-model="customChatModel"
                      placeholder="例如 deepseek-chat"
                      placeholder-style="color: #9A9A95;"
                      :disabled="aiBusy"
                    />
                    <view
                      class="action-btn byok-detect-btn"
                      :class="{ 'is-disabled': detectingModels || aiBusy }"
                      role="button"
                      @click="fetchModelsForProvider"
                    >
                      <text>{{ detectingModels ? '检测中...' : '自动检测' }}</text>
                    </view>
                  </view>
                  <view v-if="availableModels.length > 0" class="detected-models-tray">
                    <text class="tray-label">检测到 {{ availableModels.length }} 个候选模型：</text>
                    <view class="chips-row">
                      <view
                        v-for="m in availableModels.slice(0, 10)"
                        :key="m"
                        class="model-chip"
                        :class="{ 'is-selected': customChatModel === m }"
                        role="button"
                        @click="customChatModel = m"
                      >
                        <text>{{ m }}</text>
                      </view>
                    </view>
                  </view>
                </view>
              </view>

              <view class="byok-action-footer ai-section-content">
                <text class="byok-tip">{{ aiInitializing ? '正在读取 AI 配置…' : '检测或测试前请先保存。' }}</text>
                <view class="byok-btn-group">
                  <view
                    class="action-btn"
                    :class="{ 'is-disabled': testingConnection || aiBusy }"
                    role="button"
                    @click="testProviderConnection"
                  >
                    <text>{{ testingConnection ? '测试中...' : '测试连接' }}</text>
                  </view>
                  <view
                    class="action-btn primary"
                    :class="{ 'is-disabled': aiBusy }"
                    role="button"
                    @click="saveAiSettings"
                  >
                    <text>{{ savingAi ? '保存中...' : '保存 AI 配置' }}</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- AI 使用额度 -->
            <view class="ai-settings-section">
              <view class="ai-subheader">
                <view class="setting-label-with-icon">
                  <LineIcon name="gauge" size="15px" color="var(--text-muted)" />
                  <text class="ai-subtitle">AI 使用额度</text>
                </view>
                <view
                  v-if="aiUsage && !loadingAiUsage && !aiUsageError"
                  class="action-btn secondary"
                  role="button"
                  aria-label="刷新额度"
                  @click="fetchAiUsage"
                >
                  <text>刷新</text>
                </view>
              </view>

              <view class="ai-section-content">
                <view v-if="loadingAiUsage && !aiUsage" class="quota-skeleton">
                  <view class="ui-shimmer shimmer-line"></view>
                  <view class="ui-shimmer shimmer-line"></view>
                </view>

                <view v-else-if="aiUsageError && !aiUsage" class="quota-error">
                  <text class="error-msg">{{ aiUsageError }}</text>
                  <view class="action-btn secondary" role="button" @click="fetchAiUsage">
                    <text>重试</text>
                  </view>
                </view>

                <view v-else-if="aiUsage" class="usage-content">
                  <!-- 每小时额度 -->
                  <view class="usage-card">
                    <view class="usage-card-header">
                      <view class="usage-header-left">
                        <text class="usage-plan-name">每小时额度</text>
                        <text class="usage-percent-badge num-tabular" :class="{ 'is-low': hourlyUsagePct < 20 }">
                          剩余 {{ hourlyUsagePct }}%
                        </text>
                      </view>
                      <text class="usage-reset-tag num-tabular">
                        重置时间: {{ formatResetClock(aiUsage.hourly.resetAt) || '—' }}
                      </text>
                    </view>
                    <view class="usage-progress-bar-wrap">
                      <view
                        class="usage-progress-bar-fill"
                        :class="{ 'is-low': hourlyUsagePct < 20 }"
                        :style="{ width: `${hourlyUsagePct}%` }"
                      ></view>
                    </view>
                    <view class="usage-grid">
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">总额度</text>
                        <text class="usage-stat-val num-tabular">{{ formatTokenCount(aiUsage.hourly.limitTokens) }}</text>
                      </view>
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">剩余额度</text>
                        <text class="usage-stat-val is-accent num-tabular">{{ formatTokenCount(aiUsage.hourly.remainingTokens) }}</text>
                      </view>
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">已用额度</text>
                        <text class="usage-stat-val num-tabular">{{ formatTokenCount(aiUsage.hourly.chargedTokens) }}</text>
                      </view>
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">预留额度</text>
                        <text class="usage-stat-val num-tabular">{{ formatTokenCount(aiUsage.hourly.reservedTokens) }}</text>
                      </view>
                    </view>
                  </view>

                  <!-- 每日额度 -->
                  <view class="usage-card">
                    <view class="usage-card-header">
                      <view class="usage-header-left">
                        <text class="usage-plan-name">每日额度</text>
                        <text class="usage-percent-badge num-tabular" :class="{ 'is-low': dailyUsagePct < 20 }">
                          剩余 {{ dailyUsagePct }}%
                        </text>
                      </view>
                      <text class="usage-reset-tag num-tabular">
                        重置时间: {{ formatResetTime(aiUsage.daily.resetAt) }}
                      </text>
                    </view>
                    <view class="usage-progress-bar-wrap">
                      <view
                        class="usage-progress-bar-fill"
                        :class="{ 'is-low': dailyUsagePct < 20 }"
                        :style="{ width: `${dailyUsagePct}%` }"
                      ></view>
                    </view>
                    <view class="usage-grid">
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">总额度</text>
                        <text class="usage-stat-val num-tabular">{{ formatTokenCount(aiUsage.daily.limitTokens) }}</text>
                      </view>
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">剩余额度</text>
                        <text class="usage-stat-val is-accent num-tabular">{{ formatTokenCount(aiUsage.daily.remainingTokens) }}</text>
                      </view>
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">已结算（估算）</text>
                        <text class="usage-stat-val num-tabular">{{ formatTokenCount(aiUsage.daily.chargedTokens) }}</text>
                      </view>
                      <view class="usage-stat-box">
                        <text class="usage-stat-label">在途预留（估算）</text>
                        <text class="usage-stat-val num-tabular">{{ formatTokenCount(aiUsage.daily.reservedTokens) }}</text>
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <!-- 5. 账号与安全凭证 -->
          <view class="account-card zen-card">
            <text class="account-card-title">账号与安全凭证</text>

            <!-- 5.1 账号资料 -->
            <view class="account-section">
              <view class="account-section-header">
                <view class="setting-label-with-icon">
                  <LineIcon name="id-card" size="15px" color="var(--color-sage-ink)" />
                  <text class="account-section-title">账号资料</text>
                </view>
              </view>
              <view class="account-section-body">
                <view class="account-detail">
                  <text class="cell-label">用户名</text>
                  <text class="cell-val">@{{ authStore.username || 'auralis' }}</text>
                </view>
                <view class="account-detail">
                  <text class="cell-label">显示名称</text>
                  <text class="cell-val">{{ displayName }}</text>
                  <view class="cell-btn" role="button" @click="openNameEditor">
                    <text>修改</text>
                  </view>
                </view>
                <view class="account-detail">
                  <text class="cell-label">登录密码</text>
                  <text class="cell-sub">••••••••</text>
                  <view class="cell-btn" role="button" @click="openPasswordSheet">
                    <text>修改</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- 5.2 登录设备管理 -->
            <view class="account-sessions">
              <view class="account-section-header">
                <view class="setting-label-with-icon">
                  <LineIcon name="device" size="15px" color="var(--color-sage-ink)" />
                  <text class="account-section-title">登录设备管理</text>
                </view>
                <view class="ui-icon-btn sm" role="button" aria-label="刷新设备列表" @click="loadSessions">
                  <LineIcon name="refresh" size="13px" color="var(--text-secondary)" />
                </view>
              </view>
              <view class="account-section-body">
                <view v-if="loadingSessions && sessionsList.length === 0" class="quota-skeleton">
                  <view class="ui-shimmer shimmer-line"></view>
                </view>
                <view v-else-if="sessionsError" class="quota-error">
                  <text class="error-msg">{{ sessionsError }}</text>
                  <view class="cell-btn" role="button" @click="loadSessions">
                    <text>重试</text>
                  </view>
                </view>
                <text v-else-if="sessionsList.length === 0" class="session-empty">暂无登录设备记录</text>
                <view v-else class="sessions-list">
                  <view v-for="s in sessionsList" :key="s.id || s.serverDeviceId" class="account-operation session-item">
                    <view class="session-meta">
                      <view class="session-title-line">
                        <text class="row-label">{{ s.deviceName || s.platform || '未知设备' }}</text>
                        <text v-if="isCurrentSession(s)" class="session-current-pill">当前设备</text>
                      </view>
                      <text class="row-sub num-tabular">
                        {{ s.platform || 'UNKNOWN' }} · 最近活跃 {{ formatResetTime(s.lastUsedAt || s.createdAt || '') }}
                      </text>
                    </view>
                    <view
                      v-if="!isCurrentSession(s) && s.id"
                      class="cell-btn danger"
                      :class="{ 'is-disabled': revokingAllOthers || Boolean(revokingSessionId) }"
                      role="button"
                      @click="revokeDevice(s.id)"
                    >
                      <text>{{ revokingSessionId === s.id ? '下线中...' : '下线' }}</text>
                    </view>
                  </view>
                  <view
                    v-if="sessionsList.some(item => !isCurrentSession(item))"
                    class="ui-btn ui-btn-danger sm revoke-all-btn"
                    :class="{ 'is-disabled': revokingAllOthers || Boolean(revokingSessionId) }"
                    role="button"
                    @click="revokeAllOthers"
                  >
                    <text>{{ revokingAllOthers ? '下线中...' : '下线全部其他设备' }}</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- 5.3 数据与账户重置 -->
            <view class="danger-zone">
              <view class="account-section-header">
                <view class="setting-label-with-icon">
                  <LineIcon name="shield" size="15px" color="var(--color-sage-ink)" />
                  <text class="account-section-title">数据与账户重置</text>
                </view>
              </view>
              <view class="account-section-body">
                <view class="account-operation">
                  <view class="row-info">
                    <text class="row-label">重置本地离线数据</text>
                    <text class="row-desc">清除本机离线数据和未同步草稿，并重新同步云端</text>
                  </view>
                  <view
                    class="cell-btn danger"
                    :class="{ 'is-disabled': syncStore.isResettingOffline }"
                    role="button"
                    @click="handleResetOfflineData"
                  >
                    <text>{{ syncStore.isResettingOffline ? '重置中...' : '重置' }}</text>
                  </view>
                </view>

                <view class="account-operation">
                  <view class="row-info">
                    <text class="row-label">注销账户</text>
                    <text class="row-desc">停用账户并清理云端数据</text>
                  </view>
                  <view class="cell-btn danger" role="button" @click="openDeleteAccountSheet">
                    <text>注销</text>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <!-- 6. 退出登录 -->
          <view class="ui-btn ui-btn-danger logout-btn" role="button" @click="handleLogout">
            <LineIcon name="logout" size="16px" color="var(--color-danger)" />
            <text>退出登录</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <template #overlay>
      <view v-if="showNameSheet" class="zen-sheet-mask" @click="closeAllSheets">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">修改显示名称</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeAllSheets">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>
          <view class="sheet-form">
            <input class="ui-input" v-model="nameDraft" maxlength="64" placeholder="输入显示名称" :disabled="savingName" />
            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="savingName" :disabled="savingName" @click="submitDisplayName">
              保存
            </button>
          </view>
        </view>
      </view>

      <view v-if="showPasswordSheet" class="zen-sheet-mask" @click="closeAllSheets">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">修改密码</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeAllSheets">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>
          <view class="sheet-form">
            <text class="sheet-hint">密码至少 8 位，且包含大写字母、小写字母和符号。</text>
            <input class="ui-input" v-model="pwdForm.currentPassword" password placeholder="当前密码" :disabled="savingPwd" />
            <input class="ui-input" v-model="pwdForm.newPassword" password placeholder="新密码" :disabled="savingPwd" />
            <input class="ui-input" v-model="pwdForm.confirmPassword" password placeholder="确认新密码" :disabled="savingPwd" />
            <text v-if="pwdError" class="sheet-error">{{ pwdError }}</text>
            <button class="ui-btn ui-btn-primary sheet-submit-btn" :loading="savingPwd" :disabled="savingPwd" @click="submitPasswordChange">
              确认修改
            </button>
          </view>
        </view>
      </view>

      <view v-if="showDeleteAccountSheet" class="zen-sheet-mask" @click="closeAllSheets">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">注销账户确认</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeAllSheets">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>
          <view class="sheet-form">
            <text class="sheet-hint">
              确认注销后，本机会退出登录，服务端会停用账户并在后台清理云端数据。本机保存的业务数据会保留。请输入登录密码确认注销。
            </text>
            <input
              class="ui-input"
              v-model="deletePwd"
              password
              placeholder="请输入当前账号密码"
              :disabled="deletingAccount"
            />
            <text v-if="deleteAccountError" class="sheet-error">{{ deleteAccountError }}</text>
            <view class="sheet-dual-actions">
              <view class="ui-btn ui-btn-secondary sheet-dual-btn" role="button" @click="closeAllSheets">
                <text>取消</text>
              </view>
              <button
                class="ui-btn ui-btn-danger sheet-dual-btn danger-confirm-btn"
                :loading="deletingAccount"
                :disabled="deletingAccount"
                @click="submitDeleteAccount"
              >
                确认注销
              </button>
            </view>
          </view>
        </view>
      </view>
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { aiApi, type AiProviderType, type AiSettingsView } from '@/api/aiApi'
import { setAiConfig } from '@/api/aiClient'
import type { components } from '@/api/generated/schema'
import { useAuthApi } from '@/api/useAuthApi'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusStore } from '@/store/useFocusStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import { validatePasswordStrength } from '@/utils/passwordValidation'
import {
  buildSubjectDistribution,
  canProbeSavedAiSettings,
  DEFAULT_DEEPSEEK_MODEL,
  normalizeAiProvider,
  resolveEffectiveAiBaseUrl,
  resolveProfileSyncStatus,
  validateAiSettingsDraft,
} from '@/utils/profileHelpers'
import { useAiUsage } from '@/utils/useAiUsage'

type SessionResponse = components['schemas']['SessionResponse']

const authStore = useAuthStore()
const syncStore = useSyncStore()
const focusStore = useFocusStore()
const subjectStore = useSubjectStore()
const { aiUsage, loadingAiUsage, aiUsageError, fetchAiUsage } = useAiUsage()

const metricsRef = ref<{ reload: () => Promise<void> } | null>(null)

const displayName = computed(() => authStore.user?.displayName || authStore.username || 'Auralis')
const avatarInitial = computed(() => displayName.value.trim().slice(0, 1).toUpperCase() || 'A')
const subjectDistItems = computed(() => buildSubjectDistribution(subjectStore.subjects))

const syncStatusView = computed(() => resolveProfileSyncStatus({
  isSyncing: syncStore.isSyncing,
  resettingOffline: syncStore.isResettingOffline,
  lastError: syncStore.lastError,
  conflictCount: syncStore.conflicts.length,
  autoSyncEnabled: syncStore.autoSyncEnabled,
  pendingFocusCount: focusStore.pendingOutboxCount,
  pendingMutationCount: syncStore.pendingMutationCount,
}))

const syncFeedbackLabel = ref('')
let syncFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const syncButtonText = computed(() => {
  if (syncStore.isSyncing) return '同步中...'
  if (syncFeedbackLabel.value) return syncFeedbackLabel.value
  return '立即同步'
})

function formatResetTime(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatResetClock(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatTokenCount(value: number): string {
  return `${Number(value || 0).toLocaleString()} token`
}

function remainingPctNumber(remaining: number, limit: number): number {
  if (!limit || limit <= 0) return 100
  return Math.min(100, Math.max(0, Math.round((remaining / limit) * 100)))
}

const hourlyUsagePct = computed(() => (
  aiUsage.value ? remainingPctNumber(aiUsage.value.hourly.remainingTokens, aiUsage.value.hourly.limitTokens) : 100
))

const dailyUsagePct = computed(() => (
  aiUsage.value ? remainingPctNumber(aiUsage.value.daily.remainingTokens, aiUsage.value.daily.limitTokens) : 100
))

async function handleSyncNow() {
  if (syncStore.isSyncing || syncStore.isResettingOffline) return
  const generation = authStore.getLoginGeneration()
  if (syncFeedbackTimer) {
    clearTimeout(syncFeedbackTimer)
    syncFeedbackTimer = null
  }
  syncFeedbackLabel.value = ''

  await syncStore.syncNow()
  if (generation !== authStore.getLoginGeneration()) return

  if (!syncStore.lastError) {
    await focusStore.flushPendingSessions(true)
    if (generation !== authStore.getLoginGeneration()) return
    await Promise.all([
      subjectStore.loadSubjects(),
      syncStore.refreshPendingCount(),
    ])
    if (generation !== authStore.getLoginGeneration()) return
    void metricsRef.value?.reload()
  }

  if (syncStore.lastError) {
    syncFeedbackLabel.value = '✕ 同步失败'
    uni.showToast({ title: '同步未完成', icon: 'none' })
  } else if (syncStore.conflicts.length > 0) {
    syncFeedbackLabel.value = '存在冲突'
    uni.showToast({ title: '存在未处理同步冲突', icon: 'none' })
  } else if (focusStore.pendingOutboxCount > 0 || syncStore.pendingMutationCount > 0) {
    syncFeedbackLabel.value = '部分待传'
    uni.showToast({ title: '仍有本地记录保存在此设备，可稍后重试', icon: 'none' })
  } else {
    syncFeedbackLabel.value = '✓ 已同步'
    uni.showToast({ title: '同步完成', icon: 'none' })
  }

  syncFeedbackTimer = setTimeout(() => {
    syncFeedbackLabel.value = ''
    syncFeedbackTimer = null
  }, 2500)
}

function handleToggleAutoSync() {
  const next = !syncStore.autoSyncEnabled
  syncStore.setAutoSyncEnabled(next)
  if (next) {
    void focusStore.flushPendingSessions(false)
  }
  uni.showToast({
    title: next ? '自动同步已开启' : '自动同步已暂停',
    icon: 'none',
  })
}

// === 显示名称编辑 ===
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
    const updatedUser = await useAuthApi.updateProfile({
      baseVersion: Number(authStore.user?.version ?? 0),
      displayName: trimmed,
    })
    if (generation !== authStore.getLoginGeneration()) return
    authStore.syncUserProfile(updatedUser)
    showNameSheet.value = false
    uni.showToast({ title: '已更新', icon: 'none' })
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: err instanceof Error ? err.message : '更新失败', icon: 'none' })
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      savingName.value = false
    }
  }
}

// === BYOK AI 设置 ===
const customProvider = ref('')
const customBaseUrl = ref('')
const customApiKey = ref('')
const customChatModel = ref('')
const aiInitializing = ref(true)
const savingAi = ref(false)
const detectingModels = ref(false)
const testingConnection = ref(false)
const showApiKey = ref(false)
const allAiSettings = ref<AiSettingsView[]>([])
const availableModels = ref<string[]>([])

let aiConnectionGeneration = 0

const aiBusy = computed(() => aiInitializing.value || savingAi.value)
const canonicalAiProvider = computed(() => normalizeAiProvider(customProvider.value))

const currentProviderSetting = computed(() => (
  customProvider.value.trim()
    ? allAiSettings.value.find(item => item.provider === canonicalAiProvider.value)
    : undefined
))

const currentProviderHasKey = computed(() => Boolean(currentProviderSetting.value?.hasApiKey))

const effectiveAiBaseUrl = computed(() => (
  resolveEffectiveAiBaseUrl(canonicalAiProvider.value, customBaseUrl.value)
))

function applyProviderForm(provider: AiProviderType) {
  const match = allAiSettings.value.find(item => item.provider === provider)
  customApiKey.value = ''
  showApiKey.value = false
  customBaseUrl.value = match?.baseUrl ?? ''
  customChatModel.value = match?.chatModel ?? ''
  availableModels.value = []
}

watch(canonicalAiProvider, (provider) => {
  if (!customProvider.value.trim()) return
  applyProviderForm(provider)
}, { flush: 'sync' })

watch(
  [() => customProvider.value.trim(), canonicalAiProvider, effectiveAiBaseUrl, customApiKey, currentProviderSetting],
  () => {
    aiConnectionGeneration += 1
    availableModels.value = []
    detectingModels.value = false
    testingConnection.value = false
  },
  { flush: 'sync' },
)

async function loadAiSettings() {
  const generation = authStore.getLoginGeneration()
  try {
    const list = await aiApi.getSettings()
    if (generation !== authStore.getLoginGeneration()) return
    allAiSettings.value = list || []
    if (customProvider.value.trim() || customBaseUrl.value.trim() || customApiKey.value.trim() || customChatModel.value.trim()) {
      return
    }
    const saved = allAiSettings.value.find(item => item.hasApiKey) ?? allAiSettings.value[0]
    if (saved?.provider) {
      customProvider.value = saved.provider
      applyProviderForm(normalizeAiProvider(saved.provider))
    }
  } catch {
    // Keep silent if offline
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      aiInitializing.value = false
    }
  }
}

function ensureSavedForProbe(chatModel?: string): boolean {
  if (customProvider.value.trim() && canProbeSavedAiSettings({
    saved: currentProviderSetting.value,
    provider: canonicalAiProvider.value,
    baseUrl: customBaseUrl.value,
    apiKey: customApiKey.value,
    chatModel,
  })) {
    return true
  }
  uni.showToast({ title: '请先保存 AI 配置后再检测或测试', icon: 'none' })
  return false
}

async function fetchModelsForProvider() {
  if (detectingModels.value || aiBusy.value || !ensureSavedForProbe()) return
  const provider = canonicalAiProvider.value
  const probeGen = aiConnectionGeneration
  const authGen = authStore.getLoginGeneration()
  detectingModels.value = true
  try {
    const res = await aiApi.listModels(provider)
    if (probeGen !== aiConnectionGeneration || authGen !== authStore.getLoginGeneration()) return
    availableModels.value = res.models || []
    if (availableModels.value.length === 0) {
      uni.showToast({ title: '未拉取到可用模型', icon: 'none' })
      return
    }
    if (!customChatModel.value.trim()) {
      customChatModel.value = availableModels.value[0]
    }
    uni.showToast({ title: `检测到 ${availableModels.value.length} 个模型`, icon: 'none' })
  } catch (err) {
    if (probeGen !== aiConnectionGeneration || authGen !== authStore.getLoginGeneration()) return
    uni.showToast({ title: err instanceof Error ? err.message : '拉取失败', icon: 'none' })
  } finally {
    if (probeGen === aiConnectionGeneration && authGen === authStore.getLoginGeneration()) {
      detectingModels.value = false
    }
  }
}

async function testProviderConnection() {
  if (testingConnection.value || aiBusy.value) return
  const provider = canonicalAiProvider.value
  const chatModel = customChatModel.value.trim() || (provider === 'DEEPSEEK' ? DEFAULT_DEEPSEEK_MODEL : '')
  if (!ensureSavedForProbe(chatModel)) return
  const probeGen = aiConnectionGeneration
  const authGen = authStore.getLoginGeneration()
  testingConnection.value = true
  try {
    const res = await aiApi.testConnection(provider)
    if (probeGen !== aiConnectionGeneration || authGen !== authStore.getLoginGeneration()) return
    uni.showToast({
      title: res.reachable ? `连接正常 (${res.chatModel || provider})` : '连接不可达',
      icon: 'none',
    })
  } catch (err) {
    if (probeGen !== aiConnectionGeneration || authGen !== authStore.getLoginGeneration()) return
    uni.showToast({ title: err instanceof Error ? err.message : '测试失败', icon: 'none' })
  } finally {
    if (probeGen === aiConnectionGeneration && authGen === authStore.getLoginGeneration()) {
      testingConnection.value = false
    }
  }
}

async function saveAiSettings() {
  if (aiBusy.value) return
  const targetProvider = canonicalAiProvider.value
  const validationError = validateAiSettingsDraft({
    rawProvider: customProvider.value,
    provider: targetProvider,
    baseUrl: customBaseUrl.value,
    model: customChatModel.value,
  })
  if (validationError) {
    uni.showToast({ title: validationError, icon: 'none' })
    return
  }

  const generation = authStore.getLoginGeneration()
  const key = customApiKey.value.trim()
  if (!currentProviderSetting.value?.hasApiKey && !key) {
    uni.showToast({ title: '首次配置该服务商请填写 API Key', icon: 'none' })
    return
  }
  const effectiveBaseUrl = effectiveAiBaseUrl.value
  const effectiveModel = customChatModel.value.trim() || DEFAULT_DEEPSEEK_MODEL
  savingAi.value = true
  try {
    const updated = await setAiConfig({
      provider: targetProvider,
      baseUrl: effectiveBaseUrl,
      model: effectiveModel,
      apiKey: key,
    })
    if (generation !== authStore.getLoginGeneration()) return
    if (targetProvider === canonicalAiProvider.value && key === customApiKey.value.trim()) {
      customApiKey.value = ''
    }
    const nextList = allAiSettings.value.filter(item => item.provider !== (updated.provider || targetProvider))
    nextList.push(updated)
    allAiSettings.value = nextList
    if (targetProvider === canonicalAiProvider.value) {
      customBaseUrl.value = updated.baseUrl ?? effectiveBaseUrl
      customChatModel.value = updated.chatModel ?? effectiveModel
    }
    uni.showToast({ title: 'AI 配置已保存', icon: 'none' })
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      savingAi.value = false
    }
  }
}

// === 修改密码 ===
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
  if (pwdForm.currentPassword === pwdForm.newPassword) {
    pwdError.value = '新密码不能与原密码相同'
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
    if (generation !== authStore.getLoginGeneration()) return
    pwdForm.currentPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
    showPasswordSheet.value = false
    uni.showToast({ title: '密码已修改', icon: 'none' })
    await authStore.refreshAccessToken().catch(() => false)
    if (generation !== authStore.getLoginGeneration()) return
    await useAuthApi.me().then((me) => {
      if (generation === authStore.getLoginGeneration() && me?.id) {
        authStore.syncUserProfile(me)
      }
    }).catch(() => {})
    if (generation !== authStore.getLoginGeneration()) return
    void loadSessions()
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    pwdError.value = err instanceof Error ? err.message : '修改密码失败'
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      savingPwd.value = false
    }
  }
}

// === 登录设备管理 ===
const loadingSessions = ref(false)
const sessionsError = ref('')
const sessionsList = ref<SessionResponse[]>([])
const revokingSessionId = ref<string | null>(null)
const revokingAllOthers = ref(false)
let sessionsLoadId = 0

function isCurrentSession(session: SessionResponse): boolean {
  return Boolean(session.current || (authStore.serverDeviceId && session.serverDeviceId === authStore.serverDeviceId))
}

async function loadSessions() {
  if (!authStore.isAuthenticated) return
  const loadId = ++sessionsLoadId
  const generation = authStore.getLoginGeneration()
  loadingSessions.value = true
  sessionsError.value = ''
  try {
    const res = await useAuthApi.sessions()
    if (loadId !== sessionsLoadId || generation !== authStore.getLoginGeneration()) return
    sessionsList.value = (res.items || []).filter(item => !item.revokedAt)
  } catch (err) {
    if (loadId !== sessionsLoadId || generation !== authStore.getLoginGeneration()) return
    sessionsError.value = err instanceof Error ? err.message : '会话加载失败'
  } finally {
    if (loadId === sessionsLoadId && generation === authStore.getLoginGeneration()) {
      loadingSessions.value = false
    }
  }
}

async function revokeDevice(sessionId: string) {
  if (revokingSessionId.value || revokingAllOthers.value) return
  const generation = authStore.getLoginGeneration()
  revokingSessionId.value = sessionId
  try {
    await useAuthApi.revokeSession(sessionId)
    if (generation !== authStore.getLoginGeneration()) return
    sessionsList.value = sessionsList.value.filter(item => item.id !== sessionId)
    uni.showToast({ title: '设备已下线', icon: 'none' })
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
  } finally {
    if (generation === authStore.getLoginGeneration() && revokingSessionId.value === sessionId) {
      revokingSessionId.value = null
    }
  }
}

async function revokeAllOthers() {
  if (revokingAllOthers.value || revokingSessionId.value) return
  const generation = authStore.getLoginGeneration()
  revokingAllOthers.value = true
  try {
    await useAuthApi.revokeOtherSessions()
    if (generation !== authStore.getLoginGeneration()) return
    sessionsList.value = sessionsList.value.filter(isCurrentSession)
    uni.showToast({ title: '已下线其他设备', icon: 'none' })
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      revokingAllOthers.value = false
    }
  }
}

// === 数据重置与注销账户 ===
function handleResetOfflineData() {
  if (syncStore.isResettingOffline || syncStore.isSyncing) return
  const generation = authStore.getLoginGeneration()
  uni.showModal({
    title: '清除本地离线数据',
    content: '将清空本地离线数据与未同步草稿，并重新同步云端完整数据。确认重置？',
    confirmText: '重置离线数据',
    confirmColor: '#C93B3B',
    success: async (res) => {
      if (!res.confirm || generation !== authStore.getLoginGeneration()) return
      try {
        await syncStore.resetOfflineData()
        if (generation !== authStore.getLoginGeneration()) return
        void metricsRef.value?.reload()
        uni.showToast({
          title: syncStore.lastError ? '本地数据已重置，同步暂未完成' : '离线数据已重置并同步',
          icon: 'none',
        })
      } catch (err) {
        if (generation !== authStore.getLoginGeneration()) return
        uni.showToast({
          title: err instanceof Error ? err.message : '重置失败，请稍后重试',
          icon: 'none',
        })
      }
    },
  })
}

const showDeleteAccountSheet = ref(false)
const deletePwd = ref('')
const deletingAccount = ref(false)
const deleteAccountError = ref('')

function openDeleteAccountSheet() {
  deletePwd.value = ''
  deleteAccountError.value = ''
  showDeleteAccountSheet.value = true
}

async function submitDeleteAccount() {
  if (deletingAccount.value) return
  deleteAccountError.value = ''
  if (!deletePwd.value) {
    deleteAccountError.value = '请输入当前账号密码'
    return
  }
  const generation = authStore.getLoginGeneration()
  deletingAccount.value = true
  try {
    const res = await useAuthApi.deleteAccount({ password: deletePwd.value })
    if (generation !== authStore.getLoginGeneration()) return
    deletePwd.value = ''
    showDeleteAccountSheet.value = false
    authStore.clearSession()
    const refId = res.id ? String(res.id).slice(0, 8) : '已生成'
    uni.showToast({ title: `注销申请已受理（${refId}）`, icon: 'none' })
    uni.reLaunch({ url: '/pages/mobile/login/index' })
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    deleteAccountError.value = err instanceof Error ? err.message : '密码错误或网络异常，无法注销账户'
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      deletingAccount.value = false
    }
  }
}

function handleLogout() {
  const generation = authStore.getLoginGeneration()
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前设备的登录状态吗？',
    confirmColor: '#C93B3B',
    success: async (res) => {
      if (!res.confirm || generation !== authStore.getLoginGeneration()) return
      try {
        await authStore.logout()
      } catch {
        uni.showToast({ title: '登出请求未完成，本地会话已清除', icon: 'none' })
      }
      if (!authStore.isAuthenticated) {
        uni.reLaunch({ url: '/pages/mobile/login/index' })
      }
    },
  })
}

function closeAllSheets() {
  if (savingName.value || savingPwd.value || deletingAccount.value) return
  showNameSheet.value = false
  showPasswordSheet.value = false
  showDeleteAccountSheet.value = false
  pwdForm.currentPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdError.value = ''
  deletePwd.value = ''
  deleteAccountError.value = ''
}

function resetProfileState() {
  showNameSheet.value = false
  nameDraft.value = ''
  savingName.value = false
  showPasswordSheet.value = false
  pwdForm.currentPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdError.value = ''
  savingPwd.value = false
  showDeleteAccountSheet.value = false
  deletePwd.value = ''
  deleteAccountError.value = ''
  deletingAccount.value = false
  allAiSettings.value = []
  availableModels.value = []
  customProvider.value = ''
  customBaseUrl.value = ''
  customApiKey.value = ''
  customChatModel.value = ''
  showApiKey.value = false
  detectingModels.value = false
  testingConnection.value = false
  savingAi.value = false
  aiInitializing.value = false
  aiConnectionGeneration += 1
  sessionsLoadId += 1
  loadingSessions.value = false
  sessionsError.value = ''
  sessionsList.value = []
  revokingSessionId.value = null
  revokingAllOthers.value = false
  syncFeedbackLabel.value = ''
  if (syncFeedbackTimer) {
    clearTimeout(syncFeedbackTimer)
    syncFeedbackTimer = null
  }
}

useEscapeKey(
  () => showNameSheet.value || showPasswordSheet.value || showDeleteAccountSheet.value,
  closeAllSheets,
)

watch(
  () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId],
  () => {
    resetProfileState()
    if (!authStore.isAuthenticated) return
    aiInitializing.value = true
    void loadAiSettings()
    void loadSessions()
    void subjectStore.loadSubjects()
    void syncStore.refreshPendingCount()
  },
)

onMounted(() => {
  if (!authStore.isAuthenticated) {
    aiInitializing.value = false
    return
  }
  void loadAiSettings()
  void loadSessions()
  void subjectStore.loadSubjects()
  void syncStore.refreshPendingCount()
})

onUnmounted(() => {
  if (syncFeedbackTimer) {
    clearTimeout(syncFeedbackTimer)
    syncFeedbackTimer = null
  }
})
</script>

<style scoped>
.profile-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: transparent;
}

.content-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.profile-body {
  padding: 8px 18px var(--tabbar-clearance);
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

/* ===== 1. 用户基本资料卡 (aligned with PC .user-profile-card) ===== */
.user-profile-card {
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.user-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8B9A6E 0%, #6E8052 100%);
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.25), 0 4px 14px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-initial {
  font-size: 22px;
  font-weight: 800;
  color: #FAF7F2;
  letter-spacing: -0.5px;
}

.user-profile-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.name-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.user-name {
  font-size: 17px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-handle {
  font-size: 11.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 2 & 3. 核心学习指标 & 学科知识分布 ===== */
.study-stats-card,
.subject-dist-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-head-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-heading {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.no-data-hint {
  font-size: 12px;
  color: var(--text-muted);
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
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  width: 78px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.subject-bar-bg {
  flex: 1;
  height: 6px;
  background-color: rgba(28, 28, 26, 0.055);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.subject-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.5s var(--ease-out);
}

.subject-count-badge {
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  min-width: 42px;
  text-align: right;
  flex-shrink: 0;
}

/* ===== 4. 个人偏好与设置标题与分组 (aligned with PC .settings-group) ===== */
.settings-section-title {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.025em;
  margin-top: 6px;
  padding: 0 2px;
}

.settings-group {
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background-color: rgba(28, 28, 26, 0.015);
}

.group-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-title {
  font-size: 14.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.group-items {
  padding: 2px 0;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 18px;
  gap: 12px;
  border-bottom: 1px solid var(--border-subtle);
  box-sizing: border-box;
}

.settings-row:last-child {
  border-bottom: none;
}

.sync-status-row {
  flex-wrap: wrap;
}

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.setting-label-with-icon {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.row-label {
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.row-desc {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
  word-break: break-word;
}

.row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
}

.sync-status-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.status-pill-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background-color: var(--glass-sub-bg);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.status-pill-badge.is-warning {
  border-color: rgba(200, 155, 109, 0.42);
  background-color: rgba(200, 155, 109, 0.1);
}

.status-dot-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #8B9A6E;
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.6);
  flex-shrink: 0;
}

.status-pill-badge.is-warning .status-dot-indicator {
  background-color: #C89B6D;
  box-shadow: 0 0 6px rgba(200, 155, 109, 0.6);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  border: 1px solid var(--border-default);
  background-color: #FFFFFF;
  color: var(--text-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: transform 0.16s var(--ease-out), opacity 0.16s ease;
}

.action-btn:active {
  transform: scale(0.96);
}

.action-btn.primary {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #FAF7F2;
  box-shadow: 0 3px 10px rgba(118, 135, 88, 0.28);
}

.action-btn.secondary {
  padding: 5px 12px;
  font-size: 11.5px;
}

.action-btn.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* PC-style Pill Toggle Switch */
.toggle-btn {
  width: 46px;
  height: 26px;
  border-radius: var(--radius-full);
  background-color: #D8D8D4;
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.25s var(--ease-out), box-shadow 0.25s ease;
}

.toggle-btn.is-on {
  background-color: #8B9A6E;
  box-shadow: 0 2px 10px rgba(139, 154, 110, 0.35);
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #FFFFFF;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toggle-btn.is-on .toggle-knob {
  transform: translateX(20px);
}

/* ===== 4.2 AI 设置 (aligned with PC .ai-settings-section) ===== */
.ai-settings-section {
  padding: 16px 18px;
  border-top: 1px solid var(--border-subtle);
}

.ai-settings-section.first-ai-section {
  border-top: none;
}

.ai-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.ai-subtitle {
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.ai-section-content {
  border-left: 1px solid var(--border-subtle);
  margin-left: 7px;
  padding-left: 12px;
}

.byok-field-row {
  padding: 10px 0;
  border-bottom: 1px solid rgba(45, 55, 40, 0.05);
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.byok-field-row:last-child {
  border-bottom: none;
}

.byok-row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.byok-label {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.byok-hint {
  font-size: 11.5px;
  color: var(--text-muted);
}

.pc-settings-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  background-color: #FFFFFF;
  border: 1px solid rgba(45, 55, 40, 0.12);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  font-size: 12.5px;
  color: var(--text-primary);
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.pc-settings-input:focus,
.pc-settings-input:focus-within {
  outline: none;
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
}

.api-key-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.api-key-input {
  padding-right: 38px;
}

.eye-toggle-btn {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
}

.byok-model-detect-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.byok-model-input {
  flex: 1;
  min-width: 0;
}

.byok-detect-btn {
  height: 36px;
  padding: 0 14px;
  box-sizing: border-box;
}

.detected-models-tray {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tray-label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.model-chip {
  border: 1px solid var(--border-default);
  background-color: #FFFFFF;
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.model-chip.is-selected {
  border-color: #8B9A6E;
  background-color: #8B9A6E;
  color: #FAF7F2;
  font-weight: var(--font-weight-semibold);
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.3);
}

.byok-action-footer {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  row-gap: 10px;
  column-gap: 12px;
  padding-top: 12px;
}

.byok-tip {
  font-size: 11.5px;
  color: var(--text-muted);
}

.byok-btn-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* AI Usage Cards (aligned with PC .usage-card) */
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
  padding: 6px 0;
}

.error-msg {
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.usage-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.usage-card {
  background-color: var(--glass-sub-bg);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  border-radius: 14px;
  padding: 13px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.usage-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.usage-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usage-plan-name {
  font-size: 13px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.usage-percent-badge {
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  color: var(--color-sage-ink);
  background-color: rgba(139, 154, 110, 0.14);
  border: 1px solid rgba(139, 154, 110, 0.25);
  padding: 1px 8px;
  border-radius: var(--radius-full);
}

.usage-percent-badge.is-low {
  color: #9A6B3B;
  background-color: rgba(200, 155, 109, 0.15);
  border-color: rgba(200, 155, 109, 0.32);
}

.usage-reset-tag {
  font-size: 11px;
  color: var(--text-muted);
  background-color: rgba(28, 28, 26, 0.04);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.usage-progress-bar-wrap {
  width: 100%;
  height: 6px;
  background-color: rgba(28, 28, 26, 0.06);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.usage-progress-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  transition: width 0.5s var(--ease-out);
}

.usage-progress-bar-fill.is-low {
  background: linear-gradient(90deg, #D4A87E 0%, #C49A6C 100%);
}

.usage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.usage-stat-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background-color: rgba(255, 255, 255, 0.52);
  border: 1px solid rgba(28, 28, 26, 0.05);
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 0;
}

.usage-stat-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.usage-stat-val {
  font-size: 12.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.usage-stat-val.is-accent {
  color: var(--color-sage-ink);
}

/* ===== 5. 账号与安全凭证 (aligned with PC .account-card) ===== */
.account-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.account-card-title {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.account-sessions,
.danger-zone {
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
}

.account-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.account-section-title {
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.account-section-body {
  padding-left: 22px;
}

.account-detail {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.account-detail:last-child {
  border-bottom: none;
}

.cell-label {
  width: 60px;
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.cell-val {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}

.cell-sub {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.cell-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 11px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold);
  border: 1px solid var(--border-default);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.cell-btn.danger {
  border-color: rgba(201, 59, 59, 0.28);
  color: var(--color-danger);
}

.cell-btn.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.session-empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 0;
}

.sessions-list {
  display: flex;
  flex-direction: column;
}

.account-operation.session-item {
  padding: 9px 0;
}

.session-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.session-current-pill {
  font-size: 10.5px;
  font-weight: var(--font-weight-bold);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background-color: rgba(139, 154, 110, 0.16);
  border: 1px solid rgba(139, 154, 110, 0.28);
  color: var(--color-sage-ink);
}

.row-sub {
  font-size: 11.5px;
  color: var(--text-muted);
}

.revoke-all-btn {
  width: 100%;
  margin-top: 8px;
}

.account-operation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.account-operation:last-child {
  border-bottom: none;
}

.account-operation .row-desc {
  padding-left: 0;
}

.logout-btn {
  width: 100%;
  height: 46px;
  border-radius: 14px;
}

/* ===== 浮层 Sheets ===== */
.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
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

.sheet-hint {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.sheet-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.sheet-submit-btn {
  width: 100%;
  height: 44px;
}

.sheet-dual-actions {
  display: flex;
  gap: 10px;
}

.sheet-dual-btn {
  flex: 1;
  height: 42px;
}

.danger-confirm-btn {
  border: none;
}
</style>
