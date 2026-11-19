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
  applyChatContentUpdate,
  createChatActivitySubmission,
  createChatContentProjectionState,
  getChatActivityDraft,
  getChatChartRatios,
  isChatActivityStructurallyValid,
  projectChatContentPart,
  projectChatContentParts,
  updateChatActivityDraft,
} from '../src/services/chatContentProjection.ts'
import {
  appendStreamCursorDot,
  autoCloseMarkdown,
  extractStreamingBlockDraft,
  renderMarkdown,
  wrapTrailingToken,
} from '../src/utils/markdown.ts'

const quiz = (overrides = {}) => ({
  id: 'part-quiz',
  componentId: 'component-quiz',
  kind: 'block',
  component: 'quiz',
  state: 'READY',
  questionId: 'question-1',
  meta: { questionType: 'single', question: 'Which path reaches the result?' },
  items: [{ key: 'A', text: 'Read the first clue' }, { key: 'B', text: 'Skip the evidence' }],
  ...overrides,
})

const question = (overrides = {}) => ({
  id: 'part-open',
  componentId: 'component-open',
  kind: 'block',
  component: 'question',
  state: 'READY',
  questionId: 'question-open',
  meta: { question: 'Explain why the steps are ordered this way.', placeholder: 'Write a short explanation.' },
  items: [],
  ...overrides,
})

test('projects only public fields for each supported part and rejects unknown protocols', () => {
  const projected = projectChatContentParts([
    { id: 'text-1', kind: 'text', text: '**A clear explanation**', private: 'drop me' },
    {
      id: 'compare-1', componentId: 'compare-a', kind: 'block', component: 'compare', state: 'READY',
      meta: { title: 'Two approaches', description: 'Use the same evidence.' },
      items: [
        {
          title: 'Communication pattern',
          entries: [
            { label: 'HTTP polling', text: 'The client periodically requests updates.', private: 'drop' },
            { label: 'SSE', text: 'The server streams updates over one connection.' },
          ],
        },
      ],
    },
    {
      id: 'steps-1', componentId: 'steps-a', kind: 'block', component: 'steps', state: 'GENERATING',
      meta: { title: 'Method', description: 'Follow the chain.', answer: 'private' },
      items: [{ title: 'Read', description: 'Find evidence.', internal: 'drop' }, { title: '', description: 'invalid' }],
    },
    {
      id: 'route-1', componentId: 'route-a', kind: 'block', component: 'roadmap', state: 'READY',
      meta: { title: 'Route', description: 'A path.', current: true, unrelated: 'drop' },
      items: [{ title: 'Start', tag: 'now', current: true, score: 99 }],
    },
    {
      id: 'chart-1', componentId: 'chart-a', kind: 'block', component: 'chart', state: 'READY',
      questionId: 'must-not-leak', reference: { answer: 'private' },
      meta: { title: 'Share', chartType: 'proportion', unit: '%', reference: 'private' },
      items: [
        { label: 'A', value: 0.25, answer: true },
        { label: 'B', value: 0.75, color: 'untrusted' },
      ],
    },
    { id: 'old-shape', kind: 'markdown', content: 'legacy fallback is not accepted' },
    { id: 'unknown', componentId: 'x', kind: 'block', component: 'tool', state: 'READY', meta: {}, items: [] },
  ])

  assert.equal(projected.length, 5)
  assert.deepEqual(projected[0], { id: 'text-1', kind: 'text', text: '**A clear explanation**' })
  assert.deepEqual(projected[1], {
    id: 'compare-1', componentId: 'compare-a', kind: 'block', component: 'compare', state: 'READY',
    meta: { title: 'Two approaches', description: 'Use the same evidence.' },
    items: [
      {
        title: 'Communication pattern',
        entries: [
          { label: 'HTTP polling', text: 'The client periodically requests updates.' },
          { label: 'SSE', text: 'The server streams updates over one connection.' },
        ],
      },
    ],
  })
  assert.deepEqual(projected[2], {
    id: 'steps-1', componentId: 'steps-a', kind: 'block', component: 'steps', state: 'GENERATING',
    meta: { title: 'Method', description: 'Follow the chain.' },
    items: [{ title: 'Read', description: 'Find evidence.' }],
  })
  assert.deepEqual(projected[3], {
    id: 'route-1', componentId: 'route-a', kind: 'block', component: 'roadmap', state: 'READY',
    meta: { title: 'Route', description: 'A path.', current: true },
    items: [{ title: 'Start', tag: 'now', current: true }],
  })
  assert.deepEqual(projected[4], {
    id: 'chart-1', componentId: 'chart-a', kind: 'block', component: 'chart', state: 'READY',
    meta: { title: 'Share', chartType: 'proportion', unit: '%' },
    items: [{ label: 'A', value: 0.25 }, { label: 'B', value: 0.75 }],
  })
  assert.equal(JSON.stringify(projected).includes('private'), false)
  assert.equal(projectChatContentPart({ id: 'missing-kind' }), null)
})

test('stable part updates replace in place and keep drafts keyed by component id', () => {
  let state = createChatContentProjectionState()
  state = applyChatContentUpdate(state, { id: 'text-1', kind: 'text', text: 'Intro' })
  state = applyChatContentUpdate(state, quiz({ state: 'GENERATING', items: [] }))
  state = updateChatActivityDraft(state, 'component-quiz', 'B')
  state = applyChatContentUpdate(state, quiz({ state: 'READY', meta: { questionType: 'single', question: 'Updated wording' } }))

  assert.deepEqual(state.parts.map((part) => part.id), ['text-1', 'part-quiz'])
  assert.equal(state.parts[1].meta.question, 'Updated wording')
  assert.equal(getChatActivityDraft(state, state.parts[1]), 'B')

  const before = state
  const after = applyChatContentUpdate(state, { id: 'bad', kind: 'block', component: 'unknown' })
  assert.equal(after, before)
})

test('single-choice submission requires a durable READY state, valid structure, answer, and idle parent', () => {
  const block = projectChatContentPart(quiz())
  assert.ok(block && block.kind === 'block')
  assert.equal(isChatActivityStructurallyValid(block), true)
  assert.equal(createChatActivitySubmission(block, 'A', true), null)
  assert.equal(createChatActivitySubmission({ ...block, state: 'GENERATING' }, 'A', false), null)
  assert.equal(createChatActivitySubmission({ ...block, state: 'INVALID' }, 'A', false), null)
  assert.equal(createChatActivitySubmission({ ...block, state: 'SUBMITTED' }, 'A', false), null)
  assert.equal(createChatActivitySubmission(block, null, false), null)
  assert.equal(createChatActivitySubmission({ ...block, questionId: undefined }, 'A', false), null)
  assert.deepEqual(createChatActivitySubmission(block, 'B', false), { questionId: 'question-1', answer: 'B' })
  assert.equal(createChatActivitySubmission(block, 'not-an-option', false), null)
  assert.equal(createChatActivitySubmission(block, ['A'], false), null)
})

test('historical activity parts cannot become actionable through old question or option fields', () => {
  const parts = projectChatContentParts([
    quiz({ meta: { stem: 'Old quiz question', questionType: 'single' } }),
    question({ meta: { title: 'Old open question' } }),
    quiz({
      items: [
        { key: 'A', text: 'Current option' },
        { key: 'B', text: 'Another current option' },
        { label: 'C', content: 'Old option' },
        { key: 'D', title: 'Another old option' },
      ],
    }),
  ])

  assert.equal(parts.length, 3)
  assert.deepEqual(parts.map((part) => part.state), ['INVALID', 'INVALID', 'INVALID'])
  assert.equal(parts[0].meta.question, undefined)
  assert.equal(parts[1].meta.question, undefined)
  assert.deepEqual(parts[2].items, [{ key: 'A', text: 'Current option' }, { key: 'B', text: 'Another current option' }])
  assert.deepEqual(parts.map((part) => createChatActivitySubmission(part, 'A', false)), [null, null, null])
})

test('multiple-choice answer must contain unique keys from the projected options', () => {
  const block = projectChatContentPart(quiz({ meta: { questionType: 'multiple', question: 'Choose all supported paths.' } }))
  assert.ok(block && block.kind === 'block')
  assert.deepEqual(createChatActivitySubmission(block, ['A', 'B'], false), {
    questionId: 'question-1', answer: ['A', 'B'],
  })
  assert.equal(createChatActivitySubmission(block, [], false), null)
  assert.equal(createChatActivitySubmission(block, ['A', 'A'], false), null)
  assert.equal(createChatActivitySubmission(block, ['A', 'missing'], false), null)
  assert.equal(isChatActivityStructurallyValid(projectChatContentPart(quiz({
    items: [{ key: 'A', text: 'One' }, { key: 'A', text: 'Duplicate' }],
  }))), false)
})

test('open-answer drafts retain exact text and submit only a non-whitespace answer when ready', () => {
  const block = projectChatContentPart(question())
  assert.ok(block && block.kind === 'block')
  assert.equal(createChatActivitySubmission(block, '  ', false), null)
  assert.deepEqual(createChatActivitySubmission(block, '  Because each step uses the last result.  ', false), {
    questionId: 'question-open', answer: '  Because each step uses the last result.  ',
  })
  assert.equal(createChatActivitySubmission({ ...block, state: 'GENERATING' }, 'draft', false), null)
})

test('chart ratios remain finite for large values and zero-only data', () => {
  const block = projectChatContentPart({
    id: 'chart', componentId: 'chart', kind: 'block', component: 'chart', state: 'READY',
    meta: { title: 'Distribution', chartType: 'bar' },
    items: [{ label: 'large', value: 1e308 }, { label: 'small', value: 1e307 }],
  })
  assert.ok(block && block.kind === 'block')
  const ratios = getChatChartRatios(block)
  assert.ok(ratios.every(Number.isFinite))
  assert.ok(Math.abs(ratios.reduce((sum, value) => sum + value, 0) - 1) < 1e-12)

  const zeros = projectChatContentPart({
    ...block, id: 'zero-chart', items: [{ label: 'zero', value: 0 }, { label: 'also zero', value: 0 }],
  })
  assert.ok(zeros && zeros.kind === 'block')
  assert.deepEqual(getChatChartRatios(zeros), [0, 0])
  const invalidValues = projectChatContentPart({
    ...block, id: 'invalid-values', items: [{ label: 'infinite', value: Infinity }, { label: 'negative', value: -1 }],
  })
  assert.ok(invalidValues && invalidValues.kind === 'block')
  assert.deepEqual(invalidValues.items, [])
})

test('autoCloseMarkdown optimistic closures and prefix hold-back', () => {
  // 1. Tag & container prefix hold-back
  assert.equal(autoCloseMarkdown('这是前文<quiz-'), '这是前文')
  assert.equal(autoCloseMarkdown('这是前文:::flow'), '这是前文')
  assert.equal(autoCloseMarkdown('这是前文```type'), '这是前文')

  // 2. Unclosed code block
  assert.equal(autoCloseMarkdown('```python\nprint("hello")'), '```python\nprint("hello")\n```')

  // 3. Unclosed LaTeX math
  assert.equal(autoCloseMarkdown('公式 $$x = 1'), '公式 $$x = 1$$')
  assert.equal(autoCloseMarkdown('行内公式 \\(x + y'), '行内公式 \\(x + y\\)')
  assert.equal(autoCloseMarkdown('块级公式 \\[A = B'), '块级公式 \\[A = B\\]')

  // 4. Unclosed link
  assert.equal(autoCloseMarkdown('参考 [深度解析](https://example.com/doc'), '参考 [深度解析](https://example.com/doc)')

  // 5. Unclosed bold & inline code
  assert.equal(autoCloseMarkdown('核心 **关键机制'), '核心 **关键机制**')
  assert.equal(autoCloseMarkdown('执行命令 `npm test'), '执行命令 `npm test`')

  // 6. Code block interior does not leak into inline markers
  assert.equal(
    autoCloseMarkdown('```python\nx = 2 ** 8\n```\n这是普通文本'),
    '```python\nx = 2 ** 8\n```\n这是普通文本'
  )

  // 7. Inline code interior does not leak into bold / math markers (both closed and unclosed inline code)
  assert.equal(
    autoCloseMarkdown('使用 `x = 2 ** 8` 进行计算'),
    '使用 `x = 2 ** 8` 进行计算'
  )
  assert.equal(
    autoCloseMarkdown('使用 `x = 2 ** 8'),
    '使用 `x = 2 ** 8`'
  )
  assert.equal(
    autoCloseMarkdown('变量 `echo $$` 打印PID'),
    '变量 `echo $$` 打印PID'
  )
  assert.equal(
    autoCloseMarkdown('变量 `echo $$'),
    '变量 `echo $$`'
  )
})

test('wrapTrailingToken wraps trailing characters with token-fade span', () => {
  const htmlWithTags = '<p>正在讲解<strong>核心概念</strong></p>'
  const wrapped = wrapTrailingToken(htmlWithTags)
  assert.ok(wrapped.includes('<span class="token-fade">核心概念</span>'))
  assert.ok(wrapped.endsWith('</strong></p>'))

  const htmlWithTrailingWhitespace = '<p>正在讲解知识点</p>\n'
  const wrappedWs = wrapTrailingToken(htmlWithTrailingWhitespace)
  assert.ok(wrappedWs.includes('<span class="token-fade">解知识点</span>'))
})

test('extractStreamingBlockDraft holds unclosed math blocks and multiline tables while ignoring fenced code', () => {
  const unclosedDollar = extractStreamingBlockDraft('推导出如下公式：\n\n$$\\frac{a}{b}')
  assert.equal(unclosedDollar.stablePrefix, '推导出如下公式：\n\n')
  assert.deepEqual(unclosedDollar.draft, { kind: 'math', raw: '$$\\frac{a}{b}' })

  const closedDollar = extractStreamingBlockDraft('推导出如下公式：\n\n$$\\frac{a}{b}$$\n\n完毕')
  assert.equal(closedDollar.draft, null)

  const unclosedBracket = extractStreamingBlockDraft('矩阵为：\n\\[A = B')
  assert.equal(unclosedBracket.stablePrefix, '矩阵为：\n')
  assert.deepEqual(unclosedBracket.draft, { kind: 'math', raw: '\\[A = B' })

  const unclosedTable = extractStreamingBlockDraft('对比如下：\n| 协议 | 特点 |\n| :--- | :--- |\n| SSE | 单向推流')
  assert.equal(unclosedTable.stablePrefix, '对比如下：\n')
  assert.equal(unclosedTable.draft?.kind, 'table')
  assert.ok(unclosedTable.draft?.raw.includes('| SSE | 单向推流'))

  const closedTable = extractStreamingBlockDraft('| 协议 | 特点 |\n| :--- | :--- |\n| SSE | 单向 |\n\n后续结论')
  assert.equal(closedTable.draft, null)

  const unclosedFence = extractStreamingBlockDraft('```md\n$$x\n| a | b |')
  assert.equal(unclosedFence.draft, null)
})

test('renderMarkdown injects 8px stream-cursor-dot inside text blocks and stable draft cards while streaming', () => {
  const unclosedTableHtml = renderMarkdown('说明如下：\n\n| 列A | 列B |\n| :--- | :--- |\n| 1 | 2', true)
  assert.match(unclosedTableHtml, /streaming-block-draft--table/)
  assert.match(unclosedTableHtml, /表格生成中…/)
  assert.doesNotMatch(unclosedTableHtml, /<table>/)

  const completedTableStreaming = renderMarkdown('| 列A | 列B |\n| :--- | :--- |\n| 1 | 2 |\n\n结论如下', true)
  assert.match(completedTableStreaming, /<table>/)
  assert.match(completedTableStreaming, /<span class="stream-cursor-dot" aria-hidden="true"><\/span><\/p>/)

  const settledHtml = renderMarkdown('| 列A | 列B |\n| :--- | :--- |\n| 1 | 2 |', false)
  assert.match(settledHtml, /<table>/)
  assert.doesNotMatch(settledHtml, /stream-cursor-dot/)
  assert.doesNotMatch(settledHtml, /streaming-block-draft/)

  const inlineCursor = appendStreamCursorDot('<p>核心<span class="token-fade">定义</span></p>\n')
  assert.equal(inlineCursor, '<p>核心<span class="token-fade">定义</span><span class="stream-cursor-dot" aria-hidden="true"></span></p>\n')
})

test('wrapTrailingToken preserves complete HTML entities without splitting inside token-fade spans', async () => {
  const { wrapTrailingToken, renderMarkdown } = await import('../src/utils/markdown.ts')

  for (const entity of ['&amp;', '&quot;', '&#039;', '&nbsp;']) {
    const wrapped = wrapTrailingToken(`<p>A${entity}</p>`)
    assert.equal(wrapped, `<p>A<span class="token-fade">${entity}</span></p>`)
  }

  const trailingPlain = wrapTrailingToken('<p>AT&amp;T 协议</p>')
  assert.equal(trailingPlain, '<p>AT&amp;T <span class="token-fade">协议</span></p>')

  const streamedHtml = renderMarkdown('AT&T & "Demo"', true)
  assert.doesNotMatch(streamedHtml, /<span class="token-fade">[a-z0-9#]+;<\/span>/i)
  assert.match(streamedHtml, /&amp;/)
})

test('reduceChatStreamEvent builds interleaved chronological processTimeline with Chinese tool labels', async () => {
  const { createChatStreamState, reduceChatStreamEvent } = await import('../src/services/aiStreamReducer.ts')

  const baseEnvelope = {
    protocolVersion: 1,
    conversationId: 'conv-1',
    requestId: 'req-1',
    runId: 'run-1',
    attemptId: 'att-1',
    userMessageId: 'user-1',
    replyMessageId: 'reply-1',
  }

  let state = createChatStreamState()
  state = reduceChatStreamEvent(state, {
    ...baseEnvelope,
    sequence: 1,
    event: 'reasoning.delta',
    payload: { text: '先查找课程目录中的定义，' },
  })
  state = reduceChatStreamEvent(state, {
    ...baseEnvelope,
    sequence: 2,
    event: 'tool.started',
    payload: { toolCallId: 'tc-1', name: '检索资料', label: '检索「335次咨询」' },
  })
  state = reduceChatStreamEvent(state, {
    ...baseEnvelope,
    sequence: 3,
    event: 'tool.completed',
    payload: { toolCallId: 'tc-1', name: '检索资料', label: '检索「335次咨询」' },
  })
  state = reduceChatStreamEvent(state, {
    ...baseEnvelope,
    sequence: 4,
    event: 'reasoning.delta',
    payload: { text: '再结合原文摘录整理结论。' },
  })

  assert.equal(state.processTimeline.length, 3)
  assert.deepEqual(
    state.processTimeline.map((item) => item.kind),
    ['reasoning', 'tool', 'reasoning'],
  )
  assert.equal(state.processTimeline[0].kind === 'reasoning' && state.processTimeline[0].text, '先查找课程目录中的定义，')
  assert.deepEqual(state.processTimeline[1].kind === 'tool' && state.processTimeline[1].tool, {
    id: 'tc-1',
    name: '检索资料',
    label: '检索「335次咨询」',
    status: 'COMPLETED',
  })
  assert.equal(state.processTimeline[2].kind === 'reasoning' && state.processTimeline[2].text, '再结合原文摘录整理结论。')
})

test('chatProcessFormat formats concise Chinese tool labels and strips leaked internal tokens from reasoning', async () => {
  const { formatToolCapsuleLabel, sanitizeReasoningText } = await import('../src/utils/chatProcessFormat.ts')

  assert.equal(formatToolCapsuleLabel({ name: 'search', label: '检索「事务隔离」' }), '检索「事务隔离」')
  assert.equal(formatToolCapsuleLabel({ name: 'read_source_overview' }), '查看资料总览')
  assert.equal(formatToolCapsuleLabel({ name: 'render_compare' }), '生成对比卡片')

  const cleaned = sanitizeReasoningText(
    '先调用 list_sources 查看并传 search.sourceIds，确认 chunkId=c1 的 hasOverview 状态。\n```ts\nconst list_sources = 1\n```',
  )
  const [proseBeforeFence] = cleaned.split('```ts')
  assert.doesNotMatch(proseBeforeFence, /list_sources|search\.sourceIds|chunkId|hasOverview/)
  assert.match(proseBeforeFence, /查看资料目录/)
  assert.match(cleaned, /const list_sources = 1/)
})

test('createSmoothStreamBuffer drains push-then-finish and prevents rAF or onComplete after destroy', async () => {
  const { createSmoothStreamBuffer } = await import('../src/services/smoothStreamBuffer.ts')

  const scheduledCallbacks = new Map()
  let nextFrameId = 1
  const originalWindow = globalThis.window
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame

  globalThis.window = globalThis
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextFrameId++
    scheduledCallbacks.set(id, cb)
    return id
  }
  globalThis.cancelAnimationFrame = (id) => {
    scheduledCallbacks.delete(id)
  }

  try {
    let text = ''
    let completed = 0
    const buffer = createSmoothStreamBuffer((val) => { text = val }, {
      onComplete: () => { completed += 1 },
    })

    buffer.push('平滑流式测试文本')
    assert.equal(scheduledCallbacks.size, 1)
    buffer.finish('平滑流式测试文本')

    let guard = 0
    while (scheduledCallbacks.size > 0 && guard < 40) {
      guard += 1
      const entry = scheduledCallbacks.entries().next().value
      scheduledCallbacks.delete(entry[0])
      entry[1](guard * 60)
    }

    assert.equal(text, '平滑流式测试文本')
    assert.equal(buffer.isDrained(), true)
    assert.equal(completed, 1)

    let reentrantCompleted = 0
    let reentrantUpdates = 0
    const reentrantBuffer = createSmoothStreamBuffer(() => {
      reentrantUpdates += 1
      reentrantBuffer.destroy()
    }, {
      onComplete: () => { reentrantCompleted += 1 },
    })
    reentrantBuffer.push('ABCDEFGH')
    reentrantBuffer.finish('ABCDEFGH')
    const first = scheduledCallbacks.entries().next().value
    scheduledCallbacks.delete(first[0])
    first[1](80)
    const second = scheduledCallbacks.entries().next().value
    scheduledCallbacks.delete(second[0])
    second[1](150)

    assert.equal(reentrantUpdates, 1)
    assert.equal(scheduledCallbacks.size, 0)
    assert.equal(reentrantCompleted, 0)

    // Reaching fullText.length inside tick then calling finish() must cancel pending rAF and fire onComplete once
    let onceCompleted = 0
    const finishAfterReachBuffer = createSmoothStreamBuffer(() => {}, {
      baseSpeed: 100,
      maxSpeed: 100,
      onComplete: () => { onceCompleted += 1 },
    })
    finishAfterReachBuffer.push('AB')
    const rTick1 = scheduledCallbacks.entries().next().value
    scheduledCallbacks.delete(rTick1[0])
    rTick1[1](100)
    const rTick2 = scheduledCallbacks.entries().next().value
    scheduledCallbacks.delete(rTick2[0])
    rTick2[1](180)
    assert.equal(scheduledCallbacks.size, 1)
    finishAfterReachBuffer.finish('AB')
    assert.equal(scheduledCallbacks.size, 0)
    assert.equal(onceCompleted, 1)
  } finally {
    globalThis.window = originalWindow
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancel
  }
})

test('projectToolTrace normalizes lowercase server statuses alongside explicit labels', async () => {
  const { projectToolTrace } = await import('../src/services/aiStreamReducer.ts')

  const projected = projectToolTrace([
    { id: 't1', name: '检索资料', label: '检索「MVCC」', status: 'started' },
    { id: 't2', name: '查看资料总览', label: '查看《数据库》总览', status: 'error' },
    { id: 't3', name: '生成对比卡片', status: 'completed' },
  ])
  assert.deepEqual(projected, [
    { id: 't1', name: '检索资料', label: '检索「MVCC」', status: 'RUNNING' },
    { id: 't2', name: '查看资料总览', label: '查看《数据库》总览', status: 'FAILED' },
    { id: 't3', name: '生成对比卡片', status: 'COMPLETED' },
  ])
})

test('chatSmartScroll enforces 50px threshold and preserves upward wheel intent near bottom', async () => {
  const { evaluatePcScrollEvent, isPcNearBottom, shouldPcAutoScroll } = await import('../src/utils/chatSmartScroll.ts')

  assert.equal(isPcNearBottom({ scrollTop: 560, scrollHeight: 1000, clientHeight: 400 }), true)
  assert.equal(isPcNearBottom({ scrollTop: 550, scrollHeight: 1000, clientHeight: 400 }), false)

  const upwardWithin50Px = evaluatePcScrollEvent(
    { locked: true, prevScrollTop: 600 },
    { scrollTop: 575, scrollHeight: 1000, clientHeight: 400, userPullUpActive: true },
    false,
  )
  assert.equal(upwardWithin50Px.locked, true)

  const lockedState = evaluatePcScrollEvent(
    { locked: false, prevScrollTop: 560 },
    { scrollTop: 480, scrollHeight: 1000, clientHeight: 400 },
    false,
  )
  assert.equal(lockedState.locked, true)
  assert.equal(shouldPcAutoScroll(lockedState.locked), false)

  const programmaticWhileLocked = evaluatePcScrollEvent(
    lockedState,
    { scrollTop: 480, scrollHeight: 1400, clientHeight: 400 },
    true,
  )
  assert.equal(programmaticWhileLocked.locked, true)

  const recoveredAtBottom = evaluatePcScrollEvent(
    programmaticWhileLocked,
    { scrollTop: 960, scrollHeight: 1400, clientHeight: 400 },
    false,
  )
  assert.equal(recoveredAtBottom.locked, false)
  assert.equal(shouldPcAutoScroll(recoveredAtBottom.locked), true)
})
