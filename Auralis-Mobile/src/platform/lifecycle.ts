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

export function onPageShow(callback: () => void): void {
  let wasHidden = false
  const handleVisibility = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'hidden') {
      wasHidden = true
      return
    }
    if (document.visibilityState === 'visible' && wasHidden) {
      wasHidden = false
      callback()
    }
  }

  onMounted(() => {
    callback()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
  })
  onActivated(() => callback())
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  })
}

export function onPageHide(callback: () => void): void {
  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      callback()
    }
  }

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
  })
  onDeactivated(() => callback())
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  })
}

export function onAppLaunch(callback: () => void | Promise<void>): void {
  onMounted(() => {
    void callback()
  })
}

export function onAppShow(callback: () => void): void {
  let wasHidden = false
  const handleVisibility = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'hidden') {
      wasHidden = true
      return
    }
    if (document.visibilityState === 'visible' && wasHidden) {
      wasHidden = false
      callback()
    }
  }

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
  })
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  })
}

export function onAppHide(callback: () => void): void {
  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      callback()
    }
  }

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
  })
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  })
}
