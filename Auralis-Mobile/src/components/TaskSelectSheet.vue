<template>
  <view v-if="visible" class="zen-sheet-mask" @click="close">
    <view class="zen-sheet-body sheet-panel" @click.stop>
      <view class="sheet-header">
        <text class="sheet-title">选择专注任务</text>
        <view class="ui-icon-btn" role="button" aria-label="关闭" @click="close">
          <LineIcon name="close" size="16px" color="var(--text-muted, #7A7A75)" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="sheet-scroll">
        <view
          class="task-option"
          :class="{ 'is-selected': !selectedTaskId }"
          role="button"
          @click="choose(null)"
        >
          <view class="option-icon is-free">
            <LineIcon name="sparkles" size="16px" color="#536B79" />
          </view>
          <view class="option-body">
            <text class="option-title">自由学习</text>
          </view>
          <text class="option-badge is-free-badge">随时开启专注</text>
          <LineIcon v-if="!selectedTaskId" name="check" size="16px" color="var(--color-sage-ink, #556B3D)" />
        </view>

        <view v-if="scheduledTasks.length > 0" class="group-section">
          <text class="group-label">已排期日程</text>
          <view
            v-for="task in scheduledTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            role="button"
            @click="choose(task)"
          >
            <view class="option-icon">
              <LineIcon name="calendar" size="15px" color="var(--color-sage-dark, #76855B)" />
            </view>
            <view class="option-body">
              <text class="option-title">{{ task.name }}</text>
              <text v-if="task.subject" class="option-meta num-tabular">{{ task.subject }} · {{ task.duration || 30 }}m</text>
            </view>
            <text class="option-badge num-tabular">{{ formatFocusScheduledTime(task.scheduledAt) }}</text>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="16px" color="var(--color-sage-ink, #556B3D)" />
          </view>
        </view>

        <view v-if="pendingTasks.length > 0" class="group-section">
          <text class="group-label">待办清单</text>
          <view
            v-for="task in pendingTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            role="button"
            @click="choose(task)"
          >
            <view class="option-icon">
              <LineIcon name="layers" size="15px" color="var(--text-muted, #7A7A75)" />
            </view>
            <view class="option-body">
              <text class="option-title">{{ task.name }}</text>
              <text v-if="task.subject" class="option-meta">{{ task.subject }}</text>
            </view>
            <text class="option-badge num-tabular">{{ task.duration || 30 }}m</text>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="16px" color="var(--color-sage-ink, #556B3D)" />
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
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
    .filter(task => !task.is_deleted && task.scheduledAt && task.status !== 'completed')
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
  flex-shrink: 0;
}

.sheet-title {
  font-size: var(--font-size-lg, 17px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, #1C1C1A);
}

.sheet-scroll {
  flex: 1;
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
  background-color: var(--glass-sub-bg, rgba(255, 255, 255, 0.56));
  backdrop-filter: var(--glass-blur-soft, blur(18px));
  -webkit-backdrop-filter: var(--glass-blur-soft, blur(18px));
  border: 1px solid var(--glass-border-subtle, rgba(255, 255, 255, 0.72));
  box-shadow: var(--glass-shadow-subtle, 0 2px 10px rgba(45, 55, 40, 0.03));
  border-radius: 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.task-option:hover {
  border-color: var(--border-accent, rgba(139, 154, 110, 0.42));
}

.task-option.is-selected {
  border-color: var(--glass-border, rgba(255, 255, 255, 0.82));
  background-color: rgba(139, 154, 110, 0.14);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.option-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background-color: var(--color-bg-primary, #F7F2EB);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.option-icon.is-free {
  background-color: rgba(110, 136, 152, 0.12);
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
</style>
