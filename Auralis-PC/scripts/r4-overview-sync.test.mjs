import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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

const { createMemoryStorage } = await import('../src/services/localRepository.ts')
const { OverviewRepository, computeSubjectInputFingerprint } = await import('../src/services/overviewRepository.ts')
const { computeOverviewManifestFingerprint, OverviewResultsSyncService, runOverviewConflictResolutionOnce } = await import('../src/services/overviewResultsSyncService.ts')
const { createOutlineProvenanceInputForLinkedSources, createOutlineProvenanceView, filterOutlineSourceRefs } = await import('../src/services/outlineIdentity.ts')
const { OVERVIEW_INTENT_CREATED_EVENT, subscribeOverviewIntentCreated } = await import('../src/services/overviewSyncWakeup.ts')
const { ApiProblemError } = await import('../src/api/httpError.ts')
const syncStoreSource = await readFile(new URL('../src/store/useSyncStore.ts', import.meta.url), 'utf8')
const fileOutlineUiSource = await readFile(new URL('../src/components/subject/FileOutlineList.vue', import.meta.url), 'utf8')
const subjectOverviewUiSource = await readFile(new URL('../src/components/subject/SubjectOverviewSection.vue', import.meta.url), 'utf8')

const outline = [{ title: 'Limits', sections: [{ title: 'Sequence limits', summary: 'Definition', sourceIds: ['file-a'], locator: null }] }]
const summary = { overview: 'Calculus overview', keyPoints: ['Limits'], learningPath: ['Limits', 'Derivatives'] }
const record = (scopeType = 'FILE', scopeId = 'file-a', revisionKey = 'rev-1', title = 'Local') => ({
  scopeType, scopeId, revisionKey, schemaVersion: 1, title, outline, summary,
  outlineGeneratedAt: '2026-09-30T10:00:00.000Z', summaryGeneratedAt: '2026-09-30T10:01:00.000Z',
  inputFingerprint: scopeType === 'SUBJECT' ? 'local-input' : null, status: 'READY',
  errorCode: null, errorDetail: null, updatedAt: '2026-09-30T10:01:00.000Z',
})

function fileView(sourceId, revision, options = {}) {
  return {
    id: `remote-${sourceId}`, scopeType: 'SOURCE', sourceId, subjectId: null, ingestionRevision: revision,
    version: options.version ?? 1, outlineVersion: options.outlineVersion ?? 2, summaryVersion: options.summaryVersion ?? 3,
    schemaVersion: 1, title: options.title ?? 'Remote file', outline, summary,
    outlineSourceManifest: null, summarySourceManifest: null, outlineInputFingerprint: null, summaryInputFingerprint: null,
    outlineGeneratedAt: '2026-09-30T10:00:00.000Z', summaryGeneratedAt: '2026-09-30T10:01:00.000Z',
    updatedAt: '2026-09-30T10:02:00.000Z',
  }
}

function subjectView(subjectId, command, version = 1) {
  return {
    id: `remote-${subjectId}`, scopeType: 'SUBJECT', sourceId: null, subjectId, ingestionRevision: null,
    version, outlineVersion: version, summaryVersion: version, schemaVersion: 1, title: command.result.title,
    outline: command.result.outline, summary: command.result.summary,
    outlineSourceManifest: command.sourceManifest ?? null, summarySourceManifest: command.sourceManifest ?? null,
    outlineInputFingerprint: command.inputFingerprint ?? null, summaryInputFingerprint: command.inputFingerprint ?? null,
    outlineGeneratedAt: command.outlineGeneratedAt, summaryGeneratedAt: command.summaryGeneratedAt,
    updatedAt: '2026-09-30T10:03:00.000Z',
  }
}

function fakeApi(overrides = {}) {
  const calls = { getFiles: [], putFiles: [], getSubjects: [], putSubjects: [] }
  return {
    calls,
    async getFile(...args) { calls.getFiles.push(args); return overrides.getFile ? overrides.getFile(...args) : null },
    async putFile(...args) { calls.putFiles.push(args); return overrides.putFile ? overrides.putFile(...args) : fileView(args[0], args[1].ingestionRevision) },
    async getSubject(...args) { calls.getSubjects.push(args); return overrides.getSubject ? overrides.getSubject(...args) : null },
    async putSubject(...args) { calls.putSubjects.push(args); return overrides.putSubject ? overrides.putSubject(...args) : subjectView(args[0], args[1]) },
  }
}

function source(id = 'file-a', revision = 'rev-1', subjectId = 'subject-a') {
  return { id, type: 'FILE', subjectId, ingestionStatus: 'READY', ingestionRevision: revision }
}
function options(sources = [source()], subjectIds = []) {
  return { sources, subjectIds, isCurrent: () => true }
}
function service(repository, api) {
  return new OverviewResultsSyncService(repository, repository.userId, repository.serverDeviceId, api)
}
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('partial cache parts merge locally without an upload intent until complete', async () => {
  const repository = new OverviewRepository('partial-user', 'partial-device', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'OUTLINE', response: { schemaVersion: 1, title: 'File', outline, summary: null } })
  assert.equal((await repository.listOverviewOutbox()).length, 0)
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'SUMMARY', response: { schemaVersion: 1, title: 'File', outline: null, summary } })
  const queued = await repository.listOverviewOutbox()
  assert.equal(queued.length, 1)
  assert.equal(queued[0].mode, 'SUMMARY')
  assert.deepEqual(queued[0].result.outline, outline)
  assert.deepEqual(queued[0].result.summary, summary)
})

test('a generation-edit conflict stays local while the ordinary frozen edit intent still synchronizes', async () => {
  const repository = new OverviewRepository('generation-conflict-sync-user', 'device-1', { storage: createMemoryStorage() })
  const api = fakeApi()
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL',
    response: { schemaVersion: 1, title: 'Local', outline, summary } })
  await service(repository,api).reconcile(options())
  assert.equal(api.calls.putFiles.length, 1)

  const generationBaseline = await repository.captureGenerationBaseline('FILE','file-a','rev-1','OUTLINE')
  const localOutline = [{ title: 'Locally edited', sections: [{ title: 'Local section', summary: 'Local edit', sourceIds: ['file-a'], locator: null }] }]
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'OUTLINE',
    response: { schemaVersion: 1, title: 'Local edit', outline: localOutline, summary: null } })
  const ordinaryIntent = (await repository.listOverviewOutbox()).find(item => item.scopeType === 'FILE' && item.state === 'PREPARED')
  const aiOutline = [{ title: 'AI result', sections: [{ title: 'AI section', summary: 'AI', sourceIds: ['file-a'], locator: null }] }]
  const conflicted = await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'OUTLINE',
    response: { schemaVersion: 1, title: 'Generated', outline: aiOutline, summary: null }, generationBaseline })
  assert.equal(conflicted.generationConflicts?.[0]?.clientWriteId, (await repository.listOverviewOutbox()).find(item => item.errorCode === 'OVERVIEW_GENERATION_EDIT_CONFLICT')?.clientWriteId)

  await service(repository,api).reconcile(options())
  const sent = api.calls.putFiles.slice(1)
  assert.equal(sent.length, 1)
  assert.equal(sent[0][1].clientWriteId, ordinaryIntent?.clientWriteId)
  assert.deepEqual(sent[0][1].result.outline, localOutline)
  assert.deepEqual((await repository.getFileOverview('file-a','rev-1'))?.outline, localOutline)
  assert.equal((await repository.listOverviewOutbox()).find(item => item.errorCode === 'OVERVIEW_GENERATION_EDIT_CONFLICT')?.state, 'CONFLICT')
})

test('only committed complete local writes wake sync; failures, remote installs and ACKs do not loop', async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  const wakeups = []
  const unsubscribe = subscribeOverviewIntentCreated(target,
    detail => detail.userId === 'wake-user' && detail.serverDeviceId === 'wake-device',
    () => wakeups.push('write'))
  try {
    const storage = createMemoryStorage()
    const repository = new OverviewRepository('wake-user', 'wake-device', { storage })
    await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'OUTLINE',
      response: { schemaVersion: 1, title: 'File', outline, summary: null } })
    assert.deepEqual(wakeups, [])
    await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'SUMMARY',
      response: { schemaVersion: 1, title: 'File', outline: null, summary } })
    assert.deepEqual(wakeups, ['write'])
    assert.equal(OVERVIEW_INTENT_CREATED_EVENT, 'auralis-overview-intent-created')
    assert.equal(JSON.parse(storage.getItem('auralis:v1:overviews:wake-user:wake-device')).outbox.length, 1,
      'the event is dispatched only after the record and PREPARED intent are committed')

    const api = fakeApi({ putFile: async (sourceId, command) => fileView(sourceId, command.ingestionRevision, { title: command.result.title }) })
    await service(repository, api).reconcile(options())
    assert.deepEqual(wakeups, ['write'], 'server ACK must not enqueue another sync wake')

    const remoteRepository = new OverviewRepository('wake-user', 'wake-device-remote', { storage: createMemoryStorage() })
    const remoteApi = fakeApi({ getFile: async (sourceId, revision) => fileView(sourceId, revision) })
    await service(remoteRepository, remoteApi).reconcile(options())
    assert.deepEqual(wakeups, ['write'], 'installing a server result must not enqueue another sync wake')

    const failingRepository = new OverviewRepository('wake-user', 'wake-device', {
      storage: { getItem: () => null, setItem: () => { throw new Error('storage unavailable') } },
    })
    await assert.rejects(() => failingRepository.saveFileOverviewPart({ sourceId: 'file-fail', ingestionRevision: 'rev-1', mode: 'ALL',
      response: { schemaVersion: 1, title: 'Failed', outline, summary } }), /storage unavailable/)
    assert.deepEqual(wakeups, ['write'], 'a failed cache/outbox commit must not wake sync')

    const otherOwner = new OverviewRepository('other-user', 'other-device', { storage: createMemoryStorage() })
    await otherOwner.saveFileOverviewPart({ sourceId: 'file-other', ingestionRevision: 'rev-1', mode: 'ALL',
      response: { schemaVersion: 1, title: 'Other', outline, summary } })
    assert.deepEqual(wakeups, ['write'], 'an event from another owner/device must not wake this scope')
  } finally {
    unsubscribe()
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else delete globalThis.window
  }
})

test('the active sync store maps committed Overview intents to a write sync request', () => {
  assert.match(syncStoreSource, /subscribeOverviewIntentCreated\(window,[\s\S]{0,300}requestBackgroundSync\('write'\)\)/)
})

test('terminal sync error notices are not shown in File and Subject Overview panels', () => {
  assert.doesNotMatch(fileOutlineUiSource, /本机总览尚未同步/)
  assert.doesNotMatch(subjectOverviewUiSource, /本机学科总览尚未同步/)
})

test('a complete legacy browser cache stays local and unready until an explicit identity initialization', async () => {
  const storage = createMemoryStorage()
  const repository = new OverviewRepository('legacy-user', 'legacy-device', { storage })
  storage.setItem('auralis:v1:overviews:legacy-user:legacy-device', JSON.stringify([record()]))
  const api = fakeApi({ putFile: async (sourceId, command) => fileView(sourceId, command.ingestionRevision, { title: command.result.title, version: 1 }) })

  await service(repository, api).reconcile(options())

  assert.equal(api.calls.getFiles.length, 1)
  assert.equal(api.calls.putFiles.length, 0, 'an old cache has no trustworthy persistent node identity to initialize remotely')
  const legacy = await repository.getFileOverview('file-a', 'rev-1')
  assert.deepEqual(legacy?.outline, outline)
  assert.deepEqual(legacy?.summary, summary)
  assert.equal(legacy?.identityReady, false)
  assert.equal(legacy?.outlineIdentity, null)
  const [seed] = await repository.listOverviewOutbox()
  assert.equal(seed?.origin, 'LEGACY_SEED')
  assert.equal(seed?.state, 'ERROR')
  assert.equal(seed?.errorCode, 'OVERVIEW_IDENTITY_INITIALIZATION_REQUIRED')
  assert.equal(seed?.requestBody, null, 'the legacy cache remains visible without freezing a fabricated identity request')
  assert.equal(typeof seed?.clientWriteId, 'string', 'the blocked seed intent remains available for explicit recovery')
  assert.equal(await repository.getOverviewSyncState('FILE', 'file-a', 'rev-1'), null)
})

test('a transport retry replays the exact persisted Overview request and write id', async () => {
  const repository = new OverviewRepository('retry-user', 'retry-device', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'Local', outline, summary } })
  const sent = []
  let writes = 0
  const api = fakeApi({
    putFile: async (sourceId, command) => {
      sent.push(JSON.stringify(command))
      writes += 1
      if (writes === 1) throw new ApiProblemError({ title: 'offline', status: 0 })
      return fileView(sourceId, command.ingestionRevision, { title: command.result.title, version: 1 })
    },
  })

  await service(repository, api).reconcile(options())
  const pending = (await repository.listOverviewOutbox())[0]
  assert.equal(pending.state, 'PENDING')
  assert.ok(pending.requestBody)
  await service(repository, api).reconcile(options())

  assert.equal(api.calls.getFiles.length, 1, 'the immutable request retries before another baseline read')
  assert.equal(sent.length, 2)
  assert.equal(sent[0], sent[1])
  assert.equal((await repository.listOverviewOutbox()).length, 0)
})

test('a frozen pre-identity File request reaches the server unchanged for receipt replay or contract rejection', async () => {
  for (const decision of ['receipt-replay', 'contract-reject']) {
    const storage = createMemoryStorage()
    const repository = new OverviewRepository(`old-receipt-${decision}`, 'device', { storage })
    const cacheKey = `auralis:v1:overviews:old-receipt-${decision}:device`
    const clientWriteId = `legacy-frozen-${decision}`
    const result = { schemaVersion: 1, title: 'Frozen legacy candidate', outline, summary }
    const frozenRequestBody = {
      baseVersion: 0, clientWriteId, mode: 'ALL', ingestionRevision: 'rev-1',
      outlineGeneratedAt: '2026-09-30T10:00:00.000Z', summaryGeneratedAt: '2026-09-30T10:01:00.000Z', result,
    }
    const frozenIntent = {
      clientWriteId, scopeType: 'FILE', scopeId: 'file-a', revisionKey: 'rev-1', mode: 'ALL', origin: 'LOCAL_WRITE',
      result, inputFingerprint: null, outlineGeneratedAt: frozenRequestBody.outlineGeneratedAt,
      summaryGeneratedAt: frozenRequestBody.summaryGeneratedAt, state: 'PENDING', requestBody: frozenRequestBody,
      errorCode: null, createdAt: '2026-09-30T10:02:00.000Z', updatedAt: '2026-09-30T10:02:00.000Z',
    }
    const frozenCacheRecord = { ...record('FILE', 'file-a', 'rev-1', 'Frozen legacy candidate'), identityReady: false,
      outlineIdentity: null, outlineIdentityInput: null, outlineProvenance: null, outlineProvenanceInput: null }
    storage.setItem(cacheKey, JSON.stringify({ records: [frozenCacheRecord], states: [], outbox: [frozenIntent] }))
    const frozenBody = JSON.stringify(frozenRequestBody)
    const sent = []
    const api = fakeApi({ putFile: async (sourceId, command) => {
      sent.push(JSON.stringify(command))
      if (decision === 'contract-reject') {
        throw new ApiProblemError({ title: 'Missing outline identity', status: 400, code: 'IDENTITY_REQUIRED' })
      }
      return fileView(sourceId, command.ingestionRevision, { title: command.result.title, version: 1 })
    } })

    await service(repository, api).reconcile(options())

    assert.deepEqual(sent, [frozenBody], 'the immutable old-shape body must cross HTTP byte-for-byte')
    assert.equal(api.calls.getFiles.length, 0, 'the receipt check must be performed by replaying the original PUT')
    const remaining = (await repository.listOverviewOutbox()).find(item => item.clientWriteId === clientWriteId)
    if (decision === 'receipt-replay') {
      assert.equal(remaining, undefined)
      const adopted = await repository.getFileOverview('file-a', 'rev-1')
      assert.equal(adopted?.identityReady, false)
      assert.equal(adopted?.outlineIdentity, null)
      assert.equal((await repository.getOverviewSyncState('FILE', 'file-a', 'rev-1'))?.version, 1)
    } else {
      assert.equal(remaining?.state, 'ERROR')
      assert.equal(remaining?.errorCode, 'OVERVIEW_SYNC_FAILED')
      assert.equal(JSON.stringify(remaining?.requestBody), frozenBody)
    }
  }
})

test('a File PUT with failed local ACK retries the same request and does not create a second remote version', async () => {
  const repository = new OverviewRepository('file-ack-user', 'file-ack-device', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'File candidate', outline, summary } })
  const originalComplete = repository.completeOverviewIntent.bind(repository)
  let failCompletion = true
  repository.completeOverviewIntent = async (...args) => {
    if (failCompletion) { failCompletion = false; throw new Error('local ACK transaction unavailable') }
    return originalComplete(...args)
  }
  const requests = []
  const receipts = new Map()
  let remoteVersion = 0
  const api = fakeApi({ putFile: async (sourceId, command) => {
    requests.push(JSON.stringify(command))
    if (receipts.has(command.clientWriteId)) return receipts.get(command.clientWriteId)
    remoteVersion += 1
    const response = fileView(sourceId, command.ingestionRevision, { title: command.result.title, version: remoteVersion })
    receipts.set(command.clientWriteId, response)
    return response
  } })

  await service(repository, api).reconcile(options())
  const pending = (await repository.listOverviewOutbox())[0]
  assert.equal(pending.state, 'PENDING')
  assert.equal(pending.errorCode, 'OVERVIEW_LOCAL_ACK_RETRY')
  assert.ok(pending.requestBody)
  await service(repository, api).reconcile(options())

  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  assert.equal(remoteVersion, 1)
  assert.equal((await repository.listOverviewOutbox()).length, 0)
  assert.equal((await repository.getOverviewSyncState('FILE', 'file-a', 'rev-1'))?.version, 1)
})

test('a Subject PUT with failed local ACK retries the same request and does not create a second remote version', async () => {
  const repository = new OverviewRepository('subject-ack-user', 'subject-ack-device', { storage: createMemoryStorage() })
  const inputSource = source()
  const api = fakeApi({ getFile: async (sourceId, revision) => fileView(sourceId, revision, { outlineVersion: 4, summaryVersion: 6 }) })
  const syncService = service(repository, api)
  await syncService.reconcile(options([inputSource]))
  const file = await repository.getFileOverview(inputSource.id, inputSource.ingestionRevision)
  const fingerprint = await computeSubjectInputFingerprint([file])
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: fingerprint,
    response: { schemaVersion: 1, title: 'Subject candidate', outline, summary } })
  const originalComplete = repository.completeOverviewIntent.bind(repository)
  let failCompletion = true
  repository.completeOverviewIntent = async (...args) => {
    if (failCompletion) { failCompletion = false; throw new Error('local ACK transaction unavailable') }
    return originalComplete(...args)
  }
  const requests = []
  const receipts = new Map()
  let remoteVersion = 0
  api.putSubject = async (subjectId, command) => {
    requests.push(JSON.stringify(command))
    if (receipts.has(command.clientWriteId)) return receipts.get(command.clientWriteId)
    remoteVersion += 1
    const response = subjectView(subjectId, command, remoteVersion)
    receipts.set(command.clientWriteId, response)
    return response
  }
  const withSubject = options([inputSource], ['subject-a'])

  await syncService.reconcile(withSubject)
  const pending = (await repository.listOverviewOutbox()).find(item => item.scopeType === 'SUBJECT')
  assert.equal(pending.state, 'PENDING')
  assert.equal(pending.errorCode, 'OVERVIEW_LOCAL_ACK_RETRY')
  assert.ok(pending.requestBody)
  await syncService.reconcile(withSubject)

  assert.equal(requests.length, 2)
  assert.equal(requests[0], requests[1])
  assert.equal(remoteVersion, 1)
  assert.equal((await repository.listOverviewOutbox()).some(item => item.scopeType === 'SUBJECT' && item.state !== 'STALE'), false)
  assert.equal((await repository.getOverviewSyncState('SUBJECT', 'subject-a', 'subject-v1'))?.version, 1)
})

test('a late File GET cannot reinstall a deleted scope and another File still syncs', async () => {
  const repository = new OverviewRepository('file-delete-fence-user', 'file-delete-fence-device', { storage: createMemoryStorage() })
  assert.equal(typeof repository.beginScopeDeletion, 'function')
  const getStarted = deferred(), releaseGet = deferred()
  const api = fakeApi({ getFile: async (sourceId, revision) => {
    if (sourceId === 'file-a') {
      getStarted.resolve()
      await releaseGet.promise
    }
    return fileView(sourceId, revision)
  } })
  const sync = service(repository, api)
  const pending = sync.reconcile(options([source('file-a'), source('file-b', 'rev-b')]))
  await getStarted.promise
  const deletion = repository.beginScopeDeletion('FILE', 'file-a')
  await repository.removeFileOverviews('file-a')
  repository.completeScopeDeletion(deletion)
  releaseGet.resolve()
  await pending

  assert.equal(await repository.getFileOverview('file-a', 'rev-1'), null)
  assert.ok(await repository.getFileOverview('file-b', 'rev-b'))
})

test('a Subject install queued after deletion cleanup cannot restore its cache', async () => {
  const repository = new OverviewRepository('subject-delete-fence-user', 'subject-delete-fence-device', { storage: createMemoryStorage() })
  assert.equal(typeof repository.beginScopeDeletion, 'function')
  const installQueued = deferred(), releaseInstall = deferred()
  const originalInstall = repository.installRemoteOverview.bind(repository)
  repository.installRemoteOverview = async (record, state, discardLegacySeed, token) => {
    if (record.scopeType === 'SUBJECT') {
      installQueued.resolve()
      await releaseInstall.promise
    }
    return originalInstall(record, state, discardLegacySeed, token)
  }
  const api = fakeApi({
    getFile: async (sourceId, revision) => fileView(sourceId, revision),
    getSubject: async subjectId => subjectView(subjectId, {
      result: { title: 'Remote Subject', outline, summary }, sourceManifest: null, inputFingerprint: null,
    }),
  })
  const pending = service(repository, api).reconcile(options([source()], ['subject-a']))
  await installQueued.promise
  const deletion = repository.beginScopeDeletion('SUBJECT', 'subject-a')
  await repository.removeSubjectOverview('subject-a')
  repository.completeScopeDeletion(deletion)
  releaseInstall.resolve()
  await pending

  assert.equal(await repository.getSubjectOverview('subject-a'), null)
})

test('a pre-delete response remains stale after explicit same-scope restoration', async () => {
  const repository = new OverviewRepository('scope-restore-user', 'scope-restore-device', { storage: createMemoryStorage() })
  assert.equal(typeof repository.captureScopeFenceToken, 'function')
  assert.equal(typeof repository.reactivateRestoredScope, 'function')
  const oldToken = repository.captureScopeFenceToken('FILE', 'file-a')
  const deletion = repository.beginScopeDeletion('FILE', 'file-a')
  repository.completeScopeDeletion(deletion)
  repository.reactivateRestoredScope('FILE', 'file-a')
  const remoteRecord = record('FILE', 'file-a', 'rev-1', 'Remote restored')
  const remoteState = { scopeType: 'FILE', scopeId: 'file-a', revisionKey: 'rev-1', version: 1,
    outlineVersion: 1, summaryVersion: 1, outlineSourceManifest: null, summarySourceManifest: null,
    outlineInputFingerprint: null, summaryInputFingerprint: null, updatedAt: '2026-09-30T10:02:00.000Z' }

  assert.equal(await repository.installRemoteOverview(remoteRecord, remoteState, false, oldToken), false)
  const freshToken = repository.captureScopeFenceToken('FILE', 'file-a')
  assert.equal(await repository.installRemoteOverview(remoteRecord, remoteState, false, freshToken), true)
  assert.equal((await repository.getFileOverview('file-a', 'rev-1'))?.title, 'Remote restored')
})

test('scope deletion tickets isolate owners and only the current ticket can release a failed deletion', () => {
  const repository = new OverviewRepository('scope-ticket-user', 'scope-ticket-device', { storage: createMemoryStorage() })
  const otherDevice = new OverviewRepository('scope-ticket-user', 'scope-ticket-other-device', { storage: createMemoryStorage() })
  const otherOwner = new OverviewRepository('scope-ticket-other-user', 'scope-ticket-device', { storage: createMemoryStorage() })
  const oldToken = repository.captureScopeFenceToken('SUBJECT', 'subject-a')
  const oldTicket = repository.beginScopeDeletion('SUBJECT', 'subject-a')
  const currentTicket = repository.beginScopeDeletion('SUBJECT', 'subject-a')

  assert.equal(repository.cancelScopeDeletion(oldTicket), false)
  assert.equal(repository.isScopeFenceTokenCurrent(repository.captureScopeFenceToken('SUBJECT', 'subject-a')), false)
  assert.equal(repository.reactivateRestoredScope('SUBJECT', 'subject-a'), false)
  assert.equal(otherDevice.isScopeFenceTokenCurrent(otherDevice.captureScopeFenceToken('SUBJECT', 'subject-a')), true)
  assert.equal(otherOwner.isScopeFenceTokenCurrent(otherOwner.captureScopeFenceToken('SUBJECT', 'subject-a')), true)

  assert.equal(repository.cancelScopeDeletion(currentTicket), true)
  assert.equal(repository.isScopeFenceTokenCurrent(repository.captureScopeFenceToken('SUBJECT', 'subject-a')), true)
  assert.equal(repository.isScopeFenceTokenCurrent(oldToken), false)
})

test('an unknown local baseline with an existing remote result preserves the local candidate as a conflict', async () => {
  const repository = new OverviewRepository('conflict-user', 'conflict-device', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'Local candidate', outline, summary } })
  const api = fakeApi({ getFile: async () => fileView('file-a', 'rev-1', { title: 'Remote canonical' }) })

  await service(repository, api).reconcile(options())

  assert.equal(api.calls.putFiles.length, 0)
  const stored = await repository.getFileOverview('file-a', 'rev-1')
  assert.equal(stored?.title, 'Local candidate')
  assert.equal(stored?.syncStatus, 'CONFLICT')
  assert.equal((await repository.getOverviewSyncState('FILE', 'file-a', 'rev-1'))?.version, 1)
})

test('a new File candidate stays conflicted until the user explicitly chooses local upload', async () => {
  const repository = new OverviewRepository('file-conflict-candidate-user', 'file-conflict-candidate-device', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL',
    response: { schemaVersion: 1, title: 'Original candidate', outline, summary } })
  const sent = []
  let fileGetCount = 0
  const api = fakeApi({
    putFile: async (sourceId, command) => {
      sent.push(command)
      if (command.result.title === 'Original candidate') {
        throw new ApiProblemError({ title: 'Version conflict', status: 409, code: 'RESOURCE_VERSION_CONFLICT' })
      }
      return fileView(sourceId, command.ingestionRevision, { version: 8, title: command.result.title })
    },
    getFile: async (sourceId, revision) => {
      fileGetCount += 1
      return fileGetCount === 1 ? null : fileView(sourceId, revision, { version: 7, title: 'Remote canonical' })
    },
  })
  const sync = service(repository, api)

  await sync.reconcile(options())
  const original = (await repository.listOverviewOutbox())[0]
  const originalBody = JSON.stringify(original.requestBody)
  assert.equal(original.state, 'CONFLICT')

  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL',
    response: { schemaVersion: 1, title: 'New local candidate', outline, summary } })
  const afterSave = await repository.listOverviewOutbox()
  const candidate = afterSave.find(item => item.clientWriteId !== original.clientWriteId)
  assert.equal(afterSave.find(item => item.clientWriteId === original.clientWriteId)?.state, 'STALE')
  assert.equal(JSON.stringify(afterSave.find(item => item.clientWriteId === original.clientWriteId)?.requestBody), originalBody)
  assert.equal(candidate?.state, 'CONFLICT')
  assert.equal((await repository.getFileOverview('file-a', 'rev-1'))?.title, 'New local candidate')
  assert.equal((await repository.getFileOverview('file-a', 'rev-1'))?.syncStatus, 'CONFLICT')

  await sync.reconcile(options())
  assert.equal(sent.length, 1)

  await sync.resolveConflict('FILE', 'file-a', 'rev-1', 'LOCAL', options())
  assert.equal(sent.length, 2)
  assert.notEqual(sent[1].clientWriteId, original.clientWriteId)
  assert.equal(sent[1].result.title, 'New local candidate')
  assert.equal(sent[1].baseVersion, 7)
})

test('a new Subject candidate stays conflicted until the user explicitly chooses local upload', async () => {
  const repository = new OverviewRepository('subject-conflict-candidate-user', 'subject-conflict-candidate-device', { storage: createMemoryStorage() })
  const inputSource = source()
  const api = fakeApi({
    getFile: async (sourceId, revision) => fileView(sourceId, revision, { version: 3, outlineVersion: 4, summaryVersion: 5 }),
  })
  const sync = service(repository, api)
  const withSubject = options([inputSource], ['subject-a'])
  await sync.reconcile(options([inputSource]))
  const fingerprint = await computeSubjectInputFingerprint([await repository.getFileOverview(inputSource.id, inputSource.ingestionRevision)])
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: fingerprint,
    response: { schemaVersion: 1, title: 'Original subject candidate', outline, summary } })
  const sent = []
  let subjectGetCount = 0
  api.putSubject = async (subjectId, command) => {
    sent.push(command)
    if (command.result.title === 'Original subject candidate') {
      throw new ApiProblemError({ title: 'Version conflict', status: 409, code: 'RESOURCE_VERSION_CONFLICT' })
    }
    return subjectView(subjectId, command, 10)
  }
  api.getSubject = async subjectId => {
    subjectGetCount += 1
    return subjectGetCount === 1 ? null : subjectView(subjectId, {
      result: { title: 'Remote canonical subject', outline, summary },
      sourceManifest: null,
      inputFingerprint: null,
    }, 9)
  }

  await sync.reconcile(withSubject)
  const original = (await repository.listOverviewOutbox()).find(item => item.scopeType === 'SUBJECT')
  const originalBody = JSON.stringify(original.requestBody)
  assert.equal(original.state, 'CONFLICT')

  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: fingerprint,
    response: { schemaVersion: 1, title: 'New local subject candidate', outline, summary } })
  const afterSave = (await repository.listOverviewOutbox()).filter(item => item.scopeType === 'SUBJECT')
  const candidate = afterSave.find(item => item.clientWriteId !== original.clientWriteId)
  assert.equal(afterSave.find(item => item.clientWriteId === original.clientWriteId)?.state, 'STALE')
  assert.equal(JSON.stringify(afterSave.find(item => item.clientWriteId === original.clientWriteId)?.requestBody), originalBody)
  assert.equal(candidate?.state, 'CONFLICT')
  assert.equal((await repository.getSubjectOverview('subject-a'))?.title, 'New local subject candidate')
  assert.equal((await repository.getSubjectOverview('subject-a'))?.syncStatus, 'CONFLICT')

  await sync.reconcile(withSubject)
  assert.equal(sent.length, 1)

  await sync.resolveConflict('SUBJECT', 'subject-a', 'subject-v1', 'LOCAL', withSubject)
  assert.equal(sent.length, 2)
  assert.notEqual(sent[1].clientWriteId, original.clientWriteId)
  assert.equal(sent[1].result.title, 'New local subject candidate')
  assert.equal(sent[1].baseVersion, 9)
})

test('subject conflict refresh reentry is fenced through the failure tail and a later explicit retry can recover', async () => {
  const repository = new OverviewRepository('conflict-reentry-user', 'conflict-reentry-device', { storage: createMemoryStorage() })
  const inputSource = source()
  const api = fakeApi({
    getFile: async (sourceId, revision) => fileView(sourceId, revision, { version: 3, outlineVersion: 4, summaryVersion: 5 }),
  })
  const sync = service(repository, api)
  const withSubject = options([inputSource], ['subject-a'])
  await sync.reconcile(options([inputSource]))
  const fingerprint = await computeSubjectInputFingerprint([await repository.getFileOverview(inputSource.id, inputSource.ingestionRevision)])
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: fingerprint,
    response: { schemaVersion: 1, title: 'Local subject candidate', outline, summary } })
  let subjectWrites = 0
  api.putSubject = async () => {
    subjectWrites += 1
    throw new ApiProblemError({ title: 'Version conflict', status: 409, code: 'RESOURCE_VERSION_CONFLICT' })
  }
  api.getSubject = async () => null
  await sync.reconcile(withSubject)
  assert.equal((await repository.getSubjectOverview('subject-a'))?.syncStatus, 'CONFLICT')

  const key = JSON.stringify(['conflict-reentry-user', 'conflict-reentry-device', 'SUBJECT', 'subject-a', 'subject-v1'])
  let explicitRuns = 0
  let cacheRefreshes = 0
  let remoteGets = 0
  const refreshOverviewCache = () => {
    cacheRefreshes += 1
    // SubjectWorkspace starts the same resolver when cache refresh sees CONFLICT.
    void resolve()
  }
  const resolve = () => runOverviewConflictResolutionOnce(key, async () => {
    explicitRuns += 1
    // ensureOverviewRuntime refreshes the cache before conflict resolution starts.
    refreshOverviewCache()
    try {
      await sync.resolveConflict('SUBJECT', 'subject-a', 'subject-v1', 'LOCAL', withSubject)
    } catch { /* the page keeps the local conflict visible and allows a later trigger */ }
    // The resolver's own tail refresh is still inside the guarded pass.
    refreshOverviewCache()
  })

  api.getSubject = async () => {
    remoteGets += 1
    throw new ApiProblemError({ title: 'offline', status: 0 })
  }
  await resolve()
  assert.equal(explicitRuns, 1)
  assert.equal(cacheRefreshes, 2)
  assert.equal(remoteGets, 1)
  assert.equal((await repository.getSubjectOverview('subject-a'))?.syncStatus, 'CONFLICT')
  assert.equal((await repository.getSubjectOverview('subject-a'))?.title, 'Local subject candidate')

  // A later explicit retry sees the normal 404-as-no-remote-result behavior and can upload the local result.
  api.getSubject = async () => { remoteGets += 1; return null }
  api.putSubject = async (subjectId, command) => {
    subjectWrites += 1
    return subjectView(subjectId, command, 10)
  }
  await resolve()
  assert.equal(explicitRuns, 2)
  assert.equal(remoteGets, 3, 'the explicit conflict check and one normal reconcile read are allowed')
  assert.equal(subjectWrites, 2, 'the failed original write and one explicit local retry are the only writes')
  assert.equal((await repository.getSubjectOverview('subject-a'))?.syncStatus, 'SYNCED')
})

test('conflict resolution coalesces only the same owner/device/scope/revision key', async () => {
  let firstCalls = 0
  let secondCalls = 0
  const release = deferred()
  const firstKey = JSON.stringify(['owner-a', 'device-a', 'SUBJECT', 'subject-a', 'subject-v1'])
  const sameKeyCall = runOverviewConflictResolutionOnce(firstKey, async () => {
    firstCalls += 1
    await release.promise
  })
  const coalescedCall = runOverviewConflictResolutionOnce(firstKey, async () => { firstCalls += 100 })
  const otherScopeCall = runOverviewConflictResolutionOnce(
    JSON.stringify(['owner-a', 'device-a', 'SUBJECT', 'subject-b', 'subject-v1']),
    async () => { secondCalls += 1 },
  )
  await otherScopeCall
  release.resolve()
  await Promise.all([sameKeyCall, coalescedCall])
  assert.equal(firstCalls, 1)
  assert.equal(secondCalls, 1)
})

test('a rejected conflict pass releases only its own key for a later attempt', async () => {
  const key = JSON.stringify(['owner-retry', 'device-retry', 'SUBJECT', 'subject-a', 'subject-v1'])
  let attempts = 0
  await assert.rejects(runOverviewConflictResolutionOnce(key, async () => {
    attempts += 1
    throw new Error('offline')
  }), /offline/)
  await runOverviewConflictResolutionOnce(key, async () => { attempts += 1 })
  assert.equal(attempts, 2)
})

test('a new File result supersedes a terminal HTTP error and uploads without replaying the old request', async () => {
  const repository = new OverviewRepository('file-error-user', 'file-error-device', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'Old candidate', outline, summary } })
  const sent = []
  const api = fakeApi({ putFile: async (sourceId, command) => {
    sent.push(command)
    if (command.result.title === 'Old candidate') throw new ApiProblemError({ title: 'Rejected', status: 400, code: 'VALIDATION_FAILED' })
    return fileView(sourceId, command.ingestionRevision, { title: command.result.title })
  } })

  await service(repository, api).reconcile(options())
  const oldRequest = (await repository.listOverviewOutbox())[0]
  const oldBody = JSON.stringify(oldRequest.requestBody)
  assert.equal(oldRequest.state, 'ERROR')
  assert.equal((await repository.getFileOverview('file-a', 'rev-1'))?.syncStatus, 'ERROR')
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL',
    response: { schemaVersion: 1, title: 'New candidate', outline, summary } })
  const afterSave = await repository.listOverviewOutbox()
  assert.equal(afterSave.find(item => item.clientWriteId === oldRequest.clientWriteId)?.state, 'STALE')
  assert.equal(JSON.stringify(afterSave.find(item => item.clientWriteId === oldRequest.clientWriteId)?.requestBody), oldBody)

  await service(repository, api).reconcile(options())

  assert.deepEqual(sent.map(command => command.result.title), ['Old candidate', 'New candidate'])
  assert.notEqual(sent[0].clientWriteId, sent[1].clientWriteId)
  assert.equal((await repository.getOverviewSyncState('FILE', 'file-a', 'rev-1'))?.version, 1)
  assert.equal((await repository.listOverviewOutbox()).find(item => item.clientWriteId === oldRequest.clientWriteId)?.state, 'STALE')
})

test('a new Subject result supersedes a terminal HTTP error and uploads without replaying the old request', async () => {
  const repository = new OverviewRepository('subject-error-user', 'subject-error-device', { storage: createMemoryStorage() })
  const inputSource = source()
  const api = fakeApi({ getFile: async (sourceId, revision) => fileView(sourceId, revision, { outlineVersion: 4, summaryVersion: 6 }) })
  const syncService = service(repository, api)
  await syncService.reconcile(options([inputSource]))
  const file = await repository.getFileOverview(inputSource.id, inputSource.ingestionRevision)
  const fingerprint = await computeSubjectInputFingerprint([file])
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: fingerprint,
    response: { schemaVersion: 1, title: 'Old candidate', outline, summary } })
  const sent = []
  api.putSubject = async (subjectId, command) => {
    sent.push(command)
    if (command.result.title === 'Old candidate') throw new ApiProblemError({ title: 'Rejected', status: 400, code: 'VALIDATION_FAILED' })
    return subjectView(subjectId, command)
  }
  const withSubject = options([inputSource], ['subject-a'])

  await syncService.reconcile(withSubject)
  const oldRequest = (await repository.listOverviewOutbox()).find(item => item.scopeType === 'SUBJECT')
  const oldBody = JSON.stringify(oldRequest.requestBody)
  assert.equal(oldRequest.state, 'ERROR')
  assert.equal((await repository.getSubjectOverview('subject-a'))?.syncStatus, 'ERROR')
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: fingerprint,
    response: { schemaVersion: 1, title: 'New candidate', outline, summary } })
  const afterSave = await repository.listOverviewOutbox()
  assert.equal(afterSave.find(item => item.clientWriteId === oldRequest.clientWriteId)?.state, 'STALE')
  assert.equal(JSON.stringify(afterSave.find(item => item.clientWriteId === oldRequest.clientWriteId)?.requestBody), oldBody)

  await syncService.reconcile(withSubject)

  assert.deepEqual(sent.map(command => command.result.title), ['Old candidate', 'New candidate'])
  assert.notEqual(sent[0].clientWriteId, sent[1].clientWriteId)
  assert.equal((await repository.getOverviewSyncState('SUBJECT', 'subject-a', 'subject-v1'))?.version, 1)
  assert.equal((await repository.listOverviewOutbox()).find(item => item.clientWriteId === oldRequest.clientWriteId)?.state, 'STALE')
})

test('subject upload waits for ACKed file part versions and hashes the canonical sorted manifest', async () => {
  const repository = new OverviewRepository('manifest-user', 'manifest-device', { storage: createMemoryStorage() })
  const sources = [source('file-b', 'rev-b'), source('file-a', 'rev-a')]
  const api = fakeApi({
    getFile: async (sourceId, revision) => fileView(sourceId, revision, sourceId === 'file-a'
      ? { version: 4, outlineVersion: 2, summaryVersion: 3 } : { version: 7, outlineVersion: 5, summaryVersion: 6 }),
  })
  await service(repository, api).reconcile(options(sources))
  const fileRecords = await Promise.all(sources.map(item => repository.getFileOverview(item.id, item.ingestionRevision)))
  const localFingerprint = await computeSubjectInputFingerprint(fileRecords)
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint: localFingerprint,
    response: { schemaVersion: 1, title: 'Subject local', outline, summary } })

  await service(repository, api).reconcile(options(sources, ['subject-a']))

  assert.equal(api.calls.putSubjects.length, 1)
  const command = api.calls.putSubjects[0][1]
  assert.deepEqual(command.sourceManifest, [
    { sourceId: 'file-a', ingestionRevision: 'rev-a', outlineVersion: 2, summaryVersion: 3 },
    { sourceId: 'file-b', ingestionRevision: 'rev-b', outlineVersion: 5, summaryVersion: 6 },
  ])
  const canonical = 'AURALIS-SUBJECT-OVERVIEW-MANIFEST-V1\nfile-a\trev-a\t2\t3\nfile-b\trev-b\t5\t6\n'
  const expected = createHash('sha256').update(canonical, 'utf8').digest('hex')
  assert.equal(command.inputFingerprint, expected)
  assert.equal((await repository.listOverviewOutbox()).length, 0)
})

test('Subject PUT omits empty section provenance, filters unlinked refs, and uses source-level provenance for new links', async () => {
  const repository = new OverviewRepository('subject-provenance-user', 'subject-provenance-device', { storage: createMemoryStorage() })
  const sources = [source('file-a', 'rev-a'), source('file-b', 'rev-b')]
  const api = fakeApi({ getFile: async (sourceId, revision) => fileView(sourceId, revision) })
  const syncService = service(repository, api)
  await syncService.reconcile(options(sources))
  const files = await Promise.all(sources.map(item => repository.getFileOverview(item.id, item.ingestionRevision)))
  const inputFingerprint = await computeSubjectInputFingerprint(files)
  const canonicalRef = (sourceId, ingestionRevision, chunkId) => ({
    sourceId, ingestionRevision, chunkId, generation: 'gen-1', charStart: 2, charEnd: 8,
    contentHash: 'hash', precision: 'CHUNK', parsedDocumentId: 'parsed', parserId: 'parser',
    locations: [{ blockOrdinal: 0, charStart: 2, charEnd: 8, blockCharStart: 0, blockCharEnd: 12 }],
  })
  const refA = canonicalRef('file-a', 'rev-a', 'chunk-a')
  const refB = canonicalRef('file-b', 'rev-b', 'chunk-b')
  const sections = [
    { title: 'New section', summary: null, sourceIds: ['file-a'], locator: null },
    { title: 'Unlinked section', summary: null, sourceIds: [], locator: null },
    { title: 'Partially unlinked', summary: null, sourceIds: ['file-b'], locator: null },
    { title: 'New source association', summary: null, sourceIds: ['file-a', 'file-b'], locator: null },
  ]
  const outline = [{ title: 'Chapter', sections }]
  const outlineProvenance = createOutlineProvenanceView(outline, new Map([
    ['0.0', []],
    ['0.1', []],
    ['0.2', filterOutlineSourceRefs([refA, refB], ['file-b'])],
    ['0.3', [refA]],
  ]))
  const outlineProvenanceInput = createOutlineProvenanceInputForLinkedSources(outlineProvenance,
    new Map(sections.map((section, index) => [`0.${index}`, section.sourceIds])),
    new Map([['file-a', 'rev-a'], ['file-b', 'rev-b']]))
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint,
    response: { schemaVersion: 1, title: 'Subject', outline, summary, outlineProvenance }, outlineProvenanceInput })

  await syncService.reconcile(options(sources, ['subject-a']))

  const command = api.calls.putSubjects[0][1]
  assert.deepEqual(command.outlineProvenance.sections.map(section => section.path), [[0, 2], [0, 3]])
  assert.deepEqual(command.outlineProvenance.sections[0].sourceRefs.map(ref => ref.sourceId), ['file-b'])
  assert.deepEqual(command.outlineProvenance.sections[1].sourceRefs, [
    { sourceId: 'file-a', ingestionRevision: 'rev-a', chunkId: 'chunk-a', generation: 'gen-1', charStart: 2, charEnd: 8 },
    { sourceId: 'file-b', ingestionRevision: 'rev-b', chunkId: null, generation: null, charStart: null, charEnd: null },
  ])
})

test('source revision changes stale old intents without replaying their content', async () => {
  const repository = new OverviewRepository('revision-user', 'revision-device', { storage: createMemoryStorage() })
  await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'old-rev', mode: 'ALL', response: { schemaVersion: 1, title: 'Old revision', outline, summary } })
  const api = fakeApi()

  await service(repository, api).reconcile(options([source('file-a', 'new-rev')]))

  assert.equal(api.calls.putFiles.length, 0)
  const oldIntent = (await repository.listOverviewOutbox()).find(item => item.revisionKey === 'old-rev')
  assert.equal(oldIntent?.state, 'STALE')
})

test('Source revision or deletion during an awaited write fences the late response', async () => {
  for (const mutation of ['revision', 'delete']) {
    const repository = new OverviewRepository(`late-${mutation}-user`, `late-${mutation}-device`, { storage: createMemoryStorage() })
    await repository.saveFileOverviewPart({ sourceId: 'file-a', ingestionRevision: 'rev-1', mode: 'ALL', response: { schemaVersion: 1, title: 'Local', outline, summary } })
    const currentSource = source()
    const dynamicOptions = {
      ...options(),
      isSourceCurrent: (expected) => currentSource.ingestionStatus === 'READY' && !currentSource.deletedAt
        && currentSource.id === expected.id && currentSource.ingestionRevision === expected.ingestionRevision,
      isSubjectCurrent: () => true,
      getCurrentSources: async () => [currentSource],
    }
    const api = fakeApi({ putFile: async (sourceId, command) => {
      if (mutation === 'revision') currentSource.ingestionRevision = 'rev-2'
      else { currentSource.deletedAt = '2026-10-01T00:00:00.000Z'; currentSource.ingestionStatus = 'DELETED' }
      return fileView(sourceId, command.ingestionRevision, { title: 'Late server response' })
    } })

    await service(repository, api).reconcile(dynamicOptions)

    assert.equal(api.calls.putFiles.length, 1)
    assert.equal((await repository.listOverviewOutbox())[0]?.state, 'STALE')
    assert.equal(await repository.getOverviewSyncState('FILE', 'file-a', 'rev-1'), null)
    assert.equal((await repository.getFileOverview('file-a', 'rev-1'))?.title, 'Local')
  }
})

test('a Subject membership change during an awaited write fences the late response', async () => {
  const repository = new OverviewRepository('late-membership-user', 'late-membership-device', { storage: createMemoryStorage() })
  const originalSource = source()
  let currentSources = [originalSource]
  const dynamicOptions = {
    sources: [originalSource], subjectIds: ['subject-a'], isCurrent: () => true,
    isSourceCurrent: (expected) => currentSources.some(item => item.id === expected.id
      && item.ingestionStatus === 'READY' && item.ingestionRevision === expected.ingestionRevision),
    isSubjectCurrent: id => id === 'subject-a',
    getCurrentSources: async () => currentSources,
  }
  const api = fakeApi({
    getFile: async (sourceId, revision) => fileView(sourceId, revision),
    putSubject: async (subjectId, command) => {
      currentSources = [] // The file moved out of this subject while the request was in flight.
      return subjectView(subjectId, command)
    },
  })
  await service(repository, api).reconcile({ ...dynamicOptions, subjectIds: [] })
  const file = await repository.getFileOverview('file-a', 'rev-1')
  const inputFingerprint = await computeSubjectInputFingerprint([file])
  await repository.saveSubjectOverviewPart({ subjectId: 'subject-a', mode: 'ALL', inputFingerprint,
    response: { schemaVersion: 1, title: 'Local subject', outline, summary } })

  await service(repository, api).reconcile(dynamicOptions)

  assert.equal(api.calls.putSubjects.length, 1)
  assert.equal((await repository.listOverviewOutbox()).find(item => item.scopeType === 'SUBJECT')?.state, 'STALE')
  assert.equal(await repository.getOverviewSyncState('SUBJECT', 'subject-a', 'subject-v1'), null)
  assert.equal((await repository.getSubjectOverview('subject-a'))?.title, 'Local subject')
})

test('manifest fingerprint helper sorts UUIDs and lowercases identifiers like the server', async () => {
  const actual = await computeOverviewManifestFingerprint([
    { sourceId: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', ingestionRevision: 'REV-B', outlineVersion: null, summaryVersion: 9 },
    { sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ingestionRevision: 'REV-A', outlineVersion: 2, summaryVersion: null },
  ])
  const canonical = 'AURALIS-SUBJECT-OVERVIEW-MANIFEST-V1\naaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\trev-a\t2\t-\nbbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\trev-b\t-\t9\n'
  assert.equal(actual, createHash('sha256').update(canonical, 'utf8').digest('hex'))
})
