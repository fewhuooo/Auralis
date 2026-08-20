import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSourceApi, type SourceCreateRequest, type SourceView } from '@/api/useSourceApi'
import { getLocalRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { mapSourceView, nextPageCursor, type SourceFileModel } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'

function isOfflineLike(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    return !Number.isFinite(status) || status >= 500
  }
  return true
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function asSourceDto(value: unknown): SourceView | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as SourceView
  return typeof candidate.id === 'string' ? candidate : null
}

function scheduleSync(): void {
  void useSyncStore().triggerSync().catch((error) => console.warn('[SourceStore] pending mutation sync failed', error))
}

export const useSourceStore = defineStore('source', () => {
  const sources = ref<SourceFileModel[]>([])
  const activeSourceFiles = ref<SourceFileModel[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.deviceId) throw new Error('Sources require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.deviceId)
  }

  async function cache(view: SourceView, syncStatus: 'synced' | 'pending' | 'conflict' | 'error' = 'synced'): Promise<SourceFileModel> {
    const repo = await repository()
    await repo.upsert('SOURCE', String(view.id), view, {
      version: Number(view.version ?? 0),
      deletedAt: view.deletedAt ?? null,
      syncStatus,
    })
    return mapSourceView(view)
  }

  async function readLocal(subjectId?: string): Promise<SourceFileModel[]> {
    const repo = await repository()
    const rows = await repo.list<SourceView>('SOURCE', { includeDeleted: false })
    return rows
      .map((row) => asSourceDto(row.value))
      .filter((value): value is SourceView => value !== null && (!subjectId || value.subjectId === subjectId))
      .map(mapSourceView)
  }

  async function loadSources(): Promise<SourceFileModel[]> {
    isLoading.value = true
    lastError.value = null
    try {
      const loaded: SourceFileModel[] = []
      let cursor: string | undefined
      let hasMore = true
      while (hasMore) {
        const page = await useSourceApi.list({ cursor, limit: 100 })
        for (const item of page.items ?? []) {
          if (item.id) loaded.push(await cache(item))
        }
        cursor = nextPageCursor(page)
        hasMore = Boolean(cursor)
      }
      const repo = await repository()
      const pending = (await repo.list<SourceView>('SOURCE', { includeDeleted: false }))
        .filter((row) => row.syncStatus !== 'synced')
        .map((row) => asSourceDto(row.value))
        .filter((value): value is SourceView => value !== null)
        .map(mapSourceView)
      const merged = [...loaded, ...pending.filter((item) => !loaded.some((loadedItem) => loadedItem.id === item.id))]
      sources.value = merged
      activeSourceFiles.value = activeSourceFiles.value.length
        ? merged.filter((source) => source.subjectId === activeSourceFiles.value[0]?.subjectId)
        : merged
      return merged
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      lastError.value = error instanceof Error ? error.message : '资料加载失败，当前使用离线缓存'
      const local = await readLocal()
      sources.value = local
      activeSourceFiles.value = activeSourceFiles.value.length
        ? local.filter((source) => source.subjectId === activeSourceFiles.value[0]?.subjectId)
        : local
      return local
    } finally {
      isLoading.value = false
    }
  }

  async function loadSourceFiles(subjectId: string): Promise<SourceFileModel[]> {
    activeSourceFiles.value = activeSourceFiles.value.filter((source) => source.subjectId === subjectId)
    try {
      await loadSources()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '资料加载失败'
    }
    const filtered = sources.value.filter((source) => source.subjectId === subjectId)
    activeSourceFiles.value = filtered
    return filtered
  }

  async function createFileSource(subjectId: string, title: string, assetId: string, outline = '[]'): Promise<string> {
    if (!isUuid(assetId)) throw new Error('创建文件资料前必须先完成 Asset 上传')
    const payload: SourceCreateRequest = {
      baseVersion: 0,
      subjectId,
      type: 'FILE',
      title,
      assetId,
      outline,
    }
    try {
      const view = await useSourceApi.create(payload)
      await cache(view)
      await loadSourceFiles(subjectId)
      return String(view.id)
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      const id = uuidv7()
      const localView: SourceView = {
        ...payload,
        id,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: undefined,
        ingestionStatus: 'PENDING',
      }
      const repo = await repository()
      await repo.upsert('SOURCE', id, localView, { version: 0, syncStatus: 'pending' })
      await repo.enqueueMutation({
        clientMutationId: uuidv7(),
        resourceType: 'SOURCE',
        resourceId: id,
        mutationType: 'CREATE',
        baseVersion: 0,
        payload: localView as unknown as Record<string, unknown>,
      })
      scheduleSync()
      await loadSourceFiles(subjectId)
      return id
    }
  }

  async function addSourceFile(subjectId: string, name: string, filePath: string, _fileType: string, _fileSize: number, catalogJson = '[]'): Promise<string> {
    return createFileSource(subjectId, name, filePath, catalogJson)
  }

  async function deleteSourceFile(id: string): Promise<void> {
    const source = sources.value.find((item) => item.id === id) || activeSourceFiles.value.find((item) => item.id === id)
    if (!source) return
    try {
      await useSourceApi.delete(id, { baseVersion: source.version })
      const repo = await repository()
      await repo.tombstone('SOURCE', id, { version: source.version, syncStatus: 'synced' })
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      const repo = await repository()
      await repo.tombstone('SOURCE', id, { version: source.version, syncStatus: 'pending' })
      await repo.enqueueMutation({
        clientMutationId: uuidv7(),
        resourceType: 'SOURCE',
        resourceId: id,
        mutationType: 'DELETE',
        baseVersion: source.version,
        payload: { id },
      })
      scheduleSync()
    }
    sources.value = sources.value.filter((item) => item.id !== id)
    activeSourceFiles.value = activeSourceFiles.value.filter((item) => item.id !== id)
  }

  async function saveSourceFileCatalog(file: SourceFileModel): Promise<void> {
    if (!file.assetId) throw new Error('资料缺少关联 Asset，无法保存目录')
    const payload: SourceCreateRequest = {
      baseVersion: file.version,
      subjectId: file.subjectId,
      type: 'FILE',
      title: file.name,
      assetId: file.assetId,
      outline: file.catalogJson,
    }
    try {
      const view = await useSourceApi.update(file.id, payload)
      await cache(view)
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      const repo = await repository()
      const localView: SourceView = {
        id: file.id,
        subjectId: file.subjectId,
        type: 'FILE',
        title: file.name,
        assetId: file.assetId,
        outline: file.catalogJson,
        version: file.version,
        createdAt: file.createdAt,
        updatedAt: new Date().toISOString(),
        deletedAt: file.deletedAt ?? undefined,
        ingestionStatus: file.ingestionStatus,
      }
      await repo.upsert('SOURCE', file.id, localView, { version: file.version, syncStatus: 'pending' })
      await repo.enqueueMutation({
        clientMutationId: uuidv7(),
        resourceType: 'SOURCE',
        resourceId: file.id,
        mutationType: 'UPDATE',
        baseVersion: file.version,
        payload: { outline: file.catalogJson },
      })
      scheduleSync()
    }
    await loadSourceFiles(file.subjectId)
  }

  const currentSourceCount = computed(() => sources.value.length)

  return {
    sources,
    activeSourceFiles,
    currentSourceCount,
    isLoading,
    lastError,
    loadSources,
    loadSourceFiles,
    createFileSource,
    addSourceFile,
    deleteSourceFile,
    saveSourceFileCatalog,
  }
})
