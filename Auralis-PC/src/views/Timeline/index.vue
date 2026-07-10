<template>
  <div class="timeline-page">
    <!-- Timeline Header Card -->
    <div class="timeline-header-card">
      <!-- Page header -->
      <div class="page-header">
        <div>
          <h1 class="page-headline">任务编排中心</h1>
          <p class="page-subtitle">{{ viewMode === 'day' ? '拖拽任务块至时间轴以安排日程' : '周视图下可总览本周每天的排期日程' }}</p>
        </div>
        <div class="header-actions">
          <!-- Day/Week View Switcher -->
          <div class="view-toggle">
            <button 
              class="toggle-btn" 
              :class="{ 'is-active': viewMode === 'day' }"
              @click="viewMode = 'day'"
            >
              ⏱️ 日视图
            </button>
            <button 
              class="toggle-btn" 
              :class="{ 'is-active': viewMode === 'week' }"
              @click="viewMode = 'week'"
            >
              📅 周视图
            </button>
          </div>
          <button class="btn-secondary" @click="triggerImport">
            <span>📥</span> 导入任务
          </button>
          <button class="btn-primary" @click="triggerCreate">
            <span>＋</span> 新建任务
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
    </div>

    <!-- VIEW: Day Mode (Timeline) -->
    <div v-if="viewMode === 'day'" class="timeline-body">
      <!-- Left Column: Weekly Overview -->
      <div class="weekly-overview-column">
        <h3 class="column-title">本周排期概览</h3>
        <div class="weekly-overview-list">
          <div 
            v-for="day in DAYS" 
            :key="day" 
            class="weekly-overview-row"
            :class="{ 'is-active': selectedDay === day, 'is-today': day === getTodayDayCode() }"
            @click="selectDay(day)"
          >
            <div class="weekly-overview-row-header">
              <span class="day-dot" v-if="day === getTodayDayCode()"></span>
              <span class="weekly-overview-day-name">{{ DAY_NAMES[day] }}</span>
              <span class="weekly-overview-task-count">{{ getScheduledTasksForDay(day).length }} 项任务</span>
            </div>
            <div class="weekly-overview-tasks-timeline">
              <div 
                v-for="task in getScheduledTasksForDay(day).slice(0, 3)" 
                :key="task.id" 
                class="weekly-overview-task-dot"
                :style="{ backgroundColor: task.color }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name}`"
              ></div>
              <span v-if="getScheduledTasksForDay(day).length > 3" class="weekly-overview-more">+{{ getScheduledTasksForDay(day).length - 3 }}</span>
              <span v-if="getScheduledTasksForDay(day).length === 0" class="weekly-overview-empty">空闲</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Middle Column: Detailed Day Timeline -->
      <div class="timeline-column">
        <h3 class="column-title">时间流细节 ({{ DAY_NAMES[selectedDay] }})</h3>
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
              <div 
                v-if="slot.task" 
                class="slot-task" 
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
                <span>空闲</span>
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
          <div
            v-for="task in filteredTimelinePendingTasks"
            :key="task.id"
            class="pending-card"
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
    <div v-else-if="viewMode === 'week'" class="weekly-view-body">
      <div 
        v-for="day in DAYS" 
        :key="day" 
        class="weekly-column"
        :class="{ 'is-today': day === getTodayDayCode() }"
      >
        <div class="weekly-column-header">
          <span class="day-dot" v-if="day === getTodayDayCode()"></span>
          <span class="weekly-column-title">{{ DAY_NAMES[day] }}</span>
          <span class="weekly-column-count">
            {{ getScheduledTasksForDay(day).length }}
          </span>
        </div>
        <div class="weekly-tasks-list">
          <div 
            v-for="task in getScheduledTasksForDay(day)" 
            :key="task.id" 
            class="weekly-task-card"
            :style="{ borderLeftColor: task.color }"
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
          <div v-if="getScheduledTasksForDay(day).length === 0" class="weekly-empty-placeholder">
            暂无日程
          </div>
        </div>
      </div>
    </div>

    <!-- Task Creation Modal -->
    <div class="modal-overlay" v-if="taskDialogVisible" @click="taskDialogVisible = false"></div>
    <div class="task-modal" v-if="taskDialogVisible">
      <div class="modal-header">
        <h3>✨ 新建排期任务块</h3>
        <button class="modal-close" @click="taskDialogVisible = false">×</button>
      </div>
      <div class="modal-body timeline-form-body">
        <div class="timeline-form-group">
          <label class="timeline-form-label">任务名称 *</label>
          <input v-model="newTaskForm.name" class="timeline-form-input" placeholder="例如：复习 JVM 垃圾回收" />
        </div>
        <div class="timeline-form-group">
          <label class="timeline-form-label">所属学科 *</label>
          <select v-model="newTaskForm.subjectId" class="timeline-form-select" @change="onDialogSubjectChange">
            <option value="" disabled>选择一个学科</option>
            <option v-for="subj in subjectStore.subjects" :key="subj.id" :value="subj.id">
              {{ subj.icon }} {{ subj.name }}
            </option>
          </select>
        </div>
        <div class="timeline-form-group" v-if="newTaskForm.subjectId">
          <label class="timeline-form-label">关联知识点 (可选)</label>
          <select v-model="newTaskForm.relatedBlockId" class="timeline-form-select">
            <option value="">无关联</option>
            <option v-for="block in dialogBlocks" :key="block.id" :value="block.id">
              {{ block.title }}
            </option>
          </select>
        </div>
        <div class="timeline-form-group">
          <label class="timeline-form-label">预计时长</label>
          <select v-model.number="newTaskForm.duration" class="timeline-form-select">
            <option :value="30">0.5 小时 (30分钟)</option>
            <option :value="60">1.0 小时 (60分钟)</option>
            <option :value="90">1.5 小时 (90分钟)</option>
            <option :value="120">2.0 小时 (120分钟)</option>
            <option :value="150">2.5 小时 (150分钟)</option>
            <option :value="180">3.0 小时 (180分钟)</option>
            <option :value="240">4.0 小时 (240分钟)</option>
          </select>
        </div>
        <div class="timeline-form-group">
          <label class="timeline-form-label">脑力负荷</label>
          <select v-model="newTaskForm.load" class="timeline-form-select">
            <option value="low">低负荷 (Low)</option>
            <option value="medium">中负荷 (Medium)</option>
            <option value="high">高负荷 (High)</option>
          </select>
        </div>
        <div class="timeline-form-group">
          <label class="timeline-form-label">任务描述备注</label>
          <textarea v-model="newTaskForm.desc" class="timeline-form-textarea" rows="3" placeholder="添加备注或任务要求..."></textarea>
        </div>
      </div>
      <div class="modal-footer timeline-modal-footer">
        <button class="btn-secondary" @click="taskDialogVisible = false">取消</button>
        <button class="btn-primary" @click="handleCreateTask">确认创建</button>
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
        <div class="modal-content" v-html="renderMarkdown(selectedBlock?.preview || '')"></div>
      </div>
      <div class="modal-footer">
        <button class="footer-btn secondary-btn" @click="copyBlockContent(selectedBlock?.preview)">复制内容</button>
        <button class="footer-btn primary-btn" @click="blockDialogVisible = false">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElNotification, ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message-box.css'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

import { useTaskStore, getTodayDayCode } from '@/store/useTaskStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useBlockStore } from '@/store/useBlockStore'

const taskStore = useTaskStore()
const { pendingTasks, allTasks, timeSlots, selectedDay, completedCount, pendingCount, totalFocusHours, aiSuggestions, hasOverload } = storeToRefs(taskStore)

const subjectStore = useSubjectStore()
const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)

// Core timeline states
const viewMode = ref<'day' | 'week'>('day')
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES: Record<string, string> = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日' }

const selectDay = async (day: string) => {
  taskStore.selectedDay = day
  await taskStore.loadLocalTasks()
}

const getScheduledTasksForDay = (day: string) => {
  return allTasks.value.filter(t => {
    if (t.status !== 'scheduled' || !t.startTime) return false
    const parts = t.startTime.split(' ')
    if (parts.length === 2) {
      return parts[0] === day
    }
    return day === getTodayDayCode() && t.startTime.includes(':')
  }).sort((a, b) => {
    const timeA = a.startTime!.split(' ').pop() || ''
    const timeB = b.startTime!.split(' ').pop() || ''
    return timeA.localeCompare(timeB)
  })
}

const getTaskTimeStr = (startTime?: string) => {
  if (!startTime) return ''
  return startTime.split(' ').pop() || ''
}

const HOUR_HEIGHT = 80
const getTaskHeight = (duration?: number) => {
  const d = duration || 60
  return `${(d / 60) * HOUR_HEIGHT}px`
}

const isSlotCovered = (slotTime: string) => {
  const targetSlot = timeSlots.value.find(s => s.time === slotTime)
  if (targetSlot?.task) return false

  const currentHour = parseInt(slotTime.split(':')[0], 10)
  for (const slot of timeSlots.value) {
    if (slot.task && slot.time !== slotTime) {
      const taskHour = parseInt(slot.time.split(':')[0], 10)
      const durationHours = slot.task.duration / 60
      if (currentHour > taskHour && currentHour < taskHour + durationHours) {
        return true
      }
    }
  }
  return false
}

onMounted(async () => {
  await taskStore.fetchTasks()
  await subjectStore.loadSubjects()
  await blockStore.fetchBlocks()
  await checkSpacedRepetition()
})

const stats = computed(() => [
  { icon: '📋', value: pendingCount.value.toString(), label: '待处理任务' },
  { icon: '🔥', value: completedCount.value.toString(), label: '累计已完成' },
  { icon: '⏱', value: totalFocusHours.value, label: '今日专注时长' },
  { icon: '🧠', value: hasOverload.value ? '⚠️ 过载' : pendingCount.value > 5 ? '较高' : '适中', label: '今日认知负荷' },
])

// Filter pending tasks (without subject filter)
const filteredPendingTasks = computed(() => {
  return pendingTasks.value
})

// Filter pending tasks displayed on the Timeline right-sidebar (exclude non-pending ones)
const filteredTimelinePendingTasks = computed(() => {
  return filteredPendingTasks.value.filter(t => t.status === 'pending')
})

// Timeline drag/drop logic
const draggedItem = ref<{ type: 'pending' | 'scheduled', idOrTime: string } | null>(null)
const dragOverSlot = ref<string | null>(null)
const dragOverPending = ref(false)

const handleDragStart = (e: DragEvent, type: 'pending' | 'scheduled', idOrTime: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', idOrTime)
  }
  draggedItem.value = { type, idOrTime }
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
    
    if (!exists && block.id) {
      await taskStore.addTask({
        name: taskName,
        subject: block.subject,
        desc: `艾宾浩斯复习曲线到期推荐。\n[KB_ID:${block.id}]`,
        color: block.color || 'rgba(181, 196, 177, 0.6)',
        duration: 25,
        load: 'low',
        loadText: '1.0 🧠',
        status: 'pending',
        subjectId: block.subjectId
      })
      
      // Compute next interval (e.g. +3 days) to avoid repeated creation today
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + 3)
      await blockStore.updateBlock({
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

const dialogBlocks = computed(() => {
  if (!newTaskForm.value.subjectId) return []
  return recentBlocks.value.filter(b => b.subjectId === newTaskForm.value.subjectId)
})

const onDialogSubjectChange = () => {
  newTaskForm.value.relatedBlockId = ''
}

const triggerImport = () => {
  router.push('/asset')
}

const triggerCreate = () => {
  newTaskForm.value = {
    name: '',
    subjectId: '',
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
    duration: newTaskForm.value.duration || 45,
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
  overflow-y: auto;
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
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
}

html.dark .timeline-header-card {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

/* Page header */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
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
  align-items: center;
  gap: 12px;
}

/* View switcher styling */
.view-toggle {
  display: flex;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md, 8px);
  padding: 2px;
}

.toggle-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.25s;
}

.toggle-btn:hover {
  color: var(--text-primary);
}

.toggle-btn.is-active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
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

/* Stats */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
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
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
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
  grid-template-columns: 280px 1fr 280px;
  gap: 8px;
}

.timeline-column, .tasks-column, .weekly-overview-column {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
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
  background: rgba(163, 177, 155, 0.08);
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
  color: var(--text-muted);
  margin-left: auto;
}

.weekly-overview-tasks-timeline {
  display: flex;
  align-items: center;
  gap: 6px;
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
  color: var(--text-muted);
  padding-top: 6px;
  flex-shrink: 0;
  text-align: right;
}

.slot-right-container {
  flex: 1;
  position: relative;
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
  display: flex;
  align-items: center;
  padding: 0 16px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 12px;
  transition: all var(--transition-normal);
  box-sizing: border-box;
}

.time-slot.drag-over .slot-empty {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-accent);
}

.time-slot.drag-over .slot-task {
  opacity: 0.6;
}

/* Current time indicator */
.is-current .slot-time {
  color: var(--color-oatmeal-dark);
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
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-oatmeal-dark);
  flex-shrink: 0;
  z-index: 1;
}

.current-line {
  flex: 1;
  height: 1px;
  background: var(--color-oatmeal-dark);
  opacity: 0.4;
}

/* Pending tasks sidebar */
.pending-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 240px;
  padding-bottom: 20px;
  transition: background var(--transition-normal);
  border-radius: var(--radius-md);
}

.pending-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: grab;
  transition: all var(--transition-normal);
}

.pending-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateX(-2px);
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

.task-modal, .block-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 440px;
  background: var(--glass-bg, rgba(28, 28, 30, 0.85));
  backdrop-filter: var(--glass-blur, blur(20px));
  -webkit-backdrop-filter: var(--glass-blur, blur(20px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
  z-index: 201;
  display: flex;
  flex-direction: column;
  animation: modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.block-modal {
  max-width: 540px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  padding: 20px;
  overflow-y: auto;
  max-height: 60vh;
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
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.timeline-form-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
}

.timeline-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.timeline-form-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
}

.timeline-form-input, .timeline-form-select, .timeline-form-textarea {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
  font-size: 12.5px;
}

.timeline-form-input:focus, .timeline-form-select:focus, .timeline-form-textarea:focus {
  border-color: var(--color-oatmeal-dark);
}

.timeline-form-textarea {
  resize: vertical;
}

.timeline-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

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

.day-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
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
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 480px;
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  box-sizing: border-box;
}

html.dark .weekly-column {
  background: var(--color-bg-secondary);
  border-color: var(--border-subtle);
}

.weekly-column.is-today {
  border-color: var(--color-primary-accent, #7D9372);
  background: rgba(163, 177, 155, 0.08);
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
</style>
