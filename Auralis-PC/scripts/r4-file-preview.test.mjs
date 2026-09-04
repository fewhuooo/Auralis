import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  SUPPORTED_UPLOAD_EXTENSIONS,
  resolveFileCapability,
  validateUploadFile,
} from '../src/utils/filePreview.ts'
import { PreviewRequestGate } from '../src/components/preview/PreviewRequestGate.ts'

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
  assert.match(source, /PreviewRequestGate/)
  assert.match(source, /previewRequests\.isCurrent\(requestId\)/)
  assert.doesNotMatch(source, /\.xls[x]?\b/)
})

test('preview request gate rejects a late signed-url response for a previously selected file', () => {
  const gate = new PreviewRequestGate()
  const first = gate.begin()
  const second = gate.begin()

  assert.equal(gate.isCurrent(first), false)
  assert.equal(gate.isCurrent(second), true)
})

test('FilePreview aborts superseded binary downloads before starting another renderer load', () => {
  const filePreviewPath = path.resolve('src/components/FilePreview.vue')
  const source = fs.readFileSync(filePreviewPath, 'utf8')

  assert.match(source, /AbortController/)
  assert.match(source, /\.abort\(\)/)
  assert.match(source, /fetch\(url, \{ signal:/)
  assert.match(source, /setTimeout/)
})

test('File Viewer adapter is isolated behind a renderer component', () => {
  const rendererPath = path.resolve('src/components/preview/FileViewerRenderer.vue')
  const source = fs.readFileSync(rendererPath, 'utf8')
  assert.match(source, /FileViewer as BaseFileViewer[^\n]*from '@file-viewer\/vue3'/)
  assert.match(source, /withFullViewerOptions[^\n]*from '@file-viewer\/vue3-full'/)
  assert.match(source, /<BaseFileViewer/)
  assert.doesNotMatch(source, /import \{ FileViewer \} from '@file-viewer\/vue3-full'/)
  assert.match(source, /styleIsolation/)
})

test('File Viewer renderer disables internal toolbars and exposes an API that is not gated by load-complete', () => {
  const rendererPath = path.resolve('src/components/preview/FileViewerRenderer.vue')
  const source = fs.readFileSync(rendererPath, 'utf8')

  assert.match(source, /toolbar:\s*false/)
  assert.match(source, /pdf:\s*\{\s*toolbar:\s*false/)
  assert.doesNotMatch(source, /\.pdf-shell/)
  assert.doesNotMatch(source, /flex-direction:\s*column-reverse/)
  assert.match(source, /zoomIn:\s*\(\) => runViewerAction\(\(\) => zoomIn\(\)\)/)
  assert.match(source, /viewer\.zoomIn\(\)/)
  assert.match(source, /viewer\.zoomOut\(\)/)
  assert.match(source, /viewer\.resetZoom\(\)/)
  assert.match(source, /applyViewState/)
  assert.doesNotMatch(source, /function changeZoom/)
  assert.match(source, /if \(!viewerRef\.value\)/)
  assert.doesNotMatch(source, /if \(!viewerRef\.value \|\| !isReady\.value\)/)
  assert.match(source, /applyViewState\(\{ rotation/)
  assert.match(source, /rotate/)
  assert.match(source, /ready-change/)
  assert.match(source, /image-toolbar/)
  assert.match(source, /display: none !important/)
})

test('File preview only queues controls before component refs exist and keeps the paper clear of chrome', () => {
  const previewPath = path.resolve('src/components/FilePreview.vue')
  const previewSource = fs.readFileSync(previewPath, 'utf8')
  const rendererPath = path.resolve('src/components/preview/FileViewerRenderer.vue')
  const rendererSource = fs.readFileSync(rendererPath, 'utf8')
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const workspaceSource = fs.readFileSync(workspacePath, 'utf8')

  assert.match(previewSource, /pendingRendererActions/)
  assert.match(previewSource, /control-ready/)
  assert.match(previewSource, /padding: 12px 16px/)
  assert.match(previewSource, /if \(!rendererRef\.value\)/)
  assert.doesNotMatch(previewSource, /if \(!rendererRef\.value \|\| !isRendererReady\.value\)/)
  assert.doesNotMatch(previewSource, /file-preview-loading-overlay/)
  assert.match(rendererSource, /@zoom-change="onZoomChange"/)
  assert.match(rendererSource, /file-viewer-rotation-layer/)
  assert.match(rendererSource, /rotateLeft:/)
  assert.match(rendererSource, /rotateRight:/)
  assert.match(workspaceSource, /box-shadow: 0 2px 10px/)
  assert.match(workspaceSource, /box-shadow: 0 -2px 10px/)
  assert.match(workspaceSource, /previewControlsReady/)
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

test('SubjectWorkspace keeps preview controls outside the bare renderer', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  assert.match(source, /class="preview-status-controls"/)
  assert.match(source, /preview-control-group preview-zoom-controls/)
  assert.match(source, /preview-control-group preview-rotation-controls/)
  assert.match(source, /filePreviewRef\?\.zoomIn\(\)/)
  assert.match(source, /preview-zoom-value/)
  assert.match(source, /rotateLeft\(\)/)
  assert.match(source, /rotateRight\(\)/)
  assert.doesNotMatch(source, /:disabled="!previewControlsReady"/)
  assert.match(source, /class="preview-page-footer"/)
  assert.match(source, /filePreviewRef\?\.prevPage\(\)/)
  assert.match(source, /@page-change="handlePreviewPageChange"/)
})

test('SubjectWorkspace keeps files flat and exposes file deletion', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  assert.doesNotMatch(source, /const workspaceFiles = computed/)
  assert.doesNotMatch(source, /summaryMarkdownFor/)
  assert.doesNotMatch(source, /isSummary-file/)
  assert.match(source, /v-for="file in activeSourceFiles"/)
  assert.match(source, /handleDeleteFile\(file\)/)
  assert.match(source, /subjectStore\.deleteSourceFile\(file\.id\)/)
  assert.match(source, /class="drawer-item-delete"/)
  assert.match(source, /ApiProblemError/)
  assert.match(source, /RESOURCE_VERSION_CONFLICT/)
  assert.match(source, /RESOURCE_NOT_FOUND/)
  assert.match(source, /\.drawer-item:hover \.drawer-item-delete[\s\S]*opacity:\s*1;/)
  assert.match(source, /\.drawer-item-delete \{[^}]*opacity:\s*0;/)
  assert.match(source, /el-message-box\.css/)
})

test('SubjectWorkspace file rows omit decorative file type icons', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')

  assert.doesNotMatch(source, /class="drawer-item-icon"/)
  assert.doesNotMatch(source, /const getFileIcon = \(t: string\)/)
})

test('useSourceStore deletes files locally before background sync', () => {
  const storePath = path.resolve('src/store/useSourceStore.ts')
  const source = fs.readFileSync(storePath, 'utf8')
  assert.match(source, /repo\.tombstone\('SOURCE', id, \{ version: source\.version, syncStatus: 'pending' \}\)/)
  assert.match(source, /mutationType: 'DELETE'/)
  assert.match(source, /scheduleSync\(\)/)
  assert.doesNotMatch(source, /await useSourceApi\.delete/)
  assert.match(source, /documentScheduler\?\.discard\(id\)/)
})

test('useSourceStore removes a deleted file from the projection before slow document cleanup', () => {
  const storePath = path.resolve('src/store/useSourceStore.ts')
  const source = fs.readFileSync(storePath, 'utf8')
  const deleteStart = source.indexOf('async function deleteSourceFile')
  const projectionRemove = source.indexOf('sources.value = sources.value.filter', deleteStart)
  const schedulerCleanup = source.indexOf('documentScheduler?.discard(id)', deleteStart)

  assert.ok(projectionRemove > deleteStart, 'deletion must remove the file from the current projection')
  assert.ok(schedulerCleanup > projectionRemove, 'slow parser/cache cleanup must not delay the deleted file leaving the UI')
  assert.doesNotMatch(source.slice(projectionRemove, schedulerCleanup), /await\s+documentScheduler\?\.discard/)
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
