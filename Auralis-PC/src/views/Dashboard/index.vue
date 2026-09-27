<template>
  <div class="dashboard-container" ref="containerRef" :style="dashboardGridStyle">
    <!-- LEFT: Subject Index Tree (20%) -->
    <nav class="subject-index">
      <div class="index-header">
        <h1 class="welcome-title">{{ greeting }}，{{ username }}</h1>
        <p class="welcome-sub">已完成 {{ completedCount }} 项 · {{ totalFocusHours }}</p>
      </div>
      <div 
        class="global-view-card"
        :class="{ 'is-active': selectedSubjectId === null }"
        @click="selectSubject(null)"
      >
        <div class="global-icon-wrap">
          <IconLayoutGrid :size="18" :stroke-width="1.6" />
        </div>
        <div class="global-text-wrap">
          <span class="global-title">全部知识</span>
        </div>
        <span class="global-count">{{ allSubjectsOption[0].blockCount }}</span>
      </div>

      <div class="section-label">学科空间</div>

      <ul class="subject-list">
        <li
          v-for="subj in allSubjectsOption.slice(1)"
          :key="subj.id!"
          class="subject-item"
          :class="{ 'is-active': selectedSubjectId === subj.id }"
          @click="selectSubject(subj.id)"
        >
          <span v-if="selectedSubjectId === subj.id" class="active-dot" :style="{ background: SUBJECT_THEME_COLOR }"></span>
          <span class="subject-icon">
            <component
              v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)"
              :is="getSubjectIconComponent(subj.icon)"
              style="width: 1em; height: 1em;"
            />
            <span v-else>{{ getLegacySubjectIcon(subj.icon) }}</span>
          </span>
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
            <!-- 采用统一的浅鼠尾草绿背景+深色文字微标签 (Badge) -->
            <span class="row-subj-badge">{{ block.subject }}</span>
            <span class="row-source-badge">来源: {{ block.source }}</span>
            <span class="row-time-badge" style="display: inline-flex; align-items: center; gap: 4px;">
              <IconHistory :size="12" :stroke-width="1.6" />
              {{ timeAgo(block.time) }}
            </span>
          </div>
          <div class="row-preview" v-if="block.preview" v-html="renderMarkdown(block.preview || '')"></div>
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
    <div class="dashboard-right">
      <!-- Compact Timeline (top 70%) -->
      <section class="compact-timeline">
        <div class="timeline-header">
          <h3 class="timeline-title">时间轴 · {{ selectedTimelineDay.monthLabel }}</h3>
          <div class="dashboard-time-actions">
            <div class="db-view-toggle">
              <button 
                class="db-view-toggle-btn" 
                :class="{ 'is-active': dashboardViewMode === 'day' }"
                @click="setDashboardViewMode('day')"
              >
                日视图
              </button>
              <button 
                class="db-view-toggle-btn" 
                :class="{ 'is-active': dashboardViewMode === 'week' }"
                @click="setDashboardViewMode('week')"
              >
                周视图
              </button>
            </div>
            <button class="todo-fab-add-btn" @click="openCreateTaskDialog" title="新建任务">+</button>
          </div>
        </div>

        <div v-if="dashboardViewMode === 'day'" class="db-day-selector">
          <button 
            v-for="day in timelineDays"
            :key="day.dateKey"
            class="db-day-btn"
            :class="{ 'is-active': selectedDay === day.dayCode, 'is-today': day.isToday }"
            @click="selectDay(day.dayCode)"
          >
            <span class="db-day-week">{{ day.weekdayShort }}</span>
            <span class="db-day-date-circle">
              <span class="db-day-date">{{ day.dayLabel }}</span>
            </span>
          </button>
        </div>

        <!-- Day Tasks List: Simple Linear Task List (No timeline grid, no drag) -->
        <div v-if="dashboardViewMode === 'day'" class="scheduled-task-list">
          <div
            v-for="task in dayScheduledTasks"
            :key="task.id"
            class="scheduled-task-card"
            :class="{ 'is-completed': isCompletedScheduledTask(task) }"
          >
            <input
              type="checkbox"
              :checked="isCompletedScheduledTask(task)"
              :disabled="isScheduledCompletionLocked(task, taskStore.currentNow)"
              :title="isScheduledCompletionLocked(task, taskStore.currentNow) ? '任务时段已结束，完成状态不可取消' : '切换任务完成状态'"
              @change="toggleTaskCompletion(task)"
              class="task-checkbox"
              @click.stop
            />
            <div
              class="scheduled-task-content"
              :class="{ 'is-completion-locked': isScheduledCompletionLocked(task, taskStore.currentNow) }"
              @click="toggleTaskCompletion(task)"
            >
              <div class="scheduled-task-header">
                <span class="scheduled-task-time">
                  {{ getTaskTimeStr(task.startTime) }} · {{ task.duration || 30 }}m
                </span>
                <span class="scheduled-task-subject" v-if="task.subject">{{ task.subject }}</span>
              </div>
              <div class="scheduled-task-title">{{ task.name }}</div>
            </div>
            <button
              v-if="!isCompletedScheduledTask(task)"
              class="scheduled-task-remove-btn"
              @click.stop="handleRemoveSchedule(task)"
              title="移出日程"
            >✕</button>
          </div>
          <div v-if="dayScheduledTasks.length === 0" class="empty-scheduled-state">
            <span class="empty-scheduled-text">当日暂无排期任务</span>
          </div>
        </div>

        <!-- Weekly Summary List (Gantt-like Rows) -->
        <div v-else class="db-weekly-list-gantt">
          <div 
            v-for="day in timelineDays"
            :key="day.dateKey"
            class="db-weekly-day-row"
            :class="{ 'is-today': day.isToday }"
            @click="selectDay(day.dayCode); dashboardViewMode = 'day';"
          >
            <div class="db-weekly-row-label">
              <span class="db-weekly-row-name">{{ day.weekdayLabel }} {{ day.monthDayLabel }}</span>
              <span class="db-weekly-row-count">{{ getScheduledTasksForDay(day.dayCode).length }} 项</span>
            </div>
            <div class="db-weekly-row-timeline">
              <div 
                v-for="task in getScheduledTasksForDay(day.dayCode)"
                :key="task.id" 
                class="db-weekly-task-block"
                :class="{ 'is-completed': isCompletedScheduledTask(task) }"
                :style="{ borderLeftColor: 'var(--color-primary-accent)' }"
                :title="`${getTaskTimeStr(task.startTime)} ${task.name} (${task.duration}m)`"
              >
                <span class="db-weekly-block-time">{{ getTaskTimeStr(task.startTime) }}</span>
                <span class="db-weekly-block-name">{{ task.name }}</span>
              </div>
              <div v-if="getScheduledTasksForDay(day.dayCode).length === 0" class="db-weekly-row-empty">
                空闲
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Horizontal divider -->
      <div class="right-divider"></div>

      <!-- Todo List (bottom, simple task list, no drag) -->
      <section class="todo-section">
        <div class="todo-header">
          <h3 class="todo-title">待办清单</h3>
          <button class="todo-jump-btn" @click="router.push('/timeline')" title="前往排期副驾">
            <span>前往排期</span>
            <IconChevronRight :size="12" :stroke-width="2" />
          </button>
        </div>
        <div class="todo-list">
          <div
            v-for="task in filteredPendingTasks"
            :key="task.id"
            class="todo-item"
          >
            <div class="todo-color" :style="{ background: 'var(--color-primary-accent)' }"></div>
            <span class="todo-name">{{ task.name }}</span>
            <span v-if="task.dueAt" class="todo-due-badge" :class="{ 'is-overdue': isTaskOverdue(task) }">
              {{ formatTaskDue(task.dueAt) }}
            </span>
            <span class="todo-subject" v-if="task.subject">{{ task.subject }}</span>
          </div>
          <div v-if="filteredPendingTasks.length === 0" class="empty-pending">
            <span class="empty-pending-content">
              <IconCircleCheck :size="15" :stroke-width="1.8" class="empty-pending-icon" />
              所有任务已完成
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- Block Detail Modal -->
    <KnowledgeBlockViewDialog
      v-model="blockDialogVisible"
      :block="selectedBlock"
    />

    <!-- Create Task Modal -->
    <TaskCreateDialog
      v-model="showTaskModal"
      :subjects="availableSubjectsForTask"
      @submit="handleAddTask"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'

import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore, type Task, type TaskPresentationStatus, DAY_CODES, getTodayDayCode } from '@/store/useTaskStore'
import { getTasksForTimeline, getTimelineDays, isCompletedScheduledTask, isCompletedTask, isScheduledCompletionLocked, comparePendingTasks } from '@/services/taskViewRules'
import { IconLayoutGrid, IconHistory, IconCircleCheck, IconChevronRight } from '@tabler/icons-vue'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'
import TaskCreateDialog from '@/components/task/TaskCreateDialog.vue'
import KnowledgeBlockViewDialog from '@/components/knowledge/KnowledgeBlockViewDialog.vue'

marked.setOptions({ breaks: true, gfm: true })
const SUBJECT_THEME_COLOR = '#8B9A6E'
const renderMarkdown = (content: string) => {
  if (!content) return ''
  return DOMPurify.sanitize(marked.parse(content) as string)
}

const router = useRouter()
const route = useRoute()
const knowledgeStore = useKnowledgeStore()
const { recentBlocks } = storeToRefs(knowledgeStore)
const subjectStore = useSubjectStore()
const taskStore = useTaskStore()
const { pendingTasks, allTasks, selectedDay } = storeToRefs(taskStore)
const authStore = useAuthStore()

const dashboardViewMode = ref<'day' | 'week'>('day')
const timelineDays = computed(() => getTimelineDays(taskStore.currentNow))
const selectedTimelineDay = computed(() => timelineDays.value.find((day) => day.dayCode === selectedDay.value) ?? timelineDays.value[0])

const resetToToday = () => {
  taskStore.setSelectedDay(getTodayDayCode())
}

const setDashboardViewMode = (mode: 'day' | 'week') => {
  dashboardViewMode.value = mode
  if (mode === 'day') {
    resetToToday()
  }
}

watch(
  () => route.path,
  (newPath) => {
    if (newPath === '/') {
      resetToToday()
    }
  }
)

const selectDay = (day: string) => {
  taskStore.setSelectedDay(day)
}

const getScheduledTasksForDay = (day: string) => {
  return getTasksForTimeline(allTasks.value).filter((task) => {
    if (!task.scheduledAt) return false
    return DAY_CODES[new Date(task.scheduledAt).getDay()] === day
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
const dashboardGridStyle = computed(() => ({
  gridTemplateColumns: `${navWidthPercent.value}fr 8px ${mainLeftPercent.value}fr 8px ${Math.max(20, 100 - navWidthPercent.value - mainLeftPercent.value)}fr`,
}))

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
  const subjectsList = subjectStore.subjects
  const count = recentBlocks.value.length
  return [
    { id: null as string | null, name: '全部', icon: '📋', color: 'var(--text-muted)', blockCount: count },
    ...subjectsList
  ]
})

const filteredBlocks = computed(() => {
  const blocksList = recentBlocks.value
  if (!selectedSubjectId.value) return blocksList
  return blocksList.filter(b => b.subjectId === selectedSubjectId.value || b.subject === selectedSubjectId.value)
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

const isTaskOverdue = (task: Task): boolean => {
  if (!task.dueAt) return false
  return new Date(task.dueAt).getTime() < taskStore.currentNow.getTime()
}

const formatTaskDue = (dueAt?: string): string => {
  if (!dueAt) return ''
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} 截止`
}

// ===== Task Creation =====
const showTaskModal = ref(false)

const availableSubjectsForTask = computed(() => {
  return subjectStore.subjects
})

const openCreateTaskDialog = () => {
  showTaskModal.value = true
}

const handleAddTask = async (taskData: { name: string; subjectId: string; subjectName: string; duration: number }) => {
  try {
    await taskStore.addTask({
      name: taskData.name,
      subject: taskData.subjectName,
      desc: '从看板创建',
      duration: taskData.duration,
      status: 'pending',
      subjectId: taskData.subjectId
    })
    showTaskModal.value = false
    ElNotification({
      title: '🎯 任务已生成',
      message: `"${taskData.name}" 已加入待安排列表。`,
      type: 'success',
      position: 'top-right'
    })
  } catch (e) {
    console.error(e)
  }
}

const filteredPendingTasks = computed(() => {
  return [...pendingTasks.value].sort(comparePendingTasks)
})

const dayScheduledTasks = computed(() => {
  const tasks = getScheduledTasksForDay(selectedDay.value)
  return [...tasks].sort((a, b) => {
    const timeA = a.startTime ? getTaskTimeStr(a.startTime) : '99:99'
    const timeB = b.startTime ? getTaskTimeStr(b.startTime) : '99:99'
    return timeA.localeCompare(timeB)
  })
})

const handleRemoveSchedule = async (task: Task) => {
  if (!task.id) return
  try {
    await taskStore.unscheduleTask(task.id)
    ElNotification({ title: '已移出日程', type: 'success', position: 'top-right', duration: 2000 })
  } catch (error: any) {
    if (error?.message === '已完成的排期任务已固定') {
      ElNotification({ title: '已完成的排期任务已固定', type: 'warning', position: 'top-right', duration: 2000 })
    } else {
      console.error('移出日程失败', error)
      const detail = error instanceof Error ? error.message : '移出日程失败，请重试'
      ElNotification({ title: '移出日程失败', message: detail, type: 'error', position: 'top-right', duration: 2500 })
    }
  }
}

// ===== Block Detail =====
const blockDialogVisible = ref(false)
const selectedBlock = ref<any>(null)

const openBlockDetail = (block: any) => {
  selectedBlock.value = block
  blockDialogVisible.value = true
}

const toggleTaskCompletion = async (task: Task) => {
  if (!task.id) return
  if (isScheduledCompletionLocked(task, taskStore.currentNow)) return
  const isCurrentlyCompleted = isCompletedScheduledTask(task) || isCompletedTask(task)
  const newStatus: TaskPresentationStatus = isCurrentlyCompleted
    ? (task.scheduledAt ? 'scheduled' : 'pending')
    : 'completed'
  try {
    await taskStore.updateTaskStatus(task.id, newStatus)
  } catch (error) {
    console.error('更新任务状态失败', error)
    if (event?.target && 'checked' in event.target) {
      (event.target as HTMLInputElement).checked = isCurrentlyCompleted
    }
    ElNotification({
      title: '更新任务状态失败',
      message: error instanceof Error ? error.message : '更新状态失败，请重试',
      type: 'error',
      position: 'top-right'
    })
  }
}

onMounted(async () => {
  resetToToday()
  await knowledgeStore.fetchBlocks()
  await taskStore.fetchTasks()
  await subjectStore.loadSubjects()
})

onActivated(() => {
  resetToToday()
})
</script>

<style scoped>
/* ===== Root Layout ===== */
.dashboard-container {
  display: grid;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg-secondary, #EEEEEE); /* 页面大背景 / 次级中性底 */
  padding: 14px;
  gap: 14px;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #76855B;
  --color-primary-light: rgba(139, 154, 110, 0.18);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
  --bg-card: #F7F2EB; /* 主内容底色 */
  --dashboard-card-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}

html.dark .dashboard-container {
  background: #111411;
  --bg-card: #181C18;
  --dashboard-card-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.35), 0 2px 6px -1px rgba(0, 0, 0, 0.2);
}

/* ===== Splitters ===== */
.splitter {
  width: 8px;
  margin: 0 -4px;
  min-width: 0;
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
  padding: 20px 16px;
  overflow-y: auto;
  min-width: 0;
  min-height: 0;
  background: var(--bg-card, #FFFFFF);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--dashboard-card-shadow);
}

html.dark .subject-index {
  box-shadow: var(--dashboard-card-shadow);
}

.index-header {
  margin-bottom: var(--spacing-6);
}

.welcome-title {
  font-size: 16px;
  font-weight: 850;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
}

.welcome-sub {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
  white-space: nowrap;
}

/* ===== Global View Card ===== */
.global-view-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 16px;
  transition: all var(--transition-normal);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

html.dark .global-view-card {
  border-color: rgba(255, 255, 255, 0.08);
}

.global-view-card:hover {
  border-color: var(--color-primary-accent);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.12);
  transform: translateY(-1px);
}

.global-view-card.is-active {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 6px 16px rgba(125, 147, 114, 0.2);
}

.global-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(163, 177, 155, 0.15);
  color: var(--color-primary-accent);
}

.global-view-card.is-active .global-icon-wrap {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.global-text-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.global-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.global-view-card.is-active .global-title {
  color: #fff;
}

.global-count {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(163, 177, 155, 0.15);
  color: var(--text-secondary);
}

html.dark .global-count {
  background: rgba(255, 255, 255, 0.08);
}

.global-view-card.is-active .global-count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 8px;
  padding-left: 4px;
  letter-spacing: 0.5px;
}

.subject-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.subject-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  font-size: 13px;
  color: var(--text-secondary);
  border: 1px solid transparent;
}

.subject-item:hover {
  background: rgba(163, 177, 155, 0.12);
  color: var(--text-primary);
}

.subject-item.is-active {
  font-weight: 800;
  color: #2D3E25;
  background: rgba(163, 177, 155, 0.24);
  border-color: rgba(163, 177, 155, 0.45);
  box-shadow: 0 2px 8px rgba(125, 147, 114, 0.15);
}

html.dark .subject-item.is-active {
  color: #E2E8DE;
  background: rgba(163, 177, 155, 0.26);
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
  background: rgba(163, 177, 155, 0.18);
  border: 1px solid rgba(163, 177, 155, 0.38);
  color: #2D3E25;
  padding: 7px 14px;
  border-radius: var(--radius-md);
  font-size: 11.5px;
  font-weight: 750;
  cursor: pointer;
  margin-top: auto;
  transition: all var(--transition-fast);
  font-family: inherit;
  box-shadow: 0 3px 10px rgba(125, 147, 114, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.manage-subjects-btn:hover {
  background: rgba(163, 177, 155, 0.28);
  border-color: rgba(163, 177, 155, 0.55);
  color: #2D3E25;
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(125, 147, 114, 0.25);
}

html.dark .manage-subjects-btn {
  color: #E2E8DE;
  background: rgba(163, 177, 155, 0.22);
  border-color: rgba(163, 177, 155, 0.42);
}

html.dark .manage-subjects-btn:hover {
  background: rgba(163, 177, 155, 0.32);
  color: #FFFFFF;
}

/* ===== Content Stream ===== */
.content-stream {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 24px 28px;
  background: var(--bg-card, #FFFFFF);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--dashboard-card-shadow);
}

html.dark .content-stream {
  box-shadow: var(--dashboard-card-shadow);
}

.stream-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.stream-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.stream-title {
  font-size: 17px;
  font-weight: 850;
  color: var(--text-primary);
  margin: 0;
}

.stream-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}



.stream-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 4px 12px 2px;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
.stream-body::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
  width: 0;
  height: 0;
}

.stream-row {
  padding: 18px 22px;
  border-radius: 14px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-tertiary, #FAF7F2);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.stream-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -3px rgba(0, 0, 0, 0.08), 0 4px 8px -2px rgba(0, 0, 0, 0.04);
  border-color: rgba(139, 154, 110, 0.45);
}

html.dark .stream-row {
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.35), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
}

html.dark .stream-row:hover {
  box-shadow: 0 10px 22px -3px rgba(0, 0, 0, 0.45), 0 4px 8px -2px rgba(0, 0, 0, 0.25);
}

.row-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 10px;
  line-height: 1.45;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  margin-bottom: 12px;
}

.row-subj-badge {
  background: rgba(163, 177, 155, 0.22);
  color: #2D3E25;
  border: 1px solid rgba(163, 177, 155, 0.38);
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
}
html.dark .row-subj-badge {
  background: rgba(163, 177, 155, 0.25);
  color: #E2E8DE;
  border-color: rgba(163, 177, 155, 0.45);
}

.row-source-badge {
  color: var(--text-secondary);
  font-weight: 600;
  background: var(--color-bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
}

.row-time-badge {
  color: var(--text-secondary);
  font-weight: 600;
  opacity: 0.9;
}

.row-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.95;
}

.row-preview :deep(*) {
  font-size: 12px !important;
}

.row-preview :deep(code) {
  background: transparent;
  color: #2D3E25;
  font-family: var(--font-family-mono);
  padding: 0;
  border: none;
  font-size: 12px !important;
  font-weight: 700;
}

html.dark .row-preview :deep(code) {
  color: #A8BFA0;
}

.row-preview :deep(strong),
.row-preview :deep(b) {
  font-weight: 750;
  color: var(--text-primary);
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
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
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
  background: var(--bg-card, #FFFFFF);
  min-height: 0;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--dashboard-card-shadow);
}

html.dark .dashboard-right {
  box-shadow: var(--dashboard-card-shadow);
}

/* ===== Compact Timeline (top 70%) ===== */
.compact-timeline {
  flex: 7;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px 20px 16px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.timeline-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.new-task-btn {
  background: var(--accent-gradient);
  color: white;
  border: none;
  padding: 5px 14px;
  font-size: 11.5px;
  font-weight: 750;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 3px 10px rgba(139, 154, 110, 0.25);
}

.new-task-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(139, 154, 110, 0.35);
}

.dashboard-time-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.db-view-toggle {
  display: flex;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: 9999px;
  padding: 3px;
  gap: 2px;
}

.db-view-toggle-btn {
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

.db-view-toggle-btn:hover {
  color: var(--text-primary);
  background: rgba(163, 177, 155, 0.15);
}

.db-view-toggle-btn.is-active {
  background: var(--accent-gradient);
  color: white;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.28);
}

.db-day-selector {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

.db-day-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.db-day-week {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.db-day-btn.is-active .db-day-week {
  color: var(--color-primary-accent);
}

.db-day-date-circle {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all var(--transition-fast);
}

.db-day-date {
  font-size: 14px;
  font-weight: 650;
}

.db-day-btn:hover .db-day-date-circle {
  background: rgba(163, 177, 155, 0.12);
  color: var(--text-primary);
}

.db-day-btn.is-active .db-day-date-circle {
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  color: white;
  box-shadow: 0 4px 10px rgba(125, 147, 114, 0.3);
}

.db-day-btn.is-active .db-day-date {
  font-weight: 850;
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

.db-weekly-task-block.is-completed,
.tl-task.is-completed {
  opacity: 0.55;
  filter: grayscale(100%);
}
.db-weekly-task-block.is-completed .db-weekly-block-name,
.tl-task.is-completed .tl-task-name {
  text-decoration: line-through;
  color: var(--text-muted);
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

/* ===== Scheduled Task List (Linear Tasks, No timeline slots) ===== */
.scheduled-task-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 2px 8px;
}

.scheduled-task-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(163, 177, 155, 0.3);
  border-left: 3.5px solid var(--color-primary-accent, #7D9372);
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  transition: all var(--transition-fast, 0.2s ease);
}

.scheduled-task-card:hover {
  background: rgba(163, 177, 155, 0.12);
  border-color: rgba(163, 177, 155, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(125, 147, 114, 0.1);
}

html.dark .scheduled-task-card {
  background: #1F241F;
  border-color: rgba(163, 177, 155, 0.22);
}

html.dark .scheduled-task-card:hover {
  background: #272D27;
  border-color: rgba(163, 177, 155, 0.45);
}

.scheduled-task-card.is-completed {
  opacity: 0.55;
  filter: grayscale(100%);
}

.scheduled-task-card.is-completed .scheduled-task-title {
  text-decoration: line-through;
  color: var(--text-muted);
}

.scheduled-task-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}

.scheduled-task-content.is-completion-locked {
  cursor: not-allowed;
}

.scheduled-task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.scheduled-task-time {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-primary-accent, #7D9372);
  background: rgba(125, 147, 114, 0.12);
  padding: 1px 6px;
  border-radius: 6px;
  letter-spacing: -0.2px;
}

.scheduled-task-subject {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 6px;
}

html.dark .scheduled-task-subject {
  background: rgba(255, 255, 255, 0.06);
}

.scheduled-task-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.scheduled-task-remove-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast, 0.2s ease);
  padding: 4px;
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scheduled-task-card:hover .scheduled-task-remove-btn {
  opacity: 0.7;
}

.scheduled-task-remove-btn:hover {
  opacity: 1;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.empty-scheduled-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
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

.todo-fab-add-btn {
  background: var(--accent-gradient);
  color: #FFFFFF;
  border: none;
  border-radius: 50%;
  width: 26px;
  height: 26px;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.todo-fab-add-btn:hover {
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.45);
}

.todo-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.todo-jump-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary-accent, #7D9372);
  background: rgba(163, 177, 155, 0.12);
  border: 1px solid rgba(163, 177, 155, 0.28);
  border-radius: 9999px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  line-height: 1.4;
}

.todo-jump-btn:hover {
  background: rgba(163, 177, 155, 0.24);
  border-color: rgba(163, 177, 155, 0.5);
  color: #2D3E25;
  transform: translateX(1px);
}

html.dark .todo-jump-btn {
  color: #A3B19B;
  background: rgba(163, 177, 155, 0.15);
  border-color: rgba(163, 177, 155, 0.3);
}

html.dark .todo-jump-btn:hover {
  color: #E2E8DE;
  background: rgba(163, 177, 155, 0.28);
  border-color: rgba(163, 177, 155, 0.5);
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px; /* 胶囊之间的间隙拉开至 8px，层次清晰 */
  padding: 2px 2px 8px;
}

/* 待办事件胶囊化包裹 (Capsule/Pill shape) */
.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: default;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 9999px; /* 胶囊圆角 */
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(163, 177, 155, 0.32);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.018);
}

.todo-item:hover {
  background: rgba(163, 177, 155, 0.16);
  border-color: rgba(163, 177, 155, 0.55);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(125, 147, 114, 0.12);
}

html.dark .todo-item {
  background: #1F241F;
  border-color: rgba(163, 177, 155, 0.22);
}

html.dark .todo-item:hover {
  background: #272D27;
  border-color: rgba(163, 177, 155, 0.45);
}

.todo-item.is-completed {
  opacity: 0.55;
  filter: grayscale(100%);
}

.todo-item.is-completed .todo-name {
  text-decoration: line-through;
  color: var(--text-muted);
}

.task-checkbox {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: #7D9372;
}

.task-checkbox:disabled {
  cursor: not-allowed;
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
  background: rgba(163, 177, 155, 0.22);
  color: #2D3E25;
  border: 1px solid rgba(163, 177, 155, 0.35);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10.5px;
  font-weight: 700;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html.dark .todo-subject {
  background: rgba(163, 177, 155, 0.25);
  color: #E2E8DE;
}

.todo-due-badge {
  font-size: 9.5px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.todo-due-badge.is-overdue {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  font-weight: 600;
}

html.dark .todo-due-badge {
  background: rgba(255, 255, 255, 0.06);
}

html.dark .todo-due-badge.is-overdue {
  color: #f87171;
  background: rgba(239, 68, 68, 0.2);
}

.empty-pending {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 24px 0;
}

.empty-pending-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.empty-pending-icon {
  color: var(--color-primary-accent, #7D9372);
  flex-shrink: 0;
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
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
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
  width: 600px;
  max-height: 85vh;
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
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-weight: 600;
}

.modal-source-tag {
  font-size: 11px;
  color: var(--text-muted);
}

.modal-close {
  background: none;
  border: none;
  font-size: 20px;
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
  padding: 24px 28px;
  overflow-y: auto;
  flex: 1;
}

/* ===== 知识块详情弹窗 (Block Detail Modal - 严格自上而下对齐架构) ===== */
.block-detail-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 640px;
  max-height: 86vh;
  background: #F2F5F3; /* 外层极浅鼠尾草绿背景 #F2F5F3 */
  border-radius: 20px; /* 大圆角约 20px */
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.03); /* 悬浮柔和阴影 */
  border: 1px solid rgba(163, 177, 155, 0.38);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  padding: 28px 32px; /* 内部充足内边距 28-32px */
  overflow-y: auto;
  gap: 20px;
}

html.dark .block-detail-modal {
  background: #181D18;
  border-color: rgba(163, 177, 155, 0.25);
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.35);
}

/* 头部信息区 - 直接在外层浅鼠尾草绿背景上，绝对左对齐 */
.block-detail-header {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.hero-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.hero-tags {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hero-subj-pill {
  font-size: 11.5px;
  padding: 4px 12px;
  border-radius: 6px; /* 圆角处理 */
  background: rgba(163, 177, 155, 0.28); /* 浅绿色背景 */
  color: #2D3E25; /* 深绿色文字 */
  font-weight: 750;
  border: 1px solid rgba(163, 177, 155, 0.45);
}

html.dark .hero-subj-pill {
  color: #D6E2D0;
  background: rgba(163, 177, 155, 0.22);
}

.hero-source-text {
  font-size: 12px;
  color: #888888; /* 辅助信息使用中灰色 #888888 */
  font-weight: 500;
}

.hero-close-btn {
  background: transparent; /* 不需要圆形底色 */
  border: none;
  font-size: 22px;
  line-height: 1;
  color: #888888; /* 极简中灰色关闭图标 */
  cursor: pointer;
  padding: 2px 6px;
  transition: color var(--transition-fast);
}

.hero-close-btn:hover {
  color: #333333;
}

html.dark .hero-close-btn:hover {
  color: #FFFFFF;
}

.hero-main-title {
  font-size: 22px;
  font-weight: 800; /* 加粗 */
  color: #333333; /* 主标题使用深灰色 #333333 */
  line-height: 1.4;
  letter-spacing: -0.4px;
  margin: 0 0 10px 0;
  text-align: left; /* 与上方标签严格左对齐 */
}

html.dark .hero-main-title {
  color: #F0F4F1;
}

.hero-time-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888888; /* 颜色为中灰色 #888888 */
  font-weight: 500;
}

.hero-clock-icon {
  width: 14px;
  height: 14px;
  stroke: #888888;
  flex-shrink: 0;
}

/* 核心内容区 - 物理分隔为独立的纯白色 #FFFFFF 嵌套卡片 */
.block-detail-card {
  background: #FFFFFF; /* 纯白背景 #FFFFFF */
  border-radius: 16px; /* 中等圆角约 16px */
  padding: 26px 28px; /* 内部上下左右宽裕留白至少 24px */
  border: 1px solid rgba(163, 177, 155, 0.28);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.022); /* 极浅阴影凸显边界 */
  flex: 1;
  overflow-y: auto;
}

html.dark .block-detail-card {
  background: #1F241F;
  border-color: rgba(163, 177, 155, 0.18);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.modal-content {
  font-size: 14.5px;
  color: #333333; /* 正文使用深灰色 #333333 */
  line-height: 1.62; /* 行高设置在 1.6 左右 */
  letter-spacing: 0.2px;
}

html.dark .modal-content {
  color: #E2E8DE;
}

.modal-content :deep(h1),
.modal-content :deep(h2) {
  font-size: 16.5px;
  font-weight: 750;
  color: #333333;
  margin: 16px 0 10px;
}

html.dark .modal-content :deep(h1),
html.dark .modal-content :deep(h2) {
  color: #F0F4F1;
}

.modal-content :deep(h3),
.modal-content :deep(h4) {
  font-size: 14.5px;
  font-weight: 650;
  color: #333333;
  margin: 14px 0 8px;
}

html.dark .modal-content :deep(h3),
html.dark .modal-content :deep(h4) {
  color: #F0F4F1;
}

.modal-content :deep(p) {
  margin: 0 0 14px;
}

.modal-content :deep(strong),
.modal-content :deep(b) {
  color: #1E291B;
  font-weight: 750;
}

html.dark .modal-content :deep(strong),
html.dark .modal-content :deep(b) {
  color: #FFFFFF;
}

/* 正常 Markdown 代码渲染，去除不必要的强调背景框 */
.modal-content :deep(code) {
  background: transparent;
  color: #2D3E25;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-family-mono);
}

html.dark .modal-content :deep(code) {
  color: #A8BFA0;
}

/* 底部操作区 - 右下角对齐 */
.block-detail-footer {
  display: flex;
  justify-content: flex-end; /* 右下角对齐 */
  flex-shrink: 0;
  margin-top: 4px;
}

.sage-primary-btn {
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  color: #FFFFFF; /* 白色文字“确定” */
  border: none;
  border-radius: 8px; /* 中等圆角 8px */
  padding: 8px 26px; /* 高度适中 */
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 3px 10px rgba(125, 147, 114, 0.25);
}

.sage-primary-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(125, 147, 114, 0.35);
}

/* ===== 新建学习任务弹窗 (借鉴移动端卡片化与高交互设计) ===== */
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

/* 弹窗底部栏 */
.task-modal-footer {
  padding: 16px 28px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-subtle);
}

.task-btn-cancel {
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: 9999px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.task-btn-cancel:hover {
  background: var(--color-bg-secondary);
  color: var(--text-primary);
}

.task-btn-submit {
  background: var(--accent-gradient);
  color: #FFFFFF;
  border: none;
  border-radius: 9999px;
  padding: 8px 26px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
}

.task-btn-submit:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45);
}

.task-btn-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
