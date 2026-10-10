import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncApi } from '@/api/useSyncApi'
import { completeUpload, createUploadIntent, uploadToObjectStorage } from '@/api/useAssetApi'
import { getLocalRepository, getLocalAssetRepository, getOverviewRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { publishProjectionChange } from '@/services/localProjectionEvents'
import { runSyncCycle } from '@/services/syncCycle'
import { SyncScopeChangedError, type SyncRequestScopeTicket } from '@/api/request'
import { createSyncScheduler } from '@/services/syncScheduler'
import { getOrCreateLocalAssetService } from '@/services/localAssetService'
import { getOrCreateLocalSourceDraftService } from '@/services/localSourceDraftService'
import {
  getOrCreateLocalAssetSyncQueue,
  releaseLocalAssetSyncQueue,
  QueueReleasedError,
  type LocalAssetSyncQueue,
} from '@/services/localAssetSyncQueue'
import { classifyClientError, logClientError } from '@/services/clientErrorPolicy.ts'
import { reconcileOverviewResults, type OverviewSyncSource } from '@/services/overviewResultsSyncService'
import { subscribeOverviewIntentCreated } from '@/services/overviewSyncWakeup'

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_')
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function isOnline(): boolean {
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
  const lastSyncErrorCode = ref<string | null>(null)
  const reviewSyncError = ref<string | null>(null)
  const isSyncing = computed(() => isPulling.value || isPushing.value)

  let repository: LocalRepository | null = null
  let repositoryKey: string | null = null
  let cyclePromise: Promise<void> | null = null
  let cyclePromiseKey: symbol | null = null
  let syncRequestedKey: symbol | null = null
  let syncRequested = false
  const scheduler = createSyncScheduler({ delayMs: 500, run: async () => flushNow() })

  let assetQueuePromise: Promise<LocalAssetSyncQueue> | null = null
  let assetQueuePromiseToken: object | null = null
  let assetQueueUserId: string | null = null
  let assetQueueDeviceId: string | null = null

  const authStore = useAuthStore()
  let syncScopeGeneration = 0

  interface StoreSyncScopeTicket extends SyncRequestScopeTicket {
    userId: string
    serverDeviceId: string
    sessionId: string
    generation: number
  }

  function createSyncScopeTicket(): StoreSyncScopeTicket | null {
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    const sessionId = authStore.sessionId
    if (!userId || !serverDeviceId || !sessionId) return null
    const generation = syncScopeGeneration
    const key = Symbol('core-sync-scope')
    return {
      key,
      userId,
      serverDeviceId,
      sessionId,
      generation,
      isCurrent: () => syncScopeGeneration === generation
        && authStore.isAuthenticated
        && authStore.user?.id === userId
        && authStore.serverDeviceId === serverDeviceId
        && authStore.sessionId === sessionId,
    }
  }

  let activeSyncScope = createSyncScopeTicket()

  function requireCurrentSyncScope(scope: StoreSyncScopeTicket): void {
    if (!scope.isCurrent()) throw new SyncScopeChangedError()
  }

  watch(
    () => ({ userId: authStore.user?.id, deviceId: authStore.serverDeviceId, sessionId: authStore.sessionId }),
    (newVal, oldVal) => {
      if (oldVal && (oldVal.userId !== newVal.userId || oldVal.deviceId !== newVal.deviceId || oldVal.sessionId !== newVal.sessionId)) {
        syncScopeGeneration += 1
        activeSyncScope = createSyncScopeTicket()
        syncRequestedKey = null
        syncRequested = false
        cursor.value = null
        resetRequired.value = false
        lastSyncError.value = null
        lastSyncErrorCode.value = null
        reviewSyncError.value = null
        isPushing.value = false
        isPulling.value = false
        if (oldVal.userId && oldVal.deviceId) {
          releaseLocalAssetSyncQueue(oldVal.userId, oldVal.deviceId)
        }
        if (assetQueueUserId === oldVal.userId && assetQueueDeviceId === oldVal.deviceId) {
          assetQueueUserId = null
          assetQueueDeviceId = null
          assetQueuePromise = null
          assetQueuePromiseToken = null
        }
      }
    },
    { flush: 'sync', deep: true }
  )

  function getAssetQueue(scope?: StoreSyncScopeTicket): Promise<LocalAssetSyncQueue> {
    const queueScope = scope ?? activeSyncScope
    const userId = queueScope?.userId
    const serverDeviceId = queueScope?.serverDeviceId
    if (!queueScope || !userId || !serverDeviceId) return Promise.reject(new Error('Sync requires an authenticated user and device'))
    requireCurrentSyncScope(queueScope)

    const isQueueCurrent = (): boolean => queueScope.isCurrent()
      && authStore.user?.id === userId
      && authStore.serverDeviceId === serverDeviceId

    if (assetQueueUserId !== userId || assetQueueDeviceId !== serverDeviceId || !assetQueuePromise) {
      if (assetQueueUserId && assetQueueDeviceId) {
        releaseLocalAssetSyncQueue(assetQueueUserId, assetQueueDeviceId)
      }
      assetQueueUserId = userId
      assetQueueDeviceId = serverDeviceId

      const currentToken = {}
      assetQueuePromiseToken = currentToken
      const p = (async () => {
        try {
          const assetRepository = await getLocalAssetRepository(userId, serverDeviceId)
          const rep = await getLocalRepository(userId, serverDeviceId)
          const assetService = getOrCreateLocalAssetService(assetRepository)
          const draftService = getOrCreateLocalSourceDraftService(assetRepository, rep)

          // Reconcile only the captured owner/device before starting its
          // upload queue.  Native reconciliation receives the DB allowlist,
          // marks missing/hash-mismatched rows CORRUPT, and quarantines
          // unexplained files without exposing paths to the UI.
          await assetService.reconcileLocalAssets()
          if (
            assetQueuePromiseToken !== currentToken ||
            !isQueueCurrent()
          ) {
            throw new QueueReleasedError()
          }

          const queue = await getOrCreateLocalAssetSyncQueue({
            assetRepository,
            assetService,
            draftService,
            api: {
              createUploadIntent: (data) => createUploadIntent(data, queueScope),
              uploadToObjectStorage,
              completeUpload: (assetId) => completeUpload(assetId, queueScope),
            },
            onWakeup: () => { if (isQueueCurrent()) requestBackgroundSync('write') },
          })

          if (
            assetQueuePromiseToken !== currentToken ||
            !isQueueCurrent()
          ) {
            releaseLocalAssetSyncQueue(userId, serverDeviceId)
            throw new QueueReleasedError()
          }

          return queue
        } catch (e) {
          if (assetQueuePromiseToken === currentToken) {
            assetQueuePromise = null
            assetQueuePromiseToken = null
            assetQueueUserId = null
            assetQueueDeviceId = null
          }
          throw e
        }
      })()
      assetQueuePromise = p
    }
    return assetQueuePromise
  }

  async function getRepository(scope?: StoreSyncScopeTicket): Promise<LocalRepository> {
    const userId = scope?.userId ?? authStore.user?.id
    const serverDeviceId = scope?.serverDeviceId ?? authStore.serverDeviceId
    if (!userId || !serverDeviceId) throw new Error('Sync requires an authenticated user and device')
    if (scope) requireCurrentSyncScope(scope)
    const key = `${userId}:${serverDeviceId}`
    if (!repository || repositoryKey !== key) {
      const nextRepository = await getLocalRepository(userId, serverDeviceId)
      if (scope) requireCurrentSyncScope(scope)
      repository = nextRepository
      repositoryKey = key
      const state = await repository.getSyncState()
      if (scope) requireCurrentSyncScope(scope)
      cursor.value = state.cursor
      resetRequired.value = state.resetRequired
    }
    return repository
  }

  async function reconcileOverviews(scope: StoreSyncScopeTicket): Promise<void> {
    if (!scope.isCurrent()) return
    const userId = scope.userId
    const serverDeviceId = scope.serverDeviceId
    const scopedRepository = await getRepository(scope)
    requireCurrentSyncScope(scope)
    const [sourceRows, subjectRows] = await Promise.all([
      scopedRepository.list<Record<string, unknown>>('SOURCE', { includeDeleted: false }),
      scopedRepository.list<Record<string, unknown>>('SUBJECT', { includeDeleted: false }),
    ])
    const isCurrent = (): boolean => scope.isCurrent()
    if (!isCurrent()) return
    const mapSources = (rows: typeof sourceRows): OverviewSyncSource[] => rows.flatMap(row => {
      const value = row.value
      if (!value || typeof value.id !== 'string' || typeof value.type !== 'string'
        || typeof value.subjectId !== 'string' || typeof value.ingestionStatus !== 'string') return []
      return [{
        id: value.id,
        type: value.type,
        subjectId: value.subjectId,
        ingestionStatus: value.ingestionStatus,
        ingestionRevision: typeof value.ingestionRevision === 'string' ? value.ingestionRevision : null,
        deletedAt: row.deletedAt,
      }]
    })
    const sources = mapSources(sourceRows)
    const subjectIds = subjectRows.flatMap(row => typeof row.id === 'string' ? [row.id] : [])
    const isSourceCurrent = async (expected: OverviewSyncSource): Promise<boolean> => {
      if (!isCurrent()) return false
      const row = await scopedRepository.read<Record<string, unknown>>('SOURCE', expected.id)
      const value = row?.value
      return isCurrent() && Boolean(row && !row.deletedAt && value && value.id === expected.id && value.type === 'FILE'
        && value.ingestionStatus === 'READY' && value.ingestionRevision === expected.ingestionRevision)
    }
    const isSubjectCurrent = async (subjectId: string): Promise<boolean> => {
      if (!isCurrent()) return false
      const row = await scopedRepository.read<Record<string, unknown>>('SUBJECT', subjectId)
      return isCurrent() && Boolean(row && !row.deletedAt && row.id === subjectId)
    }
    const getCurrentSources = async (): Promise<OverviewSyncSource[]> => {
      if (!isCurrent()) return []
      const rows = await scopedRepository.list<Record<string, unknown>>('SOURCE', { includeDeleted: false })
      return isCurrent() ? mapSources(rows) : []
    }
    const overviewRepository = await getOverviewRepository(userId,serverDeviceId)
    requireCurrentSyncScope(scope)
    if (!isCurrent()) return
    await reconcileOverviewResults(overviewRepository,{ sources, subjectIds, isCurrent, isSourceCurrent, isSubjectCurrent, getCurrentSources })
  }

  const overviewRealtimeHandler = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
    const type = (detail as Record<string, unknown>).type
    if (type !== 'OVERVIEW_UPDATED' && type !== 'REVIEW_UPDATED') return
    if (type === 'REVIEW_UPDATED') {
      const current = activeSyncScope
      const identity = detail as Record<string, unknown>
      if (!current || !current.isCurrent() || identity.userId !== current.userId
        || identity.deviceId !== current.serverDeviceId || identity.sessionId !== current.sessionId) return
    }
    // Pull the latest Subject/Source projection first; runCycle performs the
    // bounded Overview/Review reconciliation after that core snapshot is current.
    scheduler.request()
  }
  const overviewOnlineHandler = (): void => { requestBackgroundSync('online') }
  if (typeof window !== 'undefined') {
    window.addEventListener('auralis-realtime-event',overviewRealtimeHandler)
    window.addEventListener('online',overviewOnlineHandler)
    subscribeOverviewIntentCreated(window, detail => authStore.isAuthenticated && authStore.user?.id === detail.userId
      && authStore.serverDeviceId === detail.serverDeviceId, () => requestBackgroundSync('write'))
  }

  function publishUpdated(): void {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
    window.dispatchEvent(new CustomEvent('auralis-sync-updated'))
  }

  async function runCycle(scope: StoreSyncScopeTicket): Promise<void> {
    requireCurrentSyncScope(scope)
    const repositoryForSync = await getRepository(scope)
    requireCurrentSyncScope(scope)

    isPushing.value = true
    isPulling.value = true
    try {
      const assetQueue = await getAssetQueue(scope)
      requireCurrentSyncScope(scope)
      await assetQueue.wakeUp()
      requireCurrentSyncScope(scope)

      const result = await runSyncCycle({
        repository: repositoryForSync,
        api: useSyncApi,
        serverDeviceId: scope.serverDeviceId,
        scope,
        isCurrent: scope.isCurrent,
      })
      requireCurrentSyncScope(scope)
      cursor.value = result.cursor
      resetRequired.value = false
      if (result.changedResourceTypes.size > 0) {
        publishProjectionChange({ resourceTypes: result.changedResourceTypes })
        publishUpdated()
      }
      // This call is deliberately part of the completed core cycle: startup's
      // initial sync can finish before runtime event listeners are registered.
      try {
        await reconcileOverviews(scope)
      } catch (error) {
        if (!scope.isCurrent()) throw new SyncScopeChangedError()
        console.warn('[useSyncStore] Overview reconciliation deferred', error)
      }
      requireCurrentSyncScope(scope)

      try {
        const { ReviewSyncService } = await import('@/services/reviewSyncService')
        const { localDb } = await import('@/services/localDb')
        const reviewSync = new ReviewSyncService(localDb as any, repositoryForSync)
        const reviewResult = await reviewSync.syncAllPending(scope.userId, scope.serverDeviceId, scope)
        requireCurrentSyncScope(scope)
        reviewSyncError.value = reviewResult.protocolBlocked
          ? '复习数据仍保存在本机；服务器需要更新到复习同步协议 v2 后才能上传。'
          : reviewResult.conflictCount > 0
            ? '复习记录在其他设备发生变化；本机操作已保留，请联网后明确处理冲突。'
            : null
        publishProjectionChange({ resourceTypes: new Set(['REVIEW_STATE', 'STATS']) as any })
        publishUpdated()
      } catch (error) {
        if (!scope.isCurrent()) throw new SyncScopeChangedError()
        console.warn('[useSyncStore] Review sync deferred', error)
      }
      requireCurrentSyncScope(scope)

      // A previous failure remains visible until this complete cycle succeeds.
      lastSyncError.value = null
      lastSyncErrorCode.value = null
    } catch (error) {
      if (!scope.isCurrent()) {
        if (error instanceof QueueReleasedError) throw error
        throw new SyncScopeChangedError()
      }
      const safe = classifyClientError(error, 'SYNC')
      logClientError('[useSyncStore] sync failed', error, safe)
      lastSyncError.value = safe.message
      lastSyncErrorCode.value = safe.code
      // A rejected Subject repair persists reset_required before requesting
      // the snapshot. Reflect that durable state even when the request fails,
      // so the next cycle and the UI both remain on the reset path.
      const state = await repositoryForSync.getSyncState().catch(() => null)
      requireCurrentSyncScope(scope)
      if (state) {
        cursor.value = state.cursor
        resetRequired.value = state.resetRequired
      }
      throw error
    } finally {
      if (scope.isCurrent()) {
        isPushing.value = false
        isPulling.value = false
      }
    }
  }

  async function flushNow(): Promise<void> {
    if (!isOnline()) return
    const scope = activeSyncScope
    if (!scope || !scope.isCurrent() || !authStore.isAuthenticated) return
    if (cyclePromise && cyclePromiseKey === scope.key) {
      syncRequestedKey = scope.key
      syncRequested = true
      return cyclePromise
    }

    const scopeKey = scope.key
    const pending = Promise.resolve().then(async () => {
      try {
        do {
          requireCurrentSyncScope(scope)
          if (syncRequestedKey === scopeKey) {
            syncRequested = false
            syncRequestedKey = null
          }
          await runCycle(scope)
        } while (syncRequested && isOnline())
      } finally {
        if (cyclePromiseKey === scopeKey) {
          cyclePromise = null
          cyclePromiseKey = null
          if (syncRequestedKey === scopeKey) {
            syncRequested = false
            syncRequestedKey = null
          }
        }
      }
    })
    cyclePromiseKey = scopeKey
    cyclePromise = pending
    return pending
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

  async function resetOfflineData(): Promise<void> {
    const repositoryForSync = await getRepository()
    await repositoryForSync.resetOfflineStorage()
    cursor.value = null
    resetRequired.value = true
    publishProjectionChange({ resourceTypes: new Set(['SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'REVIEW_STATE']) })
    publishUpdated()
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
    lastSyncErrorCode,
    reviewSyncError,
    requestBackgroundSync,
    flushNow,
    triggerSync,
    pullChanges,
    pushChanges,
    resetOfflineData,
    initE2EE,
  }
})
