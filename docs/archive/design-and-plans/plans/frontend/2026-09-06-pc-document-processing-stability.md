# PC Document Processing Stability Implementation Plan

> **For agentic workers:** Implement test-first, preserve existing local changes, and do not commit.

**Goal:** Eliminate recursive document scheduling, preserve the real failure cause, restore Office extraction, and make OCR sidecar failures diagnosable without exposing unsafe details to the UI.

**Architecture:** Keep Source scheduling, job state transitions, Office extraction, and OCR supervision as separate fixes. Public error codes remain stable; detailed OCR process diagnostics go only to development/backend logs.

**Tech Stack:** Vue 3, TypeScript, Tauri/Rust, Node test scripts, Python OCR sidecar.

## Global Constraints

- Preserve all existing uncommitted work and do not clear local SQLite data.
- Do not change server APIs or document database schemas.
- Add focused regression tests before or with each implementation change.
- Update current PC/status/issue documentation for behavior and remaining risks.

---

### Task 1: Stop recursive scheduling

- [ ] Add a runtime regression test proving a job-change notification does not reload Sources or schedule the same Source again.
- [ ] Change the runtime callback to refresh only document-processing state; rely on existing sync/projection events for Source refresh.
- [ ] Run the focused runtime and scheduling tests.

### Task 2: Preserve terminal job failures

- [ ] Add tests for `UPLOADING -> FAILED_LOCAL` and stale `PACKAGING -> FAILED_LOCAL`.
- [ ] Extend the transition table and stale-phase classification so local packaging/upload failures are persisted instead of being masked by `DOCUMENT_JOB_ILLEGAL_TRANSITION`.
- [ ] Run job-schema, upload-coordinator, and scheduling tests.

### Task 3: Repair Office extraction

- [ ] Add tests proving anchors are collected before text chunks and text-bearing Office documents do not require bitmap page-count fallback.
- [ ] Reorder bridge extraction and replace the misleading generic page-count failure with the narrowest reliable renderer/anchor-derived fallback available in the current File Viewer API.
- [ ] Preserve a stable explicit unsupported error if a genuinely image-only Office document has no reliable rendered page count.
- [ ] Run Office/parser/preview tests.

### Task 4: Diagnose and warm OCR safely

- [ ] Add Rust/Python protocol tests for sidecar startup, warmup, abnormal exit, and bounded stderr reporting.
- [ ] Make warmup initialize the OCR backend/models rather than merely spawning the process.
- [ ] Log executable/resource resolution, spawn errors, exit status, and bounded stderr in development diagnostics while keeping `OCR_SIDECAR_UNAVAILABLE` as the public UI code.
- [ ] Run Rust, Python sidecar, and PC OCR integration tests.

### Task 5: Verify and document

- [ ] Run focused document-processing tests, TypeScript/build checks, Rust checks, and `git diff --check`.
- [ ] Update `docs/modules/FrontendPC.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, and `docs/release/Changelog.md` with verified results and unresolved limitations.
