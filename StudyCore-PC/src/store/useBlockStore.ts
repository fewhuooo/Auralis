import { defineStore } from 'pinia'
import { ref } from 'vue'
import { localDb } from '@/services/localDb'
import { uuidv7 } from '@/utils/uuid'

export interface KnowledgeBlock {
  id?: string
  subject: string
  title: string
  preview: string
  time: string
  source: string
  color: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
  sync_version?: number
  is_deleted?: boolean
  subjectId?: string
  sourceFileId?: string
  tags?: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
  mastery?: number
  reviewAt?: string
  relatedBlockIds?: string[]
}

export const useBlockStore = defineStore('block', () => {
  const recentBlocks = ref<KnowledgeBlock[]>([])
  const isSyncing = ref(false)

  // Initialize DB and load initial state
  const loadLocalBlocks = async (subject?: string, subjectId?: string) => {
    try {
      recentBlocks.value = await localDb.getBlocks(subject, subjectId)
    } catch (e) {
      console.error('Failed to load local blocks:', e)
    }
  }

  const fetchBlocks = async (subject?: string, subjectId?: string) => {
    // 1. Read from local SQLite first (Local-First instant load)
    await loadLocalBlocks(subject, subjectId)

    // 2. Try bidirectional sync
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
      await loadLocalBlocks(subject, subjectId)
    } catch (e) {
      console.warn('[PC Store] Server unreachable, using local database cache:', e)
    }
  }

  const recordMutation = async (entityType: 'block' | 'task', entityId: string, action: 'create' | 'update' | 'delete', payload: any) => {
    const { getClientId } = await import('./useSyncStore')
    const clientId = getClientId()
    await localDb.addLocalMutation(clientId, entityType, entityId, action, payload)
  }

  const syncPendingChanges = async () => {
    if (!navigator.onLine || isSyncing.value) return
    isSyncing.value = true
    try {
      const { useSyncStore } = await import('./useSyncStore')
      await useSyncStore().triggerSync()
    } catch (err) {
      console.error(`[PC Store] Background sync failed:`, err)
    } finally {
      isSyncing.value = false
    }
  }

  const addBlock = async (block: KnowledgeBlock) => {
    // Generate RFC 9562 UUIDv7 in client
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
      difficulty: block.difficulty,
      mastery: block.mastery || 0,
      reviewAt: block.reviewAt,
      relatedBlockIds: block.relatedBlockIds || []
    }

    // Update memory & SQLite instantly
    recentBlocks.value.unshift(newBlock)
    await localDb.saveBlock(newBlock, 'pending_create')
    await recordMutation('block', newBlock.id || '', 'create', newBlock)

    // Asynchronously sync in background
    syncPendingChanges()
  }

  const removeBlock = async (id: string) => {
    // Update memory & SQLite instantly
    recentBlocks.value = recentBlocks.value.filter(b => b.id !== id)
    await localDb.deleteBlock(id)
    await recordMutation('block', id, 'delete', { id })

    // Asynchronously sync in background
    syncPendingChanges()
  }

  const updateBlock = async (block: KnowledgeBlock) => {
    if (!block.id) return
    const updatedBlock: KnowledgeBlock = {
      ...block,
      sync_status: block.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'
    }

    // Update memory & SQLite instantly
    const index = recentBlocks.value.findIndex(b => b.id === block.id)
    if (index !== -1) {
      recentBlocks.value[index] = updatedBlock
    }
    await localDb.saveBlock(updatedBlock as any, updatedBlock.sync_status)
    await recordMutation('block', block.id, 'update', updatedBlock)

    // Asynchronously sync in background
    syncPendingChanges()
  }

  // Setup online network status listener for reactive synchronizations
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('[PC Store] Online detected. Auto-syncing blocks...')
      syncPendingChanges()
    })
  }

  return {
    recentBlocks,
    loadLocalBlocks,
    fetchBlocks,
    addBlock,
    removeBlock,
    updateBlock,
    syncPendingChanges
  }
})
