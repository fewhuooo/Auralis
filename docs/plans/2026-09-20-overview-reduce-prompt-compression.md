# Overview Reduce Prompt Balanced Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Overview Reduce call a dedicated balanced-compression system prompt targeting approximately 2500–3000 serialized JSON characters without changing MAP behavior or public contracts.

**Architecture:** Add an internal prompt-purpose dimension beside the existing output stage. Source MAP, Subject direct generation, and REDUCE select their own prompt purpose; chunk/document packing uses the same purpose as the eventual Provider call so prompt-fit accounting remains exact. Only REDUCE appends the new synthesis rules, while all existing schema, budget, validation, grouping, Provider, API, and persistence boundaries remain unchanged.

**Tech Stack:** Java 21, Spring Boot, JUnit 5, Mockito, AssertJ, Maven Wrapper.

## Global Constraints

- MAP must keep the current intermediate and final prompt behavior.
- Every non-final and final REDUCE call must receive the dedicated balanced-compression instruction.
- Reduce output target is approximately 2500–3000 serialized JSON characters; the prompt must explicitly prohibit padding.
- Do not change `max_tokens` (`4608` intermediate, `6144` final), intermediate JSON limit (`5200`), prompt limit (`12000` default), grouping, retries, schema, aliases, locator, mode, Provider, timeout, error codes, API, OpenAPI, database, or PC cache behavior.
- Do not add automatic compression retry.
- Preserve the dirty primary worktree; modify only the isolated branch and task-owned files.

---

### Task 1: Route MAP and REDUCE to distinct prompts

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`

**Interfaces:**
- Consumes: existing `OutputStage`, `invoke`, `packChunks`, `packDocuments`, `fits`, `messageLength`, and captured `AiProviderRequest` tests.
- Produces: internal `PromptPurpose` routing and a Reduce-only system instruction; no public interface changes.

- [ ] **Step 1: Write failing prompt-routing tests**

Extend `AiOverviewServiceTests` using captured requests and their USER payload fields:

```java
List<AiProviderRequest> reduceRequests = requests.stream()
        .filter(request -> request.messages().get(1).content().contains("\"mapJson\""))
        .toList();
List<AiProviderRequest> mapRequests = requests.stream()
        .filter(request -> request.messages().get(1).content().contains("\"chunks\""))
        .toList();
```

Assert both intermediate and final Reduce requests contain stable fragments covering all required behavior:

```java
assertThat(instruction)
        .contains("already-compressed overview JSON")
        .contains("do not summarize each input separately")
        .contains("duplicate, overlapping, adjacent, or equivalent topics")
        .contains("Do not create one chapter or section per input document")
        .contains("State each fact once")
        .contains("definitions, conceptual relationships, causal chains, key conclusions")
        .contains("examples, rhetoric, procedural narration")
        .contains("fewer, denser chapters and sections")
        .contains("2500 and 3000 characters")
        .contains("Do not pad");
```

Assert final single-batch MAP and Subject direct requests do not contain `already-compressed overview JSON` or `do not summarize each input separately`. Keep the existing intermediate MAP assertions for `preserve every distinct topic/section` and `Target compact serialized JSON <=3600 chars`.

- [ ] **Step 2: Run RED and confirm the missing Reduce prompt**

Run from `Auralis-Server`:

```powershell
.\mvnw.cmd -B -ntp -Dtest=AiOverviewServiceTests test
```

Expected: the new Reduce-routing assertions fail because final Reduce currently receives only the base system instruction and non-final Reduce receives the MAP-oriented intermediate instruction.

- [ ] **Step 3: Add internal prompt-purpose routing**

Add an internal enum without changing `OutputStage`:

```java
private enum PromptPurpose { MAP, REDUCE, SUBJECT_DIRECT }
```

Thread `PromptPurpose` through `invoke`, `fits`, `messageLength`, and `systemInstruction`:

```java
private String systemInstruction(OutputStage stage, PromptPurpose purpose) {
    if (purpose == PromptPurpose.REDUCE) {
        return SYSTEM_INSTRUCTION + "\n" + REDUCE_INSTRUCTION;
    }
    if (purpose == PromptPurpose.MAP && stage == OutputStage.INTERMEDIATE) {
        return SYSTEM_INSTRUCTION + "\n" + INTERMEDIATE_MAP_INSTRUCTION;
    }
    return SYSTEM_INSTRUCTION;
}
```

Use `PromptPurpose.MAP` for source chunk packing/invocation, `PromptPurpose.REDUCE` for document packing/invocation, and `PromptPurpose.SUBJECT_DIRECT` for `generateSubject`. Prompt-fit checks must use the same purpose as the later Provider request.

- [ ] **Step 4: Add the balanced Reduce instruction**

Define one private constant in `OverviewGenerationService`:

```java
private static final String REDUCE_INSTRUCTION = """
        Reduce JSON: inputs are already-compressed overview JSON documents. Synthesize them into one cohesive overview; do not summarize each input separately.
        Merge duplicate, overlapping, adjacent, or equivalent topics. Do not create one chapter or section per input document.
        State each fact once in the most appropriate of outline, summary.overview, keyPoints, or learningPath; avoid repeating the same idea across fields.
        Preserve definitions, conceptual relationships, causal chains, key conclusions, and only evidence required to understand them. Remove examples, rhetoric, procedural narration, repeated caveats, repeated conclusions, and low-value detail first.
        Use fewer, denser chapters and sections, short titles, and concise sentences. Do not quote input wording or add facts.
        For inputs requiring substantial synthesis, target serialized JSON between 2500 and 3000 characters while obeying requested mode, aliases, schema, and locator=null. Do not pad to reach the target.
        """.strip();
```

Extract the existing intermediate MAP suffix into `INTERMEDIATE_MAP_INSTRUCTION` without changing its text.

- [ ] **Step 5: Run GREEN and focused regressions**

```powershell
.\mvnw.cmd -B -ntp -Dtest=AiOverviewServiceTests test
.\mvnw.cmd -B -ntp -Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderContractTests,AiProviderResilienceTests test
```

Expected: all selected tests pass; existing token, size, self-pair, no-progress, schema, alias, mode, security, and Source-fence assertions remain green.

- [ ] **Step 6: Commit Task 1**

Stage only the service and service test, then commit:

```text
fix(server): strengthen overview reduce compression
```

---

### Task 2: Document and verify the Reduce prompt change

**Files:**
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: Task 1 implementation and exact automated test results.
- Produces: current documentation that distinguishes code/test evidence from real Provider quality acceptance.

- [ ] **Step 1: Update current documentation**

Record that MAP behavior is unchanged and all Reduce calls now receive the dedicated balanced-compression prompt targeting approximately 2500–3000 characters. Record unchanged budgets and hard limits. State that automated tests verify routing and invariants, while real DeepSeek compression, content coverage, latency, token use, and cost remain unverified until a real sample run.

- [ ] **Step 2: Run final Server verification**

From `Auralis-Server` run:

```powershell
.\mvnw.cmd -B -ntp -Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderContractTests,AiProviderResilienceTests test
.\mvnw.cmd -B -ntp -DskipTests test-compile
```

From the repository root run:

```powershell
git diff --check
```

Record exact command lines, exit codes, test counts, warnings, and unverified external boundaries.

- [ ] **Step 3: Reviewer gate**

Use one read-only reviewer. It must inspect requirement compliance, prompt routing, exact prompt-fit accounting, MAP/Subject isolation, existing validation and security boundaries, tests, and documentation. Stop only when BLOCKER=0 and IMPORTANT=0.

- [ ] **Step 4: Commit Task 2**

Stage only the four documentation files and commit:

```text
docs(server): record reduce prompt compression
```
