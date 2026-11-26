<template>
  <div
    class="week-card"
    :class="{
      'zen-card': !frameless,
      'is-frameless': frameless,
      'is-compact': !showHeader && !frameless,
    }"
  >
    <div v-if="showHeader" class="week-nav">
      <span class="week-month num-tabular">{{ monthTitle }}</span>
    </div>

    <div class="week-strip">
      <div
        v-for="day in days"
        :key="day.dateKey"
        class="week-day"
        :class="{
          active: modelValue === day.dateKey,
          'is-today': day.isToday,
        }"
        role="button"
        :aria-label="day.dateKey"
        :aria-pressed="modelValue === day.dateKey"
        @click="emit('update:modelValue', day.dateKey)"
      >
        <span class="w-label">{{ day.weekdayLabel }}</span>
        <div class="w-num-circle">
          <span class="w-num num-tabular">{{ day.dayNumber }}</span>
        </div>
        <div class="w-dot" :class="{ visible: scheduledDates.has(day.dateKey) }"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { pad2, type WeekDayDescriptor } from '@/utils/dateKey'

const props = defineProps<{
  modelValue: string
  days: WeekDayDescriptor[]
  scheduledDates: Set<string>
  showHeader?: boolean
  frameless?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const monthTitle = computed(() => {
  const [year, month] = props.modelValue.split('-').map(Number)
  if (!year || !month) return ''
  return `${year} · ${pad2(month)}`
})
</script>

<style scoped>
.week-card {
  padding: 13px 14px 11px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  border-radius: 18px;
}

.week-card.is-compact {
  padding: 12px 12px 9px;
}

.week-card.is-frameless {
  padding: 0;
  gap: 6px;
  background-color: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  padding: 0 4px;
}

.week-card.is-frameless .week-nav {
  padding: 0 2px;
}

.week-month {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.14s ease;
}

.week-day:hover:not(.active) {
  background-color: rgba(139, 154, 110, 0.08);
}

.week-day:active {
  transform: scale(0.94);
}

.w-label {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.week-day.is-today .w-label,
.week-day.active .w-label {
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.w-num-circle {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.18s var(--ease-out), transform 0.2s var(--ease-out);
}

.w-num {
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.week-day.is-today:not(.active) .w-num-circle {
  background-color: rgba(139, 154, 110, 0.12);
  border: 1px solid rgba(139, 154, 110, 0.36);
}

.week-day.is-today:not(.active) .w-num {
  color: var(--color-sage-ink);
}

.week-day.active .w-num-circle {
  background: var(--accent-gradient);
  box-shadow: none;
  animation: dayCirclePop 0.22s var(--ease-out);
}

@keyframes dayCirclePop {
  0% { transform: scale(0.84); }
  65% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.week-day.active .w-num {
  color: #FFFFFF;
  font-weight: var(--font-weight-bold);
}

.w-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--color-zen-sage);
  opacity: 0;
  transition: opacity 0.16s ease;
}

.w-dot.visible {
  opacity: 1;
}
</style>
