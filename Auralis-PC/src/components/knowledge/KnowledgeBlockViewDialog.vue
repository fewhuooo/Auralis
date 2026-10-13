<template>
  <ModalShell
    :model-value="modelValue"
    size="lg"
    :title="dialogAriaLabel"
    :aria-label="dialogAriaLabel"
    @update:model-value="emit('update:modelValue', $event)"
    @close="close"
  >
    <template #title>
      <div class="kb-dialog-header-title">
        <div class="kb-dialog-icon" aria-hidden="true">
          <IconNotes :size="15" :stroke-width="2.2" />
        </div>
        <span class="kb-dialog-main-title">知识块详情</span>
        <span v-if="block?.subject" class="kb-dialog-subject-pill" :style="subjectPillStyle">
          {{ block.subject }}
        </span>
      </div>
    </template>

    <div class="kb-article-container">
      <!-- 头部元信息区块 -->
      <div class="kb-meta-card">
        <h2 class="kb-title">{{ block?.title || '未命名知识块' }}</h2>

        <div class="kb-meta-row">
          <!-- 来源文件或资料 -->
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
          <p class="kb-empty-text">该知识块暂无详细正文内容</p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="kb-footer-left">
        <button
          v-if="rawContent"
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
          v-if="block?.subjectId"
          type="button"
          class="modal-btn modal-btn-secondary kb-btn-goto"
          title="前往该学科的知识块界面"
          @click="goToSubject"
        >
          <IconExternalLink :size="14" :stroke-width="1.8" />
          <span>前往知识块界面</span>
        </button>
      </div>

      <div class="kb-footer-right">
        <button
          type="button"
          class="modal-btn modal-btn-primary"
          @click="close"
        >
          完成阅读
        </button>
      </div>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { renderMarkdown } from '@/utils/markdown'
import {
  IconNotes,
  IconFileText,
  IconHistory,
  IconCopy,
  IconCheck,
  IconExternalLink,
} from '@tabler/icons-vue'
import { ElMessage } from 'element-plus'
import ModalShell from '@/components/modal/ModalShell.vue'

interface KnowledgeBlockItem {
  id?: string
  subjectId?: string
  subject?: string
  source?: string
  title?: string
  time?: string
  content?: string
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

const router = useRouter()
const copied = ref(false)

const dialogAriaLabel = computed(() => {
  return props.block?.title ? `知识块详情：${props.block.title}` : '知识块详情'
})

const subjectPillStyle = computed(() => {
  if (!props.block?.color) return undefined
  return {
    backgroundColor: props.block.color.startsWith('#')
      ? `${props.block.color}22`
      : props.block.color,
  }
})

const rawContent = computed(() => {
  return props.block?.content || ''
})

const renderedMarkdown = computed(() => {
  return renderMarkdown(rawContent.value)
})

const formatFriendlyTime = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays} 天前`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const formatFullTime = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const close = () => {
  emit('update:modelValue', false)
}

const goToSubject = () => {
  if (!props.block?.subjectId) return
  close()
  router.push({
    path: `/subject/${encodeURIComponent(props.block.subjectId)}`,
    query: { view: 'blocks' },
  })
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
.kb-dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm, 7px);
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.16));
  color: var(--modal-accent, #76855B);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

html.dark .kb-dialog-icon {
  background: rgba(163, 177, 155, 0.18);
  color: #B4C4AA;
}

.kb-dialog-header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.kb-dialog-main-title {
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.015em;
}

html.dark .kb-dialog-main-title {
  color: var(--text-primary, #E6DFD8);
}

.kb-dialog-subject-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2.5px 10px;
  border-radius: var(--radius-full, 9999px);
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.12));
  color: var(--modal-accent, #76855B);
  border: 1px solid rgba(139, 154, 110, 0.22);
  white-space: nowrap;
  letter-spacing: 0.01em;
}

html.dark .kb-dialog-subject-pill {
  color: #B4C4AA;
  background: rgba(163, 177, 155, 0.16);
  border-color: rgba(163, 177, 155, 0.24);
}

/* 整体容器 */
.kb-article-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 顶部元信息卡片 */
.kb-meta-card {
  padding: 18px 22px;
  border-radius: 14px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s ease;
}

html.dark .kb-meta-card {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.kb-title {
  margin: 0 0 12px 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.38;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
  word-break: break-word;
}

html.dark .kb-title {
  color: var(--text-primary, #E6DFD8);
}

.kb-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
}

.kb-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  transition: all 0.2s ease;
}

html.dark .kb-meta-item {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
  color: #9E9B95;
}

.kb-meta-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary, #1C1C1A);
}

html.dark .kb-meta-item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #E6DFD8;
}

.kb-meta-source-text {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 正文卡片 */
.kb-content-card {
  padding: 20px 24px;
  border-radius: 14px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.02);
  min-height: 180px;
}

html.dark .kb-content-card {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
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
  gap: 10px;
  padding: 44px 0;
  color: var(--text-muted, #7A7A75);
}

.kb-empty-icon {
  opacity: 0.4;
  stroke: var(--modal-accent, #8B9A6E);
}

.kb-empty-text {
  margin: 0;
  font-size: 13px;
  font-style: italic;
  letter-spacing: -0.01em;
}

/* 底部操作 */
.kb-footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kb-footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.kb-btn-goto {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.kb-btn-goto svg {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.kb-btn-goto:hover svg {
  transform: translate(2px, -2px);
}

.is-success {
  color: #4E8652;
  animation: kb-pop-in 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes kb-pop-in {
  0% { transform: scale(0.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>
