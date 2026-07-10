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
          <h2 class="user-name">Auralis 同学</h2>
          <p class="user-streak">🔥 连续学习第 <strong>{{ continuousStudyDays }}</strong> 天</p>
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
        <div v-if="weekBars.length === 0 || weekBars.every(b => b.pct === 0)" class="no-data-hint">
          本周暂无专注记录
        </div>
        <div class="bar-chart" v-else>
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
import { useStatsApi } from '@/api/useStatsApi'
import { useSyncStore } from '@/store/useSyncStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useBlockStore } from '@/store/useBlockStore'
import { ElNotification, ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message-box.css'

const settingsStore = useSettingsStore()
const blockStore = useBlockStore()

const continuousStudyDays = ref(1)

// === Stats ===
const coreStats = ref([
  { label: '知识块', value: '0', accent: false },
  { label: '完成任务', value: '0', accent: false },
  { label: '总专注时长', value: '0h', accent: true },
  { label: '本周新增', value: '0', accent: false },
])

// === Week bars ===
const weekBars = ref<any[]>([])

// === Subjects ===
const subjects = ref<any[]>([])

// === AI Insight ===
const aiInsight = ref('根据您的学习习惯，持续整理知识库并合理编排专注任务能获得最佳的学习心流体验。')

const colors = ['#7D9372', '#5E7A53', '#95A88C', '#A3B19B', '#6B8560', '#B3C0AD']
const dayMapping: Record<string, string> = {
  'Mon': '一', 'Tue': '二', 'Wed': '三', 'Thu': '四', 'Fri': '五', 'Sat': '六', 'Sun': '日'
}

const syncStore = useSyncStore()

const loadStats = async () => {
  try {
    const overviewRes: any = await useStatsApi.getOverview()
    const weeklyRes: any = await useStatsApi.getWeekly()

    const overview = overviewRes || {}
    const weekly = weeklyRes || { weekBars: [] }

    continuousStudyDays.value = overview.continuousStudyDays || 1
    
    coreStats.value = [
      { label: '知识块', value: String(overview.totalBlocks || 0), accent: false },
      { label: '完成任务', value: String(overview.totalTasks || 0), accent: false },
      { label: '总专注时长', value: ((overview.totalFocusMinutes || 0) / 60).toFixed(1) + 'h', accent: true },
      { label: '本周新增', value: String(overview.weeklyNewBlocks || 0), accent: false },
    ]

    // Map week bars
    const rawBars = weekly.weekBars || []
    const maxMins = Math.max(...rawBars.map((b: any) => b.focusMinutes), 60)
    const todayName = new Date().getDay() // 0 = Sun, 1 = Mon...
    const todayMapIndex = todayName === 0 ? 6 : todayName - 1
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const todayStr = weekDays[todayMapIndex]

    weekBars.value = rawBars.map((bar: any) => ({
      day: dayMapping[bar.day] || bar.day,
      pct: Math.round(((bar.focusMinutes || 0) * 100) / maxMins),
      today: bar.day === todayStr
    }))

    // Map subjects
    const rawSubjects = overview.subjectDistribution || []
    subjects.value = rawSubjects.map((item: any, index: number) => ({
      name: item.subject || '未分类',
      pct: item.pct || 0,
      color: colors[index % colors.length]
    }))

    // Dynamic AI Insight based on stats
    if (overview.totalFocusMinutes > 240) {
      aiInsight.value = '您本周的专注学习状态极其出色！主要精力集中在 ' + (subjects.value[0]?.name || '重点学科') + '，建议继续保持现有的心流节奏。'
    } else {
      aiInsight.value = '开启您的每日学习任务吧！合理利用番茄钟进行大纲拆解与目标管理，知识库会自动记录您的每次成长。'
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
      { id: 'dark', label: '深色模式', desc: '切换应用主题为深色', type: 'toggle', value: settingsStore.isDark },
      { id: 'compact', label: '紧凑布局', desc: '减小卡片和间距以显示更多内容', type: 'toggle', value: settingsStore.compactLayout },
      { id: 'lang', label: '界面语言', desc: '选择应用显示语言', type: 'select', value: localStorage.getItem('sc_setting_lang') || '简体中文', options: ['简体中文', 'English', '日本語'] },
      { id: 'font_size', label: '字体大小', desc: '调整全局基础字号', type: 'select', value: settingsStore.fontSize, options: ['12px', '14px', '16px'] },
    ] as SettingItem[]
  },
  {
    title: '同步与备份',
    icon: '☁️',
    items: [
      { id: 'auto_sync', label: '自动同步', desc: '每隔 5 分钟自动将数据同步至云端', type: 'toggle', value: localStorage.getItem('sc_setting_auto_sync') !== 'false' },
      { id: 'wifi_only', label: '仅 Wi-Fi 同步', desc: '移动数据环境下暂停后台同步', type: 'toggle', value: localStorage.getItem('sc_setting_wifi_only') === 'true' },
      { id: 'sync_now', label: '立即同步', desc: '手动触发一次全量同步', type: 'action', btnText: '立即同步', variant: 'primary' },
      { id: 'export', label: '导出数据', desc: '将所有知识块导出为 JSON / Markdown', type: 'action', btnText: '导出备份', variant: '' },
    ] as SettingItem[]
  },
  {
    title: 'AI 引擎（后端管理）',
    icon: '✦',
    items: [
      { id: 'rag', label: 'RAG 语义搜索', desc: '开启后搜索将使用向量匹配，更精准但更耗时', type: 'toggle', value: localStorage.getItem('sc_setting_rag') !== 'false' },
      { id: 'auto_tag', label: 'AI 自动打标签', desc: '新知识块入库时自动推断学科标签', type: 'toggle', value: localStorage.getItem('sc_setting_auto_tag') !== 'false' },
    ] as SettingItem[]
  },
  {
    title: '通知',
    icon: '🔔',
    items: [
      { id: 'task_remind', label: '任务提醒', desc: '临近截止时间时发送桌面通知', type: 'toggle', value: localStorage.getItem('sc_setting_task_remind') !== 'false' },
      { id: 'focus_end', label: '专注结束提醒', desc: '番茄钟结束后播放提示音', type: 'toggle', value: localStorage.getItem('sc_setting_focus_end') !== 'false' },
      { id: 'weekly_report', label: '每周学习报告', desc: '每周日 20:00 推送本周学习总结', type: 'toggle', value: localStorage.getItem('sc_setting_weekly_report') === 'true' },
    ] as SettingItem[]
  },
])

// === Handlers ===
const handleToggle = (item: SettingItem) => {
  item.value = !item.value
  switch (item.id) {
    case 'dark':
      settingsStore.isDark = item.value
      break
    case 'compact':
      settingsStore.compactLayout = item.value
      break
    case 'auto_sync':
    case 'wifi_only':
    case 'rag':
    case 'auto_tag':
    case 'task_remind':
    case 'focus_end':
    case 'weekly_report':
      localStorage.setItem(`sc_setting_${item.id}`, String(item.value))
      ElNotification({
        title: '⚙️ 设置已更新',
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
    title: '⚙️ 设置已生效',
    message: `[${item.label}] 已更新为: ${item.value}`,
    type: 'success',
    duration: 2000
  })
}

const handleAction = async (item: SettingItem) => {
  if (item.id === 'sync_now') {
    const orig = item.btnText
    item.btnText = '同步中...'
    try {
      await syncStore.triggerSync()
      item.btnText = '✓ 同步成功'
      await loadStats()
      ElNotification({ title: '☁️ 同步成功', message: '所有数据已成功同步至云端', type: 'success', duration: 3000 })
    } catch (e) {
      item.btnText = '✕ 同步失败'
      ElNotification({ title: '⚠️ 同步失败', message: '同步遇到错误，请检查网络后重试', type: 'error', duration: 3000 })
    } finally {
      setTimeout(() => { item.btnText = orig }, 2500)
    }
  } else if (item.id === 'export') {
    try {
      await blockStore.loadLocalBlocks()
      const blocks = blockStore.recentBlocks || []
      const jsonData = JSON.stringify(blocks, null, 2)
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `auralis_backup_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      ElNotification({ title: '📥 导出成功', message: '本地知识库已成功打包下载', type: 'success', duration: 3000 })
    } catch (err: any) {
      ElNotification({ title: '⚠️ 导出失败', message: err.message || '获取知识列表失败', type: 'error', duration: 3000 })
    }
  }
}

const handleInputBlur = (_item: SettingItem) => {
  // handled in backend
}

onMounted(async () => {
  await loadStats()
})

const handleClearCache = async () => {
  try {
    await ElMessageBox.confirm('将清除所有本地缓存数据，不影响云端数据与您的登录状态。确认继续？', '清除缓存', {
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    const keysToRemove = [
      'auralis_knowledge_blocks', 'auralis_task_blocks',
      'auralis_chat_sessions', 'auralis_chat_messages',
      'auralis_local_mutations', 'auralis_sync_metadata'
    ]
    keysToRemove.forEach(k => localStorage.removeItem(k))
    ElNotification({ title: '✅ 缓存已清除', message: '本地数据缓存已清理完毕', type: 'success', duration: 3000 })
    await loadStats()
  } catch {
    // User cancelled
  }
}

const handleDeleteAccount = async () => {
  try {
    const { value: inputPwd } = await ElMessageBox.prompt(
      '注销账户将永久删除您在云端和本地的所有个人数据，此操作不可逆。请输入您的密码确认：',
      '⚠️ 注销账户',
      {
        confirmButtonText: '确认注销',
        cancelButtonText: '取消',
        inputType: 'password',
        inputPlaceholder: '请输入密码'
      }
    )
    if (!inputPwd) return
    ElNotification({
      title: '注销申请已提交',
      message: '您的注销请求已受理，请在 24 小时内查看邮箱完成最终注销确认。',
      type: 'warning',
      duration: 6000
    })
  } catch {
    // User cancelled
  }
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
  grid-template-columns: repeat(2, 1fr);
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

.no-data-hint {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
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
  box-shadow: 0 0 8px rgba(125, 147, 114, 0.5);
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
  background: rgba(163, 177, 155, 0.08);
  border: 1px solid rgba(163, 177, 155, 0.25);
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
