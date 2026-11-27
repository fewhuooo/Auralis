import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const babel = require('@babel/core')
const unicodePropertyPlugin = require('@babel/plugin-transform-unicode-property-regex')
const rewritePattern = require('regexpu-core')

const UNICODE_PROPERTY_ESCAPE_RE = /\\[pP]\{/
const SKIP_EXT_RE = /\.(?:css|scss|sass|less|styl|json|html|htm|svg|png|jpe?g|gif|webp|woff2?|ttf|eot|wasm)$/i

function rewriteRegExpNode(node, patternRewriter) {
  if (!node.callee || node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') {
    return
  }
  const firstArg = node.arguments?.[0]
  if (!firstArg || firstArg.type !== 'StringLiteral' || !UNICODE_PROPERTY_ESCAPE_RE.test(firstArg.value)) {
    return
  }
  const secondArg = node.arguments[1]
  const flags = secondArg && secondArg.type === 'StringLiteral' ? secondArg.value : ''
  if (!flags.includes('u')) {
    return
  }
  firstArg.value = patternRewriter(firstArg.value, flags, { unicodePropertyEscapes: 'transform' })
}

function createNewRegExpUnicodePlugin(patternRewriter) {
  return {
    visitor: {
      'NewExpression|CallExpression'(path) {
        rewriteRegExpNode(path.node, patternRewriter)
      },
    },
  }
}

/** Lowers ES2018 `\p{...}` regex literals and `new RegExp("...","u")` calls for Android 5+ J2V8/V8 engines without full ICU. */
export function transformUnicodePropertyRegexes(code) {
  if (!UNICODE_PROPERTY_ESCAPE_RE.test(code)) {
    return null
  }
  const result = babel.transformSync(code, {
    babelrc: false,
    configFile: false,
    compact: false,
    retainLines: true,
    sourceMaps: false,
    plugins: [
      [unicodePropertyPlugin, { useUnicodeFlag: true }],
      createNewRegExpUnicodePlugin(rewritePattern),
    ],
  })
  return result?.code ?? null
}

/** Returns a post-transform Vite plugin that lowers Unicode property escape regexes across compiled non-H5 JS chunks. */
export function createUnicodePropertyRegexCompatPlugin() {
  return {
    name: 'auralis-unicode-property-regex-compat',
    enforce: 'post',
    transform(code, id) {
      const cleanId = id.split('?')[0]
      if (SKIP_EXT_RE.test(cleanId) || !UNICODE_PROPERTY_ESCAPE_RE.test(code)) {
        return null
      }
      const transformed = transformUnicodePropertyRegexes(code)
      if (!transformed || transformed === code) {
        return null
      }
      return { code: transformed, map: null }
    },
  }
}
