import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const viewerPath = path.join(root, 'src/components/subject/PdfViewer.vue')

async function source() {
  return readFile(viewerPath, 'utf8')
}

test('PdfViewer keeps PDF bytes out of Tauri command IPC', async () => {
  const viewer = await source()

  assert.doesNotMatch(viewer, /@tauri-apps\/plugin-fs|\breadFile\s*\(/)
  assert.match(viewer, /convertFileSrc/)
})

test('PdfViewer fences stale PDF loads and releases superseded resources', async () => {
  const viewer = await source()

  assert.match(viewer, /let loadGeneration = 0/)
  assert.match(viewer, /const myGeneration = \+\+loadGeneration/)
  assert.match(viewer, /if \(myGeneration !== loadGeneration\)/)
  assert.match(viewer, /currentLoadingTask\.destroy\(\)/)
  assert.match(viewer, /pdfDoc\.destroy\(\)/)
  assert.match(viewer, /canvas\.width = 0[\s\S]*canvas\.height = 0/)
})

test('PdfViewer calculates the initial scale then renders the first page once', async () => {
  const viewer = await source()

  assert.doesNotMatch(viewer, /await fitWidth\(\)\s*await renderPage\(1\)/)
  assert.doesNotMatch(viewer, /for\s*\([\s\S]{0,60}numPages[\s\S]{0,40}renderPage/)
})
