import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

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
  assert.match(workspace, /regenerateSubjectOverview\(subjectId\.value, 'OUTLINE'\)/)
  assert.doesNotMatch(workspace, /subjectOverviewRecord\.value\.inputFingerprint\)\s*\)/)
  assert.doesNotMatch(workspace, /subjectOverviewRecord\.value\?\.inputFingerprint\s*&&\s*usable\.length/)
})

test('file outlines render inline with summary and regeneration entry points', async () => {
  const source = await read('src/components/subject/FileOutlineList.vue')
  assert.match(source, /file\.outline/)
  assert.match(source, /select-summary/)
  assert.match(source, /重新生成大纲/)
  assert.match(source, /重新生成全部/)
  assert.match(source, /select-outline-node/)
  assert.doesNotMatch(source, /outline-subtabs|tab-bar/)
})

test('middle summary view preserves old content during regeneration or error', async () => {
  const source = await read('src/components/subject/OverviewSummaryView.vue')
  assert.match(source, /isGenerating && summary/)
  assert.match(source, /error/)
  assert.match(source, /当前内容仍可查看/)
  assert.match(source, /内容概述/)
  assert.match(source, /核心要点/)
  assert.match(source, /推荐学习路径/)
  assert.match(source, /2000/)
})

test('SubjectWorkspace integrates overview UI with outline composer and unified overview cards', async () => {
  const source = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(source, /<h3 class="drawer-title">总览<\/h3>/)
  assert.doesNotMatch(source, /<button class="outline-ai-button"[^>]*>AI 梳理<\/button>/)
  assert.match(source, /<button[\s\S]*?class="outline-add-button"[\s\S]*?:class="\{\s*'is-active':\s*isOutlineComposer\s*\}"/)
  assert.match(source, /<SubjectOverviewSection/)
  assert.match(source, /<FileOutlineList/)
  assert.match(source, /<OverviewSummaryView/)
  assert.match(source, /centerView === 'summary'/)
  assert.match(source, /regenerateSubjectOverview\(subjectId\.value, 'ALL'\)/)
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
  assert.match(source, /file\.error\s*&&\s*\(file\.outline\?\.length\s*\|\|\s*file\.summary\)/)
  assert.match(source, /重新生成/)
})

test('SubjectWorkspace keeps chat failures in the chat region and retries the same pending request', async () => {
  const source = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(source, /class="ai-messages"[\s\S]*role="alert"/)
  assert.match(source, /chatStore\.lastError/)
  assert.match(source, /pendingRequestId:\s*pending\.clientRequestId/)
  assert.match(source, /@click="retryChat"/)
})

test('file overview failures expose direct retry actions with classified copy', async () => {
  const fileOutlineSource = await read('src/components/subject/FileOutlineList.vue')
  const summaryViewSource = await read('src/components/subject/OverviewSummaryView.vue')
  const workspaceSource = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(fileOutlineSource, />重新生成</)
  assert.match(fileOutlineSource, /emit\('regenerate'/)
  assert.match(fileOutlineSource, /summary\s*\?\s*['"]OUTLINE['"]\s*:\s*['"]ALL['"]/)
  assert.match(summaryViewSource, />重新生成</)
  assert.match(summaryViewSource, /emit\('regenerate'/)
  assert.match(summaryViewSource, /summary-notice--error[\s\S]*重新生成/)
  assert.match(workspaceSource, /overviewFailureMessage\(record\?\.errorCode\)/)
  assert.doesNotMatch(workspaceSource, /setTimeout\([^)]*regenerateFileOverview/)
})

test('file overview failure notice and retry buttons enforce mutual exclusion and disabled state', async () => {
  const source = await read('src/components/subject/FileOutlineList.vue')
  assert.match(source, /v-if="file\.error\s*&&\s*\(file\.outline\?\.length\s*\|\|\s*file\.summary\)"/)
  assert.doesNotMatch(source, /<p\s+v-if="file\.error"\s+class="file-outline__notice"/)

  const retryButtons = source.match(/<button[\s\S]*?class="file-outline__retry"[\s\S]*?>/g) ?? []
  assert.equal(retryButtons.length, 2)
  for (const button of retryButtons) {
    assert.match(button, /:disabled="file\.isGenerating"/)
  }
  assert.match(source, /\.file-outline__retry:disabled/)
})

test('overview summary view guarantees exactly one retry action on failure and disables during generation', async () => {
  const source = await read('src/components/subject/OverviewSummaryView.vue')
  assert.match(source, /<button\s+v-if="!error"[\s\S]*?:disabled="isGenerating"[\s\S]*?@click="emit\('regenerate'\)"[\s\S]*?>[\s\S]*?重新生成<\/button>/)
  assert.match(source, /summary-notice--error[\s\S]*?<button[\s\S]*?class="summary-notice__retry"[\s\S]*?:disabled="isGenerating"[\s\S]*?@click="emit\('regenerate'\)"[\s\S]*?>重新生成<\/button>/)
  assert.doesNotMatch(source, /summary-empty__retry/)
  assert.doesNotMatch(source, /class="summary-empty"[\s\S]*?重新生成/)
})

test('subject outline composer preserves section summary, sourceIds, locator and isolates drafts on subject switch', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /summary:\s*sec\.summary\s*\?\?\s*null/)
  assert.match(workspace, /locator:\s*sec\.locator\s*\?\?\s*null/)
  assert.match(workspace, /sourceIds:\s*Array\.isArray\(sec\.sourceIds\)/)
  assert.match(workspace, /watch\(subjectId,\s*async\s*\(newId\)\s*=>\s*\{[\s\S]*?subjectOutline\.value\s*=\s*\[\][\s\S]*?await startFreshChatSession/)
  assert.match(workspace, /const saveCurrentOutline = async \(\) => \{[\s\S]*?!subjectOutline\.value\.length/)
  assert.match(workspace, /if\s*\(subjectId\.value\s*!==\s*targetSubjectId\)\s*return/)
  assert.doesNotMatch(workspace, /syncOutlineFileLinks/)
})

test('subject switch synchronously clears selectedFileId and chat guards against cross-subject file IDs', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /watch\(subjectId,\s*async\s*\(newId\)\s*=>\s*\{[\s\S]*?selectedFileId\.value\s*=\s*null[\s\S]*?await startFreshChatSession/)
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

test('subject workspace lifecycle guards against session race, unmount leakage, and starts refresh timer immediately on mount', async () => {
  const workspace = await read('src/views/SubjectWorkspace/index.vue')
  // 1. 立即在 onMounted 启动轮询，解耦于特定学科异步链路
  assert.match(workspace, /onMounted\(async \(\) => \{[\s\S]*?isComponentMounted = true[\s\S]*?startProcessingRefresh\(\)/)
  // 2. 组件卸载时使代次失效并清理定时器
  assert.match(workspace, /onUnmounted\(\(\) => \{[\s\S]*?isComponentMounted = false[\s\S]*?currentSubjectSwitchGen\+\+[\s\S]*?stopProcessingRefresh\(\)[\s\S]*?chatStore\.endActiveSession\(\)/)
  // 3. 阅读会话启动后的后置代次与组件存活保护（onMounted 与 watch）
  assert.match(workspace, /const readingSessionId = await chatStore\.startReadingSession\(firstFile\.id,\s*newId,\s*firstFile\.name\)\.catch\(\(\) => undefined\)[\s\S]*?if\s*\(!isComponentMounted\s*\|\|\s*currentSubjectSwitchGen\s*!==\s*switchGen\s*\|\|\s*subjectId\.value\s*!==\s*newId\s*\|\|\s*selectedFileId\.value\s*!==\s*firstFile\.id\)[\s\S]*?chatStore\.endSessionById\(readingSessionId\)/)
  // 4. selectFile 中的代次与阅读会话保护
  assert.match(workspace, /const selectFile = async \(id: string\) => \{[\s\S]*?\+\+currentSubjectSwitchGen[\s\S]*?const readingSessionId = await chatStore\.startReadingSession\(id,\s*targetSubjectId,\s*file\.name\)\.catch\(\(\) => undefined\)[\s\S]*?if\s*\(!isComponentMounted\s*\|\|\s*currentSubjectSwitchGen\s*!==\s*fileSelectGen[\s\S]*?chatStore\.endSessionById\(readingSessionId\)/)
})

