import type { Router } from 'vue-router'

interface HistoryNavigationInfo {
  direction?: string
  type?: string
}

interface RouterHistoryLike {
  listen?: (callback: (to: unknown, from: unknown, info: HistoryNavigationInfo) => void) => () => void
}

let activeRouter: Router | null = null
let fallbackHomeRoute = '/pages/mobile/home/index'
let inAppHistoryDepth = 0
let pendingProgrammaticBacks = 0
let hasHistoryListener = false
let cleanupHistoryListener: (() => void) | null = null

function handleHistoryPop(info?: HistoryNavigationInfo): void {
  if (info?.type && info.type !== 'pop') return
  if (info?.direction && info.direction !== 'back') return
  if (pendingProgrammaticBacks > 0) {
    pendingProgrammaticBacks -= 1
    return
  }
  if (inAppHistoryDepth > 0) {
    inAppHistoryDepth -= 1
  }
}

export function bindNavigationRouter(router: Router, options?: { homeRoute?: string }): void {
  cleanupHistoryListener?.()
  cleanupHistoryListener = null
  hasHistoryListener = false
  activeRouter = router
  inAppHistoryDepth = 0
  pendingProgrammaticBacks = 0
  if (options?.homeRoute) {
    fallbackHomeRoute = options.homeRoute
  }

  const history = (router as unknown as { options?: { history?: RouterHistoryLike } }).options?.history
  if (history && typeof history.listen === 'function') {
    cleanupHistoryListener = history.listen((_to, _from, info) => {
      handleHistoryPop(info)
    })
    hasHistoryListener = true
    return
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onPopstate = () => handleHistoryPop()
    window.addEventListener('popstate', onPopstate)
    cleanupHistoryListener = () => {
      window.removeEventListener('popstate', onPopstate)
    }
    hasHistoryListener = true
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
  pendingProgrammaticBacks = 0
  if (!activeRouter) return
  void activeRouter.replace(url)
}

export function navigateBack(): void {
  if (!activeRouter) return
  if (canNavigateBack()) {
    inAppHistoryDepth -= 1
    if (hasHistoryListener) {
      pendingProgrammaticBacks += 1
    }
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
