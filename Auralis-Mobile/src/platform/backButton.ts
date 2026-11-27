import {
  closeImagePreview,
  confirmState,
  previewImageState,
  resolveConfirm,
} from './feedbackState.ts'
import {
  canNavigateBack,
  getCurrentRoutePath,
  navigateBack,
  reLaunch,
  redirectTo,
} from './navigation.ts'

export type BackHandler = () => boolean

export interface AndroidBackBridgeDeps {
  consumeReturnRoute?: () => string
  triggerReturn?: (duration?: number) => void
}

const TOP_LEVEL_ROUTES = new Set([
  '/pages/mobile/home/index',
  '/pages/mobile/learn/index',
  '/pages/mobile/pomodoro/index',
  '/pages/mobile/profile/index',
  '/pages/mobile/login/index',
  '/pages/tablet/dashboard/index',
  '/pages/tablet/subject-hall/index',
  '/pages/tablet/pomodoro/index',
  '/pages/tablet/profile/index',
  '/pages/tablet/ai-search/index',
  '/pages/tablet/login/index',
])

const SECONDARY_ROUTE_FALLBACKS: Record<string, string> = {
  '/pages/mobile/ai-search/index': '/pages/mobile/home/index',
  '/pages/mobile/review/index': '/pages/mobile/learn/index',
  '/pages/tablet/workspace/index': '/pages/tablet/subject-hall/index',
  '/pages/tablet/handwriting/index': '/pages/tablet/subject-hall/index',
}

const backHandlers: BackHandler[] = []
let activeBridgeCleanup: (() => void) | null = null

export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler)
  let removed = false
  return () => {
    if (removed) return
    removed = true
    const idx = backHandlers.lastIndexOf(handler)
    if (idx !== -1) {
      backHandlers.splice(idx, 1)
    }
  }
}

export function handleAndroidBack(deps?: AndroidBackBridgeDeps): boolean {
  if (previewImageState.visible) {
    closeImagePreview()
    return true
  }
  if (confirmState.visible) {
    resolveConfirm(false)
    return true
  }

  for (const handler of [...backHandlers].reverse()) {
    if (handler()) {
      return true
    }
  }

  if (canNavigateBack()) {
    deps?.triggerReturn?.(360)
    navigateBack()
    return true
  }

  const currentPath = getCurrentRoutePath()
  const fallbackRoute = SECONDARY_ROUTE_FALLBACKS[currentPath]
  if (!fallbackRoute) {
    return false
  }

  if (currentPath === '/pages/mobile/ai-search/index') {
    const returnRoute = deps?.consumeReturnRoute?.() || ''
    if (returnRoute) {
      deps?.triggerReturn?.(360)
      if (TOP_LEVEL_ROUTES.has(returnRoute)) {
        reLaunch(returnRoute)
      } else {
        redirectTo(returnRoute)
      }
      return true
    }
  }

  deps?.triggerReturn?.(360)
  reLaunch(fallbackRoute)
  return true
}

export function installAndroidBackBridge(deps?: AndroidBackBridgeDeps): () => void {
  activeBridgeCleanup?.()
  activeBridgeCleanup = null

  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined
  }

  const onAndroidBack = (event: Event) => {
    if (handleAndroidBack(deps)) {
      event.preventDefault()
    }
  }

  window.addEventListener('auralis-android-back', onAndroidBack)
  const cleanup = () => {
    window.removeEventListener('auralis-android-back', onAndroidBack)
    if (activeBridgeCleanup === cleanup) {
      activeBridgeCleanup = null
    }
  }
  activeBridgeCleanup = cleanup
  return cleanup
}
