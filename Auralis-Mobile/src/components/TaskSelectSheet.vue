<template>
  <view v-if="visible" class="zen-sheet-mask" @click="close">
    <view class="zen-sheet-body sheet-panel" @click.stop>
      <view class="sheet-header">
        <text class="sheet-title">关联任务</text>
        <view class="ui-icon-btn" @click="close">
          <LineIcon name="close" size="16px" color="var(--text-muted)" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="sheet-scroll">
        <view
          class="task-option"
          :class="{ 'is-selected': !selectedTaskId }"
          @click="choose(null)"
        >
          <view class="option-icon">
            <LineIcon name="sparkles" size="16px" color="var(--color-sage-dark)" />
          </view>
          <text class="option-title">自由专注</text>
          <LineIcon v-if="!selectedTaskId" name="check" size="16px" color="var(--color-sage-dark)" />
        </view>

        <view v-if="scheduledTasks.length > 0" class="group-section">
          <text class="group-label">日程</text>
          <view
            v-for="task in scheduledTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            @click="choose(task)"
          >
            <view class="option-icon">
              <LineIcon name="calendar" size="15px" color="var(--color-sage-dark)" />
            </view>
            <view class="option-body">
              <text class="option-title">{{ task.name }}</text>
              <text class="option-meta num-tabular">
                {{ formatShortDate(task.scheduledAt) }} {{ formatLocalTimeHHmm(task.scheduledAt) }}
                · {{ task.duration || 30 }}m
              </text>
            </view>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="16px" color="var(--color-sage-dark)" />
          </view>
        </view>

        <view v-if="pendingTasks.length > 0" class="group-section">
          <text class="group-label">待办</text>
          <view
            v-for="task in pendingTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            @click="choose(task)"
          >
            <view class="option-icon">
              <LineIcon name="layers" size="15px" color="var(--text-muted)" />
            </view>
            <view class="option-body">
              <text class="option-title">{{ task.name }}</text>
              <text v-if="task.subject" class="option-meta num-tabular">{{ task.subject }} · {{ task.duration || 30 }}m</text>
            </view>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="16px" color="var(--color-sage-dark)" />
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import { formatLocalTimeHHmm, formatShortDate } from '@/utils/dateKey'

defineProps<{
  visible: boolean
  selectedTaskId?: string
}>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
  (event: 'select', task: Task | null): void
}>()

const taskStore = useTaskStore()

const scheduledTasks = computed(() =>
  taskStore.allTasks
    .filter(task => !task.is_deleted && task.scheduledAt && task.status !== 'completed')
    .sort((a, b) => Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || '')),
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
.sheet-panel {
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.sheet-scroll {
  max-height: 52vh;
}

.group-section {
  margin-top: 14px;
}

.group-label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  margin-bottom: 8px;
}

.task-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.task-option.is-selected {
  border-color: var(--border-accent);
  background-color: var(--color-sage-bg);
}

.option-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background-color: var(--color-bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.option-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-meta {
  font-size: var(--text-2xs);
  color: var(--text-muted);
}

/* #ifdef H5 */
@media (min-width: 540px) {
  .zen-sheet-mask {
    justify-content: center;
    padding: 24px;
  }

  .zen-sheet-body {
    border-radius: var(--radius-xl);
    border: 1px solid var(--border-subtle);
    padding: 22px;
  }
}
/* #endif */
</style>
