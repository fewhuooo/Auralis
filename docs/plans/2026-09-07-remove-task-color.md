# Task Color Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Task color storage and behavior from the server database, REST/Sync contracts, generated SDKs, PC, Mobile, Tablet, local replicas, UI, tests, and current documentation while preserving KnowledgeBlock color and all non-color Task data.

**Architecture:** Perform one atomic contract cutover built on an append-only V21 Flyway migration. The server and both clients stop producing Task `colorOverride`/`color`; server and device migrations scrub only TASK payload keys while preserving records, cursors, versions, mutations, and non-Task colors. Task presentation becomes CSS-token-driven, while KnowledgeBlock `colorOverride` remains a supported end-to-end capability.

**Tech Stack:** Java 21, Spring Boot 4.1, Flyway, PostgreSQL 17/H2, Jackson 3, TypeScript, Vue 3, Pinia, Tauri SQLite, Uni-app SQLite/H5 storage, OpenAPI.

## Global Constraints

- Read `docs/agent/BeforeCoding.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, affected module documents, and API/Database contracts before editing.
- Work only in the isolated Antigravity worktree based on commit `6d4089e`; never merge, reset, checkout over, or copy the worktree onto the dirty main checkout.
- Do not edit released migration `Auralis-Server/src/main/resources/db/migration/V2__core_domain_schema.sql`; add `V21__remove_task_color.java`.
- Remove Task `colorOverride` and legacy Task `color` only. Preserve KnowledgeBlock `colorOverride`, chart palettes, file-type colors, global Sage tokens, and semantic status colors.
- Preserve Task IDs, ownership, Subject association, title, description, status, duration, scheduling, due date, completion timestamp, sort position, version, timestamps, tombstones, cursors, and pending mutation metadata.
- Migration failures for malformed non-empty server TASK JSON must include the offending row ID and abort; client-side malformed mutation payloads must be retained with a bounded warning.
- Generated schema changes are restricted to TaskCreateRequest, TaskUpdateRequest, and TaskView color fields. Do not include unrelated WebSocket or JsonNode OpenAPI drift.
- Do not delete rows, entire mutations, tables of user data, cursor state, or KnowledgeBlock colors to satisfy residue scans.
- Do not create compatibility getters, null constructor slots, default data colors, or deprecated aliases for Task color.
- Keep code existence, build results, automated-test results, migration results, and manual business acceptance as separate reported states.

---

### Task 1: Establish regression gates and protect the implementation boundary

**Files:**
- Modify: `Auralis-Server/src/test/java/com/auralis/app/OpenApiArtifactTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/TaskColorRemovalMigrationTests.java`
- Modify: `Auralis-PC/scripts/r4-store-mapping.test.mjs`
- Modify: `Auralis-PC/scripts/r4-dashboard-timeline.test.mjs`
- Modify: `Auralis-Mobile/scripts/r4-mobile-protocol.test.mjs`

**Interfaces:**
- Produces: executable assertions that distinguish Task color from KnowledgeBlock color.
- Preserves: existing cognitive-load removal tests and all unrelated test fixtures.

- [ ] **Step 1: Record the isolated baseline**

```powershell
git rev-parse HEAD
git status --short
git grep -n -i -E "colorOverride|color_override|task\.color"
```

Expected: HEAD is `6d4089e`; the Antigravity worktree is clean before edits; results show Task and KnowledgeBlock matches requiring resource-type classification.

- [ ] **Step 2: Add server contract assertions before changing production code**

```java
assertThat(document.at("/components/schemas/TaskView/properties/colorOverride").isMissingNode()).isTrue();
assertThat(document.at("/components/schemas/TaskCreateRequest/properties/colorOverride").isMissingNode()).isTrue();
assertThat(document.at("/components/schemas/TaskUpdateRequest/properties/colorOverride").isMissingNode()).isTrue();
assertThat(document.at("/components/schemas/KnowledgeBlockView/properties/colorOverride").isMissingNode()).isFalse();
```

- [ ] **Step 3: Add PC mapping and UI-source assertions**

```javascript
const mappedTask = mapTaskView({
  id: 'task-1', subjectId: 'subject-1', title: 'Review', status: 'IN_PROGRESS',
  durationMinutes: 45, sortKey: 'a', version: 7, deletedAt: null,
})
assert.equal('colorOverride' in mappedTask, false)
for (const page of [timeline, dashboard, home, scheduleWeek]) {
  assert.doesNotMatch(page, /task\.color\b/)
  assert.doesNotMatch(page, /slot\.task\.color\b/)
}
assert.equal(mapKnowledgeBlockView({ id: 'b', title: 'B', content: '', tags: [], colorOverride: '#abc', version: 1 }).color, '#abc')
```

- [ ] **Step 4: Add Mobile static/protocol assertions**

```javascript
assert.doesNotMatch(taskStore, /\bcolorOverride\b/)
assert.doesNotMatch(taskStore, /\bcolor\??:\s*string/)
assert.doesNotMatch(syncStoreTaskBranch, /colorOverride\s*:/)
for (const page of [mobileHome, mobileTimeline, tabletDashboard, taskSelectSheet]) {
  assert.doesNotMatch(page, /task\.color\b/)
}
```

- [ ] **Step 5: Run the new gates and record the expected red state**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp "-Dtest=TaskColorRemovalMigrationTests,OpenApiArtifactTests" test
cd ..\Auralis-PC
node --experimental-strip-types --test scripts/r4-store-mapping.test.mjs scripts/r4-dashboard-timeline.test.mjs
cd ..\Auralis-Mobile
npm.cmd run test:r4-mobile
```

Expected: assertions fail specifically because Task color still exists; KnowledgeBlock preservation assertions pass.

### Task 2: Remove Task color from the server domain and persistence model

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskCommand.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskDtos.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/internal/persistence/TaskEntity.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainControllerTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainRepositoryTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainSchemaTests.java`

**Interfaces:**
- Produces: Task create/update/view and entity signatures with no color parameter or accessor.
- Preserves: KnowledgeBlock command/view/entity `colorOverride` signatures unchanged.

- [ ] **Step 1: Update focused fixtures to construct color-free Tasks**

Remove the color argument rather than replacing it with `null`. Add controller assertions:

```java
.andExpect(jsonPath("$.colorOverride").doesNotExist());
```

- [ ] **Step 2: Run focused tests to expose production signature mismatches**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp "-Dtest=CoreDomainControllerTests,CoreDomainRepositoryTests,CoreDomainSchemaTests" test
```

Expected: compilation or schema assertions fail because production Task types and the database column still contain color.

- [ ] **Step 3: Remove the field across the Task domain path**

The resulting view boundary must have this field order:

```java
public record TaskView(
        UUID id, UUID subjectId, String title, String description, TaskStatus status,
        Instant scheduledAt, Instant dueAt, int durationMinutes, String sortKey,
        long version, Instant createdAt, Instant updatedAt, Instant deletedAt,
        Instant completedAt) {
}
```

Delete `@Column(name = "color_override")`, the entity field, constructor/update parameters, getter, DTO validation annotations, command component, service arguments, and response mapping component.

- [ ] **Step 4: Verify no Task Java source retains the capability**

```powershell
rg -n "colorOverride|color_override|getColorOverride" Auralis-Server/src/main/java/com/auralis/app/task
```

Expected: no output.

- [ ] **Step 5: Run the focused domain tests**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp "-Dtest=CoreDomainControllerTests,CoreDomainRepositoryTests" test
```

Expected: both classes pass.

### Task 3: Add V21 server migration with strict TASK JSON semantics

**Files:**
- Create: `Auralis-Server/src/main/java/db/migration/V21__remove_task_color.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/TaskColorRemovalMigrationTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainSchemaTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/SyncSchemaTests.java`

**Interfaces:**
- Consumes: V20 schema, `change_log.payload`, `inbound_mutations.current_payload`, and Flyway `Context`.
- Produces: schema without `tasks.color_override`; TASK JSON without `colorOverride` or legacy `color`.

- [ ] **Step 1: Complete clean-schema and V20→V21 upgrade fixtures**

Use a Task payload containing both keys and a non-Task payload containing the same keys:

```java
String taskPayload = "{\"id\":\"" + taskId + "\",\"title\":\"Keep\",\"durationMinutes\":30,\"colorOverride\":\"#112233\",\"color\":\"#445566\",\"resourceType\":\"TASK\"}";
String blockPayload = "{\"id\":\"" + blockId + "\",\"title\":\"Block\",\"colorOverride\":\"#abcdef\",\"color\":\"#fedcba\",\"resourceType\":\"KNOWLEDGE_BLOCK\"}";
```

Assert Task rows, change-log rows, inbound mutation rows, cursor `100`, version `1`, decision `APPLIED`, title, and duration remain; only Task color keys disappear. Assert both non-Task keys remain.

- [ ] **Step 2: Add explicit malformed/non-object failure tests**

Insert separate TASK records with `payload = '{bad'` and `payload = '[]'`. Run Flyway and assert `FlywayException` messages contain both the table name and exact UUID. Blank payload retains the current V20 behavior and is not rewritten.

- [ ] **Step 3: Implement the bounded Java migration**

```java
private boolean removeTaskColor(ObjectNode node) {
    boolean changed = node.has("colorOverride") || node.has("color");
    node.remove("colorOverride");
    node.remove("color");
    return changed;
}
```

Query only `resource_type = 'TASK'`; parse nonblank values as JSON objects; update with `WHERE id = ?`; throw `FlywayException` with the row ID for invalid JSON/non-object input. Run both JSON passes before:

```java
jdbc.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS color_override");
```

- [ ] **Step 4: Run clean, upgrade, preservation, and failure tests**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp "-Dtest=TaskColorRemovalMigrationTests,CoreDomainSchemaTests,SyncSchemaTests" test
```

Expected: all selected tests pass; clean schema lacks the Task column; KnowledgeBlock column remains.

- [ ] **Step 5: Commit the server domain and migration checkpoint**

```powershell
git add Auralis-Server/src/main/java/com/auralis/app/task Auralis-Server/src/main/java/db/migration/V21__remove_task_color.java Auralis-Server/src/test/java/com/auralis/app
git commit -m "refactor(server): remove task color contract"
```

### Task 4: Freeze the HTTP contract and regenerate only Task schema deltas

**Files:**
- Modify: `docs/contracts/openapi/auralis-openapi.json`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/OpenApiArtifactTests.java`
- Generate: `Auralis-PC/src/api/generated/schema.ts`
- Generate: `Auralis-Mobile/src/api/generated/schema.ts`

**Interfaces:**
- Produces: TaskCreateRequest, TaskUpdateRequest, and TaskView schemas without `colorOverride`.
- Preserves: KnowledgeBlock schemas with `colorOverride` and unrelated frozen artifact sections byte-for-byte where generation permits.

- [ ] **Step 1: Run the runtime/artifact comparison after server removal**

```powershell
cd Auralis-Server
.\scripts\check-openapi.ps1
```

Expected: the artifact check identifies Task color drift; record any pre-existing WebSocket/JsonNode drift separately.

- [ ] **Step 2: Regenerate using the repository script**

```powershell
cd Auralis-Server
.\scripts\generate-openapi-sdk.ps1
```

- [ ] **Step 3: Whitelist-review generated changes**

```powershell
git diff -- docs/contracts/openapi/auralis-openapi.json Auralis-PC/src/api/generated/schema.ts Auralis-Mobile/src/api/generated/schema.ts
rg -n "colorOverride" docs/contracts/openapi/auralis-openapi.json Auralis-PC/src/api/generated/schema.ts Auralis-Mobile/src/api/generated/schema.ts
```

Expected: Task schemas lose the property; KnowledgeBlock schemas still contain it. Revert only generator-produced unrelated drift inside the isolated worktree by editing the affected hunks; do not copy an older whole artifact over current work.

- [ ] **Step 4: Run artifact tests**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp "-Dtest=OpenApiArtifactTests" test
```

Expected: Task absence and KnowledgeBlock presence assertions pass.

- [ ] **Step 5: Commit the contract checkpoint**

```powershell
git add docs/contracts/openapi/auralis-openapi.json Auralis-PC/src/api/generated/schema.ts Auralis-Mobile/src/api/generated/schema.ts Auralis-Server/src/test/java/com/auralis/app/OpenApiArtifactTests.java
git commit -m "refactor(api): remove task color fields"
```

### Task 5: Remove PC Task color from mapping, Store, local replicas, and UI

**Files:**
- Modify: `Auralis-PC/src/services/domainMappers.ts`
- Modify: `Auralis-PC/src/store/useTaskStore.ts`
- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Modify: `Auralis-PC/src/services/localDb.ts`
- Modify: `Auralis-PC/src/views/Timeline/index.vue`
- Modify: `Auralis-PC/src/views/Dashboard/index.vue`
- Modify: `Auralis-PC/src/views/Home/index.vue`
- Modify where Task creation is present: `Auralis-PC/src/views/Asset/index.vue`
- Modify where Task creation is present: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Modify: `Auralis-PC/src/components/schedule/ScheduleWeekView.vue`
- Modify: `Auralis-PC/scripts/r4-store-mapping.test.mjs`
- Modify: `Auralis-PC/scripts/r4-local-repository.test.mjs`
- Modify: `Auralis-PC/scripts/r4-dashboard-timeline.test.mjs`
- Modify: `Auralis-PC/scripts/r4-asset-tasks.test.mjs`

**Interfaces:**
- Produces: PC Task models, write inputs, mutation payloads, and presentation Tasks without either color key.
- Produces: a TASK-only payload sanitizer shared by SQLite and browser fallback upgrades.
- Preserves: `mapKnowledgeBlockView(...).color`, block create/update colors, and global visual tokens.

- [ ] **Step 1: Finish failing tests for mapping and local migration invariants**

```ts
export function withoutTaskColor(payload: Record<string, unknown>): Record<string, unknown> {
  const { colorOverride: _override, color: _legacy, ...current } = payload
  return current
}
```

Test this behavior through public schema/repository upgrade paths, not only the helper. Fixtures must prove the migrated Task record and pending/conflict mutation retain IDs, versions, status, baseVersion, remote payload metadata, title, duration, and scheduling. A KnowledgeBlock fixture with both a `colorOverride` and presentation `color` must remain unchanged.

- [ ] **Step 2: Remove Task fields from domain mapping and Store writes**

Delete TaskModel/TaskDtoLike/write-input `colorOverride`, presentation Task `color`, fallback `#7D9372`, `input.color`, and all request payload assignments. Keep KnowledgeBlock declarations at their existing resource boundary.

- [ ] **Step 3: Upgrade canonical PC Task JSON safely**

Apply `withoutTaskColor` only when `resource_type === 'TASK'` to `local_resource_records.payload`, `local_mutations.payload`, and non-null `local_mutations.remote_payload`. The H5/localStorage fallback must execute the same transformation. Failed JSON parsing must preserve the record and surface a scoped warning.

- [ ] **Step 4: Remove legacy Task facade color reads/writes**

Delete `task.color` from SELECT mapping, UPDATE assignment, INSERT columns/values, remote apply, and conversion code in `localDb.ts`. Do not delete or rename KnowledgeBlock `color` columns.

- [ ] **Step 5: Replace every Task-driven style with existing CSS tokens**

Remove bindings such as:

```vue
:style="{ backgroundColor: task.color }"
:style="{ borderLeftColor: slot.task.color }"
:style="{ color: task.color }"
```

Use existing classes and variables such as `var(--color-primary)`, `var(--color-border)`, and semantic completed/past classes. Do not add a fixed color field to component props or Task objects. Preserve drag/drop, past-slot protection, completed schedule placement, and due-date conversion logic.

- [ ] **Step 6: Run PC gates**

```powershell
cd Auralis-PC
npm.cmd run type-check
npm.cmd run check:r4-pc
npm.cmd run test:r4-pc
node --experimental-strip-types --test scripts/r4-store-mapping.test.mjs scripts/r4-local-repository.test.mjs scripts/r4-dashboard-timeline.test.mjs scripts/r4-asset-tasks.test.mjs
```

Expected: commands pass; any overlapping test invocation is reported once in the evidence table.

- [ ] **Step 7: Commit the PC checkpoint**

```powershell
git add Auralis-PC/src Auralis-PC/scripts
git commit -m "refactor(pc): remove task color data flow"
```

### Task 6: Remove Mobile/Tablet Task color and migrate native/H5 data

**Files:**
- Modify: `Auralis-Mobile/src/store/useTaskStore.ts`
- Modify: `Auralis-Mobile/src/store/useSyncStore.ts`
- Modify: `Auralis-Mobile/src/services/localDb.ts`
- Modify: `Auralis-Mobile/src/pages/mobile/home/index.vue`
- Modify: `Auralis-Mobile/src/pages/mobile/timeline/index.vue`
- Modify: `Auralis-Mobile/src/pages/tablet/dashboard/index.vue`
- Modify: `Auralis-Mobile/src/components/TaskSelectSheet.vue`
- Modify: `Auralis-Mobile/scripts/r4-mobile-protocol.test.mjs`
- Modify: `Auralis-Mobile/scripts/check-r4-mobile.mjs`
- Modify or create focused local migration test under: `Auralis-Mobile/scripts/`

**Interfaces:**
- Produces: Mobile Task, add/update inputs, Sync TASK payload mapping, SQLite rows, and H5 records without color.
- Preserves: KnowledgeBlock Sync `colorOverride`, scoped storage isolation, mutation identity, reset generations, and Tablet note boundaries.

- [ ] **Step 1: Add native/H5 fixture assertions before implementation**

The native upgrade fixture must start with a `task_blocks` row containing `color`; after upgrade assert the column is absent and the row retains ID, name, subject, description, duration, status, start time, sync status/version, deletion flag, position, and subject ID. The H5 fixture and TASK mutation fixture must retain all non-color properties while dropping `color` and `colorOverride`. A KnowledgeBlock mutation must retain `colorOverride`.

- [ ] **Step 2: Remove Store and Sync color conversion**

Delete Task interface `color`, add/update input color, fixed `#7D9372` creation defaults, TASK push `colorOverride: task.color`, and TASK pull `color: payload.colorOverride`. Leave the KnowledgeBlock resource branch unchanged.

- [ ] **Step 3: Implement transactional native SQLite table rebuild**

Within the existing schema upgrade transaction:

```sql
CREATE TABLE task_blocks_v_next (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  desc TEXT,
  duration INTEGER NOT NULL,
  status TEXT NOT NULL,
  start_time TEXT,
  sync_status TEXT,
  is_deleted INTEGER,
  sync_version INTEGER,
  position TEXT,
  subject_id TEXT
);
```

Copy using an explicit column list, compare pre/post row counts, drop the old table, and rename the replacement only after the copy succeeds. Adapt exact nullability/default clauses to the existing schema definition without introducing new business fields.

- [ ] **Step 4: Rewrite H5 Task objects and TASK mutation payloads**

Use a resource-gated pure transformation equivalent to:

```ts
function withoutTaskColor<T extends Record<string, unknown>>(payload: T): Omit<T, 'color' | 'colorOverride'> {
  const { color: _color, colorOverride: _override, ...current } = payload
  return current
}
```

Preserve unparseable mutations and issue one bounded warning per migration run.

- [ ] **Step 5: Remove Mobile/Tablet data-driven styles**

Remove Task color borders/bars/check-box bindings from mobile Timeline, tablet Dashboard, TaskSelectSheet, and Home. Use theme/semantic classes; retain completion icon/text treatment and interaction behavior. Remove fixed Task color from every quick-create call.

- [ ] **Step 6: Run Mobile/Tablet gates**

```powershell
cd Auralis-Mobile
npm.cmd run type-check
npm.cmd run check:r4-mobile
npm.cmd run test:r4-mobile
npm.cmd run test:tablet
```

Expected: all commands pass and TASK protocol assertions find neither key.

- [ ] **Step 7: Commit the Mobile checkpoint**

```powershell
git add Auralis-Mobile/src Auralis-Mobile/scripts
git commit -m "refactor(mobile): remove task color data flow"
```

### Task 7: Update authoritative documentation from observed implementation evidence

**Files:**
- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/contracts/ObjectModelMatrix.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/FrontendMobileTablet.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/README.md`

**Interfaces:**
- Produces: current documentation describing V21, the atomic contract cutover, device migrations, retained KnowledgeBlock color, and actual validation state.

- [ ] **Step 1: Update field and migration contracts**

Remove Task `colorOverride` from current API/Database/ObjectModel tables. Document that V21 deletes `tasks.color_override` and scrubs only TASK historical JSON keys. Explicitly retain KnowledgeBlock `colorOverride`.

- [ ] **Step 2: Update module/design behavior**

Document that PC/Mobile/Tablet Task cards derive ordinary appearance from Sage/design tokens, not Task data. Record local SQLite/H5 migration boundaries and preserved mutation metadata.

- [ ] **Step 3: Update status, risks, and release evidence**

Record irreversible loss of old Task color values, synchronized-client deployment requirement, commands actually run, failures that remain, and manual GUI/device checks not executed. Do not claim business acceptance from type-check or unit tests.

- [ ] **Step 4: Register both design and implementation plan in `docs/README.md` without replacing unrelated edits**

```markdown
- [Task 颜色能力全栈移除设计（2026-09-07）](design/2026-09-07-remove-task-color-design.md)
- [Task 颜色能力全栈移除实施计划（2026-09-07）](plans/2026-09-07-remove-task-color.md)
```

- [ ] **Step 5: Commit the documentation checkpoint**

```powershell
git add docs/contracts docs/modules docs/design/Frontend.md docs/current docs/release/Changelog.md docs/README.md
git commit -m "docs: record task color removal"
```

### Task 8: Run cross-stack residue, regression, and patch-integrity gates

**Files:**
- Review: every file changed on the Antigravity branch relative to `6d4089e`

**Interfaces:**
- Produces: a reviewable isolated branch and diff with explicit evidence; does not modify the caller's dirty main worktree.

- [ ] **Step 1: Classify every remaining color match by owning resource**

```powershell
git grep -n -i -E "colorOverride|color_override|task\.color|slot\.task\.color|#7D9372"
```

Expected allowed categories: KnowledgeBlock color, immutable V2 Task column declaration, chart/file/semantic styling, historical design/changelog text. No production Task domain, payload, local row mapping, or Task UI binding may remain. List each retained match category in the final report.

- [ ] **Step 2: Run the focused server gate**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp "-Dtest=TaskColorRemovalMigrationTests,OpenApiArtifactTests,CoreDomainControllerTests,CoreDomainRepositoryTests,CoreDomainSchemaTests,SyncSchemaTests" test
```

Expected: all selected tests pass.

- [ ] **Step 3: Run the full server suite separately**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp test
```

Expected: report exact test/pass/failure/error counts. Pre-existing failures are not converted into passes and are not silently omitted.

- [ ] **Step 4: Re-run complete client gates**

```powershell
cd Auralis-PC
npm.cmd run type-check
npm.cmd run check:r4-pc
npm.cmd run test:r4-pc
cd ..\Auralis-Mobile
npm.cmd run type-check
npm.cmd run check:r4-mobile
npm.cmd run test:r4-mobile
npm.cmd run test:tablet
```

- [ ] **Step 5: Check patch hygiene and scope**

```powershell
cd ..
git diff --check 6d4089e..HEAD
git diff --stat 6d4089e..HEAD
git diff --name-status 6d4089e..HEAD
```

Expected: no whitespace errors, no archive/showcase restoration, no edits to V2, and no files outside the declared implementation/documentation scope without an explicit explanation.

- [ ] **Step 6: Produce the Antigravity handoff report**

Report: branch name, base and final commits, per-task commits, changed files, migration invariants, allowed residue categories, exact command results, known pre-existing failures, and remaining manual checks. Do not merge, cherry-pick, copy files, clean up the worktree, or alter the caller's main checkout.

