# Server Full Test Gates Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Server 全量测试中的 OpenAPI artifact、Spring Modulith 模块环和 H2 fixture 外键清理三类失败，同时保留 Docker/Testcontainers 的既有门禁语义。

**Architecture:** `source` 模块定义 ParsedDocument ingestion 端口和最小 job reference，`ai.ingestion` 提供同步实现，从而消除 `source -> ai` 静态依赖。OpenAPI artifact 由当前运行时导出；H2 fixture 复用现有逆外键清理顺序，不修改生产约束。

**Tech Stack:** Java 21、Spring Boot 4、Spring Modulith、Spring Data JPA、JUnit 5、Mockito、H2、Maven Wrapper、PowerShell。

## Global Constraints

- 不修改或放宽生产数据库外键、迁移与数据语义。
- 不忽略、排除或放宽 `ArchitectureTests`。
- 不改变 ingestion 的同步调用与事务语义，不引入异步事件替代端口。
- 不改变 Docker/Testcontainers 测试的默认启用策略。
- 不改变 Overview、OCR、Provider、API DTO 或响应行为。
- 保护共享 dirty worktree，不覆盖、还原或提交用户已有修改；实现文件不在共享 checkout 中提交。
- 所有实现和审查子代理使用 `gpt-5.6-luna`。

---

### Task 1: 用 source-owned port 消除 Modulith 环

**Files:**
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentIngestionPort.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/IngestionJobReference.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/IngestionJobService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentService.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/ParsedDocumentCompleteTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/ArchitectureTests.java`

**Interfaces:**
- Produces: `ParsedDocumentIngestionPort.enqueueParsedDocument(...): IngestionJobReference`。
- Produces: `ParsedDocumentIngestionPort.findParsedDocumentJob(...): Optional<IngestionJobReference>`。
- Produces: `IngestionJobReference(UUID id)`。
- Preserves: `IngestionJobService.enqueue(...)`、`claimNext(...)` 和事件监听器的 AI 内部 entity 行为。

- [ ] **Step 1: 保存架构失败基线**

Run from `Auralis-Server`:

```powershell
.\mvnw.cmd -B -ntp "-Dtest=ArchitectureTests" test
```

Expected: exit 1；报告 `ai -> knowledge -> source -> ai` / `ai -> source -> ai`，并指出 source 使用未暴露的 `IngestionJobService`、`IngestionJobEntity`。

- [ ] **Step 2: 新增 source-owned 端口与最小 DTO**

Create:

```java
package com.auralis.app.source;

import java.util.Optional;
import java.util.UUID;

public interface ParsedDocumentIngestionPort {
    IngestionJobReference enqueueParsedDocument(
            UUID userId,
            UUID sourceId,
            UUID parsedDocumentId,
            UUID ingestionRevision,
            UUID generation);

    Optional<IngestionJobReference> findParsedDocumentJob(
            UUID userId,
            UUID sourceId,
            UUID ingestionRevision);
}
```

Create:

```java
package com.auralis.app.source;

import java.util.UUID;

public record IngestionJobReference(UUID id) {
}
```

- [ ] **Step 3: 让 AI service 实现端口并隐藏 entity**

`IngestionJobService implements ParsedDocumentIngestionPort`。保留原 repository 逻辑，但把两个跨模块方法的返回值映射为：

```java
return new IngestionJobReference(job.getId());
```

和：

```java
return jobRepository
        .findFirstByUserIdAndSourceIdAndIngestionRevisionOrderByCreatedAtDesc(
                userId, sourceId, ingestionRevision)
        .map(job -> new IngestionJobReference(job.getId()));
```

不得改变 `enqueue(...)`、`claimNext(...)` 或 `onSourceIngestionRequested(...)` 的签名。

- [ ] **Step 4: 把 source consumers 切到端口**

`SourceService` 和 `ParsedDocumentService` 的字段、构造参数改为 `ParsedDocumentIngestionPort`。`ParsedDocumentService.view(...)` 改为：

```java
private ParsedDocumentCompleteView view(
        ParsedDocumentEntity document,
        IngestionJobReference job) {
    return new ParsedDocumentCompleteView(
            document.getId(), document.getStatus(), document.getGeneration(),
            job == null ? null : job.id());
}
```

删除 source 模块中所有 `com.auralis.app.ai` 和 `com.auralis.app.ai.internal` import。

- [ ] **Step 5: 调整 ParsedDocument spy 测试并验证**

`ParsedDocumentCompleteTests` 保留对具体 `IngestionJobService` 的 `@MockitoSpyBean`，因为生产 Bean 仍是该实现；更新受返回类型影响的 stub/断言，不改变 enqueue 失败回滚场景。

Run:

```powershell
.\mvnw.cmd -B -ntp "-Dtest=ArchitectureTests,ParsedDocumentCompleteTests,AiIngestionJobTests,AiIngestionWorkerTests,AiIngestionSchedulerTests,AiIngestionTests,SourceIngestionSyncEventTests" test
```

Expected: exit 0；`ArchitectureTests` 无循环，ParsedDocument jobId、幂等与回滚行为保持通过。

---

### Task 2: 修复五组 H2 fixture 的外键清理顺序

**Files:**
- Modify: `Auralis-Server/src/test/java/com/auralis/app/AuthControllerTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainControllerTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainServiceTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/IdentityRepositoryTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/IdentityServiceTests.java`

**Interfaces:**
- Consumes: `RelationRepository`、`SourceRepository`、`AssetRepository` 的 `deleteAll()`。
- Preserves: `fk_assets_user ... ON DELETE RESTRICT` 与所有生产 repository/service 行为。

- [ ] **Step 1: 保存 H2 失败基线**

Run from `Auralis-Server`:

```powershell
.\mvnw.cmd -B -ntp "-Dtest=AuthControllerTests,CoreDomainControllerTests,CoreDomainServiceTests,IdentityRepositoryTests,IdentityServiceTests" test
```

Expected: exit 1；出现 H2 SQLState `23503`，`delete from users` 违反 `fk_assets_user`。

- [ ] **Step 2: 给五个 fixture 注入缺少的 repositories**

每个测试类新增：

```java
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;

@Autowired private RelationRepository relationRepository;
@Autowired private SourceRepository sourceRepository;
@Autowired private AssetRepository assetRepository;
```

沿用各类现有的字段注入风格，不新增共享清理基类或测试 framework。

- [ ] **Step 3: 按逆外键顺序更新每个 clean 方法**

五个 fixture 的 `@BeforeEach` 清理顺序统一为：

```java
relationRepository.deleteAll();
knowledgeBlockRepository.deleteAll();
sourceRepository.deleteAll();
assetRepository.deleteAll();
taskBlockRepository.deleteAll();
subjectRepository.deleteAll();
refreshSessionRepository.deleteAll();
deviceRepository.deleteAll();
userRepository.deleteAll();
```

repository 字段使用每个类已有的实际名称；不得删除或禁用任何 FK。

- [ ] **Step 4: 重复运行 fixture 测试验证隔离**

连续运行两次：

```powershell
.\mvnw.cmd -B -ntp "-Dtest=AuthControllerTests,CoreDomainControllerTests,CoreDomainServiceTests,IdentityRepositoryTests,IdentityServiceTests" test
.\mvnw.cmd -B -ntp "-Dtest=AuthControllerTests,CoreDomainControllerTests,CoreDomainServiceTests,IdentityRepositoryTests,IdentityServiceTests" test
```

Expected: 两次均 exit 0，且没有 `23503` / `fk_assets_user`。

---

### Task 3: 重新导出并验证 OpenAPI artifact

**Files:**
- Modify: `docs/contracts/openapi/auralis-openapi.json`
- Verify only: `Auralis-PC/src/api/generated/schema.ts`
- Verify only: `Auralis-Mobile/src/api/generated/schema.ts`
- Test: `Auralis-Server/src/test/java/com/auralis/app/OpenApiArtifactTests.java`

**Interfaces:**
- Consumes: `AiController` 当前两个 Overview POST operation 的 `X-Overview-Request-Id` header 声明。
- Produces: 与当前运行时精确一致的检入 OpenAPI JSON。
- Preserves: PC/Mobile generated schema 和所有 HTTP 请求/响应 DTO。

- [ ] **Step 1: 保存 OpenAPI 失败与现有 diff 基线**

Run from repository root:

```powershell
git diff -- docs/contracts/openapi/auralis-openapi.json
.\Auralis-Server\mvnw.cmd -B -ntp "-Dtest=OpenApiArtifactTests" test
```

Expected: test exit 1，8 tests 中仅 `checkedInArtifactMatchesTheRuntimeOpenApiDocument` 失败；运行时相对 artifact 只多两个可选 header parameter。

- [ ] **Step 2: 从运行时导出 artifact**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-openapi.ps1
```

Expected: exit 0；只修改 `docs/contracts/openapi/auralis-openapi.json`。不得运行会覆盖已有 PC/Mobile generated schema 的 `generate-openapi-sdk.ps1`。

- [ ] **Step 3: 审查 artifact 差异**

Run:

```powershell
git diff -- docs/contracts/openapi/auralis-openapi.json
```

Expected: 两个 operation 各新增：

```json
{
  "name": "X-Overview-Request-Id",
  "in": "header",
  "required": false,
  "schema": { "type": "string" }
}
```

若出现其他 runtime drift，停止本任务并逐项归因，不能把无关变化作为生成产物接受。

- [ ] **Step 4: 验证 artifact 和端侧 schema 检查链**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-openapi.ps1
.\Auralis-Server\mvnw.cmd -B -ntp "-Dtest=OpenApiArtifactTests" test
```

Expected: 两条命令均 exit 0；检查脚本只在临时目录生成并比较 schema，不覆盖 PC/Mobile 工作树文件。

---

### Task 4: 全量回归、文档回写和独立审查

**Files:**
- Modify: `docs/project/Architecture.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Verify: `docs/contracts/API.md`
- Verify: `docs/contracts/Database.md`

**Interfaces:**
- Consumes: Task 1 的单向模块边界、Task 2 的测试隔离、Task 3 的契约 artifact。
- Produces: 可复核的测试结果、当前状态和仅剩外部环境风险。

- [ ] **Step 1: 运行三类聚焦门禁**

Run from `Auralis-Server`:

```powershell
.\mvnw.cmd -B -ntp "-Dtest=ArchitectureTests,OpenApiArtifactTests,AuthControllerTests,CoreDomainControllerTests,CoreDomainServiceTests,IdentityRepositoryTests,IdentityServiceTests,ParsedDocumentCompleteTests,AiIngestionJobTests" test
```

Expected: exit 0，所有选定测试通过。

- [ ] **Step 2: 运行 Server 全量测试**

Run:

```powershell
.\mvnw.cmd -B -ntp test
```

Expected: Docker 可用时 exit 0；Docker 不可用时允许 exit 1，但只允许 MinIO/PgVector Testcontainers 的 3 个既有 errors，必须是 0 failures 且不得出现 Modulith、OpenAPI 或 H2 FK errors。

- [ ] **Step 3: 回写权威文档**

在 `Architecture.md` 与 `Backend.md` 记录 source-owned `ParsedDocumentIngestionPort` 和 `ai -> source` 单向依赖；在 Status/Issues 中记录准确的聚焦测试与全量结果；在 Changelog 记录三类修复。`API.md` 已含 header，`Database.md` 无 schema 变化，只做一致性核对，不虚构修改。

- [ ] **Step 4: 检查工作树范围**

Run from repository root:

```powershell
git diff --check
git status --short
git diff -- Auralis-Server/src docs/contracts/openapi/auralis-openapi.json docs/project/Architecture.md docs/modules/Backend.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
```

Expected: 无 whitespace error；无 migration、生产 FK、Testcontainers 策略、PC/Mobile generated schema 或任务外行为变化。

- [ ] **Step 5: 独立只读 review**

Reviewer 核对设计满足度、Modulith 依赖方向、Bean 唯一性、事务语义、fixture 清理顺序、OpenAPI 漂移、测试覆盖和 dirty-worktree 保护。Critical/Important 问题必须修复并复审后才能宣告完成。
