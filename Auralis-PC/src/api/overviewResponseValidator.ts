import type { OverviewMode, OverviewResponse } from '@/types/overview'

function invalid(): never { throw new Error('OVERVIEW_RESPONSE_INVALID') }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
const textList = (value: unknown, maxItems: number, maxText: number): value is string[] => Array.isArray(value)
  && value.length <= maxItems && value.every(item => text(item, maxText))

function validateOutline(value: unknown): void {
  if (!Array.isArray(value)) invalid()
  if (value.length > 60) invalid()
  let sectionCount = 0
  for (const chapter of value) {
    if (!object(chapter) || !text(chapter.title, 300) || !Array.isArray(chapter.sections)) invalid()
    sectionCount += chapter.sections.length
    if (sectionCount > 500) invalid()
    for (const section of chapter.sections) {
      if (!object(section) || !text(section.title, 300)
        || !(section.summary === null || text(section.summary, 4000))
        || !textList(section.sourceIds, 100, 300)) invalid()
      if (section.locator !== null) {
        if (!object(section.locator)
          || !(section.locator.page === null || (Number.isInteger(section.locator.page) && Number(section.locator.page) > 0))
          || !(section.locator.blockId === null || text(section.locator.blockId, 300))) invalid()
      }
    }
  }
}

function validateSummary(value: unknown): void {
  if (!object(value) || !text(value.overview, 4000)
    || !textList(value.keyPoints, 100, 4000)
    || !textList(value.learningPath, 100, 4000)) invalid()
}

export function validateOverviewResponse(value: unknown, mode: OverviewMode): OverviewResponse {
  if (!object(value)) invalid()
  if (value.schemaVersion !== 1 || !text(value.title, 300)) invalid()
  const outlineRequired = mode !== 'SUMMARY'
  const summaryRequired = mode !== 'OUTLINE'
  if (outlineRequired) validateOutline(value.outline); else if (value.outline !== null) invalid()
  if (summaryRequired) validateSummary(value.summary); else if (value.summary !== null) invalid()
  return value as unknown as OverviewResponse
}
