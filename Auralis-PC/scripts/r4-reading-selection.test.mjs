import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'
import { t } from '../src/i18n.ts'
import { messages } from '../src/views/SubjectWorkspace/workspaceMessages.ts'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

test('selection actions support explain, ask and saving a bounded knowledge block', async () => {
  const preview = await source('src/components/FilePreview.vue')
  assert.match(preview, /text-selected/)
  assert.match(preview, /slice\(0, 4000\)/)
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /explainSelection/)
  assert.match(workspace, /askSelection/)
  assert.match(workspace, /saveSelection/)
  assert.match(workspace, /selectionText: selectedText\.value/)
  const editor = await source('src/components/knowledge/KnowledgeBlockEditor.vue')
  assert.match(editor, /emit\('save'/)
})

test('Chat message text can be quoted into the next question or prefilled into the subject knowledge editor', async () => {
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /class="chat-message-text-selection"/)
  assert.match(workspace, /@mouseup="updateSelectionPosition\('chat'\)"/)
  assert.match(workspace, /selectionScope === 'chat' \? messages\.addToNextQuestion : messages\.addToQuestion/)
  assert.match(workspace, /quotedSelection\.value = \[quotedSelection\.value, selectedText\.value\].*\.slice\(0, 4000\)/)
  assert.match(workspace, /:initial-content="selectedText"/)
  const saveSelection = workspace.slice(workspace.indexOf('const saveSelection ='), workspace.indexOf('const saveKnowledgeBlock ='))
  const saveKnowledgeBlock = workspace.slice(workspace.indexOf('const saveKnowledgeBlock ='), workspace.indexOf('const createKnowledgeBlock ='))
  assert.doesNotMatch(saveSelection, /selectionScope\.value = null/)
  assert.match(saveKnowledgeBlock, /const isPreviewSelection = selectionScope\.value === 'preview'/)
  assert.match(saveKnowledgeBlock, /const validSourceFileId = isPreviewSelection[\s\S]*?\? \(selectedFileId\.value \|\| undefined\)/)
  assert.match(saveKnowledgeBlock, /subjectId: subjectId\.value,[\s\S]*?source: isPreviewSelection \? selectedFile\.value\?\.name \|\| '选中文本' : t\(messages\.chatSelectionSource\)/)
  assert.match(workspace, /class="floating-selection-bubble"[\s\S]*?Teleport to="body"|Teleport to="body"[\s\S]*?class="selection-actions floating-selection-bubble"/)
})

test('workspace retrieval offers the chosen source scope', async () => {
  const workspaceSource = await source('src/views/SubjectWorkspace/index.vue')
  const workspace = workspaceSource.slice(workspaceSource.indexOf('// ===== AI Chat (Right Panel) ====='))

  assert.ok(workspace.includes("retrievalMode: sourceIds.length ? 'SELECTED_SOURCES' as const : (current ? 'AUTO' as const : 'SUBJECT' as const)"),
    'explicit selections must fall back to AUTO when current READY file exists, or SUBJECT')
  assert.ok(workspace.includes("if (current?.ingestionStatus === 'READY' && !addAiReferenceSourceWithinLimit(selected, current.id)) return"),
    'selecting other files while viewing a file must include the current ready source')
  assert.ok(workspace.includes("retrievalMode: 'AUTO' as const"),
    'the current-file selection must preserve the existing AUTO retrieval mode')
  assert.ok(workspace.includes("retrievalMode: 'SUBJECT' as const"),
    'whole-subject retrieval must be an explicit mode')
  assert.ok(!workspace.includes("retrievalMode: 'NONE'"),
    'no-reference NONE mode must be removed from workspace')
})

test('an opened pending file retains its processing gate and becomes AUTO when READY', async () => {
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  const file = { id: 'pending', subjectId: 'subject-a', ingestionStatus: 'PENDING', name: 'pending.pdf' }
  const scope = { value: 'SUBJECT' }
  const selectedIds = { value: [] }
  const selectedFileId = { value: null }
  const marker = 'const firstFile = activeSourceFiles.value[0]'
  const stopMarker = 'selectedFileId.value = firstFile.id'
  let start = workspace.indexOf(marker)
  let checked = 0
  while (start >= 0) {
    const end = workspace.indexOf(stopMarker, start) + stopMarker.length
    new Function('activeSourceFiles', 'aiReferenceScope', 'selectedAiSourceIds', 'selectedFileId', workspace.slice(start, end))(
      { value: [file] }, scope, selectedIds, selectedFileId,
    )
    assert.equal(scope.value, 'AUTO', 'opening an unready file must retain the existing processing gate')
    assert.deepEqual(selectedIds.value, ['pending'])
    checked++
    start = workspace.indexOf(marker, end)
  }
  assert.equal(checked, 2, 'mount and subject-switch initialization must both be checked')
  const gateStart = workspace.indexOf('const showProcessingRequired =')
  const gateEnd = workspace.indexOf('const showFileMenu', gateStart)
  const gate = new Function('computed', 'aiReferenceScope', 'selectedFileId', 'selectedAiSourceIds', 'activeSourceFiles', 'documentProcessingStore', 'chatStore',
    `${workspace.slice(gateStart, gateEnd)}; return showProcessingRequired`)(
    fn => ({ get value() { return fn() } }), scope, selectedFileId, selectedIds, { value: [file] }, { jobs: [] }, { isLegacySession: false },
  )
  assert.equal(gate.value, true)
  file.ingestionStatus = 'READY'
  assert.equal(gate.value, false)
  assert.equal(scope.value, 'AUTO')
})

test('explicit source selection is capped at the API limit including the current source', async () => {
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /const MAX_AI_REFERENCE_SOURCES = 100/)
  assert.match(workspace, /最多引用 100 份资料（包含当前文件）/)
  assert.match(workspace, /selected\.size >= MAX_AI_REFERENCE_SOURCES/,
    'new sources must be rejected when the selected set already includes 100 sources')
  assert.match(workspace, /if \(addAiReferenceSourceWithinLimit\(selected, newId\)\)/,
    'opening a current source in explicit mode must not append a 101st source')
  assert.match(workspace, /addAiReferenceSourceWithinLimit\(selected, current\.id\)/,
    'the current source automatically added by a file toggle must count toward the limit')
})

test('last-source removal executes the workspace fallback and produces matching request scope', async () => {
  const workspaceSource = await source('src/views/SubjectWorkspace/index.vue')
  const evaluate = (startMarker, endMarker, args, values, variable) => {
    const start = workspaceSource.indexOf(startMarker)
    const end = workspaceSource.indexOf(endMarker, start)
    assert.ok(start >= 0 && end > start, `could not find ${variable} declaration`)
    const declaration = workspaceSource.slice(start, end)
      .replaceAll(' as const', '')
      .replace('(id: string)', '(id)')
    return new Function('t', 'messages', ...args, `${declaration}\nreturn ${variable}`)(t, messages, ...values)
  }
  const readyFiles = [
    { id: 'current', subjectId: 'subject-a', ingestionStatus: 'READY', name: 'current.md' },
    { id: 'last-selected', subjectId: 'subject-a', ingestionStatus: 'READY', name: 'selected.md' },
    { id: 'foreign', subjectId: 'subject-b', ingestionStatus: 'READY', name: 'foreign.md' },
  ]
  const toggle = (fileList, selectedRef, currentFileId, scopeRef) => evaluate(
    'const toggleAiSource =',
    'const selectCurrentAiSource =',
    ['activeSourceFiles', 'selectedAiSourceIds', 'selectedFileId', 'aiReferenceScope', 'addAiReferenceSourceWithinLimit', 'selectCurrentAiSource'],
    [
      { value: fileList },
      selectedRef,
      { value: currentFileId },
      scopeRef,
      (ids, id) => (ids.add(id), true),
      () => {},
    ],
    'toggleAiSource',
  )
  const options = (fileList, selected, currentFileId, scope, subject) => evaluate(
    'const aiChatReferenceOptions =',
    'const aiSourceSummaryText =',
    ['activeSourceFiles', 'selectedAiSourceIds', 'selectedFileId', 'aiReferenceScope', 'subjectId', 'chatStore'],
    [{ value: fileList }, { value: selected }, { value: currentFileId }, { value: scope }, { value: subject }, { isLegacySession: false }],
    'aiChatReferenceOptions',
  )
  const summary = (selected, currentFile, scope, fileList) => evaluate(
    'const aiSourceSummaryText =',
    'const aiSourceSummaryTitle =',
    ['computed', 'aiReferenceScope', 'selectedFile', 'selectedAiSourceIds', 'activeSourceFiles', 'chatStore'],
    [fn => ({ value: fn() }), { value: scope }, { value: currentFile }, { value: selected }, { value: fileList }, { isLegacySession: false }],
    'aiSourceSummaryText.value',
  )

  const withCurrent = { ids: { value: ['current', 'last-selected'] }, scope: { value: 'SELECTED_SOURCES' }, current: { value: 'current' } }
  toggle(readyFiles, withCurrent.ids, withCurrent.current.value, withCurrent.scope)('last-selected')
  assert.equal(withCurrent.scope.value, 'AUTO')
  assert.deepEqual(options(readyFiles, withCurrent.ids.value, withCurrent.current.value, withCurrent.scope.value, 'subject-a')(), {
    subjectId: 'subject-a', sourceId: 'current', retrievalMode: 'AUTO',
  })
  assert.equal(summary(withCurrent.ids.value, { name: 'current.md' }, withCurrent.scope.value, readyFiles), 'current.md')

  const withoutCurrent = { ids: { value: ['last-selected'] }, scope: { value: 'SELECTED_SOURCES' }, current: { value: null } }
  toggle(readyFiles, withoutCurrent.ids, withoutCurrent.current.value, withoutCurrent.scope)('last-selected')
  assert.equal(withoutCurrent.scope.value, 'SUBJECT')
  assert.deepEqual(options(readyFiles, withoutCurrent.ids.value, withoutCurrent.current.value, withoutCurrent.scope.value, 'subject-a')(), {
    subjectId: 'subject-a', retrievalMode: 'SUBJECT',
  })
  assert.equal(summary(withoutCurrent.ids.value, null, withoutCurrent.scope.value, readyFiles), '全学科资料')

  const pendingFiles = readyFiles.map(file => file.id === 'current' ? { ...file, ingestionStatus: 'PENDING' } : file)
  const withPending = { ids: { value: ['last-selected'] }, scope: { value: 'SELECTED_SOURCES' }, current: { value: 'current' } }
  toggle(pendingFiles, withPending.ids, withPending.current.value, withPending.scope)('last-selected')
  assert.equal(withPending.scope.value, 'AUTO', 'removing the last selected READY source must return to the opened pending file')
  assert.deepEqual(withPending.ids.value, ['current'])
  const gate = evaluate(
    'const showProcessingRequired =', 'const showFileMenu',
    ['computed', 'aiReferenceScope', 'selectedFileId', 'selectedAiSourceIds', 'activeSourceFiles', 'documentProcessingStore', 'chatStore'],
    [fn => ({ get value() { return fn() } }), withPending.scope, withPending.current, withPending.ids, { value: pendingFiles }, { jobs: [] }, { isLegacySession: false }],
    'showProcessingRequired',
  )
  assert.equal(gate.value, true, 'the pending current-file processing gate must remain active')
  pendingFiles[0].ingestionStatus = 'READY'
  assert.equal(gate.value, false)
  assert.deepEqual(options(pendingFiles, withPending.ids.value, withPending.current.value, withPending.scope.value, 'subject-a')(), {
    subjectId: 'subject-a', sourceId: 'current', retrievalMode: 'AUTO',
  })

  const scoped = options(readyFiles, ['last-selected', 'foreign'], null, 'SELECTED_SOURCES', 'subject-a')()
  assert.deepEqual(scoped, {
    subjectId: 'subject-a', sourceIds: ['last-selected'], sourceId: undefined, retrievalMode: 'SELECTED_SOURCES',
  }, 'request context must exclude a source from a different subject')

  assert.doesNotMatch(workspaceSource, /不引用资料/)
  assert.doesNotMatch(workspaceSource, /selectNoAiSources/)
  assert.doesNotMatch(workspaceSource, /'NONE'/)
})

test('whole-subject indicators include only READY sources from the current subject', async () => {
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  const files = [
    { id: 'ready', subjectId: 'subject-a', ingestionStatus: 'READY', name: 'ready.pdf' },
    { id: 'pending', subjectId: 'subject-a', ingestionStatus: 'PENDING', name: 'pending.pdf' },
    { id: 'failed', subjectId: 'subject-a', ingestionStatus: 'FAILED', name: 'failed.pdf' },
    { id: 'foreign', subjectId: 'subject-b', ingestionStatus: 'READY', name: 'foreign.pdf' },
  ]
  const evaluate = (startMarker, endMarker, variable) => {
    const start = workspace.indexOf(startMarker)
    const end = workspace.indexOf(endMarker, start)
    assert.ok(start >= 0 && end > start)
    const declaration = workspace.slice(start, end).replace('(id: string)', '(id)')
    return new Function('t', 'messages', 'computed', 'aiReferenceScope', 'selectedAiSourceIds', 'activeSourceFiles', 'subjectId', 'selectedFile', 'chatStore',
      `${declaration}; return ${variable}`)(
      t, messages, fn => ({ value: fn() }), { value: 'SUBJECT' }, { value: [] }, { value: files }, { value: 'subject-a' }, { value: null }, { isLegacySession: false },
    )
  }
  const selected = evaluate('const isAiSourceSelected =', 'const toggleAiSource =', 'isAiSourceSelected')
  assert.equal(selected('ready'), true)
  for (const id of ['pending', 'failed', 'foreign', 'missing']) assert.equal(selected(id), false, id)
  const title = evaluate('const aiSourceSummaryTitle =', 'const aiGreetingName =', 'aiSourceSummaryTitle.value')
  assert.equal(title, '当前参考：全学科资料 (共 1 份)')
})

test('source list changes remove missing or moved selections and retain pending selections', async () => {
  const workspace = (await source('src/views/SubjectWorkspace/index.vue')).replaceAll('\r\n', '\n')
  const ready = { id: 'ready', subjectId: 'subject-a', ingestionStatus: 'READY', name: 'ready.pdf' }
  const pending = { id: 'pending', subjectId: 'subject-a', ingestionStatus: 'PENDING', name: 'pending.pdf' }
  const foreign = { id: 'moved', subjectId: 'subject-b', ingestionStatus: 'READY', name: 'moved.pdf' }
  const check = (ids, currentId, expectedIds, expectedScope, expectedGate) => {
    const start = workspace.indexOf('watch(\n  [activeSourceFiles, subjectId]')
    const end = workspace.indexOf('const isAllAiSourcesSelected', start)
    assert.ok(start >= 0 && end > start, 'source-list reconciliation watcher must exist')
    const files = { value: [ready, pending, foreign] }
    const selected = { value: ids }
    const current = { value: currentId }
    const scope = { value: 'SELECTED_SOURCES' }
    let reconcile
    new Function('watch', 'activeSourceFiles', 'subjectId', 'selectedAiSourceIds', 'selectedFileId', 'aiReferenceScope', workspace.slice(start, end))(
      (_sources, callback) => { reconcile = callback }, files, { value: 'subject-a' }, selected, current, scope,
    )
    reconcile()
    assert.deepEqual(selected.value, expectedIds)
    assert.equal(scope.value, expectedScope)
    const evaluate = (startMarker, endMarker, variable) => {
      const sectionStart = workspace.indexOf(startMarker)
      const sectionEnd = workspace.indexOf(endMarker, sectionStart)
      const declaration = workspace.slice(sectionStart, sectionEnd).replaceAll(' as const', '')
      return new Function('t', 'messages', 'computed', 'aiReferenceScope', 'selectedAiSourceIds', 'activeSourceFiles', 'subjectId', 'selectedFileId', 'selectedFile', 'documentProcessingStore', 'chatStore',
        `${declaration}; return ${variable}`)(
        t, messages, fn => ({ value: fn() }), scope, selected, files, { value: 'subject-a' }, current,
        { value: files.value.find(file => file.id === currentId) }, { jobs: [] }, { isLegacySession: false },
      )
    }
    assert.equal(evaluate('const showProcessingRequired =', 'const showFileMenu', 'showProcessingRequired.value'), expectedGate)
    if (!expectedGate) {
      const options = evaluate('const aiChatReferenceOptions =', 'const aiSourceSummaryText =', 'aiChatReferenceOptions')()
      assert.equal(options.retrievalMode, expectedScope)
      const label = evaluate('const aiSourceSummaryText =', 'const aiSourceSummaryTitle =', 'aiSourceSummaryText.value')
      assert.equal(label, expectedScope === 'SUBJECT' ? '全学科资料' : 'ready.pdf')
    }
  }
  check(['missing', 'moved', 'ready'], null, ['ready'], 'SELECTED_SOURCES', false)
  check(['missing', 'moved'], null, [], 'SUBJECT', false)
  check(['missing'], 'ready', ['ready'], 'AUTO', false)
  check(['missing'], 'pending', ['pending'], 'AUTO', true)
  check(['missing', 'pending'], null, ['pending'], 'SELECTED_SOURCES', true)
})
