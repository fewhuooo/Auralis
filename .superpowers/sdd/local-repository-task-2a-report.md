# Task 2A evidence report

## Root design

Subject deletion remains the public API and transaction boundary. SubjectService publishes the existing `ResourceDeletedEvent`; SourceService, KnowledgeBlockService, and TaskService listen at their module roots, select only active rows matching both `userId` and `subjectId`, soft-delete each entity, flush it through JPA so normal version/update metadata is applied, publish the ordinary `ResourceChangedEvent(..., "DELETE", ...)`, and publish the existing per-resource deletion event. RelationService already listens to those endpoint events and writes per-relation tombstones. Subject deletion now uses normal transaction rollback semantics so any listener or persistence failure rolls back the Subject, children, Relation rows, and change-log writes together.

No API DTO, route, database migration, hard delete, ParsedDocument metadata cleanup, or MinIO retention behavior changed.

## RED evidence

Command:

`Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test`

Before implementation, the new cascade test started successfully but errored with `DomainException: Subject was not found` at the assertion that expected a deleted Subject/child cascade state; the implementation had no Subject deletion child listeners. Exit code 1. This is the expected RED baseline for the newly added acceptance test.

## Changed files

- `Auralis-Server/src/main/java/com/auralis/app/subject/SubjectService.java`
- `Auralis-Server/src/main/java/com/auralis/app/subject/internal/persistence/SubjectRepository.java`
- `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceRepository.java`
- `Auralis-Server/src/main/java/com/auralis/app/knowledge/KnowledgeBlockService.java`
- `Auralis-Server/src/main/java/com/auralis/app/knowledge/internal/persistence/KnowledgeBlockRepository.java`
- `Auralis-Server/src/main/java/com/auralis/app/task/TaskService.java`
- `Auralis-Server/src/main/java/com/auralis/app/task/internal/persistence/TaskRepository.java`
- `Auralis-Server/src/main/java/com/auralis/app/relation/RelationService.java`
- `Auralis-Server/src/test/java/com/auralis/app/SubjectDeletionCascadeTests.java`
- `docs/modules/Backend.md`
- `docs/contracts/API.md`
- `docs/contracts/Database.md`

## Verification

1. `Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test` — historical implementation GREEN was 2 tests, 0 failures, 0 errors, 0 skipped. The review follow-up RED run was 3 tests with 1 deterministic concurrency failure (the child reached `save` while the deletion transaction held the Subject lock); the fixed run is 3 tests, 0 failures, 0 errors, 0 skipped. It covers all child types, owner/Subject isolation, relation tombstones, idempotent repeated event, restore non-cascade, forced failure rollback, tombstone version/timestamp/payload metadata, and late-child serialization.
2. `Auralis-Server\\mvnw.cmd -B -ntp '-Dtest=CoreDomainServiceTests,SourceAssetRelationServiceTests,SyncServiceTests,ArchitectureTests' test` — exit 0; 32 tests, 0 failures, 0 errors, 0 skipped (Architecture 1, CoreDomainService 5, SourceAssetRelationService 15, SyncService 11).
3. `Auralis-Server\\mvnw.cmd -B -ntp clean test-compile` — exit 0; main 279 and test 76 source files compiled successfully.
4. `docker version --format '{{.Server.Version}}'` — exit 0, Docker Server 29.4.2. Final `Auralis-Server\\mvnw.cmd -B -ntp test` — exit 1 after 283 tests: 282 passed and 1 pre-existing migration assertion failed in `TaskColorRemovalMigrationTests.cleanSchemaValidationRunsFreshDatabaseThroughLatest` (`TaskColorRemovalMigrationTests.java:62` expected Flyway version `21`, actual current version `22`). The full run reached PostgreSQL pgvector, MinIO/Testcontainers, architecture, and the new cascade tests; the failing assertion is unrelated to Task 2A files.

## Review follow-up evidence

The review fix uses a module-internal `PESSIMISTIC_WRITE` lock on the owner Subject row. Subject delete/update/restore acquire it, and Source, KnowledgeBlock, Task, and relation endpoint mutations acquire the same lock before validation/persistence. A child mutation that began before deletion now waits for the lock and re-checks the active Subject after the cascade transaction commits; a mutation beginning after deletion sees `RESOURCE_NOT_FOUND`. No API DTO, route, schema, migration, hard delete, ParsedDocument metadata cleanup, or MinIO retention behavior changed.

RED command:

`Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test`

The new `subjectDeleteSerializesConcurrentChildCreateBeforeCascadeScan` test failed before the lock fix: `AtomicBoolean(true)` contradicted the expected `false` at `SubjectDeletionCascadeTests.java:233`, proving the child reached persistence while the deletion transaction held the Subject row lock. Exit code 1.

GREEN command:

`Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test`

Exit code 0; 3 tests, 0 failures, 0 errors, 0 skipped. The regression now observes no child save before deletion, receives `RESOURCE_NOT_FOUND` after the committed delete, and finds no active late Source. The forced rollback test verifies Subject, Source, KnowledgeBlock, Task, both Relation rows, versions, and DELETE change-log entries have no partial tombstones or metadata.

## Second review follow-up evidence

The multi-Subject mutation path now collects every distinct owner Subject before mutation and locks them in canonical UUID order. This covers Source/KnowledgeBlock/Task moves, KnowledgeBlock source ownership validation, task schedule swaps, and relation create/update/restore/delete old and new endpoints. Endpoint helpers first acquire the owner lock and then re-read the child active row, so a child deleted while validation waits cannot be returned as a stale active endpoint.

RED command:

`Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test`

Before the second fix, the added 5-test suite had 2 failures: the reversed-order lock assertion and `relationEndpointRevalidatesChildAfterOwnerLockWait`, which observed the relation create succeed after its Source endpoint was deleted while owner validation was blocked. Exit code 1.

GREEN command:

`Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test`

Exit code 0; 5 tests, 0 failures, 0 errors, 0 skipped. The suite now proves canonical lock order and rejects the stale endpoint with `RESOURCE_NOT_FOUND` without an active relation.

Additional verification:

- `Auralis-Server\\mvnw.cmd -B -ntp '-Dtest=CoreDomainServiceTests,SourceAssetRelationServiceTests,SyncServiceTests,ArchitectureTests' test` — exit 0; 32 tests, 0 failures, 0 errors, 0 skipped.
- `Auralis-Server\\mvnw.cmd -B -ntp clean test-compile` — exit 0; main 279 and test 76 source files compiled successfully.

## Commit

The original implementation commit was `46f2348a8df565c6640f6fcd752742464ada7c91` (`feat(server): cascade subject deletion tombstones`). The review-fix implementation commit is `30fccd4` (`fix(server): serialize subject-owned mutations`). The second-review implementation commit is `7204887f1e1ac6292845ffb320db202e04a911ed` (`fix(server): order subject owner locks canonically`).

## Remaining external limitations

The automated evidence uses H2/Spring Boot/JPA and does not constitute real PostgreSQL, MinIO, Docker/Testcontainers, multi-device convergence, or GUI/business acceptance. No schema or object-retention behavior was exercised against external services in this task.

## Unified database lock protocol audit and follow-up

Before the architectural correction, the scoped paths audited from the current implementation were:

| Path | Current lock order | Protocol status |
| --- | --- | --- |
| Subject delete | Subject row lock → active child discovery/mutation without concrete row locks → Relation listener discovery/mutation | Noncompliant: child/relation resources were not locked after the Subject lock. |
| Task schedule swap | Task row locks → Subject owner locks → mutation | Noncompliant: Resource → Subject reverse order and request-direction risk. |
| Source move | Source discovery → Subject owner locks → unlocked Source re-read/mutation | Noncompliant: concrete Source lock missing after Subject lock. |
| Task move | Task discovery → Subject owner locks → unlocked Task re-read/mutation | Noncompliant: concrete Task lock missing after Subject lock. |
| Relation create/update | endpoint/relation discovery → Subject owner locks → endpoint helpers/relation mutation | Noncompliant: no single coordinator and no concrete endpoint/Relation lock protocol. |
| Resource create/restore | Subject validation/lock → insert or unlocked child restore | Noncompliant for restore resource locking; create had no shared coordinator boundary. |

RED evidence for the correction:

`Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test` initially failed with the new task-swap order assertion because `SubjectRepository.findAllForUpdateByUserIdAndIdInOrderByIdAsc(...)` did not exist. After the first implementation pass, the same suite exposed the H2 lock-query behavior and stale test doubles; the coordinator was tightened to sorted per-row pessimistic locks and the deterministic suite became 6/6 GREEN.

## Final unified-protocol verification

The final implementation uses the thin `SubjectLockCoordinator` as the one owner-lock entry point. It deduplicates and UUID-sorts Subject IDs, locks each owner row with `PESSIMISTIC_WRITE`, validates user ownership and active state, and leaves child-resource behavior to the owning module. Discovery queries for Source, KnowledgeBlock, Task, Relation, and ParsedDocument paths return only owner IDs or unmanaged endpoint snapshots; after the owner locks are held, each path obtains a concrete resource lock and re-reads/revalidates active state, ownership, subject IDs, endpoints, and versions. Subject delete listeners lock active child rows before tombstoning. Relation endpoint cleanup runs under the already-held owner lock and never reacquires Subject locks after a resource lock.

The final scoped path review is therefore:

| Path | Final order | Protocol status |
| --- | --- | --- |
| Subject delete | owner Subject → locked Source/KnowledgeBlock/Task/Relation rows → revalidation/mutation | Compliant |
| Task schedule swap | discover both owners → canonical Subject locks → Task rows in UUID order → revalidation/swap | Compliant |
| Source move | discover old owner + requested new owner → canonical Subject locks → Source row → revalidation/move | Compliant |
| Task move | discover old owner + requested new owner → canonical Subject locks → Task row → revalidation/move | Compliant |
| Relation create/update/restore/delete | discover endpoint/relation owners → canonical Subject locks → Relation and endpoint rows → revalidation/mutation | Compliant |
| Resource create/restore and ParsedDocument completion | Subject owner discovery where needed → canonical Subject lock → concrete resource row → revalidation/mutation | Compliant |

Strict RED→GREEN evidence for this correction is recorded above. The final focused command
`Auralis-Server\\mvnw.cmd -B -ntp '-Dtest=SubjectDeletionCascadeTests,SubjectLockCoordinatorPostgresIntegrationTests' test`
exited 0 with 7 tests, 0 failures, 0 errors, 0 skipped. The H2 cascade/concurrency tests were 6/6; the PostgreSQL 17/Testcontainers integration was 1/1 and demonstrated reversed request order blocking behind canonical UUID row-lock acquisition. `ParsedDocumentCompleteTests` exited 0 with 4/4 after replacing stale managed-entity discovery with a scalar owner-ID projection. `ArchitectureTests` exited 0 with 1/1, and `SourceAssetRelationServiceTests,SourceIngestionSyncEventTests,SyncServiceTests` exited 0 with 27/27. Fresh `Auralis-Server\\mvnw.cmd -B -ntp clean test-compile` exited 0, compiling 281 main and 77 test sources.

The final full Server command `Auralis-Server\\mvnw.cmd -B -ntp test` ran with Docker/Testcontainers available and exited 1 after 287 tests: 286 passed, 1 failed, 0 errors. The sole failure remains the pre-existing `TaskColorRemovalMigrationTests.cleanSchemaValidationRunsFreshDatabaseThroughLatest` assertion at line 62, which expects Flyway version `21` while the repository applies version `22`; all Task 2A cascade, lock, relation, ParsedDocument, PostgreSQL, MinIO, and architecture tests passed in that run. This task did not modify the migration or that test.

Additional implementation files in this correction are `SubjectLockCoordinator.java`, `RelationEndpointSnapshot.java`, and `SubjectLockCoordinatorPostgresIntegrationTests.java`; `ParsedDocumentService.java` now participates in the same owner-lock fence. No API/schema/MinIO behavior was changed.

## Final architecture-review correction

The review regression `relationEndpointValidationDoesNotAcquireSubjectLocksAfterOwnerSetIsHeld` was intentionally run RED against the first unified-protocol commit. It failed in `SubjectDeletionCascadeTests` because Relation create acquired the coordinator three times (owner discovery lock plus endpoint helper reacquisition), violating the hard prohibition on acquiring Subject locks after the owner set/resource lock phase. The failing run was 1 test, 1 failure, exit 1; the full 7-test cascade run consequently reported 1 failure.

The fix adds post-lock expected-owner validation methods for Source, KnowledgeBlock, and Task, and RelationService now retains the discovered endpoint→owner map, locks that complete set once, then only locks/re-reads concrete endpoint rows. Subject endpoints are revalidated without coordinator reacquisition. Source/KnowledgeBlock/Task/ParsedDocument paths also reject a changed `subjectId` after their concrete row lock. The fresh GREEN command `Auralis-Server\\mvnw.cmd -B -ntp '-Dtest=SubjectDeletionCascadeTests' test` exited 0 with 7/7. The fresh combined regression command
`Auralis-Server\\mvnw.cmd -B -ntp '-Dtest=SubjectDeletionCascadeTests,SubjectLockCoordinatorPostgresIntegrationTests,SourceAssetRelationServiceTests,SourceIngestionSyncEventTests,SyncServiceTests,ArchitectureTests,ParsedDocumentCompleteTests' test`
exited 0 with 40/40. Fresh `Auralis-Server\\mvnw.cmd -B -ntp clean test-compile` again exited 0 with 281 main and 77 test sources.

The post-fix full Server command `Auralis-Server\\mvnw.cmd -B -ntp test` exited 1 after 288 tests: 287 passed, 1 failed, 0 errors. The sole failure was `TaskColorRemovalMigrationTests.cleanSchemaValidationRunsFreshDatabaseThroughLatest` at line 62 (`expected: "21"`, `but was: "22"`); this remains outside Task 2A and was not changed. No failed run is presented as passing evidence.

## Final commit

The unified-protocol implementation commit is `761f7b1b59adcef75354de329be205a65c40c5c8` (`fix(server): unify subject owner lock protocol`). The final endpoint-validation correction is `40b5c608d6dc4cf90e735c2154ac6377cf2249de` (`fix(server): avoid subject lock reacquisition after owner fence`). The report evidence is committed separately after the final implementation SHA was known.
