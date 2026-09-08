# PC Upload Processing Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Follow test-driven development for every behavior change.

**Goal:** Restore the PC ParsedDocument pipeline, make Stats timestamp binding PostgreSQL-safe, align accepted uploads with parser support, and expose truthful processing states.

**Architecture:** Preserve the existing upload and Source APIs. Fix each failure at its owning boundary: Cargo feature selection for credential storage, repository parameter normalization for JDBC, the shared file capability registry for upload admission, and the processing-center presentation mapper for status copy.

**Tech Stack:** Tauri/Rust, keyring 3, Vue 3/TypeScript, Node test runner, Spring JDBC/PostgreSQL, JUnit.

## Global Constraints

- Preserve all existing uncommitted user changes and do not reset or overwrite unrelated files.
- Keep `auralis/master_key`; do not introduce plaintext or secondary-key fallback.
- Do not change the upload, Source, ParsedDocument API, or database schema.
- Uploadable document formats after this fix are exactly PDF, DOC, DOCX, PPT, and PPTX.
- Preview capability may remain for images and text even when upload admission is false.
- `AWAITING_CLIENT` must never be described as server-side processing.
- Update current module/status/risk/release documentation with observed verification evidence.

---

### Task 1: Persist the master key through Windows Credential Manager

**Files:**
- Modify: `Auralis-PC/src-tauri/Cargo.toml`
- Modify/Test: `Auralis-PC/scripts/r4-document-processing-runtime.test.mjs`
- Verify: `Auralis-PC/src-tauri/Cargo.lock`

- [ ] Add a failing regression assertion that the keyring dependency enables `windows-native`.
- [ ] Run the focused Node test and record the expected failure.
- [ ] Change the dependency to `keyring = { version = "3", features = ["windows-native"] }` without changing the key service/user identifiers.
- [ ] Refresh the lockfile through Cargo and rerun the focused test.
- [ ] Run `cargo check` and inspect `cargo tree -e features -i keyring` for `windows-native`.

### Task 2: Bind Stats instants with an explicit JDBC-compatible type

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/stats/internal/StatsQueryRepository.java`
- Create or Modify Test: focused Stats repository test under `Auralis-Server/src/test/java/com/auralis/app/`

- [ ] Add a failing test proving repository calls do not pass raw `Instant` values to `JdbcTemplate`.
- [ ] Add one private argument-normalization boundary that converts every `Instant` argument consistently while preserving UUID and other values.
- [ ] Rerun the focused test and existing `StatsServiceTests`.
- [ ] Do not change SQL text, HTTP response types, or API contracts.

### Task 3: Align upload admission with ParsedDocument parser support

**Files:**
- Modify: `Auralis-PC/src/utils/filePreview.ts`
- Modify/Test: `Auralis-PC/scripts/r4-file-preview.test.mjs`
- Modify if needed: upload-form copy in `Auralis-PC/src/views/SubjectWorkspace/index.vue`

- [ ] Add failing cases asserting PDF/Office are uploadable and image/text/CSV are preview-only and rejected before an upload intent.
- [ ] Keep renderer/kind resolution for preview, but set upload admission to false outside PDF/Office.
- [ ] Return an actionable validation message listing the supported document formats.
- [ ] Rerun the focused file-preview and registration tests.

### Task 4: Show the actual local/server processing stage

**Files:**
- Modify: `Auralis-PC/src/components/documentProcessing/DocumentProcessingCenter.vue`
- Modify/Test: the closest document-processing component/static test under `Auralis-PC/scripts/`

- [ ] Add a failing assertion that an `AWAITING_CLIENT` Source with no job says it is waiting for desktop processing and offers the existing start action.
- [ ] Add explicit copy for `VALIDATING`, `PARSING`, and `INDEXING`; reserve server-processing wording for those phases.
- [ ] Preserve existing local job phase/error/retry/cancel behavior.
- [ ] Rerun the focused processing tests.

### Task 5: Documentation and full verification

**Files:**
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [ ] Record implementation facts separately from automated verification and GUI acceptance.
- [ ] Run focused Node tests and `npm.cmd run check:r4-pc`.
- [ ] Run PC type-check and report pre-existing versus introduced errors.
- [ ] Run `cargo check` and feature-tree inspection.
- [ ] Run focused backend Stats tests and `git diff --check`.
- [ ] Inspect the final diff for unrelated changes; do not commit unless explicitly requested.
