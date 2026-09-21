import assert from 'node:assert/strict'
import { register } from 'node:module'
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
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { OverviewGenerationService } = await import('../src/services/overviewGenerationService.ts')
const { validateOverviewResponse } = await import('../src/api/overviewResponseValidator.ts')
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

const outline = [{ title: '第一章', sections: [{ title: '第一节', summary: '摘要', sourceIds: ['source-1'], locator: null }] }]
const summary = { overview: '文件概述', keyPoints: ['重点'], learningPath: ['基础'] }
const response = (mode = 'ALL') => ({
  schemaVersion: 1,
  title: '文件总览',
  outline: mode === 'SUMMARY' ? null : outline,
  summary: mode === 'OUTLINE' ? null : summary,
})

class FakeOverviewRepository {
  constructor() { this.files = new Map(); this.subjects = new Map(); this.failures = []; this.removedOverviewSources = []; this.removedSubjectOverviews = [] }
  async getFileOverview(sourceId, revision) { return this.files.get(`${sourceId}:${revision}`) ?? null }
  async saveFileOverviewPart(input) {
    const key = `${input.sourceId}:${input.ingestionRevision}`
    const previous = this.files.get(key)
    const next = {
      ...(previous ?? { sourceId: input.sourceId, ingestionRevision: input.ingestionRevision, outline: null, summary: null }),
      title: input.response.title,
      outline: input.mode === 'SUMMARY' ? previous?.outline ?? null : input.response.outline,
      summary: input.mode === 'OUTLINE' ? previous?.summary ?? null : input.response.summary,
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
        outline: null,
        summary: null,
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
  async saveSubjectOverviewPart(input) { this.subjects.set(input.subjectId, { ...input, status: 'READY' }); return this.subjects.get(input.subjectId) }
  async markSubjectOverviewFailed(subjectId, mode, code, detail) { this.failures.push({ subjectId, mode, code, detail }) }
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
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outline: null, summary: null,
      status: 'FAILED', errorCode: 'MODEL_TIMEOUT', errorDetail: 'safe',
      expectedOutcome: 'SKIPPED_FAILED_REQUIRES_MANUAL_RETRY' },
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outline: null, summary: null,
      status: 'FAILED', errorCode: 'MODEL_PROVIDER_ERROR', errorDetail: 'safe',
      expectedOutcome: 'SKIPPED_FAILED_REQUIRES_MANUAL_RETRY' },
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '文件总览', outline, summary: null,
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
  assert.deepEqual(cached.outline, outline)
  assert.equal(cached.summary, null)
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
    sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outline: null, summary: null,
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
  assert.deepEqual(cached.outline, outline)
  assert.deepEqual(cached.summary, summary)
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
  assert.deepEqual(cached.outline, outline)
  assert.deepEqual(cached.summary, summary)
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
  assert.deepEqual(saved.outline, outline)
  assert.deepEqual(saved.summary, summary)
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
      { sourceId: 'b', ingestionRevision: 'rev-b', title: 'B', status: 'READY', outline, summary },
      { sourceId: 'a', ingestionRevision: 'rev-a', title: 'A', status: 'READY', outline, summary },
      { sourceId: 'failed', ingestionRevision: 'rev-f', title: 'F', status: 'FAILED', outline: null, summary: null },
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
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary },
    ],
  })

  const result = await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.deepEqual(result, { status: 'STARTED', requestId: 'subject-request-1' })
  assert.equal(context.requestId, 'subject-request-1')
  assert.ok(context.signal instanceof AbortSignal)
})

test('manual subject regeneration returns FAILED and preserves the previous result on provider failure', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', response: response('ALL'), inputFingerprint: 'old-fingerprint' })
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview() { throw { code: 'MODEL_PROVIDER_ERROR' } } },
    repository,
    requestIdFactory: () => 'subject-request-2',
    listLocalFileOverviews: async () => [
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary },
    ],
  })

  const result = await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.deepEqual(result, { status: 'FAILED', code: 'MODEL_PROVIDER_ERROR', detail: 'Overview generation failed: MODEL_PROVIDER_ERROR' })
  assert.deepEqual(await repository.getSubjectOverview('subject-1'), {
    subjectId: 'subject-1', mode: 'ALL', response: response('ALL'), inputFingerprint: 'old-fingerprint', status: 'READY',
  })
  assert.equal(repository.failures.at(-1).code, 'MODEL_PROVIDER_ERROR')
})

test('subject regeneration filters local inputs by the requested mode', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const files = [
    { sourceId: 'both', ingestionRevision: 'rev-1', title: 'Both', status: 'READY', outline, summary },
    { sourceId: 'outline', ingestionRevision: 'rev-2', title: 'Outline', status: 'READY', outline, summary: null },
    { sourceId: 'summary', ingestionRevision: 'rev-3', title: 'Summary', status: 'READY', outline: null, summary },
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
    ['both', 'outline'],
    ['both', 'summary'],
  ])
})

test('subject regeneration excludes empty outline or summary inputs while preserving mode-specific usable parts', async () => {
  const repository = new FakeOverviewRepository()
  const calls = []
  const files = [
    { sourceId: 'complete', ingestionRevision: 'rev-1', title: 'Complete', status: 'READY', outline, summary },
    { sourceId: 'empty-outline', ingestionRevision: 'rev-2', title: 'Empty outline', status: 'READY', outline: [], summary },
    { sourceId: 'empty-summary', ingestionRevision: 'rev-3', title: 'Empty summary', status: 'READY', outline, summary: { overview: '', keyPoints: [], learningPath: [] } },
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
    ['complete', 'empty-summary'],
    ['complete', 'empty-outline'],
  ])
  assert.equal(calls[1].sources.find(item => item.sourceId === 'empty-summary').summary, null)
  assert.equal(calls[2].sources.find(item => item.sourceId === 'empty-outline').outline, null)
})

test('subject regeneration safely preserves the previous result when every local input is unusable', async () => {
  const repository = new FakeOverviewRepository()
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-1', mode: 'ALL', response: response('ALL'), inputFingerprint: 'old-fingerprint' })
  const calls = []
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(request) { calls.push(request); return response(request.mode) } },
    repository,
    listLocalFileOverviews: async () => [
      { sourceId: 'empty-outline', ingestionRevision: 'rev-2', title: 'Empty outline', status: 'READY', outline: [], summary },
      { sourceId: 'empty-summary', ingestionRevision: 'rev-3', title: 'Empty summary', status: 'READY', outline, summary: { overview: '', keyPoints: [], learningPath: [] } },
    ],
  })

  const result = await service.regenerateSubjectOverview('subject-1', 'ALL')

  assert.deepEqual(calls, [])
  assert.deepEqual(result, { status: 'SKIPPED', code: 'NO_USABLE_INPUT' })
  assert.deepEqual(await repository.getSubjectOverview('subject-1'), {
    subjectId: 'subject-1', mode: 'ALL', response: response('ALL'), inputFingerprint: 'old-fingerprint', status: 'READY',
  })
  assert.equal(repository.failures.length, 0)
})

test('subject regeneration rejects a late response when source revision changes before save', async () => {
  const repository = new FakeOverviewRepository()
  let files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary }]
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
  const files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary }]
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
  const files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary }]
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
  let signal
  const service = new OverviewGenerationService({
    api: { async generateSubjectOverview(_request, context) { signal = context.signal; await providerGate; return response('ALL') } },
    repository,
    listLocalFileOverviews: async () => [
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary },
    ],
  })
  const attempt = service.regenerateSubjectOverview('subject-1', 'ALL')
  await new Promise((resolve) => setImmediate(resolve))
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
  const files = [{ sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary }]
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

test('discard during subject cache save compensates the late write before generation settles', async () => {
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
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary },
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
      { sourceId: 'source-1', ingestionRevision: 'rev-1', title: 'Source', status: 'READY', outline, summary },
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
  assert.deepEqual(validateOverviewResponse(response('ALL'), 'ALL'), response('ALL'))
  assert.throws(() => validateOverviewResponse({ ...response('ALL'), schemaVersion: 2 }, 'ALL'), /OVERVIEW_RESPONSE_INVALID/)
  assert.throws(() => validateOverviewResponse({ ...response('ALL'), outline: 'bad' }, 'ALL'), /OVERVIEW_RESPONSE_INVALID/)
  assert.throws(() => validateOverviewResponse(response('SUMMARY'), 'ALL'), /OVERVIEW_RESPONSE_INVALID/)
  assert.throws(() => validateOverviewResponse(response('OUTLINE'), 'SUMMARY'), /OVERVIEW_RESPONSE_INVALID/)
})

test('overview API maps the two authenticated stateless endpoints exactly', async () => {
  const api = await source('src/api/useOverviewApi.ts')
  assert.match(api, /aiRequest\.post\('\/api\/ai\/source-overviews', request,/)
  assert.match(api, /aiRequest\.post\('\/api\/ai\/subject-overviews', request,/)
  assert.doesNotMatch(api, /userId|serverDeviceId|conversation|localStorage/)
})

test('overview generation requests carry a per-attempt request id and server stages expose a generation id', async () => {
  const api = await source('src/api/useOverviewApi.ts')
  const server = await readFile(path.resolve(import.meta.dirname, '..', '..', 'Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java'), 'utf8')
  const cors = await readFile(path.resolve(import.meta.dirname, '..', '..', 'Auralis-Server/src/main/java/com/auralis/app/shared/config/WebConfiguration.java'), 'utf8')
  assert.match(api, /X-Overview-Request-Id/)
  assert.match(cors, /X-Overview-Request-Id/)
  assert.match(api, /randomUUID|uuidv7/i)
  assert.match(api, /context\?\.requestId\s*\?\?\s*overviewRequestId\(\)/)
  assert.match(server, /generationId/)
  for (const stage of ['MAP', 'REDUCE', 'JSON_PARSE', 'SCHEMA_VALIDATE', 'CACHE_RETURN']) {
    assert.match(server, new RegExp(stage))
  }
  assert.match(server, /causeType|causeMessage|exceptionType/)
})

test('overview API callsites preserve the service request ID in the existing header', async () => {
  const api = await source('src/api/useOverviewApi.ts')
  for (const method of ['generateSourceOverview', 'generateSubjectOverview']) {
    const start = api.indexOf(`${method}(request`)
    assert.notEqual(start, -1, `missing API method: ${method}`)
    const callsite = api.slice(start, start + 450)
    assert.match(callsite, /context\?: OverviewRequestContext/)
    assert.match(callsite, /X-Overview-Request-Id.*context\?\.requestId\s*\?\?\s*overviewRequestId\(\)/s)
    assert.match(callsite, /signal:\s*context\?\.signal/)
  }
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
