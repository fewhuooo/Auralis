export interface PreloadBridge {
  preloadPage?: (options: {
    url: string
    complete?: () => void
    fail?: () => void
  }) => unknown
}

export type RouteChunkLoader = () => Promise<unknown>

const registeredRouteLoaders = new Map<string, RouteChunkLoader>()

export function normalizeRoutePath(url: string): string {
  const clean = url.split('?')[0]?.trim() || ''
  if (!clean) return ''
  return clean.startsWith('/') ? clean : `/${clean}`
}

export function registerRouteChunkLoaders(loaders: Record<string, RouteChunkLoader>): void {
  registeredRouteLoaders.clear()
  for (const [path, loader] of Object.entries(loaders)) {
    const normalized = normalizeRoutePath(path)
    if (normalized) registeredRouteLoaders.set(normalized, loader)
  }
}

function defaultBridgeProvider(): PreloadBridge | undefined {
  if (registeredRouteLoaders.size === 0) return undefined
  return {
    preloadPage(options) {
      const loader = registeredRouteLoaders.get(normalizeRoutePath(options.url))
      if (!loader) {
        options.complete?.()
        return
      }
      void loader().then(
        () => options.complete?.(),
        () => {
          options.fail?.()
          options.complete?.()
        },
      )
    },
  }
}

export function createRoutePreloader(
  getBridge: () => PreloadBridge | undefined = defaultBridgeProvider,
) {
  const preloaded = new Set<string>()
  const inFlight = new Map<string, Promise<void>>()

  function preloadRoute(url: string, maxWaitMs = 600): Promise<void> {
    const path = normalizeRoutePath(url)
    if (!path || preloaded.has(path)) return Promise.resolve()

    const existing = inFlight.get(path)
    if (existing) return existing

    const bridge = getBridge()
    if (!bridge || typeof bridge.preloadPage !== 'function') {
      preloaded.add(path)
      return Promise.resolve()
    }

    let settled = false
    const task = new Promise<void>((resolve) => {
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        inFlight.delete(path)
        if (ok) preloaded.add(path)
        resolve()
      }
      const timer = setTimeout(() => finish(false), maxWaitMs)
      try {
        let failed = false
        bridge.preloadPage!({
          url: path,
          fail: () => {
            failed = true
          },
          complete: () => finish(!failed),
        })
      } catch {
        finish(false)
      }
    })

    if (!settled) inFlight.set(path, task)
    return task
  }

  function scheduleSiblingPreload(
    urls: readonly string[],
    currentUrl = '',
    delayMs = 320,
  ): () => void {
    const currentPath = normalizeRoutePath(currentUrl)
    const targets = urls
      .map(normalizeRoutePath)
      .filter((path, idx, arr) => Boolean(path) && path !== currentPath && arr.indexOf(path) === idx)

    let cancelled = false
    const timer = setTimeout(async () => {
      for (const target of targets) {
        if (cancelled) return
        await preloadRoute(target)
      }
    }, delayMs)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }

  return {
    preloadRoute,
    scheduleSiblingPreload,
    isPreloaded: (url: string) => preloaded.has(normalizeRoutePath(url)),
  }
}

const defaultPreloader = createRoutePreloader()

export const preloadRoute = defaultPreloader.preloadRoute
export const scheduleSiblingPreload = defaultPreloader.scheduleSiblingPreload
