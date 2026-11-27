import { createRouter, createWebHashHistory } from 'vue-router'
import { bindNavigationRouter } from '@/platform/navigation'
import { APP_TARGET, HOME_ROUTE, LOGIN_ROUTE, routeLoaders, routes } from '@/router/activeRoutes'
import { useAuthStore } from '@/store/useAuthStore'
import { registerRouteChunkLoaders } from '@/utils/pagePreload'

export { APP_TARGET, HOME_ROUTE, LOGIN_ROUTE }

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

bindNavigationRouter(router, { homeRoute: HOME_ROUTE })
registerRouteChunkLoaders(routeLoaders)

let initialSessionRestored = false
let restorePromise: Promise<void> | null = null

async function ensureInitialSessionRestored(authStore: ReturnType<typeof useAuthStore>): Promise<void> {
  if (initialSessionRestored) return
  if (restorePromise) return restorePromise
  if (!authStore.token) {
    initialSessionRestored = true
    return
  }
  restorePromise = authStore.restoreSession()
    .then(() => undefined, () => undefined)
    .finally(() => {
      initialSessionRestored = true
      restorePromise = null
    })
  return restorePromise
}

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await ensureInitialSessionRestored(authStore)

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { path: LOGIN_ROUTE, replace: true }
  }
  if (to.path === LOGIN_ROUTE && authStore.isAuthenticated) {
    return { path: HOME_ROUTE, replace: true }
  }
  return true
})

export default router
