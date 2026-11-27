import { onActivated, onDeactivated, onMounted, onUnmounted } from 'vue'
import { useRoute, type LocationQuery } from 'vue-router'

function normalizeQuery(query: LocationQuery): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, raw] of Object.entries(query)) {
    if (Array.isArray(raw)) {
      const first = raw.find((item): item is string => typeof item === 'string')
      result[key] = first
    } else if (typeof raw === 'string') {
      result[key] = raw
    }
  }
  return result
}

export function onPageLoad(callback: (query: Record<string, string | undefined>) => void): void {
  const route = useRoute()
  callback(normalizeQuery(route.query))
}

function subscribeForegroundTransitions(
  onHide?: () => void,
  onShow?: () => void,
): () => void {
  let isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'

  const markHidden = () => {
    if (isHidden) return
    isHidden = true
    onHide?.()
  }

  const markVisible = () => {
    if (!isHidden) return
    isHidden = false
    onShow?.()
  }

  const handleVisibility = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'hidden') {
      markHidden()
      return
    }
    if (document.visibilityState === 'visible') {
      markVisible()
    }
  }

  const hasDoc = typeof document !== 'undefined' && typeof document.addEventListener === 'function'
  const hasWin = typeof window !== 'undefined' && typeof window.addEventListener === 'function'

  if (hasDoc) {
    document.addEventListener('visibilitychange', handleVisibility)
  }
  if (hasWin) {
    window.addEventListener('auralis-app-pause', markHidden)
    window.addEventListener('auralis-app-resume', markVisible)
  }

  return () => {
    if (hasDoc) {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    if (hasWin) {
      window.removeEventListener('auralis-app-pause', markHidden)
      window.removeEventListener('auralis-app-resume', markVisible)
    }
  }
}

export function onPageShow(callback: () => void): void {
  let stopTransitions: (() => void) | null = null

  onMounted(() => {
    callback()
    stopTransitions = subscribeForegroundTransitions(undefined, callback)
  })
  onActivated(() => callback())
  onUnmounted(() => {
    stopTransitions?.()
    stopTransitions = null
  })
}

export function onPageHide(callback: () => void): void {
  let stopTransitions: (() => void) | null = null

  onMounted(() => {
    stopTransitions = subscribeForegroundTransitions(callback, undefined)
  })
  onDeactivated(() => callback())
  onUnmounted(() => {
    stopTransitions?.()
    stopTransitions = null
  })
}

export function onAppLaunch(callback: () => void | Promise<void>): void {
  onMounted(() => {
    void callback()
  })
}

export function onAppShow(callback: () => void): void {
  let stopTransitions: (() => void) | null = null

  onMounted(() => {
    stopTransitions = subscribeForegroundTransitions(undefined, callback)
  })
  onUnmounted(() => {
    stopTransitions?.()
    stopTransitions = null
  })
}

export function onAppHide(callback: () => void): void {
  let stopTransitions: (() => void) | null = null

  onMounted(() => {
    stopTransitions = subscribeForegroundTransitions(callback, undefined)
  })
  onUnmounted(() => {
    stopTransitions?.()
    stopTransitions = null
  })
}
