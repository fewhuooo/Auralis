import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  buildMobileReviewUrl,
  computeLeadingScrollLeft,
  filterSubjectBlocks,
  formatBlockMeta,
  formatBlockTimestamp,
  parseMobileReviewQuery,
  resolveBlockReviewStage,
  resolveInitialLearnSubjectId,
  selectStudyCandidateIds,
  summarizeSubjectReview,
} from '../src/utils/mobileLearning.ts'
import { ApiProblemError } from '../src/api/protocol.ts'
import { sha256Utf8Hex } from '../src/utils/sha256.ts'

const storeModules = new Map([
  ['@/store/useAuthStore', `
    let generation = Symbol('login');
    const authState = {
      isAuthenticated: true,
      user: { id: 'account' },
      sessionId: 'session',
      serverDeviceId: 'device',
      getLoginGeneration: () => generation,
      __switchAccount(nextUserId) {
        generation = Symbol('login');
        authState.user = nextUserId ? { id: nextUserId } : null;
        authState.isAuthenticated = Boolean(nextUserId);
      },
    };
    export const useAuthStore = () => authState;
  `],
  ['@/store/useSubjectStore', 'export const useSubjectStore = () => ({ subjects: [] });'],
  ['@/store/useBlockStore', `
    const blockState = {
      recentBlocks: [],
      async loadLocalBlocks() {},
    };
    export const useBlockStore = () => blockState;
  `],
  ['@/store/useSyncStore', `
    const syncState = {
      isSyncing: false,
      lastSyncedAt: '',
      async triggerSync() {},
    };
    export const useSyncStore = () => syncState;
  `],
])
const loader = registerHooks({
  resolve(specifier, context, nextResolve) {
    const store = storeModules.get(specifier)
    if (store) {
      return { url: `data:text/javascript,${encodeURIComponent(store)}`, shortCircuit: true }
    }
    if (specifier.startsWith('@/')) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  },
})
const { useDueReview } = await import('../src/composables/useDueReview.ts')
const { useMobileLifecycleReview, lifecyclePendingStorageKey } = await import('../src/composables/useMobileLifecycleReview.ts')
const { useAuthStore: getTestAuthStore } = await import('@/store/useAuthStore')
const { useBlockStore: getTestBlockStore } = await import('@/store/useBlockStore')
const { useSyncStore: getTestSyncStore } = await import('@/store/useSyncStore')
loader.deregister()

function useStorageFixture(context) {
  const storage = new Map()
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prevStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
      clear: () => storage.clear(),
    },
  })
  context.after(() => {
    if (hadOwn) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage })
    } else {
      delete globalThis.localStorage
    }
  })
  return storage
}

test('skipping stays local and a lost GOOD confirmation survives page recreation', async (context) => {
  const storage = useStorageFixture(context)
  const states = ['skip', 'good'].map(knowledgeBlockId => ({
    knowledgeBlockId, knowledgeBlockVersion: 4, contentHash: 'a'.repeat(64), version: 7,
  }))
  const attempts = []
  const confirmations = []
  let queueReads = 0
  const api = {
    async queue() {
      queueReads++
      return { items: confirmations.length ? states.slice(0, 1) : states }
    },
    async block(id) { return { id, title: id, version: 4, content: 'server body' } },
    async attempt(body) {
      attempts.push(structuredClone(body))
      return { state: { version: 8 }, effectiveReview: { effectiveRating: null } }
    },
    async confirm(reviewId, body) {
      confirmations.push({ reviewId, body: structuredClone(body) })
      if (confirmations.length === 1) throw new Error('Response lost')
      return { effectiveReview: { effectiveRating: 'GOOD' } }
    },
  }

  async function openReview() {
    let review
    await renderToString(createSSRApp({
      setup() {
        review = useDueReview(api)
        return () => null
      },
    }))
    await review.loadReview()
    return review
  }

  const review = await openReview()
  await review.skipCard()
  assert.equal(review.activeCard.value.title, 'good')
  assert.equal(review.completedCount.value, 0)
  assert.equal(attempts.length, 0)
  assert.equal(confirmations.length, 0)

  await review.rateCard('GOOD')
  assert.equal(review.activeCard.value.title, 'good')
  assert.equal(review.completedCount.value, 0)
  assert.equal(confirmations.length, 1)
  assert.equal(confirmations[0].reviewId, attempts[0].reviewId)
  assert.equal(confirmations[0].body.baseVersion, 8)

  const reopened = await openReview()
  assert.equal(queueReads, 1)
  assert.equal(reopened.completedCount.value, 0)

  await reopened.retrySave()
  assert.equal(attempts.length, 1)
  assert.equal(confirmations.length, 2)
  assert.deepEqual(confirmations[1], confirmations[0])
  assert.equal(reopened.completedCount.value, 1)
  assert.equal(queueReads, 2)
  assert.equal(reopened.activeCard.value.title, 'skip')
  assert.equal(storage.has('auralis:review:pending:account:device'), false)
})

test('workspace review scopes every page and ignores a late card after switching subjects', async (context) => {
  useStorageFixture(context)
  const enabled = ref(false)
  const subjectId = ref('alpha')
  const alpha = Promise.withResolvers()
  const alphaRequested = Promise.withResolvers()
  const calls = []
  const api = {
    async queue(at, cursor, subject) {
      calls.push({ at, cursor, subject })
      const id = cursor ? `${subject}-next` : subject
      const page = { items: [{ knowledgeBlockId: id, knowledgeBlockVersion: 4 }] }
      return subject === 'beta' && !cursor ? { ...page, hasMore: true, nextCursor: 'beta-cursor' } : page
    },
    async block(id) {
      if (id === 'alpha') {
        alphaRequested.resolve()
        return alpha.promise
      }
      return { id, title: id, subjectId: 'beta', version: 4, content: 'beta body' }
    },
  }
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api, { subjectId: () => subjectId.value, enabled: () => enabled.value })
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())

  await setImmediate()
  assert.deepEqual(calls, [])
  enabled.value = true
  await alphaRequested.promise

  subjectId.value = 'beta'
  assert.equal(review.activeCard.value, null)
  await setImmediate()
  assert.deepEqual(calls.map(({ cursor, subject }) => [cursor, subject]), [
    [undefined, 'alpha'], [undefined, 'beta'], ['beta-cursor', 'beta'],
  ])
  assert.equal(calls[1].at, calls[2].at)
  assert.equal(review.activeCard.value.title, 'beta')
  assert.equal(review.remainingCount.value, 2)

  alpha.resolve({ id: 'alpha', title: 'alpha', subjectId: 'alpha', version: 4, content: 'alpha body' })
  await setImmediate()
  assert.equal(review.activeCard.value.title, 'beta')
  assert.equal(review.loading.value, false)

  enabled.value = false
  assert.equal(review.activeCard.value, null)
  await review.loadReview()
  assert.equal(calls.length, 3)
})

test('workspace recovers a previous subject confirmation before loading without counting it locally', async (context) => {
  const storage = useStorageFixture(context)
  const key = 'auralis:review:pending:account:device'
  const block = { knowledgeBlockId: 'alpha', knowledgeBlockVersion: 4, contentHash: 'a'.repeat(64) }
  const attempt = { ...block, clientCommandId: 'attempt', baseVersion: 7, reviewId: 'review', rating: 'GOOD' }
  const confirmation = { ...block, clientCommandId: 'confirm', baseVersion: 8 }
  storage.set(key, JSON.stringify({ subjectId: 'alpha', attempt, confirmation }))
  const calls = []
  const api = {
    async queue(_at, _cursor, subject) {
      calls.push(['queue', subject])
      return { items: [] }
    },
    async confirm(reviewId, body) {
      calls.push(['confirm', reviewId, body])
      return { effectiveReview: { effectiveRating: 'GOOD' } }
    },
  }
  let review
  await renderToString(createSSRApp({
    setup() {
      review = useDueReview(api, { subjectId: () => 'beta', enabled: () => true })
      return () => null
    },
  }))
  await review.loadReview()
  assert.deepEqual(calls, [])
  assert.match(review.saveError.value, /此前/)
  await review.retrySave()
  assert.deepEqual(calls, [['confirm', 'review', confirmation], ['queue', 'beta']])
  assert.equal(review.completedCount.value, 0)
  assert.equal(storage.has(key), false)
})

test('mobile review scopes strictly to a selected single subject and excludes unconfirmed non-learning states', async (context) => {
  useStorageFixture(context)
  const selectedSubjectId = ref('alpha')
  const calls = []
  const api = {
    async queue(_at, _cursor, subject) {
      calls.push(['queue', subject])
      return {
        items: [{ knowledgeBlockId: `block-${subject}`, knowledgeBlockVersion: 2, needsLearning: false, version: 1, contentHash: 'a'.repeat(64) }],
      }
    },
    async states(subject) {
      calls.push(['states', subject])
      return {
        items: [{
          knowledgeBlockId: `pending-${subject}`,
          knowledgeBlockVersion: 2,
          needsLearning: false,
          pendingReviewId: 'unconfirmed-good',
          version: 2,
          contentHash: 'a'.repeat(64),
        }],
      }
    },
    async block(id) {
      const subjectId = id.endsWith('beta') ? 'beta' : 'alpha'
      return { id, title: id, subjectId, version: 2, content: `content:${id}` }
    },
  }

  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api, {
        subjectId: () => selectedSubjectId.value || undefined,
        enabled: () => Boolean(selectedSubjectId.value),
        circularQueue: true,
        pcCompletion: true,
      })
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())

  await setImmediate()
  assert.deepEqual(calls, [['queue', 'alpha'], ['states', 'alpha']])
  assert.equal(review.activeCard.value.title, 'block-alpha')
  assert.equal(review.sessionQueue.value.length, 1)

  selectedSubjectId.value = ''
  await setImmediate()
  assert.equal(review.activeCard.value, null)

  selectedSubjectId.value = 'beta'
  await setImmediate()
  assert.deepEqual(calls.slice(2), [['queue', 'beta'], ['states', 'beta']])
  assert.equal(review.activeCard.value.title, 'block-beta')
})

test('prevCard steps back only to locally skipped cards without server mutations', async (context) => {
  useStorageFixture(context)
  const states = ['card-1', 'card-2'].map(knowledgeBlockId => ({
    knowledgeBlockId, knowledgeBlockVersion: 1, contentHash: 'b'.repeat(64), version: 1,
  }))
  const api = {
    async queue() { return { items: states } },
    async block(id) { return { id, title: id, version: 1, content: `body:${id}` } },
  }
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api)
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())
  await review.loadReview()
  assert.equal(review.activeCard.value.title, 'card-1')
  assert.equal(review.canGoPrev.value, false)

  await review.skipCard()
  assert.equal(review.activeCard.value.title, 'card-2')
  assert.equal(review.canGoPrev.value, true)

  await review.prevCard()
  assert.equal(review.activeCard.value.title, 'card-1')
  assert.equal(review.canGoPrev.value, false)
  assert.equal(review.completedCount.value, 0)
})

test('prevCard skips past already-rated cards when advancing again without 409 conflict', async (context) => {
  useStorageFixture(context)
  const states = ['card-1', 'card-2', 'card-3'].map(knowledgeBlockId => ({
    knowledgeBlockId, knowledgeBlockVersion: 1, contentHash: 'c'.repeat(64), version: 1,
  }))
  const attempted = new Set()
  const api = {
    async queue() { return { items: states } },
    async block(id) { return { id, title: id, version: 1, content: `body:${id}` } },
    async attempt(req) {
      if (attempted.has(req.knowledgeBlockId)) {
        throw new Error(`Duplicate attempt on ${req.knowledgeBlockId}`)
      }
      attempted.add(req.knowledgeBlockId)
      return { state: { version: 2 } }
    },
    async confirm() { return { effectiveReview: { effectiveRating: 'GOOD' } } },
  }
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api)
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())
  await review.loadReview()

  await review.skipCard()
  assert.equal(review.activeCard.value.title, 'card-2')
  await review.rateCard('GOOD')
  assert.equal(review.activeCard.value.title, 'card-3')
  assert.equal(review.completedCount.value, 1)

  await review.prevCard()
  assert.equal(review.activeCard.value.title, 'card-1')
  assert.equal(review.remainingCount.value, 2)

  await review.skipCard()
  assert.equal(review.activeCard.value.title, 'card-3')
  assert.equal(review.remainingCount.value, 1)

  await review.prevCard()
  assert.equal(review.activeCard.value.title, 'card-1')
  await review.rateCard('GOOD')
  assert.equal(review.activeCard.value.title, 'card-3')
  assert.equal(review.completedCount.value, 2)
})

test('mobile single-subject circular queue prevents ending via left/right swipe and keeps AGAIN cards until PC learning-completion', async (context) => {
  useStorageFixture(context)
  const calls = []
  const stateVersions = new Map([['b1', 1], ['b2', 1]])
  const needsLearningMap = new Map([['b1', false], ['b2', false]])
  const completedSet = new Set()
  const lastReviewMap = new Map()
  const api = {
    async queue(_at, _cursor, subjectId) {
      calls.push(['queue', subjectId])
      return {
        items: ['b1', 'b2']
          .filter(id => !completedSet.has(id) && !needsLearningMap.get(id))
          .map(knowledgeBlockId => ({
            knowledgeBlockId,
            knowledgeBlockVersion: 1,
            contentHash: 'd'.repeat(64),
            version: stateVersions.get(knowledgeBlockId),
            needsLearning: false,
            lastReviewId: lastReviewMap.get(knowledgeBlockId) ?? null,
          })),
      }
    },
    async states(subjectId) {
      calls.push(['states', subjectId])
      return {
        items: ['b1', 'b2'].map(knowledgeBlockId => ({
          knowledgeBlockId,
          knowledgeBlockVersion: 1,
          contentHash: 'd'.repeat(64),
          version: stateVersions.get(knowledgeBlockId),
          needsLearning: needsLearningMap.get(knowledgeBlockId),
          pendingReviewId: null,
          lastReviewId: lastReviewMap.get(knowledgeBlockId) ?? null,
        })),
      }
    },
    async block(id) {
      return { id, title: id, subjectId: 'math', version: 1, content: `body:${id}` }
    },
    async attempt(req) {
      calls.push(['attempt', req.knowledgeBlockId, req.rating])
      assert.equal(needsLearningMap.get(req.knowledgeBlockId), false)
      const nextVersion = stateVersions.get(req.knowledgeBlockId) + 1
      stateVersions.set(req.knowledgeBlockId, nextVersion)
      if (req.rating === 'AGAIN') {
        needsLearningMap.set(req.knowledgeBlockId, true)
        lastReviewMap.set(req.knowledgeBlockId, req.reviewId)
        return {
          state: { version: nextVersion, needsLearning: true, lastReviewId: req.reviewId },
          effectiveReview: { effectiveRating: 'AGAIN' },
        }
      }
      return { state: { version: nextVersion, needsLearning: false }, effectiveReview: { effectiveRating: null } }
    },
    async confirm(_reviewId, body) {
      calls.push(['confirm', body.knowledgeBlockId])
      completedSet.add(body.knowledgeBlockId)
      const nextVersion = stateVersions.get(body.knowledgeBlockId) + 1
      stateVersions.set(body.knowledgeBlockId, nextVersion)
      return { state: { version: nextVersion, needsLearning: false }, effectiveReview: { effectiveRating: 'GOOD' } }
    },
    async completeLearning(body) {
      calls.push(['completeLearning', body.knowledgeBlockId, body.reviewId])
      assert.equal(needsLearningMap.get(body.knowledgeBlockId), true)
      const nextVersion = stateVersions.get(body.knowledgeBlockId) + 1
      stateVersions.set(body.knowledgeBlockId, nextVersion)
      needsLearningMap.set(body.knowledgeBlockId, false)
      return { state: { version: nextVersion, needsLearning: false } }
    },
  }

  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api, {
        subjectId: () => 'math',
        enabled: () => true,
        circularQueue: true,
        pcCompletion: true,
      })
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())
  await setImmediate()

  assert.equal(review.activeCard.value.title, 'b1')
  assert.equal(review.canGoPrev.value, true)
  assert.equal(review.remainingCount.value, 2)

  // Left & right swipes wrap circularly without finishing the round
  await review.prevCard()
  assert.equal(review.activeCard.value.title, 'b2')
  await review.skipCard()
  assert.equal(review.activeCard.value.title, 'b1')
  await review.skipCard()
  assert.equal(review.activeCard.value.title, 'b2')
  assert.equal(review.completedCount.value, 0)

  // AGAIN marks b2 needsLearning=true, rotates circularly to b1, does NOT finish or count b2 complete
  await review.rateCard('AGAIN')
  assert.equal(review.completedCount.value, 0)
  assert.equal(review.remainingCount.value, 2)
  assert.equal(review.activeCard.value.title, 'b1')

  // Mastering b1 leaves only b2 (needsLearning=true); circular skip/prev keep b2 active
  await review.rateCard('GOOD')
  assert.equal(review.completedCount.value, 1)
  assert.equal(review.remainingCount.value, 1)
  assert.equal(review.activeCard.value.title, 'b2')
  assert.equal(review.activeNeedsLearning.value, true)
  assert.equal(review.canGoPrev.value, false)

  await review.skipCard()
  await review.prevCard()
  assert.equal(review.activeCard.value.title, 'b2')

  // Pressing AGAIN again while needsLearning=true must NOT emit another attempt or finish
  await review.rateCard('AGAIN')
  assert.equal(review.activeCard.value.title, 'b2')
  assert.equal(review.completedCount.value, 1)
  assert.equal(calls.filter(c => c[0] === 'attempt' && c[1] === 'b2').length, 1)

  // Reloading restores unresolved needsLearning card b2 from states
  await review.loadReview()
  assert.equal(review.activeCard.value.title, 'b2')
  assert.equal(review.activeNeedsLearning.value, true)

  // Completing b2 via UP swipe calls completeLearning and ends the round
  await review.rateCard('GOOD')
  assert.equal(review.activeCard.value, null)
  assert.equal(review.remainingCount.value, 0)
  assert.ok(calls.some(c => c[0] === 'completeLearning' && c[1] === 'b2'))
})

test('mobile self-test review loads learned non-needsLearning cards after due review finishes and supports AGAIN/GOOD/mastered', async (context) => {
  useStorageFixture(context)
  const statesById = new Map([
    ['due-1', { knowledgeBlockId: 'due-1', knowledgeBlockVersion: 1, contentHash: 'e'.repeat(64), version: 1, needsLearning: false, mastered: false, dueAt: '2026-11-17T00:00:00Z' }],
    ['mastered-1', { knowledgeBlockId: 'mastered-1', knowledgeBlockVersion: 1, contentHash: 'e'.repeat(64), version: 3, needsLearning: false, mastered: true, dueAt: '2026-12-20T00:00:00Z' }],
    ['future-1', { knowledgeBlockId: 'future-1', knowledgeBlockVersion: 1, contentHash: 'e'.repeat(64), version: 2, needsLearning: false, mastered: false, dueAt: '2026-11-25T00:00:00Z' }],
    ['learning-1', { knowledgeBlockId: 'learning-1', knowledgeBlockVersion: 1, contentHash: 'e'.repeat(64), version: 1, needsLearning: true, mastered: false, dueAt: '2026-11-18T11:00:00Z' }],
  ])
  const api = {
    async queue() {
      const due = statesById.get('due-1')
      return { items: due.dueAt === '2026-11-17T00:00:00Z' ? [{ ...due }] : [] }
    },
    async states() {
      return { items: [...statesById.values()].map(item => ({ ...item })) }
    },
    async block(id) {
      return { id, title: id, subjectId: 'math', version: 1, content: `body:${id}` }
    },
    async attempt(req) {
      const cur = statesById.get(req.knowledgeBlockId)
      const next = {
        ...cur,
        version: cur.version + 1,
        needsLearning: req.rating === 'AGAIN',
        mastered: req.rating === 'AGAIN' ? false : cur.mastered,
        lastReviewId: req.reviewId,
      }
      statesById.set(req.knowledgeBlockId, next)
      return {
        state: { ...next },
        effectiveReview: { effectiveRating: req.rating === 'AGAIN' ? 'AGAIN' : null },
      }
    },
    async confirm(_reviewId, body) {
      const cur = statesById.get(body.knowledgeBlockId)
      const next = { ...cur, version: cur.version + 1, dueAt: '2026-11-26T00:00:00Z' }
      statesById.set(body.knowledgeBlockId, next)
      return { state: { ...next }, effectiveReview: { effectiveRating: 'GOOD' } }
    },
    async completeLearning(body) {
      const cur = statesById.get(body.knowledgeBlockId)
      const next = { ...cur, version: cur.version + 1, needsLearning: false }
      statesById.set(body.knowledgeBlockId, next)
      return { state: { ...next } }
    },
  }

  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api, {
        subjectId: () => 'math',
        enabled: () => true,
        circularQueue: true,
        pcCompletion: true,
      })
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())
  await setImmediate()

  // Initially in due mode: due-1 + learning-1 (from pcCompletion), while selfTestCount counts 3 learned blocks (!needsLearning)
  assert.equal(review.reviewMode.value, 'due')
  assert.equal(review.sessionQueue.value.length, 2)
  assert.equal(review.selfTestCount.value, 3)

  await review.rateCard('GOOD') // due-1 -> future, due completed; learning-1 -> completeLearning
  await review.rateCard('GOOD') // completeLearning on learning-1 -> now selfTestCount becomes 4!
  assert.equal(review.activeCard.value, null)
  assert.equal(review.completedCount.value, 2)
  assert.equal(review.selfTestCount.value, 4)

  // Start capped self-test round (2 of 4)
  await review.startSelfTest(2)
  assert.equal(review.reviewMode.value, 'self-test')
  assert.equal(review.sessionQueue.value.length, 2)
  assert.equal(review.completedCount.value, 0)
  assert.ok(review.sessionQueue.value.every(item => !item.needsLearning))

  const firstId = review.sessionQueue.value[0].knowledgeBlockId
  assert.equal(review.activeMastered.value, firstId === 'mastered-1')

  // Swipe AGAIN on first self-test card -> stays in deck with needsLearning=true
  await review.rateCard('AGAIN')
  assert.equal(review.remainingCount.value, 2)
  assert.equal(review.selfTestCount.value, 3)

  // Finish remaining card then complete consolidation on first card
  await review.rateCard('GOOD')
  assert.equal(review.remainingCount.value, 1)
  assert.equal(review.activeNeedsLearning.value, true)
  await review.rateCard('GOOD')
  assert.equal(review.activeCard.value, null)
  assert.equal(review.completedCount.value, 2)
  assert.equal(review.selfTestCount.value, 4)
  assert.equal(review.reviewMode.value, 'self-test')

  // Returning to due mode switches reviewMode back to 'due' cleanly
  await review.loadReview()
  assert.equal(review.reviewMode.value, 'due')
  assert.equal(review.activeCard.value, null)
  assert.equal(review.selfTestCount.value, 4)
})

test('switching subject cancels stale in-flight startSelfTest response', async (context) => {
  useStorageFixture(context)
  const subjectId = ref('alpha')
  const delayedStates = Promise.withResolvers()
  const api = {
    async queue(_at, _cursor, subject) {
      return { items: subject === 'beta' ? [{ knowledgeBlockId: 'beta-due', knowledgeBlockVersion: 1 }] : [] }
    },
    async states(subject) {
      if (subject === 'alpha-slow') return delayedStates.promise
      return {
        items: subject === 'alpha'
          ? [{ knowledgeBlockId: 'alpha-1', knowledgeBlockVersion: 1, needsLearning: false, version: 1 }]
          : [{ knowledgeBlockId: 'beta-due', knowledgeBlockVersion: 1, needsLearning: false, version: 1 }],
      }
    },
    async block(id) {
      const sub = id.startsWith('beta') ? 'beta' : 'alpha'
      return { id, title: id, subjectId: sub, version: 1, content: `body:${id}` }
    },
  }
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api, {
        subjectId: () => subjectId.value,
        enabled: () => true,
        circularQueue: true,
        pcCompletion: true,
      })
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())
  await setImmediate()

  // Trigger slow alpha self-test while replacing states call transiently
  const origStates = api.states
  api.states = (sub) => (sub === 'alpha' ? delayedStates.promise : origStates(sub))
  const selfTestPromise = review.startSelfTest(5)
  subjectId.value = 'beta'
  delayedStates.resolve({ items: [{ knowledgeBlockId: 'alpha-1', knowledgeBlockVersion: 1, needsLearning: false, version: 1 }] })
  await selfTestPromise
  await setImmediate()

  assert.equal(review.reviewMode.value, 'due')
  assert.equal(review.activeCard.value.title, 'beta-due')
})

test('mobileLearning helpers resolve block stages, review summaries, candidate queues, scoped filtering, and query routing', () => {
  const nowMs = Date.parse('2026-11-19T08:00:00Z')
  const dueSet = new Set(['b-due'])

  assert.deepEqual(resolveBlockReviewStage(undefined, dueSet, nowMs), {
    key: 'unstarted',
    label: '待学习',
    tone: 'muted',
  })
  assert.equal(
    resolveBlockReviewStage({ knowledgeBlockId: 'b-need', needsLearning: true }, dueSet, nowMs).label,
    '待巩固',
  )
  assert.equal(
    resolveBlockReviewStage({ knowledgeBlockId: 'b-pending', pendingReviewId: 'rev-1', needsLearning: false }, dueSet, nowMs).label,
    '待核对',
  )
  assert.equal(
    resolveBlockReviewStage({ knowledgeBlockId: 'b-master', mastered: true }, dueSet, nowMs).label,
    '已掌握',
  )
  assert.equal(
    resolveBlockReviewStage({ knowledgeBlockId: 'b-due', dueAt: '2026-11-22T00:00:00Z' }, dueSet, nowMs).label,
    '待复习',
  )
  assert.equal(
    resolveBlockReviewStage({ knowledgeBlockId: 'b-past', dueAt: '2026-11-18T12:00:00Z' }, dueSet, nowMs).label,
    '待复习',
  )
  assert.equal(
    resolveBlockReviewStage({ knowledgeBlockId: 'b-future', dueAt: '2026-11-25T12:00:00Z' }, dueSet, nowMs).label,
    '已学',
  )

  const blocks = [
    { id: 'b1', subject: '数学', subjectId: 'math', title: '贝叶斯公式', preview: '$P(A|B)=\\frac{P(B|A)P(A)}{P(B)}$', time: '2026-11-19T07:00:00Z', source: '第2章讲义', color: '', sync_status: 'synced' },
    { id: 'b2', subject: '数学', subjectId: 'math', title: '特征值', preview: '正交对角化', time: '2026-11-18T09:00:00Z', source: '自主整理', color: '', sync_status: 'synced' },
    { id: 'b5', subject: '数学', subjectId: 'math', title: '全概率', preview: '分割样本空间', time: '2026-11-19T08:00:00Z', source: '课本', color: '', sync_status: 'pending_create' },
    { id: 'b3', subject: '数学', subjectId: 'math', title: '已删除草稿', preview: '应过滤', time: '2026-11-18T08:00:00Z', source: '', color: '', is_deleted: true },
    { id: 'b4', subject: '英语', subjectId: 'eng', title: '贝叶斯阅读', preview: '跨科不应混入', time: '2026-11-18T08:00:00Z', source: '外刊', color: '' },
  ]
  const mathBlocks = blocks.filter(item => item.subjectId === 'math')
  const states = [
    { knowledgeBlockId: 'b1', needsLearning: true, dueAt: '2026-11-19T06:00:00Z' },
    { knowledgeBlockId: 'b2', needsLearning: false, mastered: true, dueAt: '2026-12-20T00:00:00Z' },
    { knowledgeBlockId: 'b6', needsLearning: false, mastered: false, dueAt: '2026-11-18T12:00:00Z' },
    { knowledgeBlockId: 'b7', needsLearning: false, mastered: false, pendingReviewId: 'rev-pending', dueAt: '2026-11-25T12:00:00Z' },
  ]

  const summary = summarizeSubjectReview(mathBlocks, states, new Set(), nowMs)
  assert.deepEqual(summary, {
    blockCount: 5,
    pendingLearningCount: 2,
    unsyncedLearningCount: 1,
    reviewingCount: 2,
    masteredCount: 1,
    dueReviewCount: 2,
    pendingCheckCount: 1,
    selfTestCount: 3,
    masteryPercent: 20,
    distributionPercents: {
      learning: 40,
      reviewing: 40,
      mastered: 20,
    },
    badgeCount: 4,
  })

  // Queue candidate selection for learn, review (pending first, then due asc), and self-test
  const learnCandidates = selectStudyCandidateIds({
    mode: 'learn',
    blocks: mathBlocks,
    states,
    groupSize: 5,
    nowMs,
  })
  assert.deepEqual(learnCandidates, { ids: ['b1'], unsyncedCount: 1 })

  const reviewCandidates = selectStudyCandidateIds({
    mode: 'review',
    blocks: mathBlocks,
    states,
    groupSize: 5,
    nowMs,
  })
  assert.deepEqual(reviewCandidates, { ids: ['b7', 'b6'], unsyncedCount: 1 })

  const selfTestCandidates = selectStudyCandidateIds({
    mode: 'self-test',
    blocks: mathBlocks,
    states,
    groupSize: 2,
    nowMs,
    random: () => 0.5,
  })
  assert.equal(selfTestCandidates.ids.length, 2)
  assert.ok(selfTestCandidates.ids.every(id => ['b2', 'b6', 'b7'].includes(id)))

  // Scoped search filters out deleted and other-subject blocks and matches markdown/TeX excerpts
  assert.deepEqual(filterSubjectBlocks(blocks, 'math', '').map(item => item.id), ['b1', 'b2', 'b5'])
  assert.deepEqual(filterSubjectBlocks(blocks, 'math', '讲义').map(item => item.id), ['b1'])
  assert.deepEqual(filterSubjectBlocks(blocks, 'math', 'p(a|b)').map(item => item.id), ['b1'])

  // Subject resolution and URL encoding/parsing across all three modes + group sizes
  const subjects = [{ id: 's1', name: '概率统计' }, { id: 's2', name: '软件工程' }]
  assert.equal(resolveInitialLearnSubjectId(subjects, 'missing', { s1: 0, s2: 2 }), 's2')
  assert.equal(resolveInitialLearnSubjectId(subjects, 's1', { s1: 0, s2: 2 }), 's1')
  assert.deepEqual(parseMobileReviewQuery({ subjectId: encodeURIComponent('sub/1'), mode: 'learn', groupSize: '10' }), {
    subjectId: 'sub/1',
    mode: 'learn',
    groupSize: 10,
  })
  assert.deepEqual(parseMobileReviewQuery({ subjectId: 's1', mode: 'self-test' }), {
    subjectId: 's1',
    mode: 'self-test',
    groupSize: 5,
  })
  assert.deepEqual(parseMobileReviewQuery({ subjectId: 's1' }), {
    subjectId: 's1',
    mode: 'review',
    groupSize: 5,
  })
  assert.equal(buildMobileReviewUrl('sub/1', 'learn', 10), '/pages/mobile/review/index?subjectId=sub%2F1&mode=learn&groupSize=10')
  assert.equal(buildMobileReviewUrl('sub/1', 'self-test', 5), '/pages/mobile/review/index?subjectId=sub%2F1&mode=self-test&groupSize=5')

  const expectedTs = formatBlockTimestamp('2026-11-18T09:00:00Z')
  assert.equal(formatBlockMeta('自主整理', '2026-11-18T09:00:00Z'), expectedTs)
  assert.equal(formatBlockMeta(' 自主整理 ', null), '')
  assert.equal(formatBlockMeta('', '2026-11-18T09:00:00Z'), expectedTs)
  assert.equal(formatBlockMeta('第2章讲义', '2026-11-18T09:00:00Z'), `第2章讲义 · ${expectedTs}`)
  assert.equal(formatBlockMeta('外刊精读', ''), '外刊精读')

  assert.equal(
    computeLeadingScrollLeft({
      containerLeft: 0,
      containerWidth: 320,
      currentScrollLeft: 0,
      itemLeft: 420,
      leadingInset: 20,
      maxScrollLeft: 600,
    }),
    400,
  )
  assert.equal(
    computeLeadingScrollLeft({
      containerLeft: 0,
      containerWidth: 320,
      currentScrollLeft: 140,
      itemLeft: 180,
      leadingInset: 16,
      maxScrollLeft: 600,
    }),
    304,
  )
  assert.equal(
    computeLeadingScrollLeft({
      containerLeft: 0,
      containerWidth: 320,
      currentScrollLeft: 0,
      itemLeft: 16,
      leadingInset: 20,
    }),
    0,
  )
  assert.equal(
    computeLeadingScrollLeft({
      containerLeft: 0,
      containerWidth: 320,
      currentScrollLeft: 120,
      itemLeft: 500,
      leadingInset: 20,
      maxScrollLeft: 200,
    }),
    200,
  )
  assert.equal(
    computeLeadingScrollLeft({
      containerLeft: 0,
      containerWidth: 0,
      currentScrollLeft: 0,
      itemLeft: 100,
      leadingInset: 20,
    }),
    0,
  )
})

test('sha256Utf8Hex matches Node crypto SHA-256 across Unicode, Markdown, LaTeX, emojis, and multi-block payloads', () => {
  const samples = [
    '',
    'hello auralis',
    '# 贝叶斯定理\n$$P(A\\mid B)=\\frac{P(B\\mid A)P(A)}{P(B)}$$\n包含中文、Greek $\\alpha\\beta\\gamma$ 与 emoji 🎓🔥',
    '多字节混合块-'.repeat(40),
  ]
  for (const sample of samples) {
    const expected = createHash('sha256').update(sample, 'utf8').digest('hex')
    assert.equal(sha256Utf8Hex(sample), expected)
  }
})

test('useDueReview initialMode self-test starts directly via states without reading due queue first', async (context) => {
  useStorageFixture(context)
  let queueCalls = 0
  const api = {
    async queue() {
      queueCalls++
      return { items: [] }
    },
    async states() {
      return {
        items: [
          { knowledgeBlockId: 'k1', knowledgeBlockVersion: 1, needsLearning: false, mastered: true, version: 2 },
          { knowledgeBlockId: 'k2', knowledgeBlockVersion: 1, needsLearning: false, mastered: false, version: 2 },
          { knowledgeBlockId: 'k-learning', knowledgeBlockVersion: 1, needsLearning: true, version: 1 },
        ],
      }
    },
    async block(id) {
      return { id, title: id, subjectId: 'math', version: 1, content: `content:${id}` }
    },
  }

  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api, {
        subjectId: () => 'math',
        enabled: () => true,
        circularQueue: true,
        pcCompletion: true,
        initialMode: () => 'self-test',
        initialSelfTestCount: () => 1,
      })
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())
  await setImmediate()

  assert.equal(queueCalls, 0)
  assert.equal(review.reviewMode.value, 'self-test')
  assert.equal(review.sessionQueue.value.length, 1)
  assert.ok(['k1', 'k2'].includes(review.activeCard.value.title))

  await review.loadReview()
  assert.equal(queueCalls, 1)
  assert.equal(review.reviewMode.value, 'due')
})

function resetTestStores(context, blocks = []) {
  const auth = getTestAuthStore()
  const blockStore = getTestBlockStore()
  const syncStore = getTestSyncStore()
  auth.__switchAccount('account')
  blockStore.recentBlocks = blocks
  syncStore.triggerSync = async () => {}
  context.after(() => {
    auth.__switchAccount('account')
    blockStore.recentBlocks = []
    syncStore.triggerSync = async () => {}
  })
}

function mountLifecycleReview(context, api, options) {
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useMobileLifecycleReview(api, options)
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())
  return { getReview: () => review }
}

test('useMobileLifecycleReview executes first-time learning READ->RECALL->CHECK with expectedStateAbsent and group continuation', async (context) => {
  useStorageFixture(context)
  const blocks = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map(id => ({
    id,
    subjectId: 'math',
    subject: '数学',
    title: `Title-${id}`,
    preview: `Content for ${id}`,
    time: '2026-11-19T08:00:00Z',
    source: '讲义',
    color: '',
    sync_status: 'synced',
    sync_version: 2,
  }))
  resetTestStores(context, blocks)

  const statesById = new Map()
  const completionRequests = []
  const api = {
    async states() {
      return { items: [...statesById.values()] }
    },
    async block(id) {
      return { id, title: `Title-${id}`, subjectId: 'math', version: 2, content: `Content for ${id}` }
    },
    async completeLearning(body) {
      completionRequests.push(structuredClone(body))
      assert.equal(body.expectedStateAbsent, true)
      assert.equal(body.baseVersion, 0)
      assert.equal('reviewId' in body, false)
      assert.equal(body.knowledgeBlockVersion, 2)
      assert.equal(body.contentHash, sha256Utf8Hex(`Content for ${body.knowledgeBlockId}`))
      const created = {
        knowledgeBlockId: body.knowledgeBlockId,
        knowledgeBlockVersion: 2,
        version: 0,
        needsLearning: false,
        mastered: false,
        contentHash: body.contentHash,
        dueAt: '2026-11-22T08:00:00Z',
        lastPracticeAt: body.occurredAt,
      }
      statesById.set(body.knowledgeBlockId, created)
      return {
        clientCommandId: body.clientCommandId,
        action: 'LEARNING_COMPLETED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 2,
        state: { ...created },
        effectiveReview: null,
      }
    },
    async attempt() { throw new Error('unexpected attempt') },
    async confirm() { throw new Error('unexpected confirm') },
    async correct() { throw new Error('unexpected correct') },
    async reopenLearning() { throw new Error('unexpected reopenLearning') },
    async history() { throw new Error('unexpected history') },
  }

  const { getReview } = mountLifecycleReview(context, api, {
    subjectId: () => 'math',
    enabled: () => true,
    initialMode: () => 'learn',
    initialGroupSize: () => 5,
  })
  const review = getReview()
  await setImmediate()

  assert.equal(review.phase.value, 'LEARNING_READ')
  assert.equal(review.activeBlock.value.id, 'l1')
  assert.equal(review.progressCurrent.value, 1)
  assert.equal(review.progressTotal.value, 5)
  assert.equal(review.remainingIds.value.length, 1)

  // Fail learning check loops locally back to LEARNING_READ before completion
  review.beginLearningRecall()
  assert.equal(review.phase.value, 'LEARNING_RECALL')
  review.revealAnswer()
  assert.equal(review.phase.value, 'LEARNING_CHECK')
  review.failLearning()
  assert.equal(review.phase.value, 'LEARNING_READ')

  // Complete first group (5 blocks)
  for (let i = 0; i < 5; i++) {
    assert.equal(review.phase.value, 'LEARNING_READ')
    review.beginLearningRecall()
    review.revealAnswer()
    await review.completeLearning()
  }

  assert.equal(review.phase.value, 'GROUP_COMPLETE')
  assert.equal(review.activeBlock.value, null)
  assert.equal(review.completedCount.value, 5)

  await review.continueNextGroup()
  assert.equal(review.phase.value, 'LEARNING_READ')
  assert.equal(review.activeBlock.value.id, 'l6')
  review.beginLearningRecall()
  review.revealAnswer()
  await review.completeLearning()

  assert.equal(review.phase.value, 'ROUND_COMPLETE')
  assert.equal(review.completedCount.value, 6)
  assert.equal(completionRequests.length, 6)
})

test('useMobileLifecycleReview covers GOOD, HARD->FUZZY local pass, correct->relearn, FUZZY re-fail reopen, AGAIN, and mastered reopen', async (context) => {
  useStorageFixture(context)
  resetTestStores(context)

  const contents = {
    'b-good': 'Body GOOD',
    'b-hard': 'Body HARD',
    'b-corr': 'Body CORR',
    'b-fuzzy-refail': 'Body FUZZY_REFAIL',
    'b-again': 'Body AGAIN',
    'b-mastered': 'Body MASTERED',
  }
  const statesById = new Map(Object.entries({
    'b-good': {
      knowledgeBlockId: 'b-good', knowledgeBlockVersion: 1, version: 0, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T00:00:00Z', contentHash: sha256Utf8Hex(contents['b-good']),
    },
    'b-hard': {
      knowledgeBlockId: 'b-hard', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T01:00:00Z', contentHash: sha256Utf8Hex(contents['b-hard']),
    },
    'b-corr': {
      knowledgeBlockId: 'b-corr', knowledgeBlockVersion: 1, version: 2, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T02:00:00Z', contentHash: sha256Utf8Hex(contents['b-corr']),
    },
    'b-fuzzy-refail': {
      knowledgeBlockId: 'b-fuzzy-refail', knowledgeBlockVersion: 1, version: 3, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T03:00:00Z', contentHash: sha256Utf8Hex(contents['b-fuzzy-refail']),
    },
    'b-again': {
      knowledgeBlockId: 'b-again', knowledgeBlockVersion: 1, version: 4, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T04:00:00Z', contentHash: sha256Utf8Hex(contents['b-again']),
    },
    'b-mastered': {
      knowledgeBlockId: 'b-mastered', knowledgeBlockVersion: 1, version: 5, needsLearning: false, mastered: true,
      dueAt: '2026-12-30T00:00:00Z', contentHash: sha256Utf8Hex(contents['b-mastered']),
    },
  }))
  const calls = []
  const api = {
    async states() {
      return { items: [...statesById.values()].map(item => ({ ...item })) }
    },
    async block(id) {
      return { id, title: id, subjectId: 'math', version: 1, content: contents[id] }
    },
    async attempt(body) {
      calls.push(['attempt', body.knowledgeBlockId, body.rating, body.expectedStateAbsent, body.baseVersion])
      const prev = statesById.get(body.knowledgeBlockId)
      assert.equal(body.expectedStateAbsent, false)
      assert.equal(body.baseVersion, prev.version)
      const again = body.rating === 'AGAIN'
      const next = {
        ...prev,
        version: prev.version + 1,
        needsLearning: again,
        mastered: again ? false : prev.mastered,
        lastReviewId: body.reviewId,
        pendingReviewId: again ? null : body.reviewId,
        lastPracticeAt: body.occurredAt,
      }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_SELECTED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: {
          reviewId: body.reviewId,
          selectedRating: body.rating,
          effectiveRating: again ? 'AGAIN' : null,
          selectedAt: body.occurredAt,
          resolvedAt: again ? body.occurredAt : null,
          resolution: again ? 'AGAIN_SELECTED' : null,
        },
      }
    },
    async confirm(reviewId, body) {
      calls.push(['confirm', body.knowledgeBlockId, reviewId, body.baseVersion])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = {
        ...prev,
        version: prev.version + 1,
        pendingReviewId: null,
        dueAt: '2026-11-26T00:00:00Z',
        lastPracticeAt: body.occurredAt,
      }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_CONFIRMED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: {
          reviewId,
          selectedRating: 'GOOD',
          effectiveRating: 'GOOD',
          selectedAt: body.occurredAt,
          resolvedAt: body.occurredAt,
          resolution: 'CONFIRMED',
        },
      }
    },
    async correct(reviewId, body) {
      calls.push(['correct', body.knowledgeBlockId, reviewId, body.baseVersion])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = {
        ...prev,
        version: prev.version + 1,
        needsLearning: true,
        mastered: false,
        pendingReviewId: null,
        lastReviewId: reviewId,
        lastPracticeAt: body.occurredAt,
      }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_CORRECTED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: {
          reviewId,
          selectedRating: 'HARD',
          effectiveRating: 'AGAIN',
          selectedAt: body.occurredAt,
          resolvedAt: body.occurredAt,
          resolution: 'CORRECTED_AGAIN',
        },
      }
    },
    async reopenLearning(body) {
      calls.push(['reopen', body.knowledgeBlockId, body.reviewId ?? null, body.baseVersion])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = {
        ...prev,
        version: prev.version + 1,
        needsLearning: true,
        mastered: false,
        pendingReviewId: null,
        lastReviewId: body.reviewId ?? null,
        lastPracticeAt: body.occurredAt,
      }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'LEARNING_REOPENED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: null,
      }
    },
    async completeLearning(body) {
      calls.push(['completeLearning', body.knowledgeBlockId, body.reviewId ?? null, body.baseVersion])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = {
        ...prev,
        version: prev.version + 1,
        needsLearning: false,
        mastered: false,
        dueAt: '2026-11-22T00:00:00Z',
        lastPracticeAt: body.occurredAt,
      }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'LEARNING_COMPLETED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: null,
      }
    },
    async history() { throw new Error('unexpected history') },
  }

  const { getReview } = mountLifecycleReview(context, api, {
    subjectId: () => 'math',
    enabled: () => true,
    initialMode: () => 'review',
    initialGroupSize: () => 5,
  })
  const review = getReview()
  await setImmediate()

  // 5 due non-mastered cards loaded in dueAt order; b-mastered excluded from due queue
  assert.equal(review.activeBlock.value.id, 'b-good')
  assert.equal(review.phase.value, 'REVIEW_RECALL')

  // 1) b-good: GOOD -> REVIEW_CHECK -> confirmReview
  await review.selectRating('GOOD')
  assert.equal(review.phase.value, 'REVIEW_CHECK')
  await review.confirmReview()

  // 2) b-hard: HARD -> REVIEW_CHECK -> confirmReview (queued for FUZZY)
  assert.equal(review.activeBlock.value.id, 'b-hard')
  await review.selectRating('HARD')
  assert.equal(review.phase.value, 'REVIEW_CHECK')
  await review.confirmReview()

  // 3) b-corr: GOOD -> REVIEW_CHECK -> correctReview (记错了) -> LEARNING_READ -> completeLearning with reviewId
  assert.equal(review.activeBlock.value.id, 'b-corr')
  await review.selectRating('GOOD')
  assert.equal(review.phase.value, 'REVIEW_CHECK')
  await review.correctReview()
  assert.equal(review.phase.value, 'LEARNING_READ')
  review.beginLearningRecall()
  review.revealAnswer()
  await review.completeLearning()

  // 4) b-fuzzy-refail: HARD -> REVIEW_CHECK -> correctReview (marks corrected=true + puts in FUZZY) -> completeLearning
  assert.equal(review.activeBlock.value.id, 'b-fuzzy-refail')
  await review.selectRating('HARD')
  await review.correctReview()
  assert.equal(review.phase.value, 'LEARNING_READ')
  review.beginLearningRecall()
  review.revealAnswer()
  await review.completeLearning()

  // 5) b-again: AGAIN -> immediate LEARNING_READ -> completeLearning with reviewId
  assert.equal(review.activeBlock.value.id, 'b-again')
  await review.selectRating('AGAIN')
  assert.equal(review.phase.value, 'LEARNING_READ')
  review.beginLearningRecall()
  review.revealAnswer()
  await review.completeLearning()

  // Normal queue finished -> automatically enters FUZZY mode for b-hard and b-fuzzy-refail!
  assert.equal(review.currentMode.value, 'FUZZY')
  assert.equal(review.phase.value, 'FUZZY_RECALL')
  assert.equal(review.activeBlock.value.id, 'b-hard')
  const confirmsBeforeFuzzy = calls.filter(c => c[0] === 'confirm').length
  review.revealAnswer()
  assert.equal(review.phase.value, 'FUZZY_CHECK')
  await review.confirmReview() // Pure local pass: no confirm API call
  assert.equal(calls.filter(c => c[0] === 'confirm').length, confirmsBeforeFuzzy)

  // b-fuzzy-refail in FUZZY_RECALL: already corrected earlier -> correctReview uses reopenLearning WITH reviewId!
  assert.equal(review.activeBlock.value.id, 'b-fuzzy-refail')
  assert.equal(review.phase.value, 'FUZZY_RECALL')
  await review.correctReview()
  assert.equal(review.phase.value, 'LEARNING_READ')
  review.beginLearningRecall()
  review.revealAnswer()
  await review.completeLearning()

  assert.equal(review.phase.value, 'ROUND_COMPLETE')
  assert.deepEqual(review.firstFeedbackCounts.value, { GOOD: 2, HARD: 2, AGAIN: 1 })
  assert.ok(calls.some(c => c[0] === 'reopen' && c[1] === 'b-fuzzy-refail' && c[2] !== null))
  assert.ok(calls.some(c => c[0] === 'completeLearning' && c[1] === 'b-corr' && c[2] !== null))
  assert.ok(calls.some(c => c[0] === 'completeLearning' && c[1] === 'b-again' && c[2] !== null))

  // Now launch single-card self-test specifically targeting b-mastered (temporarily mark others needsLearning so pool = ['b-mastered'])
  for (const id of ['b-good', 'b-hard', 'b-corr', 'b-fuzzy-refail', 'b-again']) {
    statesById.set(id, { ...statesById.get(id), needsLearning: true })
  }
  await review.startSelfTestRound(5)
  assert.equal(review.activeBlock.value.id, 'b-mastered')
  assert.equal(review.phase.value, 'REVIEW_RECALL')
  assert.equal(review.isMasteredCard.value, true)
  await review.reopenMasteredBlock()
  assert.equal(review.phase.value, 'LEARNING_READ')
  review.beginLearningRecall()
  review.revealAnswer()
  await review.completeLearning()
  assert.equal(review.phase.value, 'ROUND_COMPLETE')

  const reopenMasteredCall = calls.find(c => c[0] === 'reopen' && c[1] === 'b-mastered')
  const completeMasteredCall = calls.find(c => c[0] === 'completeLearning' && c[1] === 'b-mastered')
  assert.ok(reopenMasteredCall && reopenMasteredCall[2] === null)
  assert.ok(completeMasteredCall && completeMasteredCall[2] === null)
})

test('useMobileLifecycleReview resumes pendingReviewId directly into REVIEW_CHECK and schedules HARD into FUZZY', async (context) => {
  useStorageFixture(context)
  resetTestStores(context)
  const confirmed = []
  const stateObj = {
    knowledgeBlockId: 'b-pending',
    knowledgeBlockVersion: 3,
    version: 5,
    needsLearning: false,
    mastered: false,
    pendingReviewId: 'rev-pending-hard',
    lastReviewId: 'rev-pending-hard',
    dueAt: '2026-11-20T00:00:00Z',
    contentHash: sha256Utf8Hex('Pending body'),
  }
  const api = {
    async states() {
      return { items: [{ ...stateObj }] }
    },
    async block(id) {
      return { id, title: 'Pending', subjectId: 'math', version: 3, content: 'Pending body' }
    },
    async history() {
      return {
        knowledgeBlockId: 'b-pending',
        knowledgeBlockVersion: 3,
        protocolVersion: 2,
        state: { ...stateObj },
        commands: [],
        effectiveReviews: [{
          reviewId: 'rev-pending-hard',
          selectedRating: 'HARD',
          effectiveRating: null,
          selectedAt: '2026-11-19T01:00:00Z',
          resolvedAt: null,
          resolution: null,
        }],
      }
    },
    async confirm(reviewId, body) {
      confirmed.push({ reviewId, body })
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_CONFIRMED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 3,
        state: { ...stateObj, version: 6, pendingReviewId: null },
        effectiveReview: { reviewId, selectedRating: 'HARD', effectiveRating: 'HARD', resolution: 'CONFIRMED' },
      }
    },
    async attempt() { throw new Error('unexpected attempt') },
    async correct() { throw new Error('unexpected correct') },
    async completeLearning() { throw new Error('unexpected completeLearning') },
    async reopenLearning() { throw new Error('unexpected reopenLearning') },
  }

  const { getReview } = mountLifecycleReview(context, api, {
    subjectId: () => 'math',
    enabled: () => true,
    initialMode: () => 'review',
  })
  const review = getReview()
  await setImmediate()

  assert.equal(review.phase.value, 'REVIEW_CHECK')
  assert.equal(review.currentReviewId.value, 'rev-pending-hard')
  assert.deepEqual(review.fuzzyPendingIds.value, ['b-pending'])

  await review.confirmReview()
  assert.equal(confirmed.length, 1)
  assert.equal(review.currentMode.value, 'FUZZY')
  assert.equal(review.phase.value, 'FUZZY_RECALL')

  review.revealAnswer()
  await review.confirmReview()
  assert.equal(review.phase.value, 'ROUND_COMPLETE')
})

test('useMobileLifecycleReview retries frozen pending command across recreation, handles 409 conflict, and fences account switch', async (context) => {
  const storage = useStorageFixture(context)
  resetTestStores(context)
  const storageKey = lifecyclePendingStorageKey('account', 'device')
  const stateObj = {
    knowledgeBlockId: 'b1',
    knowledgeBlockVersion: 1,
    version: 1,
    needsLearning: false,
    mastered: false,
    dueAt: '2026-11-18T00:00:00Z',
    contentHash: sha256Utf8Hex('Body 1'),
  }
  const attempts = []
  let shouldFailOnce = true
  let conflictOnRetry = false

  const api = {
    async states() {
      return { items: [{ ...stateObj }] }
    },
    async block(id) {
      return { id, title: 'B1', subjectId: 'math', version: 1, content: 'Body 1' }
    },
    async attempt(body) {
      attempts.push(structuredClone(body))
      if (conflictOnRetry) {
        throw new ApiProblemError({
          title: 'Conflict',
          status: 409,
          detail: 'Version conflict',
          code: 'RESOURCE_VERSION_CONFLICT',
          fieldErrors: [],
        })
      }
      if (shouldFailOnce) {
        shouldFailOnce = false
        throw new Error('Network dropped')
      }
      stateObj.version = 2
      stateObj.needsLearning = true
      stateObj.lastReviewId = body.reviewId
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_SELECTED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...stateObj },
        effectiveReview: { reviewId: body.reviewId, selectedRating: 'AGAIN', effectiveRating: 'AGAIN', resolution: 'AGAIN_SELECTED' },
      }
    },
    async confirm() { throw new Error('unexpected confirm') },
    async correct() { throw new Error('unexpected correct') },
    async completeLearning() { throw new Error('unexpected completeLearning') },
    async reopenLearning() { throw new Error('unexpected reopenLearning') },
    async history() { throw new Error('unexpected history') },
  }

  const firstMount = mountLifecycleReview(context, api, {
    subjectId: () => 'math',
    enabled: () => true,
    initialMode: () => 'review',
  })
  const r1 = firstMount.getReview()
  await setImmediate()

  await r1.selectRating('AGAIN')
  assert.equal(attempts.length, 1)
  assert.equal(r1.hasPendingCommand.value, true)
  assert.equal(storage.has(storageKey), true)

  // Recreate page -> pending command is recovered from storage before issuing new commands
  const secondMount = mountLifecycleReview(context, api, {
    subjectId: () => 'math',
    enabled: () => true,
    initialMode: () => 'review',
  })
  const r2 = secondMount.getReview()
  await setImmediate()

  assert.equal(r2.hasPendingCommand.value, true)
  assert.equal(r2.activeBlock.value, null)

  // Retry sends exact same clientCommandId & occurredAt, then reloads round cleanly into LEARNING_READ
  await r2.retryPending()
  assert.equal(attempts.length, 2)
  assert.equal(attempts[1].clientCommandId, attempts[0].clientCommandId)
  assert.equal(attempts[1].occurredAt, attempts[0].occurredAt)
  assert.equal(r2.hasPendingCommand.value, false)
  assert.equal(storage.has(storageKey), false)
  assert.equal(r2.phase.value, 'LEARNING_READ')

  // Simulate 409 conflict on retry -> pendingIsConflict & roundNeedsRestart, then discardPendingAndReload & account switch fence
  conflictOnRetry = true
  const conflictAttemptPending = {
    subjectId: 'math',
    roundId: r2.roundId.value,
    action: 'REVIEW_SELECTED',
    reviewId: 'r-stale',
    initialRating: 'AGAIN',
    body: {
      clientCommandId: 'cmd-conflict',
      knowledgeBlockId: 'b1',
      knowledgeBlockVersion: 1,
      baseVersion: 1,
      contentHash: stateObj.contentHash,
      occurredAt: new Date().toISOString(),
      expectedStateAbsent: false,
      reviewId: 'r-stale',
      rating: 'AGAIN',
      durationSeconds: 1,
    },
  }
  storage.set(storageKey, JSON.stringify(conflictAttemptPending))
  r2.pendingCommand.value = conflictAttemptPending
  await r2.retryPending()
  assert.equal(r2.pendingIsConflict.value, true)
  assert.equal(r2.roundNeedsRestart.value, true)

  const delayedStates = Promise.withResolvers()
  const originalStates = api.states
  api.states = () => delayedStates.promise
  const reloadPromise = r2.discardPendingAndReload()
  assert.equal(storage.has(storageKey), false)

  // Account switch invalidates in-flight round load
  getTestAuthStore().__switchAccount('other-user')
  delayedStates.resolve({ items: [{ ...stateObj }] })
  await reloadPromise
  api.states = originalStates
  assert.equal(r2.phase.value, 'IDLE')
  assert.equal(r2.activeBlock.value, null)
})

test('useMobileLifecycleReview uses REVIEW_CORRECTED on first FUZZY correction and clears activeBlock on next-card load failure', async (context) => {
  useStorageFixture(context)
  resetTestStores(context)

  const futurePractice = new Date(Date.now() + 60_000).toISOString()
  const statesById = new Map([
    ['b1', {
      knowledgeBlockId: 'b1', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T00:00:00Z', lastPracticeAt: futurePractice, contentHash: sha256Utf8Hex('Body 1'),
    }],
    ['b2', {
      knowledgeBlockId: 'b2', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T01:00:00Z', contentHash: sha256Utf8Hex('Body 2'),
    }],
    ['b3', {
      knowledgeBlockId: 'b3', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T02:00:00Z', contentHash: sha256Utf8Hex('Body 3'),
    }],
    ['b4', {
      knowledgeBlockId: 'b4', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T03:00:00Z', contentHash: sha256Utf8Hex('Body 4'),
    }],
    ['b5', {
      knowledgeBlockId: 'b5', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T04:00:00Z', contentHash: sha256Utf8Hex('Body 5'),
    }],
    ['b6', {
      knowledgeBlockId: 'b6', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: '2026-11-18T05:00:00Z', contentHash: sha256Utf8Hex('Body 6'),
    }],
  ])
  const calls = []
  let failBlockOnceId = ''
  const api = {
    async states() {
      return { items: [...statesById.values()].map(item => ({ ...item })) }
    },
    async block(id) {
      if (failBlockOnceId === id) {
        failBlockOnceId = ''
        throw new Error('Transient block fetch failure')
      }
      const num = id.slice(1)
      return { id, title: `Title-${id}`, subjectId: 'math', version: 1, content: `Body ${num}` }
    },
    async attempt(body) {
      assert.ok(Date.parse(body.occurredAt) > Date.parse(futurePractice), 'occurredAt must follow state.lastPracticeAt')
      calls.push(['attempt', body.knowledgeBlockId, body.rating, body.occurredAt])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = { ...prev, version: prev.version + 1, pendingReviewId: body.reviewId, lastReviewId: body.reviewId }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_SELECTED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: { reviewId: body.reviewId, selectedRating: body.rating, effectiveRating: null, resolution: null },
      }
    },
    async confirm(reviewId, body) {
      calls.push(['confirm', body.knowledgeBlockId, reviewId])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = { ...prev, version: prev.version + 1, pendingReviewId: null, dueAt: '2026-11-26T00:00:00Z' }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_CONFIRMED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: { reviewId, selectedRating: 'HARD', effectiveRating: 'HARD', resolution: 'CONFIRMED' },
      }
    },
    async correct(reviewId, body) {
      calls.push(['correct', body.knowledgeBlockId, reviewId])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = { ...prev, version: prev.version + 1, needsLearning: true, pendingReviewId: null }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_CORRECTED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: { reviewId, selectedRating: 'HARD', effectiveRating: 'AGAIN', resolution: 'CORRECTED_AGAIN' },
      }
    },
    async completeLearning(body) {
      calls.push(['completeLearning', body.knowledgeBlockId, body.reviewId ?? null])
      const prev = statesById.get(body.knowledgeBlockId)
      const next = { ...prev, version: prev.version + 1, needsLearning: false, dueAt: '2026-11-26T00:00:00Z' }
      statesById.set(body.knowledgeBlockId, next)
      return {
        clientCommandId: body.clientCommandId,
        action: 'LEARNING_COMPLETED',
        occurredAt: body.occurredAt,
        knowledgeBlockVersion: 1,
        state: { ...next },
        effectiveReview: null,
      }
    },
    async reopenLearning() { throw new Error('unexpected reopenLearning on first FUZZY correction') },
    async history() { throw new Error('unexpected history') },
  }

  const { getReview } = mountLifecycleReview(context, api, {
    subjectId: () => 'math',
    enabled: () => true,
    initialMode: () => 'review',
    initialGroupSize: () => 5,
  })
  const review = getReview()
  await setImmediate()

  // b1: HARD with future lastPracticeAt -> confirm -> later in FUZZY fails once via REVIEW_CORRECTED
  assert.equal(review.activeBlock.value.id, 'b1')
  await review.selectRating('HARD')
  await review.confirmReview()

  // b2..b4 succeed
  for (const id of ['b2', 'b3', 'b4']) {
    assert.equal(review.activeBlock.value.id, id)
    await review.selectRating('GOOD')
    if (id === 'b4') failBlockOnceId = 'b5'
    await review.confirmReview()
  }

  // Transient failure loading b5 clears stale b4 activeBlock and exposes loadError cleanly
  assert.equal(review.activeBlock.value, null)
  assert.equal(review.phase.value, 'IDLE')
  assert.ok(review.loadError.value.includes('Transient block fetch failure'))

  // Reload finishes b5 cleanly, then reaches FUZZY_RECALL for b1
  review.reloadCurrentRound()
  await setImmediate()
  assert.equal(review.activeBlock.value.id, 'b5')
  await review.selectRating('GOOD')
  await review.confirmReview()

  // Re-launch single FUZZY test explicitly via new group or check FUZZY on b1 if we restart clean:
  // Start fresh 1-card HARD -> confirm -> FUZZY -> correctReview verifies REVIEW_CORRECTED in FUZZY when corrected === false
  statesById.clear()
  statesById.set('bf1', {
    knowledgeBlockId: 'bf1', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
    dueAt: '2026-11-18T00:00:00Z', lastPracticeAt: futurePractice, contentHash: sha256Utf8Hex('Body 1'),
  })
  statesById.set('bf2', {
    knowledgeBlockId: 'bf2', knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
    dueAt: '2026-11-18T01:00:00Z', contentHash: sha256Utf8Hex('Body 2'),
  })
  api.block = async (id) => {
    if (failBlockOnceId === id) {
      failBlockOnceId = ''
      throw new Error('Transient next group load failure')
    }
    return { id, title: `Title-${id}`, subjectId: 'math', version: 1, content: id === 'bf1' ? 'Body 1' : 'Body 2' }
  }
  await review.startRound('review', 5, 'math')
  await review.selectRating('HARD')
  await review.confirmReview()
  await review.selectRating('GOOD')
  await review.confirmReview()

  assert.equal(review.currentMode.value, 'FUZZY')
  assert.equal(review.phase.value, 'FUZZY_RECALL')
  assert.equal(review.activeBlock.value.id, 'bf1')
  await review.correctReview()
  assert.ok(calls.some(c => c[0] === 'correct' && c[1] === 'bf1'))
  assert.equal(review.phase.value, 'LEARNING_READ')
  review.beginLearningRecall()
  review.revealAnswer()
  await review.completeLearning()
  assert.equal(review.phase.value, 'ROUND_COMPLETE')

  // Verify continueNextGroup clears GROUP_COMPLETE / activeBlock on transient loadCardAt failure
  statesById.set('bf1', {
    knowledgeBlockId: 'bf1', knowledgeBlockVersion: 1, version: 2, needsLearning: false, mastered: false,
    dueAt: '2026-11-18T00:00:00Z', contentHash: sha256Utf8Hex('Body 1'),
  })
  statesById.set('bf2', {
    knowledgeBlockId: 'bf2', knowledgeBlockVersion: 1, version: 2, needsLearning: false, mastered: false,
    dueAt: '2026-11-18T01:00:00Z', contentHash: sha256Utf8Hex('Body 2'),
  })
  for (let i = 3; i <= 6; i++) {
    statesById.set(`bf${i}`, {
      knowledgeBlockId: `bf${i}`, knowledgeBlockVersion: 1, version: 1, needsLearning: false, mastered: false,
      dueAt: `2026-11-18T0${i}:00:00Z`, contentHash: sha256Utf8Hex('Body 2'),
    })
  }
  await review.startRound('review', 5, 'math')
  for (let i = 1; i <= 5; i++) {
    await review.selectRating('GOOD')
    await review.confirmReview()
  }
  assert.equal(review.phase.value, 'GROUP_COMPLETE')
  failBlockOnceId = 'bf6'
  await review.continueNextGroup()
  assert.equal(review.phase.value, 'IDLE')
  assert.equal(review.activeBlock.value, null)
  assert.ok(review.loadError.value.includes('Transient next group load failure'))
})

test('useSyncStore.resetOfflineData clears both due and lifecycle pending review keys', async (context) => {
  const storage = useStorageFixture(context)
  storage.set('auralis:review:pending:user-reset:dev-reset', JSON.stringify({ old: true }))
  storage.set(lifecyclePendingStorageKey('user-reset', 'dev-reset'), JSON.stringify({ body: { clientCommandId: 'cmd-old' } }))

  const syncMocks = new Map([
    ['./useAuthStore', `
      const gen = Symbol('gen-reset');
      export const useAuthStore = () => ({
        isAuthenticated: true,
        user: { id: 'user-reset' },
        serverDeviceId: 'dev-reset',
        getLoginGeneration: () => gen,
      });
    `],
    ['./useFocusStore', 'export const useFocusStore = () => ({ dismissCompletedTaskPrompt() {}, reconcileNow() {} });'],
    ['./useSubjectStore', 'export const useSubjectStore = () => ({ async loadSubjects() {} });'],
    ['./useBlockStore', 'export const useBlockStore = () => ({ async loadLocalBlocks() {} });'],
    ['./useTaskStore', 'export const useTaskStore = () => ({ async loadLocalTasks() {}, suppressOverdueRecovery() {}, async recoverOverdueTasks() {} });'],
    ['@/services/localDb', 'export const localDb = { async init() {}, async getUnsyncedMutations() { return []; }, async getMetadata() { return ""; }, async setMetadata() {} };'],
    ['@/services/localDataScope', 'export const localDataScope = { reset() {} };'],
    ['@/api/useSyncApi', 'export const useSyncApi = { async snapshot() { return { subjects: [], sources: [], knowledgeBlocks: [], tasks: [], snapshotCursor: "" }; } };'],
  ])
  const syncLoader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (syncMocks.has(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(syncMocks.get(specifier))}`, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })
  context.after(() => syncLoader.deregister())

  const { useSyncStore } = await import('../src/store/useSyncStore.ts?reset-lifecycle-key-test')
  setActivePinia(createPinia())
  const syncStore = useSyncStore()
  await syncStore.resetOfflineData()

  assert.equal(storage.has('auralis:review:pending:user-reset:dev-reset'), false)
  assert.equal(storage.has(lifecyclePendingStorageKey('user-reset', 'dev-reset')), false)
})
