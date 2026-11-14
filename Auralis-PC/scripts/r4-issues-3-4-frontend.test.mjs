import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { projectConnectionStatus } from '../src/services/connectionStatusProjection.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = file => readFile(path.join(root, file), 'utf8')

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

test('sidebar consumes the unified connection projection', async () => {
  const sidebar = await read('src/components/layout/AppSidebar.vue')
  assert.match(sidebar, /connectionProjection\.message/)
  assert.match(sidebar, /connectionProjection\.retryable/)
  assert.doesNotMatch(sidebar, /useSyncStore|useChatStore|realtimeController|auralis-realtime-status/)
  assert.doesNotMatch(sidebar, /三端同步就绪/)
})

test('App owns connection projection assembly and live status subscriptions', async () => {
  const app = await read('src/App.vue')
  assert.match(app, /projectConnectionStatus/)
  assert.match(app, /connectionProjection/)
  assert.match(app, /auralis-realtime-status/)
  assert.match(app, /online|offline/)
})

test('generic API availability updates the global connection projection', async () => {
  const [app, request] = await Promise.all([
    read('src/App.vue'),
    read('src/api/request.ts'),
  ])
  assert.doesNotMatch(app, /serviceUnavailable:\s*false/)
  assert.match(app, /serviceUnavailable:\s*serviceUnavailable\.value/)
  assert.match(request, /serviceAvailabilityRequestId\s*=\s*beginServiceRequest\(\)/)
  assert.match(request, /observeServiceAvailable\(config\.serviceAvailabilityRequestId\)/)
  assert.match(request, /observeServiceFailure\(originalRequest\?\.serviceAvailabilityRequestId, error\.response\?\.status, error\.code\)/)
  assert.match(request, /observeServiceFailure\(/)
  assert.match(request, /observeServiceAvailable\(/)

  const availability = await import('../src/services/serviceAvailability.ts')
  assert.equal(typeof availability.beginServiceRequest, 'function')
  const clientErrorRequest = availability.beginServiceRequest()
  availability.observeServiceFailure(clientErrorRequest, 400, undefined)
  assert.equal(availability.serviceUnavailable.value, false, 'Client errors do not mark the service unavailable')
  const oldRequest = availability.beginServiceRequest()
  const newerFailure = availability.beginServiceRequest()
  availability.observeServiceFailure(newerFailure, 503, undefined)
  assert.equal(availability.serviceUnavailable.value, true)
  availability.observeServiceAvailable(oldRequest)
  assert.equal(availability.serviceUnavailable.value, true, 'A delayed success from an older request must not clear a newer failure')
  const canceledRequest = availability.beginServiceRequest()
  availability.observeServiceFailure(canceledRequest, undefined, 'ERR_CANCELED')
  assert.equal(availability.serviceUnavailable.value, true, 'Axios cancellation must not be treated as a service failure')
  const networkFailure = availability.beginServiceRequest()
  availability.observeServiceFailure(networkFailure, undefined, 'ERR_NETWORK')
  assert.equal(availability.serviceUnavailable.value, true)
  const newerClientError = availability.beginServiceRequest()
  availability.observeServiceFailure(newerClientError, 400, undefined)
  assert.equal(availability.serviceUnavailable.value, false, 'An HTTP client response confirms the server is reachable')
  const currentNetworkFailure = availability.beginServiceRequest()
  availability.observeServiceFailure(currentNetworkFailure, undefined, 'ERR_NETWORK')
  assert.equal(availability.serviceUnavailable.value, true)
  const currentSuccess = availability.beginServiceRequest()
  availability.observeServiceAvailable(currentSuccess)
  assert.equal(availability.serviceUnavailable.value, false)
  const canceledWhileAvailable = availability.beginServiceRequest()
  availability.observeServiceFailure(canceledWhileAvailable, undefined, 'ERR_CANCELED')
  assert.equal(availability.serviceUnavailable.value, false, 'Axios cancellation must not mark a reachable service as unavailable')
  assert.equal(projectConnectionStatus({ ...readyInput, serviceUnavailable: availability.serviceUnavailable.value }).level, 'ready')
})

test('Profile password copy describes one-way hashing', async () => {
  const profile = await read('src/views/Profile/index.vue')
  assert.match(profile, /密码采用单向哈希保存/)
  assert.doesNotMatch(profile, /凭证加密托管/)
})

test('workspace renders chat errors inside the chat region', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /role="alert"/)
  assert.match(workspace, /lastError/)
})
