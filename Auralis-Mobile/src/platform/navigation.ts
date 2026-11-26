import type { Router } from 'vue-router'

let activeRouter: Router | null = null
let fallbackHomeRoute = '/pages/mobile/home/index'
let inAppHistoryDepth = 0
let popstateBound = false

function handlePopstate(): void {
  if (inAppHistoryDepth > 0) {
    inAppHistoryDepth -= 1
  }
}

export function bindNavigationRouter(router: Router, options?: { homeRoute?: string }): void {
  activeRouter = router
  inAppHistoryDepth = 0
  if (options?.homeRoute) {
    fallbackHomeRoute = options.homeRoute
  }
  if (!popstateBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', handlePopstate)
    popstateBound = true
  }
}

export function navigateTo(url: string): void {
  if (!activeRouter) return
  inAppHistoryDepth += 1
  void activeRouter.push(url).catch(() => {
    if (inAppHistoryDepth > 0) inAppHistoryDepth -= 1
  })
}

export function redirectTo(url: string, options?: { complete?: () => void }): void {
  if (!activeRouter) {
    options?.complete?.()
    return
  }
  void activeRouter.replace(url).finally(() => {
    options?.complete?.()
  })
}

export function reLaunch(url: string): void {
  inAppHistoryDepth = 0
  if (!activeRouter) return
  void activeRouter.replace(url)
}

export function navigateBack(): void {
  if (!activeRouter) return
  if (canNavigateBack()) {
    inAppHistoryDepth -= 1
    activeRouter.back()
    return
  }
  void activeRouter.replace(fallbackHomeRoute)
}

export function getCurrentRoutePath(): string {
  return activeRouter?.currentRoute.value.path || ''
}

export function canNavigateBack(): boolean {
  return inAppHistoryDepth > 0
}
