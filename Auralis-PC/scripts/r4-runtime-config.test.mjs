import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { getRuntimeConfig, resolveWebsocketUrl } from '../src/config/runtime.ts'

test('runtime config keeps development proxy targets separate from production bases', () => {
  const config = getRuntimeConfig({
    VITE_API_BASE_URL: 'https://api.example.test',
    VITE_WS_BASE_URL: 'wss://api.example.test',
    VITE_DEV_API_TARGET: 'http://dev.example.test:8080',
    VITE_DEV_WS_TARGET: 'ws://dev.example.test:8080',
  })
  assert.equal(config.apiBaseUrl, 'https://api.example.test')
  assert.equal(config.websocketBaseUrl, 'wss://api.example.test')
  assert.equal(resolveWebsocketUrl('/ws/events', config), 'wss://api.example.test/ws/events')
})

test('Tauri config requires explicit service bases', () => {
  assert.throws(() => getRuntimeConfig({ TAURI_ENV: '1' }), /requires VITE_API_BASE_URL/)
})

test('Vite proxy targets are environment-driven and Tauri permissions stay minimal', async () => {
  const vite = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')
  const capabilities = await readFile(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8')
  assert.equal(vite.includes("target: 'http://localhost:8080'"), false)
  assert.equal(vite.includes("target: 'ws://localhost:8080'"), false)
  assert.equal(capabilities.includes('shell:default'), false)
  assert.equal(capabilities.includes('http:default'), false)
  assert.equal(capabilities.includes('fs:default'), false)
  assert.equal(capabilities.includes('sql:default'), true)
})

test('Vite ignores generated File Viewer assets during development HMR', async () => {
  const vite = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')
  assert.match(vite, /import \* as vueCompiler from ['"]vue\/compiler-sfc['"]\s/)
  assert.match(vite, /vue\(\{\s*compiler:\s*vueCompiler\s*\}\)/)
  assert.match(vite, /watch:\s*\{[\s\S]*ignored:\s*\[[\s\S]*\*\*\/public\/file-viewer\/\*\*/)
})

test('debug Tauri logging does not fail when the application log file already exists', async () => {
  const tauriLib = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
  assert.match(tauriLib, /use tauri_plugin_log::\{Target, TargetKind\}/)
  assert.match(tauriLib, /\.clear_targets\(\)[\s\S]*\.target\(Target::new\(TargetKind::Stdout\)\)/)
})
