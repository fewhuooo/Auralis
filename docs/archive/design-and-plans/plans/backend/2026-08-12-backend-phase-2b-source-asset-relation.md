# Auralis 后端阶段 2B：Source、Asset、Relation 实施计划

> 状态：已构建待验收
>
> 范围：在阶段 1 Identity 与阶段 2A Subject/KnowledgeBlock/Task 的现行实现上，完成 Source、Asset、Relation 的后端闭环，并补齐 KnowledgeBlock 的 Source 关联。
>
> 分支：`agent/backend-phase-2b-source-asset-relation`

## 目标与完成定义

本阶段只依据 `docs/contracts/`、`docs/modules/Backend.md` 和 `docs/plans/backend-greenfield-rewrite-plan.md` 实现新 `com.auralis.app` 后端，不恢复旧 Server 的 Asset、FileStorage、BlockRelation 或统一 Result 行为。

完成后应具备以下可验证能力：

- Flyway V3 在 V1/V2 干净 schema 上创建 `assets`、`sources`、`relations`，并把 `knowledge_blocks.source_id` 补为指向 `sources` 的可空外键。
- 认证用户可以创建上传意图、完成上传并获取下载 URL；完成动作由服务端对象存储 HEAD/stat 校验真实对象键、用户前缀、大小、MIME，并按配置校验 sha256。
- 认证用户可以创建、读取、列出、更新、软删除、恢复和请求重摄入自己的 Source。FILE/TEXT/URL 类型的必需数据由领域服务校验；Source 变更和重摄入将摄入状态重置为 `PENDING`。
- KnowledgeBlock 可以引用当前用户拥有且未删除的 Source；跨用户、已删除或不存在的 Source 不可写入或恢复。
- 认证用户可以创建、读取、列出、更新、软删除、恢复自己的 Relation。Relation 端点只能是 SUBJECT、SOURCE、KNOWLEDGE_BLOCK、TASK；两端必须属于同一用户且处于活动状态。
- `RELATED_TO` 按规范化端点顺序去重，其他关系保持方向性；禁止同一节点自关联。端点软删除时，相关 Relation 在同一事务边界内软删除；端点恢复不自动恢复旧 Relation。
- 所有业务查询显式带 userId；更新、删除、恢复使用精确 `baseVersion`；API 只返回显式 DTO，不序列化 Entity。
- H2/Flyway/JPA/MockMvc/Modulith 自动测试通过；PostgreSQL、Docker、真实 MinIO 和人工验收仍明确标记为未验证。

## 约束与实现边界

- API 继续使用 `/api`、camelCase、UUID、UTC RFC3339、直接 DTO、201 + Location、204 删除和统一 Problem Details。
- Asset 是物理对象元数据，不是普通同步资源，也不是 Relation 节点；Source 才是逻辑来源、同步节点和关系节点。
- 当前没有将 MinIO 客户端接入测试环境。实现 `AssetStoragePort`，提供 test profile 的可控内存适配器、非 test 且未启用 MinIO 时的安全不可用适配器，以及配置开启后的 MinIO 适配器。没有真实 MinIO 证据时，不把上传业务写成生产验收完成。
- 本阶段不实现 ingestion worker、Tika 解析、source_chunks/pgvector、change_log、cursor 分页或同步 mutation；Source 的 `reingest` 只建立下一次摄入的 `PENDING` 状态边界。
- 端点删除级联通过 shared 领域事件完成，避免 Subject/Knowledge/Task/Source 反向依赖 Relation 模块；Relation 监听 `ResourceDeletedEvent` 并批量推进相关关系版本和墓碑。

## 实施顺序

### 任务 1：先写失败测试并锁定 V3 数据模型

新增或扩展测试：

- `SourceAssetRelationSchemaTests`：验证 V3 history、`assets`/`sources`/`relations` 表、Source 外键、KnowledgeBlock Source 外键、共同版本/墓碑字段和枚举 CHECK。
- `SourceAssetRelationRepositoryTests`：验证 Asset/Source/Relation 的 userId 查询隔离、活动/墓碑过滤、Relation 端点和关系类型去重查询。

新增 `V3__source_asset_relation_schema.sql`，迁移顺序固定为：

1. `assets`：`id`、`user_id`、`object_key`、`original_name`、`size_bytes`、`mime_type`、`sha256`、`upload_status`、`completed_at`、审计时间；`(user_id, object_key)` 唯一，状态和大小有 CHECK。
2. `sources`：共同同步字段、`type`、`subject_id`、可空 `asset_id`/`origin_url`/`raw_text`/`outline`、`ingestion_status`、安全错误字段；按 user/subject/status/updated 建索引，外键使用 `ON DELETE RESTRICT`。
3. `knowledge_blocks.source_id` 外键：保持可空，指向 `sources(id)`，使用 `ON DELETE RESTRICT`；服务层继续负责同一 userId 和活动状态校验。
4. `relations`：共同同步字段、`source_type/source_id`、`target_type/target_id`、`type`、可空 `label`；数据库只表达节点类型、关系类型、非空端点和版本约束，跨表端点归属由 RelationService 通过公开模块 API 校验。

验收：干净 H2 能执行 `1→2→3`；非法 Source/Asset/Relation 状态、负大小、空端点被数据库拒绝；不修改 V1/V2。

### 任务 2：实现持久化模型与可替换对象存储端口

新增 `source` 模块公开 DTO、命令、视图、枚举、Service、Controller；内部新增 Source/Asset Entity、Repository 和存储适配器。新增 `relation` 模块公开 DTO、命令、视图、枚举、Service、Controller；内部新增 Relation Entity、Repository。

Asset 存储端口至少包含：

- 按服务端生成的 `users/{userId}/assets/{assetId}` object key 创建短期 PUT intent。
- 对指定 object key 执行 HEAD/stat，返回真实 size、MIME 和可选 sha256 metadata。
- 创建短期 GET download URL。

MinIO 适配器只在 `auralis.upload.storage-provider=minio` 时创建；使用 `AURALIS_MINIO_ENDPOINT`、`AURALIS_MINIO_BUCKET`、`AURALIS_MINIO_ACCESS_KEY`、`AURALIS_MINIO_SECRET_KEY` 等配置。测试适配器可显式植入对象元数据，覆盖伪造对象、大小/MIME/sha256 不匹配。

### 任务 3：实现 Source、Asset、Relation 领域服务

Asset：

- `POST /api/assets/upload-intents` 只接受 `baseVersion=0`、合法文件名、正数且不超过配置上限的 size、允许的 MIME 和可选 sha256。
- 创建 intent 时状态为 `UPLOADING`；`complete` 只允许活动的 UPLOADING 资产，HEAD 校验通过后变为 READY，失败返回 `UPLOAD_VALIDATION_FAILED` 并保留安全状态。
- 下载 URL 只允许当前用户拥有且 READY 的资产；Asset 不暴露 object key 给客户端作为可信输入。

Source：

- FILE 必须引用当前用户 READY Asset；TEXT 必须有非空 rawText；URL 必须是合法 `http`/`https` URL；禁止用另一类型的空壳数据绕过校验。
- create/update 使用 `PENDING`，不接受客户端直接写入 ingestionStatus 或安全错误；更新来源内容、Asset 或标题后清理错误并使状态回到 PENDING。
- delete/restore 使用精确版本；delete 发布 `ResourceDeletedEvent(SOURCE, id)`；reingest 只对活动 Source 清理错误并推进版本至 PENDING。

Relation：

- 端点验证通过 SubjectService、SourceService、KnowledgeBlockService、TaskService 的公开活动查询完成，不访问其他模块 internal Entity/Repository。
- 创建/更新/恢复检查两个端点、用户归属、墓碑、自关联和重复；`RELATED_TO` 先按 `(nodeType, nodeId)` 规范化后再查重。
- delete/restore 使用版本规则；监听端点删除事件并批量软删除关系，恢复端点不发布恢复事件。

### 任务 4：接入 KnowledgeBlock 与删除事件

- 将 KnowledgeBlockService 的 Source 预留拒绝逻辑改为调用 SourceService 的活动归属校验。
- Source delete、Subject delete、KnowledgeBlock delete、Task delete 均发布 shared `ResourceDeletedEvent`；Relation 监听并验证级联墓碑、版本递增和跨用户隔离。
- 保持现有阶段 2A 的默认 Subject 保护、Subject/Source 引用校验和 `ON DELETE RESTRICT` 清理顺序。

### 任务 5：HTTP 测试、契约回写与全量验证

新增 `SourceAssetRelationServiceTests`、`SourceAssetRelationControllerTests`，覆盖：

- 未认证访问 401；创建/列表/详情/更新/删除/恢复的成功状态码与 Location。
- Source 三类型校验、Asset READY 前后关联、重摄入、版本冲突和跨用户 404。
- Asset intent、完成时对象 HEAD 校验、伪造 object/大小/MIME/sha256、READY 下载 URL 和跨用户隔离。
- Relation 跨用户端点、已删除端点、自关联、RELATED_TO 反向重复、定向关系方向性、版本冲突和端点删除级联。
- KnowledgeBlock 创建/更新/恢复的 Source 归属和墓碑规则。

完成代码后同步：

- `docs/contracts/API.md`
- `docs/contracts/Database.md`
- `docs/contracts/ObjectModelMatrix.md`
- `docs/modules/Backend.md`
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/release/Changelog.md`
- `docs/plans/backend-greenfield-rewrite-plan.md`

验证命令：

```text
Auralis-Server\\mvnw.cmd -B -ntp clean test
git diff --check
```

并执行旧包名、旧依赖和旧后端路径扫描；若未启动 PostgreSQL/MinIO，只记录 H2/JPA/MockMvc/架构证据，不关闭 Docker/MinIO/人工验收风险。

## 交接检查点

- 检查点 A：V3 迁移和失败测试完成后再写 Entity/Repository。
- 检查点 B：Entity/Repository 测试通过后再写领域服务和 Controller。
- 检查点 C：Source/Asset/Relation 服务与 MockMvc 测试通过后再回写契约和状态。
- 检查点 D：全量测试、diff 检查和架构验证通过后才可声明“阶段 2B 已构建待验收”；不得写成 PostgreSQL/MinIO/人工验收已完成。
