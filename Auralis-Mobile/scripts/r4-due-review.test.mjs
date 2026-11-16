import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { createSSRApp } from 'vue'
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

test('skipping stays local and a lost GOOD confirmation survives page recreation', async (context) => {
  const storage = new Map()
  globalThis.uni = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
  }
  context.after(() => { delete globalThis.uni })
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
