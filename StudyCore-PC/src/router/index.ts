import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
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

export default router
