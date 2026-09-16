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

const {
  createVersionedLocalSchema,
  LOCAL_SCHEMA_VERSION,
  sanitizeParsedDocumentServerReceipt,
  sanitizeLocalCacheReceipt,
  localParsedDocumentFromRow,
} = await import('../src/services/localSchema.ts')

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

test('clean database initializes to schema v9 with local_parsed_documents table and clean migrations', async () => {
  const sqlite = new TemporarySqlite()
  try {
    assert.equal(LOCAL_SCHEMA_VERSION, 9, 'LOCAL_SCHEMA_VERSION must be 9')
    await createVersionedLocalSchema(sqlite)

    const tableNames = sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    assert.ok(tableNames.includes('local_parsed_documents'), 'local_parsed_documents table must exist')
    assert.ok(tableNames.includes('local_asset_files'), 'local_asset_files table must exist')
    assert.ok(tableNames.includes('local_asset_sync_jobs'), 'local_asset_sync_jobs table must exist')
    assert.ok(tableNames.includes('local_source_drafts'), 'local_source_drafts table must exist')
    assert.ok(tableNames.includes('document_processing_jobs'), 'document_processing_jobs table must exist')
    assert.ok(tableNames.includes('ai_overview_cache'), 'ai_overview_cache table must exist')

    const versions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((r) => r.version)
    assert.deepEqual(versions, [9])
  } finally {
    sqlite.close()
  }
})

test('schema initialization is repeatable and idempotent on clean v9', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    await createVersionedLocalSchema(sqlite)
    await createVersionedLocalSchema(sqlite)

    const versions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((r) => r.version)
    assert.deepEqual(versions, [9])
  } finally {
    sqlite.close()
  }
})

test('local_parsed_documents enforces primary key, GLOB lowercase hex SHA256, non-empty IDs, and valid phase constraints', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)

    // Valid insert
    await sqlite.execute(`INSERT INTO local_parsed_documents (
      user_id, device_id, local_source_id, local_content_revision,
      local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version, ocr_model_version,
      local_cache_id, local_receipt_json, phase,
      server_source_id, server_ingestion_revision, server_cache_id, server_receipt_json,
      safe_error_code, safe_error_detail,
      attempt, checkpoint_page, checkpoint_ordinal, checkpoint_json,
      created_at, updated_at
    ) VALUES (
      'user-1', 'device-1', 'source-1', 'local-rev-1',
      'asset-1', '${'a'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0', null,
      'cache-loc-1', '{"cacheId":"cache-loc-1"}', 'QUEUED',
      null, null, null, null,
      null, null,
      0, 0, 0, null,
      '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
    )`)

    // Primary key violation with same (user_id, device_id, local_source_id, local_content_revision)
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_parsed_documents (
        user_id, device_id, local_source_id, local_content_revision,
        local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
        phase, created_at, updated_at
      ) VALUES (
        'user-1', 'device-1', 'source-1', 'local-rev-1',
        'asset-1', '${'a'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
        'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      )`),
      /constraint failed/i
    )

    // Same local_source_id with DIFFERENT local_content_revision is allowed
    await sqlite.execute(`INSERT INTO local_parsed_documents (
      user_id, device_id, local_source_id, local_content_revision,
      local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
      phase, created_at, updated_at
    ) VALUES (
      'user-1', 'device-1', 'source-1', 'local-rev-2',
      'asset-1', '${'a'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
      'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
    )`)

    // Same IDs for DIFFERENT user or device is allowed
    await sqlite.execute(`INSERT INTO local_parsed_documents (
      user_id, device_id, local_source_id, local_content_revision,
      local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
      phase, created_at, updated_at
    ) VALUES (
      'user-2', 'device-1', 'source-1', 'local-rev-1',
      'asset-1', '${'a'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
      'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
    )`)

    // Uppercase SHA256 rejected by CHECK GLOB constraint
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_parsed_documents (
        user_id, device_id, local_source_id, local_content_revision,
        local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
        phase, created_at, updated_at
      ) VALUES (
        'user-1', 'device-1', 'source-uppercase', 'local-rev-1',
        'asset-1', '${'A'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
        'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      )`),
      /constraint failed/i
    )

    // Non-hex SHA256 rejected by CHECK GLOB constraint
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_parsed_documents (
        user_id, device_id, local_source_id, local_content_revision,
        local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
        phase, created_at, updated_at
      ) VALUES (
        'user-1', 'device-1', 'source-nonhex', 'local-rev-1',
        'asset-1', '${'g'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
        'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      )`),
      /constraint failed/i
    )

    // Invalid SHA256 length (<64) fails check constraint
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_parsed_documents (
        user_id, device_id, local_source_id, local_content_revision,
        local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
        phase, created_at, updated_at
      ) VALUES (
        'user-1', 'device-1', 'source-2', 'local-rev-1',
        'asset-1', 'short_sha', 'pdf-parser', '1.0.0', '1.0.0',
        'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      )`),
      /constraint failed/i
    )

    // Empty local_source_id fails check constraint
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_parsed_documents (
        user_id, device_id, local_source_id, local_content_revision,
        local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
        phase, created_at, updated_at
      ) VALUES (
        'user-1', 'device-1', '   ', 'local-rev-1',
        'asset-1', '${'a'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
        'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      )`),
      /constraint failed/i
    )

    // Empty local_content_revision fails check constraint
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_parsed_documents (
        user_id, device_id, local_source_id, local_content_revision,
        local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
        phase, created_at, updated_at
      ) VALUES (
        'user-1', 'device-1', 'source-empty-rev', '',
        'asset-1', '${'a'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
        'QUEUED', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      )`),
      /constraint failed/i
    )

    // Invalid Phase fails CHECK constraint
    await assert.rejects(
      () => sqlite.execute(`INSERT INTO local_parsed_documents (
        user_id, device_id, local_source_id, local_content_revision,
        local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version,
        phase, created_at, updated_at
      ) VALUES (
        'user-1', 'device-1', 'source-3', 'local-rev-1',
        'asset-1', '${'a'.repeat(64)}', 'pdf-parser', '1.0.0', '1.0.0',
        'UNKNOWN_PHASE', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z'
      )`),
      /constraint failed/i
    )
  } finally {
    sqlite.close()
  }
})

test('sanitizeParsedDocumentServerReceipt and sanitizeLocalCacheReceipt return null on invalid shapes without legacy fallback', () => {
  const validLocal = {
    cacheId: 'loc-1',
    envelopeVersion: 1,
    chunkCount: 2,
    encryptedBytes: 4096,
    plainTextSha256: 'b'.repeat(64),
    payloadSha256: 'c'.repeat(64),
    payloadBytes: 2048,
    localSourceId: 'src-1',
    localContentRevision: 'rev-1',
    sourceAssetSha256: 'a'.repeat(64),
    payloadFormat: 'parsed-document-local-v1',
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    normalizationVersion: '1.0.0',
    ocrModelVersion: null,
  }

  const validServer = {
    cacheId: 'srv-1',
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

  // Valid receipts pass
  assert.deepEqual(sanitizeLocalCacheReceipt(validLocal), validLocal)
  assert.deepEqual(sanitizeParsedDocumentServerReceipt(validServer), validServer)

  // Non-objects and null return null
  assert.equal(sanitizeLocalCacheReceipt(null), null)
  assert.equal(sanitizeLocalCacheReceipt(undefined), null)
  assert.equal(sanitizeLocalCacheReceipt('string'), null)
  assert.equal(sanitizeLocalCacheReceipt([]), null)

  assert.equal(sanitizeParsedDocumentServerReceipt(null), null)
  assert.equal(sanitizeParsedDocumentServerReceipt(undefined), null)
  assert.equal(sanitizeParsedDocumentServerReceipt('string'), null)
  assert.equal(sanitizeParsedDocumentServerReceipt([]), null)

  // Invalid shapes return null (never returning legacy fallback base object)
  assert.equal(sanitizeLocalCacheReceipt({ chunkCount: 0 }), null)
  assert.equal(sanitizeLocalCacheReceipt({ ...validLocal, chunkCount: 0 }), null)
  assert.equal(sanitizeLocalCacheReceipt({ ...validLocal, sourceAssetSha256: 'invalid' }), null)

  assert.equal(sanitizeParsedDocumentServerReceipt({ chunkCount: 0 }), null)
  assert.equal(sanitizeParsedDocumentServerReceipt({ cacheId: 'srv-1' }), null)
  assert.equal(sanitizeParsedDocumentServerReceipt({ ...validServer, chunkCount: 0 }), null)
  assert.equal(sanitizeParsedDocumentServerReceipt({ ...validServer, payloadFormat: 'wrong' }), null)
  assert.equal(sanitizeParsedDocumentServerReceipt({ ...validServer, sourceAssetSha256: 'invalid' }), null)
})

test('localParsedDocumentFromRow cleanly handles null, valid, malformed and invalid shape receipts', () => {
  const validLocal = {
    cacheId: 'loc-1',
    envelopeVersion: 1,
    chunkCount: 2,
    encryptedBytes: 4096,
    plainTextSha256: 'b'.repeat(64),
    payloadSha256: 'c'.repeat(64),
    payloadBytes: 2048,
    localSourceId: 'src-1',
    localContentRevision: 'rev-1',
    sourceAssetSha256: 'a'.repeat(64),
    payloadFormat: 'parsed-document-local-v1',
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    normalizationVersion: '1.0.0',
    ocrModelVersion: null,
  }

  const validServer = {
    cacheId: 'srv-1',
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

  const baseRow = {
    user_id: 'user-1',
    device_id: 'device-1',
    local_source_id: 'src-1',
    local_content_revision: 'rev-1',
    local_asset_id: 'asset-1',
    source_asset_sha256: 'a'.repeat(64),
    parser_id: 'parser',
    parser_version: '1.0',
    normalization_version: '1.0',
    ocr_model_version: null,
    local_cache_id: null,
    local_receipt_json: null,
    phase: 'QUEUED',
    server_source_id: null,
    server_ingestion_revision: null,
    server_cache_id: null,
    server_receipt_json: null,
    safe_error_code: null,
    safe_error_detail: null,
    attempt: 0,
    checkpoint_page: 0,
    checkpoint_ordinal: 0,
    checkpoint_json: null,
    created_at: '2026-09-16T00:00:00.000Z',
    updated_at: '2026-09-16T00:00:00.000Z',
  }

  // 1. Null receipts
  const rowNull = localParsedDocumentFromRow(baseRow)
  assert.equal(rowNull.localReceipt, null)
  assert.equal(rowNull.serverReceipt, null)

  // 2. Valid receipts
  const rowValid = localParsedDocumentFromRow({
    ...baseRow,
    local_receipt_json: JSON.stringify(validLocal),
    server_receipt_json: JSON.stringify(validServer),
  })
  assert.deepEqual(rowValid.localReceipt, validLocal)
  assert.deepEqual(rowValid.serverReceipt, validServer)

  // 3. Malformed JSON
  const rowMalformed = localParsedDocumentFromRow({
    ...baseRow,
    local_receipt_json: '{ bad json',
    server_receipt_json: '{ bad json',
  })
  assert.equal(rowMalformed.localReceipt, null)
  assert.equal(rowMalformed.serverReceipt, null)

  // 4. Invalid shapes
  const rowInvalid = localParsedDocumentFromRow({
    ...baseRow,
    local_receipt_json: JSON.stringify({ cacheId: 'loc-1', chunkCount: 0 }),
    server_receipt_json: JSON.stringify({ cacheId: 'srv-1', chunkCount: 0 }),
  })
  assert.equal(rowInvalid.localReceipt, null)
  assert.equal(rowInvalid.serverReceipt, null)
})

