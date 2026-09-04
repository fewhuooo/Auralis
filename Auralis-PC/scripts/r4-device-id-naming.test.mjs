import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('PC distinguishes client device key from server device id', () => {
  const identity = read('src/auth/deviceIdentity.ts')
  const authStore = read('src/store/useAuthStore.ts')
  const realtime = read('src/services/realtimeController.ts')
  const realtimeApi = read('src/api/realtime.ts')

  assert.match(identity, /clientDeviceKey/)
  assert.match(authStore, /serverDeviceId/)
  assert.match(authStore, /clientDeviceKey/)
  assert.doesNotMatch(realtime, /getDeviceIdentity/)
  assert.match(realtime, /ServerDeviceId/)
  assert.doesNotMatch(realtimeApi, /getDeviceIdentity/)
  assert.doesNotMatch(realtimeApi, /deviceId/)
})

test('PC canonical server device id is used for local and sync boundaries', () => {
  const sync = read('src/store/useSyncStore.ts')
  const repository = read('src/services/localRepository.ts')
  const documentRuntime = read('src/services/documentProcessing/runtime.ts')

  assert.match(sync, /serverDeviceId/)
  assert.match(repository, /serverDeviceId/)
  assert.match(documentRuntime, /serverDeviceId/)
})
