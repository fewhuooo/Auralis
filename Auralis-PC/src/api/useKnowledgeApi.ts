import request from './request.ts'
import type { components } from './generated/schema.ts'

type GeneratedResponse = components['schemas']['Response']

export type KnowledgeBlockView = Pick<
  GeneratedResponse,
  'id' | 'subjectId' | 'title' | 'description' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  sourceId?: string
  summary?: string
  content?: string
  tags?: string[]
  colorOverride?: string
}

export interface KnowledgeBlockCreateRequest {
  baseVersion: components['schemas']['VersionRequest']['baseVersion']
  subjectId: string
  sourceId?: string
  title: string
  summary?: string
  content: string
  tags?: string[]
  colorOverride?: string
}

export type KnowledgeBlockUpdateRequest = KnowledgeBlockCreateRequest
export type KnowledgeBlockVersionRequest = components['schemas']['VersionRequest']

export interface PageQuery {
  cursor?: string
  limit?: number
}

export interface KnowledgeBlockListResponse {
  items?: KnowledgeBlockView[]
  nextCursor?: string
  hasMore?: boolean
}

export const useKnowledgeApi = {
  list(params?: PageQuery): Promise<KnowledgeBlockListResponse> {
    return request.get('/api/knowledge-blocks', { params }) as unknown as Promise<KnowledgeBlockListResponse>
  },
  // The current API lists knowledge blocks by cursor only; subjectId remains a
  // context argument for callers until the server exposes a subject filter.
  getKnowledgeBlocks(_subjectId: string, params?: PageQuery): Promise<KnowledgeBlockListResponse> {
    return request.get('/api/knowledge-blocks', { params }) as unknown as Promise<KnowledgeBlockListResponse>
  },
  get(id: string): Promise<KnowledgeBlockView> {
    return request.get(`/api/knowledge-blocks/${encodeURIComponent(id)}`) as unknown as Promise<KnowledgeBlockView>
  },
  getKnowledgeBlock(id: string): Promise<KnowledgeBlockView> {
    return request.get(`/api/knowledge-blocks/${encodeURIComponent(id)}`) as unknown as Promise<KnowledgeBlockView>
  },
  create(data: KnowledgeBlockCreateRequest): Promise<KnowledgeBlockView> {
    return request.post('/api/knowledge-blocks', data) as unknown as Promise<KnowledgeBlockView>
  },
  createKnowledgeBlock(data: KnowledgeBlockCreateRequest): Promise<KnowledgeBlockView> {
    return request.post('/api/knowledge-blocks', data) as unknown as Promise<KnowledgeBlockView>
  },
  update(id: string, data: KnowledgeBlockUpdateRequest): Promise<KnowledgeBlockView> {
    return request.put(`/api/knowledge-blocks/${encodeURIComponent(id)}`, data) as unknown as Promise<KnowledgeBlockView>
  },
  updateKnowledgeBlock(id: string, data: KnowledgeBlockUpdateRequest): Promise<KnowledgeBlockView> {
    return request.put(`/api/knowledge-blocks/${encodeURIComponent(id)}`, data) as unknown as Promise<KnowledgeBlockView>
  },
  delete(id: string, data: KnowledgeBlockVersionRequest): Promise<void> {
    return request.delete(`/api/knowledge-blocks/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  deleteKnowledgeBlock(id: string, data: KnowledgeBlockVersionRequest): Promise<void> {
    return request.delete(`/api/knowledge-blocks/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  restore(id: string, data: KnowledgeBlockVersionRequest): Promise<KnowledgeBlockView> {
    return request.post(`/api/knowledge-blocks/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<KnowledgeBlockView>
  },
  restoreKnowledgeBlock(id: string, data: KnowledgeBlockVersionRequest): Promise<KnowledgeBlockView> {
    return request.post(`/api/knowledge-blocks/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<KnowledgeBlockView>
  },
}

export const getKnowledgeBlocks = useKnowledgeApi.getKnowledgeBlocks
export const getKnowledgeBlock = useKnowledgeApi.getKnowledgeBlock
export const createKnowledgeBlock = useKnowledgeApi.createKnowledgeBlock
export const updateKnowledgeBlock = useKnowledgeApi.updateKnowledgeBlock
export const deleteKnowledgeBlock = useKnowledgeApi.deleteKnowledgeBlock
export const restoreKnowledgeBlock = useKnowledgeApi.restoreKnowledgeBlock
