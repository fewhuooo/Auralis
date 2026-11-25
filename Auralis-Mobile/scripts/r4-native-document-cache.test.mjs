import assert from 'node:assert/strict'
import test from 'node:test'

import { createNativeDocumentCache } from '../src/services/nativeDocumentCache.ts'

function createMemoryCacheHarness() {
  const storage = new Map()
  const savedFiles = new Map()
  let nextSavedId = 1
  let clock = 1000
  const removedPaths = []

  const cache = createNativeDocumentCache({
    getStorage: key => storage.get(key) ?? null,
    setStorage: (key, value) => storage.set(key, value),
    removeStorage: key => storage.delete(key),
    async saveFile(tempFilePath) {
      const size = savedFiles.get(tempFilePath) ?? 1024
      const savedPath = `_doc/cached_${nextSavedId++}`
      savedFiles.set(savedPath, size)
      return savedPath
    },
    async removeSavedFile(savedFilePath) {
      removedPaths.push(savedFilePath)
      savedFiles.delete(savedFilePath)
    },
    async getSavedFileInfo(savedFilePath) {
      if (!savedFiles.has(savedFilePath)) return null
      return { size: savedFiles.get(savedFilePath) }
    },
    now: () => ++clock,
  })

  return { cache, storage, savedFiles, removedPaths }
}

test('createNativeDocumentCache stores, hits with LRU touch, and prunes missing files', async () => {
  const { cache, savedFiles } = createMemoryCacheHarness()
  savedFiles.set('_tmp/a.pdf', 4096)

  const stored = await cache.putCachedDocument('u1:d1', {
    assetId: 'asset-a',
    mimeType: 'application/pdf',
    originalName: 'notes.pdf',
    tempFilePath: '_tmp/a.pdf',
    sizeBytes: 4096,
  })
  assert.ok(stored)
  assert.equal(stored.sizeBytes, 4096)

  const hit = await cache.getCachedDocument('u1:d1', 'asset-a')
  assert.ok(hit)
  assert.ok(hit.lastAccessedAt > stored.lastAccessedAt)

  savedFiles.delete(stored.savedFilePath)
  const missedAfterDelete = await cache.getCachedDocument('u1:d1', 'asset-a')
  assert.equal(missedAfterDelete, null)
})

test('createNativeDocumentCache enforces 50MB single limit, 160MB/20-file LRU eviction, and scope isolation', async () => {
  const { cache, savedFiles, removedPaths } = createMemoryCacheHarness()
  const MB = 1024 * 1024

  savedFiles.set('_tmp/huge.pdf', 51 * MB)
  const skipped = await cache.putCachedDocument('u1:d1', {
    assetId: 'too-big',
    mimeType: 'application/pdf',
    originalName: 'huge.pdf',
    tempFilePath: '_tmp/huge.pdf',
    sizeBytes: 51 * MB,
  })
  assert.equal(skipped, null)

  for (let i = 1; i <= 4; i++) {
    savedFiles.set(`_tmp/f${i}.pdf`, 45 * MB)
    await cache.putCachedDocument('u1:d1', {
      assetId: `a${i}`,
      mimeType: 'application/pdf',
      originalName: `f${i}.pdf`,
      tempFilePath: `_tmp/f${i}.pdf`,
      sizeBytes: 45 * MB,
    })
  }
  // Total 4 * 45MB = 180MB > 160MB, so oldest a1 must be evicted
  assert.equal(await cache.getCachedDocument('u1:d1', 'a1'), null)
  assert.ok(await cache.getCachedDocument('u1:d1', 'a4'))
  assert.equal(removedPaths.length, 1)

  // Put 22 tiny files in another scope -> count cap 20 evicts oldest 2
  for (let i = 1; i <= 22; i++) {
    savedFiles.set(`_tmp/t${i}.pdf`, 1024)
    await cache.putCachedDocument('u2:d1', {
      assetId: `t${i}`,
      mimeType: 'application/pdf',
      originalName: `t${i}.pdf`,
      tempFilePath: `_tmp/t${i}.pdf`,
      sizeBytes: 1024,
    })
  }
  assert.equal(await cache.getCachedDocument('u2:d1', 't1'), null)
  assert.equal(await cache.getCachedDocument('u2:d1', 't2'), null)
  assert.ok(await cache.getCachedDocument('u2:d1', 't3'))

  await cache.deleteCachedDocument('u2:d1', 't3')
  assert.equal(await cache.getCachedDocument('u2:d1', 't3'), null)

  await cache.clearScopeDocumentCache('u2:d1')
  assert.equal(await cache.getCachedDocument('u2:d1', 't22'), null)
  assert.ok(await cache.getCachedDocument('u1:d1', 'a4'))
})
