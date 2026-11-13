import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  SUPPORTED_UPLOAD_EXTENSIONS,
  canPreviewFile,
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

test('accepts every parser-supported document format for upload', () => {
  for (const name of ['lesson.pdf', 'lesson.doc', 'lesson.docx', 'slides.ppt', 'slides.pptx']) {
    const capability = validateUploadFile({ name, type: '', size: 10 })
    assert.equal(capability.allowedForUpload, true, `${name} must be uploadable`)
  }
})

test('maps direct preview formats to the shared renderer', () => {
  for (const [name, kind] of [
    ['lesson.pdf', 'pdf'],
    ['diagram.png', 'image'],
    ['notes.md', 'text'],
    ['records.csv', 'csv'],
  ]) {
    const capability = resolveFileCapability({ name, type: '' })
    assert.equal(capability.allowedForUpload, name.endsWith('.pdf'))
    assert.equal(capability.kind, kind)
    assert.equal(capability.renderer, 'file-viewer')
  }
})

test('rejects preview-only image and text formats before creating an upload intent', () => {
  for (const name of ['diagram.png', 'notes.md', 'records.csv']) {
    assert.throws(
      () => validateUploadFile({ name, type: '', size: 10 }),
      /仅支持上传 PDF、DOC、DOCX、PPT、PPTX/,
    )
  }
})

test('FilePreview can render preview-only image, text, and CSV sources', () => {
  for (const [name, type] of [
    ['diagram.png', 'image/png'],
    ['notes.md', 'text/markdown'],
    ['records.csv', 'text/csv'],
  ]) {
    assert.equal(canPreviewFile({ name, type }), true)
  }
})

test('preview source identity ignores a display title while tracking replacement assets', async () => {
  const filePreview = await import('../src/utils/filePreview.ts')
  const getPreviewSourceIdentity = filePreview.getPreviewSourceIdentity
  assert.equal(typeof getPreviewSourceIdentity, 'function', 'Must expose a stable source identity for preview reloads')

  const original = { id: 'source-1', assetId: 'asset-1', fileType: 'application/pdf', name: 'Before.pdf' }
  assert.equal(
    getPreviewSourceIdentity(original),
    getPreviewSourceIdentity({ ...original, name: 'After' }),
    'Removing the title extension must not fetch the same asset again',
  )
  assert.notEqual(
    getPreviewSourceIdentity(original),
    getPreviewSourceIdentity({ ...original, assetId: 'asset-2' }),
    'Replacing the underlying asset must reload the preview',
  )
  assert.equal(
    getPreviewSourceIdentity(original),
    getPreviewSourceIdentity({ ...original, name: 'Before.docx' }),
    'The extension in a display title does not change the underlying file format',
  )

  const component = fs.readFileSync(path.resolve('src/components/FilePreview.vue'), 'utf8')
  const watchedSources = component.match(/watch\(\s*\[([\s\S]*?)\]\s*,\s*\(\) => \{ void loadPreview\(\) \}/)?.[1]
  assert.ok(watchedSources, 'FilePreview must watch a source identity for reloads')
  assert.match(watchedSources, /getPreviewSourceIdentity/)
  assert.doesNotMatch(watchedSources, /props\.file\.name/)
})

test('keeps PowerPoint compatible with the Office renderer', () => {
  assert.equal(resolveFileCapability({ name: 'slides.pptx', type: '' }).kind, 'office')
  assert.equal(resolveFileCapability({ name: 'slides.ppt', type: '' }).kind, 'office')
})

test('rejects unknown extensions before upload intent', () => {
  assert.throws(
    () => validateUploadFile({ name: 'payload.bin', type: 'application/octet-stream', size: 10 }),
    /仅支持上传 PDF、DOC、DOCX、PPT、PPTX/,
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
  ])
  assert.equal(SUPPORTED_UPLOAD_EXTENSIONS.includes('.xls'), false)
  assert.equal(SUPPORTED_UPLOAD_EXTENSIONS.includes('.xlsx'), false)
})

test('FilePreview owns the shared loading and signed-url lifecycle', () => {
  const filePreviewPath = path.resolve('src/components/FilePreview.vue')
  const source = fs.readFileSync(filePreviewPath, 'utf8')
  assert.match(source, /FileViewerRenderer/)
  assert.match(source, /downloadAssetInfo/)
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
  gate.invalidate()
  assert.equal(gate.isCurrent(second), false)
})

test('FilePreview aborts superseded binary downloads before starting another renderer load', () => {
  const filePreviewPath = path.resolve('src/components/FilePreview.vue')
  const source = fs.readFileSync(filePreviewPath, 'utf8')

  assert.match(source, /AbortController/)
  assert.match(source, /\.abort\(\)/)
  assert.match(source, /fetch\(url, \{ signal:/)
  assert.match(source, /setTimeout/)
})

test('FilePreview resolves owner-scoped local bytes before signed-url fallback and revokes temporary download URLs', () => {
  const filePreviewPath = path.resolve('src/components/FilePreview.vue')
  const source = fs.readFileSync(filePreviewPath, 'utf8')

  assert.match(source, /assetStore\.resolveLocalFile\(assetId\)/)
  assert.match(source, /URL\.createObjectURL\(localFile\)/)
  assert.match(source, /URL\.revokeObjectURL\(/)
  assert.match(source, /activeLocalCleanup/)
  assert.match(source, /onUnmounted\(\(\) => \{[\s\S]*previewRequests\.invalidate\(\)[\s\S]*activePreviewAbort\?\.abort\(\)[\s\S]*cleanupActiveInput\(\)/)
  assert.match(source, /\(\) => authStore\.user\?\.id/)
  assert.match(source, /\(\) => authStore\.serverDeviceId/)
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
  assert.match(source, /await repo\.commitMutation\(/)
  assert.match(source, /mutationType: 'DELETE'/)
  assert.match(source, /scheduleSync\(\)/)
  assert.doesNotMatch(source, /await useSourceApi\.delete/)
  assert.match(source, /documentScheduler\?\.discard\(row\.id\)/)
})

test('useSourceStore removes a deleted file from the projection only after durable tombstone commit', () => {
  const storePath = path.resolve('src/store/useSourceStore.ts')
  const source = fs.readFileSync(storePath, 'utf8')
  const deleteStart = source.indexOf('async function deleteSourceFile')
  const deletionTicket = source.indexOf("beginOverviewScopeDeletion(userId,serverDeviceId,'FILE',id)", deleteStart)
  const firstAwait = source.indexOf('await ', deleteStart)
  const tombstoneCommitted = source.indexOf('tombstoneCommitted = true', deleteStart)
  const projectionRemove = source.indexOf('sources.value = sources.value.filter', deleteStart)
  const cleanupCall = source.indexOf('await cleanupDeletedSourceAssets().catch', deleteStart)

  assert.ok(deletionTicket > deleteStart && deletionTicket < firstAwait, 'the deletion fence must start before the first await')
  assert.ok(tombstoneCommitted > firstAwait && projectionRemove > tombstoneCommitted,
    'the file must remain visible until its durable Source tombstone commits')
  assert.ok(cleanupCall > projectionRemove, 'slow document/cache cleanup must follow the committed deletion projection')
  const cleanupStart = source.indexOf('async function cleanupDeletedSourceAssets')
  const cleanupEnd = source.indexOf('\n  async function loadSources', cleanupStart)
  const cleanup = source.slice(cleanupStart, cleanupEnd)
  assert.match(cleanup, /fileOverviewGenerator\?\.discardFileOverview\(row\.id\)/)
  assert.match(cleanup, /documentScheduler\?\.discard\(row\.id\)/)
})

test('useSourceStore fences first, commits the Source tombstone, then removes the projection and cleans local consumers', () => {
  const storePath = path.resolve('src/store/useSourceStore.ts')
  const source = fs.readFileSync(storePath, 'utf8')
  const deleteStart = source.indexOf('async function deleteSourceFile')
  const deletionTicket = source.indexOf("beginOverviewScopeDeletion(userId,serverDeviceId,'FILE',id)", deleteStart)
  const firstAwait = source.indexOf('await ', deleteStart)
  const tombstoneCommitted = source.indexOf('tombstoneCommitted = true', deleteStart)
  const projectionRemove = source.indexOf('sources.value = sources.value.filter', deleteStart)
  const sync = source.indexOf('scheduleSync()', deleteStart)
  const cleanupCall = source.indexOf('await cleanupDeletedSourceAssets().catch', deleteStart)
  const deleteEnd = source.indexOf('\n  async function saveSourceFileCatalog', deleteStart)

  const tombstone = source.indexOf("mutationType: 'DELETE'", deleteStart)

  assert.ok(deletionTicket > deleteStart && deletionTicket < firstAwait, 'delete lifecycle fence must precede all asynchronous work')
  assert.ok(tombstone > firstAwait && tombstoneCommitted > tombstone, 'the durable mutation must complete before cleanup')
  assert.ok(projectionRemove > tombstoneCommitted, 'visible rows are removed only after durable commit')
  assert.ok(sync > tombstoneCommitted && cleanupCall > tombstoneCommitted,
    'sync and irreversible local cleanup must follow durable commit')
  assert.doesNotMatch(source.slice(deleteStart, deleteEnd), /console\.warn\([^\n]*,\s*error\)/)
})

test('SubjectWorkspace fallback cannot generate file Overviews without the runtime gate', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  const fallback = source.slice(source.indexOf('new OverviewGenerationService({'))
  assert.match(fallback, /isFileGenerationEligible:\s*async\s*\(\)\s*=>\s*false/)
  assert.match(fallback, /getLocalFileGenerationRevision:\s*async\s*\(\)\s*=>\s*null/)
})

test('SubjectWorkspace promotes a subject-only fallback when the matching runtime starts later', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  const ensureStart = source.indexOf('const ensureOverviewRuntime')
  const ensureSource = source.slice(ensureStart, ensureStart + 1800)
  assert.match(ensureSource, /runtime\?\.userId === userId && runtime\.serverDeviceId === serverDeviceId/)
  assert.match(ensureSource, /const matchingRuntime = runtime\?\.userId === userId && runtime\.serverDeviceId === serverDeviceId/)
  assert.match(ensureSource, /if \(overviewGeneration !== matchingRuntime\.overviewGeneration\) overviewGeneration = matchingRuntime\.overviewGeneration/)
})

test('SubjectWorkspace renders files directly and can replace the middle preview with a local AI summary', () => {
  const workspacePath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const source = fs.readFileSync(workspacePath, 'utf8')
  const previewSource = fs.readFileSync(path.resolve('src/components/FilePreview.vue'), 'utf8')
  assert.match(source, /centerView === 'preview'/)
  assert.match(source, /:bare="true"/)
  assert.match(previewSource, /<header v-if="!bare" class="file-preview-header">/)
  assert.match(source, /centerView = 'blocks'/)
  assert.match(source, /centerView === 'summary'/)
  assert.match(source, /OverviewSummaryView/)
  assert.doesNotMatch(source, /Markdown 文件/)
})

test('PdfViewer component does not exist', () => {
  const pdfViewerPath = path.resolve('src/components/subject/PdfViewer.vue')
  assert.equal(fs.existsSync(pdfViewerPath), false, 'PdfViewer.vue must be deleted')
})

test('Dashboard has no legacy PDF companion references', () => {
  const dashboardPath = path.resolve('src/views/Dashboard/index.vue')
  const dashboardSource = fs.readFileSync(dashboardPath, 'utf8')
  assert.doesNotMatch(dashboardSource, /PdfViewer/)
  assert.doesNotMatch(dashboardSource, /activeTab/)
  assert.doesNotMatch(dashboardSource, /openPdfCompanion/)
  assert.doesNotMatch(dashboardSource, /PDF伴读/)
  assert.doesNotMatch(dashboardSource, /pdf-tab/)
})

test('unused Home and Settings views are removed', () => {
  assert.equal(fs.existsSync(path.resolve('src/views/Home/index.vue')), false)
  assert.equal(fs.existsSync(path.resolve('src/views/Settings/index.vue')), false)
})

test('Asset view uses FilePreview with assetId and fileType and removes legacy preview branches', () => {
  const assetPath = path.resolve('src/views/Asset/index.vue')
  const assetSource = fs.readFileSync(assetPath, 'utf8')
  assert.doesNotMatch(assetSource, /PdfViewer/)
  assert.doesNotMatch(assetSource, /selected\.filePath/)
  assert.doesNotMatch(assetSource, /filePath:/)
  assert.doesNotMatch(assetSource, /selected\.markdown/)
  assert.doesNotMatch(assetSource, /markdown-preview/)
  assert.match(assetSource, /import FilePreview from ['"]@\/components\/FilePreview\.vue['"]/)
  assert.match(assetSource, /selectedPreviewFile/)
  assert.match(assetSource, /<FilePreview[^>]*:file="selectedPreviewFile"[^>]*:bare="true"/)
  assert.match(assetSource, /assetId/)
  assert.match(assetSource, /fileType/)
})

test('components declaration has no PdfViewer entry', () => {
  const dtsPath = path.resolve('components.d.ts')
  const dtsSource = fs.readFileSync(dtsPath, 'utf8')
  assert.doesNotMatch(dtsSource, /PdfViewer/)
})
