<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileViewer as BaseFileViewer } from '@file-viewer/vue3'
import { withFullViewerOptions } from '@file-viewer/vue3-full'
import '@file-viewer/vue3/dist/file-viewer3.css'
import type { FileCapability } from '@/utils/filePreview'
import { isOfficeFile } from '@/services/documentParser/fileViewerBridge'
import type { FileViewerExpose, FileViewerViewStateChange, FileViewerZoomState } from '@file-viewer/vue3'

const props = defineProps<{
  file: File
  capability: FileCapability
}>()

const isOfficeParserCapable = computed(() => props.capability.kind === 'office' && isOfficeFile(props.file))

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

const viewerOptions = withFullViewerOptions({
  styleIsolation: 'none' as const,
  theme: 'light' as const,
  toolbar: false,
  fit: {
    mode: 'width' as const,
    resize: 'until-interaction' as const,
  },
  pdf: {
    toolbar: false,
    navigation: false,
  },
})

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
const rotationHandledByViewer = ref(true)

function onZoomChange(state: FileViewerZoomState | null | undefined): void {
  if (!state) return
  currentZoom.value = state
  emit('zoom-change', state)
}

function onViewStateChange(change: FileViewerViewStateChange): void {
  if (change.state.page !== undefined) currentState.value.page = change.state.page
  if (change.state.pageCount !== undefined) currentState.value.pageCount = change.state.pageCount
  if (change.state.rotation !== undefined) {
    rotationHandledByViewer.value = true
    currentState.value.rotation = change.state.rotation
    emit('rotation-change', change.state.rotation)
  }
  if (change.state.zoom !== undefined) onZoomChange(change.state.zoom)
  emit('page-change', currentState.value.page, currentState.value.pageCount)
}

async function zoomIn(): Promise<FileViewerZoomState> {
  const viewer = viewerRef.value!
  const state = await viewer.zoomIn()
  onZoomChange(state)
  return state
}

async function zoomOut(): Promise<FileViewerZoomState> {
  const viewer = viewerRef.value!
  const state = await viewer.zoomOut()
  onZoomChange(state)
  return state
}

async function resetZoom(): Promise<FileViewerZoomState> {
  const viewer = viewerRef.value!
  const state = await viewer.resetZoom()
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
  if (!viewerRef.value) {
    pendingActions.push(action)
    return Promise.resolve(null)
  }
  return Promise.resolve(action())
}

async function flushPendingActions(): Promise<void> {
  if (!viewerRef.value || pendingActions.length === 0) return
  const actions = pendingActions.splice(0)
  for (const action of actions) await action()
}

function handleLoadStart(): void {
  isReady.value = false
  currentState.value.rotation = 0
  rotationHandledByViewer.value = true
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
  rotationHandledByViewer.value = true
  currentZoom.value = defaultZoomState
  emit('ready-change', false)
  emit('unload-complete')
}

async function rotate(delta: number): Promise<number> {
  const viewer = viewerRef.value!
  const nextRotation = (currentState.value.rotation + delta + 360) % 360
  const appliedState = await viewer.applyViewState({ rotation: nextRotation }, {
    action: delta < 0 ? 'rotate-left' : 'rotate-right',
    source: 'api',
  })
  const appliedRotation = appliedState?.rotation ?? viewer.getViewState()?.rotation
  if (typeof appliedRotation === 'number' && Number.isFinite(appliedRotation)) {
    rotationHandledByViewer.value = true
    currentState.value.rotation = appliedRotation
  } else {
    rotationHandledByViewer.value = false
    currentState.value.rotation = nextRotation
  }
  emit('rotation-change', currentState.value.rotation)
  return currentState.value.rotation
}

defineExpose({
  zoomIn: () => runViewerAction(() => zoomIn()),
  zoomOut: () => runViewerAction(() => zoomOut()),
  resetZoom: () => runViewerAction(() => resetZoom()),
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
  <div
    class="file-viewer-renderer"
    data-testid="file-viewer-renderer"
    :data-office-parser-capable="isOfficeParserCapable ? 'true' : 'false'"
  >
    <div
      class="file-viewer-rotation-layer"
      :style="{ transform: `rotate(${rotationHandledByViewer ? 0 : currentState.rotation}deg)` }"
    >
      <BaseFileViewer
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
  scrollbar-gutter: stable;
}

.file-viewer-rotation-layer {
  width: 100%;
  height: 100%;
  transform-origin: center;
  transition: transform 160ms ease;
}

.file-viewer-renderer :deep(.image-toolbar) {
  display: none !important;
}
</style>
