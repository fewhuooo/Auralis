import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

const storageValues = new Map()
const testStorage = {
  getItem: (key) => storageValues.get(String(key)) ?? null,
  setItem: (key, value) => storageValues.set(String(key), String(value)),
  removeItem: (key) => storageValues.delete(String(key)),
  key: (index) => [...storageValues.keys()][index] ?? null,
  get length() { return storageValues.size },
}
const windowListeners = new Map()
globalThis.window = {
  localStorage: testStorage,
  addEventListener(type, listener) {
    const listeners = windowListeners.get(type) ?? new Set()
    listeners.add(listener)
    windowListeners.set(type, listeners)
  },
  removeEventListener(type, listener) {
    windowListeners.get(type)?.delete(listener)
  },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) ?? []) listener.call(this, event)
    return true
  },
}
globalThis.localStorage = testStorage

function canonicalAnchor({ knowledgeBlockVersion, subjectId, contentHash, state = null, commands = [], effectiveReviews = [] }) {
  let canonicalState = state
  if (canonicalState) {
    const {
      canonicalVersion, persistedStatePresent, statePresenceKnown, historyImported,
      pendingReviewRating, pendingReviewSelectedAt, pendingReviewBaseline, ...serverState
    } = canonicalState
    canonicalState = serverState
  }
  return {
    knowledgeBlockVersion, subjectId, contentHash,
    state: canonicalState,
    commands: structuredClone(commands),
    effectiveReviews: structuredClone(effectiveReviews),
  }
}

async function waitForSignal(promise, label, timeoutMs = 5000) {
  let timeoutHandle
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timeoutHandle = setTimeout(() => reject(new Error(`${label} did not occur within ${timeoutMs}ms`)), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function seedUnknownCloudReviewFixture(suffix) {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { useStatsStore } = await import('../src/store/useStatsStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  await localDb.init()
  const userId = `unknown-cloud-review-${suffix}`
  const deviceId = `unknown-cloud-device-${suffix}`
  const subjectId = `unknown-cloud-subject-${suffix}`
  const block = {
    id: `unknown-cloud-kb-${suffix}`,
    subjectId,
    title: 'Offline first learning',
    content: 'Locally available body without imported ReviewState.',
    createdAt: '2026-10-09T00:00:00.000Z',
  }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Unknown cloud state' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 7, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: `${suffix}@example.test` },
    tokens: { accessToken: 'offline-access', refreshToken: 'offline-refresh' },
    sessionId: `unknown-cloud-session-${suffix}`,
    serverDeviceId: deviceId,
  })
  const store = useReviewStore()
  store.reconcileSubjectBlocks(subjectId, [block.id])
  const states = await store.loadSubjectStates(subjectId)
  return {
    createPinia, setActivePinia, useAuthStore, useReviewStore, useStatsStore,
    userId, deviceId, subjectId, block, repository, contentHash, store, states,
  }
}

async function completeUnknownCloudFirstLearning(fixture) {
  const { store, subjectId, block, contentHash } = fixture
  store.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: block.id, version: 7 }],
    groupSize: 5,
    now: new Date('2026-10-09T04:00:00.000Z'),
  })
  assert.equal(store.getLifecycleRound(subjectId).phase, 'LEARNING_READ')
  store.beginLifecycleRecall(subjectId)
  store.revealLifecycleAnswer(subjectId)
  const response = await store.completeLifecycleLearning(subjectId, contentHash)
  assert.equal(response.action, 'LEARNING_COMPLETED')
  return response
}

async function createUnknownCloudFollowupChain(fixture, rating) {
  const { store, subjectId, block, contentHash } = fixture
  const learned = await completeUnknownCloudFirstLearning(fixture)
  store.endLifecycleRound(subjectId, true)
  store.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: block.id, version: 7 }],
    groupSize: 5,
    now: new Date(Date.now() + 1000),
    manualMode: 'EARLY_PRACTICE',
    manualBlockIds: [block.id],
  })
  assert.equal(store.getLifecycleRound(subjectId).currentKnowledgeBlockId, block.id)
  const selected = await store.selectLifecycleRating(subjectId, rating, contentHash)
  const confirmed = await store.confirmLifecycleReview(subjectId, contentHash)
  assert.equal(confirmed.effectiveReview.reviewId, selected.effectiveReview.reviewId,
    'review confirmation must resolve the review selected by its predecessor')
  assert.equal(selected.action, 'REVIEW_SELECTED')
  assert.equal(confirmed.action, 'REVIEW_CONFIRMED')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const intents = await new ReviewRepository('localstorage', fixture.repository)
    .getPendingIntents(fixture.userId, fixture.deviceId, block.id)
  assert.equal(intents.length, 3)
  assert.deepEqual(intents.map(intent => intent.action), ['LEARNING_COMPLETED', 'REVIEW_SELECTED', 'REVIEW_CONFIRMED'])
  assert.ok(intents.every(intent => !intent.prepared && !intent.preparation.knownLocalCreate
    && intent.preparation.anchorFingerprint === null),
  'all three offline commands start without a canonical anchor or local CREATE proof')
  assert.deepEqual(intents.map(intent => intent.preparation.predecessorClientCommandIds.length), [0, 1, 2])
  return { learned, selected, confirmed, intents }
}

async function createUnknownCloudAgainRelearnChain(fixture) {
  const { store, subjectId, block, contentHash } = fixture
  const learned = await completeUnknownCloudFirstLearning(fixture)
  store.endLifecycleRound(subjectId, true)
  store.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: block.id, version: 7 }],
    groupSize: 5,
    now: new Date(Date.now() + 1000),
    manualMode: 'EARLY_PRACTICE',
    manualBlockIds: [block.id],
  })
  const again = await store.selectLifecycleRating(subjectId, 'AGAIN', contentHash)
  store.beginLifecycleRecall(subjectId)
  store.revealLifecycleAnswer(subjectId)
  const relearned = await store.completeLifecycleLearning(subjectId, contentHash)
  assert.equal(again.effectiveReview.resolution, 'AGAIN_SELECTED')
  assert.equal(relearned.action, 'LEARNING_COMPLETED')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const intents = await new ReviewRepository('localstorage', fixture.repository)
    .getPendingIntents(fixture.userId, fixture.deviceId, block.id)
  assert.equal(intents.length, 3)
  assert.deepEqual(intents.map(intent => intent.action), ['LEARNING_COMPLETED', 'REVIEW_SELECTED', 'LEARNING_COMPLETED'])
  assert.equal(intents[2].payload.reviewId, again.effectiveReview.reviewId,
    'the learning completion preserves the same optional reviewId in its immutable request')
  assert.ok(intents.every(intent => !intent.prepared && !intent.preparation.knownLocalCreate
    && intent.preparation.anchorFingerprint === null))
  return { learned, again, relearned, intents }
}

async function syncUnknownCloudFollowupChain(fixture, { injectExternalReviewBeforeSecondCommand = false } = {}) {
  const { userId, deviceId, block, repository, contentHash } = fixture
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const { ReviewLifecycleEngine } = await import('../src/services/reviewLifecycleEngine.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
    selectReview: useReviewApi.selectReview,
    confirmReview: useReviewApi.confirmReview,
  }
  const server = { state: null, commands: [], effectiveReviews: [] }
  const posts = []
  let historyReads = 0

  function appendCommand(response, request, action) {
    server.state = response.state
    server.commands.push({
      commandId: response.commandId,
      clientCommandId: response.clientCommandId,
      action,
      occurredAt: response.occurredAt,
      reviewId: request.reviewId ?? response.effectiveReview?.reviewId ?? null,
      rating: action === 'REVIEW_CONFIRMED' ? response.effectiveReview.selectedRating : request.rating ?? null,
      durationSeconds: request.durationSeconds ?? null,
      baseVersion: request.baseVersion,
      knowledgeBlockVersion: request.knowledgeBlockVersion,
    })
    if (response.effectiveReview) {
      const index = server.effectiveReviews.findIndex(item => item.reviewId === response.effectiveReview.reviewId)
      if (index >= 0) server.effectiveReviews[index] = response.effectiveReview
      else server.effectiveReviews.push(response.effectiveReview)
    }
    return response
  }

  function applyServerCommand(request, action, reviewId = null) {
    posts.push({ action, ...structuredClone(request), ...(reviewId ? { reviewId } : {}) })
    assert.equal(request.expectedStateAbsent, server.state === null,
      'each frozen request preserves the server state presence at its own acknowledged prefix')
    assert.equal(request.baseVersion, server.state?.version ?? 0,
      'each successor uses the actual version returned by its immediately preceding ACK')
    const previousReview = reviewId
      ? server.effectiveReviews.find(item => item.reviewId === reviewId)
      : null
    const response = ReviewLifecycleEngine.processCommand(
      server.state,
      block.id,
      action,
      request.rating ?? null,
      request.occurredAt,
      request.clientCommandId,
      request.baseVersion,
      request.knowledgeBlockVersion,
      request.contentHash,
      previousReview ? {
        reviewId,
        selectedRating: previousReview.selectedRating,
        selectedAt: previousReview.selectedAt,
        schedulingBaseline: previousReview.schedulingBaseline,
        previousEffectiveReview: previousReview,
      } : (reviewId ? { reviewId } : {}),
    )
    return appendCommand(response, { ...request, reviewId }, action)
  }

  function injectExternalReview() {
    const occurredAt = new Date(Date.now() + 10_000).toISOString()
    const request = {
      clientCommandId: 'external-device-review-command',
      knowledgeBlockId: block.id,
      knowledgeBlockVersion: 7,
      baseVersion: server.state.version,
      expectedStateAbsent: false,
      contentHash,
      occurredAt,
      reviewId: 'external-device-review-id',
      rating: 'GOOD',
    }
    appendCommand(ReviewLifecycleEngine.processCommand(
      server.state,
      block.id,
      'REVIEW_SELECTED',
      'GOOD',
      occurredAt,
      request.clientCommandId,
      request.baseVersion,
      request.knowledgeBlockVersion,
      request.contentHash,
      { reviewId: request.reviewId },
    ), request, 'REVIEW_SELECTED')
  }

  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => {
    historyReads += 1
    if (injectExternalReviewBeforeSecondCommand && historyReads === 2) injectExternalReview()
    return {
      knowledgeBlockId,
      knowledgeBlockVersion: 7,
      protocolVersion: 2,
      state: server.state ? structuredClone(server.state) : null,
      commands: structuredClone(server.commands),
      effectiveReviews: structuredClone(server.effectiveReviews),
    }
  }
  useReviewApi.completeLearning = async request => applyServerCommand(request, 'LEARNING_COMPLETED', request.reviewId ?? null)
  useReviewApi.selectReview = async request => applyServerCommand(request, 'REVIEW_SELECTED', request.reviewId)
  useReviewApi.confirmReview = async (reviewId, request) => applyServerCommand(request, 'REVIEW_CONFIRMED', reviewId)
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    return { result, posts, server, historyReads }
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
    useReviewApi.selectReview = originals.selectReview
    useReviewApi.confirmReview = originals.confirmReview
  }
}

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
    && context.parentURL && !/\\.(?:ts|js|mjs)$/.test(specifier)) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

test('cold offline subject review state reads from local storage without HTTP', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const { useStatsApi } = await import('../src/api/useStatsApi.ts')
  const { useStatsStore } = await import('../src/store/useStatsStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')

  await localDb.init()
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: 'offline-user', email: 'offline@example.test' },
    tokens: { accessToken: 'expired-offline-access', refreshToken: 'offline-refresh' },
    sessionId: 'offline-session',
    serverDeviceId: 'offline-device',
  })

  const subject = { id: 'subject-offline', name: 'Offline subject', createdAt: '2026-10-08T12:00:00.000Z' }
  const block = {
    id: 'kb-offline-1', subjectId: 'subject-offline', version: 3,
    content: 'Exact local content for offline review.', title: 'Local block', createdAt: '2026-10-08T12:00:00.000Z',
  }
  const repository = await getLocalRepository('offline-user', 'offline-device')
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: block, version: 3, deletedAt: null,
    mutation: {
      clientMutationId: 'offline-kb-create', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
      mutationType: 'CREATE', baseVersion: 0, payload: block,
    },
  })

  let requests = 0
  const original = useReviewApi.getSubjectStates
  const originalStats = useStatsApi.getSubjectStats
  let statsRequests = 0
  useReviewApi.getSubjectStates = async () => {
    requests += 1
    throw new Error('network unavailable')
  }
  useStatsApi.getSubjectStats = async () => {
    statsRequests += 1
    throw new Error('network unavailable')
  }
  try {
    const store = useReviewStore()
    const states = await store.loadSubjectStates('subject-offline')
    assert.equal(requests, 0, 'subject-state display must not require a server request')
    assert.deepEqual(states.map((state) => state.knowledgeBlockId), [block.id])
    assert.equal(states[0].needsLearning, true)
    assert.equal(states[0].persistedStatePresent, false)
    assert.equal(states[0].statePresenceKnown, true,
      'an explicitly local CREATE makes absent remote state a known starting point')
    const stats = await useStatsStore().loadSubjectStats(subject.id, { days: 7, timeZone: 'UTC' })
    assert.equal(statsRequests, 0, 'subject statistics must not require a server request')
    assert.equal(stats.overview.activeKnowledgeBlockCount, 1)
    assert.equal(stats.overview.pendingLearningCount, 1)
    assert.equal(stats.daily.length, 7)

    const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(block.content),
    )), (value) => value.toString(16).padStart(2, '0')).join('')
    const occurredAt = '2026-10-09T03:00:00.123456Z'
    const selected = await new LocalReviewService('localstorage', repository).executeCommand(
      'offline-user', 'offline-device', block.id, 'offline-selected-1', 'REVIEW_SELECTED', 'GOOD',
      occurredAt, 0, contentHash, {
        clientCommandId: 'offline-selected-1', knowledgeBlockId: block.id, knowledgeBlockVersion: 3,
        baseVersion: 0, contentHash, occurredAt, expectedStateAbsent: true, rating: 'GOOD', reviewId: 'offline-selected-review',
      },
    )
    assert.equal(selected.state.pendingReviewId, selected.effectiveReview.reviewId)
    const restartedService = new LocalReviewService('localstorage', repository)
    const persisted = (await restartedService.getSubjectStates('offline-user', 'offline-device', subject.id)).items[0]
    assert.equal(persisted.pendingReviewId, selected.effectiveReview.reviewId)
    assert.equal(persisted.pendingReviewRating, 'GOOD')
    assert.ok(persisted.pendingReviewBaseline)
    assert.equal((await new ReviewRepository('localstorage', repository).getPendingIntents(
      'offline-user', 'offline-device', block.id,
    )).length, 1, 'selected review and immutable outbox intent survive service restart')

    const restartedPinia = createPinia()
    setActivePinia(restartedPinia)
    const restartedAuth = useAuthStore()
    restartedAuth.setSession({
      user: { id: 'offline-user', email: 'offline@example.test' },
      tokens: { accessToken: 'expired-offline-access', refreshToken: 'offline-refresh' },
      sessionId: 'offline-session-restart',
      serverDeviceId: 'offline-device',
    })
    const restartedStore = useReviewStore()
    restartedStore.reconcileSubjectBlocks(subject.id, [block.id])
    await restartedStore.loadSubjectStates(subject.id)
    const resumed = restartedStore.startLifecycleRound({
      subjectId: subject.id,
      knowledgeBlocks: [{ id: block.id, version: 3 }],
      groupSize: 5,
      now: new Date('2026-10-09T03:01:00.000Z'),
    })
    assert.equal(resumed.currentReviewId, selected.effectiveReview.reviewId)
    assert.equal(resumed.currentRating, 'GOOD')
    assert.equal(resumed.phase, 'REVIEW_CHECK')
  } finally {
    useReviewApi.getSubjectStates = original
    useStatsApi.getSubjectStats = originalStats
  }
})

test('an unknown remote state allows local first learning and binds to an empty protocol-v2 history after restart', async () => {
  const fixture = await seedUnknownCloudReviewFixture('empty-remote')
  const { userId, deviceId, subjectId, block, repository, store, states, contentHash,
    createPinia, setActivePinia, useAuthStore, useReviewStore, useStatsStore } = fixture
  assert.equal(states[0].persistedStatePresent, false)
  assert.equal(states[0].statePresenceKnown, false,
    'the local projection must preserve unknown cloud presence instead of claiming history was imported')
  const stats = await useStatsStore().loadSubjectStats(subjectId, { days: 7, timeZone: 'UTC' })
  assert.equal(stats.historyCoverage, 'INCOMPLETE')
  assert.equal(stats.overview.pendingLearningCount, 1)
  assert.equal(stats.overview.newLearningCount, 0,
    'an unknown server history is pending learning but is not asserted as new')

  store.subjectStatesBySubjectId[subjectId][0].lastReviewId = 'stale-review-id'
  const response = await completeUnknownCloudFirstLearning(fixture)
  assert.equal(store.subjectStatesBySubjectId[subjectId][0].lastReviewId, null,
    'first learning clears an explicitly null lastReviewId from the prior cached projection')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const persisted = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
  assert.equal(persisted.state.needsLearning, false)
  assert.equal(persisted.historyImported, false,
    'local learning must not mark unknown server history as imported')
  const savedIntent = await reviewRepository.getPendingIntents(userId, deviceId, block.id)
  assert.equal(savedIntent.length, 1)
  assert.equal(savedIntent[0].payload.expectedStateAbsent, true)
  assert.equal(savedIntent[0].payload.baseVersion, 0)

  setActivePinia(createPinia())
  const restartedAuth = useAuthStore()
  restartedAuth.setSession({
    user: { id: userId, email: 'empty-remote@example.test' },
    tokens: { accessToken: 'expired-after-restart', refreshToken: 'offline-refresh' },
    sessionId: 'unknown-cloud-empty-remote-restarted',
    serverDeviceId: deviceId,
  })
  const restartedStore = useReviewStore()
  restartedStore.reconcileSubjectBlocks(subjectId, [block.id])
  const restartedStates = await restartedStore.loadSubjectStates(subjectId)
  assert.equal(restartedStore.getLifecycleRound(subjectId), null,
    'the transient round is not restored after restart')
  assert.equal(restartedStates[0].needsLearning, false)
  assert.equal(restartedStates[0].persistedStatePresent, true,
    'the local formal projection remains available after restart')
  assert.equal(restartedStates[0].historyImported, false)
  assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, block.id)).length, 1,
    'the local outbox survives restart until a canonical server receipt arrives')

  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
  }
  const apiCalls = []
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => {
    apiCalls.push(['lifecycle', knowledgeBlockId])
    return { knowledgeBlockId, knowledgeBlockVersion: 7, protocolVersion: 2, state: null, commands: [], effectiveReviews: [] }
  }
  useReviewApi.completeLearning = async request => {
    apiCalls.push(['post', request.knowledgeBlockId])
    assert.equal(request.expectedStateAbsent, true)
    assert.equal(request.baseVersion, 0)
    assert.equal(request.contentHash, contentHash)
    return {
      ...response,
      commandId: 'server-unknown-first-learning',
      clientCommandId: request.clientCommandId,
      action: 'LEARNING_COMPLETED',
      occurredAt: request.occurredAt,
      knowledgeBlockVersion: request.knowledgeBlockVersion,
      state: { ...response.state, version: 0, knowledgeBlockVersion: request.knowledgeBlockVersion },
    }
  }
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.deepEqual(apiCalls.map(([kind]) => kind), ['lifecycle', 'post'],
      'the lifecycle history is checked before freezing and posting the first command')
    assert.equal(result.syncedCommandCount, 1)
    assert.equal(result.conflictCount, 0)
    assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, block.id)).length, 0)
    const acknowledged = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(acknowledged.canonicalAnchor.state.version, 0,
      'the first accepted remote state uses the real server version zero')
    assert.deepEqual(acknowledged.canonicalAnchor.commands.map(command => command.clientCommandId), [savedIntent[0].clientCommandId])
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})

test('an unknown remote state conflicts without POST when protocol-v2 reports a persisted version-zero state', async () => {
  const fixture = await seedUnknownCloudReviewFixture('present-remote-v0')
  const { userId, deviceId, block, repository } = fixture
  await completeUnknownCloudFirstLearning(fixture)
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const before = await reviewRepository.getPendingIntents(userId, deviceId, block.id)
  assert.equal(before.length, 1)
  const localState = (await reviewRepository.getReviewRecord(userId, deviceId, block.id)).state
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
  }
  let postCount = 0
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId,
    knowledgeBlockVersion: 7,
    protocolVersion: 2,
    state: { ...localState, version: 0, knowledgeBlockVersion: 7 },
    commands: [],
    effectiveReviews: [],
  })
  useReviewApi.completeLearning = async () => { postCount += 1; throw new Error('a state-presence conflict must stop before POST') }
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 0)
    assert.equal(result.conflictCount, 1)
    assert.equal(postCount, 0, 'an unknown client never overwrites an existing remote version-zero ReviewState')
    const after = await reviewRepository.getIntent('localstorage', userId, deviceId, before[0].clientCommandId)
    assert.equal(after.status, 'conflict')
    assert.equal(after.prepared, false)
    assert.equal(after.payload.expectedStateAbsent, true)
    assert.equal(after.payload.baseVersion, 0,
      'remote presence must not be silently rebased into the unknown local intent')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})

test('an unknown absent history syncs its own learning, early GOOD, and early HARD successors by ACK prefix', async () => {
  for (const rating of ['GOOD', 'HARD']) {
    const fixture = await seedUnknownCloudReviewFixture(`ack-prefix-${rating.toLowerCase()}`)
    const chain = await createUnknownCloudFollowupChain(fixture, rating)
    const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
    const reviewRepository = new ReviewRepository('localstorage', fixture.repository)
    const { result, posts, server } = await syncUnknownCloudFollowupChain(fixture)

    assert.equal(result.syncedCommandCount, 3, `${rating} chain receives three independent canonical ACKs`)
    assert.equal(result.conflictCount, 0)
    assert.deepEqual(posts.map(post => post.action), ['LEARNING_COMPLETED', 'REVIEW_SELECTED', 'REVIEW_CONFIRMED'])
    assert.deepEqual(posts.map(post => [post.baseVersion, post.expectedStateAbsent]), [[0, true], [0, false], [1, false]])
    assert.deepEqual(posts.map(post => post.clientCommandId), chain.intents.map(intent => intent.clientCommandId))
    assert.deepEqual(posts.slice(1).map(post => post.reviewId), [chain.selected.effectiveReview.reviewId, chain.selected.effectiveReview.reviewId],
      'the initial rating and its confirmation retain the same frozen reviewId over HTTP')
    assert.deepEqual(server.commands.map(command => command.clientCommandId), chain.intents.map(intent => intent.clientCommandId))
    assert.equal(server.state.version, 2)
    assert.equal(server.state.pendingReviewId, null)
    assert.equal(server.effectiveReviews[0].selectedRating, rating)
    assert.equal(server.effectiveReviews[0].resolution, 'CONFIRMED')
    assert.equal((await reviewRepository.getPendingIntents(fixture.userId, fixture.deviceId, fixture.block.id)).length, 0)
    const acknowledged = await reviewRepository.getReviewRecord(fixture.userId, fixture.deviceId, fixture.block.id)
    assert.deepEqual(acknowledged.canonicalAnchor.commands.map(command => command.clientCommandId),
      chain.intents.map(intent => intent.clientCommandId))
    assert.deepEqual(acknowledged.canonicalAnchor.commands, server.commands,
      'confirmation ACK has the same rating as lifecycle history even when the request has no rating')
  }
})

test('an unknown absent history can learn again after an ACKed early AGAIN selection', async () => {
  const fixture = await seedUnknownCloudReviewFixture('again-relearn-ack-prefix')
  const chain = await createUnknownCloudAgainRelearnChain(fixture)
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const reviewRepository = new ReviewRepository('localstorage', fixture.repository)
  const { result, posts, server } = await syncUnknownCloudFollowupChain(fixture)

  assert.equal(result.syncedCommandCount, 3)
  assert.equal(result.conflictCount, 0)
  assert.deepEqual(posts.map(post => post.action), ['LEARNING_COMPLETED', 'REVIEW_SELECTED', 'LEARNING_COMPLETED'])
  assert.deepEqual(posts.map(post => [post.baseVersion, post.expectedStateAbsent]), [[0, true], [0, false], [1, false]])
  assert.equal(posts[1].reviewId, chain.again.effectiveReview.reviewId)
  assert.equal(posts[2].reviewId, chain.again.effectiveReview.reviewId,
    'the server receives the acknowledged AGAIN reviewId on the later learning request')
  assert.deepEqual(server.commands.map(command => command.clientCommandId), chain.intents.map(intent => intent.clientCommandId))
  assert.equal(server.state.needsLearning, false)
  assert.equal(server.effectiveReviews[0].resolution, 'AGAIN_SELECTED')
  assert.equal((await reviewRepository.getPendingIntents(fixture.userId, fixture.deviceId, fixture.block.id)).length, 0)
})

test('an external lifecycle event after the unknown first ACK conflicts the successor without rebasing it', async () => {
  const fixture = await seedUnknownCloudReviewFixture('external-after-unknown-ack')
  const chain = await createUnknownCloudFollowupChain(fixture, 'GOOD')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const reviewRepository = new ReviewRepository('localstorage', fixture.repository)
  const { result, posts, server } = await syncUnknownCloudFollowupChain(fixture, {
    injectExternalReviewBeforeSecondCommand: true,
  })

  assert.equal(result.syncedCommandCount, 1, 'only the first absent-state learning command was accepted')
  assert.equal(result.conflictCount, 1, 'the first successor is surfaced as a real canonical conflict')
  assert.deepEqual(posts.map(post => post.clientCommandId), [chain.intents[0].clientCommandId],
    'neither successor is posted against the external device state')
  assert.equal(server.commands.length, 2)
  assert.equal(server.commands[1].clientCommandId, 'external-device-review-command')
  const intents = await reviewRepository.getUnresolvedIntents(fixture.userId, fixture.deviceId, [fixture.block.id])
  assert.equal(intents.find(intent => intent.clientCommandId === chain.intents[1].clientCommandId)?.status, 'conflict')
  assert.equal(intents.find(intent => intent.clientCommandId === chain.intents[2].clientCommandId)?.status, 'pending',
    'FIFO stops behind the first unacknowledged successor and retains the later confirmation')
  assert.equal(intents.find(intent => intent.clientCommandId === chain.intents[1].clientCommandId)?.prepared, false,
    'external history is never frozen as a new base for the offline command')
})

test('a persisted version-zero ReviewState is sent as present while an absent state is explicit', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'review-state-presence-user'
  const deviceId = 'review-state-presence-device'
  const subjectId = 'review-state-presence-subject'
  const block = { id: 'review-state-presence-kb', subjectId, content: 'state v0 body', title: 'State v0' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Presence subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 4, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  await new ReviewRepository('localstorage', repository).saveReviewRecord('localstorage', userId, deviceId, {
    knowledgeBlockId: block.id, subjectId, localRevision: 1, serverKnowledgeBlockVersion: 4, contentHash,
    state: {
      knowledgeBlockId: block.id, dueAt: '2026-10-08T00:00:00.000Z', version: 0, knowledgeBlockVersion: 4,
      needsLearning: false, mastered: true, stableSuccessCount: 3, nextReviewStage: null,
      lastPracticeAt: null, lastReviewId: null, pendingReviewId: null, contentHash, canonicalVersion: 0,
    },
    history: [], effectiveReviews: [],
    historyImported: true, isPresenceMarker: false, canonicalAnchor: null, updatedAt: '2026-10-09T00:00:00.000Z',
  })

  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: 'presence@example.test' },
    tokens: { accessToken: 'presence-access', refreshToken: 'presence-refresh' },
    sessionId: 'presence-session', serverDeviceId: deviceId,
  })
  const store = useReviewStore()
  store.reconcileSubjectBlocks(subjectId, [block.id])
  await store.loadSubjectStates(subjectId)
  assert.equal(store.subjectStatesBySubjectId[subjectId][0].persistedStatePresent, true)
  assert.equal(store.subjectStatesBySubjectId[subjectId][0].statePresenceKnown, true)
  store.subjectStatesBySubjectId[subjectId][0].nextReviewStage = 'EARLY_RECALL'
  store.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: block.id, version: 4 }], groupSize: 5,
    now: new Date('2026-10-09T12:00:00.000Z'), manualMode: 'MASTERED_REVIEW', manualBlockIds: [block.id] })
  await store.selectLifecycleRating(subjectId, 'GOOD', contentHash)
  assert.equal(store.subjectStatesBySubjectId[subjectId][0].nextReviewStage, null,
    'a mastered state with no review stage clears a stale stage value from the cache')
  const pending = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].payload.expectedStateAbsent, false,
    'version zero with a persisted state is distinct from a missing ReviewState')
})

test('the first absent-state receipt stays at server version zero and the next command expects presence', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'first-review-state-user'
  const deviceId = 'first-review-state-device'
  const subjectId = 'first-review-state-subject'
  const block = { id: 'first-review-state-kb', subjectId, content: 'first state body', title: 'First state' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'First state' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 3, syncStatus: 'synced' })
  const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const service = new LocalReviewService('localstorage', repository)
  const firstAt = '2026-10-09T06:30:00.000000Z'
  const first = await service.executeCommand(userId, deviceId, block.id, 'first-absent-command', 'LEARNING_COMPLETED', null,
    firstAt, 0, hash, {
      clientCommandId: 'first-absent-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 3,
      baseVersion: 0, contentHash: hash, occurredAt: firstAt, expectedStateAbsent: true,
    })
  assert.equal(first.state.version, 0, 'a newly inserted @Version state has the actual first server version zero')

  const secondAt = '2026-10-09T06:31:00.000000Z'
  const second = await service.executeCommand(userId, deviceId, block.id, 'first-present-command', 'REVIEW_SELECTED', 'GOOD',
    secondAt, 0, hash, {
      clientCommandId: 'first-present-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 3,
      baseVersion: 0, contentHash: hash, occurredAt: secondAt, expectedStateAbsent: false, rating: 'GOOD', reviewId: 'first-present-review',
    })
  assert.equal(second.state.version, 1, 'the first update to the existing version-zero row increments it')
  const intents = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)
  assert.deepEqual(intents.map(intent => [intent.payload.baseVersion, intent.payload.expectedStateAbsent]), [[0, true], [0, false]])
})

test('known-absent history stays absent after a body update or parent move until the first learning ACK', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'known-absent-edit-user'
  const deviceId = 'known-absent-edit-device'
  const subjectA = { id: 'known-absent-subject-a', name: 'Absent A' }
  const subjectB = { id: 'known-absent-subject-b', name: 'Absent B' }
  const bodyBlock = { id: 'known-absent-body-kb', subjectId: subjectA.id, content: 'body before edit', title: 'Body edit' }
  const moveBlock = { id: 'known-absent-move-kb', subjectId: subjectA.id, content: 'body stays same', title: 'Parent move' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectA.id, subjectA, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SUBJECT', subjectB.id, subjectB, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', bodyBlock.id, bodyBlock, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', moveBlock.id, moveBlock, { version: 1, syncStatus: 'synced' })
  const reviewService = new LocalReviewService('localstorage', repository)
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const hashContent = async content => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  for (const block of [bodyBlock, moveBlock]) {
    assert.equal(await reviewService.importLifecycleHistory(userId, deviceId, block.id, {
      knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
      state: null, commands: [], effectiveReviews: [],
    }, []), true)
  }

  const bodyAfterEdit = { ...bodyBlock, content: 'body after edit' }
  await repository.upsert('KNOWLEDGE_BLOCK', bodyBlock.id, bodyAfterEdit, { version: 2, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', moveBlock.id, { ...moveBlock, subjectId: subjectB.id }, { version: 2, syncStatus: 'synced' })
  const bodyProjection = (await reviewService.getSubjectStates(userId, deviceId, subjectA.id)).items.find(item => item.knowledgeBlockId === bodyBlock.id)
  const moveProjection = (await reviewService.getSubjectStates(userId, deviceId, subjectB.id)).items.find(item => item.knowledgeBlockId === moveBlock.id)
  assert.equal(bodyProjection.persistedStatePresent, false)
  assert.equal(moveProjection.persistedStatePresent, false)
  assert.equal((await reviewRepository.getReviewRecord(userId, deviceId, bodyBlock.id)).state, null,
    'a body edit does not materialize a server-absent state in persistent storage')
  assert.equal((await reviewRepository.getReviewRecord(userId, deviceId, moveBlock.id)).state, null,
    'a pure move does not materialize a server-absent state in persistent storage')

  const requests = new Map()
  const bodyRequestAt = '2026-10-09T06:20:00.000000Z'
  const moveRequestAt = '2026-10-09T06:21:00.000000Z'
  requests.set(bodyBlock.id, await reviewService.executeCommand(userId, deviceId, bodyBlock.id, 'known-absent-body-learning',
    'LEARNING_COMPLETED', null, bodyRequestAt, 0, await hashContent(bodyAfterEdit.content), {
      clientCommandId: 'known-absent-body-learning', knowledgeBlockId: bodyBlock.id, knowledgeBlockVersion: 2,
      baseVersion: 0, contentHash: await hashContent(bodyAfterEdit.content), occurredAt: bodyRequestAt, expectedStateAbsent: true,
    }, subjectA.id))
  requests.set(moveBlock.id, await reviewService.executeCommand(userId, deviceId, moveBlock.id, 'known-absent-move-learning',
    'LEARNING_COMPLETED', null, moveRequestAt, 0, await hashContent(moveBlock.content), {
      clientCommandId: 'known-absent-move-learning', knowledgeBlockId: moveBlock.id, knowledgeBlockVersion: 2,
      baseVersion: 0, contentHash: await hashContent(moveBlock.content), occurredAt: moveRequestAt, expectedStateAbsent: true,
    }, subjectB.id))
  const intents = [bodyBlock, moveBlock].map(block => requests.get(block.id))
  assert.deepEqual(intents.map(response => [response.state.version, response.state.needsLearning]), [[0, false], [0, false]])

  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
  }
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId, knowledgeBlockVersion: 2, protocolVersion: 2, state: null, commands: [], effectiveReviews: [],
  })
  useReviewApi.completeLearning = async request => {
    assert.equal(request.expectedStateAbsent, true, 'both transitions send the explicit absent-state guard')
    assert.equal(request.baseVersion, 0)
    const response = requests.get(request.knowledgeBlockId)
    return { ...response, commandId: `server-${request.clientCommandId}`, clientCommandId: request.clientCommandId }
  }
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 2)
    assert.equal(result.conflictCount, 0)
    for (const block of [bodyBlock, moveBlock]) {
      const record = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
      assert.equal(record.state.version, 0, 'the actual first @Version insert receipt remains version zero')
      assert.equal(record.state.needsLearning, false)
      assert.equal(record.state.dueAt, block.id === bodyBlock.id ? '2026-10-12T06:20:00.000000Z' : '2026-10-12T06:21:00.000000Z',
        'first learning completion keeps the normal three-day schedule')
      assert.equal(await reviewRepository.getPendingIntents(userId, deviceId, block.id).then(items => items.length), 0)
    }
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})

test('an existing version-zero ReviewState binds first learning to the actual post-invalidation version', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { runSyncCycle } = await import('../src/services/syncCycle.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'existing-state-body-edit-user'
  const deviceId = 'existing-state-body-edit-device'
  const subjectId = 'existing-state-body-edit-subject'
  const block = { id: 'existing-state-body-edit-kb', subjectId, content: 'before update', title: 'Existing state' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Existing state' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const hashContent = async content => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const oldHash = await hashContent(block.content)
  const anchorState = {
    knowledgeBlockId: block.id, dueAt: '2026-10-01T00:00:00.000000Z', version: 0, knowledgeBlockVersion: 1,
    needsLearning: false, mastered: false, stableSuccessCount: 0, nextReviewStage: 'CROSS_DAY',
    lastPracticeAt: '2026-10-01T00:00:00.000000Z', lastReviewId: null, pendingReviewId: null,
    contentHash: oldHash, parameterSetId: 'default', createdAt: '2026-09-01T00:00:00.000Z',
    reps: 2, lapses: 0, difficulty: 5, stability: 4,
  }
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const service = new LocalReviewService('localstorage', repository)
  assert.equal(await service.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: anchorState, commands: [], effectiveReviews: [],
  }, []), true)

  const updatedBlock = { ...block, content: 'after update' }
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: updatedBlock, version: 2, deletedAt: null,
    expectedLocalVersion: 1,
    mutation: { clientMutationId: 'existing-state-body-core-update', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
      mutationType: 'UPDATE', baseVersion: 1, payload: updatedBlock },
  })
  const updatedState = (await service.getSubjectStates(userId, deviceId, subjectId)).items[0]
  assert.equal(updatedState.version, 0, 'the offline body invalidation must not predict a server @Version increment')
  assert.equal(updatedState.persistedStatePresent, true)
  assert.equal(updatedState.needsLearning, true)
  const occurredAt = '2026-10-09T06:22:00.000000Z'
  const updatedHash = await hashContent(updatedBlock.content)
  const learning = await service.executeCommand(userId, deviceId, block.id, 'existing-state-learning', 'LEARNING_COMPLETED', null,
    occurredAt, 0, updatedHash, {
      clientCommandId: 'existing-state-learning', knowledgeBlockId: block.id, knowledgeBlockVersion: 2,
      baseVersion: 0, contentHash: updatedHash, occurredAt, expectedStateAbsent: false,
    }, subjectId)
  assert.equal(learning.state.version, 1, 'the local optimistic revision is separate from the canonical server version')

  await repository.saveCursor('existing-state-body-before-core-ack', false)
  await runSyncCycle({
    repository,
    serverDeviceId: deviceId,
    api: {
      async pushChanges({ mutations }) {
        assert.equal(mutations.length, 1)
        assert.equal(mutations[0].clientMutationId, 'existing-state-body-core-update')
        return { results: [{
          clientMutationId: 'existing-state-body-core-update', decision: 'APPLIED',
          resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, mutationType: 'UPDATE',
          current: { ...updatedBlock, version: 9 },
        }], serverCursor: 'existing-state-body-after-core-ack' }
      },
      async pullChanges({ cursor }) {
        assert.equal(cursor, 'existing-state-body-before-core-ack')
        return { changes: [], nextCursor: cursor, hasMore: false, resetRequired: false }
      },
      async getSnapshot() { assert.fail('the core ACK test starts with a current sync cursor') },
    },
  })
  assert.equal((await repository.read('KNOWLEDGE_BLOCK', block.id)).version, 9,
    'the core ACK can advance the KB by more than one version')

  const originals = { getLifecycleHistory: useReviewApi.getLifecycleHistory, completeLearning: useReviewApi.completeLearning }
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId, knowledgeBlockVersion: 9, protocolVersion: 2,
    state: {
      ...anchorState, version: 6, knowledgeBlockVersion: 9, contentHash: updatedHash,
      needsLearning: true, mastered: false, stableSuccessCount: 0, nextReviewStage: 'EARLY_RECALL',
      lastReviewId: null, pendingReviewId: null,
    }, commands: [], effectiveReviews: [],
  })
  useReviewApi.completeLearning = async request => {
    assert.equal(request.expectedStateAbsent, false)
    assert.equal(request.baseVersion, 6,
      'preparation reads the actual version after server content invalidation instead of predicting +1')
    assert.equal(request.knowledgeBlockVersion, 9)
    return {
      ...learning, commandId: 'server-existing-state-learning', clientCommandId: request.clientCommandId,
      knowledgeBlockVersion: 9,
      state: { ...learning.state, version: 7, knowledgeBlockVersion: 9, contentHash: updatedHash },
    }
  }
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 1)
    assert.equal(result.conflictCount, 0)
    assert.equal(await reviewRepository.getPendingIntents(userId, deviceId, block.id).then(items => items.length), 0)
    const record = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(record.state.version, 7)
    assert.equal(record.state.canonicalVersion, 7)
    assert.equal(record.canonicalAnchor.knowledgeBlockVersion, 9)
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})

test('a stale subject round cannot commit after its KB moves to another active subject', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'subject-round-move-user'
  const deviceId = 'subject-round-move-device'
  const subjectA = { id: 'subject-round-move-a', name: 'Subject A' }
  const subjectB = { id: 'subject-round-move-b', name: 'Subject B' }
  const block = { id: 'subject-round-move-kb', subjectId: subjectA.id, content: 'unchanged moving body', title: 'Moving block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectA.id, subjectA, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SUBJECT', subjectB.id, subjectB, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  await new ReviewRepository('localstorage', repository).saveReviewRecord('localstorage', userId, deviceId, {
    knowledgeBlockId: block.id, subjectId: subjectA.id, localRevision: 1, serverKnowledgeBlockVersion: 1, contentHash: hash,
    state: {
      knowledgeBlockId: block.id, dueAt: '2026-10-08T00:00:00.000Z', version: 0, knowledgeBlockVersion: 1,
      needsLearning: false, mastered: false, stableSuccessCount: 0, nextReviewStage: 'CROSS_DAY',
      lastPracticeAt: null, lastReviewId: null, pendingReviewId: null, contentHash: hash, canonicalVersion: 0,
    },
    history: [], effectiveReviews: [],
    historyImported: true, isPresenceMarker: false, canonicalAnchor: null, updatedAt: '2026-10-09T00:00:00.000Z',
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: 'move@example.test' },
    tokens: { accessToken: 'move-access', refreshToken: 'move-refresh' },
    sessionId: 'move-session', serverDeviceId: deviceId,
  })
  const store = useReviewStore()
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  store.reconcileSubjectBlocks(subjectA.id, [block.id])
  await store.loadSubjectStates(subjectA.id)
  store.startLifecycleRound({ subjectId: subjectA.id, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5 })

  await repository.upsert('KNOWLEDGE_BLOCK', block.id, { ...block, subjectId: subjectB.id }, { version: 1, syncStatus: 'synced' })
  await assert.rejects(store.selectLifecycleRating(subjectA.id, 'GOOD', hash), /409 RESOURCE_VERSION_CONFLICT/)
  assert.equal(store.lifecycleRoundsBySubjectId[subjectA.id].conflictNeedsConfirmation, true,
    'a real local parent-scope transaction conflict must enter the explicit reconfirmation state')
  const originalGetHistory = useReviewApi.getLifecycleHistory
  let remoteHistoryCalls = 0
  useReviewApi.getLifecycleHistory = async () => {
    remoteHistoryCalls += 1
    throw new Error('local reconfirmation must not call the remote lifecycle history API')
  }
  try {
    await store.reconfirmLifecyclePending(subjectA.id)
  } finally {
    useReviewApi.getLifecycleHistory = originalGetHistory
  }
  assert.equal(remoteHistoryCalls, 0)
  assert.equal(store.lifecycleRoundsBySubjectId[subjectA.id].pendingCommand, null,
    'an obsolete parent-scope action ends its temporary card without altering formal history')
  assert.match(store.lifecycleRoundsBySubjectId[subjectA.id].pendingError, /移出当前学科/)
  const stored = await new ReviewRepository('localstorage', repository).getReviewRecord(userId, deviceId, block.id)
  assert.equal(stored.subjectId, subjectA.id)
  assert.equal(stored.history.length, 0, 'the stale A round must not commit to the now-B KB')
})

test('local reconfirm ends a card when the current local review history is incomplete', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const suffix = Date.now()
  const userId = `incomplete-local-reconfirm-user-${suffix}`
  const deviceId = `incomplete-local-reconfirm-device-${suffix}`
  const subjectId = `incomplete-local-reconfirm-subject-${suffix}`
  const block = { id: `incomplete-local-reconfirm-kb-${suffix}`, subjectId, content: 'Incomplete local history', title: 'Incomplete history' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Incomplete history' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const initialRecord = {
    knowledgeBlockId: block.id, subjectId, localRevision: 1, serverKnowledgeBlockVersion: 1, contentHash,
    state: {
      knowledgeBlockId: block.id, dueAt: '2026-10-08T00:00:00.000Z', version: 1, knowledgeBlockVersion: 1,
      needsLearning: false, mastered: false, stableSuccessCount: 0, nextReviewStage: 'CROSS_DAY',
      lastPracticeAt: null, lastReviewId: null, pendingReviewId: null, contentHash, canonicalVersion: 1,
    },
    history: [], effectiveReviews: [],
    historyImported: false, isPresenceMarker: false, canonicalAnchor: null, updatedAt: '2026-10-09T00:00:00.000Z',
  }
  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId, initialRecord)
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: 'incomplete-reconfirm@example.test' },
    tokens: { accessToken: 'incomplete-reconfirm-access', refreshToken: 'incomplete-reconfirm-refresh' },
    sessionId: `incomplete-reconfirm-session-${suffix}`, serverDeviceId: deviceId,
  })
  const store = useReviewStore()
  store.reconcileSubjectBlocks(subjectId, [block.id])
  await store.loadSubjectStates(subjectId)
  const round = store.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5 })
  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId, {
    ...initialRecord,
    localRevision: 2,
    state: { ...initialRecord.state, version: 2 },
    updatedAt: '2026-10-09T00:00:01.000Z',
  })
  await assert.rejects(store.selectLifecycleRating(subjectId, 'GOOD', contentHash), /409 RESOURCE_VERSION_CONFLICT/)
  assert.equal(round.conflictNeedsConfirmation, true)
  const originalGetHistory = useReviewApi.getLifecycleHistory
  let remoteHistoryCalls = 0
  useReviewApi.getLifecycleHistory = async () => {
    remoteHistoryCalls += 1
    throw new Error('local reconfirmation must not call the remote lifecycle history API')
  }
  try {
    await store.reconfirmLifecyclePending(subjectId)
  } finally {
    useReviewApi.getLifecycleHistory = originalGetHistory
  }
  assert.equal(remoteHistoryCalls, 0)
  assert.equal(round.pendingCommand, null)
  assert.equal(round.phase, 'GROUP_COMPLETE')
  assert.match(round.pendingError, /历史尚未完整导入/)
  assert.equal((await reviewRepository.getReviewRecord(userId, deviceId, block.id)).state.version, 2)
  assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, block.id)).length, 0)
})

test('a same-KB successor waits for its predecessor ACK while another KB continues', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'review-fifo-user'
  const deviceId = 'review-fifo-device'
  const subjectId = 'review-fifo-subject'
  const firstBlock = { id: 'a-review-fifo-kb', subjectId, content: 'first FIFO body', title: 'FIFO A' }
  const otherBlock = { id: 'b-review-fifo-kb', subjectId, content: 'other FIFO body', title: 'FIFO B' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Review FIFO' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', firstBlock.id, firstBlock, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', otherBlock.id, otherBlock, { version: 1, syncStatus: 'synced' })
  const sha256 = async content => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const service = new LocalReviewService('localstorage', repository)
  const firstHash = await sha256(firstBlock.content)
  const otherHash = await sha256(otherBlock.content)
  for (const block of [firstBlock, otherBlock]) {
    assert.equal(await service.importLifecycleHistory(userId, deviceId, block.id, {
      knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
      state: null, commands: [], effectiveReviews: [],
    }, []), true, 'each server resource has an imported canonical absence anchor')
  }
  const selectedA = await service.executeCommand(userId, deviceId, firstBlock.id, 'fifo-select-a', 'REVIEW_SELECTED', 'GOOD',
    '2026-10-09T06:40:00.000000Z', 0, firstHash, {
      clientCommandId: 'fifo-select-a', knowledgeBlockId: firstBlock.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash: firstHash, occurredAt: '2026-10-09T06:40:00.000000Z', expectedStateAbsent: true, rating: 'GOOD', reviewId: 'fifo-review-a',
    })
  const confirmedA = await service.executeCommand(userId, deviceId, firstBlock.id, 'fifo-confirm-a', 'REVIEW_CONFIRMED', null,
    '2026-10-09T06:40:00.000000Z', 0, firstHash, {
      clientCommandId: 'fifo-confirm-a', knowledgeBlockId: firstBlock.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash: firstHash, occurredAt: '2026-10-09T06:40:00.000000Z', expectedStateAbsent: false,
      reviewId: selectedA.effectiveReview.reviewId,
    })
  const selectedB = await service.executeCommand(userId, deviceId, otherBlock.id, 'fifo-select-b', 'REVIEW_SELECTED', 'GOOD',
    '2026-10-09T06:42:00.000000Z', 0, otherHash, {
      clientCommandId: 'fifo-select-b', knowledgeBlockId: otherBlock.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash: otherHash, occurredAt: '2026-10-09T06:42:00.000000Z', expectedStateAbsent: true, rating: 'GOOD', reviewId: 'fifo-review-b',
    })
  const fifoIntents = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, firstBlock.id)
  assert.deepEqual(fifoIntents.map(intent => intent.clientCommandId), ['fifo-select-a', 'fifo-confirm-a'],
    'same occurredAt and baseVersion still preserve the local command sequence')
  assert.ok(fifoIntents[0].createdAt < fifoIntents[1].createdAt,
    'the persisted local creation sequence is strictly increasing even within one millisecond')
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    selectReview: useReviewApi.selectReview, confirmReview: useReviewApi.confirmReview,
  }
  const selectionRequests = []
  let firstARequestFails = true
  let confirmationCount = 0
  let otherKbPostCount = 0
  const serverHistories = new Map([firstBlock, otherBlock].map(block => [block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }]))
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => structuredClone(serverHistories.get(knowledgeBlockId))
  useReviewApi.selectReview = async request => {
    selectionRequests.push(JSON.parse(JSON.stringify(request)))
    if (request.knowledgeBlockId === firstBlock.id && firstARequestFails) {
      firstARequestFails = false
      throw { status: 503, message: 'controlled first command outage' }
    }
    if (request.knowledgeBlockId === otherBlock.id) otherKbPostCount += 1
    const response = request.knowledgeBlockId === firstBlock.id ? selectedA : selectedB
    const acknowledged = {
      ...response, commandId: `server-${request.clientCommandId}`, clientCommandId: request.clientCommandId,
      knowledgeBlockVersion: 1,
      state: { ...response.state, version: 0, knowledgeBlockVersion: 1 },
    }
    serverHistories.set(request.knowledgeBlockId, {
      knowledgeBlockId: request.knowledgeBlockId, knowledgeBlockVersion: 1, protocolVersion: 2,
      state: acknowledged.state,
      commands: [{
        commandId: acknowledged.commandId, clientCommandId: acknowledged.clientCommandId,
        action: acknowledged.action, occurredAt: acknowledged.occurredAt,
        reviewId: acknowledged.effectiveReview?.reviewId ?? null,
        rating: request.rating ?? null, durationSeconds: request.durationSeconds ?? null,
        baseVersion: request.baseVersion, knowledgeBlockVersion: 1,
      }],
      effectiveReviews: acknowledged.effectiveReview ? [acknowledged.effectiveReview] : [],
    })
    return acknowledged
  }
  useReviewApi.confirmReview = async (reviewId, request) => {
    confirmationCount += 1
    assert.equal(reviewId, selectedA.effectiveReview.reviewId)
    const acknowledged = {
      ...confirmedA, commandId: 'server-fifo-confirm-a', clientCommandId: request.clientCommandId,
      knowledgeBlockVersion: 1,
      state: { ...confirmedA.state, version: 1, knowledgeBlockVersion: 1 },
    }
    const previous = serverHistories.get(firstBlock.id)
    serverHistories.set(firstBlock.id, {
      ...previous,
      state: acknowledged.state,
      commands: [...previous.commands, {
        commandId: acknowledged.commandId, clientCommandId: acknowledged.clientCommandId,
        action: acknowledged.action, occurredAt: acknowledged.occurredAt,
        reviewId, rating: null, durationSeconds: null,
        baseVersion: request.baseVersion, knowledgeBlockVersion: 1,
      }],
      effectiveReviews: acknowledged.effectiveReview ? [acknowledged.effectiveReview] : previous.effectiveReviews,
    })
    return acknowledged
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    await sync.syncAllPending(userId, deviceId)
    assert.equal(confirmationCount, 0, 'a successor must wait when the first command has an unknown outcome')
    assert.equal(otherKbPostCount, 1, 'a deferred KB does not block independent KB work')
    let intentsA = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, firstBlock.id)
    assert.deepEqual(intentsA.map(intent => intent.clientCommandId), ['fifo-select-a', 'fifo-confirm-a'])
    assert.equal(intentsA[0].status, 'inflight')
    assert.equal(intentsA[1].status, 'pending')

    await sync.syncAllPending(userId, deviceId)
    const requestsA = selectionRequests.filter(request => request.knowledgeBlockId === firstBlock.id)
    assert.equal(requestsA.length, 2)
    assert.deepEqual(requestsA[0], requestsA[1], 'the first operation retries with byte-equivalent frozen fields')
    assert.equal(confirmationCount, 1, 'the successor dispatches only after the first command returns its real version-zero ACK')
    assert.equal((await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, firstBlock.id)).length, 0)
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
    useReviewApi.confirmReview = originals.confirmReview
  }
})

function sqliteBindings(sql, values = []) {
  const ordered = []
  const normalized = sql.replace(/\$(\d+)/g, (_match, index) => {
    ordered.push(values[Number(index) - 1])
    return '?'
  })
  return { sql: normalized, values: ordered.length ? ordered : values }
}

function sqliteAdapter(database) {
  const adapter = {
    async execute(sql, bindValues = []) {
      const bound = sqliteBindings(sql, bindValues)
      database.prepare(bound.sql).run(...bound.values)
    },
    async select(sql, bindValues = []) {
      const bound = sqliteBindings(sql, bindValues)
      return database.prepare(bound.sql).all(...bound.values)
    },
    async transaction(operation) {
      database.exec('BEGIN IMMEDIATE')
      try {
        const result = await operation(adapter)
        database.exec('COMMIT')
        return result
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
  }
  return adapter
}

test('browser review ignores unscoped legacy resources when the current account has no matching block', async () => {
  const { createLocalRepository } = await import('../src/services/localRepository.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const userId = 'legacy-scope-current-user'
  const deviceId = 'legacy-scope-current-device'
  const subject = { id: 'legacy-other-user-subject', name: 'Other account' }
  const block = { id: 'legacy-other-user-kb', subjectId: subject.id, title: 'Other account block', content: 'Other account body', sync_version: 7 }
  const legacyKeys = ['auralis_subjects', 'auralis_knowledge_blocks']
  const previousValues = legacyKeys.map(key => testStorage.getItem(key))
  try {
    testStorage.setItem(legacyKeys[0], JSON.stringify([subject]))
    testStorage.setItem(legacyKeys[1], JSON.stringify([block]))
    const repository = createLocalRepository(userId, deviceId, { storage: testStorage })
    const reviewRepository = new ReviewRepository('localstorage', repository)
    assert.equal(await reviewRepository.getKbResource('localstorage', userId, block.id), null,
      'a scoped miss must not load a block from another account legacy cache')
    assert.equal(await reviewRepository.getSubjectResource('localstorage', userId, subject.id), null)
    const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(block.content),
    )), value => value.toString(16).padStart(2, '0')).join('')
    const occurredAt = '2026-10-09T04:00:00.000000Z'
    const clientCommandId = 'legacy-scope-learning-command'
    const request = {
      clientCommandId, knowledgeBlockId: block.id, knowledgeBlockVersion: 7,
      baseVersion: 0, contentHash, occurredAt, expectedStateAbsent: true,
    }
    await assert.rejects(new LocalReviewService('localstorage', repository).executeCommand(
      userId, deviceId, block.id, clientCommandId, 'LEARNING_COMPLETED', null,
      occurredAt, 0, contentHash, request, subject.id,
    ), /404 RESOURCE_NOT_FOUND/)
    assert.equal(await reviewRepository.getReviewRecord(userId, deviceId, block.id), null)
    assert.equal((await reviewRepository.getAllPendingIntents(userId, deviceId)).length, 0)
    const unboundReviewRepository = new ReviewRepository('localstorage')
    assert.equal(await unboundReviewRepository.getKbResource('localstorage', userId, block.id), null)
    assert.equal(await unboundReviewRepository.getSubjectResource('localstorage', userId, subject.id), null)
    const states = await new LocalReviewService('localstorage').getSubjectStates(userId, deviceId, subject.id)
    assert.deepEqual(states.items, [], 'no scoped repository means no resource enumeration')
  } finally {
    legacyKeys.forEach((key, index) => {
      if (previousValues[index] === null) testStorage.removeItem(key)
      else testStorage.setItem(key, previousValues[index])
    })
  }
})

test('SQLite stores the review record and outbox in one rollback-safe transaction', async () => {
  const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
  const { createLocalRepository } = await import('../src/services/localRepository.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const raw = new DatabaseSync(':memory:')
  const sql = sqliteAdapter(raw)
  try {
    await createVersionedLocalSchema(sql)
    const repository = createLocalRepository('sqlite-user', 'sqlite-device', { sql, schemaReady: Promise.resolve() })
    const subject = { id: 'sqlite-subject', name: 'SQLite subject' }
    const block = { id: 'sqlite-kb', subjectId: subject.id, content: 'SQLite content', title: 'Local block' }
    await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
    await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 7, syncStatus: 'synced' })
    const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(block.content),
    )), (value) => value.toString(16).padStart(2, '0')).join('')
    const service = new LocalReviewService(sql, repository)
    const makeRequest = (id) => ({
      clientCommandId: id, knowledgeBlockId: block.id, knowledgeBlockVersion: 7,
      baseVersion: 0, contentHash, occurredAt: '2026-10-09T04:00:00.000000Z',
      expectedStateAbsent: true, rating: 'GOOD', reviewId: `${id}-review`,
    })

    raw.exec(`CREATE TRIGGER reject_review_record BEFORE INSERT ON local_review_records
      BEGIN SELECT RAISE(ABORT, 'controlled review record failure'); END`)
    await assert.rejects(service.executeCommand(
      'sqlite-user', 'sqlite-device', block.id, 'sqlite-rollback', 'REVIEW_SELECTED', 'GOOD',
      makeRequest('sqlite-rollback').occurredAt, 0, contentHash, makeRequest('sqlite-rollback'),
    ), /controlled review record failure/)
    assert.equal(raw.prepare('SELECT count(*) AS count FROM local_review_intents').get().count, 0,
      'an outbox insert must roll back if the paired review record cannot commit')
    raw.exec('DROP TRIGGER reject_review_record')

    await service.executeCommand(
      'sqlite-user', 'sqlite-device', block.id, 'sqlite-commit', 'REVIEW_SELECTED', 'GOOD',
      makeRequest('sqlite-commit').occurredAt, 0, contentHash, makeRequest('sqlite-commit'),
    )
    const stored = await new ReviewRepository(sql, repository).getReviewRecord('sqlite-user', 'sqlite-device', block.id)
    const pending = await new ReviewRepository(sql, repository).getPendingIntents('sqlite-user', 'sqlite-device', block.id)
    assert.equal(stored.state.pendingReviewId, stored.effectiveReviews[0].reviewId)
    assert.equal(pending.length, 1)
    assert.equal(pending[0].clientCommandId, 'sqlite-commit')
    raw.prepare('UPDATE local_review_records SET history_json = ? WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ?')
      .run('{"commands":[]}', 'sqlite-user', 'sqlite-device', block.id)
    await assert.rejects(
      new ReviewRepository(sql, repository).getReviewRecord('sqlite-user', 'sqlite-device', block.id),
      /LOCAL_REVIEW_STORE_CORRUPT/,
      'SQL history with missing required arrays must fail closed instead of reading as empty history',
    )
  } finally {
    raw.close()
  }
})

test('SQLite rejects a pending row with missing preparation fields before a new review commit', async () => {
  const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
  const { createLocalRepository } = await import('../src/services/localRepository.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const raw = new DatabaseSync(':memory:')
  const sql = sqliteAdapter(raw)
  try {
    await createVersionedLocalSchema(sql)
    const userId = 'sqlite-corrupt-intent-user'
    const deviceId = 'sqlite-corrupt-intent-device'
    const subject = { id: 'sqlite-corrupt-intent-subject', name: 'SQLite subject' }
    const block = { id: 'sqlite-corrupt-intent-kb', subjectId: subject.id, content: 'SQLite corrupt intent body', title: 'Local block' }
    const repository = createLocalRepository(userId, deviceId, { sql, schemaReady: Promise.resolve() })
    await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
    await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 2, syncStatus: 'synced' })
    const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(block.content),
    )), (value) => value.toString(16).padStart(2, '0')).join('')
    const occurredAt = '2026-10-09T04:30:00.000000Z'
    const corruptId = 'sqlite-corrupt-intent'
    const corruptPayload = {
      clientCommandId: corruptId, knowledgeBlockId: block.id, knowledgeBlockVersion: 2,
      baseVersion: 0, contentHash, occurredAt, expectedStateAbsent: true, rating: 'GOOD',
    }
    raw.prepare(`INSERT INTO local_review_intents (
      client_command_id, user_id, device_id, knowledge_block_id, action, occurred_at,
      payload_json, status, created_at, prepared, preparation_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?)`)
      .run(corruptId, userId, deviceId, block.id, 'LEARNING_COMPLETED', occurredAt,
        JSON.stringify(corruptPayload), occurredAt, JSON.stringify({ sequence: 1 }))

    const nextId = 'sqlite-after-corrupt-intent'
    const nextOccurredAt = '2026-10-09T04:31:00.000000Z'
    const nextPayload = {
      clientCommandId: nextId, knowledgeBlockId: block.id, knowledgeBlockVersion: 2,
      baseVersion: 0, contentHash, occurredAt: nextOccurredAt, expectedStateAbsent: true,
    }
    await assert.rejects(
      new LocalReviewService(sql, repository).executeCommand(
        userId, deviceId, block.id, nextId, 'LEARNING_COMPLETED', null,
        nextOccurredAt, 0, contentHash, nextPayload, subject.id,
      ),
      /LOCAL_REVIEW_STORE_CORRUPT/,
    )

    const reviewRepository = new ReviewRepository(sql, repository)
    assert.equal(await reviewRepository.getReviewRecord(userId, deviceId, block.id), null,
      'a corrupt outbox row must not allow a partial review projection')
    const rows = raw.prepare(`SELECT client_command_id, preparation_json FROM local_review_intents
      WHERE user_id = ? AND device_id = ? AND knowledge_block_id = ? ORDER BY client_command_id`)
      .all(userId, deviceId, block.id).map(row => ({ ...row }))
    assert.deepEqual(rows, [{ client_command_id: corruptId, preparation_json: JSON.stringify({ sequence: 1 }) }],
      'the malformed intent bytes remain intact and no new intent is appended')
  } finally {
    raw.close()
  }
})

test('browser review storage rejects valid JSON with corrupt records or intents before writing', async () => {
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const repository = new ReviewRepository('localstorage')
  const userId = 'corrupt-user'
  const deviceId = 'corrupt-device'
  const key = `auralis:v2:${userId}:${deviceId}:review-store`
  const goodRecord = {
    knowledgeBlockId: 'replacement-kb', subjectId: 'corrupt-subject', localRevision: 0,
    serverKnowledgeBlockVersion: 1, contentHash: 'b'.repeat(64), state: null,
    history: [], effectiveReviews: [],
    historyImported: false, isPresenceMarker: false, canonicalAnchor: null, updatedAt: '2026-10-09T00:00:00.000Z',
  }

  const malformedContainer = JSON.stringify({ records: [], intents: {} })
  testStorage.setItem(key, malformedContainer)
  await assert.rejects(repository.getPendingIntents(userId, deviceId, 'replacement-kb'), /LOCAL_REVIEW_STORE_CORRUPT/)
  await assert.rejects(repository.saveReviewRecord('localstorage', userId, deviceId, goodRecord), /LOCAL_REVIEW_STORE_CORRUPT/)
  assert.equal(testStorage.getItem(key), malformedContainer, 'a rejected write must preserve the original bytes')

  const malformedState = JSON.stringify({
    records: [{ ...goodRecord, knowledgeBlockId: 'state-kb', state: { knowledgeBlockId: 'state-kb', version: 'bad' } }],
    intents: [],
  })
  testStorage.setItem(key, malformedState)
  await assert.rejects(repository.getReviewRecord(userId, deviceId, 'state-kb'), /LOCAL_REVIEW_STORE_CORRUPT/)
  await assert.rejects(repository.saveReviewRecord('localstorage', userId, deviceId, goodRecord), /LOCAL_REVIEW_STORE_CORRUPT/)
  assert.equal(testStorage.getItem(key), malformedState, 'invalid state must not be replaced by an empty record set')

  const malformedIntent = JSON.stringify({ records: [], intents: [{
    clientCommandId: 'broken-command', userId, deviceId, knowledgeBlockId: 'state-kb',
    action: 'REVIEW_SELECTED', occurredAt: '2026-10-09T00:00:00.000Z', status: 'pending',
    createdAt: '2026-10-09T00:00:00.000Z', payload: { clientCommandId: 'broken-command' },
  }] })
  testStorage.setItem(key, malformedIntent)
  await assert.rejects(repository.getPendingIntents(userId, deviceId, 'state-kb'), /LOCAL_REVIEW_STORE_CORRUPT/)
  await assert.rejects(repository.updateIntentStatus('localstorage', userId, deviceId, 'broken-command', 'inflight'), /LOCAL_REVIEW_STORE_CORRUPT/)
  assert.equal(testStorage.getItem(key), malformedIntent, 'an incomplete immutable intent must remain untouched for recovery')
})

test('body changes archive pending review intents and a parent tombstone blocks new local commits', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'qualification-user'
  const deviceId = 'qualification-device'
  const subject = { id: 'qualification-subject', name: 'Qualification subject' }
  const originalBlock = { id: 'qualification-kb', subjectId: subject.id, content: 'original body', title: 'Qualified block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', originalBlock.id, originalBlock, { version: 4, syncStatus: 'synced' })
  const sha256 = async (content) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  const originalHash = await sha256(originalBlock.content)
  const service = new LocalReviewService('localstorage', repository)
  const initialState = {
    knowledgeBlockId: originalBlock.id, dueAt: '2026-10-12T07:00:00.000000Z', version: 0, knowledgeBlockVersion: 4,
    needsLearning: false, mastered: false, stableSuccessCount: 0, nextReviewStage: 'CROSS_DAY',
    lastPracticeAt: '2026-10-01T00:00:00.000000Z', lastReviewId: null, pendingReviewId: null,
    contentHash: originalHash, parameterSetId: 'default', createdAt: '2026-09-01T00:00:00.000Z',
    reps: 1, lapses: 0, difficulty: 5, stability: 2,
  }
  assert.equal(await service.importLifecycleHistory(userId, deviceId, originalBlock.id, {
    knowledgeBlockId: originalBlock.id, knowledgeBlockVersion: 4, protocolVersion: 2,
    state: initialState, commands: [], effectiveReviews: [],
  }, []), true)
  const occurredAt = '2026-10-09T07:00:00.000000Z'
  await service.executeCommand(userId, deviceId, originalBlock.id, 'body-old-command', 'REVIEW_SELECTED', 'GOOD', occurredAt, 0, originalHash, {
    clientCommandId: 'body-old-command', knowledgeBlockId: originalBlock.id, knowledgeBlockVersion: 4,
    baseVersion: 0, contentHash: originalHash, occurredAt, expectedStateAbsent: false, rating: 'GOOD', reviewId: 'body-old-review',
  }, subject.id)
  const changedBlock = { ...originalBlock, content: 'edited body' }
  await repository.upsert('KNOWLEDGE_BLOCK', changedBlock.id, changedBlock, { version: 5, syncStatus: 'synced' })
  const afterEdit = (await service.getSubjectStates(userId, deviceId, subject.id)).items[0]
  assert.equal(afterEdit.needsLearning, true)
  assert.equal(afterEdit.pendingReviewId, null)
  assert.equal(afterEdit.persistedStatePresent, true)
  assert.equal(afterEdit.contentHash, await sha256(changedBlock.content))
  const reviewRepository = new ReviewRepository('localstorage', repository)
  assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, changedBlock.id)).length, 0,
    'a body-hash change must archive commands frozen against the old body')

  await repository.upsert('SUBJECT', subject.id, subject, {
    version: 2, deletedAt: '2026-10-09T07:01:00.000Z', syncStatus: 'synced',
  })
  const newHash = await sha256(changedBlock.content)
  const state = (await reviewRepository.getReviewRecord(userId, deviceId, changedBlock.id)).state
  assert.equal(state.version, 0, 'offline content invalidation must not predict a canonical ReviewState version')
  await assert.rejects(service.executeCommand(userId, deviceId, changedBlock.id, 'parent-deleted-command', 'LEARNING_COMPLETED', null,
    '2026-10-09T07:02:00.000000Z', state.version, newHash, {
      clientCommandId: 'parent-deleted-command', knowledgeBlockId: changedBlock.id, knowledgeBlockVersion: 5,
      baseVersion: state.version, contentHash: newHash, occurredAt: '2026-10-09T07:02:00.000000Z', expectedStateAbsent: false,
    }, subject.id), /404 RESOURCE_NOT_FOUND/)
  assert.equal((await reviewRepository.getUnresolvedIntents(userId, deviceId, [changedBlock.id])).length, 0,
    'a deleted parent subject cannot receive a new local review command')
})

test('a subject-only KB move preserves mastery and keeps the obsolete selection in the conflict audit', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'subject-move-preserve-user'
  const deviceId = 'subject-move-preserve-device'
  const subjectA = { id: 'subject-move-preserve-a', name: 'Move A' }
  const subjectB = { id: 'subject-move-preserve-b', name: 'Move B' }
  const mastered = { id: 'subject-move-mastered-kb', subjectId: subjectA.id, content: 'mastered unchanged body', title: 'Mastered' }
  const pending = { id: 'subject-move-pending-kb', subjectId: subjectA.id, content: 'pending unchanged body', title: 'Pending selection' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectA.id, subjectA, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SUBJECT', subjectB.id, subjectB, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', mastered.id, mastered, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', pending.id, pending, { version: 1, syncStatus: 'synced' })
  const sha256 = async content => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const masteredHash = await sha256(mastered.content)
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const dueAt = '2026-11-01T00:00:00.000Z'
  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId, {
    knowledgeBlockId: mastered.id, subjectId: subjectA.id, localRevision: 1, serverKnowledgeBlockVersion: 1,
    contentHash: masteredHash,
    state: {
      knowledgeBlockId: mastered.id, dueAt, version: 3, knowledgeBlockVersion: 1, needsLearning: false,
      mastered: true, stableSuccessCount: 3, nextReviewStage: null, lastPracticeAt: '2026-10-01T00:00:00.000Z',
      lastReviewId: 'mastered-last-review', pendingReviewId: null, contentHash: masteredHash, canonicalVersion: 3,
    },
    history: [], effectiveReviews: [],
    historyImported: true, isPresenceMarker: false, canonicalAnchor: null, updatedAt: dueAt,
  })
  const pendingHash = await sha256(pending.content)
  const selected = await new LocalReviewService('localstorage', repository).executeCommand(
    userId, deviceId, pending.id, 'move-pending-select', 'REVIEW_SELECTED', 'GOOD', '2026-10-09T07:00:00.000000Z', 0, pendingHash, {
      clientCommandId: 'move-pending-select', knowledgeBlockId: pending.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash: pendingHash, occurredAt: '2026-10-09T07:00:00.000000Z',
      expectedStateAbsent: true, rating: 'GOOD', reviewId: 'move-pending-review',
    },
  )

  await repository.upsert('KNOWLEDGE_BLOCK', mastered.id, { ...mastered, subjectId: subjectB.id }, { version: 2, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', pending.id, { ...pending, subjectId: subjectB.id }, { version: 2, syncStatus: 'synced' })
  const movedStates = await new LocalReviewService('localstorage', repository).getSubjectStates(userId, deviceId, subjectB.id)
  const masteredAfterMove = movedStates.items.find(state => state.knowledgeBlockId === mastered.id)
  const pendingAfterMove = movedStates.items.find(state => state.knowledgeBlockId === pending.id)
  assert.equal(masteredAfterMove.mastered, true)
  assert.equal(masteredAfterMove.stableSuccessCount, 3)
  assert.equal(masteredAfterMove.dueAt, dueAt)
  assert.equal(masteredAfterMove.nextReviewStage, null)
  assert.equal(pendingAfterMove.pendingReviewId, null, 'the old selection cannot be resumed in the new subject')
  assert.equal(pendingAfterMove.lastReviewId, null)
  const movedRecord = await reviewRepository.getReviewRecord(userId, deviceId, pending.id)
  assert.equal(movedRecord.effectiveReviews[0].reviewId, selected.effectiveReview.reviewId)
  assert.equal(movedRecord.effectiveReviews[0].resolution, 'SUPERSEDED')
  const pendingIntent = await reviewRepository.getIntent('localstorage', userId, deviceId, 'move-pending-select')
  assert.equal(pendingIntent.status, 'conflict',
    'a frozen command against the old KB version is surfaced for explicit cloud resolution, not silently orphaned')
})

test('reopening a mastered card resets its local review phase before the ten-minute learning loop', async () => {
  const { ReviewLifecycleEngine } = await import('../src/services/reviewLifecycleEngine.ts')
  const current = {
    knowledgeBlockId: 'reopen-mastered-kb', dueAt: '2026-12-01T00:00:00.000Z', version: 8,
    knowledgeBlockVersion: 4, needsLearning: false, mastered: true, stableSuccessCount: 3,
    nextReviewStage: null, lastPracticeAt: '2026-11-01T00:00:00.000Z', lastReviewId: 'last-review',
    pendingReviewId: null, contentHash: 'c'.repeat(64), stability: 50, canonicalVersion: 8,
  }
  const reopened = ReviewLifecycleEngine.processCommand(current, current.knowledgeBlockId, 'LEARNING_REOPENED', null,
    '2026-10-09T07:10:00.000000Z', 'reopen-command', 8, 4, current.contentHash)
  assert.equal(reopened.state.mastered, false)
  assert.equal(reopened.state.stableSuccessCount, 0)
  assert.equal(reopened.state.nextReviewStage, 'EARLY_RECALL')
  const learned = ReviewLifecycleEngine.processCommand(reopened.state, current.knowledgeBlockId, 'LEARNING_COMPLETED', null,
    '2026-10-09T07:11:00.000000Z', 'relearn-complete-command', reopened.state.version, 4, current.contentHash)
  assert.equal(learned.state.dueAt, '2026-10-09T07:21:00.000000Z')
  assert.equal(learned.state.mastered, false)
  assert.equal(learned.state.stableSuccessCount, 0)
  assert.equal(learned.state.nextReviewStage, 'EARLY_RECALL')
})

test('local subject statistics use lifecycle history, deduplicate sources, apply IANA dates and final corrections', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'stats-contract-user'
  const deviceId = 'stats-contract-device'
  const subject = { id: 'stats-contract-subject', name: 'Stats contract' }
  const block = { id: 'stats-contract-kb', subjectId: subject.id, content: 'stats body', title: 'Stats block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  const zone = 'America/Los_Angeles'
  const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const localToday = `${todayParts.find(part => part.type === 'year').value}-${todayParts.find(part => part.type === 'month').value}-${todayParts.find(part => part.type === 'day').value}`
  const firstAt = new Date(`${localToday}T02:00:00.000Z`).toISOString()
  const laterAt = new Date(`${localToday}T12:00:00.000Z`).toISOString()
  const expectedDate = (instant) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant))
    return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}-${parts.find(part => part.type === 'day').value}`
  }
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, { ...block, createdAt: firstAt }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SOURCE', 'local-source-row', {
    id: 'local-source-id', localSourceId: 'local-source-id', serverSourceId: 'server-source-id', subjectId: subject.id, type: 'FILE',
  }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SOURCE', 'server-source-row', {
    id: 'server-source-id', localSourceId: 'local-source-id', serverSourceId: 'server-source-id', subjectId: subject.id, type: 'FILE',
  }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SOURCE', 'text-source-row', {
    id: 'text-source-id', subjectId: subject.id, type: 'TEXT',
  }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('TASK', 'stats-done-task', {
    id: 'stats-done-task', subjectId: subject.id, status: 'DONE', completedAt: laterAt,
  }, { version: 1, syncStatus: 'synced' })
  const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  await new ReviewRepository('localstorage', repository).saveReviewRecord('localstorage', userId, deviceId, {
    knowledgeBlockId: block.id, subjectId: subject.id, localRevision: 1, serverKnowledgeBlockVersion: 1,
    contentHash: hash,
    state: {
      knowledgeBlockId: block.id, dueAt: laterAt, version: 3, knowledgeBlockVersion: 1, needsLearning: false,
      mastered: false, stableSuccessCount: 1, nextReviewStage: 'CROSS_DAY', lastPracticeAt: laterAt,
      lastReviewId: 'effective-review', pendingReviewId: null, contentHash: hash, canonicalVersion: 3,
    },
    history: [{ commandId: 'learning-command', clientCommandId: 'learning-client-command', action: 'LEARNING_COMPLETED',
      occurredAt: firstAt, reviewId: null, rating: null, durationSeconds: 20, baseVersion: 0, knowledgeBlockVersion: 1 }],
    effectiveReviews: [{ reviewId: 'effective-review', selectedRating: 'GOOD', effectiveRating: 'AGAIN',
      selectedAt: laterAt, resolvedAt: laterAt, resolution: 'CORRECTED_AGAIN' }],
    historyImported: true, isPresenceMarker: false, canonicalAnchor: null, updatedAt: laterAt,
  })

  const stats = await LocalSubjectStats.compute('localstorage', userId, deviceId, subject.id, 7, zone, repository)
  const yesterday = new Date(`${localToday}T00:00:00.000Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const firstDay = stats.daily.find(day => day.date === expectedDate(firstAt))
  const laterDay = stats.daily.find(day => day.date === expectedDate(laterAt))
  assert.equal(expectedDate(firstAt), yesterday.toISOString().slice(0, 10), 'the test event crosses the IANA date boundary from UTC')
  assert.equal(firstDay.createdKnowledgeBlockCount, 1)
  assert.equal(firstDay.firstLearningKnowledgeBlockCount, 0,
    'first-learning totals are no longer inferred from the removed event stream')
  assert.equal(firstDay.learningCompletionCount, 1)
  assert.equal(laterDay.subsequentReviewKnowledgeBlockCount, 0)
  assert.equal(laterDay.nonSkipReviewEventCount, 1, 'only the final effective lifecycle result is counted')
  assert.equal(laterDay.completedTaskCount, 1, 'daily task completions use the actual completedAt value')
  assert.equal(stats.overview.fileSourceCount, 1, 'local/server aliases count one imported source once')
  assert.equal(stats.overview.textSourceCount, 1)
  assert.equal(stats.overview.doneTaskCount, 1)
  assert.equal(stats.historyCoverage, 'COMPLETE')
  assert.equal(stats.ratingCounts.againCount, 1, 'correction uses the final effective rating')
  assert.equal(stats.ratingCounts.goodCount, 0)
  assert.equal(stats.ratingCounts.hardCount, 0)
})

test('local new-learning statistics require explicit knowledge that ReviewState is absent', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  await localDb.init()
  const userId = 'stats-unknown-presence-user'
  const deviceId = 'stats-unknown-presence-device'
  const subjectId = 'stats-unknown-presence-subject'
  const block = { id: 'stats-unknown-presence-kb', subjectId, content: 'history not imported', title: 'Unknown' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Unknown presence' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const compute = () => LocalSubjectStats.compute('localstorage', userId, deviceId, subjectId, 7, 'UTC', repository)
  const unknown = await compute()
  assert.equal(unknown.historyCoverage, 'INCOMPLETE')
  assert.equal(unknown.overview.pendingLearningCount, 1)
  assert.equal(unknown.overview.newLearningCount, 0,
    'an unimported server KB could already have a persisted state, so absence is not inferred')

  const createdBlock = { id: 'stats-known-local-create-kb', subjectId, content: 'created on this device', title: 'Local create' }
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: createdBlock.id, value: createdBlock, version: 0, deletedAt: null,
    mutation: {
      clientMutationId: 'stats-known-local-create-mutation', resourceType: 'KNOWLEDGE_BLOCK', resourceId: createdBlock.id,
      mutationType: 'CREATE', baseVersion: 0, payload: createdBlock,
    },
  })
  const knownLocalCreate = await compute()
  assert.equal(knownLocalCreate.historyCoverage, 'INCOMPLETE')
  assert.equal(knownLocalCreate.overview.pendingLearningCount, 2)
  assert.equal(knownLocalCreate.overview.newLearningCount, 1,
    'a local CREATE mutation proves absence even before a review record exists')

  const service = new LocalReviewService('localstorage', repository)
  assert.equal(await service.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }), true)
  const knownAbsent = await compute()
  assert.equal(knownAbsent.historyCoverage, 'INCOMPLETE', 'the unrelated local CREATE still lacks a complete imported history record')
  assert.equal(knownAbsent.overview.newLearningCount, 2,
    'an explicitly imported absent ReviewState counts as new learning')
})

test('local statistics preserve soft-deleted history and require lifecycle coverage for each active block', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  await localDb.init()
  const userId = 'stats-history-user'
  const deviceId = 'stats-history-device'
  const subjectId = 'stats-history-subject'
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Stats history' }, { version: 1, syncStatus: 'synced' })
  const createdAt = '2026-10-08T10:00:00.000Z'
  const oldBlock = { id: 'stats-history-deleted-kb', subjectId, content: 'deleted body', createdAt }
  const activeBlock = { id: 'stats-history-active-kb', subjectId, content: 'active body', createdAt }
  await repository.upsert('KNOWLEDGE_BLOCK', oldBlock.id, oldBlock, {
    version: 1, deletedAt: '2026-10-09T09:00:00.000Z', syncStatus: 'synced',
  })
  await repository.upsert('KNOWLEDGE_BLOCK', activeBlock.id, activeBlock, { version: 1, syncStatus: 'synced' })
  const completedAt = '2026-10-09T11:00:00.000Z'
  await repository.upsert('TASK', 'stats-history-deleted-task', {
    id: 'stats-history-deleted-task', subjectId, status: 'DONE', completedAt,
  }, { version: 2, deletedAt: '2026-10-09T12:00:00.000Z', syncStatus: 'synced' })
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const activeHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(activeBlock.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const record = (knowledgeBlockId, historyImported, state = null) => ({
    knowledgeBlockId, subjectId, localRevision: 1, serverKnowledgeBlockVersion: 1,
    contentHash: knowledgeBlockId === activeBlock.id ? activeHash : 'a'.repeat(64), state, history: [], effectiveReviews: [],
    historyImported,
    isPresenceMarker: false, canonicalAnchor: null, updatedAt: completedAt,
  })
  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId,
    record(oldBlock.id, true))
  const compute = () => LocalSubjectStats.compute('localstorage', userId, deviceId, subjectId, 30, 'UTC', repository)
  const missing = await compute()
  assert.equal(missing.historyCoverage, 'INCOMPLETE', 'a deleted KB history cannot stand in for a missing active KB record')
  assert.equal(missing.overview.activeKnowledgeBlockCount, 1)
  assert.equal(missing.daily.find(day => day.date === '2026-10-08').createdKnowledgeBlockCount, 2,
    'daily created-KB history includes the subsequently deleted block')
  assert.equal(missing.daily.find(day => day.date === '2026-10-09').completedTaskCount, 1,
    'daily completion history includes the subsequently deleted task')
  assert.equal(missing.overview.doneTaskCount, 0, 'overview DONE totals only include active tasks')

  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId,
    record(activeBlock.id, false))
  const partial = await compute()
  assert.equal(partial.historyCoverage, 'INCOMPLETE', 'an active block without imported lifecycle history is incomplete')
  assert.equal(partial.overview.newLearningCount, 0, 'an unimported record does not create known new learning')

  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId,
    record(activeBlock.id, true))
  const completeAbsent = await compute()
  assert.equal(completeAbsent.historyCoverage, 'COMPLETE')
  assert.equal(completeAbsent.overview.newLearningCount, 1)

  const existingNeedsLearningState = {
    knowledgeBlockId: activeBlock.id, dueAt: completedAt, version: 1, knowledgeBlockVersion: 1,
    needsLearning: true, mastered: false, stableSuccessCount: 0, nextReviewStage: null,
    lastPracticeAt: null, lastReviewId: null, pendingReviewId: null, contentHash: activeHash,
  }
  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId,
    record(activeBlock.id, true, existingNeedsLearningState))
  const existingState = await compute()
  assert.equal(existingState.overview.pendingLearningCount, 1)
  assert.equal(existingState.overview.newLearningCount, 0,
    'an existing persisted ReviewState is not new learning even when needsLearning remains true')

})

for (const failedCoreStatus of ['error', 'conflict']) {
  test(`ReviewSync defers an unprepared intent while its core KB update is ${failedCoreStatus}`, async () => {
    const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
    const { LocalReviewService } = await import('../src/services/localReviewService.ts')
    const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
    const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
    const { useReviewApi } = await import('../src/api/useReviewApi.ts')
    await localDb.init()
    const userId = `core-gate-${failedCoreStatus}-user`
    const deviceId = `core-gate-${failedCoreStatus}-device`
    const subjectId = `core-gate-${failedCoreStatus}-subject`
    const block = { id: `core-gate-${failedCoreStatus}-kb`, subjectId, content: 'before update', title: 'Core gate' }
    const repository = await getLocalRepository(userId, deviceId)
    await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Core gate' }, { version: 1, syncStatus: 'synced' })
    await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
    const localReview = new LocalReviewService('localstorage', repository)
    await localReview.importLifecycleHistory(userId, deviceId, block.id, {
      knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
      state: null, commands: [], effectiveReviews: [],
    }, [])
    const changed = { ...block, content: 'pending core update' }
    await repository.commitMutation({
      resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: changed, version: 2, deletedAt: null,
      mutation: {
        clientMutationId: `${block.id}-update`, resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
        mutationType: 'UPDATE', baseVersion: 1, payload: changed,
      },
    })
    const coreMutation = (await repository.listUnresolved('KNOWLEDGE_BLOCK')).find(item => item.resourceId === block.id)
    assert.ok(coreMutation)
    await repository.markApplied(coreMutation.clientMutationId, failedCoreStatus, 'controlled core sync outcome')

    const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(changed.content),
    )), value => value.toString(16).padStart(2, '0')).join('')
    const completedAt = '2026-10-09T06:00:00.000000Z'
    const selected = await localReview.executeCommand(
      userId, deviceId, block.id, `${block.id}-review`, 'LEARNING_COMPLETED', null, completedAt, 0, hash, {
        clientCommandId: `${block.id}-review`, knowledgeBlockId: block.id, knowledgeBlockVersion: 2,
        baseVersion: 0, contentHash: hash, occurredAt: completedAt, expectedStateAbsent: true,
      },
    )
    const originals = { getLifecycleHistory: useReviewApi.getLifecycleHistory, completeLearning: useReviewApi.completeLearning }
    let postCount = 0
    const sentRequests = []
    useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
      knowledgeBlockId, knowledgeBlockVersion: 2, protocolVersion: 2, state: null, commands: [], effectiveReviews: [],
    })
    useReviewApi.completeLearning = async request => {
      postCount += 1
      sentRequests.push({ ...request })
      return { ...selected, commandId: `${block.id}-server-command`, clientCommandId: request.clientCommandId }
    }
    try {
      const sync = new ReviewSyncService('localstorage', repository)
      await sync.syncAllPending(userId, deviceId)
      assert.equal(postCount, 0, 'a failed core KB update must not dispatch its dependent review intent')
      let intent = await new ReviewRepository('localstorage', repository).getIntent('localstorage', userId, deviceId, `${block.id}-review`)
      assert.equal(intent.status, 'pending', 'a deferred intent remains eligible for the same frozen retry')

      await repository.markApplied(coreMutation.clientMutationId, 'applied')
      assert.equal(await repository.upsertFromSync('KNOWLEDGE_BLOCK', block.id, changed, {
        version: 2, deletedAt: null, syncStatus: 'synced',
      }), true)
      const convergedResult = await sync.syncAllPending(userId, deviceId)
      const convergedIntent = await new ReviewRepository('localstorage', repository).getIntent('localstorage', userId, deviceId, `${block.id}-review`)
      assert.equal(postCount, 1, `the same intent dispatches after its core resource converges: ${JSON.stringify({ convergedResult, convergedIntent })}`)
      assert.equal(sentRequests[0].clientCommandId, `${block.id}-review`)
      assert.equal(sentRequests[0].knowledgeBlockVersion, 2, 'the intent binds only after the core update has converged')
      intent = await new ReviewRepository('localstorage', repository).getIntent('localstorage', userId, deviceId, `${block.id}-review`)
      assert.equal(intent, null, 'the converged review intent is acknowledged')
    } finally {
      useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
      useReviewApi.completeLearning = originals.completeLearning
    }
  })
}

test('review sync requires protocol v2 before dispatch and preserves a frozen multi-device chain', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()

  const userId = 'sync-user'
  const deviceId = 'sync-device'
  const subject = { id: 'sync-subject', name: 'Sync subject' }
  const block = { id: 'sync-kb', subjectId: subject.id, content: 'Frozen sync body', title: 'Sync block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 7, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  const service = new LocalReviewService('localstorage', repository)
  await service.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 7, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  const selectedAt = '2026-10-09T05:00:00.000000Z'
  const selected = await service.executeCommand(userId, deviceId, block.id, 'sync-select', 'REVIEW_SELECTED', 'GOOD',
    selectedAt, 0, contentHash, {
      clientCommandId: 'sync-select', knowledgeBlockId: block.id, knowledgeBlockVersion: 7,
      baseVersion: 0, contentHash, occurredAt: selectedAt, expectedStateAbsent: true, rating: 'GOOD', reviewId: 'sync-review-id',
    })
  const confirmedAt = '2026-10-09T05:01:00.000000Z'
  await service.executeCommand(userId, deviceId, block.id, 'sync-confirm', 'REVIEW_CONFIRMED', 'GOOD',
    confirmedAt, 0, contentHash, {
      clientCommandId: 'sync-confirm', knowledgeBlockId: block.id, knowledgeBlockVersion: 7,
      baseVersion: 0, contentHash, occurredAt: confirmedAt, expectedStateAbsent: false,
      reviewId: selected.effectiveReview.reviewId, rating: 'GOOD',
    })

  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    selectReview: useReviewApi.selectReview,
    confirmReview: useReviewApi.confirmReview,
  }
  let protocol = 1
  let remoteKbVersion = 7
  let postCount = 0
  const sent = []
  let remoteHistory = {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 7, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    ...structuredClone(remoteHistory),
    knowledgeBlockId,
    knowledgeBlockVersion: remoteKbVersion,
    protocolVersion: protocol,
  })
  useReviewApi.selectReview = async (request) => {
    postCount += 1
    sent.push({ ...request })
    const acknowledged = {
      ...selected, commandId: 'server-select', clientCommandId: request.clientCommandId,
      state: { ...selected.state, version: 0, knowledgeBlockVersion: 7 },
    }
    remoteKbVersion = 7
    remoteHistory = {
      knowledgeBlockId: block.id, knowledgeBlockVersion: 7, protocolVersion: 2,
      state: { ...acknowledged.state, version: 10, canonicalVersion: 10, pendingReviewId: null, lastReviewId: 'remote-device-review' },
      commands: [
        {
          commandId: acknowledged.commandId, clientCommandId: acknowledged.clientCommandId,
          action: acknowledged.action, occurredAt: acknowledged.occurredAt,
          reviewId: acknowledged.effectiveReview.reviewId, rating: 'GOOD', durationSeconds: 0,
          baseVersion: request.baseVersion, knowledgeBlockVersion: 7,
        },
        {
          commandId: 'remote-device-command', clientCommandId: 'remote-device-client-command',
          action: 'REVIEW_SELECTED', occurredAt: '2026-10-09T05:02:00.000000Z',
          reviewId: 'remote-device-review', rating: 'GOOD', durationSeconds: 0,
          baseVersion: 1, knowledgeBlockVersion: 7,
        },
      ],
      effectiveReviews: [acknowledged.effectiveReview, {
        reviewId: 'remote-device-review', selectedRating: 'GOOD', effectiveRating: null,
        selectedAt: '2026-10-09T05:02:00.000000Z', resolvedAt: null, resolution: null,
      }],
    }
    return acknowledged
  }
  useReviewApi.confirmReview = async (_reviewId, request) => {
    postCount += 1
    sent.push({ ...request })
    throw { status: 409, message: 'remote state advanced' }
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    const blocked = await sync.syncAllPending(userId, deviceId)
    assert.equal(blocked.protocolBlocked, true)
    assert.equal(postCount, 0, 'protocol v1 must block all review POST dispatches')
    assert.equal((await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)).length, 2)

    protocol = 2
    remoteKbVersion = 8
    const wrongBodyVersion = await sync.syncAllPending(userId, deviceId)
    assert.equal(wrongBodyVersion.protocolBlocked, false)
    assert.equal(wrongBodyVersion.conflictCount, 1, 'a different server KB version must be surfaced as a conflict before POST')
    assert.equal(postCount, 0)
    const reviewRepository = new ReviewRepository('localstorage', repository)
    await reviewRepository.updateIntentStatus('localstorage', userId, deviceId, 'sync-select', 'pending')
    remoteKbVersion = 7
    const result = await sync.syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 1, 'the frozen earlier command receipt should be acknowledged')
    assert.equal(result.conflictCount, 1, 'the later command must remain a conflict after the remote writer advanced')
    assert.deepEqual(sent.map((request) => request.clientCommandId), ['sync-select'],
      'the later command is retained as a conflict before dispatch when canonical history contains another device action')
    const retainedChild = await reviewRepository.getIntent('localstorage', userId, deviceId, 'sync-confirm')
    assert.equal(retainedChild.payload.baseVersion, 0,
      'the child keeps the actual predecessor receipt version instead of being rebased to remote version 10')
    assert.equal(retainedChild.payload.expectedStateAbsent, false,
      'the child retains the persisted-state presence captured after its local predecessor')
    const finalRecord = await new ReviewRepository('localstorage', repository).getReviewRecord(userId, deviceId, block.id)
    assert.equal(finalRecord.state.version, 1, 'the local projected version advances independently of the first server version-zero receipt')
    assert.equal(finalRecord.state.canonicalVersion, 0, 'an older receipt must not advance canonical state to the separately observed remote version')
    assert.equal(finalRecord.effectiveReviews[0].resolution, 'CONFIRMED', 'the old selection receipt must not replace a resolved effective review')
    const unresolved = await new ReviewRepository('localstorage', repository).getUnresolvedIntents(userId, deviceId, [block.id])
    assert.equal(unresolved.length, 1)
    assert.equal(unresolved[0].clientCommandId, 'sync-confirm')
    assert.equal(unresolved[0].status, 'conflict')

    const cloudState = {
      ...finalRecord.state,
      version: 10,
      canonicalVersion: 10,
      pendingReviewId: null,
      lastReviewId: 'remote-device-review',
    }
    const adopted = await new LocalReviewService('localstorage', repository).adoptCloudHistory(userId, deviceId, block.id, {
      knowledgeBlockId: block.id,
      knowledgeBlockVersion: 7,
      protocolVersion: 2,
      state: cloudState,
      commands: [],
      effectiveReviews: [{
        reviewId: 'remote-device-review', selectedRating: 'GOOD', effectiveRating: 'GOOD',
        selectedAt: '2026-10-09T05:02:00.000000Z', resolvedAt: '2026-10-09T05:02:00.000000Z', resolution: 'CONFIRMED',
      }],
    }, [])
    assert.equal(adopted, true)
    assert.equal((await reviewRepository.getUnresolvedIntents(userId, deviceId, [block.id])).length, 0)
    const persistedStore = JSON.parse(testStorage.getItem(`auralis:v2:${userId}:${deviceId}:review-store`))
    assert.equal(persistedStore.intents.find(intent => intent.clientCommandId === 'sync-confirm').status, 'archived',
      'explicit cloud adoption archives the unaccepted local branch')
    assert.equal((await reviewRepository.getReviewRecord(userId, deviceId, block.id)).state.canonicalVersion, 10)
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
    useReviewApi.confirmReview = originals.confirmReview
  }
})

test('ReviewSync imports every local subject block and keeps failed history visibly incomplete', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()

  const userId = 'history-import-user'
  const deviceId = 'history-import-device'
  const subjectId = 'history-import-subject'
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'History import subject' }, { version: 1, syncStatus: 'synced' })
  const blockIds = []
  for (let index = 0; index < 201; index += 1) {
    const id = `history-import-kb-${index}`
    blockIds.push(id)
    await repository.upsert('KNOWLEDGE_BLOCK', id, {
      id, subjectId, title: `Block ${index}`, content: `Body ${index}`,
    }, { version: 1, syncStatus: 'synced' })
  }

  const originals = { getLifecycleHistory: useReviewApi.getLifecycleHistory }
  const requested = []
  const failedId = blockIds[100]
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => {
    requested.push(knowledgeBlockId)
    return {
      knowledgeBlockId,
      knowledgeBlockVersion: 1,
      protocolVersion: knowledgeBlockId === failedId ? 1 : 2,
      state: null,
      commands: [],
      effectiveReviews: [],
    }
  }
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(requested.length, 201)
    assert.equal(requested[0], blockIds[0])
    assert.equal(requested[100], failedId)
    assert.equal(requested[200], blockIds[200])
    assert.equal(result.protocolBlocked, true, 'an unsupported history response must remain incomplete')

    const reviewRepository = new ReviewRepository('localstorage', repository)
    assert.ok(await reviewRepository.getReviewRecord(userId, deviceId, blockIds[0]))
    assert.equal(await reviewRepository.getReviewRecord(userId, deviceId, failedId), null,
      'a failed middle history response must not be imported as an empty complete record')
    assert.ok(await reviewRepository.getReviewRecord(userId, deviceId, blockIds[200]),
      'later blocks still import after a failed middle response')
    assert.equal((await reviewRepository.getSubjectRecords(userId, deviceId, subjectId)).length, 200)
    const stats = await LocalSubjectStats.compute('localstorage', userId, deviceId, subjectId, 7, 'UTC', repository)
    assert.equal(stats.historyCoverage, 'INCOMPLETE')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
  }
})

test('a lost review receipt and failed local ACK retry the same request after a title edit', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'retry-user'
  const deviceId = 'retry-device'
  const subject = { id: 'retry-subject', name: 'Retry subject' }
  const block = { id: 'retry-kb', subjectId: subject.id, content: 'retry content', title: 'Retry block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 4, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  const occurredAt = '2026-10-09T06:00:00.123456Z'
  const localReview = new LocalReviewService('localstorage', repository)
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 4, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  const selected = await localReview.executeCommand(
    userId, deviceId, block.id, 'retry-command', 'REVIEW_SELECTED', 'HARD', occurredAt, 0, contentHash, {
      clientCommandId: 'retry-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 4,
      baseVersion: 0, contentHash, occurredAt, expectedStateAbsent: true, rating: 'HARD', reviewId: 'retry-review-id', durationSeconds: 0,
    },
  )
  const key = `auralis:v2:${userId}:${deviceId}:review-store`
  const originals = { getLifecycleHistory: useReviewApi.getLifecycleHistory, selectReview: useReviewApi.selectReview, setItem: testStorage.setItem }
  const requests = []
  let history = { knowledgeBlockId: block.id, knowledgeBlockVersion: 4, protocolVersion: 2, state: null, commands: [], effectiveReviews: [] }
  useReviewApi.getLifecycleHistory = async () => structuredClone(history)
  useReviewApi.selectReview = async (request) => {
    requests.push(JSON.parse(JSON.stringify(request)))
    if (requests.length === 1) throw { status: 503, message: 'server unavailable' }
    if (requests.length === 2) {
      testStorage.setItem = (storageKey, value) => {
        if (storageKey === key) {
          testStorage.setItem = originals.setItem
          throw new Error('controlled local ACK write failure')
        }
        return originals.setItem.call(testStorage, storageKey, value)
      }
    }
    return { ...selected, commandId: 'retry-server-command', clientCommandId: request.clientCommandId }
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    await sync.syncAllPending(userId, deviceId)
    let pending = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)
    assert.equal(pending[0].status, 'inflight', 'a network failure keeps the immutable request recoverable')
    await sync.syncAllPending(userId, deviceId)
    pending = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)
    assert.equal(pending[0].status, 'inflight', 'a successful HTTP response with failed local ACK remains retryable')
    await repository.upsert('KNOWLEDGE_BLOCK', block.id, { ...block, title: 'Renamed during retry' }, { version: 5, syncStatus: 'synced' })
    history = {
      ...history,
      knowledgeBlockVersion: 5,
      state: { ...selected.state, knowledgeBlockVersion: 5 },
      commands: [{
        commandId: 'retry-server-command', clientCommandId: requests[0].clientCommandId, action: 'REVIEW_SELECTED',
        occurredAt, reviewId: requests[0].reviewId, rating: 'HARD', durationSeconds: 0, baseVersion: 0, knowledgeBlockVersion: 4,
      }],
      effectiveReviews: [selected.effectiveReview],
    }
    const result = await sync.syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 1)
    assert.equal(result.conflictCount, 0)
    const reviewRepository = new ReviewRepository('localstorage', repository)
    assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, block.id)).length, 0)
    const record = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(record.state.knowledgeBlockVersion, 5)
    assert.equal(record.canonicalAnchor.knowledgeBlockVersion, 4)
    assert.equal(requests.length, 3)
    assert.deepEqual(requests[1], requests[0])
    assert.deepEqual(requests[2], requests[0])
  } finally {
    testStorage.setItem = originals.setItem
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
  }
})

test('ReviewSync rechecks the current body hash inside the inflight claim before POST', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'sync-body-race-user'
  const deviceId = 'sync-body-race-device'
  const subjectId = 'sync-body-race-subject'
  const block = { id: 'sync-body-race-kb', subjectId, content: 'qualified body', title: 'Body race' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Body race subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const localReview = new LocalReviewService('localstorage', repository)
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  await localReview.executeCommand(
    userId, deviceId, block.id, 'sync-body-race-command', 'REVIEW_SELECTED', 'GOOD',
    '2026-10-09T06:20:00.000000Z', 0, contentHash, {
      clientCommandId: 'sync-body-race-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash, occurredAt: '2026-10-09T06:20:00.000000Z', expectedStateAbsent: true, rating: 'GOOD', reviewId: 'sync-body-race-review',
    },
  )
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    selectReview: useReviewApi.selectReview,
    executeAtomicReviewCommit: ReviewRepository.prototype.executeAtomicReviewCommit,
  }
  let postCount = 0
  let atomicReads = 0
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId, knowledgeBlockVersion: 1, protocolVersion: 2, state: null, commands: [], effectiveReviews: [],
  })
  useReviewApi.selectReview = async () => { postCount += 1; throw new Error('must not POST changed content') }
  ReviewRepository.prototype.executeAtomicReviewCommit = async function (...args) {
    if (args[2] === block.id && ++atomicReads === 4) {
      await repository.upsert('KNOWLEDGE_BLOCK', block.id, { ...block, content: 'edited after preflight' }, {
        version: 2, syncStatus: 'synced',
      })
    }
    return originals.executeAtomicReviewCommit.apply(this, args)
  }
  try {
    await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(atomicReads, 4, 'the body edit is introduced after preparation and immediately before the atomic claim')
    assert.equal(postCount, 0, 'a body revision between hash read and inflight claim must block the POST')
    const intents = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)
    assert.equal(intents[0].status, 'pending', 'the immutable intent remains available for local invalidation/recovery')
  } finally {
    ReviewRepository.prototype.executeAtomicReviewCommit = originals.executeAtomicReviewCommit
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
  }
})

test('ReviewSync rechecks the active parent subject inside the inflight claim before POST', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'sync-parent-race-user'
  const deviceId = 'sync-parent-race-device'
  const subjectId = 'sync-parent-race-subject'
  const block = { id: 'sync-parent-race-kb', subjectId, content: 'parent-qualified body', title: 'Parent race' }
  const repository = await getLocalRepository(userId, deviceId)
  const subject = { id: subjectId, name: 'Parent race subject' }
  await repository.upsert('SUBJECT', subjectId, subject, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const localReview = new LocalReviewService('localstorage', repository)
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  await localReview.executeCommand(
    userId, deviceId, block.id, 'sync-parent-race-command', 'REVIEW_SELECTED', 'GOOD',
    '2026-10-09T06:25:00.000000Z', 0, contentHash, {
      clientCommandId: 'sync-parent-race-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash, occurredAt: '2026-10-09T06:25:00.000000Z', expectedStateAbsent: true, rating: 'GOOD', reviewId: 'sync-parent-race-review',
    },
  )
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    selectReview: useReviewApi.selectReview,
    executeAtomicReviewCommit: ReviewRepository.prototype.executeAtomicReviewCommit,
  }
  let postCount = 0
  let atomicReads = 0
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId, knowledgeBlockVersion: 1, protocolVersion: 2, state: null, commands: [], effectiveReviews: [],
  })
  useReviewApi.selectReview = async () => { postCount += 1; throw new Error('must not POST deleted parent') }
  ReviewRepository.prototype.executeAtomicReviewCommit = async function (...args) {
    if (args[2] === block.id && ++atomicReads === 4) {
      await repository.upsert('SUBJECT', subjectId, subject, {
        version: 2, deletedAt: '2026-10-09T06:25:01.000Z', syncStatus: 'synced',
      })
    }
    return originals.executeAtomicReviewCommit.apply(this, args)
  }
  try {
    await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(atomicReads, 4, 'the parent tombstone is introduced after preparation and immediately before the atomic claim')
    assert.equal(postCount, 0, 'a parent tombstone at the claim boundary must block the POST')
    const intents = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)
    assert.equal(intents[0].status, 'pending', 'the intent remains durable when the parent disappears')
  } finally {
    ReviewRepository.prototype.executeAtomicReviewCommit = originals.executeAtomicReviewCommit
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
  }
})

test('a late receipt after body invalidation preserves the new projection and archived intent', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'late-receipt-user'
  const deviceId = 'late-receipt-device'
  const subjectId = 'late-receipt-subject'
  const block = { id: 'late-receipt-kb', subjectId, content: 'body A', title: 'Late receipt' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Late receipt subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const hashA = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const localReview = new LocalReviewService('localstorage', repository)
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  const prepared = await localReview.executeCommand(
    userId, deviceId, block.id, 'late-receipt-command', 'REVIEW_SELECTED', 'GOOD',
    '2026-10-09T06:40:00.000000Z', 0, hashA, {
      clientCommandId: 'late-receipt-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash: hashA, occurredAt: '2026-10-09T06:40:00.000000Z', expectedStateAbsent: true, rating: 'GOOD', reviewId: 'late-receipt-review',
    },
  )
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    selectReview: useReviewApi.selectReview,
  }
  let remoteKbVersion = 1
  let postCount = 0
  let resolveReceipt
  let markPostStarted
  const postStarted = new Promise(resolve => { markPostStarted = resolve })
  const pendingReceipt = new Promise(resolve => { resolveReceipt = resolve })
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId, knowledgeBlockVersion: remoteKbVersion, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  })
  useReviewApi.selectReview = async request => {
    postCount += 1
    markPostStarted(request)
    return pendingReceipt
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    const firstSync = sync.syncAllPending(userId, deviceId)
    const frozenRequest = await waitForSignal(postStarted, 'late body-change POST')
    assert.equal(frozenRequest.contentHash, hashA)

    const blockB = { ...block, content: 'body B' }
    await repository.upsert('KNOWLEDGE_BLOCK', block.id, blockB, { version: 2, syncStatus: 'synced' })
    const projectedB = (await localReview.getSubjectStates(userId, deviceId, subjectId)).items[0]
    const hashB = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(blockB.content),
    )), value => value.toString(16).padStart(2, '0')).join('')
    assert.equal(projectedB.contentHash, hashB)
    assert.equal(projectedB.needsLearning, true)
    assert.equal(projectedB.pendingReviewId, null)

    resolveReceipt({
      ...prepared, commandId: 'late-receipt-server-command', clientCommandId: frozenRequest.clientCommandId,
    })
    await firstSync
    const repositoryStore = new ReviewRepository('localstorage', repository)
    const currentRecord = await repositoryStore.getReviewRecord(userId, deviceId, block.id)
    assert.equal(currentRecord.contentHash, hashB)
    assert.equal(currentRecord.state, null, 'body invalidation keeps the imported absent state absent')
    const persisted = JSON.parse(testStorage.getItem(`auralis:v2:${userId}:${deviceId}:review-store`))
    assert.equal(persisted.intents.find(intent => intent.clientCommandId === frozenRequest.clientCommandId).status, 'archived',
      'the late ACK cannot delete an intent archived by the content change')

    remoteKbVersion = 2
    await sync.syncAllPending(userId, deviceId)
    assert.equal(postCount, 1, 'a later sync cannot resend the frozen command for body A')
    assert.equal((await repositoryStore.getReviewRecord(userId, deviceId, block.id)).contentHash, hashB)
    assert.equal(JSON.parse(testStorage.getItem(`auralis:v2:${userId}:${deviceId}:review-store`))
      .intents.find(intent => intent.clientCommandId === frozenRequest.clientCommandId).status, 'archived')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
  }
})

test('a late receipt after a KB moves subjects cannot restore or acknowledge the old review scope', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'late-move-user'
  const deviceId = 'late-move-device'
  const oldSubjectId = 'late-move-old-subject'
  const newSubjectId = 'late-move-new-subject'
  const block = { id: 'late-move-kb', subjectId: oldSubjectId, content: 'same body', title: 'Moved block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', oldSubjectId, { id: oldSubjectId, name: 'Old subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SUBJECT', newSubjectId, { id: newSubjectId, name: 'New subject' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const localReview = new LocalReviewService('localstorage', repository)
  const canonicalState = {
    id: 'late-move-state', knowledgeBlockId: block.id, dueAt: '2026-11-01T00:00:00.000Z',
    version: 0, knowledgeBlockVersion: 1, needsLearning: false, mastered: true, stableSuccessCount: 3,
    nextReviewStage: null, lastPracticeAt: '2026-10-01T00:00:00.000Z', lastReviewId: 'late-move-prior-review',
    pendingReviewId: null, contentHash, canonicalVersion: 0,
  }
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: canonicalState, commands: [], effectiveReviews: [],
  }, [])
  const prepared = await localReview.executeCommand(
    userId, deviceId, block.id, 'late-move-command', 'REVIEW_SELECTED', 'GOOD',
    '2026-10-09T06:50:00.000000Z', 0, contentHash, {
      clientCommandId: 'late-move-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash, occurredAt: '2026-10-09T06:50:00.000000Z', expectedStateAbsent: false, rating: 'GOOD', reviewId: 'late-move-review',
    },
  )
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    selectReview: useReviewApi.selectReview,
  }
  let remoteKbVersion = 1
  let postCount = 0
  let resolveReceipt
  let markPostStarted
  const postStarted = new Promise(resolve => { markPostStarted = resolve })
  const pendingReceipt = new Promise(resolve => { resolveReceipt = resolve })
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId, knowledgeBlockVersion: remoteKbVersion, protocolVersion: 2,
    state: canonicalState, commands: [], effectiveReviews: [],
  })
  useReviewApi.selectReview = async request => {
    postCount += 1
    markPostStarted(request)
    return pendingReceipt
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    const firstSync = sync.syncAllPending(userId, deviceId)
    const frozenRequest = await waitForSignal(postStarted, 'late subject-move POST')
    assert.equal(frozenRequest.contentHash, contentHash)

    await repository.upsert('KNOWLEDGE_BLOCK', block.id, { ...block, subjectId: newSubjectId }, {
      version: 2, syncStatus: 'synced',
    })
    const projected = (await localReview.getSubjectStates(userId, deviceId, newSubjectId)).items[0]
    assert.equal(projected.needsLearning, false, 'a parent-only move preserves the existing schedule')
    assert.equal(projected.mastered, true)
    assert.equal(projected.stableSuccessCount, 3)
    assert.equal(projected.dueAt, '2026-11-01T00:00:00.000Z')
    assert.equal(projected.pendingReviewId, null, 'the old selection remains in the audit after the move')
    const adoptedScopeRecord = await new ReviewRepository('localstorage', repository).getReviewRecord(userId, deviceId, block.id)
    assert.equal(adoptedScopeRecord.subjectId, newSubjectId)

    resolveReceipt({
      ...prepared, commandId: 'late-move-server-command', clientCommandId: frozenRequest.clientCommandId,
    })
    await firstSync
    const reviewRepository = new ReviewRepository('localstorage', repository)
    const currentRecord = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(currentRecord.subjectId, newSubjectId)
    assert.equal(currentRecord.state.needsLearning, false)
    assert.equal(currentRecord.state.pendingReviewId, null, 'a late ACK cannot reactivate the obsolete selection')
    assert.equal(currentRecord.effectiveReviews[0].reviewId, prepared.effectiveReview.reviewId)
    assert.equal(currentRecord.effectiveReviews[0].resolution, 'SUPERSEDED')
    const persisted = JSON.parse(testStorage.getItem(`auralis:v2:${userId}:${deviceId}:review-store`))
    assert.equal(persisted.intents.find(intent => intent.clientCommandId === frozenRequest.clientCommandId).status, 'conflict')

    remoteKbVersion = 2
    await sync.syncAllPending(userId, deviceId)
    assert.equal(postCount, 1, 'the old subject request is never resent after the KB moves')
    assert.equal((await reviewRepository.getReviewRecord(userId, deviceId, block.id)).subjectId, newSubjectId)
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
  }
})

test('a late 409 cannot revive an intent archived by an in-flight body change', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'late-409-body-user'
  const deviceId = 'late-409-body-device'
  const subjectId = 'late-409-body-subject'
  const block = { id: 'late-409-body-kb', subjectId, content: 'late 409 old body', title: 'Late 409' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Late 409' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const hash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const localReview = new LocalReviewService('localstorage', repository)
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  await localReview.executeCommand(
    userId, deviceId, block.id, 'late-409-command', 'REVIEW_SELECTED', 'GOOD', '2026-10-09T08:00:00.000000Z', 0, hash, {
      clientCommandId: 'late-409-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash: hash, occurredAt: '2026-10-09T08:00:00.000000Z', expectedStateAbsent: true, rating: 'GOOD', reviewId: 'late-409-review',
    },
  )
  const originals = { getLifecycleHistory: useReviewApi.getLifecycleHistory, selectReview: useReviewApi.selectReview }
  let signalPost
  let rejectPost
  const postStarted = new Promise(resolve => { signalPost = resolve })
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
    knowledgeBlockId, knowledgeBlockVersion: 1, protocolVersion: 2, state: null, commands: [], effectiveReviews: [],
  })
  useReviewApi.selectReview = async () => {
    signalPost()
    return new Promise((_resolve, reject) => { rejectPost = reject })
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    const running = sync.syncAllPending(userId, deviceId)
    await waitForSignal(postStarted, 'late 409 body-change POST')
    await repository.upsert('KNOWLEDGE_BLOCK', block.id, { ...block, content: 'late 409 new body' }, { version: 2, syncStatus: 'synced' })
    await new LocalReviewService('localstorage', repository).getSubjectStates(userId, deviceId, subjectId)
    rejectPost({ status: 409, message: 'old body rejected' })
    await running
    const intent = await new ReviewRepository('localstorage', repository).getIntent('localstorage', userId, deviceId, 'late-409-command')
    assert.equal(intent.status, 'archived', 'a late failure cannot revive a command invalidated while POST was in flight')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
  }
})

test('scope generation blocks A to B to A late sync work and preserves requests after 401', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'scope-user'
  const deviceId = 'scope-device'
  const subject = { id: 'scope-subject', name: 'Scope subject' }
  const block = { id: 'scope-kb', subjectId: subject.id, content: 'scope content', title: 'Scope block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 2, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  const localReview = new LocalReviewService('localstorage', repository)
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 2, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  const selected = await localReview.executeCommand(
    userId, deviceId, block.id, 'scope-command', 'REVIEW_SELECTED', 'GOOD', '2026-10-09T06:30:00.000000Z', 0, contentHash, {
      clientCommandId: 'scope-command', knowledgeBlockId: block.id, knowledgeBlockVersion: 2,
      baseVersion: 0, contentHash, occurredAt: '2026-10-09T06:30:00.000000Z', expectedStateAbsent: true, rating: 'GOOD', reviewId: 'scope-review',
    },
  )
  const originals = { getLifecycleHistory: useReviewApi.getLifecycleHistory, selectReview: useReviewApi.selectReview }
  let generation = 1
  let activeUser = 'scope-user'
  let postCount = 0
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => {
    generation = 2; activeUser = 'other-user'
    generation = 3; activeUser = 'scope-user'
    return { knowledgeBlockId, knowledgeBlockVersion: 2, protocolVersion: 2, state: null, commands: [], effectiveReviews: [] }
  }
  useReviewApi.selectReview = async (request) => {
    postCount += 1
    return { ...selected, commandId: 'scope-server-command', clientCommandId: request.clientCommandId }
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    const capturedGeneration = generation
    const ticket = { isCurrent: () => generation === capturedGeneration && activeUser === 'scope-user' }
    await assert.rejects(sync.syncAllPending(userId, deviceId, ticket), /SYNC_SCOPE_CHANGED/)
    assert.equal(postCount, 0, 'returning to the same account cannot make an older scope ticket current again')
    assert.equal((await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id))[0].status, 'pending')

    useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => ({
      knowledgeBlockId, knowledgeBlockVersion: 2, protocolVersion: 2, state: null, commands: [], effectiveReviews: [],
    })
    useReviewApi.selectReview = async () => { throw { status: 401, message: 'reauthentication required' } }
    await assert.rejects(sync.syncAllPending(userId, deviceId), error => error?.status === 401)
    const pending = await new ReviewRepository('localstorage', repository).getPendingIntents(userId, deviceId, block.id)
    assert.equal(pending[0].clientCommandId, 'scope-command')
    assert.equal(pending[0].status, 'inflight', '401 leaves the frozen outbox entry available to the existing auth lifecycle')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
  }
})

test('A to B to A late review finally cannot clear the current generation in-flight request', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  await localDb.init()
  const userId = 'aba-user'
  const deviceId = 'aba-device'
  const subject = { id: 'aba-subject', name: 'ABA subject' }
  const block = { id: 'aba-kb', subjectId: subject.id, content: 'ABA review content', title: 'ABA block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  const bootstrapAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  await new LocalReviewService('localstorage', repository).executeCommand(
    userId, deviceId, block.id, 'aba-learning-complete', 'LEARNING_COMPLETED', null, bootstrapAt, 0, contentHash, {
      clientCommandId: 'aba-learning-complete', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash, occurredAt: bootstrapAt, expectedStateAbsent: true,
    },
  )

  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  const setSession = (id, sessionId, device = deviceId) => auth.setSession({
    user: { id, email: `${id}@example.test` },
    tokens: { accessToken: `${id}-access`, refreshToken: `${id}-refresh` },
    sessionId,
    serverDeviceId: device,
  })
  setSession(userId, 'aba-session-a1')
  const store = useReviewStore()
  store.reconcileSubjectBlocks(subject.id, [block.id])
  await store.loadSubjectStates(subject.id)

  const originalExecute = LocalReviewService.prototype.executeCommand
  const deferred = []
  const serviceCalls = []
  LocalReviewService.prototype.executeCommand = function (...args) {
    serviceCalls.push({ instance: this, args })
    return new Promise((resolve, reject) => deferred.push({ resolve, reject }))
  }
  const waitForCalls = async (count) => {
    for (let index = 0; index < 50 && serviceCalls.length < count; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    assert.equal(serviceCalls.length, count, `expected ${count} local lifecycle calls`)
  }
  try {
    store.startLifecycleRound({ subjectId: subject.id, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5 })
    const oldRequest = store.selectLifecycleRating(subject.id, 'GOOD', contentHash).catch(error => error)
    await waitForCalls(1)

    setSession('aba-other-user', 'aba-session-b', 'aba-other-device')
    setSession(userId, 'aba-session-a2')
    store.reconcileSubjectBlocks(subject.id, [block.id])
    await store.loadSubjectStates(subject.id)
    store.startLifecycleRound({ subjectId: subject.id, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5 })
    const currentRequest = store.selectLifecycleRating(subject.id, 'HARD', contentHash)
    await waitForCalls(2)

    deferred[0].resolve({})
    const staleResult = await oldRequest
    assert.match(staleResult.message, /SYNC_SCOPE_CHANGED/)
    const retry = store.retryLifecyclePending(subject.id)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(serviceCalls.length, 2, 'the old generation finally must not delete the newer in-flight request')

    const latest = serviceCalls[1]
    const response = await originalExecute.apply(latest.instance, latest.args)
    deferred[1].resolve(response)
    await Promise.all([currentRequest, retry])
    assert.equal(store.getLifecycleRound(subject.id).currentRating, 'HARD')
    assert.equal(serviceCalls.length, 2)
  } finally {
    LocalReviewService.prototype.executeCommand = originalExecute
  }
})

test('local review lifecycle matches Java service parity fixtures', async () => {
  const fixtureUrl = new URL('./fixtures/review-lifecycle-parity-fixtures.json', import.meta.url)
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'))
  const { ReviewLifecycleEngine } = await import('../src/services/reviewLifecycleEngine.ts')

  for (const scenario of fixtures) {
    for (let index = 0; index < scenario.events.length; index += 1) {
      const event = scenario.events[index]
      const baseline = event.input.schedulingBaseline ?? null
      const reviewId = scenario.events[0].expected.effectiveReview?.reviewId ?? `fixture-${scenario.name}`
      const state = event.input.state
        ? { ...event.input.state, knowledgeBlockId: 'fixture-kb', version: index, knowledgeBlockVersion: 9,
            lastReviewId: event.input.state.lastReviewId ?? null,
            pendingReviewId: event.input.state.pendingReviewId ?? (index > 0 ? reviewId : null),
            contentHash: 'fixture-hash' }
        : null
      const response = ReviewLifecycleEngine.processCommand(
        state,
        'fixture-kb',
        event.input.action,
        event.input.rating ?? null,
        event.input.occurredAt,
        `fixture-command-${scenario.name}-${index}`,
        index,
        9,
        'fixture-hash',
        {
          reviewId,
          selectedRating: scenario.events[0].input.rating ?? null,
          selectedAt: scenario.events[0].input.occurredAt,
          schedulingBaseline: baseline,
          previousEffectiveReview: scenario.events[0].expected.effectiveReview ?? null,
        },
      )
      const expectedState = event.expected.state
      for (const key of ['dueAt', 'needsLearning', 'mastered', 'stableSuccessCount', 'nextReviewStage', 'lastPracticeAt', 'stability', 'reps', 'lapses']) {
        if (Object.hasOwn(expectedState, key)) {
          assert.equal(response.state[key], expectedState[key], `${scenario.name}[${index}].state.${key}`)
        }
      }
      if (event.expected.effectiveReview === null) {
        assert.equal(response.effectiveReview, null, `${scenario.name}[${index}].effectiveReview`)
      } else {
        const actual = response.effectiveReview
        const expected = event.expected.effectiveReview
        assert.ok(actual, `${scenario.name}[${index}] should produce an effective review`)
        for (const key of ['selectedRating', 'effectiveRating', 'selectedAt', 'resolvedAt', 'resolution']) {
          assert.equal(actual[key] ?? null, expected[key] ?? null, `${scenario.name}[${index}].effectiveReview.${key}`)
        }
        assert.deepEqual(actual.schedulingBaseline ?? null, expected.schedulingBaseline ?? null,
          `${scenario.name}[${index}].effectiveReview.schedulingBaseline`)
      }
    }
  }
})

test('a durable local review wakes the current SyncStore scheduler and online retries it', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { useSyncStore } = await import('../src/store/useSyncStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  await localDb.init()
  const userId = 'wakeup-user'
  const deviceId = 'wakeup-device'
  const sessionId = 'wakeup-session'
  const subject = { id: 'wakeup-subject', name: 'Wakeup subject' }
  const block = { id: 'wakeup-kb', subjectId: subject.id, content: 'wake after durable review', title: 'Wakeup block' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subject.id, subject, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  const bootstrapAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  await new LocalReviewService('localstorage', repository).executeCommand(
    userId, deviceId, block.id, 'wakeup-learning-complete', 'LEARNING_COMPLETED', null, bootstrapAt, 0, contentHash, {
      clientCommandId: 'wakeup-learning-complete', knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash, occurredAt: bootstrapAt, expectedStateAbsent: true,
    },
  )

  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: 'wakeup@example.test' },
    tokens: { accessToken: 'wakeup-access', refreshToken: 'wakeup-refresh' },
    sessionId,
    serverDeviceId: deviceId,
  })
  const syncStore = useSyncStore()
  const reviewStore = useReviewStore()
  reviewStore.reconcileSubjectBlocks(subject.id, [block.id])
  await reviewStore.loadSubjectStates(subject.id)

  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const oldSetTimeout = globalThis.setTimeout
  const oldClearTimeout = globalThis.clearTimeout
  const scheduled = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 500) {
      const handle = { fakeSyncTimer: true, callback, args, canceled: false }
      scheduled.push(handle)
      return handle
    }
    return oldSetTimeout(callback, delay, ...args)
  }
  globalThis.clearTimeout = (handle) => {
    if (handle?.fakeSyncTimer) { handle.canceled = true; return }
    return oldClearTimeout(handle)
  }
  try {
    window.dispatchEvent(new CustomEvent('auralis-realtime-event', { detail: {
      type: 'REVIEW_UPDATED', userId: 'other-user', deviceId, sessionId,
    } }))
    assert.equal(scheduled.length, 0, 'a stale owner event cannot wake the active session')

    reviewStore.startLifecycleRound({ subjectId: subject.id, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5 })
    await reviewStore.selectLifecycleRating(subject.id, 'GOOD', contentHash)
    assert.equal(scheduled.length, 1, 'the durable local review emits REVIEW_UPDATED into the current SyncStore scheduler')
    assert.equal(syncStore.isSyncing, false, 'local review commit completes without waiting for network sync')

    scheduled[0].callback(...scheduled[0].args)
    await new Promise((resolve) => oldSetTimeout(resolve, 0))
    assert.equal(syncStore.isSyncing, false, 'offline scheduled work exits without starting a network cycle')

    window.dispatchEvent(new Event('online'))
    assert.equal(scheduled.length, 2, 'the online listener schedules another cycle for the pending review outbox')
  } finally {
    globalThis.setTimeout = oldSetTimeout
    globalThis.clearTimeout = oldClearTimeout
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator)
    else delete globalThis.navigator
    windowListeners.delete('auralis-realtime-event')
    windowListeners.delete('online')
    windowListeners.delete('auralis-sync-updated')
  }
})

test('a late ReviewSync result cannot publish or set an error after the SyncStore account changes', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useSyncStore } = await import('../src/store/useSyncStore.ts')
  const { useSyncApi } = await import('../src/api/useSyncApi.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { localDb, getLocalRepository, getLocalSqlDatabase } = await import('../src/services/localDb.ts')
  await localDb.init()

  const originalSnapshot = useSyncApi.getSnapshot
  const originalPull = useSyncApi.pullChanges
  const originalPush = useSyncApi.pushChanges
  const originalReviewSync = ReviewSyncService.prototype.syncAllPending
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const oldSetTimeout = globalThis.setTimeout
  let settleReviewSync
  let reviewSyncStarted
  let reviewSyncDatabase
  const enteredReviewSync = new Promise(resolve => { reviewSyncStarted = resolve })
  useSyncApi.getSnapshot = async () => ({
    snapshotCursor: 'review-scope-cursor', subjects: [], sources: [], knowledgeBlocks: [], tasks: [], relations: [],
  })
  useSyncApi.pullChanges = async () => ({ changes: [], nextCursor: 'review-scope-cursor', hasMore: false, resetRequired: false })
  useSyncApi.pushChanges = async () => ({ results: [], serverCursor: 'review-scope-cursor' })
  ReviewSyncService.prototype.syncAllPending = function () {
    reviewSyncDatabase = this.localReview.db
    reviewSyncStarted()
    return new Promise(resolve => { settleReviewSync = resolve })
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: true,
      locks: { request: (_name, _options, operation) => operation() },
    },
  })

  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: 'late-review-user-a', email: 'a@example.test' },
    tokens: { accessToken: 'a-access', refreshToken: 'a-refresh' },
    sessionId: 'late-review-session-a', serverDeviceId: 'late-review-device-a',
  })
  await getLocalRepository('late-review-user-a', 'late-review-device-a')
  const syncStore = useSyncStore()
  const updatedEvents = []
  const onUpdated = () => updatedEvents.push('updated')
  window.addEventListener('auralis-sync-updated', onUpdated)
  try {
    const runningCycle = syncStore.flushNow()
    await waitForSignal(enteredReviewSync, 'ReviewSync call')
    updatedEvents.length = 0
    auth.setSession({
      user: { id: 'late-review-user-b', email: 'b@example.test' },
      tokens: { accessToken: 'b-access', refreshToken: 'b-refresh' },
      sessionId: 'late-review-session-b', serverDeviceId: 'late-review-device-b',
    })
    settleReviewSync({ protocolBlocked: false, conflictCount: 1 })
    await assert.rejects(runningCycle, /SYNC_SCOPE_CHANGED/)
    assert.equal(reviewSyncDatabase, getLocalSqlDatabase(),
      'ReviewSyncService must receive the initialized LocalSqlDatabase/fallback sentinel, not the localDb facade')
    assert.equal(syncStore.reviewSyncError, null, 'the stale account result cannot set the current account review error')
    assert.deepEqual(updatedEvents, [], 'the stale account result cannot publish a projection refresh')
    assert.equal(syncStore.isSyncing, false, 'the old cycle cannot change the new account activity flags')
  } finally {
    window.removeEventListener('auralis-sync-updated', onUpdated)
    ReviewSyncService.prototype.syncAllPending = originalReviewSync
    useSyncApi.getSnapshot = originalSnapshot
    useSyncApi.pullChanges = originalPull
    useSyncApi.pushChanges = originalPush
    globalThis.setTimeout = oldSetTimeout
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator)
    else delete globalThis.navigator
    windowListeners.delete('auralis-sync-updated')
  }
})

test('force-ending a round clears only temporary Pinia state and keeps the durable review intent', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'force-end-review-user'
  const deviceId = 'force-end-review-device'
  const subjectId = 'force-end-review-subject'
  const block = { id: 'force-end-review-kb', subjectId, content: 'durable local review', title: 'Force end' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Force end' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const localReview = new LocalReviewService('localstorage', repository)
  await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  const occurredAt = '2026-10-09T07:00:00.000000Z'
  const commandId = 'force-end-durable-command'
  await localReview.executeCommand(userId, deviceId, block.id, commandId, 'LEARNING_COMPLETED', null,
    occurredAt, 0, contentHash, {
      clientCommandId: commandId, knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 0, contentHash, occurredAt, expectedStateAbsent: true,
    }, subjectId)
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: 'force-end@example.test' },
    tokens: { accessToken: 'force-end-access', refreshToken: 'force-end-refresh' },
    sessionId: 'force-end-session', serverDeviceId: deviceId,
  })
  const store = useReviewStore()
  store.reconcileSubjectBlocks(subjectId, [block.id])
  await store.loadSubjectStates(subjectId)
  const round = store.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: block.id, version: 1 }],
    groupSize: 5,
    manualMode: 'VOLUNTARY',
    manualBlockIds: [block.id],
  })
  assert.deepEqual(round.queue, [block.id], 'the round used to test force-ending must contain the actual voluntary candidate')
  const [intentBefore] = await reviewRepository.getPendingIntents(userId, deviceId, block.id)
  round.pendingCommand = { action: 'LEARNING_COMPLETED', reviewId: null, request: intentBefore.payload }
  assert.throws(() => store.endLifecycleRound(subjectId), /请先确认当前复习操作/,
    'the ordinary end action still protects a temporary pending operation')
  assert.doesNotThrow(() => store.endLifecycleRound(subjectId, true),
    'the explicit force action can discard a failed or stale temporary round')
  assert.equal(store.getLifecycleRound(subjectId), null)
  const [intentAfter] = await reviewRepository.getPendingIntents(userId, deviceId, block.id)
  assert.equal(intentAfter.clientCommandId, commandId)
  assert.equal(intentAfter.status, 'pending', 'ending a temporary round does not archive its durable outbox')
  const record = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
  assert.equal(record.history.length, 1, 'formal local review history remains persisted')
  assert.equal(record.history[0].clientCommandId, commandId)
})

test('force-ending during the local review commit preserves the completed atomic write and wakeup', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { useSyncStore } = await import('../src/store/useSyncStore.ts')
  const { useStatsStore } = await import('../src/store/useStatsStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'force-inflight-review-user'
  const deviceId = 'force-inflight-review-device'
  const subjectId = 'force-inflight-review-subject'
  const block = { id: 'force-inflight-review-kb', subjectId, content: 'atomic in-flight review', title: 'Force in flight' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Force in flight' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  await new LocalReviewService('localstorage', repository).importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])

  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: 'force-inflight@example.test' },
    tokens: { accessToken: 'force-inflight-access', refreshToken: 'force-inflight-refresh' },
    sessionId: 'force-inflight-session', serverDeviceId: deviceId,
  })
  const syncStore = useSyncStore()
  const reviewStore = useReviewStore()
  reviewStore.reconcileSubjectBlocks(subjectId, [block.id])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5 })
  reviewStore.beginLifecycleRecall(subjectId)
  reviewStore.revealLifecycleAnswer(subjectId)
  assert.equal(round.phase, 'LEARNING_CHECK')

  let enteredCommit
  const commitEntered = new Promise(resolve => { enteredCommit = resolve })
  let releaseCommit
  const commitGate = new Promise(resolve => { releaseCommit = resolve })
  const originalSaveReviewCommit = ReviewRepository.prototype.saveReviewCommit
  ReviewRepository.prototype.saveReviewCommit = async function (...args) {
    enteredCommit()
    await commitGate
    return originalSaveReviewCommit.apply(this, args)
  }

  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const oldSetTimeout = globalThis.setTimeout
  const oldClearTimeout = globalThis.clearTimeout
  const scheduled = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 500) {
      const handle = { fakeSyncTimer: true, callback, args, canceled: false }
      scheduled.push(handle)
      return handle
    }
    return oldSetTimeout(callback, delay, ...args)
  }
  globalThis.clearTimeout = handle => {
    if (handle?.fakeSyncTimer) { handle.canceled = true; return }
    return oldClearTimeout(handle)
  }
  try {
    const operation = reviewStore.completeLifecycleLearning(subjectId, contentHash)
    let timeoutHandle
    await Promise.race([
      commitEntered,
      new Promise((_, reject) => { timeoutHandle = oldSetTimeout(() => reject(new Error('local review commit did not reach its persistence boundary')), 5000) }),
    ])
    oldClearTimeout(timeoutHandle)
    assert.ok(round.pendingCommand, 'the action remains in flight while the repository write is delayed')
    reviewStore.endLifecycleRound(subjectId, true)
    assert.equal(reviewStore.getLifecycleRound(subjectId), null, 'force end clears the temporary round during commit')

    releaseCommit()
    const response = await operation
    assert.equal(response.action, 'LEARNING_COMPLETED')
    assert.equal(reviewStore.getLifecycleRound(subjectId), null, 'the late local response cannot recreate the ended round')
    assert.equal(scheduled.length, 1, 'the committed action still wakes the current sync scheduler')
    assert.equal(syncStore.isSyncing, false, 'the local commit and wakeup do not wait for a network cycle')

    const reviewRepository = new ReviewRepository('localstorage', repository)
    const [intent] = await reviewRepository.getPendingIntents(userId, deviceId, block.id)
    const record = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(intent.clientCommandId, response.clientCommandId)
    assert.equal(intent.status, 'pending')
    assert.equal(record.history.length, 1)
    assert.equal(record.history[0].clientCommandId, response.clientCommandId)
    assert.equal(record.state.needsLearning, false)

    const refreshed = await reviewStore.loadSubjectStates(subjectId)
    assert.equal(refreshed.find(state => state.knowledgeBlockId === block.id).needsLearning, false,
      'a later local read sees the committed state after the temporary round ended')
    const stats = await useStatsStore().loadSubjectStats(subjectId, { days: 7, timeZone: 'UTC' })
    assert.equal(stats.pendingReviewCommandCount, 1)
    const today = new Date().toISOString().slice(0, 10)
    assert.equal(stats.daily.find(day => day.date === today)?.learningCompletionCount, 1,
      'local statistics read the same committed learning history')
  } finally {
    releaseCommit()
    ReviewRepository.prototype.saveReviewCommit = originalSaveReviewCommit
    globalThis.setTimeout = oldSetTimeout
    globalThis.clearTimeout = oldClearTimeout
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator)
    else delete globalThis.navigator
    windowListeners.delete('auralis-realtime-event')
    windowListeners.delete('online')
    windowListeners.delete('auralis-sync-updated')
  }
})

test('a failed local review commit during force end leaves no record, intent, or wakeup', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { useSyncStore } = await import('../src/store/useSyncStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()
  const userId = 'force-failed-review-user'
  const deviceId = 'force-failed-review-device'
  const subjectId = 'force-failed-review-subject'
  const block = { id: 'force-failed-review-kb', subjectId, content: 'failed atomic review', title: 'Force failure' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Force failure' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  await new LocalReviewService('localstorage', repository).importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])

  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setSession({
    user: { id: userId, email: 'force-failed@example.test' },
    tokens: { accessToken: 'force-failed-access', refreshToken: 'force-failed-refresh' },
    sessionId: 'force-failed-session', serverDeviceId: deviceId,
  })
  const syncStore = useSyncStore()
  const reviewStore = useReviewStore()
  reviewStore.reconcileSubjectBlocks(subjectId, [block.id])
  await reviewStore.loadSubjectStates(subjectId)
  const round = reviewStore.startLifecycleRound({ subjectId, knowledgeBlocks: [{ id: block.id, version: 1 }], groupSize: 5 })
  reviewStore.beginLifecycleRecall(subjectId)
  reviewStore.revealLifecycleAnswer(subjectId)

  let enteredCommit
  const commitEntered = new Promise(resolve => { enteredCommit = resolve })
  let releaseCommit
  const commitGate = new Promise(resolve => { releaseCommit = resolve })
  const originalSaveReviewCommit = ReviewRepository.prototype.saveReviewCommit
  ReviewRepository.prototype.saveReviewCommit = async function () {
    enteredCommit()
    await commitGate
    throw new Error('injected local review storage failure')
  }
  try {
    const operation = reviewStore.completeLifecycleLearning(subjectId, contentHash)
    let timeoutHandle
    await Promise.race([
      commitEntered,
      new Promise((_, reject) => { timeoutHandle = setTimeout(() => reject(new Error('local review commit did not reach its persistence boundary')), 5000) }),
    ])
    clearTimeout(timeoutHandle)
    reviewStore.endLifecycleRound(subjectId, true)
    assert.equal(reviewStore.getLifecycleRound(subjectId), null)
    releaseCommit()
    await assert.rejects(operation, /injected local review storage failure/)
    assert.equal(reviewStore.getLifecycleRound(subjectId), null, 'the failed operation cannot restore its old round')
    const reviewRepository = new ReviewRepository('localstorage', repository)
    const unchangedRecord = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(unchangedRecord.localRevision, 1, 'failed persistence does not advance the imported record revision')
    assert.equal(unchangedRecord.history.length, 0, 'failed persistence leaves no partial formal history')
    assert.equal(unchangedRecord.state, null, 'failed persistence leaves the imported absent state unchanged')
    assert.deepEqual(await reviewRepository.getPendingIntents(userId, deviceId, block.id), [],
      'failed persistence leaves no outbox intent')
    assert.equal(syncStore.isSyncing, false)
  } finally {
    releaseCommit()
    ReviewRepository.prototype.saveReviewCommit = originalSaveReviewCommit
    windowListeners.delete('auralis-realtime-event')
    windowListeners.delete('online')
    windowListeners.delete('auralis-sync-updated')
  }
})

test('unprepared first learning after multiple local body edits binds to the actual server invalidation version', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { runSyncCycle } = await import('../src/services/syncCycle.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'body-rebase-user'
  const deviceId = 'body-rebase-device'
  const subjectId = 'body-rebase-subject'
  const block = { id: 'body-rebase-kb', subjectId, content: 'body A', title: 'Body rebase' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Body rebase' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const hashContent = async content => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const oldHash = await hashContent(block.content)
  const anchorState = {
    id: 'body-rebase-state', knowledgeBlockId: block.id, dueAt: '2026-10-20T09:00:00.000000Z', version: 0,
    knowledgeBlockVersion: 1, needsLearning: false, mastered: true, stableSuccessCount: 3,
    nextReviewStage: 'FINAL_VERIFICATION', lastPracticeAt: '2026-10-01T09:00:00.000000Z',
    lastReviewId: 'body-rebase-last-review', pendingReviewId: null, contentHash: oldHash,
    parameterSetId: 'default', createdAt: '2026-09-01T00:00:00.000Z', reps: 8, lapses: 1,
    difficulty: 5, stability: 40,
  }
  const reviewService = new LocalReviewService('localstorage', repository)
  const reviewRepository = new ReviewRepository('localstorage', repository)
  assert.equal(await reviewService.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: anchorState, commands: [], effectiveReviews: [],
  }, []), true)

  const bodyB = { ...block, content: 'body B' }
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: bodyB, version: 2, deletedAt: null,
    expectedLocalVersion: 1,
    mutation: { clientMutationId: 'body-rebase-update-b', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
      mutationType: 'UPDATE', baseVersion: 1, payload: bodyB },
  })
  const bodyC = { ...block, content: 'body C' }
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: bodyC, version: 3, deletedAt: null,
    expectedLocalVersion: 2,
    mutation: { clientMutationId: 'body-rebase-update-c', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
      mutationType: 'UPDATE', baseVersion: 2, payload: bodyC },
  })
  const projected = (await reviewService.getSubjectStates(userId, deviceId, subjectId)).items[0]
  assert.equal(projected.version, 0, 'the local projection must not invent a server @Version increment')
  assert.equal(projected.dueAt, anchorState.dueAt, 'body invalidation preserves the server schedule anchor')
  assert.equal(projected.nextReviewStage, 'EARLY_RECALL')
  const occurredAt = '2026-10-09T07:30:00.123456Z'
  const bodyCHash = await hashContent(bodyC.content)
  const localResponse = await reviewService.executeCommand(userId, deviceId, block.id, 'body-rebase-learning',
    'LEARNING_COMPLETED', null, occurredAt, projected.version, bodyCHash, {
      clientCommandId: 'body-rebase-learning', knowledgeBlockId: block.id, knowledgeBlockVersion: 3,
      baseVersion: projected.version, contentHash: bodyCHash, occurredAt, expectedStateAbsent: false,
    }, subjectId)
  const [intent] = await reviewRepository.getPendingIntents(userId, deviceId, block.id)
  assert.equal(intent.prepared, false, 'an intent written while its KB core edits are unresolved remains unfrozen')
  assert.equal(intent.payload.baseVersion, 0, 'the provisional local version is not treated as a canonical request')

  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
  }
  let postCount = 0
  const remoteState = {
    ...anchorState, dueAt: anchorState.dueAt, version: 6, knowledgeBlockVersion: 9,
    contentHash: bodyCHash, needsLearning: true, mastered: false, stableSuccessCount: 0,
    nextReviewStage: 'EARLY_RECALL', lastReviewId: null, pendingReviewId: null,
  }
  useReviewApi.getLifecycleHistory = async () => ({
    knowledgeBlockId: block.id, knowledgeBlockVersion: 9, protocolVersion: 2,
    state: remoteState, commands: [], effectiveReviews: [],
  })
  useReviewApi.completeLearning = async request => {
    postCount += 1
    assert.equal(request.baseVersion, 6, 'preparation uses the actual returned ReviewState version, regardless of increment count')
    assert.equal(request.expectedStateAbsent, false)
    assert.equal(request.knowledgeBlockVersion, 9,
      'the prepared command binds to the actual KB version returned after both local body updates')
    assert.equal(request.occurredAt, occurredAt)
    return {
      ...localResponse, commandId: 'server-body-rebase-learning', clientCommandId: request.clientCommandId,
      knowledgeBlockVersion: 9,
      state: { ...localResponse.state, version: 7, knowledgeBlockVersion: 9, contentHash: bodyCHash },
    }
  }
  try {
    const pendingBeforeCoreAck = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(pendingBeforeCoreAck.syncedCommandCount, 0)
    assert.equal(postCount, 0, 'ReviewSync waits for all local KB edits to settle before fetching/preparing history')
    const unresolvedBeforeAck = await repository.listUnresolved('KNOWLEDGE_BLOCK')
    assert.equal(unresolvedBeforeAck.length, 1, 'the repository coalesces the two local body edits into one core mutation')
    await repository.saveCursor('body-rebase-before-core-ack', false)
    await runSyncCycle({
      repository,
      serverDeviceId: deviceId,
      api: {
        async pushChanges({ mutations }) {
          assert.equal(mutations.length, 1)
          assert.equal(mutations[0].payload.content, 'body C')
          return { results: [{
            clientMutationId: mutations[0].clientMutationId, decision: 'APPLIED',
            resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, mutationType: 'UPDATE',
            current: { ...bodyC, version: 9 },
          }], serverCursor: 'body-rebase-after-core-ack' }
        },
        async pullChanges({ cursor }) {
          assert.equal(cursor, 'body-rebase-before-core-ack')
          return { changes: [], nextCursor: cursor, hasMore: false, resetRequired: false }
        },
        async getSnapshot() { assert.fail('the core ACK test starts with a current sync cursor') },
      },
    })
    assert.equal((await repository.read('KNOWLEDGE_BLOCK', block.id)).version, 9)
    assert.equal((await repository.listUnresolved('KNOWLEDGE_BLOCK')).length, 0)
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 1)
    assert.equal(result.conflictCount, 0)
    assert.equal(postCount, 1)
    assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, block.id)).length, 0)
    const record = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(record.state.version, 7)
    assert.equal(record.state.canonicalVersion, 7)
    assert.equal(record.canonicalAnchor.knowledgeBlockVersion, 9)
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})

test('subject state projection reads each review record once for missing and unchanged records', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { ...(globalThis.navigator ?? {}), locks: { request: (_name, _options, operation) => operation() } },
  })
  const originalGetReviewRecord = ReviewRepository.prototype.getReviewRecord
  let reviewRecordReads = 0
  ReviewRepository.prototype.getReviewRecord = async function (...args) {
    reviewRecordReads += 1
    return originalGetReviewRecord.apply(this, args)
  }
  try {
    await localDb.init()
    const userId = 'subject-state-read-count-user'
    const deviceId = 'subject-state-read-count-device'
    const subjectId = 'subject-state-read-count-subject'
    const repository = await getLocalRepository(userId, deviceId)
    await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Read count' }, { version: 1, syncStatus: 'synced' })
    const blocks = ['missing-a', 'unchanged', 'missing-b'].map(id => ({
      id: `subject-state-read-count-${id}`,
      subjectId,
      title: id,
      content: `Content for ${id}`,
    }))
    for (const block of blocks) {
      await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
    }

    const unchangedBlock = blocks[1]
    const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(unchangedBlock.content),
    )), value => value.toString(16).padStart(2, '0')).join('')
    const reviewRepository = new ReviewRepository('localstorage', repository)
    await reviewRepository.saveReviewRecord('localstorage', userId, deviceId, {
      knowledgeBlockId: unchangedBlock.id,
      subjectId,
      localRevision: 1,
      serverKnowledgeBlockVersion: 1,
      contentHash,
      state: null,
      history: [],
      effectiveReviews: [],
      historyImported: true,
      canonicalAnchor: {
        knowledgeBlockVersion: 1,
        subjectId,
        contentHash,
        state: null,
        commands: [],
        effectiveReviews: [],
      },
      isPresenceMarker: true,
      updatedAt: new Date().toISOString(),
    })

      const states = await new LocalReviewService('localstorage', repository)
        .getSubjectStates(userId, deviceId, subjectId)
      assert.equal(states.items.length, blocks.length)
      assert.deepEqual(new Set(states.items.map(state => state.knowledgeBlockId)), new Set(blocks.map(block => block.id)))
      assert.equal(reviewRecordReads, blocks.length,
        'N blocks with missing or unchanged records should perform N lock-scoped record reads, not a second read per block')
  } finally {
    ReviewRepository.prototype.getReviewRecord = originalGetReviewRecord
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
})

test('an external lifecycle command after a body edit prevents automatic request rebase', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'body-external-review-user'
  const deviceId = 'body-external-review-device'
  const subjectId = 'body-external-review-subject'
  const block = { id: 'body-external-review-kb', subjectId, content: 'remote body A', title: 'External review' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'External review' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const hashContent = async content => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const oldHash = await hashContent(block.content)
  const anchorState = {
    id: 'body-external-state', knowledgeBlockId: block.id, dueAt: '2026-10-12T00:00:00.000Z', version: 2,
    knowledgeBlockVersion: 1, needsLearning: false, mastered: false, stableSuccessCount: 1,
    nextReviewStage: 'CROSS_DAY', lastPracticeAt: '2026-10-01T00:00:00.000Z',
    lastReviewId: 'body-external-last', pendingReviewId: null, contentHash: oldHash,
    parameterSetId: 'default', createdAt: '2026-09-01T00:00:00.000Z', reps: 2, lapses: 0,
    difficulty: 5, stability: 10,
  }
  const service = new LocalReviewService('localstorage', repository)
  const reviewRepository = new ReviewRepository('localstorage', repository)
  await service.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: anchorState, commands: [], effectiveReviews: [],
  }, [])
  const bodyB = { ...block, content: 'remote body B' }
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: bodyB, version: 2, deletedAt: null,
    expectedLocalVersion: 1,
    mutation: { clientMutationId: 'body-external-update', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
      mutationType: 'UPDATE', baseVersion: 1, payload: bodyB },
  })
  const projected = (await service.getSubjectStates(userId, deviceId, subjectId)).items[0]
  const bodyHash = await hashContent(bodyB.content)
  await service.executeCommand(userId, deviceId, block.id, 'body-external-local-learning', 'LEARNING_COMPLETED', null,
    '2026-10-09T08:00:00.000000Z', projected.version, bodyHash, {
      clientCommandId: 'body-external-local-learning', knowledgeBlockId: block.id, knowledgeBlockVersion: 2,
      baseVersion: projected.version, contentHash: bodyHash, occurredAt: '2026-10-09T08:00:00.000000Z',
      expectedStateAbsent: false,
    }, subjectId)
  for (const mutation of await repository.claimPending(200)) {
    await repository.settleMutation({ ...mutation, status: 'applied' })
  }

  const invalidatedRemoteState = {
    ...anchorState, version: 7, knowledgeBlockVersion: 2, contentHash: bodyHash,
    needsLearning: true, mastered: false, stableSuccessCount: 0, nextReviewStage: 'EARLY_RECALL',
    lastReviewId: null, pendingReviewId: null,
  }
  const externalCommand = {
    commandId: 'external-body-command-server-id', clientCommandId: 'external-device-review',
    action: 'LEARNING_COMPLETED', occurredAt: '2026-10-09T08:00:00.000000Z', reviewId: null,
    rating: null, durationSeconds: null, baseVersion: 6, knowledgeBlockVersion: 2,
  }
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
  }
  let postCount = 0
  useReviewApi.getLifecycleHistory = async () => ({
    knowledgeBlockId: block.id, knowledgeBlockVersion: 2, protocolVersion: 2,
    state: { ...invalidatedRemoteState, version: 8, needsLearning: false, dueAt: '2026-10-09T08:03:00.000000Z' },
    commands: [externalCommand], effectiveReviews: [],
  })
  useReviewApi.completeLearning = async () => { postCount += 1; throw { status: 409 } }
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(postCount, 0, 'a remote lifecycle command after the canonical anchor must block automatic rebase')
    assert.equal(result.conflictCount, 1)
    const [intent] = await reviewRepository.getUnresolvedIntents(userId, deviceId, [block.id])
    assert.equal(intent.clientCommandId, 'body-external-local-learning')
    assert.equal(intent.status, 'conflict')
    assert.equal(intent.prepared, false, 'proof failure retains the draft and never freezes a different server base')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})

test('an unprepared review intent binds to the actual KB version returned by core mutation sync', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { runSyncCycle } = await import('../src/services/syncCycle.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'review-metadata-ack-user'
  const deviceId = 'review-metadata-ack-device'
  const subjectId = 'review-metadata-ack-subject'
  const block = { id: 'review-metadata-ack-kb', subjectId, content: 'unchanged review body', title: 'Before title' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Metadata ACK' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 2, syncStatus: 'synced' })
  const hashContent = async content => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const contentHash = await hashContent(block.content)
  const state = {
    id: 'review-metadata-ack-state', knowledgeBlockId: block.id, dueAt: '2026-10-12T09:00:00.000000Z', version: 0,
    knowledgeBlockVersion: 2, needsLearning: true, mastered: false, stableSuccessCount: 0,
    nextReviewStage: 'EARLY_RECALL', lastPracticeAt: null, lastReviewId: null, pendingReviewId: null,
    contentHash, parameterSetId: 'default', createdAt: '2026-10-01T00:00:00.000Z', reps: 0, lapses: 0,
    difficulty: 5, stability: 0,
  }
  const localReview = new LocalReviewService('localstorage', repository)
  const reviewRepository = new ReviewRepository('localstorage', repository)
  const initialHistory = {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 2, protocolVersion: 2,
    state, commands: [], effectiveReviews: [],
  }
  assert.equal(await localReview.importLifecycleHistory(userId, deviceId, block.id, initialHistory), true)

  const localState = await localReview.getKnowledgeBlockState(userId, deviceId, block.id, subjectId)
  const occurredAt = '2026-10-09T09:00:00.000000Z'
  const commandId = 'review-metadata-ack-command'
  const localReceipt = await localReview.executeCommand(userId, deviceId, block.id, commandId, 'LEARNING_COMPLETED', null,
    occurredAt, localState.version, contentHash, {
      clientCommandId: commandId, knowledgeBlockId: block.id, knowledgeBlockVersion: 2,
      baseVersion: localState.version, contentHash, occurredAt, expectedStateAbsent: false,
    }, subjectId)
  const [capturedIntent] = await reviewRepository.getPendingIntents(userId, deviceId, block.id)
  assert.equal(capturedIntent.payload.knowledgeBlockVersion, 2,
    'the offline command preserves the canonical KB version it observed when the user acted')
  assert.equal(capturedIntent.prepared, false)

  const renamedBlock = { ...block, title: 'After title' }
  await repository.commitMutation({
    resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: renamedBlock, version: 3, deletedAt: null,
    expectedLocalVersion: 2,
    mutation: { clientMutationId: 'review-metadata-core-update', resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id,
      mutationType: 'UPDATE', baseVersion: 2, payload: renamedBlock },
  })
  await repository.saveCursor('review-metadata-before-push', false)
  await runSyncCycle({
    repository,
    serverDeviceId: deviceId,
    api: {
      async pushChanges({ mutations }) {
        assert.equal(mutations.length, 1)
        assert.equal(mutations[0].clientMutationId, 'review-metadata-core-update')
        return { results: [{
          clientMutationId: 'review-metadata-core-update', decision: 'APPLIED',
          resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, mutationType: 'UPDATE',
          current: { ...renamedBlock, version: 9 },
        }], serverCursor: 'review-metadata-after-push' }
      },
      async pullChanges({ cursor }) {
        assert.equal(cursor, 'review-metadata-before-push')
        return { changes: [], nextCursor: cursor, hasMore: false, resetRequired: false }
      },
      async getSnapshot() { assert.fail('the core ACK test starts with a current sync cursor') },
    },
  })
  assert.equal((await repository.read('KNOWLEDGE_BLOCK', block.id)).version, 9,
    'LocalRepository applies the actual core ACK version before review preparation')
  assert.equal((await repository.listUnresolved('KNOWLEDGE_BLOCK')).length, 0)
  assert.equal((await localReview.getKnowledgeBlockState(userId, deviceId, block.id)).knowledgeBlockVersion, 9)
  assert.equal((await reviewRepository.getReviewRecord(userId, deviceId, block.id)).canonicalAnchor.knowledgeBlockVersion, 2,
    'display revision does not rewrite the independent history anchor')

  const remoteHistory = {
    ...initialHistory,
    knowledgeBlockVersion: 9,
    state: { ...state, knowledgeBlockVersion: 9 },
  }
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
  }
  let postedRequest = null
  useReviewApi.getLifecycleHistory = async () => structuredClone(remoteHistory)
  useReviewApi.completeLearning = async request => {
    postedRequest = structuredClone(request)
    return {
      ...localReceipt,
      commandId: 'review-metadata-server-command',
      clientCommandId: commandId,
      knowledgeBlockVersion: 9,
      state: { ...localReceipt.state, version: 1, knowledgeBlockVersion: 9, contentHash },
    }
  }
  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 1)
    assert.equal(result.conflictCount, 0)
    assert.equal(postedRequest.baseVersion, 0)
    assert.equal(postedRequest.expectedStateAbsent, false,
      'the existing version-zero state remains present through metadata-only core updates')
    assert.equal(postedRequest.knowledgeBlockVersion, 9,
      'the prepared request binds the actual current server KB version after the core ACK')
    assert.equal(postedRequest.contentHash, contentHash)
    assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, block.id)).length, 0)
    const record = await reviewRepository.getReviewRecord(userId, deviceId, block.id)
    assert.equal(record.canonicalAnchor.knowledgeBlockVersion, 9)
    assert.equal(record.canonicalAnchor.state.version, 1)
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})

test('canonical preparation compares same-time command and review histories by identity, not response order', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()
  const userId = 'canonical-order-user'
  const deviceId = 'canonical-order-device'
  const subjectId = 'canonical-order-subject'
  const block = { id: 'canonical-order-kb', subjectId, content: 'same body for stable history', title: 'Canonical order' }
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Canonical order' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', block.id, block, { version: 1, syncStatus: 'synced' })
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  const sameAt = '2026-10-09T10:00:00.000000Z'
  const commandsInAckOrder = [
    { commandId: 'server-command-z', clientCommandId: 'client-command-1', action: 'REVIEW_CONFIRMED',
      occurredAt: sameAt, reviewId: 'review-1', rating: 'GOOD', durationSeconds: null, baseVersion: 0, knowledgeBlockVersion: 1 },
    { commandId: 'server-command-y', clientCommandId: 'client-command-2', action: 'REVIEW_CONFIRMED',
      occurredAt: sameAt, reviewId: 'review-2', rating: 'HARD', durationSeconds: null, baseVersion: 1, knowledgeBlockVersion: 1 },
    { commandId: 'server-command-x', clientCommandId: 'client-command-3', action: 'REVIEW_CONFIRMED',
      occurredAt: sameAt, reviewId: 'review-3', rating: 'GOOD', durationSeconds: null, baseVersion: 2, knowledgeBlockVersion: 1 },
  ]
  const reviewsInAckOrder = ['review-3', 'review-2', 'review-1'].map((reviewId, index) => ({
    reviewId, selectedRating: 'GOOD', effectiveRating: 'GOOD', selectedAt: sameAt,
    resolvedAt: null, resolution: null,
    schedulingBaseline: { dueAt: '2026-10-10T00:00:00.000000Z', mastered: false, stableSuccessCount: index,
      nextReviewStage: 'EARLY_RECALL', lastPracticeAt: null, stability: 0 },
  }))
  const state = {
    knowledgeBlockId: block.id, dueAt: '2026-10-10T00:00:00.000000Z', version: 3, knowledgeBlockVersion: 1,
    needsLearning: true, mastered: false, stableSuccessCount: 0, nextReviewStage: 'EARLY_RECALL',
    lastPracticeAt: sameAt, lastReviewId: 'review-3', pendingReviewId: null, contentHash,
    parameterSetId: 'default', createdAt: '2026-09-01T00:00:00.000Z', reps: 3, lapses: 0, difficulty: 5, stability: 0,
  }
  const localReview = new LocalReviewService('localstorage', repository)
  const reviewRepository = new ReviewRepository('localstorage', repository)
  assert.equal(await localReview.importLifecycleHistory(userId, deviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state, commands: commandsInAckOrder, effectiveReviews: reviewsInAckOrder,
  }, []), true)
  const at = '2026-10-09T10:01:00.000000Z'
  const commandId = 'canonical-order-new-command'
  const localReceipt = await localReview.executeCommand(userId, deviceId, block.id, commandId, 'LEARNING_COMPLETED', null,
    at, 3, contentHash, {
      clientCommandId: commandId, knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
      baseVersion: 3, contentHash, occurredAt: at, expectedStateAbsent: false,
    }, subjectId)

  let remoteHistory = {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2, state,
    // The real repository sorts same-time lifecycle commands by occurredAt,
    // then the server UUID, which can differ from local ACK append order.
    commands: [...commandsInAckOrder].sort((a, b) => a.commandId.localeCompare(b.commandId)),
    effectiveReviews: [...reviewsInAckOrder].sort((a, b) => a.reviewId.localeCompare(b.reviewId)),
  }
  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
  }
  let postCount = 0
  useReviewApi.getLifecycleHistory = async () => structuredClone(remoteHistory)
  useReviewApi.completeLearning = async request => {
    postCount += 1
    assert.equal(request.baseVersion, 3)
    assert.equal(request.expectedStateAbsent, false)
    const response = {
      ...localReceipt, commandId: 'server-command-new', clientCommandId: request.clientCommandId,
      knowledgeBlockVersion: 1,
      state: { ...localReceipt.state, version: 4, knowledgeBlockVersion: 1, contentHash },
    }
    remoteHistory = {
      ...remoteHistory, state: response.state,
      commands: [...remoteHistory.commands, {
        commandId: response.commandId, clientCommandId: response.clientCommandId,
        action: response.action, occurredAt: response.occurredAt, reviewId: null, rating: null,
        durationSeconds: null, baseVersion: request.baseVersion, knowledgeBlockVersion: 1,
      }].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.commandId.localeCompare(b.commandId)),
    }
    return response
  }
  try {
    const sync = new ReviewSyncService('localstorage', repository)
    const reordered = await sync.syncAllPending(userId, deviceId)
    assert.equal(reordered.syncedCommandCount, 1,
      'same-time server ordering alone must not block a complete canonical anchor')
    assert.equal(reordered.conflictCount, 0)
    assert.equal(postCount, 1)
    assert.equal((await reviewRepository.getPendingIntents(userId, deviceId, block.id)).length, 0)

    const nextState = await localReview.getKnowledgeBlockState(userId, deviceId, block.id, subjectId)
    const changedId = 'canonical-order-tampered-command'
    await localReview.executeCommand(userId, deviceId, block.id, changedId, 'LEARNING_COMPLETED', null,
      '2026-10-09T10:02:00.000000Z', nextState.version, contentHash, {
        clientCommandId: changedId, knowledgeBlockId: block.id, knowledgeBlockVersion: 1,
        baseVersion: nextState.version, contentHash, occurredAt: '2026-10-09T10:02:00.000000Z',
        expectedStateAbsent: false,
      }, subjectId)
    remoteHistory.commands[0] = { ...remoteHistory.commands[0], rating: 'AGAIN' }
    const changedSignature = await sync.syncAllPending(userId, deviceId)
    assert.equal(changedSignature.syncedCommandCount, 0)
    assert.equal(changedSignature.conflictCount, 1,
      'the same stable command identity with changed fields remains a conflict')
    assert.equal(postCount, 1, 'a changed canonical signature must never be dispatched')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
  }
})


test('review sync audit timestamp equivalence and false conflict CAS recovery', async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  await localDb.init()

  const userId = 'audit-equiv-user'
  const deviceId = 'audit-equiv-device'
  const subjectId = 'audit-equiv-subject'
  const kbId = 'audit-equiv-kb'
  const kbContent = 'Test knowledge block content for audit equivalence'
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(kbContent),
  )), value => value.toString(16).padStart(2, '0')).join('')

  const repo = await getLocalRepository(userId, deviceId)
  await repo.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Subject' }, { version: 1, syncStatus: 'synced' })
  await repo.upsert('KNOWLEDGE_BLOCK', kbId, { id: kbId, subjectId, title: 'KB', content: kbContent }, { version: 1, syncStatus: 'synced' })

  const reviewRepo = new ReviewRepository('localstorage', repo)

  // Test field comparison with PostgreSQL microsecond round-trip cases
  // Local receipt has nanoseconds, PG re-read has microseconds (half-up rounded)
  const localCreatedAt = '2026-11-03T11:53:24.375032699Z'
  const pgCreatedAt = '2026-11-03T11:53:24.375033Z'
  const localUpdatedAt = '2026-11-03T11:53:25.555019533Z'
  const pgUpdatedAt = '2026-11-03T11:53:25.555020Z'

  const anchorState = {
    knowledgeBlockId: kbId,
    version: 1,
    knowledgeBlockVersion: 1,
    contentHash,
    dueAt: '2026-11-04T10:00:00.000Z',
    needsLearning: false,
    mastered: false,
    stableSuccessCount: 1,
    nextReviewStage: 'EARLY_RECALL',
    lastPracticeAt: '2026-11-03T11:53:25.000Z',
    lastReviewId: 'review-1',
    pendingReviewId: null,
    createdAt: localCreatedAt,
    updatedAt: localUpdatedAt,
  }

  const record = {
    knowledgeBlockId: kbId,
    subjectId,
    localRevision: 1,
    serverKnowledgeBlockVersion: 1,
    contentHash,
    state: anchorState,
    history: [{
      commandId: 'cmd-1',
      clientCommandId: 'client-cmd-1',
      action: 'LEARNING_COMPLETED',
      occurredAt: '2026-11-03T11:53:24.000Z',
      reviewId: null,
      rating: null,
      durationSeconds: null,
      baseVersion: 0,
      knowledgeBlockVersion: 1,
    }],
    effectiveReviews: [],
    historyImported: true,
    canonicalAnchor: {
      knowledgeBlockVersion: 1,
      subjectId,
      contentHash,
      state: anchorState,
      commands: [{
        commandId: 'cmd-1',
        clientCommandId: 'client-cmd-1',
        action: 'LEARNING_COMPLETED',
        occurredAt: '2026-11-03T11:53:24.000Z',
        reviewId: null,
        rating: null,
        durationSeconds: null,
        baseVersion: 0,
        knowledgeBlockVersion: 1,
      }],
      effectiveReviews: [],
    },
    isPresenceMarker: false,
    updatedAt: localUpdatedAt,
  }

  await reviewRepo.saveReviewRecord('localstorage', userId, deviceId, record)

  // Seed two false-conflict intents (both prepared=false, status='conflict')
  const intent1 = {
    clientCommandId: 'conflict-intent-1',
    userId,
    deviceId,
    knowledgeBlockId: kbId,
    action: 'REVIEW_SELECTED',
    occurredAt: '2026-11-03T11:55:00.000Z',
    payload: {
      clientCommandId: 'conflict-intent-1',
      knowledgeBlockId: kbId,
      knowledgeBlockVersion: 1,
      baseVersion: 1,
      contentHash,
      expectedStateAbsent: false,
      rating: 'GOOD',
      reviewId: 'review-2',
      durationSeconds: 15,
      occurredAt: '2026-11-03T11:55:00.000Z',
    },
    status: 'conflict',
    createdAt: '2026-11-03T11:55:01.000Z',
    prepared: false,
    preparation: {
      anchorFingerprint: JSON.stringify(record.canonicalAnchor),
      anchorCommandIds: ['client-cmd-1'],
      anchorSubjectId: subjectId,
      anchorContentHash: contentHash,
      predecessorClientCommandIds: ['client-cmd-1'],
      knownLocalCreate: false,
      allowContentInvalidation: false,
      sequence: 1,
    },
  }

  const intent2 = {
    clientCommandId: 'conflict-intent-2',
    userId,
    deviceId,
    knowledgeBlockId: kbId,
    action: 'REVIEW_CONFIRMED',
    occurredAt: '2026-11-03T11:55:10.000Z',
    payload: {
      clientCommandId: 'conflict-intent-2',
      knowledgeBlockId: kbId,
      knowledgeBlockVersion: 1,
      baseVersion: 1,
      contentHash,
      expectedStateAbsent: false,
      reviewId: 'review-2',
      occurredAt: '2026-11-03T11:55:10.000Z',
    },
    status: 'conflict',
    createdAt: '2026-11-03T11:55:11.000Z',
    prepared: false,
    preparation: {
      anchorFingerprint: JSON.stringify(record.canonicalAnchor),
      anchorCommandIds: ['client-cmd-1'],
      anchorSubjectId: subjectId,
      anchorContentHash: contentHash,
      predecessorClientCommandIds: ['client-cmd-1', 'conflict-intent-1'],
      knownLocalCreate: false,
      allowContentInvalidation: false,
      sequence: 2,
    },
  }

  await reviewRepo.saveIntent('localstorage', userId, deviceId, intent1)
  await reviewRepo.saveIntent('localstorage', userId, deviceId, intent2)

  // Remote history returns PG timestamps (which differ by sub-microsecond precision)
  const remoteHistory = {
    protocolVersion: 2,
    knowledgeBlockId: kbId,
    knowledgeBlockVersion: 1,
    state: {
      ...anchorState,
      createdAt: pgCreatedAt,
      updatedAt: pgUpdatedAt,
    },
    commands: record.canonicalAnchor.commands,
    effectiveReviews: [],
  }

  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    selectReview: useReviewApi.selectReview,
    confirmReview: useReviewApi.confirmReview,
  }

  const dispatched = []
  useReviewApi.getLifecycleHistory = async () => structuredClone(remoteHistory)
  useReviewApi.selectReview = async (req) => {
    dispatched.push(req)
    const effectiveReview = {
      reviewId: req.reviewId,
      selectedRating: req.rating,
      effectiveRating: req.rating,
      selectedAt: req.occurredAt,
      resolvedAt: null,
      resolution: null,
      schedulingBaseline: {
        dueAt: '2026-11-05T10:00:00.000Z',
        mastered: false,
        stableSuccessCount: 2,
        nextReviewStage: 'EARLY_RECALL',
        lastPracticeAt: req.occurredAt,
        stability: 2.5,
      },
    }
    const response = {
      commandId: 'server-cmd-2',
      clientCommandId: req.clientCommandId,
      action: 'REVIEW_SELECTED',
      occurredAt: req.occurredAt,
      knowledgeBlockVersion: 1,
      state: {
        ...remoteHistory.state,
        version: 2,
        pendingReviewId: req.reviewId,
        createdAt: localCreatedAt,
        updatedAt: req.occurredAt,
      },
      effectiveReview,
    }
    remoteHistory.state = {
      ...response.state,
      createdAt: pgCreatedAt,
    }
    remoteHistory.commands.push({
      commandId: response.commandId,
      clientCommandId: response.clientCommandId,
      action: response.action,
      occurredAt: response.occurredAt,
      reviewId: req.reviewId,
      rating: req.rating,
      durationSeconds: req.durationSeconds,
      baseVersion: req.baseVersion,
      knowledgeBlockVersion: 1,
    })
    remoteHistory.effectiveReviews.push(effectiveReview)
    return response
  }

  useReviewApi.confirmReview = async (_reviewId, req) => {
    dispatched.push(req)
    const effectiveReview = {
      ...remoteHistory.effectiveReviews[0],
      resolvedAt: req.occurredAt,
      resolution: 'CONFIRMED',
    }
    const response = {
      commandId: 'server-cmd-3',
      clientCommandId: req.clientCommandId,
      action: 'REVIEW_CONFIRMED',
      occurredAt: req.occurredAt,
      knowledgeBlockVersion: 1,
      state: {
        ...remoteHistory.state,
        version: 3,
        pendingReviewId: null,
        createdAt: localCreatedAt,
        updatedAt: req.occurredAt,
      },
      effectiveReview,
    }
    remoteHistory.state = {
      ...response.state,
      createdAt: pgCreatedAt,
    }
    remoteHistory.commands.push({
      commandId: response.commandId,
      clientCommandId: response.clientCommandId,
      action: response.action,
      occurredAt: response.occurredAt,
      reviewId: req.reviewId,
      rating: null,
      durationSeconds: null,
      baseVersion: req.baseVersion,
      knowledgeBlockVersion: 1,
    })
    remoteHistory.effectiveReviews[0] = effectiveReview
    return response
  }

  try {
    const sync = new ReviewSyncService('localstorage', repo)

    // First sync cycle: recovers FIFO head (intent1), executes prepare -> freeze -> dispatch -> ACK
    const res1 = await sync.syncAllPending(userId, deviceId)
    assert.equal(res1.syncedCommandCount, 1, 'FIFO head must recover and sync')
    assert.equal(dispatched.length, 1)
    assert.equal(dispatched[0].clientCommandId, 'conflict-intent-1')
    assert.equal(dispatched[0].occurredAt, intent1.occurredAt)

    // Second sync cycle: intent2 is now the FIFO head; recovers and syncs along ACK prefix
    const res2 = await sync.syncAllPending(userId, deviceId)
    assert.equal(res2.syncedCommandCount, 1, 'successor head must recover in next cycle')
    assert.equal(dispatched.length, 2)
    assert.equal(dispatched[1].clientCommandId, 'conflict-intent-2')

    // All intents now resolved
    const unresolved = await reviewRepo.getUnresolvedIntents(userId, deviceId, [kbId])
    assert.equal(unresolved.length, 0)
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.selectReview = originals.selectReview
    useReviewApi.confirmReview = originals.confirmReview
  }
})
