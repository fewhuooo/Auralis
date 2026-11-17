<template>
  <AppPageLayout>
    <view class="pomodoro-page">
      <view class="status-bar-spacer"></view>

      <view class="page-scroll-stage">
        <view class="page-inner">
          <view class="selector-row">
            <view
              class="task-pill"
              :class="{ 'is-locked': focusStore.isTaskLocked }"
              role="button"
              aria-label="选择专注任务"
              @click="openTaskPicker"
            >
              <LineIcon
                :name="focusStore.isTaskLocked ? 'lock' : 'calendar'"
                size="14px"
                color="var(--color-sage-ink)"
              />
              <text class="task-pill-text">
                {{ focusStore.selectedTaskTitle || '自由专注' }}
              </text>
              <LineIcon name="chevron-down" size="13px" color="var(--text-muted)" />
            </view>

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
                @click="choosePreset(mins)"
              >
                <text>{{ mins }}m</text>
              </view>
            </view>
          </view>

          <view class="ring-stage">
            <PomodoroRing
              size="254px"
              :total-seconds="focusStore.totalSeconds"
              :remaining-seconds="focusStore.remainingSeconds"
              :is-running="focusStore.isRunning"
              :color="focusStore.ringColor"
              :cycle-count="focusStore.cycleCount"
              :is-break="focusStore.isBreakPhase"
              @center-click="openTaskPicker"
            />
          </view>

          <view v-if="focusStore.lastCompletedTask" class="complete-banner zen-card">
            <text class="banner-title">完成「{{ focusStore.lastCompletedTask.title }}」？</text>
            <view class="banner-actions">
              <view class="ui-btn ui-btn-secondary banner-btn" role="button" @click="focusStore.dismissCompletedTaskPrompt()">暂不</view>
              <view class="ui-btn ui-btn-primary banner-btn" role="button" @click="completeBoundTask">完成</view>
            </view>
          </view>

          <view class="controls-row">
            <view class="ctrl-secondary" role="button" aria-label="重置" @click="focusStore.reset()">
              <text>重置</text>
            </view>

            <view
              class="ctrl-primary"
              :class="{ 'is-break': focusStore.isBreakPhase }"
              role="button"
              :aria-label="focusStore.isRunning ? '暂停' : '开始'"
              @click="focusStore.toggle()"
            >
              <LineIcon
                :name="focusStore.isRunning ? 'pause' : 'play'"
                size="22px"
                color="#FFFFFF"
              />
            </view>

            <view class="ctrl-secondary" role="button" aria-label="跳过" @click="focusStore.skip()">
              <text>跳过</text>
            </view>
          </view>

          <view class="today-summary num-tabular">
            <text>今日 {{ focusStore.todayRounds }} 轮</text>
            <text class="summary-dot">·</text>
            <text>{{ focusStore.todayFocusMinutes }} m</text>
          </view>
        </view>
      </view>
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
import { onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import { FOCUS_PRESETS } from '@/services/focusController'
import { useFocusStore } from '@/store/useFocusStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'

const focusStore = useFocusStore()
const taskStore = useTaskStore()

const presets = FOCUS_PRESETS
const showTaskSheet = ref(false)

function syncFocusState() {
  focusStore.reconcileNow(false)
  void focusStore.flushPendingSessions()
  void taskStore.fetchTasks()
}

onMounted(syncFocusState)
onShow(syncFocusState)

function openTaskPicker() {
  if (focusStore.isTaskLocked) {
    uni.showToast({ title: '重置后可切换任务', icon: 'none' })
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
  focusStore.selectTask(task)
}

async function completeBoundTask() {
  const target = focusStore.lastCompletedTask
  if (!target?.id) return
  const existing = taskStore.allTasks.find(item => item.id === target.id)
  if (existing && existing.status !== 'completed') {
    await taskStore.toggleTaskComplete(target.id)
    uni.showToast({ title: '已标记完成', icon: 'none' })
  }
  focusStore.dismissCompletedTaskPrompt()
}
</script>

<style scoped>
.pomodoro-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
}

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  flex-shrink: 0;
}

.page-scroll-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.page-inner {
  width: 100%;
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(20px, 3.2vh, 30px);
  padding: 20px 18px var(--tabbar-clearance);
  box-sizing: border-box;
}

.selector-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.task-pill {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;
  cursor: pointer;
}

.task-pill.is-locked {
  opacity: 0.72;
}

.task-pill-text {
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-chip {
  padding: 5px 13px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.preset-chip.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.preset-chip.disabled {
  opacity: 0.45;
}

.ring-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.complete-banner {
  width: 100%;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
}

.banner-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.banner-btn {
  height: 32px;
  padding: 0 12px;
  font-size: var(--font-size-xs);
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.ctrl-secondary {
  padding: 9px 20px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  cursor: pointer;
  transition: transform 0.16s var(--ease-out);
}

.ctrl-secondary:active {
  transform: scale(0.95);
}

.ctrl-primary {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: var(--accent-gradient);
  box-shadow: 0 8px 24px -2px rgba(139, 154, 110, 0.42), 0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s var(--ease-out);
}

.ctrl-primary.is-break {
  background: linear-gradient(135deg, #D6AF83 0%, #C89B6D 100%);
  box-shadow: 0 8px 24px -2px rgba(200, 155, 109, 0.42), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.ctrl-primary:active {
  transform: scale(0.94);
}

.today-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.summary-dot {
  opacity: 0.6;
}
</style>
