import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createRenderer, createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

const storeModules = new Map([
  ['@/store/useAuthStore', `
    const generation = Symbol('login');
    export const useAuthStore = () => ({
      isAuthenticated: true, user: { id: 'account' }, sessionId: 'session', serverDeviceId: 'device',
      getLoginGeneration: () => generation,
    });
  `],
  ['@/store/useSubjectStore', 'export const useSubjectStore = () => ({ subjects: [] });'],
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
const { useDueReview } = await import('../src/composables/useDueReview.ts').finally(() => loader.deregister())

function useStorageFixture(context) {
  const storage = new Map()
  globalThis.uni = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
  }
  context.after(() => { delete globalThis.uni })
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
  storage.set(key, { subjectId: 'alpha', attempt, confirmation })
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

test('mobile review switches cleanly between specific subject and all-subjects queue', async (context) => {
  useStorageFixture(context)
  const selectedSubjectId = ref('alpha')
  const calls = []
  const api = {
    async queue(_at, _cursor, subject) {
      calls.push(subject ?? 'ALL')
      return { items: [{ knowledgeBlockId: subject ? 'block-alpha' : 'block-all', knowledgeBlockVersion: 2 }] }
    },
    async block(id) {
      return {
        id,
        title: id,
        subjectId: id === 'block-alpha' ? 'alpha' : 'beta',
        version: 2,
        content: `content:${id}`,
      }
    },
  }

  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} })
  let review
  const app = renderer.createApp({
    setup() {
      review = useDueReview(api, {
        subjectId: () => selectedSubjectId.value,
        enabled: () => true,
        allowAllSubjects: true,
      })
      return () => null
    },
  })
  app.mount({})
  context.after(() => app.unmount())

  await setImmediate()
  assert.deepEqual(calls, ['alpha'])
  assert.equal(review.activeCard.value.title, 'block-alpha')

  selectedSubjectId.value = undefined
  await setImmediate()
  assert.deepEqual(calls, ['alpha', 'ALL'])
  assert.equal(review.activeCard.value.title, 'block-all')
})
