# OCR Progress Task 1 Report

## Result

DONE_WITH_CONCERNS

Task 1 now projects valid local-only OCR page checkpoints into the existing document-processing Store while preserving Job refresh. The runtime provides an owner/device-scoped `listByPhase('OCR_RUNNING')` reader and clears the reader/projection during runtime cleanup.

## Verification

Date: 2026-09-18

| Command | Exit code | Key output / scope |
| --- | ---: | --- |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` (RED, before implementation) | 1 | Expected failure: `TypeError: store.attachLocalOcrProgressReader is not a function`; 12/13 existing tests passed. |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` (GREEN) | 0 | 13/13 tests passed, including valid page `2/4`, malformed JSON, invalid bounds, reader failure, Job refresh retention, and detach clearing. |
| `npm.cmd run type-check` | 0 | `vue-tsc -b` passed. |
| `git diff --check` | 0 | No whitespace errors. |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-document-processing-runtime.test.mjs` | 1 | 13/14 passed; unrelated existing assertion `runtime forwards the scheduler-owned Asset SHA without hashing the parser input again` failed because its `runJob` regex did not match the current runtime source. No file in that test was modified. |

## Commit

Implementation commit: `9ce3520e6410fe954c5c7019e3ce061f7f95345d` (`fix(pc): project local OCR page progress`)

## Files changed

- `Auralis-PC/src/store/useDocumentProcessingStore.ts`
- `Auralis-PC/src/services/documentProcessing/runtime.ts`
- `Auralis-PC/scripts/r4-store-local-asset-flow.test.mjs`

## Self-review

- Only `before-recognize` JSON checkpoints with integer `pageNumber >= 1` and `totalPages >= pageNumber` are projected.
- Malformed checkpoints and reader failures are isolated; reader failures clear projection and preserve the Job refresh.
- The repository is not imported or constructed by the Store; runtime supplies the already owner/device-scoped reader.
- Runtime cleanup detaches the reader and clears the projection.
- No UI, Source/realtime/sync production behavior, API, schema, style, or unrelated files were changed.

## Uncovered scope

The focused Task 1 test and type-check pass. Real Tauri runtime behavior and the unrelated existing runtime-test regex failure remain outside this task's implementation scope.

## Follow-up: stale completion guard

Reviewer IMPORTANT was addressed with a reader generation/identity guard and a refresh sequence guard. Deferred tests prove that a reader resolving after detach cannot repopulate the projection and that an older overlapping refresh cannot overwrite a newer projection.

| Command | Exit code | Key output / scope |
| --- | ---: | --- |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` (RED, before guard) | 1 | 13/15 passed; detach test observed stale `local-source-stale` projection after detach, and overlap test observed stale `local-source-old` replacing `local-source-new`. |
| `npm.cmd exec -- node --experimental-strip-types --test scripts/r4-store-local-asset-flow.test.mjs` (GREEN, after guard) | 0 | 15/15 passed, including both deferred/barrier stale-completion tests. |
| `npm.cmd run type-check` | 0 | `vue-tsc -b` passed. |
| `git diff --check` | 0 | No whitespace errors. |

Follow-up implementation commit: `9f56b4aa70178652a7f1367327e3e81b19b22c5d` (`fix(pc): guard stale local OCR progress refresh`)

Follow-up files changed: `Auralis-PC/src/store/useDocumentProcessingStore.ts`, `Auralis-PC/scripts/r4-store-local-asset-flow.test.mjs`.

The previously recorded unrelated runtime-test regex failure remains unchanged and was not broadened into this fix.
