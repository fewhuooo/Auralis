<template>
  <ModalShell
    :model-value="modelValue"
    size="lg"
    :aria-label="dialogTitle"
    @update:model-value="handleOverlayClose"
    @close="handleClose"
  >
    <template #title>
      <div v-if="currentMode === 'view'" class="workspace-block-header-tags">
        <span class="block-subject-pill" :style="{ background: block?.color || 'var(--color-bg-tertiary, #FAF7F2)' }">
          {{ block?.subject || activeSubjectName || '知识块' }}
        </span>
        <span v-if="block?.source" class="block-source-text">来源: {{ block.source }}</span>
      </div>
      <h3 v-else class="modal-shell-title">
        {{ currentMode === 'create' ? '录入新知识块' : '编辑知识内容' }}
      </h3>
    </template>

    <!-- 浏览模式内容区 -->
    <div v-if="currentMode === 'view'" class="block-view-body">
      <div class="block-read-header">
        <h2 class="block-title">{{ block?.title || '未命名知识块' }}</h2>
        <div class="block-meta-row">
          <span v-if="block?.time" class="block-time-badge">
            <IconClock :size="13" :stroke-width="1.6" />
            <span>{{ block.time }}</span>
          </span>
          <span class="block-color-badge" :style="{ background: block?.color || 'var(--color-bg-tertiary, #FAF7F2)' }">
            {{ block?.subject || activeSubjectName || '知识块' }}
          </span>
        </div>
      </div>

      <div class="block-divider"></div>

      <div class="block-content-card">
        <div class="summary-markdown modal-markdown-body" v-html="renderedMarkdown"></div>
      </div>
    </div>

    <!-- 编辑 / 创建模式表单 -->
    <div v-else class="block-edit-body">
      <div class="modal-form-group">
        <label class="modal-form-label">
          标题 <span class="required">*</span>
        </label>
        <input
          v-model="formData.title"
          class="modal-form-input"
          placeholder="输入知识块标题"
          maxlength="120"
          autofocus
        />
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">色彩标记</label>
        <div class="color-options">
          <span
            v-for="c in colorList"
            :key="c.value"
            class="color-dot"
            :class="{ 'is-selected': formData.color === c.value }"
            :style="{ background: c.value }"
            :title="c.name"
            @click="formData.color = c.value"
          ></span>
        </div>
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">
          内容 <span class="required">*</span>
        </label>
        <textarea
          v-model="formData.preview"
          class="modal-form-textarea"
          rows="8"
          placeholder="支持 Markdown 格式..."
        ></textarea>
      </div>
    </div>

    <!-- 底部操作区 -->
    <template #footer>
      <template v-if="currentMode !== 'view'">
        <button type="button" class="modal-btn modal-btn-secondary" @click="handleCancelEdit">
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-btn-primary"
          :disabled="!formData.title.trim() || !formData.preview.trim()"
          @click="handleSave"
        >
          {{ currentMode === 'create' ? '创建' : '保存' }}
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          class="modal-btn modal-btn-danger"
          @click="handleDelete"
        >
          删除
        </button>
        <div style="flex: 1"></div>
        <div class="footer-right-actions">
          <button
            type="button"
            class="modal-btn modal-btn-secondary"
            @click="handleCopy"
          >
            复制
          </button>
          <button
            type="button"
            class="modal-btn modal-btn-secondary"
            @click="handleStartEdit"
          >
            编辑
          </button>
          <button
            type="button"
            class="modal-btn modal-btn-primary"
            @click="handleClose"
          >
            确定
          </button>
        </div>
      </template>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { IconClock } from '@tabler/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ModalShell from '@/components/modal/ModalShell.vue'

export interface KnowledgeBlockData {
  id?: string
  subject?: string
  source?: string
  title?: string
  time?: string
  content?: string
  preview?: string
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
    mode?: 'view' | 'edit' | 'create'
    block?: KnowledgeBlockData | null
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
  (e: 'save', data: { id?: string; subject: string; title: string; color: string; preview: string; source: string }): void
  (e: 'delete', id: string): void
  (e: 'copy', text: string): void
  (e: 'close'): void
}>()

const currentMode = ref<'view' | 'edit' | 'create'>(props.mode)

const colorList = computed(() => props.themeColors || DEFAULT_THEME_COLORS)

const formData = ref({
  id: '',
  subject: '',
  title: '',
  color: 'rgba(181,196,177,0.4)',
  preview: '',
  source: '手动添加'
})

watch(() => props.mode, (newMode) => {
  currentMode.value = newMode
})

watch(
  () => [props.modelValue, props.block, props.mode],
  ([visible]) => {
    if (visible) {
      currentMode.value = props.mode
      if (props.mode === 'create') {
        formData.value = {
          id: '',
          subject: props.activeSubjectName || '',
          title: '',
          color: 'rgba(181,196,177,0.4)',
          preview: '',
          source: '手动创建'
        }
      } else if (props.block) {
        formData.value = {
          id: props.block.id || '',
          subject: props.block.subject || props.activeSubjectName || '',
          title: props.block.title || '',
          color: props.block.color || 'rgba(181,196,177,0.4)',
          preview: props.block.preview || props.block.content || '',
          source: props.block.source || '手动添加'
        }
      }
    }
  },
  { immediate: true }
)

const dialogTitle = computed(() => {
  if (currentMode.value === 'create') return '录入新知识块'
  if (currentMode.value === 'edit') return '编辑知识内容'
  return props.block?.title || '知识块详情'
})

const renderedMarkdown = computed(() => {
  const text = props.block?.content || props.block?.preview || ''
  if (!text) return '<p style="color: var(--text-muted); font-style: italic;">暂无内容</p>'
  marked.setOptions({ breaks: true, gfm: true })
  return DOMPurify.sanitize(marked.parse(text) as string)
})

const handleOverlayClose = (val: boolean) => {
  if (!val) {
    handleClose()
  }
}

const handleClose = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleStartEdit = () => {
  if (props.block) {
    formData.value = {
      id: props.block.id || '',
      subject: props.block.subject || props.activeSubjectName || '',
      title: props.block.title || '',
      color: props.block.color || 'rgba(181,196,177,0.4)',
      preview: props.block.preview || props.block.content || '',
      source: props.block.source || '手动添加'
    }
  }
  currentMode.value = 'edit'
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
  if (!formData.value.title.trim() || !formData.value.preview.trim()) {
    ElMessage.warning('请填写必填项')
    return
  }
  emit('save', {
    id: formData.value.id || undefined,
    subject: formData.value.subject || props.activeSubjectName,
    title: formData.value.title.trim(),
    color: formData.value.color,
    preview: formData.value.preview.trim(),
    source: formData.value.source
  })
}

const handleDelete = () => {
  const blockId = props.block?.id
  if (!blockId) return
  ElMessageBox.confirm('确定删除该知识块吗？', '删除提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    emit('delete', blockId)
  }).catch(() => {})
}

const handleCopy = () => {
  const text = props.block?.preview || props.block?.content || ''
  if (!text) return
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      ElMessage.success('已复制到剪贴板')
    }).catch(() => {
      emit('copy', text)
    })
  } else {
    emit('copy', text)
  }
}
</script>

<style scoped>
.workspace-block-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
}

.block-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-tags {
  display: flex;
  align-items: center;
  gap: 10px;
}

.block-subject-pill {
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  border: none;
  background: rgba(110, 129, 84, 0.1);
  color: #556641;
}

html.dark .block-subject-pill {
  background: rgba(163, 177, 155, 0.14);
  color: #B4C4AA;
}

.workspace-block-header-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-view-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.block-read-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.block-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1c221d);
  line-height: 1.35;
  letter-spacing: -0.015em;
}

.block-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-time-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted, #788479);
}

.block-color-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.block-divider {
  display: none;
}

.block-content-card {
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}

html.dark .block-content-card {
  background: transparent;
  border: none;
  box-shadow: none;
}

.summary-markdown {
  color: var(--text-primary, #2A332C);
  font-size: 13.5px;
  line-height: 1.68;
}

.block-edit-body {
  display: flex;
  flex-direction: column;
}

.color-options {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--modal-bg, #FAF8F5);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
  transition: all 0.15s ease;
}

.color-dot:hover {
  transform: scale(1.15);
}

.color-dot.is-selected {
  box-shadow: 0 0 0 2px var(--modal-bg, #FAF8F5), 0 0 0 4px var(--color-zen-sage, #5b6c47);
  transform: scale(1.1);
}

.footer-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
