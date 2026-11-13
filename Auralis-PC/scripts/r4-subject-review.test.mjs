import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import { afterEach, test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
    && context.parentURL && !/\.(?:ts|js|mjs)$/.test(specifier)) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const storageValues = new Map()
const testStorage = {
  getItem: (key) => storageValues.get(String(key)) ?? null,
  setItem: (key, value) => storageValues.set(String(key), String(value)),
  removeItem: (key) => storageValues.delete(String(key)),
  key: (index) => [...storageValues.keys()][index] ?? null,
  get length() { return storageValues.size },
}
const windowListeners = new Map()
globalThis.localStorage = testStorage
globalThis.window = {
  localStorage: testStorage,
  addEventListener(type, listener) {
    const listeners = windowListeners.get(type) ?? new Set()
    listeners.add(listener)
    windowListeners.set(type, listeners)
  },
  removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener) },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) ?? []) listener.call(this, event)
    return true
  },
}

const { createPinia, setActivePinia } = await import('pinia')
const { createRenderer, nextTick } = await import('vue')
const { compileScript, parse } = await import('@vue/compiler-sfc')
const ts = (await import('typescript')).default
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { useReviewStore } = await import('../src/store/useReviewStore.ts')
const { useSubjectStore } = await import('../src/store/useSubjectStore.ts')
const { useSyncStore } = await import('../src/store/useSyncStore.ts')
const { useStatsStore } = await import('../src/store/useStatsStore.ts')
const { useReviewApi } = await import('../src/api/useReviewApi.ts')
const { getLocalRepository } = await import('../src/services/localDb.ts')
const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
const { LocalReviewService } = await import('../src/services/localReviewService.ts')
const { ApiProblemError } = await import('../src/api/httpError.ts')
const request = (await import('../src/api/request.ts')).default
const { routerKey, routeLocationKey } = await import('vue-router')

const originalApi = { ...useReviewApi }
const originalGet = request.get
const originalPost = request.post
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const nativeLocks = globalThis.navigator?.locks
const originalLocalReviewReads = {
  getSubjectStates: LocalReviewService.prototype.getSubjectStates,
  getLifecycleHistory: LocalReviewService.prototype.getLifecycleHistory,
  executeCommand: LocalReviewService.prototype.executeCommand,
}
const mountedApps = []

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
  Object.assign(useReviewApi, originalApi)
  Object.assign(LocalReviewService.prototype, originalLocalReviewReads)
  request.get = originalGet
  request.post = originalPost
  if (originalNavigatorDescriptor) Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
})

function fixture(userId = 'review-user-a') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: userId, email: `${userId}@example.test` },
    tokens: { accessToken: `${userId}-access`, refreshToken: `${userId}-refresh` },
    sessionId: `${userId}-session`,
    serverDeviceId: `${userId}-device`,
  })
  return { authStore, reviewStore: useReviewStore(), pinia }
}

function hostNode(type, text = '') {
  return { type, text, props: {}, children: [], parent: null }
}

function createTestRenderer() {
  return createRenderer({
    createElement: (type) => hostNode(type),
    createText: (text) => hostNode('#text', text),
    createComment: (text) => hostNode('#comment', text),
    setText: (node, text) => { node.text = text },
    setElementText: (node, text) => { node.text = text; node.children = [] },
    patchProp: (node, key, _previous, value) => { node.props[key] = value },
    insert: (node, parent, anchor = null) => {
      if (node.parent) {
        const previousIndex = node.parent.children.indexOf(node)
        if (previousIndex >= 0) node.parent.children.splice(previousIndex, 1)
      }
      node.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, node)
    },
    remove: (node) => {
      if (!node.parent) return
      const index = node.parent.children.indexOf(node)
      if (index >= 0) node.parent.children.splice(index, 1)
      node.parent = null
    },
    parentNode: (node) => node.parent,
    nextSibling: (node) => {
      if (!node.parent) return null
      return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
    },
  })
}

async function mountReviewPane(pinia, subjectId) {
  const source = await readFile(new URL('../src/components/subject/SubjectReviewPane.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source, { filename: 'SubjectReviewPane.vue' })
  const compiled = compileScript(descriptor, { id: 'subject-review-pane-test', inlineTemplate: true })
  const javascript = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const generatedUrl = new URL(`../src/components/subject/.subject-review-test-${Date.now()}-${Math.random()}.mjs`, import.meta.url)
  await writeFile(generatedUrl, javascript)
  let component
  try {
    component = (await import(generatedUrl.href)).default
  } finally {
    await unlink(generatedUrl)
  }
  const app = createTestRenderer().createApp(component, { subjectId })
  app.use(pinia)
  app.provide(routerKey, { replace: async () => undefined })
  app.provide(routeLocationKey, { query: {} })
  const root = hostNode('root')
  app.mount(root)
  mountedApps.push(app)
  return { app, root }
}

function deferNextKnowledgeBlockRead(repository) {
  let signalStarted
  let releaseRead
  let rejectRead
  let blocked = false
  const started = new Promise((resolve) => { signalStarted = resolve })
  const gate = new Promise((resolve, reject) => {
    releaseRead = resolve
    rejectRead = reject
  })
  const originalList = repository.list
  repository.list = async function (resourceType, ...args) {
    if (!blocked && resourceType === 'KNOWLEDGE_BLOCK') {
      blocked = true
      signalStarted()
      await gate
    }
    return originalList.call(this, resourceType, ...args)
  }
  return {
    started,
    isStarted: () => blocked,
    release: () => releaseRead(),
    reject: (error) => rejectRead(error),
    restore: () => { repository.list = originalList },
  }
}

function findButton(node, text) {
  if (node.type === 'button' && (String(node.text).includes(text) || collectText(node).includes(text))) return node
  for (const child of node.children) {
    const found = findButton(child, text)
    if (found) return found
  }
  return null
}

function findElementByClass(node, className) {
  if (String(node.props.class ?? '').split(/\s+/).includes(className)) return node
  for (const child of node.children) {
    const found = findElementByClass(child, className)
    if (found) return found
  }
  return null
}

function collectButtons(node) {
  return [
    ...(node.type === 'button' ? [node] : []),
    ...node.children.flatMap(collectButtons),
  ]
}

function collectText(node) {
  return [node.text, ...node.children.map(collectText)].filter(Boolean).join(' ')
}

async function settleVue() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await settleVue()
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail(message)
}

async function seedKnowledgeBlock(userId, deviceId, subjectId, blockId, title) {
  const repository = await getLocalRepository(userId, deviceId)
  const value = { id: blockId, subjectId, title, content: `内容-${title}`, version: 0 }
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: blockId, value, version: 0, deletedAt: null,
    mutation: {
      clientMutationId: `seed-${blockId}`, resourceType: 'KNOWLEDGE_BLOCK', resourceId: blockId,
      mutationType: 'CREATE', baseVersion: 0, payload: value,
    },
  })
}

async function seedLocalReviewSubject(authStore, reviewStore, subjectId, blocks) {
  const { localDb, getLocalRepository, getLocalSqlDatabase } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  await localDb.init()
  const repository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  const contentHashes = {}
  await repository.upsert('SUBJECT', subjectId, {
    id: subjectId, name: 'Subject ' + subjectId, description: '', iconKey: 'book',
  }, { version: 1, syncStatus: 'synced' })
  const localReviewService = new LocalReviewService(getLocalSqlDatabase(), repository)
  for (const block of blocks) {
    const version = block.version ?? 1
    const value = {
      ...(block.value ?? {}), id: block.id, subjectId,
      title: block.title ?? block.id, content: block.content ?? '内容-' + block.id, version,
    }
    if (block.localCreate) {
      await repository.commitMutation({
        resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value, version: 0, deletedAt: null,
        mutation: {
          clientMutationId: 'seed-local-review-' + block.id, resourceType: 'KNOWLEDGE_BLOCK',
          resourceId: block.id, mutationType: 'CREATE', baseVersion: 0, payload: value,
        },
      })
    } else {
      await repository.upsert('KNOWLEDGE_BLOCK', block.id, value, { version, syncStatus: 'synced' })
    }
    if (Object.prototype.hasOwnProperty.call(block, 'state')) {
      const contentHash = createHash('sha256').update(value.content).digest('hex')
      contentHashes[block.id] = contentHash
      const state = block.state === null ? null : {
        ...block.state, knowledgeBlockId: block.id, knowledgeBlockVersion: version, contentHash,
      }
      const imported = await localReviewService.importLifecycleHistory(
        authStore.user.id, authStore.serverDeviceId, block.id,
        {
          knowledgeBlockId: block.id, knowledgeBlockVersion: version, protocolVersion: 2,
          state, commands: block.commands ?? [], effectiveReviews: block.effectiveReviews ?? [],
        },
      )
      assert.equal(imported, true, 'authoritative review baseline for ' + block.id + ' must import')
    }
  }
  reviewStore.reconcileSubjectBlocks(subjectId, blocks.map((block) => block.id))
  return { repository, localReviewService, contentHashes }
}

async function inspectLocalReview(authStore, repository, knowledgeBlockId) {
  const { getLocalSqlDatabase } = await import('../src/services/localDb.ts')
  const reviews = new ReviewRepository(getLocalSqlDatabase(), repository)
  return {
    record: await reviews.getReviewRecord(authStore.user.id, authStore.serverDeviceId, knowledgeBlockId),
    pending: await reviews.getPendingIntents(authStore.user.id, authStore.serverDeviceId, knowledgeBlockId),
  }
}

async function seedSubjectForDeletion(userId, deviceId, subjectId) {
  const repository = await getLocalRepository(userId, deviceId)
  const value = {
    id: subjectId,
    name: `Subject ${subjectId}`,
    description: '',
    iconKey: 'book',
    version: 0,
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
  }
  await repository.commitMutation({
    resourceType: 'SUBJECT',
    resourceId: subjectId,
    value,
    version: 0,
    deletedAt: null,
    mutation: {
      clientMutationId: `seed-subject-${subjectId}`,
      resourceType: 'SUBJECT',
      resourceId: subjectId,
      mutationType: 'CREATE',
      baseVersion: 0,
      payload: value,
    },
  })
  return repository
}

function subjectModel(subjectId) {
  return {
    id: subjectId,
    name: `Subject ${subjectId}`,
    description: '',
    icon: 'BookOpen',
    iconKey: 'book',
    version: 0,
    defaultSubject: false,
    sortKey: null,
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    blockCount: 1,
    fileCount: 0,
  }
}

function stateView(knowledgeBlockId, dueAt = '2026-10-07T00:00:00.000Z', version = 1, overrides = {}) {
  return {
    id: `state-${knowledgeBlockId}`,
    knowledgeBlockId,
    dueAt,
    version,
    reps: version,
    lapses: 0,
    knowledgeBlockVersion: 1,
    needsLearning: false,
    mastered: false,
    stableSuccessCount: 0,
    nextReviewStage: 'EARLY_RECALL',
    lastPracticeAt: null,
    lastReviewId: null,
    pendingReviewId: null,
    contentHash: null,
    ...overrides,
  }
}

function page(items, nextCursor = null, hasMore = false) {
  return { items, nextCursor, hasMore }
}

function lifecycleResponse(request, action, stateOverrides = {}, effectiveReview = null, occurredAt = '2026-10-08T12:00:01.000Z') {
  return {
    commandId: `server-${request.clientCommandId}`,
    clientCommandId: request.clientCommandId,
    action,
    occurredAt,
    knowledgeBlockVersion: request.knowledgeBlockVersion,
    state: stateView(request.knowledgeBlockId, '2026-10-15T12:00:01.000Z', request.baseVersion + 1, {
      knowledgeBlockVersion: request.knowledgeBlockVersion,
      ...stateOverrides,
    }),
    effectiveReview,
  }
}

function effectiveReview(reviewId, rating, resolution, selectedAt = '2026-10-08T12:00:00.000Z') {
  return {
    reviewId,
    selectedRating: resolution === 'CORRECTED_AGAIN' ? 'GOOD' : rating,
    effectiveRating: rating,
    selectedAt,
    resolvedAt: '2026-10-08T12:00:01.000Z',
    resolution,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

test('Review API keeps lifecycle routes and no longer exposes legacy due, event, or history routes', () => {
  assert.equal(typeof useReviewApi.getSubjectStates, 'function')
  for (const method of ['getDueReviews', 'getReviewQueue', 'recordEvent', 'recordReviewEvent', 'getHistory', 'getReviewHistory']) {
    assert.equal(method in useReviewApi, false, `${method} must be removed`)
  }
})

test('states API passes subject pagination and the session ticket to Axios', async () => {
  const ticket = { key: Symbol('scope'), isCurrent: () => true }
  let requestDetails
  request.get = (url, config) => {
    requestDetails = { url, config }
    return Promise.resolve(page([]))
  }

  await useReviewApi.getSubjectStates({ subjectId: 'subject-a', cursor: null, limit: 200 }, ticket)

  assert.equal(requestDetails.url, '/api/reviews/states')
  assert.deepEqual(requestDetails.config.params, { subjectId: 'subject-a', cursor: undefined, limit: 200 })
  assert.equal(requestDetails.config.__auralisSyncScope, ticket)
})

test('review state loading reads all local subject blocks without paging the remote states API', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  await localDb.init()
  const { authStore, reviewStore } = fixture('review-local-state-user')
  const subjectId = 'review-local-state-subject'
  const repository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Local subject' }, { version: 1, syncStatus: 'synced' })
  const blockIds = []
  for (let index = 0; index < 201; index += 1) {
    const id = `review-local-state-kb-${index}`
    blockIds.push(id)
    await repository.upsert('KNOWLEDGE_BLOCK', id, {
      id, subjectId, title: `Block ${index}`, content: `Content ${index}`,
    }, { version: 1, syncStatus: 'synced' })
  }
  useReviewApi.getSubjectStates = async () => { throw new Error('remote state endpoint must not be called') }
  reviewStore.reconcileSubjectBlocks(subjectId, blockIds)

  const states = await reviewStore.loadSubjectStates(subjectId)

  assert.equal(states.length, 201)
  assert.equal(states[0].knowledgeBlockId, blockIds[0])
  assert.equal(states[100].knowledgeBlockId, blockIds[100])
  assert.equal(states[200].knowledgeBlockId, blockIds[200])
  assert.ok(states.every((state) => state.needsLearning))
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), true)
})

test('a corrupt local review store fails closed instead of exposing an empty complete state set', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  await localDb.init()
  const { authStore, reviewStore } = fixture('review-corrupt-state-user')
  const subjectId = 'review-corrupt-state-subject'
  const blockId = 'review-corrupt-state-kb'
  const repository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Local subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', blockId, { id: blockId, subjectId, content: 'Body' }, { version: 1, syncStatus: 'synced' })
  const key = `auralis:v2:${authStore.user.id}:${authStore.serverDeviceId}:review-store`
  const corrupted = JSON.stringify({ records: [], intents: {} })
  testStorage.setItem(key, corrupted)
  reviewStore.reconcileSubjectBlocks(subjectId, [blockId])

  await assert.rejects(reviewStore.loadSubjectStates(subjectId), /LOCAL_REVIEW_STORE_CORRUPT/)
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), false)
  assert.match(reviewStore.subjectStatesErrorBySubjectId[subjectId], /LOCAL_REVIEW_STORE_CORRUPT/)
  assert.equal(testStorage.getItem(key), corrupted, 'a failed read must not overwrite the malformed persisted history')
})

test('local state refresh reads a durable lifecycle result and leaves the active round intact', async () => {
  const { localDb, getLocalRepository, getLocalSqlDatabase } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  await localDb.init()
  const { authStore, reviewStore } = fixture('review-refresh-user')
  const subjectId = 'review-refresh-subject'
  const block = { id: 'review-refresh-kb', subjectId, title: 'Refresh block', content: 'refresh body' }
  const repository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Local subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  reviewStore.reconcileSubjectBlocks(subjectId, [block.id])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({
    subjectId, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5,
  })
  const hash = createHash('sha256').update(block.content).digest('hex')
  await new LocalReviewService(getLocalSqlDatabase(), repository).executeCommand(
    authStore.user.id, authStore.serverDeviceId, block.id, 'review-refresh-learning', 'LEARNING_COMPLETED', null,
    '2026-10-09T03:00:00.000000Z', 0, hash, {
      clientCommandId: 'review-refresh-learning', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash: hash, occurredAt: '2026-10-09T03:00:00.000000Z', expectedStateAbsent: true,
    },
  )

  const states = await reviewStore.loadSubjectStates(subjectId)

  assert.equal(states[0].needsLearning, false)
  assert.equal(states[0].version, 0, 'local commands preserve the canonical server version until sync acknowledges them')
  const persisted = await new ReviewRepository(getLocalSqlDatabase(), repository).getReviewRecord(
    authStore.user.id, authStore.serverDeviceId, block.id,
  )
  assert.equal(persisted?.localRevision, 1)
  assert.equal(persisted?.state?.needsLearning, false)
  assert.equal(reviewStore.getLifecycleRound(subjectId).roundId, round.roundId)
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), true)
})

test('a transient local state read failure preserves the active round and requires a complete retry', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  await localDb.init()
  const suffix = Date.now()
  const { authStore, reviewStore } = fixture(`review-refresh-retry-user-${suffix}`)
  const subjectId = `review-refresh-retry-subject-${suffix}`
  const blockId = `review-refresh-retry-kb-${suffix}`
  const block = { id: blockId, subjectId, title: 'Retry block', content: 'retry body' }
  const repository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Local subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', blockId, block, { version: 1, syncStatus: 'synced' })
  reviewStore.reconcileSubjectBlocks(subjectId, [blockId])
  const initialStates = await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({
    subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5,
  })
  const originalGetSubjectStates = originalLocalReviewReads.getSubjectStates
  let failNextRead = true
  LocalReviewService.prototype.getSubjectStates = async function (...args) {
    if (failNextRead) {
      failNextRead = false
      throw new Error('temporary local read failure')
    }
    return originalGetSubjectStates.apply(this, args)
  }

  await assert.rejects(reviewStore.loadSubjectStates(subjectId), /temporary local read failure/)
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), false)
  assert.equal(reviewStore.subjectStatesLoadingBySubjectId[subjectId], false)
  assert.equal(reviewStore.getLifecycleRound(subjectId).roundId, round.roundId)

  const retriedStates = await reviewStore.loadSubjectStates(subjectId)
  assert.equal(retriedStates.length, initialStates.length)
  assert.equal(retriedStates[0].knowledgeBlockId, blockId)
  assert.equal(retriedStates[0].needsLearning, initialStates[0].needsLearning)
  assert.equal(retriedStates[0].version, initialStates[0].version)
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), true)
  assert.equal(reviewStore.subjectStatesErrorBySubjectId[subjectId], null)
  assert.equal(reviewStore.getLifecycleRound(subjectId).roundId, round.roundId)
})

test('logout and account A to B to A transitions clear rounds and invalidate a pending local state read', async () => {
  const { authStore, reviewStore } = fixture('review-user-a')
  const subjectId = 'review-session-subject'
  const { repository } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: 'kb-session', localCreate: true },
  ])
  await reviewStore.loadSubjectStates(subjectId)
  reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: 'kb-session', version: 0 }], groupSize: 5 })

  const originalList = repository.list.bind(repository)
  const snapshot = await originalList('KNOWLEDGE_BLOCK', { includeDeleted: true })
  const readStarted = deferred()
  const readResult = deferred()
  repository.list = async (resourceType, options) => {
    if (resourceType === 'KNOWLEDGE_BLOCK') {
      readStarted.resolve()
      return readResult.promise
    }
    return originalList(resourceType, options)
  }
  const loading = reviewStore.loadSubjectStates(subjectId)
  await readStarted.promise

  authStore.setSession({
    user: { id: 'review-user-b', email: 'review-user-b@example.test' },
    tokens: { accessToken: 'b-access', refreshToken: 'b-refresh' },
    sessionId: 'b-session', serverDeviceId: 'b-device',
  })
  readResult.resolve(snapshot)
  await assert.rejects(loading)
  assert.equal(reviewStore.getLifecycleRound(subjectId), null)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId], undefined)

  authStore.setSession({
    user: { id: 'review-user-a', email: 'review-user-a@example.test' },
    tokens: { accessToken: 'review-user-a-access-2', refreshToken: 'review-user-a-refresh-2' },
    sessionId: 'review-user-a-session-2', serverDeviceId: 'review-user-a-device',
  })
  assert.equal(reviewStore.getLifecycleRound(subjectId), null)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId], undefined)
})

test('lifecycle round state survives view unmount and remains isolated by subject', async () => {
  const { reviewStore } = fixture()
  useReviewApi.getSubjectStates = async () => page([])
  await reviewStore.loadSubjectStates('subject-a')
  await reviewStore.loadSubjectStates('subject-b')

  const first = reviewStore.startLifecycleRound({ subjectId: 'subject-a', knowledgeBlocks: [{ id: 'kb-a', version: 1 }], groupSize: 5 })
  reviewStore.beginLifecycleRecall('subject-a')
  const startedAt = first.currentStartedAt
  reviewStore.reconcileSubjectBlocks('subject-a', ['kb-a'])
  const resumed = reviewStore.startLifecycleRound({ subjectId: 'subject-a', knowledgeBlocks: [{ id: 'kb-a', version: 1 }], groupSize: 10 })
  const otherSubject = reviewStore.startLifecycleRound({ subjectId: 'subject-b', knowledgeBlocks: [{ id: 'kb-b', version: 1 }], groupSize: 5 })

  assert.equal(resumed.roundId, first.roundId)
  assert.equal(resumed.groupSize, 5)
  assert.equal(resumed.phase, 'LEARNING_RECALL')
  assert.equal(resumed.currentStartedAt, startedAt)
  assert.equal(otherSubject.roundId === first.roundId, false)
  assert.equal(reviewStore.getLifecycleRound('subject-a').currentKnowledgeBlockId, 'kb-a')
  assert.equal(reviewStore.getLifecycleRound('subject-b').currentKnowledgeBlockId, 'kb-b')
})

test('normal token rotation within the same owner device and session keeps a local state read current', async () => {
  const { authStore, reviewStore } = fixture('review-token-user')
  const subjectId = 'review-token-subject'
  const { repository } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: 'kb-token', localCreate: true },
  ])
  const originalList = repository.list.bind(repository)
  const snapshot = await originalList('KNOWLEDGE_BLOCK', { includeDeleted: true })
  const readStarted = deferred()
  const readResult = deferred()
  repository.list = async (resourceType, options) => {
    if (resourceType === 'KNOWLEDGE_BLOCK') {
      readStarted.resolve()
      return readResult.promise
    }
    return originalList(resourceType, options)
  }
  const loading = reviewStore.loadSubjectStates(subjectId)
  await readStarted.promise
  authStore.applyRefresh({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }, 'rotated-sid')
  readResult.resolve(snapshot)

  await loading
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), true)
  assert.deepEqual(reviewStore.subjectStatesBySubjectId[subjectId].map((state) => state.knowledgeBlockId), ['kb-token'])
})

test('a late local state read cannot overwrite a newer complete read or its loading flag', async () => {
  const { authStore, reviewStore } = fixture('review-late-state-user')
  const subjectId = 'review-late-state-subject'
  const { repository } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: 'kb-older', localCreate: true },
  ])
  const originalList = repository.list.bind(repository)
  const olderSnapshot = await originalList('KNOWLEDGE_BLOCK', { includeDeleted: true })
  const oldReadStarted = deferred()
  const newReadStarted = deferred()
  const oldRead = deferred()
  const newRead = deferred()
  let readCount = 0
  repository.list = async (resourceType, options) => {
    if (resourceType === 'KNOWLEDGE_BLOCK') {
      readCount += 1
      if (readCount === 1) {
        oldReadStarted.resolve()
        return oldRead.promise
      }
      if (readCount === 2) {
        newReadStarted.resolve()
        return newRead.promise
      }
    }
    return originalList(resourceType, options)
  }

  const oldLoad = reviewStore.loadSubjectStates(subjectId)
  await oldReadStarted.promise
  await repository.upsert('KNOWLEDGE_BLOCK', 'kb-newer', {
    id: 'kb-newer', subjectId, title: 'Newer block', content: 'newer body', version: 1,
  }, { version: 1, syncStatus: 'synced' })
  reviewStore.reconcileSubjectBlocks(subjectId, ['kb-newer'])
  const newerSnapshot = await originalList('KNOWLEDGE_BLOCK', { includeDeleted: true })
  const newLoad = reviewStore.loadSubjectStates(subjectId)
  await newReadStarted.promise
  newRead.resolve(newerSnapshot)
  await newLoad
  oldRead.resolve(olderSnapshot)

  await assert.rejects(oldLoad)
  assert.deepEqual(reviewStore.subjectStatesBySubjectId[subjectId].map((state) => state.knowledgeBlockId), ['kb-newer'])
  assert.equal(reviewStore.subjectStatesLoadingBySubjectId[subjectId], false)
})

test('subject history reloads lifecycle audit only', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-history-user')
  const subjectId = 'subject-history'
  const audit = {
    knowledgeBlockId: 'kb-history',
    knowledgeBlockVersion: 2,
    protocolVersion: 2,
    state: null,
    commands: [{
      commandId: 'cmd-history', clientCommandId: 'client-history', action: 'LEARNING_COMPLETED',
      occurredAt: '2026-10-08T12:00:00Z', reviewId: null, rating: null, durationSeconds: 15,
      baseVersion: 0, knowledgeBlockVersion: 2,
    }],
    effectiveReviews: [{
      reviewId: 'review-superseded', selectedRating: 'HARD', effectiveRating: null,
      selectedAt: '2026-10-07T12:00:00Z', resolvedAt: '2026-10-08T12:00:00Z', resolution: 'SUPERSEDED',
    }],
  }
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: 'kb-history', version: 2, state: null, commands: audit.commands,
    effectiveReviews: audit.effectiveReviews,
  }])

  const loaded = await reviewStore.loadSubjectHistory(subjectId, 'kb-history')

  const key = subjectId + '\u0000kb-history'
  assert.deepEqual(loaded, audit)
  assert.deepEqual(reviewStore.lifecycleHistoryBySubjectBlock[key], audit)
})

test('subject history rejects persisted lifecycle reviews with missing required fields', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-history-invalid-user')
  const subjectId = 'subject-history-invalid'
  const malformedReview = {
    reviewId: 'review-invalid', selectedRating: 'GOOD', selectedAt: '2026-10-08T12:00:00Z',
    resolvedAt: null, resolution: null,
  }
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: 'kb-history-invalid', version: 1, state: null, effectiveReviews: [malformedReview],
  }])

  await assert.rejects(reviewStore.loadSubjectHistory(subjectId, 'kb-history-invalid'), /结果不完整/)
  const key = subjectId + '\u0000kb-history-invalid'
  assert.equal(reviewStore.lifecycleHistoryBySubjectBlock[key], undefined)
})

test('deleteSubject after pane unmount clears only the deleted local review scope and blocks late reads', async () => {
  const { authStore, reviewStore, pinia } = fixture('review-delete-user-a')
  const subjectId = `review-delete-${Date.now()}`
  const subjectStore = useSubjectStore()
  useSyncStore().requestBackgroundSync = () => undefined
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{ id: 'kb-a', state: null }])
  subjectStore.subjects = [subjectModel(subjectId)]
  await reviewStore.loadSubjectStates(subjectId)
  reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: 'kb-a', version: 1 }], groupSize: 5 })

  const lateStates = deferred()
  const firstStateRead = deferred()
  const paneStateRead = deferred()
  let stateCalls = 0
  LocalReviewService.prototype.getSubjectStates = async function () {
    stateCalls += 1
    if (stateCalls === 1) firstStateRead.resolve()
    if (stateCalls === 2) paneStateRead.resolve()
    return lateStates.promise
  }
  const lateLifecycleHistory = deferred()
  const lifecycleRead = deferred()
  LocalReviewService.prototype.getLifecycleHistory = async function (userId, deviceId, knowledgeBlockId) {
    lifecycleRead.resolve()
    return lateLifecycleHistory.promise.then((history) => ({ ...history, knowledgeBlockId }))
  }

  const pendingStateLoad = reviewStore.loadSubjectStates(subjectId)
  await firstStateRead.promise
  const pendingHistory = reviewStore.loadSubjectHistory(subjectId, 'kb-a')
  await lifecycleRead.promise
  const mountedPane = await mountReviewPane(pinia, subjectId)
  await paneStateRead.promise
  mountedPane.app.unmount()
  mountedApps.splice(mountedApps.indexOf(mountedPane.app), 1)

  await subjectStore.deleteSubject(subjectId)
  assert.equal(reviewStore.getLifecycleRound(subjectId), null)
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), false)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId], undefined)
  assert.equal(reviewStore.lifecycleHistoryBySubjectBlock[`${subjectId}\u0000kb-a`], undefined)

  lateStates.resolve({ items: [] })
  lateLifecycleHistory.resolve({
    knowledgeBlockVersion: 1, protocolVersion: 2, state: null, commands: [], effectiveReviews: [],
  })
  await Promise.all([assert.rejects(pendingHistory), assert.rejects(pendingStateLoad)])
  await settleVue()

  assert.equal(reviewStore.getLifecycleRound(subjectId), null)
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), false)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId], undefined)
  assert.equal(reviewStore.lifecycleHistoryBySubjectBlock[`${subjectId}\u0000kb-a`], undefined)
  assert.equal(subjectStore.subjects.length, 0)
})

test('a failed subject tombstone keeps its active review round and state cache', async () => {
  const { authStore, reviewStore } = fixture('review-delete-failure-user')
  const subjectId = `review-delete-failure-${Date.now()}`
  const subjectStore = useSubjectStore()
  useSyncStore().requestBackgroundSync = () => undefined
  const { repository } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{ id: 'kb-a', state: null }])
  subjectStore.subjects = [subjectModel(subjectId)]
  await reviewStore.loadSubjectStates(subjectId)
  reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: 'kb-a', version: 1 }], groupSize: 5 })

  const originalCommit = repository.commitMutation.bind(repository)
  repository.commitMutation = async (input) => {
    if (input.resourceType === 'SUBJECT' && input.mutation?.mutationType === 'DELETE') {
      throw new Error('tombstone rejected')
    }
    return originalCommit(input)
  }

  await assert.rejects(subjectStore.deleteSubject(subjectId), /tombstone rejected/)
  assert.ok(reviewStore.getLifecycleRound(subjectId))
  assert.equal(reviewStore.isSubjectStatesLoaded(subjectId), true)
})

test('a delayed A subject deletion cannot clear the same subject round after B signs in', async () => {
  const { authStore, reviewStore } = fixture('review-delete-user-a')
  const subjectId = `review-delete-shared-${Date.now()}`
  const blockA = `kb-a-${Date.now()}`
  const blockB = `kb-b-${Date.now()}`
  const subjectStore = useSubjectStore()
  useSyncStore().requestBackgroundSync = () => undefined
  const { repository } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{ id: blockA, state: null }])
  subjectStore.subjects = [subjectModel(subjectId)]
  await reviewStore.loadSubjectStates(subjectId)
  reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockA, version: 1 }], groupSize: 5 })
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  await localDb.init()
  const repositoryB = await getLocalRepository('review-delete-user-b', 'user-b-device')
  await repositoryB.upsert('SUBJECT', subjectId, {
    id: subjectId, name: 'Subject B', description: '', iconKey: 'book',
  }, { version: 1, syncStatus: 'synced' })
  await repositoryB.upsert('KNOWLEDGE_BLOCK', blockB, {
    id: blockB, subjectId, title: 'B', content: '内容-' + blockB, version: 1,
  }, { version: 1, syncStatus: 'synced' })

  const originalCommit = repository.commitMutation.bind(repository)
  repository.commitMutation = async (input) => {
    const result = await originalCommit(input)
    if (input.resourceType === 'SUBJECT' && input.mutation?.mutationType === 'DELETE') {
      authStore.setSession({
        user: { id: 'review-delete-user-b', email: 'review-delete-user-b@example.test' },
        tokens: { accessToken: 'user-b-access', refreshToken: 'user-b-refresh' },
        sessionId: 'user-b-session',
        serverDeviceId: 'user-b-device',
      })
      subjectStore.subjects = [subjectModel(subjectId)]
      reviewStore.reconcileSubjectBlocks(subjectId, [blockB])
      await reviewStore.loadSubjectStates(subjectId)
      reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockB, version: 1 }], groupSize: 5 })
    }
    return result
  }

  await subjectStore.deleteSubject(subjectId)
  const currentRound = reviewStore.getLifecycleRound(subjectId)
  assert.ok(currentRound)
  assert.equal(currentRound.queue[0], blockB)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].knowledgeBlockId, blockB)
})

test('subject review UI contains the three state lists and first-rating retry controls', async () => {
  const source = await readFile(new URL('../src/components/subject/SubjectReviewPane.vue', import.meta.url), 'utf8')
  assert.match(source, /待学习/)
  assert.match(source, /待复习/)
  assert.match(source, /已掌握/)
  assert.match(source, /自测复习/)
  assert.match(source, /retryPending/)
  assert.match(source, /reconfirmPending/)
  assert.match(source, /reviewStore\.retryLifecyclePending/)
  assert.match(source, /reviewStore\.reconfirmLifecyclePending/)
  assert.match(source, /结束本轮/)
  assert.match(source, /下一组知识块数量/)
  assert.match(source, /round\.firstGroupCount/)
  assert.match(source, /SHA-256/)
})

test('late local material reads stay scoped to the captured account and do not write the shared knowledge store', async () => {
  const source = await readFile(new URL('../src/components/subject/SubjectReviewPane.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /useKnowledgeStore|knowledgeStore\.loadLocalBlocks/)
  assert.match(source, /getLocalRepository\(userId,\s*deviceId\)/)
  assert.match(source, /accountKey\(\) !== identity/)
})

test('a first local formal score invalidates stats for the still-current subject', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-stats-invalidation-user')
  useSyncStore().requestBackgroundSync = () => undefined
  const subjectId = `subject-stats-invalidation-${Date.now()}`
  const blockId = `kb-stats-invalidation-${Date.now()}`
  const { contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 0, localCreate: true, title: 'A', content: '内容-A',
    state: stateView(blockId, '2026-10-07T00:00:00.000Z', 0),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 0 }], groupSize: 5 })
  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '认识'),
    'local review card and its state should finish loading from the seeded repository')
  const statsStore = useStatsStore()
  const invalidated = []
  statsStore.invalidateSubjectStats = (id) => invalidated.push(id)
  await findButton(root, '认识').props.onClick()
  await settleVue()

  assert.ok(invalidated.length > 0)
  assert.ok(invalidated.every((id) => id === subjectId))
  assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'REVIEW_CHECK')
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].pendingReviewId,
    reviewStore.getLifecycleRound(subjectId).currentReviewId)
  assert.equal(contentHashes[blockId], createHash('sha256').update('内容-A', 'utf8').digest('hex'))
  await new Promise((resolve) => setTimeout(resolve, 650))
})

test('review history follows the current card and the round summary shows first ratings and due dates', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-history-pane-user')
  const subjectId = `subject-review-history-pane-${Date.now()}`
  const blockA = `kb-history-a-${Date.now()}`
  const blockB = `kb-history-b-${Date.now()}`
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: blockA, version: 1, title: 'A', content: '内容-A', state: stateView(blockA, '2026-10-07T00:00:00.000Z', 1) },
    { id: blockB, version: 1, title: 'B', content: '内容-B', state: stateView(blockB, '2026-10-07T00:00:00.000Z', 1) },
  ])
  await reviewStore.loadSubjectStates(subjectId)
  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '10 个'),
    'local review state should load before the pane exposes group-size controls')
  await findButton(root, '10 个').props.onClick()
  await findButton(root, '进入复习').props.onClick()
  await settleVue()

  assert.equal(reviewStore.getLifecycleRound(subjectId).groupSize, 10)
  assert.equal(reviewStore.getLifecycleRound(subjectId).queue.length, 2)
  assert.equal(reviewStore.getLifecycleRound(subjectId).firstGroupCount, 2)
  assert.equal(reviewStore.getLifecycleRound(subjectId).currentKnowledgeBlockId, blockA)

  const historyA = await reviewStore.loadSubjectHistory(subjectId, blockA)
  assert.equal(historyA.knowledgeBlockId, blockA)
  assert.deepEqual(historyA.commands, [])
  assert.deepEqual(historyA.effectiveReviews, [])

  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId)
    && findButton(root, '认识') && !findButton(root, '认识').props.disabled,
  'the local review state should be ready before rating the current card')
  await findButton(root, '认识').props.onClick()
  await settleVue()
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the local selected review should reload before confirmation')
  assert.ok(findButton(root, '下一个'), collectText(root))
  await findButton(root, '下一个').props.onClick()
  await settleVue()
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the local confirmed review should reload before moving to the next card')

  assert.equal(reviewStore.getLifecycleRound(subjectId).currentKnowledgeBlockId, blockB)
  assert.deepEqual((await reviewStore.loadSubjectHistory(subjectId, blockB)).effectiveReviews, [])
  const viewText = collectText(root)
  assert.doesNotMatch(viewText, /2025/)
  assert.match(viewText, /首次选择：忘记 0 · 模糊 0 · 认识 1/)
  assert.match(viewText, /下次\s+2026/)
  assert.match(viewText, /已完成本组/)

  await findButton(root, '模糊').props.onClick()
  await settleVue()
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the local fuzzy selection should reload before confirmation')
  await findButton(root, '下一个').props.onClick()
  await settleVue()
  const nextViewText = collectText(root)
  assert.match(nextViewText, /首次选择：忘记 0 · 模糊 1 · 认识 1/)
  assert.match(nextViewText, /末尾巩固/)
  assert.equal(reviewStore.getLifecycleRound(subjectId).currentMode, 'FUZZY')
  await new Promise((resolve) => setTimeout(resolve, 650))
})

test('review choice saves first, same-review correction enters learning, and practice completion is separate', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-two-actions-user')
  const subjectId = `subject-two-actions-${Date.now()}`
  const blockId = `kb-two-actions-${Date.now()}`
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, title: 'A', content: '内容-A',
    state: stateView(blockId, '2026-10-07T00:00:00.000Z', 1),
  }])

  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '进入复习'),
    'the locally persisted review state should load before starting review')
  const statsStore = useStatsStore()
  const invalidations = []
  statsStore.invalidateSubjectStats = (id) => invalidations.push(id)
  await findButton(root, '进入复习').props.onClick()
  await settleVue()

  assert.ok(reviewStore.getLifecycleRound(subjectId))
  assert.ok(findButton(root, '认识'))
  assert.ok(findButton(root, '模糊'))
  assert.ok(findButton(root, '忘记了'))
  assert.equal(findButton(root, '认识').props.disabled, false)
  assert.equal(findButton(root, '展开内容'), null)
  await findButton(root, '认识').props.onClick()
  await settleVue()
  let { pending } = await inspectLocalReview(authStore, repository, blockId)
  const selected = pending[0].payload
  assert.equal(selected.rating, 'GOOD')
  assert.equal(selected.contentHash, contentHashes[blockId])
  assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'REVIEW_CHECK')
  assert.ok(findButton(root, '下一个'))
  assert.ok(findButton(root, '记错了'))

  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the local state refresh after the first choice should finish before correction is enabled')
  assert.equal(findButton(root, '记错了').props.disabled, false)
  await findButton(root, '记错了').props.onClick()
  await settleVue()
  ;({ pending } = await inspectLocalReview(authStore, repository, blockId))
  assert.equal(pending[1].action, 'REVIEW_CORRECTED')
  assert.equal(pending[1].payload.reviewId, selected.reviewId)
  assert.equal(pending[1].payload.contentHash, selected.contentHash)
  assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'LEARNING_READ')
  assert.ok(findButton(root, '开始回忆'))

  await findButton(root, '开始回忆').props.onClick()
  await settleVue()
  assert.ok(findButton(root, '展开核对'))
  await findButton(root, '展开核对').props.onClick()
  await settleVue()
  assert.ok(findButton(root, '完成学习'))
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the local correction refresh should finish before learning completion is enabled')
  assert.equal(findButton(root, '完成学习').props.disabled, false)
  await findButton(root, '完成学习').props.onClick()
  await settleVue()

  const { record } = await inspectLocalReview(authStore, repository, blockId)
  assert.deepEqual(record.history.map((command) => command.action), [
    'REVIEW_SELECTED', 'REVIEW_CORRECTED', 'LEARNING_COMPLETED',
  ])
  assert.ok(record.history.every((command) => command.reviewId === selected.reviewId))
  assert.equal(record.state.needsLearning, false)
  assert.ok(invalidations.length >= 1)
  assert.ok(invalidations.every((id) => id === subjectId))
  assert.equal(reviewStore.getLifecycleRound(subjectId).queue.length, 0)
  await new Promise((resolve) => setTimeout(resolve, 650))
})

test('review pane provides distinct 进入学习 and 进入复习 actions and queues eligible blocks accurately', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-early-practice-pane-user')
  const subjectId = `subject-early-practice-pane-${Date.now()}`
  const dueAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const futureA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const futureB = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const futureLearning = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
  const futureMastered = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString()
  const ids = ['kb-new', 'kb-due', 'kb-future-a', 'kb-future-b', 'kb-learning', 'kb-mastered', 'kb-unsynced']
  const blockId = (name) => `kb-${name}-${Date.now()}`
  const [newId, dueId, futureAId, futureBId, learningId, masteredId, unsyncedId] = ids.map(blockId)
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: newId, version: 0, localCreate: true, state: null },
    { id: dueId, state: stateView(dueId, dueAt, 1, { nextReviewStage: 'CROSS_DAY' }) },
    { id: futureAId, state: stateView(futureAId, futureA, 1) },
    { id: futureBId, state: stateView(futureBId, futureB, 1) },
    { id: learningId, state: stateView(learningId, futureLearning, 1, { needsLearning: true }) },
    { id: masteredId, version: 4, state: stateView(masteredId, futureMastered, 4, { mastered: true, stableSuccessCount: 3, nextReviewStage: null }) },
    { id: unsyncedId, version: 0, localCreate: true, state: null },
  ])

  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '进入学习'),
    'local state should load before exposing learning and review actions')
  assert.ok(findButton(root, '进入学习'), collectText(root))
  assert.ok(findButton(root, '进入复习'), collectText(root))

  const learnBtn = findButton(root, '进入学习')
  const reviewBtn = findButton(root, '进入复习')
  assert.equal(learnBtn.props.disabled, false)
  assert.equal(reviewBtn.props.disabled, false)

  await reviewBtn.props.onClick()
  await settleVue()
  assert.deepEqual(reviewStore.getLifecycleRound(subjectId).queue, [dueId])

  await waitFor(() => findButton(root, '认识') && !findButton(root, '认识').props.disabled,
    'the due local block should be ready for an offline rating')
  await findButton(root, '认识').props.onClick()
  await settleVue()
  let { pending } = await inspectLocalReview(authStore, repository, dueId)
  assert.equal(pending[0].action, 'REVIEW_SELECTED')
  assert.equal(pending[0].payload.knowledgeBlockId, dueId)
  assert.equal(pending[0].payload.rating, 'GOOD')
  assert.equal(pending[0].payload.contentHash, contentHashes[dueId])
  const selectedReviewId = pending[0].payload.reviewId

  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId)
    && findButton(root, '下一个') && !findButton(root, '下一个').props.disabled,
  'the selected local review should be ready for confirmation')
  await findButton(root, '下一个').props.onClick()
  await settleVue()
  const confirmed = await inspectLocalReview(authStore, repository, dueId)
  assert.deepEqual(confirmed.record.history.map((command) => command.action), ['REVIEW_SELECTED', 'REVIEW_CONFIRMED'])
  assert.equal(confirmed.record.history[0].reviewId, selectedReviewId)
  assert.equal(confirmed.record.history[1].reviewId, selectedReviewId)
  assert.equal(confirmed.record.state.pendingReviewId, null)
  assert.equal(confirmed.record.state.stableSuccessCount, 1)

  reviewStore.endLifecycleRound(subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the local state should remain ready after ending the review round')
  await findButton(root, '进入学习').props.onClick()
  await settleVue()
  assert.deepEqual([...reviewStore.getLifecycleRound(subjectId).queue].sort(), [newId, learningId, unsyncedId].sort())
  assert.equal(reviewStore.getLifecycleRound(subjectId).knowledgeBlockVersions[unsyncedId], 0)
  await new Promise((resolve) => setTimeout(resolve, 650))
})

test('review pane defaults 待复习 to due blocks only and provides voluntary review entrance for early and mastered review', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-voluntary-pane-user')
  const subjectId = `subject-voluntary-${Date.now()}`
  const futureA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const futureMastered = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString()
  const futureBlockId = `kb-future-${Date.now()}`
  const masteredBlockId = `kb-mastered-${Date.now()}`

  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: futureBlockId, version: 1, title: '未到期', state: stateView(futureBlockId, futureA, 1) },
    { id: masteredBlockId, version: 1, title: '已掌握', state: stateView(masteredBlockId, futureMastered, 1, { mastered: true, stableSuccessCount: 3 }) },
  ])

  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '进入复习'),
    'local state should load before checking review buttons')

  const reviewBtn = findButton(root, '进入复习')
  assert.equal(reviewBtn.props.disabled, true, 'without due blocks, 进入复习 must be disabled by default')

  const text = collectText(root)
  assert.match(text, /待复习\s+·\s+0\s+个/, '待复习 must default to 0 due blocks')

  const voluntaryBtn = findButton(root, '自测复习')
  assert.ok(voluntaryBtn, '自测复习 entrance button must exist next to the review button')
  assert.equal(voluntaryBtn.props.disabled, false)

  await voluntaryBtn.props.onClick()
  await settleVue()

  const currentRound = reviewStore.getLifecycleRound(subjectId)
  assert.ok(currentRound, 'voluntary review round should be launched directly without sub-items')
  assert.equal(currentRound?.queue?.length, 2, 'all voluntary review blocks should be queued')
  assert.ok(currentRound?.queue?.includes(futureBlockId))
  assert.ok(currentRound?.queue?.includes(masteredBlockId))

  // Subsequent trigger test: ensure repeat voluntary reviews extract cleanly and do not get stuck at 0
  reviewStore.endLifecycleRound(subjectId, true)
  assert.equal(reviewStore.getLifecycleRound(subjectId), null)
  await voluntaryBtn.props.onClick()
  await settleVue()
  const secondRound = reviewStore.getLifecycleRound(subjectId)
  assert.ok(secondRound, 'subsequent voluntary review round must start cleanly')
  assert.equal(secondRound?.queue?.length, 2, 'must not be stuck at 0')

  await new Promise((resolve) => setTimeout(resolve, 650))
})

test('review pane exposes hidden HARD group-end recall and completes a successful recall locally', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-hard-fuzzy-pane-user')
  const subjectId = `subject-hard-fuzzy-${Date.now()}`
  const blockId = `kb-hard-fuzzy-${Date.now()}`
  const { repository } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, title: 'A', content: '内容-A',
    state: stateView(blockId, new Date(Date.now() - 60 * 60 * 1000).toISOString(), 1),
  }])
  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the persisted local due state should load before starting the HARD round')
  reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5 })
  await settleVue()

  await waitFor(() => findButton(root, '模糊') && !findButton(root, '模糊').props.disabled,
    'the HARD rating should be enabled for the local due block')
  await findButton(root, '模糊').props.onClick()
  await settleVue()
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the local HARD selection should reload before confirmation')
  await findButton(root, '下一个').props.onClick()
  await settleVue()
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId),
    'the confirmed local HARD result should reload before final recall')
  assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'FUZZY_RECALL')
  let persisted = await inspectLocalReview(authStore, repository, blockId)
  assert.deepEqual(persisted.record.history.map((command) => command.action), ['REVIEW_SELECTED', 'REVIEW_CONFIRMED'])
  assert.equal(persisted.record.effectiveReviews[0].selectedRating, 'HARD')

    assert.ok(findButton(root, '展开核对'))
  assert.ok(findButton(root, '忘记了'))
  assert.equal(findElementByClass(root, 'subject-review__content-body'), null)

  await findButton(root, '展开核对').props.onClick()
  await settleVue()
  assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'FUZZY_CHECK')
  assert.match(findElementByClass(root, 'subject-review__content-body').props.innerHTML, /内容-A/)
  await findButton(root, '下一个').props.onClick()
  await settleVue()

  assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'GROUP_COMPLETE')
  assert.deepEqual(reviewStore.getLifecycleRound(subjectId).fuzzyCompletedIds, [blockId])
  persisted = await inspectLocalReview(authStore, repository, blockId)
  assert.equal(persisted.record.history.length, 2, 'successful final recall should close the local queue without adding a review command')
  await new Promise((resolve) => setTimeout(resolve, 650))
})

test('lifecycle API routes selections, same-review confirmation and correction, learning, reopen, and history with the session ticket', async () => {
  for (const method of ['selectReview', 'confirmReview', 'correctReview', 'completeLearning', 'reopenLearning', 'getLifecycleHistory']) {
    assert.equal(typeof useReviewApi[method], 'function', `missing lifecycle API method ${method}`)
  }

  const ticket = { key: Symbol('lifecycle-scope'), isCurrent: () => true }
  const command = {
    clientCommandId: 'command-1',
    knowledgeBlockId: 'kb-a',
    knowledgeBlockVersion: 4,
    baseVersion: 2,
    contentHash: 'a'.repeat(64),
  }
  const calls = []
  request.post = (url, body, config) => {
    calls.push({ method: 'POST', url, body, config })
    return Promise.resolve({ commandId: 'server-command', clientCommandId: body.clientCommandId })
  }
  request.get = (url, config) => {
    calls.push({ method: 'GET', url, config })
    return Promise.resolve([])
  }

  await useReviewApi.selectReview({ ...command, reviewId: 'review-1', rating: 'GOOD', durationSeconds: 12 }, ticket)
  await useReviewApi.confirmReview('review-1', command, ticket)
  await useReviewApi.correctReview('review-1', command, ticket)
  await useReviewApi.completeLearning({ ...command, reviewId: 'review-1' }, ticket)
  await useReviewApi.reopenLearning({ ...command, reviewId: 'review-1' }, ticket)
  await useReviewApi.getLifecycleHistory({ knowledgeBlockId: 'kb-a' }, ticket)

  assert.deepEqual(calls.map(({ method, url }) => [method, url]), [
    ['POST', '/api/reviews/lifecycle/attempts'],
    ['POST', '/api/reviews/lifecycle/attempts/review-1/confirmations'],
    ['POST', '/api/reviews/lifecycle/attempts/review-1/corrections'],
    ['POST', '/api/reviews/lifecycle/learning-completions'],
    ['POST', '/api/reviews/lifecycle/learning-reopens'],
    ['GET', '/api/reviews/lifecycle/history'],
  ])
  for (const call of calls) assert.equal(call.config.__auralisSyncScope, ticket)
  assert.deepEqual(calls[0].body, { ...command, reviewId: 'review-1', rating: 'GOOD', durationSeconds: 12 })
  assert.deepEqual(calls[5].config.params, { knowledgeBlockId: 'kb-a' })
})

test('lifecycle round queues new, needs-learning, and due unique blocks while excluding future and mastered states', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-first-choice-user')
  const subjectId = 'subject-lifecycle-first-choice'
  const ids = ['kb-new', 'kb-due-late', 'kb-future', 'kb-mastered', 'kb-relearn', 'kb-due-early']
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: 'kb-new', localCreate: true },
    { id: 'kb-due-late', state: stateView('kb-due-late', '2026-10-08T11:00:00.000Z', 1) },
    { id: 'kb-future', state: stateView('kb-future', '2026-10-09T00:00:00.000Z', 1) },
    { id: 'kb-mastered', version: 4, state: stateView('kb-mastered', '2026-10-07T00:00:00.000Z', 4, { mastered: true, stableSuccessCount: 3, nextReviewStage: null }) },
    { id: 'kb-relearn', state: stateView('kb-relearn', '2026-10-09T00:00:00.000Z', 3, { needsLearning: true }) },
    { id: 'kb-due-early', state: stateView('kb-due-early', '2026-10-08T09:00:00.000Z', 1) },
  ])
  await reviewStore.loadSubjectStates(subjectId)

  assert.equal(typeof reviewStore.startLifecycleRound, 'function')
  const round = reviewStore.startLifecycleRound({
    subjectId,
    knowledgeBlocks: ids.map((id) => ({ id, version: id === 'kb-new' ? 0 : 1 })),
    groupSize: 5,
    now: new Date('2026-10-08T12:00:00.000Z'),
  })

  assert.deepEqual(round.queue, ['kb-new', 'kb-relearn', 'kb-due-early', 'kb-due-late'])
  assert.equal(round.firstGroupCount, 4)
})

test('lifecycle round removes a block that leaves the subject even when there is no legacy round', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-reconcile-user')
  const subjectId = 'subject-lifecycle-reconcile'
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: 'kb-removed', state: null },
    { id: 'kb-retained', state: null },
  ])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: 'kb-removed', version: 1 }, { id: 'kb-retained', version: 1 }],
    groupSize: 5,
  })

  reviewStore.reconcileSubjectBlocks(subjectId, ['kb-retained'])

  assert.deepEqual(round.queue, ['kb-retained'])
  assert.equal(round.currentKnowledgeBlockId, 'kb-retained')
  assert.equal(round.knowledgeBlockVersions['kb-removed'], undefined)
})

test('manual early-practice rounds admit only selected active future reviewing blocks', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-early-practice-store-user')
  const subjectId = 'subject-early-practice-store'
  const now = new Date('2026-10-08T12:00:00.000Z')
  const ids = ['kb-due', 'kb-future-selected', 'kb-future-unselected', 'kb-needs-learning', 'kb-mastered']
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
    { id: 'kb-due', state: stateView('kb-due', '2026-10-08T11:00:00.000Z', 1) },
    { id: 'kb-future-selected', state: stateView('kb-future-selected', '2026-10-09T11:00:00.000Z', 1) },
    { id: 'kb-future-unselected', state: stateView('kb-future-unselected', '2026-10-10T11:00:00.000Z', 1) },
    { id: 'kb-needs-learning', state: stateView('kb-needs-learning', '2026-10-11T11:00:00.000Z', 1, { needsLearning: true }) },
    { id: 'kb-mastered', version: 4, state: stateView('kb-mastered', '2026-10-12T11:00:00.000Z', 4, { mastered: true, stableSuccessCount: 3, nextReviewStage: null }) },
    { id: 'kb-removed', state: null },
  ])
  await reviewStore.loadSubjectStates(subjectId)

  const round = reviewStore.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [...ids, 'kb-removed'].map((id) => ({ id, version: id === 'kb-mastered' ? 4 : 1 })),
    groupSize: 5,
    now,
    manualMode: 'EARLY_PRACTICE',
    manualBlockIds: ['kb-future-selected', 'kb-future-unselected', 'kb-due', 'kb-needs-learning', 'kb-mastered', 'kb-removed'],
  })

  assert.deepEqual(round.queue, ['kb-future-selected', 'kb-future-unselected'])
  assert.deepEqual(round.remainingIds, [])
})

test('lifecycle first choice persists an immutable local command and keeps the card until confirmation', async () => {
  const suffix = Date.now()
  const { authStore, reviewStore } = fixture(`lifecycle-first-choice-${suffix}`)
  const subjectId = `subject-lifecycle-${suffix}`
  const block = { id: `kb-due-${suffix}`, version: 4 }
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    ...block, state: stateView(block.id, '2026-10-07T00:00:00.000Z', 2),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [block], groupSize: 5, now: new Date('2026-10-08T12:00:00.000Z') })

  assert.equal(typeof reviewStore.selectLifecycleRating, 'function')
  await reviewStore.selectLifecycleRating(subjectId, 'GOOD', contentHashes[block.id], 13)

  const { record, pending } = await inspectLocalReview(authStore, repository, block.id)
  const request = pending[0].payload
  assert.equal(request.knowledgeBlockId, block.id)
  assert.equal(request.knowledgeBlockVersion, 4)
  assert.equal(request.baseVersion, 2)
  assert.equal(request.rating, 'GOOD')
  assert.equal(request.durationSeconds, 13)
  assert.equal(request.contentHash, contentHashes[block.id])
  assert.equal(typeof request.clientCommandId, 'string')
  assert.equal(typeof request.reviewId, 'string')
  assert.equal(round.scopeTicket.isCurrent(), true)
  assert.equal(round.currentKnowledgeBlockId, block.id)
  assert.equal(round.phase, 'REVIEW_CHECK')
  assert.equal(round.currentReviewId, request.reviewId)
  assert.equal(round.pendingCommand, null)
  assert.equal(record.state.pendingReviewId, request.reviewId)
  assert.equal(record.state.stableSuccessCount, 0)
  assert.equal(record.localRevision, 2)
})

test('a selected GOOD is confirmed under the same review id and advances local stable progress only after confirmation', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-good-confirm-user')
  const subjectId = 'subject-lifecycle-good-confirm'
  const block = { id: 'kb-due', version: 4 }
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    ...block, state: stateView(block.id, '2026-10-07T00:00:00.000Z', 2, { nextReviewStage: 'CROSS_DAY' }),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [block], groupSize: 5, now: new Date('2026-10-08T12:00:00.000Z') })

  await reviewStore.selectLifecycleRating(subjectId, 'GOOD', contentHashes[block.id], 6)
  assert.equal(round.phase, 'REVIEW_CHECK')
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].stableSuccessCount, 0)
  await reviewStore.confirmLifecycleReview(subjectId, contentHashes[block.id])

  const { record, pending } = await inspectLocalReview(authStore, repository, block.id)
  assert.deepEqual(pending.map((intent) => intent.action), ['REVIEW_SELECTED', 'REVIEW_CONFIRMED'])
  assert.equal(pending[1].payload.reviewId, pending[0].payload.reviewId)
  assert.notEqual(pending[1].clientCommandId, pending[0].clientCommandId)
  assert.equal(pending[1].payload.contentHash, contentHashes[block.id])
  assert.equal(round.queue.length, 0)
  assert.equal(round.progressByBlock[block.id].confirmed, true)
  assert.equal(record.state.stableSuccessCount, 1)
  assert.equal(record.localRevision, 3)
})

for (const resolution of [
  { button: '下一个', action: 'REVIEW_CONFIRMED', phase: 'GROUP_COMPLETE' },
  { button: '记错了', action: 'REVIEW_CORRECTED', phase: 'LEARNING_READ' },
]) {
  test(`the regular review entry restores a saved selection to ${resolution.action} after ending and reloading`, async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
    const userId = 'scheduled-review-resume-' + resolution.action
    const subjectId = 'scheduled-review-resume-subject'
    const blockId = 'scheduled-review-resume-block'
    const { authStore, reviewStore, pinia } = fixture(userId)
    useSyncStore().requestBackgroundSync = () => undefined
    const { repository } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [
      { id: blockId, state: stateView(blockId, new Date(Date.now() - 60_000).toISOString(), 1, { nextReviewStage: 'CROSS_DAY' }) },
      ...Array.from({ length: 5 }, (_, index) => {
        const id = 'scheduled-review-future-' + index
        return { id, state: stateView(id, new Date(Date.now() + 86_400_000).toISOString(), 1) }
      }),
    ])
    const { app, root } = await mountReviewPane(pinia, subjectId)
    await waitFor(() => findButton(root, '进入复习')?.props.disabled === false, 'the only due card should be available')
    await findButton(root, '进入复习').props.onClick()
    await waitFor(() => findButton(root, '认识')?.props.disabled === false, 'the due card should allow an initial selection')
    await findButton(root, '认识').props.onClick()
    await waitFor(() => findButton(root, '下一个')?.props.disabled === false, 'the saved selection should be ready to confirm')

    const initial = await inspectLocalReview(authStore, repository, blockId)
    const reviewId = initial.pending[0].payload.reviewId
    assert.equal(initial.record.state.pendingReviewId, reviewId)
    assert.ok(Date.parse(initial.record.state.dueAt) > Date.now())
    await findButton(root, '结束本轮').props.onClick()
    await waitFor(() => findButton(root, '进入复习'), 'the pane should return to planning')
    assert.equal(findButton(root, '进入复习').props.disabled, false)
    assert.match(collectText(root), /待核对 1/)
    await findButton(root, '进入复习').props.onClick()
    assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'REVIEW_CHECK')
    await settleVue()
    await findButton(root, '结束本轮').props.onClick()
    app.unmount()
    mountedApps.splice(mountedApps.indexOf(app), 1)

    const restarted = fixture(userId)
    useSyncStore().requestBackgroundSync = () => undefined
    const reloaded = await mountReviewPane(restarted.pinia, subjectId)
    await waitFor(() => restarted.reviewStore.isSubjectStatesLoaded(subjectId)
      && collectText(reloaded.root).includes('共 6 个知识块'), 'the new pane should read all six local cards')
    await findButton(reloaded.root, '5 个').props.onClick()
    assert.equal(findButton(reloaded.root, '进入复习').props.disabled, false)
    await findButton(reloaded.root, '进入复习').props.onClick()
    const round = restarted.reviewStore.getLifecycleRound(subjectId)
    assert.equal(round.groupSize, 5)
    assert.deepEqual(round.queue, [blockId])
    assert.equal(round.phase, 'REVIEW_CHECK')
    assert.equal(round.currentReviewId, reviewId)
    await waitFor(() => findButton(reloaded.root, resolution.button)?.props.disabled === false, 'the resumed card should allow resolution')
    await findButton(reloaded.root, resolution.button).props.onClick()
    await waitFor(() => round.phase === resolution.phase, 'the resolution should apply to the resumed card')

    const resolved = await inspectLocalReview(restarted.authStore, repository, blockId)
    assert.deepEqual(resolved.pending.map((intent) => intent.action), ['REVIEW_SELECTED', resolution.action])
    assert.equal(resolved.pending[1].payload.reviewId, reviewId)
    assert.equal(resolved.record.state.pendingReviewId, null)
    if (resolution.action === 'REVIEW_CONFIRMED') assert.equal(resolved.record.state.dueAt, initial.record.state.dueAt)
    await findButton(reloaded.root, '结束本轮').props.onClick()
    await waitFor(() => findButton(reloaded.root, '进入复习'), 'the pane should return to planning after resolution')
    assert.equal(findButton(reloaded.root, '进入复习').props.disabled, true)
    await new Promise((resolve) => setTimeout(resolve, 650))
  })
}

test('resuming a pending GOOD after it becomes due confirms the only queued card', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-due-pending-good-user')
  const subjectId = 'subject-lifecycle-due-pending-good'
  const block = { id: 'kb-due-pending-good', version: 4 }
  const dueAt = new Date(Date.now() + 60_000)
  const { contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    ...block, state: stateView(block.id, dueAt.toISOString(), 2, { nextReviewStage: 'CROSS_DAY' }),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  reviewStore.startLifecycleRound({
    subjectId, knowledgeBlocks: [block], groupSize: 5, manualMode: 'EARLY_PRACTICE', manualBlockIds: [block.id],
  })
  await reviewStore.selectLifecycleRating(subjectId, 'GOOD', contentHashes[block.id])
  reviewStore.endLifecycleRound(subjectId, true)
  await reviewStore.loadSubjectStates(subjectId)

  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [block], groupSize: 5, now: dueAt })
  assert.equal(round.phase, 'REVIEW_CHECK')
  assert.equal(round.firstGroupCount, 1)
  await reviewStore.confirmLifecycleReview(subjectId, contentHashes[block.id])
  assert.deepEqual(round.completedIds, [block.id])
  assert.equal(round.phase, 'GROUP_COMPLETE')
  assert.equal(round.currentKnowledgeBlockId, null)
})

test('AGAIN enters 3R relearning and a successful relearn schedules ten minutes without stable progress', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-again-user')
  const subjectId = 'subject-lifecycle-again'
  const block = { id: 'kb-due', version: 3 }
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    ...block, state: stateView(block.id, '2026-10-07T00:00:00.000Z', 4, { stableSuccessCount: 2 }),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [block], groupSize: 5, now: new Date('2026-10-08T12:00:00.000Z') })

  await reviewStore.selectLifecycleRating(subjectId, 'AGAIN', contentHashes[block.id], 8)
  assert.equal(round.phase, 'LEARNING_READ')
  const selectedReviewId = round.currentReviewId
  reviewStore.beginLifecycleRecall(subjectId)
  reviewStore.revealLifecycleAnswer(subjectId)
  assert.equal(round.phase, 'LEARNING_CHECK')
  await reviewStore.completeLifecycleLearning(subjectId, contentHashes[block.id])

  const { record, pending } = await inspectLocalReview(authStore, repository, block.id)
  assert.deepEqual(pending.map((intent) => intent.action), ['REVIEW_SELECTED', 'LEARNING_COMPLETED'])
  assert.equal(pending[1].payload.reviewId, selectedReviewId)
  assert.equal(round.queue.length, 0)
  assert.equal(round.progressByBlock[block.id].learned, true)
  assert.equal(record.state.needsLearning, false)
  assert.equal(record.state.stableSuccessCount, 0)
  assert.equal(Date.parse(record.state.dueAt) - Date.parse(pending[1].occurredAt), 10 * 60_000)
  assert.equal(record.localRevision, 3)
})

test('HARD receives one group-end recall; failure corrects the same review then learning consumes the pass once', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-hard-learning-user')
  const subjectId = 'subject-lifecycle-hard-learning'
  const block = { id: 'kb-hard', version: 7 }
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    ...block, state: stateView(block.id, '2026-10-07T00:00:00.000Z', 5, { stableSuccessCount: 2 }),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [block], groupSize: 5, now: new Date('2026-10-08T12:00:00.000Z') })

  await reviewStore.selectLifecycleRating(subjectId, 'HARD', contentHashes[block.id])
  const reviewId = round.currentReviewId
  await reviewStore.confirmLifecycleReview(subjectId, contentHashes[block.id])
  assert.deepEqual(round.fuzzyPendingIds, [block.id])
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].pendingReviewId, null)
  assert.deepEqual(round.queue, [])
  assert.equal(round.pendingCommand, null)
  reviewStore.nextLifecycleGroup(subjectId)
  assert.equal(round.currentMode, 'FUZZY')
  assert.deepEqual(round.fuzzyPendingIds, [])
  assert.equal(round.phase, 'FUZZY_RECALL')
  reviewStore.revealLifecycleAnswer(subjectId)
  assert.equal(round.phase, 'FUZZY_CHECK')
  await reviewStore.correctLifecycleReview(subjectId, contentHashes[block.id])
  assert.equal(round.phase, 'LEARNING_READ')
  reviewStore.beginLifecycleRecall(subjectId)
  reviewStore.revealLifecycleAnswer(subjectId)
  await reviewStore.completeLifecycleLearning(subjectId, contentHashes[block.id])

  const { record, pending } = await inspectLocalReview(authStore, repository, block.id)
  assert.deepEqual(pending.map((intent) => intent.action), [
    'REVIEW_SELECTED', 'REVIEW_CONFIRMED', 'REVIEW_CORRECTED', 'LEARNING_COMPLETED',
  ])
  assert.ok(pending.every((intent) => intent.payload.reviewId === reviewId))
  assert.equal(record.effectiveReviews[0].effectiveRating, 'AGAIN')
  assert.equal(record.state.needsLearning, false)
  assert.equal(record.state.stableSuccessCount, 0)
  assert.equal(record.localRevision, 5)
  assert.deepEqual(round.fuzzyCompletedIds, [block.id])
  assert.equal(round.queue.length, 0)
  reviewStore.nextLifecycleGroup(subjectId)
  assert.equal(round.currentKnowledgeBlockId, null)
  assert.deepEqual(round.fuzzyCompletedIds, [block.id])
})

test('forgetting during the hidden fuzzy recall corrects the same confirmed HARD review into learning', async () => {
  const { authStore, reviewStore } = fixture('lifecycle-fuzzy-forget-user')
  const subjectId = 'subject-lifecycle-fuzzy-forget'
  const block = { id: 'kb-fuzzy-forget', version: 2 }
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    ...block, state: stateView(block.id, '2026-10-07T00:00:00.000Z', 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [block], groupSize: 5 })
  await reviewStore.selectLifecycleRating(subjectId, 'HARD', contentHashes[block.id])
  const reviewId = round.currentReviewId
  await reviewStore.confirmLifecycleReview(subjectId, contentHashes[block.id])
  reviewStore.nextLifecycleGroup(subjectId)
  assert.equal(round.phase, 'FUZZY_RECALL')

  await reviewStore.correctLifecycleReview(subjectId, contentHashes[block.id])

  const { record, pending } = await inspectLocalReview(authStore, repository, block.id)
  assert.deepEqual(pending.map((intent) => intent.action), ['REVIEW_SELECTED', 'REVIEW_CONFIRMED', 'REVIEW_CORRECTED'])
  assert.ok(pending.every((intent) => intent.payload.reviewId === reviewId))
  assert.equal(record.effectiveReviews[0].effectiveRating, 'AGAIN')
  assert.equal(record.state.needsLearning, true)
  assert.equal(round.phase, 'LEARNING_READ')
  assert.equal(round.progressByBlock[block.id].rating, 'AGAIN')
})

test('lifecycle retry preserves the exact local command and late A responses cannot write after account switch', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore } = fixture('lifecycle-user-a')
  const subjectId = `subject-lifecycle-${Date.now()}`
  const blockId = `kb-lifecycle-${Date.now()}`
  const { contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, content: 'Lifecycle retry',
    state: stateView(blockId, new Date(Date.now() - 60 * 60 * 1000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5 })
  const originalExecute = LocalReviewService.prototype.executeCommand
  const requests = []
  let failBeforeLocalCommit = true
  LocalReviewService.prototype.executeCommand = async function (...args) {
    requests.push({ args: structuredClone(args) })
    if (failBeforeLocalCommit) {
      failBeforeLocalCommit = false
      throw new Error('local commit temporarily unavailable')
    }
    return originalExecute.apply(this, args)
  }

  await assert.rejects(reviewStore.selectLifecycleRating(subjectId, 'GOOD', contentHashes[blockId]), /local commit temporarily unavailable/)
  const frozenRequest = structuredClone(reviewStore.getLifecycleRound(subjectId).pendingCommand.request)
  await reviewStore.retryLifecyclePending(subjectId)
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[1].args, requests[0].args)
  assert.deepEqual(frozenRequest, requests[0].args[9])
  assert.equal(reviewStore.getLifecycleRound(subjectId).phase, 'REVIEW_CHECK')

  const otherSubject = `subject-late-${Date.now()}`
  const otherBlock = `kb-late-${Date.now()}`
  const lateBaseline = await seedLocalReviewSubject(authStore, reviewStore, otherSubject, [{
    id: otherBlock, version: 1, content: 'Late local response',
    state: stateView(otherBlock, new Date(Date.now() - 60 * 60 * 1000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(otherSubject)
  reviewStore.startLifecycleRound({ subjectId: otherSubject, knowledgeBlocks: [{ id: otherBlock, version: 1 }], groupSize: 5 })
  let committedResolve
  let releaseResolve
  const committed = new Promise((resolve) => { committedResolve = resolve })
  const release = new Promise((resolve) => { releaseResolve = resolve })
  LocalReviewService.prototype.executeCommand = async function (...args) {
    const response = await originalExecute.apply(this, args)
    committedResolve({ response, args })
    await release
    return response
  }
  const lateRequest = reviewStore.selectLifecycleRating(otherSubject, 'GOOD', lateBaseline.contentHashes[otherBlock])
  const dispatched = await committed
  authStore.setSession({
    user: { id: 'lifecycle-user-b', email: 'lifecycle-user-b@example.test' },
    tokens: { accessToken: 'lifecycle-user-b-access', refreshToken: 'lifecycle-user-b-refresh' },
    sessionId: 'lifecycle-user-b-session',
    serverDeviceId: 'lifecycle-user-b-device',
  })
  releaseResolve()
  await assert.rejects(lateRequest)
  assert.deepEqual(reviewStore.lifecycleRoundsBySubjectId, {})
  assert.deepEqual(reviewStore.subjectStatesBySubjectId, {})
  const { getLocalSqlDatabase, getLocalRepository } = await import('../src/services/localDb.ts')
  const userARepository = await getLocalRepository('lifecycle-user-a', 'lifecycle-user-a-device')
  const persisted = new ReviewRepository(getLocalSqlDatabase(), userARepository)
  const localAfterSwitch = await persisted.getReviewRecord('lifecycle-user-a', 'lifecycle-user-a-device', otherBlock)
  assert.equal(localAfterSwitch.history[0].clientCommandId, dispatched.args[3])
  assert.equal(localAfterSwitch.state.pendingReviewId, localAfterSwitch.history[0].reviewId)
})

test('a stale local command response cannot roll back newer lifecycle state or continue an obsolete review id', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore } = fixture('lifecycle-stale-replay-user')
  const subjectId = `subject-stale-replay-${Date.now()}`
  const blockId = `kb-stale-replay-${Date.now()}`
  const baseline = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, content: 'Stale response',
    state: stateView(blockId, new Date(Date.now() - 60 * 60 * 1000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5 })
  const originalExecute = LocalReviewService.prototype.executeCommand
  let responseResolve
  let releaseResolve
  const responseReady = new Promise((resolve) => { responseResolve = resolve })
  const release = new Promise((resolve) => { releaseResolve = resolve })
  LocalReviewService.prototype.executeCommand = async function (...args) {
    const response = await originalExecute.apply(this, args)
    responseResolve({ response, args })
    await release
    return response
  }
  const oldRequest = reviewStore.selectLifecycleRating(subjectId, 'GOOD', baseline.contentHashes[blockId])
  const localCommit = await responseReady
  const { getLocalSqlDatabase, getLocalRepository } = await import('../src/services/localDb.ts')
  const localRepository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  const reviewRepository = new ReviewRepository(getLocalSqlDatabase(), localRepository)
  await reviewRepository.updateIntentStatus(
    getLocalSqlDatabase(), authStore.user.id, authStore.serverDeviceId, localCommit.args[3], 'applied',
  )
  const localReviewService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
  const newerState = stateView(blockId, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), 3, {
    knowledgeBlockVersion: 1,
    contentHash: baseline.contentHashes[blockId],
    lastReviewId: 'review-from-another-device',
    pendingReviewId: null,
  })
  assert.equal(await localReviewService.importLifecycleHistory(
    authStore.user.id, authStore.serverDeviceId, blockId,
    { knowledgeBlockId: blockId, knowledgeBlockVersion: 1, protocolVersion: 2, state: newerState, commands: [], effectiveReviews: [] },
  ), true)
  await reviewStore.loadSubjectStates(subjectId)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].version, 3)
  releaseResolve()
  await oldRequest

  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].version, 3)
  assert.equal(round.conflictNeedsConfirmation, true)
  assert.equal(round.pendingCommand.request.reviewId, localCommit.args[9].reviewId)
  await reviewStore.reconfirmLifecyclePending(subjectId)

  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].version, 3)
  assert.equal(round.pendingCommand, null)
  assert.equal(round.phase, 'GROUP_COMPLETE')
  assert.equal(round.currentReviewId, null)
  assert.equal(round.progressByBlock[blockId], undefined)
  assert.equal((await reviewRepository.getReviewRecord(authStore.user.id, authStore.serverDeviceId, blockId)).state.version, 3)
})

test('reconfirmation clears a local confirmation when persisted state carries another review id', async () => {
  const suffix = Date.now()
  const { authStore, reviewStore } = fixture('reconfirm-replaced-' + suffix)
  const subjectId = 'subject-reconfirm-replaced-' + suffix
  const blockId = 'kb-reconfirm-replaced-' + suffix
  const { contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, content: 'Replaced review id',
    state: stateView(blockId, new Date(Date.now() - 3600000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5 })
  await reviewStore.selectLifecycleRating(subjectId, 'GOOD', contentHashes[blockId])
  const { getLocalSqlDatabase, getLocalRepository } = await import('../src/services/localDb.ts')
  const localRepository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  const reviewRepository = new ReviewRepository(getLocalSqlDatabase(), localRepository)
  const selected = (await reviewRepository.getPendingIntents(authStore.user.id, authStore.serverDeviceId, blockId))[0]
  await reviewRepository.updateIntentStatus(getLocalSqlDatabase(), authStore.user.id, authStore.serverDeviceId, selected.clientCommandId, 'applied')
  LocalReviewService.prototype.executeCommand = async () => {
    throw new ApiProblemError({ title: 'Version conflict', detail: 'state changed on another device', status: 409, code: 'RESOURCE_VERSION_CONFLICT' })
  }
  await assert.rejects(reviewStore.confirmLifecycleReview(subjectId, contentHashes[blockId]),
    (error) => error instanceof ApiProblemError && error.problem.code === 'RESOURCE_VERSION_CONFLICT')
  const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
  const otherReviewId = 'review-from-another-device'
  const state = stateView(blockId, new Date(Date.now() + 86400000).toISOString(), 3, {
    knowledgeBlockVersion: 1, contentHash: contentHashes[blockId], lastReviewId: otherReviewId, pendingReviewId: otherReviewId,
  })
  assert.equal(await localService.importLifecycleHistory(authStore.user.id, authStore.serverDeviceId, blockId, {
    knowledgeBlockId: blockId, knowledgeBlockVersion: 1, protocolVersion: 2, state, commands: [], effectiveReviews: [],
  }), true)
  await reviewStore.reconfirmLifecyclePending(subjectId)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].version, 3)
  assert.equal(round.pendingCommand, null)
  assert.equal(round.currentReviewId, null)
  assert.equal(round.phase, 'GROUP_COMPLETE')
  assert.equal(round.progressByBlock[blockId], undefined)
})

test('reconfirmation accepts locally persisted same-review progress after a lost confirmation response', async () => {
  const suffix = Date.now()
  const { authStore, reviewStore } = fixture('reconfirm-same-review-' + suffix)
  const subjectId = 'subject-reconfirm-same-review-' + suffix
  const blockId = 'kb-reconfirm-same-review-' + suffix
  const { repository, contentHashes } = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, content: 'Same review completion',
    state: stateView(blockId, new Date(Date.now() - 3600000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5 })
  await reviewStore.selectLifecycleRating(subjectId, 'GOOD', contentHashes[blockId])
  const selected = (await inspectLocalReview(authStore, repository, blockId)).pending[0]
  const { getLocalSqlDatabase } = await import('../src/services/localDb.ts')
  const reviewRepository = new ReviewRepository(getLocalSqlDatabase(), repository)
  await reviewRepository.updateIntentStatus(getLocalSqlDatabase(), authStore.user.id, authStore.serverDeviceId, selected.clientCommandId, 'applied')
  const originalExecute = LocalReviewService.prototype.executeCommand
  LocalReviewService.prototype.executeCommand = async function (...args) {
    const response = await originalExecute.apply(this, args)
    if (args[4] === 'REVIEW_CONFIRMED') {
      throw new ApiProblemError({ title: 'Version conflict', detail: 'review sync acknowledged elsewhere', status: 409, code: 'RESOURCE_VERSION_CONFLICT' })
    }
    return response
  }
  const reviewId = round.currentReviewId
  await assert.rejects(reviewStore.confirmLifecycleReview(subjectId, contentHashes[blockId]),
    (error) => error instanceof ApiProblemError && error.problem.code === 'RESOURCE_VERSION_CONFLICT')
  const committed = await inspectLocalReview(authStore, repository, blockId)
  assert.deepEqual(committed.record.history.map((command) => command.action), ['REVIEW_SELECTED', 'REVIEW_CONFIRMED'])
  assert.equal(committed.record.state.lastReviewId, reviewId)
  await reviewStore.reconfirmLifecyclePending(subjectId)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].version, 3)
  assert.equal(round.pendingCommand, null)
  assert.equal(round.phase, 'GROUP_COMPLETE')
  assert.equal(round.currentReviewId, null)
  assert.equal(committed.pending.at(-1).action, 'REVIEW_CONFIRMED')
})

test('reconfirmation discards a pending local command when imported text qualification changed', async () => {
  const suffix = Date.now()
  const { authStore, reviewStore } = fixture('reconfirm-content-' + suffix)
  const subjectId = 'subject-reconfirm-content-' + suffix
  const blockId = 'kb-reconfirm-content-' + suffix
  const baseline = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, content: 'Original qualified text',
    state: stateView(blockId, new Date(Date.now() - 3600000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5 })
  LocalReviewService.prototype.executeCommand = async () => {
    throw new ApiProblemError({ title: 'Version conflict', detail: 'knowledge text changed', status: 409, code: 'RESOURCE_VERSION_CONFLICT' })
  }
  await assert.rejects(reviewStore.selectLifecycleRating(subjectId, 'GOOD', baseline.contentHashes[blockId]),
    (error) => error instanceof ApiProblemError && error.problem.code === 'RESOURCE_VERSION_CONFLICT')
  const updatedContent = 'Updated qualified text'
  const updatedHash = createHash('sha256').update(updatedContent).digest('hex')
  const localRepository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  await localRepository.upsert('KNOWLEDGE_BLOCK', blockId, {
    id: blockId, subjectId, title: 'Updated block', content: updatedContent, version: 2,
  }, { version: 2, syncStatus: 'synced' })
  const { getLocalSqlDatabase } = await import('../src/services/localDb.ts')
  const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
  assert.equal(await localService.importLifecycleHistory(authStore.user.id, authStore.serverDeviceId, blockId, {
    knowledgeBlockId: blockId, knowledgeBlockVersion: 2, protocolVersion: 2,
    state: stateView(blockId, new Date(Date.now() + 86400000).toISOString(), 3, {
      knowledgeBlockVersion: 2, contentHash: updatedHash,
    }), commands: [], effectiveReviews: [],
  }), true)
  await reviewStore.reconfirmLifecyclePending(subjectId)
  assert.equal(round.pendingCommand, null)
  assert.equal(round.phase, 'GROUP_COMPLETE')
  assert.match(round.pendingError, /正文已变化/)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].knowledgeBlockVersion, 2)
  assert.equal((await inspectLocalReview(authStore, localRepository, blockId)).pending.length, 0)
})

test('reconfirmation consults persisted lifecycle history when a concurrent update clears review ids', async () => {
  const suffix = Date.now()
  const { authStore, reviewStore } = fixture('reconfirm-legacy-' + suffix)
  const subjectId = 'subject-reconfirm-legacy-' + suffix
  const blockId = 'kb-reconfirm-legacy-' + suffix
  const baseline = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, content: 'Legacy bridge block',
    state: stateView(blockId, new Date(Date.now() - 3600000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: blockId, version: 1 }], groupSize: 5 })
  const originalExecute = LocalReviewService.prototype.executeCommand
  LocalReviewService.prototype.executeCommand = async function (...args) {
    const response = await originalExecute.apply(this, args)
    if (args[4] === 'REVIEW_SELECTED') {
      throw new ApiProblemError({ title: 'Version conflict', detail: 'legacy review state advanced', status: 409, code: 'RESOURCE_VERSION_CONFLICT' })
    }
    return response
  }
  await assert.rejects(reviewStore.selectLifecycleRating(subjectId, 'GOOD', baseline.contentHashes[blockId]),
    (error) => error instanceof ApiProblemError && error.problem.code === 'RESOURCE_VERSION_CONFLICT')
  const { getLocalSqlDatabase, getLocalRepository } = await import('../src/services/localDb.ts')
  const localRepository = await getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  const reviewRepository = new ReviewRepository(getLocalSqlDatabase(), localRepository)
  const selectedRecord = await reviewRepository.getReviewRecord(authStore.user.id, authStore.serverDeviceId, blockId)
  const selectedIntent = (await reviewRepository.getPendingIntents(authStore.user.id, authStore.serverDeviceId, blockId))[0]
  await reviewRepository.updateIntentStatus(getLocalSqlDatabase(), authStore.user.id, authStore.serverDeviceId, selectedIntent.clientCommandId, 'applied')
  const localService = new LocalReviewService(getLocalSqlDatabase(), localRepository)
  const advancedState = stateView(blockId, new Date(Date.now() + 86400000).toISOString(), 3, {
    knowledgeBlockVersion: 1, contentHash: baseline.contentHashes[blockId], lastReviewId: null, pendingReviewId: null,
  })
  assert.equal(await localService.importLifecycleHistory(authStore.user.id, authStore.serverDeviceId, blockId, {
    knowledgeBlockId: blockId, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: advancedState, commands: selectedRecord.history, effectiveReviews: [],
  }), true)
  let remoteHistoryCalls = 0
  useReviewApi.getLifecycleHistory = async () => {
    remoteHistoryCalls += 1
    throw new Error('local reconfirmation must not call the remote lifecycle history API')
  }
  await reviewStore.reconfirmLifecyclePending(subjectId)
  assert.equal(remoteHistoryCalls, 0)
  assert.equal(reviewStore.subjectStatesBySubjectId[subjectId][0].version, 3)
  assert.equal(round.pendingCommand, null)
  assert.equal(round.phase, 'GROUP_COMPLETE')
  assert.match(round.pendingError, /另一设备更新/)
  assert.equal((await reviewStore.loadSubjectHistory(subjectId, blockId)).commands.length, 1)
})

test('SubjectWorkspace exposes review and statistics as subject-local views with direct query links', async () => {
  const source = await readFile(new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url), 'utf8')
  assert.match(source, /centerView === 'review'/)
  assert.match(source, /centerView === 'stats'/)
  assert.match(source, /SubjectReviewPane/)
  assert.match(source, /SubjectStatsPane/)
  assert.match(source, /route\.query\.view === 'review'/)
  assert.match(source, /route\.query\.view === 'stats'/)
  assert.match(source, /query\.view = queryView/)
})

test('Timeline no longer invokes or defines the stale review task generator', async () => {
  const source = await readFile(new URL('../src/views/Timeline/index.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /checkSpacedRepetition/)
  assert.match(source, /KB_ID/)
})

test('SubjectWorkspace back handler restores workspace view and review pane hierarchy is clean', async () => {
  const source = await readFile(new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url), 'utf8')
  assert.match(source, /handleReviewOrStatsBack/)
  assert.match(source, /lastWorkspaceState/)
  assert.doesNotMatch(source, /@back="centerView = 'blocks'"/)
  const reviewPaneSource = await readFile(new URL('../src/components/subject/SubjectReviewPane.vue', import.meta.url), 'utf8')
  // 最外面层级（header）不需要返回按钮
  const headerMatch = reviewPaneSource.match(/<header v-if="!round"[\s\S]*?<\/header>/)
  assert.ok(headerMatch)
  assert.doesNotMatch(headerMatch[0], /subject-review__btn-back/)
  // 轮次内返回按钮直接退出到规划总览 (endRound)
  assert.match(reviewPaneSource, /@click="endRound"[\s\S]*?title="返回规划总览"/)
})

test('voluntary pane rejects an empty round returned by a stale store action', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-voluntary-stale-action-user')
  const subjectId = 'subject-voluntary-stale-action-' + Date.now()
  const blockIds = ['kb-voluntary-stale-a-' + Date.now(), 'kb-voluntary-stale-b-' + Date.now()]
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, blockIds.map((id) => ({
    id, version: 1, state: stateView(id, future, 1),
  })))
  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '自测复习'),
    'the self-test entry should become available after loading local review states')

  reviewStore.startLifecycleRound = (input) => {
    const states = reviewStore.subjectStatesBySubjectId[subjectId] ?? []
    const legacySelected = input.knowledgeBlocks.filter((block) => states.find((state) => state.knowledgeBlockId === block.id)?.mastered === true)
    const selectedIds = legacySelected.map((block) => block.id)
    const queue = selectedIds.slice(0, input.groupSize)
    const emptyRound = {
      roundId: 'stale-empty-round-' + Date.now(),
      subjectId,
      scopeTicket: reviewStore.captureScopeTicket(),
      groupSize: input.groupSize,
      knowledgeBlockVersions: Object.fromEntries(legacySelected.map((block) => [block.id, block.version])),
      queue,
      remainingIds: selectedIds.slice(input.groupSize),
      firstGroupCount: queue.length,
      currentKnowledgeBlockId: queue[0] ?? null,
      currentStartedAt: new Date().toISOString(),
      phase: 'GROUP_COMPLETE',
      currentReviewId: null,
      currentRating: null,
      currentMode: 'NORMAL',
      pendingCommand: null,
      pendingError: null,
      conflictNeedsConfirmation: false,
      progressByBlock: {},
      fuzzyPendingIds: [],
      fuzzyQueueIds: [],
      fuzzyCompletedIds: [],
      completedIds: [],
    }
    reviewStore.lifecycleRoundsBySubjectId[subjectId] = emptyRound
    return emptyRound
  }

  await findButton(root, '自测复习').props.onClick()
  await settleVue()

  assert.equal(reviewStore.getLifecycleRound(subjectId), null, 'the pane should discard an empty stale round')
  assert.doesNotMatch(collectText(root), /本次共复习\s+0\s+个知识点/, 'an empty stale round must not be shown as a completed review')
  assert.match(collectText(root), /自测复习未能启动/, 'the user should receive a clear startup error')
})

test('lifecycle start rejects an empty selected queue without publishing a round', async () => {
  const { authStore, reviewStore } = fixture('review-empty-start-guard-user')
  const subjectId = 'subject-empty-start-guard-' + Date.now()
  const blockId = 'kb-empty-start-guard-' + Date.now()
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, state: stateView(blockId, new Date(Date.now() + 86400000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)

  assert.throws(() => reviewStore.startLifecycleRound({
    subjectId, knowledgeBlocks: [], groupSize: 5, manualMode: 'VOLUNTARY', manualBlockIds: [],
  }), /没有可复习知识块/)
  assert.equal(reviewStore.getLifecycleRound(subjectId), null)
})

test('an existing empty lifecycle round does not render a false zero-completion summary', async () => {
  const { authStore, reviewStore, pinia } = fixture('review-empty-round-pane-user')
  const subjectId = 'subject-empty-round-pane-' + Date.now()
  const blockId = 'kb-empty-round-pane-' + Date.now()
  await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{ id: blockId, state: null }])
  const { root } = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId), 'local review states should load before injecting the saved empty round')
  const emptyRound = {
    roundId: 'saved-empty-round-' + Date.now(),
    subjectId,
    scopeTicket: reviewStore.captureScopeTicket(),
    groupSize: 5,
    knowledgeBlockVersions: {},
    queue: [],
    remainingIds: [],
    firstGroupCount: 0,
    currentKnowledgeBlockId: null,
    currentStartedAt: new Date().toISOString(),
    phase: 'GROUP_COMPLETE',
    currentReviewId: null,
    currentRating: null,
    currentMode: 'NORMAL',
    pendingCommand: null,
    pendingError: null,
    conflictNeedsConfirmation: false,
    progressByBlock: {},
    fuzzyPendingIds: [],
    fuzzyQueueIds: [],
    fuzzyCompletedIds: [],
    completedIds: [],
  }
  reviewStore.lifecycleRoundsBySubjectId[subjectId] = emptyRound
  await settleVue()

  assert.doesNotMatch(collectText(root), /本次共复习\s+0\s+个知识点/)
  assert.match(collectText(root), /本轮没有可复习知识块/)

  emptyRound.fuzzyPendingIds.push(blockId)
  emptyRound.pendingCommand = { action: 'REVIEW_SELECTED', reviewId: 'pending-review', request: {} }
  await settleVue()
  assert.doesNotMatch(collectText(root), /本次共复习\s+0\s+个知识点/, 'pending fuzzy work must not be treated as a successful empty round')
  assert.match(collectText(root), /本轮没有可复习知识块/)
})

test('a remounted review pane preserves its active round until the local knowledge-block read completes', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-remount-local-block-load-user')
  const subjectId = 'subject-remount-local-block-load-' + Date.now()
  const blockId = 'kb-remount-local-block-load-' + Date.now()
  const seeded = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, state: stateView(blockId, new Date(Date.now() + 86400000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const firstMount = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId)
    && collectText(firstMount.root).includes('共 1 个知识块'), 'the first mount should finish loading local blocks')
  const round = reviewStore.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: blockId, version: 1 }],
    groupSize: 5,
    manualMode: 'VOLUNTARY',
    manualBlockIds: [blockId],
  })
  await settleVue()
  assert.equal(collectText(firstMount.root).includes('本组 1 / 1'), true)

  firstMount.app.unmount()
  const oldMountIndex = mountedApps.indexOf(firstMount.app)
  if (oldMountIndex >= 0) mountedApps.splice(oldMountIndex, 1)

  const deferredRead = deferNextKnowledgeBlockRead(seeded.repository)
  try {
    const remounted = await mountReviewPane(pinia, subjectId)
    await waitFor(() => deferredRead.isStarted(), 'the remounted pane should reach the deferred real repository read')
    await settleVue()

    const duringRead = reviewStore.getLifecycleRound(subjectId)
    assert.equal(duringRead?.roundId, round.roundId)
    assert.deepEqual(duringRead?.queue, round.queue)
    assert.equal(duringRead?.phase, round.phase)
    assert.doesNotMatch(collectText(remounted.root), /本轮没有可复习知识块/)
    assert.doesNotMatch(collectText(remounted.root), /本次共复习\s+0\s+个知识点/)
    assert.equal(findButton(remounted.root, '返回规划'), null, 'loading must not offer an action that clears the active round')

    deferredRead.release()
    await waitFor(() => {
      const title = findElementByClass(remounted.root, 'subject-review__word-title')
      return title && collectText(title).includes(blockId)
    }, 'the same active review card should return when local blocks finish loading')
    const resumed = reviewStore.getLifecycleRound(subjectId)
    assert.equal(resumed?.roundId, round.roundId)
    assert.deepEqual(resumed?.queue, round.queue)
    assert.equal(resumed?.phase, round.phase)
    assert.equal(resumed?.currentKnowledgeBlockId, blockId)
    assert.match(collectText(remounted.root), /本组 1 \/ 1/)
  } finally {
    deferredRead.release()
    deferredRead.restore()
  }
})

test('a subject switch does not reconcile a valid target round against the temporary empty active-block list', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-subject-switch-local-block-load-user')
  const oldSubjectId = 'subject-switch-old-' + Date.now()
  const targetSubjectId = 'subject-switch-target-' + Date.now()
  const oldBlockId = 'kb-switch-old-' + Date.now()
  const targetBlockId = 'kb-switch-target-' + Date.now()
  const seeded = await seedLocalReviewSubject(authStore, reviewStore, oldSubjectId, [{
    id: oldBlockId, version: 1, state: stateView(oldBlockId, new Date(Date.now() + 86400000).toISOString(), 1),
  }])
  await seedLocalReviewSubject(authStore, reviewStore, targetSubjectId, [{
    id: targetBlockId, version: 1, state: stateView(targetBlockId, new Date(Date.now() + 86400000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(oldSubjectId)
  await reviewStore.loadSubjectStates(targetSubjectId)
  const round = reviewStore.startLifecycleRound({
    subjectId: targetSubjectId,
    knowledgeBlocks: [{ id: targetBlockId, version: 1 }],
    groupSize: 5,
    manualMode: 'VOLUNTARY',
    manualBlockIds: [targetBlockId],
  })
  const mounted = await mountReviewPane(pinia, oldSubjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(oldSubjectId)
    && collectText(mounted.root).includes('共 1 个知识块'), 'the original subject should finish loading local blocks')

  const deferredRead = deferNextKnowledgeBlockRead(seeded.repository)
  try {
    mounted.app._instance.props.subjectId = targetSubjectId
    await waitFor(() => deferredRead.isStarted(), 'the switched pane should reach the deferred real repository read')
    await settleVue()

    assert.equal(reviewStore.getLifecycleRound(targetSubjectId)?.roundId, round.roundId,
      'the empty active-block interval must not reconcile away a valid target round')
    assert.doesNotMatch(collectText(mounted.root), /本轮没有可复习知识块/)
    assert.doesNotMatch(collectText(mounted.root), /本次共复习\s+0\s+个知识点/)
    assert.equal(findButton(mounted.root, '返回规划'), null)

    deferredRead.release()
    await waitFor(() => {
      const title = findElementByClass(mounted.root, 'subject-review__word-title')
      return title && collectText(title).includes(targetBlockId)
    }, 'the target card should load without losing its existing round')
    const resumed = reviewStore.getLifecycleRound(targetSubjectId)
    assert.equal(resumed?.roundId, round.roundId)
    assert.deepEqual(resumed?.queue, round.queue)
    assert.equal(resumed?.phase, round.phase)
    assert.equal(resumed?.currentKnowledgeBlockId, targetBlockId)
  } finally {
    deferredRead.release()
    deferredRead.restore()
  }
})

test('a failed local block read keeps the active round and offers retry instead of treating missing data as an empty round', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const { authStore, reviewStore, pinia } = fixture('review-local-block-read-error-user')
  const subjectId = 'subject-local-block-read-error-' + Date.now()
  const blockId = 'kb-local-block-read-error-' + Date.now()
  const seeded = await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
    id: blockId, version: 1, state: stateView(blockId, new Date(Date.now() + 86400000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(subjectId)
  const firstMount = await mountReviewPane(pinia, subjectId)
  await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId)
    && collectText(firstMount.root).includes('共 1 个知识块'), 'the first mount should finish loading local blocks')
  const round = reviewStore.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: blockId, version: 1 }],
    groupSize: 5,
    manualMode: 'VOLUNTARY',
    manualBlockIds: [blockId],
  })
  await settleVue()
  firstMount.app.unmount()
  const oldMountIndex = mountedApps.indexOf(firstMount.app)
  if (oldMountIndex >= 0) mountedApps.splice(oldMountIndex, 1)

  const deferredRead = deferNextKnowledgeBlockRead(seeded.repository)
  try {
    const remounted = await mountReviewPane(pinia, subjectId)
    await waitFor(() => deferredRead.isStarted(), 'the remounted pane should reach the deferred repository read')
    deferredRead.reject(new Error('本机知识块读取失败'))
    await waitFor(() => collectText(remounted.root).includes('本机知识块读取失败'), 'the read failure should be visible with a retry action')

    assert.equal(reviewStore.getLifecycleRound(subjectId)?.roundId, round.roundId)
    assert.deepEqual(reviewStore.getLifecycleRound(subjectId)?.queue, round.queue)
    assert.doesNotMatch(collectText(remounted.root), /本轮没有可复习知识块/)
    assert.doesNotMatch(collectText(remounted.root), /本次共复习\s+0\s+个知识点/)
    assert.equal(findButton(remounted.root, '返回规划'), null)
    const retryButton = findButton(remounted.root, '重试读取')
    assert.ok(retryButton)

    deferredRead.restore()
    await retryButton.props.onClick()
    await waitFor(() => {
      const title = findElementByClass(remounted.root, 'subject-review__word-title')
      return title && collectText(title).includes(blockId)
    }, 'retrying the local read should restore the original active card')
    assert.equal(reviewStore.getLifecycleRound(subjectId)?.roundId, round.roundId)
    assert.equal(reviewStore.getLifecycleRound(subjectId)?.currentKnowledgeBlockId, blockId)
    assert.doesNotMatch(collectText(remounted.root), /本机知识块读取失败/)
  } finally {
    deferredRead.release()
    deferredRead.restore()
  }
})

test('voluntary pane shows the actual selected group size for the default and selected counts', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  for (const { candidateCount, selectedSize } of [
    { candidateCount: 7, selectedSize: 5 },
    { candidateCount: 12, selectedSize: 10 },
    { candidateCount: 3, selectedSize: 10 },
  ]) {
    const { authStore, reviewStore, pinia } = fixture('review-voluntary-count-' + candidateCount + '-' + Date.now())
    const subjectId = 'subject-voluntary-count-' + candidateCount + '-' + Date.now()
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const blocks = Array.from({ length: candidateCount }, (_, index) => {
      const id = 'kb-voluntary-count-' + candidateCount + '-' + index + '-' + Date.now()
      return { id, version: 1, state: stateView(id, future, 1) }
    })
    await seedLocalReviewSubject(authStore, reviewStore, subjectId, blocks)
    const { root } = await mountReviewPane(pinia, subjectId)
    await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId)
      && findButton(root, selectedSize + ' 个')
      && findButton(root, '自测复习'),
      'the unified group size and self-test entrance should be available after local state loads')
    await findButton(root, selectedSize + ' 个').props.onClick()
    await findButton(root, '自测复习').props.onClick()
    await settleVue()

    const expected = Math.min(selectedSize, candidateCount)
    const round = reviewStore.getLifecycleRound(subjectId)
    assert.ok(round)
    assert.equal(round.queue.length, expected)
    assert.equal(round.firstGroupCount, expected)
    assert.equal(round.currentKnowledgeBlockId, round.queue[0])
    assert.ok(round.queue.every((id) => blocks.some((block) => block.id === id)))
    assert.ok(findElementByClass(root, 'subject-review__word-title'), 'the actual first selected knowledge block should render')
    assert.match(collectText(root), new RegExp('本组 1 / ' + expected))
  }
})

test('real learning and review completion summaries report completed cards', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  {
    const { authStore, reviewStore, pinia } = fixture('review-real-completion-' + Date.now())
    const subjectId = 'subject-real-review-completion-' + Date.now()
    const blockId = 'kb-real-review-completion-' + Date.now()
    await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
      id: blockId, version: 1, state: stateView(blockId, new Date(Date.now() - 3600000).toISOString(), 1),
    }])
    const { root } = await mountReviewPane(pinia, subjectId)
    await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '进入复习'), 'the due review entry should load')
    await findButton(root, '进入复习').props.onClick()
    await settleVue()
    await findButton(root, '认识').props.onClick()
    await settleVue()
    await findButton(root, '下一个').props.onClick()
    await settleVue()
    assert.match(collectText(root), /本次共复习\s+1\s+个知识点/)
    await new Promise((resolve) => setTimeout(resolve, 650))
  }
  {
    const { authStore, reviewStore, pinia } = fixture('learning-real-completion-' + Date.now())
    const subjectId = 'subject-real-learning-completion-' + Date.now()
    const blockId = 'kb-real-learning-completion-' + Date.now()
    await seedLocalReviewSubject(authStore, reviewStore, subjectId, [{
      id: blockId, version: 1, state: stateView(blockId, new Date(Date.now() + 86400000).toISOString(), 1, { needsLearning: true }),
    }])
    const { root } = await mountReviewPane(pinia, subjectId)
    await waitFor(() => reviewStore.isSubjectStatesLoaded(subjectId) && findButton(root, '进入学习'), 'the learning entry should load')
    await findButton(root, '进入学习').props.onClick()
    await settleVue()
    await findButton(root, '开始回忆').props.onClick()
    await settleVue()
    await findButton(root, '展开核对').props.onClick()
    await settleVue()
    await findButton(root, '完成学习').props.onClick()
    await settleVue()
    assert.match(collectText(root), /本次共(?:学习|复习)\s+1\s+个知识点/)
    assert.match(collectText(root), /完成并返回/)
    assert.doesNotMatch(collectText(root), /本次共(?:学习|复习)\s+0\s+个知识点/)
    await new Promise((resolve) => setTimeout(resolve, 650))
  }
})

test('review-store HMR reloads the page and keeps formal review state and outbox on local storage', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false, locks: nativeLocks } })
  const userId = 'review-hmr-outbox-user-' + Date.now()
  const { authStore, reviewStore } = fixture(userId)
  const dueSubjectId = 'subject-hmr-due-' + Date.now()
  const dueBlockId = 'kb-hmr-due-' + Date.now()
  const due = await seedLocalReviewSubject(authStore, reviewStore, dueSubjectId, [{
    id: dueBlockId, version: 1, state: stateView(dueBlockId, new Date(Date.now() - 3600000).toISOString(), 1),
  }])
  await reviewStore.loadSubjectStates(dueSubjectId)
  assert.equal(reviewStore.isSubjectStatesLoaded(dueSubjectId), true, 'the local state must be loaded before testing HMR preservation')
  reviewStore.startLifecycleRound({ subjectId: dueSubjectId, knowledgeBlocks: [{ id: dueBlockId, version: 1 }], groupSize: 5 })
  await reviewStore.selectLifecycleRating(dueSubjectId, 'GOOD', due.contentHashes[dueBlockId])
  const pendingBefore = await inspectLocalReview(authStore, due.repository, dueBlockId)
  assert.equal(pendingBefore.pending.length, 1)
  const savedCommandId = pendingBefore.pending[0].clientCommandId

  const futureSubjectId = 'subject-hmr-future-' + Date.now()
  const futureBlockIds = Array.from({ length: 5 }, (_, index) => 'kb-hmr-future-' + index + '-' + Date.now())
  await seedLocalReviewSubject(authStore, reviewStore, futureSubjectId, futureBlockIds.map((id) => ({
    id, version: 1, state: stateView(id, new Date(Date.now() + 86400000).toISOString(), 1),
  })))

  const staleAction = () => undefined
  reviewStore.startLifecycleRound = staleAction
  assert.strictEqual(reviewStore.startLifecycleRound, staleAction)
  const storeSource = await readFile(new URL('../src/store/useReviewStore.ts', import.meta.url), 'utf8')
  assert.match(storeSource, /import\.meta\.hot\.accept\(\(\)\s*=>\s*\{[\s\S]*window\.location\.reload\(\)/)
  let acceptedCallback = null
  let reloadCount = 0
  const previousLocation = globalThis.window.location
  const generatedUrl = new URL('../src/store/.use-review-store-hmr-test-' + Date.now() + '.mjs', import.meta.url)
  globalThis.__reviewHot = { accept(callback) { acceptedCallback = callback } }
  globalThis.window.location = { reload() { reloadCount += 1 } }
  try {
    const instrumented = storeSource.replaceAll('import.meta.hot', 'globalThis.__reviewHot')
    const javascript = ts.transpileModule(instrumented, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    await writeFile(generatedUrl, javascript)
    await import(generatedUrl.href)
    assert.equal(typeof acceptedCallback, 'function')
    acceptedCallback({})
  } finally {
    delete globalThis.__reviewHot
    if (previousLocation === undefined) delete globalThis.window.location
    else globalThis.window.location = previousLocation
    await unlink(generatedUrl).catch(() => undefined)
  }

  assert.equal(reloadCount, 1, 'the registered HMR callback should replace a stale setup-store instance through a full page reload')
  assert.strictEqual(reviewStore.startLifecycleRound, staleAction, 'the old in-memory instance is retired by the reload')

  const fresh = fixture(userId)
  assert.notStrictEqual(fresh.reviewStore.startLifecycleRound, staleAction)
  await fresh.reviewStore.loadSubjectStates(dueSubjectId)
  assert.equal(fresh.reviewStore.isSubjectStatesLoaded(dueSubjectId), true)
  assert.equal(fresh.reviewStore.getLifecycleRound(dueSubjectId), null, 'temporary round state is recreated after reload')
  const pendingAfter = await inspectLocalReview(fresh.authStore, due.repository, dueBlockId)
  assert.deepEqual(pendingAfter.pending.map((intent) => intent.clientCommandId), [savedCommandId])
  assert.equal(pendingAfter.record.history.at(-1).clientCommandId, savedCommandId)

  await fresh.reviewStore.loadSubjectStates(futureSubjectId)
  const updatedRound = fresh.reviewStore.startLifecycleRound({
    subjectId: futureSubjectId,
    knowledgeBlocks: futureBlockIds.map((id) => ({ id, version: 1 })),
    groupSize: 5,
    manualMode: 'VOLUNTARY',
    manualBlockIds: futureBlockIds,
  })
  assert.equal(updatedRound.queue.length, 5)
  assert.ok(futureBlockIds.includes(updatedRound.currentKnowledgeBlockId))
  await new Promise((resolve) => setTimeout(resolve, 650))
})
