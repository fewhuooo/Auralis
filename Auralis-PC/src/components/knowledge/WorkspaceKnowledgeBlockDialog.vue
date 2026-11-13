<template>
  <ModalShell
    :model-value="modelValue"
    size="lg"
    :title="dialogAriaLabel"
    :aria-label="dialogAriaLabel"
    :prevent-close="isSaving"
    @update:model-value="handleOverlayClose"
    @close="handleClose"
  >
    <template #title>
      <div v-if="currentMode === 'view'" class="kb-dialog-header-title">
        <span class="kb-dialog-main-title">知识块详情</span>
        <span v-if="displaySubject" class="kb-dialog-subject-pill" :style="subjectPillStyle">
          {{ displaySubject }}
        </span>
      </div>
      <h3 v-else class="modal-shell-title">
        {{ dialogTitle }}
      </h3>
    </template>

    <!-- 浏览模式 -->
    <div v-if="currentMode === 'view'" class="view-body kb-article-container">
      <!-- 头部元信息区块 -->
      <div class="kb-meta-card">
        <h2 class="kb-title">{{ block?.title || '未命名知识块' }}</h2>

        <div class="kb-meta-row">
          <!-- 来源资料 -->
          <div v-if="block?.source" class="kb-meta-item kb-meta-source" :title="`来源资料：${block.source}`">
            <IconFileText :size="13" :stroke-width="1.8" />
            <span class="kb-meta-source-text">{{ block.source }}</span>
          </div>

          <!-- 记录时间 -->
          <div v-if="block?.time" class="kb-meta-item kb-meta-time" :title="formatFullTime(block.time)">
            <IconHistory :size="13" :stroke-width="1.8" />
            <span>{{ formatFriendlyTime(block.time) }}</span>
          </div>
        </div>
      </div>

      <!-- 正文内容区 -->
      <div class="kb-content-card">
        <div v-if="rawContent" class="kb-markdown-content modal-markdown-body" v-html="renderedMarkdown"></div>
        <div v-else class="kb-empty-content">
          <IconFileText :size="32" :stroke-width="1.4" class="kb-empty-icon" />
          <p class="kb-empty-text">该知识块暂无详细内容</p>
        </div>
      </div>
      <div v-if="remoteConflict" class="kb-content-card">
        <p v-if="remoteConflict.deletedAt" role="status">云端已删除该知识块。本机修改仍可复制。</p>
        <template v-else>
          <h3>云端版本</h3>
          <p>{{ remoteConflict.title }}</p>
          <div class="kb-markdown-content modal-markdown-body" v-html="renderMarkdown(remoteConflict.content || '')"></div>
          <p role="status">上方的本机修改未同步。请选择要保留的版本。</p>
        </template>
      </div>
    </div>

    <!-- 编辑/创建模式 -->
    <div v-else class="edit-body">
      <div v-if="currentMode === 'edit' && editWarning" class="modal-form-group">
        <p role="alert">{{ editWarning }}</p>
        <details v-if="canReviewLatest && block">
          <summary>查看最新版本</summary>
          <p>{{ block.title }}</p>
          <div class="kb-markdown-content modal-markdown-body" v-html="renderMarkdown(block.content || '')"></div>
          <button type="button" class="modal-btn modal-btn-secondary" :disabled="isSaving" @click="emit('review-latest')">
            保留草稿并以最新版本继续编辑
          </button>
        </details>
      </div>
      <div class="modal-form-group">
        <label class="modal-form-label">
          标题 <span class="required">*</span>
        </label>
        <input
          v-model="formData.title"
          :readonly="isSaving"
          class="modal-form-input"
          placeholder="输入知识块标题"
          maxlength="120"
          autofocus
        />
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">颜色标记</label>
        <div class="color-row">
          <span
            v-for="c in colorList"
            :key="c.value"
            class="color-dot"
            :class="{ 'is-selected': formData.color === c.value }"
            :style="{ background: c.value }"
            :title="c.name"
            @click="!isSaving && (formData.color = c.value)"
          ></span>
        </div>
      </div>

      <div class="modal-form-group" style="flex: 1;">
        <div class="editor-label-row">
          <label class="modal-form-label">
            知识内容 <span class="required">*</span>
          </label>
          <div class="render-toggle-group">
            <button
              type="button"
              class="render-toggle-btn"
              :class="{ 'is-active': !isRenderView }"
              @click="isRenderView = false"
            >
              编写
            </button>
            <button
              type="button"
              class="render-toggle-btn"
              :class="{ 'is-active': isRenderView }"
              @click="isRenderView = true"
            >
              实时预览
            </button>
          </div>
        </div>
        <template v-if="isRenderView">
          <div
            v-if="renderedContentHtml"
            class="edit-rendered-card modal-markdown-body"
            v-html="renderedContentHtml"
          ></div>
          <div v-else class="edit-rendered-card empty-render-tip">
            在此实时渲染 Markdown 排版与 LaTeX 数学公式...
          </div>
        </template>
        <textarea
          v-else
          v-model="formData.content"
          :readonly="isSaving"
          class="modal-form-textarea"
          rows="12"
          placeholder="在此编写详细知识点内容，支持 Markdown 语法与 LaTeX 数学公式（如 $E=mc^2$ 或 $$公式$$）..."
        ></textarea>
      </div>
    </div>

    <template #footer>
      <template v-if="currentMode !== 'view'">
        <button type="button" class="modal-btn modal-btn-secondary" :disabled="isSaving" @click="handleCancelEdit">
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-btn-primary"
          :disabled="isSaving || Boolean(editWarning) || !formData.title.trim() || !formData.content.trim()"
          @click="handleSave"
        >
          {{ isSaving ? '保存中…' : currentMode === 'create' ? '创建' : '保存' }}
        </button>
      </template>
      <template v-else>
        <div class="footer-actions-between">
          <div class="footer-left-actions">
            <button
              type="button"
              class="modal-btn modal-btn-secondary"
              :title="copied ? '已复制到剪贴板' : '复制正文到剪贴板'"
              @click="handleCopy"
            >
              <IconCheck v-if="copied" :size="14" :stroke-width="2.2" class="is-success" />
              <IconCopy v-else :size="14" :stroke-width="1.8" />
              <span>{{ copied ? '已复制' : '复制内容' }}</span>
            </button>
            <button
              type="button"
              class="modal-btn modal-btn-ghost-danger"
              @click="handleDelete"
            >
              <IconTrash :size="14" :stroke-width="1.8" />
              <span>删除</span>
            </button>
          </div>
          <div class="footer-right-actions">
            <template v-if="remoteConflict">
              <button type="button" class="modal-btn modal-btn-secondary" :disabled="isSaving" @click="emit('resolve-conflict', 'REMOTE')">
                采用云端版本
              </button>
              <button v-if="!remoteConflict.deletedAt" type="button" class="modal-btn modal-btn-primary" :disabled="isSaving" @click="emit('resolve-conflict', 'RETRY')">
                保留本机修改并重试
              </button>
            </template>
            <button
              v-else
              type="button"
              class="modal-btn modal-btn-secondary"
              @click="handleStartEdit"
            >
              <IconEdit :size="14" :stroke-width="1.8" />
              <span>编辑</span>
            </button>
            <button
              type="button"
              class="modal-btn modal-btn-primary"
              :disabled="isSaving"
              @click="handleClose"
            >
              确定
            </button>
          </div>
        </div>
      </template>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import {
  IconFileText,
  IconHistory,
  IconCopy,
  IconCheck,
  IconTrash,
  IconEdit
} from '@tabler/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ModalShell from '@/components/modal/ModalShell.vue'

export interface KnowledgeBlockData {
  id?: string
  version?: number
  deletedAt?: string | null
  subjectId?: string
  subject?: string
  source?: string
  title?: string
  time?: string
  content?: string
  color?: string
}

const DEFAULT_THEME_COLORS = [
  { name: '绿', value: 'rgba(181,196,177,0.4)' },
  { name: '沙', value: 'rgba(217,197,178,0.4)' },
  { name: '粉', value: 'rgba(212,163,163,0.4)' },
  { name: '蓝', value: 'rgba(179,192,207,0.4)' },
  { name: '黄', value: 'rgba(230,223,216,0.5)' }
]

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    isSaving?: boolean
    editWarning?: string
    canReviewLatest?: boolean
    remoteConflict?: KnowledgeBlockData
    mode?: 'view' | 'edit' | 'create'
    block?: KnowledgeBlockData | null
    editBaseline?: KnowledgeBlockData | null
    activeSubjectName?: string
    themeColors?: Array<{ name: string; value: string }>
  }>(),
  {
    mode: 'view',
    block: null,
    activeSubjectName: '',
    themeColors: () => [
      { name: '绿', value: 'rgba(181,196,177,0.4)' },
      { name: '沙', value: 'rgba(217,197,178,0.4)' },
      { name: '粉', value: 'rgba(212,163,163,0.4)' },
      { name: '蓝', value: 'rgba(179,192,207,0.4)' },
      { name: '黄', value: 'rgba(230,223,216,0.5)' }
    ]
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:mode', mode: 'view' | 'edit' | 'create'): void
  (e: 'save', data: {
    id?: string
    subjectId?: string
    subject: string
    title: string
    color: string
    content: string
    source: string
  }): void
  (e: 'delete', id: string, version: number): void
  (e: 'review-latest'): void
  (e: 'resolve-conflict', action: 'REMOTE' | 'RETRY'): void
  (e: 'copy', text: string): void
  (e: 'close'): void
}>()

const currentMode = ref<'view' | 'edit' | 'create'>(props.mode)

const colorList = computed(() => props.themeColors || DEFAULT_THEME_COLORS)

const formData = ref({
  id: '',
  subjectId: '',
  subject: '',
  title: '',
  color: 'rgba(181,196,177,0.4)',
  content: '',
  source: '手动添加'
})

watch(
  [() => props.modelValue, () => props.mode],
  ([visible]) => {
    if (visible) {
      currentMode.value = props.mode
      if (props.mode === 'create') {
        formData.value = {
          id: '',
          subjectId: '',
          subject: props.activeSubjectName || '',
          title: '',
          color: 'rgba(181,196,177,0.4)',
          content: '',
          source: '手动创建'
        }
      } else if (props.mode === 'edit' && props.editBaseline) {
        const baseline = props.editBaseline
        formData.value = {
          id: baseline.id || '',
          subjectId: baseline.subjectId || '',
          subject: baseline.subject || props.activeSubjectName || '',
          title: baseline.title || '',
          color: baseline.color || 'rgba(181,196,177,0.4)',
          content: baseline.content || '',
          source: baseline.source || '手动添加'
        }
      }
    } else {
      currentMode.value = 'view'
    }
  },
  { immediate: true }
)

watch(() => props.editBaseline, (current, previous) => {
  if (currentMode.value !== 'edit' || !current || !previous || current.id !== previous.id) return
  const draft = formData.value
  if (draft.title === (previous.title || '')) draft.title = current.title || ''
  if (draft.content === (previous.content || '')) draft.content = current.content || ''
  const defaultColor = 'rgba(181,196,177,0.4)'
  if (draft.color === (previous.color || defaultColor)) draft.color = current.color || defaultColor
})

const isRenderView = ref(false)

const dialogTitle = computed(() => {
  if (currentMode.value === 'create') return '录入新知识块'
  if (currentMode.value === 'edit') return '编辑知识内容'
  return '知识块详情'
})

const dialogAriaLabel = computed(() => {
  if (currentMode.value === 'create') return '录入新知识块'
  if (currentMode.value === 'edit') return '编辑知识内容'
  return props.block?.title ? `知识块详情：${props.block.title}` : '知识块详情'
})

const displaySubject = computed(() => {
  return props.block?.subject || props.activeSubjectName || ''
})

const subjectPillStyle = computed(() => {
  if (!props.block?.color) return undefined
  return {
    backgroundColor: props.block.color.startsWith('#')
      ? `${props.block.color}22`
      : props.block.color,
  }
})

const renderedMarkdown = computed(() => {
  const text = props.block?.content || ''
  if (!text) return '<p style="color: var(--text-muted); font-style: italic;">暂无内容</p>'
  return renderMarkdown(text)
})

const renderedContentHtml = computed(() => {
  const text = formData.value.content || ''
  if (!text.trim()) return ''
  return renderMarkdown(text)
})

const handleOverlayClose = (val: boolean) => {
  if (!val) {
    handleClose()
  }
}

const handleClose = () => {
  currentMode.value = 'view'
  emit('update:mode', 'view')
  emit('update:modelValue', false)
  emit('close')
}

const handleStartEdit = () => {
  emit('update:mode', 'edit')
}

const handleCancelEdit = () => {
  if (currentMode.value === 'create') {
    handleClose()
  } else {
    currentMode.value = 'view'
    emit('update:mode', 'view')
  }
}

const handleSave = () => {
  if (props.isSaving || props.editWarning) return
  if (!formData.value.title.trim() || !formData.value.content.trim()) {
    ElMessage.warning('请填写标题与正文内容')
    return
  }
  const content = formData.value.content.trim()
  emit('save', {
    id: formData.value.id || undefined,
    subjectId: formData.value.subjectId,
    subject: formData.value.subject || props.activeSubjectName || '',
    title: formData.value.title.trim(),
    color: formData.value.color,
    content,
    source: formData.value.source
  })
}

const copied = ref(false)

const rawContent = computed(() => {
  return props.block?.content || ''
})

const formatFriendlyTime = (timeStr?: string): string => {
  if (!timeStr) return '刚刚'
  try {
    const d = new Date(timeStr)
    if (isNaN(d.getTime())) return timeStr
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return timeStr
  }
}

const formatFullTime = (timeStr?: string): string => {
  if (!timeStr) return ''
  try {
    const d = new Date(timeStr)
    return isNaN(d.getTime()) ? timeStr : d.toLocaleString()
  } catch {
    return timeStr
  }
}

const handleDelete = () => {
  const blockId = props.block?.id
  const version = props.block?.version
  if (!blockId || version === undefined) return
  ElMessageBox.confirm('确定删除该知识块吗？', '删除提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    emit('delete', blockId, version)
  }).catch(() => {})
}

const handleCopy = () => {
  const text = rawContent.value
  if (!text) return
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copied.value = true
      ElMessage.success('已复制到剪贴板')
      setTimeout(() => {
        copied.value = false
      }, 2000)
    }).catch(() => {
      emit('copy', text)
    })
  } else {
    emit('copy', text)
  }
}
</script>

<style scoped>
.kb-dialog-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(139, 154, 110, 0.16) 0%, rgba(118, 133, 91, 0.24) 100%);
  color: var(--modal-accent, #76855B);
  flex-shrink: 0;
}

.kb-dialog-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.kb-dialog-main-title {
  font-size: 15px;
  font-weight: 650;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.01em;
}

html.dark .kb-dialog-main-title {
  color: var(--text-primary, #E6DFD8);
}

.kb-dialog-subject-pill {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 9999px;
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.12));
  color: var(--modal-accent, #76855B);
  border: 1px solid rgba(139, 154, 110, 0.22);
}

html.dark .kb-dialog-subject-pill {
  border-color: rgba(163, 177, 155, 0.25);
  color: #B4C4AA;
}

/* View mode */
/* View mode: Magazine-level Article Layout */
.kb-article-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kb-meta-card {
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

html.dark .kb-meta-card {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
}

.kb-title {
  margin: 0 0 10px 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.015em;
  word-break: break-word;
}

html.dark .kb-title {
  color: var(--text-primary, #E6DFD8);
}

.kb-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
}

.kb-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.kb-meta-source-text {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}



/* 正文内容独立纸张卡片 */
.kb-content-card {
  padding: 20px 22px;
  border-radius: 12px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  min-height: 180px;
}

html.dark .kb-content-card {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
}

.kb-markdown-content {
  font-size: 14px;
  line-height: 1.76;
  color: var(--text-primary, #1C1C1A);
  word-break: break-word;
}

html.dark .kb-markdown-content {
  color: var(--text-primary, #E6DFD8);
}

.kb-empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 42px 0;
  color: var(--text-muted, #7A7A75);
}

.kb-empty-icon {
  opacity: 0.45;
}

.kb-empty-text {
  margin: 0;
  font-size: 13px;
  font-style: italic;
}

.is-success {
  color: #2e7d32;
}

/* Edit mode */
.edit-body {
  display: flex;
  flex-direction: column;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 0;
}

.color-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  border: 2.5px solid var(--modal-bg, #F7F2EB);
  box-shadow: 0 0 0 1px var(--border-default, rgba(0, 0, 0, 0.10));
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.color-dot:hover {
  transform: scale(1.18);
}

.color-dot.is-selected {
  box-shadow: 0 0 0 2px var(--modal-bg, #F7F2EB), 0 0 0 4.5px var(--modal-accent, #8B9A6E);
  transform: scale(1.15);
}

.footer-actions-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.footer-left-actions,
.footer-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-btn-ghost-danger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  color: #C05646;
  border: 1px solid rgba(192, 86, 70, 0.25);
  border-radius: 9999px;
  padding: 0 14px;
  height: 38px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-btn-ghost-danger:hover {
  background: rgba(192, 86, 70, 0.08);
  border-color: rgba(192, 86, 70, 0.4);
  color: #a84334;
}

/* Editor Render Toggle */
.editor-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.editor-label-row .modal-form-label {
  margin-bottom: 0;
}

.render-toggle-group {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 9999px;
  padding: 2px;
  gap: 2px;
}

html.dark .render-toggle-group {
  background: rgba(255, 255, 255, 0.08);
}

.render-toggle-btn {
  padding: 3px 10px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--text-muted, #7A7A75);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.render-toggle-btn:hover {
  color: var(--text-primary, #1C1C1A);
}

.render-toggle-btn.is-active {
  background: var(--modal-bg, #F7F2EB);
  color: var(--color-zen-sage, #8B9A6E);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

html.dark .render-toggle-btn.is-active {
  background: #242924;
  color: #a3b386;
}

.edit-rendered-card {
  min-height: 240px;
  padding: 14px 16px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  border-radius: var(--radius-md, 10px);
}

html.dark .edit-rendered-card {
  background: #181D18;
  border-color: rgba(255, 255, 255, 0.08);
}

.empty-render-tip {
  color: var(--text-muted, #7A7A75);
  font-style: italic;
  font-size: 13.5px;
  margin: 0;
}
</style>
