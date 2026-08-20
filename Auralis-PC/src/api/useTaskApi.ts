import request from './request.ts'
import type { components } from './generated/schema.ts'

export type TaskView = components['schemas']['Response']
export type TaskListResponse = components['schemas']['ListResponse']
export type TaskCreateRequest = components['schemas']['CreateRequest']
export type TaskUpdateRequest = components['schemas']['UpdateRequest']
export type TaskVersionRequest = components['schemas']['VersionRequest']

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
