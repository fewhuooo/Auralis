import request from './request'
import type { KnowledgeBlock } from '@/store/useBlockStore'

export const useBlockApi = {
  createBlock(block: Partial<KnowledgeBlock>) {
    return request.post('/api/blocks', block)
  },
  getBlocks(subject?: string, page = 1, size = 10) {
    return request.get('/api/blocks', { params: { subject, page, size } })
  },
  updateBlock(id: string, block: Partial<KnowledgeBlock>) {
    return request.put(`/api/blocks/${id}`, block)
  },
  deleteBlock(id: string) {
    return request.delete(`/api/blocks/${id}`)
  }
}
