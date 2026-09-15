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
  assert.match(source, /原有内容已保留/)
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
  assert.match(source, /当前总结继续保留/)
  assert.match(source, /内容概述/)
  assert.match(source, /核心要点/)
  assert.match(source, /推荐学习路径/)
  assert.match(source, /2000/)
})

test('SubjectWorkspace integrates overview UI without moving the existing AI action', async () => {
  const source = await read('src/views/SubjectWorkspace/index.vue')
  assert.match(source, /<h3 class="drawer-title">总览<\/h3>/)
  assert.match(source, /<button class="outline-ai-button" @click="handleOutlineAi">AI 梳理<\/button>\s*<button class="outline-add-button"/)
  assert.match(source, /<SubjectOverviewSection/)
  assert.match(source, /<FileOutlineList/)
  assert.match(source, /<OverviewSummaryView/)
  assert.match(source, /centerView === 'summary'/)
  assert.match(source, /regenerateSubjectOverview\(subjectId\.value, 'ALL'\)/)
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
  assert.match(source, /v-if="file\.error\s*&&\s*file\.outline\?\.length"/)
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

