import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { SyncRequestScopeTicket } from '@/api/request'
import { ApiProblemError } from '@/api/httpError'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusSessionApi } from '@/api/useFocusSessionApi'
import { getFocusSessionRepository } from '@/services/localDb'
import type { FocusSessionEvent, PomodoroRuntimeState, PomodoroTransition } from '@/services/pomodoroSessionRuntime'
import {
  createPomodoroRuntime,
  elapsedFocusSeconds as getElapsedFocusSeconds,
  pausePomodoro,
  remainingSeconds as getRemainingSeconds,
  resetPomodoro,
  resumePomodoro,
  skipPomodoro,
  startPomodoro,
  tickPomodoro,
} from '@/services/pomodoroSessionRuntime'
import type { FocusSessionRecord, FocusSessionRepository } from '@/services/focusSessionRepository'
import { uuidv7 } from '@/utils/uuid'

function currentScope(authStore: ReturnType<typeof useAuthStore>): { token: string; userId: string; deviceId: string; sessionId: string } | null {
  const userId = authStore.user?.id
  const deviceId = authStore.serverDeviceId
  const sessionId = authStore.sessionId
  if (!authStore.isAuthenticated || !userId || !deviceId || !sessionId) return null
  return { token: `${userId}\u0000${deviceId}\u0000${sessionId}`, userId, deviceId, sessionId }
}

interface FocusFlushFlight {
  scopeToken: string
  requested: boolean
  promise: Promise<number>
}

export const usePomodoroStore = defineStore('pomodoro', () => {
  const authStore = useAuthStore()
  const runtime = ref<PomodoroRuntimeState>(createPomodoroRuntime())
  const clockNow = ref(Date.now())
  const pendingSessions = ref<FocusSessionEvent[]>([])
  const localSessions = ref<FocusSessionRecord[]>([])
  const isReady = ref(false)
  const syncRevision = ref(0)

  let repository: FocusSessionRepository | null = null
  let activeScopeToken: string | null = null
  let ticker: ReturnType<typeof setInterval> | null = null
  let initializing: Promise<void> | null = null
  let scopeQueue: Promise<void> = Promise.resolve()
  let transitionInProgress = false
  let transitionQueue: Promise<void> = Promise.resolve()
  let flushFlight: FocusFlushFlight | null = null

  const isRunning = computed(() => runtime.value.runStartedAtMs !== null)
  const isBreakPhase = computed(() => runtime.value.phase === 'break')
  const currentPomodoro = computed(() => runtime.value.completedInCycle)
  const phaseDurationSeconds = computed(() => runtime.value.phaseDurationSeconds)
  const remainingSeconds = computed(() => getRemainingSeconds(runtime.value, clockNow.value))
  const pendingFocusSeconds = computed(() => pendingSessions.value.reduce((sum, session) => sum + session.durationSeconds, 0))
  const pendingCompletedCount = computed(() => pendingSessions.value.filter((session) => session.completed).length)

  function stopTicker(): void {
    if (ticker) clearInterval(ticker)
    ticker = null
  }

  function startTicker(): void {
    if (ticker || runtime.value.runStartedAtMs === null) return
    ticker = setInterval(() => {
      clockNow.value = Date.now()
      void processTick()
    }, 250)
  }

  async function serializeTransition<T>(operation: () => Promise<T>): Promise<T> {
    const previous = transitionQueue
    let release!: () => void
    transitionQueue = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  function refreshLocalSessions(): Promise<void> {
    const scopedRepository = repository
    const scopeToken = activeScopeToken
    if (!scopedRepository) return Promise.resolve()
    return scopedRepository.listSessions().then((sessions) => {
      if (activeScopeToken !== scopeToken || currentScope(authStore)?.token !== scopeToken) return
      localSessions.value = sessions
      pendingSessions.value = sessions
        .filter((session) => session.syncStatus === 'pending')
        .map(({ syncStatus: _syncStatus, ...event }) => event)
    })
  }

  async function persistTransition(nextRuntime: PomodoroRuntimeState, finalizedSession?: FocusSessionEvent): Promise<void> {
    if (!repository) throw new Error('FOCUS_SESSION_REPOSITORY_UNAVAILABLE')
    if (finalizedSession) await repository.finalize(nextRuntime, finalizedSession)
    else await repository.saveRuntime(nextRuntime)
    runtime.value = nextRuntime
    clockNow.value = Date.now()
    await refreshLocalSessions()
    if (nextRuntime.runStartedAtMs === null) stopTicker()
    else startTicker()
    if (finalizedSession) {
      void flushPending().catch((error) => console.error('Failed to sync focus sessions:', error))
    }
  }

  async function processTick(): Promise<void> {
    if (transitionInProgress) return
    transitionInProgress = true
    try {
      await serializeTransition(async () => {
        if (!repository || runtime.value.runStartedAtMs === null) return
        const transition = tickPomodoro(runtime.value, Date.now())
        if (transition.runtime === runtime.value) return
        await persistTransition(transition.runtime, transition.finalizedSession)
      })
    } catch (error) {
      console.error('Failed to persist Pomodoro phase transition:', error)
    } finally {
      transitionInProgress = false
    }
  }

  async function loadScope(scope: { token: string; userId: string; deviceId: string } | null): Promise<void> {
    await serializeTransition(async () => {
      if (scope?.token === activeScopeToken && isReady.value) return
      const previousRepository = repository
      const previousRuntime = runtime.value
      const nowMs = Date.now()
      stopTicker()
      repository = null
      activeScopeToken = null
      isReady.value = false

      if (previousRepository && previousRuntime.activeSession) {
        const naturalFinish = tickPomodoro(previousRuntime, nowMs)
        const interruption = naturalFinish.finalizedSession
          ? naturalFinish
          : resetPomodoro(previousRuntime, nowMs)
        try {
          if (interruption.finalizedSession) {
            await previousRepository.finalize(interruption.runtime, interruption.finalizedSession)
          } else {
            await previousRepository.saveRuntime(interruption.runtime)
          }
        } catch (error) {
          console.error('Failed to persist Pomodoro session before account scope change:', error)
          try {
            await previousRepository.saveRuntime(pausePomodoro(previousRuntime, nowMs))
          } catch (pauseError) {
            console.error('Failed to pause Pomodoro runtime before account scope change:', pauseError)
          }
        }
      } else if (previousRepository && previousRuntime.runStartedAtMs !== null) {
        try {
          await previousRepository.saveRuntime(pausePomodoro(previousRuntime, nowMs))
        } catch (error) {
          console.error('Failed to pause Pomodoro break before account scope change:', error)
        }
      }

      runtime.value = createPomodoroRuntime()
      clockNow.value = nowMs
      pendingSessions.value = []
      localSessions.value = []
      if (!scope) return

      const nextRepository = await getFocusSessionRepository(scope.userId, scope.deviceId)
      if (currentScope(authStore)?.token !== scope.token) return
      repository = nextRepository
      activeScopeToken = scope.token
      runtime.value = (await repository.loadRuntime()) ?? createPomodoroRuntime()
      await refreshLocalSessions()
      isReady.value = true

      const restoredTransition = tickPomodoro(runtime.value, Date.now())
      if (restoredTransition.runtime !== runtime.value) {
        await persistTransition(restoredTransition.runtime, restoredTransition.finalizedSession)
      }
      if (runtime.value.runStartedAtMs !== null) startTicker()
    })
  }

  function queueScopeLoad(scope: { token: string; userId: string; deviceId: string } | null): Promise<void> {
    const queued = scopeQueue.then(() => loadScope(scope), () => loadScope(scope))
    scopeQueue = queued.then(() => undefined, () => undefined)
    return queued
  }

  async function ensureReady(): Promise<void> {
    await scopeQueue
    const scope = currentScope(authStore)
    if (!isReady.value || activeScopeToken !== (scope?.token ?? null)) await queueScopeLoad(scope)
  }

  async function initialize(): Promise<void> {
    if (isReady.value && activeScopeToken === (currentScope(authStore)?.token ?? null)) return
    if (!initializing) {
      initializing = ensureReady().finally(() => { initializing = null })
    }
    await initializing
  }

  async function flushPending(): Promise<number> {
    const scopeToken = currentScope(authStore)?.token
    if (!scopeToken || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0
    await initialize()
    const scopedRepository = repository
    const requestScope: SyncRequestScopeTicket = {
      key: Symbol('focus-session-sync-scope'),
      isCurrent: () => activeScopeToken === scopeToken && currentScope(authStore)?.token === scopeToken,
    }
    if (!scopedRepository || !requestScope.isCurrent()) return 0
    if (flushFlight?.scopeToken === scopeToken) {
      flushFlight.requested = true
      return flushFlight.promise
    }
    const flight: FocusFlushFlight = {
      scopeToken,
      requested: false,
      promise: Promise.resolve().then(async () => {
        let sent = 0
        do {
          flight.requested = false
          const sentBeforeBatch = sent
          for (const event of await scopedRepository.listPending()) {
            if (!requestScope.isCurrent()) break
            try {
              await useFocusSessionApi.create(event, requestScope)
            } catch (error) {
              // Row-specific rejections keep the original event pending while independent events can upload.
              if (error instanceof ApiProblemError && ['RESOURCE_NOT_FOUND', 'RESOURCE_VERSION_CONFLICT', 'VALIDATION_FAILED']
                .includes(error.problem.code ?? '')) continue
              break
            }
            if (!requestScope.isCurrent()) break
            await scopedRepository.acknowledge(event.clientSessionId)
            sent += 1
          }
          if (sent > sentBeforeBatch && requestScope.isCurrent()) {
            await refreshLocalSessions()
            if (requestScope.isCurrent()) syncRevision.value += sent - sentBeforeBatch
          }
        } while (flight.requested && requestScope.isCurrent())
        return sent
      }).finally(() => {
        if (flushFlight === flight) flushFlight = null
      }),
    }
    flushFlight = flight
    return flight.promise
  }

  async function start(taskId: string | null = null): Promise<void> {
    await initialize()
    await serializeTransition(async () => {
      if (!repository || activeScopeToken !== (currentScope(authStore)?.token ?? null)) {
        throw new Error('FOCUS_SESSION_SCOPE_CHANGED')
      }
      const nextRuntime = startPomodoro(runtime.value, {
        nowMs: Date.now(),
        taskId,
        clientSessionId: globalThis.crypto?.randomUUID?.() ?? uuidv7(),
      })
      await repository.saveRuntime(nextRuntime)
      runtime.value = nextRuntime
      clockNow.value = Date.now()
      startTicker()
    })
  }

  async function pause(): Promise<void> {
    await initialize()
    await serializeTransition(async () => {
      if (!repository || activeScopeToken !== (currentScope(authStore)?.token ?? null)) return
      const nowMs = Date.now()
      const completed = tickPomodoro(runtime.value, nowMs)
      const transition: PomodoroTransition = completed.runtime === runtime.value
        ? { runtime: pausePomodoro(runtime.value, nowMs) }
        : completed
      if (transition.runtime !== runtime.value) await persistTransition(transition.runtime, transition.finalizedSession)
    })
  }

  async function resume(): Promise<void> {
    await initialize()
    await serializeTransition(async () => {
      if (!repository || activeScopeToken !== (currentScope(authStore)?.token ?? null)) return
      const nowMs = Date.now()
      const completed = tickPomodoro(runtime.value, nowMs)
      const transition: PomodoroTransition = completed.runtime === runtime.value
        ? { runtime: resumePomodoro(runtime.value, nowMs) }
        : completed
      if (transition.runtime !== runtime.value) await persistTransition(transition.runtime, transition.finalizedSession)
    })
  }

  async function skip(): Promise<void> {
    await initialize()
    await serializeTransition(async () => {
      if (!repository || activeScopeToken !== (currentScope(authStore)?.token ?? null)) return
      const nowMs = Date.now()
      const naturalFinish = tickPomodoro(runtime.value, nowMs)
      const transition = naturalFinish.runtime !== runtime.value ? naturalFinish : skipPomodoro(runtime.value, nowMs)
      if (transition.runtime !== runtime.value || transition.finalizedSession) {
        await persistTransition(transition.runtime, transition.finalizedSession)
      }
    })
  }

  async function reset(): Promise<void> {
    await initialize()
    await serializeTransition(async () => {
      if (!repository || activeScopeToken !== (currentScope(authStore)?.token ?? null)) return
      const nowMs = Date.now()
      const naturalFinish = tickPomodoro(runtime.value, nowMs)
      const transition = naturalFinish.runtime !== runtime.value ? naturalFinish : resetPomodoro(runtime.value, nowMs)
      if (transition.runtime !== runtime.value || transition.finalizedSession) {
        await persistTransition(transition.runtime, transition.finalizedSession)
      }
    })
  }

  function focusStatsForLocalDate(date = new Date()): { completedCount: number; focusSeconds: number } {
    const localDay = date.toDateString()
    return localSessions.value.reduce((result, session) => {
      if (new Date(session.endedAt).toDateString() !== localDay) return result
      result.focusSeconds += session.durationSeconds
      if (session.completed) result.completedCount += 1
      return result
    }, { completedCount: 0, focusSeconds: 0 })
  }

  function getCurrentElapsedFocusSeconds(): number {
    return getElapsedFocusSeconds(runtime.value, clockNow.value)
  }

  watch(
    () => currentScope(authStore)?.token ?? null,
    (token) => {
      const scope = currentScope(authStore)
      if ((scope?.token ?? null) !== token) return
      void queueScopeLoad(scope).catch((error) => console.error('Failed to switch Pomodoro account scope:', error))
    },
  )

  if (typeof window !== 'undefined') {
    setInterval(() => { clockNow.value = Date.now() }, 60_000)
  }

  return {
    runtime,
    isReady,
    isRunning,
    isBreakPhase,
    currentPomodoro,
    phaseDurationSeconds,
    remainingSeconds,
    completedToday: computed(() => focusStatsForLocalDate(new Date(clockNow.value)).completedCount),
    focusSecondsToday: computed(() => focusStatsForLocalDate(new Date(clockNow.value)).focusSeconds),
    pendingSessions,
    localSessions,
    pendingFocusSeconds,
    pendingCompletedCount,
    syncRevision,
    initialize,
    start,
    pause,
    resume,
    skip,
    reset,
    flushPending,
    focusStatsForLocalDate,
    getCurrentElapsedFocusSeconds,
  }
})
