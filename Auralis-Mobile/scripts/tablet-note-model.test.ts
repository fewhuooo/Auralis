import {
  createNoteDocument,
  createSubjectAssetAnnotationId,
  upsertStroke,
  type NoteStroke,
} from '../src/services/tabletNoteModel'

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function expect(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label)
  }
}

const now = '2026-07-08T00:00:00.000Z'

const annotation = createNoteDocument({
  id: createSubjectAssetAnnotationId('math', 'asset-1'),
  mode: 'subject-asset-annotation',
  subjectId: 'math',
  assetId: 'asset-1',
  title: 'Lecture.pdf',
  now,
})

expectEqual(annotation.id, 'subject-asset-annotation:math:asset-1', 'asset annotation id')
expectEqual(annotation.layout, 'paged', 'asset annotation layout')
expectEqual(annotation.background, 'asset', 'asset annotation background')
expectEqual(annotation.pages.length, 1, 'asset annotation page count')
expectEqual(annotation.pages[0].backgroundAssetId, 'asset-1', 'asset page background asset')

const quickCanvas = createNoteDocument({
  id: 'quick-1',
  mode: 'quick-infinite-canvas',
  title: '随手记',
  now,
})

expectEqual(quickCanvas.layout, 'infinite', 'quick canvas layout')
expectEqual(quickCanvas.background, 'grid', 'quick canvas background')
expectEqual(quickCanvas.pages.length, 0, 'quick canvas should not create fixed pages')
expectEqual(quickCanvas.viewport.scale, 1, 'default viewport scale')

const stroke: NoteStroke = {
  id: 'stroke-1',
  points: [
    { x: 10, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, timestamp: 1 },
  ],
  tool: 'pen',
  color: '#000000',
  size: 4,
  createdAt: now,
}

const withStroke = upsertStroke(annotation, stroke, now)
expect(withStroke !== annotation, 'upsertStroke must return a new document')
expectEqual(annotation.strokes.length, 0, 'upsertStroke must not mutate original document')
expectEqual(withStroke.strokes.length, 1, 'upsertStroke inserts new stroke')
expectEqual(withStroke.updatedAt, now, 'upsertStroke updates timestamp')

const changedStroke = { ...stroke, color: '#ff0000' }
const withUpdatedStroke = upsertStroke(withStroke, changedStroke, now)
expectEqual(withUpdatedStroke.strokes.length, 1, 'upsertStroke replaces existing stroke')
expectEqual(withUpdatedStroke.strokes[0].color, '#ff0000', 'upsertStroke stores replacement stroke')
