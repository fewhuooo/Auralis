<template>
  <div ref="wrapperEl" class="knowledge-graph-wrapper">
    <canvas
      ref="canvasEl"
      class="graph-canvas"
      :aria-label="canvasLabel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @lostpointercapture="onPointerCancel"
      @wheel="onWheel"
    ></canvas>

    <!-- Sleek Minimalist HUD Overlay (No Clunky Middle Border) -->
    <div class="graph-hud">
      <div class="hud-legend">
        <span class="legend-item"><i class="dot subject"></i>学科</span>
        <span class="legend-item"><i class="dot source"></i>文件</span>
        <span class="legend-item"><i class="dot block"></i>知识块</span>
      </div>
      <div class="hud-hint">
        <span>平移拖拽 · 滚轮缩放 · 点击节点</span>
      </div>
    </div>

    <!-- Sleek Pill Fit View Button -->
    <button class="fit-button" type="button" @click="fitView" title="适配星图视野">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
      <span>适配视野</span>
    </button>
    <p v-if="nodes.length === 0" class="empty-state">暂无可展示的星图资产</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { applyKnowledgeGraphForces, setManualGraphPosition, type PhysicsLink, type PhysicsNode } from './knowledgeGraphPhysics'

interface SubjectInput { id: string; name: string }
interface SourceInput { id: string; name: string; subjectId: string }
interface BlockInput { id: string; title: string; subjectId: string; subject?: string; sourceFileId?: string | null; source?: string; content?: string; time?: string }
type AssetType = 'file' | 'block'
interface GraphNode extends PhysicsNode {
  id: string
  subjectId: string
  name: string
  block?: BlockInput
}
interface GraphLink extends PhysicsLink { a: GraphNode; b: GraphNode }

const props = withDefaults(defineProps<{
  subjectId: string
  subjectName?: string
  subjectColor?: string
  subjects?: SubjectInput[]
  sources?: SourceInput[]
  blocks: BlockInput[]
  selectedAsset?: { type: AssetType; id: string } | null
}>(), { subjectName: '当前学科', subjects: () => [], sources: () => [], selectedAsset: null })

const emit = defineEmits<{
  'select-node': [payload: { type: AssetType; id: string; subjectId: string }]
}>()

const wrapperEl = ref<HTMLDivElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const nodes = shallowRef<GraphNode[]>([])
const graphTitle = computed(() => props.subjectId === 'all' ? '全局关联图' : props.subjectName)
const canvasLabel = computed(() => `${graphTitle.value}：点击文件或知识块打开预览`)

let links: GraphLink[] = []
let context: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrameId = 0
let isComponentMounted = false
let isLoopRunning = false
let lastScopeId: string | null = null
let manualInteraction = false
let width = 0
let height = 0
let hovered: GraphNode | null = null
let dragged: GraphNode | null = null
let down: { pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null = null
let camera = { x: 0, y: 0, k: 1 }

// Ambient background stardust particles
const ambientStars = Array.from({ length: 28 }, (_, i) => {
  const hashX = stableHash(`star_x_${i}`)
  const hashY = stableHash(`star_y_${i}`)
  return {
    x: ((hashX % 1200) - 600),
    y: ((hashY % 1200) - 600),
    size: 1 + (hashX % 2) * 0.7,
    speed: 0.0008 + (hashY % 5) * 0.0003,
    phase: (hashX % 100) * 0.1
  }
})

// Simulation State
interface SimState {
  active: boolean
  frame: number
  maxFrames: number
  alpha: number
  alphaDecay: number
  minimumFrames: number
  energyThreshold: number
  mode: 'layout' | 'settle' | 'drag'
  fitAfter: boolean
}

const simState: SimState = {
  active: false,
  frame: 0,
  maxFrames: 180,
  alpha: 1,
  alphaDecay: 0.94,
  minimumFrames: 24,
  energyThreshold: 0.006,
  mode: 'layout',
  fitAfter: false
}

const keyFor = (type: GraphNode['type'], id: string) => `${type}:${id}`
const isSelected = (node: GraphNode) => node.type !== 'subject' && props.selectedAsset?.type === node.type && props.selectedAsset.id === node.id

function stableHash(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function initialPosition(node: GraphNode, subjectCount: number, subjectPositions: Map<string, { x: number; y: number }>, parent?: GraphNode) {
  const hash = stableHash(node.key)
  const angle = hash / 0xffffffff * Math.PI * 2
  const distance = 38 + (hash % 43)
  if (node.type === 'subject') {
    if (subjectCount <= 1) return { x: 0, y: 0 }
    const index = [...subjectPositions.keys()].length
    const subjectAngle = index / subjectCount * Math.PI * 2 - Math.PI / 2
    const radius = Math.max(115, Math.min(225, subjectCount * 22))
    return { x: Math.cos(subjectAngle) * radius, y: Math.sin(subjectAngle) * radius }
  }
  const origin = parent ? { x: parent.x, y: parent.y } : subjectPositions.get(node.subjectId) || { x: 0, y: 0 }
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance }
}

function buildGraph() {
  const scopeChanged = lastScopeId !== props.subjectId
  const previousNodes = scopeChanged ? new Map<string, GraphNode>() : new Map(nodes.value.map(node => [node.key, node]))
  const subjects = props.subjectId === 'all'
    ? props.subjects
    : props.subjectId
      ? [{ id: props.subjectId, name: props.subjectName }]
      : [...new Map(props.blocks.filter(block => block.subjectId).map(block => [block.subjectId, { id: block.subjectId, name: block.subject || '未命名学科' }])).values()]
  const sourceItems = props.sources
  const blockItems = props.blocks
  const byKey = new Map<string, GraphNode>()
  const subjectPositions = new Map<string, { x: number; y: number }>()

  const addNode = (type: GraphNode['type'], id: string, subjectId: string, name: string, parent?: GraphNode) => {
    const key = keyFor(type, id)
    const existing = byKey.get(key)
    if (existing) return existing
    const radius = type === 'subject' ? 13 : type === 'file' ? 8.5 : 6
    const prior = previousNodes.get(key)
    const node: GraphNode = prior ?? {
      key, id, subjectId, type, name, radius,
      ...initialPosition({ key, id, subjectId, type, name, radius, x: 0, y: 0, vx: 0, vy: 0 }, subjects.length, subjectPositions, parent),
      vx: 0,
      vy: 0,
    }
    node.subjectId = subjectId
    node.name = name
    node.radius = radius
    byKey.set(key, node)
    return node
  }

  for (const subject of [...subjects].sort((a, b) => a.id.localeCompare(b.id))) {
    const node = addNode('subject', subject.id, subject.id, subject.name)
    subjectPositions.set(subject.id, { x: node.x, y: node.y })
  }
  for (const source of [...sourceItems].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!byKey.has(keyFor('subject', source.subjectId))) continue
    addNode('file', source.id, source.subjectId, source.name, byKey.get(keyFor('subject', source.subjectId)))
  }
  for (const block of [...blockItems].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!byKey.has(keyFor('subject', block.subjectId))) continue
    const source = block.sourceFileId ? byKey.get(keyFor('file', block.sourceFileId)) : undefined
    const node = addNode('block', block.id, block.subjectId, block.title, source?.subjectId === block.subjectId ? source : byKey.get(keyFor('subject', block.subjectId)))
    node.block = block
  }

  nodes.value = [...byKey.values()]
  links = []
  const linkKeys = new Set<string>()
  const addLink = (sourceKey: string, targetKey: string) => {
    const a = byKey.get(sourceKey)
    const b = byKey.get(targetKey)
    if (!a || !b || a.subjectId !== b.subjectId) return
    const id = `${sourceKey}>${targetKey}`
    if (linkKeys.has(id)) return
    linkKeys.add(id)
    links.push({ sourceKey, targetKey, a, b })
  }
  for (const source of sourceItems) addLink(keyFor('subject', source.subjectId), keyFor('file', source.id))
  for (const block of blockItems) {
    const subjectKey = keyFor('subject', block.subjectId)
    const sourceKey = block.sourceFileId ? keyFor('file', block.sourceFileId) : ''
    const source = sourceKey ? byKey.get(sourceKey) : undefined
    if (source?.subjectId === block.subjectId) addLink(sourceKey, keyFor('block', block.id))
    else addLink(subjectKey, keyFor('block', block.id))
  }

  hovered = null
  dragged = null
  if (scopeChanged) {
    camera = { x: 0, y: 0, k: 1 }
    manualInteraction = false
  }
  lastScopeId = props.subjectId
  if (scopeChanged) triggerSimulation(true, 'layout')
  else if (manualInteraction) draw(performance.now())
  else triggerSimulation(false, 'layout')
}

function triggerSimulation(fitAfter = false, mode: 'layout' | 'settle' | 'drag' = 'layout') {
  if (!nodes.value.length) return
  simState.active = true
  simState.frame = 0
  simState.mode = mode
  simState.fitAfter = fitAfter
  simState.alpha = mode === 'layout' ? 1 : mode === 'settle' ? 0.18 : 0.22
  simState.maxFrames = mode === 'layout' ? 180 : mode === 'settle' ? 30 : 36
  simState.alphaDecay = mode === 'layout' ? 0.94 : mode === 'settle' ? 0.9 : 1
  simState.minimumFrames = mode === 'layout' ? 24 : mode === 'settle' ? 10 : 12
  simState.energyThreshold = mode === 'layout' ? 0.006 : mode === 'settle' ? 0.001 : 0.003
}

function drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode, isHover: boolean) {
  ctx.save()
  ctx.font = node.type === 'subject'
    ? '600 12px var(--font-family-base, sans-serif)'
    : '500 11px var(--font-family-base, sans-serif)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name
  const textMetrics = ctx.measureText(label)
  const labelWidth = textMetrics.width
  const labelY = node.y + node.radius + (node.type === 'subject' ? 18 : 14)
  const pillPaddingX = 8
  const pillHeight = 20
  const pillX = node.x - labelWidth / 2 - pillPaddingX
  const pillY = labelY - pillHeight / 2

  // Rounded pill capsule with gentle soft shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.06)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fillStyle = isHover ? '#FAF7F2' : 'rgba(250, 247, 242, 0.92)'
  ctx.beginPath()
  ctx.roundRect(pillX, pillY, labelWidth + pillPaddingX * 2, pillHeight, 9999)
  ctx.fill()

  // Pill border
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 1
  ctx.strokeStyle = isHover ? '#8B9A6E' : 'rgba(139, 154, 110, 0.28)'
  ctx.stroke()

  // Label text
  ctx.fillStyle = isHover ? '#1C1C1A' : '#344139'
  ctx.fillText(label, node.x, labelY)
  ctx.restore()
}

function draw(timestamp: number) {
  if (!context) return
  const ctx = context
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y)
  ctx.scale(camera.k, camera.k)

  // 1. Subtle Background Stardust Points
  for (const star of ambientStars) {
    const twinkle = 0.12 + 0.18 * Math.sin(timestamp * star.speed + star.phase)
    ctx.fillStyle = `rgba(139, 154, 110, ${twinkle})`
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
    ctx.fill()
  }

  // 2. Determine Focus & Neighbor Network for Hover
  const isHovering = Boolean(hovered)
  const connectedNeighbors = new Set<string>()
  if (hovered) {
    connectedNeighbors.add(hovered.key)
    for (const link of links) {
      if (link.a === hovered) connectedNeighbors.add(link.b.key)
      if (link.b === hovered) connectedNeighbors.add(link.a.key)
    }
  }

  // 3. Constellation Links & Living Energy Photons
  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    const isLinkActive = hovered === link.a || hovered === link.b || isSelected(link.a) || isSelected(link.b)

    // Attenuate unrelated links when focusing on a specific node
    const linkAlpha = isHovering
      ? (isLinkActive ? 0.85 : 0.08)
      : (isLinkActive ? 0.75 : 0.25)

    ctx.beginPath()
    ctx.moveTo(link.a.x, link.a.y)
    ctx.lineTo(link.b.x, link.b.y)
    ctx.lineWidth = isLinkActive ? 1.8 : 1
    ctx.strokeStyle = isLinkActive
      ? `rgba(139, 154, 110, ${linkAlpha})`
      : `rgba(163, 177, 155, ${linkAlpha})`
    ctx.stroke()

    // Flowing Constellation Energy Photon (travelling along link)
    const photonProgress = ((timestamp * 0.00035 + i * 0.19) % 1)
    const px = link.a.x + (link.b.x - link.a.x) * photonProgress
    const py = link.a.y + (link.b.y - link.a.y) * photonProgress

    ctx.beginPath()
    ctx.arc(px, py, isLinkActive ? 2.2 : 1.4, 0, Math.PI * 2)
    ctx.fillStyle = isLinkActive
      ? 'rgba(139, 154, 110, 0.95)'
      : `rgba(163, 177, 155, ${isHovering ? 0.2 : 0.55})`
    ctx.fill()
  }

  // 4. Star Nodes with Breathing Aura & Dynamic Interaction
  for (const node of nodes.value) {
    const active = hovered === node || isSelected(node)
    const isConnected = !isHovering || connectedNeighbors.has(node.key)
    const nodeHash = stableHash(node.key)

    // Subtle organic breathing animation
    const breath = Math.sin(timestamp * 0.0022 + nodeHash * 0.1) * 0.65
    const currentRadius = node.radius + (active ? 2.5 : breath)
    const color = node.type === 'subject' ? '#718C67' : node.type === 'file' ? '#6E8898' : '#9BAA88'

    ctx.save()
    // Soft dimming for unfocused nodes during hover
    ctx.globalAlpha = isConnected ? 1.0 : 0.28

    // Subject Celestial Aura / Halo
    if (node.type === 'subject') {
      const auraRadius = currentRadius + 8 + 3 * Math.sin(timestamp * 0.002)
      const auraGrad = ctx.createRadialGradient(node.x, node.y, currentRadius * 0.6, node.x, node.y, auraRadius)
      auraGrad.addColorStop(0, 'rgba(113, 140, 103, 0.35)')
      auraGrad.addColorStop(1, 'rgba(113, 140, 103, 0)')
      ctx.fillStyle = auraGrad
      ctx.beginPath()
      ctx.arc(node.x, node.y, auraRadius, 0, Math.PI * 2)
      ctx.fill()
    }

    // Active Node Radiating Ring
    if (active) {
      const ringRadius = currentRadius + 5 + 2 * Math.sin(timestamp * 0.005)
      ctx.beginPath()
      ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2)
      ctx.lineWidth = 1.6
      ctx.strokeStyle = color
      ctx.stroke()
    }

    // Core Star Body
    ctx.beginPath()
    ctx.arc(node.x, node.y, currentRadius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // Draw Capsule Label for Subjects or Active Nodes
    if (node.type === 'subject' || active) {
      drawLabel(ctx, node, active)
    }

    ctx.restore()
  }

  ctx.restore()
}

// Continuous 60fps Ambient Render Loop
function startRenderLoop() {
  if (isLoopRunning) return
  isLoopRunning = true

  const frame = (timestamp: number) => {
    if (!isLoopRunning || !isComponentMounted) return

    // Advance physics if active
    if (simState.active && nodes.value.length) {
      const energy = applyKnowledgeGraphForces(
        nodes.value,
        links,
        simState.alpha,
        simState.mode === 'drag' ? dragged?.key : undefined
      )
      simState.alpha *= simState.alphaDecay
      simState.frame += 1

      if (
        simState.frame >= simState.maxFrames ||
        (simState.frame >= simState.minimumFrames && energy <= simState.energyThreshold)
      ) {
        simState.active = false
        for (const node of nodes.value) {
          node.vx = 0
          node.vy = 0
        }
        if (simState.fitAfter) {
          fitView()
        }
      }
    }

    draw(timestamp)
    animationFrameId = requestAnimationFrame(frame)
  }

  animationFrameId = requestAnimationFrame(frame)
}

function stopRenderLoop() {
  isLoopRunning = false
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
  }
}

function screenToWorld(clientX: number, clientY: number) {
  const rect = canvasEl.value!.getBoundingClientRect()
  return {
    x: (clientX - rect.left - width / 2 - camera.x) / camera.k,
    y: (clientY - rect.top - height / 2 - camera.y) / camera.k,
  }
}

function hitTest(clientX: number, clientY: number) {
  const point = screenToWorld(clientX, clientY)
  for (let index = nodes.value.length - 1; index >= 0; index -= 1) {
    const node = nodes.value[index]
    if (Math.hypot(node.x - point.x, node.y - point.y) <= node.radius + 7 / camera.k) return node
  }
  return null
}

function beginManualGesture() {
  manualInteraction = true
  simState.active = false
  for (const node of nodes.value) { node.vx = 0; node.vy = 0 }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || down) return
  down = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false }
  dragged = hitTest(event.clientX, event.clientY)
  canvasEl.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (down) {
    if (event.pointerId !== down.pointerId) return
    const dx = event.clientX - down.x
    const dy = event.clientY - down.y
    if (Math.hypot(dx, dy) > 3 && !down.moved) {
      down.moved = true
      beginManualGesture()
    }
    if (down.moved) {
      if (dragged) {
        const point = screenToWorld(event.clientX, event.clientY)
        setManualGraphPosition(dragged, point.x, point.y)
      } else {
        camera.x += dx
        camera.y += dy
      }
      if (dragged && !simState.active) triggerSimulation(false, 'drag')
      down.x = event.clientX
      down.y = event.clientY
    }
  } else {
    const next = hitTest(event.clientX, event.clientY)
    if (next !== hovered) { hovered = next }
  }
  if (canvasEl.value) canvasEl.value.style.cursor = down?.moved ? 'grabbing' : hovered && hovered.type !== 'subject' ? 'pointer' : 'grab'
}

function onPointerUp(event: PointerEvent) {
  if (down && event.pointerId !== down.pointerId) return
  if (down) {
    const dx = event.clientX - down.x
    const dy = event.clientY - down.y
    if (!down.moved && Math.hypot(event.clientX - down.startX, event.clientY - down.startY) > 3) {
      down.moved = true
      beginManualGesture()
    }
    if (down.moved && Math.hypot(dx, dy) > 0) {
      if (dragged) {
        const point = screenToWorld(event.clientX, event.clientY)
        setManualGraphPosition(dragged, point.x, point.y)
      } else {
        camera.x += dx
        camera.y += dy
      }
    }
  }
  const didManualDrag = Boolean(down?.moved)
  if (down && !down.moved) {
    const node = hitTest(event.clientX, event.clientY)
    if (node && node.type !== 'subject') {
      emit('select-node', { type: node.type, id: node.id, subjectId: node.subjectId })
    }
  }
  down = null
  dragged = null
  if (canvasEl.value) canvasEl.value.style.cursor = hovered && hovered.type !== 'subject' ? 'pointer' : 'grab'
  if (didManualDrag) triggerSimulation(false, 'settle')
}

function onPointerCancel(event: PointerEvent) {
  if (down && event.pointerId !== down.pointerId) return
  const didManualDrag = Boolean(down?.moved)
  down = null
  dragged = null
  if (canvasEl.value) canvasEl.value.style.cursor = 'grab'
  if (didManualDrag) triggerSimulation(false, 'settle')
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const rect = canvasEl.value!.getBoundingClientRect()
  const px = event.clientX - rect.left - width / 2
  const py = event.clientY - rect.top - height / 2
  const next = Math.max(0.25, Math.min(3.5, camera.k * Math.exp(-event.deltaY * 0.001)))
  const ratio = next / camera.k
  camera.x = px - (px - camera.x) * ratio
  camera.y = py - (py - camera.y) * ratio
  camera.k = next
}

function fitView() {
  if (!nodes.value.length || !width || !height) return
  const bounds = nodes.value.map(node => ({
    minX: node.x - node.radius - (node.type === 'subject' ? 70 : 8),
    maxX: node.x + node.radius + (node.type === 'subject' ? 70 : 8),
    minY: node.y - node.radius - 8,
    maxY: node.y + node.radius + 26,
  }))
  const minX = Math.min(...bounds.map(bound => bound.minX))
  const maxX = Math.max(...bounds.map(bound => bound.maxX))
  const minY = Math.min(...bounds.map(bound => bound.minY))
  const maxY = Math.max(...bounds.map(bound => bound.maxY))
  camera.k = Math.max(0.25, Math.min(1.5, Math.min((width - 40) / Math.max(80, maxX - minX), (height - 100) / Math.max(80, maxY - minY))))
  camera.x = -(minX + maxX) / 2 * camera.k
  camera.y = -(minY + maxY) / 2 * camera.k
}

function resizeCanvas() {
  if (!canvasEl.value || !wrapperEl.value || !context) return
  width = wrapperEl.value.clientWidth
  height = wrapperEl.value.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  canvasEl.value.width = Math.round(width * dpr)
  canvasEl.value.height = Math.round(height * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopRenderLoop()
  } else if (isComponentMounted) {
    startRenderLoop()
  }
}

onMounted(() => {
  isComponentMounted = true
  context = canvasEl.value?.getContext('2d') ?? null
  resizeObserver = new ResizeObserver(resizeCanvas)
  if (wrapperEl.value) resizeObserver.observe(wrapperEl.value)
  resizeCanvas()
  buildGraph()
  startRenderLoop()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  isComponentMounted = false
  stopRenderLoop()
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

watch(() => [props.subjectId, props.subjectName, props.subjects, props.sources, props.blocks], buildGraph, { deep: true })
</script>

<style scoped>
/* Seamless Star Map Container (No middle redundant borders) */
.knowledge-graph-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
  overflow: hidden;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
}
.graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

/* Minimalist Frosted Glass HUD Overlay */
.graph-hud {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
}
.hud-legend {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 5px 14px;
  background: rgba(250, 247, 242, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(139, 154, 110, 0.22);
  border-radius: 9999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #344139);
}
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.dot.subject { background: #718C67; box-shadow: 0 0 6px rgba(113, 140, 103, 0.5); }
.dot.source { background: #6E8898; box-shadow: 0 0 6px rgba(110, 136, 152, 0.5); }
.dot.block { background: #9BAA88; box-shadow: 0 0 6px rgba(155, 170, 136, 0.5); }

.hud-hint {
  font-size: 10.5px;
  color: var(--text-muted, #7A7A75);
  padding-left: 6px;
  letter-spacing: 0.2px;
  opacity: 0.75;
}

/* Floating Sleek Pill Fit View Button */
.fit-button {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(139, 154, 110, 0.25);
  border-radius: 9999px;
  padding: 6px 14px;
  background: rgba(250, 247, 242, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #3B5740;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all var(--transition-fast, 0.15s ease);
}
.fit-button:hover {
  background: #FAF7F2;
  border-color: #8B9A6E;
  color: #8B9A6E;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.18);
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--text-muted, #738077);
  font-size: 13px;
  pointer-events: none;
}

/* Dark Mode Overrides for Knowledge Graph */
html.dark .hud-legend {
  background: rgba(30, 32, 28, 0.85);
  border-color: rgba(154, 176, 143, 0.25);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}
html.dark .legend-item {
  color: #d9d0c7;
}
html.dark .hud-hint {
  color: #8a867e;
}
html.dark .fit-button {
  background: rgba(30, 32, 28, 0.88);
  border-color: rgba(154, 176, 143, 0.25);
  color: #9AB08F;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}
html.dark .fit-button:hover {
  background: #242622;
  border-color: #9AB08F;
  color: #b0c2a7;
  box-shadow: 0 4px 14px rgba(154, 176, 143, 0.2);
}
</style>
