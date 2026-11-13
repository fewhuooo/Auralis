<script setup lang="ts">
import { computed } from 'vue'
import { createChatActivitySubmission } from '@/services/chatContentProjection'
import { renderMarkdown } from '@/utils/markdown'
import type { ChatActivityAnswer, ChatActivityDraft, ChatBlockPart } from '@/types/chatContent'

const props = defineProps<{
  block: ChatBlockPart
  draft: ChatActivityDraft
  busy?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{
  draftChange: [componentId: string, draft: ChatActivityDraft]
  submit: [questionId: string, answer: ChatActivityAnswer]
}>()

const isQuiz = computed(() => props.block.component === 'quiz')
const isMultiple = computed(() => props.block.meta.questionType === 'multiple')
const question = computed(() => (typeof props.block.meta.question === 'string' ? props.block.meta.question : ''))
const placeholder = computed(() => (typeof props.block.meta.placeholder === 'string' ? props.block.meta.placeholder : ''))
const selectedKeys = computed(() =>
  Array.isArray(props.draft)
    ? props.draft
    : typeof props.draft === 'string'
    ? [props.draft]
    : []
)
const questionDraft = computed(() => (typeof props.draft === 'string' ? props.draft : ''))
const submission = computed(() => createChatActivitySubmission(props.block, props.draft, Boolean(props.busy || props.readOnly)))
const answerDisabled = computed(() => props.readOnly || props.block.state === 'INVALID')
const placeholderSlots = computed(() => {
  if (props.block.state !== 'GENERATING' || !isQuiz.value) return []
  const currentCount = props.block.items.length
  const targetCount = 4
  const slots: number[] = []
  for (let i = currentCount; i < targetCount; i++) {
    slots.push(i)
  }
  return slots
})
const stateMessage = computed(() => {
  if (props.block.state === 'GENERATING') return '题卡仍在整理生成中…'
  if (props.block.state === 'INVALID') return '题目未完整生成'
  if (props.block.state === 'SUBMITTED') return '已完成作答并提交'
  if (props.readOnly) return '历史题卡仅供查看'
  if (props.busy) return '当前会话正在处理，请稍后提交'
  return submission.value ? '选择完毕，可以提交回答' : '请阅读题目并选择你的答案'
})
const statusLabel = computed(() => {
  if (props.block.state === 'SUBMITTED') return '已提交'
  if (props.block.state === 'INVALID') return props.busy && !props.readOnly ? '生成中' : '不可用'
  if (props.block.state === 'GENERATING') return '生成中'
  if (!isQuiz.value) return '思考题'
  return isMultiple.value ? '多项思考题' : '单项选择'
})

const submittedAnswer = computed((): string[] => {
  const answer = props.block.submittedAnswer
  if (Array.isArray(answer)) {
    return answer.map((key) => {
      const option = props.block.items.find((item) => item.key === key)
      return option ? `${key}. ${String(option.text)}` : key
    })
  }
  if (typeof answer === 'string') {
    const option = props.block.items.find((item) => item.key === answer)
    return [option ? `${answer}. ${String(option.text)}` : answer]
  }
  return []
})

function setSingleAnswer(key: string): void {
  emit('draftChange', props.block.componentId, key)
}

function toggleMultipleAnswer(key: string, checked: boolean): void {
  const next = new Set(selectedKeys.value)
  if (checked) next.add(key)
  else next.delete(key)
  emit('draftChange', props.block.componentId, [...next])
}

function setQuestionAnswer(event: Event): void {
  emit('draftChange', props.block.componentId, (event.target as HTMLTextAreaElement).value)
}

function submit(): void {
  if (submission.value) emit('submit', submission.value.questionId, submission.value.answer)
}
</script>

<template>
  <section
    class="chat-activity"
    :class="{
      'chat-activity--submitted': block.state === 'SUBMITTED',
      'chat-activity--invalid': block.state === 'INVALID',
    }"
    :aria-labelledby="`chat-question-${block.componentId}`"
  >
    <header class="chat-activity__header">
      <div class="chat-activity__heading">
        <span class="chat-activity__status-pill">
          {{ statusLabel }}
        </span>
      </div>
    </header>

    <div
      :id="`chat-question-${block.componentId}`"
      class="chat-activity__question"
    >
      <div v-if="question" v-html="renderMarkdown(question, block.state === 'GENERATING')" />
      <div v-else-if="block.state === 'GENERATING' || (block.state === 'INVALID' && busy && !readOnly)" class="question-skeleton" aria-hidden="true">
        <span class="question-shimmer-line" />
      </div>
      <div v-else-if="block.state === 'INVALID'" class="invalid-question-text">
        {{ question || '题目未完整生成' }}
      </div>
    </div>

    <fieldset v-if="isQuiz && block.state !== 'SUBMITTED'" class="chat-activity__options">
      <legend class="sr-only">{{ question }}</legend>
      <label
        v-for="(item, index) in block.items"
        :key="`${block.componentId}-option-${index}`"
        class="chat-activity__option"
        :class="{
          'is-selected': selectedKeys.includes(String(item.key)),
          'is-disabled': answerDisabled,
        }"
      >
        <input
          v-if="isMultiple"
          type="checkbox"
          class="chat-activity__native-input"
          :checked="selectedKeys.includes(String(item.key))"
          :value="item.key"
          :disabled="answerDisabled"
          @change="toggleMultipleAnswer(String(item.key), ($event.target as HTMLInputElement).checked)"
        >
        <input
          v-else
          type="radio"
          class="chat-activity__native-input"
          :name="`chat-answer-${block.componentId}`"
          :checked="selectedKeys.includes(String(item.key))"
          :value="item.key"
          :disabled="answerDisabled"
          @change="setSingleAnswer(String(item.key))"
        >
        <span class="chat-activity__badge" aria-hidden="true">
          <span class="badge-char">{{ item.key }}</span>
          <svg
            v-if="selectedKeys.includes(String(item.key))"
            class="badge-check-icon"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="chat-activity__option-text">{{ item.text }}</span>
      </label>

      <!-- 定高虚线预留槽位 (Pre-allocated Slot Filling) -->
      <template v-if="block.state === 'GENERATING'">
        <div
          v-for="slotIdx in placeholderSlots"
          :key="`${block.componentId}-slot-${slotIdx}`"
          class="chat-activity__option-slot"
          aria-hidden="true"
        >
          <span class="chat-activity__badge chat-activity__badge--placeholder">
            <span class="badge-char">{{ ['A', 'B', 'C', 'D'][slotIdx] || '·' }}</span>
          </span>
          <span class="slot-text-skeleton">
            <span class="slot-shimmer-bar" />
          </span>
        </div>
      </template>
    </fieldset>

    <div v-if="!isQuiz && block.state !== 'SUBMITTED' && !readOnly" class="chat-activity__answer-field">
      <label class="sr-only" :for="`chat-answer-text-${block.componentId}`">你的回答</label>
      <textarea
        :id="`chat-answer-text-${block.componentId}`"
        :value="questionDraft"
        :placeholder="placeholder || '写下你的想法…'"
        :disabled="block.state === 'INVALID'"
        rows="4"
        @input="setQuestionAnswer"
      />
    </div>

    <div v-if="block.state === 'SUBMITTED'" class="chat-activity__submitted" aria-live="polite">
      <span class="submitted-label">你的作答记录</span>
      <p v-for="(answer, index) in submittedAnswer" :key="index" class="submitted-item">{{ answer }}</p>
    </div>

    <footer class="chat-activity__footer">
      <p role="status" class="chat-activity__tip">{{ stateMessage }}</p>
      <button
        v-if="block.state !== 'SUBMITTED' && !answerDisabled"
        type="button"
        class="chat-activity__submit-btn"
        :disabled="!submission"
        @click="submit"
      >
        提交回答
      </button>
    </footer>
  </section>
</template>

<style scoped>
.chat-activity {
  max-width: 720px;
  margin: 16px 0 20px;
  padding: 18px 20px 16px;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 24%, var(--border-default, #e5e0d8));
  border-radius: 16px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--text-primary);
  box-shadow: 0 4px 18px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 7%, transparent), 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-activity__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-activity__heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-activity__status-pill {
  padding: 1.5px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 14%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 26%, transparent);
  color: var(--color-sage-dark, #5c6b44);
  font-size: 10.5px;
  font-weight: 600;
}

.chat-activity__question {
  margin: 14px 0 16px;
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--text-primary);
}

.chat-activity__question :deep(p) {
  margin: 0 0 6px;
}

.chat-activity__question :deep(p:last-child) {
  margin-bottom: 0;
}

/* De-formified Options */
.chat-activity__options {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  padding: 0;
  border: 0;
}

.chat-activity__option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-subtle, #e0deda) 80%, transparent);
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 40%, var(--color-bg-card, #ffffff));
  cursor: pointer;
  user-select: none;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-activity__option:hover {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 8%, var(--color-bg-card, #ffffff));
  border-color: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 40%, var(--border-subtle, #e0deda));
  transform: translateY(-1px);
}

.chat-activity__option.is-selected {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, var(--color-bg-card, #ffffff));
  border-color: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 65%, var(--border-default, #e5e0d8));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, transparent);
}

.chat-activity__native-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.chat-activity__badge {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-bg-card, #ffffff) 85%, var(--border-subtle, #e0deda));
  border: 1px solid var(--border-subtle, #e0deda);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 700;
  font-family: var(--font-family-mono, inherit);
  flex-shrink: 0;
  transition: all 0.18s ease;
}

.chat-activity__option.is-selected .chat-activity__badge {
  background: var(--color-zen-sage, #8b9a6e);
  border-color: var(--color-sage-dark, #5c6b44);
  color: #ffffff;
  transform: scale(1.05);
}

.chat-activity__option.is-selected .badge-char {
  display: none;
}

.badge-check-icon {
  display: block;
}

.chat-activity__option-text {
  flex: 1;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-primary);
}

/* 预留定高虚线槽位 (Pre-allocated Slot Filling) */
.chat-activity__option-slot {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  box-sizing: border-box;
  padding: 8px 14px;
  border-radius: 12px;
  border: 1.5px dashed color-mix(in srgb, var(--border-subtle, #e0deda) 85%, transparent);
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 25%, transparent);
  opacity: 0.7;
}

.chat-activity__badge--placeholder {
  background: transparent;
  border: 1px dashed color-mix(in srgb, var(--border-subtle, #e0deda) 90%, transparent);
  color: var(--text-muted);
}

.slot-text-skeleton {
  flex: 1;
  display: flex;
  align-items: center;
}

.slot-shimmer-bar {
  width: 55%;
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--border-subtle, #e0deda) 40%, transparent) 0%,
    color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 22%, transparent) 50%,
    color-mix(in srgb, var(--border-subtle, #e0deda) 40%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: slot-shimmer 2s infinite ease-in-out;
}

.question-skeleton {
  height: 24px;
  display: flex;
  align-items: center;
}

.question-shimmer-line {
  width: 75%;
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--border-subtle, #e0deda) 40%, transparent) 0%,
    color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 20%, transparent) 50%,
    color-mix(in srgb, var(--border-subtle, #e0deda) 40%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: slot-shimmer 2s infinite ease-in-out;
}

@keyframes slot-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.invalid-question-text {
  color: var(--color-warning, #d9822b);
  font-size: 13.5px;
}

/* Open Answer Field */
.chat-activity__answer-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 96px;
  resize: vertical;
  padding: 12px 14px;
  border: 1px solid var(--border-default, #dcd8d0);
  border-radius: 10px;
  background: var(--color-bg-primary, #f5f1eb);
  color: var(--text-primary);
  font: inherit;
  font-size: 13.5px;
  line-height: 1.6;
}

.chat-activity__answer-field textarea:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 62%, transparent);
  outline-offset: 1px;
}

/* Submitted State */
.chat-activity__submitted {
  padding: 12px 14px;
  border-left: 3px solid var(--color-zen-sage, #8b9a6e);
  border-radius: 0 10px 10px 0;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 8%, var(--color-bg-card, #ffffff));
}

.submitted-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-sage-dark, #5c6b44);
  margin-bottom: 4px;
}

.submitted-item {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-primary);
}

/* Footer */
.chat-activity__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 20%, var(--border-subtle, #e0deda));
}

.chat-activity__tip {
  margin: 0;
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.4;
}

.chat-activity__submit-btn {
  flex: none;
  padding: 7px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--color-zen-sage, #8b9a6e);
  color: #ffffff;
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.16s ease;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 30%, transparent);
}

.chat-activity__submit-btn:hover:not(:disabled) {
  background: var(--color-sage-dark, #5c6b44);
  transform: translateY(-1px);
}

.chat-activity__submit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.chat-activity--invalid {
  border-color: color-mix(in srgb, var(--color-warning, #d97706) 72%, var(--border-default, #e5e0d8));
}

.chat-activity__option.is-disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.invalid-question-text {
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--text-primary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 620px) {
  .chat-activity {
    padding: 15px 14px;
  }
  .chat-activity__footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .chat-activity__submit-btn {
    align-self: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-activity,
  .chat-activity__option,
  .chat-activity__submit-btn {
    transition: none;
  }
}
</style>
