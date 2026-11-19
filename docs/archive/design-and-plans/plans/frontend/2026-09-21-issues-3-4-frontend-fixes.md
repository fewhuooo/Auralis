# Issues 3–4 Frontend Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用最小前端改动让连接/同步状态真实反映错误优先级，并让 Overview 手动 regenerate 有结构化结果与明确反馈、自动触发保持静默且保留已有内容。

**Architecture:** 在现有 Pinia Sync Store、Realtime controller、Chat Store 和 Overview generation service 上增加纯函数状态投影与结构化返回值，不创建第二套网络状态系统。Sidebar 只消费投影；聊天错误在聊天区域持续呈现；Overview 手动入口消费 `STARTED/SKIPPED/FAILED`，自动入口记录安全状态但不弹通知。既有 Overview cache、revision fence、in-flight coalescing 和 failure terminal policy 保持不变。

**Tech Stack:** Vue 3、Pinia、TypeScript 6、Axios `ApiProblemError`、Element Plus message/notification、Node `--experimental-strip-types --test`、Vite/vue-tsc。

## Global Constraints

- 只修改 Issue 3/4 最小前端范围；不改 Server API、数据库 schema、Realtime 协议、FilePreview 加载链或无关视觉结构。
- 状态优先级固定为 `SYNC_ERROR/SERVICE_UNAVAILABLE > OFFLINE > REALTIME_RECONNECTING > SYNCING > SYNCED`。
- 普通 HTTP/AI 错误、连接重连和同步错误必须保留安全错误码/用户可行动提示；不能在错误存在时显示“已同步”。
- 手动 Overview 的失败/跳过不得清空已有成功 Outline/Summary；自动触发的 `SKIPPED/FAILED` 不弹通知、不循环重试。
- 手动和自动入口都继续执行现有 Source existence、READY、revision、blocked Source 和 abort fence。
- 每个任务采用 TDD：先写失败测试、运行确认失败、最小实现、运行通过；自动测试、type-check、build 和 GUI/业务验收分开记录。
- 当前计划创建只修改 `docs/plans` 与 `docs/README.md`，不修改代码、不修改用户 dirty current 文档、不提交 commit。

---

## File map

| 文件 | 责任 |
| --- | --- |
| `Auralis-PC/src/services/connectionStatusProjection.ts` | 将现有 Sync/Realtime/Chat 输入投影为一个只读状态 |
| `Auralis-PC/src/store/useSyncStore.ts` | 暴露 sync error、pending/inflight 和 projection 输入 |
| `Auralis-PC/src/services/realtimeController.ts` | 暴露 connected/reconnecting/disconnected 既有状态 |
| `Auralis-PC/src/store/useChatStore.ts` | 保持最近安全错误，供聊天区域消费 |
| `Auralis-PC/src/components/layout/AppSidebar.vue` | 只消费统一 projection，显示错误/离线/重连/同步/就绪 |
| `Auralis-PC/src/views/SubjectWorkspace/index.vue` | 在聊天区域显示可见错误与重试入口 |
| `Auralis-PC/src/services/overviewGenerationService.ts` | manual/automatic regenerate 返回结构化结果 |
| `Auralis-PC/src/types/overview.ts` | 定义结果、skip/failure code 类型 |
| `Auralis-PC/src/components/subject/FileOutlineList.vue` | 文件 Overview 手动反馈与旧内容保留 |
| `Auralis-PC/src/components/subject/SubjectOverviewSection.vue` | 学科 Overview 手动反馈与旧内容保留 |
| `Auralis-PC/src/components/subject/OverviewSummaryView.vue` | Summary 手动反馈与旧内容保留 |
| `Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs` | 新增纯函数、状态优先级、手动/自动反馈回归 |
| `Auralis-PC/scripts/r4-sync.test.mjs`、`r4-reliability.test.mjs`、`r4-overview-generation.test.mjs`、`r4-subject-overview-ui.test.mjs` | 现有同步、错误、Overview 和 UI 静态/行为回归 |
| `Auralis-PC/package.json` | 将新 focused suite 接入 `test:r4-pc` |
| `docs/modules/FrontendPC.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/release/Changelog.md` | 实施后的事实、风险和变更回写 |

## Task 1: 创建统一连接/同步状态投影

**Files:**
- Create: `Auralis-PC/src/services/connectionStatusProjection.ts`
- Modify: `Auralis-PC/src/store/useSyncStore.ts:44-265`
- Modify: `Auralis-PC/src/services/realtimeController.ts:5-101`
- Modify: `Auralis-PC/src/store/useChatStore.ts:111-128,312-379`
- Create: `Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs`
- Test: `Auralis-PC/scripts/r4-sync.test.mjs`
- Test: `Auralis-PC/scripts/r4-reliability.test.mjs`

**Interfaces:**
- Produces `ConnectionProjection = { level: 'error' | 'offline' | 'reconnecting' | 'syncing' | 'ready'; code: string | null; message: string; retryable: boolean }`.
- Produces `projectConnectionStatus(input: ConnectionStatusInput): ConnectionProjection`.
- Consumes only existing `isOnline()`, sync `lastSyncError/isSyncing`, Realtime `RealtimeStatus`, and Chat `lastError`; it does not own network requests.

- [ ] **Step 1: Write the failing projection tests**

Add cases for every priority boundary:

```
assert.equal(projectConnectionStatus({ online: true, syncError: '503', serviceUnavailable: false, realtime: 'connected', syncing: false, chatError: null }).level, 'error')
assert.equal(projectConnectionStatus({ online: false, syncError: null, serviceUnavailable: false, realtime: 'connected', syncing: false, chatError: null }).level, 'offline')
assert.equal(projectConnectionStatus({ online: true, syncError: null, serviceUnavailable: false, realtime: 'reconnecting', syncing: false, chatError: null }).level, 'reconnecting')
assert.equal(projectConnectionStatus({ online: true, syncError: null, serviceUnavailable: false, realtime: 'connected', syncing: true, chatError: null }).level, 'syncing')
assert.equal(projectConnectionStatus({ online: true, syncError: null, serviceUnavailable: false, realtime: 'connected', syncing: false, chatError: null }).level, 'ready')
```

Also assert an error remains `error` after browser online returns, and a Chat error is visible without changing sync success to ready.

- [ ] **Step 2: Run the focused test and verify failure**

```
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-sync.test.mjs scripts/r4-reliability.test.mjs
```

Expected: `FAIL` because `connectionStatusProjection.ts` and the projection export do not exist.

- [ ] **Step 3: Implement the pure priority function**

Create the exact input and output types and implement first-match priority:

```
export type ConnectionLevel = 'error' | 'offline' | 'reconnecting' | 'syncing' | 'ready'

export interface ConnectionStatusInput {
  online: boolean
  syncError: string | null
  serviceUnavailable: boolean
  realtime: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  syncing: boolean
  chatError: string | null
}

export interface ConnectionProjection {
  level: ConnectionLevel
  code: string | null
  message: string
  retryable: boolean
}

export function projectConnectionStatus(input: ConnectionStatusInput): ConnectionProjection {
  if (input.syncError || input.serviceUnavailable || input.chatError) {
    return { level: 'error', code: input.syncError || 'SERVICE_UNAVAILABLE', message: input.syncError || input.chatError || '服务暂时不可用', retryable: true }
  }
  if (!input.online) return { level: 'offline', code: 'OFFLINE', message: '当前离线，本地修改会在恢复网络后同步', retryable: true }
  if (input.realtime === 'reconnecting' || input.realtime === 'connecting') {
    return { level: 'reconnecting', code: 'REALTIME_RECONNECTING', message: '实时连接恢复中', retryable: true }
  }
  if (input.syncing) return { level: 'syncing', code: 'SYNCING', message: '同步中', retryable: true }
  return { level: 'ready', code: null, message: '已同步', retryable: false }
}
```

Expose the existing Store values needed to construct the input; do not add a second scheduler or change sync retry behavior.

- [ ] **Step 4: Run the projection and existing synchronization tests**

```
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-sync.test.mjs scripts/r4-reliability.test.mjs
```

Expected: all selected tests pass, including existing outbox/refresh/SSE assertions.

- [ ] **Step 5: Commit the pure projection**

```
git add Auralis-PC/src/services/connectionStatusProjection.ts Auralis-PC/src/store/useSyncStore.ts Auralis-PC/src/services/realtimeController.ts Auralis-PC/src/store/useChatStore.ts Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs Auralis-PC/scripts/r4-sync.test.mjs Auralis-PC/scripts/r4-reliability.test.mjs
git commit -m "feat: project unified pc connection status"
```

## Task 2: 让 Sidebar 消费 projection 并保持错误可见

**Files:**
- Modify: `Auralis-PC/src/components/layout/AppSidebar.vue:91-205`
- Modify: `Auralis-PC/src/App.vue:41-92`
- Modify: `Auralis-PC/src/store/useChatStore.ts:124-128,472`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue:383-453,1268-1344`
- Test: `Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs`
- Test: `Auralis-PC/scripts/r4-subject-overview-ui.test.mjs`

**Interfaces:**
- `AppSidebar.vue` consumes one computed `connectionProjection`; it must not inspect Realtime or Chat internals directly after integration.
- `useChatStore.lastError` remains a `string | null`; send/recovery failures set it and successful completion clears only the current chat error.
- `SubjectWorkspace` renders `chatStore.lastError` inside the `.ai-messages` region with `role="alert"` and a retry action that reuses the existing pending message request.

- [ ] **Step 1: Write failing Sidebar/chat assertions**

Add static/runtime assertions that AppSidebar no longer hardcodes only `isSyncing ? '同步中...' : '三端同步就绪'`, that its tooltip uses projection `message`, and that SubjectWorkspace contains a chat-region alert bound to `lastError` rather than relying only on a global notification.

```
const sidebar = read('src/components/layout/AppSidebar.vue')
assert.match(sidebar, /connectionProjection/)
assert.match(sidebar, /projection\\.message/)
assert.doesNotMatch(sidebar, /三端同步就绪/)
const workspace = read('src/views/SubjectWorkspace/index.vue')
assert.match(workspace, /role="alert"/)
assert.match(workspace, /lastError/)
```

- [ ] **Step 2: Run the focused UI tests and verify failure**

```
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-subject-overview-ui.test.mjs
```

Expected: `FAIL` because AppSidebar currently derives only `isSyncing` and chat errors are sent to notifications without a persistent chat-region row.

- [ ] **Step 3: Connect Sidebar to the projection**

Import `projectConnectionStatus`, create one computed input from online state, `syncStore.lastSyncError/isSyncing`, Realtime controller status and `chatStore.lastError`, and render level/message/retryable from that computed value. Keep existing sidebar layout and tooltip classes; only change the status dot class and text mapping.

```
const connectionProjection = computed(() => projectConnectionStatus({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncError: syncStore.lastSyncError,
  serviceUnavailable: false,
  realtime: realtimeController.getStatus(),
  syncing: syncStore.isSyncing,
  chatError: chatStore.lastError,
}))
const syncStatusText = computed(() => connectionProjection.value.message)
const syncDotClass = computed(() => `status-\${connectionProjection.value.level}`)
```

Use browser `online/offline` events only to invalidate the computed input; do not create a new polling loop.

- [ ] **Step 4: Render a persistent chat error and retry affordance**

Expose `lastError` and the existing active/pending message from `useChatStore`. In `.ai-messages`, render an alert after the message list when `lastError` is non-null; retry calls the existing `sendMessage` path with the same pending request ID and clears only after a successful stream. Keep a global notification only as a secondary transient hint.

- [ ] **Step 5: Run focused tests and type-check**

```
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-subject-overview-ui.test.mjs scripts/r4-reliability.test.mjs
npm.cmd run type-check
```

Expected: all selected tests pass and type-check exits 0; the error state remains visible until a successful retry rather than becoming green immediately after network recovery.

- [ ] **Step 6: Commit the projection consumer**

```
git add Auralis-PC/src/components/layout/AppSidebar.vue Auralis-PC/src/App.vue Auralis-PC/src/store/useChatStore.ts Auralis-PC/src/views/SubjectWorkspace/index.vue Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs Auralis-PC/scripts/r4-subject-overview-ui.test.mjs
git commit -m "fix: show real sync and chat connection state"
```

## Task 3: 为 Overview regenerate 增加结构化结果类型

**Files:**
- Modify: `Auralis-PC/src/types/overview.ts:1-20`
- Modify: `Auralis-PC/src/services/overviewGenerationService.ts:100-290`
- Test: `Auralis-PC/scripts/r4-overview-generation.test.mjs`
- Test: `Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs`

**Interfaces:**
- Produces:
```
export type OverviewRegenerationResult =
  | { status: 'STARTED'; requestId?: string }
  | { status: 'SKIPPED'; code: OverviewSkipCode }
  | { status: 'FAILED'; code: OverviewFailureCode; detail?: string }
```
- Manual `regenerateFileOverview(sourceId, mode, instruction?): Promise<OverviewRegenerationResult>`.
- Manual `regenerateSubjectOverview(subjectId, mode, instruction?): Promise<OverviewRegenerationResult>`.
- Automatic triggers use the same result internally but do not throw for expected `SKIPPED/FAILED`; they log bounded safe codes.

- [ ] **Step 1: Write failing result assertions**

Extend `r4-overview-generation.test.mjs` with exact cases:

```
const skipped = await service.regenerateFileOverview('source-not-ready', 'OUTLINE')
assert.deepEqual(skipped, { status: 'SKIPPED', code: 'SOURCE_NOT_READY' })

const started = await service.regenerateFileOverview('ready-source', 'OUTLINE')
assert.equal(started.status, 'STARTED')
assert.equal(typeof started.requestId, 'string')

const failed = await service.regenerateFileOverview('ready-source', 'SUMMARY')
assert.equal(failed.status, 'FAILED')
assert.equal(failed.code, 'MODEL_PROVIDER_ERROR')
```

Also assert the old successful cache content remains after `FAILED` and `SKIPPED`.

- [ ] **Step 2: Run the Overview tests and verify failure**

```
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs scripts/r4-issues-3-4-frontend.test.mjs
```

Expected: `FAIL` because both service methods currently return `Promise<void>` and throw/return through side effects.

- [ ] **Step 3: Implement the result mapping without changing fences**

Return `SKIPPED` at each existing eligibility early-return, return `STARTED` after the request is accepted/coalesced, and map provider/transport exceptions through the existing `classifyOverviewFailure` to `FAILED`. Preserve cache writes only on successful valid response and retain all existing abort/source/revision checks.

```
function failedResult(error: unknown): OverviewRegenerationResult {
  const safe = classifyOverviewFailure(error)
  return { status: 'FAILED', code: safe.code, detail: safe.detail }
}
```

The method must not clear an existing successful record when returning `SKIPPED` or `FAILED`.

- [ ] **Step 4: Run focused Overview tests**

```
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-issues-3-4-frontend.test.mjs
```

Expected: all result, cache preservation, revision fence, late response, and automatic terminal-policy assertions pass.

- [ ] **Step 5: Commit structured results**

```
git add Auralis-PC/src/types/overview.ts Auralis-PC/src/services/overviewGenerationService.ts Auralis-PC/scripts/r4-overview-generation.test.mjs Auralis-PC/scripts/r4-overview-cache.test.mjs Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs
git commit -m "feat: return structured overview regeneration results"
```

## Task 4: 接入手动 Overview 明确反馈

**Files:**
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue:785-913,1066-1090`
- Modify: `Auralis-PC/src/components/subject/FileOutlineList.vue:1-60`
- Modify: `Auralis-PC/src/components/subject/SubjectOverviewSection.vue:1-55`
- Modify: `Auralis-PC/src/components/subject/OverviewSummaryView.vue:1-55`
- Test: `Auralis-PC/scripts/r4-subject-overview-ui.test.mjs`
- Test: `Auralis-PC/scripts/r4-overview-generation.test.mjs`

**Interfaces:**
- Manual handlers consume `OverviewRegenerationResult` and map `STARTED`, `SKIPPED`, `FAILED` to a visible status message.
- Existing component props `error`, `isGenerating`, `summary/outline` remain; no new cache status is introduced.
- A failed or skipped manual attempt keeps the previous successful content rendered and shows an actionable retry button.

- [ ] **Step 1: Write failing manual feedback tests**

Assert manual file and subject handlers inspect `result.status`, show a not-ready/revision message for `SKIPPED`, show a safe retry message for `FAILED`, and call `refreshOverviewCache` only after a successful completion. Assert the three Overview components render `当前内容仍可查看` whenever error and prior content coexist.

```
const workspace = read('src/views/SubjectWorkspace/index.vue')
assert.match(workspace, /result\\.status/)
assert.match(workspace, /SOURCE_NOT_READY|SOURCE_NOT_ELIGIBLE/)
const summary = read('src/components/subject/OverviewSummaryView.vue')
assert.match(summary, /当前总结仍可查看/)
```

- [ ] **Step 2: Run UI tests and verify failure**

```
node --experimental-strip-types --test scripts/r4-subject-overview-ui.test.mjs scripts/r4-overview-generation.test.mjs
```

Expected: `FAIL` because the current handlers await `void`, refresh unconditionally, and only use exception notifications.

- [ ] **Step 3: Implement explicit manual status handling**

Map codes to safe user copy: `SOURCE_NOT_READY` → “文件尚未处理完成”，`REVISION_MISMATCH` → “文件版本已变化，请刷新后重试”，`NO_USABLE_INPUT` → “没有可用于生成的内容”，provider/transport failure → “生成失败，请重试”。 Keep the old Overview record in the view-model and set the existing error prop instead of replacing content.

```
const result = await overviewGeneration.regenerateFileOverview(fileId, mode)
if (result.status === 'STARTED') return ElMessage.info('正在生成')
if (result.status === 'SKIPPED') {
  ElMessage.warning(overviewSkipMessage(result.code))
  return
}
ElMessage.error(overviewFailureMessage(result.code))
```

For a successful completion, refresh the cache projection and clear the visible error.

- [ ] **Step 4: Run focused UI and Overview tests**

```
node --experimental-strip-types --test scripts/r4-subject-overview-ui.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-overview-cache.test.mjs
npm.cmd run type-check
```

Expected: all selected tests pass and type-check exits 0; no failed manual request removes prior Outline/Summary data.

- [ ] **Step 5: Commit manual feedback**

```
git add Auralis-PC/src/views/SubjectWorkspace/index.vue Auralis-PC/src/components/subject/FileOutlineList.vue Auralis-PC/src/components/subject/SubjectOverviewSection.vue Auralis-PC/src/components/subject/OverviewSummaryView.vue Auralis-PC/scripts/r4-subject-overview-ui.test.mjs Auralis-PC/scripts/r4-overview-generation.test.mjs
git commit -m "fix: show manual overview regeneration feedback"
```

## Task 5: 保持自动 Overview 静默并完成 Issue 3/4 回归

**Files:**
- Modify: `Auralis-PC/src/services/overviewGenerationService.ts:100-290`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts:366-565`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue:843-913`
- Modify: `Auralis-PC/package.json:7-11`
- Test: `Auralis-PC/scripts/r4-overview-generation.test.mjs`
- Test: `Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs`

**Interfaces:**
- Automatic triggers `SOURCE_READY`, `RESUME_BOOTSTRAP`, `RESUME_ONLINE`, `RESUME_SYNC`, `JOB_CHANGED` call the same service but swallow expected `SKIPPED/FAILED` into bounded logs/cache failure state.
- Automatic triggers never call Element Plus `ElMessage`/notification and never retry a terminal `FAILED` or partial record.
- A manual retry remains the only operation that bypasses the terminal policy.

- [ ] **Step 1: Write failing automatic-silence tests**

Assert automatic `SOURCE_READY`/resume paths return structured `SKIPPED/FAILED`, invoke no notification spy, do not recursively schedule another generation, and preserve a previous successful cache record.

```
const notifications = []
await runtime.resumePending('RESUME_ONLINE')
assert.deepEqual(notifications, [])
assert.equal(await cache.getStatus(sourceId), 'READY')
assert.equal(scheduler.requestCount, 1)
```

- [ ] **Step 2: Run the automatic tests and verify failure**

```
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs scripts/r4-issues-3-4-frontend.test.mjs
```

Expected: `FAIL` if an automatic result still reaches a user notification, clears a successful record, or schedules a self-retry.

- [ ] **Step 3: Implement silent automatic handling**

Keep `MANUAL_RETRY` as the only visible trigger. For automatic paths, record `SKIPPED`/safe `FAILED` in the existing cache diagnostic and return; do not throw expected terminal results into a global UI handler. Preserve the existing abort and Source/revision fences and do not broaden eligibility.

- [ ] **Step 4: Connect the focused suite to the current script**

Append `scripts/r4-issues-3-4-frontend.test.mjs` to the existing `test:r4-pc` command in `Auralis-PC/package.json`; leave every existing script entry and ordering intact.

- [ ] **Step 5: Run all relevant automatic gates**

```
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-subject-overview-ui.test.mjs scripts/r4-sync.test.mjs scripts/r4-reliability.test.mjs
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run build
```

Expected: focused tests pass, full R4 has zero failures, type-check exits 0, and Vite build exits 0. Build warnings remain separately categorized if emitted.

- [ ] **Step 6: Commit the Issue 3/4 behavior**

```
git add Auralis-PC/src/services/overviewGenerationService.ts Auralis-PC/src/services/documentProcessing/runtime.ts Auralis-PC/src/views/SubjectWorkspace/index.vue Auralis-PC/src/components/layout/AppSidebar.vue Auralis-PC/src/services/connectionStatusProjection.ts Auralis-PC/src/types/overview.ts Auralis-PC/scripts/r4-issues-3-4-frontend.test.mjs Auralis-PC/scripts/r4-overview-generation.test.mjs Auralis-PC/scripts/r4-overview-cache.test.mjs Auralis-PC/scripts/r4-subject-overview-ui.test.mjs Auralis-PC/scripts/r4-sync.test.mjs Auralis-PC/scripts/r4-reliability.test.mjs Auralis-PC/package.json
git commit -m "fix: close issue 3 and issue 4 frontend feedback"
```

## Task 6: 回写前端模块文档和完成自查

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Documentation records only observed implementation and command output; it explicitly separates automated proof from GUI/Tauri/network/real-provider acceptance.
- No API or Database contract changes are recorded for this frontend-only plan.

- [ ] **Step 1: Write the documentation verification command**

```
cd Auralis-PC
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run build
cd ..
git diff --check
```

Expected before documentation: command output supplies actual counts and exit codes to quote; do not copy historical counts from Status.

- [ ] **Step 2: Record the verified frontend facts**

Add a dated entry describing the projection priority, persistent chat error, structured manual result, silent automatic result, preserved cache, exact focused/full test commands and any unexecuted GUI/real-provider boundary. Do not update `docs/contracts/API.md` or `docs/contracts/Database.md` because this plan intentionally changes neither.

- [ ] **Step 3: Run documentation self-check**

```
rg -n -i "T[B]D|T[O]DO|[F]IXME|[P]LACEHOLDER|implement[ ]later" docs/plans/frontend/2026-09-21-issues-3-4-frontend-fixes.md
if ($LASTEXITCODE -eq 0) { throw 'plan scan found a prohibited token' }
git diff --check
git status --short
```

Expected: no prohibited-token matches, diff-check exit 0, and the plan-writing turn has changed only the two plan files plus the README entry.

- [ ] **Step 4: Commit documentation after implementation**

```
git add docs/modules/FrontendPC.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
git commit -m "docs: record issue 3 and issue 4 frontend fixes"
```

## Execution boundaries

- This plan does not redesign the sync protocol, add a Server endpoint, change database fields, or address FilePreview duplicate loads.
- Automated Node tests and type/build gates do not prove real WebSocket delivery, browser online/offline events, Tauri local file rendering, or AI provider output; those require explicit manual acceptance evidence.
