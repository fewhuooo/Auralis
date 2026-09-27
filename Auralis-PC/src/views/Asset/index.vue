<template>
  <div class="asset-studio">
    <!-- LEFT: Asset Tree (Nested Folder Explorer + Upload Inline) -->
    <aside class="studio-left">
      <div class="panel-header">
        <span class="panel-title">资产库</span>
        <button class="icon-btn" title="导入文件" @click="showRegisterModal = true">
          <IconPlus :size="16" :stroke-width="2" />
        </button>
      </div>

      <!-- Search -->
      <div class="tree-search">
        <input v-model="searchQ" class="search-input" placeholder="搜索资产/知识/任务..." />
      </div>

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-progress-wrapper" style="margin: 0 20px 16px; padding: 12px; background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);">
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
          <span aria-live="polite" style="font-weight: 500;">{{ uploadStatusText || '正在上传文件' }}</span>
          <span style="font-weight: 600; color: var(--color-primary-accent, #8B9A6E);">{{ uploadProgress }}%</span>
        </div>
        <div style="height: 4px; background: var(--border-subtle); border-radius: 2px; overflow: hidden; position: relative;">
          <div :style="{ width: uploadProgress + '%', height: '100%', background: 'var(--accent-gradient)', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)', borderRadius: '2px' }"></div>
          <div v-if="uploadProgress < 100" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); animation: shimmer 1.5s infinite; transform: translateX(-100%);"></div>
        </div>
      </div>



      <!-- Tree Hierarchy -->
      <div class="tree-body">
        <div v-if="isLoadingAssets" class="tree-loading">
          <span class="loading-spinner"></span> 加载中...
        </div>
        <div v-else-if="filteredGroups.length === 0" class="tree-empty">
          <IconArchive :size="24" :stroke-width="1.6" class="empty-tree-icon" />
          <p>暂无数据</p>
        </div>
        <template v-else>
          <!-- Level 1: Groups (e.g. 全部, 学科A) -->
          <div v-for="group in filteredGroups" :key="group.id" class="tree-group">
            <div class="tree-group-header" @click="toggleTreeNode(group)">
              <span class="group-arrow">{{ group.open ? '▾' : '▸' }}</span>
              <component :is="group.lucideIcon" :size="13" class="group-icon" />
              <span class="group-name">{{ group.name }}</span>
              <button v-if="group.id !== 'all'" class="header-action-btn" title="上传资产" @click.stop="openUploadForGroup(group.id)">
                <IconPlus :size="12" :stroke-width="2" />
              </button>
            </div>
            
            <div v-if="group.open" class="tree-children">
              <!-- Level 2: Folders (e.g. 全部文件, 任务) -->
              <div v-for="folder in group.children" :key="folder.id" class="tree-folder-container">
                <div class="tree-folder-header" @click="toggleTreeNode(folder)">
                  <span class="folder-arrow">{{ folder.open ? '▾' : '▸' }}</span>
                  <component :is="folder.lucideIcon" :size="13" class="folder-icon" />
                  <span class="folder-name">{{ folder.name }}</span>
                  <span class="folder-count">{{ folder.children?.length || 0 }}</span>
                </div>
                
                <div v-if="folder.open" class="tree-items">
                  <!-- Level 3: Items (File, Block, Task) or Task Categories -->
                  <template v-for="item in folder.children" :key="item.id">
                    <div v-if="item.type === 'folder'" class="tree-subfolder-container">
                      <div
                        class="tree-folder-header"
                        :class="{ 'is-focus': focusUnassigned && item.id === 'all-tasks-unassigned' }"
                        @click="toggleTreeNode(item)"
                      >
                        <span class="folder-arrow">{{ item.open ? '▾' : '▸' }}</span>
                        <component :is="item.lucideIcon" :size="13" class="folder-icon" />
                        <span class="folder-name">{{ item.name }}</span>
                        <span class="folder-count">{{ item.children?.length || 0 }}</span>
                      </div>
                      <div v-if="item.open" class="tree-items">
                        <div
                          v-for="subitem in item.children"
                          :key="subitem.id"
                          class="tree-item tree-subitem"
                          :class="{ 'is-active': selected?.id === subitem.id }"
                          @click="selectItem(subitem)"
                        >
                          <component :is="subitem.lucideIcon" :size="14" class="item-icon" />
                          <div class="item-info">
                            <span class="item-name" :class="{ 'is-done': subitem.type === 'task' && subitem.done }">{{ subitem.name }}</span>
                            <span v-if="subitem.type === 'file'" class="item-meta">{{ subitem.time }}</span>
                            <span v-else-if="subitem.type === 'task'" class="item-meta">截止: {{ subitem.due || '未设置' }}</span>
                          </div>
                          <span v-if="subitem.type === 'file'" class="status-dot" :class="subitem.status"></span>
                          <span v-if="subitem.type === 'task' && subitem.done" class="task-done-icon"><IconCheck :size="12" :stroke-width="2" /></span>
                        </div>
                        <div v-if="!item.children?.length" class="tree-empty-folder tree-subitem-empty">无内容</div>
                      </div>
                    </div>
                    <div
                      v-else
                      class="tree-item"
                      :class="{ 'is-active': selected?.id === item.id }"
                      @click="selectItem(item)"
                    >
                      <component :is="item.lucideIcon" :size="14" class="item-icon" />
                      <div class="item-info">
                        <span class="item-name" :class="{ 'is-done': item.type === 'task' && item.done }">{{ item.name }}</span>
                        <span v-if="item.type === 'file'" class="item-meta">{{ item.time }}</span>
                        <span v-else-if="item.type === 'task'" class="item-meta">截止: {{ item.due || '未设置' }}</span>
                      </div>
                      <span v-if="item.type === 'file'" class="status-dot" :class="item.status"></span>
                      <span v-if="item.type === 'task' && item.done" class="task-done-icon"><IconCheck :size="12" :stroke-width="2" /></span>
                    </div>
                  </template>
                  <div v-if="!folder.children?.length" class="tree-empty-folder">无内容</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Drop Zone (Clickable) -->
      <div
        class="drop-zone"
        :class="{ 'is-over': isDragover }"
        @dragover.prevent="isDragover = true"
        @dragleave.prevent="isDragover = false"
        @drop.prevent="handleDrop"
        @click="showRegisterModal = true"
      >
        <IconCloudUpload :size="16" :stroke-width="1.8" class="drop-icon" />
        <span class="drop-text">拖拽文件或点击此处上传</span>
      </div>
    </aside>

    <!-- COLUMN 2: MIDDLE Dynamic Viewer (File / Block / Task) -->
    <main class="studio-middle">
      <div v-if="!selected" class="empty-state">
        <IconLayoutDashboard :size="48" :stroke-width="1.6" class="empty-icon" />
        <h2 class="empty-title">资产阅览区</h2>
        <p class="empty-desc">在左侧树状目录中选择文件、知识块或任务以开始沉浸式工作</p>
      </div>
      <template v-else>
        <!-- Dynamic Header based on Type -->
        <div class="detail-header">
          <!-- File View Header -->
          <div v-if="selected.type === 'file'" class="detail-title-row">
            <component :is="selected.lucideIcon" :size="24" class="detail-icon" />
            <div class="detail-main-info">
              <h1 class="detail-name">{{ selected.name }}</h1>
              <p class="detail-path">上传于 {{ selected.time }} · {{ selected.pages }} 页 · {{ selected.size }}</p>
            </div>
            <span class="status-badge" :class="selected.status">{{ selected.statusText }}</span>
          </div>

          <!-- Knowledge Block View Header -->
          <div v-else-if="selected.type === 'block'" class="detail-title-row editor-bar-row">
            <div class="editor-bar-left">
              <div class="header-icon-badge">
                <IconNotes :size="18" :stroke-width="1.8" />
              </div>
              <div class="header-breadcrumb">
                <span class="crumb-parent">知识库</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-subject">{{ getSubjectName(selected.groupId) }}</span>
              </div>
            </div>
            <div class="editor-bar-right">
              <span class="editor-stats-hint">{{ (selected.preview || '').length }} 字符</span>
              <button class="btn-primary sm-btn header-save-btn" @click="saveBlockEdit(selected)">
                <IconCheck :size="14" :stroke-width="2.2" />
                <span>保存知识块</span>
              </button>
            </div>
          </div>

          <!-- Task View Header -->
          <div v-else-if="selected.type === 'task'" class="detail-title-row editor-bar-row">
            <div class="editor-bar-left">
              <div class="header-icon-badge task-icon-badge">
                <IconListCheck :size="18" :stroke-width="1.8" />
              </div>
              <div class="header-breadcrumb">
                <span class="crumb-parent">任务库</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-subject">{{ getSubjectName(selected.groupId) }}</span>
              </div>
              <button
                class="header-status-pill"
                :class="{ 'is-done': selected.done }"
                  :disabled="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow)"
                @click="toggleTaskDone(selected)"
                  :title="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow) ? '任务时段已结束，完成状态不可取消' : selected.done ? '点击标记为待处理' : '点击标记为已完成'"
              >
                <component :is="selected.done ? IconCircleCheck : IconCircleDot" :size="14" :stroke-width="2" />
                <span>{{ selected.done ? '已完成' : '待处理' }}</span>
              </button>
            </div>
            <div class="editor-bar-right">
              <span v-if="selected.due" class="header-meta-pill">截止: {{ selected.due }}</span>
              <span class="header-meta-pill">预计: {{ formatDuration(selected.durationMinutes || 30) }}</span>
              <button class="btn-primary sm-btn header-save-btn" @click="saveTaskEdit(selected)">
                <IconCheck :size="14" :stroke-width="2.2" />
                <span>保存任务</span>
              </button>
            </div>
          </div>
        </div>

        <div class="middle-content-scroll">
          <!-- View: FILE -->
          <div v-if="selected.type === 'file'" class="full-height-viewer">
            <FilePreview v-if="selectedPreviewFile" :file="selectedPreviewFile" :bare="true" />
          </div>

          <!-- View: BLOCK -->
          <div v-else-if="selected.type === 'block'" class="editor-canvas-view">
            <div class="editor-paper-card">
              <!-- Paper Meta Top -->
              <div class="paper-meta-header">
                <div class="paper-meta-left">
                  <span class="paper-subject-pill">{{ getSubjectName(selected.groupId) }}</span>
                </div>
                <div class="paper-meta-right">
                  <span class="paper-hint-text">Markdown 实时笔记</span>
                </div>
              </div>

              <!-- Title Input -->
              <div class="paper-title-row">
                <input
                  v-model="selected.name"
                  class="paper-title-input"
                  placeholder="输入知识块标题..."
                />
              </div>

              <!-- Editor Divider -->
              <div class="paper-divider"></div>

              <!-- Markdown Writing Area -->
              <div class="paper-editor-section">
                <div class="editor-micro-toolbar">
                  <span class="micro-tip">支持 Markdown 语法、公式与代码排版</span>
                  <span class="micro-count">{{ (selected.preview || '').length }} 字</span>
                </div>
                <textarea
                  v-model="selected.preview"
                  class="paper-textarea"
                  placeholder="在此编写知识块的核心内容、知识点脉络或关键定理（支持 Markdown 语法与代码块）..."
                  rows="18"
                ></textarea>
              </div>
            </div>
          </div>

          <!-- View: TASK -->
          <div v-else-if="selected.type === 'task'" class="editor-canvas-view">
            <div class="editor-paper-card">
              <!-- Paper Meta Top -->
              <div class="paper-meta-header">
                <div class="paper-meta-left">
                  <span class="paper-subject-pill">{{ getSubjectName(selected.groupId) }}</span>
                  <button
                    class="paper-status-pill"
                    :class="{ 'is-done': selected.done }"
                    :disabled="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow)"
                    @click="toggleTaskDone(selected)"
                    :title="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow) ? '任务时段已结束，完成状态不可取消' : selected.done ? '点击标记为待处理' : '点击标记为已完成'"
                  >
                    <component :is="selected.done ? IconCircleCheck : IconCircleDot" :size="13" :stroke-width="2" />
                    <span>{{ selected.done ? '已完成' : '待处理' }}</span>
                  </button>
                </div>
                <div class="paper-meta-right">
                  <span v-if="selected.originalData?.scheduledAt" class="scheduled-indicator">
                    <IconCalendar :size="12" /> 已安排在日程
                  </span>
                  <span v-else class="unscheduled-indicator">
                    未排期
                  </span>
                </div>
              </div>

              <!-- Task Title Input -->
              <div class="paper-title-row">
                <input
                  v-model="selected.name"
                  class="paper-title-input"
                  :class="{ 'is-done': selected.done }"
                  placeholder="输入任务名称或行动事项..."
                />
              </div>

              <!-- Notion-like Property Panel -->
              <div class="paper-property-panel">
                <div class="property-grid">
                  <!-- Due Date Row -->
                  <div class="property-item">
                    <div class="property-label">
                      <IconCalendar :size="14" :stroke-width="1.8" />
                      <span>截止日期</span>
                    </div>
                    <div class="property-control">
                      <el-date-picker
                        v-model="selected.due"
                        type="date"
                        placeholder="设置截止日期"
                        format="YYYY-MM-DD"
                        value-format="YYYY-MM-DD"
                        class="zen-date-picker"
                        popper-class="zen-date-popper"
                      />
                    </div>
                  </div>

                  <!-- Duration Row -->
                  <div class="property-item">
                    <div class="property-label">
                      <IconClock :size="14" :stroke-width="1.8" />
                      <span>预计用时</span>
                    </div>
                    <div class="property-control">
                      <el-select
                        v-model="selected.durationMinutes"
                        placeholder="选择预计用时"
                        class="zen-select"
                        popper-class="zen-select-popper"
                        style="width: 220px;"
                        aria-label="预计用时"
                      >
                        <el-option
                          v-for="minutes in durationOptions"
                          :key="minutes"
                          :label="formatDuration(minutes)"
                          :value="minutes"
                        />
                      </el-select>
                    </div>
                  </div>

                  <!-- Subject Row -->
                  <div class="property-item">
                    <div class="property-label">
                      <IconFolder :size="14" :stroke-width="1.8" />
                      <span>所属学科</span>
                    </div>
                    <div class="property-control">
                      <el-select
                        v-model="selected.groupId"
                        placeholder="选择所属学科"
                        class="zen-select"
                        popper-class="zen-select-popper"
                        style="width: 220px;"
                      >
                        <el-option
                          v-for="subj in subjectStore.subjects"
                          :key="subj.id"
                          :label="subj.name"
                          :value="subj.id"
                        />
                      </el-select>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Divider -->
              <div class="paper-divider"></div>

              <!-- Task Notes Section -->
              <div class="paper-notes-section">
                <div class="section-label-row">
                  <IconFileText :size="14" :stroke-width="1.8" />
                  <span>任务备注与详细说明</span>
                </div>
                <textarea
                  v-model="selected.preview"
                  class="paper-textarea task-notes-textarea"
                  placeholder="记录该任务的详细要求、执行要点或参考资料..."
                  rows="10"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- COLUMN 3: RIGHT Context (Only Graph) -->
    <aside class="studio-right-context">
      <div v-if="!selected" class="graph-empty-state">
        <IconNetwork :size="40" :stroke-width="1.6" class="empty-graph-icon" />
        <p class="empty-graph-desc">选择项目以加载上下文星空图</p>
      </div>
      <template v-else>
        <div class="panel-header">
          <span class="panel-title">关系星图</span>
        </div>
        <div class="context-body">
          <div class="ctx-graph">
             <KnowledgeGraph
              v-if="selectedGroupForGraph"
              :subjectId="selectedGroupForGraph.id"
              :blocks="graphBlocks"
              :sources="graphSources"
              :subjects="graphSubjects"
              :subjectName="selectedGroupForGraph.name"
              :selectedAsset="selectedGraphAsset"
              @select-node="selectGraphNode"
            />
          </div>
        </div>
      </template>
    </aside>

    <!-- Register File Modal -->
    <FileRegisterDialog
      v-model="showRegisterModal"
      :default-subject-id="selectedSubjectId"
      @submit="handleRegisterSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-option.css'
import FileRegisterDialog from '@/components/asset/FileRegisterDialog.vue'

import {
  IconPlus,
  IconArchive,
  IconFileText,
  IconCloudUpload,
  IconLayoutDashboard,
  IconNetwork,
  IconCheck,
  IconFile,
  IconChartPie,
  IconPhoto,
  IconMicrophone,
  IconFolder,
  IconListCheck,
  IconCalendar,
  IconClock,
  IconFiles,
  IconChecklist,
  IconInbox,
  IconCircleDot,
  IconCircleCheck,
  IconNotes,
  IconNote
} from '@tabler/icons-vue'
import { getSubjectIconComponent } from '@/utils/subjectIcon'
import FilePreview from '@/components/FilePreview.vue'
import type { SourceFileModel } from '@/services/domainMappers'
import KnowledgeGraph from '@/components/subject/KnowledgeGraph.vue'
import { useAssetStore } from '@/store/useAssetStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useSourceStore } from '@/store/useSourceStore'
import { getTasksForAssetGroups, isCompletedTask, isScheduledCompletionLocked, type AssetTaskGroups } from '@/services/taskViewRules'

// ---- Layout States ----
const showRegisterModal = ref(false)

// ---- Upload ----
const isDragover = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const searchQ = ref('')
const isLoadingAssets = ref(false)

// ---- Data Models ----
type TreeNodeType = 'group' | 'folder' | 'file' | 'block' | 'task'

interface TreeNode {
  id: string
  name: string
  type: TreeNodeType
  icon?: any
  lucideIcon?: any
  open?: boolean
  children?: TreeNode[]
  // For files
  sourceId?: string
  assetId?: string
  fileType?: string
  status?: string
  statusText?: string
  time?: string
  size?: string
  pages?: number
  // For blocks
  preview?: string
  tags?: string[]
  // For tasks
  due?: string
  durationMinutes?: number
  done?: boolean
  // Meta
  groupId?: string
  originalData?: any
}

const selectedSubjectId = ref('')

import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'

const subjectStore = useSubjectStore()
const blockStore = useKnowledgeStore()
const sourceStore = useSourceStore()
const assetStore = useAssetStore()
const taskStore = useTaskStore()
const route = useRoute()

const rootNodes = ref<TreeNode[]>([])
const focusUnassigned = ref(false)

function getIconForSource(source: string): any {
  const lower = source.toLowerCase()
  if (lower.includes('pdf')) return IconFileText
  if (lower.includes('ppt') || lower.includes('课件')) return IconChartPie
  if (lower.includes('手写') || lower.includes('扫描') || lower.includes('image')) return IconPhoto
  if (lower.includes('voice') || lower.includes('语音')) return IconMicrophone
  return IconFile
}

const durationOptions = Array.from({ length: 16 }, (_, index) => (index + 1) * 30)

function normalizeDuration(value: unknown): number {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return durationOptions[0]
  const rounded = Math.round(minutes / 30) * 30
  return Math.min(durationOptions[durationOptions.length - 1], Math.max(durationOptions[0], rounded))
}

function formatDuration(minutes: number): string {
  const safeMinutes = normalizeDuration(minutes)
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60
  if (hours === 0) return `${remainder}分钟`
  return `${hours}小时${remainder ? ` ${remainder}分钟` : ''}`
}

function formatDateInput(value?: string): string {
  if (!value) return ''
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (dateOnly) return dateOnly
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toDueAtValue(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T23:59:59.999Z`
  return trimmed
}

function taskTreeNode(task: any, groupId: string): TreeNode {
  return {
    id: `t-${task.id}`,
    type: 'task',
    groupId: task.subjectId || groupId,
    name: task.title || task.name || '未命名任务',
    icon: IconListCheck,
    lucideIcon: IconListCheck,
    due: formatDateInput(task.dueAt),
    durationMinutes: normalizeDuration(task.durationMinutes ?? task.duration),
    preview: task.description ?? task.desc ?? '',
    done: isCompletedTask(task),
    originalData: task,
  }
}

function taskGroupFolder(id: string, name: string, tasks: any[], groupId: string, open = false, icon = IconFolder): TreeNode {
  return {
    id,
    name,
    type: 'folder',
    icon,
    lucideIcon: icon,
    open,
    children: tasks.map((task) => taskTreeNode(task, groupId)),
  }
}

function taskGroupFolders(tasks: any[], groupId: string, openUnassigned = false): TreeNode[] {
  const groups: AssetTaskGroups = getTasksForAssetGroups(tasks)
  return [
    taskGroupFolder(`${groupId}-tasks-unassigned`, '未排期', groups.unassigned, groupId, openUnassigned, IconInbox),
    taskGroupFolder(`${groupId}-tasks-pending`, '未完成', groups.pending, groupId, false, IconCircleDot),
    taskGroupFolder(`${groupId}-tasks-completed`, '已完成', groups.completed, groupId, false, IconCircleCheck),
  ]
}

function rebuildAssetTree(): void {
  const selectedId = selected.value?.id
  const openStates = new Set<string>()
  try {
    const collectOpenStates = (nodes: TreeNode[] | undefined) => {
      if (!nodes || !Array.isArray(nodes)) return
      for (const node of nodes) {
        if (!node) continue
        if (node.open && node.id) openStates.add(node.id)
        if (node.children) collectOpenStates(node.children)
      }
    }
    collectOpenStates(rootNodes.value)
  } catch (err) {
    console.error('[Asset] Failed to collect open states:', err)
  }
  const hasExistingNodes = rootNodes.value && rootNodes.value.length > 0

  const newRoots: TreeNode[] = []
    
    // --- 1. 汇总 (All) Group ---
    const allFilesRaw = sourceStore.sources
    
    const allFilesFolder: TreeNode = { id: 'all-files', name: '全部文件', type: 'folder', icon: IconFiles, lucideIcon: IconFiles, open: false, children: [] }
    const allBlocksFolder: TreeNode = { id: 'all-blocks', name: '全部知识块', type: 'folder', icon: IconNotes, lucideIcon: IconNotes, open: false, children: [] }
    const shouldFocusUnassigned = route.query.focus === 'unassigned-tasks'
    const allTasksFolder: TreeNode = {
      id: 'all-tasks',
      name: '全部任务',
      type: 'folder',
      icon: IconChecklist,
      lucideIcon: IconChecklist,
      open: true,
      children: taskGroupFolders(taskStore.allTasks, 'all', shouldFocusUnassigned),
    }

    // Map all files
    allFilesRaw.forEach(file => {
      const srcIcon = getIconForSource(file.name)
      allFilesFolder.children!.push({
        id: `f-${file.id}`, sourceId: file.id, type: 'file', groupId: 'all', name: file.name,
        assetId: file.assetId, fileType: file.fileType, icon: srcIcon, lucideIcon: srcIcon,
        status: 'success', statusText: '正常', time: new Date(file.createdAt || Date.now()).toLocaleDateString(),
        size: (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB', pages: 1, originalData: file
      })
    })

    // Map all blocks
    blockStore.recentBlocks.forEach(b => {
      allBlocksFolder.children!.push({
        id: `b-${b.id}`, type: 'block', groupId: 'all', name: b.title || '无标题块', icon: IconNote, lucideIcon: IconNote,
        preview: b.preview, tags: b.tags || [b.subject], originalData: b
      })
    })

    newRoots.push({
      id: 'all', name: '汇总分类', type: 'group', icon: IconArchive, lucideIcon: IconArchive, open: shouldFocusUnassigned,
      children: [allFilesFolder, allBlocksFolder, allTasksFolder]
    })

    // --- 2. 学科分类 (Subjects) ---
    for (const subj of subjectStore.subjects) {
      const files = sourceStore.sources.filter((file) => file.subjectId === subj.id)
      const blocks = blockStore.recentBlocks.filter(b => b.subjectId === subj.id)
      const tasks = taskStore.allTasks.filter(t => t.subjectId === subj.id)

      const subjFilesFolder: TreeNode = { id: `sf-${subj.id}`, name: '文件', type: 'folder', icon: IconFiles, lucideIcon: IconFiles, open: false, children: [] }
      const subjBlocksFolder: TreeNode = { id: `sb-${subj.id}`, name: '知识块', type: 'folder', icon: IconNotes, lucideIcon: IconNotes, open: false, children: [] }
      const subjTasksFolder: TreeNode = { id: `st-${subj.id}`, name: '任务', type: 'folder', icon: IconChecklist, lucideIcon: IconChecklist, open: false, children: taskGroupFolders(tasks, subj.id) }

      files.forEach(file => {
        const srcIcon = getIconForSource(file.name)
        subjFilesFolder.children!.push({
          id: `f-${file.id}`, sourceId: file.id, type: 'file', groupId: subj.id, name: file.name,
          assetId: file.assetId, fileType: file.fileType, icon: srcIcon, lucideIcon: srcIcon,
          status: 'success', statusText: '正常', time: new Date(file.createdAt || Date.now()).toLocaleDateString(),
          size: (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB', pages: 1, originalData: file
        })
      })

      blocks.forEach(b => {
        subjBlocksFolder.children!.push({
          id: `b-${b.id}`, type: 'block', groupId: subj.id, name: b.title || '无标题块', icon: IconNote, lucideIcon: IconNote,
          preview: b.preview, tags: b.tags || [b.subject], originalData: b
        })
      })

      const subjIcon = getSubjectIconComponent(subj.icon)
      newRoots.push({
        id: subj.id, name: subj.name, type: 'group', icon: subjIcon, lucideIcon: subjIcon, open: false,
        children: [subjFilesFolder, subjBlocksFolder, subjTasksFolder]
      })
    }
    
  if (hasExistingNodes) {
    try {
      const restoreOpenStates = (nodes: TreeNode[] | undefined) => {
        if (!nodes || !Array.isArray(nodes)) return
        for (const node of nodes) {
          if (!node) continue
          // Only restore state for folders and groups, items don't have open state
          if (node.type === 'group' || node.type === 'folder') {
            if (node.id && openStates.has(node.id)) {
              node.open = true
            } else {
              node.open = false
            }
          }
          if (node.children) restoreOpenStates(node.children)
        }
      }
      restoreOpenStates(newRoots)
    } catch (err) {
      console.error('[Asset] Failed to restore open states:', err)
    }
  }

  rootNodes.value = newRoots
  if (selectedId) selected.value = findTreeNode(newRoots, selectedId) ?? selected.value
  focusUnassigned.value = shouldFocusUnassigned
}

const loadAssetsFromBackend = async () => {
  isLoadingAssets.value = true
  try {
    const results = await Promise.allSettled([
      subjectStore.loadSubjects(),
      sourceStore.loadSources(),
      blockStore.fetchBlocks(),
      taskStore.fetchTasks(),
    ])
    for (const result of results) {
      if (result.status === 'rejected') console.warn('[Asset] local asset hydration failed', result.reason)
    }
    rebuildAssetTree()
  } finally {
    isLoadingAssets.value = false
  }
}

watch(
  [
    () => subjectStore.subjects,
    () => sourceStore.sources,
    () => blockStore.recentBlocks,
    () => taskStore.allTasks,
  ],
  () => {
    if (!isLoadingAssets.value) rebuildAssetTree()
  },
)

// ---- Search Filter (Recursive) ----
const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
  if (!query) return nodes
  const q = query.toLowerCase()
  return nodes.map(node => {
    const match = node.name.toLowerCase().includes(q)
    if (node.children) {
      const filteredChildren = filterTree(node.children, query)
      if (match || filteredChildren.length > 0) {
        return { ...node, open: true, children: filteredChildren }
      }
    } else if (match) {
      return { ...node }
    }
    return null
  }).filter(Boolean) as TreeNode[]
}

function findTreeNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const match = findTreeNode(node.children, id)
      if (match) return match
    }
  }
  return null
}

function toggleTreeNode(node: TreeNode): void {
  const sourceNode = findTreeNode(rootNodes.value, node.id)
  if (sourceNode) sourceNode.open = !sourceNode.open
}

const filteredGroups = computed(() => filterTree(rootNodes.value, searchQ.value))

// ---- Selection & Inline Editors ----
const selected = ref<TreeNode | null>(null)

type PreviewFile = Pick<SourceFileModel, 'id' | 'name' | 'assetId' | 'fileType'>

const selectedPreviewFile = computed<PreviewFile | null>(() => {
  if (!selected.value || selected.value.type !== 'file') return null
  return {
    id: selected.value.sourceId || selected.value.id.replace(/^f-/, ''),
    name: selected.value.name,
    assetId: selected.value.assetId,
    fileType: selected.value.fileType || '',
  }
})
const selectItem = (item: TreeNode) => {
  if (item.type !== 'file' && item.type !== 'block' && item.type !== 'task') return
  selected.value = item
  showRegisterModal.value = false
}

const getSubjectName = (id?: string) => {
  if (!id || id === 'all') return '全部'
  return subjectStore.subjects.find(s => s.id === id)?.name || '未知学科'
}

const toggleTaskDone = async (task: TreeNode) => {
  if (!task.originalData?.id || isScheduledCompletionLocked(task.originalData, taskStore.currentNow)) return
  const previousDone = task.done
  const nextDone = !previousDone
  try {
    await taskStore.updateTaskStatus(task.originalData.id, nextDone ? 'completed' : 'pending')
    task.done = nextDone
    task.originalData = { ...task.originalData, status: nextDone ? 'completed' : 'pending' }
  } catch (err) {
    task.done = previousDone
    ElNotification({ title: '更新任务状态失败', message: err instanceof Error ? err.message : '请稍后重试', type: 'error' })
  }
}

const saveTaskEdit = async (task: TreeNode) => {
  if (!task.originalData?.id) return
  try {
    await taskStore.updateTaskDetails(task.originalData.id, {
      subjectId: task.groupId && task.groupId !== 'all' ? task.groupId : task.originalData.subjectId,
      title: task.name.trim() || '未命名任务',
      description: task.preview ?? '',
      dueAt: toDueAtValue(task.due),
      durationMinutes: normalizeDuration(task.durationMinutes),
    })
    await loadAssetsFromBackend()
    selected.value = findTreeNode(rootNodes.value, task.id)
    ElNotification({ title: '✅ 成功', message: '任务已更新', type: 'success' })
  } catch (err) {
    console.error('[Asset] Failed to save task:', err)
    ElNotification({ title: '保存失败', message: '任务更新失败，请稍后重试', type: 'error' })
  }
}

const saveBlockEdit = async (block: TreeNode) => {
  if (!block.originalData) return
  try {
    await blockStore.updateBlock({
      ...block.originalData,
      title: block.name,
      preview: block.preview,
      tags: block.tags
    })
    ElNotification({ title: '✅ 成功', message: '知识块已更新', type: 'success' })
  } catch (err) {
    console.error(err)
  }
}


// ---- Right Panel Context (Knowledge Graph) ----
const selectedGroupForGraph = computed(() => {
  if (!selected.value || !selected.value.groupId) return null
  if (selected.value.groupId === 'all') {
    return { id: 'all', name: '全局关联图', color: 'rgba(59,130,246,0.2)' }
  }
  return subjectStore.subjects.find(s => s.id === selected.value!.groupId) || null
})

const graphBlocks = computed(() => {
  if (!selectedGroupForGraph.value) return []
  if (selectedGroupForGraph.value.id === 'all') return blockStore.recentBlocks
  return blockStore.recentBlocks.filter(b => b.subjectId === selectedGroupForGraph.value!.id)
})

const graphSources = computed(() => {
  if (!selectedGroupForGraph.value) return []
  if (selectedGroupForGraph.value.id === 'all') return sourceStore.sources
  return sourceStore.sources.filter(source => source.subjectId === selectedGroupForGraph.value!.id)
})

const graphSubjects = computed(() => {
  if (!selectedGroupForGraph.value) return []
  if (selectedGroupForGraph.value.id === 'all') return subjectStore.subjects
  return subjectStore.subjects.filter(subject => subject.id === selectedGroupForGraph.value!.id)
})

const selectedGraphAsset = computed(() => {
  if (selected.value?.type === 'file') {
    return { type: 'file' as const, id: selected.value.sourceId || selected.value.id.replace(/^f-/, '') }
  }
  if (selected.value?.type === 'block') {
    return { type: 'block' as const, id: selected.value.id.replace(/^b-/, '') }
  }
  return null
})

const selectGraphNode = (node: { type: 'file' | 'block'; id: string; subjectId: string }) => {
  const group = rootNodes.value.find(root => root.id === selectedGroupForGraph.value?.id)
  const item = findTreeNode(group ? [group] : rootNodes.value, `${node.type === 'file' ? 'f' : 'b'}-${node.id}`)
  if (!item) return
  selectItem(item)
}


const handleDrop = (e: DragEvent) => {
  isDragover.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) {
    if (!selectedSubjectId.value) {
      selectedSubjectId.value = subjectStore.subjects[0]?.id || ''
    }
    showRegisterModal.value = true
  }
}

const openUploadForGroup = (groupId: string) => {
  selectedSubjectId.value = groupId === 'all' ? (subjectStore.subjects[0]?.id || '') : groupId
  showRegisterModal.value = true
}

const handleRegisterSubmit = ({ file, name, subjectId }: { file: File; name: string; subjectId: string }) => {
  const finalFile = new window.File([file], name, { type: file.type })
  handleFileUpload(finalFile, subjectId)
  showRegisterModal.value = false
}

const handleFileUpload = async (file: File, subjectId: string) => {
  isUploading.value = true
  uploadProgress.value = 5
  uploadStatusText.value = '校验文件...'

  try {
    const asset = await assetStore.upload(file, (percent, stage) => {
      uploadProgress.value = percent
      uploadStatusText.value = stage
    })
    await sourceStore.createFileSource(subjectId, file.name, asset.id)
    uploadProgress.value = 98
    uploadStatusText.value = '资料已关联，等待后台解析...'
    await loadAssetsFromBackend()
    uploadProgress.value = 100
    setTimeout(() => { isUploading.value = false }, 800)

  } catch (err: any) {
    console.error('上传失败:', err)
    uploadStatusText.value = '上传失败: ' + (err.message || '未知错误')
    setTimeout(() => { isUploading.value = false }, 2000)
  }
}

onMounted(() => {
  loadAssetsFromBackend()
})
onUnmounted(() => undefined)
</script>

<style scoped>
.asset-studio {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg-secondary, #EEEEEE); /* 页面大背景 / 次级中性底 */
  padding: 8px;
  gap: 8px;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #76855B;
  --color-primary-light: rgba(139, 154, 110, 0.16);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
}

html.dark .asset-studio {
  background: var(--color-bg-primary);
}

/* Common Buttons */
.btn-primary {
  background: var(--btn-primary-bg, var(--accent-gradient));
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3);
}
.btn-primary:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45);
  transform: translateY(-1px);
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; transform: none; }

.btn-secondary {
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}
.btn-secondary:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: var(--color-primary-accent, #8B9A6E);
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(139, 154, 110, 0.12);
}

.sm-btn { padding: 6px 12px; font-size: 12px; }

/* ===== LEFT PANEL ===== */
.studio-left {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}

html.dark .studio-left {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.drop-zone {
  margin: 12px 14px;
  border: 1.5px dashed var(--border-default);
  border-radius: var(--radius-lg);
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  background: var(--color-bg-tertiary, #FAF7F2);
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}
.drop-zone:hover {
  border-color: var(--color-primary-accent, #8B9A6E);
  color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.08);
}
.drop-zone.is-over {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.14);
  color: var(--color-primary-accent, #8B9A6E);
}
.drop-icon { opacity: 0.8; color: var(--color-primary-accent, #8B9A6E); }
.drop-text { font-size: 12px; font-weight: 500; text-align: center; }

.icon-btn {
  width: 26px; height: 26px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition-fast);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.icon-btn:hover { background: var(--accent-gradient); color: white; border-color: transparent; box-shadow: 0 2px 6px rgba(139, 154, 110, 0.28); }

.tree-search { padding: 10px 12px; position: relative; z-index: 10; background: transparent; }
.search-input {
  width: 100%; padding: 7px 12px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary); font-family: inherit; font-size: 12px; outline: none;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
html.dark .search-input { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); }
.search-input:focus { border-color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18); }
.search-input::placeholder { color: var(--text-muted); }

/* Inline Upload Panel */
.inline-upload-panel {
  padding: 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-item { display: flex; flex-direction: column; gap: 4px; }
.form-item label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
.zen-select {
  width: 100%; padding: 6px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: 12px;
}
.dialog-file-picker {
  border: 1.5px dashed var(--border-default); border-radius: var(--radius-md);
  padding: 12px; text-align: center; cursor: pointer; background: var(--color-bg-tertiary);
  font-size: 12px; color: var(--text-muted);
  transition: all var(--transition-fast);
  display: flex; justify-content: center; align-items: center;
}
.dialog-file-picker:hover { border-color: var(--border-accent); background: var(--border-subtle); }
.selected-file-name { font-weight: 600; color: var(--text-primary); display: flex; align-items: center; }
.upload-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px; }

/* Upload Banner */
.upload-banner {
  padding: 8px 12px;
  background: var(--border-subtle);
  border-bottom: 1px solid var(--border-default);
}
.upload-status-txt { font-size: 11px; color: var(--text-accent); font-weight: 600; display: block; margin-bottom: 4px; }
.mini-bar-bg { height: 3px; background: var(--border-default); border-radius: var(--radius-full); overflow: hidden; }
.mini-bar-fill { height: 100%; background: var(--accent-gradient); transition: width 0.3s; }

.tree-body {
  flex: 1;
  overflow-y: auto;
  margin-top: -46px;
  padding: 54px 0 8px 0;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.tree-body::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
.tree-empty {
  padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.empty-tree-icon { opacity: 0.3; }

.tree-group-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 6px; margin: 1px 8px; border-radius: 10px; cursor: pointer;
  user-select: none; transition: background var(--transition-fast);
}
.tree-group-header:hover { background: rgba(139, 154, 110, 0.08); }
.group-arrow { font-size: 10px; color: var(--text-primary); width: 10px; }
.group-icon { font-size: 13px; color: var(--text-primary); }
.group-name { font-size: 13px; font-weight: 700; color: var(--text-primary); flex: 1; }

.tree-folder-container { }
.tree-folder-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 6px 6px 20px; margin: 1px 8px; border-radius: 10px; cursor: pointer;
  user-select: none; transition: background var(--transition-fast);
}
.tree-folder-header:hover { background: rgba(139, 154, 110, 0.08); }
.tree-folder-header.is-focus { background: rgba(139, 154, 110, 0.14); color: var(--color-primary-accent, #8B9A6E); box-shadow: inset 0 0 0 1.5px var(--color-primary-accent, #8B9A6E); }
.folder-arrow { font-size: 10px; color: var(--text-muted); width: 10px; }
.folder-icon { font-size: 13px; color: var(--text-primary); }
.folder-name { font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1; }
.folder-count { font-size: 10px; background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-subtle); color: var(--text-muted); padding: 1px 5px; border-radius: var(--radius-full); }

.tree-empty-folder { padding: 4px 6px 4px 36px; font-size: 10px; color: var(--text-muted); }

.tree-items { padding: 2px 0; }
.tree-subfolder-container { }
.tree-subfolder-container > .tree-folder-header { padding-left: 36px; }
.tree-subitem { padding-left: 52px !important; }
.tree-subitem-empty { padding-left: 52px !important; }
.tree-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 6px 8px 36px; margin: 1px 8px; cursor: pointer;
  transition: all var(--transition-fast); border-radius: 10px;
}
.tree-item:hover { background: rgba(139, 154, 110, 0.08); }
.tree-item.is-active { background: rgba(139, 154, 110, 0.14); box-shadow: inset 0 0 0 1.5px var(--color-primary-accent, #8B9A6E); }
.tree-item.is-active .item-name, .tree-item.is-active .item-icon { color: var(--color-primary-accent, #8B9A6E); font-weight: 600; }
.item-icon { font-size: 14px; flex-shrink: 0; color: var(--text-secondary); }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.item-name { font-size: 11.5px; font-weight: 500; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-name.is-done { text-decoration: line-through; opacity: 0.6; }
.item-meta { font-size: 10px; color: var(--text-muted); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-right: 6px; }
.status-dot.success { background: #22c55e; }
.status-dot.processing { background: var(--text-accent); animation: blink 1.5s infinite; }
.task-done-icon { color: #22c55e; flex-shrink: 0; margin-right: 6px; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* ===== MIDDLE PANEL ===== */
.studio-middle {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  overflow: hidden;
}

html.dark .studio-middle {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
}

.middle-content-scroll {
  flex: 1;
  overflow-y: auto;
  position: relative;
  background: var(--color-bg-primary, #F7F2EB);
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.middle-content-scroll::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* Empty */
.empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 60px 40px; text-align: center;
}
.empty-icon { font-size: 48px; color: var(--text-muted); opacity: 0.4; }
.empty-title { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.empty-desc { font-size: 13px; color: var(--text-muted); max-width: 320px; line-height: 1.7; }

/* Detail */
.detail-header {
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
  min-height: 60px;
  display: flex;
  align-items: center;
}
.detail-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
}
.detail-icon {
  font-size: 26px;
  color: var(--text-primary);
  flex-shrink: 0;
}
.detail-main-info {
  flex: 1;
  min-width: 0;
}
.detail-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-path {
  font-size: 11px;
  color: var(--text-muted);
}
.status-badge {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.status-badge.success { background: rgba(34,197,94,0.12); color: #22c55e; }
.status-badge.processing { background: var(--border-subtle); color: var(--text-accent); }

/* Editor Top Bar in Detail Header */
.editor-bar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.editor-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.header-icon-badge {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(139, 154, 110, 0.12);
  color: #8B9A6E;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.header-icon-badge.task-icon-badge {
  background: rgba(139, 154, 110, 0.14);
}
.header-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
}
.crumb-parent {
  color: var(--text-muted);
}
.crumb-sep {
  color: var(--border-default);
  font-size: 10px;
}
.crumb-subject {
  color: var(--text-primary);
  font-weight: 600;
}
.crumb-type-pill {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  color: #8B9A6E;
  margin-left: 2px;
}
.header-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid var(--border-default);
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.header-status-pill:hover:not(:disabled) {
  border-color: #8B9A6E;
  color: #8B9A6E;
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.15);
}
.header-status-pill:disabled { cursor: not-allowed; opacity: 0.72; }
.header-status-pill.is-done {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  color: #16a34a;
}
.editor-bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.editor-stats-hint {
  font-size: 11.5px;
  color: var(--text-muted);
}
.header-meta-pill {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  padding: 3px 9px;
  border-radius: 9999px;
}
.header-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: 9999px;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3);
}

.full-height-viewer { height: 100%; display: flex; flex-direction: column; }

/* ===== Unified Paper Canvas View (Block & Task) ===== */
.editor-canvas-view {
  padding: 28px 36px 44px;
  max-width: 860px;
  margin: 0 auto;
  box-sizing: border-box;
}
.editor-paper-card {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 6px 24px -4px rgba(0, 0, 0, 0.04), 0 2px 8px -2px rgba(0, 0, 0, 0.02);
  padding: 32px 38px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  transition: all var(--transition-fast);
}
html.dark .editor-paper-card {
  background: #181D18;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Paper Meta Header */
.paper-meta-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.paper-meta-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.paper-subject-pill {
  font-size: 12px;
  font-weight: 600;
  color: #8B9A6E;
  background: rgba(139, 154, 110, 0.12);
  padding: 3px 10px;
  border-radius: 9999px;
  border: 1px solid rgba(139, 154, 110, 0.25);
}
.paper-tag-pill {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.03);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}
html.dark .paper-tag-pill {
  background: rgba(255, 255, 255, 0.04);
}
.paper-hint-text {
  font-size: 11.5px;
  color: var(--text-muted);
}
.paper-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid var(--border-default);
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.paper-status-pill:hover:not(:disabled) {
  border-color: #8B9A6E;
  color: #8B9A6E;
}
.paper-status-pill:disabled { cursor: not-allowed; opacity: 0.72; }
.paper-status-pill.is-done {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  color: #16a34a;
}
.paper-meta-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.scheduled-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 500;
  color: #8B9A6E;
  background: rgba(139, 154, 110, 0.08);
  padding: 2px 8px;
  border-radius: 6px;
}
.unscheduled-indicator {
  font-size: 11.5px;
  color: var(--text-muted);
}

/* Paper Title Input */
.paper-title-row {
  width: 100%;
}
.paper-title-input {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  width: 100%;
  border: none;
  background: transparent;
  padding: 4px 0 8px 0;
  outline: none;
  font-family: inherit;
  border-bottom: 2px solid transparent;
  transition: border-color var(--transition-fast);
  line-height: 1.4;
  letter-spacing: -0.3px;
}
.paper-title-input:focus {
  border-bottom-color: rgba(139, 154, 110, 0.35);
}
.paper-title-input::placeholder {
  color: var(--text-muted);
  opacity: 0.55;
  font-weight: 500;
}
.paper-title-input.is-done {
  text-decoration: line-through;
  opacity: 0.6;
}

/* Divider */
.paper-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 2px 0 4px 0;
}

/* Markdown Editor Section */
.paper-editor-section {
  display: flex;
  flex-direction: column;
}
.editor-micro-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding: 0 2px;
}
.micro-tip {
  font-size: 12px;
  color: var(--text-muted);
}
.micro-count {
  font-size: 11.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.paper-textarea {
  width: 100%;
  min-height: 380px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 12px;
  padding: 16px 18px;
  outline: none;
  resize: vertical;
  font-size: 14px;
  font-weight: 400;
  font-family: inherit;
  color: var(--text-primary);
  line-height: 1.8;
  box-sizing: border-box;
  transition: all var(--transition-fast);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.02);
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.paper-textarea::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
.paper-textarea:focus {
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.15), inset 0 1px 3px rgba(0, 0, 0, 0.02);
}
.paper-textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}
html.dark .paper-textarea {
  background: #131713;
  border-color: rgba(255, 255, 255, 0.08);
}

/* Task Property Panel */
.paper-property-panel {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 14px 18px;
  margin: 2px 0;
}
html.dark .paper-property-panel {
  background: #131713;
  border-color: rgba(255, 255, 255, 0.08);
}
.property-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.property-item {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}
.property-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-weight: 500;
  width: 100px;
  flex-shrink: 0;
}
.property-control {
  flex: 1;
  display: flex;
  align-items: center;
}
.property-value-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Task Notes Section */
.paper-notes-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.section-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.task-notes-textarea {
  min-height: 180px;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.task-notes-textarea::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* Zen Date Picker overriding Element Plus */
:deep(.zen-date-picker) {
  box-shadow: none !important;
  border: none !important;
  --el-input-border-color: transparent;
  --el-input-hover-border-color: transparent;
  --el-input-focus-border-color: transparent;
}
:deep(.zen-date-picker .el-input__wrapper) {
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: 9999px !important;
  transition: all var(--transition-fast) !important;
  padding-left: 12px;
}
:deep(.zen-date-picker:hover .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper:hover) {
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  border-color: rgba(139, 154, 110, 0.4) !important;
}
:deep(.zen-date-picker.is-active .el-input__wrapper),
:deep(.zen-date-picker.is-focus .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper.is-focus) {
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  border-color: #8B9A6E !important;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18) !important;
}

/* Zen Date Popper overriding Element Plus */
:global(.zen-date-popper.el-popper) {
  border: 1px solid #8B9A6E !important;
  border-radius: 12px !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  box-shadow: 0 8px 24px rgba(139, 154, 110, 0.18) !important;
}
:global(.zen-date-popper .el-picker-panel) {
  border: none !important;
  border-radius: 12px !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
}
:global(.zen-date-popper .el-popper__arrow::before) {
  border-color: #8B9A6E !important;
}

.property-value {
  flex: 1;
  display: flex;
  align-items: center;
}
.duration-select,
.subject-select {
  min-width: 150px;
  padding: 8px 32px 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  transition: all var(--transition-fast);
}
.duration-select:hover,
.subject-select:hover {
  border-color: rgba(139, 154, 110, 0.4);
}
.duration-select:focus,
.subject-select:focus {
  outline: none;
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
}

/* Zen Select overriding Element Plus */
:deep(.zen-select) {
  box-shadow: none !important;
  border: none !important;
  border-radius: 9999px !important;
}
:deep(.zen-select .el-select__wrapper) {
  background-color: #FAF7F2 !important;
  box-shadow: 0 0 0 1px var(--border-default, rgba(0, 0, 0, 0.10)) inset, 0 2px 6px -1px rgba(0, 0, 0, 0.04) !important;
  border: none !important;
  border-radius: 9999px !important;
  padding: 3px 14px !important;
  min-height: 32px !important;
  height: 32px !important;
  transition: all var(--transition-fast) !important;
}
:deep(.zen-select:hover .el-select__wrapper),
:deep(.zen-select .el-select__wrapper:hover) {
  background-color: #FAF7F2 !important;
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.45) inset, 0 3px 8px -1px rgba(139, 154, 110, 0.1) !important;
}
:deep(.zen-select.is-focused .el-select__wrapper),
:deep(.zen-select .el-select__wrapper.is-focused) {
  background-color: #FAF7F2 !important;
  box-shadow: 0 0 0 1px #8B9A6E inset, 0 0 0 3px rgba(139, 154, 110, 0.18) !important;
}
:deep(.zen-select .el-select__placeholder),
:deep(.zen-select .el-select__selected-item) {
  font-size: 13px !important;
  font-weight: 500 !important;
  color: #1C1C1A !important;
}
:deep(.zen-select .el-select__caret) {
  color: #7A7A75 !important;
}

/* Zen Select Popper (Dropdown Panel) - Fully Rounded Zen Design */
:global(.zen-select-popper),
:global(.zen-select-popper.el-popper) {
  border: 1px solid rgba(139, 154, 110, 0.35) !important;
  border-radius: 16px !important;
  background-color: #FAF7F2 !important;
  background: #FAF7F2 !important;
  box-shadow: 0 12px 32px rgba(139, 154, 110, 0.15), 0 4px 12px rgba(0, 0, 0, 0.05) !important;
  padding: 6px !important;
  overflow: hidden !important;
}
:global(.zen-select-popper .el-select-dropdown),
:global(.zen-select-popper .el-scrollbar),
:global(.zen-select-popper .el-select-dropdown__wrap) {
  background: transparent !important;
  border: none !important;
  border-radius: 14px !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
:global(.zen-select-popper .el-scrollbar__bar) {
  display: none !important;
  opacity: 0 !important;
  width: 0 !important;
  height: 0 !important;
  pointer-events: none !important;
}
:global(.zen-select-popper .el-scrollbar__thumb) {
  display: none !important;
}
:global(.zen-select-popper *::-webkit-scrollbar) {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
:global(.zen-select-popper .el-select-dropdown__list) {
  padding: 2px !important;
}
:global(.zen-select-popper .el-select-dropdown__item) {
  border-radius: 10px !important;
  margin: 3px 0 !important;
  font-size: 13px !important;
  color: #1C1C1A !important;
  transition: all var(--transition-fast) !important;
  padding: 7px 12px !important;
  line-height: 1.4 !important;
  height: auto !important;
}
:global(.zen-select-popper .el-select-dropdown__item.is-hovering),
:global(.zen-select-popper .el-select-dropdown__item:hover) {
  background: rgba(139, 154, 110, 0.12) !important;
  color: #8B9A6E !important;
}
:global(.zen-select-popper .el-select-dropdown__item.is-selected),
:global(.zen-select-popper .el-select-dropdown__item.selected) {
  background: rgba(139, 154, 110, 0.18) !important;
  color: #8B9A6E !important;
  font-weight: 700 !important;
}
:global(.zen-select-popper .el-popper__arrow::before) {
  border-color: rgba(139, 154, 110, 0.35) !important;
  background-color: #FAF7F2 !important;
  background: #FAF7F2 !important;
}

/* Dark mode for zen-select (using :global to preserve html.dark ancestor selector) */
:global(html.dark .zen-select .el-select__wrapper) {
  background-color: #242622 !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset !important;
}
:global(html.dark .zen-select:hover .el-select__wrapper),
:global(html.dark .zen-select .el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(154, 176, 143, 0.4) inset !important;
}
:global(html.dark .zen-select.is-focused .el-select__wrapper),
:global(html.dark .zen-select .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px #9AB08F inset, 0 0 0 3px rgba(154, 176, 143, 0.2) !important;
}
:global(html.dark .zen-select .el-select__placeholder),
:global(html.dark .zen-select .el-select__selected-item) {
  color: #e6dfd8 !important;
}
:global(html.dark .zen-select-popper),
:global(html.dark .zen-select-popper.el-popper) {
  background-color: #242622 !important;
  background: #242622 !important;
  border-color: rgba(154, 176, 143, 0.3) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45) !important;
}
:global(html.dark .zen-select-popper .el-popper__arrow::before) {
  background-color: #242622 !important;
  background: #242622 !important;
  border-color: rgba(154, 176, 143, 0.3) !important;
}
:global(html.dark .zen-select-popper .el-select-dropdown__item) {
  color: #e6dfd8 !important;
}
:global(html.dark .zen-select-popper .el-select-dropdown__item.is-hovering),
:global(html.dark .zen-select-popper .el-select-dropdown__item:hover) {
  background: rgba(154, 176, 143, 0.16) !important;
  color: #9AB08F !important;
}
:global(html.dark .zen-select-popper .el-select-dropdown__item.is-selected),
:global(html.dark .zen-select-popper .el-select-dropdown__item.selected) {
  background: rgba(154, 176, 143, 0.24) !important;
  color: #9AB08F !important;
}
.prop-input {
  font-size: 13px;
  background: transparent;
  border: 1px solid transparent;
  padding: 4px 8px;
  margin-left: -8px;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  outline: none;
  width: 200px;
  transition: all var(--transition-fast);
}
.prop-input:hover {
  background: var(--color-bg-secondary);
}
.prop-input:focus {
  background: var(--color-bg-primary);
  border-color: var(--color-primary-accent);
  box-shadow: 0 0 0 2px var(--color-primary-glow);
}
.prop-badge {
  background: var(--color-bg-secondary);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.prop-empty {
  color: var(--text-muted);
  font-size: 13px;
  padding: 4px 8px;
  margin-left: -8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}
.prop-empty:hover {
  background: var(--color-bg-secondary);
}
.task-empty-content {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-lg);
  min-height: 200px;
}
.empty-state-mini {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Custom View Toggle (Pill Segmented Control) */
.view-toggle {
  display: flex;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  padding: 4px;
  gap: 4px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}
.toggle-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: all var(--transition-fast);
  line-height: 1.2;
}
.toggle-btn:hover {
  color: var(--text-primary);
  background: rgba(139, 154, 110, 0.12);
}
.toggle-btn.is-active {
  background: var(--accent-gradient, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.28);
}
.editor-textarea {
  width: 100%; height: 100%; min-height: 350px;
  border: none; background: transparent; padding: 0; outline: none;
  resize: none; font-size: 14px; font-weight: 500; font-family: inherit;
  color: var(--text-primary); line-height: 1.8;
}
.editor-textarea::placeholder { color: var(--text-muted); }

.zen-input {
  width: 100%; padding: 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: 13px; font-family: inherit;
  transition: all var(--transition-fast);
}
.zen-input:focus { outline: none; border-color: var(--text-accent); }
.zen-input.large { font-size: 18px; font-weight: 700; padding: 12px; }
.zen-input.sm { padding: 6px; font-size: 11px; width: 200px; }
.block-tag {
  font-size: 11px; color: var(--text-accent); background: var(--border-subtle);
  padding: 4px 8px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 4px;
}
.tag-del { background: none; border: none; color: inherit; font-size: 10px; cursor: pointer; padding: 0; }
.tag-del:hover { color: #ef4444; }

/* ===== RIGHT CONTEXT PANEL ===== */
.studio-right-context {
  width: 620px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  overflow: hidden;
}
html.dark .studio-right-context {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
}

.graph-empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 40px; text-align: center; color: var(--text-muted);
}
.empty-graph-icon { opacity: 0.3; }
.empty-graph-desc { font-size: 12px; }

.context-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
}
.ctx-tab {
  flex: 1;
  padding: 12px 0;
  background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; transition: all var(--transition-fast);
}
.ctx-tab:hover { color: var(--text-primary); }
.ctx-tab.active { color: var(--text-primary); border-bottom-color: var(--color-primary-accent, #8B9A6E); }

.context-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
  background: var(--color-bg-primary, #F7F2EB);
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.context-body::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* Blocks Tab */
.ctx-blocks { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.blocks-toolbar { display: flex; justify-content: flex-end; }
.new-block-btn { width: 100%; }

.inline-block-editor {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}
.inline-input {
  width: 100%; padding: 8px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: 12px; font-family: inherit;
  resize: vertical;
}
.inline-input:focus { outline: none; border-color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18); }
.title-input { font-weight: 600; }
.tag-input { font-size: 11px; }
.inline-actions { display: flex; justify-content: flex-end; gap: 6px; }

.blocks-list { display: flex; flex-direction: column; gap: 10px; }
.block-row {
  display: flex; gap: 10px; align-items: flex-start;
  background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md); padding: 12px;
  transition: all var(--transition-normal);
  position: relative;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}
.block-row:hover {
  border-color: var(--color-primary-accent, #8B9A6E);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -2px rgba(139, 154, 110, 0.12);
}
.block-num {
  width: 20px; height: 20px; background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
}
.block-body { flex: 1; min-width: 0; }
.block-heading { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.block-preview { font-size: 11px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 8px; }
.block-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.block-tag {
  font-size: 9px; color: var(--color-primary-accent, #8B9A6E); background: rgba(139, 154, 110, 0.12);
  padding: 2px 6px; border-radius: var(--radius-sm);
}
.block-actions {
  display: flex; flex-direction: column; gap: 6px;
  opacity: 0; transition: opacity var(--transition-fast);
}
.block-row:hover .block-actions { opacity: 1; }
.action-btn {
  background: none; border: none; padding: 4px; cursor: pointer;
  color: var(--text-muted); border-radius: 4px;
}
.action-btn:hover { background: var(--color-bg-tertiary); color: var(--text-primary); }
.action-btn.danger:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

/* Tasks Tab */
.ctx-tasks { padding: 16px; }
.tasks-list { display: flex; flex-direction: column; gap: 8px; }
.task-row {
  display: flex; align-items: center; gap: 10px;
  background: var(--color-bg-secondary); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md); padding: 10px 12px;
}
.task-check {
  width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--border-strong);
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  color: transparent; transition: all var(--transition-fast);
}
.task-check.done { background: var(--accent-gradient); border-color: transparent; color: white; }
.task-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.task-title { font-size: 12px; font-weight: 500; color: var(--text-primary); }
.task-title.done { text-decoration: line-through; color: var(--text-muted); }
.task-due { font-size: 10px; color: var(--text-muted); }




.ctx-empty { padding: 32px 0; text-align: center; font-size: 12px; color: var(--text-muted); }

/* Graph Tab */
.ctx-graph {
  height: 100%;
  width: 100%;
  min-height: 480px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex: 1;
}
.ctx-graph :deep(.knowledge-graph-wrapper) {
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
}

.tree-loading {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0,0,0,0.1);
  border-radius: 50%;
  border-top-color: var(--text-accent);
  animation: spin 1s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.header-action-btn {
  opacity: 0;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  margin-left: auto;
}
.tree-group-header:hover .header-action-btn { opacity: 1; }
.header-action-btn:hover { background: var(--accent-gradient); color: white; border-color: transparent; }
/* Drag and Drop Zone (Copied from SubjectWorkspace) */
.drag-drop-zone {
  border: 2px dashed var(--border-default);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary, #FAF7F2);
  margin-bottom: 8px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}
.drag-drop-zone:hover {
  border-color: rgba(139, 154, 110, 0.4);
  background: rgba(139, 154, 110, 0.04);
}
.drag-drop-zone.is-active {
  border-color: #8B9A6E;
  background: rgba(139, 154, 110, 0.08);
}
.drag-text { font-size: 13px; color: var(--text-muted); font-weight: 500; }
html.dark .drag-drop-zone { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
html.dark .drag-drop-zone:hover { border-color: rgba(255,255,255,0.2); background: rgba(0,0,0,0.4); }
html.dark .drag-drop-zone.is-active { border-color: #9AB08F; background: rgba(154, 176, 143, 0.1); }

/* Home Modal Styles for Register Modal (Copied from SubjectWorkspace) */
.modal-container {
  width: 90%; max-width: 520px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; overflow: hidden;
  animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
html.dark .modal-container { background: #181D18; border-color: rgba(163, 177, 155, 0.25); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
@keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-container .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); }
.modal-container .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }
.modal-container .modal-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto; }
.form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.styled-input, .styled-textarea {
  width: 100%; padding: 12px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: 12px; font-size: 13.5px; color: var(--text-primary);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.styled-input:focus, .styled-textarea:focus {
  border-color: #8B9A6E;
  background: var(--color-bg-tertiary, #FAF7F2);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
}
html.dark .styled-input:focus, html.dark .styled-textarea:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.2); }
.styled-textarea { resize: vertical; line-height: 1.6; min-height: 100px; }
.modal-container .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px 22px; border-top: 1px solid var(--border-subtle); background: transparent; }
.btn-secondary {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.btn-secondary:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: #8B9A6E;
  color: var(--text-primary);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}
.btn-primary {
  background: var(--btn-primary-bg, var(--accent-gradient, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)));
  border: none; color: #FFFFFF;
  padding: 8px 26px; border-radius: 9999px; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3);
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45);
}
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }
html.dark .btn-primary { background: #9AB08F; color: #1a1a1a; }
html.dark .btn-primary:hover { background: #b0c2a7; box-shadow: 0 4px 12px rgba(154, 176, 143, 0.2); }

/* Subject Capsule Grid */
.subject-capsule-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.subject-capsule-item {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1.5px solid var(--border-default);
  border-radius: 9999px; font-size: 13px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 5px -1px rgba(0, 0, 0, 0.03);
}
.subject-capsule-item:hover {
  transform: translateY(-1px);
  border-color: rgba(139, 154, 110, 0.35);
  box-shadow: 0 3px 8px rgba(139, 154, 110, 0.12);
}
.subject-capsule-item.is-active {
  background: rgba(139, 154, 110, 0.12) !important;
  border-color: #8B9A6E !important;
  color: #8B9A6E !important;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.22);
}
html.dark .subject-capsule-item.is-active { background: rgba(154, 176, 143, 0.15) !important; border-color: #9AB08F !important; color: #9AB08F !important; }
.subj-capsule-name { font-size: 13px; }
</style>
