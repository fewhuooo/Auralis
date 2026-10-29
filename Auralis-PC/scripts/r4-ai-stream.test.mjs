import { register } from 'node:module'
const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const withExt = specifier.endsWith('.ts') ? specifier : specifier + '.ts'
    return nextResolve(new URL(withExt.slice(2), '${srcRootUrl}').href, context)
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL
    && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context)
  }
  return nextResolve(specifier, context)
}`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createChatStreamState,
  reduceChatStreamEvent,
} from '../src/services/aiStreamReducer.ts'
import { AiStreamController } from '../src/services/aiStreamController.ts'

const makeEnvelope = (overrides = {}) => ({
  protocolVersion: 1,
  conversationId: 'c-1',
  requestId: 'req-1',
  runId: 'r-1',
  attemptId: 'att-1',
  userMessageId: 'user-1',
  replyMessageId: 'reply-1',
  iterationId: null,
  blockId: null,
  sequence: 1,
  event: 'text.delta',
  payload: { text: 'Hello', publicTextDelta: 'Hello' },
  ...overrides,
})

test('reduces text deltas into publicText and text part', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, makeEnvelope({ sequence: 1, payload: { text: 'Hello ', publicTextDelta: 'Hello ' } }))
  state = reduceChatStreamEvent(state, makeEnvelope({ sequence: 2, payload: { text: 'World', publicTextDelta: 'World' } }))

  assert.equal(state.publicText, 'Hello World')
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].kind, 'text')
  assert.equal(state.parts[0].text, 'Hello World')
})

test('reduces block start, item increments, and completed part', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 1,
      event: 'block.started',
      blockId: 'b-1',
      payload: { componentId: 'b-1', component: 'quiz' },
    })
  )
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].kind, 'block')
  assert.equal(state.parts[0].state, 'GENERATING')

  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 2,
      event: 'block.item',
      blockId: 'b-1',
      payload: {
        componentId: 'b-1',
        component: 'quiz',
        row: { type: 'stem', question: 'What is 1+1?', questionType: 'single' },
      },
    })
  )
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 3,
      event: 'block.item',
      blockId: 'b-1',
      payload: {
        componentId: 'b-1',
        component: 'quiz',
        row: { type: 'option', key: 'A', text: '2' },
      },
    })
  )

  const serverPart = {
    id: 'b-1',
    componentId: 'b-1',
    kind: 'block',
    component: 'quiz',
    state: 'READY',
    questionId: 'q-1',
    meta: { question: 'What is 1+1?', questionType: 'single' },
    items: [{ key: 'A', text: '2' }, { key: 'B', text: '3' }],
  }

  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 4,
      event: 'block.completed',
      blockId: 'b-1',
      payload: { componentId: 'b-1', part: serverPart },
    })
  )

  assert.equal(state.parts.length, 1)
  const block = state.parts[0]
  assert.equal(block.kind, 'block')
  assert.equal(block.state, 'READY')
  assert.equal(block.items.length, 2)
})

test('activity.submitted in-place updates original card to SUBMITTED with submittedAnswer', () => {
  let state = createChatStreamState()
  const readyPart = {
    id: 'b-1',
    componentId: 'b-1',
    kind: 'block',
    component: 'quiz',
    state: 'READY',
    questionId: 'q-1',
    meta: { question: 'What is 1+1?', questionType: 'single' },
    items: [{ key: 'A', text: '2' }, { key: 'B', text: '3' }],
  }
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 1,
      event: 'block.completed',
      payload: { componentId: 'b-1', part: readyPart },
    })
  )
  assert.equal(state.parts[0].state, 'READY')

  const submittedPart = {
    ...readyPart,
    state: 'SUBMITTED',
    submittedAnswer: ['A'],
  }

  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 2,
      event: 'activity.submitted',
      userMessageId: 'user-submit-id',
      payload: { activityId: 'q-1', part: submittedPart },
    })
  )

  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].state, 'SUBMITTED')
  assert.deepEqual(state.parts[0].submittedAnswer, ['A'])
})

test('activity.submitted does not append a duplicate block part if not present in current stream', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 1,
      event: 'activity.submitted',
      userMessageId: 'user-submit-id',
      payload: {
        activityId: 'q-history',
        part: {
          id: 'b-history',
          componentId: 'b-history',
          kind: 'block',
          component: 'quiz',
          state: 'SUBMITTED',
          meta: {},
          items: [],
        },
      },
    })
  )
  assert.equal(state.parts.length, 0)
})

test('drops duplicate sequences and stale attempts', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({ sequence: 1, attemptId: 'att-1', payload: { text: 'A', publicTextDelta: 'A' } })
  )
  // Duplicate sequence
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({ sequence: 1, attemptId: 'att-1', payload: { text: 'A-dup', publicTextDelta: 'A-dup' } })
  )
  assert.equal(state.publicText, 'A')

  // Smaller sequence
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({ sequence: 0, attemptId: 'att-1', payload: { text: 'old', publicTextDelta: 'old' } })
  )
  assert.equal(state.publicText, 'A')

  // Different conversation
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({ sequence: 2, conversationId: 'other-convo', payload: { text: 'other', publicTextDelta: 'other' } })
  )
  assert.equal(state.publicText, 'A')
})

test('tracks tool started, completed, and error capsules', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 1,
      event: 'tool.started',
      payload: { toolCallId: 't-1', name: 'search_materials' },
    })
  )
  assert.equal(state.tools.length, 1)
  assert.equal(state.tools[0].status, 'RUNNING')

  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 2,
      event: 'tool.completed',
      payload: { toolCallId: 't-1' },
    })
  )
  assert.equal(state.tools[0].status, 'COMPLETED')

  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 3,
      event: 'tool.started',
      payload: { toolCallId: 't-2', name: 'read_excerpt' },
    })
  )
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 4,
      event: 'tool.error',
      payload: { toolCallId: 't-2', safeErrorCode: 'EXCERPT_NOT_FOUND' },
    })
  )
  assert.equal(state.tools[1].status, 'FAILED')
})

test('controller runs protocol 1 stream and handles abort cleanly', async () => {
  const controller = new AiStreamController(async function* (_input, signal) {
    yield makeEnvelope({ sequence: 1, payload: { text: 'part 1', publicTextDelta: 'part 1' } })
    if (signal.aborted) return
    yield makeEnvelope({
      sequence: 2,
      event: 'run.completed',
      payload: { executionActive: false },
    })
  })

  const state = await controller.run({
    protocolVersion: 1,
    action: 'turn',
    conversationId: 'c-1',
    requestId: 'r-1',
    content: 'hello',
  })

  assert.equal(state.publicText, 'part 1')
  assert.equal(state.executionActive, false)
  assert.equal(state.terminal, 'COMPLETED')
})

test('controller abort throws AbortError', async () => {
  const controller = new AiStreamController(async function* (_input, signal) {
    yield makeEnvelope({ sequence: 1, payload: { text: 'start' } })
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  })

  const pending = controller.run({
    protocolVersion: 1,
    action: 'turn',
    conversationId: 'c-1',
    requestId: 'r-1',
    content: 'hello',
  })
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort()
  await assert.rejects(pending, (err) => err instanceof DOMException && err.name === 'AbortError')
})

test('preserves sequential order for text -> block -> text and starts new text part', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, makeEnvelope({ sequence: 1, payload: { text: '正文 A', publicTextDelta: '正文 A' } }))
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].kind, 'text')
  assert.equal(state.parts[0].text, '正文 A')

  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 2,
    event: 'block.started',
    blockId: 'chart-1',
    payload: { componentId: 'chart-1', component: 'chart' },
  }))
  assert.equal(state.parts.length, 2)
  assert.equal(state.parts[1].kind, 'block')

  state = reduceChatStreamEvent(state, makeEnvelope({ sequence: 3, payload: { text: '正文 B', publicTextDelta: '正文 B' } }))
  assert.equal(state.parts.length, 3)
  assert.equal(state.parts[0].text, '正文 A')
  assert.equal(state.parts[1].kind, 'block')
  assert.equal(state.parts[2].kind, 'text')
  assert.equal(state.parts[2].text, '正文 B')
})

test('captures safeErrorCode in run.failed', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 1,
    event: 'run.failed',
    payload: { safeErrorCode: 'RATE_LIMIT_EXCEEDED' },
  }))
  assert.equal(state.terminal, 'FAILED')
  assert.equal(state.executionActive, false)
  assert.equal(state.safeErrorCode, 'RATE_LIMIT_EXCEEDED')
})

test('controller returns state with undefined terminal when stream EOF occurs prematurely', async () => {
  const controller = new AiStreamController(async function* () {
    yield makeEnvelope({ sequence: 1, payload: { text: 'partial content', publicTextDelta: 'partial content' } })
  })

  const state = await controller.run({
    protocolVersion: 1,
    action: 'turn',
    conversationId: 'c-1',
    requestId: 'r-1',
    content: 'hello',
  })

  assert.equal(state.publicText, 'partial content')
  assert.equal(state.terminal, undefined)
  assert.equal(state.executionActive, true)
})

