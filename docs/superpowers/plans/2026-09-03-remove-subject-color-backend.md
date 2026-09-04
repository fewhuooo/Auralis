# Remove Subject Color Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Subject-specific `color` field from the server contract and PostgreSQL schema while preserving all KnowledgeBlock/Task color overrides.

**Architecture:** Keep Subject identity, icon, ordering, versioning, soft-delete, and sync semantics unchanged. Remove the field through Java domain/API mappings and add an append-only Flyway migration from V18 to V19. Regenerate the checked-in OpenAPI artifact and update contracts/tests.

**Tech Stack:** Spring Boot, Jakarta Validation, JPA/Hibernate, PostgreSQL, Flyway, JUnit, checked-in OpenAPI JSON.

## Global Constraints

- Modify only server, migration, OpenAPI/contract documentation, and server tests in this plan.
- Preserve all existing uncommitted worktree changes; do not reset, checkout, or overwrite unrelated files.
- Do not remove or rename KnowledgeBlock/Task `colorOverride` / `color_override`.
- Do not modify files under `docs/archive/` or `docs/showcase/`.
- Existing Subject rows survive V19; only `subjects.color` values are discarded.

---

### Task 1: Add the schema migration test first

**Files:**
- Create: `Auralis-Server/src/main/resources/db/migration/V19__remove_subject_color.sql`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainSchemaTests.java`

- [ ] **Step 1: Add a failing assertion that the migration removes only Subject color.**

  Extend the existing schema test to inspect `information_schema.columns` for `subjects.color`, `knowledge_blocks.color_override`, and `tasks.color_override`. Assert the first is absent after migrations and the latter two remain present.

- [ ] **Step 2: Run the focused schema test and verify it fails because V19 does not exist.**

  Run from `Auralis-Server`: `./mvnw -Dtest=CoreDomainSchemaTests test`.

- [ ] **Step 3: Add the append-only migration.**

```sql
ALTER TABLE subjects DROP COLUMN color;
```

- [ ] **Step 4: Re-run the focused schema test and verify it passes.**

  Run: `./mvnw -Dtest=CoreDomainSchemaTests test`.

### Task 2: Remove Subject color from the Java domain and API

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/subject/SubjectCommand.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/subject/SubjectView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/subject/SubjectDtos.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/subject/SubjectService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/subject/internal/persistence/SubjectEntity.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainControllerTests.java`

- [ ] **Step 1: Update controller tests to omit Subject request/response color.**

  Change JSON fixtures and assertions so create, update, list, restore, conflict, and sync-related Subject payloads contain `name`, `description`, `iconKey`, `sortKey`, and existing common fields only. Add a negative assertion that response JSON does not contain `color`.

- [ ] **Step 2: Run the focused controller tests and verify compile failures identify every server mapping still requiring color.**

  Run: `./mvnw -Dtest=CoreDomainControllerTests test`.

- [ ] **Step 3: Remove the `color` component from SubjectCommand, SubjectView, SubjectDtos request/response records.**

  Keep `@Size` on `description`, `iconKey`, and `sortKey`; remove only the Subject `color` annotation/component and its `Response.from` argument.

- [ ] **Step 4: Remove the SubjectEntity field, column annotation, constructor parameter, getter, update parameter, and assignments.**

  Preserve all other columns and lifecycle behavior.

- [ ] **Step 5: Update SubjectService construction, update, and `view()` mapping to use the reduced signatures.**

- [ ] **Step 6: Re-run the focused controller tests and verify they pass.**

  Run: `./mvnw -Dtest=CoreDomainControllerTests test`.

### Task 3: Regenerate and document the contract

**Files:**
- Modify: `docs/contracts/openapi/auralis-openapi.json`
- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

- [ ] **Step 1: Update API and database contract text.**

  Remove Subject `color` from request/response field lists, document V19 as the schema transition, and explicitly state that KnowledgeBlock/Task `colorOverride` remains supported.

- [ ] **Step 2: Regenerate the checked-in OpenAPI artifact using the repository’s existing server artifact workflow.**

  Run the existing OpenAPI artifact test/generator command documented by the build; do not hand-edit generated content unless the repository workflow requires it.

- [ ] **Step 3: Run the OpenAPI artifact test and verify no Subject schema or operation contains `color`.**

  Run: `./mvnw -Dtest=OpenApiArtifactTests test`.

- [ ] **Step 4: Record the breaking contract/data note in current status, risks, backend module notes, and changelog.**

### Task 4: Verify preservation boundaries

**Files:**
- No new files.

- [ ] **Step 1: Search server, migration, OpenAPI, and contract files for Subject color references.**

  Run: `rg -n -i "subject.*color|color.*subject|subjects.*color|subjectColor|subj-theme-color" Auralis-Server docs/contracts docs/modules docs/current docs/release`.

- [ ] **Step 2: Search for preserved generic color fields.**

  Run: `rg -n "color_override|colorOverride" Auralis-Server/src/main docs/contracts/openapi/auralis-openapi.json` and confirm KnowledgeBlock/Task matches remain.

- [ ] **Step 3: Run the server test suite relevant to the changed contract and migration.**

  Run: `./mvnw -Dtest=CoreDomainSchemaTests,CoreDomainControllerTests,OpenApiArtifactTests test`.

- [ ] **Step 4: Review `git diff` and `git status --short` to confirm no unrelated user changes were altered.**
