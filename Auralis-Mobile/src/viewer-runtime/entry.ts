import { createViewer } from '@file-viewer/core'
import { setDefaultFileViewerAssetBaseUrl } from '@file-viewer/core/assets'
import pdfRenderer from '@file-viewer/renderer-pdf'
import presentationRenderer from '@file-viewer/renderer-presentation'
import wordRenderer from '@file-viewer/renderer-word'
import {
  createDocumentViewerSession,
  type DocViewerZoomPayload,
  type DocumentViewerSession,
} from '@/services/documentViewerEngine'

export interface NativeViewerMountOptions {
  container: HTMLDivElement
  buffer: ArrayBuffer
  fileName: string
  mimeType: string
  previewKind: 'pdf' | 'word' | 'presentation'
  runtimeAssetBase: string
  signal: AbortSignal
  onZoomChange: (zoom: DocViewerZoomPayload) => void
  onRotationChange: (rotation: number) => void
  onPageChange: (page: number, pageCount: number) => void
  onRotateFallback: (nextRotation: number) => void
}

export interface AuralisNativeDocViewerGlobal {
  createSession(options: NativeViewerMountOptions): DocumentViewerSession
}

declare global {
  interface Window {
    __AURALIS_DOC_VIEWER__?: AuralisNativeDocViewerGlobal
  }
}

const runtimeApi: AuralisNativeDocViewerGlobal = {
  createSession(options) {
    return createDocumentViewerSession({
      ...options,
      deps: {
        createViewer,
        setDefaultFileViewerAssetBaseUrl,
        pdfRenderer,
        wordRenderer,
        presentationRenderer,
      },
    })
  },
}

if (typeof window !== 'undefined') {
  window.__AURALIS_DOC_VIEWER__ = runtimeApi
}

export default runtimeApi
