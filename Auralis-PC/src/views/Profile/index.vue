<template>
  <div class="profile-studio">
    <!-- ===== LEFT PANEL: 数据透视 ===== -->
      <aside class="studio-left">
        <!-- 1. 用户基本资料 (User Profile Card) -->
        <div class="user-profile-card">
          <div class="avatar-wrap" @click="triggerAvatarUpload" title="点击更换头像">
            <img v-if="userAvatarUrl" :src="userAvatarUrl" class="user-avatar-img" alt="头像" />
            <div v-else class="user-avatar">{{ userInitial }}</div>
            <span class="user-status-dot" title="在线"></span>
            <div class="avatar-hover-overlay">
              <IconCamera :size="14" />
            </div>
          </div>
          <div class="user-profile-meta">
            <h2 class="user-name">{{ displayName }}</h2>
            <p class="user-handle">{{ accountName }} · UID: {{ shortUserId }}</p>
            <div class="user-badges">
              <span class="user-streak-pill">
                <IconFlame :size="13" :stroke-width="2.2" class="streak-icon" />
                本周专注天数 <strong>{{ continuousStudyDays }}</strong>
              </span>
              <span class="device-pill">{{ deviceName }}</span>
            </div>
          </div>
        </div>

        <!-- 2. 核心学习指标 (Study Overview) -->
        <div class="study-stats-card">
          <div class="study-stats-header">
            <span class="study-stats-title">核心学习指标</span>
          </div>

          <div class="stats-grid">
            <div class="stat-cell" v-for="s in coreStats" :key="s.label">
              <div class="stat-top">
                <div class="stat-icon-wrap">
                  <component :is="s.icon" :size="14" :stroke-width="2" class="stat-icon" />
                </div>
                <span class="stat-label">{{ s.label }}</span>
              </div>
              <span class="stat-value" :class="{ accent: s.accent }">{{ s.value }}</span>
            </div>
          </div>
        </div>

        <!-- 3. 学科知识分布 (TOP 5) -->
        <div class="subject-dist-card">
          <div class="subject-dist-header">
            <span class="subject-dist-title">学科知识分布</span>
            <span class="subject-dist-subtitle">TOP 5</span>
          </div>
          <div v-if="subjects.length === 0" class="no-data-hint">
            暂无学科分布统计
          </div>
          <div v-else class="subject-list">
            <div v-for="sub in subjects" :key="sub.name" class="subject-row">
              <span class="subject-dot" :style="{ backgroundColor: sub.color || '#8B9A6E' }"></span>
              <span class="subject-name" :title="sub.name">{{ sub.name }}</span>
              <div class="subject-bar-bg">
                <div class="subject-bar-fill" :style="{ width: sub.pct + '%', backgroundColor: sub.color || '#8B9A6E' }"></div>
              </div>
              <span class="subject-count-badge">{{ sub.count }} 块</span>
            </div>
          </div>
        </div>

        <!-- 4. 文件解析进度中心 (放左边) -->
        <DocumentProcessingCenter />

        <!-- 5. 账号与安全凭证管理 (Account & Security) -->
        <div class="account-card">
          <div class="account-card-header">
            <div class="account-title-wrap">
              <span class="account-card-title">账号与安全凭证</span>
            </div>
            <div class="account-sec-status">
              <span class="sec-dot"></span>
              <span>安全运行中</span>
            </div>
          </div>

          <div class="account-card-body">
            <!-- 用户头像修改 -->
            <div class="account-cell">
              <div class="cell-main">
                <span class="cell-label">用户头像</span>
                <div class="avatar-cell-preview">
                  <div class="mini-avatar">
                    <img v-if="userAvatarUrl" :src="userAvatarUrl" class="mini-avatar-img" alt="头像" />
                    <span v-else>{{ userInitial }}</span>
                  </div>
                  <span class="cell-sub">自定义个人头像展示</span>
                </div>
              </div>
              <div class="avatar-cell-actions">
                <button v-if="userAvatarUrl" class="cell-btn" @click="resetAvatar">
                  重置
                </button>
                <button class="cell-btn" @click="triggerAvatarUpload">
                  更换头像
                </button>
              </div>
            </div>

            <!-- 用户昵称编辑 -->
            <div class="account-cell" :class="{ 'is-editing': isEditingNickname }">
              <div class="cell-main">
                <span class="cell-label">用户昵称</span>
                <span v-if="!isEditingNickname" class="cell-val">{{ displayName }}</span>
                <div v-else class="cell-edit-wrap">
                  <input
                    ref="nicknameInputRef"
                    v-model="newNickname"
                    class="cell-edit-input"
                    placeholder="输入新昵称"
                    maxlength="20"
                    @keydown.enter="saveNickname"
                    @keydown.esc="cancelEditNickname"
                  />
                </div>
              </div>
              <button v-if="!isEditingNickname" class="cell-btn" @click="startEditNickname">
                修改昵称
              </button>
              <div v-else class="cell-edit-btns">
                <button class="cell-btn primary" title="保存" @click="saveNickname">保存</button>
                <button class="cell-btn" title="取消" @click="cancelEditNickname">取消</button>
              </div>
            </div>

            <!-- 登录密码 -->
            <div class="account-cell">
              <div class="cell-main">
                <span class="cell-label">登录密码</span>
                <span class="cell-sub">•••••••• · 密码采用单向哈希保存</span>
              </div>
              <button class="cell-btn" @click="openPasswordModal">
                修改密码
              </button>
            </div>

            <!-- 登录账号 -->
            <div class="account-cell">
              <div class="cell-main">
                <span class="cell-label">登录账号</span>
                <span class="cell-val">{{ accountName }}</span>
              </div>
              <span class="cell-tag success">已认证</span>
            </div>

            <!-- 登录设备 -->
            <div class="account-cell">
              <div class="cell-main">
                <span class="cell-label">当前设备</span>
                <span class="cell-sub">{{ deviceName }}</span>
              </div>
              <span class="cell-tag default">当前授权</span>
            </div>
          </div>

          <!-- 账号快捷操作 -->
          <div class="account-card-actions">
            <button class="account-btn danger" type="button" @click="handleLogout">退出登录</button>
          </div>
        </div>
      </aside>

      <!-- ===== RIGHT PANEL: 分项设置 ===== -->
      <main class="studio-right">
        <div class="settings-header">
          <div class="settings-header-badge">
            <span class="badge-dot"></span>
            <span>SYSTEM PREFERENCES</span>
          </div>
          <h1 class="settings-title">个人偏好与设置</h1>
          <p class="settings-desc">个性化设置与多设备协同偏好</p>
        </div>

        <!-- Settings Groups -->
        <div
          v-for="group in settingGroups"
          :key="group.title"
          class="settings-group"
        >
          <div class="group-header">
            <h3 class="group-title">{{ group.title }}</h3>
            <span class="group-header-desc" v-if="group.desc">{{ group.desc }}</span>
          </div>
          <div class="group-items">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="settings-row"
            >
              <div class="row-info">
                <span class="row-label">{{ item.label }}</span>
                <span class="row-desc">{{ item.desc }}</span>
              </div>
              <div class="row-control">
                <!-- Toggle -->
                <button
                  v-if="item.type === 'toggle'"
                  class="toggle-btn"
                  :class="{ 'is-on': item.value }"
                  @click="handleToggle(item)"
                  :aria-label="item.label"
                >
                  <span class="toggle-knob"></span>
                </button>
                <!-- Select -->
                <select
                  v-else-if="item.type === 'select'"
                  class="settings-select"
                  v-model="item.value"
                  @change="handleSelectChange(item)"
                >
                  <option v-for="opt in item.options" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <!-- Action Button -->
                <button
                  v-else-if="item.type === 'action'"
                  class="action-btn"
                  :class="item.variant"
                  @click="handleAction(item)"
                >
                  {{ item.btnText }}
                </button>
                <!-- Input -->
                <input
                  v-else-if="item.type === 'input'"
                  type="text"
                  class="settings-input"
                  v-model="item.value"
                  :placeholder="item.placeholder"
                  @blur="handleInputBlur(item)"
                />
                <!-- Status -->
                <div v-else-if="item.type === 'status'" class="status-pill-badge" :class="{ 'is-warning': item.id === 'sync_status' && (syncStore.lastSyncError || syncStore.resetRequired) }">
                  <span class="status-dot-indicator"></span>
                  <span>{{ item.id === 'sync_status' ? syncStatusText : item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI Usage Guard B -->
        <div class="settings-group ai-usage-group">
          <div class="group-header">
            <h3 class="group-title">AI 使用额度</h3>
            <span class="group-header-desc">账户当前周期的 AI 调用余量</span>
          </div>
          
          <div class="group-items usage-group-body">
            <div v-if="loadingAiUsage" class="usage-loading">加载中...</div>
            <div v-else-if="aiUsageError" class="usage-error">
              <span>{{ aiUsageError }}</span>
              <button class="action-btn secondary" @click="fetchAiUsage">重试</button>
            </div>
            <div v-else-if="aiUsage" class="usage-content">
              <!-- Hourly -->
              <div class="usage-card">
                <div class="usage-card-header">
                  <div class="usage-header-left">
                    <span class="usage-plan-name">每小时额度 (Hourly)</span>
                    <span class="usage-percent-badge" :class="{ 'is-low': hourlyUsagePercent < 20 }">剩余 {{ hourlyUsagePercent }}%</span>
                  </div>
                  <span class="usage-reset-tag">重置时间: {{ new Date(aiUsage.hourly.resetAt).toLocaleTimeString() }}</span>
                </div>
                <!-- 进度条 -->
                <div class="usage-progress-bar-wrap">
                  <div class="usage-progress-bar-fill" :style="{ width: hourlyUsagePercent + '%' }" :class="{ 'is-low': hourlyUsagePercent < 20 }"></div>
                </div>
                <div class="usage-grid">
                  <div class="usage-stat-box">
                    <span class="usage-stat-label">总额度</span>
                    <span class="usage-stat-val">{{ aiUsage.hourly.limitTokens }} token</span>
                  </div>
                  <div class="usage-stat-box">
                    <span class="usage-stat-label">剩余额度</span>
                    <span class="usage-stat-val accent">{{ aiUsage.hourly.remainingTokens }} token</span>
                  </div>
                  <div class="usage-stat-box" >
                    <span class="usage-stat-label">已用额度</span>
                    <span class="usage-stat-val">{{ aiUsage.hourly.chargedTokens }} token</span>
                  </div>
                  <div class="usage-stat-box" >
                    <span class="usage-stat-label">预留额度</span>
                    <span class="usage-stat-val">{{ aiUsage.hourly.reservedTokens }} token</span>
                  </div>
                </div>
              </div>
              
              <!-- Daily -->
              <div class="usage-card">
                <div class="usage-card-header">
                  <div class="usage-header-left">
                    <span class="usage-plan-name">每日额度 (Daily)</span>
                    <span class="usage-percent-badge" :class="{ 'is-low': dailyUsagePercent < 20 }">剩余 {{ dailyUsagePercent }}%</span>
                  </div>
                  <span class="usage-reset-tag">重置时间: {{ new Date(aiUsage.daily.resetAt).toLocaleString() }}</span>
                </div>
                <!-- 进度条 -->
                <div class="usage-progress-bar-wrap">
                  <div class="usage-progress-bar-fill" :style="{ width: dailyUsagePercent + '%' }" :class="{ 'is-low': dailyUsagePercent < 20 }"></div>
                </div>
                <div class="usage-grid">
                  <div class="usage-stat-box">
                    <span class="usage-stat-label">总额度</span>
                    <span class="usage-stat-val">{{ aiUsage.daily.limitTokens }} token</span>
                  </div>
                  <div class="usage-stat-box">
                    <span class="usage-stat-label">剩余额度</span>
                    <span class="usage-stat-val accent">{{ aiUsage.daily.remainingTokens }} token</span>
                  </div>
                  <div class="usage-stat-box" title="缺少实际 usage 时按保守估算">
                    <span class="usage-stat-label">已结算（估算）</span>
                    <span class="usage-stat-val">{{ aiUsage.daily.chargedTokens }} token</span>
                  </div>
                  <div class="usage-stat-box" title="在途预留为估算值，不代表最终实际用量">
                    <span class="usage-stat-label">在途预留（估算）</span>
                    <span class="usage-stat-val">{{ aiUsage.daily.reservedTokens }} token</span>
                  </div>
                </div>
              </div>
              
              <div class="usage-actions">
                <button class="action-btn secondary" @click="fetchAiUsage">刷新</button>
              </div>
            </div>
          </div>
        </div>

        <!-- AI BYOK Settings -->
        <div class="settings-group byok-group">
          <div class="group-header">
            <h3 class="group-title">AI 模型与服务</h3>
            <span class="group-header-desc">配置自定义 AI 模型服务与密钥 (选填)</span>
          </div>
          <div class="byok-intro">
            <div class="row-info">
              <span class="row-label">自定义 AI 服务商</span>
              <span class="row-desc">密钥均安全加密保存，仅在发起 AI 请求时使用</span>
            </div>
            <div class="byok-status-pill" :class="{ 'is-active': currentProviderHasKey }">
              <span class="status-dot"></span>
              <span>{{ currentProviderHasKey ? '已配置密钥' : '未配置密钥' }}</span>
            </div>
          </div>

          <div class="group-items">
            <div class="settings-row byok-field-row">
              <div class="row-info">
                <span class="row-label">AI 服务商</span>
                <span class="row-desc">支持 DeepSeek、硅基流动或 OpenAI 兼容服务</span>
              </div>
              <div class="row-control byok-control-wrap">
                <input
                  v-model="customProvider"
                  type="text"
                  class="settings-input byok-input"
                  placeholder="如 DEEPSEEK / SILICONFLOW / OpenAI Compatible 服务商"
                />
                <div class="quick-providers-bar">
                  <span class="quick-preset-label">快速预设:</span>
                  <button
                    v-for="qp in quickProviders"
                    :key="qp.provider"
                    type="button"
                    class="quick-preset-chip"
                    :class="{ 'is-active': normalizeProvider(customProvider) === qp.provider }"
                    @click="applyQuickProvider(qp)"
                  >
                    {{ qp.name }}
                  </button>
                </div>
              </div>
            </div>

            <div class="settings-row byok-field-row">
              <div class="row-info">
                <span class="row-label">对话模型 (Chat Model)</span>
                <span class="row-desc">如 deepseek-chat、gpt-4o 等</span>
              </div>
              <div class="row-control byok-control-wrap">
                <div class="byok-model-detect-group">
                  <input
                    v-model="customChatModel"
                    type="text"
                    class="settings-input byok-input byok-model-input"
                    placeholder="输入模型标识 (如 deepseek-chat / gpt-4o)"
                  />
                  <button
                    class="action-btn byok-detect-btn"
                    :disabled="detectingModels"
                    @click="handleDetectModels"
                  >
                    {{ detectingModels ? '检测中...' : '自动检测' }}
                  </button>
                </div>
                <!-- 自动检测模型快速选取托盘 -->
                <div v-if="detectedModels.length > 0" class="detected-models-tray">
                  <span class="tray-label">检测到 {{ detectedModels.length }} 个候选模型：</span>
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

            <div class="settings-row byok-field-row">
              <div class="row-info">
                <span class="row-label">Base URL</span>
                <span class="row-desc">接口请求地址 (选填，留空使用默认服务地址)</span>
              </div>
              <div class="row-control byok-control-wrap">
                <input
                  v-model="customBaseUrl"
                  type="text"
                  class="settings-input byok-input"
                  placeholder="https://api.deepseek.com"
                />
              </div>
            </div>

            <div class="settings-row byok-field-row">
              <div class="row-info">
                <span class="row-label">API Key</span>
                <span class="row-desc">个人 API 密钥 (安全加密保存)</span>
              </div>
              <div class="row-control byok-control-wrap">
                <div class="api-key-input-wrapper">
                  <input
                    v-model="customApiKey"
                    :type="showApiKey ? 'text' : 'password'"
                    class="settings-input byok-input byok-key-input"
                    :placeholder="currentProviderHasKey ? '•••••••• (已配置，留空保持原密钥)' : 'sk-...'"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="eye-toggle-btn"
                    :title="showApiKey ? '隐藏密钥' : '显示密钥'"
                    @click="showApiKey = !showApiKey"
                  >
                    <IconEyeOff v-if="showApiKey" :size="15" />
                    <IconEye v-else :size="15" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="byok-action-footer">
            <span class="byok-tip">未修改密钥时留空即可</span>
            <div class="byok-btn-group">
              <button
                class="action-btn"
                :disabled="testingConnection"
                @click="handleTestConnection"
              >
                {{ testingConnection ? '测试中...' : '测试连接' }}
              </button>
              <button
                class="action-btn primary"
                :disabled="aiSettingsLoading"
                @click="handleSaveAiSettings"
              >
                {{ aiSettingsLoading ? '保存中...' : '保存 AI 配置' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Data & Privacy Settings -->
        <div class="settings-group privacy-group">
          <div class="group-header">
            <h3 class="group-title">数据与隐私</h3>
            <span class="group-header-desc">数据备份、缓存清理与隐私策略</span>
          </div>
          <div class="group-items">
            <div class="settings-row">
              <div class="row-info">
                <span class="row-label">本地数据导出</span>
                <span class="row-desc">导出全部笔记卡片与任务排期数据为备份文件</span>
              </div>
              <div class="row-control">
                <button class="action-btn" @click="handleExportData">
                  导出 JSON
                </button>
              </div>
            </div>

            <div class="settings-row">
              <div class="row-info">
                <span class="row-label">清理本地缓存</span>
                <span class="row-desc">释放本地临时存储空间，不影响笔记内容与登录状态</span>
              </div>
              <div class="row-control">
                <button class="action-btn" @click="handleClearCache">
                  清理缓存
                </button>
              </div>
            </div>

            <div class="settings-row">
              <div class="row-info">
                <span class="row-label">运行诊断日志</span>
                <span class="row-desc">记录运行日志，便于排查使用问题</span>
              </div>
              <div class="row-control">
                <button
                  class="toggle-btn"
                  :class="{ 'is-on': isDiagnosticLogEnabled }"
                  @click="toggleDiagnosticLog"
                  aria-label="运行诊断日志"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>
            </div>

            <div class="settings-row">
              <div class="row-info">
                <span class="row-label">AI 数据处理说明</span>
                <span class="row-desc">仅在主动发起问答或资料解析时传输必要内容，严格保障个人数据隐私</span>
              </div>
              <div class="row-control">
                <span class="privacy-scope-badge">隐私保护</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Auth sessions -->
        <div class="settings-group session-group">
          <div class="group-header">
            <h3 class="group-title">登录设备管理</h3>
            <span class="group-header-desc">查看已登录的设备并可管理下线</span>
          </div>
          <div v-if="sessionsLoading" class="session-empty">正在加载设备列表...</div>
          <div v-else-if="sessionsError" class="session-empty session-error">{{ sessionsError }}</div>
          <div v-else-if="sessions.length === 0" class="session-empty">暂无其他登录设备</div>
          <div v-else class="group-items">
            <div v-for="session in sessions" :key="session.id || session.serverDeviceId" class="settings-row session-row">
              <div class="session-row-main">
                <div class="row-info">
                  <div class="session-title-line">
                    <span class="row-label">{{ session.deviceName || session.platform || '未知设备' }}</span>
                    <span v-if="isCurrentSession(session)" class="session-current-pill">当前设备</span>
                  </div>
                  <span class="row-desc">
                    {{ session.platform || 'UNKNOWN' }} · 最近活跃 {{ formatSessionDate(session.lastUsedAt) }}
                  </span>
                </div>
              </div>
              <div class="row-control">
                <button
                  v-if="session.id && !isCurrentSession(session)"
                  class="action-btn danger"
                  :disabled="revokingSessionId === session.id"
                  @click="handleRevokeSession(session)"
                >
                  {{ revokingSessionId === session.id ? '下线中...' : '下线' }}
                </button>
              </div>
            </div>
          </div>
        </div>


        <!-- Danger Zone -->
        <div class="danger-zone">
          <div class="group-header danger-header">
            <h3 class="group-title danger-title">数据与账户重置</h3>
            <span class="group-header-desc danger-desc">不可逆操作，请谨慎执行</span>
          </div>
          <div class="danger-row">
            <div class="row-info">
              <span class="row-label">重置本地离线数据</span>
              <span class="row-desc">清空本地数据并重新从云端下载完整数据</span>
            </div>
            <button class="action-btn danger" @click="handleResetOfflineData">
              重置数据
            </button>
          </div>
          <div class="danger-row">
            <div class="row-info">
              <span class="row-label">注销账户</span>
              <span class="row-desc">永久注销账号并删除所有个人笔记与设置，不可恢复</span>
            </div>
            <button class="action-btn danger" @click="handleDeleteAccount">
              注销账户
            </button>
          </div>
        </div>
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
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconFlame,
  IconNotes,
  IconChecklist,
  IconClock,
  IconTrendingUp,
  IconCamera,
  IconEye,
  IconEyeOff,
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
  type AiSettingsCommand,
  type AiSettingsView,
  type AiUsageView,
} from '@/api/aiClient'
import { useSyncStore } from '@/store/useSyncStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useStatsStore } from '@/store/useStatsStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { ElNotification, ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message-box.css'
import DocumentProcessingCenter from '@/components/documentProcessing/DocumentProcessingCenter.vue'
import ChangePasswordDialog from '@/components/profile/ChangePasswordDialog.vue'

const settingsStore = useSettingsStore()

const showApiKey = ref(false)

const quickProviders = [
  { name: 'DeepSeek', provider: 'DEEPSEEK', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  { name: 'SiliconFlow', provider: 'SILICONFLOW', model: 'deepseek-ai/DeepSeek-V3', baseUrl: 'https://api.siliconflow.cn/v1' },
  { name: 'OpenAI 兼容', provider: 'OPENAI_COMPATIBLE', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
]

const applyQuickProvider = (p: typeof quickProviders[0]) => {
  customProvider.value = p.provider
  customChatModel.value = p.model
  customBaseUrl.value = p.baseUrl
}

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
const taskStore = useTaskStore()
const pomodoroStore = usePomodoroStore()
const router = useRouter()

const sessions = ref<SessionResponse[]>([])
const sessionsLoading = ref(false)
const sessionsError = ref<string | null>(null)
const revokingSessionId = ref<string | null>(null)

const displayName = computed(() => authStore.user?.displayName || authStore.user?.username || 'Auralis 同学')
const accountName = computed(() => authStore.user?.username || '未登录')
const deviceName = computed(() => authStore.serverDeviceId ? `设备 ${authStore.serverDeviceId.slice(0, 8)}` : '未绑定设备')

const shortUserId = computed(() => {
  const id = authStore.user?.id
  return id ? id.slice(0, 8) : '本地'
})

const userInitial = computed(() => {
  const name = displayName.value
  return name ? name.charAt(0).toUpperCase() : 'A'
})

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
      title: '文件类型不符',
      message: '仅支持 PNG 或 JPEG 格式的图片文件',
      type: 'warning',
      duration: 3000,
    })
    target.value = ''
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    ElNotification({
      title: '文件过大',
      message: '头像图片大小不能超过 5MB',
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
      title: '头像已更新',
      message: '个人头像已成功同步保存至云端',
      type: 'success',
      duration: 2500,
    })
  } catch (err: any) {
    ElNotification({
      title: '头像上传失败',
      message: err?.problem?.detail || err?.message || '头像上传异常，请稍后重试',
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
      title: '已重置头像',
      message: '已恢复默认首字母头像',
      type: 'info',
      duration: 2500,
    })
  } catch (err: any) {
    ElNotification({
      title: '重置头像失败',
      message: err?.problem?.detail || err?.message || '网络连接异常，请稍后重试',
      type: 'error',
      duration: 3000,
    })
  }
}

// === Account Adjustment State & Methods ===
const isEditingNickname = ref(false)
const newNickname = ref('')
const nicknameInputRef = ref<HTMLInputElement | null>(null)
const nicknameSaving = ref(false)

const startEditNickname = () => {
  newNickname.value = authStore.user?.displayName || displayName.value
  isEditingNickname.value = true
  nextTick(() => {
    nicknameInputRef.value?.focus()
  })
}

const cancelEditNickname = () => {
  isEditingNickname.value = false
  newNickname.value = ''
}

const saveNickname = async () => {
  const trimmed = newNickname.value.trim()
  if (!trimmed) {
    ElNotification({
      title: '提示',
      message: '昵称不能为空',
      type: 'warning',
    })
    return
  }
  if (trimmed.length > 120) {
    ElNotification({
      title: '提示',
      message: '昵称最多 120 个字符',
      type: 'warning',
    })
    return
  }

  nicknameSaving.value = true
  try {
    const baseVersion = authStore.user?.version ?? 0
    const updated = await useAuthApi.updateProfile({
      baseVersion,
      displayName: trimmed,
    })
    if (authStore.user) {
      authStore.user.displayName = updated.displayName
      authStore.user.version = updated.version
      authStore.user.hasAvatar = updated.hasAvatar
    }
    isEditingNickname.value = false
    ElNotification({
      title: '更新成功',
      message: '个人昵称已成功保存至云端',
      type: 'success',
    })
  } catch (err: any) {
    if (err?.status === 409 || err?.problem?.code === 'RESOURCE_VERSION_CONFLICT') {
      await authStore.fetchMe().catch(() => {})
      ElNotification({
        title: '版本冲突',
        message: '个人资料已被更新，已拉取最新数据，请重试',
        type: 'warning',
      })
    } else {
      ElNotification({
        title: '更新失败',
        message: err?.problem?.detail || err?.message || '未能保存昵称，请稍后重试',
        type: 'error',
      })
    }
  } finally {
    nicknameSaving.value = false
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
  if (!newPassword || newPassword.length < 12 || newPassword.length > 200) {
    pwdError.value = '新密码长度必须在 12 至 200 位之间'
    return
  }
  pwdSubmitting.value = true
  try {
    const baseVersion = authStore.user?.version ?? 0
    await useAuthApi.changePassword({
      baseVersion,
      currentPassword: oldPassword,
      newPassword: newPassword,
    })
    showPasswordModal.value = false
    ElNotification({
      title: '修改成功',
      message: '账号登录密码已成功更新。其他设备的登录会话已安全撤销。',
      type: 'success',
      duration: 4000,
    })
    await authStore.fetchMe().catch(() => {})
  } catch (err: any) {
    pwdError.value = err?.problem?.detail || err?.message || '更新密码失败，请核对原密码后重试'
  } finally {
    pwdSubmitting.value = false
  }
}

// === Stats ===
const coreStats = ref([
  { label: '知识块', value: '0', accent: false, icon: IconNotes },
  { label: '完成任务', value: '0', accent: false, icon: IconChecklist },
  { label: '总专注时长', value: '0h', accent: true, icon: IconClock },
  { label: '完成番茄', value: '0', accent: false, icon: IconFlame },
  { label: '本周新增', value: '0', accent: false, icon: IconTrendingUp },
])

// === Week bars ===
const weekBars = ref<any[]>([])

// === Subjects ===
const subjects = ref<any[]>([])

const formatSessionDate = (value?: string) => {
  if (!value) return '未知'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '未知' : parsed.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

const isCurrentSession = (session: SessionResponse) => Boolean(session.current || session.id === authStore.sessionId)

const loadSessions = async () => {
  sessionsLoading.value = true
  sessionsError.value = null
  try {
    const response = await useAuthApi.listSessions()
    sessions.value = response?.items ?? []
  } catch (error) {
    sessionsError.value = error instanceof Error ? error.message : '会话加载失败'
  } finally {
    sessionsLoading.value = false
  }
}

const handleRevokeSession = async (session: SessionResponse) => {
  if (!session.id || isCurrentSession(session)) return
  revokingSessionId.value = session.id
  try {
    await useAuthApi.revokeSession(session.id)
    sessions.value = sessions.value.filter((item) => item.id !== session.id)
    ElNotification({ title: '设备已下线', message: '该设备已成功下线。', type: 'success', duration: 3000 })
  } catch (error) {
    ElNotification({ title: '撤销失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error', duration: 3000 })
  } finally {
    revokingSessionId.value = null
  }
}

const dayMapping: Record<string, string> = {
  'Mon': '一', 'Tue': '二', 'Wed': '三', 'Thu': '四', 'Fri': '五', 'Sat': '六', 'Sun': '日'
}

// === BYOK AI Settings ===
type AiProvider = NonNullable<AiSettingsCommand['provider']> | (string & {})

const customProvider = ref<AiProvider>('DEEPSEEK')
const customChatModel = ref('deepseek-chat')
const customBaseUrl = ref('')
const customApiKey = ref('')
const aiSettingsList = ref<AiSettingsView[]>([])
const aiSettingsLoading = ref(false)

watch(
  () => normalizeProvider(customProvider.value),
  (provider, previousProvider) => {
    if (provider !== previousProvider) {
      customChatModel.value = ''
      detectedModels.value = []
    }
  },
  { flush: 'sync' },
)

const detectingModels = ref(false)
const detectedModels = ref<string[]>([])
const testingConnection = ref(false)
let saveAiSettingsSilently = false

const getAiSettingsValidationError = (provider: ReturnType<typeof normalizeProvider>): string | null => {
  if (provider !== 'DEEPSEEK' && !customChatModel.value.trim()) {
    return '当前服务商需要填写明确的聊天模型名称后才能保存。'
  }
  if (provider === 'OPENAI_COMPATIBLE' && !customBaseUrl.value.trim()) {
    return '请填写 OpenAI 兼容服务商提供的 Base URL。'
  }
  return null
}

const notifyAiSettingsValidationError = (message: string) => {
  ElNotification({ title: 'AI 配置不完整', message, type: 'warning', duration: 3500 })
}

const ensureAiSettingsSavedForTest = async (): Promise<boolean> => {
  const canonical = normalizeProvider(customProvider.value)
  const validationError = getAiSettingsValidationError(canonical)
  if (validationError) {
    notifyAiSettingsValidationError(validationError)
    return false
  }
  const saved = aiSettingsList.value.find((item) => item.provider === canonical)
  const hasNewKey = Boolean(customApiKey.value.trim())
  const hasBaseUrlChange = (customBaseUrl.value.trim() || '') !== (saved?.baseUrl || '')
  const hasModelChange = (customChatModel.value.trim() || '') !== (saved?.chatModel || '')
  const isDirty = !saved || hasNewKey || hasBaseUrlChange || hasModelChange

  if (isDirty) {
    if (!saved?.hasApiKey && !hasNewKey) {
      ElNotification({
        title: '未配置密钥',
        message: '请先填写 API Key 密钥后再进行连接测试或模型检测',
        type: 'warning',
        duration: 3500,
      })
      return false
    }
    try {
      saveAiSettingsSilently = true
      const updated = await handleSaveAiSettings()
      if (!updated) return false
    } catch {
      saveAiSettingsSilently = false
      return false
    }
  }
  return true
}

const handleDetectModels = async () => {
  if (detectingModels.value) return
  const canonical = normalizeProvider(customProvider.value)
  const saved = aiSettingsList.value.find((item) => item.provider === canonical)
  if (!saved?.hasApiKey && !customApiKey.value.trim()) {
    ElNotification({
      title: '未配置密钥',
      message: '模型自动探测需要使用服务商密钥，请先填写并保存配置',
      type: 'warning',
      duration: 3500,
    })
    return
  }

  const ok = await ensureAiSettingsSavedForTest()
  if (!ok) return

  detectingModels.value = true
  try {
    const res = await listAiModels(canonical)
    const models = res.models || []
    detectedModels.value = models
    if (!customChatModel.value && models.length > 0) {
      customChatModel.value = models[0]
    }
    ElNotification({
      title: '检测完成',
      message: `已获取到 ${models.length} 个可用模型，点击即可选用`,
      type: 'success',
      duration: 3000,
    })
  } catch (err: any) {
    ElNotification({
      title: '检测失败',
      message: err?.problem?.detail || err?.message || '未能获取可用模型列表，请确认 Base URL 与 API Key 是否有效',
      type: 'error',
      duration: 4000,
    })
  } finally {
    detectingModels.value = false
  }
}

const handleTestConnection = async () => {
  if (testingConnection.value) return
  const canonical = normalizeProvider(customProvider.value)
  const saved = aiSettingsList.value.find((item) => item.provider === canonical)
  if (!saved?.hasApiKey && !customApiKey.value.trim()) {
    ElNotification({
      title: '未配置密钥',
      message: '请先填写 API Key 密钥后再进行连接测试',
      type: 'warning',
      duration: 3500,
    })
    return
  }

  const ok = await ensureAiSettingsSavedForTest()
  if (!ok) return

  testingConnection.value = true
  try {
    const res = await testAiConnection(canonical)
    if (res.reachable) {
      ElNotification({
        title: '连接成功',
        message: `服务商 [${customProvider.value}] 联通正常，聊天模型 ${res.chatModel} 已验证。`,
        type: 'success',
        duration: 3500,
      })
    } else {
      ElNotification({
        title: '连接异常',
        message: '未能联通该模型服务商，请检查网络代理与服务商状态',
        type: 'warning',
        duration: 4000,
      })
    }
  } catch (err: any) {
    ElNotification({
      title: '连接测试失败',
      message: err?.problem?.detail || err?.message || '未能连通目标服务商，请确认端点与密钥是否有效',
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

const currentProviderSetting = computed(() => {
  const canonical = normalizeProvider(customProvider.value)
  return aiSettingsList.value.find((item) => item.provider === canonical)
})
const currentProviderHasKey = computed(() => Boolean(currentProviderSetting.value?.hasApiKey))

const loadAiSettings = async () => {
  try {
    const list = await getAiSettings()
    aiSettingsList.value = list || []
    const canonical = normalizeProvider(customProvider.value)
    const saved = list?.find((item) => item.provider === canonical) || list?.[0]
    if (saved?.provider) {
      customProvider.value = saved.provider
      customBaseUrl.value = saved.baseUrl || ''
      customChatModel.value = saved.chatModel || (normalizeProvider(saved.provider) === 'DEEPSEEK' ? 'deepseek-chat' : '')
    } else {
      customChatModel.value = normalizeProvider(customProvider.value) === 'DEEPSEEK' ? 'deepseek-chat' : ''
    }
  } catch (error) {
    console.error('Failed to load AI settings:', error)
  }
}

const handleSaveAiSettings = async () => {
  const silent = saveAiSettingsSilently
  saveAiSettingsSilently = false
  aiSettingsLoading.value = true
  try {
    const key = customApiKey.value.trim()
    const canonical = normalizeProvider(customProvider.value)
    const configuredChatModel = customChatModel.value.trim()
    const validationError = getAiSettingsValidationError(canonical)
    if (validationError) {
      notifyAiSettingsValidationError(validationError)
      return
    }
    const chatModel = configuredChatModel || 'deepseek-chat'
    const defaultBaseUrl = canonical === 'DEEPSEEK'
      ? 'https://api.deepseek.com'
      : canonical === 'SILICONFLOW'
        ? 'https://api.siliconflow.cn/v1'
        : ''
    const baseUrl = customBaseUrl.value.trim() || defaultBaseUrl
    const updated = await updateAiSettings({
      provider: canonical as any,
      baseUrl,
      chatModel,
      apiKey: key || undefined,
    })
    customApiKey.value = ''
    const idx = aiSettingsList.value.findIndex((item) => item.provider === canonical)
    if (idx >= 0) {
      aiSettingsList.value[idx] = updated
    } else {
      aiSettingsList.value.push(updated)
    }
    if (!silent) {
      ElNotification({ title: 'AI 配置已保存', message: `[${customProvider.value}] AI 配置已成功保存。`, type: 'success', duration: 3000 })
    }
    return updated
  } catch (error: any) {
    ElNotification({ title: '保存失败', message: error?.problem?.detail || (error instanceof Error ? error.message : '请稍后重试'), type: 'error', duration: 3000 })
    throw error
  } finally {
    aiSettingsLoading.value = false
  }
}

const syncStore = useSyncStore()

const syncStatusText = computed(() => {
  if (syncStore.isSyncing) return '正在与云端同步...'
  if (syncStore.lastSyncError) return `同步异常 · ${syncStore.lastSyncError}`
  if (syncStore.resetRequired) return '需要重置 · 等待重新同步'
  return '已同步 · 状态正常'
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
interface SettingItem {
  id: string
  label: string
  desc: string
  type: 'toggle' | 'select' | 'action' | 'input' | 'status'
  value?: any
  options?: string[]
  btnText?: string
  variant?: string
  placeholder?: string
}

const settingGroups = reactive([
  {
    title: '外观与显示',
    desc: '个性化主题外观、界面紧凑度与全局基础字号',
    items: [
      { id: 'dark', label: '深色模式', desc: '适合夜间或弱光环境使用', type: 'toggle', value: settingsStore.isDark },
      { id: 'compact', label: '紧凑布局', desc: '收紧界面间隙，在单屏内展示更多内容', type: 'toggle', value: settingsStore.compactLayout },
      { id: 'lang', label: '界面语言', desc: '选择系统界面的主要显示语言', type: 'select', value: localStorage.getItem('sc_setting_lang') || '简体中文', options: ['简体中文', 'English', '日本語'] },
      { id: 'font_size', label: '基础字号', desc: '调整界面正文字号大小', type: 'select', value: settingsStore.fontSize, options: ['12px', '14px', '16px'] },
    ] as SettingItem[]
  },
  {
    title: '提醒与自动化',
    desc: '统一配置任务提醒、专注时钟与文件解析等主动通知',
    items: [
      { id: 'task_remind', label: '任务提醒', desc: '任务到期前发送系统提醒', type: 'toggle', value: localStorage.getItem('sc_setting_task_remind') !== 'false' },
      { id: 'focus_end', label: '专注结束提醒', desc: '专注倒计时结束时播放提示音与通知', type: 'toggle', value: localStorage.getItem('sc_setting_focus_end') !== 'false' },
      { id: 'auto_overview', label: '自动生成概览', desc: '资料导入完成后自动构建思维导图', type: 'toggle', value: localStorage.getItem('sc_setting_auto_overview') !== 'false' },
    ] as SettingItem[]
  },
  {
    title: '同步与数据',
    desc: '管理多设备增量同步策略、网络环境与传输状态',
    items: [
      { id: 'sync_status', label: '同步状态', desc: '已与云端保持最新同步', type: 'status', value: '已同步 · 状态正常' },
      { id: 'auto_sync', label: '自动同步', desc: '在多设备间自动同步学习数据', type: 'toggle', value: localStorage.getItem('sc_setting_auto_sync') !== 'false' },
      { id: 'wifi_only', label: '仅 Wi-Fi 同步', desc: '使用移动网络时暂停同步，节省流量', type: 'toggle', value: localStorage.getItem('sc_setting_wifi_only') === 'true' },
      { id: 'sync_now', label: '立即同步', desc: '立即检查并同步最新数据', type: 'action', btnText: '立即同步', variant: 'primary' },
    ] as SettingItem[]
  },
  {
    title: 'AI 功能',
    desc: '按需开启或关闭学习工作流中的各项 AI 智能辅助能力',
    items: [
      { id: 'auto_tag', label: 'AI 自动标签', desc: '导入资料时自动分类并提炼关键标签', type: 'toggle', value: localStorage.getItem('sc_setting_auto_tag') !== 'false' },
      { id: 'auto_summary', label: 'AI 自动总结', desc: '导入资料后自动提炼核心知识点摘要', type: 'toggle', value: localStorage.getItem('sc_setting_auto_summary') !== 'false' },
    ] as SettingItem[]
  },
])

// === Handlers ===
const handleToggle = (item: SettingItem) => {
  item.value = !item.value
  switch (item.id) {
    case 'dark':
      settingsStore.toggleDark()
      item.value = settingsStore.isDark
      break
    case 'compact':
      settingsStore.compactLayout = item.value
      break
    case 'auto_sync':
    case 'wifi_only':
    case 'auto_tag':
    case 'auto_summary':
    case 'task_remind':
    case 'focus_end':
    case 'auto_overview':
      localStorage.setItem(`sc_setting_${item.id}`, String(item.value))
      ElNotification({
        title: '设置已更新',
        message: `[${item.label}] 已切换为 ${item.value ? '开启' : '关闭'}`,
        type: 'success',
        duration: 2000
      })
      break
  }
}

const handleSelectChange = (item: SettingItem) => {
  if (item.id === 'font_size') {
    settingsStore.fontSize = item.value
  } else {
    localStorage.setItem(`sc_setting_${item.id}`, item.value)
  }
  ElNotification({
    title: '设置已生效',
    message: `[${item.label}] 已更新为: ${item.value}`,
    type: 'success',
    duration: 2000
  })
}

const handleExportData = async () => {
  try {
    await Promise.all([
      knowledgeStore.loadLocalBlocks(),
      taskStore.loadLocalTasks(),
    ])
    const exportBundle = {
      version: 1,
      appName: 'Auralis',
      exportedAt: new Date().toISOString(),
      user: {
        id: authStore.user?.id,
        username: authStore.user?.username,
        displayName: displayName.value,
      },
      knowledgeBlocks: knowledgeStore.recentBlocks || [],
      tasks: taskStore.allTasks || [],
      metadata: {
        knowledgeCount: (knowledgeStore.recentBlocks || []).length,
        taskCount: (taskStore.allTasks || []).length,
      },
    }
    const jsonData = JSON.stringify(exportBundle, null, 2)
    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auralis_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElNotification({
      title: '导出成功',
      message: `已导出 ${exportBundle.metadata.knowledgeCount} 条知识块与 ${exportBundle.metadata.taskCount} 项任务`,
      type: 'success',
      duration: 3500,
    })
  } catch (err: any) {
    ElNotification({ title: '导出失败', message: err?.message || '获取数据失败', type: 'error', duration: 3000 })
  }
}

const isDiagnosticLogEnabled = ref(localStorage.getItem('sc_setting_diagnostic_log') === 'true')
const toggleDiagnosticLog = () => {
  isDiagnosticLogEnabled.value = !isDiagnosticLogEnabled.value
  localStorage.setItem('sc_setting_diagnostic_log', String(isDiagnosticLogEnabled.value))
  ElNotification({
    title: '设置已更新',
    message: `运行诊断日志已${isDiagnosticLogEnabled.value ? '开启' : '关闭'}`,
    type: 'success',
    duration: 2000
  })
}

const handleAction = async (item: SettingItem) => {
  if (item.id === 'sync_now') {
    const orig = item.btnText
    item.btnText = '同步中...'
    try {
      await syncStore.flushNow()
      item.btnText = '✓ 同步成功'
      await loadStats()
      ElNotification({ title: '同步成功', message: '所有数据已成功同步至云端', type: 'success', duration: 3000 })
    } catch (e) {
      item.btnText = '✕ 同步失败'
      ElNotification({ title: '同步失败', message: '同步遇到错误，请检查网络后重试', type: 'error', duration: 3000 })
    } finally {
      setTimeout(() => { item.btnText = orig }, 2500)
    }
  } else if (item.id === 'export') {
    await handleExportData()
  }
}

const handleInputBlur = (_item: SettingItem) => {
  // handled in backend
}

onMounted(async () => {
  void pomodoroStore.initialize().catch((error) => console.error('Failed to initialize focus sessions:', error))
  await loadAvatar()
  await loadStats()
  await loadSessions()
  await loadAiSettings()
})

watch(() => pomodoroStore.syncRevision, (revision, previous) => {
  if (revision > previous) void loadStats()
})



const handleLogout = async () => {
  try {
    const action = await ElMessageBox.confirm('确定要退出当前设备的登录状态吗？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
    if (action !== 'confirm') return
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.warn('[Profile] ElMessageBox confirm exception, proceeding with logout:', error)
  }

  try {
    await authStore.logout()
    ElNotification({ title: '已退出登录', message: '期待您的再次使用', type: 'success', duration: 2000 })
  } catch (error) {
    console.warn('[Profile] authStore.logout error, local session cleared:', error)
    ElNotification({ title: '登出异常', message: '无法连接到服务器完成会话清理，本地状态已强制清除', type: 'warning', duration: 3000 })
  } finally {
    await router.push('/login').catch(() => {
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    })
  }
}

const handleClearCache = async () => {
  try {
    await ElMessageBox.confirm('将清除临时渲染缓存，不影响你的笔记数据、云端存储与登录状态。确认继续？', '清理本地缓存', {
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      type: 'info',
    })
    const cacheKeys = [
      'auralis_chat_messages',
      'auralis_view_cache',
      'auralis_temp_index',
    ]
    cacheKeys.forEach((k) => localStorage.removeItem(k))
    ElNotification({ title: '缓存已清除', message: '本地界面临时缓存已清理完毕', type: 'success', duration: 3000 })
    await loadStats()
  } catch {
    // User cancelled
  }
}

const handleResetOfflineData = async () => {
  try {
    await ElMessageBox.confirm(
      '将清空本地离线数据与未同步草稿，并重新同步云端完整数据。确认重置？',
      '清除本地离线数据',
      {
        confirmButtonText: '重置离线数据',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    const offlineKeys = [
      'auralis_knowledge_blocks',
      'auralis_task_blocks',
      'auralis_chat_sessions',
      'auralis_chat_messages',
      'auralis_local_mutations',
      'auralis_sync_metadata',
    ]
    offlineKeys.forEach((k) => localStorage.removeItem(k))
    ElNotification({
      title: '离线数据已重置',
      message: '本地离线数据已清空，正在重新同步云端数据...',
      type: 'warning',
      duration: 4000,
    })
    await syncStore.resetOfflineData()
    await loadStats()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    console.error('重置离线数据失败:', error)
    ElNotification({
      title: '重置失败',
      message: error instanceof Error ? error.message : '重置离线数据过程中出错，请稍后重试',
      type: 'error',
      duration: 4000,
    })
  }
}

const handleDeleteAccount = async () => {
  try {
    const { value: inputPwd } = await ElMessageBox.prompt(
      '注销账户将永久停用并清理您在云端和本地的所有个人数据，此操作不可逆。请输入您的登录密码以确认注销：',
      '注销账户确认',
      {
        confirmButtonText: '确认注销',
        cancelButtonText: '取消',
        inputType: 'password',
        inputPlaceholder: '请输入当前账号密码',
      }
    )
    if (!inputPwd) return

    try {
      const res = await useAuthApi.deleteAccount({ password: inputPwd })
      authStore.clearSession()
      ElNotification({
        title: '注销申请已受理',
        message: `您的注销请求已受理（单号: ${res.id ? String(res.id).slice(0, 8) : '已生成'}），数据收敛作业已启动。期待未来与您重逢。`,
        type: 'warning',
        duration: 6000,
      })
      await router.push('/login')
    } catch (apiErr: any) {
      ElNotification({
        title: '注销失败',
        message: apiErr?.problem?.detail || apiErr?.message || '密码错误或网络异常，无法注销账户',
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
    aiUsageError.value = err.message || '加载 AI 额度失败'
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
  padding: 14px 18px 18px;
  gap: 16px;
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
  scrollbar-width: none;
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  box-shadow: 
    0 10px 30px -4px rgba(35, 45, 30, 0.08), 
    0 2px 8px -1px rgba(0, 0, 0, 0.04);
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
.studio-left::-webkit-scrollbar {
  display: none;
}
.studio-left > * {
  flex-shrink: 0;
}

/* 2.1 用户基本资料卡 (User Profile Card) */
.user-profile-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  padding: 18px 20px;
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

.user-status-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #637748;
  border: 2px solid #FAF7F2;
  box-shadow: 0 0 6px rgba(99, 119, 72, 0.5);
  animation: breathe-glow 2.4s ease-in-out infinite;
}

@keyframes breathe-glow {
  0%, 100% {
    box-shadow: 0 0 4px rgba(99, 119, 72, 0.4);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 10px rgba(99, 119, 72, 0.8);
    transform: scale(1.08);
  }
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
  font-size: 17px;
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.25;
}

.user-handle {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.1px;
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
  font-size: 13.5px;
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
  font-size: 12px;
  font-weight: 550;
  color: var(--text-muted, #7A7A75);
}

.stat-value {
  font-size: 20px;
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

.subject-dist-subtitle {
  font-size: 11px;
  font-weight: 700;
  color: #637748;
  background: rgba(139, 154, 110, 0.12);
  padding: 2px 8px;
  border-radius: 9999px;
  border: 0.5px solid rgba(139, 154, 110, 0.25);
  letter-spacing: 0.4px;
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
  font-size: 12px;
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
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025);
}

.account-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.account-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.account-card-title {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

.account-sec-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 650;
  color: #637748;
  background: rgba(139, 154, 110, 0.12);
  padding: 2px 8px;
  border-radius: 9999px;
  border: 0.5px solid rgba(139, 154, 110, 0.25);
}

.sec-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #637748;
  box-shadow: 0 0 5px rgba(99, 119, 72, 0.6);
}

.account-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 13px;
  padding: 10px 14px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.account-cell:hover {
  border-color: rgba(139, 154, 110, 0.35);
  box-shadow: 0 3px 8px rgba(35, 45, 30, 0.04);
}

.cell-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.cell-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--text-muted, #7A7A75);
  letter-spacing: 0.1px;
}

.cell-val {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-primary, #1C1C1A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-sub {
  font-size: 12px;
  color: var(--text-secondary, #4A4A45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-tag {
  font-size: 11.5px;
  font-weight: 650;
  padding: 3px 9px;
  border-radius: 9999px;
  flex-shrink: 0;
}
.cell-tag.success {
  background: rgba(139, 154, 110, 0.14);
  color: #637748;
  border: 0.5px solid rgba(139, 154, 110, 0.25);
}
.cell-tag.default {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted, #7A7A75);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
}

.avatar-cell-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 3px;
}

.mini-avatar {
  width: 32px;
  height: 32px;
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

.avatar-cell-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-btn {
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 650;
  border: 0.5px solid var(--border-default, #E6E6E4);
  background: #FFFFFF;
  color: var(--text-secondary, #344139);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.cell-btn:hover {
  border-color: #8B9A6E;
  color: #637748;
  background: #FAF7F2;
  transform: translateY(-1px);
}
.cell-btn.primary {
  background: linear-gradient(135deg, #8B9A6E 0%, #768759 100%);
  color: #FAF7F2;
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.25);
}
.cell-btn.primary:hover {
  background: linear-gradient(135deg, #768759 0%, #637748 100%);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.35);
}

.cell-edit-wrap {
  width: 100%;
  margin-top: 3px;
}
.cell-edit-input {
  width: 100%;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 0.5px solid #8B9A6E;
  background: #FFFFFF;
  color: var(--text-primary, #1C1C1A);
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
  transition: all 0.2s;
}

.cell-edit-btns {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.account-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.account-btn {
  flex: 1;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  border: 0.5px solid transparent;
}
.account-btn.danger {
  background: rgba(217, 83, 79, 0.08);
  border-color: rgba(217, 83, 79, 0.25);
  color: #C2413E;
}
.account-btn.danger:hover {
  background: rgba(217, 83, 79, 0.16);
  border-color: #C2413E;
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(217, 83, 79, 0.18);
}


/* ===== 3. RIGHT PANEL: 分项设置控制台 (62%) ===== */
.studio-right {
  flex: 6.2;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  box-shadow: 
    0 10px 30px -4px rgba(35, 45, 30, 0.08), 
    0 2px 8px -1px rgba(0, 0, 0, 0.04);
  padding: 28px 36px;
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
    padding: 16px 14px;
  }
  .studio-right {
    padding: 20px 24px;
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
.settings-header {
  margin-bottom: 26px;
  flex-shrink: 0;
}

.settings-header-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(139, 154, 110, 0.12);
  border: 0.5px solid rgba(139, 154, 110, 0.25);
  border-radius: 9999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #637748;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}
.settings-header-badge .badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #637748;
  box-shadow: 0 0 5px rgba(99, 119, 72, 0.5);
}

.settings-title {
  font-size: 24px;
  font-weight: 850;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.03em;
  margin: 0 0 6px 0;
  line-height: 1.2;
}

.settings-desc {
  font-size: 13px;
  color: var(--text-muted, #7A7A75);
  margin: 0;
  letter-spacing: -0.1px;
}

/* 3.2 设置分组 (Settings Groups) */
.settings-group {
  flex-shrink: 0;
  margin-bottom: 22px;
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
  padding: 16px 22px;
  border-bottom: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  background: rgba(0, 0, 0, 0.012);
  min-height: 50px;
  box-sizing: border-box;
}

.group-title {
  font-size: 14.5px;
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
  margin: 0;
}

.group-header-desc {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
}
.group-header-desc.danger-desc {
  color: rgba(176, 58, 46, 0.85);
}

.group-items {
  padding: 4px 0;
}

/* 3.3 设置项单行 (Settings Row) */
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 22px;
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
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.15px;
}

.row-desc {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  line-height: 1.45;
}

.row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
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
  font-size: 12px;
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
  font-size: 12px;
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
  font-size: 12px;
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

.action-btn.danger {
  background: rgba(217, 83, 79, 0.08);
  border-color: rgba(217, 83, 79, 0.25);
  color: #C2413E;
}
.action-btn.danger:hover {
  background: rgba(217, 83, 79, 0.16);
  border-color: #C2413E;
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(217, 83, 79, 0.18);
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


/* ===== 4. AI 使用额度卡片 (AI Usage Cards) ===== */
.usage-group-body {
  padding: 18px 22px !important;
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

.usage-actions {
  display: flex;
  justify-content: flex-end;
}


/* ===== 5. AI BYOK 配置区 (BYOK Settings) ===== */
.byok-group {
  border-color: rgba(139, 154, 110, 0.28);
}

.byok-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 22px;
  border-bottom: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  background: rgba(139, 154, 110, 0.06);
  gap: 16px;
}

.byok-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 650;
  background: var(--color-bg-primary, #F7F2EB);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  color: var(--text-muted, #7A7A75);
  white-space: nowrap;
  flex-shrink: 0;
}
.byok-status-pill.is-active {
  background: rgba(139, 154, 110, 0.16);
  border-color: rgba(139, 154, 110, 0.35);
  color: #637748;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted, #7A7A75);
  flex-shrink: 0;
}
.byok-status-pill.is-active .status-dot {
  background: #637748;
  box-shadow: 0 0 6px rgba(99, 119, 72, 0.7);
}

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
  padding: 16px 22px;
  background: rgba(0, 0, 0, 0.015);
  border-top: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  gap: 16px;
}
.byok-tip {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
}
.byok-btn-group {
  display: flex;
  align-items: center;
  gap: 10px;
}


/* ===== 6. 数据与隐私及会话管理 (Privacy & Sessions) ===== */
.privacy-group {
  border-color: rgba(139, 154, 110, 0.2);
}

.privacy-scope-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.12);
  border: 0.5px solid rgba(139, 154, 110, 0.25);
  font-size: 12px;
  font-weight: 650;
  color: #637748;
}

.session-empty {
  padding: 20px 22px;
  font-size: 12.5px;
  color: var(--text-muted, #7A7A75);
}
.session-error {
  color: #C2413E;
}

.session-row {
  padding: 15px 22px;
}
.session-row-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}
.session-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
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


/* ===== 7. 危险操作区 (Danger Zone) ===== */
.danger-zone {
  flex-shrink: 0;
  margin-bottom: 24px;
  background: rgba(217, 83, 79, 0.035);
  border: 0.5px solid rgba(217, 83, 79, 0.2);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(217, 83, 79, 0.03);
}

.danger-header {
  border-bottom: 0.5px solid rgba(217, 83, 79, 0.15);
  background: rgba(217, 83, 79, 0.04);
  padding: 16px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.danger-title {
  color: #B03A2E;
  font-size: 14.5px;
  font-weight: 750;
  margin: 0;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 22px;
  border-bottom: 0.5px solid rgba(217, 83, 79, 0.08);
  gap: 20px;
  min-height: 54px;
  box-sizing: border-box;
}
.danger-row:last-child {
  border-bottom: none;
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

html.dark .stat-cell,
html.dark .account-cell,
html.dark .usage-card {
  background: #1F241F;
  border-color: rgba(163, 177, 155, 0.14);
}
html.dark .stat-cell:hover,
html.dark .account-cell:hover,
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
html.dark .user-handle,
html.dark .cell-sub,
html.dark .group-header-desc,
html.dark .settings-desc,
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
html.dark .settings-input,
html.dark .cell-edit-input {
  background-color: #181D18;
  border-color: rgba(163, 177, 155, 0.22);
  color: #FAF7F2;
}
html.dark .settings-select:focus,
html.dark .settings-input:focus,
html.dark .cell-edit-input:focus {
  border-color: #9AB08F;
  box-shadow: 0 0 0 3px rgba(154, 176, 143, 0.22);
}

html.dark .action-btn,
html.dark .cell-btn,
html.dark .model-chip {
  background: #1D231D;
  border-color: rgba(163, 177, 155, 0.22);
  color: #FAF7F2;
}
html.dark .action-btn:hover,
html.dark .cell-btn:hover,
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

html.dark .byok-intro {
  background: rgba(139, 154, 110, 0.1);
  border-bottom-color: rgba(163, 177, 155, 0.16);
}
html.dark .byok-status-pill {
  background: #181D18;
  border-color: rgba(163, 177, 155, 0.2);
  color: #9AA096;
}
html.dark .byok-status-pill.is-active {
  background: rgba(139, 154, 110, 0.2);
  border-color: rgba(139, 154, 110, 0.35);
  color: #9AB08F;
}

html.dark .group-header,
html.dark .byok-action-footer {
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

html.dark .danger-zone {
  background: rgba(217, 83, 79, 0.06);
  border-color: rgba(217, 83, 79, 0.25);
}
html.dark .danger-header {
  background: rgba(217, 83, 79, 0.08);
  border-bottom-color: rgba(217, 83, 79, 0.2);
}
html.dark .danger-row {
  border-bottom-color: rgba(217, 83, 79, 0.1);
}

html.dark .settings-header-badge {
  background: rgba(139, 154, 110, 0.16);
  border-color: rgba(139, 154, 110, 0.3);
  color: #9AB08F;
}
html.dark .settings-header-badge .badge-dot {
  background: #9AB08F;
  box-shadow: 0 0 5px rgba(154, 176, 143, 0.6);
}

/* ===== 9. 精雕细琢微交互增强体系 (Refinements V2) ===== */

/* 9.1 账号单元格专属属性图标底座 */
.cell-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(139, 154, 110, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #637748;
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.account-cell:hover .cell-icon-wrap {
  background: rgba(139, 154, 110, 0.2);
  color: #516439;
  transform: scale(1.05);
}

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
.group-icon-wrap.danger {
  background: rgba(217, 83, 79, 0.1);
  color: #B03A2E;
}
.danger-zone:hover .group-icon-wrap.danger {
  transform: scale(1.06);
  background: rgba(217, 83, 79, 0.18);
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

/* 9.4 Provider 快速预设标签 (Quick Provider Presets) */
.quick-providers-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  width: 100%;
  flex-wrap: wrap;
}
.quick-preset-label {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  font-weight: 600;
  margin-right: 2px;
}
.quick-preset-chip {
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.035);
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  color: var(--text-secondary, #344139);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
}
.quick-preset-chip:hover {
  background: rgba(139, 154, 110, 0.12);
  border-color: rgba(139, 154, 110, 0.3);
  color: #637748;
  transform: translateY(-1px);
}
.quick-preset-chip.is-active {
  background: rgba(139, 154, 110, 0.18);
  border-color: #8B9A6E;
  color: #637748;
  font-weight: 700;
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
html.dark .cell-icon-wrap,
html.dark .group-icon-wrap {
  background: rgba(139, 154, 110, 0.18);
  color: #9AB08F;
}
html.dark .account-cell:hover .cell-icon-wrap,
html.dark .settings-group:hover .group-icon-wrap {
  background: rgba(139, 154, 110, 0.28);
  color: #B8CCAF;
}

html.dark .group-icon-wrap.danger {
  background: rgba(217, 83, 79, 0.16);
  color: #E68582;
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

html.dark .quick-preset-chip {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(163, 177, 155, 0.16);
  color: #C0C5BD;
}
html.dark .quick-preset-chip:hover {
  background: rgba(139, 154, 110, 0.16);
  border-color: rgba(139, 154, 110, 0.35);
  color: #9AB08F;
}
html.dark .quick-preset-chip.is-active {
  background: rgba(139, 154, 110, 0.24);
  border-color: #9AB08F;
  color: #FAF7F2;
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
