import { localDb } from './localDb'
import { createTabletNoteRepository } from './tabletNoteRepositoryCore'

export const tabletNoteRepository = createTabletNoteRepository(localDb)
