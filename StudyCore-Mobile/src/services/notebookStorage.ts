import { localDb } from '@/services/localDb'
import type { NotebookData } from './handwritingEngine'
import { uuidv7 } from '@/utils/uuid'

export class NotebookStorage {
  // Load notebook from local SQLite
  static async loadNotebook(id: string): Promise<NotebookData | null> {
    try {
      const res = await localDb.executeSql('SELECT * FROM notebooks WHERE id = ?', [id])
      if (res && res.length > 0) {
        return JSON.parse(res[0].data) as NotebookData
      }
      return null
    } catch (e) {
      console.error('Failed to load notebook:', e)
      return null
    }
  }

  // Save notebook to local SQLite
  static async saveNotebook(data: NotebookData): Promise<boolean> {
    try {
      data.updatedAt = new Date().toISOString()
      const dataStr = JSON.stringify(data)
      
      // Upsert
      await localDb.executeSql(
        `INSERT INTO notebooks (id, title, data, updated_at) 
         VALUES (?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, data=excluded.data, updated_at=excluded.updated_at`,
        [data.id, data.title, dataStr, data.updatedAt]
      )
      return true
    } catch (e) {
      console.error('Failed to save notebook:', e)
      return false
    }
  }

  // Create empty notebook
  static createNewNotebook(title: string = '随手记草稿本'): NotebookData {
    return {
      id: uuidv7(),
      title,
      strokes: [],
      viewport: { x: 0, y: 0, scale: 1 },
      background: 'grid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  // Helper for SQLite schema creation (run on app init)
  static async initSchema() {
    await localDb.executeSql(`
      CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        title TEXT,
        data TEXT,
        updated_at TEXT
      )
    `)
  }
}
