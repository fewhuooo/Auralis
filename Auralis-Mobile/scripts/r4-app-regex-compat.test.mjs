import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createTextEncodingPolyfillBanner } from './app-text-encoding-polyfill.mjs'
import { transformUnicodePropertyRegexes } from './unicode-property-regex-compat.mjs'
import { resolveRuntimeConfig } from '../src/config/runtime.ts'

test('transformUnicodePropertyRegexes lowers regex literals for ICU-less V8 while preserving behavior', () => {
  const source = [
    'function createMatchers() {',
    '  const alphaNum = /[\\p{L}\\p{N}]/u;',
    '  const punctSym = /[\\p{P}\\p{S}]/u;',
    '  return { alphaNum, punctSym };',
    '}',
  ].join('\n')

  const transformed = transformUnicodePropertyRegexes(source)
  assert.ok(transformed)
  assert.doesNotMatch(transformed, /\\[pP]\{/)

  const { alphaNum, punctSym } = new Function(`${transformed}\nreturn createMatchers();`)()
  assert.equal(alphaNum.test('A'), true)
  assert.equal(alphaNum.test('中'), true)
  assert.equal(alphaNum.test('3'), true)
  assert.equal(alphaNum.test(' '), false)

  assert.equal(punctSym.test('!'), true)
  assert.equal(punctSym.test('，'), true)
  assert.equal(punctSym.test('a'), false)
})

test('transformUnicodePropertyRegexes lowers esbuild-style new RegExp Unicode property calls', () => {
  const source = [
    'function createMatchers() {',
    '  const hasUpper = new RegExp("\\\\p{Lu}", "u");',
    '  const hasLower = new RegExp("\\\\p{Ll}", "u");',
    '  return { hasUpper, hasLower };',
    '}',
  ].join('\n')

  const transformed = transformUnicodePropertyRegexes(source)
  assert.ok(transformed)
  assert.doesNotMatch(transformed, /\\[pP]\{/)

  const { hasUpper, hasLower } = new Function(`${transformed}\nreturn createMatchers();`)()
  assert.equal(hasUpper.test('A'), true)
  assert.equal(hasUpper.test('a'), false)
  assert.equal(hasLower.test('a'), true)
  assert.equal(hasLower.test('A'), false)
})

test('transformUnicodePropertyRegexes eliminates all Unicode property escapes in marked.esm.js', async () => {
  const markedPath = new URL('../node_modules/marked/lib/marked.esm.js', import.meta.url)
  const markedSource = await readFile(markedPath, 'utf8')
  const transformed = transformUnicodePropertyRegexes(markedSource)
  assert.ok(transformed)
  assert.doesNotMatch(transformed, /\\[pP]\{/)
})

test('createTextEncodingPolyfillBanner handles ASCII, CJK, Greek math, emoji and split SSE chunks', () => {
  const banner = createTextEncodingPolyfillBanner()
  const sandbox = {}
  new Function('globalThis', banner)(sandbox)
  assert.equal(typeof sandbox.TextEncoder, 'function')
  assert.equal(typeof sandbox.TextDecoder, 'function')

  const encoder = new sandbox.TextEncoder()
  const decoder = new sandbox.TextDecoder('utf-8')
  const sample = 'Hello 你好Auralis φ(x) ≤ ∞ 🚀📚'
  const encoded = encoder.encode(sample)
  assert.ok(encoded instanceof Uint8Array)
  assert.equal(decoder.decode(encoded), sample)

  // Split 4-byte emoji (🚀 = F0 9F 9A 80) and 3-byte CJK (好 = E5 A5 BD) across chunks
  const streamText = '你好🚀!'
  const full = encoder.encode(streamText)
  const part1 = decoder.decode(full.slice(0, 4), { stream: true })
  const part2 = decoder.decode(full.slice(4, 8), { stream: true })
  const part3 = decoder.decode(full.slice(8), { stream: false })
  assert.equal(part1 + part2 + part3, streamText)

  // ArrayBuffer and non-zero byteOffset DataView/subarray inputs
  assert.equal(decoder.decode(encoded.buffer), sample)
  const padded = new Uint8Array([0xff, 0xfe, ...full, 0x00])
  const sub = padded.subarray(2, 2 + full.length)
  assert.equal(decoder.decode(new DataView(sub.buffer, sub.byteOffset, sub.byteLength)), streamText)

  // Single-byte latin1 decoding (used by jspdf/fast-png)
  const latin1Decoder = new sandbox.TextDecoder('latin1')
  assert.equal(latin1Decoder.decode(new Uint8Array([0x41, 0xe9, 0xff])), 'A\u00e9\u00ff')
})

test('resolveRuntimeConfig works without globalThis.URL (Android J2V8 / Mini Program compatibility)', () => {
  const originalUrl = globalThis.URL
  // @ts-expect-error testing missing URL global in Android J2V8
  globalThis.URL = undefined
  try {
    const resolved = resolveRuntimeConfig({
      VITE_API_BASE_URL: 'http://127.0.0.1:8080/',
      VITE_WS_BASE_URL: 'ws://127.0.0.1:8080/',
    }, 'app')
    assert.equal(resolved.apiBaseUrl, 'http://127.0.0.1:8080')
    assert.equal(resolved.websocketBaseUrl, 'ws://127.0.0.1:8080')

    assert.throws(() => resolveRuntimeConfig({
      VITE_API_BASE_URL: '/api',
      VITE_WS_BASE_URL: 'ws://127.0.0.1:8080',
    }, 'app'), /absolute URL/)
    assert.throws(() => resolveRuntimeConfig({
      VITE_API_BASE_URL: 'http://user:pass@127.0.0.1:8080',
      VITE_WS_BASE_URL: 'ws://127.0.0.1:8080',
    }, 'app'), /credentials/)
    assert.throws(() => resolveRuntimeConfig({
      VITE_API_BASE_URL: 'http://127.0.0.1:8080?x=1',
      VITE_WS_BASE_URL: 'ws://127.0.0.1:8080',
    }, 'app'), /query/)
    assert.throws(() => resolveRuntimeConfig({
      VITE_API_BASE_URL: 'http://127.0.0.1:99999',
      VITE_WS_BASE_URL: 'ws://127.0.0.1:8080',
    }, 'app'), /absolute URL/)
    assert.throws(() => resolveRuntimeConfig({
      VITE_API_BASE_URL: 'http://127.0.0.1:8080',
      VITE_WS_BASE_URL: 'wss://127.0.0.1:8080',
    }, 'mp-weixin'), /HTTPS/)
  } finally {
    globalThis.URL = originalUrl
  }
})
