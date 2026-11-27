import type { RouteRecordRaw } from 'vue-router'

export const APP_TARGET = 'tablet' as const
export const HOME_ROUTE = '/pages/tablet/dashboard/index'
export const LOGIN_ROUTE = '/pages/tablet/login/index'

export const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/pages/tablet/dashboard/index': () => import('@/pages/tablet/dashboard/index.vue'),
  '/pages/tablet/subject-hall/index': () => import('@/pages/tablet/subject-hall/index.vue'),
  '/pages/tablet/workspace/index': () => import('@/pages/tablet/workspace/index.vue'),
  '/pages/tablet/handwriting/index': () => import('@/pages/tablet/handwriting/index.vue'),
  '/pages/tablet/pomodoro/index': () => import('@/pages/tablet/pomodoro/index.vue'),
  '/pages/tablet/profile/index': () => import('@/pages/tablet/profile/index.vue'),
  '/pages/tablet/ai-search/index': () => import('@/pages/tablet/ai-search/index.vue'),
  '/pages/tablet/login/index': () => import('@/pages/tablet/login/index.vue'),
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: HOME_ROUTE,
  },
  {
    path: '/pages/tablet/dashboard/index',
    component: routeLoaders['/pages/tablet/dashboard/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/tablet/subject-hall/index',
    component: routeLoaders['/pages/tablet/subject-hall/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/tablet/workspace/index',
    component: routeLoaders['/pages/tablet/workspace/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/tablet/handwriting/index',
    component: routeLoaders['/pages/tablet/handwriting/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/tablet/pomodoro/index',
    component: routeLoaders['/pages/tablet/pomodoro/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/tablet/profile/index',
    component: routeLoaders['/pages/tablet/profile/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/tablet/ai-search/index',
    component: routeLoaders['/pages/tablet/ai-search/index'],
    meta: { requiresAuth: true },
  },
  {
    path: '/pages/tablet/login/index',
    component: routeLoaders['/pages/tablet/login/index'],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]
