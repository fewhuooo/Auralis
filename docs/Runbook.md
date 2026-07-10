# 运维与应急手册

更新时间：2026-07-02

## 日志查看

Docker Compose 日志：

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
docker compose logs -f redis
docker compose logs -f minio
docker compose logs -f milvus
```

后端本地启动日志直接输出到控制台。

## 常见问题排查

### 后端启动失败

检查项：

- JDK 是否为 21。
- PostgreSQL 是否启动。
- Redis 是否启动。
- `.env` 中 AI Key 是否存在。
- `application-dev.yml` 数据库地址是否正确。

命令：

```powershell
docker compose ps
cd Auralis-Server
mvn test
```

### 前端请求 401

检查项：

- 登录是否成功。
- Authorization header 是否携带 access token。
- 是否误用 refresh token 调用普通 API。
- token 是否过期。
- PC 前端路由守卫是否仍处于临时关闭状态。

### 未登录也能访问 PC 页面

检查项：

- 查看 `Auralis-PC/src/router/index.ts` 中 `router.beforeEach` 是否直接 `next()`。
- 确认 `useAuthStore` 是否恢复接入。
- 确认登录后 token 是否写入并随请求携带。

处理建议：

- 发布前恢复路由守卫。
- 增加未登录访问受保护路由的手工验收用例。

### 文件上传失败

检查项：

- MinIO 是否启动。
- `MINIO_ENDPOINT` 是否正确。
- 文件大小是否超过限制。
- `/api/fs/presigned-url` 是否返回 objectName。
- `/api/assets/bind` 是否使用当前用户生成的 objectName。

### AI 接口失败

检查项：

- `DEEPSEEK_API_KEY` 是否配置。
- `SILICONFLOW_API_KEY` 是否配置。
- 网络是否能访问模型供应商。
- 模型名称和 base URL 是否匹配。
- `application-prod.yml` 是否仍使用 `spring.ai.openai` 旧口径。

### Milvus 检索异常

检查项：

- etcd、MinIO、Milvus 是否全部 healthy。
- Milvus 端口 `19530` 是否可访问。
- collection 名称和向量维度是否匹配。

## 重启顺序

建议顺序：

1. PostgreSQL
2. Redis
3. etcd
4. MinIO
5. Milvus
6. Backend
7. Frontend

Docker 命令：

```powershell
docker compose restart db redis etcd minio milvus backend frontend
```

## 数据备份建议

PostgreSQL：

```powershell
docker exec auralis-db pg_dump -U postgres auralis > backup-auralis.sql
```

MinIO：

- 备份 `data/milvus/minio`。
- 生产环境建议使用 MinIO 自带复制或对象存储快照。

Milvus：

- 备份 `data/milvus/milvus`、`data/milvus/etcd` 和 MinIO 数据。
- 生产环境建议采用官方备份工具或快照方案。

## 恢复策略

- 恢复前先停止相关容器。
- 恢复 PostgreSQL dump 后再启动后端。
- 恢复 MinIO/Milvus 数据时要保持 etcd、Milvus、MinIO 数据一致。
- 恢复后运行关键接口和前端构建检查。

## 应急原则

- 不直接删除 `data/` 目录。
- 不在生产环境使用 `docker compose down -v`。
- 优先保留现场日志。
- 涉及用户数据时先备份再处理。
- 前端页面重构期间，发现页面缺失时先检查 `pages.json`、路由、导航和 git 状态，不直接恢复旧文件。
