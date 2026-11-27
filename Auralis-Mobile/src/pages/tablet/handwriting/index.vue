<template>
  <TabletLayout>
    <div class="t-handwriting">
      
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="left">
          <span class="back-btn" @click="goBack">‹ 返回</span>
          <input class="title-input" v-model="notebook.title" @blur="save" />
          <span class="save-status">{{ saveStatus }}</span>
        </div>
        <div class="center tool-group">
          <div class="tool-btn" :class="{ active: currentTool === 'pan' }" @click="currentTool = 'pan'">✋</div>
          <div class="tool-btn" :class="{ active: currentTool === 'pen' }" @click="currentTool = 'pen'">╱</div>
          <div class="tool-btn" :class="{ active: currentTool === 'pencil' }" @click="currentTool = 'pencil'">∕</div>
          <div class="tool-btn" :class="{ active: currentTool === 'highlighter' }" @click="currentTool = 'highlighter'">═</div>
          <div class="tool-btn" :class="{ active: currentTool === 'eraser' }" @click="currentTool = 'eraser'">◌</div>
          <div class="divider"></div>
          <!-- Colors -->
          <div class="colors">
            <div class="c-dot" style="background:#000" :class="{ active: currentColor==='#000' }" @click="currentColor='#000'"></div>
            <div class="c-dot" style="background:#ef4444" :class="{ active: currentColor==='#ef4444' }" @click="currentColor='#ef4444'"></div>
            <div class="c-dot" style="background:#3b82f6" :class="{ active: currentColor==='#3b82f6' }" @click="currentColor='#3b82f6'"></div>
            <div class="c-dot" style="background:#22c55e" :class="{ active: currentColor==='#22c55e' }" @click="currentColor='#22c55e'"></div>
            <div class="c-dot" style="background:#a855f7" :class="{ active: currentColor==='#a855f7' }" @click="currentColor='#a855f7'"></div>
          </div>
          <div class="divider"></div>
          <!-- Thickness -->
          <div class="thickness-group">
            <div
              v-for="size in thicknessOptions"
              :key="size"
              class="thickness-btn"
              :class="{ active: currentSize === size }"
              @click="currentSize = size"
            >
              <div class="thickness-dot" :style="{ width: size + 'px', height: size + 'px' }"></div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="tool-btn" @click="undo">↩</div>
          <div class="tool-btn" @click="zoomOut">−</div>
          <div class="tool-btn" @click="resetViewport">1:1</div>
          <div class="tool-btn" @click="zoomIn">＋</div>
        </div>
        <div class="right">
          <div class="menu-btn" @click="exportPNG">导出 PNG</div>
          <div class="menu-btn" @click="exportPDF">导出 PDF</div>
        </div>
      </div>

      <!-- Canvas Area -->
      <div class="canvas-container" :class="'bg-' + notebook.background">
        <!-- Render Canvas using native element to support PointerEvents -->
        <div class="canvas-viewport" :style="viewportStyle">
          <canvas
            ref="canvasRef"
            id="hw-canvas"
            class="hw-canvas"
            :width="canvasWidth"
            :height="canvasHeight"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @pointerleave="onPointerUp"
          ></canvas>
        </div>
      </div>

    </div>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { hideLoading, showLoading, showToast } from '@/platform/feedback'
import { onPageLoad } from '@/platform/lifecycle'
import { canNavigateBack, navigateBack, redirectTo } from '@/platform/navigation'
import { HandwritingEngine, type StrokePoint } from '@/services/handwritingEngine'
import { NotebookStorage } from '@/services/notebookStorage'
import { uuidv7 } from '@/utils/uuid'
import {
  fromLegacyStroke,
  toLegacyStrokes,
  upsertStroke,
  type NoteDocument,
  type NoteStroke,
} from '@/services/tabletNoteModel'

const notebook = ref<NoteDocument>(NotebookStorage.createQuickCanvasNote('随手记草稿本'))
const saveStatus = ref('已保存')
const notebookId = ref<string | null>(null)

const currentTool = ref<'pan' | 'pen' | 'pencil' | 'highlighter' | 'eraser'>('pen')
const currentColor = ref('#000')
const currentSize = ref(4)
const thicknessOptions = [2, 4, 6, 8, 12]

const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: HandwritingEngine | null = null
let activeStroke: NoteStroke | null = null
let isDrawing = false
let isPanning = false
let lastPanPoint: { x: number; y: number } | null = null
let saveTimeout: any = null

const canvasWidth = ref(3200)
const canvasHeight = ref(2400)

const viewportStyle = computed(() => ({
  transform: `translate(${notebook.value.viewport.x}px, ${notebook.value.viewport.y}px) scale(${notebook.value.viewport.scale})`
}))

onPageLoad((options) => {
  if (options?.id) {
    notebookId.value = options.id
  }
})

onMounted(async () => {
  await NotebookStorage.initSchema()

  if (notebookId.value) {
    const existing = await NotebookStorage.loadNoteDocument(notebookId.value)
    if (existing) {
      notebook.value = existing
    }
  }

  if (canvasRef.value) {
    const ctx = canvasRef.value.getContext('2d')
    if (ctx) {
      engine = new HandwritingEngine(ctx)
      if (notebook.value.strokes.length > 0) {
        engine.loadStrokes(toLegacyStrokes(notebook.value))
      }
    }
  }
})

onUnmounted(() => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
    void NotebookStorage.saveNoteDocument(notebook.value)
  }
})

const onPointerDown = (e: PointerEvent) => {
  if (!engine) return
  isDrawing = true
  e.preventDefault()

  if (currentTool.value === 'pan') {
    isPanning = true
    lastPanPoint = { x: e.clientX, y: e.clientY }
    return
  }

  const pt = getCanvasPoint(e)

  if (currentTool.value === 'eraser') {
    engine.erase([pt], 20)
    syncDocumentFromEngine()
    triggerAutoSave()
  } else {
    const now = new Date().toISOString()
    activeStroke = {
      id: uuidv7(),
      points: [pt],
      tool: currentTool.value,
      color: currentColor.value,
      size: currentSize.value,
      createdAt: now
    }
  }
}

const onPointerMove = (e: PointerEvent) => {
  if (!isDrawing || !engine) return
  e.preventDefault()

  if (isPanning && lastPanPoint) {
    const dx = e.clientX - lastPanPoint.x
    const dy = e.clientY - lastPanPoint.y
    notebook.value = {
      ...notebook.value,
      viewport: {
        ...notebook.value.viewport,
        x: notebook.value.viewport.x + dx,
        y: notebook.value.viewport.y + dy,
      },
      updatedAt: new Date().toISOString(),
    }
    lastPanPoint = { x: e.clientX, y: e.clientY }
    return
  }

  // Coalesced events for high refresh rate displays (iPad Pro 120Hz)
  const events = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e]
  
  const newPoints: StrokePoint[] = events.map((ev: PointerEvent) => getCanvasPoint(ev))

  if (currentTool.value === 'eraser') {
    engine.erase(newPoints, 20)
    syncDocumentFromEngine()
    triggerAutoSave()
  } else if (activeStroke) {
    activeStroke.points.push(...newPoints)
    // Fast render current stroke
    engine.render() // Re-render all for simplicity, real app would use overlay canvas
    const ctx = canvasRef.value?.getContext('2d')
    if (ctx) {
      // Very basic active stroke render during drag
      ctx.beginPath()
      const pts = activeStroke.points
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.strokeStyle = activeStroke.color
      ctx.lineWidth = activeStroke.size
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  }
}

const onPointerUp = (e: PointerEvent) => {
  if (!isDrawing || !engine) return
  isDrawing = false

  if (isPanning) {
    isPanning = false
    lastPanPoint = null
    triggerAutoSave()
    return
  }
  
  if (activeStroke && currentTool.value !== 'eraser') {
    engine.addStroke(activeStroke)
    notebook.value = upsertStroke(notebook.value, activeStroke)
    activeStroke = null
    triggerAutoSave()
  }
}

const undo = () => {
  if (engine) {
    engine.undo()
    syncDocumentFromEngine()
    triggerAutoSave()
  }
}

const triggerAutoSave = () => {
  saveStatus.value = '保存中...'
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(save, 2000)
}

const save = async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  saveStatus.value = '保存中...'
  const success = await NotebookStorage.saveNoteDocument(notebook.value)
  saveStatus.value = success ? '已保存' : '保存失败'
}

const getCanvasPoint = (e: PointerEvent): StrokePoint => {
  const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) / notebook.value.viewport.scale,
    y: (e.clientY - rect.top) / notebook.value.viewport.scale,
    pressure: e.pressure || 0.5,
    tiltX: e.tiltX || 0,
    tiltY: e.tiltY || 0,
    timestamp: Date.now()
  }
}

const syncDocumentFromEngine = () => {
  if (!engine) return
  const now = new Date().toISOString()
  notebook.value = {
    ...notebook.value,
    strokes: engine.getStrokes().map(stroke => {
      const noteStroke = stroke as NoteStroke
      return noteStroke.createdAt ? noteStroke : fromLegacyStroke(stroke, now)
    }),
    updatedAt: now,
  }
}

const zoomBy = (delta: number) => {
  const nextScale = Math.min(3, Math.max(0.25, Number((notebook.value.viewport.scale + delta).toFixed(2))))
  notebook.value = {
    ...notebook.value,
    viewport: {
      ...notebook.value.viewport,
      scale: nextScale,
    },
    updatedAt: new Date().toISOString(),
  }
  triggerAutoSave()
}

const zoomIn = () => zoomBy(0.15)
const zoomOut = () => zoomBy(-0.15)

const resetViewport = () => {
  notebook.value = {
    ...notebook.value,
    viewport: { x: 0, y: 0, scale: 1 },
    updatedAt: new Date().toISOString(),
  }
  triggerAutoSave()
}

const exportPNG = async () => {
  if (!engine) return
  try {
    const blob = await engine.exportToPNG()
    const url = URL.createObjectURL(blob)
    // Download logic
    const a = document.createElement('a')
    a.href = url
    a.download = `${notebook.value.title}.png`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    showToast('导出失败')
  }
}

const exportPDF = async () => {
  if (!canvasRef.value) return
  try {
    showLoading('生成中...')
    const { default: jsPDF } = await import('jspdf')
    const pdf = new jsPDF('p', 'pt', 'a4')
    // Get image data from canvas
    const imgData = canvasRef.value.toDataURL('image/png')
    
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvasRef.value.height * pdfWidth) / canvasRef.value.width
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`${notebook.value.title}.pdf`)
    hideLoading()
  } catch (e) {
    hideLoading()
    showToast('生成 PDF 失败')
  }
}

const goBack = () => {
  save()
  if (canNavigateBack()) {
    navigateBack()
    return
  }
  redirectTo('/pages/tablet/subject-hall/index')
}
</script>

<style scoped>
.t-handwriting {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--color-zen-ivory, #F9F9F7);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--color-zen-white, #FFFFFF);
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  z-index: 10;
}
.left, .right {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 160px;
}
.right { justify-content: flex-end; }
.back-btn {
  font-size: 16px;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: var(--font-family-base);
  font-weight: 600;
  cursor: pointer;
}
.title-input {
  font-size: 16px;
  font-weight: 800;
  border: none;
  background: transparent;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: var(--font-family-base);
  width: 110px;
}
.save-status {
  font-size: 12px;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}
.tool-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 999px;
  font-size: 16px;
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.tool-btn.active {
  background: var(--color-zen-white, #FFFFFF);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.divider {
  width: 1px; height: 20px;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 0 5px;
}
.colors {
  display: flex;
  gap: 8px;
}
.c-dot {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.2s;
}
.c-dot.active {
  border-color: var(--color-zen-graphite, #1C1C1A);
  transform: scale(1.15);
}

.thickness-group {
  display: flex;
  gap: 4px;
  align-items: center;
}
.thickness-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid transparent;
  transition: all 0.2s;
}
.thickness-btn.active {
  border-color: var(--color-zen-graphite, #1C1C1A);
  background: var(--color-zen-white, #FFFFFF);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.thickness-dot {
  border-radius: 50%;
  background: var(--color-zen-graphite, #1C1C1A);
}

.menu-btn {
  font-size: 14px;
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 600;
  padding: 7px 14px;
  background: var(--color-zen-ivory, #F9F9F7);
  border-radius: 999px;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  cursor: pointer;
  transition: all 0.2s;
}
.menu-btn:active {
  transform: scale(0.96);
  background: rgba(0, 0, 0, 0.04);
}

.canvas-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  background: #EBEBE9;
  padding: 0;
  position: relative;
}

.canvas-viewport {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.hw-canvas {
  background: #FFFFFF;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  cursor: crosshair;
  touch-action: none; 
}
.bg-grid {
  background-image: radial-gradient(#D8D8D5 1px, transparent 0);
  background-size: 20px 20px;
}
</style>
