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
- `createFileSource()` passes its selected `subjectId` into projection replacement for both local-draft and server-ready Asset paths.
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
