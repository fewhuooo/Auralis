import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
}

test('File Viewer and the local PDF parser resolve one exact PDF.js runtime', async () => {
  const manifest = await readJson('package.json')
  const lock = await readJson('package-lock.json')
  const renderer = lock.packages['node_modules/@file-viewer/renderer-pdf']
  const runtime = lock.packages['node_modules/pdfjs-dist']

  assert.equal(manifest.dependencies['pdfjs-dist'], '5.4.624')
  assert.equal(renderer.dependencies['pdfjs-dist'], '5.4.624')
  assert.equal(runtime.version, '5.4.624')
  assert.equal(lock.packages['node_modules/@file-viewer/renderer-pdf/node_modules/pdfjs-dist'], undefined)

  const adapter = await readFile(path.join(root, 'src/services/documentParser/PdfTextAdapter.ts'), 'utf8')
  assert.match(adapter, /import\('pdfjs-dist\/legacy\/build\/pdf\.mjs'\)/)
  assert.match(adapter, /pdf\.worker\.min\.mjs\?url/)
  assert.match(adapter, /GlobalWorkerOptions\.workerSrc\s*=\s*await resolvePdfWorkerSrc\(\)/)
  assert.doesNotMatch(adapter, /https?:\/\//)
  assert.doesNotMatch(adapter, /disableWorker/)
})
