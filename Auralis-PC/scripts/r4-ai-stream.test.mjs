import assert from 'node:assert/strict'
import test from 'node:test'

import { reduceAiStreamEvent } from '../src/services/aiStreamReducer.ts'

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
