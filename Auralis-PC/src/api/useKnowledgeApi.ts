import request from './request.ts'
import type { components } from './generated/schema.ts'

type GeneratedResponse = components['schemas']['Response']

export type KnowledgeBlockView = Pick<
  GeneratedResponse,
  'id' | 'subjectId' | 'title' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  sourceId?: string
  content?: string
  colorOverride?: string
}

export interface KnowledgeBlockCreateRequest {
  baseVersion: components['schemas']['VersionRequest']['baseVersion']
  subjectId: string
  sourceId?: string
  title: string
  content: string
  colorOverride?: string
}

export type KnowledgeBlockUpdateRequest = KnowledgeBlockCreateRequest
export type KnowledgeBlockVersionRequest = components['schemas']['VersionRequest']

export const useKnowledgeApi = {
  get(id: string): Promise<KnowledgeBlockView> {
    return request.get(`/api/knowledge-blocks/${encodeURIComponent(id)}`) as unknown as Promise<KnowledgeBlockView>
  },
}
