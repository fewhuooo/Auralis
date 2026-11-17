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
      size="296px"
      :total-seconds="focusStore.totalSeconds"
      :remaining-seconds="focusStore.remainingSeconds"
      :is-running="focusStore.isRunning"
      :color="focusStore.ringColor"
      @center-click="$emit('center-click')"
    />

    <view class="phase-status">
      <view class="phase-pill" :class="{ 'is-break': focusStore.isBreakPhase, 'is-active': focusStore.isRunning }">
        <view class="phase-beacon"></view>
        <text>{{ phaseText }}</text>
      </view>
    </view>

    <view class="progress-dots">
      <view
        v-for="i in 4"
        :key="i"
        class="dot"
        :class="{
          'is-filled': (focusStore.cycleCount % 4) >= i || (focusStore.cycleCount > 0 && focusStore.cycleCount % 4 === 0),
          'is-break-filled': focusStore.isBreakPhase && ((focusStore.cycleCount % 4) >= i || (focusStore.cycleCount > 0 && focusStore.cycleCount % 4 === 0)),
        }"
      ></view>
    </view>

    <view class="controls">
      <view class="ctrl-btn" @click="focusStore.reset()">
        <text>重置</text>
      </view>
      <view
        class="main-btn"
        :class="{ 'is-break': focusStore.isBreakPhase }"
        @click="focusStore.toggle()"
      >
        <LineIcon :name="focusStore.isRunning ? 'pause' : 'play'" size="24px" color="#FFFFFF" />
      </view>
      <view class="ctrl-btn" @click="focusStore.skip()">
        <text>跳过</text>
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

const phaseText = computed(() => (focusStore.isBreakPhase ? '茶歇时刻' : '沉浸专注中'))

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
  user-select: none;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
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

.phase-status {
  margin-top: 16px;
}

.phase-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 16px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.5px;
  background-color: rgba(139, 154, 110, 0.12);
  color: var(--color-sage-ink);
  border: 1px solid rgba(139, 154, 110, 0.28);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.08);
}

.phase-beacon {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #8B9A6E;
}

.phase-pill.is-active .phase-beacon {
  animation: beaconPulse 2s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.8);
}

.phase-pill.is-break {
  background-color: rgba(200, 155, 109, 0.15);
  color: #9C7240;
  border-color: rgba(200, 155, 109, 0.32);
}

.phase-pill.is-break .phase-beacon {
  background-color: #C89B6D;
}

@keyframes beaconPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.4); opacity: 1; }
}

.progress-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background-color: rgba(139, 154, 110, 0.18);
  transition: transform 0.25s var(--ease-out), background-color 0.25s ease;
}

.dot.is-filled {
  background-color: #8B9A6E;
  box-shadow: 0 0 10px rgba(139, 154, 110, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
  transform: scale(1.18);
}

.dot.is-break-filled {
  background-color: #C89B6D;
  box-shadow: 0 0 10px rgba(200, 155, 109, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 28px;
  margin-top: 24px;
}

.ctrl-btn {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: var(--font-weight-semibold);
  padding: 9px 20px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: transform 0.18s var(--ease-out), border-color 0.18s ease, color 0.18s ease;
}

.ctrl-btn:hover {
  border-color: #8B9A6E;
  color: #556B3D;
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
