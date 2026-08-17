# Auralis 部署测试前主任务清单

更新时间：2026-08-16

文档状态：现行任务清单

目标：完成进入部署测试前的代码收口、真实依赖验证、全端迁移、跨端验收和发布准备。

依据：[整体项目未完成项综合审计](../current/OverallProjectCompletionAudit.md)

## 使用规则

- 按 R0 → R6 顺序推进；同一阶段内可并行。
- P0 必须关闭；P1 原则上关闭，确需保留时必须记录影响和补偿措施；P2 可排入后续优化。
- 代码存在、构建通过、自动测试、真实联调和人工验收分别记录。
- 每项任务只有在“完成条件”全部满足后才能勾选。
- 本清单终点是“允许开始部署测试”，不包含实际部署测试和生产发布。

## 范围外

- Tablet 手写笔记云同步。
- 微信之外的其它小程序平台。
- 旧 Server 数据自动迁移。
- 跨实例事件 Broker。
- AI 自动执行领域写操作。

## 阶段总览

| 阶段 | 目标 | 阶段门禁 |
| --- | --- | --- |
| R0 | 冻结范围和工作基线 | G0：范围、排除项和执行规则确认 |
| R1 | 修复后端正确性和安全问题 | G1：后端具备冻结契约的条件 |
| R2 | 建立真实依赖测试环境 | G2：PostgreSQL、pgvector、MinIO、Provider 测试通过 |
| R3 | 固定 OpenAPI 和客户端类型 | G3：客户端可基于稳定契约迁移 |
| R4 | 完成 PC、Mobile、微信和 Tablet 迁移 | G4：旧接口和旧实时协议退出主路径 |
| R5 | 完成跨端和人工验收 | G5：候选功能链路通过 |
| R6 | 完成 CI、制品、监控和文档准备 | G6：允许开始部署测试 |

---

## R0：范围和基线

### R0-01 冻结首个候选版本范围（P0）

- [x] 确认目标端：PC Web、PC Tauri、Mobile H5、微信小程序、Tablet 主工作区。
- [x] 确认“范围外”列表继续有效。
- [x] 为注册登录、资料上传、学习工作区、同步、复习、统计和 AI 对话定义验收结果。
- [x] 将范围同步到 `docs/project/ProductRequirements.md`、`docs/current/Status.md` 和 `docs/current/IssuesAndReview.md`。

完成条件：目标端、主流程、排除项和验收负责人角色均已写入现行文档。

执行记录：

日期：2026-08-16
提交：`958aa43`（范围冻结文档提交）
命令：文档内容核对；`git diff --check`
结果：目标端、范围外项、7 条主流程验收结果和 5 类责任角色已同步；未改变任何模块的验收状态。
人工证据：无；本项是产品范围与证据口径冻结，不替代 GUI、真机或真实依赖验收。
剩余限制：R0-02 工作树保护与 G0 阶段门禁仍未完成；主流程的实现和验收证据仍按后续 R1-R5 任务推进。

### R0-02 保护当前工作树（P0）

- [x] 记录当前分支、提交和 `git status --short`。
- [x] 将后续任务按后端、契约、客户端、基础设施和文档拆分提交。
- [x] 不覆盖当前未提交修改；任务开始前检查目标文件是否已有用户改动。

完成条件：每个执行任务都有明确修改范围，能够独立审查和回退。

执行记录：

日期：2026-08-16
提交：基线提交 `daf88e5`；任务清单回写提交 `76e89d2`
命令：`git branch --show-current`；`git rev-parse HEAD`；`git status --short`
结果：当前分支为 `agent/backend-phases-2b-5-baseline`，基线 HEAD 为 `daf88e52078f42354e47520cd0c04cafb9ff3c19`；工作树仅有 `?? .claude/`，具体文件为本机 `.claude/settings.local.json`。该目录未被纳入提交或修改。
修改边界：后端为 `Auralis-Server/`；契约/数据为 `docs/contracts/` 与对应迁移/实体；客户端为 `Auralis-PC/`、`Auralis-Mobile/`；基础设施为 Compose、Dockerfile、环境变量和部署配置；文档为 `docs/`。接口或数据变更所需契约回写与对应变更保持同一可审查范围。
剩余限制：当前分支相对 `origin/agent/backend-phases-2b-5-baseline` 领先 R0-01 的 2 个提交；未提交的 `.claude/` 本机配置仍保留在工作树中，后续任务继续避开。

### G0 阶段门禁

- [x] R0-01、R0-02 完成。
- [x] P0/P1/P2 定义和任务勾选规则得到统一使用。
- [x] 未把范围外能力加入当前候选版本。

执行记录：

日期：2026-08-16
证据：R0-01 提交 `958aa43`、`daf88e5`；R0-02 提交 `76e89d2`、`a3ff762`；本轮仅新增范围、工作树基线和任务证据文档，未新增候选功能。
结果：G0 阶段门禁满足，R1 后端正确性和安全任务可开始；G0 不代表后端、真实依赖或客户端联调已验收。

---

## R1：后端正确性和安全

### R1-01 BYOK 与出站网络安全（P0）

主要范围：`Auralis-Server/src/main/java/com/auralis/app/ai/`、相关安全测试。

- [x] Provider URL 拒绝回环、私网、链路本地地址、危险端口和非 HTTPS。
- [x] DNS 解析前后都执行地址校验，限制重定向并防止 DNS 重绑定。
- [x] Provider key 只以密文存储，日志和异常不输出明文或密文。
- [x] 请求超时、最大响应大小和允许的 Provider 策略实际生效。
- [x] 增加 SSRF、重定向、DNS、超时和密钥泄漏测试。

完成条件：安全测试通过，所有出站请求走统一安全策略。

执行记录：

日期：2026-08-16
提交：`5da0378`（`fix(ai): harden provider outbound security`）
命令：`mvn -B -ntp clean test`；`git diff --check`
结果：退出码均为 0；103 个测试全部通过，失败/错误/跳过均为 0。实现 Provider HTTPS 精确 allowlist、默认/显式 443 端口、IPv4/IPv6 公网地址校验、固定 DNS 地址连接、Provider 禁止重定向、来源 URL 每跳重校验、超时和响应体上限；受控网络测试覆盖手动重定向、地址固定、超时安全错误和 key 脱敏。
剩余限制：真实 Provider 的 DNS/证书/代理/429/5xx/限流和生产 secret rotation 仍由 R2-05 与 P1-Phase5-Provider-Security 风险跟踪；本项不等同于真实外部服务或前端联调验收。

### R1-02 摄取任务自动执行（P0）

主要范围：AI ingestion job、worker、调度和测试。

- [x] 实现安全的 claim-next、租约、超时、重试和失败终态。
- [x] Source 创建、更新和 reingest 后能够自动处理，不依赖手工调用 worker。
- [x] 服务重启后可恢复未完成任务，重复执行保持幂等。
- [x] 增加并发 worker、租约过期、重试和永久失败测试。

完成条件：任务可自动从 PENDING 进入 READY 或 FAILED，测试日志不再显示缺少必要调度器。

执行记录：

日期：2026-08-16
提交：`6707034` (`fix(ai): automate ingestion job processing`)
命令：`mvn -B -ntp "-Dtest=AiConfigurationTests,AiIngestionSchedulerTests,AiIngestionJobTests,AiIngestionWorkerTests" test`；`mvn -B -ntp clean test`
结果：定向测试 7/7、全量测试 108/108 通过，失败 0、错误 0、跳过 0；实现数据库悲观锁 claim-next、PARSING/INDEXING lease 过期恢复、最大次数重试、FAILED 终态、条件化定时 worker，以及 Source 失败回到 PENDING 的状态同步。
剩余限制：当前仍没有 lease fencing、完整 PostgreSQL/崩溃恢复证据；generation 和旧新索引原子切换已由 R1-03 完成，并由 P1-Phase5-Ingestion-Fencing 继续跟踪剩余风险。

### R1-03 pgvector 检索和原子切换（P0）

主要范围：`source_chunks`、Flyway、Repository、retrieval service。

- [x] embedding 写入 PostgreSQL `vector(1024)` 列。
- [x] 相似度检索使用 pgvector SQL 和 HNSW，而不是加载全部 JSON 后在 Java 计算。
- [x] chunk 重建使用 generation 或等价原子切换，失败时保留旧可用索引。
- [x] Source 删除、重建和权限变化能够及时影响检索结果。

完成条件：真实 PostgreSQL 集成测试证明向量写入、索引查询、用户隔离和失败回滚均正确。

执行记录：

日期：2026-08-17
实现：Flyway V10/V11、`PgVectorSourceChunkRepository`、`PgVectorRetrievalRepository`、generation/active cutover 和 H2 活动 generation fallback。
命令：`mvn -B -ntp clean "-Dtest=AiSchemaTests,AiRetrievalTests,AiSourceChunkTests,AiIngestionWorkerTests" test`；`mvn -B -ntp "-Dauralis.postgres.it=true" "-Dtest=PgVectorIntegrationTests" test`；`git diff --check`
结果：定向 H2/schema/worker/retrieval 测试 11/11 通过；PostgreSQL 17.11 + pgvector 真实容器集成 1/1 通过，验证 HNSW、vector(1024) 写入、用户隔离、非正相似度过滤、Source 删除过滤和失败 generation 回滚；V11 回填历史 `embedding_json`。
剩余限制：本项使用临时隔离 PostgreSQL 容器，未启动仓库旧 compose；完整 PostgreSQL 全模块门禁、MinIO、真实 Provider、lease fencing、性能和前端联调仍由 R2/P1 风险跟踪。

### R1-04 AI 请求与真实流式（P0）

主要范围：AI message command、streaming service、Provider adapter、Controller。

- [x] `retrievalEnabled`、`topK`、`clientRequestId` 实际进入执行链。
- [x] `topK` 使用正确的数值范围校验。
- [x] `clientRequestId` 支持安全重试和幂等。
- [x] Provider 增量内容直接写入 SSE，不先构造完整事件列表。
- [x] 支持超时、取消、断流、限流、错误事件和 assistant 失败状态持久化。
- [x] 引用结果包含可追踪 Source / chunk 信息。

完成条件：首包、增量、取消、重试、断流和引用测试通过。

执行记录：2026-08-17；实现 `AiStreamingService` 回调式 sink、`AiStreamAbortException`、Provider `streamInto`、OpenAI-compatible SSE `data:`/`[DONE]` 解析和 Flyway V12 client request id 唯一键。R1-04 定向 AI 流式/Provider/Controller 测试 16/16、全量后端 `mvn -B -ntp test` 121 通过且 1 个 opt-in PostgreSQL 测试跳过。证据使用 Stub/受控 HTTP，不等价于真实 Provider 网络或前端联调通过。

### R1-05 并发、版本和分页（P0）

主要范围：Conversation、Message、核心列表 API、同步服务。

- [x] Conversation 删除实际校验 `baseVersion`。
- [x] Message sequence 在并发写入时不重复。
- [x] 所有接收 cursor 的列表接口返回稳定的 `nextCursor` 和 `hasMore`。
- [x] Sync 保留期清理拥有自动任务、指标和过期 cursor reset 行为。
- [x] 增加竞争写入、重复请求、分页边界和清理后恢复测试。

完成条件：并发与分页测试稳定通过，没有依赖 `max + 1` 的竞争窗口。

执行记录：2026-08-17；新增 Flyway V13 会话版本/消息序号计数器、写锁保护的消息追加、五类核心列表 keyset cursor（默认 limit 100、最大 200）、Sync 定时保留清理与 Micrometer 指标。R1-05 定向套件 16/16、全量 `mvn -B -ntp clean test` 126 通过、0 失败/错误、1 个 opt-in PostgreSQL 测试跳过；覆盖会话版本冲突、并发消息序号、五类分页、过期 cursor reset、高水位延续和清理指标。

### R1-06 后端工具链和运行配置（P1）

- [x] 修复 Windows `mvnw.cmd` 对非符号链接 Maven 仓库路径的处理。
- [x] 生产 profile 显式关闭不需要的 Swagger / OpenAPI UI。
- [x] 显式关闭 `spring.jpa.open-in-view`，修复因此暴露的懒加载问题。
- [x] 固定 Flyway 支持的 H2 版本，配置 Mockito Agent，消除升级警告。

完成条件：系统 Maven 和 Wrapper 均能在干净 Windows 环境运行全量测试。

执行记录：2026-08-17；修复 `mvnw.cmd` 普通 Maven 仓库路径的空 `Target` 判定；全局关闭 `spring.jpa.open-in-view`；prod profile 关闭 springdoc API docs/Swagger UI；H2 固定为 2.2.224；Surefire 使用 Mockito 5.23.0 Java agent，并在默认配置中启用 PostgreSQL/MinIO Testcontainers。配置定向测试 6/6、系统 Maven `mvn -B -ntp clean test` 和 Wrapper `.\mvnw.cmd -B -ntp clean test` 均退出码 0；两次均为 135 通过、0 失败、0 错误、0 跳过。当前证据不等价于真实 Provider 或 GUI 验收。

### G1 阶段门禁

- [x] R1-01 至 R1-05 全部完成；R1-06 无影响契约冻结的未关闭问题。
- [x] 在 `Auralis-Server` 执行 `mvn -B -ntp clean test`，退出码为 0，失败、错误、跳过均为 0。
- [x] API 和数据变化已同步 `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/modules/Backend.md`。

执行记录：2026-08-17；默认 Surefire 自动设置 `auralis.postgres.it=true` 和 `auralis.minio.it=true`，普通系统 Maven 与 Wrapper 全量测试均为 135/0/0；G1 通过。Docker 不可用时默认测试会失败，不再静默跳过真实依赖测试；真实 Provider、lease fencing、性能和前端业务验收仍由后续任务跟踪。

---

## R2：真实依赖测试环境

### R2-01 更新 Compose 和环境变量（P0）

主要文件：`docker-compose.yml`、`.env.example`。

- [x] 移除新后端不使用的 Redis、Milvus 和 etcd 主依赖。
- [x] 使用 PostgreSQL 17 + pgvector、MinIO 和新 Auralis Server。
- [x] 增加健康检查、固定镜像版本、非默认凭据示例和持久卷说明。
- [x] 补齐 JWT、AI 加密密钥、MinIO、CORS、Provider、超时和上传限制变量。

完成条件：`docker compose config` 退出码为 0，配置不包含生产默认密码。

执行记录：2026-08-17；Compose 已切换到 `pgvector/pgvector:0.8.6-pg17-bookworm`、固定 MinIO/mc 镜像、`minio-init` bucket 初始化、PostgreSQL/MinIO/backend healthcheck、命名持久卷和 secret fail-fast；`docker compose --env-file .env.example config --quiet` 退出码 0，未发现 Redis/Milvus/etcd 服务或旧默认密码。真实 Compose 启动时修复了 `minio-init` 单字符串命令解析问题，并将 `.env.example` 的 AI 加密示例固定为 32 字节；db、MinIO、bucket init、backend readiness 均已验证通过。

### R2-02 创建后端镜像（P0）

主要文件：`Auralis-Server/Dockerfile`、`.dockerignore`。

- [x] 使用 Java 21 多阶段构建。
- [x] 运行阶段使用非 root 用户。
- [x] 暴露健康检查需要的端口和 Actuator 路径。
- [x] 固定基础镜像版本，并保证镜像不包含源码、测试缓存和本地密钥。

完成条件：`docker compose build backend` 成功，镜像可启动且健康检查通过。

执行记录：2026-08-17；已新增 Java 21 多阶段 `Auralis-Server/Dockerfile`、固定 Temurin 21.0.8_9 基础镜像、非 root UID/GID 10001、Actuator readiness healthcheck 和 `.dockerignore`；`docker compose --env-file .env.example build backend frontend` 成功，backend 容器 readiness 返回 `{"status":"UP"}` 且 Compose health 为 healthy。

### R2-03 PostgreSQL / pgvector 集成测试（P0）

- [x] 为 PostgreSQL 增加 Testcontainers 或等效独立集成测试 profile。
- [x] 验证 Flyway V1-V9 干净库迁移、JPA validate、vector 扩展和 HNSW 索引。
- [ ] 验证并发 cursor、乐观锁、唯一约束、时间类型和查询计划。
- [x] 增加升级迁移输入，禁止只验证空库。

完成条件：`mvn -B -ntp -Ppostgres-it verify` 退出码为 0。

执行记录：2026-08-17；已引入 Testcontainers 2.0.5 和固定 pgvector PostgreSQL 17 镜像；`PgVectorIntegrationTests` 改为容器动态 datasource，新增 `PgVectorMigrationIntegrationTests` 从 V8 历史输入升级并校验 V9 vector/HNSW/V11 回填。Docker Desktop 恢复后，`mvn -B -ntp -Ppostgres-it verify` 退出码 0，测试结果 135 通过、0 失败/错误、1 个非 PostgreSQL opt-in 测试跳过；真实 PostgreSQL 17.11 + pgvector 两个集成类均通过。并发 cursor、乐观锁、约束/时间类型和查询计划仍需专项 PostgreSQL 覆盖。

### R2-04 MinIO 与资源链路（P0）

- [x] 验证预签名 PUT、HEAD、完成、GET 和删除流程。
- [ ] 覆盖对象不存在、大小不符、hash 不符、超时和重复完成。
- [x] 建立数据库孤儿记录与 MinIO 孤儿对象的核对方法。

完成条件：真实 MinIO 集成测试通过，异常路径不会产生不可恢复状态。

执行记录：2026-08-17；已新增 `MinioAssetStorageIntegrationTests`（presigned PUT、HEAD、MIME/size/hash、GET/open、幂等删除）以及 `scripts/audit-minio-assets.ps1` 孤儿核对方法。真实 MinIO profile 测试退出码 0，1/1 通过；为兼容 MinIO 对已发送 header 的 SigV4 校验，PUT intent 使用包含 host、Content-Type、Content-Length 和 sha256 metadata 的签名请求。对象异常路径专项仍未完成。

### R2-05 Provider 测试矩阵（P0）

- [ ] 使用可控 HTTP stub 覆盖成功、增量、429、5xx、超时、断流和错误 JSON。
- [ ] 使用至少一个受控真实 Provider 完成 chat 和 embedding smoke。
- [ ] 记录真实测试所需密钥和网络条件，不将密钥写入仓库。

完成条件：stub 自动测试通过，真实 Provider smoke 有日期、模型和脱敏日志。

执行记录：2026-08-17；新增 `AiProviderResilienceTests`，2/2 通过，覆盖 429、5xx、客户端错误、错误 JSON 和错误 SSE 事件；真实 Provider chat/embedding smoke 尚未执行，需显式 key、模型和网络条件。

### G2 阶段门禁

- [x] `docker compose config`、镜像构建和健康检查通过。
- [x] PostgreSQL / pgvector、MinIO 和 Provider stub 集成测试通过。
- [x] H2 仍可用于快速单元测试，但不再作为唯一数据库证据。

---

## R3：OpenAPI 和客户端类型

### R3-01 固定 OpenAPI（P0）

- [x] 将服务生成的 OpenAPI 固定到 `docs/contracts/openapi/auralis-openapi.json`。
- [x] 校对鉴权、错误模型、分页、同步、WebSocket ticket、SSE 和上传接口，并在 API 契约中记录当前未验收边界。
- [x] 在 CI 中比较生成结果，未同步的契约变化直接失败。
- [x] 更新 `docs/contracts/API.md` 中仍标为 planned 的已实现接口。

完成条件：OpenAPI 产物与 Controller / DTO 一致，契约 diff 门禁可重复执行。

执行记录：2026-08-17；`OpenApiArtifactTests` 在 test profile 通过导出 `/v3/api-docs` 并在默认模式比较冻结 artifact，均为 3/3；新增 `scripts/export-openapi.ps1`、`scripts/generate-openapi-sdk.ps1`、`scripts/check-openapi.ps1` 和 `.github/workflows/openapi-contract.yml`。鉴权、Problem Details、cursor 分页、Sync、Realtime ticket、SSE 和 Asset 上传边界已回写 `docs/contracts/API.md`；真实 PostgreSQL/MinIO、浏览器 WebSocket、Provider 和人工联调仍未完成。

### R3-02 生成 PC 与 Mobile TypeScript SDK（P0）

- [x] 从同一 OpenAPI 产物生成类型和请求客户端组成的轻量 TypeScript SDK。
- [x] PC 生成代码放入 `Auralis-PC/src/api/generated/`。
- [x] Mobile 生成代码放入 `Auralis-Mobile/src/api/generated/`。
- [x] 两端使用同一 OpenAPI 产物和同一生成器版本。
- [x] 增加固定的生成、校验和禁止手改说明。

完成条件：重新生成没有未解释差异，两端类型检查能够引用新 DTO。

执行记录：2026-08-17；PC/Mobile 均从同一 artifact 使用 `openapi-typescript@7.13.0` 生成 `src/api/generated/schema.ts`，两端加入 typed `client.ts` 与禁止手改 README；`scripts/check-openapi.ps1` 的固定版本重生成字节比对通过。将 Mobile TypeScript 固定为 5.3.3 以匹配现有 `vue-tsc@1.8.27` 后，`npm run type-check`、H5 `npm run build:h5` 和 PC `npm run build` 均通过；该证据仍不等于前后端联调。

### R3-03 冻结兼容策略（P0）

- [x] 明确 API 版本、最低客户端版本和兼容窗口。
- [x] 明确旧 `/ws/sync`、旧 DTO 和旧字段的移除时间。
- [x] 明确 cursor 过期、版本冲突和强制升级的客户端行为。

完成条件：`docs/contracts/API.md`、`Database.md` 和客户端模块文档描述一致。

执行记录：2026-08-17；API、Database、FrontendPC、FrontendMobileTablet 已同步 `/api` 版本边界、最低客户端基线、旧 `/ws/sync`/旧 DTO 退出策略、cursor 过期、版本冲突和未来强制升级行为。该策略只冻结兼容规则，不表示 R4 页面迁移或前后端联调已完成。

### G3 阶段门禁

- [x] G1、G2 已通过。
- [x] OpenAPI、两端生成类型和契约 diff 门禁通过。
- [x] 契约冻结后才能开始大规模客户端迁移。

执行记录：2026-08-17；G1 的默认容器测试与 G2 的 Compose/真实 PostgreSQL/pgvector、MinIO 主链路和 Provider stub 门禁均已通过；R3 OpenAPI artifact 运行时对比、PC/Mobile 固定版本生成比对、PC build、Mobile type-check/H5 build 均通过。G3 仅表示契约已冻结并满足 R4 大规模迁移的前置条件，不表示真实 Provider chat/embedding smoke、MinIO/PostgreSQL 异常专项或 R4 前后端业务联调已完成。

---

## R4：客户端迁移

### R4-01 PC 鉴权、环境和实时协议（P0）

主要范围：`Auralis-PC/src/router/`、`src/api/`、`src/stores/`、`src-tauri/`。

- [ ] 恢复鉴权路由守卫，覆盖登录、刷新、过期和退出。
- [ ] 删除生产代码中的固定 `127.0.0.1` 地址，使用环境配置。
- [ ] 将 `/ws/sync` 迁移到 `/ws/events` + realtime ticket。
- [ ] 覆盖重连、游标续传、票据过期和重复事件。

完成条件：未登录不可进入受保护页面，PC 能连接新 REST 和 WebSocket 协议。

### R4-02 PC 数据与页面主流程（P0）

- [ ] 使用生成 DTO 迁移 Subject、Source、Asset、KnowledgeBlock、Task、Review、Stats 和 AI。
- [ ] 本地数据库按 `userId` 隔离并迁移 version / deletedAt / baseVersion 语义。
- [ ] 学科工作区接入真实上传、资源关联、摘要和 AI 上下文。
- [ ] 增加路由、Store、API 和主流程自动测试。

完成条件：PC 主流程不依赖旧 DTO、旧同步路径或本地假数据。

### R4-03 PC Tauri（P1）

- [ ] 验证本地 SQL、文件权限、窗口和网络权限。
- [ ] 验证安装、升级、卸载和本地数据保留策略。
- [ ] 执行 `npm.cmd run tauri -- build` 并保留制品信息。

完成条件：Windows 实机可安装、启动、登录和完成主流程。

### R4-04 Mobile 工具链（P0）

- [x] 通过将 Mobile TypeScript 固定为 5.3.3，解决 `vue-tsc 1.8.27` 与 TypeScript 5.9.3 的版本漂移。
- [ ] 解决 Pinia / Vue peer 版本不一致。
- [ ] 将三个 Tablet 逻辑脚本纳入统一 `npm test` 或 `test:tablet` 命令。
- [ ] 保留 H5 和微信构建，消除阻断性类型错误。

完成条件：`npm.cmd run type-check`、H5 构建、微信构建和 Tablet 测试全部通过。

### R4-05 Mobile / 微信 API 与实时迁移（P0）

主要范围：`Auralis-Mobile/src/api/`、`src/store/`、页面和配置。

- [ ] 移除 localhost / 127.0.0.1 固定地址。
- [ ] 迁移注册登录、资料、任务、同步、复习、统计和 AI 接口。
- [ ] 将 `/ws/sync` 迁移到 `/ws/events` + realtime ticket。
- [ ] 本地数据按 `userId` 隔离并支持冲突和 reset。

完成条件：H5 和微信主路径只使用新契约。

### R4-06 微信平台配置（P1）

- [ ] 配置 AppID、HTTPS 请求域名、WSS 域名和上传下载域名。
- [ ] 在微信开发者工具中检查授权、网络、分包和包体。
- [ ] 在至少一台真机完成登录、上传、同步和 AI 流程。

完成条件：开发者工具和真机无域名或权限阻断。

### R4-07 Tablet 主工作区（P1）

- [ ] 接入新 Subject、Asset、Task、Review、Stats 和 AI 契约。
- [ ] 验证横屏侧栏、触控、键盘、缩放和前后台切换。
- [ ] 手写能力继续受 feature flag 控制，不纳入云同步。

完成条件：Tablet 主工作区在目标设备完成主流程；隐藏手写不阻塞 G4。

### G4 阶段门禁

- [ ] PC、H5、微信和 Tablet 目标页面均使用新 API。
- [ ] 仓库主路径不再出现生产硬编码 localhost 和旧 `/ws/sync`。
- [ ] PC 构建、Tauri 构建、Mobile 类型检查、H5 和微信构建全部通过。
- [ ] API、数据库和客户端模块文档已同步。

---

## R5：跨端和人工验收

### R5-01 身份与账号隔离（P0）

- [ ] 验证注册、登录、refresh rotation、退出、会话撤销和过期。
- [ ] 验证两个用户之间 API、同步、资源、向量和 AI 数据完全隔离。
- [ ] 验证同一设备切换账号不会读取前一账号本地数据。

完成条件：自动安全测试和 PC / Mobile 人工账号切换均通过。

### R5-02 资源、摄取与 RAG（P0）

- [ ] 从 PC 和 Mobile 分别上传文本型文件并完成 MinIO 存储。
- [ ] 验证摄取状态、失败重试、原子重建、向量检索和引用。
- [ ] 删除 Source 后验证检索结果和引用及时失效。

完成条件：上传 → 摄取 → 检索 → 引用 → 删除完整链路通过。

### R5-03 双设备同步与实时（P0）

- [ ] 使用两个独立客户端验证首次同步和实时事件。
- [ ] 覆盖断网编辑、重复提交、版本冲突、重连、游标过期和完整 reset。
- [ ] 覆盖任务、知识块、关系和墓碑在两端的一致性。

完成条件：双设备脚本全部通过，服务端日志能追踪 cursor 和 mutation ID。

### R5-04 复习与统计（P1）

- [ ] 验证 Review due、评分、SKIP、幂等重放和状态恢复。
- [ ] 验证 Task 进入 / 离开 DONE 后统计日期正确。
- [ ] 验证 PC、Mobile 和 Tablet 展示相同服务端结果。

完成条件：复习历史、当前状态和统计结果跨端一致。

### R5-05 AI 质量和异常（P1）

- [ ] 验证有资料、无资料、冲突资料和跨用户资料场景。
- [ ] 验证超时、429、5xx、断流、取消和无效 key。
- [ ] 检查引用可追踪，日志不泄露提示词中的敏感数据和 Provider key。
- [ ] 记录请求延迟、首包时间、token / 成本和失败率基线。

完成条件：质量样例和异常矩阵达到产品确认的最低标准。

### R5-06 GUI 与真机矩阵（P1）

- [ ] PC：亮色 / 暗色、窄栏、拖拽、弹窗、错误态和 AI 流式动效。
- [ ] Tauri：安装、权限、文件、本地 SQL、升级和异常恢复。
- [ ] H5：主流浏览器、弱网、输入法、前后台切换。
- [ ] 微信：开发者工具和真机授权、上传、WSS、分包。
- [ ] Tablet：横屏、触控、键盘、缩放和长时间使用。

完成条件：每个平台有日期、版本、设备、结果和截图或录屏证据。

### G5 阶段门禁

- [ ] R5-01 至 R5-03 全部完成。
- [ ] R5-04 至 R5-06 完成，或有经过记录的不影响部署测试的 P1 例外。
- [ ] 没有未关闭的安全、数据丢失、用户隔离或恢复类 P0。

---

## R6：部署测试前准备

### R6-01 CI 门禁（P0）

主要文件：`.github/workflows/ci.yml` 或仓库最终选择的 CI 配置。

- [ ] 后端单元测试和 PostgreSQL / MinIO / Provider 集成测试进入 CI。
- [ ] PC 检查、构建和 Tauri 构建进入 CI。
- [ ] Mobile 类型检查、H5、微信和 Tablet 测试进入 CI。
- [ ] OpenAPI 漂移、文档链接、镜像构建和 secret scan 进入 CI。

完成条件：候选提交的完整 CI 全绿，任何 P0 测试不能标记为允许失败。

### R6-02 安全和供应链（P1）

- [ ] 固定镜像和关键依赖版本。
- [ ] 生成 SBOM，执行依赖、镜像和密钥扫描。
- [ ] 检查 CORS、HTTPS / WSS、JWT、AI 密钥、MinIO 凭据和调试端点。
- [ ] 建立用户级速率限制、上传限制和 AI 用量限制。

完成条件：高危问题为 0，中危问题有明确处置记录。

### R6-03 日志、指标和告警（P1）

- [ ] 统一 request ID、user / device 脱敏标识和错误码日志。
- [ ] 暴露健康、延迟、错误率、摄取队列、同步积压、AI 用量和存储指标。
- [ ] 为服务不可用、错误率、队列积压和存储容量配置告警规则。

完成条件：测试环境能触发并恢复至少一次关键告警。

### R6-04 备份恢复准备（P1）

- [ ] 编写 PostgreSQL 和 MinIO 一致性备份步骤。
- [ ] 编写恢复、校验、失败中止和密钥恢复步骤。
- [ ] 明确 RPO、RTO、备份保留、加密和负责人角色。

完成条件：恢复步骤已在隔离测试数据上演练；正式部署测试只复用已验证步骤。

### R6-05 候选制品（P0）

- [ ] 生成后端镜像及 digest。
- [ ] 生成 PC Web、Tauri、H5 和微信小程序候选产物。
- [ ] 保存 OpenAPI、生成 SDK、Flyway 迁移清单、SBOM 和校验值。
- [ ] 所有制品来自同一候选提交，不允许本地手改产物。

完成条件：制品清单可追溯到唯一 Git 提交和 CI 运行。

### R6-06 文档收口（P1）

- [ ] 更新 `docs/project/Overview.md` 和 `docs/project/Architecture.md`，删除旧后端栈事实。
- [ ] 更新 `docs/operations/Deployment.md` 和 `docs/operations/Runbook.md`。
- [ ] 更新 API、Database、PC、Mobile / Tablet、Backend、Infrastructure 模块文档。
- [ ] 更新用户手册、当前状态、问题清单和 Changelog。
- [ ] 清理 `planning/BackendCore.md`、`AIRag.md`、`InfraRelease.md` 中失效任务。

完成条件：现行文档不再把 Redis / Milvus / 旧接口写成新后端当前事实。

### R6-07 非阻断优化（P2）

- [ ] 拆分 PC 超过预算的约 595 kB chunk。
- [ ] 消除 Mobile Sass legacy 和混合静态 / 动态导入警告。
- [ ] 记录未进入当前候选版本的平台和功能。

完成条件：可在不影响 G6 的情况下关闭，或明确排入部署测试后的优化清单。

### G6 最终门禁：允许开始部署测试

- [ ] G0-G5 全部通过。
- [ ] R6-01、R6-05 完成；R6-02 至 R6-04、R6-06 无阻断项。
- [ ] 最新候选提交 CI 全绿。
- [ ] P0 为 0；保留的 P1 均有影响、补偿措施和负责人角色。
- [ ] 候选镜像、前端制品、OpenAPI、SDK、迁移、SBOM 和校验值齐备。
- [ ] 部署测试所需环境变量、域名、证书、密钥引用和测试账号清单齐备。
- [ ] 备份恢复步骤、监控告警规则、故障中止条件和回滚输入齐备。
- [ ] `docs/current/Status.md` 明确记录“允许开始部署测试”，但不得提前写成“部署测试通过”。

只有以上项目全部满足，才可以开始实际部署测试。

## 常用验证命令

### 后端

```powershell
cd Auralis-Server
mvn -B -ntp clean test
mvn -B -ntp -Ppostgres-it verify
```

### 容器

```powershell
docker compose config
docker compose build backend
docker compose up -d
docker compose ps
```

### PC

```powershell
cd Auralis-PC
npm.cmd run check:subject-icons
npm.cmd run check:subject-workspace
npm.cmd run build
npm.cmd run tauri -- build
```

### Mobile / 微信 / Tablet

```powershell
cd Auralis-Mobile
npm.cmd run type-check
npm.cmd run test:tablet
npm.cmd run build:h5
npm.cmd run build:mp-weixin
```

说明：`postgres-it` 和 `test:tablet` 是本清单要求建立的固定命令；在对应任务完成前不存在或失败属于预期未完成状态。

## 执行记录格式

每次勾选任务时，在任务下方补充：

```text
日期：YYYY-MM-DD
提交：Git commit
命令：实际执行命令
结果：退出码、测试数量和关键输出
人工证据：设备、版本、截图或录屏路径
剩余限制：该证据不能证明的内容
```
