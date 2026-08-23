<script setup lang="ts">
import { ref } from 'vue'
import { FileViewer } from '@file-viewer/vue3-full'
import '@file-viewer/vue3/dist/file-viewer3.css'
import type { FileCapability } from '@/utils/filePreview'
import type { FileViewerExpose, FileViewerViewStateChange } from '@file-viewer/vue3-full'

defineProps<{
  file: File
  capability: FileCapability
}>()

const emit = defineEmits<{
  (event: 'load-start'): void
  (event: 'load-complete'): void
  (event: 'unload-complete'): void
  (event: 'page-change', page: number, total: number): void
}>()

const viewerRef = ref<FileViewerExpose | null>(null)

const viewerOptions = {
  styleIsolation: 'none' as const,
  theme: 'light' as const,
  toolbar: false,
  pdf: {
    toolbar: false,
    navigation: false,
  },
}

const currentState = ref({
  page: 1,
  pageCount: 1,
  rotation: 0,
})

function onViewStateChange(change: FileViewerViewStateChange): void {
  if (change.state.page !== undefined) currentState.value.page = change.state.page
  if (change.state.pageCount !== undefined) currentState.value.pageCount = change.state.pageCount
  if (change.state.rotation !== undefined) currentState.value.rotation = change.state.rotation
  emit('page-change', currentState.value.page, currentState.value.pageCount)
}

function applyPage(page: number): Promise<unknown> | undefined {
  return viewerRef.value?.applyViewState({
    page,
    pageCount: currentState.value.pageCount,
  })
}

function rotate(): Promise<unknown> | undefined {
  const nextRotation = (currentState.value.rotation + 90) % 360
  return viewerRef.value?.applyViewState({
    rotation: nextRotation,
  })
}

defineExpose({
  zoomIn: () => viewerRef.value?.zoomIn(),
  zoomOut: () => viewerRef.value?.zoomOut(),
  resetZoom: () => viewerRef.value?.resetZoom(),
  rotate,
  prevPage: () => currentState.value.page > 1 ? applyPage(currentState.value.page - 1) : undefined,
  nextPage: () => currentState.value.page < currentState.value.pageCount
    ? applyPage(currentState.value.page + 1)
    : undefined,
})
</script>

<template>
  <div class="file-viewer-renderer" data-testid="file-viewer-renderer">
    <FileViewer
      ref="viewerRef"
      :file="file"
      :options="viewerOptions"
      @load-start="emit('load-start')"
      @load-complete="emit('load-complete')"
      @unload-complete="emit('unload-complete')"
      @view-state-change="onViewStateChange"
    />
  </div>
</template>

<style scoped>
.file-viewer-renderer {
  width: 100%;
  height: 100%;
}
</style>
