import { defineStore } from 'pinia'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import type { KnowledgeBlockModel } from '@/services/domainMappers'

/**
 * Compatibility name for components that have not yet been renamed. All
 * storage and network work is delegated to the typed Knowledge store.
 */
export interface KnowledgeBlock {
  id?: string
  subject: string
  title: string
  content: string
  time: string
  source: string
  color: string
  sync_status?: string
  sync_version?: number
  is_deleted?: boolean
  subjectId?: string
  sourceFileId?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  mastery?: number
  reviewAt?: string
  relatedBlockIds?: string[]
}

export const useBlockStore = defineStore('block', () => {
  const knowledgeStore = useKnowledgeStore()

  async function loadLocalBlocks(subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    return knowledgeStore.loadLocalBlocks(subject, subjectId)
  }

  async function fetchBlocks(subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    return knowledgeStore.fetchBlocks(subject, subjectId)
  }

  return {
    recentBlocks: knowledgeStore.recentBlocks,
    isLoading: knowledgeStore.isLoading,
    lastError: knowledgeStore.lastError,
    loadLocalBlocks,
    fetchBlocks,
    addBlock: knowledgeStore.addBlock,
    removeBlock: knowledgeStore.removeBlock,
    updateBlock: knowledgeStore.updateBlock,
  }
})
