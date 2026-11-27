import DOMPurify from 'dompurify'
import katex from 'katex'
import { Marked, Renderer } from 'marked'

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isSafeImageHref(href?: string | null): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(trimmed)) return trimmed
  return null
}

const renderer = new Renderer()
renderer.html = ({ text }) => escapeHtml(text)
renderer.link = function (this: Renderer, { tokens, text }) {
  const label = tokens && tokens.length > 0 ? this.parser.parseInline(tokens) : escapeHtml(text)
  return `<span style="color:#556B3D;text-decoration:underline;text-underline-offset:3px;">${label}</span>`
}
renderer.image = ({ href, text }) => {
  const safeSrc = isSafeImageHref(href)
  if (!safeSrc) return escapeHtml(text || '图片')
  return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(text || '')}" style="max-width:100%;height:auto;border-radius:10px;margin:8px 0;display:block;" />`
}
renderer.code = ({ text }) => (
  `<pre style="margin:12px 0;padding:12px 14px;background-color:#F4EFE6;border:1px solid rgba(28,28,26,0.07);border-radius:10px;overflow-x:auto;font-family:var(--font-family-mono, monospace);font-size:12.5px;line-height:1.6;color:#1C1C1A;"><code style="font-family:inherit;background:transparent;padding:0;color:inherit;font-size:inherit;">${escapeHtml(text)}</code></pre>`
)
renderer.codespan = ({ text }) => (
  `<code style="font-family:var(--font-family-mono, monospace);background-color:rgba(139,154,110,0.12);padding:1px 5px;border-radius:5px;font-size:12.5px;color:#556B3D;">${escapeHtml(text)}</code>`
)

const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer,
})

const TEX_SYMBOL_MAP = new Map<string, string>([
  ['\\Leftrightarrow', '⇔'],
  ['\\Rightarrow', '⇒'],
  ['\\Leftarrow', '⇐'],
  ['\\leftrightarrow', '↔'],
  ['\\rightarrow', '→'],
  ['\\leftarrow', '←'],
  ['\\subseteq', '⊆'],
  ['\\supseteq', '⊇'],
  ['\\subseteqq', '⊆'],
  ['\\varepsilon', 'ε'],
  ['\\vartheta', 'ϑ'],
  ['\\partial', '∂'],
  ['\\forall', '∀'],
  ['\\exists', '∃'],
  ['\\lambda', 'λ'],
  ['\\Lambda', 'Λ'],
  ['\\varphi', 'φ'],
  ['\\propto', '∝'],
  ['\\approx', '≈'],
  ['\\equiv', '≡'],
  ['\\times', '×'],
  ['\\notin', '∉'],
  ['\\subset', '⊂'],
  ['\\supset', '⊃'],
  ['\\infty', '∞'],
  ['\\nabla', '∇'],
  ['\\alpha', 'α'],
  ['\\beta', 'β'],
  ['\\gamma', 'γ'],
  ['\\Gamma', 'Γ'],
  ['\\delta', 'δ'],
  ['\\Delta', 'Δ'],
  ['\\epsilon', 'ϵ'],
  ['\\theta', 'θ'],
  ['\\Theta', 'Θ'],
  ['\\sigma', 'σ'],
  ['\\Sigma', 'Σ'],
  ['\\omega', 'ω'],
  ['\\Omega', 'Ω'],
  ['\\kappa', 'κ'],
  ['\\zeta', 'ζ'],
  ['\\iota', 'ι'],
  ['\\prod', '∏'],
  ['\\sum', '∑'],
  ['\\int', '∫'],
  ['\\leq', '≤'],
  ['\\geq', '≥'],
  ['\\neq', '≠'],
  ['\\phi', 'ϕ'],
  ['\\Phi', 'Φ'],
  ['\\psi', 'ψ'],
  ['\\Psi', 'Ψ'],
  ['\\rho', 'ρ'],
  ['\\tau', 'τ'],
  ['\\eta', 'η'],
  ['\\chi', 'χ'],
  ['\\cup', '∪'],
  ['\\cap', '∩'],
  ['\\div', '÷'],
  ['\\to', '→'],
  ['\\in', '∈'],
  ['\\le', '≤'],
  ['\\ge', '≥'],
  ['\\ne', '≠'],
  ['\\pm', '±'],
  ['\\mp', '∓'],
  ['\\xi', 'ξ'],
  ['\\Xi', 'Ξ'],
  ['\\pi', 'π'],
  ['\\Pi', 'Π'],
  ['\\mu', 'μ'],
  ['\\nu', 'ν'],
  ['\\ldots', '…'],
  ['\\cdots', '⋯'],
  ['\\cdot', '·'],
  ['\\quad', ' '],
  ['\\qquad', '  '],
  ['\\,', ' '],
  ['\\;', ' '],
  ['\\left', ''],
  ['\\right', ''],
  ['\\{', '{'],
  ['\\}', '}'],
])

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  'n': 'ₙ',
  'i': 'ᵢ',
  'j': 'ⱼ',
  'k': 'ₖ',
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  'n': 'ⁿ',
  'i': 'ⁱ',
}

function readBraceGroup(input: string, braceStart: number): { content: string; nextIndex: number } | null {
  if (input[braceStart] !== '{') return null
  let depth = 0
  for (let i = braceStart; i < input.length; i++) {
    if (input[i] === '\\' && i + 1 < input.length) {
      i++
      continue
    }
    if (input[i] === '{') depth++
    else if (input[i] === '}') {
      depth--
      if (depth === 0) {
        return { content: input.slice(braceStart + 1, i), nextIndex: i + 1 }
      }
    }
  }
  return null
}

function skipSpaces(input: string, index: number): number {
  let cursor = index
  while (cursor < input.length && input[cursor] === ' ') cursor++
  return cursor
}

function lookupTexSymbol(cmd: string): string | undefined {
  return TEX_SYMBOL_MAP.get(cmd)
}

function readUnbracedToken(input: string, start: number): { value: string; nextIndex: number } {
  const first = input[start]
  if (first === '\\') {
    const match = input.slice(start).match(/^\\(?:[a-zA-Z]+|[,;{}])/)
    if (match) {
      const resolved = lookupTexSymbol(match[0])
      return { value: resolved ?? match[0], nextIndex: start + match[0].length }
    }
  }
  return { value: first, nextIndex: start + 1 }
}

function renderMathHtml(tex: string, displayMode: boolean): string {
  const normalized = tex.trim()
  if (!normalized) return ''
  try {
    const rendered = katex.renderToString(normalized, {
      displayMode,
      throwOnError: false,
    })
    return displayMode ? `<div class="katex-display-wrapper">${rendered}</div>` : rendered
  } catch {
    return escapeHtml(tex)
  }
}

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

function mapScriptPlain(text: string, table: Record<string, string>, fallbackPrefix: string): string {
  const mapped = Array.from(text).map(ch => table[ch]).join('')
  return mapped.length === text.length ? mapped : `${fallbackPrefix}${text}`
}

function formatTexPlain(rawTex: string): string {
  let out = ''
  let i = 0
  while (i < rawTex.length) {
    if (rawTex.startsWith('\\frac', i) && !/[a-zA-Z]/.test(rawTex[i + 5] || '')) {
      const firstStart = skipSpaces(rawTex, i + 5)
      const numGroup = readBraceGroup(rawTex, firstStart)
      if (numGroup) {
        const secondStart = skipSpaces(rawTex, numGroup.nextIndex)
        const denGroup = readBraceGroup(rawTex, secondStart)
        if (denGroup) {
          out += `(${formatTexPlain(numGroup.content.trim())})/(${formatTexPlain(denGroup.content.trim())})`
          i = denGroup.nextIndex
          continue
        }
      }
    }
    if (rawTex.startsWith('\\sqrt', i) && !/[a-zA-Z]/.test(rawTex[i + 5] || '')) {
      const argStart = skipSpaces(rawTex, i + 5)
      const radGroup = readBraceGroup(rawTex, argStart)
      if (radGroup) {
        out += `√(${formatTexPlain(radGroup.content.trim())})`
        i = radGroup.nextIndex
        continue
      }
    }
    if (rawTex.startsWith('\\text', i) && !/[a-zA-Z]/.test(rawTex[i + 5] || '')) {
      const argStart = skipSpaces(rawTex, i + 5)
      const txtGroup = readBraceGroup(rawTex, argStart)
      if (txtGroup) {
        out += txtGroup.content
        i = txtGroup.nextIndex
        continue
      }
    }
    if (rawTex[i] === '_' || rawTex[i] === '^') {
      const isSup = rawTex[i] === '^'
      const table = isSup ? SUPERSCRIPT_DIGITS : SUBSCRIPT_DIGITS
      const next = skipSpaces(rawTex, i + 1)
      const grp = readBraceGroup(rawTex, next)
      if (grp) {
        out += mapScriptPlain(formatTexPlain(grp.content.trim()), table, isSup ? '^' : '_')
        i = grp.nextIndex
        continue
      }
      if (next < rawTex.length) {
        const token = readUnbracedToken(rawTex, next)
        out += mapScriptPlain(token.value, table, isSup ? '^' : '_')
        i = token.nextIndex
        continue
      }
    }
    if (rawTex[i] === '\\') {
      const match = rawTex.slice(i).match(/^\\(?:[a-zA-Z]+|[,;{}])/)
      if (match) {
        const replaced = lookupTexSymbol(match[0])
        if (replaced !== undefined) {
          out += replaced
          i += match[0].length
          continue
        }
      }
    }
    out += rawTex[i]
    i++
  }
  return out.replace(/\s+/g, ' ').trim()
}

function pickSentinelPrefix(input: string, kind: string): string {
  let prefix = `@@AURALIS${kind}`
  while (input.includes(prefix)) prefix += 'X'
  return prefix
}

function applyZenRichTextStyles(html: string, mutedReasoning = false): string {
  if (mutedReasoning) {
    return html
      .replaceAll('<h1', '<h1 style="font-size:13.5px;font-weight:600;color:#8C887F;margin:8px 0 4px;line-height:1.45;"')
      .replaceAll('<h2', '<h2 style="font-size:13px;font-weight:600;color:#8C887F;margin:7px 0 4px;line-height:1.45;"')
      .replaceAll('<h3', '<h3 style="font-size:13px;font-weight:600;color:#8C887F;margin:6px 0 3px;line-height:1.45;"')
      .replaceAll('<h4', '<h4 style="font-size:13px;font-weight:600;color:#8C887F;margin:5px 0 3px;line-height:1.45;"')
      .replaceAll('<p>', '<p style="margin:0 0 6px;line-height:1.65;color:#8C887F;">')
      .replaceAll('<ul>', '<ul style="margin:4px 0 6px;padding-left:1.45em;list-style-position:outside;color:#8C887F;">')
      .replaceAll('<ol>', '<ol style="margin:4px 0 6px;padding-left:1.45em;list-style-position:outside;color:#8C887F;">')
      .replaceAll('<li>', '<li style="margin:0 0 4px;line-height:1.62;color:#8C887F;overflow-wrap:anywhere;">')
      .replaceAll('<blockquote>', '<blockquote style="margin:6px 0;padding:6px 10px;border-left:2px solid rgba(140,136,127,0.4);color:#8C887F;">')
      .replaceAll('<strong>', '<strong style="font-weight:600;color:#7B776F;">')
      .replaceAll('<hr>', '<hr style="border:none;border-top:1px solid rgba(140,136,127,0.18);margin:8px 0;" />')
      .replace(/<table(?=[\s>])/g, '<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;color:#8C887F;"')
      .replace(/<th(?=[\s>])/g, '<th style="border:1px solid rgba(140,136,127,0.18);padding:5px 8px;background-color:rgba(139,154,110,0.08);text-align:left;font-weight:600;color:#8C887F;"')
      .replace(/<td(?=[\s>])/g, '<td style="border:1px solid rgba(140,136,127,0.14);padding:5px 8px;color:#8C887F;"')
  }
  return html
    .replaceAll('<h1', '<h1 style="font-size:17px;font-weight:700;color:#1C1C1A;letter-spacing:-0.015em;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(28,28,26,0.08);line-height:1.35;"')
    .replaceAll('<h2', '<h2 style="font-size:15.5px;font-weight:600;color:#1C1C1A;letter-spacing:-0.01em;margin:16px 0 8px;line-height:1.4;"')
    .replaceAll('<h3', '<h3 style="font-size:14px;font-weight:600;color:#2C2C28;margin:13px 0 6px;line-height:1.45;"')
    .replaceAll('<h4', '<h4 style="font-size:13.5px;font-weight:600;color:#474741;margin:10px 0 4px;line-height:1.42;"')
    .replaceAll('<p>', '<p style="margin:0 0 10px;line-height:1.72;color:#2C2C28;">')
    .replaceAll('<ul>', '<ul style="margin:10px 0 12px;padding-left:1.55em;list-style-position:outside;color:#2C2C28;">')
    .replaceAll('<ol>', '<ol style="margin:10px 0 12px;padding-left:1.55em;list-style-position:outside;color:#2C2C28;">')
    .replaceAll('<li>', '<li style="margin:0 0 11px;line-height:1.75;overflow-wrap:anywhere;">')
    .replaceAll('<blockquote>', '<blockquote style="margin:12px 0;padding:9px 14px;border-left:3px solid #8B9A6E;background-color:#F7F2EB;color:#5F5E5C;border-radius:0 10px 10px 0;">')
    .replaceAll('<strong>', '<strong style="font-weight:700;color:#1C1C1A;">')
    .replaceAll('<hr>', '<hr style="border:none;border-top:1px solid rgba(28,28,26,0.08);margin:14px 0;" />')
    .replace(/<table(?=[\s>])/g, '<table style="width:100%;border-collapse:collapse;font-size:13px;"')
    .replace(/<th(?=[\s>])/g, '<th style="border:none;border-bottom:1px solid rgba(28,28,26,0.09);padding:8px 11px;background-color:#F2ECE2;text-align:left;font-weight:600;color:#262522;white-space:nowrap;"')
    .replace(/<td(?=[\s>])/g, '<td style="border:none;border-bottom:1px solid rgba(28,28,26,0.06);padding:8px 11px;color:#2C2C28;vertical-align:top;line-height:1.55;"')
    .replace(/<table[\s\S]*?<\/table>/g, (tableHtml) => `<div style="overflow-x:auto;margin:12px 0;border:1px solid rgba(28,28,26,0.08);border-radius:12px;background-color:#FAF7F2;">${tableHtml}</div>`)
}

export interface StreamingBlockDraft {
  kind: 'math' | 'table'
  raw: string
}

export interface RenderMarkdownOptions {
  isStreaming?: boolean
  mutedReasoning?: boolean
}

const STREAM_CURSOR_DOT_HTML = '<span style="display:inline-block;width:8px;height:8px;margin-left:5px;border-radius:50%;vertical-align:middle;background-color:rgba(110,127,80,0.72);"></span>'

function maskCodeRegionsPreservingOffsets(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length))
}

/** Extracts unclosed block formulas or multiline tables during streaming to prevent vertical jitter. */
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
      return { stablePrefix: text.slice(0, idx), draft: { kind: 'math', raw: text.slice(idx) } }
    }
  }

  const openBracketCount = (masked.match(/\\\[/g) || []).length
  const closeBracketCount = (masked.match(/\\\]/g) || []).length
  if (openBracketCount > closeBracketCount) {
    const idx = masked.lastIndexOf('\\[')
    if (idx >= 0) {
      return { stablePrefix: text.slice(0, idx), draft: { kind: 'math', raw: text.slice(idx) } }
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
      return { stablePrefix: text.slice(0, cutAt), draft: { kind: 'table', raw: text.slice(cutAt) } }
    }
  }

  return { stablePrefix: text, draft: null }
}

/** Auto-closes incomplete inline Markdown and code markers to stabilize live streaming layout. */
export function autoCloseStreamingMarkdown(text: string): string {
  if (!text) return ''
  let result = text.replace(/(?:<[a-zA-Z0-9_\-:]*|:::[a-zA-Z0-9_\-:]*|```[a-zA-Z0-9_\-]*)$/, '')

  const codeBlockMatches = result.match(/```/g)
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    return `${result}\n\`\`\``
  }

  const textWithoutBlocks = result.replace(/```[\s\S]*?```/g, '')
  const codeSpanMatches = textWithoutBlocks.match(/`/g)
  const isInlineCodeUnclosed = Boolean(codeSpanMatches && codeSpanMatches.length % 2 !== 0)
  if (isInlineCodeUnclosed) {
    result += '`'
  }

  const textWithClosedSpans = isInlineCodeUnclosed ? `${textWithoutBlocks}\`` : textWithoutBlocks
  const textWithoutCode = textWithClosedSpans.replace(/`[^`\n]*`/g, '')

  const doubleDollarMatches = textWithoutCode.match(/\$\$/g)
  if (doubleDollarMatches && doubleDollarMatches.length % 2 !== 0) {
    result += '$$'
  }

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

  const boldMatches = textWithoutCode.match(/\*\*/g)
  if (boldMatches && boldMatches.length % 2 !== 0) {
    result += '**'
  }

  const strikeMatches = textWithoutCode.match(/~~/g)
  if (strikeMatches && strikeMatches.length % 2 !== 0) {
    result += '~~'
  }

  if (/\[([^\]\n]+)\]\(([^)\n]*)$/.test(result)) {
    result += ')'
  }

  return result
}

function appendInlineCursorDot(html: string): string {
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

function parseStyledMarkdownSegment(markdownSegment: string, mutedReasoning = false): string {
  if (!markdownSegment) return ''
  const codePrefix = pickSentinelPrefix(markdownSegment, 'CODE')
  const mathPrefix = pickSentinelPrefix(markdownSegment, 'MATH')
  const codeTokens: string[] = []
  const mathTokens: string[] = []

  const withoutCode = markdownSegment
    .replace(/```[\s\S]*?```/g, (block) => {
      const token = `${codePrefix}${codeTokens.length}@@`
      codeTokens.push(block)
      return token
    })
    .replace(/`[^`\n]+`/g, (span) => {
      const token = `${codePrefix}${codeTokens.length}@@`
      codeTokens.push(span)
      return token
    })

  const withoutMath = withoutCode
    .replace(/\$\$([\s\S]+?)\$\$/g, (_all, inner: string) => {
      const token = `${mathPrefix}${mathTokens.length}@@`
      mathTokens.push(renderMathHtml(inner, true))
      return token
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (_all, inner: string) => {
      const token = `${mathPrefix}${mathTokens.length}@@`
      mathTokens.push(renderMathHtml(inner, true))
      return token
    })
    .replace(/\\\(([\s\S]+?)\\\)/g, (_all, inner: string) => {
      const token = `${mathPrefix}${mathTokens.length}@@`
      mathTokens.push(renderMathHtml(inner, false))
      return token
    })
    .replace(/\$([^\s$\n](?:[^$\n]*[^\s$\n])?)\$/g, (all, inner: string) => {
      if (/^\d+(?:[.,]\d+)?$/.test(inner.trim())) return all
      const token = `${mathPrefix}${mathTokens.length}@@`
      mathTokens.push(renderMathHtml(inner, false))
      return token
    })

  let restoredForMarkdown = withoutMath
  for (let idx = 0; idx < codeTokens.length; idx++) {
    restoredForMarkdown = restoredForMarkdown.replace(`${codePrefix}${idx}@@`, () => codeTokens[idx])
  }

  const parsed = markedInstance.parse(restoredForMarkdown, { async: false }) as string
  let styled = applyZenRichTextStyles(parsed, mutedReasoning)
  for (let idx = 0; idx < mathTokens.length; idx++) {
    styled = styled.replace(`${mathPrefix}${idx}@@`, () => mathTokens[idx])
  }
  return styled
}

function buildStreamingDraftHtml(draft: StreamingBlockDraft): string {
  const label = draft.kind === 'math' ? '公式排版中…' : '表格生成中…'
  return `<div style="min-height:72px;margin:10px 0;padding:10px 12px;border-radius:10px;background-color:#F4EFE6;border:1px solid #EAE6DD;box-sizing:border-box;"><div style="font-size:11px;font-weight:600;color:#556B3D;margin-bottom:5px;">${label}</div><pre style="margin:0;padding:0;font-family:var(--font-family-mono, monospace);font-size:12px;line-height:1.55;color:#7A7A75;white-space:pre-wrap;word-break:break-word;">${escapeHtml(draft.raw)}${STREAM_CURSOR_DOT_HTML}</pre></div>`
}

/** Renders Markdown + LaTeX into sanitized KaTeX/DOMPurify HTML, with optional streaming stabilization and muted reasoning style. */
export function renderMarkdownHtml(markdownText: string, options?: RenderMarkdownOptions): string {
  const mutedReasoning = Boolean(options?.mutedReasoning)
  const isStreaming = Boolean(options?.isStreaming) && !mutedReasoning
  const wrapperStyle = mutedReasoning
    ? 'font-size:13px;line-height:1.65;color:#8C887F;word-break:break-word;'
    : 'font-size:14.5px;line-height:1.72;color:#2C2C28;word-break:break-word;'

  if (!markdownText) {
    return isStreaming
      ? sanitizeHtml(`<div style="${wrapperStyle}">${STREAM_CURSOR_DOT_HTML}</div>`)
      : ''
  }

  if (!isStreaming) {
    const styled = parseStyledMarkdownSegment(markdownText, mutedReasoning)
    return sanitizeHtml(`<div style="${wrapperStyle}">${styled}</div>`)
  }

  const { stablePrefix, draft } = extractStreamingBlockDraft(markdownText)
  let body = ''
  if (stablePrefix) {
    const prepared = autoCloseStreamingMarkdown(stablePrefix)
    body = parseStyledMarkdownSegment(prepared, false)
    if (!draft) {
      body = appendInlineCursorDot(body)
    }
  }
  if (draft) {
    body += buildStreamingDraftHtml(draft)
  }
  if (!body) {
    body = STREAM_CURSOR_DOT_HTML
  }
  return sanitizeHtml(`<div style="${wrapperStyle}">${body}</div>`)
}

export function plainMarkdownExcerpt(raw: string): string {
  if (!raw) return ''
  const excerptPrefix = pickSentinelPrefix(raw, 'EXC')
  const mathPlaceholders: string[] = []
  const withMathStashed = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_all, inner: string) => {
      const token = `${excerptPrefix}${mathPlaceholders.length}@@`
      mathPlaceholders.push(formatTexPlain(inner))
      return token
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (_all, inner: string) => {
      const token = `${excerptPrefix}${mathPlaceholders.length}@@`
      mathPlaceholders.push(formatTexPlain(inner))
      return token
    })
    .replace(/\\\(([\s\S]+?)\\\)/g, (_all, inner: string) => {
      const token = `${excerptPrefix}${mathPlaceholders.length}@@`
      mathPlaceholders.push(formatTexPlain(inner))
      return token
    })
    .replace(/\$([^\s$\n](?:[^$\n]*[^\s$\n])?)\$/g, (_all, inner: string) => {
      const token = `${excerptPrefix}${mathPlaceholders.length}@@`
      mathPlaceholders.push(formatTexPlain(inner))
      return token
    })

  let cleaned = withMathStashed
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[#>\s*-]+/gm, '')
    .replace(/[*_`~]/g, '')

  for (let idx = 0; idx < mathPlaceholders.length; idx++) {
    cleaned = cleaned.replace(`${excerptPrefix}${idx}@@`, () => mathPlaceholders[idx])
  }

  return cleaned.replace(/\s+/g, ' ').trim()
}
