<script setup lang="ts">
import { FileViewer } from '@file-viewer/vue3-full'
import '@file-viewer/vue3/dist/file-viewer3.css'
import type { FileCapability } from '@/utils/filePreview'

defineProps<{
  file: File
  capability: FileCapability
}>()

const emit = defineEmits<{
  (event: 'load-start'): void
  (event: 'load-complete'): void
  (event: 'unload-complete'): void
}>()

const viewerOptions = {
  styleIsolation: 'shadow' as const,
  theme: 'light' as const,
  toolbar: {
    position: 'top' as const,
  },
}
</script>

<template>
  <div class="file-viewer-renderer" data-testid="file-viewer-renderer">
    <FileViewer
      :file="file"
      :options="viewerOptions"
      @load-start="emit('load-start')"
      @load-complete="emit('load-complete')"
      @unload-complete="emit('unload-complete')"
    />
  </div>
</template>

<style scoped>
.file-viewer-renderer {
  width: 100%;
  min-height: 460px;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--hairline, #e6e6e4);
  border-radius: 14px;
  background: var(--color-zen-ivory, #f9f9f7);
}
</style>
