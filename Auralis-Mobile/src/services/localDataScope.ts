const SCOPE_STORAGE_KEY = 'auralis:local-data-scope:v2'
const LEGACY_SCOPE = 'legacy-unassigned'
let resetSequence = 0

export interface ScopeStorage {
  get(key: string): unknown
  set(key: string, value: string): void
}

function stableScopeId(userId: string, serverDeviceId: string): string {
  const input = `${userId}:${serverDeviceId}`
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `user-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function createLocalDataScope(storage: ScopeStorage) {
  return {
    current(): string {
      const value = storage.get(SCOPE_STORAGE_KEY)
      return typeof value === 'string' && value ? value : LEGACY_SCOPE
    },
    activate(userId: string, serverDeviceId: string): string {
      const baseScope = stableScopeId(userId, serverDeviceId)
      const saved = storage.get(`${SCOPE_STORAGE_KEY}:${baseScope}`)
      const scope = typeof saved === 'string' && saved ? saved : baseScope
      storage.set(SCOPE_STORAGE_KEY, scope)
      storage.set(`${SCOPE_STORAGE_KEY}:${baseScope}`, scope)
      return scope
    },
    reset(userId: string, serverDeviceId: string): string {
      const baseScope = stableScopeId(userId, serverDeviceId)
      resetSequence += 1
      const scope = `${baseScope}-reset-${Date.now().toString(36)}-${resetSequence}`
      storage.set(SCOPE_STORAGE_KEY, scope)
      storage.set(`${SCOPE_STORAGE_KEY}:${baseScope}`, scope)
      return scope
    },
  }
}

export const localDataScope = createLocalDataScope({
  get: (key) => uni.getStorageSync(key),
  set: (key, value) => uni.setStorageSync(key, value),
})
