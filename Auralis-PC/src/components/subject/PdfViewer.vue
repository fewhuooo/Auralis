<template>
  <div class="pdf-viewer-container">
    <!-- Toolbar -->
    <div class="pdf-toolbar">
      <div class="toolbar-left">
        <span class="file-name" :title="fileName">{{ fileName }}</span>
      </div>
      
      <div class="toolbar-center">
        <button class="tool-btn" :disabled="currentPage <= 1" @click="prevPage">◀</button>
        <span class="page-info">
          <input 
            type="number" 
            v-model.number="pageInput" 
            @keyup.enter="goToPage"
            class="page-input"
            min="1"
            :max="totalPages"
          />
          / {{ totalPages || '?' }}
        </span>
        <button class="tool-btn" :disabled="currentPage >= totalPages" @click="nextPage">▶</button>
      </div>

      <div class="toolbar-right">
        <button class="tool-btn" @click="zoomOut">➖</button>
        <span class="zoom-info">{{ Math.round(scale * 100) }}%</span>
        <button class="tool-btn" @click="zoomIn">➕</button>
        <button class="tool-btn" @click="fitWidth">自适应</button>
      </div>
    </div>

    <!-- Viewer Body -->
    <div class="pdf-body" ref="viewerBodyRef">
      <div v-if="loading" class="pdf-loading">
        <span class="loading-spinner"></span>
        <span class="loading-text">{{ loadingText }}</span>
      </div>
      <div v-else-if="error" class="pdf-error">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ error }}</span>
      </div>
      
      <div class="pdf-canvas-container" v-show="!loading && !error">
        <canvas ref="pdfCanvasRef"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

// Setup worker
// Since tauri uses standard ES modules in Vite, we can fetch the worker from node_modules or use CDN.
// To make it robust and local first, we use the standard cdn worker import or configure it properly.
// A common tauri-friendly solution is pointing to cdnjs or local path. We will use CDN to be 100% reliable without local packaging issues, or a local import.
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

let pdfDoc: any = null
let currentRenderTask: any = null

const loadPdf = async (path: string) => {
  if (!path) {
    error.value = '未指定 PDF 文件路径'
    loading.value = false
    return
  }

  loading.value = true
  error.value = null
  currentPage.value = 1
  pageInput.value = 1
  
  try {
    loadingText.value = '正在读取文件...'
    
    // In Tauri, direct file paths require converting to an asset URL if using custom protocols or read as binary array.
    // Let's use Tauri's API to fetch or convert, or read as binary array.
    // If it's a local file path, we can read it using Tauri's fs API or convertFileSrc.
    let pdfData: any = path
    
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      try {
        // Dynamic path template to bypass bundler static analysis
        const fsPluginName = '@tauri-apps/plugin-fs'
        const { readFile } = await import(/* @vite-ignore */ fsPluginName)
        loadingText.value = '正在加载本地文件内容...'
        const binary = await readFile(path)
        pdfData = { data: new Uint8Array(binary) }
      } catch (fsErr) {
        console.warn('Failed to read file via Tauri FS, attempting direct url conversion:', fsErr)
        // Fallback to tauri convertFileSrc if plugin-fs fails or is not configured
        const corePluginName = '@tauri-apps/api/core'
        const { convertFileSrc } = await import(/* @vite-ignore */ corePluginName)
        pdfData = { url: convertFileSrc(path) }
      }
    } else {
      pdfData = { url: path }
    }

    loadingText.value = '正在解析 PDF 结构...'
    const loadingTask = pdfjsLib.getDocument(pdfData)
    
    pdfDoc = await loadingTask.promise
    totalPages.value = pdfDoc.numPages
    loading.value = false
    
    emit('loaded', { totalPages: totalPages.value })
    
    // Auto fit width after loading
    await fitWidth()
    await renderPage(1)
  } catch (err: any) {
    console.error('Error loading PDF:', err)
    error.value = `无法载入 PDF 文件: ${err.message || err}`
    loading.value = false
  }
}

const renderPage = async (pageNumber: number) => {
  if (!pdfDoc || !pdfCanvasRef.value) return
  
  if (currentRenderTask) {
    currentRenderTask.cancel()
  }

  try {
    const page = await pdfDoc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: scale.value })
    
    const canvas = pdfCanvasRef.value
    const context = canvas.getContext('2d')
    if (!context) return

    canvas.height = viewport.height
    canvas.width = viewport.width

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    }
    
    currentRenderTask = page.render(renderContext)
    await currentRenderTask.promise
    currentRenderTask = null
    
    currentPage.value = pageNumber
    pageInput.value = pageNumber
    emit('page-changed', pageNumber)
  } catch (err: any) {
    if (err.name === 'RenderingCancelledException' || err.name === 'WorkerDragCancelledException') {
      // Normal cancellation, do nothing
      return
    }
    console.error('Error rendering page:', err)
    error.value = `页面渲染出错: ${err.message}`
  }
}

const prevPage = () => {
  if (currentPage.value > 1) {
    renderPage(currentPage.value - 1)
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    renderPage(currentPage.value + 1)
  }
}

const goToPage = () => {
  let page = pageInput.value
  if (isNaN(page) || page < 1) page = 1
  if (page > totalPages.value) page = totalPages.value
  renderPage(page)
}

const zoomIn = () => {
  scale.value = Math.min(3.0, scale.value + 0.1)
  renderPage(currentPage.value)
}

const zoomOut = () => {
  scale.value = Math.max(0.5, scale.value - 0.1)
  renderPage(currentPage.value)
}

const fitWidth = async () => {
  if (!pdfDoc || !viewerBodyRef.value) return
  try {
    const page = await pdfDoc.getPage(currentPage.value)
    const defaultViewport = page.getViewport({ scale: 1.0 })
    const containerWidth = viewerBodyRef.value.clientWidth - 40 // subtract padding
    scale.value = Math.max(0.5, Math.min(2.0, containerWidth / defaultViewport.width))
    renderPage(currentPage.value)
  } catch (err) {
    console.error('Error fitting width:', err)
  }
}

watch(() => props.filePath, (newVal) => {
  if (newVal) {
    loadPdf(newVal)
  }
})

onMounted(() => {
  if (props.filePath) {
    loadPdf(props.filePath)
  }
})

onUnmounted(() => {
  if (currentRenderTask) {
    currentRenderTask.cancel()
  }
})
</script>

<style scoped>
.pdf-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-card, #262629);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.pdf-toolbar {
  height: 48px;
  background: var(--bg-app, #1c1c1e);
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  gap: 12px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-name {
  font-size: 13px;
  font-weight: 600;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary, #fff);
}

.tool-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-primary, #fff);
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 12px;
  color: var(--text-secondary, #d1d1d6);
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-input {
  width: 40px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 4px;
  padding: 2px 4px;
  text-align: center;
  font-size: 12px;
}

.zoom-info {
  font-size: 12px;
  color: var(--text-secondary, #d1d1d6);
  min-width: 40px;
  text-align: center;
}

.pdf-body {
  flex: 1;
  overflow: auto;
  position: relative;
  background: #151516;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
}

.pdf-loading, .pdf-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary, #d1d1d6);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: var(--color-oatmeal-dark, #c5a880);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-icon {
  font-size: 24px;
}

.error-text {
  color: #ef4444;
  font-size: 13px;
  text-align: center;
}

.pdf-canvas-container {
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  background: #fff;
  border-radius: 4px;
  overflow: hidden;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
