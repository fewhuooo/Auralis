/**
 * useTaskStore — 移动端任务状态管理
 * 复用 PC 端同名 Store 的数据模型
 * 移动端额外增加了轻量手势操作（完成、延后）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTaskApi } from '@/api/useTaskApi'

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
}

export const useTaskStore = defineStore('task', () => {
  const pendingTasks = ref<Task[]>([])

  const timeSlots = ref<TimeSlot[]>([
    { time: '09:00', task: null },
    { time: '11:00', task: null },
    { time: '13:00', task: null },
    { time: '15:00', task: null },
    { time: '17:00', task: null },
    { time: '19:00', task: null },
  ])

  /**
   * 从后端拉取任务列表，分发到 pending 和 timeSlots
   */
  const fetchTasks = async () => {
    try {
      const res: any = await useTaskApi.getTasks()
      const tasks: Task[] = res.records || []

      pendingTasks.value = tasks.filter((t: Task) => t.status === 'pending')

      // 将已排期的任务放入时间槽
      const scheduledTasks = tasks.filter((t: Task) => t.status !== 'pending')
      // 先清空槽位
      timeSlots.value.forEach(slot => { slot.task = null })
      scheduledTasks.forEach((t: Task) => {
        const slot = timeSlots.value.find(s => s.time === t.startTime)
        if (slot) {
          slot.task = t
        }
      })
    } catch (e) {
      console.error('[Mobile] Failed to fetch tasks:', e)
      // 离线时保留 persist 缓存中的数据，不清空
    }
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
      try {
        if (slot.task.id) await useTaskApi.updateTask(slot.task.id, slot.task as any)
      } catch (e) {
        console.error('[Mobile] Failed to sync task completion:', e)
      }
    }
  }

  /**
   * 延后任务（移动端手势操作 — 从时间轴退回待办）
   */
  const deferTask = async (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      const task = { ...slot.task, status: 'pending' as const, startTime: undefined }
      try {
        if (task.id) await useTaskApi.updateTask(task.id, task as any)
      } catch (e) {
        console.error('[Mobile] Failed to sync task defer:', e)
      }
      pendingTasks.value.push(task)
      slot.task = null
    }
  }

  /**
   * 从远程同步覆盖本地数据（PC端排期 -> 移动端展示）
   */
  const syncFromRemote = (data: { pending: Task[], slots: TimeSlot[] }) => {
    pendingTasks.value = data.pending
    timeSlots.value = data.slots
  }

  return {
    pendingTasks,
    timeSlots,
    completedCount,
    pendingCount,
    totalFocusHours,
    fetchTasks,
    completeTask,
    deferTask,
    syncFromRemote,
  }
}, {
  // @ts-ignore
  persist: true
})
