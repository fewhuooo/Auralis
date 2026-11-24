import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
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
  const auth = useAuthStore()
  const recentBlocks = ref<KnowledgeBlock[]>([])
  const isSyncing = ref(false)
  const updatingBlockIds = ref<string[]>([])

  watch(
    () => [auth.isAuthenticated, auth.user?.id, auth.serverDeviceId],
    () => {
      recentBlocks.value = []
      updatingBlockIds.value = []
      isSyncing.value = false
    },
    { flush: 'sync' },
  )

  function captureAuthFence() {
    const auth = useAuthStore()
    return {
      generation: auth.getLoginGeneration(),
      userId: auth.user?.id,
      serverDeviceId: auth.serverDeviceId,
    }
  }

  function isFenceCurrent(fence: ReturnType<typeof captureAuthFence>): boolean {
    const auth = useAuthStore()
    return fence.generation === auth.getLoginGeneration()
      && fence.userId === auth.user?.id
      && fence.serverDeviceId === auth.serverDeviceId
  }

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
    const blockId = block.id || uuidv7()
    if (updatingBlockIds.value.includes(blockId)) return
    const fence = captureAuthFence()
    const newBlock: KnowledgeBlock = {
      id: blockId,
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

    updatingBlockIds.value = [...updatingBlockIds.value, blockId]
    try {
      await localDb.saveBlock(newBlock, 'pending_create')
      await recordMutation('block', blockId, 'create', newBlock)
      if (isFenceCurrent(fence)) {
        recentBlocks.value = [newBlock, ...recentBlocks.value.filter(b => b.id !== blockId)]
        void import('./useSubjectStore').then(({ useSubjectStore }) => useSubjectStore().loadSubjects()).catch(() => {})
      }
      void syncPendingChanges()
    } finally {
      updatingBlockIds.value = updatingBlockIds.value.filter(item => item !== blockId)
    }
  }

  const removeBlock = async (id: string) => {
    if (!id || updatingBlockIds.value.includes(id)) return
    const fence = captureAuthFence()
    updatingBlockIds.value = [...updatingBlockIds.value, id]
    try {
      const existing = recentBlocks.value.find(b => b.id === id)
      await localDb.deleteBlock(id)
      await recordMutation('block', id, 'delete', { id, sync_version: existing?.sync_version ?? 0 })
      if (isFenceCurrent(fence)) {
        recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
        void import('./useSubjectStore').then(({ useSubjectStore }) => useSubjectStore().loadSubjects()).catch(() => {})
      }
      void syncPendingChanges()
    } finally {
      updatingBlockIds.value = updatingBlockIds.value.filter(item => item !== id)
    }
  }

  const updateBlock = async (block: KnowledgeBlock) => {
    if (!block.id || updatingBlockIds.value.includes(block.id)) return
    const blockId = block.id
    const fence = captureAuthFence()
    updatingBlockIds.value = [...updatingBlockIds.value, blockId]
    try {
      const existing = recentBlocks.value.find(b => b.id === blockId)
      const updatedBlock: KnowledgeBlock = {
        ...existing,
        ...block,
        sync_version: block.sync_version ?? existing?.sync_version ?? 0,
        sync_status: existing?.sync_status === 'pending_create' || block.sync_status === 'pending_create'
          ? 'pending_create'
          : 'pending_update',
      }
      await localDb.saveBlock(updatedBlock, updatedBlock.sync_status)
      await recordMutation('block', blockId, 'update', updatedBlock)
      if (isFenceCurrent(fence)) {
        const index = recentBlocks.value.findIndex(b => b.id === blockId)
        if (index !== -1) {
          recentBlocks.value = recentBlocks.value.map(b => b.id === blockId ? updatedBlock : b)
        }
      }
      void syncPendingChanges()
    } finally {
      updatingBlockIds.value = updatingBlockIds.value.filter(item => item !== blockId)
    }
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
    updatingBlockIds,
    loadLocalBlocks,
    fetchBlocks,
    addBlock,
    removeBlock,
    updateBlock,
    syncFromRemote,
    syncPendingChanges
  }
})
