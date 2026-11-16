<template>
  <AppPageLayout>
    <view class="pomodoro-page">
      <AppHeader title="专注" :subtitle="headerDateText" />

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
                size="30rpx"
                color="var(--color-zen-sage)"
              />
              <text class="task-pill-text">
                {{ focusStore.selectedTaskTitle || '自由学习（点击绑定任务）' }}
              </text>
              <LineIcon name="chevron-down" size="28rpx" color="var(--text-muted)" />
            </view>

            <view class="preset-row">
              <view
                v-for="mins in presets"
                :key="mins"
                class="preset-chip"
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
                    : 'rgba(28, 28, 26, 0.12)',
                }"
              ></view>
            </view>
          </view>

          <view v-if="focusStore.lastCompletedTask" class="complete-banner zen-card">
            <view class="banner-info">
              <text class="banner-title">本轮专注已完成</text>
              <text class="banner-sub">是否将「{{ focusStore.lastCompletedTask.title }}」标为已完成？</text>
            </view>
            <view class="banner-actions">
              <view class="banner-btn ghost" @click="focusStore.dismissCompletedTaskPrompt()">暂不</view>
              <view class="banner-btn primary" @click="completeBoundTask">标记完成</view>
            </view>
          </view>

          <view class="controls-row">
            <view class="ctrl-secondary" @click="focusStore.reset()">
              <LineIcon name="rotate" size="34rpx" color="var(--text-muted)" />
              <text class="ctrl-label">重置</text>
            </view>

            <view
              class="ctrl-primary"
              :style="{ backgroundColor: focusStore.isBreakPhase ? '#C89B6D' : '#8B9A6E' }"
              @click="focusStore.toggle()"
            >
              <LineIcon
                :name="focusStore.isRunning ? 'pause' : 'play'"
                size="46rpx"
                color="#FFFFFF"
              />
            </view>

            <view class="ctrl-secondary" @click="focusStore.skip()">
              <LineIcon name="skip" size="34rpx" color="var(--text-muted)" />
              <text class="ctrl-label">跳过</text>
            </view>
          </view>

          <view class="stats-card zen-card">
            <view class="stat-col">
              <text class="stat-val">{{ focusStore.todayRounds }}</text>
              <text class="stat-label">今日完成轮次</text>
            </view>
            <view class="stat-divider"></view>
            <view class="stat-col">
              <text class="stat-val">{{ focusStore.todayFocusMinutes }}<text class="stat-unit">m</text></text>
              <text class="stat-label">今日累计专注</text>
            </view>
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
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import TaskSelectSheet from '@/components/TaskSelectSheet.vue'
import { FOCUS_PRESETS } from '@/services/focusController'
import { useFocusStore } from '@/store/useFocusStore'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import { formatDateHeading, toLocalDateKey } from '@/utils/dateKey'

const focusStore = useFocusStore()
const taskStore = useTaskStore()

const presets = FOCUS_PRESETS
const showTaskSheet = ref(false)
const headerDateText = computed(() => formatDateHeading(toLocalDateKey(new Date())))

const phaseLabel = computed(() => {
  if (focusStore.phase === 'shortBreak') return '短休息 · 5 分钟'
  if (focusStore.phase === 'longBreak') return '长休息 · 15 分钟'
  return '专注计时'
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
    uni.showToast({ title: '计时进行中或已暂停，重置后可切换任务', icon: 'none' })
    return
  }
  showTaskSheet.value = true
}

function choosePreset(minutes: number) {
  if (focusStore.isTaskLocked) {
    uni.showToast({ title: '计时进行中，重置后可调整时长', icon: 'none' })
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
    uni.showToast({ title: '任务已标记完成', icon: 'none' })
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

.page-scroll {
  flex: 1;
  min-height: 0;
}

.page-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36rpx;
  padding: 24rpx 32rpx 40rpx;
  box-sizing: border-box;
}

.selector-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}

.task-pill {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 28rpx;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
}

.task-pill.is-locked {
  opacity: 0.8;
}

.task-pill-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 480rpx;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.preset-chip {
  padding: 10rpx 22rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  font-size: 24rpx;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.preset-chip.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-bold);
}

.preset-chip.disabled {
  opacity: 0.55;
}

.ring-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  padding: 12rpx 0;
}

.cycle-dots {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.cycle-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  transition: background-color 0.25s ease;
}

.complete-banner {
  width: 100%;
  padding: 24rpx 28rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  box-sizing: border-box;
}

.banner-title {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.banner-sub {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-top: 4rpx;
}

.banner-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
}

.banner-btn {
  padding: 12rpx 24rpx;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.banner-btn.ghost {
  background-color: var(--color-bg-primary);
  color: var(--text-muted);
}

.banner-btn.primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 52rpx;
  width: 100%;
}

.ctrl-secondary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 24rpx;
  border-radius: 24rpx;
}

.ctrl-secondary:active {
  background-color: var(--color-gray-100);
}

.ctrl-label {
  font-size: 22rpx;
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.ctrl-primary {
  width: 132rpx;
  height: 132rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: transform 0.16s ease;
}

.ctrl-primary:active {
  transform: scale(0.94);
}

.stats-card {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 28rpx 20rpx;
  box-sizing: border-box;
}

.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.stat-divider {
  width: 1px;
  height: 64rpx;
  background-color: var(--border-subtle);
}

.stat-val {
  font-size: 48rpx;
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  line-height: 1;
}

.stat-unit {
  font-size: 24rpx;
  color: var(--text-muted);
  margin-left: 4rpx;
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
</style>
