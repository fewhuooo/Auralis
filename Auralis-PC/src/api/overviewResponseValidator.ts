import type {
  GeneratedOverviewResponse,
  OverviewMode,
} from '@/types/overview'

function invalid(): never { throw new Error('OVERVIEW_RESPONSE_INVALID') }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max?: number): value is string => typeof value === 'string'
  && (max === undefined || value.length <= max)

export function validateGeneratedOverviewResponse(value: unknown, mode: OverviewMode): GeneratedOverviewResponse {
  if (!object(value)) invalid()
  if (value.schemaVersion !== 2 || !text(value.title) || !value.title.trim()) invalid()
  const outlineRequired = mode !== 'SUMMARY'
  const summaryRequired = mode !== 'OUTLINE'

  if (outlineRequired) {
    if (typeof value.outlineMarkdown !== 'string' || !value.outlineMarkdown.trim()) invalid()
  } else {
    if (value.outlineMarkdown !== null && value.outlineMarkdown !== undefined) invalid()
  }

  if (summaryRequired) {
    if (typeof value.summaryMarkdown !== 'string' || !value.summaryMarkdown.trim()) invalid()
  } else {
    if (value.summaryMarkdown !== null && value.summaryMarkdown !== undefined) invalid()
  }

  return {
    schemaVersion: 2,
    title: value.title.trim(),
    outlineMarkdown: outlineRequired ? (value.outlineMarkdown as string) : null,
    summaryMarkdown: summaryRequired ? (value.summaryMarkdown as string) : null,
  }
}
