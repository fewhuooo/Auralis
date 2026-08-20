import request from './request.ts'
import type { components } from './generated/schema.ts'

type GeneratedResponse = components['schemas']['Response']

export type SourceView = Pick<
  GeneratedResponse,
  'id' | 'subjectId' | 'title' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  type?: 'FILE' | 'TEXT' | 'URL'
  assetId?: string
  originUrl?: string
  rawText?: string
  outline?: string
  ingestionStatus?: 'PENDING' | 'PARSING' | 'INDEXING' | 'READY' | 'FAILED'
  safeErrorCode?: string
  safeErrorDetail?: string
}

export interface SourceCreateRequest {
  baseVersion: components['schemas']['VersionRequest']['baseVersion']
  subjectId: string
  type: 'FILE' | 'TEXT' | 'URL'
  title: string
  assetId?: string
  originUrl?: string
  rawText?: string
  outline?: string
}

export type SourceUpdateRequest = SourceCreateRequest
export type SourceVersionRequest = components['schemas']['VersionRequest']

export interface SourceQuery {
  cursor?: string
  limit?: number
}

export interface SourceListResponse {
  items?: SourceView[]
  nextCursor?: string
  hasMore?: boolean
}

export const useSourceApi = {
  list(params?: SourceQuery): Promise<SourceListResponse> {
    return request.get('/api/sources', { params }) as unknown as Promise<SourceListResponse>
  },
  listSources(params?: SourceQuery): Promise<SourceListResponse> {
    return request.get('/api/sources', { params }) as unknown as Promise<SourceListResponse>
  },
  get(id: string): Promise<SourceView> {
    return request.get(`/api/sources/${encodeURIComponent(id)}`) as unknown as Promise<SourceView>
  },
  getSource(id: string): Promise<SourceView> {
    return request.get(`/api/sources/${encodeURIComponent(id)}`) as unknown as Promise<SourceView>
  },
  create(data: SourceCreateRequest): Promise<SourceView> {
    return request.post('/api/sources', data) as unknown as Promise<SourceView>
  },
  createSource(data: SourceCreateRequest): Promise<SourceView> {
    return request.post('/api/sources', data) as unknown as Promise<SourceView>
  },
  update(id: string, data: SourceUpdateRequest): Promise<SourceView> {
    return request.put(`/api/sources/${encodeURIComponent(id)}`, data) as unknown as Promise<SourceView>
  },
  updateSource(id: string, data: SourceUpdateRequest): Promise<SourceView> {
    return request.put(`/api/sources/${encodeURIComponent(id)}`, data) as unknown as Promise<SourceView>
  },
  delete(id: string, data: SourceVersionRequest): Promise<void> {
    return request.delete(`/api/sources/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  deleteSource(id: string, data: SourceVersionRequest): Promise<void> {
    return request.delete(`/api/sources/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  restore(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<SourceView>
  },
  restoreSource(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<SourceView>
  },
  reingest(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/reingest`, data) as unknown as Promise<SourceView>
  },
  reingestSource(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/reingest`, data) as unknown as Promise<SourceView>
  },
}

export const listSources = useSourceApi.listSources
export const getSource = useSourceApi.getSource
export const createSource = useSourceApi.createSource
export const updateSource = useSourceApi.updateSource
export const deleteSource = useSourceApi.deleteSource
export const restoreSource = useSourceApi.restoreSource
export const reingestSource = useSourceApi.reingestSource
