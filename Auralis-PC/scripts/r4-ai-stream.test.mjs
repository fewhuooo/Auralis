import { register } from 'node:module'
const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = "export async function resolve(specifier, context, nextResolve) { if (specifier.startsWith('@/')) { const root = '" + srcRootUrl + "'; const subPath = specifier.slice(2); const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts'; return nextResolve(new URL(withExt, root).href, context); } if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) { return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context); } return nextResolve(specifier, context); }"
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)
import assert from 'node:assert/strict'
import test from 'node:test'

import { reduceAiStreamEvent } from '../src/services/aiStreamReducer.ts'
import { AiStreamController } from '../src/services/aiStreamController.ts'

test('reduces deltas into one assistant message and keeps citation order stable', () => {
  let result = { content: '', citations: [] }
  result = reduceAiStreamEvent(result, { event: 'message.started', data: { messageId: 'm-1' } })
  result = reduceAiStreamEvent(result, { event: 'message.delta', data: '第一段' })
  result = reduceAiStreamEvent(result, { event: 'message.delta', data: '第二段' })
  result = reduceAiStreamEvent(result, { event: 'citation', data: { sourceId: 's-1', chunkId: 'c-1', ordinal: 1 } })
  result = reduceAiStreamEvent(result, { event: 'citation', data: { sourceId: 's-1', chunkId: 'c-1', ordinal: 1 } })
  result = reduceAiStreamEvent(result, { event: 'message.completed', data: { content: 'ignored because deltas exist' } })

  assert.equal(result.content, '第一段第二段')
  assert.equal(result.citations.length, 1)
  assert.equal(result.citations[0].ordinal, 1)
})

test('uses completed content when a provider sends no delta', () => {
  const result = reduceAiStreamEvent(
    { content: '', citations: [] },
    { event: 'message.completed', data: { content: '完整回答' } },
  )
  assert.equal(result.content, '完整回答')
})

test('controller emits ordered deltas/citations and converts provider errors', async () => {
  const observed = { deltas: [], citations: [] }
  const controller = new AiStreamController(async function* () {
    yield { event: 'message.started', data: { messageId: 'm-1' } }
    yield { event: 'message.delta', data: 'first' }
    yield { event: 'citation', data: { sourceId: 's-1', chunkId: 'c-1', ordinal: 1 } }
    yield { event: 'citation', data: { sourceId: 's-1', chunkId: 'c-1', ordinal: 1 } }
    yield { event: 'message.error', data: { message: 'provider unavailable' } }
  })

  await assert.rejects(
    controller.run({ content: 'hello' }, {
      onDelta: (delta) => observed.deltas.push(delta),
      onCitation: (citation) => observed.citations.push(citation),
    }),
    (error) => error.code === 'AI_REQUEST_FAILED' && error.message === 'AI 请求失败，请重试',
  )
  assert.deepEqual(observed.deltas, ['first'])
  assert.deepEqual(observed.citations, [{ sourceId: 's-1', chunkId: 'c-1', ordinal: 1 }])
})

test('controller propagates abort without resolving as a successful response', async () => {
  let signal
  const controller = new AiStreamController(async function* (_input, streamSignal) {
    signal = streamSignal
    await new Promise((resolve) => streamSignal.addEventListener('abort', resolve, { once: true }))
    throw new DOMException('The operation was aborted.', 'AbortError')
  })

  const pending = controller.run({ content: 'hello' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(signal)
  controller.abort()
  await assert.rejects(pending, (error) => error instanceof DOMException && error.name === 'AbortError')
})


const { createPinia, setActivePinia } = await import('pinia');
const { useAuthStore } = await import('../src/store/useAuthStore.ts');
const { useChatStore } = await import('../src/store/useChatStore.ts');

class MemoryStorage {
  #values = new Map()
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null }
  setItem(key, value) { this.#values.set(key, String(value)) }
  removeItem(key) { this.#values.delete(key) }
  clear() { this.#values.clear() }
}

test('chat store omits retrieval flag, retains selectionText, and ignores unknown pending scope modes', async () => {
  globalThis.localStorage = new MemoryStorage()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setSession({
    user: { id: 'test-user', username: 'test' },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
    sessionId: 'test-session',
    serverDeviceId: 'test-device',
  })
  const chat = useChatStore()
  chat.sessions.push({
    id: 'test-conversation',
    remoteId: 'remote-test-conversation',
    creationRequestId: 'creation-request',
    title: 'test',
    version: 1,
    localOnly: false,
    purpose: 'GENERAL',
  })
  chat.activeSessionId = 'test-conversation'

  const requests = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body))
    return new Response('event: message.completed\ndata: {"content":"ok"}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  try {
    await chat.sendMessage('subject test', { retrievalMode: 'SUBJECT', subjectId: 'subj1', selectionText: 'short quote' })
    await chat.sendMessage('auto test', { retrievalMode: 'AUTO', subjectId: 'subj1', sourceId: 'src1', selectionText: 'a'.repeat(5000) })
    await chat.sendMessage('remove quote test', { retrievalMode: 'SUBJECT', subjectId: 'subj1', selectionText: '' })
    await chat.sendMessage('legacy no retrieval mode', { retrievalMode: 'NONE', subjectId: 'subj1' })
    await chat.sendMessage('unknown scoped source', { retrievalMode: 'UNKNOWN', subjectId: 'subj1', sourceId: 'src1' })
    await chat.sendMessage('default subject scope', { subjectId: 'subj1' })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(requests.length, 6)

  assert.equal(requests[0].content, 'subject test')
  assert.equal('retrievalEnabled' in requests[0], false, 'retrievalEnabled must be omitted from requests')
  assert.equal(requests[0].selectionText, 'short quote')
  assert.equal(requests[0].readingContext?.retrievalMode, 'SUBJECT')
  assert.equal(requests[0].readingContext?.subjectId, 'subj1')

  assert.equal(requests[1].content, 'auto test')
  assert.equal('retrievalEnabled' in requests[1], false, 'retrievalEnabled must be omitted from requests')
  assert.equal(requests[1].selectionText.length, 4000)
  assert.equal(requests[1].readingContext?.retrievalMode, 'AUTO')
  assert.equal(requests[1].readingContext.selectionText.length, 4000)
  assert.equal(requests[1].readingContext.subjectId, 'subj1')

  assert.equal(requests[2].content, 'remove quote test')
  assert.equal('retrievalEnabled' in requests[2], false, 'retrievalEnabled must be omitted from requests')
  assert.equal(requests[2].selectionText, undefined)
  assert.equal(requests[2].readingContext?.retrievalMode, 'SUBJECT')
  assert.equal(requests[2].readingContext?.subjectId, 'subj1')

  assert.equal(requests[3].content, 'legacy no retrieval mode')
  assert.equal('retrievalEnabled' in requests[3], false, 'retrievalEnabled must be omitted from requests')
  assert.equal(requests[3].readingContext?.retrievalMode, 'SUBJECT', 'unknown modes must use the request subject')
  assert.equal(requests[3].readingContext?.subjectId, 'subj1')
  assert.equal(requests[4].readingContext?.retrievalMode, 'AUTO')
  assert.equal(requests[4].readingContext?.currentSourceId, 'src1')
  assert.equal(requests[4].readingContext?.subjectId, 'subj1')
  assert.equal(requests[5].readingContext?.retrievalMode, 'SUBJECT')
  assert.equal(requests[5].readingContext?.subjectId, 'subj1')
  assert.ok(requests.every(request => !('retrievalEnabled' in request)))
})
