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
  buildVisibleMobileTimelineGroups,
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
  assert.equal(resolveProcessSummary(msg), '正在检索资料…')

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

test('chatWithAI decodes split UTF-8 SSE chunks, parses error bodies, retries 401 once, and sends Protocol 1 activity payloads via fetch', async (context) => {
  let token = 'expired-token'
  const loginGen = Symbol('gen')
  let fetchHandler = async () => new Response('', { status: 500 })
  const origFetch = globalThis.fetch

  globalThis.__aiClientTestAuth = {
    get token() { return token },
    getLoginGeneration: () => loginGen,
    refreshAccessToken: async () => {
      token = 'fresh-token'
      return true
    },
    expireSession: () => {},
  }
  globalThis.fetch = (url, init) => fetchHandler(String(url), init)

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
    globalThis.fetch = origFetch
  })

  const { chatWithAI } = await import('../src/api/aiClient.ts?ai-stream-test')
  const { ApiProblemError } = await import('../src/api/protocol.ts')

  // 1) ReadableStream Uint8Array chunks split mid-UTF8 Chinese characters
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

  fetchHandler = async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.subarray(0, splitIdx))
        controller.enqueue(encoded.subarray(splitIdx))
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  let streamed = ''
  await chatWithAI('hi', [], (delta) => { streamed += delta }, 'conv-1')
  assert.equal(streamed, '你好世界')

  // 2) Stringified JSON error response preserves code & Retry-After header
  fetchHandler = async () => new Response(
    JSON.stringify({ status: 429, code: 'AI_CONCURRENCY_LIMIT', title: 'Too busy' }),
    { status: 429, headers: { 'Retry-After': '15' } },
  )

  await assert.rejects(
    chatWithAI('hi', [], () => {}, 'conv-1'),
    err => err instanceof ApiProblemError && err.code === 'AI_CONCURRENCY_LIMIT' && err.problem.retryAfterSeconds === 15,
  )

  // 3) 401 refresh followed by retried 429 must reject (never hang unresolved)
  let attempts = 0
  fetchHandler = async () => {
    attempts += 1
    if (attempts === 1) {
      return new Response('', { status: 401 })
    }
    return new Response(
      JSON.stringify({
        status: 429,
        code: 'AI_HOURLY_QUOTA_EXCEEDED',
        title: 'Quota exceeded',
      }),
      { status: 429 },
    )
  }

  await assert.rejects(
    chatWithAI('hi', [], () => {}, 'conv-1'),
    err => err instanceof ApiProblemError && err.status === 429 && err.code === 'AI_HOURLY_QUOTA_EXCEEDED',
  )
  assert.equal(attempts, 2)

  // 4) onEnvelope, submitChatActivity, and retryChatRun use expected Protocol 1 routes & payloads
  const capturedRequests = []
  const seenEnvelopes = []
  fetchHandler = async (url, init) => {
    capturedRequests.push({ url, data: JSON.parse(String(init?.body || '{}')) })
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
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload))
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const { submitChatActivity, retryChatRun } = await import('../src/api/aiClient.ts?ai-stream-test')
  await submitChatActivity('conv-1', {
    activityId: 'act-1',
    questionVersion: 1,
    submissionId: 'sub-1',
    answer: ['B'],
  }, () => {}, {
    onEnvelope: ev => seenEnvelopes.push(ev.event),
  })
  assert.equal(seenEnvelopes.includes('block.started'), true)
  assert.equal(capturedRequests[0].url, 'https://api.auralis.test/api/ai/messages/stream')
  assert.equal(capturedRequests[0].data.action, 'activity_submission')
  assert.equal(capturedRequests[0].data.submissionId, 'sub-1')
  assert.deepEqual(capturedRequests[0].data.answer, ['B'])

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
  assert.deepEqual(createMobileActivitySubmission(quizPart, 'B', false), { questionId: 'question-1', answer: ['B'] })

  const openProjected = projectMobileChatParts([
    {
      id: 'open-1', componentId: 'open-cmp', kind: 'block', component: 'question', state: 'READY',
      questionId: 'q-open', meta: { question: '请简述理由' }, items: [],
    },
  ])
  const openPart = openProjected[0]
  assert.equal(createMobileActivitySubmission(openPart, '   ', false), null)
  assert.deepEqual(createMobileActivitySubmission(openPart, '  支持幂等回放  ', false), {
    questionId: 'q-open',
    answer: '支持幂等回放',
  })

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

test('mobileAiChat maintains interleaved processTimeline, sanitizes reasoning, guards programmatic scroll and restores activeRun', async () => {
  const {
    applyReasoningDelta,
    applyRunStatusSnapshot,
    applyTerminalState,
    applyToolEvent,
    createAssistantPlaceholder,
    evaluateSmartScroll,
    resolveWaitingStatusText,
    restoreConversationMessages,
    sanitizeMobileReasoningText,
  } = await import('../src/utils/mobileAiChat.ts')
  const { createSmoothStreamBuffer } = await import('../src/utils/smoothStreamBuffer.ts')

  // 1) Interleaved processTimeline with explicit Chinese tool labels & terminal settlement
  let msg = createAssistantPlaceholder('a-1')
  msg = applyReasoningDelta(msg, '先核对课程目录中的概念，')
  msg = applyToolEvent(msg, {
    phase: 'started',
    toolCallId: 'tc-1',
    name: '检索资料',
    label: '检索「335次咨询」',
  })
  assert.equal(resolveWaitingStatusText(msg.tools, true), '正在检索「335次咨询」…')
  msg = applyToolEvent(msg, {
    phase: 'completed',
    toolCallId: 'tc-1',
    name: '检索资料',
    label: '检索「335次咨询」',
  })
  msg = applyReasoningDelta(msg, '结合原文摘录整理要点。')

  assert.equal(msg.processTimeline.length, 3)
  assert.deepEqual(
    msg.processTimeline.map(item => item.kind),
    ['reasoning', 'tool', 'reasoning'],
  )
  assert.equal(msg.processTimeline[1].kind === 'tool' && msg.processTimeline[1].tool.label, '检索「335次咨询」')

  msg = applyToolEvent(msg, {
    phase: 'started',
    toolCallId: 'tc-running',
    name: '查看《讲义》总览',
    label: '查看《讲义》总览',
  })
  const settled = applyTerminalState(msg, 'completed')
  assert.equal(settled.tools.every(t => t.status === 'COMPLETED'), true)
  assert.equal(
    settled.processTimeline.filter(item => item.kind === 'tool').every(item => item.tool.status === 'COMPLETED'),
    true,
  )

  // 2) Reasoning sanitization preserves code fences
  const cleaned = sanitizeMobileReasoningText(
    '先调用 list_sources，再用 search.sourceIds 确认 chunkId 与 hasOverview。\n```json\n{"list_sources": true}\n```',
  )
  const [prose] = cleaned.split('```json')
  assert.doesNotMatch(prose, /list_sources|search\.sourceIds|chunkId|hasOverview/)
  assert.match(cleaned, /\{"list_sources": true\}/)

  // 3) Programmatic scroll guard does not lock mid-scroll or unlock above bottom
  const programmaticLocked = evaluateSmartScroll({
    scrollTop: 420,
    scrollHeight: 1200,
    viewportHeight: 400,
    prevScrollTop: 500,
  }, true, true)
  assert.equal(programmaticLocked.locked, true)

  const programmaticUnlocked = evaluateSmartScroll({
    scrollTop: 500,
    scrollHeight: 1200,
    viewportHeight: 400,
    prevScrollTop: 420,
  }, false, true)
  assert.equal(programmaticUnlocked.locked, false)

  // 4) restoreConversationMessages + applyRunStatusSnapshot normalize lowercase statuses and update processTimeline across incremental polls
  const restored = restoreConversationMessages({
    id: 'conv-r',
    chatScopeState: 'BOUND',
    chatScope: null,
    messages: [
      { id: 'u-1', role: 'USER', status: 'COMPLETED', content: '解释隔离级别' },
      { id: 'a-1', role: 'ASSISTANT', status: 'COMPLETED', content: '正在生成中', parts: [] },
    ],
    activeRun: {
      runId: 'run-r',
      currentReplyMessageId: 'a-1',
      status: 'RUNNING',
      executionActive: true,
      publicSnapshot: [{ id: 'a-1:text', kind: 'text', text: '正在整理 MVCC。' }],
      toolTrace: [
        { id: 'tc-r', name: '检索资料', label: '检索「MVCC」', status: 'started' },
        { id: 'tc-err', name: '查看资料总览', label: '查看《缺失》总览', status: 'error' },
      ],
    },
  })
  assert.equal(restored.length, 2)
  assert.equal(restored[1].status, 'streaming')
  assert.equal(restored[1].runId, 'run-r')
  assert.equal(restored[1].tools[0].label, '检索「MVCC」')
  assert.equal(restored[1].tools[0].status, 'RUNNING')
  assert.equal(restored[1].tools[1].status, 'FAILED')
  assert.equal(restored[1].processTimeline.length, 2)

  const polled = applyRunStatusSnapshot(restored, {
    runId: 'run-r',
    currentReplyMessageId: 'a-1',
    status: 'COMPLETED',
    executionActive: false,
    publicSnapshot: [{ id: 'a-1:text', kind: 'text', text: '完整回答完毕。' }],
    toolTrace: [
      { id: 'tc-r', name: '检索资料', label: '检索「MVCC」', status: 'completed' },
      { id: 'tc-err', name: '查看资料总览', label: '查看《缺失》总览', status: 'error' },
      { id: 'tc-2', name: '生成对比卡片', status: 'completed' },
    ],
  })
  assert.equal(polled[1].status, 'completed')
  assert.equal(polled[1].content, '完整回答完毕。')
  assert.equal(polled[1].tools[0].status, 'COMPLETED')
  assert.equal(polled[1].processTimeline.length, 3)
  assert.equal(polled[1].processTimeline[0].kind === 'tool' && polled[1].processTimeline[0].tool.status, 'COMPLETED')
  assert.equal(polled[1].processTimeline[2].kind === 'tool' && polled[1].processTimeline[2].tool.label, '生成对比卡片')

  // Matches in-flight placeholder slot by runId when recovered replyMessageId differs from temporary local id
  const localSlot = [{ ...createAssistantPlaceholder('assistant-temp'), runId: 'run-slot' }]
  const recoveredByRunId = applyRunStatusSnapshot(localSlot, {
    runId: 'run-slot',
    currentReplyMessageId: 'server-msg-uuid',
    status: 'COMPLETED',
    executionActive: false,
    publicSnapshot: [{ id: 'server-msg-uuid:text', kind: 'text', text: '断线恢复完成。' }],
  })
  assert.equal(recoveredByRunId.length, 1)
  assert.equal(recoveredByRunId[0].status, 'completed')
  assert.equal(recoveredByRunId[0].content, '断线恢复完成。')

  // 5) smoothStreamBuffer drains push-then-finish and prevents callbacks after destroy()
  const scheduled = new Map()
  let nextId = 1
  const origRaf = globalThis.requestAnimationFrame
  const origCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId++
    scheduled.set(id, cb)
    return id
  }
  globalThis.cancelAnimationFrame = (id) => {
    scheduled.delete(id)
  }

  try {
    let drainedText = ''
    let doneCount = 0
    const sBuffer = createSmoothStreamBuffer((val) => { drainedText = val }, {
      onComplete: () => { doneCount += 1 },
    })
    sBuffer.push('移动端平滑测试')
    sBuffer.finish('移动端平滑测试')
    let guard = 0
    while (scheduled.size > 0 && guard < 40) {
      guard += 1
      const entry = scheduled.entries().next().value
      scheduled.delete(entry[0])
      entry[1](guard * 60)
    }
    assert.equal(drainedText, '移动端平滑测试')
    assert.equal(sBuffer.isDrained(), true)
    assert.equal(doneCount, 1)

    let reentrantDone = 0
    let reentrantTicks = 0
    const rBuffer = createSmoothStreamBuffer(() => {
      reentrantTicks += 1
      rBuffer.destroy()
    }, {
      onComplete: () => { reentrantDone += 1 },
    })
    rBuffer.push('ABCDEFGH')
    rBuffer.finish('ABCDEFGH')
    const tick1 = scheduled.entries().next().value
    scheduled.delete(tick1[0])
    tick1[1](100)
    const tick2 = scheduled.entries().next().value
    scheduled.delete(tick2[0])
    tick2[1](170)

    assert.equal(reentrantTicks, 1)
    assert.equal(scheduled.size, 0)
    assert.equal(reentrantDone, 0)
  } finally {
    globalThis.requestAnimationFrame = origRaf
    globalThis.cancelAnimationFrame = origCancel
  }
})

test('buildVisibleMobileTimelineGroups gates tools behind unfinished reasoning and keeps leading tools visible', () => {
  const leadTool = { id: 'tc-0', name: '查看资料目录', label: '查看资料目录', status: 'COMPLETED' }
  const searchTool = { id: 'tc-1', name: '检索资料', label: '检索「335次咨询」', status: 'COMPLETED' }
  const excerptTool = { id: 'tc-2', name: '阅读资料摘录', label: '阅读《讲义》片段', status: 'RUNNING' }
  const r0Text = '先列出本学科目录并检索关键词。'
  const r1Text = '阅读核心片段后再组织回答。'

  const timeline = [
    { id: 'tool:tc-0', kind: 'tool', tool: leadTool },
    { id: 'reasoning:1', kind: 'reasoning', text: r0Text },
    { id: 'tool:tc-1', kind: 'tool', tool: searchTool },
    { id: 'reasoning:3', kind: 'reasoning', text: r1Text },
    { id: 'tool:tc-2', kind: 'tool', tool: excerptTool },
  ]

  // Leading tool before any reasoning stays visible at revealedLimit 0 while later segments wait
  assert.deepEqual(buildVisibleMobileTimelineGroups(timeline, 0), [
    { id: 'tool:tc-0', kind: 'tools', tools: [leadTool] },
  ])

  // Mid-stream inside r0 hides tc-1 and r1
  assert.deepEqual(buildVisibleMobileTimelineGroups(timeline, 5), [
    { id: 'tool:tc-0', kind: 'tools', tools: [leadTool] },
    { id: 'reasoning:1', kind: 'reasoning', text: r0Text.slice(0, 5) },
  ])

  // Finishing r0 reveals tc-1 while r1 and tc-2 remain gated
  assert.deepEqual(buildVisibleMobileTimelineGroups(timeline, r0Text.length), [
    { id: 'tool:tc-0', kind: 'tools', tools: [leadTool] },
    { id: 'reasoning:1', kind: 'reasoning', text: r0Text },
    { id: 'tool:tc-1', kind: 'tools', tools: [searchTool] },
  ])

  // Infinity reveals full interleaved sequence without clumping tools across reasoning
  assert.deepEqual(buildVisibleMobileTimelineGroups(timeline, Number.POSITIVE_INFINITY), [
    { id: 'tool:tc-0', kind: 'tools', tools: [leadTool] },
    { id: 'reasoning:1', kind: 'reasoning', text: r0Text },
    { id: 'tool:tc-1', kind: 'tools', tools: [searchTool] },
    { id: 'reasoning:3', kind: 'reasoning', text: r1Text },
    { id: 'tool:tc-2', kind: 'tools', tools: [excerptTool] },
  ])
})

test('mobile smoothStreamBuffer keeps monotonic speed scaling and drains long tails across frames on finish()', async () => {
  const { computeSmoothStreamTargetSpeed, createSmoothStreamBuffer } = await import('../src/utils/smoothStreamBuffer.ts')

  const speedConfig = { minSpeed: 14, baseSpeed: 28, maxSpeed: 105, finishSpeed: 58 }
  const samples = [1, 2, 4, 5, 12, 24, 48, 80, 160, 320, 600]
  let prev = 0
  for (const remaining of samples) {
    const rate = computeSmoothStreamTargetSpeed(remaining, false, speedConfig)
    assert.ok(rate >= prev, `expected monotonic rate at remaining=${remaining}, got ${rate} < ${prev}`)
    assert.ok(rate <= speedConfig.maxSpeed)
    prev = rate
  }
  assert.equal(computeSmoothStreamTargetSpeed(1, false, speedConfig), 14)
  assert.equal(computeSmoothStreamTargetSpeed(12, false, speedConfig), 28)
  assert.ok(computeSmoothStreamTargetSpeed(48, false, speedConfig) < 46)
  assert.equal(computeSmoothStreamTargetSpeed(600, false, speedConfig), 105)
  assert.equal(computeSmoothStreamTargetSpeed(10, true, speedConfig), 58)
  assert.equal(computeSmoothStreamTargetSpeed(300, true, speedConfig), 105)

  const scheduled = new Map()
  let nextId = 1
  const origRaf = globalThis.requestAnimationFrame
  const origCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId++
    scheduled.set(id, cb)
    return id
  }
  globalThis.cancelAnimationFrame = (id) => {
    scheduled.delete(id)
  }

  try {
    const lengths = []
    let completed = 0
    const longReasoning = '先梳理移动端思考阶段，再验证平滑排空不会瞬间整段弹出。'.repeat(2)
    const buffer = createSmoothStreamBuffer((val) => {
      lengths.push(val.length)
    }, {
      minSpeed: 14,
      baseSpeed: 28,
      maxSpeed: 105,
      finishSpeed: 58,
      speedDampingFactor: 3.8,
      onComplete: () => {
        completed += 1
      },
    })

    // First burst -> drain completely -> verify cooldown resets instant velocity before next SSE burst
    const firstBurst = '第一段思考内容，用于模拟高速突发文本后进入空池停顿间隙。'.repeat(2)
    buffer.push(firstBurst)
    let ts = 16
    let guard = 0
    while (scheduled.size > 0 && guard < 400) {
      guard += 1
      const entry = scheduled.entries().next().value
      scheduled.delete(entry[0])
      ts += 16
      entry[1](ts)
    }
    assert.equal(buffer.isDrained(), true)

    const countBeforeSecondBurst = lengths.length
    buffer.push(`${firstBurst}${longReasoning}`)
    for (let i = 0; i < 6 && scheduled.size > 0; i += 1) {
      const entry = scheduled.entries().next().value
      scheduled.delete(entry[0])
      ts += 16
      entry[1](ts)
    }
    const firstSecondBurstDelta = (lengths[countBeforeSecondBurst] ?? firstBurst.length) - firstBurst.length
    assert.ok(firstSecondBurstDelta <= 2, `expected calm cooldown start after idle pause, got +${firstSecondBurstDelta} chars`)

    buffer.reset()
    lengths.length = 0
    scheduled.clear()

    buffer.finish(longReasoning)
    assert.equal(completed, 0)

    let frames = 0
    while (scheduled.size > 0 && frames < 240) {
      frames += 1
      const entry = scheduled.entries().next().value
      scheduled.delete(entry[0])
      ts += 16
      entry[1](ts)
    }

    assert.ok(frames >= 3, `expected multi-frame smooth drain, got ${frames} frame(s)`)
    assert.equal(completed, 1)
    assert.equal(buffer.isDrained(), true)
    assert.ok(lengths[0] < longReasoning.length)
    assert.equal(lengths[lengths.length - 1], longReasoning.length)
  } finally {
    globalThis.requestAnimationFrame = origRaf
    globalThis.cancelAnimationFrame = origCancel
  }
})

test('resolveMobileProcessDrawerOpen holds controlled drawer open while draining and collapses immediately on tap', async () => {
  const { resolveMobileProcessDrawerOpen } = await import('../src/utils/mobileAiChat.ts')

  assert.equal(
    resolveMobileProcessDrawerOpen({
      controlledExpanded: false,
      localExpanded: false,
      holdOpenForDrain: true,
      userClosedDuringDrain: false,
    }),
    true,
  )
  assert.equal(
    resolveMobileProcessDrawerOpen({
      controlledExpanded: false,
      localExpanded: false,
      holdOpenForDrain: true,
      userClosedDuringDrain: true,
    }),
    false,
  )
  assert.equal(
    resolveMobileProcessDrawerOpen({
      controlledExpanded: false,
      localExpanded: false,
      holdOpenForDrain: false,
      userClosedDuringDrain: false,
    }),
    false,
  )
})

test('resolveMobileTextDrainAction and animateOnMount animate fresh replies while keeping history instant', async () => {
  const {
    createAssistantPlaceholder,
    restoreConversationMessages,
    resolveMobileTextDrainAction,
  } = await import('../src/utils/mobileAiChat.ts')

  const livePlaceholder = createAssistantPlaceholder('msg-live')
  assert.equal(livePlaceholder.animateOnMount, true)

  const history = restoreConversationMessages({
    id: 'conv-hist',
    chatScopeState: 'BOUND',
    chatScope: null,
    messages: [
      { id: 'msg-hist', role: 'ASSISTANT', status: 'COMPLETED', content: '历史回答', parts: [] },
    ],
  })
  assert.equal(history.length, 1)
  assert.equal(Boolean(history[0].animateOnMount), false)

  assert.equal(
    resolveMobileTextDrainAction({
      streaming: false,
      settling: true,
      partId: 'part-1',
      partKind: 'text',
      partText: '单包快速回复内容',
      activeTextId: null,
      isActive: false,
      lastCompletedTextId: null,
    }),
    'finish_drain',
  )
  assert.equal(
    resolveMobileTextDrainAction({
      streaming: false,
      settling: true,
      partId: 'part-1',
      partKind: 'text',
      partText: '单包快速回复内容',
      activeTextId: null,
      isActive: false,
      lastCompletedTextId: 'part-1',
    }),
    'sync_immediate',
  )
  assert.equal(
    resolveMobileTextDrainAction({
      streaming: false,
      settling: false,
      partId: 'part-hist',
      partKind: 'text',
      partText: '历史回答',
      activeTextId: null,
      isActive: false,
      lastCompletedTextId: null,
    }),
    'sync_immediate',
  )
})

test('chatWithAI streams progressively via fetch ReadableStream, retries once on 401, and aborts cleanly', async (context) => {
  let token = 'stale-token'
  const loginGen = Symbol('h5-gen')
  const origWindow = globalThis.window
  const origDocument = globalThis.document
  const origFetch = globalThis.fetch

  globalThis.__h5StreamAuth = {
    get token() { return token },
    getLoginGeneration: () => loginGen,
    refreshAccessToken: async () => {
      token = 'fresh-h5-token'
      return true
    },
    expireSession: () => {},
  }
  globalThis.window = globalThis
  globalThis.document = {}

  const mocks = new Map([
    ['./aiApi', 'export const aiApi = {};'],
    ['./request', 'export default {};'],
    ['@/config/runtime', 'export const getRuntimeConfig = () => ({ apiBaseUrl: "https://api.auralis.test", websocketBaseUrl: "wss://api.auralis.test", platform: "h5" });'],
    ['@/store/useAuthStore', 'export const useAuthStore = () => globalThis.__h5StreamAuth;'],
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
    delete globalThis.__h5StreamAuth
    globalThis.window = origWindow
    globalThis.document = origDocument
    globalThis.fetch = origFetch
  })

  const { chatWithAI } = await import('../src/api/aiClient.ts?h5-fetch-stream-test')

  // 1) 401 -> refresh once -> progressive chunked delivery before EOF
  const encoder = new TextEncoder()
  const makeEnvelope = (seq, event, payload) => ({
    protocolVersion: 1,
    conversationId: 'conv-h5',
    requestId: 'req-h5',
    runId: 'run-h5',
    attemptId: 'att-h5',
    userMessageId: 'u-h5',
    replyMessageId: 'a-h5',
    sequence: seq,
    event,
    payload,
  })
  const chunk1 = encoder.encode(
    `event: reasoning.delta\ndata: ${JSON.stringify(makeEnvelope(1, 'reasoning.delta', { text: '正在梳理' }))}\n\n`
    + `event: tool.started\ndata: ${JSON.stringify(makeEnvelope(2, 'tool.started', { toolCallId: 't1', name: 'search', label: '检索资料' }))}\n\n`,
  )
  const chunk2Full = encoder.encode(
    `event: text.delta\ndata: ${JSON.stringify(makeEnvelope(3, 'text.delta', { text: '逐字推送正文', publicTextDelta: '逐字推送正文' }))}\n\n`
    + `event: run.completed\ndata: ${JSON.stringify(makeEnvelope(4, 'run.completed', { executionActive: false }))}\n\n`,
  )
  const splitPoint = Math.floor(chunk2Full.length / 2)
  const chunk2a = chunk2Full.slice(0, splitPoint)
  const chunk2b = chunk2Full.slice(splitPoint)

  let fetchCalls = 0
  let chunk2Released = false
  let releaseChunk2 = null
  const chunk2Gate = new Promise((resolve) => {
    releaseChunk2 = () => {
      chunk2Released = true
      resolve()
    }
  })

  globalThis.fetch = async (_url, init) => {
    fetchCalls += 1
    assert.equal(init.headers['Accept-Encoding'], 'identity')
    if (fetchCalls === 1) {
      assert.equal(init.headers.Authorization, 'Bearer stale-token')
      return new Response('', { status: 401 })
    }
    assert.equal(init.headers.Authorization, 'Bearer fresh-h5-token')
    let step = 0
    const body = new ReadableStream({
      async pull(controller) {
        step += 1
        if (step === 1) {
          controller.enqueue(chunk1)
          return
        }
        if (step === 2) {
          await chunk2Gate
          controller.enqueue(chunk2a)
          return
        }
        if (step === 3) {
          controller.enqueue(chunk2b)
          return
        }
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const reasoningSeen = []
  const toolsSeen = []
  const deltasSeen = []
  let terminalSeen = null
  let sawChunk1BeforeChunk2 = false

  const chatPromise = chatWithAI('你好', [], (delta) => {
    deltasSeen.push(delta)
  }, 'conv-h5', {
    onReasoningDelta: (delta) => {
      reasoningSeen.push(delta)
      if (!chunk2Released) {
        sawChunk1BeforeChunk2 = true
        releaseChunk2?.()
      }
    },
    onToolEvent: (evt) => toolsSeen.push(evt),
    onTerminal: (t) => { terminalSeen = t },
  })

  await chatPromise
  assert.equal(fetchCalls, 2)
  assert.equal(sawChunk1BeforeChunk2, true, 'must emit SSE events before stream closes')
  assert.deepEqual(reasoningSeen, ['正在梳理'])
  assert.equal(toolsSeen[0].label, '检索资料')
  assert.deepEqual(deltasSeen, ['逐字推送正文'])
  assert.deepEqual(terminalSeen, { status: 'COMPLETED' })

  // 2) Manual abort resolves cleanly without rejecting
  let abortLocalFn = null
  let signalAborted = false
  globalThis.fetch = async (_url, init) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1)
        init.signal.addEventListener('abort', () => {
          signalAborted = true
          controller.error(new DOMException('Aborted', 'AbortError'))
        })
      },
    })
    return new Response(body, { status: 200 })
  }

  const abortedRun = chatWithAI('暂停测试', [], () => {}, 'conv-h5', {
    onAbortReady: (fn) => { abortLocalFn = fn },
    onReasoningDelta: () => { abortLocalFn?.() },
  })
  await abortedRun
  assert.equal(signalAborted, true)
})
