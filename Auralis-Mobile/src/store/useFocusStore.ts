import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { focusApi } from '@/api/focusApi'
import {
  createDefaultFocusState,
  createFocusController,
  phaseDurationSeconds,
  type PersistedFocusState,
} from '@/services/focusController'
import { showToast } from '@/platform/feedback'
import { triggerHapticFeedback } from '@/platform/haptics'
import { getStorageItem, setStorageItem } from '@/platform/storage'
import { localDataScope } from '@/services/localDataScope'
import { readAutoSyncPreference } from '@/services/syncPreferences'
import { toLocalDateKey } from '@/utils/dateKey'
import { uuidv7 } from '@/utils/uuid'
import { useAuthStore } from './useAuthStore'

export const useFocusStore = defineStore('focus', () => {
  const auth = useAuthStore()

  const controller = createFocusController({
    storage: {
      get: key => getStorageItem(key) ?? '',
      set: (key, value) => setStorageItem(key, String(value)),
    },
    getScope: () => localDataScope.current(),
    now: () => Date.now(),
    createId: () => uuidv7(),
    recordSession: command => focusApi.recordSession(command),
    canSyncSession: () => auth.isAuthenticated,
    getLoginGeneration: () => auth.getLoginGeneration(),
    hasPendingTaskSync: async (taskId: string) => {
      if (!taskId) return false
      try {
        const [{ useTaskStore }, { localDb }] = await Promise.all([
          import('./useTaskStore'),
          import('@/services/localDb'),
        ])
        const inMemory = useTaskStore().allTasks.find(item => item.id === taskId)
        if (inMemory?.sync_status === 'pending_create') return true
        const pending = await localDb.getUnsyncedMutations()
        return pending.some(
          row => row.entity_type === 'task' && row.entity_id === taskId && String(row.action).toLowerCase() === 'create',
        )
      } catch {
        return false
      }
    },
  })

  const state = ref<PersistedFocusState>(createDefaultFocusState())
  const todayRounds = ref(0)
  const todayFocusSeconds = ref(0)
  const pendingOutboxCount = ref(0)
  const lastCompletedTask = ref<{ id: string; title: string } | null>(null)

  let ticker: ReturnType<typeof setInterval> | null = null
  let flushing = false

  const totalSeconds = computed(() => phaseDurationSeconds(state.value.phase, state.value.focusMinutes))
  const remainingSeconds = computed(() => state.value.remainingSeconds)
  const isRunning = computed(() => state.value.status === 'running')
  const isPaused = computed(() => state.value.status === 'paused')
  const isTaskLocked = computed(() => state.value.status !== 'idle')
  const isBreakPhase = computed(() => state.value.phase !== 'focus')
  const phase = computed(() => state.value.phase)
  const focusMinutes = computed(() => state.value.focusMinutes)
  const cycleCount = computed(() => state.value.cycleCount)
  const selectedTaskId = computed(() => state.value.selectedTaskId)
  const selectedTaskTitle = computed(() => state.value.selectedTaskTitle)
  const selectedTaskSubject = computed(() => state.value.selectedTaskSubject)
  const ringColor = computed(() => isBreakPhase.value ? '#C89B6D' : '#8B9A6E')
  const todayFocusMinutes = computed(() => Math.round(todayFocusSeconds.value / 60))

  function syncDailySummary() {
    const summary = controller.readDaily(toLocalDateKey(new Date()))
    todayRounds.value = summary.completedRounds
    todayFocusSeconds.value = summary.focusSeconds
    pendingOutboxCount.value = controller.readOutbox().length
  }

  function stopTicker() {
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function ensureTicker() {
    if (state.value.status !== 'running') {
      stopTicker()
      return
    }
    if (ticker) return
    ticker = setInterval(() => {
      reconcileNow(true)
    }, 1000)
  }

  async function flushPendingSessions(manual = false) {
    if (flushing || !auth.isAuthenticated) return
    if (!manual && !readAutoSyncPreference({ get: key => getStorageItem(key) ?? '' })) {
      pendingOutboxCount.value = controller.readOutbox().length
      return
    }
    flushing = true
    try {
      await controller.flushOutbox()
      pendingOutboxCount.value = controller.readOutbox().length
    } finally {
      flushing = false
    }
  }

  function reconcileNow(emitFeedback = false) {
    const result = controller.reconcileNow()
    state.value = result.state
    syncDailySummary()

    if (result.completedFocusRound || result.completedBreakRound) {
      stopTicker()
      if (result.completedTaskInfo) {
        lastCompletedTask.value = result.completedTaskInfo
      }
      if (emitFeedback) {
        triggerHapticFeedback()
        showToast(result.completedFocusRound ? '专注完成，休息一下' : '休息结束，准备开始专注')
      }
      if (result.completedFocusRound) {
        void flushPendingSessions()
      }
      return
    }

    if (state.value.status === 'running') {
      ensureTicker()
    } else {
      stopTicker()
    }
  }

  function start() {
    lastCompletedTask.value = null
    state.value = controller.start()
    ensureTicker()
  }

  function pause() {
    state.value = controller.pause()
    stopTicker()
  }

  function toggle() {
    if (state.value.status === 'running') pause()
    else start()
  }

  function reset() {
    lastCompletedTask.value = null
    state.value = controller.reset()
    stopTicker()
  }

  function skip() {
    lastCompletedTask.value = null
    state.value = controller.skip()
    stopTicker()
  }

  function setFocusMinutes(minutes: number) {
    state.value = controller.setFocusMinutes(minutes)
  }

  function selectTask(task: { id?: string; name?: string; subject?: string } | null) {
    state.value = controller.selectTask(task)
  }

  function dismissCompletedTaskPrompt() {
    lastCompletedTask.value = null
  }

  watch(
    () => [auth.isAuthenticated, auth.sessionId, auth.user?.id, auth.serverDeviceId],
    () => {
      stopTicker()
      lastCompletedTask.value = null
      if (!auth.isAuthenticated) {
        state.value = createDefaultFocusState()
        todayRounds.value = 0
        todayFocusSeconds.value = 0
        pendingOutboxCount.value = 0
        return
      }
      reconcileNow(false)
      void flushPendingSessions()
    },
    { immediate: true, flush: 'sync' },
  )

  return {
    state,
    phase,
    focusMinutes,
    totalSeconds,
    remainingSeconds,
    isRunning,
    isPaused,
    isTaskLocked,
    isBreakPhase,
    cycleCount,
    selectedTaskId,
    selectedTaskTitle,
    selectedTaskSubject,
    ringColor,
    todayRounds,
    todayFocusSeconds,
    todayFocusMinutes,
    pendingOutboxCount,
    lastCompletedTask,
    reconcileNow,
    flushPendingSessions,
    start,
    pause,
    toggle,
    reset,
    skip,
    setFocusMinutes,
    selectTask,
    dismissCompletedTaskPrompt,
  }
})
