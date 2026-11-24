import { uuidv7 } from '@/utils/uuid'
import {
  createNoteDocument,
  createSubjectAssetAnnotationId,
  type NoteDocument,
} from './tabletNoteModel'
import { tabletNoteRepository } from './tabletNoteRepository'

export class NotebookStorage {
  static async loadNoteDocument(id: string): Promise<NoteDocument | null> {
    try {
      await this.initSchema()
      return await tabletNoteRepository.load(id)
    } catch (e) {
      console.error('Failed to load tablet note document:', e)
      return null
    }
  }

  static async saveNoteDocument(data: NoteDocument): Promise<boolean> {
    try {
      await this.initSchema()
      return await tabletNoteRepository.save({
        ...data,
        updatedAt: new Date().toISOString()
      })
    } catch (e) {
      console.error('Failed to save tablet note document:', e)
      return false
    }
  }

  static async loadOrCreateAssetAnnotation(
    subjectId: string,
    assetId: string,
    title: string,
  ): Promise<NoteDocument> {
    await this.initSchema()
    const id = createSubjectAssetAnnotationId(subjectId, assetId)
    const existing = await tabletNoteRepository.load(id)
    if (existing) return existing

    const document = createNoteDocument({
      id,
      mode: 'subject-asset-annotation',
      subjectId,
      assetId,
      title,
    })
    await tabletNoteRepository.save(document)
    return document
  }

  static createSubjectHandwritingNote(subjectId: string, title: string): NoteDocument {
    return createNoteDocument({
      id: uuidv7(),
      mode: 'subject-handwriting-note',
      subjectId,
      title,
    })
  }

  static createQuickCanvasNote(title: string = '随手记草稿本'): NoteDocument {
    return createNoteDocument({
      id: uuidv7(),
      mode: 'quick-infinite-canvas',
      title,
    })
  }

  static async listSubjectHandwritingNotes(subjectId: string): Promise<NoteDocument[]> {
    try {
      await this.initSchema()
      return await tabletNoteRepository.listBySubject(subjectId, 'subject-handwriting-note')
    } catch (e) {
      console.error('Failed to list subject handwriting notes:', e)
      return []
    }
  }

  // Helper for SQLite schema creation (run on app init)
  static async initSchema() {
    await tabletNoteRepository.initSchema()
  }
}
