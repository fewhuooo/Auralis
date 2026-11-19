<template>
  <view
    v-if="showProcessBlock"
    class="process-block"
  >
    <view
      class="process-toggle"
      :class="{ 'is-static': !hasExpandableBody }"
      role="button"
      :aria-expanded="isOpen"
      @click="handleToggle"
    >
      <view
        class="process-dot"
        :class="{
          'is-streaming': isThinkingActive,
          'is-error': errorHighlight,
        }"
      ></view>
      <text
        class="process-summary"
        :class="{ 'is-shimmer': isThinkingActive }"
      >{{ summaryText }}</text>
      <LineIcon
        v-if="hasExpandableBody"
        :name="isOpen ? 'chevron-up' : 'chevron-down'"
        size="13px"
        color="var(--text-muted)"
      />
    </view>

    <view v-if="isOpen && hasExpandableBody" class="process-body">
      <template v-for="group in visibleTimelineGroups" :key="group.id">
        <rich-text
          v-if="group.kind === 'reasoning'"
          class="reasoning-rich-text"
          :nodes="group.nodes"
        />
        <view v-else class="inline-tools-row">
          <view
            v-for="tool in group.tools"
            :key="tool.id"
            class="tool-capsule"
            :class="`is-${tool.status.toLowerCase()}`"
          >
            <LineIcon
              v-if="tool.status === 'COMPLETED'"
              name="check"
              size="11px"
              color="#6E8552"
            />
            <LineIcon
              v-else-if="tool.status === 'FAILED'"
              name="alert"
              size="11px"
              color="var(--color-warning, #d9822b)"
            />
            <view v-else class="tool-dot is-running" aria-hidden="true"></view>
            <text class="tool-capsule-label">{{ formatAiToolLabel(tool.name, tool.label) }}</text>
            <text v-if="tool.status === 'FAILED'" class="tool-capsule-failed">未完成</text>
          </view>
        </view>
      </template>

      <view v-if="isReasoningStreaming" class="process-cursor-dot" aria-hidden="true"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { renderMarkdownHtml } from '@/utils/markdown'
import {
  buildFallbackProcessTimeline,
  formatAiToolLabel,
  resolveProcessSummary,
  resolveWaitingStatusText,
  sanitizeMobileReasoningText,
  type MobileChatProcessItem,
  type MobileChatToolStep,
} from '@/utils/mobileAiChat'
import { createSmoothStreamBuffer, type SmoothStreamController } from '@/utils/smoothStreamBuffer'

type TimelineRenderGroup =
  | { id: string; kind: 'reasoning'; nodes: string }
  | { id: string; kind: 'tools'; tools: readonly MobileChatToolStep[] }

const props = withDefaults(defineProps<{
  reasoning?: string
  tools?: readonly MobileChatToolStep[]
  timeline?: readonly MobileChatProcessItem[]
  streaming?: boolean
  hasContent?: boolean
  expanded?: boolean
  errorHighlight?: boolean
}>(), {
  reasoning: '',
  tools: () => [],
  timeline: () => [],
  streaming: false,
  hasContent: false,
  expanded: undefined,
  errorHighlight: false,
})

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'progress'): void
}>()

const localExpanded = ref(false)
const localManuallyToggled = ref(false)
const smoothedReasoning = ref('')

const reasoningBuffer: SmoothStreamController = createSmoothStreamBuffer(
  (text) => {
    smoothedReasoning.value = text
    emit('progress')
  },
  {
    minSpeed: 20,
    baseSpeed: 32,
    maxSpeed: 75,
    finishSpeed: 55,
  },
)

const normalizedTimeline = computed<readonly MobileChatProcessItem[]>(() => {
  if (props.timeline && props.timeline.length > 0) {
    return props.timeline
  }
  return buildFallbackProcessTimeline(props.reasoning, props.tools)
})

const cumulativeReasoningSource = computed(() => {
  const joined = normalizedTimeline.value
    .filter((item): item is Extract<MobileChatProcessItem, { kind: 'reasoning' }> => item.kind === 'reasoning')
    .map(item => item.text)
    .join('')
  return joined || props.reasoning || ''
})

const isReasoningStreaming = computed(() => Boolean(props.streaming && !props.hasContent))
const isThinkingActive = computed(() => Boolean(props.streaming && !props.hasContent))

watch(cumulativeReasoningSource, (nextText) => {
  if (props.streaming && !props.hasContent) {
    reasoningBuffer.push(nextText || '')
  } else {
    reasoningBuffer.flush(nextText || '')
    smoothedReasoning.value = nextText || ''
  }
}, { immediate: true })

watch(() => props.streaming, (streaming) => {
  if (streaming) {
    localManuallyToggled.value = false
    if (!props.hasContent) {
      localExpanded.value = true
    }
    reasoningBuffer.reset()
    smoothedReasoning.value = ''
    if (!props.hasContent && cumulativeReasoningSource.value) {
      reasoningBuffer.push(cumulativeReasoningSource.value)
    }
  } else {
    if (!localManuallyToggled.value) {
      localExpanded.value = false
    }
    const finalText = cumulativeReasoningSource.value
    reasoningBuffer.flush(finalText)
    smoothedReasoning.value = finalText
  }
}, { immediate: true })

watch(() => props.hasContent, (hasContent) => {
  if (hasContent) {
    if (!localManuallyToggled.value) {
      localExpanded.value = false
    }
    const finalText = cumulativeReasoningSource.value
    reasoningBuffer.flush(finalText)
    smoothedReasoning.value = finalText
  }
}, { immediate: true })

onBeforeUnmount(() => {
  reasoningBuffer.destroy()
})

const hasReasoningContent = computed(() => Boolean(cumulativeReasoningSource.value.trim()))
const hasTools = computed(() => Boolean(props.tools && props.tools.length > 0))
const hasExpandableBody = computed(() => hasReasoningContent.value || hasTools.value)
const showProcessBlock = computed(() => isThinkingActive.value || hasExpandableBody.value)

const isOpen = computed(() => (
  typeof props.expanded === 'boolean' ? props.expanded : localExpanded.value
))

const summaryText = computed(() => {
  if (isThinkingActive.value) {
    return resolveWaitingStatusText(props.tools, hasReasoningContent.value)
  }
  return resolveProcessSummary({
    reasoningText: cumulativeReasoningSource.value,
    tools: props.tools,
    status: props.streaming ? 'streaming' : 'completed',
    content: props.hasContent ? 'ready' : '',
  })
})

const visibleTimelineGroups = computed<TimelineRenderGroup[]>(() => {
  const revealedLimit = isReasoningStreaming.value && !reasoningBuffer.isDrained()
    ? smoothedReasoning.value.length
    : Number.POSITIVE_INFINITY

  const groups: TimelineRenderGroup[] = []
  let consumedReasoningChars = 0

  for (const item of normalizedTimeline.value) {
    if (item.kind === 'tool') {
      const prev = groups[groups.length - 1]
      if (prev && prev.kind === 'tools') {
        groups[groups.length - 1] = { id: prev.id, kind: 'tools', tools: [...prev.tools, item.tool] }
      } else {
        groups.push({ id: item.id, kind: 'tools', tools: [item.tool] })
      }
      continue
    }

    const available = Math.max(0, Math.min(item.text.length, revealedLimit - consumedReasoningChars))
    consumedReasoningChars += item.text.length
    if (available <= 0) continue

    const sanitized = sanitizeMobileReasoningText(item.text.slice(0, available))
    if (!sanitized.trim()) continue

    groups.push({
      id: item.id,
      kind: 'reasoning',
      nodes: renderMarkdownHtml(sanitized, { isStreaming: false, mutedReasoning: true }),
    })
  }

  return groups
})

function handleToggle() {
  if (!hasExpandableBody.value) return
  if (typeof props.expanded === 'boolean') {
    emit('toggle')
    return
  }
  localManuallyToggled.value = true
  localExpanded.value = !localExpanded.value
  emit('toggle')
}
</script>

<style scoped>
.process-block {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.process-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  background-color: rgba(28, 28, 26, 0.045);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.process-toggle.is-static {
  cursor: default;
  background-color: transparent;
  padding-left: 2px;
}

.process-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-zen-sage);
  flex-shrink: 0;
}

.process-dot.is-streaming {
  background-color: #556B3D;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
  animation: processPulse 1.2s ease-in-out infinite;
}

.process-dot.is-error {
  background-color: var(--color-warning);
}

.process-summary {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.process-summary.is-shimmer {
  color: var(--color-sage-ink);
  animation: processShimmer 1.6s ease-in-out infinite;
}

.process-body {
  margin-left: 6px;
  padding: 4px 0 4px 12px;
  border-left: 2px solid rgba(139, 154, 110, 0.34);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reasoning-rich-text {
  display: block;
  width: 100%;
  font-size: 13px;
  line-height: 1.65;
  color: #8C887F;
}

.inline-tools-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0;
}

.tool-capsule {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px 3px 7px;
  border-radius: 8px;
  background-color: rgba(139, 154, 110, 0.08);
  border: 1px solid rgba(139, 154, 110, 0.2);
}

.tool-capsule.is-running {
  background-color: rgba(139, 154, 110, 0.14);
  border-color: rgba(139, 154, 110, 0.45);
}

.tool-capsule.is-failed {
  background-color: rgba(217, 130, 43, 0.08);
  border-color: rgba(217, 130, 43, 0.3);
}

.tool-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: rgba(110, 127, 80, 0.72);
}

.tool-dot.is-running {
  background-color: #556B3D;
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.22);
  animation: processPulse 1.2s ease-in-out infinite;
}

.tool-capsule-label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary, #57534E);
}

.tool-capsule-failed {
  font-size: 10.5px;
  color: var(--color-warning, #d9822b);
}

.process-cursor-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: rgba(110, 127, 80, 0.75);
  animation: processPulse 1.2s ease-in-out infinite;
}

@keyframes processPulse {
  0%, 100% {
    opacity: 0.48;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes processShimmer {
  0%, 100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}
</style>
