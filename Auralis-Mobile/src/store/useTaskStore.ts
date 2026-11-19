import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { localDb } from '@/services/localDb'
import { formatLocalTimeHHmm } from '@/utils/dateKey'
import { Lexorank } from '@/utils/lexorank'
import {
  compareTaskPosition,
  getPendingTodos,
  getScheduledTasksForLocalDate,
  getVisiblePendingTodos,
  isOverdueTask,
  isScheduledCompletionLocked,
  normalizeTaskPosition,
} from '@/utils/taskSyncMapper'
import { uuidv7 } from '@/utils/uuid'
import { useAuthStore } from './useAuthStore'

export interface Task {
  id?: string
  name: string
  subject: string
  desc?: string
  duration: number
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled'
  startTime?: string
  scheduledAt?: string
  dueAt?: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
  position?: string
  sync_version?: number
  is_deleted?: boolean
  subjectId?: string
}

export const useTaskStore = defineStore('task', () => {
  const authStore = useAuthStore()
  const allTasks = ref<Task[]>([])
  const isSyncing = ref(false)
  const updatingTaskIds = ref<string[]>([])
  const retainedCompletedTodoIds = ref<Set<string>>(new Set())
  let retainedScope: { generation: symbol; userId?: string; serverDeviceId?: string } | null = null

  function currentRetentionScope() {
    return {
      generation: authStore.getLoginGeneration(),
      userId: authStore.user?.id,
      serverDeviceId: authStore.serverDeviceId,
    }
  }

  function isSameScope(
    left: { generation: symbol; userId?: string; serverDeviceId?: string } | null,
    right: { generation: symbol; userId?: string; serverDeviceId?: string },
  ) {
    return Boolean(left && left.generation === right.generation && left.userId === right.userId && left.serverDeviceId === right.serverDeviceId)
  }

  function syncRetentionScope() {
    const current = currentRetentionScope()
    if (!isSameScope(retainedScope, current)) {
      retainedCompletedTodoIds.value = new Set()
      retainedScope = current
    }
  }

  function setTodoRetained(id: string, retain: boolean) {
    syncRetentionScope()
    const next = new Set(retainedCompletedTodoIds.value)
    if (retain) next.add(id)
    else next.delete(id)
    retainedCompletedTodoIds.value = next
  }

  const pendingTasks = computed(() => getPendingTodos(allTasks.value))
  const homePendingTasks = computed(() => {
    const activeRetained = isSameScope(retainedScope, currentRetentionScope())
      ? retainedCompletedTodoIds.value
      : new Set<string>()
    return getVisiblePendingTodos(allTasks.value, activeRetained)
  })
  const completedCount = computed(() => allTasks.value.filter(t => !t.is_deleted && t.status === 'completed').length)
  const pendingCount = computed(() => pendingTasks.value.length)

  function getScheduledTasksForDate(dateKey: string): Task[] {
    return getScheduledTasksForLocalDate(allTasks.value, dateKey)
  }

  const checkOnline = async (): Promise<boolean> => new Promise((resolve) => {
    uni.getNetworkType({
      success: res => resolve(res.networkType !== 'none'),
      fail: () => resolve(true),
    })
  })

  async function loadLocalTasks() {
    const scope = currentRetentionScope()
    syncRetentionScope()
    try {
      const tasks = await localDb.getTasks()
      if (!isSameScope(scope, currentRetentionScope())) return
      allTasks.value = tasks
    } catch (e) {
      console.error('[Mobile Store] Failed to load local tasks:', e)
    }
  }

  const suppressedOverdueFingerprints = new Map<string, string>()

  function overdueFingerprint(task: Pick<Task, 'sync_version' | 'scheduledAt' | 'dueAt' | 'duration' | 'name'>): string {
    return JSON.stringify([task.sync_version ?? 0, task.scheduledAt ?? null, task.dueAt ?? null, task.duration ?? 30, task.name])
  }

  function isOverdueSuppressed(task: Task): boolean {
    if (!task.id) return false
    const expected = suppressedOverdueFingerprints.get(task.id)
    if (!expected) return false
    if (expected === overdueFingerprint(task)) return true
    suppressedOverdueFingerprints.delete(task.id)
    return false
  }

  function suppressOverdueRecovery(taskIds: string[]) {
    for (const id of taskIds) {
      const task = allTasks.value.find(item => item.id === id)
      if (task) suppressedOverdueFingerprints.set(id, overdueFingerprint(task))
    }
  }

  watch(
    () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId],
    () => {
      allTasks.value = []
      retainedCompletedTodoIds.value = new Set()
      retainedScope = null
      suppressedOverdueFingerprints.clear()
    },
    { flush: 'sync' },
  )

  let recoveringOverdue = false

  async function resolveClientId(): Promise<string> {
    const { getClientId } = await import('./useSyncStore')
    return getClientId()
  }

  async function recoverOverdueTasks(): Promise<number> {
    if (recoveringOverdue) return 0
    const scope = currentRetentionScope()
    const auth = useAuthStore()
    if (auth.isAuthenticated === false || !scope.userId || !scope.serverDeviceId) return 0

    recoveringOverdue = true
    let recoveredCount = 0
    try {
      const { useSyncStore } = await import('./useSyncStore')
      const syncStore = useSyncStore()
      if (!isSameScope(scope, currentRetentionScope()) || syncStore.isSyncing || syncStore.isResettingOffline) {
        return 0
      }

      const localTasks = await localDb.getTasks()
      if (!isSameScope(scope, currentRetentionScope()) || syncStore.isSyncing || syncStore.isResettingOffline) {
        return 0
      }

      const localById = new Map(localTasks.filter(item => Boolean(item.id)).map(item => [item.id as string, item]))
      const candidateIds = localTasks
        .filter(item => Boolean(item.id) && isOverdueTask(item) && !isOverdueSuppressed(item))
        .map(item => item.id as string)

      for (const id of candidateIds) {
        if (!isSameScope(scope, currentRetentionScope()) || syncStore.isSyncing || syncStore.isResettingOffline) {
          break
        }
        if (updatingTaskIds.value.includes(id)) continue
        const localTask = localById.get(id)
        if (!localTask || !isOverdueTask(localTask) || isOverdueSuppressed(localTask)) continue
        const currentInMemory = allTasks.value.find(item => item.id === id)
        if (
          currentInMemory
          && ((currentInMemory.sync_version ?? 0) !== (localTask.sync_version ?? 0) || !isOverdueTask(currentInMemory))
        ) {
          continue
        }
        try {
          const updated = await persistTaskUpdate({ ...localTask, status: 'completed' }, false)
          if (updated && isSameScope(scope, currentRetentionScope())) {
            recoveredCount += 1
          }
        } catch {
          // Keep recovering remaining overdue tasks if one local write fails
        }
      }

      if (recoveredCount > 0 && isSameScope(scope, currentRetentionScope()) && !syncStore.isSyncing && !syncStore.isResettingOffline) {
        void syncPendingChanges()
      }
    } finally {
      recoveringOverdue = false
    }
    return recoveredCount
  }

  async function fetchTasks() {
    await loadLocalTasks()
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
    } catch (e) {
      console.warn('[Mobile Store] Server unreachable, using local database cache:', e)
    }
    await recoverOverdueTasks()
  }

  async function syncPendingChanges() {
    const online = await checkOnline()
    if (!online || isSyncing.value) return
    isSyncing.value = true
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
    } catch (err) {
      console.error('[Mobile Store] Background sync failed:', err)
    } finally {
      isSyncing.value = false
    }
  }

  function nextPosition(): string {
    const sorted = [...allTasks.value].sort((a, b) => compareTaskPosition(a.position, b.position))
    const lastPos = sorted.length > 0 ? normalizeTaskPosition(sorted[sorted.length - 1].position) : ''
    return Lexorank.getMedian(lastPos, '')
  }

  async function addTask(task: Task) {
    const id = task.id || uuidv7()
    if (updatingTaskIds.value.includes(id)) return
    const scope = currentRetentionScope()
    const scheduledAt = task.scheduledAt || undefined
    const status: Task['status'] = task.status === 'completed'
      ? 'completed'
      : task.status === 'cancelled'
        ? 'cancelled'
        : scheduledAt
          ? 'scheduled'
          : 'pending'
    const newTask: Task = {
      id,
      name: task.name,
      subject: task.subject,
      desc: task.desc || '',
      duration: task.duration,
      status,
      scheduledAt,
      dueAt: task.dueAt || undefined,
      startTime: scheduledAt ? formatLocalTimeHHmm(scheduledAt) : (task.startTime || undefined),
      sync_status: 'pending_create',
      position: task.position || nextPosition(),
      subjectId: task.subjectId,
    }

    updatingTaskIds.value = [...updatingTaskIds.value, id]
    try {
      const clientId = await resolveClientId()
      if (!isSameScope(scope, currentRetentionScope())) return
      await localDb.saveTask(newTask, 'pending_create')
      if (!isSameScope(scope, currentRetentionScope())) return
      await localDb.addLocalMutation(clientId, 'task', id, 'create', newTask)
      if (!isSameScope(scope, currentRetentionScope())) return
      allTasks.value = [...allTasks.value.filter(item => item.id !== id), newTask]
      void syncPendingChanges()
    } finally {
      updatingTaskIds.value = updatingTaskIds.value.filter(item => item !== id)
    }
  }

  async function persistTaskUpdate(task: Task, shouldSync = true): Promise<boolean> {
    if (!task.id || updatingTaskIds.value.includes(task.id)) return false
    const scope = currentRetentionScope()
    const id = task.id
    updatingTaskIds.value = [...updatingTaskIds.value, id]
    try {
      const existing = allTasks.value.find(item => item.id === id)
      const scheduledAt = task.scheduledAt || undefined
      const updatedTask: Task = {
        ...existing,
        ...task,
        scheduledAt,
        dueAt: task.dueAt || undefined,
        startTime: scheduledAt ? formatLocalTimeHHmm(scheduledAt) : undefined,
        sync_status: existing?.sync_status === 'pending_create' ? 'pending_create' : 'pending_update',
      }
      const clientId = await resolveClientId()
      if (!isSameScope(scope, currentRetentionScope())) return false
      await localDb.saveTask(updatedTask, updatedTask.sync_status)
      if (!isSameScope(scope, currentRetentionScope())) return false
      await localDb.addLocalMutation(clientId, 'task', id, 'update', updatedTask)
      if (!isSameScope(scope, currentRetentionScope())) return false
      allTasks.value = allTasks.value.some(item => item.id === id)
        ? allTasks.value.map(item => item.id === id ? updatedTask : item)
        : [...allTasks.value, updatedTask]
      if (shouldSync) void syncPendingChanges()
      return true
    } finally {
      updatingTaskIds.value = updatingTaskIds.value.filter(item => item !== id)
    }
  }

  async function updateTask(task: Task) {
    await persistTaskUpdate(task, true)
  }

  async function removeTask(id: string) {
    if (!id || updatingTaskIds.value.includes(id)) return
    const scope = currentRetentionScope()
    updatingTaskIds.value = [...updatingTaskIds.value, id]
    try {
      const existing = allTasks.value.find(item => item.id === id)
      const clientId = await resolveClientId()
      if (!isSameScope(scope, currentRetentionScope())) return
      await localDb.deleteTask(id)
      if (!isSameScope(scope, currentRetentionScope())) return
      await localDb.addLocalMutation(clientId, 'task', id, 'delete', {
        id,
        sync_version: existing?.sync_version ?? 0,
      })
      if (!isSameScope(scope, currentRetentionScope())) return
      allTasks.value = allTasks.value.filter(item => item.id !== id)
      if (retainedCompletedTodoIds.value.has(id)) setTodoRetained(id, false)
      void syncPendingChanges()
    } finally {
      updatingTaskIds.value = updatingTaskIds.value.filter(item => item !== id)
    }
  }

  async function scheduleTask(id: string, scheduledAtIso: string) {
    const task = allTasks.value.find(item => item.id === id)
    if (!task) return
    await updateTask({
      ...task,
      scheduledAt: scheduledAtIso,
      startTime: formatLocalTimeHHmm(scheduledAtIso),
      status: task.status === 'completed' ? 'completed' : 'scheduled',
    })
    if (retainedCompletedTodoIds.value.has(id)) setTodoRetained(id, false)
  }

  async function unscheduleTask(id: string) {
    const task = allTasks.value.find(item => item.id === id)
    if (!task) return
    await updateTask({
      ...task,
      scheduledAt: undefined,
      startTime: undefined,
      status: task.status === 'completed' ? 'completed' : 'pending',
    })
  }

  async function toggleTaskComplete(id: string): Promise<boolean> {
    if (updatingTaskIds.value.includes(id)) return false
    const scope = currentRetentionScope()
    const task = allTasks.value.find(item => item.id === id)
    if (!task) return false
    if (isScheduledCompletionLocked(task)) return false
    const nextStatus: Task['status'] = task.status === 'completed'
      ? (task.scheduledAt ? 'scheduled' : 'pending')
      : 'completed'
    await updateTask({
      ...task,
      status: nextStatus,
    })
    if (!task.scheduledAt && isSameScope(scope, currentRetentionScope())) {
      setTodoRetained(id, nextStatus === 'completed')
    }
    return true
  }

  uni.onNetworkStatusChange((res) => {
    if (res.isConnected) {
      console.log('[Mobile Store] Network re-established. Auto-syncing tasks...')
      void syncPendingChanges()
    }
  })

  return {
    allTasks,
    pendingTasks,
    homePendingTasks,
    updatingTaskIds,
    completedCount,
    pendingCount,
    getScheduledTasksForDate,
    loadLocalTasks,
    fetchTasks,
    addTask,
    removeTask,
    updateTask,
    scheduleTask,
    unscheduleTask,
    toggleTaskComplete,
    recoverOverdueTasks,
    suppressOverdueRecovery,
    syncPendingChanges,
  }
})
