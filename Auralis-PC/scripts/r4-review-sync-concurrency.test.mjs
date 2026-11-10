import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const storageValues = new Map()
const testStorage = {
  getItem: (key) => storageValues.get(String(key)) ?? null,
  setItem: (key, value) => storageValues.set(String(key), String(value)),
  removeItem: (key) => storageValues.delete(String(key)),
  key: (index) => [...storageValues.keys()][index] ?? null,
  get length() { return storageValues.size },
}
globalThis.localStorage = testStorage
globalThis.window = {
  localStorage: testStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true },
}

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(new URL(specifier.slice(2) + '.ts', '${srcRootUrl}').href, context)
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
    && context.parentURL && !/\\.(?:ts|js|mjs)$/.test(specifier)) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

function createRepository(blocks, subjectIds, userId) {
  const resources = new Map([
    ...[...subjectIds].map(id => [`SUBJECT\u0000${id}`, {
      id, userId, version: 1, deletedAt: null, value: { id, name: id },
    }]),
    ...blocks.map(block => [`KNOWLEDGE_BLOCK\u0000${block.id}`, {
      id: block.id,
      userId,
      version: 1,
      deletedAt: null,
      value: { id: block.id, subjectId: block.subjectId, content: `body:${block.id}`, title: block.id },
    }]),
  ])
  return {
    async list(resourceType) {
      if (resourceType === 'SUBJECT') {
        return [...subjectIds].map(id => resources.get(`SUBJECT\u0000${id}`))
      }
      return blocks.map(block => resources.get(`KNOWLEDGE_BLOCK\u0000${block.id}`))
    },
    async read(resourceType, resourceId) { return resources.get(`${resourceType}\u0000${resourceId}`) ?? null },
    async listUnresolved() { return [] },
  }
}

function validHistory(knowledgeBlockId, protocolVersion = 2) {
  return {
    knowledgeBlockId,
    knowledgeBlockVersion: 1,
    protocolVersion,
    state: null,
    commands: [],
    effectiveReviews: [],
  }
}

test('review sync caps history reads at three, deduplicates blocks and shares subject projection', async () => {
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const userId = 'review-sync-concurrency-user'
  const deviceId = 'review-sync-concurrency-device'
  const blocks = Array.from({ length: 12 }, (_, index) => ({
    id: `review-sync-kb-${index}`,
    subjectId: index < 8 ? 'review-sync-subject-a' : 'review-sync-subject-b',
  }))
  const inputBlocks = [...blocks, blocks[3]]
  const originals = {
    getSubjectStates: LocalReviewService.prototype.getSubjectStates,
    importLifecycleHistory: LocalReviewService.prototype.importLifecycleHistory,
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
  }
  const projectedSubjects = []
  const importedBlocks = []
  const requestedBlocks = []
  const failedId = blocks[4].id
  let active = 0
  let maxActive = 0
  LocalReviewService.prototype.getSubjectStates = async (_userId, _deviceId, subjectId) => {
    projectedSubjects.push(subjectId)
    await new Promise(resolve => setTimeout(resolve, 5))
    return { items: [], hasMore: false }
  }
  LocalReviewService.prototype.importLifecycleHistory = async (_userId, _deviceId, blockId) => {
    importedBlocks.push(blockId)
    return true
  }
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => {
    requestedBlocks.push(knowledgeBlockId)
    active += 1
    maxActive = Math.max(maxActive, active)
    try {
      await new Promise(resolve => setTimeout(resolve, 8))
      return validHistory(knowledgeBlockId, knowledgeBlockId === failedId ? 1 : 2)
    } finally {
      active -= 1
    }
  }

  try {
    const service = new ReviewSyncService('localstorage', createRepository(inputBlocks, [
      'review-sync-subject-a', 'review-sync-subject-b',
    ], userId))
    const result = await service.syncAllPending(userId, deviceId)
    assert.equal(maxActive, 3)
    assert.equal(active, 0)
    assert.equal(requestedBlocks.length, blocks.length)
    assert.equal(new Set(requestedBlocks).size, blocks.length)
    assert.equal(importedBlocks.length, blocks.length - 1)
    assert.equal(new Set(importedBlocks).has(failedId), false)
    assert.equal(result.protocolBlocked, true)
    assert.deepEqual(projectedSubjects.sort(), ['review-sync-subject-a', 'review-sync-subject-b'])
  } finally {
    LocalReviewService.prototype.getSubjectStates = originals.getSubjectStates
    LocalReviewService.prototype.importLifecycleHistory = originals.importLifecycleHistory
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
  }
})

test('review sync waits for in-flight workers and stops scheduling blocks after scope changes', async () => {
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const userId = 'review-sync-scope-user'
  const deviceId = 'review-sync-scope-device'
  const blocks = Array.from({ length: 8 }, (_, index) => ({
    id: `review-sync-scope-kb-${index}`,
    subjectId: 'review-sync-scope-subject',
  }))
  const originals = {
    getSubjectStates: LocalReviewService.prototype.getSubjectStates,
    importLifecycleHistory: LocalReviewService.prototype.importLifecycleHistory,
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
  }
  let current = true
  let active = 0
  let maxActive = 0
  let startedCount = 0
  let signalStarted
  const started = new Promise(resolve => { signalStarted = resolve })
  const releases = []
  const importedBlocks = []
  LocalReviewService.prototype.getSubjectStates = async () => ({ items: [], hasMore: false })
  LocalReviewService.prototype.importLifecycleHistory = async (_userId, _deviceId, blockId) => {
    importedBlocks.push(blockId)
    return true
  }
  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => {
    active += 1
    startedCount += 1
    maxActive = Math.max(maxActive, active)
    if (startedCount === 3) signalStarted()
    try {
      await new Promise(resolve => releases.push(resolve))
      return validHistory(knowledgeBlockId)
    } finally {
      active -= 1
    }
  }

  try {
    const service = new ReviewSyncService('localstorage', createRepository(blocks, [
      'review-sync-scope-subject',
    ], userId))
    const scope = { key: Symbol('scope'), isCurrent: () => current }
    const syncPromise = service.syncAllPending(userId, deviceId, scope)
    await started
    current = false
    for (const release of releases) release()
    await assert.rejects(syncPromise, /SYNC_SCOPE_CHANGED/)
    assert.equal(maxActive, 3)
    assert.equal(active, 0)
    assert.equal(startedCount, 3)
    assert.deepEqual(importedBlocks, [])
  } finally {
    LocalReviewService.prototype.getSubjectStates = originals.getSubjectStates
    LocalReviewService.prototype.importLifecycleHistory = originals.importLifecycleHistory
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
  }
})

test('cross-KB pool preserves pending command order within each KB', async () => {
  const { ReviewSyncService } = await import('../src/services/reviewSyncService.ts')
  const { ReviewLifecycleEngine } = await import('../src/services/reviewLifecycleEngine.ts')
  const { createPinia, setActivePinia } = await import('pinia')
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useReviewStore } = await import('../src/store/useReviewStore.ts')
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  const { useReviewApi } = await import('../src/api/useReviewApi.ts')
  const userId = 'review-sync-order-user'
  const deviceId = 'review-sync-order-device'
  const subjectId = 'review-sync-order-subject'
  const targetBlock = { id: 'review-sync-order-kb', subjectId }
  const otherBlock = { id: 'review-sync-order-other-kb', subjectId }
  const targetContent = 'Locally available body without imported ReviewState.'
  await localDb.init()
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Review sync order' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', targetBlock.id, {
    id: targetBlock.id, subjectId, title: targetBlock.id, content: targetContent,
  }, { version: 7, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', otherBlock.id, {
    id: otherBlock.id, subjectId, title: otherBlock.id, content: 'Other block for cross-KB worker.',
  }, { version: 1, syncStatus: 'synced' })
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().setSession({
    user: { id: userId, email: 'review-sync-order@example.test' },
    tokens: { accessToken: 'review-sync-order-access', refreshToken: 'review-sync-order-refresh' },
    sessionId: 'review-sync-order-session',
    serverDeviceId: deviceId,
  })
  const reviewStore = useReviewStore()
  reviewStore.reconcileSubjectBlocks(subjectId, [targetBlock.id])
  await reviewStore.loadSubjectStates(subjectId)
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(targetContent),
  )), value => value.toString(16).padStart(2, '0')).join('')
  reviewStore.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: targetBlock.id, version: 7 }],
    groupSize: 5,
    now: new Date('2026-11-01T10:00:00.000Z'),
  })
  reviewStore.beginLifecycleRecall(subjectId)
  reviewStore.revealLifecycleAnswer(subjectId)
  const learned = await reviewStore.completeLifecycleLearning(subjectId, contentHash)
  reviewStore.endLifecycleRound(subjectId, true)
  reviewStore.startLifecycleRound({
    subjectId,
    knowledgeBlocks: [{ id: targetBlock.id, version: 7 }],
    groupSize: 5,
    now: new Date('2026-11-01T10:01:00.000Z'),
    manualMode: 'EARLY_PRACTICE',
    manualBlockIds: [targetBlock.id],
  })
  const selected = await reviewStore.selectLifecycleRating(subjectId, 'GOOD', contentHash)
  const chainIntents = await new ReviewRepository('localstorage', repository)
    .getPendingIntents(userId, deviceId, targetBlock.id)
  assert.deepEqual(chainIntents.map(intent => intent.action), ['LEARNING_COMPLETED', 'REVIEW_SELECTED'])

  const originals = {
    getLifecycleHistory: useReviewApi.getLifecycleHistory,
    completeLearning: useReviewApi.completeLearning,
    selectReview: useReviewApi.selectReview,
    confirmReview: useReviewApi.confirmReview,
  }
  const server = { state: null, commands: [], effectiveReviews: [] }
  const targetEvents = []
  const commandIds = chainIntents.map(intent => intent.clientCommandId)

  function recordServerCommand(response, request, action) {
    server.state = response.state
    server.commands.push({
      commandId: response.commandId,
      clientCommandId: response.clientCommandId,
      action,
      occurredAt: request.occurredAt,
      reviewId: request.reviewId ?? response.effectiveReview?.reviewId ?? null,
      rating: request.rating ?? null,
      durationSeconds: null,
      baseVersion: request.baseVersion,
      knowledgeBlockVersion: request.knowledgeBlockVersion,
    })
    if (response.effectiveReview) {
      const existing = server.effectiveReviews.findIndex(item => item.reviewId === response.effectiveReview.reviewId)
      if (existing < 0) server.effectiveReviews.push(response.effectiveReview)
      else server.effectiveReviews[existing] = response.effectiveReview
    }
    return response
  }

  function applyServerCommand(request, action, selectedReviewId = null) {
    targetEvents.push({ type: 'post', action, clientCommandId: request.clientCommandId })
    const existingReview = selectedReviewId
      ? server.effectiveReviews.find(item => item.reviewId === selectedReviewId)
      : null
    const response = ReviewLifecycleEngine.processCommand(
      server.state,
      targetBlock.id,
      action,
      request.rating ?? null,
      request.occurredAt,
      request.clientCommandId,
      request.baseVersion,
      request.knowledgeBlockVersion,
      request.contentHash,
      existingReview ? {
        reviewId: selectedReviewId,
        selectedRating: existingReview.selectedRating,
        selectedAt: existingReview.selectedAt,
        schedulingBaseline: existingReview.schedulingBaseline,
        previousEffectiveReview: existingReview,
      } : (selectedReviewId ? { reviewId: selectedReviewId } : {}),
    )
    assert.equal(request.expectedStateAbsent, server.state === null)
    assert.equal(request.baseVersion, server.state?.version ?? 0)
    return recordServerCommand(response, request, action)
  }

  useReviewApi.getLifecycleHistory = async ({ knowledgeBlockId }) => {
    if (knowledgeBlockId !== targetBlock.id) return validHistory(knowledgeBlockId)
    targetEvents.push({ type: 'history' })
    return {
      knowledgeBlockId,
      knowledgeBlockVersion: 7,
      protocolVersion: 2,
      state: server.state ? structuredClone(server.state) : null,
      commands: structuredClone(server.commands),
      effectiveReviews: structuredClone(server.effectiveReviews),
    }
  }
  useReviewApi.completeLearning = async request => applyServerCommand(request, 'LEARNING_COMPLETED')
  useReviewApi.selectReview = async request => applyServerCommand(request, 'REVIEW_SELECTED', request.reviewId)
  useReviewApi.confirmReview = async (selectedReviewId, request) => applyServerCommand(request, 'REVIEW_CONFIRMED', selectedReviewId)

  try {
    const result = await new ReviewSyncService('localstorage', repository).syncAllPending(userId, deviceId)
    assert.equal(result.syncedCommandCount, 2, JSON.stringify({ result, targetEvents }))
    assert.equal(result.conflictCount, 0)
    assert.deepEqual(targetEvents.map(event => event.type === 'history' ? 'history' : event.action), [
      'history', 'LEARNING_COMPLETED', 'history', 'REVIEW_SELECTED',
    ])
    assert.deepEqual(server.commands.map(command => command.clientCommandId), commandIds)
    assert.deepEqual(targetEvents.filter(event => event.type === 'post').map(event => event.clientCommandId), commandIds)
    assert.equal(learned.action, 'LEARNING_COMPLETED')
    assert.equal(selected.action, 'REVIEW_SELECTED')
  } finally {
    useReviewApi.getLifecycleHistory = originals.getLifecycleHistory
    useReviewApi.completeLearning = originals.completeLearning
    useReviewApi.selectReview = originals.selectReview
    useReviewApi.confirmReview = originals.confirmReview
  }
})
