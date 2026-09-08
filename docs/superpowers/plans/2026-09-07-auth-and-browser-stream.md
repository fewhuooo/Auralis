# PC Authentication and Browser Stream Remediation Implementation Plan

> **For agentic workers:** This plan is executed inline in the shared worktree. Preserve all existing uncommitted changes; do not reset, checkout, commit, clear SQLite, databases, MinIO volumes, or user files.

**Goal:** Stop protected background work after an invalid session, preserve the existing single-flight refresh contract, and remove the remaining browser dependency path that reaches Node `stream.Readable`.

**Architecture:** Keep authentication state owned by `useAuthStore` and make the Axios/native-fetch boundary the single authority for refresh failure and re-authentication. Gate background schedulers and preview/realtime entry points on the explicit auth state so one invalid session produces one bounded failure instead of repeated 401s. Trace the bundled browser graph for PPTX/Office parsing and replace only the actual Node-oriented import or resolver edge with the package’s browser entry.

**Tech Stack:** Vue 3/Pinia, Axios, native fetch SSE, Vite/Rollup, JSZip, Node `--experimental-strip-types` tests.

## Global Constraints

- Do not bypass authentication or use a refresh token as an access token.
- Do not clear local or server data; preserve existing OCR diagnostics.
- Add a regression test before each production behavior change and observe the expected failure.
- Update `docs/modules/FrontendPC.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, and `docs/release/Changelog.md`; update API contracts only if the public API changes.
- Report automated verification separately from real Tauri GUI acceptance.

### Task 1: Authentication failure boundary and background gating

**Files:**
- Modify: `Auralis-PC/src/store/useAuthStore.ts`
- Modify: `Auralis-PC/src/api/request.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- Modify: `Auralis-PC/src/services/realtimeController.ts` and any actual preview entry point identified by tracing
- Test: `Auralis-PC/scripts/r4-pc-protocol.test.mjs` and a focused scheduler/realtime regression script if required

**Required behavior:** A failed refresh clears the in-memory/persisted session through the existing auth store boundary, exposes a stable re-authentication state, and prevents scheduler/preview/realtime background calls from retrying protected endpoints. A valid refresh remains single-flight and replays the original request at most once.

- [ ] Write a failing test for refresh-session invalidation: concurrent protected requests produce one refresh attempt, then one explicit re-auth state and no repeated 401 loop.
- [ ] Run the focused test and confirm it fails because invalid refresh is currently only rejected, not globally gated.
- [ ] Write a failing test for scheduler/preview/realtime entry points: after re-authentication state, no protected request is started and the UI receives a stable auth-required result.
- [ ] Run the focused test and confirm it fails for the current unguarded entry point.
- [ ] Implement the smallest store/request boundary change, then add gates only at the traced background entry points.
- [ ] Run the focused tests and adjacent PC protocol/runtime tests.

### Task 2: Browser dependency graph and `stream.Readable`

**Files:**
- Modify: the actual PPTX/Office parser or Vite dependency configuration identified by the graph
- Test: `Auralis-PC/scripts/document-parser-core.test.mjs` or a new focused graph assertion

**Required behavior:** The browser graph must not resolve the Node JSZip/readable-stream entry. Do not add an empty stream polyfill; preserve Node-compatible test imports where they are needed.

- [ ] Add a failing static/graph regression that identifies the current Node-oriented edge or build artifact.
- [ ] Run it and capture the expected failure.
- [ ] Replace the source import or resolver edge with the package browser entry, only where the traced graph requires it.
- [ ] Run the parser regression and Vite build; inspect generated assets for `browser-external:stream`, `readable-stream`, and `stream.Readable`.

### Task 3: Documentation and verification closeout

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [ ] Record root cause, changed boundaries, exact command results, known pre-existing failures, and the fact that real Tauri GUI acceptance remains open.
- [ ] Run the minimum complete focused Node suite, related `check:r4-pc`, and Vite build; do not spend time on known unrelated Timeline/type-check failures.
- [ ] Review `git diff --check` and `git status --short` to confirm no user changes were discarded and no forbidden data operation occurred.
