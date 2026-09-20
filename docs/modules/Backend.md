# Spring Boot 后端模块

2026-09-20 Overview Reduce prompt routing 已完成：MAP 行为保持不变；所有文档 REDUCE 调用（非最终与最终）现在在既有 SYSTEM/schema、安全、mode、alias 和 locator 规则之后接收 Reduce 专用均衡压缩指令。该指令经 Java text-block 规范化后为 843 字符，面向需要实质归并的输出目标约 2500–3000 个序列化 JSON 字符；目标不是硬上限。`max_tokens=4608`（多批 MAP、非最终 REDUCE）与 `6144`（single-batch MAP、Subject direct、最终 REDUCE）不变；规范化 intermediate JSON `<=5200` 字符、self-pair `<=12000`、Reduce no-progress、JSON/schema/alias/mode/locator 校验、分组/批次和调用次数均不变，也不增加自动压缩重试。Task 1 focused Server 自动验证 55/55 与 test-compile 已通过；这些证据只证明 prompt 路由和既有不变量，不证明真实 DeepSeek 的压缩质量、内容覆盖、延迟、token 使用或成本，真实样本仍待验收。

2026-09-17 Overview token budget 调整为原预算的 150%：多批 MAP 与非最终 REDUCE 使用 `max_tokens=4608`，single-batch MAP、Subject direct 与最终 REDUCE 使用 `6144`；规范化 intermediate JSON 上限为 `5200` 字符，self-pair 上限仍为 `12000`。紧凑 intermediate prompt、schema/规范化和 no-progress 校验保留，不做自动压缩重试。普通聊天、流式和 embedding 不变。

历史诊断记录（2026-09-15，永久策略实施前）：Task 4C 仅增强 intermediate system instruction，保留独立主题/section、压缩措辞、只合并重复/等价节点，并以序列化 JSON `<=3600` 为目标。真实 42-chunk 请求的六个 MAP 全部通过，输出为 1447–3680 字符；此前超限的 MAP2 从 5105 降至 2027。REDUCE round 1 第一组 2446 字符通过，第二组 4678 字符仍单独触发 4000 字符上限，self-pair 为 10899/12000。Prompt 有效但不是硬保证。Final prompt、硬校验、batch、Provider 和普通聊天/流式未变；该段记录的是永久策略实施前的实验状态。

历史基线记录（2026-09-14）：Overview Provider 调用按当时阶段策略使用非空 `maxTokens`：中间调用 1024、最终调用 4096。多 batch Source MAP 与非最终 multi-group REDUCE 为 intermediate；single-batch Source MAP、Subject direct 与最终单 group REDUCE 为 final。Overview 的 `AiProviderRequest` 显式标记 `structuredJson=true`；OpenAI-compatible body 增加 `response_format={type:json_object}`，DeepSeek 额外增加 `thinking={type:disabled}`，普通聊天/流式继续使用兼容构造器并保持 false。该历史条目不代表当前永久预算；当前值以本文件顶部 2026-09-15 条目为准。其余 Provider 安全、错误码和自动验证证据保持记录。

2026-09-12 Build/OpenAPI Task 3 最终回归：Server fresh 聚焦命令实际 57/57、0 failures、0 errors、0 skipped，fresh test compilation 已通过。缺失的四参数 `ProviderHttpTransport.post(..., byte[])` 仅在 `AiProviderSecurityTests` 的测试 double 中补齐，生产 Provider transport 未改变。全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers 无法连接 Docker；`check-openapi.ps1` 退出 0，OpenAPI artifact 测试 8/8。真实 Provider、PostgreSQL/MinIO、HTTP 端到端与业务验收仍待完成。

2026-09-11 Overview Source Provider-boundary fence：文件总览生成在每一次共享 Map/Reduce Provider 调用前后，以现有 owner-scoped `SourceService.requireActiveSource` 重新验证 Source 为活动 `READY` 且 `ingestionRevision` 精确匹配；删除仍保留 `RESOURCE_NOT_FOUND`，状态或修订变化返回稳定 `MUTATION_REJECTED`。Provider 已在调用中的请求可能先完成，但其响应会在 post-call fence 被拒绝，且不会启动后续 Map/Reduce 调用。Subject 总览不启用该 Source fence，公开 API、DTO、数据库与同步契约未改变。本轮聚焦 `AiOverviewServiceTests` 19/19 通过；Overview 失败日志使用 allowlist，仅记录规范化 UUID `requestId`、关联字段、阶段、稳定 `errorCode`（或 `OVERVIEW_GENERATION_FAILED` 回退）及 exception/cause 类型；非法或含敏感内容的请求 ID 会替换为服务端新 UUID，不记录原始 exception/cause 文本或 throwable stack。Task 4 Server 标准聚焦为 40/40；全量 `test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers Docker 不可用。一次 fresh `clean test-compile` 仍被 `AiProviderSecurityTests.java:182` 的 `ProviderHttpTransport` 缺少 `post(..., byte[])` 阻断；OpenAPI artifact 测试 8/8，但 `check-openapi.ps1` 仍报告 PC generated schema stale。真实 Provider、PostgreSQL/MinIO、HTTP 端到端与业务验收仍待完成。

更新时间：2026-09-12

文档状态：旧 Server 代码已归档；绿地重写阶段 5 AI/RAG 基线及 PC Tauri S1–S6 ParsedDocument schema/upload-intent/payload validator/complete 首胜/block indexing/cleanup 已实现；V16 阅读会话 scope、完成历史 Prompt、readingContext 当前 Source 检索和同学科确定性升级已实现；R1 已完成 pgvector、请求并发保留、会话恢复键和受控流式验证；Subject 专属颜色已由 V19 移除并在本地 PostgreSQL 升级验证，整体仍待真实 Provider 与外部验收

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
| subject | Subject 及历史默认标记兼容；不保存专属颜色 | 阶段 2A 已实现，V19 已移除历史颜色列；本地 PostgreSQL 已升级验证，待真实业务验收 |
| source | Source、Asset、MinIO、解析任务 | 阶段 2B 已实现上传端口、Source CRUD/重摄入，待真实 MinIO/解析验收 |
| knowledge | KnowledgeBlock | 阶段 2A 已实现，阶段 2B 已接入 Source 关联 |
| task | Task | 阶段 2A 已实现，待 PostgreSQL/人工验收 |
| relation | 通用跨对象关系 | 阶段 2B 已实现端点校验、去重、软删除级联，待 PostgreSQL/人工验收 |
| review | ReviewState、ReviewEvent、FSRS-lite | 阶段 4 已实现，待 PostgreSQL/业务验收 |
| sync | Device、mutation、change log、高水位 cursor、snapshot、墓碑 | 阶段 3 已实现，待双设备/过期 cursor/生产验收 |
| ai | 模型配置、BYOK、Provider、Conversation、RAG、Suggestions、阅读 scope、无状态结构化总览 | 阶段 5 后端基线及 V16 阅读会话/Prompt/当前 Source 检索/同学科升级已实现；Source/Subject overview 定向测试通过；待真实 Provider 与业务验收 |
| stats | 强类型统计读取模型 | 阶段 4 已实现，待 PostgreSQL/业务验收 |
| realtime | WebSocket ticket 和用户级事件 | 阶段 4 已实现，待浏览器/跨实例验收 |
| shared | 错误模型、时钟、ID、分页、最小公共设施 | 配置/错误/OpenAPI 基础 |

阶段 2B 延续 Spring Modulith 模块边界：identity 的 Entity、Repository 和 security 实现放在 internal 包，认证主体放在 `shared.security` named interface，Source/Relation 的持久化放在 internal 包，公开 DTO、Service 和 Controller 位于各业务模块根包；业务模块只能通过模块根公开 API、显式 DTO 或 `shared.domain` 领域事件协作。Relation 通过领域事件监听 Subject、Source、KnowledgeBlock、Task 删除，不反向依赖这些模块。

2026-09-11 的 Task 4 复核确认 `source` 通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 调用 `ai.ingestion` 的公开契约，生产 source 不再引用 ai 内部服务或实体，`ai → source` 单向依赖由架构隔离命令（含 `ArchitectureTests`）7 类合计 20/20 覆盖，其中 `ArchitectureTests` 1/1。H2 fixture 清理连续两次聚焦 24/24；OpenAPI artifact 聚焦 8/8。上述隔离证据不替代标准 Maven fresh testCompile 或真实 PostgreSQL/MinIO 验收。

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

除 Auth 外，阶段 2A 已实现 Subject、KnowledgeBlock、Task，阶段 2B 已实现 Source、Asset、Relation，阶段 3 已实现 Sync，阶段 4 已实现 Review、Stats、Realtime，阶段 5 已实现 AI settings、Conversation、SSE message、Suggestions 和 ingestion/retrieval 后端基线；R1 已完成会话并发版本/消息序号、短事务请求保留、离线会话恢复键、核心列表 cursor 与 Sync 清理调度。新用户注册不自动创建“未分类”Subject，历史默认标记仅用于兼容读取且允许普通软删除。请求/响应、Problem Details 字段和版本/cursor 规则以 docs/contracts/API.md 为准；数据库目标以 docs/contracts/Database.md 为准；对象差异以 docs/contracts/ObjectModelMatrix.md 为准。

Identity 的登录设备列表以活动 refresh session 为边界：同一用户/设备重复登录会替换旧活动会话，`GET /api/auth/sessions` 仅返回每台设备一条当前或最近活动记录，轮换、撤销和过期记录不作为设备条目展示。

## 阶段 2A 实际 HTTP 表面

阶段 2A 新增：

- Subject：`POST/GET /api/subjects`、`GET/PUT/DELETE /api/subjects/{id}`、`POST /api/subjects/{id}/restore`。
- KnowledgeBlock：`POST/GET /api/knowledge-blocks`、`GET/PUT/DELETE /api/knowledge-blocks/{id}`、`POST /api/knowledge-blocks/{id}/restore`。
- Task：`POST/GET /api/tasks`、`GET/PUT/DELETE /api/tasks/{id}`、`POST /api/tasks/{id}/restore`、`POST /api/tasks/schedule-swaps`；Task 颜色字段已由 V21 从 API、Entity 和历史同步 JSON 中移除，KnowledgeBlock 颜色仍保留。

创建、更新、删除和恢复统一执行 `baseVersion`、userId 隔离和软删除语义；Subject、KnowledgeBlock、Task 列表使用不透明 keyset cursor 和 `limit`（默认 100、最大 200），返回稳定 `nextCursor`/`hasMore`。Task 换位端点以稳定 UUID 顺序获取两个悲观锁，在一个事务中校验版本、截止时间及新排期；任一失败均回滚，避免半交换。无法反序列化为 `Instant` 的请求字段由 Problem Details `400 VALIDATION_FAILED + fieldErrors` 返回，而非未处理 500。KnowledgeBlock 的 `sourceId` 现在校验同用户活动 Source；Source 删除通过 shared 事件级联软删除 Relation。

2026-09-18 Task 2A：Subject DELETE 仍使用原有公开 API 和软删除语义，但在同一事务内通过各业务模块的公开领域事件边界级联软删除当前用户、当前 Subject 下的活动 Source、KnowledgeBlock 和 Task。每个子资源递增 version/更新时间、发布普通 `DELETE` `ResourceChangedEvent`，并继续发布端点删除事件使相关 Relation 逐条生成墓碑；已删除子资源不重复写入，Subject restore 不恢复子资源。级联异常会回滚 Subject、子资源、Relation 和 change-log 写入；不改变 ParsedDocument 审计元数据、延迟 Asset/MinIO 保留清理或数据库 schema。

Task 2A 统一数据库锁协议：所有涉及 Subject-owned 资源的写事务先收集 owner Subject IDs，去重并按 UUID 升序通过 `SubjectLockCoordinator` 获取悲观行锁，再按稳定资源顺序锁定具体 Source/KnowledgeBlock/Task/Relation，最后重新读取并校验活动状态、归属、`subjectId` 和 Relation 端点。代码复核必须逐条回答：

- 涉及哪些 Subject，是否覆盖移动、换位、Relation 两端和级联端点？
- Subject 锁是否由 `SubjectLockCoordinator` 去重并按 UUID 升序先取得？
- Subject 与具体资源锁取得后，是否重新读取并重新验证活动状态、归属、版本和端点？
- 是否不存在持有 Source/KnowledgeBlock/Task/Relation 锁后再获取 Subject 锁的 Resource→Subject 反向路径？

首次解锁读取仅可用于发现 owner Subject lock set；它的实体和值不得直接用于 mutation。该协议覆盖 Subject delete、Task schedule swap、Source/Task move、Relation create/update/restore/delete、KnowledgeBlock source validation、resource create/restore 及 ParsedDocument Source fence，不改变 API、schema 或 MinIO retention。

阶段 2B 验证证据：2026-08-13 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，阶段2B基线执行 42 个真实测试；包含 V1/V2/V3 schema、Source/Asset/Relation Repository/Service/Controller、KnowledgeBlock Source 关联、RELATED_TO 反向去重、端点删除级联、Auth/阶段 2A 回归和 Modulith 边界。阶段 3/4 审核修复后在全量 clean test 中验证 Sync、Review、Stats、Realtime、V6/V7 迁移和并发回归，最终合计 69 个测试。证据范围为 H2、JPA、MockMvc 和测试存储适配器，不包含 PostgreSQL、Docker、真实 MinIO、解析 worker、双设备、浏览器 WebSocket、三端联调或人工业务验收。

## 目标技术基线

- Java 21。
- Spring Boot 4.1。
- Spring Modulith 2.1。
- Maven Wrapper + Maven。
- Spring MVC、Bean Validation、Actuator、springdoc OpenAPI。
- Spring MVC converter 与所有 Auralis 自有生产/测试源码统一使用 Jackson 3 的 `tools.jackson` 命名空间；JSON object payload、流式 ParsedDocument 校验、WebSocket、Review 持久化和 Provider HTTP 均不混入 Jackson 2 类型。`JacksonNamespaceGuardTests` 会阻止重新导入 `com.fasterxml.jackson.*`。
- 当前持久化使用 Spring Data JPA + Flyway V1–V15；R1-03 的 pgvector 写入/检索通过 JDBC repository 接入，H2 保留 JSON fallback。V15 追加 PC Tauri ParsedDocument 派生表、Source ingestion revision、FILE 状态约束和 ingestion job 关联字段；ParsedDocument 不进入同步表。S3 已实现 `/api/sources/{sourceId}/parsed-documents/upload-intents`，仅按 owner/revision 创建 `UPLOADING` 派生记录并向现有 `AssetStoragePort` 请求限定 MIME/checksum/size 的私有签名。
- 目标数据库使用 PostgreSQL 17 + pgvector；V9 创建 vector(1024)/HNSW，V10 提供 generation cutover，V11 回填历史 JSON embedding。
- 后续对象存储使用 MinIO。
- 新工程移除 MyBatis Plus、运行时 DDL、Redis、Milvus、etcd、旧 JJWT 配置、统一 Result 和 encryptedPayload。

## 配置与安全边界

阶段 1 绑定身份 token TTL 和 JWT secret 配置；local/test 缺少 secret 时生成进程内随机密钥，prod profile 缺少 `AURALIS_JWT_SECRET` 必须启动失败。提交文件不得包含真实密码、JWT secret、BYOK key、AI key 或 refresh token。

后续生产配置必须从环境变量读取数据库、MinIO、JWT、BYOK、DeepSeek、SiliconFlow 和 CORS 值；生产 profile 对缺失的关键配置执行 fail-fast。所有业务 Repository 必须在查询中带当前 userId；日志过滤 Authorization、Cookie、refresh token、BYOK key、完整 prompt 和模型回复。

AI 运行时使用结构化事件名输出可观测性：`AI_STREAM_*` 记录用户消息保留、Provider 选择、成功/中断/失败与耗时，`AI_EMBEDDING_*`/`AI_RETRIEVAL_SUCCESS` 区分向量化和检索阶段，`AI_PROVIDER_HTTP_*` 记录上游 host/path、解析地址数量、请求/响应字节数、SSE 行数、状态和耗时，`AI_SETTINGS_RESOLVED` 标记 BYOK 或 `ENV_DEFAULT` 来源。除 Overview 失败事件外，其它既有失败事件额外记录原始异常类名、单行截断后的 message 及 root cause 类名/message；Authorization、API key、token、secret、password 和 URL query 会脱敏。OpenAI-compatible completion 在响应 envelope 缺少有效文本 content 时记录 `AI_PROVIDER_RESPONSE_INVALID`，仅包含 provider、清洗且最多 64 字符的 modelId、choiceCount、allowlisted finishReason、content/reasoning 类型和字符数、usage/token 数量，不包含 prompt、响应正文、endpoint URL 或 key。资产直传和 Source 登记分别输出 `ASSET_UPLOAD_INTENT_*`、`ASSET_UPLOAD_COMPLETE_*`、`ASSET_UPLOAD_READY`、`ASSET_UPLOAD_REJECTED` 和 `SOURCE_CREATED`，可区分凭证申请、浏览器直传后的 HEAD 校验和登记阶段。未预期 HTTP 异常固定输出 `UNEXPECTED_API_ERROR`，携带 trace ID、HTTP 方法、无 query 的路径、异常类型和堆栈，响应仍保持脱敏的 Problem Details。日志只输出 UUID、host、模型、数量、长度、状态和稳定错误码，不输出完整 prompt、模型回复、文件内容或响应体；Overview 失败事件的 allowlist 见下文。

## 阶段 2B 实际 HTTP 表面

- Asset：`POST /api/assets/upload-intents`、`POST /api/assets/{id}/complete`、`POST /api/assets/{id}/download-url`；upload intent 要求用户范围的 `clientImportId`，通过数据库唯一约束和事务竞态重载实现幂等创建；同 key immutable metadata 冲突稳定返回 409 `MUTATION_REJECTED`，不同用户相互隔离。AssetStoragePort 提供 test 适配器与配置启用的 MinIO 适配器。
- Source：`POST/GET /api/sources`、`GET/PUT/DELETE /api/sources/{id}`、`POST /api/sources/{id}/restore`、`POST /api/sources/{id}/reingest`。
- Relation：`POST/GET /api/relations`、`GET/PUT/DELETE /api/relations/{id}`、`POST /api/relations/{id}/restore`。
- Source 的 ingestion worker、Tika 解析和 source_chunks/pgvector 已在阶段 5 后端基线接入；Source/Relation 列表同样使用稳定 keyset cursor；真实 MinIO、完整 PostgreSQL 门禁和生产分页性能仍不在本阶段验收范围。

Source 删除是可恢复的软删除：`AssetRetentionCleanupService` 默认保留 30 天，按小时扫描过期 Source 并物理删除对应 MinIO 对象；Asset 与 Source 元数据不硬删除，Asset 改为 `ORPHANED` 以保留审计和 KnowledgeBlock 外键可追溯性。可通过 `AURALIS_UPLOAD_ASSET_RETENTION_DAYS`、`AURALIS_UPLOAD_ASSET_CLEANUP_DELAY_MILLIS` 和 `AURALIS_UPLOAD_ASSET_CLEANUP_INITIAL_DELAY_MILLIS` 调整保留期与调度频率。

## 阶段 3/4 实际 HTTP 表面

- Sync：`POST /api/sync/push`、`GET /api/sync/pull`、`GET /api/sync/snapshot`；SyncService 校验活动设备，SyncMutationProcessor 在独立事务内原子完成幂等占位、领域命令、change log 和最终结果，并提供高水位不回退的不透明 cursor；snapshot 包含必要墓碑。`SyncRetentionService` 按配置定时清理 30 天外日志/幂等记录，保留高水位并记录清理与 reset 指标；scheduled 入口自身建立事务，避免同 Bean 调用绕过 `purgeExpired()` 的事务代理。
- Review：`GET /api/reviews/due`、`POST /api/reviews/events`、`GET /api/reviews/history`；ReviewService 使用版本化 FSRS-lite 参数集，SKIP 只写事件。
- Stats：`GET /api/stats/overview`、`GET /api/stats/weekly`；StatsQueryRepository 对所有聚合带 userId 条件，weekly 固定连续 7 天。JDBC repository 边界会把查询参数中的 `Instant` 统一转换为 `java.sql.Timestamp`，避免 PostgreSQL 驱动无法推断时间参数类型；SQL、HTTP response 和数据库 schema 不变。`StatsQueryRepositoryTests` 覆盖 `dueReviews`、`completedReviews`、`reviewed`、`studySeconds`、`completedTasks`、`createdKnowledge` 六个查询的全部时间参数，并断言 UUID 与参数顺序保留；`StatsServiceTests` 覆盖 overview/weekly 与完成时间统计。
- Realtime：`POST /api/realtime/ticket` 使用 Bearer access JWT 签发短期 ticket；`/ws/events` 仅由 `RealtimeWebSocketConfiguration` 的 WebSocket handler 承接，握手从 query `ticket` 或 `X-Realtime-Ticket` 消费 ticket，不设 MVC `GET` 回退路由。RealtimeService 对 ticket 做 hash-only 存储、一次性消费和设备归属校验，提交后事件监听器向用户级订阅者转发 Sync/Review 通知。

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
- V5/V7 Review schema、FSRS-lite 调度、完整状态快照/SKIP/复习事件幂等、Stats completed_at 用户隔离聚合、Realtime ticket hash/过期/一次性消费和提交后事件桥测试；`RealtimeWebSocketIntegrationTests` 以真实 HTTP upgrade 验证已签发 ticket 可在不携带 Bearer header 的 `/ws/events` 握手。
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

- `AssetStoragePort` 的 MinIO 实现使用服务端离线 SigV4 signer 生成 presigned PUT/GET URL：内部 endpoint 只用于容器内 HEAD/stat/open/delete，public endpoint 只写入浏览器 URL，不会被后端 SDK 反向连接；声明 sha256 时把 `X-Amz-Meta-Sha256` 一并交给客户端。完成阶段继续由服务端 HEAD/stat 校验 size、MIME 和 hash，下载签名失败记录脱敏的 `ASSET_DOWNLOAD_URL_FAILED` 事件。
- 上传校验失败会先持久化 `FAILED`，再尝试幂等删除对象；删除失败仍保留可审计数据库状态，并由 `scripts/audit-minio-assets.ps1` 做数据库/对象对账。
- `PgVectorIntegrationTests` 改为 Testcontainers PostgreSQL/pgvector，另有升级输入测试覆盖既有 V8 `embedding_json` 经 V9/V11 的 vector/HNSW/回填；`AiProviderResilienceTests` 覆盖 429、5xx、错误 JSON 和错误流事件。
- R2 真实依赖测试默认随 `mvn -B -ntp clean test` 执行；`postgres-it`/`minio-it` profiles 仍作为兼容别名保留。Docker Engine 不可用时默认测试应失败，而不是跳过容器集成测试。

## 阶段 5 AI/RAG 后端实现边界

- `ai` 模块通过 `AiProviderPort`、`EmbeddingProviderPort` 与统一的 `ProviderHttpClient` 适配 OpenAI-compatible/DeepSeek 聊天和 SiliconFlow embedding；Provider URL 使用 HTTPS 精确 allowlist、DNS 公网地址过滤与固定地址连接（混合解析结果只连接公网地址，全部为私网时拒绝），重定向关闭，并受超时/响应体上限约束。Provider client 将连接超时（`AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS`，默认 3000ms）与 response/read 超时分离；普通非流式 completion、stream、embedding 使用 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS`（默认 10000ms），Overview 通过 `AiProviderPort` 的显式 timeout overload 使用 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`（默认 120000ms，配置边界 60000–120000ms）。固定地址 TLS Socket 只使用连接超时。`SocketTimeoutException` 映射为 `MODEL_TIMEOUT`，由 API 返回 HTTP 504；其它 IOException 仍映射 `MODEL_UNAVAILABLE`/503。运行时凭据解析遵循“当前用户有效 BYOK → 服务端 env 默认 Provider”顺序；默认聊天 Provider 由 `AURALIS_AI_DEFAULT_PROVIDER` 决定，默认凭据使用 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY` 及对应模型/Base URL 配置。BYOK 使用 AES-GCM，日志、异常、DTO 与凭据 `toString()` 不回显 key。
- ingestion 由 Source 提交后事件触发，`IngestionJobService` 做用户/Source 归属和活动任务去重，并通过数据库锁定的 claim-next 分配租约；条件化 `IngestionWorkerScheduler` 自动轮询，lease 过期可恢复，失败按最大次数回到 PENDING，耗尽后进入 FAILED。`IngestionWorker` 负责解析、固定大小重叠切块、1024 维 embedding 和 chunk 替换。
- `RetrievalService` 只查询当前 userId 的活动 generation chunks。PostgreSQL 通过 `PgVectorRetrievalRepository` 执行带 user/source/active/deleted 过滤的 pgvector cosine SQL，由 HNSW 索引支持 top-k；非 PostgreSQL 环境使用活动 chunk 的 JSON cosine fallback。`SourceChunkService` 使用 generation 写入新 chunks，事务成功后切换 active，失败保留旧 generation。
- Conversation/Message 服务提供 owner-scoped CRUD、软删除、`@Version` 会话版本、写锁保护的消息序号、会话和 USER 消息的 `clientRequestId` 幂等回放及安全错误/断流状态持久化。流式请求先在短事务中锁定会话并保留唯一 USER 消息，Provider I/O 不持有数据库事务；assistant 以 `reply_to_message_id` 精确关联该 USER 消息。SSE 使用 Spring MVC，不引入 WebFlux；Controller 通过 sink 直接转发 Provider 增量，OpenAI-compatible 上游 SSE 解析为 `message.delta`，检索命中转为可回链 `citation` 事件。
- Suggestions 当前是类型化、可替换的确定性输出层，已完成 KnowledgeBlock owner check，但尚未接入真实 LLM 生成或 RetrievalService citation 组装。
- `POST /api/ai/source-overviews` 与 `POST /api/ai/subject-overviews` 是同步、无状态的结构化生成边界。前者经 `SourceService` owner/active/READY 校验后只通过 active 定向查询读取 ai 模块中的 chunks，并按完整 `auralis.ai.max-prompt-chars` prompt 长度分批归纳、分层归并且每次调用前精确检查上限；后者 owner-check Subject，并验证每个输入 Source 归属该 Subject、无重复且按 mode 有可用 part。服务端为模型分配短 alias，固定 SYSTEM 与独立 USER 数据隔离，map/reduce 全程只保留 alias；输出仅接受一个 JSON object/JSON fenced block，经数量、长度、alias 和 mode nullability 校验，当前无可信页码/block alias 因而强制 `locator=null`，仅最终响应回映射真实 Source UUID。Provider 输出解析/结构错误统一为 `502 MODEL_PROVIDER_ERROR`，客户端输入仍为 `400 VALIDATION_FAILED`。它们重用 `AiSettingsService`、`AiProviderRegistry` 和 `AiProviderPort.complete`，不创建 Conversation/Message，不写 sync/change log，也不新增数据库 schema、表或 Flyway migration；PC 才持久化派生结果。Overview 请求可携带 `X-Overview-Request-Id`；服务端将其规范为 UUID（非法或含敏感内容时生成新 UUID），为每次 user/source/revision 生成 `generationId`，并按 MAP、REDUCE、JSON_PARSE、SCHEMA_VALIDATE、CACHE_RETURN 输出阶段；失败日志只记录规范化 `requestId`、关联字段、阶段、allowlisted `errorCode`（DomainException code 或 `OVERVIEW_GENERATION_FAILED` 回退）及 exception/cause 类型，不记录原始 exception/cause 文本或 throwable stack。
- Task 14（2026-09-09）：Source ingestion 的 `PARSING`、`PENDING`、`INDEXING`、`READY` 和 `FAILED` 状态及安全失败诊断统一经 `SourceService` 实际持久化后发布既有 `SOURCE/UPDATE` 事件；重复相同状态/诊断不写版本或 change log。ParsedDocument complete 在保持外层事务和 Source 锁的前提下通过该入口转入 `INDEXING`；接受后的异常会将 document、Source、job 和 change-log 一并回滚，预校验失败仍持久化 `REJECTED`。
- S1 已通过 `V15__tauri_parsed_document_schema.sql` 冻结 `parsed_documents` 的 owner/source/revision、parser/normalization/OCR model、Asset/payload/plain-text SHA、私有 object key、status、generation 和生命周期字段；历史非 READY FILE 在迁移时进入 `AWAITING_CLIENT`，已有 READY FILE 与活动 chunks 保持不变。S2 已让 FILE create/Asset 替换/reingest 等待客户端解析并停止发布旧 ingestion event，TEXT/URL 保留服务端 event；S3 已实现 owner-scoped upload intent，S4 已实现有界 gzip/JSON/ordinal/hash validator 与 legacy Asset SHA 条件回填；S5 已在 Source 行锁内完成 complete 首胜、同 payload 幂等、冲突/过期错误和唯一 revision job 关联；S6 已让带 ParsedDocument 的 worker 消费重新验证后的 blocks、隔离旧 revision/generation、兼容 reingest 复用 accepted 结果，并由 cleanup scheduler 删除过期 payload 对象且保留元数据。

阶段 5/R1 自动验证：H2/JPA/MockMvc/Stub Provider/架构及受控网络测试覆盖 AI 基线；R1 定向套件验证 V14、会话重试、并发同请求仅一次保留和流式回放；overview focused MockMvc/service 测试覆盖请求界限、owner/READY/active 定向查询、mode/part、重复 Source、精确分层 prompt、alias-only map/reduce、SYSTEM/USER 注入隔离、locator、fenced JSON、Provider 502 与不可信 JSON/alias/node 输出；S1 `ParsedDocumentSchemaTests` H2 clean/upgrade 4/4、S3 `ParsedDocumentControllerTests` 3/3、S4 `ParsedDocumentValidatorTests` 4/4 与 `AssetShaBackfillTests` 2/2、S5 `ParsedDocumentCompleteTests` 3/3、S6 `AiIngestionWorkerTests` 5/5、`AiSourceChunkTests` 3/3、`ParsedDocumentCleanupTests` 2/2 通过，PgVector upgrade 断言已补充但本机 Docker 不可用。此前默认 `mvn -B -ntp clean test` 的 PostgreSQL 17/pgvector 与 MinIO 容器证据仍保留；AI 日志脱敏与生命周期定向测试 26/26 通过。真实 Provider、性能和前端联调仍未完成。
### 2026-09-15 Overview 最小 JSON 诊断（临时）

为复核真实 DeepSeek 最终 `JSON_PARSE` 失败，Provider 在最终已序列化的请求体发送前，仅对识别为 Overview 阶段的 structured JSON 请求记录 `AI_JSON_MODE`：`structuredJson=true`、`responseFormat=json_object`、`maxTokens` 与由预算推导的 `stage`。Overview FINAL 在既有 validator 前使用同一 Jackson `ObjectMapper.readTree` 直接检查原始 `message.content`，记录 `FINAL_JSON_CHECK` 的合法性、字符数、行列号和异常类型；该检查不做 fence stripping 或其它预处理，因此 fenced JSON 会记录为 `valid=false`，不代表后续既有 validator 一定拒绝。不记录请求体、prompt、响应正文、原始异常 message、URL 或凭据。诊断失败不会吞掉或改变既有 Provider 输出错误映射；普通聊天/流式不变。自动测试已覆盖 DeepSeek FINAL wire body 日志、multi-batch 最终调用边界、合法/非法/fenced FINAL 检查和日志脱敏；未部署，真实请求待用户重跑。
