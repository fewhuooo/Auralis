import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Mobile distinguishes client device key from server device id', () => {
  const identity = read('src/api/deviceIdentity.ts')
  const authStore = read('src/store/useAuthStore.ts')
  const realtime = read('src/api/realtimeApi.ts')
  const sync = read('src/store/useSyncStore.ts')

  assert.match(identity, /clientDeviceKey/)
  assert.match(authStore, /serverDeviceId/)
  assert.match(authStore, /clientDeviceKey/)
  assert.doesNotMatch(realtime, /deviceId/)
  assert.match(sync, /serverDeviceId/)
  assert.match(authStore, /!parsed\?\.serverDeviceId/)
  assert.match(authStore, /removeStorageItem\(AUTH_STORAGE_KEY\)/)
  assert.match(authStore, /serverDeviceId\.value = ''/)
  assert.match(authStore, /isAuthenticated = computed\(\(\) => Boolean\(token\.value && user\.value\?\.id && serverDeviceId\.value\)\)/)
})
