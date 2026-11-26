import assert from 'node:assert/strict'
import test from 'node:test'
import {
  autoCloseStreamingMarkdown,
  extractStreamingBlockDraft,
  plainMarkdownExcerpt,
  renderMarkdownHtml,
} from '../src/utils/markdown.ts'

test('renderMarkdownHtml renders inline math, nested fractions, scripts and Greek symbols via KaTeX without leaking raw tokens', () => {
  const html = renderMarkdownHtml(
    '构造 $\\varphi(x) = f(x) - \\frac{f(b)-f(a)}{b-a}(x-a)$ 与 $x_0, x^{2n}, \\xi \\in (a, b)$',
  )
  assert.match(html, /class="katex"/)
  assert.match(html, /class="katex-mathml"/)
  assert.match(html, /<mfrac>/)
  assert.match(html, /<msub>/)
  assert.match(html, /<msup>/)
  assert.match(html, /φ/)
  assert.match(html, /ξ/)
  const visibleHtml = html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, '')
  assert.doesNotMatch(visibleHtml, /\\varphi|\\frac|\\xi/)
  assert.doesNotMatch(html, /@@AURALIS/)
})

test('renderMarkdownHtml renders overlapping TeX commands, braces, roots, text and display blocks cleanly', () => {
  const html = renderMarkdownHtml(
    '区间 $\\left( x \\right)$ 与集合 $\\{a, b\\}$ 及 $x \\leq y$，以及 $\\sqrt{x^2 + 1} + \\text{<safe>}$\n\n$$E = mc^2$$',
  )
  assert.match(html, /class="katex"/)
  assert.doesNotMatch(html, /≤ft/)
  assert.match(html, /<msqrt>/)
  assert.match(html, /&lt;safe&gt;/)
  assert.match(html, /class="katex-display-wrapper"/)
  assert.match(html, /class="katex-display"/)
  assert.match(html, /mc/)
})

test('renderMarkdownHtml isolates literal placeholder tokens and code blocks cleanly without inline pill leakage', () => {
  const html = renderMarkdownHtml(
    '字面量 `@@AURALISMATH0@@` 与\n```ts\nconst x = 1\n```\n以及 $y$',
  )
  assert.match(html, /<code[^>]*>@@AURALISMATH0@@<\/code>/)
  assert.match(html, /<pre style="[^"]*"><code style="font-family:inherit;background:transparent;[^"]*">const x = 1\s*<\/code><\/pre>/)
  assert.match(html, /class="katex"/)
  assert.match(html, />y</)
})

test('renderMarkdownHtml keeps dollar variables and pure currencies inside code spans and prose untouched', () => {
  const html = renderMarkdownHtml('环境变量 `$HOME` 与\n```\n$PATH\n```\n以及价格 $100$ 与 $50.00$ 不转数学')
  assert.match(html, /<code[^>]*>\$HOME<\/code>/)
  assert.match(html, /<code[^>]*>\$PATH\s*<\/code>/)
  assert.match(html, /\$100\$/)
  assert.match(html, /\$50\.00\$/)
  assert.doesNotMatch(html, /class="katex"/)
})

test('renderMarkdownHtml escapes raw HTML and XSS payloads in prose, math, links and image schemes', () => {
  const html = renderMarkdownHtml(
    '<script>alert(1)</script>\n\n$<img src=x onerror=alert(1)>$ 与 [<img src=x onerror=alert(1)>](https://example.com) [**bold**](https://example.com) ![bad](javascript:alert(1)) ![ok](https://example.com/a.png)',
  )
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /<strong[^>]*>bold<\/strong>/)
  assert.doesNotMatch(html, /<script|<img\s+src=x|<img\b[^>]*\bonerror\s*=|src="javascript:/i)
  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="ok"/)
})

test('plainMarkdownExcerpt preserves Unicode math subscripts, unbraced TeX scripts and readable fractions', () => {
  const excerpt = plainMarkdownExcerpt('## 核心结论\n在 $x_0$ 与 $x_\\alpha$ 处具有 $n$ 阶导数，$\\xi \\in (a, b)$ 且 $\\{1\\}$ 与 $\\frac{a}{b}$')
  assert.equal(excerpt, '核心结论 在 x₀ 与 x_α 处具有 n 阶导数，ξ ∈ (a, b) 且 {1} 与 (a)/(b)')
})

test('renderMarkdownHtml styles Markdown tables without corrupting thead tags', () => {
  const html = renderMarkdownHtml(
    '| 隔离级别 | 脏读 | 幻读 |\n| :--- | :---: | :---: |\n| Repeatable Read | 不会 | 可能 |',
  )
  assert.match(html, /<thead>/)
  assert.match(html, /<\/thead>/)
  assert.doesNotMatch(html, /"ead>/)
  assert.match(html, /<table style="width:100%/)
  assert.match(html, /<th style="[^"]*"[^>]*>隔离级别<\/th>/)
  assert.match(html, /<td style="[^"]*"[^>]*>Repeatable Read<\/td>/)
})

test('renderMarkdownHtml supports \\[...\\] and \\(...\\) delimiters as well as plain excerpts', () => {
  const html = renderMarkdownHtml('勾股定理 \\(a^2 + b^2 = c^2\\) 与\n\n\\[E = mc^2\\]')
  assert.match(html, /class="katex"/)
  assert.match(html, /class="katex-display-wrapper"/)
  assert.match(html, /class="katex-display"/)
  assert.match(html, /<msup>/)

  const excerpt = plainMarkdownExcerpt('结论：\\(x_0\\) 满足 \\[\\frac{1}{2}\\]')
  assert.equal(excerpt, '结论：x₀ 满足 (1)/(2)')
})

test('autoCloseStreamingMarkdown and extractStreamingBlockDraft stabilize incremental Markdown streaming', () => {
  assert.equal(autoCloseStreamingMarkdown('核心 **关键机制'), '核心 **关键机制**')
  assert.equal(autoCloseStreamingMarkdown('运行 `npm run'), '运行 `npm run`')
  assert.equal(autoCloseStreamingMarkdown('参考 [文档](https://auralis.test'), '参考 [文档](https://auralis.test)')
  assert.equal(autoCloseStreamingMarkdown('前文<quiz-'), '前文')

  const pendingMath = extractStreamingBlockDraft('证明如下：\n\n$$\\sum_{k=1}^n')
  assert.equal(pendingMath.stablePrefix, '证明如下：\n\n')
  assert.equal(pendingMath.draft?.kind, 'math')

  const pendingTable = extractStreamingBlockDraft('对比表：\n| 维度 | 说明 |\n| :--- | :--- |\n| 延迟 | 低')
  assert.equal(pendingTable.stablePrefix, '对比表：\n')
  assert.equal(pendingTable.draft?.kind, 'table')

  const streamingTableHtml = renderMarkdownHtml('| 维度 | 说明 |\n| :--- | :--- |\n| 延迟 | 低', { isStreaming: true })
  assert.match(streamingTableHtml, /表格生成中…/)
  assert.doesNotMatch(streamingTableHtml, /<table/)
  assert.match(streamingTableHtml, /border-radius:50%/)

  const streamingTextHtml = renderMarkdownHtml('这里解释 **核心概念', { isStreaming: true })
  assert.match(streamingTextHtml, /<strong[^>]*>核心概念<span[^>]*border-radius:50%[^>]*><\/span><\/strong>/)

  const settledHtml = renderMarkdownHtml('| 维度 | 说明 |\n| :--- | :--- |\n| 延迟 | 低 |', { isStreaming: false })
  assert.match(settledHtml, /<table/)
  assert.doesNotMatch(settledHtml, /rgba\(110,127,80,0\.72\)/)
})

test('renderMarkdownHtml applies hanging-indent list typography and muted reasoning styling', () => {
  const listHtml = renderMarkdownHtml('## 核心结论\n\n1. 第一项重点说明\n2. 第二项详细分析')
  assert.match(listHtml, /<h2 style="font-size:15\.5px;font-weight:600/)
  assert.doesNotMatch(listHtml, /border-left:3px solid #8B9A6E;line-height:1\.38/)
  assert.match(listHtml, /padding-left:1\.55em;list-style-position:outside/)
  assert.match(listHtml, /margin:0 0 11px;line-height:1\.75/)

  const reasoningHtml = renderMarkdownHtml('思考要点：\n\n- 第一步核对范围', {
    isStreaming: true,
    mutedReasoning: true,
  })
  assert.match(reasoningHtml, /font-size:13px;line-height:1\.65;color:#8C887F/)
  assert.doesNotMatch(reasoningHtml, /rgba\(110,127,80,0\.72\)/)
})
