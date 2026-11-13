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
const { AiStreamController } = await import('../src/services/aiStreamController.ts')

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
  assert.deepEqual(state.parts[0].meta, { question: 'What is 1+1?', questionType: 'single' })
  assert.deepEqual(state.parts[0].items, [{ key: 'A', text: '2' }])

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

test('field completeness guard rejects incomplete item fragments during streaming', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 1,
      event: 'block.started',
      blockId: 'steps-1',
      payload: { componentId: 'steps-1', component: 'steps' },
    })
  )

  // Empty title fragment should be guarded
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 2,
      event: 'block.item',
      blockId: 'steps-1',
      payload: {
        componentId: 'steps-1',
        component: 'steps',
        row: { type: 'item', title: '' },
      },
    })
  )
  assert.equal(state.parts[0].items.length, 0)

  // Substantive complete item passes through
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 3,
      event: 'block.item',
      blockId: 'steps-1',
      payload: {
        componentId: 'steps-1',
        component: 'steps',
        row: { type: 'item', title: '初始化状态机', description: '构建分块解析器' },
      },
    })
  )
  assert.equal(state.parts[0].items.length, 1)
  assert.equal(state.parts[0].items[0].title, '初始化状态机')
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


test('block.error transitions GENERATING block into INVALID state', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 1,
    event: 'block.started',
    blockId: 'quiz-block-1',
    payload: { componentId: 'quiz-block-1', component: 'quiz' },
  }))
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].state, 'GENERATING')

  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 2,
    event: 'block.error',
    blockId: 'quiz-block-1',
    payload: {
      componentId: 'quiz-block-1',
      safeErrorCode: 'CHAT_BLOCK_INVALID',
      publicTextDelta: '\n',
    },
  }))

  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].state, 'INVALID')
})

test('visualization retry replaces preceding invalid block in place without stacking error card', () => {
  let state = createChatStreamState()
  // Iteration 1: bad display tool started then encountered error
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 1,
    event: 'block.started',
    blockId: 'bad-display',
    payload: { componentId: 'bad-display', component: 'steps' },
  }))
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 2,
    event: 'block.error',
    blockId: 'bad-display',
    payload: { componentId: 'bad-display', safeErrorCode: 'CHAT_TOOL_ARGUMENT_INVALID', publicTextDelta: '\n' },
  }))
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].state, 'INVALID')

  // Iteration 2: backend retried with corrected display tool while stream is active
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 3,
    event: 'block.started',
    blockId: 'corrected-display',
    payload: { componentId: 'corrected-display', component: 'steps' },
  }))

  // The invalid block should be replaced in place rather than stacked as a second card
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].componentId, 'corrected-display')
  assert.equal(state.parts[0].state, 'GENERATING')

  // Completing the retried block
  const serverPart = {
    id: 'corrected-display',
    componentId: 'corrected-display',
    kind: 'block',
    component: 'steps',
    state: 'READY',
    meta: { title: 'Corrected Steps' },
    items: [{ title: 'Step 1' }],
  }
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 4,
    event: 'block.completed',
    blockId: 'corrected-display',
    payload: { componentId: 'corrected-display', part: serverPart },
  }))
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].state, 'READY')
  assert.equal(state.parts[0].meta.title, 'Corrected Steps')
})

test('run.completed and run.failed transition any dangling GENERATING blocks to INVALID', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 1,
    event: 'block.started',
    blockId: 'quiz-block-2',
    payload: { componentId: 'quiz-block-2', component: 'quiz' },
  }))
  assert.equal(state.parts[0].state, 'GENERATING')

  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 2,
    event: 'run.completed',
    payload: { executionActive: false },
  }))
  assert.equal(state.parts[0].state, 'INVALID')
})

test('reduces reasoning deltas into reasoningText', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 1,
    event: 'reasoning.delta',
    payload: { text: '先检索第一点证据。' },
  }))
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 2,
    event: 'reasoning.delta',
    payload: { text: '然后总结结论。' },
  }))
  assert.equal(state.reasoningText, '先检索第一点证据。然后总结结论。')
  // reasoning does not pollute publicText or parts
  assert.equal(state.publicText, '')
  assert.equal(state.parts.length, 0)
})

test('preserves replyMessageId and reasoningText on terminal run.completed', () => {
  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 1,
    replyMessageId: 'reply-msg-42',
    event: 'reasoning.delta',
    payload: { text: 'Deep thinking process' },
  }))
  assert.equal(state.replyMessageId, 'reply-msg-42')
  assert.equal(state.reasoningText, 'Deep thinking process')

  // On run.completed, server sends null replyMessageId at top level and ID in payload
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 2,
    replyMessageId: undefined,
    event: 'run.completed',
    payload: { replyMessageId: 'reply-msg-42', executionActive: false },
  }))

  assert.equal(state.replyMessageId, 'reply-msg-42')
  assert.equal(state.reasoningText, 'Deep thinking process')
  assert.equal(state.terminal, 'COMPLETED')
})

test('activity previews use canonical row types and fields without rewriting aliases', () => {
  const payload = { componentId: 'card-1', component: 'quiz' }
  let state = reduceChatStreamEvent(createChatStreamState(), makeEnvelope({
    event: 'block.started',
    blockId: payload.componentId,
    payload: { ...payload, partId: 'obsolete-part-id' },
  }))
  const preview = state.parts[0]
  assert.equal(preview.id, payload.componentId)
  const rows = [
    { type: 'meta', question: 'Question with an old row type', questionType: 'single' },
    { type: 'stem', stem: 'Old question field' },
    { type: 'item', key: 'A', text: 'Option with an old row type' },
    { type: 'option', label: 'A', content: 'Old option fields' },
    { type: 'option', text: 'Missing key' },
    { type: 'option', key: 2, text: 'Non-string key' },
  ]
  rows.forEach((row, index) => {
    state = reduceChatStreamEvent(state, makeEnvelope({
      sequence: index + 2,
      event: 'block.item',
      blockId: payload.componentId,
      payload: { ...payload, row },
    }))
  })
  assert.deepEqual(state.parts[0], preview)
})

test('activity.ready acknowledges the completed part and cannot publish a part itself', () => {
  const part = {
    id: 'card-1', componentId: 'card-1', kind: 'block', component: 'question', state: 'READY',
    questionId: 'question-uuid-1', meta: { question: 'Why does it work?' }, items: [],
  }
  const ready = {
    componentId: part.componentId, activityId: part.questionId, questionId: part.questionId,
    questionVersion: 1, publicTextDelta: '',
  }
  const blockId = part.componentId
  let state = reduceChatStreamEvent(createChatStreamState(), makeEnvelope({
    event: 'block.started', blockId, payload: { componentId: blockId, component: part.component },
  }))
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 2, event: 'activity.ready', blockId, payload: { ...ready, part },
  }))
  assert.equal(state.parts[0].state, 'GENERATING')
  assert.equal(state.parts[0].questionId, undefined)
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 3, event: 'block.completed', blockId, payload: { componentId: blockId, part, publicTextDelta: '\n' },
  }))
  state = reduceChatStreamEvent(state, makeEnvelope({
    sequence: 4, event: 'activity.ready', blockId, payload: ready,
  }))
  assert.deepEqual(state.parts, [part])
  assert.equal(state.lastSequence, 4)
})

test('text.delta falls back to state replyMessageId for part id when event lacks top-level replyMessageId', () => {
  let state = createChatStreamState({ replyMessageId: 'fallback-reply-id' })
  state = reduceChatStreamEvent(
    state,
    makeEnvelope({
      sequence: 1,
      replyMessageId: undefined,
      event: 'text.delta',
      payload: { text: 'Hello', publicTextDelta: 'Hello' },
    })
  )
  assert.equal(state.parts.length, 1)
  assert.equal(state.parts[0].id, 'fallback-reply-id:text')
})

test('retryPendingMessage logic cleans stale failed assistant messages for the retried user turn', () => {
  let messages = [
    { id: 'user-1', role: 'USER', content: 'hello', status: 'COMPLETED' },
    { id: 'asst-1', role: 'ASSISTANT', content: 'hi', status: 'COMPLETED' },
    { id: 'user-2', role: 'USER', content: 'draw a diagram', status: 'FAILED' },
    { id: 'asst-2', role: 'ASSISTANT', content: 'generating...', status: 'FAILED' },
  ]

  const messageId = 'asst-2'
  const targetMsg = messages.find((item) => item.id === messageId)
  assert.ok(targetMsg)

  let message
  const staleAssistantIds = []

  if (targetMsg.role === 'USER') {
    message = targetMsg
    const userIndex = messages.findIndex((m) => m.id === messageId)
    for (let i = userIndex + 1; i < messages.length; i++) {
      if (messages[i].role === 'USER') break
      if (messages[i].role === 'ASSISTANT' && messages[i].status !== 'COMPLETED') {
        staleAssistantIds.push(messages[i].id)
      }
    }
  } else {
    staleAssistantIds.push(targetMsg.id)
    const targetIndex = messages.findIndex((m) => m.id === messageId)
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'USER') {
        message = messages[i]
        break
      }
    }
    if (message) {
      const userIndex = messages.findIndex((m) => m.id === message.id)
      for (let i = userIndex + 1; i < messages.length; i++) {
        if (messages[i].role === 'USER') break
        if (messages[i].role === 'ASSISTANT' && messages[i].status !== 'COMPLETED') {
          if (!staleAssistantIds.includes(messages[i].id)) {
            staleAssistantIds.push(messages[i].id)
          }
        }
      }
    }
  }

  assert.equal(message.id, 'user-2')
  assert.deepEqual(staleAssistantIds, ['asst-2'])

  if (staleAssistantIds.length > 0) {
    messages = messages.filter((m) => !staleAssistantIds.includes(m.id))
  }

  assert.equal(messages.length, 3)
  assert.equal(messages.find((m) => m.id === 'asst-2'), undefined)
  assert.equal(messages.find((m) => m.id === 'asst-1').status, 'COMPLETED')
})

