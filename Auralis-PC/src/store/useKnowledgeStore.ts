import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { type KnowledgeBlockCreateRequest, type KnowledgeBlockView } from '@/api/useKnowledgeApi'
import type { SourceView } from '@/api/useSourceApi'
import type { SubjectView } from '@/api/useSubjectApi'
import { getLocalRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { mapKnowledgeBlockView, type KnowledgeBlockModel } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { subscribeProjectionChange } from '@/services/localProjectionEvents'

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
  let visibleSubjectId: string | undefined

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Knowledge blocks require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  async function localBlocks(subjectId?: string): Promise<KnowledgeBlockModel[]> {
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
  }

  async function fetchBlocks(_subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    isLoading.value = true
    lastError.value = null
    try {
      visibleSubjectId = subjectId
      const local = await localBlocks(visibleSubjectId)
      recentBlocks.value = local
      useSyncStore().requestBackgroundSync('read')
      return local
    } finally {
      isLoading.value = false
    }
  }

  async function loadLocalBlocks(_subject?: string, subjectId?: string): Promise<KnowledgeBlockModel[]> {
    visibleSubjectId = subjectId
    const local = await localBlocks(visibleSubjectId)
    recentBlocks.value = local
    return local
  }

  subscribeProjectionChange((change) => {
    if (change.resourceTypes.has('KNOWLEDGE_BLOCK') || change.resourceTypes.has('SOURCE') || change.resourceTypes.has('SUBJECT')) {
      void localBlocks(visibleSubjectId).then((blocks) => { recentBlocks.value = blocks })
    }
  })

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
    await repo.commitMutation({
      resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, value: localView, version: 0, deletedAt: null,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, mutationType: 'CREATE', baseVersion: 0,
        payload: localView as unknown as Record<string, unknown>,
      }),
    })
    const model = mapKnowledgeBlockView(localView, block.source, block.subject)
    recentBlocks.value = [model, ...recentBlocks.value]
    scheduleSync()
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
    const localView: KnowledgeBlockView = {
      ...payload,
      id: block.id,
      version: block.version,
      createdAt: block.createdAt,
      updatedAt: new Date().toISOString(),
      deletedAt: block.deletedAt ?? undefined,
    }
    await repo.commitMutation({
      resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, value: localView, version: block.version, deletedAt: block.deletedAt,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'KNOWLEDGE_BLOCK', resourceId: block.id, mutationType: 'UPDATE', baseVersion: block.version,
        payload: payload as unknown as Record<string, unknown>,
      }),
    })
    recentBlocks.value = recentBlocks.value.map((item) => item.id === block.id ? mapKnowledgeBlockView(localView, block.source, block.subject) : item)
    scheduleSync()
  }

  async function removeBlock(id: string): Promise<void> {
    const block = recentBlocks.value.find((item) => item.id === id)
    if (!block) return
    const repo = await repository()
    const existing = await repo.read<KnowledgeBlockView>('KNOWLEDGE_BLOCK', id)
    const now = new Date().toISOString()
    const localView: KnowledgeBlockView = {
      ...(existing?.value ?? { id, subjectId: block.subjectId, title: block.title }),
      id, version: block.version, updatedAt: now, deletedAt: now,
    }
    await repo.commitMutation({
      resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, value: localView, version: block.version, deletedAt: now,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'KNOWLEDGE_BLOCK', resourceId: id, mutationType: 'DELETE', baseVersion: block.version, payload: { id },
      }),
    })
    recentBlocks.value = recentBlocks.value.filter((item) => item.id !== id)
    scheduleSync()
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
