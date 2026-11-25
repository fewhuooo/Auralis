import assert from 'node:assert/strict'
import test from 'node:test'

import { isSubjectIconKey, subjectIconOptions } from '../src/utils/subjectIcon.ts'
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  SUPPORTED_UPLOAD_EXTENSIONS,
  getUploadFileExtension,
  inferUploadMimeType,
  validateUploadFile,
} from '../src/utils/uploadValidation.ts'

test('subjectIconOptions matches the 16 canonical PC discipline keys and labels', () => {
  const expected = [
    ['math', '高等数学'],
    ['code', '程序设计'],
    ['physics', '大学物理'],
    ['chemistry', '基础化学'],
    ['biology', '生命科学'],
    ['computer', '电子信息'],
    ['analysis', '数据与AI'],
    ['language', '学术外语'],
    ['book', '文学传播'],
    ['economics', '经济金融'],
    ['business', '工商管理'],
    ['law', '法律法学'],
    ['medicine', '临床医学'],
    ['engineering', '建筑土木'],
    ['art', '艺术设计'],
    ['school', '通识思政'],
  ]

  assert.deepEqual(
    subjectIconOptions.map(item => [item.key, item.label]),
    expected,
  )
  for (const [key] of expected) {
    assert.equal(isSubjectIconKey(key), true)
  }
  for (const legacyKey of ['reading', 'library', 'notes', 'idea', 'settings', 'focus', 'achievement', 'research', 'laptop', '', null, undefined]) {
    assert.equal(isSubjectIconKey(legacyKey), false)
  }
})

test('validateUploadFile enforces PC-aligned 50 MB size limit and 5 document extensions', () => {
  assert.deepEqual([...SUPPORTED_UPLOAD_EXTENSIONS], ['.pdf', '.doc', '.docx', '.ppt', '.pptx'])

  for (const name of ['讲义.pdf', 'NOTES.DOCX', 'draft.doc', 'slides.ppt', 'deck.PPTX']) {
    assert.doesNotThrow(() => validateUploadFile({ name, size: 1024 }))
  }

  assert.doesNotThrow(() => validateUploadFile({ name: 'exact-50mb.pdf', size: MAX_UPLOAD_FILE_SIZE_BYTES }))
  assert.throws(
    () => validateUploadFile({ name: 'too-big.pdf', size: MAX_UPLOAD_FILE_SIZE_BYTES + 1 }),
    /超过上限 50 MB/,
  )
  assert.throws(
    () => validateUploadFile({ name: 'sheet.xlsx', size: 1024 }),
    /暂不支持 Excel 文件/,
  )
  assert.throws(
    () => validateUploadFile({ name: 'photo.png', size: 1024 }),
    /仅支持上传 PDF、DOC、DOCX、PPT、PPTX 文件/,
  )
  assert.throws(
    () => validateUploadFile({ name: 'README', size: 128 }),
    /仅支持上传 PDF、DOC、DOCX、PPT、PPTX 文件/,
  )
})

test('inferUploadMimeType and getUploadFileExtension resolve common document formats cleanly', () => {
  assert.equal(getUploadFileExtension('  Algorithms.V2.DOCX  '), 'docx')
  assert.equal(getUploadFileExtension('noext'), '')
  assert.equal(inferUploadMimeType('book.pdf'), 'application/pdf')
  assert.equal(inferUploadMimeType('deck.pptx'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
  assert.equal(inferUploadMimeType('custom.pdf', 'application/x-custom'), 'application/x-custom')
  assert.equal(inferUploadMimeType('archive.bin'), 'application/octet-stream')
})
