<template>
  <TabletLayout>
    <div class="t-pomodoro" @click="showTaskDropdown = false">
      <div class="main-content">
        <div class="left-column">
          <TimerCore :date-text="clockText.dateText" :time-text="clockText.timeText" />
        </div>

        <div class="right-column">
          <!-- Card 1: 当前专注 -->
          <div class="panel-card top-card">
            <div class="card-header">
              <span class="card-title">当前专注</span>
              <span class="card-sub-hint">
                {{ focusStore.isTaskLocked ? '本轮专注结束后可重新选择任务' : '选择要专注的任务，或开启自由专注' }}
              </span>
            </div>

            <div class="task-selector-wrap" @click.stop>
              <div
                class="task-selector-trigger"
                :class="{ 'is-open': showTaskDropdown, 'is-locked': focusStore.isTaskLocked }"
                role="button"
                aria-label="选择专注任务"
                @click="toggleTaskDropdown"
              >
                <span class="selector-value-text">{{ displayedTask.name }}</span>
                <LineIcon
                  v-if="focusStore.isTaskLocked"
                  name="lock"
                  size="15px"
                  color="var(--text-muted, #7A7A75)"
                />
                <div v-else class="selector-chevron" :class="{ 'is-open': showTaskDropdown }">
                  <LineIcon name="chevron-down" size="15px" color="var(--text-muted, #7A7A75)" />
                </div>
              </div>

              <div v-if="showTaskDropdown && !focusStore.isTaskLocked" class="task-dropdown-panel">
                <div class="task-dropdown-scroll zen-scroll-y">
                  <div
                    class="task-option-item"
                    :class="{ 'is-selected': !focusStore.selectedTaskId }"
                    role="button"
                    @click="selectTaskOption(null)"
                  >
                    <span class="task-option-name">自由学习</span>
                    <span class="task-option-badge is-free-badge">随时开启专注</span>
                  </div>

                  <div
                    v-for="task in scheduledTasks"
                    :key="task.id"
                    class="task-option-item"
                    :class="{ 'is-selected': focusStore.selectedTaskId === task.id }"
                    role="button"
                    @click="selectTaskOption(task)"
                  >
                    <span class="task-option-name">{{ task.name || '未命名任务' }}</span>
                    <span class="task-option-badge num-tabular">
                      {{ formatFocusScheduledTime(task.scheduledAt, nowMs) }}
                    </span>
                  </div>

                  <div v-if="pendingTasks.length > 0" class="dropdown-group-label">
                    <span>待办清单</span>
                  </div>

                  <div
                    v-for="task in pendingTasks"
                    :key="task.id"
                    class="task-option-item"
                    :class="{ 'is-selected': focusStore.selectedTaskId === task.id }"
                    role="button"
                    @click="selectTaskOption(task)"
                  >
                    <span class="task-option-name">{{ task.name || '未命名任务' }}</span>
                    <span class="task-option-badge num-tabular">{{ task.duration || 30 }}m</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="active-focus-banner" :class="{ 'is-free': displayedTask.isFreeStudy }">
              <div class="banner-info">
                <span class="banner-title">{{ displayedTask.name }}</span>
                <div class="banner-meta-row">
                  <span class="banner-status-tag">{{ displayedTask.statusTag }}</span>
                  <span class="banner-desc">{{ displayedTask.bannerDesc }}</span>
                </div>
              </div>
            </div>

            <div v-if="focusStore.lastCompletedTask" class="complete-prompt">
              <span class="complete-prompt-title">完成「{{ focusStore.lastCompletedTask.title }}」？</span>
              <div class="complete-prompt-actions">
                <button
                  type="button"
                  class="prompt-btn is-secondary"
                  :disabled="completingTask"
                  @click="focusStore.dismissCompletedTaskPrompt()"
                >暂不</button>
                <button
                  type="button"
                  class="prompt-btn is-primary"
                  :disabled="completingTask"
                  @click="completeBoundTask"
                >{{ completingTask ? '保存中…' : '标记完成' }}</button>
              </div>
            </div>
          </div>

          <!-- Card 2: 今日专注看板 -->
          <div class="panel-card middle-card">
            <div class="card-header">
              <span class="card-title">今日专注看板</span>
              <span class="card-sub-hint">今日累计专注数据，暂停与休息不计入时长</span>
            </div>

            <div class="stats-container">
              <div class="stat-col">
                <span class="stat-val num-tabular">{{ focusStore.todayRounds }}</span>
                <div class="stat-label-row">
                  <LineIcon name="check" size="15px" color="#8B9A6E" />
                  <span class="stat-label">今日番茄</span>
                </div>
              </div>

              <div class="stat-divider"></div>

              <div class="stat-col">
                <div class="val-wrapper">
                  <span class="stat-val num-tabular">{{ todayFocusMinutesText }}</span>
                  <span class="stat-unit">m</span>
                </div>
                <div class="stat-label-row">
                  <LineIcon name="fire" size="15px" color="#8B9A6E" />
                  <span class="stat-label">专注时长</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { showToast } from '@/platform/feedback'
import { onPageHide, onPageShow } from '@/platform/lifecycle'
import {
  formatFocusClockDateTime,
  formatFocusScheduledTime,
  resolveDefaultFocusTask,
  resolveDisplayedFocusTask,
} from '@/services/focusController'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusStore } from '@/store/useFocusStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import TimerCore from './TimerCore.vue'

const authStore = useAuthStore()
const focusStore = useFocusStore()
const taskStore = useTaskStore()

const showTaskDropdown = ref(false)
const completingTask = ref(false)
const nowMs = ref(Date.now())
const tasksLoaded = ref(false)

let userManuallySelected = false
let clockTimer: ReturnType<typeof setInterval> | null = null
let lastClockMinute = Math.floor(nowMs.value / 60_000)
let syncTaskFlight: { generation: symbol; promise: Promise<void> } | null = null

const clockText = computed(() => formatFocusClockDateTime(nowMs.value))

const scheduledTasks = computed(() => (
  taskStore.allTasks
    .filter(task => !task.is_deleted && task.scheduledAt && Number.isFinite(Date.parse(task.scheduledAt)) && task.status !== 'completed' && task.status !== 'cancelled')
    .sort((a, b) => (Date.parse(a.scheduledAt || '') || 0) - (Date.parse(b.scheduledAt || '') || 0))
))

const pendingTasks = computed(() => taskStore.pendingTasks)

const displayedTask = computed(() => (
  resolveDisplayedFocusTask({
    selectedTaskId: focusStore.selectedTaskId,
    selectedTaskTitle: focusStore.selectedTaskTitle,
    selectedTaskSubject: focusStore.selectedTaskSubject,
    tasks: taskStore.allTasks,
    nowMs: nowMs.value,
  })
))

const todayFocusMinutesText = computed(() => (focusStore.todayFocusSeconds / 60).toFixed(1))

function ensureStandardFocusMinutes() {
  if (!focusStore.isTaskLocked && focusStore.focusMinutes !== 25) {
    focusStore.setFocusMinutes(25)
  }
}

function applyDefaultTaskIfNeeded() {
  if (focusStore.isTaskLocked) return

  if (focusStore.selectedTaskId) {
    if (!tasksLoaded.value) return
    const existing = taskStore.allTasks.find(
      item => item.id === focusStore.selectedTaskId && !item.is_deleted && item.status !== 'completed' && item.status !== 'cancelled',
    )
    if (existing) return
    focusStore.selectTask(null)
    userManuallySelected = false
  }

  if (userManuallySelected) return
  const candidate = resolveDefaultFocusTask(taskStore.allTasks, nowMs.value)
  if (candidate) {
    focusStore.selectTask(candidate)
  }
}

function startClock() {
  stopClock()
  nowMs.value = Date.now()
  lastClockMinute = Math.floor(nowMs.value / 60_000)
  clockTimer = setInterval(() => {
    const current = Date.now()
    nowMs.value = current
    const minute = Math.floor(current / 60_000)
    if (minute !== lastClockMinute) {
      lastClockMinute = minute
      applyDefaultTaskIfNeeded()
    }
  }, 1000)
}

function stopClock() {
  if (!clockTimer) return
  clearInterval(clockTimer)
  clockTimer = null
}

async function syncFocusState() {
  startClock()
  focusStore.reconcileNow(false)
  ensureStandardFocusMinutes()
  void focusStore.flushPendingSessions()

  const generation = authStore.getLoginGeneration()
  if (syncTaskFlight && syncTaskFlight.generation === generation) {
    return syncTaskFlight.promise
  }

  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const flight = {
    generation,
    promise: Promise.resolve(),
  }
  syncTaskFlight = flight
  flight.promise = (async () => {
    try {
      await taskStore.fetchTasks()
    } finally {
      if (syncTaskFlight === flight) {
        syncTaskFlight = null
      }
      if (
        generation === authStore.getLoginGeneration()
        && userId === authStore.user?.id
        && serverDeviceId === authStore.serverDeviceId
      ) {
        tasksLoaded.value = true
        applyDefaultTaskIfNeeded()
      }
    }
  })()
  return flight.promise
}

function toggleTaskDropdown() {
  if (focusStore.isTaskLocked) {
    showTaskDropdown.value = false
    showToast('本轮专注结束后可重新选择任务')
    return
  }
  showTaskDropdown.value = !showTaskDropdown.value
}

function selectTaskOption(task: Task | null) {
  userManuallySelected = true
  focusStore.selectTask(task)
  showTaskDropdown.value = false
}

async function completeBoundTask() {
  if (completingTask.value) return
  const target = focusStore.lastCompletedTask
  if (!target?.id) return
  const existing = taskStore.allTasks.find(item => item.id === target.id && !item.is_deleted)
  if (!existing || existing.status === 'completed' || existing.status === 'cancelled') {
    focusStore.dismissCompletedTaskPrompt()
    return
  }
  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  completingTask.value = true
  try {
    await taskStore.toggleTaskComplete(target.id)
    if (
      generation !== authStore.getLoginGeneration()
      || userId !== authStore.user?.id
      || serverDeviceId !== authStore.serverDeviceId
    ) {
      return
    }
    showToast('已标记完成')
    focusStore.dismissCompletedTaskPrompt()
  } catch (error) {
    if (
      generation === authStore.getLoginGeneration()
      && userId === authStore.user?.id
      && serverDeviceId === authStore.serverDeviceId
    ) {
      showToast(error instanceof Error ? error.message : '标记完成失败，请重试')
    }
  } finally {
    completingTask.value = false
  }
}

useEscapeKey(() => showTaskDropdown.value, () => {
  showTaskDropdown.value = false
})

watch(
  () => [focusStore.isTaskLocked, focusStore.focusMinutes],
  () => {
    if (focusStore.isTaskLocked) {
      showTaskDropdown.value = false
    }
    ensureStandardFocusMinutes()
  },
  { immediate: true },
)

watch(
  () => [authStore.sessionId, authStore.user?.id, authStore.serverDeviceId],
  () => {
    userManuallySelected = false
    syncTaskFlight = null
    tasksLoaded.value = false
    showTaskDropdown.value = false
    completingTask.value = false
  },
)

watch(
  () => taskStore.allTasks,
  () => {
    applyDefaultTaskIfNeeded()
  },
)

onMounted(() => {
  void syncFocusState()
})
onPageShow(() => {
  void syncFocusState()
})
onPageHide(stopClock)
onUnmounted(stopClock)
</script>

<style scoped>
.t-pomodoro {
  display: flex;
  width: 100%;
  height: 100%;
  background-color: transparent;
  overflow: hidden;
  box-sizing: border-box;
}

.main-content {
  width: 100%;
  max-width: 1520px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: row;
  padding: clamp(16px, 2.6vh, 32px) clamp(18px, 2.4vw, 32px);
  gap: clamp(20px, 3.2vw, 48px);
  box-sizing: border-box;
}

.left-column {
  flex: 6.4;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  height: 100%;
}

.right-column {
  flex: 3.6;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 24px;
  height: 100%;
}

.panel-card {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 18px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 18px 20px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.02),
    0 12px 30px -4px rgba(0, 0, 0, 0.05),
    0 2px 8px -2px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: transform 0.28s var(--ease-out), box-shadow 0.28s var(--ease-out);
}

.top-card {
  position: relative;
  z-index: 2;
}

.middle-card {
  position: relative;
  z-index: 1;
}

.panel-card:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03), 0 16px 36px -4px rgba(0, 0, 0, 0.07);
}

.panel-card:active {
  transform: scale(0.992);
}

.card-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 18px;
}

.card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.card-sub-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
  letter-spacing: 0.1px;
  line-height: 1.45;
}

.task-selector-wrap {
  position: relative;
  width: 100%;
}

.task-selector-trigger {
  width: 100%;
  height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: inset 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}

.task-selector-trigger:hover:not(.is-locked) {
  border-color: rgba(139, 154, 110, 0.5);
}

.task-selector-trigger:active:not(.is-locked) {
  border-color: rgba(139, 154, 110, 0.6);
  transform: scale(0.985);
}

.task-selector-trigger.is-open {
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
}

.task-selector-trigger.is-locked {
  opacity: 0.72;
  cursor: default;
}

.selector-value-text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selector-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s var(--ease-out);
}

.selector-chevron.is-open {
  transform: rotate(180deg);
}

.task-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 60;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 18px;
  padding: 6px;
  border: 1px solid rgba(139, 154, 110, 0.25);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.10);
  box-sizing: border-box;
}

.task-dropdown-scroll {
  max-height: 260px;
}

.dropdown-group-label {
  padding: 8px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.task-option-item {
  min-height: 44px;
  padding: 8px 14px;
  margin-bottom: 4px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.14s var(--ease-out);
}

.task-option-item:last-child {
  margin-bottom: 0;
}

.task-option-item:hover {
  background: rgba(139, 154, 110, 0.10);
}

.task-option-item:active {
  background: rgba(139, 154, 110, 0.16);
  transform: scale(0.985);
}

.task-option-item.is-selected {
  background: rgba(139, 154, 110, 0.16);
}

.task-option-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-option-item:hover .task-option-name {
  color: #76855B;
}

.task-option-item.is-selected .task-option-name {
  color: #637748;
  font-weight: 700;
}

.task-option-badge {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: rgba(139, 154, 110, 0.12);
  color: #637748;
  flex-shrink: 0;
  white-space: nowrap;
}

.task-option-badge.is-free-badge {
  background: rgba(110, 136, 152, 0.12);
  color: #536B79;
}

.active-focus-banner {
  margin-top: 16px;
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(139, 154, 110, 0.07);
  border: 1px solid rgba(139, 154, 110, 0.2);
  border-left: 3.5px solid #8B9A6E;
  box-sizing: border-box;
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
  color: var(--text-primary);
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
  border-radius: var(--radius-full);
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
  color: var(--text-muted);
  white-space: nowrap;
}

.complete-prompt {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.complete-prompt-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.complete-prompt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.prompt-btn {
  height: 30px;
  padding: 0 14px;
  margin: 0;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  line-height: 30px;
  border: none;
  cursor: pointer;
}

.prompt-btn::after {
  border: none;
}

.prompt-btn.is-secondary {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-secondary);
}

.prompt-btn.is-primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
}

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
}

.stat-divider {
  width: 1px;
  height: 52px;
  background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.09) 20%, rgba(0, 0, 0, 0.09) 80%, transparent 100%);
}

.val-wrapper {
  display: flex;
  align-items: baseline;
}

.stat-val {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -1px;
}

.stat-unit {
  font-size: 15px;
  color: var(--text-muted);
  margin-left: 4px;
  font-weight: 600;
}

.stat-label-row {
  display: flex;
  align-items: center;
  margin-top: 10px;
  gap: 6px;
}

.stat-label {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 600;
}

@media (max-width: 1150px) {
  .main-content {
    padding: 24px 20px;
    gap: 28px;
  }
}

@media (max-width: 780px) {
  .t-pomodoro {
    overflow-y: auto;
  }

  .main-content {
    padding: 16px;
    gap: 20px;
    flex-direction: column;
    height: auto;
  }

  .left-column {
    flex: none;
    height: auto;
    min-height: 420px;
  }

  .right-column {
    flex: none;
    height: auto;
    padding-bottom: 20px;
  }
}
</style>
