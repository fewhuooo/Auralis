import test from 'node:test'
import assert from 'node:assert/strict'
import { applyKnowledgeGraphForces, setManualGraphPosition } from '../src/components/subject/knowledgeGraphPhysics.ts'

const node = (key, x, y, type = 'file') => ({ key, type, radius: 8, x, y, vx: 0, vy: 0 })

test('repulsion moves an unlinked pair apart symmetrically', () => {
  const nodes = [node('a', -10, 0), node('b', 10, 0)]
  applyKnowledgeGraphForces(nodes, [], 1)
  assert.ok(nodes[0].x < -10)
  assert.ok(nodes[1].x > 10)
  assert.ok(Math.abs(nodes[0].x + nodes[1].x) < 0.001)
})

test('spring attraction pulls a linked pair toward its target distance', () => {
  const nodes = [node('subject:s', 0, 0, 'subject'), node('file:f', 220, 0)]
  applyKnowledgeGraphForces(nodes, [{ sourceKey: 'subject:s', targetKey: 'file:f' }], 1)
  assert.ok(nodes[0].x > 0)
  assert.ok(nodes[1].x < 220)
})

test('gravity damps a detached node toward the graph center without non-finite coordinates', () => {
  const nodes = [node('a', 400, -300)]
  applyKnowledgeGraphForces(nodes, [], 1)
  assert.ok(nodes[0].x < 400)
  assert.ok(nodes[0].y > -300)
  assert.ok(Number.isFinite(nodes[0].x) && Number.isFinite(nodes[0].y))
})

test('low-alpha release relaxation keeps a dragged node near its placed position while adjusting its neighbor', () => {
  const nodes = [node('subject:s', 0, 0, 'subject'), node('file:f', 112, 0), node('block:b', 240, 0, 'block')]
  const links = [
    { sourceKey: 'subject:s', targetKey: 'file:f' },
    { sourceKey: 'file:f', targetKey: 'block:b' },
  ]
  const releasedAt = nodes[2].x
  const neighborAt = nodes[1].x
  let alpha = 0.18
  for (let frame = 0; frame < 30; frame += 1) {
    applyKnowledgeGraphForces(nodes, links, alpha)
    alpha *= 0.9
  }
  assert.ok(Math.abs(nodes[2].x - releasedAt) <= 12)
  assert.ok(Math.abs(nodes[2].x - releasedAt) > 0.1)
  assert.ok(Math.abs(nodes[1].x - neighborAt) > 0.1)
})

test('manual pointer placement is exact and clears pre-drag velocity', () => {
  const dragged = { ...node('block:b', 12, 15), vx: 5, vy: -4 }
  setManualGraphPosition(dragged, 120, 230)
  assert.deepEqual([dragged.x, dragged.y, dragged.vx, dragged.vy], [120, 230, 0, 0])
})

test('pinned pointer node stays exact while linked neighbor responds during drag', () => {
  const nodes = [node('subject:s', 0, 0, 'subject'), node('file:f', 170, 0)]
  const draggedAt = nodes[1].x
  const neighborAt = nodes[0].x
  const links = [{ sourceKey: 'subject:s', targetKey: 'file:f' }]
  for (let frame = 0; frame < 24; frame += 1) {
    applyKnowledgeGraphForces(nodes, links, 0.22, 'file:f')
  }
  assert.equal(nodes[1].x, draggedAt)
  assert.ok(Math.abs(nodes[0].x - neighborAt) > 1)
  let settleAlpha = 0.18
  for (let frame = 0; frame < 30; frame += 1) {
    applyKnowledgeGraphForces(nodes, links, settleAlpha)
    settleAlpha *= 0.9
  }
  assert.ok(Math.abs(nodes[1].x - draggedAt) > 0.1)
  assert.ok(Math.abs(nodes[1].x - draggedAt) <= 12)
})
