<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import ChatActivityCard from '@/components/chat/ChatActivityCard.vue'
import ChatContentBlock from '@/components/chat/ChatContentBlock.vue'
import { createChatContentProjectionState, getChatActivityDraft, projectChatContentParts, updateChatActivityDraft } from '@/services/chatContentProjection'
import { createSmoothStreamBuffer, type SmoothStreamController } from '@/services/smoothStreamBuffer'
import { useChatStore } from '@/store/useChatStore'
import { renderMarkdown } from '@/utils/markdown'
import type { ChatActivityAnswer, ChatActivityDraft, ChatContentPart, ChatContentProjectionState } from '@/types/chatContent'

const props = withDefaults(defineProps<{
  parts: readonly ChatContentPart[]
  streaming?: boolean
  busy?: boolean
  readOnly?: boolean
}>(), { streaming: false, busy: false, readOnly: false })

const emit = defineEmits<{
  draftChange: [componentId: string, draft: ChatActivityDraft]
  submit: [questionId: string, answer: ChatActivityAnswer]
}>()

const chatStore = useChatStore()
const projection = reactive<ChatContentProjectionState>(createChatContentProjectionState())

// 弹簧阻尼蓄洪池：正文流式匀速推进，消峰填谷，彻底杜绝吐字过快与网络停顿导致的一顿一顿
const smoothedActiveText = ref('')
const isTextStreamingActive = ref(false)
const currentStreamingTextId = ref<string | null>(null)
let smoothBuffer: SmoothStreamController | null = null

smoothBuffer = createSmoothStreamBuffer(
  (text) => {
    smoothedActiveText.value = text
  },
  {
    minSpeed: 18, // 蓄水池偏低时的保底拉伸速度（约 55ms/字），以时间换空间跨越网络空窗
    baseSpeed: 28, // 黄金阅读巡航速度（约 35ms/字），极度连贯自然的打字节奏
    maxSpeed: 70, // 最大消峰追赶上限，杜绝文字瞬闪
    finishSpeed: 48, // 结束收尾平稳过渡
    onComplete: () => {
      isTextStreamingActive.value = false
    },
  },
)

onBeforeUnmount(() => {
  smoothBuffer?.destroy()
  smoothBuffer = null
})

watch(() => props.parts, (parts) => {
  projection.parts = projectChatContentParts(parts)
  const lastIndex = projection.parts.length - 1
  const lastPart = projection.parts[lastIndex]

  if (props.streaming && lastPart && lastPart.kind === 'text') {
    // 文本 -> 块 -> 文本交错防御：切换到新文本段前先 flush 前序缓冲，并为新文本段重设蓄洪池
    if (currentStreamingTextId.value !== lastPart.id) {
      if (isTextStreamingActive.value) {
        smoothBuffer?.flush()
      }
      currentStreamingTextId.value = lastPart.id
      smoothBuffer?.reset()
    }
    isTextStreamingActive.value = true
    smoothBuffer?.push(lastPart.text)
  } else if (!props.streaming && lastPart && lastPart.kind === 'text') {
    currentStreamingTextId.value = null
    if (isTextStreamingActive.value) {
      smoothBuffer?.finish(lastPart.text)
    } else {
      smoothBuffer?.reset()
      smoothedActiveText.value = lastPart.text
    }
  } else {
    // 末尾非文本（例如推入结构化块或无内容）：先 flush 前序文本确保全部内容平稳落定
    currentStreamingTextId.value = null
    if (isTextStreamingActive.value) {
      smoothBuffer?.flush()
    } else {
      smoothBuffer?.reset()
    }
    isTextStreamingActive.value = false
    smoothedActiveText.value = ''
  }
}, { immediate: true, deep: true })

watch(() => props.streaming, (isStreaming) => {
  const lastIndex = projection.parts.length - 1
  const lastPart = projection.parts[lastIndex]
  if (!isStreaming && lastPart && lastPart.kind === 'text') {
    smoothBuffer?.finish(lastPart.text)
  }
})

function isPartActivelyStreaming(index: number): boolean {
  return index === projection.parts.length - 1 && (props.streaming || isTextStreamingActive.value)
}

function getRenderedText(part: Extract<ChatContentPart, { kind: 'text' }>, index: number): string {
  // 只要平滑蓄洪池仍在舒缓吐字，且是当前活跃追踪的末尾文本块，就展示平滑推进中的文本，避免收尾瞬间突跳
  if (isTextStreamingActive.value && index === projection.parts.length - 1 && currentStreamingTextId.value === part.id) {
    return smoothedActiveText.value
  }
  return part.text
}

function draftFor(part: Extract<ChatContentPart, { kind: 'block' }>): ChatActivityDraft {
  const storeDraft = chatStore.activityDrafts[part.componentId]
  if (storeDraft !== undefined) {
    return storeDraft
  }
  return getChatActivityDraft(projection, part)
}

function onDraftChange(componentId: string, draft: ChatActivityDraft): void {
  const updated = updateChatActivityDraft(projection, componentId, draft)
  projection.drafts = updated.drafts
  chatStore.setActivityDraft(componentId, draft)
  emit('draftChange', componentId, draft)
}

function onSubmit(questionId: string, answer: ChatActivityAnswer): void {
  emit('submit', questionId, answer)
}
</script>

<template>
  <div class="chat-content-renderer">
    <!-- 块级 AST 冻结：通过 v-memo 隔离历史已完成块，仅活跃的末尾块进行响应式重绘 -->
    <template v-for="(part, index) in projection.parts" :key="part.kind === 'block' ? part.componentId : part.id">
      <div
        v-if="part.kind === 'text'"
        class="chat-content-renderer__text"
        :class="{ 'is-streaming-active': isPartActivelyStreaming(index) }"
        v-memo="[part.id, getRenderedText(part, index), isPartActivelyStreaming(index)]"
        v-html="renderMarkdown(getRenderedText(part, index), isPartActivelyStreaming(index))"
      />
      <ChatContentBlock
        v-else-if="part.component === 'steps' || part.component === 'compare' || part.component === 'roadmap' || part.component === 'chart'"
        :block="part"
        :streaming="streaming"
        :busy="busy"
      />
      <ChatActivityCard
        v-else
        :block="part"
        :draft="draftFor(part)"
        :busy="busy"
        :read-only="readOnly"
        @draft-change="onDraftChange"
        @submit="onSubmit"
      />
    </template>
  </div>
</template>

<style scoped>
.chat-content-renderer {
  min-width: 0;
  color: var(--text-primary);
  font-family: var(--font-family-base);
}

.chat-content-renderer__text {
  overflow-wrap: anywhere;
  font-size: 14.5px;
  line-height: 1.78;
}

/* 让正在流式生长的最后一个段落/列表项保持轻微的柔和过渡 (方案 B) */
.chat-content-renderer__text.is-streaming-active > :deep(*:last-child) {
  transition: opacity 0.15s ease-out;
}

/* 末尾 Token 水墨渐显过渡态 */
.chat-content-renderer__text :deep(.token-fade) {
  display: inline;
  animation: token-fade-in 180ms cubic-bezier(0.2, 0, 0.2, 1) forwards;
}

@keyframes token-fade-in {
  0% {
    opacity: 0.2;
    filter: blur(1.5px);
  }
  100% {
    opacity: 1;
    filter: blur(0);
  }
}

.chat-content-renderer__text :deep(p) {
  margin: 0 0 10px;
}

.chat-content-renderer__text :deep(p:last-child) {
  margin-bottom: 0;
}

.chat-content-renderer__text :deep(pre) {
  overflow: auto;
  max-width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-subtle, #e0deda);
  border-radius: 10px;
  background: var(--color-bg-card, #ffffff);
  color: var(--text-primary);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  line-height: 1.55;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.chat-content-renderer__text :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: inherit;
  font-family: inherit;
}

.chat-content-renderer__text :deep(code) {
  font-family: var(--font-family-mono);
  font-size: 0.92em;
}

.chat-content-renderer__text :deep(blockquote) {
  margin: 10px 0;
  padding: 2px 0 2px 13px;
  border-left: 2px solid var(--color-zen-sage);
  color: var(--text-muted);
}

.chat-content-renderer__text :deep(a) {
  color: var(--color-sage-dark);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Markdown Table 现代优雅排版 (Bento 风格卡片式表格) */
.chat-content-renderer__text :deep(table) {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 14px 0 16px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 24%, var(--border-default, #e5e0d8));
  background: var(--color-bg-card, #ffffff);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 6%, transparent), 0 1px 3px rgba(0, 0, 0, 0.02);
  display: table;
  font-size: 13.5px;
  line-height: 1.6;
}

.chat-content-renderer__text :deep(thead) {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, var(--color-bg-primary, #f5f1eb));
}

.chat-content-renderer__text :deep(th) {
  padding: 10px 16px;
  color: var(--color-sage-dark, #5c6b44);
  font-weight: 650;
  font-size: 13px;
  letter-spacing: -0.01em;
  text-align: left;
  border-bottom: 1.5px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 26%, var(--border-subtle, #e0deda));
  border-right: 1px solid color-mix(in srgb, var(--border-subtle, #e0deda) 60%, transparent);
}

.chat-content-renderer__text :deep(th:last-child) {
  border-right: none;
}

.chat-content-renderer__text :deep(td) {
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle, #e0deda) 65%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--border-subtle, #e0deda) 40%, transparent);
  color: var(--text-primary);
  vertical-align: top;
  font-size: 13.5px;
}

.chat-content-renderer__text :deep(td:last-child) {
  border-right: none;
}

.chat-content-renderer__text :deep(tr:last-child td) {
  border-bottom: none;
}

.chat-content-renderer__text :deep(tbody tr) {
  transition: background 0.15s ease;
}

.chat-content-renderer__text :deep(tbody tr:nth-child(even)) {
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 35%, var(--color-bg-card, #ffffff));
}

.chat-content-renderer__text :deep(tbody tr:hover) {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 9%, var(--color-bg-card, #ffffff));
}

/* 暗色模式适配 */
html.dark .chat-content-renderer__text :deep(table) {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

html.dark .chat-content-renderer__text :deep(thead) {
  background: rgba(139, 154, 110, 0.16);
}

html.dark .chat-content-renderer__text :deep(th) {
  color: #A3B899;
  border-bottom-color: rgba(139, 154, 110, 0.28);
  border-right-color: rgba(255, 255, 255, 0.08);
}

html.dark .chat-content-renderer__text :deep(td) {
  border-bottom-color: rgba(255, 255, 255, 0.08);
  border-right-color: rgba(255, 255, 255, 0.06);
}

html.dark .chat-content-renderer__text :deep(tbody tr:nth-child(even)) {
  background: rgba(255, 255, 255, 0.02);
}

html.dark .chat-content-renderer__text :deep(tbody tr:hover) {
  background: rgba(139, 154, 110, 0.12);
}

.chat-content-renderer__text :deep(.katex-display-wrapper) {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

/* 8px 橄榄绿半透明柔和跟随圆点 */
.chat-content-renderer__text :deep(.stream-cursor-dot) {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 5px;
  border-radius: 50%;
  vertical-align: -0.5px;
  background-color: rgba(110, 127, 80, 0.78);
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.16);
  animation: stream-dot-pulse 1.2s ease-in-out infinite;
}

@keyframes stream-dot-pulse {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.55;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.95;
  }
}

/* 跨行表格与块级公式（$$...$$ / \[...\]）闭合前等高稳定草稿容器 */
.chat-content-renderer__text :deep(.streaming-block-draft) {
  min-height: 76px;
  margin: 12px 0;
  padding: 10px 14px;
  border-radius: 10px;
  background-color: #F4EFE6;
  border: 1px solid #EAE6DD;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-content-renderer__text :deep(.streaming-block-draft__label) {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-sage-dark, #5C6B44);
  letter-spacing: 0.01em;
}

.chat-content-renderer__text :deep(.streaming-block-draft__raw) {
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-family: var(--font-family-mono, monospace);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted, #6F6E69);
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
}

html.dark .chat-content-renderer__text :deep(.streaming-block-draft) {
  background-color: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
}

html.dark .chat-content-renderer__text :deep(.streaming-block-draft__label) {
  color: #A3B899;
}

html.dark .chat-content-renderer__text :deep(.streaming-block-draft__raw) {
  color: rgba(235, 232, 224, 0.72);
}

/* LaTeX 流式未闭合时的柔和降级胶囊 */
.chat-content-renderer__text :deep(.katex-streaming-pill),
.chat-content-renderer__text :deep(.katex-streaming-inline-pill) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  margin: 2px 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 10%, var(--color-bg-primary, #f5f1eb));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 24%, transparent);
  color: var(--color-sage-dark, #5c6b44);
  font-size: 11px;
  font-family: var(--font-family-mono, monospace);
  animation: math-pill-breathe 2s infinite ease-in-out;
}

.chat-content-renderer__text :deep(.math-pill-icon) {
  font-weight: 700;
  font-size: 12px;
}

.chat-content-renderer__text :deep(.math-pill-text) {
  letter-spacing: -0.01em;
}

@keyframes math-pill-breathe {
  0%, 100% { opacity: 0.75; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .chat-content-renderer__text.is-streaming-active,
  .chat-content-renderer__text :deep(.stream-cursor-dot),
  .chat-content-renderer__text :deep(.katex-streaming-pill) {
    animation: none;
  }
}
</style>
