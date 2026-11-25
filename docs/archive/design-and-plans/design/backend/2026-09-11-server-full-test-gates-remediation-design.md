# Server 全量测试前三类失败修复设计

更新时间：2026-09-11

文档状态：已批准设计，待实施

权威范围：OpenAPI artifact 一致性、Spring Modulith 模块边界、H2 测试数据清理

## 背景与问题界定

当前 `Auralis-Server` 全量测试共 239 项，结果为 1 failure、28 errors。本文只处理其中前三类已定位问题：

1. OpenAPI artifact 与运行时文档不一致，产生 1 个 failure。
2. Spring Modulith 检测到 `ai -> knowledge -> source -> ai` 的模块环，产生 1 个 error。
3. 五组 H2 测试 fixture 删除用户前遗漏 `assets` 等上游数据，触发 `fk_assets_user`，产生 24 个 errors。

剩余 3 个 MinIO / PgVector Testcontainers errors 依赖 Docker 环境，不在本次范围内。修复后若当前机器仍无可用 Docker，全量测试的预期残余结果为 0 failures、3 errors；若 Docker 可用，则应继续验证是否全绿。

## 目标与非目标

### 目标

- 让检入的 OpenAPI JSON 精确反映当前运行时契约。
- 消除 `source` 对 `ai` 模块实现与持久化实体的静态依赖，使 Modulith 依赖图无环。
- 让五组 H2 fixture 按外键逆序可靠清理，恢复测试隔离。
- 保持既有 API 行为、同步事务语义和生产数据约束不变。

### 非目标

- 不修改或放宽生产数据库外键。
- 不通过忽略、排除或放宽规则绕过 `ArchitectureTests`。
- 不把 ingestion 改造成异步事件流程。
- 不改变 Docker/Testcontainers 测试的默认启用策略。
- 不借本次修复改动 Overview、OCR、Provider 或其他业务行为。

## 设计

### 1. OpenAPI artifact 一致性

运行时 `/api/ai/source-overviews` 与 `/api/ai/subject-overviews` 的 POST 接口已声明可选请求头 `X-Overview-Request-Id`，`docs/contracts/API.md` 也已记录该契约；只有检入的 `docs/contracts/openapi/auralis-openapi.json` 缺少这两个参数。

实施时使用仓库现有 `scripts/export-openapi.ps1` 从当前应用上下文重新导出 artifact，不手工拼写 JSON。随后运行 `OpenApiArtifactTests` 与 `scripts/check-openapi.ps1`，确认 artifact、运行时文档和 PC 生成 schema 的检查链保持一致。本项不新增接口，也不改变 DTO 或响应语义。

### 2. Spring Modulith ingestion 边界

当前循环由以下静态依赖构成：

```text
ai -> knowledge -> source -> ai
                         └── ai.ingestion / ai.internal.persistence
```

其中 `SourceService` 只需要提交 ParsedDocument ingestion job；`ParsedDocumentService` 只需要查找或提交 job，并把 `jobId` 放入完成响应。它们不需要 AI 模块的 JPA entity。

在 `com.auralis.app.source` 的公开 API 中新增 source-owned 端口 `ParsedDocumentIngestionPort`，并定义只携带 `UUID id` 的 `IngestionJobReference`。端口提供：

```java
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
```

`IngestionJobService` 实现该端口，在 AI 模块内部继续使用 `IngestionJobEntity` 和 repository，并只在模块边界处映射为 source-owned reference。`SourceService` 与 `ParsedDocumentService` 改为依赖该端口，移除对 `com.auralis.app.ai.*` 的 import。

这会将依赖方向固定为 `ai -> source`：AI 可以实现 source 定义的端口，source 只认识自身契约。端口仍由 Spring 同步注入，方法仍在现有事务调用链中执行，不引入消息延迟、最终一致性或新的失败窗口。

### 3. H2 fixture 外键逆序清理

生产迁移中的 `fk_assets_user ... ON DELETE RESTRICT` 是正确的数据保护约束，问题只在测试 fixture。修复以下五个测试类的清理方法：

- `AuthControllerTests`
- `CoreDomainControllerTests`
- `CoreDomainServiceTests`
- `IdentityRepositoryTests`
- `IdentityServiceTests`

参照仓库中已正常工作的 source/asset relation 测试，注入清理所需 repository，并统一按下列逆外键顺序删除：

```text
source_asset_relations
-> knowledge_blocks
-> sources
-> assets
-> task_blocks
-> subjects
-> refresh_sessions
-> devices
-> users
```

采用 fixture 内的最小修改，不新增通用清理框架；这样可直接复用已验证顺序，并避免把局部回归扩大为测试基础设施重构。

## 测试策略

实施遵循先复现、后修复：

1. 分别运行 `OpenApiArtifactTests`、`ArchitectureTests` 和五个受影响 H2 测试类，保存修复前失败证据。
2. OpenAPI 导出后，验证 artifact test 和 OpenAPI 检查脚本。
3. ingestion 端口替换后，验证 `ArchitectureTests`，并运行覆盖 Source reingest、ParsedDocument complete 和 ingestion job 幂等行为的相关测试。
4. fixture 修改后，重复运行五个测试类，确认不再出现 `fk_assets_user` 或清理顺序错误。
5. 最后运行 Server 全量测试。Docker 不可用时只允许保留已知的 3 个 Testcontainers errors；任何其他 failure/error 都视为本次修复未完成。

## 文档回写

实施完成后按实际变更同步：

- `docs/project/Architecture.md`：记录 source-owned ingestion port 和单向模块依赖。
- `docs/modules/Backend.md`：记录模块边界及验证命令。
- `docs/contracts/openapi/auralis-openapi.json`：由运行时导出更新。
- `docs/current/Status.md`、`docs/current/IssuesAndReview.md`：更新测试门禁状态和 Docker 残余风险。
- `docs/release/Changelog.md`：记录修复。

`docs/contracts/API.md` 已包含请求头契约，若实施过程中未发生接口语义变化则无需改写正文。生产 schema 与外键均不变化，因此 `docs/contracts/Database.md` 不需要变更。

## 验收标准

- `OpenApiArtifactTests` 通过，两个 Overview POST operation 均在 artifact 中包含可选 `X-Overview-Request-Id`。
- `ArchitectureTests` 通过，`source` 源码不再依赖 `ai` 或 `ai.internal`。
- 五个受影响 H2 测试类全部通过，重复执行仍保持隔离。
- Server 全量测试除当前环境明确缺失 Docker 所致的 3 个 Testcontainers errors 外无其他失败。
- 未改变生产外键、API 行为、ingestion 同步事务语义和 Testcontainers 默认策略。
