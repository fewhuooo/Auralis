# Local Repository Task 1 Evidence Report

## Result

Subject-scoped Source ownership is repaired in the PC Store path. The native managed-file layout remains unchanged and Subject-independent (`assets/{userScope}/{localAssetId}/content.{ext}`).

## Root cause and evidence

`Auralis-PC/src/store/useSourceStore.ts` used the first currently visible Source row to infer the focus subject whenever `replaceSources()` was called without an explicit subject. Both `createFileSource()` branches called it without the requested `subjectId`. Therefore, after Subject A was focused, importing into Subject B updated the complete `sources` list but kept `activeSourceFiles` filtered to Subject A. When a requested subject had zero rows, later `hydrateSources()` could not infer its identity from the empty list and exposed all Sources.

The regression reproduces this boundary: focus Subject A, create a Source for Subject B, then assert the active projection is B; load an empty Subject and hydrate again, then assert the projection remains empty. The stored local Source projection and Source draft are also checked for the requested `subjectId`; the existing queue test now checks that the released `SOURCE/CREATE` mutation retains it.

## RED

Command:

```text
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs
```

Exit code: `1`.

Expected failure: the new subject-scope regression failed because the active projection still contained the previously focused Subject A Source instead of the newly imported Subject B Source. The focused run reported `7` passed and `1` failed.

## Changed behavior

- `useSourceStore` now tracks the requested subject independently from visible rows, so an empty subject remains the focus during hydration.
- `createFileSource()` preserves the current workspace focus when updating the projection; it falls back to the selected `subjectId` only when no workspace focus exists, for both local-draft and server-ready Asset paths.
- `useSubjectStore.setActiveSubject(null)` clears the Source focus through the Store API instead of mutating the projection directly.
- The focused regression covers Subject A → Subject B import, empty-subject hydration, local Source projection, local Source draft, and `SOURCE/CREATE` subject ownership.
- `docs/modules/FrontendPC.md` records the subject-scoped projection behavior.

No API or database contract changed. No native Asset path or physical directory migration was made.

## GREEN and full verification

| Command | Exit code | Result |
| --- | ---: | --- |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` | 0 | Focused Local Asset/Source flow: `8/8` passed |
| `npm.cmd run type-check` | 0 | `vue-tsc -b` passed |
| `npm.cmd run test:r4-pc` | 0 | Full PC R4 suite: `334/334` passed |
| `git diff --check` | 0 | No whitespace errors in the task diff |

The focused test is a separate Local Asset/Source flow script and is not one of the scripts listed by the existing `test:r4-pc` npm script; it was run directly as shown above.

## Commits

- `3098a9d` — `fix(pc): preserve subject-scoped source ownership`
- The evidence report is committed separately after this code commit.

## Remaining risks and manual coverage

- Real Tauri GUI route switching, restart hydration, and native filesystem behavior were not manually exercised in this task.
- Two-device convergence, Server/MinIO sync, offline restart, low-disk behavior, and forced termination remain outside this automated run and retain the repository's existing manual-acceptance boundary.
- Pre-existing user changes in `Auralis-PC/auto-imports.d.ts`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, and `.reset-backup-*` were not staged or modified.

## Review follow-up evidence

The first implementation passed the requested import target as the active projection focus. Review correctly identified that this could make a Subject B import replace the visible Subject A workspace. The fix now uses the existing workspace focus when present (`activeSubjectId ?? subjectId`); the target Subject is used only when no workspace focus exists. The integration regression now drives `useSubjectStore.setActiveSubject('subject-a')`, imports a file targeted at Subject B, and verifies that the visible projection remains Subject A while the stored Source remains owned by Subject B.

The first implementation also allowed an older fire-and-forget Subject A load to commit after a newer Subject B load. `useSourceStore.loadLocalSourceFiles()` now increments a request generation, records the current subject before awaiting storage, and drops a result whose generation or current subject no longer matches. Clearing the active workspace invalidates pending loads as well.

Follow-up RED command:

```text
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs
```

Exit code: `1`; the review regressions reported `7/9` passed and `2` failed: import focus still switched to Subject B, and the stale A load overwrote Subject B.

Follow-up GREEN verification:

| Command | Exit code | Result |
| --- | ---: | --- |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` | 0 | Focused Local Asset/Source flow: `9/9` passed, including workspace-focus and deferred-load race regressions |
| `npm.cmd run type-check` | 0 | `vue-tsc -b` passed |
| `npm.cmd run test:r4-pc` | 0 | Full PC R4 suite: `334/334` passed |

Follow-up code changes are in `Auralis-PC/src/store/useSourceStore.ts`, `Auralis-PC/scripts/r4-store-local-asset-flow.test.mjs`, and the clarified `docs/modules/FrontendPC.md` entry. Follow-up code/report commit: `80e1d73` (`fix(pc): guard subject source projection races`).

## Second review follow-up evidence

The second review found two remaining async projection issues. Starting a new subject load changed `activeSubjectId` but left the previous subject's rows visible until storage returned, and a superseded caller returned the current active rows from the newer subject. The final implementation now immediately recomputes `activeSourceFiles` from the cached full projection for the new subject (which clears the list for an empty subject) and returns an explicit empty array for a superseded request.

Second-review RED command:

```text
npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs
```

Exit code: `1`; the focused run reported `8/9` passed and failed on the new transition-state assertion, showing the prior Subject A row still visible after switching to an empty Subject before the deferred read resolved.

Second-review GREEN verification:

| Command | Exit code | Result |
| --- | ---: | --- |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` | 0 | Focused Local Asset/Source flow: `9/9` passed, including immediate empty-subject clearing and stale-caller result semantics |
| `npm.cmd run type-check` | 0 | `vue-tsc -b` passed |
| `npm.cmd run test:r4-pc` | 0 | Full PC R4 suite: `334/334` passed |

Second-review fixes are included in the follow-up commit to be reported by the handoff.
