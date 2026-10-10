export interface PomodoroDurations {
  focusDurationSeconds: number
  breakDurationSeconds: number
  longBreakDurationSeconds: number
}

export interface ActiveFocusSession {
  clientSessionId: string
  taskId: string | null
  startedAt: string
}

export interface FocusSessionEvent {
  clientSessionId: string
  taskId: string | null
  startedAt: string
  endedAt: string
  durationSeconds: number
  completed: boolean
}

export interface PomodoroRuntimeState {
  phase: 'focus' | 'break'
  completedInCycle: number
  phaseDurationSeconds: number
  elapsedBeforeRunMs: number
  runStartedAtMs: number | null
  activeSession: ActiveFocusSession | null
  durations: PomodoroDurations
}

export interface PomodoroTransition {
  runtime: PomodoroRuntimeState
  finalizedSession?: FocusSessionEvent
}

const DEFAULT_DURATIONS: PomodoroDurations = {
  focusDurationSeconds: 25 * 60,
  breakDurationSeconds: 5 * 60,
  longBreakDurationSeconds: 15 * 60,
}

function phaseDuration(phase: PomodoroRuntimeState['phase'], completedInCycle: number, durations: PomodoroDurations): number {
  if (phase === 'focus') return durations.focusDurationSeconds
  return completedInCycle >= 4 ? durations.longBreakDurationSeconds : durations.breakDurationSeconds
}

export function createPomodoroRuntime(overrides: Partial<PomodoroDurations> = {}): PomodoroRuntimeState {
  const durations = { ...DEFAULT_DURATIONS, ...overrides }
  return {
    phase: 'focus',
    completedInCycle: 0,
    phaseDurationSeconds: durations.focusDurationSeconds,
    elapsedBeforeRunMs: 0,
    runStartedAtMs: null,
    activeSession: null,
    durations,
  }
}

export function elapsedPhaseMilliseconds(runtime: PomodoroRuntimeState, nowMs: number): number {
  const liveMilliseconds = runtime.runStartedAtMs === null ? 0 : Math.max(0, nowMs - runtime.runStartedAtMs)
  return Math.min(runtime.phaseDurationSeconds * 1000, runtime.elapsedBeforeRunMs + liveMilliseconds)
}

export function elapsedFocusSeconds(runtime: PomodoroRuntimeState, nowMs: number): number {
  if (runtime.phase !== 'focus' || !runtime.activeSession) return 0
  return Math.floor(elapsedPhaseMilliseconds(runtime, nowMs) / 1000)
}

export function remainingSeconds(runtime: PomodoroRuntimeState, nowMs: number): number {
  const remainingMilliseconds = runtime.phaseDurationSeconds * 1000 - elapsedPhaseMilliseconds(runtime, nowMs)
  return Math.max(0, Math.ceil(remainingMilliseconds / 1000))
}

export function startPomodoro(
  runtime: PomodoroRuntimeState,
  input: { nowMs: number; taskId: string | null; clientSessionId: string },
): PomodoroRuntimeState {
  if (runtime.runStartedAtMs !== null) return runtime
  const activeSession = runtime.phase === 'focus'
    ? runtime.activeSession ?? {
      clientSessionId: input.clientSessionId,
      taskId: input.taskId,
      startedAt: new Date(input.nowMs).toISOString(),
    }
    : null
  return { ...runtime, activeSession, runStartedAtMs: input.nowMs }
}

export function pausePomodoro(runtime: PomodoroRuntimeState, nowMs: number): PomodoroRuntimeState {
  if (runtime.runStartedAtMs === null) return runtime
  return {
    ...runtime,
    elapsedBeforeRunMs: elapsedPhaseMilliseconds(runtime, nowMs),
    runStartedAtMs: null,
  }
}

export function resumePomodoro(runtime: PomodoroRuntimeState, nowMs: number): PomodoroRuntimeState {
  if (runtime.runStartedAtMs !== null) return runtime
  return { ...runtime, runStartedAtMs: nowMs }
}

function eventFor(runtime: PomodoroRuntimeState, nowMs: number, completed: boolean): FocusSessionEvent | undefined {
  if (!runtime.activeSession || runtime.phase !== 'focus') return undefined
  const durationSeconds = elapsedFocusSeconds(runtime, nowMs)
  if (durationSeconds <= 0) return undefined
  return {
    ...runtime.activeSession,
    endedAt: new Date(nowMs).toISOString(),
    durationSeconds,
    completed,
  }
}

function moveToNextPhase(runtime: PomodoroRuntimeState, completed: boolean): PomodoroRuntimeState {
  if (runtime.phase === 'focus') {
    const completedInCycle = completed ? runtime.completedInCycle + 1 : runtime.completedInCycle
    const phase: PomodoroRuntimeState['phase'] = 'break'
    return {
      ...runtime,
      phase,
      completedInCycle,
      phaseDurationSeconds: phaseDuration(phase, completedInCycle, runtime.durations),
      elapsedBeforeRunMs: 0,
      runStartedAtMs: null,
      activeSession: null,
    }
  }
  const completedInCycle = runtime.completedInCycle >= 4 ? 0 : runtime.completedInCycle
  const phase: PomodoroRuntimeState['phase'] = 'focus'
  return {
    ...runtime,
    phase,
    completedInCycle,
    phaseDurationSeconds: runtime.durations.focusDurationSeconds,
    elapsedBeforeRunMs: 0,
    runStartedAtMs: null,
    activeSession: null,
  }
}

export function tickPomodoro(runtime: PomodoroRuntimeState, nowMs: number): PomodoroTransition {
  if (runtime.runStartedAtMs === null || remainingSeconds(runtime, nowMs) > 0) return { runtime }
  const phaseEndMs = runtime.runStartedAtMs + Math.max(0, runtime.phaseDurationSeconds * 1000 - runtime.elapsedBeforeRunMs)
  const finalizedSession = eventFor(runtime, phaseEndMs, runtime.phase === 'focus')
  return { runtime: moveToNextPhase(runtime, runtime.phase === 'focus'), finalizedSession }
}

export function skipPomodoro(runtime: PomodoroRuntimeState, nowMs: number): PomodoroTransition {
  const finalizedSession = eventFor(runtime, nowMs, false)
  return { runtime: moveToNextPhase(runtime, false), finalizedSession }
}

export function resetPomodoro(runtime: PomodoroRuntimeState, nowMs: number): PomodoroTransition {
  const finalizedSession = eventFor(runtime, nowMs, false)
  return {
    runtime: {
      ...runtime,
      elapsedBeforeRunMs: 0,
      runStartedAtMs: null,
      activeSession: null,
    },
    finalizedSession,
  }
}
