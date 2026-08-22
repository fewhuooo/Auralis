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
            <component :is="stat.icon" class="stat-icon" :size="15" :stroke-width="2.5" />
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
            <Inbox :size="15" :stroke-width="2.5" /> 导入任务
          </button>
          <button class="btn-primary" @click="triggerCreate">
            <Plus :size="16" :stroke-width="2.5" /> 新建任务
          </button>
        </div>
      </div>

      <!-- AI Suggestion Bubble -->
      <div v-if="aiSuggestions && aiSuggestions.length > 0" class="ai-suggestion-bubble">
        <div class="ai-bubble-header">
          <div class="ai-title">
            <Sparkles class="ai-icon" :size="16" :stroke-width="2.5" />
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
            :class="{ 'is-active': selectedDay === day.dayCode, 'is-today': day.isToday }"
            @click="selectDay(day.dayCode)"
          >
            <div class="weekly-overview-row-header">
              <span class="day-dot" v-if="day.isToday">今</span>
              <span class="weekly-overview-day-name" :class="{ 'is-today-text': day.isToday }">{{ day.weekdayLabel }} {{ day.monthDayLabel }}</span>
              <span class="weekly-overview-task-count">{{ getScheduledTasksForDay(day.dayCode).length }} 项任务</span>
            </div>
            <div class="weekly-overview-tasks-timeline">
              <div 
                v-for="task in getScheduledTasksForDay(day.dayCode).slice(0, 3)"
                :key="task.id" 
                class="weekly-overview-task-dot"
                :style="{ backgroundColor: task.color }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name}`"
              ></div>
              <span v-if="getScheduledTasksForDay(day.dayCode).length > 3" class="weekly-overview-more">+{{ getScheduledTasksForDay(day.dayCode).length - 3 }}</span>
              <span v-if="getScheduledTasksForDay(day.dayCode).length === 0" class="weekly-overview-empty">空闲</span>
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
            :class="{ 'has-task': slot.task, 'is-current': slot.isCurrent, 'drag-over': dragOverSlot === slot.time }"
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
                :class="{ 'is-past': isPastTask(slot.task) }"
                :style="{ 
                  borderLeftColor: slot.task.color,
                  height: getTaskHeight(slot.task.duration)
                }"
                draggable="true"
                @dragstart.stop="handleDragStart($event, 'scheduled', slot.time)"
              >
                <div class="task-header">
                  <span class="task-name">{{ slot.task.name }}</span>
                  <span class="task-tag" :style="{ backgroundColor: slot.task.color || 'rgba(255,255,255,0.08)' }">
                    {{ slot.task.subject }}
                  </span>
                  <button class="task-delete-btn" @click.stop="handleDeleteScheduledTask(slot)" title="删除任务">✕</button>
                </div>
                <div class="task-detail">{{ getCleanDesc(slot.task.desc) }}</div>
                
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
            <span class="empty-icon">🍃</span>
            <p>目前没有待排期任务<br>快去新建吧</p>
          </div>
          <div
            v-for="task in filteredTimelinePendingTasks"
            :key="task.id"
            class="pending-card"
            :class="{ 'is-dragging': draggedItem?.idOrTime === task.id }"
            draggable="true"
            @dragstart.stop="handleDragStart($event, 'pending', task.id || '')"
          >
            <div class="pending-color" :style="{ background: task.color }"></div>
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
                <span class="load-indicator" :class="task.load">{{ task.loadText }}</span>
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
              :class="{ 'is-past': isPastTask(task) }"
              :style="{ borderLeftColor: task.color }"
              draggable="true"
              @dragstart.stop="handleDragStart($event, 'scheduled', task.id || '')"
            >
              <div class="weekly-task-header">
                <span class="weekly-task-name">{{ task.name }}</span>
                <button class="card-delete-btn" @click.stop="handleDeleteTaskById(task.id!)" title="删除任务">✕</button>
              </div>
              <div class="weekly-task-meta">
                <span class="weekly-task-time">⏰ {{ getTaskTimeStr(task.startTime) }} ({{ task.duration }}m)</span>
                <span class="weekly-task-tag" :style="{ backgroundColor: task.color || 'rgba(255,255,255,0.08)' }">
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
          🎉 太棒了，本周待排期任务已全部安排妥当！
        </div>
        
        <div class="dock-tasks-container" v-else>
          <div
            v-for="task in filteredTimelinePendingTasks"
            :key="task.id"
            class="pending-pill"
            :class="{ 'is-dragging': draggedItem?.idOrTime === task.id }"
            draggable="true"
            @dragstart.stop="handleDragStart($event, 'pending', task.id || '')"
          >
            <span class="pill-name">{{ task.name }}</span>
            <span class="pill-duration" :style="{ color: task.color }">{{ task.duration }}m</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Creation Modal -->
    <div class="modal-overlay" v-if="taskDialogVisible" @click="taskDialogVisible = false"></div>
    <div class="modal-container task-create-modal" v-if="taskDialogVisible">
      <div class="modal-header">
        <h3 class="task-modal-title">新建学习任务</h3>
        <button class="modal-close" @click="taskDialogVisible = false">×</button>
      </div>
      <div class="task-modal-body">
        <!-- 任务名称 -->
        <div class="task-form-group">
          <label class="task-form-label">任务名称</label>
          <input v-model="newTaskForm.name" class="task-form-input" placeholder="请输入学习或专注任务名称..." autofocus @keyup.enter="handleCreateTask" />
        </div>

        <!-- 所属学科（胶囊网格选择，直观清晰） -->
        <div class="task-form-group">
          <label class="task-form-label">所属学科</label>
          <div class="subject-capsule-grid">
            <div
              v-for="subj in subjectStore.subjects"
              :key="subj.id"
              class="subject-capsule-item"
              :class="{ active: newTaskForm.subjectId === subj.id }"
              :style="newTaskForm.subjectId === subj.id ? { borderColor: subj.color, background: subj.color + '22' } : {}"
              @click="newTaskForm.subjectId = subj.id"
            >
              <span class="subj-capsule-icon">
                <component
                  v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)"
                  :is="getSubjectIconComponent(subj.icon)"
                  style="width: 1em; height: 1em;"
                />
                <span v-else>{{ getLegacySubjectIcon(subj.icon) || '📘' }}</span>
              </span>
              <span class="subj-capsule-name">{{ subj.name }}</span>
            </div>
            <div v-if="subjectStore.subjects.length === 0" class="subject-capsule-item">暂无学科，请先创建</div>
          </div>
        </div>

        <!-- 专注时长（在长条按钮交互条上拖动选择） -->
        <div class="task-form-group">
          <div class="duration-header">
            <label class="task-form-label">专注时长</label>
            <span class="duration-badge">{{ newTaskForm.duration }} 分钟 ({{ (newTaskForm.duration / 60).toFixed(1) }}h)</span>
          </div>
          <div 
            class="duration-long-bar-btn" 
            ref="durationBarRef"
            @mousedown="startDurationDrag"
            @mousemove="onDurationDrag"
            @mouseup="endDurationDrag"
            @mouseleave="endDurationDrag"
            @click="onDurationBarClick"
          >
            <!-- 绿色进度填充 -->
            <div 
              class="duration-bar-fill" 
              :style="{ width: Math.min(100, Math.max(0, ((newTaskForm.duration - 30) / (240 - 30)) * 100)) + '%' }"
            ></div>
            <!-- 长条刻度与选项文字 -->
            <div class="duration-bar-steps">
              <span 
                v-for="step in [30, 60, 90, 120, 180, 240]" 
                :key="step"
                class="duration-step-item"
                :class="{ active: newTaskForm.duration >= step }"
                @click.stop="newTaskForm.duration = step"
              >
                {{ step < 60 ? step + 'm' : (step / 60) + 'h' }}
              </span>
            </div>
            <!-- 拖动圆角手柄反馈 -->
            <div 
              class="duration-bar-thumb"
              :style="{ left: Math.min(100, Math.max(0, ((newTaskForm.duration - 30) / (240 - 30)) * 100)) + '%' }"
            >
              <span>{{ newTaskForm.duration }}m</span>
            </div>
          </div>
        </div>
      </div>

      <div class="task-modal-footer">
        <button class="task-btn-cancel" @click="taskDialogVisible = false">取消</button>
        <button
          class="task-btn-submit"
          :disabled="!newTaskForm.name.trim() || !newTaskForm.subjectId"
          @click="handleCreateTask"
        >
          添加到待办
        </button>
      </div>
    </div>

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
        <button class="modal-close" @click="blockDialogVisible = false">✕</button>
      </div>
      <div class="modal-body">
        <h2 class="modal-title">{{ selectedBlock?.title }}</h2>
        <div class="modal-time">⏰ 记于 {{ selectedBlock?.time }}</div>
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
import { ListTodo, CheckCircle, Clock, Inbox, Plus, Sparkles } from 'lucide-vue-next'

import { useTaskStore, DAY_CODES } from '@/store/useTaskStore'
import { getTasksForTimeline, getTimelineDays } from '@/services/taskViewRules'
import { useSubjectStore } from '@/store/useSubjectStore'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'

const taskStore = useTaskStore()
const { pendingTasks, allTasks, timeSlots, selectedDay, completedCount, pendingCount, totalFocusHours, aiSuggestions, hasOverload } = storeToRefs(taskStore)

const subjectStore = useSubjectStore()
const knowledgeStore = useKnowledgeStore()
const { recentBlocks } = storeToRefs(knowledgeStore)

// Core timeline states
const viewMode = ref<'day' | 'week'>('day')
const timelineDays = computed(() => getTimelineDays())
const selectedTimelineDay = computed(() => timelineDays.value.find((day) => day.dayCode === selectedDay.value) ?? timelineDays.value[0])

const selectDay = async (day: string) => {
  taskStore.selectedDay = day
  await taskStore.loadLocalTasks()
}

const getScheduledTasksForDay = (day: string) => {
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

const getTaskHeight = (duration?: number) => {
  const d = duration || 30
  const slots = d / 30
  return `${slots * TIMELINE_SLOT_HEIGHT + (slots - 1) * TIMELINE_SLOT_GAP}px`
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
  await checkSpacedRepetition()
})

onUnmounted(() => {
  if (pastTaskRefreshTimer !== undefined) window.clearInterval(pastTaskRefreshTimer)
})

const stats = computed(() => [
  { icon: ListTodo, value: pendingCount.value.toString(), label: '待排期' },
  { icon: CheckCircle, value: completedCount.value.toString(), label: '已完成' },
  { icon: Clock, value: totalFocusHours.value, label: '专注时长' }
])

// Filter pending tasks (without subject filter)
const filteredPendingTasks = computed(() => {
  return pendingTasks.value
})

// Filter pending tasks displayed on the Timeline right-sidebar (exclude non-pending ones)
const filteredTimelinePendingTasks = computed(() => {
  return filteredPendingTasks.value
})

// Timeline drag/drop logic
const draggedItem = ref<{ type: 'pending' | 'scheduled', idOrTime: string } | null>(null)
const dragOverSlot = ref<string | null>(null)
const dragOverPending = ref(false)
const dragOverDay = ref<string | null>(null)

const handleDragStart = (e: DragEvent, type: 'pending' | 'scheduled', idOrTime: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', idOrTime)
    draggedItem.value = { type, idOrTime }
  }
}

const handleDragOver = (slotTime: string) => {
  if (!(draggedItem.value?.type === 'scheduled' && draggedItem.value.idOrTime === slotTime)) {
    dragOverSlot.value = slotTime
  } else {
    dragOverSlot.value = null
  }
}

const handleDragLeave = () => {
  dragOverSlot.value = null
}

const handleDrop = async (slotTime: string) => {
  try {
    if (draggedItem.value) {
      if (draggedItem.value.type === 'pending') {
        await taskStore.scheduleTask(draggedItem.value.idOrTime, slotTime)
      } else if (draggedItem.value.type === 'scheduled' && draggedItem.value.idOrTime !== slotTime) {
        await taskStore.rescheduleTask(draggedItem.value.idOrTime, slotTime)
      }
    }
  } finally {
    draggedItem.value = null
    dragOverSlot.value = null
    dragOverPending.value = false
    dragOverDay.value = null
  }
}

const handleDropOnDay = async (day: string) => {
  try {
    if (draggedItem.value) {
      if (draggedItem.value.type === 'pending') {
        await taskStore.scheduleTaskToDay(draggedItem.value.idOrTime, day)
      } else if (draggedItem.value.type === 'scheduled') {
        await taskStore.scheduleTaskToDay(draggedItem.value.idOrTime, day)
      }
    }
  } finally {
    draggedItem.value = null
    dragOverDay.value = null
    dragOverPending.value = false
  }
}

const handleDropOnPending = async () => {
  try {
    if (draggedItem.value?.type === 'scheduled') {
      await taskStore.unscheduleTask(draggedItem.value.idOrTime)
    }
  } finally {
    draggedItem.value = null
    dragOverPending.value = false
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
        color: block.color || 'rgba(181, 196, 177, 0.6)',
        duration: 30,
        load: 'low',
        loadText: '1.0 🧠',
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
  load: 'medium' as 'low' | 'medium' | 'high',
  desc: '',
  relatedBlockId: ''
})



const durationBarRef = ref<HTMLElement | null>(null)
const isDraggingDuration = ref(false)

const calculateDurationFromEvent = (e: MouseEvent) => {
  if (!durationBarRef.value) return
  const rect = durationBarRef.value.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  const ratio = offsetX / rect.width
  const rawDuration = 30 + ratio * (240 - 30)
  const rounded = Math.round(rawDuration / 30) * 30
  newTaskForm.value.duration = Math.max(30, Math.min(240, rounded))
}

const startDurationDrag = (e: MouseEvent) => {
  isDraggingDuration.value = true
  calculateDurationFromEvent(e)
}

const onDurationDrag = (e: MouseEvent) => {
  if (!isDraggingDuration.value) return
  calculateDurationFromEvent(e)
}

const endDurationDrag = () => {
  isDraggingDuration.value = false
}

const onDurationBarClick = (e: MouseEvent) => {
  calculateDurationFromEvent(e)
}

const triggerImport = () => {
  router.push('/asset?focus=unassigned-tasks')
}

const triggerCreate = () => {
  newTaskForm.value = {
    name: '',
    subjectId: subjectStore.subjects.length > 0 ? subjectStore.subjects[0].id : '',
    duration: 60,
    load: 'medium',
    desc: '',
    relatedBlockId: ''
  }
  taskDialogVisible.value = true
}

const handleCreateTask = async () => {
  if (!newTaskForm.value.name.trim() || !newTaskForm.value.subjectId) {
    ElNotification({
      title: '⚠️ 无法创建任务',
      message: '请完整填写任务名称并选择所属学科！',
      type: 'warning',
      position: 'top-right'
    })
    return
  }

  const selectedSubj = subjectStore.subjects.find(s => s.id === newTaskForm.value.subjectId)
  if (!selectedSubj) return

  const loadTextMap: Record<string, string> = {
    low: '1.0 🧠', medium: '2.0 🧠', high: '3.0 🧠'
  }

  let finalDesc = newTaskForm.value.desc.trim()
  if (newTaskForm.value.relatedBlockId) {
    finalDesc += `\n[KB_ID:${newTaskForm.value.relatedBlockId}]`
  }

  const newTask = {
    name: newTaskForm.value.name.trim(),
    subject: selectedSubj.name,
    duration: newTaskForm.value.duration || 60,
    load: newTaskForm.value.load,
    loadText: loadTextMap[newTaskForm.value.load] || '2.0 🧠',
    desc: finalDesc,
    color: selectedSubj.color || 'rgba(181, 196, 177, 0.6)',
    status: 'pending' as const,
    subjectId: selectedSubj.id
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
  background: var(--color-zen-ivory); /* Zen Ivory base */

  /* Zen Minimalist Theme override */
  --color-primary-accent: #7D9372;
  --color-primary-accent-hover: #6c8062;
  --color-primary-light: rgba(163, 177, 155, 0.12);
  --color-primary-glow: rgba(163, 177, 155, 0.25);
  --accent-gradient: var(--color-zen-sage);
}

html.dark .timeline-page {
  background: var(--color-bg-primary);
}

.timeline-header-card {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

html.dark .timeline-header-card {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
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
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: 9999px;
  padding: 3px;
  gap: 2px;
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
  background: rgba(163, 177, 155, 0.15);
}

.toggle-btn.is-active {
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  color: white;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(125, 147, 114, 0.28);
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
  background: var(--color-bg-secondary);
  border-radius: 9999px;
  border: 1px solid var(--border-default);
  font-size: 13px;
  transition: all var(--transition-fast);
}

.stat-pill:hover {
  background: var(--color-bg-tertiary);
  border-color: rgba(125, 147, 114, 0.3);
  transform: translateY(-1px);
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
  transition: all var(--transition-fast);
}

.btn-auto-delay:hover {
  background: var(--accent-gradient);
  color: white;
}

/* Timeline body */
.timeline-body {
  display: grid;
  grid-template-columns: 280px 1fr 340px;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.timeline-column, .tasks-column, .weekly-overview-column {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

html.dark .timeline-column, html.dark .tasks-column, html.dark .weekly-overview-column {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
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
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.weekly-overview-row:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-strong);
}

.weekly-overview-row.is-active {
  border-color: var(--color-primary-accent, #7D9372);
  border-left: 3px solid var(--color-primary-accent, #7D9372);
  background: rgba(163, 177, 155, 0.08);
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
  background: var(--color-primary-accent, #7D9372);
  color: white;
  font-size: 9px;
  font-weight: 800;
  padding: 2px 5px;
  border-radius: 4px;
}

.is-today-text {
  color: var(--color-primary-accent, #7D9372);
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
  min-height: 80px;
  height: auto;
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
}

.slot-right-container {
  flex: 1;
  position: relative;
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
  position: relative;
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 3px solid;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: grab;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
  box-sizing: border-box;
}

.slot-task:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}

.is-past .task-name,
.is-past .task-detail,
.is-past .weekly-task-name,
.is-past .weekly-task-time {
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.task-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-weight: 500;
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
  transition: all 0.2s;
}

.kb-relation-badge:hover {
  background: rgba(197, 168, 128, 0.28);
  transform: scale(1.02);
}

.kb-relation-badge.mini {
  margin-top: 6px;
  font-size: 9px;
  padding: 1px 6px;
}

.slot-empty {
  height: 100%;
  width: 100%;
}

.time-slot.drag-over .slot-empty {
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed var(--border-accent);
  border-radius: var(--radius-md);
}

.time-slot.drag-over .slot-task {
  opacity: 0.6;
}

/* Current time indicator */
.is-current .slot-time {
  color: var(--color-primary-accent, #7D9372);
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
  background: var(--color-primary-accent, #7D9372);
  flex-shrink: 0;
  margin-left: -4px;
}

.current-line {
  flex: 1;
  height: 1.5px;
  background: var(--color-primary-accent, #7D9372);
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
  flex: 1;
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
  font-size: 32px;
  opacity: 0.6;
}

.pending-card {
  display: flex;
  align-items: center;
  padding: 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: grab;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
}

.pending-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 1px;
}

.pending-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-muted);
}

.load-indicator {
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 9px;
}

.load-indicator.low {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

.load-indicator.medium {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.load-indicator.high {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
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
  background: var(--color-bg-primary);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 16px;
  min-height: 480px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.25s;
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .kanban-column {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
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
  background: rgba(125, 147, 114, 0.08) !important;
  border-color: var(--color-primary-accent, #7D9372);
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
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
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
  border-color: var(--color-primary-accent, #7D9372);
  background: rgba(125, 147, 114, 0.04);
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
  background: var(--surface-2);
  border: 1px solid var(--border-default);
  border-radius: 9999px;
  cursor: grab;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
}

.pending-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
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
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  cursor: grab;
  transition: all var(--transition-normal);
}

.kanban-task-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.15);
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
}
.card-delete-btn:hover,
.task-delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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

.load-indicator.inline {
  padding: 0px 4px;
  border-radius: 3px;
  font-size: 8px;
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
  background: #FFFFFF;
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

.styled-input, .styled-textarea, .styled-select { width: 100%; padding: 12px 14px; background: var(--color-bg-secondary); border: 1px solid var(--border-default); border-radius: 12px; font-size: 13.5px; color: var(--text-primary); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit; }
.styled-input:focus, .styled-textarea:focus, .styled-select:focus { border-color: #7D9372; background: var(--color-bg-primary); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.15); }
html.dark .styled-input:focus, html.dark .styled-textarea:focus, html.dark .styled-select:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.2); }

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
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-default);
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
}

.day-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.day-btn.is-active {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
  font-weight: 700;
}

/* Weekly View Body */
.weekly-view-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  width: 100%;
}

.weekly-column {
  background: var(--color-bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 480px;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

html.dark .weekly-column {
  background: var(--surface-1);
  border-color: transparent;
}

.weekly-column.is-today {
  border-color: var(--color-primary-accent, #7D9372);
  background: var(--color-bg-primary);
  box-shadow: 0 0 16px rgba(125, 147, 114, 0.12), inset 0 0 0 1px var(--color-primary-accent, #7D9372);
}

html.dark .weekly-column.is-today {
  background: var(--surface-1);
  box-shadow: 0 0 16px rgba(125, 147, 114, 0.15), inset 0 0 0 1px var(--color-primary-accent, #7D9372);
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
  background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.01));
  border: 1px solid var(--border-subtle);
  border-left: 3px solid;
  border-radius: var(--radius-md);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all var(--transition-fast);
}

.weekly-task-card:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
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
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-size: 8px;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: #FFFFFF;
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
  color: var(--color-primary-accent, #7D9372);
  letter-spacing: -0.4px;
  -webkit-text-stroke: 0.35px rgba(90, 111, 80, 0.65);
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
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.task-form-input:focus {
  border-color: #7D9372;
  box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.15);
  background: var(--color-bg-primary);
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
  background: var(--color-bg-secondary);
  border: 1.5px solid transparent;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-capsule-item:hover {
  transform: translateY(-1px);
  background: var(--color-bg-tertiary);
}

.subject-capsule-item.active {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
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
  color: #7D9372;
  background: rgba(125, 147, 114, 0.12);
  padding: 2px 8px;
  border-radius: 9999px;
}

/* 专注时长长条按钮拖动交互条 */
.duration-long-bar-btn {
  position: relative;
  width: 100%;
  height: 48px;
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-default);
  border-radius: 9999px;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  display: flex;
  align-items: center;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.duration-long-bar-btn:hover {
  border-color: #7D9372;
  box-shadow: 0 4px 16px rgba(125, 147, 114, 0.15);
}

.duration-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(to right, rgba(125, 147, 114, 0.25), #7D9372);
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
  border: 2.5px solid #7D9372;
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 800;
  color: #7D9372;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
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
  background: var(--color-bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}

.task-btn-cancel:hover {
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.task-btn-submit {
  background: var(--accent-gradient);
  color: white;
  border: none;
  box-shadow: 0 4px 14px rgba(125, 147, 114, 0.25);
}

.task-btn-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(125, 147, 114, 0.35);
}

.task-btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
</style>
