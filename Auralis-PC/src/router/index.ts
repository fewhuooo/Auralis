import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAuthRedirect } from '@/auth/authGuard'

export { resolveAuthRedirect }

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login/index.vue'),
    },
    {
      path: '/',
      name: 'Dashboard',
      component: () => import('@/views/Dashboard/index.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/subjects',
      name: 'SubjectHall',
      component: () => import('@/views/SubjectHall/index.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/subject/:id',
      name: 'SubjectWorkspace',
      component: () => import('@/views/SubjectWorkspace/index.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/asset',
      name: 'Asset',
      component: () => import('@/views/Asset/index.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/timeline',
      name: 'Timeline',
      component: () => import('@/views/Timeline/index.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('@/views/Profile/index.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/pomodoro',
      name: 'Pomodoro',
      component: () => import('@/views/Pomodoro/index.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  const hasSession = Boolean(authStore.tokens?.accessToken)
  const requiresAuth = Boolean(to.meta?.requiresAuth)
  const redirect = resolveAuthRedirect(to.path, requiresAuth, hasSession)

  if (redirect) {
    next(redirect)
  } else {
    next()
  }
})

export default router
