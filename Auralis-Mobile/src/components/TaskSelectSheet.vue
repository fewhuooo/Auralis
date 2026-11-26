<template>
  <div v-if="visible" class="zen-sheet-mask task-sheet-mask" @click="close">
    <div class="zen-sheet-body sheet-panel" @click.stop>
      <div class="sheet-header">
        <span class="sheet-title">选择专注任务</span>
        <div class="sheet-close-btn" role="button" aria-label="关闭" @click="close">
          <LineIcon name="close" size="16px" color="var(--text-muted, #7A7A75)" />
        </div>
      </div>

      <div class="sheet-scroll zen-scroll-y">
        <div
          class="task-option"
          :class="{ 'is-selected': !selectedTaskId }"
          role="button"
          @click="choose(null)"
        >
          <div class="option-icon is-free">
            <LineIcon name="sparkles" size="16px" color="#536B79" />
          </div>
          <div class="option-body">
            <span class="option-title">自由学习</span>
          </div>
          <span class="option-badge is-free-badge">随时开启专注</span>
          <LineIcon v-if="!selectedTaskId" name="check" size="16px" color="#637748" />
        </div>

        <div v-if="scheduledTasks.length > 0" class="group-section">
          <span class="group-label">已排期日程</span>
          <div
            v-for="task in scheduledTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            role="button"
            @click="choose(task)"
          >
            <div class="option-icon">
              <LineIcon name="calendar" size="15px" color="#637748" />
            </div>
            <div class="option-body">
              <span class="option-title">{{ task.name }}</span>
              <span v-if="task.subject" class="option-meta num-tabular">{{ task.subject }} · {{ task.duration || 30 }}m</span>
            </div>
            <span class="option-badge num-tabular">{{ formatFocusScheduledTime(task.scheduledAt) }}</span>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="16px" color="#637748" />
          </div>
        </div>

        <div v-if="pendingTasks.length > 0" class="group-section">
          <span class="group-label">待办清单</span>
          <div
            v-for="task in pendingTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            role="button"
            @click="choose(task)"
          >
            <div class="option-icon">
              <LineIcon name="layers" size="15px" color="var(--text-muted, #7A7A75)" />
            </div>
            <div class="option-body">
              <span class="option-title">{{ task.name }}</span>
              <span v-if="task.subject" class="option-meta">{{ task.subject }}</span>
            </div>
            <span class="option-badge num-tabular">{{ task.duration || 30 }}m</span>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="16px" color="#637748" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { formatFocusScheduledTime } from '@/services/focusController'
import { useTaskStore, type Task } from '@/store/useTaskStore'

const props = defineProps<{
  visible: boolean
  selectedTaskId?: string
}>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
  (event: 'select', task: Task | null): void
}>()

useEscapeKey(() => props.visible, close)

const taskStore = useTaskStore()

const scheduledTasks = computed(() =>
  taskStore.allTasks
    .filter(task => !task.is_deleted && task.scheduledAt && Number.isFinite(Date.parse(task.scheduledAt)) && task.status !== 'completed' && task.status !== 'cancelled')
    .sort((a, b) => (Date.parse(a.scheduledAt || '') || 0) - (Date.parse(b.scheduledAt || '') || 0)),
)

const pendingTasks = computed(() => taskStore.pendingTasks)

function close() {
  emit('update:visible', false)
}

function choose(task: Task | null) {
  emit('select', task)
  close()
}
</script>

<style scoped>
.zen-sheet-mask.task-sheet-mask {
  background-color: rgba(28, 28, 26, 0.42);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
}

.zen-sheet-body.sheet-panel {
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary, #F7F2EB);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-top: 1px solid rgba(139, 154, 110, 0.25);
  box-shadow: 0 -12px 36px rgba(28, 28, 26, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.sheet-title {
  font-size: var(--font-size-lg, 17px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, #1C1C1A);
}

.sheet-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  background-color: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(45, 55, 40, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.2s var(--ease-out), border-color 0.2s ease, transform 0.16s var(--ease-out);
}

.sheet-close-btn:hover {
  background-color: rgba(139, 154, 110, 0.12);
  border-color: rgba(139, 154, 110, 0.28);
}

.sheet-close-btn:active {
  transform: scale(0.92);
}

.sheet-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  max-height: 52vh;
}

.group-section {
  margin-top: 14px;
}

.group-label {
  display: block;
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-muted, #7A7A75);
  margin-bottom: 8px;
}

.task-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background-color: var(--color-bg-tertiary, #FAF7F2);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid rgba(139, 154, 110, 0.18);
  box-shadow: 0 1px 3px rgba(28, 28, 26, 0.03);
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.task-option:hover {
  background-color: rgba(139, 154, 110, 0.10);
  border-color: rgba(139, 154, 110, 0.30);
}

.task-option.is-selected {
  background-color: rgba(139, 154, 110, 0.16);
  border-color: rgba(139, 154, 110, 0.38);
  box-shadow: none;
}

.option-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background-color: rgba(139, 154, 110, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.option-icon.is-free {
  background-color: rgba(110, 136, 152, 0.12);
}

.task-option.is-selected .option-icon {
  background-color: var(--color-bg-tertiary, #FAF7F2);
}

.option-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-title {
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1C1C1A);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-option.is-selected .option-title {
  color: #637748;
  font-weight: var(--font-weight-bold, 700);
}

.option-meta {
  font-size: var(--text-2xs, 11px);
  color: var(--text-muted, #7A7A75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-badge {
  font-size: 11px;
  font-weight: var(--font-weight-semibold, 600);
  padding: 3px 8px;
  border-radius: 9999px;
  background-color: rgba(139, 154, 110, 0.12);
  color: #637748;
  white-space: nowrap;
  flex-shrink: 0;
}

.option-badge.is-free-badge {
  background-color: rgba(110, 136, 152, 0.12);
  color: #536B79;
}

@media (min-width: 540px) {
  .zen-sheet-body.sheet-panel {
    border: 1px solid rgba(139, 154, 110, 0.25);
    box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.13), 0 8px 24px -6px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }
}
</style>
