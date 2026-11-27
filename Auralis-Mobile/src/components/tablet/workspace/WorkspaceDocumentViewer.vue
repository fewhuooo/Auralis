<template>
  <div ref="shellRef" class="doc-viewer-shell" :aria-busy="loading">
    <div class="doc-viewer-rotation-stage" :style="rotationStageStyle">
      <div
        v-show="!errorMessage"
        ref="surfaceRef"
        class="doc-viewer-surface"
        :class="{ 'is-ready': isReady }"
      ></div>
    </div>

    <Transition name="doc-overlay-fade">
      <div v-if="loading && !errorMessage" class="doc-viewer-overlay" role="status">
        <div class="doc-loading-stage">
          <div class="doc-sheet-placeholder zen-card" aria-hidden="true">
            <div class="doc-sheet-kicker"></div>
            <div class="doc-sheet-title"></div>
            <div class="doc-sheet-block"></div>
            <div class="doc-sheet-line"></div>
            <div class="doc-sheet-line is-short"></div>
          </div>
          <div class="doc-viewer-status-pill zen-card">
            <div class="doc-spinner" aria-hidden="true"></div>
            <span class="doc-status-title">{{ statusLabel }}</span>
            <div v-if="downloadProgress !== null" class="doc-progress-track">
              <div class="doc-progress-fill" :style="{ width: `${downloadProgress}%` }"></div>
            </div>
            <span v-else class="doc-status-sub">{{ fileName }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="errorMessage" class="doc-viewer-overlay" role="alert">
      <div class="doc-viewer-error-card zen-card">
        <span class="doc-error-title">文档暂时无法在线预览</span>
        <span class="doc-error-desc">{{ errorMessage }}</span>
        <div class="doc-error-actions">
          <button type="button" class="ui-btn ui-btn-secondary sm" @click="retry">重试</button>
          <button type="button" class="ui-btn ui-btn-primary sm" @click="emit('open-external')">打开原文件</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { localDataScope } from '@/services/localDataScope'
import { deleteCachedDocument, putCachedDocument } from '@/services/localDocumentCache'
import type {
  FileRenderContext,
  FileRenderHandler,
  FileViewerEvent,
  FileViewerInstance,
  FileViewerRenderedInstance,
  FileViewerRendererPlugin,
  FileViewerZoomState,
} from '@file-viewer/core'

export interface DocViewerZoomPayload {
  scale: number
  label: string
  canZoomIn: boolean
  canZoomOut: boolean
  canReset: boolean
}

const PDF_READY_TIMEOUT_MS = 60_000

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
let viewerToken = 0
let fittedScale: number | null = null
let cachedRuntimeAssetBase: string | null = null
let fetchAbort: AbortController | null = null
let waitAbort: AbortController | null = null
let viewer: FileViewerInstance | null = null
let awaitPdfReady: ((signal: AbortSignal) => void | Promise<void>) | undefined
const pendingActions: Array<(instance: FileViewerInstance) => Promise<unknown> | unknown> = []

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

function toZoomPayload(state: FileViewerZoomState | null | undefined): DocViewerZoomPayload {
  if (!state) return { ...DEFAULT_ZOOM }
  const canReset = fittedScale !== null
    ? Math.abs(state.scale - fittedScale) > 0.015
    : state.canReset
  return {
    scale: state.scale,
    label: state.label,
    canZoomIn: state.canZoomIn,
    canZoomOut: state.canZoomOut,
    canReset,
  }
}

function waitForSettledPaint(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    let frameOne: number | ReturnType<typeof setTimeout> | null = null
    let frameTwo: number | ReturnType<typeof setTimeout> | null = null
    const useRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'

    const cancelPending = () => {
      if (frameOne !== null) {
        if (useRaf) window.cancelAnimationFrame(Number(frameOne))
        else clearTimeout(frameOne)
        frameOne = null
      }
      if (frameTwo !== null) {
        if (useRaf) window.cancelAnimationFrame(Number(frameTwo))
        else clearTimeout(frameTwo)
        frameTwo = null
      }
    }

    const onAbort = () => {
      cancelPending()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    const schedule = (cb: () => void): number | ReturnType<typeof setTimeout> => (
      useRaf ? window.requestAnimationFrame(() => cb()) : setTimeout(cb, 16)
    )
    frameOne = schedule(() => {
      frameOne = null
      if (signal.aborted) return
      frameTwo = schedule(() => {
        frameTwo = null
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        resolve()
      })
    })
  })
}

type DivRenderHandler = FileRenderHandler<FileViewerRenderedInstance, HTMLDivElement>
type PdfHandlerInterceptor = (
  handler: DivRenderHandler,
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type: string | undefined,
  context: FileRenderContext | undefined,
) => ReturnType<DivRenderHandler>

function adaptDivRendererPlugin(
  plugin: FileViewerRendererPlugin<DivRenderHandler>,
  onPdfHandler?: PdfHandlerInterceptor,
): FileViewerRendererPlugin {
  return {
    id: plugin.id,
    label: plugin.label,
    definitions: plugin.definitions,
    assets: plugin.assets,
    handlers: (plugin.handlers ?? []).map(entry => ({
      rendererId: entry.rendererId,
      handler(buffer, target, type, context) {
        if (!(target instanceof HTMLDivElement)) {
          throw new Error('Document preview requires an HTMLDivElement render surface')
        }
        if (entry.rendererId === 'pdf' && onPdfHandler) {
          return onPdfHandler(entry.handler, buffer, target, type, context)
        }
        return entry.handler(buffer, target, type, context)
      },
    })),
  }
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

function isPptxPresentation(fileName: string, mimeType: string): boolean {
  if (/\.pptx$/i.test(fileName.trim())) return true
  return mimeType.toLowerCase().includes('presentationml')
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

function handleViewerEvent(event: FileViewerEvent, token: number): void {
  if (token !== loadToken) return
  if (event.type === 'fit-change') {
    if (event.payload.applied && typeof event.payload.scale === 'number' && Number.isFinite(event.payload.scale)) {
      fittedScale = event.payload.scale
    }
    const latestZoom = viewer?.getZoomState()
    if (latestZoom) {
      emit('zoom-change', toZoomPayload(latestZoom))
    }
    return
  }
  if (event.type === 'zoom-change') {
    emit('zoom-change', toZoomPayload(event.payload))
    return
  }
  if (event.type !== 'view-state-change') return
  const nextState = event.payload.state
  if (typeof nextState.page === 'number' && Number.isFinite(nextState.page)) {
    currentPage.value = nextState.page
  }
  if (typeof nextState.pageCount === 'number' && Number.isFinite(nextState.pageCount)) {
    totalPages.value = Math.max(1, nextState.pageCount)
  }
  if (typeof nextState.rotation === 'number' && Number.isFinite(nextState.rotation)) {
    rotationHandledByViewer.value = true
    currentRotation.value = nextState.rotation
    emit('rotation-change', nextState.rotation)
  }
  if (nextState.zoom) {
    emit('zoom-change', toZoomPayload(nextState.zoom))
  }
  emit('page-change', currentPage.value, totalPages.value)
}

async function waitForPdfReadiness(signal: AbortSignal): Promise<void> {
  if (props.previewKind !== 'pdf' || !awaitPdfReady) return
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutAbort = new AbortController()
  const onParentAbort = () => timeoutAbort.abort(signal.reason)
  signal.addEventListener('abort', onParentAbort, { once: true })
  try {
    const deadlinePromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timeoutAbort.abort()
        reject(new Error('PDF 页面解码超时，请重试或在新窗口打开'))
      }, PDF_READY_TIMEOUT_MS)
    })
    await Promise.race([
      Promise.resolve(awaitPdfReady(timeoutAbort.signal)),
      deadlinePromise,
    ])
  } finally {
    if (timer) clearTimeout(timer)
    signal.removeEventListener('abort', onParentAbort)
  }
}

async function flushPendingActions(expectedToken: number, instance: FileViewerInstance): Promise<void> {
  if (expectedToken !== loadToken || viewer !== instance || pendingActions.length === 0) return
  const actions = pendingActions.splice(0)
  for (const action of actions) {
    if (expectedToken !== loadToken || viewer !== instance) return
    await action(instance)
  }
}

function runViewerAction(
  action: (instance: FileViewerInstance) => Promise<unknown> | unknown,
): Promise<unknown> {
  if (!viewer || !isReady.value || viewerToken !== loadToken) {
    pendingActions.push(action)
    return Promise.resolve(null)
  }
  return Promise.resolve(action(viewer))
}

async function rotate(delta: number): Promise<void> {
  await runViewerAction(async (instance) => {
    const actionToken = loadToken
    const nextRotation = (currentRotation.value + delta + 360) % 360
    const applied = await instance.applyViewState(
      { rotation: nextRotation },
      { action: delta < 0 ? 'rotate-left' : 'rotate-right', source: 'api' },
    )
    if (actionToken !== loadToken || viewer !== instance) return
    const resolved = applied?.rotation ?? instance.getViewState()?.rotation
    if (typeof resolved === 'number' && Number.isFinite(resolved)) {
      rotationHandledByViewer.value = true
      currentRotation.value = resolved
    } else {
      rotationHandledByViewer.value = false
      measureShellBounds()
      currentRotation.value = nextRotation
    }
    emit('rotation-change', currentRotation.value)
  })
}

async function destroyActiveViewer(reason: 'replace' | 'reset' | 'component-unmount'): Promise<void> {
  const active = viewer
  viewer = null
  viewerToken = 0
  if (active) {
    await active.destroy(reason).catch(() => {})
  }
}

function abortActiveWork(): void {
  fetchAbort?.abort()
  fetchAbort = null
  waitAbort?.abort()
  waitAbort = null
  awaitPdfReady = undefined
  pendingActions.splice(0)
}

async function loadDocument(): Promise<void> {
  const token = ++loadToken
  fittedScale = null
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

  const cacheScope = localDataScope.current()
  await nextTick()
  if (token !== loadToken) return
  const surfaceEl = resolveHtmlElement(surfaceRef.value)
  if (!surfaceEl) {
    loading.value = false
    return
  }

  try {
    await viewer?.unload?.('replace').catch(() => {})
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
    setDefaultFileViewerAssetBaseUrl(runtimeAssetBase)

    let buffer: ArrayBuffer
    let cacheCopy: ArrayBuffer | null = null
    let contentType = props.mimeType || 'application/octet-stream'
    if (props.cachedBuffer) {
      phase.value = 'rendering'
      downloadProgress.value = null
      // Clone before passing to pdf.js or renderer in case it transfers/detaches the ArrayBuffer.
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
      // Snapshot before instance.load may transfer/detach buffer; persist only after decode succeeds.
      cacheCopy = props.assetId ? buffer.slice(0) : null
    }

    const waitController = new AbortController()
    waitAbort = waitController
    const wrappedPdfPlugin = adaptDivRendererPlugin(
      pdfRenderer,
      (handler, buffer, target, type, context) => {
        const currentWaitSignal = waitController.signal
        return handler(buffer, target, type, {
          ...context,
          registerThumbnailAdapter(adapter) {
            context?.registerThumbnailAdapter?.(adapter)
            const beforeCapture = adapter?.beforeCapture
            if (!beforeCapture || currentWaitSignal.aborted || context?.signal?.aborted) return
            awaitPdfReady = signal => beforeCapture({
              width: 1,
              height: 1,
              format: 'png',
              quality: 1,
              fit: 'contain',
              background: 'transparent',
              signal,
            })
          },
        })
      },
    )

    await destroyActiveViewer('replace')
    if (token !== loadToken) return

    const isPptx = isPptxPresentation(props.fileName, props.mimeType)
    const instance = createViewer(surfaceEl, {
      options: {
        styleIsolation: 'none',
        theme: 'light',
        toolbar: false,
        fit: isPptx
          ? undefined
          : {
              mode: 'width',
              resize: 'until-interaction',
              padding: 28,
              maxScale: 1,
            },
        pdf: {
          toolbar: false,
          navigation: false,
        },
        docx: {
          externalLinkPolicy: 'block',
          darkMode: false,
        },
        presentation: {
          pptModuleUrl: new URL('vendor/ppt/index.mjs', runtimeAssetBase).href,
          pptWorkerUrl: new URL('vendor/ppt/worker.mjs', runtimeAssetBase).href,
          pptWasmUrl: new URL('vendor/ppt/ppt-native.wasm', runtimeAssetBase).href,
          pptFontUrl: new URL('vendor/ppt/ppt-font-cjk.otf', runtimeAssetBase).href,
        },
        rendererMode: 'replace',
        autoRenderers: false,
        renderers: [
          wrappedPdfPlugin,
          adaptDivRendererPlugin(wordRenderer),
          adaptDivRendererPlugin(presentationRenderer),
        ],
      },
      onEvent: (event) => handleViewerEvent(event, token),
    })
    viewer = instance
    viewerToken = token

    if (token !== loadToken || waitController.signal.aborted) return
    const file = new File([buffer], props.fileName, { type: contentType })
    await instance.load(
      {
        buffer,
        file,
        filename: props.fileName,
        size: buffer.byteLength,
      },
      { signal: waitController.signal },
    )
    if (token !== loadToken || waitController.signal.aborted) return

    await waitForPdfReadiness(waitController.signal)
    if (token !== loadToken || waitController.signal.aborted) return

    await waitForSettledPaint(waitController.signal)
    if (token !== loadToken || waitController.signal.aborted) return

    if (cacheCopy && props.assetId && localDataScope.current() === cacheScope) {
      void putCachedDocument(cacheScope, {
        assetId: props.assetId,
        mimeType: contentType,
        originalName: props.fileName,
        buffer: cacheCopy,
      })
    }

    const finalZoom = instance.getZoomState()
    if (finalZoom && Number.isFinite(finalZoom.scale) && finalZoom.scale > 0) {
      fittedScale = finalZoom.scale
      emit('zoom-change', toZoomPayload(finalZoom))
    }
    const finalView = instance.getViewState()
    if (finalView) {
      if (typeof finalView.page === 'number') currentPage.value = finalView.page
      if (typeof finalView.pageCount === 'number') totalPages.value = Math.max(1, finalView.pageCount)
      emit('page-change', currentPage.value, totalPages.value)
    }
    isReady.value = true
    loading.value = false
    emit('ready-change', true)
    await flushPendingActions(token, instance)
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
}

function retry(): void {
  if (loading.value) return
  emit('retry-source')
}

function handleResize(): void {
  measureShellBounds()
}

onMounted(() => {
  measureShellBounds()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize)
  }
})

watch(
  () => [props.sourceKey, props.url, props.cachedBuffer, props.fileName],
  () => { void loadDocument() },
  { immediate: true },
)

onBeforeUnmount(() => {
  loadToken += 1
  abortActiveWork()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
  void destroyActiveViewer('component-unmount')
})

defineExpose({
  zoomIn: () => runViewerAction(instance => instance.zoomIn()),
  zoomOut: () => runViewerAction(instance => instance.zoomOut()),
  resetZoom: () => runViewerAction(async (instance) => {
    const actionToken = loadToken
    if (isPptxPresentation(props.fileName, props.mimeType)) {
      await instance.resetZoom()
    } else {
      await instance.fitToView()
    }
    if (actionToken !== loadToken || viewer !== instance) return
    const next = instance.getZoomState()
    if (next && Number.isFinite(next.scale) && next.scale > 0) {
      fittedScale = next.scale
      emit('zoom-change', toZoomPayload(next))
    }
  }),
  rotateLeft: () => rotate(-90),
  rotateRight: () => rotate(90),
  prevPage: () => runViewerAction(instance => (
    currentPage.value > 1
      ? instance.applyViewState({ page: currentPage.value - 1, pageCount: totalPages.value })
      : undefined
  )),
  nextPage: () => runViewerAction(instance => (
    currentPage.value < totalPages.value
      ? instance.applyViewState({ page: currentPage.value + 1, pageCount: totalPages.value })
      : undefined
  )),
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
.doc-viewer-surface :deep(.docx-fit-viewer::-webkit-scrollbar),
.doc-viewer-surface :deep(.msdoc-zoom-viewer::-webkit-scrollbar),
.doc-viewer-surface :deep(.pdf-wrapper::-webkit-scrollbar) {
  display: block !important;
  width: 6px !important;
  height: 6px !important;
}

.doc-viewer-surface::-webkit-scrollbar-track,
.doc-viewer-surface :deep(.docx-fit-viewer::-webkit-scrollbar-track),
.doc-viewer-surface :deep(.msdoc-zoom-viewer::-webkit-scrollbar-track),
.doc-viewer-surface :deep(.pdf-wrapper::-webkit-scrollbar-track) {
  background: transparent !important;
}

.doc-viewer-surface::-webkit-scrollbar-thumb,
.doc-viewer-surface :deep(.docx-fit-viewer::-webkit-scrollbar-thumb),
.doc-viewer-surface :deep(.msdoc-zoom-viewer::-webkit-scrollbar-thumb),
.doc-viewer-surface :deep(.pdf-wrapper::-webkit-scrollbar-thumb) {
  background: rgba(107, 119, 98, 0.26) !important;
  border-radius: 999px !important;
}

.doc-viewer-surface::-webkit-scrollbar-thumb:hover,
.doc-viewer-surface :deep(.docx-fit-viewer::-webkit-scrollbar-thumb:hover),
.doc-viewer-surface :deep(.msdoc-zoom-viewer::-webkit-scrollbar-thumb:hover),
.doc-viewer-surface :deep(.pdf-wrapper::-webkit-scrollbar-thumb:hover) {
  background: rgba(107, 119, 98, 0.42) !important;
}

.doc-viewer-surface :deep(.image-toolbar),
.doc-viewer-surface :deep(.pdf-state:not(.pdf-state--error)),
.doc-viewer-surface :deep(.pptx-loading),
.doc-viewer-surface :deep(.ppt-binary-loading) {
  display: none !important;
}

.doc-viewer-surface :deep(.render-surface),
.doc-viewer-surface :deep(.file-viewer-surface),
.doc-viewer-surface :deep(.file-viewer-paper),
.doc-viewer-surface :deep(.ff-file-viewer-render-surface),
.doc-viewer-surface :deep(.docx-wrapper) {
  background: transparent !important;
}

.doc-viewer-surface :deep(.pdfViewer) {
  margin: 0 auto;
  padding: 20px 14px 88px !important;
}

.doc-viewer-surface :deep(.pdfViewer .page) {
  border-radius: 6px;
  box-shadow: 0 6px 22px rgba(45, 55, 40, 0.08), 0 1px 4px rgba(45, 55, 40, 0.04);
}

.doc-viewer-surface :deep(.pptx-viewer-shell),
.doc-viewer-surface :deep(.ppt-binary-shell) {
  padding: 20px 18px 88px !important;
}

.doc-viewer-surface :deep(.docx-wrapper) {
  width: max-content !important;
  min-width: 100% !important;
  padding: 20px 14px 88px !important;
  box-sizing: border-box;
}

.doc-viewer-surface :deep(.docx-page-frame),
.doc-viewer-surface :deep(.docx-flow-frame) {
  margin-left: auto !important;
  margin-right: auto !important;
}

.doc-viewer-surface :deep(.docx-page-frame > section.docx),
.doc-viewer-surface :deep(.docx-flow-frame > section.docx) {
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(45, 55, 40, 0.08), 0 1px 4px rgba(45, 55, 40, 0.04) !important;
  border: 1px solid rgba(45, 55, 40, 0.06);
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
  box-sizing: border-box;
}

.doc-overlay-fade-enter-active,
.doc-overlay-fade-leave-active {
  transition: opacity 180ms ease;
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
