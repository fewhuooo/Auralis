import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const {
  documentLocalPackageBegin,
  documentLocalPackageAppend,
  documentLocalPackageFinish,
  documentLocalCacheBind,
  documentLocalCacheDelete,
  isLocalCacheReceiptV1,
  isDocumentCacheReceiptV1,
} = await import('../src/api/tauri.ts')

test('documentLocalCacheDelete validates and invokes the local-cache delete command', async () => {
  assert.throws(() => documentLocalCacheDelete('  '), /DOCUMENT_LOCAL_CACHE_ID_REQUIRED/)
  const mock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'document_local_cache_delete')
    assert.deepEqual(args, { cacheId: 'local-cache-1' })
    return true
  })
  try {
    assert.equal(await documentLocalCacheDelete('  local-cache-1  '), true)
    assert.equal(mock.calls.length, 1)
  } finally {
    mock.restore()
  }
})

function setupTauriInvokeMock(handler) {
  const previousWindow = globalThis.window
  const calls = []
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args, options) => {
        calls.push({ cmd, args, options })
        return handler(cmd, args, options)
      },
    },
  }
  return {
    calls,
    restore() {
      globalThis.window = previousWindow
    },
  }
}

function validLocalReceipt() {
  return {
    cacheId: 'local-cache-1',
    envelopeVersion: 1,
    chunkCount: 2,
    encryptedBytes: 4096,
    plainTextSha256: 'b'.repeat(64),
    payloadSha256: 'c'.repeat(64),
    payloadBytes: 2048,
    localSourceId: 'source-1',
    localContentRevision: 'rev-1',
    sourceAssetSha256: 'a'.repeat(64),
    payloadFormat: 'parsed-document-local-v1',
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    normalizationVersion: '1.0.0',
    ocrModelVersion: null,
  }
}

function validServerReceipt() {
  return {
    cacheId: 'server-cache-1',
    envelopeVersion: 1,
    chunkCount: 2,
    encryptedBytes: 4096,
    plainTextSha256: 'b'.repeat(64),
    payloadSha256: 'c'.repeat(64),
    payloadBytes: 2048,
    payloadFormat: 'parsed-document-v1',
    sourceAssetSha256: 'a'.repeat(64),
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    normalizationVersion: '1.0.0',
    ocrModelVersion: null,
  }
}

test('documentLocalPackageBegin validates inputs, normalizes uppercase SHA, and passes { header } payload shape', async () => {
  // Invalid schema version
  await assert.rejects(
    () => documentLocalPackageBegin({
      schemaVersion: 2,
      userId: 'user-1',
      deviceId: 'device-1',
      localSourceId: 'source-1',
      localContentRevision: 'rev-1',
      sourceAssetSha256: 'a'.repeat(64),
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    }),
    /DOCUMENT_LOCAL_PACKAGE_HEADER_INVALID/
  )

  // Empty userId
  await assert.rejects(
    () => documentLocalPackageBegin({
      schemaVersion: 1,
      userId: '',
      deviceId: 'device-1',
      localSourceId: 'source-1',
      localContentRevision: 'rev-1',
      sourceAssetSha256: 'a'.repeat(64),
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    }),
    /DOCUMENT_LOCAL_PACKAGE_HEADER_INVALID/
  )

  // Invalid SHA256 length
  await assert.rejects(
    () => documentLocalPackageBegin({
      schemaVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      localSourceId: 'source-1',
      localContentRevision: 'rev-1',
      sourceAssetSha256: 'short-sha',
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    }),
    /DOCUMENT_LOCAL_PACKAGE_HEADER_INVALID/
  )

  // Successful invoke with uppercase SHA normalization and exact { header } payload assertion
  const mock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'document_local_package_begin')
    assert.deepEqual(Object.keys(args), ['header'], 'Payload shape must be exactly { header }')
    assert.equal(args.header.userId, 'user-1')
    assert.equal(args.header.deviceId, 'device-1')
    assert.equal(args.header.localSourceId, 'source-1')
    assert.equal(args.header.localContentRevision, 'rev-1')
    assert.equal(args.header.sourceAssetSha256, 'a'.repeat(64), 'SHA256 must be normalized to lowercase for native Rust')
    assert.equal(args.header.parserId, 'test-parser')
    assert.equal(args.header.parserVersion, '1.0.0')
    assert.equal(args.header.normalizationVersion, '1.0.0')
    assert.equal(args.header.ocrModelVersion, null)
    return 'local-pkg-123'
  })

  try {
    const pkgId = await documentLocalPackageBegin({
      schemaVersion: 1,
      userId: '  user-1  ',
      deviceId: '  device-1  ',
      localSourceId: 'source-1',
      localContentRevision: 'rev-1',
      sourceAssetSha256: 'A'.repeat(64), // uppercase input
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    })
    assert.equal(pkgId, 'local-pkg-123')
    assert.equal(mock.calls.length, 1)
  } finally {
    mock.restore()
  }
})

test('documentLocalPackageAppend validates block bounds and passes { packageId, block } payload shape', async () => {
  // Empty packageId
  await assert.rejects(
    () => documentLocalPackageAppend('', {
      ordinal: 0,
      kind: 'page',
      text: 'Sample text',
    }),
    /DOCUMENT_LOCAL_PACKAGE_BLOCK_INVALID/
  )

  // Negative ordinal
  await assert.rejects(
    () => documentLocalPackageAppend('local-pkg-1', {
      ordinal: -1,
      kind: 'page',
      text: 'Sample text',
    }),
    /DOCUMENT_LOCAL_PACKAGE_BLOCK_INVALID/
  )

  // Empty text
  await assert.rejects(
    () => documentLocalPackageAppend('local-pkg-1', {
      ordinal: 0,
      kind: 'page',
      text: '',
    }),
    /DOCUMENT_LOCAL_PACKAGE_BLOCK_INVALID/
  )

  // Successful invoke with exact { packageId, block } payload assertion
  const mock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'document_local_package_append')
    assert.deepEqual(Object.keys(args).sort(), ['block', 'packageId'], 'Payload shape must be exactly { packageId, block }')
    assert.equal(args.packageId, 'local-pkg-1')
    assert.deepEqual(args.block, {
      ordinal: 0,
      kind: 'page',
      text: 'Page text content',
    })
    return undefined
  })

  try {
    await documentLocalPackageAppend('  local-pkg-1  ', {
      ordinal: 0,
      kind: 'page',
      text: 'Page text content',
    })
    assert.equal(mock.calls.length, 1)
  } finally {
    mock.restore()
  }
})

test('documentLocalPackageFinish validates package ID and passes { packageId } payload shape', async () => {
  await assert.rejects(
    () => documentLocalPackageFinish(''),
    /DOCUMENT_LOCAL_PACKAGE_ID_INVALID/
  )

  const mockReceipt = validLocalReceipt()
  const mock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'document_local_package_finish')
    assert.deepEqual(Object.keys(args), ['packageId'], 'Payload shape must be exactly { packageId }')
    assert.equal(args.packageId, 'local-pkg-1')
    return mockReceipt
  })

  try {
    const receipt = await documentLocalPackageFinish('  local-pkg-1  ')
    assert.deepEqual(receipt, mockReceipt)
    assert.equal(mock.calls.length, 1)
  } finally {
    mock.restore()
  }
})

test('documentLocalCacheBind validates request fields, normalizes SHA, passes { request } payload shape without blocks/content', async () => {
  // Missing required field
  await assert.rejects(
    () => documentLocalCacheBind({
      localCacheId: '',
      serverCacheId: 'srv-cache-1',
      userId: 'user-1',
      deviceId: 'device-1',
      localSourceId: 'source-1',
      localContentRevision: 'rev-1',
      serverSourceId: 'srv-source-1',
      jobId: 'job-1',
      ingestionRevision: 'ingestion-rev-1',
      sourceAssetSha256: 'a'.repeat(64),
    }),
    /LOCAL_CACHE_BIND_REQUEST_INVALID/
  )

  // Invalid SHA256
  await assert.rejects(
    () => documentLocalCacheBind({
      localCacheId: 'loc-cache-1',
      serverCacheId: 'srv-cache-1',
      userId: 'user-1',
      deviceId: 'device-1',
      localSourceId: 'source-1',
      localContentRevision: 'rev-1',
      serverSourceId: 'srv-source-1',
      jobId: 'job-1',
      ingestionRevision: 'ingestion-rev-1',
      sourceAssetSha256: 'invalid',
    }),
    /LOCAL_CACHE_BIND_REQUEST_INVALID/
  )

  const serverReceipt = validServerReceipt()
  const mock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'document_local_cache_bind')
    assert.deepEqual(Object.keys(args), ['request'], 'Payload shape must be exactly { request }')
    assert.equal(args.request.localCacheId, 'loc-cache-1')
    assert.equal(args.request.serverCacheId, 'srv-cache-1')
    assert.equal(args.request.userId, 'user-1')
    assert.equal(args.request.deviceId, 'device-1')
    assert.equal(args.request.localSourceId, 'source-1')
    assert.equal(args.request.localContentRevision, 'rev-1')
    assert.equal(args.request.serverSourceId, 'srv-source-1')
    assert.equal(args.request.jobId, 'job-1')
    assert.equal(args.request.ingestionRevision, 'ingestion-rev-1')
    assert.equal(args.request.sourceAssetSha256, 'a'.repeat(64), 'SHA256 must be normalized to lowercase for native Rust')
    assert.equal('blocks' in args.request, false, 'Bind payload MUST NOT contain blocks')
    assert.equal('content' in args.request, false, 'Bind payload MUST NOT contain content')
    return serverReceipt
  })

  try {
    const result = await documentLocalCacheBind({
      localCacheId: 'loc-cache-1',
      serverCacheId: 'srv-cache-1',
      userId: 'user-1',
      deviceId: 'device-1',
      localSourceId: 'source-1',
      localContentRevision: 'rev-1',
      serverSourceId: 'srv-source-1',
      jobId: 'job-1',
      ingestionRevision: 'ingestion-rev-1',
      sourceAssetSha256: 'A'.repeat(64), // uppercase input
    })
    assert.deepEqual(result, serverReceipt)
    assert.equal(mock.calls.length, 1)
  } finally {
    mock.restore()
  }
})

test('isLocalCacheReceiptV1 and isDocumentCacheReceiptV1 strictly validate receipt shapes', () => {
  const localRec = validLocalReceipt()
  assert.equal(isLocalCacheReceiptV1(localRec), true)
  assert.equal(isLocalCacheReceiptV1({ ...localRec, chunkCount: 0 }), false)
  assert.equal(isLocalCacheReceiptV1({ ...localRec, encryptedBytes: 0 }), false)
  assert.equal(isLocalCacheReceiptV1({ ...localRec, payloadBytes: 0 }), false)
  assert.equal(isLocalCacheReceiptV1({ ...localRec, sourceAssetSha256: 'A'.repeat(64) }), false)
  assert.equal(isLocalCacheReceiptV1({ ...localRec, plainTextSha256: 'B'.repeat(64) }), false)
  assert.equal(isLocalCacheReceiptV1({ ...localRec, payloadSha256: 'C'.repeat(64) }), false)
  assert.equal(isLocalCacheReceiptV1({ ...localRec, cacheId: '' }), false)

  const serverRec = validServerReceipt()
  assert.equal(isDocumentCacheReceiptV1(serverRec), true)
  assert.equal(isDocumentCacheReceiptV1({ ...serverRec, chunkCount: 0 }), false)
  assert.equal(isDocumentCacheReceiptV1({ ...serverRec, encryptedBytes: 0 }), false)
  assert.equal(isDocumentCacheReceiptV1({ ...serverRec, payloadBytes: 0 }), false)
  assert.equal(isDocumentCacheReceiptV1({ ...serverRec, sourceAssetSha256: 'A'.repeat(64) }), false)
  assert.equal(isDocumentCacheReceiptV1({ ...serverRec, plainTextSha256: 'B'.repeat(64) }), false)
  assert.equal(isDocumentCacheReceiptV1({ ...serverRec, payloadSha256: 'C'.repeat(64) }), false)
  assert.equal(isDocumentCacheReceiptV1({ ...serverRec, cacheId: '' }), false)
})
