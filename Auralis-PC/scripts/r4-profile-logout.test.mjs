import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { t } from '../src/i18n.ts'
import { profileMessages } from '../src/views/Profile/profileMessages.ts'

test('Profile confirms logout and only reports or navigates for the active login', async () => {
  const profileSource = await readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8')

  assert.match(profileSource, /@click="handleLogout"/, 'Must bind handleLogout to a button')
  assert.match(profileSource, /@click="handleLogout">\{\{ t\(profileMessages\.signOut\) \}\}/, 'Must display the sign-out label')
  const handlerSource = profileSource.match(/^const handleLogout = async \(\) => \{[\s\S]*?^\}/m)?.[0]
  assert.ok(handlerSource)
  class SyncScopeChangedError extends Error {}
  const createHandler = new Function('authStore', 'ElMessageBox', 'ElNotification', 'router', 'SyncScopeChangedError', 'console', 't', 'profileMessages',
    `${handlerSource}\nreturn handleLogout`)
  const cases = [
    { label: 'current logout succeeds', authenticated: false, effects: ['已退出登录', '/login'] },
    { label: 'current logout fails on the server', authenticated: false, error: new Error('network'), effects: ['登出异常', '/login'] },
    { label: 'logout is rejected after the login changes', authenticated: true, error: new SyncScopeChangedError(), effects: [] },
    { label: 'login changes just before an old logout continuation', authenticated: true, effects: [] },
    { label: 'login changes during confirmation', authenticated: true, switchOnConfirm: true, effects: [] },
  ]
  for (const scenario of cases) {
    const effects = []
    let logoutCalls = 0
    const authStore = {
      loginGeneration: Symbol('active-login'),
      isAuthenticated: true,
      async logout() {
        logoutCalls += 1
        authStore.isAuthenticated = scenario.authenticated
        if (scenario.error) throw scenario.error
      },
    }
    const confirm = async () => {
      if (scenario.switchOnConfirm) authStore.loginGeneration = Symbol('new-login')
      return 'confirm'
    }
    const handleLogout = createHandler(authStore, { confirm }, ({ title }) => effects.push(title), {
      async push(path) { effects.push(path) },
    }, SyncScopeChangedError, { warn() {} }, t, profileMessages)

    await handleLogout()

    assert.equal(logoutCalls, scenario.switchOnConfirm ? 0 : 1, scenario.label)
    assert.deepEqual(effects, scenario.effects, scenario.label)
  }
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

  assert.match(requestSource, /authStore\.requireReauthentication\(/)
  assert.doesNotMatch(requestSource, /void useAuthStore\(\)\.logout\(\)\.catch\(/)
})
