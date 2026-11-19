import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAuthRedirect } from '@/auth/authGuard'
import { recoverFromDynamicImportError, routeLoaders } from '@/router/routePreload'

export { resolveAuthRedirect }

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: routeLoaders.Login,
    },
    {
      path: '/',
      name: 'Dashboard',
      component: routeLoaders.Dashboard,
      meta: { requiresAuth: true },
    },
    {
      path: '/subjects',
      name: 'SubjectHall',
      component: routeLoaders.SubjectHall,
      meta: { requiresAuth: true },
    },
    {
      path: '/subject/:id',
      name: 'SubjectWorkspace',
      component: routeLoaders.SubjectWorkspace,
      meta: { requiresAuth: true },
    },
    {
      path: '/asset',
      name: 'Asset',
      component: routeLoaders.Asset,
      meta: { requiresAuth: true },
    },
    {
      path: '/timeline',
      name: 'Timeline',
      component: routeLoaders.Timeline,
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'Profile',
      component: routeLoaders.Profile,
      meta: { requiresAuth: true },
    },
    {
      path: '/pomodoro',
      name: 'Pomodoro',
      component: routeLoaders.Pomodoro,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  const hasSession = authStore.isAuthenticated
  const requiresAuth = Boolean(to.meta?.requiresAuth)
  const redirect = resolveAuthRedirect(to.path, requiresAuth, hasSession)

  if (redirect === '/login' && to.fullPath !== '/') {
    next({ path: '/login', query: { redirect: to.fullPath }, replace: true })
  } else if (redirect) {
    next(redirect)
  } else {
    next()
  }
})

router.onError((error, to) => {
  recoverFromDynamicImportError(error, to?.fullPath || '')
})

export default router
