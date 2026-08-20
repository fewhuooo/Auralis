import {
  createTabletNoteRepository,
  type TabletNoteDb,
} from '../src/services/tabletNoteRepositoryCore.ts'
import { createNoteDocument } from '../src/services/tabletNoteModel.ts'

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function expect(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label)
  }
}

type Row = {
  id: string
  mode: string
  subject_id: string | null
  asset_id: string | null
  title: string
  data: string
  updated_at: string
}

const rows = new Map<string, Row>()

const fakeDb: TabletNoteDb = {
  async executeSql(sql: string, params: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase()
    if (normalized.startsWith('CREATE TABLE')) {
      return []
    }
    if (normalized.startsWith('SELECT ID FROM TABLET_NOTES WHERE ID')) {
      return rows.has(String(params[0])) ? [{ id: params[0] }] : []
    }
    if (normalized.startsWith('SELECT * FROM TABLET_NOTES WHERE ID')) {
      const row = rows.get(String(params[0]))
      return row ? [row] : []
    }
    if (normalized.startsWith('SELECT * FROM TABLET_NOTES WHERE MODE')) {
      const [mode, subjectId] = params.map(String)
      return Array.from(rows.values()).filter(row => row.mode === mode && row.subject_id === subjectId)
    }
    if (normalized.startsWith('INSERT INTO TABLET_NOTES')) {
      const [id, mode, subjectId, assetId, title, data, updatedAt] = params as string[]
      rows.set(id, {
        id,
        mode,
        subject_id: subjectId || null,
        asset_id: assetId || null,
        title,
        data,
        updated_at: updatedAt,
      })
      return []
    }
    if (normalized.startsWith('UPDATE TABLET_NOTES')) {
      const [mode, subjectId, assetId, title, data, updatedAt, id] = params as string[]
      rows.set(id, {
        id,
        mode,
        subject_id: subjectId || null,
        asset_id: assetId || null,
        title,
        data,
        updated_at: updatedAt,
      })
      return []
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  },
}

async function run() {
  const repository = createTabletNoteRepository(fakeDb)
  const now = '2026-07-08T00:00:00.000Z'

  await repository.initSchema()

  const doc = createNoteDocument({
    id: 'subject-note-1',
    mode: 'subject-handwriting-note',
    subjectId: 'physics',
    title: '受力分析',
    now,
  })

  await repository.save(doc)
  const loaded = await repository.load('subject-note-1')

  expect(loaded !== null, 'saved document should load')
  expectEqual(loaded!.mode, 'subject-handwriting-note', 'loaded mode')
  expectEqual(loaded!.subjectId, 'physics', 'loaded subject')
  expectEqual(loaded!.title, '受力分析', 'loaded title')

  await repository.save({ ...doc, title: '受力分析更新', updatedAt: '2026-07-08T01:00:00.000Z' })
  const updated = await repository.load('subject-note-1')
  expectEqual(updated!.title, '受力分析更新', 'save should update existing note')

  const subjectNotes = await repository.listBySubject('physics', 'subject-handwriting-note')
  expectEqual(subjectNotes.length, 1, 'listBySubject returns saved subject note')
  expectEqual(subjectNotes[0].id, 'subject-note-1', 'listBySubject preserves id')
}

void run()
