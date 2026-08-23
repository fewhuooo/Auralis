import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncApi } from '@/api/useSyncApi'
import { getLocalRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import type { LocalEntity, LocalMutation } from '@/types/api'
import type {
  SyncChange,
  SyncMutationResponse,
  SyncPullResponse,
  SyncResourceType,
  SyncSnapshotResponse,
} from '@/types/sync'

const SYNC_RESOURCE_TYPES = new Set<SyncResourceType>(['SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION'])

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_')
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function resourceId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  return value.id
}

function resourceVersion(value: unknown, fallback = 0): number {
  if (!isRecord(value) || typeof value.version !== 'number') return fallback
  return value.version
}

function snapshotResourceItems(snapshot: SyncSnapshotResponse): Array<{
  resourceType: SyncResourceType
  resourceId: string
  version: number
  deletedAt: string | null
  value: unknown
}> {
  const groups: Array<[SyncResourceType, unknown[]]> = [
    ['SUBJECT', snapshot.subjects],
    ['SOURCE', snapshot.sources],
    ['KNOWLEDGE_BLOCK', snapshot.knowledgeBlocks],
    ['TASK', snapshot.tasks],
    ['RELATION', snapshot.relations],
  ]
  return groups.flatMap(([type, values]) => values.flatMap((value) => {
    const id = resourceId(value)
    if (!id) return []
    return [{
      resourceType: type,
      resourceId: id,
      version: resourceVersion(value),
      deletedAt: isRecord(value) && typeof value.deletedAt === 'string' ? value.deletedAt : null,
      value,
    }]
  }))
}

function mergedMutationValue(current: unknown, mutation: LocalMutation): unknown {
  if (mutation.mutationType === 'CREATE') return mutation.payload
  if (!isRecord(current)) return mutation.payload
  return { ...current, ...mutation.payload }
}

async function replayPendingMutations(repository: LocalRepository): Promise<void> {
  const pending = await repository.listPending()
  for (const mutation of pending) {
    const current = await repository.read<Record<string, unknown>>(mutation.resourceType, mutation.resourceId)
    if (mutation.mutationType === 'DELETE') {
      if (current) {
        await repository.tombstone(mutation.resourceType, mutation.resourceId, { syncStatus: 'pending' })
      }
      continue
    }
    await repository.upsert(
      mutation.resourceType,
      mutation.resourceId,
      mergedMutationValue(current?.value, mutation),
      {
        version: current?.version ?? 0,
        deletedAt: mutation.mutationType === 'RESTORE' ? null : current?.deletedAt ?? null,
        syncStatus: 'pending',
      },
    )
  }
}

function changeValue(change: SyncChange, current: LocalEntity<unknown> | null): unknown {
  if (isRecord(change.payload) || Array.isArray(change.payload)) return change.payload
  return current?.value ?? {}
}

async function applyPullChange(repository: LocalRepository, change: SyncChange): Promise<void> {
  const current = await repository.read(change.resourceType, change.resourceId)
  const unresolved = await repository.listUnresolved()
  if (unresolved.some((mutation) => mutation.resourceType === change.resourceType && mutation.resourceId === change.resourceId)) {
    return
  }

  const deletedAt = change.mutationType === 'DELETE'
    ? change.deletedAt ?? new Date().toISOString()
    : change.mutationType === 'RESTORE' ? null : change.deletedAt
  await repository.upsert(change.resourceType, change.resourceId, changeValue(change, current), {
    version: change.version,
    deletedAt,
    syncStatus: 'synced',
  })
}

async function applyPushResult(repository: LocalRepository, result: SyncMutationResponse): Promise<void> {
  if (!result.clientMutationId || !result.decision) return
  if (result.decision === 'PROCESSING') return

  if (result.decision === 'APPLIED') {
    await repository.markApplied(result.clientMutationId, 'applied')
  } else if (result.decision === 'CONFLICT') {
    await repository.markApplied(result.clientMutationId, 'conflict', result.code)
  } else {
    await repository.markApplied(result.clientMutationId, 'error', result.code)
  }

  if (!result.resourceType || !result.resourceId || !SYNC_RESOURCE_TYPES.has(result.resourceType)) return
  const current = await repository.read(result.resourceType, result.resourceId)
  if (result.decision === 'APPLIED' && current) {
    await repository.upsert(result.resourceType, result.resourceId, current.value, {
      version: resourceVersion(result.current, current.version),
      deletedAt: current.deletedAt,
      syncStatus: 'synced',
    })
  } else if (result.decision === 'CONFLICT' && current) {
    await repository.upsert(result.resourceType, result.resourceId, current.value, {
      version: current.version,
      deletedAt: current.deletedAt,
      syncStatus: 'conflict',
    })
  }
}

export const getClientId = (): string => {
  const authStore = useAuthStore()
  const userId = authStore.user?.id ?? 'anonymous'
  const deviceId = authStore.deviceId ?? 'browser'
  const key = `auralis:v2:${encodeKeyPart(userId)}:${encodeKeyPart(deviceId)}:client-id`
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
  let pullPromise: Promise<void> | null = null
  let cyclePromise: Promise<void> | null = null

  async function getRepository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const deviceId = authStore.deviceId
    if (!userId || !deviceId) throw new Error('Sync requires an authenticated user and device')
    const key = `${userId}:${deviceId}`
    if (!repository || repositoryKey !== key) {
      repository = await getLocalRepository(userId, deviceId)
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

  async function applySnapshot(repositoryForSync: LocalRepository, snapshot: SyncSnapshotResponse): Promise<void> {
    await repositoryForSync.replaceSnapshotPreservingPending(snapshotResourceItems(snapshot))
    await replayPendingMutations(repositoryForSync)
    cursor.value = snapshot.snapshotCursor
    resetRequired.value = false
    await repositoryForSync.saveCursor(snapshot.snapshotCursor, false)
    publishUpdated()
  }

  async function pullLoop(): Promise<void> {
    const repositoryForSync = await getRepository()
    if (resetRequired.value) {
      await applySnapshot(repositoryForSync, await useSyncApi.getSnapshot())
      return
    }
    let nextCursor = cursor.value ?? undefined
    let hasMore = true
    while (hasMore) {
      const response: SyncPullResponse = await useSyncApi.pullChanges({ cursor: nextCursor, limit: 100 })
      if (response.resetRequired) {
        resetRequired.value = true
        await applySnapshot(repositoryForSync, await useSyncApi.getSnapshot())
        return
      }
      for (const change of response.changes) await applyPullChange(repositoryForSync, change)
      cursor.value = response.nextCursor
      resetRequired.value = false
      await repositoryForSync.saveCursor(response.nextCursor, false)
      publishUpdated()
      const previousCursor = nextCursor ?? null
      nextCursor = response.nextCursor ?? undefined
      hasMore = response.hasMore && nextCursor !== previousCursor
    }
  }

  async function pullChanges(_options?: { reason?: string }): Promise<void> {
    if (!isOnline() || pullPromise) return pullPromise ?? Promise.resolve()
    pullPromise = (async () => {
      isPulling.value = true
      lastSyncError.value = null
      try {
        await pullLoop()
      } catch (error) {
        lastSyncError.value = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        isPulling.value = false
        pullPromise = null
      }
    })()
    return pullPromise
  }

  async function pushChanges(): Promise<void> {
    if (!isOnline() || isPushing.value) return
    isPushing.value = true
    lastSyncError.value = null
    try {
      const authStore = useAuthStore()
      if (!authStore.deviceId) throw new Error('Sync push requires an authenticated device')
      const repositoryForSync = await getRepository()
      const pending = await repositoryForSync.listPending()
      if (pending.length === 0) return
      const response = await useSyncApi.pushChanges({ deviceId: authStore.deviceId, mutations: pending })
      for (const result of response.results) await applyPushResult(repositoryForSync, result)
      publishUpdated()
    } catch (error) {
      lastSyncError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      isPushing.value = false
    }
  }

  let syncRequested = false

  async function triggerSync(): Promise<void> {
    if (!isOnline()) return Promise.resolve()
    if (cyclePromise) {
      syncRequested = true
      return cyclePromise
    }
    cyclePromise = (async () => {
      try {
        do {
          syncRequested = false
          await pushChanges()
          await pullChanges({ reason: 'cycle' })
        } while (syncRequested && isOnline())
      } finally {
        cyclePromise = null
        syncRequested = false
      }
    })()
    return cyclePromise
  }

  const initE2EE = async (): Promise<void> => {}

  return {
    cursor,
    resetRequired,
    isPulling,
    isPushing,
    isSyncing,
    lastSyncError,
    triggerSync,
    pullChanges,
    pushChanges,
    initE2EE,
  }
})
