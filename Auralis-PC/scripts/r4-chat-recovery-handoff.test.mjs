import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}'
    const subPath = specifier.slice(2)
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts'
    return nextResolve(new URL(withExt, root).href, context)
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL
      && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createPinia, setActivePinia } = await import('pinia')
const { buildReadingContext, useChatStore, isScopeMatching } = await import('../src/store/useChatStore.ts')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { default: request } = await import('../src/api/request.ts')

test('Step 4 handoff: buildReadingContext produces canonical readingContext matching server contract', () => {
  // 1. SUBJECT mode: currentSourceId must be null, sourceIds must be empty array
  const subjectContext = buildReadingContext({
    subjectId: 'sub-1',
    retrievalMode: 'SUBJECT',
    sourceId: 'should-be-suppressed',
    sourceIds: ['should-be-empty'],
    selectionText: 'selected text',
  })
  assert.deepEqual(subjectContext, {
    subjectId: 'sub-1',
    retrievalMode: 'SUBJECT',
    currentSourceId: null,
    sourceIds: [],
  })

  // 2. AUTO mode with current document
  const autoContextWithSource = buildReadingContext({
    subjectId: 'sub-1',
    retrievalMode: 'AUTO',
    sourceId: 'source-current',
    sourceIds: ['ignored'],
  })
  assert.deepEqual(autoContextWithSource, {
    subjectId: 'sub-1',
    retrievalMode: 'AUTO',
    currentSourceId: 'source-current',
    sourceIds: [],
  })

  // 3. AUTO mode fallback when sourceId is missing: currentSourceId is null, sourceIds is []
  const autoContextWithoutSource = buildReadingContext({
    subjectId: 'sub-1',
    retrievalMode: 'AUTO',
  })
  assert.deepEqual(autoContextWithoutSource, {
    subjectId: 'sub-1',
    retrievalMode: 'AUTO',
    currentSourceId: null,
    sourceIds: [],
  })

  // 4. SELECTED_SOURCES mode: exact sourceIds list, currentSourceId is null
  const selectedContext = buildReadingContext({
    subjectId: 'sub-1',
    retrievalMode: 'SELECTED_SOURCES',
    sourceId: 'should-be-null',
    sourceIds: ['src-a', 'src-b'],
  })
  assert.deepEqual(selectedContext, {
    subjectId: 'sub-1',
    retrievalMode: 'SELECTED_SOURCES',
    currentSourceId: null,
    sourceIds: ['src-a', 'src-b'],
  })

  // 5. Default inference: subjectId only -> SUBJECT
  const inferredSubject = buildReadingContext({
    subjectId: 'sub-1',
  })
  assert.deepEqual(inferredSubject, {
    subjectId: 'sub-1',
    retrievalMode: 'SUBJECT',
    currentSourceId: null,
    sourceIds: [],
  })

  // 6. Default inference: subjectId + sourceId -> AUTO
  const inferredAuto = buildReadingContext({
    subjectId: 'sub-1',
    sourceId: 'src-123',
  })
  assert.deepEqual(inferredAuto, {
    subjectId: 'sub-1',
    retrievalMode: 'AUTO',
    currentSourceId: 'src-123',
    sourceIds: [],
  })

  // 7. Missing subjectId -> undefined
  const missingSubject = buildReadingContext({
    sourceId: 'src-123',
  })
  assert.equal(missingSubject, undefined)
})

test('Chat UNKNOWN recovery store logic: identifies recoverableTarget and executes ticket-guarded recover', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = { id: 'user-42', username: 'testuser', displayName: 'Test', version: 1, hasAvatar: false }

  const chatStore = useChatStore()
  chatStore.sessions = [
    {
      id: 'session-1',
      remoteId: 'remote-conv-1',
      title: '测试会话',
      version: 1,
      chatProtocolVersion: 1,
      chatSupported: true,
    },
  ]
  chatStore.activeSessionId = 'session-1'

  // 1. Initially no active UNKNOWN run
  assert.equal(chatStore.recoverableTarget, null)

  // 2. Active run in UNKNOWN status
  chatStore.activeRun = {
    conversationId: 'remote-conv-1',
    runId: 'run-unknown-1',
    requestId: 'req-1',
    executionActive: true,
    status: 'UNKNOWN',
    currentAttemptId: 'attempt-unknown-1',
  }

  // Expect recoverableTarget to detect UNKNOWN attempt
  assert.deepEqual(chatStore.recoverableTarget, {
    conversationId: 'remote-conv-1',
    runId: 'run-unknown-1',
    attemptId: 'attempt-unknown-1',
  })

  // 3. Stale session switch guard
  chatStore.activeSessionId = 'other-session'
  assert.equal(chatStore.recoverableTarget, null)
  chatStore.activeSessionId = 'session-1'

  // 4. Successful recovery flow via mock request.post and request.get
  const origPost = request.post
  const origGet = request.get
  let recoverUrlCalled = null

  try {
    request.post = async (url) => {
      if (url.includes('/recover')) {
        recoverUrlCalled = url
        return {
          protocolVersion: 1,
          conversationId: 'remote-conv-1',
          runId: 'run-unknown-1',
          requestId: 'req-1',
          status: 'FAILED',
          executionActive: false,
          currentAttemptId: 'attempt-unknown-1',
        }
      }
      return origPost(url)
    }

    request.get = async (url) => {
      if (url.includes('/api/ai/conversations/remote-conv-1')) {
        return {
          id: 'remote-conv-1',
          title: '测试会话',
          version: 1,
          chatProtocolVersion: 1,
          chatSupported: true,
          messages: [
            {
              id: 'msg-assist-1',
              role: 'ASSISTANT',
              status: 'FAILED',
              content: '生成失败',
              parts: [],
              errorCode: 'CHAT_UNKNOWN_ABANDONED',
            },
          ],
        }
      }
      return origGet(url)
    }

    const ok = await chatStore.recoverUnknownAttempt()
    assert.equal(ok, true)
    assert.equal(
      recoverUrlCalled,
      '/api/ai/conversations/remote-conv-1/runs/run-unknown-1/attempts/attempt-unknown-1/recover'
    )
    assert.equal(chatStore.activeRun, null)
    assert.equal(chatStore.isStreaming, false)
    assert.equal(chatStore.messages.length, 1)
    assert.equal(chatStore.messages[0].status, 'FAILED')
  } finally {
    request.post = origPost
    request.get = origGet
  }
})

test('Chat UNKNOWN recovery store logic: handles HTTP 409 CHAT_RECOVERY_NOT_ALLOWED without repeating retry', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = { id: 'user-42', username: 'testuser', displayName: 'Test', version: 1, hasAvatar: false }

  const chatStore = useChatStore()
  chatStore.sessions = [
    {
      id: 'session-2',
      remoteId: 'remote-conv-2',
      title: '测试会话2',
      version: 1,
      chatProtocolVersion: 1,
      chatSupported: true,
    },
  ]
  chatStore.activeSessionId = 'session-2'
  chatStore.activeRun = {
    conversationId: 'remote-conv-2',
    runId: 'run-409',
    requestId: 'req-409',
    executionActive: true,
    status: 'UNKNOWN',
    currentAttemptId: 'attempt-409',
  }

  const origPost = request.post
  const origGet = request.get
  let runStatusChecked = false

  try {
    request.post = async (url) => {
      if (url.includes('/recover')) {
        const error = new Error('Recovery conflict')
        error.status = 409
        error.code = 'CHAT_RECOVERY_NOT_ALLOWED'
        throw error
      }
      return origPost(url)
    }

    request.get = async (url) => {
      if (url.includes('/runs/run-409')) {
        runStatusChecked = true
        return {
          protocolVersion: 1,
          conversationId: 'remote-conv-2',
          runId: 'run-409',
          requestId: 'req-409',
          status: 'FAILED',
          executionActive: false,
          currentAttemptId: 'attempt-409',
        }
      }
      if (url.includes('/api/ai/conversations/remote-conv-2')) {
        return {
          id: 'remote-conv-2',
          title: '测试会话2',
          version: 1,
          chatProtocolVersion: 1,
          chatSupported: true,
          messages: [],
        }
      }
      return origGet(url)
    }

    const ok = await chatStore.recoverUnknownAttempt()
    assert.equal(ok, false)
    assert.equal(runStatusChecked, true)
    assert.equal(chatStore.lastErrorCode, 'CHAT_RECOVERY_NOT_ALLOWED')
    assert.equal(chatStore.activeRun, null)
  } finally {
    request.post = origPost
    request.get = origGet
  }
})


test('Chat reading-scope handoff: isScopeMatching validates committed scope against options', () => {
  assert.equal(isScopeMatching(null, {}), false)
  assert.equal(isScopeMatching(undefined, {}), false)
  assert.equal(isScopeMatching(null, { subjectId: 'sub-1' }), false)
  assert.equal(isScopeMatching({ retrievalMode: 'SUBJECT', subjectId: 'sub-1', currentSourceId: null, sourceIds: [] }, {}), false)

  // Subject mode matching
  assert.equal(
    isScopeMatching(
      { retrievalMode: 'SUBJECT', subjectId: 'sub-1', currentSourceId: null, sourceIds: [] },
      { subjectId: 'sub-1', retrievalMode: 'SUBJECT' }
    ),
    true
  )
  assert.equal(
    isScopeMatching(
      { retrievalMode: 'SUBJECT', subjectId: 'sub-1', currentSourceId: null, sourceIds: [] },
      { subjectId: 'sub-2', retrievalMode: 'SUBJECT' }
    ),
    false
  )

  // Auto mode matching
  assert.equal(
    isScopeMatching(
      { retrievalMode: 'AUTO', subjectId: 'sub-1', currentSourceId: 'doc-1', sourceIds: [] },
      { subjectId: 'sub-1', retrievalMode: 'AUTO', sourceId: 'doc-1' }
    ),
    true
  )
  assert.equal(
    isScopeMatching(
      { retrievalMode: 'AUTO', subjectId: 'sub-1', currentSourceId: 'doc-1', sourceIds: [] },
      { subjectId: 'sub-1', retrievalMode: 'AUTO', sourceId: 'doc-2' }
    ),
    false
  )

  // Order-independent sourceIds matching
  assert.equal(
    isScopeMatching(
      { retrievalMode: 'SELECTED_SOURCES', subjectId: 'sub-1', currentSourceId: null, sourceIds: ['b', 'a', 'c'] },
      { subjectId: 'sub-1', retrievalMode: 'SELECTED_SOURCES', sourceIds: ['c', 'a', 'b'] }
    ),
    true
  )
  assert.equal(
    isScopeMatching(
      { retrievalMode: 'SELECTED_SOURCES', subjectId: 'sub-1', currentSourceId: null, sourceIds: ['b', 'a'] },
      { subjectId: 'sub-1', retrievalMode: 'SELECTED_SOURCES', sourceIds: ['a', 'c'] }
    ),
    false
  )

  // Mode mismatch
  assert.equal(
    isScopeMatching(
      { retrievalMode: 'SUBJECT', subjectId: 'sub-1', currentSourceId: null, sourceIds: [] },
      { subjectId: 'sub-1', retrievalMode: 'AUTO', sourceId: 'doc-1' }
    ),
    false
  )
})

test('Chat reading-scope handoff: first turn binds scope, ordinary later turns omit readingContext to inherit', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = { id: 'user-scope-1', username: 'scopeuser', displayName: 'Scope User', version: 1, hasAvatar: false }

  const chatStore = useChatStore()
  chatStore.sessions = [
    {
      id: 'session-scope-test',
      remoteId: 'remote-scope-conv',
      title: '范围测试会话',
      version: 1,
      chatProtocolVersion: 1,
      chatSupported: true,
      chatScopeState: 'UNBOUND',
      chatScope: null,
    },
  ]
  chatStore.activeSessionId = 'session-scope-test'

  assert.equal(chatStore.isBoundSession, false)

  let lastSentBody = null
  const origFetch = globalThis.fetch

  function mockSseResponse(events) {
    const text = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`).join('')
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/api/ai/messages/stream')) {
        lastSentBody = JSON.parse(init.body)
        return mockSseResponse([
          {
            protocolVersion: 1,
            conversationId: 'remote-scope-conv',
            requestId: lastSentBody.requestId,
            runId: 'run-s1',
            attemptId: 'att-s1',
            userMessageId: 'user-s1',
            replyMessageId: 'reply-s1',
            sequence: 1,
            event: 'run.started',
            payload: {},
          },
          {
            protocolVersion: 1,
            conversationId: 'remote-scope-conv',
            requestId: lastSentBody.requestId,
            runId: 'run-s1',
            attemptId: 'att-s1',
            userMessageId: 'user-s1',
            replyMessageId: 'reply-s1',
            sequence: 2,
            event: 'text.delta',
            payload: { text: 'Scope admitted response', publicTextDelta: 'Scope admitted response' },
          },
          {
            protocolVersion: 1,
            conversationId: 'remote-scope-conv',
            requestId: lastSentBody.requestId,
            runId: 'run-s1',
            attemptId: 'att-s1',
            userMessageId: 'user-s1',
            replyMessageId: 'reply-s1',
            sequence: 3,
            event: 'run.completed',
            payload: { usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
          },
        ])
      }
      return origFetch(url, init)
    }

    // Turn 1 on UNBOUND session carries explicit readingContext
    await chatStore.sendMessage('First turn on unbound session', {
      subjectId: 'sub-math',
      retrievalMode: 'SUBJECT',
      selectionText: 'A'.repeat(4001),
    })

    assert.ok(lastSentBody.readingContext)
    assert.equal(lastSentBody.readingContext.retrievalMode, 'SUBJECT')
    assert.equal(lastSentBody.readingContext.subjectId, 'sub-math')
    assert.equal('selectionText' in lastSentBody.readingContext, false)
    assert.equal(lastSentBody.selectionText, 'A'.repeat(4000))

    // Session has transitioned to BOUND
    assert.equal(chatStore.isBoundSession, true)
    const session = chatStore.activeSession
    assert.equal(session.chatScopeState, 'BOUND')
    assert.deepEqual(session.chatScope, {
      retrievalMode: 'SUBJECT',
      subjectId: 'sub-math',
      currentSourceId: null,
      sourceIds: [],
    })

    // Turn 2 on BOUND session with matching scope: readingContext MUST BE OMITTED (undefined)
    lastSentBody = null
    await chatStore.sendMessage('Second turn inherits bound scope', {
      subjectId: 'sub-math',
      retrievalMode: 'SUBJECT',
      selectionText: 'A separate quotation',
    })

    assert.equal(lastSentBody.readingContext, undefined)
    assert.equal(lastSentBody.selectionText, 'A separate quotation')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('Chat reading-scope handoff: HTTP 409 CHAT_SCOPE_CONFLICT cleans optimistic turn without repeating retry', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = { id: 'user-scope-2', username: 'scopeuser2', displayName: 'Scope User 2', version: 1, hasAvatar: false }

  const chatStore = useChatStore()
  chatStore.sessions = [
    {
      id: 'session-bound-conflict',
      remoteId: 'remote-bound-conv',
      title: '已锁定范围会话',
      version: 1,
      chatProtocolVersion: 1,
      chatSupported: true,
      chatScopeState: 'BOUND',
      chatScope: {
        retrievalMode: 'SUBJECT',
        subjectId: 'sub-math',
        currentSourceId: null,
        sourceIds: [],
      },
    },
  ]
  chatStore.activeSessionId = 'session-bound-conflict'
  chatStore.messages = []

  const origFetch = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/api/ai/messages/stream')) {
        return new Response(
          JSON.stringify({
            title: 'Chat scope conflict',
            status: 409,
            code: 'CHAT_SCOPE_CONFLICT',
            detail: 'Chat scope is already committed to SUBJECT mode',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
      return origFetch(url, init)
    }

    // Try sending with a different scope (AUTO mode with document)
    await chatStore.sendMessage('Conflicting scope attempt', {
      subjectId: 'sub-math',
      retrievalMode: 'AUTO',
      sourceId: 'doc-chapter-1',
    })

    // Expect conflict error code set
    assert.equal(chatStore.lastErrorCode, 'CHAT_SCOPE_CONFLICT')
    assert.equal(chatStore.lastError, '当前会话已固定资料范围，无法切换范围提问。请开启新会话。')

    // Optimistic user message was scrubbed from messages
    assert.equal(chatStore.messages.length, 0)
    assert.equal(chatStore.isStreaming, false)
    assert.equal(chatStore.activeRun, null)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('Chat reading-scope handoff: workspace file switching does not mutate locked conversation options or trigger scope conflict', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = { id: 'user-scope-4', username: 'scopeuser4', displayName: 'Scope User 4', version: 1, hasAvatar: false }

  const chatStore = useChatStore()
  const boundScope = {
    retrievalMode: 'AUTO',
    subjectId: 'sub-locked',
    currentSourceId: 'file-1-bound',
    sourceIds: [],
  }

  chatStore.sessions = [
    {
      id: 'session-locked-file1',
      remoteId: 'remote-locked-file1',
      title: 'Bound Session File 1',
      version: 1,
      chatProtocolVersion: 1,
      chatSupported: true,
      chatScopeState: 'BOUND',
      chatScope: boundScope,
    },
  ]
  chatStore.activeSessionId = 'session-locked-file1'
  assert.equal(chatStore.isBoundSession, true)

  // Simulate SubjectWorkspace logic when workspace selects a different file
  const activeSourceFiles = [
    { id: 'file-1-bound', name: 'File1.pdf', subjectId: 'sub-locked', ingestionStatus: 'READY' },
    { id: 'file-2-workspace', name: 'File2.pdf', subjectId: 'sub-locked', ingestionStatus: 'READY' },
  ]
  let selectedFileId = 'file-2-workspace' // user views file 2

  // The helper reproducing aiChatReferenceOptions when boundScope is active:
  const getAiChatReferenceOptions = () => {
    const bound = chatStore.activeSession?.chatScope
    if (chatStore.isBoundSession && bound) {
      if (bound.retrievalMode === 'SUBJECT') {
        return { subjectId: bound.subjectId || 'sub-locked', retrievalMode: 'SUBJECT' }
      }
      if (bound.retrievalMode === 'AUTO') {
        return {
          subjectId: bound.subjectId || 'sub-locked',
          sourceId: bound.currentSourceId || undefined,
          retrievalMode: 'AUTO',
        }
      }
      return {
        subjectId: bound.subjectId || 'sub-locked',
        sourceIds: bound.sourceIds?.length ? [...bound.sourceIds] : undefined,
        retrievalMode: 'SELECTED_SOURCES',
      }
    }
    return { subjectId: 'sub-locked', sourceId: selectedFileId, retrievalMode: 'AUTO' }
  }

  const getAiSourceSummaryText = () => {
    const bound = chatStore.activeSession?.chatScope
    if (chatStore.isBoundSession && bound) {
      if (bound.retrievalMode === 'SUBJECT') return '全学科资料'
      if (bound.retrievalMode === 'AUTO') {
        const file = activeSourceFiles.find(f => f.id === bound.currentSourceId)
        return file?.name || '当前文件'
      }
      const count = bound.sourceIds?.length || 0
      return count === 1 ? (activeSourceFiles.find(f => f.id === bound.sourceIds[0])?.name || '1 份资料') : `已选 ${count} 份资料`
    }
    return activeSourceFiles.find(f => f.id === selectedFileId)?.name || '当前文件'
  }

  // 1. In locked state, options must remain bound to file-1 even when workspace selectedFileId is file-2
  const options = getAiChatReferenceOptions()
  assert.equal(options.sourceId, 'file-1-bound', 'aiChatReferenceOptions must use bound sourceId, not workspace selectedFileId')
  assert.equal(options.retrievalMode, 'AUTO')

  // 2. Summary text must display File1.pdf, not File2.pdf
  assert.equal(getAiSourceSummaryText(), 'File1.pdf', 'Summary text must display bound file name, not workspace file name')

  // 3. isScopeMatching must validate successfully
  assert.equal(isScopeMatching(chatStore.activeSession?.chatScope, options), true)

  // 4. Subsequent turn message must omit readingContext and NOT trigger 409
  let streamCalledWithReadingContext = null
  const origFetch = globalThis.fetch
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body)
      streamCalledWithReadingContext = body.readingContext
      const terminal = {
        protocolVersion: 1, conversationId: body.conversationId, requestId: body.requestId,
        runId: 'run-locked', attemptId: 'attempt-locked', userMessageId: 'user-locked',
        replyMessageId: 'reply-locked', sequence: 1, event: 'run.completed', payload: { executionActive: false },
      }
      return new Response(
        `event: run.completed\ndata: ${JSON.stringify(terminal)}\n\n`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }
      )
    }

    await chatStore.sendMessage('Follow-up question while viewing file 2', options)
    assert.equal(streamCalledWithReadingContext, undefined, 'Reading context must be omitted to inherit bound scope')
    assert.equal(chatStore.lastErrorCode, null)
  } finally {
    globalThis.fetch = origFetch
  }


})

for (const scenario of ['bound turn', 'first scoped turn', 'activity submission']) {
  test(`Chat no-run replay preserves the exact ${scenario} command after a first-frame disconnect`, async () => {
    setActivePinia(createPinia())
    const store = useChatStore()
    store.sessions = [{
      id: 'replay-conversation', remoteId: 'replay-conversation', title: 'Replay', version: 1,
      chatProtocolVersion: 1, chatSupported: true,
      chatScopeState: scenario === 'first scoped turn' ? 'UNBOUND' : 'BOUND',
      chatScope: { retrievalMode: 'SUBJECT', subjectId: 'subject-replay', currentSourceId: null, sourceIds: [] },
    }]
    store.activeSessionId = 'replay-conversation'
    const options = { subjectId: 'subject-replay', retrievalMode: 'SUBJECT', selectionText: 'Original quotation' }
    const commands = []
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async (_url, init) => {
        commands.push(JSON.parse(init.body))
        throw new TypeError('Connection lost before first event')
      }
      const sending = scenario === 'activity submission'
        ? store.submitActivity('activity-replay', ['A'], {
          id: 'block-replay', componentId: 'block-replay', kind: 'block', component: 'quiz',
          state: 'READY', questionId: 'activity-replay',
          meta: { question: 'Which answer?', questionType: 'single' },
          items: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }],
        })
        : store.sendMessage('Original question', options)
      await assert.rejects(sending, /Connection lost before first event/)
      const message = store.messages[0]
      assert.equal(message.runId, undefined)
      assert.equal(commands.length, 1)
      if (scenario === 'bound turn') assert.equal('readingContext' in commands[0], false)
      if (scenario === 'first scoped turn') assert.equal(commands[0].readingContext.subjectId, 'subject-replay')
      if (scenario === 'activity submission') {
        assert.equal(commands[0].action, 'activity_submission')
        assert.ok(commands[0].submissionId)
        assert.deepEqual(commands[0].answer, ['A'])
      }
      // Later edits to display/request metadata must not alter an already sent command.
      options.selectionText = 'A different quotation'
      message.content = 'Edited local display'
      if (message.answerPayload) message.answerPayload.push('B')
      await assert.rejects(store.retryPendingMessage(message.id), /Connection lost before first event/)
      await assert.rejects(store.retryPendingMessage(message.id), /Connection lost before first event/)
      assert.equal(commands.length, 3)
      assert.deepEqual(commands[1], commands[0])
      assert.deepEqual(commands[2], commands[0])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
}

test('Chat retry with a known run uses the run-attempt endpoint instead of replaying its turn', async () => {
  setActivePinia(createPinia())
  const store = useChatStore()
  store.sessions = [{
    id: 'known-conversation', remoteId: 'known-conversation', title: 'Known run', version: 1,
    chatProtocolVersion: 1, chatSupported: true, chatScopeState: 'UNBOUND', chatScope: null,
  }]
  store.activeSessionId = 'known-conversation'
  const requests = []
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body)
      requests.push({ url: String(url), body })
      const terminal = requests.length === 1 ? 'run.failed' : 'run.completed'
      const events = ['run.started', terminal].map((event, index) => ({
        protocolVersion: 1, conversationId: 'known-conversation', requestId: body.requestId,
        runId: 'known-run', attemptId: `attempt-${requests.length}`, userMessageId: 'known-user',
        replyMessageId: `reply-${requests.length}`, sequence: index + 1, event,
        payload: event === 'run.failed' ? { safeErrorCode: 'MODEL_UNAVAILABLE' } : {},
      }))
      return new Response(events.map(event => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`).join(''), {
        status: 200, headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    await store.sendMessage('Known run question', { subjectId: 'subject-known', retrievalMode: 'SUBJECT' })
    const message = store.messages.find(item => item.role === 'USER')
    assert.equal(message.runId, 'known-run')
    await store.retryPendingMessage(message.id)
    assert.equal(requests.length, 2)
    assert.ok(requests[1].url.endsWith('/api/ai/conversations/known-conversation/runs/known-run/attempts'))
    assert.deepEqual(Object.keys(requests[1].body), ['requestId'])
    assert.notEqual(requests[1].body.requestId, requests[0].body.requestId)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Chat does not invent a replay command when neither run identity nor original command is available', async () => {
  setActivePinia(createPinia())
  const store = useChatStore()
  store.sessions = [{
    id: 'history-conversation', remoteId: 'history-conversation', title: 'History', version: 1,
    chatProtocolVersion: 1, chatSupported: true, chatScopeState: 'BOUND', chatScope: null,
  }]
  store.activeSessionId = 'history-conversation'
  store.messages = [
    { id: 'history-user', conversationId: 'history-conversation', role: 'USER', status: 'FAILED', content: 'Question', parts: [] },
    { id: 'history-reply', conversationId: 'history-conversation', role: 'ASSISTANT', status: 'FAILED', content: 'Partial', parts: [] },
  ]
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => { calls += 1; throw new Error('Unexpected transport call') }
    await store.retryPendingMessage('history-reply')
    assert.equal(calls, 0)
    assert.deepEqual(store.messages.map(message => [message.id, message.status]), [
      ['history-user', 'FAILED'], ['history-reply', 'FAILED'],
    ])
    assert.equal(store.lastError, '原始请求已不可用，无法安全重试。请重新提问。')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Chat stream disconnect reconciliation preserves interleaved processTimeline, enriched labels, and settles tools', async () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = { id: 'user-rec-1', username: 'recuser', displayName: 'Rec', version: 1, hasAvatar: false }

  const chatStore = useChatStore()
  chatStore.sessions = [
    {
      id: 'session-rec-1',
      remoteId: 'conv-rec-1',
      title: '断线过程态对账',
      version: 1,
      chatProtocolVersion: 1,
      chatSupported: true,
      chatScopeState: 'BOUND',
      chatScope: { retrievalMode: 'SUBJECT', subjectId: 'sub-rec-1', currentSourceId: null, sourceIds: [] },
    },
  ]
  chatStore.activeSessionId = 'session-rec-1'

  const origFetch = globalThis.fetch
  const origGet = request.get
  const origPost = request.post
  let lastRequestId = 'req-rec-1'

  const buildStatus = () => ({
    protocolVersion: 1,
    conversationId: 'conv-rec-1',
    runId: 'run-rec-1',
    requestId: lastRequestId,
    status: 'COMPLETED',
    executionActive: false,
    currentAttemptId: 'att-rec-1',
    userMessageId: 'user-rec-1',
    currentReplyMessageId: 'reply-rec-1',
    toolTrace: [
      { id: 't-1', name: 'search', status: 'COMPLETED' },
      { id: 't-2', name: 'read', label: '读取课程节选', status: 'RUNNING' },
    ],
  })

  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body)
      lastRequestId = body.requestId
      let seq = 0
      const env = (event, payload) => ({
        protocolVersion: 1,
        conversationId: 'conv-rec-1',
        requestId: body.requestId,
        runId: 'run-rec-1',
        attemptId: 'att-rec-1',
        userMessageId: 'user-rec-1',
        replyMessageId: 'reply-rec-1',
        sequence: ++seq,
        event,
        payload,
      })
      const chunks = [
        env('run.started', { status: 'RUNNING' }),
        env('reasoning.delta', { text: '先查目录。' }),
        env('tool.started', { toolCallId: 't-1', name: 'search', label: '检索课程资料' }),
        env('reasoning.delta', { text: '再查正文。' }),
      ]
      const sseText = chunks.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`).join('')
      return new Response(sseText, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    request.get = async (url) => {
      if (url.includes('/runs/run-rec-1')) {
        return buildStatus()
      }
      if (url.includes('/api/ai/conversations/conv-rec-1')) {
        return {
          id: 'conv-rec-1',
          title: '断线过程态对账',
          version: 1,
          chatProtocolVersion: 1,
          chatSupported: true,
          messages: [
            { id: 'user-rec-1', role: 'USER', status: 'COMPLETED', content: '请帮我总结', parts: [] },
            {
              id: 'reply-rec-1',
              role: 'ASSISTANT',
              status: 'COMPLETED',
              content: '总结完成',
              reasoningText: '先查目录。再查正文。补充尾段。',
              parts: [{ id: 'reply-rec-1:text', kind: 'text', text: '总结完成' }],
            },
          ],
        }
      }
      return origGet(url)
    }

    request.post = async (url) => {
      if (url.includes('/recover')) {
        return buildStatus()
      }
      return origPost(url)
    }

    await chatStore.sendMessage('请帮我总结', { subjectId: 'sub-rec-1', retrievalMode: 'SUBJECT' }).catch(() => null)
    if (chatStore.recoverableTarget) {
      await chatStore.recoverUnknownAttempt()
    }

    assert.equal(chatStore.activeRun, null)
    assert.equal(chatStore.isStreaming, false)
    const assistant = chatStore.messages.find((m) => m.id === 'reply-rec-1')
    assert.ok(assistant, 'reconciled assistant message should exist')
    assert.equal(assistant.reasoningText, '先查目录。再查正文。补充尾段。')
    assert.deepEqual(assistant.tools, [
      { id: 't-1', name: 'search', label: '检索课程资料', status: 'COMPLETED' },
      { id: 't-2', name: 'read', label: '读取课程节选', status: 'COMPLETED' },
    ])
    assert.deepEqual(
      assistant.processTimeline?.map((item) => (
        item.kind === 'reasoning' ? `R:${item.text}` : `T:${item.tool.id}:${item.tool.status}:${item.tool.label}`
      )),
      [
        'R:先查目录。',
        'T:t-1:COMPLETED:检索课程资料',
        'R:再查正文。',
        'T:t-2:COMPLETED:读取课程节选',
        'R:补充尾段。',
      ],
    )
  } finally {
    globalThis.fetch = origFetch
    request.get = origGet
    request.post = origPost
  }
})
