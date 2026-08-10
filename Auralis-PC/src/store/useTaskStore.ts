import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { localDb } from '@/services/localDb'
import { uuidv7 } from '@/utils/uuid'
import { Lexorank } from '@/utils/lexorank'

export const getTodayDayCode = () => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[new Date().getDay()] || 'Mon'
}

export interface Task {
  id?: string
  name: string
  subject: string
  desc?: string
  color: string
  duration: number
  load: 'low' | 'medium' | 'high'
  loadText: string
  status: 'pending' | 'scheduled' | 'completed' | 'learning' | 'to_review'
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
  isCurrent: boolean
}

export const useTaskStore = defineStore('task', () => {
  const pendingTasks = ref<Task[]>([])
  const allTasks = ref<Task[]>([])
  const isSyncing = ref(false)
  const selectedDay = ref(getTodayDayCode())

  const generateTimeSlots = (): TimeSlot[] => {
    const slots: TimeSlot[] = []
    for (let h = 8; h <= 22; h++) {
      slots.push({ time: `${h.toString().padStart(2, '0')}:00`, task: null, isCurrent: false })
    }
    return slots
  }
  const timeSlots = ref<TimeSlot[]>(generateTimeSlots())

  const updateCurrentSlot = () => {
    const currentHour = new Date().getHours()
    const currentHourStr = `${currentHour.toString().padStart(2, '0')}:00`
    timeSlots.value.forEach(slot => {
      slot.isCurrent = slot.time === currentHourStr && selectedDay.value === getTodayDayCode()
    })
  }

  // Initialize and schedule updates
  updateCurrentSlot()
  if (typeof window !== 'undefined') {
    setInterval(updateCurrentSlot, 60000)
  }

  const loadLocalTasks = async () => {
    try {
      updateCurrentSlot()
      const tasks = await localDb.getTasks()
      allTasks.value = tasks

      pendingTasks.value = tasks.filter((t: Task) => t.status === 'pending' || t.status === 'learning' || t.status === 'to_review' || (t.status === 'completed' && (!t.startTime || t.startTime.trim() === '')))

      // Reset time slot tasks
      timeSlots.value.forEach(slot => { slot.task = null })

      const scheduledTasks = tasks.filter((t: Task) => t.startTime && t.startTime.trim() !== '')
      timeSlots.value.forEach(slot => {
        const t = scheduledTasks.find((st: Task) => {
          const isTodayActive = selectedDay.value === getTodayDayCode()
          if (st.startTime === slot.time) {
            return isTodayActive
          }
          return st.startTime === `${selectedDay.value} ${slot.time}`
        })
        if (t) {
          slot.task = t
        }
      })
      analyzeSchedule()
    } catch (e) {
      console.error('Failed to load local tasks:', e)
    }
  }

  const fetchTasks = async () => {
    // 1. Read from local SQLite (instant rendering)
    await loadLocalTasks()

    // 2. Try bidirectional sync
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
      await loadLocalTasks()
    } catch (e) {
      console.warn('[PC Store] Server unreachable, using local database cache:', e)
    }
  }

  const recordMutation = async (entityType: 'block' | 'task', entityId: string, action: 'create' | 'update' | 'delete', payload: any) => {
    const { getClientId } = await import('./useSyncStore')
    const clientId = getClientId()
    await localDb.addLocalMutation(clientId, entityType, entityId, action, payload)
  }

  const syncPendingChanges = async () => {
    if (!navigator.onLine || isSyncing.value) return
    isSyncing.value = true
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
    } catch (err) {
      console.error(`[PC Store] Background sync failed:`, err)
    } finally {
      isSyncing.value = false
    }
  }

  const addTask = async (task: Task) => {
    // Find max position among all tasks to put it at the end of the list
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

  // Getters for Stats
  const completedCount = computed(() => {
    const scheduledCompleted = timeSlots.value.filter(s => s.task?.status === 'completed').length
    const unscheduledCompleted = pendingTasks.value.filter(t => t.status === 'completed').length
    return scheduledCompleted + unscheduledCompleted
  })
  const pendingCount = computed(() => pendingTasks.value.filter(t => t.status !== 'completed').length)
  const totalFocusHours = computed(() => {
    let minutes = 0
    timeSlots.value.forEach(s => {
      if (s.task && s.task.status === 'completed') minutes += s.task.duration
    })
    return (minutes / 60).toFixed(1) + 'h'
  })

  // 13.4 Smart Scheduling Algorithm
  const aiSuggestions = ref<string[]>([])
  const hasOverload = ref(false)

  const analyzeSchedule = () => {
    aiSuggestions.value = []
    hasOverload.value = false

    let continuousHighLoad = 0
    let totalLoadScore = 0
    const MAX_LOAD_SCORE = 12 // Simulated threshold based on historical focus capacity

    timeSlots.value.forEach(slot => {
      if (slot.task) {
        if (slot.task.load === 'high') {
          continuousHighLoad++
          totalLoadScore += 3
        } else if (slot.task.load === 'medium') {
          continuousHighLoad = 0
          totalLoadScore += 2
        } else {
          continuousHighLoad = 0
          totalLoadScore += 1
        }

        if (continuousHighLoad >= 2) {
          aiSuggestions.value.push(`⚠️ 连续的高负荷任务会导致疲劳，建议在【${slot.time}】前后插入休息或低负荷任务。`)
          continuousHighLoad = 0
        }
      } else {
        continuousHighLoad = 0
      }
    })

    if (totalLoadScore > MAX_LOAD_SCORE) {
      hasOverload.value = true
      const lastScheduled = [...timeSlots.value].reverse().find(s => s.task && s.task.status === 'scheduled')
      if (lastScheduled && lastScheduled.task) {
        aiSuggestions.value.push(`🚨 今日认知负荷 (${totalLoadScore}) 已超出您的历史最佳承受力。建议将【${lastScheduled.task.name}】自动延后。`)
      }
    }

    if (aiSuggestions.value.length === 0 && timeSlots.value.some(s => s.task)) {
      aiSuggestions.value.push(`✨ 当前排期科学合理，符合您的心流节奏！`)
    }
  }

  // Action to move a task from pending to a slot (supports swapping existing task back to pending)
  const scheduleTask = async (taskId: string, slotTime: string) => {
    const taskIndex = pendingTasks.value.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return

    const task = pendingTasks.value[taskIndex]
    const slot = timeSlots.value.find(s => s.time === slotTime)

    if (slot) {
      if (slot.task) {
        slot.task.status = 'pending'
        slot.task.startTime = ''

        const lastPos = pendingTasks.value.length > 0 ? (pendingTasks.value[pendingTasks.value.length - 1].position || '0') : ''
        const newSwapPos = Lexorank.getMedian(lastPos, '')

        const updatedSwap: Task = {
          ...slot.task,
          sync_status: slot.task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update',
          position: newSwapPos
        }
        await localDb.saveTask(updatedSwap, updatedSwap.sync_status)
        await recordMutation('task', updatedSwap.id || '', 'update', updatedSwap)
        pendingTasks.value.push(updatedSwap)
      }
      task.status = 'scheduled'
      task.startTime = `${selectedDay.value} ${slotTime}`
      const updatedTask: Task = {
        ...task,
        sync_status: task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
      }
      await localDb.saveTask(updatedTask, updatedTask.sync_status)
      await recordMutation('task', updatedTask.id || '', 'update', updatedTask)
      slot.task = updatedTask
      pendingTasks.value.splice(taskIndex, 1)
      analyzeSchedule()

      syncPendingChanges()
    }
  }

  // Action to move a task to a specific day (used in Week view)
  const scheduleTaskToDay = async (taskId: string, day: string) => {
    const taskIndex = pendingTasks.value.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return
    const task = pendingTasks.value[taskIndex]
    
    // Find next available hour for that day
    const dayTasks = allTasks.value.filter(t => t.startTime && t.startTime.startsWith(day))
    let nextHour = 8
    while (dayTasks.some(t => t.startTime === `${day} ${nextHour.toString().padStart(2, '0')}:00`) && nextHour <= 22) {
      nextHour++
    }
    const slotTime = `${nextHour.toString().padStart(2, '0')}:00`
    
    task.status = 'scheduled'
    task.startTime = `${day} ${slotTime}`
    const updatedTask: Task = {
      ...task,
      sync_status: task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
    }
    await localDb.saveTask(updatedTask, updatedTask.sync_status)
    await recordMutation('task', updatedTask.id || '', 'update', updatedTask)
    
    pendingTasks.value.splice(taskIndex, 1)
    await loadLocalTasks()
    syncPendingChanges()
  }

  // Action to move a task from one slot to another (supports swapping between slots)
  const rescheduleTask = async (fromSlotTime: string, toSlotTime: string) => {
    const fromSlot = timeSlots.value.find(s => s.time === fromSlotTime)
    const toSlot = timeSlots.value.find(s => s.time === toSlotTime)

    if (fromSlot && toSlot && fromSlot.task) {
      if (toSlot.task) {
        const temp = toSlot.task
        toSlot.task = fromSlot.task
        fromSlot.task = temp

        toSlot.task.startTime = `${selectedDay.value} ${toSlotTime}`
        fromSlot.task.startTime = `${selectedDay.value} ${fromSlotTime}`

        const u1: Task = {
          ...toSlot.task,
          sync_status: toSlot.task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
        }
        const u2: Task = {
          ...fromSlot.task,
          sync_status: fromSlot.task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
        }

        await localDb.saveTask(u1, u1.sync_status)
        await recordMutation('task', u1.id || '', 'update', u1)
        await localDb.saveTask(u2, u2.sync_status)
        await recordMutation('task', u2.id || '', 'update', u2)
      } else {
        toSlot.task = fromSlot.task
        fromSlot.task = null
        toSlot.task.startTime = `${selectedDay.value} ${toSlotTime}`

        const u: Task = {
          ...toSlot.task,
          sync_status: toSlot.task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
        }
        await localDb.saveTask(u, u.sync_status)
        await recordMutation('task', u.id || '', 'update', u)
      }
      analyzeSchedule()

      syncPendingChanges()
    }
  }

  // Action to move a task back to pending
  const unscheduleTask = async (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      slot.task.status = 'pending'
      slot.task.startTime = ''

      const lastPos = pendingTasks.value.length > 0 ? (pendingTasks.value[pendingTasks.value.length - 1].position || '0') : ''
      const newPos = Lexorank.getMedian(lastPos, '')

      const u: Task = {
        ...slot.task,
        sync_status: slot.task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update',
        position: newPos
      }
      await localDb.saveTask(u, u.sync_status)
      await recordMutation('task', u.id || '', 'update', u)
      pendingTasks.value.push(u)
      slot.task = null
      analyzeSchedule()

      syncPendingChanges()
    }
  }

  // Auto-delay overload tasks
  const applyAutoDelay = () => {
    const lastScheduled = [...timeSlots.value].reverse().find(s => s.task && s.task.status === 'scheduled')
    if (lastScheduled && lastScheduled.task) {
      unscheduleTask(lastScheduled.time)
    }
  }

  // Delete a task completely from DB
  const deleteTask = async (id: string) => {
    await localDb.deleteTask(id)
    await recordMutation('task', id, 'delete', { id })
    await loadLocalTasks()
    syncPendingChanges()
  }

  // Update task status (for Kanban Board drag-and-drop)
  const updateTaskStatus = async (taskId: string, newStatus: 'pending' | 'learning' | 'to_review' | 'completed') => {
    let task = pendingTasks.value.find(t => t.id === taskId)
    let isScheduled = false
    let slotTime = ''

    if (!task) {
      const slot = timeSlots.value.find(s => s.task?.id === taskId)
      if (slot && slot.task) {
        task = slot.task
        isScheduled = true
        slotTime = slot.time
      }
    }

    if (task) {
      task.status = newStatus
      if (isScheduled) {
        task.startTime = ''
        const slot = timeSlots.value.find(s => s.time === slotTime)
        if (slot) slot.task = null
      }

      const updated: Task = {
        ...task,
        sync_status: task.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
      }

      await localDb.saveTask(updated, updated.sync_status)
      await recordMutation('task', task.id || '', 'update', updated)
      await loadLocalTasks()
      syncPendingChanges()
    }
  }

  // Setup online network status listener for reactive synchronizations
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('[PC Store] Online detected. Auto-syncing tasks...')
      syncPendingChanges()
    })
  }

  return {
    pendingTasks,
    allTasks,
    timeSlots,
    selectedDay,
    completedCount,
    pendingCount,
    totalFocusHours,
    loadLocalTasks,
    fetchTasks,
    addTask,
    scheduleTask,
    scheduleTaskToDay,
    rescheduleTask,
    unscheduleTask,
    deleteTask,
    updateTaskStatus,
    aiSuggestions,
    hasOverload,
    analyzeSchedule,
    applyAutoDelay,
    syncPendingChanges
  }
})
