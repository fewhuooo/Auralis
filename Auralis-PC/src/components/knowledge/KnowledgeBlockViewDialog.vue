<template>
  <ModalShell
    :model-value="modelValue"
    size="lg"
    :aria-label="dialogAriaLabel"
    @update:model-value="emit('update:modelValue', $event)"
    @close="close"
  >
    <template #title>
      <div class="knowledge-view-header-title">
        <div class="view-tags">
          <span class="view-subject-pill" :style="block?.color ? { borderColor: block.color } : undefined">
            {{ block?.subject || '知识要点' }}
          </span>
          <span v-if="block?.source" class="view-source-text">来源: {{ block.source }}</span>
        </div>
        <h3 class="view-main-title">{{ block?.title || '未命名知识块' }}</h3>
        <div v-if="block?.time" class="view-time-meta">
          <IconHistory class="view-time-icon" :size="13" :stroke-width="1.6" />
          <span>记于 {{ block.time }}</span>
        </div>
      </div>
    </template>

    <!-- Main Content Area -->
    <div class="knowledge-view-card">
      <div
        class="knowledge-view-markdown modal-markdown-body"
        v-html="renderedMarkdown"
      ></div>
    </div>

    <!-- Footer Actions -->
    <template #footer>
      <button
        v-if="rawContent"
        type="button"
        class="modal-btn modal-btn-secondary"
        @click="handleCopy"
      >
        <IconCopy :size="15" :stroke-width="1.8" />
        <span>{{ copied ? '已复制' : '复制内容' }}</span>
      </button>
      <div style="flex: 1"></div>
      <button
        type="button"
        class="modal-btn modal-btn-primary"
        @click="close"
      >
        确定
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { IconHistory, IconCopy } from '@tabler/icons-vue'
import { ElMessage } from 'element-plus'
import ModalShell from '@/components/modal/ModalShell.vue'

interface KnowledgeBlockItem {
  id?: string
  subject?: string
  source?: string
  title?: string
  time?: string
  content?: string
  preview?: string
  color?: string
}

const props = defineProps<{
  modelValue: boolean
  block?: KnowledgeBlockItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'copy', content: string): void
}>()

const copied = ref(false)

const dialogAriaLabel = computed(() => {
  return props.block?.title ? `知识块详情：${props.block.title}` : '知识块详情'
})

const rawContent = computed(() => {
  return props.block?.content || props.block?.preview || ''
})

const renderedMarkdown = computed(() => {
  const content = rawContent.value
  if (!content) return '<p style="color: var(--text-muted); font-style: italic;">暂无内容</p>'
  marked.setOptions({ breaks: true, gfm: true })
  return DOMPurify.sanitize(marked.parse(content) as string)
})

const close = () => {
  emit('update:modelValue', false)
}

const handleCopy = () => {
  const text = rawContent.value
  if (!text) return
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copied.value = true
      ElMessage.success('已复制知识块内容')
      setTimeout(() => { copied.value = false }, 2000)
    }).catch(() => {
      emit('copy', text)
    })
  } else {
    emit('copy', text)
  }
}
</script>

<style scoped>
.knowledge-view-header-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.view-tags {
  display: flex;
  align-items: center;
  gap: 10px;
}

.view-subject-pill {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.14);
  color: var(--color-zen-sage, #76855B);
  border: 1px solid rgba(139, 154, 110, 0.28);
}

html.dark .view-subject-pill {
  color: #B4C4AA;
  background: rgba(163, 177, 155, 0.16);
  border-color: rgba(163, 177, 155, 0.3);
}

.view-source-text {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.view-main-title {
  margin: 0;
  font-size: 18.5px;
  font-weight: 750;
  color: var(--text-primary);
  line-height: 1.35;
  letter-spacing: -0.3px;
  word-break: break-word;
}

.view-time-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.view-time-icon {
  opacity: 0.75;
}

.knowledge-view-card {
  background: var(--color-bg-primary, #ffffff);
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 16px;
  padding: 22px 24px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
}

html.dark .knowledge-view-card {
  background: rgba(255, 255, 255, 0.035);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.knowledge-view-markdown {
  color: var(--text-primary, #2d3748);
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}

.knowledge-view-markdown :deep(h1),
.knowledge-view-markdown :deep(h2),
.knowledge-view-markdown :deep(h3) {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 700;
}

.knowledge-view-markdown :deep(p) {
  margin: 0.6em 0;
}

.knowledge-view-markdown :deep(pre) {
  background: var(--bg-tertiary, #f7f9f6);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 13px;
}

html.dark .knowledge-view-markdown :deep(pre) {
  background: #141715;
}
</style>
