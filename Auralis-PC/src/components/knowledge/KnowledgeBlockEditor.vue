<template>
  <div v-if="modelValue" class="knowledge-editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="knowledge-editor-title" @click.self="$emit('cancel')">
    <form class="knowledge-editor" @submit.prevent="submit">
      <div class="knowledge-editor-header">
        <h3 id="knowledge-editor-title">保存为知识块</h3>
        <button type="button" class="close" aria-label="关闭" @click="$emit('cancel')">×</button>
      </div>
      <label>标题<input v-model="title" maxlength="120" placeholder="例如：牛顿第二定律" /></label>
      <label>内容<textarea v-model="content" rows="7" maxlength="10000" /></label>
      <label>标签（可选）<input v-model="tagsText" maxlength="200" placeholder="用逗号分隔" /></label>
      <div class="knowledge-editor-actions">
        <button type="button" class="secondary" @click="$emit('cancel')">取消</button>
        <button type="submit" class="primary" :disabled="!title.trim() || !content.trim()">保存</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ modelValue: boolean; initialContent: string }>()
const emit = defineEmits<{ (event: 'cancel'): void; (event: 'save', value: { title: string; content: string; tags: string[] }): void }>()
const title = ref('')
const content = ref(props.initialContent)
const tagsText = ref('')
watch(() => props.modelValue, (visible) => {
  if (visible) {
    title.value = ''
    content.value = props.initialContent
    tagsText.value = ''
  }
})
const submit = () => {
  if (!title.value.trim() || !content.value.trim()) return
  emit('save', { title: title.value.trim(), content: content.value.trim(), tags: tagsText.value.split(',').map((tag) => tag.trim()).filter(Boolean) })
}
</script>

<style scoped>
.knowledge-editor-backdrop { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; background: rgba(28, 31, 27, .28); backdrop-filter: blur(3px); }
.knowledge-editor { width: min(520px, calc(100vw - 36px)); padding: 22px; border-radius: 16px; background: var(--color-zen-ivory, #faf8f3); box-shadow: 0 18px 46px rgba(37, 42, 34, .2); }
.knowledge-editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.knowledge-editor h3 { margin: 0; font-size: 17px; color: var(--text-primary); }
.knowledge-editor .close { border: 0; background: transparent; color: var(--text-muted); font-size: 22px; cursor: pointer; }
.knowledge-editor label { display: grid; gap: 6px; margin-top: 12px; color: var(--text-secondary); font-size: 12px; }
.knowledge-editor input, .knowledge-editor textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 9px 10px; background: rgba(255,255,255,.55); color: var(--text-primary); font: inherit; resize: vertical; }
.knowledge-editor-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.knowledge-editor-actions button { border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
.knowledge-editor-actions .secondary { background: rgba(127, 147, 114, .1); color: var(--text-secondary); }
.knowledge-editor-actions .primary { background: var(--color-primary-accent, #7d9372); color: white; }
.knowledge-editor-actions button:disabled { opacity: .45; cursor: not-allowed; }
</style>
