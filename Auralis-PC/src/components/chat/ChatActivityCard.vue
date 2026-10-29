<script setup lang="ts">
import { computed } from 'vue'
import { createChatActivitySubmission } from '@/services/chatContentProjection'
import { renderMarkdown } from '@/utils/markdown'
import type { ChatActivityAnswer, ChatActivityDraft, ChatBlockPart } from '@/types/chatContent'

const props = defineProps<{
  block: ChatBlockPart
  draft: ChatActivityDraft
  busy?: boolean
}>()

const emit = defineEmits<{
  draftChange: [componentId: string, draft: ChatActivityDraft]
  submit: [questionId: string, answer: ChatActivityAnswer]
}>()

const isQuiz = computed(() => props.block.component === 'quiz')
const isMultiple = computed(() => props.block.meta.questionType === 'multiple')
const question = computed(() => typeof props.block.meta.question === 'string' ? props.block.meta.question : '')
const placeholder = computed(() => typeof props.block.meta.placeholder === 'string' ? props.block.meta.placeholder : '')
const selectedKeys = computed(() => Array.isArray(props.draft)
  ? props.draft
  : typeof props.draft === 'string' ? [props.draft] : [])
const questionDraft = computed(() => typeof props.draft === 'string' ? props.draft : '')
const submission = computed(() => createChatActivitySubmission(props.block, props.draft, Boolean(props.busy)))
const stateMessage = computed(() => {
  if (props.block.state === 'GENERATING') return '題卡仍在生成，草稿會保留。'
  if (props.block.state === 'INVALID') return '這張題卡無法提交。'
  if (props.block.state === 'SUBMITTED') return '已提交'
  return submission.value ? '準備好後即可提交。' : '請完成題目並檢查答案。'
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
    :class="{ 'chat-activity--submitted': block.state === 'SUBMITTED', 'chat-activity--invalid': block.state === 'INVALID' }"
    :aria-labelledby="`chat-question-${block.componentId}`"
  >
    <header class="chat-activity__header">
      <span class="chat-activity__mark" aria-hidden="true">{{ isQuiz ? 'Q' : 'A' }}</span>
      <div class="chat-activity__heading">
        <span>{{ isQuiz ? '想一想' : '說出你的想法' }}</span>
        <small>{{ block.state === 'SUBMITTED' ? '已提交' : block.state === 'INVALID' ? '暫不可用' : block.state === 'GENERATING' ? '正在整理題目' : '可以作答' }}</small>
      </div>
    </header>

    <div :id="`chat-question-${block.componentId}`" class="chat-activity__question" v-html="renderMarkdown(question)" />

    <fieldset v-if="isQuiz && block.state !== 'SUBMITTED'" class="chat-activity__options">
      <legend class="sr-only">{{ question }}</legend>
      <label v-for="(item, index) in block.items" :key="`${block.componentId}-option-${index}`" class="chat-activity__option">
        <input
          v-if="isMultiple"
          type="checkbox"
          :checked="selectedKeys.includes(String(item.key))"
          :value="item.key"
          @change="toggleMultipleAnswer(String(item.key), ($event.target as HTMLInputElement).checked)"
        >
        <input
          v-else
          type="radio"
          :name="`chat-answer-${block.componentId}`"
          :checked="selectedKeys.includes(String(item.key))"
          :value="item.key"
          @change="setSingleAnswer(String(item.key))"
        >
        <span class="chat-activity__option-key">{{ item.key }}</span>
        <span class="chat-activity__option-text">{{ item.text }}</span>
      </label>
    </fieldset>

    <div v-if="!isQuiz && block.state !== 'SUBMITTED'" class="chat-activity__answer-field">
      <label class="sr-only" :for="`chat-answer-text-${block.componentId}`">你的回答</label>
      <textarea
        :id="`chat-answer-text-${block.componentId}`"
        :value="questionDraft"
        :placeholder="placeholder || '写下你的想法…'"
        rows="4"
        @input="setQuestionAnswer"
      />
    </div>

    <div v-if="block.state === 'SUBMITTED'" class="chat-activity__submitted" aria-live="polite">
      <span>你的回答</span>
      <p v-for="(answer, index) in submittedAnswer" :key="index">{{ answer }}</p>
    </div>

    <footer class="chat-activity__footer">
      <p role="status">{{ stateMessage }}</p>
      <button v-if="block.state !== 'SUBMITTED'" type="button" :disabled="!submission" @click="submit">提交回答</button>
    </footer>
  </section>
</template>

<style scoped>
.chat-activity{max-width:720px;margin:16px 0;padding:20px 22px 18px;border:1px solid color-mix(in srgb,var(--color-zen-sage) 28%,var(--border-default));border-radius:15px;background:var(--color-bg-card);color:var(--text-primary);box-shadow:0 4px 18px color-mix(in srgb,var(--color-zen-sage) 7%,transparent)}.chat-activity__header{display:flex;align-items:center;gap:11px}.chat-activity__mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:color-mix(in srgb,var(--color-zen-sage) 13%,var(--color-bg-card));color:var(--color-sage-dark);font-size:12px;font-weight:700}.chat-activity__heading{display:flex;align-items:baseline;gap:9px}.chat-activity__heading>span{font-size:13px;font-weight:650}.chat-activity__heading small{color:var(--text-muted);font-size:11px}.chat-activity__question{margin:17px 0 15px;font-size:15px;line-height:1.75}.chat-activity__question :deep(p){margin:0 0 8px}.chat-activity__question :deep(p:last-child){margin-bottom:0}.chat-activity__options{display:grid;gap:8px;margin:0;padding:0;border:0}.chat-activity__option{display:grid;grid-template-columns:18px 28px minmax(0,1fr);align-items:start;gap:10px;padding:11px 12px;border:1px solid var(--border-subtle);border-radius:10px;background:color-mix(in srgb,var(--color-bg-primary) 50%,var(--color-bg-card));cursor:pointer;transition:border-color .16s ease,background .16s ease}.chat-activity__option:has(input:checked){border-color:color-mix(in srgb,var(--color-zen-sage) 58%,var(--border-default));background:color-mix(in srgb,var(--color-zen-sage) 8%,var(--color-bg-card))}.chat-activity__option input{width:16px;height:16px;margin:2px 0 0;accent-color:var(--color-zen-sage)}.chat-activity__option-key{color:var(--text-muted);font-size:12px;font-weight:650}.chat-activity__option-text{font-size:13px;line-height:1.6}.chat-activity__answer-field textarea{box-sizing:border-box;width:100%;min-height:106px;resize:vertical;padding:12px 13px;border:1px solid var(--border-default);border-radius:10px;background:var(--color-bg-primary);color:var(--text-primary);font:inherit;line-height:1.65}.chat-activity__answer-field textarea:focus-visible{outline:2px solid color-mix(in srgb,var(--color-zen-sage) 62%,transparent);outline-offset:2px}.chat-activity__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:15px}.chat-activity__footer p{margin:0;color:var(--text-muted);font-size:11px;line-height:1.5}.chat-activity__footer button{flex:none;padding:8px 15px;border:0;border-radius:8px;background:var(--color-zen-sage);color:#fff;font:inherit;font-size:12px;font-weight:650;cursor:pointer}.chat-activity__footer button:hover:not(:disabled){background:var(--color-sage-dark)}.chat-activity__footer button:disabled{opacity:.48;cursor:not-allowed}.chat-activity__submitted{padding:13px 14px;border-left:2px solid var(--color-zen-sage);border-radius:0 8px 8px 0;background:color-mix(in srgb,var(--color-zen-sage) 7%,var(--color-bg-card))}.chat-activity__submitted>span{color:var(--text-muted);font-size:11px}.chat-activity__submitted p{margin:5px 0 0;font-size:13px;line-height:1.55}.chat-activity--invalid{border-color:color-mix(in srgb,var(--color-warning) 72%,var(--border-default))}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:620px){.chat-activity{padding:16px 15px}.chat-activity__footer{align-items:flex-start;flex-direction:column}.chat-activity__footer button{align-self:flex-end}}@media(prefers-reduced-motion:reduce){.chat-activity__option{transition:none}}
</style>
