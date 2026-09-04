# PC 首页时间轴与任务逻辑 Implementation Plan

**Goal:** 修复 PC 首页时间轴裁切，并让 Dashboard、Timeline、Asset 共享“未分布/未完成/已完成”、7 天排期窗口和一致的任务状态写入语义。

**Architecture:** 新增不依赖 Vue 的 `taskViewRules` 纯函数模块，集中处理任务状态、资产库分组、截止时间排序和首页 7 天时间窗口。`useTaskStore` 保留 API/repository 写入边界，只负责把这些规则应用到本地排期和 mutation；三个页面只负责渲染、拖拽和通知，不再各自复制任务过滤算法。Dashboard 使用 CSS Grid 的可用宽度轨道，分隔条不再挤出百分比宽度。

**Tech Stack:** Vue 3 `<script setup>`, Pinia, TypeScript, Node `node:test`, Vite/Web build、现有 `useTaskApi` 与离线 repository。

## Global Constraints

- 任务 API status 只使用 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`；前端展示状态必须通过现有 domain mapper/Task Store 转换。
- 排期不自动改变任务 status；完成操作保留 `scheduledAt`，显式移出排期才清除 `scheduledAt`。
- 首页时间轴只展示当前日期起 7 天以内且有 `scheduledAt` 的任务，已完成排期任务仍展示。
- 排期区的待安排列表只展示有 `dueAt`、无 `scheduledAt` 且未完成的任务；无截止/无排期任务只在资产库“未分布”处理。
- 资产库“全部任务”必须并列展示 `未分布`、`未完成`、`已完成`；同时无 `dueAt` 与无 `scheduledAt` 的任务优先进入 `未分布`。
- Timeline 的“导入任务”跳转 `/asset?focus=unassigned-tasks` 并自动展开/选中“未分布”。
- 只修改 `Auralis-PC/src/`、`Auralis-PC/scripts/`、现行 `docs/` 和必要的 `package.json` 测试脚本；不修改后端、生成 API 类型、密钥或旧归档。
- 每个代码步骤先写失败测试，再写最小实现；完成前运行 PC 回归、type-check、静态契约和 Web build，浏览器交互单独记录为人工验收。

---

### Task 1: 建立共享任务视图规则与纯函数测试

**Files:**
- Create: `Auralis-PC/src/services/taskViewRules.ts`
- Create: `Auralis-PC/scripts/r4-task-view-rules.test.mjs`
- Modify: `Auralis-PC/package.json:8` (`test:r4-pc`)

**Interfaces:**
- Consumes: `Task` from `src/store/useTaskStore.ts` as a type-only import.
- Produces:
  - `type AssetTaskGroup = 'unassigned' | 'pending' | 'completed'`
  - `interface AssetTaskGroups { unassigned: Task[]; pending: Task[]; completed: Task[] }`
  - `isCompletedTask(task: Pick<Task, 'status'>): boolean`
  - `isSchedulableTask(task: Pick<Task, 'status' | 'dueAt' | 'scheduledAt'>): boolean`
  - `getTaskDueTimestamp(task: Pick<Task, 'dueAt'>): number`
  - `getTasksForAssetGroups(tasks: Task[]): AssetTaskGroups`
  - `getTimelineRange(now?: Date): { start: Date; end: Date }`
  - `getTasksForTimeline(tasks: Task[], now?: Date): Task[]`

- [ ] **Step 1: Write the failing tests**

Add Node tests for unassigned precedence, deadline-bearing scheduling eligibility, deadline order, missing-deadline placement, seven-day boundaries, and completed scheduled retention:

```js
test('groups unassigned tasks before completion groups', () => {
  const groups = getTasksForAssetGroups([
    task({ id: 'u', status: 'pending' }),
    task({ id: 'c', status: 'completed', dueAt: '2026-08-23T00:00:00Z' }),
    task({ id: 'p', status: 'pending', dueAt: '2026-08-22T00:00:00Z' }),
  ])
  assert.deepEqual(groups.unassigned.map((item) => item.id), ['u'])
  assert.deepEqual(groups.pending.map((item) => item.id), ['p'])
  assert.deepEqual(groups.completed.map((item) => item.id), ['c'])
})

test('keeps completed scheduled tasks inside the seven-day timeline window', () => {
  const now = new Date('2026-08-22T10:00:00+08:00')
  const tasks = [
    task({ id: 'today-done', status: 'completed', scheduledAt: '2026-08-22T12:00:00+08:00' }),
    task({ id: 'last-day', status: 'pending', scheduledAt: '2026-08-21T12:00:00+08:00' }),
    task({ id: 'outside', status: 'pending', scheduledAt: '2026-08-29T12:00:00+08:00' }),
  ]
  assert.deepEqual(getTasksForTimeline(tasks, now).map((item) => item.id), ['last-day', 'today-done'])
})

test('only deadline-bearing unscheduled tasks enter the scheduling queue', () => {
  assert.equal(isSchedulableTask(task({ status: 'pending', dueAt: '2026-08-23T00:00:00Z' })), true)
  assert.equal(isSchedulableTask(task({ status: 'pending' })), false)
  assert.equal(isSchedulableTask(task({ status: 'pending', dueAt: '2026-08-23T00:00:00Z', scheduledAt: '2026-08-22T12:00:00Z' })), false)
})
```

Use a local `task(overrides)` factory with stable timestamps and import the module under test with `await import('../src/services/taskViewRules.ts')`. Add a separate assertion that valid `dueAt` values sort ascending and missing deadlines sort last within the relevant group.

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `Auralis-PC`:

```powershell
node --experimental-strip-types --test scripts/r4-task-view-rules.test.mjs
```

Expected: FAIL because `src/services/taskViewRules.ts` does not exist yet.

- [ ] **Step 3: Implement the pure rules**

Partition with this precedence:

```ts
if (!task.dueAt && !task.scheduledAt) groups.unassigned.push(task)
else if (task.status === 'completed') groups.completed.push(task)
else groups.pending.push(task)
```

Use `Date.parse`; invalid or absent `dueAt` sorts after valid values. For non-unassigned groups compare due timestamp, scheduled timestamp, `createdAt`, then `id`. For unassigned tasks compare `updatedAt`, `createdAt`, then `id`. `getTimelineRange` clones `now`, sets local start-of-day, and adds exactly seven calendar days. `getTasksForTimeline` excludes missing/invalid schedules and `status === 'cancelled'`, includes `completed`, and sorts by scheduled timestamp then `id`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same command. Expected: all focused tests pass with zero failures.

- [ ] **Step 5: Add the focused test to the PC suite**

Append `scripts/r4-task-view-rules.test.mjs` to the existing `test:r4-pc` command in `Auralis-PC/package.json`, preserving all existing test files.

- [ ] **Step 6: Commit**

```powershell
git add Auralis-PC/src/services/taskViewRules.ts Auralis-PC/scripts/r4-task-view-rules.test.mjs Auralis-PC/package.json
git commit -m "feat: add shared task view rules"
```

### Task 2: Correct Task Store status and schedule semantics

**Files:**
- Modify: `Auralis-PC/src/store/useTaskStore.ts:22-118,296-499`
- Create: `Auralis-PC/scripts/r4-task-store-schedule.test.mjs`
- Modify: `Auralis-PC/package.json:8`

**Interfaces:**
- Consumes: `isSchedulableTask`, `getTasksForTimeline` from `src/services/taskViewRules.ts`; existing `TaskApi` and repository interfaces.
- Produces: `TaskPresentationStatus` includes `'cancelled'`; `updateTaskStatus(taskId, newStatus)` preserves `scheduledAt`; `rescheduleTask(taskId, slotTime)` accepts a task ID; `unscheduleTask(taskId)` clears only schedule fields.

- [ ] **Step 1: Write the failing source-contract tests**

Add static checks that fail against the current implementation:

```js
test('completion does not clear scheduledAt', async () => {
  const source = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
  assert.match(source, /status:\s*newStatus,\s*scheduledAt:\s*current\.scheduledAt/)
  assert.doesNotMatch(source, /scheduledAt:\s*newStatus\s*===\s*'scheduled'\s*\?/) 
})

test('scheduled tasks are excluded from pendingTasks', async () => {
  const source = await readFile(new URL('../src/store/useTaskStore.ts', import.meta.url), 'utf8')
  assert.match(source, /pendingTasks\.value\s*=\s*tasks\.filter\([^\n]*isSchedulableTask/)
  assert.match(source, /scheduled\s*=\s*tasks\.filter\([^\n]*Boolean\(task\.scheduledAt\)/)
})
```

- [ ] **Step 2: Run the focused source-contract test and verify it fails**

```powershell
node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs
```

Expected: FAIL on the existing conditional schedule clearing and pending/scheduled filters.

- [ ] **Step 3: Implement the Store changes**

1. Add `'cancelled'` to `TaskPresentationStatus` and map API `CANCELLED` to it in `statusToPresentation`.
2. In `rebuildSchedule`, set `pendingTasks` to `tasks.filter((task) => isSchedulableTask(task) && !task.scheduledAt)`.
3. Include every non-cancelled task with `scheduledAt` in the selected-day slot lookup, including completed tasks.
4. In `updateTaskStatus`, call `toTaskModel({ ...current, status: newStatus, scheduledAt: current.scheduledAt })`; never clear schedule fields here.
5. Change `scheduleTask`, `scheduleTaskToDay`, and `rescheduleTask` to preserve current status while changing only schedule fields. `rescheduleTask(taskId, slotTime)` locates by ID and updates the selected day/time; if the destination is occupied, update the destination task to the source task’s old time before updating the dragged task.
6. Change `unscheduleTask(taskId)` to clear `scheduledAt`/`startTime` while preserving current status; a completed task remains completed.
7. Keep delete and offline mutation behavior unchanged.

- [ ] **Step 4: Run focused Store contract tests and type-check**

```powershell
node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs
npm.cmd run type-check
```

Expected: both commands exit 0.

- [ ] **Step 5: Add the focused Store test to `test:r4-pc`**

Append `scripts/r4-task-store-schedule.test.mjs` to the existing PC test command.

- [ ] **Step 6: Commit**

```powershell
git add Auralis-PC/src/store/useTaskStore.ts Auralis-PC/scripts/r4-task-store-schedule.test.mjs Auralis-PC/package.json
git commit -m "fix: preserve task schedules across status changes"
```

### Task 3: Fix Dashboard timeline layout and shared seven-day rendering

**Files:**
- Modify: `Auralis-PC/src/views/Dashboard/index.vue:1-240,408-739,743-1755`
- Create: `Auralis-PC/scripts/r4-dashboard-timeline.test.mjs`
- Modify: `Auralis-PC/package.json:8`

**Interfaces:**
- Consumes: `getTasksForTimeline`, `isSchedulableTask` from `taskViewRules`; revised `TaskStore` methods `rescheduleTask(taskId, slotTime)` and `unscheduleTask(taskId)`.
- Produces: a dashboard root whose three columns fit the available content width; day/week displays only the seven-day window; all task mutations await the Store and restore state on failure.

- [ ] **Step 1: Write failing Dashboard contract tests**

```js
test('Dashboard uses a fitting grid and keeps timeline scrollable', async () => {
  const source = await readFile(new URL('../src/views/Dashboard/index.vue', import.meta.url), 'utf8')
  assert.match(source, /gridTemplateColumns|dashboardGridTemplate/)
  assert.match(source, /min-height:\s*0/)
  assert.match(source, /overflow-y:\s*auto/)
  assert.match(source, /getTasksForTimeline/)
})

test('Dashboard awaits task mutations and uses task IDs for schedule changes', async () => {
  const source = await readFile(new URL('../src/views/Dashboard/index.vue', import.meta.url), 'utf8')
  assert.match(source, /await\s+taskStore\.(scheduleTask|rescheduleTask|unscheduleTask)/)
  assert.match(source, /slot\.task\.id/)
  assert.match(source, /taskStore\.unscheduleTask\(slot\.task\.id\)/)
})
```

- [ ] **Step 2: Run the focused contract test and verify it fails**

```powershell
node --experimental-strip-types --test scripts/r4-dashboard-timeline.test.mjs
```

Expected: FAIL because Dashboard currently uses percentage widths, duplicated day filtering, slot-time drag IDs, and un-awaited mutations.

- [ ] **Step 3: Implement layout and interaction changes**

1. Bind a computed `dashboardGridTemplate` to `.dashboard-container`: `minmax(180px, <nav>fr) 8px minmax(320px, <main>fr) 8px minmax(280px, <right>fr)`, where the right fraction is `100 - navWidthPercent - mainLeftPercent`.
2. Remove width-based inline styles from the three columns; set the root to CSS Grid, remove splitter negative margins, and add `min-width: 0; min-height: 0` to grid children and right panel.
3. Keep resize limits while ensuring `navWidthPercent + mainLeftPercent <= 80` and right remains at least 20.
4. Replace local scheduled-day filtering with `getTasksForTimeline(allTasks.value)` plus selected-day filtering by local `scheduledAt` date.
5. Render completed slot tasks with an `is-completed` class and readable completion text, without removing them.
6. Change scheduled drag payloads from `slot.time` to `slot.task.id`; call `await taskStore.rescheduleTask(taskId, slotTime)`.
7. Change delete/drop-to-pending calls to `await taskStore.unscheduleTask(taskId)`.
8. Wrap add, complete, schedule, reschedule and unschedule calls in `try/catch/finally`; on failure call `await taskStore.loadLocalTasks()` and show `ElNotification`. Always clear drag state in `finally`.
9. Use `isSchedulableTask` for pending lists; scheduled active tasks must not appear twice.
10. Change `triggerImport` to `router.push({ path: '/asset', query: { focus: 'unassigned-tasks' } })`; the Asset view will consume that query and focus the unassigned task folder.

- [ ] **Step 4: Run the focused contract test and PC type-check**

```powershell
node --experimental-strip-types --test scripts/r4-dashboard-timeline.test.mjs
npm.cmd run type-check
```

Expected: both commands exit 0.

- [ ] **Step 5: Add the focused Dashboard test to `test:r4-pc`**

Append `scripts/r4-dashboard-timeline.test.mjs` to the existing PC test command.

- [ ] **Step 6: Commit**

```powershell
git add Auralis-PC/src/views/Dashboard/index.vue Auralis-PC/scripts/r4-dashboard-timeline.test.mjs Auralis-PC/package.json
git commit -m "fix: restore dashboard timeline layout"
```

### Task 4: Apply shared groups and deadline sorting to Asset

**Files:**
- Modify: `Auralis-PC/src/views/Asset/index.vue:371-456`
- Modify: `Auralis-PC/scripts/r4-asset-tasks.test.mjs`

**Interfaces:**
- Consumes: `getTasksForAssetGroups` and `AssetTaskGroup` from `taskViewRules`; current `taskStore.allTasks`.
- Produces: “全部任务” and each subject’s task directory with parallel `未分布`/`未完成`/`已完成` folders, sorted according to the shared rules and without static demo tasks.

- [ ] **Step 1: Extend the failing Asset test**

Add assertions for the three group labels, the shared helper import/use, and the absence of static task IDs:

```js
assert.match(assetSource, /getTasksForAssetGroups/)
assert.match(assetSource, /未分布/)
assert.match(assetSource, /未完成/)
assert.match(assetSource, /已完成/)
assert.doesNotMatch(assetSource, /复习 Vue 响应式原理|编写 Tauri IPC 示例/)
```

- [ ] **Step 2: Run the focused Asset test and verify it fails**

```powershell
node --experimental-strip-types --test scripts/r4-asset-tasks.test.mjs
```

Expected: FAIL because Asset currently has one flat task folder.

- [ ] **Step 3: Implement grouped task nodes**

Add a local `createTaskGroupNodes(tasks, groupId)` helper that calls `getTasksForAssetGroups(tasks)` and returns folders in this exact order:

```ts
[
  { id: `${groupId}-unassigned`, name: '未分布', type: 'folder', children: ... },
  { id: `${groupId}-pending`, name: '未完成', type: 'folder', children: ... },
  { id: `${groupId}-completed`, name: '已完成', type: 'folder', children: ... },
]
```

Each leaf retains `originalData: task`, uses `id: `t-${task.id}``, displays `task.name`, and retains due/load/done fields. Build the global `全部任务` folder from all tasks and the subject task folder from the subject-filtered array. Keep `taskStore.fetchTasks()` and `updateTaskStatus` persistence.

Read `route.query.focus` with `useRoute()`. When it equals `unassigned-tasks`, expand the global task folder, expand its `未分布` child, and select that folder after `rootNodes` is assigned. A normal `/asset` visit keeps the existing collapsed behavior.

- [ ] **Step 4: Run the focused Asset test and full PC tests**

```powershell
node --experimental-strip-types --test scripts/r4-asset-tasks.test.mjs
npm.cmd run test:r4-pc
```

Expected: focused test passes and the full suite reports zero failures.

- [ ] **Step 5: Commit**

```powershell
git add Auralis-PC/src/views/Asset/index.vue Auralis-PC/scripts/r4-asset-tasks.test.mjs
git commit -m "feat: group asset tasks by distribution and completion"
```

### Task 5: Update current docs and validate the integrated PC build

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: the implemented shared task rules, Dashboard layout, Task Store semantics, Asset groups, and actual command output.
- Produces: current documentation that separates code/test evidence from browser manual acceptance and records the remaining Vite chunk warnings.

- [ ] **Step 1: Update module and design statements**

Document that Dashboard/Timeline use the seven-day scheduled window, completed scheduled tasks remain visible, the scheduling queue requires a deadline, explicit unschedule clears scheduling, the Timeline import button focuses Asset/未分布, and Asset has parallel `未分布`/`未完成`/`已完成` groups sorted by deadline.

- [ ] **Step 2: Record status, risk, and release evidence**

Add a dated entry with the exact final test counts and commands. Keep browser layout, drag/drop, status persistence, and asset sorting listed as manual acceptance until actually checked.

- [ ] **Step 3: Run all integrated checks**

From `Auralis-PC` run:

```powershell
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run check:r4-pc
npm.cmd run check:subject-icons
npm.cmd run check:subject-workspace
npm.cmd run build
```

Expected: all commands exit 0; build may retain the existing Asset chunk-size and ineffective dynamic-import warnings.

- [ ] **Step 4: Run repository diff checks**

From the repository root run:

```powershell
git diff --check
git status --short --branch --untracked-files=all
```

Expected: no whitespace errors; only intentionally preserved `.claude/settings.local.json` may remain untracked.

- [ ] **Step 5: Commit documentation and validation record**

```powershell
git add docs/modules/FrontendPC.md docs/design/Frontend.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
git commit -m "docs: record pc timeline task logic fix"
```

- [ ] **Step 6: Push and rebuild local Docker frontend**

After integrated checks pass:

```powershell
git push origin codex/r4-client-migration
docker compose --env-file .env build frontend
docker compose --env-file .env up -d --force-recreate frontend
docker compose --env-file .env ps frontend backend
```

Verify frontend is running, backend is healthy, and `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:80/` returns status `200`. Record browser manual acceptance separately; a build and HTTP 200 do not prove task interactions.
