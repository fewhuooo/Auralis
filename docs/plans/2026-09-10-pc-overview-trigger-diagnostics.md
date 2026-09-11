# PC File Overview Trigger Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, request-correlated PC lifecycle logs that identify which runtime event starts, coalesces, skips, fails, or releases a file Overview generation attempt.

**Architecture:** `OverviewGenerationService` owns attempt request IDs and structured lifecycle logging; callers supply a closed `FileOverviewTrigger` value instead of the service guessing origin. `useOverviewApi` accepts an optional request context and sends its ID in the existing `X-Overview-Request-Id` header. Runtime and SourceStore only label existing trigger paths; generation, retry, persistence, and Server behavior remain unchanged.

**Tech Stack:** Vue 3, TypeScript 6, Pinia, Axios, Node test runner.

## Global Constraints

- Do not change automatic generation, retry, cache, Provider, Server API, or idempotency behavior.
- Log only `event`, `trigger`, `requestId`, `sourceId`, `revision`, `mode`, `outcome`, `errorCode`, and `durationMs`.
- Never log instruction text, Source title, file content, Provider response, Authorization, API key, URL, or raw exception message.
- Use `gpt-5.6-luna` for every implementation or review subagent.
- Preserve all pre-existing working-tree changes.

---

### Task 1: Correlated request context and lifecycle logging

**Files:**
- Modify: `Auralis-PC/src/types/overview.ts`
- Modify: `Auralis-PC/src/api/useOverviewApi.ts`
- Modify: `Auralis-PC/src/services/overviewGenerationService.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Modify: `Auralis-PC/src/store/useSourceStore.ts`
- Test: `Auralis-PC/scripts/r4-overview-generation.test.mjs`

**Interfaces:**
- Produces: `type FileOverviewTrigger = 'SOURCE_READY' | 'RESUME_BOOTSTRAP' | 'RESUME_ONLINE' | 'RESUME_SYNC' | 'JOB_CHANGED' | 'MANUAL_RETRY'`.
- Produces: `interface OverviewRequestContext { requestId: string }` and optional context parameters on `OverviewApi.generateSourceOverview` and `generateSubjectOverview`.
- Produces: `generateReadyFileOverview(sourceId, ingestionRevision, trigger)` and `resumePending(trigger)`.
- Consumes: the existing `X-Overview-Request-Id`, repository preflight/save/failure methods, and runtime callbacks.

- [x] **Step 1: Write failing behavioral and static tests**

Add tests that capture `console.info`/`console.warn`, inject a deterministic request-ID factory into `OverviewGenerationService`, and assert:

```js
assert.equal(calls.length, 1)
assert.equal(calls[0].context.requestId, 'request-1')
assert.ok(events.some(event => event.event === 'START' && event.trigger === 'RESUME_SYNC'))
assert.ok(events.some(event => event.event === 'COALESCED'))
assert.ok(events.some(event => event.event === 'RELEASED'))
assert.doesNotMatch(JSON.stringify(events), /secret instruction|provider leaked secret/)
```

Static assertions must verify each runtime/SourceStore entry passes its exact trigger literal and `useOverviewApi` uses `context?.requestId` rather than generating a second ID.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs`

Expected: non-zero exit because trigger/context signatures and lifecycle events do not exist.

- [x] **Step 3: Add the closed trigger and request-context types**

In `src/types/overview.ts`, define the exact types and update the API interface:

```ts
export type FileOverviewTrigger = 'SOURCE_READY' | 'RESUME_BOOTSTRAP' | 'RESUME_ONLINE' | 'RESUME_SYNC' | 'JOB_CHANGED' | 'MANUAL_RETRY'
export interface OverviewRequestContext { requestId: string }

export interface OverviewApi {
  generateSourceOverview(request: SourceOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse>
  generateSubjectOverview(request: SubjectOverviewRequest, context?: OverviewRequestContext): Promise<OverviewResponse>
}
```

- [x] **Step 4: Make the API preserve the service-owned request ID**

Update `useOverviewApi` so each method uses `context?.requestId ?? overviewRequestId()` and places that exact value in `X-Overview-Request-Id`. This preserves direct callers while letting the service correlate PC and Server logs.

- [x] **Step 5: Add safe lifecycle logging and single-flight evidence**

Add an injectable `requestIdFactory?: () => string` option. Log one plain object after the fixed prefix:

```ts
console.info('[FILE_OVERVIEW_TRIGGER]', {
  event: 'START', trigger, requestId, sourceId, revision, mode, durationMs: 0,
})
```

Emit `TRIGGER` before preflight, `SKIPPED` with an allowlisted outcome, `COALESCED` when returning an existing Promise, `START` immediately before the API call, `FAILED` with `safeError(error).code`, and `RELEASED` after conditional map deletion. Calculate duration with a monotonic-safe non-negative elapsed value. Logging failures must not alter control flow.

- [ ] **Step 6: Label every existing file trigger**

Pass exact values through existing paths:

```ts
this.resumePending('RESUME_ONLINE')
this.resumePending('RESUME_SYNC')
overviewGeneration.resumePending('JOB_CHANGED')
snapshot.overviewGeneration.resumePending('RESUME_BOOTSTRAP')
fileOverviewGenerator.generateReadyFileOverview(id, revision, 'SOURCE_READY')
fileOverviewGenerator.generateReadyFileOverview(id, revision, 'MANUAL_RETRY')
```

Do not introduce timers, retry loops, new event listeners, or additional API calls.

- [ ] **Step 7: Run focused GREEN verification**

Run: `node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs`

Expected: exit 0 with every Overview generation test passing.

### Task 2: Regression gates and authoritative documentation

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: Task 1 lifecycle event names, trigger literals, safe field allowlist, and unchanged generation behavior.
- Produces: current implementation status, remaining Server idempotency/timeout risk, and accurate verification evidence.

- [ ] **Step 1: Run PC verification gates**

Run from `Auralis-PC`:

```powershell
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run check:r4-pc
```

Run from the repository root:

```powershell
git diff --check
```

Record exact exit codes and test counts. A failure must remain a failure with its first actionable diagnostic; do not rewrite it as passed.

- [ ] **Step 2: Update current documentation**

Document that PC logs now correlate trigger and request lifecycle without changing retry behavior. Keep these risks open: Server lacks same-key concurrency protection; PC 60-second overall Axios timeout is shorter than a possible multi-call Server generation; real Tauri/Provider trigger attribution remains unverified until observed.

- [ ] **Step 3: Review the complete diff**

Run:

```powershell
git diff -- Auralis-PC/src/types/overview.ts Auralis-PC/src/api/useOverviewApi.ts Auralis-PC/src/services/overviewGenerationService.ts Auralis-PC/src/services/documentProcessing/runtime.ts Auralis-PC/src/store/useSourceStore.ts Auralis-PC/scripts/r4-overview-generation.test.mjs docs/modules/FrontendPC.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
```

Expected: only trigger/context plumbing, safe diagnostics, tests, and matching documentation; no Provider, cache schema, API route, retry, timeout, or Server changes.

- [ ] **Step 4: Request an independent read-only review**

Reviewer must inspect requirements, full diff, test evidence, sensitive-data boundaries, request-ID correlation, duplicate-call behavior, and working-tree protection. Reviewer must not modify files or launch another reviewer.
