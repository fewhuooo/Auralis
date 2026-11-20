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
        <view v-else class="process-tool-steps">
          <view
            v-for="tool in group.tools"
            :key="tool.id"
            class="process-tool-step"
            :class="`is-${tool.status.toLowerCase()}`"
          >
            <view class="tool-step-icon" aria-hidden="true">
              <LineIcon
                v-if="tool.status === 'COMPLETED'"
                name="check"
                size="12px"
                color="#6E8552"
              />
              <LineIcon
                v-else-if="tool.status === 'FAILED'"
                name="alert"
                size="12px"
                color="#9C500C"
              />
              <view v-else class="tool-dot is-running"></view>
            </view>
            <view class="tool-step-text">
              <text class="tool-step-label">{{ formatAiToolLabel(tool.name, tool.label) }}</text>
              <text v-if="tool.status === 'FAILED'" class="tool-step-failed">· 未完成</text>
            </view>
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
  buildVisibleMobileTimelineGroups,
  formatAiToolLabel,
  resolveMobileProcessDrawerOpen,
  resolveProcessSummary,
  resolveWaitingStatusText,
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
const holdOpenForDrain = ref(false)
const userClosedDuringDrain = ref(false)
const smoothedReasoning = ref('')
const isReasoningDraining = ref(false)

const reasoningBuffer: SmoothStreamController = createSmoothStreamBuffer(
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
      isReasoningDraining.value = false
      holdOpenForDrain.value = false
      if (!localManuallyToggled.value) {
        localExpanded.value = false
      }
    },
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

const isReasoningStreaming = computed(() => Boolean((props.streaming && !props.hasContent) || isReasoningDraining.value))
const isThinkingActive = computed(() => Boolean(props.streaming && !props.hasContent))

watch(() => props.expanded, (expanded, prevExpanded) => {
  if (expanded === true && prevExpanded === false) {
    userClosedDuringDrain.value = false
  }
})

watch(cumulativeReasoningSource, (nextText) => {
  const safeText = nextText || ''
  if (props.streaming && !props.hasContent) {
    reasoningBuffer.push(safeText)
    isReasoningDraining.value = !reasoningBuffer.isDrained()
    return
  }
  if (isReasoningDraining.value || holdOpenForDrain.value) {
    reasoningBuffer.finish(safeText)
    isReasoningDraining.value = !reasoningBuffer.isDrained()
    if (!isReasoningDraining.value) {
      holdOpenForDrain.value = false
    }
    return
  }
  reasoningBuffer.flush(safeText)
  smoothedReasoning.value = safeText
}, { immediate: true })

watch(() => props.streaming, (streaming) => {
  if (streaming) {
    localManuallyToggled.value = false
    userClosedDuringDrain.value = false
    holdOpenForDrain.value = false
    if (!props.hasContent) {
      localExpanded.value = true
    }
    isReasoningDraining.value = false
    reasoningBuffer.reset()
    smoothedReasoning.value = ''
    if (!props.hasContent && cumulativeReasoningSource.value) {
      reasoningBuffer.push(cumulativeReasoningSource.value)
      isReasoningDraining.value = !reasoningBuffer.isDrained()
    }
  } else {
    const finalText = cumulativeReasoningSource.value
    if (isReasoningDraining.value || !reasoningBuffer.isDrained()) {
      isReasoningDraining.value = true
      holdOpenForDrain.value = !userClosedDuringDrain.value
      reasoningBuffer.finish(finalText)
    } else {
      holdOpenForDrain.value = false
      if (!localManuallyToggled.value) {
        localExpanded.value = false
      }
      smoothedReasoning.value = finalText
      isReasoningDraining.value = false
    }
  }
}, { immediate: true })

watch(() => props.hasContent, (hasContent) => {
  if (!hasContent) return
  const finalText = cumulativeReasoningSource.value
  if (isReasoningDraining.value || !reasoningBuffer.isDrained()) {
    isReasoningDraining.value = true
    holdOpenForDrain.value = !userClosedDuringDrain.value
    reasoningBuffer.finish(finalText)
  } else {
    holdOpenForDrain.value = false
    if (!localManuallyToggled.value) {
      localExpanded.value = false
    }
    smoothedReasoning.value = finalText
    isReasoningDraining.value = false
  }
}, { immediate: true })

onBeforeUnmount(() => {
  isReasoningDraining.value = false
  holdOpenForDrain.value = false
  reasoningBuffer.destroy()
})

const hasReasoningContent = computed(() => Boolean(cumulativeReasoningSource.value.trim()))
const hasTools = computed(() => Boolean(props.tools && props.tools.length > 0))
const hasExpandableBody = computed(() => hasReasoningContent.value || hasTools.value)
const showProcessBlock = computed(() => isThinkingActive.value || hasExpandableBody.value)

const isOpen = computed(() => resolveMobileProcessDrawerOpen({
  controlledExpanded: props.expanded,
  localExpanded: localExpanded.value,
  holdOpenForDrain: holdOpenForDrain.value,
  userClosedDuringDrain: userClosedDuringDrain.value,
}))

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
  const revealedLimit = isReasoningStreaming.value
    ? smoothedReasoning.value.length
    : Number.POSITIVE_INFINITY

  return buildVisibleMobileTimelineGroups(normalizedTimeline.value, revealedLimit).map(group => (
    group.kind === 'reasoning'
      ? { id: group.id, kind: 'reasoning', nodes: renderMarkdownHtml(group.text, { isStreaming: false, mutedReasoning: true }) }
      : group
  ))
})

function handleToggle() {
  if (!hasExpandableBody.value) return
  if (typeof props.expanded === 'boolean') {
    if (!props.expanded && holdOpenForDrain.value && !userClosedDuringDrain.value) {
      userClosedDuringDrain.value = true
      holdOpenForDrain.value = false
      return
    }
    userClosedDuringDrain.value = isOpen.value
    if (isOpen.value) {
      holdOpenForDrain.value = false
    }
    emit('toggle')
    return
  }
  localManuallyToggled.value = true
  const nextOpen = !isOpen.value
  userClosedDuringDrain.value = !nextOpen
  if (!nextOpen) {
    holdOpenForDrain.value = false
  }
  localExpanded.value = nextOpen
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
  padding: 3px 6px 3px 0;
  border-radius: 6px;
  background-color: transparent;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.process-toggle.is-static {
  cursor: default;
  background-color: transparent;
  padding-left: 0;
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

.process-tool-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 2px 0 4px;
}

.process-tool-step {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 1px 0;
  background: transparent;
  border: none;
  border-radius: 0;
}

.tool-step-icon {
  width: 14px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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

.tool-step-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
}

.tool-step-label {
  font-size: 12px;
  line-height: 1.5;
  font-weight: 500;
  color: #6D6A62;
  word-break: break-word;
}

.process-tool-step.is-running .tool-step-label {
  color: var(--color-sage-ink, #556B3D);
}

.process-tool-step.is-failed .tool-step-label {
  color: #9C500C;
}

.tool-step-failed {
  font-size: 11px;
  line-height: 1.5;
  color: #9C500C;
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
