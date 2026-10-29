import { computed, ref } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useSourceApi, type SourceCreateRequest, type SourceView } from '@/api/useSourceApi'
import { getLocalRepository, getLocalAssetRepository } from '@/services/localDb'
import { getOrCreateLocalAssetService } from '@/services/localAssetService'
import { withLocalAssetLifecycleLock } from '@/services/localAssetLifecycleLock'
import type { LocalRepository } from '@/services/localRepository'
import type { LocalAssetRepository } from '@/services/localAssetRepository'
import { getOrCreateLocalSourceDraftService } from '@/services/localSourceDraftService'
import { mapSourceView, sortSources, type SourceFileModel } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { subscribeProjectionChange } from '@/services/localProjectionEvents'
import { shouldScheduleAwaitingClientDocument } from '@/utils/sourceSchedulingPolicy'
import type { FileOverviewTrigger, OverviewRegenerationResult } from '@/types/overview'
import type { SourceScheduleResult } from '@/services/documentProcessing/sourceJobScheduler'
import { runManualSourceResume } from '@/services/documentProcessing/manualSourceResume'
import {
  beginOverviewScopeDeletion, cancelOverviewScopeDeletion, completeOverviewScopeDeletion,
  reactivateRestoredOverviewScope,
} from '@/services/overviewRepository'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function asSourceDto(value: unknown): SourceView | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as SourceView
  return typeof candidate.id === 'string' ? candidate : null
}

function scheduleSync(): void {
  useSyncStore().requestBackgroundSync('write')
}

interface SourceDocumentScheduler {
  schedule(sourceId: string, options?: { revalidateNotFound?: boolean }): Promise<SourceScheduleResult>
  discard(sourceId: string): Promise<void>
}

interface FileOverviewGenerator {
  generateReadyFileOverview(sourceId: string, ingestionRevision: string, trigger: FileOverviewTrigger): Promise<OverviewRegenerationResult>
  discardFileOverview(sourceId: string): Promise<void>
  invalidateSourceRevision(sourceId: string, ingestionRevision: string | null): void
  restoreFileOverview(sourceId: string): Promise<boolean>
}

let documentScheduler: SourceDocumentScheduler | null = null
let fileOverviewGenerator: FileOverviewGenerator | null = null

export const useSourceStore = defineStore('source', () => {
  const sources = ref<SourceFileModel[]>([])
  const activeSourceFiles = ref<SourceFileModel[]>([])
  // Keep the requested subject separate from the visible rows. An empty
  // subject has no first row from which to infer focus during hydration.
  const activeSubjectId = ref<string | null>(null)
  let sourceLoadGeneration = 0
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Sources require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  async function readLocal(subjectId?: string): Promise<SourceFileModel[]> {
    const repo = await repository()
    const rows = await repo.list<SourceView>('SOURCE', { includeDeleted: false })
    return sortSources(rows
      .map((row) => asSourceDto(row.value))
      .filter((value): value is SourceView => value !== null && (!subjectId || value.subjectId === subjectId))
      .map(mapSourceView))
  }

  async function reactivateRestoredOverviewScopes(models: SourceFileModel[]): Promise<void> {
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId) return
    const repo = await repository()
    const [activeSubjects, unresolved] = await Promise.all([
      repo.list('SUBJECT',{ includeDeleted: false }),
      repo.listUnresolved(),
    ])
    if (authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) return
    const activeSubjectIds = new Set(activeSubjects.map(item => item.id))
    const unresolvedDeletes = new Set(unresolved.filter(item => item.mutationType === 'DELETE').map(item => `${item.resourceType}:${item.resourceId}`))
    for (const source of models) {
      if (!activeSubjectIds.has(source.subjectId) || unresolvedDeletes.has(`SOURCE:${source.id}`)
        || unresolvedDeletes.has(`SUBJECT:${source.subjectId}`)) continue
      if (reactivateRestoredOverviewScope(userId,serverDeviceId,'FILE',source.id)) {
        await fileOverviewGenerator?.restoreFileOverview(source.id)
      }
    }
  }

  function scheduleAwaitingClientDocuments(models: SourceFileModel[]): void {
    if (!useAuthStore().isAuthenticated) return
    for (const model of models) {
      if (documentScheduler && shouldScheduleAwaitingClientDocument(model)) {
        void documentScheduler.schedule(model.id)
          .then((result) => {
            const status = result && typeof result === 'object' ? (result as { status?: unknown }).status : undefined
            if (status === 'READY' && model.ingestionRevision && fileOverviewGenerator) {
              void fileOverviewGenerator.generateReadyFileOverview(model.id, model.ingestionRevision, 'SOURCE_READY')
                .catch(() => console.warn('[SourceStore] file overview generation failed'))
            }
          })
          .catch((error) => console.warn('[SourceStore] document scheduling failed', error))
      }
    }
  }

  function replaceSources(models: SourceFileModel[], subjectIdToFocus?: string): void {
    const sorted = sortSources(models)
    const nextRevisions = new Map(sorted.map((source) => [source.id, source.ingestionRevision ?? null]))
    for (const previous of sources.value) {
      const nextRevision = nextRevisions.get(previous.id)
      if (previous.ingestionRevision !== nextRevision) {
        fileOverviewGenerator?.invalidateSourceRevision(previous.id, nextRevision ?? null)
      }
    }
    sources.value = sorted
    if (subjectIdToFocus !== undefined) activeSubjectId.value = subjectIdToFocus
    const focusId = activeSubjectId.value
    if (focusId) {
      activeSourceFiles.value = sorted.filter((source) => source.subjectId === focusId)
    } else {
      activeSourceFiles.value = sorted
    }
  }

  async function hydrateSources(): Promise<SourceFileModel[]> {
    const local = await readLocal()
    await reactivateRestoredOverviewScopes(local)
    replaceSources(local)
    scheduleAwaitingClientDocuments(local)
    // A restart may be the first opportunity to finish a physical delete
    // whose Source tombstone was acknowledged while the app was closed.
    void cleanupDeletedSourceAssets().catch((error) => {
      console.warn('[SourceStore] deleted Source asset cleanup failed', error)
    })
    return local
  }

  async function cleanupDeletedSourceAssets(): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) return
    const userId = authStore.user.id
    const serverDeviceId = authStore.serverDeviceId
    const repo = await getLocalRepository(userId,serverDeviceId)
    const assetRepo = await getLocalAssetRepository(userId,serverDeviceId)
    const assetService = getOrCreateLocalAssetService(assetRepo)
    const tombstones = await repo.list<SourceView>('SOURCE', { includeDeleted: true })
    for (const row of tombstones) {
      if (!row.deletedAt) continue
      if (authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) return
      const localAsset = await withLocalAssetLifecycleLock(userId,serverDeviceId,async () => {
        if (authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) return null
        // A rejected Subject DELETE sets resetRequired before the authoritative
        // snapshot arrives. Do not consume child tombstones from the pre-snapshot
        // projection during that recovery window.
        if ((await repo.getSyncState()).resetRequired) return null
        const currentSource = await repo.read<SourceView>('SOURCE',row.id)
        if (!currentSource?.deletedAt) return null
        const subjectId = typeof currentSource.value?.subjectId === 'string' ? currentSource.value.subjectId : null
        const [subject,unresolvedSubjectDeletes] = await Promise.all([
          subjectId ? repo.read('SUBJECT',subjectId) : Promise.resolve(null),
          repo.listUnresolved('SUBJECT'),
        ])
        if ((await repo.getSyncState()).resetRequired) return null
        if (subjectId && (subject?.deletedAt || unresolvedSubjectDeletes.some((mutation) =>
          mutation.resourceId === subjectId && mutation.mutationType === 'DELETE'))) return null
        // Snapshot replacement can remove or restore the Source while the
        // tombstone list above is being read. Recheck at the destructive boundary.
        const freshSource = await repo.read<SourceView>('SOURCE',row.id)
        if (!freshSource?.deletedAt || freshSource.value?.subjectId !== currentSource.value?.subjectId) return null
        try {
          await fileOverviewGenerator?.discardFileOverview(row.id)
        } catch {
          console.warn('[SourceStore] deleted Source Overview cleanup deferred')
        }
        try {
          await documentScheduler?.discard(row.id)
        } catch {
          console.warn('[SourceStore] deleted Source document cleanup deferred')
        }
        const draft = await assetRepo.getSourceDraft(row.id)
        if (draft && draft.state !== 'DELETED') {
          // A crash can occur after the SOURCE tombstone commits but before the
          // draft store is updated. Repair the durable gap before recounting refs.
          await assetRepo.deleteSourceDraft(row.id)
        }
        const assetId = typeof freshSource.value?.assetId === 'string' ? freshSource.value.assetId : null
        if (!assetId) return null
        return await assetRepo.getAssetFile(assetId) ?? await assetRepo.getAssetFileByServerId(assetId)
      })
      if (!localAsset || authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) continue
      try {
        await assetService.deleteUnreferencedAsset(localAsset.localAssetId)
      } catch (error) {
        // Active Source references (including an unacknowledged server
        // tombstone) deliberately keep the managed file.  The next sync or
        // startup reconciliation retries this idempotently.
        if (!(error instanceof Error) || !error.message.includes('ASSET_HAS_ACTIVE_REFERENCES')) throw error
      }
    }
  }

  async function loadSources(): Promise<SourceFileModel[]> {
    isLoading.value = true
    lastError.value = null
    try {
      const local = await hydrateSources()
      useSyncStore().requestBackgroundSync('read')
      return local
    } finally {
      isLoading.value = false
    }
  }

  // Processing reconciliation has already completed its transport read and
  // must only refresh the local projection. The scope is checked both before
  // and after the repository read so an old account/device cannot replace a
  // newer projection after an auth switch.
  async function refreshLocalProjection(scope?: { userId: string; serverDeviceId: string }): Promise<SourceFileModel[]> {
    const authStore = useAuthStore()
    const isCurrentScope = (): boolean => !scope
      || authStore.user?.id === scope.userId && authStore.serverDeviceId === scope.serverDeviceId
    if (!isCurrentScope()) return []
    const local = await readLocal()
    if (!isCurrentScope()) return []
    replaceSources(local)
    return local
  }

  subscribeProjectionChange((change) => {
    if (change.resourceTypes.has('SOURCE')) void hydrateSources()
      .catch((error) => console.warn('[SourceStore] projection hydration failed', error))
  })

  async function loadSourceFiles(subjectId: string): Promise<SourceFileModel[]> {
    const local = await loadLocalSourceFiles(subjectId)
    useSyncStore().requestBackgroundSync('read')
    return local
  }

  async function loadLocalSourceFiles(subjectId: string): Promise<SourceFileModel[]> {
    const requestGeneration = ++sourceLoadGeneration
    activeSubjectId.value = subjectId
    // Scope the visible projection immediately. This prevents the previous
    // subject from being rendered while the requested rows are being read.
    activeSourceFiles.value = sources.value.filter((source) => source.subjectId === subjectId)
    const local = await readLocal(subjectId)
    if (requestGeneration !== sourceLoadGeneration || activeSubjectId.value !== subjectId) {
      // A superseded route caller must not consume another subject's rows.
      return []
    }
    replaceSources([
      ...sources.value.filter((source) => source.subjectId !== subjectId),
      ...local,
    ], subjectId)
    return activeSourceFiles.value
  }

  function clearActiveSourceFiles(): void {
    sourceLoadGeneration += 1
    activeSubjectId.value = null
    activeSourceFiles.value = []
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

    const authStore = useAuthStore()
    const repo = await repository()
    const ownerId = authStore.user?.id
    const deviceId = authStore.serverDeviceId
    if (!ownerId || !deviceId) throw new Error('Sources require an authenticated user and device')

    let localAssetRepo: LocalAssetRepository | null = null
    if (authStore.user?.id && authStore.serverDeviceId) {
      localAssetRepo = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
    }

    const localAsset = localAssetRepo ? await localAssetRepo.getAssetFile(assetId) : null

    // If this is a local asset without serverAssetId, create draft and local projection,
    // and hold back outbox mutation until asset is READY.
    if (localAsset && !localAsset.serverAssetId) {
      const id = uuidv7()
      const draftService = getOrCreateLocalSourceDraftService(localAssetRepo!, repo)
      await draftService.createDraft({
        localSourceId: id,
        localAssetId: assetId,
        subjectId,
        title,
        outline,
        assetSizeBytes: normalizedAssetSizeBytes,
      })
      const localView: SourceView = {
        id,
        subjectId,
        type: 'FILE',
        title,
        assetId,
        outline,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: undefined,
        ingestionStatus: 'AWAITING_CLIENT',
        assetSizeBytes: normalizedAssetSizeBytes,
      }
      const model = mapSourceView(localView)
      replaceSources([model, ...sources.value.filter((source) => source.id !== model.id)], activeSubjectId.value ?? subjectId)
      scheduleSync()
      if (documentScheduler) {
        void documentScheduler.schedule(id)
          .catch((error) => console.warn('[SourceStore] offline document scheduling failed', error))
      }
      return id
    }

    const targetAssetId = localAsset?.serverAssetId ?? assetId
    const payload: SourceCreateRequest = {
      baseVersion: 0,
      subjectId,
      type: 'FILE',
      title,
      assetId: targetAssetId,
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
    const { assetSizeBytes: _assetSizeBytes, ...mutationView } = localView
    const commitSource = async (): Promise<void> => {
      await repo.commitMutationUnlocked({
        resourceType: 'SOURCE', resourceId: id, value: localView, version: 0, deletedAt: null,
        mutation: createStableMutation({
          clientMutationId: uuidv7(), resourceType: 'SOURCE', resourceId: id, mutationType: 'CREATE', baseVersion: 0,
          payload: mutationView as unknown as Record<string, unknown>,
        }),
      })
    }
    if (localAsset?.serverAssetId) {
      await withLocalAssetLifecycleLock(ownerId, deviceId, async () => {
        const currentAsset = await localAssetRepo!.getAssetFile(assetId)
        if (!currentAsset || currentAsset.state === 'DELETING') throw new Error('LOCAL_ASSET_DELETE_FENCED')
        await commitSource()
      })
    } else {
      await repo.commitMutation({
        resourceType: 'SOURCE', resourceId: id, value: localView, version: 0, deletedAt: null,
        mutation: createStableMutation({
          clientMutationId: uuidv7(), resourceType: 'SOURCE', resourceId: id, mutationType: 'CREATE', baseVersion: 0,
          payload: mutationView as unknown as Record<string, unknown>,
        }),
      })
    }
    const model = mapSourceView(localView)
    replaceSources([model, ...sources.value.filter((source) => source.id !== model.id)], activeSubjectId.value ?? subjectId)
    scheduleSync()
    return id
  }

  async function addSourceFile(subjectId: string, name: string, filePath: string, _fileType: string, _fileSize: number, catalogJson = '[]'): Promise<string> {
    return createFileSource(subjectId, name, filePath, catalogJson)
  }

  async function deleteSourceFile(id: string): Promise<void> {
    const source = sources.value.find((item) => item.id === id) || activeSourceFiles.value.find((item) => item.id === id)
    if (!source) return
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId) throw new Error('Sources require an authenticated user and device')
    const deletionTicket = beginOverviewScopeDeletion(userId,serverDeviceId,'FILE',id)
    let tombstoneCommitted = false
    const isCurrentScope = (): boolean => authStore.user?.id === userId && authStore.serverDeviceId === serverDeviceId
    try {
    const repo = await getLocalRepository(userId,serverDeviceId)
    const existing = await repo.read<SourceView>('SOURCE', id)
    const assetRepo = await getLocalAssetRepository(userId,serverDeviceId)
    const draftBeforeDelete = await assetRepo?.getSourceDraft(id)
    const localOnlyDraft = Boolean(draftBeforeDelete && !draftBeforeDelete.serverSourceId)
    const now = new Date().toISOString()
    if (authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) throw new Error('OVERVIEW_SCOPE_CHANGED')
    const localView: SourceView = {
      ...(existing?.value ?? { id, subjectId: source.subjectId, type: source.type, title: source.name }),
      id, version: source.version, updatedAt: now, deletedAt: now,
    }
    if (localOnlyDraft) {
      // This Source never reached the server.  Persist a local tombstone
      // without manufacturing a DELETE mutation that can remain unresolved
      // forever against a non-existent server row.
      await repo.tombstone('SOURCE', id, { version: source.version, deletedAt: now, syncStatus: 'synced' })
    } else {
      await repo.commitMutation({
        resourceType: 'SOURCE', resourceId: id, value: localView, version: source.version, deletedAt: now,
        mutation: createStableMutation({
          clientMutationId: uuidv7(), resourceType: 'SOURCE', resourceId: id, mutationType: 'DELETE', baseVersion: source.version, payload: { id },
        }),
      })
    }
    tombstoneCommitted = true
    completeOverviewScopeDeletion(deletionTicket)
    if (isCurrentScope()) {
      sources.value = sources.value.filter((item) => item.id !== id)
      activeSourceFiles.value = activeSourceFiles.value.filter((item) => item.id !== id)
      if (!localOnlyDraft) scheduleSync()
    }

    // The Source tombstone is now durable.  Mark the auxiliary draft after
    // it, so a failure before this line is repairable by startup cleanup.
    const draft = draftBeforeDelete ?? await assetRepo?.getSourceDraft(id)
    if (assetRepo && draft && draft.state !== 'DELETED') await assetRepo.deleteSourceDraft(id)
    // For a local-only draft this can complete immediately.  For a server
    // Source the tombstone remains a reference until sync settles; startup
    // cleanup retries after acknowledgement.
    if (isCurrentScope()) {
      await cleanupDeletedSourceAssets().catch((error) => {
        if (!(error instanceof Error) || !error.message.includes('ASSET_HAS_ACTIVE_REFERENCES')) {
          console.warn('[SourceStore] deleted Source asset cleanup deferred')
        }
      })
    }
    } catch (error) {
      if (!tombstoneCommitted) cancelOverviewScopeDeletion(deletionTicket)
      throw error
    }
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
      ingestionRevision: file.ingestionRevision,
    }
    await repo.commitMutation({
      resourceType: 'SOURCE', resourceId: file.id, value: localView, version: file.version, deletedAt: file.deletedAt,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'SOURCE', resourceId: file.id, mutationType: 'UPDATE', baseVersion: file.version,
        payload: payload as unknown as Record<string, unknown>,
      }),
    })
    const model = mapSourceView(localView)
    replaceSources(sources.value.map((source) => source.id === file.id ? model : source))
    scheduleSync()
  }

  function attachDocumentScheduler(scheduler: SourceDocumentScheduler | null): void {
    documentScheduler = scheduler
  }

  function attachFileOverviewGenerator(generator: FileOverviewGenerator | null): void {
    fileOverviewGenerator = generator
  }

  async function resumeDocumentProcessing(
    sourceId: string,
    onProgress?: (stage: 'sync' | 'schedule') => void,
  ): Promise<SourceScheduleResult> {
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    const sessionId = authStore.sessionId
    const scheduler = documentScheduler
    if (!authStore.isAuthenticated || !userId || !serverDeviceId || !sessionId) {
      throw new Error('AUTHENTICATION_REQUIRED')
    }
    if (!scheduler) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
    const isScopeCurrent = () => authStore.isAuthenticated
      && authStore.user?.id === userId
      && authStore.serverDeviceId === serverDeviceId
      && authStore.sessionId === sessionId
      && documentScheduler === scheduler

    const result = await runManualSourceResume({
      isScopeCurrent,
      onProgress,
      flushSync: () => useSyncStore().flushNow(),
      readLocalSource: async () => {
        const repo = await getLocalRepository(userId, serverDeviceId)
        if (!isScopeCurrent()) throw new Error('DOCUMENT_PROCESSING_SCOPE_CHANGED')
        return repo.read<SourceView>('SOURCE', sourceId)
      },
      assertSourceSynced: (localSource) => {
        if (!localSource || localSource.syncStatus !== 'synced') {
          if (localSource?.syncStatus === 'conflict') throw new Error('SOURCE_SYNC_CONFLICT')
          if (localSource?.syncStatus === 'error') throw new Error('SOURCE_SYNC_FAILED')
          throw new Error('SOURCE_NOT_SYNCED')
        }
      },
      schedule: () => scheduler.schedule(sourceId, { revalidateNotFound: true }),
    })
    if (!isScopeCurrent()) return result
    const status = result.status
    const current = sources.value.find((source) => source.id === sourceId)
    if (status === 'READY' && current?.ingestionRevision && fileOverviewGenerator) {
      void fileOverviewGenerator.generateReadyFileOverview(sourceId, current.ingestionRevision, 'MANUAL_RETRY')
        .catch(() => console.warn('[SourceStore] file overview generation failed'))
    }
    return result
  }

  async function retrySourceProcessing(sourceId: string): Promise<SourceFileModel> {
    if (!useAuthStore().isAuthenticated) throw new Error('AUTHENTICATION_REQUIRED')
    const repo = await repository()
    const local = await repo.read<SourceView>('SOURCE', sourceId)
    const inMemory = sources.value.find((source) => source.id === sourceId)
    const baseVersion = local?.version ?? inMemory?.version ?? 0

    const updated = await useSourceApi.reingest(sourceId, { baseVersion })
    await repo.upsertFromSync('SOURCE', sourceId, updated, {
      version: updated.version ?? baseVersion,
      deletedAt: updated.deletedAt ?? null,
      syncStatus: 'synced',
    })
    const model = mapSourceView(updated)
    replaceSources(sources.value.map((source) => (source.id === sourceId ? model : source)))

    if (shouldScheduleAwaitingClientDocument(model) && documentScheduler) {
      void documentScheduler.schedule(sourceId)
        .then((result) => {
          const status = result && typeof result === 'object' ? (result as { status?: unknown }).status : undefined
          if (status === 'READY' && model.ingestionRevision && fileOverviewGenerator) {
            void fileOverviewGenerator.generateReadyFileOverview(model.id, model.ingestionRevision, 'MANUAL_RETRY')
              .catch(() => console.warn('[SourceStore] file overview generation failed'))
          }
        })
        .catch((error) => console.warn('[SourceStore] document scheduling failed', error))
    }

    useSyncStore().requestBackgroundSync('read')
    return model
  }

  const currentSourceCount = computed(() => sources.value.length)

  return {
    sources,
    activeSourceFiles,
    currentSourceCount,
    isLoading,
    lastError,
    loadSources,
    refreshLocalProjection,
    loadSourceFiles,
    loadLocalSourceFiles,
    clearActiveSourceFiles,
    createFileSource,
    addSourceFile,
    deleteSourceFile,
    saveSourceFileCatalog,
    attachDocumentScheduler,
    attachFileOverviewGenerator,
    resumeDocumentProcessing,
    retrySourceProcessing,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSourceStore, import.meta.hot))
}
