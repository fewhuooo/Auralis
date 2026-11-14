<template>
  <div class="timeline-page">
    <!-- Timeline Header Card -->
    <div class="timeline-header-card">
      <!-- Page header -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="page-headline">任务排期</h1>
        </div>
        
        <!-- Pill stats in the middle -->
        <div class="header-middle-stats">
          <div v-for="stat in stats" :key="stat.label" class="stat-pill">
            <component :is="stat.icon" class="stat-icon" :size="15" :stroke-width="2" />
            <span class="stat-value">{{ stat.value }}</span>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
        </div>

        <div class="header-actions">
          <!-- Day/Week View Switcher -->
          <div class="view-toggle">
            <button 
              class="toggle-btn" 
              :class="{ 'is-active': viewMode === 'day' }"
              @click="viewMode = 'day'"
            >
              日视图
            </button>
            <button 
              class="toggle-btn" 
              :class="{ 'is-active': viewMode === 'week' }"
              @click="viewMode = 'week'"
            >
              周视图
            </button>
          </div>
          <button class="btn-secondary" @click="triggerImport">
            <IconInbox :size="15" :stroke-width="2" /> 导入任务
          </button>
          <button class="btn-primary" @click="triggerCreate">
            <IconPlus :size="16" :stroke-width="2" /> 新建任务
          </button>
        </div>
      </div>

    </div>

    <!-- VIEW: Day Mode (Timeline) -->
    <div v-if="viewMode === 'day'" class="timeline-body">
      <!-- Left Column: Weekly Overview -->
      <div class="weekly-overview-column">
        <h3 class="column-title">本周排期概览</h3>
        <div class="weekly-overview-list">
          <div 
            v-for="day in timelineDays"
            :key="day.dateKey"
            class="weekly-overview-row"
            :class="{ 'is-active': selectedTimelineDay.dateKey === day.dateKey, 'is-today': day.isToday }"
            @click="selectDay(day.dayCode, day.dateKey)"
          >
            <div class="weekly-overview-row-header">
              <span class="day-dot" v-if="day.isToday">今</span>
              <span class="weekly-overview-day-name" :class="{ 'is-today-text': day.isToday }">{{ day.weekdayLabel }} {{ day.monthDayLabel }}</span>
              <span class="weekly-overview-task-count">{{ getPendingScheduledTasksForDateKey(day.dateKey).length }} 项任务</span>
            </div>
            <div class="weekly-overview-tasks-timeline">
              <div 
                v-for="task in getPendingScheduledTasksForDateKey(day.dateKey).slice(0, 3)"
                :key="task.id" 
                class="weekly-overview-task-dot"
                :style="{ backgroundColor: 'var(--color-primary-accent)' }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name}`"
              ></div>
              <span v-if="getPendingScheduledTasksForDateKey(day.dateKey).length > 3" class="weekly-overview-more">+{{ getPendingScheduledTasksForDateKey(day.dateKey).length - 3 }}</span>
              <span v-if="getPendingScheduledTasksForDateKey(day.dateKey).length === 0" class="weekly-overview-empty">空闲</span>
            </div>
          </div>
        </div>

        <h3 class="column-title next-week-title">下周排期概览</h3>
        <div class="weekly-overview-list">
          <div 
            v-for="day in nextWeekTimelineDays"
            :key="day.dateKey"
            class="weekly-overview-row"
            :class="{ 'is-active': selectedTimelineDay.dateKey === day.dateKey }"
            @click="selectDay(day.dayCode, day.dateKey)"
          >
            <div class="weekly-overview-row-header">
              <span class="weekly-overview-day-name">{{ day.weekdayLabel }} {{ day.monthDayLabel }}</span>
              <span class="weekly-overview-task-count">{{ getPendingScheduledTasksForDateKey(day.dateKey).length }} 项任务</span>
            </div>
            <div class="weekly-overview-tasks-timeline">
              <div 
                v-for="task in getPendingScheduledTasksForDateKey(day.dateKey).slice(0, 3)"
                :key="task.id" 
                class="weekly-overview-task-dot"
                :style="{ backgroundColor: 'var(--color-primary-accent)' }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name}`"
              ></div>
              <span v-if="getPendingScheduledTasksForDateKey(day.dateKey).length > 3" class="weekly-overview-more">+{{ getPendingScheduledTasksForDateKey(day.dateKey).length - 3 }}</span>
              <span v-if="getPendingScheduledTasksForDateKey(day.dateKey).length === 0" class="weekly-overview-empty">空闲</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Middle Column: Detailed Day Timeline -->
      <div class="timeline-column">
        <h3 class="column-title">日程时间轴 ({{ selectedTimelineDay.weekdayLabel }} {{ selectedTimelineDay.monthDayLabel }})</h3>
        <div class="time-slots">
          <div
            v-for="slot in timeSlots"
            :key="slot.time"
            class="time-slot"
            :class="{ 'has-task': slot.task, 'is-covered': isSlotCovered(slot.time), 'is-current': slot.isCurrent, 'drag-over': dragOverTarget?.type === 'slot' && dragOverTarget.slotTime === slot.time }"
            @dragover="handleDragOver($event, { type: 'slot', dateKey: selectedTimelineDay.dateKey, slotTime: slot.time })"
            @dragleave="handleDragLeave"
            @drop="handleDrop($event, { type: 'slot', dateKey: selectedTimelineDay.dateKey, slotTime: slot.time })"
          >
            <span class="slot-time">{{ slot.time }}</span>
            <div class="slot-right-container">
              <div class="slot-grid-line"></div>
              <div 
                v-if="slot.task" 
                class="slot-task" 
                :class="{ 'is-past': isPastTask(slot.task), 'is-completed': isCompletedScheduledTask(slot.task), 'is-insert-drop-target': dragOverTarget?.type === 'body' && dragOverTarget.targetTaskId === slot.task.id }"
                :style="{ 
                  borderLeftColor: 'var(--color-primary-accent)',
                  height: getTaskHeight(slot.task.duration)
                }"
                :draggable="!isCompletedScheduledTask(slot.task)"
                @dragstart.stop="handleDragStart($event, slot.task, slot.time)"
                @dragend.stop="clearDragState"
                @dragover.stop="handleDragOver($event, { type: 'body', dateKey: selectedTimelineDay.dateKey, targetTaskId: slot.task.id })"
                @dragleave.stop="handleDragLeave"
                @drop.stop="handleDrop($event, { type: 'body', dateKey: selectedTimelineDay.dateKey, targetTaskId: slot.task.id })"
              >
                <div
                  class="task-header"
                  :class="{ 'is-drop-target': dragOverTarget?.type === 'swap' && dragOverTarget.targetTaskId === slot.task.id }"
                  @dragover.stop="handleDragOver($event, { type: 'swap', dateKey: selectedTimelineDay.dateKey, targetTaskId: slot.task.id })"
                  @dragleave.stop="handleDragLeave"
                  @drop.stop="handleDrop($event, { type: 'swap', dateKey: selectedTimelineDay.dateKey, targetTaskId: slot.task.id })"
                >
                  <span class="task-name">{{ slot.task.name }}</span>
                  <span class="task-tag">
                    {{ slot.task.subject }}
                  </span>
                  <button class="task-delete-btn" :disabled="deletingTaskId === slot.task.id" @click.stop="handleDeleteTask(slot.task)" title="删除任务"><IconX :size="12" :stroke-width="1.8" /></button>
                </div>
                <div class="task-detail">{{ getCleanDesc(slot.task.desc) }}</div>
                <span v-if="dragOverTarget?.type === 'swap' && dragOverTarget.targetTaskId === slot.task.id" class="task-body-drop-hint">
                  交换排期
                </span>
                <span v-else-if="dragOverTarget?.type === 'body' && dragOverTarget.targetTaskId === slot.task.id" class="task-body-drop-hint">
                  {{ bodyDropHint }}
                </span>
                
                <!-- Bidirectional knowledge block badge -->
                <div 
                  v-if="getTaskIdRelation(slot.task.desc)" 
                  class="kb-relation-badge"
                  @click.stop="openRelatedBlock(getTaskIdRelation(slot.task.desc)!)"
                >
                  💡 关联知识: {{ getBlockTitle(getTaskIdRelation(slot.task.desc)!) }}
                </div>
              </div>
              <div v-else-if="!isSlotCovered(slot.time)" class="slot-empty">
              </div>
            </div>
            <div v-if="slot.isCurrent" class="current-indicator">
              <span class="current-dot"></span>
              <span class="current-line"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Pending Tasks -->
      <div class="tasks-column">
        <h3 class="column-title">待安排任务</h3>
        <div 
          class="pending-tasks"
          :class="{ 'drag-over': dragOverTarget?.type === 'unschedule' }"
          @dragover="handleDragOver($event, { type: 'unschedule', dateKey: selectedTimelineDay.dateKey })"
          @dragleave="handleDragLeave"
          @drop="handleDrop($event, { type: 'unschedule', dateKey: selectedTimelineDay.dateKey })"
        >
          <div v-if="filteredTimelinePendingTasks.length === 0" class="pending-empty-state">
            <span class="empty-icon"><IconCalendarCheck :size="36" :stroke-width="1.5" /></span>
            <p>暂无待安排的任务</p>
          </div>
          <div
            v-for="task in filteredTimelinePendingTasks"
            :key="task.id"
            class="pending-card"
            :class="{ 'is-dragging': dragSession?.taskId === task.id }"
            draggable="true"
            @dragstart.stop="handleDragStart($event, task)"
            @dragend.stop="clearDragState"
          >
            <div class="pending-color" :style="{ background: 'var(--color-primary-accent)' }"></div>
            <div class="pending-body">
              <span class="pending-name">{{ task.name }}</span>
              <span class="pending-subject">{{ task.subject }}</span>
              
              <!-- Bidirectional badge on pending tasks -->
              <div 
                v-if="getTaskIdRelation(task.desc)" 
                class="kb-relation-badge mini"
                @click.stop="openRelatedBlock(getTaskIdRelation(task.desc)!)"
              >
                💡 知识: {{ getBlockTitle(getTaskIdRelation(task.desc)!) }}
              </div>

              <div class="pending-meta">
                <span>预计 {{ task.duration }}min</span>
                <span v-if="task.dueAt" class="pending-due-badge" :class="{ 'is-overdue': isTaskOverdue(task.dueAt) }">
                  {{ formatTaskDue(task.dueAt) }}
                </span>
              </div>
            </div>
            <span class="drag-handle">⠿</span>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW: Week Mode -->
    <div v-else-if="viewMode === 'week'" class="weekly-view-container">
      <div class="weekly-view-body">
        <div 
          v-for="day in timelineDays"
          :key="day.dateKey"
          class="weekly-column"
          :class="{ 'is-today': day.isToday, 'drag-over': dragOverTarget?.type === 'week' && dragOverTarget.dateKey === day.dateKey }"
          @dragover="handleDragOver($event, { type: 'week', dateKey: day.dateKey })"
          @dragleave="handleDragLeave"
          @drop="handleDrop($event, { type: 'week', dateKey: day.dateKey })"
          >
          <div class="weekly-column-header">
            <span class="day-dot" v-if="day.isToday">今</span>
            <span class="weekly-column-title" :class="{ 'is-today-text': day.isToday }">
              {{ day.weekdayLabel }} · {{ day.monthDayLabel }}
            </span>
            <span class="weekly-column-count">
              {{ getScheduledTasksForDateKey(day.dateKey).length }}
            </span>
          </div>
          <div class="weekly-tasks-list">
            <div 
              v-for="task in getScheduledTasksForDateKey(day.dateKey)"
              :key="task.id" 
              class="weekly-task-card"
              :class="{ 'is-past': isPastTask(task), 'is-completed': isCompletedScheduledTask(task) }"
              :style="{ borderLeftColor: 'var(--color-primary-accent)' }"
              :draggable="!isCompletedScheduledTask(task)"
              @dragstart.stop="handleDragStart($event, task)"
              @dragend.stop="clearDragState"
            >
              <div class="weekly-task-header">
                <span class="weekly-task-name">{{ task.name }}</span>
                <button class="card-delete-btn" :disabled="deletingTaskId === task.id" @click.stop="handleDeleteTask(task)" title="删除任务"><IconX :size="12" :stroke-width="1.8" /></button>
              </div>
              <div class="weekly-task-meta">
                <span class="weekly-task-time"><IconClock :size="12" :stroke-width="1.8" style="vertical-align: -1.5px; margin-right: 2px;" />{{ getTaskTimeStr(task.startTime) }} ({{ task.duration }}m)</span>
                <span class="weekly-task-tag">
                  {{ task.subject }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Week Mode Bottom Dock -->
      <div class="weekly-bottom-dock"
           :class="{ 'drag-over': dragOverTarget?.type === 'unschedule' }"
           @dragover="handleDragOver($event, { type: 'unschedule', dateKey: selectedTimelineDay.dateKey })"
           @dragleave="handleDragLeave"
           @drop="handleDrop($event, { type: 'unschedule', dateKey: selectedTimelineDay.dateKey })">
        
        <div v-if="filteredTimelinePendingTasks.length === 0" class="dock-empty">
          <IconCalendarCheck :size="16" :stroke-width="1.8" style="vertical-align: -3px; margin-right: 4px;" />本周待排期任务已全部安排妥当！
        </div>
        
        <div class="dock-tasks-container" v-else>
          <div
            v-for="task in filteredTimelinePendingTasks"
            :key="task.id"
            class="pending-pill"
            :class="{ 'is-dragging': dragSession?.taskId === task.id }"
            draggable="true"
            @dragstart.stop="handleDragStart($event, task)"
            @dragend.stop="clearDragState"
          >
            <span class="pill-name">{{ task.name }}</span>
            <span class="pill-duration" :style="{ color: 'var(--color-primary-accent)' }">{{ task.duration }}m</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Creation Modal -->
    <TaskCreateDialog
      v-model="taskDialogVisible"
      :saving="isCreatingTask"
      @submit="handleCreateTask"
    />

    <!-- Related Knowledge Block Preview Dialog -->
    <KnowledgeBlockViewDialog
      v-model="blockDialogVisible"
      :block="selectedBlock"
      @copy="copyBlockContent"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElNotification, ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message-box.css'
import {
  IconListCheck,
  IconCircleCheck,
  IconClock,
  IconInbox,
  IconPlus,
  IconCalendarCheck,
  IconX
} from '@tabler/icons-vue'

import { useTaskStore, type Task } from '@/store/useTaskStore'
import { useSyncStore } from '@/store/useSyncStore'
import { getTimelineDays, isCompletedScheduledTask, comparePendingTasks, parseDueTimestamp } from '@/services/taskViewRules'
import { timelineDateKey, type TimelineDropIntent, type TimelineDropTarget } from '@/services/taskSchedulePlanner'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import TaskCreateDialog from '@/components/task/TaskCreateDialog.vue'
import KnowledgeBlockViewDialog from '@/components/knowledge/KnowledgeBlockViewDialog.vue'

const taskStore = useTaskStore()
const syncStore = useSyncStore()
const { pendingTasks, allTasks, timeSlots, selectedDay, completedCount, pendingCount, totalFocusHours } = storeToRefs(taskStore)

const subjectStore = useSubjectStore()
const knowledgeStore = useKnowledgeStore()
const { recentBlocks } = storeToRefs(knowledgeStore)

// Core timeline states
const viewMode = ref<'day' | 'week'>('day')
const timelineDays = computed(() => getTimelineDays(taskStore.currentNow))

const nextWeekNow = computed(() => {
  const d = new Date(taskStore.currentNow)
  d.setDate(d.getDate() + 7)
  return d
})
const nextWeekTimelineDays = computed(() => getTimelineDays(nextWeekNow.value))
const allTimelineDays = computed(() => [...timelineDays.value, ...nextWeekTimelineDays.value])

const selectedTimelineDay = computed(() => {
  return allTimelineDays.value.find((day) => day.dateKey === selectedDay.value)
    ?? timelineDays.value.find((day) => day.dayCode === selectedDay.value)
    ?? timelineDays.value.find((day) => day.isToday)
    ?? timelineDays.value[0]
})

watch(selectedTimelineDay, (day) => {
  if (day.dateKey !== selectedDay.value && day.dayCode !== selectedDay.value) {
    taskStore.setSelectedDay(day.dayCode, day.dateKey)
  }
}, { immediate: true })

const selectDay = async (dayCode: string, dateKey: string) => {
  taskStore.setSelectedDay(dayCode, dateKey)
  await taskStore.loadLocalTasks()
}

const getScheduledTasksForDateKey = (dateKey: string) => {
  return allTasks.value.filter((task) => task.status !== 'cancelled' && timelineDateKey(task.scheduledAt) === dateKey)
}

const getPendingScheduledTasksForDateKey = (dateKey: string) => {
  return getScheduledTasksForDateKey(dateKey).filter(task => !isCompletedScheduledTask(task))
}

const getTaskTimeStr = (startTime?: string) => {
  if (!startTime) return ''
  return startTime.split(' ').pop() || ''
}

const nowTimestamp = ref(Date.now())
let pastTaskRefreshTimer: number | undefined

const isPastTask = (task: { scheduledAt?: string } | null | undefined): boolean => {
  if (!task?.scheduledAt) return false
  const scheduledTimestamp = Date.parse(task.scheduledAt)
  return Number.isFinite(scheduledTimestamp) && scheduledTimestamp < nowTimestamp.value
}

const TIMELINE_SLOT_HEIGHT = 80
const TIMELINE_SLOT_GAP = 4
const TIMELINE_TASK_BOTTOM_GAP = 6

const getTaskHeight = (duration?: number) => {
  const d = duration || 30
  const slots = Math.max(1, d / 30)
  return `${slots * TIMELINE_SLOT_HEIGHT + (slots - 1) * TIMELINE_SLOT_GAP - TIMELINE_TASK_BOTTOM_GAP}px`
}

const isSlotCovered = (slotTime: string) => {
  const targetSlot = timeSlots.value.find(s => s.time === slotTime)
  if (targetSlot?.task) return false

  const [slotHour, slotMinute] = slotTime.split(':').map(Number)
  const currentMinutes = slotHour * 60 + slotMinute
  for (const slot of timeSlots.value) {
    if (slot.task && slot.time !== slotTime) {
      const [taskHour, taskMinute] = slot.time.split(':').map(Number)
      const taskStartMinutes = taskHour * 60 + taskMinute
      const taskEndMinutes = taskStartMinutes + slot.task.duration
      if (currentMinutes > taskStartMinutes && currentMinutes < taskEndMinutes) {
        return true
      }
    }
  }
  return false
}

onMounted(async () => {
  pastTaskRefreshTimer = window.setInterval(() => {
    nowTimestamp.value = Date.now()
  }, 60_000)
  await taskStore.fetchTasks()
  await subjectStore.loadSubjects()
  await knowledgeStore.fetchBlocks()
})

onUnmounted(() => {
  if (pastTaskRefreshTimer !== undefined) window.clearInterval(pastTaskRefreshTimer)
})

const stats = computed(() => [
  { icon: IconListCheck, value: pendingCount.value.toString(), label: '待排期' },
  { icon: IconCircleCheck, value: completedCount.value.toString(), label: '已完成' },
  { icon: IconClock, value: totalFocusHours.value, label: '已完成任务预计用时' }
])

const filteredTimelinePendingTasks = computed(() => {
  return [...pendingTasks.value].sort(comparePendingTasks)
})

const TASK_DRAG_TYPE = 'application/x-auralis-timeline-task'
type DropTarget = TimelineDropTarget & Pick<TimelineDropIntent, 'dateKey'>
interface DragSession {
  taskId: string
  sourceScheduledAt: string | null
  sourceSlotTime?: string
}

const dragSession = ref<DragSession | null>(null)
const dragOverTarget = ref<DropTarget | null>(null)

const handleDragStart = (event: DragEvent, task: Task, sourceSlotTime?: string) => {
  if (!event.dataTransfer || isCompletedScheduledTask(task)) {
    event.preventDefault()
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(TASK_DRAG_TYPE, task.id)
  dragSession.value = { taskId: task.id, sourceScheduledAt: task.scheduledAt ?? null, sourceSlotTime }
}

const handleDragOver = (event: DragEvent, target: DropTarget) => {
  const session = dragSession.value
  if (!session || !event.dataTransfer?.types.includes(TASK_DRAG_TYPE)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'

  const targetTask = 'targetTaskId' in target
    ? allTasks.value.find((task) => task.id === target.targetTaskId)
    : undefined
  const invalidSwap = target.type === 'swap'
    && (!session.sourceScheduledAt || (targetTask && isCompletedScheduledTask(targetTask)))
  dragOverTarget.value = isSamePlacement(session, target) || invalidSwap ? null : target
}

const handleDragLeave = (event: DragEvent) => {
  if (event.currentTarget instanceof HTMLElement
    && event.relatedTarget instanceof Node
    && event.currentTarget.contains(event.relatedTarget)) return
  dragOverTarget.value = null
}

const bodyDropHint = computed(() => {
  const target = dragOverTarget.value
  const session = dragSession.value
  if (!session || target?.type !== 'body') return ''
  const preview = taskStore.previewTimelineDrop({
    ...target,
    taskId: session.taskId,
    sourceScheduledAt: session.sourceScheduledAt,
  })
  if (preview.error) return preview.error
  if (!preview.scheduledAt) return '已在目标时段'
  const date = new Date(preview.scheduledAt)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `插入至 ${time}`
})

const clearDragState = () => {
  dragSession.value = null
  dragOverTarget.value = null
}

const handleDrop = async (event: DragEvent, target: DropTarget) => {
  const session = dragSession.value
  clearDragState()
  if (!session || event.dataTransfer?.getData(TASK_DRAG_TYPE) !== session.taskId) return
  event.preventDefault()
  if (isSamePlacement(session, target)) return

  try {
    const result = await taskStore.applyTimelineDrop({
      ...target,
      dateKey: target.type === 'unschedule'
        ? timelineDateKey(session.sourceScheduledAt ?? undefined) ?? target.dateKey
        : target.dateKey,
      taskId: session.taskId,
      sourceScheduledAt: session.sourceScheduledAt,
    })
    if (result === 'queued') reportScheduleQueued()
  } catch (error) {
    reportDragFailure(error)
  }
}

const isSamePlacement = (session: DragSession, target: DropTarget): boolean => {
  if ('targetTaskId' in target) return session.taskId === target.targetTaskId
  if (target.type === 'unschedule') return !session.sourceScheduledAt

  const sourceDate = timelineDateKey(session.sourceScheduledAt ?? undefined)
  return sourceDate === target.dateKey
    && (target.type === 'week' || target.slotTime === session.sourceSlotTime)
}

const reportDragFailure = (error: unknown) => {
  ElNotification({
    title: '排期未保存',
    message: error instanceof Error ? error.message : '本地保存失败，请重试。',
    type: 'error',
    position: 'top-right',
  })
}

const reportScheduleQueued = () => {
  ElNotification({
    title: '排期已保存在本机',
    message: '等待网络连接后同步。',
    type: 'info',
    position: 'top-right',
  })
}

watch(() => syncStore.scheduleSyncErrors, (errors) => {
  for (const error of errors) {
    const message = error.code === 'RESOURCE_VERSION_CONFLICT'
      ? '排期已在其他设备发生变化，本机安排已按服务器数据恢复。'
      : error.code === 'VALIDATION_FAILED'
        ? '排期未通过服务器校验，本机安排已按服务器数据恢复。'
        : error.code === 'SCHEDULE_REFRESH_REQUIRED'
          ? '排期结果需要重新读取，任务已从服务器刷新。'
          : `排期同步失败（${error.code}），本机安排已恢复。`
    ElNotification({ title: '排期同步失败', message, type: 'error', position: 'top-right' })
    syncStore.acknowledgeScheduleSyncError(error.clientMutationId)
  }
}, { immediate: true })

// Bidirectional Relation Parsing helpers
const getTaskIdRelation = (desc?: string): string | null => {
  if (!desc) return null
  const match = desc.match(/\[KB_ID:(.+?)\]/)
  return match ? match[1] : null
}

const getCleanDesc = (desc?: string): string => {
  if (!desc) return ''
  return desc.replace(/\[KB_ID:(.+?)\]/, '').trim()
}

const getBlockTitle = (blockId: string): string => {
  const block = recentBlocks.value.find(b => b.id === blockId)
  return block ? block.title : '已删除知识点'
}

const isTaskOverdue = (dueAt?: string): boolean => {
  if (!dueAt) return false
  const due = parseDueTimestamp(dueAt)
  return Number.isFinite(due) && due < taskStore.currentNow.getTime()
}

const formatTaskDue = (dueAt?: string): string => {
  if (!dueAt) return ''
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} 截止`
}

// Related Block Detail Dialog trigger
const blockDialogVisible = ref(false)
const selectedBlock = ref<any>(null)

const openRelatedBlock = (blockId: string) => {
  const block = recentBlocks.value.find(b => b.id === blockId)
  if (block) {
    selectedBlock.value = block
    blockDialogVisible.value = true
  } else {
    ElNotification({
      title: '⚠️ 无法查看',
      message: '该关联知识块已被删除。',
      type: 'warning',
      position: 'top-right'
    })
  }
}

const copyBlockContent = (text: string) => {
  navigator.clipboard.writeText(text)
  ElNotification({
    title: '📋 已复制',
    message: '内容已成功复制。',
    type: 'success',
    position: 'top-right',
    duration: 2000
  })
}

// Router & Modal actions
const router = useRouter()
const taskDialogVisible = ref(false)
const isCreatingTask = ref(false)
const deletingTaskId = ref<string | null>(null)

const triggerImport = () => {
  router.push('/asset?focus=unassigned-tasks')
}

const triggerCreate = () => {
  taskDialogVisible.value = true
}

const handleCreateTask = async (taskData: {
  name: string
  subjectId: string
  subjectName: string
  duration: number
  dueAt?: string
  desc?: string
}) => {
  if (isCreatingTask.value || !taskDialogVisible.value) return
  isCreatingTask.value = true
  try {
    await taskStore.addTask({
      name: taskData.name,
      subject: taskData.subjectName,
      duration: taskData.duration || 60,
      desc: taskData.desc?.trim() ?? '',
      status: 'pending',
      subjectId: taskData.subjectId,
      dueAt: taskData.dueAt,
    })
    taskDialogVisible.value = false
  } catch (error) {
    ElNotification({
      title: '创建任务失败',
      message: error instanceof Error ? error.message : '任务保存失败，请重试。',
      type: 'error',
      position: 'top-right',
    })
  } finally {
    isCreatingTask.value = false
  }
}

const handleDeleteTask = async (task: Task) => {
  if (deletingTaskId.value) return
  const { id, name } = task
  deletingTaskId.value = id
  try {
    await ElMessageBox.confirm(
      `确定要删除任务「${name}」吗？`,
      '删除提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true,
        type: 'warning',
      }
    )
    await taskStore.deleteTask(id)
    ElNotification({
      title: '任务已删除',
      message: `任务「${name}」已移除。`,
      type: 'success',
      position: 'top-right',
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElNotification({
      title: '删除任务失败',
      message: error instanceof Error ? error.message : '任务删除失败，请重试。',
      type: 'error',
      position: 'top-right',
    })
  } finally {
    deletingTaskId.value = null
  }
}
</script>

<style scoped>
/* ==========================================================================
   Auralis Timeline — Awwwards / Webby / FWA Precision Craftsmanship System
   Zen Minimalist Tea-House & Xuan Paper Atmosphere · Sage Green Accent
   ========================================================================== */

/* Keyframe Animations for Micro-Interactions */
@keyframes sage-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(139, 154, 110, 0.45);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(139, 154, 110, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(139, 154, 110, 0);
  }
}

@keyframes subtle-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2.5px); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scale-up {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* 1. Main Page Canvas */
.timeline-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 16px 20px 20px;
  gap: 14px;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--color-bg-secondary, #EEEEEE);
  color: var(--text-primary);
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* Zen Sage Theme Tokens - 统一全局规范 */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #78875B;
  --color-primary-light: rgba(139, 154, 110, 0.12);
  --color-primary-glow: rgba(139, 154, 110, 0.24);
  --color-primary-border: rgba(139, 154, 110, 0.22);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #7E8E62 100%);
  --accent-gradient-hover: linear-gradient(135deg, #8B9A6E 0%, #6E7D53 100%);
  --surface-panel: var(--color-bg-primary, #F7F2EB);
  --surface-card: var(--color-bg-tertiary, #FAF7F2);
  --surface-card-hover: #FFFFFF;
  --border-glass: var(--border-subtle, rgba(0, 0, 0, 0.08));
  --shadow-ambient: 0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04);
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.025);
  --shadow-card-hover: 0 6px 18px rgba(35, 45, 30, 0.06);
  --spring-ease: cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .timeline-page {
  background: var(--color-bg-secondary, #1B201B);
  --surface-panel: #1F241F;
  --surface-card: #252B25;
  --surface-card-hover: #2E362E;
  --border-glass: rgba(163, 177, 155, 0.16);
  --shadow-ambient: 0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35);
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.25);
  --shadow-card-hover: 0 8px 24px rgba(0, 0, 0, 0.45);
}

/* 2. Top Header Navigation Card */
.timeline-header-card {
  background: var(--surface-panel);
  border-radius: 18px;
  border: 1px solid var(--border-glass);
  box-shadow: var(--shadow-ambient);
  padding: 14px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: border-color 0.25s var(--spring-ease), box-shadow 0.25s var(--spring-ease);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header-left {
  flex-shrink: 0;
}

.page-headline {
  font-size: 21px;
  font-weight: 850;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Middle Stats: Editorial Glass Pills */
.header-middle-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 16px;
  flex: 1;
  justify-content: flex-start;
  min-width: 0;
}

.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: rgba(139, 154, 110, 0.06);
  border-radius: 9999px;
  border: 0.5px solid var(--border-glass);
  font-size: 12.5px;
  box-shadow: 0 2px 6px rgba(35, 45, 30, 0.05);
  transition: transform 0.2s var(--spring-ease), border-color 0.2s var(--spring-ease), box-shadow 0.2s var(--spring-ease), background 0.2s;
  cursor: default;
  user-select: none;
  white-space: nowrap;
}

.stat-pill:hover {
  background: rgba(139, 154, 110, 0.12);
  border-color: var(--color-primary-accent);
  transform: translateY(-1.5px);
  box-shadow: 0 4px 14px -1px rgba(139, 154, 110, 0.22);
}

.stat-icon {
  color: var(--color-primary-accent);
  flex-shrink: 0;
  transition: transform 0.2s var(--spring-ease);
}

.stat-pill:hover .stat-icon {
  transform: scale(1.1);
}

.stat-value {
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.stat-label {
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 12px;
}

/* Header Actions & Segmented Control */
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.view-toggle {
  display: flex;
  background: rgba(139, 154, 110, 0.08);
  border: 0.5px solid var(--border-glass);
  border-radius: 9999px;
  padding: 3px;
  gap: 3px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
}

.toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 13px;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: all 0.22s var(--spring-ease);
  line-height: 1.25;
  user-select: none;
}

.toggle-btn:hover:not(.is-active) {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.1);
}

.toggle-btn.is-active {
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--color-primary-accent);
  font-weight: 750;
  box-shadow: 0 2px 6px rgba(35, 45, 30, 0.08);
}

html.dark .toggle-btn.is-active {
  background: #2D352D;
  color: #D6E2D0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}

.btn-primary,
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 15px;
  border-radius: 11px;
  font-size: 12.5px;
  font-weight: 650;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.2s var(--spring-ease), box-shadow 0.2s var(--spring-ease), background 0.2s, border-color 0.2s;
  user-select: none;
}

.btn-primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
  border: none;
  box-shadow: 0 3px 10px rgba(126, 142, 98, 0.32), 0 1px 3px rgba(0, 0, 0, 0.06);
}

.btn-primary:hover {
  background: var(--accent-gradient-hover);
  transform: translateY(-1.5px);
  box-shadow: 0 6px 18px rgba(126, 142, 98, 0.42);
}

.btn-primary:active {
  transform: scale(0.96);
}

.btn-primary :deep(svg) {
  transition: transform 0.22s var(--spring-ease);
}

.btn-primary:hover :deep(svg) {
  transform: rotate(90deg);
}

.btn-secondary {
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  border: 0.5px solid var(--border-default, #E6E6E4);
  box-shadow: 0 1px 3px rgba(35, 45, 30, 0.04);
}

html.dark .btn-secondary {
  background: #252B25;
  border-color: rgba(163, 177, 155, 0.22);
}

.btn-secondary:hover {
  transform: translateY(-1.5px);
  border-color: var(--color-primary-accent);
  color: var(--text-primary);
  background: var(--surface-card-hover);
  box-shadow: 0 5px 14px -2px rgba(139, 154, 110, 0.22);
}

.btn-secondary:active {
  transform: scale(0.96);
}

/* 3. Day Mode Layout (3-Column Architecture) */
.timeline-body,
.weekly-view-container {
  user-select: none;
}

.timeline-body {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(360px, 1fr) minmax(270px, 370px);
  gap: 14px;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.timeline-column,
.tasks-column,
.weekly-overview-column {
  background: var(--surface-panel);
  border-radius: 18px;
  border: 0.5px solid var(--border-glass);
  box-shadow: var(--shadow-ambient);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  transition: border-color 0.25s var(--spring-ease), box-shadow 0.25s var(--spring-ease);
}

.column-title {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--text-primary);
  letter-spacing: -0.015em;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-transform: none;
}

.next-week-title {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 0.5px dashed var(--border-glass);
}

/* 4. Left Column: Weekly Overview */
.weekly-overview-column {
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.weekly-overview-column::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.weekly-overview-column .weekly-overview-list {
  flex: none;
  overflow-y: visible;
}

.weekly-overview-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weekly-overview-row {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 11px 14px;
  background: var(--surface-card);
  border: 0.5px solid var(--border-glass);
  border-radius: 13px;
  cursor: pointer;
  box-shadow: 0 3px 10px -1px rgba(35, 45, 30, 0.08), 0 1px 4px rgba(0, 0, 0, 0.03);
  transition: transform 0.2s var(--spring-ease), box-shadow 0.2s var(--spring-ease), border-color 0.2s, background 0.2s;
  position: relative;
  overflow: hidden;
}

.weekly-overview-row:hover {
  background: var(--surface-card-hover);
  border-color: rgba(139, 154, 110, 0.45);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px -2px rgba(35, 45, 30, 0.14);
}

.weekly-overview-row.is-active {
  border-color: var(--color-primary-accent);
  border-left: 4px solid var(--color-primary-accent);
  background: rgba(139, 154, 110, 0.12);
  box-shadow: 0 4px 14px -1px rgba(139, 154, 110, 0.30), 0 2px 6px rgba(0, 0, 0, 0.06);
}

.weekly-overview-row.is-today:not(.is-active) {
  border-color: rgba(139, 154, 110, 0.45);
  background: rgba(139, 154, 110, 0.06);
  box-shadow: 0 3px 10px -1px rgba(139, 154, 110, 0.14);
}

.weekly-overview-row-header {
  display: flex;
  align-items: center;
  gap: 7px;
}

.weekly-overview-day-name {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.weekly-overview-row.is-active .weekly-overview-day-name {
  font-weight: 800;
  color: var(--color-primary-accent);
}

.weekly-overview-task-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: auto;
  background: rgba(139, 154, 110, 0.09);
  padding: 2px 7px;
  border-radius: 9999px;
  font-variant-numeric: tabular-nums;
}

.day-dot {
  background: var(--color-primary-accent);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 800;
  padding: 1.5px 5px;
  border-radius: 5px;
  line-height: 1.1;
  box-shadow: 0 1px 3px rgba(139, 154, 110, 0.3);
}

.weekly-overview-row.is-today .day-dot {
  animation: sage-pulse 2.2s infinite;
}

.is-today-text {
  color: var(--color-primary-accent);
  font-weight: 750;
}

.weekly-overview-tasks-timeline {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 12px;
}

.weekly-overview-task-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-shadow: 0 0 5px rgba(139, 154, 110, 0.5);
  transition: transform 0.2s var(--spring-ease);
}

.weekly-overview-row:hover .weekly-overview-task-dot {
  transform: scale(1.15);
}

.weekly-overview-more {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}

.weekly-overview-empty {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* 5. Middle Column: Day Time Flow 
   CRITICAL NOTE:
   - TIMELINE_SLOT_HEIGHT = 80px (strictly fixed)
   - TIMELINE_SLOT_GAP = 4px (strictly fixed)
   - Task card inline height formula: slots * 80 + (slots - 1) * 4 - 6
   - Must strictly match gap: 4px and height: 80px to preserve placement physics!
*/
.timeline-column {
  position: relative;
}

.time-slots {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 6px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.time-slots::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.time-slot {
  display: flex;
  align-items: stretch;
  gap: 14px;
  box-sizing: content-box;
  height: 80px; /* Strictly matches TIMELINE_SLOT_HEIGHT = 80 */
  min-height: 80px;
  flex-shrink: 0;
  position: relative;
}

.time-slot:not(:last-child) {
  /* Keep the visible spacing inside the drop target. */
  padding-bottom: 4px;
}

.slot-time {
  width: 48px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-secondary);
  padding-top: 6px;
  flex-shrink: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  user-select: none;
  letter-spacing: -0.01em;
  opacity: 0.85;
  transition: color 0.18s, opacity 0.18s;
}

.time-slot:hover .slot-time {
  color: var(--text-primary);
  opacity: 1;
}

.slot-right-container {
  flex: 1;
  position: relative;
  height: 100%;
}

.slot-grid-line {
  position: absolute;
  top: 14px;
  left: 0;
  right: 0;
  height: 1px;
  border-top: 0.5px dashed rgba(139, 154, 110, 0.16);
  pointer-events: none;
  z-index: 1;
  transition: border-color 0.2s;
}

.time-slot:hover .slot-grid-line {
  border-top-color: rgba(139, 154, 110, 0.28);
}

html.dark .slot-grid-line {
  border-top: 0.5px dashed rgba(139, 154, 110, 0.15);
}

.slot-empty {
  height: 100%;
  width: 100%;
  border-radius: 12px;
  border: 0.5px solid transparent;
  transition: background 0.2s var(--spring-ease), border-color 0.2s var(--spring-ease);
}

.time-slot:hover .slot-empty {
  background: rgba(139, 154, 110, 0.025);
  border: 0.5px dashed rgba(139, 154, 110, 0.16);
}

.time-slot.drag-over .slot-empty {
  background: rgba(139, 154, 110, 0.09) !important;
  border: 1.5px dashed var(--color-primary-accent) !important;
  box-shadow: 0 0 16px rgba(139, 154, 110, 0.14);
}

.time-slot.drag-over .slot-task {
  opacity: 0.5;
}

/* Current Time Needle */
.is-current .slot-time {
  color: var(--color-primary-accent);
  font-weight: 850;
  opacity: 1;
}

.current-indicator {
  position: absolute;
  left: 62px;
  right: 0;
  top: 14px;
  display: flex;
  align-items: center;
  pointer-events: none;
  z-index: 25;
}

.current-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-primary-accent);
  flex-shrink: 0;
  margin-left: -4.5px;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.25);
  animation: sage-pulse 2s infinite;
}

.current-line {
  flex: 1;
  height: 1.5px;
  background: linear-gradient(90deg, var(--color-primary-accent) 0%, rgba(139, 154, 110, 0.4) 60%, rgba(139, 154, 110, 0) 100%);
}

/* Scheduled Task Card in Time Slot - Elevated Layering */
.slot-task {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 10px 14px;
  background: var(--surface-card);
  border: 0.5px solid var(--border-glass);
  border-left: 4px solid var(--color-primary-accent);
  border-radius: 13px;
  box-shadow: var(--shadow-card);
  cursor: grab;
  transition: transform 0.2s var(--spring-ease), box-shadow 0.2s var(--spring-ease), border-color 0.2s;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 10;
  box-sizing: border-box;
  overflow: hidden;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.slot-task:hover {
  box-shadow: var(--shadow-card-hover);
  border-color: rgba(139, 154, 110, 0.45);
  transform: translateY(-2px);
}

.slot-task:active {
  cursor: grabbing;
}

.slot-task.is-insert-drop-target {
  outline: 2px dashed var(--color-primary-accent);
  outline-offset: -3px;
  background: rgba(139, 154, 110, 0.1);
}

.task-body-drop-hint {
  position: absolute;
  right: 10px;
  bottom: 7px;
  max-width: calc(100% - 20px);
  padding: 2.5px 8px;
  border-radius: 6px;
  color: var(--color-primary-accent);
  background: var(--surface-panel);
  border: 0.5px solid var(--border-glass);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  pointer-events: none;
  white-space: nowrap;
}

.task-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 3px 6px;
  margin: -3px -6px;
  transition: background-color 150ms var(--spring-ease), box-shadow 150ms var(--spring-ease);
  cursor: grab;
  width: fit-content;
  max-width: 100%;
}

.task-header.is-drop-target {
  background: rgba(139, 154, 110, 0.22);
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.45);
}

.task-name {
  font-size: 13px;
  font-weight: 750;
  color: var(--text-primary);
  pointer-events: none;
  letter-spacing: -0.01em;
}

.task-tag {
  background: rgba(139, 154, 110, 0.16);
  color: #384A30;
  border: 0.5px solid rgba(139, 154, 110, 0.32);
  padding: 2px 7px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 750;
  pointer-events: none;
}

html.dark .task-tag {
  color: #D6E2D0;
  background: rgba(139, 154, 110, 0.2);
  border-color: rgba(139, 154, 110, 0.35);
}

.task-delete-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 3px 5px;
  border-radius: 6px;
  pointer-events: auto;
  opacity: 0.35;
  transition: all 0.18s var(--spring-ease);
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-task:hover .task-delete-btn,
.weekly-task-card:hover .card-delete-btn {
  opacity: 0.85;
}

.task-delete-btn:hover,
.card-delete-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
  transform: scale(1.1);
}

.task-detail {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Knowledge Block Link Badge */
.kb-relation-badge {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  font-size: 12px;
  font-weight: 650;
  background: rgba(197, 168, 128, 0.16);
  color: #8C6A3D;
  border: 0.5px solid rgba(197, 168, 128, 0.32);
  padding: 2.5px 8px;
  border-radius: 9999px;
  cursor: pointer;
  margin-top: 3px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.04);
  transition: all 0.2s var(--spring-ease);
}

html.dark .kb-relation-badge {
  color: #E2C9A3;
  background: rgba(197, 168, 128, 0.18);
}

.kb-relation-badge:hover {
  background: rgba(197, 168, 128, 0.26);
  transform: scale(1.02);
  box-shadow: 0 3px 8px rgba(197, 168, 128, 0.28);
}

.kb-relation-badge.mini {
  margin-top: 5px;
  font-size: 11.5px;
  padding: 1.5px 7px;
}

/* 6. Right Column: Pending Tasks Pool */
.pending-tasks {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-bottom: 16px;
  transition: background 0.2s var(--spring-ease);
  border-radius: 14px;
  position: relative;
  flex: 1 1 0%;
  height: 0;
  overflow-y: auto;
  min-height: 0;
  padding-right: 5px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.pending-tasks::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.pending-tasks.drag-over {
  background: rgba(139, 154, 110, 0.08);
  outline: 1.5px dashed var(--color-primary-accent);
  outline-offset: -2px;
}

.pending-empty-state {
  position: absolute;
  top: 48px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary-accent);
  opacity: 0.55;
  animation: subtle-float 3s ease-in-out infinite;
}

.pending-card {
  flex: 0 0 auto;
  min-height: max-content;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  background: var(--surface-card);
  border: 0.5px solid var(--border-glass);
  border-radius: 14px;
  cursor: grab;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: transform 0.2s var(--spring-ease), box-shadow 0.2s var(--spring-ease), border-color 0.2s, opacity 0.2s;
}

.pending-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-accent);
  background: var(--surface-card-hover);
  box-shadow: var(--shadow-card-hover);
}

.pending-card:active {
  cursor: grabbing;
}

.pending-card.is-dragging {
  opacity: 0.25;
  border-style: dashed;
  background: transparent;
  transform: none;
  box-shadow: none;
}

.pending-color {
  width: 4px;
  height: 38px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.pending-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.pending-name {
  font-size: 13px;
  font-weight: 750;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.pending-subject {
  background: rgba(139, 154, 110, 0.16);
  color: #384A30;
  border: 0.5px solid rgba(139, 154, 110, 0.32);
  padding: 2px 7px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 750;
  align-self: flex-start;
  margin-top: 4px;
}

html.dark .pending-subject {
  color: #D6E2D0;
  background: rgba(139, 154, 110, 0.18);
  border-color: rgba(139, 154, 110, 0.3);
}

.pending-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.pending-due-badge {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(139, 154, 110, 0.08);
  padding: 1.5px 7px;
  border-radius: 6px;
  white-space: nowrap;
}

.pending-due-badge.is-overdue {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
  border: 0.5px solid rgba(239, 68, 68, 0.25);
  font-weight: 700;
}

html.dark .pending-due-badge.is-overdue {
  color: #f87171;
  background: rgba(239, 68, 68, 0.22);
}

.drag-handle {
  color: var(--text-muted);
  font-size: 16px;
  opacity: 0.3;
  transition: opacity 0.2s;
  user-select: none;
}

.pending-card:hover .drag-handle {
  opacity: 0.8;
  color: var(--color-primary-accent);
}

/* 7. Week Mode Architecture */
.weekly-view-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 14px;
  min-height: 0;
  width: 100%;
}

.weekly-view-body {
  flex: 3;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 10px;
  width: 100%;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.weekly-view-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.weekly-column {
  background: var(--surface-panel);
  border: 0.5px solid var(--border-glass);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 480px;
  box-shadow: var(--shadow-ambient);
  transition: all 0.25s var(--spring-ease);
  box-sizing: border-box;
}

.weekly-column.drag-over,
.weekly-column.drag-over-column {
  background: rgba(139, 154, 110, 0.09) !important;
  border-color: var(--color-primary-accent) !important;
  box-shadow: 0 0 16px rgba(139, 154, 110, 0.2);
}

.weekly-column.is-today {
  border-color: var(--color-primary-accent);
  background: var(--surface-panel);
  box-shadow: 0 8px 24px -2px rgba(139, 154, 110, 0.22), inset 0 0 0 1px var(--color-primary-accent);
}

.weekly-column-header {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 0.5px solid var(--border-glass);
  padding-bottom: 8px;
}

.weekly-column-title {
  font-size: 12.5px;
  font-weight: 750;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.weekly-column-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-left: auto;
  background: rgba(139, 154, 110, 0.1);
  padding: 1.5px 6px;
  border-radius: 9999px;
  font-variant-numeric: tabular-nums;
}

.weekly-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.weekly-tasks-list::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.weekly-task-card {
  flex-shrink: 0;
  background: var(--surface-card);
  border: 0.5px solid var(--border-glass);
  border-left: 3.5px solid var(--color-primary-accent);
  border-radius: 12px;
  padding: 10px 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 3px 12px -2px rgba(35, 45, 30, 0.10), 0 1px 4px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s var(--spring-ease), box-shadow 0.2s var(--spring-ease), border-color 0.2s;
  cursor: grab;
}

.weekly-task-card:hover {
  transform: translateY(-2px);
  border-color: rgba(139, 154, 110, 0.45);
  box-shadow: 0 8px 22px -3px rgba(35, 45, 30, 0.16), 0 3px 8px rgba(139, 154, 110, 0.22);
}

.weekly-task-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 4px;
}

.weekly-task-name {
  font-size: 12px;
  font-weight: 750;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-all;
}

.card-delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  pointer-events: auto;
  transition: all 0.15s;
}

.weekly-task-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  flex-wrap: wrap;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.weekly-task-time {
  white-space: nowrap;
}

.weekly-task-tag {
  background: rgba(139, 154, 110, 0.16);
  color: #384A30;
  border: 0.5px solid rgba(139, 154, 110, 0.32);
  padding: 1.5px 6px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 750;
  max-width: 65px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html.dark .weekly-task-tag {
  color: #D6E2D0;
  background: rgba(139, 154, 110, 0.2);
}

/* Week Mode Bottom Dock */
.weekly-bottom-dock {
  background: var(--surface-panel);
  border-radius: 18px;
  padding: 16px 20px;
  box-shadow: var(--shadow-ambient);
  flex: 1;
  min-height: 130px;
  display: flex;
  flex-direction: column;
  border: 0.5px solid var(--border-glass);
  transition: all 0.22s var(--spring-ease);
  overflow-y: auto;
}

.weekly-bottom-dock.drag-over {
  border-color: var(--color-primary-accent);
  background: rgba(139, 154, 110, 0.08);
}

.dock-empty {
  margin: auto;
  font-size: 13.5px;
  color: var(--text-muted);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.dock-tasks-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pending-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: var(--surface-card);
  border: 0.5px solid var(--border-glass);
  border-radius: 9999px;
  cursor: grab;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(35, 45, 30, 0.09), 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s var(--spring-ease), box-shadow 0.2s var(--spring-ease), border-color 0.2s;
}

.pending-pill:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-accent);
  background: var(--surface-card-hover);
  box-shadow: 0 6px 18px rgba(139, 154, 110, 0.25);
}

.pending-pill.is-dragging {
  opacity: 0.25;
  border-style: dashed;
  background: transparent;
  transform: none;
  box-shadow: none;
}

.pill-duration {
  font-size: 12px;
  font-weight: 700;
  opacity: 0.9;
  font-variant-numeric: tabular-nums;
}

/* 8. Completed Task Presentation Rules */
.slot-task.is-completed,
.weekly-task-card.is-completed {
  opacity: 0.55;
  filter: grayscale(85%);
}

.slot-task.is-completed .task-name,
.weekly-task-card.is-completed .weekly-task-name {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* ===== Responsive Adaptation ===== */
@media (max-width: 1280px) {
  .timeline-page {
    padding: 12px 14px 14px;
    gap: 10px;
  }
  .timeline-header-card {
    padding: 12px 16px;
  }
  .timeline-body {
    grid-template-columns: 240px 1fr 310px;
    gap: 10px;
  }
  .timeline-column,
  .tasks-column,
  .weekly-overview-column {
    padding: 14px 16px;
  }
}

@media (max-width: 1080px) {
  .timeline-page {
    padding: 10px 12px 12px;
    gap: 8px;
  }
  .timeline-body {
    grid-template-columns: 210px 1fr 270px;
    gap: 8px;
  }
  .timeline-column,
  .tasks-column,
  .weekly-overview-column {
    padding: 12px 14px;
  }
  .stat-pill {
    padding: 0 8px;
    height: 28px;
  }
}
</style>
