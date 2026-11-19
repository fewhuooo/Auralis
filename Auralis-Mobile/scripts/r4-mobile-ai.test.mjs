import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

import { decodeStreamChunk } from '../src/api/sse.ts'
import {
  applyContentDelta,
  applyReasoningDelta,
  applyTerminalState,
  applyToolEvent,
  buildMobileReadingContext,
  buildMobileStarterPrompts,
  canSelectMobileScope,
  createAssistantPlaceholder,
  extractHistoryMessageContent,
  formatMobileAiScopeAnchor,
  isConversationProtocolSupported,
  resolveConversationScope,
  resolveProcessSummary,
  safeDecodeQueryParam,
} from '../src/utils/mobileAiChat.ts'

test('buildMobileReadingContext emits SUBJECT scope only while UNBOUND and omits scope once BOUND', () => {
  assert.equal(buildMobileReadingContext(null), undefined)
  assert.equal(buildMobileReadingContext('   '), undefined)

  const ctx = buildMobileReadingContext('sub-math', 'UNBOUND')
  assert.deepEqual(ctx, {
    subjectId: 'sub-math',
    retrievalMode: 'SUBJECT',
  })
  assert.equal('currentSourceId' in (ctx ?? {}), false)
  assert.equal('sourceIds' in (ctx ?? {}), false)

  // Follow-up turns in BOUND chats (including source-scoped chats from PC/Tablet) omit readingContext
  assert.equal(buildMobileReadingContext('sub-math', 'BOUND'), undefined)
})

test('safeDecodeQueryParam decodes valid URI strings and tolerates literal percent signs', () => {
  assert.equal(safeDecodeQueryParam('100%25%20ready'), '100% ready')
  assert.equal(safeDecodeQueryParam('100% ready'), '100% ready')
  assert.equal(safeDecodeQueryParam(undefined), '')
})

test('resolveConversationScope locks bound conversations and maps subject labels accurately', () => {
  const subjects = [
    { id: 'sub-1', name: '高等数学' },
    { id: 'sub-2', name: '线性代数' },
  ]

  assert.deepEqual(
    resolveConversationScope({ chatScopeState: 'UNBOUND', chatScope: null }, subjects),
    { locked: false, subjectId: null, label: '全部资料' },
  )

  assert.deepEqual(
    resolveConversationScope({ chatScopeState: 'BOUND', chatScope: null }, subjects),
    { locked: true, subjectId: null, label: '全部资料' },
  )

  assert.deepEqual(
    resolveConversationScope({
      chatScopeState: 'BOUND',
      chatScope: { subjectId: 'sub-1', retrievalMode: 'SUBJECT', currentSourceId: null, sourceIds: [] },
    }, subjects),
    { locked: true, subjectId: 'sub-1', label: '高等数学' },
  )

  assert.deepEqual(
    resolveConversationScope({
      chatScopeState: 'BOUND',
      chatScope: { subjectId: 'sub-missing', retrievalMode: 'AUTO', currentSourceId: 'src-1', sourceIds: [] },
    }, subjects),
    { locked: true, subjectId: 'sub-missing', label: '指定学科 · 指定资料' },
  )

  assert.equal(canSelectMobileScope({ isTyping: false, isStopping: false, scopeLocked: false }), true)
  assert.equal(canSelectMobileScope({ isTyping: true, isStopping: false, scopeLocked: false }), false)
  assert.equal(canSelectMobileScope({ isTyping: false, isStopping: true, scopeLocked: false }), false)
  assert.equal(canSelectMobileScope({ isTyping: false, isStopping: false, scopeLocked: true }), false)
})

test('buildMobileStarterPrompts adapts prompts to the selected subject', () => {
  const globalPrompts = buildMobileStarterPrompts(null)
  assert.equal(globalPrompts.length, 3)
  assert.match(globalPrompts[0], /重点/)

  const subjectPrompts = buildMobileStarterPrompts('线性代数')
  assert.equal(subjectPrompts.length, 3)
  assert.equal(subjectPrompts.every(item => item.includes('《线性代数》')), true)

  assert.equal(
    formatMobileAiScopeAnchor({
      selectedSubject: null,
      subjects: [{ blockCount: 12 }, { blockCount: 18 }],
    }),
    '已关联 2 门学科 · 30 个知识块',
  )
  assert.equal(
    formatMobileAiScopeAnchor({
      selectedSubject: null,
      subjects: [{ blockCount: 12 }, { blockCount: 18 }],
      totalBlockCount: 361,
    }),
    '已关联 2 门学科 · 361 个知识块',
  )
  assert.equal(
    formatMobileAiScopeAnchor({
      selectedSubject: { blockCount: 30, fileCount: 2 },
      subjects: [{ blockCount: 30, fileCount: 2 }],
    }),
    '已限定本学科 · 2 份资料 · 30 个知识块',
  )
  assert.equal(
    formatMobileAiScopeAnchor({
      selectedSubject: { blockCount: 15, fileCount: 0 },
      subjects: [{ blockCount: 15, fileCount: 0 }],
    }),
    '已限定本学科 · 15 个知识块',
  )
  assert.equal(
    formatMobileAiScopeAnchor({
      selectedSubject: null,
      subjects: [],
      totalBlockCount: 0,
    }),
    '可自由提问，或先同步学科与知识块',
  )
})

test('stream process drawer opens on tool/reasoning, collapses on answer text unless pinned, and settles on cancel', () => {
  let msg = createAssistantPlaceholder('msg-1')

  msg = applyToolEvent(msg, { phase: 'started', toolCallId: 'tc-1', name: 'search' })
  assert.equal(msg.processExpanded, true)
  assert.equal(msg.tools[0]?.label, '检索资料')
  assert.equal(msg.tools[0]?.status, 'RUNNING')
  assert.equal(resolveProcessSummary(msg), '检索资料中…')

  msg = applyReasoningDelta(msg, '先定位特征值定义。')
  assert.equal(msg.processExpanded, true)
  assert.equal(msg.reasoningText, '先定位特征值定义。')

  msg = applyToolEvent(msg, { phase: 'completed', toolCallId: 'tc-1', name: 'search' })
  assert.equal(msg.tools[0]?.status, 'COMPLETED')

  // Auto-collapses once visible answer starts streaming
  msg = applyContentDelta(msg, '实对称矩阵')
  assert.equal(msg.processExpanded, false)
  assert.equal(resolveProcessSummary(msg), '已思考 · 1 步检索')

  // If user manually opens the process drawer mid-stream, subsequent tokens must preserve their choice
  msg = { ...msg, processExpanded: true, processManuallyToggled: true }
  msg = applyContentDelta(msg, '一定可正交对角化。')
  assert.equal(msg.processExpanded, true)

  // Settling a running step on cancellation converts pending steps to FAILED and closes unless pinned
  let interrupted = createAssistantPlaceholder('msg-2')
  interrupted = applyToolEvent(interrupted, { phase: 'started', toolCallId: 'tc-2', name: 'read_source_overview' })
  interrupted = applyTerminalState(interrupted, 'cancelled')
  assert.equal(interrupted.status, 'cancelled')
  assert.equal(interrupted.tools[0]?.status, 'FAILED')
  assert.equal(interrupted.processExpanded, false)
})

test('extractHistoryMessageContent reads direct content or falls back to text parts', () => {
  assert.equal(
    extractHistoryMessageContent({ content: '正式正文', parts: [{ kind: 'text', text: '旧片段' }] }),
    '正式正文',
  )
  assert.equal(
    extractHistoryMessageContent({
      content: '',
      parts: [
        { kind: 'text', text: '第一段' },
        { kind: 'block', component: 'steps' },
        { kind: 'text', text: '第二段' },
      ],
    }),
    '第一段\n第二段',
  )
})

test('decodeStreamChunk decodes string, ArrayBuffer, Uint8Array views with byteOffset, and split UTF-8 sequences', () => {
  const decoder = new TextDecoder('utf-8')
  assert.equal(decodeStreamChunk('data: {"ok":true}\n\n', decoder), 'data: {"ok":true}\n\n')

  const abPayload = new TextEncoder().encode('hello')
  assert.equal(decodeStreamChunk(abPayload.buffer, decoder), 'hello')

  // Split multi-byte UTF-8 Chinese characters across two Uint8Array views with non-zero byteOffset
  const raw = new TextEncoder().encode('xx特征值与特征向量yy')
  const chineseSlice = raw.subarray(2, raw.length - 2)
  const splitAt = 4
  const chunk1 = chineseSlice.subarray(0, splitAt)
  const chunk2 = chineseSlice.subarray(splitAt)
  assert.equal(chunk1.byteOffset > 0, true)
  const decoded = decodeStreamChunk(chunk1, decoder) + decodeStreamChunk(chunk2, decoder) + decoder.decode()
  assert.equal(decoded, '特征值与特征向量')

  assert.equal(decodeStreamChunk(null, decoder), '')
})

test('isConversationProtocolSupported accepts protocol-1 and flags unsupported legacy conversations', () => {
  assert.equal(isConversationProtocolSupported({ chatSupported: true, chatProtocolVersion: 1 }), true)
  assert.equal(isConversationProtocolSupported({}), true)
  assert.equal(isConversationProtocolSupported({ chatSupported: false, chatProtocolVersion: 1 }), false)
  assert.equal(isConversationProtocolSupported({ chatSupported: true, chatProtocolVersion: 0 }), false)
})

test('chatWithAI decodes Uint8Array chunks, parses stringified/chunked error bodies, and rejects cleanly when 401 retry fails', async (context) => {
  let token = 'expired-token'
  const loginGen = Symbol('gen')
  let requestHandler = () => {}

  globalThis.__aiClientTestAuth = {
    get token() { return token },
    getLoginGeneration: () => loginGen,
    refreshAccessToken: async () => {
      token = 'fresh-token'
      return true
    },
    expireSession: () => {},
  }
  globalThis.__aiClientTestRequest = (opts) => requestHandler(opts)
  globalThis.uni = {
    request(opts) {
      return globalThis.__aiClientTestRequest(opts)
    },
  }

  const mocks = new Map([
    ['./aiApi', 'export const aiApi = {};'],
    ['./request', 'export default {};'],
    ['@/config/runtime', 'export const getRuntimeConfig = () => ({ apiBaseUrl: "https://api.auralis.test", websocketBaseUrl: "wss://api.auralis.test", platform: "h5" });'],
    ['@/store/useAuthStore', 'export const useAuthStore = () => globalThis.__aiClientTestAuth;'],
  ])

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (mocks.has(specifier)) {
        return { url: `data:text/javascript,${encodeURIComponent(mocks.get(specifier))}`, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, ctx)
      }
      if (ctx.parentURL?.includes('/Auralis-Mobile/src/') && (specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z0-9]+$/i.test(specifier)) {
        return nextResolve(new URL(`${specifier}.ts`, ctx.parentURL).href, ctx)
      }
      return nextResolve(specifier, ctx)
    },
  })

  context.after(() => {
    loader.deregister()
    delete globalThis.__aiClientTestAuth
    delete globalThis.__aiClientTestRequest
    delete globalThis.uni
  })

  const { chatWithAI } = await import('../src/api/aiClient.ts?ai-stream-test')
  const { ApiProblemError } = await import('../src/api/protocol.ts')

  // 1) H5 ReadableStream Uint8Array chunks split mid-UTF8 Chinese characters
  const sseText = 'event: text.delta\ndata: ' + JSON.stringify({
    protocolVersion: 1,
    conversationId: 'conv-1',
    requestId: 'req-1',
    runId: 'run-1',
    attemptId: 'att-1',
    userMessageId: 'u-1',
    replyMessageId: 'a-1',
    sequence: 1,
    event: 'text.delta',
    payload: { publicTextDelta: '你好世界' },
  }) + '\n\nevent: run.completed\ndata: ' + JSON.stringify({
    protocolVersion: 1,
    conversationId: 'conv-1',
    requestId: 'req-1',
    runId: 'run-1',
    attemptId: 'att-1',
    userMessageId: 'u-1',
    replyMessageId: 'a-1',
    sequence: 2,
    event: 'run.completed',
    payload: {},
  }) + '\n\n'
  const encoded = new TextEncoder().encode(sseText)
  const splitIdx = sseText.indexOf('你好') + 4

  requestHandler = (opts) => {
    let chunkCb = null
    queueMicrotask(() => {
      chunkCb?.({ data: encoded.subarray(0, splitIdx) })
      chunkCb?.({ data: encoded.subarray(splitIdx) })
      opts.success({ statusCode: 200, data: new ArrayBuffer(0), header: {} })
    })
    return {
      onChunkReceived(cb) { chunkCb = cb },
      abort() {},
    }
  }

  let streamed = ''
  await chatWithAI('hi', [], (delta) => { streamed += delta }, 'conv-1')
  assert.equal(streamed, '你好世界')

  // 2) Stringified JSON error response preserves code & Retry-After header
  requestHandler = (opts) => {
    queueMicrotask(() => {
      opts.success({
        statusCode: 429,
        data: JSON.stringify({ status: 429, code: 'AI_CONCURRENCY_LIMIT', title: 'Too busy' }),
        header: { 'Retry-After': '15' },
      })
    })
    return { onChunkReceived() {}, abort() {} }
  }

  await assert.rejects(
    chatWithAI('hi', [], () => {}, 'conv-1'),
    err => err instanceof ApiProblemError && err.code === 'AI_CONCURRENCY_LIMIT' && err.problem.retryAfterSeconds === 15,
  )

  // 3) 401 refresh followed by retried 429 must reject (never hang unresolved)
  let attempts = 0
  requestHandler = (opts) => {
    attempts += 1
    let chunkCb = null
    queueMicrotask(() => {
      if (attempts === 1) {
        opts.success({ statusCode: 401, data: '', header: {} })
        return
      }
      chunkCb?.({
        data: new TextEncoder().encode(JSON.stringify({
          status: 429,
          code: 'AI_HOURLY_QUOTA_EXCEEDED',
          title: 'Quota exceeded',
        })),
      })
      opts.success({ statusCode: 429, data: new ArrayBuffer(0), header: {} })
    })
    return { onChunkReceived(cb) { chunkCb = cb }, abort() {} }
  }

  await assert.rejects(
    chatWithAI('hi', [], () => {}, 'conv-1'),
    err => err instanceof ApiProblemError && err.status === 429 && err.code === 'AI_HOURLY_QUOTA_EXCEEDED',
  )
  assert.equal(attempts, 2)

  // 4) onEnvelope, submitChatActivity, and retryChatRun use expected Protocol 1 routes & payloads
  const capturedRequests = []
  const seenEnvelopes = []
  requestHandler = (opts) => {
    capturedRequests.push({ url: opts.url, data: opts.data })
    let chunkCb = null
    queueMicrotask(() => {
      const payload = 'event: block.started\ndata: ' + JSON.stringify({
        protocolVersion: 1,
        conversationId: 'conv-1',
        requestId: 'req-sub',
        runId: 'run-2',
        attemptId: 'att-2',
        userMessageId: 'u-2',
        replyMessageId: 'a-2',
        sequence: 1,
        event: 'block.started',
        payload: { componentId: 'blk-1', component: 'steps', publicTextDelta: '\n' },
      }) + '\n\nevent: run.completed\ndata: ' + JSON.stringify({
        protocolVersion: 1,
        conversationId: 'conv-1',
        requestId: 'req-sub',
        runId: 'run-2',
        attemptId: 'att-2',
        userMessageId: 'u-2',
        replyMessageId: 'a-2',
        sequence: 2,
        event: 'run.completed',
        payload: {},
      }) + '\n\n'
      chunkCb?.({ data: new TextEncoder().encode(payload) })
      opts.success({ statusCode: 200, data: new ArrayBuffer(0), header: {} })
    })
    return { onChunkReceived(cb) { chunkCb = cb }, abort() {} }
  }

  const { submitChatActivity, retryChatRun } = await import('../src/api/aiClient.ts?ai-stream-test')
  await submitChatActivity('conv-1', {
    activityId: 'act-1',
    questionVersion: 1,
    submissionId: 'sub-1',
    answer: { optionKeys: ['B'] },
  }, () => {}, {
    onEnvelope: ev => seenEnvelopes.push(ev.event),
  })
  assert.equal(seenEnvelopes.includes('block.started'), true)
  assert.equal(capturedRequests[0].url, 'https://api.auralis.test/api/ai/messages/stream')
  assert.equal(capturedRequests[0].data.action, 'activity_submission')
  assert.equal(capturedRequests[0].data.submissionId, 'sub-1')

  await retryChatRun('conv-1', 'run-9', () => {})
  assert.equal(
    capturedRequests[1].url,
    'https://api.auralis.test/api/ai/conversations/conv-1/runs/run-9/attempts',
  )
  assert.equal(typeof capturedRequests[1].data.requestId, 'string')
  assert.equal('conversationId' in capturedRequests[1].data, false)
})

test('mobileChatParts projects 6 structured component types, drops private fields, reduces SSE blocks, and builds safe quiz submissions', async () => {
  const {
    createMobileActivitySubmission,
    extractPartsPlainText,
    getMobileChartRatios,
    markPendingMobileBlocksInvalid,
    projectMobileChatParts,
    reduceMobileChatPartEvent,
  } = await import('../src/utils/mobileChatParts.ts')

  const projected = projectMobileChatParts([
    { id: 't-1', kind: 'text', text: '重点梳理如下' },
    {
      id: 's-1', componentId: 'steps-1', kind: 'block', component: 'steps', state: 'READY',
      meta: { title: '推导流程', secret: 'drop' },
      items: [{ title: '建立模型', description: '定义变量' }],
    },
    {
      id: 'q-1', componentId: 'quiz-1', kind: 'block', component: 'quiz', state: 'READY',
      questionId: 'question-1', reference: { answer: ['B'] },
      meta: { question: '哪项支持流式推流？', questionType: 'single' },
      items: [{ key: 'A', text: '短轮询' }, { key: 'B', text: 'SSE' }],
    },
    {
      id: 'c-1', componentId: 'chart-1', kind: 'block', component: 'chart', state: 'READY',
      meta: { title: '耗时占比', chartType: 'proportion', unit: 'ms' },
      items: [{ label: '检索', value: 1e308 }, { label: '生成', value: 1e307 }],
    },
  ])

  assert.equal(projected.length, 4)
  assert.equal(JSON.stringify(projected).includes('secret'), false)
  assert.equal(JSON.stringify(projected).includes('reference'), false)

  const chartPart = projected[3]
  assert.equal(chartPart.kind, 'block')
  const ratios = getMobileChartRatios(chartPart)
  assert.equal(ratios.every(Number.isFinite), true)

  const quizPart = projected[2]
  assert.equal(createMobileActivitySubmission(quizPart, 'B', true), null)
  assert.deepEqual(createMobileActivitySubmission(quizPart, 'B', false), { questionId: 'question-1', answer: 'B' })

  let parts = reduceMobileChatPartEvent([], {
    protocolVersion: 1, conversationId: 'c1', requestId: 'r1', runId: 'run1', attemptId: 'att1',
    userMessageId: 'u1', replyMessageId: 'm1', sequence: 1,
    event: 'block.started', payload: { componentId: 'blk-1', component: 'compare' },
  })
  parts = reduceMobileChatPartEvent(parts, {
    protocolVersion: 1, conversationId: 'c1', requestId: 'r1', runId: 'run1', attemptId: 'att1',
    userMessageId: 'u1', replyMessageId: 'm1', sequence: 2,
    event: 'block.item', payload: {
      componentId: 'blk-1', component: 'compare',
      row: { type: 'item', title: '传输模式', entries: [{ label: 'SSE', text: '服务端推流' }, { label: '轮询', text: '定时拉取' }] },
    },
  })
  assert.equal(parts.length, 1)
  assert.equal(parts[0].kind === 'block' && parts[0].state, 'GENERATING')
  assert.equal(parts[0].kind === 'block' && parts[0].items.length, 1)

  const invalidated = markPendingMobileBlocksInvalid(parts)
  assert.equal(invalidated[0].kind === 'block' && invalidated[0].state, 'INVALID')

  assert.match(extractPartsPlainText(projected), /推导流程/)
  assert.match(extractPartsPlainText(projected), /哪项支持流式推流？/)
})

test('evaluateSmartScroll enforces 50px bottom threshold, smoothStreamBuffer drains cleanly, and deriveKnowledgeBlockTitle strips Markdown', async () => {
  const { evaluateSmartScroll, deriveKnowledgeBlockTitle, resolveWaitingStatusText, SMART_SCROLL_THRESHOLD_PX } = await import('../src/utils/mobileAiChat.ts')
  const { createSmoothStreamBuffer } = await import('../src/utils/smoothStreamBuffer.ts')

  assert.equal(SMART_SCROLL_THRESHOLD_PX, 50)
  // Near bottom (< 50px) stays unlocked
  const atBottom = evaluateSmartScroll({
    scrollTop: 560, scrollHeight: 1000, viewportHeight: 400, prevScrollTop: 550,
  }, false)
  assert.deepEqual(atBottom, { nearBottom: true, locked: false, nextPrevScrollTop: 560 })

  // Scrolling up past 50px locks immediately
  const scrolledUp = evaluateSmartScroll({
    scrollTop: 480, scrollHeight: 1000, viewportHeight: 400, prevScrollTop: 560,
  }, false)
  assert.equal(scrolledUp.locked, true)

  // Streaming growth while locked remains locked (no pull-down)
  const grownWhileLocked = evaluateSmartScroll({
    scrollTop: 480, scrollHeight: 1250, viewportHeight: 400, prevScrollTop: 480,
  }, true)
  assert.equal(grownWhileLocked.locked, true)

  // Scrolling back within 50px re-attaches auto-scroll
  const backNearBottom = evaluateSmartScroll({
    scrollTop: 810, scrollHeight: 1250, viewportHeight: 400, prevScrollTop: 700,
  }, true)
  assert.equal(backNearBottom.locked, false)

  assert.equal(resolveWaitingStatusText([], false), '正在检索相关知识块…')
  assert.equal(resolveWaitingStatusText([{ id: '1', name: 'search', label: '检索资料', status: 'RUNNING' }], false), '正在检索相关知识块…')
  assert.equal(deriveKnowledgeBlockTitle('什么是事务', '## **ACID** 特性对比\n详细内容'), 'ACID 特性对比')

  let latest = ''
  let completed = 0
  const buffer = createSmoothStreamBuffer((val) => { latest = val }, {
    onComplete: () => { completed += 1 },
  })
  buffer.push('分段输出内容')
  buffer.flush()
  assert.equal(latest, '分段输出内容')
  assert.equal(buffer.isDrained(), true)
  assert.equal(completed, 1)
  buffer.destroy()
})
