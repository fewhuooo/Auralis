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
  autoCloseMarkdown,
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
