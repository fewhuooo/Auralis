<script setup lang="ts">
import { ref } from 'vue'
import { FileViewer } from '@file-viewer/vue3-full'
import '@file-viewer/vue3/dist/file-viewer3.css'
import type { FileCapability } from '@/utils/filePreview'
import type { FileViewerExpose, FileViewerViewStateChange, FileViewerZoomState } from '@file-viewer/vue3-full'

defineProps<{
  file: File
  capability: FileCapability
}>()

const emit = defineEmits<{
  (event: 'load-start'): void
  (event: 'load-complete'): void
  (event: 'unload-complete'): void
  (event: 'ready-change', ready: boolean): void
  (event: 'page-change', page: number, total: number): void
  (event: 'zoom-change', state: FileViewerZoomState): void
  (event: 'rotation-change', rotation: number): void
}>()

const viewerRef = ref<FileViewerExpose | null>(null)
const isReady = ref(false)
const pendingActions: Array<() => Promise<unknown> | unknown> = []

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
const defaultZoomState: FileViewerZoomState = {
  scale: 1,
  label: '100%',
  canZoomIn: true,
  canZoomOut: true,
  canReset: false,
}
const currentZoom = ref<FileViewerZoomState>(defaultZoomState)

function onZoomChange(state: FileViewerZoomState): void {
  currentZoom.value = state
  emit('zoom-change', state)
}

function onViewStateChange(change: FileViewerViewStateChange): void {
  if (change.state.page !== undefined) currentState.value.page = change.state.page
  if (change.state.pageCount !== undefined) currentState.value.pageCount = change.state.pageCount
  if (change.state.rotation !== undefined) currentState.value.rotation = change.state.rotation
  if (change.state.zoom !== undefined) onZoomChange(change.state.zoom)
  emit('page-change', currentState.value.page, currentState.value.pageCount)
}

async function applyZoom(action: () => Promise<FileViewerZoomState>): Promise<FileViewerZoomState> {
  const state = await action()
  onZoomChange(state)
  return state
}

function applyPage(page: number): Promise<unknown> | undefined {
  return viewerRef.value?.applyViewState({
    page,
    pageCount: currentState.value.pageCount,
  })
}

function runViewerAction(action: () => Promise<unknown> | unknown): Promise<unknown> {
  if (!viewerRef.value || !isReady.value) {
    pendingActions.push(action)
    return Promise.resolve(null)
  }
  return Promise.resolve(action())
}

async function flushPendingActions(): Promise<void> {
  if (!viewerRef.value || !isReady.value || pendingActions.length === 0) return
  const actions = pendingActions.splice(0)
  for (const action of actions) await action()
}

function handleLoadStart(): void {
  isReady.value = false
  currentState.value.rotation = 0
  currentZoom.value = defaultZoomState
  emit('ready-change', false)
  emit('load-start')
}

async function handleLoadComplete(): Promise<void> {
  isReady.value = true
  const zoomState = viewerRef.value?.getZoomState()
  if (zoomState) onZoomChange(zoomState)
  emit('ready-change', true)
  emit('load-complete')
  await flushPendingActions()
}

function handleUnloadComplete(): void {
  isReady.value = false
  pendingActions.splice(0)
  currentState.value.rotation = 0
  currentZoom.value = defaultZoomState
  emit('ready-change', false)
  emit('unload-complete')
}

function rotate(delta: number): Promise<number> {
  const nextRotation = (currentState.value.rotation + delta + 360) % 360
  currentState.value.rotation = nextRotation
  emit('rotation-change', nextRotation)
  return Promise.resolve(nextRotation)
}

defineExpose({
  zoomIn: () => runViewerAction(() => applyZoom(() => viewerRef.value!.zoomIn())),
  zoomOut: () => runViewerAction(() => applyZoom(() => viewerRef.value!.zoomOut())),
  resetZoom: () => runViewerAction(() => applyZoom(() => viewerRef.value!.resetZoom())),
  rotateLeft: () => runViewerAction(() => rotate(-90)),
  rotateRight: () => runViewerAction(() => rotate(90)),
  prevPage: () => runViewerAction(() => currentState.value.page > 1
    ? applyPage(currentState.value.page - 1)
    : undefined),
  nextPage: () => runViewerAction(() => currentState.value.page < currentState.value.pageCount
    ? applyPage(currentState.value.page + 1)
    : undefined),
})
</script>

<template>
  <div class="file-viewer-renderer" data-testid="file-viewer-renderer">
    <div
      class="file-viewer-rotation-layer"
      :style="{ transform: `rotate(${currentState.rotation}deg)` }"
    >
      <FileViewer
        ref="viewerRef"
        :file="file"
        :options="viewerOptions"
        @load-start="handleLoadStart"
        @load-complete="handleLoadComplete"
        @unload-complete="handleUnloadComplete"
        @zoom-change="onZoomChange"
        @view-state-change="onViewStateChange"
      />
    </div>
  </div>
</template>

<style scoped>
.file-viewer-renderer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
}

.file-viewer-rotation-layer {
  width: 100%;
  height: 100%;
  transform-origin: center;
  transition: transform 160ms ease;
}
</style>
