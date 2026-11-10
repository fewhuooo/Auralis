<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createSmoothStreamBuffer, type SmoothStreamController } from '@/services/smoothStreamBuffer'
import { renderMarkdown } from '@/utils/markdown'
import type { ChatToolActivity } from '@/services/aiStreamReducer'

const props = withDefaults(defineProps<{
  reasoning?: string
  tools?: readonly ChatToolActivity[]
  streaming?: boolean
  hasContent?: boolean
}>(), {
  reasoning: '',
  tools: () => [],
  streaming: false,
  hasContent: false,
})

const emit = defineEmits<{
  complete: []
}>()

// 展开状态：流式生成中默认自动展开；正文输出完/非流式自动收起回胶囊
const isOpen = ref(false)
// 用户是否主动手动干预过展开/收起
const userManuallyToggled = ref(false)

// 初始判定：挂载时若正处于流式生成中，默认自动展开
if (props.streaming) {
  isOpen.value = true
}

// 针对思考链文本的平滑蓄水池缓冲：减缓思考链推流节奏，打造自然沉浸的“深度推理中”节奏感
const smoothedReasoning = ref('')
let reasoningBuffer: SmoothStreamController | null = null
let hasEmittedComplete = false

// 最低展示时长的温和流光保持期：当模型极快出字或思考过短时，若有思考过程则至少优雅展示 1.2 秒以上
const minimumThinkingActive = ref(false)
let minThinkingTimer: ReturnType<typeof setTimeout> | null = null

function triggerMinThinkingWindow() {
  if (minThinkingTimer || !props.streaming || props.hasContent) return
  const hasAnyReasoning = Boolean(props.reasoning && props.reasoning.trim())
  const hasAnyTools = Boolean(props.tools && props.tools.length > 0)
  if (hasAnyReasoning || hasAnyTools) {
    minimumThinkingActive.value = true
    minThinkingTimer = setTimeout(() => {
      minimumThinkingActive.value = false
      minThinkingTimer = null
      checkAndEmitComplete()
    }, 1200) // 1.2s 视觉柔性停留
  }
}

function checkAndEmitComplete() {
  if (hasEmittedComplete) return
  const isReasoningDrained = !props.reasoning?.trim() || (reasoningBuffer ? reasoningBuffer.isDrained() : true)
  const areToolsDrained = !props.tools || props.tools.filter((t) => t.status === 'RUNNING').length === 0
  const isBackendDoneThinking = props.hasContent || !props.streaming

  // 只要思考内容吐完（或已进入正文/已结束）且工具完成，立即放行正文挂载，绝不额外挂起卡顿
  if (isReasoningDrained && areToolsDrained && isBackendDoneThinking) {
    hasEmittedComplete = true
    emit('complete')
  }
}

reasoningBuffer = createSmoothStreamBuffer(
  (text) => {
    smoothedReasoning.value = text
  },
  {
    minSpeed: 20, // 思考链低水位拉伸速度（约 50ms/字）
    baseSpeed: 32, // 思考链从容深邃的推进节奏（约 31ms/字）
    maxSpeed: 75, // 思考链追赶上限
    finishSpeed: 55, // 思考完成交接时的收尾排空速度
    onComplete: () => {
      checkAndEmitComplete()
    },
  },
)

onBeforeUnmount(() => {
  if (minThinkingTimer) {
    clearTimeout(minThinkingTimer)
    minThinkingTimer = null
  }
  reasoningBuffer?.destroy()
  reasoningBuffer = null
})

watch(() => props.reasoning, (newVal) => {
  if (props.streaming && !props.hasContent) {
    triggerMinThinkingWindow()
    reasoningBuffer?.push(newVal || '')
  } else {
    // 非流式或正文已开始输出/完成：立即 flush 全部思考文本，禁止继续逐字打字
    reasoningBuffer?.flush(newVal || '')
    smoothedReasoning.value = newVal || ''
  }
  checkAndEmitComplete()
}, { immediate: true })

watch(() => props.tools, (tools) => {
  if (tools && tools.length > 0 && props.streaming && !props.hasContent) {
    triggerMinThinkingWindow()
  }
  checkAndEmitComplete()
}, { deep: true })

watch(() => props.streaming, (isStreaming) => {
  if (isStreaming) {
    hasEmittedComplete = false
    userManuallyToggled.value = false
    // 流式开启：默认自动展开
    isOpen.value = true
    if (!props.hasContent) {
      triggerMinThinkingWindow()
    }
  } else {
    if (minThinkingTimer) {
      clearTimeout(minThinkingTimer)
      minThinkingTimer = null
    }
    minimumThinkingActive.value = false
    // 流式结束（正文输出完）：若用户未手动点击干预，自动收起回胶囊
    if (!userManuallyToggled.value) {
      isOpen.value = false
    }
    // 流式结束：立即 flush
    reasoningBuffer?.flush(props.reasoning || '')
    smoothedReasoning.value = props.reasoning || ''
  }
  checkAndEmitComplete()
}, { immediate: true })

watch(() => props.hasContent, (hasContent) => {
  if (hasContent) {
    // 正文开始输出或已输出：思考阶段彻底结束，立即 flush 思考文本并终止逐字动画
    if (minThinkingTimer) {
      clearTimeout(minThinkingTimer)
      minThinkingTimer = null
    }
    minimumThinkingActive.value = false
    reasoningBuffer?.flush(props.reasoning || '')
    smoothedReasoning.value = props.reasoning || ''
  }
  checkAndEmitComplete()
}, { immediate: true })

// 是否正处于思考流式中（正文尚未出现且处于流式状态）
const isReasoningStreaming = computed(() => Boolean(props.streaming && !props.hasContent))

// 激活思考正文：只有在正在思考流式进行中时，才展示平滑缓冲字数；一旦正文输出或流式结束，直接展示完整内容
const activeReasoningText = computed(() => {
  if (isReasoningStreaming.value && reasoningBuffer && !reasoningBuffer.isDrained()) {
    return smoothedReasoning.value || props.reasoning || ''
  }
  return props.reasoning || ''
})

const hasReasoning = computed(() => Boolean(activeReasoningText.value && activeReasoningText.value.trim()))
const hasTools = computed(() => Boolean(props.tools && props.tools.length > 0))
const wordCount = computed(() => (activeReasoningText.value ? activeReasoningText.value.trim().length : 0))

// 流光状态判定：仅在思考流式进行中（且主正文尚未吐字）时保持流光
const isShimmering = computed(() => {
  if (!props.streaming || props.hasContent) return false
  if (minimumThinkingActive.value) return true
  return true
})

// 状态文字显示（顶栏仅展示思考状态，不保留工具调用提示）
const statusText = computed(() => {
  if (isShimmering.value) {
    return hasReasoning.value ? '深度思考中…' : '正在思考…'
  }
  if (hasReasoning.value) {
    return wordCount.value > 0 ? `已深度思考 · ${wordCount.value} 字` : '已深度思考'
  }
  return '思考完成'
})

// 工具友好名称
function formatToolName(name: string): string {
  if (name.includes('search') || name.includes('query')) return '检索资料'
  if (name.includes('retriev') || name.includes('doc')) return '查阅文献'
  if (name.includes('calc')) return '计算验证'
  return name
}

function toggleOpen(): void {
  // 如果没有任何可展开的内容（没有思考文本且没有工具），则不展开
  if (!hasReasoning.value && !hasTools.value) return
  userManuallyToggled.value = true
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div
    class="chat-process-pill-container"
    :class="{
      'is-streaming': streaming,
      'is-shimmering': isShimmering,
      'is-open': isOpen,
    }"
    aria-label="思考过程与工具状态"
  >
    <!-- 单行胶囊状态栏 (Collapsible Status Pill) -->
    <button
      type="button"
      class="process-pill-trigger"
      :class="{
        'is-interactive': hasReasoning || hasTools,
        'is-active': isOpen,
      }"
      @click="toggleOpen"
      :title="hasReasoning || hasTools ? (isOpen ? '收起思考过程' : '点击查看思考过程') : ''"
    >
      <!-- 左侧 16px 微动图标 -->
      <span class="process-pill-icon-wrap" :class="{ 'is-pulsing': isShimmering }">
        <svg class="process-spark-svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" fill="currentColor" />
        </svg>
      </span>

      <!-- 流光/静态状态字（文字大小严格保持 12px 不动） -->
      <span class="process-pill-label" :class="{ 'has-shimmer': isShimmering }">
        {{ statusText }}
      </span>

      <!-- 右侧小箭头 › -->
      <svg
        v-if="hasReasoning || hasTools"
        class="chevron-arrow"
        :class="{ 'is-expanded': isOpen }"
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <!-- 展开/收起步骤明细（CSS Grid 0fr <-> 1fr 纯硬件加速平滑折叠，收回与展开均带自然阻尼动效） -->
    <div
      v-if="hasReasoning || hasTools"
      class="process-timeline-body"
      :class="{ 'is-expanded': isOpen }"
      :aria-hidden="!isOpen"
    >
      <div class="process-timeline-inner">
        <div class="timeline-track">
          <!-- 思考链正文 Markdown（使用灰色字体呈现深邃沉稳推理感） -->
          <div v-if="hasReasoning" class="reasoning-markdown" v-html="renderMarkdown(activeReasoningText, isReasoningStreaming)" />

          <!-- 工具调用组装在思考链内部（组装在思考步骤中，不置于最顶层） -->
          <div v-if="hasTools" class="inline-thinking-tools">
            <div
              v-for="tool in tools"
              :key="tool.id"
              class="thinking-tool-pill"
              :data-status="tool.status"
            >
              <span class="tool-icon">
                <svg v-if="tool.status === 'RUNNING'" class="tool-spinner" width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="28 10" />
                </svg>
                <svg v-else-if="tool.status === 'COMPLETED'" width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <svg v-else width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 4V9M8 12H8.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
              <span class="tool-label">{{ formatToolName(tool.name) }}</span>
              <span class="tool-state-tag">{{ tool.status === 'RUNNING' ? '调用中…' : tool.status === 'FAILED' ? '执行失败' : '已完成' }}</span>
            </div>
          </div>

          <!-- 流式思考光标 -->
          <span v-if="isReasoningStreaming" class="timeline-cursor" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-process-pill-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin: 2px 0 10px;
  background: transparent;
  border: none;
  box-shadow: none;
}

/* 单行折叠触发器（无外框极简设计，内部文字严格保持 12px 不动） */
.process-pill-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 2px 8px 2px 0;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--text-secondary, #475569);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: default;
  user-select: none;
  box-shadow: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.process-pill-trigger.is-interactive {
  cursor: pointer;
}

.process-pill-trigger.is-interactive:hover {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 10%, transparent);
  color: var(--color-sage-dark, #5c6b44);
}

.process-pill-trigger.is-active {
  background: transparent;
  color: var(--text-primary);
}

/* 左侧 18px 微动图标容器 */
.process-pill-icon-wrap {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  color: var(--color-sage-dark, #5c6b44);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.process-pill-icon-wrap.is-pulsing {
  animation: micro-breathe 2s infinite ease-in-out;
}

@keyframes micro-breathe {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.75;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

.process-spark-svg {
  display: block;
}

/* 状态字：流光与静态过渡 */
.process-pill-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, #64748b);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.process-pill-label.has-shimmer {
  font-weight: 600;
  background: linear-gradient(
    90deg,
    #64748b 0%,
    var(--color-sage-dark, #5c6b44) 35%,
    color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 50%, #ffffff) 50%,
    var(--color-sage-dark, #5c6b44) 65%,
    #64748b 100%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pill-text-shimmer 2.2s ease-in-out infinite;
}

@keyframes pill-text-shimmer {
  0% {
    background-position: 220% 0;
  }
  100% {
    background-position: -220% 0;
  }
}

/* 右侧小箭头 › 展开旋转动效 */
.chevron-arrow {
  color: var(--text-muted, #94a3b8);
  transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.chevron-arrow.is-expanded {
  transform: rotate(90deg);
}

/* 展开与收起的步骤明细容器（CSS Grid 0fr <-> 1fr 纯硬件加速平滑折叠，收回动效极速且丝滑） */
.process-timeline-body {
  width: 100%;
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  margin-top: 0;
  pointer-events: none;
  visibility: hidden;
  transition: grid-template-rows 0.38s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
              margin-top 0.38s cubic-bezier(0.16, 1, 0.3, 1),
              visibility 0.38s linear;
  will-change: grid-template-rows, opacity;
}

.process-timeline-body.is-expanded {
  grid-template-rows: 1fr;
  opacity: 1;
  margin-top: 4px;
  pointer-events: auto;
  visibility: visible;
  transition: grid-template-rows 0.38s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.34s cubic-bezier(0.16, 1, 0.3, 1),
              margin-top 0.38s cubic-bezier(0.16, 1, 0.3, 1),
              visibility 0s linear;
}

.process-timeline-inner {
  overflow: hidden;
  min-height: 0;
}

.timeline-track {
  position: relative;
  margin-left: 9px;
  padding: 4px 0 4px 14px;
  border-left: 1.5px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 28%, var(--border-subtle, #cbd5e1));
}

/* 思考链 Markdown 正文（灰色字体） */
.reasoning-markdown {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-muted, #78716c);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.reasoning-markdown :deep(p),
.reasoning-markdown :deep(li),
.reasoning-markdown :deep(span),
.reasoning-markdown :deep(strong),
.reasoning-markdown :deep(em) {
  color: inherit;
}

.reasoning-markdown :deep(h1),
.reasoning-markdown :deep(h2),
.reasoning-markdown :deep(h3),
.reasoning-markdown :deep(h4) {
  color: var(--text-muted, #78716c);
  font-size: 13px;
  font-weight: 600;
  margin: 6px 0 3px;
}

.reasoning-markdown :deep(p) {
  margin: 0 0 6px;
}

.reasoning-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.reasoning-markdown :deep(code) {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.9em;
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--text-muted, #78716c);
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 8%, transparent);
}

.reasoning-markdown :deep(table) {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 8px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 18%, var(--border-default, #e5e0d8));
  font-size: 12px;
}

.reasoning-markdown :deep(th) {
  padding: 5px 8px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 10%, transparent);
  color: var(--text-muted, #78716c);
  font-weight: 600;
  text-align: left;
  border-bottom: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 16%, transparent);
}

.reasoning-markdown :deep(td) {
  padding: 5px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle, #e0deda) 40%, transparent);
  color: var(--text-muted, #78716c);
}

.reasoning-markdown :deep(tr:last-child td) {
  border-bottom: none;
}

/* 组装在思考链内部的工具调用微卡片 */
.inline-thinking-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 4px;
}

.thinking-tool-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2.5px 8px 2.5px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 6%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 20%, var(--border-subtle, #e2e8f0));
  font-size: 11px;
  color: var(--text-muted, #78716c);
  line-height: 1.2;
  user-select: none;
  transition: all 0.2s ease;
}

.thinking-tool-pill[data-status="RUNNING"] {
  border-color: var(--color-zen-sage, #8b9a6e);
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, var(--color-bg-card, #ffffff));
  color: var(--color-sage-dark, #5c6b44);
}

.thinking-tool-pill[data-status="FAILED"] {
  border-color: color-mix(in srgb, var(--color-warning, #d9822b) 35%, var(--border-subtle));
  color: var(--color-warning, #d9822b);
}

.tool-icon {
  display: grid;
  place-items: center;
  width: 13px;
  height: 13px;
}

.tool-spinner {
  animation: tool-spin 0.8s linear infinite;
}

@keyframes tool-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tool-label {
  font-weight: 550;
  color: var(--text-secondary, #525252);
}

.tool-state-tag {
  font-size: 10px;
  color: var(--text-muted, #78716c);
  opacity: 0.85;
}

.timeline-cursor {
  display: inline-block;
  width: 2px;
  height: 12px;
  margin-left: 2px;
  vertical-align: -1px;
  background: var(--color-zen-sage, #8b9a6e);
  animation: timeline-cursor-blink 0.8s infinite;
}

@keyframes timeline-cursor-blink {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

html.dark .process-pill-trigger {
  background: transparent;
  border: none;
  color: var(--text-secondary);
}

html.dark .process-pill-trigger.is-interactive:hover {
  background: rgba(255, 255, 255, 0.06);
  border: none;
  color: #a3b899;
}

@media (prefers-reduced-motion: reduce) {
  .process-pill-icon-wrap.is-pulsing,
  .process-pill-label.has-shimmer,
  .micro-spinner,
  .timeline-cursor {
    animation: none;
  }
}
</style>
