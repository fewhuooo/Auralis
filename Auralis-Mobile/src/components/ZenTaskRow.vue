<template>
  <div
    class="task-row zen-card"
    :class="{
      'is-tablet-target': isTabletTarget,
      'is-completed': task.status === 'completed',
      'is-scheduled': mode === 'scheduled',
      'is-pending': mode === 'pending',
    }"
  >
    <div v-if="mode === 'pending'" class="todo-accent-bar" aria-hidden="true"></div>

    <div
      class="check-circle"
      :class="{
        checked: task.status === 'completed',
        locked,
      }"
      role="checkbox"
      :aria-checked="task.status === 'completed'"
      :aria-disabled="locked ? 'true' : undefined"
      :aria-label="task.name"
      @click="task.id && emit('toggle', task.id)"
    >
      <LineIcon v-if="task.status === 'completed'" name="check" size="11px" color="#FFFFFF" />
    </div>

    <div class="row-info" :class="{ locked }" @click="task.id && emit('toggle', task.id)">
      <div v-if="mode === 'pending'" class="pending-title-flow">
        <span class="row-title" :class="{ strike: task.status === 'completed' }">{{ task.name }}</span>
        <div v-if="task.dueAt" class="meta-ddl num-tabular" :class="{ overdue: isOverdue }">
          <LineIcon name="calendar" size="10px" :color="task.status === 'completed' ? 'var(--text-muted)' : (isOverdue ? 'var(--color-danger)' : 'var(--color-warning-ink)')" />
          <span>{{ formatShortDate(task.dueAt) }}</span>
        </div>
      </div>
      <template v-else>
        <div class="scheduled-meta-row num-tabular">
          <span class="scheduled-time-pill">{{ startLabel }} · {{ task.duration || 30 }}m</span>
          <span v-if="task.subject" class="scheduled-subject-pill">{{ task.subject }}</span>
        </div>
        <span class="row-title" :class="{ strike: task.status === 'completed' }">{{ task.name }}</span>
      </template>
    </div>

    <div v-if="showTrailingSlot" class="row-actions">
      <span v-if="mode === 'pending' && task.subject" class="todo-subject-pill">
        {{ task.subject }}
      </span>

      <div
        v-if="!hideScheduleActions && mode === 'scheduled' && task.id && task.status !== 'completed'"
        class="row-icon-btn"
        role="button"
        title="移回待办"
        aria-label="移回待办"
        @click.stop="emit('unschedule', task.id)"
      >
        <LineIcon name="close" size="13px" color="var(--text-muted)" />
      </div>

      <div
        v-if="mode === 'pending' && task.id"
        class="row-icon-btn"
        role="button"
        title="删除待办"
        aria-label="删除待办"
        @click.stop="emit('delete', task.id, task.name)"
      >
        <LineIcon name="trash" size="13px" color="var(--text-muted)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { getAppTarget } from '@/router/target'
import type { Task } from '@/store/useTaskStore'
import { formatLocalTimeHHmm, formatShortDate } from '@/utils/dateKey'

const isTabletTarget = getAppTarget() === 'tablet'

const props = defineProps<{
  task: Task
  mode: 'scheduled' | 'pending'
  locked?: boolean
  hideScheduleActions?: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle', id: string): void
  (event: 'unschedule', id: string): void
  (event: 'delete', id: string, title: string): void
}>()

const startLabel = computed(() => formatLocalTimeHHmm(props.task.scheduledAt) || '全天')

const isOverdue = computed(() => {
  if (!props.task.dueAt || props.task.status === 'completed') return false
  const ms = Date.parse(props.task.dueAt)
  return Number.isFinite(ms) && ms < Date.now()
})

const showTrailingSlot = computed(() => (
  props.mode === 'pending'
    ? Boolean(props.task.subject || props.task.id)
    : (!props.hideScheduleActions && Boolean(props.task.id) && props.task.status !== 'completed')
))
</script>

<style scoped>
.task-row {
  padding: 11px 13px;
  display: flex;
  align-items: center;
  gap: 11px;
  border-radius: 13px;
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.16s var(--ease-out), box-shadow 0.18s ease, opacity 0.18s ease;
}

.task-row.is-scheduled {
  border: 1px solid var(--glass-border-subtle);
  border-left: 3px solid var(--color-zen-sage);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.16), 0 2px 10px rgba(45, 55, 40, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.task-row.is-pending {
  border: 1px solid var(--glass-border-subtle);
  padding: 7px 10px;
  gap: 7px;
  border-radius: 11px;
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.15), 0 1px 6px rgba(45, 55, 40, 0.025), inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.task-row:hover {
  border-color: rgba(139, 154, 110, 0.45);
}

.task-row:active {
  border-color: rgba(139, 154, 110, 0.45);
  transform: scale(0.985);
}

.task-row.is-completed {
  opacity: 0.58;
  background-color: rgba(28, 28, 26, 0.035);
}

.task-row.is-completed.is-scheduled {
  border-left-color: var(--color-gray-300);
}

.task-row.is-completed .scheduled-time-pill {
  background-color: rgba(28, 28, 26, 0.05);
  color: var(--text-muted);
}

.task-row.is-completed .todo-accent-bar {
  background: var(--color-gray-300);
}

.task-row.is-completed .todo-subject-pill {
  background-color: rgba(28, 28, 26, 0.05);
  border-color: rgba(28, 28, 26, 0.12);
  color: var(--text-muted);
}

.task-row.is-completed .meta-ddl {
  background-color: rgba(28, 28, 26, 0.05);
  color: var(--text-muted);
}

.todo-accent-bar {
  width: 2.5px;
  height: 14px;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  flex-shrink: 0;
}

.check-circle {
  width: 19px;
  height: 19px;
  border-radius: 50%;
  border: 1.5px solid rgba(139, 154, 110, 0.5);
  background-color: rgba(139, 154, 110, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.14s ease;
}

.task-row.is-pending .check-circle {
  width: 16px;
  height: 16px;
}

.check-circle:active {
  transform: scale(0.88);
}

.check-circle.checked {
  background: var(--color-zen-stone);
  border-color: var(--color-zen-stone);
}

.check-circle.locked {
  opacity: 0.4;
  cursor: not-allowed;
}

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.row-info.locked {
  cursor: default;
}

.scheduled-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.scheduled-time-pill {
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  line-height: 1.25;
}

.scheduled-subject-pill {
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background-color: rgba(28, 28, 26, 0.045);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.25;
}

.row-title {
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.38;
  word-break: break-word;
  letter-spacing: -0.01em;
}

.pending-title-flow {
  display: block;
  width: 100%;
  line-height: 1.42;
}

.task-row.is-pending .row-title {
  display: inline;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.42;
  vertical-align: middle;
}

.row-title.strike {
  text-decoration: line-through;
  color: var(--text-muted);
}

.todo-subject-pill {
  max-width: 80px;
  padding: 1px 6px;
  border-radius: 6px;
  background-color: rgba(139, 154, 110, 0.14);
  border: 0.5px solid rgba(139, 154, 110, 0.32);
  color: var(--color-sage-ink);
  font-size: 10.5px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-ddl {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 5px;
  background-color: var(--color-warning-bg);
  color: var(--color-warning-ink);
  font-size: 10.5px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.25;
  vertical-align: middle;
}

.meta-ddl.overdue {
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.row-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.68;
  transition: opacity 0.14s ease, background-color 0.14s ease;
}

.task-row.is-pending .row-icon-btn {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}

.row-icon-btn:hover {
  opacity: 1;
  background-color: rgba(28, 28, 26, 0.05);
}

.row-icon-btn:active {
  opacity: 1;
  background-color: rgba(28, 28, 26, 0.08);
  transform: scale(0.9);
}

@media (max-width: 390px) {
  .task-row {
    padding: 10px 11px;
    gap: 8px;
  }

  .task-row.is-pending {
    padding: 6px 9px;
    gap: 7px;
  }

  .todo-subject-pill {
    max-width: 68px;
  }

  .row-title {
    font-size: 13px;
  }

  .task-row.is-pending .row-title {
    font-size: 12.5px;
  }
}

.task-row.is-tablet-target {
  padding: 8px 10px;
  gap: 8px;
  border-radius: 10px;
}

.task-row.is-tablet-target.is-pending {
  padding: 6px 9px;
  gap: 6px;
  border-radius: 9px;
}

.task-row.is-tablet-target .check-circle {
  width: 16px;
  height: 16px;
}

.task-row.is-tablet-target.is-pending .check-circle {
  width: 14px;
  height: 14px;
}

.task-row.is-tablet-target .row-title {
  font-size: 12.5px;
}

.task-row.is-tablet-target.is-pending .row-title {
  font-size: 12px;
}

.task-row.is-tablet-target .row-icon-btn {
  width: 24px;
  height: 24px;
}

.task-row.is-tablet-target.is-pending .row-icon-btn {
  width: 22px;
  height: 22px;
}
</style>
