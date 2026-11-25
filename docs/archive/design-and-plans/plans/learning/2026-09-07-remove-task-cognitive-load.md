# Task Cognitive Load Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Task cognitive load from the database, server domain, REST and Sync contracts, generated SDKs, PC, Mobile, Tablet, local replicas, UI, tests, and current documentation without losing tasks or unrelated pending mutations.

**Architecture:** Perform one atomic contract cutover. A new Flyway V20 migration drops the server column and scrubs only Task keys from historical Sync JSON; PC and Mobile migrations similarly strip legacy keys while preserving records and mutation metadata. Domain and UI code then use duration and scheduling without any cognitive-load presentation layer.

**Tech Stack:** Java 21, Spring Boot 4.1, Flyway, PostgreSQL 17/H2, Jackson 3, TypeScript, Vue 3, Pinia, Tauri SQLite, Uni-app SQLite/H5 storage, OpenAPI.

## Global Constraints

- Read `docs/agent/BeforeCoding.md`, current status/issues, all affected module documents, and API/Database contracts before editing.
- Do not edit released migration `V2__core_domain_schema.sql`; add V20.
- Existing cognitive-load values are intentionally unrecoverable after migration.
- Preserve Task identity, title, description, status, duration, schedule, due date, sort key, color override, versions, tombstones, cursors, and pending mutation metadata.
- Do not delete generic program-loading code, system-load terminology, Review difficulty, or KnowledgeBlock fields based only on the word `load`.
- Do not restore archived code or overwrite unrelated uncommitted work.
- Keep code/build/test/business-acceptance states separate.

---

### Task 1: Remove the server domain and persistence field

**Files:**
- Delete: `Auralis-Server/src/main/java/com/auralis/app/task/CognitiveLoad.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskCommand.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskDtos.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/internal/persistence/TaskEntity.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainControllerTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainRepositoryTests.java`

**Interfaces:**
- Produces: Task command/view/response records whose ordered fields omit `CognitiveLoad cognitiveLoad`.
- Preserves: `durationMinutes`, `sortKey`, `colorOverride`, scheduling, completion timestamp, version and tombstone semantics.

- [ ] **Step 1: Change focused tests so Task JSON and constructors omit cognitive load**

```java
assertThat(taskJson).doesNotContain("cognitiveLoad");
```

- [ ] **Step 2: Run focused tests and verify they fail against the old contract**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp -Dtest=CoreDomainControllerTests,CoreDomainRepositoryTests test
```

Expected: compilation or assertions fail because production constructors and JSON still contain cognitive load.

- [ ] **Step 3: Remove the field through command, entity, service, view and DTO mappings, then delete the enum**

```java
public record TaskView(
        UUID id, UUID subjectId, String title, String description, TaskStatus status,
        Instant scheduledAt, Instant dueAt, int durationMinutes, String sortKey,
        String colorOverride, long version, Instant createdAt, Instant updatedAt,
        Instant deletedAt, Instant completedAt) {}
```

- [ ] **Step 4: Re-run focused server tests**

Expected: both test classes pass with no `CognitiveLoad` import or constructor argument.

### Task 2: Add the destructive schema and historical Sync JSON migration

**Files:**
- Create: `Auralis-Server/src/main/java/db/migration/V20__remove_task_cognitive_load.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainSchemaTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/SyncSchemaTests.java`
- Modify or create upgrade coverage following: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentSchemaTests.java`

**Interfaces:**
- Consumes: JDBC connection from Flyway `Context`.
- Produces: schema without `ck_tasks_cognitive_load` or `tasks.cognitive_load`; Task JSON objects without `cognitiveLoad`.

- [ ] **Step 1: Add clean/upgrade tests with legacy rows and Sync payloads**

```json
{"id":"00000000-0000-0000-0000-000000000001","title":"Keep","durationMinutes":30,"cognitiveLoad":"HIGH","sortKey":"a"}
```

Assert after V20 that the Task row and Sync rows remain, `title`, `durationMinutes`, `sortKey`, cursor and version are unchanged, and only `cognitiveLoad` is absent.

- [ ] **Step 2: Run schema tests and verify they fail before V20 exists**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp -Dtest=CoreDomainSchemaTests,SyncSchemaTests test
```

- [ ] **Step 3: Implement V20 as a bounded JDBC migration**

```java
public final class V20__remove_task_cognitive_load extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        // Rewrite only valid TASK JSON objects in change_log.payload and
        // inbound_mutations.current_payload, then drop the constraint and column.
    }
}
```

Use Jackson 3 object-node removal or database-specific JSON expressions selected from metadata. Do not delete Sync rows or renumber cursors.

- [ ] **Step 4: Run clean and upgrade schema tests**

Expected: both H2 PostgreSQL-mode paths pass; PostgreSQL Testcontainers results must be reported separately if Docker is unavailable.

### Task 3: Freeze the new API and regenerate both SDKs

**Files:**
- Modify: `docs/contracts/openapi/auralis-openapi.json`
- Generate: `Auralis-PC/src/api/generated/schema.ts`
- Generate: `Auralis-Mobile/src/api/generated/schema.ts`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/OpenApiArtifactTests.java`

**Interfaces:**
- Produces: Task create/update/view schemas with no `cognitiveLoad` property.

- [ ] **Step 1: Add OpenAPI assertions that all Task schemas omit the property**

```java
assertThat(openApiJson.at("/components/schemas/TaskView/properties/cognitiveLoad").isMissingNode()).isTrue();
```

- [ ] **Step 2: Run the OpenAPI artifact test and confirm the frozen artifact is stale**

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp -Dtest=OpenApiArtifactTests test
```

- [ ] **Step 3: Export the runtime artifact and regenerate clients using the repository script**

```powershell
.\scripts\generate-openapi-sdk.ps1
.\scripts\check-openapi.ps1
```

- [ ] **Step 4: Verify all generated Task schema occurrences are gone**

```powershell
rg -n "cognitiveLoad" docs/contracts/openapi Auralis-PC/src/api/generated Auralis-Mobile/src/api/generated
```

Expected: no output.

### Task 4: Remove PC domain, local-replica and UI support

**Files:**
- Modify: `Auralis-PC/src/services/domainMappers.ts`
- Modify: `Auralis-PC/src/store/useTaskStore.ts`
- Modify: `Auralis-PC/src/services/localSchema.ts`
- Modify legacy facade only where still compiled: `Auralis-PC/src/services/localDb.ts`
- Modify: `Auralis-PC/src/views/Timeline/index.vue`
- Modify: `Auralis-PC/src/views/Dashboard/index.vue`
- Modify: `Auralis-PC/src/views/Home/index.vue`
- Modify: `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- Modify: `Auralis-PC/scripts/r4-store-mapping.test.mjs`
- Modify: `Auralis-PC/scripts/r4-dashboard-timeline.test.mjs`
- Modify: `Auralis-PC/scripts/r4-register-file.test.mjs`

**Interfaces:**
- Produces: Task models and inputs without `cognitiveLoad`, `load`, or `loadText`.
- Produces: pure Task-payload sanitizer used by SQLite and browser fallback upgrades.

- [ ] **Step 1: Add failing mapping, local-upgrade and UI residue assertions**

```javascript
assert.equal('cognitiveLoad' in mappedTask, false)
assert.equal('load' in migratedPayload, false)
assert.equal('loadText' in migratedPayload, false)
assert.equal(migratedPayload.title, 'Keep')
```

- [ ] **Step 2: Run the focused PC suite and record the expected failures**

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-store-mapping.test.mjs scripts/r4-local-repository.test.mjs scripts/r4-dashboard-timeline.test.mjs scripts/r4-asset-tasks.test.mjs
```

- [ ] **Step 3: Remove model/mapping fields and sanitize old local Task JSON**

```ts
export function withoutTaskCognitiveLoad(payload: Record<string, unknown>): Record<string, unknown> {
  const { cognitiveLoad: _cognitiveLoad, load: _load, loadText: _loadText, ...current } = payload
  return current
}
```

Apply the function only to `resourceType === 'TASK'` records and mutation payloads; preserve mutation state and non-Task resources.

- [ ] **Step 4: Remove PC UI labels, form state, defaults, brain icons and dedicated CSS**

Task creation calls must continue to send name/title, subject, description, duration and color fields already owned by the calling screen.

- [ ] **Step 5: Run focused tests, type-check and the PC production guard**

```powershell
cd Auralis-PC
npm.cmd run type-check
npm.cmd run check:r4-pc
node --experimental-strip-types --test scripts/r4-store-mapping.test.mjs scripts/r4-local-repository.test.mjs scripts/r4-dashboard-timeline.test.mjs scripts/r4-asset-tasks.test.mjs
```

### Task 5: Remove Mobile/Tablet domain, local storage and UI support

**Files:**
- Modify: `Auralis-Mobile/src/store/useTaskStore.ts`
- Modify: `Auralis-Mobile/src/store/useSyncStore.ts`
- Modify: `Auralis-Mobile/src/services/localDb.ts`
- Modify: `Auralis-Mobile/src/components/AddTaskSheet.vue`
- Modify: `Auralis-Mobile/src/pages/mobile/timeline/index.vue`
- Modify: `Auralis-Mobile/src/pages/mobile/home/index.vue`
- Modify: `Auralis-Mobile/src/pages/tablet/dashboard/index.vue`
- Modify: `Auralis-Mobile/src/pages/tablet/profile/index.vue`
- Modify: `Auralis-Mobile/scripts/r4-mobile-protocol.test.mjs`

**Interfaces:**
- Produces: Mobile Task and Sync payloads without cognitive-load keys.
- Preserves: scoped H5 data, SQLite task rows, pending local mutations and Tablet feature boundaries.

- [ ] **Step 1: Add failing protocol/local migration tests**

Assert old H5 objects, SQLite task rows and TASK mutation payloads keep `id`, `name/title`, `duration`, `status`, `position/sortKey` and mutation metadata while dropping only the three deprecated keys.

- [ ] **Step 2: Remove Task fields, Sync conversions and every task-load visual/copy branch**

```ts
type Task = {
  id?: string
  name: string
  subject: string
  desc?: string
  color: string
  duration: number
  status: 'pending' | 'scheduled' | 'completed'
  startTime?: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
  position?: string
  sync_version?: number
  is_deleted?: boolean
  subjectId?: string
}
```

- [ ] **Step 3: Rebuild legacy native `task_blocks` without `load` and `loadText`, and rewrite scoped H5 data**

The migration must copy all non-load columns inside a transaction and retain pending mutations after JSON sanitization.

- [ ] **Step 4: Run Mobile tests, type-check and production guard**

```powershell
cd Auralis-Mobile
npm.cmd run test:r4-mobile
npm.cmd run test:tablet
npm.cmd run type-check
npm.cmd run check:r4-mobile
```

### Task 6: Synchronize current documentation and run the cross-stack gate

**Files:**
- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/FrontendMobileTablet.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/README.md`

**Interfaces:**
- Produces: current documentation that records the destructive cutover, unrecoverable values, retained task data, validation evidence and manual-acceptance limits.

- [ ] **Step 1: Update each authority using actual implementation and command evidence**

Remove claims that Task stores or exposes cognitive load. Record V20, synchronized client requirement, local payload sanitization and that duration remains.

- [ ] **Step 2: Run semantic residue searches and classify every result**

```powershell
rg -n -i "cognitiveLoad|cognitive_load|loadText|TaskLoad|load-indicator|低负荷|中负荷|高负荷|🧠" Auralis-Server/src Auralis-PC/src Auralis-PC/scripts Auralis-Mobile/src Auralis-Mobile/scripts docs/contracts/openapi
```

Expected: only immutable historical V2 migration text may retain `cognitive_load`; every other result must be unrelated and documented or removed.

- [ ] **Step 3: Run final checks**

```powershell
git diff --check
cd Auralis-Server
.\mvnw.cmd -B -ntp test
cd ..\Auralis-PC
npm.cmd run test:r4-pc
npm.cmd run type-check
cd ..\Auralis-Mobile
npm.cmd run test:r4-mobile
npm.cmd run test:tablet
npm.cmd run type-check
```

- [ ] **Step 4: Report evidence without conflating acceptance states**

List passed and failed commands, identify pre-existing failures, and keep PC GUI, H5/browser, WeChat Developer Tools and device validation open unless actually executed.
