import request from './request.ts'
import type { components } from './generated/schema.ts'

type GeneratedResponse = components['schemas']['Response']

export type SubjectView = Pick<
  GeneratedResponse,
  'id' | 'description' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  name?: string
  iconKey?: string
  color?: string
  sortKey?: string
  defaultSubject?: boolean
}

export interface SubjectCreateRequest {
  baseVersion: components['schemas']['VersionRequest']['baseVersion']
  name: string
  description?: string
  iconKey?: string
  color?: string
  sortKey?: string
}

export type SubjectUpdateRequest = SubjectCreateRequest
export type SubjectVersionRequest = components['schemas']['VersionRequest']

export interface SubjectListParams {
  cursor?: string
  limit?: number
}

export interface SubjectListResponse {
  items?: SubjectView[]
  nextCursor?: string
  hasMore?: boolean
}

export const useSubjectApi = {
  list(params?: SubjectListParams): Promise<SubjectListResponse> {
    return request.get('/api/subjects', { params }) as unknown as Promise<SubjectListResponse>
  },
  listSubjects(params?: SubjectListParams): Promise<SubjectListResponse> {
    return request.get('/api/subjects', { params }) as unknown as Promise<SubjectListResponse>
  },
  get(id: string): Promise<SubjectView> {
    return request.get(`/api/subjects/${encodeURIComponent(id)}`) as unknown as Promise<SubjectView>
  },
  getSubject(id: string): Promise<SubjectView> {
    return request.get(`/api/subjects/${encodeURIComponent(id)}`) as unknown as Promise<SubjectView>
  },
  create(data: SubjectCreateRequest): Promise<SubjectView> {
    return request.post('/api/subjects', data) as unknown as Promise<SubjectView>
  },
  createSubject(data: SubjectCreateRequest): Promise<SubjectView> {
    return request.post('/api/subjects', data) as unknown as Promise<SubjectView>
  },
  update(id: string, data: SubjectUpdateRequest): Promise<SubjectView> {
    return request.put(`/api/subjects/${encodeURIComponent(id)}`, data) as unknown as Promise<SubjectView>
  },
  updateSubject(id: string, data: SubjectUpdateRequest): Promise<SubjectView> {
    return request.put(`/api/subjects/${encodeURIComponent(id)}`, data) as unknown as Promise<SubjectView>
  },
  delete(id: string, data: SubjectVersionRequest): Promise<void> {
    return request.delete(`/api/subjects/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  deleteSubject(id: string, data: SubjectVersionRequest): Promise<void> {
    return request.delete(`/api/subjects/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  restore(id: string, data: SubjectVersionRequest): Promise<SubjectView> {
    return request.post(`/api/subjects/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<SubjectView>
  },
  restoreSubject(id: string, data: SubjectVersionRequest): Promise<SubjectView> {
    return request.post(`/api/subjects/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<SubjectView>
  },
}

export const listSubjects = useSubjectApi.listSubjects
export const getSubject = useSubjectApi.getSubject
export const createSubject = useSubjectApi.createSubject
export const updateSubject = useSubjectApi.updateSubject
export const deleteSubject = useSubjectApi.deleteSubject
export const restoreSubject = useSubjectApi.restoreSubject
