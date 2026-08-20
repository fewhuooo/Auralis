import request from './request.ts'
import type { components } from './generated/schema.ts'

type GeneratedResponse = components['schemas']['Response']

export type RelationView = Pick<
  GeneratedResponse,
  'id' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  sourceType?: 'SUBJECT' | 'SOURCE' | 'KNOWLEDGE_BLOCK' | 'TASK'
  sourceId?: string
  targetType?: 'SUBJECT' | 'SOURCE' | 'KNOWLEDGE_BLOCK' | 'TASK'
  targetId?: string
  type?: 'CONTAINS' | 'REFERENCES' | 'DERIVED_FROM' | 'DEPENDS_ON' | 'RELATED_TO'
  label?: string
}

export interface RelationCreateRequest {
  baseVersion: components['schemas']['VersionRequest']['baseVersion']
  sourceType: NonNullable<RelationView['sourceType']>
  sourceId: string
  targetType: NonNullable<RelationView['targetType']>
  targetId: string
  type: NonNullable<RelationView['type']>
  label?: string
}

export type RelationUpdateRequest = RelationCreateRequest
export type RelationVersionRequest = components['schemas']['VersionRequest']

export interface RelationQuery {
  cursor?: string
  limit?: number
}

export interface RelationListResponse {
  items?: RelationView[]
  nextCursor?: string
  hasMore?: boolean
}

export const useRelationApi = {
  list(params?: RelationQuery): Promise<RelationListResponse> {
    return request.get('/api/relations', { params }) as unknown as Promise<RelationListResponse>
  },
  listRelations(params?: RelationQuery): Promise<RelationListResponse> {
    return request.get('/api/relations', { params }) as unknown as Promise<RelationListResponse>
  },
  get(id: string): Promise<RelationView> {
    return request.get(`/api/relations/${encodeURIComponent(id)}`) as unknown as Promise<RelationView>
  },
  getRelation(id: string): Promise<RelationView> {
    return request.get(`/api/relations/${encodeURIComponent(id)}`) as unknown as Promise<RelationView>
  },
  create(data: RelationCreateRequest): Promise<RelationView> {
    return request.post('/api/relations', data) as unknown as Promise<RelationView>
  },
  createRelation(data: RelationCreateRequest): Promise<RelationView> {
    return request.post('/api/relations', data) as unknown as Promise<RelationView>
  },
  update(id: string, data: RelationUpdateRequest): Promise<RelationView> {
    return request.put(`/api/relations/${encodeURIComponent(id)}`, data) as unknown as Promise<RelationView>
  },
  updateRelation(id: string, data: RelationUpdateRequest): Promise<RelationView> {
    return request.put(`/api/relations/${encodeURIComponent(id)}`, data) as unknown as Promise<RelationView>
  },
  delete(id: string, data: RelationVersionRequest): Promise<void> {
    return request.delete(`/api/relations/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  deleteRelation(id: string, data: RelationVersionRequest): Promise<void> {
    return request.delete(`/api/relations/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  restore(id: string, data: RelationVersionRequest): Promise<RelationView> {
    return request.post(`/api/relations/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<RelationView>
  },
  restoreRelation(id: string, data: RelationVersionRequest): Promise<RelationView> {
    return request.post(`/api/relations/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<RelationView>
  },
}

export const listRelations = useRelationApi.listRelations
export const getRelation = useRelationApi.getRelation
export const createRelation = useRelationApi.createRelation
export const updateRelation = useRelationApi.updateRelation
export const deleteRelation = useRelationApi.deleteRelation
export const restoreRelation = useRelationApi.restoreRelation
