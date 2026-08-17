# Auralis 后端绿地重写完整实施计划

更新时间：2026-08-16

文档状态：现行计划，已批准；阶段 0/1/2A/2B/3/4/5 后端基线已构建待外部验收，客户端契约迁移尚未开始

权威范围：Auralis 后端从零重写的范围、架构决策、领域模型、API、同步协议、安全、AI/RAG、实施批次、测试、验收、风险与交接要求

事实来源：用户在 2026-08-12 的明确决策、当前 PC/Mobile/Tablet/Server 代码盘点、现行模块与契约文档

## 1. 文档定位与执行规则

本文是 Auralis 后端绿地重写的唯一详细实施计划。执行 Agent 必须从本文开始，再按 `AGENTS.md` 和 `docs/agent/BeforeCoding.md` 阅读对应权威文档。

本计划落盘本身不代表后端已经开始重写。当前阶段只确认目标和实施顺序；只有发生实际代码、配置、数据或部署变化后，才能更新相应模块、契约和发布状态。

执行期间必须遵守以下规则：

- 不从 `docs/archive/`、`docs/showcase/` 或旧 StudyCore 材料恢复实现。
- 不复用旧 Server 的 Controller、Entity、Service、Repository、DDL、配置和依赖声明。
- 旧 Server 只可用于核对已有业务能力和发现前端依赖，不作为新代码模板。
- 每个阶段独立保持可编译、可启动、可查看 OpenAPI。
- 代码存在、构建通过、自动测试通过、容器联调通过和业务验收通过必须分别记录。
- 任何接口变化同步 `docs/contracts/API.md`；任何表、字段或同步语义变化同步 `docs/contracts/Database.md`。
- 任何状态或风险变化同步 `docs/current/Status.md` 和 `docs/current/IssuesAndReview.md`。
- 计划决策需要改变时，先修改本文，再修改实现，不允许代码先行后静默偏离计划。

## 2. 重写目标

在原路径 `D:\CodeBase\Active\Auralis\Auralis-Server` 内建立全新的模块化单体后端，为 PC、Mobile 和后续 Tablet 云能力提供统一、可生成客户端、可离线同步、严格用户隔离的服务端契约。

目标包括：

1. 统一 User/Auth、Subject、Source/Asset、KnowledgeBlock、Task、Relation 和 Review 的服务端对象定义。
2. 以服务器版本和变更游标为权威，实现可诊断、幂等、带冲突返回的离线优先同步。
3. 建立版本化数据库迁移、显式 DTO、标准错误、OpenAPI 和可执行自动测试。
4. 将文件对象、逻辑来源和 RAG 索引拆分，避免文件路径、文件名、对象键和业务来源继续混用。
5. 将 AI 供应商隔离在 AI 模块中，保留服务端默认模型和用户 BYOK 两种路径。
6. 用 PostgreSQL + pgvector 替代 Milvus，用数据库任务和事件替代第一阶段的 Redis 依赖。
7. 分阶段交付，每个阶段都形成可以继续开发和验证的稳定基线。

## 3. 范围边界

### 3.1 本轮包含

- 全新的 `Auralis-Server` Maven 工程。
- Identity、Subject、Source/Asset、Knowledge、Task、Relation、Review、Sync、Stats、Realtime、AI/RAG 模块。
- PostgreSQL、pgvector、MinIO 基础设施。
- Flyway 初始结构和后续版本迁移。
- `/api` REST 接口、POST + SSE AI 流和 `/ws/events` 实时提示。
- OpenAPI、测试、Docker Compose、配置校验和后端权威文档。
- 页面对象差异矩阵和后续前端类型生成输入。

### 3.2 本轮不包含

- 旧 PostgreSQL、MinIO、Milvus 数据迁移。
- 旧接口 DTO、统一 `Result`、错误码或行为兼容层。
- 本轮后端建设期间同步改造 PC、Mobile、Tablet 页面。
- Tablet `NoteDocument`、笔迹 stroke、页面快照和无限画布的云同步实现。
- 多实例部署、分布式缓存、消息队列和共享 WebSocket ticket 存储。
- 自动把解析文档转换为正式 KnowledgeBlock。
- 让 AI 建议接口直接修改任务、知识块或日程。

### 3.3 兼容性结论

- 保留工程目录名 `Auralis-Server`。
- REST 继续使用 `/api` 前缀，不增加 `/v1`。
- 只保留路径总前缀，不承诺兼容原 `/api` 下的子路径、请求、响应、状态码或业务行为。
- 前端在新 OpenAPI 稳定后单独迁移；迁移完成前，旧前端和新后端不能被描述为已经联调可用。
- 开发环境旧业务数据允许全部清空，不提供转换脚本、双写或回滚到旧 schema 的能力。

## 4. 替换前安全措施

开始实施前必须按顺序完成：

1. 运行 `git status --short`，记录整个仓库的已跟踪和未跟踪修改。
2. 记录当前 Server 文件清单、Maven 依赖、配置文件、数据库脚本和容器服务。
3. 将 `Auralis-Server` 的二进制 Git 补丁、未跟踪文件清单和完整压缩包保存到仓库外的 `D:\CodeBase\Active\Auralis-backups\<timestamp>`。
4. 验证补丁非空时可读取、压缩包可列出内容、备份路径不在待删除目录中。
5. 解析待替换目录的绝对路径，必须严格等于 `D:\CodeBase\Active\Auralis\Auralis-Server`。
6. 仅替换该目录；禁止删除仓库根目录、前端、文档或其他未提交内容。
7. 禁止执行 `git reset --hard`、`git checkout --` 或任何通过 Git 还原用户工作树的操作。

备份的用途是灾难恢复和历史核对，不代表新代码可以从备份复制旧实现。

## 5. 技术基线

| 领域 | 选型 | 约束 |
| --- | --- | --- |
| 语言 | Java 21 | 使用 LTS，不依赖预览特性 |
| 应用框架 | Spring Boot 4.1 | 统一依赖管理，不混用旧 Boot 3 配置 |
| 模块边界 | Spring Modulith 2.1 | 自动验证循环依赖和内部包访问 |
| 构建 | Maven Wrapper + Maven | Wrapper 版本提交仓库，CI 与本地一致 |
| 持久化 | Spring Data JPA | Entity 不直接作为 API DTO |
| 迁移 | Flyway | 禁止运行时手写 DDL和自动建表 |
| 数据库 | PostgreSQL 17 + pgvector | 时间使用 `TIMESTAMPTZ`，向量固定 1024 维 |
| 对象存储 | MinIO | 客户端预签名直传，服务端完成校验 |
| 安全 | Spring Security | access JWT + 数据库 refresh session |
| API | Spring MVC + springdoc OpenAPI | REST、Problem Details、cursor 分页 |
| AI | LangChain4j Boot 4 集成 | 供应商实现通过端口隔离 |
| 文档解析 | Apache Tika | 限制类型、大小、超时和解析资源 |
| 测试 | JUnit、MockMvc、Testcontainers、WireMock | 开发期快速测试，完成功能后补齐综合测试 |

Spring Modulith 的模块验证必须纳入自动测试，用于阻止循环依赖和非法内部访问：[Spring Modulith 验证文档](https://docs.spring.io/spring-modulith/reference/verification.html)。

新工程移除 MyBatis Plus、运行时 DDL、Redis、Milvus、etcd、旧 JJWT 配置、硬编码 secret、统一 `Result` 和 `encryptedPayload`。

## 6. 模块化单体设计

基础包名固定为 `com.auralis.app`：

| 模块 | 责任 | 可公开能力 |
| --- | --- | --- |
| `identity` | 用户、密码、JWT、refresh session、设备 | 当前用户、会话验证、设备撤销 |
| `subject` | 学科和默认“未分类”学科 | Subject 查询和归属验证 |
| `source` | Source、Asset、MinIO、解析任务 | 来源查询、上传完成、摄入状态 |
| `knowledge` | KnowledgeBlock | CRUD、归属查询、内容读取 |
| `task` | Task | CRUD、状态和排期 |
| `relation` | 通用跨对象关系 | 关系 CRUD、端点验证编排 |
| `review` | ReviewState、ReviewEvent、FSRS | 到期项、评分、历史 |
| `sync` | Device、mutation、change log、snapshot、墓碑 | push、pull、snapshot |
| `ai` | 模型配置、BYOK、对话、RAG、AI 建议 | 对话流、检索、建议 |
| `stats` | 统计读取模型 | overview、weekly 等强类型 DTO |
| `realtime` | WebSocket ticket 和事件提示 | 连接授权、用户级事件 |
| `shared` | 错误模型、时钟、ID、分页等最小公共设施 | 无业务 Entity 或 Repository |

每个模块使用包可见或 `internal` 子包隐藏 Entity、Repository 和实现类，只通过模块根公开 API、显式 DTO 或领域事件协作。禁止为了绕开 Modulith 验证而把实现类全部声明为公共 API。

跨模块同步调用只用于当前事务必须完成的校验；非关键后续处理通过领域事件和数据库 outbox 执行。第一版仍是单进程消费，但事件表和处理幂等键必须保留未来横向扩展能力。

## 7. 统一对象与接口规则

- API 字段使用 camelCase，数据库字段使用 snake_case。
- ID 统一使用 UUID 字符串。客户端可以生成 UUIDv7，缺省时服务器生成 UUIDv7。
- API 时间使用 RFC 3339 UTC，例如 `2026-08-12T08:30:00Z`。
- 数据库时间使用 `TIMESTAMPTZ`。
- 空值使用 JSON null，不使用空字符串、`0` 或特殊文案代替。
- 所有离线可同步资源包含 `version`、`createdAt`、`updatedAt`、`deletedAt`。
- `version` 由 JPA `@Version` 管理，对外作为非负整数。
- `userId` 仅从 `SecurityContext` 推导，不进入资源创建或更新请求。
- Entity、JPA lazy proxy 和内部枚举不得直接序列化到 API。
- 创建、更新、删除、恢复分别使用显式请求 DTO。
- 更新、删除和恢复必须提供 `baseVersion`；创建使用 `baseVersion = 0`。
- 计数、相对时间、掌握度、负载文案、展示颜色回退等派生值只出现在读取 DTO。
- 列表排序必须有稳定的次级 ID 排序，防止 cursor 分页漏项或重复。

## 8. 数据库总体设计

Flyway 是唯一 schema 权威。首个迁移创建干净 schema，不接管或识别旧表；开发环境启动前由人工确认删除旧 volume 或使用新的数据库名。

### 8.1 表清单

| 表 | 主要用途 | 关键约束/索引 |
| --- | --- | --- |
| `users` | 用户账号 | 规范化 username 唯一；status 索引 |
| `refresh_sessions` | refresh token 链和设备会话 | token_hash 唯一；user/expiry/revoked 索引 |
| `devices` | 离线设备与最后同步状态 | `(user_id, device_id)` 唯一 |
| `subjects` | 学科 | 活跃记录按用户名称唯一；默认学科保护 |
| `assets` | MinIO 物理对象 | `(user_id, object_key)` 唯一；status 索引 |
| `sources` | 逻辑来源 | user/subject/status/updated 索引 |
| `knowledge_blocks` | 知识内容 | user/subject/source/updated 索引 |
| `tasks` | 任务与排期 | user/status/scheduled/due 索引 |
| `relations` | 跨对象关系 | 端点和类型检查；定向/无向去重 |
| `review_parameter_sets` | FSRS 参数版本 | scheduler/version 唯一 |
| `review_states` | 每个知识块当前复习状态 | knowledge_block_id 唯一；user/due 索引 |
| `review_events` | 不可变复习历史 | `(user_id, client_event_id)` 唯一 |
| `change_log` | 用户增量同步日志 | BIGSERIAL cursor；`(user_id, cursor)` 索引 |
| `inbound_mutations` | push 幂等结果 | `(user_id, device_id, client_mutation_id)` 唯一 |
| `domain_event_outbox` | 数据库事件 | status/available_at 索引；幂等消费 |
| `ingestion_jobs` | 文档解析与索引任务 | status/available_at/lease 索引 |
| `source_chunks` | RAG 文本块和 vector(1024) | user/source/generation/ordinal 唯一；active generation 查询索引；HNSW 向量索引 |
| `ai_credentials` | 用户 BYOK | `(user_id, provider)` 唯一；只存密文 |
| `conversations` | AI 会话 | user/updated/deleted 索引 |
| `messages` | AI 消息 | conversation/sequence 唯一 |

### 8.2 共同字段和约束

Subject、Source、KnowledgeBlock、Task、Relation 等同步资源至少包含：

```text
id UUID primary key
user_id UUID not null references users(id)
version BIGINT not null
created_at TIMESTAMPTZ not null
updated_at TIMESTAMPTZ not null
deleted_at TIMESTAMPTZ null
```

数据库枚举优先使用受 CHECK 约束的 `VARCHAR`，避免 PostgreSQL enum 难以演进。JSONB 只用于标签、大纲、引用、状态快照等结构化扩展，不用于隐藏本应规范化的核心所有权和状态字段。

## 9. 核心领域模型

### 9.1 User、Device 与 RefreshSession

`User` 保存 `username`、`normalizedUsername`、`passwordHash`、`displayName`、`avatarUrl`、`status` 和审计时间。用户名规范化后唯一；接口不返回 password hash。

`Device` 保存客户端稳定 deviceId、名称、平台、最后活动时间、最后 pull cursor 和撤销时间。deviceId 由客户端生成，但只在当前用户域内唯一。

`RefreshSession` 保存用户、设备、token hash、创建/过期/轮换/撤销时间、替代 session 和最后使用时间。Access JWT 有效期 15 分钟，refresh session 有效期 30 天。每次刷新执行 rotation；旧 refresh token 再次出现时，判定为重放并撤销该 rotation 链。

### 9.2 Subject

Subject 保存名称、说明、`iconKey`、颜色和 `sortKey`。注册用户时在同一事务创建受保护的“未分类”Subject。Source、KnowledgeBlock 和 Task 必须属于 Subject；创建时未提供 subjectId 则服务端填入默认学科。

默认学科可以重命名展示字段，但不能删除；若产品后续要求名称固定，再通过计划和契约变更收紧。

### 9.3 Asset 与 Source

Asset 是 MinIO 物理对象，保存 `objectKey`、`originalName`、`sizeBytes`、`mimeType`、`sha256`、`uploadStatus`、`completedAt`。状态至少包括 `UPLOADING`、`READY`、`FAILED`、`ORPHANED`。

Source 是用户可见的逻辑来源，类型为 `FILE`、`TEXT` 或 `URL`，保存 Subject、标题、可选 Asset、可选 `originUrl`、可选原始文本、大纲 JSON、`ingestionStatus`、安全错误码和安全错误说明。状态至少包括 `PENDING`、`PARSING`、`INDEXING`、`READY`、`FAILED`。

Asset 不作为 Relation 节点，不进入普通离线 mutation；Source 才是同步和关系中的文件/来源节点。

### 9.4 KnowledgeBlock

KnowledgeBlock 保存 Subject、可选 Source、标题、摘要、完整 `content`、标签和可选颜色覆盖。`content` 是业务正文权威，不能只存 preview。

不持久化 `time` 相对文案、掌握度百分比、difficulty 文案、`relatedBlockIds` 或拼接到正文中的关系标记。

### 9.5 Task

Task 保存 Subject、标题、说明、状态、`scheduledAt`、`dueAt`、`durationMinutes`、`cognitiveLoad`、`sortKey` 和可选颜色覆盖。

状态固定为 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`。排期与状态独立：拥有 scheduledAt 不自动变成另一种状态。`cognitiveLoad` 使用稳定代码，例如 `LOW`、`MEDIUM`、`HIGH`，展示文案由客户端或读取 DTO 派生。

复习状态不属于 Task；删除 `pending`、`scheduled`、`completed`、`learning`、`to_review` 等混合前端状态作为后端枚举的可能性。

### 9.6 Relation

Relation 节点仅允许 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`、`TASK`，关系类型固定为：

- `CONTAINS`
- `REFERENCES`
- `DERIVED_FROM`
- `DEPENDS_ON`
- `RELATED_TO`

记录保存 sourceType/sourceId、targetType/targetId、type、可选 label、版本和墓碑字段。

创建或恢复关系必须验证两端存在、属于当前用户且未删除；禁止相同 type 下的非法自关联。`RELATED_TO` 按规范化端点顺序作为无向关系去重，其他类型保持方向性。跨表端点由 Relation 服务通过各模块公开查询端口校验；数据库使用节点类型 CHECK、端点列非空和唯一索引阻止明显重复。

### 9.7 Review

`ReviewState` 保存 KnowledgeBlock 当前调度状态：difficulty、stability、dueAt、lastReviewedAt、reps、lapses、schedulerVersion、parameterSetId 和版本。

`ReviewEvent` 是不可变历史，保存 clientEventId、`AGAIN`/`HARD`/`GOOD`/`EASY`/`SKIP`、复习时间、耗时、算法版本、参数版本以及调度前后快照。`SKIP` 只写事件，不改变 ReviewState。

FSRS 参数集不可原地覆盖。新参数创建新版本，历史事件保留原参数版本。掌握度根据 retrievability 派生，只作为读取 DTO 返回。

### 9.8 Conversation 与 Message

Conversation 保存用户、标题、可选 Subject/Source 检索范围、模型配置快照、状态和软删除时间。Message 保存角色、正文、引用、模型、token 使用量、sequence、状态和错误码。

用户删除会话时先软删除；保留期结束后由清理任务删除消息及相关非共享数据。

## 10. REST API 规范

所有业务接口直接位于 `/api`。不使用统一 Result 包装；成功时直接返回 DTO，创建返回 201 和 Location，成功删除返回 204。

### 10.1 路由总览

| 模块 | 主要路径 |
| --- | --- |
| Auth | `/api/auth/register`、`/login`、`/refresh`、`/logout`、`/me`、`/sessions` |
| Subject | `/api/subjects`、`/api/subjects/{id}`、`/{id}/restore` |
| Asset | `/api/assets/upload-intents`、`/api/assets/{id}/complete`、`/{id}/download-url` |
| Source | `/api/sources`、`/api/sources/{id}`、`/{id}/restore`、`/{id}/reingest` |
| Knowledge | `/api/knowledge-blocks`、`/api/knowledge-blocks/{id}`、`/{id}/restore` |
| Task | `/api/tasks`、`/api/tasks/{id}`、`/{id}/restore` |
| Relation | `/api/relations`、`/api/relations/{id}`、`/{id}/restore` |
| Review | `/api/reviews/due`、`/events`、`/history` |
| Stats | `/api/stats/overview`、`/weekly` |
| Sync | `/api/sync/push`、`/pull`、`/snapshot` |
| AI | `/api/ai/settings`、`/conversations`、`/messages/stream`、建议类接口 |
| Realtime | `/api/realtime/ticket` |

### 10.2 分页、过滤和并发控制

列表统一使用 cursor 分页：

```json
{
  "items": [],
  "nextCursor": "123",
  "hasMore": true
}
```

cursor 是不透明字符串；客户端不得解析。limit 具有服务端默认值和最大值。删除记录默认不进入普通列表，只能通过显式 includeDeleted 或同步接口读取必要墓碑。

更新、删除和恢复请求必须包含 `baseVersion`。版本不匹配返回 HTTP 409 和服务器当前 DTO；服务器不执行 last-write-wins。

### 10.3 标准错误

错误统一使用 RFC Problem Details，并增加 `code`、`traceId` 和 `fieldErrors`：

```json
{
  "type": "https://auralis.app/problems/version-conflict",
  "title": "Version conflict",
  "status": 409,
  "detail": "Resource has been changed",
  "instance": "/api/tasks/018f...",
  "code": "RESOURCE_VERSION_CONFLICT",
  "traceId": "0af7...",
  "fieldErrors": []
}
```

错误码至少覆盖参数校验、未认证、无权限、资源不存在、资源已删除、版本冲突、mutation 拒绝、上传校验失败、解析失败、模型不可用和限流。响应不得包含 Java 异常消息、SQL、主机文件路径、密钥或堆栈。

## 11. 认证与安全

认证接口包含注册、登录、refresh、logout、当前用户、设备会话列表、撤销单个会话和撤销其他全部会话。

安全基线：

- 密码使用 Spring Security 推荐 PasswordEncoder，编码标识随 hash 保存以支持未来升级。
- JWT 签名密钥、BYOK 主密钥和服务端模型密钥全部来自环境变量。
- access JWT 只包含最小 subject、session/device 标识、签发和过期信息。
- refresh token 只保存不可逆 hash；原值只在签发响应中出现一次。
- 登录失败对未知用户和错误密码返回相同外部错误。
- 所有业务 Repository 查询必须包含当前 userId；仅在 Service 层后过滤不被接受。
- Relation、Sync、WebSocket、RAG、统计和后台任务必须执行相同租户隔离。
- 默认 CORS 拒绝未知来源，生产白名单来自配置。
- 日志过滤 Authorization、Cookie、refresh token、BYOK key、完整提示词和完整模型回复。
- 文件名、MIME、URL、Markdown 和模型输出都作为不可信输入处理。

## 12. 文件上传和生命周期

1. 客户端调用 `POST /api/assets/upload-intents`，提交 originalName、sizeBytes、mimeType 和可选 sha256。
2. 服务端创建 `UPLOADING` Asset，生成用户前缀 objectKey，返回短期预签名 PUT URL、必要请求头和过期时间。
3. 客户端直接上传 MinIO。
4. 客户端调用 `POST /api/assets/{id}/complete`。
5. 服务端通过 HEAD 校验对象存在、objectKey、用户前缀、真实大小和允许的 MIME；配置要求时校验 sha256。
6. 校验成功后 Asset 进入 `READY`，客户端再创建或更新 Source。
7. FILE Source 创建后提交 ingestion job。
8. 下载通过 `/api/assets/{id}/download-url` 返回短期预签名 GET URL。

预签名 URL 过期、校验失败或长期未完成时，Asset 标记失败或 orphan。定时任务回收过期上传。Source 墓碑满 30 天后，幂等删除专属 Asset、source_chunks 和未完成任务；共享 Asset 如果未来被允许，必须先有引用计数设计，第一版不支持共享。

## 13. 离线同步协议

### 13.1 Push

`POST /api/sync/push` 请求：

```json
{
  "deviceId": "0191...",
  "batchId": "0192...",
  "mutations": [
    {
      "clientMutationId": "0193...",
      "entityType": "TASK",
      "entityId": "0194...",
      "operation": "UPDATE",
      "baseVersion": 3,
      "payload": {},
      "occurredAt": "2026-08-12T08:30:00Z"
    }
  ]
}
```

首批 entityType 支持 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`、`TASK`、`RELATION`；operation 支持 `CREATE`、`UPDATE`、`DELETE`、`RESTORE`。

数据库对 `(user_id, device_id, client_mutation_id)` 建唯一约束。每条 mutation 按请求顺序在独立事务中执行，单条失败不回滚已完成的其他条目。结果为：

- `APPLIED`：成功执行，返回 entityVersion 和 change cursor。
- `DUPLICATE`：相同幂等键已执行，返回首次持久化的结果。
- `CONFLICT`：baseVersion 不匹配，返回当前服务器 DTO 和版本。
- `REJECTED`：请求无效、违反领域规则或引用对象不可用，返回稳定 code 和安全 detail。

CREATE 必须使用 `baseVersion = 0`。UPDATE、DELETE、RESTORE 必须精确匹配当前版本。`occurredAt` 只作审计信息，不能决定服务器写入顺序。

### 13.2 Pull

`GET /api/sync/pull?afterCursor=<cursor>&limit=<limit>`：

- limit 默认 200，最大 500。
- cursor 使用十进制字符串传输，避免 JavaScript 数字精度问题。
- 返回 `changes`、`nextCursor`、`hasMore` 和 `resetRequired`。
- REST 直接写入和 Sync push 写入走相同领域命令并记录 change log。
- payload 是相应资源的稳定同步 DTO，不序列化 JPA Entity。

### 13.3 Snapshot

`GET /api/sync/snapshot` 返回当前用户 Subject、Source、KnowledgeBlock、Task、Relation 的一致性快照、必要墓碑和 `snapshotCursor`。实现必须在可重复读事务或等价一致性策略中确定 cursor 和数据视图。客户端应用快照后从 snapshotCursor 增量拉取。

### 13.4 墓碑和重同步

- 可同步资源软删除并产生 tombstone。
- tombstone、change log 和 inbound mutation 结果至少保留 30 天。
- 删除端点对象时，同一事务软删除相关 Relation。
- 恢复端点对象不自动恢复旧 Relation，避免意外重建已过时图关系。
- 游标早于保留窗口时，pull 返回 `resetRequired = true`，不返回不完整增量。
- 超过 30 天未同步的设备必须执行完整 snapshot。
- 清理任务按用户和批次幂等运行，删除前再次检查保留期和引用。

## 14. 实时事件

- `POST /api/realtime/ticket` 签发 60 秒有效、单次使用、绑定当前用户和 refresh session 的 ticket。
- WebSocket 地址固定为 `/ws/events`。
- ticket 第一版存储于单实例 Caffeine；公开接口保持可替换，未来多实例改为共享存储。
- WebSocket 不传输完整业务实体，只发送 `SYNC_CURSOR_AVAILABLE`、`SOURCE_STATUS_CHANGED`、`INGESTION_JOB_CHANGED`、`AI_MESSAGE_COMPLETED` 等提示。
- 客户端收到提示后通过 `/api` 拉取权威数据。
- 每个事件必须带 eventId、type、occurredAt 和最小定位信息，禁止包含其他用户内容。
- 连接、订阅、后台发布和断线清理都必须按 userId 隔离，禁止全局广播业务事件。

## 15. AI、BYOK 与 RAG

LangChain4j 使用兼容 Spring Boot 4 的 starter，并通过 AI 模块端口隔离供应商实现：[LangChain4j Spring Boot 集成](https://docs.langchain4j.dev/tutorials/spring-boot-integration/)。

### 15.1 模型策略

- 服务端默认聊天供应商为 DeepSeek。
- 默认模型名为 `deepseek-v4-flash`，允许通过生产环境变量覆盖。
- 用户可配置 OpenAI-compatible BYOK。
- BYOK 只替换聊天模型，不替换 Embedding。
- 用户未配置、禁用或凭据失效时回退服务端默认聊天模型；回退行为必须在响应 metadata 中可诊断，但不得暴露密钥。
- 外部调用必须配置连接、读取和总体超时、有限重试以及可区分的供应商错误码。

### 15.2 BYOK 安全

- 密钥使用 AES-256-GCM 加密，保存 nonce、ciphertext、tag 和 master key version。
- master key 由环境变量注入，接口永不返回已保存的明文 key。
- 更新凭据时用新值覆盖并重新加密；删除时立即失效并在事务后清理密文。
- base URL 必须是管理员 allowlist 中的公共 HTTPS 地址。
- 解析 DNS 后阻止 loopback、link-local、RFC1918、ULA、元数据地址和保留网段。
- 禁止自动跟随到非 HTTPS 或私网的重定向；每次连接都重新校验解析结果，降低 DNS rebinding 风险。
- 开发环境只有显式 `AURALIS_AI_ALLOW_PRIVATE_ENDPOINTS=true` 才允许本地模型，生产 profile 拒绝该配置。

### 15.3 Embedding 和 pgvector

- Embedding 供应商固定为 SiliconFlow。
- 模型固定为 BGE-M3，维度固定 1024。
- Flyway 创建 vector extension、`source_chunks` 和向量索引。
- LangChain4j 配置为不自动建表。[pgvector 集成文档](https://github.com/langchain4j/langchain4j/blob/main/docs/docs/integrations/embedding-stores/pgvector.md)
- 检索 SQL 必须先过滤 userId，再应用可选 Subject/Source 范围和相似度排序。
- 更换模型或维度视为数据迁移，必须创建新索引版本并重建 embedding，禁止原地混用不同维度。

### 15.4 文件解析和摄入任务

- Apache Tika 支持 PDF、DOCX、PPTX、TXT、Markdown。
- 默认文件上限 50 MB；压缩炸弹、超大页数、超时和空文本必须形成稳定失败状态。
- 解析和索引用于 RAG，不自动创建正式 KnowledgeBlock。
- `ingestion_jobs` 保存状态、attempt、maxAttempts、availableAt、leaseOwner、leaseUntil、errorCode 和安全 errorDetail。
- 单实例定时 worker 使用数据库租约领取任务；任务必须幂等，重复执行不会生成重复 chunk。
- Source 更新正文或文件后创建新 ingestion generation；新 generation 完成后原子切换为 active，再清理旧 chunk。

### 15.5 对话和建议接口

- Conversation 和 Message 持久化，消息顺序由服务端 sequence 保证。
- RAG 查询必须限定当前用户，可选限定 Subject 或 Source。
- citation 返回 sourceId、chunkId、页码或位置和短 excerpt。
- 流式回复使用 POST + SSE，事件为 `token`、`citation`、`complete`、`error`。
- 客户端断流不删除已生成消息；服务端记录最终状态，客户端可重新获取。
- 任务提取、手写转 Markdown、日程建议返回强类型 suggestion DTO，不直接写入业务领域。

## 16. 页面对象差异矩阵

实施阶段新增 `docs/contracts/ObjectModelMatrix.md`，按页面、Store、本地数据库、旧 Server、新模型五个维度记录 Subject、Source/Asset、KnowledgeBlock、Task、Relation、User/Auth 和 Tablet NoteDocument 的差异。

必须固化以下结论：

- PC KnowledgeBlock 类型存在 `content`，但本地数据库没有完整持久化，存在静默丢失风险。
- Mobile 数据库读写同步字段，但 TypeScript 类型遗漏 `syncVersion` 和删除字段。
- KnowledgeBlock `time` 混用 ISO、地区字符串、时分和相对文案；新契约只保留时间戳和读取派生字段。
- Task 多套状态统一为 TODO、IN_PROGRESS、DONE、CANCELLED；duration 统一为分钟。
- Task `position` 只表示排序键，不再兼作星期编码；`loadText` 不进入业务实体。
- SourceFile 当前混用本地路径、文件名、MinIO objectName、MIME 和展示类型；新模型拆分 Asset 与 Source。
- Relation 当前存在实体、relatedBlockIds、任务描述标记和临时图边四种表达；新后端统一为 Relation。
- User/Auth 中的 `any` 由 OpenAPI 生成类型替代。
- 前端本地业务库在后续接入时必须按 userId 分区，防止账户切换读取上一账号数据。
- Tablet NoteDocument 包含 stroke、snapshot、viewport 和多存储路径，后续作为独立同步模块设计。

## 17. 配置、部署与可观测性

### 17.1 配置来源

生产环境至少要求：

| 配置 | 环境变量 |
| --- | --- |
| PostgreSQL | `SPRING_DATASOURCE_URL`、`SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD` |
| MinIO | `AURALIS_MINIO_ENDPOINT`、`AURALIS_MINIO_BUCKET`、`AURALIS_MINIO_ACCESS_KEY`、`AURALIS_MINIO_SECRET_KEY` |
| JWT | `AURALIS_JWT_SIGNING_KEY`、可选 key id |
| BYOK 加密 | `AURALIS_BYOK_MASTER_KEY`、`AURALIS_BYOK_MASTER_KEY_VERSION` |
| DeepSeek | `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` |
| SiliconFlow | `SILICONFLOW_API_KEY`、`SILICONFLOW_BASE_URL`、`SILICONFLOW_EMBEDDING_MODEL` |
| Web/CORS | `AURALIS_ALLOWED_ORIGINS` |
| 上传与任务 | 文件上限、URL 有效期、worker 并发、任务超时和重试次数 |

`application.yml` 只提供无秘密的安全默认值。local profile 可提供本机地址，但不能提交真实密钥。prod profile 对关键配置执行 fail-fast 校验；不允许 JWT secret、默认密码或 AI key 缺失后降级为硬编码值。

### 17.2 Compose 拓扑

最终 Compose 仅包含：

- PostgreSQL + pgvector。
- MinIO。
- Auralis Server。

Redis、Milvus、etcd 和 pgAdmin 不属于最小生产拓扑。开发工具如 pgAdmin 必须放在可选 profile，不与默认服务一起启动。镜像必须固定版本或 digest，volume 名称与旧栈区分，防止误挂载旧数据。

### 17.3 健康检查与日志

- `/actuator/health/liveness` 只检查进程存活。
- `/actuator/health/readiness` 检查数据库、Flyway 状态和必要依赖；外部 AI 供应商不作为启动硬阻塞。
- 使用结构化日志，字段至少包含 timestamp、level、traceId、requestId、userIdHash、module、code 和 latency。
- userId 只记录不可逆或部署期加盐的诊断值，避免日志直接暴露账号标识。
- 指标覆盖 HTTP 延迟/错误率、认证失败、同步 mutation 结果、任务积压、解析耗时、AI 调用耗时/错误和向量检索耗时。
- 所有后台任务必须有成功、失败、重试、死信或最终失败的可观测状态。

## 18. 分阶段实施

### 阶段 0：备份、契约和全新骨架

任务：

- 完成第 4 节的旧目录安全备份。
- 完成对象差异矩阵和首版 OpenAPI/数据库设计。
- 精确替换 `Auralis-Server`，创建全新 Maven 工程和 `com.auralis.app` 包。
- 建立配置绑定、健康检查、Problem Details、OpenAPI 和 Modulith 边界测试。

退出条件：工程可编译、应用可启动、健康检查和 OpenAPI 可访问；旧后端未被引用为编译依赖。

### 阶段 1：身份与数据库基础

任务：

- 创建 Flyway V1 schema 和基础审计支持。
- 实现 User、RefreshSession、Device。
- 实现注册、登录、refresh rotation、退出、当前用户和会话撤销。
- 建立 Repository 级用户隔离和标准安全错误。

退出条件：完整身份链路可用；过期、撤销、重复 refresh 和跨用户会话访问被测试拒绝。

### 阶段 2：核心领域与文件

任务：

- 实现 Subject 及默认“未分类”。
- 实现 Asset、Source、MinIO 上传完成和下载。
- 实现 KnowledgeBlock、Task、Relation。
- 实现 cursor 分页、`@Version` 冲突、软删除和恢复。

退出条件：所有核心对象形成在线操作闭环；用户隔离和 Relation 端点规则有自动断言。

### 阶段 3：离线同步

任务：

- 实现 inbound mutations、change log 和 snapshot。
- 实现 push、pull、幂等、冲突、墓碑和 30 天清理。
- 保证直接 REST 写入与同步写入走相同命令和日志路径。

退出条件：两台模拟设备可同步、重复提交、得到稳定冲突并在游标过期后执行 reset。

### 阶段 4：复习、统计与实时提示

任务：

- 实现版本化 FSRS 参数、ReviewState、ReviewEvent。
- 实现 overview、weekly 等强类型统计 DTO。
- 实现 WebSocket ticket 和用户隔离事件提示。

退出条件：调度结果可重现；SKIP 不改变状态；统计不扫描其他用户；事件不跨用户泄漏。

### 阶段 5：AI 与 RAG

任务：

- 接入 DeepSeek 和 OpenAI-compatible BYOK。
- 接入 SiliconFlow BGE-M3、pgvector 和用户级检索过滤。
- 实现 ingestion job、解析、chunk、generation 切换和清理。
- 实现 Conversation、Message、citation、SSE 和强类型建议接口。

退出条件：通过模拟供应商完成上传、解析、索引、检索、引用回答、断流恢复和建议链路，不依赖真实收费额度。

### 阶段 6：全面验证与后端交付

任务：

- 完成最小 Compose，删除新工程中的 Redis、Milvus、etcd 依赖。
- 完成全量集成、安全、同步、AI 和契约测试。
- 导出固定 OpenAPI artifact，并试生成 TypeScript 客户端。
- 回写 Backend、API、Database、Infrastructure、Status、Issues、Changelog 和运维文档。

退出条件：第 20 节测试门禁全部有新证据，后端交付物齐全；仍未完成的前端接入保持独立风险，不写成后端缺陷已关闭。

### 后续阶段：Tablet NoteDocument

在核心后端稳定后另行设计笔记模块，处理 stroke 增量、页面快照、二进制资源、冲突合并、压缩和长时间书写。该阶段不得复用普通 JSON mutation 直接上传整份文档，除非专项容量和冲突测试证明可行。

## 19. 测试策略

### 19.1 开发阶段快速测试

每阶段持续执行：

- Maven 编译。
- Spring context test。
- 应用启动和健康检查 smoke test。
- OpenAPI 生成 smoke test。
- Spring Modulith 模块验证。
- 当前阶段关键领域规则单元测试。
- 当前阶段新增接口的 MockMvc 冒烟测试。

新行为按测试驱动顺序实现：先写能因缺少行为而失败的测试，确认失败原因，再写最小实现并运行全部相关测试。

### 19.2 完成功能后的综合测试

- Testcontainers PostgreSQL + pgvector。
- 隔离 MinIO 容器或等价可重复环境。
- Flyway clean、migrate、validate 和从空库启动。
- JWT 轮换、撤销、重放、过期、错误 token 类型和 session 链撤销。
- Subject、Source、KnowledgeBlock、Task、Relation、Review、Stats 的用户隔离。
- Relation 跨用户端点、已删除端点、自关联和 RELATED_TO 反向重复攻击。
- CRUD、恢复、关系级联软删除和 30 天清理。
- Sync 幂等、请求顺序、部分失败、冲突、游标过期、snapshot 一致性和多设备 ID 碰撞。
- Asset objectKey、大小、MIME、sha256、用户前缀、过期上传和伪造完成请求。
- ingestion job 重试、租约超时、重复执行、generation 切换和删除清理。
- pgvector 查询的 userId、Subject、Source 过滤和 embedding 维度错误。
- FSRS 确定性、参数版本、SKIP 和历史快照。
- BYOK SSRF、私网、重定向、DNS 重解析和密钥泄漏。
- AI 使用 WireMock，不调用真实收费服务。
- SSE 正常完成、断流、取消、错误；WebSocket ticket 重用、过期和跨用户隔离。
- OpenAPI schema 校验和 TypeScript SDK 生成。

### 19.3 人工与外部验收边界

- Docker Desktop 当前未启动；最终 Testcontainers 和 Compose 验收前必须人工启动。
- 真实 DeepSeek、SiliconFlow 和用户 BYOK 只做受控 smoke test，不替代 WireMock 回归测试。
- 前端页面、Tauri、移动真机和 Tablet 不属于后端阶段自动验收。
- 数据重置、备份目录和生产 secret 注入需要人工确认环境边界。

## 20. 阶段门禁与完成定义

每个阶段都必须分别记录：

| 状态 | 判定证据 |
| --- | --- |
| 代码实现 | 对应类、接口、迁移和配置存在 |
| 构建通过 | 当轮完整 Maven 构建退出码 0 |
| 自动测试通过 | 当轮测试执行到真实断言且 0 失败 |
| 启动通过 | 指定 profile 下应用启动并通过健康检查 |
| 容器集成通过 | Compose/Testcontainers 使用真实 PostgreSQL/pgvector/MinIO 通过 |
| 契约通过 | OpenAPI 校验及客户端生成通过 |
| 业务验收通过 | 明确场景的人工或端到端验收记录 |

阶段可以在人工验收未完成时标为“已构建待验收”，不得标为“已验收”。

## 21. 文档回写矩阵

| 变化 | 必须更新 |
| --- | --- |
| 模块、包边界、运行命令 | `docs/modules/Backend.md` |
| REST/SSE/WebSocket 契约 | `docs/contracts/API.md` |
| 表、字段、索引、同步协议 | `docs/contracts/Database.md` |
| 对象统一映射 | `docs/contracts/ObjectModelMatrix.md` |
| Compose、环境变量、拓扑 | `docs/modules/Infrastructure.md`、Deployment、Runbook |
| 阶段状态、命令证据 | `docs/current/Status.md` |
| 未关闭风险 | `docs/current/IssuesAndReview.md` |
| 已发生并验证的变化 | `docs/release/Changelog.md` |
| 本计划决策变化 | 本文和 `docs/README.md` 索引 |

## 22. 风险与控制

| 风险 | 优先级 | 控制 | 关闭条件 |
| --- | --- | --- | --- |
| 误删用户工作树 | P0 | 仓库外备份、绝对路径校验、只替换 Server | 备份可读且删除范围审计通过 |
| 新 `/api` 与旧前端契约不兼容 | P1 | 明确无兼容承诺，OpenAPI 后单独迁移 | 三端完成新 SDK 和主流程联调 |
| Docker 未启动 | P1 | 前期使用快速测试，最终阶段启动 Docker | Testcontainers 和 Compose 证据通过 |
| 全量重写范围过大 | P1 | 分阶段可启动交付，禁止跨阶段同时铺开 | 每阶段门禁独立通过 |
| 用户数据跨租户泄漏 | P0 | Repository 级 userId、关系/同步/RAG专项测试 | 全部跨用户攻击测试通过 |
| 同步冲突导致覆盖 | P0 | baseVersion、幂等结果、明确 CONFLICT | 多设备冲突和重放测试通过 |
| 墓碑过早清理导致数据复活 | P1 | 30 天窗口、resetRequired、snapshot | 游标过期和清理测试通过 |
| 上传绑定伪造对象 | P1 | MinIO HEAD、前缀、大小、MIME、hash 校验 | 伪造和跨用户测试通过 |
| BYOK 引入 SSRF/密钥泄漏 | P0 | HTTPS allowlist、地址校验、AES-GCM、日志过滤 | 安全专项测试通过 |
| pgvector 维度或模型漂移 | P1 | 固定 BGE-M3/1024，版本化重建 | 迁移演练和维度测试通过 |
| AI/解析任务重复执行 | P1 | 数据库租约、幂等 generation 和 outbox | 重试、崩溃恢复、重复执行测试通过 |
| 计划与实现漂移 | P2 | 阶段前后回写计划和权威文档 | 文档审查无未解释差异 |

## 23. 交付物

最终后端交付至少包含：

- 全新 `Auralis-Server` 源码、Maven Wrapper 和模块边界测试。
- 完整 Flyway 迁移链。
- PostgreSQL/pgvector/MinIO 最小 Compose。
- OpenAPI JSON/YAML 固定 artifact。
- 自动测试和测试环境说明。
- 示例 `.env.example`，不包含真实密钥。
- 对象差异矩阵及更新后的 API、Database、Backend、Infrastructure 文档。
- 各阶段构建、测试、容器、外部服务和人工验收证据。
- 仍未关闭风险和前端迁移入口。

## 24. 已锁定决策

- 绿地重写，同目录替换，不做增量改造。
- 模块化单体，不拆微服务。
- `/api` 前缀保留，不增加 `/v1`，不兼容旧契约。
- 旧开发数据可清空，不做迁移。
- JPA + Flyway，移除 MyBatis Plus 和程序化 DDL。
- PostgreSQL + pgvector，移除 Redis、Milvus、etcd。
- access JWT 15 分钟，refresh session 30 天并 rotation。
- 离线同步使用 baseVersion，冲突拒绝并返回服务器当前值。
- 墓碑保留 30 天，过期设备完整重同步。
- Asset 表示物理对象，Source 表示逻辑来源；Relation 连接 Source 而非 Asset。
- Task 不包含复习状态；Review 只属于 KnowledgeBlock。
- Review 保留当前状态和不可变历史，SKIP 不更新 FSRS。
- 服务端默认聊天模型为 DeepSeek，BYOK 使用 OpenAI-compatible 协议且只替换聊天模型。
- Embedding 固定 SiliconFlow BGE-M3、1024 维。
- 文件解析只用于 RAG，不自动创建正式 KnowledgeBlock。
- Conversation/Message 服务端持久化。
- WebSocket 只提示事件，业务数据通过 REST 获取。
- Tablet NoteDocument 延后为独立模块。

## 25. 当前计划状态

截至 2026-08-17：

- PC、Mobile、Tablet 的基础页面与主要视觉/布局重构已基本收敛，但仍有 GUI、真机和联调验收缺口。
- 旧 Server 已按阶段 0 规则移至仓库外可恢复备份；当前工作树使用 `com.auralis.app` 绿地后端。
- 阶段 0 已完成骨架、错误协议、健康/OpenAPI、模块边界和工作树保护；阶段 1 已完成 Flyway V1、User/Device/RefreshSession、认证链路、owner-scoped session 操作及自动测试。
- 阶段 2A 已完成 Flyway V2、Subject/KnowledgeBlock/Task Entity、Repository、Service、Controller、默认 Subject、版本/软删除/恢复和跨用户测试；详细执行记录见 [阶段 2A 核心领域实施计划](../superpowers/plans/2026-08-12-backend-phase-2-core-domain.md)。
- 阶段 2B 已构建 Flyway V3、Source/Asset/Relation Entity、Repository、Service、Controller、KnowledgeBlock Source 关联、对象存储端口和配置开关；详细执行记录见 [阶段 2B Source、Asset、Relation 实施计划](../superpowers/plans/2026-08-12-backend-phase-2b-source-asset-relation.md)。
- 阶段 2B 本轮证据为 H2 clean-schema、42 个 Maven 自动测试、MockMvc 核心接口、MinIO 可替换适配器和 Modulith named interface；PostgreSQL/pgvector、Docker、真实 MinIO、ingestion worker、前端联调和人工业务验收仍未完成。
- 阶段 3 已构建 Flyway V4、统一 change log、inbound mutation 幂等、push/pull/snapshot、设备校验、版本冲突和 30 天清理入口；阶段 4 已构建 Flyway V5、FSRS-lite Review、用户隔离 Stats 和一次性 Realtime ticket/事件桥。详细执行记录见 [阶段 3/4 Sync、Review、Stats、Realtime 实施计划](../superpowers/plans/2026-08-13-backend-phase-3-4-sync-review-realtime.md)。
- 阶段 3/4 本轮证据为 H2 clean-schema、27 个测试类/61 个自动测试、MockMvc、JPA validate 和架构测试；PostgreSQL/pgvector、Docker、真实 MinIO、双设备、浏览器 WebSocket、跨实例 broker、前端联调和人工业务验收仍未完成。
- 阶段 5 已完成后端基线：V8–V12、BYOK、Provider/embedding 端口、Source ingestion/retrieval、Conversation/Message、clientRequestId 幂等、citation、回调式 SSE 和 Suggestions；详细执行记录见 [阶段 5 AI/RAG 设计](../superpowers/specs/2026-08-16-backend-phase-5-ai-rag-design.md) 与 [阶段 5 AI/RAG 实施计划](../superpowers/plans/2026-08-16-backend-phase-5-ai-rag.md)。
- 阶段 5 本轮证据为 H2 clean-schema、Flyway V1→V12、JPA validate、MockMvc/Stub Provider、架构检查，以及 R1-03 定向 11/11、R1-04 定向 16/16、全量后端 121 通过和 PostgreSQL 17.11 + pgvector 集成 1/1；完整 PostgreSQL/Compose、真实 MinIO、真实 Provider、lease fencing、性能/安全专项、前端联调和人工业务验收仍未完成。
- 与原计划的实现差异：当前采用内部 Provider ports + Spring RestClient，没有引入 LangChain4j；H2/JPA 基线以 1024 维 JSON 编解码计算 cosine，PostgreSQL 使用 JDBC pgvector SQL/HNSW，chunk generation 通过事务原子切换；Suggestions 先提供确定性类型化基线，后续再接入 LLM/RAG citations；文件解析暂限文本型 MIME。
- 下一步先完成阶段 1–5 的全量 PostgreSQL/Docker/MinIO/Provider 外部门禁，再补 ingestion lease fencing/崩溃恢复、AI 安全专项、Suggestions 质量、真实 SSE 和客户端契约迁移。
