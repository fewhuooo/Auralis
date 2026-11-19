# 后端绿地重写阶段 0 实施计划

**Goal:** 在不丢失当前工作树的前提下备份并替换旧 `Auralis-Server`，建立一个无旧实现依赖、可编译、可启动、可查看 OpenAPI 的 `com.auralis.app` Spring Boot 4.1 / Spring Modulith 2.1 骨架，并固化阶段 0 的对象、API 和数据库设计。

**Architecture:** 新 Server 是模块化单体的空骨架。根包固定为 `com.auralis.app`；阶段 0 只建立共享基础设施和业务模块边界，业务 Entity、Repository、Flyway V1、认证和业务 Controller 留到后续阶段。共享层只承载配置、traceId、Problem Details 和 OpenAPI 元数据，不包含业务 Entity 或 Repository。

阶段 0 的 API/数据库文档是后续实现的目标契约，不代表业务接口已经可用。阶段 0 可执行 HTTP 表面只有 Actuator 健康检查和 OpenAPI 文档，不创建临时业务 Controller。

**Tech Stack:** Java 21、Spring Boot 4.1、Spring Modulith 2.1、Maven Wrapper、Spring MVC、Bean Validation、Actuator、springdoc OpenAPI、JUnit、MockMvc。

## Global Constraints

- 目标目录严格为 `D:\\CodeBase\\Active\\Auralis\\Auralis-Server`；移动或删除前必须完成仓库外备份和绝对路径审计。
- 旧 Server 只用于盘点、备份和核对前端依赖；禁止复制其 Controller、Entity、Service、Repository、DDL、配置、依赖或 `com.auralis.server` 包。
- 使用 Java 21、Spring Boot 4.1、Spring Modulith 2.1；不使用预览特性，不混用旧 Boot 3 配置。
- 阶段 0 不实现 User/Auth、Subject、Source、Knowledge、Task、Relation、Review、Sync、AI/RAG、WebSocket、数据库迁移或对象存储。
- 阶段 0 不修改 PC、Mobile、Tablet 代码和根 `docker-compose.yml`。
- 不使用 `git reset --hard`、`git checkout --` 或任何覆盖、还原、丢弃用户修改的命令。
- 当前工作树中用户已经修好的报错属于受保护基线；阶段 0 只在备份后替换 Server 目录，不评价或回滚这些修改。
- 不提交真实密码、JWT secret、BYOK key、AI key、refresh token 或生产环境默认值。
- 分开记录代码存在、构建通过、自动测试通过、启动通过、容器集成通过、契约通过和业务验收通过。

## 当前基线

2026-08-12 只读盘点确认：

- 开始时基于用户已推送的 `main` 创建分支 `agent/backend-phase-0`；前端、Mobile 和既有文档修改均原样保护。
- 旧 Server 使用 `com.auralis.server`、Spring Boot 3.2.5、MyBatis Plus、Redis、Milvus、旧 LangChain4j、JJWT、MinIO 和程序化 DDL。
- 根 Compose 仍是旧 PostgreSQL/Redis/pgAdmin/etcd/Milvus/MinIO/backend 拓扑；阶段 0 不改它。
- 对象矩阵必须引用现有文件：`Auralis-PC/src/services/localDb.ts`、`Auralis-PC/src/store/useBlockStore.ts`、`Auralis-PC/src/store/useTaskStore.ts`、`Auralis-PC/src/api/useAuthApi.ts`、`Auralis-PC/src/api/useSyncApi.ts`、`Auralis-Mobile/src/services/localDb.ts`、`Auralis-Mobile/src/store/useBlockStore.ts`、`Auralis-Mobile/src/store/useTaskStore.ts`、`Auralis-Mobile/src/store/useAuthStore.ts`、`Auralis-Mobile/src/store/useSyncStore.ts`、`Auralis-Mobile/src/services/tabletNoteModel.ts`。

执行证据：旧 Server 备份位于 `D:\CodeBase\Active\Auralis-backups\20260812-205737`，完整归档 SHA-256 为 `C59AD2AB39F05B114D7B13FAA948C8A8ED29CB0CA1F26DDBCF04794B431C4BEC`；归档 152 个文件、210984 bytes，补丁 0 bytes，展开复核通过。阶段 0 最终 `clean test` 退出码为 0，4 份 Surefire 报告、5 个测试全通过；真实 HTTP smoke 的 readiness/liveness 为 200 + `UP`，OpenAPI 和 Swagger UI 为 200。

## 文件变更总览

- Create outside repository: `D:\\CodeBase\\Active\\Auralis-backups\\<timestamp>\\git-status.txt`、`auralis-server-tracked.patch`、`auralis-server-untracked.txt`、`auralis-server-files.txt`、`Auralis-Server.zip`。
- Replace after backup: `Auralis-Server/**`。
- Create in Server: `pom.xml`、Maven Wrapper、`AuralisApplication.java`、共享配置/错误/Web 文件、12 个模块的 `package-info.java`、三份 profile 配置和阶段 0 测试。
- Create: `docs/contracts/ObjectModelMatrix.md`。
- Modify: `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/modules/Backend.md`、`docs/README.md`。
- Modify only after actual evidence: `docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/release/Changelog.md`。
- Do not modify: `Auralis-PC/**`、`Auralis-Mobile/**`、`docker-compose.yml`、`docs/archive/**`、`docs/showcase/**`。

---

### Task 1: 建立工作树保护与旧 Server 备份门

**Files:**

- Read: `AGENTS.md`、`docs/plans/backend-greenfield-rewrite-plan.md`、`Auralis-Server/**`
- Create outside repository: `D:\\CodeBase\\Active\\Auralis-backups\\<timestamp>\\*`
- No repository source modification before this task passes

**Interfaces:**

- Produces: 备份目录、工作树状态、旧 Server 跟踪补丁、未跟踪清单、文件清单和可展开 ZIP。
- Consumed by: Task 2 的对象盘点和 Task 3 的目录替换。

- [x] **Step 1: 记录状态并验证绝对路径**

执行：

```powershell
$serverPath = (Resolve-Path -LiteralPath 'Auralis-Server').Path
$expectedServerPath = 'D:\\CodeBase\\Active\\Auralis\\Auralis-Server'
if ($serverPath -cne $expectedServerPath) {
  throw "Refusing to continue: $serverPath"
}
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path 'D:\\CodeBase\\Active\\Auralis-backups' $backupStamp
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
git status --short | Set-Content (Join-Path $backupRoot 'git-status.txt') -Encoding utf8
git diff --binary -- Auralis-Server | Set-Content (Join-Path $backupRoot 'auralis-server-tracked.patch') -Encoding utf8
git ls-files --others --exclude-standard -- Auralis-Server | Set-Content (Join-Path $backupRoot 'auralis-server-untracked.txt') -Encoding utf8
Get-ChildItem $serverPath -Recurse -File | Select-Object -ExpandProperty FullName |
  Set-Content (Join-Path $backupRoot 'auralis-server-files.txt') -Encoding utf8
$backupRoot
```

预期：退出码为 0；输出的 `$backupRoot` 在 Server 目录之外；`git-status.txt` 保留当前用户修改。

- [x] **Step 2: 创建并校验完整归档**

执行：

```powershell
$archivePath = Join-Path $backupRoot 'Auralis-Server.zip'
Compress-Archive -LiteralPath $serverPath -DestinationPath $archivePath -CompressionLevel Optimal
if (-not (Test-Path $archivePath -PathType Leaf)) { throw 'Archive was not created.' }
Get-FileHash $archivePath -Algorithm SHA256
$verifyRoot = Join-Path $backupRoot 'archive-verify'
Expand-Archive -LiteralPath $archivePath -DestinationPath $verifyRoot
if (-not (Test-Path (Join-Path $verifyRoot 'Auralis-Server\\pom.xml') -PathType Leaf)) {
  throw 'Archive verification failed.'
}
```

预期：文件清单非空、ZIP 可展开且包含旧 Server 的 `pom.xml`、源码、资源和已有构建产物。若 `git status --short -- Auralis-Server` 有修改，补丁必须非空；若 Server 工作树干净，零字节补丁是有效的干净基线证据。备份目录不在待替换目录中。

- [x] **Step 3: 记录安全门**

记录实际 `backupRoot`、归档 SHA-256、归档文件数、补丁大小、Server 状态行数、未跟踪文件数和路径审计结果。此任务不提交旧 Server 内容。未通过安全门不得移动或删除 Server 目录。

---

### Task 2: 固化对象差异矩阵与阶段 0 契约

**Files:**

- Create: `docs/contracts/ObjectModelMatrix.md`
- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/README.md`

**Interfaces:**

- Consumes: 绿地重写计划第 7、8、9、10、13、16 节和当前 PC/Mobile/旧 Server 盘点。
- Produces: 后续阶段可直接使用的对象字段、所有权、删除、版本、时间、API 和数据库决策，并明确阶段 0 未实现的内容。

- [x] **Step 1: 建立矩阵固定列**

`ObjectModelMatrix.md` 使用列：`对象`、`PC 页面/Store`、`Mobile/Tablet 页面/Store`、`端侧本地库`、`旧 Server 事实`、`新 Server 模型`、`迁移决策`、`阶段 0 证据状态`。必须建立 `Subject`、`Source/Asset`、`KnowledgeBlock`、`Task`、`Relation`、`User/Auth`、`Tablet NoteDocument` 七行，且每行引用实际路径。

- [x] **Step 2: 固化已确认差异**

矩阵必须写入这些具体结论：

```text
KnowledgeBlock 的 content 是正文权威；time 统一 RFC 3339；relatedBlockIds 不再是关系来源。
Task 统一为 TODO、IN_PROGRESS、DONE、CANCELLED；durationMinutes 为分钟；scheduledAt/dueAt 为时间戳；position 只表示 sortKey；loadText 是派生显示值。
Asset 表示 MinIO 物理对象，Source 表示逻辑来源；Asset 不作为 Relation 节点。
Relation 统一替代实体、relatedBlockIds、任务描述标记和临时图边四种表达。
User/Auth 不沿用旧 Result、any 或 refresh 行为；新契约使用显式 DTO 和 Problem Details。
Tablet NoteDocument 的 stroke、snapshot、viewport、pages 和多存储路径仍是端侧专有数据。
Mobile 本地库按 userId 分区是后续接入必需条件。
```

- [x] **Step 3: 更新 API 目标契约**

`docs/contracts/API.md` 明确新 Server 保留 `/api` 总前缀但不兼容旧子路径；成功响应直接返回 DTO；创建返回 201 + `Location`；删除返回 204；错误为 RFC Problem Details + `code`、`traceId`、`fieldErrors`；更新/删除/恢复要求 `baseVersion`；列表使用不透明 cursor；`userId` 只从 SecurityContext 推导。

首版路由表覆盖计划中的 Auth、Subject、Asset、Source、Knowledge、Task、Relation、Review、Stats、Sync、AI、Realtime 总路径，并标注 `planned-after-phase-0`。阶段 0 可执行路径只列：

```text
GET /actuator/health
GET /actuator/health/liveness
GET /actuator/health/readiness
GET /v3/api-docs
GET /swagger-ui/index.html
```

- [x] **Step 4: 更新数据库目标契约**

`docs/contracts/Database.md` 改为“旧 DDL/Entity 盘点 + 新目标模型”双区段，写入 UUID、`user_id`、`version`、`created_at`、`updated_at`、`deleted_at`、TIMESTAMPTZ、Flyway 唯一 schema 权威、BIGSERIAL change cursor、inbound mutation 幂等键、30 天墓碑、Asset/Source 拆分和 `source_chunks vector(1024)`。阶段 0 不创建 `V1__*.sql`；迁移实现属于阶段 1。

- [x] **Step 5: 登记本计划并提交文档**

在 `docs/README.md` 的后端绿地重写入口增加：

```markdown
- [阶段 0 实施计划](backend-greenfield-phase-0-plan.md)
```

执行：

```powershell
git add docs/contracts/ObjectModelMatrix.md docs/contracts/API.md docs/contracts/Database.md docs/modules/Backend.md docs/README.md docs/plans/backend/backend-greenfield-phase-0-plan.md
git commit -m "docs(backend): define greenfield phase 0 contract baseline"
```

预期：提交只包含阶段 0 契约/计划文档，不包含 Server、PC、Mobile 或 Compose 代码。

---

### Task 3: 在安全门之后替换旧 Server 目录

**Files:**

- Move after Task 1: 旧 `Auralis-Server/` 到已记录的仓库外 `backupRoot`
- Create: 新 `Auralis-Server/`
- Do not modify: `Auralis-PC/**`、`Auralis-Mobile/**`、`docker-compose.yml`

**Interfaces:**

- Consumes: Task 1 的 `backupRoot`、路径审计和可展开归档。
- Produces: 不含旧源码/构建产物的空 Server 路径，供 Task 4-7 创建新工程。

- [x] **Step 1: 再次审计目标**

```powershell
$serverPath = (Resolve-Path -LiteralPath 'Auralis-Server').Path
if ($serverPath -cne 'D:\\CodeBase\\Active\\Auralis\\Auralis-Server') {
  throw 'Refusing replacement outside exact Server directory.'
}
git status --short
```

若出现新的用户修改，重新更新备份清单；不得用还原命令“清理”状态。

- [x] **Step 2: 可恢复移动旧目录**

```powershell
$legacyServerBackup = Join-Path $backupRoot 'Auralis-Server-source'
if (Test-Path $legacyServerBackup) { throw 'Refusing to overwrite legacy backup.' }
Move-Item -LiteralPath 'D:\\CodeBase\\Active\\Auralis\\Auralis-Server' -Destination $legacyServerBackup
if (Test-Path 'D:\\CodeBase\\Active\\Auralis\\Auralis-Server') {
  throw 'Legacy Server path still exists.'
}
```

只允许移动这个已审计的目录；不得对仓库根目录或其他模块执行递归移动/删除。

- [x] **Step 3: 创建空骨架路径并复核范围**

创建 `Auralis-Server/.mvn/wrapper`、`src/main/java/com/auralis/app`、`src/main/resources`、`src/test/java/com/auralis/app`。随后确认新 Server 路径为空，且 PC、Mobile、docs、Compose 的原有差异仍然可见。

---

### Task 4: 创建 Maven 工程和无旧依赖基线

**Files:**

- Create: `Auralis-Server/pom.xml`
- Create: `Auralis-Server/.mvn/wrapper/maven-wrapper.properties`
- Create: `Auralis-Server/mvnw`
- Create: `Auralis-Server/mvnw.cmd`
- Create: `Auralis-Server/.gitignore`

**Interfaces:**

- Produces: Java 21 Maven 工程，后续任务只依赖 `com.auralis.app` 和 Spring 公开组件。
- Does not produce: 旧依赖、业务迁移、数据库连接、Redis、Milvus、MinIO、AI 或 WebSocket 自动配置。

- [x] **Step 1: 写入固定 POM 坐标**

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>4.1.0</version>
  <relativePath/>
</parent>
<groupId>com.auralis.app</groupId>
<artifactId>auralis-server</artifactId>
<version>0.1.0-SNAPSHOT</version>
<properties>
  <java.version>21</java.version>
  <spring-modulith.version>2.1.0</spring-modulith.version>
</properties>
```

主依赖只包含 Web、Validation、Actuator、Spring Modulith Core、Configuration Processor 和与 Boot 4.1 兼容的固定版本 springdoc；测试依赖包含 Spring Boot Test 与 Spring Modulith Test。禁止 MyBatis Plus、Redis、Milvus、etcd、JJWT、LangChain4j、MinIO、旧 JJWT 配置、运行时 DDL 和旧包引用。禁止动态版本、`LATEST` 和 `SNAPSHOT` 依赖；springdoc 必须在首次 Maven 解析前固定具体版本。

- [x] **Step 2: 生成并验证 Wrapper**

```powershell
mvn -N wrapper:wrapper -Dmaven=3.9.11
Set-Location Auralis-Server
.\\mvnw.cmd -B -ntp -DskipTests validate
Set-Location ..
```

预期：Wrapper 文件存在，validate 退出码为 0。

- [x] **Step 3: 做旧依赖静态检查并提交**

```powershell
$hits = Select-String -Path 'Auralis-Server\\pom.xml' -Pattern 'mybatis|redis|milvus|etcd|jjwt|langchain4j|minio|com\\.auralis\\.server' -CaseSensitive:$false
if ($hits) { $hits | Format-Table; throw 'Legacy dependency found.' }
git add Auralis-Server/pom.xml Auralis-Server/.mvn Auralis-Server/mvnw Auralis-Server/mvnw.cmd Auralis-Server/.gitignore
git commit -m "build(backend): create Boot 4 modulith project baseline"
```

---

### Task 5: 创建入口、配置绑定、健康检查、Problem Details 与 OpenAPI

**Files:**

- Create: `Auralis-Server/src/main/java/com/auralis/app/AuralisApplication.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/shared/config/AuralisProperties.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/shared/config/OpenApiConfiguration.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/shared/web/TraceIdFilter.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiErrorCode.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiProblemDetails.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/shared/error/GlobalExceptionHandler.java`
- Create: `Auralis-Server/src/main/resources/application.yml`
- Create: `Auralis-Server/src/main/resources/application-local.yml`
- Create: `Auralis-Server/src/main/resources/application-prod.yml`

**Interfaces:**

- `AuralisApplication`: `@SpringBootApplication` + `@ConfigurationPropertiesScan`。
- `AuralisProperties`: `environment`、`api.publicBaseUrl`、`upload.maxFileSizeBytes` 三个非秘密绑定项。
- Problem Details: `type`、`title`、`status`、`detail`、`instance`、`code`、`traceId`、`fieldErrors`。
- HTTP: `X-Trace-Id`；`application/problem+json`；OpenAPI 标题 `Auralis API`、版本 `0.1.0`。

- [x] **Step 1: 写入应用入口**

```java
package com.auralis.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class AuralisApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuralisApplication.class, args);
    }
}
```

- [x] **Step 2: 写入配置绑定和 profile**

```java
@ConfigurationProperties(prefix = "auralis")
@Validated
public record AuralisProperties(
        @NotBlank String environment,
        @Valid Api api,
        @Valid Upload upload
) {
    public record Api(@NotBlank String publicBaseUrl) {}
    public record Upload(@Positive long maxFileSizeBytes) {}
}
```

`application.yml` 设置应用名 `auralis-server`、默认 profile `local`、端口 8080、Actuator health/info 暴露、health probes、`/v3/api-docs`、`/swagger-ui/index.html` 和 50 MiB 上传限制。local 只能提供无秘密本机值；prod 只能引用环境变量，不得提供默认密码/key。阶段 0 不引入 datasource、Flyway、Redis、Milvus、MinIO 或 AI 配置。

- [x] **Step 3: 实现错误协议**

`ApiErrorCode` 至少包含：`VALIDATION_FAILED`、`UNAUTHENTICATED`、`FORBIDDEN`、`RESOURCE_NOT_FOUND`、`RESOURCE_DELETED`、`RESOURCE_VERSION_CONFLICT`、`MUTATION_REJECTED`、`UPLOAD_VALIDATION_FAILED`、`INGESTION_FAILED`、`MODEL_UNAVAILABLE`、`RATE_LIMITED`、`INTERNAL_ERROR`。

`TraceIdFilter` 接受长度不超过 64 的安全 `X-Trace-Id`，否则生成 UUID，并在响应回写。`GlobalExceptionHandler` 处理校验错误、未知路由和未分类异常；detail 不得输出异常消息、SQL、主机路径、堆栈或 secret。

- [x] **Step 4: 配置 OpenAPI**

`OpenApiConfiguration` 注册固定的 `OpenAPI` Bean，描述写明阶段 0 仅提供健康检查和文档，业务路由按绿地计划分阶段开放；不得声明旧 `/api/blocks`、`/api/fs`、`/ws/sync` 或 `Result<T>`。

- [x] **Step 5: 提交基础协议**

执行：

```powershell
Set-Location Auralis-Server
.\\mvnw.cmd -B -ntp test
if ($LASTEXITCODE -ne 0) { throw 'Phase 0 foundation tests failed.' }
Set-Location ..
git add Auralis-Server/src/main/java/com/auralis/app Auralis-Server/src/main/resources
git commit -m "feat(backend): add phase 0 health error and openapi baseline"
```

---

### Task 6: 建立模块包和 Modulith 边界测试

**Files:**

- Create: `Auralis-Server/src/main/java/com/auralis/app/shared/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/identity/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/subject/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/source/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/knowledge/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/task/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/relation/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/review/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/sync/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/stats/package-info.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/realtime/package-info.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ArchitectureTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ApiSmokeTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ProblemDetailsTests.java`
- Create: `Auralis-Server/src/test/java/com/auralis/app/ConfigurationTests.java`

**Interfaces:**

- Produces: 12 个业务模块和 `shared` 模块的明确边界。
- Test gate: `ApplicationModules.of(AuralisApplication.class).verify()`、配置绑定、健康检查、404 Problem Details、OpenAPI 文档均有真实断言。

- [x] **Step 1: 写入模块包声明**

每个 `package-info.java` 使用同一结构，仅替换包名：

```java
@org.springframework.modulith.ApplicationModule
package com.auralis.app.identity;
```

依次替换为 `shared`、`subject`、`source`、`knowledge`、`task`、`relation`、`review`、`sync`、`ai`、`stats`、`realtime`。阶段 0 不添加跨模块依赖。

- [x] **Step 2: 写入模块测试**

```java
package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ArchitectureTests {
    @Test
    void verifiesApplicationModules() {
        ApplicationModules.of(AuralisApplication.class).verify();
    }
}
```

MockMvc 测试必须断言 liveness/readiness 为 200 + `UP`、未知路由为 404 + `RESOURCE_NOT_FOUND` + `application/problem+json`、`X-Trace-Id` 可追踪、`/v3/api-docs` 的 `info.title` 为 `Auralis API`，以及配置的 50 MiB 值绑定成功。

- [x] **Step 3: 验证旧包和旧依赖不存在**

```powershell
$oldHits = Get-ChildItem Auralis-Server\\src -Recurse -File |
  Select-String -Pattern 'com\\.auralis\\.server|mybatis|redis|milvus|etcd|jjwt|langchain4j|minio|encryptedPayload|Result<' -CaseSensitive:$false
if ($oldHits) { $oldHits | Format-Table; throw 'Legacy reference remains.' }
```

- [x] **Step 4: 运行测试并提交**

```powershell
Set-Location Auralis-Server
.\\mvnw.cmd -B -ntp test
if ($LASTEXITCODE -ne 0) { throw 'Modulith or phase 0 smoke tests failed.' }
Set-Location ..
git add Auralis-Server/src/main/java/com/auralis/app/*/package-info.java Auralis-Server/src/test
git commit -m "test(backend): enforce modulith phase 0 boundaries"
```

预期：Surefire 执行真实测试类和断言，不能用空 `src/test` 或 `No sources to compile` 作为通过证据。

---

### Task 7: 最终构建、启动、契约和文档门禁

**Files:**

- Modify after evidence: `docs/modules/Backend.md`、`docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/contracts/ObjectModelMatrix.md`、`docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/release/Changelog.md`

**Interfaces:**

- Consumes: Task 1-6 的真实命令输出和文件状态。
- Produces: 可审计的阶段 0 交接；不把骨架、构建、测试、启动、容器和业务验收混成一个状态。

- [x] **Step 1: 运行完整 Maven 门禁**

```powershell
Set-Location Auralis-Server
.\\mvnw.cmd -B -ntp clean test
$testExit = $LASTEXITCODE
$surefireFiles = @(Get-ChildItem target\\surefire-reports -Filter '*.xml' -File -ErrorAction SilentlyContinue)
Set-Location ..
if ($testExit -ne 0) { throw "clean test failed with exit code $testExit" }
if ($surefireFiles.Count -lt 4) { throw "Expected at least four Surefire reports." }
```

记录命令、退出码、报告数量、测试类和警告。该门禁不证明容器或业务链路。

- [x] **Step 2: 启动新 Server 做健康和 OpenAPI smoke**

执行时使用本次进程的精确 PID，并在 `finally` 中只停止该 PID：

```powershell
Set-Location Auralis-Server
$phase0Process = Start-Process -FilePath '.\\mvnw.cmd' -ArgumentList '-B','-ntp','spring-boot:run' -PassThru -WindowStyle Hidden
try {
  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $health = Invoke-RestMethod http://localhost:8080/actuator/health/readiness -TimeoutSec 2
      if ($health.status -eq 'UP') { $ready = $true; break }
    } catch {}
    Start-Sleep 1
  }
  if (-not $ready) { throw 'Server did not become ready.' }
  $live = Invoke-RestMethod http://localhost:8080/actuator/health/liveness
  $docs = Invoke-RestMethod http://localhost:8080/v3/api-docs
  if ($live.status -ne 'UP') { throw 'Liveness is not UP.' }
  if ($docs.info.title -ne 'Auralis API') { throw 'Unexpected OpenAPI title.' }
  Invoke-WebRequest http://localhost:8080/swagger-ui/index.html -MaximumRedirection 5
}
finally {
  if ($phase0Process -and -not $phase0Process.HasExited) { Stop-Process $phase0Process.Id -Force }
  Set-Location ..
}
```

记录实际 HTTP 状态和响应关键字段。该步骤不证明旧前端可联调。

- [x] **Step 3: 回写状态与风险**

`docs/current/Status.md` 只有在证据齐全后写“后端绿地重写：阶段 0 已构建待验收”，并列出代码、构建、测试、启动和 OpenAPI 证据；明确未证明 PostgreSQL/pgvector/MinIO、业务身份、前端联调、GUI、真机和外部 AI。

`docs/current/IssuesAndReview.md`：只有备份可读取、目标路径审计和替换范围检查全部有证据时关闭 `P1-Backend-Rewrite-Safety`；保留 `P1-Backend-Contract-Cutover`、`P1-Backend-Docker-Gate` 和业务安全风险。`docs/release/Changelog.md` 只记录已发生的备份、替换和骨架验证，不写成业务能力已交付。

- [x] **Step 4: 提交并保护剩余用户修改**

```powershell
git add Auralis-Server docs/modules/Backend.md docs/contracts/API.md docs/contracts/Database.md docs/contracts/ObjectModelMatrix.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md
git diff --cached --check
git commit -m "feat(backend): deliver greenfield phase 0 skeleton"
git status --short
```

最后的 `git status --short` 中若仍有前端或文档用户修改，必须原样保留并在交接中列出。

## 阶段 0 完成定义

| 状态 | 必须有的证据 | 不能据此声称的内容 |
| --- | --- | --- |
| 代码实现 | 备份、`com.auralis.app` 骨架、配置、Problem Details、OpenAPI、Modulith 测试存在 | User/Auth、核心对象、同步、AI/RAG 已实现 |
| 构建通过 | `Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0 | PostgreSQL、MinIO、pgvector 可用 |
| 自动测试通过 | Surefire 有真实测试报告和断言 | 用户隔离、冲突、上传和同步安全已验证 |
| 启动通过 | liveness/readiness 为 `UP`，OpenAPI 和 Swagger UI 可访问 | 旧前端可以直接联调 |
| 容器集成通过 | 阶段 0 不执行 | Docker、Testcontainers、Flyway、MinIO、pgvector 已验收 |
| 契约通过 | ObjectModelMatrix、API、Database 首版设计完成，OpenAPI 文档服务可访问 | 最终固定 OpenAPI artifact、SDK 和三端联调已交付 |
| 业务验收通过 | 阶段 0 不执行 | 登录、同步、AI/RAG、GUI、真机或产品验收已通过 |

阶段 0 的最终状态应为“已构建待验收”。阶段 1 的入口是：在这个骨架上新增 Flyway V1、User、RefreshSession、Device、认证和用户隔离测试。

## 计划自检

- Spec coverage：备份/替换覆盖总计划第 4 节；技术基线覆盖第 5 节；模块边界覆盖第 6 节；统一 API/数据库规则覆盖第 7、8、10、13 节；对象矩阵覆盖第 16 节；配置、健康和测试覆盖第 17、19 节；门禁和回写覆盖第 20、21 节；风险控制覆盖第 22 节。
- Placeholder scan：没有未定义占位步骤或“实现后再补”；备份时间由明确命令生成，代码文件和测试路径均已列出。
- Type consistency：`AuralisApplication`、`AuralisProperties`、`ApiProblemDetails`、`TraceIdFilter`、`GlobalExceptionHandler`、`ApplicationModules.of(AuralisApplication.class).verify()` 在任务间保持同一包名和接口。
- Scope check：阶段 0 只处理安全备份、契约、骨架和工程门禁；前端迁移、数据库迁移、容器联调、业务身份和 AI/RAG 保留在后续阶段。
