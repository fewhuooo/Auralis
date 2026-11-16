import type { components } from '../api/generated/schema.ts'
import { toLocalDateKey } from '../utils/dateKey.ts'

export type FocusPhase = 'focus' | 'shortBreak' | 'longBreak'
export type FocusRunStatus = 'idle' | 'running' | 'paused'
export type FocusSessionCommand = components['schemas']['FocusSessionCommand']

export interface PersistedFocusState {
  phase: FocusPhase
  status: FocusRunStatus
  focusMinutes: number
  remainingSeconds: number
  startedAtIso: string
  phaseEndEpochMs: number | null
  selectedTaskId: string
  selectedTaskTitle: string
  selectedTaskSubject: string
  clientSessionId: string
  cycleCount: number
}

export interface FocusDailySummary {
  dateKey: string
  completedRounds: number
  focusSeconds: number
}

export interface FocusStorageAdapter {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface FocusControllerDeps {
  storage: FocusStorageAdapter
  getScope: () => string
  now: () => number
  createId: () => string
  recordSession: (command: FocusSessionCommand) => Promise<unknown>
  canSyncSession: () => boolean
  getLoginGeneration: () => symbol
}

export const FOCUS_PRESETS = [15, 25, 45, 60] as const
const SHORT_BREAK_MINUTES = 5
const LONG_BREAK_MINUTES = 15

export function phaseDurationSeconds(phase: FocusPhase, focusMinutes: number): number {
  if (phase === 'shortBreak') return SHORT_BREAK_MINUTES * 60
  if (phase === 'longBreak') return LONG_BREAK_MINUTES * 60
  return focusMinutes * 60
}

export function createDefaultFocusState(focusMinutes = 25): PersistedFocusState {
  return {
    phase: 'focus',
    status: 'idle',
    focusMinutes,
    remainingSeconds: focusMinutes * 60,
    startedAtIso: '',
    phaseEndEpochMs: null,
    selectedTaskId: '',
    selectedTaskTitle: '',
    selectedTaskSubject: '',
    clientSessionId: '',
    cycleCount: 0,
  }
}

export function stateKeyForScope(scope: string): string {
  return `auralis:local:${scope}:focus_state`
}

export function dailyKeyForScope(scope: string): string {
  return `auralis:local:${scope}:focus_daily`
}

export function outboxKeyForScope(scope: string): string {
  return `auralis:local:${scope}:focus_outbox`
}

function readJson<T>(storage: FocusStorageAdapter, key: string, fallback: T): T {
  const raw = storage.get(key)
  if (!raw) return fallback
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as T
    return raw as T
  } catch {
    return fallback
  }
}

export function createFocusController(deps: FocusControllerDeps) {
  function readState(scope = deps.getScope()): PersistedFocusState {
    const loaded = readJson<Partial<PersistedFocusState>>(deps.storage, stateKeyForScope(scope), {})
    const focusMinutes = FOCUS_PRESETS.includes(loaded.focusMinutes as (typeof FOCUS_PRESETS)[number])
      ? (loaded.focusMinutes as number)
      : 25
    const phase: FocusPhase = loaded.phase === 'shortBreak' || loaded.phase === 'longBreak' ? loaded.phase : 'focus'
    const baseSeconds = phaseDurationSeconds(phase, focusMinutes)
    return {
      ...createDefaultFocusState(focusMinutes),
      ...loaded,
      phase,
      focusMinutes,
      remainingSeconds: typeof loaded.remainingSeconds === 'number' && loaded.remainingSeconds >= 0
        ? loaded.remainingSeconds
        : baseSeconds,
    }
  }

  function saveState(state: PersistedFocusState, scope = deps.getScope()): void {
    deps.storage.set(stateKeyForScope(scope), JSON.stringify(state))
  }

  function readDaily(dateKey: string, scope = deps.getScope()): FocusDailySummary {
    const stored = readJson<Record<string, { completedRounds?: number; focusSeconds?: number }>>(
      deps.storage,
      dailyKeyForScope(scope),
      {},
    )
    const entry = stored[dateKey]
    return {
      dateKey,
      completedRounds: Number(entry?.completedRounds || 0),
      focusSeconds: Number(entry?.focusSeconds || 0),
    }
  }

  function addDailyFocus(dateKey: string, addSeconds: number, scope = deps.getScope()): FocusDailySummary {
    const stored = readJson<Record<string, { completedRounds?: number; focusSeconds?: number }>>(
      deps.storage,
      dailyKeyForScope(scope),
      {},
    )
    const current = stored[dateKey] || { completedRounds: 0, focusSeconds: 0 }
    const nextEntry = {
      completedRounds: Number(current.completedRounds || 0) + 1,
      focusSeconds: Number(current.focusSeconds || 0) + Math.max(0, Math.round(addSeconds)),
    }
    stored[dateKey] = nextEntry
    deps.storage.set(dailyKeyForScope(scope), JSON.stringify(stored))
    return { dateKey, ...nextEntry }
  }

  function readOutbox(scope = deps.getScope()): FocusSessionCommand[] {
    const items = readJson<FocusSessionCommand[]>(deps.storage, outboxKeyForScope(scope), [])
    return Array.isArray(items) ? items : []
  }

  function writeOutbox(items: FocusSessionCommand[], scope = deps.getScope()): void {
    deps.storage.set(outboxKeyForScope(scope), JSON.stringify(items))
  }

  function enqueueSession(command: FocusSessionCommand, scope = deps.getScope()): void {
    const queue = readOutbox(scope)
    if (queue.some(item => item.clientSessionId === command.clientSessionId)) return
    queue.push(command)
    writeOutbox(queue, scope)
  }

  function reconcileNow(): {
    state: PersistedFocusState
    completedFocusRound: boolean
    completedBreakRound: boolean
    completedTaskInfo: { id: string; title: string } | null
  } {
    const scope = deps.getScope()
    const state = readState(scope)
    if (state.status !== 'running' || state.phaseEndEpochMs == null) {
      return {
        state,
        completedFocusRound: false,
        completedBreakRound: false,
        completedTaskInfo: null,
      }
    }

    const nowMs = deps.now()
    const remaining = Math.ceil((state.phaseEndEpochMs - nowMs) / 1000)
    if (remaining > 0) {
      const updated: PersistedFocusState = { ...state, remainingSeconds: remaining }
      saveState(updated, scope)
      return {
        state: updated,
        completedFocusRound: false,
        completedBreakRound: false,
        completedTaskInfo: null,
      }
    }

    const endedAtEpoch = state.phaseEndEpochMs
    if (state.phase === 'focus') {
      const durationSeconds = phaseDurationSeconds('focus', state.focusMinutes)
      const startedAt = state.startedAtIso || new Date(endedAtEpoch - durationSeconds * 1000).toISOString()
      const endedAt = new Date(endedAtEpoch).toISOString()
      const command: FocusSessionCommand = {
        clientSessionId: state.clientSessionId || deps.createId(),
        ...(state.selectedTaskId ? { taskId: state.selectedTaskId } : {}),
        startedAt,
        endedAt,
        durationSeconds,
        completed: true,
      }
      enqueueSession(command, scope)
      addDailyFocus(toLocalDateKey(new Date(endedAtEpoch)), durationSeconds, scope)

      const nextCycleCount = state.cycleCount + 1
      const nextPhase: FocusPhase = nextCycleCount >= 4 ? 'longBreak' : 'shortBreak'
      const completedTaskInfo = state.selectedTaskId
        ? { id: state.selectedTaskId, title: state.selectedTaskTitle }
        : null

      const nextState: PersistedFocusState = {
        ...state,
        phase: nextPhase,
        status: 'idle',
        remainingSeconds: phaseDurationSeconds(nextPhase, state.focusMinutes),
        startedAtIso: '',
        phaseEndEpochMs: null,
        clientSessionId: '',
        cycleCount: nextCycleCount,
      }
      saveState(nextState, scope)
      return {
        state: nextState,
        completedFocusRound: true,
        completedBreakRound: false,
        completedTaskInfo,
      }
    }

    const nextCycle = state.phase === 'longBreak' || state.cycleCount >= 4 ? 0 : state.cycleCount
    const nextState: PersistedFocusState = {
      ...state,
      phase: 'focus',
      status: 'idle',
      remainingSeconds: phaseDurationSeconds('focus', state.focusMinutes),
      startedAtIso: '',
      phaseEndEpochMs: null,
      clientSessionId: '',
      cycleCount: nextCycle,
    }
    saveState(nextState, scope)
    return {
      state: nextState,
      completedFocusRound: false,
      completedBreakRound: true,
      completedTaskInfo: null,
    }
  }

  function start(): PersistedFocusState {
    const scope = deps.getScope()
    const current = reconcileNow().state
    const fullSeconds = phaseDurationSeconds(current.phase, current.focusMinutes)
    const remaining = current.remainingSeconds > 0 ? current.remainingSeconds : fullSeconds
    const nowMs = deps.now()
    const nextState: PersistedFocusState = {
      ...current,
      status: 'running',
      remainingSeconds: remaining,
      startedAtIso: current.startedAtIso || new Date(nowMs).toISOString(),
      phaseEndEpochMs: nowMs + remaining * 1000,
      clientSessionId: current.clientSessionId || deps.createId(),
    }
    saveState(nextState, scope)
    return nextState
  }

  function pause(): PersistedFocusState {
    const scope = deps.getScope()
    const current = reconcileNow().state
    if (current.status !== 'running' || current.phaseEndEpochMs == null) return current
    const remaining = Math.max(1, Math.ceil((current.phaseEndEpochMs - deps.now()) / 1000))
    const nextState: PersistedFocusState = {
      ...current,
      status: 'paused',
      remainingSeconds: remaining,
      phaseEndEpochMs: null,
    }
    saveState(nextState, scope)
    return nextState
  }

  function reset(): PersistedFocusState {
    const scope = deps.getScope()
    const current = readState(scope)
    const nextState: PersistedFocusState = {
      ...current,
      status: 'idle',
      remainingSeconds: phaseDurationSeconds(current.phase, current.focusMinutes),
      startedAtIso: '',
      phaseEndEpochMs: null,
      clientSessionId: '',
    }
    saveState(nextState, scope)
    return nextState
  }

  function skip(): PersistedFocusState {
    const scope = deps.getScope()
    const current = readState(scope)
    const nextPhase: FocusPhase = current.phase === 'focus'
      ? (current.cycleCount >= 3 ? 'longBreak' : 'shortBreak')
      : 'focus'
    const nextCycle = current.phase === 'longBreak' ? 0 : current.cycleCount
    const nextState: PersistedFocusState = {
      ...current,
      phase: nextPhase,
      status: 'idle',
      remainingSeconds: phaseDurationSeconds(nextPhase, current.focusMinutes),
      startedAtIso: '',
      phaseEndEpochMs: null,
      clientSessionId: '',
      cycleCount: nextCycle,
    }
    saveState(nextState, scope)
    return nextState
  }

  function setFocusMinutes(minutes: number): PersistedFocusState {
    const scope = deps.getScope()
    const current = readState(scope)
    if (current.status !== 'idle') return current
    const nextMinutes = FOCUS_PRESETS.includes(minutes as (typeof FOCUS_PRESETS)[number]) ? minutes : 25
    const nextState: PersistedFocusState = {
      ...current,
      focusMinutes: nextMinutes,
      remainingSeconds: current.phase === 'focus'
        ? nextMinutes * 60
        : phaseDurationSeconds(current.phase, nextMinutes),
    }
    saveState(nextState, scope)
    return nextState
  }

  function selectTask(task: { id?: string; name?: string; subject?: string } | null): PersistedFocusState {
    const scope = deps.getScope()
    const current = readState(scope)
    if (current.status !== 'idle') return current
    const nextState: PersistedFocusState = {
      ...current,
      selectedTaskId: task?.id || '',
      selectedTaskTitle: task?.name || '',
      selectedTaskSubject: task?.subject || '',
    }
    saveState(nextState, scope)
    return nextState
  }

  async function flushOutbox(): Promise<number> {
    if (!deps.canSyncSession()) return 0
    const capturedScope = deps.getScope()
    const generation = deps.getLoginGeneration()
    const queue = readOutbox(capturedScope)
    if (queue.length === 0) return 0

    let flushed = 0
    const remaining: FocusSessionCommand[] = []
    for (let i = 0; i < queue.length; i++) {
      if (deps.getLoginGeneration() !== generation || deps.getScope() !== capturedScope) {
        return flushed
      }
      const command = queue[i]
      try {
        await deps.recordSession(command)
        flushed++
      } catch {
        remaining.push(command, ...queue.slice(i + 1))
        break
      }
    }

    if (deps.getLoginGeneration() === generation && deps.getScope() === capturedScope) {
      // Merge with any newly appended commands during flight
      const latest = readOutbox(capturedScope)
      const attemptedIds = new Set(queue.map(item => item.clientSessionId))
      const appendedDuringFlight = latest.filter(item => !attemptedIds.has(item.clientSessionId))
      writeOutbox([...remaining, ...appendedDuringFlight], capturedScope)
    }
    return flushed
  }

  return {
    readState,
    readDaily,
    readOutbox,
    reconcileNow,
    start,
    pause,
    reset,
    skip,
    setFocusMinutes,
    selectTask,
    flushOutbox,
  }
}
