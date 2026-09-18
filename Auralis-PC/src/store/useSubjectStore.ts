import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
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

export type Subject = SubjectModel
export type SourceFile = SourceFileModel

export interface CatalogItem {
  title: string
  sections: string[]
}

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

function parseCatalogText(text: string): CatalogItem[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const result: CatalogItem[] = []
  let current: CatalogItem | null = null
  for (const line of lines) {
    const isChapter = /^(第\s*\S+\s*章|chapter\s+\d+|[一二三四五六七八九十]+、)/i.test(line)
    const isSection = /^(\d+(?:\.\d+)+|[（(]?\d+[）)])\s*/.test(line)
    if (isChapter || !current) {
      current = { title: line, sections: [] }
      result.push(current)
    } else if (isSection) {
      current.sections.push(line)
    } else if (current.sections.length === 0) {
      current.title = `${current.title} ${line}`
    } else {
      current.sections.push(line)
    }
  }
  return result
}

export const useSubjectStore = defineStore('subject', () => {
  const subjects = ref<Subject[]>([])
  const activeSubjectId = ref<string | null>(null)
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
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
    // The Subject tombstone is the crash-recovery marker. Repair any child
    // projections left behind by a process exit after that marker committed.
    try {
      await (await deletionCoordinator()).reconcileDeletedSubjects()
    } catch (error) {
      console.warn('[SubjectStore] deleted Subject reconciliation deferred', error)
    }
    replaceSubjects(await localSubjects())
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
    const payload: SubjectCreateRequest = {
      baseVersion: 0,
      name: name.trim(),
      description: description.trim(),
      iconKey: icon,
    }
    // CREATE is local-first even while online. The durable outbox keeps the
    // resource ID and clientMutationId intact if the HTTP response is lost.
    const id = uuidv7()
    const now = new Date().toISOString()
    const localView: SubjectView = { ...payload, id, version: 0, createdAt: now, updatedAt: now, deletedAt: undefined }
    const repo = await repository()
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
    const payload: SubjectCreateRequest = {
      baseVersion: subject.version,
      name: subject.name,
      description: subject.description,
      iconKey: subject.iconKey || subject.icon,
      sortKey: subject.sortKey,
    }
    const repo = await repository()
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
    const repo = await repository()
    const existing = await repo.read<SubjectView>('SUBJECT', id)
    const now = new Date().toISOString()
    const localView: SubjectView = {
      ...(existing?.value ?? { id, name: subject.name, description: subject.description, iconKey: subject.iconKey }),
      id, version: subject.version, updatedAt: now, deletedAt: now,
    }
    await repo.commitMutation({
      resourceType: 'SUBJECT', resourceId: id, value: localView, version: subject.version, deletedAt: now,
      mutation: createStableMutation({
        clientMutationId: uuidv7(), resourceType: 'SUBJECT', resourceId: id, mutationType: 'DELETE', baseVersion: subject.version, payload: { id },
      }),
    })
    if (activeSubjectId.value === id) setActiveSubject(null)
    subjects.value = subjects.value.filter((item) => item.id !== id)
    const coordinator = await deletionCoordinator(repo)
    try {
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
  }

  const loadSourceFiles = (subjectId: string) => sourceStore.loadSourceFiles(subjectId)
  const addSourceFile = (subjectId: string, name: string, filePath: string, fileType: string, fileSize: number, catalogJson?: string) =>
    sourceStore.addSourceFile(subjectId, name, filePath, fileType, fileSize, catalogJson)
  async function deleteSourceFile(id: string): Promise<void> {
    await sourceStore.deleteSourceFile(id)
    void loadSubjects().catch((error) => console.warn('[SubjectStore] background subject refresh failed', error))
  }
  const saveSourceFileCatalog = (file: SourceFile) => sourceStore.saveSourceFileCatalog(file)

  async function analyzeCatalogViaAi(sourceFileId: string, catalogText: string): Promise<void> {
    const file = sourceStore.activeSourceFiles.find((item) => item.id === sourceFileId)
    if (!file) return
    const parsed: CatalogItem[] = parseCatalogText(catalogText)
    await saveSourceFileCatalog({ ...file, catalogJson: JSON.stringify(parsed) })
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
    addSourceFile,
    deleteSourceFile,
    saveSourceFileCatalog,
    analyzeCatalogViaAi,
  }
})
