import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DocumentJobRunner } from '../src/services/documentProcessing/DocumentJobRunner.ts'

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
    deviceId: 'device-1',
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
      }
    },
  }
}

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

  await runner.start('job-1')
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

  await runner.start('job-1')
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

  await runner.start('job-1')
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

  await runner.start('job-1')
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

  await runner.start('job-1')
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

  await Promise.all([runner.start('job-1'), runner.start('job-1')])
  assert.equal(parseCalls, 1)
  assert.equal((await repository.get('job-1')).phase, phases.PACKAGING)
})
