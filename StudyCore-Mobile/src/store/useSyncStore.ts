import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useSyncApi } from '@/api/useSyncApi'
import { localDb } from '@/services/localDb'
import { useBlockStore } from './useBlockStore'
import { useTaskStore } from './useTaskStore'

export const getClientId = () => {
  let cid = uni.getStorageSync('studycore_client_id')
  if (!cid) {
    cid = 'mobile_' + Math.random().toString(36).substring(2, 15)
    uni.setStorageSync('studycore_client_id', cid)
  }
  return cid
}

export const useSyncStore = defineStore('sync', () => {
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

  const triggerSync = async () => {
    const online = await checkOnline()
    if (!online || isSyncing.value) return
    isSyncing.value = true

    try {
      console.log('[Mobile SyncStore] Starting event-sourced sync cycle...')

      // 1. PUSH local mutations
      const unsyncedMutations = await localDb.getUnsyncedMutations()
      if (unsyncedMutations.length > 0) {
        console.log(`[Mobile SyncStore] Pushing ${unsyncedMutations.length} local mutations...`)
        
        const mapped = unsyncedMutations.map(m => ({
          clientId: m.client_id,
          entityType: m.entity_type,
          entityId: m.entity_id,
          action: m.action,
          payload: typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload,
          createdAt: m.created_at
        }))

        await useSyncApi.push(mapped)

        // Clear pushed mutations
        for (const m of unsyncedMutations) {
          await localDb.markMutationSynced(m.id)
        }
        console.log('[Mobile SyncStore] Pushed mutations successfully synced.')
      }

      // 2. PULL remote mutations
      const lastMutationIdStr = await localDb.getMetadata('last_mutation_id') || '0'
      const lastMutationId = parseInt(lastMutationIdStr, 10)
      console.log(`[Mobile SyncStore] Pulling remote mutations since: ${lastMutationId}`)

      const pullRes = await useSyncApi.pull(lastMutationId)

      // 3. REPLAY & MERGE
      const blockStore = useBlockStore()
      const taskStore = useTaskStore()

      if (pullRes.truncated) {
        console.warn('[Mobile SyncStore] Server reported sliding window truncation! Initiating cold start...');
        
        // Cold start full state overwrite
        // Clear local entities (hard delete active items)
        const blocks = await localDb.getBlocks()
        for (const b of blocks) {
          if (b.id) await localDb.hardDeleteBlock(b.id)
        }
        const tasks = await localDb.getTasks()
        for (const t of tasks) {
          if (t.id) await localDb.hardDeleteTask(t.id)
        }

        // Save server snapshot
        if (pullRes.blocks) {
          for (const b of pullRes.blocks) {
            await localDb.saveBlock(b, 'synced', b.syncVersion || b.sync_version || 0)
          }
        }
        if (pullRes.tasks) {
          for (const t of pullRes.tasks) {
            await localDb.saveTask(t, 'synced', t.syncVersion || t.sync_version || 0)
          }
        }

        // Update meta cursors
        await localDb.setMetadata('last_mutation_id', pullRes.lastMutationId.toString())
        
        // Reload stores memory
        if (blockStore.loadLocalBlocks) await blockStore.loadLocalBlocks()
        if (taskStore.loadLocalTasks) await taskStore.loadLocalTasks()

        console.log('[Mobile SyncStore] Cold start synchronization completed successfully.')
      } else {
        // Incremental replay
        const cId = getClientId()
        let appliedRemote = false

        if (pullRes.mutations && pullRes.mutations.length > 0) {
          console.log(`[Mobile SyncStore] Replaying ${pullRes.mutations.length} mutations...`)
          for (const m of pullRes.mutations) {
            if (m.clientId === cId) {
              continue
            }
            await localDb.applyRemoteMutation(m)
            appliedRemote = true
          }
        }

        // Save new cursor index
        await localDb.setMetadata('last_mutation_id', pullRes.lastMutationId.toString())

        // Refresh stores memory if new remote data was applied
        if (appliedRemote || (pullRes.mutations && pullRes.mutations.length > 0)) {
          if (blockStore.loadLocalBlocks) await blockStore.loadLocalBlocks()
          if (taskStore.loadLocalTasks) await taskStore.loadLocalTasks()
        }

        console.log(`[Mobile SyncStore] Replay completed. Cursor advanced to: ${pullRes.lastMutationId}`)
      }
    } catch (e) {
      console.error('[Mobile SyncStore] Mutation synchronization failed:', e)
    } finally {
      isSyncing.value = false
    }
  }

  const initE2EE = async () => {
    console.log('[Mobile E2EE] Initializing end-to-end encryption keys...');
  }

  return {
    isSyncing,
    triggerSync,
    initE2EE
  }
})
