<template>
  <view class="week-card zen-card">
    <view class="week-nav">
      <text class="week-month num-tabular">{{ monthTitle }}</text>
      <view class="week-controls">
        <view
          v-if="modelValue !== todayKey"
          class="today-chip"
          role="button"
          aria-label="回到今天"
          @click="emit('jump-today')"
        >
          <text>今天</text>
        </view>
        <view
          class="week-arrow"
          role="button"
          aria-label="上一周"
          @click="emit('shift-week', -7)"
        >
          <LineIcon name="chevron-left" size="14px" color="var(--text-muted)" />
        </view>
        <view
          class="week-arrow"
          role="button"
          aria-label="下一周"
          @click="emit('shift-week', 7)"
        >
          <LineIcon name="chevron-right" size="14px" color="var(--text-muted)" />
        </view>
      </view>
    </view>

    <view class="week-strip">
      <view
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
        <text class="w-label">{{ day.weekdayLabel }}</text>
        <view class="w-num-circle">
          <text class="w-num num-tabular">{{ day.dayNumber }}</text>
        </view>
        <view class="w-dot" :class="{ visible: scheduledDates.has(day.dateKey) }"></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { pad2, type WeekDayDescriptor } from '@/utils/dateKey'

const props = defineProps<{
  modelValue: string
  todayKey: string
  days: WeekDayDescriptor[]
  scheduledDates: Set<string>
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'shift-week', deltaDays: number): void
  (event: 'jump-today'): void
}>()

const monthTitle = computed(() => {
  const [year, month] = props.modelValue.split('-').map(Number)
  if (!year || !month) return ''
  return `${year} · ${pad2(month)}`
})
</script>

<style scoped>
.week-card {
  padding: 12px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.week-month {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.week-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.today-chip {
  height: 24px;
  padding: 0 9px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-semibold);
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.14s ease;
}

.today-chip:active {
  transform: scale(0.95);
}

.week-arrow {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease;
}

.week-arrow:hover {
  border-color: var(--border-accent);
}

.week-arrow:active {
  transform: scale(0.92);
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
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.week-day.active .w-label {
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.w-num-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.18s var(--ease-out), transform 0.2s var(--ease-out);
}

.w-num {
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.week-day.is-today:not(.active) .w-num-circle {
  border: 1.5px solid rgba(139, 154, 110, 0.48);
}

.week-day.is-today:not(.active) .w-num {
  color: var(--color-sage-ink);
}

.week-day.active .w-num-circle {
  background: var(--accent-gradient);
  box-shadow: 0 3px 10px rgba(139, 154, 110, 0.34);
  animation: dayCirclePop 0.22s var(--ease-out);
}

@keyframes dayCirclePop {
  0% { transform: scale(0.84); }
  65% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.week-day.active .w-num {
  color: #FFFFFF;
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
