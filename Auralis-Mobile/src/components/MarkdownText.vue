<template>
  <rich-text class="markdown-rich-text" :nodes="nodes" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdownHtml } from '@/utils/markdown'

const props = defineProps<{
  content: string
}>()

const nodes = computed(() => renderMarkdownHtml(props.content))
</script>

<style scoped>
.markdown-rich-text {
  display: block;
  width: 100%;
  word-break: break-word;
}
</style>
