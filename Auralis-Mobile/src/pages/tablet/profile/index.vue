<template>
  <TabletLayout>
    <view class="profile-studio">
      <!-- ===== LEFT PANEL: 数据透视与身份面板 ===== -->
      <view class="studio-left">
        <scroll-view scroll-y :show-scrollbar="false" class="panel-scroll">
          <view class="studio-left-inner">
            <!-- 1. 用户基本资料卡 -->
            <view class="user-profile-card">
              <view class="user-avatar">
                <text class="avatar-initial">{{ avatarInitial }}</text>
              </view>
              <view class="user-profile-meta">
                <text class="user-name">{{ displayName }}</text>
                <view class="user-badges">
                  <view class="user-streak-pill">
                    <LineIcon name="fire" size="13px" color="#C89B6D" />
                    <text>本周专注天数</text>
                    <text class="streak-count num-tabular">{{ weeklyFocusDays }}</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- 2. 核心学习指标 -->
            <view class="study-stats-card">
              <view class="card-head-between">
                <text class="card-heading">核心学习指标</text>
              </view>
              <StudyMetrics ref="metricsRef" variant="pc" @loaded="handleMetricsLoaded" />
            </view>

            <!-- 3. 学科知识分布 -->
            <view class="subject-dist-card">
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

            <!-- 4. 账号与安全凭证 -->
            <view class="account-card">
              <text class="account-card-title">账号与安全凭证</text>

              <!-- 4.1 账号资料 -->
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
                    <view class="cell-btn" role="button" @click="openNameModal">
                      <text>修改</text>
                    </view>
                  </view>
                  <view class="account-detail">
                    <text class="cell-label">登录密码</text>
                    <text class="cell-sub">••••••••</text>
                    <view class="cell-btn" role="button" @click="openPasswordModal">
                      <text>修改</text>
                    </view>
                  </view>
                </view>
              </view>

              <!-- 4.2 登录设备管理 -->
              <view class="account-sessions">
                <view class="account-section-header">
                  <view class="setting-label-with-icon">
                    <LineIcon name="device" size="15px" color="var(--color-sage-ink)" />
                    <text class="account-section-title">登录设备管理</text>
                  </view>
                  <view class="session-header-actions">
                    <view class="ui-icon-btn sm" role="button" aria-label="刷新设备列表" @click="loadSessions">
                      <LineIcon name="refresh" size="13px" color="var(--text-secondary)" />
                    </view>
                    <view class="cell-btn" role="button" @click="handleLogout">
                      <text>退出登录</text>
                    </view>
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
                    <view
                      v-for="s in sessionsList"
                      :key="s.id || s.serverDeviceId"
                      class="account-operation session-item"
                    >
                      <view class="session-meta">
                        <view class="session-title-line">
                          <text class="row-label">{{ s.deviceName || s.platform || '未知设备' }}</text>
                          <text v-if="isCurrentSession(s)" class="session-current-pill">当前设备</text>
                        </view>
                        <text class="row-sub num-tabular">
                          {{ s.platform || 'UNKNOWN' }} · 最近活跃 {{ formatDateTime(s.lastUsedAt || s.createdAt || '') }}
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
                      class="cell-btn danger revoke-all-btn"
                      :class="{ 'is-disabled': revokingAllOthers || Boolean(revokingSessionId) }"
                      role="button"
                      @click="revokeAllOthers"
                    >
                      <text>{{ revokingAllOthers ? '下线中...' : '下线全部其他设备' }}</text>
                    </view>
                  </view>
                </view>
              </view>

              <!-- 4.3 数据与账户重置 -->
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
                      :class="{ 'is-disabled': syncStore.isResettingOffline || syncStore.isSyncing }"
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
                    <view class="cell-btn danger" role="button" @click="openDeleteAccountModal">
                      <text>注销</text>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- ===== RIGHT PANEL: 个人偏好与设置 ===== -->
      <view class="studio-right">
        <scroll-view scroll-y :show-scrollbar="false" class="panel-scroll">
          <view class="studio-right-inner">
            <text class="settings-title">个人偏好与设置</text>

            <!-- 1. 同步与数据 -->
            <view class="settings-group">
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
                  <view class="row-control sync-status-controls">
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

            <!-- 2. AI 设置（模型与服务 + 使用额度） -->
            <view class="settings-group">
              <view class="group-header">
                <view class="group-title-line">
                  <LineIcon name="sparkles" size="16px" color="var(--color-sage-ink)" />
                  <text class="group-title">AI 设置</text>
                </view>
              </view>

              <!-- 2.1 AI 模型与服务 -->
              <view class="ai-settings-section first-ai-section">
                <view class="ai-subheader">
                  <view class="setting-label-with-icon">
                    <LineIcon name="cpu" size="15px" color="var(--text-muted)" />
                    <text class="ai-subtitle">AI 模型与服务</text>
                  </view>
                </view>

                <view class="ai-section-content">
                  <view class="settings-row byok-field-row">
                    <view class="row-info">
                      <view class="setting-label-with-icon">
                        <LineIcon name="server" size="15px" color="var(--text-muted)" />
                        <text class="row-label">AI 服务商</text>
                      </view>
                    </view>
                    <view class="row-control byok-control-wrap">
                      <input
                        class="pc-settings-input byok-input"
                        v-model="customProvider"
                        placeholder="例如 DEEPSEEK"
                        placeholder-style="color: #9A9A95;"
                        :disabled="aiBusy"
                      />
                    </view>
                  </view>

                  <view class="settings-row byok-field-row">
                    <view class="row-info">
                      <view class="setting-label-with-icon">
                        <LineIcon name="link" size="15px" color="var(--text-muted)" />
                        <text class="row-label">Base URL</text>
                      </view>
                      <text class="row-desc byok-hint-indent">
                        {{ customProvider.trim() && canonicalAiProvider === 'OPENAI_COMPATIBLE' ? '兼容服务必填' : '留空使用默认地址' }}
                      </text>
                    </view>
                    <view class="row-control byok-control-wrap">
                      <input
                        class="pc-settings-input byok-input"
                        v-model="customBaseUrl"
                        placeholder="例如 https://api.deepseek.com"
                        placeholder-style="color: #9A9A95;"
                        :disabled="aiBusy"
                      />
                    </view>
                  </view>

                  <view class="settings-row byok-field-row">
                    <view class="row-info">
                      <view class="setting-label-with-icon">
                        <LineIcon name="key" size="15px" color="var(--text-muted)" />
                        <text class="row-label">API Key</text>
                      </view>
                      <text v-if="!aiInitializing" class="row-desc byok-hint-indent">
                        {{ currentProviderHasKey ? '已配置，留空保留' : '未配置' }}
                      </text>
                    </view>
                    <view class="row-control byok-control-wrap">
                      <view class="api-key-wrapper">
                        <input
                          class="pc-settings-input byok-input api-key-input"
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
                  </view>

                  <view class="settings-row byok-field-row">
                    <view class="row-info">
                      <view class="setting-label-with-icon">
                        <LineIcon name="ai" size="15px" color="var(--text-muted)" />
                        <text class="row-label">对话模型</text>
                      </view>
                    </view>
                    <view class="row-control byok-control-wrap">
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

              <!-- 2.2 AI 使用额度 -->
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

                  <view v-else-if="aiUsageError" class="quota-error">
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
                          重置时间: {{ formatClockTime(aiUsage.hourly.resetAt) || '—' }}
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
                          重置时间: {{ formatDateTime(aiUsage.daily.resetAt) }}
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
          </view>
        </scroll-view>
      </view>
    </view>

    <template #modal>
      <!-- 1. 修改显示名称 -->
      <view v-if="showNameModal" class="zen-modal-mask" @click="closeAllModals">
        <view class="zen-modal-body studio-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">修改显示名称</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeAllModals">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-form">
            <input
              class="ui-input"
              v-model="nameDraft"
              maxlength="64"
              placeholder="输入显示名称"
              :disabled="savingName"
            />
          </view>

          <view class="modal-footer">
            <view class="ui-btn ui-btn-secondary" role="button" @click="closeAllModals">
              <text>取消</text>
            </view>
            <view
              class="ui-btn ui-btn-primary"
              :class="{ 'is-disabled': savingName }"
              role="button"
              @click="submitDisplayName"
            >
              <text>{{ savingName ? '保存中...' : '保存' }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 2. 修改登录密码 (aligned with PC ChangePasswordDialog) -->
      <view v-if="showPasswordModal" class="zen-modal-mask" @click="closeAllModals">
        <view class="zen-modal-body studio-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">修改登录密码</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeAllModals">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-form">
            <view class="security-tip">
              <LineIcon name="key" size="15px" color="var(--color-sage-ink)" />
              <text class="security-tip-text">新密码至少 8 位，包含大写字母、小写字母和符号</text>
            </view>

            <view class="modal-field">
              <view class="modal-field-label">
                <text>原密码</text>
                <text class="required-mark">*</text>
              </view>
              <input
                class="ui-input"
                v-model="pwdForm.currentPassword"
                password
                placeholder="请输入当前正在使用的密码"
                :disabled="savingPwd"
                @input="pwdError = ''"
              />
            </view>

            <view class="modal-field">
              <view class="modal-field-label">
                <text>新密码</text>
                <text class="required-mark">*</text>
              </view>
              <input
                class="ui-input"
                v-model="pwdForm.newPassword"
                password
                placeholder="请输入新密码"
                :disabled="savingPwd"
                @input="pwdError = ''"
              />
            </view>

            <view class="modal-field">
              <view class="modal-field-label">
                <text>确认新密码</text>
                <text class="required-mark">*</text>
              </view>
              <input
                class="ui-input"
                v-model="pwdForm.confirmPassword"
                password
                placeholder="请再次输入新密码核对"
                :disabled="savingPwd"
                @input="pwdError = ''"
              />
            </view>

            <view v-if="pwdError" class="error-tip">
              <LineIcon name="alert" size="14px" color="var(--color-danger)" />
              <text class="error-tip-text">{{ pwdError }}</text>
            </view>
          </view>

          <view class="modal-footer">
            <view class="ui-btn ui-btn-secondary" role="button" @click="closeAllModals">
              <text>取消</text>
            </view>
            <view
              class="ui-btn ui-btn-primary"
              :class="{ 'is-disabled': savingPwd }"
              role="button"
              @click="submitPasswordChange"
            >
              <text>{{ savingPwd ? '保存中...' : '确认修改' }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 3. 注销账户确认 -->
      <view v-if="showDeleteAccountModal" class="zen-modal-mask" @click="closeAllModals">
        <view class="zen-modal-body studio-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">注销账户确认</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="closeAllModals">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-form">
            <text class="modal-desc">
              确认注销后，本机会退出登录，服务端会停用账户并在后台清理云端数据。本机保存的业务数据会保留。请输入登录密码确认注销。
            </text>
            <input
              class="ui-input"
              v-model="deletePwd"
              password
              placeholder="请输入当前账号密码"
              :disabled="deletingAccount"
              @input="deleteAccountError = ''"
            />
            <view v-if="deleteAccountError" class="error-tip">
              <LineIcon name="alert" size="14px" color="var(--color-danger)" />
              <text class="error-tip-text">{{ deleteAccountError }}</text>
            </view>
          </view>

          <view class="modal-footer">
            <view class="ui-btn ui-btn-secondary" role="button" @click="closeAllModals">
              <text>取消</text>
            </view>
            <view
              class="ui-btn ui-btn-danger"
              :class="{ 'is-disabled': deletingAccount }"
              role="button"
              @click="submitDeleteAccount"
            >
              <text>{{ deletingAccount ? '注销中...' : '确认注销' }}</text>
            </view>
          </view>
        </view>
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { aiApi, type AiProviderType, type AiSettingsView } from '@/api/aiApi'
import { setAiConfig } from '@/api/aiClient'
import type { components } from '@/api/generated/schema'
import { useAuthApi } from '@/api/useAuthApi'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
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
const weeklyFocusDays = ref(0)

function handleMetricsLoaded(payload: { weeklyFocusDays: number }) {
  weeklyFocusDays.value = payload.weeklyFocusDays
}

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

function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatClockTime(iso: string): string {
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
const showNameModal = ref(false)
const nameDraft = ref('')
const savingName = ref(false)

function openNameModal() {
  nameDraft.value = authStore.user?.displayName || authStore.username || ''
  showNameModal.value = true
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
    showNameModal.value = false
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
const showPasswordModal = ref(false)
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

async function submitPasswordChange() {
  if (savingPwd.value) return
  pwdError.value = ''
  if (!pwdForm.currentPassword) {
    pwdError.value = '请输入原密码'
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
    showPasswordModal.value = false
    uni.showToast({ title: '密码已更新，其他设备已下线', icon: 'none' })
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
    uni.showToast({ title: err instanceof Error ? err.message : '下线失败', icon: 'none' })
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

const showDeleteAccountModal = ref(false)
const deletePwd = ref('')
const deletingAccount = ref(false)
const deleteAccountError = ref('')

function openDeleteAccountModal() {
  deletePwd.value = ''
  deleteAccountError.value = ''
  showDeleteAccountModal.value = true
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
    showDeleteAccountModal.value = false
    authStore.clearSession()
    const refId = res.id ? String(res.id).slice(0, 8) : '已生成'
    uni.showToast({ title: `注销申请已受理（${refId}）`, icon: 'none' })
    uni.reLaunch({ url: '/pages/tablet/login/index' })
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
        uni.reLaunch({ url: '/pages/tablet/login/index' })
      }
    },
  })
}

function closeAllModals() {
  if (savingName.value || savingPwd.value || deletingAccount.value) return
  showNameModal.value = false
  showPasswordModal.value = false
  showDeleteAccountModal.value = false
  pwdForm.currentPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdError.value = ''
  deletePwd.value = ''
  deleteAccountError.value = ''
}

function resetProfileState() {
  weeklyFocusDays.value = 0
  showNameModal.value = false
  nameDraft.value = ''
  savingName.value = false
  showPasswordModal.value = false
  pwdForm.currentPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdError.value = ''
  savingPwd.value = false
  showDeleteAccountModal.value = false
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
  () => showNameModal.value || showPasswordModal.value || showDeleteAccountModal.value,
  closeAllModals,
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
.profile-studio {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  padding: 14px 18px 18px;
  gap: 16px;
  overflow: hidden;
  box-sizing: border-box;
  background-color: transparent;
}

.studio-left,
.studio-right {
  height: 100%;
  background-color: #F7F2EB;
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  box-shadow:
    0 10px 30px -4px rgba(35, 45, 30, 0.08),
    0 2px 8px -1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.studio-left {
  flex: 3.8;
  min-width: 340px;
  max-width: 450px;
}

.studio-right {
  flex: 6.2;
  min-width: 0;
}

.panel-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
}

.studio-left-inner {
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

.studio-right-inner {
  padding: 26px 32px;
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ===== Left Panel Cards ===== */
.user-profile-card,
.study-stats-card,
.subject-dist-card,
.account-card {
  background-color: #FAF7F2;
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
  box-sizing: border-box;
}

.user-profile-card {
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.user-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8B9A6E 0%, #6E8052 100%);
  box-shadow:
    0 0 0 2px rgba(139, 154, 110, 0.25),
    0 4px 14px rgba(0, 0, 0, 0.08);
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
  gap: 6px;
}

.user-name {
  font-size: 17px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.user-streak-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background-color: rgba(200, 155, 109, 0.12);
  border: 1px solid rgba(200, 155, 109, 0.28);
  padding: 3px 9px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
  color: #9E6D38;
  font-weight: var(--font-weight-medium);
}

.streak-count {
  color: #875727;
  font-weight: var(--font-weight-bold);
}

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
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.no-data-hint {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 12px 0;
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
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  width: 72px;
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

/* ===== Account & Security Card ===== */
.account-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.account-card-title {
  padding-bottom: 11px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 14px;
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

.session-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.account-section-title {
  font-size: 13px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.account-section-body {
  margin-left: 22px;
}

.account-detail {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.account-detail:last-child {
  border-bottom: none;
}

.cell-label {
  width: 56px;
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.cell-val {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-primary);
  word-break: break-all;
}

.cell-sub {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.cell-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold);
  border: 1px solid var(--border-default);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.18s ease, border-color 0.18s ease;
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
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 0;
}

.sessions-list {
  display: flex;
  flex-direction: column;
}

.account-operation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.account-operation:last-child {
  border-bottom: none;
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
  height: 32px;
  box-sizing: border-box;
}

/* ===== Right Panel Settings Groups ===== */
.settings-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.settings-group {
  background-color: #FAF7F2;
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
  box-sizing: border-box;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 22px;
  border-bottom: 1px solid var(--border-subtle);
  background-color: rgba(0, 0, 0, 0.012);
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
  padding: 4px 0;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  border-bottom: 1px solid rgba(45, 55, 40, 0.05);
  gap: 20px;
  min-height: 54px;
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
  gap: 8px;
  min-width: 0;
}

.row-label {
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  letter-spacing: -0.1px;
}

.row-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
  word-break: break-word;
}

.byok-hint-indent {
  margin-left: 23px;
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
  gap: 7px;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  background-color: #FFFFFF;
  border: 1px solid var(--border-subtle);
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.status-pill-badge.is-warning {
  border-color: rgba(212, 168, 126, 0.42);
  background-color: rgba(212, 168, 126, 0.09);
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
  background-color: #C49A6C;
  box-shadow: 0 0 6px rgba(196, 154, 108, 0.6);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 16px;
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
  transition: transform 0.16s var(--ease-out), border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.16s ease;
}

.action-btn:active {
  transform: scale(0.97);
}

.action-btn.primary {
  background: linear-gradient(135deg, #8B9A6E 0%, #6E8052 100%);
  border-color: transparent;
  color: #FAF7F2;
  box-shadow: 0 3px 12px rgba(139, 154, 110, 0.28);
}

.action-btn.secondary {
  padding: 5px 12px;
  font-size: 11.5px;
}

.action-btn.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* Toggle Switch */
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
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toggle-btn.is-on .toggle-knob {
  transform: translateX(20px);
}

/* ===== AI Settings Subsections ===== */
.ai-settings-section {
  padding: 18px 22px;
  border-top: 1px solid var(--border-subtle);
}

.ai-settings-section.first-ai-section {
  border-top: none;
}

.ai-subheader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  padding-left: 14px;
}

.ai-settings-section .byok-field-row {
  padding: 10px 0;
}

.byok-control-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: 1.25;
  max-width: 380px;
  min-width: 220px;
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

.byok-input {
  width: 100%;
}

.api-key-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

.api-key-input {
  padding-right: 36px;
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
  width: 100%;
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
  margin-top: 8px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
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
  transition: all 0.18s ease;
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
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  row-gap: 8px;
  column-gap: 16px;
  padding-top: 14px;
}

.byok-tip {
  font-size: 12px;
  color: var(--text-muted);
}

.byok-btn-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

/* AI Usage Cards */
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
  gap: 12px;
  padding: 8px 0;
}

.error-msg {
  flex: 1;
  font-size: 12.5px;
  color: var(--color-danger);
}

.usage-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.usage-card {
  background-color: #F7F2EB;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
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
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.usage-percent-badge {
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  color: #637748;
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
  font-size: 11.5px;
  color: var(--text-muted);
  background-color: rgba(0, 0, 0, 0.035);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.usage-progress-bar-wrap {
  width: 100%;
  height: 6px;
  background-color: rgba(0, 0, 0, 0.055);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.usage-progress-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, #8B9A6E 0%, #6E8052 100%);
  transition: width 0.5s var(--ease-out);
}

.usage-progress-bar-fill.is-low {
  background: linear-gradient(90deg, #D4A87E 0%, #C49A6C 100%);
}

.usage-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.usage-stat-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background-color: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 0;
}

.usage-stat-label {
  font-size: 11.5px;
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
  color: #637748;
}

/* ===== Modals ===== */
.studio-modal {
  max-width: 420px;
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
  font-size: 16.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-desc {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
}

.security-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--radius-md);
  background-color: rgba(139, 154, 110, 0.12);
}

.security-tip-text {
  font-size: 12.5px;
  font-weight: var(--font-weight-medium);
  color: var(--color-sage-ink);
  line-height: 1.45;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-field-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.required-mark {
  color: var(--color-danger);
}

.error-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background-color: rgba(201, 59, 59, 0.08);
  border: 1px solid rgba(201, 59, 59, 0.2);
}

.error-tip-text {
  flex: 1;
  font-size: 12.5px;
  color: var(--color-danger);
  line-height: 1.4;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* #ifdef H5 */
.cell-btn:hover {
  border-color: var(--border-strong);
  background-color: #F7F2EB;
}

.cell-btn.danger:hover:not(.is-disabled) {
  background-color: rgba(201, 59, 59, 0.08);
  border-color: var(--color-danger);
}

.action-btn:hover {
  border-color: #8B9A6E;
  color: #637748;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(35, 45, 30, 0.06);
}

.action-btn.primary:hover {
  color: #FAF7F2;
  box-shadow: 0 5px 16px rgba(139, 154, 110, 0.38);
}

.model-chip:hover {
  border-color: #8B9A6E;
  color: #637748;
  background-color: rgba(139, 154, 110, 0.08);
}

.eye-toggle-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
}
/* #endif */

@media (max-width: 1150px) {
  .studio-left {
    min-width: 300px;
    flex: 3.6;
  }

  .studio-right-inner {
    padding: 20px 22px;
  }
}

@media (max-width: 960px) {
  .usage-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .byok-field-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .byok-control-wrap {
    max-width: none;
    width: 100%;
    align-items: stretch;
  }
}

@media (max-width: 820px) {
  .profile-studio {
    flex-direction: column;
    overflow-y: auto;
  }

  .studio-left,
  .studio-right {
    flex: none;
    width: 100%;
    max-width: none;
    min-width: 0;
    height: auto;
  }

  .panel-scroll {
    height: auto;
  }
}
</style>
