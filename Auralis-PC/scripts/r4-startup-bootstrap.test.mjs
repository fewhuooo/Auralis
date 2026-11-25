import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const subPath = specifier.slice(2)
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts'
    return nextResolve(new URL(withExt, '${srcRootUrl}').href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { runStartupBootstrap } = await import('../src/services/startupBootstrap.ts')
const { applyPersistedThemeEarly } = await import('../src/services/startupTheme.ts')
const {
  createRoutePreloader,
  isDynamicImportFetchError,
  recoverFromDynamicImportError,
  resolveSafeSameOriginPath,
} = await import('../src/router/routePreload.ts')

test('runStartupBootstrap drives stages in order and honors minimum display time', async () => {
  const stages = []
  const order = []

  const result = await runStartupBootstrap({
    isScopeCurrent: () => true,
    isOnline: () => true,
    isAutoSyncEnabled: () => true,
    hydrateLocalData: async () => {
      order.push('hydrate')
    },
    syncCloudData: async () => {
      order.push('sync')
    },
    preloadRoutes: async () => {
      order.push('preload')
    },
    onStageChange: (stage) => {
      stages.push(stage)
    },
    minDisplayMs: 30,
    maxSyncWaitMs: 500,
    maxPreloadWaitMs: 500,
  })

  assert.deepEqual(stages, ['hydrating', 'syncing', 'warming', 'ready'])
  assert.deepEqual(result, { completed: true, syncTimedOut: false, syncSkipped: false })
  assert.ok(order.includes('hydrate'))
  assert.ok(order.includes('sync'))
  assert.ok(order.includes('preload'))
  assert.ok(order.indexOf('hydrate') < order.indexOf('sync'))
})

test('runStartupBootstrap bounds slow cloud sync with maxSyncWaitMs', async () => {
  const stages = []
  let neverEndingResolved = false

  const result = await runStartupBootstrap({
    isScopeCurrent: () => true,
    isOnline: () => true,
    isAutoSyncEnabled: () => true,
    hydrateLocalData: async () => undefined,
    syncCloudData: () => new Promise(() => {
      // Intentionally unsettled to verify timeout bound.
    }).then(() => {
      neverEndingResolved = true
    }),
    preloadRoutes: async () => undefined,
    onStageChange: (stage) => {
      stages.push(stage)
    },
    minDisplayMs: 0,
    maxSyncWaitMs: 25,
    maxPreloadWaitMs: 100,
  })

  assert.equal(neverEndingResolved, false)
  assert.deepEqual(result, { completed: true, syncTimedOut: true, syncSkipped: false })
  assert.deepEqual(stages, ['hydrating', 'syncing', 'warming', 'ready'])
})

test('runStartupBootstrap skips cloud sync when offline or auto-sync is paused', async () => {
  for (const scenario of [
    { online: false, autoSync: true },
    { online: true, autoSync: false },
  ]) {
    let syncCalls = 0
    const stages = []

    const result = await runStartupBootstrap({
      isScopeCurrent: () => true,
      isOnline: () => scenario.online,
      isAutoSyncEnabled: () => scenario.autoSync,
      hydrateLocalData: async () => undefined,
      syncCloudData: async () => {
        syncCalls += 1
      },
      preloadRoutes: async () => undefined,
      onStageChange: (stage) => {
        stages.push(stage)
      },
      minDisplayMs: 0,
      maxSyncWaitMs: 200,
      maxPreloadWaitMs: 200,
    })

    assert.equal(syncCalls, 0)
    assert.deepEqual(result, { completed: true, syncTimedOut: false, syncSkipped: true })
    assert.deepEqual(stages, ['hydrating', 'warming', 'ready'])
  }
})

test('runStartupBootstrap bounds hung preloadRoutes and aborts cleanly during warming or minDisplayMs delay', async () => {
  const hungPreloadResult = await runStartupBootstrap({
    isScopeCurrent: () => true,
    isOnline: () => false,
    isAutoSyncEnabled: () => false,
    hydrateLocalData: async () => undefined,
    syncCloudData: async () => undefined,
    preloadRoutes: () => new Promise(() => {
      // Intentionally unsettled to verify maxPreloadWaitMs bound.
    }),
    minDisplayMs: 0,
    maxPreloadWaitMs: 25,
  })
  assert.equal(hungPreloadResult.completed, true)

  let scopeActive = true
  const abortStages = []
  const abortedResult = await runStartupBootstrap({
    isScopeCurrent: () => scopeActive,
    isOnline: () => false,
    isAutoSyncEnabled: () => false,
    hydrateLocalData: async () => undefined,
    syncCloudData: async () => undefined,
    preloadRoutes: async () => undefined,
    onStageChange: (stage) => {
      abortStages.push(stage)
      if (stage === 'warming') {
        scopeActive = false
      }
    },
    minDisplayMs: 30,
    maxPreloadWaitMs: 200,
  })
  assert.equal(abortedResult.completed, false)
  assert.deepEqual(abortStages, ['hydrating', 'warming'])
})

test('runStartupBootstrap aborts cleanly when auth scope becomes stale mid-hydration or mid-sync', async () => {
  let scopeActive = true
  let syncCalls = 0

  const abortedDuringHydrate = await runStartupBootstrap({
    isScopeCurrent: () => scopeActive,
    isOnline: () => true,
    isAutoSyncEnabled: () => true,
    hydrateLocalData: async () => {
      scopeActive = false
    },
    syncCloudData: async () => {
      syncCalls += 1
    },
    preloadRoutes: async () => undefined,
    minDisplayMs: 0,
  })

  assert.equal(abortedDuringHydrate.completed, false)
  assert.equal(syncCalls, 0)

  let scopeDuringSync = true
  const stages = []
  const abortedDuringSync = await runStartupBootstrap({
    isScopeCurrent: () => scopeDuringSync,
    isOnline: () => true,
    isAutoSyncEnabled: () => true,
    hydrateLocalData: async () => undefined,
    syncCloudData: async () => {
      scopeDuringSync = false
    },
    preloadRoutes: async () => undefined,
    onStageChange: (stage) => {
      stages.push(stage)
    },
    minDisplayMs: 0,
  })

  assert.equal(abortedDuringSync.completed, false)
  assert.deepEqual(stages, ['hydrating', 'syncing'])
})

test('dynamic import recovery reloads once per cooldown, ignores non-chunk errors, and strips off-origin targets', () => {
  assert.equal(
    isDynamicImportFetchError(new TypeError('Failed to fetch dynamically imported module: /src/views/SubjectWorkspace/index.vue')),
    true,
  )
  assert.equal(isDynamicImportFetchError(new Error('Network Timeout')), false)

  assert.equal(resolveSafeSameOriginPath('/subject/123?tab=overview#top', 'https://app.local'), '/subject/123?tab=overview#top')
  assert.equal(resolveSafeSameOriginPath('//external.example/evil', 'https://app.local'), null)
  assert.equal(resolveSafeSameOriginPath('/\\external.example/evil', 'https://app.local'), null)
  assert.equal(resolveSafeSameOriginPath('https://external.example/subject/123', 'https://app.local'), null)

  const store = new Map()
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  }
  const reloads = []

  assert.equal(
    recoverFromDynamicImportError(new Error('regular navigation error'), '/subject/123', {
      storage,
      reload: (path) => reloads.push(path),
    }),
    false,
  )

  // Corrupt storage JSON must still write a fresh timestamp and proceed with one-shot reload.
  store.set('auralis:pc:chunk-reload', '{not-valid-json')
  assert.equal(
    recoverFromDynamicImportError(
      new TypeError('Failed to fetch dynamically imported module: /src/views/SubjectWorkspace/index.vue'),
      '//external.example/subject/123',
      {
        storage,
        cooldownMs: 15_000,
        reload: (path) => reloads.push(path),
      },
    ),
    true,
  )

  assert.equal(
    recoverFromDynamicImportError(
      new TypeError('Failed to fetch dynamically imported module: /src/views/SubjectWorkspace/index.vue'),
      '/subject/123',
      {
        storage,
        cooldownMs: 15_000,
        reload: (path) => reloads.push(path),
      },
    ),
    false,
  )

  // Unsafe target path is sanitized to '' (triggers plain reload rather than external assign).
  assert.deepEqual(reloads, [''])
  assert.equal(JSON.parse(store.get('auralis:pc:chunk-reload')).targetPath, '')
})

test('createRoutePreloader deduplicates concurrent/cached preloads and evicts rejected entries for retry', async () => {
  let attempts = 0
  let releasePending
  const preloader = createRoutePreloader(
    {
      Dashboard: () => {
        attempts += 1
        if (attempts === 1) return Promise.reject(new Error('504 Outdated Optimize Dep'))
        return new Promise((resolve) => {
          releasePending = () => resolve({ ok: true })
        })
      },
    },
    ['Dashboard'],
  )

  await assert.rejects(() => preloader.preloadRoute('Dashboard'), /504 Outdated Optimize Dep/)

  const firstRetry = preloader.preloadRoute('Dashboard')
  const secondRetry = preloader.preloadRoute('Dashboard')
  assert.equal(firstRetry, secondRetry)
  assert.equal(attempts, 2)
  releasePending()
  await preloader.preloadAuthenticatedRoutes()
  assert.equal(attempts, 2)
})

test('applyPersistedThemeEarly toggles html.dark safely and tolerates malformed storage JSON', () => {
  const classes = new Set()
  const storageValues = new Map()
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
      },
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: {
        classList: {
          toggle: (name, force) => {
            if (force) classes.add(name)
            else classes.delete(name)
          },
        },
      },
    },
  })

  try {
    storageValues.set('settings', JSON.stringify({ isDark: true }))
    assert.equal(applyPersistedThemeEarly(), true)
    assert.equal(classes.has('dark'), true)

    storageValues.set('settings', '{bad-json')
    assert.equal(applyPersistedThemeEarly(), false)
    assert.equal(classes.has('dark'), false)
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    if (originalDocument === undefined) delete globalThis.document
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
  }
})
