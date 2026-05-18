/**
 * useBlockStore — 移动端知识块状态管理
 * 复用 PC 端同名 Store 的数据模型和核心逻辑
 * 持久化由 uni-storage persist 插件自动处理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useBlockApi } from '@/api/useBlockApi'

export interface KnowledgeBlock {
  id: string
  subject: string
  title: string
  preview: string
  time: string
  source: string
  color: string
}

export const useBlockStore = defineStore('block', () => {
  const recentBlocks = ref<KnowledgeBlock[]>([])

  /**
   * 从后端拉取知识块列表
   */
  const fetchBlocks = async (subject?: string) => {
    try {
      const res: any = await useBlockApi.getBlocks(subject)
      recentBlocks.value = res.records || []
    } catch (e) {
      console.error('[Mobile] Failed to fetch blocks:', e)
      // 离线时保留 persist 缓存中的数据，不清空
    }
  }

  const addBlock = async (block: KnowledgeBlock) => {
    try {
      const res: any = await useBlockApi.createBlock(block)
      recentBlocks.value.unshift(res)
    } catch (e) {
      console.error('[Mobile] Failed to create block, saving locally:', e)
      recentBlocks.value.unshift(block)
    }
  }

  const removeBlock = async (id: string) => {
    try {
      await useBlockApi.deleteBlock(id)
      recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
    } catch (e) {
      console.error('[Mobile] Failed to delete block:', e)
      recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
    }
  }

  /**
   * 从远程同步数据覆盖本地（PC端 -> 移动端）
   */
  const syncFromRemote = (blocks: KnowledgeBlock[]) => {
    recentBlocks.value = blocks
  }

  return {
    recentBlocks,
    fetchBlocks,
    addBlock,
    removeBlock,
    syncFromRemote,
  }
}, {
  // @ts-ignore
  persist: true
})
