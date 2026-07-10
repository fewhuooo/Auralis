> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# Spring Boot 后端模块说明

更新时间：2026-07-02

## 模块定位

`Auralis-Server` 是系统后端中枢，负责账号鉴权、业务数据、同步、资产管理、AI 编排、对象存储、向量检索和 WebSocket 推送。

## 技术栈

- Spring Boot 3.2.5
- Java 21
- MyBatis Plus
- PostgreSQL
- Redis
- WebSocket
- JWT
- BCrypt
- LangChain4j
- Milvus
- MinIO
- Apache Tika
- Caffeine

## 主要包结构

```text
com.auralis.server/
├── common/       # Result、JWT、鉴权、用户上下文
├── config/       # 数据库、Redis、MinIO、LangChain4j、WebSocket 配置
├── controller/   # REST API 控制器
├── dto/          # 同步 DTO
├── entity/       # 数据实体
├── mapper/       # MyBatis Mapper
├── service/      # 业务服务和 AI 服务
└── websocket/    # WebSocket 处理
```

## 控制器模块

| 控制器 | 职责 | 状态 |
| --- | --- | --- |
| `AuthController` | 注册、登录、刷新 token | 已构建待验收 |
| `KnowledgeBlockController` | 知识块直接 CRUD | 已构建待验收 |
| `TaskBlockController` | 任务块直接 CRUD | 已构建待验收 |
| `SyncController` | 增量 push/pull 同步 | 已构建待验收 |
| `AssetController` | 资产绑定和状态查询 | 已构建待验收 |
| `FileStorageController` | MinIO 预签名上传 URL | 已构建待验收 |
| `AiController` | AI 聊天、摄入、提取、转换、排期建议 | 已构建待验收 |
| `StatsController` | 概览和周统计 | 已构建待验收 |
| `BlockRelationController` | 块关系 | 已构建待验收 |

## 安全基线

- 新用户密码使用 BCrypt 存储。
- 旧明文密码在成功登录后迁移为 BCrypt。
- 普通受保护 API 拒绝 refresh token。
- 客户端不能通过请求头覆盖 AI API Key 或 Base URL。
- CORS 从通配改为配置化白名单。
- 资产查询和绑定做当前用户校验。

## 配置基线

主配置 `application.yml` 使用：

- `langchain4j.open-ai.chat-model.*`
- `langchain4j.open-ai.embedding-model.*`
- `langchain4j.milvus.*`

当前风险：

- `application-prod.yml` 中仍出现 `spring.ai.openai.*` 配置口径，需要和 LangChain4j 配置统一。
- 生产环境不能保留默认数据库密码、默认 MinIO 密钥或 mock AI key。
- Docker Compose 运行时应通过 `.env` 注入敏感配置。

## 同步基线

- 客户端通过 `/api/sync/push` 推送 mutation。
- 客户端通过 `/api/sync/pull` 拉取增量或冷启动数据。
- MutationLog 删除路径已改为软删除。
- 直接 `DELETE /api/blocks/{id}` 和 `DELETE /api/tasks/{id}` 仍需和同步语义统一。

## 构建与验收

```powershell
cd Auralis-Server
mvn test
```

当前状态：`mvn test` 通过，但测试源码为空，不能替代业务验收。

## 待补测试

- 注册、登录、刷新 token、refresh token 误用。
- 跨用户访问资产、知识块、任务。
- 资产绑定 objectName 用户前缀校验。
- MutationLog create/update/delete 行为。
- Sync cold start 和 incremental pull。
- AI 接口错误处理和超时。
- WebSocket 握手鉴权、心跳续期、token 过期断连。
- 生产配置加载与必填环境变量校验。
