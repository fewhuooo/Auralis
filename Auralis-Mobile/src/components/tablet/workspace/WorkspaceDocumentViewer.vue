<template>
  <view ref="shellRef" class="doc-viewer-shell" :aria-busy="loading">
    <!-- #ifdef H5 -->
    <view class="doc-viewer-rotation-stage" :style="rotationStageStyle">
      <div
        v-show="!errorMessage"
        ref="surfaceRef"
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
        <text class="doc-error-title">文档暂时无法在线预览</text>
        <text class="doc-error-desc">{{ errorMessage }}</text>
        <view class="doc-error-actions">
          <button class="ui-btn ui-btn-secondary sm" @click="retry">重试</button>
          <button class="ui-btn ui-btn-primary sm" @click="emit('open-external')">打开原文件</button>
        </view>
      </view>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
// #ifdef H5
import { localDataScope } from '@/services/localDataScope'
import { deleteCachedDocument, putCachedDocument } from '@/services/localDocumentCache'
import {
  createDocumentViewerSession,
  DEFAULT_DOC_VIEWER_ZOOM,
  type DocViewerZoomPayload,
  type DocumentViewerSession,
} from '@/services/documentViewerEngine'
// #endif

export type { DocViewerZoomPayload }

const DEFAULT_ZOOM: DocViewerZoomPayload = {
  scale: 1,
  label: '100%',
  canZoomIn: true,
  canZoomOut: true,
  canReset: false,
}

const props = defineProps<{
  url: string
  assetId?: string
  cachedBuffer?: ArrayBuffer | null
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

const shellRef = ref<HTMLElement | { $el?: unknown } | null>(null)
const surfaceRef = ref<HTMLElement | { $el?: unknown } | null>(null)
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

let loadToken = 0
let cachedRuntimeAssetBase: string | null = null
let fetchAbort: AbortController | null = null
let waitAbort: AbortController | null = null
// #ifdef H5
let session: DocumentViewerSession | null = null
// #endif

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

function measureShellBounds(): void {
  const el = resolveHtmlElement(shellRef.value)
  if (!el) return
  shellBounds.value = {
    width: el.clientWidth,
    height: el.clientHeight,
  }
}

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

function resolveHtmlElement(raw: HTMLElement | { $el?: unknown } | null): HTMLElement | null {
  if (typeof HTMLElement === 'undefined' || !raw) return null
  if (raw instanceof HTMLElement) return raw
  if (typeof raw === 'object' && '$el' in raw && raw.$el instanceof HTMLElement) {
    return raw.$el
  }
  return null
}

function resolveRuntimeAssetBaseOnce(
  resolveBase: (doc: Document) => string,
  getConfiguredBase: (doc?: Document | null) => string | undefined,
): string {
  if (cachedRuntimeAssetBase) return cachedRuntimeAssetBase
  if (typeof document === 'undefined') {
    cachedRuntimeAssetBase = '/file-viewer/'
    return cachedRuntimeAssetBase
  }
  const existing = getConfiguredBase(document)
  if (existing && /\/file-viewer\/?$/i.test(existing)) {
    cachedRuntimeAssetBase = existing.endsWith('/') ? existing : `${existing}/`
    return cachedRuntimeAssetBase
  }
  const deploymentBase = resolveBase(document)
  const normalizedBase = deploymentBase.endsWith('/') ? deploymentBase : `${deploymentBase}/`
  cachedRuntimeAssetBase = new URL('file-viewer/', normalizedBase).href
  return cachedRuntimeAssetBase
}

async function downloadBlobWithProgress(
  url: string,
  mimeType: string,
  signal: AbortSignal,
  onProgress: (percent: number | null) => void,
): Promise<{ blob: Blob; contentType: string }> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`文件读取失败（HTTP ${response.status}）`)
  }
  const contentType = response.headers.get('content-type') || mimeType || 'application/octet-stream'
  const totalBytes = Number(response.headers.get('content-length') || 0)
  const reader = response.body?.getReader()
  if (!reader || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    onProgress(null)
    const blob = await response.blob()
    return { blob, contentType }
  }
  const chunks: ArrayBuffer[] = []
  let loaded = 0
  while (true) {
    if (signal.aborted) {
      await reader.cancel().catch(() => {})
      throw new DOMException('Aborted', 'AbortError')
    }
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
      loaded += value.byteLength
      onProgress(Math.min(99, Math.round((loaded / totalBytes) * 100)))
    }
  }
  return {
    blob: new Blob(chunks, { type: contentType }),
    contentType,
  }
}

function isAbortException(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function formatLoadError(error: unknown): string {
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return '文档拉取被网络或跨域策略拦截，可直接点右侧按钮在新窗口打开原文件'
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return '文档解析渲染失败，可尝试重试或打开原文件'
}

async function destroyActiveViewer(reason: 'replace' | 'reset' | 'component-unmount'): Promise<void> {
  // #ifdef H5
  const active = session
  session = null
  if (active) {
    await active.destroy(reason).catch(() => {})
  }
  // #endif
}

function abortActiveWork(): void {
  fetchAbort?.abort()
  fetchAbort = null
  waitAbort?.abort()
  waitAbort = null
}

async function loadDocument(): Promise<void> {
  const token = ++loadToken
  abortActiveWork()
  const hasSource = Boolean(props.url || props.cachedBuffer)
  loading.value = hasSource
  phase.value = props.cachedBuffer ? 'rendering' : 'downloading'
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
    await destroyActiveViewer('reset')
    if (token === loadToken) loading.value = false
    return
  }

  // #ifdef H5
  const cacheScope = localDataScope.current()
  await nextTick()
  if (token !== loadToken) return
  const rawSurfaceEl = resolveHtmlElement(surfaceRef.value)
  const surfaceEl = rawSurfaceEl instanceof HTMLDivElement ? rawSurfaceEl : null
  if (!surfaceEl) {
    loading.value = false
    return
  }

  try {
    await destroyActiveViewer('replace')
    if (token !== loadToken) return

    const [
      { createViewer },
      { getDefaultFileViewerAssetBaseUrl, resolveFileViewerRuntimeAssetBaseUrl, setDefaultFileViewerAssetBaseUrl },
      { default: pdfRenderer },
      { default: wordRenderer },
      { default: presentationRenderer },
    ] = await Promise.all([
      import('@file-viewer/core'),
      import('@file-viewer/core/assets'),
      import('@file-viewer/renderer-pdf'),
      import('@file-viewer/renderer-word'),
      import('@file-viewer/renderer-presentation'),
    ])
    if (token !== loadToken) return

    const runtimeAssetBase = resolveRuntimeAssetBaseOnce(
      resolveFileViewerRuntimeAssetBaseUrl,
      getDefaultFileViewerAssetBaseUrl,
    )

    let buffer: ArrayBuffer
    let cacheCopy: ArrayBuffer | null = null
    let contentType = props.mimeType || 'application/octet-stream'
    if (props.cachedBuffer) {
      phase.value = 'rendering'
      downloadProgress.value = null
      buffer = props.cachedBuffer.slice(0)
    } else {
      const dlController = new AbortController()
      fetchAbort = dlController
      const downloaded = await downloadBlobWithProgress(
        props.url,
        props.mimeType,
        dlController.signal,
        (percent) => {
          if (token === loadToken) downloadProgress.value = percent
        },
      )
      if (token !== loadToken) return
      fetchAbort = null
      contentType = downloaded.contentType
      phase.value = 'rendering'
      downloadProgress.value = null
      buffer = await downloaded.blob.arrayBuffer()
      if (token !== loadToken) return
      cacheCopy = props.assetId ? buffer.slice(0) : null
    }

    const waitController = new AbortController()
    waitAbort = waitController

    const nextSession = createDocumentViewerSession({
      container: surfaceEl,
      buffer,
      fileName: props.fileName,
      mimeType: contentType,
      previewKind: props.previewKind,
      runtimeAssetBase,
      signal: waitController.signal,
      deps: {
        createViewer,
        setDefaultFileViewerAssetBaseUrl,
        pdfRenderer,
        wordRenderer,
        presentationRenderer,
      },
      onZoomChange(zoom) {
        if (token === loadToken) emit('zoom-change', zoom)
      },
      onRotationChange(rotation) {
        if (token !== loadToken) return
        rotationHandledByViewer.value = true
        currentRotation.value = rotation
        emit('rotation-change', rotation)
      },
      onPageChange(page, pageCount) {
        if (token !== loadToken) return
        currentPage.value = page
        totalPages.value = pageCount
        emit('page-change', page, pageCount)
      },
      onRotateFallback(nextRotation) {
        if (token !== loadToken) return
        rotationHandledByViewer.value = false
        measureShellBounds()
        currentRotation.value = nextRotation
        emit('rotation-change', nextRotation)
      },
    })
    session = nextSession

    const result = await nextSession.load()
    if (token !== loadToken || waitController.signal.aborted) return

    if (cacheCopy && props.assetId && localDataScope.current() === cacheScope) {
      void putCachedDocument(cacheScope, {
        assetId: props.assetId,
        mimeType: contentType,
        originalName: props.fileName,
        buffer: cacheCopy,
      })
    }

    currentPage.value = result.page
    totalPages.value = result.pageCount
    emit('zoom-change', result.zoom || { ...DEFAULT_DOC_VIEWER_ZOOM })
    emit('page-change', currentPage.value, totalPages.value)
    isReady.value = true
    loading.value = false
    emit('ready-change', true)
  } catch (error) {
    if (token !== loadToken || isAbortException(error)) return
    const message = formatLoadError(error)
    if (props.cachedBuffer && props.assetId && localDataScope.current() === cacheScope) {
      await deleteCachedDocument(cacheScope, props.assetId)
      if (token !== loadToken) return
    }
    errorMessage.value = message
    isReady.value = false
    emit('ready-change', false)
    emit('error', message)
  } finally {
    if (token === loadToken) {
      loading.value = false
      fetchAbort = null
      waitAbort = null
    }
  }
  // #endif
}

function retry(): void {
  if (loading.value) return
  emit('retry-source')
}

function handleResize(): void {
  measureShellBounds()
}

onMounted(() => {
  // #ifdef H5
  measureShellBounds()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize)
  }
  // #endif
})

watch(
  () => [props.sourceKey, props.url, props.cachedBuffer, props.fileName],
  () => { void loadDocument() },
  { immediate: true },
)

onBeforeUnmount(() => {
  loadToken += 1
  abortActiveWork()
  // #ifdef H5
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
  // #endif
  void destroyActiveViewer('component-unmount')
})

function invokeSession(fn: (active: DocumentViewerSession) => Promise<unknown>): Promise<unknown> {
  // #ifdef H5
  if (session) return fn(session)
  // #endif
  return Promise.resolve(null)
}

defineExpose({
  zoomIn: () => invokeSession(active => active.zoomIn()),
  zoomOut: () => invokeSession(active => active.zoomOut()),
  resetZoom: () => invokeSession(active => active.resetZoom()),
  rotateLeft: () => invokeSession(active => active.rotate(-90)),
  rotateRight: () => invokeSession(active => active.rotate(90)),
  prevPage: () => invokeSession(active => active.prevPage()),
  nextPage: () => invokeSession(active => active.nextPage()),
  retry,
})
</script>

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
  scrollbar-width: thin !important;
  scrollbar-color: rgba(107, 119, 98, 0.28) transparent !important;
  -ms-overflow-style: auto !important;
}

.doc-viewer-surface.is-ready {
  opacity: 1;
  pointer-events: auto;
}

.doc-viewer-surface :deep(.docx-fit-viewer),
.doc-viewer-surface :deep(.msdoc-zoom-viewer),
.doc-viewer-surface :deep(.pdf-wrapper) {
  scrollbar-width: thin !important;
  scrollbar-color: rgba(107, 119, 98, 0.28) transparent !important;
  -ms-overflow-style: auto !important;
}

.doc-viewer-surface::-webkit-scrollbar,
.doc-viewer-surface :deep(.docx-fit-viewer)::-webkit-scrollbar,
.doc-viewer-surface :deep(.msdoc-zoom-viewer)::-webkit-scrollbar,
.doc-viewer-surface :deep(.pdf-wrapper)::-webkit-scrollbar {
  width: 7px !important;
  height: 7px !important;
  display: block !important;
}

.doc-viewer-surface::-webkit-scrollbar-track,
.doc-viewer-surface :deep(.docx-fit-viewer)::-webkit-scrollbar-track,
.doc-viewer-surface :deep(.msdoc-zoom-viewer)::-webkit-scrollbar-track,
.doc-viewer-surface :deep(.pdf-wrapper)::-webkit-scrollbar-track {
  background: transparent !important;
}

.doc-viewer-surface::-webkit-scrollbar-thumb,
.doc-viewer-surface :deep(.docx-fit-viewer)::-webkit-scrollbar-thumb,
.doc-viewer-surface :deep(.msdoc-zoom-viewer)::-webkit-scrollbar-thumb,
.doc-viewer-surface :deep(.pdf-wrapper)::-webkit-scrollbar-thumb {
  background: rgba(107, 119, 98, 0.26) !important;
  border-radius: 999px !important;
}

.doc-viewer-surface::-webkit-scrollbar-thumb:hover,
.doc-viewer-surface :deep(.docx-fit-viewer)::-webkit-scrollbar-thumb:hover,
.doc-viewer-surface :deep(.msdoc-zoom-viewer)::-webkit-scrollbar-thumb:hover,
.doc-viewer-surface :deep(.pdf-wrapper)::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 119, 98, 0.44) !important;
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
