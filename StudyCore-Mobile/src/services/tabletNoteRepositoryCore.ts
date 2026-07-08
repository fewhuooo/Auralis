import type { NoteDocument, NoteMode } from './tabletNoteModel'

export interface TabletNoteDb {
  executeSql(sql: string, params?: unknown[]): Promise<unknown>
}

export interface TabletNoteRepository {
  initSchema(): Promise<void>
  save(document: NoteDocument): Promise<boolean>
  load(id: string): Promise<NoteDocument | null>
  listBySubject(subjectId: string, mode?: NoteMode): Promise<NoteDocument[]>
}

type TabletNoteRow = {
  id: string
  mode: NoteMode
  subject_id?: string | null
  asset_id?: string | null
  title: string
  data: string
  updated_at: string
}

export function createTabletNoteRepository(db: TabletNoteDb): TabletNoteRepository {
  return {
    async initSchema() {
      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS tablet_notes (
          id TEXT PRIMARY KEY,
          mode TEXT NOT NULL,
          subject_id TEXT,
          asset_id TEXT,
          title TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)
    },

    async save(document: NoteDocument) {
      const existing = (await db.executeSql('SELECT id FROM tablet_notes WHERE id = ?', [
        document.id,
      ])) as unknown[]
      const payload = JSON.stringify(document)
      const params = [
        document.mode,
        document.subjectId ?? null,
        document.assetId ?? null,
        document.title,
        payload,
        document.updatedAt,
      ]

      if (existing.length > 0) {
        await db.executeSql(
          `
            UPDATE tablet_notes
            SET mode = ?, subject_id = ?, asset_id = ?, title = ?, data = ?, updated_at = ?
            WHERE id = ?
          `,
          [...params, document.id],
        )
      } else {
        await db.executeSql(
          `
            INSERT INTO tablet_notes (id, mode, subject_id, asset_id, title, data, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [document.id, ...params],
        )
      }

      return true
    },

    async load(id: string) {
      const rows = (await db.executeSql('SELECT * FROM tablet_notes WHERE id = ?', [
        id,
      ])) as TabletNoteRow[]
      return rows.length > 0 ? parseDocumentRow(rows[0]) : null
    },

    async listBySubject(subjectId: string, mode?: NoteMode) {
      const rows = mode
        ? ((await db.executeSql(
            'SELECT * FROM tablet_notes WHERE mode = ? AND subject_id = ? ORDER BY updated_at DESC',
            [mode, subjectId],
          )) as TabletNoteRow[])
        : ((await db.executeSql(
            'SELECT * FROM tablet_notes WHERE subject_id = ? ORDER BY updated_at DESC',
            [subjectId],
          )) as TabletNoteRow[])

      return rows.map(parseDocumentRow)
    },
  }
}

function parseDocumentRow(row: TabletNoteRow): NoteDocument {
  return JSON.parse(row.data) as NoteDocument
}
