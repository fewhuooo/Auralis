# PC Completed Scheduled Task Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline, test-first execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a completed, scheduled task visible at its original timeline slot while preventing drag, replacement, or unscheduling until it is marked incomplete again.

**Architecture:** The Task Store is the authoritative guard because all timeline and dashboard drag paths call its scheduling methods. The two Vue views derive their `draggable` and drop affordances from the same completed-and-scheduled predicate so the UI does not invite an operation that the Store rejects.

**Tech Stack:** Vue 3, Pinia, TypeScript, Node assertion-based PC regression scripts.

## Global Constraints

- Keep `scheduledAt` unchanged when only task status becomes `DONE`.
- A completed task with `scheduledAt` remains displayed in the selected timeline slot.
- A completed scheduled task cannot be moved, replaced, or unscheduled; marking it incomplete restores normal scheduling behavior.
- Preserve the dirty working tree and do not create a commit for this task.
- 对用户明确弃用的本地展示态缓存不保留转换兼容；仅接受现行 API 领域状态，旧记录忽略后由在线刷新重建。

---

### Task 1: Lock completed scheduled tasks at the Store boundary

**Files:**

- Modify: `Auralis-PC/src/store/useTaskStore.ts`
- Test: `Auralis-PC/scripts/r4-task-store-schedule.test.mjs`

**Interfaces:**

- Consumes: `Task.status`, `Task.scheduledAt`, `scheduleTask`, `rescheduleTask`, and `unscheduleTask`.
- Produces: rejected schedule mutations when a completed scheduled task would be removed, moved, or replaced.

- [x] Write a failing test that asserts a completed scheduled task remains in its slot and causes `scheduleTask`, `rescheduleTask`, and `unscheduleTask` to reject before persistence.
- [x] Run `node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs` and confirm the guard is absent.
- [x] Add one Store predicate for `status === 'completed' && scheduledAt`; use it before every mutation that would move, replace, or clear such a task. Remove the deprecated local presentation-status fallback so only canonical API statuses enter the timeline projection.
- [x] Re-run the focused Store suite and confirm the new regression passes.

### Task 2: Remove invalid drag affordances in timeline views

**Files:**

- Modify: `Auralis-PC/src/views/Timeline/index.vue`
- Modify: `Auralis-PC/src/views/Dashboard/index.vue`
- Test: `Auralis-PC/scripts/r4-dashboard-timeline.test.mjs`

**Interfaces:**

- Consumes: timeline slot `Task` values and the Store scheduling methods.
- Produces: completed scheduled cards with `draggable=false`; drops onto their slots do not start replacement.

- [x] Write a failing static regression that requires both view templates to bind scheduled-card draggability to the completed state and to bypass a completed target slot.
- [x] Run `node --experimental-strip-types --test scripts/r4-dashboard-timeline.test.mjs` and confirm the template guard is absent.
- [x] Bind scheduled-card `draggable` to the lock predicate and reject drops onto a completed slot before invoking Store mutations in both views.
- [x] Re-run the focused timeline suite and confirm the new regression passes.

### Task 3: Verify and document the lock semantics

**Files:**

- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [x] Run the two focused Node suites and the complete `npm run test:r4-pc` command.
- [x] Record exact command results and preserve unrelated current failures without claiming GUI acceptance.
- [x] Document that completed scheduled tasks are fixed at their slot until explicitly reopened.
