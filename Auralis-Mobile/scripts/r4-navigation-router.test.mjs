import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { createMemoryHistory, createRouter } from 'vue-router'

import {
  bindNavigationRouter,
  canNavigateBack,
  getCurrentRoutePath,
  navigateBack,
  navigateTo,
  reLaunch,
  redirectTo,
} from '../src/platform/navigation.ts'
import { getAppTarget, getDefaultHomeRoute, getDefaultLoginRoute } from '../src/router/target.ts'
import {
  APP_TARGET as PHONE_TARGET,
  HOME_ROUTE as PHONE_HOME,
  LOGIN_ROUTE as PHONE_LOGIN,
  routeLoaders as phoneLoaders,
  routes as phoneRoutes,
} from '../src/router/phone.ts'
import {
  APP_TARGET as TABLET_TARGET,
  HOME_ROUTE as TABLET_HOME,
  LOGIN_ROUTE as TABLET_LOGIN,
  routeLoaders as tabletLoaders,
  routes as tabletRoutes,
} from '../src/router/tablet.ts'

test('platform/navigation decrements history depth once per back across vue-router and popstate fallback', async (context) => {
  const history = createMemoryHistory()
  const router = createRouter({
    history,
    routes: [
      { path: '/pages/mobile/home/index', component: { render: () => null } },
      { path: '/pages/mobile/review/index', component: { render: () => null } },
      { path: '/pages/mobile/pomodoro/index', component: { render: () => null } },
      { path: '/pages/mobile/login/index', component: { render: () => null } },
    ],
  })

  await router.replace('/pages/mobile/home/index')
  await router.isReady()
  bindNavigationRouter(router, { homeRoute: '/pages/mobile/home/index' })

  assert.equal(canNavigateBack(), false)
  assert.equal(getCurrentRoutePath(), '/pages/mobile/home/index')

  navigateTo('/pages/mobile/review/index?subjectId=sub-1')
  await new Promise((resolve) => setTimeout(resolve, 10))
  navigateTo('/pages/mobile/pomodoro/index')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(canNavigateBack(), true)
  assert.equal(getCurrentRoutePath(), '/pages/mobile/pomodoro/index')

  // First back from depth 2 must land at depth 1 (not double-decrement to 0)
  navigateBack()
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(getCurrentRoutePath(), '/pages/mobile/review/index')
  assert.equal(canNavigateBack(), true)

  // Second back returns to home with depth 0; third back replaces with home fallback cleanly
  navigateBack()
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(getCurrentRoutePath(), '/pages/mobile/home/index')
  assert.equal(canNavigateBack(), false)

  await router.push('/pages/mobile/review/index')
  navigateBack()
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(getCurrentRoutePath(), '/pages/mobile/home/index')

  // OS/browser pop without navigateBack() also decrements cleanly once per pop
  navigateTo('/pages/mobile/review/index')
  await new Promise((resolve) => setTimeout(resolve, 10))
  navigateTo('/pages/mobile/pomodoro/index')
  await new Promise((resolve) => setTimeout(resolve, 10))
  router.back()
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(getCurrentRoutePath(), '/pages/mobile/review/index')
  assert.equal(canNavigateBack(), true)
  router.back()
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(canNavigateBack(), false)

  // reLaunch clears stack depth and redirectTo invokes complete callback
  navigateTo('/pages/mobile/review/index')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(canNavigateBack(), true)
  reLaunch('/pages/mobile/login/index')
  assert.equal(canNavigateBack(), false)
  let redirected = false
  redirectTo('/pages/mobile/home/index', { complete: () => { redirected = true } })
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(redirected, true)
  assert.equal(getCurrentRoutePath(), '/pages/mobile/home/index')

  // Fallback path for routers without history.listen (browser window.popstate async dispatch)
  const listeners = new Map()
  const prevWindow = globalThis.window
  const mockWin = {
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]) },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)) },
    dispatch(type) { for (const fn of [...(listeners.get(type) ?? [])]) fn() },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: mockWin })
  context.after(() => {
    bindNavigationRouter(router, { homeRoute: '/pages/mobile/home/index' })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: prevWindow })
  })

  let fakePath = '/pages/mobile/home/index'
  const fakeRouter = {
    currentRoute: { get value() { return { path: fakePath } } },
    async push(url) { fakePath = url },
    async replace(url) { fakePath = url },
    back() { queueMicrotask(() => mockWin.dispatch('popstate')) },
  }
  bindNavigationRouter(fakeRouter, { homeRoute: '/pages/mobile/home/index' })
  navigateTo('/pages/mobile/review/index')
  navigateTo('/pages/mobile/pomodoro/index')
  navigateBack()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(canNavigateBack(), true)
  navigateBack()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(canNavigateBack(), false)
})

test('router targets and phone/tablet route tables strictly isolate per-target pages and auth metadata', () => {
  const prevTarget = globalThis.__AURALIS_APP_TARGET__
  try {
    globalThis.__AURALIS_APP_TARGET__ = 'phone'
    assert.equal(getAppTarget(), 'phone')
    assert.equal(getDefaultHomeRoute(), '/pages/mobile/home/index')
    assert.equal(getDefaultLoginRoute(), '/pages/mobile/login/index')

    globalThis.__AURALIS_APP_TARGET__ = 'tablet'
    assert.equal(getAppTarget(), 'tablet')
    assert.equal(getDefaultHomeRoute(), '/pages/tablet/dashboard/index')
    assert.equal(getDefaultLoginRoute(), '/pages/tablet/login/index')
  } finally {
    if (prevTarget === undefined) delete globalThis.__AURALIS_APP_TARGET__
    else globalThis.__AURALIS_APP_TARGET__ = prevTarget
  }

  assert.equal(PHONE_TARGET, 'phone')
  assert.equal(PHONE_HOME, '/pages/mobile/home/index')
  assert.equal(PHONE_LOGIN, '/pages/mobile/login/index')
  const phoneKeys = Object.keys(phoneLoaders)
  assert.equal(phoneKeys.every((path) => path.startsWith('/pages/mobile/')), true)
  assert.equal(phoneKeys.some((path) => path.includes('/pages/tablet/') || path.includes('/pages/launch/')), false)
  assert.equal(phoneRoutes.find((r) => r.path === PHONE_LOGIN)?.meta?.requiresAuth, undefined)
  assert.equal(phoneRoutes.find((r) => r.path === PHONE_HOME)?.meta?.requiresAuth, true)

  assert.equal(TABLET_TARGET, 'tablet')
  assert.equal(TABLET_HOME, '/pages/tablet/dashboard/index')
  assert.equal(TABLET_LOGIN, '/pages/tablet/login/index')
  const tabletKeys = Object.keys(tabletLoaders)
  assert.equal(tabletKeys.every((path) => path.startsWith('/pages/tablet/')), true)
  assert.equal(tabletKeys.some((path) => path.includes('/pages/mobile/') || path.includes('/pages/launch/')), false)
  assert.equal(tabletRoutes.find((r) => r.path === TABLET_LOGIN)?.meta?.requiresAuth, undefined)
  assert.equal(tabletRoutes.find((r) => r.path === TABLET_HOME)?.meta?.requiresAuth, true)
})

test('platform/lifecycle normalizes query params and dispatches visibility show/hide with listener cleanup', async (context) => {
  const lifecycleState = {
    mounted: [],
    activated: [],
    deactivated: [],
    unmounted: [],
    routeQuery: {
      subjectId: ['sub-primary', 'sub-ignored'],
      mode: 'self-test',
      emptyArr: [null],
      ignoredNum: 42,
    },
  }
  globalThis.__lifecycleTestState = lifecycleState

  const docListeners = new Map()
  const prevDoc = globalThis.document
  const mockDocument = {
    visibilityState: 'visible',
    addEventListener(type, fn) {
      docListeners.set(type, [...(docListeners.get(type) ?? []), fn])
    },
    removeEventListener(type, fn) {
      docListeners.set(type, (docListeners.get(type) ?? []).filter((f) => f !== fn))
    },
    dispatch(type) {
      for (const fn of [...(docListeners.get(type) ?? [])]) fn()
    },
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: mockDocument })

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (ctx.parentURL?.includes('lifecycle.ts')) {
        if (specifier === 'vue') {
          return { url: 'auralis-mock://vue-lifecycle', shortCircuit: true }
        }
        if (specifier === 'vue-router') {
          return { url: 'auralis-mock://vue-router-lifecycle', shortCircuit: true }
        }
      }
      return nextResolve(specifier, ctx)
    },
    load(url, ctx, nextLoad) {
      if (url === 'auralis-mock://vue-lifecycle') {
        return {
          format: 'module',
          shortCircuit: true,
          source: `
            const s = globalThis.__lifecycleTestState;
            export const onMounted = (fn) => s.mounted.push(fn);
            export const onActivated = (fn) => s.activated.push(fn);
            export const onDeactivated = (fn) => s.deactivated.push(fn);
            export const onUnmounted = (fn) => s.unmounted.push(fn);
          `,
        }
      }
      if (url === 'auralis-mock://vue-router-lifecycle') {
        return {
          format: 'module',
          shortCircuit: true,
          source: `
            export const useRoute = () => ({ query: globalThis.__lifecycleTestState.routeQuery });
          `,
        }
      }
      return nextLoad(url, ctx)
    },
  })

  context.after(() => {
    loader.deregister()
    delete globalThis.__lifecycleTestState
    Object.defineProperty(globalThis, 'document', { configurable: true, value: prevDoc })
  })

  const { onAppHide, onAppShow, onPageHide, onPageLoad, onPageShow } = await import(
    '../src/platform/lifecycle.ts?lifecycle-test'
  )

  let loadedQuery = null
  onPageLoad((q) => {
    loadedQuery = q
  })
  assert.deepEqual(loadedQuery, {
    subjectId: 'sub-primary',
    mode: 'self-test',
    emptyArr: undefined,
  })

  const events = []
  onPageShow(() => events.push('page:show'))
  onPageHide(() => events.push('page:hide'))
  onAppShow(() => events.push('app:show'))
  onAppHide(() => events.push('app:hide'))

  for (const fn of lifecycleState.mounted) fn()
  assert.deepEqual(events, ['page:show'])
  assert.equal((docListeners.get('visibilitychange') ?? []).length, 4)

  // Redundant visible event without prior hidden transition must NOT re-fire show callbacks
  mockDocument.dispatch('visibilitychange')
  assert.deepEqual(events, ['page:show'])

  mockDocument.visibilityState = 'hidden'
  mockDocument.dispatch('visibilitychange')
  assert.deepEqual(events, ['page:show', 'page:hide', 'app:hide'])

  mockDocument.visibilityState = 'visible'
  mockDocument.dispatch('visibilitychange')
  assert.deepEqual(events, ['page:show', 'page:hide', 'app:hide', 'page:show', 'app:show'])

  for (const fn of lifecycleState.activated) fn()
  for (const fn of lifecycleState.deactivated) fn()
  assert.equal(events.filter((e) => e === 'page:show').length, 3)
  assert.equal(events.filter((e) => e === 'page:hide').length, 2)

  for (const fn of lifecycleState.unmounted) fn()
  assert.equal((docListeners.get('visibilitychange') ?? []).length, 0)
})
