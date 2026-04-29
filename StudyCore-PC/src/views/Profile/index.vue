<template>
  <div class="profile-studio">
    <!-- ===== LEFT PANEL: 数据透视 ===== -->
    <aside class="studio-left">
      <!-- Avatar & Identity -->
      <div class="user-card">
        <div class="avatar-ring">
          <div class="user-avatar">SC</div>
          <div class="avatar-pulse"></div>
        </div>
        <div class="user-meta">
          <h2 class="user-name">StudyCore 同学</h2>
          <p class="user-streak">🔥 连续学习第 <strong>42</strong> 天</p>
        </div>
        <div class="user-level">
          <span class="level-badge">Lv.7</span>
        </div>
      </div>

      <!-- Key Stats -->
      <div class="stats-grid">
        <div class="stat-cell" v-for="s in coreStats" :key="s.label">
          <span class="stat-value" :class="s.accent ? 'accent' : ''">{{ s.value }}</span>
          <span class="stat-label">{{ s.label }}</span>
        </div>
      </div>

      <!-- Weekly Chart -->
      <div class="pivot-section">
        <p class="pivot-label">本周专注时长 (小时)</p>
        <div class="bar-chart">
          <div
            v-for="(bar, i) in weekBars"
            :key="i"
            class="bar-col"
          >
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ height: bar.pct + '%' }"
                :class="{ 'bar-today': bar.today }"
              ></div>
            </div>
            <span class="bar-day">{{ bar.day }}</span>
          </div>
        </div>
      </div>

      <!-- Subject Distribution -->
      <div class="pivot-section">
        <p class="pivot-label">学科分布</p>
        <div class="subject-list">
          <div v-for="sub in subjects" :key="sub.name" class="subject-row">
            <span class="subject-dot" :style="{ background: sub.color }"></span>
            <span class="subject-name">{{ sub.name }}</span>
            <div class="subject-bar-bg">
              <div class="subject-bar-fill" :style="{ width: sub.pct + '%', background: sub.color }"></div>
            </div>
            <span class="subject-pct">{{ sub.pct }}%</span>
          </div>
        </div>
      </div>

      <!-- AI Insight Card -->
      <div class="insight-card">
        <span class="insight-icon">✦</span>
        <p class="insight-text">{{ aiInsight }}</p>
      </div>
    </aside>

    <!-- ===== RIGHT PANEL: 分项设置 ===== -->
    <main class="studio-right">
      <div class="settings-header">
        <h1 class="settings-title">个人设置</h1>
        <p class="settings-desc">管理你的账户偏好、数据备份与同步策略</p>
      </div>

      <!-- Settings Groups -->
      <div
        v-for="group in settingGroups"
        :key="group.title"
        class="settings-group"
      >
        <h3 class="group-title">{{ group.icon }} {{ group.title }}</h3>
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
            </div>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="danger-zone">
        <h3 class="group-title">⚠️ 危险操作</h3>
        <div class="danger-row">
          <div class="row-info">
            <span class="row-label">清除本地缓存</span>
            <span class="row-desc">删除所有本地缓存数据，不影响云端数据</span>
          </div>
          <button class="action-btn danger" @click="handleClearCache">清除缓存</button>
        </div>
        <div class="danger-row">
          <div class="row-info">
            <span class="row-label">注销账户</span>
            <span class="row-desc">永久删除所有数据，此操作不可逆</span>
          </div>
          <button class="action-btn danger" @click="handleDeleteAccount">注销账户</button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { getAiConfig, setAiConfig } from '@/api/aiClient'

// === Stats ===
const coreStats = ref([
  { label: '知识块', value: '156', accent: false },
  { label: '完成任务', value: '38', accent: false },
  { label: '总专注时长', value: '67h', accent: true },
  { label: '本周新增', value: '12', accent: false },
  { label: '今日专注', value: '2.5h', accent: true },
  { label: '平均每日', value: '1.6h', accent: false },
])

// === Week bars ===
const weekBars = ref([
  { day: '一', pct: 60, today: false },
  { day: '二', pct: 80, today: false },
  { day: '三', pct: 45, today: false },
  { day: '四', pct: 90, today: false },
  { day: '五', pct: 70, today: false },
  { day: '六', pct: 35, today: false },
  { day: '日', pct: 55, today: true },
])

// === Subjects ===
const subjects = ref([
  { name: '计算机系统', pct: 38, color: '#6366f1' },
  { name: '数据结构', pct: 27, color: '#8b5cf6' },
  { name: '数学', pct: 20, color: '#a78bfa' },
  { name: '英语', pct: 15, color: '#c4b5fd' },
])

// === AI Insight ===
const aiInsight = ref('你本周四专注度最高，峰值时段为 21:00-23:00，建议将高难度任务优先安排在此时间窗口。')

// === Settings ===
interface SettingItem {
  id: string
  label: string
  desc: string
  type: 'toggle' | 'select' | 'action' | 'input'
  value?: any
  options?: string[]
  btnText?: string
  variant?: string
  placeholder?: string
}

const settingGroups = reactive([
  {
    title: '外观与显示',
    icon: '🎨',
    items: [
      { id: 'dark', label: '深色模式', desc: '切换应用主题为深色', type: 'toggle', value: document.documentElement.classList.contains('dark') },
      { id: 'compact', label: '紧凑布局', desc: '减小卡片和间距以显示更多内容', type: 'toggle', value: false },
      { id: 'lang', label: '界面语言', desc: '选择应用显示语言', type: 'select', value: '简体中文', options: ['简体中文', 'English', '日本語'] },
      { id: 'font_size', label: '字体大小', desc: '调整全局基础字号', type: 'select', value: '14px (默认)', options: ['12px (小)', '14px (默认)', '16px (大)'] },
    ] as SettingItem[]
  },
  {
    title: '同步与备份',
    icon: '☁️',
    items: [
      { id: 'auto_sync', label: '自动同步', desc: '每隔 5 分钟自动将数据同步至云端', type: 'toggle', value: true },
      { id: 'wifi_only', label: '仅 Wi-Fi 同步', desc: '移动数据环境下暂停后台同步', type: 'toggle', value: false },
      { id: 'sync_now', label: '立即同步', desc: '手动触发一次全量同步', type: 'action', btnText: '立即同步', variant: 'primary' },
      { id: 'export', label: '导出数据', desc: '将所有知识块导出为 JSON / Markdown', type: 'action', btnText: '导出备份', variant: '' },
    ] as SettingItem[]
  },
  {
    title: 'AI 引擎 (OpenClaw / OpenAI 兼容)',
    icon: '✦',
    items: [
      { id: 'ai_base_url', label: 'API Base URL', desc: '已由系统托管连入本地 OpenClaw 守护进程', type: 'select', value: '127.0.0.1:3000 (系统托管)', options: ['127.0.0.1:3000 (系统托管)'] },
      { id: 'ai_api_key', label: 'API Key', desc: '输入您的鉴权密钥', type: 'input', value: '', placeholder: 'sk-...' },
      { id: 'model', label: '推理模型', desc: '选择用于 AI 问答的底层模型', type: 'select', value: 'gpt-4o-mini', options: ['gpt-4o-mini', 'gpt-4o', 'claude-3-haiku'] },
      { id: 'rag', label: 'RAG 语义搜索', desc: '开启后搜索将使用向量匹配，更精准但更耗时', type: 'toggle', value: true },
      { id: 'auto_tag', label: 'AI 自动打标签', desc: '新知识块入库时自动推断学科标签', type: 'toggle', value: true },
    ] as SettingItem[]
  },
  {
    title: '通知',
    icon: '🔔',
    items: [
      { id: 'task_remind', label: '任务提醒', desc: '临近截止时间时发送桌面通知', type: 'toggle', value: true },
      { id: 'focus_end', label: '专注结束提醒', desc: '番茄钟结束后播放提示音', type: 'toggle', value: true },
      { id: 'weekly_report', label: '每周学习报告', desc: '每周日 20:00 推送本周学习总结', type: 'toggle', value: false },
    ] as SettingItem[]
  },
])

// === Handlers ===
const handleToggle = (item: SettingItem) => {
  item.value = !item.value
  if (item.id === 'dark') {
    document.documentElement.classList.toggle('dark', item.value)
  }
}

const handleAction = (item: SettingItem) => {
  if (item.id === 'sync_now') {
    // simulate sync
    const orig = item.btnText
    item.btnText = '同步中...'
    setTimeout(() => { item.btnText = '✓ 已同步'; setTimeout(() => { item.btnText = orig }, 2000) }, 1500)
  }
}

const handleInputBlur = (item: SettingItem) => {
  if (item.id === 'ai_api_key') setAiConfig({ apiKey: item.value });
}

onMounted(async () => {
  const aiCfg = await getAiConfig();
  const group = settingGroups.find(g => g.title.includes('AI 引擎'));
  if (group) {
    const keyItem = group.items.find(i => i.id === 'ai_api_key');
    if (keyItem) keyItem.value = aiCfg.apiKey;
    const modelItem = group.items.find(i => i.id === 'model');
    if (modelItem) modelItem.value = aiCfg.model;
  }
})

const handleClearCache = () => {
  if (confirm('确定要清除所有本地缓存吗？')) {
    localStorage.clear()
    alert('本地缓存已清除。')
  }
}

const handleDeleteAccount = () => {
  alert('该功能需在移动端通过生物识别验证后才可操作。')
}
</script>

<style scoped>
/* ===== Layout ===== */
.profile-studio {
  display: flex;
  height: 100%;
  gap: 0;
  overflow: hidden;
}

/* ===== LEFT PANEL ===== */
.studio-left {
  width: 300px;
  flex-shrink: 0;
  height: 100%;
  overflow-y: auto;
  border-right: 1px solid var(--border-subtle);
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-ring {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.user-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 800;
  color: white;
  position: relative;
  z-index: 1;
}

.avatar-pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: var(--accent-gradient) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: destination-out;
  mask-composite: exclude;
  animation: spin-slow 6s linear infinite;
}

@keyframes spin-slow { to { transform: rotate(360deg); } }

.user-meta {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.user-streak {
  font-size: 12px;
  color: var(--text-muted);
}

.user-streak strong {
  color: var(--text-primary);
}

.level-badge {
  font-size: 11px;
  font-weight: 700;
  background: var(--accent-gradient);
  color: white;
  padding: 3px 8px;
  border-radius: var(--radius-full);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stat-cell {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-value.accent {
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
}

/* Bar Chart */
.pivot-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pivot-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.bar-chart {
  display: flex;
  gap: 6px;
  align-items: flex-end;
  height: 80px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
}

.bar-track {
  flex: 1;
  width: 100%;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  background: var(--accent-gradient);
  border-radius: 4px;
  transition: height 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0.6;
}

.bar-today .bar-fill,
.bar-fill.bar-today {
  opacity: 1;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
}

.bar-day {
  font-size: 10px;
  color: var(--text-muted);
}

/* Subjects */
.subject-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  font-size: 11px;
  color: var(--text-secondary);
  width: 68px;
  flex-shrink: 0;
}

.subject-bar-bg {
  flex: 1;
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.subject-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-pct {
  font-size: 10px;
  color: var(--text-muted);
  width: 28px;
  text-align: right;
  flex-shrink: 0;
}

/* AI Insight */
.insight-card {
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: var(--radius-lg);
  padding: 14px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.insight-icon {
  font-size: 14px;
  color: var(--text-accent);
  flex-shrink: 0;
  margin-top: 1px;
}

.insight-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
}

/* ===== RIGHT PANEL ===== */
.studio-right {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  padding: 28px 36px;
}

.settings-header {
  margin-bottom: 32px;
}

.settings-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  margin-bottom: 6px;
}

.settings-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Settings Groups */
.settings-group {
  margin-bottom: 28px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.group-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  padding: 14px 20px 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.group-items {
  padding: 4px 0;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle);
  gap: 20px;
  transition: background var(--transition-fast);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-row:hover {
  background: rgba(255, 255, 255, 0.02);
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.row-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.row-desc {
  font-size: 11px;
  color: var(--text-muted);
}

/* Toggle */
.toggle-btn {
  width: 40px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--border-default);
  border: none;
  cursor: pointer;
  position: relative;
  transition: background var(--transition-normal);
  flex-shrink: 0;
}

.toggle-btn.is-on {
  background: var(--accent-gradient);
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform var(--transition-normal);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

.toggle-btn.is-on .toggle-knob {
  transform: translateX(18px);
}

/* Select */
.settings-select {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
  outline: none;
  transition: border-color var(--transition-fast);
}

.settings-select:focus {
  border-color: var(--border-accent);
}

/* Input */
.settings-input {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 10px;
  width: 200px;
  outline: none;
  transition: border-color var(--transition-fast);
}

.settings-input:focus {
  border-color: var(--border-accent);
}

/* Action Btn */
.action-btn {
  padding: 7px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-default);
  background: var(--color-bg-tertiary);
  color: var(--text-secondary);
  font-family: inherit;
  transition: all var(--transition-fast);
  white-space: nowrap;
  flex-shrink: 0;
}

.action-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.action-btn.primary {
  background: var(--accent-gradient);
  border-color: transparent;
  color: white;
}

.action-btn.primary:hover {
  box-shadow: var(--accent-glow);
  transform: scale(1.02);
}

/* Danger Zone */
.danger-zone {
  margin-bottom: 28px;
  background: rgba(239, 68, 68, 0.04);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(239, 68, 68, 0.1);
  gap: 20px;
}

.danger-row:last-child {
  border-bottom: none;
}

.action-btn.danger {
  background: none;
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
}
</style>
