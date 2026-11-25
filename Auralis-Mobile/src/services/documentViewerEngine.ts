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

export interface DocumentViewerEngineDeps {
  createViewer: typeof import('@file-viewer/core')['createViewer']
  setDefaultFileViewerAssetBaseUrl: (baseUrl: string) => void
  pdfRenderer: FileViewerRendererPlugin<DivRenderHandler>
  wordRenderer: FileViewerRendererPlugin<DivRenderHandler>
  presentationRenderer: FileViewerRendererPlugin<DivRenderHandler>
}

export type DivRenderHandler = FileRenderHandler<FileViewerRenderedInstance, HTMLDivElement>

type PdfHandlerInterceptor = (
  handler: DivRenderHandler,
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type: string | undefined,
  context: FileRenderContext | undefined,
) => ReturnType<DivRenderHandler>

export const PDF_READY_TIMEOUT_MS = 60_000

export const DEFAULT_DOC_VIEWER_ZOOM: DocViewerZoomPayload = {
  scale: 1,
  label: '100%',
  canZoomIn: true,
  canZoomOut: true,
  canReset: false,
}

export function isPptxPresentation(fileName: string, mimeType: string): boolean {
  if (/\.pptx$/i.test(fileName.trim())) return true
  return mimeType.toLowerCase().includes('presentationml')
}

export function toZoomPayload(
  state: FileViewerZoomState | null | undefined,
  fittedScale: number | null,
): DocViewerZoomPayload {
  if (!state) return { ...DEFAULT_DOC_VIEWER_ZOOM }
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

export function adaptDivRendererPlugin(
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

export function waitForSettledPaint(signal: AbortSignal): Promise<void> {
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

export interface DocumentViewerSessionOptions {
  container: HTMLDivElement
  buffer: ArrayBuffer
  fileName: string
  mimeType: string
  previewKind: 'pdf' | 'word' | 'presentation'
  runtimeAssetBase: string
  signal: AbortSignal
  deps: DocumentViewerEngineDeps
  onZoomChange: (zoom: DocViewerZoomPayload) => void
  onRotationChange: (rotation: number) => void
  onPageChange: (page: number, pageCount: number) => void
  onRotateFallback: (nextRotation: number) => void
}

export interface DocumentViewerSession {
  load(): Promise<{ zoom: DocViewerZoomPayload; page: number; pageCount: number }>
  zoomIn(): Promise<unknown>
  zoomOut(): Promise<unknown>
  resetZoom(): Promise<unknown>
  rotate(delta: number): Promise<unknown>
  prevPage(): Promise<unknown>
  nextPage(): Promise<unknown>
  destroy(reason: 'replace' | 'reset' | 'component-unmount'): Promise<void>
}

export function createDocumentViewerSession(
  options: DocumentViewerSessionOptions,
): DocumentViewerSession {
  const rawBase = options.runtimeAssetBase.endsWith('/')
    ? options.runtimeAssetBase
    : `${options.runtimeAssetBase}/`
  const normalizedBase = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawBase) || typeof document === 'undefined'
    ? rawBase
    : new URL(rawBase, document.baseURI || window.location.href).href
  options.deps.setDefaultFileViewerAssetBaseUrl(normalizedBase)

  let viewer: FileViewerInstance | null = null
  let ready = false
  let destroyed = false
  let fittedScale: number | null = null
  let currentPage = 1
  let totalPages = 1
  let currentRotation = 0
  let awaitPdfReady: ((signal: AbortSignal) => void | Promise<void>) | undefined
  const pendingActions: Array<(instance: FileViewerInstance) => Promise<unknown> | unknown> = []

  const wrappedPdfPlugin = adaptDivRendererPlugin(
    options.deps.pdfRenderer,
    (handler, buffer, target, type, context) => {
      return handler(buffer, target, type, {
        ...context,
        registerThumbnailAdapter(adapter) {
          context?.registerThumbnailAdapter?.(adapter)
          const beforeCapture = adapter?.beforeCapture
          if (!beforeCapture || options.signal.aborted || context?.signal?.aborted) return
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

  const handleEvent = (event: FileViewerEvent) => {
    if (destroyed || options.signal.aborted) return
    if (event.type === 'fit-change') {
      if (event.payload.applied && typeof event.payload.scale === 'number' && Number.isFinite(event.payload.scale)) {
        fittedScale = event.payload.scale
      }
      const latestZoom = viewer?.getZoomState()
      if (latestZoom) {
        options.onZoomChange(toZoomPayload(latestZoom, fittedScale))
      }
      return
    }
    if (event.type === 'zoom-change') {
      options.onZoomChange(toZoomPayload(event.payload, fittedScale))
      return
    }
    if (event.type !== 'view-state-change') return
    const nextState = event.payload.state
    if (typeof nextState.page === 'number' && Number.isFinite(nextState.page)) {
      currentPage = nextState.page
    }
    if (typeof nextState.pageCount === 'number' && Number.isFinite(nextState.pageCount)) {
      totalPages = Math.max(1, nextState.pageCount)
    }
    if (typeof nextState.rotation === 'number' && Number.isFinite(nextState.rotation)) {
      currentRotation = nextState.rotation
      options.onRotationChange(nextState.rotation)
    }
    if (nextState.zoom) {
      options.onZoomChange(toZoomPayload(nextState.zoom, fittedScale))
    }
    options.onPageChange(currentPage, totalPages)
  }

  async function waitForPdfReadiness(): Promise<void> {
    if (options.previewKind !== 'pdf' || !awaitPdfReady) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeoutAbort = new AbortController()
    const onParentAbort = () => timeoutAbort.abort(options.signal.reason)
    options.signal.addEventListener('abort', onParentAbort, { once: true })
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
      options.signal.removeEventListener('abort', onParentAbort)
    }
  }

  async function flushPendingActions(instance: FileViewerInstance): Promise<void> {
    if (destroyed || viewer !== instance || pendingActions.length === 0) return
    const actions = pendingActions.splice(0)
    for (const action of actions) {
      if (destroyed || viewer !== instance) return
      await action(instance)
    }
  }

  function runAction(action: (instance: FileViewerInstance) => Promise<unknown> | unknown): Promise<unknown> {
    if (destroyed) return Promise.resolve(null)
    if (!viewer || !ready) {
      pendingActions.push(action)
      return Promise.resolve(null)
    }
    return Promise.resolve(action(viewer))
  }

  const isPptx = isPptxPresentation(options.fileName, options.mimeType)
  viewer = options.deps.createViewer(options.container, {
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
        pptModuleUrl: new URL('vendor/ppt/index.mjs', normalizedBase).href,
        pptWorkerUrl: new URL('vendor/ppt/worker.mjs', normalizedBase).href,
        pptWasmUrl: new URL('vendor/ppt/ppt-native.wasm', normalizedBase).href,
        pptFontUrl: new URL('vendor/ppt/ppt-font-cjk.otf', normalizedBase).href,
      },
      rendererMode: 'replace',
      autoRenderers: false,
      renderers: [
        wrappedPdfPlugin,
        adaptDivRendererPlugin(options.deps.wordRenderer),
        adaptDivRendererPlugin(options.deps.presentationRenderer),
      ],
    },
    onEvent: handleEvent,
  })

  return {
    async load() {
      if (!viewer || destroyed || options.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const bufferCopy = options.buffer.slice(0)
      const file = typeof File !== 'undefined'
        ? new File([bufferCopy], options.fileName, { type: options.mimeType || 'application/octet-stream' })
        : undefined
      await viewer.load(
        {
          buffer: bufferCopy,
          ...(file ? { file } : {}),
          filename: options.fileName,
          size: bufferCopy.byteLength,
        },
        { signal: options.signal },
      )
      if (destroyed || options.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      await waitForPdfReadiness()
      if (destroyed || options.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      await waitForSettledPaint(options.signal)
      if (destroyed || options.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      const finalZoom = viewer.getZoomState()
      if (finalZoom && Number.isFinite(finalZoom.scale) && finalZoom.scale > 0) {
        fittedScale = finalZoom.scale
      }
      const zoomPayload = toZoomPayload(finalZoom, fittedScale)
      options.onZoomChange(zoomPayload)

      const finalView = viewer.getViewState()
      if (finalView) {
        if (typeof finalView.page === 'number') currentPage = finalView.page
        if (typeof finalView.pageCount === 'number') totalPages = Math.max(1, finalView.pageCount)
      }
      options.onPageChange(currentPage, totalPages)

      ready = true
      await flushPendingActions(viewer)
      return {
        zoom: zoomPayload,
        page: currentPage,
        pageCount: totalPages,
      }
    },
    zoomIn: () => runAction(instance => instance.zoomIn()),
    zoomOut: () => runAction(instance => instance.zoomOut()),
    resetZoom: () => runAction(async (instance) => {
      if (isPptx) {
        await instance.resetZoom()
      } else {
        await instance.fitToView()
      }
      if (destroyed || viewer !== instance) return
      const next = instance.getZoomState()
      if (next && Number.isFinite(next.scale) && next.scale > 0) {
        fittedScale = next.scale
        options.onZoomChange(toZoomPayload(next, fittedScale))
      }
    }),
    rotate: (delta: number) => runAction(async (instance) => {
      const nextRotation = (currentRotation + delta + 360) % 360
      const applied = await instance.applyViewState(
        { rotation: nextRotation },
        { action: delta < 0 ? 'rotate-left' : 'rotate-right', source: 'api' },
      )
      if (destroyed || viewer !== instance) return
      const resolved = applied?.rotation ?? instance.getViewState()?.rotation
      if (typeof resolved === 'number' && Number.isFinite(resolved)) {
        currentRotation = resolved
        options.onRotationChange(resolved)
        return
      }
      currentRotation = nextRotation
      options.onRotateFallback(nextRotation)
    }),
    prevPage: () => runAction(instance => (
      currentPage > 1
        ? instance.applyViewState({ page: currentPage - 1, pageCount: totalPages })
        : undefined
    )),
    nextPage: () => runAction(instance => (
      currentPage < totalPages
        ? instance.applyViewState({ page: currentPage + 1, pageCount: totalPages })
        : undefined
    )),
    async destroy(reason) {
      if (destroyed) return
      destroyed = true
      ready = false
      awaitPdfReady = undefined
      pendingActions.splice(0)
      const active = viewer
      viewer = null
      if (active) {
        await active.destroy(reason).catch(() => {})
      }
    },
  }
}
