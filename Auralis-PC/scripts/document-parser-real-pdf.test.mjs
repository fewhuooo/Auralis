import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { openPdfDocument } from '../src/services/documentParser/PdfTextAdapter.ts'

const workspace = path.resolve(import.meta.dirname, '..', '..')

async function textCharCount(pdf) {
  let chars = 0
  for (let pageNumber = 1; pageNumber <= pdf.pageCount; pageNumber += 1) {
    chars += (await (await pdf.getPage(pageNumber)).getText()).length
  }
  return chars
}

test('classifies the supplied text-layer PDF as extractable text', async () => {
  const bytes = new Uint8Array(await fs.readFile(path.join(workspace, 'docs', 'test', '学生操作手册2026.pdf')))
  const pdf = await openPdfDocument(bytes)

  assert.equal(pdf.pageCount, 51)
  assert.ok(await textCharCount(pdf) > 0)
})

test('classifies the supplied scanned PDF as having no text layer', async () => {
  const bytes = new Uint8Array(await fs.readFile(path.join(workspace, 'docs', 'test', '数据库系统概论(第6版) (王珊,杜小勇,陈红) (Z-Library).pdf')))
  const pdf = await openPdfDocument(bytes)

  assert.equal(pdf.pageCount, 500)
  assert.equal(await textCharCount(pdf), 0)
})
