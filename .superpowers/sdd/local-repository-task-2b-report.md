# Task 2B evidence report

## Result

PC Subject deletion now commits the durable `SUBJECT/DELETE` marker first, then locally tombstones all owned Source, KnowledgeBlock, Task, and Relation projections without creating child mutations. Child outbox rows are removed in the same local cascade operation so a rejected Subject mutation can be repaired by later pull/snapshot. Subject/File overview caches, document-processing jobs, Source drafts, parser runtime hooks, and last-reference Local Assets are cleaned idempotently; startup Subject hydration replays the same coordinator for crash recovery.

## RED evidence

Command:

`npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs`

Before the production coordinator existed, the new focused test failed at module resolution with `ERR_MODULE_NOT_FOUND` for `src/services/subjectDeletionCoordinator.ts` (exit code 1). This is the expected RED baseline for the new cascade behavior.

## Implementation boundary

- `LocalRepository.tombstoneSubjectChildren()` performs an owner-scoped, transaction-backed local-only cascade. It marks descendants deleted, purges their unresolved outbox rows, and returns the affected projections for auxiliary cleanup. Relation endpoints are matched when either endpoint is the deleted Subject.
- `SubjectDeletionCoordinator` separates the fast durable projection fence (`markDeletedSubject`) from slow physical/parser cleanup (`cleanupMarkedSubject`). Re-running either path is safe.
- `useSubjectStore.deleteSubject()` removes the Subject from navigation after the parent commit, completes the local child fence before releasing background sync, and lets file/cache cleanup continue in the background.
- `useSubjectStore.hydrateSubjects()` calls `reconcileDeletedSubjects()` so a crash between the parent marker and child cleanup converges on the next startup/hydration.
- `DocumentProcessingRuntime` registers scheduler and file-overview cancellation hooks. Native asset layout and Rust/Tauri behavior are unchanged.

## Changed files

- `Auralis-PC/src/services/localRepository.ts`
- `Auralis-PC/src/services/subjectDeletionCoordinator.ts`
- `Auralis-PC/src/store/useSubjectStore.ts`
- `Auralis-PC/src/services/documentProcessing/runtime.ts`
- `Auralis-PC/scripts/r4-subject-deletion-cascade.test.mjs`
- `Auralis-PC/package.json`
- `docs/modules/FrontendPC.md`

Pre-existing dirty files were not staged or modified: `Auralis-PC/auto-imports.d.ts`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, and `.reset-backup-*` directories.

## Verification

Date: 2026-09-18

1. `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs` — exit 0; 2/2 tests passed. Covers Subject B isolation, child mutation purge, overview/job/draft cleanup, last-reference asset deletion, idempotent rerun, and shared-asset preservation.
2. `npm.cmd run type-check` — exit 0; `vue-tsc -b` passed.
3. `npm.cmd run test:r4-pc` — exit 0; 336/336 tests passed, including the new cascade tests.
4. `npm.cmd run build` — exit 0; Vite production build completed. Existing large-chunk and browser-externalization warnings remain informational.
5. `git diff --check` — exit 0; no whitespace errors in the task diff.

No Rust tests were required because no native behavior changed.

## Manual limitations

Automated tests do not constitute real Tauri GUI, SQLite restart, native filesystem, forced-termination, two-device convergence, Server/MinIO, low-disk, or long-running parser acceptance. Those remain open manual/business verification items.

## Commit

Recorded after staging the Task 2B files below.
