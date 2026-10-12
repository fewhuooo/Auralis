# 基础设施与数据服务模块

### 2026-10-12 学科总览分批修复本机更新（构建与运行核对通过）

- 香港 13:57:23 仅 backend 更新为 `a5a50bb7…`，Docker build / recreate 实际退出码 0，healthy / readiness HTTP 200；旧 `31f7dec…` 保留回滚 tag。
- 构建前后 474 份 Server / Docker 输入 hash 零漂移，替换前有效 TASK lease / RESERVED / 活动 ingestion 为 0。db / MinIO 容器和卷保持，Flyway V31，无新增配置、迁移或拓扑。
- 运行额度个人 1000000 / 小时、2000000 / 日，系统日 2000000、并发个人 2 / 全局 4，prompt 默认 12000、Overview 期限 240000ms，真实 `.env` hash 保持。部署 Service / Guard class 与预期精确一致；真实 Provider / GUI 待验收，见 [部署记录](../plans/2026-10-12-subject-overview-prompt-batching.md)。

### 2026-10-12 单人测试额度（配置、Compose 与本机运行态验证通过）

- `application.yml`、Compose backend 的环境变量 fallback 与 `.env.example` 同步为单人 1000000 token / 小时、2000000 / 日；系统每日 2000000、全局 / 用户并发 4 / 2 和其他任务 / 请求边界保持。
- 本机真实 `.env` 未设置这两个额度键，没有旧值覆盖；无需修改真实 `.env`。Compose 显式 environment 优先于应用默认值，修改后需重建并更新 backend 才能在运行态采用新策略。
- embedding 排除额度由服务端 stage 聚合实现，不通过无限额或并发关闭实现。没有新配置键、迁移、服务或部署拓扑，实际验证和部署证据见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。
- 配置隔离 6/6，示例 Compose quiet 退出码 0，解析仅输出 allowlist，值与上述设置一致；真实 `.env` hash 保持。实际容器更新与 GUI / Provider 验收单独记录。
- 本机 backend 香港 12:57:12 更新，镜像 `31f7dec…` healthy / readiness 200；运行白名单个人 1000000 / 2000000、系统日 2000000、并发 4 / 2 与配置一致。更新前活动任务自然释放，db / MinIO 容器、镜像和卷未变，Flyway 仍 V31，无新迁移；旧镜像保留回滚 tag。完整命令和运行 JAR 字节码核对见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)，不代表 GUI 或 Provider 业务验收。

### 2026-10-11 Overview 用量故障运行态检查（只读诊断；未改调度配置）

- `aiUsageHeartbeatExecutor`、`overviewDeadlineScheduler`、`overviewHeartbeatScheduler` 被对应调用显式使用，不依赖默认 `@Scheduled` 路由。Spring 面对多个 ScheduledExecutorService 且没有名为 `taskScheduler` 的 bean 时会警告；隔离 Spring 7 诊断仍观察到 scheduled tick，警告不能单独证明任务停止。
- 用量租约通过 beginTask/reserve/snapshotForUser 惰性回收，没有依赖默认 scheduler 的独立用量清理任务。现场两次短只读账本快照没有 reservation 占用；26ms 故障由最终 MAP 6144 与网关 4608 预算冲突引起。未关闭限制、清空记录、修改 bean 或部署。证据及运行态边界见 [诊断与修复](../plans/2026-10-11-overview-usage-limit-diagnosis.md)。

### 2026-10-11 Overview 期限与 SSE 资源边界（代码与相关自动验证通过；未部署）

- 本轮沿用 Overview 240 秒总期限和 PC 300 秒外层期限，新增进程内准入 24、SSE 上限 8、生成 executor 4/8/16，独立单线程期限/心跳 scheduler（取消计时任务即时移出队列），writer 为 8 线程、8 队列；SSE/准入名额保留到实际 worker 退出及排队/执行中的写入全部清理，拒绝提交亦释放其占用。预检、排队和等待者计入入口绝对期限；服务繁忙沿现行 503。没有新环境变量、依赖、迁移、容器或部署拓扑。
- `Auralis-PC/nginx.conf` 的 `/api/` 已有 `proxy_buffering off` 与 `proxy_cache off`；SSE 响应补充 `Cache-Control: no-cache` 和 `X-Accel-Buffering: no`。当前未更换运行容器，实际代理及时转发、真实客户端断连和 Provider 另行验收；发布顺序先服务端兼容支持、再 PC，见 [部署](../operations/Deployment.md) 与 [运行手册](../operations/Runbook.md)。
- 实际源码/验证状态及 JSON 断连限制见 [实施计划](../plans/2026-10-11-overview-hard-timeout-cancellation.md)。
- Overview DNS 等待单独使用固定 4 个 daemon 线程与队列 8，取消的排队任务即时移除、容量不足返回服务繁忙；不修改其他 Provider 解析配置。原生 DNS 可能持续占用固定 slot 至 OS 返回，本地调用可先取消而不发出迟到 HTTP 请求。socket 关闭也无法中止 JDBC 或数据库锁等待，入口计时不代表该数据库故障下的 HTTP 墙钟保证。

### 2026-10-08 PC Docker 依赖下载中断（隔离镜像重试通过；运行容器未切换）

- 用户 Buildx 记录 `37i8gaymoqh4tmohdcvjdqkuy` 在 `Auralis-PC/Dockerfile:8` 的 `npm install` 因 `ECONNRESET` / `network aborted` 退出 1。
- 在仓库根目录执行 `docker buildx build --progress plain --file Auralis-PC/Dockerfile Auralis-PC`，2026-10-08 08:52:29–08:55:51（香港时间），退出 0；安装 435 个包，前端编译与 47/47 renderer 资产复制完成，镜像导出成功。
- 输出已进入本地 image store，manifest list ID 为 `sha256:9b850ace4ed9868e7784902ab1a15963c491eeb608c6ff64527ff3aa306693c9`，是无仓库标签的验证镜像。没有执行容器启动或替换；backend/frontend/db/minio 仍运行原容器，数据卷未操作。此结果只证明前端镜像可构建，不证明后端新接口已加载或真实业务已验收。
- Dockerfile、package.json、package-lock.json 和 .dockerignore 保持本轮开始时 hash；未修改依赖、锁文件、网络/代理配置。现有 Node engine 警告及锁文件根依赖映射漂移另在 Issues 登记，未作为本次失败原因或顺手修改。
- 原失败、成功构建、metadata、镜像与容器证据位于 `C:/Users/Gnasche/AppData/Local/Temp/auralis-frontend-docker-install-20261008/evidence/`。Docker 当前可用不代表已重新验证此前 Maven 容器测试错误。

2026-09-24 紧邻任务交换部署：仅重建并重启本机 Compose `backend`，最终容器 `72be6c8240a8…`、镜像 `sha256:bf8e7bb72f0c…`，health/readiness HTTP 200 且 status UP。启动日志验证 PostgreSQL 17.11、23 项 Flyway migration，schema 仍为 23；db/minio 容器 ID 与镜像 ID 均未变，未重建卷。GUI 拖放和认证业务请求尚未验收。

2026-09-24：Timeline 主体放置修复后仅重建并重启本机 Compose `backend`，容器 `ee3d733c00c8…`、镜像 `sha256:80d303401599…`，health/readiness 均为 UP。Flyway 从 22 升至 23，`flyway_schema_history` 中 V23 `success=true`；db/minio 容器 ID 未变化、均 healthy，未重建卷。认证业务请求与 GUI 拖放未验收。

2026-09-23：排期插入失败源于运行中的 backend 镜像落后于当前 TaskController：日志为 `POST /api/tasks/schedule-insertions` 的 `HttpRequestMethodNotSupportedException`，旧镜像构建时间为 2026-09-20。重建 backend 后容器 healthy，readiness HTTP 200。构建期间发现 Windows Maven wrapper 为 CRLF，Dockerfile 现在在运行 wrapper 前将其转为 LF。该 Compose 使用默认 prod profile，运行时 `/v3/api-docs` 按配置关闭（HTTP 404）；OpenAPI artifact 包含该接口。恢复时只重建 backend；db/minio 仅启动已有容器，其命名数据卷未重建；backend 无数据卷。

更新时间：2026-10-11

文档状态：现行

权威范围：当前 Compose 服务、容器、端口、持久化目录、环境变量、生产边界与基础设施风险

事实来源：`docker-compose.yml`、`.env.example`、`.gitignore` 与 Server 配置

2026-09-08：PC ParsedDocument 上传失败时，Tauri 只在本机 stderr 输出 reqwest 分类 flags、顶层摘要和最多三层 `Error::source()` cause；最终 `flags + summary + causes` 总体限制在 256 字节，并不输出预签名 URL、query/signature、Authorization、header value 或本机路径。加密 cache 的上传长度/哈希契约由解密 reader payload 定义，`encryptedBytes` 只表示本地 envelope 文件大小；历史 receipt 在恢复边界按 owner scope 重新计算。该日志和长度修复不能替代 MinIO 真实 PUT 验收。

2026-09-09 Task 16 运行验证：`docker compose --env-file .env config --quiet` 通过；仅重建/recreate `backend` 后容器 healthy，backend liveness/readiness 均 HTTP 200，`AURALIS_AI_INGESTION_WORKER_ENABLED=true`。启动日志显示 PostgreSQL 17.11、21 个 Flyway migration 已验证且 schema up to date。定时 Sync retention 首次调度报 `TransactionRequiredException`（`deleteByCreatedAtBefore` 缺少实际事务），不影响健康检查但属于待修复运行期风险。PostgreSQL 只读摘要见 `.superpowers/sdd/task-16-report.md`；未修改 PostgreSQL/MinIO 数据或 volume。

2026-09-09 schema-v1 final review closure：PC Rust 生成单个 gzip JSON schema-v1 envelope，Java validator/complete 与共享 fixture 对齐；本地 receipt/cache 额外保存 `parsed-document-v1`、Asset SHA 和 parser metadata，但未引入 Server migration 或 OpenAPI 变化。scheduler focused 27/27、PC full R4 250/250、type-check 和 diff-check 通过，所有 Critical/Important reviewer findings 已关闭；真实重启 Tauri 后经 MinIO PUT/complete/indexing 到 `READY` 的 `1.pdf` GUI 验收仍未执行。

2026-09-07：MinIO healthcheck 已从仅检查 `mc ready` 改为在配置 bucket 的 `.healthcheck/` 前缀使用随机键执行 PUT、HEAD、GET、DELETE，并在退出时清理测试对象；该检查只验证对象存储能力，不删除或覆盖业务对象。MinIO 仍使用 `auralis_auralis-minio-data:/data` 持久化 volume。

## 模块定位

仓库根目录 `docker-compose.yml` 提供本地开发和组合部署基础。敏感凭据通过 `.env` 注入；`.env.example` 只含替换占位符，不得直接作为生产 secret。

## 服务清单

| 服务 | 容器 | 镜像/来源 | 主机端口 | 用途 |
| --- | --- | --- | --- | --- |
| `db` | `auralis-db` | `pgvector/pgvector:0.8.6-pg17-bookworm` | `5432` | PostgreSQL 17 业务库与 pgvector |
| `minio` | `auralis-minio` | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `9000`,`9001` | 用户对象存储 |
| `minio-init` | `auralis-minio-init` | `minio/mc:RELEASE.2025-08-13T08-35-41Z` | 内部 | 创建并确认用户资产 bucket |
| `backend` | `auralis-backend` | 本地构建 | `8080` | Spring Boot |
| `frontend` | `auralis-frontend` | 本地构建 | `80` | PC Web |

## 持久化目录

| 路径 | 内容 | 处理要求 |
| --- | --- | --- |
| Docker volume `auralis-postgres-data` | PostgreSQL 数据 | 备份后再清理 |
| Docker volume `auralis-minio-data` | 用户资产对象 | 与 PostgreSQL 资产元数据协调备份 |

`data/` 不应提交到 Git。任何递归删除前必须确认绝对路径位于仓库 `data/` 内并已有可用备份。

## 本地连接

| 组件 | 地址 |
| --- | --- |
| Backend | `http://localhost:8080` |
| PC Vite | `http://localhost:5173`（默认） |
| PostgreSQL | `localhost:5432` |
| MinIO API | `http://127.0.0.1:9000` |
| MinIO Console | `http://localhost:9001` |

## 环境变量

`.env.example` 当前列出数据库、JWT、CORS、MinIO、上传限制、软删除资产保留/清理调度、AI 超时/Provider allowlist 和可选 Provider smoke key。开发机若通过 `localhost` 或 `127.0.0.1` 打开 PC Web，CORS 白名单需同时包含对应 origin；所有 `replace-*` 值在启动前必须替换，真实 `.env` 不得提交。

后端当前绑定以下对象存储配置：

- `AURALIS_UPLOAD_STORAGE_PROVIDER`：`unavailable`（默认）或 `minio`；test profile 使用内存适配器。
- `AURALIS_UPLOAD_ASSET_RETENTION_DAYS`、`AURALIS_UPLOAD_ASSET_CLEANUP_DELAY_MILLIS`、`AURALIS_UPLOAD_ASSET_CLEANUP_INITIAL_DELAY_MILLIS`：软删除 Source 的 MinIO 对象保留天数、扫描间隔和首次延迟；默认分别为 30 天、1 小时和 60 秒。清理只删除对象并将 Asset 标记为 `ORPHANED`，不硬删除数据库审计行。
- `AURALIS_MINIO_ENDPOINT`、`AURALIS_MINIO_PUBLIC_ENDPOINT`、`AURALIS_MINIO_BUCKET`、`AURALIS_MINIO_ACCESS_KEY`、`AURALIS_MINIO_SECRET_KEY`
- `AURALIS_MINIO_PRESIGN_TTL_SECONDS`

Compose 将 `AURALIS_DB_*` 映射到 Spring datasource，将 `AURALIS_MINIO_*` 映射到 `auralis.upload.storage`，并以 `AURALIS_JWT_SECRET`、`AURALIS_AI_ENCRYPTION_KEY` 和 `AURALIS_CORS_ALLOWED_ORIGINS` 作为生产必填项。`AURALIS_MINIO_ENDPOINT` 是容器内 Server 访问 MinIO 的地址；`AURALIS_MINIO_PUBLIC_ENDPOINT` 是 Tauri 客户端访问预签名 PUT/GET 的地址，Docker 本地默认分别为 `http://minio:9000` 与 `http://127.0.0.1:9000`。MinIO 使用同一 CORS 白名单允许客户端直传，不能把容器 hostname 作为客户端公网地址。Provider 的用户 BYOK 仍由应用加密保存；服务端 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY` 只作为运行时默认凭据注入后端，不写入数据库或 API。

阶段 5 AI/RAG 配置由 `Auralis-Server` 绑定：

- `AURALIS_AI_ENABLED`：默认 `false`。
- `AURALIS_AI_ENCRYPTION_KEY`：生产必填，支持 16/24/32 字节原始值或对应 Base64；local/test profile 使用非生产占位值。
- `AURALIS_AI_DEFAULT_PROVIDER`：默认 `DEEPSEEK`。
- `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY`：可选的服务端默认 Provider key；缺少时仍可由用户 BYOK 覆盖。
- `AURALIS_AI_*_BASE_URL`、`AURALIS_AI_*_CHAT_MODEL`、`AURALIS_AI_*_EMBEDDING_MODEL`：各默认 Provider 的运行时端点和模型覆盖。
- `AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS`：Provider 固定地址连接超时，默认 3000ms。
- `AURALIS_AI_REQUEST_TIMEOUT_MILLIS`：普通聊天非流式/流式及 embedding 的 response/read 超时，默认 10000ms；`AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`：Overview map/reduce 非流式 completion response/read 超时，默认 120000ms，配置边界为 60000–120000ms。
- `AURALIS_AI_MAX_PROMPT_CHARS`、`AURALIS_AI_MAX_RETRIEVED_CHUNKS`、`AURALIS_AI_INGESTION_MAX_BYTES`。
- `AURALIS_AI_URL_CONNECT_TIMEOUT_MILLIS`、`AURALIS_AI_URL_READ_TIMEOUT_MILLIS`、`AURALIS_AI_URL_MAX_REDIRECTS`：Source URL 获取的连接、读取、重定向和大小边界。

### 2026-10-10 持久 AI 配额配置（代码与示例配置验证通过；未部署）

`application.yml` 的 `auralis.ai.limits`、`.env.example` 和 Compose backend 已使用同一组变量。以下默认值是开发额度策略，单位为 token，不是金额或产品套餐；所有实例必须连接同一个账本数据库，并使用一致的策略。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `AURALIS_AI_LIMITS_GLOBAL_CONCURRENT` / `AURALIS_AI_LIMITS_PER_USER_CONCURRENT` | 4 / 2 | 系统 / 用户并发 |
| `AURALIS_AI_LIMITS_PER_USER_HOURLY_TOKENS` / `AURALIS_AI_LIMITS_PER_USER_DAILY_TOKENS` | 1000000 / 2000000 | 用户 UTC 小时 / 自然日额度（2026-10-12 测试策略） |
| `AURALIS_AI_LIMITS_GLOBAL_DAILY_TOKENS` | 2000000 | 系统 UTC 自然日额度 |
| `AURALIS_AI_LIMITS_RESERVATION_LEASE_MILLIS` / `AURALIS_AI_LIMITS_HEARTBEAT_MILLIS` | 300000 / 10000 | 持久租约 / 活跃续租间隔 |
| `AURALIS_AI_LIMITS_CHAT_MAX_OUTPUT_TOKENS` / `AURALIS_AI_LIMITS_CHAT_MAX_CALLS` / `AURALIS_AI_LIMITS_CHAT_TASK_TOKENS` | 4096 / 2 / 32000 | Chat 输出 / 调用次数 / 任务累计预算 |
| `AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS` / `AURALIS_AI_LIMITS_OVERVIEW_TASK_TOKENS` | 24 / 524288 | Overview 调用次数 / 任务累计预算 |
| `AURALIS_AI_LIMITS_INGESTION_MAX_CALLS` / `AURALIS_AI_LIMITS_INGESTION_TASK_TOKENS` | 512 / 16777216 | 同 job + generation 的累计预算 |

额度必须为正，用户小时 ≤ 用户每日 ≤ 系统每日；lease 允许 60000–3600000ms，heartbeat 允许 1000–300000ms 且不超过 lease 的三分之一。Overview 原有 4608/6144 输出上限保留。共通的 `AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS=240000`、embedding 每批 32 条 / 32768 UTF-8 文本字节也已透传；任务预算、估算 token 和 UTF-8 字节上限分别校验。

实例需同步 UTC 时钟；租约基于服务端 Clock，任务总 deadline 使用单调时钟。MVC SSE 异步池固定 core 4 / max 8 / queue 16，满载拒绝入队映射为安全 `503 SERVICE_UNAVAILABLE`，不增加自动循环重试。

2026-10-10 仅运行 `docker compose --env-file .env.example config --quiet`，退出 0，证据为 `D:/Temp/auralis-ai-usage-guard-b-20261010/config/compose-config.*`。未读取真实 `.env`、部署容器或变更业务数据。账本、迁移、客户端和并发验证的完成状态见 [B 实施计划](../plans/2026-10-10-ai-usage-guard-b.md)。

## R1-06 后端运行配置和工具链

- 生产 profile 关闭 springdoc API docs 和 Swagger UI；开发 local profile 继续提供 OpenAPI smoke。
- JPA Open-in-View 已在公共配置中显式关闭，避免 Web 层隐式延长事务；当前实体使用 owner/id 查询和服务层 DTO 映射，配置回归与全量测试通过。
- H2 测试依赖固定为 2.2.224，以匹配当前 Flyway 12.x 已验证基线；Surefire 使用 Mockito Java agent。
- Windows Maven Wrapper 已兼容普通 Maven 仓库目录和有效链接目标；本轮 Wrapper `-v`、完整 clean test 退出码均为 0。

## R2 真实依赖基线

- Compose 已移除 Redis、Milvus 和 etcd 主依赖，固定 PostgreSQL/pgvector、MinIO、bucket 初始化和 Server 健康检查；`docker compose --env-file .env.example config --quiet` 已通过，`minio-init` 使用单一 shell 命令保证 bucket 初始化在 Compose 中正确执行。
- Server 使用 Java 21 多阶段 Dockerfile，运行阶段安装健康检查所需 curl 并以 UID/GID 10001 非 root 用户运行；backend/frontend 镜像构建及 Compose healthcheck 已通过。
- PostgreSQL 集成测试使用 Testcontainers 2.0.5 的 `pgvector/pgvector:0.8.6-pg17-bookworm`，并新增 V8 升级输入、V9 vector/HNSW/V11 回填验证；MinIO 集成测试覆盖预签名 PUT、HEAD、GET/open、hash/MIME/size、幂等删除和缺失对象。
- R2 真实依赖测试默认随 `mvn -B -ntp clean test` 执行，`postgres-it`/`minio-it` profiles 作为兼容别名保留；2026-08-17 系统 Maven 与 Wrapper 均为 135/0/0，真实 PostgreSQL 两个集成类、MinIO 1/1 和 Compose db/MinIO/backend/frontend 运行态均通过；并发/异常专项和真实 Provider smoke 仍开放。

## 本地启动

## PC Tauri OCR 构建门禁

PC 端 OCR 运行时不作为 Server/Compose 服务运行。Tauri 配置将 target-triple `auralis-ocr` externalBin、固定模型与 `model_manifest.json` resources、第三方许可证和 CycloneDX SBOM 纳入 MSI；运行时由 Rust supervisor 以固定参数启动，并限制请求路径、超时、并发和重启预算。`scripts/verify-ocr-bundle.mjs` 负责检查 MSI、sidecar、模型哈希、manifest、notices 与 SBOM，`scripts/measure-ocr-baseline.ps1` 负责五组 fixture 的 cold/warm/RSS/包体积基线。

2026-08-24：G1 protocol、G2 sidecar engine、G3 Rust supervisor 与 G4 MSI bundle 自动测试通过；最终 MSI 220,286,976 bytes，verifier 通过 generated WiX 对 sidecar、模型、manifest、license、SBOM 的引用，五组离线 OCR baseline 已固化。G5 fixture matrix 3/3 通过，旧式 PPT 由 Apache POI 生成真实 OLE 文件；实际 File Viewer/Tauri 运行时和安装后 OCR 留给后续验收。临时 all-users 安装因宿主 Error 1925 未完成，安装/升级/卸载留给 R2；用户已授权继续 G5。

```powershell
docker compose --env-file .env up -d db minio minio-init
docker compose ps
docker compose logs backend
```

完整部署和验收见 [部署指南](../operations/Deployment.md)。

## 生产门禁

- `.env` 中所有数据库、MinIO、JWT 和 AI 加密值均为随机 secret，不使用占位符。
- 使用 secret 管理，不把真实 `.env`、token 或 key 提交到 Git。
- 用户资产使用独立 MinIO bucket/凭据；当前不再依赖 Milvus/etcd。
- 为 PostgreSQL、MinIO、配置和密钥建立一致备份恢复流程。
- 配置健康检查、结构化日志、指标、告警和容量监控。
- 固定镜像版本并建立升级、扫描和回滚流程。
- 统一生产 LangChain4j 配置键。
- 限制 CORS、管理端口和公网暴露面。
- 资产直传必须同时验证预签名 URL 的浏览器可达 host 和 MinIO CORS；发现前端无请求日志时优先检查直传阶段，而不是只检查 Server API 日志。

## 当前风险

| 风险 | 影响 | 关闭条件 |
| --- | --- | --- |
| Compose secret 未注入 | 服务应在缺少关键值时拒绝启动 | 复制 `.env.example` 后替换全部 `replace-*`，再通过 config/启动门禁 |
| PostgreSQL/MinIO 异常专项未完成 | 基础迁移、健康检查和对象主链路已有真实证据，但异常/并发边界仍未覆盖 | 补充 PostgreSQL 并发/约束查询计划、MinIO 异常路径和 Compose 长时间运行检查 |
| 对象孤儿可能残留 | DB 失败状态与 MinIO 对象可能暂时不一致 | 使用 `scripts/audit-minio-assets.ps1` 对账并保留结果 |
| 无正式备份脚本/演练 | 故障后恢复不可预测 | 可重复备份、恢复演练和 RPO/RTO 记录 |
| 无 CI/CD | 发布缺少自动门禁 | 建立构建、测试、扫描、部署和回滚流水线 |
| 无监控告警 | 故障发现滞后 | 核心服务指标、日志和告警可用 |

## 强制回写

Compose 服务、端口、volume、环境变量或生产拓扑变化必须更新本文件、部署指南、Runbook、当前风险和 Changelog。
