<template>
  <div class="week-view">
    <div class="week-header">
      <button class="week-nav-btn" @click="prevWeek">‹</button>
      <span class="week-label">{{ weekLabel }}</span>
      <button class="week-nav-btn" @click="nextWeek">›</button>
    </div>
    <div class="week-grid">
      <div
        v-for="day in weekDays"
        :key="day.dateStr"
        class="week-day-col"
        :class="{ 'is-today': day.isToday, 'is-past': day.isPast }"
        @click="$emit('select-day', day.dateStr)"
      >
        <div class="day-header">
          <span class="day-name">{{ day.dayName }}</span>
          <span class="day-number" :class="{ 'today-badge': day.isToday }">{{ day.dayNum }}</span>
        </div>
        <div class="day-tasks">
          <div
            v-for="task in getTasksForDay(day)"
            :key="task.id"
            class="day-task-card"
            :style="{ borderLeftColor: task.color }"
          >
            <span class="day-task-time">{{ task.startTime }}</span>
            <span class="day-task-name">{{ task.name }}</span>
          </div>
          <div v-if="getTasksForDay(day).length === 0 && !day.isPast" class="day-empty">
            <span>空闲</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Task } from '@/store/useTaskStore'

const props = defineProps<{
  tasks: Task[]
  timeSlots: { time: string; task: Task | null }[]
}>()

defineEmits<{
  'select-day': [dateStr: string]
}>()

const weekOffset = ref(0)

const today = new Date()

const weekStart = computed(() => {
  const d = new Date(today)
  d.setDate(d.getDate() - d.getDay() + 1 + weekOffset.value * 7) // Monday
  return d
})

const weekLabel = computed(() => {
  const start = weekStart.value
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sm = start.getMonth() + 1
  const sd = start.getDate()
  const em = end.getMonth() + 1
  const ed = end.getDate()
  if (sm === em) return `${start.getFullYear()} 年 ${sm} 月 ${sd} - ${ed} 日`
  return `${sm}/${sd} - ${em}/${ed}`
})

const weekDays = computed(() => {
  const days = []
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.value)
    d.setDate(d.getDate() + i)
    const todayStr = formatDate(today)
    const dateStr = formatDate(d)
    days.push({
      dateStr,
      dayName: dayNames[i],
      dayNum: d.getDate(),
      isToday: dateStr === todayStr,
      isPast: d < today && dateStr !== todayStr
    })
  }
  return days
})

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTasksForDay(day: { dateStr: string; isToday: boolean }) {
  if (day.isToday) {
    return props.timeSlots.filter(s => s.task).map(s => ({
      ...s.task!,
      startTime: s.time
    }))
  }
  return []
}

const prevWeek = () => { weekOffset.value-- }
const nextWeek = () => { weekOffset.value++ }
</script>

<style scoped>
.week-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.week-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 0 12px;
  flex-shrink: 0;
}

.week-nav-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.week-nav-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.week-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 160px;
  text-align: center;
}

.week-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  overflow: hidden;
}

.week-day-col {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid rgba(255, 255, 255, 0.03);
}

.week-day-col:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--border-default);
}

.week-day-col.is-today {
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--border-accent);
}

.week-day-col.is-past {
  opacity: 0.5;
}

.day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.day-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.day-number {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-top: 2px;
}

.today-badge {
  background: var(--accent-gradient);
  color: white;
}

.day-tasks {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.day-task-card {
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-left: 3px solid;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.day-task-time {
  font-size: 9px;
  color: var(--text-muted);
  font-weight: 600;
}

.day-task-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 10px;
  opacity: 0.5;
}
</style>
