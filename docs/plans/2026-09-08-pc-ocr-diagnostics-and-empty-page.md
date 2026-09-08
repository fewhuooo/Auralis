# PC OCR Diagnostics and Empty-Page Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PC 端文档处理中心展示可持久化、可复制且不泄露正文/路径的逐页 OCR 诊断，并让单个空白扫描页继续处理，仅在整份文档没有产生任何文本块时以 `OCR_DOCUMENT_EMPTY` 失败。

**Architecture:** `OcrAdapter` 透传 sidecar 已返回的耗时；`DocumentParser` 生成有界页级事件并负责空白页语义；`DocumentJobRunner` 在 OCR 调用前持久化 `OCR_RUNNING` 和 checkpoint 诊断；Profile 处理中心只格式化、展开和复制已持久化的数据；Rust supervisor 输出同一组安全摘要字段。所有进度复用 `document_processing_jobs.checkpoint_json`，不新增服务端 API、同步字段或数据库列。

**Tech Stack:** Vue 3 + TypeScript、Node `node:test`、Tauri 2 / Rust、SQLite JSON checkpoint、RapidOCR sidecar。

## Global Constraints

- 基线提交为 `9563a49`，工作分支为 `codex/ocr-diagnostics-empty-page`；不得覆盖、还原或丢弃基线以及用户未跟踪的 `.tmp-ocr-real/`、`Auralis-PC/test_ocr.py`、`artifacts/`。
- 修改前完整阅读 `AGENTS.md`、`docs/agent/BeforeCoding.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/modules/FrontendPC.md`、`docs/design/Frontend.md`、批准设计 `docs/design/2026-09-08-pc-ocr-diagnostics-and-empty-page-design.md`。
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

## Final Review Gate

- [ ] Review the complete diff from baseline `9563a49` to branch HEAD for plan compliance, privacy, retry behavior, checkpoint compatibility and unrelated regressions.
- [ ] Resolve all Critical/Important findings and re-run the directly covering tests.
- [ ] Report commit list and exact verification outcomes; keep real GUI acceptance separate from automated evidence.
