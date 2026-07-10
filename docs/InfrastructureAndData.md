# 基础设施与数据层说明

更新时间：2026-07-02

## 基础设施来源

当前本地基础设施由仓库根目录 `docker-compose.yml` 编排。

## 服务清单

| 服务 | 容器名 | 镜像 | 端口 | 用途 |
| --- | --- | --- | --- | --- |
| PostgreSQL | `auralis-db` | `postgres:15-alpine` | `5432` | 元数据和业务数据 |
| Redis | `auralis-redis` | `redis:7-alpine` | `6379` | 缓存、同步、Stream 队列 |
| pgAdmin | `auralis-pgadmin` | `dpage/pgadmin4` | `5050` | 数据库管理 |
| etcd | `auralis-milvus-etcd` | `quay.io/coreos/etcd:v3.5.5` | 内部 | Milvus 依赖 |
| MinIO | `auralis-milvus-minio` | `minio/minio` | `9000`, `9001` | 对象存储 |
| Milvus | `auralis-milvus` | `milvusdb/milvus:v2.4.0` | `19530`, `9091` | 向量数据库 |
| backend | `auralis-backend` | 本地构建 | `8080` | Spring Boot 服务 |
| frontend | `auralis-frontend` | 本地构建 | `80` | PC Web 前端 |

## 数据目录

| 路径 | 内容 |
| --- | --- |
| `data/postgres` | PostgreSQL 数据 |
| `data/redis` | Redis 数据 |
| `data/milvus/etcd` | etcd 数据 |
| `data/milvus/minio` | MinIO 数据 |
| `data/milvus/milvus` | Milvus 数据 |

## 本地端口

- Backend: `8080`
- PC dev server: `5173`
- PostgreSQL: `5432`
- Redis: `6379`
- pgAdmin: `5050`
- MinIO API: `9000`
- MinIO Console: `9001`
- Milvus: `19530`
- Milvus Health: `9091`

## 环境变量

当前 `.env.example` 主要包含：

- `DEEPSEEK_API_KEY`
- `SILICONFLOW_API_KEY`

建议后续补充：

- `JWT_SECRET`
- `AURALIS_CORS_ALLOWED_ORIGINS`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`
- `REDIS_HOST`
- `REDIS_PORT`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `MILVUS_HOST`
- `MILVUS_PORT`

## 生产配置要求

- 所有密码、密钥、Token secret 必须通过环境变量或密钥管理注入。
- Docker Compose 中的默认 `postgres/password`、`admin/admin`、`minioadmin/minioadmin` 只能用于本地开发。
- `application-prod.yml` 需要统一使用 LangChain4j 配置口径，避免和主配置分裂。
- MinIO 建议为用户资产和 Milvus 内部对象使用不同 bucket 或独立实例。
- `data/` 目录需要纳入备份策略，但不要提交到 Git。

## 当前风险

- Docker Compose 中存在默认密码，不能直接用于生产。
- `data/` 目录属于本地持久化数据，备份和清理要谨慎。
- MinIO 复用 Milvus 栈，生产环境建议拆分权限和 bucket。
- CI/CD、监控、告警和日志采集尚未进入仓库。
- 没有看到正式备份脚本、恢复演练记录或监控告警配置。
