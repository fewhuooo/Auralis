# Auralis 部署指南

更新时间：2026-08-17

文档状态：现行，生产方案待加固

权威范围：本地准备、各应用构建、Compose 部署、配置、冒烟、回滚与发布门禁

事实来源：三个项目的构建清单、Server profiles、`docker-compose.yml` 与基础设施模块文档

## 部署模式

| 模式 | 用途 | 组成 |
| --- | --- | --- |
| 本地开发 | 日常开发与联调 | 本地 Node/Java + Compose 基础设施 |
| PC Web | 浏览器部署 | Vite 静态产物 + Server |
| PC Tauri | 桌面开发/打包 | Web 前端 + Rust/Tauri + Server |
| Mobile H5 | 移动 Web | Uni-app H5 产物 + Server |
| 微信小程序 | 微信运行 | mp-weixin 产物 + Server 公网 HTTPS/WSS |
| Compose 组合 | 本地/受控环境 | PostgreSQL/pgvector、MinIO、Server、PC Web |

当前 Compose 含开发默认凭据，禁止未经加固直接作为公网生产方案。

## 前置条件

- Git 工作树和目标提交已确认。
- Node.js/npm 能安装两个前端 lockfile。
- Java 21 与 Maven 可用。
- Docker Engine 与 Compose 可用；Testcontainers 使用同一 Docker Engine。
- Tauri 需要 Rust、Cargo 和目标系统构建依赖。
- 微信发布需要开发者工具、AppID、合法域名、HTTPS/WSS 和平台审核配置。
- 生产 secret、域名、证书、备份位置和回滚负责人已确定。

## 配置准备

### 开发

1. 复制 `.env.example` 为 `.env`。
2. 替换所有 `replace-*` 值，至少设置数据库密码、MinIO 密码、JWT、AI 加密 key 和 CORS 白名单。
3. 先运行 `docker compose --env-file .env config --quiet`；缺少必填值时应 fail-fast。

### 生产

至少准备：

```text
AURALIS_DB_USER / AURALIS_DB_PASSWORD / AURALIS_DB_NAME
AURALIS_JWT_SECRET / AURALIS_AI_ENCRYPTION_KEY
AURALIS_MINIO_ROOT_USER / AURALIS_MINIO_ROOT_PASSWORD / AURALIS_MINIO_BUCKET
AURALIS_CORS_ALLOWED_ORIGINS
AURALIS_AI_ALLOWED_PROVIDER_HOSTS / AURALIS_AI_*_TIMEOUT_MILLIS
```

实际变量名必须与最终配置绑定一致。Provider 用户密钥仍通过 API 加密存储；`.env` Provider key 只用于显式 smoke，不写入日志。

## 本地基础设施

### 启动核心依赖

```powershell
docker compose --env-file .env up -d db minio minio-init
docker compose ps
```

成功判据：

- PostgreSQL `5432` 可连接。
- MinIO API `9000`、Console `9001` 可访问。
- `minio-init` 成功退出且 `auralis-assets` bucket 存在。

### 查看日志

```powershell
docker compose logs db
docker compose logs minio
docker compose logs minio-init
```

禁止只因容器状态为 Running 就认定服务已就绪。

## Server 构建与运行

```powershell
cd Auralis-Server
mvn test
mvn package
mvn spring-boot:run
```

Windows 环境优先验证 Wrapper：

```powershell
.\mvnw.cmd -B -ntp clean test
```

当前 Wrapper 已覆盖普通 Maven 仓库目录；生产 profile 关闭 springdoc API docs/Swagger UI，local profile 仍可用于 OpenAPI smoke。两者均不替代真实 PostgreSQL、MinIO、Provider 和生产 secret 验收。

成功判据：

- Maven 命令退出码 0。
- Server 监听 `8080`。
- 日志显示 PostgreSQL、MinIO 配置按目标 profile 加载。
- 公开 Auth 端点可响应。
- 受保护端点在无 token 时被拒绝。

普通 `mvn -B -ntp clean test` 同时执行 H2、PostgreSQL/pgvector 和 MinIO Testcontainers；Docker Engine 不可用时应直接失败，不允许静默跳过真实依赖测试。`postgres-it`/`minio-it` profiles 仍可用于兼容旧命令和独立定向执行。

## PC Web

```powershell
cd Auralis-PC
npm install
npm.cmd run build
```

产物由 Vite 生成到项目构建目录。部署静态产物时需要：

- SPA 路由回退到 `index.html`。
- `/api` 反向代理到 Server。
- `/ws` 支持 WebSocket Upgrade。
- HTTPS 页面使用 WSS，避免 mixed content。

冒烟：打开 `/login`、`/`、`/subjects`；检查静态资源、路由刷新、API 和 WebSocket 网络请求。

## PC Tauri

```powershell
cd Auralis-PC
npm run tauri dev
```

发布打包命令必须以 Tauri CLI 当前能力为准。人工检查：窗口、权限、SQL 插件、文件访问、更新策略、安装/卸载、签名和系统兼容性。

Web 构建通过不代表 Tauri 通过。目录改名后若错误明确指向旧 StudyCore 绝对缓存，可在 `Auralis-PC/src-tauri` 执行 `cargo clean`，但不得把它作为通用修复。

## Mobile H5

```powershell
cd Auralis-Mobile
npm install
npm.cmd run build:h5
```

部署要求与 PC Web 类似，同时检查：安全区、触控、输入法、移动网络、刷新路由和 API 地址。`127.0.0.1` 硬编码必须在真机部署前解决。

## 微信小程序

```powershell
cd Auralis-Mobile
npm.cmd run build:mp-weixin
```

命令行成功后仍必须：

1. 用微信开发者工具导入产物。
2. 检查页面清单只包含 launch 与 mobile 页面。
3. 配置合法 HTTPS/WSS 域名。
4. 验证登录、刷新、AI、同步、网络错误和真机安全区。
5. 记录基础库版本、设备和平台审核限制。

## Compose 组合部署

```powershell
docker compose build backend frontend
docker compose --env-file .env up -d
docker compose ps
docker compose logs backend
docker compose logs frontend
```

部署前必须确认：

- 所有默认密码已替换。
- volume 指向持久化且有备份的位置。
- 管理端口不对公网开放。
- CORS 仅允许目标前端域名。
- AI 与存储配置使用 secret 注入。
- MinIO 用户资产使用独立 bucket/凭据；当前 Compose 不启动 Milvus/etcd。

## 冒烟检查

| 领域 | 检查 | 成功判据 |
| --- | --- | --- |
| Auth | 注册/登录/刷新 | token 类型正确，错误凭据被拒绝 |
| 权限 | 无 token、跨用户访问 | 被拒绝，无数据泄漏 |
| 数据 | 块/任务 CRUD | 当前用户可见，删除不复活 |
| 同步 | push/pull/冷启动 | cursor 推进，多端一致 |
| 资产 | 预签名、上传、bind、query | objectName 归属和对象元数据正确 |
| AI | chat/ingest | 成功、超时和失败有明确反馈 |
| WS | 握手、PING、过期 | 无效 token 关闭，合法连接 PONG |
| 前端 | 目标页面 | 无关键白屏、404、资源或路由错误 |

## 发布门禁

- 所有 P1 风险关闭。
- 自动测试覆盖 Auth、隔离、Sync、Asset 和 WebSocket。
- 数据库迁移、备份和回滚演练通过。
- 生产 secret 和默认密码检查通过。
- PC Web、Server、H5、微信命令实际通过。
- Tauri、微信工具、手机和平板目标设备人工验收通过。
- 监控、日志、告警和发布负责人就绪。
- `docs/current/Status.md` 与 Changelog 记录同一提交的真实证据。

## 回滚

1. 停止继续发布和写入扩散。
2. 保存失败版本日志、配置和数据库状态。
3. 应用回退到最近已验收镜像或静态产物。
4. 数据库只按已验证迁移回滚方案处理；禁止盲目反向执行 SQL。
5. 若涉及对象/向量，按同一时间点恢复 PostgreSQL、MinIO、Milvus 和 etcd。
6. 执行冒烟并记录数据丢失窗口。

## 部署记录模板

```text
版本/提交：
环境：
负责人：
配置来源：
备份时间与位置：
构建命令与结果：
部署命令与结果：
冒烟结果：
人工验收设备：
已知风险：
回滚版本：
```
