# Backend Phase 1 Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在阶段 0 的 `com.auralis.app` 骨架上建立 User、Device、RefreshSession、Flyway V1 和可测试的认证会话链路。

**Architecture:** Identity 作为 Spring Modulith 模块，持久化实体和 Repository 放在 `identity.internal.persistence`，公开的认证 DTO、服务接口和安全主体放在 `identity` 根包或其明确子包。数据库 schema 由 Flyway V1 唯一管理；JPA 只负责实体映射和查询。认证使用 Spring Security、DelegatingPasswordEncoder、Nimbus HMAC JWT、不可逆 refresh token hash 和 rotation family 撤销。

**Tech Stack:** Java 21、Spring Boot 4.1.0、Spring Data JPA、Flyway、PostgreSQL JDBC、H2 test database、Spring Security、OAuth2 Resource Server/Jose、Spring MVC、JUnit 5、MockMvc。

## Global Constraints

- 继续使用独立分支 `agent/backend-phase-1-identity`，不得修改 PC、Mobile、Tablet 或根 `docker-compose.yml`。
- 新代码只使用 `com.auralis.app`；不得恢复旧 `com.auralis.server`、MyBatis、Redis、Milvus、etcd、旧 JJWT、统一 `Result` 或运行时 DDL。
- Flyway 是 schema 唯一权威；阶段 1 只创建面向干净数据库的 V1，不接管旧 schema，不创建数据迁移脚本。
- access JWT 有效期 15 分钟；refresh session 有效期 30 天；refresh token 只存 SHA-256 hash；重复使用已 rotation token 必须撤销整个 rotation family。
- 所有会话和设备查询必须带当前 `userId`；接口不得接收或信任资源归属 `userId`。
- API 使用直接 DTO，不使用 `Result<T>`；错误使用现有 Problem Details、稳定 `code` 和 `X-Trace-Id`。
- 测试先写失败断言，再写最小实现；H2 只用于自动化验证，PostgreSQL/pgvector/Docker/Testcontainers 属于未完成的集成门禁。
- 不提交 JWT secret、真实密码、refresh token 或生产环境默认值。local/test 缺少 JWT secret 时只生成进程内随机密钥；prod profile 缺少环境变量必须启动失败。

---

### Task 1: 建立 JPA/Flyway 测试基础和 V1 schema

**Files:**

- Modify: `Auralis-Server/pom.xml`
- Create: `Auralis-Server/src/main/resources/db/migration/V1__identity_schema.sql`
- Create: `Auralis-Server/src/main/resources/application-test.yml`
- Create: `Auralis-Server/src/test/java/com/auralis/app/IdentitySchemaTests.java`

**Interfaces:**

- Dependencies provide `jakarta.persistence`, Spring Data repositories, Flyway, PostgreSQL runtime and H2 tests.
- V1 creates `users`, `devices`, `refresh_sessions` with UUID primary keys, UTC timestamp columns, ownership foreign keys, normalized username uniqueness, `(user_id, device_id)` uniqueness, token hash uniqueness and rotation-family indexes.
- `IdentitySchemaTests` starts the context with H2/PostgreSQL mode and asserts Flyway has applied `1`, the three tables exist, and no `com.auralis.server` or old persistence dependency is required.

- [x] **Step 1: Add fixed dependency coordinates**

Add these dependencies without dynamic versions: `spring-boot-starter-data-jpa`, `spring-boot-starter-security`, `spring-security-oauth2-jose`, `spring-boot-starter-oauth2-resource-server`, `flyway-core`, `flyway-database-postgresql`, PostgreSQL runtime, and H2 test scope. Keep the existing Boot/Modulith dependency management.

- [x] **Step 2: Write the failing schema test**

Create a `@SpringBootTest` with `@ActiveProfiles("test")` that autowires `JdbcTemplate` and asserts the Flyway history contains version `1` plus tables `users`, `devices`, `refresh_sessions`. Run `..\mvnw.cmd -B -ntp -Dtest=IdentitySchemaTests test`; it must fail because the migration and test profile do not exist yet.

- [x] **Step 3: Add V1 and test profile**

Use application-generated UUIDs, `TIMESTAMP WITH TIME ZONE`, `BIGINT`, explicit `CHECK` constraints for statuses, foreign keys with `ON DELETE RESTRICT`, and indexes for owner/expiry/revocation lookups. Configure H2 with `MODE=PostgreSQL;DB_CLOSE_DELAY=-1`, Flyway enabled, and `spring.jpa.hibernate.ddl-auto=validate`.

- [x] **Step 4: Run the schema test and commit**

Run `..\mvnw.cmd -B -ntp -Dtest=IdentitySchemaTests test` and expect the targeted test to pass. Commit as `build(backend): add identity persistence baseline`.

---

### Task 2: Implement User, Device, RefreshSession persistence and ownership queries

**Files:**

- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/UserStatus.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/DevicePlatform.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/UserEntity.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/DeviceEntity.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/RefreshSessionEntity.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/UserRepository.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/DeviceRepository.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/persistence/RefreshSessionRepository.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/IdentityRepositoryTests.java`

**Interfaces:**

- `UserRepository.findByNormalizedUsername(String)` returns `Optional<UserEntity>`.
- `DeviceRepository.findByUserIdAndDeviceId(UUID, String)` and `findAllByUserIdOrderByLastActiveAtDesc(UUID)` are owner-scoped.
- `RefreshSessionRepository.findByTokenHashForUpdate(String)` locks one session; `findByIdAndUserId(UUID, UUID)` and `findAllByUserIdOrderByLastUsedAtDesc(UUID)` never omit owner; `revokeFamily(UUID, Instant)` updates only the requested family.
- Entities expose only persistence fields; password hash and token hash never appear in response DTOs.

- [x] **Step 1: Write failing repository isolation tests**

Persist two users with same display values but different IDs, devices with the same client device ID under each user, and sessions under each user. Assert same-user queries find records, cross-user `findByIdAndUserId` returns empty, and family revocation changes only the requested family.

- [x] **Step 2: Run the repository tests to verify the expected red state**

Run `..\mvnw.cmd -B -ntp -Dtest=IdentityRepositoryTests test`; expect compilation failure for missing entities/repositories, not a missing dependency or test typo.

- [x] **Step 3: Implement minimal entities and repositories**

Map V1 exactly with UUID IDs, `@Enumerated(EnumType.STRING)`, `Instant`, `@Version` on mutable entities, explicit `@Table` indexes, and Spring Data derived/annotated queries carrying `userId` in every owner lookup.

- [x] **Step 4: Run all identity persistence tests**

Run `..\mvnw.cmd -B -ntp -Dtest=IdentitySchemaTests,IdentityRepositoryTests test`; expect all assertions to pass.

- [x] **Step 5: Commit persistence**

Commit as `feat(backend): add identity persistence entities and isolation queries`.

---

### Task 3: Implement password, JWT and refresh rotation services

**Files:**

- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/config/AuralisProperties.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/AuthenticatedUser.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/IdentityException.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/TokenPair.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/IdentityService.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/TokenService.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/RefreshTokenHasher.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/JwtConfiguration.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/IdentityServiceTests.java`

**Interfaces:**

- `IdentityService.register(String username, String password, String displayName, DeviceCommand device)` creates a user, device and refresh session atomically and returns `TokenPair` plus public user data.
- `IdentityService.login(...)` returns the same shape and gives one external error for unknown user or wrong password.
- `IdentityService.refresh(String refreshToken)` rotates a valid session, marks the old session as replaced, and on reuse revokes the entire family.
- `IdentityService.logout(UUID userId, UUID sessionId)`, `revokeSession(UUID userId, UUID sessionId)`, `revokeOtherSessions(UUID userId, UUID currentSessionId)` all use owner-scoped repository queries.
- `TokenService` issues access JWT with only `sub`, `sid`, `did`, `typ=access`, `iat`, `exp`; it never accepts refresh tokens as access credentials.

- [x] **Step 1: Write failing service tests**

Test password hashes are delegated/one-way, registration normalizes usernames, login rejects unknown and wrong passwords identically, refresh creates a new session and invalidates the old one, replay revokes the family, expired/revoked tokens fail, and access JWT claims contain no password or refresh token.

- [x] **Step 2: Run service tests to verify red**

Run `..\mvnw.cmd -B -ntp -Dtest=IdentityServiceTests test`; expect missing service classes or methods, then correct only test setup errors until the failure is caused by absent behavior.

- [x] **Step 3: Implement minimal token and service behavior**

Use `PasswordEncoderFactories.createDelegatingPasswordEncoder()`, `SecureRandom` for 32-byte refresh values, SHA-256 + Base64URL for storage, `NimbusJwtEncoder`/`NimbusJwtDecoder` with a runtime secret key, transaction boundaries around registration and rotation, and `Clock` injection for deterministic expiry tests.

- [x] **Step 4: Run service and persistence tests**

Run `..\mvnw.cmd -B -ntp -Dtest=IdentitySchemaTests,IdentityRepositoryTests,IdentityServiceTests test`; expect all to pass.

- [x] **Step 5: Commit security services**

Commit as `feat(backend): implement identity tokens and refresh rotation`.

---

### Task 4: Expose authentication endpoints and security error behavior

**Files:**

- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/AuthController.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/AuthDtos.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/SecurityConfiguration.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/JwtAuthenticationFilter.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/SecurityProblemSupport.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/error/GlobalExceptionHandler.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/AuthControllerTests.java`

**Interfaces:**

- `POST /api/auth/register` and `/login` accept `username`, `password`, `displayName`, `deviceId`, `deviceName`, `platform`; return `201` for register and `200` for login with public user, access token, refresh token, and expiry seconds.
- `POST /api/auth/refresh` accepts `refreshToken` and returns a rotated token pair; invalid/replayed/expired values return `401` with `UNAUTHENTICATED` and no token detail.
- `POST /api/auth/logout` returns `204`; `GET /api/auth/me` returns public user; `GET /api/auth/sessions` returns owner-scoped session metadata; `DELETE /api/auth/sessions/{id}` and `DELETE /api/auth/sessions/others` revoke sessions.
- Unauthenticated protected routes use `application/problem+json`, `401`, `UNAUTHENTICATED`, safe detail and a trace ID; cross-user session IDs look like not-found and never reveal ownership.

- [x] **Step 1: Write failing MockMvc tests**

Cover register/login/me, duplicate username, invalid credentials, refresh rotation and replay, logout, session listing, cross-user revoke rejection, protected route without bearer token, refresh token used as access token, and validation error fields.

- [x] **Step 2: Run controller tests to verify red**

Run `..\mvnw.cmd -B -ntp -Dtest=AuthControllerTests test`; expect missing controller/security classes or unimplemented routes.

- [x] **Step 3: Implement DTOs, controller and security filter**

Use `@Valid` request records, `SecurityContext` principal `AuthenticatedUser`, `SecurityFilterChain` permitting only register/login/refresh and actuator/docs, stateless sessions, bearer JWT validation, and Problem Details entrypoint/access-denied handlers.

- [x] **Step 4: Run complete backend test suite**

Run `..\mvnw.cmd -B -ntp clean test`; expect phase 0 tests plus all identity tests to pass.

- [x] **Step 5: Commit the authentication surface**

Commit as `feat(backend): expose identity authentication endpoints`.

---

### Task 5: Update contracts, status, risks and complete phase 1 gates

**Files:**

- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/plans/backend-greenfield-rewrite-plan.md`
- Modify: `docs/README.md` to register this plan

**Interfaces:**

- API contract changes record the now-implemented auth routes, exact request/response fields, status codes and safe error behavior; planned routes remain explicitly unimplemented.
- Database contract records V1 tables as implemented against a clean schema, while PostgreSQL/pgvector/Docker/Testcontainers remain unverified.
- Status records code/build/test/startup evidence separately; risks keep Docker, frontend cutover, business acceptance and any unverified production concerns open.

- [x] **Step 1: Run static checks and final tests**

Run `git diff --check`, the old package/dependency scan under `Auralis-Server/src`, `..\mvnw.cmd -B -ntp clean test`, and inspect Surefire reports. No PC/Mobile/Compose files may appear in the diff.

- [x] **Step 2: Run test-profile startup smoke**

Start the application with the test/local datasource configuration, exercise registration and login over HTTP if the environment supports it, verify health and OpenAPI, then stop only the exact process PID. Record that H2 was used and PostgreSQL/Docker were not tested.

- [x] **Step 3: Update all authoritative docs**

Change only statements supported by this round's evidence. Keep the phase status as “已构建待验收” until PostgreSQL/Docker and manual acceptance gates are completed.

- [x] **Step 4: Commit final phase 1 handoff**

Run `git add Auralis-Server docs/contracts docs/modules/Backend.md docs/current docs/release docs/plans/backend-greenfield-rewrite-plan.md docs/README.md`, `git diff --cached --check`, then commit as `feat(backend): deliver identity and database phase 1`.

## Phase 1 Completion Definition

| Status | Evidence required | Not proven by this phase |
| --- | --- | --- |
| Code implementation | V1, entities, owner-scoped repositories, token services, security filter and auth routes exist | Subject, Source, KnowledgeBlock, Task, Relation, Sync, AI/RAG |
| Build/test | Clean Maven test with real schema, repository, rotation and MockMvc assertions | PostgreSQL production behavior, Docker integration |
| Security behavior | invalid credentials, expiry, revocation, refresh replay and cross-user session access rejected | Full penetration test, frontend migration |
| Startup/contract | health/OpenAPI/auth smoke on test profile | Production deployment and three-client acceptance |
| Container integration | not claimed until PostgreSQL/Testcontainers/MinIO evidence exists | production infrastructure health |

## Self-review

- Spec coverage: phase 1 tasks cover the complete plan entries for Flyway V1, User, Device, RefreshSession, registration, login, rotation, logout, current user, session revocation and repository isolation.
- Placeholder scan: no step depends on an undefined class, route, command or later task; every task names exact files and commands.
- Type consistency: `AuthenticatedUser`, `TokenPair`, `IdentityService`, `TokenService`, `AuthController` and `SecurityConfiguration` use the same UUID/Instant/record contracts throughout.
- Scope check: no core-domain, sync, AI, frontend, Compose or old Server compatibility work is included.
