<template>
  <view class="mobile-part-list">
    <template v-for="(part, index) in effectiveParts" :key="part.kind === 'block' ? part.componentId : part.id">
      <view v-if="part.kind === 'text'" class="mobile-part-text">
        <MarkdownText
          :content="getRenderedText(part, index)"
          :streaming="isPartActivelyStreaming(index)"
        />
      </view>

      <view
        v-else-if="part.component === 'steps' || part.component === 'compare' || part.component === 'roadmap' || part.component === 'chart'"
        class="viz-card"
        :class="`viz-card--${part.component}`"
      >
        <view v-if="textField(part.meta, 'title') || textField(part.meta, 'description')" class="viz-card-header">
          <text v-if="textField(part.meta, 'title')" class="viz-card-title">{{ textField(part.meta, 'title') }}</text>
          <text v-if="textField(part.meta, 'description')" class="viz-card-desc">{{ textField(part.meta, 'description') }}</text>
        </view>

        <view v-if="part.items.length === 0 && (part.state === 'GENERATING' || streaming || busy)" class="viz-skeleton">
          <view class="viz-skeleton-bar"></view>
          <view class="viz-skeleton-bar is-short"></view>
        </view>

        <view v-else-if="part.items.length === 0 && part.state === 'INVALID'" class="viz-invalid-note">
          <text>内容生成未完成或格式异常</text>
        </view>

        <view v-else-if="part.component === 'steps'" class="viz-steps">
          <view
            v-for="(item, itemIdx) in part.items"
            :key="`${part.componentId}-step-${itemIdx}`"
            class="viz-step-row"
          >
            <view class="viz-step-rail">
              <view class="viz-step-badge num-tabular">{{ itemIdx + 1 }}</view>
              <view v-if="itemIdx < part.items.length - 1 || part.state === 'GENERATING'" class="viz-step-line"></view>
            </view>
            <view class="viz-step-body">
              <text class="viz-step-title">{{ textField(item, 'title') }}</text>
              <view v-if="textField(item, 'description')" class="viz-step-detail">
                <MarkdownText :content="textField(item, 'description')" />
              </view>
            </view>
          </view>
          <view v-if="part.state === 'GENERATING'" class="viz-step-row">
            <view class="viz-step-rail">
              <view class="viz-step-badge is-generating">
                <view class="viz-pulse-dot"></view>
              </view>
            </view>
            <view class="viz-step-body">
              <view class="viz-skeleton-bar is-short"></view>
            </view>
          </view>
        </view>

        <view v-else-if="part.component === 'compare'" class="viz-compare">
          <view
            v-for="(item, dimIdx) in part.items"
            :key="`${part.componentId}-dim-${dimIdx}`"
            class="viz-compare-dim"
          >
            <text class="viz-compare-dim-title">{{ textField(item, 'title') }}</text>
            <view class="viz-compare-entries">
              <view
                v-for="(entry, entryIdx) in entriesOf(item)"
                :key="`${part.componentId}-entry-${dimIdx}-${entryIdx}`"
                class="viz-compare-entry"
              >
                <text class="viz-compare-label">{{ entry.label }}</text>
                <view class="viz-compare-text">
                  <MarkdownText :content="entry.text" />
                </view>
              </view>
            </view>
          </view>
          <view v-if="part.state === 'GENERATING'" class="viz-skeleton-bar is-tall"></view>
        </view>

        <view v-else-if="part.component === 'roadmap'" class="viz-roadmap">
          <view
            v-for="(item, nodeIdx) in part.items"
            :key="`${part.componentId}-route-${nodeIdx}`"
            class="viz-roadmap-row"
            :class="{ 'is-current': booleanField(item, 'current') }"
          >
            <view class="viz-step-rail">
              <view class="viz-roadmap-node num-tabular" :class="{ 'is-current': booleanField(item, 'current') }">
                {{ nodeIdx + 1 }}
              </view>
              <view v-if="nodeIdx < part.items.length - 1 || part.state === 'GENERATING'" class="viz-step-line"></view>
            </view>
            <view class="viz-roadmap-card" :class="{ 'is-current': booleanField(item, 'current') }">
              <view class="viz-roadmap-top">
                <text class="viz-roadmap-title">{{ textField(item, 'title') }}</text>
                <text v-if="textField(item, 'tag')" class="viz-roadmap-tag">{{ textField(item, 'tag') }}</text>
                <text v-if="booleanField(item, 'current')" class="viz-roadmap-current">目前位置</text>
              </view>
              <view v-if="textField(item, 'description')" class="viz-step-detail">
                <MarkdownText :content="textField(item, 'description')" />
              </view>
            </view>
          </view>
        </view>

        <view v-else-if="part.component === 'chart'" class="viz-chart">
          <template v-if="textField(part.meta, 'chartType') === 'proportion'">
            <view v-if="proportionTotal(part) > 0" class="viz-proportion-track">
              <view
                v-for="(item, sliceIdx) in part.items"
                :key="`${part.componentId}-seg-${sliceIdx}`"
                class="viz-proportion-seg"
                :style="{
                  width: `${proportionPercent(part, sliceIdx)}%`,
                  backgroundColor: chartColor(sliceIdx),
                }"
              ></view>
            </view>
            <view class="viz-legend-list">
              <view
                v-for="(item, sliceIdx) in part.items"
                :key="`${part.componentId}-leg-${sliceIdx}`"
                class="viz-legend-row"
              >
                <view class="viz-legend-left">
                  <view class="viz-legend-swatch" :style="{ backgroundColor: chartColor(sliceIdx) }"></view>
                  <text class="viz-legend-label">{{ textField(item, 'label') }}</text>
                </view>
                <text class="viz-legend-value num-tabular">
                  {{ numberField(item, 'value') }}{{ textField(part.meta, 'unit') }}
                  ({{ Math.round(proportionPercent(part, sliceIdx)) }}%)
                </text>
              </view>
            </view>
          </template>
          <view v-else class="viz-bars">
            <view
              v-for="(item, barIdx) in part.items"
              :key="`${part.componentId}-bar-${barIdx}`"
              class="viz-bar-row"
            >
              <view class="viz-bar-top">
                <text class="viz-bar-label">{{ textField(item, 'label') }}</text>
                <text class="viz-bar-value num-tabular">
                  {{ numberField(item, 'value') }}{{ textField(part.meta, 'unit') }}
                </text>
              </view>
              <view class="viz-bar-track">
                <view
                  class="viz-bar-fill"
                  :style="{ width: `${barPercent(part, barIdx)}%` }"
                ></view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view
        v-else
        class="activity-card"
        :class="{
          'is-submitted': part.state === 'SUBMITTED',
          'is-invalid': part.state === 'INVALID',
        }"
      >
        <view class="activity-header">
          <text class="activity-pill">{{ activityStatusLabel(part) }}</text>
        </view>

        <view class="activity-question">
          <MarkdownText
            v-if="textField(part.meta, 'question')"
            :content="textField(part.meta, 'question')"
            :streaming="part.state === 'GENERATING'"
          />
          <view v-else-if="part.state === 'GENERATING'" class="viz-skeleton">
            <view class="viz-skeleton-bar"></view>
          </view>
          <text v-else class="viz-invalid-note">题目未完整生成</text>
        </view>

        <view v-if="part.component === 'quiz' && part.state !== 'SUBMITTED'" class="quiz-options">
          <view
            v-for="(opt, optIdx) in part.items"
            :key="`${part.componentId}-opt-${optIdx}`"
            class="quiz-option"
            :class="{
              'is-selected': isOptionSelected(part, textField(opt, 'key')),
              'is-disabled': readOnly || part.state !== 'READY',
            }"
            role="button"
            @click="selectQuizOption(part, textField(opt, 'key'))"
          >
            <view class="quiz-badge" :class="{ 'is-selected': isOptionSelected(part, textField(opt, 'key')) }">
              <LineIcon
                v-if="isOptionSelected(part, textField(opt, 'key'))"
                name="check"
                size="12px"
                color="#FFFFFF"
              />
              <text v-else>{{ textField(opt, 'key') }}</text>
            </view>
            <text class="quiz-option-text">{{ textField(opt, 'text') }}</text>
          </view>

          <template v-if="part.state === 'GENERATING'">
            <view
              v-for="slotKey in quizPlaceholderSlots(part)"
              :key="`${part.componentId}-slot-${slotKey}`"
              class="quiz-option is-placeholder"
            >
              <view class="quiz-badge is-placeholder">
                <text>{{ slotKey }}</text>
              </view>
              <view class="viz-skeleton-bar is-short"></view>
            </view>
          </template>
        </view>

        <view
          v-else-if="part.component === 'question' && part.state !== 'SUBMITTED' && !readOnly && part.state !== 'INVALID'"
          class="question-answer-box"
        >
          <textarea
            class="question-textarea"
            :value="questionDraftText(part)"
            :placeholder="textField(part.meta, 'placeholder') || '写下你的思考与回答…'"
            :maxlength="2000"
            auto-height
            :disabled="part.state !== 'READY'"
            @input="onQuestionInput(part, $event)"
          />
        </view>

        <view v-if="part.state === 'SUBMITTED'" class="activity-submitted-box">
          <text class="submitted-label">你的作答记录</text>
          <text
            v-for="(line, lineIdx) in submittedAnswerLines(part)"
            :key="`${part.componentId}-ans-${lineIdx}`"
            class="submitted-item"
          >{{ line }}</text>
        </view>

        <view class="activity-footer">
          <text class="activity-tip">{{ activityStateMessage(part) }}</text>
          <view
            v-if="part.state === 'READY' && !readOnly"
            class="activity-submit-btn"
            :class="{ disabled: !canSubmitActivity(part) }"
            role="button"
            @click="submitActivity(part)"
          >
            <text>提交回答</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import {
  createMobileActivitySubmission,
  getMobileChartRatios,
  type MobileChatActivityAnswer,
  type MobileChatActivityDraft,
  type MobileChatBlockPart,
  type MobileChatCompareEntry,
  type MobileChatContentPart,
} from '@/utils/mobileChatParts'
import { createSmoothStreamBuffer, type SmoothStreamController } from '@/utils/smoothStreamBuffer'

const CHART_PALETTE = ['#556B3D', '#8B9A6E', '#C89B6D', '#6B8290', '#B4BEA0'] as const

const props = withDefaults(defineProps<{
  parts: readonly MobileChatContentPart[]
  fallbackText?: string
  streaming?: boolean
  busy?: boolean
  readOnly?: boolean
}>(), {
  fallbackText: '',
  streaming: false,
  busy: false,
  readOnly: false,
})

const emit = defineEmits<{
  (e: 'submit', questionId: string, answer: MobileChatActivityAnswer): void
  (e: 'drain-change', draining: boolean): void
  (e: 'text-progress'): void
}>()

const effectiveParts = computed<readonly MobileChatContentPart[]>(() => {
  if (props.parts.length > 0) return props.parts
  if (props.fallbackText) {
    return [{ id: 'fallback-text', kind: 'text', text: props.fallbackText }]
  }
  return []
})

const smoothedActiveText = ref('')
const isTextStreamingActive = ref(false)
const currentStreamingTextId = ref<string | null>(null)
const localDrafts = reactive<Record<string, MobileChatActivityDraft>>({})

const smoothBuffer: SmoothStreamController = createSmoothStreamBuffer(
  (text) => {
    smoothedActiveText.value = text
    emit('text-progress')
  },
  {
    minSpeed: 24,
    baseSpeed: 42,
    maxSpeed: 120,
    finishSpeed: 84,
    onComplete: () => {
      currentStreamingTextId.value = null
      setDraining(false)
    },
  },
)

function setDraining(active: boolean) {
  if (isTextStreamingActive.value !== active) {
    isTextStreamingActive.value = active
    emit('drain-change', active)
  }
}

watch(
  () => [effectiveParts.value, props.streaming] as const,
  ([parts, isStreaming]) => {
    const lastPart = parts[parts.length - 1]
    if (isStreaming && lastPart && lastPart.kind === 'text') {
      if (currentStreamingTextId.value !== lastPart.id) {
        smoothedActiveText.value = ''
        smoothBuffer.reset()
        currentStreamingTextId.value = lastPart.id
      }
      setDraining(true)
      smoothBuffer.push(lastPart.text)
      return
    }
    if (!isStreaming && lastPart && lastPart.kind === 'text') {
      if (isTextStreamingActive.value && currentStreamingTextId.value === lastPart.id) {
        smoothBuffer.finish(lastPart.text)
        return
      }
      currentStreamingTextId.value = null
      smoothBuffer.reset()
      smoothedActiveText.value = lastPart.text
      setDraining(false)
      return
    }
    currentStreamingTextId.value = null
    if (isTextStreamingActive.value) {
      smoothBuffer.flush()
    } else {
      smoothBuffer.reset()
    }
    setDraining(false)
    smoothedActiveText.value = ''
  },
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  smoothBuffer.destroy()
  isTextStreamingActive.value = false
})

function isPartActivelyStreaming(index: number): boolean {
  return index === effectiveParts.value.length - 1 && (props.streaming || isTextStreamingActive.value)
}

function getRenderedText(part: Extract<MobileChatContentPart, { kind: 'text' }>, index: number): string {
  if (isTextStreamingActive.value && index === effectiveParts.value.length - 1 && currentStreamingTextId.value === part.id) {
    return smoothedActiveText.value
  }
  return part.text
}

function textField(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function numberField(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function booleanField(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return record[key] === true
}

function entriesOf(item: Readonly<Record<string, unknown>>): MobileChatCompareEntry[] {
  if (!Array.isArray(item.entries)) return []
  const result: MobileChatCompareEntry[] = []
  for (const candidate of item.entries) {
    if (
      candidate
      && typeof candidate === 'object'
      && typeof (candidate as { label?: unknown }).label === 'string'
      && typeof (candidate as { text?: unknown }).text === 'string'
    ) {
      result.push({
        label: (candidate as { label: string }).label,
        text: (candidate as { text: string }).text,
      })
    }
  }
  return result
}

function chartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]
}

function barPercent(block: MobileChatBlockPart, index: number): number {
  const maximum = block.items.reduce((maxVal, item) => Math.max(maxVal, numberField(item, 'value')), 0)
  if (maximum <= 0) return 0
  return Math.max(4, Math.min(100, (numberField(block.items[index] ?? {}, 'value') / maximum) * 100))
}

function proportionTotal(block: MobileChatBlockPart): number {
  return block.items.reduce((sum, item) => sum + numberField(item, 'value'), 0)
}

function proportionPercent(block: MobileChatBlockPart, index: number): number {
  const ratios = getMobileChartRatios(block)
  return (ratios[index] ?? 0) * 100
}

function getActivityDraft(block: MobileChatBlockPart): MobileChatActivityDraft {
  if (Object.hasOwn(localDrafts, block.componentId)) {
    return localDrafts[block.componentId]
  }
  return block.component === 'quiz' && block.meta.questionType === 'multiple' ? [] : null
}

function isOptionSelected(block: MobileChatBlockPart, key: string): boolean {
  if (!key) return false
  const draft = getActivityDraft(block)
  if (Array.isArray(draft)) return draft.includes(key)
  return draft === key
}

function selectQuizOption(block: MobileChatBlockPart, key: string) {
  if (props.readOnly || block.state !== 'READY' || !key) return
  if (block.meta.questionType === 'multiple') {
    const current = Array.isArray(getActivityDraft(block)) ? [...(getActivityDraft(block) as readonly string[])] : []
    const idx = current.indexOf(key)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(key)
    }
    localDrafts[block.componentId] = current
    return
  }
  localDrafts[block.componentId] = key
}

function questionDraftText(block: MobileChatBlockPart): string {
  const draft = getActivityDraft(block)
  return typeof draft === 'string' ? draft : ''
}

function onQuestionInput(block: MobileChatBlockPart, event: unknown) {
  if (props.readOnly || block.state !== 'READY') return
  const payload = event as { detail?: { value?: string }; target?: { value?: string } }
  const val = typeof payload?.detail?.value === 'string'
    ? payload.detail.value
    : (typeof payload?.target?.value === 'string' ? payload.target.value : '')
  localDrafts[block.componentId] = val
}

function quizPlaceholderSlots(block: MobileChatBlockPart): string[] {
  const keys = ['A', 'B', 'C', 'D']
  return keys.slice(Math.min(keys.length, block.items.length))
}

function activityStatusLabel(block: MobileChatBlockPart): string {
  if (block.state === 'SUBMITTED') return '已提交'
  if (block.state === 'INVALID') return props.busy && !props.readOnly ? '生成中' : '不可用'
  if (block.state === 'GENERATING') return '生成中'
  if (block.component !== 'quiz') return '思考题'
  return block.meta.questionType === 'multiple' ? '多项选择' : '单项选择'
}

function activityStateMessage(block: MobileChatBlockPart): string {
  if (block.state === 'GENERATING') return '题卡正在整理生成中…'
  if (block.state === 'INVALID') return '题目未完整生成'
  if (block.state === 'SUBMITTED') return '已完成作答并提交'
  if (props.readOnly) return '历史题卡仅供查看'
  if (props.busy) return '回答生成中，完成后可提交'
  return canSubmitActivity(block) ? '选择完毕，可提交回答' : '请完成作答后提交'
}

function canSubmitActivity(block: MobileChatBlockPart): boolean {
  return createMobileActivitySubmission(block, getActivityDraft(block), Boolean(props.busy || props.readOnly)) !== null
}

function submitActivity(block: MobileChatBlockPart) {
  const submission = createMobileActivitySubmission(
    block,
    getActivityDraft(block),
    Boolean(props.busy || props.readOnly),
  )
  if (!submission) return
  emit('submit', submission.questionId, submission.answer)
}

function submittedAnswerLines(block: MobileChatBlockPart): string[] {
  const answer = block.submittedAnswer
  if (Array.isArray(answer)) {
    return answer.map((key) => {
      const option = block.items.find(item => item.key === key)
      return option ? `${key}. ${String(option.text)}` : key
    })
  }
  if (typeof answer === 'string') {
    const option = block.items.find(item => item.key === answer)
    return [option ? `${answer}. ${String(option.text)}` : answer]
  }
  return []
}
</script>

<style scoped>
.mobile-part-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-part-text {
  width: 100%;
}

.viz-card,
.activity-card {
  width: 100%;
  padding: 14px 15px;
  border-radius: 14px;
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  box-shadow: 0 2px 8px rgba(72, 62, 46, 0.04);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-card.is-submitted {
  border-color: rgba(85, 107, 61, 0.35);
}

.activity-card.is-invalid {
  opacity: 0.85;
}

.viz-card-header {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.viz-card-title {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.38;
}

.viz-card-desc {
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.45;
}

.viz-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.viz-skeleton-bar {
  height: 14px;
  border-radius: 7px;
  background-color: #F2EEE6;
}

.viz-skeleton-bar.is-short {
  width: 62%;
}

.viz-skeleton-bar.is-tall {
  height: 44px;
  border-radius: 10px;
}

.viz-invalid-note {
  font-size: 12.5px;
  color: var(--text-muted);
}

.viz-steps,
.viz-roadmap {
  display: flex;
  flex-direction: column;
}

.viz-step-row,
.viz-roadmap-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.viz-step-rail {
  width: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.viz-step-badge,
.viz-roadmap-node {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: #EEF2E6;
  border: 1px solid #DCE3CE;
  color: var(--color-sage-ink);
  font-size: 11.5px;
  font-weight: var(--font-weight-bold);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.viz-roadmap-node.is-current {
  background-color: #556B3D;
  border-color: #556B3D;
  color: #FFFFFF;
}

.viz-step-line {
  width: 1.5px;
  flex: 1;
  min-height: 12px;
  margin: 3px 0;
  background-color: #E2E6D7;
}

.viz-pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-sage-ink);
  animation: partPulse 1.2s ease-in-out infinite;
}

@keyframes partPulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}

.viz-step-body {
  flex: 1;
  min-width: 0;
  padding-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.viz-step-title,
.viz-roadmap-title {
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  line-height: 1.42;
}

.viz-step-detail {
  font-size: 13px;
  color: var(--text-secondary);
}

.viz-roadmap-card {
  flex: 1;
  min-width: 0;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 11px;
  background-color: #FAF7F2;
  border: 1px solid #EAE6DD;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
}

.viz-roadmap-card.is-current {
  background-color: #EEF2E6;
  border-color: #DCE3CE;
}

.viz-roadmap-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.viz-roadmap-tag,
.viz-roadmap-current {
  font-size: 10.5px;
  font-weight: var(--font-weight-semibold);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background-color: #EEF2E6;
  color: var(--color-sage-ink);
}

.viz-roadmap-current {
  background-color: #556B3D;
  color: #FFFFFF;
}

.viz-compare {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.viz-compare-dim {
  padding: 10px 12px;
  border-radius: 11px;
  background-color: #FAF7F2;
  border: 1px solid #EAE6DD;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.viz-compare-dim-title {
  font-size: 13.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.viz-compare-entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.viz-compare-entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.viz-compare-label {
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
  background-color: #EEF2E6;
  padding: 1px 8px;
  border-radius: var(--radius-full);
}

.viz-compare-text {
  width: 100%;
  font-size: 13.5px;
}

.viz-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.viz-proportion-track {
  width: 100%;
  height: 12px;
  border-radius: var(--radius-full);
  background-color: #F2EEE6;
  overflow: hidden;
  display: flex;
}

.viz-proportion-seg {
  height: 100%;
}

.viz-legend-list,
.viz-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.viz-legend-row,
.viz-bar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.viz-legend-left {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
}

.viz-legend-swatch {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}

.viz-legend-label,
.viz-bar-label {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viz-legend-value,
.viz-bar-value {
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
  flex-shrink: 0;
}

.viz-bar-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.viz-bar-track {
  width: 100%;
  height: 8px;
  border-radius: var(--radius-full);
  background-color: #F2EEE6;
  overflow: hidden;
}

.viz-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background-color: #6B7D4D;
  transition: width 0.25s var(--ease-out);
}

.activity-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.activity-pill {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  padding: 2px 9px;
  border-radius: var(--radius-full);
  background-color: #EEF2E6;
  border: 1px solid #DCE3CE;
  color: var(--color-sage-ink);
}

.activity-question {
  font-size: 14.5px;
  color: var(--text-primary);
}

.quiz-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quiz-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: #FAF7F2;
  border: 1px solid #EAE6DD;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.12s ease;
  box-sizing: border-box;
}

.quiz-option:active {
  transform: scale(0.99);
}

.quiz-option.is-selected {
  background-color: #EEF2E6;
  border-color: #8B9A6E;
}

.quiz-option.is-disabled {
  opacity: 0.72;
}

.quiz-option.is-placeholder {
  opacity: 0.6;
  align-items: center;
}

.quiz-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: #FFFFFF;
  border: 1px solid #DDD5C7;
  font-size: 11.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.quiz-badge.is-selected {
  background-color: #556B3D;
  border-color: #556B3D;
  color: #FFFFFF;
}

.quiz-badge.is-placeholder {
  margin-top: 0;
}

.quiz-option-text {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
}

.question-answer-box {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: #FAF7F2;
  border: 1px solid #EAE6DD;
  box-sizing: border-box;
}

.question-textarea {
  width: 100%;
  min-height: 76px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-primary);
  background-color: transparent;
}

.activity-submitted-box {
  padding: 10px 12px;
  border-radius: 11px;
  background-color: #EEF2E6;
  border: 1px solid #DCE3CE;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.submitted-label {
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
}

.submitted-item {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
}

.activity-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.activity-tip {
  font-size: 12px;
  color: var(--text-muted);
  flex: 1;
  min-width: 0;
}

.activity-submit-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background-color: #556B3D;
  color: #FFFFFF;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
}

.activity-submit-btn.disabled {
  opacity: 0.42;
}
</style>
