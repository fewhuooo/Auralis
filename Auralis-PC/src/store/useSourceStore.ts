import { computed, ref } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSourceApi, type SourceCreateRequest, type SourceView } from '@/api/useSourceApi'
import { getLocalRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { isClientFileSource, mapSourceView, nextPageCursor, sortSources, type SourceFileModel } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'
import { createStableMutation, isOfflineTransportFailure } from '@/services/offlineWritePolicy'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function asSourceDto(value: unknown): SourceView | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as SourceView
  return typeof candidate.id === 'string' ? candidate : null
}

function scheduleSync(): void {
  void useSyncStore().triggerSync().catch((error) => {
    console.warn('[SourceStore] pending mutation sync failed', error)
  })
}

interface SourceDocumentScheduler {
  schedule(sourceId: string): Promise<unknown>
  discard(sourceId: string): Promise<void>
}

let documentScheduler: SourceDocumentScheduler | null = null

export const useSourceStore = defineStore('source', () => {
  const sources = ref<SourceFileModel[]>([])
  const activeSourceFiles = ref<SourceFileModel[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Sources require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  async function cache(view: SourceView, syncStatus: 'synced' | 'pending' | 'conflict' | 'error' = 'synced'): Promise<SourceFileModel> {
    const repo = await repository()
    await repo.upsert('SOURCE', String(view.id), view, {
      version: Number(view.version ?? 0),
      deletedAt: view.deletedAt ?? null,
      syncStatus,
    })
    const model = mapSourceView(view)
    if (documentScheduler && isClientFileSource(view) && view.ingestionStatus === 'AWAITING_CLIENT') {
      void documentScheduler.schedule(model.id).catch((error) => console.warn('[SourceStore] document scheduling failed', error))
    }
    return model
  }

  async function readLocal(subjectId?: string): Promise<SourceFileModel[]> {
    const repo = await repository()
    const rows = await repo.list<SourceView>('SOURCE', { includeDeleted: false })
    return sortSources(rows
      .map((row) => asSourceDto(row.value))
      .filter((value): value is SourceView => value !== null && (!subjectId || value.subjectId === subjectId))
      .map(mapSourceView))
  }

  function replaceSources(models: SourceFileModel[], subjectIdToFocus?: string): void {
    const sorted = sortSources(models)
    sources.value = sorted
    const focusId = subjectIdToFocus ?? activeSourceFiles.value[0]?.subjectId
    if (focusId) {
      activeSourceFiles.value = sorted.filter((source) => source.subjectId === focusId)
    } else {
      activeSourceFiles.value = sorted
    }
  }

  async function refreshSources(): Promise<void> {
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
      replaceSources(merged)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '资料加载失败，当前使用离线缓存'
      if (!isOfflineTransportFailure(error)) console.warn('[SourceStore] background source refresh failed', error)
    }
  }

  async function loadSources(): Promise<SourceFileModel[]> {
    isLoading.value = true
    lastError.value = null
    try {
      const local = await readLocal()
      replaceSources(local)
      void refreshSources()
      return local
    } finally {
      isLoading.value = false
    }
  }

  async function loadSourceFiles(subjectId: string): Promise<SourceFileModel[]> {
    const local = await loadLocalSourceFiles(subjectId)
    void refreshSources()
    return local
  }

  async function loadLocalSourceFiles(subjectId: string): Promise<SourceFileModel[]> {
    const local = await readLocal(subjectId)
    replaceSources([
      ...sources.value.filter((source) => source.subjectId !== subjectId),
      ...local,
    ], subjectId)
    return activeSourceFiles.value
  }

  async function createFileSource(
    subjectId: string,
    title: string,
    assetId: string,
    outline = '[]',
    assetSizeBytes?: number,
  ): Promise<string> {
    if (!isUuid(assetId)) throw new Error('创建文件资料前必须先完成 Asset 上传')
    const normalizedAssetSizeBytes = typeof assetSizeBytes === 'number'
      && Number.isFinite(assetSizeBytes)
      && assetSizeBytes >= 0
      ? Math.trunc(assetSizeBytes)
      : undefined
    const payload: SourceCreateRequest = {
      baseVersion: 0,
      subjectId,
      type: 'FILE',
      title,
      assetId,
      outline,
    }
    const id = uuidv7()
    const localView: SourceView = {
      ...payload,
      id,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
      ingestionStatus: 'AWAITING_CLIENT',
      assetSizeBytes: normalizedAssetSizeBytes,
    }
    const repo = await repository()
    await repo.upsert('SOURCE', id, localView, { version: 0, syncStatus: 'pending' })
    const { assetSizeBytes: _assetSizeBytes, ...mutationView } = localView
    await repo.enqueueMutation(createStableMutation({
      clientMutationId: uuidv7(),
      resourceType: 'SOURCE',
      resourceId: id,
      mutationType: 'CREATE',
      baseVersion: 0,
      payload: mutationView as unknown as Record<string, unknown>,
    }))
    const model = mapSourceView(localView)
    replaceSources([model, ...sources.value.filter((source) => source.id !== model.id)])
    scheduleSync()
    return id
  }

  async function addSourceFile(subjectId: string, name: string, filePath: string, _fileType: string, _fileSize: number, catalogJson = '[]'): Promise<string> {
    return createFileSource(subjectId, name, filePath, catalogJson)
  }

  async function deleteSourceFile(id: string): Promise<void> {
    const source = sources.value.find((item) => item.id === id) || activeSourceFiles.value.find((item) => item.id === id)
    if (!source) return
    const repo = await repository()
    await repo.tombstone('SOURCE', id, { version: source.version, syncStatus: 'pending' })
    await repo.enqueueMutation(createStableMutation({
      clientMutationId: uuidv7(),
      resourceType: 'SOURCE',
      resourceId: id,
      mutationType: 'DELETE',
      baseVersion: source.version,
      payload: { id },
    }))
    sources.value = sources.value.filter((item) => item.id !== id)
    activeSourceFiles.value = activeSourceFiles.value.filter((item) => item.id !== id)
    scheduleSync()
    void documentScheduler?.discard(id).catch((error) => {
      console.warn('[SourceStore] deleted Source document cleanup failed', error)
    })
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
    await repo.enqueueMutation(createStableMutation({
      clientMutationId: uuidv7(),
      resourceType: 'SOURCE',
      resourceId: file.id,
      mutationType: 'UPDATE',
      baseVersion: file.version,
      payload: payload as unknown as Record<string, unknown>,
    }))
    scheduleSync()
    const model = mapSourceView(localView)
    replaceSources(sources.value.map((source) => source.id === file.id ? model : source))
  }

  function attachDocumentScheduler(scheduler: SourceDocumentScheduler | null): void {
    documentScheduler = scheduler
  }

  async function resumeDocumentProcessing(sourceId: string): Promise<void> {
    if (!documentScheduler) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
    await useSyncStore().triggerSync()

    const localSource = await (await repository()).read<SourceView>('SOURCE', sourceId)
    if (!localSource || localSource.syncStatus !== 'synced') {
      if (localSource?.syncStatus === 'conflict') {
        throw new Error('资料登记发生版本冲突，请刷新后重试')
      }
      if (localSource?.syncStatus === 'error') {
        throw new Error('资料登记同步失败，请检查网络或资料所属学科后重试')
      }
      throw new Error('资料尚未同步到服务端，请稍后再试')
    }

    await documentScheduler.schedule(sourceId)
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
    loadLocalSourceFiles,
    createFileSource,
    addSourceFile,
    deleteSourceFile,
    saveSourceFileCatalog,
    attachDocumentScheduler,
    resumeDocumentProcessing,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSourceStore, import.meta.hot))
}
