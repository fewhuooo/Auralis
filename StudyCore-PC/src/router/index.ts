import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login/index.vue')
    },
    {
      path: '/',
      name: 'Dashboard',
      component: () => import('@/views/Dashboard/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/subjects',
      name: 'SubjectHall',
      component: () => import('@/views/SubjectHall/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/subject/:id',
      name: 'SubjectWorkspace',
      component: () => import('@/views/SubjectWorkspace/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/asset',
      name: 'Asset',
      component: () => import('@/views/Asset/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/timeline',
      name: 'Timeline',
      component: () => import('@/views/Timeline/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('@/views/Profile/index.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach((_to, _from, next) => {
  // const authStore = useAuthStore()
  // if (to.meta.requiresAuth && !authStore.token) {
  //   next('/login')
  // } else if (to.path === '/login' && authStore.token) {
  //   next('/')
  // } else {
  //   next()
  // }
  next() // Temporarily disabled login functionality
})

export default router
