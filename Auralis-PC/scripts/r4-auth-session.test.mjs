import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createAuthSessionState,
  isPublicAuthPath,
  shouldBlockProtectedRequest,
} from '../src/auth/authSessionState.ts'

test('invalidating a refresh session enters a bounded re-authentication state', () => {
  const state = createAuthSessionState()

  state.markAuthenticated()
  assert.equal(state.status, 'authenticated')
  assert.equal(state.canStartProtectedRequest(), true)

  state.requireReauthentication('refresh session was revoked')
  assert.equal(state.status, 'reauthentication-required')
  assert.equal(state.reason, 'refresh session was revoked')
  assert.equal(state.canStartProtectedRequest(), false)

  state.requireReauthentication('a second 401 must not reopen background work')
  assert.equal(state.status, 'reauthentication-required')
  assert.equal(state.canStartProtectedRequest(), false)
})

test('blocks protected requests while allowing login and registration recovery paths', () => {
  assert.equal(isPublicAuthPath('/api/auth/login'), true)
  assert.equal(isPublicAuthPath('/api/auth/register'), true)
  assert.equal(isPublicAuthPath('/api/auth/refresh'), true)
  assert.equal(isPublicAuthPath('/api/auth/logout'), false)
  assert.equal(isPublicAuthPath('/api/assets/asset-1/download-url'), false)
  assert.equal(shouldBlockProtectedRequest('/api/auth/login', true), false)
  assert.equal(shouldBlockProtectedRequest('/api/auth/refresh', true), false)
  assert.equal(shouldBlockProtectedRequest('/api/assets/asset-1/download-url', true), true)
  assert.equal(shouldBlockProtectedRequest('/actuator/health', true), false)
})

test('production boundaries use the auth gate and browser JSZip entry', async () => {
  const [request, sync, source, vite] = await Promise.all([
    readFile(new URL('../src/api/request.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/useSyncStore.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/useSourceStore.ts', import.meta.url), 'utf8'),
    readFile(new URL('../vite.config.ts', import.meta.url), 'utf8'),
  ])

  assert.match(request, /shouldBlockProtectedRequest\(/)
  assert.match(request, /requireReauthentication\(/)
  assert.match(sync, /if \(!useAuthStore\(\)\.isAuthenticated\) return/)
  assert.match(source, /if \(!useAuthStore\(\)\.isAuthenticated\) return/)
  assert.match(vite, /node_modules\/jszip\/dist\/jszip\.min\.js/)
  assert.doesNotMatch(vite, /stream-browserify|rollup-plugin-node-polyfills/)
})
