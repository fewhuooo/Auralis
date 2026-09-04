# PC 时间轴过去时段保护 Implementation Plan

**Goal:** 拒绝所有把 PC 任务排到当前时间之前的时间轴操作，并保持任务与同步队列不变。

**Architecture:** 在 `taskViewRules.ts` 提供可注入时钟的纯时间比较函数；`useTaskStore` 在生成目标 `scheduledAt` 后、调用 Task API 或换位 API 前统一抛出中文错误。Dashboard 和 Timeline 已将 Store 异常显示为用户反馈，因此不增加页面专用状态。

**Tech Stack:** Vue 3、Pinia、TypeScript、Node test runner、Vite。

## Global Constraints

- 目标时间严格早于客户端当前时间时拒绝；等于或晚于当前时间允许。
- 覆盖 `scheduleTask`、`scheduleTaskToDay`、`rescheduleTask` 三条 Store 入口。
- 被拒绝时不调用 Task REST、`schedule-swaps` 或离线 mutation。
- 保持 `scheduledAt` UTC ISO 归一化、已有到期自动转换和服务端原子换位契约不变。
- 本轮只改 PC 前端；不改后端、OpenAPI 或生成 SDK。

---

### Task 1: 为过去时段判定建立纯函数与回归

**Files:**
- Modify: `Auralis-PC/src/services/taskViewRules.ts:9-38`
- Modify: `Auralis-PC/scripts/r4-task-view-rules.test.mjs:1-76`

**Interfaces:**
- Produces: `isScheduledAtInPast(value: string | undefined, now?: Date): boolean`。
- Consumes: `Date.parse`，无 Store、DOM 或 API 依赖。

- [ ] **Step 1: 写入失败的纯函数测试**

```js
import { isScheduledAtInPast } from '../src/services/taskViewRules.ts'

test('rejects only valid scheduled times before the current instant', () => {
  const now = new Date('2026-08-31T10:15:00.000Z')
  assert.equal(isScheduledAtInPast('2026-08-31T10:14:59.999Z', now), true)
  assert.equal(isScheduledAtInPast('2026-08-31T10:15:00.000Z', now), false)
  assert.equal(isScheduledAtInPast('2026-08-31T10:30:00.000Z', now), false)
  assert.equal(isScheduledAtInPast(undefined, now), false)
  assert.equal(isScheduledAtInPast('not-a-date', now), false)
})
```

- [ ] **Step 2: 确认测试失败**

Run: `node --experimental-strip-types --test scripts/r4-task-view-rules.test.mjs`

Expected: FAIL，因为 `isScheduledAtInPast` 尚未导出。

- [ ] **Step 3: 实现最小纯函数**

```ts
export function isScheduledAtInPast(value: string | undefined, now = new Date()): boolean {
  const scheduledTimestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(scheduledTimestamp) && scheduledTimestamp < now.getTime()
}
```

- [ ] **Step 4: 确认纯函数测试通过**

Run: `node --experimental-strip-types --test scripts/r4-task-view-rules.test.mjs`

Expected: PASS，且过去、当前、未来、空值和非法值五种情况全部通过。

### Task 2: 在所有 Store 排期入口拒绝过去时段

**Files:**
- Modify: `Auralis-PC/src/store/useTaskStore.ts:1-17,553-603`
- Modify: `Auralis-PC/scripts/r4-task-store-schedule.test.mjs:24-70`

**Interfaces:**
- Consumes: `isScheduledAtInPast(value: string | undefined, now?: Date): boolean`。
- Produces: `assertScheduleIsNotPast(scheduledAt: string | undefined): void`，抛出 `Error('不能排期到过去的时间')`。

- [ ] **Step 1: 写入失败的 Store 边界测试**

```js
test('all timeline scheduling entries reject a past target before persistence', () => {
  assert.match(source, /import \{[^}]*isScheduledAtInPast/)
  assert.match(source, /function assertScheduleIsNotPast\(scheduledAt: string \| undefined\): void/)
  assert.match(source, /throw new Error\('不能排期到过去的时间'\)/)
  for (const entry of ['scheduleTask', 'scheduleTaskToDay', 'rescheduleTask']) {
    assert.match(source, new RegExp(`async function ${entry}[\\s\\S]*?assertScheduleIsNotPast\\(model\\.scheduledAt\\)`))
  }
})
```

- [ ] **Step 2: 确认 Store 边界测试失败**

Run: `node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs`

Expected: FAIL，因为三个入口尚未共享过去时段保护。

- [ ] **Step 3: 在 Store 实现并接入校验**

```ts
function assertScheduleIsNotPast(scheduledAt: string | undefined): void {
  if (isScheduledAtInPast(scheduledAt)) throw new Error('不能排期到过去的时间')
}

const model = toTaskModel({ ...task, status: task.status, startTime: `${selectedDay.value} ${slotTime}` })
assertScheduleIsNotPast(model.scheduledAt)
```

在 `scheduleTaskToDay` 的默认时段模型和 `rescheduleTask` 的目标模型中重复调用该断言；`rescheduleTask` 必须在检查占用任务和调用 `swapSchedules` 前完成断言，确保过去目标不会发起交换。

- [ ] **Step 4: 确认 Store 测试通过**

Run: `node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-dashboard-timeline.test.mjs`

Expected: PASS，现有拖放载荷和错误反馈断言不回归。

### Task 3: 同步页面说明、风险记录与发布记录

**Files:**
- Modify: `docs/modules/FrontendPC.md:149`
- Modify: `docs/design/Frontend.md:151-153`
- Modify: `docs/current/Status.md:28`
- Modify: `docs/current/IssuesAndReview.md:45`
- Modify: `docs/release/Changelog.md:13-17`

**Interfaces:**
- Consumes: 已批准设计和 Task Store 的统一错误行为。
- Produces: 当前模块、设计、状态/风险和发布文档对“过去时段拒绝”的一致描述。

- [ ] **Step 1: 更新现行文档**

将 PC 模块和设计文档明确为：三条排期入口在目标时间早于当前时拒绝，不修改任务、不调用 API 或离线同步，并使用既有页面错误反馈。状态、风险和 Changelog 只记录本轮实际命令结果，保留 Tauri GUI 拖放与真实服务为人工验收边界。

- [ ] **Step 2: 检查文档与补丁格式**

Run: `git diff --check -- Auralis-PC/src/services/taskViewRules.ts Auralis-PC/src/store/useTaskStore.ts Auralis-PC/scripts/r4-task-view-rules.test.mjs Auralis-PC/scripts/r4-task-store-schedule.test.mjs docs/modules/FrontendPC.md docs/design/Frontend.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md`

Expected: exit 0；Windows 行尾转换警告可以记录，但不得有空白错误。

### Task 4: 执行完整 PC 验证

**Files:**
- Verify only: `Auralis-PC/`

**Interfaces:**
- Consumes: Tasks 1–3 的实现。
- Produces: 自动测试、类型、静态门禁和 Web 构建证据。

- [ ] **Step 1: 运行完整回归**

Run: `npm.cmd run test:r4-pc`

Expected: exit 0，所有 PC 测试通过。

- [ ] **Step 2: 运行类型和静态门禁**

Run: `npm.cmd run type-check`

Expected: exit 0。

Run: `npm.cmd run check:r4-pc`

Expected: exit 0。

- [ ] **Step 3: 运行生产构建**

Run: `npm.cmd run build`

Expected: exit 0；既有 chunk 体积或浏览器外置模块警告如仍存在，记录为非阻断警告。

- [ ] **Step 4: 人工验收边界**

在 Tauri 中分别拖动未排期任务到过去的日视图槽位、当前/未来槽位、周视图过去日期，以及将已排期任务换位到过去槽位。确认错误提示、原位置保留和重启后服务端数据一致；该步骤不能由自动命令替代。
