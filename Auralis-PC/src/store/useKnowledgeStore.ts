import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useKnowledgeApi, type KnowledgeBlockCreateRequest, type KnowledgeBlockView } from '@/api/useKnowledgeApi'
import { getLocalRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { mapKnowledgeBlockView, nextPageCursor, type KnowledgeBlockModel } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'
import { createStableMutation, isOfflineTransportFailure } from '@/services/offlineWritePolicy'

function asBlockDto(value: unknown): KnowledgeBlockView | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as KnowledgeBlockView
  return typeof candidate.id === 'string' ? candidate : null
}

function scheduleSync(): void {
  void useSyncStore().triggerSync().catch((error) => console.warn('[KnowledgeStore] pending mutation sync failed', error))
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const recentBlocks = ref<KnowledgeBlockModel[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Knowledge blocks require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  async function cache(view: KnowledgeBlockView, syncStatus: 'synced' | 'pending' | 'conflict' | 'error' = 'synced'): Promise<KnowledgeBlockModel> {
    const repo = await repository()
    await repo.upsert('KNOWLEDGE_BLOCK', String(view.id), view, {
      version: Number(view.version ?? 0),
      deletedAt: view.deletedAt ?? null,
      syncStatus,
    })
    return mapKnowledgeBlockView(view)
  }

  async function localBlocks(subjectId?: string): Promise<KnowledgeBlockModel[]> {
    const repo = await repository()
    const rows = await repo.list<KnowledgeBlockView>('KNOWLEDGE_BLOCK', { includeDeleted: false })
    return rows
      .map((row) => asBlockDto(row.value))
      .filter((value): value is KnowledgeBlockView => value !== null && (!subjectId || value.subjectId === subjectId))
      .map(mapKnowledgeBlockView)
  }

  async function refreshBlocks(subjectId?: string): Promise<void> {
    try {
      const loaded: KnowledgeBlockModel[] = []
      let cursor: string | undefined
      let hasMore = true
      while (hasMore) {
        const page = await useKnowledgeApi.list({ cursor, limit: 100 })
        for (const item of page.items ?? []) {
          if (!item.id || (subjectId && item.subjectId !== subjectId)) continue
          loaded.push(await cache(item))
        }
        cursor = nextPageCursor(page)
        hasMore = Boolean(cursor)
      }
      const repo = await repository()
      const pending = (await repo.list<KnowledgeBlockView>('KNOWLEDGE_BLOCK', { includeDeleted: false }))
        .filter((row) => row.syncStatus !== 'synced')
        .map((row) => asBlockDto(row.value))
        .filter((value): value is KnowledgeBlockView => value !== null)
        .map(mapKnowledgeBlockView)
      const merged = [...loaded, ...pending.filter((item) => !loaded.some((loadedItem) => loadedItem.id === item.id))]
      recentBlocks.value = merged
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '知识块加载失败，当前使用离线缓存'
      if (!isOfflineTransportFailure(error)) console.warn('[KnowledgeStore] background block refresh failed', error)
    }
  }

  async function fetchBlocks(_subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    isLoading.value = true
    lastError.value = null
    try {
      const local = await localBlocks(subjectId)
      recentBlocks.value = local
      void refreshBlocks(subjectId)
      return local
    } finally {
      isLoading.value = false
    }
  }

  async function loadLocalBlocks(_subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    const local = await localBlocks(subjectId)
    recentBlocks.value = local
    return local
  }

  async function addBlock(block: Partial<KnowledgeBlockModel> & { title: string; subjectId: string }): Promise<string> {
    const payload: KnowledgeBlockCreateRequest = {
      baseVersion: 0,
      subjectId: block.subjectId,
      sourceId: block.sourceFileId,
      title: block.title,
      summary: block.preview || '',
      content: block.content || block.preview || '',
      tags: block.tags || [],
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
    await repo.upsert('KNOWLEDGE_BLOCK', id, localView, { version: 0, syncStatus: 'pending' })
    await repo.enqueueMutation(createStableMutation({
      clientMutationId: uuidv7(),
      resourceType: 'KNOWLEDGE_BLOCK',
      resourceId: id,
      mutationType: 'CREATE',
      baseVersion: 0,
      payload: localView as unknown as Record<string, unknown>,
    }))
    scheduleSync()
    const model = mapKnowledgeBlockView(localView)
    recentBlocks.value = [model, ...recentBlocks.value]
    return id
  }

  async function updateBlock(block: KnowledgeBlockModel): Promise<void> {
    const payload: KnowledgeBlockCreateRequest = {
      baseVersion: block.version,
      subjectId: block.subjectId,
      sourceId: block.sourceFileId,
      title: block.title,
      summary: block.preview,
      content: block.content,
      tags: block.tags,
      colorOverride: block.color,
    }
    const repo = await repository()
    await repo.upsert('KNOWLEDGE_BLOCK', block.id, {
      ...payload,
      id: block.id,
      version: block.version,
      createdAt: block.createdAt,
      updatedAt: new Date().toISOString(),
      deletedAt: block.deletedAt,
    }, { version: block.version, syncStatus: 'pending' })
    await repo.enqueueMutation(createStableMutation({
      clientMutationId: uuidv7(),
      resourceType: 'KNOWLEDGE_BLOCK',
      resourceId: block.id,
      mutationType: 'UPDATE',
      baseVersion: block.version,
      payload: payload as unknown as Record<string, unknown>,
    }))
    scheduleSync()
    recentBlocks.value = recentBlocks.value.map((item) => item.id === block.id ? { ...block } : item)
  }

  async function removeBlock(id: string): Promise<void> {
    const block = recentBlocks.value.find((item) => item.id === id)
    if (!block) return
    const repo = await repository()
    await repo.tombstone('KNOWLEDGE_BLOCK', id, { version: block.version, syncStatus: 'pending' })
    await repo.enqueueMutation(createStableMutation({
      clientMutationId: uuidv7(),
      resourceType: 'KNOWLEDGE_BLOCK',
      resourceId: id,
      mutationType: 'DELETE',
      baseVersion: block.version,
      payload: { id },
    }))
    scheduleSync()
    recentBlocks.value = recentBlocks.value.filter((item) => item.id !== id)
  }

  return {
    recentBlocks,
    isLoading,
    lastError,
    fetchBlocks,
    loadLocalBlocks,
    addBlock,
    updateBlock,
    removeBlock,
  }
})
