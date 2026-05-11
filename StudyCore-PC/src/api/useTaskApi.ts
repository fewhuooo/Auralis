import request from './request'
import type { Task } from '@/store/useTaskStore'

export const useTaskApi = {
  createTask(task: Partial<Task>) {
    return request.post('/api/tasks', task)
  },
  getTasks(subject?: string, status?: string, page = 1, size = 10) {
    return request.get('/api/tasks', { params: { subject, status, page, size } })
  },
  updateTask(id: string, task: Partial<Task>) {
    return request.put(`/api/tasks/${id}`, task)
  },
  deleteTask(id: string) {
    return request.delete(`/api/tasks/${id}`)
  }
}
