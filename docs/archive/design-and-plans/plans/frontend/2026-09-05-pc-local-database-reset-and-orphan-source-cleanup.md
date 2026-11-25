# PC Local Database Reset and Orphan Source Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset the stale development Tauri SQLite generation and make Source 404 responses permanently discard owner-scoped document jobs instead of retrying forever.

**Architecture:** Keep database deletion as an explicit development operation against the exact runtime-resolved `auralis.db` path. In the application, classify only structured `ApiProblemError` responses with HTTP 404 or code `RESOURCE_NOT_FOUND`, then reuse `SourceJobScheduler.discard()` for idempotent job/parser/cache cleanup and return a stable skipped result.

**Tech Stack:** Vue 3, TypeScript, Tauri v2, `@tauri-apps/plugin-sql`, Node test runner, PowerShell.

## Global Constraints

- Preserve all unrelated dirty-worktree changes.
- Delete only the confirmed Auralis `auralis.db`, `auralis.db-wal`, and `auralis.db-shm` files after the Auralis/Tauri process is stopped.
- Do not treat network errors, authentication failures, conflicts, rate limits, 5xx responses, or unknown exceptions as a missing Source.
- Cleanup remains scoped by the existing repository's `userId` and `serverDeviceId`.
- Do not change HTTP API or database schema contracts.

---

### Task 1: Add orphan Source regression coverage

**Files:**
- Modify: `Auralis-PC/scripts/r4-source-processing-schedule.test.mjs`

**Interfaces:**
- Consumes: `SourceJobScheduler.schedule(sourceId)` and `SourceJobScheduler.discard(sourceId)`.
- Produces: regression coverage for `{ status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }`.

- [ ] **Step 1: Extend the scheduler harness with Source API call/error control**

Add a `sourceError` option and `calls.sourceGet` counter. The mock must increment the counter and throw the supplied error before returning `currentSource`:

```js
sourceApi: {
  async get() {
    calls.sourceGet += 1
    if (sourceError) throw sourceError
    return currentSource
  },
},
```

- [ ] **Step 2: Write the failing 404 cleanup test**

Create an `ApiProblemError` with status 404 and code `RESOURCE_NOT_FOUND`. Seed one job with a cache receipt, schedule the Source, and assert:

```js
assert.deepEqual(result, { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' })
assert.equal((await repository.list()).length, 0)
assert.deepEqual(calls.cancelled, ['orphan-job'])
assert.deepEqual(calls.deletedCaches, ['cache-1'])
assert.equal(calls.sourceGet, 1)
assert.deepEqual(await scheduler.schedule('source-1'), { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' })
assert.equal(calls.sourceGet, 1)
```

- [ ] **Step 3: Add non-404 guard coverage**

Use an `ApiProblemError` with status 503/code `INTERNAL_ERROR`; assert `schedule()` rejects and the seeded job remains present.

- [ ] **Step 4: Run the focused test and confirm the new 404 case fails**

Run:

```powershell
node --experimental-strip-types --test scripts/r4-source-processing-schedule.test.mjs
```

Expected before implementation: the 404 case rejects with `ApiProblemError: Source was not found`.

---

### Task 2: Permanently terminate orphan Source jobs

**Files:**
- Modify: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- Test: `Auralis-PC/scripts/r4-source-processing-schedule.test.mjs`

**Interfaces:**
- Consumes: `ApiProblemError.status`, `ApiProblemError.problem.code`, and existing `discard(sourceId)`.
- Produces: `isSourceNotFound(error: unknown): boolean` and stable `SOURCE_NOT_FOUND` skipped results.

- [ ] **Step 1: Add structured error classification**

Import `ApiProblemError` and add:

```ts
function isSourceNotFound(error: unknown): boolean {
  return error instanceof ApiProblemError
    && (error.status === 404 || error.problem.code === 'RESOURCE_NOT_FOUND')
}
```

- [ ] **Step 2: Guard the Source lookup boundary**

Replace the direct lookup with a narrow catch:

```ts
let source: SourceView
try {
  source = await this.sourceApi.get(sourceId)
} catch (error) {
  if (!isSourceNotFound(error)) throw error
  await this.discard(sourceId)
  return { status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }
}
```

Do not wrap later parser/upload errors with this classifier because a 404 from another resource is not proof that the Source itself is absent.

- [ ] **Step 3: Run the focused scheduler suite**

Run:

```powershell
node --experimental-strip-types --test scripts/r4-source-processing-schedule.test.mjs
```

Expected: all tests pass, including 404 cleanup and 503 preservation.

- [ ] **Step 4: Run adjacent document-processing suites**

Run:

```powershell
node --experimental-strip-types --test scripts/r4-document-job-schema.test.mjs scripts/r4-document-job-runner.test.mjs scripts/r4-document-processing-flow.test.mjs scripts/r4-parsed-document-upload.test.mjs scripts/r4-source-processing-schedule.test.mjs
```

Expected: all tests pass.

---

### Task 3: Locate and reset the development Tauri SQLite database

**Files:**
- Delete outside repository only after validation: `<Auralis app config dir>/auralis.db`
- Delete if present: `<Auralis app config dir>/auralis.db-wal`
- Delete if present: `<Auralis app config dir>/auralis.db-shm`

**Interfaces:**
- Consumes: `Database.load('sqlite:auralis.db')`, Tauri `app_config_dir()`, identifier `com.auralis.app`.
- Produces: an empty local database recreated by the existing startup schema.

- [ ] **Step 1: Confirm no Auralis/Tauri development process is running**

Run:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'Auralis|auralis' -or $_.CommandLine -match 'Auralis-PC|tauri dev' } | Select-Object ProcessId,Name,CommandLine
```

Expected: no matching application process. If a match exists, stop the normal development process before continuing; do not delete an open database.

- [ ] **Step 2: Resolve exact candidates without deleting anything**

Inspect both Tauri Windows data roots and verify each resolved path remains below the matching `com.auralis.app` directory:

```powershell
$auralisRoots = @(
  (Join-Path $env:APPDATA 'com.auralis.app'),
  (Join-Path $env:LOCALAPPDATA 'com.auralis.app')
)
$auralisRoots | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @('auralis.db','auralis.db-wal','auralis.db-shm') } |
    Select-Object FullName,Length,LastWriteTime
}
```

Expected: one application directory owns the active files. If no candidate appears, start and cleanly stop Tauri once, then repeat; do not broaden deletion to AppData recursively.

- [ ] **Step 3: Delete only validated database files**

For each exact path returned in Step 2, verify `Resolve-Path` is beneath the selected Auralis root and the leaf name is in the three-name allowlist, then use `Remove-Item -LiteralPath` on those explicit paths. Do not use a wildcard or recursive delete.

- [ ] **Step 4: Restart and verify schema initialization**

Start the normal Tauri development command and verify the console includes:

```text
[SQLite PC] Database initialized and tables verified.
```

Then log in and verify the removed Source ID is no longer requested. Record GUI/Server behavior separately from automated test results.

---

### Task 4: Update authoritative documentation and run final checks

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- Consumes: actual implementation and command evidence from Tasks 1–3.
- Produces: current implementation, risk, release, and verification records without conflating tests with GUI acceptance.

- [ ] **Step 1: Record the implementation boundary**

Document that only Source lookup 404/`RESOURCE_NOT_FOUND` triggers owner-scoped orphan cleanup and that other failures preserve existing semantics.

- [ ] **Step 2: Record database reset evidence**

Include the exact removed paths and whether WAL/SHM existed. State clearly whether restart and login GUI verification were performed.

- [ ] **Step 3: Run repository checks**

Run:

```powershell
npm run type-check
npm run check:r4-pc
git diff --check
```

Expected: commands exit 0. Any unrelated pre-existing failure must be reported with its exact output and must not be relabeled as caused by this change.

- [ ] **Step 4: Review the final diff**

Run `git status --short` and `git diff --` for only the files in this plan. Confirm unrelated user modifications remain unchanged and all documentation stays in the repository's current authoritative directories.
