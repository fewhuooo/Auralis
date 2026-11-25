export interface CachedDocumentEntry {
  cacheKey: string
  scope: string
  assetId: string
  mimeType: string
  originalName: string
  sizeBytes: number
  lastAccessedAt: number
  buffer: ArrayBuffer
}

export interface CacheEvictionCandidate {
  cacheKey: string
  sizeBytes: number
  lastAccessedAt: number
}

const DB_NAME = 'auralis_doc_cache_v1'
const STORE_NAME = 'documents'
const DB_VERSION = 1

export const MAX_SINGLE_DOCUMENT_CACHE_BYTES = 50 * 1024 * 1024
export const MAX_SCOPE_DOCUMENT_CACHE_BYTES = 160 * 1024 * 1024
export const MAX_SCOPE_DOCUMENT_CACHE_COUNT = 20

function buildCacheKey(scope: string, assetId: string): string {
  return `${scope}::${assetId}`
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

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

function openCacheDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' })
          store.createIndex('by_scope', 'scope', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function getCachedDocument(scope: string, assetId: string): Promise<CachedDocumentEntry | null> {
  if (!scope || !assetId) return null
  const database = await openCacheDatabase()
  if (!database) return null

  const key = buildCacheKey(scope, assetId)
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(key)
      let found: CachedDocumentEntry | null = null

      getReq.onsuccess = () => {
        const raw = getReq.result as CachedDocumentEntry | undefined
        if (raw && raw.scope === scope && raw.buffer instanceof ArrayBuffer && raw.buffer.byteLength > 0) {
          found = {
            ...raw,
            // Clone so pdf.js workers transferring the buffer cannot detach stored copies.
            buffer: raw.buffer.slice(0),
          }
          store.put({
            ...raw,
            lastAccessedAt: Date.now(),
          })
        }
      }

      tx.oncomplete = () => {
        database.close()
        resolve(found)
      }
      tx.onerror = () => {
        database.close()
        resolve(null)
      }
      tx.onabort = () => {
        database.close()
        resolve(null)
      }
    } catch {
      database.close()
      resolve(null)
    }
  })
}

export async function putCachedDocument(
  scope: string,
  entry: {
    assetId: string
    mimeType: string
    originalName: string
    buffer: ArrayBuffer
  },
): Promise<void> {
  if (!scope || !entry.assetId) return
  if (!(entry.buffer instanceof ArrayBuffer)) return
  const byteLength = entry.buffer.byteLength
  if (byteLength <= 0 || byteLength > MAX_SINGLE_DOCUMENT_CACHE_BYTES) return

  const database = await openCacheDatabase()
  if (!database) return

  const key = buildCacheKey(scope, entry.assetId)
  const record: CachedDocumentEntry = {
    cacheKey: key,
    scope,
    assetId: entry.assetId,
    mimeType: entry.mimeType || 'application/octet-stream',
    originalName: entry.originalName || '',
    sizeBytes: byteLength,
    lastAccessedAt: Date.now(),
    buffer: entry.buffer.slice(0),
  }

  try {
    await new Promise<void>((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const listReq = store.index('by_scope').getAll(IDBKeyRange.only(scope))
      listReq.onsuccess = () => {
        const existing = Array.isArray(listReq.result) ? (listReq.result as CachedDocumentEntry[]) : []
        const evictKeys = selectEvictableCacheKeys(
          existing.map(item => ({
            cacheKey: item.cacheKey,
            sizeBytes: item.sizeBytes,
            lastAccessedAt: item.lastAccessedAt,
          })),
          byteLength,
          key,
        )
        for (const evictKey of evictKeys) {
          store.delete(evictKey)
        }
        store.put(record)
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => {
        console.warn('[DocumentCache] IndexedDB write failed (quota or storage error)')
        resolve()
      }
      tx.onabort = () => resolve()
    })
  } catch {
    console.warn('[DocumentCache] IndexedDB write failed')
  } finally {
    database.close()
  }
}

export async function deleteCachedDocument(scope: string, assetId: string): Promise<void> {
  if (!scope || !assetId) return
  const database = await openCacheDatabase()
  if (!database) return

  const key = buildCacheKey(scope, assetId)
  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  }).finally(() => {
    database.close()
  })
}

export async function clearScopeDocumentCache(scope: string): Promise<void> {
  if (!scope) return
  const database = await openCacheDatabase()
  if (!database) return

  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const listReq = store.index('by_scope').getAllKeys(IDBKeyRange.only(scope))
      listReq.onsuccess = () => {
        const keys = Array.isArray(listReq.result) ? listReq.result : []
        for (const entryKey of keys) {
          store.delete(entryKey)
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  }).finally(() => {
    database.close()
  })
}
