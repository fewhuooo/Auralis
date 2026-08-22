<template>
  <div class="pomodoro-ring">
    <svg class="ring-svg" viewBox="0 0 100 100">
      <!-- Background track -->
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="var(--text-primary)"
        stroke-width="3"
        opacity="0.05"
      />
      <!-- Progress indicator -->
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        :stroke="color"
        stroke-width="3"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="progress-circle"
        :class="{ 'is-running': isRunning }"
      />
    </svg>
    <div class="time-display" :class="{ 'is-running': isRunning }" @click="$emit('center-click')">
      <div class="time-container">
        <span class="time-text">{{ formattedTime }}</span>
      </div>
      <div class="ring-pill">
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

const emit = defineEmits(['center-click'])

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
  width: 320px;
  height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.progress-circle {
  transition: stroke-dashoffset 1s linear;
}
.time-display {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s;
  cursor: pointer;
}
.time-display.is-running {
  transform: scale(1.02);
}
.time-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: -10px;
}
.time-text {
  font-size: var(--font-size-display);
  font-weight: 600;
  font-family: var(--font-family-base);
  color: var(--text-primary);
  letter-spacing: -1px;
  line-height: 1;
  transition: color 0.3s;
}

/* The small pill switch at the bottom of the ring */
.ring-pill {
  position: absolute;
  bottom: 30px;
  width: 30px;
  height: 15px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
</style>
