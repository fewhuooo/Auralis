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
- Intermediate calls use `maxTokens = 3072`; final calls use `maxTokens = 4096`; normalized intermediate JSON is at most `5200` Java characters and must fit in a Reduce prompt when paired with itself (`12000` characters).
- Implementation follows TDD: add one failing behavior test, run it and record the expected failure, then write only enough production code to pass.
- Do not create implementation commits while the working tree contains overlapping user changes unless the user separately authorizes the exact staged paths. Preserve changes unstaged and report them by file.

### Task 4E: Temporary final JSON diagnosis

- [x] Add TDD coverage for the serialized DeepSeek FINAL JSON-mode envelope and safe FINAL valid/invalid JSON check logs.
- [x] Log only allowlisted `AI_JSON_MODE` fields from the serialized body; before the existing validator, run `FINAL_JSON_CHECK` directly on raw `message.content` and log only scale/location/type metadata. No fence stripping is performed for this diagnostic, so fenced JSON is intentionally `valid=false` even though the existing validator may normalize it later.
- [ ] Deploy and rerun the real DeepSeek Overview request; automated green does not close the external validation or business acceptance boundary.

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
            .contains(3072, 4096);
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

Extend the Provider stub so queued responses can specify `content` and `outputTokens`. Add cases for normalized JSON at `5200` (accepted), `5201` (rejected), and a result whose self-pair prompt exceeds `maximumPromptChars`. Assert `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` and that no Reduce request follows the rejected MAP; do not reject solely on output token usage.

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
 private static final int INTERMEDIATE_MAX_TOKENS = 3_072;
 private static final int FINAL_MAX_TOKENS = 4_096;
 private static final int MAX_INTERMEDIATE_JSON_CHARS = 5_200;
private enum OutputStage { INTERMEDIATE, FINAL }
```

Make the system prompt explicitly state that an `INTERMEDIATE` response is a compact machine-consumed result bounded to 5200 serialized characters. Pass `OutputStage` to `invoke(...)`, select `maxTokens`, and use the exact stage-specific system message in both the prompt-length check and `AiProviderRequest`.

Classify Source MAP as `FINAL` only when `batches.size() == 1`; otherwise classify every MAP output as `INTERMEDIATE`. Classify Subject generation as `FINAL`. In Reduce, classify group calls as `FINAL` only when `groups.size() == 1`; otherwise use `INTERMEDIATE`.

After parsing an intermediate response, validate the normalized-character and self-pair limits:

```java
private void validateIntermediateOutput(OverviewMode mode, String instruction,
                                        OverviewResponse parsed, AiProviderResponse response) {
    String normalized = write(parsed);
    boolean characterOverflow = normalized.length() > MAX_INTERMEDIATE_JSON_CHARS;
    boolean cannotPair = !fits(mode, instruction,
            userData(mode, instruction, "mapJson", List.of(parsed, parsed)));
    if (characterOverflow || cannotPair) {
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

Extend `AiProviderResilienceTests` with a captured request body and assert the permanent Overview stage values `max_tokens == 3072` and `max_tokens == 4096`. The production Provider already conditionally serializes this field; this test prevents the Overview service/provider boundary from regressing.

- [ ] **Step 6: Run Task 4 GREEN tests**

Run:

```powershell
.\mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderResilienceTests,GlobalExceptionHandlerTests' test
```

Expected: every test passes with the new 502 mappings and consistent safe logs.

---

### Task 4A: DeepSeek structured Overview response contract

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiProviderRequest.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/OpenAiCompatibleProvider.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiProviderResilienceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiStreamingTests.java`

**Interfaces:**
- Consumes: the existing four-argument `AiProviderRequest` construction used by chat, streaming, tests, and
  compatibility providers.
- Produces: `AiProviderRequest.structuredJson()`; Overview requests set it to `true`, while the existing
  four-argument constructor delegates with `false` so non-Overview behavior is unchanged.

- [ ] **Step 1: Add the failing request-semantics tests**

In `AiOverviewServiceTests`, assert every request captured from Source MAP/REDUCE and Subject direct
generation has `structuredJson() == true`. In `AiProviderResilienceTests`, construct a structured request and
capture the serialized DeepSeek body:

```java
AiProviderRequest request = new AiProviderRequest(
        "deepseek-v4-flash",
        List.of(new AiProviderRequest.Message(AiMessageRole.USER, "return json")),
        0.1,
        1_024,
        true);

JsonNode body = new ObjectMapper().readTree(capturedBody.get());
assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
assertThat(body.path("thinking").path("type").asText()).isEqualTo("disabled");
```

Add a second request using the existing four-argument constructor and assert both fields are absent. Instantiate
`DeepSeekAiProvider` for the DeepSeek case so the test exercises the actual provider type.

- [ ] **Step 2: Run the request-semantics RED tests**

Run:

```powershell
cd D:\CodeBase\Active\Auralis\Auralis-Server
.\mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests,AiProviderResilienceTests' test
```

Expected: test compilation fails because `structuredJson` and the five-argument constructor do not exist.

- [ ] **Step 3: Extend the internal request without breaking ordinary callsites**

Change the record to:

```java
public record AiProviderRequest(
        String model,
        List<Message> messages,
        Double temperature,
        Integer maxTokens,
        boolean structuredJson) {

    public AiProviderRequest(String model, List<Message> messages,
                             Double temperature, Integer maxTokens) {
        this(model, messages, temperature, maxTokens, false);
    }

    public AiProviderRequest {
        messages = List.copyOf(messages);
    }
}
```

Set the final argument to `true` only in `OverviewGenerationService.invoke`.

- [ ] **Step 4: Serialize structured request controls at the provider boundary**

In `OpenAiCompatibleProvider.requestBody`, add:

```java
if (request.structuredJson()) {
    body.put("response_format", Map.of("type", "json_object"));
    if (providerType == AiProviderType.DEEPSEEK) {
        body.put("thinking", Map.of("type", "disabled"));
    }
}
```

Do not infer structured mode from `maxTokens`, model names, prompt text, or whether the call is streaming.

- [ ] **Step 5: Run the request-semantics GREEN tests**

Run the Step 2 command. Expected: all selected tests pass, ordinary requests omit both new JSON members, and
all Overview requests remain structured.

- [ ] **Step 6: Add the failing safe-envelope diagnostic test**

Return this controlled 2xx body from the fake transport:

```json
{
  "choices": [{
    "finish_reason": "length",
    "message": {"content": null, "reasoning_content": "sensitive-reasoning-marker"}
  }],
  "usage": {"prompt_tokens": 100, "completion_tokens": 1024}
}
```

Using Spring Boot's `OutputCaptureExtension`, assert the call still throws `MODEL_PROVIDER_ERROR`; the warning
contains `provider=DEEPSEEK`, an allowlisted model identifier, `finishReason=length`,
`hasReasoningContent=true`, bounded `reasoningChars`/`contentChars`, and token/count metadata; and
it does not contain `sensitive-reasoning-marker`, request content, endpoint URL, or API key.

- [ ] **Step 7: Run the diagnostic RED test**

Run:

```powershell
.\mvnw.cmd -B -ntp '-Dtest=AiProviderResilienceTests' test
```

Expected: the controlled response already fails safely, but the new allowlisted diagnostic assertion fails
because `parseResponse` currently logs no response-envelope metadata.

- [ ] **Step 8: Add bounded envelope diagnostics without content fallback**

Pass the request into `parseResponse`. Before throwing for missing, non-textual, or blank content, log a single
warning containing only bounded metadata derived from node types, counts, `finish_reason`, and `usage`. Never
serialize the response node and never log `content` or `reasoning_content`. Keep the thrown public code and
message as `MODEL_PROVIDER_ERROR` / `AI provider returned an invalid response`.

- [ ] **Step 9: Run Task 4A GREEN and compatibility tests**

Before the final command, add compatibility assertions that captured ordinary streaming requests have
`structuredJson=false`; ordinary OpenAI-compatible requests omit both structured members; and structured
OpenAI-compatible requests include `response_format=json_object` but omit the DeepSeek-only `thinking` member.

Run:

```powershell
.\mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderResilienceTests,AiStreamingTests,AiStreamingControllerTests' test
```

Expected: all selected tests pass. This proves request serialization and safe adapter behavior, not a real
DeepSeek response or production deployment.

---

### Task 4B: Measure natural DeepSeek Overview output

This temporary diagnostic task supersedes the Task 4 token ceilings only for current Overview completion
requests. Source/Subject API contracts, ordinary chat/stream behavior, schema validation and convergence
guards remain unchanged.

- [x] Set Overview `AiProviderRequest.maxTokens` to `null` for MAP, REDUCE and direct calls, and assert the
  serialized structured DeepSeek body omits `max_tokens`.
- [x] Remove the intermediate `outputTokens>1024` pre-parse rejection while retaining normalized JSON
  `<=4000` characters and self-pair prompt fit.
- [x] Carry allowlisted `finish_reason` in `AiProviderResponse`, retaining the three-argument compatibility
  constructor; normalize unknown, overlong and newline-bearing values to `other`.
- [x] Record `responseChars`, `outputTokens` and safe `finishReason` at `JSON_PARSE_START` without logging
  response content.
- [x] Run fresh test compilation and the Overview/Provider/Streaming compatibility suite.
- [x] Rebuild the local backend and trigger one real Overview attempt. MAP 1–5 returned complete JSON with
  `finishReason=stop`; observed output tokens were 991, 1367, 1731, 1613 and 2071. MAP 5 then hit the retained
  intermediate convergence guard, so MAP 6/REDUCE did not run.
- [x] Add allowlisted `INTERMEDIATE_BUDGET_CHECK` diagnostics distinguishing normalized-character overflow
  from self-pair overflow without logging content or prompts.
- [x] Rebuild the local backend with the budget diagnostics and confirm the container is healthy.
- [x] Trigger another real Overview attempt: MAP2 measured `normalizedChars=5105>4000` and
  `selfPairPromptChars=11450<=12000`, proving character-only overflow after a natural `stop`.
- [x] Choose and verify the permanent compact-output/batching/ceiling policy from both real runs: intermediate `3072`, final `4096`, normalized intermediate JSON `5200`, self-pair `12000`.

### Task 4C: Test coverage-preserving intermediate prompt compression

- [x] Add a failing service test asserting that only intermediate requests instruct the model to preserve every
  distinct topic, merge only duplicate/equivalent nodes, shorten descriptive fields, and target `<=3600`
  serialized characters without adding chapter/section count caps.
- [x] Run `AiOverviewServiceTests` and confirm the new assertion fails because the existing prompt only says
  `compact <=4000 chars`.
- [x] Replace the one-line intermediate suffix with the approved coverage-preserving compression directive;
  leave the final prompt, validators, batching and Provider request parameters unchanged.
- [x] Re-run `AiOverviewServiceTests`, then the 58-test Overview/Provider/Streaming compatibility set.
- [x] Review the exact diff and safe prompt boundaries, rebuild only backend, and run the same 42-chunk real
  generation. All six MAP outputs fit; REDUCE group 2 returned 4678 chars with self-pair 10899/12000, so
  prompt compression alone is insufficient as a hard guarantee.

---

### Task 4D: Permanent bounded completion policy (2026-09-15)

- [x] Record the approved permanent policy: intermediate MAP/non-final REDUCE `3072`, final completion
  `4096`, normalized intermediate JSON `5200`, self-pair prompt `12000`; retain the compact prompt and
  do not add automatic compression retry or output-token post-rejection.
- [x] Add RED tests for stage-specific request budgets and normalized `5200`/`5201` boundaries, then
  implement only stage selection and the normalized limit.
- [x] Verify focused Overview `38/38` and Overview/Provider/Controller/Streaming compatibility `63/63`.
- [x] Deploy the tested backend image and verify the container is healthy.
- [ ] Complete real DeepSeek end-to-end and business content-coverage acceptance. The first deployed
  42-chunk run passed all MAP and first-round REDUCE calls, then failed final JSON parsing after a 2xx,
  natural `stop`, `2992` output tokens and `6556` response characters.

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

Server: intermediate calls use 3072 max tokens, final calls use 4096;
accepted intermediate normalized JSON is <= 5200 characters and self-pair fits within 12000.

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
