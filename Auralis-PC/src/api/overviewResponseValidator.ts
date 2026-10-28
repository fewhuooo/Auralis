import type {
  CanonicalSourceRefView, GeneratedOverviewResponse, OverviewMode, OverviewResponse,
  OutlineProvenanceInput, OutlineProvenanceRefInput, OutlineProvenanceView,
} from '@/types/overview'

function invalid(): never { throw new Error('OVERVIEW_RESPONSE_INVALID') }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max?: number): value is string => typeof value === 'string'
  && (max === undefined || value.length <= max)
const textList = (value: unknown, maxText?: number): value is string[] => Array.isArray(value)
  && value.every(item => text(item, maxText))
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function validateOutline(value: unknown): void {
  if (!Array.isArray(value)) invalid()
  for (const chapter of value) {
    if (!object(chapter) || !text(chapter.title) || !Array.isArray(chapter.sections)) invalid()
    for (const section of chapter.sections) {
      if (!object(section) || !text(section.title)
        || !(section.summary === null || text(section.summary))
        || !textList(section.sourceIds, 300)) invalid()
      if (section.locator !== null) {
        if (!object(section.locator)
          || !(section.locator.page === null || (Number.isInteger(section.locator.page) && Number(section.locator.page) > 0))
          || !(section.locator.blockId === null || text(section.locator.blockId, 300))) invalid()
      }
    }
  }
}

function validateSummary(value: unknown): void {
  if (!object(value) || !text(value.overview)
    || !textList(value.keyPoints)
    || !textList(value.learningPath)) invalid()
}

function validNullableInteger(value: unknown): boolean {
  return value === null || Number.isInteger(value) && Number(value) >= 0
}

function validateCanonicalRef(value: unknown): value is CanonicalSourceRefView {
  if (!object(value) || !text(value.sourceId, 200) || !text(value.ingestionRevision, 100)
    || !(value.chunkId === null || text(value.chunkId, 100))
    || !(value.generation === null || text(value.generation, 100))
    || !validNullableInteger(value.charStart) || !validNullableInteger(value.charEnd)
    || !(value.contentHash === null || text(value.contentHash, 128))
    || !['SOURCE', 'CHUNK', 'BLOCK'].includes(String(value.precision))
    || !(value.parsedDocumentId === null || text(value.parsedDocumentId, 100))
    || !(value.parserId === null || text(value.parserId, 100))
    || !Array.isArray(value.locations)) return false
  return value.locations.every((location: unknown) => object(location)
    && Number.isInteger(location.blockOrdinal) && Number(location.blockOrdinal) >= 0
    && ['pageNumber', 'anchorIndex', 'startLine'].every(key => location[key] === undefined || validNullableInteger(location[key]))
    && Number.isInteger(location.charStart) && Number(location.charStart) >= 0
    && Number.isInteger(location.charEnd) && Number(location.charEnd) >= Number(location.charStart)
    && Number.isInteger(location.blockCharStart) && Number(location.blockCharStart) >= 0
    && Number.isInteger(location.blockCharEnd) && Number(location.blockCharEnd) >= Number(location.blockCharStart))
}

function validateOutlineProvenance(value: unknown, outline: OverviewResponse['outline']): OutlineProvenanceView {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.sections)) invalid()
  const seen = new Set<string>()
  const sections = value.sections.map((section: unknown) => {
    if (!object(section) || !Array.isArray(section.path) || section.path.length !== 2
      || section.path.some((index: unknown) => !Number.isInteger(index) || Number(index) < 0)
      || !Array.isArray(section.sourceRefs)) invalid()
    const [chapterIndex, sectionIndex] = section.path as number[]
    const pathKey = `${chapterIndex}.${sectionIndex}`
    if (seen.has(pathKey) || !outline?.[chapterIndex]?.sections?.[sectionIndex]
      || !section.sourceRefs.every(validateCanonicalRef)) invalid()
    seen.add(pathKey)
    return { path: [chapterIndex, sectionIndex], sourceRefs: section.sourceRefs }
  })
  return { schemaVersion: 1, sections } as OutlineProvenanceView
}

function validateInputRef(value: unknown): value is OutlineProvenanceRefInput {
  if (!object(value) || ['contentHash', 'precision', 'parsedDocumentId', 'parserId', 'locations'].some(key => key in value)
    || !uuid(value.sourceId) || !uuid(value.ingestionRevision)
    || !(value.chunkId === undefined || value.chunkId === null || uuid(value.chunkId))
    || !(value.generation === undefined || value.generation === null || uuid(value.generation))) return false
  const hasChunk = value.chunkId != null || value.generation != null || value.charStart != null || value.charEnd != null
  if (!hasChunk) return value.charStart === undefined || value.charStart === null
    ? value.charEnd === undefined || value.charEnd === null
    : false
  return uuid(value.chunkId) && uuid(value.generation)
    && Number.isInteger(value.charStart) && Number(value.charStart) >= 0 && Number(value.charStart) <= 2147483647
    && Number.isInteger(value.charEnd) && Number(value.charEnd) > Number(value.charStart) && Number(value.charEnd) <= 2147483647
}

function validateInputOutlineProvenance(value: unknown, outline: OverviewResponse['outline']): OutlineProvenanceInput {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.sections)
    || !outline) invalid()
  const expected = new Map<string, Set<string>>()
  outline.forEach((chapter, chapterIndex) => chapter.sections.forEach((section, sectionIndex) => {
    expected.set(`${chapterIndex}.${sectionIndex}`, new Set(section.sourceIds))
  }))
  const seen = new Set<string>()
  const sections = value.sections.map((section: unknown) => {
    if (!object(section) || !Array.isArray(section.path) || section.path.length !== 2
      || section.path.some((index: unknown) => !Number.isInteger(index) || Number(index) < 0)
      || !Array.isArray(section.sourceRefs) || section.sourceRefs.length === 0) invalid()
    const path = section.path as number[]
    const pathKey = `${path[0]}.${path[1]}`
    const allowedSourceIds = expected.get(pathKey)
    if (!allowedSourceIds || seen.has(pathKey) || !section.sourceRefs.every(validateInputRef)
      || section.sourceRefs.some((ref: OutlineProvenanceRefInput) => !allowedSourceIds.has(ref.sourceId))) invalid()
    seen.add(pathKey)
    return { path: [...path], sourceRefs: section.sourceRefs }
  })
  if (seen.size !== expected.size || [...expected.keys()].some(key => !seen.has(key))) invalid()
  return { schemaVersion: 1, sections }
}

export function validateGeneratedOverviewResponse(value: unknown, mode: OverviewMode): GeneratedOverviewResponse {
  if (!object(value)) invalid()
  if (value.schemaVersion !== 1 || !text(value.title)) invalid()
  const outlineRequired = mode !== 'SUMMARY'
  const summaryRequired = mode !== 'OUTLINE'
  if (outlineRequired) validateOutline(value.outline); else if (value.outline !== null) invalid()
  if (summaryRequired) validateSummary(value.summary); else if (value.summary !== null) invalid()
  const response = { schemaVersion: 1 as const, title: value.title, outline: value.outline, summary: value.summary } as GeneratedOverviewResponse
  if (value.outlineProvenance !== undefined && value.outlineProvenance !== null) {
    response.outlineProvenance = validateInputOutlineProvenance(value.outlineProvenance, response.outline)
  }
  return response
}

/** Backward-named entry point for the SSE generation response validator. */
export const validateOverviewResponse = validateGeneratedOverviewResponse

/** Strict validator for the canonical view returned by the independent result API. */
export function validateCanonicalOverviewProvenance(value: unknown, outline: OverviewResponse['outline']): OutlineProvenanceView {
  return validateOutlineProvenance(value, outline)
}
