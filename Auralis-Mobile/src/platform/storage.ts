function storageApi(): Storage | null {
  if (typeof globalThis.localStorage === 'undefined') return null
  return globalThis.localStorage
}

export function getStorageItem(key: string): string | null {
  const storage = storageApi()
  if (!storage) return null
  return storage.getItem(key)
}

export function setStorageItem(key: string, value: string): void {
  const storage = storageApi()
  if (!storage) return
  storage.setItem(key, value)
}

export function removeStorageItem(key: string): void {
  const storage = storageApi()
  if (!storage) return
  storage.removeItem(key)
}

export function getStorageJson<T>(key: string): T | null {
  const raw = getStorageItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setStorageJson(key: string, value: unknown): void {
  setStorageItem(key, JSON.stringify(value))
}
