export interface AiStreamCitation {
  title?: string
  [key: string]: unknown
}

export function getAiCitationFileNames(citations?: AiStreamCitation[] | null): string[] {
  if (!citations || !Array.isArray(citations)) {
    return []
  }

  const names = citations
    .map((c) => (c && typeof c === 'object' && typeof c.title === 'string' ? c.title.trim() : ''))
    .filter(Boolean)

  return Array.from(new Set(names))
}
