# Source Permanent Delete and Single-PC Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Source 生命周期收敛为 Server 权威的永久物理删除，并在同一账号上实现一个活动 PC、last-login-wins 的会话与本地暂停语义。

**Architecture:** Server 先以数据库事务完成 owner-scoped Source hard delete、关联数据处理和活动 PC lease fencing，再用 after-commit cleanup 删除最后引用的对象。PC 通过 `removeLocalSource` 和非阻塞 Source manifest reconciliation 清理本地派生数据，但在网络失败、未确认删除或 `DEVICE_SESSION_REPLACED` 时保留本地文件与 outbox。所有 access、refresh、Realtime、sync 和 worker commit 都复用同一活动 PC lease/Source revision fence。

**Tech Stack:** Java 21、Spring Boot 4.1、Spring Data JPA、Flyway、PostgreSQL、Spring WebSocket、JUnit 5/AssertJ/MockMvc；Vue 3、Pinia、TypeScript 6、Axios、Node `--experimental-strip-types` tests、Tauri SQLite/local Asset services。

## Global Constraints

- 只依据当前实现和现行文档；禁止从 `docs/archive/` 或 `docs/showcase/` 恢复旧接口、旧路由或旧 schema。
- Source DELETE 的 Server 语义是永久物理删除；不提供 Restore，不建立长期 Source tombstone；Server Source existence 是唯一权威。
- 单账号只允许一个活动 PC 设备；PC 登录采用 last-login-wins；被替换 PC 的 access/refresh/Realtime/后台同步资格失效，但本地数据库、文件、outbox 和未同步 mutation 原样保留。
- `DEVICE_SESSION_REPLACED` 必须与 `UNAUTHENTICATED`、普通 offline/transport failure 分离；替换态暂停网络资格但不得清理本地数据。
- KnowledgeBlock 保留并将 `source_id` 置 NULL；Source 相关 Relation 物理删除；Reading Conversation 随 Source cascade；普通 Conversation 和消息正文保留。
- Asset 只有最后一个活动 Source 引用消失后才允许对象存储 cleanup；对象删除必须在数据库事务 after-commit 执行，失败可重试且不回滚 Source 删除。
- 所有 worker 必须在最终写入边界重新检查 owner、Source existence、ingestion revision、job 状态和活动 lease。
- 旧 PC 的本地 Source 清理只允许在 Server DELETE 成功或成功 Source manifest 明确缺失后执行；网络失败、超时、版本冲突和会话替换不得触发不可逆本地清理。
- 每个任务先写失败测试，再运行确认失败，再写最小实现，再运行通过；不要把编译、自动测试和真实 Server/PC 验收合并成一个状态。
- 执行阶段可以提交小步 commit；本计划创建阶段只写计划和 README，不执行代码、迁移或 commit。

---

## File map

| 文件 | 责任 |
| --- | --- |
| `Auralis-Server/src/main/resources/db/migration/V23__account_pc_lease_and_realtime_fencing.sql` | 活动 PC lease、generation、Realtime ticket 绑定字段 |
| `Auralis-Server/src/main/resources/db/migration/V24__source_hard_delete_constraints.sql` | KnowledgeBlock `ON DELETE SET NULL` 与 hard-delete 所需索引/约束 |
| `Auralis-Server/src/main/resources/db/migration/V25__assistant_source_title_snapshot.sql` | Assistant message 来源标题快照 |
| `Auralis-Server/src/main/resources/db/migration/V26__remove_source_restore_fields.sql` | 完成客户端收口后移除 Source `deleted_at` 和 restore 依赖 |
| `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/AccountPcLeaseEntity.java` | 每个用户唯一活动 PC lease 的 JPA 映射 |
| `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/AccountPcLeaseRepository.java` | lease 行锁与当前 lease 查询 |
| `Auralis-Server/src/main/java/com/auralis/app/identity/IdentityService.java` | login/register/refresh 的 lease 获取与替换 |
| `Auralis-Server/src/main/java/com/auralis/app/identity/AuthResult.java` | 返回 `pcLeaseGeneration` 给 access token/PC |
| `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/TokenService.java` | JWT `pcLeaseGeneration` claim |
| `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/JwtAuthenticationFilter.java` | access token 活动 lease fence |
| `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/SecurityProblemSupport.java` | 401 `DEVICE_SESSION_REPLACED` problem response |
| `Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiErrorCode.java` | 新增公开错误码 |
| `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java` | `hardDelete`、manifest、关联对象清理和 owner/version fence |
| `Auralis-Server/src/main/java/com/auralis/app/source/SourceController.java` | DELETE、manifest、Restore route 收口 |
| `Auralis-Server/src/main/java/com/auralis/app/source/SourceDtos.java` | manifest DTO 与删除响应契约 |
| `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceRepository.java` | Source 行锁、活动 manifest、删除查询 |
| `Auralis-Server/src/main/java/com/auralis/app/source/AssetService.java` | Asset 引用计数与 after-commit cleanup 入队 |
| `Auralis-Server/src/main/java/com/auralis/app/source/AssetRetentionCleanupService.java` | 最后引用对象删除、`ORPHANED` 状态和重试 |
| `Auralis-Server/src/main/java/com/auralis/app/relation/RelationService.java` | Source 相关 Relation 物理删除与同步事件 |
| `Auralis-Server/src/main/java/com/auralis/app/knowledge/KnowledgeBlockService.java` | Source 删除时解除 KnowledgeBlock 关联 |
| `Auralis-Server/src/main/java/com/auralis/app/ai/ConversationService.java` | Reading Conversation 的 Source cascade 边界 |
| `Auralis-Server/src/main/java/com/auralis/app/ai/MessageView.java`、`MessageEntity.java`、`AiStreamingService.java` | Assistant `sourceTitles` 快照 |
| `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/IngestionWorker.java` | ingestion 最终 commit fence |
| `Auralis-Server/src/main/java/com/auralis/app/source/SourceCommitFence.java` | Source 派生写入的统一 owner/revision/existence fence |
| `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentService.java` | parsed-document complete/indexing fence |
| `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/RetrievalService.java` | fallback TopK 前 Source 过滤 |
| `Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeService.java`、`RealtimeWebSocketHandler.java`、`RealtimeEventPublisher.java` | ticket lease fence 和替换旧连接 |
| `Auralis-Server/src/main/java/com/auralis/app/sync/SyncService.java`、`SyncMutationProcessor.java` | sync pull/push/mutation lease fence与 DELETE 收敛 |
| `Auralis-PC/src/auth/authSessionState.ts`、`store/useAuthStore.ts`、`api/request.ts` | replaced 与 reauthentication 分离 |
| `Auralis-PC/src/services/realtimeController.ts`、`store/useSyncStore.ts` | 4003/替换错误停止 reconnect 和后台 sync |
| `Auralis-PC/src/store/useSourceStore.ts`、`services/localRepository.ts`、`services/localAssetRepository.ts` | `removeLocalSource`、manifest 清理和最后引用 |
| `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`、`overviewGenerationService.ts`、`documentProcessing/runtime.ts` | 删除/会话替换时 worker 停止与 late-result fence |
| `Auralis-PC/src/api/useSourceApi.ts`、`api/realtime.ts` | manifest 与错误 DTO |
| `Auralis-Server/src/test/java/com/auralis/app/*.java` | Server migration/domain/controller/race 回归 |
| `Auralis-PC/scripts/r4-source-processing-schedule.test.mjs`、`r4-overview-generation.test.mjs`、`r4-sync.test.mjs`、`r4-auth-session.test.mjs` | PC 删除、worker、同步、会话回归 |
| `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/modules/Backend.md`、`docs/modules/FrontendPC.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/release/Changelog.md` | 实施后权威文档回写 |

## Task 1: 建立活动 PC lease 数据模型和错误契约

**Files:**
- Create: `Auralis-Server/src/main/resources/db/migration/V23__account_pc_lease_and_realtime_fencing.sql`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/AccountPcLeaseEntity.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/AccountPcLeaseRepository.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiErrorCode.java:3-22`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/RefreshSessionEntity.java:16-147`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/realtime/internal/persistence/RealtimeTicketEntity.java:13-48`
- Test: `Auralis-Server/src/test/java/com/auralis/app/IdentitySchemaTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/IdentityServiceTests.java`

**Interfaces:**
- Produces `AccountPcLeaseRepository.findByUserIdForUpdate(UUID userId): Optional<AccountPcLeaseEntity>` and `AccountPcLeaseEntity(userId, deviceId, sessionId, generation, updatedAt)`.
- Produces `ApiErrorCode.DEVICE_SESSION_REPLACED`.
- Produces `RealtimeTicketEntity.sessionId` and `RealtimeTicketEntity.pcLeaseGeneration` fields used by Task 2.

- [ ] **Step 1: Write the failing migration/schema test**

Add a test assertion to `IdentitySchemaTests` that runs Flyway against H2 and verifies `account_pc_leases` has one row per `user_id`, `generation BIGINT NOT NULL`, foreign keys to `users`, `devices`, and `refresh_sessions`, plus `realtime_tickets.session_id` and `realtime_tickets.pc_lease_generation`.

```java
assertThat(jdbcTemplate.queryForObject(
        "select count(*) from information_schema.columns "
                + "where table_name = 'ACCOUNT_PC_LEASES' and column_name = 'GENERATION'",
        Integer.class)).isEqualTo(1);
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run from `Auralis-Server`:

```powershell
.\\mvnw.cmd -B -ntp -Dtest=IdentitySchemaTests test
```

Expected: `FAIL` because `ACCOUNT_PC_LEASES` and the two ticket columns do not exist.

- [ ] **Step 3: Write the migration and JPA mappings**

Create `V23__account_pc_lease_and_realtime_fencing.sql` with a `user_id` primary key, `device_id`, `session_id`, `generation BIGINT NOT NULL DEFAULT 0`, `updated_at`, and foreign keys to User/Device/RefreshSession. Add nullable ticket columns with an index on `(user_id, session_id, expires_at)`. Add entity fields and a pessimistic-lock repository query; do not remove existing device/session audit rows.

```sql
CREATE TABLE account_pc_leases (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices (id) ON DELETE RESTRICT,
    session_id UUID NOT NULL REFERENCES refresh_sessions (id) ON DELETE RESTRICT,
    generation BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_account_pc_leases_generation CHECK (generation >= 0)
);

ALTER TABLE realtime_tickets ADD COLUMN session_id UUID;
ALTER TABLE realtime_tickets ADD COLUMN pc_lease_generation BIGINT;
CREATE INDEX ix_realtime_tickets_lease ON realtime_tickets (user_id, session_id, expires_at);
```

- [ ] **Step 4: Run the schema and identity tests**

Run:

```powershell
.\\mvnw.cmd -B -ntp -Dtest=IdentitySchemaTests,IdentityServiceTests test
```

Expected: Maven reports `Failures: 0, Errors: 0` for `IdentitySchemaTests` and `IdentityServiceTests`, followed by `BUILD SUCCESS`.

- [ ] **Step 5: Commit the isolated data-model change**

```powershell
git add Auralis-Server/src/main/resources/db/migration/V23__account_pc_lease_and_realtime_fencing.sql Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/AccountPcLeaseEntity.java Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/AccountPcLeaseRepository.java Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiErrorCode.java Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/RefreshSessionEntity.java Auralis-Server/src/main/java/com/auralis/app/realtime/internal/persistence/RealtimeTicketEntity.java Auralis-Server/src/test/java/com/auralis/app/IdentitySchemaTests.java Auralis-Server/src/test/java/com/auralis/app/IdentityServiceTests.java
git commit -m "feat: add account pc lease schema"
```

## Task 2: 实现 last-login-wins、access/refresh fencing 和 Realtime 替换

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/identity/IdentityService.java:54-216`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/identity/AuthResult.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/TokenService.java:29-50`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/JwtAuthenticationFilter.java:15-40`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/SecurityProblemSupport.java:19-61`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/identity/IdentityExceptionHandler.java:22-61`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeService.java:34-77`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeWebSocketHandshakeInterceptor.java:21-33`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeWebSocketHandler.java:21-83`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeEventPublisher.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/security/AuthenticatedUser.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/IdentityServiceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AuthControllerTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/RealtimeServiceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/RealtimeWebSocketIntegrationTests.java`

**Interfaces:**
- Produces `IdentityService.acquireActivePcLease(UUID userId, DeviceCommand device): AuthResult` and `IdentityService.requireCurrentPcLease(UUID userId, UUID sessionId, UUID deviceId, long generation): void`.
- `TokenService.issueAccessToken` accepts `long pcLeaseGeneration` and writes claim `pcLeaseGeneration`.
- `RealtimeService.issue` and `consume` carry `sessionId` and generation; old lease throws `IdentityException("DEVICE_SESSION_REPLACED", ...)`.
- WebSocket replacement closes old sessions with close code `4003`; PC will consume this in Task 6.

- [ ] **Step 1: Write failing last-login-wins tests**

Add tests that register/login as PC A, login as PC B, then assert A's access request and refresh request return `DEVICE_SESSION_REPLACED`, B remains valid, and a second login from A invalidates B.

```java
AuthResult first = identityService.login("lease-user", "password", pc("pc-a", DevicePlatform.WINDOWS));
AuthResult second = identityService.login("lease-user", "password", pc("pc-b", DevicePlatform.WINDOWS));

assertThatThrownBy(() -> identityService.requireCurrentPcLease(
        first.user().id(), first.sessionId(), first.serverDeviceId(), first.pcLeaseGeneration()))
        .extracting("code").isEqualTo("DEVICE_SESSION_REPLACED");
assertThat(identityService.refresh(second.tokens().refreshToken()).sessionId()).isEqualTo(second.sessionId());
```

- [ ] **Step 2: Run the new identity tests and verify failure**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=IdentityServiceTests,AuthControllerTests test
```

Expected: `FAIL` because the result does not expose a generation and the old session is still accepted.

- [ ] **Step 3: Implement the atomic lease acquisition and server fences**

Lock the User row, revoke prior PC device/session, increment generation, create the new refresh session, save the lease, and issue tokens only after the lease row is current. Add the access claim check after JWT parsing and map lease mismatch to 401 `DEVICE_SESSION_REPLACED`; keep account-disabled/unknown-session failures as `UNAUTHENTICATED`. Refresh must compare the locked session with the lease before rotating.

```java
@Transactional
public AuthResult acquireActivePcLease(UUID userId, DeviceCommand device) {
    userRepository.findByIdForUpdate(userId).orElseThrow(this::unauthenticated);
    AccountPcLeaseEntity old = leaseRepository.findByUserIdForUpdate(userId).orElse(null);
    long generation = old == null ? 0 : old.getGeneration() + 1;
    revokeOldPcLease(old);
    DeviceEntity currentDevice = findOrCreateDevice(userId, device);
    RefreshSessionEntity currentSession = createSession(userId, currentDevice.getId());
    leaseRepository.save(new AccountPcLeaseEntity(userId, currentDevice.getId(), currentSession.getId(), generation));
    return issueResult(userId, currentDevice, currentSession, generation);
}
```

`requireCurrentPcLease` must compare all four values, not only `device_id`, so same-device re-login also invalidates the earlier token.

- [ ] **Step 4: Implement Realtime ticket and established-socket fencing**

Persist ticket session/generation, check the lease at issue, consume, and handshake, and make the publisher retain `userId + deviceId + sessionId`. On lease replacement, close matching old sockets with 4003 and do not reconnect them from the server.

```java
if (!leaseService.matches(ticket.getUserId(), ticket.getServerDeviceId(), ticket.getSessionId(), ticket.getPcLeaseGeneration())) {
    throw new IdentityException("DEVICE_SESSION_REPLACED", "This PC session was replaced by another login");
}
```

- [ ] **Step 5: Run identity and Realtime tests**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=IdentityServiceTests,AuthControllerTests,RealtimeServiceTests,RealtimeWebSocketIntegrationTests test
```

Expected: all selected tests pass; assertions include `401`, problem `code=DEVICE_SESSION_REPLACED`, and WebSocket close `4003`.

- [ ] **Step 6: Commit the session fence**

```powershell
git add Auralis-Server/src/main/java/com/auralis/app/identity Auralis-Server/src/main/java/com/auralis/app/realtime Auralis-Server/src/main/java/com/auralis/app/shared/security/AuthenticatedUser.java Auralis-Server/src/test/java/com/auralis/app/IdentityServiceTests.java Auralis-Server/src/test/java/com/auralis/app/AuthControllerTests.java Auralis-Server/src/test/java/com/auralis/app/RealtimeServiceTests.java Auralis-Server/src/test/java/com/auralis/app/RealtimeWebSocketIntegrationTests.java
git commit -m "feat: fence replaced pc sessions"
```

## Task 3: 将 Source DELETE 改为物理删除并增加 manifest

**Files:**
- Create: `Auralis-Server/src/main/resources/db/migration/V24__source_hard_delete_constraints.sql`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java:180-240,365-440`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceController.java:70-100`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceDtos.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceRepository.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/knowledge/KnowledgeBlockService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/relation/RelationService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ConversationService.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationServiceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationControllerTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/SourceHardDeleteTests.java`

**Interfaces:**
- `SourceService.hardDelete(UUID userId, UUID sourceId, long baseVersion): void` is idempotent when Source is already absent and returns `RESOURCE_VERSION_CONFLICT` for a live mismatched version.
- `GET /api/sources/manifest` returns `{ "items": [{ "id": "UUID", "revision": "UUID" }] }` for the authenticated owner.
- DELETE emits one `SOURCE DELETE` change-log event, deletes Source in the same transaction, and does not expose a restore operation.

- [ ] **Step 1: Write failing hard-delete tests**

Create `SourceHardDeleteTests` covering Source row, chunks, ingestion jobs, parsed-document metadata, source Relation, Reading Conversation/messages, KnowledgeBlock source unlink, ordinary Conversation retention, repeated DELETE idempotence, and manifest absence.

```java
sourceService.hardDelete(ownerId, sourceId, source.version());
assertThat(sourceRepository.findById(sourceId)).isEmpty();
assertThat(knowledgeBlockRepository.findBySourceId(sourceId)).isEmpty();
assertThat(knowledgeBlockRepository.findById(blockId).orElseThrow().getSourceId()).isNull();
assertThat(conversationRepository.findById(readingConversationId)).isEmpty();
assertThat(conversationRepository.findById(generalConversationId)).isPresent();
```

- [ ] **Step 2: Run the hard-delete tests and verify failure**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=SourceHardDeleteTests,SourceAssetRelationServiceTests,SourceAssetRelationControllerTests test
```

Expected: `FAIL` because `SourceService.delete` only sets `deletedAt` and `restore` remains available.

- [ ] **Step 3: Apply the FK migration and implement the transaction**

In `V24`, replace `fk_knowledge_blocks_source` with `ON DELETE SET NULL`. In `hardDelete`, lock Source and Asset in the documented order, unlink KnowledgeBlocks, delete Source Relations, let FK cascades remove chunks/jobs/parsed documents/Reading Conversation, record one DELETE change-log event, then call `sourceRepository.delete(source)` and flush. Do not call object storage inside the transaction. Add `GET /api/sources/manifest` with an owner-scoped active Source query ordered by `id`.

```java
@Transactional
public void hardDelete(UUID userId, UUID sourceId, long baseVersion) {
    SourceEntity source = sourceRepository.findByIdAndUserIdForUpdate(sourceId, userId).orElse(null);
    if (source == null) return;
    if (source.getVersion() != baseVersion) throw versionConflict();
    assetService.lockAndPlanAfterSourceDelete(userId, source.getAssetId(), sourceId);
    knowledgeBlockService.detachSource(userId, sourceId);
    relationService.hardDeleteEdgesForSource(userId, sourceId);
    changeLogService.recordDeleted(userId, ResourceType.SOURCE, sourceId, source.getVersion() + 1);
    sourceRepository.delete(source);
    sourceRepository.flush();
}
```

Return `404 RESOURCE_NOT_FOUND` only for non-owner access; repeated owner DELETE is a successful no-op at the mutation boundary.

- [ ] **Step 4: Remove the product Restore entry point**

Change `SourceController` so the DELETE route calls `hardDelete`; remove the public Restore mapping and make an old RESTORE sync mutation return `MUTATION_REJECTED` without recreating Source. Keep compatibility code only until Task 8 contract cutover and record that boundary in the API plan.

- [ ] **Step 5: Run service/controller and migration tests**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=SourceHardDeleteTests,SourceAssetRelationServiceTests,SourceAssetRelationControllerTests,SourceAssetRelationSchemaTests,SyncServiceTests test
```

Expected: all selected tests pass; no test asserts Source restoration or a visible deleted Source after hard delete.

- [ ] **Step 6: Commit the Source transaction**

```powershell
git add Auralis-Server/src/main/resources/db/migration/V24__source_hard_delete_constraints.sql Auralis-Server/src/main/java/com/auralis/app/source Auralis-Server/src/main/java/com/auralis/app/knowledge Auralis-Server/src/main/java/com/auralis/app/relation Auralis-Server/src/main/java/com/auralis/app/ai/ConversationService.java Auralis-Server/src/test/java/com/auralis/app/SourceHardDeleteTests.java Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationServiceTests.java Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationControllerTests.java Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationSchemaTests.java
git commit -m "feat: hard delete sources"
```

## Task 4: Fence Server ingestion, ParsedDocument, Overview, Retrieval and Sync

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/IngestionWorker.java:80-180`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/IngestionJobService.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/SourceCommitFence.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiOverviewService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/RetrievalService.java:90-120`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationProcessor.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiIngestionWorkerTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentCompleteTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiRetrievalTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/SyncServiceTests.java`

**Interfaces:**
- Add one shared server-side predicate `SourceCommitFence.require(UUID userId, UUID sourceId, UUID ingestionRevision, UUID jobId)` returning the locked active Source or throwing `INGESTION_REVISION_STALE`/`RESOURCE_NOT_FOUND`.
- Add `IdentityService.requireCurrentPcLease(AuthenticatedUser principal)` to every sync/mutation endpoint before applying a write.

- [ ] **Step 1: Write failing race tests**

Add a worker test that pauses parser completion, deletes Source, then resumes and verifies no chunk, READY state, ParsedDocument index, Overview cache, or Source reappearance. Add a retrieval fallback test where a deleted candidate has higher similarity than the active candidate and must not consume a TopK slot.

```java
when(sourceService.requireActiveSource(userId, sourceId)).thenThrow(new DomainException("RESOURCE_NOT_FOUND", "Source not found"));
worker.run(job);
verify(chunkService, never()).replace(any(), eq(sourceId), any(), anyList(), anyList());
```

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=AiIngestionWorkerTests,ParsedDocumentCompleteTests,AiOverviewServiceTests,AiRetrievalTests,SyncServiceTests test
```

Expected: at least one race test fails because the current worker can write after the initial Source read and fallback filters after ranking.

- [ ] **Step 3: Add the final transaction fences**

Re-read and lock Source immediately before chunk generation replacement, active generation switch, Source READY, ParsedDocument complete/indexing, Overview cache save, and sync mutation commit. In fallback retrieval filter `owner + active Source existence` before similarity sort and limit.

```java
List<ChunkCandidate> usable = candidates.stream()
        .filter(candidate -> sourceService.existsActiveOwned(userId, candidate.sourceId()))
        .sorted(Comparator.comparing(ChunkCandidate::score).reversed())
        .limit(limit)
        .toList();
```

- [ ] **Step 4: Fence sync and old RESTORE mutations**

Reject old PC sync push/pull and mutation processing when `IdentityService.requireCurrentPcLease` fails with `DEVICE_SESSION_REPLACED`; process Source DELETE idempotently and never apply Source RESTORE.

- [ ] **Step 5: Run focused and fresh compile gates**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=AiIngestionWorkerTests,ParsedDocumentCompleteTests,AiOverviewServiceTests,AiRetrievalTests,SyncServiceTests test
.\\mvnw.cmd -B -ntp clean test-compile
```

Expected: selected tests pass and `BUILD SUCCESS` appears for test compilation.

- [ ] **Step 6: Commit the server fences**

```powershell
git add Auralis-Server/src/main/java/com/auralis/app/ai/ingestion Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentService.java Auralis-Server/src/main/java/com/auralis/app/ai/AiOverviewService.java Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/ Auralis-Server/src/main/java/com/auralis/app/sync Auralis-Server/src/test/java/com/auralis/app/AiIngestionWorkerTests.java Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentCompleteTests.java Auralis-Server/src/test/java/com/auralis/app/AiOverviewServiceTests.java Auralis-Server/src/test/java/com/auralis/app/AiRetrievalTests.java Auralis-Server/src/test/java/com/auralis/app/SyncServiceTests.java
git commit -m "fix: fence source derived writes"
```

## Task 5: Implement last-reference Asset cleanup after commit

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/AssetService.java:240-270`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/AssetRetentionCleanupService.java:20-110`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/AssetRepository.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java:180-215`
- Test: `Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationServiceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/MinioAssetStorageIntegrationTests.java`

**Interfaces:**
- `AssetService.planAfterSourceDelete(UUID userId, UUID assetId, UUID sourceId): void` records a cleanup candidate inside the transaction.
- `AssetRetentionCleanupService.cleanupAfterCommit(UUID userId, UUID assetId): void` rechecks zero active Source references, deletes the object, and retains Asset metadata as `ORPHANED`.

- [ ] **Step 1: Write failing reference-count tests**

Assert that deleting one of two Source references leaves the object and Asset `READY`; deleting the final reference invokes storage deletion only after transaction commit; storage failure leaves Source absent and cleanup retryable.

- [ ] **Step 2: Run the focused Asset tests and verify failure**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=SourceAssetRelationServiceTests,MinioAssetStorageIntegrationTests test
```

Expected: `FAIL` until Source hard delete plans and after-commit cleanup perform a second reference check.

- [ ] **Step 3: Implement lock order and after-commit cleanup**

Use the same Asset row lock for Source bind/rebind/delete. Register cleanup only through transaction synchronization after successful commit; never call `assetStorage.deleteObject` before commit. On success set `upload_status='ORPHANED'`; on failure preserve Asset and increment the existing cleanup failure metric for the scheduler retry.

- [ ] **Step 4: Run focused Asset and Source tests**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=SourceAssetRelationServiceTests,MinioAssetStorageIntegrationTests,SourceHardDeleteTests test
```

Expected: all selected tests pass; the MinIO class may report its existing Docker prerequisite separately and must not be relabeled as a code pass.

- [ ] **Step 5: Commit Asset cleanup**

```powershell
git add Auralis-Server/src/main/java/com/auralis/app/source/AssetService.java Auralis-Server/src/main/java/com/auralis/app/source/AssetRetentionCleanupService.java Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/AssetRepository.java Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationServiceTests.java Auralis-Server/src/test/java/com/auralis/app/MinioAssetStorageIntegrationTests.java
git commit -m "fix: clean final source asset references after commit"
```

## Task 6: 收敛 PC 本地删除、manifest reconciliation 和 replaced 暂停

**Files:**
- Modify: `Auralis-PC/src/auth/authSessionState.ts:1-63`
- Modify: `Auralis-PC/src/store/useAuthStore.ts:34-220`
- Modify: `Auralis-PC/src/api/request.ts:44-139`
- Modify: `Auralis-PC/src/api/useSourceApi.ts`
- Modify: `Auralis-PC/src/api/realtime.ts`
- Modify: `Auralis-PC/src/services/realtimeController.ts:43-344`
- Modify: `Auralis-PC/src/store/useSyncStore.ts:171-265`
- Modify: `Auralis-PC/src/store/useSourceStore.ts:100-470`
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Modify: `Auralis-PC/src/services/localAssetRepository.ts:357-460`
- Modify: `Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts`
- Modify: `Auralis-PC/src/services/overviewGenerationService.ts`
- Modify: `Auralis-PC/src/services/documentProcessing/runtime.ts`
- Create: `Auralis-PC/scripts/r4-source-manifest-and-session-replacement.test.mjs`
- Modify: `Auralis-PC/package.json:7-11`
- Test: `Auralis-PC/scripts/r4-source-processing-schedule.test.mjs`
- Test: `Auralis-PC/scripts/r4-overview-generation.test.mjs`
- Test: `Auralis-PC/scripts/r4-sync.test.mjs`
- Test: `Auralis-PC/scripts/r4-auth-session.test.mjs`

**Interfaces:**
- `AuthSessionStatus` adds `'device-session-replaced'`; `useAuthStore.requireDeviceSessionReplacement(reason): void` clears network tokens but keeps local owner/device scope and exposes `replacementReason`.
- `removeLocalSource(sourceId: string, reason: 'SERVER_DELETE' | 'MANIFEST_MISSING'): Promise<void>` is idempotent and is the only local Source cleanup entry.
- `useSourceApi.getSourceManifest(): Promise<{ items: Array<{ id: string; revision: string }> }>` is called after startup hydration without blocking initial render.
- `RealtimeController` recognizes problem code `DEVICE_SESSION_REPLACED` and WebSocket close `4003`, calls `stop()`, and never schedules reconnect until a fresh login calls `start()`.

- [ ] **Step 1: Write failing PC tests**

Create Node tests that assert replacement stops reconnect and sync while retaining local records/outbox; manifest success calls `removeLocalSource` once for missing Source; manifest failure leaves local Source untouched; DELETE confirmation calls cleanup only after successful API response; pending local CREATE is retained.

```js
test('device replacement pauses network work without clearing local source or outbox', async () => {
  const state = reduceAuthError({ code: 'DEVICE_SESSION_REPLACED' }, initialState)
  assert.equal(state.status, 'device-session-replaced')
  assert.equal(state.localDataPolicy, 'preserve')
  assert.equal(state.syncPaused, true)
})
```

- [ ] **Step 2: Run the new and existing PC tests and verify failure**

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-source-manifest-and-session-replacement.test.mjs scripts/r4-source-processing-schedule.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-sync.test.mjs scripts/r4-auth-session.test.mjs
```

Expected: `FAIL` because no replacement status or manifest coordinator exists and current Source delete persists a tombstone before Server confirmation.

- [ ] **Step 3: Implement the single local cleanup coordinator**

Move the existing Source Store cleanup sequence into `removeLocalSource`, guard it by `userId + serverDeviceId + sourceId`, cancel document/Overview work, delete ParsedDocument/draft/job cache, then invoke the existing Local Asset lifecycle lock. Keep `DELETING` recovery records and do not delete a user-selected original path.

- [ ] **Step 4: Implement non-blocking manifest reconciliation**

Start reconciliation from `App.vue` after auth hydration and from online/session recovery. Render the current local projection first. Only a successful complete manifest may remove a settled Source; leave pending CREATE and all transport/auth failures untouched. A manifest revision mismatch schedules existing revision work but does not replace a pending local mutation.

- [ ] **Step 5: Implement replacement pause/resume**

Add a replacement-specific auth state and parse `ApiProblemError.problem.code`. Stop `RealtimeController`, `useSyncStore` scheduler, Asset queue, document runtime and Overview automatic triggers without deleting local data. A new login clears the replacement state, updates token/session/device/generation, then flushes existing outbox in order before a normal pull. Ordinary offline errors retain current auth state and only update the connection projection.

- [ ] **Step 6: Run PC focused gates**

```powershell
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-source-manifest-and-session-replacement.test.mjs scripts/r4-source-processing-schedule.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-sync.test.mjs scripts/r4-auth-session.test.mjs
npm.cmd run type-check
npm.cmd run test:r4-pc
```

Expected: new assertions and existing suites pass; type-check exits 0; full R4 output has zero failures. Browser/Tauri and two-PC real login remain separate acceptance evidence.

- [ ] **Step 7: Commit PC lifecycle behavior**

```powershell
git add Auralis-PC/src/auth Auralis-PC/src/store/useAuthStore.ts Auralis-PC/src/api/request.ts Auralis-PC/src/api/useSourceApi.ts Auralis-PC/src/api/realtime.ts Auralis-PC/src/services/realtimeController.ts Auralis-PC/src/store/useSyncStore.ts Auralis-PC/src/store/useSourceStore.ts Auralis-PC/src/services/localRepository.ts Auralis-PC/src/services/localAssetRepository.ts Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts Auralis-PC/src/services/overviewGenerationService.ts Auralis-PC/src/services/documentProcessing/runtime.ts Auralis-PC/scripts/r4-source-manifest-and-session-replacement.test.mjs Auralis-PC/scripts/r4-source-processing-schedule.test.mjs Auralis-PC/scripts/r4-overview-generation.test.mjs Auralis-PC/scripts/r4-sync.test.mjs Auralis-PC/scripts/r4-auth-session.test.mjs Auralis-PC/package.json
git commit -m "fix: preserve local data across source and session replacement"
```

## Task 7: 增加聊天来源标题快照并保持 Reading Conversation 边界

**Files:**
- Create: `Auralis-Server/src/main/resources/db/migration/V25__assistant_source_title_snapshot.sql`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/MessageEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/MessageView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ConversationService.java`
- Modify: `Auralis-PC/src/store/useChatStore.ts`
- Modify: `Auralis-PC/src/types/api.ts`
- Modify: `Auralis-PC/src/services/domainMappers.ts`
- Create: `Auralis-PC/scripts/r4-chat-source-snapshot.test.mjs`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiConversationServiceTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiConversationControllerTests.java`

**Interfaces:**
- Assistant messages expose `sourceTitles: string[]`; persistence column is `source_titles_json TEXT NOT NULL DEFAULT '[]'`.
- Source deletion never deletes `GENERAL` Conversation/messages; `READING_SESSION` remains Source-owned and cascades.
- Historical messages with an empty snapshot render without citation links and do not query deleted Source.

- [ ] **Step 1: Write failing API and persistence tests**

Send a completed assistant response with two citations and assert a deduplicated ordered `sourceTitles` array is persisted and returned. Delete the Source and assert the ordinary conversation/message still loads with its title snapshot.

- [ ] **Step 2: Run focused conversation tests and verify failure**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=AiConversationServiceTests,AiConversationControllerTests test
```

Expected: `FAIL` because Message DTO/entity currently has no source title snapshot.

- [ ] **Step 3: Add the migration and map the snapshot**

Use `source_titles_json` with a default empty JSON array. In `AiStreamingService`, collect unique citation titles in first-seen order before saving the assistant message; reject malformed titles by omitting them, not by failing an otherwise valid response. Return `sourceTitles` from MessageView and map it into the PC Chat Store without requesting Source rows.

- [ ] **Step 4: Run Server and PC chat tests**

```powershell
.\\mvnw.cmd -B -ntp -Dtest=AiConversationServiceTests,AiConversationControllerTests test
cd Auralis-PC
node --experimental-strip-types --test scripts/r4-chat-source-snapshot.test.mjs
```

Expected: all selected tests pass, including empty snapshot compatibility.

- [ ] **Step 5: Commit chat snapshot behavior**

```powershell
git add Auralis-Server/src/main/resources/db/migration/V25__assistant_source_title_snapshot.sql Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/MessageEntity.java Auralis-Server/src/main/java/com/auralis/app/ai/MessageView.java Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java Auralis-Server/src/main/java/com/auralis/app/ai/ConversationService.java Auralis-Server/src/test/java/com/auralis/app/AiConversationServiceTests.java Auralis-Server/src/test/java/com/auralis/app/AiConversationControllerTests.java Auralis-PC/src/store/useChatStore.ts Auralis-PC/src/types/api.ts Auralis-PC/src/services/domainMappers.ts Auralis-PC/scripts/r4-chat-source-snapshot.test.mjs
git commit -m "feat: persist assistant source title snapshots"
```

## Task 8: 完成 restore/软删除字段收口和契约文档

**Files:**
- Create: `Auralis-Server/src/main/resources/db/migration/V26__remove_source_restore_fields.sql`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceEntity.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceView.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationProcessor.java`
- Modify: `Auralis-PC/src/api/generated/schema.ts`
- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`

**Interfaces:**
- DELETE contract documents physical deletion and idempotency; Restore is absent from OpenAPI and generated client.
- Database contract documents `account_pc_leases`, ticket generation fields, V23–V26 migration order, `source_titles_json`, KnowledgeBlock SET NULL, and Asset ORPHANED retention.
- Status and IssuesAndReview distinguish implementation evidence from two-PC/Tauri/object-storage business acceptance.

- [ ] **Step 1: Write failing contract checks**

Run the existing OpenAPI artifact and schema checks before editing; record the exact stale route/field assertions that must change.

```powershell
cd Auralis-Server
.\\mvnw.cmd -B -ntp -Dtest=OpenApiArtifactTests test
cd ..
powershell -ExecutionPolicy Bypass -File .\\scripts\\check-openapi.ps1
```

Expected before the contract edit: the generated artifact still describes Restore or lacks manifest/lease error fields.

- [ ] **Step 2: Apply the final migration and remove restore-only schema/API fields**

After Task 6 has shipped and all clients no longer send Restore, drop `sources.deleted_at`, remove restore DTO/entity methods, remove restore route and remove deleted Source from all active list predicates. Preserve one-time DELETE change-log entries only for current PC convergence.

- [ ] **Step 3: Update all required authority documents**

Record exact route/status/error/schema changes in API and Database contracts; record server/PC module boundaries; record the implementation date and unverified real acceptance limits in Status, IssuesAndReview and Changelog. Do not edit user dirty current documents by overwriting their existing content; merge only the new dated entry.

- [ ] **Step 4: Run full automated gates**

```powershell
cd Auralis-Server
.\\mvnw.cmd -B -ntp clean test
cd ..
powershell -ExecutionPolicy Bypass -File .\\scripts\\check-openapi.ps1
cd Auralis-PC
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run build
cd ..
git diff --check
```

Expected: Server build/test and PC gates pass; Docker/MinIO/PostgreSQL failures, if present, are reported with their actual exit code and not converted to a pass.

- [ ] **Step 5: Commit the contract cutover**

```powershell
git add Auralis-Server/src/main/resources/db/migration/V26__remove_source_restore_fields.sql Auralis-Server/src/main/java/com/auralis/app/source Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationProcessor.java Auralis-PC/src/api/generated/schema.ts docs/contracts/API.md docs/contracts/Database.md docs/modules/Backend.md docs/modules/FrontendPC.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
git commit -m "docs: close source delete and pc lease contract"
```

## Task 9: 真实 Server/PC 验收和最终自查

**Files:**
- Verify: `Auralis-Server/src/main/resources/db/migration/V23__account_pc_lease_and_realtime_fencing.sql` through `V26__remove_source_restore_fields.sql`
- Verify: `Auralis-PC/src/services/localRepository.ts`, `localAssetRepository.ts`, `useSourceStore.ts`, `useSyncStore.ts`
- Verify: `docs/contracts/API.md`, `docs/contracts/Database.md`, `docs/current/Status.md`, `docs/current/IssuesAndReview.md`

**Interfaces:**
- Acceptance evidence must separately identify automated tests, Server/PC runtime checks, two-PC session behavior, Tauri local preservation, and MinIO cleanup.

- [ ] **Step 1: Run a two-PC last-login-wins scenario**

Use two PC profiles with distinct `clientDeviceKey` values. Login A, create a local pending mutation, login B, verify A gets `DEVICE_SESSION_REPLACED`, A's local Source/file/outbox remains, B can sync, then login A again and verify B is replaced.

Expected: exactly one active lease row per account; no old PC mutation is accepted while replaced.

- [ ] **Step 2: Run Source delete race and object reference scenarios**

Start ingestion/Overview/Asset bind, delete Source during each operation, and inspect Server rows plus object storage after commit. Verify a shared Asset survives first Source deletion and becomes `ORPHANED` only after the final reference.

Expected: no late Chunk/ParsedDocument/Overview write and no object deletion before DB commit.

- [ ] **Step 3: Run PC restart/manifest scenarios**

Start with local Source data, start the app, confirm UI renders before manifest response, return a manifest missing one settled Source, and confirm `removeLocalSource` cleans only that Source. Repeat with manifest timeout, offline mode, pending CREATE, and `DEVICE_SESSION_REPLACED`.

Expected: failure/offline/replaced paths preserve local data; only successful authoritative manifest or confirmed DELETE removes settled local data.

- [ ] **Step 4: Perform final plan self-check**

Run:

```powershell
rg -n -i "T[D]D|T[O]DO|[F]IXME|[P]LACEHOLDER|implement[ ]later" docs/plans/2026-09-21-source-permanent-delete-and-single-pc.md
if ($LASTEXITCODE -eq 0) { throw 'plan scan found a prohibited token' }
git diff --check
git status --short
```

Expected: no prohibited-token matches, diff-check exit 0, and only intended implementation changes remain after the plan is executed. The plan-writing turn itself must leave all pre-existing user dirty files untouched.

## Execution boundaries

- This plan intentionally separates lease fencing, Source deletion, workers, Asset cleanup, PC reconciliation, chat snapshots, and final contract removal so each commit has an independently testable invariant.
- The final human acceptance must explicitly record whether Docker/PostgreSQL/MinIO, Tauri filesystem behavior, two-PC replacement, and real WebSocket close behavior were executed; automated green tests alone do not close those boundaries.
