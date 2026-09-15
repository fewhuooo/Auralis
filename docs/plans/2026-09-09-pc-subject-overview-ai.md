# PC Subject Overview AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute each assigned task with test-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver local-only file and subject AI overview generation while preserving the current `AI 梳理` button position.

**Architecture:** Spring exposes two authenticated, synchronous, stateless structured-generation endpoints. PC stores derived overview state in owner/device-scoped SQLite with a browser fallback, automatically generates file results after READY ingestion, and generates subject results only after the existing button is clicked.

**Tech Stack:** Java 21, Spring Boot/Modulith, Jackson, Vue 3, Pinia, TypeScript, Tauri SQLite, Node test scripts.

## Global Constraints

- Do not move or rename the current `AI 梳理` button and do not change the three-column widths.
- Use `总览 → 学科总览 + 文件列表`; file outlines render inline and summaries render in the middle preview area.
- Do not add a Server database table, Flyway migration, sync resource, Conversation, or Message.
- Validate and bound generated data; never trust provider JSON or client-owned Source IDs.
- Keep old successful content visible until replacement succeeds.
- Preserve unrelated dirty-worktree changes.

## Locked interfaces

```java
enum OverviewMode { ALL, OUTLINE, SUMMARY }
record SourceOverviewRequest(UUID sourceId, OverviewMode mode, String instruction) {}
record SubjectOverviewRequest(UUID subjectId, OverviewMode mode, String instruction,
                              List<SubjectOverviewSourceInput> sources) {}
record OverviewResponse(int schemaVersion, String title,
                        List<OverviewChapter> outline, OverviewSummary summary) {}
```

```ts
getFileOverview(sourceId: string, ingestionRevision: string): Promise<FileOverviewRecord | null>
saveFileOverviewPart(input: SaveFileOverviewPartInput): Promise<FileOverviewRecord>
getSubjectOverview(subjectId: string): Promise<SubjectOverviewRecord | null>
saveSubjectOverviewPart(input: SaveSubjectOverviewPartInput): Promise<SubjectOverviewRecord>
computeSubjectInputFingerprint(files: FileOverviewRecord[]): Promise<string>
```

`OUTLINE` responses have `summary: null`; `SUMMARY` responses have `outline: null`; `ALL` requires both. The client replaces only non-null returned parts.

### Task 1: Stateless Server overview generation

**Files:**

- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewMode.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewDtos.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/OverviewDocumentValidator.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewControllerTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`

- [ ] Write MockMvc tests first and run `Auralis-Server\mvnw.cmd -B -ntp -Dtest=AiOverviewControllerTests test`; confirm failure because both routes are absent.
- [ ] Add validated DTOs: instruction ≤2,000 characters, ≤100 subject files, title ≤300, ≤60 chapters, ≤500 sections, ≤100 key points, and prose field ≤4,000 characters.
- [ ] Add `POST /api/ai/source-overviews` and `POST /api/ai/subject-overviews`; derive the user from authentication and never accept `userId` or provider credentials.
- [ ] Write service tests first for foreign/deleted/not-ready Sources, missing active chunks, malformed JSON, unknown aliases, excessive nodes, all modes, custom instructions, provider errors and prompt overflow; observe expected failures.
- [ ] Source generation owner-checks through the public Source service, reads active chunks in the AI module, batches below the configured prompt limit, and reduces batches to one validated result.
- [ ] Subject generation owner-checks the Subject, verifies every Source belongs to it and the user, maps server aliases, and rejects an empty usable set.
- [ ] Reuse `AiSettingsService`, `AiProviderRegistry` and `AiProviderPort.complete`; do not create persistence or conversations.
- [ ] Accept plain JSON or one JSON fenced block, reject surrounding prose, canonicalize output, and return safe existing Problem Details.
- [ ] Run both focused tests, existing Modulith architecture tests and `Auralis-Server\mvnw.cmd -B -ntp test`; require exit code 0.

### Task 2: PC owner-scoped derived cache

**Files:**

- Create: `Auralis-PC/src/types/overview.ts`
- Create: `Auralis-PC/src/services/overviewRepository.ts`
- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Test: `Auralis-PC/scripts/r4-overview-cache.test.mjs`
- Modify: `Auralis-PC/package.json`

- [ ] Write tests first for user/device/revision isolation, partial replacement, old-success preservation, stable fingerprints, stale detection and scoped deletion; observe failure because the repository is absent.
- [ ] Add `ai_overview_cache` keyed by `(user_id, device_id, scope_type, scope_id, revision_key)` with JSON parts, timestamps, fingerprint, status and safe error columns; `revision_key` is the non-empty ingestion revision for FILE records and the literal `subject-v1` for SUBJECT records. Keep it outside resources/mutations.
- [ ] Add browser namespace `auralis:v1:overviews:<userId>:<serverDeviceId>` with equivalent records.
- [ ] Implement transactional part replacement: `OUTLINE` changes only outline, `SUMMARY` only summary, and failure changes diagnostics without deleting successful JSON.
- [ ] Canonicalize and sort by Source ID before SHA-256 fingerprinting so file order alone is not stale.
- [ ] Register and run the focused test plus existing schema/repository tests; require exit code 0.

### Task 3: PC API and automatic file generation

**Files:**

- Create: `Auralis-PC/src/api/useOverviewApi.ts`
- Create: `Auralis-PC/src/services/overviewGenerationService.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Modify: `Auralis-PC/src/store/useSourceStore.ts`
- Test: `Auralis-PC/scripts/r4-overview-generation.test.mjs`

```ts
generateSourceOverview(request: SourceOverviewRequest): Promise<OverviewResponse>
generateSubjectOverview(request: SubjectOverviewRequest): Promise<OverviewResponse>
regenerateFileOverview(sourceId: string, mode: OverviewMode, instruction?: string): Promise<void>
regenerateSubjectOverview(subjectId: string, mode: OverviewMode, instruction?: string): Promise<void>
```

- [ ] Write failing tests for exact requests, schema mapping, post-READY `ALL`, resume retry, revision changes, safe errors and READY preservation.
- [ ] Implement both authenticated API mappings.
- [ ] After indexing reports READY, enqueue local file overview generation and leave the document job READY without waiting for overview success.
- [ ] Retry on runtime resume or explicit regeneration; never remove older successful parts before the response succeeds.
- [ ] Build Subject requests only from local file overview records and persist the successful input fingerprint.
- [ ] Run the focused test and all document-processing tests; require exit code 0.

### Task 4: Subject workspace UI via Antigravity

**Allowed files:**

- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Create: `Auralis-PC/src/components/subject/SubjectOverviewSection.vue`
- Create: `Auralis-PC/src/components/subject/FileOutlineList.vue`
- Create: `Auralis-PC/src/components/subject/OverviewSummaryView.vue`
- Test: `Auralis-PC/scripts/r4-subject-overview-ui.test.mjs`
- Modify only if required: `Auralis-PC/src/styles/index.css`

- [ ] Require Antigravity to present a plan before edits, protect the dirty tree, keep `AI 梳理` at its current DOM location, and restrict writes to the allowlist.
- [ ] Add failing tests for `总览`, default-collapsed `学科总览`, expanded file outlines, per-file `总结`, middle summary, unchanged header action order and stale/error/loading states.
- [ ] Replace static samples with local Subject/File records; do not add outline/summary tabs to the left panel.
- [ ] File names open previews; summary shortcuts switch the middle pane; locators request page/block positioning and fall back to file open.
- [ ] Summary regeneration accepts default or custom instruction. File/Subject menus expose `OUTLINE` and `ALL`; old content stays visible during requests and failures.
- [ ] Apply existing Zen tokens, light/dark styles and narrow wrapping without changing panel width state.
- [ ] Review the complete Antigravity diff and reject writes outside the allowlist.
- [ ] Run focused UI tests, type check, static check, full PC tests and build; require exit code 0.

### Task 5: Contract and authoritative documentation

**Files:**

- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/openapi/auralis-openapi.json`
- Modify: `Auralis-PC/src/api/generated/schema.ts`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/project/ProductRequirements.md`
- Modify: `docs/project/Architecture.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [ ] Document both endpoints, mode nullability, limits and errors; regenerate PC schema and inspect intended definitions only.
- [ ] Record local-only authority, automatic/manual triggers, stale behavior, partial regeneration and failure preservation.
- [ ] State that `docs/contracts/Database.md` is unchanged because Server schema is unchanged.
- [ ] Keep automated evidence separate from real Provider, Tauri SQLite, upload callback, locator and GUI acceptance.
- [ ] Add release notes only after implementation exists; do not describe this plan as shipped.

### Task 6: Final review and verification

- [ ] Run Server focused/architecture/full tests and record exit codes/counts.
- [ ] Run PC focused/full tests, type check, static check and build; record exit codes/counts.
- [ ] Run `git diff --check`, inspect all changed/generated files, and confirm unrelated changes were not restored, overwritten or committed.
- [ ] Use one read-only reviewer for requirements, regressions, test gaps, security and local-data isolation.
- [ ] Keep real Provider, Tauri restart, upload completion, regeneration, locator and light/dark/narrow GUI checks as manual boundaries until performed.
