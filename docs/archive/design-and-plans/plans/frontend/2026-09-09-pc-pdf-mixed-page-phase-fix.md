# PC PDF Mixed-Page Phase Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a mixed PDF from failing when a directly extracted text page follows an OCR page.

**Architecture:** Keep the durable document-processing phase monotonic inside one parse run. Once the job has entered `OCR_RUNNING`, later text blocks advance checkpoints without returning to `EXTRACTING`; packaging and upload behavior remain unchanged.

**Tech Stack:** TypeScript 6, Node test runner, Vue/Tauri PC client

## Global Constraints

- Do not add `OCR_RUNNING → EXTRACTING` to the persistent transition table.
- Do not change PDF page classification, OCR behavior, Server API, database schema, or `.ppt` processing.
- Preserve all unrelated uncommitted work.
- Automated tests do not constitute Tauri GUI, Server, MinIO, or user-document acceptance.

---

### Task 1: Preserve OCR phase across later text blocks

**Files:**
- Modify: `Auralis-PC/scripts/r4-document-job-runner.test.mjs`
- Modify: `Auralis-PC/src/services/documentProcessing/DocumentJobRunner.ts`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: `DocumentJobRunner.start(jobId, metadata)` and the repository `transition(jobId, phase, options)` contract.
- Produces: monotonic `EXTRACTING → OCR_RUNNING → PACKAGING` persistence for mixed text/OCR PDFs.

- [x] **Step 1: Write the failing regression**

Add a transition-validating repository fixture and a parser sequence equivalent to:

```js
await sink({ ordinal: 0, kind: 'page', text: 'text page', pageNumber: 13 })
await sink({ ordinal: 1, kind: 'ocr-page', text: 'OCR page', pageNumber: 14 })
await sink({ ordinal: 2, kind: 'page', text: 'text again', pageNumber: 15 })
```

Assert that the durable phase reaches `PACKAGING`, the checkpoint reaches page 15 and ordinal 2, and the repository never receives `OCR_RUNNING → EXTRACTING`.

- [x] **Step 2: Run the regression and verify RED**

Run:

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-document-job-runner.test.mjs
```

Expected before the production change: the new case fails because the runner requests the forbidden `OCR_RUNNING → EXTRACTING` transition and ends in `FAILED_LOCAL` or surfaces `DOCUMENT_JOB_ILLEGAL_TRANSITION`.

- [x] **Step 3: Implement the minimal phase selection change**

Change the block callback phase selection to preserve the durable OCR phase:

```ts
const phase: DocumentJobPhase = block.kind === 'ocr-page' || job?.phase === 'OCR_RUNNING'
  ? 'OCR_RUNNING'
  : 'EXTRACTING'
```

Do not modify the transition table.

- [x] **Step 4: Verify GREEN and regression scope**

Run:

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-document-job-runner.test.mjs
npm.cmd run test:r4-pc
npm.cmd run type-check
cd ..
git diff --check
```

Expected: the focused and complete PC tests pass, type-check exits 0, and diff check reports no whitespace errors.

- [x] **Step 5: Record evidence and acceptance boundary**

Update the four authority documents listed above with the actual commands and counts. Keep the real 51-page PDF retry and Tauri/Server/MinIO observation open until manually exercised.
