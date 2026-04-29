import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Task {
  id: string
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
  const pendingTasks = ref<Task[]>([
    { id: 't1', name: '计算机网络 - TCP三次握手', subject: '计网', duration: 45, color: '#8b5cf6', load: 'medium', loadText: '中', status: 'pending' },
    { id: 't2', name: '编译原理 - 词法分析', subject: '编译', duration: 60, color: '#ef4444', load: 'high', loadText: '高', status: 'pending' },
    { id: 't3', name: '英语阅读 - Unit 5', subject: '英语', duration: 30, color: '#06b6d4', load: 'low', loadText: '低', status: 'pending' },
  ])

  const timeSlots = ref<TimeSlot[]>([
    { time: '08:00', task: { id: 's1', name: '操作系统复习', subject: 'OS', desc: '进程调度算法', color: '#6366f1', duration: 60, load: 'medium', loadText: '中', status: 'completed' }, isCurrent: false },
    { time: '09:00', task: { id: 's2', name: '数据结构刷题', subject: 'DS', desc: 'LeetCode 树专题', color: '#22c55e', duration: 60, load: 'high', loadText: '高', status: 'completed' }, isCurrent: false },
    { time: '10:00', task: null, isCurrent: false },
    { time: '11:00', task: { id: 's3', name: 'Spring Boot 实验', subject: 'Java', desc: 'AOP 切面编程', color: '#f59e0b', duration: 60, load: 'medium', loadText: '中', status: 'scheduled' }, isCurrent: true },
    { time: '12:00', task: null, isCurrent: false },
    { time: '14:00', task: { id: 's4', name: '蓝桥杯集训', subject: '算法', desc: '动态规划专题', color: '#ec4899', duration: 60, load: 'high', loadText: '高', status: 'scheduled' }, isCurrent: false },
    { time: '15:00', task: null, isCurrent: false },
  ])

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

  // Action to move a task from pending to a slot (supports swapping existing task back to pending)
  const scheduleTask = (taskId: string, slotTime: string) => {
    const taskIndex = pendingTasks.value.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return

    const task = pendingTasks.value[taskIndex]
    const slot = timeSlots.value.find(s => s.time === slotTime)

    if (slot) {
      if (slot.task) {
        // Swap existing task back to pending
        slot.task.status = 'pending'
        pendingTasks.value.push(slot.task)
      }
      task.status = 'scheduled'
      slot.task = task
      pendingTasks.value.splice(taskIndex, 1)
    }
  }

  // Action to move a task from one slot to another (supports swapping between slots)
  const rescheduleTask = (fromSlotTime: string, toSlotTime: string) => {
    const fromSlot = timeSlots.value.find(s => s.time === fromSlotTime)
    const toSlot = timeSlots.value.find(s => s.time === toSlotTime)

    if (fromSlot && toSlot && fromSlot.task) {
      if (toSlot.task) {
        // Swap tasks
        const temp = toSlot.task
        toSlot.task = fromSlot.task
        fromSlot.task = temp
      } else {
        // Move task
        toSlot.task = fromSlot.task
        fromSlot.task = null
      }
    }
  }

  // Action to move a task back to pending
  const unscheduleTask = (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      slot.task.status = 'pending'
      pendingTasks.value.push(slot.task)
      slot.task = null
    }
  }

  return {
    pendingTasks,
    timeSlots,
    completedCount,
    pendingCount,
    totalFocusHours,
    scheduleTask,
    rescheduleTask,
    unscheduleTask
  }
}, {
  persist: true
})
