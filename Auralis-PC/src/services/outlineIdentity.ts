import type {
  CanonicalSourceRefView, OutlineIdentityInput, OutlineProvenanceInput, OutlineProvenanceView, OverviewChapter,
} from '@/types/overview'

export function outlineNodePaths(outline: OverviewChapter[]): number[][] {
  const paths: number[][] = []
  outline.forEach((chapter, chapterIndex) => {
    paths.push([chapterIndex])
    chapter.sections.forEach((_section, sectionIndex) => paths.push([chapterIndex, sectionIndex]))
  })
  return paths
}

export function shouldAdoptGeneratedOutline(previousGeneratedAt: string | null | undefined,
  nextGeneratedAt: string | null, hasUnsavedDraftChanges: boolean): boolean {
  return previousGeneratedAt !== undefined && previousGeneratedAt !== nextGeneratedAt && !hasUnsavedDraftChanges
}

export function createOutlineIdentityInput(outline: OverviewChapter[], nodeIdsByPath?: Map<string, string | null>): OutlineIdentityInput {
  return {
    schemaVersion: 1,
    nodes: outlineNodePaths(outline).map(path => ({ path, nodeId: nodeIdsByPath?.get(path.join('.')) ?? null })),
  }
}

export function hasCompleteOutlineIdentityInput(outline: OverviewChapter[], value: unknown): value is OutlineIdentityInput {
  if (!value || typeof value !== 'object') return false
  const candidate = value as OutlineIdentityInput
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.nodes)) return false
  const paths = outlineNodePaths(outline)
  if (candidate.nodes.length !== paths.length) return false
  const keys = new Set<string>()
  const ids = new Set<string>()
  for (const node of candidate.nodes) {
    if (!node || !Array.isArray(node.path) || (node.path.length !== 1 && node.path.length !== 2)
      || node.path.some(index => !Number.isInteger(index) || index < 0)
      || !(node.nodeId === null || typeof node.nodeId === 'string')) return false
    const key = node.path.join('.')
    if (keys.has(key)) return false
    keys.add(key)
    if (node.nodeId !== null) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(node.nodeId)
        || ids.has(node.nodeId.toLowerCase())) return false
      ids.add(node.nodeId.toLowerCase())
    }
  }
  return paths.every(path => keys.has(path.join('.')))
}

function requestRef(ref: CanonicalSourceRefView) {
  return {
    sourceId: ref.sourceId,
    ingestionRevision: ref.ingestionRevision,
    chunkId: ref.chunkId,
    generation: ref.generation,
    charStart: ref.charStart,
    charEnd: ref.charEnd,
  }
}

export function createOutlineProvenanceInput(view: OutlineProvenanceView | null | undefined): OutlineProvenanceInput | undefined {
  if (!view || view.schemaVersion !== 1) return undefined
  return {
    schemaVersion: 1,
    sections: view.sections.flatMap(section => {
      const sourceRefs = section.sourceRefs.map(requestRef)
      return sourceRefs.length ? [{ path: [...section.path], sourceRefs }] : []
    }),
  }
}

export function filterOutlineSourceRefs(refs: CanonicalSourceRefView[], linkedSourceIds: string[]): CanonicalSourceRefView[] {
  const linked = new Set(linkedSourceIds)
  return refs.filter(ref => linked.has(ref.sourceId))
}

export function createOutlineProvenanceInputForLinkedSources(
  view: OutlineProvenanceView | null | undefined,
  sourceIdsByPath: Map<string, string[]>,
  ingestionRevisionsBySourceId: Map<string, string>,
): OutlineProvenanceInput | undefined {
  if (!view || view.schemaVersion !== 1) return undefined
  const sections = view.sections.flatMap(section => {
    const sourceRefs = section.sourceRefs.map(requestRef)
    if (!sourceRefs.length) return []
    const representedSourceIds = new Set(sourceRefs.map(ref => ref.sourceId))
    for (const sourceId of sourceIdsByPath.get(section.path.join('.')) ?? []) {
      const ingestionRevision = ingestionRevisionsBySourceId.get(sourceId)
      if (!representedSourceIds.has(sourceId) && ingestionRevision) {
        sourceRefs.push({ sourceId, ingestionRevision, chunkId: null, generation: null, charStart: null, charEnd: null })
        representedSourceIds.add(sourceId)
      }
    }
    return [{ path: [...section.path], sourceRefs }]
  })
  return { schemaVersion: 1, sections }
}

export function createOutlineProvenanceView(outline: OverviewChapter[], refsByPath: Map<string, CanonicalSourceRefView[]>): OutlineProvenanceView {
  const sections: OutlineProvenanceView['sections'] = []
  outline.forEach((chapter, chapterIndex) => chapter.sections.forEach((_section, sectionIndex) => {
    const path = [chapterIndex, sectionIndex]
    sections.push({ path, sourceRefs: refsByPath.get(path.join('.')) ?? [] })
  }))
  return { schemaVersion: 1, sections }
}
