<template>
  <div class="pomodoro-page">
    <div class="main-content">
      
      <!-- Left Column: Timer Core (Enlarged proportion ~64%) -->
      <div class="left-column">
        <TimerCore />
      </div>

      <!-- Right Column: Stats & Details (~36%) -->
      <div class="right-column">
        
        <!-- Card 1: Current Focus Task -->
        <div class="panel-card top-card">
          <div class="card-header">
            <span class="card-title">当前专注</span>
            <p class="card-sub-hint">选择待专注的学习任务，或自由沉浸学习</p>
          </div>

          <div class="task-selector-wrap">
            <el-select
              v-model="currentTaskId"
              @change="onTaskChange"
              placeholder="选择专注任务"
              size="large"
              class="task-selector zen-select"
              popper-class="zen-select-popper pomodoro-task-popper"
              :teleported="false"
            >
              <el-option
                v-for="task in availableTasks"
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
          <div class="active-focus-banner" :class="{ 'is-free': selectedTask.isFreeStudy }">
            <div class="banner-info">
              <div class="banner-title">{{ selectedTask.name }}</div>
              <div class="banner-meta-row">
                <span class="banner-status-tag">{{ selectedTask.isFreeStudy ? '自由模式' : '已排期' }}</span>
                <span class="banner-desc">{{ selectedTask.isFreeStudy ? '自主掌握心流节奏 · 自由专注' : `排期时间：${selectedTask.timeStr}` }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 2: Today's Data -->
        <div class="panel-card middle-card">
          <div class="card-header">
            <span class="card-title">今日专注看板</span>
            <p class="card-sub-hint">记录今日完成的专注轮次与累计心流时长</p>
          </div>
          <div class="stats-container">
            <div class="stat-col">
              <span class="stat-val">{{ completedToday }}</span>
              <div class="stat-label-row">
                <IconCheck :size="15" :stroke-width="2.2" class="stat-icon" />
                <span class="stat-label">今日番茄</span>
              </div>
            </div>
            
            <div class="stat-divider"></div>

            <div class="stat-col">
              <div class="val-wrapper">
                <span class="stat-val">{{ completedToday * FOCUS_MINS }}</span>
                <span class="stat-unit">m</span>
              </div>
              <div class="stat-label-row">
                <IconFlame :size="15" :stroke-width="2.2" class="stat-icon" />
                <span class="stat-label">专注时长</span>
              </div>
            </div>
          </div>
        </div>
        
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { IconCheck, IconFlame } from '@tabler/icons-vue'
import TimerCore from '@/components/pomodoro/TimerCore.vue'
import { useTaskStore } from '@/store/useTaskStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'

const taskStore = useTaskStore()
const pomodoroStore = usePomodoroStore()

const FOCUS_MINS = 25

const FREE_STUDY_TASK = {
  id: 'free-study',
  name: '自由学习',
  timeStr: '随时开启专注',
  isFreeStudy: true,
}

const currentTaskId = ref<string>('free-study')
let userManuallySelected = false

function formatScheduledTime(scheduledAt?: string): string {
  if (!scheduledAt) return ''
  const date = new Date(scheduledAt)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (isToday) {
    return `今日 ${timeStr}`
  }
  const dayName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${dayName} ${timeStr}`
}

// 仅获取在时间轴上的任务（有 scheduledAt，未完成且未取消）
const timelineTasks = computed(() => {
  return taskStore.allTasks
    .filter((t: any) => Boolean(t.scheduledAt) && t.status !== 'completed' && t.status !== 'cancelled')
    .sort((a: any, b: any) => {
      const timeA = Date.parse(a.scheduledAt || '') || 0
      const timeB = Date.parse(b.scheduledAt || '') || 0
      return timeA - timeB
    })
    .map((t: any) => ({
      id: t.id,
      name: t.title || t.name || '未命名任务',
      scheduledAt: t.scheduledAt,
      durationMinutes: t.durationMinutes ?? t.duration ?? 30,
      timeStr: formatScheduledTime(t.scheduledAt),
      isFreeStudy: false,
    }))
})

// 补充自由学习任务作为首选
const availableTasks = computed(() => {
  return [FREE_STUDY_TASK, ...timelineTasks.value]
})

const selectedTask = computed(() => {
  if (currentTaskId.value === 'free-study') return FREE_STUDY_TASK
  return availableTasks.value.find((t) => t.id === currentTaskId.value) || FREE_STUDY_TASK
})

const completedToday = computed(() => {
  return pomodoroStore.completedToday
})

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
  padding: 40px 36px;
  gap: 64px;
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
  gap: 24px;
  height: 100%;
  justify-content: center;
}

/* Zen Card UI */
.panel-card {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 24px;
  border: 1px solid var(--border-subtle, #E6E6E4);
  padding: 26px 28px;
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  transition: all var(--transition-fast, 0.15s ease);
}

.card-header {
  margin-bottom: 18px;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  font-family: var(--font-family-base);
  letter-spacing: -0.2px;
}

.card-sub-hint {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  margin-top: 4px;
  margin-bottom: 0;
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
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04) inset, 0 0 0 1px var(--border-default, #E6E6E4) inset;
  padding: 8px 20px;
  height: 52px;
  min-height: 52px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
  font-size: 14.5px;
  color: var(--text-primary, #1C1C1A);
}

/* Active Focus Mini Banner (Clean typography, zero icons) */
.active-focus-banner {
  margin-top: 16px;
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(139, 154, 110, 0.08);
  border: 1px solid rgba(139, 154, 110, 0.2);
  transition: all 0.2s;
}
.active-focus-banner.is-free {
  background: rgba(110, 136, 152, 0.08);
  border-color: rgba(110, 136, 152, 0.2);
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
  font-size: 10.5px;
  font-weight: 600;
  padding: 1.5px 8px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.15);
  color: #637748;
  white-space: nowrap;
  flex-shrink: 0;
}
.active-focus-banner.is-free .banner-status-tag {
  background: rgba(110, 136, 152, 0.15);
  color: #536B79;
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
  padding: 8px 10px;
}
.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-divider {
  width: 1px;
  height: 52px;
  background-color: var(--border-subtle, #E6E6E4);
}
.val-wrapper {
  display: flex;
  align-items: baseline;
}
.stat-val {
  font-size: 38px;
  font-weight: 800;
  color: var(--text-primary, #1C1C1A);
  font-family: var(--font-family-base);
  line-height: 1;
}
.stat-unit {
  font-size: 16px;
  color: var(--text-muted, #7A7A75);
  margin-left: 4px;
  font-weight: 600;
}
.stat-label-row {
  display: flex;
  align-items: center;
  margin-top: 10px;
  gap: 5px;
}
.stat-icon {
  color: #8B9A6E;
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
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.35);
}
html.dark .card-title, html.dark .stat-val, html.dark .banner-title {
  color: #FAF7F2;
}
html.dark .stat-divider {
  background-color: rgba(163, 177, 155, 0.2);
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
}
</style>

<style>
/* Global popper styles for Pomodoro Task Selector */
.pomodoro-task-popper {
  background: #FAF7F2 !important;
  border-radius: 18px !important;
  padding: 6px !important;
  border: 1px solid rgba(139, 154, 110, 0.25) !important;
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
  font-size: 11px;
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
</style>
