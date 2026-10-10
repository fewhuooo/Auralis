import { marked } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'

/**
 * 块级数学公式扩展 ($$...$$ 和 \[...\])
 */
const blockMathExtension = {
  name: 'blockMath',
  level: 'block' as const,
  start(src: string): number | undefined {
    const idx1 = src.indexOf('$$')
    const idx2 = src.indexOf('\\[')
    if (idx1 === -1 && idx2 === -1) return undefined
    if (idx1 === -1) return idx2
    if (idx2 === -1) return idx1
    return Math.min(idx1, idx2)
  },
  tokenizer(src: string) {
    // 优先匹配 $$...$$
    const matchDoubleDollar = /^\$\$([\s\S]+?)\$\$/.exec(src)
    if (matchDoubleDollar) {
      return {
        type: 'blockMath',
        raw: matchDoubleDollar[0],
        text: matchDoubleDollar[1].trim(),
      }
    }
    // 匹配 \[...\]
    const matchBracket = /^\\\[([\s\S]+?)\\\]/.exec(src)
    if (matchBracket) {
      return {
        type: 'blockMath',
        raw: matchBracket[0],
        text: matchBracket[1].trim(),
      }
    }
    return undefined
  },
  renderer(token: { text: string }): string {
    try {
      const rendered = katex.renderToString(token.text, {
        displayMode: true,
        throwOnError: false,
      })
      return `<div class="katex-display-wrapper">${rendered}</div>\n`
    } catch {
      return `<div class="katex-display-wrapper katex-error-fallback"><code>${escapeHtml(token.text)}</code></div>\n`
    }
  },
}

/**
 * 行内及段落内数学公式扩展 ($...$, \(...\), 以及段落内的 $$...$$ 与 \[...\])
 */
const inlineMathExtension = {
  name: 'inlineMath',
  level: 'inline' as const,
  start(src: string): number | undefined {
    const indices = [
      src.indexOf('$'),
      src.indexOf('\\('),
      src.indexOf('\\['),
    ].filter((i) => i !== -1)
    if (!indices.length) return undefined
    return Math.min(...indices)
  },
  tokenizer(src: string) {
    // 匹配在段落/行内写入的 $$...$$ 展示公式
    const matchDoubleDollar = /^\$\$([\s\S]+?)\$\$/.exec(src)
    if (matchDoubleDollar) {
      return {
        type: 'inlineMath',
        raw: matchDoubleDollar[0],
        text: matchDoubleDollar[1].trim(),
        displayMode: true,
      }
    }

    // 匹配在段落/行内写入的 \[...\] 展示公式
    const matchBracket = /^\\\[([\s\S]+?)\\\]/.exec(src)
    if (matchBracket) {
      return {
        type: 'inlineMath',
        raw: matchBracket[0],
        text: matchBracket[1].trim(),
        displayMode: true,
      }
    }

    // 匹配 \(...\) 行内公式
    const matchParen = /^\\\(([\s\S]+?)\\\)/.exec(src)
    if (matchParen) {
      return {
        type: 'inlineMath',
        raw: matchParen[0],
        text: matchParen[1].trim(),
        displayMode: false,
      }
    }

    // 匹配 $...$ 行内公式
    const matchDollar = /^\$((?:\\\$|[^\$\n\r])+?)\$/.exec(src)
    if (matchDollar) {
      const content = matchDollar[1]
      // 避免误判：首尾不能是空格，且纯数字（货币如 $100、$50.00）不作为公式
      if (content.startsWith(' ') || content.endsWith(' ') || /^\d+([.,]\d+)?$/.test(content.trim())) {
        return undefined
      }
      return {
        type: 'inlineMath',
        raw: matchDollar[0],
        text: content.trim(),
        displayMode: false,
      }
    }

    return undefined
  },
  renderer(token: { text: string; displayMode?: boolean }): string {
    try {
      const rendered = katex.renderToString(token.text, {
        displayMode: !!token.displayMode,
        throwOnError: false,
      })
      if (token.displayMode) {
        return `<div class="katex-display-wrapper">${rendered}</div>`
      }
      return rendered
    } catch {
      if (token.displayMode) {
        return `<div class="katex-display-wrapper katex-error-fallback"><code>${escapeHtml(token.text)}</code></div>`
      }
      return `<code class="katex-error-fallback">${escapeHtml(token.text)}</code>`
    }
  },
}

// 注册 marked 基础配置与数学公式插件
marked.setOptions({
  breaks: true,
  gfm: true,
})
marked.use({
  extensions: [blockMathExtension, inlineMathExtension],
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 安全过滤 HTML（保留 MathML 与 SVG 结构以供 KaTeX 渲染）
 */
function sanitizeHtml(dirtyHtml: string): string {
  if (typeof window !== 'undefined' && typeof DOMPurify?.sanitize === 'function') {
    return DOMPurify.sanitize(dirtyHtml, {
      USE_PROFILES: { mathMl: true, svg: true, html: true },
      ADD_TAGS: [
        'math', 'semantics', 'mrow', 'munder', 'mover', 'munderover',
        'msub', 'msup', 'msubsup', 'mfrac', 'msqrt', 'mroot',
        'mi', 'mo', 'mn', 'mtext', 'mspace', 'annotation',
        'svg', 'path', 'g', 'line', 'rect', 'circle',
      ],
      ADD_ATTR: [
        'xmlns', 'viewBox', 'preserveAspectRatio', 'd', 'style', 'aria-hidden',
        'width', 'height', 'encoding', 'display',
      ],
    })
  }
  return dirtyHtml
}

/**
 * 核心 Markdown + LaTeX 公式渲染函数
 */
export function renderMarkdown(content?: string | null): string {
  if (!content || typeof content !== 'string') return ''
  try {
    const rawHtml = marked.parse(content) as string
    return sanitizeHtml(rawHtml)
  } catch (err) {
    console.error('[MarkdownRenderer] 解析失败，降级为转义文本:', err)
    return `<p>${escapeHtml(content)}</p>`
  }
}

/**
 * 仅渲染 LaTeX 数学公式为 HTML
 */
export function renderMathOnly(latex: string, displayMode = false): string {
  if (!latex) return ''
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
    })
  } catch {
    return escapeHtml(latex)
  }
}

/**
 * 从 Markdown 文本中提取平滑的纯文本预览（去除公式与语法标记）
 */
export function extractMarkdownPreview(content?: string | null, maxLength = 120): string {
  if (!content) return '暂无详细内容'
  const cleaned = content
    // 移除代码块
    .replace(/```[\s\S]*?```/g, ' ')
    // 移除行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 块级公式转纯文本或符号
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    .replace(/\\\[([\s\S]+?)\\\]/g, '$1')
    // 行内公式
    .replace(/\$([^\$\n\r]+?)\$/g, '$1')
    .replace(/\\\(([\s\S]+?)\\\)/g, '$1')
    // 移除图片
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // 链接保留文字
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 移除标题符号
    .replace(/^#{1,6}\s+/gm, '')
    // 移除引用符号
    .replace(/^>\s+/gm, '')
    // 移除强调标记
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    // 多余换行转空格
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return '暂无详细内容'
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength)}...`
}
