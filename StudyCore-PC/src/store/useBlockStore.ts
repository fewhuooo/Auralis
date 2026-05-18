import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useBlockApi } from '@/api/useBlockApi'

export interface KnowledgeBlock {
  id?: string
  subject: string
  title: string
  preview: string
  time: string
  source: string
  color: string
}

export const useBlockStore = defineStore('block', () => {
  const recentBlocks = ref<KnowledgeBlock[]>([])

  const fetchBlocks = async (subject?: string) => {
    try {
      const res: any = await useBlockApi.getBlocks(subject)
      recentBlocks.value = res.records || []
    } catch (e) {
      console.error('Failed to fetch blocks', e)
    }
  }

  const addBlock = async (block: KnowledgeBlock) => {
    recentBlocks.value.unshift(block)
    try {
      const res = await useBlockApi.createBlock(block)
      const index = recentBlocks.value.findIndex(b => b.id === block.id)
      if (index !== -1) {
        // Preserve any streamed text that might have arrived
        res.preview = recentBlocks.value[index].preview
        recentBlocks.value[index] = res
      }
    } catch (e) {
      console.error('Failed to create block', e)
    }
  }

  const removeBlock = async (id: string) => {
    try {
      await useBlockApi.deleteBlock(id)
      recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
    } catch (e) {
      console.error('Failed to delete block', e)
      recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
    }
  }

  const updateBlock = async (block: KnowledgeBlock) => {
    if (!block.id) return;
    try {
      const res = await useBlockApi.updateBlock(block.id, block)
      const index = recentBlocks.value.findIndex(b => b.id === block.id)
      if (index !== -1) {
        recentBlocks.value[index] = res
      }
    } catch (e) {
      console.error('Failed to update block', e)
    }
  }

  return {
    recentBlocks,
    fetchBlocks,
    addBlock,
    removeBlock,
    updateBlock
  }
}, {
  persist: true
})
