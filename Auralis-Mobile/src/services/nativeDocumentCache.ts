import {
  MAX_SCOPE_DOCUMENT_CACHE_BYTES,
  MAX_SCOPE_DOCUMENT_CACHE_COUNT,
  MAX_SINGLE_DOCUMENT_CACHE_BYTES,
  selectEvictableCacheKeys,
} from './documentCacheEviction.ts'

export interface NativeCachedDocumentEntry {
  cacheKey: string
  scope: string
  assetId: string
  mimeType: string
  originalName: string
  sizeBytes: number
  lastAccessedAt: number
  savedFilePath: string
}

export interface NativeDocumentCacheAdapter {
  getStorage(key: string): string | null
  setStorage(key: string, value: string): void
  removeStorage(key: string): void
  saveFile(tempFilePath: string): Promise<string>
  removeSavedFile(savedFilePath: string): Promise<void>
  getSavedFileInfo(savedFilePath: string): Promise<{ size: number } | null>
  now?: () => number
}

const INDEX_PREFIX = 'auralis:native_doc_cache:v1:'

function buildCacheKey(scope: string, assetId: string): string {
  return `${scope}::${assetId}`
}

function indexKeyForScope(scope: string): string {
  return `${INDEX_PREFIX}${scope}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseEntries(raw: string | null, scope: string): NativeCachedDocumentEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const entries: NativeCachedDocumentEntry[] = []
    for (const item of parsed) {
      if (!isRecord(item)) continue
      if (
        typeof item.cacheKey !== 'string'
        || typeof item.assetId !== 'string'
        || typeof item.savedFilePath !== 'string'
        || item.scope !== scope
        || !item.savedFilePath
      ) {
        continue
      }
      entries.push({
        cacheKey: item.cacheKey,
        scope,
        assetId: item.assetId,
        mimeType: typeof item.mimeType === 'string' ? item.mimeType : 'application/octet-stream',
        originalName: typeof item.originalName === 'string' ? item.originalName : '',
        sizeBytes: typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) ? Math.max(0, item.sizeBytes) : 0,
        lastAccessedAt: typeof item.lastAccessedAt === 'number' && Number.isFinite(item.lastAccessedAt) ? item.lastAccessedAt : 0,
        savedFilePath: item.savedFilePath,
      })
    }
    return entries
  } catch {
    return []
  }
}

export function createNativeDocumentCache(
  adapter: NativeDocumentCacheAdapter,
  limits = {
    maxSingleBytes: MAX_SINGLE_DOCUMENT_CACHE_BYTES,
    maxScopeBytes: MAX_SCOPE_DOCUMENT_CACHE_BYTES,
    maxScopeCount: MAX_SCOPE_DOCUMENT_CACHE_COUNT,
  },
) {
  const now = () => (adapter.now ? adapter.now() : Date.now())

  function readIndex(scope: string): NativeCachedDocumentEntry[] {
    return parseEntries(adapter.getStorage(indexKeyForScope(scope)), scope)
  }

  function writeIndex(scope: string, entries: NativeCachedDocumentEntry[]): void {
    const key = indexKeyForScope(scope)
    if (entries.length === 0) {
      adapter.removeStorage(key)
      return
    }
    adapter.setStorage(key, JSON.stringify(entries))
  }

  async function getCachedDocument(scope: string, assetId: string): Promise<NativeCachedDocumentEntry | null> {
    if (!scope || !assetId) return null
    const entries = readIndex(scope)
    const key = buildCacheKey(scope, assetId)
    const index = entries.findIndex(item => item.cacheKey === key)
    if (index < 0) return null

    const entry = entries[index]
    const info = await adapter.getSavedFileInfo(entry.savedFilePath).catch(() => null)
    if (!info) {
      entries.splice(index, 1)
      writeIndex(scope, entries)
      return null
    }

    const updated: NativeCachedDocumentEntry = {
      ...entry,
      sizeBytes: info.size > 0 ? info.size : entry.sizeBytes,
      lastAccessedAt: now(),
    }
    entries[index] = updated
    writeIndex(scope, entries)
    return { ...updated }
  }

  async function putCachedDocument(
    scope: string,
    input: {
      assetId: string
      mimeType: string
      originalName: string
      tempFilePath: string
      sizeBytes?: number
    },
  ): Promise<NativeCachedDocumentEntry | null> {
    if (!scope || !input.assetId || !input.tempFilePath) return null

    let byteLength = typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes) ? input.sizeBytes : 0
    if (byteLength <= 0) {
      const info = await adapter.getSavedFileInfo(input.tempFilePath).catch(() => null)
      byteLength = info?.size ?? 0
    }
    if (byteLength <= 0 || byteLength > limits.maxSingleBytes) {
      return null
    }

    const savedFilePath = await adapter.saveFile(input.tempFilePath).catch(() => '')
    if (!savedFilePath) return null

    const entries = readIndex(scope)
    const key = buildCacheKey(scope, input.assetId)
    const previousSame = entries.find(item => item.cacheKey === key)
    const evictKeys = new Set(selectEvictableCacheKeys(
      entries.map(item => ({
        cacheKey: item.cacheKey,
        sizeBytes: item.sizeBytes,
        lastAccessedAt: item.lastAccessedAt,
      })),
      byteLength,
      key,
      limits.maxScopeBytes,
      limits.maxScopeCount,
    ))

    const pathsToDelete: string[] = []
    const retained: NativeCachedDocumentEntry[] = []
    for (const item of entries) {
      if (item.cacheKey === key) continue
      if (evictKeys.has(item.cacheKey)) {
        pathsToDelete.push(item.savedFilePath)
        continue
      }
      retained.push(item)
    }
    if (previousSame && previousSame.savedFilePath !== savedFilePath) {
      pathsToDelete.push(previousSame.savedFilePath)
    }

    const record: NativeCachedDocumentEntry = {
      cacheKey: key,
      scope,
      assetId: input.assetId,
      mimeType: input.mimeType || 'application/octet-stream',
      originalName: input.originalName || '',
      sizeBytes: byteLength,
      lastAccessedAt: now(),
      savedFilePath,
    }
    retained.push(record)
    writeIndex(scope, retained)

    await Promise.all(
      pathsToDelete.map(filePath => adapter.removeSavedFile(filePath).catch(() => {})),
    )

    return { ...record }
  }

  async function deleteCachedDocument(scope: string, assetId: string): Promise<void> {
    if (!scope || !assetId) return
    const entries = readIndex(scope)
    const key = buildCacheKey(scope, assetId)
    const remaining: NativeCachedDocumentEntry[] = []
    const pathsToDelete: string[] = []
    for (const item of entries) {
      if (item.cacheKey === key) {
        pathsToDelete.push(item.savedFilePath)
      } else {
        remaining.push(item)
      }
    }
    writeIndex(scope, remaining)
    await Promise.all(
      pathsToDelete.map(filePath => adapter.removeSavedFile(filePath).catch(() => {})),
    )
  }

  async function clearScopeDocumentCache(scope: string): Promise<void> {
    if (!scope) return
    const entries = readIndex(scope)
    adapter.removeStorage(indexKeyForScope(scope))
    await Promise.all(
      entries.map(item => adapter.removeSavedFile(item.savedFilePath).catch(() => {})),
    )
  }

  return {
    getCachedDocument,
    putCachedDocument,
    deleteCachedDocument,
    clearScopeDocumentCache,
  }
}

function createUniAdapter(): NativeDocumentCacheAdapter {
  return {
    getStorage(key) {
      try {
        const val = uni.getStorageSync(key)
        return typeof val === 'string' && val ? val : null
      } catch {
        return null
      }
    },
    setStorage(key, value) {
      try {
        uni.setStorageSync(key, value)
      } catch {
        // Ignore storage quota failures
      }
    },
    removeStorage(key) {
      try {
        uni.removeStorageSync(key)
      } catch {
        // Ignore cleanup failures
      }
    },
    saveFile(tempFilePath) {
      return new Promise((resolve, reject) => {
        uni.saveFile({
          tempFilePath,
          success: res => resolve(res.savedFilePath),
          fail: err => reject(err),
        })
      })
    },
    removeSavedFile(savedFilePath) {
      return new Promise((resolve) => {
        uni.removeSavedFile({
          filePath: savedFilePath,
          complete: () => resolve(),
        })
      })
    },
    getSavedFileInfo(savedFilePath) {
      return new Promise((resolve) => {
        const api = uni as unknown as {
          getFileInfo?: (opts: {
            filePath: string
            success?: (res: { size: number }) => void
            fail?: () => void
          }) => void
          getSavedFileInfo?: (opts: {
            filePath: string
            success?: (res: { size: number }) => void
            fail?: () => void
          }) => void
        }
        if (api.getSavedFileInfo) {
          api.getSavedFileInfo({
            filePath: savedFilePath,
            success: res => resolve({ size: Number(res.size || 0) }),
            fail: () => resolve(null),
          })
          return
        }
        if (api.getFileInfo) {
          api.getFileInfo({
            filePath: savedFilePath,
            success: res => resolve({ size: Number(res.size || 0) }),
            fail: () => resolve(null),
          })
          return
        }
        resolve(null)
      })
    },
  }
}

const defaultCache = createNativeDocumentCache(createUniAdapter())

export const getNativeCachedDocument = defaultCache.getCachedDocument
export const putNativeCachedDocument = defaultCache.putCachedDocument
export const deleteNativeCachedDocument = defaultCache.deleteCachedDocument
export const clearNativeScopeDocumentCache = defaultCache.clearScopeDocumentCache
