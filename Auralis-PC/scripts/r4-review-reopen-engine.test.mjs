import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { register } from 'node:module'
import { test } from 'node:test'

const storageValues = new Map()
globalThis.localStorage = {
  getItem: (key) => storageValues.get(String(key)) ?? null,
  setItem: (key, value) => storageValues.set(String(key), String(value)),
  removeItem: (key) => storageValues.delete(String(key)),
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

test('mastered learning reopen resets the cycle and completion schedules ten minutes', async () => {
  const fixtureUrl = new URL('./fixtures/review-lifecycle-parity-fixtures.json', import.meta.url)
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'))
  const masteredFixture = fixtures.find((scenario) => scenario.name === 'mastered-good')
  assert.ok(masteredFixture, 'use the real Java mastered-state fixture as the starting state')
  const fixtureState = masteredFixture.events[0].input.state
  assert.equal(fixtureState.mastered, true)
  assert.equal(fixtureState.stableSuccessCount, 3)
  assert.equal(fixtureState.nextReviewStage, null)

  const { ReviewLifecycleEngine } = await import('../src/services/reviewLifecycleEngine.ts')
  const knowledgeBlockId = 'mastered-reopen-kb'
  const knowledgeBlockVersion = 12
  const previousHash = 'a'.repeat(64)
  const currentHash = 'b'.repeat(64)
  const initialState = {
    ...fixtureState,
    knowledgeBlockId,
    version: 4,
    knowledgeBlockVersion,
    lastReviewId: 'previous-good-review',
    pendingReviewId: 'previous-good-review',
    contentHash: previousHash,
  }
  const reopenAt = '2026-10-09T08:15:30.654321Z'
  const reopened = ReviewLifecycleEngine.processCommand(
    initialState,
    knowledgeBlockId,
    'LEARNING_REOPENED',
    null,
    reopenAt,
    'mastered-reopen-command',
    initialState.version,
    knowledgeBlockVersion,
    currentHash,
  )

  assert.equal(reopened.action, 'LEARNING_REOPENED')
  assert.equal(reopened.clientCommandId, 'mastered-reopen-command')
  assert.equal(reopened.knowledgeBlockVersion, knowledgeBlockVersion)
  assert.equal(reopened.state.needsLearning, true)
  assert.equal(reopened.state.mastered, false)
  assert.equal(reopened.state.stableSuccessCount, 0)
  assert.equal(reopened.state.nextReviewStage, 'EARLY_RECALL')
  assert.equal(reopened.state.dueAt, reopenAt)
  assert.equal(reopened.state.contentHash, currentHash)
  assert.equal(reopened.state.knowledgeBlockVersion, knowledgeBlockVersion)
  assert.equal(reopened.state.lastPracticeAt, fixtureState.lastPracticeAt,
    'manual reopen preserves lastPracticeAt as the Java service does')
  assert.equal(reopened.state.lastReviewId, null)
  assert.equal(reopened.state.pendingReviewId, null)
  assert.equal(reopened.effectiveReview, null,
    'manual reopen without reviewId must not create or rewrite a review result')

  const completionAt = '2026-10-09T08:17:00.123456Z'
  const completed = ReviewLifecycleEngine.processCommand(
    reopened.state,
    knowledgeBlockId,
    'LEARNING_COMPLETED',
    null,
    completionAt,
    'mastered-reopen-completion-command',
    reopened.state.version,
    knowledgeBlockVersion,
    currentHash,
  )

  assert.equal(completed.action, 'LEARNING_COMPLETED')
  assert.equal(completed.clientCommandId, 'mastered-reopen-completion-command')
  assert.equal(completed.knowledgeBlockVersion, knowledgeBlockVersion)
  assert.equal(completed.state.needsLearning, false)
  assert.equal(completed.state.mastered, false)
  assert.equal(completed.state.stableSuccessCount, 0)
  assert.equal(completed.state.nextReviewStage, 'EARLY_RECALL')
  assert.equal(completed.state.dueAt, '2026-10-09T08:27:00.123456Z')
  assert.equal(completed.state.lastPracticeAt, completionAt)
  assert.equal(completed.state.contentHash, currentHash)
  assert.equal(completed.state.knowledgeBlockVersion, knowledgeBlockVersion)
  assert.equal(completed.state.lastReviewId, null)
  assert.equal(completed.state.pendingReviewId, null)
  assert.equal(completed.effectiveReview, null,
    'learning completion remains a separate command and does not create a review result')

  const commandHistory = [reopened, completed].map(({ action, clientCommandId, effectiveReview }) => ({
    action,
    clientCommandId,
    reviewId: effectiveReview?.reviewId ?? null,
  }))
  assert.deepEqual(commandHistory, [
    { action: 'LEARNING_REOPENED', clientCommandId: 'mastered-reopen-command', reviewId: null },
    { action: 'LEARNING_COMPLETED', clientCommandId: 'mastered-reopen-completion-command', reviewId: null },
  ], 'reopen and completion keep their separate command IDs and do not synthesize review history')
})

test('local GOOD confirmation preserves early progress and graduates only after due final verification', async () => {
  const { ReviewLifecycleEngine } = await import('../src/services/reviewLifecycleEngine.ts')
  const fixtures = JSON.parse(await readFile(
    new URL('./fixtures/review-lifecycle-parity-fixtures.json', import.meta.url), 'utf8',
  ))
  const selectedAt = '2026-10-09T08:00:00.123456Z'
  const resolvedAt = '2026-10-09T09:00:00.123456Z'
  const cases = [
    { name: 'ten-minute early recall', fixture: 'early-good', dueAt: '2026-10-09T07:59:00.123456Z', lastPracticeAt: '2026-10-09T07:49:00.123456Z',
      expected: { dueAt: '2026-10-12T08:00:00.123456Z', mastered: false, stableSuccessCount: 1, nextReviewStage: 'CROSS_DAY' } },
    { name: 'ahead of due date', fixture: 'ahead-of-due-good', dueAt: '2026-10-10T08:00:00.123456Z',
      expected: { dueAt: '2026-10-10T08:00:00.123456Z', mastered: false, stableSuccessCount: 1, nextReviewStage: 'CROSS_DAY' } },
    { name: 'one microsecond before due', fixture: 'ahead-of-due-good', dueAt: '2026-10-09T08:00:00.123457Z',
      expected: { dueAt: '2026-10-09T08:00:00.123457Z', mastered: false, stableSuccessCount: 1, nextReviewStage: 'CROSS_DAY' } },
    { name: 'due final verification after thirty days', fixture: 'due-good-stable-3', dueAt: selectedAt, lastPracticeAt: '2026-09-09T08:00:00.123456Z',
      expected: { dueAt: '2026-11-08T08:00:00.123456Z', mastered: true, stableSuccessCount: 3, nextReviewStage: null } },
    { name: 'due final verification before thirty days', fixture: 'due-good-stable-3', dueAt: selectedAt, lastPracticeAt: '2026-09-10T08:00:00.123456Z',
      expected: { dueAt: '2026-11-08T08:00:00.123456Z', mastered: false, stableSuccessCount: 3, nextReviewStage: 'FINAL_VERIFICATION' } },
    { name: 'one microsecond before thirty days', fixture: 'due-good-stable-3', dueAt: selectedAt, lastPracticeAt: '2026-09-09T08:00:00.123457Z',
      expected: { dueAt: '2026-11-08T08:00:00.123456Z', mastered: false, stableSuccessCount: 3, nextReviewStage: 'FINAL_VERIFICATION' } },
    { name: 'final verification practiced early', fixture: 'due-good-stable-3', dueAt: '2026-10-10T08:00:00.123456Z', lastPracticeAt: '2026-09-09T08:00:00.123456Z',
      expected: { dueAt: '2026-11-08T08:00:00.123456Z', mastered: false, stableSuccessCount: 3, nextReviewStage: 'FINAL_VERIFICATION' } },
    { name: 'mastered sample', fixture: 'mastered-good', dueAt: '2026-10-10T08:00:00.123456Z',
      expected: { dueAt: '2026-10-10T08:00:00.123456Z', mastered: true, stableSuccessCount: 3, nextReviewStage: null } },
  ]
  for (const scenario of cases) {
    const fixture = fixtures.find(item => item.name === scenario.fixture)
    assert.ok(fixture, scenario.fixture)
    const state = {
      ...fixture.events[0].input.state, knowledgeBlockId: 'confirmation-kb',
      version: 3, knowledgeBlockVersion: 9, contentHash: 'a'.repeat(64),
      pendingReviewId: null, lastReviewId: null, dueAt: scenario.dueAt,
      ...(scenario.lastPracticeAt ? { lastPracticeAt: scenario.lastPracticeAt } : {}),
    }
    const reviewId = `confirmation-${scenario.fixture}-${scenario.name}`
    const selected = ReviewLifecycleEngine.processCommand(state, state.knowledgeBlockId,
      'REVIEW_SELECTED', 'GOOD', selectedAt, `select-${reviewId}`, state.version, 9, state.contentHash, { reviewId })
    const confirmed = ReviewLifecycleEngine.processCommand(selected.state, state.knowledgeBlockId,
      'REVIEW_CONFIRMED', null, resolvedAt, `confirm-${reviewId}`, selected.state.version, 9, state.contentHash,
      { reviewId, selectedRating: 'GOOD', selectedAt, schedulingBaseline: selected.effectiveReview.schedulingBaseline })
    for (const key of Object.keys(scenario.expected)) {
      assert.equal(confirmed.state[key], scenario.expected[key], `${scenario.name}: ${key}`)
    }
    assert.equal(confirmed.state.lastPracticeAt, selectedAt, 'confirmation retains the original attempt time')
    assert.equal(confirmed.state.pendingReviewId, null)
    assert.equal(confirmed.effectiveReview.selectedAt, selectedAt)
    assert.equal(confirmed.effectiveReview.resolvedAt, resolvedAt)
  }
})

test('learning completion with an existing state always restarts at ten minutes and clears old progress', async () => {
  const { ReviewLifecycleEngine } = await import('../src/services/reviewLifecycleEngine.ts')
  const fixtures = JSON.parse(await readFile(
    new URL('./fixtures/review-lifecycle-parity-fixtures.json', import.meta.url), 'utf8',
  ))
  const before = fixtures.find(item => item.name === 'due-good-stable-2').events[0].input.state
  const state = { ...before, knowledgeBlockId: 'existing-learning-kb', version: 2, knowledgeBlockVersion: 9,
    needsLearning: true, pendingReviewId: 'superseded-review', lastReviewId: null, contentHash: 'b'.repeat(64) }
  const response = ReviewLifecycleEngine.processCommand(state, state.knowledgeBlockId,
    'LEARNING_COMPLETED', null, '2026-10-09T08:00:00.123456Z', 'existing-learning-completion', 2, 9, state.contentHash)
  assert.equal(response.state.dueAt, '2026-10-09T08:10:00.123456Z')
  assert.equal(response.state.stableSuccessCount, 0)
  assert.equal(response.state.mastered, false)
  assert.equal(response.state.nextReviewStage, 'EARLY_RECALL')
  assert.equal(response.state.pendingReviewId, null)
})

test('local review history keeps prior review results and records reopen then completion', async () => {
  const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const { ReviewRepository } = await import('../src/services/reviewRepository.ts')
  await localDb.init()

  const userId = 'mastered-reopen-history-user'
  const deviceId = 'mastered-reopen-history-device'
  const subjectId = 'mastered-reopen-history-subject'
  const knowledgeBlockId = 'mastered-reopen-history-kb'
  const knowledgeBlockVersion = 12
  const content = 'Mastered local content for reopen history.'
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(content),
  )), (value) => value.toString(16).padStart(2, '0')).join('')
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Mastered history' }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('KNOWLEDGE_BLOCK', knowledgeBlockId, {
    id: knowledgeBlockId, subjectId, title: 'Mastered block', content,
  }, { version: knowledgeBlockVersion, syncStatus: 'synced' })

  const fixtures = JSON.parse(await readFile(
    new URL('./fixtures/review-lifecycle-parity-fixtures.json', import.meta.url), 'utf8',
  ))
  const masteredState = fixtures.find((scenario) => scenario.name === 'mastered-good').events[0].input.state
  const previousReview = {
    reviewId: 'prior-effective-review',
    selectedRating: 'GOOD',
    effectiveRating: 'GOOD',
    selectedAt: '2026-10-07T10:00:00.000000Z',
    resolvedAt: '2026-10-07T10:01:00.000000Z',
    resolution: 'CONFIRMED',
    schedulingBaseline: null,
  }
  const initialVersion = 4
  const reviewRepository = new ReviewRepository('localstorage', repository)
  await reviewRepository.saveReviewRecord('localstorage', userId, deviceId, {
    knowledgeBlockId,
    subjectId,
    localRevision: 3,
    serverKnowledgeBlockVersion: knowledgeBlockVersion,
    contentHash,
    state: {
      ...masteredState,
      knowledgeBlockId,
      version: initialVersion,
      knowledgeBlockVersion,
      lastReviewId: null,
      pendingReviewId: null,
      contentHash,
      canonicalVersion: initialVersion,
      persistedStatePresent: true,
      statePresenceKnown: true,
    },
    history: [{
      commandId: 'prior-command-id',
      clientCommandId: 'prior-client-command-id',
      action: 'REVIEW_CONFIRMED',
      occurredAt: previousReview.resolvedAt,
      reviewId: previousReview.reviewId,
      rating: 'GOOD',
      durationSeconds: null,
      baseVersion: 3,
      knowledgeBlockVersion,
    }],
    effectiveReviews: [previousReview],
    legacyEvents: [],
    legacyHistoryComplete: true,
    historyImported: true,
    isPresenceMarker: false, canonicalAnchor: null, updatedAt: '2026-10-07T10:01:00.000000Z',
  })

  const service = new LocalReviewService('localstorage', repository)
  const reopenAt = '2026-10-09T08:15:30.654321Z'
  const reopened = await service.executeCommand(
    userId, deviceId, knowledgeBlockId, 'history-reopen-command', 'LEARNING_REOPENED', null,
    reopenAt, initialVersion, contentHash,
    {
      clientCommandId: 'history-reopen-command', knowledgeBlockId, knowledgeBlockVersion,
      baseVersion: initialVersion, contentHash, occurredAt: reopenAt, expectedStateAbsent: false,
    },
    subjectId,
  )
  const completionAt = '2026-10-09T08:17:00.123456Z'
  await service.executeCommand(
    userId, deviceId, knowledgeBlockId, 'history-complete-command', 'LEARNING_COMPLETED', null,
    completionAt, reopened.state.version, contentHash,
    {
      clientCommandId: 'history-complete-command', knowledgeBlockId, knowledgeBlockVersion,
      baseVersion: reopened.state.version, contentHash, occurredAt: completionAt, expectedStateAbsent: false,
    },
    subjectId,
  )

  const record = await reviewRepository.getReviewRecord(userId, deviceId, knowledgeBlockId)
  assert.ok(record)
  assert.deepEqual(record.history.map(({ action, clientCommandId, reviewId }) => ({ action, clientCommandId, reviewId })), [
    { action: 'REVIEW_CONFIRMED', clientCommandId: 'prior-client-command-id', reviewId: 'prior-effective-review' },
    { action: 'LEARNING_REOPENED', clientCommandId: 'history-reopen-command', reviewId: null },
    { action: 'LEARNING_COMPLETED', clientCommandId: 'history-complete-command', reviewId: null },
  ])
  assert.deepEqual(record.effectiveReviews.map(({ reviewId }) => reviewId), ['prior-effective-review'],
    'reopening learning does not delete or duplicate the existing effective review')
  assert.equal(record.state.dueAt, '2026-10-09T08:27:00.123456Z')
  assert.equal(record.state.mastered, false)
  assert.equal(record.state.stableSuccessCount, 0)
  assert.equal(record.state.nextReviewStage, 'EARLY_RECALL')
  assert.equal(record.state.contentHash, contentHash)
  assert.equal(record.state.knowledgeBlockVersion, knowledgeBlockVersion)
  assert.deepEqual((await reviewRepository.getPendingIntents(userId, deviceId, knowledgeBlockId))
    .map(({ action, clientCommandId, occurredAt, status }) => ({ action, clientCommandId, occurredAt, status })), [
      { action: 'LEARNING_REOPENED', clientCommandId: 'history-reopen-command', occurredAt: reopenAt, status: 'pending' },
      { action: 'LEARNING_COMPLETED', clientCommandId: 'history-complete-command', occurredAt: completionAt, status: 'pending' },
    ])
})
