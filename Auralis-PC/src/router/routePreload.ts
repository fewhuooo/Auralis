export const routeLoaders = {
  Login: () => import('@/views/Login/index.vue'),
  Dashboard: () => import('@/views/Dashboard/index.vue'),
  SubjectHall: () => import('@/views/SubjectHall/index.vue'),
  SubjectWorkspace: () => import('@/views/SubjectWorkspace/index.vue'),
  Asset: () => import('@/views/Asset/index.vue'),
  Timeline: () => import('@/views/Timeline/index.vue'),
  Profile: () => import('@/views/Profile/index.vue'),
  Pomodoro: () => import('@/views/Pomodoro/index.vue'),
}

export type RouteLoaderName = keyof typeof routeLoaders

export const AUTHENTICATED_ROUTE_NAMES: readonly RouteLoaderName[] = [
  'Dashboard',
  'SubjectHall',
  'SubjectWorkspace',
  'Asset',
  'Timeline',
  'Profile',
  'Pomodoro',
] as const

const CHUNK_RELOAD_STORAGE_KEY = 'auralis:pc:chunk-reload'
const DEFAULT_RELOAD_COOLDOWN_MS = 15_000
const FALLBACK_ORIGIN = 'https://auralis.local'
const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
  'unable to preload css',
]

export interface ChunkRecoveryOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  cooldownMs?: number
  reload?: (targetPath: string) => void
}

export function createRoutePreloader<Name extends string>(
  loaders: Record<Name, () => Promise<unknown>>,
  authenticatedNames: readonly Name[],
): {
  preloadRoute: (name: Name) => Promise<unknown>
  preloadAuthenticatedRoutes: () => Promise<void>
} {
  const preloadedRoutes = new Map<Name, Promise<unknown>>()

  function preloadRoute(name: Name): Promise<unknown> {
    const existing = preloadedRoutes.get(name)
    if (existing) return existing
    const pending = loaders[name]().catch((error) => {
      if (preloadedRoutes.get(name) === pending) {
        preloadedRoutes.delete(name)
      }
      throw error
    })
    preloadedRoutes.set(name, pending)
    return pending
  }

  async function preloadAuthenticatedRoutes(): Promise<void> {
    await Promise.allSettled(authenticatedNames.map((name) => preloadRoute(name)))
  }

  return { preloadRoute, preloadAuthenticatedRoutes }
}

const defaultPreloader = createRoutePreloader(routeLoaders, AUTHENTICATED_ROUTE_NAMES)
export const preloadRoute = defaultPreloader.preloadRoute
export const preloadAuthenticatedRoutes = defaultPreloader.preloadAuthenticatedRoutes

export function isDynamicImportFetchError(error: unknown): boolean {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '')
  const normalized = rawMessage.toLowerCase()
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function resolveSafeSameOriginPath(targetPath: string, origin?: string): string | null {
  if (!targetPath || !targetPath.startsWith('/') || targetPath.startsWith('//') || targetPath.startsWith('/\\')) {
    return null
  }
  const baseOrigin = origin
    ?? (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
      ? window.location.origin
      : FALLBACK_ORIGIN)
  try {
    const url = new URL(targetPath, baseOrigin)
    if (url.origin !== baseOrigin) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function recoverFromDynamicImportError(
  error: unknown,
  targetPath: string,
  options: ChunkRecoveryOptions = {},
): boolean {
  if (!isDynamicImportFetchError(error)) return false

  const safePath = resolveSafeSameOriginPath(targetPath) ?? ''
  const storage = options.storage !== undefined ? options.storage : defaultStorage()
  const cooldownMs = options.cooldownMs ?? DEFAULT_RELOAD_COOLDOWN_MS
  const now = Date.now()

  if (storage) {
    let lastTimestamp: number | null = null
    try {
      const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { timestamp?: unknown } | null
        if (typeof parsed?.timestamp === 'number') {
          lastTimestamp = parsed.timestamp
        }
      }
    } catch {
      lastTimestamp = null
    }

    if (lastTimestamp !== null && now - lastTimestamp < cooldownMs) {
      return false
    }

    try {
      storage.setItem(CHUNK_RELOAD_STORAGE_KEY, JSON.stringify({ targetPath: safePath, timestamp: now }))
    } catch {
      // Proceed with bounded reload attempt if sessionStorage write fails.
    }
  }

  const reload = options.reload ?? defaultReload
  reload(safePath)
  return true
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function defaultReload(targetPath: string): void {
  if (typeof window === 'undefined') return
  const safePath = resolveSafeSameOriginPath(targetPath)
  if (safePath) {
    window.location.assign(safePath)
    return
  }
  window.location.reload()
}
