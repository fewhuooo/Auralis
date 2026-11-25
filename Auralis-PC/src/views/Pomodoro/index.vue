<template>
  <div class="pomodoro-page">
    <div class="main-content">
      
      <!-- Left Column: Timer Core (Enlarged proportion ~64%) -->
      <div class="left-column">
        <TimerCore :task-id="displayedTask.isFreeStudy ? null : displayedTask.id" />
      </div>

      <!-- Right Column: Stats & Details (~36%) -->
      <div class="right-column">
        
        <!-- Card 1: Current Focus Task -->
        <div class="panel-card top-card">
          <div class="card-header">
            <span class="card-title">{{ t({ 'zh-CN': '当前专注', en: 'Current focus', ja: '現在の集中' }) }}</span>
            <p class="card-sub-hint">{{ activeSession ? t({ 'zh-CN': '本轮专注结束后可重新选择任务', en: 'You can change tasks after this session', ja: 'このセッションの終了後にタスクを変更できます' }) : t({ 'zh-CN': '选择要专注的任务，或开启自由专注', en: 'Choose a task or start a free focus session', ja: 'タスクを選ぶか、フリー集中を開始できます' }) }}</p>
          </div>

          <div class="task-selector-wrap">
            <el-select
              :model-value="displayedTask.id"
              @change="onTaskChange"
              :disabled="Boolean(activeSession)"
              :placeholder="t({ 'zh-CN': '选择专注任务', en: 'Choose a focus task', ja: '集中するタスクを選択' })"
              size="large"
              class="task-selector zen-select"
              popper-class="zen-select-popper pomodoro-task-popper"
              :teleported="false"
            >
              <el-option
                v-for="task in activeSession ? [displayedTask] : availableTasks"
                :key="task.id"
                :label="task.name"
                :value="task.id"
              >
                <div class="task-option-row">
                  <span class="task-option-name">{{ task.name }}</span>
                  <span class="task-option-badge" :class="{ 'is-free-badge': task.isFreeStudy }">
                    {{ task.timeStr }}
                  </span>
                </div>
              </el-option>
            </el-select>
          </div>

          <!-- Active Focus Mini Banner (Clean Typography, No Icons) -->
          <div class="active-focus-banner" :class="{ 'is-free': displayedTask.isFreeStudy }">
            <div class="banner-info">
              <div class="banner-title">{{ displayedTask.name }}</div>
              <div class="banner-meta-row">
                <span class="banner-status-tag">{{ displayedTask.isFreeStudy ? t({ 'zh-CN': '自由模式', en: 'Free focus', ja: 'フリー集中' }) : displayedTask.timeStr ? t({ 'zh-CN': '已排期', en: 'Scheduled', ja: '予定あり' }) : t({ 'zh-CN': '关联任务', en: 'Linked task', ja: '関連タスク' }) }}</span>
                <span v-if="displayedTask.isFreeStudy" class="banner-desc">{{ t({ 'zh-CN': '自主掌握心流节奏 · 自由专注', en: 'Focus at your own pace', ja: '自分のペースで集中' }) }}</span>
                <span v-else-if="displayedTask.timeStr" class="banner-desc">{{ t({ 'zh-CN': '排期时间：{time}', en: 'Scheduled for {time}', ja: '予定 {time}' }, { time: displayedTask.timeStr }) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 2: Today's Data -->
        <div class="panel-card middle-card">
          <div class="card-header">
            <span class="card-title">{{ t({ 'zh-CN': '今日专注看板', en: 'Today\'s focus', ja: '今日の集中' }) }}</span>
            <p class="card-sub-hint">{{ t({ 'zh-CN': '今日累计专注数据，暂停与休息不计入时长', en: 'Daily focus totals exclude pauses and breaks', ja: '今日の集中時間には一時停止と休憩を含みません' }) }}</p>
          </div>
          <div class="stats-container">
            <div class="stat-col">
              <span class="stat-val">{{ completedToday }}</span>
              <div class="stat-label-row">
                <IconCheck :size="15" :stroke-width="2.2" class="stat-icon" />
                <span class="stat-label">{{ t({ 'zh-CN': '今日番茄', en: 'Pomodoros today', ja: '今日のポモドーロ' }) }}</span>
              </div>
            </div>
            
            <div class="stat-divider"></div>

            <div class="stat-col">
              <div class="val-wrapper">
                <span class="stat-val">{{ (focusSecondsToday / 60).toFixed(1) }}</span>
                <span class="stat-unit">m</span>
              </div>
              <div class="stat-label-row">
                <IconFlame :size="15" :stroke-width="2.2" class="stat-icon" />
                <span class="stat-label">{{ t({ 'zh-CN': '专注时长', en: 'Focus time', ja: '集中時間' }) }}</span>
              </div>
            </div>
          </div>
        </div>
        
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { locale, t } from '@/i18n'
import { ref, computed, watch, onMounted } from 'vue'
import { IconCheck, IconFlame } from '@tabler/icons-vue'
import TimerCore from '@/components/pomodoro/TimerCore.vue'
import { useTaskStore } from '@/store/useTaskStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'

const taskStore = useTaskStore()
const pomodoroStore = usePomodoroStore()

const freeStudyTask = computed(() => ({
  id: 'free-study',
  name: t({ 'zh-CN': '自由学习', en: 'Free study', ja: '自由学習' }),
  timeStr: t({ 'zh-CN': '随时开启专注', en: 'Start whenever you\'re ready', ja: 'いつでも集中を開始' }),
  isFreeStudy: true,
}))

const currentTaskId = ref<string>('free-study')
let userManuallySelected = false

function formatScheduledTime(scheduledAt?: string): string {
  if (!scheduledAt) return ''
  const date = new Date(scheduledAt)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value, {
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

// 仅获取在时间轴上的任务（有 scheduledAt，未完成且未取消）
const timelineTasks = computed(() => {
  return taskStore.allTasks
    .filter((t) => Boolean(t.scheduledAt) && t.status !== 'completed' && t.status !== 'cancelled')
    .sort((a, b) => {
      const timeA = Date.parse(a.scheduledAt || '') || 0
      const timeB = Date.parse(b.scheduledAt || '') || 0
      return timeA - timeB
    })
    .map((task) => ({
      id: task.id,
      name: task.title || t({ 'zh-CN': '未命名任务', en: 'Untitled task', ja: '無題のタスク' }),
      scheduledAt: task.scheduledAt,
      durationMinutes: task.durationMinutes,
      timeStr: formatScheduledTime(task.scheduledAt),
      isFreeStudy: false,
    }))
})

// 补充自由学习任务作为首选
const availableTasks = computed(() => {
  return [freeStudyTask.value, ...timelineTasks.value]
})

const selectedTask = computed(() => {
  if (currentTaskId.value === 'free-study') return freeStudyTask.value
  return availableTasks.value.find((t) => t.id === currentTaskId.value) || freeStudyTask.value
})

const activeSession = computed(() => pomodoroStore.runtime.activeSession)
const displayedTask = computed(() => {
  const session = activeSession.value
  if (!session) return selectedTask.value
  if (session.taskId === null) return freeStudyTask.value

  const task = taskStore.allTasks.find((item) => item.id === session.taskId)
  return {
    id: session.taskId,
    name: task ? task.title || t({ 'zh-CN': '未命名任务', en: 'Untitled task', ja: '無題のタスク' }) : t({ 'zh-CN': '关联任务暂不可见', en: 'Linked task unavailable', ja: '関連タスクを表示できません' }),
    timeStr: formatScheduledTime(task?.scheduledAt),
    isFreeStudy: false,
  }
})

const completedToday = computed(() => {
  return pomodoroStore.completedToday
})

const focusSecondsToday = computed(() => pomodoroStore.focusSecondsToday)

/**
 * 寻找当前时间正在进行或即将开始的时间轴任务
 * 规则：默认若当前时刻正处于任务时间窗口内（[start, end)），自动选中该任务；
 * 若当前时间无进行中任务，自动回退到「自由学习」模式。
 */
function resolveDefaultTask() {
  if (userManuallySelected) return

  const now = Date.now()
  // 1. 优先寻找正在当前时间区间内进行中的任务
  const ongoingTask = timelineTasks.value.find((t) => {
    if (!t.scheduledAt) return false
    const start = Date.parse(t.scheduledAt)
    if (!Number.isFinite(start)) return false
    const duration = (t.durationMinutes ?? 30) * 60_000
    const end = start + duration
    return now >= start && now < end
  })

  if (ongoingTask) {
    currentTaskId.value = ongoingTask.id
    return
  }

  // 2. 检查是否有 10 分钟内即将开始的排期任务
  const imminentTask = timelineTasks.value.find((t) => {
    if (!t.scheduledAt) return false
    const start = Date.parse(t.scheduledAt)
    if (!Number.isFinite(start)) return false
    return start >= now && start <= now + 10 * 60_000
  })

  if (imminentTask) {
    currentTaskId.value = imminentTask.id
    return
  }

  // 3. 当前无排期任务，默认自由学习
  currentTaskId.value = 'free-study'
}

function onTaskChange(val: string) {
  userManuallySelected = true
  currentTaskId.value = val
}

watch(timelineTasks, () => {
  if (!userManuallySelected) {
    resolveDefaultTask()
  }
}, { immediate: true })

onMounted(async () => {
  if (taskStore.loadLocalTasks) {
    await taskStore.loadLocalTasks()
  }
  if (taskStore.fetchTasks) {
    await taskStore.fetchTasks()
  }
  resolveDefaultTask()
})
</script>

<style scoped>
.pomodoro-page {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-bg-secondary, #EEEEEE);
  position: relative;
  overflow: hidden;
}

.main-content {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: row;
  padding: calc(40px - var(--layout-gap-reduction)) calc(36px - var(--layout-gap-reduction));
  gap: calc(64px - var(--layout-gap-reduction));
  box-sizing: border-box;
}

/* Left Column: Enlarged to ~64% */
.left-column {
  flex: 6.4;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  justify-content: center;
}

/* Right Column: ~36% */
.right-column {
  flex: 3.6;
  display: flex;
  flex-direction: column;
  gap: calc(24px - var(--layout-gap-reduction));
  height: 100%;
  justify-content: center;
}

/* Zen Card UI */
.panel-card {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 24px;
  border: 0.5px solid var(--border-subtle, #E6E6E4);
  padding: calc(26px - var(--card-padding-reduction)) calc(28px - var(--card-padding-reduction));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), 0 12px 30px -4px rgba(0, 0, 0, 0.05), 0 2px 8px -2px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-card:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03), 0 16px 36px -4px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}

.card-header {
  margin-bottom: 18px;
}

.card-title {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  font-family: var(--font-family-base);
  letter-spacing: -0.3px;
}

.card-sub-hint {
  font-size: var(--font-size-caption);
  color: var(--text-muted, #7A7A75);
  margin-top: 4px;
  margin-bottom: 0;
  letter-spacing: 0.1px;
}

/* Zen Task Selector */
.task-selector-wrap {
  width: 100%;
}
.task-selector {
  width: 100%;
}
:deep(.zen-select .el-select__wrapper) {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 9999px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03) inset, 0 0 0 1px var(--border-default, #E6E6E4) inset;
  padding: 8px 20px;
  height: 52px;
  min-height: 52px;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
:deep(.zen-select .el-select__wrapper:hover) {
  box-shadow: 0 0 0 1.5px rgba(139, 154, 110, 0.45) inset;
}
:deep(.zen-select .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 2px #8B9A6E inset, 0 0 0 4px rgba(139, 154, 110, 0.18);
  background: var(--color-bg-tertiary, #FAF7F2);
}
:deep(.el-select__placeholder), :deep(.el-select__selected-item) {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #1C1C1A);
}

/* Active Focus Mini Banner (Clean typography, zero icons) */
.active-focus-banner {
  margin-top: 16px;
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(139, 154, 110, 0.07);
  border: 0.5px solid rgba(139, 154, 110, 0.2);
  border-left: 3.5px solid #8B9A6E;
  transition: all 0.25s ease;
}
.active-focus-banner.is-free {
  background: rgba(110, 136, 152, 0.07);
  border-color: rgba(110, 136, 152, 0.2);
  border-left-color: #6E8898;
}
.banner-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.banner-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.banner-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.banner-status-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.16);
  color: #556B3D;
  white-space: nowrap;
  flex-shrink: 0;
}
.active-focus-banner.is-free .banner-status-tag {
  background: rgba(110, 136, 152, 0.16);
  color: #486270;
}
.banner-desc {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  white-space: nowrap;
}

/* Stats Container */
.stats-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
}
.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.2s ease;
}
.stat-col:hover {
  transform: translateY(-1px);
}
.stat-divider {
  width: 0.5px;
  height: 52px;
  background: linear-gradient(180deg, transparent 0%, var(--border-default, #E6E6E4) 20%, var(--border-default, #E6E6E4) 80%, transparent 100%);
}
.val-wrapper {
  display: flex;
  align-items: baseline;
}
.stat-val {
  font-size: 40px;
  font-weight: 800;
  color: var(--text-primary, #1C1C1A);
  font-family: var(--font-family-base);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  letter-spacing: -1px;
}
.stat-unit {
  font-size: 15px;
  color: var(--text-muted, #7A7A75);
  margin-left: 4px;
  font-weight: 600;
}
.stat-label-row {
  display: flex;
  align-items: center;
  margin-top: 10px;
  gap: 6px;
}
.stat-icon {
  color: #8B9A6E;
  transition: transform 0.2s ease;
}
.stat-col:hover .stat-icon {
  transform: scale(1.1);
}
.stat-label {
  font-size: 13px;
  color: var(--text-muted, #7A7A75);
  font-weight: 600;
}

/* Dark Mode Overrides */
html.dark .pomodoro-page {
  background: var(--color-bg-primary, #181D18);
}
html.dark .panel-card {
  background: var(--color-bg-secondary, #212621);
  border-color: rgba(163, 177, 155, 0.22);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), 0 12px 30px -4px rgba(0, 0, 0, 0.4);
}
html.dark .panel-card:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 16px 36px -4px rgba(0, 0, 0, 0.5);
}
html.dark .card-title, html.dark .stat-val, html.dark .banner-title {
  color: #FAF7F2;
}
html.dark .stat-divider {
  background: linear-gradient(180deg, transparent 0%, rgba(163, 177, 155, 0.2) 20%, rgba(163, 177, 155, 0.2) 80%, transparent 100%);
}
html.dark :deep(.zen-select .el-select__wrapper) {
  background: #181D18;
  box-shadow: 0 0 0 1px rgba(163, 177, 155, 0.25) inset;
}
html.dark :deep(.zen-select .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 2px #9AB08F inset, 0 0 0 4px rgba(154, 176, 143, 0.2);
}
html.dark .active-focus-banner {
  background: rgba(154, 176, 143, 0.12);
  border-color: rgba(154, 176, 143, 0.25);
  border-left-color: #9AB08F;
}
html.dark .active-focus-banner.is-free {
  background: rgba(110, 136, 152, 0.12);
  border-color: rgba(110, 136, 152, 0.25);
  border-left-color: #849EAE;
}
html.dark .active-focus-banner .banner-status-tag {
  color: #b8ccaf;
}
html.dark .active-focus-banner.is-free .banner-status-tag {
  color: #a0b8c7;
}
</style>

<style>
/* Global popper styles for Pomodoro Task Selector */
.pomodoro-task-popper {
  background: #FAF7F2 !important;
  border-radius: 18px !important;
  padding: 6px !important;
  border: 0.5px solid rgba(139, 154, 110, 0.25) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08) !important;
}
.pomodoro-task-popper .el-select-dropdown__item {
  border-radius: 12px !important;
  height: 44px !important;
  line-height: 44px !important;
  padding: 0 14px !important;
  margin-bottom: 4px !important;
  font-weight: 500 !important;
  color: #1C1C1A !important;
  transition: all 0.15s ease !important;
}
.pomodoro-task-popper .el-select-dropdown__item.is-hovering,
.pomodoro-task-popper .el-select-dropdown__item:hover {
  background: rgba(139, 154, 110, 0.1) !important;
  color: #8B9A6E !important;
}
.pomodoro-task-popper .el-select-dropdown__item.is-selected {
  background: rgba(139, 154, 110, 0.16) !important;
  color: #637748 !important;
  font-weight: 700 !important;
}
.pomodoro-task-popper .el-select-dropdown__empty {
  padding: 16px !important;
  color: #7A7A75 !important;
  font-size: 13px !important;
}
.task-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}
.task-option-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-option-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.12);
  color: #637748;
  flex-shrink: 0;
}
.task-option-badge.is-free-badge {
  background: rgba(110, 136, 152, 0.12);
  color: #536B79;
}
html.dark .pomodoro-task-popper {
  background: #181D18 !important;
  border-color: rgba(163, 177, 155, 0.25) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5) !important;
}
html.dark .pomodoro-task-popper .el-select-dropdown__item {
  color: #FAF7F2 !important;
}
html.dark .pomodoro-task-popper .el-select-dropdown__item.is-hovering,
html.dark .pomodoro-task-popper .el-select-dropdown__item:hover {
  background: rgba(154, 176, 143, 0.15) !important;
  color: #9AB08F !important;
}
html.dark .pomodoro-task-popper .el-select-dropdown__item.is-selected {
  background: rgba(154, 176, 143, 0.25) !important;
  color: #b0c2a7 !important;
}

/* ===== Responsive Adaptation ===== */
@media (max-width: 1150px) {
  .main-content {
    padding: 24px 20px;
    gap: 32px;
  }
}

@media (max-width: 960px) {
  .main-content {
    padding: 16px;
    gap: 20px;
    flex-direction: column;
    overflow-y: auto;
  }
  .left-column {
    flex: none;
    height: auto;
    min-height: 380px;
  }
  .right-column {
    flex: none;
    height: auto;
  }
}
</style>
