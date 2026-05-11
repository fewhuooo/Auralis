import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTaskApi } from '@/api/useTaskApi'

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
}

export interface TimeSlot {
  time: string
  task: Task | null
  isCurrent: boolean
}

export const useTaskStore = defineStore('task', () => {
  const pendingTasks = ref<Task[]>([])
  const timeSlots = ref<TimeSlot[]>([
    { time: '08:00', task: null, isCurrent: false },
    { time: '09:00', task: null, isCurrent: false },
    { time: '10:00', task: null, isCurrent: false },
    { time: '11:00', task: null, isCurrent: true },
    { time: '12:00', task: null, isCurrent: false },
    { time: '14:00', task: null, isCurrent: false },
    { time: '15:00', task: null, isCurrent: false },
  ])

  const fetchTasks = async () => {
    try {
      const res: any = await useTaskApi.getTasks()
      const tasks = res.records || []
      
      pendingTasks.value = tasks.filter((t: Task) => t.status === 'pending')
      
      const scheduledTasks = tasks.filter((t: Task) => t.status !== 'pending')
      timeSlots.value.forEach(slot => {
        const t = scheduledTasks.find((st: Task) => st.startTime === slot.time)
        if (t) {
          slot.task = t
        }
      })
      analyzeSchedule()
    } catch (e) {
      console.error('Failed to fetch tasks', e)
    }
  }

  const addTask = async (task: Task) => {
    try {
      const res = await useTaskApi.createTask(task)
      if (res.status === 'pending') {
        pendingTasks.value.push(res)
      } else {
        const slot = timeSlots.value.find(s => s.time === res.startTime)
        if (slot) slot.task = res
      }
    } catch (e) {
      console.error('Failed to create task', e)
      pendingTasks.value.push(task)
    }
  }

  // Getters for Stats
  const completedCount = computed(() => timeSlots.value.filter(s => s.task?.status === 'completed').length)
  const pendingCount = computed(() => pendingTasks.value.length)
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
        if (slot.task.id) await useTaskApi.updateTask(slot.task.id, slot.task)
        pendingTasks.value.push(slot.task)
      }
      task.status = 'scheduled'
      task.startTime = slotTime
      if (task.id) await useTaskApi.updateTask(task.id, task)
      slot.task = task
      pendingTasks.value.splice(taskIndex, 1)
      analyzeSchedule()
    }
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
        toSlot.task.startTime = toSlotTime
        fromSlot.task.startTime = fromSlotTime
        if (toSlot.task.id) await useTaskApi.updateTask(toSlot.task.id, toSlot.task)
        if (fromSlot.task.id) await useTaskApi.updateTask(fromSlot.task.id, fromSlot.task)
      } else {
        toSlot.task = fromSlot.task
        fromSlot.task = null
        toSlot.task.startTime = toSlotTime
        if (toSlot.task.id) await useTaskApi.updateTask(toSlot.task.id, toSlot.task)
      }
      analyzeSchedule()
    }
  }

  // Action to move a task back to pending
  const unscheduleTask = async (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      slot.task.status = 'pending'
      slot.task.startTime = undefined
      if (slot.task.id) await useTaskApi.updateTask(slot.task.id, slot.task)
      pendingTasks.value.push(slot.task)
      slot.task = null
      analyzeSchedule()
    }
  }

  // Auto-delay overload tasks
  const applyAutoDelay = () => {
    const lastScheduled = [...timeSlots.value].reverse().find(s => s.task && s.task.status === 'scheduled')
    if (lastScheduled && lastScheduled.task) {
      unscheduleTask(lastScheduled.time)
    }
  }

  return {
    pendingTasks,
    timeSlots,
    completedCount,
    pendingCount,
    totalFocusHours,
    fetchTasks,
    addTask,
    scheduleTask,
    rescheduleTask,
    unscheduleTask,
    aiSuggestions,
    hasOverload,
    analyzeSchedule,
    applyAutoDelay
  }
}, {
  persist: true
})
