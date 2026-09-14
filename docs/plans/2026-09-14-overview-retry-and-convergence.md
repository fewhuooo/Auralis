# Overview Retry and Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop PC recovery events from silently regenerating failed file Overviews, add explicit manual retry UI, and make Server MAP/REDUCE outputs bounded and diagnosable.

**Architecture:** PC keeps the existing `READY | FAILED` cache schema and treats `FAILED` or partial `READY` as terminal for automatic triggers; only `regenerateFileOverview` may retry. Server classifies each Provider call as intermediate or final, applies stage-specific token limits, validates intermediate serialized size and pair-fit, and exposes stable 502 error codes for oversized output and Reduce no-progress.

**Tech Stack:** Vue 3, TypeScript, Node `node:test`, Tauri PC client; Java 25, Spring Boot, JUnit 5, AssertJ, Mockito; Antigravity MCP for PC implementation; Luna subagents for Server implementation and review.

## Global Constraints

- Preserve every pre-existing uncommitted change; do not reset, restore, checkout, clean, or stage unrelated files.
- PC implementation must use Antigravity MCP. Because current Overview files are untracked or modified outside `HEAD`, run a scoped Antigravity background task against the current workspace and review its exact before/after diff.
- Run the PC and Server implementation tasks serially because both operate on the shared working tree.
- Do not modify `Auralis-PC/src/services/localSchema.ts`, the SQLite schema version, `docs/contracts/Database.md`, authentication, Provider credentials, deployment topology, or Mobile runtime code.
- Do not add automatic retry, cooldown, backoff, a generation table, Server single-flight, status polling, or cross-instance idempotency.
- Intermediate calls use `maxTokens = 1024`; final calls use `maxTokens = 4096`; normalized intermediate JSON is at most `4000` Java characters and must fit in a Reduce prompt when paired with itself.
- Implementation follows TDD: add one failing behavior test, run it and record the expected failure, then write only enough production code to pass.
- Do not create implementation commits while the working tree contains overlapping user changes unless the user separately authorizes the exact staged paths. Preserve changes unstaged and report them by file.

---

### Task 1: PC automatic-trigger terminal policy and safe failure classification

**Files:**
- Modify: `Auralis-PC/scripts/r4-overview-generation.test.mjs`
- Create: `Auralis-PC/src/services/overviewFailurePolicy.ts`
- Modify: `Auralis-PC/src/services/overviewGenerationService.ts`

**Interfaces:**
- Consumes: `FileOverviewRecord.status`, `FileOverviewRecord.errorCode`, `ApiProblemError.problem.status`, and the existing six-value `FileOverviewTrigger` union.
- Produces: `classifyOverviewFailure(error: unknown): { code: string; detail: string }`, `overviewFailureMessage(errorCode: string | null | undefined): string`, and automatic trigger behavior where only a missing cache starts generation.

- [ ] **Step 1: Add failing automatic-trigger tests**

Add this helper beside the existing `sourceApi()` fixture, then add table-driven cases that preseed the fake repository with `FAILED` and partial `READY` records, invoke all automatic trigger values, and assert zero Provider calls:

```js
const automaticTriggers = [
  'SOURCE_READY',
  'RESUME_BOOTSTRAP',
  'RESUME_ONLINE',
  'RESUME_SYNC',
  'JOB_CHANGED',
]

function readyService(repository, generateSourceOverview) {
  return new OverviewGenerationService({
    api: { generateSourceOverview },
    repository,
    sourceApi: sourceApi({
      id: 'source-1',
      type: 'FILE',
      ingestionStatus: 'READY',
      ingestionRevision: 'rev-1',
    }),
  })
}

test('automatic triggers require a missing cache and never retry failed or partial records', async () => {
  const records = [
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outline: null, summary: null,
      status: 'FAILED', errorCode: 'MODEL_TIMEOUT', errorDetail: 'safe' },
    { sourceId: 'source-1', ingestionRevision: 'rev-1', title: '文件总览', outline, summary: null,
      status: 'READY', errorCode: null, errorDetail: null },
  ]
  for (const existing of records) {
    const repository = new FakeOverviewRepository()
    repository.files.set('source-1:rev-1', existing)
    let calls = 0
    const service = readyService(repository, async () => {
      calls += 1
      return response('ALL')
    })

    for (const trigger of automaticTriggers) {
      await service.generateReadyFileOverview('source-1', 'rev-1', trigger)
    }
    assert.equal(calls, 0)
  }
})

test('automatic trigger still generates once when the current revision has no cache', async () => {
  const repository = new FakeOverviewRepository()
  let calls = 0
  const service = readyService(repository, async () => {
    calls += 1
    return response('ALL')
  })

  await service.generateReadyFileOverview('source-1', 'rev-1', 'SOURCE_READY')
  assert.equal(calls, 1)
})
```

- [ ] **Step 2: Run the focused RED test**

Run:

```powershell
cd D:\CodeBase\Active\Auralis\Auralis-PC
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs
```

Expected: the `FAILED` and partial `READY` case fails because `generateReadyFileOverview` currently calls `generateSourceOverview` whenever `isComplete(existing)` is false.

- [ ] **Step 3: Add failing manual-retry and classification tests**

Add tests proving two simultaneous manual retries coalesce to one call, a failed manual part preserves existing content, and a problem with `status: 0` becomes `OVERVIEW_STATUS_UNKNOWN` without persisting the raw message:

```js
test('manual retry bypasses terminal cache policy and still coalesces duplicate clicks', async () => {
  const repository = new FakeOverviewRepository()
  repository.files.set('source-1:rev-1', {
    sourceId: 'source-1', ingestionRevision: 'rev-1', title: '', outline: null, summary: null,
    status: 'FAILED', errorCode: 'MODEL_TIMEOUT', errorDetail: 'safe',
  })
  const gate = Promise.withResolvers()
  let calls = 0
  const service = readyService(repository, async () => {
    calls += 1
    await gate.promise
    return response('ALL')
  })

  const first = service.regenerateFileOverview('source-1', 'ALL')
  const second = service.regenerateFileOverview('source-1', 'ALL')
  gate.resolve()
  await Promise.all([first, second])
  assert.equal(calls, 1)
})

test('transport uncertainty is persisted as a stable safe code', async () => {
  const repository = new FakeOverviewRepository()
  const service = readyService(repository, async () => {
    throw { problem: { status: 0, detail: 'Failed to fetch https://secret.example' } }
  })

  await service.generateReadyFileOverview('source-1', 'rev-1', 'SOURCE_READY')
  assert.equal(repository.failures[0].code, 'OVERVIEW_STATUS_UNKNOWN')
  assert.doesNotMatch(repository.failures[0].detail, /secret\.example/)
})
```

- [ ] **Step 4: Run the second RED test**

Run the same focused command. Expected: the status-zero test receives `OVERVIEW_GENERATION_FAILED`, while the existing coalescing path remains green.

- [ ] **Step 5: Implement the minimal PC policy through Antigravity**

Invoke Antigravity with write scope limited to the three Task 1 files. Implement this pure policy in `overviewFailurePolicy.ts`:

```ts
const UNCERTAIN_CODES = new Set(['OVERVIEW_STATUS_UNKNOWN', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE'])

export function classifyOverviewFailure(error: unknown): { code: string; detail: string } {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const problem = candidate.problem && typeof candidate.problem === 'object'
    ? candidate.problem as Record<string, unknown>
    : undefined
  const rawCode = typeof candidate.code === 'string'
    ? candidate.code
    : typeof problem?.code === 'string'
      ? problem.code
      : Number(problem?.status) === 0
        ? 'OVERVIEW_STATUS_UNKNOWN'
        : ''
  const code = /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode)
    ? rawCode
    : 'OVERVIEW_GENERATION_FAILED'
  return { code, detail: `Overview generation failed: ${code}`.slice(0, 500) }
}

export function overviewFailureMessage(errorCode: string | null | undefined): string {
  return UNCERTAIN_CODES.has(errorCode ?? '')
    ? '无法确认生成状态，服务器可能仍在处理，请稍后再重新生成'
    : '生成失败，请重新生成'
}
```

Replace the local `safeError` implementation with `classifyOverviewFailure`. After loading `existing` in `generateReadyFileOverview`, keep complete-cache behavior and add terminal skips:

```ts
if (isComplete(existing)) {
  this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'CACHE_COMPLETE' })
  return
}
if (existing?.status === 'FAILED') {
  this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'FAILED_REQUIRES_MANUAL_RETRY' })
  return
}
if (existing?.status === 'READY') {
  this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'PARTIAL_REQUIRES_MANUAL_RETRY' })
  return
}
```

Do not add new triggers, timers, persistence fields, or schema changes.

- [ ] **Step 6: Run Task 1 GREEN tests**

Run the focused generation and cache suites. Expected: all pass and the prior request-ID, deletion fence, revision fence, and coalescing tests remain green.

---

### Task 2: PC visible retry actions and error presentation

**Files:**
- Modify: `Auralis-PC/scripts/r4-subject-overview-ui.test.mjs`
- Modify: `Auralis-PC/src/components/subject/FileOutlineList.vue`
- Modify: `Auralis-PC/src/components/subject/OverviewSummaryView.vue`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`

**Interfaces:**
- Consumes: `overviewFailureMessage(errorCode)`, existing `regenerate` events, and `OverviewGenerationService.regenerateFileOverview`.
- Produces: direct retry buttons for failed file outline/summary surfaces while retaining old content and current `OUTLINE | SUMMARY | ALL` behavior.

- [ ] **Step 1: Add failing UI source-contract tests**

Extend `r4-subject-overview-ui.test.mjs` with exact source assertions:

```js
test('file overview failures expose direct retry actions with classified copy', () => {
  assert.match(fileOutlineSource, />重新生成</)
  assert.match(fileOutlineSource, /emit\('regenerate'/)
  assert.match(summaryViewSource, />重新生成</)
  assert.match(summaryViewSource, /emit\('regenerate'/)
  assert.match(workspaceSource, /overviewFailureMessage\(record\?\.errorCode\)/)
  assert.doesNotMatch(workspaceSource, /setTimeout\([^)]*regenerateFileOverview/)
})
```

- [ ] **Step 2: Run the UI RED test**

Run:

```powershell
node --experimental-strip-types --test scripts/r4-subject-overview-ui.test.mjs
```

Expected: fail because the file failure placeholder only refers users to the more menu and the summary error notice has no inline action.

- [ ] **Step 3: Implement the UI through the same scoped Antigravity task**

Import `overviewFailureMessage` in `SubjectWorkspace/index.vue` and derive display text from `record.errorCode`, not raw Provider details:

```ts
error: record?.status === 'FAILED' ? overviewFailureMessage(record.errorCode) : null
```

In `FileOutlineList.vue`, keep the existing menu and add a direct button in the failed empty state. Use `ALL` when both parts are absent and `OUTLINE` when a summary already exists:

```vue
<button
  v-if="file.status === 'FAILED'"
  type="button"
  class="file-outline__retry"
  @click.stop="emit('regenerate', { fileId: file.id, mode: file.summary ? 'OUTLINE' : 'ALL' })"
>
  重新生成
</button>
```

In `OverviewSummaryView.vue`, add an inline button to the existing error notice and emit the existing `regenerate` event. Disable it while `isGenerating` is true. Do not remove the previously generated summary.

- [ ] **Step 4: Run Task 2 GREEN tests and PC gates**

Run:

```powershell
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-subject-overview-ui.test.mjs
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run check:r4-pc
npm.cmd run check:subject-workspace
npm.cmd run build
```

Expected: every command exits 0. These commands do not constitute Tauri GUI or real network acceptance.

---

### Task 3: Server stage budgets and convergence invariant

**Files:**
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`

**Interfaces:**
- Consumes: `AiProviderRequest.maxTokens`, `AiProviderResponse.outputTokens`, existing `maximumPromptChars()`, `userData(...)`, and `packDocuments(...)`.
- Produces: private `OutputStage { INTERMEDIATE, FINAL }`, stage-specific system instructions, non-null token budgets, and `validateIntermediateOutput(...)`.

- [ ] **Step 1: Add failing stage-budget tests**

Add tests that exercise a single-batch Source, a multi-batch Source, and Subject generation:

```java
@Test
void usesExplicitStageSpecificOutputTokenBudgets() {
    List<AiProviderRequest> requests = new ArrayList<>();
    OverviewGenerationService service = multiBatchService(requests, validDocument("source-1"));

    service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));

    assertThat(requests).extracting(AiProviderRequest::maxTokens)
            .doesNotContainNull()
            .contains(1024, 4096);
}
```

Add separate assertions that single-batch Source and Subject requests use `4096`.

- [ ] **Step 2: Run the token-budget RED test**

Run:

```powershell
cd D:\CodeBase\Active\Auralis\Auralis-Server
.\mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests' test
```

Expected: fail because every Overview request currently has `maxTokens == null`.

- [ ] **Step 3: Add failing intermediate-size tests**

Extend the Provider stub so queued responses can specify `content` and `outputTokens`. Add cases for `outputTokens = 1025`, normalized JSON longer than 4000 characters, and a result whose self-pair prompt exceeds `maximumPromptChars`. Assert `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` and that no Reduce request follows the rejected MAP.

```java
assertThatThrownBy(() -> service.generateSource(userId, request))
        .isInstanceOf(DomainException.class)
        .extracting(error -> ((DomainException) error).code())
        .isEqualTo("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE");
assertThat(requests).hasSize(1);
```

Add a boundary test with two different accepted intermediate documents and assert the next Reduce USER message contains both serialized documents.

- [ ] **Step 4: Run the convergence RED tests**

Run the same focused Maven command. Expected: the oversize cases proceed under current schema-only validation or fail with `VALIDATION_FAILED`, and the new stable-code assertions fail.

- [ ] **Step 5: Implement stage-aware invocation**

Add constants and stage type:

```java
private static final int INTERMEDIATE_MAX_TOKENS = 1_024;
private static final int FINAL_MAX_TOKENS = 4_096;
private static final int MAX_INTERMEDIATE_JSON_CHARS = 4_000;
private enum OutputStage { INTERMEDIATE, FINAL }
```

Make the system prompt explicitly state that an `INTERMEDIATE` response is a compact machine-consumed result bounded to 4000 serialized characters. Pass `OutputStage` to `invoke(...)`, select `maxTokens`, and use the exact stage-specific system message in both the prompt-length check and `AiProviderRequest`.

Classify Source MAP as `FINAL` only when `batches.size() == 1`; otherwise classify every MAP output as `INTERMEDIATE`. Classify Subject generation as `FINAL`. In Reduce, classify group calls as `FINAL` only when `groups.size() == 1`; otherwise use `INTERMEDIATE`.

After parsing an intermediate response, validate all three limits:

```java
private void validateIntermediateOutput(OverviewMode mode, String instruction,
                                        OverviewResponse parsed, AiProviderResponse response) {
    String normalized = write(parsed);
    boolean tokenOverflow = response.outputTokens() > INTERMEDIATE_MAX_TOKENS;
    boolean characterOverflow = normalized.length() > MAX_INTERMEDIATE_JSON_CHARS;
    boolean cannotPair = !fits(mode, instruction,
            userData(mode, instruction, "mapJson", List.of(parsed, parsed)));
    if (tokenOverflow || characterOverflow || cannotPair) {
        throw new DomainException("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE",
                "AI provider overview output exceeded the intermediate budget");
    }
}
```

Do not truncate JSON, drop nodes silently, retry the Provider, or weaken `OverviewDocumentValidator`.

- [ ] **Step 6: Implement and test the no-progress guard code**

Change only the guard error:

```java
if (groups.size() >= current.size()) {
    DomainException failure = new DomainException(
            "OVERVIEW_REDUCE_NO_PROGRESS",
            "Overview reduce could not reduce the intermediate document count");
    logFailureAtPhase(context, "REDUCE", failure);
    throw failure;
}
```

Because accepted intermediates should make this guard unreachable, extract only the pure grouping/progress decision into a package-private production helper if necessary for direct testing; do not add a test-only public method. Update the former `stopsReducingWhenEveryDocumentFitsAloneButNoPairFits` expectation so oversized untrusted output fails earlier with `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE`, and add direct helper coverage for the guard.

- [ ] **Step 7: Run Task 3 GREEN tests**

Run the focused service suite. Expected: all tests pass; multi-round behavior strictly decreases result count and returns one final document.

---

### Task 4: Stable Server errors, HTTP mapping, and consistent logs

**Files:**
- Modify: `Auralis-Server/src/test/java/com/auralis/app/shared/error/GlobalExceptionHandlerTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AiProviderResilienceTests.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiErrorCode.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/error/GlobalExceptionHandler.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`

**Interfaces:**
- Produces: `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` and `OVERVIEW_REDUCE_NO_PROGRESS` as `ApiErrorCode` values mapped to HTTP 502.

- [ ] **Step 1: Add failing HTTP mapping tests**

Add a parameterized test:

```java
@ParameterizedTest
@ValueSource(strings = {
        "OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE",
        "OVERVIEW_REDUCE_NO_PROGRESS"
})
void mapsOverviewBudgetFailuresToBadGateway(String code) {
    var request = new MockHttpServletRequest("POST", "/api/ai/source-overviews");
    var response = new GlobalExceptionHandler().handleDomain(
            new DomainException(code, "safe overview failure"), request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    assertThat(response.getBody().code()).isEqualTo(code);
}
```

- [ ] **Step 2: Run the mapping RED test**

Run:

```powershell
.\mvnw.cmd -B -ntp '-Dtest=GlobalExceptionHandlerTests' test
```

Expected: fail because unknown codes currently fall back to `INTERNAL_ERROR`/500.

- [ ] **Step 3: Implement enum and mapping**

Add both enum constants to `ApiErrorCode` and include them with `MODEL_PROVIDER_ERROR` in the `BAD_GATEWAY` switch branch:

```java
case MODEL_PROVIDER_ERROR, OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE,
        OVERVIEW_REDUCE_NO_PROGRESS -> HttpStatus.BAD_GATEWAY;
```

Also add both names to `OverviewGenerationService.ALLOWED_FAILURE_CODES`.

- [ ] **Step 4: Make phase and final log codes consistent**

In the Provider-document catch, wrap first and log the wrapped exception:

```java
DomainException providerFailure = new DomainException(
        "MODEL_PROVIDER_ERROR",
        "AI provider returned an invalid overview",
        null,
        exception);
logFailureAtPhase(context, phase, providerFailure);
throw providerFailure;
```

Add assertions to the existing output-capture tests that phase and final logs contain the same stable code and omit Provider JSON, source content, URLs, and exception messages.

- [ ] **Step 5: Verify Provider body behavior**

Extend `AiProviderResilienceTests` with a captured request body and assert `max_tokens == 1024`. The production Provider already conditionally serializes this field; this test prevents the Overview service/provider boundary from regressing.

- [ ] **Step 6: Run Task 4 GREEN tests**

Run:

```powershell
.\mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderResilienceTests,GlobalExceptionHandlerTests' test
```

Expected: every test passes with the new 502 mappings and consistent safe logs.

---

### Task 5: Contracts, current-state documentation, and final verification

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/contracts/API.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Documents the implemented behavior and evidence without changing OpenAPI DTOs or Database contracts.

- [ ] **Step 1: Update authoritative documentation**

Record exactly these facts after code tests pass:

```text
PC: FAILED and partial READY file Overview caches are terminal for automatic triggers;
only a visible user retry action creates a new request.

Server: intermediate calls use 1024 max tokens, final calls use 4096;
accepted intermediate normalized JSON is <= 4000 characters and self-pair fits.

API: OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE and OVERVIEW_REDUCE_NO_PROGRESS
return application/problem+json with HTTP 502.
```

Keep Server persistence/idempotency and real Provider/Tauri validation listed as open risks. Do not edit `docs/contracts/Database.md` because no stored shape changes.

- [ ] **Step 2: Run fresh Server and contract gates**

Run:

```powershell
cd D:\CodeBase\Active\Auralis\Auralis-Server
.\mvnw.cmd -B -ntp clean test-compile
.\mvnw.cmd -B -ntp test

cd D:\CodeBase\Active\Auralis
powershell -ExecutionPolicy Bypass -File .\scripts\check-openapi.ps1
```

Expected: fresh compilation and OpenAPI gate exit 0. Full Server tests should be reported exactly; Docker/Testcontainers failures, if any, remain failures and must not be hidden.

- [ ] **Step 3: Re-run final PC gates**

Run `npm.cmd run test:r4-pc`, `type-check`, `check:r4-pc`, `check:subject-workspace`, and `build` from `Auralis-PC`. Expected: all exit 0.

- [ ] **Step 4: Review the complete diff and worktree**

Run:

```powershell
cd D:\CodeBase\Active\Auralis
git diff --check
git status --short
git diff -- Auralis-PC Auralis-Server docs
```

Verify there are no unexpected generated files, dependency changes, schema migrations, deletions, Server idempotency additions, or edits outside the authorized scope. Distinguish pre-existing changes from this plan's changes in the final report.

- [ ] **Step 5: Perform one Luna read-only final review**

The reviewer checks requirements, obvious bugs, trigger regressions, error-code mapping, logging safety, test gaps, and unauthorized files. The reviewer must not modify files or spawn another reviewer.

- [ ] **Step 6: Hand off manual acceptance**

Manual checks remain:

```text
1. Upload a new long document and observe one automatic Overview request.
2. Force a deterministic Server failure and confirm restart/sync/online events do not POST again.
3. Confirm the visible retry button starts exactly one new request.
4. Force network interruption/PC timeout and confirm the uncertainty message appears.
5. Generate a long real document and confirm MAP outputs remain bounded and Reduce converges.
```

Do not describe the feature as business-accepted until these external checks are actually performed.
