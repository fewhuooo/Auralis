# PC OCR Runtime Page Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore live `currentPage / totalPages` data for the default local-only OCR path and feed it into the existing processing-center presentation without changing its layout or styling.

**Architecture:** `LocalParsedDocumentRepository` remains the durable source for pre-server OCR. The runtime attaches a scoped reader to `useDocumentProcessingStore`; the Store parses active `OCR_RUNNING` checkpoints into a small source-keyed projection. `DocumentProcessingCenter` reuses its existing Source row and status text area. Source READY reliability is tested separately and receives only a bounded reconciliation change if RED proves the current client cannot converge.

**Tech Stack:** Vue 3, Pinia, TypeScript, Node test runner, Tauri local SQLite repository.

## Global Constraints

- Preserve all frozen upload, parser, Server ingestion, API, database schema, MinIO, realtime, Store, and sync behavior unless a failing test proves the scoped correctness issue.
- Reuse the existing “正在识别第 X/Y 页” presentation; do not add a component, entry point, layout, style, animation, or alternate progress presentation.
- Do not merge `LocalParsedDocumentRepository` and `DocumentProcessingJobRepository`.
- Do not add Source-wide polling or redesign realtime/sync.
- Protect the existing dirty worktree and stage only task-owned files.

---

### Task 1: Local-only OCR progress projection

**Files:**
- Modify: `Auralis-PC/src/store/useDocumentProcessingStore.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Test: `Auralis-PC/scripts/r4-store-local-asset-flow.test.mjs`

**Interfaces:**
- Consumes: `LocalParsedDocumentRepository.listByPhase('OCR_RUNNING')` and `LocalParsedDocumentRecord.checkpointJson`.
- Produces: `LocalOcrPageProgress`, `attachLocalOcrProgressReader(reader)`, and `localOcrProgressBySource` keyed by local Source ID.

- [ ] **Step 1: Write the failing Store/runtime test**

Add a test that supplies an active local record whose checkpoint contains the existing parser event:

```ts
{
  type: 'before-recognize',
  pageNumber: 2,
  totalPages: 4,
  imageBytes: 10,
}
```

After `store.refresh()`, assert:

```ts
assert.deepEqual(store.localOcrProgressBySource['local-source-1'], {
  currentPage: 2,
  totalPages: 4,
})
```

Also cover malformed JSON, non-positive page values, and detaching the reader; these inputs must produce no projection rather than throw.

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs
```

Expected: failure because the Store has no local OCR reader or source-keyed projection.

- [ ] **Step 3: Implement the minimal Store projection**

Add these task-local interfaces and state:

```ts
export interface LocalOcrPageProgress {
  currentPage: number
  totalPages: number
}

interface LocalOcrProgressReader {
  list(): Promise<Array<{
    localSourceId: string
    checkpointJson: string | null
  }>>
}

localOcrProgressReader: null as LocalOcrProgressReader | null,
localOcrProgressBySource: {} as Record<string, LocalOcrPageProgress>,
```

`refresh()` must keep the existing Job refresh and, when a reader exists, parse only valid `before-recognize` checkpoints with integer `pageNumber >= 1`, integer `totalPages >= pageNumber`, producing `{ currentPage: pageNumber, totalPages }`. Reader failure sets no new UI data and must not prevent the existing Job list from refreshing.

In the runtime, attach an owner/device-scoped reader backed by:

```ts
await localParsedRepo.listByPhase('OCR_RUNNING')
```

Detach it together with the existing runner/scheduler when runtime state is cleared.

- [ ] **Step 4: Run GREEN**

Run the same focused command. Expected: all tests in the file pass.

- [ ] **Step 5: Commit Task 1**

Stage only the Store, runtime, and focused test. Commit:

```text
fix(pc): project local OCR page progress
```

---

### Task 2: Feed progress into the existing presentation

**Files:**
- Modify: `Auralis-PC/src/components/documentProcessing/DocumentProcessingCenter.vue`
- Test: `Auralis-PC/scripts/r4-document-processing-ui.test.mjs`

**Interfaces:**
- Consumes: `store.localOcrProgressBySource[source.id]` from Task 1.
- Produces: the existing Source processing row displays the existing text form `正在识别第 X/Y 页` while a local OCR checkpoint is active.

- [ ] **Step 1: Write the failing UI contract test**

Assert that the existing Source row resolves its detail text from the Store projection before falling back to `sourceDetailLabel(source.ingestionStatus)`, using this exact behavior:

```ts
const progress = store.localOcrProgressBySource[source.id]
progress ? `正在识别第 ${progress.currentPage}/${progress.totalPages} 页` : sourceDetailLabel(source.ingestionStatus)
```

The test must also assert that no new progress component or new layout class is introduced.

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-document-processing-ui.test.mjs
```

Expected: failure because the current Source row always uses the coarse Source status label.

- [ ] **Step 3: Implement the minimal consumption change**

Add one local helper in `DocumentProcessingCenter.vue`:

```ts
const sourceDetail = (source: SourceFileModel): string => {
  const progress = store.localOcrProgressBySource[source.id]
  return progress
    ? `正在识别第 ${progress.currentPage}/${progress.totalPages} 页`
    : sourceDetailLabel(source.ingestionStatus)
}
```

Replace only the existing Source-row detail expression with `sourceDetail(source)`. Keep the existing markup and classes.

- [ ] **Step 4: Run GREEN and the Task 1 regression**

Run:

```powershell
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-document-processing-ui.test.mjs scripts/r4-store-local-asset-flow.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

Commit only the component and UI test:

```text
fix(pc): restore OCR page status display
```

---

### Task 3: Verify Source READY convergence without broad hardening

**Files:**
- Modify: `Auralis-PC/scripts/r4-pc-protocol.test.mjs`
- Modify only after a proven RED: `Auralis-PC/src/services/realtimeController.ts`
- Modify only after a proven RED that is not closed by reconnect: the smallest existing processing-owned reconciliation boundary identified by the test; prefer `Auralis-PC/src/services/documentProcessing/runtime.ts`.

**Interfaces:**
- Consumes: existing `RealtimeController` connection lifecycle and `useSyncStore().requestBackgroundSync('realtime')`.
- Produces: explicit evidence for READY event loss and reconnect convergence.

- [ ] **Step 1: Add the reconnect verification**

Extend the existing `MockWebSocket` test: disconnect the first socket, change the simulated Server Source to READY while disconnected, open the replacement socket, and assert that opening the replacement requests one read/background sync and allows the local Source projection to hydrate to READY.

- [ ] **Step 2: Run the reconnect test**

Run:

```powershell
npm.cmd exec -- node --experimental-strip-types --test --test-name-pattern="reconnect.*sync|READY.*realtime" scripts/r4-pc-protocol.test.mjs
```

If GREEN, retain the test and do not change production reconnect behavior. If RED because reconnect performs no read sync, add exactly one `requestBackgroundSync('realtime')` call after a replacement socket reaches `onopen`; do not alter ticket, backoff, deduplication, or message handling.

- [ ] **Step 3: Add the missed READY verification**

Create a focused controlled test where Source is locally INDEXING, Server becomes READY, and the READY realtime message is omitted. Observe whether an existing bounded processing-owned sync path converges without page refresh.

- [ ] **Step 4: Run and classify the missed-event test**

If GREEN, retain the test and make no production change. If RED, implement one bounded reconciliation owned by the active document-processing flow: request read sync only while that Source remains in a processing state, stop on READY/FAILED/deletion, and impose an explicit finite attempt limit. Do not call the list endpoint on a permanent global interval.

- [ ] **Step 5: Run protocol/sync regressions and commit**

Run:

```powershell
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-pc-protocol.test.mjs scripts/r4-sync.test.mjs scripts/r4-document-processing-runtime.test.mjs
```

Commit the tests and only the production file proven necessary by RED:

```text
test(pc): verify Source READY convergence
```

Use `fix(pc): reconcile processing Source state` instead if production behavior changes.

---

### Task 4: Documentation and final verification

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: verified results and commit SHAs from Tasks 1–3.
- Produces: separate code, automated verification, and remaining real-Tauri acceptance statements.

- [ ] **Step 1: Update current documentation**

Record the restored local-only OCR page projection and reuse of the existing display. Record the actual outcome of both Source convergence tests without promoting an unconfirmed risk to a confirmed defect.

- [ ] **Step 2: Run focused and broad verification**

```powershell
npm.cmd run type-check
npm.cmd run test:r4-pc
npm.cmd run build
git diff --check
```

Expected: type-check exit 0, complete PC test suite exit 0, build exit 0 with only existing informational warnings, task-owned diff check exit 0.

- [ ] **Step 3: Reviewer gate**

Use one read-only reviewer. It must report BLOCKER / IMPORTANT / OPTIONAL and inspect only correctness, requirements, race, deadlock, transaction, data integrity, and security. Stop when BLOCKER=0, IMPORTANT=0, requirements are satisfied, and relevant tests pass.

- [ ] **Step 4: Commit documentation**

Stage only task-owned documentation and commit:

```text
docs(pc): record OCR progress recovery
```

---

### Task 5: Eliminate transient OCR progress fallback

**Files:**
- Modify: `Auralis-PC/src/store/useDocumentProcessingStore.ts`
- Test: `Auralis-PC/scripts/r4-store-local-asset-flow.test.mjs`
- Modify after verification: `docs/modules/FrontendPC.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, `docs/release/Changelog.md`

**Interfaces:**
- Consumes: the existing `localOcrProgressBySource` projection and scoped `LocalOcrProgressReader`.
- Produces: a stable last-valid page projection while an `OCR_RUNNING` record temporarily contains a non-`before-recognize` checkpoint or the reader is still pending.

- [ ] **Step 1: Write two failing Store tests**

Add one test that first reads a valid `before-recognize` checkpoint, then changes the same `OCR_RUNNING` record to `after-recognize`/`page-result`; assert that the existing `{ currentPage, totalPages }` remains visible. Add one deferred-reader test that starts a second `refresh()`, observes state before the reader resolves, and asserts the old projection is still present.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd exec -- node --experimental-strip-types --test --test-name-pattern="preserves.*OCR progress|keeps.*while.*reader" scripts/r4-store-local-asset-flow.test.mjs
```

Expected: both tests fail because `refresh()` clears `localOcrProgressBySource` before/after the asynchronous read.

- [ ] **Step 3: Implement the minimal atomic projection update**

Remove the eager projection clear before `reader.list()`. Build the next projection from the successful read, retaining the existing per-Source value only when that Source still has an `OCR_RUNNING` record whose latest checkpoint is a recognized same-run non-page-start event. Atomically assign the completed projection after the existing sequence/reader/generation guards pass. Preserve detach and lifecycle clearing behavior.

- [ ] **Step 4: Run GREEN and regressions**

```powershell
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs scripts/r4-document-processing-ui.test.mjs scripts/r4-local-parsed-coordinator.test.mjs
npm.cmd run type-check
git diff --check
```

Expected: all focused tests pass, type-check exits 0, and diff-check reports no whitespace errors.

- [ ] **Step 5: Document, review, and commit**

Record the verified anti-flicker behavior and retain real Tauri observation as an explicit manual boundary. Use one read-only reviewer; stop only with BLOCKER=0 and IMPORTANT=0. Commit only task-owned files.
