# Auralis 变更记录

更新时间：2026-08-20

文档状态：现行历史记录

权威范围：已发生且可确认的产品、代码、文档和验证变化

事实来源：Git 提交、本轮实际验证记录与重构前快照

## Unreleased

### R4：Mobile / 微信新契约与隔离本地库（2026-08-20）

- Mobile 的 Auth、直接 DTO/Problem Details、共享 refresh、Sync opaque cursor/snapshot、Realtime ticket、AI SSE、Review、Stats 和 Asset upload-intent/PUT/complete 已切换到冻结 OpenAPI；生产代码不再使用固定本机地址、旧 `/ws/sync`、旧数值游标或旧 AI 路由。
- H5 与原生端按 userId/deviceId 新建独立本地 namespace；用户明确授权后，旧全局 `h5_db_*` 与 `_doc/auralis.db` 业务表在认证会话建立时一次性清除。同步冲突保留 pending mutation，手写笔记继续受 feature flag 控制且不进入云同步。
- Pinia 固定为 2.1.7 并与 Vue 3.4.21 对齐；三个 Tablet 逻辑脚本进入 `test:tablet`。`check:r4-mobile` 扫描 62 个生产文件、协议测试 20/20、Tablet 测试、type-check、H5 build 和微信 build 通过；真实 Server/MinIO/Provider、微信合法域名、开发者工具、双设备和真机未验收。
- Tablet Dashboard 改用服务端 overview/weekly 统计并移除随机热力图和虚构学科兜底；Tablet Review 改用 due/event 契约，只有不可变事件保存成功才推进卡片，右滑仅取消手势。静态门禁新增对应回归断言，H5 与微信构建重新通过。
- Tablet 独立 Stats 页面同步改用 overview/weekly 统计，移除静态连续学习值、随机周数据和 180 天伪热力图；页面映射、状态和 R4-07 执行记录已同步更新。
- 共享任务选择器不再注入 mock tasks；Mobile Pomodoro 完成专注时改为调用 Task Store 今日计数，空任务和完成反馈均来自真实端侧状态。
- Mobile Settings 移除固定“已加入 12 天”演示值；User DTO 未提供注册时间时显示中性跨端同步说明。
- Mobile Home 移除空任务时注入的 `demo-*` 日程，Profile 统计改用真实 Task/Block Store，并在无注册时间字段时显示中性账户元信息。
- Mobile 手写页移除 Mock 笔迹覆盖和伪 OCR/知识抽取成功流程；当前保留本地画布并提示识别服务未接通。
- Tablet Workspace 总结移除固定演示文案和延时伪造，改用 `chatWithAI` 真实 SSE 流；AI 失败时保持空态并提示错误。
- Tablet AI 历史会话改用 Conversation GET/DELETE，消息从服务端 DTO 恢复，删除携带版本；移除硬编码历史和图片识别伪结果，图片入口在上传链路未接通前明确提示。
- Mobile Pomodoro 今日计数改用 userId/deviceId 本地 namespace key，不再读取跨账号共享的全局 `pomodoro_counts`；新增协议回归断言，`test:r4-mobile` 通过 20/20。
- Tablet 新对话在首条消息前显式创建服务端 Conversation，并将真实 ID 传入 SSE，避免复用用户级缓存会话。

### R1/R4：AI 可靠性与离线恢复（2026-08-20）

- Identity 登录设备列表改为每用户/设备一条活动 refresh session：重复登录同一设备会撤销旧会话，Profile 不再展示同设备的旧会话为可撤销设备；撤销提示明确 access token 会按有效期自然失效。
- PC 不再把 BYOK key/base URL 保存为浏览器明文或附加到普通请求 header；正式个人中心内嵌的 BYOK 卡片仅通过 `PUT /api/ai/settings` 请求体提交 key，展示服务端脱敏状态并在成功后清空输入框。
- 核心资源的离线 CREATE 改为本地优先且保留同一 `resourceId/clientMutationId`；仅明确离线或传输失败进入 outbox，5xx/冲突不再伪装为离线成功。SSE 在 401 时共享一次刷新并以原请求 ID 重试。
- Chat 会话与待发送 USER 消息持久化稳定创建/请求 ID，在网络恢复后按会话和消息顺序恢复。服务端 V14 为会话恢复键和 assistant→USER 精确关联建模，流式 Provider I/O 移出数据库事务，并发重复请求只保留一次 USER 消息。
- `test:r4-pc` 58/58、PC type-check、OpenAPI artifact/两端生成比对、服务端专项 12/12 和含 MinIO/PostgreSQL/pgvector Testcontainers 的 `mvn -B -ntp clean test` 137/137 通过；真实 Provider 与浏览器业务联调仍未验收。

### R4：PC Task/Review/Stats/Chat、运行时与联调前门禁（2026-08-20）

- `useTaskStore`、`useReviewStore`、`useStatsStore`、`useChatStore`、`usePomodoroStore` 已切换到当前 typed DTO、用户/设备隔离 repository 和页面模型；Dashboard、Timeline、Profile、Home、SearchPalette、SubjectWorkspace、Pomodoro 不再以旧 `localDb` 或静态演示数据作为云端事实。
- Profile 增加当前 user/device/session 展示和其它会话撤销；AI `AiStreamController` 统一处理 SSE 增量、citation 去重、取消、中断和失败；Vite 开发代理改为环境驱动，Tauri 默认 capability 保持最小权限。
- R4 PC 静态检查扫描 57 个生产文件通过，`test:r4-pc` 53/53、type-check、Web build 通过；Tauri `--no-bundle` 生成 `src-tauri/target/release/app.exe`。完整 MSI bundling 返回宿主权限错误 `拒绝访问 (os error 5)`，因此安装包、GUI、真实服务和前后端业务联调仍未完成。

### R4：PC Subject/KnowledgeBlock/Source/Asset 主流程迁移（2026-08-20）

- 新增固定 DTO mapping、分页 cursor 和 optimistic mutation 测试；`useSubjectStore`、`useSourceStore`、`useKnowledgeStore`、`useAssetStore` 通过 typed API 和 user/device-scoped local repository 处理版本、软删除、离线 pending 与冲突边界。
- SubjectWorkspace、Asset、Home 的文件路径登记改为真实 Asset upload-intent → 对象存储 PUT → complete → Source create；目录更新使用 Source API，上传失败保留明确 pending/failed 状态，不伪造云端成功。
- 正式页面路径移除旧资料 snake_case、旧 `/api/ai/chat` 和兼容 Asset 调用；AI 伴读改用当前消息 SSE。R4 PC 静态检查、mapping/protocol/local repository/sync 测试、type-check、Web build 已通过；真实服务、GUI、Tauri、双设备和前后端业务联调仍未完成。

### 前端 AI 辅助开发约定（2026-08-17）

- 新增 `docs/agent/FrontendAIAssistedDevelopment.md`：前端实现默认优先使用 AGY/Antigravity 中当时可用的 Gemini，但要求对生成代码进行范围、契约、安全、视觉、响应式、可访问性和验证证据审查。
- 在文档入口、PC 模块和 Mobile/Tablet 模块中登记该约定；该偏好不改变后端、API、数据库、鉴权、密钥和人工验收规则。
- 已联网核对 Antigravity 官方关于模型选择、Review-driven development、代码 diff、walkthrough、浏览器检查和 workspace rules 的资料；当前 Codex 工作区没有直接调用 AGY/Gemini 的模型入口，因此不把本轮文档变更声称为 Gemini 生成。
- 补充 Codex 沙箱与宿主机 AGY 的边界：本机 `cmd.exe /c agy --version` 实测为 `1.1.13`，调用时需使用沙箱外的一次一审命令审批；文档给出 `where agy`、`agy models`、计划模式和前端任务调用示例，并明确禁止 `--dangerously-skip-permissions`。

### R3：OpenAPI 与客户端类型冻结（2026-08-17）

- 从 Spring MVC `/v3/api-docs` 导出并固定 `docs/contracts/openapi/auralis-openapi.json`；新增运行时 artifact 对比测试、可重复导出/生成/校验脚本和 GitHub Actions 契约漂移门禁。
- 使用固定 `openapi-typescript@7.13.0` 从同一 artifact 生成 PC/Mobile `schema.ts`，并增加由生成路径、方法、请求体、path/query 参数和成功响应类型约束的轻量请求客户端；两端均通过同一生成器重新生成比对。
- 在 API、Database、PC 与 Mobile/Tablet 文档中冻结 `/api` 版本边界、旧 `/ws/sync`/旧 DTO 退出策略、cursor 过期、版本冲突和未来强制升级行为；当前只完成契约/类型冻结，未宣称前后端联调或业务验收完成。
- 后端默认全量 `mvn -B -ntp clean test`（系统 Maven 与 Wrapper）均为 135 通过、0 失败/错误/跳过，PostgreSQL/MinIO 容器测试已自动执行；PC `npm run build`、Mobile `npm run type-check` 与 H5 `npm run build:h5` 均通过。Mobile TypeScript 已固定为 5.3.3 以匹配 `vue-tsc@1.8.27`；G3 契约迁移前置门禁通过，但前端页面仍未完成新契约迁移与联调。
- G3 已确认 G1/G2 阶段门禁、OpenAPI artifact、两端生成类型和契约 diff 均通过；该门禁只允许进入 R4 大规模客户端迁移，不代表真实 Provider smoke 或前后端业务验收完成。

### R2：真实依赖测试基线（2026-08-17）

- Compose 已切换为固定版本的 PostgreSQL 17/pgvector、MinIO、bucket 初始化和新 Server 健康检查，移除 Redis/Milvus/etcd 主依赖；`.env.example` 补齐数据库、JWT、AI 加密、CORS、MinIO、Provider 和超时变量，并将本地 AI 加密示例固定为 32 字节。
- 新增 Java 21 多阶段、非 root 后端 Dockerfile 与 `.dockerignore`；新增 Testcontainers 2.0.5 PostgreSQL clean/upgrade 测试、MinIO presigned PUT/HEAD/GET/delete 测试和 Provider 错误矩阵测试。
- MinIO 资产 intent 在声明 sha256 时传递签名 metadata；完成校验失败尝试清理对象，并新增数据库/对象孤儿核对脚本。
- `docker compose --env-file .env.example config --quiet`、backend/frontend 镜像构建、Compose db/MinIO/backend/frontend 启动与健康检查均通过；PostgreSQL 17.11 + pgvector verify 135/0/0（另 1 个非 PostgreSQL opt-in 测试跳过）、MinIO 真实链路 1/1、Provider stub 2/2 通过。真实 Provider chat/embedding smoke 和 MinIO 异常路径仍需显式模型、密钥与网络条件。

### R1-06：后端工具链和运行配置（2026-08-17）

- 修复 Windows Maven Wrapper 对普通 Maven 仓库目录的空 `Target` 索引异常；`.\mvnw.cmd -v` 和 `.\mvnw.cmd -B -ntp clean test` 均可运行。
- 全局关闭 `spring.jpa.open-in-view`；prod profile 显式关闭 springdoc API docs 和 Swagger UI，local OpenAPI smoke 保持可用。
- H2 固定到 2.2.224，Surefire 配置 Mockito 5.23.0 Java agent，并在默认生命周期自动启用 PostgreSQL/MinIO Testcontainers；定向配置测试 6/6、系统 Maven 与 Wrapper 全量各 135 通过、0 失败/错误/跳过。
- G1 已通过；该证据仍不包含真实 Provider、生产 secret 或 GUI/真机验收。

### R1-05：并发、版本和分页（2026-08-17）

- 新增 Flyway V13，为 Conversation 增加 `version` 与 `next_message_sequence`；删除严格校验 `baseVersion`，消息追加通过会话行写锁和计数器分配序号，移除 `max + 1` 竞争窗口。
- Subject、KnowledgeBlock、Task、Source、Relation 列表接入带资源类型校验的不透明 keyset cursor，支持 `limit=1..200`，返回稳定 `nextCursor` 与 `hasMore`。
- Sync 保留清理增加可配置定时任务，并记录清理行数、失败数和过期 cursor reset 指标；清理不回退用户 cursor 高水位。
- 新增 R1-05 并发、版本、分页边界、清理恢复、指标和 Modulith 架构测试；定向套件 16/16、全量后端 `mvn -B -ntp clean test` 126 通过、0 失败/错误、1 个 opt-in PostgreSQL 测试跳过。真实 PostgreSQL 全量并发、生产调度、前端联调和人工验收仍未完成。

### R1-03：pgvector 检索和原子切换（2026-08-17）

- 新增 Flyway V10/V11：source chunk generation/active cutover、活动 chunk 查询索引，以及 PostgreSQL 历史 JSON embedding 回填。
- PostgreSQL 写入同时保存 `embedding_json` 和 `vector(1024)`；检索使用带用户、活动 generation、Source 删除过滤的 pgvector cosine SQL 和 HNSW，H2 保留 JSON fallback。
- chunk 重建先写入新 generation，事务成功后切换 active；数据库失败时旧 generation 保持可检索；Source 删除和用户隔离均进入检索过滤。
- 2026-08-17：R1-03 定向测试 11/11 通过；PostgreSQL 17.11 + pgvector 隔离容器集成测试 1/1 通过。该证据不包含完整 Compose、MinIO、真实 Provider、lease fencing、性能、前端联调或人工验收。

### R1-04：AI 请求与真实流式（2026-08-17）

- 新增 `V12__ai_message_client_request_id.sql`，为 AI USER 消息提供用户隔离的 `clientRequestId` 唯一键；重复请求回放已有 assistant 结果，不重复调用 Provider。
- `retrievalEnabled`、动态 topK 校验和 SiliconFlow embedding → pgvector/JSON retrieval 已进入消息执行链；citation 事件携带 Source/chunk 可追踪字段。
- Controller 改为 callback 式 SSE，Provider 增量直接写入 `StreamingResponseBody`；OpenAI-compatible 适配器解析上游 `data:`/`[DONE]`，并统一映射超时、限流、断流、错误和 assistant FAILED/INTERRUPTED 状态。
- 2026-08-17：R1-04 定向 AI 流式/Provider/Controller 测试 16/16 通过，全量后端测试 121 通过且 1 个 opt-in PostgreSQL 测试跳过。证据使用 Stub/受控 HTTP，不包含真实 Provider 网络/证书/配额、前端联调或人工验收。

### 后端绿地重写阶段 5：AI/RAG 后端基线（2026-08-16）

- 新增 Flyway V8/V9：AI credential、ingestion job、source chunks、Conversation/Message，以及 PostgreSQL pgvector/HNSW 条件迁移；H2 使用 JSON embedding 列完成可测试基线。
- 新增 BYOK AES-GCM 加密、用户/Provider 配置、OpenAI-compatible/DeepSeek 聊天适配器和 SiliconFlow 1024 维 embedding 适配器；API/DTO 不回显 key。
- Source 提交后触发 ingestion job，支持文本/文本型文件/URL 解析、固定重叠切块、embedding 持久化、用户隔离 cosine retrieval 和安全失败状态。
- 新增 owner-scoped Conversation/Message、`/api/ai/messages/stream` MVC SSE 生命周期事件和类型化 Suggestions 基线。
- 修复默认 local profile 缺少 AI 加密 key 导致应用上下文无法启动的问题；生产仍要求 `AURALIS_AI_ENCRYPTION_KEY`。
- 2026-08-16 `mvn -B -ntp clean test` 通过：92 个测试全部通过，包含 Spring context、Flyway V1–V9、JPA validate、MockMvc、AI/RAG 单测和架构测试。未包含 PostgreSQL/pgvector、MinIO、真实 Provider、性能/安全专项、前端联调和人工验收。

### 阶段 3/4 审核修复（2026-08-14）

- Sync push 改为每条 mutation 独立事务内的幂等占位、领域写入、change log 与最终决策原子提交；同一 `clientMutationId` 的 hash 冲突按单条 `REJECTED` 返回，不中止同批其他 mutation。
- 新增 V6 cursor 高水位表，游标分配使用锁定的用户行，change log 保留清理后不回退；snapshot 在 REPEATABLE_READ 事务内读取包含删除墓碑的全量资源视图，pull payload 改为 JSON 节点。
- 新增提交后实时事件桥，覆盖 REST/Sync 资源变更和 Review 更新；Review 幂等重放使用事件保存的完整 afterState；任务新增 V7 `completed_at`，weekly 完成任务按进入 DONE 时间统计。
- 新增审核回归测试后，`Auralis-Server\mvnw.cmd -B -ntp clean test` 退出码 0：27 个测试类、69 个测试用例全部通过，失败/错误/跳过均为 0，包含并发 cursor 与并发 mutation 重放。证据仍限于 H2/JPA/MockMvc/架构测试，不包含 PostgreSQL、Docker、真实 MinIO、双设备、浏览器 WebSocket、跨实例 broker、前端联调或人工验收。

### 后端绿地重写阶段 3/4：Sync、Review、Stats、Realtime（2026-08-13）

- 新增 Flyway `V4__sync_schema.sql`，创建用户域 `change_log`、设备 mutation 幂等表 `inbound_mutations`、保留清理索引和资源/操作约束；REST 直接写入与 Sync push 通过 shared `ResourceChangedEvent` 进入统一 change log。
- 实现 `/api/sync/push`、`/api/sync/pull`、`/api/sync/snapshot`，支持活动设备校验、不透明 cursor、幂等重放、请求 hash 冲突、版本冲突、REJECTED 结果和 30 天清理入口；当前 snapshot 返回活动资源，墓碑通过 pull change log 获取。
- 新增 Flyway `V5__review_stats_realtime_schema.sql`，创建版本化 Review 参数集、ReviewState、不可变 ReviewEvent 和一次性 Realtime ticket 表；实现 FSRS-lite due/event/history、SKIP 语义、overview/weekly 用户隔离统计及 hash-only ticket/进程内用户事件桥。
- 2026-08-13 `Auralis-Server\mvnw.cmd -B -ntp clean test` 退出码 0：27 个测试类、61 个测试用例全部通过，失败/错误/跳过均为 0；`git diff --check` 通过。证据限于 H2/JPA/MockMvc/架构测试，不包含 PostgreSQL、Docker、真实 MinIO、双设备、浏览器 WebSocket、跨实例 broker、前端联调或人工验收。
- 未关闭风险：Sync 游标并发/清理后的高水位连续性，以及 snapshot 包含墓碑的完整冷启动契约，已登记到 `docs/current/IssuesAndReview.md`。

### 后端绿地重写阶段 2B：Source、Asset、Relation（2026-08-13）

- 新增 Flyway `V3__source_asset_relation_schema.sql`，创建 `assets`、`sources`、`relations`，并为 `knowledge_blocks.source_id` 增加 Source 外键、索引和删除约束。
- 实现 Source FILE/TEXT/URL CRUD、版本/墓碑/恢复、reingest `PENDING` 边界，以及 KnowledgeBlock 的活动 Source/用户归属校验。
- 实现 Asset 上传 intent、对象完成时 HEAD/stat 元数据校验、READY 下载 URL、失败状态持久化和用户前缀；对象存储通过 `AssetStoragePort` 抽象，test profile 使用可控适配器，配置开启后使用 MinIO presigned PUT/GET。
- 实现 Relation 端点类型/用户/活动状态校验、`RELATED_TO` 无向去重、版本/墓碑/恢复，以及通过 shared `ResourceDeletedEvent` 的端点删除级联。
- 2026-08-13 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，42 个自动测试全部通过；PostgreSQL、Docker、真实 MinIO、ingestion worker、前端联调和人工验收仍未完成。

### 后端绿地重写阶段 2A：核心领域（2026-08-12）

- 新增 Flyway `V2__core_domain_schema.sql`，创建 `subjects`、`knowledge_blocks`、`tasks`，统一使用 UUID、用户归属、JPA `@Version`、审计时间和软删除墓碑；KnowledgeBlock 的 `source_id` 暂作为阶段 2B Source 接入前的可空字段。
- 实现 Subject、KnowledgeBlock、Task 的 Entity、Repository、显式 DTO、领域服务和 REST Controller，覆盖创建、查询、更新、软删除、恢复、用户隔离和精确 `baseVersion` 冲突。
- 注册用户同事务创建受保护的“未分类”默认 Subject；默认 Subject 不可删除，KnowledgeBlock/Task 不可引用其他用户或已删除 Subject。
- 将认证主体移入 shared security named interface，解除 identity 与业务模块的 Modulith 循环依赖；更新阶段1测试清理夹具以遵守新表 `ON DELETE RESTRICT`。
- 2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，31 个自动测试全部通过；PostgreSQL/pgvector、Docker、MinIO、Source/Asset/Relation 和三端联调仍未执行。

### 后端绿地重写阶段 1：Identity 与认证（2026-08-12）

- 在新 `com.auralis.app` 后端加入 Spring Data JPA、Spring Security、OAuth2 Resource Server、Flyway、PostgreSQL runtime 和 H2 test scope；创建面向干净数据库的 `V1__identity_schema.sql`，包含 `users`、`devices`、`refresh_sessions` 及归属/rotation 索引。
- 实现 User、Device、RefreshSession Entity 和 owner-scoped Repository 查询；refresh token 只保存 SHA-256 hash，access JWT 默认 15 分钟，refresh session 默认 30 天。
- 实现注册、登录、refresh rotation、重放撤销整个 rotation family、登出、当前用户、会话列表和会话撤销；公开错误统一为 Problem Details，凭据失败使用 `UNAUTHENTICATED`，跨用户会话访问不泄漏归属。
- 新增 Auth MockMvc 测试，覆盖用户隔离、密码/JWT、过期/撤销/重放、refresh token 误用、字段校验和安全错误；2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，19 个测试全部通过。
- 使用 H2 test-scope classpath 运行 test profile HTTP smoke：health liveness 和 OpenAPI 返回 200，register 返回 201，login 返回 200 且 token pair 存在。PostgreSQL/pgvector、Docker、MinIO、Testcontainers 和人工三端验收未执行。

### 后端绿地重写阶段 0（2026-08-12）

- 在 `Auralis-backups\\20260812-205737` 创建仓库外可恢复备份：完整归档 152 个文件、210984 bytes，SHA-256 为 `C59AD2AB39F05B114D7B13FAA948C8A8ED29CB0CA1F26DDBCF04794B431C4BEC`；空 Server 工作树补丁为 0 bytes，归档展开复核通过。
- 将旧 `Auralis-Server` 精确移动到备份目录的 `Auralis-Server-source`，在原路径创建新 Server；PC、Mobile、docs 其他范围和 Compose 未因替换命令被递归移动。
- 新 Server 固定为 Java 21、Spring Boot 4.1.0、Spring Modulith 2.1.0、`com.auralis.app`；移除旧 `com.auralis.server`、MyBatis/Redis/Milvus/etcd/JJWT/LangChain4j/MinIO 等依赖和旧统一 `Result`。
- 建立 12 个 Modulith 模块边界、配置绑定、Trace ID、RFC Problem Details、Actuator 健康检查和 `Auralis API` OpenAPI 基础；阶段 0 不开放 Auth、业务对象、同步、AI/RAG、WebSocket 或数据库路由。
- 验证证据：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，5 个测试通过并生成 4 份 Surefire 报告；真实启动 smoke 的 readiness/liveness 为 HTTP 200 + `UP`，OpenAPI 与 Swagger UI 为 HTTP 200。Docker、数据库、MinIO、前端联调、GUI、真机和业务验收未执行。

### 前端重构进度与现行文档同步（2026-08-12）

- 更新 `docs/README.md`、`AGENTS.md`、当前状态、风险登记、PC/Mobile/Tablet 模块和前端设计文档，使正式路由、近期视觉改动、构建证据与人工验收边界保持一致。
- 明确 PC 当前为 8 条正式路由，并登记 Pomodoro、工作区、导航、弹窗和 Mobile/Tablet 热力图等近期代码变化。
- 记录本轮验证：PC 两个静态契约检查通过，TS5101 已通过配置调整解除，但生产构建继续受 TS6133 阻塞；Mobile H5、微信小程序构建和 Tablet 侧栏检查通过，仍需 GUI/真机验收。

### PC TypeScript 6 构建配置修正（2026-08-12）

- 从 `Auralis-PC/tsconfig.app.json` 移除已弃用的 `baseUrl`，保留 `@/*` 的 `paths` 映射；PC 两个静态契约检查继续通过。
- 修正后生产构建已越过 TS5101，但进一步暴露 `Auralis-PC/src/components/layout/AppHeader.vue` 的未使用 `ElMessage` 导入（TS6133），因此仍未形成完整 PC bundle 验证。
- 随后删除未使用的 `ElMessage` 导入，2026-08-12 `npm.cmd run build` 通过（3477 modules）；Vite 仍提示部分 chunk 超过 500 kB，待后续评估拆包。

### 平板与手机端热力图可配置化与自适应布局（2026-08-11）

- 改造了 `HeatmapChart.vue` 组件，使其支持动态传入 `weeks` 属性配置显示的周数（默认 16 周），并根据周数动态调整标题文本（5周及以内显示“近一个月”）。
- **优化热力图视觉**：强制所有热力格子为严格的正方形（`aspect-ratio: 1/1`）。为了解决短期数据（如近一个月，5周）导致中间窄条且两侧留白过多的问题，引入了自适应布局：当 `weeks <= 5` 时，自动从纵向 GitHub 风格切换为更舒展的 7列 x 5行“标准日历”横排布局，在保持禅意留白的同时，使网格能更均匀地分布在宽屏卡片中。
- 在平板端首页 (`Auralis-Mobile/src/pages/tablet/dashboard/index.vue`) 的热力图组件中显式传入 `:weeks="5"`，确保大屏下只展示一个月的数据并触发日历布局。
- 修复了平板端首页横幅（Hero Banner）卡片的渐变背景色，将其从旧的硬编码绿色（包含不合规的 `#687f5d`）统一为前端设计文档 (`Frontend.md`) 中规定的 `Primary Gradient` 品牌线性渐变（`linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)`）。

### 文档体系

- 建立以 `docs/README.md` 为唯一入口的分类文档体系。
- 新增 Agent 强制协议、权威边界、状态词典、回写矩阵和交接模板。
- 完整归档 2026-07-10 重构前 35 份旧文档，并保留当时未提交的文档修改。
- 新增项目、设计、模块、契约、运维、当前状态和计划文档。
- 旧现行路径已切换，现行链接、根目录、元数据和旧路径扫描通过。

### 本轮验证

- PC：2026-07-10 `npm.cmd run build` 通过（`vue-tsc -b && vite build`）。
- Mobile：2026-07-10 `npm.cmd run build:h5` 和 `npm.cmd run build:mp-weixin` 通过。
- Tablet：2026-07-10 `node scripts\check-tablet-sidebar-transition.mjs` 通过，120ms 指示器在 160ms 路由重载前落位。
- Server：2026-07-10 `mvn test` 通过；Maven 日志显示没有测试源码，不能当作业务测试覆盖。
- Mobile H5 构建保留动态/静态 import 和 Sass legacy API 非阻断警告。

### PC 学科图标兼容（2026-07-13）

- 新增 `src/utils/subjectIcon.ts`：学科图标统一兼容 Emoji 与历史名称（如 `book`、`code`），空值或未知名称回退为书本图标；大厅、工作区、首页和时间线使用同一解析逻辑。
- `node scripts\check-subject-icon-rendering.mjs` 与 `npm.cmd run build` 已通过；浏览器/Tauri 显示仍待人工验收。

### PC 新建学科线条图标（2026-07-14）

- 引入了更精致、具有现代细腻设计感的第三方图标库 `lucide-vue-next`。创建学科弹层改用 16 个 Lucide 线条图标（如 BookOpen, Sigma, Sparkles 等），完全符合“极简禅意”设计目标，同时保留原有语义键以向后兼容；大厅、首页和工作区用同一解析器渲染。
- 已有 Emoji 学科不迁移，编辑时未重选图标会原样保存；原生任务学科下拉保留旧 Emoji 前缀但不输出新的语义键。
- 应用入口加载 `element-plus/theme-chalk/el-icon.css`，确保图标容器及 SVG 按指定尺寸渲染。
- 移除创建学科的主题色选择；新建学科默认色及工作区左下角学科图标底色统一为 Sage Green `#7D9372`，图标使用白色。
- 全局功能侧栏学科入口复用同一图标解析器，直接渲染语义线条 SVG；保留既有 Emoji 分支，底色统一为 Sage Green `#7D9372`。
- 2026-08-10：修复 PC 首页 (Dashboard) 左侧栏及任务创建弹窗因未正确调用 `subjectIcon` 解析器而直接输出语义键文本 (如 `math`, `laptop`) 的渲染 Bug，并将 Dashboard 加入静态脚本契约 (`check-subject-icons`) 校验范围。当前该检查及 `npm.cmd run build` 已重新验证通过。
- 2026-08-10：重构 PC 首页 (Dashboard) 左侧栏“全部”选项的展现样式，将其从普通列表项提升为独立的全局视图卡片 (Global View Card)，以清晰区分全局知识流与专属学科空间。
- 2026-08-10：统一 PC 任务编排中心 (Timeline) 的日/周视图切换按钮样式，对齐首页 (Dashboard) 的全圆角胶囊无 Emoji 设计，保持极简禅意视觉语言的一致性。
- 2026-08-10：全局替换了 16 个默认学科语义线条图标 (`src/utils/subjectIcon.ts`)，使用更加柔和、抽象的图形 (如 `Feather`, `Orbit`, `Telescope`, `Infinity`) 替代了此前较为硬核的组件；同时，将全局左侧栏 (`AppSidebar.vue`) 的核心导航图标也由 Element Plus 默认图标替换为了一致的 Lucide 线条图标，并特意采用 `LayoutDashboard` (首页看盘) 和 `Compass` (学科大厅) 以避免视觉上的重复感，全面提升了界面的“极简禅意”美感。
- 2026-08-10：在排期页 (`Timeline/index.vue`) 完整复刻了首页 (`Dashboard/index.vue`) 的现代卡片化新建任务弹窗，包括网格化胶囊学科选择器与可拖拽交互的长条形专注时长配置条，统一了全局核心交互体验与视觉范式。

### PC 学科工作区原型（2026-07-13）

- 文件选择改为中栏 Markdown 总结；文件项移除右侧操作按钮。
- 大纲改为“AI 梳理”与圆形“+”顶栏，支持左栏内联新增、章节排序与限定在章节内的小节排序；当前不持久化。
- 2026-07-14：右侧 AI 伴读完整复刻手机端的渐变四芒星、脉冲星环、消息气泡、三点输入中状态和纯文本胶囊输入；保留现有 `streamFetch`、模型菜单与学科/文件上下文，不提供附件或麦克风入口，清空和发送均有可读标签。
- 2026-07-26：优化知识块阅读弹窗和手动录入界面的排版与样式。阅读界面采用统一的 Markdown 渲染样式 (`.summary-markdown`)，优化了标题字号和时间标签的微标展现；编辑界面的输入框应用了标准 `.styled-textarea`，支持 Focus 光晕和高度自适应。
- 2026-07-26：重构大厅（Home）页面的“手动录入知识块”、“创建学习任务”、“登记本地材料”弹窗，将其样式统一为全局标准的 `.modal-container`，实现与其他核心业务弹窗的视觉及动效一致性。
- 2026-07-26：重构工作区（Workspace）的“手动录入知识块”和“创建学习任务”弹窗，将其样式统一为全局标准的 `.modal-container`。
- 2026-07-26：优化排期布局页（Timeline）顶栏，去掉多余的“认知负荷”数据展示，并将待排期、已完成和专注时长这三个核心指标收纳为紧凑的药丸标签（Pill Tags）放置在标题与操作按钮之间，大幅提升了屏幕空间利用率与信息层级。
- 2026-08-11：在 PC 端完成专注时钟（Pomodoro）功能移植。移除了移动端的 `rpx` 与 `<view>` 标签限制并重写了样式；针对 PC 宽屏引入了大圆角胶囊状的任务选择器；移除了全局顶栏多余的占位图标；在大纲编排模式中新增了章节与小节的删除功能，进一步完善核心流程。

### 已确认的近期工作树变化（待随当前功能分支验证）

- PC 前端继续向 Zen Minimalist 体系对齐，使用禅白、鼠尾草绿和发丝边框。
- PC 首页移除知识流上方统计/热力图卡片及副标题。
- PC 依赖中 Tauri JavaScript API、CLI 与 Rust Tauri 统一为 `2.11.1`。
- Mobile / Tablet 的近期布局、图表、设置与 workspace 改动已在日期快照保留。

这些条目来自当前工作树和历史记录；只有任务 9 中命令实际通过后，才会追加本轮验证结果。

## 2026-07-10

### 已确认

- `d752b62`：项目目录名称从 StudyCore 更新为 Auralis。

## 2026-07-09

### 已确认

- `78c46de`：完成 Tablet workspace 重构、统一头部高度并修复侧栏收起 CSS。

## 2026-07-08

### 已确认

- `2babfbe`：默认隐藏 Tablet 手写笔记入口。
- `e2a09a9`：新增 Tablet 手写笔记本地存储。
- `4db4347`：新增 Tablet 手写专项计划。
- `dcdd5db`：整合 v3 Tablet 工作流。

## 2026-06-10

### 已确认

- `7384215`：重设计复习、统计、设置和个人资料页面为极简线性风格。

## 维护规则

- 只记录已发生并可追溯到提交、命令或人工记录的变化。
- 未来任务进入 `planning/`，未关闭风险进入 `current/IssuesAndReview.md`。
- 历史命令结果必须标明日期，不能写成当前验证。
- 重大发布应记录版本、环境、构建结果、迁移、回滚点和人工验收设备。
