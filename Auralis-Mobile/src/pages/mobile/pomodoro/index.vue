<template>
  <AppPageLayout>
    <div class="pomodoro-page">
      <div class="status-bar-spacer"></div>

      <div class="time-row">
        <div class="datetime-pill num-tabular">
          <div class="datetime-dot"></div>
          <span>{{ clockText.dateText }} {{ clockText.timeText }}</span>
        </div>
      </div>

      <div class="timer-scroll zen-scroll-y">
        <div class="timer-scroll-inner">
          <div class="timer-hero">
            <PomodoroRing
              size="min(284px, 72vw, 36vh)"
              :total-seconds="focusStore.totalSeconds"
              :remaining-seconds="focusStore.remainingSeconds"
              :is-running="focusStore.isRunning"
              :color="focusStore.ringColor"
              :is-break="focusStore.isBreakPhase"
              :show-bottom-pill="true"
              :aria-label="focusStore.isRunning ? '点击暂停专注' : '点击开始专注'"
              @center-click="focusStore.toggle()"
            />

            <div class="phase-status">
              <div
                class="phase-pill"
                :class="{ 'is-break': focusStore.isBreakPhase, 'is-active': focusStore.isRunning }"
              >
                <div class="phase-beacon"></div>
                <span>{{ focusStore.isBreakPhase ? '茶歇时刻' : '沉浸专注中' }}</span>
              </div>
            </div>

            <div class="progress-dots" :aria-label="`今日第 ${focusStore.cycleCount} 个番茄周期`">
              <div
                v-for="idx in 4"
                :key="idx"
                class="dot"
                :class="{
                  'is-filled': focusStore.cycleCount >= idx,
                  'is-break-filled': focusStore.cycleCount >= idx && focusStore.isBreakPhase,
                }"
              ></div>
            </div>

            <div class="controls">
              <div class="ctrl-btn" role="button" aria-label="重置" @click="focusStore.reset()">
                <span>重置</span>
              </div>

              <div
                class="main-btn"
                :class="{ 'is-break': focusStore.isBreakPhase }"
                role="button"
                :aria-label="focusStore.isRunning ? '暂停专注' : '开始专注'"
                @click="focusStore.toggle()"
              >
                <div v-if="focusStore.isRunning" class="pause-icon"></div>
                <div v-else class="play-icon"></div>
              </div>

              <div class="ctrl-btn" role="button" aria-label="跳过" @click="focusStore.skip()">
                <span>跳过</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bottom-card-dock">
        <div
          class="panel-card zen-card focus-panel-card"
          :class="{ 'is-locked': focusStore.isTaskLocked }"
          role="button"
          aria-label="选择专注任务"
          @click="openTaskPicker"
        >
          <div class="card-header">
            <span class="card-title">当前专注</span>
            <div class="card-header-meta">
              <span
                v-if="!displayedTask.isFreeStudy && displayedTask.timeStr && displayedTask.timeStr !== '关联待办'"
                class="header-time-badge num-tabular"
              >
                {{ displayedTask.timeStr }}
              </span>
              <LineIcon
                :name="focusStore.isTaskLocked ? 'lock' : 'chevron-down'"
                size="14px"
                color="var(--text-muted, #7A7A75)"
              />
            </div>
          </div>

          <div class="active-focus-banner" :class="{ 'is-free': displayedTask.isFreeStudy }">
            <span class="banner-title">{{ displayedTask.name }}</span>
            <span class="banner-status-tag">{{ displayedTask.statusTag }}</span>
          </div>

          <div v-if="focusStore.lastCompletedTask" class="complete-prompt" @click.stop>
            <span class="complete-prompt-title">完成「{{ focusStore.lastCompletedTask.title }}」？</span>
            <div class="complete-prompt-actions">
              <div
                class="ui-btn ui-btn-secondary sm prompt-btn"
                role="button"
                @click="focusStore.dismissCompletedTaskPrompt()"
              >
                <span>暂不</span>
              </div>
              <div
                class="ui-btn ui-btn-primary sm prompt-btn"
                :class="{ 'is-disabled': completingTask }"
                role="button"
                @click="completeBoundTask"
              >
                <span>{{ completingTask ? '保存中…' : '标记完成' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #overlay>
      <TaskSelectSheet
        v-model:visible="showTaskSheet"
        :selected-task-id="focusStore.selectedTaskId"
        @select="onTaskSelected"
      />
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import { showToast } from '@/platform/feedback'
import { onPageHide, onPageShow } from '@/platform/lifecycle'
import {
  formatFocusClockDateTime,
  resolveDefaultFocusTask,
  resolveDisplayedFocusTask,
} from '@/services/focusController'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusStore } from '@/store/useFocusStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'

const authStore = useAuthStore()
const focusStore = useFocusStore()
const taskStore = useTaskStore()

const showTaskSheet = ref(false)
const completingTask = ref(false)
const nowMs = ref(Date.now())
const tasksLoaded = ref(false)

let userManuallySelected = false
let clockTimer: ReturnType<typeof setInterval> | null = null
let lastClockMinute = Math.floor(nowMs.value / 60_000)
let syncTaskFlight: { generation: symbol; promise: Promise<void> } | null = null

const clockText = computed(() => formatFocusClockDateTime(nowMs.value))

const displayedTask = computed(() =>
  resolveDisplayedFocusTask({
    selectedTaskId: focusStore.selectedTaskId,
    selectedTaskTitle: focusStore.selectedTaskTitle,
    selectedTaskSubject: focusStore.selectedTaskSubject,
    tasks: taskStore.allTasks,
    nowMs: nowMs.value,
  }),
)

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

watch(
  () => [focusStore.isTaskLocked, focusStore.focusMinutes],
  ([locked]) => {
    if (locked) {
      showTaskSheet.value = false
    }
    ensureStandardFocusMinutes()
  },
  { immediate: true },
)

watch(
  () => [authStore.isAuthenticated, authStore.sessionId, authStore.user?.id, authStore.serverDeviceId],
  () => {
    userManuallySelected = false
    syncTaskFlight = null
    tasksLoaded.value = false
    showTaskSheet.value = false
    completingTask.value = false
    if (authStore.isAuthenticated) {
      void syncFocusState()
    }
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

function openTaskPicker() {
  if (focusStore.isTaskLocked) {
    showToast('本轮专注结束后可重新选择任务')
    return
  }
  showTaskSheet.value = true
}

function onTaskSelected(task: Task | null) {
  userManuallySelected = true
  focusStore.selectTask(task)
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
  } catch (err) {
    if (
      generation !== authStore.getLoginGeneration()
      || userId !== authStore.user?.id
      || serverDeviceId !== authStore.serverDeviceId
    ) {
      return
    }
    showToast(err instanceof Error ? err.message : '标记完成失败，请重试')
  } finally {
    if (
      generation === authStore.getLoginGeneration()
      && userId === authStore.user?.id
      && serverDeviceId === authStore.serverDeviceId
    ) {
      completingTask.value = false
    }
  }
}
</script>

<style scoped>
.pomodoro-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: transparent;
}

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  height: max(var(--status-bar-height, 0px), env(safe-area-inset-top));
  flex-shrink: 0;
}

.time-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: clamp(18px, 2.6vh, 30px) 14px 4px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.timer-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.timer-scroll-inner {
  width: 100%;
  flex: 1;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  box-sizing: border-box;
}

.bottom-card-dock {
  flex-shrink: 0;
  padding: 6px 14px var(--tabbar-clearance);
  box-sizing: border-box;
}

.datetime-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 9999px;
  background-color: var(--glass-bg, rgba(252, 251, 249, 0.70));
  backdrop-filter: var(--glass-blur-soft, blur(18px));
  -webkit-backdrop-filter: var(--glass-blur-soft, blur(18px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.82));
  box-shadow: var(--glass-shadow-subtle, 0 2px 10px rgba(45, 55, 40, 0.03));
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-muted, #7A7A75);
  letter-spacing: 0.2px;
}

.datetime-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #8B9A6E;
  opacity: 0.85;
  flex-shrink: 0;
}

.timer-hero {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0 6px;
}

.phase-status {
  margin-top: 16px;
  text-align: center;
}

.phase-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 18px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: var(--font-weight-bold, 700);
  letter-spacing: 0.5px;
  background-color: rgba(139, 154, 110, 0.12);
  color: var(--color-sage-ink, #556B3D);
  border: 1px solid rgba(139, 154, 110, 0.28);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.08);
  transition: all 0.3s var(--ease-out);
}

.phase-beacon {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #8B9A6E;
}

.phase-pill.is-active .phase-beacon {
  animation: beacon-pulse 2s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.8);
}

.phase-pill.is-break {
  background-color: rgba(200, 155, 109, 0.15);
  color: #9C7240;
  border-color: rgba(200, 155, 109, 0.32);
  box-shadow: 0 2px 8px rgba(200, 155, 109, 0.1);
}

.phase-pill.is-break .phase-beacon {
  background-color: #C89B6D;
}

.phase-pill.is-break.is-active .phase-beacon {
  box-shadow: 0 0 6px rgba(200, 155, 109, 0.8);
}

@keyframes beacon-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.4);
    opacity: 1;
  }
}

.progress-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  margin-top: 14px;
  padding: 2px 8px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background-color: rgba(139, 154, 110, 0.18);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: all 0.32s var(--ease-out);
}

.dot.is-filled {
  background-color: #8B9A6E;
  box-shadow: 0 0 10px rgba(139, 154, 110, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
  transform: scale(1.16);
}

.dot.is-break-filled {
  background-color: #C89B6D;
  box-shadow: 0 0 10px rgba(200, 155, 109, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  margin-top: 22px;
}

.ctrl-btn {
  padding: 9px 22px;
  border-radius: 9999px;
  background-color: var(--glass-bg, rgba(252, 251, 249, 0.70));
  backdrop-filter: var(--glass-blur-soft, blur(18px));
  -webkit-backdrop-filter: var(--glass-blur-soft, blur(18px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.82));
  box-shadow: var(--glass-shadow-subtle, 0 2px 10px rgba(45, 55, 40, 0.03));
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-secondary, #2C2C28);
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: transform 0.2s var(--ease-out), border-color 0.2s ease, color 0.2s ease;
}

.ctrl-btn:active {
  transform: scale(0.95);
}

.main-btn {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: var(--accent-gradient, linear-gradient(135deg, #8E9F70 0%, #768758 100%));
  box-shadow: 0 8px 24px -2px rgba(139, 154, 110, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.22s var(--ease-out), box-shadow 0.22s ease;
}

.main-btn:active {
  transform: scale(0.95);
}

.main-btn.is-break {
  background: linear-gradient(135deg, #D6AF83 0%, #C89B6D 100%);
  box-shadow: 0 8px 24px -2px rgba(200, 155, 109, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.play-icon {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 12px 0 12px 19px;
  border-color: transparent transparent transparent #FFFFFF;
  margin-left: 4px;
}

.pause-icon {
  width: 16px;
  height: 20px;
  border-left: 5px solid #FFFFFF;
  border-right: 5px solid #FFFFFF;
  border-radius: 1px;
  box-sizing: border-box;
}

.panel-card {
  padding: 14px 16px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.focus-panel-card {
  cursor: pointer;
  transition: transform 0.18s var(--ease-out), border-color 0.2s ease;
}

.focus-panel-card:active {
  transform: scale(0.985);
}

.focus-panel-card.is-locked {
  cursor: default;
}

.focus-panel-card.is-locked:active {
  transform: none;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.card-title {
  font-size: 13.5px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

.card-header-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.header-time-badge {
  font-size: 11px;
  font-weight: var(--font-weight-semibold, 600);
  padding: 2px 8px;
  border-radius: 9999px;
  background-color: rgba(139, 154, 110, 0.12);
  color: #637748;
  white-space: nowrap;
}

.active-focus-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 13px;
  border-radius: 13px;
  background-color: rgba(139, 154, 110, 0.07);
  border: 0.5px solid rgba(139, 154, 110, 0.2);
  border-left: 3.5px solid #8B9A6E;
  transition: all 0.25s ease;
}

.active-focus-banner.is-free {
  background-color: rgba(110, 136, 152, 0.07);
  border-color: rgba(110, 136, 152, 0.2);
  border-left-color: #6E8898;
}

.banner-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, #1C1C1A);
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.banner-status-tag {
  font-size: 11px;
  font-weight: var(--font-weight-semibold, 600);
  padding: 2px 9px;
  border-radius: 9999px;
  background-color: rgba(139, 154, 110, 0.16);
  color: #556B3D;
  white-space: nowrap;
  flex-shrink: 0;
}

.active-focus-banner.is-free .banner-status-tag {
  background-color: rgba(110, 136, 152, 0.16);
  color: #486270;
}

.complete-prompt {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle, rgba(45, 55, 40, 0.06));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.complete-prompt-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1C1C1A);
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
  padding: 0 12px;
}
</style>
