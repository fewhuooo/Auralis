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
        role="button"
        @click="choosePreset(mins)"
      >
        <text>{{ mins }}m</text>
      </view>
    </view>

    <PomodoroRing
      size="296px"
      :total-seconds="focusStore.totalSeconds"
      :remaining-seconds="focusStore.remainingSeconds"
      :is-running="focusStore.isRunning"
      :color="focusStore.ringColor"
      :cycle-count="focusStore.cycleCount"
      :is-break="focusStore.isBreakPhase"
      @center-click="$emit('center-click')"
    />

    <view class="controls">
      <view class="ctrl-btn" role="button" aria-label="重置" @click="focusStore.reset()">
        <text>重置</text>
      </view>
      <view
        class="main-btn"
        :class="{ 'is-break': focusStore.isBreakPhase }"
        role="button"
        :aria-label="focusStore.isRunning ? '暂停' : '开始'"
        @click="focusStore.toggle()"
      >
        <LineIcon :name="focusStore.isRunning ? 'pause' : 'play'" size="24px" color="#FFFFFF" />
      </view>
      <view class="ctrl-btn" role="button" aria-label="跳过" @click="focusStore.skip()">
        <text>跳过</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import LineIcon from '@/components/LineIcon.vue'
import PomodoroRing from '@/components/PomodoroRing.vue'
import { FOCUS_PRESETS } from '@/services/focusController'
import { useFocusStore } from '@/store/useFocusStore'

defineEmits(['center-click'])

const focusStore = useFocusStore()
const presets = FOCUS_PRESETS

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
  gap: 24px;
  user-select: none;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-chip {
  padding: 5px 14px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  font-size: 12.5px;
  color: var(--text-muted);
  font-weight: var(--font-weight-semibold);
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
  cursor: not-allowed;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 28px;
}

.ctrl-btn {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: var(--font-weight-semibold);
  padding: 9px 22px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.18s var(--ease-out), border-color 0.18s ease, color 0.18s ease;
}

.ctrl-btn:hover {
  border-color: var(--color-zen-sage);
  color: var(--color-sage-ink);
  transform: translateY(-1px);
}

.ctrl-btn:active {
  transform: scale(0.96);
}

.main-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent-gradient);
  box-shadow: 0 8px 24px -2px rgba(139, 154, 110, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s ease;
}

.main-btn:hover {
  transform: translateY(-2px) scale(1.04);
}

.main-btn:active {
  transform: scale(0.96);
}

.main-btn.is-break {
  background: linear-gradient(135deg, #D6AF83 0%, #C89B6D 100%);
  box-shadow: 0 8px 24px -2px rgba(200, 155, 109, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
}
</style>
