import assert from 'node:assert/strict'
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
    && context.parentURL && !/\\.(?:ts|js|mjs)$/.test(specifier)) {
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
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class extends Event {
    constructor(type, init = {}) { super(type); this.detail = init.detail }
  }
}

const { createPinia, setActivePinia } = await import('pinia')
const { createRenderer, nextTick } = await import('vue')
const { compileScript, parse } = await import('@vue/compiler-sfc')
const ts = (await import('typescript')).default
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { useStatsStore } = await import('../src/store/useStatsStore.ts')
const { useSyncStore } = await import('../src/store/useSyncStore.ts')
const { useStatsApi } = await import('../src/api/useStatsApi.ts')
const request = (await import('../src/api/request.ts')).default
const { localDb, getLocalRepository } = await import('../src/services/localDb.ts')
const { routerKey, routeLocationKey } = await import('vue-router')

const originalApi = { ...useStatsApi }
const originalGet = request.get
const mountedApps = []

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
  Object.assign(useStatsApi, originalApi)
  request.get = originalGet
})

function fixture(userId = 'stats-user-a') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.setSession({
    user: { id: userId, email: `${userId}@example.test` },
    tokens: { accessToken: `${userId}-access`, refreshToken: `${userId}-refresh` },
    sessionId: `${userId}-session`,
    serverDeviceId: `${userId}-device`,
  })
  return { authStore, statsStore: useStatsStore(), pinia }
}

async function seedSubject(userId, deviceId, subjectId = `subject-${userId}`) {
  await localDb.init()
  const repository = await getLocalRepository(userId, deviceId)
  await repository.upsert('SUBJECT', subjectId, { id: subjectId, name: 'Local subject' }, { version: 1, syncStatus: 'synced' })
  return repository
}

function hostNode(type, text = '') {
  return { type, text, props: {}, children: [], parent: null }
}

async function mountStatsPane(pinia, subjectId) {
  const source = await readFile(new URL('../src/components/subject/SubjectStatsPane.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source, { filename: 'SubjectStatsPane.vue' })
  const compiled = compileScript(descriptor, { id: 'subject-stats-pane-test', inlineTemplate: true })
  const javascript = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const generatedUrl = new URL(`../src/components/subject/.subject-stats-test-${Date.now()}-${Math.random()}.mjs`, import.meta.url)
  await writeFile(generatedUrl, javascript)
  let component
  try {
    component = (await import(generatedUrl.href)).default
  } finally {
    await unlink(generatedUrl)
  }
  const renderer = createRenderer({
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
    nextSibling: (node) => node.parent ? node.parent.children[node.parent.children.indexOf(node) + 1] ?? null : null,
  })
  const app = renderer.createApp(component, { subjectId })
  app.use(pinia)
  app.provide(routerKey, { replace: async () => undefined })
  app.provide(routeLocationKey, { query: {} })
  const root = hostNode('root')
  app.mount(root)
  mountedApps.push(app)
  return { app, root }
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
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail(message)
}

function statsView(subjectId, count, days = 7, timeZone = 'UTC') {
  const toDate = new Date('2026-10-08T00:00:00.000Z')
  const fromDate = new Date(toDate)
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1)
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(fromDate)
    date.setUTCDate(date.getUTCDate() + index)
    return {
      date: date.toISOString().slice(0, 10),
      nonSkipReviewEventCount: 0,
      distinctReviewedKnowledgeBlockCount: 0,
      firstLearningKnowledgeBlockCount: 0,
      subsequentReviewKnowledgeBlockCount: 0,
      createdKnowledgeBlockCount: 0,
      completedTaskCount: 0,
      learningCompletionCount: 0,
      distinctStudiedKnowledgeBlockCount: 0,
    }
  })
  return {
    subjectId,
    generatedAt: '2026-10-08T00:00:00Z',
    timeZone,
    from: daily[0].date,
    to: '2026-10-08',
    overview: {
      fileSourceCount: count,
      textSourceCount: 2,
      urlSourceCount: 3,
      activeKnowledgeBlockCount: 8,
      activeTaskCount: 4,
      todoTaskCount: 1,
      inProgressTaskCount: 1,
      doneTaskCount: 1,
      cancelledTaskCount: 1,
      newLearningCount: 2,
      dueReviewCount: 3,
      scheduledReviewCount: 4,
      pendingLearningCount: 2,
      reviewingCount: 4,
      masteredCount: 2,
    },
    daily,
    ratingCounts: { againCount: 0, hardCount: 0, goodCount: 0, easyCount: 0 },
    historyCoverage: 'COMPLETE',
    pendingReviewCommandCount: 0,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

test('subject stats read local core data offline and never call the server aggregate', async () => {
  const { authStore, statsStore } = fixture('stats-offline-user')
  const subjectId = 'stats-offline-subject'
  const repository = await seedSubject(authStore.user.id, authStore.serverDeviceId, subjectId)
  await repository.upsert('KNOWLEDGE_BLOCK', 'stats-offline-kb', {
    id: 'stats-offline-kb', subjectId, title: 'Local block', content: 'offline body',
  }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('SOURCE', 'stats-offline-source', {
    id: 'local-source', localSourceId: 'local-source', type: 'FILE', subjectId,
  }, { version: 1, syncStatus: 'synced' })
  await repository.upsert('TASK', 'stats-offline-task', {
    id: 'stats-offline-task', subjectId, status: 'TODO',
  }, { version: 1, syncStatus: 'synced' })
  let requests = 0
  useStatsApi.getSubjectStats = async () => { requests += 1; throw new Error('network unavailable') }

  const result = await statsStore.loadSubjectStats(subjectId, { days: 7, timeZone: 'Asia/Hong_Kong' })

  assert.equal(requests, 0)
  assert.equal(result.subjectId, subjectId)
  assert.equal(result.timeZone, 'Asia/Hong_Kong')
  assert.equal(result.overview.fileSourceCount, 1)
  assert.equal(result.overview.activeKnowledgeBlockCount, 1)
  assert.equal(result.overview.pendingLearningCount, 1)
  assert.equal(result.daily.length, 7)
  assert.equal(statsStore.subjectStatsStatus, 'success')
})

test('missing local subject data remains an error instead of fabricated zero statistics', async () => {
  const { statsStore } = fixture('stats-missing-user')

  await assert.rejects(statsStore.loadSubjectStats('not-on-this-device', { days: 7, timeZone: 'UTC' }), /本地学科资料暂不可用/)

  assert.equal(statsStore.subjectStats, null)
  assert.equal(statsStore.subjectStatsStatus, 'error')
  assert.match(statsStore.subjectStatsError, /本地学科资料暂不可用/)
})

test('a stale local statistics computation cannot replace the current account after A to B switch', async () => {
  const { authStore, statsStore } = fixture('stats-scope-user-a')
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  const originalCompute = LocalSubjectStats.compute
  const pending = deferred()
  LocalSubjectStats.compute = async () => pending.promise
  try {
    const loading = statsStore.loadSubjectStats('shared-subject', { days: 7, timeZone: 'UTC' })
    await waitFor(() => LocalSubjectStats.compute !== originalCompute && !!statsStore.subjectStatsStatus, 'local computation did not start')
    authStore.setSession({
      user: { id: 'stats-scope-user-b', email: 'b@example.test' },
      tokens: { accessToken: 'b-access', refreshToken: 'b-refresh' },
      sessionId: 'b-session', serverDeviceId: 'b-device',
    })
    pending.resolve(statsView('shared-subject', 99))
    await assert.rejects(loading)
    assert.equal(statsStore.subjectStats, null)
  } finally {
    LocalSubjectStats.compute = originalCompute
  }
})

test('same-session token rotation keeps a local statistics read current', async () => {
  const { authStore, statsStore } = fixture('stats-token-user')
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  const originalCompute = LocalSubjectStats.compute
  const pending = deferred()
  LocalSubjectStats.compute = async () => pending.promise
  try {
    const loading = statsStore.loadSubjectStats('token-subject', { days: 7, timeZone: 'UTC' })
    authStore.applyRefresh({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }, 'rotated-sid')
    pending.resolve(statsView('token-subject', 3))
    const result = await loading
    assert.equal(result.overview.fileSourceCount, 3)
  } finally {
    LocalSubjectStats.compute = originalCompute
  }
})

test('a late result for an older local date range does not replace the selected range', async () => {
  const { statsStore } = fixture('stats-range-user')
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  const originalCompute = LocalSubjectStats.compute
  const seven = deferred()
  const thirty = deferred()
  LocalSubjectStats.compute = (_db, _user, _device, _subject, days) => days === 7 ? seven.promise : thirty.promise
  try {
    const loadingSeven = statsStore.loadSubjectStats('range-subject', { days: 7, timeZone: 'UTC' })
    const loadingThirty = statsStore.loadSubjectStats('range-subject', { days: 30, timeZone: 'UTC' })
    thirty.resolve(statsView('range-subject', 30, 30))
    await loadingThirty
    seven.resolve(statsView('range-subject', 7, 7))
    await loadingSeven
    assert.equal(statsStore.subjectStats.daily.length, 30)
    assert.equal(statsStore.subjectStats.overview.fileSourceCount, 30)
  } finally {
    LocalSubjectStats.compute = originalCompute
  }
})

test('the stats pane reloads its local projection when core sync completes', async () => {
  const { authStore, pinia, statsStore } = fixture('stats-sync-user')
  const subjectId = 'stats-sync-subject'
  const repository = await seedSubject(authStore.user.id, authStore.serverDeviceId, subjectId)
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  const originalCompute = LocalSubjectStats.compute
  let computations = 0
  LocalSubjectStats.compute = async (...args) => {
    computations += 1
    return originalCompute(...args)
  }
  try {
    await mountStatsPane(pinia, subjectId)
    await waitFor(() => computations >= 1, 'stats pane did not load its local projection on mount')
    await settleVue()
    const syncStore = useSyncStore()
    syncStore.isPushing = true
    await nextTick()
    await repository.upsert('TASK', 'stats-sync-done-task', {
      id: 'stats-sync-done-task', subjectId, status: 'DONE', completedAt: new Date().toISOString(),
    }, { version: 1, syncStatus: 'synced' })
    syncStore.isPushing = false
    await waitFor(() => computations >= 2 && statsStore.subjectStats?.overview.doneTaskCount === 1,
      'stats pane did not refresh after sync completion')
  } finally {
    LocalSubjectStats.compute = originalCompute
  }
})

test('review update refresh is account-fenced and the pane detaches its listener on unmount', async () => {
  const { authStore, pinia, statsStore } = fixture('stats-event-user')
  const subjectId = 'stats-event-subject'
  const repository = await seedSubject(authStore.user.id, authStore.serverDeviceId, subjectId)
  const { LocalSubjectStats } = await import('../src/services/localSubjectStats.ts')
  const originalCompute = LocalSubjectStats.compute
  let computations = 0
  LocalSubjectStats.compute = async (...args) => {
    computations += 1
    return originalCompute(...args)
  }
  try {
    const { app } = await mountStatsPane(pinia, subjectId)
    await waitFor(() => computations >= 1, 'stats pane did not load on mount')
    await settleVue()
    await repository.upsert('TASK', 'stats-event-task-1', {
      id: 'stats-event-task-1', subjectId, status: 'DONE', completedAt: new Date().toISOString(),
    }, { version: 1, syncStatus: 'synced' })
    window.dispatchEvent(new CustomEvent('auralis-review-local-updated', {
      detail: { userId: authStore.user.id, deviceId: authStore.serverDeviceId, sessionId: authStore.sessionId, subjectId },
    }))
    await waitFor(() => computations >= 2 && statsStore.subjectStats?.overview.doneTaskCount === 1,
      'current-scope review event did not refresh stats')

    await repository.upsert('TASK', 'stats-event-task-2', {
      id: 'stats-event-task-2', subjectId, status: 'DONE', completedAt: new Date().toISOString(),
    }, { version: 1, syncStatus: 'synced' })
    window.dispatchEvent(new CustomEvent('auralis-review-local-updated', {
      detail: { userId: authStore.user.id, deviceId: authStore.serverDeviceId, sessionId: 'stale-session', subjectId },
    }))
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(computations, 2, 'a stale account generation cannot trigger a pane refresh')
    assert.equal(statsStore.subjectStats.overview.doneTaskCount, 1)

    app.unmount()
    mountedApps.splice(mountedApps.indexOf(app), 1)
    await repository.upsert('TASK', 'stats-event-task-3', {
      id: 'stats-event-task-3', subjectId, status: 'DONE', completedAt: new Date().toISOString(),
    }, { version: 1, syncStatus: 'synced' })
    window.dispatchEvent(new CustomEvent('auralis-review-local-updated', {
      detail: { userId: authStore.user.id, deviceId: authStore.serverDeviceId, sessionId: authStore.sessionId, subjectId },
    }))
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(computations, 2, 'the unmounted pane no longer listens for review updates')
  } finally {
    LocalSubjectStats.compute = originalCompute
  }
})

test('stats pane exposes incomplete local history and pending sync while excluding focus aggregates', async () => {
  const source = await readFile(new URL('../src/components/subject/SubjectStatsPane.vue', import.meta.url), 'utf8')
  assert.match(source, /historyCoverage === 'INCOMPLETE'/)
  assert.match(source, /\(stats\?\.pendingReviewCommandCount \?\? 0\) > 0/)
  assert.match(source, /等待联网同步/)
  assert.doesNotMatch(source, /focusSeconds|focusCompletedCount/)
})

test('stats pane renders locally computed subject totals', async () => {
  const { authStore, pinia, statsStore } = fixture('stats-render-user')
  const subjectId = 'stats-render-subject'
  const repository = await seedSubject(authStore.user.id, authStore.serverDeviceId, subjectId)
  const block = { id: 'stats-render-kb', subjectId, title: 'Rendered local block', content: 'body' }
  await repository.upsert('KNOWLEDGE_BLOCK', 'stats-render-kb', {
    ...block,
  }, { version: 1, syncStatus: 'synced' })
  const { LocalReviewService } = await import('../src/services/localReviewService.ts')
  const reviewService = new LocalReviewService('localstorage', repository)
  const contentHash = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(block.content),
  )), value => value.toString(16).padStart(2, '0')).join('')
  await reviewService.importLifecycleHistory(authStore.user.id, authStore.serverDeviceId, block.id, {
    knowledgeBlockId: block.id, knowledgeBlockVersion: 1, protocolVersion: 2,
    state: null, commands: [], effectiveReviews: [],
  }, [])
  const occurredAt = new Date().toISOString()
  await reviewService.executeCommand(authStore.user.id, authStore.serverDeviceId, block.id,
    'stats-render-learning-command', 'LEARNING_COMPLETED', null, occurredAt, 0, contentHash, {
      clientCommandId: 'stats-render-learning-command', knowledgeBlockId: block.id,
      knowledgeBlockVersion: 1, baseVersion: 0, contentHash, occurredAt, expectedStateAbsent: true,
    }, subjectId)
  const { root } = await mountStatsPane(pinia, subjectId)
  await waitFor(() => statsStore.subjectStatsStatus === 'success', 'stats pane did not finish local calculation')
  await settleVue()

  const rendered = collectText(root)
  assert.equal(statsStore.subjectStats.pendingReviewCommandCount, 1)
  assert.match(rendered, /待学习/)
  assert.match(rendered, /等待联网同步/,
    'pending review intent notice and locally computed stats stay visible in the same stats branch')
  assert.match(rendered, /1/)
  assert.doesNotMatch(rendered, /focusSeconds|focusCompletedCount/)
})
