import { defineStore } from 'pinia'
import { ref } from 'vue'
import { localDb } from '@/services/localDb'
import { uuidv7 } from '@/utils/uuid'
import { useAuthStore } from './useAuthStore'

export interface KnowledgeBlock {
  id: string
  subject: string
  title: string
  preview: string
  time: string
  source: string
  color: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
  is_deleted?: boolean
  sync_version?: number
  subjectId?: string
  sourceFileId?: string
  tags?: string[]
  mastery?: number
  reviewAt?: string
  relatedBlockIds?: string[]
}

export const useBlockStore = defineStore('block', () => {
  const recentBlocks = ref<KnowledgeBlock[]>([])
  const isSyncing = ref(false)

  const checkOnline = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      uni.getNetworkType({
        success: (res) => {
          resolve(res.networkType !== 'none')
        },
        fail: () => {
          resolve(true)
        }
      })
    })
  }

  const loadLocalBlocks = async (subject?: string, subjectId?: string) => {
    const auth = useAuthStore()
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
    const serverDeviceId = auth.serverDeviceId
    try {
      const blocks = await localDb.getBlocks(subject, subjectId)
      if (
        generation !== auth.getLoginGeneration()
        || userId !== auth.user?.id
        || serverDeviceId !== auth.serverDeviceId
      ) {
        return
      }
      recentBlocks.value = blocks
    } catch (e) {
      console.error('[Mobile Store] Failed to load local blocks:', e)
    }
  }

  const fetchBlocks = async (subject?: string, subjectId?: string) => {
    const auth = useAuthStore()
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
    const serverDeviceId = auth.serverDeviceId
    // 1. Read from local SQLite
    await loadLocalBlocks(subject, subjectId)

    // 2. Try bidirectional sync
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
      if (
        generation !== auth.getLoginGeneration()
        || userId !== auth.user?.id
        || serverDeviceId !== auth.serverDeviceId
      ) {
        return
      }
      await loadLocalBlocks(subject, subjectId)
    } catch (e) {
      console.warn('[Mobile Store] Server unreachable, using local database cache:', e)
    }
  }

  const recordMutation = async (entityType: 'block' | 'task', entityId: string, action: 'create' | 'update' | 'delete', payload: any) => {
    const { getClientId } = await import('./useSyncStore')
    const clientId = getClientId()
    await localDb.addLocalMutation(clientId, entityType, entityId, action, payload)
  }

  const syncPendingChanges = async () => {
    const online = await checkOnline()
    if (!online || isSyncing.value) return
    isSyncing.value = true
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
    } catch (err) {
      console.error(`[Mobile Store] Background sync failed:`, err)
    } finally {
      isSyncing.value = false
    }
  }

  const addBlock = async (block: Omit<KnowledgeBlock, 'id' | 'time'> & { id?: string; time?: string }) => {
    const newBlock: KnowledgeBlock = {
      id: block.id || uuidv7(),
      subject: block.subject,
      title: block.title,
      preview: block.preview,
      time: block.time || new Date().toISOString(),
      source: block.source,
      color: block.color,
      sync_status: 'pending_create',
      subjectId: block.subjectId,
      sourceFileId: block.sourceFileId,
      tags: block.tags || [],
      mastery: block.mastery || 0,
      reviewAt: block.reviewAt,
      relatedBlockIds: block.relatedBlockIds || []
    }

    recentBlocks.value.unshift(newBlock)
    await localDb.saveBlock(newBlock, 'pending_create')
    await recordMutation('block', newBlock.id || '', 'create', newBlock)
    
    syncPendingChanges()
  }

  const removeBlock = async (id: string) => {
    const existing = recentBlocks.value.find(b => b.id === id)
    recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
    await localDb.deleteBlock(id)
    await recordMutation('block', id, 'delete', { id, sync_version: existing?.sync_version ?? 0 })
    
    syncPendingChanges()
  }

  const updateBlock = async (block: KnowledgeBlock) => {
    if (!block.id) return
    const updatedBlock: KnowledgeBlock = {
      ...block,
      sync_status: block.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
    }

    const index = recentBlocks.value.findIndex(b => b.id === block.id)
    if (index !== -1) {
      recentBlocks.value[index] = updatedBlock
    }
    await localDb.saveBlock(updatedBlock, updatedBlock.sync_status)
    await recordMutation('block', block.id, 'update', updatedBlock)

    syncPendingChanges()
  }

  const syncFromRemote = (blocks: KnowledgeBlock[]) => {
    localDb.mergeBlocksFromServer(blocks).then(() => loadLocalBlocks())
  }

  // Set up reactive sync listener on network status change
  uni.onNetworkStatusChange((res) => {
    if (res.isConnected) {
      console.log('[Mobile Store] Network re-established. Auto-syncing blocks...')
      syncPendingChanges()
    }
  })

  return {
    recentBlocks,
    loadLocalBlocks,
    fetchBlocks,
    addBlock,
    removeBlock,
    updateBlock,
    syncFromRemote,
    syncPendingChanges
  }
})
