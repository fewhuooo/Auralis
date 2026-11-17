<template>
  <view class="timer-core">
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

    <PomodoroRing
      size="272px"
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
        <LineIcon name="rotate" size="18px" color="var(--text-secondary)" />
      </view>
      <view
        class="main-btn"
        :style="{ backgroundColor: focusStore.isBreakPhase ? '#C89B6D' : '#7B8B5E' }"
        @click="focusStore.toggle()"
      >
        <LineIcon :name="focusStore.isRunning ? 'pause' : 'play'" size="24px" color="#FFFFFF" />
      </view>
      <view class="ctrl-btn" @click="focusStore.skip()">
        <LineIcon name="skip" size="18px" color="var(--text-secondary)" />
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

defineEmits(['center-click'])

const focusStore = useFocusStore()
const presets = FOCUS_PRESETS

const phaseLabel = computed(() => {
  if (focusStore.phase === 'shortBreak') return 'SHORT BREAK'
  if (focusStore.phase === 'longBreak') return 'LONG BREAK'
  return ''
})

function choosePreset(minutes: number) {
  if (focusStore.isTaskLocked) {
    uni.showToast({ title: '重置后可调整时长', icon: 'none' })
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
  gap: 22px;
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
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
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
  cursor: not-allowed;
}

.progress-dots {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.ctrl-btn {
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

.ctrl-btn:active {
  transform: scale(0.92);
}

.main-btn {
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

.main-btn:active {
  transform: scale(0.92);
}
</style>
