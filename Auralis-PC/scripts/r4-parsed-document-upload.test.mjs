import assert from 'node:assert/strict'
import fs from 'node:fs'
import { register } from 'node:module'
import path from 'node:path'
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
const { ParsedDocumentUploadCoordinator } = await import('../src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts')
const { DocumentProcessingJobRepository, createMemoryStorage } = await import('../src/services/localRepository.ts')
const { normalizeInvokeError } = await import('../src/api/tauri.ts')
const root = path.resolve(import.meta.dirname, '..')

const receipt = {
  cacheId: 'cache-1',
  envelopeVersion: 1,
  chunkCount: 2,
  encryptedBytes: 256,
  plainTextSha256: 'a'.repeat(64),
  payloadSha256: 'b'.repeat(64),
  payloadBytes: 128,
  payloadFormat: 'parsed-document-v1', sourceAssetSha256: 'f'.repeat(64),
  parserId: 'auralis-local-parser', parserVersion: 'auralis-document-parser/1.0.0',
  normalizationVersion: 'auralis-normalization/1.0.0', ocrModelVersion: null,
}

function job(phase = 'PACKAGING') {
  return {
    jobId: 'job-1', userId: 'user-1', serverDeviceId: 'device-1', sourceId: 'source-1',
    ingestionRevision: '11111111-1111-1111-1111-111111111111', phase, attempt: 0,
    checkpoint: { pageNumber: 1, blockOrdinal: 2 }, payloadCacheId: 'cache-1',
    payloadReceipt: receipt,
    errorCode: null, errorDetail: null, createdAt: '2026-08-24T00:00:00Z', updatedAt: '2026-08-24T00:00:00Z',
  }
}

class FakeRepository {
  constructor() { this.value = job(); this.transitions = [] }
  async get() { return structuredClone(this.value) }
  async transition(_jobId, phase, options = {}) {
    this.transitions.push({ phase, options })
    this.value = { ...this.value, phase, ...options, updatedAt: '2026-08-24T00:00:01Z' }
    return structuredClone(this.value)
  }
}

function intent() {
  return {
    parsedDocumentId: '22222222-2222-2222-2222-222222222222',
    ingestionRevision: '11111111-1111-1111-1111-111111111111',
    uploadUrl: 'https://storage.example/upload',
    headers: { 'Content-Type': 'application/gzip' },
    expiresAt: '2026-08-24T00:05:00Z',
  }
}

function apiStub() {
  const calls = { intents: [], completes: [] }
  return {
    calls,
    async createParsedDocumentUploadIntent(sourceId, body) { calls.intents.push({ sourceId, body }); return intent() },
    async completeParsedDocument(sourceId, parsedDocumentId) {
      calls.completes.push({ sourceId, parsedDocumentId })
      return { parsedDocumentId, status: 'ACCEPTED', generation: '33333333-3333-3333-3333-333333333333' }
    },
  }
}

test('uploads only the encrypted cache receipt and completes the server document', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  const puts = []
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api,
    put: async (request) => { puts.push(request); return { bytesSent: 128, payloadSha256: receipt.payloadSha256 } },
  })
  const result = await coordinator.upload('job-1', receipt)
  assert.equal(result.status, 'ACCEPTED')
  assert.equal(api.calls.intents[0].body.payloadSha256, receipt.payloadSha256)
  assert.equal(api.calls.intents[0].body.sizeBytes, receipt.payloadBytes)
  assert.equal(puts[0].cacheId, receipt.cacheId)
  assert.equal(puts[0].expectedPayloadSha256, receipt.payloadSha256)
  assert.equal(repository.value.phase, 'READY')
  assert.ok(!Object.hasOwn(puts[0], 'text'))
})

test('requests one background read sync only after accepted complete', async () => {
  let calls = 0
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository: new FakeRepository(), api: apiStub(),
    onCompleteAccepted: () => { calls += 1 },
    put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
  })
  const result = await coordinator.upload('job-1', receipt)
  assert.equal(result.status, 'ACCEPTED')
  await coordinator.upload('job-1', receipt)
  assert.equal(calls, 1)
})

test('callback failure does not change accepted result or block READY transition', async () => {
  const repository = new FakeRepository()
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api: apiStub(),
    onCompleteAccepted: async () => { throw new Error('sync scheduler unavailable') },
    put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
  })
  const result = await coordinator.upload('job-1', receipt)
  assert.equal(result.status, 'ACCEPTED')
  assert.equal(repository.value.phase, 'READY')
  assert.deepEqual(repository.transitions.map(({ phase }) => phase), ['UPLOADING', 'SERVER_VALIDATING', 'SERVER_INDEXING', 'READY'])
})

test('does not request background read sync for rejected complete', async () => {
  let calls = 0
  const api = apiStub()
  api.completeParsedDocument = async () => ({ parsedDocumentId: 'id', status: 'REJECTED' })
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository: new FakeRepository(), api,
    onCompleteAccepted: () => { calls += 1 },
    put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
  })
  await assert.rejects(() => coordinator.upload('job-1', receipt), /PARSED_DOCUMENT_SERVER_REJECTED/)
  assert.equal(calls, 0)
})

test('does not request background read sync for missing or invalid complete status or completion exception', async () => {
  for (const complete of [
    async () => ({ parsedDocumentId: 'id' }),
    async () => ({ parsedDocumentId: 'id', status: 'INVALID' }),
    async () => { throw new Error('complete unavailable') },
  ]) {
    let calls = 0
    const api = apiStub()
    api.completeParsedDocument = complete
    const coordinator = new ParsedDocumentUploadCoordinator({
      repository: new FakeRepository(), api,
      onCompleteAccepted: () => { calls += 1 },
      put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
    })
    await assert.rejects(() => coordinator.upload('job-1', receipt))
    assert.equal(calls, 0)
  }
})

test('requests once after accepted complete following an expired PUT intent', async () => {
  let calls = 0
  let puts = 0
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository: new FakeRepository(), api: apiStub(),
    onCompleteAccepted: () => { calls += 1 },
    put: async () => {
      puts += 1
      if (puts === 1) throw new Error('DOCUMENT_UPLOAD_INTENT_EXPIRED')
      return { bytesSent: 128, payloadSha256: receipt.payloadSha256 }
    },
  })
  await coordinator.upload('job-1', receipt)
  assert.equal(calls, 1)
})

function captureUploadTrace() {
  const entries = []
  const originalInfo = console.info
  const originalWarn = console.warn
  console.info = (...args) => { if (args[0] === '[Document Upload Trace]') entries.push(args) }
  console.warn = (...args) => { if (args[0] === '[Document Upload Trace]') entries.push(args) }
  return { entries, restore: () => { console.info = originalInfo; console.warn = originalWarn } }
}

function assertTracePayloads(entries) {
  const allowed = new Set(['event', 'jobId', 'stage', 'errorCode', 'durationMs'])
  for (const [, entry] of entries) {
    assert.ok(Object.keys(entry).every((key) => allowed.has(key)))
    if (Object.hasOwn(entry, 'durationMs')) assert.ok(Number.isFinite(entry.durationMs) && entry.durationMs >= 0)
  }
}

test('traces accepted PUT and complete boundaries in order', async () => {
  const capture = captureUploadTrace()
  try {
    const coordinator = new ParsedDocumentUploadCoordinator({
      repository: new FakeRepository(), api: apiStub(),
      put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
    })
    await coordinator.upload('job-1', receipt)
    const payloads = capture.entries.map(([, payload]) => payload)
    assert.deepEqual(payloads.map(({ event, jobId, stage }) => ({ event, jobId, stage })), [
      { event: 'PUT_STARTED', jobId: 'job-1', stage: 'put' },
      { event: 'PUT_SUCCEEDED', jobId: 'job-1', stage: 'put' },
      { event: 'COMPLETE_ACCEPTED', jobId: 'job-1', stage: 'complete' },
    ])
    assertTracePayloads(capture.entries)
  } finally { capture.restore() }
})

test('traces PUT failure, complete rejection and expired-intent retry without leaking secrets', async () => {
  const scenarios = [
    {
      put: async () => { throw new Error('https://storage.example/upload?sig=secret Authorization:Bearer token') },
      expected: [{ event: 'PUT_STARTED', stage: 'put' }, { event: 'FAILED', stage: 'put', errorCode: 'PARSED_DOCUMENT_UPLOAD_FAILED' }],
    },
    {
      put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
      complete: async () => ({ parsedDocumentId: 'id', status: 'REJECTED:response body https://storage.example/object' }),
      expected: [{ event: 'PUT_STARTED', stage: 'put' }, { event: 'PUT_SUCCEEDED', stage: 'put' }, { event: 'FAILED', stage: 'complete', errorCode: 'PARSED_DOCUMENT_SERVER_REJECTED' }],
    },
  ]
  for (const scenario of scenarios) {
    const capture = captureUploadTrace()
    try {
      const api = apiStub()
      if (scenario.complete) api.completeParsedDocument = scenario.complete
      const coordinator = new ParsedDocumentUploadCoordinator({ repository: new FakeRepository(), api, put: scenario.put })
      await assert.rejects(() => coordinator.upload('job-1', receipt))
      assert.deepEqual(capture.entries.map(([, { event, stage, errorCode }]) => ({ event, stage, ...(errorCode ? { errorCode } : {}) })), scenario.expected)
      assertTracePayloads(capture.entries)
      assert.doesNotMatch(JSON.stringify(capture.entries), /https?:\/\/|headers|Authorization|Bearer|secret|cacheId|payloadReceipt|path|OCR|response body/i)
    } finally { capture.restore() }
  }

  const capture = captureUploadTrace()
  try {
    let puts = 0
    const coordinator = new ParsedDocumentUploadCoordinator({
      repository: new FakeRepository(), api: apiStub(),
      put: async () => { puts += 1; if (puts === 1) throw new Error('DOCUMENT_UPLOAD_INTENT_EXPIRED'); return { bytesSent: 128, payloadSha256: receipt.payloadSha256 } },
    })
    await coordinator.upload('job-1', receipt)
    assert.deepEqual(capture.entries.map(([, { event, stage, errorCode }]) => ({ event, stage, ...(errorCode ? { errorCode } : {}) })), [
      { event: 'PUT_STARTED', stage: 'put' }, { event: 'FAILED', stage: 'put', errorCode: 'DOCUMENT_UPLOAD_INTENT_EXPIRED' },
      { event: 'PUT_STARTED', stage: 'put' }, { event: 'PUT_SUCCEEDED', stage: 'put' }, { event: 'COMPLETE_ACCEPTED', stage: 'complete' },
    ])
    assertTracePayloads(capture.entries)
  } finally { capture.restore() }
})

test('rejects complete responses without an explicit accepted status', async () => {
  for (const status of [undefined, '', 'INVALID']) {
    const repository = new FakeRepository()
    const capture = captureUploadTrace()
    try {
      const coordinator = new ParsedDocumentUploadCoordinator({
        repository,
        api: { ...apiStub(), completeParsedDocument: async () => ({ parsedDocumentId: 'id', status }) },
        put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
      })
      await assert.rejects(() => coordinator.upload('job-1', receipt), /PARSED_DOCUMENT_SERVER_REJECTED/)
      assert.equal(repository.value.phase, 'FAILED_SERVER')
      assert.equal(repository.value.errorCode, 'PARSED_DOCUMENT_SERVER_REJECTED')
      assert.ok(!repository.transitions.some(({ phase }) => phase === 'READY'))
      assert.deepEqual(capture.entries.map(([, { event, stage, errorCode }]) => ({ event, stage, ...(errorCode ? { errorCode } : {}) })), [
        { event: 'PUT_STARTED', stage: 'put' },
        { event: 'PUT_SUCCEEDED', stage: 'put' },
        { event: 'FAILED', stage: 'complete', errorCode: 'PARSED_DOCUMENT_SERVER_REJECTED' },
      ])
      assertTracePayloads(capture.entries)
    } finally { capture.restore() }
  }
})

test('persists the server indexing phase before marking an accepted upload ready', async () => {
  const capture = captureUploadTrace()
  let callbackCalls = 0
  try {
  const repository = new DocumentProcessingJobRepository('user-1', 'device-1', {
    storage: createMemoryStorage(),
    now: () => '2026-08-24T00:00:01Z',
  })
  await repository.create({ jobId: 'job-1', sourceId: 'source-1', ingestionRevision: job().ingestionRevision })
  await repository.transition('job-1', 'EXTRACTING')
  await repository.transition('job-1', 'PACKAGING', { payloadCacheId: receipt.cacheId, payloadReceipt: receipt })
  const phases = []
  const transition = repository.transition.bind(repository)
  repository.transition = async (jobId, phase, options) => {
    phases.push(phase)
    return transition(jobId, phase, options)
  }
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository,
    api: apiStub(),
    onCompleteAccepted: async () => { callbackCalls += 1; throw new Error('read sync unavailable') },
    put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
  })

  const result = await coordinator.upload('job-1', receipt)
  assert.equal(result.status, 'ACCEPTED')
  assert.deepEqual(phases, ['UPLOADING', 'SERVER_VALIDATING', 'SERVER_INDEXING', 'READY'])
  assert.equal((await repository.get('job-1')).phase, 'READY')
  assert.equal(callbackCalls, 1)
  assert.equal(capture.entries.filter(([, entry]) => entry.event === 'FAILED').length, 0)
  } finally { capture.restore() }
})

test('rejects a cache ownership mismatch before any upload network call', async () => {
  const repository = new DocumentProcessingJobRepository('user-1', 'device-1', { storage: createMemoryStorage() })
  await repository.create({ jobId: 'job-1', sourceId: 'source-1', ingestionRevision: job().ingestionRevision })
  await repository.transition('job-1', 'EXTRACTING')
  await repository.transition('job-1', 'PACKAGING', { payloadCacheId: 'column-cache', payloadReceipt: receipt })
  const api = apiStub()
  let puts = 0
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository,
    api,
    put: async () => { puts += 1; return { bytesSent: 128, payloadSha256: receipt.payloadSha256 } },
  })

  await assert.rejects(() => coordinator.upload('job-1', receipt), /DOCUMENT_CACHE_OWNERSHIP_MISMATCH/)
  assert.deepEqual(api.calls, { intents: [], completes: [] })
  assert.equal(puts, 0)
  const current = await repository.get('job-1')
  assert.equal(current.payloadCacheId, 'column-cache')
  assert.equal(current.payloadReceipt.cacheId, receipt.cacheId)
})

test('rejects incomplete v1 metadata before creating an upload intent', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api,
    put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
  })
  const incomplete = { ...receipt, parserVersion: undefined }
  await assert.rejects(() => coordinator.upload('job-1', incomplete), /DOCUMENT_UPLOAD_RECEIPT_INVALID/)
  assert.equal(api.calls.intents.length, 0)
})

test('rejects a receipt without schema-v1 metadata before network calls', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  let puts = 0
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository,
    api,
    put: async () => { puts += 1; return { bytesSent: 128, payloadSha256: receipt.payloadSha256 } },
  })
  await assert.rejects(() => coordinator.upload('job-1', { ...receipt, payloadFormat: undefined }), /DOCUMENT_UPLOAD_RECEIPT_INVALID/)
  assert.deepEqual(api.calls, { intents: [], completes: [] })
  assert.equal(puts, 0)
})

test('rejects invalid v1 metadata before network calls', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  let puts = 0
  const firstCoordinator = new ParsedDocumentUploadCoordinator({
    repository,
    api,
    put: async () => { puts += 1; return { bytesSent: 128, payloadSha256: receipt.payloadSha256 } },
  })
  await assert.rejects(() => firstCoordinator.upload('job-1', { ...receipt, sourceAssetSha256: 'G'.repeat(64) }), /DOCUMENT_UPLOAD_RECEIPT_INVALID/)
  assert.deepEqual(api.calls, { intents: [], completes: [] })
  assert.equal(puts, 0)
})

test('expired signed URL re-intents without rerunning OCR or packaging', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  let putCalls = 0
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api,
    put: async () => {
      putCalls += 1
      if (putCalls === 1) throw new Error('DOCUMENT_UPLOAD_INTENT_EXPIRED')
      return { bytesSent: 128, payloadSha256: receipt.payloadSha256 }
    },
  })
  await coordinator.upload('job-1', receipt)
  assert.equal(api.calls.intents.length, 2)
  assert.equal(putCalls, 2)
})

test('network pause leaves the job resumable and does not call complete', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api,
    put: async () => { throw new Error('NETWORK_OFFLINE') },
  })
  await assert.rejects(() => coordinator.upload('job-1', receipt), /NETWORK_OFFLINE/)
  assert.equal(repository.value.phase, 'PAUSED_NETWORK')
  assert.equal(api.calls.completes.length, 0)
})

test('network upload failures preserve only bounded allowlisted reasons', async () => {
  const cases = [
    ['connect', 'NETWORK_OFFLINE:connect'],
    ['timeout', 'NETWORK_OFFLINE:timeout'],
    ['body', 'NETWORK_OFFLINE:body'],
    ['request', 'NETWORK_OFFLINE:request'],
    ['client', 'NETWORK_OFFLINE:client'],
    ['retryable-response', 'DOCUMENT_UPLOAD_RETRYABLE:503 https://storage.example/upload?sig=secret'],
  ]
  for (const [reason, message] of cases) {
    const repository = new FakeRepository()
    const coordinator = new ParsedDocumentUploadCoordinator({
      repository, api: apiStub(),
      put: async () => { throw new Error(message) },
    })
    await assert.rejects(() => coordinator.upload('job-1', receipt))
    assert.equal(repository.value.phase, 'PAUSED_NETWORK')
    assert.equal(repository.value.errorCode, 'NETWORK_OFFLINE')
    assert.equal(repository.value.errorDetail, `PARSED_DOCUMENT_UPLOAD_PAUSED:upload:${reason}`)
    assert.equal(repository.value.payloadReceipt, receipt)
    assert.ok(repository.value.errorDetail.length <= 80)
    assert.doesNotMatch(repository.value.errorDetail, /https?:\/\/|[?&]|authorization|content-type|C:\\|response body|secret/i)
  }
})

test('normalizes string Tauri command rejections into Error instances', () => {
  const error = normalizeInvokeError('NETWORK_OFFLINE:connect')
  assert.ok(error instanceof Error)
  assert.equal(error.message, 'NETWORK_OFFLINE:connect')
})

test('normalizes structured Tauri command rejections without discarding the Rust diagnostic', () => {
  assert.equal(normalizeInvokeError({ message: 'OCR_SIDECAR_UNAVAILABLE:pyinstaller-extraction-failed' }).message,
    'OCR_SIDECAR_UNAVAILABLE:pyinstaller-extraction-failed')
  assert.equal(normalizeInvokeError({ error: 'NETWORK_OFFLINE:connect' }).message, 'NETWORK_OFFLINE:connect')
})

test('completion is idempotent within one coordinator lifetime', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  let putCalls = 0
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api,
    put: async () => { putCalls += 1; return { bytesSent: 128, payloadSha256: receipt.payloadSha256 } },
  })
  const first = await coordinator.upload('job-1', receipt)
  const second = await coordinator.upload('job-1', receipt)
  assert.deepEqual(second, first)
  assert.equal(putCalls, 1)
  assert.equal(api.calls.completes.length, 1)
})

test('stale revision is surfaced as a server failure', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  api.completeParsedDocument = async () => { throw new Error('INGESTION_REVISION_STALE') }
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api,
    put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
  })
  await assert.rejects(() => coordinator.upload('job-1', receipt), /INGESTION_REVISION_STALE/)
  assert.equal(repository.value.phase, 'FAILED_SERVER')
  assert.equal(repository.value.errorCode, 'INGESTION_REVISION_STALE')
})

test('malicious server status is reduced to a fixed failure code and detail', async () => {
  const repository = new FakeRepository()
  const api = apiStub()
  api.completeParsedDocument = async () => ({
    parsedDocumentId: '22222222-2222-2222-2222-222222222222',
    status: 'REJECTED:https://storage.example/object?sig=secret Authorization:Bearer token C:\\temp\\body.txt',
  })
  const coordinator = new ParsedDocumentUploadCoordinator({
    repository, api,
    put: async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }),
  })
  await assert.rejects(() => coordinator.upload('job-1', receipt), /PARSED_DOCUMENT_SERVER_REJECTED/)
  assert.equal(repository.value.errorCode, 'PARSED_DOCUMENT_SERVER_REJECTED')
  assert.equal(repository.value.errorDetail, 'Parsed document server rejected')
  assert.doesNotMatch(`${repository.value.errorCode} ${repository.value.errorDetail}`, /https?:\/\/|[?&]|authorization|Bearer|C:\\|body\.txt/i)
})

test('non-network upload and completion exceptions use stable fallback diagnostics', async () => {
  for (const [stage, put, complete] of [
    ['upload', async () => { throw new Error('https://storage.example/object?sig=secret Authorization:Bearer token C:\\tmp\\response body') }, undefined],
    ['complete', async () => ({ bytesSent: 128, payloadSha256: receipt.payloadSha256 }), async () => { throw new Error('response body https://storage.example/object?sig=secret') }],
  ]) {
    const repository = new FakeRepository()
    const api = apiStub()
    if (complete) api.completeParsedDocument = complete
    const coordinator = new ParsedDocumentUploadCoordinator({ repository, api, put })
    await assert.rejects(() => coordinator.upload('job-1', receipt))
    assert.equal(repository.value.phase, stage === 'upload' ? 'FAILED_LOCAL' : 'FAILED_SERVER')
    assert.equal(repository.value.errorCode, stage === 'upload' ? 'PARSED_DOCUMENT_UPLOAD_FAILED' : 'PARSED_DOCUMENT_COMPLETE_FAILED')
    assert.equal(repository.value.errorDetail, stage === 'upload' ? 'Parsed document upload failed' : 'Parsed document completion failed')
    assert.doesNotMatch(`${repository.value.errorCode} ${repository.value.errorDetail}`, /https?:\/\/|[?&]|authorization|Bearer|C:\\|response body|secret/i)
  }
})

test('upload boundary keeps transport in Rust and never exposes plaintext or persists signed URLs', () => {
  const tauriSource = fs.readFileSync(path.join(root, 'src', 'api', 'tauri.ts'), 'utf8')
  const coordinatorSource = fs.readFileSync(path.join(root, 'src', 'services', 'documentProcessing', 'ParsedDocumentUploadCoordinator.ts'), 'utf8')
  const rustSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'document_upload.rs'), 'utf8')
  assert.match(tauriSource, /document_upload_put/)
  assert.doesNotMatch(tauriSource, /fetch\(|XMLHttpRequest/)
  assert.doesNotMatch(coordinatorSource, /localStorage|sessionStorage|document\.text|plaintext|plainText/)
  assert.match(rustSource, /open_decrypted_reader/)
  assert.match(rustSource, /Body::sized/)
})
