<template>
  <view class="timer-core">
    <view class="time-row">
      <text class="datetime-text">{{ headerDateText }}</text>
    </view>

    <view class="center-block">
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
          <text>{{ mins }} 分钟</text>
        </view>
      </view>

      <PomodoroRing
        size="460rpx"
        :total-seconds="focusStore.totalSeconds"
        :remaining-seconds="focusStore.remainingSeconds"
        :is-running="focusStore.isRunning"
        :color="focusStore.ringColor"
        :phase-label="phaseLabel"
        @center-click="$emit('center-click')"
      />

      <view class="progress-dots">
        <view
          v-for="i in 4"
          :key="i"
          class="dot"
          :style="{
            backgroundColor: (focusStore.cycleCount % 4) >= i || (focusStore.cycleCount > 0 && focusStore.cycleCount % 4 === 0)
              ? focusStore.ringColor
              : 'rgba(28, 28, 26, 0.14)',
          }"
        ></view>
      </view>

      <view class="controls">
        <view class="ctrl-btn" @click="focusStore.reset()">
          <LineIcon name="rotate" size="28rpx" color="var(--text-secondary)" />
          <text>重置</text>
        </view>
        <view
          class="main-btn"
          :style="{ backgroundColor: focusStore.isBreakPhase ? '#C89B6D' : '#8B9A6E' }"
          @click="focusStore.toggle()"
        >
          <LineIcon :name="focusStore.isRunning ? 'pause' : 'play'" size="46rpx" color="#FFFFFF" />
        </view>
        <view class="ctrl-btn" @click="focusStore.skip()">
          <LineIcon name="skip" size="28rpx" color="var(--text-secondary)" />
          <text>跳过</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import { FOCUS_PRESETS } from '@/services/focusController'
import { useFocusStore } from '@/store/useFocusStore'
import { formatDateHeading, toLocalDateKey } from '@/utils/dateKey'

defineEmits(['center-click'])

const focusStore = useFocusStore()
const presets = FOCUS_PRESETS
const headerDateText = computed(() => formatDateHeading(toLocalDateKey(new Date())))

const phaseLabel = computed(() => {
  if (focusStore.phase === 'shortBreak') return '短休息 · 5 分钟'
  if (focusStore.phase === 'longBreak') return '长休息 · 15 分钟'
  return '专注计时'
})

function choosePreset(minutes: number) {
  if (focusStore.isTaskLocked) {
    uni.showToast({ title: '计时进行中，重置后可调整时长', icon: 'none' })
    return
  }
  focusStore.setFocusMinutes(minutes)
}
</script>

<style scoped>
.timer-core {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  position: relative;
}

.time-row {
  position: absolute;
  top: 0;
  left: 0;
}

.datetime-text {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-weight: var(--font-weight-semibold);
}

.center-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32rpx;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.preset-chip {
  padding: 12rpx 24rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
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

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 16rpx;
}

.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 44rpx;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-weight: var(--font-weight-semibold);
  padding: 16rpx 30rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
}

.ctrl-btn:active {
  background-color: var(--color-gray-100);
}

.main-btn {
  width: 148rpx;
  height: 148rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: transform 0.16s ease;
}

.main-btn:active {
  transform: scale(0.94);
}
</style>
