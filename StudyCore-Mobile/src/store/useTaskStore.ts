/**
 * useTaskStore — 移动端任务状态管理
 * 复用 PC 端同名 Store 的数据模型
 * 移动端额外增加了轻量手势操作（完成、延后）
 */
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
}

export const useTaskStore = defineStore('task', () => {
  const pendingTasks = ref<Task[]>([
    { id: 'p1', name: '计算机网络 Ch5 阅读', subject: '计算机网络', duration: 1.5, color: '#f59e0b', load: 'medium', loadText: '中等', status: 'pending' },
    { id: 'p2', name: '线性代数公式汇总', subject: '线性代数', duration: 1, color: '#3b82f6', load: 'low', loadText: '轻松', status: 'pending' },
    { id: 'p3', name: '编译原理 LL(1) 练习', subject: '编译原理', duration: 2, color: '#ef4444', load: 'high', loadText: '高强度', status: 'pending' },
  ])

  const timeSlots = ref<TimeSlot[]>([
    { time: '09:00', task: { id: 's1', name: '操作系统期中复习', subject: '操作系统', duration: 2, color: '#6366f1', load: 'medium', loadText: '中', status: 'scheduled' } },
    { time: '11:00', task: null },
    { time: '13:00', task: { id: 's2', name: '数据结构作业 #5', subject: '数据结构', duration: 1.5, color: '#ec4899', load: 'high', loadText: '高', status: 'scheduled' } },
    { time: '15:00', task: { id: 's3', name: 'Spring Boot 实验报告', subject: 'Spring Boot', duration: 2, color: '#10b981', load: 'medium', loadText: '中', status: 'scheduled' } },
    { time: '17:00', task: null },
    { time: '19:00', task: null },
  ])

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
  const completeTask = (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      slot.task.status = 'completed'
    }
  }

  /**
   * 延后任务（移动端手势操作 — 从时间轴退回待办）
   */
  const deferTask = (slotTime: string) => {
    const slot = timeSlots.value.find(s => s.time === slotTime)
    if (slot && slot.task) {
      const task = { ...slot.task, status: 'pending' as const }
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
    completeTask,
    deferTask,
    syncFromRemote,
  }
}, {
  persist: true
})
