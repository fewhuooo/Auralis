<script setup lang="ts">
import { reactive, watch } from 'vue'
import ChatActivityCard from '@/components/chat/ChatActivityCard.vue'
import ChatContentBlock from '@/components/chat/ChatContentBlock.vue'
import { createChatContentProjectionState, getChatActivityDraft, projectChatContentParts, updateChatActivityDraft } from '@/services/chatContentProjection'
import { renderMarkdown } from '@/utils/markdown'
import type { ChatActivityAnswer, ChatActivityDraft, ChatContentPart, ChatContentProjectionState } from '@/types/chatContent'

const props = withDefaults(defineProps<{
  parts: readonly ChatContentPart[]
  busy?: boolean
}>(), { busy: false })

const emit = defineEmits<{
  draftChange: [componentId: string, draft: ChatActivityDraft]
  submit: [questionId: string, answer: ChatActivityAnswer]
}>()

const projection = reactive<ChatContentProjectionState>(createChatContentProjectionState())

watch(() => props.parts, (parts) => {
  projection.parts = projectChatContentParts(parts)
}, { immediate: true, deep: true })

function draftFor(part: Extract<ChatContentPart, { kind: 'block' }>): ChatActivityDraft {
  return getChatActivityDraft(projection, part)
}

function onDraftChange(componentId: string, draft: ChatActivityDraft): void {
  const updated = updateChatActivityDraft(projection, componentId, draft)
  projection.drafts = updated.drafts
  emit('draftChange', componentId, draft)
}

function onSubmit(questionId: string, answer: ChatActivityAnswer): void {
  emit('submit', questionId, answer)
}
</script>

<template>
  <div class="chat-content-renderer">
    <template v-for="part in projection.parts" :key="part.id">
      <div v-if="part.kind === 'text'" class="chat-content-renderer__text" v-html="renderMarkdown(part.text)" />
      <ChatContentBlock
        v-else-if="part.component === 'steps' || part.component === 'compare' || part.component === 'roadmap' || part.component === 'chart'"
        :block="part"
      />
      <ChatActivityCard
        v-else
        :block="part"
        :draft="draftFor(part)"
        :busy="busy"
        @draft-change="onDraftChange"
        @submit="onSubmit"
      />
    </template>
  </div>
</template>

<style scoped>
.chat-content-renderer{min-width:0;color:var(--text-primary);font-family:var(--font-family-base)}.chat-content-renderer__text{overflow-wrap:anywhere;font-size:14px;line-height:1.78}.chat-content-renderer__text :deep(p){margin:0 0 10px}.chat-content-renderer__text :deep(p:last-child){margin-bottom:0}.chat-content-renderer__text :deep(pre){overflow:auto;max-width:100%;padding:12px 14px;border:1px solid var(--border-subtle);border-radius:9px;background:var(--color-bg-primary);font-family:var(--font-family-mono);font-size:12px;line-height:1.6}.chat-content-renderer__text :deep(code){font-family:var(--font-family-mono);font-size:.92em}.chat-content-renderer__text :deep(blockquote){margin:10px 0;padding:2px 0 2px 13px;border-left:2px solid var(--color-zen-sage);color:var(--text-muted)}.chat-content-renderer__text :deep(a){color:var(--color-sage-dark);text-decoration:underline;text-underline-offset:2px}.chat-content-renderer__text :deep(.katex-display-wrapper){max-width:100%;overflow-x:auto;overflow-y:hidden}
</style>
