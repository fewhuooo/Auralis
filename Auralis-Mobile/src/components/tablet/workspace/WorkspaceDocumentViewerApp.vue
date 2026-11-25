<template>
  <view
    class="doc-viewer-shell"
    :aria-busy="loading"
    :renderCmd="renderCmd"
    :change:renderCmd="appDocViewer.onRenderCmd"
    :viewerCmd="viewerCmd"
    :change:viewerCmd="appDocViewer.onViewerCmd"
  >
    <view class="doc-viewer-rotation-stage" :style="rotationStageStyle">
      <div
        v-show="!errorMessage"
        :id="surfaceId"
        class="doc-viewer-surface"
        :class="{ 'is-ready': isReady }"
      ></div>
    </view>

    <Transition name="doc-overlay-fade">
      <view v-if="loading && !errorMessage" class="doc-viewer-overlay" role="status">
        <view class="doc-loading-stage">
          <view class="doc-sheet-placeholder zen-card" aria-hidden="true">
            <view class="doc-sheet-kicker"></view>
            <view class="doc-sheet-title"></view>
            <view class="doc-sheet-block"></view>
            <view class="doc-sheet-line"></view>
            <view class="doc-sheet-line is-short"></view>
          </view>
          <view class="doc-viewer-status-pill zen-card">
            <view class="doc-spinner" aria-hidden="true"></view>
            <text class="doc-status-title">{{ statusLabel }}</text>
            <view v-if="downloadProgress !== null" class="doc-progress-track">
              <view class="doc-progress-fill" :style="{ width: `${downloadProgress}%` }"></view>
            </view>
            <text v-else class="doc-status-sub">{{ fileName }}</text>
          </view>
        </view>
      </view>
    </Transition>

    <view v-if="errorMessage" class="doc-viewer-overlay" role="alert">
      <view class="doc-viewer-error-card zen-card">
        <text class="doc-error-title">文档暂时无法内嵌预览</text>
        <text class="doc-error-desc">{{ errorMessage }}</text>
        <view class="doc-error-actions">
          <button class="ui-btn ui-btn-secondary sm" @click="retry">重试</button>
          <button class="ui-btn ui-btn-primary sm" @click="emit('open-external')">用系统阅读器打开</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { DocViewerZoomPayload } from '@/services/documentViewerEngine'
import { localDataScope } from '@/services/localDataScope'
import {
  deleteNativeCachedDocument,
  putNativeCachedDocument,
} from '@/services/nativeDocumentCache'

interface PlusIoNamespace {
  convertLocalFileSystemURL?: (path: string) => string
}

declare const plus: { io?: PlusIoNamespace } | undefined

interface RenderCommand {
  token: number
  action: 'load' | 'reset'
  surfaceId?: string
  fileUrl?: string
  localPath?: string
  assetBaseUrl?: string
  fileName?: string
  mimeType?: string
  previewKind?: 'pdf' | 'word' | 'presentation'
}

interface ViewerCommand {
  seq: number
  token: number
  type: 'zoomIn' | 'zoomOut' | 'resetZoom' | 'rotateLeft' | 'rotateRight' | 'prevPage' | 'nextPage'
}

interface RenderCallbackEvent {
  token: number
  type: 'ready' | 'error' | 'zoom-change' | 'rotation-change' | 'page-change' | 'rotate-fallback'
  message?: string
  byteLength?: number
  zoom?: DocViewerZoomPayload
  rotation?: number
  page?: number
  pageCount?: number
  shellWidth?: number
  shellHeight?: number
}

interface UniDownloadTaskLike {
  abort?: () => void
  onProgressUpdate?: (cb: (res: { progress?: number }) => void) => void
}

const DEFAULT_ZOOM: DocViewerZoomPayload = {
  scale: 1,
  label: '100%',
  canZoomIn: true,
  canZoomOut: true,
  canReset: false,
}

let nextInstanceSeq = 1

const props = defineProps<{
  url: string
  assetId?: string
  cachedFilePath?: string
  fileName: string
  mimeType: string
  previewKind: 'pdf' | 'word' | 'presentation'
  sourceKey: string
}>()

const emit = defineEmits<{
  (event: 'ready-change', ready: boolean): void
  (event: 'zoom-change', state: DocViewerZoomPayload): void
  (event: 'rotation-change', rotation: number): void
  (event: 'page-change', page: number, pageCount: number): void
  (event: 'error', message: string): void
  (event: 'open-external'): void
  (event: 'retry-source'): void
}>()

const surfaceId = `auralis-app-doc-surface-${nextInstanceSeq++}`
const loading = ref(false)
const phase = ref<'downloading' | 'rendering'>('downloading')
const downloadProgress = ref<number | null>(null)
const errorMessage = ref('')
const isReady = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const currentRotation = ref(0)
const rotationHandledByViewer = ref(true)
const shellBounds = ref<{ width: number; height: number }>({ width: 0, height: 0 })

const renderCmd = ref<RenderCommand | null>(null)
const viewerCmd = ref<ViewerCommand | null>(null)

let loadToken = 0
let cmdSeq = 0
let activeDownloadTask: UniDownloadTaskLike | null = null
let pendingTempFilePath = ''
let activeCacheScope = ''

const statusLabel = computed(() => {
  if (phase.value === 'downloading') {
    return downloadProgress.value !== null
      ? `正在获取文档（${downloadProgress.value}%）…`
      : '正在获取文档…'
  }
  if (props.previewKind === 'pdf') return '正在解析 PDF 页面…'
  if (props.previewKind === 'presentation') return '正在解析幻灯片…'
  return '正在排版 Word 文档…'
})

const rotationStageStyle = computed(() => {
  if (rotationHandledByViewer.value || currentRotation.value === 0) return undefined
  const isQuarterTurn = currentRotation.value % 180 !== 0
  if (isQuarterTurn && shellBounds.value.width > 0 && shellBounds.value.height > 0) {
    return {
      position: 'absolute' as const,
      top: '50%',
      left: '50%',
      width: `${shellBounds.value.height}px`,
      height: `${shellBounds.value.width}px`,
      transform: `translate(-50%, -50%) rotate(${currentRotation.value}deg)`,
    }
  }
  return { transform: `rotate(${currentRotation.value}deg)` }
})

function convertLocalPathToUrl(localPath: string): string {
  const converter = typeof plus !== 'undefined' ? plus?.io?.convertLocalFileSystemURL : undefined
  if (typeof converter === 'function') {
    const converted = converter(localPath)
    if (converted) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(converted)) return converted
      return `file://${converted.startsWith('/') ? '' : '/'}${converted}`
    }
  }
  return localPath
}

function resolveViewerAssetBaseUrl(): string {
  const converted = convertLocalPathToUrl('_www/static/file-viewer/')
  if (converted && converted !== '_www/static/file-viewer/') {
    return converted.endsWith('/') ? converted : `${converted}/`
  }
  return '/static/file-viewer/'
}

function abortActiveDownload(): void {
  const task = activeDownloadTask
  activeDownloadTask = null
  try {
    task?.abort?.()
  } catch {
    // Ignore download abort errors
  }
}

function downloadDocumentFile(url: string, token: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const task = uni.downloadFile({
      url,
      success(res) {
        if (activeDownloadTask === task) activeDownloadTask = null
        if (token !== loadToken) {
          reject(new Error('ABORTED'))
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath)
          return
        }
        reject(new Error(`文件获取失败（HTTP ${res.statusCode}）`))
      },
      fail(err) {
        if (activeDownloadTask === task) activeDownloadTask = null
        if (token !== loadToken) {
          reject(new Error('ABORTED'))
          return
        }
        reject(new Error(err?.errMsg || '文档下载失败，请检查网络连接'))
      },
    }) as unknown as UniDownloadTaskLike
    activeDownloadTask = task
    task.onProgressUpdate?.((res) => {
      if (token !== loadToken) return
      if (typeof res.progress === 'number' && Number.isFinite(res.progress) && res.progress >= 0) {
        downloadProgress.value = Math.min(99, Math.round(res.progress))
      }
    })
  })
}

async function loadDocument(): Promise<void> {
  const token = ++loadToken
  abortActiveDownload()
  pendingTempFilePath = ''
  activeCacheScope = localDataScope.current()

  const hasSource = Boolean(props.url || props.cachedFilePath)
  loading.value = hasSource
  phase.value = props.cachedFilePath ? 'rendering' : 'downloading'
  downloadProgress.value = null
  errorMessage.value = ''
  isReady.value = false
  currentPage.value = 1
  totalPages.value = 1
  currentRotation.value = 0
  rotationHandledByViewer.value = true
  emit('ready-change', false)
  emit('zoom-change', { ...DEFAULT_ZOOM })
  emit('rotation-change', 0)
  emit('page-change', 1, 1)

  if (!hasSource) {
    renderCmd.value = { token, action: 'reset' }
    loading.value = false
    return
  }

  await nextTick()
  if (token !== loadToken) return

  try {
    let targetLocalPath = props.cachedFilePath || ''
    if (!targetLocalPath) {
      targetLocalPath = await downloadDocumentFile(props.url, token)
      if (token !== loadToken) return
      pendingTempFilePath = targetLocalPath
    }
    phase.value = 'rendering'
    downloadProgress.value = null

    renderCmd.value = {
      token,
      action: 'load',
      surfaceId,
      fileUrl: convertLocalPathToUrl(targetLocalPath),
      localPath: targetLocalPath,
      assetBaseUrl: resolveViewerAssetBaseUrl(),
      fileName: props.fileName,
      mimeType: props.mimeType,
      previewKind: props.previewKind,
    }
  } catch (error) {
    if (token !== loadToken) return
    if (error instanceof Error && error.message === 'ABORTED') return
    const message = error instanceof Error && error.message ? error.message : '文档获取失败'
    errorMessage.value = message
    isReady.value = false
    loading.value = false
    emit('ready-change', false)
    emit('error', message)
  }
}

async function handleRenderEvent(payload: RenderCallbackEvent): Promise<void> {
  if (!payload || payload.token !== loadToken) return

  if (payload.type === 'zoom-change' && payload.zoom) {
    emit('zoom-change', payload.zoom)
    return
  }
  if (payload.type === 'rotation-change' && typeof payload.rotation === 'number') {
    rotationHandledByViewer.value = true
    currentRotation.value = payload.rotation
    emit('rotation-change', payload.rotation)
    return
  }
  if (payload.type === 'rotate-fallback' && typeof payload.rotation === 'number') {
    rotationHandledByViewer.value = false
    if (typeof payload.shellWidth === 'number' && typeof payload.shellHeight === 'number') {
      shellBounds.value = { width: payload.shellWidth, height: payload.shellHeight }
    }
    currentRotation.value = payload.rotation
    emit('rotation-change', payload.rotation)
    return
  }
  if (payload.type === 'page-change') {
    if (typeof payload.page === 'number') currentPage.value = payload.page
    if (typeof payload.pageCount === 'number') totalPages.value = Math.max(1, payload.pageCount)
    emit('page-change', currentPage.value, totalPages.value)
    return
  }
  if (payload.type === 'ready') {
    if (typeof payload.page === 'number') currentPage.value = payload.page
    if (typeof payload.pageCount === 'number') totalPages.value = Math.max(1, payload.pageCount)
    emit('zoom-change', payload.zoom || { ...DEFAULT_ZOOM })
    emit('page-change', currentPage.value, totalPages.value)
    isReady.value = true
    loading.value = false
    emit('ready-change', true)

    if (!props.cachedFilePath && pendingTempFilePath && props.assetId && localDataScope.current() === activeCacheScope) {
      const tempPath = pendingTempFilePath
      pendingTempFilePath = ''
      void putNativeCachedDocument(activeCacheScope, {
        assetId: props.assetId,
        mimeType: props.mimeType || 'application/octet-stream',
        originalName: props.fileName,
        tempFilePath: tempPath,
        sizeBytes: payload.byteLength,
      })
    }
    return
  }
  if (payload.type === 'error') {
    const message = payload.message || '文档解析渲染失败，可尝试重试或用系统阅读器打开'
    if (props.cachedFilePath && props.assetId && localDataScope.current() === activeCacheScope) {
      await deleteNativeCachedDocument(activeCacheScope, props.assetId)
      if (payload.token !== loadToken) return
    }
    errorMessage.value = message
    isReady.value = false
    loading.value = false
    emit('ready-change', false)
    emit('error', message)
  }
}

function sendViewerCmd(type: ViewerCommand['type']): void {
  viewerCmd.value = {
    seq: ++cmdSeq,
    token: loadToken,
    type,
  }
}

function retry(): void {
  if (loading.value) return
  emit('retry-source')
}

watch(
  () => [props.sourceKey, props.url, props.cachedFilePath, props.fileName],
  () => { void loadDocument() },
  { immediate: true },
)

onBeforeUnmount(() => {
  loadToken += 1
  abortActiveDownload()
})

defineExpose({
  zoomIn: () => sendViewerCmd('zoomIn'),
  zoomOut: () => sendViewerCmd('zoomOut'),
  resetZoom: () => sendViewerCmd('resetZoom'),
  rotateLeft: () => sendViewerCmd('rotateLeft'),
  rotateRight: () => sendViewerCmd('rotateRight'),
  prevPage: () => sendViewerCmd('prevPage'),
  nextPage: () => sendViewerCmd('nextPage'),
  retry,
  handleRenderEvent,
})
</script>

<script module="appDocViewer" lang="renderjs" src="./appDocViewer.renderjs.js"></script>

<style scoped>
.doc-viewer-shell {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-primary, #F7F2EB);
}

.doc-viewer-rotation-stage {
  width: 100%;
  height: 100%;
  min-height: 0;
  transform-origin: center;
  transition: transform 160ms ease;
}

.doc-viewer-surface {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 0;
  box-sizing: border-box;
  background: var(--color-bg-primary, #F7F2EB);
  --file-viewer-bg: var(--color-bg-primary, #F7F2EB);
  --file-viewer-render-surface-background: var(--color-bg-primary, #F7F2EB);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease;
}

.doc-viewer-surface.is-ready {
  opacity: 1;
  pointer-events: auto;
}

.doc-viewer-surface :deep(.pdf-toolbar),
.doc-viewer-surface :deep(.docx-toolbar),
.doc-viewer-surface :deep(.viewer-toolbar),
.doc-viewer-surface :deep(.fv-toolbar),
.doc-viewer-surface :deep([class*="toolbar"]),
.doc-viewer-surface :deep(.pdf-page-nav),
.doc-viewer-surface :deep(.pdf-sidebar),
.doc-viewer-surface :deep(.pdf-thumbnails),
.doc-viewer-surface :deep([class*="thumbnail"]),
.doc-viewer-surface :deep(.pdf-viewer-shell > aside),
.doc-viewer-surface :deep(.pdf-shell-sidebar) {
  display: none !important;
}

.doc-viewer-surface :deep(.pdf-stage),
.doc-viewer-surface :deep(.pdf-viewport),
.doc-viewer-surface :deep(.pdf-pages),
.doc-viewer-surface :deep(.docx-wrapper),
.doc-viewer-surface :deep(.docx-fit-viewer),
.doc-viewer-surface :deep(.msdoc-zoom-viewer),
.doc-viewer-surface :deep(.doc-stage),
.doc-viewer-surface :deep(.viewer-stage) {
  background: var(--color-bg-primary, #F7F2EB) !important;
}

.doc-viewer-surface :deep(.pdf-wrapper) {
  background: var(--color-bg-primary, #F7F2EB) !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 20px 24px 72px !important;
}

.doc-viewer-surface :deep(.pdf-page) {
  background: #FFFFFF !important;
  box-shadow: 0 2px 12px rgba(45, 55, 40, 0.08), 0 1px 2px rgba(45, 55, 40, 0.04) !important;
  border-radius: 4px !important;
}

.doc-viewer-surface :deep(.docx-fit-viewer) {
  border: none !important;
  border-radius: 0 !important;
  padding: 20px 24px 64px !important;
}

.doc-viewer-surface :deep(.docx-fit-viewer .docx-wrapper) {
  padding: 0 !important;
}

.doc-viewer-surface :deep(.docx-fit-viewer section.docx) {
  box-shadow: 0 2px 12px rgba(45, 55, 40, 0.08), 0 1px 2px rgba(45, 55, 40, 0.04) !important;
  border-radius: 4px !important;
  margin-bottom: 18px !important;
}

.doc-viewer-surface :deep(.pptx-viewer-root),
.doc-viewer-surface :deep(.ppt-viewer-root),
.doc-viewer-surface :deep(.presentation-viewer),
.doc-viewer-surface :deep(.pptx-stage) {
  width: 100% !important;
  background: var(--color-bg-primary, #F7F2EB) !important;
}

.doc-viewer-surface :deep(.pptx-slide-list),
.doc-viewer-surface :deep(.ppt-slide-list) {
  padding: 16px 24px 64px !important;
}

.doc-viewer-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--color-bg-primary, #F7F2EB);
}

.doc-overlay-fade-enter-active,
.doc-overlay-fade-leave-active {
  transition: opacity 200ms ease;
}

.doc-overlay-fade-enter-from,
.doc-overlay-fade-leave-to {
  opacity: 0;
}

.doc-loading-stage {
  position: relative;
  width: 100%;
  max-width: 560px;
  height: min(460px, 78%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.doc-sheet-placeholder {
  width: 100%;
  height: 100%;
  padding: 36px 40px;
  border-radius: 16px;
  background: rgba(255, 253, 249, 0.88);
  border: 1px solid var(--border-subtle, rgba(45, 55, 40, 0.08));
  box-shadow: 0 12px 32px rgba(45, 55, 40, 0.06);
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.doc-sheet-kicker,
.doc-sheet-title,
.doc-sheet-block,
.doc-sheet-line {
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(139, 154, 110, 0.08) 0%,
    rgba(139, 154, 110, 0.16) 50%,
    rgba(139, 154, 110, 0.08) 100%
  );
  background-size: 200% 100%;
  animation: docSheetShimmer 1.8s ease-in-out infinite;
}

.doc-sheet-kicker {
  width: 34%;
  height: 12px;
  margin: 0 auto;
}

.doc-sheet-title {
  width: 56%;
  height: 24px;
  margin: 4px auto 8px;
}

.doc-sheet-block {
  width: 100%;
  flex: 1;
  min-height: 140px;
  border-radius: 12px;
}

.doc-sheet-line {
  width: 82%;
  height: 14px;
}

.doc-sheet-line.is-short {
  width: 58%;
}

@keyframes docSheetShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.doc-viewer-status-pill {
  position: absolute;
  width: min(320px, calc(100% - 32px));
  padding: 20px 22px;
  border-radius: 16px;
  background: var(--glass-surface-strong, rgba(252, 249, 244, 0.94));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 12px 32px rgba(45, 55, 40, 0.1), 0 2px 6px rgba(45, 55, 40, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  box-sizing: border-box;
}

.doc-viewer-error-card {
  width: 100%;
  max-width: 360px;
  padding: 24px 22px;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.doc-spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2.5px solid rgba(139, 154, 110, 0.24);
  border-top-color: var(--color-zen-sage, #8B9A6E);
  animation: docViewerSpin 0.8s linear infinite;
}

@keyframes docViewerSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.doc-status-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.doc-status-sub {
  max-width: 100%;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-progress-track {
  width: 180px;
  height: 5px;
  border-radius: 999px;
  background: rgba(139, 154, 110, 0.18);
  overflow: hidden;
}

.doc-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-zen-sage, #8B9A6E);
  transition: width 160ms ease-out;
}

.doc-error-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.doc-error-desc {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.doc-error-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
