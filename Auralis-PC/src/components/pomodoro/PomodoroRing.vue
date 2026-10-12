<template>
  <div class="pomodoro-ring">
    <svg class="ring-svg" viewBox="0 0 100 100">
      <defs>
        <!-- Subtle Glow Filters for Ambient Flow State -->
        <filter id="focus-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Background track -->
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="rgba(139, 154, 110, 0.12)"
        stroke-width="3.5"
        class="track-circle"
      />
      <!-- Progress indicator -->
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        :stroke="color"
        stroke-width="3.8"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="progress-circle"
        :class="{ 'is-running': isRunning }"
      />
    </svg>
    <div 
      class="time-display" 
      :class="{ 'is-running': isRunning }" 
      @click="$emit('center-click')"
      :title="isRunning ? '点击暂停专注' : '点击开始专注'"
    >
      <div class="time-container">
        <span class="time-text">{{ formattedTime }}</span>
      </div>
      <div class="ring-pill" :class="{ 'is-pulsing': isRunning }">
        <div class="pill-dot" :style="{ backgroundColor: color }"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  totalSeconds: number
  remainingSeconds: number
  isRunning: boolean
  color: string
}>()

defineEmits(['center-click'])

const circumference = 2 * Math.PI * 44

const dashOffset = computed(() => {
  const progress = props.remainingSeconds / props.totalSeconds
  return circumference * (1 - progress)
})

const formattedTime = computed(() => {
  const m = Math.floor(props.remainingSeconds / 60)
  const s = props.remainingSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
</script>

<style scoped>
.pomodoro-ring {
  position: relative;
  width: 440px;
  height: 440px;
  max-width: 85vw;
  max-height: 55vh;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  overflow: visible;
}
.track-circle {
  transition: stroke 0.3s ease;
}
.progress-circle {
  transition: stroke-dashoffset 1s linear, stroke 0.3s ease, filter 0.3s ease;
}
.progress-circle.is-running {
  filter: drop-shadow(0 0 6px rgba(139, 154, 110, 0.45));
}
.time-display {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  border-radius: 50%;
}
.time-display:hover {
  transform: scale(1.015);
}
.time-display.is-running {
  animation: ring-pulse 4s ease-in-out infinite;
}
@keyframes ring-pulse {
  0%, 100% {
    transform: scale(1.01);
  }
  50% {
    transform: scale(1.025);
  }
}
.time-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: -16px;
}
.time-text {
  font-size: clamp(76px, 8.5vw, 94px);
  font-weight: 700;
  font-family: var(--font-family-base);
  color: var(--text-primary);
  letter-spacing: -2.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  transition: color 0.3s;
}

/* The small pill switch at the bottom of the ring */
.ring-pill {
  position: absolute;
  bottom: 64px;
  width: 40px;
  height: 20px;
  border-radius: 9999px;
  border: 1px solid var(--border-subtle, #E6E6E4);
  background: var(--color-bg-tertiary, #FAF7F2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transition: background-color 0.3s ease, transform 0.3s ease;
}
.ring-pill.is-pulsing .pill-dot {
  animation: dot-breathe 2.4s ease-in-out infinite;
}
@keyframes dot-breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
  }
}

html.dark .track-circle {
  stroke: rgba(163, 177, 155, 0.15);
}
html.dark .progress-circle.is-running {
  filter: drop-shadow(0 0 8px rgba(154, 176, 143, 0.5));
}
html.dark .ring-pill {
  background: #212621;
  border-color: rgba(163, 177, 155, 0.25);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
html.dark .time-text {
  color: #FAF7F2;
}
</style>
