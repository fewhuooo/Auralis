import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Profile provides a logout button that properly calls the auth store and handles errors', async () => {
  const profileSource = await readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8')

  assert.match(profileSource, /@click="handleLogout"/, 'Must bind handleLogout to a button')
  assert.match(profileSource, /退出登录/, 'Must contain Chinese text for logout')
  assert.match(profileSource, /ElMessageBox\.confirm\(/, 'Must prompt for confirmation before logging out')
  assert.match(profileSource, /await authStore\.logout\(\)/, 'Must call authStore.logout()')
  assert.match(profileSource, /catch\s*\([^)]*\)\s*\{[\s\S]*?ElNotification/, 'Must provide UI feedback on failure')
  assert.match(profileSource, /finally\s*\{[\s\S]*?router\.push\(['"`]\/login['"`]\)/, 'Must redirect to /login regardless of success or failure')
})

test('authStore.logout rethrows errors for the UI to handle', async () => {
  const storeSource = await readFile(new URL('../src/store/useAuthStore.ts', import.meta.url), 'utf8')

  assert.match(
    storeSource,
    /catch\s*\([^)]*\)\s*\{[\s\S]*?throw\s+error[\s\S]*?\}\s*finally\s*\{/,
    'Must rethrow error and clear session in finally block',
  )
})

test('auth refresh failure enters re-authentication without recursively calling protected logout', async () => {
  const requestSource = await readFile(new URL('../src/api/request.ts', import.meta.url), 'utf8')

  assert.match(requestSource, /useAuthStore\(\)\.requireReauthentication\(/)
  assert.doesNotMatch(requestSource, /void useAuthStore\(\)\.logout\(\)\.catch\(/)
})
