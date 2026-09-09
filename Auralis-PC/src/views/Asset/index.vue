<template>
  <div class="asset-studio">
    <!-- LEFT: Asset Tree (Nested Folder Explorer + Upload Inline) -->
    <aside class="studio-left">
      <div class="panel-header">
        <span class="panel-title">资产库</span>
        <button class="icon-btn" title="导入文件" @click="showRegisterModal = true">
          <Plus :size="16" />
        </button>
      </div>

      <!-- Search -->
      <div class="tree-search">
        <input v-model="searchQ" class="search-input" placeholder="搜索资产/知识/任务..." />
      </div>

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-progress-wrapper" style="margin: 0 20px 16px; padding: 12px; background: var(--bg-modifier-hover); border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
          <span aria-live="polite" style="font-weight: 500;">{{ uploadStatusText || '正在上传文件' }}</span>
          <span style="font-weight: 600; color: var(--color-zen-sage);">{{ uploadProgress }}%</span>
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
          <Archive :size="24" class="empty-tree-icon" />
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
                <Plus :size="12" />
              </button>
            </div>
            
            <div v-if="group.open" class="tree-children">
              <!-- Level 2: Folders (e.g. 全部文件, 任务) -->
              <div v-for="folder in group.children" :key="folder.id" class="tree-folder-container">
                <div class="tree-folder-header" :class="{ 'is-focus': focusUnassigned && folder.id === 'all-tasks-unassigned' }" @click="toggleTreeNode(folder)">
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
                        :class="{ 'is-focus': focusUnassigned && item.id.endsWith('-tasks-unassigned') }"
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
                          <span v-if="subitem.type === 'task' && subitem.done" class="task-done-icon"><Check :size="12" /></span>
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
                      <span v-if="item.type === 'task' && item.done" class="task-done-icon"><Check :size="12" /></span>
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
        <UploadCloud :size="16" class="drop-icon" />
        <span class="drop-text">拖拽文件或点击此处上传</span>
      </div>
    </aside>

    <!-- COLUMN 2: MIDDLE Dynamic Viewer (File / Block / Task) -->
    <main class="studio-middle">
      <div v-if="!selected" class="empty-state">
        <LayoutDashboard :size="48" class="empty-icon" />
        <h2 class="empty-title">资产阅览区</h2>
        <p class="empty-desc">在左侧树状目录中选择文件、知识块或任务以开始沉浸式工作</p>
      </div>
      <template v-else>
        <!-- Dynamic Header based on Type -->
        <div class="detail-header">
          <div class="detail-title-row">
            <component :is="selected.lucideIcon" :size="28" class="detail-icon" />
            <div>
              <h1 class="detail-name" :class="{'is-done': selected.type === 'task' && selected.done}">{{ selected.name }}</h1>
              <p v-if="selected.type === 'file'" class="detail-path">上传于 {{ selected.time }} · {{ selected.pages }} 页 · {{ selected.size }}</p>
              <p v-else-if="selected.type === 'block'" class="detail-path">知识块 · 所属学科: {{ getSubjectName(selected.groupId) }}</p>
              <p v-else-if="selected.type === 'task'" class="detail-path">生成任务 · 预计用时: {{ formatDuration(selected.durationMinutes || 30) }} · 截止: {{ selected.due || '未设置' }}</p>
            </div>
            <span v-if="selected.type === 'file'" class="status-badge" :class="selected.status">{{ selected.statusText }}</span>
            <button v-if="selected.type === 'task'" class="btn-primary sm-btn" style="margin-left:auto;" @click="saveTaskEdit(selected)">
              保存修改
            </button>
            <button v-if="selected.type === 'task'" class="btn-primary sm-btn" @click="toggleTaskDone(selected)">
              {{ selected.done ? '标记为未完成' : '标记为完成' }}
            </button>
            <button v-if="selected.type === 'block'" class="btn-primary sm-btn" style="margin-left:auto;" @click="saveBlockEdit(selected)">
              保存修改
            </button>
          </div>
        </div>

        <div class="middle-content-scroll">
          <!-- View: FILE -->
          <div v-if="selected.type === 'file'" class="full-height-viewer">
            <FilePreview v-if="selectedPreviewFile" :file="selectedPreviewFile" :bare="true" />
          </div>

          <!-- View: BLOCK -->
          <div v-else-if="selected.type === 'block'" class="block-editor-view">
            <div class="editor-header">
              <div class="editor-title-row">
                <div class="editor-icon-wrapper"><Blocks class="editor-icon" /></div>
                <div class="editor-meta">
                  <span class="editor-type">知识块编辑</span>
                  <span class="editor-subject">{{ getSubjectName(selected.groupId) }}</span>
                </div>
              </div>
              <button class="editor-save-btn" @click="saveBlockEdit(selected)">
                <Check class="btn-icon" />保存修改
              </button>
            </div>
            
            <div class="block-editor-container">
              <input v-model="selected.name" class="editor-title-input" placeholder="输入知识块标题..." />
              
              <div class="editor-content-wrapper">
                <textarea v-model="selected.preview" class="editor-textarea" placeholder="在此编写知识块的核心内容（支持 Markdown）..."></textarea>
              </div>
            </div>
          </div>

          <!-- View: TASK -->
          <div v-else-if="selected.type === 'task'" class="task-editor-view">
             <div class="block-editor-container">
              <!-- Task Title -->
              <input v-model="selected.name" class="editor-title-input" placeholder="输入任务描述..." />
              
              <!-- Notion-like Property Grid -->
              <div class="property-grid">
                <div class="property-row">
                  <div class="property-label">
                    <Calendar :size="14" />
                    <span>截止日期</span>
                  </div>
                  <div class="property-value">
                    <el-date-picker 
                      v-model="selected.due" 
                      type="date" 
                      placeholder="选择截止日期"
                      format="YYYY-MM-DD"
                      value-format="YYYY-MM-DD"
                      class="zen-date-picker"
                      popper-class="zen-date-popper"
                      style="width: 220px;"
                    />
                  </div>
                </div>

                <div class="property-row">
                  <div class="property-label">
                    <Clock :size="14" />
                    <span>预计用时</span>
                  </div>
                  <div class="property-value">
                    <select v-model.number="selected.durationMinutes" class="duration-select" aria-label="预计用时">
                      <option v-for="minutes in durationOptions" :key="minutes" :value="minutes">
                        {{ formatDuration(minutes) }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
              
              <!-- Task Notes -->
              <div class="editor-content-wrapper">
                <textarea v-model="selected.preview" class="editor-textarea" placeholder="在此编写任务备注或细节说明..."></textarea>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- COLUMN 3: RIGHT Context (Only Graph) -->
    <aside class="studio-right-context" style="width: 450px;">
      <div v-if="!selected" class="graph-empty-state">
        <Network :size="40" class="empty-graph-icon" />
        <p class="empty-graph-desc">选择项目以加载上下文星空图</p>
      </div>
      <template v-else>
        <div class="panel-header" style="background: var(--color-bg-secondary);">
          <span class="panel-title">关系星图</span>
        </div>
        <div class="context-body">
          <div class="ctx-graph">
             <KnowledgeGraph
              v-if="selectedGroupForGraph"
              :subjectId="selectedGroupForGraph.id"
              :blocks="graphBlocks"
              :subjectName="selectedGroupForGraph.name"
            />
          </div>
        </div>
      </template>
    </aside>

    <!-- Register File Modal -->
    <div class="modal-overlay" v-if="showRegisterModal" @click.self="showRegisterModal = false" style="display: flex; align-items: center; justify-content: center; z-index: 1000; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);">
      <div class="modal-container register-modal">
        <div class="modal-header">
          <h3>上传参考文件</h3>
          <button class="close-btn" @click="showRegisterModal = false">×</button>
        </div>
        <div 
          class="modal-body" 
          @dragover.prevent="isDragover = true"
          @dragleave.prevent="isDragover = false"
          @drop.prevent="handleDrop"
        >
          <div class="drag-drop-zone" :class="{ 'is-active': isDragover }" @click="triggerFileSelect">
            <UploadCloud :size="24" style="margin-bottom: 8px; color: var(--text-muted);" />
            <div class="drag-text">{{ selectedFileToUpload ? selectedFileToUpload.name : '拖拽文件或点击此处上传' }}</div>
          </div>
          <input type="file" ref="dialogFileInput" style="display: none" @change="handleDialogFileChange" />
          
          <div class="form-group" style="margin-top: 12px;">
            <label>文件名称<span class="required" style="color: #ef4444; margin-left: 4px;">*</span></label>
            <input type="text" v-model="inputFileName" class="styled-input" placeholder="输入文件的显示名称" />
          </div>
          
          <div class="form-group"><label>归档到<span class="required" style="color: #ef4444; margin-left: 4px;">*</span></label>
            <div class="subject-capsule-grid" style="margin-top: 4px; max-height: 120px; overflow-y: auto; padding: 2px;">
              <div
                v-for="subj in subjectStore.subjects"
                :key="subj.id"
                class="subject-capsule-item"
                :class="{ 'is-active': selectedSubjectId === subj.id }"
                @click="selectedSubjectId = subj.id"
              >
                <span class="subj-capsule-name">{{ subj.name }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="justify-content: flex-end">
          <button class="btn-primary" :disabled="!selectedSubjectId || !selectedFileToUpload" @click="confirmUpload">确定登记</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'

import { Plus, Archive, FileText, UploadCloud, LayoutDashboard, Network, Check, BookOpen, Blocks, File, PieChart, ImageIcon, Mic, Folder, ListTodo, Calendar, Clock } from 'lucide-vue-next'
import FilePreview from '@/components/FilePreview.vue'
import type { SourceFileModel } from '@/services/domainMappers'
import KnowledgeGraph from '@/components/subject/KnowledgeGraph.vue'
import { useAssetStore } from '@/store/useAssetStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useSourceStore } from '@/store/useSourceStore'
import { getTasksForAssetGroups, type AssetTaskGroups } from '@/services/taskViewRules'

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
const selectedFileToUpload = ref<File | null>(null)
const inputFileName = ref('')
const dialogFileInput = ref<HTMLInputElement | null>(null)

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
  if (lower.includes('pdf')) return FileText
  if (lower.includes('ppt') || lower.includes('课件')) return PieChart
  if (lower.includes('手写') || lower.includes('扫描') || lower.includes('image')) return ImageIcon
  if (lower.includes('voice') || lower.includes('语音')) return Mic
  return File
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
    groupId,
    name: task.title || task.name || '未命名任务',
    lucideIcon: ListTodo,
    due: formatDateInput(task.dueAt),
    durationMinutes: normalizeDuration(task.durationMinutes ?? task.duration),
    preview: task.description ?? task.desc ?? '',
    done: task.status === 'completed',
    originalData: task,
  }
}

function taskGroupFolder(id: string, name: string, tasks: any[], groupId: string, open = false): TreeNode {
  return {
    id,
    name,
    type: 'folder',
    lucideIcon: Folder,
    open,
    children: tasks.map((task) => taskTreeNode(task, groupId)),
  }
}

function taskGroupFolders(tasks: any[], groupId: string, openUnassigned = false): TreeNode[] {
  const groups: AssetTaskGroups = getTasksForAssetGroups(tasks)
  return [
    taskGroupFolder(`${groupId}-tasks-unassigned`, '未排期', groups.unassigned, groupId, openUnassigned),
    taskGroupFolder(`${groupId}-tasks-pending`, '未完成', groups.pending, groupId),
    taskGroupFolder(`${groupId}-tasks-completed`, '已完成', groups.completed, groupId),
  ]
}

function rebuildAssetTree(): void {
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
    
    const allFilesFolder: TreeNode = { id: 'all-files', name: '全部文件', type: 'folder', lucideIcon: Folder, open: false, children: [] }
    const allBlocksFolder: TreeNode = { id: 'all-blocks', name: '全部知识块', type: 'folder', lucideIcon: Folder, open: false, children: [] }
    const shouldFocusUnassigned = route.query.focus === 'unassigned-tasks'
    const allTasksFolder: TreeNode = {
      id: 'all-tasks',
      name: '全部任务',
      type: 'folder',
      lucideIcon: Folder,
      open: true,
      children: taskGroupFolders(taskStore.allTasks, 'all', shouldFocusUnassigned),
    }

    // Map all files
    allFilesRaw.forEach(file => {
      allFilesFolder.children!.push({
        id: `f-${file.id}`, sourceId: file.id, type: 'file', groupId: 'all', name: file.name,
        assetId: file.assetId, fileType: file.fileType, lucideIcon: getIconForSource(file.name),
        status: 'success', statusText: '正常', time: new Date(file.createdAt || Date.now()).toLocaleDateString(),
        size: (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB', pages: 1, originalData: file
      })
    })

    // Map all blocks
    blockStore.recentBlocks.forEach(b => {
      allBlocksFolder.children!.push({
        id: `b-${b.id}`, type: 'block', groupId: 'all', name: b.title || '无标题块', lucideIcon: Blocks,
        preview: b.preview, tags: b.tags || [b.subject], originalData: b
      })
    })

    newRoots.push({
      id: 'all', name: '汇总分类', type: 'group', lucideIcon: Archive, open: shouldFocusUnassigned,
      children: [allFilesFolder, allBlocksFolder, allTasksFolder]
    })

    // --- 2. 学科分类 (Subjects) ---
    for (const subj of subjectStore.subjects) {
      const files = sourceStore.sources.filter((file) => file.subjectId === subj.id)
      const blocks = blockStore.recentBlocks.filter(b => b.subjectId === subj.id)
      const tasks = taskStore.allTasks.filter(t => t.subjectId === subj.id)

      const subjFilesFolder: TreeNode = { id: `sf-${subj.id}`, name: '文件', type: 'folder', lucideIcon: Folder, open: false, children: [] }
      const subjBlocksFolder: TreeNode = { id: `sb-${subj.id}`, name: '知识块', type: 'folder', lucideIcon: Folder, open: false, children: [] }
      const subjTasksFolder: TreeNode = { id: `st-${subj.id}`, name: '任务', type: 'folder', lucideIcon: Folder, open: false, children: taskGroupFolders(tasks, subj.id) }

      files.forEach(file => {
        subjFilesFolder.children!.push({
          id: `f-${file.id}`, sourceId: file.id, type: 'file', groupId: subj.id, name: file.name,
          assetId: file.assetId, fileType: file.fileType, lucideIcon: getIconForSource(file.name),
          status: 'success', statusText: '正常', time: new Date(file.createdAt || Date.now()).toLocaleDateString(),
          size: (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB', pages: 1, originalData: file
        })
      })

      blocks.forEach(b => {
        subjBlocksFolder.children!.push({
          id: `b-${b.id}`, type: 'block', groupId: subj.id, name: b.title || '无标题块', lucideIcon: Blocks,
          preview: b.preview, tags: b.tags || [b.subject], originalData: b
        })
      })

      newRoots.push({
        id: subj.id, name: subj.name, type: 'group', lucideIcon: BookOpen, open: false,
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
  task.done = !task.done
  if (task.originalData) {
    const newStatus = task.done ? 'completed' : 'pending'
    await taskStore.updateTaskStatus(task.originalData.id, newStatus)
  }
}

const saveTaskEdit = async (task: TreeNode) => {
  if (!task.originalData?.id) return
  try {
    await taskStore.updateTaskDetails(task.originalData.id, {
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


const openUploadForGroup = (groupId: string) => {
  selectedSubjectId.value = groupId === 'all' ? (subjectStore.subjects[0]?.id || '') : groupId
  selectedFileToUpload.value = null
  inputFileName.value = ''
  showRegisterModal.value = true
}

const triggerFileSelect = () => {
  dialogFileInput.value?.click()
}
const handleDialogFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    selectedFileToUpload.value = file
    inputFileName.value = file.name
  }
}
const confirmUpload = () => {
  if (selectedFileToUpload.value && selectedSubjectId.value) {
    const finalName = inputFileName.value.trim() || selectedFileToUpload.value.name
    const finalFile = new window.File([selectedFileToUpload.value], finalName, { type: selectedFileToUpload.value.type })
    handleFileUpload(finalFile, selectedSubjectId.value)
    showRegisterModal.value = false
    inputFileName.value = ''
  }
}
const handleDrop = (e: DragEvent) => {
  isDragover.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) {
    selectedFileToUpload.value = f
    inputFileName.value = f.name
    if (!selectedSubjectId.value) {
      selectedSubjectId.value = subjectStore.subjects[0]?.id || ''
    }
  }
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
  background: var(--color-zen-ivory); /* Zen Ivory base */
  padding: 8px;
  gap: 8px;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #7D9372;
  --color-primary-accent-hover: #6c8062;
  --color-primary-light: rgba(163, 177, 155, 0.12);
  --color-primary-glow: rgba(163, 177, 155, 0.25);
  --accent-gradient: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
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
}
.btn-primary:hover:not(:disabled) { box-shadow: var(--accent-glow); transform: scale(1.02); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.btn-secondary:hover { background: var(--border-subtle); }

.sm-btn { padding: 6px 12px; font-size: 12px; }

/* ===== LEFT PANEL ===== */
.studio-left {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .studio-left {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.drop-zone {
  margin: 16px;
  border: 2px dashed var(--border-default);
  border-radius: var(--radius-md);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  background: var(--color-bg-tertiary);
  cursor: pointer;
}
.drop-zone:hover {
  border-color: var(--color-primary-accent);
  color: var(--color-primary-accent);
}
.drop-zone.is-over {
  border-color: var(--color-primary-accent);
  background: var(--color-primary-light);
  color: var(--color-primary-accent);
}
.drop-icon { opacity: 0.6; }
.drop-text { font-size: 13px; font-weight: 500; text-align: center; }

.icon-btn {
  width: 26px; height: 26px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition-fast);
}
.icon-btn:hover { background: var(--accent-gradient); color: white; border-color: transparent; }

.tree-search { padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
.search-input {
  width: 100%; padding: 6px 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary); font-family: inherit; font-size: 12px; outline: none;
  transition: border-color var(--transition-fast);
}
.search-input:focus { border-color: var(--border-accent); }
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

/* Tree */
.tree-body { flex: 1; overflow-y: auto; padding: 8px 0; }
.tree-empty {
  padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.empty-tree-icon { opacity: 0.3; }

.tree-group-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; cursor: pointer;
  user-select: none; transition: background var(--transition-fast);
}
.tree-group-header:hover { background: rgba(255,255,255,0.03); }
.group-arrow { font-size: 10px; color: var(--text-muted); width: 10px; }
.group-icon { font-size: 13px; }
.group-name { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }

.tree-folder-container { padding-left: 6px; }
.tree-folder-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px 6px 20px; cursor: pointer;
  user-select: none; transition: background var(--transition-fast);
}
.tree-folder-header:hover { background: rgba(255,255,255,0.03); }
.tree-folder-header.is-focus { background: rgba(125, 147, 114, 0.16); color: var(--color-primary-accent); }
.folder-arrow { font-size: 10px; color: var(--text-muted); width: 10px; }
.folder-icon { font-size: 13px; color: var(--text-secondary); }
.folder-name { font-size: 12px; font-weight: 500; color: var(--text-secondary); flex: 1; }
.folder-count { font-size: 10px; background: var(--color-bg-tertiary); color: var(--text-muted); padding: 1px 5px; border-radius: var(--radius-full); }

.tree-empty-folder { padding: 4px 14px 4px 40px; font-size: 10px; color: var(--text-muted); }

.tree-items { padding: 2px 0; }
.tree-subfolder-container { padding-left: 6px; }
.tree-subitem { padding-left: 36px; }
.tree-subitem-empty { padding-left: 36px; }
.tree-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px 8px 40px; cursor: pointer;
  transition: all var(--transition-fast); border-radius: 0;
}
.tree-item:hover { background: rgba(255,255,255,0.03); }
.tree-item.is-active { background: var(--border-subtle); border-right: 2px solid var(--text-accent); }
.item-icon { font-size: 14px; flex-shrink: 0; }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.item-name { font-size: 12px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-name.is-done { text-decoration: line-through; opacity: 0.6; }
.item-meta { font-size: 10px; color: var(--text-muted); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.status-dot.success { background: #22c55e; }
.status-dot.processing { background: var(--text-accent); animation: blink 1.5s infinite; }
.task-done-icon { color: #22c55e; flex-shrink: 0; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* Drop Zone */
.drop-zone {
  margin: 8px 10px 10px;
  border: 1.5px dashed var(--border-default);
  border-radius: var(--radius-lg);
  padding: 14px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer; transition: all var(--transition-normal);
}
.drop-zone:hover, .drop-zone.is-over { border-color: var(--border-accent); background: var(--border-subtle); }
.drop-icon { font-size: 16px; color: var(--text-accent); }
.drop-text { font-size: 12px; color: var(--text-muted); }

/* ===== MIDDLE PANEL ===== */
.studio-middle {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  overflow: hidden;
}

html.dark .studio-middle {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

.middle-content-scroll {
  flex: 1;
  overflow-y: auto;
  position: relative;
  background: var(--color-bg-secondary);
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
.detail-header { padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); background: var(--color-bg-primary); }
.detail-title-row { display: flex; align-items: center; gap: 14px; }
.detail-icon { font-size: 32px; flex-shrink: 0; }
.detail-name { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
.detail-name.is-done { text-decoration: line-through; opacity: 0.6; }
.detail-path { font-size: 11px; color: var(--text-muted); }
.status-badge {
  margin-left: auto; font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: var(--radius-full); flex-shrink: 0;
}
.status-badge.success { background: rgba(34,197,94,0.12); color: #22c55e; }
.status-badge.processing { background: var(--border-subtle); color: var(--text-accent); }

.full-height-viewer { height: 100%; display: flex; flex-direction: column; }
.block-editor-view, .task-editor-view { padding: 40px 60px; max-width: 900px; margin: 0 auto; }

/* Editor Header */
.editor-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);
}
.editor-title-row { display: flex; align-items: center; gap: 16px; }
.editor-icon-wrapper {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--color-primary-light);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary-accent);
}
.editor-icon { width: 24px; height: 24px; }
.editor-meta { display: flex; flex-direction: column; gap: 4px; }
.editor-type { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.editor-subject { font-size: 12px; font-weight: 600; color: var(--text-muted); background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; display: inline-block; width: fit-content; }
.editor-save-btn {
  display: flex; align-items: center; gap: 8px;
  background: var(--color-primary-accent); color: #fff;
  padding: 8px 16px; border-radius: var(--radius-full); font-size: 13px; font-weight: 600;
  border: none; cursor: pointer; transition: all var(--transition-fast);
}
.editor-save-btn:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 4px 12px var(--color-primary-glow); }
.editor-save-btn .btn-icon { width: 14px; height: 14px; }

/* Editor Body */
.block-editor-container { display: flex; flex-direction: column; gap: 16px; }
.editor-title-input {
  font-size: 28px; font-weight: 800; color: var(--text-primary);
  width: 100%; border: none; background: transparent; padding: 0; outline: none;
  font-family: inherit;
}
.editor-title-input::placeholder { color: var(--text-muted); font-weight: 600; }

.editor-content-wrapper {
  background: var(--color-bg-primary); border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle); padding: 24px; min-height: 400px;
  display: flex; flex-direction: column;
}

/* Task Property Grid (Notion/Linear style) */
.property-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 16px 0 32px 0;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-subtle);
}
.property-row {
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
  width: 120px;
  flex-shrink: 0;
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
  background-color: transparent !important;
  box-shadow: none !important;
  border: 1px solid #7D9372 !important; /* Theme color stroke */
  border-radius: 9999px !important; /* Fully rounded pill shape */
  transition: all var(--transition-fast) !important;
  padding-left: 12px;
}
:deep(.zen-date-picker:hover .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper:hover) {
  background-color: var(--color-bg-secondary) !important;
  border-color: #65775c !important;
}
:deep(.zen-date-picker.is-active .el-input__wrapper),
:deep(.zen-date-picker.is-focus .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper.is-focus) {
  background-color: var(--color-bg-primary) !important;
  border-color: #A3B19B !important;
  box-shadow: 0 0 0 2px rgba(125, 147, 114, 0.2) !important;
}

/* Zen Date Popper overriding Element Plus */
:global(.zen-date-popper.el-popper) {
  border: 1px solid #7D9372 !important; /* Theme color stroke */
  border-radius: 12px !important; /* Rounded corners */
  box-shadow: 0 4px 16px rgba(125, 147, 114, 0.15) !important;
}
:global(.zen-date-popper .el-picker-panel) {
  border: none !important;
  border-radius: 12px !important;
}
:global(.zen-date-popper .el-popper__arrow::before) {
  border-color: #7D9372 !important;
}

.property-value {
  flex: 1;
  display: flex;
  align-items: center;
}
.duration-select {
  min-width: 150px;
  padding: 8px 32px 8px 12px;
  border: 1px solid #7D9372;
  border-radius: 9999px;
  background: var(--color-bg-primary);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.duration-select:focus {
  outline: none;
  border-color: #65775c;
  box-shadow: 0 0 0 2px rgba(125, 147, 114, 0.2);
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
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  padding: 4px;
  gap: 4px;
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
  background: var(--color-bg-secondary);
}
.toggle-btn.is-active {
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(125, 147, 114, 0.28);
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
  width: 450px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  overflow: hidden;
}
html.dark .studio-right-context {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
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
  background: var(--color-bg-secondary);
}
.ctx-tab {
  flex: 1;
  padding: 12px 0;
  background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; transition: all var(--transition-fast);
}
.ctx-tab:hover { color: var(--text-primary); }
.ctx-tab.active { color: var(--text-primary); border-bottom-color: var(--text-accent); }

.context-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
  background: var(--color-bg-primary);
}

/* Blocks Tab */
.ctx-blocks { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.blocks-toolbar { display: flex; justify-content: flex-end; }
.new-block-btn { width: 100%; }

.inline-block-editor {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inline-input {
  width: 100%; padding: 8px;
  background: var(--color-bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: 12px; font-family: inherit;
  resize: vertical;
}
.inline-input:focus { outline: none; border-color: var(--text-accent); }
.title-input { font-weight: 600; }
.tag-input { font-size: 11px; }
.inline-actions { display: flex; justify-content: flex-end; gap: 6px; }

.blocks-list { display: flex; flex-direction: column; gap: 10px; }
.block-row {
  display: flex; gap: 10px; align-items: flex-start;
  background: var(--color-bg-secondary); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md); padding: 12px;
  transition: all var(--transition-normal);
  position: relative;
}
.block-row:hover { border-color: var(--border-accent); }
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
  font-size: 9px; color: var(--text-accent); background: var(--border-subtle);
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
.drag-drop-zone { border: 2px dashed rgba(0,0,0,0.1); border-radius: 8px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.4); margin-bottom: 8px; }
.drag-drop-zone:hover { border-color: rgba(0,0,0,0.2); background: rgba(255,255,255,0.8); }
.drag-drop-zone.is-active { border-color: #7D9372; background: rgba(125, 147, 114, 0.05); }
.drag-text { font-size: 13px; color: var(--text-muted); font-weight: 500; }
html.dark .drag-drop-zone { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
html.dark .drag-drop-zone:hover { border-color: rgba(255,255,255,0.2); background: rgba(0,0,0,0.4); }
html.dark .drag-drop-zone.is-active { border-color: #9AB08F; background: rgba(154, 176, 143, 0.1); }

/* Home Modal Styles for Register Modal (Copied from SubjectWorkspace) */
.modal-container { width: 90%; max-width: 520px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; overflow: hidden; animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
html.dark .modal-container { background: #181D18; border-color: rgba(163, 177, 155, 0.25); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
@keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-container .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); }
.modal-container .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }
.modal-container .modal-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto; }
.form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.styled-input, .styled-textarea { width: 100%; padding: 12px 14px; background: var(--color-bg-secondary); border: 1px solid var(--border-default); border-radius: 12px; font-size: 13.5px; color: var(--text-primary); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit; }
.styled-input:focus, .styled-textarea:focus { border-color: #7D9372; background: var(--color-bg-primary); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.15); }
html.dark .styled-input:focus, html.dark .styled-textarea:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.2); }
.styled-textarea { resize: vertical; line-height: 1.6; min-height: 100px; }
.modal-container .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px 22px; border-top: 1px solid var(--border-subtle); background: transparent; }
.btn-secondary { background: transparent; border: 1px solid var(--border-default); color: var(--text-secondary); padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-secondary:hover { background: var(--color-bg-secondary); color: var(--text-primary); }
.btn-primary { background: var(--btn-primary-bg, linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)); border: none; color: #FFFFFF; padding: 8px 26px; border-radius: 9999px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 2px 8px rgba(125, 147, 114, 0.3); }
.btn-primary:hover:not(:disabled) { background: #6E8364; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(125, 147, 114, 0.45); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
html.dark .btn-primary { background: #9AB08F; color: #1a1a1a; }
html.dark .btn-primary:hover { background: #b0c2a7; box-shadow: 0 4px 12px rgba(154, 176, 143, 0.2); }

/* Subject Capsule Grid */
.subject-capsule-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.subject-capsule-item { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--color-bg-secondary); border: 1.5px solid transparent; border-radius: 9999px; font-size: 13px; font-weight: 600; color: var(--text-primary); cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.subject-capsule-item:hover { transform: translateY(-1px); background: var(--color-bg-tertiary); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); border-color: rgba(125,147,114,0.3); color: #7D9372; }
.subject-capsule-item.is-active { background: rgba(125, 147, 114, 0.1) !important; border-color: #7D9372 !important; color: #7D9372 !important; box-shadow: 0 2px 8px rgba(125, 147, 114, 0.15); }
html.dark .subject-capsule-item.is-active { background: rgba(154, 176, 143, 0.15) !important; border-color: #9AB08F !important; color: #9AB08F !important; }
.subj-capsule-name { font-size: 13px; }
</style>
