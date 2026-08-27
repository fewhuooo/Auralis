<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { FileViewer as BaseFileViewer } from '@file-viewer/vue3'
import { withFullViewerOptions } from '@file-viewer/vue3-full'
import type { FileViewerDocumentAnchor, FileViewerDocumentChunk, FileViewerExpose } from '@file-viewer/vue3'
import type { BackgroundParserHostHandle } from '@/services/documentParser/fileViewerBridge'

const activeFile = ref<File | null>(null)
const viewerRef = ref<FileViewerExpose | null>(null)
const hostRoot = ref<HTMLElement | null>(null)
const loadError = ref<Error | null>(null)
const loaded = ref(false)
let loadResolve: (() => void) | null = null
let loadReject: ((error: Error) => void) | null = null

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

function rejectLoad(error: Error): void {
  loadError.value = error
  loadReject?.(error)
  loadResolve = null
  loadReject = null
}

function handleLoadStart(): void {
  loaded.value = false
  loadError.value = null
}

function handleLoadComplete(): void {
  loaded.value = true
  loadResolve?.()
  loadResolve = null
  loadReject = null
}

function handleUnloadComplete(): void {
  loaded.value = false
}

async function prepare(file: File): Promise<void> {
  if (activeFile.value) {
    viewerRef.value?.destroy()
    activeFile.value = null
    await nextTick()
  }
  loadError.value = null
  loaded.value = false
  activeFile.value = file
  await nextTick()
  if (!viewerRef.value) throw new Error('BackgroundParserHost viewer is unavailable')
  await new Promise<void>((resolve, reject) => {
    loadResolve = resolve
    loadReject = reject
    if (loaded.value) {
      loadResolve = null
      loadReject = null
      resolve()
    }
  })
  if (loadError.value) throw loadError.value
}

function extractChunks(): FileViewerDocumentChunk[] {
  if (!viewerRef.value || !loaded.value) return []
  return viewerRef.value.getDocumentTextChunks()
}

async function extractAnchors(): Promise<FileViewerDocumentAnchor[]> {
  if (!viewerRef.value || !loaded.value) return []
  return viewerRef.value.collectDocumentAnchors()
}

async function renderPageBitmap(pageNumber: number): Promise<Blob> {
  if (!viewerRef.value || !loaded.value) throw new Error('OFFICE_TEXT_UNAVAILABLE')
  await viewerRef.value.applyViewState({ page: pageNumber }, { source: 'api', action: 'page-change' })
  await nextTick()
  const canvases = Array.from(hostRoot.value?.querySelectorAll('canvas') || [])
  const canvas = canvases.find((candidate) => candidate.width > 0 && candidate.height > 0)
  if (!canvas) throw new Error('OFFICE_TEXT_UNAVAILABLE')
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('OFFICE_TEXT_UNAVAILABLE'))
    }, 'image/png')
  })
}

function getPageCount(): number {
  const pageCount = viewerRef.value?.getViewState()?.pageCount
  return typeof pageCount === 'number' && Number.isFinite(pageCount) ? pageCount : 0
}

function dispose(): void {
  loadResolve = null
  loadReject = null
  viewerRef.value?.destroy()
  viewerRef.value = null
  activeFile.value = null
  loaded.value = false
}

const parserHost: BackgroundParserHostHandle = {
  prepare,
  extractChunks,
  extractAnchors,
  renderPageBitmap,
  getPageCount,
  dispose,
}

defineExpose<BackgroundParserHostHandle>(parserHost)
</script>

<template>
  <div
    ref="hostRoot"
    class="background-parser-host"
    aria-hidden="true"
    data-testid="background-parser-host"
  >
    <BaseFileViewer
      v-if="activeFile"
      ref="viewerRef"
      :file="activeFile"
      :options="viewerOptions"
      @load-start="handleLoadStart"
      @load-complete="handleLoadComplete"
      @unload-complete="handleUnloadComplete"
      @load-error="rejectLoad"
    />
  </div>
</template>

<style scoped>
.background-parser-host {
  position: fixed;
  left: -10000px;
  top: 0;
  width: 1024px;
  height: 768px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  contain: strict;
  z-index: -1;
}
</style>
