/**
 * 移动端任务块 API — 与 PC 端 useTaskApi.ts 保持相同的接口契约
 */
import mobileRequest from './request'

export interface TaskBlock {
  id?: string
  name: string
  subject: string
  desc?: string
  color: string
  duration: number
  load: string
  loadText: string
  status: string
  startTime?: string
}

export const useTaskApi = {
  createTask(task: Partial<TaskBlock>) {
    return mobileRequest.post('/api/tasks', task)
  },
  getTasks(subject?: string, status?: string, page = 1, size = 50) {
    return mobileRequest.get('/api/tasks', { subject, status, page, size })
  },
  updateTask(id: string, task: Partial<TaskBlock>) {
    return mobileRequest.put(`/api/tasks/${id}`, task)
  },
  deleteTask(id: string) {
    return mobileRequest.delete(`/api/tasks/${id}`)
  },
}
