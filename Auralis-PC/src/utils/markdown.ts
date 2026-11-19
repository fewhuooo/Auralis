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
      return `<div class="katex-display-wrapper katex-streaming-pill"><span class="math-pill-icon">∑</span><span class="math-pill-text">正在排版公式…</span></div>\n`
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
        return `<div class="katex-display-wrapper katex-streaming-pill"><span class="math-pill-icon">∑</span><span class="math-pill-text">正在排版公式…</span></div>`
      }
      return `<span class="katex-streaming-inline-pill">∑ 公式输入中…</span>`
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
 * 未闭合 Markdown 与半成品语法的乐观补全 (Optimistic Syntax Auto-Close)
 * 解决流式输出中粗体、代码块、公式、链接未闭合时的源码暴露与行内抖动
 */
export function autoCloseMarkdown(text: string): string {
  if (!text) return ''
  let result = text

  // 1. 容器与特殊前缀暂扣缓冲 (Tag & Fence Prefix Hold-back)
  // 暂扣未闭合标签（如 <visual-、<quiz-、<!--）、自定义容器前缀（如 :::flow）
  // 以及尚未换行闭合的代码块前缀（如 ```typescript），杜绝裸露的中间源码闪现
  result = result.replace(/(?:<[a-zA-Z0-9_\-:]*|:::[a-zA-Z0-9_\-:]*|```[a-zA-Z0-9_\-]*)$/, '')

  // 2. 代码块 ``` 补全
  const codeBlockMatches = result.match(/```/g)
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    result += '\n```'
    return result // 代码块内部保持原样，不继续补全行内修饰符
  }

  // 排除已闭合的代码块，避免代码块内部的字符（例如 Python 乘方 2 ** 8、注释公式等）污染外部行内语法判定
  const textWithoutBlocks = result.replace(/```[\s\S]*?```/g, '')

  // 3. 行内代码 ` 补全（排除已经成对的代码块）
  const codeSpanMatches = textWithoutBlocks.match(/`/g)
  const isInlineCodeUnclosed = codeSpanMatches && codeSpanMatches.length % 2 !== 0
  if (isInlineCodeUnclosed) {
    result += '`'
  }

  // 排除已闭合的行内代码（包含刚补全的未闭合代码段），杜绝行内代码内部（如 `x = 2 ** 8`、`echo $$`）污染后续粗体/公式判定
  const textWithClosedSpans = isInlineCodeUnclosed ? textWithoutBlocks + '`' : textWithoutBlocks
  const textWithoutCode = textWithClosedSpans.replace(/`[^`\n]*`/g, '')

  // 4. 数学公式块 $$ 补全
  const doubleDollarMatches = textWithoutCode.match(/\$\$/g)
  if (doubleDollarMatches && doubleDollarMatches.length % 2 !== 0) {
    result += '$$'
  }

  // 5. LaTeX \(...\) 与 \[...\] 流式补全
  const openParenMath = (textWithoutCode.match(/\\\(/g) || []).length
  const closeParenMath = (textWithoutCode.match(/\\\)/g) || []).length
  if (openParenMath > closeParenMath) {
    result += '\\)'
  }

  const openBracketMath = (textWithoutCode.match(/\\\[/g) || []).length
  const closeBracketMath = (textWithoutCode.match(/\\\]/g) || []).length
  if (openBracketMath > closeBracketMath) {
    result += '\\]'
  }

  // 6. 粗体 ** 补全
  const boldMatches = textWithoutCode.match(/\*\*/g)
  if (boldMatches && boldMatches.length % 2 !== 0) {
    result += '**'
  }

  // 7. 删除线 ~~ 补全
  const strikeMatches = textWithoutCode.match(/~~/g)
  if (strikeMatches && strikeMatches.length % 2 !== 0) {
    result += '~~'
  }

  // 8. 未闭合链接 [概念名称](https://... 乐观补全右括号，避免行内语法裸露
  if (/\[([^\]\n]+)\]\(([^)\n]*)$/.test(result)) {
    result += ')'
  }

  return result
}

/**
 * 对处于活跃流式状态的内容，给末尾 1~4 个字符包裹 <span class="token-fade">
 * 配合 CSS 动画实现水墨淡入过渡，消除纯黑边缘的锐利顿挫感
 */
export function wrapTrailingToken(html: string): string {
  const match = /([^<>\s]{1,4})(\s*(?:<\/[a-zA-Z0-9]+>\s*)*\s*)$/.exec(html)
  if (!match) return html
  const startIdx = match.index
  const chars = match[1]
  const rest = match[2]
  return html.slice(0, startIdx) + '<span class="token-fade">' + chars + '</span>' + rest
}

/**
 * 安全过滤 HTML（保留 MathML 与 SVG 结构以供 KaTeX 渲染）
 */
function sanitizeHtml(dirtyHtml: string): string {
  if (typeof window !== 'undefined' && typeof DOMPurify?.sanitize === 'function') {
    return DOMPurify.sanitize(dirtyHtml, {
      USE_PROFILES: { mathMl: true, svg: true, html: true },
      ADD_TAGS: [
        'span',
        'math', 'semantics', 'mrow', 'munder', 'mover', 'munderover',
        'msub', 'msup', 'msubsup', 'mfrac', 'msqrt', 'mroot',
        'mi', 'mo', 'mn', 'mtext', 'mspace', 'annotation',
        'svg', 'path', 'g', 'line', 'rect', 'circle',
      ],
      ADD_ATTR: [
        'class',
        'xmlns', 'viewBox', 'preserveAspectRatio', 'd', 'style', 'aria-hidden',
        'width', 'height', 'encoding', 'display',
      ],
    })
  }
  return dirtyHtml
}

export interface StreamingBlockDraft {
  kind: 'math' | 'table'
  raw: string
}

function maskCodeRegionsPreservingOffsets(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length))
}

/**
 * 块级复杂结构延迟挂载判定：
 * 当跨行表格或块级 LaTeX 公式（$$...$$ / \[...\]）在流式过程中尚未闭合时，
 * 将其从正式 Markdown 解析前缀中拆出，固定展示于等高浅灰草稿容器中，闭合瞬间整块替换。
 */
export function extractStreamingBlockDraft(text: string): {
  stablePrefix: string
  draft: StreamingBlockDraft | null
} {
  if (!text) return { stablePrefix: '', draft: null }

  const codeFenceMatches = text.match(/```/g)
  if (codeFenceMatches && codeFenceMatches.length % 2 !== 0) {
    return { stablePrefix: text, draft: null }
  }

  const masked = maskCodeRegionsPreservingOffsets(text)

  const doubleDollarMatches = masked.match(/\$\$/g)
  if (doubleDollarMatches && doubleDollarMatches.length % 2 !== 0) {
    const idx = masked.lastIndexOf('$$')
    if (idx >= 0) {
      return {
        stablePrefix: text.slice(0, idx),
        draft: { kind: 'math', raw: text.slice(idx) },
      }
    }
  }

  const openBracketCount = (masked.match(/\\\[/g) || []).length
  const closeBracketCount = (masked.match(/\\\]/g) || []).length
  if (openBracketCount > closeBracketCount) {
    const idx = masked.lastIndexOf('\\[')
    if (idx >= 0) {
      return {
        stablePrefix: text.slice(0, idx),
        draft: { kind: 'math', raw: text.slice(idx) },
      }
    }
  }

  if (!/\r?\n[ \t]*\r?\n[ \t]*$/.test(masked)) {
    let paraStart = 0
    const paraBreakRegex = /\r?\n[ \t]*\r?\n/g
    let breakMatch = paraBreakRegex.exec(masked)
    while (breakMatch) {
      paraStart = breakMatch.index + breakMatch[0].length
      breakMatch = paraBreakRegex.exec(masked)
    }

    const lines: Array<{ start: number; trimmed: string }> = []
    let cursor = paraStart
    const segment = masked.slice(paraStart)
    for (const rawLine of segment.split('\n')) {
      lines.push({ start: cursor, trimmed: rawLine.trim() })
      cursor += rawLine.length + 1
    }

    while (lines.length > 0 && lines[lines.length - 1].trimmed.length === 0) {
      lines.pop()
    }

    if (lines.length > 0 && lines[lines.length - 1].trimmed.startsWith('|')) {
      let tableStartIdx = lines.length - 1
      while (tableStartIdx > 0 && lines[tableStartIdx - 1].trimmed.startsWith('|')) {
        tableStartIdx -= 1
      }
      const cutAt = lines[tableStartIdx].start
      return {
        stablePrefix: text.slice(0, cutAt),
        draft: { kind: 'table', raw: text.slice(cutAt) },
      }
    }
  }

  return { stablePrefix: text, draft: null }
}

const STREAM_CURSOR_DOT_HTML = '<span class="stream-cursor-dot" aria-hidden="true"></span>'

/**
 * 在流式 HTML 最后一个行内/文本闭合标签前注入 8px 橄榄绿半透明跟随圆点，
 * 避免游离于块标签外造成换行跳动，也不破坏 table / KaTeX 结构。
 */
export function appendStreamCursorDot(html: string): string {
  if (!html) return STREAM_CURSOR_DOT_HTML
  const trailMatch = /((?:\s*<\/[a-zA-Z0-9]+>)+\s*)$/.exec(html)
  if (!trailMatch) {
    return `${html.trimEnd()}${STREAM_CURSOR_DOT_HTML}`
  }

  const trail = trailMatch[1]
  if (/<\/(?:table|thead|tbody|tfoot|tr|td|th|div)\s*>/i.test(trail)) {
    return `${html.trimEnd()}${STREAM_CURSOR_DOT_HTML}`
  }

  const closerTokenRegex = /\s*<\/([a-zA-Z0-9]+)>/g
  let tokenMatch = closerTokenRegex.exec(trail)
  while (tokenMatch) {
    const tag = tokenMatch[1].toLowerCase()
    if (tag !== 'span') {
      const insertPos = trailMatch.index + tokenMatch.index
      return `${html.slice(0, insertPos)}${STREAM_CURSOR_DOT_HTML}${html.slice(insertPos)}`
    }
    tokenMatch = closerTokenRegex.exec(trail)
  }

  return `${html.trimEnd()}${STREAM_CURSOR_DOT_HTML}`
}

function buildStreamingDraftHtml(draft: StreamingBlockDraft): string {
  const label = draft.kind === 'math' ? '公式排版中…' : '表格生成中…'
  return `<div class="streaming-block-draft streaming-block-draft--${draft.kind}"><div class="streaming-block-draft__label">${label}</div><pre class="streaming-block-draft__raw">${escapeHtml(draft.raw)}${STREAM_CURSOR_DOT_HTML}</pre></div>`
}

/**
 * 核心 Markdown + LaTeX 公式渲染函数
 * @param content 要渲染的 markdown 内容
 * @param isStreaming 是否处于流式生成阶段（开启未闭合语法乐观补全、块级防抖与末尾圆点光标）
 */
export function renderMarkdown(content?: string | null, isStreaming = false): string {
  if (!content || typeof content !== 'string') return ''
  try {
    if (!isStreaming) {
      return sanitizeHtml(marked.parse(content) as string)
    }
    const { stablePrefix, draft } = extractStreamingBlockDraft(content)
    let rawHtml = ''
    if (stablePrefix) {
      const prepared = autoCloseMarkdown(stablePrefix)
      rawHtml = marked.parse(prepared) as string
      if (!draft) {
        rawHtml = appendStreamCursorDot(wrapTrailingToken(rawHtml))
      }
    }
    if (draft) {
      rawHtml += buildStreamingDraftHtml(draft)
    }
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
