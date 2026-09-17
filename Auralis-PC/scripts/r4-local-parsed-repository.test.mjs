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
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalParsedDocumentRepository } = await import('../src/services/localParsedDocumentRepository.ts')

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

function validLocalReceipt(overrides = {}) {
  return {
    cacheId: 'local-cache-1',
    envelopeVersion: 1,
    chunkCount: 2,
    encryptedBytes: 4096,
    plainTextSha256: 'b'.repeat(64),
    payloadSha256: 'c'.repeat(64),
    payloadBytes: 2048,
    localSourceId: 'src-1',
    localContentRevision: 'loc-rev-1',
    sourceAssetSha256: 'a'.repeat(64),
    payloadFormat: 'parsed-document-local-v1',
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    normalizationVersion: '1.0.0',
    ocrModelVersion: null,
    ...overrides,
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

const backends = [
  {
    name: 'SQLite backend',
    setup: async () => {
      const sqlite = new TemporarySqlite()
      await createVersionedLocalSchema(sqlite)
      const repo = new LocalParsedDocumentRepository('user-1', 'device-1', { sql: sqlite })
      return { repo, sql: sqlite, cleanup: () => sqlite.close() }
    },
    createSecondRepo: (ctx) => new LocalParsedDocumentRepository('user-1', 'device-1', { sql: ctx.sql }),
  },
  {
    name: 'Browser Storage fallback',
    setup: async () => {
      const storage = createMemoryStorage()
      const repo = new LocalParsedDocumentRepository('user-1', 'device-1', { storage })
      return { repo, storage, cleanup: () => {} }
    },
    createSecondRepo: (ctx) => new LocalParsedDocumentRepository('user-1', 'device-1', { storage: ctx.storage }),
  },
]

for (const backend of backends) {
  test(`${backend.name}: creates, retrieves and lists local parsed documents with user/device scoping`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      const created = await repo.create({
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
        ocrModelVersion: null,
      })

      assert.equal(created.userId, 'user-1')
      assert.equal(created.serverDeviceId, 'device-1')
      assert.equal(created.localSourceId, 'src-1')
      assert.equal(created.localContentRevision, 'loc-rev-1')
      assert.equal(created.phase, 'QUEUED')
      assert.equal(created.attempt, 0)
      assert.equal(created.checkpointPage, 0)
      assert.equal(created.checkpointOrdinal, 0)

      const fetched = await repo.get('src-1', 'loc-rev-1')
      assert.ok(fetched)
      assert.equal(fetched.localAssetId, 'asset-1')

      // List by source
      const bySource = await repo.listBySource('src-1')
      assert.equal(bySource.length, 1)
      assert.equal(bySource[0].localContentRevision, 'loc-rev-1')

      // List by asset
      const byAsset = await repo.listByAsset('asset-1')
      assert.equal(byAsset.length, 1)

      // Query non-existent returns null
      const nonExistent = await repo.get('src-1', 'other-rev')
      assert.equal(nonExistent, null)
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: normalizes SHA256 input to lowercase across create and bindServerRevision`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      const uppercaseSha = 'A'.repeat(64)
      const created = await repo.create({
        localSourceId: 'src-upper',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: uppercaseSha,
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      assert.equal(created.sourceAssetSha256, 'a'.repeat(64))

      const fetched = await repo.get('src-upper', 'loc-rev-1')
      assert.ok(fetched)
      assert.equal(fetched.sourceAssetSha256, 'a'.repeat(64))

      // bindServerRevision with uppercase SHA matches normalized SHA
      const bound = await repo.bindServerRevision({
        localSourceId: 'src-upper',
        localContentRevision: 'loc-rev-1',
        serverSourceId: 'srv-source-1',
        serverIngestionRevision: 'srv-rev-1',
        sourceAssetSha256: uppercaseSha,
      })
      assert.equal(bound.serverSourceId, 'srv-source-1')
      assert.equal(bound.sourceAssetSha256, 'a'.repeat(64))
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: validates receipt format and rejects invalid receipt structures`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      // Invalid local receipt (chunkCount 0) rejected on create
      await assert.rejects(
        () => repo.create({
          localSourceId: 'src-rec-1',
          localContentRevision: 'loc-rev-1',
          localAssetId: 'asset-1',
          sourceAssetSha256: 'a'.repeat(64),
          parserId: 'test-parser',
          parserVersion: '1.0.0',
          normalizationVersion: '1.0.0',
          localReceipt: { ...validLocalReceipt(), chunkCount: 0 },
        }),
        /LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID/
      )

      // Invalid local receipt (uppercase sha) rejected on updatePhase
      await repo.create({
        localSourceId: 'src-rec-1',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      await repo.updatePhase('src-rec-1', 'loc-rev-1', 'EXTRACTING')
      await assert.rejects(
        () => repo.updatePhase('src-rec-1', 'loc-rev-1', 'LOCAL_PARSED_READY', {
          localCacheId: validLocalReceipt().cacheId,
          localReceipt: validLocalReceipt({ localSourceId: 'wrong-source' }),
        }),
        /LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID/
      )
      const matchingReceipt = validLocalReceipt({ localSourceId: 'src-rec-1' })
      await repo.updatePhase('src-rec-1', 'loc-rev-1', 'LOCAL_PARSED_READY', {
        localCacheId: matchingReceipt.cacheId,
        localReceipt: matchingReceipt,
      })

      // Invalid server receipt (encryptedBytes <= 0) rejected on bindServerRevision
      await assert.rejects(
        () => repo.bindServerRevision({
          localSourceId: 'src-rec-1',
          localContentRevision: 'loc-rev-1',
          serverSourceId: 'srv-source-1',
          serverIngestionRevision: 'srv-rev-1',
          sourceAssetSha256: 'a'.repeat(64),
          serverReceipt: { ...validServerReceipt(), encryptedBytes: 0 },
        }),
        /LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID/
      )
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: enforces strict phase transitions across the entire lifecycle`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      await repo.create({
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      // Illegal transition: QUEUED -> READY directly is prohibited
      await assert.rejects(
        () => repo.updatePhase('src-1', 'loc-rev-1', 'READY'),
        /LOCAL_PARSED_DOCUMENT_ILLEGAL_TRANSITION/
      )

      // QUEUED -> EXTRACTING
      let doc = await repo.updatePhase('src-1', 'loc-rev-1', 'EXTRACTING', {
        checkpointPage: 1,
        checkpointOrdinal: 5,
      })
      assert.equal(doc.phase, 'EXTRACTING')
      assert.equal(doc.checkpointPage, 1)
      assert.equal(doc.checkpointOrdinal, 5)

      // Same phase checkpoint update: EXTRACTING -> EXTRACTING
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'EXTRACTING', {
        checkpointPage: 2,
        checkpointOrdinal: 10,
      })
      assert.equal(doc.checkpointPage, 2)
      assert.equal(doc.checkpointOrdinal, 10)

      // EXTRACTING -> OCR_RUNNING
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'OCR_RUNNING', {
        checkpointPage: 3,
        checkpointOrdinal: 15,
      })
      assert.equal(doc.phase, 'OCR_RUNNING')

      // OCR_RUNNING -> LOCAL_PARSED_READY with local receipt and local cache id
      const receipt = validLocalReceipt()
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'LOCAL_PARSED_READY', {
        localCacheId: receipt.cacheId,
        localReceipt: receipt,
      })
      assert.equal(doc.phase, 'LOCAL_PARSED_READY')
      assert.equal(doc.localCacheId, 'local-cache-1')
      assert.ok(doc.localReceipt)
      assert.equal(doc.localReceipt.payloadSha256, 'c'.repeat(64))

      // LOCAL_PARSED_READY -> WAITING_SERVER_REVISION
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'WAITING_SERVER_REVISION')
      assert.equal(doc.phase, 'WAITING_SERVER_REVISION')

      // WAITING_SERVER_REVISION -> REPACKAGING
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'REPACKAGING')
      assert.equal(doc.phase, 'REPACKAGING')

      // REPACKAGING -> UPLOADING
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'UPLOADING')
      assert.equal(doc.phase, 'UPLOADING')

      // UPLOADING -> SERVER_VALIDATING
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'SERVER_VALIDATING')
      assert.equal(doc.phase, 'SERVER_VALIDATING')

      // SERVER_VALIDATING -> SERVER_INDEXING
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'SERVER_INDEXING')
      assert.equal(doc.phase, 'SERVER_INDEXING')

      // SERVER_INDEXING -> READY
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'READY')
      assert.equal(doc.phase, 'READY')

      // READY is terminal (except superseded)
      await assert.rejects(
        () => repo.updatePhase('src-1', 'loc-rev-1', 'QUEUED'),
        /LOCAL_PARSED_DOCUMENT_ILLEGAL_TRANSITION/
      )
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: handles failure, pause, retry, restart and corrupt transitions`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      await repo.create({
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      // QUEUED -> EXTRACTING -> FAILED_LOCAL
      await repo.updatePhase('src-1', 'loc-rev-1', 'EXTRACTING')
      let doc = await repo.markFailed('src-1', 'loc-rev-1', 'OCR_CRASH', 'Process crashed')
      assert.equal(doc.phase, 'FAILED_LOCAL')
      assert.equal(doc.safeErrorCode, 'OCR_CRASH')
      assert.equal(doc.safeErrorDetail, 'Process crashed')

      // Retry from FAILED_LOCAL moves to QUEUED and increments attempt
      doc = await repo.retry('src-1', 'loc-rev-1')
      assert.equal(doc.phase, 'QUEUED')
      assert.equal(doc.attempt, 1)

      // Move to REPACKAGING -> PAUSED_NETWORK
      await repo.updatePhase('src-1', 'loc-rev-1', 'EXTRACTING')
      await repo.updatePhase('src-1', 'loc-rev-1', 'LOCAL_PARSED_READY')
      await repo.updatePhase('src-1', 'loc-rev-1', 'REPACKAGING')
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'PAUSED_NETWORK', {
        safeErrorCode: 'NETWORK_TIMEOUT',
      })
      assert.equal(doc.phase, 'PAUSED_NETWORK')

      // From PAUSED_NETWORK -> UPLOADING or QUEUED
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'UPLOADING')
      assert.equal(doc.phase, 'UPLOADING')

      // Mark CORRUPT from UPLOADING
      doc = await repo.updatePhase('src-1', 'loc-rev-1', 'CORRUPT')
      assert.equal(doc.phase, 'CORRUPT')

      // Restart clears checkpoint and sets phase to QUEUED
      doc = await repo.restart('src-1', 'loc-rev-1')
      assert.equal(doc.phase, 'QUEUED')
      assert.equal(doc.checkpointPage, 0)
      assert.equal(doc.checkpointOrdinal, 0)
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: bind metadata fence prevents forming bind input when serverIngestionRevision is missing`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      const receipt = validLocalReceipt()
      await repo.create({
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })
      await repo.updatePhase('src-1', 'loc-rev-1', 'EXTRACTING')
      await repo.updatePhase('src-1', 'loc-rev-1', 'LOCAL_PARSED_READY', {
        localCacheId: receipt.cacheId,
        localReceipt: receipt,
      })

      // Record does NOT have serverIngestionRevision yet
      await assert.rejects(
        () => repo.prepareBindRequest('src-1', 'loc-rev-1', {
          serverCacheId: 'srv-cache-1',
          jobId: 'job-1',
        }),
        /LOCAL_PARSED_DOCUMENT_NO_SERVER_REVISION/
      )

      // Bind server revision to record
      await repo.bindServerRevision({
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        serverSourceId: 'srv-source-1',
        serverIngestionRevision: 'srv-rev-uuid-1',
        sourceAssetSha256: 'a'.repeat(64),
      })

      // Now prepareBindRequest succeeds and outputs exact LocalCacheBindRequest without blocks
      const bindRequest = await repo.prepareBindRequest('src-1', 'loc-rev-1', {
        serverCacheId: 'srv-cache-1',
        jobId: 'job-1',
      })

      assert.deepEqual(bindRequest, {
        localCacheId: 'local-cache-1',
        serverCacheId: 'srv-cache-1',
        userId: 'user-1',
        deviceId: 'device-1',
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        serverSourceId: 'srv-source-1',
        jobId: 'job-1',
        ingestionRevision: 'srv-rev-uuid-1',
        sourceAssetSha256: 'a'.repeat(64),
      })

      // Guarantee no blocks or content payload is leaked in bindRequest
      assert.equal('blocks' in bindRequest, false)
      assert.equal('content' in bindRequest, false)
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: bindServerRevision rejects SHA mismatch and stale content revisions`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      await repo.create({
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      // SHA mismatch
      await assert.rejects(
        () => repo.bindServerRevision({
          localSourceId: 'src-1',
          localContentRevision: 'loc-rev-1',
          serverSourceId: 'srv-source-1',
          serverIngestionRevision: 'srv-rev-1',
          sourceAssetSha256: 'b'.repeat(64), // mismatch!
        }),
        /LOCAL_PARSED_DOCUMENT_SHA_MISMATCH/
      )

      // Stale revision (not found)
      await assert.rejects(
        () => repo.bindServerRevision({
          localSourceId: 'src-1',
          localContentRevision: 'loc-rev-stale',
          serverSourceId: 'srv-source-1',
          serverIngestionRevision: 'srv-rev-1',
          sourceAssetSha256: 'a'.repeat(64),
        }),
        /LOCAL_PARSED_DOCUMENT_NOT_FOUND/
      )
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: claimNext handles single-flight and concurrent Promise.all isolation`, async () => {
    const { repo, cleanup } = await backend.setup()
    try {
      await repo.create({
        localSourceId: 'src-1',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })
      await repo.create({
        localSourceId: 'src-2',
        localContentRevision: 'loc-rev-1',
        localAssetId: 'asset-2',
        sourceAssetSha256: 'b'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      // Launch 5 concurrent claims for 2 queued records
      const results = await Promise.all([
        repo.claimNext(),
        repo.claimNext(),
        repo.claimNext(),
        repo.claimNext(),
        repo.claimNext(),
      ])

      const claimed = results.filter((r) => r !== null)
      const nulls = results.filter((r) => r === null)

      assert.equal(claimed.length, 2, 'Exactly 2 claims should succeed for 2 queued records')
      assert.equal(nulls.length, 3, 'Excess concurrent claims must return null')

      const claimedIds = claimed.map((c) => c.localSourceId).sort()
      assert.deepEqual(claimedIds, ['src-1', 'src-2'], 'Both queued records must be claimed once')
      assert.ok(claimed.every((c) => c.phase === 'EXTRACTING'))
      assert.ok(claimed.every((c) => c.attempt === 1))

      // Subsequent claim returns null
      const nextClaim = await repo.claimNext()
      assert.equal(nextClaim, null)
    } finally {
      cleanup()
    }
  })

  test(`${backend.name}: multi-repository concurrent claiming claims each record exactly once`, async () => {
    const ctx = await backend.setup()
    try {
      const repoA = ctx.repo
      const repoB = backend.createSecondRepo(ctx)

      await repoA.create({
        localSourceId: 'src-multi-1',
        localContentRevision: 'rev-1',
        localAssetId: 'asset-1',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })
      await repoA.create({
        localSourceId: 'src-multi-2',
        localContentRevision: 'rev-1',
        localAssetId: 'asset-2',
        sourceAssetSha256: 'b'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })
      await repoA.create({
        localSourceId: 'src-multi-3',
        localContentRevision: 'rev-1',
        localAssetId: 'asset-3',
        sourceAssetSha256: 'c'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      // Concurrently claim across two repo instances
      const results = await Promise.all([
        repoA.claimNext(),
        repoB.claimNext(),
        repoA.claimNext(),
        repoB.claimNext(),
        repoA.claimNext(),
        repoB.claimNext(),
      ])

      const claimed = results.filter((r) => r !== null)
      const nulls = results.filter((r) => r === null)

      assert.equal(claimed.length, 3, 'Exactly 3 claims should succeed for 3 queued records')
      assert.equal(nulls.length, 3, 'Remaining 3 claims must return null')

      const claimedIds = claimed.map((c) => c.localSourceId).sort()
      assert.deepEqual(claimedIds, ['src-multi-1', 'src-multi-2', 'src-multi-3'])
      assert.ok(claimed.every((c) => c.phase === 'EXTRACTING'))
    } finally {
      ctx.cleanup()
    }
  })

  test(`${backend.name}: constructor trims userId and serverDeviceId whitespace and enforces non-empty`, async () => {
    const paddedUserId = '  user-padded-1  '
    const paddedDeviceId = '  device-padded-1  '
    const ctx = await backend.setup()
    try {
      const repo = backend.name.includes('SQLite')
        ? new LocalParsedDocumentRepository(paddedUserId, paddedDeviceId, { sql: ctx.sql })
        : new LocalParsedDocumentRepository(paddedUserId, paddedDeviceId, { storage: ctx.storage })

      assert.equal(repo.userId, 'user-padded-1')
      assert.equal(repo.serverDeviceId, 'device-padded-1')

      const doc = await repo.create({
        localSourceId: 'src-trim',
        localContentRevision: 'rev-trim',
        localAssetId: 'asset-trim',
        sourceAssetSha256: 'a'.repeat(64),
        parserId: 'test-parser',
        parserVersion: '1.0.0',
        normalizationVersion: '1.0.0',
      })

      assert.equal(doc.userId, 'user-padded-1')
      assert.equal(doc.serverDeviceId, 'device-padded-1')

      const fetched = await repo.get('src-trim', 'rev-trim')
      assert.ok(fetched)
      assert.equal(fetched.userId, 'user-padded-1')
      assert.equal(fetched.serverDeviceId, 'device-padded-1')

      const bySource = await repo.listBySource('src-trim')
      assert.equal(bySource.length, 1)
      assert.equal(bySource[0].userId, 'user-padded-1')

      assert.throws(() => new LocalParsedDocumentRepository('', 'device-1'), /requires a userId/)
      assert.throws(() => new LocalParsedDocumentRepository('   ', 'device-1'), /requires a userId/)
      assert.throws(() => new LocalParsedDocumentRepository('user-1', ''), /requires a serverDeviceId/)
      assert.throws(() => new LocalParsedDocumentRepository('user-1', '   '), /requires a serverDeviceId/)
    } finally {
      ctx.cleanup()
    }
  })

  test(`${backend.name}: handles malformed JSON and invalid shape receipts safely returning null without legacy fallback`, async () => {
    if (backend.name.includes('SQLite')) {
      const sqlite = new TemporarySqlite()
      try {
        await createVersionedLocalSchema(sqlite)
        const repo = new LocalParsedDocumentRepository('user-1', 'device-1', { sql: sqlite })

        // 1. Insert raw corrupt JSON in local_receipt_json and server_receipt_json
        await sqlite.execute(`INSERT INTO local_parsed_documents (
          user_id, device_id, local_source_id, local_content_revision,
          local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
          local_receipt_json, server_receipt_json, phase, created_at, updated_at
        ) VALUES (
          'user-1', 'device-1', 'src-corrupt-json', 'rev-1',
          'asset-1', '${'a'.repeat(64)}', 'parser', '1.0', '1.0',
          '{ corrupt local json', '{ corrupt server json', 'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
        )`)

        const corruptJsonDoc = await repo.get('src-corrupt-json', 'rev-1')
        assert.ok(corruptJsonDoc)
        assert.equal(corruptJsonDoc.localReceipt, null, 'Malformed local receipt JSON must safely fall back to null')
        assert.equal(corruptJsonDoc.serverReceipt, null, 'Malformed server receipt JSON must safely fall back to null')

        // 2. Insert invalid shape receipt JSON (e.g. missing fields, chunkCount: 0)
        await sqlite.execute(`INSERT INTO local_parsed_documents (
          user_id, device_id, local_source_id, local_content_revision,
          local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
          local_receipt_json, server_receipt_json, phase, created_at, updated_at
        ) VALUES (
          'user-1', 'device-1', 'src-invalid-shape', 'rev-1',
          'asset-1', '${'a'.repeat(64)}', 'parser', '1.0', '1.0',
          '{"cacheId":"c1","chunkCount":0}', '{"cacheId":"s1","chunkCount":0}', 'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
        )`)

        const invalidShapeDoc = await repo.get('src-invalid-shape', 'rev-1')
        assert.ok(invalidShapeDoc)
        assert.equal(invalidShapeDoc.localReceipt, null, 'Invalid shape local receipt must safely fall back to null')
        assert.equal(invalidShapeDoc.serverReceipt, null, 'Invalid shape server receipt must fall back to null without legacy fallback base object')
      } finally {
        sqlite.close()
      }
    } else {
      const storage = createMemoryStorage()
      const namespace = 'auralis:v9:local-parsed-docs:user-1:device-1'

      // Write raw malformed JSON and invalid shape records into storage
      storage.setItem(namespace, JSON.stringify({
        records: [
          {
            userId: 'user-1',
            serverDeviceId: 'device-1',
            localSourceId: 'src-corrupt-json',
            localContentRevision: 'rev-1',
            localAssetId: 'asset-1',
            sourceAssetSha256: 'a'.repeat(64),
            parserId: 'parser',
            parserVersion: '1.0',
            normalizationVersion: '1.0',
            localReceipt: '{ corrupt local json',
            serverReceipt: '{ corrupt server json',
            phase: 'QUEUED',
            createdAt: '2026-09-16T00:00:00.000Z',
            updatedAt: '2026-09-16T00:00:00.000Z',
          },
          {
            userId: 'user-1',
            serverDeviceId: 'device-1',
            localSourceId: 'src-invalid-shape',
            localContentRevision: 'rev-1',
            localAssetId: 'asset-1',
            sourceAssetSha256: 'a'.repeat(64),
            parserId: 'parser',
            parserVersion: '1.0',
            normalizationVersion: '1.0',
            localReceipt: { cacheId: 'c1', chunkCount: 0 },
            serverReceipt: { cacheId: 's1', chunkCount: 0 },
            phase: 'QUEUED',
            createdAt: '2026-09-16T00:00:00.000Z',
            updatedAt: '2026-09-16T00:00:00.000Z',
          },
        ],
      }))

      const repo = new LocalParsedDocumentRepository('user-1', 'device-1', { storage })

      const corruptJsonDoc = await repo.get('src-corrupt-json', 'rev-1')
      assert.ok(corruptJsonDoc)
      assert.equal(corruptJsonDoc.localReceipt, null, 'Malformed local receipt JSON must safely fall back to null in Browser')
      assert.equal(corruptJsonDoc.serverReceipt, null, 'Malformed server receipt JSON must safely fall back to null in Browser')

      const invalidShapeDoc = await repo.get('src-invalid-shape', 'rev-1')
      assert.ok(invalidShapeDoc)
      assert.equal(invalidShapeDoc.localReceipt, null, 'Invalid shape local receipt must safely fall back to null in Browser')
      assert.equal(invalidShapeDoc.serverReceipt, null, 'Invalid shape server receipt must fall back to null in Browser without legacy fallback base object')
    }
  })
}
