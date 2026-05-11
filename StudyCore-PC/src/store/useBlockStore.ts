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
    try {
      const res = await useBlockApi.createBlock(block)
      recentBlocks.value.unshift(res)
    } catch (e) {
      console.error('Failed to create block', e)
      recentBlocks.value.unshift(block)
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

  return {
    recentBlocks,
    fetchBlocks,
    addBlock,
    removeBlock
  }
}, {
  persist: true
})
