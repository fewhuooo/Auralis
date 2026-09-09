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

const { SourceJobScheduler } = await import('../src/services/documentProcessing/sourceJobScheduler.ts')
const { DocumentJobRunner } = await import('../src/services/documentProcessing/DocumentJobRunner.ts')
const { ParsedDocumentUploadCoordinator } = await import('../src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts')

const assetSha256 = 'a'.repeat(64)

class FakeRepository {
  constructor() {
    this.jobs = new Map()
    this.phases = []
  }

  async create(input) {
    const job = {
      jobId: input.jobId, userId: 'user-1', serverDeviceId: 'device-1', sourceId: input.sourceId,
      ingestionRevision: input.ingestionRevision, phase: 'QUEUED', attempt: 0,
      checkpoint: { pageNumber: 0, blockOrdinal: 0 }, payloadCacheId: null, payloadReceipt: null,
      errorCode: null, errorDetail: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    }
    this.jobs.set(job.jobId, job)
    this.phases.push(job.phase)
    return structuredClone(job)
  }

  async get(jobId) {
    const job = this.jobs.get(jobId)
    return job ? structuredClone(job) : null
  }

  async list() {
    return [...this.jobs.values()].map((job) => structuredClone(job))
  }

  async transition(jobId, phase, options = {}) {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('DOCUMENT_JOB_NOT_FOUND')
    Object.assign(job, options, { phase, updatedAt: '2026-09-01T00:00:01.000Z' })
    this.phases.push(phase)
    return structuredClone(job)
  }
}

function packager() {
  return {
    async begin() { return 'cache-package-1' },
    async append() {},
    async finish() {
      return {
        cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 1, encryptedBytes: 96,
        plainTextSha256: 'b'.repeat(64), payloadSha256: 'c'.repeat(64), payloadBytes: 48,
        payloadFormat: 'parsed-document-v1', sourceAssetSha256: assetSha256,
        parserId: 'auralis-local-parser', parserVersion: 'auralis-document-parser/1.0.0',
        normalizationVersion: 'auralis-normalization/1.0.0', ocrModelVersion: null,
      }
    },
  }
}

test('scan-style FILE processing flows from local OCR block through encrypted upload to READY', async () => {
  const repository = new FakeRepository()
  const runner = new DocumentJobRunner({
    repository,
    packager: packager(),
    parserFactory: async () => async (sink) => {
      await sink({ ordinal: 0, kind: 'ocr-page', text: '扫描页 OCR 结果', pageNumber: 1 })
    },
  })
  const apiCalls = { intent: 0, complete: 0, put: 0 }
  const upload = new ParsedDocumentUploadCoordinator({
    repository,
    api: {
      async createParsedDocumentUploadIntent() {
        apiCalls.intent += 1
        return {
          parsedDocumentId: 'parsed-1', ingestionRevision: 'revision-1', uploadUrl: 'https://storage.example/upload',
          headers: { 'Content-Type': 'application/gzip' }, expiresAt: '2026-09-01T00:05:00.000Z',
        }
      },
      async completeParsedDocument() {
        apiCalls.complete += 1
        return { parsedDocumentId: 'parsed-1', status: 'ACCEPTED', generation: 'generation-1' }
      },
    },
    put: async (request) => {
      apiCalls.put += 1
      return { status: 200, bytesSent: request.expectedSize, payloadSha256: request.expectedPayloadSha256 }
    },
  })
  const updates = []
  const scheduler = new SourceJobScheduler({
    repository,
    sourceApi: { async get() {
      return {
        id: 'source-1', type: 'FILE', title: '扫描讲义.pdf', assetId: 'asset-1',
        ingestionStatus: 'AWAITING_CLIENT', ingestionRevision: 'revision-1',
      }
    } },
    resolveLocalInput: async () => ({ file: { name: '扫描讲义.pdf', type: 'application/pdf', size: 12 } }),
    downloadAsset: async () => { throw new Error('DOWNLOAD_SHOULD_NOT_RUN') },
    hashFile: async () => assetSha256,
    expectedAssetSha256: async () => assetSha256,
    prepareInput: async () => {},
    runJob: (jobId, metadata) => runner.start(jobId, metadata),
    upload,
    onJobChanged: async () => { updates.push((await repository.list()).map((job) => job.phase)) },
  })

  const result = await scheduler.schedule('source-1')

  assert.equal(result.status, 'READY')
  assert.deepEqual(apiCalls, { intent: 1, complete: 1, put: 1 })
  assert.equal(repository.phases.includes('OCR_RUNNING'), true)
  assert.equal(repository.phases.includes('PACKAGING'), true)
  assert.equal(repository.phases.includes('UPLOADING'), true)
  assert.equal(repository.phases.at(-1), 'READY')
  assert.deepEqual(updates[0], ['QUEUED'])
  assert.deepEqual(updates.at(-1), ['READY'])
})
