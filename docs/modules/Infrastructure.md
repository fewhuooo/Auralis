# 基础设施与数据服务模块

更新时间：2026-11-15

文档状态：现行模块说明

权威范围：服务拓扑、持久化、有效配置分组、构建入口及运维边界

事实来源：根 `docker-compose.yml`、`docker-compose.overview-trace.yml`、`.env.example`、Server/PC Dockerfile 与应用配置

## 阅读入口

本页描述仓库配置，不声明容器此刻运行正常。部署步骤见[部署指南](../operations/Deployment.md)，排障和恢复见 [Runbook](../operations/Runbook.md)，最近实际验证和未关闭风险由 [Status](../current/Status.md) / [IssuesAndReview](../current/IssuesAndReview.md) 维护。

逐轮配置试验、镜像与测试记录保存在[整理前记录](../archive/maintenance-2026-11-13/Infrastructure.md)，仅供追溯。新增配置更新下方主题，不追加日期流水。

## Compose 服务与持久化

| 服务 | 仓库配置 | 默认宿主端口 | 职责 |
| --- | --- | --- | --- |
| `db` | `pgvector/pgvector:0.8.6-pg17-bookworm` | 5432 | PostgreSQL 17 与 1024 维向量检索 |
| `minio` | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | 9000 / 9001 | 私有对象存储 / 管理控制台 |
| `minio-init` | `minio/mc:RELEASE.2025-08-13T08-35-41Z` | 无 | 等待 MinIO 健康后创建 bucket |
| `backend` | `Auralis-Server/Dockerfile` | 8080 | Spring Boot API、SSE 与实时通知 |
| `frontend` | `Auralis-PC/Dockerfile` | 80 | PC Web 静态入口与代理 |

端口可由 `.env.example` 中相应变量覆盖。基础 Compose 没有 Redis、Milvus、etcd 或 OCR 服务；容器网络为 `auralis-network`。

- PostgreSQL 使用命名卷 `auralis-postgres-data`，容器路径 `/var/lib/postgresql/data`。
- MinIO 使用命名卷 `auralis-minio-data`，容器路径 `/data`。
- 命名卷属于业务持久化，不能把删除卷当作普通环境修复。
- `.env` 为本机配置，不提交真实密码、token、key。备份恢复必须同时考虑数据库、对象、配置及解密所需密钥。

`backend` 等待 db 健康及 minio-init 成功，`frontend` 等待 backend 健康。db 使用 `pg_isready`；MinIO 健康检查执行临时对象写入、读取、比对和删除；backend 检查 `/actuator/health/readiness`。健康检查不证明真实客户端或业务质量验收通过。

## 配置入口与有效分组

变量名称和默认值以 `.env.example`、Compose 及 `application.yml` 为准；本页保留用途，不复制完整配置表。

| 分组 | 主要入口 | 注意事项 |
| --- | --- | --- |
| 数据库 | `AURALIS_DB_*` / 容器 `SPRING_DATASOURCE_*` | Compose 注入数据库地址和账号；禁止生产占位 secret |
| 对象存储 | `AURALIS_MINIO_*`、`AURALIS_UPLOAD_*` | 内部 endpoint 与浏览器可达 public endpoint 分开；检查 CORS、签名 TTL、大小与保留期 |
| 身份与加密 | `AURALIS_JWT_SECRET`、`AURALIS_AI_ENCRYPTION_KEY` | 生产关键配置缺失时拒绝启动，密钥变更须单独规划 |
| 验证码邮件 | `AURALIS_MAIL_*` | 根 `.env` 由 Compose 传给后端，默认要求 STARTTLS。见 [SMTP 配置](../operations/Deployment.md#2026-11-15-验证码邮件配置) |
| 地址与跨域 | `AURALIS_PUBLIC_BASE_URL`、`AURALIS_CORS_ALLOWED_ORIGINS` | 明确实际客户端来源与公网暴露边界 |
| 平台生成 | `AURALIS_AI_GENERATION_BASE_URL/MODEL/API_KEY` | 一组完整 OpenAI-compatible 配置；账号 BYOK 按当前选择规则生效 |
| 平台向量 | `AURALIS_AI_EMBEDDING_BASE_URL/MODEL/API_KEY` | 入库和检索共用平台配置，模型须返回 1024 维；换模型要核对已有向量空间 |
| AI 启用与摄入 | `AURALIS_AI_ENABLED`、`AURALIS_AI_INGESTION_WORKER_ENABLED` | 配置存在不等于供应商、存储与 worker 已联通 |
| Provider 网络 | `AURALIS_AI_ALLOWED_PROVIDER_HOSTS`、连接/响应超时与响应大小 | 不能为连通性绕过网络访问限制 |
| 思考模式 | 通用 `AURALIS_AI_THINKING_ENABLED`、Chat/Overview 专项开关 | 请求行为取决于适配器及端点支持，不能证明任意代理内部推理关闭 |
| 持久额度 | `AURALIS_AI_LIMITS_*` | 并发、小时/日额度、任务用量和预留租约独立约束 |

### Overview 容量与期限

平台 Overview 需要 `AURALIS_AI_GENERATION_CONTEXT_TOKENS` 和 `AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS`；两项未提供有效能力时在派发前报 MODEL_UNAVAILABLE。BYOK 使用服务端 `overview-model-capacities` 中精确匹配的 Provider、端点和模型能力，配置方法见部署指南。

`AURALIS_AI_OVERVIEW_MAX_*` 现行限制覆盖请求字符/字节、输入/输出 Token、响应/正式结果、输入快照、来源清单、作业请求、来源数和标题。0 表示不施加该项额外上限，模型容量和任务额度仍有效。单次输入过大可触发当前分批路径，不保证任何规模都能完成。

`AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS` 控制 Provider 响应窗口，`AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS` 控制直接请求整任务期限。`AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS=0` 只关闭该次数帽；Token、并发和其他期限仍有效。前端 `VITE_OVERVIEW_SSE_DEADLINE_MS` 为构建参数，修改须重建前端。

当前生成采用 Markdown 清理、大纲和总结，旧 adaptive 开关、Writer/checkpoint 容量、旧输入估算模式和自动重试配置已退役；不可从历史记录复制回运行配置。当前有效键应同时在应用配置、Compose 和示例中核对。

### Chat 限额

`AURALIS_AI_CHAT_AGENT_MAX_ITERATIONS` 默认及上限 12，`AURALIS_AI_CHAT_AGENT_MAX_TOOL_CALLS` 默认及上限 20。独立 model/embedding 调用帽默认 0，表示该帽不设限；负数拒绝。工具结果、序列化请求大小和 attempt deadline 有独立边界。最后一轮无新工具收尾仍受 Token、并发和期限约束。

### 本机诊断导出

基础 Compose 不启用 Overview 正文追踪。显式使用 `docker-compose.overview-trace.yml` 时打开 trace/capture 并将宿主 `AURALIS_OVERVIEW_TRACE_HOST_DIR`（默认 `D:/Temp/auralis-overview-traces`）挂载到 `/app/overview-traces`；overlay 还将 Overview 调用次数帽设为 0，不能忽略此配置影响。

Chat raw-content capture 默认关闭，由 `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_ENABLED` 与目录配置控制。正文诊断可能包含用户资料，不属于普通脱敏日志；账号和 Source 删除不级联清除本机导出。按 Runbook 在目标复现后关闭、检查和清理，不能打印包含密钥的完整 Compose 渲染结果。

## 构建与开发入口

Server Dockerfile 使用 Java 21 多阶段构建，运行阶段使用 UID/GID 10001 非 root 用户，安装 curl 用于 readiness 检查。生产 profile 关闭 OpenAPI/Swagger UI，公共配置关闭 JPA Open-in-View。

PC Web Docker 构建与 Tauri 桌面打包是不同产物。PC 本地依赖按 `package-lock.json` 安装；缺少 `.bin` 命令入口时按 Runbook 判断包是否存在，不删除锁文件或安装全局 Tauri 绕过本地依赖。

在仓库根目录可做不启动服务的示例配置检查：

```powershell
docker compose --env-file .env.example config --quiet
```

在已配置且获准启动的开发环境，依赖启动入口为：

```powershell
docker compose --env-file .env up -d db minio minio-init
docker compose ps
```

完整构建、部署、更新容器与健康核对遵循部署指南；不能未经允许重启已有开发服务或应用进程。本轮整理没有执行这些命令。

## PC OCR 打包边界

OCR 在 Tauri 客户端运行，由 Rust supervisor 管理 target-triple `auralis-ocr` sidecar。模型、`model_manifest.json`、第三方 notices 和 SBOM 随桌面包交付，不作为 Compose 服务运行。

PC `scripts/verify-ocr-bundle.mjs` 检查包、sidecar、模型哈希和许可证材料；`scripts/measure-ocr-baseline.ps1` 用于基线测量。安装、升级、卸载、真实 File Viewer、OCR 和资源占用仍按具体设备验收，历史 MSI 自动验证不能代替本机安装验收。

## 自动检查与生产待办

仓库已有 `.github/workflows/openapi-contract.yml`：Java 21、Node 24 下运行 `scripts/check-openapi.ps1`，检查运行时 OpenAPI 与生成 SDK 漂移。它不等于完整构建、业务测试、镜像扫描、部署和回滚流水线。

| 边界 | 后续验收要求 |
| --- | --- |
| PostgreSQL / MinIO | 区分基础连通、真实集成测试、异常并发和长期运行；不能由 healthcheck 推断全覆盖 |
| 对象一致性 | 用 `scripts/audit-minio-assets.ps1` 对账，保存结果；不要直接清除疑似孤儿用户对象 |
| 备份恢复 | 形成可重复恢复演练与 RPO/RTO 证据，覆盖数据、对象和密钥 |
| 发布流水线 | 在已有契约检查之外验证构建、测试、扫描、部署和回滚 |
| 监控告警 | 验证核心服务指标、日志与实际告警送达，不仅检查配置存在 |
| 公网与直传 | 核对端口暴露、CORS、预签名 URL 外部可达性及 TLS |

本轮只核对仓库源码和配置，未访问真实 `.env`、容器、供应商或业务数据库。具体风险的当前关闭状态以问题登记与后续实测为准。

## 回写规则

服务、端口、卷、环境变量或生产拓扑变化更新本页、部署指南、Runbook；验证状态与风险更新 current，发布变化更新 Changelog。版本与默认值以 owning 配置文件为准，部署证据不要继续累积在模块说明中。
