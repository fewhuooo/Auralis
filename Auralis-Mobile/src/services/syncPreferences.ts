const AUTO_SYNC_STORAGE_KEY = 'auralis.settings.autoSync'

export interface PreferenceStorage {
  get(key: string): unknown
  set(key: string, value: string): void
}

export function readAutoSyncPreference(storage: Pick<PreferenceStorage, 'get'>): boolean {
  try {
    const raw = storage.get(AUTO_SYNC_STORAGE_KEY)
    if (raw === false || raw === 'false') return false
    if (raw === true || raw === 'true') return true
  } catch {
    // Ignore storage read errors and preserve default enabled state
  }
  return true
}

export function writeAutoSyncPreference(storage: Pick<PreferenceStorage, 'set'>, enabled: boolean): boolean {
  try {
    storage.set(AUTO_SYNC_STORAGE_KEY, String(enabled))
  } catch {
    // Keep runtime value even if storage is unavailable
  }
  return enabled
}
