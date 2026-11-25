import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import { shouldAdoptGeneratedOutline } from '../src/services/outlineIdentity.ts'

const root = path.resolve(import.meta.dirname, '..')
const read = file => readFile(path.join(root, file), 'utf8')

test('overview presentation components remain local and side-effect free', async () => {
  for (const file of ['SubjectOverviewSection.vue', 'FileOutlineList.vue', 'OverviewSummaryView.vue']) {
    const source = await read(`src/components/subject/${file}`)
    assert.doesNotMatch(source, /fetch\(|axios|localStorage|sessionStorage|useSourceStore|useSubjectStore/)
  }
})

test('subject overview is default-collapsed and generated only from an emitted action', async () => {
  const source = await read('src/components/subject/SubjectOverviewSection.vue')
  assert.match(source, /collapsed:\s*true/)
  assert.match(source, />学科总览</)
  assert.match(source, /emit\('generate'\)/)
  assert.match(source, /当前内容仍可查看/)
})

test('subject overview exposes a separate outline regeneration action and compares stale state even with no usable files', async () => {
  const component = await read('src/components/subject/SubjectOverviewSection.vue')
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(component, /重新生成大纲/)
  assert.match(component, /generate-outline/)
  assert.match(workspace, /overviewGeneration\.regenerateSubjectOverview\(launchSubjectId, 'OUTLINE'\)/)
  assert.doesNotMatch(workspace, /subjectOverviewRecord\.value\.inputFingerprint\)\s*\)/)
  assert.doesNotMatch(workspace, /subjectOverviewRecord\.value\?\.inputFingerprint\s*&&\s*usable\.length/)
})

test('file outlines render inline with summary and regeneration entry points', async () => {
  const source = await read('src/components/subject/FileOutlineList.vue')
  assert.match(source, /file\.outline/)
  assert.match(source, /select-summary/)
  assert.match(source, /重新生成大纲/)
  assert.match(source, /重新生成全部/)
  assert.match(source, /renderMarkdown\(file\.outlineMarkdown\)/)
  assert.doesNotMatch(source, /outline-subtabs|tab-bar/)
})

test('middle summary view preserves old content during regeneration or error', async () => {
  const source = await read('src/components/subject/OverviewSummaryView.vue')
  assert.doesNotMatch(source, /正在生成新版本，当前总结继续保留/)
  assert.match(source, /error/)
  assert.match(source, /当前内容仍可查看/)
  assert.match(source, /renderMarkdown\(summaryMarkdown\)/)
  assert.doesNotMatch(source, /调整要求/)
})

test('automatic subject-local conflict resolution claims its authenticated scope before runtime refresh can re-enter', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  const start = workspace.indexOf('const resolveOverviewSyncConflict =')
  const end = workspace.indexOf('\nconst resolveSubjectOverviewConflict', start)
  assert.ok(start >= 0 && end > start)
  const resolver = workspace.slice(start, end)
  const resolverBody = resolver.indexOf('const resolve = async () => {')
  const guardCondition = resolver.indexOf("if (scopeType === 'SUBJECT' && choice === 'LOCAL' && silent)")
  const guard = resolver.indexOf('return runOverviewConflictResolutionOnce(key, resolve)')
  const direct = resolver.indexOf('return resolve()', guardCondition)
  const ensure = resolver.indexOf('await ensureOverviewRuntime()')
  assert.ok(resolverBody >= 0 && ensure > resolverBody && guardCondition > ensure && guard > guardCondition,
    'only the automatic SUBJECT/LOCAL path must pass its resolver callback through the in-flight guard')
  assert.ok(direct > guard, 'other choices and FILE scopes must execute the original resolver body directly')
  assert.match(resolver, /JSON\.stringify\(\[userId, serverDeviceId, scopeType, scopeId, revisionKey\]\)/)
  assert.match(resolver, /isComponentMounted && authStore\.isAuthenticated/)
  assert.match(resolver, /authStore\.user\?\.id === userId/)
  assert.match(resolver, /capturedRepository\.isScopeFenceTokenCurrent\(capturedFenceToken\)/)
  assert.match(resolver, /activeSourceFiles\.value\.some\(file => file\.id === scopeId && file\.ingestionRevision === revisionKey\)/)
  assert.match(resolver, /if \(options\.isCurrent\(\)\) await refreshOverviewCache\(\)/)
})

test('SubjectWorkspace integrates overview UI with outline composer and unified overview cards', async () => {
  const source = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(source, /<h3 class="drawer-title">\{\{ t\(messages\.overview\) \}\}<\/h3>/)
  assert.doesNotMatch(source, /<button class="outline-ai-button"[^>]*>AI 梳理<\/button>/)
  assert.match(source, /<button[\s\S]*?class="outline-add-button"[\s\S]*?:class="\{\s*'is-active':\s*isOutlineComposer\s*\}"/)
  assert.match(source, /<SubjectOverviewSection/)
  assert.match(source, /<FileOutlineList/)
  assert.match(source, /<OverviewSummaryView/)
  assert.match(source, /centerView === 'summary'/)
  assert.match(source, /overviewGeneration\.regenerateSubjectOverview\(launchSubjectId, 'ALL'\)/)
})

test('manual overview handlers branch on structured results and refresh only after success', async () => {
  const source = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(source, /result\.status/)
  assert.match(source, /SOURCE_NOT_READY|SOURCE_NOT_ELIGIBLE/)
  assert.match(source, /REVISION_MISMATCH/)
  assert.match(source, /NO_USABLE_INPUT/)
  assert.match(source, /文件尚未处理完成/)
  assert.match(source, /文件版本已变化，请刷新后重试/)
  assert.match(source, /没有可用于生成的内容/)
  assert.match(source, /生成失败，请重试/)
  assert.match(source, /result\.status\s*===\s*['"]STARTED['"]/)
  assert.match(source, /已更新/)
  assert.match(source, /if\s*\(applyManualOverviewResult\(result/)
})

test('file outline preserves old content with an actionable retry message', async () => {
  const source = await read('src/components/subject/FileOutlineList.vue')
  assert.match(source, /当前内容仍可查看/)
  assert.match(source, /file\.error\s*&&\s*\(file\.outlineMarkdown\s*\|\|\s*file\.summaryMarkdown\)/)
  assert.match(source, /重新生成/)
})

test('generation edit conflicts appear only with a persisted candidate and expose explicit safe Keep/Use actions', async () => {
  const file = await read('src/components/subject/FileOutlineList.vue')
  const subject = await read('src/components/subject/SubjectOverviewSection.vue')
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(file, /v-for="conflict in file\.generationConflicts \?\? \[\]"/)
  assert.match(subject, /v-for="conflict in overview\?\.generationConflicts \?\? \[\]"/)
  for (const source of [file, subject]) {
    assert.match(source, /保留我的修改/)
    assert.match(source, /使用AI结果/)
    assert.match(source, /conflict\.result\.summaryMarkdown/)
    assert.doesNotMatch(source, /v-html="(?!renderMarkdown\()/)
  }
  assert.match(workspace, /const resolveGenerationEditConflict = async \(scopeType:/)
  assert.match(workspace, /capturedRepository\.isScopeFenceTokenCurrent\(capturedFenceToken\)/)
  assert.match(workspace, /currentSubjectSwitchGen === capturedSwitchGeneration/)
  assert.match(workspace, /capturedRepository\.resolveGenerationEditConflict\(clientWriteId,choice,isCurrent,validateInputs\)/)
})

test('SubjectWorkspace keeps chat failures in the chat region and retries the pending message', async () => {
  const source = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(source, /class="ai-messages"[\s\S]*role="alert"/)
  assert.match(source, /chatStore\.lastError/)
  assert.match(source, /chatStore\.retryPendingMessage\(pending\.id\)/)
  assert.match(source, /@click="retryChat"/)
  assert.match(source, /<template v-if="msg\.status !== 'FAILED'">[\s\S]*?<ChatContentRenderer/)
  assert.match(source, /msg\.status === 'FAILED' \? t\(messages\.generationFailed\) : t\(messages\.partialReply\)/)
  assert.match(source, /class="chat-retry-reply-btn" @click="handleRetryAssistantMessage\(msg\.id\)"/)
})

test('file overview failures expose direct retry actions with classified copy', async () => {
  const fileOutlineSource = await read('src/components/subject/FileOutlineList.vue')
  const summaryViewSource = await read('src/components/subject/OverviewSummaryView.vue')
  const workspaceSource = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(fileOutlineSource, />重新生成</)
  assert.match(fileOutlineSource, /emit\('regenerate'/)
  assert.match(fileOutlineSource, /summaryMarkdown\s*\?\s*['"]OUTLINE['"]\s*:\s*['"]ALL['"]/)
  assert.match(summaryViewSource, />重新生成</)
  assert.match(summaryViewSource, /emit\('regenerate'/)
  assert.match(summaryViewSource, /summary-notice--error[\s\S]*重新生成/)
  assert.match(workspaceSource, /overviewFailureMessage\(record\?\.errorCode\)/)
  assert.doesNotMatch(workspaceSource, /setTimeout\([^)]*regenerateFileOverview/)
})

test('file overview failure notice and retry buttons enforce mutual exclusion and disabled state', async () => {
  const source = await read('src/components/subject/FileOutlineList.vue')
  assert.match(source, /v-if="file\.error\s*&&\s*\(file\.outlineMarkdown\s*\|\|\s*file\.summaryMarkdown\)"/)
  assert.doesNotMatch(source, /<p\s+v-if="file\.error"\s+class="file-outline__notice"/)

  const retryButtons = [...source.matchAll(/<button\b[\s\S]*?>/g)]
    .map(([button]) => button)
    .filter((button) => button.includes('class="file-outline__retry"') && button.includes("emit('regenerate'"))
  assert.equal(retryButtons.length, 2)
  for (const button of retryButtons) {
    assert.match(button, /:disabled="file\.isGenerating"/)
  }
  const conflictButtons = [...source.matchAll(/<button\b[\s\S]*?>/g)]
    .map(([button]) => button)
    .filter((button) => button.includes('class="file-outline__retry"') && button.includes("emit('resolve-sync-conflict'"))
  assert.equal(conflictButtons.length, 2)
  assert.match(conflictButtons[0], /choice:\s*'LOCAL'/)
  assert.match(conflictButtons[1], /choice:\s*'REMOTE'/)
  assert.match(source, /\.file-outline__retry:disabled/)
})

test('overview summary view guarantees exactly one retry action on failure and disables during generation', async () => {
  const source = await read('src/components/subject/OverviewSummaryView.vue')
  assert.match(source, /<button\s+v-if="!error"[\s\S]*?:disabled="isGenerating"[\s\S]*?@click="emit\('regenerate'\)"[\s\S]*?>[\s\S]*?重新生成<\/button>/)
  assert.match(source, /summary-notice--error[\s\S]*?<button[\s\S]*?class="summary-notice__retry"[\s\S]*?:disabled="isGenerating"[\s\S]*?@click="emit\('regenerate'\)"[\s\S]*?>重新生成<\/button>/)
  assert.doesNotMatch(source, /summary-empty__retry/)
  assert.doesNotMatch(source, /class="summary-empty"[\s\S]*?重新生成/)
})

test('Markdown composer isolates drafts on subject switch and refuses blank edits', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /v-model="subjectOutlineDraft"/)
  assert.match(workspace, /subjectOutlineDraft\.value = ''/)
  assert.match(workspace, /const submittedDraft = subjectOutlineDraft\.value\s+const outlineMarkdown = submittedDraft\.trim\(\)/)
  assert.match(workspace, /subjectId\.value === targetSubjectId && subjectOutlineSave\.value === save/)
})

async function createOutlineComposer(repository) {
  const source = await read('src/views/SubjectWorkspace/index.vue')
  const { descriptor } = parse(source)
  const script = descriptor.scriptSetup.content
  const between = (start, end) => script.slice(script.indexOf(start), script.indexOf(end))
  const subjectId = ref('subject')
  const activeSourceFiles = ref([{ id: 'file', subjectId: 'subject', name: 'File', ingestionStatus: 'READY', ingestionRevision: 'rev-1' }])
  const subjectOverviewRecord = ref(null)
  const fileOverviewRecords = ref({})
  const messages = []
  const context = {
    ref, computed, watch, subjectId, activeSourceFiles, subjectOverviewRecord, fileOverviewRecords,
    isSubjectOverviewStale: ref(false),
    authStore: reactive({ user: { id: repository.userId }, serverDeviceId: repository.serverDeviceId, loginGeneration: Symbol() }),
    fileOverviewManualErrors: ref({}), resolvingGenerationConflicts: ref(new Set()), generatingFileIds: ref(new Set()),
    ElMessage: { success: message => messages.push(message), warning: message => messages.push(message) },
    overviewRepository: repository, shouldAdoptGeneratedOutline, hasUsableOverview: () => true,
  }
  const execute = new Function(...Object.keys(context), ts.transpileModule(`
    const isComponentMounted = true
    ${between('const getFileOverviewRecord', 'const summaryTarget')}
    ${between('let overviewCacheRefreshGeneration', 'const ensureOverviewRuntime')}
    ${between('const isOutlineComposer', 'const handleOutlineAi')}
    return {
      isOutlineComposer, subjectOutlineDraft, subjectOutlineHasUnsavedChanges, saveCurrentOutline,
      fileOverviewItems, fileOutlineDrafts, fileOutlineDraftHasUnsavedChanges, saveFileOutline,
      initFileOutlineDraft, refreshOverviewCache,
    }
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)
  const scope = effectScope()
  return {
    ...context, messages, stop: () => scope.stop(),
    ...scope.run(() => execute(...Object.values(context))),
  }
}

test('the file composer preserves an older draft without using it as the current revision outline', async (t) => {
  const previous = { sourceId: 'file', ingestionRevision: 'rev-1', title: 'Old title', outlineMarkdown: 'Old outline', summaryMarkdown: 'Old summary' }
  const writes = []
  const ui = await createOutlineComposer({
    userId: 'user', serverDeviceId: 'device',
    async getFileOverview(_id, revision) { return revision === 'rev-1' ? previous : null },
    async getLatestFileOverview() { return previous },
    async getSubjectOverview() { return null },
    async saveFileOverviewPart(input) {
      assert.equal(input.isStillCurrent(), true)
      writes.push(input)
      return { sourceId: input.sourceId, ingestionRevision: input.ingestionRevision, outlineGeneratedAt: 'saved', ...input.response }
    },
  })
  t.after(ui.stop)
  await ui.refreshOverviewCache()
  ui.isOutlineComposer.value = true
  await nextTick()
  assert.equal(ui.fileOutlineDrafts.value.file, 'Old outline')
  ui.fileOutlineDrafts.value.file = 'Unsaved outline'

  ui.activeSourceFiles.value = [{ ...ui.activeSourceFiles.value[0], ingestionRevision: 'rev-2' }]
  assert.equal(ui.fileOverviewItems.value[0].outlineMarkdown, null)
  await nextTick()
  await ui.refreshOverviewCache()
  assert.equal(ui.fileOverviewItems.value[0].status, 'PENDING')
  assert.equal(ui.fileOutlineDrafts.value.file, 'Unsaved outline')
  await ui.saveFileOutline('file')
  assert.equal(writes.length, 0)

  ui.initFileOutlineDraft(ui.activeSourceFiles.value[0], true)
  assert.equal(ui.fileOutlineDrafts.value.file, '')
  ui.fileOutlineDrafts.value.file = 'New outline'
  await ui.saveFileOutline('file')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].ingestionRevision, 'rev-2')
  assert.equal(writes[0].response.title, 'File')
  assert.equal(writes[0].response.summaryMarkdown, null)
})

test('an early cache update and save acknowledgement preserve later input in both composers', async (t) => {
  const records = {
    file: { sourceId: 'file', ingestionRevision: 'rev-1', outlineMarkdown: 'Original' },
    subject: { subjectId: 'subject', outlineMarkdown: 'Original' },
  }
  const pending = { file: Promise.withResolvers(), subject: Promise.withResolvers() }
  const writes = {}
  const ui = await createOutlineComposer({
    userId: 'user', serverDeviceId: 'device',
    async getFileOverview() { return records.file },
    async getSubjectOverview() { return records.subject },
    async saveFileOverviewPart(input) { writes.file = input; return pending.file.promise },
    async saveSubjectOverviewPart(input) { writes.subject = input; return pending.subject.promise },
  })
  t.after(ui.stop)
  await ui.refreshOverviewCache()
  ui.isOutlineComposer.value = true
  await nextTick()

  ui.fileOutlineDrafts.value.file = '  Submitted  '
  ui.subjectOutlineDraft.value = '  Submitted  '
  const saving = Promise.all([ui.saveFileOutline('file'), ui.saveCurrentOutline()])
  ui.fileOutlineDrafts.value.file = 'Original'
  ui.subjectOutlineDraft.value = 'Original'

  for (const key of ['file', 'subject']) {
    assert.equal(writes[key].response.outlineMarkdown, 'Submitted')
    records[key] = { ...records[key], ...writes[key].response, outlineGeneratedAt: 'saved' }
  }
  await ui.refreshOverviewCache()
  await nextTick()
  assert.equal(ui.fileOutlineDrafts.value.file, 'Original')
  assert.equal(ui.subjectOutlineDraft.value, 'Original')
  for (const key of ['file', 'subject']) pending[key].resolve(records[key])
  await saving
  assert.equal(ui.fileOutlineDraftHasUnsavedChanges('file'), true)
  assert.equal(ui.subjectOutlineHasUnsavedChanges(), true)

  for (const key of ['file', 'subject']) records[key] = { ...records[key], outlineMarkdown: 'Generated', outlineGeneratedAt: 'generated' }
  await ui.refreshOverviewCache()
  await nextTick()
  assert.equal(ui.fileOutlineDrafts.value.file, 'Original')
  assert.equal(ui.subjectOutlineDraft.value, 'Original')
})

test('subject switch synchronously clears selectedFileId and chat guards against cross-subject file IDs', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /watch\(subjectId,\s*async\s*\(newId\)\s*=>\s*\{[\s\S]*?selectedFileId\.value\s*=\s*null[\s\S]*?startFreshChatSession\(\)/)
  assert.ok(workspace.includes("file.id === selectedFileId.value && file.subjectId === subjectId.value && file.ingestionStatus === 'READY'"),
    'current-file chat context must be limited to a READY source in the active subject')
  assert.ok(workspace.includes("file.id === id && file.subjectId === subjectId.value && file.ingestionStatus === 'READY'"),
    'explicit source IDs must be filtered to READY sources in the active subject')
  assert.match(workspace, /sourceStore\.clearActiveSourceFiles\(\)/)
  assert.match(workspace, /currentSubjectSwitchGen\s*!==\s*switchGen\s*\|\|\s*subjectId\.value\s*!==\s*newId/)
  assert.match(workspace, /isSubjectOverviewStale\.value\s*=\s*false/)
  assert.match(workspace, /subjectOverviewManualError\.value\s*=\s*null/)
  assert.match(workspace, /fileOverviewManualErrors\.value\s*=\s*\{\}/)
})

test('workspace mounts and switches local files and knowledge blocks while Chat is pending', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  const { descriptor, errors } = parse(workspace, { filename: 'SubjectWorkspace/index.vue' })
  assert.deepEqual(errors, [])
  const script = ts.createSourceFile('workspace.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
  const names = new Set([
    'selectFile', 'chatSessionInitialization', 'startFreshChatSession',
    'isComponentMounted', 'currentSubjectSwitchGen', 'workspaceChatSession', 'canUseWorkspaceChat', 'canSendWorkspaceChat',
    'sendChat', 'sendPreset', 'sendSelectionQuestion', 'askSelection', 'clearChat',
  ])
  const lifecycle = script.statements.filter(statement => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(script)))
    }
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false
    const call = statement.expression
    return call.expression.getText(script) === 'onMounted'
      || (call.expression.getText(script) === 'watch' && call.arguments[0].getText(script) === 'subjectId')
  }).map(statement => statement.getText(script)).join('\n')
  const subjectId = ref('a')
  const activeSourceFiles = ref([])
  const selectedFileId = ref(null)
  const centerView = ref('overview')
  const chatInput = ref('draft')
  const quotedSelection = ref('quote')
  const knowledgeReads = []
  const chatRequests = []
  const sentMessages = []
  const notifications = []
  const chatStore = reactive({
    activeSession: null,
    startSubjectConversation(id) { return this.startNewSubjectConversation(id) },
    startNewSubjectConversation(id) {
      const request = Promise.withResolvers()
      chatRequests.push({ id, ...request })
      return request.promise
    },
    async sendMessage(content) { sentMessages.push([this.activeSession?.id, content]) },
  })
  const context = {
    subjectId, activeSourceFiles, selectedFileId, centerView, chatStore, chatInput, quotedSelection, ref, computed,
    authStore: { loginGeneration: Symbol('login') },
    ElNotification: notification => notifications.push(notification),
    activeSubject: ref(null),
    isScopeLocked: ref(false),
    isOutlineComposer: ref(false),
    selectedText: ref('selection'),
    isAiStreaming: ref(false),
    showProcessingRequired: ref(false),
    chatInputRef: ref(null),
    isAutoScrollLocked: ref(false),
    aiChatReferenceOptions: () => ({}),
    nextTick() {},
    scrollChatToBottom() {},
    route: { query: {} },
    subjectStore: {
      setActiveSubject() {},
      async loadSourceFiles(id) {
        activeSourceFiles.value = [{ id: `${id}-1`, name: 'first.pdf' }, { id: `${id}-2`, name: 'second.pdf' }]
      },
    },
    sourceStore: { clearActiveSourceFiles: () => { activeSourceFiles.value = [] } },
    blockStore: { async fetchBlocks(_subject, id) { knowledgeReads.push(id) } },
    async ensureOverviewRuntime() {},
    startProcessingRefresh() {},
    stopAllManualOverviews() {},
  }
  for (const name of [
    'selectionPosition', 'selectedAiSourceIds', 'aiReferenceScope',
    'subjectOutlineDraft', 'subjectOutlineBaseline', 'subjectOutlineSave', 'fileOutlineDrafts', 'fileDraftBaselines', 'fileDraftRevisions',
    'fileDraftOutlineGeneratedAt',
    'chapterDraft', 'chapterDrafts', 'fileSectionDrafts', 'fileChapterDrafts', 'selectedSummaryScope',
    'subjectOverviewRecord', 'fileOverviewRecords', 'isSubjectOverviewStale', 'subjectOverviewManualError',
    'fileOverviewManualErrors', 'subjectOverviewGenerating', 'generatingFileIds',
  ]) context[name] = ref(null)
  context.fileOutlineSaves = ref(new Map())
  const execute = new Function(...Object.keys(context), ts.transpileModule(`
    let mount, switchSubject
    const onMounted = callback => { mount = callback }
    const watch = (_source, callback) => { switchSubject = callback }
    ${lifecycle}
    return { mount, switchSubject, selectFile, sendChat, sendPreset, sendSelectionQuestion, askSelection, clearChat }
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)
  const { mount, switchSubject, selectFile, sendChat, sendPreset, sendSelectionQuestion, askSelection, clearChat } = execute(...Object.values(context))
  const mounted = mount()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(knowledgeReads, ['a'])
  assert.equal(selectedFileId.value, 'a-1')
  assert.equal(centerView.value, 'preview')
  await sendChat()
  sendPreset('preset')
  await sendSelectionQuestion('selection question')
  askSelection()
  assert.equal(chatInput.value, 'draft')
  assert.equal(quotedSelection.value, 'quote')
  assert.deepEqual(sentMessages, [])

  chatStore.activeSession = { id: 'conversation-a' }
  chatRequests[0].resolve('conversation-a')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(chatRequests.map(request => request.id), ['a'])
  await mounted

  subjectId.value = 'b'
  const switched = switchSubject('b')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(knowledgeReads, ['a', 'b'])
  assert.equal(selectedFileId.value, 'b-1')
  assert.deepEqual(chatRequests.map(request => request.id), ['a', 'b'])

  await sendChat()
  assert.equal(chatInput.value, 'draft')
  assert.deepEqual(sentMessages, [])

  await selectFile('b-2')
  assert.equal(selectedFileId.value, 'b-2')
  chatRequests[1].reject(new Error('offline'))
  await switched
  assert.deepEqual(chatRequests.map(request => request.id), ['a', 'b'])
  await sendChat()
  assert.equal(chatInput.value, 'draft')
  assert.deepEqual(sentMessages, [])

  clearChat()
  assert.deepEqual(chatRequests.map(request => request.id), ['a', 'b', 'b'])
  chatStore.activeSession = { id: 'conversation-b' }
  chatRequests[2].resolve('conversation-b')
  await new Promise(resolve => setImmediate(resolve))
  quotedSelection.value = 'quote from subject b'
  chatStore.activeRun = { status: 'UNKNOWN', executionActive: true }
  chatStore.isRecovering = true
  await sendChat()
  sendPreset('preset during recovery')
  await sendSelectionQuestion('selection during recovery')
  askSelection()
  assert.equal(chatInput.value, 'draft')
  assert.equal(quotedSelection.value, 'quote from subject b')
  assert.deepEqual(sentMessages, [])
  chatStore.activeRun = null
  chatStore.isRecovering = false
  quotedSelection.value = ''
  await sendChat()
  assert.deepEqual(sentMessages, [['conversation-b', 'draft']])
  assert.equal(chatInput.value, '')

  chatInput.value = 'preserved draft'
  clearChat()
  await sendChat()
  assert.equal(sentMessages.length, 1)
  chatRequests[3].reject(new Error('new conversation unavailable'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(chatInput.value, 'preserved draft')
  assert.equal(chatStore.activeSession.id, 'conversation-b')
  assert.equal(notifications.at(-1).message, 'new conversation unavailable')
  await sendChat()
  assert.deepEqual(sentMessages.at(-1), ['conversation-b', 'preserved draft'])
})

test('subject workspace starts the refresh timer on mount and releases timer and chat transport on unmount', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  // 1. 立即在 onMounted 启动轮询，解耦于特定学科异步链路
  assert.match(workspace, /onMounted\(async \(\) => \{[\s\S]*?isComponentMounted = true[\s\S]*?startProcessingRefresh\(\)/)
  // 2. 组件卸载时使代次失效并清理定时器
  assert.match(workspace, /onUnmounted\(\(\) => \{[\s\S]*?isComponentMounted = false[\s\S]*?currentSubjectSwitchGen\+\+[\s\S]*?stopProcessingRefresh\(\)[\s\S]*?chatStore\.abortStream\(\)/)
})

test('SubjectWorkspace subscribes to overview cache updates and refreshes view reactively', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  const syncWakeup = await read('src/services/overviewSyncWakeup.ts')
  const repo = await read('src/services/overviewRepository.ts')
  assert.match(syncWakeup, /export const OVERVIEW_CACHE_UPDATED_EVENT = 'auralis-overview-cache-updated'/)
  assert.match(syncWakeup, /subscribeOverviewCacheUpdated/)
  assert.match(repo, /notifyOverviewCacheUpdated/)
  assert.match(repo, /getLatestFileOverview/)
  assert.match(workspace, /subscribeOverviewCacheUpdated\(/)
  assert.match(workspace, /unsubscribeOverviewCache\?\.()/)
  assert.match(workspace, /watch\(activeSourceFiles/)
  assert.match(workspace, /getLatestFileOverview/)
})

test('subject outline composer keeps subject outline independent when ungenerated and does not auto-populate from single file outline', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.doesNotMatch(workspace, /filesWithOutline\.length === 1/)
  assert.doesNotMatch(workspace, /singleFile\.outline/)
  assert.match(workspace, /const remote = subjectOverviewRecord\.value\?\.outlineMarkdown \?\? \'\'/)
})


