import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { localDb } from '@/services/localDb'
import { uuidv7 } from '@/utils/uuid'
import { Lexorank } from '@/utils/lexorank'

export interface Task {
  id?: string
  name: string
  subject: string
  desc?: string
  color: string
  duration: number
  load: 'low' | 'medium' | 'high'
  loadText: string
  status: 'pending' | 'scheduled' | 'completed'
  startTime?: string
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

export const useTaskStore = defineStore('task', () => {
  const pendingTasks = ref<Task[]>([])
  const isSyncing = ref(false)

  const timeSlots = ref<TimeSlot[]>([
    { time: '09:00', task: null },
    { time: '11:00', task: null },
    { time: '13:00', task: null },
    { time: '15:00', task: null },
    { time: '17:00', task: null },
    { time: '19:00', task: null },
  ])

  const checkOnline = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      uni.getNetworkType({
        success: (res) => {
          resolve(res.networkType !== 'none')
        },
        fail: () => {
          resolve(true)
        }
      })
    })
  }

  const loadLocalTasks = async () => {
    try {
      const tasks = await localDb.getTasks()
      pendingTasks.value = tasks.filter((t: Task) => t.status === 'pending')

      // Clear slots
      timeSlots.value.forEach(slot => { slot.task = null })

      const scheduledTasks = tasks.filter((t: Task) => t.status !== 'pending')
      scheduledTasks.forEach((t: Task) => {
        const slot = timeSlots.value.find(s => s.time === t.startTime)
        if (slot) {
          slot.task = t
        }
      })
    } catch (e) {
      console.error('[Mobile Store] Failed to load local tasks:', e)
    }
  }

  const fetchTasks = async () => {
    // 1. Read from local SQLite
    await loadLocalTasks()

    // 2. Try bidirectional sync
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
      await loadLocalTasks()
    } catch (e) {
      console.warn('[Mobile Store] Server unreachable, using local database cache:', e)
    }
  }

  const recordMutation = async (entityType: 'block' | 'task', entityId: string, action: 'create' | 'update' | 'delete', payload: any) => {
    const { getClientId } = await import('./useSyncStore')
    const clientId = getClientId()
    await localDb.addLocalMutation(clientId, entityType, entityId, action, payload)
  }

  const syncPendingChanges = async () => {
    const online = await checkOnline()
    if (!online || isSyncing.value) return
    isSyncing.value = true
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
    } catch (err) {
      console.error(`[Mobile Store] Background sync failed:`, err)
    } finally {
      isSyncing.value = false
    }
  }

  const addTask = async (task: Task) => {
    const allTasks = [...pendingTasks.value, ...timeSlots.value.map(s => s.task).filter(Boolean) as Task[]]
    allTasks.sort((a, b) => (a.position || '0').localeCompare(b.position || '0'))
    const lastTask = allTasks[allTasks.length - 1]
    const lastPos = lastTask ? (lastTask.position || '0') : ''
    const newPos = Lexorank.getMedian(lastPos, '')

    const newTask: Task = {
      id: task.id || uuidv7(),
      name: task.name,
      subject: task.subject,
      desc: task.desc || '',
      color: task.color,
      duration: task.duration,
      load: task.load,
      loadText: task.loadText,
      status: task.status || 'pending',
      startTime: task.startTime || '',
      sync_status: 'pending_create',
      position: newPos,
      subjectId: task.subjectId
    }

    if (newTask.status === 'pending') {
      pendingTasks.value.push(newTask)
    } else {
      const slot = timeSlots.value.find(s => s.time === newTask.startTime)
      if (slot) slot.task = newTask
    }

    await localDb.saveTask(newTask, 'pending_create')
    await recordMutation('task', newTask.id || '', 'create', newTask)
    syncPendingChanges()
  }

  const removeTask = async (id: string) => {
    pendingTasks.value = pendingTasks.value.filter(t => t.id !== id)
    timeSlots.value.forEach(slot => {
      if (slot.task && slot.task.id === id) {
        slot.task = null
      }
    })
    await localDb.deleteTask(id)
    await recordMutation('task', id, 'delete', { id })
    syncPendingChanges()
  }

  const updateTask = async (task: Task) => {
    if (!task.id) return
    const updatedTask: Task = {
      ...task,
      sync_status: task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
    }

    if (updatedTask.status === 'pending') {
      const idx = pendingTasks.value.findIndex(t => t.id === task.id)
      if (idx !== -1) pendingTasks.value[idx] = updatedTask
    } else {
      const slot = timeSlots.value.find(s => s.time === updatedTask.startTime)
      if (slot) slot.task = updatedTask
    }

    await localDb.saveTask(updatedTask, updatedTask.sync_status)
    await recordMutation('task', task.id, 'update', updatedTask)
    syncPendingChanges()
  }

  // Getters
  const completedCount = computed(() => timeSlots.value.filter(s => s.task?.status === 'completed').length)
  const pendingCount = computed(() => pendingTasks.value.length)
  const totalFocusHours = computed(() => {
    let mins = 0
    timeSlots.value.forEach(s => {
      if (s.task && s.task.status === 'completed') mins += s.task.duration * 60
    })
    return (mins / 60).toFixed(1) + 'h'
  })

  /**
   * 完成任务（移动端手势操作）
   */
  const completeTask = async (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      slot.task.status = 'completed'
      const updated: Task = {
        ...slot.task,
        sync_status: slot.task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
      }
      await localDb.saveTask(updated, updated.sync_status)
      await recordMutation('task', updated.id || '', 'update', updated)
      syncPendingChanges()
    }
  }

  /**
   * 延后任务（移动端手势操作 — 从时间轴退回待办）
   */
  const deferTask = async (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      const allTasks = [...pendingTasks.value, ...timeSlots.value.map(s => s.task).filter(Boolean) as Task[]]
      allTasks.sort((a, b) => (a.position || '0').localeCompare(b.position || '0'))
      const lastTask = allTasks[allTasks.length - 1]
      const lastPos = lastTask ? (lastTask.position || '0') : ''
      const newPos = Lexorank.getMedian(lastPos, '')

      const task = { 
        ...slot.task, 
        status: 'pending' as const, 
        startTime: '',
        position: newPos
      }
      const updated: Task = {
        ...task,
        sync_status: task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
      }
      
      pendingTasks.value.push(updated)
      slot.task = null
      
      await localDb.saveTask(updated, updated.sync_status)
      await recordMutation('task', updated.id || '', 'update', updated)
      syncPendingChanges()
    }
  }

  const syncFromRemote = (data: { pending: Task[], slots: TimeSlot[] }) => {
    const tasksToSave: Task[] = []
    data.pending.forEach(t => tasksToSave.push({ ...t, status: 'pending', startTime: '' }))
    data.slots.forEach(s => {
      if (s.task) {
        tasksToSave.push({ ...s.task, status: s.task.status, startTime: s.time })
      }
    })
    
    localDb.mergeTasksFromServer(tasksToSave).then(() => loadLocalTasks())
  }

  // Set up reactive sync listener on network status change
  uni.onNetworkStatusChange((res) => {
    if (res.isConnected) {
      console.log('[Mobile Store] Network re-established. Auto-syncing tasks...')
      syncPendingChanges()
    }
  })

  return {
    pendingTasks,
    timeSlots,
    completedCount,
    pendingCount,
    totalFocusHours,
    loadLocalTasks,
    fetchTasks,
    addTask,
    removeTask,
    updateTask,
    completeTask,
    deferTask,
    syncFromRemote,
    syncPendingChanges
  }
})
