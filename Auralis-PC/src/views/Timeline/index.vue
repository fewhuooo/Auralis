<template>
  <div class="timeline-page">
    <!-- Timeline Header Card -->
    <div class="timeline-header-card">
      <!-- Page header -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="page-headline">任务编排中心</h1>
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
              <span class="weekly-overview-task-count">{{ getScheduledTasksForDateKey(day.dateKey).length }} 项任务</span>
            </div>
            <div class="weekly-overview-tasks-timeline">
              <div 
                v-for="task in getScheduledTasksForDateKey(day.dateKey).slice(0, 3)"
                :key="task.id" 
                class="weekly-overview-task-dot"
                :style="{ backgroundColor: 'var(--color-primary-accent)' }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name}`"
              ></div>
              <span v-if="getScheduledTasksForDateKey(day.dateKey).length > 3" class="weekly-overview-more">+{{ getScheduledTasksForDateKey(day.dateKey).length - 3 }}</span>
              <span v-if="getScheduledTasksForDateKey(day.dateKey).length === 0" class="weekly-overview-empty">空闲</span>
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
              <span class="weekly-overview-task-count">{{ getScheduledTasksForDateKey(day.dateKey).length }} 项任务</span>
            </div>
            <div class="weekly-overview-tasks-timeline">
              <div 
                v-for="task in getScheduledTasksForDateKey(day.dateKey).slice(0, 3)"
                :key="task.id" 
                class="weekly-overview-task-dot"
                :style="{ backgroundColor: 'var(--color-primary-accent)' }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name}`"
              ></div>
              <span v-if="getScheduledTasksForDateKey(day.dateKey).length > 3" class="weekly-overview-more">+{{ getScheduledTasksForDateKey(day.dateKey).length - 3 }}</span>
              <span v-if="getScheduledTasksForDateKey(day.dateKey).length === 0" class="weekly-overview-empty">空闲</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Middle Column: Detailed Day Timeline -->
      <div class="timeline-column">
        <h3 class="column-title">时间流细节 ({{ selectedTimelineDay.weekdayLabel }} {{ selectedTimelineDay.monthDayLabel }})</h3>
        <div class="time-slots">
          <div
            v-for="slot in timeSlots"
            :key="slot.time"
            class="time-slot"
            :class="{ 'has-task': slot.task, 'is-covered': isSlotCovered(slot.time), 'is-current': slot.isCurrent, 'drag-over': dragOverSlot === slot.time }"
            @dragover.prevent="handleDragOver(slot.time)"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop(slot.time)"
          >
            <span class="slot-time">{{ slot.time }}</span>
            <div class="slot-right-container">
              <div class="slot-grid-line"></div>
              <div 
                v-if="slot.task" 
                class="slot-task" 
                :class="{ 'is-past': isPastTask(slot.task), 'is-completed': isCompletedScheduledTask(slot.task), 'is-insert-drop-target': dragOverBodyTaskId === slot.task.id }"
                :style="{ 
                  borderLeftColor: 'var(--color-primary-accent)',
                  height: getTaskHeight(slot.task.duration)
                }"
                :draggable="!isCompletedScheduledTask(slot.task)"
                @dragstart.stop="handleDragStart($event, 'scheduled', slot.task.id || '', slot.time)"
                @dragover.stop.prevent="handleTaskBodyDragOver(slot.task, slot.time)"
                @dragleave.stop.prevent="handleTaskBodyDragLeave"
                @drop.stop.prevent="handleDropOnTaskBody(slot.task, slot.time)"
              >
                <div
                  class="task-header"
                  :class="{ 'is-drop-target': dragOverHeaderTaskId === slot.task.id }"
                  @dragover.stop.prevent="handleHeaderDragOver(slot.task)"
                  @dragleave.stop.prevent="handleHeaderDragLeave($event)"
                  @drop.stop.prevent="handleDropOnHeader(slot.task)"
                >
                  <span class="task-name">{{ slot.task.name }}</span>
                  <span class="task-tag">
                    {{ slot.task.subject }}
                  </span>
                  <button class="task-delete-btn" @click.stop="handleDeleteScheduledTask(slot)" title="删除任务"><IconX :size="12" :stroke-width="1.8" /></button>
                </div>
                <div class="task-detail">{{ getCleanDesc(slot.task.desc) }}</div>
                <span v-if="dragOverHeaderTaskId === slot.task.id" class="task-body-drop-hint">
                  交换排期
                </span>
                <span v-else-if="dragOverBodyTaskId === slot.task.id" class="task-body-drop-hint">
                  {{ isCompletedScheduledTask(slot.task) ? '已完成任务不可移动' : `插入至 ${dragOverBodySlotTime}` }}
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
        <h3 class="column-title">待安排任务块</h3>
        <div 
          class="pending-tasks"
          :class="{ 'drag-over': dragOverPending }"
          @dragover.prevent="dragOverPending = true"
          @dragleave.prevent="dragOverPending = false"
          @drop.prevent="handleDropOnPending"
        >
          <div v-if="filteredTimelinePendingTasks.length === 0" class="pending-empty-state">
            <span class="empty-icon"><IconCalendarCheck :size="36" :stroke-width="1.5" /></span>
            <p>目前没有待排期任务<br>快去新建吧</p>
          </div>
          <div
            v-for="task in filteredTimelinePendingTasks"
            :key="task.id"
            class="pending-card"
            :class="{ 'is-dragging': draggedItem?.taskId === task.id }"
            draggable="true"
            @dragstart.stop="handleDragStart($event, 'pending', task.id || '')"
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
          :class="{ 'is-today': day.isToday, 'drag-over': dragOverDay === day.dayCode }"
          @dragover.prevent="dragOverDay = day.dayCode"
          @dragleave.prevent="dragOverDay = null"
          @drop.prevent="handleDropOnDay(day.dayCode)"
          >
          <div class="weekly-column-header">
            <span class="day-dot" v-if="day.isToday">今</span>
            <span class="weekly-column-title" :class="{ 'is-today-text': day.isToday }">
              {{ day.weekdayLabel }} · {{ day.monthDayLabel }}
            </span>
            <span class="weekly-column-count">
              {{ getScheduledTasksForDay(day.dayCode).length }}
            </span>
          </div>
          <div class="weekly-tasks-list">
            <div 
              v-for="task in getScheduledTasksForDay(day.dayCode)"
              :key="task.id" 
              class="weekly-task-card"
              :class="{ 'is-past': isPastTask(task), 'is-completed': isCompletedScheduledTask(task) }"
              :style="{ borderLeftColor: 'var(--color-primary-accent)' }"
              :draggable="!isCompletedScheduledTask(task)"
              @dragstart.stop="handleDragStart($event, 'scheduled', task.id || '', task.startTime)"
            >
              <div class="weekly-task-header">
                <span class="weekly-task-name">{{ task.name }}</span>
                <button class="card-delete-btn" @click.stop="handleDeleteTaskById(task.id!)" title="删除任务"><IconX :size="12" :stroke-width="1.8" /></button>
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
           :class="{ 'drag-over': dragOverPending }"
           @dragover.prevent="dragOverPending = true"
           @dragleave.prevent="dragOverPending = false"
           @drop.prevent="handleDropOnPending">
        
        <div v-if="filteredTimelinePendingTasks.length === 0" class="dock-empty">
          <IconCalendarCheck :size="16" :stroke-width="1.8" style="vertical-align: -3px; margin-right: 4px;" />本周待排期任务已全部安排妥当！
        </div>
        
        <div class="dock-tasks-container" v-else>
          <div
            v-for="task in filteredTimelinePendingTasks"
            :key="task.id"
            class="pending-pill"
            :class="{ 'is-dragging': draggedItem?.taskId === task.id }"
            draggable="true"
            @dragstart.stop="handleDragStart($event, 'pending', task.id || '')"
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
      :related-block-id="newTaskForm.relatedBlockId"
      :initial-desc="newTaskForm.desc"
      @submit="handleCreateTask"
    />

    <!-- Related Knowledge Block Preview Dialog -->
    <div class="modal-overlay" v-if="blockDialogVisible" @click="blockDialogVisible = false"></div>
    <div class="block-modal" v-if="blockDialogVisible">
      <div class="modal-header">
        <div class="modal-tags">
          <span class="modal-tag" :style="{ background: selectedBlock?.color || 'var(--border-subtle)' }">
            {{ selectedBlock?.subject || '知识片' }}
          </span>
          <span class="modal-source-tag">
            来源: {{ selectedBlock?.source }}
          </span>
        </div>
        <button class="modal-close" @click="blockDialogVisible = false"><IconX :size="16" :stroke-width="1.8" /></button>
      </div>
      <div class="modal-body">
        <h2 class="modal-title">{{ selectedBlock?.title }}</h2>
        <div class="modal-time"><IconHistory :size="14" :stroke-width="1.6" style="vertical-align: -2px; margin-right: 4px;" />记于 {{ selectedBlock?.time }}</div>
        <div class="modal-divider"></div>
        <div class="modal-content" v-html="renderMarkdown(selectedBlock?.content || selectedBlock?.preview || '')"></div>
      </div>
      <div class="modal-footer">
        <button class="footer-btn secondary-btn" @click="copyBlockContent(selectedBlock?.content || selectedBlock?.preview)">复制内容</button>
        <button class="footer-btn primary-btn" @click="blockDialogVisible = false">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElNotification, ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message-box.css'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  IconListCheck,
  IconCircleCheck,
  IconClock,
  IconInbox,
  IconPlus,
  IconCalendarCheck,
  IconX,
  IconHistory
} from '@tabler/icons-vue'

import { useTaskStore, DAY_CODES, type Task } from '@/store/useTaskStore'
import { getTasksForTimeline, getTimelineDays, isCompletedScheduledTask, comparePendingTasks } from '@/services/taskViewRules'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import TaskCreateDialog from '@/components/task/TaskCreateDialog.vue'

const taskStore = useTaskStore()
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

const selectedDateKey = ref<string>('')

const selectedTimelineDay = computed(() => {
  if (selectedDateKey.value) {
    const found = allTimelineDays.value.find((day) => day.dateKey === selectedDateKey.value)
    if (found) return found
  }
  return timelineDays.value.find((day) => day.dayCode === selectedDay.value) ?? timelineDays.value[0]
})

const selectDay = async (dayCode: string, dateKey?: string) => {
  taskStore.setSelectedDay(dayCode, dateKey)
  if (dateKey) {
    selectedDateKey.value = dateKey
  } else {
    const match = timelineDays.value.find((d) => d.dayCode === dayCode)
    selectedDateKey.value = match ? match.dateKey : ''
  }
  await taskStore.loadLocalTasks()
}

const getScheduledTasksForDateKey = (dateKey: string) => {
  return allTasks.value.filter((task) => {
    if (!task.scheduledAt) return false
    const d = new Date(task.scheduledAt)
    if (Number.isNaN(d.getTime())) return false
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const key = `${d.getFullYear()}-${month}-${day}`
    return key === dateKey
  })
}

const getScheduledTasksForDay = (day: string) => {
  const targetDayObj = timelineDays.value.find(d => d.dayCode === day)
  if (targetDayObj) {
    return getScheduledTasksForDateKey(targetDayObj.dateKey)
  }
  return getTasksForTimeline(allTasks.value).filter((task) => {
    if (!task.scheduledAt) return false
    return DAY_CODES[new Date(task.scheduledAt).getDay()] === day
  })
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

const getCoveringTask = (slotTime: string): Task | null => {
  const direct = timeSlots.value.find((s) => s.time === slotTime)?.task
  if (direct) return direct

  const [slotHour, slotMinute] = slotTime.split(':').map(Number)
  const currentMinutes = slotHour * 60 + slotMinute
  for (const slot of timeSlots.value) {
    if (slot.task) {
      const [taskHour, taskMinute] = slot.time.split(':').map(Number)
      const taskStartMinutes = taskHour * 60 + taskMinute
      const taskEndMinutes = taskStartMinutes + (slot.task.duration || 30)
      if (currentMinutes >= taskStartMinutes && currentMinutes < taskEndMinutes) {
        return slot.task
      }
    }
  }
  return null
}

onMounted(async () => {
  pastTaskRefreshTimer = window.setInterval(() => {
    nowTimestamp.value = Date.now()
  }, 60_000)
  await taskStore.fetchTasks()
  await subjectStore.loadSubjects()
  await knowledgeStore.fetchBlocks()
  await checkSpacedRepetition()
})

onUnmounted(() => {
  if (pastTaskRefreshTimer !== undefined) window.clearInterval(pastTaskRefreshTimer)
})

const stats = computed(() => [
  { icon: IconListCheck, value: pendingCount.value.toString(), label: '待排期' },
  { icon: IconCircleCheck, value: completedCount.value.toString(), label: '已完成' },
  { icon: IconClock, value: totalFocusHours.value, label: '专注时长' }
])

// Filter pending tasks (without subject filter)
const filteredPendingTasks = computed(() => {
  return [...pendingTasks.value].sort(comparePendingTasks)
})

// Filter pending tasks displayed on the Timeline right-sidebar (exclude non-pending ones)
const filteredTimelinePendingTasks = computed(() => {
  return filteredPendingTasks.value
})

// Timeline drag/drop logic
const draggedItem = ref<{ type: 'pending' | 'scheduled', taskId: string, sourceSlotTime?: string } | null>(null)
const dragOverSlot = ref<string | null>(null)
const dragOverHeaderTaskId = ref<string | null>(null)
const dragOverBodyTaskId = ref<string | null>(null)
const dragOverBodySlotTime = ref<string | null>(null)
const dragOverPending = ref(false)
const dragOverDay = ref<string | null>(null)

const handleDragStart = (e: DragEvent, type: 'pending' | 'scheduled', taskId: string, sourceSlotTime?: string) => {
  const dragPayload = { type, taskId, sourceSlotTime }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(dragPayload))
  }
  draggedItem.value = dragPayload
}

const handleDragOver = (slotTime: string) => {
  const targetTask = getCoveringTask(slotTime) || timeSlots.value.find((slot) => slot.time === slotTime)?.task
  if (targetTask && isCompletedScheduledTask(targetTask)) {
    dragOverSlot.value = null
    return
  }
  if (!(draggedItem.value?.type === 'scheduled' && draggedItem.value.sourceSlotTime === slotTime)) {
    dragOverSlot.value = slotTime
  } else {
    dragOverSlot.value = null
  }
}

const handleDragLeave = () => {
  dragOverSlot.value = null
}

const clearTaskBodyDropTarget = () => {
  dragOverBodyTaskId.value = null
  dragOverBodySlotTime.value = null
}

const taskEndSlotTime = (task: Task, startSlotTime: string): string => {
  const [hour, minute] = startSlotTime.split(':').map(Number)
  const endMinutes = Math.ceil((hour * 60 + minute + (task.duration ?? 30)) / 30) * 30
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
  if (!timeSlots.value.some((slot) => slot.time === endTime)) {
    throw new Error('任务结束后已没有可用时间槽')
  }
  return endTime
}

const handleTaskBodyDragOver = (task: Task, startSlotTime: string) => {
  if (!draggedItem.value) {
    clearTaskBodyDropTarget()
    return
  }
  if (draggedItem.value.type === 'scheduled' && draggedItem.value.taskId === task.id) {
    clearTaskBodyDropTarget()
    return
  }

  // 主体落点接在目标任务后；顶部文字区域单独交换。
  dragOverHeaderTaskId.value = null
  try {
    dragOverBodyTaskId.value = task.id
    dragOverBodySlotTime.value = taskEndSlotTime(task, startSlotTime)
  } catch {
    clearTaskBodyDropTarget()
  }
}

const handleTaskBodyDragLeave = () => {
  clearTaskBodyDropTarget()
}

const handleHeaderDragOver = (targetTask: Task) => {
  clearTaskBodyDropTarget()
  dragOverHeaderTaskId.value = draggedItem.value?.type === 'scheduled'
    && draggedItem.value.taskId !== targetTask.id
    && !isCompletedScheduledTask(targetTask)
    ? targetTask.id
    : null
}

const handleHeaderDragLeave = (event?: DragEvent) => {
  if (event) {
    const currentTarget = event.currentTarget as HTMLElement | null
    const relatedTarget = event.relatedTarget as Node | null
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return
    }
  }
  dragOverHeaderTaskId.value = null
}

const reportDragFailure = (error: unknown) => {
  ElNotification({
    title: '排期未保存',
    message: error instanceof Error ? error.message : '本地保存失败，请重试。',
    type: 'error',
    position: 'top-right',
  })
}

const reportScheduleRefreshPending = () => {
  ElNotification({
    title: '排期已保存',
    message: '排期已在服务端保存，本地刷新中。',
    type: 'warning',
    position: 'top-right',
  })
}

const handleDrop = async (slotTime: string) => {
  await handleDropAtSlot(slotTime)
}

const clearDragState = () => {
  draggedItem.value = null
  dragOverSlot.value = null
  dragOverHeaderTaskId.value = null
  clearTaskBodyDropTarget()
  dragOverPending.value = false
  dragOverDay.value = null
}

const handleDropAtSlot = async (slotTime: string, targetTaskId?: string) => {
  try {
    const targetTask = getCoveringTask(slotTime) || timeSlots.value.find((slot) => slot.time === slotTime)?.task
    if (!targetTaskId) {
      if (targetTask && isCompletedScheduledTask(targetTask)) throw new Error('已完成的排期任务已固定')
    }
    if (draggedItem.value) {
      if (draggedItem.value.type === 'pending') {
        const result = await taskStore.scheduleTask(draggedItem.value.taskId, slotTime, targetTaskId)
        if (result === 'refreshing') reportScheduleRefreshPending()
      } else if (draggedItem.value.type === 'scheduled') {
        if (!draggedItem.value.sourceSlotTime) throw new Error('无法识别原排期任务，请从日程卡片拖动')
        if (draggedItem.value.sourceSlotTime !== slotTime) {
          const result = await taskStore.rescheduleTask(draggedItem.value.taskId, slotTime, targetTaskId)
          if (result === 'refreshing') reportScheduleRefreshPending()
        }
      }
    }
  } catch (error) {
    reportDragFailure(error)
  } finally {
    clearDragState()
  }
}

const handleDropOnTaskBody = async (task: Task, startSlotTime: string) => {
  try {
    if (isCompletedScheduledTask(task)) throw new Error('已完成的排期任务已固定')
    if (draggedItem.value?.taskId === task.id) return
    await handleDropAtSlot(taskEndSlotTime(task, startSlotTime), task.id)
  } catch (error) {
    reportDragFailure(error)
    clearDragState()
  }
}

const handleDropOnHeader = async (targetTask: Task) => {
  try {
    if (!draggedItem.value) return
    if (draggedItem.value.type === 'pending') {
      throw new Error('待排期任务请拖到任务主体或空槽进行插入')
    }
    if (!draggedItem.value.sourceSlotTime) {
      throw new Error('无法识别原排期任务，请从日程卡片拖动')
    }
    if (targetTask && isCompletedScheduledTask(targetTask)) throw new Error('已完成的排期任务已固定')
    if (draggedItem.value.taskId !== targetTask.id) {
      const result = await taskStore.swapScheduledTasks(draggedItem.value.taskId, targetTask.id)
      if (result === 'refreshing') reportScheduleRefreshPending()
    }
  } catch (error) {
    reportDragFailure(error)
  } finally {
    clearDragState()
  }
}

const handleDropOnDay = async (day: string) => {
  try {
    if (draggedItem.value) {
      await taskStore.scheduleTaskToDay(draggedItem.value.taskId, day)
    }
  } catch (error) {
    reportDragFailure(error)
  } finally {
    clearDragState()
  }
}

const handleDropOnPending = async () => {
  try {
    if (draggedItem.value?.type === 'scheduled') {
      const targetId = draggedItem.value.taskId || draggedItem.value.sourceSlotTime
      if (targetId) await taskStore.unscheduleTask(targetId)
    }
  } catch (error) {
    reportDragFailure(error)
  } finally {
    clearDragState()
  }
}

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
  return new Date(dueAt).getTime() < taskStore.currentNow.getTime()
}

const formatTaskDue = (dueAt?: string): string => {
  if (!dueAt) return ''
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} 截止`
}

// Spaced Repetition Daily reminder checks
const checkSpacedRepetition = async () => {
  const todayStr = new Date().toISOString().split('T')[0] // 'yyyy-MM-dd'
  const dueBlocks = recentBlocks.value.filter(b => b.reviewAt && b.reviewAt <= todayStr)
  
  let createdCount = 0
  for (const block of dueBlocks) {
    const taskName = `复习: ${block.title}`
    const exists = pendingTasks.value.some(t => t.name === taskName) || timeSlots.value.some(s => s.task?.name === taskName)
    
    if (!exists && block.id && block.subjectId) {
      await taskStore.addTask({
        name: taskName,
        subject: block.subject,
        desc: `艾宾浩斯复习曲线到期推荐。\n[KB_ID:${block.id}]`,
        duration: 30,
        status: 'pending',
        subjectId: block.subjectId
      })
      
      // Compute next interval (e.g. +3 days) to avoid repeated creation today
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + 3)
      await knowledgeStore.updateBlock({
        ...block,
        reviewAt: nextDate.toISOString().split('T')[0]
      })
      createdCount++
    }
  }

  if (createdCount > 0) {
    ElNotification({
      title: '⏰ 遗忘曲线复习推荐',
      message: `今日有 ${createdCount} 个待复习概念到期，已为您自动在待办任务中生成复习日程。`,
      type: 'info',
      position: 'top-right',
      duration: 6000
    })
    await taskStore.loadLocalTasks()
  }
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

const renderMarkdown = (text: string) => {
  return DOMPurify.sanitize(marked.parse(text) as string)
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
const newTaskForm = ref({
  name: '',
  subjectId: '',
  duration: 60,
  desc: '',
  relatedBlockId: ''
})



const triggerImport = () => {
  router.push('/asset?focus=unassigned-tasks')
}

const triggerCreate = () => {
  newTaskForm.value = {
    name: '',
    subjectId: subjectStore.subjects.length > 0 ? subjectStore.subjects[0].id : '',
    duration: 60,
    desc: '',
    relatedBlockId: ''
  }
  taskDialogVisible.value = true
}

const handleCreateTask = async (taskData: {
  name: string
  subjectId: string
  subjectName: string
  duration: number
  desc?: string
  relatedBlockId?: string
}) => {
  newTaskForm.value.name = taskData.name
  newTaskForm.value.subjectId = taskData.subjectId
  newTaskForm.value.duration = taskData.duration
  newTaskForm.value.desc = taskData.desc || ''

  let finalDesc = (taskData.desc || '').trim()
  if (taskData.relatedBlockId) {
    finalDesc += `\n[KB_ID:${taskData.relatedBlockId}]`
  }

  const newTask = {
    name: taskData.name,
    subject: taskData.subjectName,
    duration: newTaskForm.value.duration || 60,
    desc: finalDesc,
    status: 'pending' as const,
    subjectId: taskData.subjectId
  }

  await taskStore.addTask(newTask)
  taskDialogVisible.value = false
}

const handleDeleteScheduledTask = async (slot: any) => {
  if (!slot.task?.id) return
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除任务「${slot.task.name}」吗？`,
      '删除提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await taskStore.deleteTask(slot.task.id)
    ElNotification({
      title: '🗑️ 任务已删除',
      message: `任务「${slot.task.name}」已清除`,
      type: 'success',
      position: 'top-right'
    })
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
    }
  }
}

const handleDeleteTaskById = async (id: string) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这个任务吗？',
      '删除提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await taskStore.deleteTask(id)
    ElNotification({
      title: '🗑️ 任务已删除',
      message: '任务已彻底从列表移除。',
      type: 'success',
      position: 'top-right'
    })
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
    }
  }
}
</script>

<style scoped>
.timeline-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px;
  gap: 8px;
  height: 100%;
  overflow: hidden; /* Prevent page scroll to avoid width shifts */
  box-sizing: border-box;
  background: var(--color-bg-secondary, #EEEEEE); /* 页面大背景 / 次级中性底 */

  /* Zen Minimalist Theme override */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #76855B;
  --color-primary-light: rgba(139, 154, 110, 0.16);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
}

html.dark .timeline-page {
  background: var(--color-bg-primary);
}

.timeline-header-card {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

html.dark .timeline-header-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
}

/* Page header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  flex-shrink: 0;
}

.page-headline {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* View switcher styling */
.view-toggle {
  display: flex;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: 9999px;
  padding: 3px;
  gap: 2px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}

.toggle-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: all var(--transition-fast);
  line-height: 1.2;
}

.toggle-btn:hover {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.15);
}

.toggle-btn.is-active {
  background: var(--accent-gradient, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  color: white;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.28);
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
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45);
}

.btn-secondary {
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}

.btn-secondary:hover {
  transform: translateY(-1px);
  border-color: var(--color-primary-accent, #8B9A6E);
  color: var(--text-primary);
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(139, 154, 110, 0.12);
}

/* Filter Bar */
.filter-bar {
  margin-bottom: 20px;
  display: flex;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.filter-select {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 6px 14px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

/* Header Middle Stats (Pill Tags) */
.header-middle-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 24px;
  flex: 1;
  justify-content: flex-start;
}

.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 9999px;
  border: 1px solid var(--border-default);
  font-size: 13px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all var(--transition-fast);
}

.stat-pill:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: rgba(139, 154, 110, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px -2px rgba(0, 0, 0, 0.06), 0 2px 4px -1px rgba(139, 154, 110, 0.12);
}

.stat-icon {
  font-size: 14px;
}

.stat-value {
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  color: var(--text-secondary);
  font-weight: 500;
}

/* AI Suggestion Bubble */
.ai-suggestion-bubble {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
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
  color: var(--color-oatmeal-dark, #c5a880);
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
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-accent);
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  transition: all var(--transition-fast);
}

.btn-auto-delay:hover {
  transform: translateY(-1px);
  background: var(--accent-gradient);
  color: white;
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.28);
}

/* Timeline body */
.timeline-body {
  display: grid;
  grid-template-columns: 280px 1fr 400px;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.timeline-column, .tasks-column, .weekly-overview-column {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.weekly-overview-column {
  overflow-y: auto;
}

.weekly-overview-column .weekly-overview-list {
  flex: none;
  overflow-y: visible;
}

.next-week-title {
  margin-top: 16px;
}

html.dark .timeline-column, html.dark .tasks-column, html.dark .weekly-overview-column {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
}

/* Weekly Overview Column List */
.weekly-overview-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
}

.weekly-overview-row {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 3px 8px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}

.weekly-overview-row:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: rgba(139, 154, 110, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 6px 14px -2px rgba(0, 0, 0, 0.06), 0 2px 6px -1px rgba(139, 154, 110, 0.12);
}

.weekly-overview-row.is-active {
  border-color: var(--color-primary-accent, #8B9A6E);
  border-left: 3px solid var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.12);
  box-shadow: 0 4px 12px -2px rgba(139, 154, 110, 0.18), 0 1px 3px rgba(0, 0, 0, 0.04);
}

.weekly-overview-row.is-active .weekly-overview-day-name {
  font-weight: 800;
}

.weekly-overview-row-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.weekly-overview-day-name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
}

.weekly-overview-task-count {
  font-size: 10px;
  color: var(--text-secondary);
  margin-left: auto;
}

.weekly-overview-tasks-timeline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.day-dot {
  background: var(--color-primary-accent, #8B9A6E);
  color: white;
  font-size: 9px;
  font-weight: 800;
  padding: 2px 5px;
  border-radius: 4px;
}

.is-today-text {
  color: var(--color-primary-accent, #8B9A6E);
}

.weekly-overview-task-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.weekly-overview-more {
  font-size: 8px;
  color: var(--text-muted);
  font-weight: bold;
}

.weekly-overview-empty {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.6;
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
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

.time-slot {
  display: flex;
  align-items: stretch;
  gap: 12px;
  height: 80px;
  min-height: 80px;
  flex-shrink: 0;
  position: relative;
}

.slot-time {
  width: 52px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding-top: 6px;
  flex-shrink: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.slot-right-container {
  flex: 1;
  position: relative;
  height: 100%;
}

.slot-grid-line {
  position: absolute;
  top: 15px;
  left: 0;
  right: 0;
  height: 1px;
  border-top: 1px dashed rgba(0, 0, 0, 0.06);
  pointer-events: none;
  z-index: 1;
}

html.dark .slot-grid-line {
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.slot-task {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-left: 3.5px solid;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  cursor: grab;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
  box-sizing: border-box;
  overflow: hidden;
}

html.dark .slot-task {
  background: var(--color-bg-secondary);
  border-color: var(--border-subtle);
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.3);
}

.slot-task:hover {
  box-shadow: 0 8px 22px -3px rgba(0, 0, 0, 0.07), 0 3px 8px -1px rgba(139, 154, 110, 0.16);
  border-color: var(--border-strong);
}

.slot-task.is-insert-drop-target {
  outline: 2px dashed var(--color-primary-accent);
  outline-offset: -3px;
}

.task-body-drop-hint {
  position: absolute;
  right: 10px;
  bottom: 6px;
  max-width: calc(100% - 20px);
  padding: 2px 7px;
  border-radius: 5px;
  color: var(--text-primary);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.08));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  pointer-events: none;
  white-space: nowrap;
}

html.dark .task-body-drop-hint {
  background: var(--color-bg-secondary);
  border-color: var(--border-subtle);
}


.task-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 7px;
  padding: 3px 6px;
  margin: -3px -6px;
  transition: background-color 120ms ease, box-shadow 120ms ease;
  cursor: grab;
  width: fit-content;
  max-width: 100%;
}

.task-header.is-drop-target {
  background: rgba(139, 154, 110, 0.2);
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.38);
}

.task-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  pointer-events: none;
}

.task-tag {
  background: rgba(163, 177, 155, 0.22);
  color: #2D3E25;
  border: 1px solid rgba(163, 177, 155, 0.35);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  pointer-events: none;
}

html.dark .task-tag {
  color: #D6E2D0;
  background: rgba(163, 177, 155, 0.15);
  border-color: rgba(163, 177, 155, 0.28);
}

.task-detail {
  font-size: 11px;
  color: var(--text-muted);
}

/* KB Badge Link */
.kb-relation-badge {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  font-size: 10px;
  font-weight: 600;
  background: rgba(197, 168, 128, 0.15);
  color: var(--color-oatmeal-dark, #c5a880);
  border: 1px solid rgba(197, 168, 128, 0.25);
  padding: 2px 8px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  margin-top: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  transition: all 0.2s;
}

.kb-relation-badge:hover {
  background: rgba(197, 168, 128, 0.28);
  transform: scale(1.02);
  box-shadow: 0 2px 6px rgba(197, 168, 128, 0.2);
}

.kb-relation-badge.mini {
  margin-top: 6px;
  font-size: 9px;
  padding: 1px 6px;
}

.slot-empty {
  height: 100%;
  width: 100%;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.time-slot.drag-over .slot-empty {
  background: rgba(139, 154, 110, 0.08);
  border: 1.5px dashed var(--color-primary-accent, #8B9A6E);
}

.time-slot.drag-over .slot-task {
  opacity: 0.6;
}

/* Current time indicator */
.is-current .slot-time {
  color: var(--color-primary-accent, #8B9A6E);
  font-weight: 800;
}

.current-indicator {
  position: absolute;
  left: 64px;
  right: 0;
  top: 15px;
  display: flex;
  align-items: center;
  pointer-events: none;
  z-index: 20;
}

.current-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary-accent, #8B9A6E);
  flex-shrink: 0;
  margin-left: -4px;
}

.current-line {
  flex: 1;
  height: 1.5px;
  background: var(--color-primary-accent, #8B9A6E);
  opacity: 0.6;
}

/* Pending tasks sidebar */
.pending-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 20px;
  transition: background var(--transition-normal);
  border-radius: var(--radius-md);
  position: relative;
  flex: 1 1 0%;
  height: 0;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

.pending-empty-state {
  position: absolute;
  top: 40px;
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
  color: var(--text-muted);
  opacity: 0.6;
}

.pending-card {
  flex: 0 0 auto;
  min-height: max-content;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: grab;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
}

.pending-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 8px 22px -3px rgba(0, 0, 0, 0.07), 0 3px 8px -1px rgba(139, 154, 110, 0.16);
}

.pending-card.is-dragging {
  opacity: 0.2;
  border-style: dashed;
  background: transparent;
  transform: none;
  box-shadow: none;
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
  display: flex;
  flex-direction: column;
}

.pending-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pending-subject {
  background: rgba(163, 177, 155, 0.22);
  color: #2D3E25;
  border: 1px solid rgba(163, 177, 155, 0.35);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  align-self: flex-start;
  margin-top: 4px;
}

html.dark .pending-subject {
  color: #D6E2D0;
  background: rgba(163, 177, 155, 0.15);
  border-color: rgba(163, 177, 155, 0.28);
}

.pending-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-muted);
}

.pending-due-badge {
  font-size: 9.5px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.pending-due-badge.is-overdue {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  font-weight: 600;
}

html.dark .pending-due-badge {
  background: rgba(255, 255, 255, 0.06);
}

html.dark .pending-due-badge.is-overdue {
  color: #f87171;
  background: rgba(239, 68, 68, 0.2);
}

.drag-handle {
  color: var(--text-muted);
  font-size: 16px;
  opacity: 0.3;
}

.pending-card:hover .drag-handle {
  opacity: 0.7;
}

/* Kanban Board View Layout */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  align-items: start;
}

.kanban-column {
  background: var(--color-bg-primary, #F7F2EB);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px;
  min-height: 480px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.25s;
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}

html.dark .kanban-column {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
}

.kanban-column.drag-over {
  background: var(--color-primary-light);
  border-color: var(--color-primary-accent);
}

.kanban-column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.column-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.column-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.weekly-column-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 9999px;
}

.weekly-column.drag-over-column {
  background: rgba(139, 154, 110, 0.08) !important;
  border-color: var(--color-primary-accent, #8B9A6E);
}

.weekly-view-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 16px;
  min-height: 0; /* Allows children to scroll if needed */
}

.weekly-view-body {
  flex: 3; /* roughly 75% */
  overflow-y: auto; /* Allow swimlanes to scroll if they get too tall */
}

.weekly-bottom-dock {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: 0 10px 24px -4px rgba(0,0,0,0.05);
  flex: 1; /* roughly 25% */
  min-height: 140px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-subtle);
  transition: all 0.2s ease;
  overflow-y: auto;
}

html.dark .weekly-bottom-dock {
  background: var(--surface-1);
  box-shadow: 0 -2px 15px rgba(0,0,0,0.2);
}

.weekly-bottom-dock.drag-over {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.08);
}

.dock-empty {
  margin: auto;
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 600;
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
  padding: 8px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: 9999px;
  cursor: grab;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
}

.pending-pill:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.2), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.pending-pill.is-dragging {
  opacity: 0.2;
  border-style: dashed;
  background: transparent;
  transform: none;
  box-shadow: none;
}

.pill-duration {
  font-size: 11px;
  opacity: 0.8;
}

.column-count {
  font-size: 10px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.kanban-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.kanban-task-card {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  cursor: grab;
  box-shadow: 0 3px 10px -2px rgba(0, 0, 0, 0.04), 0 1px 4px rgba(0, 0, 0, 0.02);
  transition: all var(--transition-normal);
}

.kanban-task-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 8px 20px -3px rgba(139, 154, 110, 0.18), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.card-color-indicator {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.card-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.card-name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.4;
}

.card-delete-btn,
.task-delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 4px;
  pointer-events: auto;
  transition: all var(--transition-fast);
}
.card-delete-btn:hover,
.task-delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.2);
}

.card-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.card-tag {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 500;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--text-muted);
}

.empty-column-placeholder {
  border: 1.5px dashed rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-muted);
}

/* Modal and Forms */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 200;
  animation: fade-in 0.2s ease;
}

.modal-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 520px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1001;
}

html.dark .modal-container {
  background: #181D18;
  border-color: rgba(163, 177, 155, 0.25);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.modal-tags {
  display: flex;
  gap: 8px;
  align-items: center;
}

.modal-tag {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 2px 8px;
  border-radius: 4px;
}

.modal-source-tag {
  font-size: 10px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
}

.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-muted);
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.modal-body {
  padding: 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.modal-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.modal-time {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.modal-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 16px;
}

.modal-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 28px 22px;
  border-top: 1px solid var(--border-subtle);
  background: transparent;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }

.styled-input, .styled-textarea, .styled-select { width: 100%; padding: 12px 14px; background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-default); border-radius: 12px; font-size: 13.5px; color: var(--text-primary); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit; }
.styled-input:focus, .styled-textarea:focus, .styled-select:focus { border-color: #8B9A6E; background: var(--color-bg-tertiary, #FAF7F2); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18); }
html.dark .styled-input:focus, html.dark .styled-textarea:focus, html.dark .styled-select:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.2); }

/* Day Selector Bar */
.day-selector-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 12px;
}

.day-btn {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all var(--transition-fast);
}

.day-btn:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: rgba(139, 154, 110, 0.4);
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px -1px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(139, 154, 110, 0.12);
}

.day-btn.is-active {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.32);
}

/* Weekly View Body */
.weekly-view-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  width: 100%;
}

.weekly-column {
  background: var(--color-bg-primary, #F7F2EB);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 480px;
  box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
  transition: all 0.3s ease;
  box-sizing: border-box;
}

html.dark .weekly-column {
  background: var(--surface-1);
  border-color: transparent;
}

.weekly-column.is-today {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: var(--color-bg-primary, #F7F2EB);
  box-shadow: 0 10px 24px -4px rgba(139, 154, 110, 0.18), 0 2px 6px -1px rgba(0, 0, 0, 0.03), inset 0 0 0 1px var(--color-primary-accent, #8B9A6E);
}

html.dark .weekly-column.is-today {
  background: var(--surface-1);
  box-shadow: 0 0 16px rgba(139, 154, 110, 0.15), inset 0 0 0 1px var(--color-primary-accent, #8B9A6E);
}

.weekly-column-header {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 8px;
}

.weekly-column-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.weekly-column-count {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
  background: rgba(255, 255, 255, 0.04);
  padding: 1px 5px;
  border-radius: 10px;
  font-weight: 600;
}

.weekly-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
}

.weekly-task-card {
  flex-shrink: 0;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid;
  border-radius: var(--radius-md);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 3px 8px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all var(--transition-fast);
}

.weekly-task-card:hover {
  transform: translateY(-1px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 6px 14px rgba(139, 154, 110, 0.16), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.weekly-task-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 4px;
}

.weekly-task-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-all;
}

.weekly-task-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 9px;
  color: var(--text-muted);
  flex-wrap: wrap;
  gap: 4px;
}

.weekly-task-time {
  white-space: nowrap;
}

.weekly-task-tag {
  background: rgba(163, 177, 155, 0.22);
  color: #2D3E25;
  border: 1px solid rgba(163, 177, 155, 0.35);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 9px;
  font-weight: 700;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html.dark .weekly-task-tag {
  color: #D6E2D0;
  background: rgba(163, 177, 155, 0.15);
  border-color: rgba(163, 177, 155, 0.28);
}

.weekly-empty-placeholder {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  margin-top: 30px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 8px;
}

/* ===== 新建学习任务弹窗 (复刻 Dashboard) ===== */
.task-create-modal {
  width: 520px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-subtle);
}

html.dark .task-create-modal {
  background: #181D18;
  border-color: rgba(163, 177, 155, 0.25);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.task-create-modal .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22px 0 16px 0;
  margin: 0 28px;
  border-bottom: 1px solid var(--border-subtle);
}

.task-modal-title {
  margin: 0;
  font-size: 19px;
  font-weight: 850;
  color: var(--color-primary-accent, #8B9A6E);
  letter-spacing: -0.4px;
}

.task-modal-body {
  padding: 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 70vh;
  overflow-y: auto;
}

.task-form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-form-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--text-secondary);
}

.task-form-input {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.task-form-input:focus {
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
  background: var(--color-bg-tertiary, #FAF7F2);
}

/* 学科选择网格胶囊 */
.subject-capsule-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.subject-capsule-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1.5px solid var(--border-default);
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 2px 5px -1px rgba(0, 0, 0, 0.03);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-capsule-item:hover {
  transform: translateY(-1px);
  background: var(--color-bg-tertiary);
  border-color: rgba(139, 154, 110, 0.35);
  box-shadow: 0 3px 8px rgba(139, 154, 110, 0.12);
}

.subject-capsule-item.active {
  background: rgba(139, 154, 110, 0.12) !important;
  border-color: #8B9A6E !important;
  color: #8B9A6E !important;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.22);
  font-weight: 700;
}

.subj-capsule-icon {
  font-size: 13px;
}

/* 专注时长头部与预设胶囊 */
.duration-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.duration-badge {
  font-size: 12px;
  font-weight: 700;
  color: #8B9A6E;
  background: rgba(139, 154, 110, 0.12);
  padding: 2px 8px;
  border-radius: 9999px;
}

/* 专注时长长条按钮拖动交互条 */
.duration-long-bar-btn {
  position: relative;
  width: 100%;
  height: 48px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1.5px solid var(--border-default);
  border-radius: 9999px;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  display: flex;
  align-items: center;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.04), 0 2px 6px rgba(0, 0, 0, 0.03);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.duration-long-bar-btn:hover {
  border-color: #8B9A6E;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(139, 154, 110, 0.22);
}

.duration-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(to right, rgba(139, 154, 110, 0.25), #8B9A6E);
  border-radius: 9999px;
  transition: width 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}

.duration-bar-steps {
  position: relative;
  z-index: 2;
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  align-items: center;
}

.duration-step-item {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-secondary);
  transition: all 0.2s;
  padding: 4px 8px;
  border-radius: 6px;
}

.duration-step-item.active {
  color: #FFFFFF;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  font-weight: 750;
}

.duration-bar-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  background: #FFFFFF;
  border: 2.5px solid #8B9A6E;
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 800;
  color: #8B9A6E;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.25);
  pointer-events: none;
  transition: left 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .duration-bar-thumb {
  background: #181D18;
}

.task-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 28px 22px;
  border-top: 1px solid var(--border-subtle);
  background: transparent;
}

.task-btn-cancel,
.task-btn-submit {
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
}

.task-btn-cancel {
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}

.task-btn-cancel:hover {
  transform: translateY(-1px);
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
  border-color: var(--border-strong);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}

.task-btn-submit {
  background: var(--accent-gradient);
  color: white;
  border: none;
  box-shadow: 0 2px 10px rgba(139, 154, 110, 0.35);
}

.task-btn-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(139, 154, 110, 0.48);
}

.task-btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
.slot-task.is-completed,
.weekly-task-card.is-completed {
  opacity: 0.55;
  filter: grayscale(100%);
}
.slot-task.is-completed .task-name,
.weekly-task-card.is-completed .weekly-task-name {
  text-decoration: line-through;
  color: var(--text-muted);
}
</style>
