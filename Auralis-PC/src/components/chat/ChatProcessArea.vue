<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createSmoothStreamBuffer, type SmoothStreamController } from '@/services/smoothStreamBuffer'
import { renderMarkdown } from '@/utils/markdown'
import {
  buildVisibleProcessTimelineGroups,
  formatToolCapsuleLabel,
  sanitizeReasoningText,
} from '@/utils/chatProcessFormat'
import type { ChatProcessTimelineItem, ChatToolActivity } from '@/services/aiStreamReducer'

type RenderTimelineGroup =
  | { id: string; kind: 'reasoning'; html: string }
  | { id: string; kind: 'tools'; tools: readonly ChatToolActivity[] }

const props = withDefaults(defineProps<{
  reasoning?: string
  tools?: readonly ChatToolActivity[]
  timeline?: readonly ChatProcessTimelineItem[]
  streaming?: boolean
  hasContent?: boolean
}>(), {
  reasoning: '',
  tools: () => [],
  timeline: () => [],
  streaming: false,
  hasContent: false,
})

const emit = defineEmits<{
  complete: []
  progress: []
  drainChange: [draining: boolean]
}>()

// 展开状态：流式生成中默认自动展开；正文输出完/非流式自动收起
const isOpen = ref(false)
// 用户是否主动手动干预过展开/收起
const userManuallyToggled = ref(false)

if (props.streaming) {
  isOpen.value = true
}

const smoothedReasoning = ref('')
const isReasoningDraining = ref(false)
let reasoningBuffer: SmoothStreamController | null = null
let hasEmittedComplete = false

// 最低展示时长的温和流光保持期：当模型极快出字或思考过短时，若有思考过程则至少优雅展示 1.2 秒以上
const minimumThinkingActive = ref(false)
let minThinkingTimer: ReturnType<typeof setTimeout> | null = null

function updateReasoningDraining(active: boolean): void {
  if (isReasoningDraining.value !== active) {
    isReasoningDraining.value = active
    emit('drainChange', active)
  }
}

const normalizedTimeline = computed<readonly ChatProcessTimelineItem[]>(() => {
  if (props.timeline && props.timeline.length > 0) {
    return props.timeline
  }
  const fallback: ChatProcessTimelineItem[] = []
  if (props.reasoning) {
    fallback.push({ id: 'reasoning:0', kind: 'reasoning', text: props.reasoning })
  }
  if (props.tools && props.tools.length > 0) {
    for (const tool of props.tools) {
      fallback.push({ id: `tool:${tool.id || fallback.length}`, kind: 'tool', tool })
    }
  }
  return fallback
})

const cumulativeReasoningSource = computed(() => {
  const segments = normalizedTimeline.value
    .filter((item): item is Extract<ChatProcessTimelineItem, { kind: 'reasoning' }> => item.kind === 'reasoning')
    .map((item) => item.text)
  return segments.length > 0 ? segments.join('') : (props.reasoning || '')
})

function triggerMinThinkingWindow() {
  if (minThinkingTimer || !props.streaming || props.hasContent) return
  const hasAnyReasoning = Boolean(cumulativeReasoningSource.value.trim())
  const hasAnyTools = Boolean(props.tools && props.tools.length > 0)
  if (hasAnyReasoning || hasAnyTools) {
    minimumThinkingActive.value = true
    minThinkingTimer = setTimeout(() => {
      minimumThinkingActive.value = false
      minThinkingTimer = null
      checkAndEmitComplete()
    }, 1200)
  }
}

function checkAndEmitComplete(reasoningFinished = !isReasoningDraining.value) {
  if (hasEmittedComplete) return
  const isReasoningDrained = (!cumulativeReasoningSource.value.trim() || (reasoningBuffer ? reasoningBuffer.isDrained() : true)) && reasoningFinished
  const isBackendDoneThinking = props.hasContent || !props.streaming

  if (isReasoningDrained && isBackendDoneThinking) {
    hasEmittedComplete = true
    emit('complete')
  }
}

reasoningBuffer = createSmoothStreamBuffer(
  (text) => {
    smoothedReasoning.value = text
    emit('progress')
  },
  {
    minSpeed: 18,
    baseSpeed: 38,
    maxSpeed: 125,
    finishSpeed: 76,
    speedDampingFactor: 4.2,
    onComplete: () => {
      if (!props.streaming && !userManuallyToggled.value) {
        isOpen.value = false
      }
      checkAndEmitComplete(true)
      updateReasoningDraining(false)
    },
  },
)

onBeforeUnmount(() => {
  if (minThinkingTimer) {
    clearTimeout(minThinkingTimer)
    minThinkingTimer = null
  }
  updateReasoningDraining(false)
  reasoningBuffer?.destroy()
  reasoningBuffer = null
})

watch(cumulativeReasoningSource, (newVal) => {
  const nextVal = newVal || ''
  if (props.streaming && !props.hasContent) {
    triggerMinThinkingWindow()
    reasoningBuffer?.push(nextVal)
    updateReasoningDraining(Boolean(reasoningBuffer && !reasoningBuffer.isDrained()))
  } else if (isReasoningDraining.value) {
    reasoningBuffer?.finish(nextVal)
  } else {
    reasoningBuffer?.flush(nextVal)
    smoothedReasoning.value = nextVal
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
    isOpen.value = true
    updateReasoningDraining(false)
    reasoningBuffer?.reset()
    smoothedReasoning.value = ''
    if (!props.hasContent && cumulativeReasoningSource.value) {
      triggerMinThinkingWindow()
      reasoningBuffer?.push(cumulativeReasoningSource.value)
      updateReasoningDraining(Boolean(reasoningBuffer && !reasoningBuffer.isDrained()))
    }
  } else {
    if (minThinkingTimer) {
      clearTimeout(minThinkingTimer)
      minThinkingTimer = null
    }
    minimumThinkingActive.value = false
    const finalText = cumulativeReasoningSource.value
    if (isReasoningDraining.value || (reasoningBuffer && !reasoningBuffer.isDrained())) {
      updateReasoningDraining(true)
      reasoningBuffer?.finish(finalText)
    } else {
      if (!userManuallyToggled.value) {
        isOpen.value = false
      }
      smoothedReasoning.value = finalText
      updateReasoningDraining(false)
    }
  }
  checkAndEmitComplete()
}, { immediate: true })

watch(() => props.hasContent, (hasContent) => {
  if (hasContent) {
    if (minThinkingTimer) {
      clearTimeout(minThinkingTimer)
      minThinkingTimer = null
    }
    minimumThinkingActive.value = false
    const finalText = cumulativeReasoningSource.value
    if (isReasoningDraining.value || (reasoningBuffer && !reasoningBuffer.isDrained())) {
      updateReasoningDraining(true)
      reasoningBuffer?.finish(finalText)
    } else {
      smoothedReasoning.value = finalText
      updateReasoningDraining(false)
    }
  }
  checkAndEmitComplete()
}, { immediate: true })

const isReasoningStreaming = computed(() => Boolean((props.streaming && !props.hasContent) || isReasoningDraining.value))

const visibleTimelineGroups = computed<RenderTimelineGroup[]>(() => {
  const revealedLimit = isReasoningStreaming.value
    ? smoothedReasoning.value.length
    : Number.POSITIVE_INFINITY

  return buildVisibleProcessTimelineGroups(normalizedTimeline.value, revealedLimit).map((group) => (
    group.kind === 'reasoning'
      ? { id: group.id, kind: 'reasoning', html: renderMarkdown(group.text, false) }
      : group
  ))
})

const hasReasoning = computed(() => Boolean(cumulativeReasoningSource.value.trim()))
const hasTools = computed(() => Boolean(props.tools && props.tools.length > 0))
const wordCount = computed(() => sanitizeReasoningText(cumulativeReasoningSource.value).trim().length)

const isShimmering = computed(() => Boolean(props.streaming && !props.hasContent))

const runningTool = computed(() => props.tools?.find((tool) => tool.status === 'RUNNING') || null)

const statusText = computed(() => {
  if (isShimmering.value) {
    if (runningTool.value) {
      return `正在${formatToolCapsuleLabel(runningTool.value)}…`
    }
    if (hasReasoning.value) return '深度思考中…'
    return '正在检索相关资料…'
  }
  const toolCount = props.tools?.length ?? 0
  if (hasReasoning.value && toolCount > 0) {
    return `已思考 · ${toolCount} 步检索`
  }
  if (toolCount > 0) {
    return `已检索 ${toolCount} 步`
  }
  if (hasReasoning.value) {
    return wordCount.value > 0 ? `已深度思考 · ${wordCount.value} 字` : '已深度思考'
  }
  return '检索与思考完成'
})

function toggleOpen(): void {
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
    <!-- 单行胶囊状态栏 (极简圆点 + 状态文案，去掉冗余星芒图标) -->
    <button
      type="button"
      class="process-pill-trigger"
      :class="{
        'is-interactive': hasReasoning || hasTools,
        'is-active': isOpen,
      }"
      @click="toggleOpen"
      :title="hasReasoning || hasTools ? (isOpen ? '收起检索与思考过程' : '点击查看检索与思考过程') : ''"
    >
      <span
        class="process-status-dot"
        :class="{ 'is-pulsing': isShimmering }"
        aria-hidden="true"
      />

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
          <template v-for="group in visibleTimelineGroups" :key="group.id">
            <div v-if="group.kind === 'reasoning'" class="reasoning-markdown" v-html="group.html" />
            <div v-else class="process-tool-steps">
              <div
                v-for="tool in group.tools"
                :key="tool.id"
                class="process-tool-step"
                :data-status="tool.status"
              >
                <span class="tool-step-icon" aria-hidden="true">
                  <svg
                    v-if="tool.status === 'COMPLETED'"
                    class="tool-check-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path d="M2.4 6.2L4.9 8.7L9.6 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg
                    v-else-if="tool.status === 'FAILED'"
                    class="tool-failed-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <circle cx="6" cy="6" r="4.6" stroke="currentColor" stroke-width="1.3" />
                    <path d="M6 3.7V6.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                    <circle cx="6" cy="8.4" r="0.7" fill="currentColor" />
                  </svg>
                  <span v-else class="tool-status-dot is-running" />
                </span>
                <span class="tool-step-text">
                  <span class="tool-label">{{ formatToolCapsuleLabel(tool) }}</span>
                  <span v-if="tool.status === 'FAILED'" class="tool-state-tag">· 未完成</span>
                </span>
              </div>
            </div>
          </template>

          <span v-if="isReasoningStreaming" class="timeline-cursor-dot" aria-hidden="true" />
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

/* 左侧极简 7px 橄榄绿呼吸圆点 */
.process-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: rgba(110, 127, 80, 0.78);
  flex-shrink: 0;
  transition: transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease;
}

.process-status-dot.is-pulsing {
  background-color: var(--color-sage-ink, #556B3D);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
  animation: micro-breathe 1.6s infinite ease-in-out;
}

@keyframes micro-breathe {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.18);
    opacity: 1;
  }
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

/* 思考链 Markdown 正文（低对比暖灰字体） */
.reasoning-markdown {
  font-size: 13px;
  line-height: 1.65;
  color: #8c887f;
  overflow-wrap: anywhere;
  margin-bottom: 6px;
}

.reasoning-markdown:last-child {
  margin-bottom: 0;
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
  color: #8c887f;
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

.reasoning-markdown :deep(ul),
.reasoning-markdown :deep(ol) {
  padding-left: 1.45em;
  margin: 4px 0 6px;
  list-style-position: outside;
}

.reasoning-markdown :deep(li) {
  margin-bottom: 4px;
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

/* 组装在思考链内部的工具调用无框竖向步骤行 */
.process-tool-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0 8px;
}

.process-tool-steps:first-child {
  margin-top: 2px;
}

.process-tool-steps:last-child {
  margin-bottom: 2px;
}

.process-tool-step {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 1px 0;
  background: transparent;
  border: none;
  border-radius: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #6d6a62;
  user-select: none;
}

.tool-step-icon {
  width: 14px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tool-step-text {
  min-width: 0;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  overflow-wrap: anywhere;
}

.tool-check-icon {
  flex-shrink: 0;
  color: #6e8552;
}

.tool-failed-icon {
  flex-shrink: 0;
  color: #9C500C;
}

.tool-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: rgba(110, 127, 80, 0.72);
}

.tool-status-dot.is-running {
  background-color: var(--color-sage-ink, #556B3D);
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.2);
  animation: micro-breathe 1.4s infinite ease-in-out;
}

.tool-label {
  font-weight: 500;
  color: inherit;
}

.process-tool-step[data-status="RUNNING"] .tool-label {
  color: var(--color-sage-ink, #556B3D);
}

.process-tool-step[data-status="FAILED"] {
  color: #9C500C;
}

.tool-state-tag {
  font-size: 11px;
  color: #9C500C;
  opacity: 0.92;
}

.timeline-cursor-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 50%;
  background-color: rgba(110, 127, 80, 0.75);
  animation: micro-breathe 1.2s ease-in-out infinite;
}

html.dark .reasoning-markdown,
html.dark .reasoning-markdown :deep(h1),
html.dark .reasoning-markdown :deep(h2),
html.dark .reasoning-markdown :deep(h3),
html.dark .reasoning-markdown :deep(h4) {
  color: #8e8a80;
}

html.dark .process-tool-step {
  color: #a39f95;
}

html.dark .process-tool-step[data-status="RUNNING"] .tool-label {
  color: #9eb784;
}

html.dark .process-tool-step[data-status="FAILED"],
html.dark .tool-failed-icon,
html.dark .tool-state-tag {
  color: #e59a4c;
}

html.dark .tool-check-icon {
  color: #8fb072;
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
  .process-status-dot.is-pulsing,
  .tool-status-dot.is-running,
  .process-pill-label.has-shimmer,
  .timeline-cursor-dot {
    animation: none;
  }
}
</style>
