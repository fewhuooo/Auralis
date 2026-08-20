export interface LocalStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
  key?(index: number): string | null
  readonly length?: number
}

export type LegacyMigrationChoice = 'import_current_account' | 'keep_unassigned'

export interface LegacyUnassignedBackup {
  schemaVersion: 1
  capturedAt: string
  entries: Record<string, string>
  migrationChoice?: LegacyMigrationChoice
  importedIntoUserId?: string
}

export const LEGACY_UNASSIGNED_BACKUP_KEY = 'auralis:legacy_unassigned:v1'

// These are the old, account-less business keys. They are read only during
// backup and are never silently assigned to a newly authenticated account.
export const LEGACY_BUSINESS_KEYS = [
  'auralis_knowledge_blocks',
  'auralis_task_blocks',
  'auralis_subjects',
  'auralis_source_files',
  'auralis_local_mutations',
  'auralis_chat_sessions',
  'auralis_chat_messages',
  'auralis_sync_metadata',
]

function readBackup(storage: LocalStorageLike): LegacyUnassignedBackup | null {
  const raw = storage.getItem(LEGACY_UNASSIGNED_BACKUP_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LegacyUnassignedBackup
    if (parsed?.schemaVersion !== 1 || !parsed.entries) return null
    return parsed
  } catch {
    return null
  }
}

/** Copies old unowned values into a recoverable namespace and never removes them. */
export function backupLegacyUnassignedData(
  storage: LocalStorageLike,
  now = () => new Date().toISOString(),
): LegacyUnassignedBackup | null {
  const existing = readBackup(storage)
  if (existing) return existing

  const entries: Record<string, string> = {}
  for (const key of LEGACY_BUSINESS_KEYS) {
    const value = storage.getItem(key)
    if (value !== null) entries[key] = value
  }
  if (Object.keys(entries).length === 0) return null

  const backup: LegacyUnassignedBackup = {
    schemaVersion: 1,
    capturedAt: now(),
    entries,
  }
  storage.setItem(LEGACY_UNASSIGNED_BACKUP_KEY, JSON.stringify(backup))
  return backup
}

export function getLegacyUnassignedBackup(storage: LocalStorageLike): LegacyUnassignedBackup | null {
  return readBackup(storage)
}

/** Records an explicit user choice; it does not delete the backup. */
export function recordLegacyMigrationChoice(
  storage: LocalStorageLike,
  choice: LegacyMigrationChoice,
  userId?: string,
): LegacyUnassignedBackup | null {
  const backup = readBackup(storage)
  if (!backup) return null
  const updated: LegacyUnassignedBackup = {
    ...backup,
    migrationChoice: choice,
    ...(choice === 'import_current_account' && userId ? { importedIntoUserId: userId } : {}),
  }
  storage.setItem(LEGACY_UNASSIGNED_BACKUP_KEY, JSON.stringify(updated))
  return updated
}
