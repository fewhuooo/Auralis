import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { parseDocument } from '../src/services/documentParser/DocumentParser.ts'
import { FileViewerParserBridge } from '../src/services/documentParser/fileViewerBridge.ts'
import { openPptxDocument } from '../src/services/documentParser/PptxTextAdapter.ts'

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
      return { lines: linesByPage[pageNumber - 1] || [], timingMs: { det: 2, rec: 3, total: 5 } }
    },
  }
}

test('continues after an empty OCR page and emits safe page diagnostics', async () => {
  const ocrAdapter = ocr([[], ['valid OCR']])
  const { input } = pdfInput('scanned.pdf', [textPage('', [1, 2, 3]), textPage('', [4, 5, 6])], { ocr: ocrAdapter })
  const blocks = []
  const progress = []

  await parseDocument(input, async (block) => blocks.push(block), { onProgress: (event) => progress.push(event) })

  assert.deepEqual(blocks.map(({ ordinal, pageNumber, text }) => ({ ordinal, pageNumber, text })), [
    { ordinal: 0, pageNumber: 2, text: 'valid OCR' },
  ])
  const empty = progress.find((event) => event.type === 'empty-page')
  assert.deepEqual(empty, {
    type: 'empty-page', pageNumber: 1, totalPages: 2, imageBytes: 3,
    rawLineCount: 0, normalizedLineCount: 0, timingMs: { det: 2, rec: 3, total: 5 },
    ocrProcessedPages: 1, ocrTextPages: 0, ocrEmptyPages: 1, totalRawLineCount: 0, totalNormalizedLineCount: 0,
  })
})

test('rejects only when every attempted OCR page is empty', async () => {
  const { input } = pdfInput('empty.pdf', [textPage('', [8, 9]), textPage('', [7])], { ocr: ocr([[], []]) })

  await assert.rejects(
    () => parseDocument(input, async () => {}),
    (error) => {
      assert.equal(error.message, 'OCR_DOCUMENT_EMPTY')
      assert.deepEqual(error.diagnostic, {
        pageNumber: 2, totalPages: 2, imageBytes: 1, rawLineCount: 0, normalizedLineCount: 0,
        timingMs: { det: 2, rec: 3, total: 5 },
        ocrProcessedPages: 2, ocrTextPages: 0, ocrEmptyPages: 2, totalRawLineCount: 0, totalNormalizedLineCount: 0,
      })
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /path/i)
      return true
    },
  )
})

test('emits before-recognize before invoking the OCR adapter', async () => {
  const events = []
  const { input } = pdfInput('ordered.pdf', [textPage('', [1, 2])])
  input.ocr = {
    model: 'fake',
    async recognizePage() {
      assert.equal(events[0].type, 'before-recognize')
      return { lines: ['ok'], timingMs: { det: 0, rec: 1, total: 1 } }
    },
  }
  await parseDocument(input, async () => {}, { onProgress: (event) => events.push(event) })
  assert.deepEqual(events[0], { type: 'before-recognize', pageNumber: 1, totalPages: 1, imageBytes: 2 })
})

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

test('releases the PDF.js document after parsing so OCR does not retain a competing renderer worker', async () => {
  let destroyCalls = 0
  const { input } = pdfInput('release-after-ocr.pdf', [textPage('text layer')])
  input.pdf.destroy = async () => { destroyCalls += 1 }

  await parseDocument(input, async () => {})

  assert.equal(destroyCalls, 1)
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

test('Office bridge refreshes anchors before reading text chunks', async () => {
  const calls = []
  let anchorsCollected = false
  const bridge = new FileViewerParserBridge({
    value: {
      async prepare() { calls.push('prepare') },
      async extractAnchors() {
        calls.push('anchors')
        anchorsCollected = true
        return [{ id: 'page-1', index: 0, line: 1, text: 'Slide title' }]
      },
      extractChunks() {
        calls.push('chunks')
        return anchorsCollected
          ? [{ id: 'chunk-1', text: 'Slide title', anchor: { index: 0 }, startLine: 1 }]
          : []
      },
      async renderPageBitmap() { throw new Error('bitmap fallback must not run') },
      dispose() {},
    },
  })
  await bridge.prepare(file('slides.pptx'))
  const result = await bridge.extractOrFallback()
  assert.equal(result.outcome, 'extract')
  assert.deepEqual(calls, ['prepare', 'anchors', 'chunks'])
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

test('continues across empty and valid pages in multi-page Office bitmap OCR fallback', async () => {
  const renderedPages = []
  const recognizedPages = []
  const progress = []
  const { input } = pdfInput('unused.pdf', [], {
    file: file('scanned.ppt'),
    office: {
      pageCount: 2,
      bridge: {
        async prepare() {},
        async extractOrFallback() {
          return { outcome: 'bitmap-fallback', chunks: [], anchors: [] }
        },
        async renderPageBitmap(pageNumber) {
          renderedPages.push(pageNumber)
          return new Uint8Array([pageNumber, pageNumber + 1])
        },
        dispose() {},
      },
    },
    ocr: {
      async recognizePage({ pageNumber, imageBytes }) {
        recognizedPages.push({ pageNumber, imageBytes: [...imageBytes] })
        return { lines: pageNumber === 1 ? [] : ['valid office OCR'], timingMs: { det: 1, rec: 2, total: 3 } }
      },
    },
  })
  const blocks = []

  await parseDocument(input, async (block) => blocks.push(block), { onProgress: (event) => progress.push(event) })

  assert.deepEqual(renderedPages, [1, 2])
  assert.deepEqual(recognizedPages, [
    { pageNumber: 1, imageBytes: [1, 2] },
    { pageNumber: 2, imageBytes: [2, 3] },
  ])
  assert.deepEqual(progress.filter(({ type }) => type === 'before-recognize').map(({ pageNumber, totalPages }) => ({ pageNumber, totalPages })), [
    { pageNumber: 1, totalPages: 2 },
    { pageNumber: 2, totalPages: 2 },
  ])
  assert.deepEqual(blocks.map(({ ordinal, pageNumber, text }) => ({ ordinal, pageNumber, text })), [
    { ordinal: 0, pageNumber: 2, text: 'valid office OCR' },
  ])
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

test('reads the real PPTX fixture in presentation slide order', async () => {
  const fixture = path.resolve(import.meta.dirname, '..', '..', 'docs', 'test', '编译原理课件chap01(陈火旺)-v9.pptx')
  const pptx = await openPptxDocument(new Uint8Array(await fs.readFile(fixture)))
  assert.equal(pptx.slideCount, 49)
  assert.match(await (await pptx.getSlide(1)).getText(), /编译原理/)
  assert.match(await (await pptx.getSlide(2)).getText(), /Self Introduction/)
})

test('PPTX parser imports the browser-safe JSZip bundle instead of the Node stream entry', async () => {
  const adapter = await fs.readFile(path.resolve(import.meta.dirname, '..', 'src', 'services', 'documentParser', 'PptxTextAdapter.ts'), 'utf8')
  assert.match(adapter, /from ['"]jszip\/dist\/jszip\.min\.js['"]/)
  assert.doesNotMatch(adapter, /from ['"]jszip['"];/)
})

test('streams PPTX OOXML text as deterministic slide blocks', async () => {
  const fixture = path.resolve(import.meta.dirname, '..', '..', 'docs', 'test', '编译原理课件chap01(陈火旺)-v9.pptx')
  const pptx = await openPptxDocument(new Uint8Array(await fs.readFile(fixture)))
  const blocks = []
  const result = await parseDocument({ file: file('lecture.pptx'), pptx }, async (block) => blocks.push(block))
  assert.equal(result.blockCount, blocks.length)
  assert.ok(blocks.length > 1)
  assert.deepEqual(blocks.slice(0, 2).map(({ ordinal, kind, pageNumber }) => ({ ordinal, kind, pageNumber })), [
    { ordinal: 0, kind: 'slide', pageNumber: 1 },
    { ordinal: 1, kind: 'slide', pageNumber: 2 },
  ])
})

test('rejects legacy PPT bytes instead of treating them as PPTX', async () => {
  const fixture = path.resolve(import.meta.dirname, '..', '..', 'docs', 'test', 'auralis-generated-legacy.ppt')
  const bytes = new Uint8Array(await fs.readFile(fixture))
  await assert.rejects(
    () => openPptxDocument(bytes),
    /PPTX_LEGACY_UNSUPPORTED/,
  )
})
