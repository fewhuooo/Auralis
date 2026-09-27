export interface PhysicsNode {
  key: string
  type: 'subject' | 'file' | 'block'
  radius: number
  x: number
  y: number
  vx: number
  vy: number
}

export interface PhysicsLink {
  sourceKey: string
  targetKey: string
}

export function setManualGraphPosition(node: PhysicsNode, x: number, y: number) {
  node.x = x
  node.y = y
  node.vx = 0
  node.vy = 0
}

const SPRING_LENGTH: Record<string, number> = {
  'subject:file': 112,
  'file:subject': 112,
  'subject:block': 126,
  'block:subject': 126,
  'file:block': 78,
  'block:file': 78,
}

/** Apply one deterministic, symmetric force step and return mean squared speed. */
export function applyKnowledgeGraphForces(nodes: PhysicsNode[], links: PhysicsLink[], alpha: number, pinnedKey?: string) {
  const forces = nodes.map(() => ({ x: 0, y: 0 }))
  const indexByKey = new Map(nodes.map((node, index) => [node.key, index]))

  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left]
      const b = nodes[right]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let distanceSquared = dx * dx + dy * dy
      if (distanceSquared < 0.01) {
        const hash = stableHash(`${a.key}|${b.key}`)
        const angle = hash / 0xffffffff * Math.PI * 2
        dx = Math.cos(angle) * 0.1
        dy = Math.sin(angle) * 0.1
        distanceSquared = dx * dx + dy * dy
      }
      const distance = Math.sqrt(distanceSquared)
      const minimumDistance = a.radius + b.radius + 20
      const magnitude = Math.min(2.2, 520 / distanceSquared + Math.max(0, minimumDistance - distance) * 0.026)
      const fx = dx / distance * magnitude
      const fy = dy / distance * magnitude
      forces[left].x -= fx
      forces[left].y -= fy
      forces[right].x += fx
      forces[right].y += fy
    }
  }

  for (const link of links) {
    const sourceIndex = indexByKey.get(link.sourceKey)
    const targetIndex = indexByKey.get(link.targetKey)
    if (sourceIndex === undefined || targetIndex === undefined) continue
    const source = nodes[sourceIndex]
    const target = nodes[targetIndex]
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.max(0.01, Math.hypot(dx, dy))
    const preferredLength = SPRING_LENGTH[`${source.type}:${target.type}`] ?? 105
    const magnitude = Math.max(-1.8, Math.min(1.8, (distance - preferredLength) * 0.007))
    const fx = dx / distance * magnitude
    const fy = dy / distance * magnitude
    forces[sourceIndex].x += fx
    forces[sourceIndex].y += fy
    forces[targetIndex].x -= fx
    forces[targetIndex].y -= fy
  }

  let totalSpeedSquared = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node.key === pinnedKey) {
      node.vx = 0
      node.vy = 0
      continue
    }
    const force = forces[index]
    const vx = (node.vx + (force.x - node.x * 0.0015) * alpha) * 0.82
    const vy = (node.vy + (force.y - node.y * 0.0015) * alpha) * 0.82
    const speed = Math.hypot(vx, vy)
    const scale = speed > 8 ? 8 / speed : 1
    node.vx = vx * scale
    node.vy = vy * scale
    node.x += node.vx
    node.y += node.vy
    totalSpeedSquared += node.vx * node.vx + node.vy * node.vy
  }
  return totalSpeedSquared / Math.max(nodes.length, 1)
}

function stableHash(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
