import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncApi } from '@/api/useSyncApi'
import { getLocalRepository, getLocalAssetRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { publishProjectionChange } from '@/services/localProjectionEvents'
import { runSyncCycle } from '@/services/syncCycle'
import { createSyncScheduler } from '@/services/syncScheduler'
import { getOrCreateLocalAssetService } from '@/services/localAssetService'
import { getOrCreateLocalSourceDraftService } from '@/services/localSourceDraftService'
import { getOrCreateLocalAssetSyncQueue, releaseLocalAssetSyncQueue, type LocalAssetSyncQueue } from '@/services/localAssetSyncQueue'

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_')
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export const getClientId = (): string => {
  const authStore = useAuthStore()
  const userId = authStore.user?.id ?? 'anonymous'
  const serverDeviceId = authStore.serverDeviceId ?? 'browser'
  const key = `auralis:v2:${encodeKeyPart(userId)}:${encodeKeyPart(serverDeviceId)}:client-id`
  const local = storage()
  const existing = local?.getItem(key)
  if (existing) return existing
  const generated = globalThis.crypto?.randomUUID?.() ?? `pc_${Date.now()}_${Math.random().toString(36).slice(2)}`
  local?.setItem(key, generated)
  return generated
}

export const useSyncStore = defineStore('sync', () => {
  const cursor = ref<string | null>(null)
  const resetRequired = ref(false)
  const isPulling = ref(false)
  const isPushing = ref(false)
  const lastSyncError = ref<string | null>(null)
  const isSyncing = computed(() => isPulling.value || isPushing.value)

  let repository: LocalRepository | null = null
  let repositoryKey: string | null = null
  let cyclePromise: Promise<void> | null = null
  let syncRequested = false
  const scheduler = createSyncScheduler({ delayMs: 500, run: async () => flushNow() })

  let assetQueuePromise: Promise<LocalAssetSyncQueue> | null = null
  let assetQueueUserId: string | null = null
  let assetQueueDeviceId: string | null = null

  const authStore = useAuthStore()

  watch(
    () => ({ userId: authStore.user?.id, deviceId: authStore.serverDeviceId }),
    (newVal, oldVal) => {
      if (oldVal && oldVal.userId && oldVal.deviceId) {
        if (oldVal.userId !== newVal.userId || oldVal.deviceId !== newVal.deviceId) {
          releaseLocalAssetSyncQueue(oldVal.userId, oldVal.deviceId)
          if (assetQueueUserId === oldVal.userId && assetQueueDeviceId === oldVal.deviceId) {
            assetQueueUserId = null
            assetQueueDeviceId = null
            assetQueuePromise = null
          }
        }
      }
    },
    { deep: true }
  )

  async function getAssetQueue(): Promise<LocalAssetSyncQueue> {
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId) throw new Error('Sync requires an authenticated user and device')

    if (assetQueueUserId !== userId || assetQueueDeviceId !== serverDeviceId) {
      if (assetQueueUserId && assetQueueDeviceId) {
        releaseLocalAssetSyncQueue(assetQueueUserId, assetQueueDeviceId)
      }
      assetQueueUserId = userId
      assetQueueDeviceId = serverDeviceId

      const p = (async () => {
        try {
          const assetRepository = await getLocalAssetRepository(userId, serverDeviceId)
          const rep = await getRepository()
          const assetService = getOrCreateLocalAssetService(assetRepository)
          const draftService = getOrCreateLocalSourceDraftService(assetRepository, rep)

          return await getOrCreateLocalAssetSyncQueue({
            assetRepository,
            assetService,
            draftService,
            onWakeup: () => { requestBackgroundSync('write') },
          })
        } catch (e) {
          if (assetQueuePromise === p) {
            assetQueuePromise = null
            assetQueueUserId = null
            assetQueueDeviceId = null
          }
          throw e
        }
      })()
      assetQueuePromise = p
    }
    return assetQueuePromise!
  }

  async function getRepository(): Promise<LocalRepository> {
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId) throw new Error('Sync requires an authenticated user and device')
    const key = `${userId}:${serverDeviceId}`
    if (!repository || repositoryKey !== key) {
      repository = await getLocalRepository(userId, serverDeviceId)
      repositoryKey = key
      const state = await repository.getSyncState()
      cursor.value = state.cursor
      resetRequired.value = state.resetRequired
    }
    return repository
  }

  function publishUpdated(): void {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
    window.dispatchEvent(new CustomEvent('auralis-sync-updated'))
  }

  async function runCycle(): Promise<void> {
    if (!authStore.serverDeviceId) throw new Error('Sync requires an authenticated device')
    const repositoryForSync = await getRepository()
    
    isPushing.value = true
    isPulling.value = true
    lastSyncError.value = null
    try {
      const assetQueue = await getAssetQueue()
      await assetQueue.wakeUp()

      const result = await runSyncCycle({
        repository: repositoryForSync,
        api: useSyncApi,
        serverDeviceId: authStore.serverDeviceId,
      })
      cursor.value = result.cursor
      resetRequired.value = false
      if (result.changedResourceTypes.size > 0) {
        publishProjectionChange({ resourceTypes: result.changedResourceTypes })
        publishUpdated()
      }
    } catch (error) {
      lastSyncError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      isPushing.value = false
      isPulling.value = false
    }
  }

  async function flushNow(): Promise<void> {
    if (!isOnline()) return
    if (!useAuthStore().isAuthenticated) return
    if (cyclePromise) {
      syncRequested = true
      return cyclePromise
    }
    cyclePromise = (async () => {
      try {
        do {
          syncRequested = false
          await runCycle()
        } while (syncRequested && isOnline())
      } finally {
        cyclePromise = null
        syncRequested = false
      }
    })()
    return cyclePromise
  }

  function requestBackgroundSync(_reason: 'startup' | 'write' | 'realtime' | 'online' | 'read'): void {
    if (!useAuthStore().isAuthenticated) return
    void getAssetQueue().catch(e => console.error('[useSyncStore] Failed to init asset queue:', e))
    scheduler.request()
  }

  async function triggerSync(): Promise<void> {
    await flushNow()
  }

  async function pushChanges(): Promise<void> {
    await flushNow()
  }

  async function pullChanges(): Promise<void> {
    await flushNow()
  }

  const initE2EE = async (): Promise<void> => {}

  return {
    cursor,
    resetRequired,
    isPulling,
    isPushing,
    isSyncing,
    lastSyncError,
    requestBackgroundSync,
    flushNow,
    triggerSync,
    pullChanges,
    pushChanges,
    initE2EE,
  }
})
