import request from './request.ts'
import type { components } from './generated/schema.ts'

export type TaskView = components['schemas']['Response']
export type TaskListResponse = components['schemas']['ListResponse']
export type TaskCreateRequest = components['schemas']['CreateRequest']
// The server accepts explicit null values to clear an existing schedule or
// deadline. Keep the generated schema untouched and widen only this write-side
// client alias so recovery and offline replay can express those operations.
export type TaskUpdateRequest = Omit<components['schemas']['UpdateRequest'], 'scheduledAt' | 'dueAt'> & {
  scheduledAt?: string | null
  dueAt?: string | null
}
export type TaskVersionRequest = components['schemas']['VersionRequest']
export type TaskScheduleSwapRequest = components['schemas']['ScheduleSwapRequest']
export type TaskScheduleSwapResponse = components['schemas']['ScheduleSwapResponse']

export interface TaskQuery {
  cursor?: string
  limit?: number
}

export const useTaskApi = {
  list(params?: TaskQuery): Promise<TaskListResponse> {
    return request.get('/api/tasks', { params }) as unknown as Promise<TaskListResponse>
  },
  listTasks(params?: TaskQuery): Promise<TaskListResponse> {
    return request.get('/api/tasks', { params }) as unknown as Promise<TaskListResponse>
  },
  get(id: string): Promise<TaskView> {
    return request.get(`/api/tasks/${encodeURIComponent(id)}`) as unknown as Promise<TaskView>
  },
  getTask(id: string): Promise<TaskView> {
    return request.get(`/api/tasks/${encodeURIComponent(id)}`) as unknown as Promise<TaskView>
  },
  create(data: TaskCreateRequest): Promise<TaskView> {
    return request.post('/api/tasks', data) as unknown as Promise<TaskView>
  },
  createTask(data: TaskCreateRequest): Promise<TaskView> {
    return request.post('/api/tasks', data) as unknown as Promise<TaskView>
  },
  update(id: string, data: TaskUpdateRequest): Promise<TaskView> {
    return request.put(`/api/tasks/${encodeURIComponent(id)}`, data) as unknown as Promise<TaskView>
  },
  updateTask(id: string, data: TaskUpdateRequest): Promise<TaskView> {
    return request.put(`/api/tasks/${encodeURIComponent(id)}`, data) as unknown as Promise<TaskView>
  },
  swapSchedules(data: TaskScheduleSwapRequest): Promise<TaskScheduleSwapResponse> {
    return request.post('/api/tasks/schedule-swaps', data) as unknown as Promise<TaskScheduleSwapResponse>
  },
  delete(id: string, data: TaskVersionRequest): Promise<void> {
    return request.delete(`/api/tasks/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  deleteTask(id: string, data: TaskVersionRequest): Promise<void> {
    return request.delete(`/api/tasks/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  restore(id: string, data: TaskVersionRequest): Promise<TaskView> {
    return request.post(`/api/tasks/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<TaskView>
  },
  restoreTask(id: string, data: TaskVersionRequest): Promise<TaskView> {
    return request.post(`/api/tasks/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<TaskView>
  },
}

export const listTasks = useTaskApi.listTasks
export const getTask = useTaskApi.getTask
export const createTask = useTaskApi.createTask
export const updateTask = useTaskApi.updateTask
export const deleteTask = useTaskApi.deleteTask
export const restoreTask = useTaskApi.restoreTask
