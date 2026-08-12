# Auralis 后端阶段 2A：核心领域实施计划

> 状态：执行中
>
> 范围：在阶段 1 身份与数据隔离基线上，先完成 Subject、KnowledgeBlock、Task 三个核心领域对象的后端闭环；Source、Asset、Relation 作为阶段 2B 继续实施。

## 背景与目标

阶段 2 的现行契约已经确定 Subject、KnowledgeBlock、Task 的字段、归属关系、软删除和乐观版本语义。本阶段 2A 只依据现行 `docs/contracts/`、`docs/modules/Backend.md` 和 `docs/plans/backend-greenfield-rewrite-plan.md`，不恢复任何旧实现、旧路由或旧命名。

完成后，后端应具备以下可验证能力：

- 新用户注册与默认 Subject 在同一事务中完成；默认 Subject 受保护，不允许被普通删除。
- 已认证用户可以创建、读取、分页列出、更新、软删除和恢复自己的 Subject、KnowledgeBlock、Task。
- KnowledgeBlock 和 Task 必须引用同一用户下、未删除的 Subject；跨用户或已删除资源不可被借用。
- 更新、删除、恢复均要求客户端提供 `baseVersion`，版本不匹配返回 `409 RESOURCE_VERSION_CONFLICT`。
- 所有查询和写入均按 SecurityContext 中的用户身份隔离，实体不直接序列化为 API 响应。
- Flyway 使用新增 V2 迁移，不修改已执行的 V1；H2 测试覆盖迁移、约束和核心服务行为。

## 约束与现行契约

- API 统一使用 `/api` 前缀、camelCase JSON、UUID 字符串和 UTC RFC3339 时间。
- 创建成功返回 `201 Created` 与 `Location`；更新返回 `200`；删除返回 `204 No Content`；恢复返回资源表示。
- 列表响应固定为 `{items, nextCursor, hasMore}`，默认只返回未删除资源。
- `userId` 由认证上下文决定，客户端不可覆盖；所有资源使用 `version`、`createdAt`、`updatedAt`、`deletedAt` 共通字段。
- 阶段 2A 不实现同步推送、变更日志、全文检索、文件上传和关系图；这些能力留在主计划的后续任务中。

## 实施顺序

### 任务 1：锁定 V2 数据模型与失败测试

先写测试，确认 H2 能执行 V1+V2，且数据库约束表达现行契约。

涉及文件：

- `Auralis-Server/src/main/resources/db/migration/V2__core_domain_schema.sql`
- `Auralis-Server/src/test/java/com/auralis/app/CoreDomainSchemaTest.java`
- `Auralis-Server/src/test/resources/application-test.properties`（仅在现有配置不足时调整）

V2 计划包含：

- `subjects`：`id`、`user_id`、`name`、`description`、`icon_key`、`color`、`sort_key`、`is_default`、共通字段。
- `knowledge_blocks`：`subject_id`、`title`、`summary`、`content`、`tags`、`color_override`、共通字段。
- `tasks`：`subject_id`、`title`、`description`、`status`、`scheduled_at`、`due_at`、`duration_minutes`、`cognitive_load`、`sort_key`、`color_override`、共通字段。
- 所有外键按用户拥有关系设计并使用 `ON DELETE RESTRICT`；删除采用 `deleted_at`，不物理删除。
- 对状态、认知负荷、版本初始值和必要字段添加数据库约束；增加用户、Subject、更新时间和未删除列表所需索引。

验收：迁移测试通过；跨用户外键、枚举值、负数时长和默认版本等非法写入被数据库拒绝。

### 任务 2：实现持久化模型与用户隔离查询

在测试驱动下新增模块包：

- `com.auralis.app.subject`
- `com.auralis.app.knowledge`
- `com.auralis.app.task`

每个模块内部建立 Entity、Repository、Mapper/DTO 边界。Repository 查询必须显式带 `userId` 和未删除条件，不能提供无用户条件的业务查询方法。跨模块只依赖已公开的 Subject 查询能力，不暴露 JPA Entity。

验收：Repository 测试证明用户 A 无法读写用户 B 的资源；已删除资源不出现在默认列表和 Subject 引用校验中。

### 任务 3：实现版本、软删除、恢复和默认 Subject 领域服务

新增领域服务负责：

- 创建时服务端生成 ID、归属用户和 `version=0`。
- 更新/删除/恢复以 `userId + id + version` 为条件执行原子修改，影响行数为 0 时区分不存在、已删除和版本冲突。
- 默认 Subject 创建使用幂等保护；默认 Subject 删除返回 `MUTATION_REJECTED`。
- KnowledgeBlock/Task 创建或更新时校验 Subject 属于当前用户且未删除。
- 注册流程调用公开的 Subject 初始化能力，并保持与用户创建处于同一事务边界。

验收：服务测试覆盖正常版本递增、旧版本冲突、重复恢复、删除后不可被引用、跨用户 ID 和默认 Subject 保护。

### 任务 4：实现三类资源 HTTP 接口

实现下列接口，方法和请求体严格落到 API 契约：

- Subject：`POST/GET /api/subjects`、`GET/PUT/DELETE /api/subjects/{id}`、`POST /api/subjects/{id}/restore`。
- KnowledgeBlock：`POST/GET /api/knowledge-blocks`、`GET/PUT/DELETE /api/knowledge-blocks/{id}`、`POST /api/knowledge-blocks/{id}/restore`。
- Task：`POST/GET /api/tasks`、`GET/PUT/DELETE /api/tasks/{id}`、`POST /api/tasks/{id}/restore`。

控制器只处理认证、校验、状态码和 DTO 映射；业务规则进入领域服务。所有成功响应使用直接 DTO；错误统一复用 `ApiProblemDetails` 和已有错误码。

验收：MockMvc 集成测试覆盖未认证、正常 CRUD、分页 envelope、跨用户 404、软删除 404/恢复、版本冲突 409、字段校验 400 和默认 Subject 删除拒绝。

### 任务 5：文档、验证与交接

实现完成后同步：

- `docs/contracts/API.md`
- `docs/contracts/Database.md`
- `docs/modules/Backend.md`
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/release/Changelog.md`
- `docs/plans/backend-greenfield-rewrite-plan.md`

运行并记录：

- `Auralis-Server\\.mvnw.cmd -B -ntp clean test`
- `git diff --check`
- 旧包名、旧依赖和旧后端路径扫描
- 若环境具备 PostgreSQL/Docker，再执行真实数据库迁移与启动验证；否则明确标记为未验证。

完成定义：任务 1-5 的代码、测试、契约和状态记录均已落地；阶段 2A 的测试证据完整，Source/Asset/Relation 仍在阶段 2B，不将其写成已完成。

