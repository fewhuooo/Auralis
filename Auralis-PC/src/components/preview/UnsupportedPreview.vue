<script setup lang="ts">
withDefaults(defineProps<{
  message?: string
}>(), {
  message: '此文件暂不支持在线预览',
})
</script>

<template>
  <div class="unsupported-preview" role="status">
    <div class="unsupported-preview-icon" aria-hidden="true">⊘</div>
    <strong>{{ message }}</strong>
    <p>你仍可以下载原文件，或稍后使用支持的格式重新登记。</p>
  </div>
</template>

<style scoped>
.unsupported-preview {
  min-height: 320px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  padding: 32px;
  color: var(--text-secondary, #656560);
  text-align: center;
  border: 1px dashed var(--hairline, #e6e6e4);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.35);
}

.unsupported-preview-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 50%;
  color: var(--stone, #a8a8a5);
  background: rgba(168, 168, 165, 0.14);
  font-size: 24px;
}

.unsupported-preview p {
  margin: 0;
  color: var(--text-muted, #8a8a84);
  font-size: 13px;
}
</style>
