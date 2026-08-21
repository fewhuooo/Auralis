# 基础设施与数据服务模块

更新时间：2026-08-17

文档状态：现行

权威范围：当前 Compose 服务、容器、端口、持久化目录、环境变量、生产边界与基础设施风险

事实来源：`docker-compose.yml`、`.env.example`、`.gitignore` 与 Server 配置

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
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

## 环境变量

`.env.example` 当前列出数据库、JWT、CORS、MinIO、上传限制、AI 超时/Provider allowlist 和可选 Provider smoke key。所有 `replace-*` 值在启动前必须替换，真实 `.env` 不得提交。

后端当前绑定以下对象存储配置：

- `AURALIS_UPLOAD_STORAGE_PROVIDER`：`unavailable`（默认）或 `minio`；test profile 使用内存适配器。
- `AURALIS_MINIO_ENDPOINT`、`AURALIS_MINIO_BUCKET`、`AURALIS_MINIO_ACCESS_KEY`、`AURALIS_MINIO_SECRET_KEY`
- `AURALIS_MINIO_PRESIGN_TTL_SECONDS`

Compose 将 `AURALIS_DB_*` 映射到 Spring datasource，将 `AURALIS_MINIO_*` 映射到 `auralis.upload.storage`，并以 `AURALIS_JWT_SECRET`、`AURALIS_AI_ENCRYPTION_KEY` 和 `AURALIS_CORS_ALLOWED_ORIGINS` 作为生产必填项。Provider 的用户 BYOK 仍由应用加密保存；服务端 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY` 只作为运行时默认凭据注入后端，不写入数据库或 API。

阶段 5 AI/RAG 配置由 `Auralis-Server` 绑定：

- `AURALIS_AI_ENABLED`：默认 `false`。
- `AURALIS_AI_ENCRYPTION_KEY`：生产必填，支持 16/24/32 字节原始值或对应 Base64；local/test profile 使用非生产占位值。
- `AURALIS_AI_DEFAULT_PROVIDER`：默认 `DEEPSEEK`。
- `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY`：可选的服务端默认 Provider key；缺少时仍可由用户 BYOK 覆盖。
- `AURALIS_AI_*_BASE_URL`、`AURALIS_AI_*_CHAT_MODEL`、`AURALIS_AI_*_EMBEDDING_MODEL`：各默认 Provider 的运行时端点和模型覆盖。
- `AURALIS_AI_REQUEST_TIMEOUT_MILLIS`、`AURALIS_AI_MAX_PROMPT_CHARS`、`AURALIS_AI_MAX_RETRIEVED_CHUNKS`、`AURALIS_AI_INGESTION_MAX_BYTES`。
- `AURALIS_AI_URL_CONNECT_TIMEOUT_MILLIS`、`AURALIS_AI_URL_READ_TIMEOUT_MILLIS`、`AURALIS_AI_URL_MAX_REDIRECTS`：Source URL 获取的连接、读取、重定向和大小边界。

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
