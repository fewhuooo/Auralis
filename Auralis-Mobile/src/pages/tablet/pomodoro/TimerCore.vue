<template>
  <div class="timer-core">
    <div class="time-row">
      <div class="datetime-pill num-tabular">
        <div class="datetime-dot" aria-hidden="true"></div>
        <span>{{ dateText }} {{ timeText }}</span>
      </div>
    </div>

    <div class="center-block">
      <PomodoroRing
        size="min(400px, 44vw, 52vh)"
        :total-seconds="focusStore.totalSeconds"
        :remaining-seconds="focusStore.remainingSeconds"
        :is-running="focusStore.isRunning"
        :color="focusStore.ringColor"
        :is-break="focusStore.isBreakPhase"
        :show-bottom-pill="true"
        :large="true"
        :aria-label="focusStore.isRunning ? '点击暂停专注' : '点击开始专注'"
        @center-click="focusStore.toggle()"
      />

      <div class="phase-status">
        <div
          class="phase-pill"
          :class="{ 'is-break': focusStore.isBreakPhase, 'is-active': focusStore.isRunning }"
        >
          <div class="phase-beacon" aria-hidden="true"></div>
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
          :class="{ 'is-running': focusStore.isRunning, 'is-break': focusStore.isBreakPhase }"
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
</template>

<script setup lang="ts">
import PomodoroRing from '@/components/PomodoroRing.vue'
import { useFocusStore } from '@/store/useFocusStore'

defineProps<{
  dateText: string
  timeText: string
}>()

const focusStore = useFocusStore()
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
  user-select: none;
}

.time-row {
  position: absolute;
  top: 10px;
  left: 8px;
}

.datetime-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted, #7A7A75);
  font-weight: 600;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 6px 16px;
  border-radius: var(--radius-full);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  letter-spacing: 0.2px;
}

.datetime-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8B9A6E;
  opacity: 0.8;
  flex-shrink: 0;
}

.center-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.phase-status {
  text-align: center;
  margin-top: 18px;
}

.phase-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 18px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.6px;
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-sage-ink, #556B3D);
  border: 1px solid rgba(139, 154, 110, 0.28);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.08);
  transition: all 0.35s var(--ease-out);
}

.phase-beacon {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8B9A6E;
  transition: all 0.3s ease;
}

.phase-pill.is-active .phase-beacon {
  animation: beacon-pulse 2s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.8);
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

.phase-pill.is-break {
  background: rgba(200, 155, 109, 0.15);
  color: #9C7240;
  border-color: rgba(200, 155, 109, 0.32);
  box-shadow: 0 2px 8px rgba(200, 155, 109, 0.1);
}

.phase-pill.is-break .phase-beacon {
  background: #C89B6D;
}

.phase-pill.is-break.is-active .phase-beacon {
  box-shadow: 0 0 6px rgba(200, 155, 109, 0.8);
}

.progress-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 4px 8px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(139, 154, 110, 0.18);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: all 0.35s var(--ease-out);
}

.dot.is-filled {
  background: #8B9A6E;
  box-shadow: 0 0 10px rgba(139, 154, 110, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
  transform: scale(1.18);
}

.dot.is-break-filled {
  background: #C89B6D;
  box-shadow: 0 0 10px rgba(200, 155, 109, 0.65), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 28px;
  margin-top: 26px;
}

.ctrl-btn {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  padding: 9px 20px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(0, 0, 0, 0.08);
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  transition: all 0.22s var(--ease-out);
  letter-spacing: 0.3px;
}

.ctrl-btn:hover {
  border-color: #8B9A6E;
  color: #8B9A6E;
  transform: translateY(-1.5px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.18);
}

.ctrl-btn:active {
  transform: translateY(0.5px) scale(0.96);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.main-btn {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px -2px rgba(139, 154, 110, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: all 0.25s var(--ease-out);
  cursor: pointer;
}

.main-btn:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 10px 30px rgba(139, 154, 110, 0.52), 0 3px 8px rgba(0, 0, 0, 0.06);
}

.main-btn:active {
  transform: translateY(1px) scale(0.96);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.36);
}

.main-btn.is-break {
  background: linear-gradient(135deg, #D6AF83 0%, #C89B6D 100%);
  box-shadow: 0 8px 24px -2px rgba(200, 155, 109, 0.44), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.main-btn.is-break:hover {
  box-shadow: 0 10px 30px rgba(200, 155, 109, 0.52), 0 3px 8px rgba(0, 0, 0, 0.06);
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

@media (max-width: 960px) {
  .timer-core {
    padding-top: 46px;
    padding-bottom: 12px;
  }

  .time-row {
    top: 4px;
    left: 4px;
  }
}
</style>
