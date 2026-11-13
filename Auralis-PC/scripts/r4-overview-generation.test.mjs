import assert from 'node:assert/strict'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

function createTestLockManager() {
  const tails = new Map()
  return { request(name, _options, operation) {
    const previous = tails.get(name) ?? Promise.resolve()
    let release
    const held = new Promise(resolve => { release = resolve })
    const tail = previous.then(() => held, () => held)
    tails.set(name, tail)
    return previous.then(operation).finally(() => { release(); if (tails.get(name) === tail) tails.delete(name) })
  } }
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: createTestLockManager() } })

const { OverviewGenerationService } = await import('../src/services/overviewGenerationService.ts')
const { OverviewRepository } = await import('../src/services/overviewRepository.ts')
const { validateGeneratedOverviewResponse } = await import('../src/api/overviewResponseValidator.ts')
const { classifyOverviewFailure, overviewFailureMessage } = await import('../src/services/overviewFailurePolicy.ts')
const source = async (relativePath) => readFile(path.resolve(import.meta.dirname, '..', relativePath), 'utf8')

function assertCallsiteLiteral(text, marker, literal) {
  const start = text.indexOf(marker)
  assert.notEqual(start, -1, `missing callsite marker: ${marker}`)
  const callsite = text.slice(start, start + 1000)
  assert.match(callsite, new RegExp(`resumePending\\(['"]${literal}['"]\\)`))
}

function assertGeneratorCallsiteLiteral(text, marker, literal) {
  const start = text.indexOf(marker)
  assert.notEqual(start, -1, `missing generator callsite marker: ${marker}`)
  const callsite = text.slice(start, start + 500)
  assert.match(callsite, new RegExp(`generateReadyFileOverview\\([^)]*,\\s*[^)]*,\\s*['"]${literal}['"]\\)`))
}

const outlineMarkdown = '## 第一章\n- 第一节'
const summaryMarkdown = '文件概述'
const response = (mode = 'ALL') => ({
  schemaVersion: 2,
  title: '文件总览',
  outlineMarkdown: mode === 'SUMMARY' ? null : outlineMarkdown,
  summaryMarkdown: mode === 'OUTLINE' ? null : summaryMarkdown,
})

class FakeOverviewRepository {
  constructor() { this.files = new Map(); this.subjects = new Map(); this.failures = []; this.removedOverviewSources = []; this.removedSubjectOverviews = []; this.userId = 'test-user'; this.serverDeviceId = 'test-device' }
  captureScopeFenceToken(scopeType, scopeId) { return { userId: this.userId, serverDeviceId: this.serverDeviceId, scopeType, scopeId, generation: 0 } }
  isScopeFenceTokenCurrent() { return true }
  async getFileOverview(sourceId, revision) { return this.files.get(`${sourceId}:${revision}`) ?? null }
  async saveFileOverviewPart(input) {
    const key = `${input.sourceId}:${input.ingestionRevision}`
    const previous = this.files.get(key)
    const next = {
      ...(previous ?? { sourceId: input.sourceId, ingestionRevision: input.ingestionRevision, outlineMarkdown: null, summaryMarkdown: null }),
      title: input.response.title,
      outlineMarkdown: input.mode === 'SUMMARY' ? previous?.outlineMarkdown ?? null : input.response.outlineMarkdown,
      summaryMarkdown: input.mode === 'OUTLINE' ? previous?.summaryMarkdown ?? null : input.response.summaryMarkdown,
      status: 'READY',
    }
    this.files.set(key, next)
    return next
  }
  async markFileOverviewFailed(sourceId, revision, mode, code, detail) {
    this.failures.push({ sourceId, revision, mode, code, detail })
    const key = `${sourceId}:${revision}`
    if (!this.files.has(key)) {
      this.files.set(key, {
        sourceId,
        ingestionRevision: revision,
        title: '',
        outlineMarkdown: null,
        summaryMarkdown: null,
        status: 'FAILED',
        errorCode: code,
        errorDetail: detail,
      })
    }
  }
  async removeFileOverviews(sourceId) {
    this.removedOverviewSources.push(sourceId)
    for (const key of this.files.keys()) if (key.startsWith(`${sourceId}:`)) this.files.delete(key)
  }
  async removeSubjectOverview(subjectId) {
    this.removedSubjectOverviews.push(subjectId)
    this.subjects.delete(subjectId)
  }
  async getSubjectOverview(subjectId) { return this.subjects.get(subjectId) ?? null }
  async saveSubjectOverviewPart(input) {
    const current = this.subjects.get(input.subjectId)
    const next = {
      ...(current ?? { subjectId: input.subjectId, outlineMarkdown: null, summaryMarkdown: null }),
      inputFingerprint: input.inputFingerprint,
      title: input.response.title,
      outlineMarkdown: input.mode === 'SUMMARY' ? current?.outlineMarkdown ?? null : input.response.outlineMarkdown,
      summaryMarkdown: input.mode === 'OUTLINE' ? current?.summaryMarkdown ?? null : input.response.summaryMarkdown,
      status: 'READY',
    }
    this.subjects.set(input.subjectId, next)
    return next
  }
  async markSubjectOverviewFailed(subjectId, mode, code, detail) { this.failures.push({ subjectId, mode, code, detail }) }
}

class BarrierOverviewSqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:')
    this.blockNextCacheWrite = false
    this.cacheWriteReached = null
    this.releaseCacheWrite = null
    this.completedTransactions = 0
  }
  async execute(sql, values = []) {
    if (this.blockNextCacheWrite && sql.trimStart().toUpperCase().startsWith('INSERT INTO AI_OVERVIEW_CACHE')) {
      this.blockNextCacheWrite = false
      this.cacheWriteReached?.()
      await new Promise((resolve) => { this.releaseCacheWrite = resolve })
    }
    this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...values)
  }
  async select(sql, values = []) { return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...values) }
  async transaction(operation) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = await operation(this)
      this.database.exec('COMMIT')
      this.completedTransactions += 1
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      this.completedTransactions += 1
      throw error
    }
  }
  blockCacheWrite() {
    this.blockNextCacheWrite = true
    return new Promise((resolve) => { this.cacheWriteReached = resolve })
  }
  release() { this.releaseCacheWrite?.() }
  async waitForTransactions(expected) {
    for (let attempt = 0; attempt < 500 && this.completedTransactions < expected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    assert.equal(this.completedTransactions, expected)
  }
  close() { this.database.close() }
}

function sourceApi(source) {
  return { async get() { return source } }
}

const automaticTriggers = [
  'SOURCE_READY',
  'RESUME_BOOTSTRAP',
  'RESUME_ONLINE',
  'RESUME_SYNC',
  'JOB_CHANGED',
]

function readyService(repository, generateSourceOverview) {
  return new OverviewGenerationService({
    api: { generateSourceOverview },
    repository,
    sourceApi: sourceApi({
      id: 'source-1',
      type: 'FILE',
      ingestionStatus: 'READY',
      ingestionRevision: 'rev-1',
    }),
  })
}

test('automatic triggers require a missing cache and never retry failed or partial records', async () => {
  const records = [
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outlineMarkdown: null, summaryMarkdown: null,
      status: 'FAILED', errorCode: 'MODEL_TIMEOUT', errorDetail: 'safe',
      expectedOutcome: 'SKIPPED_FAILED_REQUIRES_MANUAL_RETRY' },
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outlineMarkdown: null, summaryMarkdown: null,
      status: 'FAILED', errorCode: 'MODEL_PROVIDER_ERROR', errorDetail: 'safe',
      expectedOutcome: 'SKIPPED_FAILED_REQUIRES_MANUAL_RETRY' },
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '文件总览', outlineMarkdown, summaryMarkdown: null,
      status: 'READY', errorCode: null, errorDetail: null,
      expectedOutcome: 'PARTIAL_REQUIRES_MANUAL_RETRY' },
  ]
  for (const existing of records) {
    const repository = new FakeOverviewRepository()
    repository.files.set('source-1:rev-1', existing)
    let calls = 0
    const events = []
    const originalInfo = console.info
    console.info = (prefix, payload) => {
      if (prefix === '[FILE_OVERVIEW_TRIGGER]') events.push(payload)
    }
    try {
      const service = readyService(repository, async () => {
        calls += 1
        return response('ALL')
      })

      for (const trigger of automaticTriggers) {
        await service.generateReadyFileOverview('source-1', 'rev-1', trigger)
      }
      assert.equal(calls, 0)
      const skippedEvents = events.filter((event) => event.event === 'SKIPPED')
      assert.equal(skippedEvents.length, automaticTriggers.length)
      for (const event of skippedEvents) {
        assert.equal(event.outcome, existing.expectedOutcome)
      }
    } finally {
      console.info = originalInfo
    }
  }
})

test('automatic terminal skips return structured results without notifying or replacing partial cache', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveFileOverviewPart({
    sourceId: 'source-1',
    ingestionRevision: 'rev-1',
    mode: 'OUTLINE',
    response: response('OUTLINE'),
  })
  const notifications = []
  let calls = 0
  const service = readyService(repository, async () => {
    calls += 1
    notifications.push('unexpected')
    return response('ALL')
  })

  const result = await service.generateReadyFileOverview('source-1', 'rev-1', 'RESUME_ONLINE')

  assert.deepEqual(result, { status: 'SKIPPED', code: 'PARTIAL_REQUIRES_MANUAL_RETRY' })
  assert.deepEqual(notifications, [])
  assert.equal(calls, 0)
  const cached = await repository.getFileOverview('source-1', 'rev-1')
  assert.deepEqual(cached.outlineMarkdown, outlineMarkdown)
  assert.equal(cached.summaryMarkdown, null)
})

test('automatic provider failure returns a structured result and does not recursively retry', async () => {
  const repository = new FakeOverviewRepository()
  let calls = 0
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview() {
        calls += 1
        throw { code: 'MODEL_PROVIDER_ERROR' }
      },
    },
    repository,
    sourceApi: sourceApi({
      id: 'source-1',
      type: 'FILE',
      ingestionStatus: 'READY',
      ingestionRevision: 'rev-1',
    }),
    listReadyFiles: async () => [{ sourceId: 'source-1', ingestionRevision: 'rev-1' }],
  })

  const result = await service.generateReadyFileOverview('source-1', 'rev-1', 'SOURCE_READY')

  assert.deepEqual(result, {
    status: 'FAILED',
    code: 'MODEL_PROVIDER_ERROR',
    detail: 'Overview generation failed: MODEL_PROVIDER_ERROR',
  })
  assert.equal(calls, 1)
  assert.equal(repository.failures.at(-1).code, 'MODEL_PROVIDER_ERROR')

  await service.resumePending('RESUME_ONLINE')
  assert.equal(calls, 1)
})

test('automatic trigger still generates once when the current revision has no cache', async () => {
  const repository = new FakeOverviewRepository()
  let calls = 0
  const service = readyService(repository, async () => {
    calls += 1
    return response('ALL')
  })

  await service.generateReadyFileOverview('source-1', 'rev-1', 'SOURCE_READY')
  assert.equal(calls, 1)
})

test('manual retry bypasses terminal cache policy and still coalesces duplicate clicks', async () => {
  const repository = new FakeOverviewRepository()
  repository.files.set('source-1:rev-1', {
    sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outlineMarkdown: null, summaryMarkdown: null,
    status: 'FAILED', errorCode: 'MODEL_PROVIDER_ERROR', errorDetail: 'safe',
   })
  const gate = Promise.withResolvers()
  let calls = 0
  const service = readyService(repository, async () => {
    calls += 1
    await gate.promise
    return response('ALL')
  })

  const first = service.regenerateFileOverview('source-1', 'ALL')
  const second = service.regenerateFileOverview('source-1', 'ALL')
  gate.resolve()
  await Promise.all([first, second])
  assert.equal(calls, 1)
})

test('manual file regeneration returns a structured skipped result without replacing cached content', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { throw new Error('must not call provider') } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'PARSING', ingestionRevision: 'rev-1' }),
  })

  const result = await service.regenerateFileOverview('source-1', 'OUTLINE')

  assert.deepEqual(result, { status: 'SKIPPED', code: 'SOURCE_NOT_READY' })
  const cached = await repository.getFileOverview('source-1', 'rev-1')
  assert.deepEqual(cached.outlineMarkdown, outlineMarkdown)
  assert.deepEqual(cached.summaryMarkdown, summaryMarkdown)
  assert.equal(repository.failures.length, 0)
})

test('manual file regeneration returns STARTED with request id after successful completion', async () => {
  const repository = new FakeOverviewRepository()
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { return response('OUTLINE') } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    requestIdFactory: () => 'request-started',
  })

  const result = await service.regenerateFileOverview('source-1', 'OUTLINE')

  assert.deepEqual(result, { status: 'STARTED', requestId: 'request-started' })
})

test('manual file retry sends the last dispatched request id as retryOfRequestId with a fresh request id', async () => {
  const repository = new FakeOverviewRepository()
  const requests = []
  let nextId = 0
  let calls = 0
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(request, context) {
      requests.push({ request, requestId: context.requestId })
      context.onRequestDispatched?.()
      calls += 1
      if (calls === 1) throw Object.assign(new Error('provider unavailable'), { code: 'MODEL_PROVIDER_ERROR' })
      return response('OUTLINE')
    } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    requestIdFactory: () => `file-request-${++nextId}`,
  })

  const first = await service.regenerateFileOverview('source-1', 'OUTLINE')
  const second = await service.regenerateFileOverview('source-1', 'OUTLINE')

  assert.equal(first.status, 'FAILED')
  assert.equal(second.status, 'STARTED')
  assert.deepEqual(requests.map(({ request, requestId }) => ({ retryOfRequestId: request.retryOfRequestId ?? null, requestId })), [
    { retryOfRequestId: null, requestId: 'file-request-2' },
    { retryOfRequestId: 'file-request-2', requestId: 'file-request-4' },
  ])
})

test('manual file retry does not carry a request id across a user or source revision change', async () => {
  const repository = new FakeOverviewRepository()
  const requests = []
  let nextId = 0
  let revision = 'rev-1'
  let calls = 0
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(request, context) {
      requests.push(request)
      context.onRequestDispatched?.()
      calls += 1
      if (calls <= 2) throw Object.assign(new Error('provider unavailable'), { code: 'MODEL_PROVIDER_ERROR' })
      return response('OUTLINE')
    } },
    repository,
    sourceApi: { async get(sourceId) { return { id: sourceId, type: 'FILE', ingestionStatus: 'READY', ingestionRevision: revision } } },
    requestIdFactory: () => `file-request-${++nextId}`,
  })

  await service.regenerateFileOverview('source-1', 'OUTLINE')
  repository.userId = 'another-user'
  await service.regenerateFileOverview('source-1', 'OUTLINE')
  repository.userId = 'test-user'
  revision = 'rev-2'
  await service.regenerateFileOverview('source-1', 'OUTLINE')

  assert.deepEqual(requests.map(request => request.retryOfRequestId ?? null), [null, null, null])
})

test('manual file regeneration returns FAILED after provider failure and preserves successful cache content', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { throw { code: 'MODEL_PROVIDER_ERROR', detail: 'provider detail' } } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
  })

  const result = await service.regenerateFileOverview('source-1', 'SUMMARY')

  assert.deepEqual(result, { status: 'FAILED', code: 'MODEL_PROVIDER_ERROR', detail: 'Overview generation failed: MODEL_PROVIDER_ERROR' })
  const cached = await repository.getFileOverview('source-1', 'rev-1')
  assert.deepEqual(cached.outlineMarkdown, outlineMarkdown)
  assert.deepEqual(cached.summaryMarkdown, summaryMarkdown)
  assert.equal(repository.failures.at(-1).code, 'MODEL_PROVIDER_ERROR')
})

test('transport uncertainty is persisted as a stable safe code', async () => {
  const repository = new FakeOverviewRepository()
  const service = readyService(repository, async () => {
    throw { problem: { status: 0, detail: 'Failed to fetch https://secret.example' } }
  })

  await service.generateReadyFileOverview('source-1', 'rev-1', 'SOURCE_READY')
  assert.equal(repository.failures[0].code, 'OVERVIEW_STATUS_UNKNOWN')
  assert.doesNotMatch(repository.failures[0].detail, /secret\.example/)
})

test('overviewFailureMessage maps uncertain failure codes to pending server guidance', () => {
  for (const code of ['OVERVIEW_STATUS_UNKNOWN', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE']) {
    assert.equal(overviewFailureMessage(code), '无法确认生成状态，服务器可能仍在处理，请稍后再重新生成')
  }
})

test('overviewFailureMessage maps other failure codes or nullish to standard failure copy', () => {
  for (const code of ['OVERVIEW_GENERATION_FAILED', 'PROVIDER_PARSE_ERROR', null, undefined, '']) {
    assert.equal(overviewFailureMessage(code), '生成失败，请重新生成')
  }
})

test('overviewFailureMessage gives provider output failures an unexpected-error retry copy', () => {
  assert.equal(overviewFailureMessage('MODEL_PROVIDER_ERROR'), '遇到意外情况，请重试')
})

test('generates a READY file overview asynchronously without changing document READY state', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(request) { calls.push(request); return response('ALL') } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
  })

  await service.generateReadyFileOverview('source-1', 'rev-1', 'SOURCE_READY')

  assert.deepEqual(calls, [{ sourceId: 'source-1', mode: 'ALL' }])
  assert.equal((await repository.getFileOverview('source-1', 'rev-1')).status, 'READY')
})

test('preserves prior successful file parts and records a bounded safe error when regeneration fails', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { throw new Error('provider leaked secret') } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
  })

  await service.regenerateFileOverview('source-1', 'SUMMARY')

  const saved = await repository.getFileOverview('source-1', 'rev-1')
  assert.deepEqual(saved.outlineMarkdown, outlineMarkdown)
  assert.deepEqual(saved.summaryMarkdown, summaryMarkdown)
  assert.equal(saved.status, 'READY')
  assert.equal(repository.failures.length, 1)
  assert.match(repository.failures[0].code, /^[A-Z0-9_]{1,64}$/)
  assert.ok(repository.failures[0].detail.length <= 500)
  assert.doesNotMatch(repository.failures[0].detail, /provider leaked secret/)
})

test('resume skips partial and stale revisions', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveFileOverviewPart({ sourceId: 'complete', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
  await repository.saveFileOverviewPart({ sourceId: 'partial', ingestionRevision: 'rev-2', mode: 'OUTLINE', response: response('OUTLINE') })
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(request) { calls.push(request); return response('ALL') } },
    repository,
    sourceApi: { async get(sourceId) { return { id: sourceId, type: 'FILE', ingestionStatus: 'READY', ingestionRevision: sourceId === 'partial' ? 'rev-2' : 'rev-1' } } },
    listReadyFiles: async () => [
      { sourceId: 'complete', ingestionRevision: 'rev-1' },
      { sourceId: 'partial', ingestionRevision: 'rev-2' },
      { sourceId: 'stale', ingestionRevision: 'rev-old' },
    ],
  })

  await service.resumePending('RESUME_BOOTSTRAP')

  assert.deepEqual(calls, [])
})

test('a new ingestion revision gets a separate file result and preserves the old revision', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-old', mode: 'ALL', response: response('ALL') })
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(request) { calls.push(request); return response('ALL') } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-new' }),
  })

  await service.generateReadyFileOverview('source-1', 'rev-new', 'SOURCE_READY')

  assert.deepEqual(calls, [{ sourceId: 'source-1', mode: 'ALL' }])
  assert.ok(await repository.getFileOverview('source-1', 'rev-old'))
  assert.equal((await repository.getFileOverview('source-1', 'rev-new')).status, 'READY')
})

test('explicit file regeneration maps mode and trimmed instruction without replacing before success', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(request) { calls.push(request); return response('SUMMARY') } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
  })

  await service.regenerateFileOverview('source-1', 'SUMMARY', '  只强调考试重点  ')

  assert.deepEqual(calls, [{ sourceId: 'source-1', mode: 'SUMMARY', instruction: '只强调考试重点' }])
})

test('subject regeneration submits only local file overviews and stores the successful fingerprint', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(request) { calls.push(request); return response('ALL') } },
    repository,
    listLocalFileOverviews: async () => [
      { sourceId: 'b', ingestionRevision: 'rev-b', title: 'B', status: 'READY', outlineMarkdown, summaryMarkdown },
      { sourceId: 'a', ingestionRevision: 'rev-a', title: 'A', status: 'READY', outlineMarkdown, summaryMarkdown },
      { sourceId: 'failed', ingestionRevision: 'rev-f', title: 'F', status: 'FAILED', outlineMarkdown: null, summaryMarkdown: null },
    ],
  })

  await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].subjectId, 'subject-1')
  assert.deepEqual(calls[0].sources.map((source) => source.sourceId), ['a', 'b'])
  assert.ok((await repository.getSubjectOverview('subject-1')).inputFingerprint)
})

test('manual subject regeneration returns STARTED with the request id after saving', async () => {
  const repository = new FakeOverviewRepository()
  let context
  const service = new OverviewGenerationService({
    api: {
      async generateSubjectOverview(request, requestContext) {
        context = requestContext
        return response(request.mode)
      },
    },
    repository,
    requestIdFactory: () => 'subject-request-1',
    listLocalFileOverviews: async () => [
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown },
    ],
  })

  const result = await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.deepEqual(result, { status: 'STARTED', requestId: 'subject-request-1' })
  assert.equal(context.requestId, 'subject-request-1')
  assert.ok(context.signal instanceof AbortSignal)
})

test('manual subject retry sends the last dispatched request id under the same input identity', async () => {
  const repository = new FakeOverviewRepository()
  const requests = []
  let nextId = 0
  let calls = 0
  const files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }]
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(request, context) {
      requests.push({ request, requestId: context.requestId })
      context.onRequestDispatched?.()
      calls += 1
      if (calls === 1) throw Object.assign(new Error('provider unavailable'), { code: 'MODEL_PROVIDER_ERROR' })
      return response('ALL')
    } },
    repository,
    listLocalFileOverviews: async () => files,
    requestIdFactory: () => `subject-request-${++nextId}`,
  })

  const first = await service.regenerateSubjectOverview('subject-1', 'ALL')
  const second = await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.equal(first.status, 'FAILED')
  assert.equal(second.status, 'STARTED')
  assert.deepEqual(requests.map(({ request, requestId }) => ({ retryOfRequestId: request.retryOfRequestId ?? null, requestId })), [
    { retryOfRequestId: null, requestId: 'subject-request-1' },
    { retryOfRequestId: 'subject-request-1', requestId: 'subject-request-2' },
  ])
})

test('manual subject regeneration returns FAILED and preserves the previous result on provider failure', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', response: response('ALL'), inputFingerprint: 'old-fingerprint' })
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview() { throw { code: 'MODEL_PROVIDER_ERROR' } } },
    repository,
    requestIdFactory: () => 'subject-request-2',
    listLocalFileOverviews: async () => [
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown },
    ],
  })

  const result = await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.deepEqual(result, { status: 'FAILED', code: 'MODEL_PROVIDER_ERROR', detail: 'Overview generation failed: MODEL_PROVIDER_ERROR' })
  assert.deepEqual(await repository.getSubjectOverview('subject-1'), {
    subjectId: 'subject-1', title: '文件总览', outlineMarkdown, summaryMarkdown, inputFingerprint: 'old-fingerprint', status: 'READY',
  })
  assert.equal(repository.failures.at(-1).code, 'MODEL_PROVIDER_ERROR')
})

test('subject regeneration filters local inputs by the requested mode', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const files = [
    { sourceId: 'both', ingestionRevision: 'rev-1', title: 'Both', status: 'READY', outlineMarkdown, summaryMarkdown },
    { sourceId: 'outlineMarkdown', ingestionRevision: 'rev-2', title: 'Outline', status: 'READY', outlineMarkdown, summaryMarkdown: null },
    { sourceId: 'summaryMarkdown', ingestionRevision: 'rev-3', title: 'Summary', status: 'READY', outlineMarkdown: null, summaryMarkdown },
  ]
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(request) { calls.push(request); return response(request.mode) } },
    repository,
    listLocalFileOverviews: async () => files,
  })

  await service.regenerateSubjectOverview('subject-1', 'ALL')
  await service.regenerateSubjectOverview('subject-1', 'OUTLINE')
  await service.regenerateSubjectOverview('subject-1', 'SUMMARY')

  assert.deepEqual(calls.map(call => call.sources.map(item => item.sourceId)), [
    ['both'],
    ['both', 'outlineMarkdown'],
    ['both', 'summaryMarkdown'],
  ])
})

test('subject regeneration excludes empty outlineMarkdown or summaryMarkdown inputs while preserving mode-specific usable parts', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const files = [
    { sourceId: 'complete', ingestionRevision: 'rev-1', title: 'Complete', status: 'READY', outlineMarkdown, summaryMarkdown },
    { sourceId: 'empty-outlineMarkdown', ingestionRevision: 'rev-2', title: 'Empty outlineMarkdown', status: 'READY', outlineMarkdown: "", summaryMarkdown },
    { sourceId: 'empty-summaryMarkdown', ingestionRevision: 'rev-3', title: 'Empty summaryMarkdown', status: 'READY', outlineMarkdown, summaryMarkdown: '   ' },
  ]
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(request) { calls.push(request); return response(request.mode) } },
    repository,
    listLocalFileOverviews: async () => files,
  })

  await service.regenerateSubjectOverview('subject-1', 'ALL')
  await service.regenerateSubjectOverview('subject-1', 'OUTLINE')
  await service.regenerateSubjectOverview('subject-1', 'SUMMARY')

  assert.deepEqual(calls.map(call => call.sources.map(item => item.sourceId)), [
    ['complete'],
    ['complete', 'empty-summaryMarkdown'],
    ['complete', 'empty-outlineMarkdown'],
  ])
  assert.equal(calls[1].sources.find(item => item.sourceId === 'empty-summaryMarkdown').summaryMarkdown, null)
  assert.equal(calls[2].sources.find(item => item.sourceId === 'empty-outlineMarkdown').outlineMarkdown, null)
})

test('subject regeneration safely preserves the previous result when every local input is unusable', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', response: response('ALL'), inputFingerprint: 'old-fingerprint' })
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(request) { calls.push(request); return response(request.mode) } },
    repository,
    listLocalFileOverviews: async () => [
      { sourceId: 'empty-outlineMarkdown', ingestionRevision: 'rev-2', title: 'Empty outlineMarkdown', status: 'READY', outlineMarkdown: "", summaryMarkdown },
      { sourceId: 'empty-summaryMarkdown', ingestionRevision: 'rev-3', title: 'Empty summaryMarkdown', status: 'READY', outlineMarkdown, summaryMarkdown: '   ' },
    ],
  })

  const result = await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.deepEqual(calls, [])
  assert.deepEqual(result, { status: 'SKIPPED', code: 'NO_USABLE_INPUT' })
  assert.deepEqual(await repository.getSubjectOverview('subject-1'), {
    subjectId: 'subject-1', title: '文件总览', outlineMarkdown, summaryMarkdown, inputFingerprint: 'old-fingerprint', status: 'READY',
  })
  assert.equal(repository.failures.length, 0)
})

test('subject regeneration rejects a late response when source revision changes before save', async () => {
  const repository = new FakeOverviewRepository()
  let files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }]
  let releaseProvider
  const providerGate = new Promise((resolve) => { releaseProvider = resolve })
  let calls = 0
  const service = new OverviewGenerationService({
    api: {
      async generateSubjectOverview() {
        calls += 1
        await providerGate
        return response('ALL')
      },
    },
    repository,
    listLocalFileOverviews: async () => files,
  })
  const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
  files = [{ ...files[0], ingestionRevision: 'rev-2' }]
  releaseProvider()
  const result = await attempt

  assert.equal(calls, 1)
  assert.deepEqual(result, { status: 'SKIPPED', code: 'SOURCE_NOT_ELIGIBLE' })
  assert.equal(await repository.getSubjectOverview('subject-1'), null)
  assert.equal(repository.failures.length, 0)
})

test('subject regeneration rejects a late response when a participating Source is deleted', async () => {
  const repository = new FakeOverviewRepository()
  const files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }]
  let currentSource = { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }
  let releaseProvider
  const providerGate = new Promise((resolve) => { releaseProvider = resolve })
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview() { await providerGate; return response('ALL') } },
    repository,
    sourceApi: { async get() { return currentSource } },
    listLocalFileOverviews: async () => files,
  })
  const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
  currentSource = null
  releaseProvider()

  const result = await attempt
  assert.deepEqual(result, { status: 'SKIPPED', code: 'SOURCE_NOT_ELIGIBLE' })
  assert.equal(await repository.getSubjectOverview('subject-1'), null)
  assert.equal(repository.failures.length, 0)
})

test('subject regeneration rejects a late response when a participating Source leaves READY', async () => {
  const repository = new FakeOverviewRepository()
  const files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }]
  let currentSource = { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }
  let releaseProvider
  const providerGate = new Promise((resolve) => { releaseProvider = resolve })
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview() { await providerGate; return response('ALL') } },
    repository,
    sourceApi: { async get() { return currentSource } },
    listLocalFileOverviews: async () => files,
  })
  const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
  currentSource = { ...currentSource, ingestionStatus: 'PARSING' }
  releaseProvider()

  const result = await attempt
  assert.deepEqual(result, { status: 'SKIPPED', code: 'SOURCE_NOT_ELIGIBLE' })
  assert.equal(await repository.getSubjectOverview('subject-1'), null)
  assert.equal(repository.failures.length, 0)
})

test('discard aborts an in-flight subject generation that uses the discarded Source', async () => {
  const repository = new FakeOverviewRepository()
  let releaseProvider
  const providerGate = new Promise((resolve) => { releaseProvider = resolve })
  let notifyProviderStarted
  const providerStarted = new Promise((resolve) => { notifyProviderStarted = resolve })
  let signal
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(_request, context) { signal = context.signal; notifyProviderStarted(); await providerGate; return response('ALL') } },
    repository,
    listLocalFileOverviews: async () => [
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown },
    ],
  })
  const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
  await providerStarted
  await service.discardFileOverview('source-1')
  releaseProvider()

  const result = await attempt
  assert.equal(signal.aborted, true)
  assert.deepEqual(result, { status: 'SKIPPED', code: 'ABORTED' })
  assert.equal(await repository.getSubjectOverview('subject-1'), null)
  assert.equal(repository.failures.length, 0)
})

test('subject generation rechecks the generation fence after the latest fingerprint and before saving', async () => {
  const repository = new FakeOverviewRepository()
  const files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }]
  let service
  let listCalls = 0
  const api = { async generateSubjectOverview() { return response('ALL') } }
  service = new OverviewGenerationService({
    api,
    repository,
    listLocalFileOverviews: async () => {
      listCalls += 1
      if (listCalls === 2) void service.discardFileOverview('source-1')
      return files
    },
  })

  const result = await service.regenerateSubjectOverview('subject-1', 'ALL')
  assert.deepEqual(result, { status: 'SKIPPED', code: 'ABORTED' })
  assert.equal(await repository.getSubjectOverview('subject-1'), null)
  assert.equal(repository.removedSubjectOverviews.includes('subject-1'), true)
})

test('discard during a subject cache save keeps the discarded cache absent before generation settles', async () => {
  const repository = new FakeOverviewRepository()
  let releaseSave
  const saveGate = new Promise((resolve) => { releaseSave = resolve })
  const originalSave = repository.saveSubjectOverviewPart.bind(repository)
  repository.saveSubjectOverviewPart = async (input) => {
    const saved = await originalSave(input)
    await saveGate
    return saved
  }
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview() { return response('ALL') } },
    repository,
    listLocalFileOverviews: async () => [
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown },
    ],
  })
  const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
  await service.discardFileOverview('source-1')
  releaseSave()

  const result = await attempt
  assert.deepEqual(result, { status: 'SKIPPED', code: 'ABORTED' })
  assert.equal(await repository.getSubjectOverview('subject-1'), null)
  assert.ok(repository.removedSubjectOverviews.includes('subject-1'))
})

test('superseded subject save cannot compensate by deleting the newer generation cache', async () => {
  const repository = new FakeOverviewRepository()
  let releaseFirstSave
  let firstSaveStarted
  const firstSaveGate = new Promise((resolve) => { releaseFirstSave = resolve })
  const firstSaveStartedGate = new Promise((resolve) => { firstSaveStarted = resolve })
  const originalSave = repository.saveSubjectOverviewPart.bind(repository)
  let saveCount = 0
  repository.saveSubjectOverviewPart = async (input) => {
    saveCount += 1
    const saved = await originalSave(input)
    if (saveCount === 1) {
      firstSaveStarted()
      await firstSaveGate
    }
    return saved
  }
  let releaseFirstProvider
  const firstProviderGate = new Promise((resolve) => { releaseFirstProvider = resolve })
  let providerCalls = 0
  const service = new OverviewGenerationService({
    api: {
      async generateSubjectOverview() {
        providerCalls += 1
        if (providerCalls === 1) await firstProviderGate
        return response('ALL')
      },
    },
    repository,
    listLocalFileOverviews: async () => [
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown },
    ],
  })
  const first = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
  releaseFirstProvider()
  await firstSaveStartedGate
  const second = service.regenerateSubjectOverview('subject-1', 'ALL')
  const secondResult = await second
  releaseFirstSave()
  const firstResult = await first

  assert.deepEqual(firstResult, { status: 'SKIPPED', code: 'ABORTED' })
  assert.equal(secondResult.status, 'STARTED')
  assert.equal((await repository.getSubjectOverview('subject-1')).status, 'READY')
  assert.equal(saveCount, 2)
})

test('overview response validation rejects malformed or mode-inconsistent provider data', () => {
  assert.deepEqual(validateGeneratedOverviewResponse(response('ALL'), 'ALL'), response('ALL'))
  assert.throws(() => validateGeneratedOverviewResponse({ ...response('ALL'), schemaVersion: 1 }, 'ALL'), /OVERVIEW_RESPONSE_INVALID/)
  assert.throws(() => validateGeneratedOverviewResponse({ ...response('ALL'), outlineMarkdown: '' }, 'ALL'), /OVERVIEW_RESPONSE_INVALID/)
  assert.throws(() => validateGeneratedOverviewResponse(response('SUMMARY'), 'ALL'), /OVERVIEW_RESPONSE_INVALID/)
  assert.throws(() => validateGeneratedOverviewResponse(response('OUTLINE'), 'SUMMARY'), /OVERVIEW_RESPONSE_INVALID/)
})

test('overview response validation preserves shape checks without a client-side content-volume ceiling', () => {
  const large = {
    ...response('ALL'),
    title: '标题'.repeat(151),
    outlineMarkdown: '## 章节\n- 小节'.repeat(500),
    summaryMarkdown: '概述'.repeat(2000),
  }
  assert.deepEqual(validateGeneratedOverviewResponse(large, 'ALL'), large)
  assert.throws(() => validateGeneratedOverviewResponse({ ...large, outlineMarkdown: '   ' }, 'ALL'), /OVERVIEW_RESPONSE_INVALID/)
})

test('overview API maps the two authenticated stateless endpoints exactly', async () => {
  const api = await source('src/api/useOverviewApi.ts')
  assert.match(api, /postOverviewSse\('\/api\/ai\/source-overviews', request,/)
  assert.match(api, /postOverviewSse\('\/api\/ai\/subject-overviews', request,/)
  assert.equal((api.match(/onRequestDispatched: context\?\.onRequestDispatched/g) ?? []).length, 2)
  assert.doesNotMatch(api, /userId|serverDeviceId|conversation|localStorage/)
})

test('Overview SSE transport supports configured and unbounded deadlines across both endpoints', async () => {
  const transport = await source('src/api/overviewSse.ts')
  assert.match(transport, /runtime\.overviewSseDeadlineMs/)
  assert.match(transport, /deadlineMs > 0 \? setTimeout\(/)
  assert.match(transport, /reader\.read\(/)
})

test('overview generation requests carry a per-attempt request id and server stages expose a generation id', async () => {
  const api = await source('src/api/useOverviewApi.ts')
  const transport = await source('src/api/overviewSse.ts')
  const server = await readFile(path.resolve(import.meta.dirname, '..', '..', 'Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java'), 'utf8')
  const pipeline = await readFile(path.resolve(import.meta.dirname, '..', '..', 'Auralis-Server/src/main/java/com/auralis/app/ai/OverviewMarkdownPipeline.java'), 'utf8')
  const cors = await readFile(path.resolve(import.meta.dirname, '..', '..', 'Auralis-Server/src/main/java/com/auralis/app/shared/config/WebConfiguration.java'), 'utf8')
  assert.match(transport, /X-Overview-Request-Id/)
  assert.match(cors, /X-Overview-Request-Id/)
  assert.match(api, /randomUUID|uuidv7/i)
  assert.match(api, /context\?\.requestId\s*\?\?\s*overviewRequestId\(\)/)
  assert.match(server, /generationId/)
  assert.match(server, /markdownPipeline\.generate/)
  for (const stage of ['CLEAN', 'OUTLINE', 'SUMMARY']) {
    assert.match(pipeline, new RegExp(`Stage\\.${stage}\\b`))
  }
  assert.match(server, /CACHE_RETURN/)
  assert.match(server, /causeType|causeMessage|exceptionType/)
})

test('overview API callsites preserve the service request ID in the existing header', async () => {
  const api = await source('src/api/useOverviewApi.ts')
  const transport = await source('src/api/overviewSse.ts')
  for (const method of ['generateSourceOverview', 'generateSubjectOverview']) {
    const start = api.indexOf(`${method}(request`)
    assert.notEqual(start, -1, `missing API method: ${method}`)
    const callsite = api.slice(start, start + 450)
    assert.match(callsite, /context\?: OverviewRequestContext/)
    assert.match(callsite, /requestId:\s*context\?\.requestId\s*\?\?\s*overviewRequestId\(\)/)
    assert.match(callsite, /signal:\s*context\?\.signal/)
  }
  assert.match(transport, /'X-Overview-Request-Id': requestId/)
})

test('runtime and SourceStore trigger file generation after READY and retry on resume', async () => {
  const runtime = await source('src/services/documentProcessing/runtime.ts')
  const store = await source('src/store/useSourceStore.ts')
  assert.match(runtime, /OverviewGenerationService/)
  assert.match(runtime, /getOverviewRepository/)
  assert.match(runtime, /isFileGenerationEligible/)
  assert.match(runtime, /job\.phase === 'READY'/)
  assertCallsiteLiteral(runtime, 'private readonly onlineHandler', 'RESUME_ONLINE')
  assertCallsiteLiteral(runtime, 'private readonly syncHandler', 'RESUME_SYNC')
  assertCallsiteLiteral(runtime, "await this.resumePending('RESUME_BOOTSTRAP')", 'RESUME_BOOTSTRAP')
  assertCallsiteLiteral(runtime, 'onJobChanged: async () =>', 'JOB_CHANGED')
  assert.match(runtime, /attachFileOverviewGenerator\(overviewGeneration\)/)
  assertGeneratorCallsiteLiteral(store, "if (status === 'READY' && model.ingestionRevision", 'SOURCE_READY')
  assertGeneratorCallsiteLiteral(store, "if (status === 'READY' && current?.ingestionRevision", 'MANUAL_RETRY')
  assert.match(store, /status === ['"]READY['"]/)
  assert.match(store, /\.catch\(/)
  assert.match(store, /ingestionRevision:\s*file\.ingestionRevision/)
  assert.match(store, /hydrateSources\(\)\s*\.catch/)
  assert.match(runtime, /lifecycleGeneration/)
  assert.match(runtime, /this\.snapshot\.overviewGeneration\.cancelAll\(\)/)
})

test('existing Subject and summaryMarkdown Overview Stop controls release only their view-owned handles', async () => {
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  const subjectSection = await source('src/components/subject/SubjectOverviewSection.vue')
  const fileList = await source('src/components/subject/FileOutlineList.vue')
  const summaryMarkdown = await source('src/components/subject/OverviewSummaryView.vue')
  assert.match(workspace, /@stop="stopManualOverview\('subject', subjectId\)"/)
  assert.match(workspace, /@stop="summaryTarget && stopManualOverview\(summaryTarget\.kind, summaryTarget\.id\)"/)
  assert.match(subjectSection, /aria-label="停止学科总览生成"/)
  assert.match(summaryMarkdown, /aria-label="停止当前总览生成"/)
  assert.match(fileList, /emit\('regenerate', \{ fileId: file\.id, mode: 'OUTLINE' \}\)/)
})

test('correlates file trigger lifecycle diagnostics to one request context and coalesces duplicates', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const events = []
  let nextRequestId = 0
  let releaseApi
  const apiGate = new Promise((resolve) => { releaseApi = resolve })
  const originalInfo = console.info
  const originalWarn = console.warn
  console.info = (prefix, payload) => {
    if (prefix === '[FILE_OVERVIEW_TRIGGER]') events.push(payload)
  }
  console.warn = (prefix, payload) => {
    if (prefix === '[FILE_OVERVIEW_TRIGGER]') events.push(payload)
  }
  try {
    const service = new OverviewGenerationService({
      api: {
        async generateSourceOverview(request, context) {
          calls.push({ request, context })
          await apiGate
          return response('ALL')
        },
      },
      repository,
      sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
      requestIdFactory: () => `request-${++nextRequestId}`,
    })

    const first = service.generateReadyFileOverview('source-1', 'rev-1', 'RESUME_SYNC')
    const second = service.generateReadyFileOverview('source-1', 'rev-1', 'RESUME_SYNC')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].context.requestId, 'request-1')
    assert.ok(events.some((event) => event.event === 'START' && event.trigger === 'RESUME_SYNC' && event.requestId === 'request-1'))
    assert.ok(events.some((event) => event.event === 'COALESCED'))
    releaseApi()
    await Promise.all([first, second])
    assert.ok(events.some((event) => event.event === 'RELEASED' && event.requestId === 'request-1'))
    assert.equal(nextRequestId, 1)
    for (const event of events) {
      assert.ok(Object.keys(event).every((key) => ['event', 'trigger', 'requestId', 'sourceId', 'revision', 'mode', 'outcome', 'errorCode', 'durationMs'].includes(key)))
      if ('durationMs' in event) {
        assert.equal(Number.isFinite(event.durationMs), true)
        assert.ok(event.durationMs >= 0)
      }
    }
    assert.doesNotMatch(JSON.stringify(events), /secret instruction|provider leaked secret/)
  } finally {
    console.info = originalInfo
    console.warn = originalWarn
  }
})

test('records only a safe stable error code when file overview generation fails', async () => {
  const repository = new FakeOverviewRepository()
  const events = []
  const originalInfo = console.info
  const originalWarn = console.warn
  console.info = (prefix, payload) => {
    if (prefix === '[FILE_OVERVIEW_TRIGGER]') events.push(payload)
  }
  console.warn = (prefix, payload) => {
    if (prefix === '[FILE_OVERVIEW_TRIGGER]') events.push(payload)
  }
  try {
    const service = new OverviewGenerationService({
      api: { async generateSourceOverview() { throw new Error('SECRET_INSTRUCTION') } },
      repository,
      sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
      requestIdFactory: () => 'request-failure',
    })
    await service.generateReadyFileOverview('source-1', 'rev-1', 'SOURCE_READY')
    const failed = events.find((event) => event.event === 'FAILED')
    assert.equal(failed.requestId, 'request-failure')
    assert.match(failed.errorCode, /^[A-Z][A-Z0-9_]{0,63}$/)
    assert.doesNotMatch(JSON.stringify(events), /SECRET_INSTRUCTION/)
    assert.ok(events.some((event) => event.event === 'RELEASED'))
  } finally {
    console.info = originalInfo
    console.warn = originalWarn
  }
})

test('eligibility blocks automatic resume before any Overview API call', async () => {
  const repository = new FakeOverviewRepository()
  let apiCalls = 0
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { apiCalls += 1; return response('ALL') } },
    repository,
    sourceApi: sourceApi({ id: 'deleted-source', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    listReadyFiles: async () => [{ sourceId: 'deleted-source', ingestionRevision: 'rev-1' }],
    isFileGenerationEligible: async () => false,
  })

  await service.resumePending('RESUME_SYNC')

  assert.equal(apiCalls, 0)
  assert.equal(repository.failures.length, 0)
})

test('eligibility blocks manual regeneration when the local document job is not READY', async () => {
  const repository = new FakeOverviewRepository()
  let apiCalls = 0
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { apiCalls += 1; return response('SUMMARY') } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async (sourceId, revision) => sourceId === 'source-1' && revision === 'rev-1' && false,
  })

  await service.regenerateFileOverview('source-1', 'SUMMARY')

  assert.equal(apiCalls, 0)
  assert.equal(repository.failures.length, 0)
})

test('manual regeneration checks local revision eligibility before the Server Source GET', async () => {
  const repository = new FakeOverviewRepository()
  let apiCalls = 0
  let sourceGets = 0
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { apiCalls += 1; return response('SUMMARY') } },
    repository,
    sourceApi: { async get() { sourceGets += 1; return { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    getLocalFileGenerationRevision: async () => null,
    isFileGenerationEligible: async () => true,
  })

  await service.regenerateFileOverview('source-1', 'SUMMARY')

  assert.equal(sourceGets, 0)
  assert.equal(apiCalls, 0)
  assert.equal(repository.failures.length, 0)
})

test('manual regeneration rejects a Server revision that differs from the exact local revision', async () => {
  const repository = new FakeOverviewRepository()
  let apiCalls = 0
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { apiCalls += 1; return response('SUMMARY') } },
    repository,
    sourceApi: { async get() { return { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-server' } } },
    getLocalFileGenerationRevision: async () => 'rev-local',
    isFileGenerationEligible: async () => true,
  })

  await service.regenerateFileOverview('source-1', 'SUMMARY')

  assert.equal(apiCalls, 0)
  assert.equal(repository.failures.length, 0)
})

test('manual regeneration does not Server-GET when deletion wins during local revision lookup', async () => {
  const repository = new FakeOverviewRepository()
  let releaseLocalLookup
  let sourceGets = 0
  let apiCalls = 0
  const localLookup = new Promise((resolve) => { releaseLocalLookup = resolve })
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview() { apiCalls += 1; return response('SUMMARY') } },
    repository,
    sourceApi: { async get() { sourceGets += 1; return { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    getLocalFileGenerationRevision: async () => { await localLookup; return 'rev-1' },
    isFileGenerationEligible: async () => true,
  })

  const attempt = service.regenerateFileOverview('source-1', 'SUMMARY')
  await new Promise((resolve) => setImmediate(resolve))
  await service.discardFileOverview('source-1')
  releaseLocalLookup()
  await attempt

  assert.equal(sourceGets, 0)
  assert.equal(apiCalls, 0)
  assert.equal(repository.failures.length, 0)
})

test('discard fences only the deleted Source ID and rejects a late response without saving or marking failure', async () => {
  const repository = new FakeOverviewRepository()
  let releaseLateResponse
  const started = new Promise((resolve) => { releaseLateResponse = resolve })
  let apiCalls = 0
  let signal
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(_request, context) {
        apiCalls += 1
        signal = context.signal
        await started
        return response('ALL')
      },
    },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async (sourceId) => sourceId === 'source-1',
  })

  const attempt = service.generateReadyFileOverview('source-1', 'rev-1', 'JOB_CHANGED')
  await new Promise((resolve) => setImmediate(resolve))
  await service.discardFileOverview('source-1')
  releaseLateResponse()
  await attempt

  assert.equal(apiCalls, 1)
  assert.equal(signal.aborted, true)
  assert.equal(repository.files.size, 0)
  assert.equal(repository.failures.length, 0)
  assert.deepEqual(repository.removedOverviewSources, ['source-1'])
})

test('a restored active Source can resume generation after its scope reactivates while the aborted old request stays discarded', async () => {
  const repository = new FakeOverviewRepository()
  let lifecycle = 'ACTIVE'
  let generation = 0
  repository.captureScopeFenceToken = () => ({ generation })
  repository.isScopeFenceTokenCurrent = token => lifecycle === 'ACTIVE' && token.generation === generation
  let canRestore = false
  let releaseOldResponse
  let signal
  let apiCalls = 0
  const oldResponseGate = new Promise(resolve => { releaseOldResponse = resolve })
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(_request, context) {
      apiCalls += 1
      if (apiCalls === 1) { signal = context.signal; await oldResponseGate }
      return response('ALL')
    } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async () => true,
    isFileScopeRestorable: async () => canRestore,
  })
  const oldAttempt = service.generateReadyFileOverview('source-1', 'rev-1', 'JOB_CHANGED')
  await new Promise(resolve => setImmediate(resolve))
  await service.discardFileOverview('source-1')
  lifecycle = 'DELETED'
  generation += 1
  assert.equal(await service.restoreFileOverview('source-1'), false)

  lifecycle = 'ACTIVE'
  generation += 1
  canRestore = true
  assert.equal(await service.restoreFileOverview('source-1'), true)
  releaseOldResponse()
  await oldAttempt
  assert.equal(signal.aborted, true)
  assert.equal(repository.files.size, 0)

  const retry = await service.generateReadyFileOverview('source-1', 'rev-1', 'MANUAL_RETRY')
  assert.equal(retry.status, 'STARTED')
  assert.equal(apiCalls, 2)
  assert.ok(repository.files.has('source-1:rev-1'))
})

test('discarded late API rejection does not mark a file overview failed', async () => {
  const repository = new FakeOverviewRepository()
  let rejectLateResponse
  const started = new Promise((_, reject) => { rejectLateResponse = reject })
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(_request, context) { await started; return context } },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
  })

  const attempt = service.generateReadyFileOverview('source-1', 'rev-1', 'JOB_CHANGED')
  await new Promise((resolve) => setImmediate(resolve))
  await service.discardFileOverview('source-1')
  rejectLateResponse(Object.assign(new Error('cancelled'), { code: 'ERR_CANCELED' }))
  await attempt

  assert.equal(repository.failures.length, 0)
  assert.equal(repository.files.size, 0)
})

test('discard aborts only the matching in-flight Source request', async () => {
  const repository = new FakeOverviewRepository()
  const releases = new Map()
  const signals = new Map()
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(request, context) {
        signals.set(request.sourceId, context.signal)
        await new Promise((resolve) => releases.set(request.sourceId, resolve))
        return response('ALL')
      },
    },
    repository,
    sourceApi: { async get(sourceId) { return { id: sourceId, type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    isFileGenerationEligible: async () => true,
  })

  const first = service.generateReadyFileOverview('source-1', 'rev-1', 'JOB_CHANGED')
  const second = service.generateReadyFileOverview('source-2', 'rev-1', 'JOB_CHANGED')
  await new Promise((resolve) => setImmediate(resolve))
  await service.discardFileOverview('source-1')
  releases.get('source-1')()
  releases.get('source-2')()
  await Promise.all([first, second])

  assert.equal(signals.get('source-1').aborted, true)
  assert.equal(signals.get('source-2').aborted, false)
  assert.equal(repository.files.has('source-2:rev-1'), true)
  assert.equal(repository.failures.length, 0)
})

test('a new Source ID remains eligible after an old Source ID is discarded', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSourceOverview(request) { calls.push(request); return response('ALL') } },
    repository,
    sourceApi: { async get(sourceId) { return { id: sourceId, type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    isFileGenerationEligible: async (sourceId) => sourceId === 'new-source',
  })

  await service.discardFileOverview('old-source')
  await service.generateReadyFileOverview('new-source', 'rev-1', 'RESUME_SYNC')

  assert.deepEqual(calls, [{ sourceId: 'new-source', mode: 'ALL' }])
  assert.deepEqual(repository.removedOverviewSources, ['old-source'])
})

const { SyncScopeChangedError } = await import('../src/api/request.ts')
const { postOverviewSse } = await import('../src/api/overviewSse.ts')

function createMockSseStream(chunks, onCancel) {
  let index = 0
  const encoder = new TextEncoder()
  return {
    body: {
      getReader() {
        return {
          async read() {
            if (index < chunks.length) {
              const chunk = chunks[index++]
              return { done: false, value: encoder.encode(chunk) }
            }
            return { done: true, value: undefined }
          },
          async cancel(reason) {
            onCancel?.(reason)
          },
          releaseLock() {},
        }
      },
    },
  }
}

test('postOverviewSse ignores SSE comment heartbeats and returns terminal validated result', async () => {
  assert.equal(typeof postOverviewSse, 'function', 'postOverviewSse must be exported')
  let capturedUrl = ''
  let capturedHeaders = {}
  let capturedMethod = ''
  let capturedBody = ''
  const validResult = {
    schemaVersion: 2,
    title: '大纲与总结',
    outlineMarkdown: '## 第一章\n- 第一节',
    summaryMarkdown: null,
  }

  const mockFetch = async (url, options) => {
    capturedUrl = String(url)
    capturedMethod = options.method
    capturedHeaders = options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : options.headers
    capturedBody = options.body
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      ...createMockSseStream([
        ': ping\n\n',
        ': heartbeat\n\n',
        `event: result\ndata: ${JSON.stringify(validResult)}\n\n`,
      ]),
    }
  }

  const res = await postOverviewSse(
    '/api/ai/source-overviews',
    { sourceId: 'source-1', mode: 'OUTLINE', retryOfRequestId: 'previous-attempt' },
    { requestId: 'custom-req-id' },
    { fetch: mockFetch }
  )

  assert.equal(capturedMethod, 'POST')
  assert.match(capturedUrl, /\/api\/ai\/source-overviews$/)
  const normalizedHeaders = new Headers(capturedHeaders)
  assert.equal(normalizedHeaders.get('accept'), 'text/event-stream')
  assert.equal(normalizedHeaders.get('content-type'), 'application/json')
  assert.equal(normalizedHeaders.get('x-overview-request-id'), 'custom-req-id')
  assert.deepEqual(JSON.parse(capturedBody), { sourceId: 'source-1', mode: 'OUTLINE', retryOfRequestId: 'previous-attempt' })
  assert.deepEqual(res, validResult)
})

test('postOverviewSse keeps the new request id and retry parent on its same-request 401 resend', async () => {
  const captured = []
  let dispatchNotifications = 0
  const result = {
    schemaVersion: 2,
    title: '大纲',
    outlineMarkdown: '## 第一章\n- 第一节',
    summaryMarkdown: null,
  }
  const mockFetch = async (_url, options) => {
    captured.push({ requestId: new Headers(options.headers).get('x-overview-request-id'), body: JSON.parse(options.body) })
    if (captured.length === 1) {
      return { ok: false, status: 401, headers: new Headers(), json: async () => ({ status: 401 }), text: async () => 'Unauthorized' }
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      ...createMockSseStream([`event: result\ndata: ${JSON.stringify(result)}\n\n`]),
    }
  }

  const actual = await postOverviewSse(
    '/api/ai/source-overviews',
    { sourceId: 'source-1', mode: 'OUTLINE', retryOfRequestId: 'previous-attempt' },
    { requestId: 'new-attempt', onRequestDispatched: () => { dispatchNotifications += 1 } },
    { fetch: mockFetch, refreshAccessToken: async () => 'fresh-token' },
  )

  assert.deepEqual(captured, [
    { requestId: 'new-attempt', body: { sourceId: 'source-1', mode: 'OUTLINE', retryOfRequestId: 'previous-attempt' } },
    { requestId: 'new-attempt', body: { sourceId: 'source-1', mode: 'OUTLINE', retryOfRequestId: 'previous-attempt' } },
  ])
  assert.equal(dispatchNotifications, 2)
  assert.deepEqual(actual, result)
})

test('postOverviewSse cancels the response reader after a terminal event', async () => {
  let readerCanceled = false
  const result = {
    schemaVersion: 2,
    title: '总览',
    outlineMarkdown: '## 第一章\n- 第一节',
    summaryMarkdown: null,
  }
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    ...createMockSseStream([`event: result\ndata: ${JSON.stringify(result)}\n\n`], () => { readerCanceled = true }),
  })
  await postOverviewSse('/api/ai/source-overviews', { sourceId: 'source-1', mode: 'OUTLINE' }, undefined, { fetch: mockFetch })
  assert.equal(readerCanceled, true, 'terminal event must close the response body reader')
})

test('postOverviewSse maps terminal error event through Overview failure policy', async () => {
  assert.equal(typeof postOverviewSse, 'function', 'postOverviewSse must be exported')
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    ...createMockSseStream([
      ': heartbeat\n\n',
      'event: error\ndata: {"code":"AI_DAILY_QUOTA_EXCEEDED","detail":"Quota exceeded","status":429,"retryAfterSeconds":12,"resetAt":"2026-10-11T12:00:00Z"}\n\n',
    ]),
  })

  await assert.rejects(
    postOverviewSse('/api/ai/source-overviews', { sourceId: 'source-1', mode: 'ALL' }, undefined, { fetch: mockFetch }),
    (err) => {
      const classified = classifyOverviewFailure(err)
      return classified.code === 'AI_DAILY_QUOTA_EXCEEDED'
        && classified.status === 429
        && classified.retryAfterSeconds === 12
        && classified.resetAt === '2026-10-11T12:00:00Z'
    }
  )
})

test('postOverviewSse keeps pre-response errors as ordinary ProblemDetails', async () => {
  assert.equal(typeof postOverviewSse, 'function', 'postOverviewSse must be exported')
  const mockFetch = async () => ({
    ok: false,
    status: 400,
    headers: new Headers({ 'content-type': 'application/problem+json' }),
    json: async () => ({ status: 400, title: 'Bad Request', detail: 'Invalid parameters' }),
    text: async () => JSON.stringify({ status: 400, title: 'Bad Request', detail: 'Invalid parameters' }),
  })

  await assert.rejects(
    postOverviewSse('/api/ai/source-overviews', { sourceId: 'source-1', mode: 'ALL' }, undefined, { fetch: mockFetch }),
    (err) => err?.name === 'ApiProblemError' && err?.status === 400
  )
})

test('postOverviewSse rejects EOF without terminal result or error as protocol failure', async () => {
  assert.equal(typeof postOverviewSse, 'function', 'postOverviewSse must be exported')
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    ...createMockSseStream([
      ': heartbeat\n\n',
    ]),
  })

  await assert.rejects(
    postOverviewSse('/api/ai/source-overviews', { sourceId: 'source-1', mode: 'ALL' }, undefined, { fetch: mockFetch }),
    (err) => {
      const classified = classifyOverviewFailure(err)
      return classified.code === 'OVERVIEW_GENERATION_FAILED' || classified.code === 'OVERVIEW_STATUS_UNKNOWN'
    }
  )
})

test('postOverviewSse cancels active fetch and body reader promptly when AbortSignal aborts', async () => {
  assert.equal(typeof postOverviewSse, 'function', 'postOverviewSse must be exported')
  let readerCanceled = false
  const controller = new AbortController()

  const mockFetch = async (_url, options) => {
    options.signal?.addEventListener('abort', () => {
      readerCanceled = true
    })
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream({
        cancel() {
          readerCanceled = true
        },
      }),
    }
  }

  const promise = postOverviewSse(
    '/api/ai/source-overviews',
    { sourceId: 'source-1', mode: 'ALL' },
    { signal: controller.signal },
    { fetch: mockFetch }
  )

  await new Promise((resolve) => setImmediate(resolve))
  controller.abort()

  await assert.rejects(promise, (err) => err?.name === 'AbortError' || err?.code === 'ABORTED' || controller.signal.aborted)
  assert.equal(readerCanceled, true, 'body reader must be canceled on signal abort')
})

test('postOverviewSse enforces deadline across response headers and stream reading', async () => {
  assert.equal(typeof postOverviewSse, 'function', 'postOverviewSse must be exported')
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: new ReadableStream(),
  })

  await assert.rejects(
    postOverviewSse('/api/ai/source-overviews', { sourceId: 'source-1', mode: 'ALL' }, undefined, {
      fetch: mockFetch,
      deadlineMs: 20,
    }),
    (err) => {
      const classified = classifyOverviewFailure(err)
      return classified.code === 'MODEL_TIMEOUT' && err?.message === 'Overview generation timed out after 20ms'
    }
  )
})

test('postOverviewSse deadlineMs zero disables automatic abort while caller abort still cancels the reader', async () => {
  let readerCanceled = false
  const controller = new AbortController()
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: new ReadableStream({
      cancel() {
        readerCanceled = true
      },
    }),
  })

  const promise = postOverviewSse(
    '/api/ai/source-overviews',
    { sourceId: 'source-1', mode: 'ALL' },
    { signal: controller.signal },
    { fetch: mockFetch, deadlineMs: 0 },
  )

  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(controller.signal.aborted, false)
  assert.equal(readerCanceled, false, 'zero deadline must not create an automatic timeout')

  controller.abort()
  await assert.rejects(promise, (err) => err?.name === 'AbortError' || err?.code === 'ABORTED' || controller.signal.aborted)
  assert.equal(readerCanceled, true, 'caller abort must still cancel the response reader')
})

test('postOverviewSse captures SyncRequestScopeTicket and asserts it before send and after 401 refresh', async () => {
  assert.equal(typeof postOverviewSse, 'function', 'postOverviewSse must be exported')
  let isScopeValid = false
  const scopeTicket = {
    key: Symbol('test-scope'),
    isCurrent: () => isScopeValid,
  }

  // Pre-send assertion: scope not current throws SyncScopeChangedError before network call
  await assert.rejects(
    postOverviewSse(
      '/api/ai/source-overviews',
      { sourceId: 'source-1', mode: 'ALL' },
      { scope: scopeTicket },
      { fetch: async () => { throw new Error('should not call fetch') } }
    ),
    (err) => err instanceof SyncScopeChangedError
  )

  // 401 refresh: scope becomes stale after 401 refresh
  isScopeValid = true
  let refreshed = false
  const refreshScopeTicket = {
    key: Symbol('refresh-scope'),
    isCurrent: () => !refreshed, // becomes false after refresh
  }

  const mockFetch401 = async () => ({
    ok: false,
    status: 401,
    headers: new Headers(),
    json: async () => ({ status: 401, title: 'Unauthorized' }),
    text: async () => 'Unauthorized',
  })

  await assert.rejects(
    postOverviewSse(
      '/api/ai/source-overviews',
      { sourceId: 'source-1', mode: 'ALL' },
      { scope: refreshScopeTicket },
      {
        fetch: mockFetch401,
        refreshAccessToken: async () => {
          refreshed = true
          return 'new-token'
        },
      }
    ),
    (err) => err instanceof SyncScopeChangedError
  )
})

test('postOverviewSse deadline stops waiting for an in-progress 401 refresh without retrying', async () => {
  let fetchCalls = 0
  let releaseRefresh
  const mockFetch = async () => {
    fetchCalls += 1
    return fetchCalls === 1
      ? { ok: false, status: 401, headers: new Headers(), json: async () => ({}), text: async () => '' }
      : { ok: false, status: 503, headers: new Headers(), json: async () => ({ status: 503 }), text: async () => '' }
  }
  const promise = postOverviewSse('/api/ai/source-overviews', { sourceId: 'source-1', mode: 'ALL' }, undefined, {
    fetch: mockFetch,
    deadlineMs: 15,
    refreshAccessToken: async () => new Promise((resolve) => { releaseRefresh = resolve }),
  }).catch((error) => error)
  await new Promise((resolve) => setImmediate(resolve))
  const outcome = await Promise.race([
    promise.then(() => 'settled'),
    new Promise((resolve) => setTimeout(() => resolve('refresh-still-pending'), 60)),
  ])
  releaseRefresh?.('refreshed')
  const error = await promise
  assert.equal(outcome, 'settled', 'deadline must finish the Overview consumer before refresh completes')
  assert.equal(classifyOverviewFailure(error).code, 'MODEL_TIMEOUT')
  assert.equal(fetchCalls, 1, 'an expired request must not be retried after refresh finishes')
})

test('postOverviewSse caller Stop ends its wait during 401 refresh without canceling shared refresh', async () => {
  const controller = new AbortController()
  let fetchCalls = 0
  let refreshFinished = false
  const mockFetch = async () => {
    fetchCalls += 1
    return { ok: false, status: 401, headers: new Headers(), json: async () => ({}), text: async () => '' }
  }
  const promise = postOverviewSse('/api/ai/source-overviews', { sourceId: 'source-1', mode: 'ALL' }, { signal: controller.signal }, {
    fetch: mockFetch,
    refreshAccessToken: async () => new Promise((resolve) => setTimeout(() => { refreshFinished = true; resolve('refreshed') }, 80)),
  })
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort(new DOMException('Stopped', 'AbortError'))
  const outcome = await Promise.race([
    promise.then(() => 'resolved', () => 'rejected'),
    new Promise((resolve) => setTimeout(() => resolve('still-waiting'), 20)),
  ])
  assert.equal(outcome, 'rejected', 'Stop must settle the consumer promptly')
  await new Promise((resolve) => setTimeout(resolve, 100))
  await promise.catch(() => undefined)
  assert.equal(refreshFinished, true, 'the shared refresh operation is allowed to finish independently')
  assert.equal(fetchCalls, 1, 'the stopped request must never retry')
})

test('OverviewGenerationService exposes stoppable handle for manual file overview and stops transport on last consumer', async () => {
  const repository = new FakeOverviewRepository()
  let abortCalled = false
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(_req, context) {
        context.signal?.addEventListener('abort', () => { abortCalled = true })
        await new Promise(() => {}) // hangs
        return response('ALL')
      },
    },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async () => true,
    getLocalFileGenerationRevision: async () => 'rev-1',
  })

  const handle = service.regenerateFileOverview('source-1', 'ALL')
  assert.equal(typeof handle.stop, 'function', 'manual regeneration must expose stop() handle')

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(abortCalled, false)

  handle.stop()
  const result = await handle
  assert.equal(abortCalled, true, 'abort signal should be triggered on stop')
  assert.deepEqual(result, { status: 'SKIPPED', code: 'ABORTED' })
})

test('OverviewGenerationService coalesces duplicate manual consumers and aborts transport only when all consumers leave', async () => {
  const repository = new FakeOverviewRepository()
  let abortCalled = false
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(_req, context) {
        context.signal?.addEventListener('abort', () => { abortCalled = true })
        await new Promise(() => {}) // hangs
        return response('ALL')
      },
    },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async () => true,
    getLocalFileGenerationRevision: async () => 'rev-1',
  })

  const handleA = service.regenerateFileOverview('source-1', 'ALL')
  const handleB = service.regenerateFileOverview('source-1', 'ALL')

  await new Promise((resolve) => setImmediate(resolve))

  // Stopping first consumer does NOT abort the shared transport
  handleA.stop()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(abortCalled, false, 'transport must not abort while consumer B remains')

  // Stopping second consumer (last interest) aborts the transport
  handleB.stop()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(abortCalled, true, 'transport must abort once all consumers leave')

  const [resA, resB] = await Promise.all([handleA, handleB])
  assert.deepEqual(resA, { status: 'SKIPPED', code: 'ABORTED' })
  assert.deepEqual(resB, { status: 'SKIPPED', code: 'ABORTED' })
})

test('OverviewGenerationService automatic work survives manual consumer release and view unmount', async () => {
  const repository = new FakeOverviewRepository()
  let abortCalled = false
  let finishWork
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(_req, context) {
        context.signal?.addEventListener('abort', () => { abortCalled = true })
        await new Promise((resolve) => { finishWork = resolve })
        return response('ALL')
      },
    },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async () => true,
    getLocalFileGenerationRevision: async () => 'rev-1',
  })

  // Automatic trigger starts work
  const autoPromise = service.generateReadyFileOverview('source-1', 'rev-1', 'JOB_CHANGED')
  await new Promise((resolve) => setImmediate(resolve))
  // Manual trigger coalesces with it
  const manualHandle = service.regenerateFileOverview('source-1', 'ALL')

  await new Promise((resolve) => setImmediate(resolve))

  // View unmounts or stops manual consumer
  manualHandle.stop()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(abortCalled, false, 'automatic work must not abort on manual consumer release')

  // Let work complete
  finishWork()
  const [autoRes, manualRes] = await Promise.all([autoPromise, manualHandle])
  assert.equal(abortCalled, false)
  assert.equal(autoRes.status, 'STARTED')
  assert.deepEqual(manualRes, { status: 'SKIPPED', code: 'ABORTED' })
})

test('a source revision change aborts only the old revision without changing successful cache', async () => {
  const repository = new FakeOverviewRepository()
  const cached = {
    sourceId: 'source-1',
    ingestionRevision: 'rev-1',
    title: '现有成果',
    outlineMarkdown,
    summaryMarkdown,
    status: 'READY',
  }
  repository.files.set('source-1:rev-1', cached)
  let aborted = false
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(_request, context) {
        context.signal?.addEventListener('abort', () => { aborted = true })
        await new Promise(() => {})
        return response('ALL')
      },
    },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async () => true,
    getLocalFileGenerationRevision: async () => 'rev-1',
  })
  const handle = service.regenerateFileOverview('source-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
  service.invalidateSourceRevision('source-1', 'rev-2')
  assert.deepEqual(await handle, { status: 'SKIPPED', code: 'ABORTED' })
  assert.equal(aborted, true)
  assert.equal(repository.failures.length, 0)
  assert.equal(repository.files.get('source-1:rev-1'), cached)
})

test('intentional abort returns SKIPPED/ABORTED without marking FAILED or deleting cache/outbox', async () => {
  const repository = new FakeOverviewRepository()
  const existingRecord = {
    sourceId: 'source-1',
    ingestionRevision: 'rev-1',
    title: '旧版本',
    outlineMarkdown, summaryMarkdown: summaryMarkdown,
    status: 'READY',
  }
  repository.files.set('source-1:rev-1', existingRecord)

  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(_req, context) {
        await new Promise((resolve) => context.signal?.addEventListener('abort', resolve))
        throw new DOMException('Aborted', 'AbortError')
      },
    },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async () => true,
    getLocalFileGenerationRevision: async () => 'rev-1',
  })

  const handle = service.regenerateFileOverview('source-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
  handle.stop()

  const result = await handle
  assert.deepEqual(result, { status: 'SKIPPED', code: 'ABORTED' })
  assert.equal(repository.failures.length, 0, 'intentional abort must not record failure')
  assert.deepEqual(repository.files.get('source-1:rev-1'), existingRecord, 'existing cache must remain preserved')
})

test('newer subject generation aborts previous in-flight subject generation', async () => {
  const repository = new FakeOverviewRepository()
  const abortedSignals = []
  const service = new OverviewGenerationService({
    api: {
      async generateSubjectOverview(_req, context) {
        context.signal?.addEventListener('abort', () => abortedSignals.push(context.signal))
        await new Promise(() => {}) // hangs
        return response('ALL')
      },
    },
    repository,
    listLocalFileOverviews: async () => [{
      sourceId: 'source-1',
      ingestionRevision: 'rev-1',
      title: 'Doc',
      outlineMarkdown,
      summaryMarkdown,
      status: 'READY',
    }],
  })

  const first = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))

  const second = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(abortedSignals.length, 1, 'first subject generation must be aborted by newer generation')
})

test('runtime stop and cancelAll aborts active file and subject generation', async () => {
  const repository = new FakeOverviewRepository()
  const abortedSignals = []
  const service = new OverviewGenerationService({
    api: {
      async generateSourceOverview(_req, context) {
        context.signal?.addEventListener('abort', () => abortedSignals.push('file'))
        await new Promise(() => {})
        return response('ALL')
      },
      async generateSubjectOverview(_req, context) {
        context.signal?.addEventListener('abort', () => abortedSignals.push('subject'))
        await new Promise(() => {})
        return response('ALL')
      },
    },
    repository,
    sourceApi: sourceApi({ id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }),
    isFileGenerationEligible: async () => true,
    getLocalFileGenerationRevision: async () => 'rev-1',
    listLocalFileOverviews: async () => [{
      sourceId: 'source-1',
      ingestionRevision: 'rev-1',
      title: 'Doc',
      outlineMarkdown,
      summaryMarkdown,
      status: 'READY',
    }],
  })

  const filePromise = service.regenerateFileOverview('source-1', 'ALL')
  const subjectPromise = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))

  service.cancelAll()

  const [fileRes, subjectRes] = await Promise.all([filePromise, subjectPromise])
  assert.deepEqual(fileRes, { status: 'SKIPPED', code: 'ABORTED' })
  assert.deepEqual(subjectRes, { status: 'SKIPPED', code: 'ABORTED' })
  assert.deepEqual(abortedSignals.sort(), ['file', 'subject'])
})

test('cancellation inside the subject SQL write rolls back cache and outbox without publishing', async () => {
  const sql = new BarrierOverviewSqlite()
  const previousWindow = globalThis.window
  const events = []
  try {
    const repository = new OverviewRepository('cancel-subject-user', 'device-1', { sql })
    await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', inputFingerprint: 'old-fingerprint', response: response('ALL') })
    const before = await repository.getSubjectOverview('subject-1')
    const outboxBefore = await repository.listOverviewOutbox()
    const target = new EventTarget()
    target.addEventListener('auralis-overview-cache-updated', event => events.push(['cache', event.detail]))
    target.addEventListener('auralis-overview-intent-created', event => events.push(['intent', event.detail]))
    globalThis.window = target
    const entered = sql.blockCacheWrite()
    const service = new OverviewGenerationService({
      api: { async generateSubjectOverview() { return { ...response('ALL'), title: 'Late subject result' } } },
      repository,
      listLocalFileOverviews: async () => [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }],
    })
    const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
    await entered
    service.cancelAll()
    sql.release()

    assert.deepEqual(await attempt, { status: 'SKIPPED', code: 'ABORTED' })
    assert.deepEqual(await repository.getSubjectOverview('subject-1'), before)
    assert.deepEqual(await repository.listOverviewOutbox(), outboxBefore)
    assert.deepEqual(events, [])
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    sql.close()
  }
})

test('stopping a file consumer inside the SQL write rolls back its late cache and outbox write', async () => {
  const sql = new BarrierOverviewSqlite()
  const previousWindow = globalThis.window
  const events = []
  try {
    const repository = new OverviewRepository('cancel-file-user', 'device-1', { sql })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
    const before = await repository.getFileOverview('source-1', 'rev-1')
    const outboxBefore = await repository.listOverviewOutbox()
    const target = new EventTarget()
    target.addEventListener('auralis-overview-cache-updated', event => events.push(['cache', event.detail]))
    target.addEventListener('auralis-overview-intent-created', event => events.push(['intent', event.detail]))
    globalThis.window = target
    const entered = sql.blockCacheWrite()
    const service = new OverviewGenerationService({
      api: { async generateSourceOverview() { return { ...response('ALL'), title: 'Late file result' } } },
      repository,
      sourceApi: { async get() { return { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    })
    const attempt = service.regenerateFileOverview('source-1', 'ALL')
    await entered
    attempt.stop()
    sql.release()

    assert.deepEqual(await attempt, { status: 'SKIPPED', code: 'ABORTED' })
    await sql.waitForTransactions(2)
    assert.deepEqual(await repository.getFileOverview('source-1', 'rev-1'), before)
    assert.deepEqual(await repository.listOverviewOutbox(), outboxBefore)
    assert.deepEqual(events, [])
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    sql.close()
  }
})

test('a queued cancelled file save is rejected after the earlier SQL write releases', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('queued-cancel-user', 'device-1', { sql })
    const blockerEntered = sql.blockCacheWrite()
    const blockerSave = repository.saveFileOverviewPart({ sourceId: 'blocker', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
    await blockerEntered
    let queuedSaveResolve
    const queuedSaveCalled = new Promise(resolve => { queuedSaveResolve = resolve })
    let queuedSaveSettledResolve
    const queuedSaveSettled = new Promise(resolve => { queuedSaveSettledResolve = resolve })
    const save = repository.saveFileOverviewPart.bind(repository)
    repository.saveFileOverviewPart = input => {
      const pending = save(input)
      if (input.sourceId === 'source-queued') {
        queuedSaveResolve()
        pending.then(queuedSaveSettledResolve, queuedSaveSettledResolve)
      }
      return pending
    }
    const service = new OverviewGenerationService({
      api: { async generateSourceOverview() { return response('ALL') } },
      repository,
      sourceApi: { async get() { return { id: 'source-queued', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    })
    const attempt = service.regenerateFileOverview('source-queued', 'ALL')
    await queuedSaveCalled
    attempt.stop()
    sql.release()

    assert.deepEqual(await attempt, { status: 'SKIPPED', code: 'ABORTED' })
    await blockerSave
    await queuedSaveSettled
    await sql.waitForTransactions(1)
    assert.equal(await repository.getFileOverview('source-queued', 'rev-1'), null)
    assert.deepEqual((await repository.listOverviewOutbox()).map(item => item.scopeId), ['blocker'])
  } finally { sql.close() }
})

test('a superseded subject SQL save rolls back without deleting either prior or newer owner data', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('subject-supersede-user', 'device-1', { sql })
    await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', inputFingerprint: 'prior-fingerprint', response: response('ALL') })
    const originalOutbox = await repository.listOverviewOutbox()
    const entered = sql.blockCacheWrite()
    let providerCalls = 0
    const service = new OverviewGenerationService({
      api: { async generateSubjectOverview() {
        providerCalls += 1
        return { ...response('ALL'), title: providerCalls === 1 ? 'Superseded result' : 'Current result' }
      } },
      repository,
      listLocalFileOverviews: async () => [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }],
    })
    const first = service.regenerateSubjectOverview('subject-1', 'ALL')
    await entered
    const second = service.regenerateSubjectOverview('subject-1', 'ALL')
    sql.release()
    const [firstResult, secondResult] = await Promise.all([first, second])

    assert.deepEqual(firstResult, { status: 'SKIPPED', code: 'ABORTED' })
    assert.equal(secondResult.status, 'STARTED')
    assert.equal((await repository.getSubjectOverview('subject-1'))?.title, 'Current result')
    const outbox = await repository.listOverviewOutbox()
    assert.deepEqual(outbox.slice(0, originalOutbox.length), originalOutbox)
    assert.equal(outbox.length, originalOutbox.length + 1)
  } finally { sql.close() }
})

test('a subject Stop after SQL commit preserves the committed cache and intent', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('subject-commit-boundary-user', 'device-1', { sql })
    await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', inputFingerprint: 'prior-fingerprint', response: response('ALL') })
    const outboxBefore = await repository.listOverviewOutbox()
    const save = repository.saveSubjectOverviewPart.bind(repository)
    let committedResolve
    const committed = new Promise(resolve => { committedResolve = resolve })
    let releaseSave
    const saveGate = new Promise(resolve => { releaseSave = resolve })
    repository.saveSubjectOverviewPart = async input => {
      const result = await save(input)
      committedResolve()
      await saveGate
      return result
    }
    const service = new OverviewGenerationService({
      api: { async generateSubjectOverview() { return { ...response('ALL'), title: 'Committed subject result' } } },
      repository,
      listLocalFileOverviews: async () => [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }],
    })
    const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
    await committed
    service.cancelAll()
    releaseSave()

    assert.deepEqual(await attempt, { status: 'SKIPPED', code: 'ABORTED' })
    assert.equal((await repository.getSubjectOverview('subject-1'))?.title, 'Committed subject result')
    assert.equal((await repository.listOverviewOutbox()).length, outboxBefore.length + 1)
  } finally { sql.close() }
})

test('a file Stop after SQL commit keeps the committed cache and intent', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('file-commit-boundary-user', 'device-1', { sql })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
    const outboxBefore = await repository.listOverviewOutbox()
    const save = repository.saveFileOverviewPart.bind(repository)
    let committedResolve
    const committed = new Promise(resolve => { committedResolve = resolve })
    let settledResolve
    const saveSettled = new Promise(resolve => { settledResolve = resolve })
    let releaseSave
    const saveGate = new Promise(resolve => { releaseSave = resolve })
    repository.saveFileOverviewPart = async input => {
      try {
        const result = await save(input)
        committedResolve()
        await saveGate
        return result
      } finally { settledResolve() }
    }
    const service = new OverviewGenerationService({
      api: { async generateSourceOverview() { return { ...response('ALL'), title: 'Committed file result' } } },
      repository,
      sourceApi: { async get() { return { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    })
    const attempt = service.regenerateFileOverview('source-1', 'ALL')
    await committed
    attempt.stop()
    releaseSave()

    assert.deepEqual(await attempt, { status: 'SKIPPED', code: 'ABORTED' })
    await saveSettled
    assert.equal((await repository.getFileOverview('source-1', 'rev-1'))?.title, 'Committed file result')
    assert.equal((await repository.listOverviewOutbox()).length, outboxBefore.length + 1)
  } finally { sql.close() }
})

test('late file generation preserves a saved local outlineMarkdown edit and offers exact Keep/Use choices without mutating a frozen write', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('generation-edit-conflict-file', 'device-1', { sql })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
    const initial = (await repository.listOverviewOutbox())[0]
    const frozenBody = { baseVersion: 1, clientWriteId: initial.clientWriteId, mode: 'ALL', ingestionRevision: 'rev-1',
      outlineGeneratedAt: initial.outlineGeneratedAt, summaryGeneratedAt: initial.summaryGeneratedAt,
      result: { schemaVersion: 2, title: initial.result.title, outlineMarkdown: initial.result.outlineMarkdown, summaryMarkdown: initial.result.summaryMarkdown } }
    await repository.materializeOverviewIntent(initial.clientWriteId, frozenBody)

    let startResolve
    const started = new Promise(resolve => { startResolve = resolve })
    let generationResolve
    const generated = new Promise(resolve => { generationResolve = resolve })
    const aiOutline = '## AI chapter\n- AI section'
    const service = new OverviewGenerationService({
      api: { async generateSourceOverview() { startResolve(); return generated } },
      repository,
      sourceApi: { async get() { return { id: 'source-1', type: 'FILE', ingestionStatus: 'READY', ingestionRevision: 'rev-1' } } },
    })
    const attempt = service.regenerateFileOverview('source-1', 'OUTLINE')
    await started
    const localOutline = '## My edited chapter\n- My edited section'
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE',
      response: { ...response('OUTLINE'), outlineMarkdown: localOutline } })
    generationResolve({ ...response('OUTLINE'), outlineMarkdown: aiOutline })

    const outcome = await attempt
    assert.equal(outcome.status, 'LOCAL_EDIT_CONFLICT')
    const preserved = await repository.getFileOverview('source-1', 'rev-1')
    assert.deepEqual(preserved?.outlineMarkdown, localOutline)
    assert.deepEqual(preserved?.generationConflicts?.[0]?.result.outlineMarkdown, aiOutline)
    const beforeChoice = await repository.listOverviewOutbox()
    const frozenBefore = beforeChoice.find(item => item.clientWriteId === initial.clientWriteId)
    assert.equal(frozenBefore?.state, 'PENDING')
    assert.deepEqual(frozenBefore?.requestBody, frozenBody)

    const kept = await repository.resolveGenerationEditConflict(outcome.clientWriteId, 'KEEP_LOCAL')
    assert.equal(kept.status, 'KEPT')
    assert.deepEqual((await repository.getFileOverview('source-1', 'rev-1'))?.outlineMarkdown, localOutline)
    assert.equal((await repository.listOverviewOutbox()).find(item => item.clientWriteId === outcome.clientWriteId)?.state, 'STALE')
  } finally { sql.close() }
})

test('using a late subject generation requires an unchanged current part and then preserves the normal save path', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('generation-edit-conflict-subject', 'device-1', { sql })
    await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', inputFingerprint: 'subject-fingerprint', response: response('ALL') })
    let startResolve
    const started = new Promise(resolve => { startResolve = resolve })
    let generationResolve
    const generated = new Promise(resolve => { generationResolve = resolve })
    const aiOutline = '## AI subject chapter\nSupported content'
    const service = new OverviewGenerationService({
      api: { async generateSubjectOverview() { startResolve(); return generated } },
      repository,
      listLocalFileOverviews: async () => [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outlineMarkdown, summaryMarkdown }],
    })
    const attempt = service.regenerateSubjectOverview('subject-1', 'OUTLINE')
    await started
    const localOutline = '## My subject chapter\nSupported content'
    await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'OUTLINE', inputFingerprint: 'subject-fingerprint',
      response: { ...response('OUTLINE'), outlineMarkdown: localOutline } })
    generationResolve({ ...response('OUTLINE'), outlineMarkdown: aiOutline })
    const outcome = await attempt
    assert.equal(outcome.status, 'LOCAL_EDIT_CONFLICT')
    assert.deepEqual((await repository.getSubjectOverview('subject-1'))?.outlineMarkdown, localOutline)

    const latestLocalOutline = '## Edited again after conflict\nSupported content'
    await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'OUTLINE', inputFingerprint: 'subject-fingerprint',
      response: { ...response('OUTLINE'), outlineMarkdown: latestLocalOutline } })
    const changed = await repository.resolveGenerationEditConflict(outcome.clientWriteId, 'USE_AI')
    assert.equal(changed.status, 'CHANGED')
    assert.deepEqual((await repository.getSubjectOverview('subject-1'))?.outlineMarkdown, latestLocalOutline)
    const resolution = await repository.resolveGenerationEditConflict(outcome.clientWriteId, 'USE_AI')
    assert.equal(resolution.status, 'APPLIED')
    const current = await repository.getSubjectOverview('subject-1')
    assert.deepEqual(current?.outlineMarkdown, aiOutline)
    const outbox = await repository.listOverviewOutbox()
    assert.equal(outbox.find(item => item.clientWriteId === outcome.clientWriteId)?.state, 'STALE')
    assert.ok(outbox.some(item => item.scopeType === 'SUBJECT' && item.mode === 'OUTLINE'
      && item.errorCode !== 'OVERVIEW_GENERATION_EDIT_CONFLICT' && item.state === 'PREPARED'))
  } finally { sql.close() }
})

test('same editable part with only cache acknowledgement metadata changes does not create a generation edit conflict', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('generation-edit-conflict-ack', 'device-1', { sql })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
    const baseline = await repository.captureGenerationBaseline('FILE', 'source-1', 'rev-1', 'OUTLINE')
    await sql.execute("UPDATE ai_overview_cache SET updated_at='2026-10-22T12:34:56.000Z' WHERE user_id=$1 AND device_id=$2 AND scope_type='FILE' AND scope_id='source-1'",
      ['generation-edit-conflict-ack', 'device-1'])
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE',
      response: { ...response('OUTLINE'), title: 'Generated after acknowledgement', outlineMarkdown }, generationBaseline: baseline })
    assert.equal((await repository.listOverviewOutbox()).filter(item => item.errorCode === 'OVERVIEW_GENERATION_EDIT_CONFLICT').length, 0)
    assert.equal((await repository.getFileOverview('source-1', 'rev-1'))?.title, 'Generated after acknowledgement')
    assert.deepEqual((await repository.getFileOverview('source-1', 'rev-1'))?.outlineMarkdown, outlineMarkdown)
  } finally { sql.close() }
})

test('cloud CAS conflict and generation edit conflict remain distinct and local retry leaves the AI intent intact', async () => {
  const sql = new BarrierOverviewSqlite()
  try {
    const repository = new OverviewRepository('generation-cloud-conflict-coexist', 'device-1', { sql })
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'ALL', response: response('ALL') })
    const baseline = await repository.captureGenerationBaseline('FILE','source-1','rev-1','OUTLINE')
    const localOutline = '## Cloud conflict local\nSupported content'
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE',
      response: { ...response('OUTLINE'), outlineMarkdown: localOutline } })
    const ordinary = (await repository.listOverviewOutbox()).filter(item => item.state === 'PREPARED').at(-1)
    await repository.setOverviewIntentState(ordinary.clientWriteId,'CONFLICT','OVERVIEW_VERSION_CONFLICT')
    const aiOutline = '## Unpublished AI\nSupported content'
    await repository.saveFileOverviewPart({ sourceId: 'source-1', ingestionRevision: 'rev-1', mode: 'OUTLINE',
      response: { ...response('OUTLINE'), outlineMarkdown: aiOutline }, generationBaseline: baseline })
    let current = await repository.getFileOverview('source-1','rev-1')
    assert.equal(current?.syncStatus, 'CONFLICT')
    assert.equal(current?.syncError, 'OVERVIEW_VERSION_CONFLICT')
    assert.deepEqual(current?.generationConflicts?.[0]?.result.outlineMarkdown, aiOutline)

    await repository.retryOverviewConflictLocally('FILE','source-1','rev-1')
    const outbox = await repository.listOverviewOutbox()
    const candidate = outbox.find(item => item.errorCode === 'OVERVIEW_GENERATION_EDIT_CONFLICT')
    assert.equal(candidate?.state, 'CONFLICT')
    assert.notEqual(outbox.find(item => item.clientWriteId === candidate?.clientWriteId)?.errorCode, 'OVERVIEW_VERSION_CONFLICT')
    current = await repository.getFileOverview('source-1','rev-1')
    assert.deepEqual(current?.generationConflicts?.[0]?.result.outlineMarkdown, aiOutline)
  } finally { sql.close() }
})
