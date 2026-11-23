import type { SyncChange, SyncMutation, SyncSnapshotResponse, useSyncApi } from '../api/useSyncApi.ts'
import { fromServerBlockPayload, resolveBlockSyncVersion } from '../utils/blockSyncMapper.ts'
import { fromServerTaskPayload, toServerTaskCommand } from '../utils/taskSyncMapper.ts'
import { readAutoSyncPreference, writeAutoSyncPreference, type PreferenceStorage } from './syncPreferences.ts'

export interface SyncAuthSnapshot {
  isAuthenticated: boolean
  userId?: string | null
  serverDeviceId: string
  loginGeneration: symbol
}

export interface SyncControllerState {
  isSyncing: boolean
  isResettingOffline: boolean
  lastError: string | null
  lastSyncedAt: string
  conflicts: string[]
  pendingMutationCount: number
  autoSyncEnabled: boolean
}

export interface SyncLocalDbAdapter {
  init(): Promise<void>
  getMetadata(key: string): Promise<string | null>
  setMetadata(key: string, value: string): Promise<void>
  getUnsyncedMutations(): Promise<Array<{ id: number | string; client_id: string; entity_type: string; entity_id: string; action: string; payload: unknown }>>
  markMutationSynced(id: number | string, clientId?: string): Promise<void>
  setInFlightMutationIds?(ids: Array<number | string>): void
  rebasePendingMutations?(
    entityType: string,
    entityId: string,
    options: { appliedMutationType: string; serverVersion: number | null; deleted: boolean },
  ): Promise<void>
  saveSubject(subject: Record<string, unknown>): Promise<void>
  deleteSubject(id: string): Promise<void>
  saveSourceFile(file: Record<string, unknown>): Promise<void>
  deleteSourceFile(id: string): Promise<void>
  applyRemoteMutation(mutation: {
    entityType: 'task' | 'block'
    entityId: string
    action: string
    payload: unknown
    createdAt: number
  }): Promise<void>
}

export interface SyncControllerDeps {
  getAuth: () => SyncAuthSnapshot
  checkOnline: () => Promise<boolean>
  syncApi: Pick<typeof useSyncApi, 'push' | 'pull' | 'snapshot'>
  localDb: SyncLocalDbAdapter
  localDataScope: {
    current?: () => string
    reset: (userId: string, serverDeviceId: string) => string
  }
  prefStorage: PreferenceStorage
  onDataChanged: () => Promise<void>
  onLocalScopeReset?: (previousScope?: string) => Promise<void> | void
  onStateChange?: (state: SyncControllerState) => void
  onSyncCompleted?: () => void
  onTaskMutationRejected?: (taskIds: string[]) => void
  nowIso?: () => string
}

const RESOURCE_TYPE_MAP: Record<string, string> = {
  block: 'KNOWLEDGE_BLOCK',
  knowledge_block: 'KNOWLEDGE_BLOCK',
  task: 'TASK',
  subject: 'SUBJECT',
  source: 'SOURCE',
  relation: 'RELATION',
}

function toCanonicalResourceType(type: string): string {
  const key = String(type || '').toLowerCase()
  return RESOURCE_TYPE_MAP[key] || String(type || '').toUpperCase()
}

function resourceKey(resourceType: string, resourceId: string): string {
  return `${toCanonicalResourceType(resourceType)}:${resourceId}`
}

function extractServerVersion(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  const raw = record.version ?? record.syncVersion ?? record.sync_version
  if (raw === undefined || raw === null || raw === '') return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export function cursorKeyForAuth(userId: string | null | undefined, serverDeviceId: string): string {
  return `cursor:${userId || 'anonymous'}:${serverDeviceId}`
}

export function toServerMutation(row: {
  client_id: string
  entity_type: string
  entity_id: string
  action: string
  payload: unknown
}): SyncMutation {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as Record<string, unknown> | null)
  const resourceTypes: Record<string, SyncMutation['resourceType']> = {
    block: 'KNOWLEDGE_BLOCK',
    task: 'TASK',
    subject: 'SUBJECT',
    source: 'SOURCE',
    relation: 'RELATION',
  }
  const resourceType = resourceTypes[row.entity_type] || 'KNOWLEDGE_BLOCK'
  const mutationType = String(row.action).toUpperCase() as SyncMutation['mutationType']

  const command = resourceType === 'SUBJECT'
    ? {
        name: payload?.name,
        description: payload?.description,
        iconKey: payload?.icon,
        sortKey: payload?.sortKey || payload?.id,
      }
    : resourceType === 'SOURCE'
      ? {
          subjectId: payload?.subject_id || payload?.subjectId,
          type: payload?.type || 'TEXT',
          title: payload?.name || payload?.title,
          rawText: payload?.catalog_json || payload?.rawText || '',
          outline: payload?.catalog_json || payload?.outline || '',
        }
      : resourceType === 'TASK'
        ? toServerTaskCommand(payload || undefined, mutationType)
        : {
            subjectId: payload?.subjectId,
            sourceId: payload?.sourceFileId,
            title: payload?.title,
            content: payload?.preview || '',
            colorOverride: payload?.color,
          }

  return {
    clientMutationId: String(row.client_id),
    resourceType,
    resourceId: String(row.entity_id),
    mutationType,
    baseVersion: Number(payload?.version ?? payload?.sync_version ?? 0),
    payload: command as SyncMutation['payload'],
  }
}

export function createSyncController(deps: SyncControllerDeps) {
  const state: SyncControllerState = {
    isSyncing: false,
    isResettingOffline: false,
    lastError: null,
    lastSyncedAt: '',
    conflicts: [],
    pendingMutationCount: 0,
    autoSyncEnabled: readAutoSyncPreference(deps.prefStorage),
  }

  let activeSyncRun = 0
  let activeResetRun = 0

  function notify() {
    deps.onStateChange?.({
      ...state,
      conflicts: [...state.conflicts],
    })
  }

  async function applyResource(
    resourceType: string,
    resourceId: string,
    mutationType: string,
    payload: Record<string, unknown>,
    version = 0,
  ) {
    const deleted = mutationType === 'DELETE' || Boolean(payload?.deletedAt)
    if (resourceType === 'SUBJECT') {
      if (deleted) {
        await deps.localDb.deleteSubject(resourceId)
        return
      }
      await deps.localDb.saveSubject({
        ...payload,
        id: resourceId,
        icon: payload?.iconKey || payload?.icon || '',
        created_at: Date.parse(String(payload?.createdAt || '')) || Date.now(),
        version: payload?.version ?? version,
      })
      return
    }
    if (resourceType === 'SOURCE') {
      if (deleted) {
        await deps.localDb.deleteSourceFile(resourceId)
        return
      }
      const nextVersion = Number(payload?.version ?? version ?? 0)
      const fullSourcePayload = {
        ...payload,
        id: resourceId,
        version: Number.isFinite(nextVersion) ? nextVersion : 0,
      }
      await deps.localDb.saveSourceFile({
        ...fullSourcePayload,
        subject_id: payload?.subjectId,
        name: payload?.title || payload?.name || 'Untitled',
        file_path: payload?.originUrl || payload?.uri || payload?.filePath || payload?.assetId || '',
        file_type: payload?.type || payload?.sourceType || payload?.mimeType || '',
        file_size: Number(payload?.assetSizeBytes ?? payload?.size ?? 0) || 0,
        created_at: Date.parse(String(payload?.createdAt || '')) || Date.now(),
        payload_json: JSON.stringify(fullSourcePayload),
      })
      return
    }
    if (resourceType === 'KNOWLEDGE_BLOCK' || resourceType === 'TASK') {
      const resolvedVersion = resolveBlockSyncVersion(payload || {}, version)
      const mappedPayload = resourceType === 'TASK'
        ? fromServerTaskPayload({ ...payload, id: resourceId }, version)
        : fromServerBlockPayload(payload || {}, version)
      await deps.localDb.applyRemoteMutation({
        entityType: resourceType === 'TASK' ? 'task' : 'block',
        entityId: resourceId,
        action: deleted ? 'delete' : mutationType === 'RESTORE' ? 'update' : mutationType.toLowerCase(),
        payload: mappedPayload,
        createdAt: resolvedVersion,
      })
    }
  }

  async function applyChange(change: SyncChange): Promise<void> {
    if (!change.resourceId || !change.resourceType || !change.mutationType) return
    await applyResource(
      change.resourceType,
      change.resourceId,
      change.mutationType,
      (change.payload || {}) as Record<string, unknown>,
      change.version || 0,
    )
  }

  async function getProtectedResourceKeys(excludedClientIds?: Set<string>): Promise<Set<string>> {
    const pending = await deps.localDb.getUnsyncedMutations()
    const keys = new Set<string>()
    for (const row of pending) {
      if (excludedClientIds && excludedClientIds.has(String(row.client_id))) continue
      keys.add(resourceKey(row.entity_type, row.entity_id))
    }
    return keys
  }

  async function applySnapshot(
    snapshot: SyncSnapshotResponse,
    cursorStorageKey: string,
    protectedKeys: Set<string> = new Set(),
  ): Promise<void> {
    for (const subject of snapshot.subjects || []) {
      const value = subject as Record<string, unknown>
      if (typeof value.id === 'string' && !protectedKeys.has(resourceKey('SUBJECT', value.id))) {
        await applyResource('SUBJECT', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, Number(value.version || 0))
      }
    }
    for (const source of snapshot.sources || []) {
      const value = source as Record<string, unknown>
      if (typeof value.id === 'string' && !protectedKeys.has(resourceKey('SOURCE', value.id))) {
        await applyResource('SOURCE', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, Number(value.version || 0))
      }
    }
    for (const block of snapshot.knowledgeBlocks || []) {
      const value = block as Record<string, unknown>
      if (typeof value.id === 'string' && !protectedKeys.has(resourceKey('KNOWLEDGE_BLOCK', value.id))) {
        await applyResource('KNOWLEDGE_BLOCK', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, Number(value.version || 0))
      }
    }
    for (const task of snapshot.tasks || []) {
      const value = task as Record<string, unknown>
      if (typeof value.id === 'string' && !protectedKeys.has(resourceKey('TASK', value.id))) {
        await applyResource('TASK', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, Number(value.version || 0))
      }
    }
    await deps.localDb.setMetadata(cursorStorageKey, snapshot.snapshotCursor || '')
  }

  function resetSessionState(): void {
    activeSyncRun += 1
    activeResetRun += 1
    deps.localDb.setInFlightMutationIds?.([])
    state.isSyncing = false
    state.isResettingOffline = false
    state.lastError = null
    state.lastSyncedAt = ''
    state.conflicts = []
    state.pendingMutationCount = 0
    notify()
  }

  async function refreshPendingCount(): Promise<number> {
    const auth = deps.getAuth()
    if (!auth.isAuthenticated || !auth.userId) {
      state.pendingMutationCount = 0
      notify()
      return 0
    }
    const generation = auth.loginGeneration
    const userId = auth.userId
    const serverDeviceId = auth.serverDeviceId
    try {
      const pending = await deps.localDb.getUnsyncedMutations()
      const latest = deps.getAuth()
      if (
        generation !== latest.loginGeneration
        || userId !== latest.userId
        || serverDeviceId !== latest.serverDeviceId
        || !latest.isAuthenticated
      ) {
        return state.pendingMutationCount
      }
      state.pendingMutationCount = pending.length
      notify()
      return pending.length
    } catch {
      return state.pendingMutationCount
    }
  }

  async function triggerSync(manual = false): Promise<void> {
    const auth = deps.getAuth()
    if (!manual && !state.autoSyncEnabled) return
    if (state.isSyncing || state.isResettingOffline || !auth.isAuthenticated || !auth.userId || !auth.serverDeviceId) {
      return
    }

    const runId = ++activeSyncRun
    const generation = auth.loginGeneration
    const userId = auth.userId
    const serverDeviceId = auth.serverDeviceId
    const cursorStorageKey = cursorKeyForAuth(userId, serverDeviceId)
    const isCurrent = () => {
      const latest = deps.getAuth()
      return runId === activeSyncRun
        && latest.isAuthenticated
        && latest.loginGeneration === generation
        && latest.userId === userId
        && latest.serverDeviceId === serverDeviceId
    }

    state.isSyncing = true
    state.lastError = null
    notify()

    let changed = false
    let didRefreshPending = false
    let completedCleanly = false
    const rejectedTaskIds = new Set<string>()

    try {
      const online = await deps.checkOnline()
      if (!isCurrent()) return
      if (!online) {
        if (manual) {
          state.lastError = '当前处于离线状态，请联网后重试'
          notify()
        }
        return
      }

      const storedCursor = await deps.localDb.getMetadata(cursorStorageKey)
      if (!isCurrent()) return
      if (!storedCursor) {
        const snapshot = await deps.syncApi.snapshot()
        if (!isCurrent()) return
        const protectedKeys = await getProtectedResourceKeys()
        if (!isCurrent()) return
        await applySnapshot(snapshot, cursorStorageKey, protectedKeys)
        changed = true
      }

      const pending = await deps.localDb.getUnsyncedMutations()
      if (!isCurrent()) return
      state.conflicts = []
      const snapshotReconcileRows: Array<{ id: number | string; clientId: string }> = []

      if (pending.length > 0) {
        const seenEntities = new Set<string>()
        const pushBatch: typeof pending = []
        for (const row of pending) {
          const key = resourceKey(row.entity_type, row.entity_id)
          if (seenEntities.has(key)) continue
          seenEntities.add(key)
          pushBatch.push(row)
        }

        deps.localDb.setInFlightMutationIds?.(pushBatch.map(row => row.id))
        try {
          const pushed = await deps.syncApi.push({
            serverDeviceId,
            mutations: pushBatch.map(toServerMutation),
          })
          if (!isCurrent()) return
          const results = new Map((pushed.results || []).map(result => [result.clientMutationId, result]))
          for (const row of pushBatch) {
            const clientId = String(row.client_id)
            const result = results.get(clientId)
            if (!result || result.decision === 'PROCESSING') continue

            const entityKey = resourceKey(row.entity_type, row.entity_id)
            const currentObj = result.current && typeof result.current === 'object' && !Array.isArray(result.current)
              ? result.current as Record<string, unknown>
              : null
            const serverVersion = extractServerVersion(currentObj)

            if (result.decision === 'APPLIED') {
              await deps.localDb.markMutationSynced(row.id, clientId)
              if (!isCurrent()) return
              const remaining = await deps.localDb.getUnsyncedMutations()
              if (!isCurrent()) return
              const hasNewerLocal = remaining.some(m => resourceKey(m.entity_type, m.entity_id) === entityKey)
              const appliedType = result.mutationType || String(row.action).toUpperCase()
              const isDeleted = appliedType === 'DELETE' || Boolean(currentObj?.deletedAt)
              if (hasNewerLocal) {
                await deps.localDb.rebasePendingMutations?.(row.entity_type, row.entity_id, {
                  appliedMutationType: appliedType,
                  serverVersion,
                  deleted: isDeleted,
                })
                if (!isCurrent()) return
              } else if (result.resourceType && result.resourceId && result.mutationType && currentObj) {
                await applyResource(
                  result.resourceType,
                  result.resourceId,
                  result.mutationType,
                  currentObj,
                  serverVersion ?? 0,
                )
                changed = true
              }
              continue
            }

            if (result.decision === 'CONFLICT' || result.decision === 'REJECTED') {
              state.conflicts.push(clientId)
              const isDeletedCode = result.code === 'RESOURCE_NOT_FOUND' || result.code === 'RESOURCE_DELETED'
              const isCreate = String(result.mutationType || row.action).toUpperCase() === 'CREATE'
              if (result.decision === 'REJECTED' && !isDeletedCode && toCanonicalResourceType(row.entity_type) === 'TASK') {
                rejectedTaskIds.add(String(row.entity_id))
              }

              if (currentObj || isDeletedCode || isCreate) {
                await deps.localDb.markMutationSynced(row.id, clientId)
                if (!isCurrent()) return
                const remaining = await deps.localDb.getUnsyncedMutations()
                if (!isCurrent()) return
                const hasNewerLocal = remaining.some(m => resourceKey(m.entity_type, m.entity_id) === entityKey)
                if (hasNewerLocal) continue

                if (currentObj && result.resourceType && result.resourceId) {
                  await applyResource(
                    result.resourceType,
                    result.resourceId,
                    currentObj.deletedAt ? 'DELETE' : 'UPDATE',
                    currentObj,
                    serverVersion ?? 0,
                  )
                  changed = true
                } else if ((isDeletedCode || isCreate) && result.resourceType && result.resourceId) {
                  await applyResource(result.resourceType, result.resourceId, 'DELETE', {}, 0)
                  changed = true
                }
              } else {
                const remaining = await deps.localDb.getUnsyncedMutations()
                if (!isCurrent()) return
                const hasNewerLocal = remaining.some(
                  m => resourceKey(m.entity_type, m.entity_id) === entityKey && String(m.client_id) !== clientId,
                )
                if (hasNewerLocal) {
                  await deps.localDb.markMutationSynced(row.id, clientId)
                  if (!isCurrent()) return
                } else {
                  snapshotReconcileRows.push({ id: row.id, clientId })
                }
              }
            }
          }
        } finally {
          if (runId === activeSyncRun) {
            deps.localDb.setInFlightMutationIds?.([])
          }
        }
      }

      if (snapshotReconcileRows.length > 0) {
        const snapshot = await deps.syncApi.snapshot()
        if (!isCurrent()) return
        const deferredClientIds = new Set(snapshotReconcileRows.map(item => item.clientId))
        const protectedKeys = await getProtectedResourceKeys(deferredClientIds)
        if (!isCurrent()) return
        await applySnapshot(snapshot, cursorStorageKey, protectedKeys)
        if (!isCurrent()) return
        changed = true
        for (const item of snapshotReconcileRows) {
          await deps.localDb.markMutationSynced(item.id, item.clientId)
          if (!isCurrent()) return
        }
      }

      let cursor = await deps.localDb.getMetadata(cursorStorageKey)
      let hasMore = true
      while (hasMore) {
        const pulled = await deps.syncApi.pull(cursor, 200)
        if (!isCurrent()) return
        if (pulled.resetRequired) {
          const snapshot = await deps.syncApi.snapshot()
          if (!isCurrent()) return
          const previousScope = deps.localDataScope.current?.()
          deps.localDataScope.reset(userId, serverDeviceId)
          await deps.localDb.init()
          if (!isCurrent()) return
          await deps.onLocalScopeReset?.(previousScope)
          const protectedKeys = await getProtectedResourceKeys()
          if (!isCurrent()) return
          await applySnapshot(snapshot, cursorStorageKey, protectedKeys)
          changed = true
          break
        }
        const protectedKeys = await getProtectedResourceKeys()
        if (!isCurrent()) return
        for (const change of pulled.changes || []) {
          if (change.resourceId && change.resourceType && protectedKeys.has(resourceKey(change.resourceType, change.resourceId))) {
            continue
          }
          await applyChange(change)
          changed = true
        }
        cursor = pulled.nextCursor || cursor
        await deps.localDb.setMetadata(cursorStorageKey, cursor || '')
        hasMore = Boolean(pulled.hasMore)
      }

      if (!isCurrent()) return
      if (changed) {
        await deps.onDataChanged()
        changed = false
      }
      if (!isCurrent()) return
      await refreshPendingCount()
      didRefreshPending = true
      if (!isCurrent()) return
      state.lastSyncedAt = deps.nowIso ? deps.nowIso() : new Date().toISOString()
      completedCleanly = state.conflicts.length === 0
      notify()
    } catch (error) {
      if (isCurrent()) {
        state.lastError = error instanceof Error ? error.message : String(error)
        notify()
      }
    } finally {
      if (changed && isCurrent()) {
        try {
          await deps.onDataChanged()
        } catch {
          // Keep syncing lock release safe if store reload fails on partial failure recovery
        }
      }
      if (!didRefreshPending && isCurrent()) {
        await refreshPendingCount()
      }
      if (runId === activeSyncRun) {
        deps.localDb.setInFlightMutationIds?.([])
        state.isSyncing = false
        notify()
      }
      if (rejectedTaskIds.size > 0 && isCurrent()) {
        deps.onTaskMutationRejected?.([...rejectedTaskIds])
      }
      if (completedCleanly && isCurrent()) {
        deps.onSyncCompleted?.()
      }
    }
  }

  function setAutoSyncEnabled(enabled: boolean): void {
    state.autoSyncEnabled = writeAutoSyncPreference(deps.prefStorage, enabled)
    notify()
    if (enabled) {
      void triggerSync(false)
    }
  }

  async function resetOfflineData(): Promise<void> {
    const auth = deps.getAuth()
    if (!auth.isAuthenticated || !auth.userId || !auth.serverDeviceId) {
      throw new Error('当前未登录，无法重置本地数据')
    }
    if (state.isSyncing || state.isResettingOffline) {
      throw new Error('正在同步中，请稍后再试')
    }

    const resetId = ++activeResetRun
    const generation = auth.loginGeneration
    const userId = auth.userId
    const serverDeviceId = auth.serverDeviceId
    const isCurrent = () => {
      const latest = deps.getAuth()
      return resetId === activeResetRun
        && latest.isAuthenticated
        && latest.loginGeneration === generation
        && latest.userId === userId
        && latest.serverDeviceId === serverDeviceId
    }

    state.isResettingOffline = true
    notify()

    try {
      const previousScope = deps.localDataScope.current?.()
      deps.localDataScope.reset(userId, serverDeviceId)
      state.conflicts = []
      state.lastError = null
      state.lastSyncedAt = ''
      state.pendingMutationCount = 0
      notify()

      await deps.localDb.init()
      if (!isCurrent()) return
      await deps.onLocalScopeReset?.(previousScope)
      if (!isCurrent()) return
      await deps.onDataChanged()
    } finally {
      if (resetId === activeResetRun) {
        state.isResettingOffline = false
        notify()
      }
    }

    if (isCurrent()) {
      await triggerSync(true)
    }
  }

  return {
    getState: () => ({ ...state, conflicts: [...state.conflicts] }),
    triggerSync,
    syncNow: () => triggerSync(true),
    setAutoSyncEnabled,
    resetOfflineData,
    refreshPendingCount,
    resetSessionState,
  }
}
