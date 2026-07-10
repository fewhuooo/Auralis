> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# 部署指南

更新时间：2026-07-02

## 部署目标

当前仓库支持本地 Docker Compose 部署基础设施、后端和 PC Web 前端。生产部署方案仍需补充安全配置、CI/CD、监控和备份策略。

## 环境划分

| 环境 | 用途 | 说明 |
| --- | --- | --- |
| dev | 本地开发 | 使用 `.env`、本地 Docker Compose |
| test | 测试环境 | 建议独立数据库和对象存储 |
| prod | 生产环境 | 必须替换所有默认密码和密钥 |

## 环境变量

当前 `.env.example` 已包含：

```env
DEEPSEEK_API_KEY=your-deepseek-api-key-here
SILICONFLOW_API_KEY=your-siliconflow-api-key-here
```

建议补充：

```env
JWT_SECRET=replace-with-strong-secret
AURALIS_CORS_ALLOWED_ORIGINS=http://localhost:5173
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=auralis
DB_USERNAME=postgres
DB_PASSWORD=password
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=auralis-assets
MILVUS_HOST=127.0.0.1
MILVUS_PORT=19530
```

生产环境必须另外确认：

- `JWT_SECRET` 不为空且足够强。
- `DB_PASSWORD`、`MINIO_SECRET_KEY`、pgAdmin 密码不使用示例值。
- AI Key 不使用 `demo`、`mock-key` 或本地测试值。
- CORS 白名单只包含真实前端域名。
- `application-prod.yml` 与 `application.yml` 的 LangChain4j 配置键保持一致。

## 本地 Docker 启动

启动全部服务：

```powershell
docker compose up -d
```

启动基础设施：

```powershell
docker compose up -d db redis etcd minio milvus pgadmin
```

查看服务：

```powershell
docker compose ps
```

停止服务：

```powershell
docker compose down
```

## 后端打包与启动

```powershell
cd Auralis-Server
mvn clean package
java -jar target/auralis-server-0.0.1-SNAPSHOT.jar
```

Docker 构建：

```powershell
docker compose build backend
docker compose up -d backend
```

## PC 前端打包与部署

```powershell
cd Auralis-PC
npm install
npm.cmd run build
```

Docker 构建：

```powershell
docker compose build frontend
docker compose up -d frontend
```

## Mobile H5 打包

```powershell
cd Auralis-Mobile
npm install
npm.cmd run build:h5
```

构建产物部署目标需要根据实际 H5 托管平台确认。

## CI/CD 建议流程

仓库当前未发现现成 CI/CD 配置。建议流程：

1. 拉取代码。
2. 安装前端依赖。
3. 运行 PC 构建。
4. 运行 Mobile H5 构建。
5. 运行后端 `mvn test`。
6. 构建 Docker 镜像。
7. 推送镜像到镜像仓库。
8. 目标环境拉取镜像并滚动重启。

最小质量门禁：

- 后端：`mvn test`
- PC：`npm.cmd run build`
- Mobile H5：`npm.cmd run build:h5`
- 文档：确认 `docs/README.md` 索引覆盖新增文档。
- 发布前：确认 `CurrentIssuesAndReview.md` 没有未处理 P1 发布阻断项。

## 生产部署注意事项

- 禁止使用默认数据库密码。
- 禁止使用默认 MinIO 密钥。
- CORS 必须配置为真实域名白名单。
- JWT secret 必须使用高强度密钥。
- `data/` 目录必须纳入备份策略。
- Milvus、MinIO、PostgreSQL 建议独立磁盘或托管服务。
- 不要把 Docker Compose 中的默认密码、`.env` 实际密钥或生产日志提交到仓库。
- PC 前端登录守卫恢复前，不应发布到真实用户环境。
