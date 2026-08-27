import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const apiPath = new URL('../src/api/tauri.ts', import.meta.url)

test('ocr api exposes only bounded commands and DTOs', async () => {
  const source = await readFile(apiPath, 'utf8')
  assert.match(source, /ocr_warmup/)
  assert.match(source, /ocr_recognize_page/)
  assert.match(source, /ocr_shutdown/)
  assert.match(source, /imageBytes: number\[\]/)
  assert.doesNotMatch(source, /shell|Command\.new|spawn|fetch\(|\bfs\./i)
  assert.doesNotMatch(source, /executable|modelPath|imagePath|allowedImageRoot/)
})

test('ocr page command keeps image bytes and timeout bounded at the contract edge', async () => {
  const source = await readFile(apiPath, 'utf8')
  assert.match(source, /MAX_OCR_IMAGE_BYTES/)
  assert.match(source, /MAX_OCR_TIMEOUT_MS/)
  assert.match(source, /timeoutMs > MAX_OCR_TIMEOUT_MS/)
})
