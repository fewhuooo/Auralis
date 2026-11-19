# Remove Subject Color Frontend Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Subject-specific color state and styling from PC and Mobile clients while retaining generic block/task overrides and non-Subject color systems.

**Architecture:** Subject models and payloads contain only identity, text, icon, ordering, version, and deletion data. Subject UI uses existing fixed Sage/semantic tokens; KnowledgeBlock and Task models keep their own color fields and mapping. Local databases stop writing Subject color while tolerating pre-existing rows through the existing migration/initialization path.

**Tech Stack:** Vue 3, TypeScript, Pinia, UniApp/Vue, SQLite/Tauri local persistence, checked-in generated OpenAPI types, Node test scripts.

## Global Constraints

- Modify only `Auralis-PC` and `Auralis-Mobile` frontend code, generated client schema, and frontend tests.
- Preserve existing uncommitted worktree changes and unrelated behavior.
- Remove Subject `color`, `subjectColor`, and `subj-theme-color` references.
- Preserve KnowledgeBlock/Task `colorOverride` and their local legacy display colors.
- Preserve chart palettes, state colors, and global Sage design tokens.

---

### Task 1: Update Subject client contracts and models

**Files:**
- Modify: `Auralis-PC/src/api/useSubjectApi.ts`
- Modify: `Auralis-PC/src/services/domainMappers.ts`
- Modify: `Auralis-PC/src/store/useSubjectStore.ts`
- Modify: `Auralis-PC/src/api/generated/schema.ts`
- Modify: `Auralis-Mobile/src/store/useSubjectStore.ts`
- Modify: `Auralis-Mobile/src/store/useSyncStore.ts`
- Modify: `Auralis-Mobile/src/api/generated/schema.ts`

- [ ] **Step 1: Update frontend tests/fixtures to assert Subject payloads have no color.**

  Cover create, update, sync apply, and mapper output; keep explicit fixtures for `colorOverride` on block/task resources.

- [ ] **Step 2: Run focused frontend tests and verify failures identify Subject color dependencies.**

  Run the existing PC/Mobile protocol/store test commands from each package’s `package.json`.

- [ ] **Step 3: Remove Subject `color` from request types, DTO-like types, SubjectModel, and Subject mapper output.**

  Do not change `KnowledgeBlockDtoLike.colorOverride`, `TaskDtoLike.colorOverride`, or their mapped fields.

- [ ] **Step 4: Remove the color argument/property from PC and Mobile Subject create/update/store paths.**

  Keep local-first IDs, versions, outbox mutations, and sync behavior unchanged.

- [ ] **Step 5: Remove Subject color from Mobile sync resource conversion and apply logic.**

  Keep the existing block/task `colorOverride` conversions intact and verify the resource-type branch, rather than deleting every occurrence of the word `color`.

- [ ] **Step 6: Regenerate or update checked-in client schema output according to the existing frontend workflow.**

  Remove Subject schema fields only; retain generic `colorOverride` schema fields.

- [ ] **Step 7: Re-run focused client tests and verify they pass.**

### Task 2: Remove PC Subject-specific visual styling and pass-throughs

**Files:**
- Modify: `Auralis-PC/src/components/subject/SubjectCreateModal.vue`
- Modify: `Auralis-PC/src/components/subject/KnowledgeGraph.vue`
- Modify: `Auralis-PC/src/views/SubjectHall/index.vue`
- Modify: `Auralis-PC/src/views/Home/index.vue`
- Modify: `Auralis-PC/src/views/Asset/index.vue`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Modify: `Auralis-PC/src/views/Profile/index.vue`
- Modify: `Auralis-PC/scripts/check-subject-icon-rendering.mjs`

- [ ] **Step 1: Update the icon/rendering test to assert fixed semantic Sage styling and no Subject color field.**

  Remove the old default-color expectation; retain assertions that the icon preview/workspace icon does not depend on `activeSubject.color`.

- [ ] **Step 2: Remove Subject color form state and create callback arguments.**

  `SubjectCreateModal` continues to support name, description, and icon only.

- [ ] **Step 3: Replace Subject Hall per-card CSS variables and `color-mix` rules with existing shared semantic tokens.**

  Remove `--subj-theme-color` bindings and keep card focus/hover/active styling visually consistent using global tokens.

- [ ] **Step 4: Remove `subjectColor` from KnowledgeGraph props and callers.**

  Preserve node status colors and graph palette logic.

- [ ] **Step 5: Remove Profile subject distribution dependence on `sub.color`.**

  Use fixed semantic Sage/neutral styles for the dot and bar.

- [ ] **Step 6: Remove Subject color pass-through from Home, Asset, and SubjectWorkspace task/block flows.**

  Keep block/task-specific colors where their own `colorOverride` is intended; do not replace those with Subject color.

- [ ] **Step 7: Run the focused PC tests and typecheck/build command.**

### Task 3: Remove Mobile persistence and task-form Subject color coupling

**Files:**
- Modify: `Auralis-Mobile/src/services/localDb.ts`
- Modify: `Auralis-Mobile/src/components/AddTaskSheet.vue`
- Modify: affected Mobile `src/pages/**` files found by the targeted Subject-color search.

- [ ] **Step 1: Add/update a persistence test proving Subject save SQL has no color column/value while task/block SQL still retains its color field.**

- [ ] **Step 2: Run the focused persistence test and verify it fails against current Subject SQL.**

- [ ] **Step 3: Remove Subject `color` from SQLite/localStorage reads and writes.**

  Preserve `version`, `subject_id` relationships, delete behavior, and existing migration compatibility for databases created before this change.

- [ ] **Step 4: Remove `subjectColor` from AddTaskSheet props/form and stop sending Subject color as a task color.**

  If the task form needs a default, use its existing task semantic color/default path.

- [ ] **Step 5: Remove only remaining Subject color UI references in Mobile pages.**

- [ ] **Step 6: Run Mobile protocol, persistence, typecheck/build tests and verify they pass.**

### Task 4: Audit preservation boundaries and finalize

**Files:**
- No new files.

- [ ] **Step 1: Search for Subject-specific color residue.**

  Run: `rg -n -i "subject.*color|color.*subject|subjectColor|subj-theme-color" Auralis-PC/src Auralis-Mobile/src Auralis-PC/scripts Auralis-Mobile/scripts`.

- [ ] **Step 2: Search for preserved generic color support.**

  Run: `rg -n "colorOverride|color_override" Auralis-PC/src Auralis-Mobile/src` and confirm block/task usages remain.

- [ ] **Step 3: Run both frontend verification suites from their package roots.**

  Use each package’s existing `test`, `typecheck`, and build scripts; report any pre-existing unrelated failure separately.

- [ ] **Step 4: Review the delegated diff against the current dirty worktree before applying it.**

  Apply only Antigravity’s frontend changes; do not overwrite unrelated user modifications.
