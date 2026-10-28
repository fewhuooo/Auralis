import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const {
  createOutlineIdentityInput,
  createOutlineProvenanceInput,
  createOutlineProvenanceInputForLinkedSources,
  filterOutlineSourceRefs,
  hasCompleteOutlineIdentityInput,
  shouldAdoptGeneratedOutline,
} = await import('../src/services/outlineIdentity.ts')

const outline = [{ title: 'Chapter', sections: [{ title: 'Section' }, { title: 'Another section' }] }]
const nodeId = 'e6b3c776-e4d4-4a0f-9f0d-bc09fddc6ed8'

test('outline identity is path-complete and persists only server IDs', () => {
  const input = createOutlineIdentityInput(outline, new Map([['0', nodeId], ['0.0', null], ['0.1', null]]))
  assert.deepEqual(input, {
    schemaVersion: 1,
    nodes: [
      { path: [0], nodeId },
      { path: [0, 0], nodeId: null },
      { path: [0, 1], nodeId: null },
    ],
  })
  assert.equal(hasCompleteOutlineIdentityInput(outline, input), true)
  assert.equal(hasCompleteOutlineIdentityInput(outline, { ...input, nodes: input.nodes.slice(1) }), false)
  assert.equal(hasCompleteOutlineIdentityInput(outline, {
    schemaVersion: 1,
    nodes: input.nodes.map(node => ({ ...node, nodeId })),
  }), false)
})

test('provenance requests project canonical refs to the six writable source fields', () => {
  const view = {
    schemaVersion: 1,
    sections: [{
      path: [0, 0],
      sourceRefs: [{
        sourceId: 'source-1', ingestionRevision: 'revision-1', chunkId: 'chunk-1', generation: 'gen-1',
        charStart: 3, charEnd: 12, contentHash: 'server-hash', precision: 'BLOCK', parsedDocumentId: 'parsed-1',
        parserId: 'parser-1', locations: [{ blockOrdinal: 4, pageNumber: 2, charStart: 3, charEnd: 12,
          blockCharStart: 0, blockCharEnd: 20 }],
      }],
    }],
  }
  assert.deepEqual(createOutlineProvenanceInput(view), {
    schemaVersion: 1,
    sections: [{ path: [0, 0], sourceRefs: [{
      sourceId: 'source-1', ingestionRevision: 'revision-1', chunkId: 'chunk-1', generation: 'gen-1',
      charStart: 3, charEnd: 12,
    }] }],
  })
})

test('a late generated candidate refreshes only a clean file draft', () => {
  assert.equal(shouldAdoptGeneratedOutline('2026-10-18T10:00:00Z', '2026-10-19T10:00:00Z', true), false,
    'an unsaved title, summary, ordering, or ref edit keeps its current draft')
  assert.equal(shouldAdoptGeneratedOutline('2026-10-18T10:00:00Z', '2026-10-19T10:00:00Z', false), true)
  assert.equal(shouldAdoptGeneratedOutline('2026-10-18T10:00:00Z', '2026-10-18T10:00:00Z', false), false)
})

test('outline save intent omits empty refs, filters unlinked refs, and adds only source-level refs for newly linked sources', () => {
  const ref = (sourceId, ingestionRevision, chunkId) => ({
    sourceId, ingestionRevision, chunkId, generation: 'gen-1', charStart: 2, charEnd: 8,
    contentHash: 'hash', precision: 'CHUNK', parsedDocumentId: 'parsed', parserId: 'parser',
    locations: [{ blockOrdinal: 0, charStart: 2, charEnd: 8, blockCharStart: 0, blockCharEnd: 12 }],
  })
  const linkedRefs = [ref('file-a', 'rev-a', 'chunk-a'), ref('file-b', 'rev-b', 'chunk-b')]
  const remainingRefs = filterOutlineSourceRefs(linkedRefs, ['file-b'])
  const input = createOutlineProvenanceInputForLinkedSources({
    schemaVersion: 1,
    sections: [
      { path: [0, 0], sourceRefs: [] }, // newly added section: server falls back to its sourceIds
      { path: [0, 1], sourceRefs: remainingRefs }, // unlinking file-a keeps only file-b's canonical ref
      { path: [0, 2], sourceRefs: [ref('file-a', 'rev-a', 'chunk-a')] }, // newly linked file-b gets source-level precision only
      { path: [0, 3], sourceRefs: [] }, // unlinking all refs: omit the section entry so server fallback remains authoritative
    ],
  }, new Map([
    ['0.0', ['file-a']],
    ['0.1', ['file-b']],
    ['0.2', ['file-a', 'file-b']],
    ['0.3', []],
  ]), new Map([['file-a', 'rev-a'], ['file-b', 'rev-b']]))

  assert.deepEqual(input.sections.map(section => section.path), [[0, 1], [0, 2]])
  assert.deepEqual(input.sections[0].sourceRefs.map(sourceRef => sourceRef.sourceId), ['file-b'])
  assert.deepEqual(input.sections[1].sourceRefs, [
    { sourceId: 'file-a', ingestionRevision: 'rev-a', chunkId: 'chunk-a', generation: 'gen-1', charStart: 2, charEnd: 8 },
    { sourceId: 'file-b', ingestionRevision: 'rev-b', chunkId: null, generation: null, charStart: null, charEnd: null },
  ])
})
