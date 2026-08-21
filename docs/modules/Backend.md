# Spring Boot 后端模块

更新时间：2026-08-20

文档状态：旧 Server 代码已归档；绿地重写阶段 5 AI/RAG 基线已构建，R1 已完成 pgvector、请求并发保留、会话恢复键和受控流式验证；默认 Docker Testcontainers 门禁通过，整体仍待真实 Provider 与外部验收

权威范围：Auralis-Server 当前实现、绿地目标模块边界、运行配置、验证命令和阶段状态。

## 当前旧 Server 事实

替换前旧 Server 位于 `Auralis-Server`，现已移至仓库外备份；其基础包为 com.auralis.server，技术栈为 Spring Boot 3.2.5、Java 21、MyBatis Plus、PostgreSQL、Redis、JJWT、LangChain4j、Milvus、Apache Tika、MinIO、Caffeine 和 WebSocket。

当前旧包结构包含 common、config、controller、dto、entity、mapper、service 和 websocket。旧 Controller 包含 Auth、KnowledgeBlock、TaskBlock、BlockRelation、Sync、FileStorage、Asset、AI 和 Stats。旧配置仍存在程序化 DDL、Redis、Milvus、旧 LangChain4j 配置和开发默认值。

这些内容只用于替换前盘点；阶段 0 不从旧代码复制实现，也不承诺旧 API、Result、WebSocket 或数据库行为兼容。

## 绿地目标模块

新 Server 基础包固定为 com.auralis.app，使用模块化单体：

| 模块 | 责任 | 阶段状态 |
| --- | --- | --- |
| identity | User、Password、JWT、RefreshSession、Device、Auth HTTP | 阶段 1 已实现，待 PostgreSQL/人工验收 |
| subject | Subject 和默认未分类学科 | 阶段 2A 已实现，待 PostgreSQL/人工验收 |
| source | Source、Asset、MinIO、解析任务 | 阶段 2B 已实现上传端口、Source CRUD/重摄入，待真实 MinIO/解析验收 |
| knowledge | KnowledgeBlock | 阶段 2A 已实现，阶段 2B 已接入 Source 关联 |
| task | Task | 阶段 2A 已实现，待 PostgreSQL/人工验收 |
| relation | 通用跨对象关系 | 阶段 2B 已实现端点校验、去重、软删除级联，待 PostgreSQL/人工验收 |
| review | ReviewState、ReviewEvent、FSRS-lite | 阶段 4 已实现，待 PostgreSQL/业务验收 |
| sync | Device、mutation、change log、高水位 cursor、snapshot、墓碑 | 阶段 3 已实现，待双设备/过期 cursor/生产验收 |
| ai | 模型配置、BYOK、Provider、Conversation、RAG、Suggestions | 阶段 5 后端基线已实现；R1-03 pgvector、R1-04 流式、会话/消息幂等保留和精确 reply 关联已通过；待真实 Provider 与业务验收 |
| stats | 强类型统计读取模型 | 阶段 4 已实现，待 PostgreSQL/业务验收 |
| realtime | WebSocket ticket 和用户级事件 | 阶段 4 已实现，待浏览器/跨实例验收 |
| shared | 错误模型、时钟、ID、分页、最小公共设施 | 配置/错误/OpenAPI 基础 |

阶段 2B 延续 Spring Modulith 模块边界：identity 的 Entity、Repository 和 security 实现放在 internal 包，认证主体放在 `shared.security` named interface，Source/Relation 的持久化放在 internal 包，公开 DTO、Service 和 Controller 位于各业务模块根包；业务模块只能通过模块根公开 API、显式 DTO 或 `shared.domain` 领域事件协作。Relation 通过领域事件监听 Subject、Source、KnowledgeBlock、Task 删除，不反向依赖这些模块。

## 阶段 1 实际 HTTP 表面

阶段 1 已实现 Auth Controller，目标可访问路径为：

- /actuator/health
- /actuator/health/liveness
- /actuator/health/readiness
- /v3/api-docs
- /swagger-ui/index.html
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/auth/sessions
- DELETE /api/auth/sessions/{sessionId}
- DELETE /api/auth/sessions/others

除 Auth 外，阶段 2A 已实现 Subject、KnowledgeBlock、Task，阶段 2B 已实现 Source、Asset、Relation，阶段 3 已实现 Sync，阶段 4 已实现 Review、Stats、Realtime，阶段 5 已实现 AI settings、Conversation、SSE message、Suggestions 和 ingestion/retrieval 后端基线；R1 已完成会话并发版本/消息序号、短事务请求保留、离线会话恢复键、核心列表 cursor 与 Sync 清理调度。请求/响应、Problem Details 字段和版本/cursor 规则以 docs/contracts/API.md 为准；数据库目标以 docs/contracts/Database.md 为准；对象差异以 docs/contracts/ObjectModelMatrix.md 为准。

Identity 的登录设备列表以活动 refresh session 为边界：同一用户/设备重复登录会替换旧活动会话，`GET /api/auth/sessions` 仅返回每台设备一条当前或最近活动记录，轮换、撤销和过期记录不作为设备条目展示。

## 阶段 2A 实际 HTTP 表面

阶段 2A 新增：

- Subject：`POST/GET /api/subjects`、`GET/PUT/DELETE /api/subjects/{id}`、`POST /api/subjects/{id}/restore`。
- KnowledgeBlock：`POST/GET /api/knowledge-blocks`、`GET/PUT/DELETE /api/knowledge-blocks/{id}`、`POST /api/knowledge-blocks/{id}/restore`。
- Task：`POST/GET /api/tasks`、`GET/PUT/DELETE /api/tasks/{id}`、`POST /api/tasks/{id}/restore`。

创建、更新、删除和恢复统一执行 `baseVersion`、userId 隔离和软删除语义；Subject、KnowledgeBlock、Task 列表使用不透明 keyset cursor 和 `limit`（默认 100、最大 200），返回稳定 `nextCursor`/`hasMore`。KnowledgeBlock 的 `sourceId` 现在校验同用户活动 Source；Source 删除通过 shared 事件级联软删除 Relation。

阶段 2B 验证证据：2026-08-13 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，阶段2B基线执行 42 个真实测试；包含 V1/V2/V3 schema、Source/Asset/Relation Repository/Service/Controller、KnowledgeBlock Source 关联、RELATED_TO 反向去重、端点删除级联、Auth/阶段 2A 回归和 Modulith 边界。阶段 3/4 审核修复后在全量 clean test 中验证 Sync、Review、Stats、Realtime、V6/V7 迁移和并发回归，最终合计 69 个测试。证据范围为 H2、JPA、MockMvc 和测试存储适配器，不包含 PostgreSQL、Docker、真实 MinIO、解析 worker、双设备、浏览器 WebSocket、三端联调或人工业务验收。

## 目标技术基线

- Java 21。
- Spring Boot 4.1。
- Spring Modulith 2.1。
- Maven Wrapper + Maven。
- Spring MVC、Bean Validation、Actuator、springdoc OpenAPI。
- 当前持久化使用 Spring Data JPA + Flyway V1–V11；R1-03 的 pgvector 写入/检索通过 JDBC repository 接入，H2 保留 JSON fallback。
- 目标数据库使用 PostgreSQL 17 + pgvector；V9 创建 vector(1024)/HNSW，V10 提供 generation cutover，V11 回填历史 JSON embedding。
- 后续对象存储使用 MinIO。
- 新工程移除 MyBatis Plus、运行时 DDL、Redis、Milvus、etcd、旧 JJWT 配置、统一 Result 和 encryptedPayload。

## 配置与安全边界

阶段 1 绑定身份 token TTL 和 JWT secret 配置；local/test 缺少 secret 时生成进程内随机密钥，prod profile 缺少 `AURALIS_JWT_SECRET` 必须启动失败。提交文件不得包含真实密码、JWT secret、BYOK key、AI key 或 refresh token。

后续生产配置必须从环境变量读取数据库、MinIO、JWT、BYOK、DeepSeek、SiliconFlow 和 CORS 值；生产 profile 对缺失的关键配置执行 fail-fast。所有业务 Repository 必须在查询中带当前 userId；日志过滤 Authorization、Cookie、refresh token、BYOK key、完整 prompt 和模型回复。

## 阶段 2B 实际 HTTP 表面

- Asset：`POST /api/assets/upload-intents`、`POST /api/assets/{id}/complete`、`POST /api/assets/{id}/download-url`；AssetStoragePort 提供 test 适配器与配置启用的 MinIO 适配器。
- Source：`POST/GET /api/sources`、`GET/PUT/DELETE /api/sources/{id}`、`POST /api/sources/{id}/restore`、`POST /api/sources/{id}/reingest`。
- Relation：`POST/GET /api/relations`、`GET/PUT/DELETE /api/relations/{id}`、`POST /api/relations/{id}/restore`。
- Source 的 ingestion worker、Tika 解析和 source_chunks/pgvector 已在阶段 5 后端基线接入；Source/Relation 列表同样使用稳定 keyset cursor；真实 MinIO、完整 PostgreSQL 门禁和生产分页性能仍不在本阶段验收范围。

## 阶段 3/4 实际 HTTP 表面

- Sync：`POST /api/sync/push`、`GET /api/sync/pull`、`GET /api/sync/snapshot`；SyncService 校验活动设备，SyncMutationProcessor 在独立事务内原子完成幂等占位、领域命令、change log 和最终结果，并提供高水位不回退的不透明 cursor；snapshot 包含必要墓碑。`SyncRetentionService` 按配置定时清理 30 天外日志/幂等记录，保留高水位并记录清理与 reset 指标。
- Review：`GET /api/reviews/due`、`POST /api/reviews/events`、`GET /api/reviews/history`；ReviewService 使用版本化 FSRS-lite 参数集，SKIP 只写事件。
- Stats：`GET /api/stats/overview`、`GET /api/stats/weekly`；StatsQueryRepository 对所有聚合带 userId 条件，weekly 固定连续 7 天。
- Realtime：`POST /api/realtime/ticket` 和 `/ws/events`；RealtimeService 对短期 ticket 做 hash-only 存储、一次性消费和设备归属校验，提交后事件监听器向用户级订阅者转发 Sync/Review 通知。

## 验证边界

阶段 2A/2B/3/4 已有：

- Maven Wrapper 完整构建和真实测试。
- Spring context test。
- Spring Modulith ApplicationModules.verify。
- Problem Details 和 traceId MockMvc 测试。
- 健康检查和 OpenAPI smoke test。
- Flyway V1、JPA entity/repository、密码/JWT/refresh rotation、Auth Controller 和用户隔离测试。
- Flyway V2、Subject/KnowledgeBlock/Task Entity/Repository/Service/Controller、版本/墓碑/恢复和跨用户 Subject 引用测试。
- Flyway V3、Source/Asset/Relation Entity/Repository/Service/Controller、Asset HEAD/stat 元数据校验、Source 类型/Asset 归属、Relation 端点存在性/去重/级联删除测试。
- 配置启用 MinIO 的 presigned PUT/GET 与 stat 适配器代码；真实对象存储调用仍未联调。
- V4/V6 change log/inbound mutation schema、Sync 原子 push/pull/snapshot、高水位 cursor、墓碑、cursor round-trip、幂等和版本冲突测试。
- V5/V7 Review schema、FSRS-lite 调度、完整状态快照/SKIP/复习事件幂等、Stats completed_at 用户隔离聚合、Realtime ticket hash/过期/一次性消费和提交后事件桥测试。
- 旧包、旧依赖和生成目录静态检查。

阶段 2A/2B/3/4 不证明：

- PostgreSQL/pgvector/MinIO 容器联调。
- PostgreSQL/pgvector、真实 MinIO 容器联调、Source 解析 worker、source_chunks、跨实例 broker、双设备断网恢复、浏览器 WebSocket 客户端、AI/RAG 或前端新契约可用。
- PC、Mobile、Tablet 与新契约联调。
- GUI、真机、外部服务或产品验收。

## 构建命令

阶段 0 新工程使用：

    cd Auralis-Server
    .\mvnw.cmd -B -ntp clean test

旧 Server 的历史 `mvn test` 结果不作为新 Server 证据；旧源码已移至仓库外备份，阶段 1 新实现只使用 `com.auralis.app`。

## R1-06 工具链和运行配置

- `mvnw.cmd` 对 Maven 本地仓库先区分普通目录与有效链接目标，普通 Windows Maven 仓库不再触发空 `Target` 数组异常。
- `application.yml` 全局设置 `spring.jpa.open-in-view=false`；现有服务在关闭 Open-in-View 后通过 context/MockMvc/全量测试。
- `application-prod.yml` 显式设置 `springdoc.api-docs.enabled=false` 和 `springdoc.swagger-ui.enabled=false`；local profile 的 `/v3/api-docs` smoke 保持启用。
- POM 固定测试 H2 2.2.224，并用 Mockito 5.23.0 Java agent 配置 Surefire；默认自动启用 PostgreSQL/MinIO Testcontainers。R1-06/G1 定向配置测试 6/6，系统 Maven 与 Wrapper `clean test` 均为 135 通过、0 失败/错误/跳过。
- 该命令证据不替代真实 Provider、干净机器网络下载或前端/GUI 验收。

## R2 真实依赖与对象存储门禁

- `AssetStoragePort` 的 MinIO 实现生成 presigned PUT/GET URL，并在声明 sha256 时把 `X-Amz-Meta-Sha256` 一并交给客户端；完成阶段继续由服务端 HEAD/stat 校验 size、MIME 和 hash。
- 上传校验失败会先持久化 `FAILED`，再尝试幂等删除对象；删除失败仍保留可审计数据库状态，并由 `scripts/audit-minio-assets.ps1` 做数据库/对象对账。
- `PgVectorIntegrationTests` 改为 Testcontainers PostgreSQL/pgvector，另有升级输入测试覆盖既有 V8 `embedding_json` 经 V9/V11 的 vector/HNSW/回填；`AiProviderResilienceTests` 覆盖 429、5xx、错误 JSON 和错误流事件。
- R2 真实依赖测试默认随 `mvn -B -ntp clean test` 执行；`postgres-it`/`minio-it` profiles 仍作为兼容别名保留。Docker Engine 不可用时默认测试应失败，而不是跳过容器集成测试。

## 阶段 5 AI/RAG 后端实现边界

- `ai` 模块通过 `AiProviderPort`、`EmbeddingProviderPort` 与统一的 `ProviderHttpClient` 适配 OpenAI-compatible/DeepSeek 聊天和 SiliconFlow embedding；Provider URL 使用 HTTPS 精确 allowlist、DNS 公网地址过滤与固定地址连接（混合解析结果只连接公网地址，全部为私网时拒绝），重定向关闭，并受超时/响应体上限约束。固定地址 TLS Socket 同时支持 Java 21 `HttpsURLConnection` 的无参创建后 `connect` 生命周期，实际连接目标仍替换为安全策略已确认的公网地址。运行时凭据解析遵循“当前用户有效 BYOK → 服务端 env 默认 Provider”顺序；默认聊天 Provider 由 `AURALIS_AI_DEFAULT_PROVIDER` 决定，默认凭据使用 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY` 及对应模型/Base URL 配置。BYOK 使用 AES-GCM，日志、异常、DTO 与凭据 `toString()` 不回显 key。
- ingestion 由 Source 提交后事件触发，`IngestionJobService` 做用户/Source 归属和活动任务去重，并通过数据库锁定的 claim-next 分配租约；条件化 `IngestionWorkerScheduler` 自动轮询，lease 过期可恢复，失败按最大次数回到 PENDING，耗尽后进入 FAILED。`IngestionWorker` 负责解析、固定大小重叠切块、1024 维 embedding 和 chunk 替换。
- `RetrievalService` 只查询当前 userId 的活动 generation chunks。PostgreSQL 通过 `PgVectorRetrievalRepository` 执行带 user/source/active/deleted 过滤的 pgvector cosine SQL，由 HNSW 索引支持 top-k；非 PostgreSQL 环境使用活动 chunk 的 JSON cosine fallback。`SourceChunkService` 使用 generation 写入新 chunks，事务成功后切换 active，失败保留旧 generation。
- Conversation/Message 服务提供 owner-scoped CRUD、软删除、`@Version` 会话版本、写锁保护的消息序号、会话和 USER 消息的 `clientRequestId` 幂等回放及安全错误/断流状态持久化。流式请求先在短事务中锁定会话并保留唯一 USER 消息，Provider I/O 不持有数据库事务；assistant 以 `reply_to_message_id` 精确关联该 USER 消息。SSE 使用 Spring MVC，不引入 WebFlux；Controller 通过 sink 直接转发 Provider 增量，OpenAI-compatible 上游 SSE 解析为 `message.delta`，检索命中转为可回链 `citation` 事件。
- Suggestions 当前是类型化、可替换的确定性输出层，已完成 KnowledgeBlock owner check，但尚未接入真实 LLM 生成或 RetrievalService citation 组装。

阶段 5/R1 自动验证：H2/JPA/MockMvc/Stub Provider/架构及受控网络测试覆盖 AI 基线；R1 定向套件验证 V14、会话重试、并发同请求仅一次保留和流式回放；默认 `mvn -B -ntp clean test` 已实际执行 PostgreSQL 17/pgvector clean/upgrade 与 MinIO 容器，137/137 通过。真实 Provider、性能和前端联调仍未完成。
