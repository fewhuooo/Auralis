<template>
  <TabletLayout>
    <view class="t-handwriting">
      
      <!-- Toolbar -->
      <view class="toolbar">
        <view class="left">
          <text class="back-btn" @click="goBack">‹ 返回</text>
          <input class="title-input" v-model="notebook.title" @blur="save" />
          <text class="save-status">{{ saveStatus }}</text>
        </view>
        <view class="center tool-group">
          <view class="tool-btn" :class="{ active: currentTool === 'pen' }" @click="currentTool = 'pen'">╱</view>
          <view class="tool-btn" :class="{ active: currentTool === 'pencil' }" @click="currentTool = 'pencil'">∕</view>
          <view class="tool-btn" :class="{ active: currentTool === 'highlighter' }" @click="currentTool = 'highlighter'">═</view>
          <view class="tool-btn" :class="{ active: currentTool === 'eraser' }" @click="currentTool = 'eraser'">◌</view>
          <view class="divider"></view>
          <!-- Colors -->
          <view class="colors">
            <view class="c-dot" style="background:#000" :class="{ active: currentColor==='#000' }" @click="currentColor='#000'"></view>
            <view class="c-dot" style="background:#ef4444" :class="{ active: currentColor==='#ef4444' }" @click="currentColor='#ef4444'"></view>
            <view class="c-dot" style="background:#3b82f6" :class="{ active: currentColor==='#3b82f6' }" @click="currentColor='#3b82f6'"></view>
            <view class="c-dot" style="background:#22c55e" :class="{ active: currentColor==='#22c55e' }" @click="currentColor='#22c55e'"></view>
            <view class="c-dot" style="background:#a855f7" :class="{ active: currentColor==='#a855f7' }" @click="currentColor='#a855f7'"></view>
          </view>
          <view class="divider"></view>
          <!-- Thickness -->
          <view class="thickness-group">
            <view
              v-for="size in thicknessOptions"
              :key="size"
              class="thickness-btn"
              :class="{ active: currentSize === size }"
              @click="currentSize = size"
            >
              <view class="thickness-dot" :style="{ width: size * 2 + 'rpx', height: size * 2 + 'rpx' }"></view>
            </view>
          </view>
          <view class="divider"></view>
          <view class="tool-btn" @click="undo">↩</view>
        </view>
        <view class="right">
          <view class="menu-btn" @click="exportPNG">导出 PNG</view>
          <view class="menu-btn" @click="exportPDF">导出 PDF</view>
        </view>
      </view>

      <!-- Canvas Area -->
      <view class="canvas-container" :class="'bg-' + notebook.background">
        <!-- Render Canvas using native element to support PointerEvents -->
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
      </view>

    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { HandwritingEngine, type Stroke, type StrokePoint } from '@/services/handwritingEngine'
import { NotebookStorage } from '@/services/notebookStorage'
import { uuidv7 } from '@/utils/uuid'

const notebook = ref(NotebookStorage.createNewNotebook('随手记草稿本'))
const saveStatus = ref('已保存')
const notebookId = ref<string | null>(null)

const currentTool = ref<'pen' | 'pencil' | 'highlighter' | 'eraser'>('pen')
const currentColor = ref('#000')
const currentSize = ref(4)
const thicknessOptions = [2, 4, 6, 8, 12]

const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: HandwritingEngine | null = null
let activeStroke: Stroke | null = null
let isDrawing = false
let saveTimeout: any = null

const canvasWidth = ref(1200)
const canvasHeight = ref(1600) // Virtual A4 like size

onLoad((options) => {
  if (options?.id) {
    notebookId.value = options.id
  }
})

onMounted(async () => {
  await NotebookStorage.initSchema()

  // Load existing notebook if ID provided
  if (notebookId.value) {
    const existing = await NotebookStorage.loadNotebook(notebookId.value)
    if (existing) {
      notebook.value = existing
    }
  }

  if (canvasRef.value) {
    const ctx = canvasRef.value.getContext('2d')
    if (ctx) {
      engine = new HandwritingEngine(ctx)
      // Render existing strokes
      if (notebook.value.strokes.length > 0) {
        notebook.value.strokes.forEach(stroke => engine!.addStroke(stroke))
        engine.render()
      }
    }
  }
})

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
})

const onPointerDown = (e: PointerEvent) => {
  if (!engine) return
  isDrawing = true
  e.preventDefault()
  
  const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
  const pt: StrokePoint = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    pressure: e.pressure || 0.5, // Apple Pencil pressure
    tiltX: e.tiltX || 0,
    tiltY: e.tiltY || 0,
    timestamp: Date.now()
  }

  if (currentTool.value === 'eraser') {
    engine.erase([pt], 20)
  } else {
    activeStroke = {
      id: uuidv7(),
      points: [pt],
      tool: currentTool.value,
      color: currentColor.value,
      size: currentSize.value
    }
  }
}

const onPointerMove = (e: PointerEvent) => {
  if (!isDrawing || !engine) return
  e.preventDefault()

  // Coalesced events for high refresh rate displays (iPad Pro 120Hz)
  const events = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e]
  const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
  
  const newPoints: StrokePoint[] = events.map((ev: PointerEvent) => ({
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top,
    pressure: ev.pressure || 0.5,
    tiltX: ev.tiltX || 0,
    tiltY: ev.tiltY || 0,
    timestamp: Date.now()
  }))

  if (currentTool.value === 'eraser') {
    engine.erase(newPoints, 20)
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
  
  if (activeStroke && currentTool.value !== 'eraser') {
    engine.addStroke(activeStroke)
    notebook.value.strokes.push(activeStroke)
    activeStroke = null
    triggerAutoSave()
  }
}

const undo = () => {
  if (engine) {
    engine.undo()
    notebook.value.strokes.pop() // naive sync
    triggerAutoSave()
  }
}

const triggerAutoSave = () => {
  saveStatus.value = '保存中...'
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(save, 2000)
}

const save = async () => {
  saveStatus.value = '保存中...'
  const success = await NotebookStorage.saveNotebook(notebook.value)
  saveStatus.value = success ? '已保存' : '保存失败'
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
    uni.showToast({ title: '导出失败', icon: 'none' })
  }
}

const exportPDF = async () => {
  if (!canvasRef.value) return
  try {
    uni.showLoading({ title: '生成中...' })
    const { default: jsPDF } = await import('jspdf')
    const pdf = new jsPDF('p', 'pt', 'a4')
    // Get image data from canvas
    const imgData = canvasRef.value.toDataURL('image/png')
    
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvasRef.value.height * pdfWidth) / canvasRef.value.width
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`${notebook.value.title}.pdf`)
    uni.hideLoading()
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: '生成 PDF 失败', icon: 'none' })
  }
}

const goBack = () => {
  save()
  uni.navigateBack()
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
  padding: 24rpx 48rpx;
  background: var(--color-zen-white, #FFFFFF);
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.02);
  z-index: 10;
}
.left, .right {
  display: flex;
  align-items: center;
  gap: 24rpx;
  width: 320rpx;
}
.right { justify-content: flex-end; }
.back-btn {
  font-size: 32rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
  font-weight: 600;
  cursor: pointer;
}
.title-input {
  font-size: 32rpx;
  font-weight: 800;
  border: none;
  background: transparent;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
  width: 220rpx;
}
.save-status {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
}
.tool-btn {
  width: 64rpx; height: 64rpx;
  display: flex; align-items: center; justify-content: center;
  border-radius: 999rpx;
  font-size: 32rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.tool-btn.active {
  background: var(--color-zen-white, #FFFFFF);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.08);
}
.divider {
  width: 1px; height: 40rpx;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 0 10rpx;
}
.colors {
  display: flex;
  gap: 16rpx;
}
.c-dot {
  width: 40rpx; height: 40rpx;
  border-radius: 50%;
  border: 4rpx solid transparent;
  cursor: pointer;
  transition: transform 0.2s;
}
.c-dot.active {
  border-color: var(--color-zen-graphite, #1C1C1A);
  transform: scale(1.15);
}

.thickness-group {
  display: flex;
  gap: 8rpx;
  align-items: center;
}
.thickness-btn {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2rpx solid transparent;
  transition: all 0.2s;
}
.thickness-btn.active {
  border-color: var(--color-zen-graphite, #1C1C1A);
  background: var(--color-zen-white, #FFFFFF);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.08);
}
.thickness-dot {
  border-radius: 50%;
  background: var(--color-zen-graphite, #1C1C1A);
}

.menu-btn {
  font-size: 28rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 600;
  padding: 14rpx 28rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border-radius: 999rpx;
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
  overflow: auto;
  display: flex;
  justify-content: center;
  background: #EBEBE9;
  padding: 60rpx;
}

.hw-canvas {
  background: #FFFFFF;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.08);
  border-radius: 12rpx;
  cursor: crosshair;
  touch-action: none; 
}
.bg-grid {
  background-image: radial-gradient(#D8D8D5 2rpx, transparent 0);
  background-size: 40rpx 40rpx;
}
</style>
