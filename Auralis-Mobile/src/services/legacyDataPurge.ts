import { getStorageItem, removeStorageItem, setStorageItem } from '@/platform/storage'

const PURGE_MARKER = 'auralis:legacy-local-data-purged:v2'
const LEGACY_TABLES = [
  'sync_metadata',
  'local_mutations',
  'knowledge_blocks',
  'task_blocks',
  'subjects',
  'source_files',
  'tablet_notes',
]

declare const plus: any

function executeLegacySql(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    plus.sqlite.executeSql({
      name: 'auralis',
      sql,
      success: resolve,
      fail: reject,
    })
  })
}

export async function purgeLegacyLocalData(): Promise<void> {
  if (getStorageItem(PURGE_MARKER)) return
  if (typeof plus === 'undefined' || !plus.sqlite) {
    for (const table of LEGACY_TABLES) removeStorageItem(`h5_db_${table}`)
    setStorageItem(PURGE_MARKER, new Date().toISOString())
    return
  }

  const identity = { name: 'auralis', path: '_doc/auralis.db' }
  const wasOpen = plus.sqlite.isOpenDatabase(identity)
  if (!wasOpen) {
    await new Promise<void>((resolve, reject) => plus.sqlite.openDatabase({
      ...identity,
      success: resolve,
      fail: reject,
    }))
  }
  try {
    for (const table of LEGACY_TABLES) await executeLegacySql(`DROP TABLE IF EXISTS ${table}`)
    setStorageItem(PURGE_MARKER, new Date().toISOString())
  } finally {
    if (!wasOpen) {
      await new Promise<void>((resolve) => plus.sqlite.closeDatabase({
        name: identity.name,
        success: resolve,
        fail: resolve,
      }))
    }
  }
}
