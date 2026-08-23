import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  SUPPORTED_UPLOAD_EXTENSIONS,
  resolveFileCapability,
  validateUploadFile,
} from '../src/utils/filePreview.ts'

test('rejects Excel before upload intent', () => {
  assert.throws(
    () => validateUploadFile({
      name: 'grades.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 10,
    }),
    /Excel/,
  )
})

test('maps DOCX to the File Viewer office renderer', () => {
  assert.deepEqual(resolveFileCapability({ name: 'lesson.docx', type: '' }), {
    allowedForUpload: true,
    kind: 'office',
    renderer: 'file-viewer',
    extension: 'docx',
  })
})

test('maps direct preview formats to the shared renderer', () => {
  for (const [name, kind] of [
    ['lesson.pdf', 'pdf'],
    ['diagram.png', 'image'],
    ['notes.md', 'text'],
    ['records.csv', 'csv'],
  ]) {
    const capability = resolveFileCapability({ name, type: '' })
    assert.equal(capability.allowedForUpload, true)
    assert.equal(capability.kind, kind)
    assert.equal(capability.renderer, 'file-viewer')
  }
})

test('keeps PowerPoint compatible with the Office renderer', () => {
  assert.equal(resolveFileCapability({ name: 'slides.pptx', type: '' }).kind, 'office')
  assert.equal(resolveFileCapability({ name: 'slides.ppt', type: '' }).kind, 'office')
})

test('rejects unknown extensions before upload intent', () => {
  assert.throws(
    () => validateUploadFile({ name: 'payload.bin', type: 'application/octet-stream', size: 10 }),
    /不支持此文件类型/,
  )
})

test('rejects files over the existing 50 MB limit', () => {
  assert.throws(
    () => validateUploadFile({ name: 'large.pdf', type: 'application/pdf', size: 50 * 1024 * 1024 + 1 }),
    /超过上限 50 MB/,
  )
})

test('exposes the single upload accept list', () => {
  assert.deepEqual(SUPPORTED_UPLOAD_EXTENSIONS, [
    '.pdf', '.doc', '.docx', '.ppt', '.pptx',
    '.png', '.jpg', '.jpeg', '.webp', '.gif',
    '.txt', '.md', '.json', '.xml', '.csv',
  ])
  assert.equal(SUPPORTED_UPLOAD_EXTENSIONS.includes('.xls'), false)
  assert.equal(SUPPORTED_UPLOAD_EXTENSIONS.includes('.xlsx'), false)
})

test('FilePreview owns the shared loading and signed-url lifecycle', () => {
  const filePreviewPath = path.resolve('src/components/FilePreview.vue')
  const source = fs.readFileSync(filePreviewPath, 'utf8')
  assert.match(source, /FileViewerRenderer/)
  assert.match(source, /downloadUrl/)
  assert.match(source, /isLoading/)
  assert.match(source, /preview-error/)
  assert.doesNotMatch(source, /\.xls[x]?\b/)
})

test('File Viewer adapter is isolated behind a renderer component', () => {
  const rendererPath = path.resolve('src/components/preview/FileViewerRenderer.vue')
  const source = fs.readFileSync(rendererPath, 'utf8')
  assert.match(source, /@file-viewer\/vue3-full/)
  assert.match(source, /<FileViewer/)
  assert.match(source, /styleIsolation/)
})

test('SubjectWorkspace uses FilePreview and the shared upload accept list', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  assert.match(source, /FilePreview/)
  assert.match(source, /SUPPORTED_UPLOAD_EXTENSIONS/)
  assert.match(source, /:accept="SUPPORTED_UPLOAD_EXTENSIONS\.join\('\,'\)"/)
  assert.match(source, /validateUploadFile/)
  assert.match(source, /@click="selectFile\(file\.id\)"/)
})

test('SubjectWorkspace keeps files flat and exposes file deletion', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  assert.doesNotMatch(source, /const workspaceFiles = computed/)
  assert.doesNotMatch(source, /summaryMarkdownFor/)
  assert.doesNotMatch(source, /isSummary-file/)
  assert.match(source, /v-for="file in activeSourceFiles"/)
  assert.match(source, /handleDeleteFile\(file\)/)
  assert.match(source, /deleteSourceFile\(file\.id\)/)
  assert.match(source, /class="drawer-item-delete"/)
  assert.match(source, /ApiProblemError/)
  assert.match(source, /RESOURCE_VERSION_CONFLICT/)
  assert.match(source, /RESOURCE_NOT_FOUND/)
  assert.match(source, /\.drawer-item:hover \.drawer-item-delete[\s\S]*opacity:\s*1;/)
  assert.match(source, /\.drawer-item-delete \{[^}]*opacity:\s*0;/)
  assert.match(source, /el-message-box\.css/)
})

test('useSourceStore handles pending CREATE when deleting files', () => {
  const storePath = path.resolve('src/store/useSourceStore.ts')
  const source = fs.readFileSync(storePath, 'utf8')
  assert.match(source, /repo\.listPending\('SOURCE'\)/)
  assert.match(source, /mutationType === 'CREATE'/)
})

test('SubjectWorkspace renders the selected file directly and keeps knowledge blocks as the summary surface', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  const previewSource = fs.readFileSync(path.resolve('src/components/FilePreview.vue'), 'utf8')
  assert.match(source, /centerView === 'preview'/)
  assert.match(source, /:bare="true"/)
  assert.match(previewSource, /<header v-if="!bare" class="file-preview-header">/)
  assert.match(source, /centerView = 'blocks'/)
  assert.doesNotMatch(source, /centerView === 'summary'/)
  assert.doesNotMatch(source, /Markdown 文件/)
})
