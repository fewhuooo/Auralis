# Overview Source Deletion Fence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent deleted or locally incomplete file Sources from starting, continuing, or persisting stale Overview generation work.

**Architecture:** PC owns an immediate per-Source deletion fence, an injected exact local READY/revision eligibility check, Axios abort propagation, and late-result rejection. Server source Overview generation revalidates active/READY/revision state immediately before and after every shared Provider invocation, covering every Map and Reduce call without a new cancellation API.

**Tech Stack:** Vue 3, TypeScript 6, Pinia, Axios, Node test runner, Java 21, Spring Boot 4, JUnit 5, Mockito.

## Global Constraints

- Do not add an Overview cancellation HTTP route or change existing request/response DTOs.
- Do not change Map-Reduce grouping, concurrency, Provider selection, timeout, retry, or normal cache semantics.
- Do not add or change database columns, migrations, or Sync fields.
- Deletion fencing must be owner/device scoped through the existing repositories and must not affect another Source ID.
- Never log Source title, file content, instruction, Provider response, Authorization, API key, signed URL, or raw exception text.
- Preserve all pre-existing dirty-worktree changes; do not commit implementation files from the shared checkout.
- Every implementation and review subagent must use `gpt-5.6-luna`.

---

### Task 1: PC deletion fence, exact local eligibility, and late-result rejection

**Files:**
- Modify: `Auralis-PC/src/types/overview.ts`
- Modify: `Auralis-PC/src/api/useOverviewApi.ts`
- Modify: `Auralis-PC/src/services/overviewGenerationService.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Modify: `Auralis-PC/src/store/useSourceStore.ts`
- Test: `Auralis-PC/scripts/r4-overview-generation.test.mjs`
- Test: `Auralis-PC/scripts/r4-file-preview.test.mjs`

**Interfaces:**
- Produces: `OverviewRequestContext { requestId: string; signal?: AbortSignal }`.
- Produces: `OverviewGenerationService.discardFileOverview(sourceId: string): Promise<void>`; the method records the blocked Source synchronously before its first `await`.
- Produces: `Options.isFileGenerationEligible?: (sourceId: string, ingestionRevision: string) => Promise<boolean>`.
- Consumes: `OverviewRepository.removeFileOverviews(sourceId)`, the local Source projection, and exact current document jobs.

- [ ] **Step 1: Write failing PC behavior tests**

Add dynamic tests that assert:

```js
await service.generateReadyFileOverview('deleted-source', 'rev-1', 'RESUME_SYNC')
assert.equal(apiCalls, 0)

const attempt = service.generateReadyFileOverview('source-1', 'rev-1', 'JOB_CHANGED')
await started
await service.discardFileOverview('source-1')
releaseLateResponse()
await attempt
assert.equal(savedResults, 0)
assert.equal(markedFailures, 0)
assert.equal(signal.aborted, true)
assert.deepEqual(removedOverviewSources, ['source-1'])
```

Cover automatic resume, manual regeneration with a non-READY local job, a new Source ID after deleting an old ID, and SourceStore ordering where the Overview fence is invoked before `scheduleSync()` and `documentScheduler.discard(id)`.

- [ ] **Step 2: Run focused PC tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs scripts/r4-file-preview.test.mjs
```

Expected: non-zero exit because local eligibility, abort context, and `discardFileOverview` do not exist.

- [ ] **Step 3: Add abort context and deletion-fence service state**

Extend the internal context exactly as follows:

```ts
export interface OverviewRequestContext {
  requestId: string
  signal?: AbortSignal
}
```

Pass `signal: context?.signal` in both Axios Overview POST configurations. Store `{ promise, requestId, sourceId, controller }` in each file in-flight entry. `discardFileOverview` must synchronously add the Source ID to a blocked set, abort only matching controllers, then remove that Source's file Overview cache.

- [ ] **Step 4: Enforce local eligibility before request and before save**

Add one service helper that returns false when the Source is blocked or the injected eligibility callback rejects the exact `(sourceId, revision)`. Call it before Server preflight/API work and again immediately after the API response. A blocked/aborted attempt records a stable allowlisted skip/cancel outcome, does not call `markFileOverviewFailed`, and never saves the response.

Runtime supplies the callback by requiring both an active current Source projection with the same revision and a matching document job whose phase is exactly `READY`. Manual and automatic file paths reuse the same gate.

- [ ] **Step 5: Put the deletion fence before asynchronous cleanup and Sync**

Extend `FileOverviewGenerator` with `discardFileOverview(sourceId)`. After the local DELETE tombstone is committed and the visible projections are removed, call the Overview deletion entry before `scheduleSync()` and before fire-and-forget document cleanup. Remove the page-specific duplicate file Overview cache cleanup so every deletion entry point uses the Store-owned path.

- [ ] **Step 6: Run focused PC tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs scripts/r4-file-preview.test.mjs scripts/r4-source-processing-schedule.test.mjs scripts/r4-document-processing-runtime.test.mjs
npm.cmd run type-check
```

Expected: exit 0; all selected tests pass and TypeScript/Vue compilation succeeds.

---

### Task 2: Server active Source and revision fence at every Provider boundary

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`

**Interfaces:**
- Consumes: `GenerationContext.userId()`, `sourceId()`, and `revision()` plus `SourceService.requireActiveSource`.
- Produces: a private source-generation fence used only when `context.sourceId()` is non-null.
- Preserves: subject Overview behavior and both HTTP endpoint contracts.

- [ ] **Step 1: Write failing Server fence tests**

Add tests with ordered SourceService responses. The initial validation and pre-provider check return the same active READY Source. After the first Provider response, `requireActiveSource` throws `RESOURCE_NOT_FOUND`, or returns the same Source with a different revision. Assert the request fails with a stable `DomainException` and Provider `complete` is called exactly once; no second Map/Reduce invocation begins.

- [ ] **Step 2: Run the Server focused test and verify RED**

Run:

```powershell
./mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests' test
```

Expected: the new deletion/revision tests fail because `invoke` currently does not revalidate Source state.

- [ ] **Step 3: Add the shared Provider-boundary fence**

Add a private method equivalent to:

```java
private void requireCurrentSource(GenerationContext context) {
    if (context.sourceId() == null) return;
    SourceView current = sourceService.requireActiveSource(context.userId(), context.sourceId());
    if (current.ingestionStatus() != SourceIngestionStatus.READY
            || !Objects.equals(current.ingestionRevision(), context.revision())) {
        throw new DomainException("MUTATION_REJECTED", "Source changed during overview generation");
    }
}
```

Call it immediately before logging/sending `PROVIDER_REQUEST` and immediately after Provider completion, before response parsing. Keep active-source deletion as the existing `RESOURCE_NOT_FOUND` boundary and revision/status change as `MUTATION_REJECTED`.

- [ ] **Step 4: Run Server focused tests and verify GREEN**

Run:

```powershell
./mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests' test
```

Expected: exit 0 with all `AiOverviewServiceTests` passing. If unrelated test-source compilation blocks execution, record the exact compiler error and run no command that hides or skips it.

---

### Task 3: Regression gates and authoritative documentation

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: Task 1 PC fence behavior and Task 2 Server Provider-boundary fence.
- Produces: current implementation status, exact automated evidence, and remaining external acceptance boundaries.

- [ ] **Step 1: Run PC regression gates**

Run from `Auralis-PC`:

```powershell
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run check:r4-pc
```

Record exit codes, total/pass/fail counts, and static file count.

- [ ] **Step 2: Run Server regression gates**

Run from `Auralis-Server`:

```powershell
./mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests' test
./mvnw.cmd -B -ntp test
```

Record exact outcomes. Existing compilation, Docker, H2, or architecture failures remain failures and must not be presented as passing.

- [ ] **Step 3: Run repository diff checks**

Run from repository root:

```powershell
git diff --check
git status --short
```

Confirm the task changed no API/OpenAPI artifact, migration, database contract, Provider configuration, timeout, or Map-Reduce grouping/concurrency code.

- [ ] **Step 4: Update current documentation**

Document the PC deletion fence, exact local READY/revision requirement, request abort/late-result rejection/cache cleanup, and Server pre/post Provider source fence. Record that a Provider call already in progress may finish before the post-call fence stops subsequent work. Keep real Tauri deletion/re-upload, actual Axios disconnect propagation, external Provider behavior, and business acceptance open.

- [ ] **Step 5: Request independent read-only reviews**

Reviewers inspect each task's brief, report, scoped review package, sensitive-data boundary, deletion ordering, cancellation races, revision fencing, test evidence, and dirty-worktree protection. Critical and Important findings must be fixed and re-reviewed before completion.
