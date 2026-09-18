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
- `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceRepository.java`
- `Auralis-Server/src/main/java/com/auralis/app/knowledge/KnowledgeBlockService.java`
- `Auralis-Server/src/main/java/com/auralis/app/knowledge/internal/persistence/KnowledgeBlockRepository.java`
- `Auralis-Server/src/main/java/com/auralis/app/task/TaskService.java`
- `Auralis-Server/src/main/java/com/auralis/app/task/internal/persistence/TaskRepository.java`
- `Auralis-Server/src/test/java/com/auralis/app/SubjectDeletionCascadeTests.java`
- `docs/modules/Backend.md`
- `docs/contracts/API.md`
- `docs/contracts/Database.md`

## Verification

1. `Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SubjectDeletionCascadeTests test` — exit 0; 2 tests, 0 failures, 0 errors, 0 skipped. Covers all child types, owner/Subject isolation, relation tombstones, idempotent repeated event, restore non-cascade, and forced failure rollback.
2. `Auralis-Server\\mvnw.cmd -B -ntp '-Dtest=CoreDomainServiceTests,SourceAssetRelationServiceTests,SyncServiceTests,ArchitectureTests' test` — exit 0; 32 tests, 0 failures, 0 errors, 0 skipped (Architecture 1, CoreDomainService 5, SourceAssetRelationService 15, SyncService 11).
3. `Auralis-Server\\mvnw.cmd -B -ntp clean test-compile` — exit 0; main 279 and test 76 source files compiled successfully.
4. `docker version --format '{{.Server.Version}}'` — exit 0, Docker Server 29.4.2. `Auralis-Server\\mvnw.cmd -B -ntp test` — exit 1 after 282 tests: 281 passed and 1 pre-existing migration assertion failed in `TaskColorRemovalMigrationTests.cleanSchemaValidationRunsFreshDatabaseThroughLatest` (`TaskColorRemovalMigrationTests.java:62` expected Flyway version `21`, actual current version `22`). The full run reached PostgreSQL pgvector, MinIO/Testcontainers, architecture, and the new cascade tests; the failing assertion is unrelated to Task 2A files.

## Commit

`3d9d87f` (`feat(server): cascade subject deletion tombstones`)

## Remaining external limitations

The automated evidence uses H2/Spring Boot/JPA and does not constitute real PostgreSQL, MinIO, Docker/Testcontainers, multi-device convergence, or GUI/business acceptance. No schema or object-retention behavior was exercised against external services in this task.
