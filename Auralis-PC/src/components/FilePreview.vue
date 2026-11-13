<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import { useAssetStore } from '@/store/useAssetStore'
import { useAuthStore } from '@/store/useAuthStore'
import type { SourceFileModel } from '@/services/domainMappers'
import { getPreviewSourceIdentity, resolveFileCapability } from '@/utils/filePreview'
import FileViewerRenderer from '@/components/preview/FileViewerRenderer.vue'
import UnsupportedPreview from '@/components/preview/UnsupportedPreview.vue'
import { PreviewRequestGate } from '@/components/preview/PreviewRequestGate'
import type { FileViewerZoomState } from '@file-viewer/vue3-full'

const props = withDefaults(defineProps<{
  file: Pick<SourceFileModel, 'id' | 'name' | 'assetId' | 'fileType'>
  compact?: boolean
  bare?: boolean
}>(), {
  compact: false,
  bare: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'download'): void
  (event: 'preview-error', message: string): void
  (event: 'control-ready', ready: boolean): void
  (event: 'page-change', page: number, total: number): void
  (event: 'zoom-change', state: FileViewerZoomState): void
  (event: 'rotation-change', rotation: number): void
  (event: 'text-selected', text: string): void
}>()

const assetStore = useAssetStore()
const authStore = useAuthStore()
const previewFile = ref<File | null>(null)
const originalName = ref('')
const signedUrl = ref<string | null>(null)
const isLoading = ref(false)
const isRendererLoading = ref(false)
const errorMessage = ref<string | null>(null)
const previewRequests = new PreviewRequestGate()
let activePreviewAbort: AbortController | null = null
let activeLocalCleanup: (() => void) | null = null
let activeDownloadObjectUrl: string | null = null

const rendererRef = ref<InstanceType<typeof FileViewerRenderer> | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)
const isRendererReady = ref(false)
const pendingRendererActions: Array<(renderer: InstanceType<typeof FileViewerRenderer>) => Promise<unknown> | unknown> = []

const capability = computed(() => resolveFileCapability({ name: originalName.value }))
const canPreview = computed(() => capability.value.renderer === 'file-viewer')

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return '文件预览加载失败'
}

function cleanupActiveInput(): void {
  activeLocalCleanup?.()
  activeLocalCleanup = null
  if (activeDownloadObjectUrl) {
    URL.revokeObjectURL(activeDownloadObjectUrl)
    activeDownloadObjectUrl = null
  }
}

async function loadPreview(): Promise<void> {
  const requestId = previewRequests.begin()
  activePreviewAbort?.abort()
  activePreviewAbort = null
  cleanupActiveInput()
  const assetId = props.file.assetId
  previewFile.value = null
  originalName.value = ''
  signedUrl.value = null
  isLoading.value = false
  errorMessage.value = null
  currentPage.value = 1
  totalPages.value = 1
  isRendererReady.value = false
  pendingRendererActions.splice(0)
  emit('control-ready', false)
  emit('page-change', 1, 1)

  if (!assetId) {
    errorMessage.value = '该资料没有可用的文件资产'
    emit('preview-error', errorMessage.value)
    return
  }

  isLoading.value = true
  try {
    const localInput = await assetStore.resolveLocalFile(assetId)
    if (!previewRequests.isCurrent(requestId)) {
      localInput?.cleanup()
      return
    }
    if (localInput) {
      activeLocalCleanup = localInput.cleanup
      originalName.value = localInput.file.name
      if (canPreview.value) previewFile.value = localInput.file
      return
    }

    await new Promise<void>(resolve => window.setTimeout(resolve, 80))
    if (!previewRequests.isCurrent(requestId)) return
    const abort = new AbortController()
    activePreviewAbort = abort
    const download = await assetStore.downloadAssetInfo(assetId)
    if (!previewRequests.isCurrent(requestId)) return
    originalName.value = download.originalName
    if (!canPreview.value) return
    const url = download.url
    signedUrl.value = url
    const response = await fetch(url, { signal: abort.signal })
    if (!response.ok) throw new Error(`文件下载失败（${response.status}）`)
    const blob = await response.blob()
    if (!previewRequests.isCurrent(requestId)) return
    previewFile.value = new File([blob], download.originalName, { type: download.mimeType })
  } catch (error) {
    if (!previewRequests.isCurrent(requestId)) return
    if (error instanceof DOMException && error.name === 'AbortError') return
    errorMessage.value = readableError(error)
    emit('preview-error', errorMessage.value)
  } finally {
    if (previewRequests.isCurrent(requestId)) isLoading.value = false
    if (previewRequests.isCurrent(requestId)) activePreviewAbort = null
  }
}

onUnmounted(() => {
  previewRequests.invalidate()
  activePreviewAbort?.abort()
  activePreviewAbort = null
  cleanupActiveInput()
})

function downloadOriginal(): void {
  const localFile = previewFile.value
  const objectUrl = localFile ? URL.createObjectURL(localFile) : null
  const href = objectUrl || signedUrl.value
  if (!href) return
  if (activeDownloadObjectUrl) URL.revokeObjectURL(activeDownloadObjectUrl)
  activeDownloadObjectUrl = objectUrl
  const link = document.createElement('a')
  link.href = href
  link.download = originalName.value
  link.rel = 'noopener'
  link.target = '_blank'
  link.click()
  if (objectUrl) {
    window.setTimeout(() => {
      if (activeDownloadObjectUrl === objectUrl) activeDownloadObjectUrl = null
      URL.revokeObjectURL(objectUrl)
    }, 0)
  }
  emit('download')
}

function retry(): void {
  if (isLoading.value) return
  void loadPreview()
}

function handlePageChange(page: number, total: number): void {
  currentPage.value = page
  totalPages.value = total
  emit('page-change', page, total)
}

function handleZoomChange(state: FileViewerZoomState): void {
  emit('zoom-change', state)
}

function handleRotationChange(rotation: number): void {
  emit('rotation-change', rotation)
}

function runRendererAction(action: (renderer: InstanceType<typeof FileViewerRenderer>) => Promise<unknown> | unknown): Promise<unknown> {
  if (!rendererRef.value) {
    pendingRendererActions.push(action)
    return Promise.resolve(null)
  }
  return Promise.resolve(action(rendererRef.value))
}

async function flushRendererActions(): Promise<void> {
  if (!rendererRef.value || pendingRendererActions.length === 0) return
  const actions = pendingRendererActions.splice(0)
  for (const action of actions) await action(rendererRef.value)
}

function handleRendererLoadStart(): void {
  isRendererLoading.value = true
  isRendererReady.value = false
  emit('control-ready', false)
}

async function handleRendererLoadComplete(): Promise<void> {
  isRendererLoading.value = false
  isRendererReady.value = true
  emit('control-ready', true)
  await flushRendererActions()
}

function handleRendererUnloadComplete(): void {
  isRendererLoading.value = false
  isRendererReady.value = false
  pendingRendererActions.splice(0)
  emit('control-ready', false)
}

function handleSelection(): void {
  const text = typeof window !== 'undefined' ? window.getSelection()?.toString().trim().slice(0, 4000) || '' : ''
  if (text) emit('text-selected', text)
}

defineExpose({
  zoomIn: () => runRendererAction(renderer => renderer.zoomIn()),
  zoomOut: () => runRendererAction(renderer => renderer.zoomOut()),
  resetZoom: () => runRendererAction(renderer => renderer.resetZoom()),
  rotateLeft: () => runRendererAction(renderer => renderer.rotateLeft()),
  rotateRight: () => runRendererAction(renderer => renderer.rotateRight()),
  prevPage: () => runRendererAction(renderer => renderer.prevPage()),
  nextPage: () => runRendererAction(renderer => renderer.nextPage()),
})

watch(
  [
    () => getPreviewSourceIdentity(props.file),
    () => authStore.user?.id,
    () => authStore.serverDeviceId,
  ],
  () => { void loadPreview() },
  { immediate: true },
)
</script>

<template>
  <section class="file-preview" :class="{ 'is-compact': compact, 'is-bare': bare }" aria-label="文件预览">
    <header v-if="!bare" class="file-preview-header">
      <div class="file-preview-title-wrap">
        <span class="file-preview-eyebrow">文件预览</span>
        <h3 class="file-preview-title" :title="file.name">{{ file.name }}</h3>
      </div>
      <div class="file-preview-actions">
        <template v-if="previewFile && canPreview">
          <ElButton text size="small" @click="runRendererAction(renderer => renderer.zoomOut())">缩小</ElButton>
          <ElButton text size="small" @click="runRendererAction(renderer => renderer.zoomIn())">放大</ElButton>
          <ElButton text size="small" @click="runRendererAction(renderer => renderer.resetZoom())">重置</ElButton>
          <ElButton text size="small" @click="runRendererAction(renderer => renderer.rotateLeft())">左旋</ElButton>
          <ElButton text size="small" @click="runRendererAction(renderer => renderer.rotateRight())">右旋</ElButton>
        </template>
        <ElButton v-if="previewFile || signedUrl" text size="small" @click="downloadOriginal">下载原文件</ElButton>
        <ElButton v-if="errorMessage" text size="small" @click="retry">重试</ElButton>
        <ElButton v-if="compact" text size="small" @click="emit('close')">关闭</ElButton>
      </div>
    </header>

    <div class="file-preview-body" :aria-busy="isLoading || isRendererLoading" @mouseup="handleSelection" @keyup="handleSelection">
      <div v-if="isLoading" class="file-preview-state" role="status">
        <span class="file-preview-spinner" aria-hidden="true"></span>
        <span>正在准备预览…</span>
      </div>

      <div v-else-if="errorMessage" class="file-preview-state is-error" role="alert">
        <strong>{{ errorMessage }}</strong>
        <ElButton v-if="bare && file.assetId" text size="small" @click="retry">重试</ElButton>
        <span v-if="!bare && signedUrl">可以重试，或下载原文件查看。</span>
      </div>

      <UnsupportedPreview v-else-if="!canPreview" />

      <div v-else-if="previewFile" class="file-preview-renderer-shell">
        <FileViewerRenderer
          ref="rendererRef"
          :file="previewFile"
          :capability="capability"
          @load-start="handleRendererLoadStart"
          @load-complete="handleRendererLoadComplete"
          @unload-complete="handleRendererUnloadComplete"
          @zoom-change="handleZoomChange"
          @rotation-change="handleRotationChange"
          @page-change="handlePageChange"
        />
      </div>
    </div>

    <footer v-if="previewFile && canPreview && !bare" class="file-preview-footer">
      <ElButton text size="small" :disabled="currentPage <= 1" @click="rendererRef?.prevPage()">上一页</ElButton>
      <span class="file-preview-page-count">{{ currentPage }} / {{ totalPages }}</span>
      <ElButton text size="small" :disabled="currentPage >= totalPages" @click="rendererRef?.nextPage()">下一页</ElButton>
    </footer>
  </section>
</template>

<style scoped>
.file-preview {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
}

.file-preview.is-compact {
  min-height: 420px;
}

.file-preview.is-bare {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
}

.file-preview.is-bare .file-preview-body {
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  padding: 12px 16px;
  background: var(--color-bg-primary, #F7F2EB);
}

.file-preview.is-bare .file-preview-renderer-shell {
  flex: 1;
  height: auto;
  min-height: 0;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-tertiary, #FAF7F2);
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
}

.file-preview.is-bare :deep(.unsupported-preview) {
  flex: 1;
  width: 100%;
  height: 100%;
}

.file-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.file-preview-title-wrap {
  min-width: 0;
}

.file-preview-eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted, #8a8a84);
  font-size: 12px;
}

.file-preview-title {
  max-width: 52vw;
  margin: 0;
  overflow: hidden;
  color: var(--text-primary, #1c1c1a);
  font-size: 17px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.file-preview-body {
  position: relative;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
}

.file-preview-renderer-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 460px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
}

.file-preview-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 320px;
  gap: 12px;
  color: var(--text-secondary, #656560);
  font-size: 13px;
  text-align: center;
}

.file-preview-state.is-error {
  color: var(--error, #b4534b);
}

.file-preview-state.is-error > span {
  color: var(--text-muted, #8a8a84);
}

.file-preview-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(139, 154, 110, 0.25);
  border-top-color: var(--color-primary-accent, #8B9A6E);
  border-radius: 50%;
  animation: file-preview-spin 0.8s linear infinite;
}

@keyframes file-preview-spin {
  to { transform: rotate(360deg); }
}

.file-preview-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.file-preview-page-count {
  color: var(--text-secondary, #656560);
  font-size: 13px;
}
</style>
