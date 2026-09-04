# Auralis 后端阶段 3/4 实施计划

**Goal:** 在不覆盖阶段 2B 未提交改动的前提下，实现离线同步、版本化复习、统计读取和用户隔离实时提示，并为每项能力建立可重复的 H2/JPA/MockMvc 自动证据。

**Architecture:** 阶段 3 使用数据库 `change_log` 作为按用户递增的同步事实源，`inbound_mutations` 作为设备 mutation 幂等表；REST 领域服务和 Sync push 通过同一组领域服务/变更记录器写入。同步资源快照采用统一 JSON payload，push 返回每个 mutation 的 APPLIED/CONFLICT/REJECTED 结果，pull 使用不透明的 Base64URL cursor，过期 cursor 返回 resetRequired。阶段 4 使用 `review_parameter_sets`、`review_states`、`review_events` 保存可重现的 FSRS-lite 调度状态和不可变历史；Stats 只从当前用户的 review/task/knowledge 数据聚合；Realtime 使用带过期时间、一次性消费和 userId 绑定的数据库 ticket，业务事件只在进程内发布给同用户订阅者。

**Tech Stack:** Java 21, Spring Boot 4.1, Spring MVC, Spring Data JPA, Flyway, H2 PostgreSQL mode for fast tests, Spring Security JWT, Spring Modulith application modules, MockMvc, JUnit 5, AssertJ.

**Execution status (2026-08-13):** 阶段 3/4 代码、迁移、自动测试和现行文档回写已完成；全量 H2/JPA/MockMvc 验证为 27 个测试类、61 个测试用例全部通过。PostgreSQL/容器、双设备、浏览器 WebSocket、前端联调和人工验收未完成；同步游标并发/高水位及 snapshot 墓碑完整性列为后续 P1 风险。

## Global Constraints

- 不恢复旧 Server 的 `/api/sync`、Redis、旧 WebSocket 或 `Result<T>` 实现。
- 所有资源、change log、mutation、review、stats 和 realtime 查询必须带当前 `userId`；userId 只来自 SecurityContext。
- 所有同步资源继续使用 `version`、`createdAt`、`updatedAt`、`deletedAt`；REST 删除与恢复仍使用精确 `baseVersion`。
- `Asset` 不进入普通 mutation；`Source` 进入同步，Relation 作为同步资源并随端点删除事件产生变更。
- cursor 为不透明字符串；客户端不得解析。游标早于 30 天保留窗口时只返回 `resetRequired=true`，不静默补发或丢弃变更。
- Review 的 `SKIP` 只写不可变事件，不改变 ReviewState；FSRS 参数集不可原地覆盖。
- WebSocket 只传事件提示，业务数据仍由 REST/Snapshot 获取；ticket 不可跨用户、不可重用、不可在过期后使用。
- 阶段门禁分别记录代码实现、构建、自动测试、容器集成、契约和人工验收，不把它们合并成一个“完成”状态。

## 文件边界

阶段 3 允许修改/创建：

- `Auralis-Server/src/main/resources/db/migration/V4__sync_schema.sql`
- `Auralis-Server/src/main/java/com/auralis/app/sync/**`
- `Auralis-Server/src/main/java/com/auralis/app/shared/**` 中为同步所需的最小 cursor、clock 或事件接口
- `Auralis-Server/src/main/java/com/auralis/app/{subject,source,knowledge,task,relation}/**` 中为 REST 统一记录 change log 的最小注入点
- `Auralis-Server/src/test/java/com/auralis/app/Sync*Tests.java`

阶段 4 允许修改/创建：

- `Auralis-Server/src/main/resources/db/migration/V5__review_stats_realtime_schema.sql`
- `Auralis-Server/src/main/java/com/auralis/app/review/**`
- `Auralis-Server/src/main/java/com/auralis/app/stats/**`
- `Auralis-Server/src/main/java/com/auralis/app/realtime/**`
- `Auralis-Server/src/test/java/com/auralis/app/Review*Tests.java`
- `Auralis-Server/src/test/java/com/auralis/app/Stats*Tests.java`
- `Auralis-Server/src/test/java/com/auralis/app/Realtime*Tests.java`

阶段 3/4 文档回写：

- `docs/contracts/API.md`
- `docs/contracts/Database.md`
- `docs/contracts/ObjectModelMatrix.md`
- `docs/modules/Backend.md`
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/release/Changelog.md`
- `docs/plans/backend-greenfield-rewrite-plan.md`

## Task 1: 先锁定 V4 同步 schema 与核心类型

**Files:**

- Create: `Auralis-Server/src/test/java/com/auralis/app/SyncSchemaTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/SyncRepositoryTests.java`
- Create: `Auralis-Server/src/main/resources/db/migration/V4__sync_schema.sql`
- Create: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationType.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncResourceType.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/sync/MutationDecision.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncCursor.java`

**Interfaces:**

- `SyncResourceType` values: `SUBJECT`, `SOURCE`, `KNOWLEDGE_BLOCK`, `TASK`, `RELATION`.
- `SyncMutationType` values: `CREATE`, `UPDATE`, `DELETE`, `RESTORE`.
- `SyncCursor(long value)` validates non-negative values and exposes `encode()`/`decode(String)`; invalid input raises `DomainException(VALIDATION_FAILED, ...)`.
- `MutationDecision` values: `APPLIED`, `CONFLICT`, `REJECTED`.

- [ ] **Step 1: Write failing schema assertions.** Assert Flyway version `4`, tables `change_log` and `inbound_mutations`, required columns, user/device foreign keys, `(user_id, device_id, client_mutation_id)` uniqueness and `change_log.cursor` uniqueness per user.
- [ ] **Step 2: Run `Auralis-Server\\mvnw.cmd -B -ntp -Dtest=SyncSchemaTests test`.** Expected failure: version 4/tables are absent.
- [ ] **Step 3: Add V4 migration.** Create `change_log` with `id UUID`, `user_id`, `cursor BIGINT`, `resource_type`, `resource_id`, `mutation_type`, `version`, `deleted_at`, `payload TEXT`, `created_at`; create `inbound_mutations` with user/device/client mutation identity, request hash, decision, optional change cursor/current payload, error code and timestamps; add retention indexes and checks.
- [ ] **Step 4: Add value types and repository tests.** Prove cursor round-trip, invalid cursor rejection, and owner-scoped repository queries.
- [ ] **Step 5: Run the focused tests again.** Expected: schema/value tests pass; no production service exists yet.

## Task 2: Implement shared change log and mutation persistence

**Files:**

- Create: `sync/internal/persistence/ChangeLogEntity.java`, `ChangeLogRepository.java`
- Create: `sync/internal/persistence/InboundMutationEntity.java`, `InboundMutationRepository.java`
- Create: `sync/ChangeLogEntry.java`, `sync/InboundMutationResult.java`
- Create: `sync/ChangeLogService.java`
- Create: `sync/MutationFingerprint.java`
- Modify: `sync/package-info.java`
- Test: `SyncRepositoryTests.java`, `SyncServiceTests.java`

**Interfaces:**

- `ChangeLogService.record(UUID userId, SyncResourceType resourceType, UUID resourceId, SyncMutationType mutationType, long version, Instant deletedAt, Object payload): ChangeLogEntry` allocates the next user cursor transactionally and stores a JSON DTO payload.
- `ChangeLogService.pull(UUID userId, SyncCursor after, int limit): ChangeLogPage` returns only that user’s rows ordered by cursor, with `nextCursor`, `hasMore` and `resetRequired`.
- `ChangeLogService.snapshotCursor(UUID userId): SyncCursor` returns the highest cursor in the same transaction boundary used by snapshot reads.
- `InboundMutationRepository.findByUserIdAndDeviceIdAndClientMutationId(...)` is the only idempotency lookup; request hash mismatch for the same identity is rejected.

- [ ] **Step 1: Write failing service tests** for monotonic per-user cursors, owner isolation, pull ordering, limit handling, and duplicate mutation fingerprint mismatch.
- [ ] **Step 2: Run focused tests** and confirm failures are missing types/beans, not test setup errors.
- [ ] **Step 3: Implement entities/repositories/service** with a transaction-scoped per-user cursor allocation based on `max(cursor)+1`, retention boundary detection, JSON serialization through the application `ObjectMapper`, and idempotency fingerprint SHA-256 over canonical mutation JSON.
- [ ] **Step 4: Run focused service tests** and then `git diff --check`.

## Task 3: Route direct REST writes through one change-recording path

**Files:**

- Create: `sync/DomainWritePort.java`
- Modify: `SubjectService.java`, `SourceService.java`, `KnowledgeBlockService.java`, `TaskService.java`, `RelationService.java`
- Modify: corresponding entity/view constructors only where payload conversion requires it
- Test: `SyncServiceTests.java`, existing core/source/relation service tests

**Interfaces:**

- `DomainWritePort.apply(UUID userId, SyncMutation mutation): SyncMutationApplied` is the sync-facing command surface; implementations must call the existing domain services rather than repositories.
- `ChangeLogService.record` is invoked after every successful REST create/update/delete/restore and after Relation endpoint cascade writes.
- Existing REST response/status/Problem Details behavior remains unchanged.

- [ ] **Step 1: Add failing assertions** that a Subject/Task/KnowledgeBlock/Source/Relation REST service mutation creates exactly one change log row with the correct resource, mutation type, version and tombstone.
- [ ] **Step 2: Run those tests and record the expected zero-row failure.**
- [ ] **Step 3: Inject `ChangeLogService` and record changes at each successful mutation boundary.** Avoid logging Asset intent/complete because Asset is not a normal sync resource. Keep event cascade logging inside the same transaction.
- [ ] **Step 4: Run all existing phase 2A/2B service tests plus new assertions.**

## Task 4: Implement Sync push, pull and snapshot HTTP contracts

**Files:**

- Create: `sync/SyncCommand.java`, `SyncView.java`, `SyncDtos.java`, `SyncService.java`, `SyncController.java`
- Test: `SyncControllerTests.java`, `SyncServiceTests.java`

**Interfaces:**

- `POST /api/sync/push` request: `{ deviceId, mutations: [{ clientMutationId, resourceType, resourceId, mutationType, baseVersion, payload }] }`.
- Push response: `{ results: [{ clientMutationId, decision, resource, current, cursor, code }], serverCursor }`.
- `GET /api/sync/pull?cursor=<opaque>&limit=<1..200>` response: `{ changes, nextCursor, hasMore, resetRequired }`.
- `GET /api/sync/snapshot` response: `{ snapshotCursor, subjects, sources, knowledgeBlocks, tasks, relations }` with active rows plus tombstones required by the snapshot contract.
- `POST /api/realtime/ticket` is not part of this task.

- [ ] **Step 1: Write failing MockMvc/service tests** for unauthenticated 401, push apply, duplicate replay, same-id/different-hash rejection, stale `baseVersion` conflict with server current DTO, unknown/deleted resource rejection, pull owner isolation/order/limit, cursor expiry reset, and snapshot cursor.
- [ ] **Step 2: Run focused tests and observe missing endpoint/bean failures.**
- [ ] **Step 3: Implement request DTO validation and SyncService.** Validate authenticated `deviceId` belongs to the user and is not revoked; never trust request userId. For `CREATE`, require baseVersion 0; for other operations require exact current version. Save inbound result before returning so replays return the original result without reapplying the command.
- [ ] **Step 4: Implement snapshot aggregation through public service list/read methods** and make snapshot cursor explicit; do not expose JPA entities.
- [ ] **Step 5: Run focused and full backend tests.**

## Task 5: Add V4 cleanup and reset evidence

**Files:**

- Create: `sync/SyncRetentionService.java`
- Modify: `application.yml` or `AuralisProperties.java` only if retention duration needs configuration
- Test: `SyncServiceTests.java`

- [ ] **Step 1: Write tests** for retention cutoff, removal of old change logs/inbound mutations, and `resetRequired=true` for an older cursor.
- [ ] **Step 2: Run red tests.**
- [ ] **Step 3: Implement a transactional cleanup method** with default retention 30 days and no automatic execution in tests; keep the command callable for a later scheduled job.
- [ ] **Step 4: Run tests and document that two-device/container/production evidence remains open.**

## Task 6: Lock V5 Review/Stats/Realtime schema and FSRS value types

**Files:**

- Create: `Auralis-Server/src/test/java/com/auralis/app/ReviewStatsRealtimeSchemaTests.java`
- Create: `Auralis-Server/src/main/resources/db/migration/V5__review_stats_realtime_schema.sql`
- Create: `review/ReviewRating.java`, `ReviewParameterSetView.java`, `ReviewStateView.java`, `ReviewEventView.java`
- Create: `stats/StatsPeriod.java`, `stats/StatsOverviewView.java`, `stats/WeeklyStatsView.java`
- Create: `realtime/RealtimeEventType.java`, `RealtimeEventView.java`

- [ ] **Step 1: Write failing migration tests** for `review_parameter_sets`, `review_states`, `review_events`, `realtime_tickets`, indexes, uniqueness and user foreign keys.
- [ ] **Step 2: Run focused tests and confirm V5 is absent.**
- [ ] **Step 3: Add V5 migration.** Review state belongs one-to-one to a KnowledgeBlock; review events use `(user_id, client_event_id)` uniqueness; tickets hold hash, user/device, expiry, consumed timestamp; enforce rating and non-negative counters/durations with checks.
- [ ] **Step 4: Add enum/value records** with explicit stable codes and no display text.
- [ ] **Step 5: Run focused schema tests.**

## Task 7: Implement deterministic Review/FSRS-lite and review endpoints

**Files:**

- Create: `review/internal/persistence/*.java`
- Create: `review/ReviewService.java`, `review/ReviewController.java`, `review/ReviewDtos.java`
- Test: `ReviewServiceTests.java`, `ReviewControllerTests.java`, `ReviewRepositoryTests.java`

**Interfaces:**

- `GET /api/reviews/due?at=<RFC3339>&limit=<1..200>` returns due KnowledgeBlock review states.
- `POST /api/reviews/events` accepts `{ clientEventId, knowledgeBlockId, rating, reviewedAt, durationSeconds, baseVersion }` and returns `{ event, state }` for non-SKIP; SKIP returns event and unchanged/null state according to the contract.
- `GET /api/reviews/history?knowledgeBlockId=...` returns immutable events ordered by reviewed time/id.
- Default parameter set is versioned and seeded idempotently; scheduling uses a pure function of current state, rating, reviewedAt and parameter version.

- [ ] **Step 1: Write failing pure scheduling tests** for deterministic AGAIN/HARD/GOOD/EASY output, SKIP not changing state, parameter version selection and replayed clientEventId.
- [ ] **Step 2: Run red tests.**
- [ ] **Step 3: Implement deterministic FSRS-lite scheduler** with explicit rounding and `Clock` injection. Keep the algorithm behind a small `ReviewScheduler` interface so later full FSRS replacement does not change the API or persistence boundary.
- [ ] **Step 4: Implement service transaction**: validate user-owned active KnowledgeBlock, exact state baseVersion, insert immutable event, update state only for non-SKIP, and return current state on conflict.
- [ ] **Step 5: Add MockMvc tests** for 401, validation, owner isolation, version conflict, duplicate event replay and history order.
- [ ] **Step 6: Run Review tests plus the full suite.**

## Task 8: Implement user-scoped Stats overview and weekly DTOs

**Files:**

- Create: `stats/internal/StatsQueryRepository.java`
- Create: `stats/StatsService.java`, `stats/StatsController.java`, `stats/StatsDtos.java`
- Test: `StatsServiceTests.java`, `StatsControllerTests.java`

**Interfaces:**

- `GET /api/stats/overview?at=<RFC3339>` returns typed counts for active knowledge blocks, active tasks, due reviews, completed review events and active sources.
- `GET /api/stats/weekly?from=<date>&to=<date>` returns seven-day buckets with reviewed count, study seconds, completed task count and created knowledge count.
- All aggregates include `WHERE user_id = :userId`; stats do not scan or expose other tenants.

- [ ] **Step 1: Write failing repository/service tests** with two users and boundary timestamps.
- [ ] **Step 2: Run red tests.**
- [ ] **Step 3: Implement query repository and typed DTOs** using server UTC and inclusive/exclusive boundaries; no untyped maps or entity serialization.
- [ ] **Step 4: Add controller tests for filters, invalid date ranges and 401.**
- [ ] **Step 5: Run Stats tests plus full suite.**

## Task 9: Implement realtime ticket issuance and user-isolated event bridge

**Files:**

- Create: `realtime/internal/persistence/RealtimeTicketEntity.java`, `RealtimeTicketRepository.java`
- Create: `realtime/RealtimeService.java`, `RealtimeController.java`, `RealtimeDtos.java`, `RealtimeEventPublisher.java`
- Test: `RealtimeServiceTests.java`, `RealtimeControllerTests.java`

**Interfaces:**

- `POST /api/realtime/ticket` accepts `{ deviceId }` and returns `{ ticket, expiresAt, websocketUrl }`; raw ticket is returned once, only its hash is stored.
- `RealtimeService.consume(UUID userId, String rawTicket): RealtimeSubscription` atomically validates expiry/user, marks consumed and returns a user-bound subscription.
- `RealtimeEventPublisher.publish(UUID userId, RealtimeEventView event)` dispatches only to current in-process subscribers; no business payload is required.
- WebSocket handshake endpoint `/ws/events` consumes a ticket from query/header and rejects reuse, expiry, wrong user binding and malformed ticket.

- [ ] **Step 1: Write failing service/controller tests** for ticket expiry, one-time consumption, hash-only storage, device ownership, user isolation and event fan-out.
- [ ] **Step 2: Run red tests.**
- [ ] **Step 3: Implement secure random ticket issuance, SHA-256 hashing, transactional consume and bounded in-memory subscriber registry.**
- [ ] **Step 4: Add WebSocket configuration/handler** with no business mutation; emit only `{ type, resourceType, resourceId, cursor, occurredAt }`.
- [ ] **Step 5: Run Realtime tests and full suite.**

## Task 10: Documentation, plan self-review and final verification

**Files:** all phase 3/4 documentation files listed above.

- [ ] Update API route/status tables and exact request/response/error semantics.
- [ ] Update Database V4/V5 tables, retention invariants, review state/event fields and ticket fields.
- [ ] Update Backend module table, actual classes, test evidence and limits.
- [ ] Update ObjectModelMatrix for Sync/Review/Stats/Realtime ownership and migration status.
- [ ] Update Status, IssuesAndReview and Changelog with separate code/build/test/container/manual evidence; keep Docker/PostgreSQL, true multi-device, WebSocket client and frontend integration risks open unless actually tested.
- [ ] Update the greenfield plan phase status and link this detailed plan from `docs/README.md` only if it is designated current documentation by the repository rules.
- [ ] Self-review this plan and implementation for placeholders, stale “planned” claims, old package names and untracked accidental files.
- [ ] Run `Auralis-Server\\mvnw.cmd -B -ntp clean test`.
- [ ] Run `git diff --check`.
- [ ] Run a read-only `git status --short` and verify all pre-existing phase 2B paths remain present and unoverwritten.

## Verification and handoff boundaries

The automatic tests prove H2/Flyway/JPA/MockMvc/domain behavior only. They do not prove PostgreSQL/pgvector migration compatibility, Docker/MinIO, two real devices, browser WebSocket behavior, frontend contract migration, Tauri, mobile or tablet acceptance. Those remain explicitly open until a later environment-enabled gate produces fresh evidence.
