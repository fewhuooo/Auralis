const DB_NAME = 'auralis_avatar_cache'
const STORE_NAME = 'avatars'
const DB_VERSION = 1

interface AvatarRecord {
  userId: string
  blob: Blob
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error || new Error('Failed to open avatar cache'))
  })
}

export async function getAvatarCache(userId: string): Promise<Blob | null> {
  if (!userId) return null

  try {
    const db = await openDatabase()
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(userId)
      let result: Blob | null = null

      request.onsuccess = () => {
        const record = request.result as AvatarRecord | undefined
        if (record?.blob instanceof Blob && record.blob.size > 0) result = record.blob
      }
      request.onerror = () => reject(request.error || new Error('Failed to read avatar cache'))
      tx.oncomplete = () => {
        db.close()
        resolve(result)
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error || new Error('Failed to read avatar cache'))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error || new Error('Avatar cache read was aborted'))
      }
    })
  } catch (error) {
    console.warn('[AvatarCache] Failed to read cached avatar:', error)
    return null
  }
}

export async function saveAvatarCache(userId: string, blob: Blob): Promise<void> {
  if (!userId || !(blob instanceof Blob) || blob.size === 0) return

  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put({ userId, blob } satisfies AvatarRecord)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error || new Error('Failed to save avatar cache'))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error || new Error('Avatar cache write was aborted'))
      }
    })
  } catch (error) {
    console.warn('[AvatarCache] Failed to save avatar to cache:', error)
  }
}

export async function deleteAvatarCache(userId: string): Promise<void> {
  if (!userId) return

  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(userId)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error || new Error('Failed to remove avatar cache'))
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error || new Error('Avatar cache deletion was aborted'))
      }
    })
  } catch (error) {
    console.warn('[AvatarCache] Failed to delete cached avatar:', error)
  }
}
