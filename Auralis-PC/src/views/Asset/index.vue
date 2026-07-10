<template>
  <div class="asset-studio">
    <!-- LEFT: Asset Tree -->
    <aside class="studio-left">
      <div class="panel-header">
        <span class="panel-title">资产库</span>
        <button class="icon-btn" title="导入文件" @click="triggerUpload()">＋</button>
      </div>

      <!-- Search -->
      <div class="tree-search">
        <input v-model="searchQ" class="search-input" placeholder="搜索资产..." />
      </div>

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-banner">
        <span class="upload-status-txt">{{ uploadStatusText }} {{ uploadProgress }}%</span>
        <div class="mini-bar-bg"><div class="mini-bar-fill" :style="{ width: uploadProgress + '%' }"></div></div>
      </div>

      <!-- Tree Groups -->
      <div class="tree-body">
        <div v-if="isLoadingAssets" class="tree-loading">
          <span class="loading-spinner"></span> 加载中...
        </div>
        <div v-else-if="filteredGroups.length === 0" class="tree-empty">
          暂无资产，请上传文件
        </div>
        <template v-else>
          <div v-for="group in filteredGroups" :key="group.id" class="tree-group">
            <div class="tree-group-header" @click="group.open = !group.open">
              <span class="group-arrow">{{ group.open ? '▾' : '▸' }}</span>
              <span class="group-icon">{{ group.icon }}</span>
              <span class="group-name">{{ group.name }}</span>
              <span class="group-count">{{ group.items.length }}</span>
              <button class="header-action-btn" title="上传资产到该学科" @click.stop="triggerUpload(group.id === 'all' ? undefined : group.id)">＋</button>
            </div>
            <div v-if="group.open" class="tree-items">
              <div
                v-for="item in group.items"
                :key="item.id"
                class="tree-item"
                :class="{ 'is-active': selected?.id === item.id }"
                @click="selectItem(item, group.id)"
              >
                <span class="item-icon">{{ item.icon }}</span>
                <div class="item-info">
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-meta">{{ item.time }} · {{ item.blocks }}块</span>
                </div>
                <span class="status-dot" :class="item.status"></span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Drop Zone -->
      <div
        class="drop-zone"
        :class="{ 'is-over': isDragover }"
        @dragover.prevent="isDragover = true"
        @dragleave.prevent="isDragover = false"
        @drop.prevent="handleDrop"
        @click="triggerUpload()"
      >
        <span class="drop-icon">↑</span>
        <span class="drop-text">拖拽或点击上传</span>
      </div>
    </aside>

    <!-- COLUMN 2: MIDDLE Details & Blocks -->
    <main class="studio-middle">
      <!-- Empty state -->
      <div v-if="!selected" class="empty-state">
        <div class="empty-icon">⚙</div>
        <h2 class="empty-title">选择一个资产开始编排</h2>
        <p class="empty-desc">从左侧资产树中选择文件，即可在此预览知识块与编辑任务</p>
        <button class="upload-cta" @click="triggerUpload()">上传新资产</button>
      </div>

      <!-- Detail view -->
      <template v-else>
        <div class="detail-header">
          <div class="detail-title-row">
            <span class="detail-icon">{{ selected.icon }}</span>
            <div>
              <h1 class="detail-name">{{ selected.name }}</h1>
              <p class="detail-path">重型资产 · {{ selected.pages }} 页 · {{ selected.size }}</p>
            </div>
            <span class="status-badge" :class="selected.status">{{ selected.statusText }}</span>
          </div>

          <!-- Tab bar -->
          <div class="tab-bar">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="tab-btn"
              :class="{ 'is-active': activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div class="middle-content-scroll">
          <div v-if="activeTab === 'blocks'" class="tab-content">
            <div class="blocks-summary" style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 12px;">
                <div class="summary-stat"><span class="s-val">{{ computedBlocks.length }}</span><span class="s-lbl">知识块</span></div>
                <div class="summary-stat"><span class="s-val">{{ selected.tasks }}</span><span class="s-lbl">生成任务</span></div>
                <div class="summary-stat"><span class="s-val">{{ selected.pages }}</span><span class="s-lbl">页</span></div>
              </div>
              <button class="btn-primary" style="padding: 6px 12px; font-size: 12px; border-radius: 6px; border: none; background: #7D9372; color: white; cursor: pointer;" @click="openBlockDialog()">+ 新增知识块</button>
            </div>
            <div class="blocks-list">
              <div v-for="(b, idx) in computedBlocks" :key="b.id" class="block-row">
                <div class="block-num">{{ idx + 1 }}</div>
                <div class="block-body">
                  <p class="block-heading">{{ b.heading }}</p>
                  <p class="block-preview">{{ b.preview }}</p>
                </div>
                <div class="block-actions" style="display: flex; gap: 12px; align-items: center;">
                  <div class="block-tags">
                    <span v-for="t in b.tags" :key="t" class="block-tag">{{ t }}</span>
                  </div>
                  <button style="border: none; background: none; color: #7D9372; cursor: pointer; font-size: 12px;" @click="openBlockDialog(b.originalBlock || b)">编辑</button>
                  <button style="border: none; background: none; color: #ef4444; cursor: pointer; font-size: 12px;" @click="handleDeleteBlock(b.id)">删除</button>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: 任务 -->
          <div v-else-if="activeTab === 'tasks'" class="tab-content">
            <div class="tasks-list">
              <div v-for="t in selected.taskList" :key="t.id" class="task-row">
                <div class="task-check" :class="{ done: t.done }" @click="t.done = !t.done">
                  <span v-if="t.done">✓</span>
                </div>
                <div class="task-body">
                  <span class="task-title" :class="{ done: t.done }">{{ t.title }}</span>
                  <span class="task-due">截止：{{ t.due }}</span>
                </div>
                <span class="task-load" :class="t.load">{{ t.load }}</span>
              </div>
            </div>
          </div>

          <!-- TAB: 文件清单 -->
          <div v-else-if="activeTab === 'files'" class="tab-content">
            <div class="file-list-container" style="display: flex; flex-direction: column; gap: 12px; padding: 12px 0;">
              <div v-for="f in getFilesList()" :key="f.id" class="file-list-item" style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 24px;">{{ f.icon }}</span>
                  <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 14px; font-weight: 600; color: #111827;">{{ f.name }}</span>
                    <span style="font-size: 12px; color: #6b7280;">上传于 {{ f.time }} · {{ f.size }}</span>
                  </div>
                </div>
                <button class="btn-primary" style="padding: 6px 12px; font-size: 12px; border-radius: 6px; border: none; background: #7D9372; color: white; cursor: pointer;" @click="previewFile(f)">点击查看</button>
              </div>
              <div v-if="getFilesList().length === 0" style="text-align: center; color: #9ca3af; padding: 32px 0; font-size: 13px;">
                暂无源文件
              </div>
            </div>
          </div>

          <!-- TAB: Markdown 结构化 -->
          <div v-else-if="activeTab === 'markdown'" class="tab-content">
            <div class="markdown-preview">
              <pre class="markdown-content">{{ selected.markdown }}</pre>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- COLUMN 3: RIGHT Obsidian Relationship Graph -->
    <aside class="studio-right-graph">
      <div v-if="!selected" class="graph-empty-state">
        <div class="empty-graph-icon">🌌</div>
        <p class="empty-graph-desc">选择一个资产来加载知识星空图</p>
      </div>
      <template v-else>
        <div class="graph-header">
          <span class="graph-title">关系星图</span>
        </div>
        <div class="graph-container-wrapper">
          <KnowledgeGraph
            v-if="selectedGroup"
            :subjectId="selectedGroup.id === 'all' && selected ? selected.id : selectedGroup.id"
            :blocks="groupBlocks"
            :subjectName="selectedGroup.id === 'all' && selected ? selected.name : selectedGroup.name"
            :subjectColor="selectedGroup.id === 'all' ? 'rgba(59,130,246,0.2)' : (selectedGroup.color || 'rgba(99,102,241,0.2)')"
          />
          <div v-else class="empty-state">
            <p>无法定位学科信息</p>
          </div>
        </div>
      </template>
    </aside>

    <!-- Subject Selection Modal/Dialog -->
    <el-dialog
      v-model="showUploadDialog"
      title="上传资产"
      width="400px"
      append-to-body
    >
      <div class="upload-dialog-content" style="display: flex; flex-direction: column; gap: 16px;">
        <div class="form-item">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 13px;">选择目标学科</label>
          <el-select v-model="selectedSubjectId" placeholder="选择学科" style="width: 100%;">
            <el-option
              v-for="s in subjectStore.subjects"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </div>
        <div class="form-item">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 13px;">选择文件</label>
          <div 
            class="dialog-file-picker" 
            style="border: 1.5px dashed var(--border-default); border-radius: var(--radius-md); padding: 20px; text-align: center; cursor: pointer; background: var(--color-bg-tertiary);"
            @click="triggerFileSelect"
          >
            <span v-if="!selectedFileToUpload" style="font-size: 12px; color: var(--text-muted);">点击选择要上传的文件</span>
            <span v-else style="font-size: 13px; font-weight: 600; color: var(--text-primary);">📄 {{ selectedFileToUpload.name }}</span>
          </div>
          <input 
            ref="dialogFileInput" 
            type="file" 
            accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.png,.jpeg" 
            style="display: none;" 
            @change="handleDialogFileChange"
          />
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showUploadDialog = false">取消</el-button>
          <el-button type="primary" :disabled="!selectedSubjectId || !selectedFileToUpload" @click="confirmUpload">
            确认上传
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Block CRUD Dialog -->
    <el-dialog
      v-model="blockDialogVisible"
      :title="editingBlockId ? '编辑知识块' : '新增知识块'"
      width="500px"
      append-to-body
    >
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div class="form-item">
          <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600;">标题</label>
          <el-input v-model="blockForm.title" placeholder="输入知识块标题" />
        </div>
        <div class="form-item">
          <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600;">内容</label>
          <el-input v-model="blockForm.preview" type="textarea" :rows="4" placeholder="输入核心内容" />
        </div>
        <div class="form-item">
          <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600;">标签 (逗号分隔)</label>
          <el-input v-model="blockForm.tagsStr" placeholder="例如: 前端, Vue" />
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="blockDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveBlock">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- PDF Preview Modal -->
    <el-dialog v-model="previewVisible" :title="'原文查看 - ' + previewTarget?.name" width="80%" top="5vh" append-to-body>
      <div style="height: 70vh; display: flex; flex-direction: column;">
        <PdfViewer v-if="previewTarget" :filePath="previewTarget.filePath || previewTarget.name" :fileName="previewTarget.name" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ingestFile } from '@/api/aiClient'
import { uploadAsset, validateFileSize, getAssetStatus } from '@/api/useAssetApi'
import { ElNotification, ElMessageBox } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-button.css'
import PdfViewer from '@/components/subject/PdfViewer.vue'
import KnowledgeGraph from '@/components/subject/KnowledgeGraph.vue'

// ---- Upload ----
const isDragover = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const searchQ = ref('')
const activeTab = ref('blocks')
const isLoadingAssets = ref(false)
const baseTabs = ref([
  { id: 'blocks', label: '知识块' },
  { id: 'tasks', label: '生成任务' },
  { id: 'files', label: '源文件清单' }
])

const tabs = computed(() => {
  if (selected.value?.markdown) {
    return [{ id: 'markdown', label: '结构化 Markdown' }, ...baseTabs.value]
  }
  return baseTabs.value
})

interface AssetItem {
  id: string; name: string; icon: string; status: string; statusText: string
  time: string; blocks: number; tasks: number; pages: number; size: string
  filePath?: string;
  blockList: any[]; taskList: any[]; markdown?: string
}

interface AssetGroup {
  id: string; name: string; icon: string; color?: string; open: boolean
  items: AssetItem[]
}

// Upload Dialog
const showUploadDialog = ref(false)
const selectedSubjectId = ref('')
const selectedFileToUpload = ref<File | null>(null)
const dialogFileInput = ref<HTMLInputElement | null>(null)

import { useSubjectStore } from '@/store/useSubjectStore'
import { useBlockStore } from '@/store/useBlockStore'
import { localDb } from '@/services/localDb'

const subjectStore = useSubjectStore()
const blockStore = useBlockStore()

const groups = ref<AssetGroup[]>([])

/**
 * 按照学科分组从本地数据库加载资产和参考材料
 */
const loadAssetsFromBackend = async () => {
  isLoadingAssets.value = true
  try {
    await subjectStore.loadSubjects()
    await blockStore.loadLocalBlocks()
    
    const newGroups: AssetGroup[] = []
    
    // 1. Fetch all files to create "全部资产" group
    const allFilesRaw = await localDb.getSourceFiles()
    const allItems: AssetItem[] = allFilesRaw.map(file => {
      const fileBlocks = blockStore.recentBlocks.filter(b => b.sourceFileId === file.id || b.source === file.name)
      return {
        id: String(file.id),
        name: file.name,
        icon: getIconForSource(file.name),
        status: 'success',
        statusText: '正常',
        time: new Date(file.created_at || Date.now()).toLocaleDateString(),
        blocks: fileBlocks.length,
        tasks: 0,
        pages: 1,
        size: (file.file_size / (1024 * 1024)).toFixed(2) + ' MB',
        filePath: file.file_path,
        blockList: fileBlocks.map((b, idx) => ({
          id: idx + 1,
          heading: b.title,
          preview: b.preview,
          tags: b.tags || []
        })),
        taskList: []
      }
    })
    
    // Add Placeholder and All Blocks Aggregation
    const mockItem: AssetItem = {
      id: '-1',
      name: '💡 示例编排资产 (点击预览)',
      icon: '📚',
      status: 'success',
      statusText: '完美解析',
      time: '今天',
      blocks: 3,
      tasks: 2,
      pages: 15,
      size: '1.2 MB',
      blockList: [
        { id: 1, heading: '知识点：Vue 响应式', preview: 'Vue 3 使用 Proxy 对象实现对数据属性的劫持...', tags: ['前端', 'Vue'] },
        { id: 2, heading: '知识点：Tauri 架构', preview: 'Tauri 分为 Rust 后端和 Web 前端，通过 IPC 通信...', tags: ['桌面端'] },
        { id: 3, heading: '知识点：大模型 Prompt', preview: '编写清晰、明确的 Prompt 可以显著提高模型输出质量。', tags: ['AI', '提示词'] }
      ],
      taskList: [
        { id: 1, title: '复习 Vue 响应式原理', due: '今天', load: '中', done: false },
        { id: 2, title: '编写 Tauri IPC 示例', due: '明天', load: '高', done: false }
      ],
      markdown: '# 示例架构文档\n\n- Vue 3\n- Tauri 2.0\n- SQLite'
    }

    const allBlocksItem: AssetItem = {
      id: '-2',
      name: '📦 全部分类知识块汇总',
      icon: '🧠',
      status: 'success',
      statusText: '动态聚合',
      time: '实时',
      blocks: blockStore.recentBlocks.length,
      tasks: 0,
      pages: 0,
      size: '--',
      blockList: blockStore.recentBlocks.map((b, idx) => ({
        id: b.id || idx + 1,
        heading: b.title,
        preview: b.preview,
        tags: b.tags || [b.subject]
      })),
      taskList: [],
      markdown: '# 全部分类知识块\n\n' + blockStore.recentBlocks.map(b => `## ${b.title}\n\n${b.preview}`).join('\n\n')
    }

    allItems.unshift(allBlocksItem, mockItem)
    
    newGroups.push({
      id: 'all',
      name: '全部资产',
      icon: '🗂️',
      color: 'rgba(100, 116, 139, 0.2)',
      open: true,
      items: allItems
    })
    
    // 2. Load subject-specific files
    for (const subj of subjectStore.subjects) {
      await subjectStore.loadSourceFiles(subj.id)
      const files = subjectStore.activeSourceFiles
      
      const items: AssetItem[] = files.map(file => {
        const fileBlocks = blockStore.recentBlocks.filter(b => b.sourceFileId === file.id || b.source === file.name)
        return {
          id: String(file.id),
          name: file.name,
          icon: getIconForSource(file.name),
          status: 'success',
          statusText: '正常',
          time: new Date(file.created_at || Date.now()).toLocaleDateString(),
          blocks: fileBlocks.length,
          tasks: 0,
          pages: 1,
          size: (file.file_size / (1024 * 1024)).toFixed(2) + ' MB',
          filePath: file.file_path,
          blockList: fileBlocks.map((b, idx) => ({
            id: idx + 1,
            heading: b.title,
            preview: b.preview,
            tags: b.tags || []
          })),
          taskList: []
        }
      })
      
      newGroups.push({
        id: subj.id,
        name: subj.name,
        icon: subj.icon || '📚',
        color: subj.color,
        open: true,
        items
      })
    }
    groups.value = newGroups
  } catch (e) {
    console.error('[Asset] Failed to load local assets:', e)
  } finally {
    isLoadingAssets.value = false
  }
}

/** 根据资产来源推断图标 */
function getIconForSource(source: string): string {
  const lower = source.toLowerCase()
  if (lower.includes('pdf')) return '📄'
  if (lower.includes('ppt') || lower.includes('课件')) return '📊'
  if (lower.includes('手写') || lower.includes('扫描') || lower.includes('image')) return '🖼️'
  if (lower.includes('voice') || lower.includes('语音')) return '🎤'
  return '📄'
}

const handleSyncEvent = async (e: Event) => {
  const customEvent = e as CustomEvent
  const syncEvent = customEvent.detail

  if (syncEvent.entity === 'assets') {
    if (syncEvent.type === 'DOC_INGESTED') {
      try {
        const data = typeof syncEvent.data === 'string' ? JSON.parse(syncEvent.data) : syncEvent.data
        const assetId = syncEvent.refId || data.refId

        // Retrieve asset metadata to get its name
        const assetInfo = await getAssetStatus(assetId)

        // Register in local SQLite source_files table to keep in sync
        const subjectId = assetInfo.subject
        if (subjectId && subjectId !== '文档导入') {
          await subjectStore.loadSourceFiles(subjectId)
          const alreadyExists = subjectStore.activeSourceFiles.some(
            f => f.name === assetInfo.fileName || f.file_path === assetInfo.objectName
          )
          if (!alreadyExists) {
            await subjectStore.addSourceFile(
              subjectId,
              assetInfo.fileName,
              assetInfo.objectName,
              assetInfo.contentType || 'PDF',
              assetInfo.fileSize || 0
            )
          }
        }

        // Refresh local assets tree
        await loadAssetsFromBackend()

        // Update selected if we have it or if it is currently processing
        const allItems = groups.value.flatMap(g => g.items)
        const updatedItem = allItems.find(item => item.name === assetInfo.fileName)

        if (updatedItem) {
          // If we had a processing item selected with this name, switch selected to this real item
          if (selected.value && (selected.value.name === assetInfo.fileName || selected.value.id === assetId)) {
            selected.value = updatedItem
          }
        }

        ElNotification({
          title: '🎉 资产编排完成',
          message: `文档《${assetInfo.fileName}》已成功入库并生成 ${data.segmentCount || 0} 个知识块`,
          type: 'success',
          position: 'top-right',
          duration: 5000
        })
      } catch (err) {
        console.error('Failed to handle DOC_INGESTED event:', err)
      }
    } else if (syncEvent.type === 'INGEST_FAILED') {
      try {
        const data = typeof syncEvent.data === 'string' ? JSON.parse(syncEvent.data) : syncEvent.data
        const filename = data.fileName || '未知文件'

        // Update selected/placeholder item status to failed
        for (const group of groups.value) {
          const item = group.items.find(i => i.name === filename || i.id === syncEvent.refId)
          if (item) {
            item.status = 'failed'
            item.statusText = '编排失败'
          }
        }

        ElNotification({
          title: '❌ 资产编排失败',
          message: `文档《${filename}》解析失败：${data.error || '未知错误'}`,
          type: 'error',
          position: 'top-right',
          duration: 5000
        })
      } catch (err) {
        console.error('Failed to handle INGEST_FAILED event:', err)
      }
    }
  }
}

onMounted(() => {
  loadAssetsFromBackend()
  if (typeof window !== 'undefined') {
    window.addEventListener('auralis-sync-event', handleSyncEvent)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('auralis-sync-event', handleSyncEvent)
  }
})

const filteredGroups = computed(() =>
  groups.value.map(g => ({
    ...g,
    items: searchQ.value
      ? g.items.filter(i => i.name.toLowerCase().includes(searchQ.value.toLowerCase()))
      : g.items
  })).filter(g => searchQ.value ? g.items.length > 0 : true)
)

const selected = ref<AssetItem | null>(null)
const selectedGroupId = ref<string | null>(null)

const computedBlocks = computed(() => {
  if (!selected.value) return []
  if (selected.value.id.startsWith('-')) return selected.value.blockList
  
  return blockStore.recentBlocks
    .filter(b => String(b.sourceFileId) === String(selected.value!.id) || b.source === selected.value!.name)
    .map(b => ({
      id: b.id,
      heading: b.title,
      preview: b.preview,
      tags: b.tags || [],
      originalBlock: b
    }))
})

// --- Block CRUD Actions ---
const blockDialogVisible = ref(false)
const editingBlockId = ref('')
const blockForm = ref({ title: '', preview: '', tagsStr: '' })

const openBlockDialog = (b?: any) => {
  if (b && b.id) {
    editingBlockId.value = b.id
    blockForm.value = {
      title: b.title || b.heading || '',
      preview: b.preview || '',
      tagsStr: (b.tags || []).join(', ')
    }
  } else {
    editingBlockId.value = ''
    blockForm.value = { title: '', preview: '', tagsStr: '' }
  }
  blockDialogVisible.value = true
}

const saveBlock = async () => {
  if (!blockForm.value.title.trim()) {
    ElNotification({ title: '⚠️ 提示', message: '标题不能为空', type: 'warning' })
    return
  }
  
  const tags = blockForm.value.tagsStr.split(',').map(s => s.trim()).filter(Boolean)
  const currentSubjectId = selectedGroup.value?.id === 'all' ? (subjectStore.subjects[0]?.id || 'unknown') : (selectedGroup.value?.id || 'unknown')
  const currentSubjectName = subjectStore.subjects.find(s => s.id === currentSubjectId)?.name || '未分类'
  
  if (editingBlockId.value) {
    const original = blockStore.recentBlocks.find(x => x.id === editingBlockId.value)
    if (original) {
       await blockStore.updateBlock({
         ...original,
         title: blockForm.value.title,
         preview: blockForm.value.preview,
         tags: tags
       })
       ElNotification({ title: '✅ 成功', message: '知识块已更新', type: 'success' })
    }
  } else {
    const newBlock = {
      subject: currentSubjectName,
      title: blockForm.value.title,
      preview: blockForm.value.preview,
      time: new Date().toISOString().split('T')[0],
      source: selected.value ? selected.value.name : '手动新建',
      color: 'rgba(99, 102, 241, 0.2)',
      subjectId: currentSubjectId,
      sourceFileId: selected.value && !selected.value.id.startsWith('-') ? selected.value.id : undefined,
      tags: tags
    }
    await blockStore.addBlock(newBlock as any)
    ElNotification({ title: '✅ 成功', message: '知识块已添加', type: 'success' })
  }
  
  blockDialogVisible.value = false
  
  // Optimizstic update for mock assets
  if (selected.value && selected.value.id.startsWith('-')) {
     if (editingBlockId.value) {
       const b = selected.value.blockList.find((x:any) => x.id === editingBlockId.value)
       if (b) { b.heading = blockForm.value.title; b.preview = blockForm.value.preview; b.tags = tags }
     } else {
       selected.value.blockList.push({ id: Date.now(), heading: blockForm.value.title, preview: blockForm.value.preview, tags })
     }
  }
}

const handleDeleteBlock = async (id: string) => {
  if (!id) return
  try {
    await ElMessageBox.confirm('确认删除该知识块吗？', '删除提示', { type: 'warning' })
    if (selected.value && selected.value.id.startsWith('-')) {
      selected.value.blockList = selected.value.blockList.filter((b:any) => b.id !== id)
    } else {
      await blockStore.removeBlock(id)
    }
    ElNotification({ title: '🗑️ 已删除', message: '知识块已被删除', type: 'success' })
  } catch (e) {
    // User canceled
  }
}

const selectedGroup = computed(() => {
  if (!selected.value || !selectedGroupId.value) return null
  return groups.value.find(g => g.id === selectedGroupId.value) || null
})

// --- File Preview Logic ---
const getFilesList = () => {
  if (!selected.value) return []
  if (selected.value.id === '-2') {
    const all: AssetItem[] = []
    groups.value.forEach(g => {
      g.items.forEach(i => {
        if (!i.id.startsWith('-')) all.push(i)
      })
    })
    return Array.from(new Set(all))
  }
  return [selected.value]
}

const previewVisible = ref(false)
const previewTarget = ref<AssetItem | null>(null)
const previewFile = (f: AssetItem) => {
  previewTarget.value = f
  previewVisible.value = true
}

const groupBlocks = computed(() => {
  if (!selectedGroup.value) return []
  if (selectedGroup.value.id === 'all') {
    if (selected.value) {
      return blockStore.recentBlocks.filter(b => b.sourceFileId === selected.value!.id || b.source === selected.value!.name)
    }
    return blockStore.recentBlocks
  }
  return blockStore.recentBlocks.filter(b => b.subjectId === selectedGroup.value!.id)
})

const selectItem = (item: AssetItem, groupId: string) => {
  selected.value = item
  selectedGroupId.value = groupId
  activeTab.value = 'blocks'
}

const triggerUpload = (subjectId?: string) => {
  selectedSubjectId.value = subjectId || (subjectStore.subjects[0]?.id || '')
  selectedFileToUpload.value = null
  showUploadDialog.value = true
}

const triggerFileSelect = () => {
  dialogFileInput.value?.click()
}

const handleDialogFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    selectedFileToUpload.value = file
  }
}

const confirmUpload = () => {
  if (selectedFileToUpload.value && selectedSubjectId.value) {
    const file = selectedFileToUpload.value
    const subjId = selectedSubjectId.value
    showUploadDialog.value = false
    handleFileUpload(file, subjId)
  }
}

const handleDrop = (e: DragEvent) => {
  isDragover.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) {
    selectedFileToUpload.value = f
    selectedSubjectId.value = subjectStore.subjects[0]?.id || ''
    showUploadDialog.value = true
  }
}

/**
 * 15.7 Real upload pipeline: validate → presign → MinIO direct upload → bind asset
 * Falls back to legacy AI text ingestion for small images.
 */
const handleFileUpload = async (file: File, subjectId: string) => {
  const filename = file.name
  const isImage = /\.(jpg|jpeg|png)$/i.test(filename)
  const fileSizeMb = file.size < 1024 * 1024
    ? (file.size / 1024).toFixed(0) + ' KB'
    : (file.size / (1024 * 1024)).toFixed(1) + ' MB'

  // Client-side size validation
  try {
    validateFileSize(file)
  } catch (e: any) {
    ElNotification({
      title: '⚠️ 文件校验失败',
      message: e.message,
      type: 'warning',
      position: 'top-right',
      duration: 4000
    })
    return
  }

  isUploading.value = true
  uploadProgress.value = 5
  uploadStatusText.value = '校验文件...'

  try {
    // For images (small files), use legacy AI text extraction path
    if (isImage) {
      await handleImageUpload(file, filename, subjectId)
      return
    }

    // 15.7 MinIO direct upload pipeline for documents
    const asset = await uploadAsset(file, subjectId, (percent, stage) => {
      uploadProgress.value = percent
      uploadStatusText.value = stage
    })

    uploadProgress.value = 98
    uploadStatusText.value = '资产已提交后台解析...'

    // Create a placeholder asset item (backend will process asynchronously)
    const newItem: AssetItem = {
      id: String(asset.id), name: filename, icon: '📄',
      status: 'processing', statusText: '后台解析中',
      time: '刚刚', blocks: 0, tasks: 0,
      pages: 0, size: fileSizeMb,
      blockList: [], taskList: [],
    }

    const group = groups.value.find(g => g.id === subjectId)
    if (group) {
      group.items.unshift(newItem)
    }
    selected.value = newItem
    uploadProgress.value = 100

    setTimeout(() => { isUploading.value = false }, 800)

  } catch (err: any) {
    console.error('上传失败:', err)
    uploadStatusText.value = '上传失败: ' + (err.message || '未知错误')
    setTimeout(() => { isUploading.value = false }, 2000)
  }
}

/** Real image upload: upload via multipart formData and extract blocks */
const handleImageUpload = async (file: File, filename: string, subjectId: string) => {
  uploadProgress.value = 30
  uploadStatusText.value = 'AI 笔记解析中...'

  try {
    const subjObj = subjectStore.subjects.find(s => s.id === subjectId)

    await ingestFile(file, subjObj ? subjObj.name : '图片笔记')

    // Register locally
    await subjectStore.addSourceFile(
      subjectId,
      filename,
      filename,
      file.type || 'image/png',
      file.size
    )

    uploadProgress.value = 80
    uploadStatusText.value = '更新资产列表中...'

    await loadAssetsFromBackend()

    // Find the item in subject group matching filename
    const group = groups.value.find(g => g.id === subjectId)
    if (group) {
      const item = group.items.find(i => i.name === filename)
      if (item) {
        selected.value = item
        activeTab.value = 'blocks'
      }
    }

    uploadProgress.value = 100
    setTimeout(() => { isUploading.value = false }, 500)
  } catch (err: any) {
    console.error('图片处理失败:', err)
    uploadStatusText.value = '图片 AI 处理失败: ' + (err.message || '未知错误')
    setTimeout(() => { isUploading.value = false }, 2000)
  }
}
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
  --accent-gradient: var(--color-zen-sage);
}

html.dark .asset-studio {
  background: var(--color-bg-primary);
}

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

.tree-group-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; cursor: pointer;
  user-select: none; transition: background var(--transition-fast);
}
.tree-group-header:hover { background: rgba(255,255,255,0.03); }
.group-arrow { font-size: 10px; color: var(--text-muted); width: 10px; }
.group-icon { font-size: 13px; }
.group-name { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
.group-count { font-size: 10px; background: var(--color-bg-tertiary); color: var(--text-muted); padding: 1px 5px; border-radius: var(--radius-full); }

.tree-items { padding: 2px 0; }
.tree-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px 8px 26px; cursor: pointer;
  transition: all var(--transition-fast); border-radius: 0;
}
.tree-item:hover { background: rgba(255,255,255,0.03); }
.tree-item.is-active { background: var(--border-subtle); border-right: 2px solid var(--text-accent); }
.item-icon { font-size: 14px; flex-shrink: 0; }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.item-name { font-size: 12px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-meta { font-size: 10px; color: var(--text-muted); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.status-dot.success { background: #22c55e; }
.status-dot.processing { background: var(--text-accent); animation: blink 1.5s infinite; }
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
}

/* ===== RIGHT GRAPH PANEL ===== */
.studio-right-graph {
  width: 480px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  overflow: hidden;
}

html.dark .studio-right-graph {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

.graph-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-bg-primary);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

html.dark .graph-header {
  background: var(--color-bg-secondary);
}

.graph-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.graph-container-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.graph-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.empty-graph-icon {
  font-size: 40px;
  opacity: 0.3;
}

.empty-graph-desc {
  font-size: 12px;
}

/* Empty */
.empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 60px 40px; text-align: center;
}
.empty-icon { font-size: 48px; color: var(--text-muted); opacity: 0.4; }
.empty-title { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.empty-desc { font-size: 13px; color: var(--text-muted); max-width: 320px; line-height: 1.7; }
.upload-cta {
  background: var(--accent-gradient); color: white; border: none;
  padding: 10px 24px; border-radius: var(--radius-md); font-weight: 600; font-size: 14px;
  cursor: pointer; transition: all var(--transition-fast); margin-top: 8px;
}
.upload-cta:hover { box-shadow: var(--accent-glow); transform: scale(1.02); }

/* Detail */
.detail-header { padding: 24px 28px 0; border-bottom: 1px solid var(--border-subtle); }
.detail-title-row { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 20px; }
.detail-icon { font-size: 32px; flex-shrink: 0; }
.detail-name { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; line-height: 1.3; }
.detail-path { font-size: 12px; color: var(--text-muted); }
.status-badge {
  margin-left: auto; font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: var(--radius-full); flex-shrink: 0;
}
.status-badge.success { background: rgba(34,197,94,0.12); color: #22c55e; }
.status-badge.processing { background: var(--border-subtle); color: var(--text-accent); }

/* Tabs */
.tab-bar { display: flex; gap: 4px; }
.tab-btn {
  padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer;
  transition: all var(--transition-fast); font-family: inherit;
}
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.is-active { color: var(--text-primary); border-bottom-color: var(--text-accent); }

.tab-content { padding: 24px 28px; }
.graph-tab { padding: 0; overflow: hidden; }

/* Blocks tab */
.blocks-summary { display: flex; gap: 20px; margin-bottom: 20px; }
.summary-stat { display: flex; flex-direction: column; align-items: center; background: var(--color-bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 14px 24px; }
.s-val { font-size: 22px; font-weight: 800; color: var(--text-primary); }
.s-lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.blocks-list { display: flex; flex-direction: column; gap: 10px; }
.block-row {
  display: flex; gap: 14px; align-items: flex-start;
  background: var(--color-bg-secondary); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg); padding: 16px;
  transition: all var(--transition-normal);
}
.block-row:hover { border-color: var(--border-accent); transform: translateX(2px); }
.block-num {
  width: 24px; height: 24px; background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
}
.block-body { flex: 1; min-width: 0; }
.block-heading { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.block-preview { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
.block-tags { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; flex-shrink: 0; }
.block-tag {
  font-size: 10px; color: var(--text-accent); background: var(--border-subtle);
  padding: 2px 7px; border-radius: var(--radius-sm); white-space: nowrap;
}

/* Tasks tab */
.tasks-list { display: flex; flex-direction: column; gap: 8px; }
.task-row {
  display: flex; align-items: center; gap: 12px;
  background: var(--color-bg-secondary); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg); padding: 14px 16px;
  transition: all var(--transition-fast);
}
.task-check {
  width: 20px; height: 20px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-strong);
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  font-size: 11px; font-weight: 700; transition: all var(--transition-fast);
}
.task-check.done { background: var(--accent-gradient); border-color: transparent; color: white; }
.task-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.task-title { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.task-title.done { text-decoration: line-through; color: var(--text-muted); }
.task-due { font-size: 11px; color: var(--text-muted); }
.task-load { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); }
.task-load.high { background: rgba(239,68,68,0.12); color: #ef4444; }
.task-load.medium { background: rgba(245,158,11,0.12); color: #f59e0b; }
.task-load.low { background: rgba(34,197,94,0.12); color: #22c55e; }

/* PDF Preview (12.5: dark-mode canvas wrapper) */
.pdf-canvas-wrapper {
  background: var(--color-oatmeal-light); border-radius: var(--radius-xl); padding: 24px;
  border: 1px solid var(--border-default); min-height: 400px;
  transition: filter var(--transition-normal), background var(--transition-normal);
}
html.dark .pdf-canvas-wrapper {
  background: var(--color-bg-primary);
  /* 12.5: invert + hue-rotate for dark-mode PDF contrast enhancement */
  filter: none;
}
.pdf-canvas-wrapper.dark-invert {
  /* When dark mode is active, boost contrast without full inversion */
  filter: brightness(0.92) contrast(1.05);
}
.pdf-page-mock { background: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
html.dark .pdf-page-mock {
  background: #3a3835;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  /* 12.5: dark-mode text rendering: lighter contrast */
  color: #e8e6e1;
  filter: contrast(0.95) brightness(1.05);
}
.pdf-mock-header { height: 20px; background: var(--accent-gradient); border-radius: 4px; margin-bottom: 20px; opacity: 0.7; }
.pdf-mock-line { height: 10px; background: #e8e6e1; border-radius: 4px; margin-bottom: 10px; }
html.dark .pdf-mock-line { background: #4a4843; }
.pdf-mock-img { height: 100px; background: linear-gradient(135deg,#f0f0f0,#e0e0e0); border-radius: 6px; margin: 16px 0; }
html.dark .pdf-mock-img { background: linear-gradient(135deg,#3a3835,#2a2926); }
.pdf-hint { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 14px; }
.markdown-preview {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 24px;
  overflow-y: auto;
  max-height: 500px;
}

.markdown-content {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.tab-btn.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tree-loading, .tree-empty {
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

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Direct upload action button on group headers */
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
.tree-group-header:hover .header-action-btn {
  opacity: 1;
}
.header-action-btn:hover {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
}
</style>
