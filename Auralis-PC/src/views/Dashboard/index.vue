<template>
  <div class="dashboard-container" ref="containerRef" :style="dashboardGridStyle">
    <!-- LEFT: Subject Index Tree (20%) -->
    <nav class="subject-index">
      <div class="index-header">
        <h1 class="welcome-title">{{ t({ 'zh-CN': '{greeting}，{name}', en: '{greeting}, {name}', ja: '{name}さん、{greeting}' }, { greeting, name: username }) }}</h1>
        <p class="welcome-sub">{{ t({ 'zh-CN': '已完成 {count} 项 · {duration}', en: 'Completed: {count} · {duration}', ja: '完了 {count}件 · {duration}' }, { count: completedCount, duration: totalFocusHours }) }}</p>
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
          <span class="global-title">{{ t({ 'zh-CN': '全部知识', en: 'All knowledge', ja: 'すべての知識' }) }}</span>
        </div>
        <span class="global-count">{{ allSubjectsOption[0].blockCount }}</span>
      </div>

      <div class="section-label">{{ t({ 'zh-CN': '学科空间', en: 'Subjects', ja: '科目スペース' }) }}</div>

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
      <button class="manage-subjects-btn" @click="router.push('/subjects')">
        <span class="btn-text">{{ t({ 'zh-CN': '管理学科', en: 'Manage subjects', ja: '科目を管理' }) }}</span>
        <IconArrowRight :size="13" :stroke-width="2.2" class="btn-arrow-icon" />
      </button>
    </nav>

    <!-- Splitter 1: between left nav and content stream -->
    <div class="splitter splitter-v" @mousedown="startNavResize"></div>

    <!-- CENTER: Content Stream -->
    <main class="content-stream">
      <div class="stream-header">
        <div class="stream-title-wrap">
          <h3 class="stream-title">{{ t({ 'zh-CN': '知识流', en: 'Knowledge feed', ja: '知識フィード' }) }}</h3>
          <span class="stream-subtitle">{{ t({ 'zh-CN': '{name} · 知识块 {count} 个', en: '{name} · Knowledge blocks: {count}', ja: '{name} · 知識ブロック {count}件' }, { name: currentSubjectTitle, count: filteredBlocks.length }) }}</span>
        </div>
        <button
          v-if="selectedSubjectId"
          class="stream-enter-workspace-btn"
          @click="router.push(`/subject/${selectedSubjectId}`)"
          :title="t({ 'zh-CN': '进入该学科工作区', en: 'Open this subject workspace', ja: 'この科目のワークスペースを開く' })"
        >
          <span>{{ t({ 'zh-CN': '进入工作区', en: 'Open workspace', ja: 'ワークスペースを開く' }) }}</span>
          <IconArrowUpRight :size="13" :stroke-width="2.2" class="stream-enter-icon" />
        </button>
      </div>

      <div class="stream-container">
        <Transition name="stream-switch" mode="out-in">
          <div :key="selectedSubjectId || '__all__'" class="stream-view-pane">
            <div class="stream-body" v-if="filteredBlocks.length > 0">
              <div
                v-for="(block, index) in filteredBlocks.slice(0, 20)"
                :key="block.id"
                class="stream-row"
                :style="{ '--row-delay': `${Math.min(index * 20, 160)}ms` }"
                @click="openBlockDetail(block)"
              >
                <div class="row-title">{{ block.title }}</div>
                <div class="row-meta">
                  <!-- 采用统一的浅鼠尾草绿背景+深色文字微标签 (Badge) -->
                  <span class="row-subj-badge">{{ block.subject }}</span>
                  <span class="row-source-badge">{{ t({ 'zh-CN': '来源：{name}', en: 'Source: {name}', ja: '資料：{name}' }, { name: block.source }) }}</span>
                  <span class="row-time-badge" style="display: inline-flex; align-items: center; gap: 4px;">
                    <IconHistory :size="12" :stroke-width="1.6" />
                    {{ timeAgo(block.time) }}
                  </span>
                </div>
                <div class="row-preview" v-if="block.content" v-html="renderMarkdown(block.content)"></div>
              </div>
            </div>
            <div class="empty-stream" v-else>
              <span>{{ t({ 'zh-CN': '暂无知识块，可在学科空间中添加', en: 'No knowledge blocks yet. Add them in a subject workspace.', ja: '知識ブロックはまだありません。科目スペースで追加できます。' }) }}</span>
              <button class="create-first-btn" @click="router.push('/subjects')">
                <span>{{ t({ 'zh-CN': '创建学科空间', en: 'Create subject', ja: '科目を作成' }) }}</span>
                <IconPlus :size="13" :stroke-width="2.2" class="create-first-icon" />
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </main>

    <!-- Splitter 2: between content and right panel -->
    <div class="splitter splitter-v" @mousedown="startMainResize"></div>

    <!-- RIGHT: Compact Timeline + Todo List (30%) -->
    <div class="dashboard-right">
      <!-- Compact Timeline (top 70%) -->
      <section class="compact-timeline">
        <div class="timeline-header">
          <h3 class="timeline-title">{{ t({ 'zh-CN': '时间轴 · {month}', en: 'Timeline · {month}', ja: 'タイムライン · {month}' }, { month: formatTimelineDate(selectedTimelineDay, { month: 'long' }) }) }}</h3>
          <div class="dashboard-time-actions">
            <div class="db-view-toggle">
              <button 
                class="db-view-toggle-btn" 
                :class="{ 'is-active': dashboardViewMode === 'day' }"
                @click="setDashboardViewMode('day')"
              >
                {{ t({ 'zh-CN': '日视图', en: 'Day', ja: '日' }) }}
              </button>
              <button 
                class="db-view-toggle-btn" 
                :class="{ 'is-active': dashboardViewMode === 'week' }"
                @click="setDashboardViewMode('week')"
              >
                {{ t({ 'zh-CN': '周视图', en: 'Week', ja: '週' }) }}
              </button>
            </div>
            <button class="todo-fab-add-btn" @click="openCreateTaskDialog" :title="t({ 'zh-CN': '新建任务', en: 'New task', ja: 'タスクを作成' })">
              <IconPlus :size="15" :stroke-width="2.4" class="fab-plus-icon" />
            </button>
          </div>
        </div>

        <div class="timeline-mode-viewport">
          <Transition :name="`timeline-mode-slide-${viewModeSlideDirection}`" mode="out-in">
            <div v-if="dashboardViewMode === 'day'" key="day" class="timeline-day-mode-container">
              <div class="db-day-selector">
                <button 
                  v-for="day in timelineDays"
                  :key="day.dateKey"
                  class="db-day-btn"
                  :class="{ 'is-active': selectedDay === day.dayCode, 'is-today': day.isToday }"
                  @click="selectDay(day.dayCode)"
                >
                  <span class="db-day-week">{{ formatTimelineDate(day, { weekday: 'short' }) }}</span>
                  <span class="db-day-date-circle">
                    <span class="db-day-date">{{ formatTimelineDate(day, { day: 'numeric' }) }}</span>
                  </span>
                </button>
              </div>

              <!-- Day Tasks List: Simple Linear Task List with Directional Slide Transition -->
              <div class="scheduled-task-viewport">
                <Transition :name="`timeline-slide-${timelineSlideDirection}`" mode="out-in">
                  <div :key="selectedDay" class="scheduled-task-list">
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
                        :title="isScheduledCompletionLocked(task, taskStore.currentNow) ? t({ 'zh-CN': '任务时段已结束，完成状态不可取消', en: 'This task\'s scheduled time has ended and completion is locked', ja: '予定時間が終了しているため完了を取り消せません' }) : t({ 'zh-CN': '切换任务完成状态', en: 'Toggle task completion', ja: 'タスクの完了状態を切り替える' })"
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
                        :title="t({ 'zh-CN': '移出日程', en: 'Remove from schedule', ja: '予定から外す' })"
                      >
                        <IconX :size="12" :stroke-width="2.2" />
                      </button>
                    </div>
                    <div v-if="dayScheduledTasks.length === 0" class="empty-scheduled-state">
                      <span class="empty-scheduled-text">{{ t({ 'zh-CN': '当日暂无排期任务', en: 'No tasks scheduled for this day', ja: 'この日の予定はありません' }) }}</span>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>

            <!-- Weekly Summary List (Gantt-like Rows) -->
            <div v-else key="week" class="timeline-week-mode-container">
              <div class="db-weekly-list-gantt">
                <div 
                  v-for="day in timelineDays"
                  :key="day.dateKey"
                  class="db-weekly-day-row"
                  :class="{ 'is-today': day.isToday }"
                  @click="selectDay(day.dayCode); setDashboardViewMode('day', false);"
                >
                  <div class="db-weekly-row-label">
                    <span class="db-weekly-row-name">{{ formatTimelineDate(day, { weekday: 'short', month: 'numeric', day: 'numeric' }) }}</span>
                    <span class="db-weekly-row-count">{{ t({ 'zh-CN': '{count} 项', en: 'Tasks: {count}', ja: '{count}件' }, { count: getScheduledTasksForDay(day.dayCode).length }) }}</span>
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
                      {{ t({ 'zh-CN': '空闲', en: 'Free', ja: '予定なし' }) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </section>

      <!-- Horizontal divider -->
      <div class="right-divider"></div>

      <!-- Todo List (bottom, simple task list, no drag) -->
      <section class="todo-section">
        <div class="todo-header">
          <h3 class="todo-title">{{ t({ 'zh-CN': '待办清单', en: 'To-do list', ja: 'やることリスト' }) }}</h3>
          <button class="todo-jump-btn" @click="router.push('/timeline')" :title="t({ 'zh-CN': '前往任务排期', en: 'Go to task scheduling', ja: 'タスクの予定を開く' })">
            <span>{{ t({ 'zh-CN': '前往排期', en: 'Open schedule', ja: '予定を開く' }) }}</span>
            <IconChevronRight :size="12" :stroke-width="2.2" class="todo-jump-icon" />
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
              {{ t({ 'zh-CN': '所有任务已完成', en: 'All tasks are complete', ja: 'すべてのタスクが完了しました' }) }}
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
import { locale, t } from '@/i18n'
import { ref, computed, onMounted, onUnmounted, onActivated, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { renderMarkdown } from '@/utils/markdown'
import { ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'

import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore, type Task, type TaskPresentationStatus, DAY_CODES, getTodayDayCode } from '@/store/useTaskStore'
import { getTasksForTimeline, getTimelineDays, isCompletedScheduledTask, isCompletedTask, isScheduledCompletionLocked, comparePendingTasks, parseDueTimestamp } from '@/services/taskViewRules'
import { IconLayoutGrid, IconHistory, IconCircleCheck, IconChevronRight, IconX, IconPlus, IconArrowRight, IconArrowUpRight } from '@tabler/icons-vue'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'
import TaskCreateDialog from '@/components/task/TaskCreateDialog.vue'
import KnowledgeBlockViewDialog from '@/components/knowledge/KnowledgeBlockViewDialog.vue'

const SUBJECT_THEME_COLOR = 'var(--color-primary-accent)'

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
function formatTimelineDate(day: ReturnType<typeof getTimelineDays>[number], options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale.value, options).format(new Date(day.dateKey + 'T00:00:00'))
}

const selectedTimelineDay = computed(() => timelineDays.value.find((day) => day.dayCode === selectedDay.value) ?? timelineDays.value[0])

const viewModeSlideDirection = ref<'forward' | 'backward'>('forward')

const resetToToday = () => {
  taskStore.setSelectedDay(getTodayDayCode())
}

const setDashboardViewMode = (mode: 'day' | 'week', shouldResetToToday = true) => {
  if (dashboardViewMode.value !== mode) {
    viewModeSlideDirection.value = mode === 'week' ? 'forward' : 'backward'
    dashboardViewMode.value = mode
  }
  if (mode === 'day' && shouldResetToToday) {
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

const timelineSlideDirection = ref<'forward' | 'backward'>('forward')

const selectDay = (day: string) => {
  if (day !== selectedDay.value) {
    const currentIdx = timelineDays.value.findIndex((d) => d.dayCode === selectedDay.value)
    const nextIdx = timelineDays.value.findIndex((d) => d.dayCode === day)
    if (currentIdx !== -1 && nextIdx !== -1) {
      timelineSlideDirection.value = nextIdx >= currentIdx ? 'forward' : 'backward'
    }
  }
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

const username = computed(() => authStore.username || t({ 'zh-CN': '同学', en: 'there', ja: '学習者' }))
const completedCount = computed(() => taskStore.completedCount)
const totalFocusHours = computed(() => taskStore.totalFocusHours)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return t({ 'zh-CN': '夜深了', en: 'Hello', ja: 'こんばんは' })
  if (h < 12) return t({ 'zh-CN': '早上好', en: 'Good morning', ja: 'おはようございます' })
  if (h < 14) return t({ 'zh-CN': '中午好', en: 'Hello', ja: 'こんにちは' })
  if (h < 18) return t({ 'zh-CN': '下午好', en: 'Good afternoon', ja: 'こんにちは' })
  return t({ 'zh-CN': '晚上好', en: 'Good evening', ja: 'こんばんは' })
})

// ===== Resize Logic =====
const containerRef = ref<HTMLElement | null>(null)
const navWidthPercent = ref(25)      // left nav width as % of container
const mainLeftPercent = ref(50)      // content stream width as % of container
// right panel width = 100 - navWidthPercent - mainLeftPercent
const dashboardGridStyle = computed(() => ({
  gridTemplateColumns: `minmax(190px, ${navWidthPercent.value}fr) 8px minmax(320px, ${mainLeftPercent.value}fr) 8px minmax(260px, ${Math.max(20, 100 - navWidthPercent.value - mainLeftPercent.value)}fr)`,
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

const cleanupResize = () => {
  activeResize = null
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('keydown', onResizeKeyDown)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const onResizeKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && activeResize) {
    if (activeResize === 'nav') {
      navWidthPercent.value = resizeStartNav
    } else if (activeResize === 'main') {
      mainLeftPercent.value = resizeStartMain
    }
    cleanupResize()
  }
}

const onMouseUp = () => {
  cleanupResize()
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
  window.addEventListener('keydown', onResizeKeyDown)
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
  window.addEventListener('keydown', onResizeKeyDown)
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
    { id: null as string | null, name: t({ 'zh-CN': '全部', en: 'All', ja: 'すべて' }), icon: '📋', color: 'var(--text-muted)', blockCount: count },
    ...subjectsList
  ]
})

const filteredBlocks = computed(() => {
  const blocksList = recentBlocks.value
  if (!selectedSubjectId.value) return blocksList
  return blocksList.filter(b => b.subjectId === selectedSubjectId.value || b.subject === selectedSubjectId.value)
})

const currentSubjectTitle = computed(() => {
  if (!selectedSubjectId.value) return t({ 'zh-CN': '全部知识', en: 'All knowledge', ja: 'すべての知識' })
  const target = subjectStore.subjects.find(s => s.id === selectedSubjectId.value)
  return target?.name || t({ 'zh-CN': '当前学科', en: 'Current subject', ja: '現在の科目' })
})

const timeAgo = (isoString: string): string => {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t({ 'zh-CN': '刚刚', en: 'Just now', ja: 'たった今' })
  if (mins < 60) return t({ 'zh-CN': '{count} 分钟前', en: '{count} min ago', ja: '{count}分前' }, { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t({ 'zh-CN': '{count} 小时前', en: '{count} hr ago', ja: '{count}時間前' }, { count: hours })
  return t({ 'zh-CN': '{count} 天前', en: '{count} d ago', ja: '{count}日前' }, { count: Math.floor(hours / 24) })
}

const isTaskOverdue = (task: Task): boolean => {
  if (!task.dueAt) return false
  const due = parseDueTimestamp(task.dueAt)
  return Number.isFinite(due) && due < taskStore.currentNow.getTime()
}

const formatTaskDue = (dueAt?: string): string => {
  if (!dueAt) return ''
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return ''
  return t({ 'zh-CN': '{date} 截止', en: 'Due {date}', ja: '期限 {date}' }, { date: new Intl.DateTimeFormat(locale.value, { month: 'numeric', day: 'numeric' }).format(d) })
}

// ===== Task Creation =====
const showTaskModal = ref(false)

const availableSubjectsForTask = computed(() => {
  return subjectStore.subjects
})

const openCreateTaskDialog = () => {
  showTaskModal.value = true
}

const handleAddTask = async (taskData: {
  name: string
  subjectId: string
  subjectName: string
  duration: number
  due?: string
  dueAt?: string
}) => {
  try {
    await taskStore.addTask({
      name: taskData.name,
      subject: taskData.subjectName,
      desc: '从看板创建',
      duration: taskData.duration,
      status: 'pending',
      subjectId: taskData.subjectId,
      dueAt: taskData.dueAt,
    })
    showTaskModal.value = false
    ElNotification({
      title: t({ 'zh-CN': '🎯 任务已生成', en: '🎯 Task created', ja: '🎯 タスクを作成しました' }),
      message: t({ 'zh-CN': '「{name}」已加入待安排列表。', en: '“{name}” was added to the unscheduled list.', ja: '「{name}」を未予定リストに追加しました。' }, { name: taskData.name }),
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
    ElNotification({ title: t({ 'zh-CN': '已移出日程', en: 'Removed from schedule', ja: '予定から外しました' }), type: 'success', position: 'top-right', duration: 2000 })
  } catch (error: any) {
    if (error?.message === '已完成的排期任务已固定') {
      ElNotification({ title: t({ 'zh-CN': '已完成的排期任务已固定', en: 'Completed scheduled tasks are locked', ja: '完了した予定は変更できません' }), type: 'warning', position: 'top-right', duration: 2000 })
    } else {
      console.error('移出日程失败', error)
      const detail = error instanceof Error ? error.message : t({ 'zh-CN': '移出日程失败，请重试', en: 'Could not remove from schedule. Try again.', ja: '予定から外せませんでした。もう一度お試しください。' })
      ElNotification({ title: t({ 'zh-CN': '移出日程失败', en: 'Could not remove from schedule', ja: '予定から外せませんでした' }), message: detail, type: 'error', position: 'top-right', duration: 2500 })
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

const handleOpenBlockDetailEvent = (event: Event) => {
  const block = (event as CustomEvent).detail
  if (!block || typeof block.id !== 'string') return
  openBlockDetail(block)
}

let routeBlockIntentGeneration = 0
watch(
  () => route.query.openBlock,
  async (value) => {
    const blockId = typeof value === 'string' ? value.trim() : ''
    if (!blockId) return
    const generation = ++routeBlockIntentGeneration
    try {
      await knowledgeStore.loadLocalBlocks()
    } catch (error) {
      console.warn('[Dashboard] Could not load the requested knowledge block', error)
      return
    }
    if (generation !== routeBlockIntentGeneration || route.query.openBlock !== blockId) return
    const block = recentBlocks.value.find((candidate) => candidate.id === blockId)
    if (block) openBlockDetail(block)
    const query = { ...route.query }
    delete query.openBlock
    await router.replace({ path: route.path, query, hash: route.hash })
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('open-block-detail', handleOpenBlockDetailEvent)
})

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
      title: t({ 'zh-CN': '更新任务状态失败', en: 'Could not update task status', ja: 'タスクの状態を更新できませんでした' }),
      message: error instanceof Error ? error.message : t({ 'zh-CN': '更新状态失败，请重试', en: 'Could not update status. Try again.', ja: '状態を更新できませんでした。もう一度お試しください。' }),
      type: 'error',
      position: 'top-right'
    })
  }
}

onMounted(async () => {
  window.addEventListener('open-block-detail', handleOpenBlockDetailEvent)
  resetToToday()
  await knowledgeStore.fetchBlocks()
  await taskStore.fetchTasks()
  await subjectStore.loadSubjects()
})

onActivated(() => {
  resetToToday()
})

onUnmounted(() => {
  window.removeEventListener('open-block-detail', handleOpenBlockDetailEvent)
  cleanupResize()
})
</script>

<style scoped>
/* ===== Root Layout ===== */
.dashboard-container {
  display: grid;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg-secondary, #EEEEEE);
  padding: calc(16px - var(--card-padding-reduction));
  gap: calc(14px - var(--layout-gap-reduction));

  /* Zen Minimalist System Tokens */
  --color-primary-accent: var(--color-zen-sage, #8B9A6E);
  --color-primary-accent-hover: var(--color-sage-dark, #76855B);
  --color-primary-light: rgba(139, 154, 110, 0.16);
  --color-primary-glow: rgba(139, 154, 110, 0.26);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
  --surface-panel: var(--color-bg-primary, #F7F2EB);
  --bg-card: var(--surface-panel);
  --card-border-color: var(--border-subtle, rgba(0, 0, 0, 0.08));
  --dashboard-card-shadow: 0 2px 8px -2px rgba(60, 72, 50, 0.04), 0 12px 32px -4px rgba(60, 72, 50, 0.07);
}

html.dark .dashboard-container {
  background: var(--color-bg-secondary, #1B201B);
  --surface-panel: #1F241F;
  --bg-card: var(--surface-panel);
  --card-border-color: var(--border-subtle, rgba(230, 223, 216, 0.08));
  --dashboard-card-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.4), 0 16px 40px -6px rgba(0, 0, 0, 0.6);
}

/* ===== Splitters ===== */
.splitter {
  width: 8px;
  margin: 0 -4px;
  min-width: 0;
  background: transparent;
  position: relative;
  cursor: col-resize;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
  padding: calc(22px - var(--card-padding-reduction)) calc(18px - var(--card-padding-reduction));
  overflow-y: auto;
  min-width: 0;
  min-height: 0;
  background: var(--bg-card);
  border-radius: 16px;
  border: 0.5px solid var(--card-border-color);
  box-shadow: var(--dashboard-card-shadow);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.subject-index::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.index-header {
  margin-bottom: 22px;
}

.welcome-title {
  font-size: calc(17px + var(--ui-font-size-adjustment));
  font-weight: 850;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  letter-spacing: -0.015em;
  line-height: 1.35;
}

.welcome-sub {
  display: inline-block;
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 6px;
  white-space: nowrap;
  padding: 3px 10px;
  background: rgba(139, 154, 110, 0.1);
  border-radius: 9999px;
  border: 0.5px solid rgba(139, 154, 110, 0.22);
  letter-spacing: 0.01em;
}

html.dark .welcome-sub {
  background: rgba(163, 177, 155, 0.12);
  border-color: rgba(163, 177, 155, 0.24);
  color: #B5C4B0;
}

/* ===== Global View Card ===== */
.global-view-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--card-border-color);
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 18px;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

.global-view-card:active {
  transform: scale(0.985);
}

html.dark .global-view-card {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}

.global-view-card:hover {
  border-color: var(--color-primary-accent);
  box-shadow: 0 6px 16px rgba(139, 154, 110, 0.14);
  transform: translateY(-1.5px);
}

.global-view-card.is-active {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(125, 147, 114, 0.28);
}

.global-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: rgba(163, 177, 155, 0.18);
  color: var(--color-primary-accent);
  transition: all 0.2s ease;
}

.global-view-card.is-active .global-icon-wrap {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
}

.global-text-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.global-title {
  font-size: calc(13.5px + var(--ui-font-size-adjustment));
  font-weight: 750;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.global-view-card.is-active .global-title {
  color: #ffffff;
}

.global-count {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 9999px;
  background: rgba(163, 177, 155, 0.16);
  color: var(--text-secondary);
}

html.dark .global-count {
  background: rgba(255, 255, 255, 0.08);
}

.global-view-card.is-active .global-count {
  background: rgba(255, 255, 255, 0.24);
  color: #ffffff;
}

.section-label {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 750;
  color: var(--text-muted);
  margin-bottom: 10px;
  padding-left: 6px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.subject-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}

.subject-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 11px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  font-size: 13px;
  color: var(--text-secondary);
  border: 0.5px solid transparent;
}

.subject-item:active {
  transform: scale(0.985);
}

.subject-item:hover {
  background: rgba(163, 177, 155, 0.14);
  color: var(--text-primary);
  transform: translateX(2px);
}

.subject-item.is-active {
  font-weight: 800;
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.18);
  border-color: rgba(139, 154, 110, 0.45);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.14);
}

html.dark .subject-item.is-active {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.24);
  border-color: rgba(139, 154, 110, 0.4);
}

.active-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  animation: dot-pop 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.5);
}

@keyframes dot-pop {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.subject-icon {
  font-size: 14px;
  flex-shrink: 0;
  width: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.subject-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.subject-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.03);
}

html.dark .subject-count {
  background: rgba(255, 255, 255, 0.04);
}

.manage-subjects-btn {
  background: rgba(139, 154, 110, 0.12);
  border: 0.5px solid rgba(139, 154, 110, 0.28);
  color: var(--text-primary);
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  margin-top: auto;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  letter-spacing: -0.01em;
  position: relative;
  overflow: hidden;
}

.manage-subjects-btn .btn-arrow-icon {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.manage-subjects-btn:hover {
  background: rgba(139, 154, 110, 0.22);
  border-color: rgba(139, 154, 110, 0.45);
  color: var(--text-primary);
  transform: translateY(-1.5px);
  box-shadow: 0 6px 16px rgba(139, 154, 110, 0.22);
}

.manage-subjects-btn:hover .btn-arrow-icon {
  transform: translateX(3px);
}

.manage-subjects-btn:active {
  transform: scale(0.97);
}

html.dark .manage-subjects-btn {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.16);
  border-color: rgba(139, 154, 110, 0.32);
}

html.dark .manage-subjects-btn:hover {
  background: rgba(139, 154, 110, 0.26);
  color: #FFFFFF;
}

.stream-enter-workspace-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.14);
  border: 0.5px solid rgba(139, 154, 110, 0.3);
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  line-height: 1.4;
}

.stream-enter-workspace-btn .stream-enter-icon {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.stream-enter-workspace-btn:hover {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.28);
}

.stream-enter-workspace-btn:hover .stream-enter-icon {
  transform: translate(2px, -2px);
}

.stream-enter-workspace-btn:active {
  transform: scale(0.96);
}

html.dark .stream-enter-workspace-btn {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.18);
  border-color: rgba(139, 154, 110, 0.35);
}

html.dark .stream-enter-workspace-btn:hover {
  color: #ffffff;
}

/* ===== Center: Content Stream ===== */
.content-stream {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: calc(24px - var(--panel-padding-reduction)) calc(28px - var(--panel-padding-reduction));
  background: var(--bg-card);
  border-radius: 16px;
  border: 0.5px solid var(--card-border-color);
  box-shadow: var(--dashboard-card-shadow);
}

.stream-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: calc(18px - var(--layout-gap-reduction));
  flex-shrink: 0;
}

.stream-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.stream-title {
  font-size: calc(18px + var(--ui-font-size-adjustment));
  font-weight: 850;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.015em;
}

.stream-subtitle {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  color: var(--text-secondary);
  font-weight: 600;
  background: rgba(139, 154, 110, 0.1);
  padding: 2px 10px;
  border-radius: 9999px;
  border: 0.5px solid rgba(139, 154, 110, 0.2);
  transition: color var(--transition-fast);
}

html.dark .stream-subtitle {
  background: rgba(163, 177, 155, 0.12);
  border-color: rgba(163, 177, 155, 0.22);
  color: #B5C4B0;
}

.stream-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.stream-view-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.stream-switch-enter-active {
  transition: opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1), transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.stream-switch-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
  will-change: opacity, transform;
}

.stream-switch-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.stream-switch-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.stream-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 4px 16px 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.stream-body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.stream-row {
  padding: calc(18px - var(--card-padding-reduction)) calc(22px - var(--card-padding-reduction));
  border-radius: 14px;
  border: 0.5px solid var(--card-border-color);
  background: var(--color-bg-tertiary, #FAF7F2);
  cursor: pointer;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px -1px rgba(60, 72, 50, 0.03), 0 6px 16px -2px rgba(60, 72, 50, 0.04);
  animation: stream-row-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: var(--row-delay, 0ms);
}

@keyframes stream-row-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stream-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px -2px rgba(60, 72, 50, 0.05), 0 12px 24px -3px rgba(125, 147, 114, 0.12);
  border-color: rgba(139, 154, 110, 0.45);
}

.stream-row:active {
  transform: scale(0.995);
}

html.dark .stream-row {
  background: rgba(255, 255, 255, 0.025);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.35);
}

html.dark .stream-row:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(163, 177, 155, 0.35);
  box-shadow: 0 10px 24px -3px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(125, 147, 114, 0.15);
}

.row-title {
  font-size: calc(15.5px + var(--ui-font-size-adjustment));
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 10px;
  line-height: 1.45;
  letter-spacing: -0.015em;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: calc(12px + var(--ui-font-size-adjustment));
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.row-subj-badge {
  background: rgba(163, 177, 155, 0.22);
  color: #283721;
  border: 0.5px solid rgba(163, 177, 155, 0.38);
  font-weight: 700;
  padding: 2.5px 9px;
  border-radius: 8px;
  font-size: 12px;
  letter-spacing: -0.01em;
}

html.dark .row-subj-badge {
  background: rgba(163, 177, 155, 0.22);
  color: #E2E8DE;
  border-color: rgba(163, 177, 155, 0.4);
}

.row-source-badge {
  color: var(--text-secondary);
  font-weight: 600;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
}

html.dark .row-source-badge {
  background: rgba(255, 255, 255, 0.05);
  color: #A3AFA0;
}

.row-time-badge {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 12px;
}

.row-preview {
  font-size: calc(12.5px + var(--ui-font-size-adjustment));
  color: var(--text-secondary);
  line-height: 1.65;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.92;
}

.row-preview :deep(*) {
  font-size: 12.5px !important;
}

.row-preview :deep(code) {
  background: rgba(139, 154, 110, 0.12);
  color: #2D3E25;
  font-family: var(--font-family-mono);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 12px !important;
  font-weight: 700;
}

html.dark .row-preview :deep(code) {
  color: #B2C7AB;
  background: rgba(139, 154, 110, 0.2);
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
  gap: 16px;
  padding: 48px 24px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}

.create-first-btn {
  background: var(--accent-gradient);
  border: none;
  color: white;
  padding: 10px 22px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.create-first-btn .create-first-icon {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.create-first-btn:hover {
  opacity: 0.94;
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(139, 154, 110, 0.42);
}

.create-first-btn:hover .create-first-icon {
  transform: rotate(90deg) scale(1.1);
}

.create-first-btn:active {
  transform: scale(0.97);
}

/* ===== Right Panel ===== */
.dashboard-right {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--bg-card);
  min-height: 0;
  border-radius: 16px;
  border: 0.5px solid var(--card-border-color);
  box-shadow: var(--dashboard-card-shadow);
}

/* ===== Compact Timeline (top 70%) ===== */
.compact-timeline {
  flex: 7;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: calc(22px - var(--card-padding-reduction)) calc(20px - var(--card-padding-reduction)) calc(16px - var(--card-padding-reduction));
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.timeline-title {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.new-task-btn {
  background: var(--accent-gradient);
  color: white;
  border: none;
  padding: 6px 15px;
  font-size: 12px;
  font-weight: 750;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
  border: 0.5px solid var(--border-default);
  border-radius: 9999px;
  padding: 3px;
  gap: 2px;
}

html.dark .db-view-toggle {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

.db-view-toggle-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
  padding: 4px 11px;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  line-height: 1.2;
}

.db-view-toggle-btn:hover {
  color: var(--text-primary);
  background: rgba(163, 177, 155, 0.16);
}

.db-view-toggle-btn:active {
  transform: scale(0.95);
}

.db-view-toggle-btn.is-active {
  background: var(--accent-gradient);
  color: white;
  font-weight: 750;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.32);
}

.db-day-selector {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 2px;
}

.db-day-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.db-day-btn:active {
  transform: scale(0.92);
}

.db-day-week {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  transition: color 0.15s ease;
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
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.db-day-date {
  font-size: 14px;
  font-weight: 650;
}

.db-day-btn:hover .db-day-date-circle {
  background: rgba(163, 177, 155, 0.15);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.db-day-btn.is-active .db-day-date-circle {
  background: var(--accent-gradient);
  color: white;
  box-shadow: 0 4px 12px rgba(125, 147, 114, 0.35);
  animation: day-circle-pop 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes day-circle-pop {
  0% { transform: scale(0.82); }
  60% { transform: scale(1.06); }
  100% { transform: scale(1); }
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
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border: 0.5px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.db-weekly-day-row:hover {
  border-color: var(--color-primary-accent);
  background: rgba(139, 154, 110, 0.12);
  transform: translateX(2px);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.14);
}

.db-weekly-day-row:active {
  transform: scale(0.985);
}

.db-weekly-day-row.is-today {
  border-color: var(--color-primary-accent);
  background: rgba(139, 154, 110, 0.08);
}

.db-weekly-row-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.db-weekly-row-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.db-weekly-row-count {
  font-size: 12px;
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
  font-size: 12px;
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
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-weekly-row-empty {
  font-size: 12px;
  color: var(--text-muted);
  opacity: 0.6;
  padding: 2px 0;
}

/* ===== Timeline Mode Viewport ===== */
.timeline-mode-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.timeline-day-mode-container,
.timeline-week-mode-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.timeline-mode-slide-forward-enter-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
.timeline-mode-slide-forward-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
  will-change: opacity, transform;
}
.timeline-mode-slide-forward-enter-from {
  opacity: 0;
  transform: translateX(18px);
}
.timeline-mode-slide-forward-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}

.timeline-mode-slide-backward-enter-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
.timeline-mode-slide-backward-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
  will-change: opacity, transform;
}
.timeline-mode-slide-backward-enter-from {
  opacity: 0;
  transform: translateX(-18px);
}
.timeline-mode-slide-backward-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

/* ===== Scheduled Task Viewport ===== */
.scheduled-task-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.timeline-slide-forward-enter-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
.timeline-slide-forward-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
  will-change: opacity, transform;
}
.timeline-slide-forward-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.timeline-slide-forward-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}

.timeline-slide-backward-enter-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
.timeline-slide-backward-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
  will-change: opacity, transform;
}
.timeline-slide-backward-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.timeline-slide-backward-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

.scheduled-task-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 2px 8px;
  height: 100%;
}

.scheduled-task-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid rgba(139, 154, 110, 0.32);
  border-left: 3px solid var(--color-primary-accent);
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.scheduled-task-card:hover {
  background: rgba(139, 154, 110, 0.12);
  border-color: rgba(139, 154, 110, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.12);
}

html.dark .scheduled-task-card {
  background: #1F241F;
  border-color: rgba(139, 154, 110, 0.22);
}

html.dark .scheduled-task-card:hover {
  background: #272D27;
  border-color: rgba(139, 154, 110, 0.45);
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
  font-size: 12px;
  font-weight: 750;
  color: var(--color-primary-accent);
  background: rgba(139, 154, 110, 0.14);
  padding: 1.5px 7px;
  border-radius: 6px;
  letter-spacing: -0.2px;
}

.scheduled-task-subject {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.04);
  padding: 1.5px 7px;
  border-radius: 6px;
}

html.dark .scheduled-task-subject {
  background: rgba(255, 255, 255, 0.06);
}

.scheduled-task-title {
  font-size: 12.5px;
  font-weight: 750;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  letter-spacing: -0.01em;
}

.scheduled-task-remove-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 5px;
  border-radius: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scheduled-task-card:hover .scheduled-task-remove-btn {
  opacity: 0.75;
}

.scheduled-task-remove-btn:hover {
  opacity: 1;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.empty-scheduled-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

/* ===== Right Divider ===== */
.right-divider {
  height: 0.5px;
  background: var(--card-border-color);
  flex-shrink: 0;
  margin: 0 16px;
}

/* ===== Todo Section (bottom 30%) ===== */
.todo-section {
  flex: 3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: calc(14px - var(--card-padding-reduction)) calc(18px - var(--card-padding-reduction)) calc(18px - var(--card-padding-reduction));
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.todo-fab-add-btn {
  background: var(--accent-gradient);
  color: #FFFFFF;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.todo-fab-add-btn .fab-plus-icon {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.todo-fab-add-btn:hover {
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 6px 16px rgba(139, 154, 110, 0.48);
}

.todo-fab-add-btn:hover .fab-plus-icon {
  transform: rotate(90deg);
}

.todo-fab-add-btn:active {
  transform: scale(0.92);
}

.todo-title {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.todo-jump-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--color-primary-accent);
  background: rgba(139, 154, 110, 0.14);
  border: 0.5px solid rgba(139, 154, 110, 0.32);
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  line-height: 1.4;
}

.todo-jump-btn .todo-jump-icon {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.todo-jump-btn:hover {
  background: rgba(139, 154, 110, 0.26);
  border-color: rgba(139, 154, 110, 0.55);
  color: var(--text-primary);
  transform: translateX(1px) translateY(-0.5px);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.18);
}

.todo-jump-btn:hover .todo-jump-icon {
  transform: translateX(3px);
}

.todo-jump-btn:active {
  transform: scale(0.95);
}

html.dark .todo-jump-btn {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.16);
  border-color: rgba(139, 154, 110, 0.32);
}

html.dark .todo-jump-btn:hover {
  color: #FFFFFF;
  background: rgba(139, 154, 110, 0.3);
  border-color: rgba(139, 154, 110, 0.52);
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 2px 8px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.todo-list::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* 待办事件胶囊化包裹 (Capsule/Pill shape) */
.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: default;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid rgba(163, 177, 155, 0.32);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.018);
}

.todo-item:hover {
  background: rgba(163, 177, 155, 0.16);
  border-color: rgba(163, 177, 155, 0.55);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(125, 147, 114, 0.14);
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
  accent-color: var(--color-primary-accent);
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
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 650;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  letter-spacing: -0.01em;
}

.todo-subject {
  background: rgba(139, 154, 110, 0.18);
  color: var(--text-primary);
  border: 0.5px solid rgba(139, 154, 110, 0.35);
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html.dark .todo-subject {
  background: rgba(139, 154, 110, 0.24);
  color: var(--text-primary);
}

.todo-due-badge {
  font-size: 12px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.04);
  padding: 1.5px 7px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
  font-weight: 600;
}

.todo-due-badge.is-overdue {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
  font-weight: 700;
}

html.dark .todo-due-badge {
  background: rgba(255, 255, 255, 0.06);
}

html.dark .todo-due-badge.is-overdue {
  color: #f87171;
  background: rgba(239, 68, 68, 0.22);
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
  font-weight: 600;
}

.empty-pending-icon {
  color: var(--color-primary-accent);
  flex-shrink: 0;
}

/* ===== Form Styles ===== */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-input {
  background: var(--color-bg-tertiary);
  border: 0.5px solid var(--border-default);
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
  border: 0.5px solid var(--glass-border);
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
  border-bottom: 0.5px solid var(--border-subtle);
}

.modal-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-tag {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-weight: 600;
}

.modal-source-tag {
  font-size: 12px;
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
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 20px;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.03);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  z-index: 1001;
  display: flex;
  flex-direction: column;
  padding: 28px 32px;
  overflow-y: auto;
  gap: 20px;
}

html.dark .block-detail-modal {
  background: #1F241F;
  border-color: var(--border-subtle, rgba(230, 223, 216, 0.08));
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.35);
}

/* 头部信息区 - 保持通透禅意质感 */
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
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  background: rgba(139, 154, 110, 0.14);
  color: var(--text-primary);
  font-weight: 750;
  border: 0.5px solid rgba(139, 154, 110, 0.3);
}

html.dark .hero-subj-pill {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.2);
}

.hero-source-text {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.hero-close-btn {
  background: transparent;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  transition: color var(--transition-fast);
}

.hero-close-btn:hover {
  color: var(--text-primary);
}

html.dark .hero-close-btn:hover {
  color: #FFFFFF;
}

.hero-main-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.4;
  letter-spacing: -0.4px;
  margin: 0 0 10px 0;
  text-align: left;
}

html.dark .hero-main-title {
  color: var(--text-primary);
}

.hero-time-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.hero-clock-icon {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  flex-shrink: 0;
}

/* 核心内容区 - 采用标准卡片底色 --color-bg-tertiary */
.block-detail-card {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 16px;
  padding: 26px 28px;
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.022);
  flex: 1;
  overflow-y: auto;
}

html.dark .block-detail-card {
  background: #252B25;
  border-color: var(--border-subtle, rgba(230, 223, 216, 0.08));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.modal-content {
  font-size: 14.5px;
  color: var(--text-primary);
  line-height: 1.62;
  letter-spacing: 0.2px;
}

html.dark .modal-content {
  color: var(--text-primary);
}

.modal-content :deep(h1),
.modal-content :deep(h2) {
  font-size: 16.5px;
  font-weight: 750;
  color: var(--text-primary);
  margin: 16px 0 10px;
}

html.dark .modal-content :deep(h1),
html.dark .modal-content :deep(h2) {
  color: var(--text-primary);
}

.modal-content :deep(h3),
.modal-content :deep(h4) {
  font-size: 14.5px;
  font-weight: 650;
  color: var(--text-primary);
  margin: 14px 0 8px;
}

html.dark .modal-content :deep(h3),
html.dark .modal-content :deep(h4) {
  color: var(--text-primary);
}

.modal-content :deep(p) {
  margin: 0 0 14px;
}

.modal-content :deep(strong),
.modal-content :deep(b) {
  color: var(--text-primary);
  font-weight: 750;
}

html.dark .modal-content :deep(strong),
html.dark .modal-content :deep(b) {
  color: #FFFFFF;
}

/* 正常 Markdown 代码渲染，去除不必要的强调背景框 */
.modal-content :deep(code) {
  background: transparent;
  color: var(--color-primary-accent);
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
  justify-content: flex-end;
  flex-shrink: 0;
  margin-top: 4px;
}

.sage-primary-btn {
  background: var(--accent-gradient);
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  padding: 8px 26px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 3px 10px rgba(139, 154, 110, 0.25);
}

.sage-primary-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(139, 154, 110, 0.35);
}

/* ===== 新建学习任务弹窗 ===== */
.task-create-modal {
  width: 520px;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 0.5px solid var(--border-subtle);
}

html.dark .task-create-modal {
  background: #1F241F;
  border-color: var(--border-subtle, rgba(230, 223, 216, 0.08));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.task-create-modal .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22px 0 16px 0;
  margin: 0 28px;
  border-bottom: 0.5px solid var(--border-subtle);
}

.task-modal-title {
  margin: 0;
  font-size: 19px;
  font-weight: 850;
  color: var(--color-primary-accent);
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
  background: var(--color-bg-secondary);
  border: 0.5px solid var(--border-default);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}

.task-form-input:focus {
  border-color: var(--color-primary-accent);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.15);
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
  border: 0.5px solid transparent;
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
  color: var(--color-primary-accent);
  background: rgba(139, 154, 110, 0.12);
  padding: 2px 8px;
  border-radius: 9999px;
}

/* 专注时长长条按钮拖动交互条 */
.duration-long-bar-btn {
  position: relative;
  width: 100%;
  height: 48px;
  background: var(--color-bg-secondary);
  border: 0.5px solid var(--border-default);
  border-radius: 9999px;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  display: flex;
  align-items: center;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.duration-long-bar-btn:hover {
  border-color: var(--color-primary-accent);
  box-shadow: 0 4px 16px rgba(139, 154, 110, 0.15);
}

.duration-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(to right, rgba(139, 154, 110, 0.25), var(--color-primary-accent));
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
  border: 2px solid var(--color-primary-accent);
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 800;
  color: var(--color-primary-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  pointer-events: none;
  transition: left 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .duration-bar-thumb {
  background: #252B25;
}

/* 弹窗底部栏 */
.task-modal-footer {
  padding: 16px 28px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 0.5px solid var(--border-subtle);
}

.task-btn-cancel {
  background: transparent;
  border: 0.5px solid var(--border-default);
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

/* ===== Responsive Adaptation ===== */
@media (max-width: 1280px) {
  .dashboard-container {
    padding: calc(12px - var(--card-padding-reduction));
    gap: calc(10px - var(--layout-gap-reduction));
  }
  .subject-index {
    padding: calc(18px - var(--card-padding-reduction)) calc(14px - var(--card-padding-reduction));
  }
  .content-stream {
    padding: calc(20px - var(--panel-padding-reduction)) calc(22px - var(--panel-padding-reduction));
  }
  .compact-timeline {
    padding: calc(18px - var(--card-padding-reduction)) calc(16px - var(--card-padding-reduction)) calc(14px - var(--card-padding-reduction));
  }
}

@media (max-width: 1080px) {
  .dashboard-container {
    padding: calc(10px - var(--card-padding-reduction));
    gap: calc(8px - var(--layout-gap-reduction));
  }
  .subject-index {
    padding: calc(14px - var(--card-padding-reduction)) calc(10px - var(--card-padding-reduction));
  }
  .welcome-title {
    font-size: calc(15px + var(--ui-font-size-adjustment));
  }
  .content-stream {
    padding: calc(16px - var(--panel-padding-reduction));
  }
  .compact-timeline {
    padding: calc(14px - var(--card-padding-reduction)) calc(12px - var(--card-padding-reduction)) calc(10px - var(--card-padding-reduction));
  }
  .timeline-header {
    margin-bottom: 12px;
  }
  .db-day-btn {
    padding: 6px 4px;
  }
}
</style>
