<template>
  <div class="timeline-page">
    <!-- Page header -->
    <div class="page-header">
      <div>
        <h1 class="page-headline">任务编排中心</h1>
        <p class="page-subtitle">拖拽任务块至时间轴，AI 将实时评估脑力负荷</p>
      </div>
      <div class="header-actions">
        <button class="btn-secondary">
          <span>📥</span> 导入任务块
        </button>
        <button class="btn-primary">
          <span>＋</span> 新建排期
        </button>
      </div>
    </div>

    <!-- Stats overview -->
    <div class="stats-row">
      <div v-for="stat in stats" :key="stat.label" class="stat-card">
        <span class="stat-icon">{{ stat.icon }}</span>
        <div class="stat-info">
          <span class="stat-value">{{ stat.value }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </div>

    <!-- AI Suggestion Bubble -->
    <div v-if="aiSuggestions && aiSuggestions.length > 0" class="ai-suggestion-bubble">
      <div class="ai-bubble-header">
        <div class="ai-title">
          <span class="ai-icon">✨</span>
          <span>AI 智能排期建议</span>
        </div>
        <button v-if="hasOverload" class="btn-auto-delay" @click="taskStore.applyAutoDelay()">
          自动延后减负
        </button>
      </div>
      <ul class="suggestion-list">
        <li v-for="(sug, index) in aiSuggestions" :key="index">{{ sug }}</li>
      </ul>
    </div>

    <!-- Timeline -->
    <div class="timeline-body">
      <div class="timeline-column">
        <h3 class="column-title">今日时间流</h3>
        <div class="time-slots">
          <div
            v-for="slot in timeSlots"
            :key="slot.time"
            class="time-slot"
            :class="{ 'has-task': slot.task, 'is-current': slot.isCurrent, 'drag-over': dragOverSlot === slot.time }"
            @dragover.prevent="handleDragOver(slot.time)"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop(slot.time)"
          >
            <span class="slot-time">{{ slot.time }}</span>
            <div 
              v-if="slot.task" 
              class="slot-task" 
              :style="{ borderLeftColor: slot.task.color }"
              draggable="true"
              @dragstart.stop="handleDragStart($event, 'scheduled', slot.time)"
            >
              <div class="task-header">
                <span class="task-name">{{ slot.task.name }}</span>
                <span class="task-tag">{{ slot.task.subject }}</span>
              </div>
              <div class="task-detail">{{ slot.task.desc }}</div>
            </div>
            <div v-else class="slot-empty">
              <span>空闲</span>
            </div>
            <div v-if="slot.isCurrent" class="current-indicator">
              <span class="current-dot"></span>
              <span class="current-line"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="tasks-column">
        <h3 class="column-title">待安排任务块</h3>
        <div 
          class="pending-tasks"
          :class="{ 'drag-over': dragOverPending }"
          @dragover.prevent="dragOverPending = true"
          @dragleave.prevent="dragOverPending = false"
          @drop.prevent="handleDropOnPending"
        >
          <div
            v-for="task in pendingTasks"
            :key="task.id"
            class="pending-card"
            draggable="true"
            @dragstart.stop="handleDragStart($event, 'pending', task.id)"
          >
            <div class="pending-color" :style="{ background: task.color }"></div>
            <div class="pending-body">
              <span class="pending-name">{{ task.name }}</span>
              <span class="pending-subject">{{ task.subject }}</span>
              <div class="pending-meta">
                <span>预计 {{ task.duration }}min</span>
                <span class="load-indicator" :class="task.load">{{ task.loadText }}</span>
              </div>
            </div>
            <span class="drag-handle">⠿</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTaskStore } from '@/store/useTaskStore'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'

const taskStore = useTaskStore()
const { pendingTasks, timeSlots, completedCount, pendingCount, totalFocusHours, aiSuggestions, hasOverload } = storeToRefs(taskStore)

onMounted(() => {
  taskStore.fetchTasks()
})

const stats = computed(() => [
  { icon: '📋', value: pendingCount.value.toString(), label: '待完成任务' },
  { icon: '🔥', value: completedCount.value.toString(), label: '今日已完成' },
  { icon: '⏱', value: totalFocusHours.value, label: '今日专注时长' },
  { icon: '🧠', value: '中等', label: '脑力负荷' },
])

// Drag & Drop State
const draggedItem = ref<{ type: 'pending' | 'scheduled', idOrTime: string } | null>(null)
const dragOverSlot = ref<string | null>(null)
const dragOverPending = ref(false)

const handleDragStart = (e: DragEvent, type: 'pending' | 'scheduled', idOrTime: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', idOrTime) // Essential for Firefox/some browsers to allow drag
  }
  draggedItem.value = { type, idOrTime }
}

const handleDragOver = (slotTime: string) => {
  // Prevent dropping on itself
  if (!(draggedItem.value?.type === 'scheduled' && draggedItem.value.idOrTime === slotTime)) {
    dragOverSlot.value = slotTime
  } else {
    dragOverSlot.value = null
  }
}

const handleDragLeave = () => {
  dragOverSlot.value = null
}

const handleDrop = (slotTime: string) => {
  if (draggedItem.value) {
    if (draggedItem.value.type === 'pending') {
      taskStore.scheduleTask(draggedItem.value.idOrTime, slotTime)
    } else if (draggedItem.value.type === 'scheduled' && draggedItem.value.idOrTime !== slotTime) {
      taskStore.rescheduleTask(draggedItem.value.idOrTime, slotTime)
    }
  }
  draggedItem.value = null
  dragOverSlot.value = null
  dragOverPending.value = false
}

const handleDropOnPending = () => {
  if (draggedItem.value?.type === 'scheduled') {
    taskStore.unscheduleTask(draggedItem.value.idOrTime)
  }
  draggedItem.value = null
  dragOverPending.value = false
}
</script>

<style scoped>
.timeline-page {
  width: 100%;
  padding: 28px 40px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

/* Page header */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
}

.page-headline {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-primary,
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all var(--transition-normal);
}

.btn-primary {
  background: var(--accent-gradient);
  color: white;
  border: none;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--accent-glow);
}

.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

.btn-secondary:hover {
  border-color: var(--border-accent);
  color: var(--text-primary);
}

/* Stats */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 28px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.stat-icon {
  font-size: 24px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

/* AI Suggestion Bubble */
.ai-suggestion-bubble {
  background: var(--border-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-bubble-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  color: var(--accent-mid);
}

.ai-icon {
  font-size: 16px;
}

.suggestion-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestion-list li {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
}

.btn-auto-delay {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-accent);
  color: var(--text-accent);
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-auto-delay:hover {
  background: var(--accent-mid);
  color: white;
}

/* Timeline body */
.timeline-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;
}

.column-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 14px;
}

/* Time slots */
.time-slots {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-slot {
  display: flex;
  align-items: stretch;
  gap: 12px;
  min-height: 60px;
  position: relative;
}

.slot-time {
  width: 52px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  padding-top: 4px;
  flex-shrink: 0;
  text-align: right;
}

.slot-task {
  flex: 1;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all var(--transition-normal);
}

.slot-task:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--border-accent);
  border-left-width: 3px;
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.task-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.task-tag {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.task-detail {
  font-size: 12px;
  color: var(--text-secondary);
}

.slot-empty {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 12px;
  transition: all var(--transition-normal);
}

.time-slot.drag-over .slot-empty {
  background: var(--border-subtle);
  border-color: var(--border-accent);
  color: var(--text-accent);
}

.time-slot.drag-over .slot-task {
  opacity: 0.6;
  border-color: var(--border-accent);
  box-shadow: 0 0 0 2px var(--border-accent);
}

/* Current time indicator */
.is-current .slot-time {
  color: var(--accent-mid);
}

.current-indicator {
  position: absolute;
  left: 64px;
  right: 0;
  top: 0;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.current-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-mid);
  flex-shrink: 0;
  box-shadow: 0 0 8px var(--accent-glow);
  z-index: 1;
}

.current-line {
  flex: 1;
  height: 2px;
  background: var(--accent-mid);
  opacity: 0.5;
}

/* Pending tasks sidebar */
.pending-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
  padding-bottom: 20px;
  transition: background var(--transition-normal);
  border-radius: var(--radius-md);
}

.pending-tasks.drag-over {
  background: var(--color-bg-tertiary);
  box-shadow: inset 0 0 0 1px var(--border-accent);
}

.pending-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: grab;
  transition: all var(--transition-normal);
}

.pending-card:hover {
  border-color: var(--border-accent);
  transform: translateX(-2px);
}

.pending-card:active {
  cursor: grabbing;
}

.pending-color {
  width: 4px;
  height: 36px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.pending-body {
  flex: 1;
  min-width: 0;
}

.pending-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pending-subject {
  font-size: 11px;
  color: var(--text-muted);
}

.pending-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.load-indicator {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 10px;
}

.load-indicator.low {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.load-indicator.medium {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.load-indicator.high {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.drag-handle {
  color: var(--text-muted);
  font-size: 16px;
  cursor: grab;
  opacity: 0.3;
  transition: opacity var(--transition-fast);
}

.pending-card:hover .drag-handle {
  opacity: 0.7;
}
</style>
