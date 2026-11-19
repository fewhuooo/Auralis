export type StartupBootstrapStage = 'database' | 'hydrating' | 'syncing' | 'warming' | 'ready'

export interface StartupBootstrapResult {
  completed: boolean
  syncTimedOut: boolean
  syncSkipped: boolean
}

export interface StartupBootstrapDeps {
  isScopeCurrent: () => boolean
  isOnline: () => boolean
  isAutoSyncEnabled: () => boolean
  hydrateLocalData: () => Promise<void>
  syncCloudData: () => Promise<void>
  preloadRoutes: () => Promise<void>
  onStageChange?: (stage: StartupBootstrapStage) => void
  minDisplayMs?: number
  maxSyncWaitMs?: number
  maxPreloadWaitMs?: number
}

const DEFAULT_MIN_DISPLAY_MS = 700
const DEFAULT_MAX_SYNC_WAIT_MS = 3500
const DEFAULT_MAX_PRELOAD_WAIT_MS = 1500

export async function runStartupBootstrap(deps: StartupBootstrapDeps): Promise<StartupBootstrapResult> {
  const minDisplayMs = deps.minDisplayMs ?? DEFAULT_MIN_DISPLAY_MS
  const maxSyncWaitMs = deps.maxSyncWaitMs ?? DEFAULT_MAX_SYNC_WAIT_MS
  const maxPreloadWaitMs = deps.maxPreloadWaitMs ?? DEFAULT_MAX_PRELOAD_WAIT_MS
  const startedAt = Date.now()

  if (!deps.isScopeCurrent()) {
    return { completed: false, syncTimedOut: false, syncSkipped: true }
  }

  deps.onStageChange?.('hydrating')
  const preloadPromise = Promise.resolve().then(() => deps.preloadRoutes()).catch(() => undefined)

  await Promise.resolve().then(() => deps.hydrateLocalData()).catch(() => undefined)
  if (!deps.isScopeCurrent()) {
    return { completed: false, syncTimedOut: false, syncSkipped: true }
  }

  let syncTimedOut = false
  let syncSkipped = true
  if (deps.isOnline() && deps.isAutoSyncEnabled()) {
    syncSkipped = false
    deps.onStageChange?.('syncing')
    const syncOutcome = await awaitBounded(
      Promise.resolve().then(() => deps.syncCloudData()).catch(() => undefined),
      maxSyncWaitMs,
    )
    syncTimedOut = syncOutcome.timedOut
    if (!deps.isScopeCurrent()) {
      return { completed: false, syncTimedOut, syncSkipped }
    }
  }

  deps.onStageChange?.('warming')
  await awaitBounded(preloadPromise, maxPreloadWaitMs)
  if (!deps.isScopeCurrent()) {
    return { completed: false, syncTimedOut, syncSkipped }
  }

  const remainingMs = Math.max(0, minDisplayMs - (Date.now() - startedAt))
  if (remainingMs > 0) {
    await sleep(remainingMs)
    if (!deps.isScopeCurrent()) {
      return { completed: false, syncTimedOut, syncSkipped }
    }
  }

  deps.onStageChange?.('ready')
  return { completed: true, syncTimedOut, syncSkipped }
}

async function awaitBounded(promise: Promise<unknown>, timeoutMs: number): Promise<{ timedOut: boolean }> {
  if (timeoutMs <= 0) return { timedOut: true }

  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  try {
    const winner = await Promise.race([promise.then(() => 'done' as const), timeoutPromise])
    return { timedOut: winner === 'timeout' }
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
