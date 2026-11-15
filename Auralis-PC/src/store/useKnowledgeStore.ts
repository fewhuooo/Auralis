import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useKnowledgeApi, type KnowledgeBlockCreateRequest, type KnowledgeBlockView } from '@/api/useKnowledgeApi'
import type { SourceView } from '@/api/useSourceApi'
import type { SubjectView } from '@/api/useSubjectApi'
import { getLocalRepository } from '@/services/localDb'
import { asKnowledgeBlockConflictSnapshot, LocalConflictError, type LocalRepository } from '@/services/localRepository'
import { mapKnowledgeBlockView, type KnowledgeBlockModel } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { publishProjectionChange, subscribeProjectionChange } from '@/services/localProjectionEvents'

export interface KnowledgeBlockConflict {
  blockId: string
  clientMutationId: string
  local: KnowledgeBlockModel
  remote: KnowledgeBlockModel
}

function asBlockDto(value: unknown): KnowledgeBlockView | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as KnowledgeBlockView
  return typeof candidate.id === 'string' ? candidate : null
}

function scheduleSync(): void {
  useSyncStore().requestBackgroundSync('write')
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const recentBlocks = ref<KnowledgeBlockModel[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const knowledgeBlockConflicts = ref<Record<string, KnowledgeBlockConflict>>({})
  const pendingKnowledgeBlockUpdates = ref<Record<string, boolean>>({})
  const authStore = useAuthStore()
  let visibleSubjectId: string | undefined
  let syncStatusRead = 0

  watch(() => authStore.loginGeneration, () => {
    visibleSubjectId = undefined
    recentBlocks.value = []
    isLoading.value = false
    lastError.value = null
    knowledgeBlockConflicts.value = {}
    pendingKnowledgeBlockUpdates.value = {}
  }, { flush: 'sync' })

  async function repository(): Promise<LocalRepository> {
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Knowledge blocks require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  async function readLocalBlocks(subjectId?: string): Promise<KnowledgeBlockModel[]> {
    const repo = await repository()
    const [rows, sourceRows, subjectRows] = await Promise.all([
      repo.list<KnowledgeBlockView>('KNOWLEDGE_BLOCK', { includeDeleted: false }),
      repo.list<SourceView>('SOURCE', { includeDeleted: false }),
      repo.list<SubjectView>('SUBJECT', { includeDeleted: false }),
    ])
    const sourceTitles = new Map(sourceRows.flatMap((row) => {
      const source = row.value
      return source?.id && source.title ? [[source.id, source.title] as const] : []
    }))
    const subjectNames = new Map(subjectRows.flatMap((row) => {
      const subject = row.value
      return subject?.id && subject.name ? [[subject.id, subject.name] as const] : []
    }))
    return rows
      .map((row) => asBlockDto(row.value))
      .filter((value): value is KnowledgeBlockView => value !== null && (!subjectId || value.subjectId === subjectId))
      .map((value) => mapKnowledgeBlockView(
        value,
        value.sourceId ? sourceTitles.get(value.sourceId) : undefined,
        value.subjectId ? subjectNames.get(value.subjectId) : undefined,
      ))
      .sort((a, b) => {
        const timeA = a.createdAt || a.time || ''
        const timeB = b.createdAt || b.time || ''
        return timeB.localeCompare(timeA)
      })
  }

  async function fetchBlocks(_subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    const generation = authStore.loginGeneration
    isLoading.value = true
    lastError.value = null
    try {
      const local = await loadLocalBlocks(_subject, subjectId)
      if (authStore.loginGeneration !== generation) return []
      useSyncStore().requestBackgroundSync('read')
      return local
    } finally {
      if (authStore.loginGeneration === generation) isLoading.value = false
    }
  }

  async function loadLocalBlocks(_subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    const generation = authStore.loginGeneration
    visibleSubjectId = subjectId
    const local = await readLocalBlocks(subjectId)
    if (authStore.loginGeneration !== generation) return []
    recentBlocks.value = local
    void refreshKnowledgeBlockSyncStatus()
    return local
  }

  subscribeProjectionChange((change) => {
    if (!authStore.isAuthenticated) return
    if (change.resourceTypes.has('KNOWLEDGE_BLOCK') || change.resourceTypes.has('SOURCE') || change.resourceTypes.has('SUBJECT')) {
      const generation = authStore.loginGeneration
      void loadLocalBlocks(undefined, visibleSubjectId).catch((error) => {
        if (authStore.loginGeneration === generation) console.warn('[Knowledge] Local projection refresh failed', error)
      })
    }
  })

  async function refreshKnowledgeBlockSyncStatus(): Promise<void> {
    const read = ++syncStatusRead
    const generation = authStore.loginGeneration
    if (!authStore.user?.id || !authStore.serverDeviceId) return
    try {
      const repo = await repository()
      const mutations = await repo.listUnresolved('KNOWLEDGE_BLOCK')
      const updates = mutations.filter((mutation) => mutation.mutationType === 'UPDATE')
      const pending = Object.fromEntries(updates.filter((mutation) =>
        mutation.status === 'pending' || mutation.status === 'inflight',
      ).map((mutation) => [mutation.resourceId, true]))
      const conflicts = new Map(updates.filter((mutation) =>
        (mutation.status === 'conflict' && mutation.error === 'RESOURCE_VERSION_CONFLICT')
        || (mutation.status === 'error' && mutation.error === 'RESOURCE_NOT_FOUND' && mutation.remoteVersion !== undefined),
      ).sort((a, b) => (a.remoteVersion ?? -1) - (b.remoteVersion ?? -1)
        || a.createdAt.localeCompare(b.createdAt) || a.clientMutationId.localeCompare(b.clientMutationId))
        .map((mutation) => [mutation.resourceId, mutation]))
      const entries = await Promise.all([...conflicts.values()].map(async (mutation) => {
        const remote = asKnowledgeBlockConflictSnapshot(mutation.remoteValue, mutation.resourceId)
        const local = await repo.read<KnowledgeBlockView>('KNOWLEDGE_BLOCK', mutation.resourceId)
        if (!remote || !local || local.deletedAt) return []
        const previous = knowledgeBlockConflicts.value[mutation.resourceId]
        return [[mutation.resourceId, {
          blockId: mutation.resourceId,
          clientMutationId: mutation.clientMutationId,
          local: mapKnowledgeBlockView(local.value),
          remote: previous?.clientMutationId === mutation.clientMutationId && previous.remote.version > remote.version
            ? previous.remote : mapKnowledgeBlockView(remote),
        } satisfies KnowledgeBlockConflict] as const]
      }))
      if (read !== syncStatusRead || generation !== authStore.loginGeneration) return
      knowledgeBlockConflicts.value = Object.fromEntries(entries.flat())
      pendingKnowledgeBlockUpdates.value = pending
    } catch (error) {
      if (generation === authStore.loginGeneration) console.warn('[Knowledge] Sync status read failed', error)
    }
  }

  async function addBlock(block: Partial<KnowledgeBlockModel> & { title: string; subjectId: string }): Promise<string> {
    const content = block.content || ''
    const payload: KnowledgeBlockCreateRequest = {
      baseVersion: 0,
      subjectId: block.subjectId,
      sourceId: block.sourceFileId,
      title: block.title,
      content,
      colorOverride: block.color,
    }
    const id = uuidv7()
    const localView: KnowledgeBlockView = {
      ...payload,
      id,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
    }
    const repo = await repository()
    await repo.commitMutation({
      resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, value: localView, version: 0, deletedAt: null,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, mutationType: 'CREATE', baseVersion: 0,
        payload: localView as unknown as Record<string, unknown>,
      }),
    })
    const subjectStore = useSubjectStore()
    const subjectName = subjectStore.subjects.find((s) => s.id === block.subjectId)?.name || block.subject
    const model = mapKnowledgeBlockView(localView, block.source, subjectName)
    recentBlocks.value = [model, ...recentBlocks.value]
    scheduleSync()
    return id
  }

  async function updateBlock(block: KnowledgeBlockModel): Promise<void> {
    const generation = authStore.loginGeneration
    const content = block.content || ''
    const payload: KnowledgeBlockCreateRequest = {
      baseVersion: block.version,
      subjectId: block.subjectId,
      sourceId: block.sourceFileId,
      title: block.title,
      content,
      colorOverride: block.color,
    }
    const repo = await repository()
    const localView: KnowledgeBlockView = {
      ...payload,
      id: block.id,
      version: block.version,
      createdAt: block.createdAt,
      updatedAt: new Date().toISOString(),
    }
    await repo.commitMutation({
      resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: localView, version: block.version, deletedAt: null,
      expectedLocalVersion: block.version,
      requireActiveResource: true,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, mutationType: 'UPDATE', baseVersion: block.version,
        payload: payload as unknown as Record<string, unknown>,
      }),
    })
    if (generation !== authStore.loginGeneration) return
    const subjectStore = useSubjectStore()
    const updatedSubjectName = subjectStore.subjects.find((s) => s.id === block.subjectId)?.name || block.subject
    recentBlocks.value = recentBlocks.value.map((item) => item.id === block.id ? mapKnowledgeBlockView(localView, block.source, updatedSubjectName) : item)
    void refreshKnowledgeBlockSyncStatus()
    scheduleSync()
  }

  async function removeBlock(id: string, expectedVersion: number): Promise<void> {
    const generation = authStore.loginGeneration
    const repo = await repository()
    const existing = await repo.read<KnowledgeBlockView>('KNOWLEDGE_BLOCK', id)
    if (!existing || existing.deletedAt || existing.version !== expectedVersion) {
      throw new LocalConflictError(existing, '知识块已删除或版本已变化。')
    }
    const now = new Date().toISOString()
    const localView: KnowledgeBlockView = {
      ...existing.value,
      updatedAt: now, deletedAt: now,
    }
    await repo.commitMutation({
      resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, value: localView, version: expectedVersion, deletedAt: now,
      expectedLocalVersion: expectedVersion,
      requireActiveResource: true,
      rejectIfNonPendingMutation: true,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, mutationType: 'DELETE', baseVersion: expectedVersion, payload: { id },
      }),
    })
    if (generation !== authStore.loginGeneration) return
    recentBlocks.value = recentBlocks.value.filter((item) => item.id !== id)
    scheduleSync()
  }

  async function resolveBlockConflict(conflict: KnowledgeBlockConflict, choice: 'REMOTE' | 'RETRY'): Promise<void> {
    const generation = authStore.loginGeneration
    const repo = await repository()
    const local = await repo.read<KnowledgeBlockView>('KNOWLEDGE_BLOCK', conflict.blockId)
    const selected = knowledgeBlockConflicts.value[conflict.blockId]
    if (generation !== authStore.loginGeneration || !local || !selected || selected.clientMutationId !== conflict.clientMutationId
      || local.version !== conflict.local.version || local.value.updatedAt !== conflict.local.updatedAt
      || selected.remote.version !== conflict.remote.version) {
      throw new LocalConflictError(local, '知识块状态已变化，请刷新后再处理同步冲突。')
    }
    const deletedSnapshot = conflict.remote.deletedAt && (await repo.listUnresolved('KNOWLEDGE_BLOCK'))
      .find((mutation) => mutation.clientMutationId === conflict.clientMutationId)?.remoteValue
    const remote = asKnowledgeBlockConflictSnapshot(deletedSnapshot || await useKnowledgeApi.get(conflict.blockId).catch(() => {
      throw new Error('无法读取当前云端知识块，本机修改已保留。')
    }), conflict.blockId)
    if (generation !== authStore.loginGeneration) return
    if (!remote) throw new Error('无法读取当前云端知识块，本机修改已保留。')
    if (remote.deletedAt && choice === 'RETRY') throw new Error('云端知识块已删除，本机修改已保留。')
    if (remote.version !== conflict.remote.version) {
      const current = knowledgeBlockConflicts.value[conflict.blockId]
      if (current?.clientMutationId === conflict.clientMutationId && remote.version > current.remote.version) {
        knowledgeBlockConflicts.value = { ...knowledgeBlockConflicts.value,
          [conflict.blockId]: { ...current, remote: mapKnowledgeBlockView(remote) } }
      }
      throw new Error('云端版本已变化，请核对后重试。')
    }
    await repo.resolveKnowledgeBlockConflict({
      blockId: conflict.blockId, clientMutationId: conflict.clientMutationId, local: local.value, remote,
      retryId: choice === 'RETRY' ? uuidv7() : undefined,
    })
    if (generation !== authStore.loginGeneration) return
    publishProjectionChange({ resourceTypes: new Set(['KNOWLEDGE_BLOCK']) })
    scheduleSync()
  }

  return {
    recentBlocks,
    isLoading,
    lastError,
    knowledgeBlockConflicts,
    pendingKnowledgeBlockUpdates,
    fetchBlocks,
    loadLocalBlocks,
    readLocalBlocks,
    addBlock,
    updateBlock,
    removeBlock,
    resolveBlockConflict,
  }
})
