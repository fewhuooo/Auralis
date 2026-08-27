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
const root = path.resolve(import.meta.dirname, '..')

const receipt = {
  cacheId: 'cache-1',
  envelopeVersion: 1,
  chunkCount: 2,
  encryptedBytes: 256,
  plainTextSha256: 'a'.repeat(64),
  payloadSha256: 'b'.repeat(64),
  payloadBytes: 128,
}

function job(phase = 'PACKAGING') {
  return {
    jobId: 'job-1', userId: 'user-1', deviceId: 'device-1', sourceId: 'source-1',
    ingestionRevision: '11111111-1111-1111-1111-111111111111', phase, attempt: 0,
    checkpoint: { pageNumber: 1, blockOrdinal: 2 }, payloadCacheId: 'cache-1',
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

test('upload boundary keeps transport in Rust and never exposes plaintext or persists signed URLs', () => {
  const tauriSource = fs.readFileSync(path.join(root, 'src', 'api', 'tauri.ts'), 'utf8')
  const coordinatorSource = fs.readFileSync(path.join(root, 'src', 'services', 'documentProcessing', 'ParsedDocumentUploadCoordinator.ts'), 'utf8')
  const rustSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'document_upload.rs'), 'utf8')
  assert.match(tauriSource, /document_upload_put/)
  assert.doesNotMatch(tauriSource, /fetch\(|XMLHttpRequest/)
  assert.doesNotMatch(coordinatorSource, /localStorage|sessionStorage|document\.text|plaintext|plainText/)
  assert.match(rustSource, /open_decrypted_reader/)
  assert.match(rustSource, /Body::new/)
})
