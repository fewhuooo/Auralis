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
            <span class="row-time-badge">🕒 {{ timeAgo(block.time) }}</span>
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
            <button class="todo-fab-add-btn" @click="openCreateTaskDialog" title="新建任务">+</button>
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
    <div class="block-detail-modal" v-if="blockDialogVisible">
      <!-- 1. 头部信息区 (直接在外层极浅鼠尾草绿背景 #F2F5F3 上，绝对左对齐) -->
      <div class="block-detail-header">
        <!-- 标签行 (Top Row) -->
        <div class="hero-header-row">
          <div class="hero-tags">
            <!-- 微标签 (Badge)：浅绿色背景+深绿色文字，圆角处理 -->
            <span class="hero-subj-pill">
              {{ selectedBlock?.subject || '人工智能导论与大模型' }}
            </span>
            <!-- 辅助文字：中灰色字 #888888 -->
            <span class="hero-source-text">来源: {{ selectedBlock?.source }}</span>
          </div>
          <!-- 极简的中灰色“X”关闭图标 (不需要圆形底色) -->
          <button class="hero-close-btn" @click="blockDialogVisible = false" title="关闭">×</button>
        </div>
        <!-- 主标题 (Title)：大字号，加粗，深灰色 #333333，严格左对齐 -->
        <h2 class="hero-main-title">{{ selectedBlock?.title }}</h2>
        <!-- 时间信息 (Metadata)：简洁线性时钟图标 + 中灰色文字 -->
        <div class="hero-time-text">
          <svg class="hero-clock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>记于 {{ selectedBlock?.time }}</span>
        </div>
      </div>

      <!-- 2. 核心内容区 (物理分隔的独立纯白色 #FFFFFF 嵌套卡片，留白至少 24px) -->
      <div class="block-detail-card">
        <div class="modal-content" v-html="renderMarkdown(selectedBlock?.content || selectedBlock?.preview || '')"></div>
      </div>

      <!-- 3. 底部操作区 (右下角对齐 + 偏深鼠尾草绿 #849C8A 实心“确定”按钮) -->
      <div class="block-detail-footer">
        <button class="sage-primary-btn" @click="blockDialogVisible = false">确定</button>
      </div>
    </div>

    <!-- Create Task Modal (借鉴移动端现代卡片化任务创建设计) -->
    <div class="modal-overlay" v-if="showTaskModal" @click="showTaskModal = false"></div>
    <div class="block-modal task-create-modal" v-if="showTaskModal">
      <div class="modal-header">
        <h3 class="task-modal-title">新建学习任务</h3>
        <button class="modal-close" @click="showTaskModal = false">×</button>
      </div>
      <div class="task-modal-body">
        <!-- 任务名称 -->
        <div class="task-form-group">
          <label class="task-form-label">任务名称</label>
          <input v-model="taskForm.name" class="task-form-input" placeholder="请输入学习或专注任务名称..." autofocus />
        </div>

        <!-- 所属学科（胶囊网格选择，直观清晰） -->
        <div class="task-form-group">
          <label class="task-form-label">所属学科</label>
          <div class="subject-capsule-grid">
            <div
              v-for="subj in availableSubjectsForTask"
              :key="subj.id"
              class="subject-capsule-item"
              :class="{ active: taskForm.subjectId === subj.id }"
              :style="taskForm.subjectId === subj.id ? { borderColor: subj.color, background: subj.color + '22' } : {}"
              @click="taskForm.subjectId = subj.id"
            >
              <span class="subj-capsule-icon">{{ subj.icon || '📘' }}</span>
              <span class="subj-capsule-name">{{ subj.name }}</span>
            </div>
          </div>
        </div>

        <!-- 专注时长（在长条按钮交互条上拖动选择） -->
        <div class="task-form-group">
          <div class="duration-header">
            <label class="task-form-label">专注时长</label>
            <span class="duration-badge">{{ taskForm.duration }} 分钟 ({{ (taskForm.duration / 60).toFixed(1) }}h)</span>
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
              :style="{ width: Math.min(100, Math.max(0, ((taskForm.duration - 30) / (240 - 30)) * 100)) + '%' }"
            ></div>
            <!-- 长条刻度与选项文字 -->
            <div class="duration-bar-steps">
              <span 
                v-for="step in [30, 60, 90, 120, 180, 240]" 
                :key="step"
                class="duration-step-item"
                :class="{ active: taskForm.duration >= step }"
                @click.stop="taskForm.duration = step"
              >
                {{ step < 60 ? step + 'm' : (step / 60) + 'h' }}
              </span>
            </div>
            <!-- 拖动圆角手柄反馈 -->
            <div 
              class="duration-bar-thumb"
              :style="{ left: Math.min(100, Math.max(0, ((taskForm.duration - 30) / (240 - 30)) * 100)) + '%' }"
            >
              <span>{{ taskForm.duration }}m</span>
            </div>
          </div>
        </div>
      </div>

      <div class="task-modal-footer">
        <button class="task-btn-cancel" @click="showTaskModal = false">取消</button>
        <button
          class="task-btn-submit"
          :disabled="!taskForm.name.trim() || !taskForm.subjectId"
          @click="handleAddTask"
        >
          添加到待办
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
import { localDb } from '@/services/localDb'

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

// ==========================================
// [STATIC MOCK DATA] 静态兜底数据定义区 (无后端/无数据库数据时瞬间即时渲染)
// ==========================================
const STATIC_SUBJECTS = [
  { id: 'STATIC_SUB_1', name: '高等数学与线性代数', icon: '📐', color: '#7D9372', blockCount: 12 },
  { id: 'STATIC_SUB_2', name: '人工智能导论与大模型', icon: '🤖', color: '#A3B19B', blockCount: 8 },
  { id: 'STATIC_SUB_3', name: '操作系统与内核分析', icon: '💻', color: '#8E9C86', blockCount: 6 },
  { id: 'STATIC_SUB_4', name: '心理学与禅意认知', icon: '🌿', color: '#A8BFA0', blockCount: 4 }
]

const STATIC_BLOCKS = [
  {
    id: 'STATIC_B_1',
    subject: '人工智能导论与大模型',
    subjectId: 'STATIC_SUB_2',
    title: 'Transformer 架构中的 Self-Attention 矩阵计算推导',
    preview: '**Self-Attention** 核心在于 **Q**, **K**, **V** 矩阵乘法及 **Softmax** 归一化，通过缩放因子 **d_k** 的平方根消除梯度消失问题，在高维空间捕获全局语义依赖。',
    content: `### 1. 核心思想与动机

在序列建模中，传统的循环神经网络难以高效并行且易丢失长跨度信息。**Self-Attention**（自注意力机制）打破了时序距离限制，让序列中的任意两个位置能直接建立纳秒级语义关联。

### 2. 核心公式与推导步骤

设输入矩阵为 **X**，分别乘以权重张量得到查询矩阵 **Q**、键矩阵 **K** 和值矩阵 **V**：
* **Query 矩阵 (Q)**：代表当前词去向全局探寻匹配度的特征向量。
* **Key 矩阵 (K)**：被检索特征，与 **Q** 进行内积运算以得出注意力分数。
* **Value 矩阵 (V)**：真正承载具体语义内容的张量矩阵。

标准缩放点积注意力公式为：
> Attention(Q, K, V) = Softmax( (Q * K^T) / sqrt(d_k) ) * V

### 3. 缩放因子 sqrt(d_k) 的关键作用

当维度 **d_k** 增大时，矩阵内积 **Q * K^T** 的方差会按常数倍膨胀。如果直接输入到 **Softmax** 中，输出权重分布将向两端极端极化，导致反向传播时**梯度严重消失**。除以 **sqrt(d_k)** 后，内积方差重新缩并为 **1**，确保梯度的平稳回传。`,
    source: 'AI 伴读笔记 · 第3章',
    time: '10:30',
    color: '#A3B19B',
    difficulty: 'hard' as const,
    mastery: 85
  },
  {
    id: 'STATIC_B_2',
    subject: '高等数学与线性代数',
    subjectId: 'STATIC_SUB_1',
    title: '常系数二阶线性齐次微分方程特征根法判定',
    preview: '对于常系数齐次线性微分方程，通过求解特征方程 **r^2 + pr + q = 0** 可以准确判定通解的实根或复根形式。',
    content: `### 1. 特征方程建立
对于齐次微分方程 **y'' + py' + qy = 0**，设其解的形式为 **y = e^(rx)**，代入并消去非零因子得特征方程：
> r^2 + pr + q = 0

### 2. 三种根情况判定
* **两个不相等的实根 (Δ > 0)**：通解为 **y = C1 * e^(r1*x) + C2 * e^(r2*x)**。
* **两个相等的实根 (Δ = 0)**：通解为 **y = (C1 + C2*x) * e^(r*x)**。
* **一对共轭复根 (Δ < 0)**：设根为 **α ± βi**，通解为 **y = e^(αx) * (C1*cos(βx) + C2*sin(βx))**。`,
    source: '教材提炼 · P142',
    time: '昨日',
    color: '#7D9372',
    difficulty: 'medium' as const,
    mastery: 90
  },
  { id: 'STATIC_B_3', subject: '操作系统与内核分析', subjectId: 'STATIC_SUB_3', title: 'Linux 虚拟内存多级页表与 TLB 快表寻址机制', preview: '多级页表有效节省了内存页表项空间，而 **TLB** 高速缓存将页表查询由多级访存压缩至纳秒级直接物理映射，大幅提高访存命中率。', source: '课堂实录 · 第8讲', time: '前天', color: '#8E9C86', difficulty: 'medium' as const, mastery: 78 },
  { id: 'STATIC_B_4', subject: '心理学与禅意认知', subjectId: 'STATIC_SUB_4', title: '正念冥想对前额叶皮层与专注力的神经重塑', preview: '研究证明持续的正念冥想能显著提升工作记忆与禅意专注力，有效降低杏仁核应激唤醒水平，增强情绪自主调控能力。', source: '文献综述 · 2026', time: '3天前', color: '#A8BFA0', difficulty: 'easy' as const, mastery: 95 },
  { id: 'STATIC_B_5', subject: '高等数学与线性代数', subjectId: 'STATIC_SUB_1', title: '正交矩阵的几何性质与 SVD 奇异值分解应用', preview: '任意实矩阵 **A** 均可分解为 **UΣV^T**，**SVD** 在数据降维、推荐系统与主成分分析 **PCA** 中起着基础性与支柱性的数学作用。', source: '总结归纳', time: '4天前', color: '#7D9372', difficulty: 'hard' as const, mastery: 82 },
  { id: 'STATIC_B_6', subject: '人工智能导论与大模型', subjectId: 'STATIC_SUB_2', title: '混合专家模型 (MoE) 稀疏门控路由工作原理', preview: '**MoE** 通过 **Top-K** 门控网络动态选择并激活部分专家子网，实现了模型总体参数规模指数级扩展与极低推理算力开销之间的完美平衡。', source: '论文研读', time: '本周', color: '#A3B19B', difficulty: 'hard' as const, mastery: 70 }
]

const STATIC_PENDING_TASKS: Task[] = [
  { id: 'STATIC_T_P1', name: '复习矩阵特征值与对角化判定条件', subject: '高等数学与线性代数', subjectId: 'STATIC_SUB_1', color: '#7D9372', duration: 60, load: 'low', loadText: '低负荷', status: 'pending' },
  { id: 'STATIC_T_P2', name: '整理本周心理学实验认知报告', subject: '心理学与禅意认知', subjectId: 'STATIC_SUB_4', color: '#A8BFA0', duration: 60, load: 'low', loadText: '低负荷', status: 'pending' },
  { id: 'STATIC_T_P3', name: '完成 LangChain4j 本地 RAG 连通测试', subject: '人工智能导论与大模型', subjectId: 'STATIC_SUB_2', color: '#A3B19B', duration: 120, load: 'medium', loadText: '中负荷', status: 'pending' }
]

const STATIC_SCHEDULED_TASKS: Task[] = [
  { id: 'STATIC_T_S1', name: '高数多元函数极值习题精练', subject: '高等数学与线性代数', subjectId: 'STATIC_SUB_1', color: '#7D9372', duration: 120, load: 'high', loadText: '高负荷', status: 'scheduled', startTime: '10:00', position: getTodayDayCode() },
  { id: 'STATIC_T_S2', name: '研读 MoE 架构论文图表与公式', subject: '人工智能导论与大模型', subjectId: 'STATIC_SUB_2', color: '#A3B19B', duration: 60, load: 'medium', loadText: '中负荷', status: 'scheduled', startTime: '14:00', position: getTodayDayCode() },
  { id: 'STATIC_T_S3', name: '梳理 Linux 进程调度 CFS 源码图解', subject: '操作系统与内核分析', subjectId: 'STATIC_SUB_3', color: '#8E9C86', duration: 120, load: 'medium', loadText: '中负荷', status: 'scheduled', startTime: '16:00', position: getTodayDayCode() }
]
// ==========================================

const getScheduledTasksForDay = (day: string) => {
  const sourceTasks = allTasks.value.length > 0 ? allTasks.value : STATIC_SCHEDULED_TASKS
  return sourceTasks.filter(t => {
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
  const subjectsList = subjectStore.subjects.length > 0 ? subjectStore.subjects : STATIC_SUBJECTS
  const count = recentBlocks.value.length > 0 ? recentBlocks.value.length : STATIC_BLOCKS.length
  return [
    { id: null as string | null, name: '全部', icon: '📋', color: 'var(--text-muted)', blockCount: count },
    ...subjectsList
  ]
})

const filteredBlocks = computed(() => {
  const blocksList = recentBlocks.value.length > 0 ? recentBlocks.value : STATIC_BLOCKS
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

// ===== Task Creation =====
const showTaskModal = ref(false)
const taskForm = ref({
  name: '',
  subjectId: '',
  duration: 60,
  load: 'medium' as 'low' | 'medium' | 'high',
  loadText: '2.0 🧠'
})

const availableSubjectsForTask = computed(() => {
  return subjectStore.subjects.length > 0 ? subjectStore.subjects : STATIC_SUBJECTS
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
  taskForm.value.duration = Math.max(30, Math.min(240, rounded))
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

const openCreateTaskDialog = () => {
  taskForm.value = {
    name: '',
    subjectId: availableSubjectsForTask.value[0]?.id || '',
    duration: 60,
    load: 'medium' as 'low' | 'medium' | 'high',
    loadText: '常规专注'
  }
  showTaskModal.value = true
}


const handleAddTask = async () => {
  const subjObj = availableSubjectsForTask.value.find(s => s.id === taskForm.value.subjectId)
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
  const tasksList = pendingTasks.value.length > 0 ? pendingTasks.value : STATIC_PENDING_TASKS
  return tasksList.filter(t => t.status === 'pending')
})

const filteredTimeSlots = computed(() => {
  const hasStoreSlots = timeSlots.value.some(s => s.task !== null)
  if (hasStoreSlots || allTasks.value.length > 0) {
    return timeSlots.value
  }
  return timeSlots.value.map(slot => {
    const staticTask = STATIC_SCHEDULED_TASKS.find(t => t.startTime === slot.time && (selectedDay.value === getTodayDayCode() || t.position === selectedDay.value))
    if (staticTask) {
      return { ...slot, task: staticTask }
    }
    return slot
  })
})

const HOUR_HEIGHT = 52
const getTaskHeight = (duration?: number) => {
  const d = duration || 60
  return `${(d / 60) * HOUR_HEIGHT}px`
}

const isSlotCovered = (slotTime: string) => {
  const targetSlot = filteredTimeSlots.value.find(s => s.time === slotTime)
  if (targetSlot?.task) return false

  const currentHour = parseInt(slotTime.split(':')[0], 10)
  for (const slot of filteredTimeSlots.value) {
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

  // 临时数据 / 演示数据种子 (当首屏无任何数据时自动写入，展示丰满界面)
  if (subjectStore.subjects.length === 0 && recentBlocks.value.length === 0 && allTasks.value.length === 0) {
    const s1 = { id: 's-math', name: '高等数学与线性代数', description: '微积分、线性代数与微分方程核心概念', icon: '📐', color: '#7D9372', created_at: Date.now() }
    const s2 = { id: 's-ai', name: '人工智能导论与大模型', description: '深度学习、Transformer 与大语言模型架构', icon: '🤖', color: '#A3B19B', created_at: Date.now() }
    const s3 = { id: 's-os', name: '操作系统与内核分析', description: '进程调度、虚拟内存管理与文件系统', icon: '💻', color: '#8E9C86', created_at: Date.now() }
    const s4 = { id: 's-zen', name: '心理学与禅意认知', description: '正念专注、认知神经科学与情绪管理', icon: '🌿', color: '#A8BFA0', created_at: Date.now() }
    await localDb.saveSubject(s1)
    await localDb.saveSubject(s2)
    await localDb.saveSubject(s3)
    await localDb.saveSubject(s4)

    const todayCode = getTodayDayCode()
    const blocksDemo = [
      { id: 'b-1', subject: '人工智能导论与大模型', subjectId: 's-ai', title: 'Transformer 架构中的 Self-Attention 矩阵计算推导', preview: '`Self-Attention` 核心在于 `Q`, `K`, `V` 矩阵乘法及 `Softmax` 归一化，通过缩放因子 `d_k` 的平方根消除梯度消失问题...', source: 'AI 伴读笔记 · 第3章', time: '10:30', color: '#A3B19B', difficulty: 'hard', mastery: 85 },
      { id: 'b-2', subject: '高等数学与线性代数', subjectId: 's-math', title: '常系数二阶线性齐次微分方程特征根法判定', preview: '对于常系数齐次线性微分方程，通过求解特征方程 `r^2 + pr + q = 0` 可以准确判定通解的实根或复根形式...', source: '教材提炼 · P142', time: '昨日', color: '#7D9372', difficulty: 'medium', mastery: 90 },
      { id: 'b-3', subject: '操作系统与内核分析', subjectId: 's-os', title: 'Linux 虚拟内存多级页表与 TLB 快表寻址机制', preview: '多级页表有效节省了内存页表项空间，而 `TLB` 高速缓存将页表查询由多级访存压缩至纳秒级直接物理映射...', source: '课堂实录 · 第8讲', time: '前天', color: '#8E9C86', difficulty: 'medium', mastery: 78 },
      { id: 'b-4', subject: '心理学与禅意认知', subjectId: 's-zen', title: '正念冥想对前额叶皮层与专注力的神经重塑', preview: '研究证明持续的正念冥想能显著提升工作记忆与禅意专注力，有效降低杏仁核应激唤醒水平...', source: '文献综述 · 2026', time: '3天前', color: '#A8BFA0', difficulty: 'easy', mastery: 95 },
      { id: 'b-5', subject: '高等数学与线性代数', subjectId: 's-math', title: '正交矩阵的几何性质与 SVD 奇异值分解应用', preview: '任意实矩阵 `A` 均可分解为 `UΣV^T`，`SVD` 在数据降维、推荐系统与主成分分析 `PCA` 中起着基础性作用...', source: '总结归纳', time: '4天前', color: '#7D9372', difficulty: 'hard', mastery: 82 },
      { id: 'b-6', subject: '人工智能导论与大模型', subjectId: 's-ai', title: '混合专家模型 (MoE) 稀疏门控路由工作原理', preview: '`MoE` 通过 `Top-K` 门控网络动态选择并激活部分专家子网，实现了参数规模指数扩展与极低推理算力开销的平衡...', source: '论文研读', time: '本周', color: '#A3B19B', difficulty: 'hard', mastery: 70 }
    ]
    for (const b of blocksDemo) {
      await localDb.saveBlock(b as any)
    }

    const tasksDemo = [
      { id: 't-1', name: '高数多元函数极值习题精练', subject: '高等数学与线性代数', subjectId: 's-math', color: '#7D9372', duration: 2, load: 'high', loadText: '高负荷', status: 'scheduled', startTime: '10:00', position: todayCode },
      { id: 't-2', name: '研读 MoE 架构论文图表与公式', subject: '人工智能导论与大模型', subjectId: 's-ai', color: '#A3B19B', duration: 1, load: 'medium', loadText: '中负荷', status: 'scheduled', startTime: '14:00', position: todayCode },
      { id: 't-3', name: '梳理 Linux 进程调度 CFS 源码图解', subject: '操作系统与内核分析', subjectId: 's-os', color: '#8E9C86', duration: 2, load: 'medium', loadText: '中负荷', status: 'scheduled', startTime: '16:00', position: todayCode },
      { id: 't-4', name: '复习矩阵特征值与对角化判定条件', subject: '高等数学与线性代数', subjectId: 's-math', color: '#7D9372', duration: 1, load: 'low', loadText: '低负荷', status: 'pending' },
      { id: 't-5', name: '整理本周心理学实验认知报告', subject: '心理学与禅意认知', subjectId: 's-zen', color: '#A8BFA0', duration: 1, load: 'low', loadText: '低负荷', status: 'pending' },
      { id: 't-6', name: '完成 LangChain4j 本地 RAG 连通测试', subject: '人工智能导论与大模型', subjectId: 's-ai', color: '#A3B19B', duration: 2, load: 'medium', loadText: '中负荷', status: 'pending' }
    ]
    for (const t of tasksDemo) {
      await localDb.saveTask(t as any)
    }

    await blockStore.fetchBlocks()
    await taskStore.fetchTasks()
    await subjectStore.loadSubjects()
  }
})
</script>

<style scoped>
/* ===== Root Layout ===== */
.dashboard-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #F5F7F5; /* 极浅灰绿色大背景，拉开卡片层次 */
  padding: 14px;
  gap: 14px;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #7D9372;
  --color-primary-accent-hover: #687F5D;
  --color-primary-light: rgba(163, 177, 155, 0.18);
  --color-primary-glow: rgba(125, 147, 114, 0.28);
  --accent-gradient: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  --bg-card: #FFFFFF;
}

html.dark .dashboard-container {
  background: #111411;
  --bg-card: #181C18;
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
  padding: 20px 16px;
  overflow-y: auto;
  flex-shrink: 0;
  background: var(--bg-card, #FFFFFF);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.035);
}

html.dark .subject-index {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
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
  overflow: hidden;
  padding: 24px 28px;
  background: var(--bg-card, #FFFFFF);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.035);
}

html.dark .content-stream {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
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
  padding-right: 4px;
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
  background: var(--color-bg-primary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.015);
}

.stream-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
  border-color: rgba(163, 177, 155, 0.45);
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
  font-size: 13.5px;
  color: var(--text-secondary);
  line-height: 1.78;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.95;
}

.row-preview :deep(code) {
  background: transparent;
  color: #2D3E25;
  font-family: 'JetBrains Mono', Consolas, monospace;
  padding: 0;
  border: none;
  font-size: 12.5px;
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
  background: var(--bg-card, #FFFFFF);
  flex-shrink: 0;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.035);
}

html.dark .dashboard-right {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
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
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  color: white;
  border: none;
  padding: 5px 14px;
  font-size: 11.5px;
  font-weight: 750;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 3px 10px rgba(125, 147, 114, 0.25);
}

.new-task-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(125, 147, 114, 0.35);
}

.dashboard-time-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.db-view-select {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: all var(--transition-fast);
}

.db-view-select:hover {
  border-color: #7D9372;
  color: var(--text-primary);
}

.db-day-selector {
  display: flex;
  gap: 5px;
  justify-content: space-between;
  margin-bottom: 14px;
}

.db-day-btn {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  padding: 6px 4px;
  border-radius: 8px;
  font-size: 11px;
  cursor: pointer;
  color: var(--text-secondary);
  flex: 1;
  text-align: center;
  font-weight: 650;
  transition: all var(--transition-fast);
}

.db-day-btn:hover {
  background: rgba(163, 177, 155, 0.12);
  color: var(--text-primary);
}

.db-day-btn.is-active {
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  color: white;
  border-color: transparent;
  font-weight: 850;
  box-shadow: 0 4px 10px rgba(125, 147, 114, 0.3);
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
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.timeline-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.tl-slot {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 52px;
  position: relative;
  transition: background var(--transition-fast);
  padding: 0 4px;
  box-sizing: border-box;
}

.tl-slot.has-task {
  padding: 0 4px;
}

.tl-time {
  width: 36px;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: right;
  flex-shrink: 0;
  letter-spacing: -0.2px;
  opacity: 0.8;
  margin-top: 6px;
}

.tl-slot.is-current .tl-time {
  color: #7D9372;
  font-weight: 800;
  opacity: 1;
}

.tl-dash {
  flex: 1;
  height: 0;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
  flex-shrink: 1;
  min-width: 0;
  margin-top: 11px;
}

.tl-slot.has-task .tl-dash {
  display: none;
}

.tl-task {
  flex: 1;
  padding: 6px 10px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-left: 3px solid;
  border-radius: var(--radius-sm);
  cursor: grab;
  transition: all var(--transition-fast);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-2);
  box-sizing: border-box;
  margin: 0;
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
  left: 44px;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  pointer-events: none;
  z-index: 5;
}

.current-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7D9372;
  box-shadow: 0 0 6px rgba(125, 147, 114, 0.6);
  z-index: 1;
}

.current-line {
  flex: 1;
  height: 1.5px;
  background: linear-gradient(to right, #7D9372, rgba(125, 147, 114, 0.1));
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
  background: var(--color-zen-sage, #7D9372);
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
  box-shadow: 0 2px 8px rgba(125, 147, 114, 0.35);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.todo-fab-add-btn:hover {
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 4px 12px rgba(125, 147, 114, 0.45);
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
  gap: 8px; /* 胶囊之间的间隙拉开至 8px，层次清晰 */
  padding: 2px 2px 8px;
}

.todo-list.drag-over {
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-sm);
}

/* 待办事件胶囊化包裹 (Capsule/Pill shape) */
.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: grab;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 9999px; /* 胶囊圆角 */
  background: var(--color-bg-tertiary, #F5F7F5);
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

.task-checkbox {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: #7D9372;
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
  flex-shrink: 0;
}
html.dark .todo-subject {
  background: rgba(163, 177, 155, 0.25);
  color: #E2E8DE;
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
  font-family: 'JetBrains Mono', Consolas, monospace;
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
  background: #849C8A; /* 偏深的鼠尾草绿 #849C8A */
  color: #FFFFFF; /* 白色文字“确定” */
  border: none;
  border-radius: 8px; /* 中等圆角 8px */
  padding: 8px 26px; /* 高度适中 */
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(132, 156, 138, 0.3);
}

.sage-primary-btn:hover {
  background: #758C7B;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(132, 156, 138, 0.42);
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

.task-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
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
  background: #7D9372;
  color: #FFFFFF;
  border: none;
  border-radius: 9999px;
  padding: 8px 26px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(125, 147, 114, 0.3);
}

.task-btn-submit:hover:not(:disabled) {
  background: #6E8364;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(125, 147, 114, 0.45);
}

.task-btn-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
