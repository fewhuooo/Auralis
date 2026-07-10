<template>
  <div class="dashboard-container" ref="containerRef">
    <!-- LEFT: Subject Index Tree (20%) -->
    <nav class="subject-index" :style="{ width: navWidthPercent + '%' }">
      <div class="index-header">
        <h1 class="welcome-title">{{ greeting }}，{{ username }}</h1>
        <p class="welcome-sub">已完成 {{ completedCount }} 项 · {{ totalFocusHours }}</p>
      </div>
      <ul class="subject-list">
        <li
          v-for="subj in allSubjectsOption"
          :key="subj.id ?? 'all'"
          class="subject-item"
          :class="{ 'is-active': selectedSubjectId === subj.id }"
          @click="selectSubject(subj.id)"
        >
          <span v-if="selectedSubjectId === subj.id" class="active-dot" :style="{ background: subj.color }"></span>
          <span class="subject-icon">{{ subj.icon }}</span>
          <span class="subject-name">{{ subj.name }}</span>
          <span class="subject-count">{{ subj.blockCount || 0 }}</span>
        </li>
      </ul>
      <button class="manage-subjects-btn" @click="router.push('/subjects')">管理学科</button>
    </nav>

    <!-- Splitter 1: between left nav and content stream -->
    <div class="splitter splitter-v" @mousedown="startNavResize"></div>

    <!-- CENTER: Content Stream -->
    <main class="content-stream">
      <div class="stream-header">
        <h3 class="stream-title">知识流</h3>
        <button class="link-btn" @click="router.push('/subjects')">查看全部</button>
      </div>
      <div class="stream-body" v-if="filteredBlocks.length > 0">
        <div
          v-for="block in filteredBlocks.slice(0, 20)"
          :key="block.id"
          class="stream-row"
          @click="openBlockDetail(block)"
        >
          <div class="row-title">{{ block.title }}</div>
          <div class="row-meta">
            <span class="row-tag" :style="{ color: block.color }">{{ block.subject }}</span>
            <span class="row-dot">·</span>
            <span class="row-source">{{ block.source }}</span>
            <span class="row-dot">·</span>
            <span class="row-time">{{ timeAgo(block.time) }}</span>
          </div>
          <p class="row-preview" v-if="block.preview">{{ block.preview }}</p>
        </div>
      </div>
      <div class="empty-stream" v-else>
        <span>暂无知识块，可在学科空间中添加</span>
        <button class="create-first-btn" @click="router.push('/subjects')">创建学科空间</button>
      </div>
    </main>

    <!-- Splitter 2: between content and right panel -->
    <div class="splitter splitter-v" @mousedown="startMainResize"></div>

    <!-- RIGHT: Compact Timeline + Todo List (30%) -->
    <div class="dashboard-right" :style="{ width: (100 - navWidthPercent - mainLeftPercent) + '%' }">
      <!-- Compact Timeline (top 70%) -->
      <section class="compact-timeline">
        <div class="timeline-header">
          <h3 class="timeline-title">时间轴 ({{ DAY_NAMES[selectedDay] }})</h3>
          <div class="dashboard-time-actions">
            <select v-model="dashboardViewMode" class="db-view-select">
              <option value="day">日视图</option>
              <option value="week">周视图</option>
            </select>
            <button class="new-task-btn" @click="openCreateTaskDialog">+ 新建</button>
          </div>
        </div>

        <!-- Weekday Selector inside Day View -->
        <div v-if="dashboardViewMode === 'day'" class="db-day-selector">
          <button 
            v-for="day in DAYS" 
            :key="day" 
            class="db-day-btn"
            :class="{ 'is-active': selectedDay === day }"
            @click="selectDay(day)"
          >
            {{ DAY_SHORT_NAMES[day] }}
          </button>
        </div>

        <!-- Timeline Day Slots -->
        <div v-if="dashboardViewMode === 'day'" class="timeline-scroll">
          <div
            v-for="slot in filteredTimeSlots"
            :key="slot.time"
            class="tl-slot"
            :class="{
              'has-task': slot.task,
              'is-current': slot.isCurrent,
              'is-empty': !slot.task,
              'drag-over': dragOverSlot === slot.time
            }"
            v-show="!isSlotCovered(slot.time)"
            @dragover.prevent="handleDragOver(slot.time)"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop(slot.time)"
          >
            <span class="tl-time">{{ slot.time }}</span>
            <span class="tl-dash" v-if="!slot.task"></span>
            <div
              v-if="slot.task"
              class="tl-task"
              :style="{ 
                borderLeftColor: slot.task.color,
                height: getTaskHeight(slot.task.duration)
              }"
              draggable="true"
              @dragstart.stop="handleDragStart($event, 'scheduled', slot.time)"
            >
              <span class="tl-task-name">{{ slot.task.name }}</span>
              <button class="task-delete-btn" @click.stop="handleDeleteScheduledTask(slot)">✕</button>
            </div>
            <div v-else class="tl-empty"></div>
            <div v-if="slot.isCurrent" class="current-indicator">
              <span class="current-dot"></span>
              <span class="current-line"></span>
            </div>
          </div>
        </div>

        <!-- Weekly Summary List (Gantt-like Rows) -->
        <div v-else class="db-weekly-list-gantt">
          <div 
            v-for="day in DAYS" 
            :key="day" 
            class="db-weekly-day-row"
            :class="{ 'is-today': day === getTodayDayCode() }"
            @click="selectDay(day); dashboardViewMode = 'day';"
          >
            <div class="db-weekly-row-label">
              <span class="db-weekly-row-name">{{ DAY_NAMES[day] }}</span>
              <span class="db-weekly-row-count">{{ getScheduledTasksForDay(day).length }} 项</span>
            </div>
            <div class="db-weekly-row-timeline">
              <div 
                v-for="task in getScheduledTasksForDay(day)" 
                :key="task.id" 
                class="db-weekly-task-block"
                :style="{ borderLeftColor: task.color, backgroundColor: task.color + '15' }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name} (${task.duration}m)`"
              >
                <span class="db-weekly-block-time">{{ getTaskTimeStr(task.startTime) }}</span>
                <span class="db-weekly-block-name">{{ task.name }}</span>
              </div>
              <div v-if="getScheduledTasksForDay(day).length === 0" class="db-weekly-row-empty">
                空闲
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Horizontal divider -->
      <div class="right-divider"></div>

      <!-- Todo List (bottom 30%) -->
      <section class="todo-section">
        <div class="todo-header">
          <h3 class="todo-title">待办清单</h3>
        </div>
        <div
          class="todo-list"
          :class="{ 'drag-over': dragOverPending }"
          @dragover.prevent="dragOverPending = true"
          @dragleave.prevent="dragOverPending = false"
          @drop.prevent="handleDropOnPending"
        >
          <div
            v-for="task in filteredPendingTasks"
            :key="task.id"
            class="todo-item"
            draggable="true"
            @dragstart.stop="handleDragStart($event, 'pending', task.id || '')"
          >
            <input
              type="checkbox"
              :checked="task.status === 'completed'"
              @change="toggleTaskCompletion(task)"
              class="task-checkbox"
              @click.stop
            />
            <div class="todo-color" :style="{ background: task.color }"></div>
            <span class="todo-name">{{ task.name }}</span>
            <span class="todo-subject">{{ task.subject }}</span>
            <span class="drag-handle" title="拖拽至时间轴">⠿</span>
          </div>
          <div v-if="filteredPendingTasks.length === 0" class="empty-pending">
            <span>🎉 所有任务已排期或完成</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Block Detail Modal -->
    <div class="modal-overlay" v-if="blockDialogVisible" @click="blockDialogVisible = false"></div>
    <div class="block-modal" v-if="blockDialogVisible">
      <div class="modal-header">
        <div class="modal-tags">
          <span class="modal-tag" :style="{ background: selectedBlock?.color || 'var(--border-subtle)' }">
            {{ selectedBlock?.subject || '知识片' }}
          </span>
          <span class="modal-source-tag">来源: {{ selectedBlock?.source }}</span>
        </div>
        <button class="modal-close" @click="blockDialogVisible = false">×</button>
      </div>
      <div class="modal-body">
        <h2 class="modal-title">{{ selectedBlock?.title }}</h2>
        <div class="modal-time">⏰ 记于 {{ selectedBlock?.time }}</div>
        <div class="modal-divider"></div>
        <div class="modal-content" v-html="renderMarkdown(selectedBlock?.preview || '')"></div>
      </div>
      <div class="modal-footer">
        <button class="footer-btn primary-btn" @click="blockDialogVisible = false">确定</button>
      </div>
    </div>

    <!-- Create Task Modal -->
    <div class="modal-overlay" v-if="showTaskModal" @click="showTaskModal = false"></div>
    <div class="block-modal task-modal" v-if="showTaskModal">
      <div class="modal-header">
        <h3 style="margin:0; font-weight:700; color:var(--text-primary);">创建学习任务</h3>
        <button class="modal-close" @click="showTaskModal = false">×</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
        <div class="form-group">
          <label class="form-label">任务名称 *</label>
          <input v-model="taskForm.name" class="form-input" placeholder="例如: 学习网络层协议" />
        </div>
        <div class="form-group">
          <label class="form-label">归属学科 *</label>
          <select v-model="taskForm.subjectId" class="form-input">
            <option v-for="subj in subjectStore.subjects" :key="subj.id" :value="subj.id">
              {{ subj.icon }} {{ subj.name }}
            </option>
            <option value="" disabled v-if="subjectStore.subjects.length === 0">暂无学科，请先创建</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">预计专注时长</label>
          <select v-model.number="taskForm.duration" class="form-input">
            <option :value="30">0.5 小时 (30分钟)</option>
            <option :value="60">1.0 小时 (60分钟)</option>
            <option :value="90">1.5 小时 (90分钟)</option>
            <option :value="120">2.0 小时 (120分钟)</option>
            <option :value="150">2.5 小时 (150分钟)</option>
            <option :value="180">3.0 小时 (180分钟)</option>
            <option :value="240">4.0 小时 (240分钟)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">脑力负荷</label>
          <select v-model="taskForm.load" class="form-input" @change="updateTaskLoadText">
            <option value="low">低负荷 (Low)</option>
            <option value="medium">中负荷 (Medium)</option>
            <option value="high">高负荷 (High)</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="footer-btn secondary-btn" @click="showTaskModal = false">取消</button>
        <button class="footer-btn primary-btn" :disabled="!taskForm.name.trim() || !taskForm.subjectId" @click="handleAddTask">
          加入排期
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'

import { useBlockStore } from '@/store/useBlockStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore, type Task, getTodayDayCode } from '@/store/useTaskStore'

marked.setOptions({ breaks: true, gfm: true })
const renderMarkdown = (content: string) => {
  if (!content) return ''
  return DOMPurify.sanitize(marked.parse(content) as string)
}

const router = useRouter()
const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)
const subjectStore = useSubjectStore()
const taskStore = useTaskStore()
const { pendingTasks, allTasks, timeSlots, selectedDay } = storeToRefs(taskStore)
const authStore = useAuthStore()

const dashboardViewMode = ref<'day' | 'week'>('day')
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES: Record<string, string> = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日' }
const DAY_SHORT_NAMES: Record<string, string> = { Mon: '一', Tue: '二', Wed: '三', Thu: '四', Fri: '五', Sat: '六', Sun: '日' }

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
  return startTime.split(' ').pop() || startTime
}

const username = computed(() => authStore.username || '同学')
const completedCount = computed(() => taskStore.completedCount)
const totalFocusHours = computed(() => taskStore.totalFocusHours)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

// ===== Resize Logic =====
const containerRef = ref<HTMLElement | null>(null)
const navWidthPercent = ref(25)      // left nav width as % of container
const mainLeftPercent = ref(50)      // content stream width as % of container
// right panel width = 100 - navWidthPercent - mainLeftPercent

let activeResize: 'nav' | 'main' | null = null
let resizeStartX = 0
let resizeStartNav = 0
let resizeStartMain = 0

const onMouseMove = (e: MouseEvent) => {
  if (!activeResize || !containerRef.value) return
  const containerWidth = containerRef.value.getBoundingClientRect().width
  const deltaPercent = ((e.clientX - resizeStartX) / containerWidth) * 100

  if (activeResize === 'nav') {
    navWidthPercent.value = Math.max(15, Math.min(45, resizeStartNav + deltaPercent))
  } else if (activeResize === 'main') {
    const newMain = resizeStartMain + deltaPercent
    const rightWidth = 100 - navWidthPercent.value - newMain
    if (newMain >= 25 && rightWidth >= 20) {
      mainLeftPercent.value = newMain
    }
  }
}

const onMouseUp = () => {
  activeResize = null
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const startNavResize = (e: MouseEvent) => {
  e.preventDefault()
  activeResize = 'nav'
  resizeStartX = e.clientX
  resizeStartNav = navWidthPercent.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const startMainResize = (e: MouseEvent) => {
  e.preventDefault()
  activeResize = 'main'
  resizeStartX = e.clientX
  resizeStartMain = mainLeftPercent.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

// ===== Subject Tree =====
const selectedSubjectId = ref<string | null>(null)

const selectSubject = (id: string | null) => {
  selectedSubjectId.value = id
}

const allSubjectsOption = computed(() => {
  return [
    { id: null as string | null, name: '全部', icon: '📋', color: 'var(--text-muted)', blockCount: recentBlocks.value.length },
    ...subjectStore.subjects
  ]
})

const filteredBlocks = computed(() => {
  if (!selectedSubjectId.value) return recentBlocks.value
  return recentBlocks.value.filter(b => b.subjectId === selectedSubjectId.value)
})

const timeAgo = (isoString: string): string => {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

// ===== Task Creation =====
const showTaskModal = ref(false)
const taskForm = ref({
  name: '',
  subjectId: '',
  duration: 60,
  load: 'medium' as 'low' | 'medium' | 'high',
  loadText: '2.0 🧠'
})

const openCreateTaskDialog = () => {
  taskForm.value = {
    name: '',
    subjectId: subjectStore.subjects[0]?.id || '',
    duration: 60,
    load: 'medium' as 'low' | 'medium' | 'high',
    loadText: '2.0 🧠'
  }
  showTaskModal.value = true
}

const updateTaskLoadText = () => {
  if (taskForm.value.load === 'low') taskForm.value.loadText = '1.0 🧠'
  else if (taskForm.value.load === 'medium') taskForm.value.loadText = '2.0 🧠'
  else taskForm.value.loadText = '3.0 🧠'
}

const handleAddTask = async () => {
  const subjObj = subjectStore.subjects.find(s => s.id === taskForm.value.subjectId)
  if (!taskForm.value.name.trim() || !subjObj) return

  try {
    await taskStore.addTask({
      name: taskForm.value.name.trim(),
      subject: subjObj.name,
      desc: '从看板创建',
      color: subjObj.color,
      duration: taskForm.value.duration,
      load: taskForm.value.load,
      loadText: taskForm.value.loadText,
      status: 'pending',
      subjectId: subjObj.id
    })
    showTaskModal.value = false
    ElNotification({
      title: '🎯 任务已生成',
      message: `"${taskForm.value.name}" 已加入待安排列表。`,
      type: 'success',
      position: 'top-right'
    })
  } catch (e) {
    console.error(e)
  }
}

const filteredPendingTasks = computed(() => {
  return pendingTasks.value.filter(t => t.status === 'pending')
})

const filteredTimeSlots = computed(() => timeSlots.value)

const HOUR_HEIGHT = 60
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

// ===== Block Detail =====
const blockDialogVisible = ref(false)
const selectedBlock = ref<any>(null)

const openBlockDetail = (block: any) => {
  selectedBlock.value = block
  blockDialogVisible.value = true
}

// ===== Drag & Drop =====
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

const handleDragLeave = () => { dragOverSlot.value = null }

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

const handleDeleteScheduledTask = async (slot: any) => {
  if (slot.task && slot.task.id) {
    await taskStore.unscheduleTask(slot.time)
    ElNotification({ title: '已移出排期', type: 'success', position: 'top-right', duration: 2000 })
  }
}

const toggleTaskCompletion = async (task: Task) => {
  if (!task.id) return
  const newStatus = task.status === 'completed' ? 'pending' : 'completed'
  await taskStore.updateTaskStatus(task.id, newStatus)
}

onMounted(async () => {
  await blockStore.fetchBlocks()
  await taskStore.fetchTasks()
  await subjectStore.loadSubjects()
})
</script>

<style scoped>
/* ===== Root Layout ===== */
.dashboard-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-zen-ivory); /* Zen Ivory base */
  padding: 8px;
  gap: 8px;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #7D9372;
  --color-primary-accent-hover: #6c8062;
  --color-primary-light: rgba(163, 177, 155, 0.12);
  --color-primary-glow: rgba(163, 177, 155, 0.25);
  --accent-gradient: var(--color-zen-sage);
}

html.dark .dashboard-container {
  background: #121110;
}

/* ===== Splitters ===== */
.splitter {
  width: 8px;
  margin: 0 -4px;
  flex-shrink: 0;
  background: transparent;
  position: relative;
  cursor: col-resize;
  transition: background var(--transition-fast);
  z-index: 5;
}

.splitter::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2px;
  right: -2px;
}

.splitter:hover {
  width: 8px;
  background: var(--color-primary-light);
  border-radius: 4px;
}

/* ===== Left: Subject Index Tree ===== */
.subject-index {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-6) var(--spacing-4);
  overflow-y: auto;
  flex-shrink: 0;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .subject-index {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

.index-header {
  margin-bottom: var(--spacing-6);
}

.welcome-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
}

.welcome-sub {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 3px;
  white-space: nowrap;
}

.subject-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.subject-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
  position: relative;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.subject-item:hover {
  background: rgba(255, 255, 255, 0.5);
}

.subject-item.is-active {
  font-weight: 700;
  color: var(--text-primary);
  background: var(--color-bg-primary);
  box-shadow: var(--shadow-sm);
}

.active-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.subject-icon {
  font-size: 14px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.subject-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subject-count {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.manage-subjects-btn {
  background: none;
  border: 1px dashed var(--border-default);
  color: var(--text-muted);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  margin-top: auto;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.manage-subjects-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

/* ===== Content Stream ===== */
.content-stream {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  padding: var(--spacing-6) var(--spacing-8);
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .content-stream {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

.stream-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-4);
  flex-shrink: 0;
}

.stream-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.link-btn {
  background: none;
  border: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-accent);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.link-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.stream-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.stream-row {
  padding: 14px 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition-fast);
  border-radius: var(--radius-sm);
}

.stream-row:hover {
  background: var(--glass-bg);
}

.row-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
  line-height: 1.4;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.row-tag {
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.row-dot {
  opacity: 0.4;
  font-size: 10px;
}

.row-source {
  opacity: 0.7;
}

.row-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-stream {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-4);
  padding: var(--spacing-10);
  color: var(--text-muted);
  font-size: 12px;
}

.create-first-btn {
  background: var(--accent-gradient);
  border: none;
  color: white;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.create-first-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* ===== Right Panel ===== */
.dashboard-right {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--color-bg-primary);
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .dashboard-right {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

/* ===== Compact Timeline (top 70%) ===== */
.compact-timeline {
  flex: 7;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--spacing-4) var(--spacing-4) var(--spacing-3);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-3);
  flex-shrink: 0;
}

.timeline-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.new-task-btn {
  background: var(--accent-gradient);
  color: white;
  border: none;
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 700;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}

.new-task-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.dashboard-time-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.db-view-select {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 10px;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: all var(--transition-fast);
}

.db-view-select:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.db-day-selector {
  display: flex;
  gap: 4px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.db-day-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  padding: 4px;
  border-radius: 4px;
  font-size: 9px;
  cursor: pointer;
  color: var(--text-muted);
  flex: 1;
  text-align: center;
  font-weight: 600;
  transition: all var(--transition-fast);
}

.db-day-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.db-day-btn.is-active {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
  font-weight: 800;
}

.db-weekly-list-gantt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.db-weekly-day-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.db-weekly-day-row:hover {
  border-color: var(--border-strong);
  background: rgba(255, 255, 255, 0.04);
}

.db-weekly-day-row.is-today {
  border-color: var(--color-primary-accent, #7D9372);
  background: rgba(163, 177, 155, 0.08);
}

.db-weekly-row-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.db-weekly-row-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-primary);
}

.db-weekly-row-count {
  font-size: 9px;
  color: var(--text-muted);
}

.db-weekly-row-timeline {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.db-weekly-row-timeline::-webkit-scrollbar {
  height: 2px;
}

.db-weekly-task-block {
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  border-left: 2.5px solid;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
  flex-shrink: 0;
  min-width: 80px;
  max-width: 120px;
  box-sizing: border-box;
}

.db-weekly-block-time {
  font-size: 8px;
  color: var(--text-muted);
  font-weight: 600;
}

.db-weekly-block-name {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-weekly-row-empty {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.6;
  padding: 2px 0;
}

.timeline-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.tl-slot {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 52px;
  position: relative;
  transition: background var(--transition-fast);
  padding: 6px 4px;
  box-sizing: border-box;
}

.tl-slot.has-task {
  padding: 2px 4px;
}

.tl-time {
  width: 36px;
  font-size: 9px;
  font-weight: 500;
  color: var(--text-muted);
  text-align: right;
  flex-shrink: 0;
  letter-spacing: -0.2px;
  opacity: 0.7;
  margin-top: 8px;
}

.tl-slot.is-current .tl-time {
  color: var(--color-oatmeal-dark);
  font-weight: 800;
  opacity: 1;
}

.tl-dash {
  flex: 1;
  height: 0;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
  flex-shrink: 1;
  min-width: 0;
}

.tl-slot.has-task .tl-dash {
  display: none;
}

.tl-task {
  flex: 1;
  padding: 8px 10px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-left: 3px solid;
  border-radius: var(--radius-sm);
  cursor: grab;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  box-sizing: border-box;
}

.tl-task:hover {
  border-color: var(--border-strong);
}

.tl-task-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.task-delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 9px;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast);
  padding: 2px;
  flex-shrink: 0;
}

.tl-task:hover .task-delete-btn { opacity: 0.8; }
.task-delete-btn:hover { color: #ef4444; }

.tl-empty {
  flex: 1;
}

.tl-slot.drag-over {
  background: rgba(255, 255, 255, 0.04);
}

.tl-slot.drag-over .tl-dash {
  border-top-color: var(--border-accent);
}

.current-indicator {
  position: absolute;
  left: 48px;
  right: 0;
  top: 0;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.current-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-oatmeal-dark);
  z-index: 1;
}

.current-line {
  flex: 1;
  height: 1px;
  background: var(--color-oatmeal-dark);
  opacity: 0.3;
}

/* ===== Right Divider ===== */
.right-divider {
  height: 1px;
  background: var(--border-subtle);
  flex-shrink: 0;
  margin: 0 var(--spacing-4);
}

/* ===== Todo Section (bottom 30%) ===== */
.todo-section {
  flex: 3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--spacing-3) var(--spacing-4) var(--spacing-4);
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-3);
  flex-shrink: 0;
}

.todo-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.todo-list.drag-over {
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-sm);
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  cursor: grab;
  transition: background var(--transition-fast);
  border-radius: var(--radius-sm);
}

.todo-item:hover {
  background: var(--glass-bg);
}

.task-checkbox {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--color-oatmeal-dark);
}

.todo-color {
  width: 3px;
  height: 20px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.todo-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.todo-subject {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.drag-handle {
  color: var(--text-muted);
  font-size: 12px;
  opacity: 0.3;
  cursor: grab;
  flex-shrink: 0;
}

.todo-item:hover .drag-handle { opacity: 0.7; }

.empty-pending {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  padding: 20px 0;
}

/* ===== Form Styles ===== */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-input {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  font-family: inherit;
  transition: border-color var(--transition-fast);
}

.form-input:focus {
  border-color: var(--border-accent);
}

/* ===== Modals ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.block-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 520px;
  max-height: 80vh;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--glass-shadow);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-weight: 500;
}

.modal-source-tag {
  font-size: 10px;
  color: var(--text-muted);
}

.modal-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.modal-time {
  font-size: 11px;
  color: var(--text-muted);
}

.modal-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 16px 0;
}

.modal-content {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}

.footer-btn {
  padding: 6px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.primary-btn {
  background: var(--accent-gradient);
  color: white;
  border: none;
}

.primary-btn:hover {
  opacity: 0.9;
}
</style>
