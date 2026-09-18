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

## Commit

The original implementation commit was `46f2348a8df565c6640f6fcd752742464ada7c91` (`feat(server): cascade subject deletion tombstones`). The review-fix implementation commit is `30fccd4` (`fix(server): serialize subject-owned mutations`).

## Remaining external limitations

The automated evidence uses H2/Spring Boot/JPA and does not constitute real PostgreSQL, MinIO, Docker/Testcontainers, multi-device convergence, or GUI/business acceptance. No schema or object-retention behavior was exercised against external services in this task.
