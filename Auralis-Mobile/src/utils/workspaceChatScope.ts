import type { components } from '../api/generated/schema.ts'

type SourceView = components['schemas']['SourceResponse']
type ReadingContext = components['schemas']['ReadingContext']

export function buildWorkspaceReadingContext(
  subjectId: string,
  selectedSource: SourceView | null,
): ReadingContext {
  if (selectedSource && selectedSource.ingestionStatus === 'READY' && selectedSource.id) {
    return {
      subjectId,
      retrievalMode: 'AUTO',
      currentSourceId: selectedSource.id,
    }
  }
  return {
    subjectId,
    retrievalMode: 'SUBJECT',
  }
}
