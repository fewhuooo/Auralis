<template>
  <view v-if="visible" class="zen-sheet-mask" @click="close">
    <view class="zen-sheet-body sheet-panel" @click.stop>
      <view class="sheet-header">
        <text class="sheet-title">选择专注关联任务</text>
        <view class="sheet-close" @click="close">
          <LineIcon name="close" size="34rpx" color="var(--text-muted)" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="sheet-scroll">
        <view
          class="task-option"
          :class="{ 'is-selected': !selectedTaskId }"
          @click="choose(null)"
        >
          <view class="option-icon free">
            <LineIcon name="sparkles" size="32rpx" color="var(--color-zen-sage)" />
          </view>
          <view class="option-body">
            <text class="option-title">自由学习</text>
            <text class="option-meta">不绑定具体任务，专注计时完成后仍计入专注记录</text>
          </view>
          <LineIcon v-if="!selectedTaskId" name="check" size="32rpx" color="var(--color-zen-sage)" />
        </view>

        <view v-if="scheduledTasks.length > 0" class="group-section">
          <text class="group-label">已排期日程</text>
          <view
            v-for="task in scheduledTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            @click="choose(task)"
          >
            <view class="option-icon">
              <LineIcon name="calendar" size="30rpx" color="var(--color-zen-sage)" />
            </view>
            <view class="option-body">
              <text class="option-title">{{ task.name }}</text>
              <text class="option-meta">
                {{ formatShortDate(task.scheduledAt) }} {{ formatLocalTimeHHmm(task.scheduledAt) }}
                · {{ task.subject || '通用' }} · {{ task.duration || 30 }} 分钟
              </text>
            </view>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="32rpx" color="var(--color-zen-sage)" />
          </view>
        </view>

        <view v-if="pendingTasks.length > 0" class="group-section">
          <text class="group-label">待办清单</text>
          <view
            v-for="task in pendingTasks"
            :key="task.id"
            class="task-option"
            :class="{ 'is-selected': selectedTaskId === task.id }"
            @click="choose(task)"
          >
            <view class="option-icon">
              <LineIcon name="layers" size="30rpx" color="var(--text-muted)" />
            </view>
            <view class="option-body">
              <text class="option-title">{{ task.name }}</text>
              <text class="option-meta">
                {{ task.subject || '通用' }} · {{ task.duration || 30 }} 分钟
              </text>
            </view>
            <LineIcon v-if="selectedTaskId === task.id" name="check" size="32rpx" color="var(--color-zen-sage)" />
          </view>
        </view>

        <view v-if="scheduledTasks.length === 0 && pendingTasks.length === 0" class="empty-tip">
          <LineIcon name="coffee" size="48rpx" color="var(--text-muted)" />
          <text class="empty-text">暂无待办或已排期任务，可直接使用自由学习</text>
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
  max-height: 72vh;
  display: flex;
  flex-direction: column;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.sheet-close {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet-scroll {
  max-height: 54vh;
}

.group-section {
  margin-top: 24rpx;
}

.group-label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  margin-bottom: 12rpx;
  padding-left: 8rpx;
}

.task-option {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 24rpx;
  margin-bottom: 14rpx;
  transition: all 0.16s ease;
}

.task-option.is-selected {
  border-color: var(--border-accent);
  background-color: var(--color-sage-bg);
}

.option-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 18rpx;
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
  gap: 6rpx;
}

.option-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-meta {
  font-size: 22rpx;
  color: var(--text-muted);
}

.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 36rpx 24rpx;
}

.empty-text {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
</style>
