# PC OCR Diagnostics and Empty-Page Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PC 端文档处理中心展示可持久化、可复制且不泄露正文/路径的逐页 OCR 诊断，并让单个空白扫描页继续处理，仅在整份文档没有产生任何文本块时以 `OCR_DOCUMENT_EMPTY` 失败。

**Architecture:** `OcrAdapter` 透传 sidecar 已返回的耗时；`DocumentParser` 生成有界页级事件并负责空白页语义；`DocumentJobRunner` 在 OCR 调用前持久化 `OCR_RUNNING` 和 checkpoint 诊断；Profile 处理中心只格式化、展开和复制已持久化的数据；Rust supervisor 输出同一组安全摘要字段。所有进度复用 `document_processing_jobs.checkpoint_json`，不新增服务端 API、同步字段或数据库列。

**Tech Stack:** Vue 3 + TypeScript、Node `node:test`、Tauri 2 / Rust、SQLite JSON checkpoint、RapidOCR sidecar。

## Global Constraints

- 基线提交为 `9563a49`，工作分支为 `codex/ocr-diagnostics-empty-page`；不得覆盖、还原或丢弃基线以及用户未跟踪的 `.tmp-ocr-real/`、`Auralis-PC/test_ocr.py`、`artifacts/`。
- 修改前完整阅读 `AGENTS.md`、`docs/agent/BeforeCoding.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/modules/FrontendPC.md`、`docs/design/Frontend.md`、批准设计 `docs/design/frontend/2026-09-08-pc-ocr-diagnostics-and-empty-page-design.md`。
- 严格 TDD：每个行为先添加失败测试并确认因预期缺口失败，再实现最小代码并确认测试通过；每个任务单独提交。
- 单页 OCR 归一化为空是可继续的 warning；只在整个解析结束且 `blockCount === 0`、并且实际尝试过 OCR 时抛出稳定错误码 `OCR_DOCUMENT_EMPTY`。
- `OCR_RUNNING` 必须在调用 `recognizePage` 前持久化，不能等待成功的 `ocr-page` block。
- 诊断字段限于稳定错误码、页码/总页数、图片字节数、原始/归一化行数、OCR 总耗时、attempt/restart 等安全数值；禁止写入 OCR 正文、PDF 内容、Authorization、签名 URL、完整原始文件路径和模型文件内容。
- checkpoint 诊断必须有明确类型和有界大小；不得把任意异常对象或 stderr 全量序列化到 SQLite。
- UI 默认保持紧凑；详情显式展开，复制失败必须被处理，不能产生未捕获 Promise rejection。
- 不修改服务端或 Mobile；不新增数据库 migration；不把自动测试通过表述为真实 Tauri GUI 验收通过。

---

## Task 1: Add parser diagnostics and correct empty-page semantics

**Files:**
- Modify: `Auralis-PC/src/services/documentParser/types.ts`
- Modify: `Auralis-PC/src/services/documentParser/OcrAdapter.ts`
- Modify: `Auralis-PC/src/services/documentParser/DocumentParser.ts`
- Modify: `Auralis-PC/scripts/document-parser-core.test.mjs`

- [ ] Add failing parser tests for a scanned PDF with one empty OCR page followed by a valid OCR page. Assert parsing completes, only the valid page emits a block, ordinals remain continuous, and an empty-page diagnostic event contains page `1/2`, image byte count, raw/normalized line counts of zero and finite non-negative total timing.
- [ ] Add a failing parser test where all attempted OCR pages normalize to empty. Assert rejection message/code is exactly `OCR_DOCUMENT_EMPTY` and the attached safe diagnostic identifies the last page and total page count without including recognized text or any filesystem path.
- [ ] Add a failing test that captures a `before-recognize` progress event before the fake adapter is invoked. This event must include page number, page count and image byte count.
- [ ] Run `node --experimental-strip-types --test scripts/document-parser-core.test.mjs` from `Auralis-PC`; record the expected failures.
- [ ] Extend `OcrPageResult` with the sidecar timing shape already exposed by `src/api/tauri.ts`; make `TauriOcrAdapter` return sanitized finite, non-negative `det`, `rec` and `total` values.
- [ ] Add typed, discriminated `DocumentParserProgress` events and an optional `onProgress` callback in `DocumentParserOptions`. Keep diagnostic payloads numeric/stable and independent from recognized text.
- [ ] Refactor the PDF and Office bitmap-fallback loops through one small helper or equivalent single behavior path: emit start event, call OCR, normalize, emit result event, skip an empty page, and track whether OCR was attempted. After parsing, throw a typed error with message `OCR_DOCUMENT_EMPTY` only when OCR was attempted and no block was emitted.
- [ ] Re-run the focused parser test and `npm run type-check`; confirm green.
- [ ] Commit as `feat(pc): add safe OCR page diagnostics`.

## Task 2: Persist pre-recognition progress and stable failure detail

**Files:**
- Modify: `Auralis-PC/src/types/documentProcessing.ts`
- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Modify: `Auralis-PC/scripts/r4-document-job-schema.test.mjs`
- Modify: `Auralis-PC/scripts/r4-document-job-runner.test.mjs`
- Modify: `Auralis-PC/scripts/r4-document-processing-runtime.test.mjs`

- [ ] Define a bounded `OcrCheckpointDiagnostic` model under `DocumentJobCheckpoint` with current page, total pages, image bytes, raw/normalized line counts, total milliseconds and outcome (`running`, `text`, `empty`, `failed`). Omit unavailable values rather than inventing zero.
- [ ] Add failing schema round-trip tests proving OCR checkpoint diagnostics survive SQLite/browser mapping without a new column and malformed JSON still fails safely. Update persistence so `checkpoint_json` is written whenever optional checkpoint data exists, not only when `parserState` is present.
- [ ] Add a failing runner test whose parser receives a progress callback. Block the fake OCR call after the `before-recognize` event and assert the persisted phase is already `OCR_RUNNING`, checkpoint page is current, total page count is present, and block ordinal has not advanced.
- [ ] Add a failing runner test for a typed `OCR_DOCUMENT_EMPTY` error. Assert `errorCode` remains exactly `OCR_DOCUMENT_EMPTY` while `errorDetail` is a bounded safe JSON/string representation containing the diagnostic numbers and retry attempt, not an object dump.
- [ ] Run the three focused Node files and record the expected failures.
- [ ] Extend the internal parser function signature to accept the typed progress callback. In `DocumentJobRunner`, translate progress events into atomic repository transitions and preserve cancellation checks around those writes.
- [ ] Wire `runtime.createParser` to pass the progress callback into `parseDocument`. Ensure parser input cleanup remains in `finally`.
- [ ] Add a focused serializer/helper for safe failure detail if needed; cap its output length and do not change stable `errorCode` extraction for unrelated failures.
- [ ] Re-run the three focused tests plus `npm run type-check`; confirm green.
- [ ] Commit as `feat(pc): persist OCR page progress`.

## Task 3: Show expandable and copyable OCR diagnostics

**Files:**
- Create: `Auralis-PC/src/utils/ocrDiagnostics.ts`
- Modify: `Auralis-PC/src/components/documentProcessing/DocumentProcessingCenter.vue`
- Modify: `Auralis-PC/scripts/r4-document-processing-ui.test.mjs`

- [ ] Add failing pure/static tests for the progress label `正在识别第 X/Y 页`, a compact empty-page warning, an expandable diagnostics control and a copy action. Assert the formatter does not expose unknown keys from raw JSON.
- [ ] Run `node --experimental-strip-types --test scripts/r4-document-processing-ui.test.mjs`; record expected failures.
- [ ] Implement a formatter that consumes only the typed checkpoint/error-detail allowlist and returns display rows plus a deterministic clipboard string. Do not render raw JSON wholesale.
- [ ] Update the processing center so the normal row stays one line, OCR progress uses persisted page counts, and a `<details>` (or equivalent accessible disclosure) contains diagnostic rows and a `复制诊断` button.
- [ ] Use `navigator.clipboard.writeText` behind capability/error handling. Surface a short local success/failure status without replacing the job failure detail.
- [ ] Re-run the UI test and `npm run type-check`; confirm green.
- [ ] Commit as `feat(pc): expose copyable OCR diagnostics`.

## Task 4: Add bounded Rust page summaries

**Files:**
- Modify: `Auralis-PC/src-tauri/src/ocr_sidecar.rs`

- [ ] Add a failing Rust unit test for a pure page-summary formatter. Verify it includes only task ID (bounded/sanitized), page number, image byte count, `ok`, line count, total milliseconds, restart count and stable error code.
- [ ] Add negative assertions that the summary excludes OCR line text and the temporary/full image path. Add a length-bound assertion.
- [ ] Run `cargo test --lib ocr_sidecar::tests::page_summary` from `Auralis-PC/src-tauri`; record expected failure.
- [ ] Implement the formatter and emit one `eprintln!` summary after each recognize result (success or protocol/model failure). Reuse existing constants or introduce explicit character bounds; do not weaken the existing bounded stderr tail.
- [ ] Re-run the focused Rust test and `cargo check --lib`; confirm green.
- [ ] Commit as `feat(pc): log bounded OCR page summaries`.

## Task 5: Synchronize current documentation and run final verification

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [ ] Register this plan in `docs/README.md` and describe the implemented OCR diagnostic/blank-page behavior in the PC module and frontend design docs.
- [ ] Update Status and Issues/Review with distinct evidence states: code implemented, automated validation results, and real `1.pdf` Tauri GUI acceptance still pending unless it was actually performed.
- [ ] Add a concise Changelog entry. Do not change API/Database contracts because no server contract, sync field or database column changed.
- [ ] Run from `Auralis-PC`: `node --experimental-strip-types --test scripts/document-parser-core.test.mjs scripts/r4-document-job-schema.test.mjs scripts/r4-document-job-runner.test.mjs scripts/r4-document-processing-runtime.test.mjs scripts/r4-document-processing-ui.test.mjs`.
- [ ] Run from `Auralis-PC`: `npm run type-check` and `npm run test:r4-pc`.
- [ ] Run from `Auralis-PC/src-tauri`: `cargo test --lib ocr_sidecar::tests` and `cargo check --lib`.
- [ ] Run from repository root: `git diff --check`, `git status --short`, and a privacy residue scan covering OCR diagnostics for `imagePath`, OCR line text interpolation, Authorization and signed URLs.
- [ ] If the desktop app can be launched without expanding scope, manually process `1.pdf` and record page progress, empty-page continuation, copy action and transition to packaging/upload. Otherwise explicitly leave GUI acceptance pending.
- [ ] Commit documentation as `docs: record OCR diagnostics behavior`.

## Task 6: Repair resumable upload state transitions

**Files:**
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts` only if the minimal transition fix requires it
- Modify: `Auralis-PC/scripts/r4-source-processing-schedule.test.mjs`
- Modify: `Auralis-PC/scripts/r4-document-job-schema.test.mjs` only if a focused repository assertion cannot live in the scheduler suite

- [ ] Add a failing regression test that starts from a persisted `PAUSED_NETWORK` upload job with `payloadReceipt`, invokes the same `retry()` path used by the UI, and uses the real `DocumentProcessingJobRepository` transition validation rather than the permissive fake repository.
- [ ] Assert the retry path legally reaches `UPLOADING` and invokes the parsed-document upload coordinator without re-running parsing or discarding the receipt.
- [ ] Add a paired assertion that a queued job without a receipt still enters the source parsing path, so broadening the transition does not bypass extraction/OCR.
- [ ] Run the focused scheduler/repository tests and confirm the first test fails specifically on `DOCUMENT_JOB_ILLEGAL_TRANSITION` before changing production code.
- [ ] Make the smallest state-machine correction: permit `QUEUED -> UPLOADING` because `retry()` intentionally normalizes a paused job to `QUEUED` before `schedule()` selects the receipt-backed upload path. Do not add unrelated transitions or special-case arbitrary failed jobs.
- [ ] Re-run the focused tests and `npm run type-check`; confirm green.
- [ ] Do not stage or commit implementation files in this task: the working tree contains protected, overlapping OCR work that must remain intact for the user to review as one set.

## Task 7: Preserve bounded upload failure reasons in diagnostics

**Files:**
- Modify: `Auralis-PC/src/services/documentProcessing/checkpointPolicy.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts`
- Modify: `Auralis-PC/src/utils/ocrDiagnostics.ts`
- Modify: `Auralis-PC/scripts/r4-parsed-document-upload.test.mjs`
- Modify: `Auralis-PC/scripts/r4-document-processing-ui.test.mjs`

- [ ] Add table-driven failing coordinator tests for the existing Tauri transport suffixes `connect`, `timeout`, `body`, `request`, `client`, plus `DOCUMENT_UPLOAD_RETRYABLE`. Assert the job pauses with stable `errorCode = NETWORK_OFFLINE`, retains its payload receipt, and stores only a bounded allowlisted reason token.
- [ ] Add negative assertions proving `errorDetail` never contains arbitrary exception text, object-storage URLs, query strings, headers, local paths or response bodies.
- [ ] Add failing formatter/UI tests for each allowlisted token. Map them to concise Chinese explanations (connection failed, timed out, request/body/client failure, retryable server response) while unknown or malformed detail falls back to the existing generic retry message and is not echoed.
- [ ] Run the two focused test files and confirm expected failures before production edits.
- [ ] Introduce one pure sanitizer that extracts only the six approved reasons from exact error shapes. Keep stage limited to `upload` or `complete`; serialize a deterministic token such as `PARSED_DOCUMENT_UPLOAD_PAUSED:connect`, with no raw exception concatenation.
- [ ] Update the upload coordinator to persist the token while keeping `NETWORK_OFFLINE` as the stable retry category. Do not change endpoint configuration, MinIO credentials, signed URL handling or Tauri upload transport in this task.
- [ ] Update the OCR diagnostics formatter to decode only exact allowlisted tokens for on-screen and clipboard output. Unknown detail must produce a generic safe message.
- [ ] Re-run the focused tests, the complete PC R4 suite and `npm run type-check`.
- [ ] Run `git diff --check` and scan changed upload/diagnostic code for leaked URLs, Authorization/header names, query strings, paths and raw exception interpolation.
- [ ] Do not stage or commit implementation files; preserve the user's existing uncommitted Antigravity/OCR changes and report automated evidence separately from real GUI verification.

## Task 8: Freeze a shared ParsedDocument v1 contract fixture

**Files:**
- Create: `docs/contracts/fixtures/parsed-document-v1.json`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/source/ParsedDocumentValidatorTests.java`
- Modify: `Auralis-PC/src-tauri/src/document_packager.rs`

**Interfaces:**
- Produces: one canonical schema v1 JSON object whose parser metadata, ordered blocks, Unicode character count and `SHA-256(text + "\\n")` digest are consumed by both Rust and Java tests.
- Consumes: the exact top-level/parser/block allowlists in `ParsedDocumentValidator` and the approved design section “ParsedDocument schema v1 打包增量”.

- [ ] Create a fixture with two blocks, including non-ASCII and supplementary-plane Unicode, continuous ordinals, nullable position fields, `characterCount` measured in Unicode code points, and the lowercase SHA-256 of each UTF-8 block text followed by one byte `0x0a`.
- [ ] Add a Java test that loads the fixture, gzips it in memory, calculates compressed size/hash, and calls the real validator with matching source/revision/Asset metadata. Assert the returned blocks, count and hashes; do not weaken any existing rejection test.
- [ ] Add a Rust test placeholder that decrypts/decompresses a package produced from the fixture metadata and compares `serde_json::Value` equality with the same fixture. Confirm it fails because current output is NDJSON rather than a top-level object.
- [ ] Run:

```powershell
cd Auralis-Server
.\mvnw.cmd -Dtest=ParsedDocumentValidatorTests test
cd ..\Auralis-PC\src-tauri
cargo test --lib document_packager::tests::package_matches_shared_schema_v1_fixture
```

Expected red state: Java accepts the canonical fixture; Rust fails while parsing or comparing the current NDJSON output.

- [ ] Do not stage or commit: implementation will overlap the protected OCR working tree and is reviewed as one atomic fix.

## Task 9: Stream the schema v1 envelope from the Rust packager

**Files:**
- Modify: `Auralis-PC/src-tauri/src/document_packager.rs`
- Modify: `Auralis-PC/src-tauri/src/document_cache.rs`
- Modify: `Auralis-PC/src-tauri/src/lib.rs` only if command wiring changes

**Interfaces:**
- Consumes: `PackageHeader` containing cache scope plus `source_asset_sha256`, `parser_id`, `parser_version`, `normalization_version`, and optional `ocr_model_version`.
- Produces: `CacheReceipt` with `payload_format: "parsed-document-v1"`, the same safe metadata, and payload byte/hash values describing the decrypted gzip bytes.

- [ ] Extend the failing packager tests to reject an empty/invalid Asset hash or parser metadata and to assert that cache-only owner fields never appear in decompressed JSON.
- [ ] Implement a serializable upload-only header and write the prefix before the first block. The behavior must be equivalent to:

```rust
write!(encoder,
    "{{\\\"schemaVersion\\\":1,\\\"sourceId\\\":{},\\\"ingestionRevision\\\":{},\\\"sourceAssetSha256\\\":{},\\\"parser\\\":{},\\\"blocks\\\":[",
    json(source_id), json(ingestion_revision), json(asset_sha), json(parser_metadata))?;
```

Use `serde_json::to_writer` or serialized byte fragments for every string/object value; never interpolate unescaped user-controlled text.

- [ ] In `append`, write a comma only when `next_ordinal > 0`, serialize the block once, update the plain digest with `block.text.as_bytes()` plus `b"\n"`, and increment `character_count` using `block.text.chars().count()` after the same normalization contract used by the parser.
- [ ] In `finish`, reject zero blocks, finalize a clone/replacement of the digest, and write this suffix before finishing gzip:

```rust
write!(encoder,
    "],\\\"characterCount\\\":{},\\\"plainTextSha256\\\":{}}}",
    character_count,
    json(hex::encode(plain_hash)))?;
```

- [ ] Extend `CacheHeader/CacheReceipt` with bounded format and upload metadata. Old encrypted headers must remain readable through `#[serde(default)]` optional fields, but absence must not be interpreted as v1 compatibility.
- [ ] Re-run the shared fixture test and existing packager/cache tests. Expected green: actual decrypted/decompressed Rust output is structurally equal to the shared fixture, `payloadBytes < encryptedBytes`, and its payload hash matches the gzip bytes.
- [ ] Run `cargo fmt --check`, `cargo test --lib document_packager::tests`, `cargo test --lib document_cache::tests`, and `cargo check --lib`; record any pre-existing Windows keyring/build-script permission failure separately.
- [ ] Do not stage or commit.

## Task 10: Carry envelope metadata through TypeScript and durable receipts

**Files:**
- Modify: `Auralis-PC/src/api/tauri.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Modify: `Auralis-PC/src/types/documentProcessing.ts`
- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify: `Auralis-PC/scripts/r4-document-job-runner.test.mjs`
- Modify: `Auralis-PC/scripts/r4-document-job-schema.test.mjs`

**Interfaces:**
- Consumes: scheduler-provided `sourceAssetSha256` and current parser constants.
- Produces: a validated `DocumentCacheReceipt` whose `payloadFormat/sourceAssetSha256/parser*` fields round-trip through SQLite and browser storage and are available after restart.

- [ ] Add failing runner tests that require `packager.begin` to receive this shape:

```ts
{
  schemaVersion: 1,
  payloadFormat: 'parsed-document-v1',
  userId, serverDeviceId, sourceId, jobId, ingestionRevision,
  sourceAssetSha256,
  parserId,
  parserVersion,
  normalizationVersion,
  ocrModelVersion: string | null,
}
```

and reject packaging when `sourceAssetSha256` is absent or not 64 hex characters.

- [ ] Change `DocumentJobRunner.start`/internal process input so the scheduler passes immutable package metadata for the current Asset; do not put the Asset hash in OCR progress or UI diagnostics.
- [ ] Update `documentPackageBegin` validation and Rust invoke typing to require the exact v1 format and bounded non-empty parser metadata.
- [ ] Add SQLite and browser round-trip tests for all new receipt fields. Sanitization rules: exact payload format literal, 64-hex lowercase Asset hash, bounded non-empty parser strings, optional bounded OCR model string; if the group is incomplete, treat the receipt as legacy/incompatible instead of filling defaults.
- [ ] Update runtime adapters without changing the Tauri command names already exposed to the application.
- [ ] Run the focused runner/schema/runtime tests and `npm.cmd run type-check`; expected green with no generated OpenAPI change.
- [ ] Do not stage or commit.

## Task 11: Rebuild legacy NDJSON caches before any upload intent

**Files:**
- Modify: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts` only for the minimal legal reset transition/options
- Modify: `Auralis-PC/scripts/r4-source-processing-schedule.test.mjs`
- Modify: `Auralis-PC/scripts/r4-parsed-document-upload.test.mjs`

**Interfaces:**
- Consumes: durable receipt compatibility predicate `receipt.payloadFormat === 'parsed-document-v1'` plus complete upload metadata.
- Produces: either a direct resume using a compatible receipt, or one deterministic reset to `QUEUED` that deletes only the obsolete derived cache and re-enters Asset resolution/parsing/packaging.

- [ ] Add a failing scheduler test starting from `PAUSED_NETWORK`/`UPLOADING` with a legacy receipt lacking `payloadFormat`. Assert cache deletion and receipt clearing occur before any `createParsedDocumentUploadIntent`/PUT/complete call, then the original Asset is resolved, hashed, parsed and repackaged exactly once.
- [ ] Add a paired test proving a v1 receipt resumes without download/hash/parser/package and that its persisted `sourceAssetSha256` is passed to the upload coordinator instead of `{}`.
- [ ] Add failure tests: obsolete cache deletion failure produces a stable local failure without clearing the only receipt; Asset reacquisition/network failure follows the existing paused-download behavior; Source deletion does not recreate the job.
- [ ] Implement one exact compatibility predicate; do not infer compatibility from `payloadBytes != encryptedBytes` because both NDJSON and v1 caches can satisfy that after the earlier payload-length repair.
- [ ] Perform reset in a recoverable order: validate job/source ownership, delete the obsolete derived cache, atomically clear `payloadCacheId/payloadReceipt` while transitioning to `QUEUED`, then follow the existing input/hash/prepare/run path. Do not delete Source, Asset, original file, or Server REJECTED audit rows.
- [ ] Remove the `{}` resume metadata call. For a compatible v1 receipt invoke:

```ts
await upload.upload(job.jobId, receipt, {
  sourceAssetSha256: receipt.sourceAssetSha256,
})
```

The coordinator must reject a v1 receipt whose metadata is incomplete before creating an intent.

- [ ] Run scheduler/coordinator/repository focused tests, full `npm.cmd run test:r4-pc`, and `npm.cmd run type-check`.
- [ ] Do not stage or commit.

## Task 12: Verify both contract sides and synchronize current documentation

**Files:**
- Modify: `docs/contracts/Database.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/Infrastructure.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: completed Tasks 8–11 and their exact command evidence.
- Produces: a reviewed, documented implementation ready for one real Tauri retry.

- [ ] Verify the shared fixture from both sides:

```powershell
cd Auralis-PC\src-tauri
cargo test --lib document_packager::tests
cd ..\..\Auralis-Server
.\mvnw.cmd -Dtest=ParsedDocumentValidatorTests,ParsedDocumentCompleteTests test
```

- [ ] Run PC focused suites for cache, runner, schema, scheduler and upload, then `npm.cmd run test:r4-pc` and `npm.cmd run type-check`.
- [ ] Run Rust cache/packager/upload tests and `cargo check --lib`; keep the known Windows Credential Manager `NoStorageAccess(Error 1312)` and build-script permission state distinct from failures introduced by this change.
- [ ] Run `git diff --check`, inspect the complete diff for deleted/generated/dependency files, and scan for NDJSON fallback, raw OCR text logs, signed URLs, Authorization, cache paths and owner fields inside upload JSON.
- [ ] Update the listed current documents with actual results only. Database docs must distinguish local receipt/cache metadata from the Server database contract; no Server API schema or database migration is introduced.
- [ ] Use one read-only reviewer for requirement compliance, regression, privacy, cache invalidation and cross-language contract coverage. Resolve every Critical/Important finding and rerun directly covering tests.
- [ ] Rebuild/restart Tauri and retry `1.pdf`. Expected real sequence: legacy receipt detected → one local reparse/package → MinIO PUT → complete accepted → indexing → Source `READY`. Record the actual last reached phase; do not claim GUI/external-service acceptance unless observed.
- [ ] Do not stage or commit the implementation set unless the user separately authorizes how to combine it with the protected pre-existing OCR changes.

## Final Review Gate

- [ ] Review the complete diff from baseline `9563a49` to branch HEAD for plan compliance, privacy, retry behavior, checkpoint compatibility and unrelated regressions.
- [ ] Resolve all Critical/Important findings and re-run the directly covering tests.
- [ ] Report commit list and exact verification outcomes; keep real GUI acceptance separate from automated evidence.

## Task 13: Add bounded MinIO PUT and Server complete trace events

**Files:**
- Modify: `Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts`
- Modify: `Auralis-PC/scripts/r4-parsed-document-upload.test.mjs`
- Modify after verification: `docs/modules/FrontendPC.md`
- Modify after verification: `docs/current/Status.md`
- Modify after verification: `docs/current/IssuesAndReview.md`
- Modify after verification: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: existing `errorCode(error: unknown): string`, `DocumentUploadPutReceipt`, and `ParsedDocumentCompleteResponse`.
- Produces: console events with prefix `[Document Upload Trace]` and allowlisted payload `{ event, jobId, stage?, errorCode?, durationMs? }`.
- Event literals: `PUT_STARTED | PUT_SUCCEEDED | COMPLETE_ACCEPTED | FAILED`.
- Stage literals: `put | complete`.

- [ ] **Step 1: Add failing tests for exact successful event order**

Capture `console.info`/`console.warn` around a successful coordinator upload. Assert the structured events are exactly:

```js
[
  { event: 'PUT_STARTED', jobId: 'job-1', stage: 'put' },
  { event: 'PUT_SUCCEEDED', jobId: 'job-1', stage: 'put' },
  { event: 'COMPLETE_ACCEPTED', jobId: 'job-1', stage: 'complete' },
]
```

The assertion may ignore `durationMs` except to require a finite non-negative number where present. Run:

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-parsed-document-upload.test.mjs
```

Expected red: no `[Document Upload Trace]` entries are captured.

- [ ] **Step 2: Add failing tests for PUT/complete failure and retry sequences**

Cover these exact sequences:

```text
PUT failure:      PUT_STARTED -> FAILED(stage=put,errorCode=<stable code>)
complete failure: PUT_STARTED -> PUT_SUCCEEDED -> FAILED(stage=complete,errorCode=<stable code>)
expired intent:   PUT_STARTED -> FAILED(put,DOCUMENT_UPLOAD_INTENT_EXPIRED)
                  -> PUT_STARTED -> PUT_SUCCEEDED -> COMPLETE_ACCEPTED
server rejection: PUT_STARTED -> PUT_SUCCEEDED -> FAILED(complete,PARSED_DOCUMENT_SERVER_REJECTED)
```

Capture the complete console arguments and assert their serialized form excludes `https://`, `Authorization`, `Bearer`, `cacheId`, `payloadReceipt`, file paths, OCR text, arbitrary response bodies and test secrets. Verify the tests fail because trace events are absent.

- [ ] **Step 3: Implement one allowlisted trace helper**

In `ParsedDocumentUploadCoordinator.ts`, define narrow local types and a helper equivalent to:

```ts
type UploadTraceEvent = 'PUT_STARTED' | 'PUT_SUCCEEDED' | 'COMPLETE_ACCEPTED' | 'FAILED'
type UploadTraceStage = 'put' | 'complete'

function traceUpload(input: {
  event: UploadTraceEvent
  jobId: string
  stage?: UploadTraceStage
  errorCode?: string
  durationMs?: number
}): void {
  const entry = {
    event: input.event,
    jobId: input.jobId,
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(Number.isFinite(input.durationMs) ? { durationMs: Math.max(0, Math.round(input.durationMs!)) } : {}),
  }
  const method = input.event === 'FAILED' ? console.warn : console.info
  method('[Document Upload Trace]', entry)
}
```

Do not pass exception objects, URLs, headers, receipts, response DTOs, cache IDs or paths to the helper.

- [ ] **Step 4: Instrument every actual PUT attempt**

Wrap the existing `this.put.put(...)` call in `putCache`:

```ts
const startedAt = Date.now()
traceUpload({ event: 'PUT_STARTED', jobId: job.jobId, stage: 'put' })
try {
  const result = await this.put.put(request)
  if (result.bytesSent !== receipt.payloadBytes
    || result.payloadSha256.toLowerCase() !== receipt.payloadSha256.toLowerCase()) {
    throw new Error('DOCUMENT_UPLOAD_PAYLOAD_MISMATCH')
  }
  traceUpload({ event: 'PUT_SUCCEEDED', jobId: job.jobId, stage: 'put', durationMs: Date.now() - startedAt })
  return result
} catch (error) {
  traceUpload({ event: 'FAILED', jobId: job.jobId, stage: 'put', errorCode: errorCode(error), durationMs: Date.now() - startedAt })
  throw error
}
```

Remove the now-duplicate post-PUT validation from `process`. Preserve the existing retry-on-expired-intent behavior and map `DOCUMENT_UPLOAD_PAYLOAD_MISMATCH` to its existing stable local failure code/detail rather than a generic message.

- [ ] **Step 5: Instrument complete acceptance and failure**

Around `completeParsedDocument`, emit `FAILED(stage=complete,errorCode=...)` in the catch before the existing `pauseOrFail`. If the response status is not `ACCEPTED`, emit `FAILED(stage=complete,errorCode=PARSED_DOCUMENT_SERVER_REJECTED)` before persisting the stable server failure. Emit `COMPLETE_ACCEPTED` only after the accepted-status check and before the existing legal `SERVER_VALIDATING -> SERVER_INDEXING -> READY` local transitions.

- [ ] **Step 6: Run focused red-to-green verification**

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-parsed-document-upload.test.mjs
node --experimental-strip-types --test scripts/r4-source-processing-schedule.test.mjs scripts/r4-document-processing-flow.test.mjs scripts/r4-document-job-schema.test.mjs
npm.cmd run type-check
```

Expected: all commands exit 0; upload traces satisfy order/privacy assertions and existing state-machine tests remain green.

- [ ] **Step 7: Run full PC regression and inspect the diff**

```powershell
npm.cmd run test:r4-pc
cd ..
git diff --check
git diff -- Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts Auralis-PC/scripts/r4-parsed-document-upload.test.mjs
```

Expected: full R4 and diff check exit 0; production diff contains no logging of URL, headers, receipt, cache/path, OCR content or raw exception.

- [ ] **Step 8: Synchronize current documentation**

Record only actual command results and the four trace events in the listed current documents. Keep real Tauri/MinIO/Server/GUI observation explicitly unverified until the user supplies the runtime event sequence.

- [ ] **Step 9: Read-only review**

Use one reviewer to inspect event ordering, retry duplication, stable error-code mapping, privacy allowlist, state-machine preservation and directly covering tests. Resolve all Critical/Important findings and rerun their covering tests. Do not stage or commit the implementation set in the protected dirty worktree.

## Task 14: Publish every persisted Source ingestion state change

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentService.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentCompleteTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/SourceIngestionSyncEventTests.java`
- Modify after verification: `docs/modules/Backend.md`
- Modify after verification: `docs/contracts/Database.md`
- Modify after verification: `docs/current/Status.md`
- Modify after verification: `docs/current/IssuesAndReview.md`
- Modify after verification: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: `SourceService.publishChange(UUID, SourceView, String)`, `ResourceChangedEvent`, `ChangeLogEventListener` and `RealtimeDomainEventListener`.
- Produces: one `SOURCE/UPDATE` change-log entry containing the saved `SourceView` whenever ingestion status or safe failure diagnostics actually change.
- Preserves: ParsedDocument complete Source row lock, one complete transaction, existing Source versioning, ingestion job enqueue semantics and AFTER_COMMIT realtime publication.

- [ ] **Step 1: Write a failing complete integration assertion**

Extend the real ParsedDocument complete fixture so its baseline cursor is captured immediately before `parsedDocumentService.complete(...)`. Query or pull changes after completion and assert exactly one new Source update for the fixture Source with:

```text
resourceType = SOURCE
mutationType = UPDATE
payload.ingestionStatus = INDEXING
payload.id = sourceId
version = persisted Source version
```

Run `Auralis-Server\mvnw.cmd -Dtest=ParsedDocumentCompleteTests test`. Expected red: the Source row is `INDEXING`, but no matching change-log record exists.

- [ ] **Step 2: Write failing state-transition event tests**

Using a real `SourceService` integration fixture, cover `markParsing`, `markPending`, `markIndexing`, `markReady` and `markFailed`. For each actual status/diagnostic change, assert the last Source change-log payload matches the persisted Source view and version. Add a no-op case proving a repeated identical transition produces neither a new version nor a new change-log cursor. For `markFailed`, changing `safeErrorCode` or `safeErrorDetail` while status remains `FAILED` must still emit an update.

Run only the containing test class. Expected red: current internal mark methods save the Source but do not append change-log entries.

- [ ] **Step 3: Centralize event-aware internal transitions**

Refactor the five `SourceService` mark methods through one private helper that:

```java
1. loads and validates the active owner-scoped Source;
2. snapshots ingestionStatus, safeErrorCode and safeErrorDetail;
3. applies exactly one requested entity transition;
4. returns without save/event if all three observable values are unchanged;
5. otherwise saveAndFlushes, maps the saved entity to SourceView, and calls publishChange(userId, view, "UPDATE").
```

Do not publish directly to realtime and do not create change-log rows manually. The existing synchronous `ChangeLogEventListener` must remain the only writer, and `RealtimeDomainEventListener(AFTER_COMMIT)` must remain the realtime boundary.

- [ ] **Step 4: Route ParsedDocument complete through the unified transition**

Keep `findForUpdateByIdAndUserIdAndDeletedAtIsNull` and all validation in `ParsedDocumentService.complete()`. Replace the direct `source.markIndexing()` / `sourceRepository.saveAndFlush(source)` pair with the event-aware `SourceService.markIndexing(userId, sourceId)` call while the outer complete transaction still holds the row lock. Do not split document acceptance, Source INDEXING and ingestion-job enqueue into separate transactions.

- [ ] **Step 5: Verify red-to-green and transaction behavior**

Run:

```powershell
cd Auralis-Server
.\mvnw.cmd -Dtest=ParsedDocumentCompleteTests,SourceIngestionSyncEventTests test
.\mvnw.cmd -Dtest=AiIngestionWorkerTests,ParsedDocumentControllerTests test
```

Expected green: `INDEXING`, `READY`, retry `PENDING`, terminal `FAILED` and safe diagnostic changes are sync-visible; repeated identical states are no-ops; complete rejection/rollback produces neither accepted state nor realtime success notification.

- [ ] **Step 6: Run Server regression and update documentation**

Run `Auralis-Server\mvnw.cmd test` and `git diff --check`. Record exact totals and any environment-only failures. Update Backend/Database/current/changelog documents to state that Source ingestion status is synchronized through the existing change-log/realtime chain; do not claim GUI acceptance.

- [ ] **Step 7: Do not commit implementation**

The branch contains protected uncommitted work. Leave Task 14 implementation unstaged and report every modified file, command, exit code and uncovered external boundary in `.superpowers/sdd/task-14-report.md`.

## Task 15: Request one PC background read sync after complete acceptance

**Files:**
- Modify: `Auralis-PC/src/services/documentProcessing/ParsedDocumentUploadCoordinator.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Test: `Auralis-PC/scripts/r4-parsed-document-upload.test.mjs`
- Test: `Auralis-PC/scripts/r4-document-processing-runtime.test.mjs`
- Modify after verification: `docs/modules/FrontendPC.md`
- Modify after verification: `docs/current/Status.md`
- Modify after verification: `docs/current/IssuesAndReview.md`
- Modify after verification: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: the accepted Server response, existing `useSyncStore().requestBackgroundSync('read')`, and the scheduler's coalescing behavior.
- Produces: optional coordinator callback `onCompleteAccepted?: () => Promise<void> | void`, invoked once per accepted complete response.
- Preserves: strict `status === 'ACCEPTED'`, upload trace ordering, local `SERVER_VALIDATING → SERVER_INDEXING → READY`, and successful complete semantics even if the best-effort callback fails.

- [ ] **Step 1: Add failing coordinator callback tests**

In the upload focused suite, inject a counter callback and assert:

```text
accepted complete: callback count = 1
rejected/missing/invalid complete status: callback count = 0
complete request exception: callback count = 0
expired PUT intent followed by accepted complete: callback count = 1
```

Add a callback that rejects or throws and assert `upload()` still returns the accepted server receipt and the real local repository reaches `READY`. Run the upload suite and observe red because the option does not exist or is never invoked.

- [ ] **Step 2: Implement the best-effort accepted callback**

Add the optional option and store it in the coordinator. After emitting `COMPLETE_ACCEPTED`, invoke it exactly once. Catch callback failure locally so it cannot emit upload `FAILED`, call `pauseOrFail`, or prevent the legal local transitions. Any diagnostic must use a fixed message and must not include raw exception data.

- [ ] **Step 3: Wire runtime to the existing sync scheduler**

Construct the coordinator with:

```ts
onCompleteAccepted: () => {
  useSyncStore().requestBackgroundSync('read')
}
```

Do not call `triggerSync`, direct Source GET, `sourceStore.loadSources`, or local repository writes. Add/update the runtime static test to assert this exact `read` request is present and the old recursive Source hydration path is absent.

- [ ] **Step 4: Run PC focused and full verification**

Run:

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-parsed-document-upload.test.mjs
node --experimental-strip-types --test scripts/r4-document-processing-runtime.test.mjs scripts/r4-source-processing-schedule.test.mjs scripts/r4-document-processing-flow.test.mjs scripts/r4-document-job-schema.test.mjs
npm.cmd run type-check
npm.cmd run test:r4-pc
cd ..
git diff --check
```

Update PC/current/changelog documents with actual results only.

- [ ] **Step 5: Do not commit implementation**

Leave Task 15 implementation unstaged and write `.superpowers/sdd/task-15-report.md` with red/green evidence, modified files, exact commands, exit codes and unverified GUI/external boundaries.

## Task 16: Verify effective deployment and end-to-end state propagation

**Files:**
- Verify only: `.env`, `docker-compose.yml`, running `backend` container, PostgreSQL `sources`, `ingestion_jobs` and `change_log`
- Modify documentation only if verified facts change: `docs/modules/Infrastructure.md`, `docs/operations/Deployment.md`, `docs/operations/Runbook.md`

**Interfaces:**
- Consumes: Task 14 Server events and Task 15 PC read-sync request.
- Produces: runtime evidence that worker is enabled and a newly processed Source reaches Server READY, change-log READY, sync pull/local projection READY and completed UI.

- [ ] Confirm `docker compose config` and `docker compose exec -T backend printenv AURALIS_AI_INGESTION_WORKER_ENABLED` both resolve to `true`; never print unrelated environment values.
- [ ] Rebuild/recreate only the `backend` service after Server code changes; do not delete PostgreSQL or MinIO volumes.
- [ ] Process or retry one FILE Source and query its exact Source/job/change-log rows. Expected: Server Source `READY`, ingestion job `READY`, and change-log contains ordered Source updates ending in `READY`.
- [ ] Confirm PC issues a sync pull after `COMPLETE_ACCEPTED` and its local Source projection/UI reaches `READY`. Keep this as manual GUI acceptance if it cannot be safely automated.
- [ ] Record real evidence and remaining boundaries in current/infrastructure/runbook/changelog documents. Do not expose credentials, provider keys, signed URLs, OCR text or document content.
- [ ] Use one read-only reviewer across Tasks 14–16. Resolve all Critical/Important findings with the original implementer and rerun directly covering tests.
