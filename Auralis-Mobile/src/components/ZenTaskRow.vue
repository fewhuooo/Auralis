<template>
  <view
    class="task-row zen-card"
    :class="{
      'is-completed': task.status === 'completed',
      'is-scheduled': mode === 'scheduled',
    }"
  >
    <view
      class="check-circle"
      :class="{
        checked: task.status === 'completed',
        locked,
      }"
      role="checkbox"
      :aria-checked="task.status === 'completed'"
      :aria-label="task.name"
      @click="task.id && emit('toggle', task.id)"
    >
      <LineIcon v-if="task.status === 'completed'" name="check" size="11px" color="#FFFFFF" />
    </view>

    <view v-if="mode === 'scheduled'" class="time-rail num-tabular" @click="task.id && emit('toggle', task.id)">
      <text class="rail-start">{{ startLabel }}</text>
      <text class="rail-dur">{{ task.duration || 30 }}m</text>
    </view>

    <view class="row-info" @click="task.id && emit('toggle', task.id)">
      <text class="row-title" :class="{ strike: task.status === 'completed' }">{{ task.name }}</text>
      <view v-if="hasSubline" class="row-meta num-tabular">
        <text v-if="task.subject" class="meta-subject">{{ task.subject }}</text>
        <view v-if="mode === 'pending' && task.dueAt" class="meta-ddl" :class="{ overdue: isOverdue }">
          <LineIcon name="calendar" size="10px" :color="isOverdue ? 'var(--color-danger)' : 'var(--color-warning-ink)'" />
          <text>{{ formatShortDate(task.dueAt) }}</text>
        </view>
      </view>
    </view>

    <view class="row-actions">
      <picker
        v-if="mode === 'pending' && task.id"
        mode="time"
        value="09:00"
        @change="onTimePicked"
      >
        <view class="schedule-chip" role="button" aria-label="排入日程">
          <LineIcon name="clock" size="11px" color="var(--color-sage-ink)" />
          <text>排期</text>
        </view>
      </picker>

      <view
        v-if="mode === 'scheduled' && task.id && task.status !== 'completed'"
        class="row-icon-btn"
        role="button"
        title="移回待办"
        aria-label="移回待办"
        @click.stop="emit('unschedule', task.id)"
      >
        <LineIcon name="close" size="13px" color="var(--text-muted)" />
      </view>

      <view
        v-if="mode === 'pending' && task.id"
        class="row-icon-btn"
        role="button"
        title="删除待办"
        aria-label="删除待办"
        @click.stop="emit('delete', task.id, task.name)"
      >
        <LineIcon name="trash" size="13px" color="var(--text-muted)" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import type { Task } from '@/store/useTaskStore'
import { formatLocalTimeHHmm, formatShortDate } from '@/utils/dateKey'

const props = defineProps<{
  task: Task
  mode: 'scheduled' | 'pending'
  locked?: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle', id: string): void
  (event: 'unschedule', id: string): void
  (event: 'schedule-time', id: string, hhmm: string): void
  (event: 'delete', id: string, title: string): void
}>()

const startLabel = computed(() => formatLocalTimeHHmm(props.task.scheduledAt) || '全天')

const isOverdue = computed(() => {
  if (!props.task.dueAt || props.task.status === 'completed') return false
  const ms = Date.parse(props.task.dueAt)
  return Number.isFinite(ms) && ms < Date.now()
})

const hasSubline = computed(() => (
  Boolean(props.task.subject) || (props.mode === 'pending' && Boolean(props.task.dueAt))
))

function onTimePicked(event: { detail?: { value?: string } }) {
  const hhmm = event?.detail?.value
  if (hhmm && props.task.id) {
    emit('schedule-time', props.task.id, hhmm)
  }
}
</script>

<style scoped>
.task-row {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 14px;
  transition: border-color 0.18s ease, transform 0.16s var(--ease-out), box-shadow 0.18s ease, opacity 0.18s ease;
}

.task-row:hover {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-md);
}

.task-row.is-completed {
  opacity: 0.54;
}

.check-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.14s ease;
}

.check-circle:active {
  transform: scale(0.88);
}

.check-circle.checked {
  background-color: var(--color-zen-sage);
  border-color: var(--color-zen-sage);
}

.check-circle.locked {
  opacity: 0.4;
  pointer-events: none;
}

.time-rail {
  width: 44px;
  padding-right: 10px;
  border-right: 1.5px solid rgba(139, 154, 110, 0.36);
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  cursor: pointer;
}

.task-row.is-completed .time-rail {
  border-right-color: var(--border-subtle);
}

.rail-start {
  font-size: 13px;
  font-weight: var(--font-weight-bold);
  color: var(--color-sage-ink);
  line-height: 1.15;
}

.task-row.is-completed .rail-start {
  color: var(--text-muted);
}

.rail-dur {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.15;
}

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
}

.row-title {
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  line-height: 1.38;
  word-break: break-word;
}

.row-title.strike {
  text-decoration: line-through;
  color: var(--text-muted);
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11.5px;
  line-height: 1.3;
}

.meta-subject {
  color: var(--text-muted);
}

.meta-ddl {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 5px;
  background-color: var(--color-warning-bg);
  color: var(--color-warning-ink);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
}

.meta-ddl.overdue {
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.schedule-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.14s ease;
}

.schedule-chip:active {
  transform: scale(0.95);
}

.row-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 0.14s ease, background-color 0.14s ease;
}

.row-icon-btn:hover {
  opacity: 1;
  background-color: rgba(28, 28, 26, 0.05);
}

@media (max-width: 390px) {
  .task-row {
    padding: 11px 12px;
    gap: 8px;
  }

  .time-rail {
    width: 40px;
    padding-right: 8px;
  }

  .row-title {
    font-size: 13.5px;
    letter-spacing: -0.01em;
  }
}
</style>
