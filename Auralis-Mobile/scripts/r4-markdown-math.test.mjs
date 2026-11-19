import assert from 'node:assert/strict'
import test from 'node:test'
import {
  autoCloseStreamingMarkdown,
  extractStreamingBlockDraft,
  plainMarkdownExcerpt,
  renderMarkdownHtml,
} from '../src/utils/markdown.ts'

test('renderMarkdownHtml renders inline math, nested fractions, scripts and Greek symbols without leaking raw tokens', () => {
  const html = renderMarkdownHtml(
    '构造 $\\varphi(x) = f(x) - \\frac{f(b)-f(a)}{b-a}(x-a)$ 与 $x_0, x^{2n}, \\xi \\in (a, b)$',
  )
  assert.match(html, /φ\(x\)/)
  assert.match(html, /ξ ∈ \(a, b\)/)
  assert.match(html, /<span[^>]*>f\(b\)-f\(a\)<\/span><span[^>]*>b-a<\/span>/)
  assert.match(html, /<sub[^>]*>0<\/sub>/)
  assert.match(html, /<sup[^>]*>2n<\/sup>/)
  assert.doesNotMatch(html, /\\varphi|\\frac|\\xi|@@AURALIS/)
})

test('renderMarkdownHtml renders overlapping TeX commands, braces, roots, text and display blocks cleanly', () => {
  const html = renderMarkdownHtml(
    '区间 $\\left( x \\right)$ 与集合 $\\{a, b\\}$ 及 $x \\leq y$，以及 $\\sqrt{x^2 + 1} + \\text{<safe>}$\n\n$$E = mc^2$$',
  )
  assert.match(html, /\( x \)/)
  assert.doesNotMatch(html, /≤ft/)
  assert.match(html, /\{a, b\}/)
  assert.match(html, /≤ y/)
  assert.match(html, /√<span[^>]*>x<sup[^>]*>2<\/sup> \+ 1<\/span>/)
  assert.match(html, /&lt;safe&gt;/)
  assert.match(html, /<div[^>]*text-align:center[^>]*>E = mc<sup[^>]*>2<\/sup><\/div>/)
})

test('renderMarkdownHtml isolates literal placeholder tokens and code blocks cleanly without inline pill leakage', () => {
  const html = renderMarkdownHtml(
    '字面量 `@@AURALISMATH0@@` 与\n```ts\nconst x = 1\n```\n以及 $y$',
  )
  assert.match(html, /<code[^>]*>@@AURALISMATH0@@<\/code>/)
  assert.match(html, /<pre style="[^"]*"><code style="font-family:inherit;background:transparent;[^"]*">const x = 1\s*<\/code><\/pre>/)
  assert.match(html, />y<\/span>/)
})

test('renderMarkdownHtml keeps dollar variables inside code spans and fenced code blocks untouched', () => {
  const html = renderMarkdownHtml('环境变量 `$HOME` 与\n```\n$PATH\n```\n不转数学')
  assert.match(html, /<code[^>]*>\$HOME<\/code>/)
  assert.match(html, /<code[^>]*>\$PATH\s*<\/code>/)
  assert.doesNotMatch(html, /font-style:italic/)
})

test('renderMarkdownHtml escapes raw HTML and XSS payloads in prose, math, links and image schemes', () => {
  const html = renderMarkdownHtml(
    '<script>alert(1)</script>\n\n$<img src=x onerror=alert(1)>$ 与 [<img src=x onerror=alert(1)>](https://example.com) [**bold**](https://example.com) ![bad](javascript:alert(1)) ![ok](https://example.com/a.png)',
  )
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /<strong[^>]*>bold<\/strong>/)
  assert.doesNotMatch(html, /<script|<img\s+src=x|src="javascript:/i)
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
  assert.match(html, /a<sup[^>]*>2<\/sup> \+ b<sup[^>]*>2<\/sup> = c<sup[^>]*>2<\/sup>/)
  assert.match(html, /<div[^>]*text-align:center[^>]*>E = mc<sup[^>]*>2<\/sup><\/div>/)

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
