import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createStableMutation,
  isOfflineTransportFailure,
} from '../src/services/offlineWritePolicy.ts'
import { streamWithAccessTokenRefresh } from '../src/api/authenticatedSse.ts'
import { toApiProblem } from '../src/api/httpError.ts'

test('queues only transport failures and never mistakes a 5xx write response for offline state', () => {
  assert.equal(isOfflineTransportFailure({ status: 503 }), false)
  assert.equal(isOfflineTransportFailure({ status: 409 }), false)
  assert.equal(isOfflineTransportFailure({ status: 0 }), true)
  assert.equal(isOfflineTransportFailure(new TypeError('network unavailable')), true)
  assert.equal(toApiProblem({ request: {} }).status, 0)
})

test('keeps the resource and client mutation identities stable across an outbox retry', () => {
  const first = createStableMutation({
    resourceType: 'SUBJECT',
    resourceId: '0198b05b-4bde-7000-8000-000000000001',
    mutationType: 'CREATE',
    baseVersion: 0,
    clientMutationId: '0198b05b-4bde-7000-8000-000000000002',
    payload: { name: 'Algorithms' },
  })

  const retry = createStableMutation(first)
  assert.deepEqual(retry, first)
  assert.notEqual(retry.payload, first.payload)
})

test('refreshes once and retries an SSE request with the same logical stream', async () => {
  const tokens = []
  let refreshes = 0
  const open = async function* (token) {
    tokens.push(token)
    if (tokens.length === 1) throw { status: 401 }
    yield 'connected'
  }

  const received = []
  for await (const event of streamWithAccessTokenRefresh('expired', open, async () => {
    refreshes += 1
    return 'fresh'
  })) received.push(event)

  assert.deepEqual(tokens, ['expired', 'fresh'])
  assert.equal(refreshes, 1)
  assert.deepEqual(received, ['connected'])
})

test('keeps BYOK credentials out of browser request headers and browser storage', async () => {
  const [requestSource, profileSource] = await Promise.all([
    readFile(new URL('../src/api/request.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(requestSource, /X-User-(Api-Key|Base-Url)|auralis_custom_api_key/i)
  assert.match(profileSource, /\bgetAiSettings\b/)
  assert.match(profileSource, /\bupdateAiSettings\b/)
  assert.match(profileSource, /const loadAiSettings = async \(\) => \{[\s\S]*?await getAiSettings\(\)/)
  assert.match(profileSource, /const handleSaveAiSettings = async \(\) => \{[\s\S]*?await updateAiSettings\(\{/)
  assert.match(profileSource, /apiKey:\s*key \|\| undefined/)
  assert.match(profileSource, /customApiKey\.value = ''/)
  assert.doesNotMatch(profileSource, /auralis_custom_(api_key|base_url)/i)
  assert.match(
    profileSource,
    /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<!-- AI BYOK Settings -->/,
    'Profile must render the BYOK group outside the repeated preference groups',
  )
  assert.equal(
    [...profileSource.matchAll(/<div class="danger-zone">/g)].length,
    1,
    'Profile must retain exactly one danger zone after inserting the BYOK settings group',
  )
})

test('persists stable IDs needed for ordered offline AI session recovery', async () => {
  const source = await readFile(new URL('../src/store/useChatStore.ts', import.meta.url), 'utf8')

  assert.match(source, /creationRequestId:\s*uuidv7\(\)/)
  assert.match(source, /clientRequestId:\s*uuidv7\(\)/)
  assert.match(source, /clientRequestId:\s*message\.clientRequestId/)
  assert.match(source, /window\.addEventListener\('online'/)
})

test('online chat recovery is a guarded no-op without an authenticated local scope', async () => {
  const source = await readFile(new URL('../src/store/useChatStore.ts', import.meta.url), 'utf8')

  assert.match(
    source,
    /async function recoverOfflineSessions\(\): Promise<void> \{[\s\S]*const auth = useAuthStore\(\)[\s\S]*if \(!auth\.user\?\.id \|\| !auth\.serverDeviceId\) return/,
  )
  assert.match(source, /void recoverOfflineSessions\(\)\.catch\(/)
})
