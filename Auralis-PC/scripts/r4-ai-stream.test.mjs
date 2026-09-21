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
