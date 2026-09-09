import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DocumentJobRunner } from '../src/services/documentProcessing/DocumentJobRunner.ts'
import { OcrDocumentEmptyError } from '../src/services/documentParser/types.ts'

const phases = {
  QUEUED: 'QUEUED',
  EXTRACTING: 'EXTRACTING',
  OCR_RUNNING: 'OCR_RUNNING',
  PACKAGING: 'PACKAGING',
  READY: 'READY',
  FAILED_LOCAL: 'FAILED_LOCAL',
  FAILED_SERVER: 'FAILED_SERVER',
  PAUSED_NETWORK: 'PAUSED_NETWORK',
}

function job(jobId = 'job-1') {
  return {
    jobId,
    userId: 'user-a',
    serverDeviceId: 'device-1',
    sourceId: 'source-1',
    ingestionRevision: 'revision-1',
    phase: phases.QUEUED,
    attempt: 0,
    checkpoint: { pageNumber: 0, blockOrdinal: 0 },
    payloadCacheId: null,
    payloadReceipt: null,
    errorCode: null,
    errorDetail: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  }
}

function packageMetadata() {
  return { sourceAssetSha256: 'c'.repeat(64), ocrModelVersion: null }
}

class FakeRepository {
  constructor(initial = [job()]) {
    this.jobs = new Map(initial.map((item) => [item.jobId, structuredClone(item)]))
  }

  async get(jobId) {
    const value = this.jobs.get(jobId)
    return value ? structuredClone(value) : null
  }

  async list() {
    return [...this.jobs.values()].map((item) => structuredClone(item))
  }

  async transition(jobId, phase, options = {}) {
    const current = this.jobs.get(jobId)
    if (!current) throw new Error('DOCUMENT_JOB_NOT_FOUND')
    current.phase = phase
    current.attempt = options.attempt ?? current.attempt
    current.checkpoint = options.checkpoint ?? current.checkpoint
    current.payloadCacheId = options.payloadCacheId ?? current.payloadCacheId
    current.payloadReceipt = options.payloadReceipt ?? current.payloadReceipt
    current.errorCode = options.errorCode ?? null
    current.errorDetail = options.errorDetail ?? null
    return structuredClone(current)
  }
}

class TransitionValidatingRepository extends FakeRepository {
  constructor(initial) {
    super(initial)
    this.transitions = []
  }

  async transition(jobId, phase, options = {}) {
    const current = await this.get(jobId)
    const allowed = {
      QUEUED: ['EXTRACTING', 'FAILED_LOCAL'],
      EXTRACTING: ['EXTRACTING', 'OCR_RUNNING', 'PACKAGING', 'FAILED_LOCAL'],
      OCR_RUNNING: ['OCR_RUNNING', 'PACKAGING', 'FAILED_LOCAL'],
      PACKAGING: ['PACKAGING'],
    }
    if (current && current.phase !== phase && !allowed[current.phase]?.includes(phase)) {
      throw new Error(`DOCUMENT_JOB_ILLEGAL_TRANSITION:${current.phase}->${phase}`)
    }
    this.transitions.push([current?.phase, phase])
    return super.transition(jobId, phase, options)
  }
}

function packageAdapter() {
  const calls = []
  return {
    calls,
    async begin() {
      calls.push(['begin'])
      return 'cache-package-1'
    },
    async append(packageId, block) {
      calls.push(['append', packageId, block.ordinal])
    },
    async finish(packageId) {
      calls.push(['finish', packageId])
      return {
        cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 1, encryptedBytes: 64,
        plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 32,
        payloadFormat: 'parsed-document-v1', sourceAssetSha256: 'c'.repeat(64),
        parserId: 'auralis-document-parser', parserVersion: '1.0.0', normalizationVersion: 'nfkc-lf-trim', ocrModelVersion: null,
      }
    },
  }
}

test('mixed text OCR text pages keep OCR_RUNNING after OCR has started', async () => {
  const repository = new TransitionValidatingRepository()
  const runner = new DocumentJobRunner({
    repository,
    packager: packageAdapter(),
    parserFactory: async () => async (sink) => {
      await sink({ ordinal: 0, kind: 'page', text: 'text page one', pageNumber: 1 })
      await sink({ ordinal: 1, kind: 'ocr-page', text: 'ocr page two', pageNumber: 2 })
      await sink({ ordinal: 2, kind: 'page', text: 'text page three', pageNumber: 3 })
    },
  })

  await runner.start('job-1', packageMetadata())
  const completed = await repository.get('job-1')
  assert.equal(completed.phase, phases.PACKAGING)
  assert.deepEqual(completed.checkpoint, { pageNumber: 3, blockOrdinal: 2 })
  assert.deepEqual(repository.transitions.map(([, phase]) => phase), [
    phases.EXTRACTING, phases.EXTRACTING, phases.OCR_RUNNING, phases.OCR_RUNNING, phases.PACKAGING,
  ])
})

test('app close keeps a safe checkpoint and can resume later', async () => {
  const repository = new FakeRepository()
  const packager = packageAdapter()
  const runner = new DocumentJobRunner({
    repository,
    packager,
    parserFactory: async () => async (sink) => {
      await sink({ ordinal: 0, kind: 'page', text: 'page one', pageNumber: 1 })
      throw new Error('APP_CLOSED')
    },
  })

  await runner.start('job-1', packageMetadata())
  const paused = await repository.get('job-1')
  assert.equal(paused.phase, phases.EXTRACTING)
  assert.deepEqual(paused.checkpoint, { pageNumber: 1, blockOrdinal: 0 })
  assert.equal(paused.errorCode, null)
})

test('sidecar crash retries up to the limit and preserves packaging receipt', async () => {
  const repository = new FakeRepository()
  const packager = packageAdapter()
  let attempts = 0
  const runner = new DocumentJobRunner({
    repository,
    packager,
    parserFactory: async () => async (sink) => {
      attempts += 1
      if (attempts < 3) throw new Error('OCR_MODEL_FAILED')
      await sink({ ordinal: 0, kind: 'ocr-page', text: 'recovered', pageNumber: 1 })
    },
  })

  await runner.start('job-1', packageMetadata())
  const completed = await repository.get('job-1')
  assert.equal(attempts, 3)
  assert.equal(completed.phase, phases.PACKAGING)
  assert.equal(completed.payloadCacheId, 'cache-1')
  assert.equal(completed.payloadReceipt.payloadSha256, 'b'.repeat(64))
})

test('packaging jobs resume through the upload coordinator instead of re-running the parser', async () => {
  const repository = new FakeRepository([{
    ...job(),
    phase: phases.PACKAGING,
    payloadCacheId: 'cache-1',
    payloadReceipt: {
      cacheId: 'cache-1', envelopeVersion: 1, chunkCount: 1, encryptedBytes: 64,
      plainTextSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), payloadBytes: 32,
    },
  }])
  let parseCalls = 0
  const runner = new DocumentJobRunner({
    repository,
    packager: packageAdapter(),
    parserFactory: async () => async () => { parseCalls += 1 },
  })

  await runner.start('job-1', packageMetadata())
  assert.equal(parseCalls, 0)
  assert.equal((await repository.get('job-1')).phase, phases.PACKAGING)
})

test('network failure pauses and explicit resume requeues the job', async () => {
  const repository = new FakeRepository()
  const runner = new DocumentJobRunner({
    repository,
    packager: packageAdapter(),
    parserFactory: async () => async () => {
      throw new Error('NETWORK_OFFLINE')
    },
  })

  await runner.start('job-1', packageMetadata())
  assert.equal((await repository.get('job-1')).phase, phases.PAUSED_NETWORK)
  await runner.pauseForNetwork('job-1')
  assert.equal((await repository.get('job-1')).phase, phases.PAUSED_NETWORK)
})

test('retry exhaustion marks a local failure after three attempts', async () => {
  const repository = new FakeRepository()
  let attempts = 0
  const runner = new DocumentJobRunner({
    repository,
    packager: packageAdapter(),
    parserFactory: async () => async () => {
      attempts += 1
      throw new Error('OCR_MODEL_FAILED')
    },
  })

  await runner.start('job-1', packageMetadata())
  const failed = await repository.get('job-1')
  assert.equal(attempts, 3)
  assert.equal(failed.phase, phases.FAILED_LOCAL)
  assert.equal(failed.errorCode, 'OCR_RETRY_EXHAUSTED')
})

test('duplicate starts for one revision share a serial in-flight execution', async () => {
  const repository = new FakeRepository()
  const packager = packageAdapter()
  let parseCalls = 0
  const runner = new DocumentJobRunner({
    repository,
    packager,
    parserFactory: async () => async () => {
      parseCalls += 1
    },
  })

  await Promise.all([runner.start('job-1', packageMetadata()), runner.start('job-1', packageMetadata())])
  assert.equal(parseCalls, 1)
  assert.equal((await repository.get('job-1')).phase, phases.PACKAGING)
})

test('cancelling an active job stops later parser blocks and aborts its unfinished encrypted package', async () => {
  const repository = new FakeRepository()
  const packager = packageAdapter()
  let releaseParser
  const parserPaused = new Promise((resolve) => { releaseParser = resolve })
  const firstBlockAppended = new Promise((resolve) => {
    const append = packager.append
    packager.append = async (...args) => {
      await append(...args)
      resolve()
    }
  })
  let abortCalls = 0
  packager.abort = async () => { abortCalls += 1 }
  const runner = new DocumentJobRunner({
    repository,
    packager,
    parserFactory: async () => async (sink) => {
      await sink({ ordinal: 0, kind: 'ocr-page', text: 'first', pageNumber: 1 })
      await parserPaused
      await sink({ ordinal: 1, kind: 'ocr-page', text: 'second', pageNumber: 2 })
    },
  })

  const running = runner.start('job-1', packageMetadata())
  await firstBlockAppended
  await runner.cancel('job-1')
  releaseParser()
  await running

  const cancelled = await repository.get('job-1')
  assert.equal(cancelled.phase, phases.FAILED_LOCAL)
  assert.equal(cancelled.errorCode, 'DOCUMENT_CANCELLED')
  assert.deepEqual(packager.calls.filter(([name]) => name === 'append').map(([, , ordinal]) => ordinal), [0])
  assert.equal(packager.calls.some(([name]) => name === 'finish'), false)
  assert.equal(abortCalls, 1)
})

test('persists OCR_RUNNING and page diagnostic before the first OCR block', async () => {
  const repository = new FakeRepository()
  const packager = packageAdapter()
  let observed
  const runner = new DocumentJobRunner({
    repository,
    packager,
    parserFactory: async () => async (_sink, onProgress) => {
      await onProgress({ type: 'before-recognize', pageNumber: 2, totalPages: 4, imageBytes: 2048 })
      observed = await repository.get('job-1')
      await new Promise(() => {})
    },
  })
  const running = runner.start('job-1', packageMetadata())
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(observed.phase, phases.OCR_RUNNING)
  assert.deepEqual(observed.checkpoint, {
    pageNumber: 2,
    blockOrdinal: 0,
    diagnostic: { pageNumber: 2, totalPages: 4, imageBytes: 2048, outcome: 'running' },
  })
  assert.equal(packager.calls.some(([name]) => name === 'append'), false)
  await runner.cancel('job-1')
  await Promise.race([running, new Promise((resolve) => setTimeout(resolve, 20))])
})

test('empty OCR document persists stable code and bounded safe diagnostic detail', async () => {
  const repository = new FakeRepository()
  const runner = new DocumentJobRunner({
    repository,
    packager: packageAdapter(),
    parserFactory: async () => async (_sink, onProgress) => {
      await onProgress({ type: 'before-recognize', pageNumber: 1, totalPages: 1, imageBytes: 128 })
      throw new OcrDocumentEmptyError({ pageNumber: 1, totalPages: 1, imageBytes: 128, rawLineCount: 2, normalizedLineCount: 0, timingMs: { det: 4, rec: 5, total: 9 } })
    },
  })
  await runner.start('job-1', packageMetadata())
  const failed = await repository.get('job-1')
  assert.equal(failed.errorCode, 'OCR_DOCUMENT_EMPTY')
  assert.match(failed.errorDetail, /page=1\/1/)
  assert.match(failed.errorDetail, /attempt=0/)
  assert.doesNotMatch(failed.errorDetail, /OcrDocumentEmptyError|recognize|path|text|det/)
  assert.ok(failed.errorDetail.length <= 240)
})

test('successful OCR block keeps the final text diagnostic when ordinal advances', async () => {
  const repository = new FakeRepository()
  const runner = new DocumentJobRunner({
    repository,
    packager: packageAdapter(),
    parserFactory: async () => async (sink, onProgress) => {
      await onProgress({ type: 'before-recognize', pageNumber: 1, totalPages: 1, imageBytes: 128 })
      await onProgress({ type: 'page-result', pageNumber: 1, totalPages: 1, imageBytes: 128, rawLineCount: 2, normalizedLineCount: 1, timingMs: { det: 2, rec: 3, total: 5 } })
      await sink({ ordinal: 0, kind: 'ocr-page', text: 'recognized', pageNumber: 1 })
    },
  })
  await runner.start('job-1', packageMetadata())
  const completed = await repository.get('job-1')
  assert.equal(completed.checkpoint.blockOrdinal, 0)
  assert.deepEqual(completed.checkpoint.diagnostic, { pageNumber: 1, totalPages: 1, imageBytes: 128, rawLineCount: 2, normalizedLineCount: 1, totalMs: 5, outcome: 'text' })
})

test('next page before-recognize preserves the previous cumulative OCR checkpoint', async () => {
  const repository = new FakeRepository()
  const runner = new DocumentJobRunner({
    repository,
    packager: packageAdapter(),
    parserFactory: async () => async (_sink, onProgress) => {
      await onProgress({ type: 'page-result', pageNumber: 1, totalPages: 2, imageBytes: 128, rawLineCount: 3, normalizedLineCount: 2, timingMs: { det: 2, rec: 3, total: 5 }, ocrProcessedPages: 1, ocrTextPages: 1, ocrEmptyPages: 0, totalRawLineCount: 3, totalNormalizedLineCount: 2 })
      await onProgress({ type: 'before-recognize', pageNumber: 2, totalPages: 2, imageBytes: 256 })
    },
  })

  const running = runner.start('job-1', packageMetadata())
  await new Promise((resolve) => setTimeout(resolve, 10))
  const checkpoint = (await repository.get('job-1')).checkpoint
  assert.deepEqual(checkpoint.diagnostic, {
    pageNumber: 2, totalPages: 2, imageBytes: 256, outcome: 'running',
    ocrProcessedPages: 1, ocrTextPages: 1, ocrEmptyPages: 0, totalRawLineCount: 3, totalNormalizedLineCount: 2,
  })
  await runner.cancel('job-1')
  await running
})
