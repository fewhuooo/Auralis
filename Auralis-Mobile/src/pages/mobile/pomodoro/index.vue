<template>
  <AppPageLayout>
    <view class="pomodoro-page">
      <view class="status-bar-spacer"></view>

      <scroll-view scroll-y :show-scrollbar="false" class="pomodoro-scroll">
        <view class="page-inner">
          <view class="time-row">
            <view class="datetime-pill num-tabular">
              <view class="datetime-dot"></view>
              <text>{{ clockText.dateText }} {{ clockText.timeText }}</text>
            </view>
          </view>

          <view class="timer-hero">
            <PomodoroRing
              size="min(236px, 64vw)"
              :total-seconds="focusStore.totalSeconds"
              :remaining-seconds="focusStore.remainingSeconds"
              :is-running="focusStore.isRunning"
              :color="focusStore.ringColor"
              :is-break="focusStore.isBreakPhase"
              :show-bottom-pill="true"
              :aria-label="focusStore.isRunning ? '点击暂停专注' : '点击开始专注'"
              @center-click="focusStore.toggle()"
            />

            <view class="phase-status">
              <view
                class="phase-pill"
                :class="{ 'is-break': focusStore.isBreakPhase, 'is-active': focusStore.isRunning }"
              >
                <view class="phase-beacon"></view>
                <text>{{ focusStore.isBreakPhase ? '茶歇时刻' : '沉浸专注中' }}</text>
              </view>
            </view>

            <view class="progress-dots" :aria-label="`今日第 ${focusStore.cycleCount} 个番茄周期`">
              <view
                v-for="idx in 4"
                :key="idx"
                class="dot"
                :class="{
                  'is-filled': focusStore.cycleCount >= idx,
                  'is-break-filled': focusStore.cycleCount >= idx && focusStore.isBreakPhase,
                }"
              ></view>
            </view>

            <view class="controls">
              <view class="ctrl-btn" role="button" aria-label="重置" @click="focusStore.reset()">
                <text>重置</text>
              </view>

              <view
                class="main-btn"
                :class="{ 'is-break': focusStore.isBreakPhase }"
                role="button"
                :aria-label="focusStore.isRunning ? '暂停专注' : '开始专注'"
                @click="focusStore.toggle()"
              >
                <view v-if="focusStore.isRunning" class="pause-icon"></view>
                <view v-else class="play-icon"></view>
              </view>

              <view class="ctrl-btn" role="button" aria-label="跳过" @click="focusStore.skip()">
                <text>跳过</text>
              </view>
            </view>
          </view>

          <view class="panel-card zen-card">
            <view class="card-header">
              <view class="card-title-row">
                <text class="card-title">当前专注</text>
                <view class="preset-row">
                  <view
                    v-for="mins in presets"
                    :key="mins"
                    class="preset-chip num-tabular"
                    :class="{
                      active: focusStore.focusMinutes === mins,
                      disabled: focusStore.isTaskLocked,
                    }"
                    role="button"
                    :aria-label="`专注 ${mins} 分钟`"
                    @click="choosePreset(mins)"
                  >
                    <text>{{ mins }}m</text>
                  </view>
                </view>
              </view>
              <text class="card-sub-hint">
                {{ focusStore.isTaskLocked ? '本轮专注结束后可重新选择任务' : '选择要专注的任务，或开启自由专注' }}
              </text>
            </view>

            <view
              class="zen-select-trigger"
              :class="{ 'is-locked': focusStore.isTaskLocked }"
              role="button"
              aria-label="选择专注任务"
              @click="openTaskPicker"
            >
              <text class="trigger-label">{{ displayedTask.name }}</text>
              <view class="trigger-right">
                <text
                  class="trigger-badge num-tabular"
                  :class="{ 'is-free-badge': displayedTask.isFreeStudy }"
                >
                  {{ displayedTask.timeStr }}
                </text>
                <LineIcon
                  :name="focusStore.isTaskLocked ? 'lock' : 'chevron-down'"
                  size="14px"
                  color="var(--text-muted, #7A7A75)"
                />
              </view>
            </view>

            <view class="active-focus-banner" :class="{ 'is-free': displayedTask.isFreeStudy }">
              <view class="banner-info">
                <text class="banner-title">{{ displayedTask.name }}</text>
                <view class="banner-meta-row">
                  <text class="banner-status-tag">{{ displayedTask.statusTag }}</text>
                  <text class="banner-desc num-tabular">{{ displayedTask.bannerDesc }}</text>
                </view>
              </view>
            </view>

            <view v-if="focusStore.lastCompletedTask" class="complete-prompt">
              <text class="complete-prompt-title">完成「{{ focusStore.lastCompletedTask.title }}」？</text>
              <view class="complete-prompt-actions">
                <view
                  class="ui-btn ui-btn-secondary sm prompt-btn"
                  role="button"
                  @click="focusStore.dismissCompletedTaskPrompt()"
                >
                  <text>暂不</text>
                </view>
                <view
                  class="ui-btn ui-btn-primary sm prompt-btn"
                  :class="{ 'is-disabled': completingTask }"
                  role="button"
                  @click="completeBoundTask"
                >
                  <text>{{ completingTask ? '保存中…' : '标记完成' }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="panel-card zen-card">
            <view class="card-header">
              <text class="card-title">今日专注看板</text>
              <text class="card-sub-hint">今日累计专注数据，暂停与休息不计入时长</text>
            </view>

            <view class="stats-container">
              <view class="stat-col">
                <text class="stat-val num-tabular">{{ focusStore.todayRounds }}</text>
                <view class="stat-label-row">
                  <LineIcon name="check" size="14px" color="#8B9A6E" />
                  <text class="stat-label">今日番茄</text>
                </view>
              </view>

              <view class="stat-divider"></view>

              <view class="stat-col">
                <view class="val-wrapper">
                  <text class="stat-val num-tabular">{{ formattedFocusMinutes }}</text>
                  <text class="stat-unit">m</text>
                </view>
                <view class="stat-label-row">
                  <LineIcon name="fire" size="14px" color="#8B9A6E" />
                  <text class="stat-label">专注时长</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

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
import { onHide, onShow } from '@dcloudio/uni-app'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import {
  FOCUS_PRESETS,
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

const presets = FOCUS_PRESETS
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

const formattedFocusMinutes = computed(() => (focusStore.todayFocusSeconds / 60).toFixed(1))

function applyDefaultTaskIfNeeded() {
  if (focusStore.isTaskLocked) return

  if (focusStore.selectedTaskId) {
    if (!tasksLoaded.value) return
    const existing = taskStore.allTasks.find(
      item => item.id === focusStore.selectedTaskId && !item.is_deleted && item.status !== 'completed',
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
  () => [authStore.sessionId, authStore.user?.id, authStore.serverDeviceId],
  () => {
    userManuallySelected = false
    syncTaskFlight = null
    tasksLoaded.value = false
    showTaskSheet.value = false
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
onShow(() => {
  void syncFocusState()
})
onHide(stopClock)
onUnmounted(stopClock)

function openTaskPicker() {
  if (focusStore.isTaskLocked) {
    uni.showToast({ title: '本轮专注结束后可重新选择任务', icon: 'none' })
    return
  }
  showTaskSheet.value = true
}

function choosePreset(minutes: number) {
  if (focusStore.isTaskLocked) {
    uni.showToast({ title: '重置后可调整时长', icon: 'none' })
    return
  }
  focusStore.setFocusMinutes(minutes)
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
  if (!existing || existing.status === 'completed') {
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
    uni.showToast({ title: '已标记完成', icon: 'none' })
    focusStore.dismissCompletedTaskPrompt()
  } catch (err) {
    uni.showToast({
      title: err instanceof Error ? err.message : '标记完成失败，请重试',
      icon: 'none',
    })
  } finally {
    completingTask.value = false
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
  flex-shrink: 0;
}

.pomodoro-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.page-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 18px var(--tabbar-clearance);
  box-sizing: border-box;
}

.time-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0 6px;
}

.phase-status {
  margin-top: 14px;
  text-align: center;
}

.phase-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 16px;
  border-radius: 9999px;
  font-size: 12.5px;
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
  gap: 10px;
  margin-top: 12px;
  padding: 2px 8px;
}

.dot {
  width: 8.5px;
  height: 8.5px;
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
  gap: 24px;
  margin-top: 20px;
}

.ctrl-btn {
  padding: 9px 20px;
  border-radius: 9999px;
  background-color: var(--glass-bg, rgba(252, 251, 249, 0.70));
  backdrop-filter: var(--glass-blur-soft, blur(18px));
  -webkit-backdrop-filter: var(--glass-blur-soft, blur(18px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.82));
  box-shadow: var(--glass-shadow-subtle, 0 2px 10px rgba(45, 55, 40, 0.03));
  font-size: 13px;
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
  width: 70px;
  height: 70px;
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
  border-width: 11px 0 11px 18px;
  border-color: transparent transparent transparent #FFFFFF;
  margin-left: 4px;
}

.pause-icon {
  width: 15px;
  height: 19px;
  border-left: 4.5px solid #FFFFFF;
  border-right: 4.5px solid #FFFFFF;
  border-radius: 1px;
  box-sizing: border-box;
}

.panel-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.card-title {
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

.card-sub-hint {
  font-size: var(--font-size-xs, 12px);
  color: var(--text-muted, #7A7A75);
  line-height: 1.4;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preset-chip {
  padding: 4px 10px;
  border-radius: 9999px;
  background-color: var(--glass-sub-bg, rgba(255, 255, 255, 0.56));
  backdrop-filter: var(--glass-blur-soft, blur(18px));
  -webkit-backdrop-filter: var(--glass-blur-soft, blur(18px));
  border: 1px solid var(--glass-border-subtle, rgba(255, 255, 255, 0.72));
  box-shadow: var(--glass-shadow-subtle, 0 2px 10px rgba(45, 55, 40, 0.03));
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-muted, #7A7A75);
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.preset-chip.active {
  background-color: rgba(139, 154, 110, 0.16);
  border-color: rgba(255, 255, 255, 0.78);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.74);
  color: var(--color-sage-ink, #556B3D);
  font-weight: var(--font-weight-bold, 700);
}

.preset-chip.disabled {
  opacity: 0.45;
}

.zen-select-trigger {
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  border-radius: 9999px;
  background-color: var(--glass-sub-bg, rgba(255, 255, 255, 0.56));
  backdrop-filter: var(--glass-blur-soft, blur(18px));
  -webkit-backdrop-filter: var(--glass-blur-soft, blur(18px));
  border: 1px solid var(--glass-border-subtle, rgba(255, 255, 255, 0.72));
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03) inset, 0 0 0 1px var(--border-subtle, rgba(45, 55, 40, 0.06)) inset;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.zen-select-trigger.is-locked {
  opacity: 0.76;
}

.trigger-label {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1C1C1A);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trigger-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.trigger-badge {
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold, 600);
  padding: 2px 8px;
  border-radius: 9999px;
  background-color: rgba(139, 154, 110, 0.12);
  color: #637748;
  white-space: nowrap;
}

.trigger-badge.is-free-badge {
  background-color: rgba(110, 136, 152, 0.12);
  color: #536B79;
}

.active-focus-banner {
  margin-top: 12px;
  display: flex;
  align-items: center;
  padding: 12px 15px;
  border-radius: 16px;
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

.banner-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.banner-title {
  font-size: 13.5px;
  font-weight: var(--font-weight-bold, 700);
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
  font-size: 11.5px;
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

.banner-desc {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
}

.complete-prompt {
  margin-top: 12px;
  padding-top: 12px;
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

.stats-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
}

.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-divider {
  width: 1px;
  height: 46px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    var(--border-default, rgba(45, 55, 40, 0.09)) 20%,
    var(--border-default, rgba(45, 55, 40, 0.09)) 80%,
    transparent 100%
  );
}

.val-wrapper {
  display: flex;
  align-items: baseline;
}

.stat-val {
  font-size: 34px;
  font-weight: 800;
  color: var(--text-primary, #1C1C1A);
  line-height: 1;
  letter-spacing: -1px;
}

.stat-unit {
  font-size: 14px;
  color: var(--text-muted, #7A7A75);
  margin-left: 4px;
  font-weight: var(--font-weight-semibold, 600);
}

.stat-label-row {
  display: flex;
  align-items: center;
  margin-top: 8px;
  gap: 5px;
}

.stat-label {
  font-size: 12.5px;
  color: var(--text-muted, #7A7A75);
  font-weight: var(--font-weight-semibold, 600);
}
</style>
