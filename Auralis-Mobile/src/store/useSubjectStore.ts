import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { localDb } from '@/services/localDb'
import { uuidv7 } from '@/utils/uuid'
import { useAuthStore } from './useAuthStore'

export interface Subject {
  id: string
  name: string
  description: string
  icon: string
  created_at?: number
  blockCount?: number
  fileCount?: number
  version?: number
}

export interface SourceFile {
  id: string
  subject_id: string
  name: string
  file_path: string
  file_type: string
  file_size: number
  catalog_json?: string
  block_count?: number
  created_at?: number
  version?: number
}

export interface CatalogItem {
  title: string
  sections: string[]
}

export const useSubjectStore = defineStore('subject', () => {
  const subjects = ref<Subject[]>([])
  const activeSubjectId = ref<string | null>(null)
  const activeSourceFiles = ref<SourceFile[]>([])

  const activeSubject = computed(() => {
    return subjects.value.find(s => s.id === activeSubjectId.value) || null
  })

  async function triggerBackgroundSync() {
    try {
      const { useSyncStore } = await import('./useSyncStore')
      void useSyncStore().triggerSync()
    } catch {
      // Ignore offline sync failure
    }
  }

  const loadSubjects = async () => {
    const auth = useAuthStore()
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
    try {
      const raw = await localDb.getSubjects()
      const list: Subject[] = []
      for (const item of raw) {
        const blocks = await localDb.getBlocks(undefined, item.id)
        const files = await localDb.getSourceFiles(item.id)
        list.push({
          ...item,
          blockCount: blocks.length,
          fileCount: files.length,
        })
      }
      if (generation !== auth.getLoginGeneration() || userId !== auth.user?.id) return
      subjects.value = list
    } catch (e) {
      console.error('[SubjectStore Mobile] Failed to load subjects:', e)
    }
  }

  const setActiveSubject = (id: string | null) => {
    activeSubjectId.value = id
    if (id) {
      void loadSourceFiles(id)
    } else {
      activeSourceFiles.value = []
    }
  }

  const addSubject = async (name: string, description: string, icon: string) => {
    const newSubject: Subject = {
      id: uuidv7(),
      name,
      description,
      icon,
      created_at: Date.now(),
      version: 0,
    }
    await localDb.saveSubject(newSubject)
    const { getClientId } = await import('./useSyncStore')
    await localDb.addLocalMutation(getClientId(), 'subject', newSubject.id, 'create', newSubject)
    await loadSubjects()
    void triggerBackgroundSync()
    return newSubject.id
  }

  const updateSubject = async (subject: Subject) => {
    await localDb.saveSubject(subject)
    const { getClientId } = await import('./useSyncStore')
    await localDb.addLocalMutation(getClientId(), 'subject', subject.id, 'update', subject)
    await loadSubjects()
    void triggerBackgroundSync()
  }

  const deleteSubject = async (id: string) => {
    const current = subjects.value.find(subject => subject.id === id)
    await localDb.deleteSubject(id)
    const { getClientId } = await import('./useSyncStore')
    await localDb.addLocalMutation(getClientId(), 'subject', id, 'delete', current || { id, version: 0 })
    if (activeSubjectId.value === id) {
      activeSubjectId.value = null
      activeSourceFiles.value = []
    }
    await loadSubjects()
    void triggerBackgroundSync()
  }

  const loadSourceFiles = async (subjectId: string) => {
    try {
      const files = await localDb.getSourceFiles(subjectId)
      activeSourceFiles.value = files
    } catch (e) {
      console.error('[SubjectStore Mobile] Failed to load files:', e)
    }
  }

  const addSourceFile = async (subjectId: string, name: string, filePath: string, fileType: string, fileSize: number, catalogJson?: string) => {
    const newFile: SourceFile = {
      id: uuidv7(),
      subject_id: subjectId,
      name,
      file_path: filePath,
      file_type: fileType,
      file_size: fileSize,
      catalog_json: catalogJson || '[]',
      block_count: 0,
      created_at: Date.now(),
    }
    await localDb.saveSourceFile(newFile)
    const { getClientId } = await import('./useSyncStore')
    await localDb.addLocalMutation(getClientId(), 'source', newFile.id, 'create', newFile)
    await loadSourceFiles(subjectId)
    await loadSubjects()
    return newFile.id
  }

  const deleteSourceFile = async (id: string) => {
    const current = activeSourceFiles.value.find(file => file.id === id)
    await localDb.deleteSourceFile(id)
    const { getClientId } = await import('./useSyncStore')
    await localDb.addLocalMutation(getClientId(), 'source', id, 'delete', current || {})
    if (activeSubjectId.value) {
      await loadSourceFiles(activeSubjectId.value)
    }
    await loadSubjects()
  }

  return {
    subjects,
    activeSubjectId,
    activeSubject,
    activeSourceFiles,
    loadSubjects,
    setActiveSubject,
    addSubject,
    updateSubject,
    deleteSubject,
    loadSourceFiles,
    addSourceFile,
    deleteSourceFile,
  }
})
