import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPublicAuthPath,
  shouldBlockProtectedRequest,
} from '../src/auth/authSessionState.ts'

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
