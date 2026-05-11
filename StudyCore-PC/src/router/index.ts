import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/store/useAuthStore'

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
      name: 'Home',
      component: () => import('@/views/Home/index.vue')
    },
    {
      path: '/asset',
      name: 'Asset',
      component: () => import('@/views/Asset/index.vue')
    },
    {
      path: '/timeline',
      name: 'Timeline',
      component: () => import('@/views/Timeline/index.vue')
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('@/views/Profile/index.vue')
    }
  ]
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  // Skip login check for development
  next()
})

export default router
