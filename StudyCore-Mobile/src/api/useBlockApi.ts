/**
 * 移动端知识块 API — 与 PC 端 useBlockApi.ts 保持相同的接口契约
 */
import mobileRequest from './request'

export interface KnowledgeBlock {
  id?: string
  subject: string
  title: string
  preview: string
  time: string
  source: string
  color: string
}

export const useBlockApi = {
  createBlock(block: Partial<KnowledgeBlock>) {
    return mobileRequest.post('/api/blocks', block)
  },
  getBlocks(subject?: string, page = 1, size = 10) {
    return mobileRequest.get('/api/blocks', { subject, page, size })
  },
  updateBlock(id: string, block: Partial<KnowledgeBlock>) {
    return mobileRequest.put(`/api/blocks/${id}`, block)
  },
  deleteBlock(id: string) {
    return mobileRequest.delete(`/api/blocks/${id}`)
  },
}
