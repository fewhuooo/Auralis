# PC SQLite Concurrency Remediation Implementation Plan

> **For agentic workers:** Execute the tasks inline in order. Each task starts with a failing regression test and ends with its focused suite passing.

**Goal:** Make PC Tauri local persistence open and migrate `auralis.db` once per app lifecycle, serialize writes, and apply sync snapshots atomically on one native SQLite connection.

**Architecture:** The TypeScript local-database facade owns a single initialization promise and scoped repository cache. A small Tauri command layer owns SQLite connection initialization, write serialization, and the snapshot transaction because the SQL plugin's per-command pool API cannot preserve a transaction across `BEGIN`/`COMMIT` calls. Browser fallback semantics remain unchanged.

**Tech Stack:** Vue 3/Pinia, TypeScript, Tauri 2, Rust, SQLx/SQLite, Node assertion-based PC regression scripts.

## Global Constraints

- Keep user and `serverDeviceId` isolation unchanged.
- Do not delete legacy records or pending mutations during snapshot replacement.
- Do not expose local database paths, credentials, or payload plaintext through the command boundary.
- Preserve existing uncommitted user changes; do not commit this task automatically.

---

### Task 1: Deduplicate local database initialization and repository construction

**Files:**

- Modify: `Auralis-PC/src/services/localDb.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Test: `Auralis-PC/scripts/r4-local-repository.test.mjs`

**Interfaces:**

- Produces `getLocalRepository(userId, serverDeviceId)` and `getDocumentProcessingJobRepository(userId, serverDeviceId)` backed by a single loaded database and a schema-ready SQL adapter.
- Consumes the existing `LocalSqlDatabase` interface.

- [x] Write a failing test that issues concurrent repository requests against one injected SQL adapter and asserts schema initialization executes once.
- [x] Run `node scripts/r4-local-repository.test.mjs` and verify the new assertion fails because each repository calls `createVersionedLocalSchema`.
- [x] Add an application-scoped initialization promise in `localDb.ts`; return early once the database is ready and cache SQL repositories by `userId:serverDeviceId`.
- [x] Make SQL repository instances accept an already-schema-ready adapter so their per-instance `ensureSql()` does not rerun DDL.
- [x] Re-run `node scripts/r4-local-repository.test.mjs` and verify the added concurrency assertion passes.

### Task 2: Move SQLite-specific configuration and snapshot replacement into Tauri

**Files:**

- Modify: `Auralis-PC/src-tauri/src/lib.rs`
- Create: `Auralis-PC/src-tauri/src/local_database.rs`
- Modify: `Auralis-PC/src/api/tauri.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Test: `Auralis-PC/src-tauri/src/local_database.rs`
- Test: `Auralis-PC/scripts/r4-local-repository.test.mjs`

**Interfaces:**

- Produces `replace_local_resource_snapshot(user_id, items)` as one SQLx transaction.
- Consumes rows containing `resource_type`, `resource_id`, `version`, `deleted_at`, `sync_status`, and JSON `payload`.
- Returns no payload beyond command success/failure.

- [x] Write Rust tests for snapshot replacement: all non-pending rows are replaced, pending resource rows survive, and an injected invalid row rolls back the entire mutation.
- [x] Run the focused Rust test and verify it fails because the command module does not exist.
- [x] Implement a native SQLite connection path with WAL and a bounded `busy_timeout`; implement snapshot replacement in an explicit SQLx transaction on one connection.
- [x] Add the narrow Tauri command capability and TypeScript invocation wrapper.
- [x] Change SQL-backed `replaceSnapshotPreservingPending` to call the native command; remove front-end `BEGIN`, `COMMIT`, and `ROLLBACK` statements.
- [x] Re-run focused Rust and TypeScript regression tests and verify both pass.

### Task 3: Verify and document the operational boundary

**Files:**

- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [x] Run `node scripts/r4-local-repository.test.mjs`.
- [x] Run the Rust local-database tests (`cargo test --lib`: 13/13).
- [x] Run the existing PC regression command declared in `Auralis-PC/package.json` (168/176; 8 existing out-of-scope failures recorded in current status).
- [x] Record only actual command outcomes; retain Tauri GUI and real SQLite upgrade verification as manual acceptance boundaries if not run.
