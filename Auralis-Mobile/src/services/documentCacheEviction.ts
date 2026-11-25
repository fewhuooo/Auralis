export interface CacheEvictionCandidate {
  cacheKey: string
  sizeBytes: number
  lastAccessedAt: number
}

export const MAX_SINGLE_DOCUMENT_CACHE_BYTES = 50 * 1024 * 1024
export const MAX_SCOPE_DOCUMENT_CACHE_BYTES = 160 * 1024 * 1024
export const MAX_SCOPE_DOCUMENT_CACHE_COUNT = 20

/**
 * Computes which cached entries in the current scope must be evicted (oldest
 * `lastAccessedAt` first) before storing a new document of `incomingBytes`.
 */
export function selectEvictableCacheKeys(
  entries: ReadonlyArray<CacheEvictionCandidate>,
  incomingBytes: number,
  incomingKey: string,
  maxBytes = MAX_SCOPE_DOCUMENT_CACHE_BYTES,
  maxCount = MAX_SCOPE_DOCUMENT_CACHE_COUNT,
): string[] {
  const others = entries
    .filter(item => item.cacheKey !== incomingKey)
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)

  let totalBytes = others.reduce((sum, item) => sum + Math.max(0, item.sizeBytes), 0) + Math.max(0, incomingBytes)
  let totalCount = others.length + 1

  const evict: string[] = []
  for (const candidate of others) {
    if (totalBytes <= maxBytes && totalCount <= maxCount) break
    evict.push(candidate.cacheKey)
    totalBytes -= Math.max(0, candidate.sizeBytes)
    totalCount -= 1
  }
  return evict
}
