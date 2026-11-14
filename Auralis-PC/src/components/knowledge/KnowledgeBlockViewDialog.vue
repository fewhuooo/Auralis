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
        <span class="kb-dialog-main-title">{{ t({ 'zh-CN': '知识块详情', en: 'Knowledge block details', ja: '知識ブロックの詳細' }) }}</span>
        <span v-if="block?.subject" class="kb-dialog-subject-pill" :style="subjectPillStyle">
          {{ block.subject }}
        </span>
      </div>
    </template>

    <div class="kb-article-container">
      <!-- 头部元信息区块 -->
      <div class="kb-meta-card">
        <h2 class="kb-title">{{ block?.title || t({ 'zh-CN': '未命名知识块', en: 'Untitled knowledge block', ja: '無題の知識ブロック' }) }}</h2>

        <div class="kb-meta-row">
          <!-- 来源文件或资料 -->
          <div v-if="block?.source" class="kb-meta-item kb-meta-source" :title="t({ 'zh-CN': '来源资料：{name}', en: 'Source: {name}', ja: '資料：{name}' }, { name: block.source })">
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
          <p class="kb-empty-text">{{ t({ 'zh-CN': '该知识块暂无详细正文内容', en: 'This knowledge block has no content yet', ja: 'この知識ブロックにはまだ内容がありません' }) }}</p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="kb-footer-left">
        <button
          v-if="rawContent"
          type="button"
          class="modal-btn modal-btn-secondary"
          :title="copied ? t({ 'zh-CN': '已复制到剪贴板', en: 'Copied to clipboard', ja: 'クリップボードにコピーしました' }) : t({ 'zh-CN': '复制正文到剪贴板', en: 'Copy content to clipboard', ja: '内容をクリップボードにコピー' })"
          @click="handleCopy"
        >
          <IconCheck v-if="copied" :size="14" :stroke-width="2.2" class="is-success" />
          <IconCopy v-else :size="14" :stroke-width="1.8" />
          <span>{{ copied ? t({ 'zh-CN': '已复制', en: 'Copied', ja: 'コピーしました' }) : t({ 'zh-CN': '复制内容', en: 'Copy content', ja: '内容をコピー' }) }}</span>
        </button>

        <button
          v-if="block?.subjectId"
          type="button"
          class="modal-btn modal-btn-secondary kb-btn-goto"
          :title="t({ 'zh-CN': '前往该学科的知识块界面', en: 'Open this subject\'s knowledge blocks', ja: 'この科目の知識ブロックを開く' })"
          @click="goToSubject"
        >
          <IconExternalLink :size="14" :stroke-width="1.8" />
          <span>{{ t({ 'zh-CN': '前往知识块界面', en: 'Open knowledge blocks', ja: '知識ブロックを開く' }) }}</span>
        </button>
      </div>

      <div class="kb-footer-right">
        <button
          type="button"
          class="modal-btn modal-btn-primary"
          @click="close"
        >
          {{ t({ 'zh-CN': '完成阅读', en: 'Done reading', ja: '閉じる' }) }}
        </button>
      </div>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { locale, t } from '@/i18n'
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
  return props.block?.title ? t({ 'zh-CN': '知识块详情：{name}', en: 'Knowledge block: {name}', ja: '知識ブロック：{name}' }, { name: props.block.title }) : t({ 'zh-CN': '知识块详情', en: 'Knowledge block details', ja: '知識ブロックの詳細' })
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
  if (diffMinutes < 1) return t({ 'zh-CN': '刚刚', en: 'Just now', ja: 'たった今' })
  if (diffMinutes < 60) return t({ 'zh-CN': '{count} 分钟前', en: '{count} min ago', ja: '{count}分前' }, { count: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return t({ 'zh-CN': '{count} 小时前', en: '{count} hr ago', ja: '{count}時間前' }, { count: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return t({ 'zh-CN': '{count} 天前', en: '{count} d ago', ja: '{count}日前' }, { count: diffDays })
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(date)
}

const formatFullTime = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'long' }).format(date)
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

const handleCopy = async () => {
  const text = rawContent.value
  if (!text) return
  if (!(await copyContent(text))) {
    copied.value = false
    ElMessage.error(t({ 'zh-CN': '复制知识块内容失败，请手动复制', en: 'Could not copy. Copy the content manually.', ja: 'コピーできませんでした。手動でコピーしてください。' }))
    return
  }
  copied.value = true
  ElMessage.success(t({ 'zh-CN': '已复制知识块内容', en: 'Knowledge block copied', ja: '知識ブロックをコピーしました' }))
  setTimeout(() => { copied.value = false }, 2000)
}

const copyContent = async (text: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Try document copy when the Clipboard API rejects the write.
  }

  const previousFocus = document.activeElement
  const selection = document.getSelection()
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : []
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  try {
    field.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true })
    if (selection && ranges.length) {
      selection.removeAllRanges()
      ranges.forEach(range => selection.addRange(range))
    }
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
