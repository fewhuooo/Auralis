import assert from 'node:assert/strict'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
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
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentUrl = context.parentURL;
    if (parentUrl && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
      return nextResolve(new URL(specifier + '.ts', parentUrl).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const {
  readLocalAssetBytes,
  documentLocalPackageBegin,
  documentLocalPackageAppend,
  documentLocalPackageFinish,
  documentLocalCacheBind,
  isLocalCacheReceiptV1,
  isDocumentCacheReceiptV1,
} = await import('../src/api/tauri.ts')

const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalRepository } = await import('../src/services/localRepository.ts')
const { LocalAssetRepository } = await import('../src/services/localAssetRepository.ts')
const { LocalParsedDocumentRepository } = await import('../src/services/localParsedDocumentRepository.ts')
const {
  LocalAssetService,
  TauriLocalAssetNativeAdapter,
  TransientBrowserAssetAdapter,
} = await import('../src/services/localAssetService.ts')
const { LocalSourceDraftService } = await import('../src/services/localSourceDraftService.ts')
const { LocalParsedDocumentCoordinator } = await import('../src/services/documentProcessing/LocalParsedDocumentCoordinator.ts')
const { SourceJobScheduler } = await import('../src/services/documentProcessing/sourceJobScheduler.ts')
const { OcrDocumentEmptyError } = await import('../src/services/documentParser/types.ts')

class TemporarySqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:')
  }

  async execute(sql, bindValues = []) {
    this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues)
  }

  async select(sql, bindValues = []) {
    return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues)
  }

  close() {
    this.database.close()
  }
}

function createMemoryStorage() {
  const store = new Map()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => { store.set(key, String(val)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

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

function buildLocalAssetFrame(receipt, fileBytes) {
  const jsonStr = JSON.stringify(receipt)
  const jsonBytes = new TextEncoder().encode(jsonStr)
  const totalLength = 4 + jsonBytes.length + fileBytes.length
  const frame = new Uint8Array(totalLength)
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  view.setUint32(0, jsonBytes.length, false) // Big-endian
  frame.set(jsonBytes, 4)
  frame.set(fileBytes, 4 + jsonBytes.length)
  return frame
}

function validLocalReceipt(overrides = {}) {
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
    ...overrides,
  }
}

function validServerReceipt(overrides = {}) {
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
    ...overrides,
  }
}

// ==========================================
// 1. readLocalAssetBytes & Native Frame Tests
// ==========================================

test('readLocalAssetBytes decodes 4-byte BE length + JSON receipt + file bytes correctly', async () => {
  const content = new TextEncoder().encode('Hello PDF local asset bytes!')
  const hashBuffer = await crypto.subtle.digest('SHA-256', content)
  const sha256 = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const receipt = {
    localAssetId: 'asset-uuid-1',
    safeExtension: 'pdf',
    sizeBytes: content.length,
    sha256,
  }

  const frame = buildLocalAssetFrame(receipt, content)

  const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'read_local_asset_bytes')
    assert.equal(args.command.userScope, 'user-1')
    assert.equal(args.command.deviceId, 'dev-1')
    assert.equal(args.command.localAssetId, 'asset-uuid-1')
    assert.equal(args.command.expectedSize, content.length)
    assert.equal(args.command.expectedSha256, sha256)
    return frame
  })

  try {
    const result = await readLocalAssetBytes({
      userScope: 'user-1',
      deviceId: 'dev-1',
      localAssetId: 'asset-uuid-1',
      expectedSize: content.length,
      expectedSha256: sha256,
    })

    assert.deepEqual(result.receipt, receipt)
    assert.deepEqual(Array.from(result.bytes), Array.from(content))
    assert.equal(tauriMock.calls.length, 1)
  } finally {
    tauriMock.restore()
  }
})

test('readLocalAssetBytes rejects frame < 4 bytes or invalid header length', async () => {
  const tauriMock = setupTauriInvokeMock(async () => new Uint8Array([0, 1, 2])) // 3 bytes
  try {
    await assert.rejects(
      () => readLocalAssetBytes({
        userScope: 'user-1',
        deviceId: 'dev-1',
        localAssetId: 'asset-1',
        expectedSize: 10,
        expectedSha256: 'a'.repeat(64),
      }),
      /LOCAL_ASSET_FRAME_INVALID/
    )
  } finally {
    tauriMock.restore()
  }

  // Header length = 0
  const zeroHeaderFrame = new Uint8Array([0, 0, 0, 0, 1, 2, 3])
  const tauriMockZero = setupTauriInvokeMock(async () => zeroHeaderFrame)
  try {
    await assert.rejects(
      () => readLocalAssetBytes({
        userScope: 'user-1',
        deviceId: 'dev-1',
        localAssetId: 'asset-1',
        expectedSize: 3,
        expectedSha256: 'a'.repeat(64),
      }),
      /LOCAL_ASSET_FRAME_INVALID/
    )
  } finally {
    tauriMockZero.restore()
  }

  // Header length > remaining frame bytes
  const oversizedHeaderFrame = new Uint8Array([0, 0, 0, 100, 1, 2, 3])
  const tauriMockOver = setupTauriInvokeMock(async () => oversizedHeaderFrame)
  try {
    await assert.rejects(
      () => readLocalAssetBytes({
        userScope: 'user-1',
        deviceId: 'dev-1',
        localAssetId: 'asset-1',
        expectedSize: 3,
        expectedSha256: 'a'.repeat(64),
      }),
      /LOCAL_ASSET_FRAME_INVALID/
    )
  } finally {
    tauriMockOver.restore()
  }
})

test('readLocalAssetBytes rejects path leaks in receipt JSON', async () => {
  const content = new Uint8Array([1, 2, 3, 4])
  const sha256 = 'a'.repeat(64)

  const leakCases = [
    { localAssetId: 'asset-1', safeExtension: 'pdf', sizeBytes: 4, sha256, absolutePath: 'C:/secret/path.pdf' },
    { localAssetId: 'asset-1', safeExtension: 'pdf', sizeBytes: 4, sha256, path: '/var/data/path.pdf' },
    { localAssetId: 'asset-1', safeExtension: 'pdf', sizeBytes: 4, sha256, relativePath: 'secret/path.pdf' },
  ]

  for (const receipt of leakCases) {
    const frame = buildLocalAssetFrame(receipt, content)
    const tauriMock = setupTauriInvokeMock(async () => frame)
    try {
      await assert.rejects(
        () => readLocalAssetBytes({
          userScope: 'user-1',
          deviceId: 'dev-1',
          localAssetId: 'asset-1',
          expectedSize: 4,
          expectedSha256: sha256,
        }),
        /LOCAL_ASSET_FRAME_INVALID/
      )
    } finally {
      tauriMock.restore()
    }
  }
})

test('readLocalAssetBytes rejects size or hash mismatch between receipt, command, and payload bytes', async () => {
  const content = new Uint8Array([1, 2, 3, 4, 5])
  const sha256 = 'a'.repeat(64)

  // 1. File bytes length mismatch with receipt.sizeBytes
  const frame1 = buildLocalAssetFrame({
    localAssetId: 'asset-1',
    safeExtension: 'pdf',
    sizeBytes: 10, // claims 10 bytes, payload is 5
    sha256,
  }, content)
  const mock1 = setupTauriInvokeMock(async () => frame1)
  try {
    await assert.rejects(
      () => readLocalAssetBytes({
        userScope: 'user-1', deviceId: 'dev-1', localAssetId: 'asset-1', expectedSize: 10, expectedSha256: sha256,
      }),
      /LOCAL_ASSET_FRAME_INVALID/
    )
  } finally {
    mock1.restore()
  }

  // 2. Receipt SHA mismatch with command expectedSha256
  const frame2 = buildLocalAssetFrame({
    localAssetId: 'asset-1',
    safeExtension: 'pdf',
    sizeBytes: 5,
    sha256: 'b'.repeat(64),
  }, content)
  const mock2 = setupTauriInvokeMock(async () => frame2)
  try {
    await assert.rejects(
      () => readLocalAssetBytes({
        userScope: 'user-1', deviceId: 'dev-1', localAssetId: 'asset-1', expectedSize: 5, expectedSha256: 'a'.repeat(64),
      }),
      /LOCAL_ASSET_FRAME_INVALID/
    )
  } finally {
    mock2.restore()
  }
})

test('LocalAssetService.readAssetBytes: works across Native Tauri and Transient Browser adapters', async () => {
  const content = new TextEncoder().encode('Service read bytes test content')
  const hashBuffer = await crypto.subtle.digest('SHA-256', content)
  const sha256 = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const assetRepo = new LocalAssetRepository('user-svc-1', 'dev-svc-1', { sql: sqlite })

    // Create DB record
    await assetRepo.createAssetFile({
      localAssetId: 'asset-svc-1',
      originalName: 'test.pdf',
      safeExtension: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
      sha256,
      storageType: 'native-tauri',
      relativePath: 'user-svc-1/asset-svc-1/content.pdf',
      state: 'SYNCED',
    })

    // Test with Tauri adapter mock
    const frame = buildLocalAssetFrame({
      localAssetId: 'asset-svc-1',
      safeExtension: 'pdf',
      sizeBytes: content.length,
      sha256,
    }, content)

    const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
      assert.equal(cmd, 'read_local_asset_bytes')
      return frame
    })

    try {
      const service = new LocalAssetService(assetRepo, {
        nativeAdapter: new TauriLocalAssetNativeAdapter(),
      })
      const result = await service.readAssetBytes('asset-svc-1')
      assert.equal(result.receipt.localAssetId, 'asset-svc-1')
      assert.equal(result.receipt.sizeBytes, content.length)
      assert.deepEqual(Array.from(result.bytes), Array.from(content))
    } finally {
      tauriMock.restore()
    }

    // Test with Browser Transient adapter
    const browserAdapter = new TransientBrowserAssetAdapter()
    await browserAdapter.importAsset({
      userId: 'user-svc-1',
      serverDeviceId: 'dev-svc-1',
      localAssetId: 'asset-browser-1',
      file: new File([content], 'test.pdf', { type: 'application/pdf' }),
      originalName: 'test.pdf',
      mimeType: 'application/pdf',
      safeExtension: 'pdf',
      expectedSize: content.length,
      expectedSha256: sha256,
    })

    await assetRepo.createAssetFile({
      localAssetId: 'asset-browser-1',
      originalName: 'test.pdf',
      safeExtension: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
      sha256,
      storageType: 'transient-browser',
      relativePath: 'user-svc-1/asset-browser-1/content.pdf',
      state: 'SYNCED',
    })

    const browserService = new LocalAssetService(assetRepo, {
      nativeAdapter: browserAdapter,
    })

    const browserResult = await browserService.readAssetBytes('asset-browser-1')
    assert.equal(browserResult.receipt.localAssetId, 'asset-browser-1')
    assert.equal(browserResult.receipt.sizeBytes, content.length)
    assert.equal(browserResult.receipt.sha256, sha256)
    assert.deepEqual(Array.from(browserResult.bytes), Array.from(content))
  } finally {
    sqlite.close()
  }
})

// =======================================================
// 2. LocalParsedDocumentCoordinator Unit & Flow Tests
// =======================================================

test('LocalParsedDocumentCoordinator: parses local draft offline, streams blocks, and transitions to WAITING_SERVER_REVISION with 0 HTTP calls', async () => {
  const content = new TextEncoder().encode('Offline lecture content on linear algebra')
  const hashBuffer = await crypto.subtle.digest('SHA-256', content)
  const sha256 = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const parsedRepo = new LocalParsedDocumentRepository('user-offline', 'device-offline', { sql: sqlite })

    const appendedBlocks = []
    let packageBegun = false
    let packageFinished = false

    const receipt = validLocalReceipt({
      localSourceId: 'src-offline-1',
      localContentRevision: 'rev-offline-1',
      sourceAssetSha256: sha256,
      parserId: 'auralis-document-parser',
      normalizationVersion: 'nfkc-lf-trim',
    })

    const packager = {
      async begin(header) {
        packageBegun = true
        assert.equal(header.userId, 'user-offline')
        assert.equal(header.localSourceId, 'src-offline-1')
        assert.equal(header.sourceAssetSha256, sha256)
        return 'pkg-123'
      },
      async append(packageId, block) {
        assert.equal(packageId, 'pkg-123')
        appendedBlocks.push(block)
      },
      async finish(packageId) {
        assert.equal(packageId, 'pkg-123')
        packageFinished = true
        return receipt
      },
    }

    let parsedFileReceived = null
    const coordinator = new LocalParsedDocumentCoordinator({
      repository: parsedRepo,
      readAssetBytes: async (localAssetId, expectedSize, expectedSha) => {
        assert.equal(localAssetId, 'asset-offline-1')
        assert.equal(expectedSha, sha256)
        return {
          receipt: {
            localAssetId,
            safeExtension: 'pdf',
            sizeBytes: content.length,
            sha256,
          },
          bytes: content,
        }
      },
      packager,
      parserFactory: (_record, file) => {
        parsedFileReceived = file
        return async (sink, _onProgress) => {
          await sink({ ordinal: 0, kind: 'page', text: 'Page 1 text', pageNumber: 1 })
          await sink({ ordinal: 1, kind: 'ocr-page', text: 'OCR page 2 text', pageNumber: 2 })
        }
      },
    })

    const record = await coordinator.coordinate({
      localSourceId: 'src-offline-1',
      localContentRevision: 'rev-offline-1',
      localAssetId: 'asset-offline-1',
      sourceAssetSha256: sha256,
      originalName: 'lecture.pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
    })

    assert.equal(packageBegun, true)
    assert.equal(packageFinished, true)
    assert.equal(appendedBlocks.length, 2)
    assert.equal(parsedFileReceived?.name, 'lecture.pdf')
    assert.equal(record.phase, 'WAITING_SERVER_REVISION')
    assert.equal(record.localCacheId, receipt.cacheId)
    assert.deepEqual(record.localReceipt, receipt)

    // Verify stored in DB
    const fetched = await parsedRepo.get('src-offline-1', 'rev-offline-1')
    assert.ok(fetched)
    assert.equal(fetched.phase, 'WAITING_SERVER_REVISION')
    assert.equal(fetched.localCacheId, receipt.cacheId)
  } finally {
    sqlite.close()
  }
})

test('LocalParsedDocumentCoordinator: idempotent coordinate returns existing record with ZERO OCR re-runs and ZERO byte reads', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const parsedRepo = new LocalParsedDocumentRepository('user-idemp', 'device-idemp', { sql: sqlite })

    const receipt = validLocalReceipt({
      localSourceId: 'src-idemp-1',
      localContentRevision: 'rev-idemp-1',
      sourceAssetSha256: 'a'.repeat(64),
    })

    // Pre-seed record in WAITING_SERVER_REVISION with valid receipt
    await parsedRepo.create({
      localSourceId: 'src-idemp-1',
      localContentRevision: 'rev-idemp-1',
      localAssetId: 'asset-idemp-1',
      sourceAssetSha256: 'a'.repeat(64),
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    })
    await parsedRepo.updatePhase('src-idemp-1', 'rev-idemp-1', 'EXTRACTING')
    await parsedRepo.updatePhase('src-idemp-1', 'rev-idemp-1', 'LOCAL_PARSED_READY', {
      localCacheId: receipt.cacheId,
      localReceipt: receipt,
    })
    await parsedRepo.updatePhase('src-idemp-1', 'rev-idemp-1', 'WAITING_SERVER_REVISION')

    let byteReads = 0
    let parserInvocations = 0

    const coordinator = new LocalParsedDocumentCoordinator({
      repository: parsedRepo,
      readAssetBytes: async () => {
        byteReads += 1
        throw new Error('SHOULD_NOT_READ_BYTES')
      },
      parserFactory: () => {
        parserInvocations += 1
        throw new Error('SHOULD_NOT_RUN_PARSER')
      },
    })

    const record = await coordinator.coordinate({
      localSourceId: 'src-idemp-1',
      localContentRevision: 'rev-idemp-1',
      localAssetId: 'asset-idemp-1',
      sourceAssetSha256: 'a'.repeat(64),
    })

    assert.equal(record.phase, 'WAITING_SERVER_REVISION')
    assert.equal(record.localCacheId, receipt.cacheId)
    assert.equal(byteReads, 0, 'Zero asset byte reads must occur on reboot/restart')
    assert.equal(parserInvocations, 0, 'Zero OCR/parser invocations must occur on reboot/restart')
  } finally {
    sqlite.close()
  }
})

test('LocalParsedDocumentCoordinator: cancellation aborts packaging and marks DOCUMENT_CANCELLED', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const parsedRepo = new LocalParsedDocumentRepository('user-cancel', 'device-cancel', { sql: sqlite })

    let abortedPackageId = null
    const packager = {
      async begin() { return 'pkg-to-cancel' },
      async append() {},
      async finish() { throw new Error('SHOULD_NOT_FINISH') },
      async abort(pkgId) { abortedPackageId = pkgId },
    }

    const coordinator = new LocalParsedDocumentCoordinator({
      repository: parsedRepo,
      readAssetBytes: async (id) => ({
        receipt: { localAssetId: id, safeExtension: 'pdf', sizeBytes: 10, sha256: 'a'.repeat(64) },
        bytes: new Uint8Array(10),
      }),
      packager,
      parserFactory: () => {
        return async (_sink) => {
          // Cancel while parsing
          await coordinator.cancel('src-cancel-1')
          throw new Error('DOCUMENT_CANCELLED')
        }
      },
    })

    const record = await coordinator.coordinate({
      localSourceId: 'src-cancel-1',
      localContentRevision: 'rev-cancel-1',
      localAssetId: 'asset-cancel-1',
      sourceAssetSha256: 'a'.repeat(64),
    })

    assert.equal(abortedPackageId, 'pkg-to-cancel')
    assert.equal(record.phase, 'FAILED_LOCAL')
    assert.equal(record.safeErrorCode, 'DOCUMENT_CANCELLED')
  } finally {
    sqlite.close()
  }
})

test('LocalParsedDocumentCoordinator: network error transitions to PAUSED_NETWORK; empty doc marks OCR_DOCUMENT_EMPTY', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const parsedRepo = new LocalParsedDocumentRepository('user-err', 'device-err', { sql: sqlite })

    // 1. Network failure
    const networkCoordinator = new LocalParsedDocumentCoordinator({
      repository: parsedRepo,
      readAssetBytes: async (id) => ({
        receipt: { localAssetId: id, safeExtension: 'pdf', sizeBytes: 10, sha256: 'a'.repeat(64) },
        bytes: new Uint8Array(10),
      }),
      packager: {
        begin: async () => 'pkg-network',
        append: async () => {},
        finish: async () => { throw new Error('SHOULD_NOT_FINISH') },
        abort: async () => {},
      },
      parserFactory: () => {
        return async () => {
          throw new Error('fetch failed: NETWORK_OFFLINE')
        }
      },
    })

    const pausedRecord = await networkCoordinator.coordinate({
      localSourceId: 'src-net-1',
      localContentRevision: 'rev-net-1',
      localAssetId: 'asset-net-1',
      sourceAssetSha256: 'a'.repeat(64),
    })
    assert.equal(pausedRecord.phase, 'PAUSED_NETWORK')
    assert.equal(pausedRecord.safeErrorCode, 'NETWORK_OFFLINE')

    // 2. Empty OCR document
    const emptyCoordinator = new LocalParsedDocumentCoordinator({
      repository: parsedRepo,
      readAssetBytes: async (id) => ({
        receipt: { localAssetId: id, safeExtension: 'pdf', sizeBytes: 10, sha256: 'a'.repeat(64) },
        bytes: new Uint8Array(10),
      }),
      packager: {
        begin: async () => 'pkg-empty',
        append: async () => {},
        finish: async () => { throw new Error('SHOULD_NOT_FINISH') },
        abort: async () => {},
      },
      parserFactory: () => {
        return async () => {
          throw new OcrDocumentEmptyError('Blank scanned pages')
        }
      },
    })

    const emptyRecord = await emptyCoordinator.coordinate({
      localSourceId: 'src-empty-1',
      localContentRevision: 'rev-empty-1',
      localAssetId: 'asset-empty-1',
      sourceAssetSha256: 'a'.repeat(64),
    })
    assert.equal(emptyRecord.phase, 'FAILED_LOCAL')
    assert.equal(emptyRecord.safeErrorCode, 'OCR_DOCUMENT_EMPTY')
  } finally {
    sqlite.close()
  }
})

// =======================================================
// 3. SourceJobScheduler Integration & Rebinding Tests
// =======================================================

test('SourceJobScheduler: offline draft scheduling coordinates local parse and returns WAITING_SERVER_REVISION with 0 HTTP calls', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-sched', 'device-sched', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-sched', 'device-sched', { sql: sqlite })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)
    const parsedRepo = new LocalParsedDocumentRepository('user-sched', 'device-sched', { sql: sqlite })

    const content = new TextEncoder().encode('quantum draft offline')
    const hashBuffer = await crypto.subtle.digest('SHA-256', content)
    const sha256 = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

    // Create asset & draft offline
    await assetRepo.createAssetFile({
      localAssetId: 'asset-draft-1',
      originalName: 'quantum.pdf',
      safeExtension: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
      sha256,
      storageType: 'native-tauri',
      relativePath: 'user-sched/asset-draft-1/content.pdf',
      state: 'READY_LOCAL',
    })

    const localContentRevision = '01990000-0000-7000-8000-000000000001'
    await draftService.createDraft({
      localSourceId: 'source-draft-1',
      subjectId: 'sub-1',
      title: 'Quantum Draft',
      localAssetId: 'asset-draft-1',
      catalogJson: '[]',
      localContentRevision,
    })

    let coordinateCalled = false
    const coordinator = new LocalParsedDocumentCoordinator({
      repository: parsedRepo,
      readAssetBytes: async () => ({
        receipt: { localAssetId: 'asset-draft-1', safeExtension: 'pdf', sizeBytes: content.length, sha256 },
        bytes: content,
      }),
      packager: {
        begin: async () => 'pkg-draft-1',
        append: async () => {},
        finish: async () => validLocalReceipt({
          localSourceId: 'source-draft-1',
          localContentRevision,
          sourceAssetSha256: sha256,
          parserId: 'auralis-document-parser',
          normalizationVersion: 'nfkc-lf-trim',
        }),
      },
      parserFactory: () => {
        coordinateCalled = true
        return async (sink) => {
          await sink({ ordinal: 0, kind: 'page', text: 'quantum mechanics page' })
        }
      },
    })

    let httpGetCalls = 0
    const scheduler = new SourceJobScheduler({
      repository: {
        create: async () => { throw new Error('NO_SERVER_JOB_ON_OFFLINE_DRAFT') },
        get: async () => null,
        list: async () => [],
        removeBySource: async () => [],
        remove: async () => null,
        transition: async () => { throw new Error('NO_SERVER_JOB_ON_OFFLINE_DRAFT') },
      },
      sourceApi: {
        async get() {
          httpGetCalls += 1
          throw new Error('NO_HTTP_CALLS_ALLOWED_FOR_OFFLINE_DRAFT')
        },
      },
      upload: {
        async upload() { throw new Error('NO_UPLOAD_FOR_OFFLINE_DRAFT') },
      },
      localDraftService: draftService,
      localParsedRepo: parsedRepo,
      localAssetRepo: assetRepo,
      localParsedCoordinator: coordinator,
      downloadAsset: async () => { throw new Error('NO_DOWNLOAD') },
      hashFile: async () => sha256,
      prepareInput: async () => {},
      runJob: async () => {},
    })

    const result = await scheduler.schedule('source-draft-1')

    assert.equal(result.status, 'WAITING_SERVER_REVISION')
    assert.equal(coordinateCalled, true)
    assert.equal(httpGetCalls, 0, 'Zero HTTP calls must be made while scheduling offline draft')

    const localRecord = await parsedRepo.get('source-draft-1', localContentRevision)
    assert.ok(localRecord)
    assert.equal(localRecord.phase, 'WAITING_SERVER_REVISION')
  } finally {
    sqlite.close()
  }
})

test('SourceJobScheduler: rebinding server ingestion revision reuses local receipt with ZERO OCR re-runs', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-rebind', 'device-rebind', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-rebind', 'device-rebind', { sql: sqlite })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)
    const parsedRepo = new LocalParsedDocumentRepository('user-rebind', 'device-rebind', { sql: sqlite })

    const sha256 = 'd'.repeat(64)
    const localReceipt = validLocalReceipt({
      cacheId: 'loc-cache-reb-1',
      localSourceId: 'source-reb-1',
      localContentRevision: 'rev-reb-1',
      sourceAssetSha256: sha256,
    })

    // Pre-seed local parsed record in WAITING_SERVER_REVISION
    await parsedRepo.create({
      localSourceId: 'source-reb-1',
      localContentRevision: 'rev-reb-1',
      localAssetId: 'asset-reb-1',
      sourceAssetSha256: sha256,
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    })
    await parsedRepo.updatePhase('source-reb-1', 'rev-reb-1', 'EXTRACTING')
    await parsedRepo.updatePhase('source-reb-1', 'rev-reb-1', 'LOCAL_PARSED_READY', {
      localCacheId: localReceipt.cacheId,
      localReceipt,
    })
    await parsedRepo.updatePhase('source-reb-1', 'rev-reb-1', 'WAITING_SERVER_REVISION')
    await parsedRepo.bindServerRevision({
      localSourceId: 'source-reb-1',
      localContentRevision: 'rev-reb-1',
      serverSourceId: 'source-reb-1',
      serverIngestionRevision: 'ingestion-rev-server-1',
      sourceAssetSha256: sha256,
    })

    // Mock DocumentProcessingJob repository
    const serverJobs = new Map()
    const jobRepo = {
      async create(input) {
        const job = {
          jobId: input.jobId,
          sourceId: input.sourceId,
          ingestionRevision: input.ingestionRevision,
          phase: 'QUEUED',
          attempt: 0,
          payloadCacheId: null,
          payloadReceipt: null,
        }
        serverJobs.set(job.jobId, job)
        return structuredClone(job)
      },
      async get(jobId) {
        return serverJobs.get(jobId) ? structuredClone(serverJobs.get(jobId)) : null
      },
      async list() {
        return [...serverJobs.values()].map((j) => structuredClone(j))
      },
      async removeBySource(srcId) {
        const removed = [...serverJobs.values()].filter((j) => j.sourceId === srcId)
        for (const j of removed) serverJobs.delete(j.jobId)
        return removed
      },
      async remove(jobId) {
        const job = serverJobs.get(jobId)
        if (job) serverJobs.delete(jobId)
        return job ? structuredClone(job) : null
      },
      async transition(jobId, phase, options = {}) {
        const job = serverJobs.get(jobId)
        if (!job) throw new Error('JOB_NOT_FOUND')
        const legal = {
          QUEUED: ['UPLOADING', 'FAILED_LOCAL'],
          UPLOADING: ['SERVER_VALIDATING', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'FAILED_SERVER'],
          SERVER_VALIDATING: ['SERVER_INDEXING', 'PAUSED_NETWORK', 'FAILED_SERVER'],
          SERVER_INDEXING: ['READY', 'PAUSED_NETWORK', 'FAILED_SERVER'],
          READY: [],
        }
        if (job.phase !== phase && !legal[job.phase]?.includes(phase)) {
          throw new Error(`DOCUMENT_JOB_ILLEGAL_TRANSITION:${job.phase}->${phase}`)
        }
        job.phase = phase
        if (options.payloadCacheId !== undefined) job.payloadCacheId = options.payloadCacheId
        if (options.payloadReceipt !== undefined) job.payloadReceipt = options.payloadReceipt
        return structuredClone(job)
      },
    }

    let bindLocalCacheCalls = 0
    let ocrRunCalls = 0
    let uploadCalled = false
    let uploadedReceipt = null
    let uploadedMetadata = null
    const deletedCaches = []

    const serverReceipt = validServerReceipt({
      cacheId: 'server-bound-cache-1',
      sourceAssetSha256: sha256,
    })

    const scheduler = new SourceJobScheduler({
      repository: jobRepo,
      sourceApi: {
        async get(sourceId) {
          assert.equal(sourceId, 'source-reb-1')
          return {
            id: 'source-reb-1',
            type: 'FILE',
            title: 'Rebound Lecture.pdf',
            assetId: 'asset-server-1',
            ingestionStatus: 'AWAITING_CLIENT',
            ingestionRevision: 'ingestion-rev-server-1',
          }
        },
      },
      upload: {
        async upload(jobId, receipt, metadata) {
          uploadCalled = true
          uploadedReceipt = receipt
          uploadedMetadata = metadata
          await jobRepo.transition(jobId, 'SERVER_VALIDATING', {
            payloadCacheId: receipt.cacheId,
            payloadReceipt: receipt,
          })
          await jobRepo.transition(jobId, 'SERVER_INDEXING')
          await jobRepo.transition(jobId, 'READY')
          return { status: 'ACCEPTED' }
        },
      },
      localParsedRepo: parsedRepo,
      localAssetRepo: assetRepo,
      bindLocalCache: async (request) => {
        bindLocalCacheCalls += 1
        assert.equal(request.localCacheId, 'loc-cache-reb-1')
        assert.equal(request.localSourceId, 'source-reb-1')
        assert.equal(request.localContentRevision, 'rev-reb-1')
        assert.equal(request.ingestionRevision, 'ingestion-rev-server-1')
        assert.equal(request.sourceAssetSha256, sha256)
        assert.equal('blocks' in request, false)
        return serverReceipt
      },
      downloadAsset: async () => { throw new Error('SHOULD_NOT_DOWNLOAD') },
      hashFile: async () => { throw new Error('SHOULD_NOT_HASH') },
      expectedAssetSha256: async () => sha256,
      prepareInput: async () => { throw new Error('SHOULD_NOT_PREPARE') },
      runJob: async () => { ocrRunCalls += 1 },
      deleteCache: async (id) => { deletedCaches.push(id) },
    })

    const result = await scheduler.schedule('source-reb-1')

    assert.equal(result.status, 'READY')
    assert.equal(bindLocalCacheCalls, 1)
    assert.equal(ocrRunCalls, 0, 'Zero OCR/parser re-runs must occur during rebinding')
    assert.equal(uploadCalled, true)
    assert.deepEqual(uploadedReceipt, serverReceipt)
    assert.equal(uploadedMetadata.sourceAssetSha256, sha256)
    assert.deepEqual(deletedCaches, ['server-bound-cache-1'], 'Derived cache cleaned after READY')

    // Verify local parsed repo is now in READY
    const finalLocalRecord = await parsedRepo.get('source-reb-1', 'rev-reb-1')
    assert.ok(finalLocalRecord)
    assert.equal(finalLocalRecord.phase, 'READY')
  } finally {
    sqlite.close()
  }
})

test('SourceJobScheduler: rebinding rejects on SHA mismatch and fails local job without binding or upload', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const localRepo = new LocalRepository('user-mismatch', 'device-mismatch', { sql: sqlite })
    const assetRepo = new LocalAssetRepository('user-mismatch', 'device-mismatch', { sql: sqlite })
    const draftService = new LocalSourceDraftService(assetRepo, localRepo)
    const parsedRepo = new LocalParsedDocumentRepository('user-mismatch', 'device-mismatch', { sql: sqlite })

    const localSha = 'a'.repeat(64)
    const serverExpectedSha = 'b'.repeat(64) // Mismatch!

    const localReceipt = validLocalReceipt({
      localSourceId: 'source-mis-1',
      localContentRevision: 'rev-mis-1',
      sourceAssetSha256: localSha,
    })

    await parsedRepo.create({
      localSourceId: 'source-mis-1',
      localContentRevision: 'rev-mis-1',
      localAssetId: 'asset-mis-1',
      sourceAssetSha256: localSha,
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    })
    await parsedRepo.updatePhase('source-mis-1', 'rev-mis-1', 'EXTRACTING')
    await parsedRepo.updatePhase('source-mis-1', 'rev-mis-1', 'LOCAL_PARSED_READY', {
      localCacheId: localReceipt.cacheId,
      localReceipt,
    })
    await parsedRepo.updatePhase('source-mis-1', 'rev-mis-1', 'WAITING_SERVER_REVISION')
    await parsedRepo.bindServerRevision({
      localSourceId: 'source-mis-1',
      localContentRevision: 'rev-mis-1',
      serverSourceId: 'source-mis-1',
      serverIngestionRevision: 'ingestion-rev-mis-1',
      sourceAssetSha256: localSha,
    })

    const serverJobs = new Map()
    const jobRepo = {
      async create(input) {
        const job = { jobId: input.jobId, sourceId: input.sourceId, ingestionRevision: input.ingestionRevision, phase: 'QUEUED' }
        serverJobs.set(job.jobId, job)
        return structuredClone(job)
      },
      async get(jobId) { return serverJobs.get(jobId) ?? null },
      async list() { return [...serverJobs.values()] },
      async removeBySource() { return [] },
      async remove() { return null },
      async transition(jobId, phase, options = {}) {
        const job = serverJobs.get(jobId)
        job.phase = phase
        if (options.errorCode) job.errorCode = options.errorCode
        return structuredClone(job)
      },
    }

    let bindCalled = false
    let uploadCalled = false

    const scheduler = new SourceJobScheduler({
      repository: jobRepo,
      sourceApi: {
        async get() {
          return {
            id: 'source-mis-1',
            type: 'FILE',
            title: 'Mismatch.pdf',
            assetId: 'asset-mis-1',
            ingestionStatus: 'AWAITING_CLIENT',
            ingestionRevision: 'ingestion-rev-mis-1',
          }
        },
      },
      upload: {
        async upload() { uploadCalled = true },
      },
      localParsedRepo: parsedRepo,
      localAssetRepo: assetRepo,
      bindLocalCache: async () => {
        bindCalled = true
        return validServerReceipt()
      },
      expectedAssetSha256: async () => serverExpectedSha,
      downloadAsset: async () => { throw new Error('NO_DOWNLOAD') },
      hashFile: async () => { throw new Error('NO_HASH') },
      prepareInput: async () => {},
      runJob: async () => {},
    })

    const result = await scheduler.schedule('source-mis-1')

    assert.equal(result.status, 'FAILED_LOCAL')
    assert.equal(result.reason, 'SOURCE_ASSET_SHA_MISMATCH')
    assert.equal(bindCalled, false, 'bindLocalCache must NOT be called on SHA mismatch')
    assert.equal(uploadCalled, false, 'upload must NOT be called on SHA mismatch')
  } finally {
    sqlite.close()
  }
})

test('SourceJobScheduler: resumed rebound upload advances the local parsed record from PAUSED_NETWORK to READY', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const parsedRepo = new LocalParsedDocumentRepository('user-resume', 'device-resume', { sql: sqlite })
    const sha256 = 'e'.repeat(64)
    const localReceipt = validLocalReceipt({
      cacheId: 'local-resume-cache',
      localSourceId: 'source-resume',
      localContentRevision: 'revision-resume',
      sourceAssetSha256: sha256,
    })
    const serverReceipt = validServerReceipt({ cacheId: 'server-resume-cache', sourceAssetSha256: sha256 })
    await parsedRepo.create({
      localSourceId: 'source-resume',
      localContentRevision: 'revision-resume',
      localAssetId: 'asset-resume',
      sourceAssetSha256: sha256,
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    })
    await parsedRepo.updatePhase('source-resume', 'revision-resume', 'EXTRACTING')
    await parsedRepo.updatePhase('source-resume', 'revision-resume', 'LOCAL_PARSED_READY', {
      localCacheId: localReceipt.cacheId,
      localReceipt,
    })
    await parsedRepo.updatePhase('source-resume', 'revision-resume', 'WAITING_SERVER_REVISION')
    await parsedRepo.bindServerRevision({
      localSourceId: 'source-resume',
      localContentRevision: 'revision-resume',
      serverSourceId: 'source-resume',
      serverIngestionRevision: 'server-revision-resume',
      sourceAssetSha256: sha256,
    })
    await parsedRepo.updatePhase('source-resume', 'revision-resume', 'REPACKAGING')
    await parsedRepo.updatePhase('source-resume', 'revision-resume', 'UPLOADING', {
      serverCacheId: serverReceipt.cacheId,
      serverReceipt,
    })
    await parsedRepo.updatePhase('source-resume', 'revision-resume', 'PAUSED_NETWORK')

    const job = {
      jobId: 'job-resume',
      sourceId: 'source-resume',
      ingestionRevision: 'server-revision-resume',
      phase: 'PAUSED_NETWORK',
      attempt: 0,
      payloadCacheId: serverReceipt.cacheId,
      payloadReceipt: serverReceipt,
    }
    const jobRepo = {
      async create() { throw new Error('SHOULD_REUSE_JOB') },
      async get(id) { return id === job.jobId ? structuredClone(job) : null },
      async list() { return [structuredClone(job)] },
      async removeBySource() { return [] },
      async remove() { return null },
      async transition(id, phase, options = {}) {
        assert.equal(id, job.jobId)
        job.phase = phase
        Object.assign(job, options)
        return structuredClone(job)
      },
    }
    let uploadCalls = 0
    const scheduler = new SourceJobScheduler({
      repository: jobRepo,
      sourceApi: { async get() {
        return {
          id: 'source-resume', type: 'FILE', title: 'Resume.pdf', assetId: 'asset-server-resume',
          ingestionStatus: 'AWAITING_CLIENT', ingestionRevision: 'server-revision-resume',
        }
      } },
      upload: { async upload(id) {
        uploadCalls += 1
        await jobRepo.transition(id, 'SERVER_VALIDATING')
        await jobRepo.transition(id, 'SERVER_INDEXING')
        await jobRepo.transition(id, 'READY')
        return { status: 'ACCEPTED' }
      } },
      localParsedRepo: parsedRepo,
      downloadAsset: async () => { throw new Error('SHOULD_NOT_DOWNLOAD') },
      hashFile: async () => { throw new Error('SHOULD_NOT_HASH') },
      prepareInput: async () => { throw new Error('SHOULD_NOT_PREPARE') },
      runJob: async () => { throw new Error('SHOULD_NOT_PARSE') },
    })

    const result = await scheduler.schedule('source-resume')
    assert.equal(result.status, 'READY')
    assert.equal(uploadCalls, 1)
    assert.equal((await parsedRepo.get('source-resume', 'revision-resume'))?.phase, 'READY')
  } finally {
    sqlite.close()
  }
})

test('SourceJobScheduler: discard deletes the native local parsed cache before removing metadata', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const parsedRepo = new LocalParsedDocumentRepository('user-delete', 'device-delete', { sql: sqlite })
    const receipt = validLocalReceipt({ localSourceId: 'source-delete', localContentRevision: 'revision-delete' })
    await parsedRepo.create({
      localSourceId: 'source-delete',
      localContentRevision: 'revision-delete',
      localAssetId: 'asset-delete',
      sourceAssetSha256: 'a'.repeat(64),
      parserId: 'test-parser',
      parserVersion: '1.0.0',
      normalizationVersion: '1.0.0',
    })
    await parsedRepo.updatePhase('source-delete', 'revision-delete', 'EXTRACTING')
    await parsedRepo.updatePhase('source-delete', 'revision-delete', 'LOCAL_PARSED_READY', {
      localCacheId: receipt.cacheId,
      localReceipt: receipt,
    })
    const deleted = []
    const scheduler = new SourceJobScheduler({
      repository: {
        async create() { throw new Error('UNUSED') }, async get() { return null }, async list() { return [] },
        async removeBySource() { return [] }, async remove() { return null }, async transition() { throw new Error('UNUSED') },
      },
      sourceApi: { async get() { throw new Error('UNUSED') } },
      upload: { async upload() { throw new Error('UNUSED') } },
      localParsedRepo: parsedRepo,
      deleteLocalCache: async (cacheId) => { deleted.push(cacheId) },
      downloadAsset: async () => { throw new Error('UNUSED') },
      hashFile: async () => '', prepareInput: async () => {}, runJob: async () => {},
    })
    await scheduler.discard('source-delete')
    assert.deepEqual(deleted, [receipt.cacheId])
    assert.deepEqual(await parsedRepo.listBySource('source-delete'), [])
  } finally {
    sqlite.close()
  }
})

test('SourceJobScheduler: stale server revision rebinds an UPLOADING local record without rerunning OCR', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const parsedRepo = new LocalParsedDocumentRepository('user-stale', 'device-stale', { sql: sqlite })
    const sha256 = 'f'.repeat(64)
    const localReceipt = validLocalReceipt({
      cacheId: 'local-stale-cache', localSourceId: 'source-stale',
      localContentRevision: 'local-revision-stale', sourceAssetSha256: sha256,
    })
    const oldServerReceipt = validServerReceipt({ cacheId: 'server-old-cache', sourceAssetSha256: sha256 })
    const newServerReceipt = validServerReceipt({ cacheId: 'server-new-cache', sourceAssetSha256: sha256 })
    await parsedRepo.create({
      localSourceId: 'source-stale', localContentRevision: 'local-revision-stale', localAssetId: 'asset-stale',
      sourceAssetSha256: sha256, parserId: 'test-parser', parserVersion: '1.0.0', normalizationVersion: '1.0.0',
    })
    await parsedRepo.updatePhase('source-stale', 'local-revision-stale', 'EXTRACTING')
    await parsedRepo.updatePhase('source-stale', 'local-revision-stale', 'LOCAL_PARSED_READY', {
      localCacheId: localReceipt.cacheId, localReceipt,
    })
    await parsedRepo.updatePhase('source-stale', 'local-revision-stale', 'WAITING_SERVER_REVISION')
    await parsedRepo.bindServerRevision({
      localSourceId: 'source-stale', localContentRevision: 'local-revision-stale',
      serverSourceId: 'source-stale', serverIngestionRevision: 'server-revision-old', sourceAssetSha256: sha256,
    })
    await parsedRepo.updatePhase('source-stale', 'local-revision-stale', 'REPACKAGING')
    await parsedRepo.updatePhase('source-stale', 'local-revision-stale', 'UPLOADING', {
      serverCacheId: oldServerReceipt.cacheId, serverReceipt: oldServerReceipt,
    })

    const jobs = new Map()
    const jobRepo = {
      async create(input) {
        const job = { ...input, phase: 'QUEUED', attempt: 0, payloadCacheId: null, payloadReceipt: null }
        jobs.set(job.jobId, job)
        return structuredClone(job)
      },
      async get(id) { return jobs.has(id) ? structuredClone(jobs.get(id)) : null },
      async list() { return [...jobs.values()].map((job) => structuredClone(job)) },
      async removeBySource() { return [] }, async remove() { return null },
      async transition(id, phase, options = {}) {
        const job = jobs.get(id)
        job.phase = phase
        Object.assign(job, options)
        return structuredClone(job)
      },
    }
    let bindCalls = 0
    let parserCalls = 0
    const scheduler = new SourceJobScheduler({
      repository: jobRepo,
      sourceApi: { async get() {
        return { id: 'source-stale', type: 'FILE', title: 'Stale.pdf', assetId: 'server-asset-stale',
          ingestionStatus: 'AWAITING_CLIENT', ingestionRevision: 'server-revision-new' }
      } },
      upload: { async upload(id) {
        await jobRepo.transition(id, 'SERVER_VALIDATING')
        await jobRepo.transition(id, 'SERVER_INDEXING')
        await jobRepo.transition(id, 'READY')
        return { status: 'ACCEPTED' }
      } },
      localDraftService: {
        async getDraft() { return {
          localSourceId: 'source-stale', localContentRevision: 'local-revision-stale', localAssetId: 'asset-stale',
          title: 'Stale.pdf', state: 'SYNCED', serverIngestionRevision: 'server-revision-old',
        } },
        async bindServerIngestionRevision() { return {} },
      },
      localParsedRepo: parsedRepo,
      bindLocalCache: async () => { bindCalls += 1; return newServerReceipt },
      expectedAssetSha256: async () => sha256,
      downloadAsset: async () => { throw new Error('SHOULD_NOT_DOWNLOAD') },
      hashFile: async () => { throw new Error('SHOULD_NOT_HASH') },
      prepareInput: async () => { throw new Error('SHOULD_NOT_PREPARE') },
      runJob: async () => { parserCalls += 1 },
    })

    const result = await scheduler.schedule('source-stale')
    assert.equal(result.status, 'READY')
    assert.equal(bindCalls, 1)
    assert.equal(parserCalls, 0)
    const record = await parsedRepo.get('source-stale', 'local-revision-stale')
    assert.equal(record?.serverIngestionRevision, 'server-revision-new')
    assert.equal(record?.serverCacheId, 'server-new-cache')
    assert.equal(record?.phase, 'READY')
  } finally {
    sqlite.close()
  }
})
