import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { localDb } from '@/services/localDb'
import { formatLocalTimeHHmm, toLocalDateKey } from '@/utils/dateKey'
import { Lexorank } from '@/utils/lexorank'
import { getPendingTodos, getScheduledTasksForLocalDate } from '@/utils/taskSyncMapper'
import { uuidv7 } from '@/utils/uuid'
import { useAuthStore } from './useAuthStore'

export interface Task {
  id?: string
  name: string
  subject: string
  desc?: string
  duration: number
  status: 'pending' | 'scheduled' | 'completed'
  startTime?: string
  scheduledAt?: string
  dueAt?: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
  position?: string
  sync_version?: number
  is_deleted?: boolean
  subjectId?: string
}

export interface TimeSlot {
  time: string
  task: Task | null
}

const DEFAULT_SLOT_HOURS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
]

export const useTaskStore = defineStore('task', () => {
  const allTasks = ref<Task[]>([])
  const isSyncing = ref(false)
  const updatingTaskIds = ref<string[]>([])

  const pendingTasks = computed(() => getPendingTodos(allTasks.value))

  function getScheduledTasksForDate(dateKey: string): Task[] {
    return getScheduledTasksForLocalDate(allTasks.value, dateKey)
  }

  // Compatibility derived getter for today's hourly grid until Home & Dashboard pages are migrated in Commits 3 & 4
  const timeSlots = computed<TimeSlot[]>(() => {
    const todayTasks = getScheduledTasksForDate(toLocalDateKey(new Date()))
    return DEFAULT_SLOT_HOURS.map(hour => ({
      time: hour,
      task: todayTasks.find(t => (t.startTime || formatLocalTimeHHmm(t.scheduledAt))?.startsWith(hour.slice(0, 2))) || null,
    }))
  })

  const completedCount = computed(() => allTasks.value.filter(t => !t.is_deleted && t.status === 'completed').length)
  const pendingCount = computed(() => pendingTasks.value.length)
  const totalFocusHours = computed(() => {
    const mins = allTasks.value
      .filter(t => !t.is_deleted && t.status === 'completed')
      .reduce((sum, t) => sum + (t.duration || 0), 0)
    return `${(mins / 60).toFixed(1)}h`
  })

  const checkOnline = async (): Promise<boolean> => new Promise((resolve) => {
    uni.getNetworkType({
      success: res => resolve(res.networkType !== 'none'),
      fail: () => resolve(true),
    })
  })

  async function loadLocalTasks() {
    const auth = useAuthStore()
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
    try {
      const tasks = await localDb.getTasks()
      if (generation !== auth.getLoginGeneration() || userId !== auth.user?.id) return
      allTasks.value = tasks
    } catch (e) {
      console.error('[Mobile Store] Failed to load local tasks:', e)
    }
  }

  async function fetchTasks() {
    await loadLocalTasks()
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
      await loadLocalTasks()
    } catch (e) {
      console.warn('[Mobile Store] Server unreachable, using local database cache:', e)
    }
  }

  async function recordMutation(
    entityType: 'block' | 'task',
    entityId: string,
    action: 'create' | 'update' | 'delete',
    payload: any,
  ) {
    const { getClientId } = await import('./useSyncStore')
    const clientId = getClientId()
    await localDb.addLocalMutation(clientId, entityType, entityId, action, payload)
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
    const sorted = [...allTasks.value].sort((a, b) => (a.position || '0').localeCompare(b.position || '0'))
    const lastPos = sorted.length > 0 ? (sorted[sorted.length - 1].position || '0') : ''
    return Lexorank.getMedian(lastPos, '')
  }

  async function addTask(task: Task) {
    const scheduledAt = task.scheduledAt || undefined
    const status: Task['status'] = task.status === 'completed'
      ? 'completed'
      : scheduledAt
        ? 'scheduled'
        : 'pending'
    const newTask: Task = {
      id: task.id || uuidv7(),
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

    allTasks.value = [...allTasks.value, newTask]
    await localDb.saveTask(newTask, 'pending_create')
    await recordMutation('task', newTask.id || '', 'create', newTask)
    void syncPendingChanges()
  }

  async function updateTask(task: Task) {
    if (!task.id || updatingTaskIds.value.includes(task.id)) return
    const auth = useAuthStore()
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
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
      await localDb.saveTask(updatedTask, updatedTask.sync_status)
      await recordMutation('task', id, 'update', updatedTask)
      if (generation === auth.getLoginGeneration() && userId === auth.user?.id) {
        allTasks.value = allTasks.value.map(item => item.id === id ? updatedTask : item)
      }
      void syncPendingChanges()
    } finally {
      updatingTaskIds.value = updatingTaskIds.value.filter(item => item !== id)
    }
  }

  async function removeTask(id: string) {
    if (!id || updatingTaskIds.value.includes(id)) return
    const existing = allTasks.value.find(item => item.id === id)
    allTasks.value = allTasks.value.filter(item => item.id !== id)
    await localDb.deleteTask(id)
    await recordMutation('task', id, 'delete', {
      id,
      sync_version: existing?.sync_version ?? 0,
    })
    void syncPendingChanges()
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

  async function toggleTaskComplete(id: string) {
    const task = allTasks.value.find(item => item.id === id)
    if (!task) return
    const nextStatus: Task['status'] = task.status === 'completed'
      ? (task.scheduledAt ? 'scheduled' : 'pending')
      : 'completed'
    await updateTask({
      ...task,
      status: nextStatus,
    })
  }

  async function completeTask(slotTime: string) {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot?.task?.id) {
      await updateTask({ ...slot.task, status: 'completed' })
    }
  }

  async function deferTask(slotTime: string) {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot?.task?.id) {
      await unscheduleTask(slot.task.id)
    }
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
    timeSlots,
    updatingTaskIds,
    completedCount,
    pendingCount,
    totalFocusHours,
    getScheduledTasksForDate,
    loadLocalTasks,
    fetchTasks,
    addTask,
    removeTask,
    updateTask,
    scheduleTask,
    unscheduleTask,
    toggleTaskComplete,
    completeTask,
    deferTask,
    syncPendingChanges,
  }
})
