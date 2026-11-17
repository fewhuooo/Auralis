<template>
  <AppPageLayout>
    <view class="pomodoro-page">
      <view class="status-bar-spacer"></view>

      <scroll-view scroll-y :show-scrollbar="false" class="page-scroll">
        <view class="page-inner">
          <view class="selector-row">
            <view
              class="task-pill"
              :class="{ 'is-locked': focusStore.isTaskLocked }"
              @click="openTaskPicker"
            >
              <LineIcon
                :name="focusStore.isTaskLocked ? 'lock' : 'calendar'"
                size="15px"
                color="var(--color-sage-dark)"
              />
              <text class="task-pill-text">
                {{ focusStore.selectedTaskTitle || '自由专注' }}
              </text>
              <LineIcon name="chevron-down" size="14px" color="var(--text-muted)" />
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
                @click="choosePreset(mins)"
              >
                <text>{{ mins }}m</text>
              </view>
            </view>
          </view>

          <view class="ring-stage">
            <PomodoroRing
              size="248px"
              :total-seconds="focusStore.totalSeconds"
              :remaining-seconds="focusStore.remainingSeconds"
              :is-running="focusStore.isRunning"
              :color="focusStore.ringColor"
              :phase-label="phaseLabel"
              @center-click="openTaskPicker"
            />

            <view class="cycle-dots">
              <view
                v-for="idx in 4"
                :key="idx"
                class="cycle-dot"
                :style="{
                  backgroundColor: (focusStore.cycleCount % 4) >= idx || (focusStore.cycleCount > 0 && focusStore.cycleCount % 4 === 0)
                    ? focusStore.ringColor
                    : 'rgba(28, 28, 26, 0.14)',
                }"
              ></view>
            </view>
          </view>

          <view v-if="focusStore.lastCompletedTask" class="complete-banner zen-card">
            <text class="banner-title">完成「{{ focusStore.lastCompletedTask.title }}」？</text>
            <view class="banner-actions">
              <view class="ui-btn ui-btn-secondary banner-btn" @click="focusStore.dismissCompletedTaskPrompt()">暂不</view>
              <view class="ui-btn ui-btn-primary banner-btn" @click="completeBoundTask">标记完成</view>
            </view>
          </view>

          <view class="controls-row">
            <view class="ctrl-secondary" @click="focusStore.reset()">
              <LineIcon name="rotate" size="18px" color="var(--text-secondary)" />
            </view>

            <view
              class="ctrl-primary"
              :style="{ backgroundColor: focusStore.isBreakPhase ? '#C89B6D' : '#7B8B5E' }"
              @click="focusStore.toggle()"
            >
              <LineIcon
                :name="focusStore.isRunning ? 'pause' : 'play'"
                size="24px"
                color="#FFFFFF"
              />
            </view>

            <view class="ctrl-secondary" @click="focusStore.skip()">
              <LineIcon name="skip" size="18px" color="var(--text-secondary)" />
            </view>
          </view>

          <view class="stats-pill zen-card num-tabular">
            <text class="stat-val">{{ focusStore.todayRounds }} 轮</text>
            <view class="stat-sep"></view>
            <text class="stat-val">{{ focusStore.todayFocusMinutes }}m</text>
          </view>
        </view>
      </scroll-view>

      <TaskSelectSheet
        v-model:visible="showTaskSheet"
        :selected-task-id="focusStore.selectedTaskId"
        @select="onTaskSelected"
      />
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const phaseLabel = computed(() => {
  if (focusStore.phase === 'shortBreak') return 'SHORT BREAK'
  if (focusStore.phase === 'longBreak') return 'LONG BREAK'
  return ''
})

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

.page-scroll {
  flex: 1;
  min-height: 0;
}

.page-inner {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 18px 24px;
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
  padding: 9px 16px;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
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
  padding: 6px 14px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  font-size: 12.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  cursor: pointer;
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
  gap: 16px;
}

.cycle-dots {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cycle-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
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
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s var(--ease-out);
}

.ctrl-secondary:active {
  transform: scale(0.92);
}

.ctrl-primary {
  width: 66px;
  height: 66px;
  border-radius: 50%;
  box-shadow: var(--shadow-md), var(--accent-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s var(--ease-out);
}

.ctrl-primary:active {
  transform: scale(0.92);
}

.stats-pill {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 9px 20px;
  border-radius: var(--radius-full);
}

.stat-val {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  font-family: var(--font-family-mono);
  color: var(--text-secondary);
}

.stat-sep {
  width: 1px;
  height: 12px;
  background-color: var(--border-default);
}
</style>
