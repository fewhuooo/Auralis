<template>
  <div class="pdf-viewer-container">
    <!-- Viewer Body -->
    <div class="pdf-body" ref="viewerBodyRef">
      <div v-if="loading" class="pdf-loading">
        <div class="loading-spinner"></div>
        <span class="loading-text">{{ loadingText }}</span>
      </div>
      
      <div v-else-if="error" class="pdf-error">
        <div class="error-icon-wrapper">
          <FileQuestion class="error-icon" />
        </div>
        <div class="error-content">
          <h3 class="error-title">文档加载失败</h3>
          <p class="error-desc">{{ error }}</p>
        </div>
        <button class="retry-btn" @click="retryLoad">
          <RefreshCw class="retry-icon" />
          <span>重新尝试加载</span>
        </button>
      </div>
      
      <div class="pdf-canvas-container" v-show="!loading && !error">
        <canvas ref="pdfCanvasRef"></canvas>
      </div>
    </div>

    <!-- Toolbar (Bottom) -->
    <div class="pdf-toolbar" v-show="!loading && !error">
      <div class="toolbar-center">
        <button class="tool-btn" :disabled="currentPage <= 1" @click="prevPage" title="上一页">
          <ChevronLeft class="tool-icon" />
        </button>
        <span class="page-info">
          <input 
            type="number" 
            v-model.number="pageInput" 
            @keyup.enter="goToPage"
            class="page-input"
            min="1"
            :max="totalPages"
          />
          <span class="page-divider">/</span>
          <span class="page-total">{{ totalPages || '?' }}</span>
        </span>
        <button class="tool-btn" :disabled="currentPage >= totalPages" @click="nextPage" title="下一页">
          <ChevronRight class="tool-icon" />
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-right">
        <button class="tool-btn" @click="zoomOut" title="缩小">
          <ZoomOut class="tool-icon" />
        </button>
        <span class="zoom-info">{{ Math.round(scale * 100) }}%</span>
        <button class="tool-btn" @click="zoomIn" title="放大">
          <ZoomIn class="tool-icon" />
        </button>
        <button class="tool-btn fit-btn" @click="fitWidth" title="自适应宽度">
          <Maximize class="tool-icon" />
          <span>适应宽度</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, ZoomOut, ZoomIn, Maximize, FileQuestion, RefreshCw } from 'lucide-vue-next'

// Setup worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

const props = defineProps({
  filePath: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    default: 'PDF 文档'
  }
})

const emit = defineEmits(['page-changed', 'loaded'])

const pdfCanvasRef = ref<HTMLCanvasElement | null>(null)
const viewerBodyRef = ref<HTMLDivElement | null>(null)

const loading = ref(true)
const loadingText = ref('正在加载 PDF 文件...')
const error = ref<string | null>(null)

const currentPage = ref(1)
const pageInput = ref(1)
const totalPages = ref(0)
const scale = ref(1.0)

let loadGeneration = 0
let renderGeneration = 0
let pdfDoc: any = null
let currentRenderTask: any = null
let currentLoadingTask: any = null

const clearCanvas = () => {
  const canvas = pdfCanvasRef.value
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

const disposePdf = () => {
  renderGeneration += 1
  if (currentRenderTask) {
    currentRenderTask.cancel()
    currentRenderTask = null
  }
  if (currentLoadingTask) {
    try {
      currentLoadingTask.destroy()
    } catch {}
    currentLoadingTask = null
  }
  if (pdfDoc) {
    try {
      pdfDoc.destroy()
    } catch {}
    pdfDoc = null
  }
  clearCanvas()
}

const isCancellationError = (err: any) =>
  err?.name === 'RenderingCancelledException' ||
  err?.name === 'AbortException' ||
  err?.message?.includes('Worker was destroyed') ||
  err?.message?.includes('cancelled')

const retryLoad = () => {
  if (props.filePath) {
    void loadPdf(props.filePath)
  }
}

const loadPdf = async (filePath: string) => {
  const myGeneration = ++loadGeneration
  disposePdf()

  if (!filePath) {
    error.value = '未指定 PDF 文件路径或路径为空。'
    loading.value = false
    return
  }

  loading.value = true
  error.value = null
  currentPage.value = 1
  pageInput.value = 1
  
  try {
    loadingText.value = '正在加载 PDF...'
    
    let pdfData: any
    
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const corePluginName = '@tauri-apps/api/core'
      const { convertFileSrc } = await import(/* @vite-ignore */ corePluginName)
      pdfData = { url: convertFileSrc(filePath) }
    } else {
      pdfData = { url: filePath }
    }

    if (myGeneration !== loadGeneration) return

    loadingText.value = '正在解析 PDF 结构...'
    const loadingTask = pdfjsLib.getDocument(pdfData)
    currentLoadingTask = loadingTask
    
    const doc = await loadingTask.promise
    if (myGeneration !== loadGeneration) {
      try {
        doc.destroy()
      } catch {}
      return
    }

    if (currentLoadingTask === loadingTask) currentLoadingTask = null
    pdfDoc = doc
    totalPages.value = doc.numPages
    loading.value = false
    
    emit('loaded', { totalPages: totalPages.value })

    if (viewerBodyRef.value) {
      const page = await doc.getPage(1)
      if (myGeneration !== loadGeneration || pdfDoc !== doc) return
      const defaultViewport = page.getViewport({ scale: 1.0 })
      const containerWidth = viewerBodyRef.value.clientWidth - 40
      scale.value = Math.max(0.5, Math.min(2.0, containerWidth / defaultViewport.width))
    }

    if (myGeneration !== loadGeneration || pdfDoc !== doc) return
    await renderPage(1, myGeneration)
  } catch (err: any) {
    if (myGeneration !== loadGeneration || isCancellationError(err)) return
    console.error('Error loading PDF:', err)
    error.value = `文件解析失败: ${err.message || err}。请检查文件是否损坏或不存在。`
    loading.value = false
  }
}

const renderPage = async (pageNumber: number, generation = loadGeneration) => {
  const doc = pdfDoc
  const canvas = pdfCanvasRef.value
  const myRenderGeneration = ++renderGeneration
  if (!doc || !canvas) return
  
  if (currentRenderTask) {
    currentRenderTask.cancel()
    currentRenderTask = null
  }

  try {
    const page = await doc.getPage(pageNumber)
    if (generation !== loadGeneration || myRenderGeneration !== renderGeneration || pdfDoc !== doc) return
    const viewport = page.getViewport({ scale: scale.value })
    
    const context = canvas.getContext('2d')
    if (!context) return

    canvas.height = viewport.height
    canvas.width = viewport.width

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    }
    
    const renderTask = page.render(renderContext)
    currentRenderTask = renderTask
    await renderTask.promise
    if (currentRenderTask === renderTask) currentRenderTask = null
    if (generation !== loadGeneration || myRenderGeneration !== renderGeneration || pdfDoc !== doc) return
    
    currentPage.value = pageNumber
    pageInput.value = pageNumber
    emit('page-changed', pageNumber)
  } catch (err: any) {
    if (generation !== loadGeneration || myRenderGeneration !== renderGeneration || isCancellationError(err)) return
    console.error('Error rendering page:', err)
    error.value = `页面渲染出错: ${err.message}`
  }
}

const prevPage = () => {
  if (currentPage.value > 1) {
    void renderPage(currentPage.value - 1)
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    void renderPage(currentPage.value + 1)
  }
}

const goToPage = () => {
  let page = pageInput.value
  if (isNaN(page) || page < 1) page = 1
  if (page > totalPages.value) page = totalPages.value
  void renderPage(page)
}

const zoomIn = () => {
  scale.value = Math.min(3.0, scale.value + 0.1)
  void renderPage(currentPage.value)
}

const zoomOut = () => {
  scale.value = Math.max(0.5, scale.value - 0.1)
  void renderPage(currentPage.value)
}

const fitWidth = async () => {
  if (!pdfDoc || !viewerBodyRef.value) return
  try {
    const page = await pdfDoc.getPage(currentPage.value)
    const defaultViewport = page.getViewport({ scale: 1.0 })
    const containerWidth = viewerBodyRef.value.clientWidth - 40
    scale.value = Math.max(0.5, Math.min(2.0, containerWidth / defaultViewport.width))
    void renderPage(currentPage.value)
  } catch (err) {
    console.error('Error fitting width:', err)
  }
}

watch(() => props.filePath, (newVal) => {
  if (newVal) {
    void loadPdf(newVal)
  }
})

onMounted(() => {
  if (props.filePath) {
    void loadPdf(props.filePath)
  }
})

onUnmounted(() => {
  loadGeneration += 1
  disposePdf()
})
</script>

<style scoped>
.pdf-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: transparent;
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
}

.pdf-body {
  flex: 1;
  overflow: auto;
  position: relative;
  background: var(--color-bg-secondary);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 24px;
}

.pdf-toolbar {
  height: 52px;
  background: var(--color-bg-primary);
  border-top: 1px solid var(--border-subtle); /* changed to border-top */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  gap: 24px;
  backdrop-filter: blur(10px);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border-default);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  padding: 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-subtle);
}

.tool-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.tool-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.tool-icon {
  width: 16px;
  height: 16px;
  stroke-width: 2px;
}

.fit-btn {
  padding: 6px 12px;
  gap: 6px;
}

.fit-btn span {
  font-size: 12px;
  font-weight: 500;
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-bg-tertiary);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
}

.page-input {
  width: 32px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-weight: 600;
  text-align: right;
  font-size: 13px;
  padding: 0;
}

.page-input:focus {
  outline: none;
  color: var(--color-primary-accent);
}

/* Hide number input arrows */
.page-input::-webkit-outer-spin-button,
.page-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  appearance: textfield;
  margin: 0;
}
.page-input[type=number] {
  -moz-appearance: textfield;
}

.page-divider {
  color: var(--text-muted);
}

.page-total {
  font-weight: 500;
}

.zoom-info {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 44px;
  text-align: center;
}

.pdf-loading, .pdf-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: var(--color-bg-primary);
  padding: 32px 40px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 8px 30px rgba(0,0,0,0.05);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--color-bg-tertiary);
  border-top-color: var(--color-primary-accent);
  border-radius: 50%;
  animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.loading-text {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
}

.error-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ef4444;
}

.error-icon {
  width: 24px;
  height: 24px;
}

.error-content {
  text-align: center;
}

.error-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px 0;
}

.error-desc {
  color: var(--text-secondary);
  font-size: 13px;
  max-width: 280px;
  line-height: 1.5;
  margin: 0;
  word-wrap: break-word;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  padding: 8px 20px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-top: 4px;
}

.retry-btn:hover {
  background: var(--color-primary-light);
  color: var(--color-primary-accent);
  border-color: var(--color-primary-accent);
}

.retry-btn:active {
  transform: scale(0.96);
}

.retry-icon {
  width: 14px;
  height: 14px;
}

.pdf-canvas-container {
  box-shadow: 0 12px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05);
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  transition: transform var(--transition-normal);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
