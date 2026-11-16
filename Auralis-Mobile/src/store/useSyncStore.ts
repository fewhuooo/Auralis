import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SyncChange, SyncMutation, SyncSnapshotResponse } from '@/api/useSyncApi'
import { useSyncApi } from '@/api/useSyncApi'
import { localDb } from '@/services/localDb'
import { localDataScope } from '@/services/localDataScope'
import { fromServerTaskPayload, toServerTaskCommand } from '@/utils/taskSyncMapper'
import { uuidv7 } from '@/utils/uuid'
import { useAuthStore } from './useAuthStore'
import { useBlockStore } from './useBlockStore'
import { useSubjectStore } from './useSubjectStore'
import { useTaskStore } from './useTaskStore'

export const getClientId = () => uuidv7()

function cursorKey(): string {
  const auth = useAuthStore()
  return `cursor:${auth.user?.id || 'anonymous'}:${auth.serverDeviceId}`
}

function toServerMutation(row: any): SyncMutation {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
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
        ? toServerTaskCommand(payload, mutationType)
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

async function applyResource(resourceType: string, resourceId: string, mutationType: string, payload: any, version = 0) {
  const deleted = mutationType === 'DELETE' || payload?.deletedAt
  if (resourceType === 'SUBJECT') {
    if (deleted) await localDb.deleteSubject(resourceId)
    else {
      await localDb.saveSubject({
        ...payload,
        id: resourceId,
        icon: payload?.iconKey || payload?.icon || '',
        created_at: Date.parse(payload?.createdAt || '') || Date.now(),
        version: payload?.version ?? version,
      })
    }
    return
  }
  if (resourceType === 'SOURCE') {
    if (deleted) await localDb.deleteSourceFile(resourceId)
    else {
      await localDb.saveSourceFile({
        ...payload,
        id: resourceId,
        subject_id: payload?.subjectId,
        name: payload?.title || payload?.name || 'Untitled',
        file_path: payload?.uri || payload?.filePath || '',
        file_type: payload?.type || payload?.sourceType || payload?.mimeType || '',
        file_size: payload?.size || 0,
        created_at: Date.parse(payload?.createdAt || '') || Date.now(),
        version: payload?.version ?? version,
      })
    }
    return
  }
  if (resourceType === 'KNOWLEDGE_BLOCK' || resourceType === 'TASK') {
    const mappedPayload = resourceType === 'TASK'
      ? fromServerTaskPayload({ ...payload, id: resourceId }, version)
      : {
          ...payload,
          subject: payload?.subject || '',
          preview: payload?.content || '',
          source: payload?.source || '',
          color: payload?.colorOverride || '',
          sourceFileId: payload?.sourceId,
          sync_version: payload?.version ?? version,
        }
    await localDb.applyRemoteMutation({
      entityType: resourceType === 'TASK' ? 'task' : 'block',
      entityId: resourceId,
      action: deleted ? 'delete' : mutationType === 'RESTORE' ? 'update' : mutationType.toLowerCase(),
      payload: mappedPayload,
      createdAt: version,
    })
  }
}

async function applyChange(change: SyncChange): Promise<void> {
  if (!change.resourceId || !change.resourceType || !change.mutationType) return
  await applyResource(change.resourceType, change.resourceId, change.mutationType, change.payload || {}, change.version || 0)
}

async function applySnapshot(snapshot: SyncSnapshotResponse): Promise<void> {
  for (const subject of snapshot.subjects || []) {
    const value = subject as any
    if (value.id) await applyResource('SUBJECT', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, value.version)
  }
  for (const source of snapshot.sources || []) {
    const value = source as any
    if (value.id) await applyResource('SOURCE', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, value.version)
  }
  for (const block of snapshot.knowledgeBlocks || []) {
    const value = block as any
    if (value.id) await applyResource('KNOWLEDGE_BLOCK', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, value.version)
  }
  for (const task of snapshot.tasks || []) {
    const value = task as any
    if (value.id) await applyResource('TASK', value.id, value.deletedAt ? 'DELETE' : 'UPDATE', value, value.version)
  }
  await localDb.setMetadata(cursorKey(), snapshot.snapshotCursor || '')
}

export const useSyncStore = defineStore('sync', () => {
  const isSyncing = ref(false)
  const lastError = ref<string | null>(null)
  const lastSyncedAt = ref<string>('')
  const conflicts = ref<string[]>([])

  const checkOnline = (): Promise<boolean> => new Promise((resolve) => {
    uni.getNetworkType({
      success: ({ networkType }) => resolve(networkType !== 'none'),
      fail: () => resolve(true),
    })
  })

  const triggerSync = async () => {
    const auth = useAuthStore()
    if (isSyncing.value || !auth.isAuthenticated || !(await checkOnline())) return
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
    const serverDeviceId = auth.serverDeviceId
    const isCurrent = () => generation === auth.getLoginGeneration()
      && userId === auth.user?.id
      && serverDeviceId === auth.serverDeviceId

    isSyncing.value = true
    lastError.value = null
    try {
      let changed = false
      const storedCursor = await localDb.getMetadata(cursorKey())
      if (!isCurrent()) return
      if (!storedCursor) {
        const snapshot = await useSyncApi.snapshot()
        if (!isCurrent()) return
        await applySnapshot(snapshot)
        changed = true
      }

      const pending = await localDb.getUnsyncedMutations()
      if (!isCurrent()) return
      if (pending.length > 0) {
        const pushed = await useSyncApi.push({
          serverDeviceId: auth.serverDeviceId,
          mutations: pending.map(toServerMutation),
        })
        if (!isCurrent()) return
        const results = new Map((pushed.results || []).map(result => [result.clientMutationId, result]))
        conflicts.value = []
        for (const row of pending) {
          const result = results.get(String(row.client_id))
          if (result?.decision === 'APPLIED') {
            await localDb.markMutationSynced(row.id)
            if (result.resourceType && result.resourceId && result.mutationType && result.current) {
              await applyResource(result.resourceType, result.resourceId, result.mutationType, result.current, 0)
              changed = true
            }
          }
          if (result?.decision === 'CONFLICT' || result?.decision === 'REJECTED') {
            conflicts.value.push(String(row.client_id))
          }
        }
        if (pushed.serverCursor) await localDb.setMetadata(cursorKey(), pushed.serverCursor)
      }

      let cursor = await localDb.getMetadata(cursorKey())
      let hasMore = true
      while (hasMore) {
        const pulled = await useSyncApi.pull(cursor, 200)
        if (!isCurrent()) return
        if (pulled.resetRequired) {
          const snapshot = await useSyncApi.snapshot()
          if (!isCurrent()) return
          localDataScope.reset(auth.user!.id!, auth.serverDeviceId)
          await localDb.init()
          await applySnapshot(snapshot)
          changed = true
          break
        }
        for (const change of pulled.changes || []) {
          await applyChange(change)
          changed = true
        }
        cursor = pulled.nextCursor || cursor
        await localDb.setMetadata(cursorKey(), cursor || '')
        hasMore = Boolean(pulled.hasMore)
      }

      if (!isCurrent()) return
      if (changed) {
        await useSubjectStore().loadSubjects()
        await useBlockStore().loadLocalBlocks()
        await useTaskStore().loadLocalTasks()
      }
      lastSyncedAt.value = new Date().toISOString()
    } catch (error) {
      if (isCurrent()) {
        lastError.value = error instanceof Error ? error.message : String(error)
        console.error('[Mobile SyncStore] Synchronization failed:', error)
      }
    } finally {
      if (isCurrent()) isSyncing.value = false
    }
  }

  return { isSyncing, lastError, lastSyncedAt, conflicts, triggerSync }
})
