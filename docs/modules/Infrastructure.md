# 基础设施与数据服务模块

更新时间：2026-08-16

文档状态：现行

权威范围：当前 Compose 服务、容器、端口、持久化目录、环境变量、生产边界与基础设施风险

事实来源：`docker-compose.yml`、`.env.example`、`.gitignore` 与 Server 配置

## 模块定位

仓库根目录 `docker-compose.yml` 提供本地开发和组合部署基础。该文件包含可用于本地的默认凭据，不是无需修改即可上线的生产方案。

## 服务清单

| 服务 | 容器 | 镜像/来源 | 主机端口 | 用途 |
| --- | --- | --- | --- | --- |
| `db` | `auralis-db` | `postgres:15-alpine` | `5432` | 业务与元数据 |
| `redis` | `auralis-redis` | `redis:7-alpine` | `6379` | 缓存、同步和 Stream |
| `pgadmin` | `auralis-pgadmin` | `dpage/pgadmin4` | `5050` | 本地数据库管理 |
| `etcd` | `auralis-milvus-etcd` | `quay.io/coreos/etcd:v3.5.5` | 内部 | Milvus 元数据 |
| `minio` | `auralis-milvus-minio` | `minio/minio:RELEASE.2023-03-20T20-16-18Z` | `9000`,`9001` | 用户对象与 Milvus 依赖 |
| `milvus` | `auralis-milvus` | `milvusdb/milvus:v2.4.0` | `19530`,`9091` | 向量存储与健康检查 |
| `backend` | `auralis-backend` | 本地构建 | `8080` | Spring Boot |
| `frontend` | `auralis-frontend` | 本地构建 | `80` | PC Web |

## 持久化目录

| 路径 | 内容 | 处理要求 |
| --- | --- | --- |
| `data/postgres` | PostgreSQL 数据 | 备份后再清理 |
| `data/redis` | Redis 数据 | 明确可丢弃缓存与不可丢数据边界 |
| `data/milvus/etcd` | Milvus etcd | 与 Milvus 一致备份 |
| `data/milvus/minio` | MinIO 对象 | 包含向量栈及可能用户资产 |
| `data/milvus/milvus` | Milvus 数据 | 与 etcd/MinIO 协调恢复 |

`data/` 不应提交到 Git。任何递归删除前必须确认绝对路径位于仓库 `data/` 内并已有可用备份。

## 本地连接

| 组件 | 地址 |
| --- | --- |
| Backend | `http://localhost:8080` |
| PC Vite | `http://localhost:5173`（默认） |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
| pgAdmin | `http://localhost:5050` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |
| Milvus | `localhost:19530` |
| Milvus health | `localhost:9091` |

## 环境变量

`.env.example` 当前只明确列出：

- `DEEPSEEK_API_KEY`
- `SILICONFLOW_API_KEY`

后端阶段 2B 已新增并绑定以下对象存储配置：

- `AURALIS_UPLOAD_STORAGE_PROVIDER`：`unavailable`（默认）或 `minio`；test profile 使用内存适配器。
- `AURALIS_MINIO_ENDPOINT`、`AURALIS_MINIO_BUCKET`、`AURALIS_MINIO_ACCESS_KEY`、`AURALIS_MINIO_SECRET_KEY`
- `AURALIS_MINIO_PRESIGN_TTL_SECONDS`

生产方案还必须明确并注入：

- `JWT_SECRET`
- `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USERNAME`、`DB_PASSWORD`
- `REDIS_HOST`、`REDIS_PORT` 和必要认证
- `MINIO_ENDPOINT`、`MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY`、`MINIO_BUCKET`（Compose/部署层可映射至上述 `AURALIS_MINIO_*` 配置）
- `MILVUS_HOST`、`MILVUS_PORT`
- CORS 白名单
- AI model、base URL 和 key

`AURALIS_MINIO_*` 已由 `Auralis-Server` 的 `auralis.upload.storage` 绑定；本轮只验证了 H2 与可控测试存储，未启动真实 MinIO，也未完成 presigned PUT/GET、bucket policy 和生产 secret 验收。其余变量仍是生产要求，不表示当前所有变量都已实现绑定。

阶段 5 AI/RAG 配置由 `Auralis-Server` 绑定：

- `AURALIS_AI_ENABLED`：默认 `false`。
- `AURALIS_AI_ENCRYPTION_KEY`：生产必填，支持 16/24/32 字节原始值或对应 Base64；local/test profile 使用非生产占位值。
- `AURALIS_AI_DEFAULT_PROVIDER`：默认 `DEEPSEEK`。
- `AURALIS_AI_REQUEST_TIMEOUT_MILLIS`、`AURALIS_AI_MAX_PROMPT_CHARS`、`AURALIS_AI_MAX_RETRIEVED_CHUNKS`、`AURALIS_AI_INGESTION_MAX_BYTES`。
- `AURALIS_AI_URL_CONNECT_TIMEOUT_MILLIS`、`AURALIS_AI_URL_READ_TIMEOUT_MILLIS`、`AURALIS_AI_URL_MAX_REDIRECTS`：Source URL 获取的连接、读取、重定向和大小边界。

阶段 5 当前代码已提供 Provider/embedding 端口、SSRF 基础校验和 MinIO 可替换存储端口，但根目录现行 `docker-compose.yml` 仍保留替换前的 Redis/Milvus/etcd 拓扑，未被本阶段改写。故不能把 Compose 文件、PostgreSQL/pgvector、真实 MinIO、外部 AI key 或 Provider 连通性写成已验收能力；下一步需单独完成真实基础设施和 secret 注入门禁。

## 本地启动

```powershell
docker compose up -d db redis etcd minio milvus
docker compose ps
docker compose logs backend
```

完整部署和验收见 [部署指南](../operations/Deployment.md)。

## 生产门禁

- 替换 PostgreSQL、pgAdmin、MinIO 等所有默认账号和密码。
- 使用 secret 管理，不把真实 `.env`、token 或 key 提交到 Git。
- 拆分用户资产与 Milvus 内部对象的 bucket、账号权限，必要时拆分实例。
- 为 PostgreSQL、MinIO/Milvus、配置和密钥建立一致备份恢复流程。
- 配置健康检查、结构化日志、指标、告警和容量监控。
- 固定镜像版本并建立升级、扫描和回滚流程。
- 统一生产 LangChain4j 配置键。
- 限制 CORS、管理端口和公网暴露面。

## 当前风险

| 风险 | 影响 | 关闭条件 |
| --- | --- | --- |
| Compose 默认密码 | 未加固部署可被直接访问 | 生产 secret 注入并验证默认值不可用 |
| `.env.example` 不完整 | 部署人员不知道必填配置 | 与配置绑定统一并逐项验证 |
| MinIO 复用 | 用户资产和向量依赖权限混杂 | 独立 bucket/凭据或实例并完成迁移 |
| 后端 MinIO 对象链路未验收 | V3 Asset 代码已支持配置化 MinIO，但真实对象、presigned URL、metadata 和异常路径尚无运行证据 | 启动 Compose MinIO，完成 PUT/GET/HEAD/stat、错误路径和凭据/bucket policy 验证 |
| 无正式备份脚本/演练 | 故障后恢复不可预测 | 可重复备份、恢复演练和 RPO/RTO 记录 |
| 无 CI/CD | 发布缺少自动门禁 | 建立构建、测试、扫描、部署和回滚流水线 |
| 无监控告警 | 故障发现滞后 | 核心服务指标、日志和告警可用 |

## 强制回写

Compose 服务、端口、volume、环境变量或生产拓扑变化必须更新本文件、部署指南、Runbook、当前风险和 Changelog。
