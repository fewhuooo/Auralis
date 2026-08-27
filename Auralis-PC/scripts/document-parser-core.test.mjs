import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDocument } from '../src/services/documentParser/DocumentParser.ts'

function file(name) {
  return { name, type: name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' }
}

function pdfInput(name, pages, extra = {}) {
  const fetchedPages = []
  return {
    input: {
      file: file(name),
      pdf: {
        pageCount: pages.length,
        async getPage(pageNumber) {
          fetchedPages.push(pageNumber)
          return pages[pageNumber - 1]
        },
      },
      ...extra,
    },
    fetchedPages,
  }
}

function textPage(text, bitmap = [1, 2, 3]) {
  return {
    async getText() {
      return text
    },
    async renderBitmap() {
      return new Uint8Array(bitmap)
    },
  }
}

function ocr(linesByPage) {
  const calls = []
  return {
    calls,
    async recognizePage({ pageNumber, imageBytes }) {
      calls.push({ pageNumber, imageBytes: [...imageBytes] })
      return { lines: linesByPage[pageNumber - 1] || [] }
    },
  }
}

test('streams text-layer PDF pages as normalized bounded page blocks', async () => {
  const { input } = pdfInput('lesson.pdf', [
    textPage(' 第一行\r\n第二行 '),
    textPage('第三行'),
  ])
  const blocks = []

  const summary = await parseDocument(input, async (block) => {
    blocks.push(block)
  })

  assert.deepEqual(blocks.map(({ ordinal, kind, pageNumber, text }) => ({ ordinal, kind, pageNumber, text })), [
    { ordinal: 0, kind: 'page', pageNumber: 1, text: '第一行\n第二行' },
    { ordinal: 1, kind: 'page', pageNumber: 2, text: '第三行' },
  ])
  assert.equal(summary.blockCount, 2)
  assert.equal(summary.normalization, 'nfkc-lf-trim')
  for (const block of blocks) {
    assert.equal('path' in block, false)
    assert.equal('bbox' in block, false)
    assert.equal('html' in block, false)
  }
})

test('classifies a scanned PDF page and sends only its bitmap to OCR', async () => {
  const ocrAdapter = ocr([['扫描标题', '第二行']])
  const { input } = pdfInput('scanned.pdf', [textPage('   ', [9, 8, 7])], { ocr: ocrAdapter })
  const blocks = []

  await parseDocument(input, async (block) => {
    blocks.push(block)
  })

  assert.deepEqual(blocks.map(({ ordinal, kind, pageNumber, text }) => ({ ordinal, kind, pageNumber, text })), [
    { ordinal: 0, kind: 'ocr-page', pageNumber: 1, text: '扫描标题\n第二行' },
  ])
  assert.deepEqual(ocrAdapter.calls, [{ pageNumber: 1, imageBytes: [9, 8, 7] }])
})

test('supports mixed PDF pages with continuous ordinals', async () => {
  const ocrAdapter = ocr([[], ['OCR page']])
  const { input } = pdfInput('mixed.pdf', [
    textPage('text layer'),
    textPage('', [4, 5]),
    textPage('last page'),
  ], { ocr: ocrAdapter })
  const blocks = []

  await parseDocument(input, async (block) => {
    blocks.push(block)
  })

  assert.deepEqual(blocks.map(({ ordinal, kind, pageNumber, text }) => ({ ordinal, kind, pageNumber, text })), [
    { ordinal: 0, kind: 'page', pageNumber: 1, text: 'text layer' },
    { ordinal: 1, kind: 'ocr-page', pageNumber: 2, text: 'OCR page' },
    { ordinal: 2, kind: 'page', pageNumber: 3, text: 'last page' },
  ])
})

test('extracts Office chunks directly and keeps chunk order deterministic', async () => {
  const { input } = pdfInput('unused.pdf', [], {
    file: file('slides.pptx'),
    office: {
      pageCount: 2,
      bridge: {
        async prepare() {},
        async extractOrFallback() {
          return {
            outcome: 'extract',
            chunks: [
              { id: 'b', text: '第二段', anchor: { index: 1 }, startLine: 2 },
              { id: 'a', text: '第一段', anchor: { index: 0 }, startLine: 1 },
            ],
            anchors: [],
          }
        },
        async renderPageBitmap() {
          throw new Error('direct extraction must not render bitmap')
        },
        dispose() {},
      },
    },
  })
  const blocks = []

  await parseDocument(input, async (block) => {
    blocks.push(block)
  })

  assert.deepEqual(blocks.map(({ ordinal, kind, text }) => ({ ordinal, kind, text })), [
    { ordinal: 0, kind: 'slide', text: '第一段' },
    { ordinal: 1, kind: 'slide', text: '第二段' },
  ])
})

test('falls back from Office text extraction to bitmap OCR', async () => {
  const ocrAdapter = ocr([['fallback slide']])
  const { input } = pdfInput('unused.pdf', [], {
    file: file('slides.ppt'),
    office: {
      pageCount: 1,
      bridge: {
        async prepare() {},
        async extractOrFallback() {
          return { outcome: 'bitmap-fallback', chunks: [], anchors: [] }
        },
        async renderPageBitmap() {
          return new Uint8Array([6, 6, 6])
        },
        dispose() {},
      },
    },
    ocr: ocrAdapter,
  })
  const blocks = []

  await parseDocument(input, async (block) => {
    blocks.push(block)
  })

  assert.deepEqual(blocks.map(({ ordinal, kind, pageNumber, text }) => ({ ordinal, kind, pageNumber, text })), [
    { ordinal: 0, kind: 'ocr-page', pageNumber: 1, text: 'fallback slide' },
  ])
  assert.deepEqual(ocrAdapter.calls, [{ pageNumber: 1, imageBytes: [6, 6, 6] }])
})

test('waits for sink backpressure before requesting the next page', async () => {
  let releaseFirstSink
  const firstSink = new Promise((resolve) => {
    releaseFirstSink = resolve
  })
  const { input, fetchedPages } = pdfInput('backpressure.pdf', [textPage('one'), textPage('two')])
  const blocks = []

  const parsing = parseDocument(input, async (block) => {
    blocks.push(block)
    if (block.ordinal === 0) await firstSink
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(fetchedPages, [1])
  releaseFirstSink()
  await parsing
  assert.deepEqual(fetchedPages, [1, 2])
  assert.equal(blocks.length, 2)
})

test('rejects a block that exceeds the bounded parser limit', async () => {
  const { input } = pdfInput('oversized.pdf', [textPage('12345')])

  await assert.rejects(
    () => parseDocument(input, async () => {}, { maxBlockChars: 4 }),
    /PARSED_BLOCK_TOO_LARGE/,
  )
})
