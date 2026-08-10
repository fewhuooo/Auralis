<template>
  <div class="knowledge-graph-wrapper">
    <canvas ref="canvasEl" class="graph-canvas"></canvas>

    <!-- UI Overlay: Instructions & Search -->
    <div class="graph-overlay">
      <div class="overlay-header">
        <span class="overlay-title">知识关系图</span>
        <span class="overlay-desc">拖拽平移 · 滚轮缩放</span>
      </div>
      <div class="overlay-legend">
        <div class="legend-item"><span class="legend-dot core"></span>核心学科</div>
        <div class="legend-item"><span class="legend-dot source"></span>文档源</div>
        <div class="legend-item"><span class="legend-dot block"></span>知识节点</div>
      </div>
    </div>

    <!-- Node Detail Sidebar Panel (Slide Over) -->
    <Transition name="slide">
      <div v-if="selectedNode" class="node-detail-panel">
        <div class="panel-header">
          <span class="panel-tag" :style="{ backgroundColor: selectedNode.color || 'var(--border-subtle)' }">
            {{ selectedNode.block?.subject || '知识片' }}
          </span>
          <button class="close-btn" @click="selectedNode = null">✕</button>
        </div>
        <div class="panel-body">
          <h3 class="panel-title">{{ selectedNode.name }}</h3>
          <span class="panel-time" v-if="selectedNode.block?.time">⏰ 记录于: {{ selectedNode.block.time }}</span>
          
          <div class="panel-divider"></div>
          
          <div class="panel-content-markdown" v-html="renderMarkdown(selectedNode.block?.content || selectedNode.block?.preview || '')"></div>
        </div>
        <div class="panel-footer">
          <button class="panel-action-btn secondary" @click="copyContent(selectedNode.block?.content || selectedNode.block?.preview)">
            复制内容
          </button>
          <button class="panel-action-btn primary" @click="triggerOpenDetail(selectedNode.block)">
            查看详情
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElNotification } from 'element-plus'

const props = defineProps({
  subjectId: {
    type: String,
    required: true
  },
  blocks: {
    type: Array,
    required: true
  },
  subjectName: {
    type: String,
    default: '当前学科'
  },
  subjectColor: {
    type: String,
    default: 'rgba(99, 102, 241, 0.2)'
  }
})

const emit = defineEmits(['open-block-detail'])

const canvasEl = ref<HTMLCanvasElement | null>(null)
const selectedNode = ref<any | null>(null)

// Markdown renderer helper
const renderMarkdown = (content: string) => {
  if (!content) return ''
  return DOMPurify.sanitize(marked.parse(content) as string)
}

const copyContent = (text: string) => {
  if (!text) return
  navigator.clipboard.writeText(text)
  ElNotification({
    title: '📋 已复制',
    message: '知识块内容已成功复制。',
    type: 'success',
    position: 'top-right',
    duration: 2000
  })
}

const triggerOpenDetail = (block: any) => {
  emit('open-block-detail', block)
}

// 2D Physics and Canvas state
interface GraphNode {
  id: string
  name: string
  color: string
  radius: number
  x: number
  y: number
  vx: number
  vy: number
  isCore: boolean
  isSource: boolean
  block?: any
}

interface GraphLink {
  source: string
  target: string
  distance: number
}

let nodes: GraphNode[] = []
let links: GraphLink[] = []
let animationFrameId: number
let ctx: CanvasRenderingContext2D | null = null
let width = 0
let height = 0

// Viewport / Camera
let transform = { x: 0, y: 0, k: 1 }

// Force directed layout constants
const REPULSION_STRENGTH = 2000
const ATTRACTION_STRENGTH = 0.05
const CENTER_GRAVITY = 0.01
const DAMPING = 0.85

const initGraph = () => {
  nodes = []
  links = []

  // 1. Core node
  const coreNode: GraphNode = {
    id: 'core',
    name: props.subjectName,
    color: '#7D9372',
    radius: 12,
    x: 0, y: 0, vx: 0, vy: 0,
    isCore: true,
    isSource: false
  }
  nodes.push(coreNode)

  const blockList = props.blocks as any[]
  const sourcesMap = new Map<string, { id: string, name: string }>()
  
  blockList.forEach(block => {
    const sourceKey = block.sourceFileId || block.source || '未分类材料'
    const sourceName = block.source || '未分类材料'
    if (!sourcesMap.has(sourceKey)) {
      sourcesMap.set(sourceKey, {
        id: `source-${sourceKey}`,
        name: sourceName
      })
    }
  })

  // 2. Source nodes
  sourcesMap.forEach((source) => {
    const angle = Math.random() * Math.PI * 2
    const distance = 50 + Math.random() * 50
    nodes.push({
      id: source.id,
      name: source.name,
      color: '#9ca3af', // lighter grey for modern feel
      radius: 8,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      vx: 0, vy: 0,
      isCore: false,
      isSource: true
    })
    links.push({ source: source.id, target: 'core', distance: 100 })
  })

  // 3. Block nodes
  blockList.forEach(block => {
    const sourceKey = block.sourceFileId || block.source || '未分类材料'
    const parentId = `source-${sourceKey}`
    const parentNode = nodes.find(n => n.id === parentId)
    
    const px = parentNode ? parentNode.x : 0
    const py = parentNode ? parentNode.y : 0
    const angle = Math.random() * Math.PI * 2
    const distance = 20 + Math.random() * 20
    
    let color = '#A3B19B' // default block color
    if (block.difficulty === 'easy') color = '#10b981'
    else if (block.difficulty === 'medium') color = '#f59e0b'
    else if (block.difficulty === 'hard') color = '#ef4444'

    nodes.push({
      id: block.id,
      name: block.title,
      color: color,
      radius: 5,
      x: px + Math.cos(angle) * distance,
      y: py + Math.sin(angle) * distance,
      vx: 0, vy: 0,
      isCore: false,
      isSource: false,
      block: block
    })
    
    links.push({ source: block.id, target: parentNode ? parentId : 'core', distance: 40 })

    // related links
    if (block.relatedBlockIds && Array.isArray(block.relatedBlockIds)) {
      block.relatedBlockIds.forEach((relId: string) => {
        if (relId && relId.localeCompare(block.id) > 0) {
          links.push({ source: block.id, target: relId, distance: 80 })
        }
      })
    }
  })
}

const updatePhysics = () => {
  if (nodes.length <= 1) return

  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    const nodeA = nodes[i]
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeB = nodes[j]
      const dx = nodeA.x - nodeB.x
      const dy = nodeA.y - nodeB.y
      const distSq = dx * dx + dy * dy + 0.1
      const dist = Math.sqrt(distSq)

      if (dist < 150) {
        const force = REPULSION_STRENGTH / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        if (!nodeA.isCore) { nodeA.vx += fx; nodeA.vy += fy }
        if (!nodeB.isCore) { nodeB.vx -= fx; nodeB.vy -= fy }
      }
    }
  }

  // Attraction
  links.forEach(link => {
    const sourceNode = nodes.find(n => n.id === link.source)
    const targetNode = nodes.find(n => n.id === link.target)
    if (!sourceNode || !targetNode) return

    const dx = sourceNode.x - targetNode.x
    const dy = sourceNode.y - targetNode.y
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.1

    const force = (dist - link.distance) * ATTRACTION_STRENGTH
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force

    if (!sourceNode.isCore) { sourceNode.vx -= fx; sourceNode.vy -= fy }
    if (!targetNode.isCore) { targetNode.vx += fx; targetNode.vy += fy }
  })

  // Center Gravity & Damping
  nodes.forEach(node => {
    if (node.isCore) {
      node.x = 0
      node.y = 0
      return
    }

    node.vx -= node.x * CENTER_GRAVITY
    node.vy -= node.y * CENTER_GRAVITY

    node.vx *= DAMPING
    node.vy *= DAMPING

    node.x += node.vx
    node.y += node.vy
  })
}

const draw = () => {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)

  ctx.save()
  // Apply transform
  ctx.translate(transform.x + width / 2, transform.y + height / 2)
  ctx.scale(transform.k, transform.k)

  // Draw links
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)' // Very light grey for modern flat look
  ctx.beginPath()
  links.forEach(link => {
    const sourceNode = nodes.find(n => n.id === link.source)
    const targetNode = nodes.find(n => n.id === link.target)
    if (!sourceNode || !targetNode) return
    ctx?.moveTo(sourceNode.x, sourceNode.y)
    ctx?.lineTo(targetNode.x, targetNode.y)
  })
  ctx.stroke()

  // Draw nodes
  nodes.forEach(node => {
    ctx!.beginPath()
    ctx!.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
    ctx!.fillStyle = node.color
    ctx!.fill()
    
    // Selection highlight
    if (selectedNode.value && selectedNode.value.id === node.id) {
      ctx!.lineWidth = 2
      ctx!.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx!.stroke()
      ctx!.beginPath()
      ctx!.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(0,0,0,0.1)'
      ctx!.stroke()
    }
  })

  ctx.restore()
}

const animate = () => {
  updatePhysics()
  draw()
  animationFrameId = requestAnimationFrame(animate)
}

// Interaction
let isDragging = false
let dragStart = { x: 0, y: 0 }

const handleMouseDown = (e: MouseEvent) => {
  isDragging = true
  dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y }
}

const handleMouseMove = (e: MouseEvent) => {
  if (isDragging) {
    transform.x = e.clientX - dragStart.x
    transform.y = e.clientY - dragStart.y
  }
}

const handleMouseUp = () => {
  isDragging = false
}

const handleWheel = (e: WheelEvent) => {
  e.preventDefault()
  const zoomIntensity = 0.1
  const delta = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity
  const newK = Math.max(0.2, Math.min(transform.k * delta, 5))
  transform.k = newK
}

const handleClick = (e: MouseEvent) => {
  if (!canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  // Mouse pos relative to canvas center
  const mx = (e.clientX - rect.left - transform.x - width / 2) / transform.k
  const my = (e.clientY - rect.top - transform.y - height / 2) / transform.k

  // Find clicked node
  let clicked: GraphNode | null = null
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    const dx = node.x - mx
    const dy = node.y - my
    if (dx * dx + dy * dy <= (node.radius + 5) ** 2) {
      clicked = node
      break
    }
  }

  if (clicked && !clicked.isCore && !clicked.isSource) {
    selectedNode.value = clicked
  } else if (!clicked) {
    selectedNode.value = null
  }
}

const resizeCanvas = () => {
  if (!canvasEl.value) return
  const parent = canvasEl.value.parentElement
  if (!parent) return
  width = parent.clientWidth
  height = parent.clientHeight
  canvasEl.value.width = width
  canvasEl.value.height = height
}

onMounted(() => {
  if (!canvasEl.value) return
  ctx = canvasEl.value.getContext('2d')
  
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  
  canvasEl.value.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
  canvasEl.value.addEventListener('wheel', handleWheel, { passive: false })
  canvasEl.value.addEventListener('click', handleClick)

  initGraph()
  animate()
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId)
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
})

watch(() => props.blocks, () => {
  initGraph()
}, { deep: true })

watch(() => props.subjectId, () => {
  initGraph()
  transform = { x: 0, y: 0, k: 1 }
})
</script>

<style scoped>
.knowledge-graph-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
  background: #ffffff; /* Explicit white background as requested */
  border-radius: var(--radius-xl, 20px);
  overflow: hidden;
  border: 1px solid var(--border-subtle, #e5e7eb);
}

.graph-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
}

.graph-canvas:active {
  cursor: grabbing;
}

/* UI Overlay styling */
.graph-overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 5;
}

.overlay-header {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  padding: 10px 14px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.overlay-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.overlay-desc {
  font-size: 10px;
  color: #6b7280;
}

.overlay-legend {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  padding: 8px 12px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #4b5563;
  font-weight: 500;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dot.core {
  background: #7D9372;
}

.legend-dot.source {
  background: #9ca3af;
}

.legend-dot.block {
  background: #A3B19B;
}

/* Sidebar slide over styling */
.node-detail-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: 280px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
  z-index: 10;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.panel-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.close-btn {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #111827;
}

.panel-body {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}

.panel-title {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.4;
}

.panel-time {
  font-size: 11px;
  color: #6b7280;
  display: block;
}

.panel-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 12px 0;
}

.panel-content-markdown {
  font-size: 12px;
  line-height: 1.6;
  color: #374151;
}

.panel-content-markdown :deep(p) {
  margin-bottom: 8px;
}
.panel-content-markdown :deep(h1), .panel-content-markdown :deep(h2), .panel-content-markdown :deep(h3) {
  margin-top: 12px;
  margin-bottom: 8px;
  color: #111827;
}
.panel-content-markdown :deep(ul), .panel-content-markdown :deep(ol) {
  padding-left: 20px;
  margin-bottom: 8px;
}
.panel-content-markdown :deep(code) {
  background: transparent;
  padding: 0;
  border: none;
  font-weight: 700;
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  gap: 8px;
}

.panel-action-btn {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.panel-action-btn.secondary {
  background: rgba(0, 0, 0, 0.04);
  color: #4b5563;
}

.panel-action-btn.secondary:hover {
  background: rgba(0, 0, 0, 0.08);
}

.panel-action-btn.primary {
  background: var(--btn-primary-bg, linear-gradient(135deg, #A3B19B 0%, #7D9372 100%));
  color: #fff;
}

.panel-action-btn.primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Animations */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
