import assert from 'node:assert/strict'
import test from 'node:test'

import { projectConnectionStatus } from '../src/services/connectionStatusProjection.ts'

const readyInput = {
  online: true,
  syncError: null,
  serviceUnavailable: false,
  realtime: 'connected',
  syncing: false,
  chatError: null,
}

test('projects connection states in priority order', () => {
  assert.equal(projectConnectionStatus({ ...readyInput, syncError: '503' }).level, 'error')
  assert.equal(projectConnectionStatus({ ...readyInput, online: false }).level, 'offline')
  assert.equal(projectConnectionStatus({ ...readyInput, realtime: 'reconnecting' }).level, 'reconnecting')
  assert.equal(projectConnectionStatus({ ...readyInput, syncing: true }).level, 'syncing')
  assert.equal(projectConnectionStatus(readyInput).level, 'ready')
})

test('keeps sync errors visible after browser connectivity returns', () => {
  const projection = projectConnectionStatus({ ...readyInput, syncError: '503' })
  assert.deepEqual(projection, {
    level: 'error',
    code: '503',
    message: '503',
    retryable: true,
  })
})

test('surfaces a chat error instead of reporting sync success', () => {
  const projection = projectConnectionStatus({ ...readyInput, chatError: '问答请求失败' })
  assert.equal(projection.level, 'error')
  assert.equal(projection.code, 'SERVICE_UNAVAILABLE')
  assert.equal(projection.message, '问答请求失败')
  assert.equal(projection.retryable, true)
})
