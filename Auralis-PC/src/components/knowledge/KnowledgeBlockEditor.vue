<template>
  <ModalShell
    :model-value="modelValue"
    title="保存为知识块"
    aria-label="保存为知识块"
    size="md"
    custom-class="knowledge-editor-modal"
    :prevent-close="isSaving"
    @update:model-value="handleModelValueUpdate"
    @close="$emit('cancel')"
  >
    <form id="knowledge-editor-form" class="knowledge-editor-body" @submit.prevent="submit">
      <div class="modal-form-group">
        <label class="modal-form-label">标题 <span class="required">*</span></label>
        <input
          ref="titleInputRef"
          v-model="title"
          class="modal-form-input"
          maxlength="120"
          placeholder="例如：牛顿第二定律"
          autofocus
        />
      </div>

      <div class="modal-form-group">
        <div class="editor-label-row">
          <label class="modal-form-label">内容 <span class="required">*</span></label>
          <div class="preview-toggle-group">
            <button
              type="button"
              class="preview-toggle-btn"
              :class="{ 'is-active': !isPreviewMode }"
              @click="isPreviewMode = false"
            >
              编写
            </button>
            <button
              type="button"
              class="preview-toggle-btn"
              :class="{ 'is-active': isPreviewMode }"
              @click="isPreviewMode = true"
            >
              实时预览
            </button>
          </div>
        </div>
        <template v-if="isPreviewMode">
          <div
            v-if="renderedPreview"
            class="edit-preview-card modal-markdown-body"
            v-html="renderedPreview"
          ></div>
          <div v-else class="edit-preview-card empty-preview-tip">
            在此实时预览 Markdown 排版与 LaTeX 数学公式...
          </div>
        </template>
        <textarea
          v-else
          v-model="content"
          class="modal-form-textarea"
          rows="8"
          maxlength="10000"
          placeholder="输入知识块的核心概念、解析或笔记（支持 Markdown 语法与 LaTeX 数学公式）..."
        ></textarea>
      </div>
    </form>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" :disabled="isSaving" @click="$emit('cancel')">取消</button>
      <button
        type="submit"
        form="knowledge-editor-form"
        class="modal-btn modal-btn-primary"
        :disabled="!isSubmitEnabled"
      >
        {{ isSaving ? '保存中…' : '保存' }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import ModalShell from '@/components/modal/ModalShell.vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  modelValue: boolean
  initialContent: string
  isSaving?: boolean
}>()

const emit = defineEmits<{
  (event: 'cancel'): void
  (event: 'save', value: { title: string; content: string }): void
}>()

const titleInputRef = ref<HTMLInputElement | null>(null)
const title = ref('')
const content = ref(props.initialContent)
const isPreviewMode = ref(false)

const isSubmitEnabled = computed(() => {
  return !props.isSaving && title.value.trim().length > 0 && content.value.trim().length > 0
})

const renderedPreview = computed(() => {
  const text = content.value.trim()
  if (!text) return ''
  return renderMarkdown(text)
})

const handleModelValueUpdate = (visible: boolean) => {
  if (!visible) {
    emit('cancel')
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      title.value = ''
      content.value = props.initialContent || ''
      isPreviewMode.value = false
      nextTick(() => {
        titleInputRef.value?.focus()
      })
    }
  }
)

const submit = () => {
  if (!isSubmitEnabled.value) return
  emit('save', {
    title: title.value.trim(),
    content: content.value.trim()
  })
}
</script>

<style scoped>
.knowledge-editor-body {
  display: flex;
  flex-direction: column;
}

.editor-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.editor-label-row .modal-form-label {
  margin-bottom: 0;
}

.preview-toggle-group {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 9999px;
  padding: 2px;
  gap: 2px;
}

html.dark .preview-toggle-group {
  background: rgba(255, 255, 255, 0.08);
}

.preview-toggle-btn {
  padding: 2px 8px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--text-muted, #7A7A75);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.preview-toggle-btn:hover {
  color: var(--text-primary, #1C1C1A);
}

.preview-toggle-btn.is-active {
  background: var(--modal-bg, #F7F2EB);
  color: var(--color-zen-sage, #8B9A6E);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

html.dark .preview-toggle-btn.is-active {
  background: #242924;
  color: #a3b386;
}

.edit-preview-card {
  min-height: 180px;
  max-height: 280px;
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  border-radius: var(--radius-md, 10px);
}

html.dark .edit-preview-card {
  background: #181D18;
  border-color: rgba(255, 255, 255, 0.08);
}

.empty-preview-tip {
  color: var(--text-muted, #7A7A75);
  font-style: italic;
  font-size: 13px;
  margin: 0;
}
</style>
