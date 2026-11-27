import type { RouteRecordRaw } from 'vue-router'

export const APP_TARGET = 'phone' as const
export const HOME_ROUTE = '/pages/mobile/home/index'
export const LOGIN_ROUTE = '/pages/mobile/login/index'

export const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/pages/mobile/home/index': () => import('@/pages/mobile/home/index.vue'),
  '/pages/mobile/learn/index': () => import('@/pages/mobile/learn/index.vue'),
  '/pages/mobile/review/index': () => import('@/pages/mobile/review/index.vue'),
  '/pages/mobile/pomodoro/index': () => import('@/pages/mobile/pomodoro/index.vue'),
  '/pages/mobile/profile/index': () => import('@/pages/mobile/profile/index.vue'),
  '/pages/mobile/ai-search/index': () => import('@/pages/mobile/ai-search/index.vue'),
  '/pages/mobile/login/index': () => import('@/pages/mobile/login/index.vue'),
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: HOME_ROUTE,
  },
  {
    path: '/pages/mobile/home/index',
    component: routeLoaders['/pages/mobile/home/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/mobile/learn/index',
    component: routeLoaders['/pages/mobile/learn/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/mobile/review/index',
    component: routeLoaders['/pages/mobile/review/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/mobile/pomodoro/index',
    component: routeLoaders['/pages/mobile/pomodoro/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/mobile/profile/index',
    component: routeLoaders['/pages/mobile/profile/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/mobile/ai-search/index',
    component: routeLoaders['/pages/mobile/ai-search/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/mobile/login/index',
    component: routeLoaders['/pages/mobile/login/index'],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]
