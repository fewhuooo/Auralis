# Spring Boot 后端模块

更新时间：2026-07-10

文档状态：现行

权威范围：`Auralis-Server` 的当前技术栈、包结构、Controller、鉴权、同步、存储、AI、WebSocket、配置与测试边界

事实来源：`Auralis-Server/pom.xml`、Java 源码与 `application*.yml`

## 模块定位

Server 是账号、业务数据、同步、资产、AI/RAG 和长连接的信任边界。客户端页面可隐藏功能，但不能替代 Server 的鉴权、用户隔离和数据校验。

## 技术栈

- Spring Boot `3.2.5`
- Java `21`
- MyBatis Plus `3.5.5`
- PostgreSQL、Redis、WebSocket
- JJWT `0.11.5`、BCrypt
- LangChain4j、Milvus、Apache Tika
- MinIO Java SDK `8.5.7`
- Caffeine、虚拟线程

## 包结构

```text
com.auralis.server/
├── common/       # Result、JWT、Interceptor、用户上下文
├── config/       # DB、Redis、MinIO、AI、Milvus、WebSocket
├── controller/   # REST 接口
├── dto/          # 请求与同步 DTO
├── entity/       # PostgreSQL 实体
├── mapper/       # MyBatis Mapper
├── service/      # 业务、同步、AI 和存储编排
└── websocket/    # 握手、消息、连接审计
```

## Controller 清单

| Controller | 基础路径 | 职责 |
| --- | --- | --- |
| `AuthController` | `/api/auth` | 登录、注册、刷新 |
| `KnowledgeBlockController` | `/api/blocks` | 知识块 CRUD |
| `TaskBlockController` | `/api/tasks` | 任务块 CRUD |
| `BlockRelationController` | `/api/relations` | 块关系 |
| `SyncController` | `/api/sync` | pull/push |
| `FileStorageController` | `/api/fs` | MinIO 预签名 URL |
| `AssetController` | `/api/assets` | 资产绑定与查询 |
| `AiController` | `/api/ai` | 聊天、摄入、抽取和建议 |
| `StatsController` | `/api/stats` | 概览与周统计 |

端点、参数和响应以 [API 契约](../contracts/API.md) 为准。

## 鉴权与用户隔离

- `WebConfig` 对 `/api/**` 注册 `AuthInterceptor`，排除 `/api/auth/**`。
- `AuthInterceptor` 读取 `Authorization: Bearer`，验证 token 且拒绝 refresh token。
- `AuthController.refresh` 只接受有效 refresh token。
- 密码使用 BCrypt；旧明文密码可在成功登录后迁移。
- Service/Controller 必须从当前用户上下文取得 userId，不能信任客户端覆盖。

需要自动测试：refresh token 误用、跨用户块/任务/资产访问、token 过期与错误响应。

## 数据与迁移

- `DbMigrationConfig` 在启动时执行建表和 `ALTER TABLE ... IF NOT EXISTS`。
- `db/migration/V2__add_encrypted_payload.sql` 也维护加密字段。
- 当前同时存在程序化迁移和独立 SQL，但没有完整 Flyway/Liquibase 版本链。
- `task_block.position` 在 DDL 中存在，在 `TaskBlock.java` 中不存在。

字段与风险见 [数据库契约](../contracts/Database.md)。

## 同步

- `GET /api/sync/pull?afterId=0` 返回当前用户未删除知识块和任务块的冷启动数据。
- `afterId>0` 返回 cursor 后 mutation。
- `POST /api/sync/push` 接受 mutation 列表并写入实体和日志。
- MutationLog 删除路径使用软删除。
- 直接知识块/任务 DELETE 与同步删除语义仍需统一测试。

## 资产与文件

- FileStorage 按当前用户生成 objectName 前缀和预签名 URL。
- Asset bind 校验 objectName 是否属于当前用户。
- Asset query 校验资产归属。
- 当前仍需校验 MinIO 对象真实存在、真实大小与 content-type。

## AI / RAG

- LangChain4j 提供聊天模型、嵌入模型和 Milvus store。
- AiController 支持普通聊天、SSE、文本/文件摄入、任务抽取、手写转换和排期建议。
- 文件解析使用 Apache Tika，摄入结果可生成块和向量。
- 客户端不得覆盖服务端 API key 或 base URL。
- AI 超时、错误、非 JSON 结果和外部服务不可用仍需测试。

## WebSocket

- 路径：`/ws/sync`。
- `WebSocketAuthInterceptor` 从 query 参数读取 token 并在握手验证。
- PING 可携带 token，合法时更新 session 并返回 PONG。
- `SyncWebSocketHandler` 每 60 秒审计连接 token，失效或缺失时关闭。
- 用于同步事件和解析状态通知。

这是代码确认，不是自动测试通过。当前 `src/test` 下没有测试源码。

## 配置

| 文件 | 现状 |
| --- | --- |
| `application.yml` | 公共 profile、上传限制、LangChain4j/Milvus |
| `application-dev.yml` | 本地 DB、Redis、MinIO、开发 AI 配置 |
| `application-prod.yml` | 生产 DB 环境变量，但 AI 使用 `spring.ai.openai` 旧键 |

生产必须注入 JWT、数据库、Redis、MinIO 和 AI 凭据，不得使用开发默认密码。

## 构建与验证

```powershell
cd Auralis-Server
mvn test
mvn spring-boot:run
```

`mvn test` 成功时仍必须同时记录测试源码数量。当前源码数量为 0，因此只能证明 Maven 生命周期没有失败。

## 待补测试

- Auth 登录、注册、刷新、token 类型和密码迁移。
- 跨用户 KnowledgeBlock、TaskBlock、Asset、Sync。
- CRUD 与 mutation 的 create/update/delete。
- 冷启动与增量 pull。
- MinIO 对象存在、大小、类型和归属。
- AI 超时、错误与解析。
- WebSocket 握手、PING、过期审计和断连。
- 生产 profile 必填环境变量和配置键。

## 强制回写

Controller、DTO 或错误语义变化更新 API；Entity、DDL 或 Mapper 更新数据库；配置和服务边界更新本文件；状态、风险和发布同步更新 `current/` 与 Changelog。
