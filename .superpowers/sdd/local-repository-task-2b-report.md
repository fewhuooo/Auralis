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

## Second-round reviewer RED→GREEN evidence

The second-round focused tests were extended before the corresponding production edits. The RED run exited 1 with the expected failures: rejected restore did not persist `reset_required`, pending deletion terminally marked the local-only draft, and a resumed draft release could recreate `SOURCE/CREATE`.

`npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs`

The GREEN implementation now makes parent restore, auditable mutation resolution, and `reset_required = 1` one SQL transaction or one browser-state write; keeps the reset flag after snapshot failure for the next retry; serializes the Subject fence and queue release through the existing non-reentrant owner/device lifecycle lock; retains pending local-only draft metadata/bytes and reprojects them after rejection; and coalesces hydration while replay notifications refresh the other Stores.

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
- `Auralis-PC/src/store/useSyncStore.ts`
- `Auralis-PC/src/store/useSourceStore.ts`
- `Auralis-PC/src/services/localSourceDraftService.ts`
- `Auralis-PC/src/services/localAssetRepository.ts`
- `Auralis-PC/src/services/localProjectionEvents.ts`
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

Second-round focused verification:

1. `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs` — exit 0; 7/7 tests passed, including SQL/browser reset retry, claimed queue fencing, runtime hooks, replay notification, local-only draft/asset rejection recovery, and APPLIED shared server-backed asset retention.
2. `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` — exit 0; 12/12 tests passed, including actual Source Store notification consumption and `useSubjectStore` rejected-sync hydration recovery.
3. `npm.cmd run type-check` — exit 0; `vue-tsc -b` passed after the second-round changes.
4. `npm.cmd run test:r4-pc` — exit 0; 341/341 tests passed.

No Rust tests were required because no native behavior changed.

## Final reviewer critical-lock RED→GREEN evidence

- RED: `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs` — exit 1; the deterministic claimed-queue barrier returned `['source-lock-race']`, proving the old implementation could create SOURCE/CREATE after the parent marker but before the child fence acquired the lifecycle lock.
- GREEN: the same focused command — exit 0; 8/8 passed. The barrier now runs a real claimed `LocalAssetSyncQueue`, confirms the queue owns the owner/device lifecycle lock before the coordinator enters, and asserts no SOURCE mutation, draft remains `DRAFT`, local bytes remain readable, and no SOURCE wakeup occurs.
- Combined focused: `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-subject-deletion-cascade.test.mjs scripts/r4-store-local-asset-flow.test.mjs` — exit 0; 20/20 passed.
- Queue/sync ordering: `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-local-asset-sync-queue.test.mjs scripts/r4-sync.test.mjs` — exit 0; 29/29 passed, including release wakeup behavior, interrupted release retry, and sync push ordering coverage.
- `npm.cmd run type-check` — exit 0; `vue-tsc -b` passed.
- `npm.cmd run test:r4-pc` — exit 0; 342/342 passed.
- `npm.cmd run build` — exit 0; Vite production build completed with the existing externalization, chunk-size, dynamic-import, and plugin-timing warnings.
- `git diff --check` — exit 0; no whitespace errors.

The final lock fix only re-reads the draft's Subject projection and unresolved mutations while holding the existing owner/device lifecycle lock; it skips release without terminally deleting the draft when a local or unresolved SUBJECT/DELETE fence is present. `syncOrdering` remains SUBJECT-before-SOURCE for creates, and queue wakeup remains conditional on an actual released Source, so this barrier cannot enqueue or push SOURCE/CREATE.

## Manual limitations

Automated tests do not constitute real Tauri GUI, SQLite restart, native filesystem, forced-termination, two-device convergence, Server/MinIO, low-disk, or long-running parser acceptance. Those remain open manual/business verification items.

## Commit

Initial implementation commit: `501671b feat(pc): cascade local subject deletion`.

Review-fix implementation commit: `34942bdcc3b7af48d11ad1bef3586e27c4af18e2`.

Second-round implementation commit: `2b37cb0b906736e8e0a4de7a3f840d52640d5521`.
