export function validatedDocumentCacheId(...ids: Array<string | null | undefined>): string | null {
  const normalized = ids.map((id) => id?.trim() || null).filter((id): id is string => Boolean(id))
  const unique = [...new Set(normalized)]
  if (unique.length > 1) throw new Error('DOCUMENT_CACHE_OWNERSHIP_MISMATCH')
  return unique[0] ?? null
}
