import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import { useReviewStore } from '@/store/useReviewStore'
import { type SubjectCreateRequest, type SubjectView } from '@/api/useSubjectApi'
import { getDocumentProcessingJobRepository, getLocalAssetRepository, getLocalRepository, getOverviewRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { SubjectDeletionCoordinator } from '@/services/subjectDeletionCoordinator'
import { getOrCreateLocalAssetService } from '@/services/localAssetService'
import { mapSubjectView, type SourceFileModel, type SubjectModel } from '@/services/domainMappers'
import { useSourceStore } from '@/store/useSourceStore'
import { useSyncStore } from '@/store/useSyncStore'
import { uuidv7 } from '@/utils/uuid'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { subscribeProjectionChange } from '@/services/localProjectionEvents'
import { beginOverviewScopeDeletion, cancelOverviewScopeDeletion, completeOverviewScopeDeletion } from '@/services/overviewRepository'

export type Subject = SubjectModel
export type SourceFile = SourceFileModel

function asSubjectDto(value: unknown): SubjectView | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as SubjectView
  return typeof candidate.id === 'string' ? candidate : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function scheduleSync(): void {
  useSyncStore().requestBackgroundSync('write')
}

export const useSubjectStore = defineStore('subject', () => {
  const subjects = ref<Subject[]>([])
  const activeSubjectId = ref<string | null>(null)
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  let hydrationPromise: Promise<void> | null = null
  let hydrationDirty = false
  const sourceStore = useSourceStore()

  function replaceSubjects(models: Subject[]): void {
    const sorted = [...models].sort((a, b) => {
      if (a.defaultSubject && !b.defaultSubject) return -1
      if (!a.defaultSubject && b.defaultSubject) return 1
      if (a.sortKey && b.sortKey) {
        if (a.sortKey < b.sortKey) return -1
        if (a.sortKey > b.sortKey) return 1
      } else if (a.sortKey) {
        return -1
      } else if (b.sortKey) {
        return 1
      }
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return ta - tb
    })
    subjects.value = sorted
  }

  const activeSubject = computed(() => subjects.value.find((subject) => subject.id === activeSubjectId.value) || null)
  const activeSourceFiles = computed(() => sourceStore.activeSourceFiles)

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Subjects require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  async function deletionCoordinator(repo?: LocalRepository): Promise<SubjectDeletionCoordinator> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Subjects require an authenticated user and device')
    const localRepo = repo ?? await repository()
    const assetRepo = await getLocalAssetRepository(authStore.user.id, authStore.serverDeviceId)
    return new SubjectDeletionCoordinator({
      repo: localRepo,
      assetRepo,
      assetService: getOrCreateLocalAssetService(assetRepo),
      overview: await getOverviewRepository(authStore.user.id, authStore.serverDeviceId),
      jobs: await getDocumentProcessingJobRepository(authStore.user.id, authStore.serverDeviceId),
    })
  }

  async function localSubjects(): Promise<Subject[]> {
    const repo = await repository()
    const rows = await repo.list<SubjectView>('SUBJECT', { includeDeleted: false })
    const resources = await repo.list<Record<string, unknown>>('', { includeDeleted: false })
    const blockRows = resources.filter((row) => row.resourceType === 'KNOWLEDGE_BLOCK')
    const sourceRows = resources.filter((row) => row.resourceType === 'SOURCE')
    return rows
      .map((row) => asSubjectDto(row.value))
      .filter((value): value is SubjectView => Boolean(value))
      .map((value) => mapSubjectView(value, {
        blockCount: blockRows.filter((row) => asRecord(row.value)?.subjectId === value.id).length,
        fileCount: sourceRows.filter((row) => asRecord(row.value)?.subjectId === value.id).length,
      }))
  }

  async function hydrateSubjects(): Promise<void> {
    if (hydrationPromise) {
      hydrationDirty = true
      return hydrationPromise
    }
    hydrationPromise = (async () => {
      do {
        hydrationDirty = false
        // The Subject tombstone is the crash-recovery marker. Repair any child
        // projections left behind by a process exit after that marker committed.
        try {
          await (await deletionCoordinator()).reconcileDeletedSubjects()
        } catch (error) {
          console.warn('[SubjectStore] deleted Subject reconciliation deferred', error)
        }
        replaceSubjects(await localSubjects())
      } while (hydrationDirty)
    })()
    try {
      await hydrationPromise
    } finally {
      hydrationPromise = null
    }
  }

  async function loadSubjects(): Promise<void> {
    isLoading.value = true
    lastError.value = null
    try {
      await hydrateSubjects()
    } finally {
      isLoading.value = false
    }
    useSyncStore().requestBackgroundSync('read')
  }

  subscribeProjectionChange((change) => {
    if (change.suppressSubjectHydration) return
    if (change.resourceTypes.has('SUBJECT') || change.resourceTypes.has('SOURCE') || change.resourceTypes.has('KNOWLEDGE_BLOCK')) {
      void hydrateSubjects()
    }
  })

  function setActiveSubject(id: string | null): void {
    activeSubjectId.value = id
    if (id) void sourceStore.loadSourceFiles(id)
    else sourceStore.clearActiveSourceFiles()
  }

  async function addSubject(name: string, description: string, icon: string): Promise<string> {
    const repo = await repository()
    const payload: SubjectCreateRequest = {
      baseVersion: 0,
      name: await requireAvailableSubjectName(repo, name),
      description: description.trim(),
      iconKey: icon,
    }
    // CREATE is local-first even while online. The durable outbox keeps the
    // resource ID and clientMutationId intact if the HTTP response is lost.
    const id = uuidv7()
    const now = new Date().toISOString()
    const localView: SubjectView = { ...payload, id, version: 0, createdAt: now, updatedAt: now, deletedAt: undefined }
    await repo.commitMutation({
      resourceType: 'SUBJECT', resourceId: id, value: localView, version: 0, deletedAt: null,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'SUBJECT', resourceId: id, mutationType: 'CREATE', baseVersion: 0,
        payload: localView as unknown as Record<string, unknown>,
      }),
    })
    replaceSubjects([...subjects.value, mapSubjectView(localView)])
    scheduleSync()
    return id
  }

  async function updateSubject(subject: Subject): Promise<void> {
    const repo = await repository()
    const payload: SubjectCreateRequest = {
      baseVersion: subject.version,
      name: await requireAvailableSubjectName(repo, subject.name, subject.id),
      description: subject.description,
      iconKey: subject.iconKey || subject.icon,
      sortKey: subject.sortKey,
    }
    const localView: SubjectView = {
      ...payload,
      id: subject.id,
      version: subject.version,
      createdAt: subject.createdAt,
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
    }
    await repo.commitMutation({
      resourceType: 'SUBJECT', resourceId: subject.id, value: localView, version: subject.version, deletedAt: null,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'SUBJECT', resourceId: subject.id, mutationType: 'UPDATE', baseVersion: subject.version,
        payload: payload as unknown as Record<string, unknown>,
      }),
    })
    replaceSubjects(subjects.value.map((item) => item.id === subject.id ? mapSubjectView(localView, item) : item))
    scheduleSync()
  }

  async function deleteSubject(id: string): Promise<void> {
    const subject = subjects.value.find((item) => item.id === id)
    if (!subject) return
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId) throw new Error('Subjects require an authenticated user and device')
    const reviewStore = useReviewStore()
    const reviewScopeTicket = reviewStore.captureScopeTicket()
    const deletionTicket = beginOverviewScopeDeletion(userId,serverDeviceId,'SUBJECT',id)
    let tombstoneCommitted = false
    try {
    const repo = await getLocalRepository(userId,serverDeviceId)
    const existing = await repo.read<SubjectView>('SUBJECT', id)
    const now = new Date().toISOString()
    const localView: SubjectView = {
      ...(existing?.value ?? { id, name: subject.name, description: subject.description, iconKey: subject.iconKey }),
      id, version: subject.version, updatedAt: now, deletedAt: now,
    }
    if (authStore.user?.id !== userId || authStore.serverDeviceId !== serverDeviceId) throw new Error('OVERVIEW_SCOPE_CHANGED')
    await repo.commitMutation({
      resourceType: 'SUBJECT', resourceId: id, value: localView, version: subject.version, deletedAt: now,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'SUBJECT', resourceId: id, mutationType: 'DELETE', baseVersion: subject.version, payload: { id },
      }),
    })
    tombstoneCommitted = true
    completeOverviewScopeDeletion(deletionTicket)
    reviewStore.clearDeletedSubject(id, reviewScopeTicket)
    if (activeSubjectId.value === id) setActiveSubject(null)
    subjects.value = subjects.value.filter((item) => item.id !== id)
    try {
      const coordinator = await deletionCoordinator(repo)
      const impacted = await coordinator.markDeletedSubject(id)
      // The local projection/outbox fence is complete before sync is released;
      // physical files and parser caches may finish in the background.
      void coordinator.cleanupMarkedSubject(impacted).catch((error) => {
        console.warn('[SubjectStore] deleted Subject cleanup deferred', error)
      })
    } catch (error) {
      console.warn('[SubjectStore] deleted Subject projection cleanup deferred', error)
    }
    scheduleSync()
    } catch (error) {
      if (!tombstoneCommitted) cancelOverviewScopeDeletion(deletionTicket)
      throw error
    }
  }

  const loadSourceFiles = (subjectId: string) => sourceStore.loadSourceFiles(subjectId)
  async function deleteSourceFile(id: string): Promise<void> {
    await sourceStore.deleteSourceFile(id)
    void loadSubjects().catch((error) => console.warn('[SubjectStore] background subject refresh failed', error))
  }
  return {
    subjects,
    activeSubjectId,
    activeSubject,
    activeSourceFiles,
    isLoading,
    lastError,
    loadSubjects,
    setActiveSubject,
    addSubject,
    updateSubject,
    deleteSubject,
    loadSourceFiles,
    deleteSourceFile,
  }
})

async function requireAvailableSubjectName(repo: LocalRepository, name: string, currentSubjectId?: string): Promise<string> {
  const trimmedName = name.trim()
  const normalizedName = trimmedName.toLowerCase()
  const existingSubjects = await repo.list<SubjectView>('SUBJECT', { includeDeleted: false })
  const currentName = existingSubjects.find((row) => row.id === currentSubjectId)?.value.name
  if (currentName?.trim().toLowerCase() === normalizedName) return trimmedName

  if (existingSubjects.some((row) =>
    row.id !== currentSubjectId && row.value.name?.trim().toLowerCase() === normalizedName,
  )) {
    throw new Error('SUBJECT_NAME_ALREADY_EXISTS')
  }
  return trimmedName
}
