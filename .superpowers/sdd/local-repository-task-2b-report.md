# Task 2B evidence report

## Result

PC Subject deletion now commits the durable `SUBJECT/DELETE` marker first, then locally tombstones all owned Source, KnowledgeBlock, Task, and Relation projections without creating child mutations. Child outbox rows are removed in the same local cascade operation so a rejected Subject mutation can be repaired by later pull/snapshot. Subject/File overview caches, document-processing jobs, Source drafts, parser runtime hooks, and last-reference Local Assets are cleaned idempotently; startup Subject hydration replays the same coordinator for crash recovery.

## Original RED evidence

Command:

`npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs`

Before the production coordinator existed, the new focused test failed at module resolution with `ERR_MODULE_NOT_FOUND` for `src/services/subjectDeletionCoordinator.ts` (exit code 1). This was the expected RED baseline for the initial cascade behavior.

## Review-fix RED evidence

After the binding corrections were added to the brief, the focused regression test was extended before the production fixes. The command below exited 1 with three expected failures: pending parent deletion removed Local Asset bytes too early, the SQL cascade did not yet publish its affected projection types, and rejected Subject DELETE left the Subject tombstoned.

`npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs`

The fixes then added explicit rejected-delete restoration and snapshot reset, awaited draft cancellation/job fencing, projection notification publication and store consumption, pending-vs-APPLIED physical asset cleanup, and scheduling continuity when coordinator construction fails.

## Implementation boundary

- `LocalRepository.tombstoneSubjectChildren()` performs an owner-scoped, transaction-backed local-only cascade. It marks descendants deleted, purges their unresolved outbox rows, and returns the affected projections for auxiliary cleanup. Relation endpoints are matched when either endpoint is the deleted Subject.
- `SubjectDeletionCoordinator` separates the fast durable projection fence (`markDeletedSubject`) from slow physical/parser cleanup (`cleanupMarkedSubject`). Re-running either path is safe.
- `useSubjectStore.deleteSubject()` removes the Subject from navigation after the parent commit, completes the local child fence before releasing background sync, and lets file/cache cleanup continue in the background.
- `useSubjectStore.hydrateSubjects()` calls `reconcileDeletedSubjects()` so a crash between the parent marker and child cleanup converges on the next startup/hydration.
- `DocumentProcessingRuntime` registers scheduler and file-overview cancellation hooks. Native asset layout and Rust/Tauri behavior are unchanged.

## Changed files

- `Auralis-PC/src/services/localRepository.ts`
- `Auralis-PC/src/services/subjectDeletionCoordinator.ts`
- `Auralis-PC/src/services/syncCycle.ts`
- `Auralis-PC/src/store/useSubjectStore.ts`
- `Auralis-PC/src/services/documentProcessing/runtime.ts`
- `Auralis-PC/scripts/r4-subject-deletion-cascade.test.mjs`
- `Auralis-PC/scripts/r4-store-local-asset-flow.test.mjs`
- `Auralis-PC/package.json`
- `docs/modules/FrontendPC.md`

Pre-existing dirty files were not staged or modified: `Auralis-PC/auto-imports.d.ts`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, and `.reset-backup-*` directories.

## Verification

Date: 2026-09-18

1. `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs` — exit 0; 4/4 tests passed. Covers local cascade and idempotency, pending-vs-APPLIED asset bytes, SQL user scoping and relation cleanup, all affected projection notifications, rejected mutation restoration, and snapshot child hydration.
2. `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` — exit 0; 10/10 tests passed, including the real `useSubjectStore.deleteSubject()` boundary and awaited local cascade fence.
3. `npm.cmd run type-check` — exit 0; `vue-tsc -b` passed.
4. `npm.cmd run test:r4-pc` — exit 0; 338/338 tests passed, including the new cascade and store-boundary tests.
5. `npm.cmd run build` — exit 0; Vite production build completed. Existing large-chunk, browser-externalization, dynamic-import, and plugin-timing warnings remain informational.
6. `git diff --check` — exit 0; no whitespace errors in the task diff.

No Rust tests were required because no native behavior changed.

## Manual limitations

Automated tests do not constitute real Tauri GUI, SQLite restart, native filesystem, forced-termination, two-device convergence, Server/MinIO, low-disk, or long-running parser acceptance. Those remain open manual/business verification items.

## Commit

Initial implementation commit: `501671b feat(pc): cascade local subject deletion`.

Review-fix commit: `6a10fd5` (amended below only to record this final SHA).
