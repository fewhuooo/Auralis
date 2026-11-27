<template>
  <div class="markdown-rich-text" v-html="nodes"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdownHtml } from '@/utils/markdown'

const props = defineProps<{
  content: string
  streaming?: boolean
}>()

const nodes = computed(() => renderMarkdownHtml(props.content, { isStreaming: props.streaming }))
</script>

<style scoped>
.markdown-rich-text {
  display: block;
  width: 100%;
  font-size: 14.5px;
  line-height: 1.72;
  color: var(--text-primary);
  word-break: break-word;
}
</style>
