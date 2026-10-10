import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  renderMarkdown,
  renderMathOnly,
  extractMarkdownPreview,
} from '../src/utils/markdown.ts'

test('markdownRenderer renders headings, paragraphs, lists, and tables', () => {
  const md = `
# 知识库主标题

## 二级定理

这是一个重点段落，包含 **加粗** 和 *斜体*。

- 关键概念 1
- 关键概念 2

| 序号 | 变量 | 含义 |
| :--- | :--- | :--- |
| 1 | m | 质量 |
| 2 | c | 光速 |
`
  const html = renderMarkdown(md)
  assert.match(html, /<h1[^>]*>知识库主标题<\/h1>/)
  assert.match(html, /<h2[^>]*>二级定理<\/h2>/)
  assert.match(html, /<strong>加粗<\/strong>/)
  assert.match(html, /<em>斜体<\/em>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<li>关键概念 1<\/li>/)
  assert.match(html, /<table>/)
  assert.match(html, /<th[^>]*>变量<\/th>/)
  assert.match(html, /<td[^>]*>光速<\/td>/)
})

test('markdownRenderer correctly renders inline LaTeX formulas with $ and \\(', () => {
  const md = '爱因斯坦质能方程为 $E = mc^2$，以及勾股定理 \\( a^2 + b^2 = c^2 \\)。'
  const html = renderMarkdown(md)
  
  // 必须生成 KaTeX 节点
  assert.match(html, /class="katex"/)
  assert.match(html, /class="katex-html"/)
  assert.doesNotMatch(html, /\$E = mc\^2\$/)
  assert.doesNotMatch(html, /\\\( a\^2 \+ b\^2 = c\^2 \\\)/)
})

test('markdownRenderer correctly renders block LaTeX formulas with $$ and \\[', () => {
  const md = `
计算高斯积分：
$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

以及级数和：
\\[
\\sum_{k=1}^n k = \\frac{n(n+1)}{2}
\\]
`
  const html = renderMarkdown(md)
  
  assert.match(html, /class="katex-display-wrapper"/)
  assert.match(html, /class="katex-display"/)
  assert.doesNotMatch(html, /\$\$/)
  assert.doesNotMatch(html, /\\\[/)
})

test('markdownRenderer protects currency symbols like $100 and $50.00 from being parsed as math', () => {
  const md = '该参考书籍价格为 $100 元，折后价为 $50.00。'
  const html = renderMarkdown(md)
  
  assert.match(html, /\$100/)
  assert.match(html, /\$50\.00/)
  assert.doesNotMatch(html, /class="katex"/)
})

test('markdownRenderer preserves code blocks containing $ characters without math parsing', () => {
  const md = `
行内代码 \`const $val = 123;\`

\`\`\`javascript
function calculate($x, $y) {
  return $x * $y;
}
\`\`\`
`
  const html = renderMarkdown(md)
  
  assert.match(html, /<code>const \$val = 123;<\/code>/)
  assert.match(html, /\$x/)
  assert.match(html, /\$y/)
})

test('markdownRenderer handles broken or invalid LaTeX gracefully without crashing', () => {
  const md = '错误的公式测试：$\\frac{unclosed$'
  // 不能抛错崩溃
  assert.doesNotThrow(() => {
    const html = renderMarkdown(md)
    assert.ok(typeof html === 'string')
  })
})

test('markdownRenderer handles null, undefined, and empty string safely', () => {
  assert.equal(renderMarkdown(''), '')
  assert.equal(renderMarkdown(null), '')
  assert.equal(renderMarkdown(undefined), '')
  assert.equal(renderMarkdown('   '), '')
})

test('renderMathOnly correctly generates HTML string', () => {
  const htmlInline = renderMathOnly('x^2 + y^2 = r^2', false)
  assert.match(htmlInline, /class="katex"/)

  const htmlBlock = renderMathOnly('\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1', true)
  assert.match(htmlBlock, /class="katex-display"/)
})

test('extractMarkdownPreview cleans markdown and LaTeX syntax to produce neat plain text', () => {
  const md = `# 波动方程
波动方程描述波的传播：
$$
\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\nabla^2 u
$$
其中 $c$ 为波速。详见 [参考链接](https://example.com)。
`
  const preview = extractMarkdownPreview(md, 140)
  assert.doesNotMatch(preview, /^#/)
  assert.doesNotMatch(preview, /\$\$/)
  assert.doesNotMatch(preview, /\[参考链接\]/)
  assert.match(preview, /波动方程/)
  assert.match(preview, /波速/)
  assert.match(preview, /参考链接/)
  
  assert.equal(extractMarkdownPreview(''), '暂无详细内容')
  assert.equal(extractMarkdownPreview(null), '暂无详细内容')
})

test('markdownRenderer correctly renders block LaTeX formulas even directly following text without empty lines', () => {
  const md = '爱因斯坦方程：$$E=mc^2$$，以及牛顿第二定律：\\[F=ma\\]'
  const html = renderMarkdown(md)
  assert.match(html, /class="katex-display-wrapper"/)
  assert.match(html, /class="katex-display"/)
  assert.doesNotMatch(html, /\$\$E=mc\^2\$\$/)
  assert.doesNotMatch(html, /\\\[F=ma\\\]/)
})
